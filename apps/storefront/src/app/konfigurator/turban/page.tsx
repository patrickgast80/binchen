import type { Metadata } from "next";

import { KonfiguratorErrorBanner } from "../_shared/konfigurator-error";
import { buildKonfigMetadata } from "../_shared/metadata";
import { TurbanKonfigurator } from "./turban-konfigurator";

const TITLE = "Turban-Konfigurator";
const DESCRIPTION =
  "Stell deine Bilulu-Turban-Mütze selbst zusammen: Turban und Schleife einzeln einfärben. Vorschau auf einem echten Mützenfoto, echte Stoffmuster folgen.";

// Render at request time so useSearchParams resolves server-side and the full
// page paints on first response (same CLS reasoning as /konfigurator/hose).
export const dynamic = "force-dynamic";

export function generateMetadata({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}): Metadata {
  return buildKonfigMetadata("turban", searchParams, { title: TITLE, description: DESCRIPTION });
}

export default function TurbanKonfiguratorPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return (
    <>
      <KonfiguratorErrorBanner error={searchParams.error} />
      <TurbanKonfigurator />
    </>
  );
}
