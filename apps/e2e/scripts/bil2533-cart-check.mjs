// BIL-2533 — add-to-cart auf der geaenderten Seite (Akzeptanzkriterium 3).
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  try { window.localStorage.setItem("bilulu_cookie_consent_v1", JSON.stringify({version:"1",decidedAt:"2026-01-01T00:00:00.000Z",categories:{strict:true,functional:false,analytics:false,marketing:false}})); } catch {}
});
const p = await ctx.newPage();
const errs = [];
p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto("https://bilulu.de/konfigurator/hose-kurz?hose=stoff-25", { waitUntil: "load", timeout: 90000 });
const btn = p.getByRole("button", { name: /warenkorb|kaufen|hinzuf/i }).first();
await btn.waitFor({ timeout: 20000 });
console.log("Button:", (await btn.textContent())?.trim(), "| enabled:", await btn.isEnabled());
await btn.click();
await p.waitForTimeout(6000);
const body = await p.evaluate(() => document.body.innerText);
const bad = /fehler|leider|nicht verf|problem/i.test(body);
console.log("URL nach Klick:", p.url());
console.log("Fehlertext auf der Seite:", bad);
console.log("console.error:", errs.length, errs.slice(0,3));
const cart = await p.goto("https://bilulu.de/cart", { waitUntil: "load" });
const ct = await p.evaluate(() => document.body.innerText);
console.log("Warenkorb http:", cart.status(), "| enthaelt 'Kurze Hose':", /kurze hose/i.test(ct), "| leer:", /leer/i.test(ct));
await b.close();
