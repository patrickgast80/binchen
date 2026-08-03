import type { Metadata } from "next";

import { MuetzeKonfigurator } from "./muetze-konfigurator";

export const metadata: Metadata = {
  title: "Muetze-Konfigurator",
  description:
    "Stell deine Bilulu-Muetze selbst zusammen: Hauptstoff und Futter einzeln einf\u00e4rben. Vorschau auf einem echten Muetzenfoto.",
  alternates: {
    canonical: "/konfigurator/muetze",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const dynamic = "force-dynamic";

export default function MuetzeKonfiguratorPage() {
  return <MuetzeKonfigurator />;
}
