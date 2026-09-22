/**
 * The app's public origin, and absolute URLs built on it.
 *
 * Lives here rather than under lib/payments because OAuth needs it too: a
 * redirect_uri must match the one registered with the provider byte for byte,
 * and deriving it from the inbound request would let a spoofed Host header
 * point the callback somewhere else.
 */

/**
 * Public origin used to build return/cancel/notify and OAuth redirect URLs.
 *
 * This MUST be right in production: it is where Stripe sends the payer back,
 * where the Alipay gateway posts its notify, and what the provider compares the
 * redirect_uri against. A silent localhost default would mean paying customers
 * land on a dead port and CN payments are never credited, so production without
 * it configured is a hard failure, not a warning.
 */
export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NEXT_PUBLIC_APP_URL must be set in production — payment return and notify URLs are built from it",
      );
    }
    return "http://localhost:3000";
  }
  return configured.replace(/\/+$/, "");
}

/** Absolute URL for a path on this app, e.g. `absoluteUrl("/payment/return")`. */
export function absoluteUrl(path: string): string {
  return `${appUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Reduce an untrusted `next` value to a safe same-origin path.
 *
 * Returns `fallback` for anything that is not a single-slash-rooted path, which
 * rejects absolute URLs (`https://evil.test`), scheme-relative ones
 * (`//evil.test` — a valid URL that `startsWith("/")` alone would wave through)
 * and backslash variants that some parsers fold to a slash.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  // C0 controls FIRST. The URL parser strips TAB/LF/CR *before* parsing, so
  // "/\t/evil.test" survives every shape check below and then resolves to
  // "//evil.test" — scheme-relative, and off-origin — at the redirect site.
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.includes("\\")) return fallback;
  // Resolve with the same parser the consumer uses. Pattern-matching alone lets
  // the sanitizer and the redirect disagree about what a string means; asking
  // the parser makes divergence impossible.
  try {
    const base = appUrl();
    const resolved = new URL(next, base);
    if (resolved.origin !== new URL(base).origin) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    // appUrl() throws in production when NEXT_PUBLIC_APP_URL is unset.
    return fallback;
  }
}
