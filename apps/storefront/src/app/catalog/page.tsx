import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getProducts } from "@/lib/medusa";
import { CatalogFilters } from "./CatalogFilters";

export const metadata: Metadata = {
  title: "Kollektion",
  description:
    "Entdecke unsere handgefertigten Baby- und Kinderkleidungsstücke aus natürlichen Materialien.",
};

type SearchParams = {
  size?: string;
  fabric?: string;
  age_category?: string;
  age_min?: string;
  age_max?: string;
  page?: string;
};

const LIMIT = 12;

const FRUEHCHEN_SIZE_TOKENS = ["32", "38", "44", "50"];

function hasFruehchenSize(sizeLabel: string | undefined): boolean {
  if (!sizeLabel) return false;
  const tokens = sizeLabel.match(/\d{2,3}/g) ?? [];
  return tokens.some((t) => FRUEHCHEN_SIZE_TOKENS.includes(t));
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const offset = (page - 1) * LIMIT;

  let products: Awaited<ReturnType<typeof getProducts>>["products"] = [];
  let count = 0;
  let fetchError = false;

  try {
    const data = await getProducts({
      size: searchParams.size,
      fabric: searchParams.fabric,
      age_category: searchParams.age_category,
      age_min: searchParams.age_min,
      age_max: searchParams.age_max,
      limit: LIMIT,
      offset,
    });
    products = data.products;
    count = data.count;
  } catch {
    fetchError = true;
  }

  const totalPages = Math.ceil(count / LIMIT);

  return (
    <>
      <section className="border-b border-binchen-border bg-binchen-cream-dark px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="font-display text-3xl font-semibold text-binchen-ink sm:text-4xl">
            Kollektion
          </h1>
          <p className="mt-2 font-body text-base text-binchen-ink-muted">
            Handgefertigte Stücke aus natürlichen Materialien
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-10">
          <aside aria-label="Filter">
            <CatalogFilters
              size={searchParams.size ?? ""}
              fabric={searchParams.fabric ?? ""}
              ageCategory={searchParams.age_category ?? ""}
              ageMin={searchParams.age_min ?? ""}
              ageMax={searchParams.age_max ?? ""}
            />
          </aside>

          <section aria-label="Produkte">
            {fetchError ? (
              <div className="py-16 text-center">
                <p className="font-body text-base text-binchen-ink-muted">
                  Die Produkte konnten nicht geladen werden. Bitte versuche es später erneut.
                </p>
              </div>
            ) : products.length === 0 ? (
              <div className="py-16 text-center">
                <p className="font-body text-base text-binchen-ink-muted">
                  Keine Produkte gefunden. Versuche die Filter anzupassen.
                </p>
              </div>
            ) : (
              <>
                <p className="mb-6 font-body text-sm text-binchen-ink-muted">
                  {count} {count === 1 ? "Produkt" : "Produkte"}
                </p>

                <ul
                  className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3"
                  role="list"
                  aria-label="Produkte"
                >
                  {products.map((product) => {
                    const isSoldOut = product.variants.every((v) => v.inventory_quantity === 0);
                    const isFruehchen = hasFruehchenSize(product.metadata?.sizeLabel);
                    return (
                      <li key={product.id}>
                        <Card className="group overflow-hidden transition-shadow hover:shadow-md">
                          <div className="relative aspect-square overflow-hidden bg-binchen-border">
                            {product.thumbnail ? (
                              <Image
                                src={product.thumbnail}
                                alt={product.title}
                                fill
                                className="object-cover transition-transform duration-300 group-hover:scale-105"
                                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <span className="font-body text-sm text-binchen-ink-subtle">
                                  Kein Bild
                                </span>
                              </div>
                            )}
                            {isSoldOut && (
                              <span className="absolute left-3 top-3 rounded-full bg-binchen-ink px-3 py-1 font-body text-xs font-semibold text-binchen-cream">
                                ausverkauft
                              </span>
                            )}
                            {!isSoldOut && isFruehchen && (
                              <span className="absolute right-3 top-3 rounded-full bg-binchen-terracotta-text px-3 py-1 font-body text-xs font-semibold text-binchen-cream shadow-sm">
                                Frühchengröße verfügbar
                              </span>
                            )}
                          </div>

                          <CardContent className="p-5">
                            <h2 className="font-display text-lg font-semibold text-binchen-ink">
                              {product.title}
                            </h2>
                            {product.metadata?.sizeLabel && (
                              <p className="mt-1 font-body text-sm text-binchen-ink-muted">
                                Größe: {product.metadata.sizeLabel}
                              </p>
                            )}
                            <div className="mt-4">
                              <Button
                                asChild
                                variant={isSoldOut ? "outline" : "default"}
                                size="sm"
                              >
                                <Link
                                  href={`/product/${product.id}`}
                                  aria-label={`${product.title} ansehen`}
                                >
                                  {isSoldOut ? "Ausverkauft" : "Ansehen"}
                                </Link>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </li>
                    );
                  })}
                </ul>

                {totalPages > 1 && (
                  <nav
                    aria-label="Seitennavigation"
                    className="mt-10 flex items-center justify-center gap-4"
                  >
                    {page > 1 && (
                      <Button asChild variant="outline" size="sm">
                        <Link href={buildPageUrl(searchParams, page - 1)} aria-label="Vorherige Seite">
                          ← Zurück
                        </Link>
                      </Button>
                    )}
                    <span className="font-body text-sm text-binchen-ink-muted">
                      Seite {page} / {totalPages}
                    </span>
                    {page < totalPages && (
                      <Button asChild variant="outline" size="sm">
                        <Link href={buildPageUrl(searchParams, page + 1)} aria-label="Nächste Seite">
                          Weiter →
                        </Link>
                      </Button>
                    )}
                  </nav>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function buildPageUrl(searchParams: SearchParams, page: number): string {
  const params = new URLSearchParams();
  if (searchParams.size) params.set("size", searchParams.size);
  if (searchParams.fabric) params.set("fabric", searchParams.fabric);
  if (searchParams.age_category) params.set("age_category", searchParams.age_category);
  if (searchParams.age_min) params.set("age_min", searchParams.age_min);
  if (searchParams.age_max) params.set("age_max", searchParams.age_max);
  params.set("page", String(page));
  return `/catalog?${params.toString()}`;
}
