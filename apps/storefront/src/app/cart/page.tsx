import * as React from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadCart } from "@/lib/cart-cookie";
import { formatPrice, lineItemSubtotal, type CartLineItem } from "@/lib/medusa";
import { removeFromCartAction } from "./actions";

interface KonfiguratorSelection {
  /** Cart-line display title, e.g. "Konfigurator-Hose" */
  title: string;
  /** Label/value pairs rendered as the selection summary */
  entries: { label: string; value: string }[];
  configHref?: string | null;
}

function konfiguratorSelection(item: CartLineItem): KonfiguratorSelection | null {
  const md = item.metadata;
  if (!md || typeof md !== "object") return null;
  const kind = (md as { kind?: unknown }).kind;
  const asStr = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const m = md as Record<string, unknown>;

  if (kind === "konfigurator-hose") {
    // Legacy carts (pre BIL-2417) stored separate linksName/rechtsName. If both
    // match, collapse to hoseName; otherwise pick the first present so old
    // orders still render a sensible line.
    const hoseName = asStr(m.hoseName) ?? asStr(m.linksName) ?? asStr(m.rechtsName);
    const entries = [
      { label: "Bund", value: asStr(m.bundName) },
      { label: "Hose", value: hoseName },
      { label: "Bündchen", value: asStr(m.buendchenName) },
    ].filter((e): e is { label: string; value: string } => e.value !== null);
    return { title: "Konfigurator-Hose", entries, configHref: asStr(m.configHref) };
  }

  if (kind === "konfigurator-turban") {
    const entries = [
      { label: "Turban", value: asStr(m.turbanName) },
      { label: "Schleife", value: asStr(m.schleifeName) },
    ].filter((e): e is { label: string; value: string } => e.value !== null);
    return { title: "Konfigurator-Turban", entries, configHref: asStr(m.configHref) };
  }

  if (kind === "konfigurator-muetze") {
    const entries = [
      { label: "Mütze", value: asStr(m.muetzeName) },
      { label: "Futter", value: asStr(m.futterName) },
    ].filter((e): e is { label: string; value: string } => e.value !== null);
    return { title: "Konfigurator-Mütze", entries, configHref: asStr(m.configHref) };
  }

  if (kind === "konfigurator-dreieckstuch") {
    const entries = [
      { label: "Tuch", value: asStr(m.tuchName) },
    ].filter((e): e is { label: string; value: string } => e.value !== null);
    return { title: "Konfigurator-Dreieckstuch", entries, configHref: asStr(m.configHref) };
  }

  return null;
}

export const metadata: Metadata = {
  title: "Warenkorb",
  description: "Dein Warenkorb bei Bilulu Handmade",
};

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cart = await loadCart();
  const items = cart?.items ?? [];
  const isEmpty = items.length === 0;
  const currency = cart?.currency_code ?? "eur";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <h1 className="font-display text-3xl font-semibold text-binchen-ink sm:text-4xl">
        Warenkorb
      </h1>

      {isEmpty ? (
        <div className="mt-12 text-center">
          <p className="font-body text-base text-binchen-ink-muted">
            Dein Warenkorb ist leer.
          </p>
          <div className="mt-6">
            <Button asChild variant="accent" size="lg">
              <Link href="/catalog">Kollektion entdecken</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-8 lg:grid lg:grid-cols-[1fr_360px] lg:gap-12">
          <section aria-label="Artikel im Warenkorb">
            <ul role="list" className="divide-y divide-binchen-border border-y border-binchen-border">
              {items.map((item) => {
                const konfig = konfiguratorSelection(item);
                const displayTitle = konfig ? konfig.title : item.title;
                return (
                  <li key={item.id} className="flex gap-4 py-6">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded bg-gradient-to-br from-binchen-cream to-binchen-cream-dark sm:h-24 sm:w-24">
                      {item.thumbnail ? (
                        <Image
                          src={item.thumbnail}
                          alt={displayTitle}
                          fill
                          sizes="96px"
                          className="object-contain p-1"
                        />
                      ) : null}
                    </div>
                    <div className="flex flex-1 flex-col justify-between gap-2">
                      <div>
                        <h2 className="font-display text-base font-semibold text-binchen-ink">
                          {displayTitle}
                        </h2>
                        {konfig ? (
                          <p className="mt-0.5 font-body text-sm text-binchen-ink-muted">
                            Deine Konfiguration
                          </p>
                        ) : item.subtitle ? (
                          <p className="mt-0.5 font-body text-sm text-binchen-ink-muted">
                            {item.subtitle}
                          </p>
                        ) : null}
                        {konfig ? (
                          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-body text-xs text-binchen-ink-muted">
                            {konfig.entries.map((entry) => (
                              <React.Fragment key={entry.label}>
                                <dt className="text-binchen-ink-subtle">{entry.label}:</dt>
                                <dd className="font-medium text-binchen-ink">{entry.value}</dd>
                              </React.Fragment>
                            ))}
                          </dl>
                        ) : (
                          <p className="mt-1 font-body text-xs text-binchen-ink-subtle">
                            Unikat — Stückzahl auf 1 begrenzt
                          </p>
                        )}
                        {konfig?.configHref ? (
                          <Link
                            href={konfig.configHref}
                            className="mt-2 inline-block font-body text-xs font-medium text-binchen-terracotta-text underline-offset-4 hover:underline"
                          >
                            Konfiguration anpassen
                          </Link>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-body text-sm font-semibold text-binchen-ink">
                          {formatPrice(lineItemSubtotal(item), currency)}
                        </span>
                        <form action={removeFromCartAction.bind(null, item.id)}>
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            aria-label={`${displayTitle} entfernen`}
                            className="text-binchen-ink-muted hover:text-binchen-terracotta-text"
                          >
                            Entfernen
                          </Button>
                        </form>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <aside aria-label="Zusammenfassung" className="mt-10 lg:mt-0">
            <div className="rounded-lg border border-binchen-border bg-binchen-cream-dark p-6">
              <h2 className="font-display text-lg font-semibold text-binchen-ink">
                Zusammenfassung
              </h2>
              <dl className="mt-4 space-y-3 font-body text-sm">
                <div className="flex justify-between text-binchen-ink-muted">
                  <dt>Zwischensumme</dt>
                  <dd>{formatPrice(cart?.subtotal ?? 0, currency)}</dd>
                </div>
                <div className="flex justify-between text-binchen-ink-muted">
                  <dt>Versand</dt>
                  <dd>
                    {cart && cart.shipping_total > 0
                      ? formatPrice(cart.shipping_total, currency)
                      : "wird im Checkout berechnet"}
                  </dd>
                </div>
                <div className="flex justify-between text-binchen-ink-muted">
                  <dt>USt. enthalten</dt>
                  <dd>{formatPrice(cart?.tax_total ?? 0, currency)}</dd>
                </div>
                <div className="border-t border-binchen-border pt-3" />
                <div className="flex justify-between text-base font-semibold text-binchen-ink">
                  <dt>Gesamt</dt>
                  <dd>{formatPrice(cart?.total ?? 0, currency)}</dd>
                </div>
              </dl>
              <div className="mt-6">
                <Button asChild variant="accent" size="lg" className="w-full">
                  <Link href="/checkout">Zur Kasse</Link>
                </Button>
              </div>
              <p className="mt-3 text-center font-body text-xs text-binchen-ink-subtle">
                Sichere Bezahlung • Versand aus Deutschland
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
