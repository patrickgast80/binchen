/**
 * Muster-Rotation (BIL-2492).
 *
 * Board request: "Man sollte beim Konfigurator den Hauptstoff drehen können."
 * Only the main zone of each konfigurator offers fabric prints (`allowsFabrics`
 * in every palette.ts), so a single URL param covers every rotatable zone —
 * uni colours are rotation-invariant and simply ignore it.
 *
 * The angle lives in the query string (`?rot=90`) exactly like the colour
 * choices do. That is what makes save/share (BIL-2454) work for free: the
 * saved-config `href` and the shared link are built from the same
 * `URLSearchParams`, so a rotated configuration restores rotated.
 */

/** Query-param key carrying the fabric rotation. Absent means 0°. */
export const ROTATION_PARAM = "rot";

export type MusterRotation = 0 | 90 | 180 | 270;

export const ROTATIONS: readonly MusterRotation[] = [0, 90, 180, 270] as const;

/**
 * Reads a rotation from a query value. Anything that is not one of the four
 * quarter turns falls back to 0° — a hand-edited `?rot=45` must not skew the
 * masks, and an unrotated preview is the safe default.
 */
export function parseRotation(raw: string | null | undefined): MusterRotation {
  const n = Number(raw);
  return (ROTATIONS as readonly number[]).includes(n) ? (n as MusterRotation) : 0;
}

/** Next quarter turn for the cycling "Muster drehen" button. */
export function nextRotation(current: MusterRotation): MusterRotation {
  return (((current + 90) % 360) as MusterRotation);
}

/** Human label used in the button, the screen-reader announcement and cart metadata. */
export function rotationLabel(rotation: MusterRotation): string {
  return `${rotation}°`;
}
