/**
 * BIL-2502 — German customer copy for every way a checkout completion can fail.
 *
 * The `?error=` code on /checkout/payment comes from three places:
 *   - the Vorkasse server action (payment collection / session setup)
 *   - `completeCart()` in lib/medusa.ts (stable codes, see CompleteCartFailure)
 *   - the PayPal island (`paypal_error`, or the code echoed by
 *     /api/checkout/complete)
 *
 * Rule: a raw Medusa message is never shown to a customer. Medusa answers in
 * English and changes its wording between versions, so anything we do not
 * recognise falls back to `GENERIC`, which names a way out (info@bilulu.de).
 */

export interface CheckoutErrorCopy {
  /** Short headline — what went wrong, in the customer's words. */
  title: string;
  /**
   * What it means and what to do next. Deliberately makes no claim about
   * whether money moved — that depends on the payment method and is added by
   * `paymentReassurance()`.
   */
  body: string;
  /** Whether pressing the button again can plausibly succeed. */
  retryable: boolean;
}

const GENERIC: CheckoutErrorCopy = {
  title: "Die Bestellung konnte nicht abgeschlossen werden",
  body:
    "Da ist bei uns etwas schiefgelaufen. Dein Warenkorb ist noch da. Bitte versuche es in ein paar " +
    "Minuten noch einmal — oder schreib uns kurz an info@bilulu.de, dann kümmern wir uns persönlich darum.",
  retryable: true,
};

const PAYMENT_SETUP: CheckoutErrorCopy = {
  title: "Die Zahlung konnte nicht vorbereitet werden",
  body:
    "Bitte versuche es erneut — dein Warenkorb bleibt erhalten. Klappt es weiterhin nicht, melde dich " +
    "gern unter info@bilulu.de.",
  retryable: true,
};

const CHECKOUT_ERRORS: Record<string, CheckoutErrorCopy> = {
  // Vorkasse server action — payment collection / session could not be created.
  payment_collection_failed: PAYMENT_SETUP,
  payment_session_failed: PAYMENT_SETUP,

  // completeCart() — stable storefront codes.
  out_of_stock: {
    title: "Dieses Einzelstück wurde leider gerade verkauft",
    body:
      "Jedes Teil ist ein handgenähtes Unikat und nur einmal verfügbar — jemand war ein paar Sekunden " +
      "schneller. Schau gern im Shop nach einem anderen Stück oder schreib uns an info@bilulu.de, wenn " +
      "wir dir etwas Ähnliches nähen sollen.",
    retryable: false,
  },
  shipping_unavailable: {
    title: "Für diese Bestellung fehlt gerade eine Versandart",
    body:
      "Bitte geh einen Schritt zurück und wähle den Versand noch einmal aus. Bleibt es dabei, schreib " +
      "uns bitte an info@bilulu.de — wir nehmen deine Bestellung dann direkt auf.",
    retryable: false,
  },
  backend_unavailable: {
    title: "Unser Shop ist gerade kurz nicht erreichbar",
    body:
      "Das liegt an uns, nicht an dir. Dein Warenkorb bleibt erhalten — bitte versuche es in ein paar " +
      "Minuten noch einmal.",
    retryable: true,
  },
  cart_not_completed: GENERIC,
  complete_failed: GENERIC,

  // PayPal island.
  paypal_error: {
    title: "Die Zahlung mit PayPal wurde nicht abgeschlossen",
    body: "Du kannst PayPal noch einmal versuchen oder unten per Vorkasse bestellen.",
    retryable: true,
  },
  payment_failed: PAYMENT_SETUP,
};

/**
 * Map a `?error=` code to customer-facing German copy. Unknown codes — including
 * anything a future backend change might pass through — resolve to `GENERIC`.
 */
export function checkoutErrorCopy(code: string | string[] | undefined): CheckoutErrorCopy | null {
  const raw = Array.isArray(code) ? code[0] : code;
  if (!raw) return null;
  return CHECKOUT_ERRORS[raw] ?? GENERIC;
}

/**
 * The one sentence about money, kept separate from the error copy on purpose.
 *
 * On the Vorkasse path nothing can have been charged — the customer transfers
 * manually afterwards. On the PayPal path the buyer has already approved the
 * order by the time `onApprove` calls /api/checkout/complete, so PayPal may be
 * holding an authorisation. Promising "es wurde nichts abgebucht" there would
 * be a lie, so we say what we actually know.
 */
export function paymentReassurance(via: string | string[] | undefined): string {
  const raw = Array.isArray(via) ? via[0] : via;
  if (raw === "paypal") {
    // No second info@bilulu.de here — every copy that needs a support hand-off
    // already carries one, and repeating it reads as boilerplate.
    return (
      "Falls PayPal den Betrag bereits reserviert hat, wird er wieder freigegeben — es entsteht dir " +
      "keine Zahlung ohne Bestellung."
    );
  }
  return "Es wurde nichts abgebucht.";
}
