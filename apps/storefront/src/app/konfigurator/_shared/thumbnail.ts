"use client";

import type { KonfigRegistryEntry } from "./registry";
import { swatchHexOrDefault } from "./registry";

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

/**
 * Composite the konfigurator preview into a PNG data URL of the given max
 * dimension, mirroring the on-screen mix-blend-mode:multiply / mask-image
 * stack. Runs entirely in the browser.
 */
export async function renderKonfigThumbnail(
  konfig: KonfigRegistryEntry,
  selection: Record<string, string>,
  maxSize = 240,
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
    const mask = await loadImage(region.src);

    const tint = document.createElement("canvas");
    tint.width = w;
    tint.height = h;
    const tctx = tint.getContext("2d");
    if (!tctx) continue;
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, w, h);
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(mask, 0, 0, w, h);

    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(tint, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  return canvas.toDataURL("image/png");
}
