"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useApp } from "@/lib/store";
import { common } from "@/lib/i18n/common";
import { dashLayout } from "@/lib/i18n/dashboard-layout";

const navDefs = [
  { id: "overview", key: "navOverview", icon: "◫", href: "/dashboard" },
  { id: "agents", key: "navFleet", icon: "◉", href: "/dashboard/fleet" },
  { id: "channels", key: "navChannels", icon: "⌁", href: "/dashboard/channels" },
  { id: "billing", key: "navBilling", icon: "▤", href: "/dashboard/billing" },
] as const;

const fmt = (n: number) => n.toLocaleString("en-US");

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, workspace, authReady, logout, lang } = useApp();
  const t = dashLayout[lang];
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Auth gate: bounce to /auth once we know there is no session.
  useEffect(() => {
    if (authReady && !user) router.replace("/auth");
  }, [authReady, user, router]);

  function isActive(id: string): boolean {
    if (id === "overview") return pathname === "/dashboard";
    if (id === "agents") return pathname.startsWith("/dashboard/fleet");
    if (id === "channels") return pathname.startsWith("/dashboard/channels");
    if (id === "billing") return pathname.startsWith("/dashboard/billing");
    return false;
  }
  function go(href: string) {
    router.push(href);
    setDrawerOpen(false);
  }
  async function doLogout() {
    await logout();
    router.replace("/auth");
  }

  if (!authReady) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          color: c.muted,
          fontFamily: font.mono,
          fontSize: 13,
        }}
      >
        {common[lang].loading}
      </div>
    );
  }
  if (!user) return null; // redirect effect will navigate away

  const creditsUsed = workspace?.creditsUsed ?? 0;
  const creditsIncluded = workspace?.creditsIncluded ?? 0;
  const pct = creditsIncluded > 0 ? Math.min(100, Math.round((creditsUsed / creditsIncluded) * 100)) : 0;
  const resetDays = workspace?.cycleResetsAt
    ? Math.max(0, Math.ceil((new Date(workspace.cycleResetsAt).getTime() - Date.now()) / 86400_000))
    : null;
  const initial = (user.name || "?").slice(0, 1).toUpperCase();
  const creditsChip = `${fmt(creditsUsed)} / ${creditsIncluded >= 1000 ? Math.round(creditsIncluded / 1000) + "k" : creditsIncluded}`;

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: r.dashGrid }}>
      {drawerOpen && <div className="r-scrim" onClick={() => setDrawerOpen(false)} />}

      <div
        className={`r-dash-sidebar${drawerOpen ? " open" : ""}`}
        style={{
          borderRight: `1px solid ${c.line}`,
          background: c.panel,
          display: "flex",
          flexDirection: "column",
          position: r.sidebarPos,
          top: 0,
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "18px 20px",
            borderBottom: `1px solid ${c.line}`,
            cursor: "pointer",
            textDecoration: "none",
            color: c.text,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              background: c.lime,
              display: "grid",
              placeItems: "center",
              fontFamily: font.space,
              fontWeight: 700,
              color: c.ink,
              fontSize: 14,
            }}
          >
            A
          </div>
          <span style={{ fontFamily: font.mono, fontSize: 13.5, fontWeight: 500, letterSpacing: ".04em" }}>
            ARK_AGENT
          </span>
        </Link>

        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${c.line}` }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 10.5,
              letterSpacing: ".12em",
              color: c.faint,
              marginBottom: 4,
            }}
          >
            {t.workspace}
          </div>
          <div style={{ fontSize: 14, color: c.text2 }}>{workspace?.name ?? t.workspaceFallback}</div>
        </div>

        <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          {navDefs.map((n) => {
            const on = isActive(n.id);
            return (
              <button
                key={n.id}
                onClick={() => go(n.href)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: on ? c.navSelected : "transparent",
                  color: on ? c.text : c.muted,
                  border: "none",
                  padding: "10px 12px",
                  fontSize: 14,
                  fontFamily: font.sans,
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <span style={{ fontFamily: font.mono, fontSize: 12, color: on ? c.accent : c.faint }}>
                  {n.icon}
                </span>
                {t[n.key]}
              </button>
            );
          })}
        </div>

        <Btn
          onClick={() => go("/hire")}
          hoverStyle={{ borderColor: c.accent }}
          style={{
            margin: "8px 12px",
            border: `1px dashed ${c.borderStrong}`,
            background: "transparent",
            color: c.accent,
            padding: 11,
            fontFamily: font.space,
            fontWeight: 500,
            fontSize: 13.5,
            cursor: "pointer",
          }}
        >
          {t.hireNew}
        </Btn>

        <div style={{ marginTop: "auto", padding: "18px 20px", borderTop: `1px solid ${c.line}` }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: font.mono,
              fontSize: 11,
              color: c.faint,
              marginBottom: 8,
            }}
          >
            <span>{t.credits}</span>
            <span style={{ color: c.text2 }}>
              {fmt(creditsUsed)} / {fmt(creditsIncluded)}
            </span>
          </div>
          <div style={{ height: 4, background: c.line }}>
            <div style={{ height: 4, width: `${pct}%`, background: c.lime }} />
          </div>
          <div style={{ fontSize: 11.5, color: c.faint, marginTop: 8 }}>
            {resetDays !== null ? t.resetsIn(resetDays) : t.usageThisCycle} ·{" "}
            <span style={{ color: c.muted }}>{t.overage}</span>
          </div>
          <LanguageSwitcher compact={false} style={{ marginTop: 16 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: c.borderStrong,
                display: "grid",
                placeItems: "center",
                fontSize: 12,
                fontFamily: font.space,
                fontWeight: 700,
                color: c.text,
              }}
            >
              {initial}
            </div>
            <div
              style={{
                fontSize: 13,
                color: c.text2,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user.name}
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={doLogout}
                title={t.signOut}
                aria-label={t.signOut}
                style={{
                  width: 30,
                  height: 30,
                  display: "grid",
                  placeItems: "center",
                  background: "transparent",
                  border: `1px solid ${c.border}`,
                  color: c.muted,
                  cursor: "pointer",
                  fontFamily: font.mono,
                  fontSize: 13,
                }}
              >
                ⎋
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: r.mobileNav,
            position: "sticky",
            top: 0,
            zIndex: 40,
            alignItems: "center",
            gap: 12,
            height: 56,
            padding: "0 16px",
            background: c.panel,
            borderBottom: `1px solid ${c.line}`,
          }}
        >
          <button
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
            style={{
              width: 40,
              height: 40,
              display: "grid",
              placeItems: "center",
              background: "transparent",
              border: `1px solid ${c.border}`,
              color: c.text,
              fontFamily: font.mono,
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            ≡
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 22,
                height: 22,
                background: c.lime,
                display: "grid",
                placeItems: "center",
                fontFamily: font.space,
                fontWeight: 700,
                color: c.ink,
                fontSize: 13,
              }}
            >
              A
            </div>
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: ".04em",
                color: c.text,
              }}
            >
              ARK_AGENT
            </span>
          </div>
          <span style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 11.5, color: c.muted }}>
            {creditsChip}
          </span>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
        {children}
      </div>
    </div>
  );
}
