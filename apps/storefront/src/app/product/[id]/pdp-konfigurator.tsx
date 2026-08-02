"use client";

import * as React from "react";
import { Check, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PALETTE, SWATCH_BY_ID } from "@/app/konfigurator/hose/palette";
import type { KonfiguratorProfile, KonfiguratorRegion } from "@/lib/pdp-konfigurator";
import { addConfiguredProductToCartAction } from "@/app/cart/actions";

type Selection = Record<string, string>;

interface PDPKonfiguratorProps {
  productId: string;
  variantId: string;
  profile: KonfiguratorProfile;
}

function initialSelection(profile: KonfiguratorProfile): Selection {
  return profile.regions.reduce<Selection>((acc, region) => {
    acc[region.id] = region.defaultColor;
    return acc;
  }, {});
}

/**
 * Light/dark check icon contrast — cribbed from HoseKonfigurator so the
 * fabric picker looks identical everywhere in the shop.
 */
function swatchTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? "#2C2417" : "#FAF7F2";
}

export function PDPKonfigurator({ productId, variantId, profile }: PDPKonfiguratorProps) {
  const [selection, setSelection] = React.useState<Selection>(() => initialSelection(profile));
  const [lastChanged, setLastChanged] = React.useState<{ region: string; swatch: string } | null>(
    null,
  );

  const updateRegion = React.useCallback((region: KonfiguratorRegion, swatchId: string) => {
    setSelection((prev) => ({ ...prev, [region.id]: swatchId }));
    const name = SWATCH_BY_ID[swatchId]?.name ?? swatchId;
    setLastChanged({ region: region.label, swatch: name });
  }, []);

  return (
    <div className="mt-8 space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-binchen-ink">{profile.headline}</h2>
        <p className="mt-2 font-body text-sm leading-relaxed text-binchen-ink-muted">
          {profile.subline}
        </p>
      </div>

      {/* Live region for screen readers */}
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {lastChanged ? `${lastChanged.region}: ${lastChanged.swatch}` : ""}
      </span>

      <div className="space-y-6">
        {profile.regions.map((region) => {
          const activeId = selection[region.id];
          const activeSwatch = SWATCH_BY_ID[activeId];
          return (
            <fieldset
              key={region.id}
              className="rounded-2xl border border-binchen-border bg-binchen-cream-dark/40 p-4 sm:p-5"
            >
              <legend className="px-2 font-display text-base font-semibold text-binchen-ink sm:text-lg">
                {region.label}
                {activeSwatch ? (
                  <span className="ml-2 font-body text-sm font-normal text-binchen-ink-muted">
                    · {activeSwatch.name}
                  </span>
                ) : null}
              </legend>
              <p className="font-body text-xs text-binchen-ink-muted sm:text-sm">
                {region.description}
              </p>
              <div
                role="radiogroup"
                aria-label={`Stoff für ${region.label}`}
                className="mt-3 grid grid-cols-4 gap-2.5 sm:grid-cols-6"
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
                      onClick={() => updateRegion(region, swatch.id)}
                      className={cn(
                        "group flex flex-col items-center gap-1.5 rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 focus-visible:ring-offset-binchen-cream",
                        isActive && "bg-binchen-cream shadow-sm",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "relative flex h-11 w-11 items-center justify-center rounded-full border-2 transition-transform group-hover:scale-105",
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
                      <span className="text-center font-body text-[11px] leading-tight text-binchen-ink sm:text-xs">
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

      <form action={addConfiguredProductToCartAction} className="space-y-4">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="variantId" value={variantId} />
        <input type="hidden" name="family" value={profile.family} />
        {profile.regions.map((region) => {
          const swatchId = selection[region.id];
          const swatch = SWATCH_BY_ID[swatchId];
          return (
            <React.Fragment key={region.id}>
              <input type="hidden" name={`region.${region.id}.id`} value={region.id} />
              <input type="hidden" name={`region.${region.id}.label`} value={region.label} />
              <input type="hidden" name={`region.${region.id}.swatchId`} value={swatchId} />
              <input
                type="hidden"
                name={`region.${region.id}.swatchName`}
                value={swatch?.name ?? swatchId}
              />
            </React.Fragment>
          );
        })}

        <div className="rounded-xl border border-binchen-terracotta/30 bg-binchen-terracotta/10 px-4 py-3">
          <p className="font-body text-sm leading-relaxed text-binchen-ink">
            <span className="font-semibold text-binchen-terracotta-text">
              Anfertigung auf Bestellung.
            </span>{" "}
            <span className="text-binchen-ink-muted">
              Jedes Stück ist ein Unikat — Nähdauer 5–10 Werktage plus Versand. Deine Stoffwahl geht
              als Anfertigungswunsch an uns und ist im Warenkorb, in der Bestellung und in unserer
              Bestätigungs-Mail sichtbar.
            </span>
          </p>
        </div>

        <Button type="submit" variant="accent" size="lg" className="w-full sm:w-auto">
          <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          Mit meiner Stoffwahl in den Warenkorb
        </Button>
      </form>
    </div>
  );
}
