import { ErrorBanner } from "@/components/ui/error-banner";

/**
 * BIL-2510 — make a failed "In den Warenkorb" visible on every konfigurator.
 *
 * `apps/storefront/src/app/cart/actions.ts` bounces back here with one of three
 * codes: `variant_unavailable`, `cart_unavailable`, `add_failed`. Until now no
 * page read the param, so a failure looked exactly like a click that did
 * nothing.
 *
 * All three get the same copy, deliberately. The resolvers already retry
 * transient Store-API errors three times with backoff (BIL-2507, main@c294dce);
 * whatever survives that is, from the customer's side, one single event — "geht
 * gerade nicht". Splitting it would only put our vocabulary on her screen.
 *
 * Unknown codes fall back to the same copy rather than to silence: a future
 * code nobody wired up here must not re-create the exact bug this fixes. The
 * raw value is never rendered — it only selects copy.
 */
const RETRY_COPY = {
  title: "Das hat gerade nicht geklappt",
  body:
    "Deine Auswahl ist noch da — wir konnten sie nur gerade nicht in den Warenkorb legen. Bitte " +
    "klick gleich noch einmal auf „In den Warenkorb“. Bleibt es dabei, schreib uns kurz an " +
    "info@bilulu.de — dann nehmen wir deine Bestellung persönlich auf.",
} as const;

export function konfiguratorErrorCopy(
  code: string | string[] | undefined,
): { title: string; body: string } | null {
  const raw = Array.isArray(code) ? code[0] : code;
  if (!raw) return null;
  return RETRY_COPY;
}

/**
 * Renders above the konfigurator itself, inside the same 7xl container so the
 * banner lines up with the headline instead of floating full-bleed. Returns
 * `null` — no wrapper, no padding — on the normal path.
 */
export function KonfiguratorErrorBanner({ error }: { error?: string | string[] }) {
  const copy = konfiguratorErrorCopy(error);
  if (!copy) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12 lg:px-8">
      <ErrorBanner title={copy.title} body={copy.body} testId="konfigurator-error" />
    </div>
  );
}
