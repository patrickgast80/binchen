import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export const metadata: Metadata = {
  title: {
    default: "Bilulu Handmade – Baby & Kinderkleidung",
    template: "%s | Bilulu Handmade",
  },
  description:
    "Handgefertigte Baby- & Kinderkleidung aus hochwertigen Materialien. Mit Liebe genäht für die Kleinsten.",
  keywords: ["baby", "kinderkleidung", "handgemacht", "handmade", "biobaumwolle", "nachhaltig"],
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "Bilulu Handmade",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="flex min-h-screen flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-binchen-sage focus:px-4 focus:py-2 focus:text-binchen-cream focus:shadow-lg"
        >
          Zum Hauptinhalt springen
        </a>
        <Header />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
