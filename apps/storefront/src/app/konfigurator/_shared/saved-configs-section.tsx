"use client";

import * as React from "react";
import Link from "next/link";
import { Bookmark, Check, Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  KONFIG_REGISTRY,
  type KonfiguratorId,
  swatchNameOrDefault,
} from "./registry";
import { renderKonfigThumbnail } from "./thumbnail";
import { useSavedConfigs, type SavedConfig } from "./saved-configs-store";
import { type MusterRotation, rotationLabel } from "./rotation";

interface SavedConfigsSectionProps {
  konfigurator: KonfiguratorId;
  selection: Record<string, string>;
  href: string;
  /** Fabric rotation baked into the thumbnail and the generated name (BIL-2492). */
  rotation?: MusterRotation;
}

function defaultName(
  konfigurator: KonfiguratorId,
  selection: Record<string, string>,
  rotation: MusterRotation,
): string {
  const konfig = KONFIG_REGISTRY[konfigurator];
  const parts = konfig.regions
    .map((r) => swatchNameOrDefault(selection[r.param], r.defaultColor))
    .join(" · ");
  // Only mention the angle when it is not the default — otherwise every saved
  // name would carry a noisy "· Muster 0°".
  const turn = rotation === 0 ? "" : ` · Muster ${rotationLabel(rotation)}`;
  return `${konfig.productLabel} — ${parts}${turn}`;
}

export function SavedConfigsSection({
  konfigurator,
  selection,
  href,
  rotation = 0,
}: SavedConfigsSectionProps) {
  const { entries, save, rename, remove, isHydrated } = useSavedConfigs(konfigurator);
  const [busy, setBusy] = React.useState<"idle" | "saving">("idle");
  const [flash, setFlash] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingValue, setEditingValue] = React.useState("");

  const handleSave = React.useCallback(async () => {
    if (busy === "saving") return;
    setBusy("saving");
    try {
      const thumbnail = await renderKonfigThumbnail(
        KONFIG_REGISTRY[konfigurator],
        selection,
        240,
        rotation,
      );
      const name = defaultName(konfigurator, selection, rotation);
      save({ name, href, thumbnail });
      setFlash("Konfiguration gemerkt");
      window.setTimeout(() => setFlash(null), 2200);
    } catch {
      // Canvas errors (e.g. image load fail) — surface a non-blocking hint.
      setFlash("Speichern fehlgeschlagen — bitte nochmal");
      window.setTimeout(() => setFlash(null), 3000);
    } finally {
      setBusy("idle");
    }
  }, [busy, href, konfigurator, rotation, save, selection]);

  const startRename = (entry: SavedConfig) => {
    setEditingId(entry.id);
    setEditingValue(entry.name);
  };

  const commitRename = () => {
    if (editingId) rename(editingId, editingValue);
    setEditingId(null);
    setEditingValue("");
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingValue("");
  };

  return (
    <section
      aria-labelledby="saved-configs-heading"
      className="mt-8 rounded-2xl border border-binchen-border bg-binchen-cream-dark/50 p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2
            id="saved-configs-heading"
            className="font-display text-lg font-semibold text-binchen-ink sm:text-xl"
          >
            Deine gespeicherten Konfigurationen
          </h2>
          <p className="mt-1 font-body text-sm text-binchen-ink-muted">
            Merke dir deine aktuelle Farbwahl — bleibt in diesem Browser gespeichert.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {flash && (
            <span
              role="status"
              aria-live="polite"
              className="font-body text-sm text-binchen-ink-muted"
            >
              {flash}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={busy === "saving"}
          >
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            {busy === "saving" ? "Speichere…" : "Merken"}
          </Button>
        </div>
      </div>

      {isHydrated && entries.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-binchen-border/70 bg-binchen-cream/40 px-4 py-3 font-body text-sm text-binchen-ink-muted">
          Noch nichts gespeichert. Klick auf <span className="font-medium">Merken</span>, um
          deine aktuelle Auswahl abzulegen.
        </p>
      )}

      {entries.length > 0 && (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="group flex flex-col rounded-xl border border-binchen-border bg-binchen-cream/80 p-2 shadow-sm"
            >
              <Link
                href={entry.href}
                className="relative block overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn focus-visible:ring-offset-2 focus-visible:ring-offset-binchen-cream"
                aria-label={`Konfiguration laden: ${entry.name}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={entry.thumbnail}
                  alt=""
                  className="aspect-square w-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </Link>
              <div className="mt-2 flex-1">
                {editingId === entry.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") cancelRename();
                      }}
                      aria-label="Name ändern"
                      className={cn(
                        "flex-1 rounded-md border border-binchen-border bg-binchen-cream",
                        "px-2 py-1 font-body text-xs text-binchen-ink",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn",
                      )}
                    />
                    <button
                      type="button"
                      onClick={commitRename}
                      aria-label="Namen speichern"
                      className="rounded p-1 text-binchen-ink hover:bg-binchen-cream-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelRename}
                      aria-label="Umbenennen abbrechen"
                      className="rounded p-1 text-binchen-ink-muted hover:bg-binchen-cream-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <p
                    className="line-clamp-2 font-body text-xs leading-snug text-binchen-ink"
                    title={entry.name}
                  >
                    {entry.name}
                  </p>
                )}
              </div>
              {editingId !== entry.id && (
                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => startRename(entry)}
                    aria-label={`${entry.name} umbenennen`}
                    className="inline-flex items-center gap-1 rounded p-1 font-body text-xs text-binchen-ink-muted hover:text-binchen-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Umbenennen
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(entry.id)}
                    aria-label={`${entry.name} löschen`}
                    className="inline-flex items-center gap-1 rounded p-1 font-body text-xs text-binchen-terracotta-text hover:text-binchen-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage-btn"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Löschen
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
