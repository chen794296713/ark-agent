"use client";

/**
 * The management surface's shared primitives.
 *
 * `SettingCard`, `Field`, `Toggle`, `Seg`, `SelectField` and `Chip` are ported
 * VERBATIM in look and behaviour from `app/dashboard/fleet/[id]/page.tsx:1440-1640`
 * — same paddings, same 40×22 switch, same mono label tracking — so the new panels
 * sit inside the existing Settings tab without a seam. They are copied rather than
 * imported because that file does not export them and this vertical does not own
 * it; §G.1 promotes them to `components/` in a later pass, at which point these
 * definitions are deleted and the imports re-pointed. The only additions are the
 * ones §E.3 requires and the old ones cannot express: a dirty marker, a per-field
 * revert, and an inline error.
 */
import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";

export const sLabel: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 11,
  letterSpacing: ".1em",
  color: c.muted,
  marginBottom: 7,
  display: "block",
};

/**
 * `borderField`, not `border`: an input whose only boundary is a 1.3:1 hairline
 * fails WCAG 1.4.11, and the ramp keeps `border` decorative on purpose.
 */
export const sInput: CSSProperties = {
  width: "100%",
  background: c.bg,
  border: `1px solid ${c.borderField}`,
  borderRadius: r.radiusSm,
  color: c.text,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: font.sans,
  outline: "none",
};

export const sMonoLabel: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 11,
  letterSpacing: ".08em",
  color: c.muted,
};

/** A section card. `sectionId` makes it an anchor target for the §E.1 rail. */
export function SettingCard({
  title,
  sectionId,
  badge,
  badgeColor,
  desc,
  dirtyCount,
  errorCount,
  editedLabel,
  problemLabel,
  actions,
  children,
}: {
  title: string;
  sectionId?: string;
  badge?: string;
  badgeColor?: string;
  desc?: string;
  dirtyCount?: number;
  errorCount?: number;
  editedLabel?: string;
  /** Pluralised by the caller from `problemOne` / `problemMany`. */
  problemLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const dirty = (dirtyCount ?? 0) > 0;
  const invalid = (errorCount ?? 0) > 0;
  return (
    <section
      id={sectionId}
      aria-labelledby={sectionId ? `${sectionId}-h` : undefined}
      style={{
        border: `1px solid ${invalid ? c.redBorder : c.border}`,
        background: c.panel,
        padding: 22,
        borderRadius: r.radiusMd,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        scrollMarginTop: 96,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3
            id={sectionId ? `${sectionId}-h` : undefined}
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: ".12em",
              color: c.text2,
              margin: 0,
              fontWeight: 400,
            }}
          >
            {title}
          </h3>
          {badge && (
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 10.5,
                letterSpacing: ".08em",
                color: badgeColor ?? c.muted,
                border: `1px solid ${badgeColor ?? c.border}`,
                padding: "2px 6px",
              }}
            >
              {badge}
            </span>
          )}
          {/* `role="region"` takes no aria-invalid, so the red border cannot be the
              only signal: this badge is what carries "this section is wrong" to a
              screen reader and to anyone who does not see red. */}
          {invalid && problemLabel && (
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 10.5,
                letterSpacing: ".08em",
                color: c.red,
                border: `1px solid ${c.redBorder}`,
                padding: "2px 6px",
              }}
            >
              <span aria-hidden="true">▲ </span>
              {problemLabel}
            </span>
          )}
          {dirty && editedLabel && (
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 10.5,
                letterSpacing: ".08em",
                color: c.amber,
                border: `1px solid ${c.amber}`,
                padding: "2px 6px",
              }}
            >
              ● {editedLabel} {dirtyCount}
            </span>
          )}
          <span style={{ flex: 1 }} />
          {actions}
        </div>
        {desc && (
          <div style={{ fontSize: 12.5, color: c.muted, marginTop: 6, lineHeight: 1.5 }}>{desc}</div>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * One labelled control. A dirty field gets a 2px amber rule down its left edge and
 * a revert affordance in the label row — E.3 rule 2. The rule is drawn with a
 * padding shift rather than a border swap so the control does not move when it
 * becomes dirty; a field that jogs 2px as you type is worse than no marker.
 */
export function Field({
  label,
  hint,
  error,
  dirty,
  onRevert,
  revertLabel,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  dirty?: boolean;
  onRevert?: () => void;
  revertLabel?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const auto = useId();
  const base = htmlFor ?? auto;
  const errorId = `${base}-err`;
  const hintId = `${base}-hint`;

  // E.4 requires `aria-describedby` + `aria-invalid` on the CONTROL, and a field
  // whose error is only a red sibling <div> is unannounced: a screen-reader user
  // tabs into the input, hears the label, and never learns why Save is disabled.
  // Wiring it here rather than at every call site means no panel can forget.
  // A Fragment is a valid element that accepts no props but `key`; cloning aria
  // onto one is a React warning and a control that still announces nothing.
  const single =
    Children.count(children) === 1 && isValidElement(children) && children.type !== Fragment
      ? children
      : null;
  const control = single
    ? cloneElement(single as ReactElement<Record<string, unknown>>, {
        "aria-describedby":
          [
            (single.props as Record<string, unknown>)["aria-describedby"],
            error ? errorId : null,
            hint && !error ? hintId : null,
          ]
            .filter(Boolean)
            .join(" ") || undefined,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div
      style={{
        borderLeft: `2px solid ${dirty ? c.amber : "transparent"}`,
        paddingLeft: 10,
        marginLeft: -12,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <label htmlFor={htmlFor} style={{ ...sLabel, flex: 1 }}>
          {label}
        </label>
        {dirty && onRevert && (
          <Btn
            type="button"
            onClick={onRevert}
            title={revertLabel}
            aria-label={revertLabel}
            hoverStyle={{ color: c.text }}
            style={{
              background: "transparent",
              border: "none",
              color: c.muted,
              cursor: "pointer",
              fontSize: 13,
              lineHeight: 1,
              padding: "0 2px 6px",
            }}
          >
            ↺
          </Btn>
        )}
      </div>
      {control}
      {hint && !error && (
        <div id={hintId} style={{ fontSize: 12, color: c.muted, marginTop: 6, lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
      {error && <InlineError id={errorId} text={error} />}
    </div>
  );
}

/** Never colour-only: the ▲ carries the same meaning as the red (I.4). */
export function InlineError({ text, id }: { text: string; id?: string }) {
  return (
    <div
      id={id}
      style={{
        fontSize: 12,
        color: c.red,
        marginTop: 6,
        display: "flex",
        gap: 6,
        lineHeight: 1.5,
      }}
    >
      <span aria-hidden="true">▲</span>
      <span>{text}</span>
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
  const descId = useId();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: disabled ? 0.55 : 1 }}>
      <button
        type="button"
        onClick={() => !disabled && onChange(!on)}
        role="switch"
        aria-checked={on}
        aria-label={label}
        aria-describedby={desc ? descId : undefined}
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
        {desc && (
          <div id={descId} style={{ fontSize: 12, color: c.muted, lineHeight: 1.5 }}>
            {desc}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A radio group, not a row of buttons: arrow keys must move between the options
 * and only the selected one belongs in the tab order (I.3).
 */
export function Seg<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  label?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function move(delta: number) {
    const i = options.findIndex((o) => o.id === value);
    const next = options[(i + delta + options.length) % options.length];
    if (!next) return;
    onChange(next.id);
    refs.current[next.id]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{ display: "inline-flex", border: `1px solid ${c.borderField}`, flexWrap: "wrap" }}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[o.id] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(-1);
              }
            }}
            style={{
              background: on ? c.lime : "transparent",
              color: on ? c.ink : c.muted,
              border: "none",
              padding: "7px 14px",
              fontFamily: font.mono,
              fontSize: 11.5,
              letterSpacing: ".03em",
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SelectField({
  value,
  onChange,
  options,
  id,
  ariaLabel,
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  id?: string;
  ariaLabel?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...sInput,
        fontFamily: font.mono,
        fontSize: 13,
        cursor: "pointer",
        borderColor: invalid ? c.red : c.borderField,
      }}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Chip({
  label,
  on,
  onClick,
  title,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <Btn
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      hoverStyle={on ? undefined : { borderColor: c.borderMute, color: c.text }}
      style={{
        border: `1px solid ${on ? c.limeBorder : c.borderField}`,
        background: on ? c.limeWash : "transparent",
        color: on ? c.accent : c.muted,
        padding: "7px 13px",
        fontFamily: font.space,
        fontSize: 12.5,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {label}
    </Btn>
  );
}

/** A small mono badge. The glyph is not decoration — colour alone never carries it. */
export function Badge({
  text,
  color,
  glyph,
  title,
}: {
  text: string;
  color?: string;
  glyph?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{
        fontFamily: font.mono,
        fontSize: 10.5,
        letterSpacing: ".08em",
        color: color ?? c.muted,
        border: `1px solid ${color ?? c.border}`,
        padding: "2px 6px",
        whiteSpace: "nowrap",
        display: "inline-flex",
        gap: 4,
        alignItems: "center",
      }}
    >
      {glyph && <span aria-hidden="true">{glyph}</span>}
      {text}
    </span>
  );
}

/** A quiet text button for row actions. */
export function LinkBtn({
  children,
  onClick,
  danger,
  disabled,
  ariaLabel,
  ariaExpanded,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  ariaExpanded?: boolean;
}) {
  return (
    <Btn
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      hoverStyle={disabled ? undefined : { color: danger ? c.red : c.text }}
      style={{
        background: "transparent",
        border: "none",
        padding: "4px 2px",
        fontFamily: font.mono,
        fontSize: 11.5,
        letterSpacing: ".04em",
        color: disabled ? c.faint : danger ? c.red : c.muted,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </Btn>
  );
}

/**
 * An empty state that TEACHES. Every one of these in the product answers two
 * questions — what will appear here, and why it is empty right now — because at
 * launch the empty state is the common case and "No data" tells a user nothing
 * they cannot already see.
 */
export function EmptyState({
  glyph,
  title,
  body,
  actions,
}: {
  glyph?: string;
  title: string;
  body: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px dashed ${c.border}`,
        borderRadius: r.radiusMd,
        background: c.panelDeep,
        padding: "34px 22px",
        textAlign: "center",
      }}
    >
      {glyph && (
        <div aria-hidden="true" style={{ fontSize: 22, color: c.muted, marginBottom: 10 }}>
          {glyph}
        </div>
      )}
      <div style={{ fontFamily: font.space, fontSize: 15, color: c.text, marginBottom: 8 }}>
        {title}
      </div>
      <div
        style={{
          fontSize: 13.5,
          color: c.muted,
          lineHeight: 1.6,
          maxWidth: 460,
          margin: "0 auto",
        }}
      >
        {body}
      </div>
      {actions && (
        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * A failed request is NOT an empty list. Showing an empty panel over a 500 tells
 * the user their agent has no skills / did no work, which is a lie the product
 * cannot afford.
 */
export function ErrorPanel({
  title,
  body,
  onRetry,
  retryLabel,
}: {
  title: string;
  body?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      style={{
        border: `1px solid ${c.redBorder}`,
        background: c.redWash,
        borderRadius: r.radiusMd,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13.5, color: c.text2, display: "flex", gap: 8 }}>
        <span aria-hidden="true">▲</span>
        <span>{title}</span>
      </div>
      {body && <div style={{ fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>{body}</div>}
      {onRetry && retryLabel && (
        <div>
          <LinkBtn onClick={onRetry}>{retryLabel}</LinkBtn>
        </div>
      )}
    </div>
  );
}

const FOCUSABLE =
  'a[href],button,select,textarea,input:not([type="hidden"]),[tabindex]:not([tabindex="-1"])';

/**
 * A modal confirm. Focus moves in on open and Escape closes; the scrim is the
 * `c.scrim` token. Used for every destructive or irreversible action
 * in this vertical — detaching a skill, deleting a schedule, pausing everything.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger,
  confirmDisabled,
  extra,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  extra?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const headingId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // `Btn` is a plain function component with no ref forwarding, so the dialog
    // reaches its cancel button through the panel rather than through a ref on it.
    const panel = panelRef.current;
    const opener = document.activeElement as HTMLElement | null;
    panel?.querySelector<HTMLElement>("[data-confirm-cancel]")?.focus();

    function focusable(): HTMLElement[] {
      if (!panel) return [];
      return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
      );
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      // `aria-modal` is a promise to assistive tech, not an implementation: without
      // a trap, Tab walks straight out of an alertdialog and into the page behind
      // the scrim, where the controls are visible but unreachable by mouse.
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Dismissing a dialog must not drop focus on <body>: the next Tab would
      // restart at the top of the document, miles from the row being acted on.
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [onCancel]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: c.scrim,
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={bodyId}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: c.panel,
          border: `1px solid ${c.border}`,
          borderRadius: r.radiusMd,
          padding: 22,
          maxWidth: 460,
          width: "100%",
          maxHeight: "calc(100dvh - 40px)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div id={headingId} style={{ fontFamily: font.space, fontSize: 16, color: c.text }}>
          {title}
        </div>
        <div id={bodyId} style={{ fontSize: 13.5, color: c.text2, lineHeight: 1.6 }}>
          {body}
        </div>
        {extra}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Btn
            data-confirm-cancel=""
            type="button"
            onClick={onCancel}
            hoverStyle={{ borderColor: c.borderMute, color: c.text }}
            style={{
              border: `1px solid ${c.borderField}`,
              background: "transparent",
              color: c.muted,
              padding: "9px 16px",
              fontFamily: font.mono,
              fontSize: 12,
              cursor: "pointer",
              borderRadius: r.radiusSm,
            }}
          >
            {cancelLabel}
          </Btn>
          <Btn
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            style={{
              border: `1px solid ${danger ? c.redBorder : c.limeBorder}`,
              background: confirmDisabled ? "transparent" : danger ? c.redWash : c.lime,
              color: confirmDisabled ? c.faint : danger ? c.red : c.ink,
              padding: "9px 16px",
              fontFamily: font.mono,
              fontSize: 12,
              cursor: confirmDisabled ? "not-allowed" : "pointer",
              borderRadius: r.radiusSm,
            }}
          >
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/** A checkbox whose label is the whole hit area, for the acknowledge gates. */
export function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3, width: 15, height: 15, accentColor: c.accent, cursor: "pointer" }}
      />
      <label htmlFor={id} style={{ fontSize: 13, color: c.text2, cursor: "pointer", lineHeight: 1.5 }}>
        {label}
      </label>
    </div>
  );
}

/** A horizontally scrolling strip that never widens the page. */
export function HScroll({ children }: { children: ReactNode }) {
  return (
    <div
      className="ark-scroll"
      style={{ overflowX: "auto", overflowY: "hidden", maxWidth: "100%" }}
    >
      {children}
    </div>
  );
}

/** Copy-to-clipboard that reports back, because a silent copy reads as broken. */
export function useCopied(ms = 1400) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), ms);
    return () => clearTimeout(t);
  }, [copied, ms]);
  return {
    copied,
    copy: async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      } catch {
        // Clipboard access is denied in some embedded contexts. Say nothing
        // rather than throwing an unhandled rejection into the page.
      }
    },
  };
}
