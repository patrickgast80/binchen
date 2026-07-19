import * as React from "react";

export interface PantsPhotoColors {
  bund: string;
  hose: string;
  buendchen: string;
}

interface PantsPhotoProps {
  colors: PantsPhotoColors;
  title?: string;
  className?: string;
}

/**
 * Fotorealistische Konfigurator-Vorschau: eine echte Pumphose (freigestellt,
 * entsättigt) als Basis, überlagert mit drei einfärbbaren Zonen. Jede Zone
 * ist ein absolut positioniertes DIV, dessen `mask-image` die Zonenform aus
 * dem Foto ausschneidet und dessen Hintergrundfarbe per `mix-blend-mode:
 * multiply` mit den Graustufen der Basis multipliziert wird. Dadurch bleiben
 * Stofftextur, Faltenwurf und Nähte sichtbar — im Gegensatz zu einem
 * flächigen Farbüberzug.
 *
 * Assets werden von scripts/bil2417-build-assets.mjs aus dem Basisfoto
 * pumphose-05.jpg erzeugt und liegen unter /konfigurator/hose-foto/.
 */
const ASSET_BASE = "/konfigurator/hose-foto";
// Kept in sync with the WebP output — used to lock aspect ratio so first paint
// doesn't shift when the images finish loading (CLS ≈ 0).
const ASSET_W = 900;
const ASSET_H = 1003;

export function PantsPhoto({ colors, title = "Hose-Vorschau", className }: PantsPhotoProps) {
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
      {/* Base pants photo — desaturated luminance so multiply blend recolours
          predictably. `alt="" role="presentation"` because the wrapping div
          already carries the accessible label. Using a raw <img> (not
          next/image) because next/image wraps the tag in a span which would
          break the sibling-div mix-blend-mode composition. */}
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

      {/* Colour overlays — order matters only for stacking; multiply blend is
          associative on non-overlapping masks. */}
      <ZoneOverlay src={`${ASSET_BASE}/mask-bund.webp`} color={colors.bund} />
      <ZoneOverlay src={`${ASSET_BASE}/mask-hose.webp`} color={colors.hose} />
      <ZoneOverlay src={`${ASSET_BASE}/mask-buendchen.webp`} color={colors.buendchen} />
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
    // Portable across Chromium/Safari — WebKit still needs the vendor prefix
    // for `mask-image` on some iOS versions.
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
