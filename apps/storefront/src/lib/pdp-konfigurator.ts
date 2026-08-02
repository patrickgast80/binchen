/**
 * PDP-level Stoff-Konfigurator (BIL-2433).
 *
 * The 27 BIL-2432 products all ship with a single "Standard" variant — every
 * piece is a handmade Unikat (Bestand=1). To offer per-article fabric picking
 * without a variant explosion, we detect the product family from its title
 * and expose a small set of "regions" the customer picks fabrics for. The
 * selections ride along on the Medusa line item as `metadata.kind === "pdp-konfigurator"`,
 * mirroring the /konfigurator/hose pattern in cart/actions.ts.
 */
import type { MedusaProduct } from "@/lib/medusa";

export type KonfiguratorFamily = "muetze" | "schal" | "pumphose" | null;

export interface KonfiguratorRegion {
  /** Stable id used as form-field name and metadata key. */
  id: string;
  label: string;
  description: string;
  defaultColor: string;
}

export interface KonfiguratorProfile {
  family: Exclude<KonfiguratorFamily, null>;
  /** Human-facing headline shown above the fabric pickers. */
  headline: string;
  /** Sub-line explaining the concept (Wendeschal, Innen/Außen …). */
  subline: string;
  regions: readonly KonfiguratorRegion[];
}

/**
 * Classify a product into a configurator family based on its title.
 *
 * We look at the title first because BIL-2432 didn't add structured
 * category metadata. "Set" wins over the individual pieces so combined
 * Mütze+Schal products don't accidentally pick up two configurators.
 * A future improvement: read `product.metadata.category` when Backend
 * adds it — this classifier is deliberately narrow so it can be swapped
 * without touching the UI.
 */
export function classifyProduct(product: Pick<MedusaProduct, "title" | "metadata">): KonfiguratorFamily {
  const title = product.title?.toLowerCase() ?? "";
  // Explicit opt-out via metadata (e.g., pre-configured seed products).
  const metaCategory = (product.metadata as { category?: string } | null)?.category?.toLowerCase();
  if (metaCategory === "set" || /\bset\b/.test(title)) return null;
  if (/turban|mütze|muetze|kappe|beanie/.test(title)) return "muetze";
  if (/schal|halstuch|dreieckstuch|loop|wendeschal|tuch\b/.test(title)) return "schal";
  if (/pumphose|hose\b/.test(title)) return "pumphose";
  return null;
}

const MUETZE_PROFILE: KonfiguratorProfile = {
  family: "muetze",
  headline: "Stoffwahl für deine Mütze",
  subline:
    "Innen und Außen wählbar. Wir nähen jede Mütze auf Bestellung — die Farben unten sind unsere aktuelle Stoffauswahl.",
  regions: [
    {
      id: "aussen",
      label: "Außenstoff",
      description: "Der sichtbare Stoff außen an der Mütze.",
      defaultColor: "cream",
    },
    {
      id: "innen",
      label: "Innenstoff",
      description: "Der weiche Stoff, der direkt am Kopf liegt.",
      defaultColor: "sage",
    },
  ],
};

const SCHAL_PROFILE: KonfiguratorProfile = {
  family: "schal",
  headline: "Wendeschal — beide Seiten wählbar",
  subline:
    "Zwei Seiten, zwei Looks. Du kannst den Schal umdrehen und mit der gewünschten Farbe außen tragen.",
  regions: [
    {
      id: "seite_a",
      label: "Seite A",
      description: "Die erste Seite deines Wendeschals.",
      defaultColor: "terracotta",
    },
    {
      id: "seite_b",
      label: "Seite B",
      description: "Die zweite Seite — im Alltag einfach umdrehen.",
      defaultColor: "cream",
    },
  ],
};

const PUMPHOSE_PROFILE: KonfiguratorProfile = {
  family: "pumphose",
  headline: "Bündchen-Farbe wählen",
  subline:
    "Die Bündchen an Bund und Beinabschluss werden in deiner Wunschfarbe genäht. Die Hose selbst bleibt im abgebildeten Stoff.",
  regions: [
    {
      id: "buendchen",
      label: "Bündchen",
      description: "Farbton für Bund und Beinabschlüsse.",
      defaultColor: "petrol",
    },
  ],
};

export function profileFor(product: Pick<MedusaProduct, "title" | "metadata">): KonfiguratorProfile | null {
  const family = classifyProduct(product);
  if (!family) return null;
  if (family === "muetze") return MUETZE_PROFILE;
  if (family === "schal") return SCHAL_PROFILE;
  if (family === "pumphose") return PUMPHOSE_PROFILE;
  return null;
}
