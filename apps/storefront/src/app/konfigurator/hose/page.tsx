import * as React from "react";
import type { Metadata } from "next";

import { HoseKonfigurator } from "./hose-konfigurator";

export const metadata: Metadata = {
  title: "Hose-Konfigurator",
  description:
    "Stell deine Bilulu-Hose selbst zusammen: Bund, Hauptteile und Bündchen einzeln einfärben. MVP-Farbvorschau, echte Stoffmuster folgen.",
  alternates: {
    canonical: "/konfigurator/hose",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function HoseKonfiguratorPage() {
  return (
    <React.Suspense fallback={null}>
      <HoseKonfigurator />
    </React.Suspense>
  );
}
