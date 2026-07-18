"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addLineItem, getConfiguratorHoseVariant, removeLineItem } from "@/lib/medusa";
import { ensureCart, loadCart } from "@/lib/cart-cookie";

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
 * Reads the four fabric selections from the form and stamps them as line-item
 * metadata so the cart line can render "Bund: Petrol · Hauptteil links: Creme …".
 * The variant is resolved server-side (env-var override or fallback to the first
 * Hose product in the catalog) so the client never handles Medusa variant ids.
 */
export async function addConfiguredHoseToCartAction(formData: FormData): Promise<void> {
  const selection = {
    kind: "konfigurator-hose" as const,
    bund: String(formData.get("bund") ?? "").trim() || null,
    links: String(formData.get("links") ?? "").trim() || null,
    rechts: String(formData.get("rechts") ?? "").trim() || null,
    buendchen: String(formData.get("buendchen") ?? "").trim() || null,
    bundName: String(formData.get("bundName") ?? "").trim() || null,
    linksName: String(formData.get("linksName") ?? "").trim() || null,
    rechtsName: String(formData.get("rechtsName") ?? "").trim() || null,
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
