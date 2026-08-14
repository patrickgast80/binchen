import * as React from "react";

import { SheenOverlay, ZoneOverlay, type ZonePaint } from "../_shared/zone-overlay";

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
 */
const ASSET_BASE = "/konfigurator/muetze-foto";
const ASSET_W = 900;
const ASSET_H = 920;

export function MuetzePhoto({ paints, title = "Mütze-Vorschau", className }: MuetzePhotoProps) {
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
      <ZoneOverlay src={`${ASSET_BASE}/mask-muetze.webp`} paint={paints.muetze} />
      <ZoneOverlay src={`${ASSET_BASE}/mask-futter.webp`} paint={paints.futter} />
      <SheenOverlay src={`${ASSET_BASE}/highlight.webp`} />
    </div>
  );
}
