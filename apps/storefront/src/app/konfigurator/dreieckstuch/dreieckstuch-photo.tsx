import * as React from "react";

export interface DreieckstuchPhotoColors {
  tuch: string;
}

interface DreieckstuchPhotoProps {
  colors: DreieckstuchPhotoColors;
  title?: string;
  className?: string;
}

/**
 * Fotorealistische Konfigurator-Vorschau: das echte Bilulu-Dreieckstuch
 * "Kleiner Zoo" (freigestellt, entsättigt) als Basis, überlagert mit einer
 * einfärbbaren Zone (Hauptstoff). Prinzip wie TurbanPhoto/MuetzePhoto:
 * mix-blend-mode: multiply über Graustufen-Basis.
 *
 * Assets werden von scripts/bil2446-build-dreieckstuch-assets.mjs erzeugt.
 */
const ASSET_BASE = "/konfigurator/dreieckstuch-foto";
const ASSET_W = 900;
const ASSET_H = 482;

export function DreieckstuchPhoto({
  colors,
  title = "Dreieckstuch-Vorschau",
  className,
}: DreieckstuchPhotoProps) {
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
      <ZoneOverlay src={`${ASSET_BASE}/mask-tuch.webp`} color={colors.tuch} />
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
