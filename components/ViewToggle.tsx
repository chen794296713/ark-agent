"use client";

/**
 * The card / list segmented control.
 *
 * Shared rather than per-screen because the template gallery and the skill
 * repository both offer the same choice, and a control that behaves differently
 * on two pages of the same product reads as a bug. It owns the keyboard
 * contract (arrow keys move between the two options, one tab stop for the pair)
 * so no caller has to re-derive it.
 *
 * `radiogroup` and not two `aria-pressed` buttons: the two options are mutually
 * exclusive and one of them is always on, which is what a radio group means. A
 * pair of toggle buttons announces "grid, pressed / list, not pressed" and
 * leaves a screen-reader user guessing whether both could be on at once.
 *
 * The choice is a per-viewer, per-device reading preference — no backend service
 * consumes it — so it belongs in localStorage, not in Postgres.
 */
import { useCallback, useRef, useSyncExternalStore } from "react";
import { c, r } from "@/lib/theme";
import { Btn } from "@/components/ui";

export type ViewMode = "card" | "list";

export const VIEW_MODES: readonly ViewMode[] = ["card", "list"];

export function isViewMode(v: string): v is ViewMode {
  return VIEW_MODES.includes(v as ViewMode);
}

/**
 * Read the stored view. Wrapped because Safari's private mode and a browser
 * configured to block site data both *throw* on `localStorage` access rather
 * than returning null — an unhandled one takes the whole gallery down.
 * Returns null when there is nothing usable, so the caller keeps its default.
 */
export function readStoredView(key: string): ViewMode | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw !== null && isViewMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function storeView(key: string, value: ViewMode): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* a preference we could not persist is not worth an error to the user */
  }
}

// ---------------------------------------------------------------------------
// The preference as an external store
// ---------------------------------------------------------------------------
//
// `useSyncExternalStore` and not `useState` + a mount effect: localStorage is an
// external system, the server has no view of it, and writing the stored value in
// an effect is the cascading-render pattern React now lints against. The
// in-memory `cache` is the source of truth after the first read, so the toggle
// still works in a private window where the write silently fails.

const cache = new Map<string, ViewMode>();
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * `[view, setView]` for a persisted card/list choice. Renders `fallback` on the
 * server and on the first client paint so hydration agrees, then settles on what
 * was stored.
 */
export function useStoredView(
  key: string,
  fallback: ViewMode = "card",
): [ViewMode, (v: ViewMode) => void] {
  const view = useSyncExternalStore(
    subscribe,
    () => {
      const seen = cache.get(key);
      if (seen !== undefined) return seen;
      const stored = readStoredView(key) ?? fallback;
      cache.set(key, stored);
      return stored;
    },
    () => fallback,
  );

  const set = useCallback(
    (v: ViewMode) => {
      cache.set(key, v);
      storeView(key, v);
      for (const fn of listeners) fn();
    },
    [key],
  );

  return [view, set];
}

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="5.5" height="5.5" fill="none" stroke="currentColor" />
      <rect x="8" y="0.5" width="5.5" height="5.5" fill="none" stroke="currentColor" />
      <rect x="0.5" y="8" width="5.5" height="5.5" fill="none" stroke="currentColor" />
      <rect x="8" y="8" width="5.5" height="5.5" fill="none" stroke="currentColor" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <path
        d="M0.5 2h13M0.5 7h13M0.5 12h13"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function ViewToggle({
  value,
  onChange,
  label,
  cardLabel,
  listLabel,
  style,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  /** Accessible name for the group — e.g. "View". */
  label: string;
  cardLabel: string;
  listLabel: string;
  style?: React.CSSProperties;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  // Arrow keys move the selection AND the focus, which is the native radio
  // group behaviour. Btn declares no ref prop, so focus is moved by querying
  // the rendered nodes — the same approach MenuPopover takes.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") {
      return;
    }
    e.preventDefault();
    const next: ViewMode = value === "card" ? "list" : "card";
    onChange(next);
    const index = VIEW_MODES.indexOf(next);
    wrapRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
  }

  const options: { mode: ViewMode; text: string; icon: React.ReactNode }[] = [
    { mode: "card", text: cardLabel, icon: <GridIcon /> },
    { mode: "list", text: listLabel, icon: <ListIcon /> },
  ];

  return (
    <div
      ref={wrapRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{
        display: "inline-flex",
        border: `1px solid ${c.borderField}`,
        borderRadius: r.radiusSm,
        overflow: "hidden",
        background: c.panelDeep,
        ...style,
      }}
    >
      {options.map((o, i) => {
        const on = o.mode === value;
        return (
          <Btn
            key={o.mode}
            role="radio"
            aria-checked={on}
            aria-label={o.text}
            title={o.text}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.mode)}
            hoverStyle={on ? undefined : { color: c.text, background: c.hover }}
            style={{
              display: "grid",
              placeItems: "center",
              width: 38,
              height: 38,
              padding: 0,
              border: "none",
              borderLeft: i === 0 ? "none" : `1px solid ${c.line}`,
              background: on ? c.limeWash : "transparent",
              color: on ? c.accent : c.muted,
              cursor: "pointer",
            }}
          >
            {o.icon}
          </Btn>
        );
      })}
    </div>
  );
}
