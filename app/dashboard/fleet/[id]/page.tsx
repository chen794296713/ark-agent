"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { useApp } from "@/lib/store";
import { Btn } from "@/components/ui";
import { genTexts, roleIdByName } from "@/lib/data";
import type { Agent, ChatMsg } from "@/lib/types";

const TABS = [
  { id: "activity", label: "Activity" },
  { id: "tasks", label: "Tasks" },
  { id: "chat", label: "Chat" },
  { id: "performance", label: "Performance" },
  { id: "settings", label: "Settings" },
];

const REPLIES: Record<string, string> = {
  nova: "On it — I’ll fold that into today’s queue and report back by 18:00. Want the logistics accounts prioritized first?",
  atlas: "Understood. I’ve updated my playbook — you’ll see it reflected in the next conversations.",
  mei: "Noted and scheduled. I’ll confirm once it’s done and include it in tomorrow’s brief.",
  juno: "Got it — I’ll revise and ping you when the new draft is ready, should be under an hour.",
};

function ActivityTab({ cur }: { cur: Agent }) {
  return (
    <div style={{ border: `1px solid ${c.border}`, background: c.panel }}>
      {cur.act.map((e, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 18,
            padding: "14px 22px",
            borderBottom: `1px solid ${c.lineSoft}`,
            alignItems: "baseline",
          }}
        >
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 12,
              color: c.faint,
              flexShrink: 0,
              width: 88,
            }}
          >
            {e.t}
          </span>
          <span style={{ fontSize: 14.5, color: c.text2 }}>{e.txt}</span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: font.mono,
              fontSize: 11,
              color: e.tagC,
            }}
          >
            {e.tag}
          </span>
        </div>
      ))}
    </div>
  );
}

function TasksTab({ cur }: { cur: Agent }) {
  return (
    <div style={{ border: `1px solid ${c.border}`, background: c.panel }}>
      {cur.tasks.map((k, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 16,
            padding: "14px 22px",
            borderBottom: `1px solid ${c.lineSoft}`,
            alignItems: "center",
          }}
        >
          <span style={{ fontFamily: font.mono, fontSize: 13, color: k.c, width: 18 }}>{k.sym}</span>
          <span style={{ fontSize: 14.5, color: k.tc, flex: 1 }}>{k.txt}</span>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.faint }}>{k.meta}</span>
        </div>
      ))}
    </div>
  );
}

function ChatTab({ cur }: { cur: Agent }) {
  const [sent, setSent] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const all: ChatMsg[] = [...cur.chat, ...sent];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [sent.length]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const send = () => {
    const txt = draft.trim();
    if (!txt) return;
    setSent((s) => [...s, { who: "me", txt, meta: "YOU · JUST NOW" }]);
    setDraft("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSent((s) => [
        ...s,
        {
          who: "them",
          txt: REPLIES[cur.id] || REPLIES.nova,
          meta: cur.name.toUpperCase() + " · JUST NOW",
        },
      ]);
    }, 1100);
  };

  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        background: c.panel,
        display: "flex",
        flexDirection: "column",
        height: r.chatH,
      }}
    >
      <div
        style={{
          padding: "12px 20px",
          borderBottom: `1px solid ${c.line}`,
          fontFamily: font.mono,
          fontSize: 11,
          color: c.faint,
        }}
      >
        WEB CONSOLE · ALSO ON {cur.chansTxt}
      </div>
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {all.map((m, i) => {
          const me = m.who === "me";
          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: me ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "72%",
                  background: me ? c.lime : "#151A22",
                  color: me ? c.ink : c.text,
                  padding: "11px 15px",
                  fontSize: 14.5,
                  border: `1px solid ${me ? c.lime : c.border}`,
                }}
              >
                {m.txt}
              </div>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 10.5,
                  color: c.faint,
                  marginTop: 5,
                }}
              >
                {m.meta}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "14px 16px",
          borderTop: `1px solid ${c.line}`,
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder={`Message ${cur.name}…`}
          style={{
            flex: 1,
            background: c.bg,
            border: `1px solid ${c.border}`,
            color: c.text,
            padding: "12px 14px",
            fontSize: 14.5,
            fontFamily: font.sans,
            outline: "none",
          }}
        />
        <button
          onClick={send}
          style={{
            background: c.lime,
            color: c.ink,
            border: "none",
            padding: "0 22px",
            fontFamily: font.space,
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function PerformanceTab({ cur }: { cur: Agent }) {
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: r.detailPerf,
        gap: 20,
        alignItems: "start",
      }}
    >
      <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: 24 }}>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: ".1em",
            color: c.muted,
            marginBottom: 20,
          }}
        >
          SELF-REVIEW · WEEK OF JUN 8
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {cur.perf.map((p, i) => (
            <div key={i}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13.5,
                  marginBottom: 6,
                }}
              >
                <span style={{ color: c.text2 }}>{p.label}</span>
                <span style={{ fontFamily: font.mono, color: c.text }}>
                  {p.val}{" "}
                  <span style={{ color: c.green, fontSize: 11 }}>{p.delta}</span>
                </span>
              </div>
              <div style={{ height: 4, background: c.line }}>
                <div style={{ height: 4, width: p.w, background: c.lime }} />
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 14,
            color: c.text2,
            borderTop: `1px solid ${c.line}`,
            paddingTop: 18,
          }}
        >
          “{cur.perfNote}”
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: ".1em",
            color: c.muted,
          }}
        >
          IMPROVEMENT QUEUE
        </div>
        {cur.queue.map((q) => {
          const key = cur.id + q.id;
          const ok = !!approved[key];
          return (
            <div
              key={q.id}
              style={{
                border: `1px solid ${c.border}`,
                background: c.panel,
                padding: "16px 18px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 14, color: c.text }}>{q.txt}</div>
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 11,
                    color: c.faint,
                    marginTop: 3,
                  }}
                >
                  {q.impact}
                </div>
              </div>
              <button
                onClick={() => setApproved((s) => ({ ...s, [key]: true }))}
                style={{
                  border: `1px solid ${c.limeBorder}`,
                  background: ok ? c.limeWash : "transparent",
                  color: c.lime,
                  padding: "8px 14px",
                  fontFamily: font.space,
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {ok ? "✓ Approved" : "Approve"}
              </button>
            </div>
          );
        })}
        <div
          style={{
            border: `1px dashed ${c.border}`,
            padding: "14px 18px",
            fontSize: 13,
            color: c.faint,
          }}
        >
          Approved changes apply at the next self-review cycle. The agent never changes its own rules.
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ cur }: { cur: Agent }) {
  const { isPaused, togglePause } = useApp();
  const defaults = genTexts[roleIdByName[cur.role]] || genTexts.prospector;
  const [instr, setInstr] = useState(defaults.i);
  const [rules, setRules] = useState(defaults.r);
  const [sched, setSched] = useState("Daily summary at 18:00 · Weekly report Friday");
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const curPaused = isPaused(cur.id);
  const st = curPaused ? "PAUSED" : cur.st;
  const sc = curPaused ? c.amber : cur.sc;

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const save = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaved(true);
    saveTimer.current = setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: r.detailSettings,
        gap: 20,
        alignItems: "start",
      }}
    >
      <div
        style={{
          border: `1px solid ${c.border}`,
          background: c.panel,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                letterSpacing: ".12em",
                color: c.muted,
              }}
            >
              INSTRUCTIONS
            </span>
            <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.faint }}>
              VERSION 4 · LAST EDIT JUN 9
            </span>
          </div>
          <textarea
            value={instr}
            onChange={(e) => setInstr(e.target.value)}
            style={{
              width: "100%",
              minHeight: 110,
              background: c.bg,
              border: `1px solid ${c.border}`,
              color: c.text,
              padding: "12px 14px",
              fontSize: 14.5,
              fontFamily: font.sans,
              outline: "none",
              resize: "vertical",
            }}
          />
        </div>
        <div>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: ".1em",
              color: c.muted,
              marginBottom: 8,
            }}
          >
            RULES &amp; BOUNDARIES
          </div>
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            style={{
              width: "100%",
              minHeight: 90,
              background: c.bg,
              border: `1px solid ${c.border}`,
              color: c.text,
              padding: "12px 14px",
              fontSize: 14.5,
              fontFamily: font.sans,
              outline: "none",
              resize: "vertical",
            }}
          />
        </div>
        <div>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: ".1em",
              color: c.muted,
              marginBottom: 8,
            }}
          >
            REMINDERS &amp; SCHEDULE
          </div>
          <input
            value={sched}
            onChange={(e) => setSched(e.target.value)}
            style={{
              width: "100%",
              background: c.bg,
              border: `1px solid ${c.border}`,
              color: c.text,
              padding: "12px 14px",
              fontSize: 14.5,
              fontFamily: font.sans,
              outline: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={save}
            style={{
              background: c.lime,
              color: c.ink,
              border: "none",
              padding: "12px 24px",
              fontFamily: font.space,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {saved ? "✓ Saved" : "Save changes"}
          </button>
          <span style={{ fontSize: 12.5, color: c.faint }}>
            Changes are re-briefed to the agent on its next cycle — no restart needed.
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: 20 }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: ".12em",
              color: c.muted,
              marginBottom: 14,
            }}
          >
            RUNTIME
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: c.faint }}>Engine</span>
              <span style={{ fontFamily: font.mono, fontSize: 12.5 }}>{cur.engine}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: c.faint }}>Machine</span>
              <span style={{ fontFamily: font.mono, fontSize: 12.5 }}>VM {cur.vm}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: c.faint }}>Status</span>
              <span style={{ fontFamily: font.mono, fontSize: 12.5, color: sc }}>{st}</span>
            </div>
          </div>
        </div>
        <Btn
          onClick={() => togglePause(cur.id)}
          hoverStyle={{ borderColor: c.amber, color: c.amber }}
          style={{
            border: `1px solid ${c.borderStrong}`,
            background: "transparent",
            color: c.text,
            padding: 12,
            fontFamily: font.space,
            fontWeight: 500,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {curPaused ? "Resume agent" : "Pause agent"}
        </Btn>
        <Btn
          hoverStyle={{ color: c.text, borderColor: c.borderMute }}
          style={{
            border: `1px solid ${c.borderStrong}`,
            background: "transparent",
            color: c.muted,
            padding: 12,
            fontFamily: font.space,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Restart VM
        </Btn>
        <Btn
          hoverStyle={{ background: c.redWash }}
          style={{
            border: `1px solid ${c.redBorder}`,
            background: "transparent",
            color: c.red,
            padding: 12,
            fontFamily: font.space,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Terminate agent
        </Btn>
        <div
          style={{
            border: `1px dashed ${c.border}`,
            padding: "12px 14px",
            fontSize: 12.5,
            color: c.faint,
          }}
        >
          Pausing keeps memory and state. Terminating archives the agent and its VM after 30 days.
        </div>
      </div>
    </div>
  );
}

function AgentDetailInner() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  const { agents, getAgent, isPaused } = useApp();

  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const cur = getAgent(id) || agents[0];

  const initialTab = search.get("tab") || "activity";
  const [tab, setTab] = useState(initialTab);

  const curPaused = isPaused(cur.id);
  const st = curPaused ? "PAUSED" : cur.st;
  const sc = curPaused ? c.amber : cur.sc;

  return (
    <div style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      <Btn
        onClick={() => router.push("/dashboard/fleet")}
            hoverStyle={{ color: c.muted }}
            style={{
              background: "none",
              border: "none",
              color: c.faint,
              fontSize: 13.5,
              cursor: "pointer",
              fontFamily: font.sans,
              padding: 0,
              marginBottom: 20,
            }}
          >
            ← All agents
          </Btn>
          <div
            style={{
              border: `1px solid ${c.border}`,
              background: c.panel,
              padding: 24,
              display: "flex",
              alignItems: "center",
              gap: 20,
              marginBottom: 0,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                background: cur.hue,
                color: c.ink,
                display: "grid",
                placeItems: "center",
                fontFamily: font.space,
                fontWeight: 700,
                fontSize: 24,
              }}
            >
              {cur.mono}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: "clamp(18px, 4vw, 22px)" }}>{cur.name}</div>
              <div style={{ fontSize: 14, color: c.muted }}>
                {cur.role} ·{" "}
                <span style={{ fontFamily: font.mono, fontSize: 12.5 }}>{cur.engine}</span> · VM{" "}
                {cur.vm}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 24,
                fontFamily: font.mono,
                fontSize: 11,
                color: c.faint,
                textAlign: "right",
              }}
            >
              <div>
                <div>UPTIME</div>
                <div style={{ color: c.text2, fontSize: 14, marginTop: 4 }}>{cur.up}</div>
              </div>
              <div>
                <div>CREDITS / MO</div>
                <div style={{ color: c.text2, fontSize: 14, marginTop: 4 }}>{cur.credits}</div>
              </div>
              <div>
                <div>STATUS</div>
                <div style={{ color: sc, fontSize: 14, marginTop: 4 }}>● {st}</div>
              </div>
            </div>
          </div>
          <div
            className="ark-scroll"
            style={{
              display: "flex",
              border: `1px solid ${c.border}`,
              borderTop: "none",
              background: c.bg,
              marginBottom: 28,
              overflowX: "auto",
              flexWrap: "nowrap",
            }}
          >
            {TABS.map((t) => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    background: "none",
                    border: "none",
                    borderBottom: `2px solid ${on ? c.lime : "transparent"}`,
                    color: on ? c.text : c.faint,
                    padding: "13px 22px",
                    fontSize: 14,
                    fontFamily: font.space,
                    fontWeight: 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {tab === "activity" && <ActivityTab cur={cur} />}
          {tab === "tasks" && <TasksTab cur={cur} />}
          {tab === "chat" && <ChatTab key={cur.id} cur={cur} />}
          {tab === "performance" && <PerformanceTab key={cur.id} cur={cur} />}
      {tab === "settings" && <SettingsTab key={cur.id} cur={cur} />}
    </div>
  );
}

export default function AgentDetailPage() {
  return (
    <Suspense fallback={null}>
      <AgentDetailInner />
    </Suspense>
  );
}
