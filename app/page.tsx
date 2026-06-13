"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { dict } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { landingRoles, heroFeed } from "@/lib/data";
import { Btn, HoverDiv } from "@/components/ui";
import { MobileNav } from "@/components/MobileNav";

export default function LandingPage() {
  const router = useRouter();
  const { lang, setLang } = useApp();
  const t = dict[lang];

  const [tick, setTick] = useState(0);
  const [approved, setApproved] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 2800);
    return () => clearInterval(id);
  }, []);

  const len = heroFeed.length;
  const off = tick % len;
  const feedLines = [0, 1, 2, 3].map((i) => heroFeed[(off + i) % len]);

  const langBg = (l: typeof lang) => (lang === l ? c.lime : "transparent");
  const langC = (l: typeof lang) => (lang === l ? "#0B0D10" : c.muted);

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Nav */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(11,13,16,.85)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${c.line}`,
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: `0 ${r.pagePx}`,
            height: 64,
            display: "flex",
            alignItems: "center",
            gap: 32,
          }}
        >
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
              }}
            >
              ARK_AGENT
            </span>
          </div>
          <div
            style={{
              display: r.desktopNav,
              gap: 26,
              fontSize: 14,
              color: c.muted,
              marginLeft: 12,
            }}
          >
            <a href="#roles" style={{ color: c.muted, textDecoration: "none" }}>
              {t.navAgents}
            </a>
            <a href="#how" style={{ color: c.muted, textDecoration: "none" }}>
              {t.navHow}
            </a>
            <a href="#engines" style={{ color: c.muted, textDecoration: "none" }}>
              {t.navEngines}
            </a>
            <a href="#pricing" style={{ color: c.muted, textDecoration: "none" }}>
              {t.navPricing}
            </a>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: r.desktopNav,
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                border: `1px solid ${c.border}`,
                fontFamily: font.mono,
                fontSize: 12,
              }}
            >
              <button
                onClick={() => setLang("en")}
                style={{
                  border: "none",
                  cursor: "pointer",
                  padding: "6px 12px",
                  background: langBg("en"),
                  color: langC("en"),
                }}
              >
                EN
              </button>
              <button
                onClick={() => setLang("zh")}
                style={{
                  border: "none",
                  cursor: "pointer",
                  padding: "6px 12px",
                  background: langBg("zh"),
                  color: langC("zh"),
                }}
              >
                简
              </button>
              <button
                onClick={() => setLang("zht")}
                style={{
                  border: "none",
                  cursor: "pointer",
                  padding: "6px 12px",
                  background: langBg("zht"),
                  color: langC("zht"),
                }}
              >
                繁
              </button>
            </div>
            <button
              onClick={() => router.push("/auth")}
              style={{
                background: "none",
                border: "none",
                color: c.muted,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: font.sans,
              }}
            >
              {t.signin}
            </button>
            <Btn
              onClick={() => router.push("/hire")}
              style={{
                background: c.lime,
                color: c.ink,
                border: "none",
                padding: "9px 18px",
                fontFamily: font.space,
                fontWeight: 500,
                fontSize: 14,
                cursor: "pointer",
              }}
              hoverStyle={{ background: c.limeHover }}
            >
              {t.hire}
            </Btn>
          </div>
          {/* Mobile hamburger — shown only ≤640px via --r-mobile-nav */}
          <button
            aria-label="Open menu"
            onClick={() => setNavOpen(true)}
            style={{
              display: r.mobileNav,
              marginLeft: "auto",
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: `1px solid ${c.border}`,
              color: c.text,
              fontFamily: font.mono,
              fontSize: 20,
              cursor: "pointer",
            }}
          >
            ≡
          </button>
        </div>
      </div>

      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} />

      {/* Hero */}
      <div
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
          borderBottom: `1px solid ${c.line}`,
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: `${r.heroPy} ${r.pagePx} 96px`,
            display: "grid",
            gridTemplateColumns: r.hero,
            gap: r.gapLg,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                letterSpacing: ".14em",
                color: c.lime,
                marginBottom: 24,
              }}
            >
              {t.eyebrow} <span style={{ color: c.faint }}>/ IAGENT.CC · ARKAGENT.AI</span>
            </div>
            <h1
              style={{
                fontFamily: font.space,
                fontWeight: 700,
                fontSize: "clamp(48px,5.6vw,76px)",
                lineHeight: 1.02,
                letterSpacing: "-.03em",
                margin: "0 0 28px",
              }}
            >
              {t.heroT1}
              <br />
              <span style={{ color: c.lime }}>{t.heroT2}</span>
            </h1>
            <p
              style={{
                fontSize: 19,
                color: c.muted,
                maxWidth: 540,
                margin: "0 0 36px",
                textWrap: "pretty",
              }}
            >
              {t.heroSub}
            </p>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <Btn
                onClick={() => router.push("/hire")}
                style={{
                  background: c.lime,
                  color: c.ink,
                  border: "none",
                  padding: "16px 28px",
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: 16,
                  cursor: "pointer",
                }}
                hoverStyle={{ background: c.limeHover }}
              >
                {t.cta1} →
              </Btn>
              <Btn
                onClick={() => router.push("/dashboard")}
                style={{
                  background: "transparent",
                  color: c.text,
                  border: `1px solid ${c.borderStrong}`,
                  padding: "15px 28px",
                  fontFamily: font.space,
                  fontWeight: 500,
                  fontSize: 16,
                  cursor: "pointer",
                }}
                hoverStyle={{ borderColor: c.lime, color: c.lime }}
              >
                {t.cta2}
              </Btn>
            </div>
            <div
              style={{
                marginTop: 28,
                fontFamily: font.mono,
                fontSize: 12,
                color: c.faint,
              }}
            >
              {t.heroFoot}
            </div>
          </div>

          {/* Live employee card */}
          <div
            style={{
              border: `1px solid ${c.border}`,
              background: c.panel,
              boxShadow: "0 24px 60px rgba(0,0,0,.5)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "18px 20px",
                borderBottom: `1px solid ${c.line}`,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  background: c.lime,
                  color: c.ink,
                  display: "grid",
                  placeItems: "center",
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: 19,
                }}
              >
                N
              </div>
              <div>
                <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 17 }}>Nova</div>
                <div style={{ fontSize: 13, color: c.muted }}>Sales Prospector</div>
              </div>
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  border: `1px solid ${c.greenBorder}`,
                  background: c.greenWash,
                  padding: "5px 11px",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: c.green,
                    animation: "pulse 1.8s ease-in-out infinite",
                  }}
                />
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 11,
                    color: c.green,
                    letterSpacing: ".08em",
                  }}
                >
                  WORKING
                </span>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 0,
                borderBottom: `1px solid ${c.line}`,
                fontFamily: font.mono,
                fontSize: 11,
                color: c.faint,
              }}
            >
              <div style={{ padding: "10px 20px", borderRight: `1px solid ${c.line}` }}>
                ENGINE <span style={{ color: c.muted }}>OpenClaw</span>
              </div>
              <div style={{ padding: "10px 20px", borderRight: `1px solid ${c.line}` }}>
                VM <span style={{ color: c.muted }}>sgp-04</span>
              </div>
              <div style={{ padding: "10px 20px" }}>
                UPTIME <span style={{ color: c.muted }}>12d 4h</span>
              </div>
            </div>
            <div
              style={{
                padding: "18px 20px",
                fontFamily: font.mono,
                fontSize: 13,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                minHeight: 148,
              }}
            >
              {feedLines.map((f, i) => (
                <div
                  key={`${off}-${i}`}
                  style={{ display: "flex", gap: 12, animation: "riseIn .5s ease both" }}
                >
                  <span style={{ color: c.faint }}>{f.time}</span>
                  <span style={{ color: c.text2 }}>{f.txt}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ color: c.faint }}>--:--</span>
                <span
                  style={{
                    width: 8,
                    height: 15,
                    background: c.lime,
                    animation: "blink 1.1s steps(1) infinite",
                  }}
                />
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 20px",
                borderTop: `1px solid ${c.line}`,
              }}
            >
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.faint }}>CHANNELS</span>
              <span
                style={{
                  fontSize: 12,
                  border: `1px solid ${c.border}`,
                  padding: "3px 9px",
                  color: c.muted,
                }}
              >
                Telegram
              </span>
              <span
                style={{
                  fontSize: 12,
                  border: `1px solid ${c.border}`,
                  padding: "3px 9px",
                  color: c.muted,
                }}
              >
                WhatsApp
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: font.mono,
                  fontSize: 12,
                  color: c.lime,
                }}
              >
                2,180 credits this week
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Roles */}
      <div id="roles" style={{ maxWidth: 1240, margin: "0 auto", padding: `${r.sectionPy} ${r.pagePx}` }}>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            letterSpacing: ".14em",
            color: c.lime,
            marginBottom: 16,
          }}
        >
          THE ROSTER
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "clamp(16px, 4vw, 40px)",
            marginBottom: 48,
          }}
        >
          <h2
            style={{
              fontFamily: font.space,
              fontWeight: 700,
              fontSize: "clamp(28px, 6vw, 44px)",
              letterSpacing: "-.02em",
              margin: 0,
            }}
          >
            Every seat you can&apos;t fill yet.
          </h2>
          <p style={{ color: c.muted, maxWidth: 380, margin: 0, fontSize: 15 }}>
            Eight ready-made roles — or describe your own. Each agent ships with a job-specific skill
            set and learns your business from day one.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: r.col4,
            gap: 1,
            background: c.line,
            border: `1px solid ${c.line}`,
          }}
        >
          {landingRoles.map((r) => (
            <HoverDiv
              key={r.id}
              onClick={() => router.push(`/hire?role=${r.id}`)}
              style={{
                background: r.featured ? c.limeWash : c.panel,
                padding: "26px 24px",
                cursor: "pointer",
                minHeight: 190,
                display: "flex",
                flexDirection: "column",
                ...(r.featured
                  ? { outline: `1px solid ${c.limeBorder}`, outlineOffset: -1 }
                  : null),
              }}
              hoverStyle={{ background: r.featured ? c.limeWash2 : c.hover }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  background: r.hue,
                  color: c.ink,
                  display: "grid",
                  placeItems: "center",
                  fontFamily: font.space,
                  fontWeight: 700,
                }}
              >
                {r.mono}
              </div>
              <div
                style={{
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: 18,
                  margin: "16px 0 8px",
                }}
              >
                {r.name}
              </div>
              <div style={{ fontSize: 13.5, color: c.muted, flex: 1 }}>{r.long}</div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 18,
                  fontFamily: font.mono,
                  fontSize: 12,
                  color: c.faint,
                }}
              >
                <span>{r.price}</span>
                <span style={{ color: c.lime }}>HIRE →</span>
              </div>
            </HoverDiv>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div
        id="how"
        style={{
          borderTop: `1px solid ${c.line}`,
          borderBottom: `1px solid ${c.line}`,
          background: c.panel,
        }}
      >
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: `${r.sectionPy} ${r.pagePx}` }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 12,
              letterSpacing: ".14em",
              color: c.lime,
              marginBottom: 16,
            }}
          >
            HOW IT WORKS
          </div>
          <h2
            style={{
              fontFamily: font.space,
              fontWeight: 700,
              fontSize: "clamp(28px, 6vw, 44px)",
              letterSpacing: "-.02em",
              margin: "0 0 56px",
              maxWidth: 640,
            }}
          >
            Brief it like a person.
            <br />
            Deploy it like software.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: r.col3, gap: r.gapMd }}>
            <div style={{ borderTop: `1px solid ${c.borderStrong}`, paddingTop: 24 }}>
              <div
                style={{ fontFamily: font.mono, fontSize: 13, color: c.lime, marginBottom: 14 }}
              >
                01
              </div>
              <div
                style={{
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: 21,
                  marginBottom: 10,
                }}
              >
                Describe the job
              </div>
              <p style={{ color: c.muted, fontSize: 15, margin: 0 }}>
                Role, instructions, rules, first tasks, reminders. Plain language — no flowcharts to
                build, nothing to integrate.
              </p>
            </div>
            <div style={{ borderTop: `1px solid ${c.borderStrong}`, paddingTop: 24 }}>
              <div
                style={{ fontFamily: font.mono, fontSize: 13, color: c.lime, marginBottom: 14 }}
              >
                02
              </div>
              <div
                style={{
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: 21,
                  marginBottom: 10,
                }}
              >
                We spin up the machine
              </div>
              <p style={{ color: c.muted, fontSize: 15, margin: 0 }}>
                A dedicated VM boots with OpenClaw or Hermes loaded, briefed on your business and
                connected to your channels — in minutes.
              </p>
            </div>
            <div style={{ borderTop: `1px solid ${c.borderStrong}`, paddingTop: 24 }}>
              <div
                style={{ fontFamily: font.mono, fontSize: 13, color: c.lime, marginBottom: 14 }}
              >
                03
              </div>
              <div
                style={{
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: 21,
                  marginBottom: 10,
                }}
              >
                Manage from anywhere
              </div>
              <p style={{ color: c.muted, fontSize: 15, margin: 0 }}>
                Telegram, WhatsApp, WeChat, LINE or the web console. Assign tasks, review work,
                approve improvements.
              </p>
            </div>
          </div>
          <div
            style={{
              marginTop: 64,
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: c.faint,
                letterSpacing: ".1em",
              }}
            >
              ONE AGENT, EVERY CHANNEL
            </span>
            {["Telegram", "WhatsApp", "WeChat 微信", "LINE", "Slack", "Email", "Web chat"].map(
              (ch) => (
                <span
                  key={ch}
                  style={{
                    fontSize: 13,
                    border: `1px solid ${c.border}`,
                    padding: "6px 14px",
                    color: c.text2,
                  }}
                >
                  {ch}
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Engines */}
      <div id="engines" style={{ maxWidth: 1240, margin: "0 auto", padding: `${r.sectionPy} ${r.pagePx}` }}>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            letterSpacing: ".14em",
            color: c.lime,
            marginBottom: 16,
          }}
        >
          PICK YOUR ENGINE
        </div>
        <h2
          style={{
            fontFamily: font.space,
            fontWeight: 700,
            fontSize: "clamp(28px, 6vw, 44px)",
            letterSpacing: "-.02em",
            margin: "0 0 48px",
          }}
        >
          Two engines. One workforce.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: r.col3, gap: r.gapSm }}>
          <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: "32px 28px" }}>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                letterSpacing: ".12em",
                color: "#E8804F",
                marginBottom: 18,
              }}
            >
              COMMUNITY ENGINE
            </div>
            <div
              style={{
                fontFamily: font.space,
                fontWeight: 700,
                fontSize: 26,
                marginBottom: 12,
              }}
            >
              OpenClaw
            </div>
            <p style={{ color: c.muted, fontSize: 14.5, margin: "0 0 22px" }}>
              The open agent runtime. 100+ skills, every major messaging channel, and a massive
              plugin ecosystem that grows weekly.
            </p>
            <div style={{ fontFamily: font.mono, fontSize: 12, color: c.faint }}>
              BEST FOR → outreach, support,
              <br />
              channel-heavy roles
            </div>
          </div>
          <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: "32px 28px" }}>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                letterSpacing: ".12em",
                color: c.blue,
                marginBottom: 18,
              }}
            >
              PRECISION ENGINE
            </div>
            <div
              style={{
                fontFamily: font.space,
                fontWeight: 700,
                fontSize: 26,
                marginBottom: 12,
              }}
            >
              Hermes
            </div>
            <p style={{ color: c.muted, fontSize: 14.5, margin: "0 0 22px" }}>
              A deep-reasoning operator built for long-horizon work, with strict guardrails,
              approvals and a full audit trail.
            </p>
            <div style={{ fontFamily: font.mono, fontSize: 12, color: c.faint }}>
              BEST FOR → legal, finance,
              <br />
              research, OPC operations
            </div>
          </div>
          <div
            style={{
              border: `1px solid ${c.limeBorder}`,
              background: c.limeWash,
              padding: "32px 28px",
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                letterSpacing: ".12em",
                color: c.lime,
                marginBottom: 18,
              }}
            >
              RECOMMENDED
            </div>
            <div
              style={{
                fontFamily: font.space,
                fontWeight: 700,
                fontSize: 26,
                marginBottom: 12,
              }}
            >
              Auto-match
            </div>
            <p style={{ color: c.muted, fontSize: 14.5, margin: "0 0 22px" }}>
              We read the job brief and assign the engine that fits. Switch anytime — no migration,
              no downtime, same memory.
            </p>
            <div style={{ fontFamily: font.mono, fontSize: 12, color: c.faint }}>
              BEST FOR → everyone else
            </div>
          </div>
        </div>
      </div>

      {/* Learning */}
      <div style={{ borderTop: `1px solid ${c.line}`, background: c.panel }}>
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: `${r.sectionPy} ${r.pagePx}`,
            display: "grid",
            gridTemplateColumns: r.split,
            gap: 72,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                letterSpacing: ".14em",
                color: c.lime,
                marginBottom: 16,
              }}
            >
              SELF-REVIEW
            </div>
            <h2
              style={{
                fontFamily: font.space,
                fontWeight: 700,
                fontSize: "clamp(28px, 6vw, 44px)",
                letterSpacing: "-.02em",
                margin: "0 0 24px",
              }}
            >
              Agents that get better every week.
            </h2>
            <p style={{ color: c.muted, fontSize: 17, margin: "0 0 32px" }}>
              Every ArkAgent runs a scheduled self-review: what worked, what didn&apos;t, what to
              change next. It does the learning — you approve the changes.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                "Feedback loop from your replies, ratings and corrections",
                "Persistent memory of your business, tone and rules",
                "An improvement queue you approve with one tap",
              ].map((txt) => (
                <div key={txt} style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
                  <span style={{ fontFamily: font.mono, color: c.lime, fontSize: 13 }}>→</span>
                  <span style={{ color: c.text2, fontSize: 15 }}>{txt}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ border: `1px solid ${c.border}`, background: c.panelDeep, padding: 28 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 12,
                  letterSpacing: ".1em",
                  color: c.muted,
                }}
              >
                SELF-REVIEW · WEEK OF JUN 8
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    background: c.lime,
                    color: c.ink,
                    display: "grid",
                    placeItems: "center",
                    fontFamily: font.space,
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  N
                </div>
                <span style={{ fontSize: 13, color: c.text2 }}>Nova</span>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: r.col3,
                gap: 1,
                background: c.line,
                border: `1px solid ${c.line}`,
                marginBottom: 20,
              }}
            >
              <div style={{ background: c.panel, padding: 16 }}>
                <div
                  style={{ fontFamily: font.mono, fontSize: 11, color: c.faint, marginBottom: 6 }}
                >
                  REPLY RATE
                </div>
                <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 22 }}>
                  31% <span style={{ fontSize: 13, color: c.green }}>+4</span>
                </div>
              </div>
              <div style={{ background: c.panel, padding: 16 }}>
                <div
                  style={{ fontFamily: font.mono, fontSize: 11, color: c.faint, marginBottom: 6 }}
                >
                  MEETINGS
                </div>
                <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 22 }}>
                  9 <span style={{ fontSize: 13, color: c.green }}>+2</span>
                </div>
              </div>
              <div style={{ background: c.panel, padding: 16 }}>
                <div
                  style={{ fontFamily: font.mono, fontSize: 11, color: c.faint, marginBottom: 6 }}
                >
                  LEAD SCORE
                </div>
                <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 22 }}>
                  8.2<span style={{ fontSize: 13, color: c.faint }}>/10</span>
                </div>
              </div>
            </div>
            <div style={{ fontSize: 14, color: c.text2, marginBottom: 8 }}>
              “Tuesday 10–11am is the best send window for logistics ICP. Case-study openers
              outperform intro blurbs 2:1.”
            </div>
            <div style={{ fontFamily: font.mono, fontSize: 12, color: c.faint, marginBottom: 20 }}>
              LEARNED FROM 142 INTERACTIONS
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                border: `1px solid ${c.border}`,
                padding: "14px 16px",
              }}
            >
              <div>
                <div style={{ fontSize: 14, color: c.text }}>
                  Queued change: shorten follow-up #2 to three lines
                </div>
                <div
                  style={{ fontFamily: font.mono, fontSize: 11, color: c.faint, marginTop: 3 }}
                >
                  EXPECTED IMPACT +6% REPLY RATE
                </div>
              </div>
              <button
                onClick={() => setApproved(true)}
                style={{
                  border: `1px solid ${c.limeBorder}`,
                  background: approved ? c.limeWash : "transparent",
                  color: c.lime,
                  padding: "9px 16px",
                  fontFamily: font.space,
                  fontWeight: 500,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {approved ? "✓ Approved" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div id="pricing" style={{ maxWidth: 1240, margin: "0 auto", padding: `${r.sectionPy} ${r.pagePx}` }}>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            letterSpacing: ".14em",
            color: c.lime,
            marginBottom: 16,
          }}
        >
          PRICING
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "clamp(16px, 4vw, 40px)",
            marginBottom: 48,
          }}
        >
          <h2
            style={{
              fontFamily: font.space,
              fontWeight: 700,
              fontSize: "clamp(28px, 6vw, 44px)",
              letterSpacing: "-.02em",
              margin: 0,
            }}
          >
            Pay like payroll.
            <br />
            Scale like software.
          </h2>
          <p style={{ color: c.muted, maxWidth: 380, margin: 0, fontSize: 15 }}>
            Per-agent monthly plans with included credits. Usage beyond the allowance is metered at
            $2 per 1,000 credits.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: r.col3,
            gap: r.gapSm,
            alignItems: "stretch",
          }}
        >
          {/* Associate */}
          <div
            style={{
              border: `1px solid ${c.border}`,
              background: c.panel,
              padding: "32px 28px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 22 }}>Associate</div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: c.faint,
                margin: "4px 0 24px",
              }}
            >
              YOUR FIRST HIRE
            </div>
            <div
              style={{
                fontFamily: font.space,
                fontWeight: 700,
                fontSize: "clamp(30px, 9vw, 44px)",
                letterSpacing: "-.02em",
              }}
            >
              $49
              <span style={{ fontSize: 15, color: c.faint, fontWeight: 400 }}> /agent/mo</span>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                margin: "28px 0",
                fontSize: 14.5,
                color: c.text2,
                flex: 1,
              }}
            >
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: c.lime }}>✓</span>5,000 credits included monthly
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: c.lime }}>✓</span>1 messaging channel
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: c.lime }}>✓</span>Weekly self-review
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: c.lime }}>✓</span>OpenClaw engine
              </div>
            </div>
            <Btn
              onClick={() => router.push("/hire")}
              style={{
                border: `1px solid ${c.borderStrong}`,
                background: "transparent",
                color: c.text,
                padding: 13,
                fontFamily: font.space,
                fontWeight: 500,
                fontSize: 15,
                cursor: "pointer",
              }}
              hoverStyle={{ borderColor: c.lime, color: c.lime }}
            >
              Start hiring
            </Btn>
          </div>

          {/* Professional */}
          <div
            style={{
              border: `1px solid ${c.lime}`,
              background: c.panel,
              padding: "32px 28px",
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -1,
                right: -1,
                background: c.lime,
                color: c.ink,
                fontFamily: font.mono,
                fontSize: 10,
                letterSpacing: ".1em",
                padding: "5px 10px",
              }}
            >
              MOST HIRED
            </div>
            <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 22 }}>Professional</div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: c.faint,
                margin: "4px 0 24px",
              }}
            >
              A REAL TEAMMATE
            </div>
            <div
              style={{
                fontFamily: font.space,
                fontWeight: 700,
                fontSize: "clamp(30px, 9vw, 44px)",
                letterSpacing: "-.02em",
              }}
            >
              $149
              <span style={{ fontSize: 15, color: c.faint, fontWeight: 400 }}> /agent/mo</span>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                margin: "28px 0",
                fontSize: 14.5,
                color: c.text2,
                flex: 1,
              }}
            >
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: c.lime }}>✓</span>25,000 credits included monthly
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: c.lime }}>✓</span>All channels — Telegram to WeChat
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: c.lime }}>✓</span>Daily self-review + persistent memory
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: c.lime }}>✓</span>Both engines + auto-match
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: c.lime }}>✓</span>Priority compute
              </div>
            </div>
            <Btn
              onClick={() => router.push("/hire")}
              style={{
                border: "none",
                background: c.lime,
                color: c.ink,
                padding: 13,
                fontFamily: font.space,
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
              hoverStyle={{ background: c.limeHover }}
            >
              Start hiring
            </Btn>
          </div>

          {/* Director */}
          <div
            style={{
              border: `1px solid ${c.border}`,
              background: c.panel,
              padding: "32px 28px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 22 }}>Director</div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: c.faint,
                margin: "4px 0 24px",
              }}
            >
              OPC &amp; HEAVY ROLES
            </div>
            <div
              style={{
                fontFamily: font.space,
                fontWeight: 700,
                fontSize: "clamp(30px, 9vw, 44px)",
                letterSpacing: "-.02em",
              }}
            >
              $399
              <span style={{ fontSize: 15, color: c.faint, fontWeight: 400 }}> /agent/mo</span>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                margin: "28px 0",
                fontSize: 14.5,
                color: c.text2,
                flex: 1,
              }}
            >
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: c.lime }}>✓</span>100,000 credits included monthly
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: c.lime }}>✓</span>Dedicated VM resources
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: c.lime }}>✓</span>OPC mode — one agent, many hats
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: c.lime }}>✓</span>Audit log &amp; approval workflows
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ color: c.lime }}>✓</span>White-glove onboarding
              </div>
            </div>
            <Btn
              onClick={() => router.push("/hire")}
              style={{
                border: `1px solid ${c.borderStrong}`,
                background: "transparent",
                color: c.text,
                padding: 13,
                fontFamily: font.space,
                fontWeight: 500,
                fontSize: 15,
                cursor: "pointer",
              }}
              hoverStyle={{ borderColor: c.lime, color: c.lime }}
            >
              Start hiring
            </Btn>
          </div>
        </div>
        <div
          style={{
            marginTop: 24,
            fontFamily: font.mono,
            fontSize: 12,
            color: c.faint,
            textAlign: "center",
          }}
        >
          ANNUAL −20% · 14-DAY TRIAL ON EVERY SEAT · UNUSED CREDITS ROLL OVER ONE CYCLE
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${c.line}`, background: c.panel }}>
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: `64px ${r.pagePx} 48px`,
            display: "grid",
            gridTemplateColumns: r.footer,
            gap: 40,
          }}
        >
          <div>
            <div
              style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}
            >
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
                }}
              >
                ARK_AGENT
              </span>
            </div>
            <div style={{ color: c.muted, fontSize: 14 }}>Autonomous employees for everyone.</div>
            <div style={{ fontFamily: font.mono, fontSize: 12, color: c.faint, marginTop: 20 }}>
              © 2026 ARKAGENT INC.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: 14,
              color: c.muted,
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                letterSpacing: ".12em",
                color: c.faint,
                marginBottom: 4,
              }}
            >
              PRODUCT
            </div>
            <a href="#roles" style={{ color: c.muted, textDecoration: "none" }}>
              Agents
            </a>
            <a href="#engines" style={{ color: c.muted, textDecoration: "none" }}>
              Engines
            </a>
            <a href="#pricing" style={{ color: c.muted, textDecoration: "none" }}>
              Pricing
            </a>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: 14,
              color: c.muted,
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                letterSpacing: ".12em",
                color: c.faint,
                marginBottom: 4,
              }}
            >
              COMPANY
            </div>
            <span>About</span>
            <span>Security</span>
            <span>Careers</span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: 14,
              color: c.muted,
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                letterSpacing: ".12em",
                color: c.faint,
                marginBottom: 4,
              }}
            >
              REGIONS
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 13 }}>
              arkagent.ai <span style={{ color: c.faint }}>— GLOBAL</span>
            </span>
            <span style={{ fontFamily: font.mono, fontSize: 13 }}>
              iagent.cc <span style={{ color: c.faint }}>— 中国大陆</span>
            </span>
            <Btn
              onClick={() => router.push("/directions")}
              style={{
                marginTop: 8,
                background: "none",
                border: `1px solid ${c.border}`,
                color: c.faint,
                fontFamily: font.mono,
                fontSize: 11,
                padding: "6px 10px",
                cursor: "pointer",
                textAlign: "left",
                width: "fit-content",
              }}
              hoverStyle={{ color: c.lime, borderColor: c.limeBorder }}
            >
              ⌥ DESIGN DIRECTIONS
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
