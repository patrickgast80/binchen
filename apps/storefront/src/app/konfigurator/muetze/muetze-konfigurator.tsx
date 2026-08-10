"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, RotateCcw, Share2, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addConfiguredMuetzeToCartAction } from "@/app/cart/actions";

import {
  MUETZE_REGIONS,
  type MuetzeRegionDef,
  resolveSwatch,
  resolveSwatchId,
  swatchChipStyle,
  swatchesForRegion,
  type Swatch,
} from "./palette";
import { MuetzePhoto, type MuetzePhotoPaints } from "./muetze-photo";
import { MobilePaletteSheet } from "../_shared/mobile-palette-sheet";
import { SavedConfigsSection } from "../_shared/saved-configs-section";

type Selection = Record<MuetzeRegionDef["param"], string>;

function buildSelection(searchParams: URLSearchParams | null): Selection {
  return MUETZE_REGIONS.reduce<Selection>((acc, region) => {
    acc[region.param] = resolveSwatchId(searchParams?.get(region.param), region.defaultColor);
    return acc;
  }, {} as Selection);
}

function isDefaultSelection(selection: Selection): boolean {
  return MUETZE_REGIONS.every((region) => selection[region.param] === region.defaultColor);
}

export function MuetzeKonfigurator() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selection = React.useMemo(() => buildSelection(searchParams), [searchParams]);
  const [lastChanged, setLastChanged] = React.useState<{ region: string; swatch: string } | null>(null);
  const [shareStatus, setShareStatus] = React.useState<"idle" | "copied">("idle");

  const paints: MuetzePhotoPaints = React.useMemo(() => {
    const toPaint = (id: string, fallback: string) => {
      const s = resolveSwatch(id, fallback);
      return { hex: s.hex, textureSrc: s.textureSrc };
    };
    return {
      muetze: toPaint(selection.muetze, "sage"),
      futter: toPaint(selection.futter, "powder-pink"),
    };
  }, [selection]);

  const updateRegion = React.useCallback(
    (region: MuetzeRegionDef, swatch: Swatch) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      if (swatch.id === region.defaultColor) {
        next.delete(region.param);
      } else {
        next.set(region.param, swatch.id);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      setLastChanged({ region: region.label, swatch: swatch.name });
      setShareStatus("idle");
    },
    [pathname, router, searchParams],
  );

  const handleReset = React.useCallback(() => {
    router.replace(pathname, { scroll: false });
    setLastChanged({ region: "Konfiguration", swatch: "zurueckgesetzt" });
    setShareStatus("idle");
  }, [pathname, router]);

  const handleShare = React.useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Meine Bilulu-Muetze", url });
        return;
      }
    } catch {
      // abgebrochen
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
      window.setTimeout(() => setShareStatus("idle"), 2500);
    } catch {
      setShareStatus("idle");
    }
  }, []);

  const showReset = !isDefaultSelection(selection);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-[280px] pt-8 sm:px-6 sm:pt-12 md:pb-20 lg:px-8">
      <header className="max-w-3xl">
        <p className="font-body text-sm font-medium uppercase tracking-widest text-binchen-terracotta-text">
          Konfigurator · MVP
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-binchen-ink sm:text-4xl lg:text-5xl">
          Stell deine Bilulu-Muetze selbst zusammen
        </h1>
        <p className="mt-4 font-body text-base leading-relaxed text-binchen-ink-muted sm:text-lg">
          Waehl Farbe fuer Mueetzenstoff und Futter. Die Vorschau zeigt deine Auswahl live auf
          einem echten Produktfoto. Den Link kannst du teilen und spaeter wieder oeffnen.
        </p>
      </header>

      <aside
        role="note"
        aria-label="Hinweis zu Fruehchengroessen"
        className="mt-8 rounded-xl border border-binchen-terracotta/40 bg-binchen-terracotta/10 px-4 py-3 sm:px-5 sm:py-4"
      >
        <p className="font-body text-sm leading-relaxed text-binchen-ink">
          <span className="font-semibold text-binchen-terracotta-text">Auch fuer Fruehchen.</span>{" "}
          <span className="text-binchen-ink-muted">
            Wir naehen auch Muetzchen in Fruehchengroessen — Sondermasse auf Anfrage. Mehr Infos auf{" "}
            <Link
              href="/fruehchen"
              className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 rounded"
            >
              der Fruehchen-Seite
            </Link>
            .
          </span>
        </p>
      </aside>

      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {lastChanged ? `${lastChanged.region}: ${lastChanged.swatch}` : ""}
      </span>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
        <section aria-labelledby="preview-heading" className="lg:sticky lg:top-24 lg:self-start">
          <h2 id="preview-heading" className="sr-only">
            Live-Vorschau deiner Muetze
          </h2>
          <div className="relative overflow-hidden rounded-2xl border border-binchen-border bg-binchen-cream-dark p-6 sm:p-10">
            <div className="mx-auto w-full max-w-md">
              <MuetzePhoto
                paints={paints}
                title="Live-Vorschau der konfigurierten Bilulu-Muetze auf Basis eines echten Produktfotos"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 font-body text-sm sm:grid-cols-2">
              {MUETZE_REGIONS.map((region) => {
                const swatchId = selection[region.param];
                const swatch = resolveSwatch(swatchId, region.defaultColor);
                return (
                  <div key={region.id} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 rounded-full border border-binchen-border"
                      style={{ backgroundColor: swatch?.hex ?? "#FAF7F2" }}
                    />
                    <dt className="text-binchen-ink-muted">{region.label}:</dt>
                    <dd className="font-medium text-binchen-ink">{swatch?.name ?? "—"}</dd>
                  </div>
                );
              })}
            </dl>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleShare} aria-live="polite">
                {shareStatus === "copied" ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Link kopiert
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                    Konfiguration teilen
                  </>
                )}
              </Button>
              {showReset && (
                <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Zuruecksetzen
                </Button>
              )}
            </div>
          </div>

          <SavedConfigsSection
            konfigurator="muetze"
            selection={selection}
            href={(() => {
              const q = searchParams?.toString() ?? "";
              return q ? `${pathname}?${q}` : pathname ?? "/konfigurator/muetze";
            })()}
          />
        </section>

        <section aria-labelledby="palette-heading" className="space-y-8">
          <h2 id="palette-heading" className="sr-only">
            Farbpalette fuer jede Region
          </h2>

          {/* Desktop palette — on mobile the sticky bottom-sheet below owns the same picker */}
          <div className="hidden space-y-8 md:block">
          {MUETZE_REGIONS.map((region) => {
            const activeId = selection[region.param];
            return (
              <fieldset
                key={region.id}
                className="rounded-2xl border border-binchen-border bg-binchen-cream-dark/40 p-5 sm:p-6"
              >
                <legend className="px-2 font-display text-xl font-semibold text-binchen-ink">
                  {region.label}
                </legend>
                <p className="font-body text-sm text-binchen-ink-muted">{region.description}</p>
                <div
                  role="radiogroup"
                  aria-label={`Farbe fuer ${region.label}`}
                  className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-6"
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
                        onClick={() => updateRegion(region, swatch)}
                        className={cn(
                          "group flex flex-col items-center gap-1.5 rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 focus-visible:ring-offset-binchen-cream",
                          isActive && "bg-binchen-cream shadow-sm",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-transform group-hover:scale-105 sm:h-11 sm:w-11",
                            isActive ? "border-binchen-ink shadow-inner" : "border-binchen-border",
                          )}
                          style={swatchChipStyle(swatch)}
                        >
                          {isActive && (
                            <Check
                              className="h-5 w-5 drop-shadow"
                              aria-hidden="true"
                              style={{ color: swatchTextColor(swatch.hex) }}
                            />
                          )}
                        </span>
                        <span className="text-center font-body text-xs leading-tight text-binchen-ink">
                          {swatch.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
          </div>

          <form
            action={addConfiguredMuetzeToCartAction}
            className="rounded-2xl border border-binchen-sage/40 bg-binchen-cream p-5 sm:p-6"
          >
            {MUETZE_REGIONS.map((region) => {
              const swatchId = selection[region.param];
              const swatch = resolveSwatch(swatchId, region.defaultColor);
              return (
                <React.Fragment key={region.param}>
                  <input type="hidden" name={region.param} value={swatchId} />
                  <input type="hidden" name={`${region.param}Name`} value={swatch.name} />
                </React.Fragment>
              );
            })}
            <input
              type="hidden"
              name="configHref"
              value={(() => {
                const q = searchParams?.toString() ?? "";
                return q ? `${pathname}?${q}` : pathname ?? "/konfigurator/muetze";
              })()}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-lg font-semibold text-binchen-ink">
                  Deine Konfiguration in den Warenkorb
                </p>
                <p className="mt-1 font-body text-sm text-binchen-ink-muted">
                  Handgenaecht auf Bestellung. Preis + Versand siehst du im Warenkorb.
                </p>
              </div>
              <Button type="submit" variant="accent" size="lg" className="w-full sm:w-auto">
                <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                In den Warenkorb
              </Button>
            </div>
          </form>

          <p className="font-body text-sm text-binchen-ink-muted">
            Du moechtest lieber eine Hose gestalten?{" "}
            <Link
              href="/konfigurator/hose"
              className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 rounded"
            >
              Hose-Konfigurator
            </Link>
            . Fragen zu Stoffen?{" "}
            <Link
              href="/contact"
              className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 rounded"
            >
              Schreib uns
            </Link>
            .
          </p>
        </section>
      </div>

      <MobilePaletteSheet
        regions={MUETZE_REGIONS}
        selection={selection}
        onSelect={(region, swatch) =>
          updateRegion(region as MuetzeRegionDef, swatch)
        }
      />
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
