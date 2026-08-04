import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Konfigurator-Hub",
  description:
    "Alle Bilulu-Konfiguratoren auf einen Blick: Pumphose, Turban, Mütze und Dreieckstuch selbst gestalten. Weitere Kleidungsstücke sind in Vorbereitung.",
  alternates: { canonical: "/konfigurator" },
  robots: { index: true, follow: true },
};

export const dynamic = "force-static";

type LiveTile = {
  status: "live";
  href: string;
  name: string;
  tagline: string;
  zones: string;
  image: { src: string; width: number; height: number };
};

type UpcomingTile = {
  status: "upcoming";
  name: string;
  tagline: string;
  zones: string;
};

type Tile = LiveTile | UpcomingTile;

const TILES: readonly Tile[] = [
  {
    status: "live",
    href: "/konfigurator/hose",
    name: "Pumphose",
    tagline: "Bund, Hauptteil und Bündchen einzeln einfärben.",
    zones: "3 Zonen",
    image: { src: "/konfigurator/hose-foto/base.webp", width: 900, height: 900 },
  },
  {
    status: "live",
    href: "/konfigurator/turban",
    name: "Turban-Mütze",
    tagline: "Hauptstoff und Schleife frei kombinieren.",
    zones: "2 Zonen",
    image: { src: "/konfigurator/turban-foto/base.webp", width: 900, height: 796 },
  },
  {
    status: "live",
    href: "/konfigurator/muetze",
    name: "Mütze",
    tagline: "Hauptstoff mit Kontrast-Futter.",
    zones: "2 Zonen",
    image: { src: "/konfigurator/muetze-foto/base.webp", width: 900, height: 917 },
  },
  {
    status: "live",
    href: "/konfigurator/dreieckstuch",
    name: "Dreieckstuch",
    tagline: "Ein Hauptstoff, viele Möglichkeiten.",
    zones: "1 Zone",
    image: { src: "/konfigurator/dreieckstuch-foto/base.webp", width: 900, height: 482 },
  },
  {
    status: "upcoming",
    name: "Body",
    tagline: "Hauptteil, Halsbündchen und Ärmelbündchen.",
    zones: "geplant: 3 Zonen",
  },
  {
    status: "upcoming",
    name: "Pulli",
    tagline: "Hauptteil, Kragen und Ärmelbündchen.",
    zones: "geplant: 3 Zonen",
  },
  {
    status: "upcoming",
    name: "Latzhose",
    tagline: "Brust-Latz, Träger, Hauptteil und Bündchen.",
    zones: "geplant: 4 Zonen",
  },
];

export default function KonfiguratorHubPage() {
  const liveTiles = TILES.filter((t): t is LiveTile => t.status === "live");
  const upcomingTiles = TILES.filter((t): t is UpcomingTile => t.status === "upcoming");

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12 lg:px-8">
      <header className="max-w-3xl">
        <p className="font-body text-sm font-medium uppercase tracking-widest text-binchen-terracotta-text">
          Konfigurator-Hub
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-binchen-ink sm:text-4xl lg:text-5xl">
          Gestalte dein Bilulu-Lieblingsstück
        </h1>
        <p className="mt-4 font-body text-base leading-relaxed text-binchen-ink-muted sm:text-lg">
          Wähle das Kleidungsstück, das du individuell zusammenstellen willst. Jede Farbwahl siehst
          du live auf einem echten Produktfoto, deine Konfiguration kannst du teilen und direkt in
          den Warenkorb legen.
        </p>
      </header>

      <section aria-labelledby="live-heading" className="mt-10">
        <h2 id="live-heading" className="sr-only">
          Verfügbare Konfiguratoren
        </h2>
        <ul
          role="list"
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {liveTiles.map((tile) => (
            <li key={tile.href}>
              <Link
                href={tile.href}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-binchen-border bg-binchen-cream-dark/40 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage focus-visible:ring-offset-2"
              >
                <div
                  className="relative w-full overflow-hidden bg-binchen-cream"
                  style={{ aspectRatio: `${tile.image.width} / ${tile.image.height}` }}
                >
                  {/* Static preview from the desaturated konfigurator base asset; no tint layer
                      so the hub is a low-cost preview grid rather than a live palette. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tile.image.src}
                    alt={`${tile.name} — Vorschaubild`}
                    width={tile.image.width}
                    height={tile.image.height}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain p-6 transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-xl font-semibold text-binchen-ink">
                      {tile.name}
                    </h3>
                    <span className="font-body text-xs uppercase tracking-wider text-binchen-ink-muted">
                      {tile.zones}
                    </span>
                  </div>
                  <p className="font-body text-sm text-binchen-ink-muted">{tile.tagline}</p>
                  <span className="mt-3 inline-flex items-center gap-1 font-body text-sm font-medium text-binchen-terracotta-text">
                    Konfigurieren
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="upcoming-heading" className="mt-14">
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-binchen-terracotta-text" aria-hidden="true" />
          <h2
            id="upcoming-heading"
            className="font-display text-xl font-semibold text-binchen-ink sm:text-2xl"
          >
            In Vorbereitung
          </h2>
        </div>
        <ul role="list" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {upcomingTiles.map((tile) => (
            <li
              key={tile.name}
              aria-label={`${tile.name} – in Vorbereitung`}
              className="flex h-full flex-col justify-between rounded-2xl border border-dashed border-binchen-border bg-binchen-cream-dark/20 p-5"
            >
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold text-binchen-ink">
                    {tile.name}
                  </h3>
                  <span className="font-body text-xs uppercase tracking-wider text-binchen-ink-muted">
                    {tile.zones}
                  </span>
                </div>
                <p className="mt-2 font-body text-sm text-binchen-ink-muted">{tile.tagline}</p>
              </div>
              <p className="mt-5 font-body text-xs font-medium uppercase tracking-wider text-binchen-terracotta-text">
                Bald verfügbar
              </p>
            </li>
          ))}
        </ul>
      </section>

      <aside
        role="note"
        aria-label="Fragen zu Stoffen"
        className="mt-14 rounded-2xl border border-binchen-border bg-binchen-cream-dark px-5 py-5 sm:px-6"
      >
        <p className="font-body text-sm leading-relaxed text-binchen-ink">
          <span className="font-semibold">Sondermaße oder Wunschstoff?</span>{" "}
          <span className="text-binchen-ink-muted">
            Frühchengrößen und Einzelstücke näht Sabine gerne auf Anfrage — schreib uns eine
            Nachricht über{" "}
            <Link
              href="/contact"
              className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 rounded"
            >
              das Kontaktformular
            </Link>
            .
          </span>
        </p>
      </aside>
    </div>
  );
}
