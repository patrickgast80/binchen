// BIL-2482 — unit proof for PayPal webhook correlation.
//
// Run: pnpm --filter @binchen/backend test:paypal
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
  classifyCaptureError,
  customIdFromOrder,
  needsCapture,
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

  // ---------------------------------------------------------------- capture
  // Second half of BIL-2482: an APPROVED order is not a paid order. Proven live
  // in sandbox — the buyer approved, Medusa placed the order, and PayPal still
  // reported `captures: []`, because nothing in the stack ever called capture.
  console.log("needsCapture — which PayPal states still owe us a capture call")
  {
    check("APPROVED needs the capture POST", needsCapture({ id: "o", status: "APPROVED" }))
    check("COMPLETED is already captured", !needsCapture({ id: "o", status: "COMPLETED" }))
    check("CREATED (nobody approved yet) must not be captured", !needsCapture({ id: "o", status: "CREATED" }))
    check("VOIDED must not be captured", !needsCapture({ id: "o", status: "VOIDED" }))
    check("undefined order -> no capture", !needsCapture(undefined))
  }

  console.log("classifyCaptureError — how a failed capture is handled")
  {
    check(
      "ORDER_ALREADY_CAPTURED is a race, not a failure",
      classifyCaptureError(new Error("PayPal 422: ORDER_ALREADY_CAPTURED")) === "already_captured",
    )
    check(
      "INSTRUMENT_DECLINED asks the buyer for another funding source",
      classifyCaptureError(new Error("PayPal 422: INSTRUMENT_DECLINED")) === "requires_action",
    )
    check(
      "unknown errors are fatal (fail without placing an unpaid order)",
      classifyCaptureError(new Error("PayPal 500: INTERNAL_SERVER_ERROR")) === "fatal",
    )
    check("non-Error values still classify", classifyCaptureError("boom") === "fatal")
  }

  console.log("captureOrder sends the order id as the idempotency key")
  {
    const calls = stubFetch((url) =>
      url.endsWith("/v1/oauth2/token")
        ? { access_token: "tok", expires_in: 3600 }
        : {
            id: "5YU1264040327872K",
            status: "COMPLETED",
            purchase_units: [
              { custom_id: SESSION, payments: { captures: [{ id: "3C679366HH908993F", status: "COMPLETED" }] } },
            ],
          },
    )
    const client = new PayPalClient({ clientId: "id", clientSecret: "secret", mode: "sandbox" })
    await client.captureOrder("5YU1264040327872K", "5YU1264040327872K")
    await client.captureOrder("5YU1264040327872K", "5YU1264040327872K")

    const captures = calls.filter((c) => c.url.endsWith("/capture"))
    check("capture hits the v2 orders capture endpoint", captures.length === 2, captures.length)
    check(
      "PayPal-Request-Id == order id, so a replay cannot double-charge",
      captures.every((c) => c.headers["PayPal-Request-Id"] === "5YU1264040327872K"),
      captures.map((c) => c.headers["PayPal-Request-Id"]),
    )
  }

  console.log(failures === 0 ? "\nPASS — all checks green" : `\nFAIL — ${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
