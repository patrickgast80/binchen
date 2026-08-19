// BIL-2527 — Client-seitiger Ersatz fuer `inline-css.ts`.
//
// `next.config.mjs` biegt im Client-Compiler jeden Import von
// `src/generated/inline-css.ts` hierher um. Der Grund steht ausfuehrlich in
// `src/components/layout/global-styles.inline.tsx`: das Stylesheet gehoert ins
// SSR-HTML, aber weder in den RSC-Flight-Payload noch in einen JS-Chunk.
//
// Kein Autogenerat — diese Datei ist von Hand gepflegt und bleibt leer.
export const INLINE_CSS = "";
