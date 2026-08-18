#!/usr/bin/env node
/**
 * BIL-2507 — characterise the intermittent `!res.ok` on GET /store/products
 * that makes `getConfiguratorHoseKurzVariant()` return null and the
 * configurator bounce to `?error=variant_unavailable`.
 *
 * QA saw 2/29 (~7%) failures through the browser. This probe hits the exact
 * URL the storefront builds, from outside, and records status + latency +
 * transport error for every attempt so we can tell apart:
 *   - HTTP 5xx / 429 (backend or proxy rejects)   -> backend fix
 *   - transport errors / timeouts (ECONNRESET,...) -> infra fix
 *   - all-green                                    -> the flake is NOT this
 *     fetch; look at the region fetch or Next's server-action fetch layer
 *
 * Usage:
 *   node probe-store-products.mjs [--n 120] [--burst 8] [--timeout 10000]
 */

const BACKEND = process.env.MEDUSA_BACKEND_URL ?? "https://api.bilulu.de";
const PK =
  process.env.MEDUSA_PUBLISHABLE_KEY ??
  "pk_5f4df48ccb4a5a3843410089661e694c74f1db2458ed07e1d94bfd449b14c50f";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
const N = arg("n", 120);
const BURST = arg("burst", 8);
const TIMEOUT = arg("timeout", 10_000);

const headers = { "content-type": "application/json", "x-publishable-api-key": PK };

async function getRegionId() {
  const res = await fetch(`${BACKEND}/store/regions`, { headers });
  if (!res.ok) return null;
  const { regions } = await res.json();
  const de = regions.find((r) => r.countries?.some((c) => c.iso_2?.toLowerCase() === "de"));
  return de?.id ?? regions[0]?.id ?? null;
}

function productsUrl(regionId) {
  const url = new URL(`${BACKEND}/store/products`);
  url.searchParams.set("limit", "50");
  if (regionId) url.searchParams.set("region_id", regionId);
  url.searchParams.set("fields", "*variants.calculated_price");
  return url.toString();
}

/** One attempt: mirrors the storefront's `!res.ok -> null` decision. */
async function attempt(url, label) {
  const started = process.hrtime.bigint();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers, signal: ac.signal });
    const body = await res.text();
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    let resolved = null;
    if (res.ok) {
      try {
        const { products } = JSON.parse(body);
        // exactly what getConfiguratorHoseKurzVariant() does
        const KURZ = /\bkurz/i;
        const hose =
          products.find((p) => KURZ.test(p.title) && /konfigurator/i.test(p.title)) ??
          products.find((p) => /pumphose/i.test(p.title) && /konfigurator/i.test(p.title));
        resolved = hose ? (hose.variants?.[0]?.id ?? "NO_VARIANT") : "NO_PRODUCT";
      } catch {
        resolved = "PARSE_ERROR";
      }
    }
    return {
      label,
      ok: res.ok,
      status: res.status,
      ms: Math.round(ms),
      bytes: body.length,
      resolved,
      // storefront returns null (=> variant_unavailable) on !ok OR no product/variant
      wouldBounce: !res.ok || resolved === "NO_PRODUCT" || resolved === "NO_VARIANT" || resolved === "PARSE_ERROR",
      snippet: res.ok ? null : body.slice(0, 200),
    };
  } catch (err) {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    return {
      label,
      ok: false,
      status: 0,
      ms: Math.round(ms),
      transport: `${err.name}: ${err.message}${err.cause ? ` (${err.cause.code ?? err.cause.message})` : ""}`,
      wouldBounce: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];

const regionId = await getRegionId();
console.log(`backend=${BACKEND} region=${regionId ?? "(none)"} n=${N} burst=${BURST} timeout=${TIMEOUT}ms`);
const url = productsUrl(regionId);

// Phase 1: sequential — what a lone shopper sees.
for (let i = 0; i < N / 2; i++) {
  const r = await attempt(url, `seq#${i}`);
  results.push(r);
  if (r.wouldBounce) console.log(`  BOUNCE ${r.label} status=${r.status} ${r.transport ?? r.snippet ?? r.resolved}`);
}

// Phase 2: bursts — concurrency is the usual trigger for proxy/pool flake.
for (let b = 0; b * BURST < N / 2; b++) {
  const batch = await Promise.all(
    Array.from({ length: BURST }, (_, i) => attempt(url, `burst${b}#${i}`)),
  );
  for (const r of batch) {
    results.push(r);
    if (r.wouldBounce) console.log(`  BOUNCE ${r.label} status=${r.status} ${r.transport ?? r.snippet ?? r.resolved}`);
  }
}

const bounces = results.filter((r) => r.wouldBounce);
const lat = results.map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => lat[Math.min(lat.length - 1, Math.floor((lat.length * p) / 100))];
const byStatus = {};
for (const r of results) byStatus[r.transport ?? r.status] = (byStatus[r.transport ?? r.status] ?? 0) + 1;

const summary = {
  backend: BACKEND,
  regionId,
  attempts: results.length,
  bounces: bounces.length,
  bounceRate: `${((bounces.length / results.length) * 100).toFixed(1)}%`,
  latencyMs: { p50: pct(50), p90: pct(90), p99: pct(99), max: lat[lat.length - 1] },
  byStatus,
  bounceDetail: bounces.slice(0, 20),
};
console.log("\n" + JSON.stringify(summary, null, 2));
process.exitCode = bounces.length ? 1 : 0;
