import {
  PALETTE,
  resolveColor,
  resolveSwatchId,
  swatchChipStyle,
  type Swatch,
} from "../hose/palette";

export { PALETTE, resolveColor, resolveSwatchId, swatchChipStyle };
export type { Swatch };

export type MuetzeRegionParam = "muetze" | "futter";

export interface MuetzeRegionDef {
  id: MuetzeRegionParam;
  param: MuetzeRegionParam;
  label: string;
  description: string;
  defaultColor: string;
}

export const MUETZE_REGIONS: readonly MuetzeRegionDef[] = [
  {
    id: "muetze",
    param: "muetze",
    label: "Mütze",
    description: "Der gemusterte Hauptstoff der Mütze.",
    defaultColor: "sage",
  },
  {
    id: "futter",
    param: "futter",
    label: "Futter",
    description: "Das sichtbare Innenfutter — weiches uni Kontrastfarbstück.",
    defaultColor: "powder-pink",
  },
] as const;
