"use client";

/**
 * Applies the saved theme before first paint.
 *
 * Emitted as the first thing in <body>, so <html data-direction data-theme> is
 * corrected while the browser is still parsing — an Ivory or Midnight visitor
 * never sees a frame of the Terminal-dark SSR markup. Both attributes are set
 * together because a palette block in globals.css only matches on the PAIR;
 * writing one without the other selects nothing and every token falls back to
 * the terminal-dark :root values. It also rewrites <meta name="theme-color">, which Next's
 * static `viewport.themeColor` cannot do: ThemeColorDescriptor only keys off
 * prefers-color-scheme, and no media query can express a manually chosen theme.
 *
 * Its constants come from lib/theme-init, a plain (non-"use client") module, so
 * the root layout can read the very same values for `<html data-theme>` and
 * `viewport.themeColor` instead of repeating them as literals. Importing them
 * from lib/store instead would break silently: a Server Component importing
 * from a "use client" module receives client references rather than values, and
 * this script would inline `undefined`.
 *
 * This component still renders during SSR, so the script is present in the
 * initial HTML; React does not re-run inline scripts when hydrating them.
 */
import {
  DEFAULT_DIRECTION,
  DEFAULT_THEME,
  DIRECTIONS,
  DIRECTION_STORAGE_KEY,
  THEMES,
  THEME_COLOR,
  THEME_STORAGE_KEY,
} from "@/lib/theme-init";

// The allowlist is explicit on purpose: a stale or hand-edited value passed
// through as data-theme="whatever" would match no block in globals.css and
// resolve every token to the dark :root fallback — a broken theme that looks
// like a working one.
const BOOT = `(function(){try{var a=${JSON.stringify(THEMES)},d=${JSON.stringify(DIRECTIONS)},m=${JSON.stringify(THEME_COLOR)};var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(a.indexOf(t)<0)t=${JSON.stringify(DEFAULT_THEME)};var r=localStorage.getItem(${JSON.stringify(DIRECTION_STORAGE_KEY)});if(d.indexOf(r)<0)r=${JSON.stringify(DEFAULT_DIRECTION)};var h=document.documentElement;h.setAttribute("data-theme",t);h.setAttribute("data-direction",r);var e=document.querySelector('meta[name="theme-color"]');if(e)e.setAttribute("content",m[r][t]);}catch(e){}})();`;

export function ThemeBoot() {
  return <script dangerouslySetInnerHTML={{ __html: BOOT }} />;
}
