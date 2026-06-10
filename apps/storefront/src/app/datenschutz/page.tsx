import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
  description: "Informationen zur Verarbeitung personenbezogener Daten bei Bilulu Handmade.",
};

export default function DatenschutzPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <h1 className="font-display text-display-md text-binchen-ink">Datenschutzerklärung</h1>
      <p className="mt-4 text-binchen-ink-muted">
        Diese Seite informiert über die Verarbeitung personenbezogener Daten bei Bilulu Handmade
        gemäß DSGVO und TTDSG. Die vollständige Datenschutzerklärung wird derzeit finalisiert.
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-display-sm text-binchen-ink">Cookies und Einwilligung</h2>
        <p className="text-sm text-binchen-ink-muted">
          Wir setzen technisch notwendige Cookies ein, damit der Shop funktioniert (z. B.
          Warenkorb, Sitzung). Optionale Cookies für Komfort, Statistik und Marketing werden nur
          nach deiner ausdrücklichen Einwilligung über das Cookie-Banner geladen. Deine
          Einwilligung kannst du jederzeit über den Cookie-Banner widerrufen oder anpassen.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-display-sm text-binchen-ink">Verantwortliche Stelle</h2>
        <p className="text-sm text-binchen-ink-muted">
          Die Kontaktdaten der für die Verarbeitung verantwortlichen Stelle findest du im{" "}
          <a href="/impressum" className="underline underline-offset-4">
            Impressum
          </a>
          .
        </p>
      </section>
    </article>
  );
}
