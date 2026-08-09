import * as React from "react";

import { ZoneOverlay, type ZonePaint } from "../_shared/zone-overlay";

export interface TurbanPhotoPaints {
  turban: ZonePaint;
  schleife: ZonePaint;
}

interface TurbanPhotoProps {
  paints: TurbanPhotoPaints;
  title?: string;
  className?: string;
}

/**
 * Fotorealistische Konfigurator-Vorschau: die echte Turban-Mütze „Rosen"
 * (freigestellt, entsättigt) als Basis, überlagert mit zwei einfärbbaren
 * Zonen (Hauptstoff + Schleife). Gleiches Prinzip wie PantsPhoto: die Zone
 * wird per CSS `mask-image` ausgeschnitten und die Füllung (Farbe oder
 * Stoffdruck) per `mix-blend-mode: multiply` über die Graustufen gelegt,
 * sodass Stofftextur, Raffung und Nähte sichtbar bleiben.
 *
 * Assets werden von scripts/bil2444-build-turban-assets.mjs aus dem Produktfoto
 * turban-rosen-01.jpeg erzeugt und liegen unter /konfigurator/turban-foto/.
 */
const ASSET_BASE = "/konfigurator/turban-foto";
// Kept in sync with the WebP output — locks aspect ratio for CLS ≈ 0.
const ASSET_W = 900;
const ASSET_H = 796;

export function TurbanPhoto({ paints, title = "Turban-Vorschau", className }: TurbanPhotoProps) {
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
      {/* Raw <img> statt next/image — next/image wickelt das Tag in ein span,
          das die mix-blend-mode-Komposition der Geschwister-DIVs bricht. */}
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

      <ZoneOverlay src={`${ASSET_BASE}/mask-turban.webp`} paint={paints.turban} />
      <ZoneOverlay src={`${ASSET_BASE}/mask-schleife.webp`} paint={paints.schleife} />
    </div>
  );
}
