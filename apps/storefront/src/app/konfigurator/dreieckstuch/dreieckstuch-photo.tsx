"use client";

import * as React from "react";

import { ZoneOverlay, type ZonePaint } from "../_shared/zone-overlay";
import { ReliefFabricLayer, useReliefTakeover } from "../_shared/relief-layer";

export interface DreieckstuchPhotoPaints {
  tuch: ZonePaint;
}

interface DreieckstuchPhotoProps {
  paints: DreieckstuchPhotoPaints;
  title?: string;
  className?: string;
}

/**
 * Fotorealistische Konfigurator-Vorschau: das echte Bilulu-Dreieckstuch
 * "Kleiner Zoo" (freigestellt, entsättigt) als Basis, überlagert mit einer
 * einfärbbaren Zone (Hauptstoff). Prinzip wie TurbanPhoto/MuetzePhoto:
 * mix-blend-mode: multiply über Graustufen-Basis. Der Hauptstoff kann einen
 * Stoffdruck rendern.
 *
 * Assets werden von scripts/bil2446-build-dreieckstuch-assets.mjs erzeugt.
 *
 * BIL-2522 — auf einem gewählten Stoff liegt zusätzlich die Relief-Ebene. Das
 * Tuch liegt flach, also ist der Effekt hier bewusst zurückhaltend: weicher
 * Faltenwurf und eine gerundete Saumkante statt einer ausgestanzten Silhouette.
 */
const ASSET_BASE = "/konfigurator/dreieckstuch-foto";
const ASSET_W = 900;
const ASSET_H = 482;

const ZONES = [
  { zone: "tuch", mask: `${ASSET_BASE}/mask-tuch.webp` },
] as const;

export function DreieckstuchPhoto({
  paints,
  title = "Dreieckstuch-Vorschau",
  className,
}: DreieckstuchPhotoProps) {
  const zoneSpecs = React.useMemo(
    () =>
      ZONES.map(({ zone, mask }) => ({
        zone,
        maskSrc: mask,
        paint: paints[zone as keyof DreieckstuchPhotoPaints],
      })),
    [paints],
  );
  const { takenOver, onReady } = useReliefTakeover(zoneSpecs);

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
        fetchPriority="high"
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
      {zoneSpecs.map((spec) => (
        <ZoneOverlay
          key={spec.zone}
          src={spec.maskSrc}
          paint={spec.paint}
          ratio={ASSET_W / ASSET_H}
          hidden={takenOver.has(spec.zone)}
        />
      ))}
      <ReliefFabricLayer
        assetBase={ASSET_BASE}
        width={ASSET_W}
        height={ASSET_H}
        zones={zoneSpecs}
        onReady={onReady}
      />
    </div>
  );
}
