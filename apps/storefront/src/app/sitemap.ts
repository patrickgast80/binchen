import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://bilulu.de";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/fruehchen`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/catalog`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    {
      url: `${BASE_URL}/konfigurator`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/konfigurator/hose`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/konfigurator/muetze`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    // Board-Descope BIL-2460 2026-08-10: /konfigurator/{turban,dreieckstuch,body}
    // aus dem Sitemap entfernt (Fokus Hose + Mütze). Routen bleiben im Repo aktiv.
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/impressum`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/datenschutz`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/agb`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/widerruf`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
