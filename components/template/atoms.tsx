"use client";

/**
 * The small marks the card, the row and the drawer all draw, written once so
 * a template cannot look like two different objects on two views of one page.
 */
import type { CSSProperties, ReactNode } from "react";
import { c, font, r } from "@/lib/theme";
import { HUE_FALLBACK, firstGlyph, safeHue } from "./derive";

/**
 * The template's monogram on its own hue. `onBrand` and not `ink`: `hue` is a
 * FIXED colour stored on the row, so its ink must not invert with the theme.
 *
 * The hue goes through `safeHue` first. On a `scope=public` row it is another
 * tenant's free text landing in a CSS `background`, and a valid-but-hostile
 * value (`url(https://…)`) would make every viewer fetch a stranger's URL.
 */
export function Glyph({ mono, hue, size = 38 }: { mono: string; hue: string; size?: number }) {
  const fill = safeHue(hue) ?? HUE_FALLBACK;
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        background: fill,
        color: c.onBrand,
        display: "grid",
        placeItems: "center",
        fontFamily: font.space,
        fontWeight: 700,
        fontSize: Math.round(size * 0.42),
        borderRadius: r.radiusSm,
      }}
    >
      {firstGlyph(mono)}
    </div>
  );
}

/** Ownership mark. `public` is amber because it is a caution, not a feature:
 *  it says the words on this card were written by another tenant. */
export function OwnershipBadge({ kind, label }: { kind: "yours" | "public"; label: string }) {
  const tint = kind === "public" ? c.amber : c.accent;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontFamily: font.mono,
        fontSize: 10,
        letterSpacing: ".08em",
        color: tint,
        border: `1px solid ${tint}`,
        borderRadius: r.radiusSm,
        padding: "2px 6px",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      ⬦ {label}
    </span>
  );
}

/** The harness a template provisions onto. A proper noun — never translated. */
export function HarnessPill({ label, style }: { label: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: font.mono,
        fontSize: 10,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: c.muted,
        border: `1px solid ${c.border}`,
        borderRadius: r.radiusSm,
        padding: "3px 7px",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
    </span>
  );
}

/** A tag or skill chip. Its text is third-party data — rendered, never parsed. */
export function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      style={{
        fontFamily: font.mono,
        fontSize: 10.5,
        color: c.muted,
        border: `1px solid ${c.line}`,
        borderRadius: r.radiusSm,
        padding: "3px 7px",
        whiteSpace: "nowrap",
        maxWidth: 160,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {children}
    </span>
  );
}

const RISK_TINT = { low: c.green, medium: c.amber, high: c.red } as const;

export function RiskDot({ level }: { level: "low" | "medium" | "high" }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: RISK_TINT[level],
        flex: "0 0 auto",
      }}
    />
  );
}

/** One cell of the three-up metric strip: a mono label over a display value. */
export function Metric({
  label,
  value,
  last = false,
}: {
  label: string;
  value: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: "9px 12px",
        borderRight: last ? "none" : `1px solid ${c.line}`,
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          letterSpacing: ".08em",
          color: c.muted,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: font.space,
          fontWeight: 700,
          fontSize: 14,
          color: c.text,
          marginTop: 3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** Two lines of `summary`, clamped so a grid of cards keeps one baseline. */
export const clamp2: CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
};
