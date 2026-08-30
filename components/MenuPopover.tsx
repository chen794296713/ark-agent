"use client";

/**
 * The popover menu behind the language and theme switchers.
 *
 * The two controls sit next to each other in every nav on the site, so any
 * behavioural difference between them reads as a bug. Sharing the shell also
 * means the keyboard contract — roving arrow focus, Home/End, Escape returning
 * focus to the trigger — is written once rather than re-derived (and forgotten)
 * per control.
 *
 * The caller owns what goes IN the trigger and in each row; this owns the open
 * state, the outside-click/Escape wiring, the drop direction and the ARIA roles.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { c, font } from "@/lib/theme";
import { Btn } from "@/components/ui";

export interface MenuOption {
  /** Stable identity for the row (the lang code, the theme name). */
  key: string;
  selected: boolean;
  onSelect: () => void;
  /** Fixed-width leading slot — the language's short code, the theme's icon. */
  lead: ReactNode;
  label: ReactNode;
  /** Hover tooltip. The visible label still supplies the accessible name. */
  title?: string;
}

export function MenuPopover({
  label,
  icon,
  valueLabel,
  options,
  compact = true,
  drop,
  style,
}: {
  /** Accessible name for both the trigger and the menu. */
  label: string;
  /** Trigger glyph — the one thing that identifies the control at 34px. */
  icon: ReactNode;
  /** Current value, shown beside the icon in the full (drawer) presentation. */
  valueLabel?: ReactNode;
  options: MenuOption[];
  compact?: boolean;
  /** Which way the menu opens. Defaults: compact → down, full → up. */
  drop?: "up" | "down";
  style?: React.CSSProperties;
}) {
  // Preferred side: a nav trigger drops down, a drawer/footer row opens up.
  // `placement` holds what actually fit when the menu was last opened.
  const preferred = compact ? "down" : "up";
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.selected),
  );

  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"up" | "down">(preferred);
  const dir = drop ?? placement;
  // Roving tabindex tracks the FOCUSED row, not the selected one, so the menu
  // is always a single tab stop wherever the arrow keys have left the cursor.
  const [active, setActive] = useState(selectedIndex);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Btn takes plain button attributes and declares no `ref` prop, so focus is
  // moved by querying the rendered nodes instead of by holding refs to them.
  const focusTrigger = () =>
    wrapRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
  const focusItem = (i: number) =>
    menuRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')
      [i]?.focus();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      // A click elsewhere is a dismissal, not a cancellation: leave focus where
      // the pointer put it instead of yanking it back to the trigger.
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        focusTrigger();
      } else if (e.key === "Tab") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Pull focus into the menu on open and follow the arrow keys after that, so a
  // keyboard user is never left on the trigger with no visible cursor.
  useEffect(() => {
    if (!open) return;
    focusItem(active);
  }, [open, active]);

  const onItemKey = (e: React.KeyboardEvent, i: number) => {
    const last = options.length - 1;
    let next: number;
    if (e.key === "ArrowDown") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowUp") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return; // Enter/Space already fire click on a native <button>.
    e.preventDefault();
    setActive(next);
  };

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      style={{
        position: "absolute",
        right: 0,
        ...(compact ? { minWidth: 168 } : { left: 0 }),
        ...(dir === "down" ? { top: "calc(100% + 6px)" } : { bottom: "calc(100% + 6px)" }),
        background: c.panel,
        border: `1px solid ${c.borderStrong}`,
        boxShadow: `0 10px 30px ${c.shadow}`,
        padding: 4,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {options.map((o, i) => (
        <Btn
          key={o.key}
          // Exclusive single-choice set, so menuitemradio + aria-checked rather
          // than menuitem + aria-current: it tells a screen reader that picking
          // one un-picks the rest.
          role="menuitemradio"
          aria-checked={o.selected}
          tabIndex={i === active ? 0 : -1}
          title={o.title}
          onKeyDown={(e) => onItemKey(e, i)}
          onFocus={() => setActive(i)}
          onClick={() => {
            o.onSelect();
            setOpen(false);
            focusTrigger();
          }}
          hoverStyle={{ background: o.selected ? c.limeWash : c.hover }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            textAlign: "left",
            border: "none",
            cursor: "pointer",
            padding: "9px 12px",
            background: o.selected ? c.limeWash : "transparent",
            color: o.selected ? c.text : c.text2,
            fontFamily: font.sans,
            fontSize: 14,
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 22,
              fontFamily: font.mono,
              fontSize: 11,
              color: o.selected ? c.accent : c.muted,
            }}
          >
            {o.lead}
          </span>
          <span style={{ flex: 1 }}>{o.label}</span>
          {o.selected && <span style={{ color: c.accent, fontSize: 12 }}>✓</span>}
        </Btn>
      ))}
    </div>
  ) : null;

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", display: compact ? "inline-flex" : "flex", ...style }}
    >
      <Btn
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          // The same compact trigger appears in a top nav and at the bottom of
          // a 100vh sidebar, so the preferred side is a default, not a promise.
          // Measured before the menu mounts — hence the row-height estimate —
          // so it opens on the right side rather than jumping after one frame.
          const rect = wrapRef.current?.getBoundingClientRect();
          if (rect && !drop) {
            const est = options.length * 40 + 16;
            const room = (d: "up" | "down") =>
              d === "down" ? window.innerHeight - rect.bottom : rect.top;
            const other = preferred === "down" ? "up" : "down";
            setPlacement(
              room(preferred) >= est || room(preferred) >= room(other) ? preferred : other,
            );
          }
          setActive(selectedIndex);
          setOpen(true);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
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
        {icon}
        {!compact && (
          <>
            <span style={{ flex: 1, textAlign: "left" }}>{valueLabel}</span>
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
