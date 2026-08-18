import type { Metadata } from "next";

import {
  KONFIG_REGISTRY,
  type KonfiguratorId,
  swatchNameOrDefault,
} from "./registry";
import { ROTATION_PARAM, parseRotation, rotationLabel } from "./rotation";

/**
 * Builds request-time metadata for a konfigurator page. Sets an OG image URL
 * that points at the shared `/api/og/konfig/{id}` route with the current
 * search params, so shared links render a preview of the selected colours
 * instead of a generic placeholder.
 */
export function buildKonfigMetadata(
  konfigurator: KonfiguratorId,
  searchParams: Record<string, string | string[] | undefined>,
  base: { title: string; description: string },
): Metadata {
  const konfig = KONFIG_REGISTRY[konfigurator];

  const query = new URLSearchParams();
  for (const region of konfig.regions) {
    const raw = searchParams[region.param];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && value !== region.defaultColor) query.set(region.param, value);
  }
  // Preserve the hose legacy shared-link params so previews stay in sync with
  // whatever the shared URL actually rendered.
  if (konfigurator === "hose") {
    for (const legacy of ["links", "rechts"] as const) {
      const raw = searchParams[legacy];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (value && !query.has("hose")) query.set(legacy, value);
    }
  }

  // BIL-2492: the fabric rotation is part of what the link shows, so it has to
  // reach the share card too — otherwise the preview and the card disagree.
  const rawRotation = searchParams[ROTATION_PARAM];
  const rotation = parseRotation(
    Array.isArray(rawRotation) ? rawRotation[0] : rawRotation,
  );
  if (rotation !== 0) query.set(ROTATION_PARAM, String(rotation));

  const qs = query.toString();
  const ogImage = `/api/og/konfig/${konfigurator}${qs ? `?${qs}` : ""}`;

  const summaryParts = konfig.regions
    .map((r) => {
      const raw = searchParams[r.param];
      const value = Array.isArray(raw) ? raw[0] : raw;
      return swatchNameOrDefault(value, r.defaultColor);
    })
    .concat(rotation === 0 ? [] : [`Muster ${rotationLabel(rotation)}`])
    .join(" · ");

  return {
    title: base.title,
    description: base.description,
    alternates: { canonical: konfig.path },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${base.title} — ${summaryParts}`,
      description: base.description,
      url: konfig.path,
      type: "website",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${base.title} — Vorschau: ${summaryParts}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${base.title} — ${summaryParts}`,
      description: base.description,
      images: [ogImage],
    },
  };
}
