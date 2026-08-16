"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  resolveSwatch,
  swatchChipStyle,
  swatchesForRegion,
  type Swatch,
} from "../hose/palette";

export interface MobileRegion {
  /** Matches the URL search-param key (e.g. "bund", "turban", "tuch"). */
  param: string;
  label: string;
  description: string;
  defaultColor: string;
  /** When true, this region's picker includes fabric-print swatches. */
  allowsFabrics?: boolean;
}

interface MobilePaletteSheetProps {
  regions: readonly MobileRegion[];
  selection: Record<string, string>;
  onSelect: (region: MobileRegion, swatch: Swatch) => void;
}

/**
 * CSS variable carrying the sheet's measured height. The configurator pages
 * pad their bottom by this value so page content is never parked underneath
 * the fixed sheet. Falls back to 280px before hydration.
 */
export const PALETTE_SHEET_HEIGHT_VAR = "--binchen-palette-sheet-h";

/**
 * Sticky bottom-sheet used on `<md` screens. The Live-Preview has to stay
 * visible above it — that is the whole point of the configurator.
 *
 * Only the ACTIVE region panel is rendered (BIL-2474). The previous version
 * laid all region panels side by side in a horizontal snap-scroller, so the
 * container inherited the height of the TALLEST panel — "Hose", the only
 * region carrying the fabric swatches (BIL-2455) — and the sheet grew to
 * 711px of an 844px viewport, covering the preview at every scroll position.
 * The tabs were already the primary control, and a horizontal swipe across
 * three unequally tall panels is not a pattern shoppers know (Jakob's Law).
 *
 * The swatch list is additionally capped at 38svh with its own vertical
 * scroll, so a future longer fabric list cannot eat the preview again.
 */
export function MobilePaletteSheet({
  regions,
  selection,
  onSelect,
}: MobilePaletteSheetProps) {
  const [activeIdx, setActiveIdx] = React.useState(0);
  const tabStripRef = React.useRef<HTMLDivElement | null>(null);
  const swatchScrollerRef = React.useRef<HTMLDivElement | null>(null);
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const activeRegion = regions[Math.min(activeIdx, regions.length - 1)];

  // Publish the measured sheet height so the page below can reserve room for
  // it. Height changes with the active tab, so this has to be observed rather
  // than hard-coded (the old hard-coded 280px was off by 431px).
  React.useEffect(() => {
    const el = sheetRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      // Border box, not contentRect — the sheet carries a top border and the
      // iOS safe-area padding, and the page has to clear both.
      root.style.setProperty(
        PALETTE_SHEET_HEIGHT_VAR,
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(PALETTE_SHEET_HEIGHT_VAR);
    };
  }, []);

  const activateRegion = React.useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, regions.length - 1));
      setActiveIdx(clamped);
      // Keep the chip strip scrolled to the chosen region…
      const strip = tabStripRef.current;
      const chip = strip?.children[clamped] as HTMLElement | undefined;
      chip?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
      // …and start the new swatch list at the top instead of inheriting the
      // previous region's scroll offset.
      swatchScrollerRef.current?.scrollTo({ top: 0 });
    },
    [regions.length],
  );

  if (!activeRegion) return null;

  const activeSwatchId = selection[activeRegion.param];

  return (
    <div
      ref={sheetRef}
      className={cn(
        "md:hidden",
        // Fixed bottom-sheet — always pinned to viewport bottom on mobile so
        // the picker is one thumb-swipe away regardless of scroll position.
        // z-30 keeps it below the cookie consent (z-50) but above page content.
        "fixed inset-x-0 bottom-0 z-30",
        "rounded-t-2xl border-t border-binchen-border bg-binchen-cream shadow-[0_-8px_24px_-12px_rgba(44,36,23,0.25)]",
        // Reserve room so the bottom of the palette isn't behind the iOS home indicator.
        "pb-[env(safe-area-inset-bottom,0px)]",
      )}
      role="region"
      aria-label="Farbauswahl-Panel"
    >
      {/* Grip handle — purely visual affordance suggesting a sheet */}
      <div className="flex justify-center pt-2" aria-hidden="true">
        <span className="h-1 w-10 rounded-full bg-binchen-border" />
      </div>

      {/* Region tabs — horizontal snap scroll */}
      <div className="px-4 pt-2">
        <div
          role="tablist"
          aria-label="Region auswählen"
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          ref={tabStripRef}
        >
          {regions.map((region, idx) => {
            const isActive = idx === activeIdx;
            const swatchId = selection[region.param];
            const swatch = resolveSwatch(swatchId, region.defaultColor);
            return (
              <button
                key={region.param}
                id={`mobile-palette-tab-${region.param}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="mobile-palette-panel"
                onClick={() => activateRegion(idx)}
                className={cn(
                  // min-h-11 keeps the chip a 44px tap target (Fitts) — it used
                  // to render 38px tall.
                  "flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border px-3 py-2",
                  "font-body text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 focus-visible:ring-offset-binchen-cream",
                  isActive
                    ? "border-binchen-ink bg-binchen-ink text-binchen-cream"
                    : "border-binchen-border bg-binchen-cream-dark text-binchen-ink",
                )}
              >
                <span
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 rounded-full border border-binchen-border/70"
                  style={swatchChipStyle(swatch)}
                />
                <span className="whitespace-nowrap font-medium">{region.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Only the active region's panel exists — the sheet is as tall as what
          you are actually looking at. */}
      <div
        id="mobile-palette-panel"
        role="tabpanel"
        aria-labelledby={`mobile-palette-tab-${activeRegion.param}`}
        className="mt-2 px-4 pb-4"
      >
        <div className="mb-2 flex items-baseline justify-between">
          <p className="font-body text-xs uppercase tracking-widest text-binchen-ink-muted">
            {activeRegion.label}
          </p>
          <p className="max-w-[70%] truncate font-body text-xs text-binchen-ink-muted">
            {activeRegion.description}
          </p>
        </div>
        <div
          ref={swatchScrollerRef}
          // Hard ceiling so a longer fabric list can never grow the sheet back
          // over the preview. vh first for engines without svh support.
          className="max-h-[38vh] overflow-y-auto overscroll-contain supports-[height:1svh]:max-h-[38svh]"
        >
          <div
            role="radiogroup"
            aria-label={`Farbe für ${activeRegion.label}`}
            className="grid grid-cols-6 gap-2 pb-1"
          >
            {swatchesForRegion(activeRegion).map((swatch) => {
              const isActive = swatch.id === activeSwatchId;
              return (
                <button
                  key={swatch.id}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  aria-label={`${activeRegion.label}: ${swatch.name}`}
                  onClick={() => onSelect(activeRegion, swatch)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg p-1",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 focus-visible:ring-offset-binchen-cream",
                    isActive && "bg-binchen-cream-dark",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative flex h-11 w-11 items-center justify-center rounded-full border-2 transition-transform",
                      isActive ? "border-binchen-ink shadow-inner" : "border-binchen-border",
                    )}
                    style={swatchChipStyle(swatch)}
                  >
                    {isActive && (
                      <Check
                        className="h-4 w-4 drop-shadow"
                        aria-hidden="true"
                        style={{ color: swatchTextColor(swatch.hex) }}
                      />
                    )}
                  </span>
                  <span className="text-center font-body text-[10px] leading-tight text-binchen-ink">
                    {swatch.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* SR-only status region so context is announced when the active tab changes */}
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {`Aktive Region: ${activeRegion.label}`}
      </span>
    </div>
  );
}

function swatchTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? "#2C2417" : "#FAF7F2";
}
