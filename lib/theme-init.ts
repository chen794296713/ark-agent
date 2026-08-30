/**
 * Theme constants shared by the server and the client.
 *
 * Deliberately NOT a `"use client"` module. lib/store.tsx is one, and when a
 * Server Component imports from a client module it receives client *references*
 * rather than values — so `THEME_COLOR[…]` read from there in app/layout.tsx
 * silently evaluates to `undefined` and ships no theme-color at all. Keeping
 * these values in a plain module lets the root layout, the pre-paint boot
 * script and the store all read the same source instead of repeating literals
 * that must be kept in step by hand.
 */

/**
 * The brand look. Straight from the Claude Design source (ArkAgent.dc.html),
 * which models the palette as direction × mode rather than one flat list:
 * a direction carries the signal colour AND the display face (Ivory speaks in
 * a serif), while the mode only decides light or dark.
 */
export const DIRECTIONS = ["terminal", "ivory", "midnight"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** The mode. `warm` was retired when Ivory Studio took over the cream look. */
export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_DIRECTION: Direction = "terminal";

/**
 * The theme rendered on the server. `<html data-direction data-theme>` in
 * app/layout.tsx and the initial `useState` in lib/store both start here;
 * ThemeBoot corrects them from localStorage before the first paint.
 */
export const DEFAULT_THEME: Theme = "dark";

/**
 * Browser-chrome colour per direction+mode (iOS status bar, Android address
 * bar), mirrored onto `<meta name="theme-color">`. Next's static
 * `viewport.themeColor` can only key off `prefers-color-scheme`, which cannot
 * express a manually chosen look, so the tag is also rewritten imperatively on
 * every switch. Values are each palette's own --c-bg.
 */
export const THEME_COLOR: Record<Direction, Record<Theme, string>> = {
  terminal: { dark: "#0A0D12", light: "#F3F5F8" },
  ivory: { dark: "#1A1714", light: "#F4EFE6" },
  midnight: { dark: "#0A0F1E", light: "#EEF2FA" },
};

export const THEME_STORAGE_KEY = "ark-theme";
export const DIRECTION_STORAGE_KEY = "ark-direction";

export function isTheme(x: string): x is Theme {
  return (THEMES as readonly string[]).includes(x);
}

export function isDirection(x: string): x is Direction {
  return (DIRECTIONS as readonly string[]).includes(x);
}
