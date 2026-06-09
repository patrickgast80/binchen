import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { loadCart } from "@/lib/cart-cookie";
import { listShippingOptions, formatPrice } from "@/lib/medusa";
import { AddressForm } from "./AddressForm";
import { selectShippingAction } from "./actions";

export const metadata: Metadata = {
  title: "Kasse",
  description: "Adresse und Versand auswählen",
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const cart = await loadCart();
  if (!cart || cart.items.length === 0) {
    redirect("/cart");
  }

  const a = cart!.shipping_address ?? {};
  const hasAddress =
    Boolean(a.first_name) &&
    Boolean(a.last_name) &&
    Boolean(a.address_1) &&
    Boolean(a.postal_code) &&
    Boolean(a.city);

  const shippingOptions = hasAddress ? await listShippingOptions(cart!.id) : [];
  const currency = cart!.currency_code;
  const selectedShipping = cart!.shipping_methods?.[0]?.shipping_option_id ?? "";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <nav aria-label="Checkout-Schritte" className="mb-8">
        <ol className="flex items-center gap-2 font-body text-xs text-binchen-ink-muted sm:text-sm">
          <li className="font-semibold text-binchen-ink">1. Adresse & Versand</li>
          <li aria-hidden="true">›</li>
          <li>2. Bezahlung</li>
          <li aria-hidden="true">›</li>
          <li>3. Bestätigung</li>
        </ol>
      </nav>

      <h1 className="font-display text-3xl font-semibold text-binchen-ink sm:text-4xl">Kasse</h1>

      <section aria-labelledby="address-h" className="mt-10">
        <h2 id="address-h" className="font-display text-xl font-semibold text-binchen-ink">
          Lieferadresse
        </h2>
        <p className="mt-1 font-body text-sm text-binchen-ink-muted">
          Wir versenden ausschließlich nach Deutschland.
        </p>
        <div className="mt-6">
          <AddressForm
            defaults={{
              email: cart!.email ?? "",
              first_name: a.first_name ?? "",
              last_name: a.last_name ?? "",
              address_1: a.address_1 ?? "",
              address_2: a.address_2 ?? "",
              postal_code: a.postal_code ?? "",
              city: a.city ?? "",
              phone: a.phone ?? "",
            }}
            hasSavedAddress={hasAddress}
          />
        </div>
      </section>

      {hasAddress ? (
        <section aria-labelledby="shipping-h" className="mt-12">
          <h2 id="shipping-h" className="font-display text-xl font-semibold text-binchen-ink">
            Versandart
          </h2>
          {shippingOptions.length === 0 ? (
            <p className="mt-4 font-body text-sm text-binchen-ink-muted">
              Für deine Adresse ist derzeit kein Versand verfügbar. Bitte prüfe die PLZ oder kontaktiere uns.
            </p>
          ) : (
            <form action={selectShippingAction} className="mt-6 space-y-3">
              <fieldset className="space-y-3">
                <legend className="sr-only">Versandart wählen</legend>
                {shippingOptions.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex cursor-pointer items-center justify-between rounded-lg border border-binchen-border bg-binchen-cream p-4 transition-colors hover:bg-binchen-cream-dark has-[input:checked]:border-binchen-sage has-[input:checked]:ring-2 has-[input:checked]:ring-binchen-sage"
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="option_id"
                        value={opt.id}
                        defaultChecked={opt.id === selectedShipping}
                        required
                        className="h-4 w-4"
                      />
                      <span className="font-body text-sm font-medium text-binchen-ink">{opt.name}</span>
                    </span>
                    <span className="font-body text-sm font-semibold text-binchen-ink">
                      {formatPrice(opt.amount, currency)}
                    </span>
                  </label>
                ))}
              </fieldset>
              <Button type="submit" variant="accent" size="lg" className="w-full sm:w-auto">
                Weiter zur Bezahlung
              </Button>
            </form>
          )}
        </section>
      ) : null}

      <div className="mt-12 border-t border-binchen-border pt-6 text-center">
        <Button asChild variant="ghost">
          <Link href="/cart">← Zurück zum Warenkorb</Link>
        </Button>
      </div>
    </div>
  );
}
