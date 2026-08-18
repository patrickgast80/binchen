import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The one way this shop tells a customer that something went wrong — BIL-2510.
 *
 * Extracted from /checkout/payment (BIL-2502), which was the first surface to
 * render a `?error=` code, so the konfigurators and the checkout say "das ist
 * schiefgelaufen" in exactly the same shape. Terracotta rather than a signal
 * red: this is a "bitte nochmal" for a handmade shop, not a system alarm, and
 * terracotta-text is the palette's AA-safe ink on cream (8.5:1).
 *
 * Server component on purpose — an error banner must not cost client JS on the
 * 99% of visits that never see it. `role="alert"` is enough: a server-action
 * redirect is a client-side navigation, so the node is *inserted* into the live
 * DOM and screen readers announce it.
 */
export function ErrorBanner({
  title,
  body,
  children,
  className,
  testId,
}: {
  title: string;
  body: ReactNode;
  /** Optional actions rendered under the copy (e.g. a way out). */
  children?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className={cn(
        "flex gap-3 rounded-lg border border-binchen-terracotta bg-binchen-terracotta/10 p-4 sm:gap-4 sm:p-6",
        className,
      )}
    >
      {/* The konfigurators already use a terracotta/40 box for the friendly
          Frühchen note, so an error in the same box would read as one more
          hint. Full-strength border plus the icon is what separates
          "achtung" from "übrigens" at a glance. */}
      <AlertTriangle
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 text-binchen-terracotta-text"
      />
      <div>
        <p className="font-body text-base font-semibold text-binchen-terracotta-text">{title}</p>
        <p className="mt-2 font-body text-sm leading-relaxed text-binchen-ink">{body}</p>
        {children}
      </div>
    </div>
  );
}
