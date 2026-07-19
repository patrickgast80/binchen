import Link from "next/link";

const legalLinks = [
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz", label: "Datenschutz" },
  { href: "/agb", label: "AGB" },
  { href: "/widerruf", label: "Widerrufsrecht" },
];

const shopLinks = [
  { href: "/catalog", label: "Alle Produkte" },
  { href: "/fruehchen", label: "Frühchen" },
  { href: "/catalog?filter=newborn", label: "Neugeborene" },
  { href: "/catalog?filter=toddler", label: "Kleinkinder" },
  { href: "/catalog?filter=gift", label: "Geschenke" },
];

export function Footer() {
  return (
    <footer
      className="mt-auto border-t border-binchen-border bg-binchen-cream-dark"
      aria-label="Seitenfußbereich"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {/* Brand */}
          <div>
            <p className="font-display text-xl font-semibold text-binchen-terracotta-text">Bilulu</p>
            <p className="mt-2 font-body text-sm text-binchen-ink-muted">
              Handgefertigte Baby- & Kinderkleidung mit Liebe gemacht.
            </p>
          </div>

          {/* Shop links */}
          <div>
            <h3 className="font-body text-sm font-semibold uppercase tracking-wider text-binchen-ink">
              Shop
            </h3>
            <ul className="mt-3 space-y-2" role="list">
              {shopLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="font-body text-sm text-binchen-ink-muted transition-colors hover:text-binchen-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage rounded"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal links */}
          <div>
            <h3 className="font-body text-sm font-semibold uppercase tracking-wider text-binchen-ink">
              Rechtliches
            </h3>
            <ul className="mt-3 space-y-2" role="list">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="font-body text-sm text-binchen-ink-muted transition-colors hover:text-binchen-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage rounded"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-binchen-border pt-8 text-center">
          <p className="font-body text-xs text-binchen-ink-muted">
            &copy; {new Date().getFullYear()} Bilulu Handmade. Alle Rechte vorbehalten.
          </p>
        </div>
      </div>
    </footer>
  );
}
