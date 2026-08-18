import * as React from "react";

import type { MusterRotation } from "./rotation";

/**
 * Per-zone paint for the Konfigurator photo previews. `hex` is always set
 * (either a chosen uni colour or the swatch's average colour) so the zone
 * still renders while the fabric texture loads or if it fails to fetch.
 */
export interface ZonePaint {
  hex: string;
  textureSrc?: string;
  /** Quarter-turn applied to the fabric tile (BIL-2492). Ignored for uni colours. */
  rotation?: MusterRotation;
}

interface ZoneOverlayProps {
  /** URL of the alpha mask for this zone. */
  src: string;
  paint: ZonePaint;
  /**
   * Width / height of the surrounding photo box. Only needed to size the
   * rotated tiling layer for the quarter turns; the default keeps callers that
   * never rotate unchanged.
   */
  ratio?: number;
}

/**
 * Tile width as a share of the photo width. Chosen empirically to match the
 * scale of the reference base photos (~900px wide) — bigger prints hide the
 * garment shape, smaller prints look pixelated at desktop widths.
 */
const TILE_PERCENT = 42;

/**
 * Absolute-positioned mask layer used inside a Konfigurator photo wrapper.
 * When `paint.textureSrc` is set the layer paints the fabric photo (tiled at
 * a fabric-plausible scale) instead of a flat colour, but the mix-blend
 * behaviour and mask cutting stay identical.
 *
 * BIL-2492 — rotation: the quarter turn is applied to the *tiling layer*, not
 * to the finished composition, so the zone masks and the garment silhouette
 * stay exactly where they are and only the print turns. 0° and 180° tile in a
 * box the size of the photo; 90° and 270° tile in a box with width and height
 * swapped, so the rotated result covers the photo edge to edge. `background-
 * size` is a percentage of that box, so the swapped case rescales by `ratio`
 * to keep the on-screen tile the same size in every orientation.
 */
export function ZoneOverlay({ src, paint, ratio = 1 }: ZoneOverlayProps) {
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

  if (!paint.textureSrc) {
    return <div aria-hidden="true" style={style} />;
  }

  const rotation = paint.rotation ?? 0;
  const tile: React.CSSProperties = {
    backgroundImage: `url(${paint.textureSrc})`,
    backgroundRepeat: "repeat",
    backgroundSize: `${TILE_PERCENT}%`,
    backgroundPosition: "center",
  };

  if (rotation === 0) {
    return <div aria-hidden="true" style={{ ...style, ...tile }} />;
  }

  const quarterTurn = rotation === 90 || rotation === 270;
  return (
    <div aria-hidden="true" style={{ ...style, overflow: "hidden" }}>
      <div
        style={{
          ...tile,
          position: "absolute",
          top: "50%",
          left: "50%",
          width: quarterTurn ? `${(100 / ratio).toFixed(4)}%` : "100%",
          height: quarterTurn ? `${(100 * ratio).toFixed(4)}%` : "100%",
          backgroundSize: quarterTurn
            ? `${(TILE_PERCENT * ratio).toFixed(4)}%`
            : `${TILE_PERCENT}%`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        }}
      />
    </div>
  );
}

/**
 * Sheen layer, composited over the tinted zones with `mix-blend-mode: screen`.
 *
 * Multiply can only ever darken, so on a dark tint (navy, forest) the garment
 * lost its lit side and read as a flat silhouette — one of the two things the
 * board rejected in the first BIL-2461 pass. The highlight asset is black
 * everywhere except where the source photo was brightest, and screen leaves
 * black untouched, so it adds a lit side without touching the chosen colour's
 * hue. Assets are built by the bil2417/bil2445 scripts.
 */
export function SheenOverlay({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      role="presentation"
      aria-hidden="true"
      loading="eager"
      decoding="async"
      draggable={false}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
        mixBlendMode: "screen",
        pointerEvents: "none",
        userSelect: "none",
      }}
    />
  );
}
