import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { loadCart, readCartId } from "@/lib/cart-cookie";
import { formatPrice, ensurePaymentCollection, createPaymentSession } from "@/lib/medusa";
import { completeOrderAction } from "./actions";
import PayPalButton from "./PayPalButton";

export const metadata: Metadata = {
  title: "Bezahlung",
  description: "Bezahlmethode auswählen",
};

export const dynamic = "force-dynamic";

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";

export default async function PaymentPage() {
  const cart = await loadCart();
  if (!cart || cart.items.length === 0) {
    redirect("/cart");
  }

  const hasAddress = Boolean(cart!.shipping_address?.address_1);
  const hasShipping = (cart!.shipping_methods?.length ?? 0) > 0;

  if (!hasAddress || !hasShipping) {
    redirect("/checkout");
  }

  const currency = cart!.currency_code;
  const paypalReady = Boolean(PAYPAL_CLIENT_ID);

  // Create payment collection + PayPal session server-side so the client
  // island gets a pre-created PayPal Order ID (no client-side order creation).
  let paypalOrderId: string | null = null;
  if (paypalReady) {
    try {
      const collection = await ensurePaymentCollection(cart!.id);
      if (collection) {
        const session = await createPaymentSession(collection.id, "pp_paypal");
        const sessionData = session?.data as { id?: string } | undefined;
        paypalOrderId = sessionData?.id ?? null;
      }
    } catch {
      // Non-fatal: PayPal block hidden if order ID missing
      paypalOrderId = null;
    }
  }

  const cartId = readCartId();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <nav aria-label="Checkout-Schritte" className="mb-8">
        <ol className="flex items-center gap-2 font-body text-xs text-binchen-ink-muted sm:text-sm">
          <li>1. Adresse &amp; Versand</li>
          <li aria-hidden="true">›</li>
          <li className="font-semibold text-binchen-ink">2. Bezahlung</li>
          <li aria-hidden="true">›</li>
          <li>3. Bestätigung</li>
        </ol>
      </nav>

      <h1 className="font-display text-3xl font-semibold text-binchen-ink sm:text-4xl">Bezahlung</h1>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="payment-h">
          <h2 id="payment-h" className="font-display text-xl font-semibold text-binchen-ink">
            Zahlungsmethode
          </h2>

          {paypalReady && paypalOrderId && cartId ? (
            <div className="mt-6 rounded-lg border border-binchen-border bg-binchen-cream p-6">
              <p className="mb-4 font-body text-sm font-semibold text-binchen-ink">
                Mit PayPal bezahlen
              </p>
              <PayPalButton
                clientId={PAYPAL_CLIENT_ID}
                orderId={paypalOrderId}
                cartId={cartId}
              />
            </div>
          ) : paypalReady && (!paypalOrderId || !cartId) ? (
            <div className="mt-6 rounded-lg border border-binchen-terracotta/30 bg-binchen-terracotta/5 p-6">
              <p className="font-body text-sm font-semibold text-binchen-ink">
                PayPal konnte nicht initialisiert werden
              </p>
              <p className="mt-2 font-body text-sm text-binchen-ink-muted">
                Bitte lade die Seite neu oder kontaktiere uns, falls das Problem bestehen bleibt.
              </p>
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-binchen-terracotta/30 bg-binchen-terracotta/5 p-6">
              <p className="font-body text-sm font-semibold text-binchen-ink">
                Zahlungssystem wird gerade eingerichtet
              </p>
              <p className="mt-2 font-body text-sm text-binchen-ink-muted">
                PayPal ist noch nicht konfiguriert. Bitte versuche es in Kürze erneut oder
                kontaktiere uns, falls du sofort bestellen möchtest.
              </p>
            </div>
          )}

          {/* Dev-only fallback: complete order without real payment. */}
          {process.env.NODE_ENV !== "production" ? (
            <form action={completeOrderAction} className="mt-6">
              <Button type="submit" variant="outline" size="sm">
                [DEV] Bestellung ohne Zahlung abschließen
              </Button>
            </form>
          ) : null}
        </section>

        <aside aria-label="Bestellübersicht" className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-binchen-border bg-binchen-cream-dark p-6">
            <h2 className="font-display text-base font-semibold text-binchen-ink">Bestellübersicht</h2>
            <ul role="list" className="mt-4 space-y-3">
              {cart!.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 font-body text-sm">
                  <span className="text-binchen-ink-muted">{item.title}</span>
                  <span className="shrink-0 font-medium text-binchen-ink">
                    {formatPrice(item.subtotal, currency)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-2 border-t border-binchen-border pt-4 font-body text-sm">
              <div className="flex justify-between text-binchen-ink-muted">
                <dt>Zwischensumme</dt>
                <dd>{formatPrice(cart!.subtotal, currency)}</dd>
              </div>
              <div className="flex justify-between text-binchen-ink-muted">
                <dt>Versand</dt>
                <dd>{formatPrice(cart!.shipping_total, currency)}</dd>
              </div>
              <div className="flex justify-between text-binchen-ink-muted">
                <dt>USt. enthalten</dt>
                <dd>{formatPrice(cart!.tax_total, currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-binchen-border pt-3 text-base font-semibold text-binchen-ink">
                <dt>Gesamt</dt>
                <dd>{formatPrice(cart!.total, currency)}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      <div className="mt-10 border-t border-binchen-border pt-6 text-center">
        <Button asChild variant="ghost">
          <Link href="/checkout">← Zurück zu Adresse &amp; Versand</Link>
        </Button>
      </div>
    </div>
  );
}
