"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { c, font, r } from "@/lib/theme";

export const fieldLabel: CSSProperties = { display: "block", marginBottom: 7, color: c.muted, fontFamily: font.mono, fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase" };
export const fieldControl: CSSProperties = { width: "100%", minWidth: 0, boxSizing: "border-box", border: `1px solid ${c.border}`, background: c.panelDeep, color: c.text, padding: "11px 12px", fontSize: 14, outline: "none", borderRadius: r.radiusSm };
export const primaryButton: CSSProperties = { border: `1px solid ${c.accent}`, background: c.accent, color: c.ink, minHeight: 38, padding: "8px 14px", fontFamily: font.space, fontWeight: 650, cursor: "pointer", borderRadius: r.radiusSm };
export const secondaryButton: CSSProperties = { border: `1px solid ${c.border}`, background: "transparent", color: c.text2, minHeight: 36, padding: "7px 11px", fontFamily: font.sans, cursor: "pointer", borderRadius: r.radiusSm };

export function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
    <div><h1 style={{ margin: 0, fontFamily: font.space, fontSize: 27, letterSpacing: 0 }}>{title}</h1><p style={{ margin: "7px 0 0", color: c.muted, fontSize: 14 }}>{subtitle}</p></div>
    {action}
  </header>;
}

export function InlineAlert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "success" }) {
  const error = tone === "error";
  return <div role={error ? "alert" : "status"} style={{ padding: "10px 12px", color: error ? c.red : c.green, background: error ? c.redWash : c.greenWash, border: `1px solid ${error ? c.redBorder : c.greenBorder}`, borderRadius: r.radiusSm, fontSize: 13 }}>{children}</div>;
}

export function StatusDot({ on }: { on: boolean }) {
  return <span aria-hidden="true" style={{ display: "inline-block", width: 7, height: 7, flex: "0 0 auto", borderRadius: "50%", background: on ? c.green : c.faint }} />;
}

export function Modal({ title, closeLabel, onClose, children }: { title: string; closeLabel: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => event.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", keydown); };
  }, []);
  return <div role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", padding: 16, background: c.scrim }}>
    <section role="dialog" aria-modal="true" aria-label={title} style={{ width: "min(620px, 100%)", maxHeight: "min(800px, 92vh)", overflowY: "auto", background: c.panel, border: `1px solid ${c.borderStrong}`, borderRadius: r.radiusMd, boxShadow: `0 24px 70px ${c.shadow}` }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "17px 20px", borderBottom: `1px solid ${c.line}` }}>
        <h2 style={{ margin: 0, fontFamily: font.space, fontSize: 18, letterSpacing: 0 }}>{title}</h2>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} style={{ width: 34, height: 34, border: 0, background: "transparent", color: c.muted, fontSize: 22, cursor: "pointer" }}>×</button>
      </header>
      <div style={{ padding: 20 }}>{children}</div>
    </section>
  </div>;
}
