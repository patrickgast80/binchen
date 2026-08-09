import type { Metadata } from "next";
import Link from "next/link";
import { Heart, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PantsPhoto } from "../konfigurator/hose/pants-photo";

const WUNSCHGROESSE_MAILTO =
  "mailto:info@bilulu.de?subject=Wunschgr%C3%B6%C3%9Fe%20Fr%C3%BChchen&body=Hallo%20Bilulu-Team%2C%0A%0Awir%20brauchen%20eine%20besondere%20Gr%C3%B6%C3%9Fe%3A%20%5Bbitte%20eintragen%5D%0AGewicht%20%2F%20Woche%3A%20%5Bbitte%20eintragen%5D%0AWunsch-Farben%3A%20%5Bbitte%20eintragen%5D%0A%0ADanke%20euch%21";

export const metadata: Metadata = {
  title: "Frühchenkleidung – handgemacht in jeder Größe",
  description:
    "Wir nähen Frühchenkleidung in jeder Größe — Standardgrößen 32, 38, 44, 50 und Sondermaße auf Anfrage. Handgenäht aus weichen Naturmaterialien, für die kleinsten Wunder unter uns.",
  keywords: [
    "Frühchenkleidung",
    "Frühchen Hose",
    "Frühchengrößen",
    "Frühchengröße 32",
    "Frühchengröße 38",
    "Frühchengröße 44",
    "Frühchengröße 50",
    "Frühchenkleidung handmade",
    "Kleidung für Frühgeborene",
    "Wunschgröße Frühchen",
    "handgemachte Frühchenkleidung",
  ],
  alternates: {
    canonical: "/fruehchen",
  },
  openGraph: {
    type: "website",
    locale: "de_DE",
    title: "Frühchenkleidung – handgemacht in jeder Größe | Bilulu",
    description:
      "Handgenähte Hosen in Frühchengrößen 32, 38, 44, 50 aus weichen Naturmaterialien. Jede Sondergröße auf Anfrage.",
    url: "/fruehchen",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const SIZES = ["32", "38", "44", "50"];

export default function FruehchenPage() {
  return (
    <>
      <section
        aria-labelledby="fruehchen-heading"
        className="bg-binchen-cream-dark"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div>
              <p className="inline-flex items-center gap-2 font-body text-sm font-medium uppercase tracking-widest text-binchen-terracotta-text">
                <Heart className="h-4 w-4" aria-hidden="true" />
                Für die Kleinsten
              </p>
              <h1
                id="fruehchen-heading"
                className="mt-3 font-display text-4xl font-semibold leading-tight text-binchen-ink sm:text-5xl lg:text-6xl"
              >
                Handgenähte Kleidung in{" "}
                <em className="font-display not-italic text-binchen-terracotta-text">jeder</em>{" "}
                Frühchengröße
              </h1>
              <p className="mt-6 font-body text-lg leading-relaxed text-binchen-ink-muted">
                <strong className="font-semibold text-binchen-ink">
                  Wir nähen jede Größe — egal wie klein.
                </strong>{" "}
                Niemand muss auf Puppenkleidung ausweichen, weil es die passende Größe im Handel
                nicht gibt. Standardmäßig fertigen wir 32, 38, 44 und 50. Braucht ihr etwas
                dazwischen oder darunter? Sagt uns, was ihr braucht — wir machen möglich, was
                möglich ist.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Button asChild variant="accent" size="lg">
                  <a
                    href={WUNSCHGROESSE_MAILTO}
                    aria-label="Wunschgröße per E-Mail anfragen"
                  >
                    <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                    Wunschgröße anfragen
                  </a>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/konfigurator/hose">Hose selbst gestalten</Link>
                </Button>
              </div>
              <p className="mt-6 font-body text-sm text-binchen-ink-muted">
                Direkt in den Shop:{" "}
                <Link
                  href="/catalog?size=32"
                  className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline"
                >
                  Frühchengrößen ansehen
                </Link>
                .
              </p>
            </div>

            <div className="relative">
              <div className="mx-auto w-full max-w-sm rounded-2xl border border-binchen-border bg-binchen-cream p-6">
                <PantsPhoto
                  paints={{
                    bund: { hex: "#5BA8AE" },
                    hose: { hex: "#F5E9D5" },
                    buendchen: { hex: "#7A3318" },
                  }}
                  title="Beispiel einer handgenähten Bilulu-Pumphose in Frühchengröße"
                />
                <p className="mt-4 text-center font-body text-sm text-binchen-ink-muted">
                  Beispiel: Pumphose in Frühchengröße — Farben frei kombinierbar
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="warum-heading"
        className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <h2
          id="warum-heading"
          className="font-display text-3xl font-semibold text-binchen-ink sm:text-4xl"
        >
          Warum wir Frühchenkleidung nähen
        </h2>
        <div className="mt-6 space-y-5 font-body text-base leading-relaxed text-binchen-ink-muted">
          <p>
            Eltern von Frühgeborenen suchen oft verzweifelt nach Kleidung, die wirklich passt —
            nicht zu weit, nicht zu groß, nicht mit harten Nähten an der zarten Haut. Manche
            greifen am Ende zu Puppenkleidung, weil es die passende Größe im Handel schlicht nicht
            gibt. Das darf nicht sein.
          </p>
          <p>
            Wir nähen jede Hose einzeln, in Frühchengrößen ab 32 aufwärts und aus weichen
            Naturmaterialien. Auf Wunsch mit flachen Nähten außen, sanften Bündchen und in Farben,
            die Freude machen — für euch und für die kleinen Wunder, die ihr im Arm haltet.
          </p>
          <p>
            <strong className="font-semibold text-binchen-ink">
              Und wenn ihr eine noch kleinere oder ganz besondere Größe braucht — Zwischengröße,
              Sondermaß, alles was zwischen den Standards liegt:
            </strong>{" "}
            <a
              href={WUNSCHGROESSE_MAILTO}
              className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline"
            >
              schreibt uns
            </a>
            . Wir versuchen möglich zu machen, was möglich ist.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="groessen-heading"
        className="bg-binchen-cream"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="text-center">
            <h2
              id="groessen-heading"
              className="font-display text-3xl font-semibold text-binchen-ink sm:text-4xl"
            >
              Verfügbare Frühchengrößen
            </h2>
            <p className="mx-auto mt-3 max-w-xl font-body text-base text-binchen-ink-muted">
              Standardmäßig nähen wir in diesen Größen — jede weitere Größe (auch kleiner als 32)
              auf Anfrage.
            </p>
          </div>
          <ul
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
            role="list"
            aria-label="Frühchengrößen"
          >
            {SIZES.map((size) => (
              <li key={size}>
                <Link
                  href={`/catalog?size=${size}`}
                  className="inline-flex min-h-11 min-w-16 items-center justify-center rounded-full border border-binchen-border bg-binchen-cream-dark px-5 py-2 font-body text-base font-medium text-binchen-ink transition-colors hover:border-binchen-terracotta hover:text-binchen-terracotta-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage focus-visible:ring-offset-2"
                  aria-label={`Kollektion in Größe ${size} ansehen`}
                >
                  Größe {size}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={WUNSCHGROESSE_MAILTO}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-binchen-terracotta bg-binchen-terracotta/10 px-5 py-2 font-body text-base font-medium text-binchen-terracotta-text transition-colors hover:bg-binchen-terracotta/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage focus-visible:ring-offset-2"
                aria-label="Wunschgröße per E-Mail anfragen"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                Wunschgröße anfragen
              </a>
            </li>
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="konfigurator-heading"
        className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <div className="grid items-center gap-10 rounded-3xl border border-binchen-border bg-binchen-cream-dark px-6 py-10 sm:px-10 sm:py-12 lg:grid-cols-[1fr_1.4fr] lg:gap-14 lg:px-14 lg:py-14">
          <div className="mx-auto w-full max-w-xs lg:max-w-sm">
            <PantsPhoto
              paints={{
                bund: { hex: "#E8DDC8" },
                hose: { hex: "#5BA8AE" },
                buendchen: { hex: "#E8DDC8" },
              }}
              title="Vorschau: Hose mit sanftem Bund und farbigem Hauptteil"
            />
          </div>
          <div>
            <p className="font-body text-sm font-medium uppercase tracking-widest text-binchen-terracotta-text">
              Individuell für euch
            </p>
            <h2
              id="konfigurator-heading"
              className="mt-3 font-display text-3xl font-semibold text-binchen-ink sm:text-4xl"
            >
              Farben selbst wählen — auch in Frühchengröße
            </h2>
            <p className="mt-4 font-body text-base leading-relaxed text-binchen-ink-muted">
              Bund, Hose und Bündchen einzeln einfärben. Ihr seht direkt, wie eure Kombination
              aussieht — auf einem echten Hosenfoto mit Stofftextur und Nähten. Die Größe wählt
              ihr im Warenkorb oder gebt sie uns per Nachricht durch.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <Button asChild variant="accent" size="lg">
                <Link href="/konfigurator/hose">Konfigurator öffnen</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href={WUNSCHGROESSE_MAILTO} aria-label="Wunschgröße per E-Mail anfragen">
                  Wunschgröße anfragen
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="empathie-heading"
        className="border-t border-binchen-border bg-binchen-cream-dark"
      >
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <h2
            id="empathie-heading"
            className="font-display text-2xl font-semibold text-binchen-ink sm:text-3xl"
          >
            Wir sehen euch.
          </h2>
          <p className="mt-4 font-body text-base leading-relaxed text-binchen-ink-muted">
            Die Zeit nach einer Frühgeburt ist oft geprägt von Sorge, Warten und ganz viel Kraft,
            die aus dem Nichts kommt. Wir hoffen, mit unseren kleinen Hosen einen winzigen
            Lichtblick beisteuern zu können — etwas Weiches, etwas Buntes, etwas, das nur für
            euch gemacht ist.
          </p>
          <p className="mt-4 font-body text-base leading-relaxed text-binchen-ink-muted">
            Falls ihr Fragen habt, meldet euch jederzeit — auch ohne Bestellung. Alles Liebe für
            euch und euer kleines Wunder.
          </p>
          <p className="mt-6 font-display text-lg font-semibold text-binchen-ink">
            Sabine &amp; Doris
          </p>
        </div>
      </section>
    </>
  );
}
