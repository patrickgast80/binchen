/**
 * Customer copy that more than one surface needs — BIL-2516.
 *
 * Each surface keeps its own code→copy map next to the page (see
 * `konfigurator/_shared/konfigurator-error.tsx`, `checkout/payment/checkout-errors.ts`,
 * `product/[id]/product-error.tsx`, `cart/cart-error.tsx`). This file is only
 * for the sentences that must not drift apart between them.
 */

/**
 * Sold out under her hands. Written for the moment it actually happens: a
 * handmade one-off went to somebody a few seconds faster.
 *
 * The point of keeping this in one place is the *anti*-advice — "versuch es
 * gleich noch einmal" is the standard retry line and it is wrong here, because
 * the piece is gone and no amount of clicking brings it back. Whoever adds the
 * next surface that can hit an oversell should inherit that, not re-decide it.
 */
export const OUT_OF_STOCK_COPY = {
  title: "Dieses Einzelstück wurde leider gerade verkauft",
  body:
    "Jedes Teil ist ein handgenähtes Unikat und nur einmal verfügbar — jemand war ein paar Sekunden " +
    "schneller. Schau gern im Shop nach einem anderen Stück oder schreib uns an info@bilulu.de, wenn " +
    "wir dir etwas Ähnliches nähen sollen.",
} as const;
