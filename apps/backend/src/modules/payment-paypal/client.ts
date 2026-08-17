// Thin REST client for PayPal Orders v2 + webhook signature verify.
// Uses fetch — no SDK dep — to keep the supply chain small and the signature
// flow direct. PayPal docs: https://developer.paypal.com/docs/api/orders/v2/

export type PayPalMode = "sandbox" | "live"

export type PayPalClientOptions = {
  clientId: string
  clientSecret: string
  mode: PayPalMode
  webhookId?: string
}

export type PayPalAmount = { currency_code: string; value: string }

export type PayPalOrderResponse = {
  id: string
  status: string
  purchase_units?: Array<{
    reference_id?: string
    custom_id?: string
    amount?: PayPalAmount
    payments?: {
      captures?: Array<{ id: string; status: string; amount?: PayPalAmount }>
      refunds?: Array<{ id: string; status: string; amount?: PayPalAmount }>
    }
  }>
}

// PayPal caps purchase_unit.custom_id at 127 chars. Medusa session ids are
// ~30, but slice defensively so a long id degrades instead of 400-ing the order.
export const PAYPAL_CUSTOM_ID_MAX = 127

// Webhook correlation (BIL-2482). PayPal's capture/refund resources do NOT echo
// purchase_unit.reference_id — only `custom_id` / `invoice_id` survive into the
// event. We set custom_id at order creation, so that is the primary key back to
// the Medusa payment session. `invoice_id` is read as a fallback for orders that
// were created before this was wired up (we never write it — PayPal enforces
// per-merchant uniqueness on it).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sessionIdFromResource(resource: Record<string, any> | undefined): string {
  const custom = resource?.custom_id
  if (typeof custom === "string" && custom) return custom
  const invoice = resource?.invoice_id
  if (typeof invoice === "string" && invoice) return invoice
  return ""
}

// Last-resort correlation hop: capture/refund resources carry the originating
// PayPal order id under supplementary_data.related_ids.order_id. With it we can
// re-fetch the order and read custom_id off the purchase unit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function payPalOrderIdFromResource(resource: Record<string, any> | undefined): string {
  const id = resource?.supplementary_data?.related_ids?.order_id
  return typeof id === "string" ? id : ""
}

export function customIdFromOrder(order: PayPalOrderResponse | undefined): string {
  for (const unit of order?.purchase_units ?? []) {
    if (unit.custom_id) return unit.custom_id
  }
  return ""
}

export type PayPalCaptureResponse = PayPalOrderResponse

// Capture decision (BIL-2482). Our orders use intent=CAPTURE, so PayPal holds no
// authorization for us — an APPROVED order is one POST away from the money
// moving, and an approval nobody captures just expires. These two helpers live
// here rather than in service.ts so they can be unit-tested: service.ts imports
// @medusajs/framework, which cannot load outside a booted container.
export function needsCapture(order: PayPalOrderResponse | undefined): boolean {
  return order?.status === "APPROVED"
}

export type CaptureErrorKind = "already_captured" | "requires_action" | "fatal"

// How to react when POST /capture fails:
//  - already_captured: a retry/webhook/second tab won the race. Re-read, no error.
//  - requires_action:  the funding source was declined; the buyer must pick
//                      another one, so the session needs more, it did not fail.
//  - fatal:            anything else. Let it throw so cart completion fails and
//                      no order is placed — failing without an order is much
//                      better than an order nobody paid for.
export function classifyCaptureError(error: unknown): CaptureErrorKind {
  const message = error instanceof Error ? error.message : String(error)
  if (/ORDER_ALREADY_CAPTURED|ALREADY_CAPTURED/i.test(message)) return "already_captured"
  if (/INSTRUMENT_DECLINED|PAYER_ACTION_REQUIRED/i.test(message)) return "requires_action"
  return "fatal"
}

export type PayPalWebhookVerifyRequest = {
  auth_algo: string
  cert_url: string
  transmission_id: string
  transmission_sig: string
  transmission_time: string
  webhook_id: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webhook_event: Record<string, any>
}

export const PAYPAL_BASE_URL = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const

export class PayPalClient {
  private readonly baseUrl: string
  private readonly auth: string
  private accessToken: { token: string; expiresAt: number } | null = null

  constructor(private readonly options: PayPalClientOptions) {
    this.baseUrl = PAYPAL_BASE_URL[options.mode]
    this.auth = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64")
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now()
    if (this.accessToken && this.accessToken.expiresAt > now + 30_000) {
      return this.accessToken.token
    }
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${this.auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "<no body>")
      throw new Error(`PayPal OAuth failed: ${res.status} ${res.statusText} — ${body}`)
    }
    const json = (await res.json()) as { access_token: string; expires_in: number }
    this.accessToken = {
      token: json.access_token,
      expiresAt: now + json.expires_in * 1000,
    }
    return json.access_token
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const token = await this.getAccessToken()
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(extraHeaders ?? {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`PayPal ${method} ${path} failed: ${res.status} ${res.statusText} — ${text}`)
    }
    return (text ? JSON.parse(text) : {}) as T
  }

  // PayPal-Request-Id is the idempotency key — PayPal returns the original
  // response if the same key is replayed within ~6 hours.
  // `customId` is the Medusa payment session id; it is the only field that
  // travels into the capture/refund webhook resources, so webhook correlation
  // depends on it being set here (see sessionIdFromResource).
  async createOrder(
    amount: PayPalAmount,
    referenceId: string,
    idempotencyKey: string,
    customId?: string,
  ): Promise<PayPalOrderResponse> {
    return this.request<PayPalOrderResponse>("POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: referenceId,
          amount,
          ...(customId ? { custom_id: customId.slice(0, PAYPAL_CUSTOM_ID_MAX) } : {}),
        },
      ],
    }, { "PayPal-Request-Id": idempotencyKey })
  }

  async getOrder(orderId: string): Promise<PayPalOrderResponse> {
    return this.request<PayPalOrderResponse>("GET", `/v2/checkout/orders/${orderId}`)
  }

  async captureOrder(orderId: string, idempotencyKey: string): Promise<PayPalCaptureResponse> {
    return this.request<PayPalCaptureResponse>(
      "POST",
      `/v2/checkout/orders/${orderId}/capture`,
      {},
      { "PayPal-Request-Id": idempotencyKey },
    )
  }

  async refundCapture(
    captureId: string,
    amount: PayPalAmount | undefined,
    idempotencyKey: string,
  ): Promise<{ id: string; status: string }> {
    const body = amount ? { amount } : {}
    return this.request<{ id: string; status: string }>(
      "POST",
      `/v2/payments/captures/${captureId}/refund`,
      body,
      { "PayPal-Request-Id": idempotencyKey },
    )
  }

  // PayPal hosts the signature verification — we forward the headers + body
  // to /v1/notifications/verify-webhook-signature and check verification_status.
  // Returns true only when PayPal explicitly returns SUCCESS.
  async verifyWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventBody: Record<string, any>,
  ): Promise<boolean> {
    if (!this.options.webhookId) {
      // Unconfigured webhook id — refuse all events to avoid silently trusting
      // unsigned payloads in production.
      return false
    }
    const get = (name: string): string | undefined => {
      const lower = name.toLowerCase()
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === lower) return Array.isArray(v) ? v[0] : v
      }
      return undefined
    }
    const payload: PayPalWebhookVerifyRequest = {
      auth_algo: get("paypal-auth-algo") ?? "",
      cert_url: get("paypal-cert-url") ?? "",
      transmission_id: get("paypal-transmission-id") ?? "",
      transmission_sig: get("paypal-transmission-sig") ?? "",
      transmission_time: get("paypal-transmission-time") ?? "",
      webhook_id: this.options.webhookId,
      webhook_event: eventBody,
    }
    if (
      !payload.auth_algo ||
      !payload.cert_url ||
      !payload.transmission_id ||
      !payload.transmission_sig ||
      !payload.transmission_time
    ) {
      return false
    }
    const result = await this.request<{ verification_status: string }>(
      "POST",
      "/v1/notifications/verify-webhook-signature",
      payload,
    )
    return result.verification_status === "SUCCESS"
  }
}
