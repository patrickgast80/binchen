// BIL-2526 — der klassische Weg: `import "./globals.css"`, Next haengt daraus
// ein `<link rel="stylesheet">` in den <head>.
//
// Zwei Faelle benutzen ihn (siehe `resolve.alias` in next.config.mjs):
//   * `next dev` — nur so bleibt HMR fuer Tailwind-Klassen erhalten. Mit der
//     Inline-Variante muesste man nach jeder Klassenaenderung von Hand
//     `pnpm --filter=storefront css:inline` laufen lassen; genau die Falle
//     wollen wir nicht.
//   * `BILULU_INLINE_CSS=0 next build` — Notausstieg. Damit laesst sich ein
//     Production-Build ohne Inline-CSS erzeugen, ohne Code zurueckzunehmen:
//     einmal fuer die A/B-Messung in BIL-2526 benutzt, danach als Rollback-
//     Schalter dokumentiert (infra/RUNBOOK.md).
import "@/app/globals.css";

export function GlobalStyles() {
  return null;
}
