import * as React from "react";

import { ZoneOverlay, type ZonePaint } from "../_shared/zone-overlay";

export interface BodyPhotoPaints {
  hauptteil: ZonePaint;
  halsbund: ZonePaint;
  aermelbund: ZonePaint;
}

interface BodyPhotoProps {
  paints: BodyPhotoPaints;
  title?: string;
  className?: string;
}

/**
 * Live-Vorschau des Body-Konfigurators. Basis-Illustration + drei
 * einfärbbare Alpha-Masken (Hauptteil, Halsbündchen, Ärmelbündchen) im
 * gleichen Blend-Verfahren wie die anderen Konfiguratoren:
 * mix-blend-mode: multiply auf eine Graustufen-Basis. Der Hauptteil kann
 * ausserdem einen Stoffdruck (textureSrc) rendern.
 *
 * Assets werden von scripts/bil2455-build-body-assets.mjs erzeugt.
 */
const ASSET_BASE = "/konfigurator/body-foto";
const ASSET_W = 900;
const ASSET_H = 737;

export function BodyPhoto({ paints, title = "Body-Vorschau", className }: BodyPhotoProps) {
  return (
    <div
      role="img"
      aria-label={title}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${ASSET_W} / ${ASSET_H}`,
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
      <ZoneOverlay src={`${ASSET_BASE}/mask-hauptteil.webp`} paint={paints.hauptteil} ratio={ASSET_W / ASSET_H} />
      <ZoneOverlay src={`${ASSET_BASE}/mask-halsbund.webp`} paint={paints.halsbund} ratio={ASSET_W / ASSET_H} />
      <ZoneOverlay src={`${ASSET_BASE}/mask-aermelbund.webp`} paint={paints.aermelbund} ratio={ASSET_W / ASSET_H} />
    </div>
  );
}
