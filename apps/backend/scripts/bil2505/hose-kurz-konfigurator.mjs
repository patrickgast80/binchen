#!/usr/bin/env node
/**
 * BIL-2505 — dediziertes Medusa-Produkt für den Kurze-Hose-Konfigurator.
 *
 * Warum überhaupt: `/konfigurator/hose-kurz` (BIL-2499) fällt mangels eigenem
 * kurz-Produkt auf die Basis der LANGEN Pumphose zurück → Warenkorbzeile 39,00 €,
 * während derselbe Artikel als fertiges Einzelstück im Katalog 28,90 € kostet.
 *
 * Auflösung im Storefront (apps/storefront/src/lib/medusa.ts):
 *   getConfiguratorHoseKurzVariant() : /\bkurz(e|er|es)?\b/i  UND  /konfigurator/i
 *   getConfiguratorHoseVariant()     : /pumphose/i UND /konfigurator/i UND NICHT kurz
 * Der Titel unten trifft damit exakt den kurz-Resolver und lässt den langen in Ruhe.
 * Kein Storefront-Deploy nötig — der Resolver greift das Produkt, sobald es
 * `published` ist (Store-API listet Drafts nicht).
 *
 * Idempotenz (Lens: Idempotency): Auflösung immer über den HANDLE, nie über eine
 * gemerkte id. Zweiter Lauf legt nichts neu an, sondern gleicht Preis/Status ab.
 *
 * Preis-Einheit: Medusa v2 rechnet in MAJOR UNITS. 34.90 heißt 34,90 € — NIE ×100.
 *
 * Aufruf (Dry-Run ist Default, mutiert nichts):
 *   node apps/backend/scripts/bil2505/hose-kurz-konfigurator.mjs --price=34.90
 *   node apps/backend/scripts/bil2505/hose-kurz-konfigurator.mjs --price=34.90 --status=draft --apply
 *   node apps/backend/scripts/bil2505/hose-kurz-konfigurator.mjs --price=34.90 --status=published --apply
 *   node apps/backend/scripts/bil2505/hose-kurz-konfigurator.mjs --delete --apply     # Rollback
 *
 * Rollback: `--delete --apply` entfernt das Produkt; der kurz-Resolver fällt
 * automatisch wieder auf die lange Basis zurück (Zustand vor diesem Ticket).
 * Alternativ reicht `--status=draft --apply` (unsichtbar für die Store-API).
 *
 * Credentials ausschließlich aus infra/.vault/admin-credentials.env (nie im Code).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../..");
const BACKEND = process.env.MEDUSA_URL || "https://api.bilulu.de";

const HANDLE = "bilulu-pumphose-kurz-konfigurator";
const TITLE = "Bilulu-Pumphose kurz (Konfigurator)";
const SKU = "HOSE-KURZ-KONF-BASE";
const VARIANT_TITLE = "Konfigurator-Basis kurz (Größe im Warenkorb)";
const OPTION_TITLE = "Variante";
const OPTION_VALUE = "Konfigurator-Basis kurz";
const SALES_CHANNEL = "Online Store"; // identisch zur langen Konfigurator-Basis
const STOCK_LOCATION = "Binchen Atelier";
const STOCK_QTY = 50; // Maßanfertigung, kein Unikat → darf nicht nach 1 Bestellung ausverkauft sein
const DESCRIPTION =
  "Unsere handgenähte kurze Pumphose aus weichem Bio-Jersey — die Basis unseres " +
  "Farb-Konfigurators für die kurze Länge. Wähle Bund, Hauptteil und Bündchen selbst. " +
  "Standardgrößen 32–104, Sondermaße auf Anfrage.";
// Fotos der bestehenden Pumphose-Serie (gleiche Schnittfamilie). Designer kann
// später kurz-spezifische Aufnahmen nachliefern, ohne dass hier etwas bricht.
const IMAGES = [
  "https://bilulu.de/products/pumphose/pumphose-01.jpg",
  "https://bilulu.de/products/pumphose/pumphose-05.jpg",
];

const args = process.argv.slice(2);
const flag = (name) => args.some((a) => a === `--${name}`);
const value = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const APPLY = flag("apply");
const DELETE = flag("delete");
const STATUS = value("status", "draft");
const PRICE_RAW = value("price");

if (!["draft", "published"].includes(STATUS)) {
  fail("BAD_STATUS", `--status muss draft|published sein, war: ${STATUS}`);
}
if (!DELETE && PRICE_RAW === null) {
  fail("MISSING_PRICE", "--price=<EUR in Major Units, z.B. 34.90> ist Pflicht (Board-Entscheidung BIL-2505).");
}
const PRICE = DELETE ? null : Number(PRICE_RAW);
if (!DELETE && (!Number.isFinite(PRICE) || PRICE <= 0 || PRICE > 200)) {
  fail("BAD_PRICE", `--price unplausibel: ${PRICE_RAW}. Medusa v2 = MAJOR UNITS (34.90 = 34,90 €).`);
}

function fail(code, message) {
  console.error(JSON.stringify({ code, message }, null, 2));
  process.exit(1);
}

function creds() {
  const file = path.join(REPO, "infra/.vault/admin-credentials.env");
  const env = fs.readFileSync(file, "utf8");
  const get = (k) => {
    const m = new RegExp(`^${k}=(.+)$`, "m").exec(env);
    return m ? m[1].trim() : null;
  };
  const email = process.env.MEDUSA_ADMIN_EMAIL || get("MEDUSA_ADMIN_EMAIL");
  const password = process.env.MEDUSA_ADMIN_PASSWORD || get("MEDUSA_ADMIN_PASSWORD");
  if (!email || !password) fail("NO_CREDENTIALS", `Keine Admin-Credentials in ${file}`);
  return { email, password };
}

async function login() {
  const { email, password } = creds();
  const res = await fetch(`${BACKEND}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) fail("AUTH_FAILED", `Admin-Login ${res.status}`);
  return { authorization: `Bearer ${body.token}`, "content-type": "application/json" };
}

async function api(headers, method, route, payload) {
  const res = await fetch(`${BACKEND}${route}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* nicht-JSON Fehlerseite */
  }
  if (!res.ok) {
    fail("MEDUSA_ERROR", `${method} ${route} → ${res.status} ${text.slice(0, 400)}`);
  }
  return json;
}

async function findProduct(headers) {
  const q = await api(
    headers,
    "GET",
    `/admin/products?handle=${HANDLE}&limit=5&fields=id,title,handle,status,*variants,*variants.prices`,
  );
  return (q.products || [])[0] || null;
}

async function main() {
  const headers = await login();
  const existing = await findProduct(headers);

  const plan = {
    backend: BACKEND,
    mode: DELETE ? "delete" : existing ? "update" : "create",
    apply: APPLY,
    handle: HANDLE,
    title: TITLE,
    status: STATUS,
    price_eur_major_units: PRICE,
    existing: existing
      ? {
          id: existing.id,
          status: existing.status,
          prices: (existing.variants?.[0]?.prices || []).map((p) => `${p.amount} ${p.currency_code}`),
        }
      : null,
  };
  console.log("== PLAN ==");
  console.log(JSON.stringify(plan, null, 2));

  if (!APPLY) {
    console.log("\nDry-Run — nichts geändert. Mit --apply ausführen.");
    return;
  }

  if (DELETE) {
    if (!existing) {
      console.log("Nichts zu löschen — Produkt existiert nicht.");
      return;
    }
    await api(headers, "DELETE", `/admin/products/${existing.id}`);
    console.log(`Gelöscht: ${existing.id}. kurz-Resolver fällt auf die lange Basis zurück.`);
    return;
  }

  let productId;
  let variantId;

  if (existing) {
    // Update-Pfad: nur Preis + Status angleichen, Titel/Handle bleiben stabil,
    // damit die Titel-Regex-Auflösung nicht unter uns wegrutscht.
    productId = existing.id;
    const variant = existing.variants?.[0];
    if (!variant) fail("NO_VARIANT", `Produkt ${productId} hat keine Variante.`);
    variantId = variant.id;
    await api(headers, "POST", `/admin/products/${productId}`, { status: STATUS });
    await api(headers, "POST", `/admin/products/${productId}/variants/${variantId}`, {
      prices: [{ currency_code: "eur", amount: PRICE }],
    });
    console.log(`Aktualisiert: ${productId} → status=${STATUS}, Preis=${PRICE} EUR`);
  } else {
    const channels = await api(headers, "GET", "/admin/sales-channels?limit=20");
    const channel = (channels.sales_channels || []).find((c) => c.name === SALES_CHANNEL);
    if (!channel) fail("NO_SALES_CHANNEL", `Sales Channel "${SALES_CHANNEL}" nicht gefunden.`);

    const created = await api(headers, "POST", "/admin/products", {
      title: TITLE,
      handle: HANDLE,
      description: DESCRIPTION,
      status: STATUS,
      thumbnail: IMAGES[0],
      images: IMAGES.map((url) => ({ url })),
      sales_channels: [{ id: channel.id }],
      // Medusa v2 lehnt `POST /admin/products` mit Varianten ohne Options ab
      // ("Product options are not provided for: …"). Die alte lange Basis kam
      // aus dem Seed-Workflow und hat deshalb options: []. Eine einwertige
      // Option ist der kleinste Weg, der die API-Regel erfüllt; der Resolver
      // greift ohnehin variants[0], die echte Auswahl passiert im Konfigurator.
      options: [{ title: OPTION_TITLE, values: [OPTION_VALUE] }],
      metadata: {
        configurator: "hose-kurz",
        made_to_order: true,
        source_issue: "BIL-2505",
      },
      variants: [
        {
          title: VARIANT_TITLE,
          sku: SKU,
          manage_inventory: true,
          allow_backorder: false,
          options: { [OPTION_TITLE]: OPTION_VALUE },
          prices: [{ currency_code: "eur", amount: PRICE }],
        },
      ],
    });
    productId = created.product.id;
    variantId = created.product.variants[0].id;
    console.log(`Angelegt: ${productId} / ${variantId} (status=${STATUS}, ${PRICE} EUR)`);
  }

  // Bestand: Maßanfertigung, kein Unikat. Ohne Level meldet die Store-API 0 und
  // der Konfigurator-Button wäre nach BIL-2500 (Überverkauf-Schutz) tot.
  const items = await api(
    headers,
    "GET",
    `/admin/inventory-items?limit=100&fields=id,sku,*location_levels`,
  );
  const item = (items.inventory_items || []).find((i) => i.sku === SKU);
  if (!item) {
    console.log(`WARN: kein Inventory-Item für SKU ${SKU} gefunden — Bestand manuell prüfen.`);
  } else if ((item.location_levels || []).length === 0) {
    const locations = await api(headers, "GET", "/admin/stock-locations?limit=20");
    const location = (locations.stock_locations || []).find((l) => l.name === STOCK_LOCATION);
    if (!location) fail("NO_STOCK_LOCATION", `Lagerort "${STOCK_LOCATION}" nicht gefunden.`);
    await api(headers, "POST", `/admin/inventory-items/${item.id}/location-levels`, {
      location_id: location.id,
      stocked_quantity: STOCK_QTY,
    });
    console.log(`Bestand gesetzt: ${STOCK_QTY} @ ${STOCK_LOCATION}`);
  } else {
    console.log(
      `Bestand vorhanden: ${item.location_levels.map((l) => l.stocked_quantity).join(",")} — unverändert gelassen.`,
    );
  }

  console.log(JSON.stringify({ ok: true, productId, variantId, status: STATUS, price: PRICE }, null, 2));
}

main().catch((err) => fail("UNEXPECTED", err?.stack || String(err)));
