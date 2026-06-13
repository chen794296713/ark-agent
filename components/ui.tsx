"use client";

/**
 * Hover-aware primitives. The design prototype expressed hover via a custom
 * `style-hover` attribute; in React we merge `hoverStyle` over `style` while the
 * pointer is engaged. A light transition is baked in for a crafted feel and can
 * be overridden via `style`.
 *
 * Touch devices never fire `:hover`, so feedback would be invisible on phones.
 * We listen to Pointer Events — which unify mouse, touch and pen — so the same
 * `hoverStyle` also flashes on press (pointerdown → up/cancel/leave) on touch,
 * while continuing to track real hover on the desktop via mouse enter/leave.
 */
import { useState } from "react";

const TRANSITION =
  "background .15s ease, border-color .15s ease, color .15s ease, box-shadow .15s ease, opacity .15s ease";

/** Shared engaged-state + handler set for both primitives. */
function useEngaged(handlers: {
  onMouseEnter?: (e: React.MouseEvent<never>) => void;
  onMouseLeave?: (e: React.MouseEvent<never>) => void;
  onPointerDown?: (e: React.PointerEvent<never>) => void;
  onPointerUp?: (e: React.PointerEvent<never>) => void;
}) {
  const [engaged, setEngaged] = useState(false);
  const on = {
    onMouseEnter: (e: React.MouseEvent<never>) => {
      setEngaged(true);
      handlers.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent<never>) => {
      setEngaged(false);
      handlers.onMouseLeave?.(e);
    },
    // Press feedback for touch/pen (and harmless on mouse).
    onPointerDown: (e: React.PointerEvent<never>) => {
      setEngaged(true);
      handlers.onPointerDown?.(e);
    },
    onPointerUp: (e: React.PointerEvent<never>) => {
      setEngaged(false);
      handlers.onPointerUp?.(e);
    },
    onPointerCancel: () => setEngaged(false),
    onPointerLeave: () => setEngaged(false),
  };
  return { engaged, on };
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  hoverStyle?: React.CSSProperties;
};

export function Btn({
  hoverStyle,
  style,
  onMouseEnter,
  onMouseLeave,
  onPointerDown,
  onPointerUp,
  ...rest
}: BtnProps) {
  const { engaged, on } = useEngaged({
    onMouseEnter: onMouseEnter as never,
    onMouseLeave: onMouseLeave as never,
    onPointerDown: onPointerDown as never,
    onPointerUp: onPointerUp as never,
  });
  return (
    <button
      {...rest}
      {...on}
      style={{ transition: TRANSITION, ...style, ...(engaged && hoverStyle ? hoverStyle : null) }}
    />
  );
}

type HoverDivProps = React.HTMLAttributes<HTMLDivElement> & {
  hoverStyle?: React.CSSProperties;
};

export function HoverDiv({
  hoverStyle,
  style,
  onMouseEnter,
  onMouseLeave,
  onPointerDown,
  onPointerUp,
  ...rest
}: HoverDivProps) {
  const { engaged, on } = useEngaged({
    onMouseEnter: onMouseEnter as never,
    onMouseLeave: onMouseLeave as never,
    onPointerDown: onPointerDown as never,
    onPointerUp: onPointerUp as never,
  });
  return (
    <div
      {...rest}
      {...on}
      style={{ transition: TRANSITION, ...style, ...(engaged && hoverStyle ? hoverStyle : null) }}
    />
  );
}
