"use client";

/**
 * Theme switch across the three palettes defined in app/globals.css. Reads and
 * sets the theme on the AppProvider, which persists it to localStorage, sets
 * <html data-theme> and updates the browser-chrome color.
 *
 * Two presentations:
 *  - compact (default): a 34x30 icon trigger opening the shared popover menu,
 *    matching the direction picker beside it in the 56px app bar.
 *  - full: a three-segment radiogroup for the mobile drawer, where there is
 *    room to show every option without a second tap.
 *
 * Kept as a menu rather than a cycle button so it stays symmetrical with the
 * direction picker next to it, and so each option can be named outright.
 */
import { useRef, type ReactNode } from "react";
import { c, font } from "@/lib/theme";
import { useApp, THEMES, type Theme } from "@/lib/store";
import { common, type CommonDict } from "@/lib/i18n/common";
import { Btn } from "@/components/ui";
import { MenuPopover } from "@/components/MenuPopover";

/** Shared line-icon frame — same optical weight as the globe next door. */
function Glyph({ size, children }: { size: number; children: ReactNode }) {
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
      {children}
    </svg>
  );
}

/** Crescent = dark, sun = light. */
function ThemeIcon({ theme, size = 16 }: { theme: Theme; size?: number }) {
  if (theme === "dark") {
    return (
      <Glyph size={size}>
        <path d="M20.5 14.3A8.8 8.8 0 0 1 9.7 3.5a8.8 8.8 0 1 0 10.8 10.8Z" />
      </Glyph>
    );
  }
  return (
    <Glyph size={size}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </Glyph>
  );
}

export function ThemeToggle({
  compact = true,
  drop,
  style,
}: {
  compact?: boolean;
  /** Which way the menu opens. Defaults to whichever side has room. */
  drop?: "up" | "down";
  style?: React.CSSProperties;
}) {
  const { lang, theme, setTheme } = useApp();
  const t = common[lang];
  const labels: Record<Theme, string> = {
    dark: t.themeDark,
    light: t.themeLight,
  };

  if (!compact) {
    return <Segments theme={theme} setTheme={setTheme} labels={labels} t={t} style={style} />;
  }

  return (
    <MenuPopover
      label={t.theme}
      icon={<ThemeIcon theme={theme} size={16} />}
      valueLabel={labels[theme]}
      compact
      drop={drop}
      style={style}
      options={THEMES.map((name) => ({
        key: name,
        selected: name === theme,
        onSelect: () => setTheme(name),
        lead: <ThemeIcon theme={name} size={15} />,
        label: labels[name],
        title: t.switchTheme(labels[name]),
      }))}
    />
  );
}

/**
 * The drawer presentation: all three options visible at once. Icon over label
 * rather than beside it — at three columns of a ~320px drawer a horizontal row
 * cannot hold ウォームモード, and truncating a theme name is worse than stacking.
 */
function Segments({
  theme,
  setTheme,
  labels,
  t,
  style,
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
  labels: Record<Theme, string>;
  t: CommonDict;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Btn declares no `ref` prop, so the group moves focus by querying its own
  // rendered radios. Focus must follow selection or it is stranded on a
  // segment that is no longer the group's single tab stop.
  const focusAt = (i: number) =>
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[i]?.focus();

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const last = THEMES.length - 1;
    let next: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return; // Enter/Space already fire click on a native <button>.
    e.preventDefault();
    setTheme(THEMES[next]); // arrows select as well as move — standard for radios
    focusAt(next);
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={t.theme}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        border: `1px solid ${c.border}`,
        ...style,
      }}
    >
      {THEMES.map((name, i) => {
        const on = name === theme;
        return (
          <Btn
            key={name}
            role="radio"
            aria-checked={on}
            // Roving tabindex: the group is one tab stop, arrows move inside it.
            tabIndex={on ? 0 : -1}
            title={t.switchTheme(labels[name])}
            onClick={() => setTheme(name)}
            onKeyDown={(e) => onKey(e, i)}
            hoverStyle={{ background: on ? c.limeWash : c.hover }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              background: on ? c.limeWash : "transparent",
              color: on ? c.text : c.text2,
              border: "none",
              // Hairlines between segments only, so the group reads as one box.
              borderRight: i < THEMES.length - 1 ? `1px solid ${c.border}` : undefined,
              padding: "11px 8px",
              fontFamily: font.sans,
              fontSize: 12,
              lineHeight: 1.25,
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            <span style={{ color: on ? c.accent : c.muted }}>
              <ThemeIcon theme={name} size={17} />
            </span>
            {labels[name]}
          </Btn>
        );
      })}
    </div>
  );
}
