import type { Metadata } from "next";

import { buildKonfigMetadata } from "../_shared/metadata";
import { HoseKonfigurator } from "./hose-konfigurator";

const TITLE = "Hose-Konfigurator";
const DESCRIPTION =
  "Stell deine Bilulu-Hose selbst zusammen: Bund, Hose und Bündchen einzeln einfärben. Vorschau auf einem echten Hosenfoto, echte Stoffmuster folgen.";

// Render at request time so useSearchParams resolves server-side and the full
// page paints on first response. Avoids the empty-fallback → hydrated-content
// layout jump that pushed CLS above budget.
export const dynamic = "force-dynamic";

export function generateMetadata({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}): Metadata {
  return buildKonfigMetadata("hose", searchParams, { title: TITLE, description: DESCRIPTION });
}

export default function HoseKonfiguratorPage() {
  return <HoseKonfigurator />;
}
