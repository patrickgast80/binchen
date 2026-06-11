type Money = { amount: number; currency: string }

type LineItem = {
  title: string
  quantity: number
  unitPrice: Money
}

type Address = {
  firstName?: string
  lastName?: string
  company?: string
  address1?: string
  address2?: string
  postalCode?: string
  city?: string
  countryCode?: string
}

export type OrderEmailPayload = {
  orderNumber: string
  customerName: string
  customerEmail: string
  items: LineItem[]
  total: Money
  shippingAddress: Address
  estimatedShipDate: Date
}

const escape = (s: string | undefined | null): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const formatMoney = ({ amount, currency }: Money): string => {
  // Medusa stores prices in minor units (cents).
  const value = (amount / 100).toFixed(2).replace(".", ",")
  const symbol = currency?.toUpperCase() === "EUR" ? "€" : currency?.toUpperCase()
  return `${value} ${symbol}`
}

const formatDateDE = (d: Date): string =>
  d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })

const renderAddress = (a: Address): string => {
  const name = [a.firstName, a.lastName].filter(Boolean).join(" ")
  const lines = [
    name,
    a.company,
    a.address1,
    a.address2,
    [a.postalCode, a.city].filter(Boolean).join(" "),
    a.countryCode?.toUpperCase(),
  ].filter((line): line is string => Boolean(line && line.trim()))
  return lines.map(escape).join("<br>")
}

const renderItems = (items: LineItem[]): string =>
  items
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${escape(item.title)} × ${item.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${formatMoney({ amount: item.unitPrice.amount * item.quantity, currency: item.unitPrice.currency })}</td></tr>`,
    )
    .join("")

export const customerSubject = (orderNumber: string): string =>
  `Bestellbestätigung – Bilulu #${orderNumber}`

export const customerHtml = (p: OrderEmailPayload): string => `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${escape(customerSubject(p.orderNumber))}</title></head>
<body style="font-family:Helvetica,Arial,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px;margin:0 0 16px">Danke für deine Bestellung, ${escape(p.customerName)}!</h1>
  <p>Wir haben deine Bestellung <strong>#${escape(p.orderNumber)}</strong> erhalten.</p>
  <p><em>Sabine fertigt dein Stück mit der Hand.</em> Voraussichtliches Versanddatum: <strong>${escape(formatDateDE(p.estimatedShipDate))}</strong>.</p>
  <h2 style="font-size:16px;margin:24px 0 8px">Deine Bestellung</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">${renderItems(p.items)}
    <tr><td style="padding:8px 0;font-weight:bold">Gesamt</td><td style="padding:8px 0;text-align:right;font-weight:bold">${formatMoney(p.total)}</td></tr>
  </table>
  <h2 style="font-size:16px;margin:24px 0 8px">Lieferadresse</h2>
  <p style="font-size:14px;line-height:1.5">${renderAddress(p.shippingAddress)}</p>
  <p style="margin-top:32px;font-size:13px;color:#666">Bei Fragen antworte einfach auf diese E-Mail.<br>Herzliche Grüße,<br>Sabine — Bilulu</p>
</body></html>`

export const customerText = (p: OrderEmailPayload): string =>
  [
    `Danke für deine Bestellung, ${p.customerName}!`,
    "",
    `Wir haben deine Bestellung #${p.orderNumber} erhalten.`,
    `Sabine fertigt dein Stück mit der Hand. Voraussichtliches Versanddatum: ${formatDateDE(p.estimatedShipDate)}.`,
    "",
    "Deine Bestellung:",
    ...p.items.map(
      (i) => `  ${i.title} × ${i.quantity} — ${formatMoney({ amount: i.unitPrice.amount * i.quantity, currency: i.unitPrice.currency })}`,
    ),
    `  Gesamt: ${formatMoney(p.total)}`,
    "",
    "Lieferadresse:",
    `  ${[p.shippingAddress.firstName, p.shippingAddress.lastName].filter(Boolean).join(" ")}`,
    `  ${p.shippingAddress.address1 ?? ""}`,
    p.shippingAddress.address2 ? `  ${p.shippingAddress.address2}` : "",
    `  ${[p.shippingAddress.postalCode, p.shippingAddress.city].filter(Boolean).join(" ")}`,
    "",
    "Bei Fragen antworte einfach auf diese E-Mail.",
    "Herzliche Grüße,",
    "Sabine — Bilulu",
  ]
    .filter((line) => line !== "")
    .join("\n")

export const adminSubject = (orderNumber: string): string =>
  `Neue Bestellung #${orderNumber}`

export const adminHtml = (p: OrderEmailPayload): string => `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${escape(adminSubject(p.orderNumber))}</title></head>
<body style="font-family:Helvetica,Arial,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px;margin:0 0 16px">Neue Bestellung #${escape(p.orderNumber)}</h1>
  <p><strong>Käuferin/Käufer:</strong> ${escape(p.customerName)} &lt;${escape(p.customerEmail)}&gt;</p>
  <h2 style="font-size:16px;margin:24px 0 8px">Bestellung</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">${renderItems(p.items)}
    <tr><td style="padding:8px 0;font-weight:bold">Gesamt</td><td style="padding:8px 0;text-align:right;font-weight:bold">${formatMoney(p.total)}</td></tr>
  </table>
  <h2 style="font-size:16px;margin:24px 0 8px">Lieferadresse</h2>
  <p style="font-size:14px;line-height:1.5">${renderAddress(p.shippingAddress)}</p>
  <p style="margin-top:32px;font-size:13px;color:#666">Voraussichtliches Versanddatum: ${escape(formatDateDE(p.estimatedShipDate))}</p>
</body></html>`

export const adminText = (p: OrderEmailPayload): string =>
  [
    `Neue Bestellung #${p.orderNumber}`,
    "",
    `Käuferin/Käufer: ${p.customerName} <${p.customerEmail}>`,
    "",
    "Bestellung:",
    ...p.items.map(
      (i) => `  ${i.title} × ${i.quantity} — ${formatMoney({ amount: i.unitPrice.amount * i.quantity, currency: i.unitPrice.currency })}`,
    ),
    `  Gesamt: ${formatMoney(p.total)}`,
    "",
    "Lieferadresse:",
    `  ${[p.shippingAddress.firstName, p.shippingAddress.lastName].filter(Boolean).join(" ")}`,
    `  ${p.shippingAddress.address1 ?? ""}`,
    p.shippingAddress.address2 ? `  ${p.shippingAddress.address2}` : "",
    `  ${[p.shippingAddress.postalCode, p.shippingAddress.city].filter(Boolean).join(" ")}`,
    "",
    `Voraussichtliches Versanddatum: ${formatDateDE(p.estimatedShipDate)}`,
  ]
    .filter((line) => line !== "")
    .join("\n")
