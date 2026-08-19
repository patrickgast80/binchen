"use client";

import * as React from "react";

import { SheenOverlay, ZoneOverlay, type ZonePaint } from "../_shared/zone-overlay";
import { ReliefFabricLayer, useReliefTakeover } from "../_shared/relief-layer";

export interface MuetzePhotoPaints {
  muetze: ZonePaint;
  futter: ZonePaint;
}

interface MuetzePhotoProps {
  paints: MuetzePhotoPaints;
  title?: string;
  className?: string;
}

/**
 * Fotorealistische Konfigurator-Vorschau: die echte Bilulu-Mütze "Boho-Regenbogen"
 * (freigestellt, entsättigt) als Basis, überlagert mit zwei einfärbbaren
 * Zonen (Hauptstoff + Futter). Gleiches Prinzip wie TurbanPhoto:
 * mix-blend-mode: multiply über Graustufen-Basis. Der Hauptstoff kann
 * einen Stoffdruck rendern.
 *
 * Assets werden von scripts/bil2445-build-muetze-assets.mjs erzeugt.
 *
 * BIL-2522 — auf einem gewählten Stoff liegt zusätzlich die Relief-Ebene:
 * das Muster folgt der Kuppel der Mütze und den echten Raffungen an der
 * Krone, statt als flache Kachel darüberzuliegen. Sie liegt über dem Sheen,
 * damit der weiße Screen-Fleck einen Druck nicht entsättigt.
 */
const ASSET_BASE = "/konfigurator/muetze-foto";
const ASSET_W = 900;
// BIL-2479: the studio shot has the hat lying on its side, so the asset build
// now stands it upright before segmenting. That swaps the garment bbox and the
// delivered base is 900x880, not 900x920. This constant has to track the asset
// exactly — the preview reserves its box from this ratio, so a stale value both
// letterboxes the photo and reintroduces the CLS regress of BIL-2206.
const ASSET_H = 880;

const ZONES = [
  { zone: "muetze", mask: `${ASSET_BASE}/mask-muetze.webp` },
  { zone: "futter", mask: `${ASSET_BASE}/mask-futter.webp` },
] as const;

export function MuetzePhoto({ paints, title = "Mütze-Vorschau", className }: MuetzePhotoProps) {
  const zoneSpecs = React.useMemo(
    () =>
      ZONES.map(({ zone, mask }) => ({
        zone,
        maskSrc: mask,
        paint: paints[zone as keyof MuetzePhotoPaints],
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
