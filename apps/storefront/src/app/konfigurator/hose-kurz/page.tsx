import type { Metadata } from "next";

import { buildKonfigMetadata } from "../_shared/metadata";
import { HoseKurzKonfigurator } from "./hose-kurz-konfigurator";

const TITLE = "Konfigurator kurze Hose";
const DESCRIPTION =
  "Stell deine kurze Bilulu-Pumphose selbst zusammen: Bund, Hose und Bündchen einzeln einfärben, das Hauptteil mit echten Stoffmustern. Vorschau auf einem echten Produktfoto.";

// Wie bei den anderen Konfiguratoren: request-time rendern, damit
// useSearchParams serverseitig auflöst und die Seite in einem Rutsch malt
// (sonst Empty-Fallback → Hydration-Sprung → CLS über Budget).
export const dynamic = "force-dynamic";

export function generateMetadata({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}): Metadata {
  return buildKonfigMetadata("hose-kurz", searchParams, { title: TITLE, description: DESCRIPTION });
}

export default function HoseKurzKonfiguratorPage() {
  return <HoseKurzKonfigurator />;
}
