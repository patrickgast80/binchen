"use client";

import * as React from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "bilulu_cookie_consent_v1";
const POLICY_VERSION = "1";

type Categories = {
  strict: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
};

type StoredConsent = {
  version: string;
  decidedAt: string;
  categories: Categories;
};

const DEFAULT_CATEGORIES: Categories = {
  strict: true,
  functional: false,
  analytics: false,
  marketing: false,
};

function readStored(): StoredConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed?.version !== POLICY_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(categories: Categories) {
  if (typeof window === "undefined") return;
  const payload: StoredConsent = {
    version: POLICY_VERSION,
    decidedAt: new Date().toISOString(),
    categories,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // storage may be unavailable (private mode); banner will re-show next visit
  }
}

/**
 * BIL-2529 — der Banner haengt `fixed bottom-0`, waechst also nach OBEN,
 * solange sein eigenes Markup noch gestreamt wird: erst Ueberschrift, dann
 * Text, dann die drei gestapelten Buttons. Jede Etappe schiebt die Oberkante
 * hoch. Lighthouse hat ihn deshalb in zwei von 24 Laeufen als Verursacher
 * benannt (CLS 0,051 und 0,073, `body.flex > div#cookie-consent`).
 *
 * Beim Sheet des Konfigurators war die Endhoehe zur Render-Zeit bekannt und
 * liess sich reservieren ([[reference_fixed_bottom_sheet_grows_while_streaming]]).
 * Hier geht das nicht: die Hoehe haengt am Textumbruch, also an Viewport-Breite
 * UND geladener Schrift. Ein hart kodierter Wert waere auf jeder zweiten
 * Geraetebreite falsch — zu klein hilft er nicht, zu gross setzt eine leere
 * Flaeche unter die Buttons.
 *
 * Statt die Hoehe zu raten, wird der halb gemalte Zustand gar nicht erst
 * gezeigt: der Banner startet `visibility:hidden` und dieses Skript direkt
 * HINTER ihm im Stream macht ihn sichtbar. Skripte laufen in Dokumentreihen-
 * folge, das Skript kommt also genau dann dran, wenn das Banner-Markup
 * vollstaendig geparst ist — nicht frueher, nicht spaeter. Kein Warten auf
 * Hydration (das waere Sekunden spaeter und wuerde den 5s-Smoke-Test reissen).
 *
 * Warum das den Shift wirklich nimmt und nicht nur verschiebt: Chromium zaehlt
 * nur sichtbare Boxen zur Layout-Instabilitaet. Waechst der Banner unsichtbar,
 * entsteht kein Eintrag; beim Sichtbarwerden steht er auf Endhoehe und hat
 * keine vorherige sichtbare Position, aus der er sich bewegt haette.
 *
 * Ohne JavaScript wuerde der Banner sonst dauerhaft unsichtbar bleiben — das
 * waere ein DSGVO-Rueckschritt, deshalb das `<noscript>`-Gegenstueck. Es steht
 * NACH der Versteck-Regel und gewinnt damit bei gleicher Spezifitaet.
 *
 * Sichtbarkeit laeuft bewusst ueber eine Klasse am `<html>` und nicht ueber ein
 * Attribut am Banner selbst: haette React die Eigenschaft in seinen Props,
 * wuerde das Skript sie hinter Reacts Ruecken aendern und die Hydration meldete
 * einen Mismatch. `<html>` traegt in `layout.tsx` kein `className`, React fasst
 * es also nie an.
 */
const HIDE_UNTIL_PARSED_CSS =
  "#cookie-consent{visibility:hidden}" +
  ".cookie-consent-ready #cookie-consent{visibility:visible}";
const REVEAL_WHEN_VISIBLE_CSS = "#cookie-consent{visibility:visible}";
const REVEAL_SCRIPT = `document.documentElement.classList.add("cookie-consent-ready")`;

export function CookieConsent() {
  // Render the banner by default on first paint so the consent UI is in the
  // initial DOM (DSGVO: visible before any non-essential cookies are set, and
  // the smoke test asserts visibility within 5s of load without interaction).
  const [open, setOpen] = React.useState(true);
  const [prefsOpen, setPrefsOpen] = React.useState(false);
  const [categories, setCategories] = React.useState<Categories>(DEFAULT_CATEGORIES);

  React.useEffect(() => {
    const stored = readStored();
    if (stored) {
      setCategories(stored.categories);
      setOpen(false);
    }
  }, []);

  const decide = React.useCallback((next: Categories) => {
    persist(next);
    setCategories(next);
    setPrefsOpen(false);
    setOpen(false);
  }, []);

  const acceptAll = () =>
    decide({ strict: true, functional: true, analytics: true, marketing: true });
  const rejectAll = () => decide({ ...DEFAULT_CATEGORIES });
  const saveSelection = () => decide(categories);

  if (!open) return null;

  return (
    <>
      {/* BIL-2529 — steht VOR dem Banner im Stream, die Regel gilt also schon,
          wenn der Browser die erste Zeile des Banners parst. */}
      <style dangerouslySetInnerHTML={{ __html: HIDE_UNTIL_PARSED_CSS }} />
      <div
        id="cookie-consent"
        data-testid="cookie-banner"
        role="dialog"
        aria-modal="false"
        aria-label="Cookie-Einstellungen und Datenschutz"
        aria-describedby="cookie-consent-desc"
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 fixed inset-x-0 bottom-0 z-50 border-t border-binchen-border bg-binchen-cream shadow-lg"
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <h2 className="font-display text-base font-semibold text-binchen-ink">
              Wir respektieren deine Privatsphäre
            </h2>
            <p id="cookie-consent-desc" className="mt-1 text-sm text-binchen-ink-muted">
              Wir nutzen technisch notwendige Cookies, damit der Shop funktioniert. Mit deiner
              Einwilligung verwenden wir zusätzlich Cookies für Komfort, Statistik und Marketing.
              Du kannst deine Auswahl jederzeit anpassen. Mehr in unserer{" "}
              <Link
                href="/datenschutz"
                className="underline underline-offset-4 hover:text-binchen-ink"
              >
                Datenschutzerklärung
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:flex-nowrap md:justify-end">
            <Button
              variant="outline"
              onClick={rejectAll}
              data-testid="cookie-reject-all"
              aria-label="Alle nicht notwendigen Cookies ablehnen"
            >
              Alle ablehnen
            </Button>
            <Button
              variant="outline"
              onClick={() => setPrefsOpen(true)}
              data-testid="cookie-customize"
            >
              Einstellungen
            </Button>
            <Button
              onClick={acceptAll}
              data-testid="cookie-accept-all"
              aria-label="Alle Cookies akzeptieren"
            >
              Alle akzeptieren
            </Button>
          </div>
        </div>
      </div>
      {/* BIL-2529 — direkt hinter dem Banner: laeuft in dem Moment, in dem sein
          Markup vollstaendig geparst ist. */}
      <script dangerouslySetInnerHTML={{ __html: REVEAL_SCRIPT }} />
      <noscript>
        <style dangerouslySetInnerHTML={{ __html: REVEAL_WHEN_VISIBLE_CSS }} />
      </noscript>

      <Dialog open={prefsOpen} onOpenChange={setPrefsOpen}>
        <DialogContent
          className="max-w-xl"
          aria-label="Cookie-Einstellungen anpassen"
          data-testid="cookie-preferences"
        >
          <DialogHeader>
            <DialogTitle>Cookie-Einstellungen</DialogTitle>
            <DialogDescription>
              Wähle aus, welche Kategorien von Cookies du zulässt. Notwendige Cookies sind für den
              Shop erforderlich und können nicht deaktiviert werden.
            </DialogDescription>
          </DialogHeader>

          <ul className="flex flex-col gap-3">
            <li className="flex items-start justify-between gap-4 rounded-md border border-binchen-border bg-binchen-cream-dark/40 p-3">
              <div>
                <p className="text-sm font-semibold text-binchen-ink">Notwendig</p>
                <p className="text-xs text-binchen-ink-muted">
                  Warenkorb, Login, Sicherheit. Immer aktiv.
                </p>
              </div>
              <input
                type="checkbox"
                checked
                disabled
                aria-label="Notwendige Cookies (immer aktiv)"
                className="mt-1 h-4 w-4"
              />
            </li>
            {(
              [
                {
                  key: "functional" as const,
                  label: "Funktional",
                  desc: "Merkt sich z. B. deine Sprache oder Größen-Auswahl.",
                },
                {
                  key: "analytics" as const,
                  label: "Statistik",
                  desc: "Anonyme Nutzungsstatistiken zur Verbesserung des Shops.",
                },
                {
                  key: "marketing" as const,
                  label: "Marketing",
                  desc: "Personalisierte Anzeigen auf anderen Plattformen.",
                },
              ]
            ).map(({ key, label, desc }) => (
              <li
                key={key}
                className="flex items-start justify-between gap-4 rounded-md border border-binchen-border p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-binchen-ink">{label}</p>
                  <p className="text-xs text-binchen-ink-muted">{desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={categories[key]}
                  onChange={(e) =>
                    setCategories((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  aria-label={`${label}-Cookies erlauben`}
                  data-testid={`cookie-toggle-${key}`}
                  className="mt-1 h-4 w-4"
                />
              </li>
            ))}
          </ul>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={rejectAll}>
              Alle ablehnen
            </Button>
            <Button onClick={saveSelection} data-testid="cookie-save">
              Auswahl speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
