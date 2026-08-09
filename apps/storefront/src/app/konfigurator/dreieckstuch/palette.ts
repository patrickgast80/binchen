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

export type DreieckstuchRegionParam = "tuch";

export interface DreieckstuchRegionDef {
  id: DreieckstuchRegionParam;
  param: DreieckstuchRegionParam;
  label: string;
  description: string;
  defaultColor: string;
  allowsFabrics?: boolean;
}

export const DREIECKSTUCH_REGIONS: readonly DreieckstuchRegionDef[] = [
  {
    id: "tuch",
    param: "tuch",
    label: "Tuch",
    description: "Der Hauptstoff des Dreieckstuchs — Vorder- und Rückseite.",
    defaultColor: "powder-pink",
    allowsFabrics: true,
  },
] as const;
