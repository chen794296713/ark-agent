"use client";

/**
 * Language switch. A single globe icon (the universal "choose language"
 * affordance) that opens a small popover listing every supported language by
 * its native name. Picking one sets it on the AppProvider, which persists the
 * choice to localStorage and (when signed in) to the user profile.
 *
 * Two presentations:
 *  - compact (default): an icon-only square button for nav bars.
 *  - full: an icon + current-language row for the mobile drawer / dashboard
 *    footer, where the menu opens upward.
 *
 * The popover itself — open state, outside-click, keyboard, focus return and
 * drop direction — lives in MenuPopover, shared with ThemeToggle so the two
 * controls that sit side by side in every nav behave identically.
 */
import { useApp } from "@/lib/store";
import { LANGS } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { MenuPopover } from "@/components/MenuPopover";

/** Line-style globe that inherits the button's text color via currentColor. */
function GlobeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.6 2.7 3.9 5.8 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.8-3.9-9S9.4 5.7 12 3Z" />
    </svg>
  );
}

export function LanguageSwitcher({
  compact = true,
  drop,
  style,
}: {
  compact?: boolean;
  /** Which way the menu opens. Defaults to whichever side has room. */
  drop?: "up" | "down";
  style?: React.CSSProperties;
}) {
  const { lang, setLang } = useApp();
  const t = common[lang];
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  return (
    <MenuPopover
      label={t.language}
      icon={<GlobeIcon size={compact ? 16 : 17} />}
      valueLabel={current.label}
      compact={compact}
      drop={drop}
      style={style}
      options={LANGS.map((l) => ({
        key: l.code,
        selected: l.code === lang,
        onSelect: () => setLang(l.code),
        lead: l.short,
        label: l.label,
      }))}
    />
  );
}