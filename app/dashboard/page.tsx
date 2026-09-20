"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { c, font, r } from "@/lib/theme";
import { useApp } from "@/lib/store";
import { api, ApiError, type DashboardDTO } from "@/lib/client-api";
import { statusDisplay, clock } from "@/lib/agent-display";
import { dashboard } from "@/lib/i18n/dashboard";
import { AgentAvatar } from "@/components/AgentAvatar";

export default function OverviewPage() {
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
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 32,
        }}
      >
        <h1
          style={{
            fontFamily: font.space,
            fontWeight: 650,
            fontSize: 32,
            letterSpacing: "-.025em",
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          {t.greeting(firstName)}
        </h1>
        <span style={{ fontFamily: font.sans, fontSize: 13, color: c.muted }}>
          {todayLabel}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 16,
          borderTop: `1px solid ${c.line}`,
          borderBottom: `1px solid ${c.line}`,
          marginBottom: 36,
          padding: "24px 0",
        }}
      >
        <div>
          <div style={{ fontFamily: font.sans, fontSize: 12, color: c.faint, marginBottom: 8 }}>
            {t.statActiveAgents}
          </div>
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 30 }}>
            {data ? data.stats.activeAgents : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: font.sans, fontSize: 12, color: c.faint, marginBottom: 8 }}>
            {t.statTasksThisWeek}
          </div>
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 30 }}>
            {data ? data.stats.tasksThisWeek : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: font.sans, fontSize: 12, color: c.faint, marginBottom: 8 }}>
            {t.statCreditsUsed}
          </div>
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 30 }}>
            {data ? data.stats.creditsUsed.toLocaleString() : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: font.sans, fontSize: 12, color: c.faint, marginBottom: 8 }}>
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
          <h2
            style={{
              fontFamily: font.space,
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: "-.015em",
              color: c.text,
              margin: "0 0 16px",
            }}
          >
            {t.rosterHeading}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {loading && (
              <div
                style={{
                  border: `1px solid ${c.border}`,
                  background: c.panel,
                  padding: "18px",
                  fontFamily: font.sans,
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
                    fontFamily: font.sans,
                    fontWeight: 600,
                    fontSize: 14,
                    padding: "12px 22px",
                    textDecoration: "none",
                    borderRadius: 999,
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
                  <Link
                    key={a.id}
                    href={`/dashboard/fleet/${a.id}`}
                    style={{
                      borderBottom: `1px solid ${c.line}`,
                      padding: "18px 0",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      cursor: "pointer",
                      color: c.text,
                      textDecoration: "none",
                      flexWrap: "wrap",
                    }}
                  >
                    <AgentAvatar roleId={a.roleId} name={a.name} mono={a.mono} size={48} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: font.space, fontWeight: 600, fontSize: 18 }}>{a.name}</div>
                      <div style={{ fontSize: 13, color: c.muted, marginTop: 2 }}>{a.role}</div>
                      <div style={{ fontSize: 13, color: c.muted, marginTop: 5, lineHeight: 1.5 }}>
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
                          fontFamily: font.sans,
                          fontSize: 12,
                          color: sd.color,
                          letterSpacing: "normal",
                        }}
                      >
                        {sd.label}
                      </span>
                    </div>
                  </Link>
                );
              })}
          </div>
        </div>

        <div>
          <h2
            style={{
              fontFamily: font.space,
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: "-.015em",
              color: c.text,
              margin: "0 0 16px",
            }}
          >
            {t.activityHeading}
          </h2>
          <div style={{ borderTop: `1px solid ${c.line}`, padding: "6px 0" }}>
            {loading && (
              <div
                style={{
                  padding: "11px 18px",
                  fontFamily: font.sans,
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
                      fontFamily: font.sans,
                      fontSize: 12,
                      color: c.faint,
                      flexShrink: 0,
                    }}
                  >
                    {clock(f.occurredAt)}
                  </span>
                  <span style={{ fontSize: 13.5, color: c.text2 }}>
                    <span
                        // The role hue is a fixed brand FILL, not a text color:
                        // at 13.5px it reads 1.06:1 on light --c-panel. Show it
                        // as a swatch and give the name a themed ink instead.
                        aria-hidden
                        style={{
                          display: "inline-block",
                          width: 7,
                          height: 7,
                          marginRight: 6,
                          background: f.hue ?? c.accent,
                          verticalAlign: "middle",
                        }}
                      />
                      <span style={{ color: c.accent }}>{f.who}</span> {f.text}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
