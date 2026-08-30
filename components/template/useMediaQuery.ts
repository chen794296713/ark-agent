"use client";

/**
 * `matchMedia` as React state.
 *
 * The gallery has two decisions CSS custom properties cannot make for it: the
 * list view is not offered below 640px (a nine-column table has no honest
 * layout there), and the drawer's sections default closed on a phone. Both are
 * *behaviour*, not styling, so an `--r-*` token cannot carry them.
 *
 * `useSyncExternalStore` rather than `useState` + an effect: a MediaQueryList is
 * exactly the "external system" that API exists for, and seeding state from it
 * in an effect is the cascading-render pattern React now lints against. The
 * server snapshot is `false`, so SSR and the first client paint agree and the
 * real value arrives in the same commit as hydration.
 */
import { useCallback, useSyncExternalStore } from "react";

/** The ≤640px breakpoint `app/globals.css` uses for its mobile token block. */
export const MOBILE_QUERY = "(max-width: 640px)";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(query).matches
      : false),
    () => false,
  );
}
