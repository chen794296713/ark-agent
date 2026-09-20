"use client";

/**
 * The small marks the card, the row and the drawer all draw, written once so
 * a template cannot look like two different objects on two views of one page.
 */
import type { CSSProperties, ReactNode } from "react";
import { c, font, r } from "@/lib/theme";
import { HUE_FALLBACK, firstGlyph, safeHue } from "./derive";

/**
 * Keep a template's stored identity hue as a quiet tint. It is untrusted input
 * on public rows, so it is validated before it becomes a CSS value.
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
        background: `color-mix(in srgb, ${fill} 18%, ${c.panel})`,
        border: `1px solid ${c.border}`,
        color: c.text,
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
        fontFamily: font.sans,
        fontSize: 12,
        letterSpacing: "normal",
        color: tint,
        border: `1px solid ${tint}`,
        borderRadius: r.radiusSm,
        padding: "2px 6px",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

/** The harness a template provisions onto. A proper noun — never translated. */
export function HarnessPill({ label, style }: { label: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: font.sans,
        fontSize: 12,
        letterSpacing: "normal",
        textTransform: "none",
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
        fontFamily: font.sans,
        fontSize: 12,
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

/** One cell of the three-up setup summary. */
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
        padding: "4px 10px 4px 0",
        paddingRight: last ? 0 : 10,
      }}
    >
      <div
        style={{
          fontFamily: font.sans,
          fontSize: 12,
          letterSpacing: "normal",
          color: c.muted,
          textTransform: "none",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: font.sans,
          fontWeight: 600,
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
