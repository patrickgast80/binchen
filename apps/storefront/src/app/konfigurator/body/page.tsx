import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KonfiguratorErrorBanner } from "../_shared/konfigurator-error";
import { buildKonfigMetadata } from "../_shared/metadata";
import { BodyKonfigurator } from "./body-konfigurator";

const TITLE = "Body-Konfigurator";
const DESCRIPTION =
  "Stell deinen Bilulu-Body selbst zusammen: Hauptteil, Halsbündchen und Ärmelbündchen einzeln einfärben. Live-Vorschau, teilbar per Link.";

/**
 * BIL-2496 (Patrick, Telegram 2026-08-18): "den Body Konfigurator auch erstmal
 * hier weg machen aber im Hintergrund für später aufheben."
 *
 * The backing product `Bilulu-Body (Konfigurator)` (prod_01KZ6Q1S10H9S6SG11NRZAVG7M)
 * is now status=draft, so it is gone from /store/products — which is what takes
 * the card out of the catalog and the homepage. But a draft product also makes
 * `getConfiguratorBodyVariant()` return null, and this route would otherwise
 * still render a fully interactive configurator whose "in den Warenkorb" button
 * can only bounce back to `?error=variant_unavailable`. A dead-end page that
 * looks alive is worse than no page, so the route is gated off here.
 *
 * Deliberately a flag, not a deletion: the page, the photo assets under
 * /konfigurator/body-foto/, the palette and the registry entry all stay in the
 * repo. Reactivating is two steps, no rebuild of anything:
 *   1. flip this to `true`
 *   2. PATCH the product back to status=published (Admin, or
 *      apps/backend/scripts/bil2496/apply.mjs documents the id)
 * Re-add the hub tile in ../page.tsx and the sitemap entry only if the board
 * also wants it advertised again — BIL-2460 descoped that separately.
 */
// Annotated `boolean` on purpose: as a bare `false` literal TypeScript narrows
// the flag away and reports the code below it as unreachable.
const BODY_KONFIGURATOR_ENABLED: boolean = false;

export const dynamic = "force-dynamic";

export function generateMetadata({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}): Metadata {
  if (!BODY_KONFIGURATOR_ENABLED) {
    // Keep the disabled route out of the index even while it 404s.
    return { title: TITLE, robots: { index: false, follow: false } };
  }
  return buildKonfigMetadata("body", searchParams, { title: TITLE, description: DESCRIPTION });
}

export default function BodyKonfiguratorPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (!BODY_KONFIGURATOR_ENABLED) notFound();
  // Wired up with the other five (BIL-2510) so re-enabling the route is still
  // the two documented steps and not "and don't forget the error banner".
  return (
    <>
      <KonfiguratorErrorBanner error={searchParams.error} />
      <BodyKonfigurator />
    </>
  );
}
