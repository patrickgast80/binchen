"use client";

import * as React from "react";

import type { ZonePaint } from "./zone-overlay";
import {
  grainFor,
  paintReliefZone,
  resampleTileRows,
  rotateTileRows,
  rotatedTileSize,
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
 *
 * BIL-2531 — every step here runs in clock-sized slices, not just the paint.
 * TTI on this page was the end of the last long task to the millisecond across
 * six audits, and the three that remained were the whole-asset steps around the
 * paint loop: the relief readback, the mask alpha copy plus tile build, and the
 * final `putImageData`. None of them is much WORK; each was one task. Slicing
 * them is byte-neutral by construction — see the note on `inSlices` — and
 * `apps/e2e/scripts/bil2531-slice-equivalence.mjs` checks the tile half of that
 * against the one-shot code path offline.
 *
 * That halved those blocks but did not remove them; what was left in each was
 * an image DECODE, which no amount of slicing reaches because it is one call
 * inside the browser. See `decodeImage` below.
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
  /**
   * BIL-2533 — whether UNI zones are painted here too, not just printed ones.
   *
   * Opt-in per Konfigurator, and deliberately not a global switch: it is only
   * correct where `relief.webp` was built with cut-piece structure (the rib and
   * the seams — `ZONE_STRUCTURE` in scripts/bil2522-build-relief.mjs). On a map
   * without it a uni zone would swap its shipped multiply for the relief shade
   * and gain nothing for the change, which is exactly the silent five-way
   * rollout the board asked not to happen before it has seen the proof.
   */
  uniZones?: boolean;
  onReady?: (ready: boolean) => void;
}

/** Decoded assets are shared across zones, rotations and re-renders. */
const imageDataCache = new Map<string, ImageData>();
const tileCache = new Map<string, { data: Uint8ClampedArray; TW: number; TH: number; stride: number }>();

/**
 * Target length of one uninterrupted slice, in ms.
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

/** Rows per measurement step for the relief paint — the expensive inner loop. */
const STEP_ROWS = 8;

/**
 * Rows per measurement step for the band work around it: mask alpha copy,
 * canvas readback, canvas commit, tile resample. Those are memcpy-shaped rather
 * than per-pixel maths and each call carries fixed overhead, so measuring every
 * 8 rows would spend most of the slice reading the clock. The slice is still
 * ended by SLICE_MS, not by this number — see the note above.
 */
const BAND_ROWS = 64;

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

/** True once the effect has been torn down under an in-flight await. */
type Cancelled = () => boolean;

/**
 * BIL-2531 — walk `[0,total)` in clock-sized slices, yielding between them.
 * Returns false if the work was cancelled part-way through.
 *
 * Every caller's `run` writes rows that depend only on its inputs and reads
 * nothing it has written, so how the range is partitioned cannot change the
 * bytes produced — only when they land. That is what keeps the rendered pixels
 * byte-identical while the task graph gets finer.
 */
async function inSlices(
  total: number,
  step: number,
  run: (y0: number, y1: number) => void,
  cancelled: Cancelled,
): Promise<boolean> {
  let y = 0;
  while (y < total) {
    const sliceStart = performance.now();
    // Advance in small steps and stop as soon as this slice has used its
    // budget, so the yield rate follows the actual device speed.
    do {
      const end = Math.min(total, y + step);
      run(y, end);
      y = end;
    } while (y < total && performance.now() - sliceStart < SLICE_MS);
    await yieldToBrowser();
    if (cancelled()) return false;
  }
  return true;
}

function scratchCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  return { canvas, ctx };
}

/**
 * Decode an asset OFF the main thread.
 *
 * BIL-2531, second pass. Slicing the four assembly steps shrank the three late
 * long tasks (251/161/130 -> 116/86/80 ms) but did not remove them, and a CDP
 * trace of the live page says why: what is left in each of them is a
 * `Decode Image` event, not our arithmetic. `HTMLImageElement.decode()` returns
 * a promise but Chrome still runs the decode as a main-thread task, so awaiting
 * it only moves the block, it does not remove it. The control is exact — the
 * same route with a uni colour, where this layer never runs, has zero such
 * tasks (`apps/e2e/scripts/bil2531-task-attribution.mjs`).
 *
 * `createImageBitmap` on a Blob decodes on a worker thread, so the main thread
 * only sees the (cheap) upload. Pixels are unaffected: no options are passed,
 * so colour-space conversion and premultiplication stay at the same defaults
 * the `<img>` path used, and `bil2531-decode-equivalence.mjs` compares both
 * readbacks byte-for-byte in a real browser for exactly the three assets this
 * layer loads.
 *
 * Falls back to the `<img>` path when `createImageBitmap` or blob decoding is
 * missing — a slow correct preview beats no preview (property 1 above).
 */
async function decodeImage(src: string): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      const res = await fetch(src, { credentials: "same-origin" });
      if (res.ok) return await createImageBitmap(await res.blob());
    } catch {
      /* falls through to the <img> path below */
    }
  }
  const img = new Image();
  // Same-origin assets; set anyway so a future CDN move cannot silently taint
  // the canvas and turn getImageData into a SecurityError at runtime.
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  return img;
}

function sizeOf(img: ImageBitmap | HTMLImageElement) {
  return img instanceof HTMLImageElement
    ? { w: img.naturalWidth, h: img.naturalHeight }
    : { w: img.width, h: img.height };
}

/**
 * Decode an asset and read it back as pixels, without ever holding the thread.
 *
 * A full-frame `getImageData` of the 900x1006 relief map is a single readback
 * of ~3.6 MB and was one of the three late long tasks BIL-2531 measured. The
 * readback is split into bands instead: `getImageData` on a sub-rectangle is a
 * straight copy out of the same backing store, so the assembled buffer is
 * byte-for-byte what one call returns.
 *
 * Resolves to `null` — and only then — when the caller was cancelled mid-flight.
 */
async function loadImageData(
  src: string,
  cancelled: Cancelled,
  { cache = true }: { cache?: boolean } = {},
): Promise<ImageData | null> {
  const hit = imageDataCache.get(src);
  if (hit) return hit;
  const img = await decodeImage(src);
  if (cancelled()) {
    if (!(img instanceof HTMLImageElement)) img.close();
    return null;
  }
  const { w, h } = sizeOf(img);
  const { ctx } = scratchCanvas(w, h);
  ctx.drawImage(img, 0, 0);
  // An ImageBitmap holds its own copy of the pixels until it is closed; the
  // canvas has them now, so hand the memory back instead of waiting for GC.
  if (!(img instanceof HTMLImageElement)) img.close();
  // The upload above is one indivisible blit; give the thread back before
  // starting the readback rather than chaining both into the same task.
  await yieldToBrowser();
  if (cancelled()) return null;
  const data = new ImageData(w, h);
  const ok = await inSlices(
    h,
    BAND_ROWS,
    (y0, y1) => data.data.set(ctx.getImageData(0, y0, w, y1 - y0).data, y0 * w * 4),
    cancelled,
  );
  if (!ok) return null;
  if (cache) imageDataCache.set(src, data);
  return data;
}

async function loadTile(src: string, rotation: number, px: number, cancelled: Cancelled) {
  const key = `${src}|${rotation}|${px}`;
  const cached = tileCache.get(key);
  if (cached) return cached;
  // Decode at NATIVE size and let the shared resampler scale it. Handing the
  // scale to drawImage would use Chromium's filter, which disagrees with the
  // Node evidence renderer by enough to invalidate an offline before/after.
  // Rotating the (seamless — BIL-2508) tile is equivalent to rotating the
  // whole tiling plane the CSS fallback turns, and keeps the wrap a modulo.
  //
  // Not cached as pixels: a swatch is only ever needed to build the tile, and
  // the tile itself is what gets reused across re-renders.
  const raw = await loadImageData(src, cancelled, { cache: false });
  if (!raw) return null;

  // `buildTile` in two sliced halves. Both are row-wise and order-free, so this
  // produces the same buffer the one-shot call in relief-math.mjs does — which
  // is still what the Node evidence renderer runs.
  const scaled = new Uint8ClampedArray(px * px * 3);
  const resampled = await inSlices(
    px,
    BAND_ROWS,
    (y0, y1) => resampleTileRows(scaled, raw.data, raw.width, raw.height, 4, px, px, y0, y1),
    cancelled,
  );
  if (!resampled) return null;

  const { TW, TH } = rotatedTileSize(px, px, rotation);
  let tile: { data: Uint8ClampedArray; TW: number; TH: number; stride: number };
  if (TW === px && TH === px && rotation % 360 === 0) {
    tile = { data: scaled, TW, TH, stride: 3 };
  } else {
    const turned = new Uint8ClampedArray(TW * TH * 3);
    const rotated = await inSlices(
      px,
      BAND_ROWS,
      (y0, y1) => rotateTileRows(turned, scaled, px, px, TW, rotation, y0, y1),
      cancelled,
    );
    if (!rotated) return null;
    tile = { data: turned, TW, TH, stride: 3 };
  }
  tileCache.set(key, tile);
  return tile;
}

/**
 * A uni colour as a 1x1 tile (BIL-2533).
 *
 * `sampleTile` wraps with a modulo and its Catmull-Rom weights sum to 1, so a
 * one-pixel tile returns that pixel for every coordinate — the displacement
 * still runs, it just has nothing to move. That keeps ONE paint path for both
 * kinds of zone instead of a second, subtly different one for uni colours,
 * which is what let the waistband drift away from the rest of the garment in
 * the first place.
 */
function uniTile(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const data = new Uint8ClampedArray(3);
  for (let c = 0; c < 3; c++) data[c] = parseInt(full.slice(c * 2, c * 2 + 2), 16) || 0;
  return { data, TW: 1, TH: 1, stride: 3 };
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
  uniZones = false,
  onReady,
}: ReliefLayerProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [painted, setPainted] = React.useState(false);

  // BIL-2533 — uni zones render through here as well now.
  //
  // Until Pass 3 this filtered on `textureSrc`, on the reasoning that a uni
  // colour "has no geometry to displace". That was the wrong half of the
  // sentence: it has no PRINT to displace, but it has exactly as much geometry
  // as a printed one — and skipping it is why the board's waistband was a flat
  // gradient next to a ribbed original. The relief map now carries the rib and
  // the seams (BIL-2533 in bil2522-relief.mjs), so a uni zone painted through
  // this layer gains the rib, the fold shading and the seam depth, while a uni
  // zone that is NOT in the map's zone list looks exactly as it did.
  const fabricZones = React.useMemo(
    () => (uniZones ? zones : zones.filter((z) => Boolean(z.paint.textureSrc))),
    [uniZones, zones],
  );
  // A string key, not the array: the parent rebuilds `paints` on every render.
  const key = React.useMemo(
    () =>
      fabricZones
        .map((z) => `${z.zone}:${z.paint.textureSrc ?? z.paint.hex}:${z.paint.rotation ?? 0}`)
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
    const isCancelled = () => cancelled;

    const cancelIdle = whenIdle(() => {
      void (async () => {
        try {
          const relief = await loadImageData(`${assetBase}/relief.webp`, isCancelled);
          if (!relief) return;
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
            const mask = await loadImageData(spec.maskSrc, isCancelled);
            if (!mask) return;
            if (mask.width !== width || mask.height !== height) {
              throw new Error(`mask ${spec.maskSrc} is ${mask.width}x${mask.height}`);
            }
            // 905k entries for the Hose photo — cheap per element and still a
            // long task when run at a stretch (BIL-2531).
            const copied = await inSlices(
              height,
              BAND_ROWS,
              (y0, y1) => {
                for (let p = y0 * width; p < y1 * width; p++) {
                  maskAlpha[p] = mask.data[p * 4 + 3];
                }
              },
              isCancelled,
            );
            if (!copied) return;

            const grain = grainFor(spec.zone);
            const tile = spec.paint.textureSrc
              ? await loadTile(
                  spec.paint.textureSrc,
                  spec.paint.rotation ?? 0,
                  tilePx(width, grain),
                  isCancelled,
                )
              : uniTile(spec.paint.hex);
            if (!tile) return;

            const drawn = await inSlices(
              height,
              STEP_ROWS,
              (y0, y1) =>
                paintReliefZone(
                  layer.data,
                  relief.data,
                  maskAlpha,
                  tile,
                  width,
                  height,
                  grain,
                  y0,
                  y1,
                ),
              isCancelled,
            );
            if (!drawn) return;
          }
          if (cancelled) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("no 2d context");
          ctx.clearRect(0, 0, width, height);
          // Committed in bands rather than as one 905k-pixel swap. The canvas
          // is still at opacity 0 throughout, so no half-painted state is ever
          // visible and the reveal below stays a single step.
          const committed = await inSlices(
            height,
            BAND_ROWS,
            (y0, y1) => ctx.putImageData(layer, 0, 0, 0, y0, width, y1 - y0),
            isCancelled,
          );
          if (!committed) return;
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
export function useReliefTakeover(zones: ReliefZoneSpec[], uniZones = false) {
  const [ready, setReady] = React.useState(false);
  const takenOver = React.useMemo(() => {
    if (!ready) return new Set<string>();
    // Must match the layer's own filter exactly. A zone hidden here but not
    // painted there is a hole in the garment; painted but not hidden is the
    // CSS multiply showing through the relief render.
    return new Set(
      zones.filter((z) => uniZones || z.paint.textureSrc).map((z) => z.zone),
    );
  }, [ready, uniZones, zones]);
  return { takenOver, onReady: setReady };
}
