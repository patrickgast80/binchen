/**
 * BIL-2516 — fault-injecting proxy in front of the live Store API.
 *
 * The bug is on the *failure* path of "In den Warenkorb", and that path is rare
 * in normal operation (BIL-2507 gave the resolvers three retries). Pointing the
 * storefront at a dead host, as the ticket suggests, kills the product page
 * too, so the button is never reachable — you cannot press what does not
 * render. This proxy is the smaller cut: everything is forwarded to the real
 * backend, and only `POST /store/carts/{id}/line-items` is failed, on demand.
 *
 * The mode is read from `bil2516-fault-mode.txt` on every request, so all four
 * outcomes are provable against ONE build:
 *
 *   off             — pass through (control: the add must still succeed)
 *   out_of_stock    — 400 + code insufficient_inventory  → Unikat copy
 *   backend_error   — 503                                → retry copy
 *   hangup          — destroy the socket                 → transport catch
 *   remove_fail     — 503 on the line-item DELETE        → "Entfernen" banner
 *
 * Usage: node bil2516-fault-proxy.mjs [port] [upstream]
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PORT = Number(process.argv[2] ?? 9099);
const UPSTREAM = process.argv[3] ?? "https://api.bilulu.de";
const MODE_FILE = join(dirname(fileURLToPath(import.meta.url)), "bil2516-fault-mode.txt");

function mode() {
  try {
    return readFileSync(MODE_FILE, "utf8").trim() || "off";
  } catch {
    writeFileSync(MODE_FILE, "off");
    return "off";
  }
}

const isAddLineItem = (req) =>
  req.method === "POST" && /^\/store\/carts\/[^/]+\/line-items(\?|$)/.test(req.url);

const isRemoveLineItem = (req) =>
  req.method === "DELETE" && /^\/store\/carts\/[^/]+\/line-items\/[^/?]+(\?|$)/.test(req.url);

/**
 * `remove_fail` only bites the DELETE, so the same run can put a real item in
 * the cart first and then fail removing it — a banner over an empty cart would
 * be a picture of nothing.
 */
function activeMode(req) {
  const m = mode();
  if (m === "remove_fail") return isRemoveLineItem(req) ? "backend_error" : "off";
  return isAddLineItem(req) ? m : "off";
}

const server = createServer(async (req, res) => {
  const active = activeMode(req);

  if (active === "hangup") {
    console.log(`[proxy] hangup   ${req.method} ${req.url}`);
    req.socket.destroy();
    return;
  }
  if (active === "out_of_stock" || active === "backend_error") {
    // Shapes copied from what Medusa actually answers: a coded 400 for an
    // oversell, a bare 503 when the service itself is down.
    const [status, payload] =
      active === "out_of_stock"
        ? [400, { code: "insufficient_inventory", type: "invalid_data", message: "Variant does not have the required inventory" }]
        : [503, { message: "Service Unavailable" }];
    console.log(`[proxy] ${active} ${status} ${req.method} ${req.url}`);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
    return;
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];

  try {
    const upstream = await fetch(`${UPSTREAM}${req.url}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
      redirect: "manual",
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    const out = {};
    upstream.headers.forEach((v, k) => {
      if (k !== "content-encoding" && k !== "transfer-encoding" && k !== "content-length") out[k] = v;
    });
    res.writeHead(upstream.status, out);
    res.end(buf);
  } catch (err) {
    console.log(`[proxy] upstream error ${req.method} ${req.url}: ${err.message}`);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "proxy upstream error" }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[proxy] :${PORT} -> ${UPSTREAM} (mode file: ${MODE_FILE})`);
});
