/**
 * The konfigurator URL *is* the configuration — it is what the share button
 * copies, what "Merken" stores, and what the cart action gets handed back as
 * `configHref`. So exactly one param in it is not part of the configuration:
 * `?error=`, which BIL-2510 bounces back with when adding to the cart failed.
 *
 * It must not travel. A shared link carrying `?error=` would open with an error
 * banner for someone whose click never failed, and a saved config would keep
 * showing one forever. Everything that *reuses* the current URL goes through
 * here; only the address bar keeps the param, until the next colour change
 * rewrites it — which is also what dismisses the banner.
 */
export const ERROR_PARAM = "error";

/** Current params minus `?error=`, safe to mutate. */
export function configParams(searchParams: URLSearchParams | null): URLSearchParams {
  const next = new URLSearchParams(searchParams?.toString() ?? "");
  next.delete(ERROR_PARAM);
  return next;
}

/**
 * Absolute URL minus `?error=`, for the share button. Takes the raw
 * `window.location.href` rather than pathname+searchParams so the share
 * callback keeps its empty dependency list.
 */
export function shareableUrl(href: string): string {
  try {
    const url = new URL(href);
    url.searchParams.delete(ERROR_PARAM);
    return url.toString();
  } catch {
    return href;
  }
}

/** The current configuration as a shareable relative URL. */
export function buildConfigHref(
  pathname: string | null,
  searchParams: URLSearchParams | null,
  fallbackPath: string,
): string {
  const base = pathname ?? fallbackPath;
  const query = configParams(searchParams).toString();
  return query ? `${base}?${query}` : base;
}
