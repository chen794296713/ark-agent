"use client";

/**
 * The `⋯` action menu on a list row.
 *
 * Not `components/MenuPopover`: that control's rows are `menuitemradio` with a
 * `selected` flag, which is the right shape for the language and theme pickers
 * it was written for and the wrong one here — these four entries are commands,
 * not a value being chosen, and announcing "Duplicate, radio button, not
 * selected" is a lie about what pressing it does. The keyboard contract is the
 * same one: arrows roam, Escape closes and returns focus to the trigger.
 */
import { useEffect, useRef, useState } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";

export interface RowAction {
  key: string;
  label: string;
  onSelect: () => void;
  /** Draws the entry in the caution tint — used for a cross-tenant import. */
  danger?: boolean;
}

export function RowMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const focusTrigger = () =>
    wrapRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
  const focusItem = (i: number) =>
    wrapRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[i]?.focus();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        focusTrigger();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) focusItem(active);
    // Focus follows `active` only while the menu is mounted; re-running on
    // `actions` would steal focus every parent render.
  }, [open, active]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <Btn
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => {
          setActive(0);
          setOpen((v) => !v);
        }}
        hoverStyle={{ color: c.text, background: c.hover }}
        style={{
          width: 32,
          height: 32,
          display: "grid",
          placeItems: "center",
          border: "none",
          background: "transparent",
          color: c.muted,
          cursor: "pointer",
          fontFamily: font.mono,
          fontSize: 15,
          lineHeight: 1,
          borderRadius: r.radiusSm,
        }}
      >
        ⋯
      </Btn>
      {open && (
        <div
          role="menu"
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % actions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + actions.length) % actions.length);
            } else if (e.key === "Home") {
              e.preventDefault();
              setActive(0);
            } else if (e.key === "End") {
              e.preventDefault();
              setActive(actions.length - 1);
            }
          }}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: 214,
            background: c.panel,
            border: `1px solid ${c.border}`,
            borderRadius: r.radiusSm,
            boxShadow: `0 12px 32px ${c.shadow}`,
            padding: 4,
            zIndex: 30,
          }}
        >
          {actions.map((a, i) => (
            <Btn
              key={a.key}
              role="menuitem"
              tabIndex={i === active ? 0 : -1}
              onFocus={() => setActive(i)}
              onClick={() => {
                // Focus first, while this item is still mounted: closing the
                // menu unmounts the focused node and drops focus to <body>,
                // which strands a keyboard user mid-row. Anything the action
                // opens (the drawer, a route) takes focus back in its own
                // effect, which runs after this commit.
                focusTrigger();
                setOpen(false);
                a.onSelect();
              }}
              hoverStyle={{ background: c.hover, color: a.danger ? c.amber : c.text }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "start",
                border: "none",
                background: "transparent",
                color: a.danger ? c.amber : c.text2,
                padding: "8px 10px",
                fontFamily: font.sans,
                fontSize: 13,
                cursor: "pointer",
                borderRadius: r.radiusSm,
              }}
            >
              {a.label}
            </Btn>
          ))}
        </div>
      )}
    </div>
  );
}
