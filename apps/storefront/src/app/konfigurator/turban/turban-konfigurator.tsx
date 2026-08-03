"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, RotateCcw, Share2, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addConfiguredTurbanToCartAction } from "@/app/cart/actions";

import {
  PALETTE,
  TURBAN_REGIONS,
  type TurbanRegionDef,
  resolveColor,
  resolveSwatchId,
  type Swatch,
} from "./palette";
import { TurbanPhoto, type TurbanPhotoColors } from "./turban-photo";

type Selection = Record<TurbanRegionDef["param"], string>;

function buildSelection(searchParams: URLSearchParams | null): Selection {
  return TURBAN_REGIONS.reduce<Selection>((acc, region) => {
    acc[region.param] = resolveSwatchId(searchParams?.get(region.param), region.defaultColor);
    return acc;
  }, {} as Selection);
}

function isDefaultSelection(selection: Selection): boolean {
  return TURBAN_REGIONS.every((region) => selection[region.param] === region.defaultColor);
}

export function TurbanKonfigurator() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selection = React.useMemo(() => buildSelection(searchParams), [searchParams]);
  const [lastChanged, setLastChanged] = React.useState<{
    region: string;
    swatch: string;
  } | null>(null);
  const [shareStatus, setShareStatus] = React.useState<"idle" | "copied">("idle");

  const colors: TurbanPhotoColors = React.useMemo(
    () => ({
      turban: resolveColor(selection.turban, "cream"),
      schleife: resolveColor(selection.schleife, "terracotta"),
    }),
    [selection],
  );

  const updateRegion = React.useCallback(
    (region: TurbanRegionDef, swatch: Swatch) => {
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
        await navigator.share({ title: "Meine Bilulu-Turban-Mütze", url });
        return;
      }
    } catch {
      // Nutzer hat Share-Dialog abgebrochen — fällt unten auf Clipboard zurück.
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
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12 lg:px-8">
      {/* Page header */}
      <header className="max-w-3xl">
        <p className="font-body text-sm font-medium uppercase tracking-widest text-binchen-terracotta-text">
          Konfigurator · MVP
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-binchen-ink sm:text-4xl lg:text-5xl">
          Stell deine Turban-Mütze selbst zusammen
        </h1>
        <p className="mt-4 font-body text-base leading-relaxed text-binchen-ink-muted sm:text-lg">
          Wähle Farbe und Stil für Turban und Schleife. Deine Auswahl wird live auf einem echten
          Mützenfoto gezeigt und in der Adresse gespeichert — du kannst den Link teilen und später
          wieder öffnen.
        </p>
      </header>

      {/* Hinweis-Banner */}
      <aside
        role="note"
        aria-label="Hinweis zum Konfigurator"
        className="mt-8 rounded-xl border border-binchen-border bg-binchen-cream-dark px-4 py-3 sm:px-5 sm:py-4"
      >
        <p className="font-body text-sm leading-relaxed text-binchen-ink">
          <span className="font-semibold">Bald mit echten Stoff-Mustern.</span>{" "}
          <span className="text-binchen-ink-muted">
            Die Vorschau zeigt deine Farben auf einer echten Bilulu-Turban-Mütze — Stofftextur,
            Raffung und Nähte bleiben sichtbar. Sobald die Stoffmuster eintreffen, kannst du hier
            echte Druckmotive auswählen.
          </span>
        </p>
      </aside>

      {/* Frühchen-Hinweis */}
      <aside
        role="note"
        aria-label="Hinweis zu Frühchengrößen"
        className="mt-4 rounded-xl border border-binchen-terracotta/40 bg-binchen-terracotta/10 px-4 py-3 sm:px-5 sm:py-4"
      >
        <p className="font-body text-sm leading-relaxed text-binchen-ink">
          <span className="font-semibold text-binchen-terracotta-text">Auch für Frühchen.</span>{" "}
          <span className="text-binchen-ink-muted">
            Wir nähen auch Mützchen in Frühchengrößen — Sondermaße auf Anfrage. Mehr Infos auf{" "}
            <Link
              href="/fruehchen"
              className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 rounded"
            >
              der Frühchen-Seite
            </Link>
            .
          </span>
        </p>
      </aside>

      {/* Live region for screen readers */}
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {lastChanged ? `${lastChanged.region}: ${lastChanged.swatch}` : ""}
      </span>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
        {/* Live preview */}
        <section
          aria-labelledby="preview-heading"
          className="lg:sticky lg:top-24 lg:self-start"
        >
          <h2 id="preview-heading" className="sr-only">
            Live-Vorschau deiner Turban-Mütze
          </h2>
          <div className="relative overflow-hidden rounded-2xl border border-binchen-border bg-binchen-cream-dark p-6 sm:p-10">
            <div className="mx-auto w-full max-w-md">
              <TurbanPhoto
                colors={colors}
                title="Live-Vorschau der konfigurierten Turban-Mütze auf Basis eines echten Produktfotos"
              />
            </div>
          </div>

          {/* Selection summary + actions */}
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 font-body text-sm sm:grid-cols-2">
              {TURBAN_REGIONS.map((region) => {
                const swatchId = selection[region.param];
                const swatch = PALETTE.find((s) => s.id === swatchId);
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleShare}
                aria-live="polite"
              >
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
        </section>

        {/* Palette controls */}
        <section aria-labelledby="palette-heading" className="space-y-8">
          <h2 id="palette-heading" className="sr-only">
            Farbpalette für jede Region
          </h2>

          {TURBAN_REGIONS.map((region) => {
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
                  {PALETTE.map((swatch) => {
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
                            isActive
                              ? "border-binchen-ink shadow-inner"
                              : "border-binchen-border",
                          )}
                          style={{ backgroundColor: swatch.hex }}
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

          <form
            action={addConfiguredTurbanToCartAction}
            className="rounded-2xl border border-binchen-sage/40 bg-binchen-cream p-5 sm:p-6"
          >
            {TURBAN_REGIONS.map((region) => {
              const swatchId = selection[region.param];
              const swatch = PALETTE.find((s) => s.id === swatchId);
              return (
                <React.Fragment key={region.param}>
                  <input type="hidden" name={region.param} value={swatchId} />
                  <input
                    type="hidden"
                    name={`${region.param}Name`}
                    value={swatch?.name ?? ""}
                  />
                </React.Fragment>
              );
            })}
            <input
              type="hidden"
              name="configHref"
              value={(() => {
                const q = searchParams?.toString() ?? "";
                return q ? `${pathname}?${q}` : pathname ?? "/konfigurator/turban";
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
            Du möchtest lieber eine Hose, eine Mütze oder ein Dreieckstuch gestalten?{" "}
            <Link
              href="/konfigurator/hose"
              className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 rounded"
            >
              Zum Hose-Konfigurator
            </Link>{" "}
            ·{" "}
            <Link
              href="/konfigurator/muetze"
              className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 rounded"
            >
              Zum Mützen-Konfigurator
            </Link>{" "}
            ·{" "}
            <Link
              href="/konfigurator/dreieckstuch"
              className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 rounded"
            >
              Zum Dreieckstuch-Konfigurator
            </Link>
            . Fragen zu Stoffen oder Sondermaßen?{" "}
            <Link
              href="/contact"
              className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 rounded"
            >
              Schreib uns
            </Link>{" "}
            mit deinem Konfigurations-Link — wir melden uns mit verfügbaren Stoffen.
          </p>
        </section>
      </div>
    </div>
  );
}

/** Helle Farben bekommen dunkles Häkchen, dunkle Farben helles. */
function swatchTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Perceived luminance per Rec. 709
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? "#2C2417" : "#FAF7F2";
}
