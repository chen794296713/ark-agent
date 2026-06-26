"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { useApp } from "@/lib/store";
import { api, ApiError, type DashboardDTO } from "@/lib/client-api";
import { statusDisplay, clock } from "@/lib/agent-display";
import { dashboard } from "@/lib/i18n/dashboard";
import { HoverDiv } from "@/components/ui";

export default function OverviewPage() {
  const router = useRouter();
  const { user, lang } = useApp();
  const t = dashboard[lang];

  const [data, setData] = useState<DashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await api.dashboard();
        if (alive) setData(d);
      } catch (e) {
        if (alive) setError(e instanceof ApiError ? e.message : t.loadError);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? "there";
  const todayLabel = new Date()
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();

  return (
    <div style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 28,
        }}
      >
        <h2
          style={{
            fontFamily: font.space,
            fontWeight: 700,
            fontSize: "clamp(20px, 4.5vw, 26px)",
            letterSpacing: "-.01em",
            margin: 0,
          }}
        >
          {t.greeting(firstName)}
        </h2>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: c.faint }}>
          {todayLabel} · {t.systemsNominal}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: r.col4,
          gap: 1,
          background: c.line,
          border: `1px solid ${c.line}`,
          marginBottom: 32,
          borderRadius: r.radiusMd,
          overflow: "hidden",
        }}
      >
        <div style={{ background: c.panel, padding: 20 }}>
          <div style={{ fontFamily: font.mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>
            {t.statActiveAgents}
          </div>
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 30 }}>
            {data ? data.stats.activeAgents : "—"}
          </div>
        </div>
        <div style={{ background: c.panel, padding: 20 }}>
          <div style={{ fontFamily: font.mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>
            {t.statTasksThisWeek}
          </div>
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 30 }}>
            {data ? data.stats.tasksThisWeek : "—"}
          </div>
        </div>
        <div style={{ background: c.panel, padding: 20 }}>
          <div style={{ fontFamily: font.mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>
            {t.statCreditsUsed}
          </div>
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 30 }}>
            {data ? data.stats.creditsUsed.toLocaleString() : "—"}
          </div>
        </div>
        <div style={{ background: c.panel, padding: 20 }}>
          <div style={{ fontFamily: font.mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>
            {t.statNeedsReview}
          </div>
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 30, color: c.amber }}>
            {data ? data.stats.needsReview : "—"}
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            border: `1px solid ${c.redBorder}`,
            background: c.redWash,
            color: c.red,
            padding: "14px 18px",
            fontSize: 13.5,
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: r.overview,
          gap: r.gapMd,
          alignItems: "start",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: ".12em",
              color: c.faint,
              marginBottom: 14,
            }}
          >
            {t.rosterHeading}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loading && (
              <div
                style={{
                  border: `1px solid ${c.border}`,
                  background: c.panel,
                  padding: "18px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  color: c.faint,
                }}
              >
                {t.loadingRoster}
              </div>
            )}

            {!loading && data && data.agents.length === 0 && (
              <div
                style={{
                  border: `1px solid ${c.border}`,
                  background: c.panel,
                  padding: "28px 18px",
                  textAlign: "center",
                  borderRadius: r.radiusMd,
                }}
              >
                <div style={{ fontSize: 13.5, color: c.muted, marginBottom: 14 }}>
                  {t.noAgents}
                </div>
                <Link
                  href="/hire"
                  style={{
                    display: "inline-block",
                    background: c.lime,
                    color: c.ink,
                    fontFamily: font.space,
                    fontWeight: 700,
                    fontSize: 13.5,
                    padding: "10px 18px",
                    textDecoration: "none",
                    borderRadius: r.radiusSm,
                  }}
                >
                  {t.hireFirstAgent}
                </Link>
              </div>
            )}

            {!loading &&
              data &&
              data.agents.map((a) => {
                const sd = statusDisplay(a.status);
                return (
                  <HoverDiv
                    key={a.id}
                    onClick={() => router.push(`/dashboard/fleet/${a.id}`)}
                    hoverStyle={{ borderColor: c.borderMute }}
                    style={{
                      border: `1px solid ${c.border}`,
                      background: c.panel,
                      padding: "16px 18px",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      cursor: "pointer",
                      borderRadius: r.radiusSm,
                    }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        background: a.hue ?? c.accent,
                        color: c.ink,
                        display: "grid",
                        placeItems: "center",
                        fontFamily: font.space,
                        fontWeight: 700,
                        fontSize: 16,
                      }}
                    >
                      {a.mono}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 15.5 }}>
                        {a.name}{" "}
                        <span style={{ fontWeight: 400, fontSize: 13, color: c.muted }}>
                          · {a.role}
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, color: c.faint, marginTop: 2 }}>
                        {a.line ?? "—"}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: sd.color,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: font.mono,
                          fontSize: 11,
                          color: sd.color,
                          letterSpacing: ".06em",
                        }}
                      >
                        {sd.label}
                      </span>
                    </div>
                  </HoverDiv>
                );
              })}
          </div>
        </div>

        <div>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: ".12em",
              color: c.faint,
              marginBottom: 14,
            }}
          >
            {t.activityHeading}
          </div>
          <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: "6px 0", borderRadius: r.radiusMd, overflow: "hidden" }}>
            {loading && (
              <div
                style={{
                  padding: "11px 18px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  color: c.faint,
                }}
              >
                {t.loadingActivity}
              </div>
            )}

            {!loading && data && data.activity.length === 0 && (
              <div
                style={{
                  padding: "11px 18px",
                  fontSize: 13.5,
                  color: c.muted,
                }}
              >
                {t.noActivity}
              </div>
            )}

            {!loading &&
              data &&
              data.activity.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "11px 18px",
                    borderBottom: `1px solid ${c.lineSoft}`,
                    alignItems: "baseline",
                  }}
                >
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      color: c.faint,
                      flexShrink: 0,
                    }}
                  >
                    {clock(f.occurredAt)}
                  </span>
                  <span style={{ fontSize: 13.5, color: c.text2 }}>
                    <span style={{ color: f.hue ?? c.accent }}>{f.who}</span> {f.text}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
