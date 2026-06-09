import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatPrice, getOrder } from "@/lib/medusa";

export const metadata: Metadata = {
  title: "Bestellung bestätigt",
  description: "Vielen Dank für deine Bestellung bei Bilulu Handmade",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface Props {
  params: { orderId: string };
}

export default async function ConfirmationPage({ params }: Props) {
  const order = await getOrder(params.orderId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <nav aria-label="Checkout-Schritte" className="mb-8">
        <ol className="flex items-center gap-2 font-body text-xs text-binchen-ink-muted sm:text-sm">
          <li>1. Adresse & Versand</li>
          <li aria-hidden="true">›</li>
          <li>2. Bezahlung</li>
          <li aria-hidden="true">›</li>
          <li className="font-semibold text-binchen-ink">3. Bestätigung</li>
        </ol>
      </nav>

      <div className="rounded-2xl border border-binchen-border bg-binchen-cream-dark p-8 text-center sm:p-12">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-binchen-sage/20 text-3xl"
          aria-hidden="true"
        >
          ✓
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold text-binchen-ink sm:text-4xl">
          Vielen Dank für deine Bestellung!
        </h1>
        <p className="mx-auto mt-4 max-w-md font-body text-base text-binchen-ink-muted">
          Wir haben deine Bestellung erhalten und schicken dir gleich eine Bestätigung per E-Mail.
          Jedes Stück wird von Hand gefertigt — wir geben unser Bestes, deine Bestellung zügig zu
          versenden.
        </p>

        {order ? (
          <dl className="mx-auto mt-8 max-w-sm space-y-2 rounded-lg bg-binchen-cream p-5 text-left font-body text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-binchen-ink-muted">Bestellnummer</dt>
              <dd className="font-mono font-medium text-binchen-ink">
                {order.display_id ? `#${order.display_id}` : order.id.slice(0, 8)}
              </dd>
            </div>
            {order.email ? (
              <div className="flex justify-between gap-3">
                <dt className="text-binchen-ink-muted">Bestätigung an</dt>
                <dd className="font-medium text-binchen-ink">{order.email}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 border-t border-binchen-border pt-2">
              <dt className="text-binchen-ink-muted">Gesamt</dt>
              <dd className="font-semibold text-binchen-ink">
                {formatPrice(order.total, order.currency_code)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-6 font-body text-sm text-binchen-ink-muted">
            Bestellreferenz: <span className="font-mono">{params.orderId}</span>
          </p>
        )}

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild variant="accent" size="lg">
            <Link href="/catalog">Weiter stöbern</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">Zur Startseite</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
