const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "";
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (PUBLISHABLE_KEY) h["x-publishable-api-key"] = PUBLISHABLE_KEY;
  return h;
}

// BIL-2400: Medusa v2's default /store/carts response omits line-item totals
// (items.subtotal / items.total / items.original_total). Without explicit
// selection the cart page reads `item.subtotal` as undefined → NaN €.
// See @medusajs/medusa/dist/api/store/carts/query-config.js (defaultStoreCartFields).
// Prefix each field with "+" so it augments the default field list.
const CART_FIELDS = [
  "+items.subtotal",
  "+items.total",
  "+items.original_total",
  "+items.tax_total",
  "+items.discount_total",
].join(",");
function appendCartFields(url: string): string {
  return url.includes("?")
    ? `${url}&fields=${encodeURIComponent(CART_FIELDS)}`
    : `${url}?fields=${encodeURIComponent(CART_FIELDS)}`;
}

export interface MedusaProductImage {
  id?: string;
  url: string;
}

export interface MedusaCalculatedPrice {
  calculated_amount?: number;
  original_amount?: number;
  currency_code?: string;
}

export interface MedusaProductVariant {
  id: string;
  title?: string | null;
  sku: string;
  inventory_quantity: number;
  calculated_price?: MedusaCalculatedPrice | null;
  prices?: { amount: number; currency_code: string }[] | null;
}

export interface MedusaProduct {
  id: string;
  title: string;
  description?: string | null;
  subtitle?: string | null;
  thumbnail: string | null;
  images?: MedusaProductImage[] | null;
  variants: MedusaProductVariant[];
  metadata: {
    sizeLabel?: string;
    ageCategory?: string;
    fabric?: string;
  } | null;
}

export interface ProductsResponse {
  products: MedusaProduct[];
  count: number;
  limit: number;
  offset: number;
}

// BIL-2438: Medusa v2 only returns `variant.calculated_price` when the request
// carries a pricing context (region_id) AND explicitly asks for the field via
// `fields=*variants.calculated_price`. Without both, storefront cards see
// `calculated_price === undefined` and render no price → PAngV compliance gap.
const PRODUCT_PRICE_FIELDS = "*variants.calculated_price";

export async function getProducts(params: {
  size?: string;
  fabric?: string;
  age_category?: string;
  age_min?: string;
  age_max?: string;
  limit?: number;
  offset?: number;
  region_id?: string;
}): Promise<ProductsResponse> {
  if (!BACKEND_URL) {
    return { products: [], count: 0, limit: params.limit ?? 20, offset: params.offset ?? 0 };
  }

  // BIL-2413: do NOT set currency_code on /store/products. Medusa v2 (2.15.5)
  // rejects the field with 400 "Unrecognized fields: 'currency_code'" and the
  // fallback below would then silently render an empty catalog. Prices are
  // resolved via the region_id passed here (falling back to the DE region).
  const url = new URL(`${BACKEND_URL}/store/products`);
  if (params.size) url.searchParams.set("size", params.size);
  if (params.fabric) url.searchParams.set("fabric", params.fabric);
  if (params.age_category) url.searchParams.set("age_category", params.age_category);
  if (params.age_min) url.searchParams.set("age_min", params.age_min);
  if (params.age_max) url.searchParams.set("age_max", params.age_max);
  const regionId = params.region_id ?? (await getDefaultRegionId());
  if (regionId) url.searchParams.set("region_id", regionId);
  url.searchParams.set("fields", PRODUCT_PRICE_FIELDS);
  url.searchParams.set("limit", String(params.limit ?? 20));
  url.searchParams.set("offset", String(params.offset ?? 0));

  const res = await fetch(url.toString(), { headers: authHeaders(), next: { revalidate: 60 } });
  if (res.ok) return res.json();

  // Medusa returns 400/404 when a custom-metadata filter value matches no products
  // (e.g. ?size=999). Surface those as empty results so the catalog renders the
  // empty-state, not the generic error fallback. Keep auth failures loud so a missing
  // publishable key never silently shows an empty catalog across all queries.
  let body: unknown = null;
  try { body = await res.json(); } catch {}
  const errorType = isMedusaErrorBody(body) ? body.type : null;
  const isAuthError =
    res.status === 401 ||
    res.status === 403 ||
    errorType === "not_allowed" ||
    errorType === "unauthorized";
  if (!isAuthError && (res.status === 400 || res.status === 404)) {
    return { products: [], count: 0, limit: params.limit ?? 20, offset: params.offset ?? 0 };
  }
  throw new Error(`Backend error: ${res.status}`);
}

function isMedusaErrorBody(body: unknown): body is { type?: string; message?: string } {
  return typeof body === "object" && body !== null;
}

/**
 * Resolve the base variant used by the Hose-Konfigurator.
 *
 * Preferred: `NEXT_PUBLIC_CONFIGURATOR_HOSE_VARIANT_ID` set to a real variant id
 * (Backend can dedicate a "Konfigurator-Hose" product later). Fallback: pick the
 * first available variant of the first product whose title contains "Pumphose"
 * (BIL-2430 dedicated Konfigurator base) and only then fall back to any
 * "Hose"-titled product, so the flow works against today's seed data without
 * extra backend work.
 */
export async function getConfiguratorHoseVariant(): Promise<
  { variantId: string; productId: string; priceAmount: number; currency: string } | null
> {
  const envVariant = process.env.NEXT_PUBLIC_CONFIGURATOR_HOSE_VARIANT_ID?.trim();
  if (envVariant && BACKEND_URL) {
    // We still need price/currency for display; fall through to product lookup below.
  }
  if (!BACKEND_URL) return null;
  const url = new URL(`${BACKEND_URL}/store/products`);
  url.searchParams.set("limit", "20");
  // BIL-2438: pull calculated_price via pricing context so the konfigurator
  // teaser price is a real number, not the legacy zero-fallback.
  const regionId = await getDefaultRegionId();
  if (regionId) url.searchParams.set("region_id", regionId);
  url.searchParams.set("fields", PRODUCT_PRICE_FIELDS);
  const res = await fetch(url.toString(), { headers: authHeaders(), next: { revalidate: 60 } });
  if (!res.ok) return null;
  const { products } = (await res.json()) as { products: MedusaProduct[] };
  const hose =
    products.find((p) => /pumphose/i.test(p.title)) ??
    products.find((p) => /hose/i.test(p.title)) ??
    products[0];
  if (!hose) return null;
  const variant =
    hose.variants.find((v) => (envVariant ? v.id === envVariant : v.inventory_quantity > 0)) ??
    hose.variants[0];
  if (!variant) return null;
  const price = variantPriceOrNull(variant);
  return {
    variantId: envVariant || variant.id,
    productId: hose.id,
    priceAmount: price?.amount ?? 0,
    currency: price?.currency ?? "EUR",
  };
}

/**
 * Resolve the base variant used by the Turban-Konfigurator — same strategy as
 * the Hose: `NEXT_PUBLIC_CONFIGURATOR_TURBAN_VARIANT_ID` wins, otherwise the
 * first available variant of the first "Turban"-titled product so the flow
 * works against today's catalog without extra backend work.
 */
export async function getConfiguratorTurbanVariant(): Promise<
  { variantId: string; productId: string; priceAmount: number; currency: string } | null
> {
  const envVariant = process.env.NEXT_PUBLIC_CONFIGURATOR_TURBAN_VARIANT_ID?.trim();
  if (!BACKEND_URL) return null;
  const url = new URL(`${BACKEND_URL}/store/products`);
  url.searchParams.set("limit", "50");
  const regionId = await getDefaultRegionId();
  if (regionId) url.searchParams.set("region_id", regionId);
  url.searchParams.set("fields", PRODUCT_PRICE_FIELDS);
  const res = await fetch(url.toString(), { headers: authHeaders(), next: { revalidate: 60 } });
  if (!res.ok) return null;
  const { products } = (await res.json()) as { products: MedusaProduct[] };
  const turban = products.find((p) => /turban/i.test(p.title));
  if (!turban) return null;
  const variant =
    turban.variants.find((v) => (envVariant ? v.id === envVariant : v.inventory_quantity > 0)) ??
    turban.variants[0];
  if (!variant) return null;
  const price = variantPriceOrNull(variant);
  return {
    variantId: envVariant || variant.id,
    productId: turban.id,
    priceAmount: price?.amount ?? 0,
    currency: price?.currency ?? "EUR",
  };
}

export function variantPriceOrNull(
  variant: MedusaProductVariant,
): { amount: number; currency: string } | null {
  const calc = variant.calculated_price?.calculated_amount;
  const legacy = variant.prices?.[0]?.amount;
  const amount = typeof calc === "number" ? calc : legacy;
  if (typeof amount !== "number") return null;
  const currency =
    variant.calculated_price?.currency_code ?? variant.prices?.[0]?.currency_code ?? "EUR";
  return { amount, currency };
}

/**
 * BIL-2438: pick the display price for a product card. Prefers the first
 * in-stock variant so we never advertise the price of a sold-out size, then
 * falls back to any variant so single-variant Unikate still show a price
 * while sold out. Returns null only when no variant carries a resolvable
 * amount (e.g. missing pricing context → callers should show no price rather
 * than "NaN €").
 */
export function productDisplayPrice(
  product: MedusaProduct,
): { amount: number; currency: string } | null {
  const available = product.variants.find((v) => v.inventory_quantity > 0);
  const chosen = available ?? product.variants[0];
  if (!chosen) return null;
  return variantPriceOrNull(chosen);
}

export async function getProduct(id: string): Promise<MedusaProduct | null> {
  if (!BACKEND_URL) return null;
  const url = new URL(`${BACKEND_URL}/store/products/${id}`);
  // BIL-2438: same pricing-context contract as getProducts — without region_id
  // + fields=*variants.calculated_price the PDP variant carries no price.
  const regionId = await getDefaultRegionId();
  if (regionId) url.searchParams.set("region_id", regionId);
  url.searchParams.set("fields", PRODUCT_PRICE_FIELDS);
  const res = await fetch(url.toString(), { headers: authHeaders(), next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as { product: MedusaProduct };
  return data.product ?? null;
}

// ─── Cart ──────────────────────────────────────────────────────────────

export interface CartAddress {
  first_name?: string;
  last_name?: string;
  company?: string | null;
  address_1?: string;
  address_2?: string | null;
  city?: string;
  postal_code?: string;
  country_code?: string;
  phone?: string;
}

export interface CartLineItem {
  id: string;
  product_id: string;
  variant_id: string;
  title: string;
  subtitle?: string | null;
  thumbnail?: string | null;
  quantity: number;
  unit_price: number;
  // BIL-2400: Medusa v2 omits decorated line-item totals unless requested via
  // fields=+items.subtotal etc. Treat as optional so downstream code uses
  // `lineItemSubtotal()` (which falls back to unit_price * quantity).
  subtotal?: number | null;
  total?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface CartShippingMethod {
  id: string;
  shipping_option_id: string;
  name?: string;
  amount: number;
}

export interface Cart {
  id: string;
  email?: string | null;
  currency_code: string;
  region_id: string | null;
  items: CartLineItem[];
  shipping_address?: CartAddress | null;
  billing_address?: CartAddress | null;
  shipping_methods?: CartShippingMethod[];
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  total: number;
}

export interface ShippingOption {
  id: string;
  name: string;
  amount: number;
  price_type?: string;
}

interface Region {
  id: string;
  currency_code: string;
  countries?: { iso_2: string }[];
}

let cachedRegionId: string | null = null;

export async function getDefaultRegionId(): Promise<string | null> {
  if (cachedRegionId) return cachedRegionId;
  if (!BACKEND_URL) return null;
  const res = await fetch(`${BACKEND_URL}/store/regions`, {
    headers: authHeaders(),
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  const { regions } = (await res.json()) as { regions: Region[] };
  const de = regions.find((r) => r.countries?.some((c) => c.iso_2.toLowerCase() === "de"));
  cachedRegionId = de?.id ?? regions[0]?.id ?? null;
  return cachedRegionId;
}

export async function createCart(): Promise<Cart | null> {
  if (!BACKEND_URL) return null;
  const region_id = await getDefaultRegionId();
  const res = await fetch(appendCartFields(`${BACKEND_URL}/store/carts`), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(region_id ? { region_id } : {}),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { cart: Cart };
  return data.cart;
}

export async function getCart(cartId: string): Promise<Cart | null> {
  if (!BACKEND_URL) return null;
  const res = await fetch(appendCartFields(`${BACKEND_URL}/store/carts/${cartId}`), {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as { cart: Cart };
  return data.cart;
}

export async function addLineItem(
  cartId: string,
  variantId: string,
  quantity = 1,
  metadata?: Record<string, unknown>,
): Promise<Cart | null> {
  if (!BACKEND_URL) return null;
  const body: Record<string, unknown> = { variant_id: variantId, quantity };
  if (metadata && Object.keys(metadata).length > 0) body.metadata = metadata;
  const res = await fetch(
    appendCartFields(`${BACKEND_URL}/store/carts/${cartId}/line-items`),
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { cart: Cart };
  return data.cart;
}

export async function removeLineItem(cartId: string, lineId: string): Promise<Cart | null> {
  if (!BACKEND_URL) return null;
  const res = await fetch(
    appendCartFields(`${BACKEND_URL}/store/carts/${cartId}/line-items/${lineId}`),
    {
      method: "DELETE",
      headers: authHeaders(),
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { cart?: Cart; parent?: Cart };
  return data.cart ?? data.parent ?? null;
}

export async function updateCart(
  cartId: string,
  patch: {
    email?: string;
    shipping_address?: CartAddress;
    billing_address?: CartAddress;
  },
): Promise<Cart | null> {
  if (!BACKEND_URL) return null;
  const res = await fetch(appendCartFields(`${BACKEND_URL}/store/carts/${cartId}`), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(patch),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { cart: Cart };
  return data.cart;
}

export async function listShippingOptions(cartId: string): Promise<ShippingOption[]> {
  if (!BACKEND_URL) return [];
  const url = new URL(`${BACKEND_URL}/store/shipping-options`);
  url.searchParams.set("cart_id", cartId);
  const res = await fetch(url.toString(), { headers: authHeaders(), cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { shipping_options: ShippingOption[] };
  return data.shipping_options ?? [];
}

export async function setShippingMethod(
  cartId: string,
  optionId: string,
): Promise<Cart | null> {
  if (!BACKEND_URL) return null;
  const res = await fetch(`${BACKEND_URL}/store/carts/${cartId}/shipping-methods`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ option_id: optionId }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { cart: Cart };
  return data.cart;
}

export interface CompletedOrder {
  id: string;
  display_id?: number;
  email?: string;
  total: number;
  currency_code: string;
}

export async function completeCart(
  cartId: string,
): Promise<{ ok: true; order: CompletedOrder } | { ok: false; reason: string }> {
  if (!BACKEND_URL) return { ok: false, reason: "backend_unavailable" };
  const res = await fetch(`${BACKEND_URL}/store/carts/${cartId}/complete`, {
    method: "POST",
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return { ok: false, reason: `http_${res.status}` };
  const data = (await res.json()) as { type: string; order?: CompletedOrder; cart?: Cart };
  if (data.type === "order" && data.order) return { ok: true, order: data.order };
  return { ok: false, reason: data.type ?? "unknown" };
}

export async function getOrder(orderId: string): Promise<CompletedOrder | null> {
  if (!BACKEND_URL) return null;
  const res = await fetch(`${BACKEND_URL}/store/orders/${orderId}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { order: CompletedOrder };
  return data.order;
}

// ─── Payment Collections ──────────────────────────────────────────────

export interface PaymentSession {
  id: string;
  provider_id: string;
  data: Record<string, unknown>;
}

export interface PaymentCollection {
  id: string;
  payment_sessions?: PaymentSession[];
}

export async function ensurePaymentCollection(cartId: string): Promise<PaymentCollection | null> {
  if (!BACKEND_URL) return null;
  const res = await fetch(`${BACKEND_URL}/store/payment-collections`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ cart_id: cartId }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { payment_collection: PaymentCollection };
  return data.payment_collection ?? null;
}

export async function createPaymentSession(
  collectionId: string,
  providerId: string,
): Promise<PaymentSession | null> {
  if (!BACKEND_URL) return null;
  const res = await fetch(
    `${BACKEND_URL}/store/payment-collections/${collectionId}/payment-sessions`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ provider_id: providerId }),
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { payment_collection: PaymentCollection };
  const sessions = data.payment_collection?.payment_sessions ?? [];
  return sessions.find((s) => s.provider_id === providerId) ?? null;
}

export function formatPrice(amount: number | null | undefined, currency = "EUR"): string {
  // BIL-2400: guard against undefined / NaN so we never render "NaN €" in the UI
  // (a real Abmahnung-risk under § 1 PAngV). Fallback preserves layout without
  // making up a price.
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: (currency || "EUR").toUpperCase(),
  }).format(n);
}

/**
 * Compute an effective line-item subtotal that falls back to unit_price * quantity
 * when Medusa v2 omits the decorated subtotal (see BIL-2400 root cause: default
 * store cart fields exclude items.subtotal). Prefer server-computed subtotal
 * when present because it accounts for adjustments, tax lines, and rounding.
 */
export function lineItemSubtotal(item: CartLineItem): number {
  const server = (item as { subtotal?: unknown }).subtotal;
  if (typeof server === "number" && Number.isFinite(server)) return server;
  const numeric = typeof server === "string" ? Number(server) : NaN;
  if (Number.isFinite(numeric)) return numeric;
  const unit = typeof item.unit_price === "number" ? item.unit_price : Number(item.unit_price);
  const qty = typeof item.quantity === "number" ? item.quantity : Number(item.quantity);
  if (Number.isFinite(unit) && Number.isFinite(qty)) return unit * qty;
  return NaN;
}
