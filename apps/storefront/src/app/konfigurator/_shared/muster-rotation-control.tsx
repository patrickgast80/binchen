"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { type MusterRotation, rotationLabel } from "./rotation";

interface MusterRotationControlProps {
  rotation: MusterRotation;
  /** Advances to the next quarter turn. */
  onRotate: () => void;
  /** Zone the rotation applies to, e.g. "Hose" — used in the accessible name. */
  zoneLabel: string;
  className?: string;
}

/**
 * "Muster drehen" — cycles the fabric print through 0° → 90° → 180° → 270°.
 *
 * A single cycling button rather than a four-way radio group: rotating a photo
 * by tapping one button is the pattern every phone gallery uses (Jakob's Law),
 * it costs one tap target instead of four in the crowded action row, and it
 * stays a 44px target on mobile. The current angle is shown next to the label
 * so the state is recognised, not recalled, and the icon mirrors it.
 */
export function MusterRotationControl({
  rotation,
  onRotate,
  zoneLabel,
  className,
}: MusterRotationControlProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onRotate}
      className={className}
      aria-label={`Stoffmuster für ${zoneLabel} drehen — aktuell ${rotationLabel(rotation)}`}
    >
      <RotateCw
        className={cn("h-4 w-4 transition-transform motion-reduce:transition-none")}
        style={{ transform: `rotate(${rotation}deg)` }}
        aria-hidden="true"
      />
      Muster drehen
      <span
        aria-hidden="true"
        className="rounded-full bg-binchen-cream-dark px-2 py-0.5 font-medium tabular-nums text-binchen-ink"
      >
        {rotationLabel(rotation)}
      </span>
    </Button>
  );
}
