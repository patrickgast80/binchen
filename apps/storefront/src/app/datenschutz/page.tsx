export default function DatenschutzPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <h1 className="font-display text-3xl font-semibold text-binchen-ink sm:text-4xl">
        Datenschutzerklärung
      </h1>

      <section className="mt-10 space-y-3 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">1. Verantwortliche</h2>
        <p>Verantwortliche im Sinne der DSGVO:</p>
        <p>
          Sabine Vollmer<br />
          Sägmühlweg 66<br />
          67454 Haßloch<br />
          E-Mail:{" "}
          <a href="mailto:info@bilulu.de" className="text-binchen-terracotta-text underline">
            info@bilulu.de
          </a>
        </p>
      </section>

      <section className="mt-8 space-y-3 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">
          2. Erhebung und Speicherung personenbezogener Daten
        </h2>
        <p>
          Beim Besuch dieser Website werden durch den Hosting-Anbieter automatisch Informationen in
          Server-Log-Dateien gespeichert: IP-Adresse, Datum und Uhrzeit des Abrufs, Name der
          abgerufenen Datei, Referrer sowie verwendeter Browser und Betriebssystem. Diese Daten
          werden nicht mit anderen Datenquellen zusammengeführt.
        </p>
        <p>
          Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am sicheren Betrieb
          dieser Website).
        </p>
      </section>

      <section className="mt-8 space-y-3 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">3. Bestellungen</h2>
        <p>
          Bei einer Bestellung erheben wir: Name, Lieferadresse, E-Mail-Adresse sowie
          Zahlungsdaten (verarbeitet durch PayPal, s. u.). Diese Daten sind zur Vertragserfüllung
          erforderlich (Art. 6 Abs. 1 lit. b DSGVO) und werden nach Ablauf handels- und
          steuerrechtlicher Aufbewahrungsfristen (i. d. R. 10 Jahre) gelöscht.
        </p>
      </section>

      <section className="mt-8 space-y-3 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">
          4. Auftragsverarbeiter / Dienstleister
        </h2>

        <h3 className="font-display text-lg font-semibold text-binchen-ink">Vercel Inc. (Hosting)</h3>
        <p>
          Diese Website wird bei Vercel Inc., 340 Pine Street, Suite 701, San Francisco, CA 94104,
          USA, gehostet. Vercel verarbeitet Zugriffsdaten auf Basis eines
          Auftragsverarbeitungsvertrags. Datenübertragungen in die USA sind durch
          Standard-Datenschutzklauseln (Art. 46 Abs. 2 lit. c DSGVO) abgesichert.
          Datenschutzerklärung:{" "}
          <a
            href="https://vercel.com/legal/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-binchen-terracotta-text underline"
          >
            vercel.com/legal/privacy-policy
          </a>
          .
        </p>

        <h3 className="font-display text-lg font-semibold text-binchen-ink">
          Render Services Inc. (Backend)
        </h3>
        <p>
          Unser Shop-Backend läuft bei Render Services Inc., 525 Brannan St., San Francisco, CA
          94107, USA. Render verarbeitet Bestelldaten als Auftragsverarbeiter.
          Datenschutzerklärung:{" "}
          <a
            href="https://render.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-binchen-terracotta-text underline"
          >
            render.com/privacy
          </a>
          .
        </p>

        <h3 className="font-display text-lg font-semibold text-binchen-ink">
          PayPal (Europe) S.à r.l. et Cie, S.C.A. (Zahlungsabwicklung)
        </h3>
        <p>
          Zahlungen werden über PayPal abgewickelt. PayPal (Europe) S.à r.l. et Cie, S.C.A.,
          22-24 Boulevard Royal, L-2449 Luxembourg. PayPal erhebt und verarbeitet Zahlungsdaten
          als eigenständig Verantwortlicher. Datenschutzerklärung:{" "}
          <a
            href="https://www.paypal.com/de/legalhub/privacy-full"
            target="_blank"
            rel="noopener noreferrer"
            className="text-binchen-terracotta-text underline"
          >
            paypal.com/de/legalhub/privacy-full
          </a>
          . Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.
        </p>
      </section>

      <section className="mt-8 space-y-3 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">5. Cookies</h2>
        <p>
          Diese Website verwendet ausschließlich technisch notwendige Cookies (z. B.
          Warenkorb-Session). Diese sind für den Betrieb des Shops erforderlich und können nicht
          deaktiviert werden. Es werden keine Tracking- oder Analyse-Cookies eingesetzt.
        </p>
      </section>

      <section className="mt-8 space-y-3 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">
          6. Ihre Rechte nach DSGVO
        </h2>
        <p>Sie haben das Recht auf:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Auskunft über Ihre bei uns gespeicherten Daten (Art. 15 DSGVO)</li>
          <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
          <li>Löschung Ihrer Daten, sofern keine gesetzliche Aufbewahrungspflicht besteht (Art. 17 DSGVO)</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
          <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
        </ul>
        <p>
          Zur Ausübung dieser Rechte:{" "}
          <a href="mailto:info@bilulu.de" className="text-binchen-terracotta-text underline">
            info@bilulu.de
          </a>
          .
        </p>
        <p>
          Sie haben außerdem das Recht, sich bei der zuständigen Datenschutz-Aufsichtsbehörde zu
          beschweren (Art. 77 DSGVO). Zuständig: Landesbeauftragte für den Datenschutz und die
          Informationsfreiheit Rheinland-Pfalz.
        </p>
      </section>

      <section className="mt-8 space-y-2 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">
          7. Aktualität dieser Erklärung
        </h2>
        <p>Stand: Juni 2026.</p>
      </section>
    </main>
  );
}
