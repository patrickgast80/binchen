import {
  FABRICS,
  PALETTE,
  resolveColor,
  resolveSwatch,
  resolveSwatchId,
  swatchChipStyle,
  swatchesForRegion,
  type Swatch,
} from "../hose/palette";

export {
  FABRICS,
  PALETTE,
  resolveColor,
  resolveSwatch,
  resolveSwatchId,
  swatchChipStyle,
  swatchesForRegion,
};
export type { Swatch };

export type TurbanRegionParam = "turban" | "schleife";

export interface TurbanRegionDef {
  id: TurbanRegionParam;
  /** URL search-param key */
  param: TurbanRegionParam;
  label: string;
  description: string;
  defaultColor: string;
  allowsFabrics?: boolean;
}

export const TURBAN_REGIONS: readonly TurbanRegionDef[] = [
  {
    id: "turban",
    param: "turban",
    label: "Turban",
    description: "Der Hauptstoff der Mütze — vorn gerafft, hinten glatt.",
    defaultColor: "cream",
    allowsFabrics: true,
  },
  {
    id: "schleife",
    param: "schleife",
    label: "Schleife",
    description: "Die aufgenähte Schleife vorn an der Mütze.",
    defaultColor: "terracotta",
  },
] as const;
