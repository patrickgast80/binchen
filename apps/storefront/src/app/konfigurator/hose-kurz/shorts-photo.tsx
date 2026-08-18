import * as React from "react";

import { LabelOverlay, SheenOverlay, ZoneOverlay, type ZonePaint } from "../_shared/zone-overlay";

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
 * Assets: scripts/bil2499-build-dinoshorts-assets.mjs → /konfigurator/hose-kurz-foto/.
 */
const ASSET_BASE = "/konfigurator/hose-kurz-foto";
// Muss der realen Assetgröße folgen (siehe registry.ts) — sonst driften die
// Overlays gegen das `object-fit: contain`-Bild.
const ASSET_W = 900;
const ASSET_H = 750;

export function ShortsPhoto({
  paints,
  title = "Vorschau der kurzen Hose",
  className,
}: ShortsPhotoProps) {
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
      <ZoneOverlay src={`${ASSET_BASE}/mask-bund.webp`} paint={paints.bund} ratio={ASSET_W / ASSET_H} />
      <ZoneOverlay src={`${ASSET_BASE}/mask-hose.webp`} paint={paints.hose} ratio={ASSET_W / ASSET_H} />
      <ZoneOverlay
        src={`${ASSET_BASE}/mask-buendchen.webp`}
        paint={paints.buendchen}
        ratio={ASSET_W / ASSET_H}
      />
      <SheenOverlay src={`${ASSET_BASE}/highlight.webp`} />
      <LabelOverlay src={`${ASSET_BASE}/label.webp`} />
    </div>
  );
}
