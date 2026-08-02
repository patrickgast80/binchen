"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addLineItem, getConfiguratorHoseVariant, removeLineItem } from "@/lib/medusa";
import { ensureCart, loadCart } from "@/lib/cart-cookie";
import type { KonfiguratorFamily } from "@/lib/pdp-konfigurator";

export async function addToCartAction(variantId: string, quantity = 1): Promise<void> {
  const cart = await ensureCart();
  if (!cart) return;
  await addLineItem(cart.id, variantId, quantity);
  revalidatePath("/cart");
  redirect("/cart");
}

export async function addToCartFromFormAction(formData: FormData): Promise<void> {
  const variantId = String(formData.get("variantId") ?? "").trim();
  if (!variantId) return;
  const rawQty = Number(formData.get("quantity") ?? 1);
  const quantity = Number.isFinite(rawQty) && rawQty >= 1 ? Math.min(99, Math.floor(rawQty)) : 1;
  const cart = await ensureCart();
  if (!cart) return;
  await addLineItem(cart.id, variantId, quantity);
  revalidatePath("/cart");
  redirect("/cart");
}

export async function removeFromCartAction(lineId: string): Promise<void> {
  const cart = await loadCart();
  if (!cart) return;
  await removeLineItem(cart.id, lineId);
  revalidatePath("/cart");
}

/**
 * Add a configured hose (from /konfigurator/hose) to the cart.
 *
 * Reads the three fabric selections from the form (bund/hose/buendchen) and
 * stamps them as line-item metadata so the cart line can render "Bund: Petrol
 * · Hose: Creme · Bündchen: Petrol". The variant is resolved server-side
 * (env-var override or fallback to the first Hose product in the catalog) so
 * the client never handles Medusa variant ids.
 *
 * Legacy 4-region params (links/rechts) still round-trip via shared URLs, but
 * the client normalises them to `hose` before submit — no legacy branch here.
 */
export async function addConfiguredHoseToCartAction(formData: FormData): Promise<void> {
  // Prefer the current `hose` field; fall back to legacy `links` (then
  // `rechts`) if a stale form submits the pre-BIL-2417 field names.
  const hoseId =
    String(formData.get("hose") ?? "").trim() ||
    String(formData.get("links") ?? "").trim() ||
    String(formData.get("rechts") ?? "").trim() ||
    null;
  const hoseName =
    String(formData.get("hoseName") ?? "").trim() ||
    String(formData.get("linksName") ?? "").trim() ||
    String(formData.get("rechtsName") ?? "").trim() ||
    null;

  const selection = {
    kind: "konfigurator-hose" as const,
    bund: String(formData.get("bund") ?? "").trim() || null,
    hose: hoseId,
    buendchen: String(formData.get("buendchen") ?? "").trim() || null,
    bundName: String(formData.get("bundName") ?? "").trim() || null,
    hoseName,
    buendchenName: String(formData.get("buendchenName") ?? "").trim() || null,
    configHref: String(formData.get("configHref") ?? "").trim() || null,
  };

  const target = await getConfiguratorHoseVariant();
  if (!target) {
    redirect("/konfigurator/hose?error=variant_unavailable");
  }

  const cart = await ensureCart();
  if (!cart) {
    redirect("/konfigurator/hose?error=cart_unavailable");
  }

  const added = await addLineItem(cart!.id, target!.variantId, 1, selection);
  if (!added) {
    redirect("/konfigurator/hose?error=add_failed");
  }

  revalidatePath("/cart");
  redirect("/cart?added=konfigurator");
}

/**
 * Add a product with per-article Stoff-Konfigurator selections (BIL-2433).
 *
 * The client posts one `region.{id}.{swatchId|swatchName|label}` field per
 * chosen region (Mütze: aussen/innen, Schal: seite_a/seite_b, Pumphose:
 * buendchen). We collapse those into `metadata.regions[]` so the cart page
 * can render one line per region without having to know the family layout.
 *
 * Product/variant ids come from hidden form fields set on the PDP — the
 * server trusts the variant id but re-derives display info from the metadata
 * only, so a malicious client can't spoof product data.
 */
export async function addConfiguredProductToCartAction(formData: FormData): Promise<void> {
  const variantId = String(formData.get("variantId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const family = String(formData.get("family") ?? "").trim() as KonfiguratorFamily;
  if (!variantId) {
    redirect(productId ? `/product/${productId}?error=variant_missing` : "/catalog");
  }

  // Group the loose region.* form fields into an ordered array so the cart
  // preserves the visual order the customer saw on the PDP.
  const regionMap = new Map<
    string,
    { id: string; label: string; swatchId: string; swatchName: string }
  >();
  const entries = Array.from(formData.entries());
  for (const [key, rawValue] of entries) {
    if (!key.startsWith("region.")) continue;
    const value = typeof rawValue === "string" ? rawValue : "";
    const [, id, prop] = key.split(".");
    if (!id || !prop) continue;
    const existing = regionMap.get(id) ?? {
      id,
      label: id,
      swatchId: "",
      swatchName: "",
    };
    if (prop === "id" && value) existing.id = value;
    else if (prop === "label" && value) existing.label = value;
    else if (prop === "swatchId" && value) existing.swatchId = value;
    else if (prop === "swatchName" && value) existing.swatchName = value;
    regionMap.set(id, existing);
  }
  const regions = Array.from(regionMap.values()).filter((r) => r.swatchId);
  if (regions.length === 0) {
    // Fabric picker submitted with no selections at all (JS off on a browser
    // that also can't run our client component). Fall through to a plain
    // add-to-cart so the customer at least gets the product.
    const cart = await ensureCart();
    if (!cart) redirect(`/product/${productId}?error=cart_unavailable`);
    const added = await addLineItem(cart!.id, variantId, 1);
    if (!added) redirect(`/product/${productId}?error=add_failed`);
    revalidatePath("/cart");
    redirect("/cart");
  }

  const metadata = {
    kind: "pdp-konfigurator" as const,
    family: family || null,
    regions,
    configHref: productId ? `/product/${productId}` : null,
  };

  const cart = await ensureCart();
  if (!cart) redirect(`/product/${productId}?error=cart_unavailable`);
  const added = await addLineItem(cart!.id, variantId, 1, metadata);
  if (!added) redirect(`/product/${productId}?error=add_failed`);

  revalidatePath("/cart");
  redirect("/cart?added=konfigurator");
}
