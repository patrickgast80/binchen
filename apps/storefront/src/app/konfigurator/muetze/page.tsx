import type { Metadata } from "next";

import { KonfiguratorErrorBanner } from "../_shared/konfigurator-error";
import { buildKonfigMetadata } from "../_shared/metadata";
import { MuetzeKonfigurator } from "./muetze-konfigurator";

const TITLE = "Mütze-Konfigurator";
const DESCRIPTION =
  "Stell deine Bilulu-Mütze selbst zusammen: Hauptstoff und Futter einzeln einfärben. Vorschau auf einem echten Mützenfoto.";

export const dynamic = "force-dynamic";

export function generateMetadata({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}): Metadata {
  return buildKonfigMetadata("muetze", searchParams, { title: TITLE, description: DESCRIPTION });
}

export default function MuetzeKonfiguratorPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return (
    <>
      <KonfiguratorErrorBanner error={searchParams.error} />
      <MuetzeKonfigurator />
    </>
  );
}
