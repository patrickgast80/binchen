import { PALETTE, resolveColor, resolveSwatchId, type Swatch } from "../hose/palette";

export { PALETTE, resolveColor, resolveSwatchId };
export type { Swatch };

export type DreieckstuchRegionParam = "tuch";

export interface DreieckstuchRegionDef {
  id: DreieckstuchRegionParam;
  param: DreieckstuchRegionParam;
  label: string;
  description: string;
  defaultColor: string;
}

export const DREIECKSTUCH_REGIONS: readonly DreieckstuchRegionDef[] = [
  {
    id: "tuch",
    param: "tuch",
    label: "Tuch",
    description: "Der Hauptstoff des Dreieckstuchs — Vorder- und Rückseite.",
    defaultColor: "powder-pink",
  },
] as const;
