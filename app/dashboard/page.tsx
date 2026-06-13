"use client";

import { useRouter } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { overviewFeed } from "@/lib/data";
import { useApp } from "@/lib/store";
import { HoverDiv } from "@/components/ui";

export default function OverviewPage() {
  const router = useRouter();
  const { agents, isPaused } = useApp();

  const roster = agents.map((a) => {
    const paused = isPaused(a.id);
    return {
      id: a.id,
      hue: a.hue,
      mono: a.mono,
      name: a.name,
      role: a.role,
      line: paused ? "Paused by you — state preserved, resume anytime" : a.line,
      st: paused ? "PAUSED" : a.st,
      sc: paused ? c.amber : a.sc,
    };
  });

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
          Good morning, Wei
        </h2>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: c.faint }}>
          SAT JUN 13 · ALL SYSTEMS NOMINAL
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
        }}
      >
        <div style={{ background: c.panel, padding: 20 }}>
          <div style={{ fontFamily: font.mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>
            ACTIVE AGENTS
          </div>
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 30 }}>4</div>
        </div>
        <div style={{ background: c.panel, padding: 20 }}>
          <div style={{ fontFamily: font.mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>
            TASKS THIS WEEK
          </div>
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 30 }}>
            87 <span style={{ fontSize: 14, color: c.green }}>▲ 12</span>
          </div>
        </div>
        <div style={{ background: c.panel, padding: 20 }}>
          <div style={{ fontFamily: font.mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>
            CREDITS USED
          </div>
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 30 }}>18,420</div>
        </div>
        <div style={{ background: c.panel, padding: 20 }}>
          <div style={{ fontFamily: font.mono, fontSize: 11, color: c.faint, marginBottom: 8 }}>
            NEEDS YOUR REVIEW
          </div>
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 30, color: c.amber }}>
            2
          </div>
        </div>
      </div>

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
            YOUR ROSTER
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {roster.map((a) => (
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
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    background: a.hue,
                    color: c.bg,
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
                  <div style={{ fontSize: 12.5, color: c.faint, marginTop: 2 }}>{a.line}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: a.sc,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      color: a.sc,
                      letterSpacing: ".06em",
                    }}
                  >
                    {a.st}
                  </span>
                </div>
              </HoverDiv>
            ))}
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
            LIVE ACTIVITY
          </div>
          <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: "6px 0" }}>
            {overviewFeed.map((f, i) => (
              <div
                key={i}
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
                  {f.time}
                </span>
                <span style={{ fontSize: 13.5, color: c.text2 }}>
                  <span style={{ color: f.hue }}>{f.who}</span> {f.txt}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
