import type { RegionDef } from "../hose/palette";

/**
 * BIL-2499 — regions for the short Pumphose "Dinos".
 *
 * Same three zones and the same param names as the long Hose, so a shared link
 * reads identically on both routes and a visitor who knows one configurator
 * knows the other (Jakob's Law). Only the defaults differ: they reproduce the
 * real garment Sabine photographed — turquoise printed body, warm band and
 * cuffs.
 *
 * Swatches, chip styling and resolution helpers are the Hose's; there is one
 * Bilulu palette, and forking it per garment is how two configurators start
 * offering different colours by accident.
 */
export const REGIONS: readonly RegionDef[] = [
  {
    id: "bund",
    param: "bund",
    label: "Bund",
    description: "Der breite, elastische Bund am oberen Ende der kurzen Hose.",
    defaultColor: "terracotta",
  },
  {
    id: "hose",
    param: "hose",
    label: "Hose",
    description: "Das Hauptteil der kurzen Hose — hier kommen die Stoffe hin.",
    defaultColor: "petrol",
    allowsFabrics: true,
  },
  {
    id: "buendchen",
    param: "buendchen",
    label: "Bündchen",
    description: "Die Bündchen an den kurzen Beinen.",
    defaultColor: "terracotta",
  },
] as const;

export {
  FABRICS,
  PALETTE,
  SWATCH_BY_ID,
  resolveColor,
  resolveHoseParam,
  resolveSwatch,
  resolveSwatchId,
  swatchChipStyle,
  swatchesForRegion,
} from "../hose/palette";
export type { RegionDef, RegionId, Swatch } from "../hose/palette";
