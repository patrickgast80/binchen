import type { Metadata } from "next";

import { KonfiguratorErrorBanner } from "../_shared/konfigurator-error";
import { buildKonfigMetadata } from "../_shared/metadata";
import { DreieckstuchKonfigurator } from "./dreieckstuch-konfigurator";

const TITLE = "Dreieckstuch-Konfigurator";
const DESCRIPTION =
  "Stell dein Bilulu-Dreieckstuch selbst zusammen: Farbe für den Hauptstoff wählen. Vorschau auf einem echten Produktfoto.";

export const dynamic = "force-dynamic";

export function generateMetadata({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}): Metadata {
  return buildKonfigMetadata("dreieckstuch", searchParams, {
    title: TITLE,
    description: DESCRIPTION,
  });
}

export default function DreieckstuchKonfiguratorPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return (
    <>
      <KonfiguratorErrorBanner error={searchParams.error} />
      <DreieckstuchKonfigurator />
    </>
  );
}
