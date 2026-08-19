"use client";

import * as React from "react";

import { LabelOverlay, SheenOverlay, ZoneOverlay, type ZonePaint } from "../_shared/zone-overlay";
import { ReliefFabricLayer, useReliefTakeover } from "../_shared/relief-layer";

export interface ShortsPhotoPaints {
  bund: ZonePaint;
  hose: ZonePaint;
  buendchen: ZonePaint;
}

interface ShortsPhotoProps {
  paints: ShortsPhotoPaints;
  title?: string;
  className?: string;
}

/**
 * Live-Vorschau der kurzen Pumphose "Dinos" — BIL-2499.
 *
 * Gleicher Blend-Stack wie bei der langen Hose: neutrale Foto-Basis, pro Zone
 * ein `mask-image`-DIV mit `mix-blend-mode: multiply`, danach die Screen-Sheen
 * für dunkle Farben. Neu ist die letzte Ebene: das eingenähte
 * "made with love"-Schildchen am Bund wird ganz oben mit den Originalpixeln
 * neu gezeichnet, damit es in JEDER Farb-/Stoffkombination unverändert bleibt
 * (Board-Auflage). Die Zonenmasken sparen das Schildchen ohnehin mit 3px Rand
 * aus — diese Ebene macht die Zusage unabhängig von den Masken.
 *
 * BIL-2522 — auf einen gewählten Stoff kommt zusätzlich die Relief-Ebene, damit
 * das Muster der Faltengeometrie folgt und um die Ballonbeine rollt, statt als
 * flache Kachel darüberzuliegen. Sie liegt über dem Sheen und unter dem
 * Schildchen: das Schildchen bleibt damit auch hier die oberste Ebene und in
 * jeder Stoffkombination unverändert (Board-Auflage aus BIL-2499).
 *
 * Assets: scripts/bil2499-build-dinoshorts-assets.mjs → /konfigurator/hose-kurz-foto/,
 * relief.webp aus scripts/bil2522-build-relief.mjs.
 */
const ASSET_BASE = "/konfigurator/hose-kurz-foto";
// Muss der realen Assetgröße folgen (siehe registry.ts) — sonst driften die
// Overlays gegen das `object-fit: contain`-Bild.
const ASSET_W = 900;
const ASSET_H = 750;

const ZONES = [
  { zone: "bund", mask: `${ASSET_BASE}/mask-bund.webp` },
  { zone: "hose", mask: `${ASSET_BASE}/mask-hose.webp` },
  { zone: "buendchen", mask: `${ASSET_BASE}/mask-buendchen.webp` },
] as const;

export function ShortsPhoto({
  paints,
  title = "Vorschau der kurzen Hose",
  className,
}: ShortsPhotoProps) {
  const zoneSpecs = React.useMemo(
    () =>
      ZONES.map(({ zone, mask }) => ({
        zone,
        maskSrc: mask,
        paint: paints[zone as keyof ShortsPhotoPaints],
      })),
    [paints],
  );
  const { takenOver, onReady } = useReliefTakeover(zoneSpecs);

  return (
    <div
      role="img"
      aria-label={title}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${ASSET_W} / ${ASSET_H}`,
        isolation: "isolate",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${ASSET_BASE}/base.webp`}
        alt=""
        role="presentation"
        width={ASSET_W}
        height={ASSET_H}
        loading="eager"
        decoding="async"
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
      {zoneSpecs.map((spec) => (
        <ZoneOverlay
          key={spec.zone}
          src={spec.maskSrc}
          paint={spec.paint}
          ratio={ASSET_W / ASSET_H}
          hidden={takenOver.has(spec.zone)}
        />
      ))}
      <SheenOverlay src={`${ASSET_BASE}/highlight.webp`} />
      <ReliefFabricLayer
        assetBase={ASSET_BASE}
        width={ASSET_W}
        height={ASSET_H}
        zones={zoneSpecs}
        onReady={onReady}
      />
      <LabelOverlay src={`${ASSET_BASE}/label.webp`} />
    </div>
  );
}
