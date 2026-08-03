import { PALETTE, resolveColor, resolveSwatchId, type Swatch } from "../hose/palette";

export { PALETTE, resolveColor, resolveSwatchId };
export type { Swatch };

export type TurbanRegionParam = "turban" | "schleife";

export interface TurbanRegionDef {
  id: TurbanRegionParam;
  /** URL search-param key */
  param: TurbanRegionParam;
  label: string;
  description: string;
  defaultColor: string;
}

export const TURBAN_REGIONS: readonly TurbanRegionDef[] = [
  {
    id: "turban",
    param: "turban",
    label: "Turban",
    description: "Der Hauptstoff der Mütze — vorn gerafft, hinten glatt.",
    defaultColor: "cream",
  },
  {
    id: "schleife",
    param: "schleife",
    label: "Schleife",
    description: "Die aufgenähte Schleife vorn an der Mütze.",
    defaultColor: "terracotta",
  },
] as const;
