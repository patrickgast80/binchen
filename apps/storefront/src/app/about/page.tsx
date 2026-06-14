import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Unsere Geschichte",
  description:
    "Mit Liebe genäht, von Familie für Familie — die Geschichte von Sabine und Doris hinter Bilulu.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <header>
        <p className="font-body text-sm font-medium uppercase tracking-widest text-binchen-terracotta-text">
          Unsere Geschichte
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-binchen-ink sm:text-4xl lg:text-5xl">
          Mit Liebe genäht, von Familie für Familie
        </h1>
      </header>

      <section className="mt-10 space-y-5 font-body text-base leading-relaxed text-binchen-ink-muted">
        <p>
          Hallo und schön, dass du da bist! Ich bin Sabine, und hinter unserem kleinen Label
          steckt eine Geschichte, die mit zwei wunderbaren Mädchen, einer großen Portion
          Leidenschaft und ganz viel familiärer Unterstützung begonnen hat.
        </p>
      </section>

      <section className="mt-12 space-y-5 font-body text-base leading-relaxed text-binchen-ink-muted">
        <h2 className="font-display text-2xl font-semibold text-binchen-ink sm:text-3xl">
          Wie alles anfing: Ein Wunsch und zwei linke Hände
        </h2>
        <p>
          Als meine Tochter und meine Nichte auf die Welt kamen, hatte ich einen großen Traum:
          Ich wollte wunderschöne, hochwertige Baby- und Kinderkleidung für die beiden nähen. Es
          gab nur ein kleines Problem &ndash; ich konnte zu diesem Zeitpunkt eigentlich noch gar
          nicht richtig nähen!
        </p>
        <p>
          Hier kommt meine Schwiegermutter Doris ins Spiel. Doris ist ein absoluter Näh-Profi.
          Mit unendlich viel Geduld hat sie mir das Handwerk beigebracht, jeden Trick gezeigt
          und meine Begeisterung geteilt.
        </p>
        <p>
          Aus ersten vorsichtigen Versuchen wurde schnell eine echte Leidenschaft. Unsere
          Freunde und Bekannten sahen die selbstgenähten Sachen und waren so begeistert, dass
          die ersten Bestellungen für eigene Kinder und Enkelkinder eintrudelten. Ehe wir uns
          versahen, wuchs aus unserem Hobby ein kleines, feines Familiengeschäft. Am Anfang
          lief es wie am Schnürchen: Ich habe die edlen Stoffe zugeschnitten, und Doris hat sie
          mit ihrer jahrelangen Erfahrung perfekt vernäht.
        </p>
      </section>

      <section className="mt-12 space-y-5 font-body text-base leading-relaxed text-binchen-ink-muted">
        <h2 className="font-display text-2xl font-semibold text-binchen-ink sm:text-3xl">
          Die große Stoff-Liebe
        </h2>
        <p className="font-body text-sm italic text-binchen-ink-subtle">
          oder: Wenn Sammeln zur Passion wird
        </p>
        <p>
          Ich muss gestehen: Ich habe mich unsterblich in hochwertige Stoffe mit tollen Mustern
          verliebt. Sobald ich einen schönen Stoff sehe, kann ich einfach nicht widerstehen!
          Mittlerweile ist unsere Sammlung so riesig, dass es kaum noch ein Muster oder Material
          gibt, das wir nicht Zuhause haben.
        </p>
        <p>Und genau diese Schätze möchten wir nun mit dir teilen!</p>
      </section>

      <section className="mt-12 space-y-5 font-body text-base leading-relaxed text-binchen-ink-muted">
        <h2 className="font-display text-2xl font-semibold text-binchen-ink sm:text-3xl">
          Willkommen in unserem neuen Online-Shop!
        </h2>
        <p>
          Mit dieser Webseite geht für uns ein großer Traum in Erfüllung. Wir haben unseren
          Shop so aufgebaut, dass du maximale Freiheit hast:
        </p>
        <ul className="mt-2 list-disc space-y-3 pl-6">
          <li>
            <span className="font-semibold text-binchen-ink">Sofort-Käufe:</span> Entdecke
            unsere liebevoll fertig genähten Kleidungsstücke, die sofort bereit für den Versand
            sind.
          </li>
          <li>
            <span className="font-semibold text-binchen-ink">Deine Wunsch-Kombination:</span>{" "}
            Such dir einfach deinen Lieblingsstoff aus unserer riesigen Sammlung aus und wähle
            deine Wunschgröße und -farbe. Wir fertigen deine Kollektion dann ganz individuell
            für dich an.
          </li>
        </ul>
      </section>

      <section className="mt-12 space-y-5 font-body text-base leading-relaxed text-binchen-ink-muted">
        <h2 className="font-display text-2xl font-semibold text-binchen-ink sm:text-3xl">
          Du hast Fragen oder Sonderwünsche?
        </h2>
        <p>
          Schreib mir einfach eine Nachricht! Ich berate dich von Herzen gerne und freue mich
          darauf, etwas Schönes für deine Liebsten zu zaubern.
        </p>
        <p>Schön, dass du Teil unserer Reise bist. Viel Spaß beim Stöbern!</p>
      </section>

      <footer className="mt-12 border-t border-binchen-border pt-8">
        <p className="font-body text-base text-binchen-ink-muted">Alles Liebe,</p>
        <p className="mt-2 font-display text-xl font-semibold text-binchen-ink">
          Sabine &amp; Doris
        </p>
      </footer>
    </main>
  );
}
