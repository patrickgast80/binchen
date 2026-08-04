import type { Metadata } from "next";

import { buildKonfigMetadata } from "../_shared/metadata";
import { MuetzeKonfigurator } from "./muetze-konfigurator";

const TITLE = "Muetze-Konfigurator";
const DESCRIPTION =
  "Stell deine Bilulu-Muetze selbst zusammen: Hauptstoff und Futter einzeln einfärben. Vorschau auf einem echten Muetzenfoto.";

export const dynamic = "force-dynamic";

export function generateMetadata({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}): Metadata {
  return buildKonfigMetadata("muetze", searchParams, { title: TITLE, description: DESCRIPTION });
}

export default function MuetzeKonfiguratorPage() {
  return <MuetzeKonfigurator />;
}
