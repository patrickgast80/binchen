import { Logger } from "@medusajs/framework/types"
import {
  OrderEmailPayload,
  adminHtml,
  adminSubject,
  adminText,
  customerHtml,
  customerSubject,
  customerText,
} from "./templates"

type BrevoRecipient = { email: string; name?: string }

type BrevoPayload = {
  sender: BrevoRecipient
  to: BrevoRecipient[]
  subject: string
  htmlContent: string
  textContent: string
  replyTo?: BrevoRecipient
}

type EmailModuleOptions = {
  apiKey?: string
  senderEmail?: string
  senderName?: string
  adminEmail?: string
  brevoUrl?: string
}

type Container = { logger?: Logger }

export class EmailModuleService {
  private readonly apiKey?: string
  private readonly senderEmail?: string
  private readonly senderName: string
  private readonly adminEmail?: string
  private readonly brevoUrl: string
  private readonly logger?: Logger

  constructor(container: Container, options: EmailModuleOptions = {}) {
    this.logger = container?.logger
    this.apiKey = options.apiKey ?? process.env.BREVO_API_KEY
    this.senderEmail = options.senderEmail ?? process.env.BREVO_SENDER_EMAIL
    this.senderName = options.senderName ?? process.env.BREVO_SENDER_NAME ?? "Bilulu"
    this.adminEmail = options.adminEmail ?? process.env.BREVO_ADMIN_EMAIL
    this.brevoUrl = options.brevoUrl ?? "https://api.brevo.com/v3/smtp/email"
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.senderEmail)
  }

  async sendOrderConfirmation(payload: OrderEmailPayload): Promise<void> {
    if (!this.isConfigured()) {
      this.warnSkip("customer", payload.orderNumber)
      return
    }
    await this.send({
      sender: { email: this.senderEmail!, name: this.senderName },
      to: [{ email: payload.customerEmail, name: payload.customerName }],
      subject: customerSubject(payload.orderNumber),
      htmlContent: customerHtml(payload),
      textContent: customerText(payload),
    })
  }

  async sendAdminNotification(payload: OrderEmailPayload): Promise<void> {
    if (!this.isConfigured() || !this.adminEmail) {
      this.warnSkip("admin", payload.orderNumber)
      return
    }
    await this.send({
      sender: { email: this.senderEmail!, name: this.senderName },
      to: [{ email: this.adminEmail }],
      subject: adminSubject(payload.orderNumber),
      htmlContent: adminHtml(payload),
      textContent: adminText(payload),
      replyTo: { email: payload.customerEmail, name: payload.customerName },
    })
  }

  private warnSkip(kind: "customer" | "admin", orderNumber: string): void {
    const missing: string[] = []
    if (!this.apiKey) missing.push("BREVO_API_KEY")
    if (!this.senderEmail) missing.push("BREVO_SENDER_EMAIL")
    if (kind === "admin" && !this.adminEmail) missing.push("BREVO_ADMIN_EMAIL")
    const message = `[email] skipping ${kind} email for order ${orderNumber}; missing env: ${missing.join(", ")}`
    if (this.logger) this.logger.warn(message)
    else console.warn(message)
  }

  private async send(payload: BrevoPayload): Promise<void> {
    const response = await fetch(this.brevoUrl, {
      method: "POST",
      headers: {
        "api-key": this.apiKey!,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "<no body>")
      const message = `[email] Brevo send failed: ${response.status} ${response.statusText} — ${body}`
      if (this.logger) this.logger.error(message)
      else console.error(message)
      throw new Error(message)
    }
  }
}

export default EmailModuleService
