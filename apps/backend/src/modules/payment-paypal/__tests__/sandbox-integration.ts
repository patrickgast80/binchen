// BIL-2482 — sandbox integration proof for the webhook-correlation fix.
//
// Run: pnpm --filter binchen-backend test:paypal:sandbox
//      (reads infra/.vault/paypal-sandbox.env; nothing secret is printed)
//
// The unit test pins our own encode/decode. This one asks PayPal whether it
// actually accepts `purchase_unit.custom_id` and echoes it back on the order —
// i.e. whether the value a capture webhook would carry is really stored on
// PayPal's side. Uses the production PayPalClient, not a hand-rolled request.
//
// Not covered here (needs an interactive sandbox buyer login, blocked on
// BIL-2465): the capture event itself. Order echo is the strongest proof
// available without a buyer account.

import { readFileSync } from "fs"
import { resolve } from "path"

import { PayPalClient, PayPalMode, customIdFromOrder } from "../client"

const VAULT = resolve(__dirname, "../../../../../../infra/.vault/paypal-sandbox.env")

function loadVault(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync(VAULT, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
  return out
}

// Session ids are not secret, but keep the log free of anything that could be
// mistaken for one.
function tail(value: string): string {
  return value.length <= 6 ? "***" : `…${value.slice(-6)}`
}

async function main(): Promise<void> {
  const vault = loadVault()
  const clientId = vault.PAYPAL_CLIENT_ID
  const clientSecret = vault.PAYPAL_CLIENT_SECRET
  const mode = (vault.PAYPAL_MODE === "live" ? "live" : "sandbox") as PayPalMode

  if (!clientId || !clientSecret) {
    console.error(`missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in ${VAULT}`)
    process.exit(1)
  }
  if (mode !== "sandbox") {
    console.error("refusing to run: PAYPAL_MODE is not 'sandbox' — this script creates real orders")
    process.exit(1)
  }

  const client = new PayPalClient({ clientId, clientSecret, mode, webhookId: vault.PAYPAL_WEBHOOK_ID })

  // Stand-in for a Medusa payment session id; shape matches payses_01…
  const sessionId = `payses_01TEST${process.pid.toString(36).toUpperCase()}BIL2482`
  const idempotencyKey = `bil2482-${process.pid}`

  console.log(`mode=${mode} client_id=${tail(clientId)}`)
  console.log(`POST /v2/checkout/orders  custom_id=${sessionId}`)

  const created = await client.createOrder(
    { currency_code: "EUR", value: "44.00" },
    sessionId,
    idempotencyKey,
    sessionId,
  )
  console.log(`  -> ${created.id} status=${created.status}`)

  console.log(`GET  /v2/checkout/orders/${created.id}`)
  const fetched = await client.getOrder(created.id)
  const echoed = customIdFromOrder(fetched)
  const unit = fetched.purchase_units?.[0]
  console.log(`  -> custom_id=${echoed || "<none>"} reference_id=${unit?.reference_id ?? "<none>"} amount=${unit?.amount?.value} ${unit?.amount?.currency_code}`)

  const checks: Array<[string, boolean]> = [
    ["PayPal accepted custom_id on the purchase unit", echoed === sessionId],
    ["amount round-trips without drift", unit?.amount?.value === "44.00" && unit?.amount?.currency_code === "EUR"],
    ["order is approvable", fetched.status === "CREATED"],
  ]

  // Replaying the same PayPal-Request-Id must return the same order, not a
  // second one — the idempotency guarantee the checkout retry path relies on.
  const replay = await client.createOrder(
    { currency_code: "EUR", value: "44.00" },
    sessionId,
    idempotencyKey,
    sessionId,
  )
  console.log(`replay same PayPal-Request-Id -> ${replay.id}`)
  checks.push(["idempotent replay returns the same order id", replay.id === created.id])

  let failed = 0
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`)
    if (!ok) failed++
  }
  console.log(failed === 0 ? "\nPASS — sandbox agrees" : `\nFAIL — ${failed} check(s)`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
