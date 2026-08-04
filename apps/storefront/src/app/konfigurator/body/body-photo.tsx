import * as React from "react";

export interface BodyPhotoColors {
  hauptteil: string;
  halsbund: string;
  aermelbund: string;
}

interface BodyPhotoProps {
  colors: BodyPhotoColors;
  title?: string;
  className?: string;
}

/**
 * Live-Vorschau des Body-Konfigurators. Basis-Illustration + drei
 * einfärbbare Alpha-Masken (Hauptteil, Halsbündchen, Ärmelbündchen) im
 * gleichen Blend-Verfahren wie die anderen Konfiguratoren:
 * mix-blend-mode: multiply auf eine Graustufen-Basis.
 *
 * Assets werden von scripts/bil2455-build-body-assets.mjs erzeugt.
 * Bis ein echtes Studio-Foto vorliegt, ist die Basis eine hand-gezeichnete
 * Vektor-Illustration eines Langarm-Bodys — Swap-Pfad ist rein visuell
 * (base.webp + drei mask-*.webp austauschen, kein Code-Änderung).
 */
const ASSET_BASE = "/konfigurator/body-foto";
const ASSET_W = 900;
const ASSET_H = 737;

export function BodyPhoto({ colors, title = "Body-Vorschau", className }: BodyPhotoProps) {
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
      <ZoneOverlay src={`${ASSET_BASE}/mask-hauptteil.webp`} color={colors.hauptteil} />
      <ZoneOverlay src={`${ASSET_BASE}/mask-halsbund.webp`} color={colors.halsbund} />
      <ZoneOverlay src={`${ASSET_BASE}/mask-aermelbund.webp`} color={colors.aermelbund} />
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
