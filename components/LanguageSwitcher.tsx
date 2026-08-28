"use client";

/**
 * Language switch. A single globe icon (the universal "choose language" affordance)
 * that opens a small popover listing every supported language by its native name.
 * Picking one sets it on the AppProvider, which persists the choice to localStorage
 * and (when signed in) to the user profile.
 *
 * Two presentations:
 *  - compact (default): an icon-only square button for nav bars; the menu drops down.
 *  - full: an icon + current-language row for the mobile drawer / dashboard footer;
 *    the menu opens upward since those live near the bottom of the screen.
 */
import { useEffect, useRef, useState } from "react";
import { c, font } from "@/lib/theme";
import { useApp } from "@/lib/store";
import { LANGS } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { Btn } from "@/components/ui";

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
  /** Which way the menu opens. Defaults: compact → down, full → up. */
  drop?: "up" | "down";
  style?: React.CSSProperties;
}) {
  const { lang, setLang } = useApp();
  const t = common[lang];
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  const dir = drop ?? (compact ? "down" : "up");

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape while the menu is open.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const menu = open ? (
    <div
      role="menu"
      aria-label={t.language}
      style={{
        position: "absolute",
        right: 0,
        ...(compact ? { minWidth: 168 } : { left: 0 }),
        ...(dir === "down" ? { top: "calc(100% + 6px)" } : { bottom: "calc(100% + 6px)" }),
        background: c.panel,
        border: `1px solid ${c.borderStrong}`,
        boxShadow: "0 10px 30px rgba(0,0,0,.45)",
        padding: 4,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {LANGS.map((l) => {
        const on = l.code === lang;
        return (
          <Btn
            key={l.code}
            role="menuitem"
            aria-current={on}
            onClick={() => {
              setLang(l.code);
              setOpen(false);
            }}
            hoverStyle={{ background: on ? c.limeWash : c.hover }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              textAlign: "left",
              border: "none",
              cursor: "pointer",
              padding: "9px 12px",
              background: on ? c.limeWash : "transparent",
              color: on ? c.text : c.text2,
              fontFamily: font.sans,
              fontSize: 14,
            }}
          >
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                width: 22,
                color: on ? c.accent : c.faint,
              }}
            >
              {l.short}
            </span>
            <span style={{ flex: 1 }}>{l.label}</span>
            {on && <span style={{ color: c.accent, fontSize: 12 }}>✓</span>}
          </Btn>
        );
      })}
    </div>
  ) : null;

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", display: compact ? "inline-flex" : "flex", ...style }}
    >
      <Btn
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.language}
        title={t.language}
        hoverStyle={{ borderColor: c.borderMute, color: c.text }}
        style={
          compact
            ? {
                width: 34,
                height: 30,
                display: "grid",
                placeItems: "center",
                background: "transparent",
                border: `1px solid ${c.border}`,
                color: c.text2,
                cursor: "pointer",
              }
            : {
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                background: "transparent",
                border: `1px solid ${c.border}`,
                color: c.text,
                padding: "13px 14px",
                fontFamily: font.sans,
                fontSize: 15,
                cursor: "pointer",
              }
        }
      >
        <GlobeIcon size={compact ? 16 : 17} />
        {!compact && (
          <>
            <span style={{ flex: 1, textAlign: "left" }}>{current.label}</span>
            <span style={{ fontFamily: font.mono, fontSize: 12, color: c.muted }}>
              {dir === "down" ? "▾" : "▴"}
            </span>
          </>
        )}
      </Btn>
      {menu}
    </div>
  );
}