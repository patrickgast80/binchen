import sharp from "sharp";

import type { KonfigRegistryEntry } from "@/app/konfigurator/_shared/registry";

/**
 * Server-side twin of the client Konfigurator blend stack, rendered with sharp.
 *
 * Two reasons this exists instead of just pointing satori at the base photo:
 *
 * 1. satori/resvg decodes PNG, JPEG and SVG — *not* WebP. All Konfigurator
 *    assets are WebP, so `<img src="/konfigurator/hose-foto/base.webp">` inside
 *    an `ImageResponse` silently rendered nothing and the share card shipped
 *    with an empty photo panel (BIL-2454 follow-up).
 * 2. satori has no `mix-blend-mode`, so the multiply/screen stack that gives the
 *    preview its fabric folds cannot be expressed in the OG JSX at all.
 *
 * So we composite the finished garment here and hand satori a single PNG data
 * URI. The layer order mirrors `*-photo.tsx`: base → one multiply layer per
 * region (mask alpha cuts the zone shape) → optional screen sheen.
 */

/** Longest edge of the composed photo handed to satori. */
const COMPOSE_MAX_EDGE = 560;

async function fetchAsset(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 250, g: 247, b: 242 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Builds one tint layer: flat colour everywhere, alpha taken from the zone
 * mask. Equivalent to the client's `background-color` + `mask-image: url(...)`
 * with `mask-mode: alpha`.
 */
async function tintLayer(
  maskBuf: Buffer,
  hex: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const { data } = await sharp(maskBuf)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { r, g, b } = hexToRgb(hex);
  const out = Buffer.allocUnsafe(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = data[o + 3];
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

export interface ComposedPhoto {
  dataUri: string;
  width: number;
  height: number;
}

/**
 * Renders the configured garment as a PNG data URI, or `null` when any asset
 * is unreachable — callers fall back to the text-only card rather than shipping
 * a broken image.
 */
export async function composeKonfigPhoto(
  origin: string,
  konfig: KonfigRegistryEntry,
  /** region param → resolved hex */
  colors: Record<string, string>,
): Promise<ComposedPhoto | null> {
  const baseBuf = await fetchAsset(`${origin}${konfig.basePhoto}`);
  if (!baseBuf) return null;

  try {
    const meta = await sharp(baseBuf).metadata();
    const srcW = meta.width ?? konfig.width;
    const srcH = meta.height ?? konfig.height;

    const layers: sharp.OverlayOptions[] = [];
    for (const region of konfig.regions) {
      const maskBuf = await fetchAsset(`${origin}${region.src}`);
      if (!maskBuf) continue;
      layers.push({
        input: await tintLayer(maskBuf, colors[region.param], srcW, srcH),
        blend: "multiply",
      });
    }
    if (layers.length === 0) return null;

    if (konfig.sheenPhoto) {
      const sheenBuf = await fetchAsset(`${origin}${konfig.sheenPhoto}`);
      if (sheenBuf) {
        layers.push({
          input: await sharp(sheenBuf)
            .resize(srcW, srcH, { fit: "fill" })
            .png()
            .toBuffer(),
          blend: "screen",
        });
      }
    }

    const scale = COMPOSE_MAX_EDGE / Math.max(srcW, srcH);
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));

    // sharp runs `composite` after `resize` no matter the call order, so the
    // blend has to happen at full size and the downscale in a second pass —
    // otherwise the mask layers are larger than the target and sharp throws.
    const blended = await sharp(baseBuf)
      .ensureAlpha()
      .composite(layers)
      // The base is cut out, so flatten onto the card colour instead of letting
      // satori composite a transparent PNG over the panel.
      .flatten({ background: "#FAF7F2" })
      .png()
      .toBuffer();

    const png = await sharp(blended)
      .resize(outW, outH, { fit: "inside" })
      .png({ compressionLevel: 9 })
      .toBuffer();

    return {
      dataUri: `data:image/png;base64,${png.toString("base64")}`,
      width: outW,
      height: outH,
    };
  } catch {
    return null;
  }
}
