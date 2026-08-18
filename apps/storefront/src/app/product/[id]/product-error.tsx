import Link from "next/link";

import { ErrorBanner } from "@/components/ui/error-banner";
import { OUT_OF_STOCK_COPY } from "@/lib/shop-error-copy";

/**
 * BIL-2516 — make a failed "In den Warenkorb" visible on the product page.
 *
 * `app/cart/actions.ts` bounces back here with one of: `out_of_stock`,
 * `backend_unavailable`, `add_failed`, `cart_unavailable`, `no_variant`.
 * Until now none of them existed: the action either returned without
 * navigating (nothing happened at all) or redirected to an empty `/cart` that
 * looked like success. The second one is why this is not just cosmetics —
 * believing a Unikat is reserved when it is not loses it to the next customer.
 *
 * Unlike the konfigurators (BIL-2510), the codes are *not* collapsed into one
 * message. Catalog products are real single pieces, so an oversell has to say
 * "das Stück ist weg" and never "klick gleich noch einmal" — that would send
 * her back to a button that cannot work.
 */

const RETRY_COPY = {
  title: "Das hat gerade nicht geklappt",
  body:
    "Wir konnten das Stück gerade nicht in den Warenkorb legen — es liegt an uns, nicht an dir. " +
    "Bitte klick gleich noch einmal auf „In den Warenkorb“. Bleibt es dabei, schreib uns kurz an " +
    "info@bilulu.de — dann nehmen wir deine Bestellung persönlich auf.",
} as const;

const NO_VARIANT_COPY = {
  title: "Bitte wähle zuerst eine Variante",
  body:
    "Zu diesem Stück gibt es mehrere Varianten. Wähle unten eine aus und leg es dann in den " +
    "Warenkorb.",
} as const;

export function productErrorCopy(
  code: string | string[] | undefined,
): { title: string; body: string; soldOut: boolean } | null {
  const raw = Array.isArray(code) ? code[0] : code;
  if (!raw) return null;
  if (raw === "out_of_stock") return { ...OUT_OF_STOCK_COPY, soldOut: true };
  if (raw === "no_variant") return { ...NO_VARIANT_COPY, soldOut: false };
  // Anything unrecognised gets the retry copy, never silence — a future code
  // nobody wired up here must not re-create the exact bug this fixes. The raw
  // value only selects copy, it is never rendered.
  return { ...RETRY_COPY, soldOut: false };
}

/**
 * Rendered in the product column immediately above the add-to-cart form — see
 * the note at that call site for why the top of the page is the wrong place on
 * mobile. Returns `null` (no wrapper, no spacing) on the normal path, which is
 * every visit but this one.
 */
export function ProductErrorBanner({ error }: { error?: string | string[] }) {
  const copy = productErrorCopy(error);
  if (!copy) return null;

  return (
    <ErrorBanner title={copy.title} body={copy.body} className="mt-8" testId="product-error">
      {copy.soldOut ? (
        <Link
          href="/catalog"
          className="mt-3 inline-block font-body text-sm font-medium text-binchen-terracotta-text underline underline-offset-4"
        >
          Weitere Unikate ansehen
        </Link>
      ) : null}
    </ErrorBanner>
  );
}
