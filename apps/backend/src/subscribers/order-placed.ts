import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { EMAIL_MODULE } from "../modules/email"
import type { EmailModuleService } from "../modules/email/service"
import type { OrderEmailPayload } from "../modules/email/templates"

const SHIPPING_LEAD_TIME_DAYS = 5

const addBusinessDays = (start: Date, days: number): Date => {
  const result = new Date(start)
  let remaining = days
  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay()
    if (day !== 0 && day !== 6) remaining -= 1
  }
  return result
}

export default async function orderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>): Promise<void> {
  const logger = container.resolve("logger")
  const orderId = event.data?.id
  if (!orderId) {
    logger.warn("[email] order.placed received without id; skipping")
    return
  }

  const emailService = container.resolve<EmailModuleService>(EMAIL_MODULE)
  if (!emailService.isConfigured()) {
    logger.warn(
      `[email] order.placed ${orderId}: email module not configured (BREVO_API_KEY/BREVO_SENDER_EMAIL); skipping send`,
    )
    return
  }

  const orderModule = container.resolve(Modules.ORDER) as {
    retrieveOrder: (
      id: string,
      config?: { relations?: string[] },
    ) => Promise<RawOrder>
  }

  const order = await orderModule.retrieveOrder(orderId, {
    relations: ["items", "shipping_address", "summary"],
  })

  const payload = buildPayload(order)
  if (!payload.customerEmail) {
    logger.warn(`[email] order.placed ${orderId}: no customer email on order; skipping`)
    return
  }

  await Promise.allSettled([
    emailService.sendOrderConfirmation(payload).catch((err) => {
      logger.error(`[email] customer confirmation failed for ${orderId}: ${err}`)
      throw err
    }),
    emailService.sendAdminNotification(payload).catch((err) => {
      logger.error(`[email] admin notification failed for ${orderId}: ${err}`)
      throw err
    }),
  ])
}

type RawOrder = {
  id: string
  display_id?: number | string
  email?: string | null
  currency_code?: string
  total?: number | string
  items?: Array<{
    title?: string | null
    product_title?: string | null
    quantity: number
    unit_price?: number | string
  }>
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    company?: string | null
    address_1?: string | null
    address_2?: string | null
    postal_code?: string | null
    city?: string | null
    country_code?: string | null
  } | null
}

const buildPayload = (order: RawOrder): OrderEmailPayload => {
  const currency = (order.currency_code ?? "EUR").toUpperCase()
  const items =
    (order.items ?? []).map((item) => ({
      title: item.product_title ?? item.title ?? "Artikel",
      quantity: item.quantity,
      unitPrice: { amount: toMinorUnits(item.unit_price), currency },
    })) ?? []

  const shipping = order.shipping_address ?? {}
  const firstName = shipping.first_name ?? ""
  const lastName = shipping.last_name ?? ""
  const customerName = [firstName, lastName].filter(Boolean).join(" ").trim() || "Kundin/Kunde"

  return {
    orderNumber: String(order.display_id ?? order.id),
    customerName,
    customerEmail: order.email ?? "",
    items,
    total: { amount: toMinorUnits(order.total), currency },
    shippingAddress: {
      firstName: shipping.first_name ?? undefined,
      lastName: shipping.last_name ?? undefined,
      company: shipping.company ?? undefined,
      address1: shipping.address_1 ?? undefined,
      address2: shipping.address_2 ?? undefined,
      postalCode: shipping.postal_code ?? undefined,
      city: shipping.city ?? undefined,
      countryCode: shipping.country_code ?? undefined,
    },
    estimatedShipDate: addBusinessDays(new Date(), SHIPPING_LEAD_TIME_DAYS),
  }
}

const toMinorUnits = (value: number | string | undefined | null): number => {
  if (value == null) return 0
  const n = typeof value === "string" ? Number(value) : value
  if (!Number.isFinite(n)) return 0
  // Medusa v2 returns decimal totals on the order API (e.g. 19.99).
  return Math.round(n * 100)
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
