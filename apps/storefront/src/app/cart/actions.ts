"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addLineItem,
  getConfiguratorBodyVariant,
  getConfiguratorDreieckstuchVariant,
  getConfiguratorHoseKurzVariant,
  getConfiguratorHoseVariant,
  getConfiguratorMuetzeVariant,
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
/**
 * Fabric orientation chosen in the konfigurator (BIL-2492), as a plain number
 * of degrees. Stored on the line item so the cart line and the order Sabine
 * receives say which way the print runs. Anything unexpected collapses to 0 —
 * a hand-crafted POST must not put "90deg please" into an order.
 */
function parseMusterRotation(raw: FormDataEntryValue | null): 0 | 90 | 180 | 270 {
  const n = Number(String(raw ?? "").trim());
  return n === 90 || n === 180 || n === 270 ? n : 0;
}

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
    musterRotation: parseMusterRotation(formData.get("musterRotation")),
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
 * Add a configured SHORT Pumphose (from /konfigurator/hose-kurz) to the cart —
 * BIL-2499.
 *
 * Same three selections as the long Hose, plus an explicit `laenge: "kurz"`.
 * Both configurators currently resolve to the same made-to-order base product,
 * so that field is what tells Sabine which one to sew — it is not decoration.
 */
export async function addConfiguredHoseKurzToCartAction(formData: FormData): Promise<void> {
  const selection = {
    kind: "konfigurator-hose-kurz" as const,
    laenge: "kurz" as const,
    bund: String(formData.get("bund") ?? "").trim() || null,
    hose: String(formData.get("hose") ?? "").trim() || null,
    buendchen: String(formData.get("buendchen") ?? "").trim() || null,
    bundName: String(formData.get("bundName") ?? "").trim() || null,
    hoseName: String(formData.get("hoseName") ?? "").trim() || null,
    buendchenName: String(formData.get("buendchenName") ?? "").trim() || null,
    musterRotation: parseMusterRotation(formData.get("musterRotation")),
    configHref: String(formData.get("configHref") ?? "").trim() || null,
  };

  const target = await getConfiguratorHoseKurzVariant();
  if (!target) {
    redirect("/konfigurator/hose-kurz?error=variant_unavailable");
  }

  const cart = await ensureCart();
  if (!cart) {
    redirect("/konfigurator/hose-kurz?error=cart_unavailable");
  }

  const added = await addLineItem(cart!.id, target!.variantId, 1, selection);
  if (!added) {
    redirect("/konfigurator/hose-kurz?error=add_failed");
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
    musterRotation: parseMusterRotation(formData.get("musterRotation")),
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

/**
 * Add a configured Mütze (from /konfigurator/muetze) to the cart.
 * Same shape as Hose/Turban: selections become line-item metadata so the cart
 * line renders "Mütze: Salbei · Futter: Puderrosa"; the variant is resolved
 * server-side (env override or first non-Turban Mütze product).
 */
export async function addConfiguredMuetzeToCartAction(formData: FormData): Promise<void> {
  const selection = {
    kind: "konfigurator-muetze" as const,
    muetze: String(formData.get("muetze") ?? "").trim() || null,
    futter: String(formData.get("futter") ?? "").trim() || null,
    muetzeName: String(formData.get("muetzeName") ?? "").trim() || null,
    futterName: String(formData.get("futterName") ?? "").trim() || null,
    musterRotation: parseMusterRotation(formData.get("musterRotation")),
    configHref: String(formData.get("configHref") ?? "").trim() || null,
  };

  const target = await getConfiguratorMuetzeVariant();
  if (!target) {
    redirect("/konfigurator/muetze?error=variant_unavailable");
  }

  const cart = await ensureCart();
  if (!cart) {
    redirect("/konfigurator/muetze?error=cart_unavailable");
  }

  const added = await addLineItem(cart!.id, target!.variantId, 1, selection);
  if (!added) {
    redirect("/konfigurator/muetze?error=add_failed");
  }

  revalidatePath("/cart");
  redirect("/cart?added=konfigurator");
}

/**
 * Add a configured Body (from /konfigurator/body) to the cart.
 * Three-zone konfigurator (Hauptteil, Halsbündchen, Ärmelbündchen) — selections
 * become line-item metadata so the cart renders "Hauptteil: Creme · Halsbündchen:
 * Salbei · Ärmelbündchen: Salbei"; the variant is resolved server-side (env
 * override or first Body product in the catalog).
 */
export async function addConfiguredBodyToCartAction(formData: FormData): Promise<void> {
  const selection = {
    kind: "konfigurator-body" as const,
    hauptteil: String(formData.get("hauptteil") ?? "").trim() || null,
    halsbund: String(formData.get("halsbund") ?? "").trim() || null,
    aermelbund: String(formData.get("aermelbund") ?? "").trim() || null,
    hauptteilName: String(formData.get("hauptteilName") ?? "").trim() || null,
    halsbundName: String(formData.get("halsbundName") ?? "").trim() || null,
    aermelbundName: String(formData.get("aermelbundName") ?? "").trim() || null,
    musterRotation: parseMusterRotation(formData.get("musterRotation")),
    configHref: String(formData.get("configHref") ?? "").trim() || null,
  };

  const target = await getConfiguratorBodyVariant();
  if (!target) {
    redirect("/konfigurator/body?error=variant_unavailable");
  }

  const cart = await ensureCart();
  if (!cart) {
    redirect("/konfigurator/body?error=cart_unavailable");
  }

  const added = await addLineItem(cart!.id, target!.variantId, 1, selection);
  if (!added) {
    redirect("/konfigurator/body?error=add_failed");
  }

  revalidatePath("/cart");
  redirect("/cart?added=konfigurator");
}

/**
 * Add a configured Dreieckstuch (from /konfigurator/dreieckstuch) to the cart.
 * Single-zone konfigurator — one fabric selection becomes line-item metadata
 * so the cart line renders "Tuch: Puderrosa"; the variant is resolved
 * server-side (env override or first Dreieckstuch product).
 */
export async function addConfiguredDreieckstuchToCartAction(formData: FormData): Promise<void> {
  const selection = {
    kind: "konfigurator-dreieckstuch" as const,
    tuch: String(formData.get("tuch") ?? "").trim() || null,
    tuchName: String(formData.get("tuchName") ?? "").trim() || null,
    musterRotation: parseMusterRotation(formData.get("musterRotation")),
    configHref: String(formData.get("configHref") ?? "").trim() || null,
  };

  const target = await getConfiguratorDreieckstuchVariant();
  if (!target) {
    redirect("/konfigurator/dreieckstuch?error=variant_unavailable");
  }

  const cart = await ensureCart();
  if (!cart) {
    redirect("/konfigurator/dreieckstuch?error=cart_unavailable");
  }

  const added = await addLineItem(cart!.id, target!.variantId, 1, selection);
  if (!added) {
    redirect("/konfigurator/dreieckstuch?error=add_failed");
  }

  revalidatePath("/cart");
  redirect("/cart?added=konfigurator");
}
