"use server";

import { redirect } from "next/navigation";
import { completeCart } from "@/lib/medusa";
import { clearCartId, loadCart } from "@/lib/cart-cookie";

export async function completeOrderAction(): Promise<void> {
  const cart = await loadCart();
  if (!cart) {
    redirect("/cart");
  }
  const result = await completeCart(cart!.id);
  if (!result.ok) {
    redirect(`/checkout/payment?error=${encodeURIComponent(result.reason)}`);
  }
  clearCartId();
  redirect(`/checkout/confirmation/${result.order.id}`);
}
