const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "";
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (PUBLISHABLE_KEY) h["x-publishable-api-key"] = PUBLISHABLE_KEY;
  return h;
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
  // resolved via the region_id (or the publishable key's default region).
  const url = new URL(`${BACKEND_URL}/store/products`);
  if (params.size) url.searchParams.set("size", params.size);
  if (params.fabric) url.searchParams.set("fabric", params.fabric);
  if (params.age_category) url.searchParams.set("age_category", params.age_category);
  if (params.age_min) url.searchParams.set("age_min", params.age_min);
  if (params.age_max) url.searchParams.set("age_max", params.age_max);
  if (params.region_id) url.searchParams.set("region_id", params.region_id);
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

export async function getProduct(id: string): Promise<MedusaProduct | null> {
  if (!BACKEND_URL) return null;
  const url = new URL(`${BACKEND_URL}/store/products/${id}`);
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
  subtotal: number;
  total: number;
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
  const res = await fetch(`${BACKEND_URL}/store/carts`, {
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
  const res = await fetch(`${BACKEND_URL}/store/carts/${cartId}`, {
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
): Promise<Cart | null> {
  if (!BACKEND_URL) return null;
  const res = await fetch(`${BACKEND_URL}/store/carts/${cartId}/line-items`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ variant_id: variantId, quantity }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { cart: Cart };
  return data.cart;
}

export async function removeLineItem(cartId: string, lineId: string): Promise<Cart | null> {
  if (!BACKEND_URL) return null;
  const res = await fetch(`${BACKEND_URL}/store/carts/${cartId}/line-items/${lineId}`, {
    method: "DELETE",
    headers: authHeaders(),
    cache: "no-store",
  });
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
  const res = await fetch(`${BACKEND_URL}/store/carts/${cartId}`, {
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

export function formatPrice(amount: number, currency = "EUR"): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}
