"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const navLinks = [
  { href: "/catalog", label: "Shop" },
  { href: "/konfigurator/hose", label: "Konfigurator" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-binchen-border bg-binchen-cream/95 backdrop-blur supports-[backdrop-filter]:bg-binchen-cream/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="font-display text-xl font-semibold text-binchen-ink transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage focus-visible:ring-offset-2 rounded"
          aria-label="Bilulu – zurück zur Startseite"
        >
          <span className="text-binchen-terracotta-text">Bilulu</span>
          <span className="hidden text-binchen-ink-muted sm:inline"> Handmade</span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Hauptnavigation" className="hidden md:flex md:items-center md:gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-body text-sm font-medium text-binchen-ink-muted transition-colors hover:text-binchen-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage rounded px-1 py-0.5"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          {/* Cart */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Warenkorb öffnen (0 Artikel)"
            className="relative"
            asChild
          >
            <Link href="/cart">
              <ShoppingBag className="h-5 w-5" aria-hidden="true" />
              {/* Cart badge — zero-state hidden; wire up when cart is live */}
            </Link>
          </Button>

          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Navigationsmenü öffnen"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" aria-label="Navigationsmenü">
              <SheetHeader>
                <SheetTitle className="font-display text-binchen-terracotta-text">Bilulu</SheetTitle>
              </SheetHeader>
              <nav
                aria-label="Mobilnavigation"
                className="mt-8 flex flex-col gap-4"
              >
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="font-body text-lg font-medium text-binchen-ink transition-colors hover:text-binchen-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage rounded px-1 py-1"
                  >
                    {link.label}
                  </Link>
                ))}
                <hr className="border-binchen-border" />
                <Link
                  href="/cart"
                  className="flex items-center gap-2 font-body text-lg font-medium text-binchen-ink transition-colors hover:text-binchen-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage rounded px-1 py-1"
                >
                  <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                  Warenkorb
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
