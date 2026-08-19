"use client";

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
//
// ---------------------------------------------------------------------------
// BIL-2527 — warum das hier `"use client"` ist, obwohl nichts davon interaktiv
// ist.
//
// Als Server-Komponente landete das Stylesheet ZWEIMAL im Dokument: einmal als
// echter `<style>`-Tag (32 KiB, den malt der Browser) und ein zweites Mal als
// escapter JS-String im RSC-Flight-Payload
// (`self.__next_f.push([1,"*,:after,:before{--tw-…"])`, 32,6 KiB). Der Payload
// ist der serialisierte Server-Baum — was eine Server-Komponente rendert, steht
// da drin, auch reiner Text. Live nachgemessen am Dokument von
// `/konfigurator/turban`: 169 KiB gesamt, davon 44 KiB Inline-Skript, und
// 32,6 KiB dieser 44 KiB waren genau diese Kopie. Auf JEDER Route, denn das
// haengt im Root-Layout.
//
// Bei einer Client-Komponente enthaelt der Payload nur die Modul-Referenz. Das
// SSR-HTML entsteht trotzdem — Client-Komponenten werden serverseitig gerendert
// — der `<style>`-Tag im <head> bleibt also unveraendert, und damit auch FCP.
//
// Damit der Text nicht stattdessen im Client-Bundle landet (dieselben Bytes,
// nur in einem JS-Chunk), ersetzt `next.config.mjs` das Modul
// `src/generated/inline-css.ts` im **Client**-Compiler durch
// `inline-css.client.ts` (leerer String). Server: voller Text -> HTML.
// Client: leer -> nichts zu parsen.
//
// Beim Hydrieren ist das kein Mismatch, sondern der dokumentierte Float-Pfad:
// React verwaltet `<style precedence href>` als Ressource und erkennt den
// bereits im <head> stehenden Tag an seinem `data-href` wieder. Es adoptiert
// ihn und ruehrt seinen Inhalt nicht an, statt ihn neu zu schreiben. Genau das
// prueft `apps/e2e/scripts/bil2527-hydration-check.mjs` gegen den echten
// Browser (Regelanzahl im CSSOM + Konsole), damit niemand das aus der
// Dokumentation glauben muss.
import { INLINE_CSS } from "@/generated/inline-css";

const floatProps: Record<string, string> = {
  precedence: "next",
  href: "bilulu-globals",
};

export function GlobalStyles() {
  return <style {...floatProps} dangerouslySetInnerHTML={{ __html: INLINE_CSS }} />;
}
