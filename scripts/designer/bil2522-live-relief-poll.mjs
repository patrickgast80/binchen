// BIL-2522 — poll bilulu.de until the opaque relief maps (main@d403571) are live.
// Verified by md5 of the delivered bytes, not by a deploy header: the header
// says a build finished, the hash says the customer gets THIS file.
import crypto from "node:crypto";
const WANT = {
  hose: "9b4e9a3a6834a67471bef921afb58bc5",
  "hose-kurz": "a21f86048c3a388730f5b0735c47a956",
  muetze: "bff773fa7a790c5f440e5ed4a55e74b4",
  turban: "ba342ecbd85aa3308cb0a755ba44443c",
  dreieckstuch: "bde2380b9fdf5c5770908cd1023c8888",
};
const md5 = (b) => crypto.createHash("md5").update(Buffer.from(b)).digest("hex");
const deadline = Date.now() + 16 * 60 * 1000;
let round = 0;
while (Date.now() < deadline) {
  round++;
  const got = {};
  let ok = 0;
  for (const [k, want] of Object.entries(WANT)) {
    try {
      const r = await fetch(`https://bilulu.de/konfigurator/${k}-foto/relief.webp`, { cache: "no-store" });
      const h = md5(await r.arrayBuffer());
      got[k] = `${r.status} ${h.slice(0, 8)}${h === want ? " OK" : " old"}`;
      if (h === want) ok++;
    } catch (e) {
      got[k] = `ERR ${e.message.slice(0, 30)}`;
    }
  }
  console.log(`[${new Date().toISOString()}] round ${round}: ${ok}/5 live — ${Object.entries(got).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  if (ok === 5) { console.log("ALL FIVE LIVE"); process.exit(0); }
  await new Promise((r) => setTimeout(r, 45000));
}
console.log("TIMEOUT — not all five live within 16 min");
process.exit(1);
