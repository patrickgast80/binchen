export default function WiderrufPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <h1 className="font-display text-3xl font-semibold text-binchen-ink sm:text-4xl">
        Widerrufsbelehrung
      </h1>

      <section className="mt-10 space-y-3 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">Widerrufsrecht</h2>
        <p>
          Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu
          widerrufen.
        </p>
        <p>
          Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen
          benannter Dritter, der nicht der Beförderer ist, die Waren in Besitz genommen haben bzw.
          hat.
        </p>
        <p>
          Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (Sabine Vollmer, Sägmühlweg 66, 67454
          Haßloch, Telefon: 0152 37328815, E-Mail:{" "}
          <a href="mailto:info@bilulu.de" className="text-binchen-terracotta-text underline">
            info@bilulu.de
          </a>
          ) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine
          E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können
          dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben
          ist.
        </p>
        <p>
          Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung
          des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.
        </p>
      </section>

      <section className="mt-8 space-y-3 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">
          Folgen des Widerrufs
        </h2>
        <p>
          Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen
          erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die
          sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene,
          günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn
          Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses
          Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe
          Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn,
          mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen
          dieser Rückzahlung Entgelte berechnet.
        </p>
        <p>
          Wir können die Rückzahlung verweigern, bis wir die Waren wieder zurückerhalten haben oder
          bis Sie den Nachweis erbracht haben, dass Sie die Waren zurückgesandt haben, je nachdem,
          welches der frühere Zeitpunkt ist.
        </p>
        <p>
          Sie haben die Waren unverzüglich und in jedem Fall spätestens binnen vierzehn Tagen ab
          dem Tag, an dem Sie uns über den Widerruf dieses Vertrags unterrichten, an uns
          zurückzusenden oder zu übergeben. Die Frist ist gewahrt, wenn Sie die Waren vor Ablauf
          der Frist von vierzehn Tagen absenden.
        </p>
        <p>
          Sie tragen die unmittelbaren Kosten der Rücksendung der Waren.
        </p>
        <p>
          Sie müssen für einen etwaigen Wertverlust der Waren nur aufkommen, wenn dieser
          Wertverlust auf einen zur Prüfung der Beschaffenheit, Eigenschaften und Funktionsweise
          der Waren nicht notwendigen Umgang mit ihnen zurückzuführen ist.
        </p>
      </section>

      <section className="mt-8 space-y-3 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">
          Muster-Widerrufsformular
        </h2>
        <p className="italic text-binchen-ink-muted">
          (Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und
          senden Sie es zurück.)
        </p>
        <div className="rounded-lg border border-binchen-border bg-binchen-cream-dark p-6 space-y-2">
          <p>An:</p>
          <p>
            Sabine Vollmer<br />
            Sägmühlweg 66<br />
            67454 Haßloch<br />
            Telefon: 0152 37328815<br />
            E-Mail: info@bilulu.de
          </p>
          <p className="mt-4">
            Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den
            Kauf der folgenden Waren (*) / die Erbringung der folgenden Dienstleistung (*)
          </p>
          <p>Bestellt am (*) / erhalten am (*): ___________________</p>
          <p>Name des/der Verbraucher(s): ___________________</p>
          <p>Anschrift des/der Verbraucher(s): ___________________</p>
          <p>Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier): ___________________</p>
          <p>Datum: ___________________</p>
          <p className="text-sm">(*) Unzutreffendes streichen.</p>
        </div>
      </section>
    </main>
  );
}
