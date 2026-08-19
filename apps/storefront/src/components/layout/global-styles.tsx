// BIL-2526 — Einstiegspunkt fuer die globalen Styles.
//
// Standard-Aufloesung ist die Inline-Variante: das ist der Pfad, der live geht,
// und er kommt ohne Alias-Magie aus. `next.config.mjs` biegt diesen Import nur
// in zwei Faellen auf `./global-styles.linked` um — `next dev` (HMR) und
// `BILULU_INLINE_CSS=0` (Rollback/A-B-Messung).
export { GlobalStyles } from "./global-styles.inline";
