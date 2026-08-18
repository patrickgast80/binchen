/**
 * BIL-2502 — fault-injecting proxy in front of the live Medusa backend.
 *
 * Everything is forwarded verbatim to api.bilulu.de EXCEPT
 * `POST /store/carts/{id}/complete`, which answers with the exact 400 body the
 * live backend returned to QA during the BIL-2500 oversell probe
 * (apps/e2e/reports/bil2500/case2-results.json).
 *
 * Why a proxy and not a real oversell: reproducing an oversell for real means
 * completing an order against production and burning one of Sabine's unique
 * pieces. This exercises the identical wire response through the real
 * classifyCompleteFailure -> redirect -> render chain with zero prod side
 * effects.
 *
 *   node bil2502-fault-proxy.mjs [--fault=out_of_stock|shipping|http500] [--port=9411]
 */
import http from "node:http";

const UPSTREAM = "https://api.bilulu.de";
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")),
);
const FAULT = args.fault ?? "out_of_stock";
const PORT = Number(args.port ?? 9411);

// Verbatim live bodies — see apps/e2e/reports/bil2500/.
const FAULTS = {
  out_of_stock: {
    status: 400,
    body: {
      code: "insufficient_inventory",
      type: "not_allowed",
      message: "Some variant does not have the required inventory",
    },
  },
  shipping: {
    status: 400,
    body: {
      type: "invalid_data",
      message:
        "The cart items require shipping profiles that are not satisfied by the current shipping methods",
    },
  },
  http500: { status: 500, body: { type: "unknown_error", message: "Internal server error" } },
};

const COMPLETE = /^\/store\/carts\/[^/]+\/complete$/;
let active = FAULT;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");

  // Switch the injected fault without restarting (and without bouncing the
  // dev server that points at this port).
  const switchTo = url.pathname.match(/^\/__fault\/(\w+)$/);
  if (switchTo) {
    active = FAULTS[switchTo[1]] ? switchTo[1] : active;
    console.log(`[proxy] fault -> ${active}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ active }));
    return;
  }

  if (req.method === "POST" && COMPLETE.test(url.pathname)) {
    const fault = FAULTS[active];
    console.log(`[proxy] INJECT ${active} -> ${fault.status} on ${url.pathname}`);
    res.writeHead(fault.status, { "content-type": "application/json" });
    res.end(JSON.stringify(fault.body));
    return;
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  delete headers["accept-encoding"];

  try {
    const upstream = await fetch(`${UPSTREAM}${req.url}`, {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
      redirect: "manual",
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    const out = {};
    upstream.headers.forEach((v, k) => {
      if (!["content-encoding", "content-length", "transfer-encoding"].includes(k)) out[k] = v;
    });
    res.writeHead(upstream.status, out);
    res.end(buf);
  } catch (err) {
    console.log(`[proxy] upstream error ${req.method} ${req.url}: ${err.message}`);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "proxy upstream error" }));
  }
});

server.listen(PORT, () => console.log(`[proxy] :${PORT} -> ${UPSTREAM}, fault=${FAULT}`));
