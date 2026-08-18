#!/usr/bin/env node
/**
 * BIL-2507 — catch the flake in the act, during a Coolify deploy cutover.
 *
 * Hypothesis after measuring: GET /store/products is NOT intermittently
 * broken under steady state (124/124 direct, 100/100 through the live server
 * action). What IS intermittent is the deploy cutover — Coolify replaces both
 * the storefront and the Medusa container, and for a few seconds Traefik can
 * route to a container that is not listening yet. A shopper clicking "In den
 * Warenkorb" in that window gets exactly one failed fetch, and the pre-fix
 * resolver turned that into `?error=variant_unavailable` with no retry.
 *
 * Two deploys landed today at 09:21Z and 09:31Z, inside QA's BIL-2506 test
 * session — which matches "2 of 29, self-healing on retry" without needing a
 * standing backend defect.
 *
 * This probe hammers the storefront cart action AND the raw Medusa endpoint,
 * timestamping every sample, so a cutover shows up as a burst of failures at
 * a known second rather than as an unreproducible anecdote.
 *
 * Usage: node watch-cutover.mjs [--minutes 10] [--gap 1500]
 */

const STOREFRONT = process.env.STOREFRONT_URL ?? "https://bilulu.de";
const BACKEND = process.env.MEDUSA_BACKEND_URL ?? "https://api.bilulu.de";
const PK =
  process.env.MEDUSA_PUBLISHABLE_KEY ??
  "pk_5f4df48ccb4a5a3843410089661e694c74f1db2458ed07e1d94bfd449b14c50f";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
const MINUTES = arg("minutes", 10);
const GAP_MS = arg("gap", 1500);
const QS = "?bund=sky&hose=stoff-05&buendchen=powder-pink&rot=90";
const PAGE = `${STOREFRONT}/konfigurator/hose-kurz${QS}`;

const headers = { "content-type": "application/json", "x-publishable-api-key": PK };

// BIL-2438 trap: asking for `*variants.calculated_price` WITHOUT a region_id
// is a hard 400, not a flake. The resolver always sends one, so the probe must
// too — otherwise every sample "fails" and the cutover signal is buried.
const REGION_ID = process.env.MEDUSA_REGION_ID ?? "reg_01KVFAA131VGWJ6DF74JBYRMTM";

/** Raw Medusa read — the exact call the resolver makes. */
async function sampleBackend() {
  try {
    const res = await fetch(
      `${BACKEND}/store/products?limit=50&region_id=${REGION_ID}&fields=${encodeURIComponent("*variants.calculated_price")}`,
      { headers, signal: AbortSignal.timeout(8000) },
    );
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, err: `${err.name}` };
  }
}

/** Full "In den Warenkorb" click through the live server action. */
async function sampleCart() {
  try {
    const getRes = await fetch(PAGE, { signal: AbortSignal.timeout(10000) });
    if (!getRes.ok) return { ok: false, status: getRes.status, phase: "GET" };
    const html = await getRes.text();
    const m = html.match(/name="\$ACTION_ID_([a-f0-9]{40})"/);
    if (!m) return { ok: false, status: getRes.status, phase: "GET", err: "no action id" };
    const cookie = (getRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const fd = new FormData();
    fd.append(`$ACTION_ID_${m[1]}`, "");
    for (const [k, v] of [
      ["bund", "sky"], ["hose", "stoff-05"], ["buendchen", "powder-pink"],
      ["bundName", "Sky"], ["hoseName", "Stoff 05"], ["buendchenName", "Powder Pink"],
      ["musterRotation", "90"], ["configHref", `/konfigurator/hose-kurz${QS}`],
    ]) fd.append(k, v);
    const post = await fetch(PAGE, {
      method: "POST", body: fd, redirect: "manual", headers: { cookie },
      signal: AbortSignal.timeout(15000),
    });
    const loc = post.headers.get("location") ?? "";
    const errorMatch = loc.match(/error=([a-z_]+)/);
    return { ok: !errorMatch && /\/cart/.test(loc), status: post.status, error: errorMatch?.[1] ?? null };
  } catch (err) {
    return { ok: false, status: 0, phase: "POST", err: `${err.name}` };
  }
}

/** Which build is live — proves when the cutover actually happened. */
async function liveBuild() {
  try {
    const res = await fetch(`${STOREFRONT}/`, { method: "HEAD", signal: AbortSignal.timeout(8000) });
    return res.headers.get("x-nextjs-build") ?? res.headers.get("etag") ?? String(res.status);
  } catch {
    return "unreachable";
  }
}

const deadline = Date.now() + MINUTES * 60_000;
const samples = [];
console.log(`watching ${STOREFRONT} + ${BACKEND} for ${MINUTES}min, every ${GAP_MS}ms`);
let lastBuild = null;

while (Date.now() < deadline) {
  const at = new Date().toISOString();
  const [backend, cart, build] = await Promise.all([sampleBackend(), sampleCart(), liveBuild()]);
  if (build !== lastBuild) {
    console.log(`${at}  >>> BUILD CHANGED: ${lastBuild} -> ${build}`);
    lastBuild = build;
  }
  const row = { at, backend, cart, build };
  samples.push(row);
  if (!backend.ok || !cart.ok) {
    console.log(
      `${at}  BACKEND ${backend.ok ? "ok" : `FAIL ${backend.status}${backend.err ? " " + backend.err : ""}`}` +
        `  CART ${cart.ok ? "ok" : `FAIL ${cart.error ?? cart.status}${cart.err ? " " + cart.err : ""}`}`,
    );
  }
  await new Promise((r) => setTimeout(r, GAP_MS));
}

const backendFails = samples.filter((s) => !s.backend.ok);
const cartFails = samples.filter((s) => !s.cart.ok);
const builds = [...new Set(samples.map((s) => s.build))];
console.log(
  "\n" +
    JSON.stringify(
      {
        samples: samples.length,
        backendFailures: backendFails.length,
        cartFailures: cartFails.length,
        distinctBuilds: builds.length,
        cutoverObserved: builds.length > 1,
        backendFailDetail: backendFails.slice(0, 20).map((s) => ({ at: s.at, ...s.backend })),
        cartFailDetail: cartFails.slice(0, 20).map((s) => ({ at: s.at, ...s.cart })),
      },
      null,
      2,
    ),
);
