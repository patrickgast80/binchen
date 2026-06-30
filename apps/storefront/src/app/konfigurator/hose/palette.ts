export type RegionId = "bund" | "main-left" | "main-right" | "buendchen";

export interface Swatch {
  id: string;
  name: string;
  hex: string;
}

export interface RegionDef {
  id: RegionId;
  /** URL search-param key */
  param: "bund" | "links" | "rechts" | "buendchen";
  label: string;
  description: string;
  defaultColor: string;
}

export const REGIONS: readonly RegionDef[] = [
  {
    id: "bund",
    param: "bund",
    label: "Bund",
    description: "Der elastische Bund am oberen Ende der Hose.",
    defaultColor: "petrol",
  },
  {
    id: "main-left",
    param: "links",
    label: "Hauptteil links",
    description: "Das linke Hosenbein, der größte Stoffanteil.",
    defaultColor: "cream",
  },
  {
    id: "main-right",
    param: "rechts",
    label: "Hauptteil rechts",
    description: "Das rechte Hosenbein, der größte Stoffanteil.",
    defaultColor: "cream",
  },
  {
    id: "buendchen",
    param: "buendchen",
    label: "Bündchen",
    description: "Die beiden gefütterten Bündchen am Hosensaum.",
    defaultColor: "petrol",
  },
] as const;

/**
 * Curated Bilulu-Palette in warmen, kinderzimmertauglichen Farbtönen.
 * IDs sind URL-sicher und stabil; bitte beim Erweitern nicht umnummerieren.
 */
export const PALETTE: readonly Swatch[] = [
  { id: "cream", name: "Creme", hex: "#FAF7F2" },
  { id: "sand", name: "Sand", hex: "#E8DDC8" },
  { id: "taupe", name: "Taupe", hex: "#B5A48A" },
  { id: "powder-pink", name: "Puderrosa", hex: "#E8C2C2" },
  { id: "terracotta", name: "Terrakotta", hex: "#C4704A" },
  { id: "rust", name: "Rost", hex: "#7A3318" },
  { id: "mustard", name: "Senfgelb", hex: "#D4A24C" },
  { id: "sage", name: "Salbei", hex: "#A8C5AB" },
  { id: "forest", name: "Tannengrün", hex: "#3F6444" },
  { id: "sky", name: "Himmelblau", hex: "#A8C8D8" },
  { id: "petrol", name: "Petrol", hex: "#5BA8AE" },
  { id: "navy", name: "Marineblau", hex: "#2D3E50" },
] as const;

export const SWATCH_BY_ID: Record<string, Swatch> = Object.fromEntries(
  PALETTE.map((s) => [s.id, s]),
);

export function resolveColor(id: string | null | undefined, fallback: string): string {
  if (!id) return SWATCH_BY_ID[fallback]?.hex ?? "#FAF7F2";
  return SWATCH_BY_ID[id]?.hex ?? SWATCH_BY_ID[fallback]?.hex ?? "#FAF7F2";
}

export function resolveSwatchId(id: string | null | undefined, fallback: string): string {
  if (id && SWATCH_BY_ID[id]) return id;
  return fallback;
}
