"use client";

/**
 * Full-screen mobile navigation drawer for the marketing site. Rendered only
 * when `open` is true (so it can't overlap content when closed) and hidden on
 * ≥641px via `.r-mobile-only` as a resize safety. Keeps the Terminal Lime look
 * — the faint engineering grid (gridBg) and the riseIn entrance — so it reads
 * as the same product, just stacked for a phone.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { c, font, gridBg } from "@/lib/theme";
import { common } from "@/lib/i18n/common";
import { useApp } from "@/lib/store";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const links = [
  { href: "#roles", key: "navAgents" },
  { href: "#how", key: "navHow" },
  { href: "#engines", key: "navEngines" },
  { href: "#pricing", key: "navPricing" },
] as const;

export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { lang } = useApp();
  const t = common[lang];

  // Lock body scroll while the drawer is open; always restore on close/unmount.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="r-mobile-only"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: c.bg,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        flexDirection: "column",
        padding: "18px 20px 28px",
        animation: "riseIn .18s ease",
        ...gridBg,
      }}
    >
      {/* Top row: logo + close */}
      <div style={{ display: "flex", alignItems: "center", height: 56 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 26,
              height: 26,
              background: c.lime,
              display: "grid",
              placeItems: "center",
              fontFamily: font.space,
              fontWeight: 700,
              color: c.ink,
              fontSize: 15,
            }}
          >
            A
          </div>
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 15,
              fontWeight: 500,
              letterSpacing: ".04em",
              color: c.text,
            }}
          >
            ARK_AGENT
          </span>
        </div>
        <button
          aria-label="Close menu"
          onClick={onClose}
          style={{
            marginLeft: "auto",
            width: 44,
            height: 44,
            display: "grid",
            placeItems: "center",
            background: "transparent",
            border: `1px solid ${c.border}`,
            color: c.text,
            fontSize: 18,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      {/* Links */}
      <nav style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
        {links.map((l, i) => (
          <a
            key={l.href}
            href={l.href}
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              minHeight: 56,
              fontFamily: font.space,
              fontSize: 22,
              color: c.text,
              textDecoration: "none",
              borderBottom: `1px solid ${c.lineSoft}`,
              animation: "riseIn .22s ease both",
              animationDelay: `${0.04 * (i + 1)}s`,
            }}
          >
            {t[l.key]}
          </a>
        ))}
      </nav>

      {/* Footer cluster: language + auth */}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <LanguageSwitcher compact={false} style={{ alignSelf: "stretch" }} />

        <ThemeToggle compact={false} style={{ alignSelf: "stretch" }} />

        <button
          onClick={() => {
            onClose();
            router.push("/auth");
          }}
          style={{
            background: "transparent",
            border: `1px solid ${c.border}`,
            color: c.text,
            padding: "14px",
            fontSize: 15,
            cursor: "pointer",
            fontFamily: font.sans,
          }}
        >
          {t.signin}
        </button>
        <button
          onClick={() => {
            onClose();
            router.push("/hire");
          }}
          style={{
            background: c.lime,
            color: c.ink,
            border: "none",
            padding: "15px",
            fontFamily: font.space,
            fontWeight: 600,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          {t.hire}
        </button>
      </div>
    </div>
  );
}
