import { readFile } from "node:fs/promises";
import path from "node:path";

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

/**
 * Longest edge of the composed photo handed to satori. Sized to leave a margin
 * inside the 576px-wide, 630px-tall photo panel — a garment bleeding into the
 * panel edge reads as a cropped photo in a WhatsApp preview.
 */
const COMPOSE_MAX_EDGE = 500;

/**
 * Where `public/` ends up relative to `process.cwd()`. The standalone server
 * chdirs to its own directory (`/app/apps/storefront`), a plain `next start`
 * runs from the package root — both resolve with the first candidate. The
 * second covers a runner started from the monorepo root.
 */
const PUBLIC_DIRS = [
  path.join(process.cwd(), "public"),
  path.join(process.cwd(), "apps", "storefront", "public"),
];

/**
 * Reads a `public/` asset from disk, falling back to HTTP.
 *
 * Disk first because the HTTP path makes the container request its own public
 * hostname: that round-trip goes container → bridge → host → Traefik → back,
 * and it is exactly what failed silently in production (assets served 200 to
 * the outside world while the share card kept rendering an empty panel).
 * The fetch stays as a fallback for setups where `public/` is not colocated.
 */
async function loadAsset(
  origin: string,
  relPath: string,
): Promise<{ buf: Buffer; source: "fs" | "http" } | null> {
  const safeRel = relPath.replace(/^\/+/, "").split("/").filter((s) => s !== "..");
  for (const dir of PUBLIC_DIRS) {
    try {
      return { buf: await readFile(path.join(dir, ...safeRel)), source: "fs" };
    } catch {
      // next candidate
    }
  }
  try {
    const res = await fetch(`${origin}${relPath}`, { cache: "force-cache" });
    if (!res.ok) return null;
    return { buf: Buffer.from(await res.arrayBuffer()), source: "http" };
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

/** Must match TILE_PERCENT in zone-overlay.tsx — the preview's tile scale. */
const TILE_FRACTION = 0.42;

/**
 * Builds one tint layer painted with a tiled fabric print instead of a flat
 * colour, rotated by the configured quarter turn (BIL-2492).
 *
 * The rotation is applied to the tile *before* it is repeated, exactly like
 * the CSS side: rotating the finished composition would turn the garment.
 * sharp fixes its own pipeline order (rotate and resize do not commute with
 * composite), so each step gets its own pass.
 */
async function fabricLayer(
  textureBuf: Buffer,
  maskBuf: Buffer,
  hex: string,
  rotation: number,
  width: number,
  height: number,
): Promise<Buffer> {
  const tileEdge = Math.max(8, Math.round(width * TILE_FRACTION));
  const rotated =
    rotation === 0 ? textureBuf : await sharp(textureBuf).rotate(rotation).toBuffer();
  const tile = await sharp(rotated).resize(tileEdge, tileEdge, { fit: "fill" }).png().toBuffer();

  const { r, g, b } = hexToRgb(hex);
  const tiled = await sharp({
    // Average colour underneath so a tile with alpha never punches a hole.
    create: { width, height, channels: 4, background: { r, g, b, alpha: 1 } },
  })
    .composite([{ input: tile, tile: true }])
    .png()
    .toBuffer();

  // `dest-in` keeps the tiled pixels only where the zone mask has alpha —
  // the sharp equivalent of `mask-image` + `mask-mode: alpha`.
  return sharp(tiled)
    .composite([
      {
        input: await sharp(maskBuf).resize(width, height, { fit: "fill" }).ensureAlpha().png().toBuffer(),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
}

export interface ComposedPhoto {
  dataUri: string;
  width: number;
  height: number;
  /**
   * How the assets were obtained, or why the compose bailed. Surfaced as the
   * `x-og-photo` response header: a share card that regresses to the text-only
   * layout can then be diagnosed with `curl -I` instead of a redeploy.
   */
  trace: string;
}

/**
 * Renders the configured garment as a PNG data URI, or a `null` `dataUri` when
 * an asset is unreachable — callers fall back to the text-only card rather than
 * shipping a broken image.
 */
export async function composeKonfigPhoto(
  origin: string,
  konfig: KonfigRegistryEntry,
  /** region param → resolved hex */
  colors: Record<string, string>,
  /** region param → tileable fabric photo, for zones carrying a print */
  textures: Record<string, string | null> = {},
  /** quarter turn applied to every fabric tile */
  rotation: number = 0,
): Promise<ComposedPhoto | { dataUri: null; trace: string }> {
  const base = await loadAsset(origin, konfig.basePhoto);
  if (!base) return { dataUri: null, trace: "no-base" };
  const baseBuf = base.buf;

  try {
    const meta = await sharp(baseBuf).metadata();
    const srcW = meta.width ?? konfig.width;
    const srcH = meta.height ?? konfig.height;

    const layers: sharp.OverlayOptions[] = [];
    let fabricZones = 0;
    for (const region of konfig.regions) {
      const mask = await loadAsset(origin, region.src);
      if (!mask) continue;
      const textureSrc = textures[region.param];
      const texture = textureSrc ? await loadAsset(origin, textureSrc) : null;
      if (texture) {
        fabricZones += 1;
        layers.push({
          input: await fabricLayer(
            texture.buf,
            mask.buf,
            colors[region.param],
            rotation,
            srcW,
            srcH,
          ),
          blend: "multiply",
        });
      } else {
        layers.push({
          input: await tintLayer(mask.buf, colors[region.param], srcW, srcH),
          blend: "multiply",
        });
      }
    }
    if (layers.length === 0) return { dataUri: null, trace: "no-masks" };

    if (konfig.sheenPhoto) {
      const sheen = await loadAsset(origin, konfig.sheenPhoto);
      if (sheen) {
        layers.push({
          input: await sharp(sheen.buf)
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
      trace: `${base.source}:${layers.length}L:${fabricZones}F:r${rotation}:${Math.round(
        png.byteLength / 1024,
      )}kb`,
    };
  } catch (err) {
    return {
      dataUri: null,
      trace: `sharp-error:${err instanceof Error ? err.name : "unknown"}`,
    };
  }
}
