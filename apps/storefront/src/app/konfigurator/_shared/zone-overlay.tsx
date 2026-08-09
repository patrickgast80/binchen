import * as React from "react";

/**
 * Per-zone paint for the Konfigurator photo previews. `hex` is always set
 * (either a chosen uni colour or the swatch's average colour) so the zone
 * still renders while the fabric texture loads or if it fails to fetch.
 */
export interface ZonePaint {
  hex: string;
  textureSrc?: string;
}

interface ZoneOverlayProps {
  /** URL of the alpha mask for this zone. */
  src: string;
  paint: ZonePaint;
}

/**
 * Absolute-positioned mask layer used inside a Konfigurator photo wrapper.
 * When `paint.textureSrc` is set the layer paints the fabric photo (tiled at
 * a fabric-plausible scale) instead of a flat colour, but the mix-blend
 * behaviour and mask cutting stay identical.
 *
 * The fabric image is repeated so a busy print reads as fabric rather than a
 * huge single motif stretched across the garment. `background-size: 42%` was
 * chosen empirically to match the scale of the reference base photos
 * (~900px wide) — bigger prints hide the garment shape, smaller prints look
 * pixelated at desktop widths.
 */
export function ZoneOverlay({ src, paint }: ZoneOverlayProps) {
  const style: React.CSSProperties & Record<string, string | number> = {
    position: "absolute",
    inset: 0,
    backgroundColor: paint.hex,
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
  if (paint.textureSrc) {
    style.backgroundImage = `url(${paint.textureSrc})`;
    style.backgroundRepeat = "repeat";
    style.backgroundSize = "42%";
    style.backgroundPosition = "center";
  }
  return <div aria-hidden="true" style={style} />;
}
