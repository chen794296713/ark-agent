"use client";

import { useRouter } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { useApp } from "@/lib/store";
import { directions } from "@/lib/i18n/directions";

export default function DirectionsPage() {
  const router = useRouter();
  const { lang } = useApp();
  const t = directions[lang];

  return (
    <div
      data-screen-label="Design directions"
      style={{
        minHeight: "100vh",
        background: c.dirBg,
        color: c.dirInk,
        padding: `${r.pagePxWide} ${r.pagePxWide} 140px`,
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <button
          onClick={() => router.push("/")}
          style={{
            background: "none",
            border: "none",
            color: c.dirMuted,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: font.sans,
            padding: 0,
            marginBottom: 24,
          }}
        >
          {t.back}
        </button>
        <h2
          style={{
            fontFamily: font.space,
            fontWeight: 700,
            fontSize: "clamp(24px, 6vw, 32px)",
            letterSpacing: "-.02em",
            margin: "0 0 6px",
          }}
        >
          {t.pageTitle}
        </h2>
        <p style={{ color: c.dirMuted, margin: "0 0 40px", maxWidth: 640 }}>
          {t.pageIntro}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: r.col3,
            gap: r.gapSm,
            alignItems: "start",
          }}
        >
          {/* A — TERMINAL LIME */}
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 12,
                  letterSpacing: ".08em",
                }}
              >
                {t.aLabel}
              </span>
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 10.5,
                  background: c.dirInk,
                  color: c.lime,
                  padding: "3px 8px",
                }}
              >
                {t.aBadge}
              </span>
            </div>
            <div
              style={{
                background: "#fff",
                borderRadius: 8,
                padding: 12,
                boxShadow: "0 2px 12px rgba(0,0,0,.08)",
              }}
            >
              <div
                style={{
                  background: c.bg,
                  height: r.dirCardH,
                  padding: "28px 24px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 9,
                    letterSpacing: ".14em",
                    color: c.lime,
                    marginBottom: 14,
                  }}
                >
                  {t.aEyebrow}
                </div>
                <div
                  style={{
                    fontFamily: font.space,
                    fontWeight: 700,
                    fontSize: "clamp(22px, 6vw, 30px)",
                    lineHeight: 1.04,
                    letterSpacing: "-.02em",
                    color: c.text,
                  }}
                >
                  {t.aHeadline1}
                  <br />
                  <span style={{ color: c.lime }}>{t.aHeadline2}</span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: c.muted,
                    margin: "12px 0 16px",
                    maxWidth: 240,
                  }}
                >
                  {t.aSub}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <div
                    style={{
                      background: c.lime,
                      color: c.ink,
                      fontFamily: font.space,
                      fontWeight: 700,
                      fontSize: 10,
                      padding: "8px 12px",
                    }}
                  >
                    {t.aCtaPrimary}
                  </div>
                  <div
                    style={{
                      border: `1px solid ${c.borderStrong}`,
                      color: c.text,
                      fontFamily: font.space,
                      fontSize: 10,
                      padding: "8px 12px",
                    }}
                  >
                    {t.aCtaSecondary}
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 18,
                    border: `1px solid ${c.border}`,
                    background: c.panel,
                    padding: "10px 12px",
                    fontFamily: font.mono,
                    fontSize: 9,
                    color: c.text2,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <span style={{ color: c.faint }}>09:41</span>
                    <span>{t.aLog1}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <span style={{ color: c.faint }}>09:38</span>
                    <span>{t.aLog2}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <span style={{ color: c.green }}>●</span>
                    <span style={{ color: c.green }}>{t.aStatus}</span>
                  </div>
                </div>
              </div>
            </div>
            <p
              style={{
                fontSize: 13,
                color: c.dirMuted,
                margin: "12px 4px 0",
              }}
            >
              {t.aCaption}
            </p>
          </div>

          {/* B — IVORY STUDIO */}
          <div>
            <div style={{ marginBottom: 10 }}>
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 12,
                  letterSpacing: ".08em",
                }}
              >
                {t.bLabel}
              </span>
            </div>
            <div
              style={{
                background: "#fff",
                borderRadius: 8,
                padding: 12,
                boxShadow: "0 2px 12px rgba(0,0,0,.08)",
              }}
            >
              <div
                style={{
                  background: c.ivory,
                  height: r.dirCardH,
                  padding: "28px 24px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 9,
                    letterSpacing: ".14em",
                    color: "#A89F90",
                    marginBottom: 14,
                  }}
                >
                  {t.bEyebrow}
                </div>
                <div
                  style={{
                    fontFamily: font.serif,
                    fontStyle: "italic",
                    fontWeight: 500,
                    fontSize: "clamp(22px, 6vw, 31px)",
                    lineHeight: 1.08,
                    color: c.ivoryInk,
                  }}
                >
                  {t.bHeadline1}
                  <br />
                  {t.bHeadline2}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#7A7264",
                    margin: "12px 0 16px",
                    maxWidth: 230,
                    fontFamily: font.sans,
                  }}
                >
                  {t.bSub}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <div
                    style={{
                      background: c.ivoryInk,
                      color: c.ivory,
                      fontSize: 10,
                      padding: "8px 14px",
                      borderRadius: 99,
                      fontFamily: font.sans,
                    }}
                  >
                    {t.bCtaPrimary}
                  </div>
                  <div
                    style={{
                      border: "1px solid #D8D0C2",
                      color: c.ivoryInk,
                      fontSize: 10,
                      padding: "8px 14px",
                      borderRadius: 99,
                      fontFamily: font.sans,
                    }}
                  >
                    {t.bCtaSecondary}
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 18,
                    background: "#FFFFFF",
                    border: "1px solid #E8E2D6",
                    borderRadius: 10,
                    padding: 12,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    boxShadow: "0 4px 14px rgba(28,26,22,.06)",
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: "#C96F4A",
                      color: "#fff",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 12,
                      fontFamily: font.sans,
                      fontWeight: 600,
                    }}
                  >
                    N
                  </div>
                  <div style={{ fontFamily: font.sans }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: c.ivoryInk,
                      }}
                    >
                      {t.bAgentName}
                    </div>
                    <div style={{ fontSize: 9.5, color: "#A89F90" }}>
                      {t.bAgentNote}
                    </div>
                  </div>
                  <div
                    style={{
                      marginLeft: "auto",
                      fontSize: 9,
                      color: "#3E8E5A",
                      fontFamily: font.mono,
                    }}
                  >
                    {t.bAgentStatus}
                  </div>
                </div>
              </div>
            </div>
            <p
              style={{
                fontSize: 13,
                color: c.dirMuted,
                margin: "12px 4px 0",
              }}
            >
              {t.bCaption}
            </p>
          </div>

          {/* C — MIDNIGHT CONSOLE */}
          <div>
            <div style={{ marginBottom: 10 }}>
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 12,
                  letterSpacing: ".08em",
                }}
              >
                {t.cLabel}
              </span>
            </div>
            <div
              style={{
                background: "#fff",
                borderRadius: 8,
                padding: 12,
                boxShadow: "0 2px 12px rgba(0,0,0,.08)",
              }}
            >
              <div
                style={{
                  background: c.midnight,
                  height: r.dirCardH,
                  padding: "28px 24px",
                  overflow: "hidden",
                  backgroundImage:
                    "radial-gradient(circle at 80% 10%, rgba(79,124,255,.18), transparent 55%)",
                }}
              >
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 9,
                    letterSpacing: ".14em",
                    color: c.midnightBlue,
                    marginBottom: 14,
                  }}
                >
                  {t.cEyebrow}
                </div>
                <div
                  style={{
                    fontFamily: font.space,
                    fontWeight: 700,
                    fontSize: "clamp(22px, 6vw, 30px)",
                    lineHeight: 1.05,
                    letterSpacing: "-.02em",
                    color: "#EAF0FF",
                  }}
                >
                  {t.cHeadline1}
                  <br />
                  {t.cHeadline2}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#8B97B8",
                    margin: "12px 0 16px",
                    maxWidth: 240,
                  }}
                >
                  {t.cSub}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <div
                    style={{
                      background: c.midnightBlue,
                      color: "#fff",
                      fontFamily: font.space,
                      fontWeight: 700,
                      fontSize: 10,
                      padding: "8px 12px",
                      borderRadius: 6,
                    }}
                  >
                    {t.cCtaPrimary}
                  </div>
                  <div
                    style={{
                      border: "1px solid #243154",
                      color: "#EAF0FF",
                      fontFamily: font.space,
                      fontSize: 10,
                      padding: "8px 12px",
                      borderRadius: 6,
                    }}
                  >
                    {t.cCtaSecondary}
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gridTemplateColumns: r.split,
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      border: "1px solid #1B2747",
                      background: "rgba(16,24,48,.6)",
                      borderRadius: 8,
                      padding: 10,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 8,
                        color: "#5A6B96",
                      }}
                    >
                      {t.cStatActiveLabel}
                    </div>
                    <div
                      style={{
                        fontFamily: font.space,
                        fontWeight: 700,
                        fontSize: 18,
                        color: "#EAF0FF",
                      }}
                    >
                      4
                    </div>
                  </div>
                  <div
                    style={{
                      border: "1px solid #1B2747",
                      background: "rgba(16,24,48,.6)",
                      borderRadius: 8,
                      padding: 10,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 8,
                        color: "#5A6B96",
                      }}
                    >
                      {t.cStatTasksLabel}
                    </div>
                    <div
                      style={{
                        fontFamily: font.space,
                        fontWeight: 700,
                        fontSize: 18,
                        color: c.midnightBlue,
                      }}
                    >
                      87
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p
              style={{
                fontSize: 13,
                color: c.dirMuted,
                margin: "12px 4px 0",
              }}
            >
              {t.cCaption}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
