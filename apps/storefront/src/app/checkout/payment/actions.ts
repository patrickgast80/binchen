"use server";

import { redirect } from "next/navigation";
import {
  completeCart,
  createPaymentSession,
  ensurePaymentCollection,
} from "@/lib/medusa";
import { clearCartId, loadCart } from "@/lib/cart-cookie";

// BIL-2394 — Complete the order using Medusa's built-in system provider
// (`pp_system_default`), a.k.a. Vorkasse/Überweisung. The provider auto-
// authorizes on session creation, so we just create the session and hand off
// to /store/carts/{id}/complete. Bank-transfer instructions are surfaced on
// the confirmation page + in the order-confirmation email (BIL-32).
export async function completeOfflineOrderAction(): Promise<void> {
  const cart = await loadCart();
  if (!cart) {
    redirect("/cart");
  }

  const collection = await ensurePaymentCollection(cart!.id);
  if (!collection) {
    redirect("/checkout/payment?error=payment_collection_failed");
  }

  const session = await createPaymentSession(collection!.id, "pp_system_default");
  if (!session) {
    redirect("/checkout/payment?error=payment_session_failed");
  }

  const result = await completeCart(cart!.id);
  if (!result.ok) {
    redirect(`/checkout/payment?error=${encodeURIComponent(result.reason)}`);
  }

  clearCartId();
  redirect(`/checkout/confirmation/${result.order.id}?method=offline`);
}
