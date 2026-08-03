import * as React from "react";

export interface MuetzePhotoColors {
  muetze: string;
  futter: string;
}

interface MuetzePhotoProps {
  colors: MuetzePhotoColors;
  title?: string;
  className?: string;
}

/**
 * Fotorealistische Konfigurator-Vorschau: die echte Bilulu-Muetze "Boho-Regenbogen"
 * (freigestellt, entsaettigt) als Basis, ueberlagert mit zwei einfaerbbaren
 * Zonen (Hauptstoff + Futter). Gleiches Prinzip wie TurbanPhoto:
 * mix-blend-mode: multiply ueber Graustufen-Basis.
 *
 * Assets werden von scripts/bil2445-build-muetze-assets.mjs erzeugt.
 */
const ASSET_BASE = "/konfigurator/muetze-foto";
const ASSET_W = 900;
const ASSET_H = 917;

export function MuetzePhoto({ colors, title = "Muetze-Vorschau", className }: MuetzePhotoProps) {
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
      <ZoneOverlay src={`${ASSET_BASE}/mask-muetze.webp`} color={colors.muetze} />
      <ZoneOverlay src={`${ASSET_BASE}/mask-futter.webp`} color={colors.futter} />
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
