import type { Metadata } from "next";

import { HoseKonfigurator } from "./hose-konfigurator";

export const metadata: Metadata = {
  title: "Hose-Konfigurator",
  description:
    "Stell deine Bilulu-Hose selbst zusammen: Bund, Hose und Bündchen einzeln einfärben. Vorschau auf einem echten Hosenfoto, echte Stoffmuster folgen.",
  alternates: {
    canonical: "/konfigurator/hose",
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Render at request time so useSearchParams resolves server-side and the full
// page paints on first response. Avoids the empty-fallback → hydrated-content
// layout jump that pushed CLS above budget.
export const dynamic = "force-dynamic";

export default function HoseKonfiguratorPage() {
  return <HoseKonfigurator />;
}
