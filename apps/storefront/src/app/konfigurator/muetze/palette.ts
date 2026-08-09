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

export type MuetzeRegionParam = "muetze" | "futter";

export interface MuetzeRegionDef {
  id: MuetzeRegionParam;
  param: MuetzeRegionParam;
  label: string;
  description: string;
  defaultColor: string;
  allowsFabrics?: boolean;
}

export const MUETZE_REGIONS: readonly MuetzeRegionDef[] = [
  {
    id: "muetze",
    param: "muetze",
    label: "Mütze",
    description: "Der gemusterte Hauptstoff der Mütze.",
    defaultColor: "sage",
    allowsFabrics: true,
  },
  {
    id: "futter",
    param: "futter",
    label: "Futter",
    description: "Das sichtbare Innenfutter — weiches uni Kontrastfarbstück.",
    defaultColor: "powder-pink",
  },
] as const;
