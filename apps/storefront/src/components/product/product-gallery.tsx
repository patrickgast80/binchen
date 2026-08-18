"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export interface GalleryImage {
  id?: string;
  url: string;
}

interface ProductGalleryProps {
  images: GalleryImage[];
  title: string;
  /** Overlay rendered inside the hero frame, e.g. the sold-out badge. */
  overlay?: React.ReactNode;
}

/**
 * BIL-2494: the PDP used to render exactly one image, so the mannequin shots of
 * the sets were invisible. Order comes from the API and is deliberate
 * (images[0] = flat-lay title shot, BIL-2485) — never re-sort client side.
 *
 * Every image stays mounted and is cross-faded via opacity, so switching is
 * instant (Doherty) instead of showing an empty frame while next/image fetches.
 * Only the first one is `priority`; the rest stay lazy so the LCP image keeps
 * the high-priority slot.
 */
export function ProductGallery({ images, title, overlay }: ProductGalleryProps) {
  const [active, setActive] = React.useState(0);
  const thumbRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const hasGallery = images.length > 1;

  function handleThumbKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (index + delta + images.length) % images.length;
    setActive(next);
    thumbRefs.current[next]?.focus();
  }

  return (
    // Thumbnails sit under the hero on mobile and in a vertical rail next to it
    // from lg up — at 1440x900 a strip below the square hero lands under the
    // fold, so the extra views would go unnoticed.
    // lg:items-start is load-bearing: as a stretched flex child the hero grows
    // to the height of the text column and aspect-square loses, which
    // letterboxes the 1200x1200 photo with grey bars.
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      {/* BIL-2483: Studio-Grey hero, photo edge to edge — the passepartout lives in the
          1200x1200 canvas, extra CSS padding rendered a second frame around it. */}
      <div
        className={cn(
          "relative order-1 aspect-square overflow-hidden rounded-2xl lg:order-2 lg:min-w-0 lg:flex-1",
          images.length > 0
            ? "bg-binchen-studio"
            : "bg-gradient-to-br from-binchen-cream to-binchen-cream-dark",
        )}
      >
        {images.length > 0 ? (
          images.map((image, index) => (
            <Image
              key={image.id ?? image.url}
              src={image.url}
              alt={index === 0 ? title : `${title} — Ansicht ${index + 1}`}
              fill
              priority={index === 0}
              loading={index === 0 ? undefined : "lazy"}
              sizes="(max-width: 1024px) 100vw, 50vw"
              aria-hidden={index !== active}
              className={cn(
                "object-contain transition-opacity duration-200 motion-reduce:transition-none",
                index === active ? "opacity-100" : "opacity-0",
              )}
            />
          ))
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="font-body text-sm text-binchen-ink-subtle">Kein Bild</span>
          </div>
        )}
        {overlay}
      </div>

      {hasGallery && (
        <>
          <ul
            className="order-2 flex flex-wrap gap-3 lg:order-1 lg:flex-col lg:flex-nowrap"
            aria-label={`Weitere Ansichten von ${title}`}
          >
            {images.map((image, index) => (
              <li key={image.id ?? image.url}>
                <button
                  type="button"
                  ref={(node) => {
                    thumbRefs.current[index] = node;
                  }}
                  onClick={() => setActive(index)}
                  onKeyDown={(event) => handleThumbKeyDown(event, index)}
                  aria-current={index === active ? "true" : undefined}
                  aria-label={`Bild ${index + 1} von ${images.length} anzeigen`}
                  className={cn(
                    "relative block h-16 w-16 overflow-hidden rounded-lg bg-binchen-studio transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-binchen-sage focus-visible:ring-offset-2",
                    "sm:h-20 sm:w-20",
                    index === active
                      ? "ring-2 ring-binchen-sage-btn ring-offset-2"
                      : "border border-binchen-border hover:border-binchen-sage",
                  )}
                >
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    loading="lazy"
                    sizes="80px"
                    className="object-contain"
                  />
                </button>
              </li>
            ))}
          </ul>
          <p aria-live="polite" className="sr-only">
            Bild {active + 1} von {images.length}
          </p>
        </>
      )}
    </div>
  );
}
