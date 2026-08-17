// BIL-2482 — unit proof for PayPal webhook correlation.
//
// Run: pnpm --filter binchen-backend test:paypal
//
// Why this test exists: until now the capture path had never executed once
// (PayPal event log: 0 events in the shop's lifetime), so nothing caught that
// `reference_id` does not travel into the capture/refund webhook resource.
// Live cutover is the first time that path runs with real money, so the two
// halves — "we write custom_id" and "we read it back" — are pinned here.
//
// No network: `fetch` is stubbed. No Medusa runtime: only client.ts is imported
// (service.ts pulls in @medusajs/framework, which needs a container to boot).

import {
  PayPalClient,
  customIdFromOrder,
  payPalOrderIdFromResource,
  sessionIdFromResource,
} from "../client"

let failures = 0

function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail === undefined ? "" : ` — got: ${JSON.stringify(detail)}`}`)
  }
}

type Recorded = { url: string; body: any; headers: Record<string, string> }

function stubFetch(responder: (url: string, init: any) => unknown): Recorded[] {
  const calls: Recorded[] = []
  ;(globalThis as any).fetch = async (url: string, init: any = {}) => {
    calls.push({
      url,
      body: init.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init.body,
      headers: (init.headers ?? {}) as Record<string, string>,
    })
    const payload = responder(url, init)
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify(payload),
      json: async () => payload,
    }
  }
  return calls
}

async function main(): Promise<void> {
  const SESSION = "payses_01M084NC19YCM8DBNZ95Y6ZA1F"

  console.log("createOrder writes the Medusa session id as purchase_unit.custom_id")
  {
    const calls = stubFetch((url) =>
      url.endsWith("/v1/oauth2/token")
        ? { access_token: "tok", expires_in: 3600 }
        : { id: "5YU1264040327872K", status: "CREATED" },
    )
    const client = new PayPalClient({ clientId: "id", clientSecret: "secret", mode: "sandbox" })
    await client.createOrder({ currency_code: "EUR", value: "44.00" }, SESSION, "idem-1", SESSION)

    const create = calls.find((c) => c.url.endsWith("/v2/checkout/orders"))!
    const unit = create.body.purchase_units[0]
    check("custom_id == session id", unit.custom_id === SESSION, unit.custom_id)
    check("reference_id still sent", unit.reference_id === SESSION, unit.reference_id)
    check("amount unchanged", unit.amount.value === "44.00" && unit.amount.currency_code === "EUR", unit.amount)
    check("idempotency key on the header", create.headers["PayPal-Request-Id"] === "idem-1", create.headers)
    check("invoice_id NOT set (PayPal enforces uniqueness on it)", unit.invoice_id === undefined, unit.invoice_id)
  }

  console.log("createOrder omits custom_id when no session id is available")
  {
    const calls = stubFetch((url) =>
      url.endsWith("/v1/oauth2/token") ? { access_token: "tok", expires_in: 3600 } : { id: "o1", status: "CREATED" },
    )
    const client = new PayPalClient({ clientId: "id", clientSecret: "secret", mode: "sandbox" })
    await client.createOrder({ currency_code: "EUR", value: "1.00" }, "ref", "idem-2")
    const unit = calls.find((c) => c.url.endsWith("/v2/checkout/orders"))!.body.purchase_units[0]
    check("no empty custom_id sent", !("custom_id" in unit), unit)
  }

  console.log("custom_id is truncated to PayPal's 127-char limit")
  {
    const long = "s".repeat(300)
    const calls = stubFetch((url) =>
      url.endsWith("/v1/oauth2/token") ? { access_token: "tok", expires_in: 3600 } : { id: "o1", status: "CREATED" },
    )
    const client = new PayPalClient({ clientId: "id", clientSecret: "secret", mode: "sandbox" })
    await client.createOrder({ currency_code: "EUR", value: "1.00" }, "ref", "idem-3", long)
    const unit = calls.find((c) => c.url.endsWith("/v2/checkout/orders"))!.body.purchase_units[0]
    check("custom_id length == 127", unit.custom_id.length === 127, unit.custom_id.length)
  }

  console.log("sessionIdFromResource reads the capture/refund resource")
  {
    // Shape taken from PayPal's PAYMENT.CAPTURE.COMPLETED sample resource.
    const capture = {
      id: "3C679366HH908993F",
      status: "COMPLETED",
      amount: { currency_code: "EUR", value: "44.00" },
      custom_id: SESSION,
      supplementary_data: { related_ids: { order_id: "5YU1264040327872K" } },
    }
    check("custom_id wins", sessionIdFromResource(capture) === SESSION, sessionIdFromResource(capture))
    check(
      "invoice_id used as fallback",
      sessionIdFromResource({ invoice_id: "inv_9" }) === "inv_9",
      sessionIdFromResource({ invoice_id: "inv_9" }),
    )
    check("reference_id is NOT accepted (it never arrives)", sessionIdFromResource({ reference_id: SESSION }) === "")
    check("missing resource -> empty string", sessionIdFromResource(undefined) === "")
    check("non-string custom_id ignored", sessionIdFromResource({ custom_id: 42 } as any) === "")
    check(
      "order id extracted for the fallback hop",
      payPalOrderIdFromResource(capture) === "5YU1264040327872K",
      payPalOrderIdFromResource(capture),
    )
    check("order id absent -> empty string", payPalOrderIdFromResource({ id: "x" }) === "")
  }

  console.log("customIdFromOrder recovers the session from a re-fetched order")
  {
    const order = {
      id: "5YU1264040327872K",
      status: "COMPLETED",
      purchase_units: [{ reference_id: SESSION, custom_id: SESSION, amount: { currency_code: "EUR", value: "44.00" } }],
    }
    check("reads purchase_unit.custom_id", customIdFromOrder(order) === SESSION, customIdFromOrder(order))
    check("pre-cutover order without custom_id -> empty", customIdFromOrder({ id: "o", status: "COMPLETED", purchase_units: [{ reference_id: "r" }] }) === "")
    check("undefined order -> empty", customIdFromOrder(undefined) === "")
  }

  console.log(failures === 0 ? "\nPASS — all checks green" : `\nFAIL — ${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
