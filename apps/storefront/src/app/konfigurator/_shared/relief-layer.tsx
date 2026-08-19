"use client";

import * as React from "react";

import type { ZonePaint } from "./zone-overlay";
import {
  buildTile,
  grainFor,
  paintReliefZone,
  tilePx,
} from "./relief-math.mjs";

/**
 * BIL-2522 — the relief fabric layer.
 *
 * The shipped stack paints a chosen fabric as a flat repeating CSS background
 * under `mix-blend-mode: multiply`. That modulates the print's brightness but
 * never its geometry, so the pattern runs dead straight across every fold and
 * the preview reads as a sticker on a photo. This layer re-renders the fabric
 * zones through the Konfigurator's relief map (`relief.webp`): the print is
 * displaced along the fold and limb geometry, then shaded with a saturation
 * falloff so light colours the fabric instead of just dimming it.
 *
 * Three deliberate properties:
 *
 *   1. It is a pure enhancement. The CSS zones still render server-side and on
 *      first paint; they are only hidden once this canvas has actually painted.
 *      No JS, a decode failure, an ancient browser — all fall back to exactly
 *      the look that shipped before, rather than to an empty preview.
 *   2. It never touches the LCP. The base photo is still the largest element
 *      and is unchanged; this work is deferred to idle and paints into a canvas
 *      that already occupies its final box, so it cannot move layout (CLS 0).
 *   3. The per-pixel maths is imported, not reimplemented — relief-math.mjs is
 *      the same module the Node evidence renderer runs, so an offline
 *      before/after sheet is evidence about the real thing.
 */

export interface ReliefZoneSpec {
  /** Zone param name — selects the grain offset for that cut piece. */
  zone: string;
  maskSrc: string;
  paint: ZonePaint;
}

interface ReliefLayerProps {
  /** e.g. "/konfigurator/hose-foto" */
  assetBase: string;
  width: number;
  height: number;
  zones: ReliefZoneSpec[];
  onReady?: (ready: boolean) => void;
}

/** Decoded assets are shared across zones, rotations and re-renders. */
const imageDataCache = new Map<string, ImageData>();
const tileCache = new Map<string, { data: Uint8ClampedArray; TW: number; TH: number; stride: number }>();


function scratchCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  return { canvas, ctx };
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  // Same-origin assets; set anyway so a future CDN move cannot silently taint
  // the canvas and turn getImageData into a SecurityError at runtime.
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  return img;
}

async function loadImageData(src: string): Promise<ImageData> {
  const cached = imageDataCache.get(src);
  if (cached) return cached;
  const img = await loadImage(src);
  const { ctx } = scratchCanvas(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
  imageDataCache.set(src, data);
  return data;
}

async function loadTile(src: string, rotation: number, px: number) {
  const key = `${src}|${rotation}|${px}`;
  const cached = tileCache.get(key);
  if (cached) return cached;
  // Decode at NATIVE size and let the shared resampler scale it. Handing the
  // scale to drawImage would use Chromium's filter, which disagrees with the
  // Node evidence renderer by enough to invalidate an offline before/after.
  // Rotating the (seamless — BIL-2508) tile is equivalent to rotating the
  // whole tiling plane the CSS fallback turns, and keeps the wrap a modulo.
  const img = await loadImage(src);
  const { ctx } = scratchCanvas(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  const raw = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
  const tile = buildTile(raw.data, raw.width, raw.height, 4, px, rotation);
  tileCache.set(key, tile);
  return tile;
}

/**
 * Target length of one uninterrupted paint slice, in ms.
 *
 * Painting a whole zone in one call is ~1.9s of unbroken main thread on a
 * throttled mobile CPU — measured on the live Turban page against the same URL
 * with a uni colour, where this layer paints nothing: total blocking time went
 * 350ms -> 2210ms, Lighthouse performance 70 -> 50. The work itself is not the
 * problem, its granularity is: a long task counts as blocking for everything
 * beyond 50ms, so one 1.9s task is ~1.85s of blocking while many short ones are
 * none.
 *
 * Slicing by a fixed row count was the first attempt and only got TBT to
 * 1360ms: 48 rows happens to be well over 50ms on that profile. Fixing the row
 * count means tuning to one CPU, so the band is sized by the CLOCK instead —
 * paint rows until the slice has run this long, then yield. Slow phone, fast
 * laptop, throttled audit: all end up with slices of the same duration and none
 * of them are long tasks.
 */
const SLICE_MS = 16;

/** Rows per measurement step — small enough to overshoot SLICE_MS only barely. */
const STEP_ROWS = 8;

/** Yield to the event loop so the browser can paint and handle input. */
function yieldToBrowser() {
  return new Promise((resolve) => {
    // A message-channel tick is a macrotask, so it genuinely ends the current
    // task; a resolved Promise would only queue a microtask and keep blocking.
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve(undefined);
    };
    ch.port2.postMessage(null);
  });
}

/** Run `fn` once the browser is idle, without blocking first paint. */
function whenIdle(fn: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(fn, { timeout: 400 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 60);
  return () => window.clearTimeout(id);
}

export function ReliefFabricLayer({
  assetBase,
  width,
  height,
  zones,
  onReady,
}: ReliefLayerProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [painted, setPainted] = React.useState(false);

  // Only zones that actually carry a print can be relief-rendered; a uni colour
  // has no geometry to displace and keeps the shipped multiply path.
  const fabricZones = React.useMemo(
    () => zones.filter((z) => Boolean(z.paint.textureSrc)),
    [zones],
  );
  // A string key, not the array: the parent rebuilds `paints` on every render.
  const key = React.useMemo(
    () =>
      fabricZones
        .map((z) => `${z.zone}:${z.paint.textureSrc}:${z.paint.rotation ?? 0}`)
        .join("|"),
    [fabricZones],
  );

  const report = React.useCallback(
    (ready: boolean) => {
      setPainted(ready);
      onReady?.(ready);
    },
    [onReady],
  );

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !key) {
      report(false);
      return;
    }
    let cancelled = false;

    const cancelIdle = whenIdle(() => {
      void (async () => {
        try {
          const relief = await loadImageData(`${assetBase}/relief.webp`);
          if (cancelled) return;
          if (relief.width !== width || relief.height !== height) {
            // A relief map that does not match the photo would displace every
            // pixel by a wrong offset — fail over to the CSS stack instead.
            throw new Error(
              `relief ${relief.width}x${relief.height} != photo ${width}x${height}`,
            );
          }

          const layer = new ImageData(width, height);
          const maskAlpha = new Uint8Array(width * height);
          for (const spec of fabricZones) {
            const mask = await loadImageData(spec.maskSrc);
            if (cancelled) return;
            if (mask.width !== width || mask.height !== height) {
              throw new Error(`mask ${spec.maskSrc} is ${mask.width}x${mask.height}`);
            }
            for (let p = 0; p < maskAlpha.length; p++) {
              maskAlpha[p] = mask.data[p * 4 + 3];
            }
            const grain = grainFor(spec.zone);
            const tile = await loadTile(
              spec.paint.textureSrc as string,
              spec.paint.rotation ?? 0,
              tilePx(width, grain),
            );
            if (cancelled) return;
            let y = 0;
            while (y < height) {
              const sliceStart = performance.now();
              // Paint in small steps and stop as soon as this slice has used
              // its budget, so the yield rate follows the actual device speed.
              do {
                const end = Math.min(height, y + STEP_ROWS);
                paintReliefZone(
                  layer.data,
                  relief.data,
                  maskAlpha,
                  tile,
                  width,
                  height,
                  grain,
                  y,
                  end,
                );
                y = end;
              } while (y < height && performance.now() - sliceStart < SLICE_MS);
              await yieldToBrowser();
              if (cancelled) return;
            }
          }
          if (cancelled) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("no 2d context");
          ctx.clearRect(0, 0, width, height);
          ctx.putImageData(layer, 0, 0);
          report(true);
        } catch (err) {
          if (cancelled) return;
          // Falling back is always correct here: the CSS zones underneath are
          // the previously shipped preview, so the worst case is the old look.
          if (process.env.NODE_ENV !== "production") {
            console.warn("[relief] falling back to the CSS fabric layer:", err);
          }
          report(false);
        }
      })();
    });

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [assetBase, fabricZones, height, key, report, width]);

  if (!key) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      width={width}
      height={height}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        // `normal`, not `multiply`: the relief render already carries the
        // garment's light. Blending it again would double the shading.
        mixBlendMode: "normal",
        pointerEvents: "none",
        opacity: painted ? 1 : 0,
      }}
    />
  );
}

/**
 * Which zones the relief layer has taken over, so the photo component can hide
 * the matching CSS overlays. Hiding them before the canvas has painted would
 * flash an unpainted garment, so this is driven by the layer's `onReady`.
 */
export function useReliefTakeover(zones: ReliefZoneSpec[]) {
  const [ready, setReady] = React.useState(false);
  const takenOver = React.useMemo(() => {
    if (!ready) return new Set<string>();
    return new Set(zones.filter((z) => z.paint.textureSrc).map((z) => z.zone));
  }, [ready, zones]);
  return { takenOver, onReady: setReady };
}
