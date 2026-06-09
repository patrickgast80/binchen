import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadCart } from "@/lib/cart-cookie";
import { formatPrice } from "@/lib/medusa";
import { removeFromCartAction } from "./actions";

export const metadata: Metadata = {
  title: "Warenkorb",
  description: "Dein Warenkorb bei Bilulu Handmade",
};

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cart = await loadCart();
  const items = cart?.items ?? [];
  const isEmpty = items.length === 0;
  const currency = cart?.currency_code ?? "eur";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <h1 className="font-display text-3xl font-semibold text-binchen-ink sm:text-4xl">
        Warenkorb
      </h1>

      {isEmpty ? (
        <div className="mt-12 text-center">
          <p className="font-body text-base text-binchen-ink-muted">
            Dein Warenkorb ist leer.
          </p>
          <div className="mt-6">
            <Button asChild variant="accent" size="lg">
              <Link href="/catalog">Kollektion entdecken</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-8 lg:grid lg:grid-cols-[1fr_360px] lg:gap-12">
          <section aria-label="Artikel im Warenkorb">
            <ul role="list" className="divide-y divide-binchen-border border-y border-binchen-border">
              {items.map((item) => (
                <li key={item.id} className="flex gap-4 py-6">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded bg-binchen-border sm:h-24 sm:w-24">
                    {item.thumbnail ? (
                      <Image
                        src={item.thumbnail}
                        alt={item.title}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-2">
                    <div>
                      <h2 className="font-display text-base font-semibold text-binchen-ink">
                        {item.title}
                      </h2>
                      {item.subtitle ? (
                        <p className="mt-0.5 font-body text-sm text-binchen-ink-muted">
                          {item.subtitle}
                        </p>
                      ) : null}
                      <p className="mt-1 font-body text-xs text-binchen-ink-subtle">
                        Unikat — Stückzahl auf 1 begrenzt
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-body text-sm font-semibold text-binchen-ink">
                        {formatPrice(item.subtotal, currency)}
                      </span>
                      <form action={removeFromCartAction.bind(null, item.id)}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          aria-label={`${item.title} entfernen`}
                          className="text-binchen-ink-muted hover:text-binchen-terracotta-text"
                        >
                          Entfernen
                        </Button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <aside aria-label="Zusammenfassung" className="mt-10 lg:mt-0">
            <div className="rounded-lg border border-binchen-border bg-binchen-cream-dark p-6">
              <h2 className="font-display text-lg font-semibold text-binchen-ink">
                Zusammenfassung
              </h2>
              <dl className="mt-4 space-y-3 font-body text-sm">
                <div className="flex justify-between text-binchen-ink-muted">
                  <dt>Zwischensumme</dt>
                  <dd>{formatPrice(cart?.subtotal ?? 0, currency)}</dd>
                </div>
                <div className="flex justify-between text-binchen-ink-muted">
                  <dt>Versand</dt>
                  <dd>
                    {cart && cart.shipping_total > 0
                      ? formatPrice(cart.shipping_total, currency)
                      : "wird im Checkout berechnet"}
                  </dd>
                </div>
                <div className="flex justify-between text-binchen-ink-muted">
                  <dt>USt. enthalten</dt>
                  <dd>{formatPrice(cart?.tax_total ?? 0, currency)}</dd>
                </div>
                <div className="border-t border-binchen-border pt-3" />
                <div className="flex justify-between text-base font-semibold text-binchen-ink">
                  <dt>Gesamt</dt>
                  <dd>{formatPrice(cart?.total ?? 0, currency)}</dd>
                </div>
              </dl>
              <div className="mt-6">
                <Button asChild variant="accent" size="lg" className="w-full">
                  <Link href="/checkout">Zur Kasse</Link>
                </Button>
              </div>
              <p className="mt-3 text-center font-body text-xs text-binchen-ink-subtle">
                Sichere Bezahlung • Versand aus Deutschland
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
