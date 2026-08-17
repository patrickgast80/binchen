import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice, getProduct, type MedusaProductVariant } from "@/lib/medusa";
import { addToCartFromFormAction } from "@/app/cart/actions";

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const product = await getProduct(params.id);
  if (!product) {
    return { title: "Produkt nicht gefunden" };
  }
  const description =
    product.subtitle?.trim() ||
    product.description?.trim().slice(0, 160) ||
    "Handgefertigtes Stück aus der Bilulu Kollektion";
  return {
    title: product.title,
    description,
  };
}

function variantLabel(variant: MedusaProductVariant): string {
  if (variant.title && variant.title.trim()) return variant.title;
  if (variant.sku) return variant.sku;
  return variant.id;
}

function variantPrice(variant: MedusaProductVariant): { amount: number; currency: string } | null {
  const calculated = variant.calculated_price?.calculated_amount;
  const legacy = variant.prices?.[0]?.amount;
  const amount = typeof calculated === "number" ? calculated : legacy;
  if (typeof amount !== "number") return null;
  const currency =
    variant.calculated_price?.currency_code ?? variant.prices?.[0]?.currency_code ?? "EUR";
  return { amount, currency };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const product = await getProduct(params.id);
  if (!product) notFound();

  const availableVariants = product.variants.filter((v) => v.inventory_quantity > 0);
  const allSoldOut = availableVariants.length === 0;
  const defaultVariant = availableVariants[0] ?? product.variants[0] ?? null;
  const defaultPrice = defaultVariant ? variantPrice(defaultVariant) : null;
  const heroImage = product.thumbnail ?? product.images?.[0]?.url ?? null;

  return (
    <article className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <nav aria-label="Brotkrumen" className="mb-6 font-body text-sm text-binchen-ink-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-binchen-ink">
              Start
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/catalog" className="hover:text-binchen-ink">
              Kollektion
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-binchen-ink">
            {product.title}
          </li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        {/* BIL-2483: Studio-Grey hero, photo edge to edge — the passepartout lives in the
            1200x1200 canvas, extra CSS padding rendered a second frame around it. */}
        <div
          className={`relative aspect-square overflow-hidden rounded-2xl ${
            heroImage
              ? "bg-binchen-studio"
              : "bg-gradient-to-br from-binchen-cream to-binchen-cream-dark"
          }`}
        >
          {heroImage ? (
            <Image
              src={heroImage}
              alt={product.title}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="font-body text-sm text-binchen-ink-subtle">Kein Bild</span>
            </div>
          )}
          {allSoldOut && (
            <span className="absolute left-4 top-4 rounded-full bg-binchen-ink px-3 py-1 font-body text-xs font-semibold text-binchen-cream">
              ausverkauft
            </span>
          )}
        </div>

        <div>
          <h1 className="font-display text-3xl font-semibold text-binchen-ink sm:text-4xl">
            {product.title}
          </h1>
          {product.subtitle && (
            <p className="mt-2 font-body text-base text-binchen-ink-muted">{product.subtitle}</p>
          )}

          {defaultPrice && (
            <div className="mt-4">
              <p className="font-display text-2xl font-semibold text-binchen-ink">
                {formatPrice(defaultPrice.amount, defaultPrice.currency)}
              </p>
              <p className="mt-1 font-body text-xs text-binchen-ink-muted">
                inkl. MwSt. · zzgl.{" "}
                <Link href="/agb" className="underline-offset-2 hover:underline">
                  Versand
                </Link>
              </p>
            </div>
          )}

          {product.metadata?.sizeLabel && (
            <p className="mt-2 font-body text-sm text-binchen-ink-muted">
              Größe: {product.metadata.sizeLabel}
            </p>
          )}

          {product.description && (
            <div className="mt-6 font-body text-base leading-relaxed text-binchen-ink-muted">
              {product.description.split(/\n+/).map((paragraph, i) => (
                <p key={i} className={i > 0 ? "mt-3" : undefined}>
                  {paragraph}
                </p>
              ))}
            </div>
          )}

          {allSoldOut ? (
            <div className="mt-8 rounded-lg border border-binchen-border bg-binchen-cream-dark p-4">
              <p className="font-body text-sm text-binchen-ink-muted">
                Dieses Stück ist derzeit ausverkauft. Schau gerne wieder vorbei.
              </p>
              <div className="mt-4">
                <Button asChild variant="outline" size="sm">
                  <Link href="/catalog">Zurück zur Kollektion</Link>
                </Button>
              </div>
            </div>
          ) : (
            <form action={addToCartFromFormAction} className="mt-8 space-y-5">
              {availableVariants.length > 1 ? (
                <fieldset>
                  <legend className="font-body text-sm font-medium text-binchen-ink">
                    Variante wählen
                  </legend>
                  <div className="mt-3 space-y-2">
                    {availableVariants.map((variant, idx) => (
                      <label
                        key={variant.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md border border-binchen-border bg-binchen-cream px-3 py-2 has-[:checked]:border-binchen-sage has-[:checked]:bg-binchen-cream-dark"
                      >
                        <input
                          type="radio"
                          name="variantId"
                          value={variant.id}
                          defaultChecked={idx === 0}
                          className="h-4 w-4 accent-binchen-sage-btn"
                          required
                        />
                        <span className="font-body text-sm text-binchen-ink">
                          {variantLabel(variant)}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                defaultVariant && (
                  <input type="hidden" name="variantId" value={defaultVariant.id} />
                )
              )}

              <div className="flex items-end gap-4">
                <div className="w-24">
                  <label
                    htmlFor="quantity"
                    className="font-body text-sm font-medium text-binchen-ink"
                  >
                    Menge
                  </label>
                  <Input
                    id="quantity"
                    name="quantity"
                    type="number"
                    min={1}
                    max={99}
                    defaultValue={1}
                    inputMode="numeric"
                    className="mt-1"
                  />
                </div>
                <Button type="submit" variant="accent" size="lg" className="flex-1 sm:flex-none">
                  In den Warenkorb
                </Button>
              </div>
            </form>
          )}

          <p className="mt-6 font-body text-xs text-binchen-ink-subtle">
            Versand aus Deutschland · Handgefertigtes Unikat
          </p>
        </div>
      </div>
    </article>
  );
}
