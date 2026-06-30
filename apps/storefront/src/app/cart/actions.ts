"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addLineItem, removeLineItem } from "@/lib/medusa";
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
