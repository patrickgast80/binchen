import { AbstractPaymentProvider, BigNumber, MedusaError, PaymentActions, PaymentSessionStatus } from "@medusajs/framework/utils"
import {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"

import { PayPalClient, PayPalMode, PayPalOrderResponse } from "./client"

export type PayPalOptions = {
  clientId: string
  clientSecret: string
  mode?: PayPalMode
  webhookId?: string
}

type InjectedDependencies = {
  logger?: Logger
}

type PayPalSessionData = {
  id: string
  status?: string
  capture_id?: string
}

const PAYPAL_TO_MEDUSA_STATUS: Record<string, PaymentSessionStatus> = {
  CREATED: PaymentSessionStatus.PENDING,
  SAVED: PaymentSessionStatus.PENDING,
  APPROVED: PaymentSessionStatus.AUTHORIZED,
  VOIDED: PaymentSessionStatus.CANCELED,
  COMPLETED: PaymentSessionStatus.CAPTURED,
  PAYER_ACTION_REQUIRED: PaymentSessionStatus.REQUIRES_MORE,
}

// Currency codes PayPal expects in 2-decimal format (most). Zero-decimal
// currencies (JPY, etc.) need integer strings — we list them here so amount
// conversion stays correct for EU/DACH commerce.
const ZERO_DECIMAL_CURRENCIES = new Set(["jpy", "krw", "vnd"])

function toPayPalAmount(amount: BigNumber | string | number, currency: string): { currency_code: string; value: string } {
  const upper = currency.toUpperCase()
  const numeric = amount instanceof BigNumber ? Number(amount.numeric) : Number(amount)
  const value = ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
    ? Math.round(numeric).toString()
    : numeric.toFixed(2)
  return { currency_code: upper, value }
}

function fromPayPalAmount(value: string, currency: string): BigNumber {
  const n = Number(value)
  return new BigNumber(ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? Math.round(n) : n)
}

function extractCaptureFromOrder(order: PayPalOrderResponse): { id: string; amount?: { value: string; currency_code: string } } | undefined {
  for (const unit of order.purchase_units ?? []) {
    for (const cap of unit.payments?.captures ?? []) {
      if (cap.status === "COMPLETED") return { id: cap.id, amount: cap.amount }
    }
  }
  return undefined
}

export class PayPalProviderService extends AbstractPaymentProvider<PayPalOptions> {
  static identifier = "paypal"

  private readonly client: PayPalClient
  private readonly logger?: Logger
  private readonly mode: PayPalMode

  static validateOptions(options: Record<string, unknown>): void {
    if (!options?.clientId) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "PayPal provider requires `clientId`.")
    }
    if (!options?.clientSecret) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "PayPal provider requires `clientSecret`.")
    }
  }

  constructor(container: InjectedDependencies, options: PayPalOptions) {
    super(container, options)
    this.logger = container?.logger
    this.mode = options.mode === "live" ? "live" : "sandbox"
    this.client = new PayPalClient({
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      mode: this.mode,
      webhookId: options.webhookId,
    })
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const sessionId = (input.data as { session_id?: string } | undefined)?.session_id
    const referenceId = (sessionId ?? input.context?.idempotency_key ?? "ref").toString().slice(0, 256)
    const idempotencyKey = (input.context?.idempotency_key ?? referenceId).toString().slice(0, 36)
    const amount = toPayPalAmount(input.amount as BigNumber, input.currency_code)

    const order = await this.client.createOrder(amount, referenceId, idempotencyKey)

    return {
      id: order.id,
      data: {
        id: order.id,
        status: order.status,
        session_id: sessionId,
      } satisfies PayPalSessionData & { session_id?: string },
    }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const data = input.data as PayPalSessionData | undefined
    if (!data?.id) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "PayPal authorize: missing order id.")
    }
    // PayPal Smart Buttons hand control back after the buyer approves in their
    // wallet UI; the storefront's onApprove handler captures via a server route
    // that calls capturePayment. So at authorize time we simply re-check status
    // and report whatever PayPal currently says.
    const order = await this.client.getOrder(data.id)
    const status = PAYPAL_TO_MEDUSA_STATUS[order.status] ?? PaymentSessionStatus.PENDING

    return {
      status,
      data: { ...data, status: order.status },
    }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const data = input.data as PayPalSessionData | undefined
    if (!data?.id) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "PayPal capture: missing order id.")
    }
    // If already captured (e.g. storefront onApprove already did it), just
    // refresh from PayPal — calling capture twice on the same order errors.
    let order: PayPalOrderResponse
    if (data.capture_id) {
      order = await this.client.getOrder(data.id)
    } else {
      try {
        order = await this.client.captureOrder(data.id, data.id)
      } catch (err) {
        // ORDER_ALREADY_CAPTURED is non-fatal — fetch the order to learn the
        // capture id and continue.
        if (err instanceof Error && /ORDER_ALREADY_CAPTURED|ALREADY_CAPTURED/i.test(err.message)) {
          order = await this.client.getOrder(data.id)
        } else {
          throw err
        }
      }
    }

    const capture = extractCaptureFromOrder(order)
    return {
      data: {
        ...data,
        status: order.status,
        capture_id: capture?.id ?? data.capture_id,
        currency_code: capture?.amount?.currency_code ?? order.purchase_units?.[0]?.amount?.currency_code,
      },
    }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    // PayPal Orders v2 has no explicit cancel endpoint; an unapproved order
    // expires automatically. Mark the local data and move on.
    const data = (input.data as PayPalSessionData | undefined) ?? { id: "" }
    return { data: { ...data, status: "VOIDED" } }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data ?? {} }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const data = input.data as PayPalSessionData | undefined
    if (!data?.id) {
      return { status: PaymentSessionStatus.PENDING }
    }
    const order = await this.client.getOrder(data.id)
    const status = PAYPAL_TO_MEDUSA_STATUS[order.status] ?? PaymentSessionStatus.PENDING
    return {
      status,
      data: { ...data, status: order.status },
    }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = input.data as (PayPalSessionData & { currency_code?: string }) | undefined
    if (!data?.capture_id) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "PayPal refund: missing capture id (was the payment captured?).")
    }
    // Currency isn't on RefundPaymentInput — pull it from the stored payment
    // data (we record it at capture time) and fall back to PayPal's order
    // record so partial refunds always send a currency PayPal accepts.
    let currency = data.currency_code
    if (!currency && data.id) {
      const order = await this.client.getOrder(data.id)
      currency = order.purchase_units?.[0]?.amount?.currency_code
    }
    const amount = input.amount && currency
      ? toPayPalAmount(input.amount as BigNumber, currency)
      : undefined
    const idempotencyKey = `refund_${data.capture_id}_${Date.now()}`
    const refund = await this.client.refundCapture(data.capture_id, amount, idempotencyKey)
    return {
      data: {
        ...data,
        last_refund_id: refund.id,
        last_refund_status: refund.status,
      },
    }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    const data = input.data as PayPalSessionData | undefined
    if (!data?.id) return { data: data ?? {} }
    const order = await this.client.getOrder(data.id)
    return { data: { ...data, status: order.status, raw: order } as unknown as Record<string, unknown> }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // PayPal does not allow mutating an APPROVED/COMPLETED order's total. If
    // the cart changes, the storefront should delete + re-initiate. For
    // pending sessions, treat update as a no-op so checkout flows don't break.
    return { data: input.data ?? {} }
  }

  async getWebhookActionAndData(payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    const event = payload.data as { event_type?: string; resource?: Record<string, unknown> } | undefined
    const eventType = event?.event_type
    const resource = event?.resource ?? {}

    // Mandatory signature verification — without a valid PAYPAL_WEBHOOK_ID, or
    // when verification fails, we treat the event as not supported so Medusa
    // takes no action. The HTTP route still returns 200 (PayPal won't retry on
    // valid receipts) but the payment side-effect is gated on auth.
    const verified = await this.client.verifyWebhookSignature(
      (payload.headers ?? {}) as Record<string, string | string[] | undefined>,
      (event as Record<string, unknown>) ?? {},
    )

    if (!verified) {
      this.logger?.warn(`[payment-paypal] dropped unverified webhook event_type=${eventType ?? "<none>"}`)
      return {
        action: PaymentActions.NOT_SUPPORTED,
        data: { session_id: "", amount: new BigNumber(0) },
      }
    }

    const sessionId =
      ((resource as { custom_id?: string }).custom_id as string | undefined) ??
      ((resource as { invoice_id?: string }).invoice_id as string | undefined) ??
      ""

    switch (eventType) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        const amount = (resource as { amount?: { value?: string; currency_code?: string } }).amount
        const value = amount?.value ?? "0"
        const currency = amount?.currency_code ?? "EUR"
        return {
          action: PaymentActions.SUCCESSFUL,
          data: { session_id: sessionId, amount: fromPayPalAmount(value, currency) },
        }
      }
      case "PAYMENT.CAPTURE.DENIED": {
        return {
          action: PaymentActions.FAILED,
          data: { session_id: sessionId, amount: new BigNumber(0) },
        }
      }
      case "PAYMENT.CAPTURE.REFUNDED": {
        const amount = (resource as { amount?: { value?: string; currency_code?: string } }).amount
        const value = amount?.value ?? "0"
        const currency = amount?.currency_code ?? "EUR"
        return {
          action: PaymentActions.NOT_SUPPORTED,
          data: { session_id: sessionId, amount: fromPayPalAmount(value, currency) },
        }
      }
      default:
        return {
          action: PaymentActions.NOT_SUPPORTED,
          data: { session_id: sessionId, amount: new BigNumber(0) },
        }
    }
  }
}

export default PayPalProviderService
