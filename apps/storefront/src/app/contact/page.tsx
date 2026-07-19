import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Kontakt",
  description:
    "Schreib uns – wir antworten persönlich. Bilulu Handmade Baby- & Kinderkleidung aus Haßloch.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <h1 className="font-display text-3xl font-semibold text-binchen-ink sm:text-4xl">
        Kontakt
      </h1>
      <p className="mt-4 font-body text-base leading-relaxed text-binchen-ink-muted">
        Eine Frage zu einem Stück, zur Größe oder zur Bestellung? Schreib uns –
        wir antworten persönlich, meist innerhalb von ein bis zwei Werktagen.
      </p>

      <section className="mt-10 space-y-2 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">
          Per E-Mail
        </h2>
        <p>
          <a
            href="mailto:info@bilulu.de"
            className="text-binchen-terracotta-text underline"
          >
            info@bilulu.de
          </a>
        </p>
      </section>

      <section className="mt-8 space-y-2 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">
          Per Telefon
        </h2>
        <p>0152 37328815</p>
      </section>

      <section className="mt-8 space-y-2 font-body text-base text-binchen-ink-muted">
        <h2 className="font-display text-xl font-semibold text-binchen-ink">
          Per Post
        </h2>
        <p>Sabine Vollmer</p>
        <p>Sägmühlweg 66</p>
        <p>67454 Haßloch</p>
        <p>Deutschland</p>
      </section>

      <section className="mt-10 space-y-2 font-body text-base text-binchen-ink-muted">
        <p>
          Vollständige Anbieterkennzeichnung im{" "}
          <Link
            href="/impressum"
            className="text-binchen-terracotta-text underline"
          >
            Impressum
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
