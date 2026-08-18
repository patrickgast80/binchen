import { ErrorBanner } from "@/components/ui/error-banner";
import { OUT_OF_STOCK_COPY } from "@/lib/shop-error-copy";

/**
 * BIL-2516 — the cart's own failures, and the fallback for an add that has no
 * product page to go back to.
 *
 * Two sources:
 *  - `removeFromCartAction` (`cart_unavailable`, `remove_failed`). "Entfernen"
 *    silently doing nothing is its own small betrayal: the piece stays in the
 *    list, so it looks like a misclick and she presses it again.
 *  - `addToCartFromFormAction`, when the submit carried no product id at all
 *    (a hand-made POST). Rare, but the alternative is the silence this ticket
 *    exists to remove.
 */

const GENERIC = {
  title: "Das hat gerade nicht geklappt",
  body:
    "Dein Warenkorb ist unverändert. Bitte lade die Seite neu und versuch es noch einmal. Bleibt es " +
    "dabei, schreib uns kurz an info@bilulu.de — dann kümmern wir uns persönlich darum.",
} as const;

const CART_ERRORS: Record<string, { title: string; body: string }> = {
  out_of_stock: OUT_OF_STOCK_COPY,
  remove_failed: {
    title: "Das Stück konnte nicht entfernt werden",
    body:
      "Es liegt noch im Warenkorb. Bitte lade die Seite neu und versuch es noch einmal — oder schreib " +
      "uns kurz an info@bilulu.de.",
  },
  cart_unavailable: {
    title: "Dein Warenkorb ist gerade nicht erreichbar",
    body:
      "Das liegt an uns, nicht an dir. Bitte versuch es in ein paar Minuten noch einmal — oder schreib " +
      "uns kurz an info@bilulu.de.",
  },
};

export function cartErrorCopy(
  code: string | string[] | undefined,
): { title: string; body: string } | null {
  const raw = Array.isArray(code) ? code[0] : code;
  if (!raw) return null;
  return CART_ERRORS[raw] ?? GENERIC;
}

export function CartErrorBanner({ error }: { error?: string | string[] }) {
  const copy = cartErrorCopy(error);
  if (!copy) return null;
  return <ErrorBanner title={copy.title} body={copy.body} className="mt-6" testId="cart-error" />;
}
