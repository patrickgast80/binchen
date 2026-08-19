// BIL-2526 — Production-Variante: das komplette Stylesheet steht inline im
// <head>, es gibt keinen `<link rel="stylesheet">` mehr.
//
// Rechnung (Lighthouse 12.8.2, mobil, `devtools`-Throttling 1474 Kbps / CPU 4x):
//   vorher  Dokument fertig 749 ms -> CSS-Request 763..1673 ms (911 ms fuer
//           7 KiB, weil parallel ~135 KiB async-JS + 56 KiB LCP-Bild durch
//           dieselbe Leitung gehen) -> erster Frame 2675 ms.
//   nachher CSS kommt mit dem Dokument. Das Dokument waechst um ~5 KiB gzip
//           (~30 ms Uebertragung), spart aber den kompletten zweiten Request.
//
// `precedence` ist kein Deko-Attribut: damit hebt React den Style-Tag
// zuverlaessig in den <head> (Float), statt ihn an der Einbau-Stelle im Body
// stehen zu lassen. Die React-18-Typen kennen das Attribut noch nicht, deshalb
// der Umweg ueber ein Props-Objekt statt eines `as any` am ganzen Element.
//
// Der Text kommt aus `src/generated/inline-css.ts`, erzeugt von
// `scripts/build-inline-css.mjs` (laeuft als `prebuild`). Er stammt aus
// derselben PostCSS/Tailwind/cssnano-Kette wie das Stylesheet, das `next build`
// sonst schreiben wuerde — kein zweiter Style-Dialekt.
import { INLINE_CSS } from "@/generated/inline-css";

const floatProps: Record<string, string> = {
  precedence: "next",
  href: "bilulu-globals",
};

export function GlobalStyles() {
  return <style {...floatProps} dangerouslySetInnerHTML={{ __html: INLINE_CSS }} />;
}
