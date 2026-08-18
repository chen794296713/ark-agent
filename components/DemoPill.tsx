"use client";

/**
 * Fixed bottom navigator that jumps between prototype screens — mirrors the
 * "pill v2" in the design source. Active state is derived from the pathname.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { useApp } from "@/lib/store";
import { common } from "@/lib/i18n/common";

interface PillDef {
  labelKey: keyof typeof common.en;
  href: string;
  active: (path: string) => boolean;
}

const PILLS: PillDef[] = [
  { labelKey: "navLanding", href: "/", active: (p) => p === "/" },
  {
    labelKey: "navDirections",
    href: "/directions",
    active: (p) => p.startsWith("/directions"),
  },

  { labelKey: "navHire", href: "/hire", active: (p) => p.startsWith("/hire") },

  // {
  //   labelKey: "navDashboard",
  //   href: "/dashboard",
  //   active: (p) => p === "/dashboard" || p.startsWith("/dashboard/channels"),
  // },
  {
    labelKey: "navFleet",
    href: "/dashboard/fleet",
    active: (p) => p.startsWith("/dashboard/fleet"),
  },
  {
    labelKey: "navBilling",
    href: "/dashboard/billing",
    active: (p) => p.startsWith("/dashboard/billing"),
  },
  { labelKey: "navPayment", href: "/payment", active: (p) => p.startsWith("/payment") },
  { labelKey: "navSignIn", href: "/auth", active: (p) => p.startsWith("/auth") },
];

export function DemoPill() {
  const pathname = usePathname() || "/";
  const { lang, user } = useApp();
  const t = common[lang];

  return (
    <div
      className="ark-scroll"
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 99,
        display: "flex",
        gap: 2,
        background: c.glass,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: `1px solid ${c.borderStrong}`,
        padding: 4,
        boxShadow: "0 8px 28px rgba(0,0,0,.5)",
        maxWidth: "calc(100vw - 16px)",
        // Wraps to multiple rows on desktop; on mobile becomes a single
        // horizontally scrollable row so it never stacks over page content.
        flexWrap: r.pillWrap,
        overflowX: r.pillOverflow,
        justifyContent: "center",
        borderRadius: r.radiusLg,
      }}
    >
      {PILLS.map((p) => {
        const isAuthPill = p.labelKey === "navSignIn";
        const showAccount = isAuthPill && Boolean(user);
        const href = showAccount ? "/dashboard/account" : p.href;
        const labelKey = showAccount ? "navAccount" : p.labelKey;
        const on = showAccount ? pathname.startsWith("/dashboard/account") : p.active(pathname);
        return (
          <Link
            key={p.labelKey}
            href={href}
            style={{
              background: on ? c.lime : "transparent",
              color: on ? c.ink : c.muted,
              border: "none",
              padding: r.pillPad,
              fontFamily: font.mono,
              fontSize: r.pillFs,
              letterSpacing: ".04em",
              cursor: "pointer",
              textDecoration: "none",
              whiteSpace: "nowrap",
              flex: "0 0 auto",
              borderRadius: r.radiusSm,
            }}
          >
            {t[labelKey]}
          </Link>
        );
      })}
    </div>
  );
}
