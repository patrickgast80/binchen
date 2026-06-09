import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { loadCart } from "@/lib/cart-cookie";
import { formatPrice } from "@/lib/medusa";
import { completeOrderAction } from "./actions";

export const metadata: Metadata = {
  title: "Bezahlung",
  description: "Bezahlmethode auswählen",
};

export const dynamic = "force-dynamic";

const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

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
  const stripeReady = Boolean(STRIPE_PUBLISHABLE_KEY);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <nav aria-label="Checkout-Schritte" className="mb-8">
        <ol className="flex items-center gap-2 font-body text-xs text-binchen-ink-muted sm:text-sm">
          <li>1. Adresse & Versand</li>
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

          {stripeReady ? (
            <div className="mt-6 rounded-lg border border-binchen-border bg-binchen-cream p-6">
              <p className="font-body text-sm text-binchen-ink-muted">
                Stripe Payment Element wird hier geladen (Visa, Mastercard, SEPA, Klarna).
              </p>
              <p className="mt-3 font-body text-xs text-binchen-ink-subtle">
                Initialisierung erfolgt sobald die Backend-Zahlungssitzung verbunden ist.
              </p>
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-binchen-terracotta/30 bg-binchen-terracotta/5 p-6">
              <p className="font-body text-sm font-semibold text-binchen-ink">
                Zahlungssystem wird gerade eingerichtet
              </p>
              <p className="mt-2 font-body text-sm text-binchen-ink-muted">
                Stripe ist noch nicht konfiguriert. Bitte versuche es in Kürze erneut oder kontaktiere uns,
                falls du sofort bestellen möchtest.
              </p>
              <p className="mt-3 font-body text-xs text-binchen-ink-subtle">
                Hinweis (intern): <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> fehlt in der Umgebung.
              </p>
            </div>
          )}

          {/* Dev-only fallback: complete order without real payment.
              TODO: replace with Stripe confirmPayment once BIL-29 ships keys. */}
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
          <Link href="/checkout">← Zurück zu Adresse & Versand</Link>
        </Button>
      </div>
    </div>
  );
}
