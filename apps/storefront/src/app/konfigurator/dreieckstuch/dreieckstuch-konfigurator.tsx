"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, RotateCcw, Share2, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addConfiguredDreieckstuchToCartAction } from "@/app/cart/actions";

import {
  DREIECKSTUCH_REGIONS,
  type DreieckstuchRegionDef,
  resolveSwatch,
  resolveSwatchId,
  swatchChipStyle,
  swatchesForRegion,
  type Swatch,
} from "./palette";
import { DreieckstuchPhoto, type DreieckstuchPhotoPaints } from "./dreieckstuch-photo";
import { MobilePaletteSheet } from "../_shared/mobile-palette-sheet";
import { SavedConfigsSection } from "../_shared/saved-configs-section";

type Selection = Record<DreieckstuchRegionDef["param"], string>;

function buildSelection(searchParams: URLSearchParams | null): Selection {
  return DREIECKSTUCH_REGIONS.reduce<Selection>((acc, region) => {
    acc[region.param] = resolveSwatchId(searchParams?.get(region.param), region.defaultColor);
    return acc;
  }, {} as Selection);
}

function isDefaultSelection(selection: Selection): boolean {
  return DREIECKSTUCH_REGIONS.every((region) => selection[region.param] === region.defaultColor);
}

export function DreieckstuchKonfigurator() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selection = React.useMemo(() => buildSelection(searchParams), [searchParams]);
  const [lastChanged, setLastChanged] = React.useState<{ region: string; swatch: string } | null>(
    null,
  );
  const [shareStatus, setShareStatus] = React.useState<"idle" | "copied">("idle");

  const paints: DreieckstuchPhotoPaints = React.useMemo(() => {
    const s = resolveSwatch(selection.tuch, "powder-pink");
    return { tuch: { hex: s.hex, textureSrc: s.textureSrc } };
  }, [selection]);

  const updateRegion = React.useCallback(
    (region: DreieckstuchRegionDef, swatch: Swatch) => {
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
    setLastChanged({ region: "Konfiguration", swatch: "zurückgesetzt" });
    setShareStatus("idle");
  }, [pathname, router]);

  const handleShare = React.useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Mein Bilulu-Dreieckstuch", url });
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
    <div className="mx-auto max-w-7xl px-4 pb-[calc(var(--binchen-palette-sheet-h,280px)+2rem)] pt-8 sm:px-6 sm:pt-12 md:pb-20 lg:px-8">
      <header className="max-w-3xl">
        <p className="font-body text-sm font-medium uppercase tracking-widest text-binchen-terracotta-text">
          Konfigurator · MVP
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-binchen-ink sm:text-4xl lg:text-5xl">
          Stell dein Bilulu-Dreieckstuch selbst zusammen
        </h1>
        <p className="mt-4 font-body text-base leading-relaxed text-binchen-ink-muted sm:text-lg">
          Wähle die Farbe für den Hauptstoff. Die Vorschau zeigt deine Auswahl live auf einem
          echten Produktfoto — Stofftextur und Nähte bleiben sichtbar. Den Link kannst du teilen
          und später wieder öffnen.
        </p>
      </header>

      <aside
        role="note"
        aria-label="Hinweis zum Konfigurator"
        className="mt-8 rounded-xl border border-binchen-border bg-binchen-cream-dark px-4 py-3 sm:px-5 sm:py-4"
      >
        <p className="font-body text-sm leading-relaxed text-binchen-ink">
          <span className="font-semibold">Bald mit echten Stoff-Mustern.</span>{" "}
          <span className="text-binchen-ink-muted">
            Derzeit zeigen wir Volltonfarben auf einem echten Bilulu-Dreieckstuch. Sobald die
            Stoffmuster eintreffen, kannst du hier auch Druckmotive auswählen.
          </span>
        </p>
      </aside>

      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {lastChanged ? `${lastChanged.region}: ${lastChanged.swatch}` : ""}
      </span>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
        <section aria-labelledby="preview-heading" className="lg:sticky lg:top-24 lg:self-start">
          <h2 id="preview-heading" className="sr-only">
            Live-Vorschau deines Dreieckstuchs
          </h2>
          <div className="relative overflow-hidden rounded-2xl border border-binchen-border bg-binchen-cream-dark p-6 sm:p-10">
            <div className="mx-auto w-full max-w-md">
              <DreieckstuchPhoto
                paints={paints}
                title="Live-Vorschau des konfigurierten Bilulu-Dreieckstuchs auf Basis eines echten Produktfotos"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <dl className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-2 font-body text-sm sm:flex sm:flex-wrap">
              {DREIECKSTUCH_REGIONS.map((region) => {
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
                  Zurücksetzen
                </Button>
              )}
            </div>
          </div>

          <SavedConfigsSection
            konfigurator="dreieckstuch"
            selection={selection}
            href={(() => {
              const q = searchParams?.toString() ?? "";
              return q ? `${pathname}?${q}` : pathname ?? "/konfigurator/dreieckstuch";
            })()}
          />
        </section>

        <section aria-labelledby="palette-heading" className="space-y-8">
          <h2 id="palette-heading" className="sr-only">
            Farbpalette für jede Region
          </h2>

          {/* Desktop palette — on mobile the sticky bottom-sheet below owns the same picker */}
          <div className="hidden space-y-8 md:block">
          {DREIECKSTUCH_REGIONS.map((region) => {
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
                  aria-label={`Farbe für ${region.label}`}
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
            action={addConfiguredDreieckstuchToCartAction}
            className="rounded-2xl border border-binchen-sage/40 bg-binchen-cream p-5 sm:p-6"
          >
            {DREIECKSTUCH_REGIONS.map((region) => {
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
                return q ? `${pathname}?${q}` : pathname ?? "/konfigurator/dreieckstuch";
              })()}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-lg font-semibold text-binchen-ink">
                  Deine Konfiguration in den Warenkorb
                </p>
                <p className="mt-1 font-body text-sm text-binchen-ink-muted">
                  Handgenäht auf Bestellung. Preis + Versand siehst du im Warenkorb.
                </p>
              </div>
              <Button type="submit" variant="accent" size="lg" className="w-full sm:w-auto">
                <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                In den Warenkorb
              </Button>
            </div>
          </form>

          <p className="font-body text-sm text-binchen-ink-muted">
            Du möchtest lieber eine Hose, einen Turban oder eine Mütze gestalten?{" "}
            <Link
              href="/konfigurator/hose"
              className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 rounded"
            >
              Hose-Konfigurator
            </Link>{" "}
            ·{" "}
            <Link
              href="/konfigurator/turban"
              className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 rounded"
            >
              Turban-Konfigurator
            </Link>{" "}
            ·{" "}
            <Link
              href="/konfigurator/muetze"
              className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 rounded"
            >
              Mützen-Konfigurator
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
        regions={DREIECKSTUCH_REGIONS}
        selection={selection}
        onSelect={(region, swatch) =>
          updateRegion(region as DreieckstuchRegionDef, swatch)
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
