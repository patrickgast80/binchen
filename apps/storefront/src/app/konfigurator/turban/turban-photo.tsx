import * as React from "react";

export interface TurbanPhotoColors {
  turban: string;
  schleife: string;
}

interface TurbanPhotoProps {
  colors: TurbanPhotoColors;
  title?: string;
  className?: string;
}

/**
 * Fotorealistische Konfigurator-Vorschau: die echte Turban-Mütze „Rosen"
 * (freigestellt, entsättigt) als Basis, überlagert mit zwei einfärbbaren
 * Zonen (Hauptstoff + Schleife). Gleiches Prinzip wie PantsPhoto: die Zone
 * wird per CSS `mask-image` ausgeschnitten und die Farbe per
 * `mix-blend-mode: multiply` über die Graustufen gelegt, sodass Stofftextur,
 * Raffung und Nähte sichtbar bleiben.
 *
 * Assets werden von scripts/bil2444-build-turban-assets.mjs aus dem Produktfoto
 * turban-rosen-01.jpeg erzeugt und liegen unter /konfigurator/turban-foto/.
 */
const ASSET_BASE = "/konfigurator/turban-foto";
// Kept in sync with the WebP output — locks aspect ratio for CLS ≈ 0.
const ASSET_W = 900;
const ASSET_H = 796;

export function TurbanPhoto({ colors, title = "Turban-Vorschau", className }: TurbanPhotoProps) {
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

      <ZoneOverlay src={`${ASSET_BASE}/mask-turban.webp`} color={colors.turban} />
      <ZoneOverlay src={`${ASSET_BASE}/mask-schleife.webp`} color={colors.schleife} />
    </div>
  );
}

function ZoneOverlay({ src, color }: { src: string; color: string }) {
  const maskStyles: React.CSSProperties & Record<string, string | number> = {
    position: "absolute",
    inset: 0,
    backgroundColor: color,
    mixBlendMode: "multiply",
    pointerEvents: "none",
    maskImage: `url(${src})`,
    WebkitMaskImage: `url(${src})`,
    maskMode: "alpha",
    WebkitMaskMode: "alpha",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskSize: "100% 100%",
    WebkitMaskSize: "100% 100%",
  };
  return <div aria-hidden="true" style={maskStyles} />;
}
