import type { Metadata } from "next";

import { DreieckstuchKonfigurator } from "./dreieckstuch-konfigurator";

export const metadata: Metadata = {
  title: "Dreieckstuch-Konfigurator",
  description:
    "Stell dein Bilulu-Dreieckstuch selbst zusammen: Farbe für den Hauptstoff wählen. Vorschau auf einem echten Produktfoto.",
  alternates: {
    canonical: "/konfigurator/dreieckstuch",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const dynamic = "force-dynamic";

export default function DreieckstuchKonfiguratorPage() {
  return <DreieckstuchKonfigurator />;
}
