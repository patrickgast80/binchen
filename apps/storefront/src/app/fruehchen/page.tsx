import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PantsPhoto } from "../konfigurator/hose/pants-photo";

export const metadata: Metadata = {
  title: "Frühchenkleidung – handgemacht in kleinen Größen",
  description:
    "Handgenähte Kleidung in Frühchengrößen (38, 44, 50) aus weichen Naturmaterialien. Farben und Zonen individuell konfigurierbar. Für die kleinsten Wunder unter uns.",
  keywords: [
    "Frühchenkleidung",
    "Frühchen Hose",
    "Frühchengrößen",
    "Frühchengröße 38",
    "Frühchengröße 44",
    "Frühchengröße 50",
    "Frühchenkleidung handmade",
    "Kleidung für Frühgeborene",
    "handgemachte Frühchenkleidung",
  ],
  alternates: {
    canonical: "/fruehchen",
  },
  openGraph: {
    type: "website",
    locale: "de_DE",
    title: "Frühchenkleidung – handgemacht in kleinen Größen | Bilulu",
    description:
      "Handgenähte Hosen in Frühchengrößen 38, 44, 50 aus weichen Naturmaterialien. Farben individuell wählbar.",
    url: "/fruehchen",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const SIZES = ["38", "44", "50"];

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
                Handgenähte Kleidung in Frühchengrößen
              </h1>
              <p className="mt-6 font-body text-lg leading-relaxed text-binchen-ink-muted">
                Wenn ein Baby zu früh kommt, ist alles anders — auch die Suche nach passender
                Kleidung. Wir wissen, wie schwer es ist, wirklich schöne Sachen in Größen wie 38,
                44 oder 50 zu finden. Deshalb nähen wir sie mit besonderer Sorgfalt für euch.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Button asChild variant="accent" size="lg">
                  <Link href="/konfigurator/hose">Hose selbst gestalten</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/catalog?size=50">Kleine Größen im Shop</Link>
                </Button>
              </div>
              <p className="mt-6 font-body text-sm text-binchen-ink-muted">
                Individuelle Wünsche zu Stoff oder Sondergröße?{" "}
                <Link
                  href="/contact"
                  className="font-medium text-binchen-terracotta-text underline-offset-4 hover:underline"
                >
                  Schreibt uns direkt.
                </Link>
              </p>
            </div>

            <div className="relative">
              <div className="mx-auto w-full max-w-sm rounded-2xl border border-binchen-border bg-binchen-cream p-6">
                <PantsPhoto
                  colors={{
                    bund: "#5BA8AE",
                    hose: "#F5E9D5",
                    buendchen: "#7A3318",
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
            nicht zu weit, nicht zu groß, nicht mit harten Nähten an der zarten Haut. Was es im
            Handel gibt, ist meist schlicht und einheitlich weiß.
          </p>
          <p>
            Wir nähen jede Hose einzeln, in kleinen Frühchengrößen (38, 44, 50) und aus weichen
            Naturmaterialien. Auf Wunsch mit flachen Nähten außen, sanften Bündchen und in Farben,
            die Freude machen — für euch und für die kleinen Wunder, die ihr im Arm haltet.
          </p>
          <p>
            Wenn ihr eine ganz besondere Größe braucht (z.&nbsp;B. 32), meldet euch bitte direkt
            bei uns. Wir versuchen möglich zu machen, was möglich ist.
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
              Standardmäßig nähen wir in diesen Größen. Sondermaße auf Anfrage.
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
              colors={{
                bund: "#E8DDC8",
                hose: "#5BA8AE",
                buendchen: "#E8DDC8",
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
                <Link href="/contact">Größe direkt anfragen</Link>
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
