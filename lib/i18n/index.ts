/**
 * i18n foundation for ArkAgent.
 *
 * Localization uses a client-side dictionary approach (see the Next.js
 * "Internationalization → Localization" guide): each screen owns a small
 * `Record<Lang, …>` dictionary in its own module under `lib/i18n/`, and reads
 * the active language from the app store (`useApp().lang`). The language is
 * detected from the browser on first load, can be switched from the UI, and is
 * persisted to `localStorage` (and to the user profile when signed in).
 *
 * Copy is written natively per language — idiomatic Japanese / 中文, not a
 * word-for-word translation of the English source.
 */
import type { Lang } from "@/lib/types";

export type { Lang } from "@/lib/types";

/** localStorage key for the persisted language choice. */
export const LANG_STORAGE_KEY = "ark-lang";

/** Supported UI languages, in the order they appear in switchers. */
export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "zh", label: "简体中文", short: "简" },
  { code: "zht", label: "繁體中文", short: "繁" },
  { code: "ja", label: "日本語", short: "日" },
];

const LANG_CODES = LANGS.map((l) => l.code);

/** Narrow an arbitrary string to a supported `Lang`. */
export function isLang(x: string): x is Lang {
  return (LANG_CODES as string[]).includes(x);
}

/**
 * Browser-locale → default language:
 *  - `ja*`                         → Japanese
 *  - `zh-TW/HK/MO` or `*-Hant`     → Traditional Chinese
 *  - other `zh*`                   → Simplified Chinese
 *  - everything else               → English
 */
export function detectLang(navigatorLanguage: string | undefined): Lang {
  const nl = (navigatorLanguage || "en").toLowerCase();
  if (nl.startsWith("ja")) return "ja";
  if (nl.startsWith("zh")) {
    const trad =
      nl.includes("tw") || nl.includes("hk") || nl.includes("mo") || nl.includes("hant");
    return trad ? "zht" : "zh";
  }
  return "en";
}
