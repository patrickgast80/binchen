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
    amount?: PayPalAmount
    payments?: {
      captures?: Array<{ id: string; status: string; amount?: PayPalAmount }>
      refunds?: Array<{ id: string; status: string; amount?: PayPalAmount }>
    }
  }>
}

export type PayPalCaptureResponse = PayPalOrderResponse

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
  async createOrder(
    amount: PayPalAmount,
    referenceId: string,
    idempotencyKey: string,
  ): Promise<PayPalOrderResponse> {
    return this.request<PayPalOrderResponse>("POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: referenceId,
          amount,
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
