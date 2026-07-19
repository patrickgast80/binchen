export default function ImpressumPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <h1 className="font-display text-3xl font-semibold text-binchen-ink sm:text-4xl">Impressum</h1>

      <section className="mt-10 space-y-2 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">Angaben gemäß § 5 TMG</h2>
        <p>Sabine Vollmer</p>
        <p>Sägmühlweg 66</p>
        <p>67454 Haßloch</p>
        <p>Deutschland</p>
      </section>

      <section className="mt-8 space-y-2 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">Kontakt</h2>
        <p>Telefon: 0152 37328815</p>
        <p>
          E-Mail:{" "}
          <a href="mailto:info@bilulu.de" className="text-binchen-terracotta-text underline">
            info@bilulu.de
          </a>
        </p>
      </section>

      <section className="mt-8 space-y-2 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">
          Umsatzsteuer-Hinweis
        </h2>
        <p>
          Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung). Es wird
          daher keine Umsatzsteuer-Identifikationsnummer ausgewiesen.
        </p>
      </section>

      <section className="mt-8 space-y-2 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">
          Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
        </h2>
        <p>Sabine Vollmer</p>
        <p>Sägmühlweg 66</p>
        <p>67454 Haßloch</p>
      </section>

      <section className="mt-8 space-y-2 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">Streitschlichtung</h2>
        <p>
          Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
          <a
            href="https://ec.europa.eu/consumers/odr/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-binchen-terracotta-text underline"
          >
            https://ec.europa.eu/consumers/odr/
          </a>
          .
        </p>
        <p>
          Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle teilzunehmen.
        </p>
      </section>

      <section className="mt-8 space-y-2 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">Haftung für Inhalte</h2>
        <p>
          Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten
          nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als
          Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
          Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige
          Tätigkeit hinweisen.
        </p>
        <p>
          Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den
          allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch
          erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei
          Bekanntwerden von entsprechenden Rechtsverletzungen werden wir diese Inhalte umgehend
          entfernen.
        </p>
      </section>

      <section className="mt-8 space-y-2 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">Haftung für Links</h2>
        <p>
          Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen
          Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen.
          Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der
          Seiten verantwortlich. Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf
          mögliche Rechtsverstöße überprüft. Rechtswidrige Inhalte waren zum Zeitpunkt der
          Verlinkung nicht erkennbar.
        </p>
      </section>

      <section className="mt-8 space-y-2 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">Urheberrecht</h2>
        <p>
          Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen
          dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art
          der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen
          Zustimmung des jeweiligen Autors bzw. Erstellers.
        </p>
      </section>
    </main>
  );
}
