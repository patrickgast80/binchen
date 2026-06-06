const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "";
const PUBLISHABLE_KEY = process.env.MEDUSA_PUBLISHABLE_KEY ?? "";

export interface MedusaProduct {
  id: string;
  title: string;
  thumbnail: string | null;
  variants: { sku: string; inventory_quantity: number }[];
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
}): Promise<ProductsResponse> {
  if (!BACKEND_URL) {
    return { products: [], count: 0, limit: params.limit ?? 20, offset: params.offset ?? 0 };
  }

  const url = new URL(`${BACKEND_URL}/store/products`);
  if (params.size) url.searchParams.set("size", params.size);
  if (params.fabric) url.searchParams.set("fabric", params.fabric);
  if (params.age_category) url.searchParams.set("age_category", params.age_category);
  if (params.age_min) url.searchParams.set("age_min", params.age_min);
  if (params.age_max) url.searchParams.set("age_max", params.age_max);
  url.searchParams.set("limit", String(params.limit ?? 20));
  url.searchParams.set("offset", String(params.offset ?? 0));

  const headers: Record<string, string> = {};
  if (PUBLISHABLE_KEY) headers["x-publishable-api-key"] = PUBLISHABLE_KEY;

  const res = await fetch(url.toString(), { headers, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return res.json();
}
