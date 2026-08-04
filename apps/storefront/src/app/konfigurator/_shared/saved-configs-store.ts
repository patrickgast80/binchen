"use client";

import * as React from "react";

import type { KonfiguratorId } from "./registry";

export interface SavedConfig {
  id: string;
  konfigurator: KonfiguratorId;
  name: string;
  href: string;
  thumbnail: string;
  savedAt: number;
}

const STORAGE_KEY = "bilulu.saved-configs";
const CHANGE_EVENT = "bilulu:saved-configs-changed";
const MAX_ENTRIES = 30;

function read(): SavedConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Guard against stray keys / older shapes: keep only well-formed entries.
    return parsed.filter(
      (e): e is SavedConfig =>
        e &&
        typeof e.id === "string" &&
        typeof e.konfigurator === "string" &&
        typeof e.name === "string" &&
        typeof e.href === "string" &&
        typeof e.thumbnail === "string" &&
        typeof e.savedAt === "number",
    );
  } catch {
    return [];
  }
}

function write(entries: SavedConfig[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Quota exhausted or storage denied — silently fail; a re-save will retry.
  }
}

function makeId(): string {
  const cryptoRef = typeof crypto !== "undefined" ? crypto : undefined;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useSavedConfigs(konfigurator: KonfiguratorId): {
  entries: SavedConfig[];
  save: (input: Omit<SavedConfig, "id" | "savedAt" | "konfigurator">) => SavedConfig;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  isHydrated: boolean;
} {
  const [entries, setEntries] = React.useState<SavedConfig[]>([]);
  const [isHydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setEntries(read());
    setHydrated(true);
    const handler = () => setEntries(read());
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const save = React.useCallback<
    (input: Omit<SavedConfig, "id" | "savedAt" | "konfigurator">) => SavedConfig
  >(
    (input) => {
      const entry: SavedConfig = {
        id: makeId(),
        konfigurator,
        savedAt: Date.now(),
        ...input,
      };
      const current = read();
      // Newest first; drop the oldest if we're over the cap.
      const next = [entry, ...current].slice(0, MAX_ENTRIES);
      write(next);
      setEntries(next);
      return entry;
    },
    [konfigurator],
  );

  const rename = React.useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current = read();
    const next = current.map((e) => (e.id === id ? { ...e, name: trimmed } : e));
    write(next);
    setEntries(next);
  }, []);

  const remove = React.useCallback((id: string) => {
    const current = read();
    const next = current.filter((e) => e.id !== id);
    write(next);
    setEntries(next);
  }, []);

  const filtered = React.useMemo(
    () => entries.filter((e) => e.konfigurator === konfigurator),
    [entries, konfigurator],
  );

  return { entries: filtered, save, rename, remove, isHydrated };
}
