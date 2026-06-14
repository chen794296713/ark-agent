"use client";

/**
 * Language switch. Reads + sets the active language on the AppProvider, which
 * persists the choice to localStorage and (when signed in) to the user profile.
 * Two presentations:
 *  - compact (default): a tight segmented control of short labels (EN 简 繁 日)
 *    for nav bars and dense toolbars.
 *  - full: a stretched segmented control of native names for the mobile drawer.
 */
import { c, font } from "@/lib/theme";
import { useApp } from "@/lib/store";
import { LANGS } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";

export function LanguageSwitcher({
  compact = true,
  style,
}: {
  compact?: boolean;
  style?: React.CSSProperties;
}) {
  const { lang, setLang } = useApp();
  const t = common[lang];

  return (
    <div
      role="group"
      aria-label={t.language}
      style={{
        display: "flex",
        border: `1px solid ${c.border}`,
        fontFamily: font.mono,
        fontSize: compact ? 12 : 14,
        ...style,
      }}
    >
      {LANGS.map((l) => {
        const on = lang === l.code;
        return (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            aria-pressed={on}
            title={l.label}
            style={{
              border: "none",
              cursor: "pointer",
              flex: compact ? "0 0 auto" : 1,
              padding: compact ? "6px 9px" : "11px 14px",
              background: on ? c.lime : "transparent",
              color: on ? c.ink : c.muted,
            }}
          >
            {compact ? l.short : l.label}
          </button>
        );
      })}
    </div>
  );
}
