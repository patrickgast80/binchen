import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Konfigurator-Hub",
  description:
    "Die Bilulu-Konfiguratoren auf einen Blick: Pumphose und Mütze mit echten Stoffen selbst zusammenstellen.",
  alternates: { canonical: "/konfigurator" },
  robots: { index: true, follow: true },
};

export const dynamic = "force-static";

// Board-Descope 2026-08-10 (BIL-2460): fokussiert auf Hose + Mütze mit echten
// Stoffen. Turban-, Dreieckstuch- und Body-Routen bleiben im Repo, werden aber
// nicht mehr im Hub/in der Nav beworben — Board will später weitermachen.
type LiveTile = {
  href: string;
  name: string;
  tagline: string;
  zones: string;
  image: { src: string; width: number; height: number };
};

const TILES: readonly LiveTile[] = [
  {
    href: "/konfigurator/hose",
    name: "Pumphose",
    tagline: "Bund, Hauptteil und Bündchen einzeln einfärben — Hauptteil mit echten Stoff-Mustern.",
    zones: "3 Zonen",
    image: { src: "/konfigurator/hose-foto/base.webp", width: 900, height: 1006 },
  },
  {
    href: "/konfigurator/muetze",
    name: "Mütze",
    tagline: "Hauptstoff aus echten Mustern, Futter uni frei kombinierbar.",
    zones: "2 Zonen",
    image: { src: "/konfigurator/muetze-foto/base.webp", width: 900, height: 880 },
  },
];

export default function KonfiguratorHubPage() {
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
          {TILES.map((tile) => (
            <li key={tile.href}>
              <Link
                href={tile.href}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-binchen-border bg-binchen-cream-dark/40 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage focus-visible:ring-offset-2"
              >
                {/*
                  BIL-2479: the tile box is a fixed square for every garment, not
                  the photo's own ratio. The photos genuinely differ in shape
                  (900x1006 Pumphose, 900x880 Mütze once it is stood upright), so
                  a per-tile ratio gives the cards different image heights and the
                  titles below stop lining up across the grid. `object-contain`
                  fits each photo inside the square, and because the ratio is a
                  constant it can never drift out of sync with a rebuilt asset —
                  which is exactly how the stale 900x900 / 900x917 values here
                  survived two asset rebuilds.
                */}
                {/*
                  BIL-2483: Studio-Grey stage, same token as the live Hose/Mütze preview
                  and as the catalog cards. Unlike the 1200x1200 product photos these
                  tile images are transparent cutouts with NO baked passepartout, so a
                  padding stays here — the padding IS the mat, not a second frame.

                  It is `p-[12%]`, not a fixed `p-6`: the mat has to match the 12 %
                  (`PAD_RATIO = 0.12`, bil2462-studio-normalize.mjs) that the product
                  photos carry inside their canvas. A fixed 24px drifts with the grid —
                  6.7 % of the 358px tile at 390w, 8.4 % of the 286px tile at 1440w —
                  so it read as a narrower mat than every neighbouring card. A
                  percentage resolves against the tile width and stays put.
                */}
                <div className="relative aspect-square w-full overflow-hidden bg-binchen-studio">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tile.image.src}
                    alt={`${tile.name} — Vorschaubild`}
                    width={tile.image.width}
                    height={tile.image.height}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain p-[12%] transition-transform duration-300 group-hover:scale-[1.03]"
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
