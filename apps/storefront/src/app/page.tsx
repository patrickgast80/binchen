import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPrice, getProducts, type MedusaProduct } from "@/lib/medusa";

interface FeaturedCard {
  id: string;
  name: string;
  description: string;
  price: string | null;
  image: string | null;
  alt: string;
  badge: string | null;
}

const placeholderCards: FeaturedCard[] = [
  {
    id: "placeholder-strampler",
    name: "Strampler aus Bio-Musselin",
    description: "Weicher Musselin, ideal für empfindliche Babyhaut. Größen: 50–74.",
    price: "32,00 €",
    image: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=600&h=600&fit=crop&q=80",
    alt: "Hellblauer Baby-Strampler aus weichem Musselin auf einem Holztisch",
    badge: "Neuheit",
  },
  {
    id: "placeholder-jacke",
    name: "Sommerjacke für Kleinkinder",
    description: "Luftige Jacke aus 100 % Baumwolle. Für aktive Kleine von 1–3 Jahren.",
    price: "48,00 €",
    image: "https://images.unsplash.com/photo-1518831959646-742c3a14ebf6?w=600&h=600&fit=crop&q=80",
    alt: "Pastellgelbe Kinderjacke, handgenäht, auf einem hellen Holzboden",
    badge: "Bestseller",
  },
  {
    id: "placeholder-geschenk",
    name: "Geschenkset Neugeborene",
    description: "Mütze, Fäustlinge und Söckchen im Set. Perfektes Babygeschenk.",
    price: "28,00 €",
    image: "https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=600&h=600&fit=crop&q=80",
    alt: "Liebevoll verpacktes Neugeborenen-Geschenkset in Cremeweiß und Salbeigrün",
    badge: "Geschenktipp",
  },
];

function firstSentence(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  const sentenceEnd = trimmed.search(/[.!?](\s|$)/);
  const candidate = sentenceEnd > 0 ? trimmed.slice(0, sentenceEnd + 1) : trimmed;
  if (candidate.length <= max) return candidate;
  return `${candidate.slice(0, max - 1).trimEnd()}…`;
}

function productToCard(product: MedusaProduct): FeaturedCard {
  const variant = product.variants?.[0];
  const calculated = variant?.calculated_price?.calculated_amount;
  const legacy = variant?.prices?.[0]?.amount;
  const currency =
    variant?.calculated_price?.currency_code ?? variant?.prices?.[0]?.currency_code ?? "EUR";
  const priceAmount = typeof calculated === "number" ? calculated : legacy;
  const image = product.thumbnail ?? product.images?.[0]?.url ?? null;
  const description =
    firstSentence(product.subtitle) || firstSentence(product.description) || "";

  return {
    id: product.id,
    name: product.title,
    description,
    price: typeof priceAmount === "number" ? formatPrice(priceAmount, currency) : null,
    image,
    alt: product.title,
    badge: null,
  };
}

async function loadFeaturedCards(): Promise<FeaturedCard[]> {
  try {
    const { products } = await getProducts({ limit: 3, currency_code: "eur" });
    if (products.length === 0) return placeholderCards;
    const cards = products.slice(0, 3).map(productToCard);
    return cards.length >= 3 ? cards : placeholderCards;
  } catch {
    return placeholderCards;
  }
}

export default async function HomePage() {
  const featuredProducts = await loadFeaturedCards();
  return (
    <>
      {/* Hero section */}
      <section
        aria-labelledby="hero-heading"
        className="relative overflow-hidden bg-binchen-cream-dark"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            {/* Text */}
            <div>
              <p className="font-body text-sm font-medium uppercase tracking-widest text-binchen-terracotta-text">
                Handgemacht mit Liebe
              </p>
              <h1
                id="hero-heading"
                className="mt-3 font-display text-4xl font-semibold leading-tight text-binchen-ink sm:text-5xl lg:text-6xl"
              >
                Kleidung, die{" "}
                <em className="font-display not-italic text-binchen-terracotta-text">Geschichten</em>{" "}
                erzählt
              </h1>
              <p className="mt-6 font-body text-lg leading-relaxed text-binchen-ink-muted">
                Jedes Stück bei Bilulu wird von Hand gefertigt — aus natürlichen Materialien, mit
                Liebe zum Detail und Respekt vor den Kleinsten.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Button asChild variant="accent" size="lg">
                  <Link href="/catalog">Kollektion entdecken</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/about">Unsere Geschichte</Link>
                </Button>
              </div>
            </div>

            {/* Hero image */}
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-binchen-border">
              <Image
                src="https://images.unsplash.com/photo-1522771930-78848d9293e8?w=800&h=800&fit=crop&q=80"
                alt="Handgefertigte Baby-Kleidungsstücke auf einem hellen Holztisch, liebevoll drapiert"
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="products-heading"
        className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <div className="text-center">
          <h2
            id="products-heading"
            className="font-display text-3xl font-semibold text-binchen-ink sm:text-4xl"
          >
            Unsere Lieblinge
          </h2>
          <p className="mx-auto mt-3 max-w-xl font-body text-base text-binchen-ink-muted">
            Handverlesene Stücke aus der aktuellen Kollektion — jedes Unikat oder in kleiner Serie
            gefertigt.
          </p>
        </div>

        <ul
          className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
          aria-label="Produkte"
        >
          {featuredProducts.map((product) => (
            <li key={product.id}>
              <Card className="group overflow-hidden transition-shadow hover:shadow-md">
                {/* Product image */}
                <div className="relative aspect-square overflow-hidden bg-binchen-border">
                  {product.image ? (
                    <Image
                      src={product.image}
                      alt={product.alt}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="font-body text-sm text-binchen-ink-subtle">Kein Bild</span>
                    </div>
                  )}
                  {product.badge && (
                    <span className="absolute left-3 top-3 rounded-full bg-binchen-terracotta-text px-3 py-1 font-body text-xs font-semibold text-binchen-cream">
                      {product.badge}
                    </span>
                  )}
                </div>

                <CardContent className="p-5">
                  <h3 className="font-display text-lg font-semibold text-binchen-ink">
                    {product.name}
                  </h3>
                  {product.description && (
                    <p className="mt-1 font-body text-sm leading-relaxed text-binchen-ink-muted">
                      {product.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-body text-base font-semibold text-binchen-ink">
                      {product.price ?? ""}
                    </span>
                    <Button asChild variant="default" size="sm">
                      <Link href="/catalog" aria-label={`${product.name} in der Kollektion ansehen`}>
                        Ansehen
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>

        <div className="mt-10 text-center">
          <Button asChild variant="outline" size="lg">
            <Link href="/catalog">Alle Produkte ansehen</Link>
          </Button>
        </div>
      </section>

      {/* About Us teaser */}
      <section
        aria-labelledby="about-heading"
        className="bg-binchen-cream-dark"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            {/* Image */}
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-binchen-border lg:order-2">
              <Image
                src="https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=800&h=600&fit=crop&q=80"
                alt="Schneiderin näht liebevoll ein kleines Kleidungsstück an der Nähmaschine"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>

            {/* Text */}
            <div className="lg:order-1">
              <p className="font-body text-sm font-medium uppercase tracking-widest text-binchen-terracotta-text">
                Über Bilulu
              </p>
              <h2
                id="about-heading"
                className="mt-3 font-display text-3xl font-semibold text-binchen-ink sm:text-4xl"
              >
                Jeder Stich mit Sorgfalt
              </h2>
              <p className="mt-4 font-body text-base leading-relaxed text-binchen-ink-muted">
                Bilulu entstand aus der Überzeugung, dass Kinderkleidung mehr sein kann als eine
                Ware. Wir verarbeiten ausschließlich natürliche Materialien, achten auf
                umweltbewusste Produktion und stecken viel Liebe in jedes einzelne Stück.
              </p>
              <p className="mt-4 font-body text-base leading-relaxed text-binchen-ink-muted">
                Jedes Stück ist ein Unikat — oder in kleiner Serie gefertigt — und wird sorgfältig
                kontrolliert, bevor es zu euch kommt.
              </p>
              <div className="mt-6">
                <Button asChild variant="default">
                  <Link href="/about">Mehr über uns</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust badges / values strip */}
      <section aria-label="Unsere Werte" className="border-t border-binchen-border">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <ul
            className="grid grid-cols-2 gap-6 text-center sm:grid-cols-4"
            role="list"
          >
            {[
              { icon: "🌿", label: "Natürliche Materialien" },
              { icon: "✂️", label: "Handgefertigt" },
              { icon: "🇩🇪", label: "Made in Germany" },
              { icon: "📦", label: "Nachhaltige Verpackung" },
            ].map((item) => (
              <li key={item.label} className="flex flex-col items-center gap-2">
                <span className="text-3xl" role="img" aria-hidden="true">
                  {item.icon}
                </span>
                <p className="font-body text-sm font-medium text-binchen-ink">{item.label}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
