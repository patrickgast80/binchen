"use client";

import type { KonfigRegistryEntry } from "./registry";
import { swatchHexOrDefault, swatchTextureOrDefault } from "./registry";
import type { MusterRotation } from "./rotation";

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    // Same-origin assets, no crossOrigin needed — canvas stays untainted.
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`thumbnail: failed to load ${src}`));
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}

/** Must match TILE_PERCENT in zone-overlay.tsx — the preview's tile scale. */
const TILE_FRACTION = 0.42;

/**
 * Paints the fabric print into `tctx`, tiled and rotated exactly like the
 * preview's CSS background. Returns false when the browser cannot transform a
 * canvas pattern, so the caller can fall back to the flat average colour.
 */
function paintFabric(
  tctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  rotation: MusterRotation,
): boolean {
  const pattern = tctx.createPattern(img, "repeat");
  if (!pattern || typeof DOMMatrix === "undefined" || !pattern.setTransform) return false;
  const scale = (TILE_FRACTION * w) / (img.naturalWidth || img.width || 1);
  // Centre one tile on the canvas centre, then rotate about that point — the
  // CSS side uses `background-position: center`, so the phase lines up.
  pattern.setTransform(
    new DOMMatrix()
      .translateSelf(w / 2, h / 2)
      .rotateSelf(rotation)
      .scaleSelf(scale)
      .translateSelf(-(img.naturalWidth || 1) / 2, -(img.naturalHeight || 1) / 2),
  );
  tctx.fillStyle = pattern;
  tctx.fillRect(0, 0, w, h);
  return true;
}

/**
 * Composite the konfigurator preview into a PNG data URL of the given max
 * dimension, mirroring the on-screen mix-blend-mode:multiply / mask-image
 * stack. Runs entirely in the browser.
 *
 * BIL-2492: fabric prints and their rotation are rendered too. Before that the
 * thumbnail only ever painted the swatch's average colour, so a saved "Stoff
 * 14" card was indistinguishable from a saved pastel-blue uni.
 */
export async function renderKonfigThumbnail(
  konfig: KonfigRegistryEntry,
  selection: Record<string, string>,
  maxSize = 240,
  rotation: MusterRotation = 0,
): Promise<string> {
  const scale = Math.min(1, maxSize / Math.max(konfig.width, konfig.height));
  const w = Math.round(konfig.width * scale);
  const h = Math.round(konfig.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("thumbnail: 2d context unavailable");

  // Warm cream backdrop so the transparent PNG areas match the on-page frame.
  ctx.fillStyle = "#F0EBE1";
  ctx.fillRect(0, 0, w, h);

  const base = await loadImage(konfig.basePhoto);
  ctx.drawImage(base, 0, 0, w, h);

  for (const region of konfig.regions) {
    const color = swatchHexOrDefault(selection[region.param], region.defaultColor);
    const textureSrc = swatchTextureOrDefault(selection[region.param], region.defaultColor);
    const mask = await loadImage(region.src);

    const tint = document.createElement("canvas");
    tint.width = w;
    tint.height = h;
    const tctx = tint.getContext("2d");
    if (!tctx) continue;

    // Average colour first — it stays visible if the fabric fails to load and
    // it is the whole fill for uni swatches.
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, w, h);
    if (textureSrc) {
      try {
        const fabric = await loadImage(textureSrc);
        paintFabric(tctx, fabric, w, h, rotation);
      } catch {
        // keep the flat fill
      }
    }

    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(mask, 0, 0, w, h);

    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(tint, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  // BIL-2499: the un-recolourable detail goes on top, in normal blend mode, so
  // a saved card shows the "made with love" tag the same way the preview does.
  // A failed load must not lose the whole thumbnail — the masks already exclude
  // the tag region, so the worst case is a small grey patch, not a tinted one.
  if (konfig.labelPhoto) {
    try {
      const label = await loadImage(konfig.labelPhoto);
      ctx.drawImage(label, 0, 0, w, h);
    } catch {
      // keep the composed garment
    }
  }

  return canvas.toDataURL("image/png");
}
