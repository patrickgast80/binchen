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
 * Sticky bottom-sheet used on `<md` screens. Live-Preview stays visible above
 * — the sheet occupies ~48% of viewport height, so the top half of the
 * viewport keeps the sticky preview in view (per BIL-2454 spec).
 *
 * The region strip is a horizontal snap-scroll list so single-hand swipes move
 * between regions instead of scrolling a long vertical list.
 */
export function MobilePaletteSheet({
  regions,
  selection,
  onSelect,
}: MobilePaletteSheetProps) {
  const [activeIdx, setActiveIdx] = React.useState(0);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const chipRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const activeRegion = regions[Math.min(activeIdx, regions.length - 1)];

  // Keep the region chip strip in sync with the palette page.
  const activateRegion = React.useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, regions.length - 1));
      setActiveIdx(clamped);
      const scroller = scrollerRef.current;
      if (scroller) {
        const child = scroller.children[clamped] as HTMLElement | undefined;
        child?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      }
    },
    [regions.length],
  );

  // If the palette layout would fit the region count on a single row of chips,
  // no need for snap-scroll cues — but the CSS below stays consistent.
  return (
    <div
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
          ref={scrollerRef}
        >
          {regions.map((region, idx) => {
            const isActive = idx === activeIdx;
            const swatchId = selection[region.param];
            const swatch = resolveSwatch(swatchId, region.defaultColor);
            return (
              <button
                key={region.param}
                ref={(el) => {
                  chipRefs.current[idx] = el;
                }}
                role="tab"
                aria-selected={isActive}
                aria-controls="mobile-palette-panel"
                onClick={() => activateRegion(idx)}
                className={cn(
                  "flex shrink-0 snap-start items-center gap-2 rounded-full border px-3 py-2",
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

      {/* Panel — swipes horizontally between regions via native snap scroll */}
      <div
        id="mobile-palette-panel"
        className="mt-2 flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => {
          const el = e.currentTarget;
          const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (idx !== activeIdx) setActiveIdx(idx);
        }}
      >
        {regions.map((region) => {
          const activeId = selection[region.param];
          return (
            <div
              key={region.param}
              role="tabpanel"
              aria-label={region.label}
              className="w-full shrink-0 snap-start snap-always px-4 pb-4"
            >
              <div className="mb-2 flex items-baseline justify-between">
                <p className="font-body text-xs uppercase tracking-widest text-binchen-ink-muted">
                  {region.label}
                </p>
                <p className="max-w-[70%] truncate font-body text-xs text-binchen-ink-muted">
                  {region.description}
                </p>
              </div>
              <div
                role="radiogroup"
                aria-label={`Farbe für ${region.label}`}
                className="grid grid-cols-6 gap-2"
              >
                {swatchesForRegion(region).map((swatch) => {
                  const isActive = swatch.id === activeId;
                  return (
                    <button
                      key={swatch.id}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      aria-label={`${region.label}: ${swatch.name}`}
                      onClick={() => onSelect(region, swatch)}
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
          );
        })}
      </div>

      {/* SR-only status region so context is announced when the active tab changes */}
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {activeRegion ? `Aktive Region: ${activeRegion.label}` : ""}
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
