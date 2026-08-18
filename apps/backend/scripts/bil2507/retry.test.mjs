#!/usr/bin/env node --test
/**
 * BIL-2507 — fault-injection proof for the Konfigurator variant resolver.
 *
 * The live flake QA saw (2/29) does not reproduce on demand: the Medusa
 * endpoint answered 124/124 and the live server action 100/100 while this fix
 * was being written. So the retry is proved by INJECTING the failure instead
 * of waiting for it — stub `globalThis.fetch`, make it fail exactly the way a
 * dropped proxy connection does, and assert the resolver still returns a
 * variant instead of bouncing to `?error=variant_unavailable`.
 *
 * No new dependency: node:test + Node 24's native TypeScript type-stripping,
 * so `medusa.ts` is exercised as-is rather than through a copied-out helper
 * that could drift from the shipped code.
 *
 * Run: node --test apps/backend/scripts/bil2507/retry.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL = "https://api.test.invalid";
process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = "pk_test";

const MODULE = new URL("../../../storefront/src/lib/medusa.ts", import.meta.url);

const REGIONS = { regions: [{ id: "reg_test", currency_code: "eur", countries: [{ iso_2: "de" }] }] };
const PRODUCTS = {
  products: [
    {
      id: "prod_kurz",
      title: 'Bilulu-Pumphose kurz (Konfigurator)',
      thumbnail: null,
      metadata: null,
      variants: [
        {
          id: "variant_kurz",
          sku: "KURZ-1",
          inventory_quantity: 1,
          calculated_price: { calculated_amount: 3490, currency_code: "eur" },
        },
      ],
    },
  ],
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Install a fetch stub. `plan` is consulted per /store/products call and may
 * yield "throw" (transport drop), a status number, or "ok".
 * /store/regions always succeeds so each test isolates one failure mode.
 */
function stubFetch(plan) {
  const calls = { products: 0, regions: 0 };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/store/regions")) {
      calls.regions++;
      return jsonResponse(REGIONS);
    }
    const step = plan[Math.min(calls.products, plan.length - 1)];
    calls.products++;
    if (step === "throw") throw Object.assign(new Error("socket hang up"), { name: "TypeError" });
    if (step === "timeout") throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    if (typeof step === "number") return jsonResponse({ message: "nope" }, step);
    return jsonResponse(PRODUCTS);
  };
  return calls;
}

// Silence the (intentional) structured warn lines so test output stays readable,
// but keep them countable — the log IS part of the deliverable.
const logged = [];
console.warn = (line) => logged.push(line);
console.error = (line) => logged.push(line);

const realFetch = globalThis.fetch;
const { getConfiguratorHoseKurzVariant } = await import(MODULE);

test("happy path: resolves on first try", async () => {
  const calls = stubFetch(["ok"]);
  const target = await getConfiguratorHoseKurzVariant();
  assert.equal(target?.variantId, "variant_kurz");
  assert.equal(calls.products, 1, "must not retry a success");
});

test("one dropped connection still resolves (the BIL-2507 bounce)", async () => {
  const calls = stubFetch(["throw", "ok"]);
  const target = await getConfiguratorHoseKurzVariant();
  assert.equal(target?.variantId, "variant_kurz", "transient drop must not bounce the customer");
  assert.equal(calls.products, 2);
});

test("one 502 from the proxy still resolves", async () => {
  const calls = stubFetch([502, "ok"]);
  const target = await getConfiguratorHoseKurzVariant();
  assert.equal(target?.variantId, "variant_kurz");
  assert.equal(calls.products, 2);
});

test("a timeout still resolves", async () => {
  const calls = stubFetch(["timeout", "ok"]);
  const target = await getConfiguratorHoseKurzVariant();
  assert.equal(target?.variantId, "variant_kurz");
  assert.equal(calls.products, 2);
});

test("two failures still resolve — budget is 3 attempts", async () => {
  const calls = stubFetch(["throw", 503, "ok"]);
  const target = await getConfiguratorHoseKurzVariant();
  assert.equal(target?.variantId, "variant_kurz");
  assert.equal(calls.products, 3);
});

test("sustained outage gives up after exactly 3 attempts", async () => {
  const calls = stubFetch(["throw"]);
  const target = await getConfiguratorHoseKurzVariant();
  assert.equal(target, null, "a real outage must still surface as null");
  assert.equal(calls.products, 3, "must not retry forever — no tight loop on a failing backend");
});

test("401 is NOT retried — a real answer, not a blip", async () => {
  const calls = stubFetch([401]);
  const target = await getConfiguratorHoseKurzVariant();
  assert.equal(target, null);
  assert.equal(calls.products, 1, "retrying an auth failure just delays the error");
});

test("404 is NOT retried", async () => {
  const calls = stubFetch([404]);
  const target = await getConfiguratorHoseKurzVariant();
  assert.equal(target, null);
  assert.equal(calls.products, 1);
});

test("429 IS retried — rate limit is transient", async () => {
  const calls = stubFetch([429, "ok"]);
  const target = await getConfiguratorHoseKurzVariant();
  assert.equal(target?.variantId, "variant_kurz");
  assert.equal(calls.products, 2);
});

test("every failed attempt emits a structured line with a shared requestId", async () => {
  logged.length = 0;
  stubFetch(["throw", "throw", "ok"]);
  await getConfiguratorHoseKurzVariant();
  const parsed = logged.map((l) => JSON.parse(l));
  const failures = parsed.filter((p) => p.event === "store_fetch_failed");
  assert.equal(failures.length, 2, "one line per failed attempt");
  assert.equal(new Set(failures.map((f) => f.requestId)).size, 1, "same requestId across the chain");
  for (const f of failures) {
    assert.ok(f.code, "structured errors carry a code");
    assert.ok(f.message, "structured errors carry a message");
    assert.ok(f.requestId.startsWith("sf_"), "structured errors carry a requestId");
  }
  const recovered = parsed.find((p) => p.code === "store_fetch_recovered");
  assert.ok(recovered, "a recovered retry is logged so degradation is visible");
  assert.equal(recovered.attempts, 3);
});

test("giving up logs an error line, not just warnings", async () => {
  logged.length = 0;
  stubFetch([500]);
  await getConfiguratorHoseKurzVariant();
  const gaveUp = logged.map((l) => JSON.parse(l)).find((p) => p.event === "store_fetch_gave_up");
  assert.ok(gaveUp, "an exhausted budget must be loud");
  assert.equal(gaveUp.attempts, 3);
  assert.equal(gaveUp.transient, true);
});

test.after(() => {
  globalThis.fetch = realFetch;
});
