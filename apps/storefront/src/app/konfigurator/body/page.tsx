import type { Metadata } from "next";

import { buildKonfigMetadata } from "../_shared/metadata";
import { BodyKonfigurator } from "./body-konfigurator";

const TITLE = "Body-Konfigurator";
const DESCRIPTION =
  "Stell deinen Bilulu-Body selbst zusammen: Hauptteil, Halsbündchen und Ärmelbündchen einzeln einfärben. Live-Vorschau, teilbar per Link.";

export const dynamic = "force-dynamic";

export function generateMetadata({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}): Metadata {
  return buildKonfigMetadata("body", searchParams, { title: TITLE, description: DESCRIPTION });
}

export default function BodyKonfiguratorPage() {
  return <BodyKonfigurator />;
}
