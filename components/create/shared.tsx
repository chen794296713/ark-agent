"use client";

/**
 * The primitives the six review sections share.
 *
 * These are deliberately local to `components/create/**` rather than promoted
 * out of `app/dashboard/fleet/[id]/page.tsx`: that file is owned by another
 * vertical, and §G.1 says promote-don't-rewrite as a later, separate move. The
 * shapes match its `SettingCard` / `Field` / `Toggle` / `Seg` so the promotion
 * is a rename when it happens.
 *
 * Two departures from the fleet original, both required by §A.2's ramp
 * contract: a card's `desc` and a field's `hint` are `c.muted`, not `c.faint`,
 * because they are sentences the user has to read to operate the product.
 * `c.faint` here is only ever a counter, a timestamp or a placeholder.
 */
import {
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import type { SectionState } from "./logic";

// ---------------------------------------------------------------------------
// Shared style atoms
// ---------------------------------------------------------------------------

export const monoLabel: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 11,
  letterSpacing: ".1em",
  color: c.muted,
  display: "block",
  marginBottom: 7,
};

export const inputStyle: CSSProperties = {
  width: "100%",
  background: c.panelDeep,
  // borderField, not border: on an input the border IS the affordance, and
  // WCAG 1.4.11 wants 3:1 for that.
  border: `1px solid ${c.borderField}`,
  borderRadius: r.radiusSm,
  color: c.text,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: font.sans,
  outline: "none",
};

export const ghostBtn: CSSProperties = {
  background: "none",
  border: `1px solid ${c.border}`,
  borderRadius: r.radiusSm,
  color: c.text2,
  fontFamily: font.sans,
  fontSize: 13,
  padding: "7px 12px",
  cursor: "pointer",
};

export const ghostBtnHover: CSSProperties = {
  borderColor: c.limeBorder,
  background: c.limeWash,
  color: c.text,
};

export const primaryBtn: CSSProperties = {
  background: c.lime,
  color: c.ink,
  border: "none",
  borderRadius: r.radiusSm,
  fontFamily: font.space,
  fontWeight: 600,
  fontSize: 15,
  padding: "0 22px",
  height: 48,
  cursor: "pointer",
};

/** A 28px square action button — remove, move, expand. Always has an
 *  `aria-label`; the glyph alone is not a name. */
export function IconBtn({
  label,
  glyph,
  onClick,
  disabled,
  tone = "muted",
}: {
  label: string;
  glyph: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "muted" | "danger" | "accent";
}) {
  const color = tone === "danger" ? c.red : tone === "accent" ? c.accent : c.muted;
  return (
    <Btn
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28,
        height: 28,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "none",
        border: `1px solid transparent`,
        borderRadius: r.radiusSm,
        color,
        fontSize: 14,
        lineHeight: 1,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0,
      }}
      hoverStyle={disabled ? undefined : { borderColor: c.borderMute, background: c.hover }}
    >
      {glyph}
    </Btn>
  );
}

// ---------------------------------------------------------------------------
// Card shell
// ---------------------------------------------------------------------------

const STATE_EDGE: Record<SectionState, string> = {
  ok: c.green,
  review: c.amber,
  empty: c.border,
};

/**
 * The section card. `state` tints the left edge, and is ALWAYS paired with a
 * text badge — §I.4, never colour-only.
 */
export function Card({
  title,
  state,
  stateLabel,
  meta,
  headerAction,
  desc,
  children,
  id,
}: {
  title: string;
  state?: SectionState;
  stateLabel?: string;
  meta?: ReactNode;
  headerAction?: ReactNode;
  desc?: string;
  children: ReactNode;
  id?: string;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      style={{
        border: `1px solid ${c.border}`,
        borderLeft: `2px solid ${state ? STATE_EDGE[state] : c.border}`,
        background: c.panel,
        padding: 22,
        borderRadius: r.radiusMd,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3
          id={headingId}
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: ".12em",
            color: c.text2,
            margin: 0,
            fontWeight: 500,
          }}
        >
          {title}
        </h3>
        {state && stateLabel && (
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 10.5,
              letterSpacing: ".08em",
              color: state === "ok" ? c.green : state === "review" ? c.amber : c.muted,
              border: `1px solid ${state === "ok" ? c.greenBorder : state === "review" ? c.amber : c.border}`,
              borderRadius: r.radiusSm,
              padding: "2px 6px",
            }}
          >
            {stateLabel}
          </span>
        )}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: font.mono,
            fontSize: 11,
            color: c.muted,
          }}
        >
          {meta}
          {headerAction}
        </div>
      </div>
      {desc && <p style={{ fontSize: 13, color: c.muted, margin: 0 }}>{desc}</p>}
      {children}
    </section>
  );
}

/** Label + control + hint. The hint is `c.muted`: it is a sentence. */
export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={monoLabel} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 12.5, color: c.muted, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

/** A labelled text input that wires its own id, so the label is a real label. */
export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  maxLength,
  type = "text",
  inputMode,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  type?: "text" | "number" | "time" | "url";
  inputMode?: "numeric" | "text" | "url";
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, opacity: disabled ? 0.6 : 1 }}
      />
    </Field>
  );
}

export function TextArea({
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
  counter,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  counter?: string;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55 }}
      />
      {counter && (
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: c.faint,
            textAlign: "right",
            marginTop: 4,
          }}
        >
          {counter}
        </div>
      )}
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { id: string; label: string }[];
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, cursor: disabled ? "not-allowed" : "pointer" }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * Segmented control — a real radiogroup, so a screen reader announces "2 of 4"
 * rather than reading four unrelated buttons.
 *
 * The arrow keys are implemented here, not assumed: `role="radio"` on a
 * `<button>` buys the announcement and nothing else. Roving tabindex (only the
 * checked option is tabbable) plus ←/→/↑/↓ is what the pattern actually
 * requires, and without it the group is a keyboard trap of N tab stops.
 */
export function Seg<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { id: T; label: string }[];
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const checked = Math.max(0, options.findIndex((o) => o.id === value));

  const move = (from: number, delta: number) => {
    if (options.length === 0) return;
    const to = (from + delta + options.length) % options.length;
    // Selection follows focus — the expected radiogroup behaviour, and the
    // reason the roving tabindex lands on the right control afterwards.
    onChange(options[to].id);
    refs.current[to]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{
        display: "inline-flex",
        border: `1px solid ${c.borderField}`,
        borderRadius: r.radiusSm,
        overflow: "hidden",
        flexWrap: "wrap",
      }}
    >
      {options.map((o, i) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === checked ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            style={{
              background: on ? c.lime : "transparent",
              color: on ? c.ink : c.muted,
              border: "none",
              padding: "8px 15px",
              fontFamily: font.mono,
              fontSize: 11.5,
              letterSpacing: ".03em",
              cursor: "pointer",
              minHeight: 36,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  on,
  onChange,
  label,
  desc,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button
        type="button"
        id={id}
        onClick={() => !disabled && onChange(!on)}
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          border: `1px solid ${on ? c.limeBorder : c.borderField}`,
          background: on ? c.lime : "transparent",
          position: "relative",
          cursor: disabled ? "not-allowed" : "pointer",
          flexShrink: 0,
          opacity: disabled ? 0.5 : 1,
          transition: "background .15s ease, border-color .15s ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on ? 19 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: on ? c.ink : c.muted,
            transition: "left .15s ease",
          }}
        />
      </button>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: c.text2 }}>{label}</div>
        {desc && <div style={{ fontSize: 12.5, color: c.muted }}>{desc}</div>}
      </div>
    </div>
  );
}

/** A multi-select chip row (channels, tools, weekdays). */
export function ChipRow<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  selected: readonly T[];
  onToggle: (id: T) => void;
}) {
  return (
    <div role="group" aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <Btn
            key={o.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onToggle(o.id)}
            style={{
              background: on ? c.limeWash : "transparent",
              border: `1px solid ${on ? c.limeBorder : c.borderField}`,
              borderRadius: r.radiusSm,
              color: on ? c.text : c.muted,
              fontFamily: font.sans,
              fontSize: 13,
              padding: "7px 12px",
              minHeight: 34,
              cursor: "pointer",
            }}
            hoverStyle={{ borderColor: c.limeBorder, color: c.text }}
          >
            {on ? "✓ " : ""}
            {o.label}
          </Btn>
        );
      })}
    </div>
  );
}

/**
 * An editable list of plain strings — responsibilities, tasks, prohibitions,
 * triggers. Every row is a real input so the whole list is keyboard-reachable,
 * and Enter in the composer adds without a mouse.
 */
export function StringList({
  label,
  hint,
  items,
  onChange,
  placeholder,
  addLabel,
  removeLabel,
  maxLength = 200,
  max = 12,
}: {
  label: string;
  hint?: string;
  items: readonly string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  addLabel: string;
  removeLabel: string;
  maxLength?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || items.length >= max) return;
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <Field label={label} hint={hint}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, i) => (
          <div key={`${i}-${item.slice(0, 12)}`} style={{ display: "flex", gap: 8 }}>
            <input
              value={item}
              maxLength={maxLength}
              aria-label={`${label} ${i + 1}`}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
              style={{ ...inputStyle, fontSize: 13.5 }}
            />
            <IconBtn
              label={`${removeLabel}: ${item.slice(0, 40)}`}
              glyph="✕"
              tone="danger"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        {items.length < max && (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={draft}
              placeholder={placeholder}
              maxLength={maxLength}
              aria-label={addLabel}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              style={{ ...inputStyle, fontSize: 13.5 }}
            />
            <Btn
              type="button"
              onClick={add}
              disabled={!draft.trim()}
              style={{ ...ghostBtn, opacity: draft.trim() ? 1 : 0.5, whiteSpace: "nowrap" }}
              hoverStyle={draft.trim() ? ghostBtnHover : undefined}
            >
              {addLabel}
            </Btn>
          </div>
        )}
      </div>
    </Field>
  );
}

/** A skeleton the same height as the finished card, so nothing reflows under
 *  the cursor while a section is still streaming (§C.2). */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  const reduced = useReducedMotion();
  return (
    <div aria-hidden style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            height: 14,
            width: `${100 - i * 12}%`,
            borderRadius: r.radiusSm,
            background: c.panelDeep,
            border: `1px solid ${c.lineSoft}`,
            animation: reduced ? "none" : "pulse 1.6s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  );
}

/** Non-blocking notice. Never `c.red` for a supported product state. */
export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warn" | "error";
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const border = tone === "error" ? c.redBorder : tone === "warn" ? c.amber : c.limeBorder;
  const bg = tone === "error" ? c.redWash : tone === "warn" ? "transparent" : c.limeWash;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      style={{
        border: `1px solid ${border}`,
        background: bg,
        borderRadius: r.radiusSm,
        padding: "12px 14px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}
    >
      <span aria-hidden style={{ color: tone === "error" ? c.red : c.accent, lineHeight: 1.5 }}>
        ◆
      </span>
      <div style={{ flex: "1 1 240px", minWidth: 0, fontSize: 13, color: c.text2, lineHeight: 1.6 }}>
        {title && <strong style={{ color: c.text, fontWeight: 600 }}>{title} </strong>}
        {children}
      </div>
      {action}
    </div>
  );
}

/** Small mono caption — counts, timezone names, ranks. */
export function Mono({
  children,
  color = c.muted,
  size = 11,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
}) {
  return (
    <span style={{ fontFamily: font.mono, fontSize: size, letterSpacing: ".06em", color }}>
      {children}
    </span>
  );
}

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * `prefers-reduced-motion`, read at runtime because inline styles cannot carry
 * a media query and §I.5 is not optional.
 *
 * `useSyncExternalStore` rather than an effect that calls `setReduced`: the
 * media query IS an external store, and reading it in an effect body both
 * renders one frame of the wrong answer and trips `react-hooks/set-state-in-
 * effect`. The server snapshot is `false` so SSR and hydration agree.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia &&
      window.matchMedia(REDUCE_QUERY).matches,
    () => false,
  );
}

/** Nothing to subscribe to — `hydrated` flips exactly once, at hydration. */
const noopSubscribe = () => () => {};

/** True only after hydration, so a client-only value cannot mismatch the HTML. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * The browser's own zone, or UTC when nothing can answer.
 *
 * A plain function, for EVENT HANDLERS only. Reading it during render would
 * make the server (UTC on a Vercel function) and the browser disagree about a
 * `<select value>`, which is a hydration mismatch — use `useLocalTimeZone` for
 * anything that renders.
 */
export function resolveLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** `resolveLocalTimeZone`, but UTC until hydration so the HTML always matches. */
export function useLocalTimeZone(): string {
  return useHydrated() ? resolveLocalTimeZone() : "UTC";
}

/** The zones worth offering on an engine whose ICU carries no `supportedValuesOf`. */
const FALLBACK_ZONES = [
  "UTC",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Hong_Kong",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];

/** Computed once per tab: `supportedValuesOf` allocates a ~600-entry array. */
let zoneCache: string[] | null = null;
function platformZones(): string[] {
  if (zoneCache) return zoneCache;
  let list: string[] = [];
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    list = supported ? supported("timeZone") : [];
  } catch {
    list = [];
  }
  zoneCache = list.length > 0 ? list : FALLBACK_ZONES;
  return zoneCache;
}

/**
 * The IANA zone list, from the platform rather than a bundled table. Falls back
 * to a short curated list on the (rare) engine without `supportedValuesOf`, and
 * always includes the current value so a zone we do not list is still visible.
 *
 * Gated on hydration rather than filled from an effect: the server's ICU build
 * and the browser's do not have to agree on the list, and rendering 600 zones
 * during SSR only to replace them is a hydration mismatch waiting to happen.
 */
export function useTimeZones(current: string): string[] {
  const hydrated = useHydrated();
  return useMemo(() => {
    if (!hydrated) return [current];
    const list = platformZones();
    return list.includes(current) ? list : [current, ...list];
  }, [current, hydrated]);
}
