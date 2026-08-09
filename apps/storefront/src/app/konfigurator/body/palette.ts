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

export type BodyRegionParam = "hauptteil" | "halsbund" | "aermelbund";

export interface BodyRegionDef {
  id: BodyRegionParam;
  param: BodyRegionParam;
  label: string;
  description: string;
  defaultColor: string;
  allowsFabrics?: boolean;
}

export const BODY_REGIONS: readonly BodyRegionDef[] = [
  {
    id: "hauptteil",
    param: "hauptteil",
    label: "Hauptteil",
    description: "Der Rumpf des Bodys — Vorder- und Rückseite, inkl. Ärmel.",
    defaultColor: "cream",
    allowsFabrics: true,
  },
  {
    id: "halsbund",
    param: "halsbund",
    label: "Halsbündchen",
    description: "Der elastische Ausschnitt-Ring am Hals.",
    defaultColor: "sage",
  },
  {
    id: "aermelbund",
    param: "aermelbund",
    label: "Ärmelbündchen",
    description: "Die gefütterten Bündchen an beiden Ärmelenden.",
    defaultColor: "sage",
  },
] as const;
