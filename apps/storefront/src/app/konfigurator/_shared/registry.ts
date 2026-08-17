import { FABRICS, PALETTE } from "../hose/palette";

/** Uni palette + board-delivered fabric prints, in one flat lookup. */
const ALL_SWATCHES = [...PALETTE, ...FABRICS];

export type KonfiguratorId = "hose" | "turban" | "muetze" | "dreieckstuch" | "body";

export interface KonfigMaskEntry {
  /** URL search-param key the konfigurator uses for this region. */
  param: string;
  /** Public path to the alpha mask webp. */
  src: string;
  /** Human-facing region label (matches konfigurator UI). */
  label: string;
  /** Default swatch id used when the param is absent. */
  defaultColor: string;
}

export interface KonfigRegistryEntry {
  id: KonfiguratorId;
  /** Route path (without trailing query). */
  path: string;
  /** Short product label — used in generated save names and OG cards. */
  productLabel: string;
  /** Base photo URL and intrinsic pixel dimensions. */
  basePhoto: string;
  width: number;
  height: number;
  /**
   * Optional screen-blend sheen layer (only built for konfigurators whose base
   * photo lost its lit side to the multiply stack). Consumed by the OG
   * compositor; the client photo components reference it directly.
   */
  sheenPhoto?: string;
  /** Ordered list of tintable regions, matching the *-photo.tsx overlay order. */
  regions: readonly KonfigMaskEntry[];
}

const HOSE: KonfigRegistryEntry = {
  id: "hose",
  path: "/konfigurator/hose",
  productLabel: "Hose",
  basePhoto: "/konfigurator/hose-foto/base.webp",
  sheenPhoto: "/konfigurator/hose-foto/highlight.webp",
  width: 900,
  height: 1006,
  regions: [
    {
      param: "bund",
      src: "/konfigurator/hose-foto/mask-bund.webp",
      label: "Bund",
      defaultColor: "petrol",
    },
    {
      param: "hose",
      src: "/konfigurator/hose-foto/mask-hose.webp",
      label: "Hose",
      defaultColor: "cream",
    },
    {
      param: "buendchen",
      src: "/konfigurator/hose-foto/mask-buendchen.webp",
      label: "Bündchen",
      defaultColor: "petrol",
    },
  ],
};

const TURBAN: KonfigRegistryEntry = {
  id: "turban",
  path: "/konfigurator/turban",
  productLabel: "Turban-Mütze",
  basePhoto: "/konfigurator/turban-foto/base.webp",
  width: 900,
  height: 796,
  regions: [
    {
      param: "turban",
      src: "/konfigurator/turban-foto/mask-turban.webp",
      label: "Turban",
      defaultColor: "cream",
    },
    {
      param: "schleife",
      src: "/konfigurator/turban-foto/mask-schleife.webp",
      label: "Schleife",
      defaultColor: "terracotta",
    },
  ],
};

const MUETZE: KonfigRegistryEntry = {
  id: "muetze",
  path: "/konfigurator/muetze",
  productLabel: "Mütze",
  basePhoto: "/konfigurator/muetze-foto/base.webp",
  sheenPhoto: "/konfigurator/muetze-foto/highlight.webp",
  width: 900,
  height: 880,
  regions: [
    {
      param: "muetze",
      src: "/konfigurator/muetze-foto/mask-muetze.webp",
      label: "Mütze",
      defaultColor: "sage",
    },
    {
      param: "futter",
      src: "/konfigurator/muetze-foto/mask-futter.webp",
      label: "Futter",
      defaultColor: "powder-pink",
    },
  ],
};

const DREIECKSTUCH: KonfigRegistryEntry = {
  id: "dreieckstuch",
  path: "/konfigurator/dreieckstuch",
  productLabel: "Dreieckstuch",
  basePhoto: "/konfigurator/dreieckstuch-foto/base.webp",
  width: 900,
  height: 482,
  regions: [
    {
      param: "tuch",
      src: "/konfigurator/dreieckstuch-foto/mask-tuch.webp",
      label: "Tuch",
      defaultColor: "powder-pink",
    },
  ],
};

const BODY: KonfigRegistryEntry = {
  id: "body",
  path: "/konfigurator/body",
  productLabel: "Body",
  basePhoto: "/konfigurator/body-foto/base.webp",
  width: 900,
  height: 737,
  regions: [
    {
      param: "hauptteil",
      src: "/konfigurator/body-foto/mask-hauptteil.webp",
      label: "Hauptteil",
      defaultColor: "cream",
    },
    {
      param: "halsbund",
      src: "/konfigurator/body-foto/mask-halsbund.webp",
      label: "Halsbündchen",
      defaultColor: "sage",
    },
    {
      param: "aermelbund",
      src: "/konfigurator/body-foto/mask-aermelbund.webp",
      label: "Ärmelbündchen",
      defaultColor: "sage",
    },
  ],
};

export const KONFIG_REGISTRY: Record<KonfiguratorId, KonfigRegistryEntry> = {
  hose: HOSE,
  turban: TURBAN,
  muetze: MUETZE,
  dreieckstuch: DREIECKSTUCH,
  body: BODY,
};

export function isKonfiguratorId(v: string): v is KonfiguratorId {
  return (
    v === "hose" ||
    v === "turban" ||
    v === "muetze" ||
    v === "dreieckstuch" ||
    v === "body"
  );
}

/** Resolves a swatch id → hex, falling back to the region default and then cream. */
export function swatchHexOrDefault(id: string | null | undefined, fallback: string): string {
  const byId: Record<string, string> = {};
  for (const s of ALL_SWATCHES) byId[s.id] = s.hex;
  return byId[id ?? ""] ?? byId[fallback] ?? "#FAF7F2";
}

/** Resolves a swatch id → human name, falling back to the region default. */
export function swatchNameOrDefault(id: string | null | undefined, fallback: string): string {
  const byId: Record<string, string> = {};
  for (const s of ALL_SWATCHES) byId[s.id] = s.name;
  return byId[id ?? ""] ?? byId[fallback] ?? "Creme";
}

/** Selection derived from URL search params, honouring the hose legacy split. */
export function selectionFromSearch(
  konfig: KonfigRegistryEntry,
  search: URLSearchParams | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of konfig.regions) {
    if (konfig.id === "hose" && r.param === "hose") {
      const direct = search?.get("hose") ?? search?.get("links") ?? search?.get("rechts");
      out[r.param] = direct || r.defaultColor;
    } else {
      out[r.param] = search?.get(r.param) || r.defaultColor;
    }
  }
  return out;
}

/** Returns only the params that differ from defaults, in registry order — for compact OG URLs. */
export function canonicalQuery(
  konfig: KonfigRegistryEntry,
  selection: Record<string, string>,
): string {
  const params = new URLSearchParams();
  for (const r of konfig.regions) {
    const val = selection[r.param];
    if (val && val !== r.defaultColor) params.set(r.param, val);
  }
  return params.toString();
}
