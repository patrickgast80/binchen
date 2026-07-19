"use client";

import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CatalogFiltersProps {
  size: string;
  fabric: string;
  ageCategory: string;
  ageMin: string;
  ageMax: string;
}

const AGE_CATEGORIES = [
  { value: "", label: "Alle Altersgruppen" },
  { value: "newborn", label: "Neugeboren (0–3 M)" },
  { value: "infant", label: "Säugling (3–12 M)" },
  { value: "toddler", label: "Kleinkind (1–3 J)" },
];

const FRUEHCHEN_SIZES = ["32", "38", "44", "50"];

export function CatalogFilters({ size, fabric, ageCategory, ageMin, ageMax }: CatalogFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();

  const hasFilters = size || fabric || ageCategory || ageMin || ageMax;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    const vals: Record<string, string> = {
      size: data.get("size") as string,
      fabric: data.get("fabric") as string,
      age_category: data.get("age_category") as string,
      age_min: data.get("age_min") as string,
      age_max: data.get("age_max") as string,
    };
    for (const [key, val] of Object.entries(vals)) {
      if (val) params.set(key, val);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="mb-8 space-y-6 lg:mb-0">
      <h2 className="font-display text-base font-semibold text-binchen-ink">Filter</h2>

      <div className="space-y-2">
        <label htmlFor="size" className="font-body text-sm font-medium text-binchen-ink">
          Größe
        </label>
        <Input id="size" name="size" type="text" placeholder="z.B. 56" defaultValue={size} />
        <div className="pt-1">
          <p className="font-body text-xs font-medium uppercase tracking-widest text-binchen-terracotta-text">
            Frühchengrößen
          </p>
          <div
            role="group"
            aria-label="Frühchengrößen als Schnellfilter"
            className="mt-2 flex flex-wrap gap-2"
          >
            {FRUEHCHEN_SIZES.map((s) => {
              const isActive = size === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set("size", s);
                    router.push(`${pathname}?${params.toString()}`);
                  }}
                  className={`inline-flex min-h-11 min-w-14 items-center justify-center rounded-full border px-3 py-1 font-body text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage focus-visible:ring-offset-2 ${
                    isActive
                      ? "border-binchen-terracotta bg-binchen-terracotta/10 text-binchen-terracotta-text"
                      : "border-binchen-border bg-binchen-cream text-binchen-ink hover:border-binchen-terracotta hover:text-binchen-terracotta-text"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="fabric" className="font-body text-sm font-medium text-binchen-ink">
          Material
        </label>
        <Input
          id="fabric"
          name="fabric"
          type="text"
          placeholder="z.B. Bio-Baumwolle"
          defaultValue={fabric}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="age_category" className="font-body text-sm font-medium text-binchen-ink">
          Altersgruppe
        </label>
        <select
          id="age_category"
          name="age_category"
          defaultValue={ageCategory}
          className="flex h-11 w-full rounded-md border border-binchen-border bg-binchen-cream px-3 py-2 text-sm font-body text-binchen-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage focus-visible:ring-offset-2"
        >
          {AGE_CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <span className="font-body text-sm font-medium text-binchen-ink">Alter in Monaten</span>
        <div className="flex items-center gap-2">
          <Input
            id="age_min"
            name="age_min"
            type="number"
            min={0}
            placeholder="Von"
            defaultValue={ageMin}
            className="w-full"
          />
          <span className="font-body text-sm text-binchen-ink-muted">–</span>
          <Input
            id="age_max"
            name="age_max"
            type="number"
            min={0}
            placeholder="Bis"
            defaultValue={ageMax}
            className="w-full"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="default" className="w-full">
          Filtern
        </Button>
        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => router.push(pathname)}
          >
            Filter zurücksetzen
          </Button>
        )}
      </div>
    </form>
  );
}
