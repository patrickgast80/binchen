import type { Metadata } from "next";

import { TurbanKonfigurator } from "./turban-konfigurator";

export const metadata: Metadata = {
  title: "Turban-Konfigurator",
  description:
    "Stell deine Bilulu-Turban-Mütze selbst zusammen: Turban und Schleife einzeln einfärben. Vorschau auf einem echten Mützenfoto, echte Stoffmuster folgen.",
  alternates: {
    canonical: "/konfigurator/turban",
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Render at request time so useSearchParams resolves server-side and the full
// page paints on first response (same CLS reasoning as /konfigurator/hose).
export const dynamic = "force-dynamic";

export default function TurbanKonfiguratorPage() {
  return <TurbanKonfigurator />;
}
