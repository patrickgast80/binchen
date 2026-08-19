"use client";

import * as React from "react";

import { SheenOverlay, ZoneOverlay, type ZonePaint } from "../_shared/zone-overlay";
import { ReliefFabricLayer, useReliefTakeover } from "../_shared/relief-layer";

export interface PantsPhotoPaints {
  bund: ZonePaint;
  hose: ZonePaint;
  buendchen: ZonePaint;
}

interface PantsPhotoProps {
  paints: PantsPhotoPaints;
  title?: string;
  className?: string;
}

/**
 * Fotorealistische Konfigurator-Vorschau: eine echte Pumphose (freigestellt,
 * entsättigt) als Basis, überlagert mit drei einfärbbaren Zonen. Jede Zone
 * ist ein absolut positioniertes DIV, dessen `mask-image` die Zonenform aus
 * dem Foto ausschneidet und dessen Hintergrundfarbe (oder Stoff-Foto) per
 * `mix-blend-mode: multiply` mit den Graustufen der Basis multipliziert
 * wird. Dadurch bleiben Stofftextur, Faltenwurf und Nähte sichtbar.
 *
 * BIL-2522 — gewählte Stoffe rendert zusätzlich die Relief-Ebene: das Muster
 * folgt der Faltengeometrie und reagiert auf Licht. Sie liegt bewusst ÜBER
 * dem Sheen (der ist ein breiter weißer Screen-Fleck für dunkle Uni-Farben und
 * würde einen Druck über eine halbe Hose entsättigen) und schaltet die
 * CSS-Zone erst ab, wenn sie wirklich gemalt hat.
 *
 * Assets werden von scripts/bil2417-build-assets.mjs aus dem Basisfoto
 * pumphose-05.jpg erzeugt und liegen unter /konfigurator/hose-foto/;
 * relief.webp kommt aus scripts/bil2522-build-relief.mjs.
 */
const ASSET_BASE = "/konfigurator/hose-foto";
const ASSET_W = 900;
// BIL-2473: 1006, was 1005 — the silhouette de-speckle shifted the garment
// bbox by one source row, so the crop is one px taller. Must track the real
// asset height or the `aspectRatio` box and the `object-fit: contain` image
// disagree and the overlays drift off their zones.
const ASSET_H = 1006;

const ZONES = [
  { zone: "bund", mask: `${ASSET_BASE}/mask-bund.webp` },
  { zone: "hose", mask: `${ASSET_BASE}/mask-hose.webp` },
  { zone: "buendchen", mask: `${ASSET_BASE}/mask-buendchen.webp` },
] as const;

export function PantsPhoto({ paints, title = "Hose-Vorschau", className }: PantsPhotoProps) {
  const zoneSpecs = React.useMemo(
    () =>
      ZONES.map(({ zone, mask }) => ({
        zone,
        maskSrc: mask,
        paint: paints[zone as keyof PantsPhotoPaints],
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
        // Keep multiply/screen confined to this stack instead of blending with
        // whatever page background happens to sit behind the preview.
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
        fetchPriority="high"
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
    </div>
  );
}
