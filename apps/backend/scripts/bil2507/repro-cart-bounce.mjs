#!/usr/bin/env node
/**
 * BIL-2507 — reproduce the ~7% silent `?error=variant_unavailable` bounce
 * WITHOUT a browser, by driving the `addConfiguredHoseKurzToCartAction`
 * server action directly (see reference: nextjs-server-actions-via-node).
 *
 * A browser run costs ~8s per attempt; this costs ~1s, so we can afford the
 * sample size a 7% event actually needs. Every attempt records the redirect
 * target, so `error=variant_unavailable` vs `error=cart_unavailable` vs
 * `error=add_failed` are told apart — they have different root causes and the
 * QA report could only see the first.
 *
 * Usage: node repro-cart-bounce.mjs [--n 60] [--path /konfigurator/hose-kurz]
 */

const BASE = process.env.STOREFRONT_URL ?? "https://bilulu.de";
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const N = Number(arg("n", 60));
const PATHNAME = arg("path", "/konfigurator/hose-kurz");
const QS = "?bund=sky&hose=stoff-05&buendchen=powder-pink&rot=90";
const PAGE = `${BASE}${PATHNAME}${QS}`;

/** Pull the simple-form action id out of the server-rendered HTML. */
function actionIdFrom(html) {
  const m = html.match(/name="\$ACTION_ID_([a-f0-9]{40})"/);
  return m?.[1] ?? null;
}

async function once(i) {
  const started = Date.now();
  try {
    const getRes = await fetch(PAGE, { headers: { "user-agent": "bil2507-repro" } });
    const html = await getRes.text();
    const actionId = actionIdFrom(html);
    if (!actionId) {
      return { i, phase: "GET", ok: false, status: getRes.status, note: "no $ACTION_ID_ in HTML", ms: Date.now() - started };
    }
    const cookies = getRes.headers.getSetCookie?.() ?? [];
    const cookie = cookies.map((c) => c.split(";")[0]).join("; ");

    const fd = new FormData();
    fd.append(`$ACTION_ID_${actionId}`, "");
    fd.append("bund", "sky");
    fd.append("hose", "stoff-05");
    fd.append("buendchen", "powder-pink");
    fd.append("bundName", "Sky");
    fd.append("hoseName", "Stoff 05");
    fd.append("buendchenName", "Powder Pink");
    fd.append("musterRotation", "90");
    fd.append("configHref", `${PATHNAME}${QS}`);

    const post = await fetch(PAGE, {
      method: "POST",
      body: fd,
      redirect: "manual",
      headers: { cookie, "user-agent": "bil2507-repro" },
    });
    const location = post.headers.get("location") ?? post.headers.get("x-action-redirect") ?? "";
    const errorMatch = location.match(/error=([a-z_]+)/);
    return {
      i,
      phase: "POST",
      status: post.status,
      location,
      error: errorMatch?.[1] ?? null,
      ok: !errorMatch && /\/cart/.test(location),
      ms: Date.now() - started,
    };
  } catch (err) {
    return { i, phase: "throw", ok: false, error: "transport", note: `${err.name}: ${err.message} ${err.cause?.code ?? ""}`, ms: Date.now() - started };
  }
}

console.log(`repro ${PAGE}  n=${N}`);
const results = [];
for (let i = 0; i < N; i++) {
  const r = await once(i);
  results.push(r);
  const flag = r.ok ? "ok" : `FAIL ${r.error ?? r.status} ${r.note ?? r.location ?? ""}`;
  console.log(`  ${String(i).padStart(3)} ${flag} (${r.ms}ms)`);
}

const byError = {};
for (const r of results) {
  const k = r.ok ? "ok" : (r.error ?? `status_${r.status}`);
  byError[k] = (byError[k] ?? 0) + 1;
}
const fails = results.filter((r) => !r.ok);
console.log(
  "\n" +
    JSON.stringify(
      {
        base: BASE,
        path: PATHNAME,
        attempts: results.length,
        failures: fails.length,
        failureRate: `${((fails.length / results.length) * 100).toFixed(1)}%`,
        byError,
        failDetail: fails.slice(0, 15),
      },
      null,
      2,
    ),
);
