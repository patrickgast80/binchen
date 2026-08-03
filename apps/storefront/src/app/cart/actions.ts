"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addLineItem,
  getConfiguratorHoseVariant,
  getConfiguratorTurbanVariant,
  removeLineItem,
} from "@/lib/medusa";
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
 * Add a configured Turban-Mütze (from /konfigurator/turban) to the cart.
 * Same shape as the Hose action: fabric selections become line-item metadata
 * so the cart line renders "Turban: Creme · Schleife: Terrakotta"; the variant
 * is resolved server-side (env override or first Turban product).
 */
export async function addConfiguredTurbanToCartAction(formData: FormData): Promise<void> {
  const selection = {
    kind: "konfigurator-turban" as const,
    turban: String(formData.get("turban") ?? "").trim() || null,
    schleife: String(formData.get("schleife") ?? "").trim() || null,
    turbanName: String(formData.get("turbanName") ?? "").trim() || null,
    schleifeName: String(formData.get("schleifeName") ?? "").trim() || null,
    configHref: String(formData.get("configHref") ?? "").trim() || null,
  };

  const target = await getConfiguratorTurbanVariant();
  if (!target) {
    redirect("/konfigurator/turban?error=variant_unavailable");
  }

  const cart = await ensureCart();
  if (!cart) {
    redirect("/konfigurator/turban?error=cart_unavailable");
  }

  const added = await addLineItem(cart!.id, target!.variantId, 1, selection);
  if (!added) {
    redirect("/konfigurator/turban?error=add_failed");
  }

  revalidatePath("/cart");
  redirect("/cart?added=konfigurator");
}
