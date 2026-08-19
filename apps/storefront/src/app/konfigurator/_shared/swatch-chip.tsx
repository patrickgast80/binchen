"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { Swatch } from "../hose/palette";

/**
 * BIL-2523 — the round colour/fabric chip in every Konfigurator palette.
 *
 * This used to be a CSS `background-image` (`swatchChipStyle`). A background
 * image cannot be lazy-loaded: the browser fetches it as soon as the element
 * renders, on-screen or not. With 35 fabrics that is ~200 kB downloading in
 * parallel with `base.webp`, which is the LCP element — and on a throttled
 * mobile connection everything shares one pipe, so the palette was measurably
 * pushing the preview photo's own download out. Measured on the live Turban
 * route, base.webp finished at the same millisecond as the LAST JS chunk:
 * nothing was prioritised, the link was simply saturated.
 *
 * `loading="lazy"` alone does NOT fix it, and it is worth writing down why so
 * nobody re-derives it: measured at 390x844 and 1440x900, all 35 chips still
 * requested before any scroll. Chrome's lazy threshold is a distance from the
 * viewport (~1250px, and larger on a slow connection), and the whole palette
 * fits inside it. The attribute is kept because it is correct and starts
 * paying once the palette grows, but the load order is what actually moves:
 * `fetchpriority="low"` puts the chips behind `base.webp`, which carries
 * `fetchpriority="high"`. They still download, they just stop being served
 * ahead of the LCP element on a saturated link.
 *
 * `hex` stays on the wrapper as the background. It is not a placeholder colour
 * but the swatch's actual dominant tone, so before the texture arrives the
 * chip already shows the right colour and only gains detail — the same
 * progressive-enhancement deal the relief layer makes with the CSS zones.
 */
interface SwatchChipProps {
  swatch: Swatch;
  /** Sizing/border classes from the call site — the chip's look is theirs. */
  className?: string;
  /** Usually the active check-mark. Rendered above the texture. */
  children?: React.ReactNode;
}

/**
 * BIL-2526 — die Texturen erst NACH dem `load`-Event anfordern.
 *
 * Warum das noetig wurde: seit das globale CSS inline im <head> steht, malt die
 * Seite ~1,1 s frueher. `loading="lazy"`-Bilder holt der Preload-Scanner nicht,
 * sie starten erst mit dem ersten Layout — und das ist jetzt eben 1,1 s frueher.
 * Live gemessen auf `turban` (35 Chips): erster Chip-Request 2434 ms -> 1471 ms,
 * und `base.webp` (das LCP-Element) wurde dadurch von 2570 ms auf 3210 ms
 * hinausgeschoben. LCP 2924 -> 3245 ms. `hose` mit genau EINEM Chip verbesserte
 * sich im selben Lauf um 623 ms — das ist der Gegenbeweis, dass es die Palette
 * ist und nicht der Tag.
 *
 * `fetchpriority="low"` allein reicht dagegen nicht: auf einer gesaettigten
 * gedrosselten Leitung teilt sich der Stream die Bandbreite trotzdem.
 *
 * Der Verzicht kostet visuell nichts: der Chip traegt den echten Dominantton des
 * Stoffs als Hintergrund (siehe oben), er gewinnt durch die Textur nur Detail.
 * Der Timer ist die Reissleine — bleibt `load` aus (haengender Request), sind
 * die Texturen trotzdem da.
 */
function useAfterPageLoad(fallbackMs = 4000): boolean {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (document.readyState === "complete") {
      setReady(true);
      return;
    }
    const done = () => setReady(true);
    window.addEventListener("load", done, { once: true });
    const timer = window.setTimeout(done, fallbackMs);
    return () => {
      window.removeEventListener("load", done);
      window.clearTimeout(timer);
    };
  }, [fallbackMs]);

  return ready;
}

export function SwatchChip({ swatch, className, children }: SwatchChipProps) {
  // Server und erster Client-Render sind beide `false` — kein Hydration-Mismatch.
  const afterLoad = useAfterPageLoad();
  const src = afterLoad ? (swatch.chipSrc ?? swatch.textureSrc) : null;

  return (
    <span
      aria-hidden="true"
      className={cn("relative overflow-hidden", className)}
      style={{ backgroundColor: swatch.hex }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          role="presentation"
          loading="lazy"
          fetchPriority="low"
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full rounded-[inherit] object-cover"
        />
      ) : null}
      {/* `relative`, and not just DOM order: the texture is absolutely
          positioned, and a positioned element paints above a non-positioned
          sibling whatever the order. Without this the image would cover the
          check-mark and the active swatch would lose its only visual marker. */}
      {children ? <span className="relative flex items-center justify-center">{children}</span> : null}
    </span>
  );
}
