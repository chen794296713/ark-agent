"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { api, ApiError } from "@/lib/client-api";
import type { AgentDetailDTO, MessageDTO } from "@/lib/client-api";
import {
  statusDisplay,
  ENGINE_LABEL,
  CHANNEL_LABEL,
  channelsText,
  tagColor,
  TASK_SYMBOL,
  uptimeText,
  clock,
} from "@/lib/agent-display";

const TABS = [
  { id: "activity", label: "Activity" },
  { id: "tasks", label: "Tasks" },
  { id: "chat", label: "Chat" },
  { id: "performance", label: "Performance" },
  { id: "settings", label: "Settings" },
];

const CHANNEL_OPTIONS = ["telegram", "whatsapp", "wechat", "line", "slack", "email", "web"];

function ActivityTab({ cur }: { cur: AgentDetailDTO }) {
  if (cur.activities.length === 0) {
    return (
      <div
        style={{
          border: `1px solid ${c.border}`,
          background: c.panel,
          padding: "40px 22px",
          textAlign: "center",
          fontSize: 14,
          color: c.faint,
        }}
      >
        No activity yet — this agent hasn’t logged anything.
      </div>
    );
  }
  return (
    <div style={{ border: `1px solid ${c.border}`, background: c.panel }}>
      {cur.activities.map((e) => (
        <div
          key={e.id}
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
            {clock(e.occurredAt)}
          </span>
          <span style={{ fontSize: 14.5, color: c.text2 }}>{e.text}</span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: font.mono,
              fontSize: 11,
              color: tagColor(e.tag),
            }}
          >
            {e.tag}
          </span>
        </div>
      ))}
    </div>
  );
}

function TasksTab({ cur }: { cur: AgentDetailDTO }) {
  if (cur.tasks.length === 0) {
    return (
      <div
        style={{
          border: `1px solid ${c.border}`,
          background: c.panel,
          padding: "40px 22px",
          textAlign: "center",
          fontSize: 14,
          color: c.faint,
        }}
      >
        No tasks queued for this agent.
      </div>
    );
  }
  return (
    <div style={{ border: `1px solid ${c.border}`, background: c.panel }}>
      {cur.tasks.map((k) => {
        const sym = TASK_SYMBOL[k.status] ?? TASK_SYMBOL.queued;
        const done = k.status === "done";
        return (
          <div
            key={k.id}
            style={{
              display: "flex",
              gap: 16,
              padding: "14px 22px",
              borderBottom: `1px solid ${c.lineSoft}`,
              alignItems: "center",
            }}
          >
            <span style={{ fontFamily: font.mono, fontSize: 13, color: sym.color, width: 18 }}>
              {sym.sym}
            </span>
            <span style={{ fontSize: 14.5, color: done ? c.faint : c.text2, flex: 1 }}>{k.text}</span>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: c.faint }}>{k.meta}</span>
          </div>
        );
      })}
    </div>
  );
}

function ChatTab({ cur }: { cur: AgentDetailDTO }) {
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.messages(cur.id);
        if (alive) setMessages(res.messages);
      } catch (e) {
        if (alive) setError(e instanceof ApiError ? e.message : "Couldn’t load chat history.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [cur.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, loading]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    try {
      const res = await api.sendMessage(cur.id, body);
      setMessages((prev) => {
        const next = [...prev, res.userMessage];
        if (res.replyMessage) next.push(res.replyMessage);
        return next;
      });
    } catch (e) {
      setDraft(body);
      setError(e instanceof ApiError ? e.message : "Message failed to send.");
    } finally {
      setSending(false);
    }
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
        WEB CONSOLE{channelsText(cur.channels) ? ` · ALSO ON ${channelsText(cur.channels)}` : ""}
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
        {loading ? (
          <div style={{ margin: "auto", fontSize: 13.5, color: c.faint }}>Loading conversation…</div>
        ) : messages.length === 0 ? (
          <div style={{ margin: "auto", fontSize: 13.5, color: c.faint }}>
            No messages yet. Say hello to {cur.name}.
          </div>
        ) : (
          messages.map((m) => {
            const me = m.sender === "user";
            return (
              <div
                key={m.id}
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
                    border: `1px solid ${me ? c.accent : c.border}`,
                  }}
                >
                  {m.body}
                </div>
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10.5,
                    color: c.faint,
                    marginTop: 5,
                  }}
                >
                  {m.meta ??
                    `${(me ? "YOU" : cur.name.toUpperCase())} · ${clock(m.createdAt)}`}
                </div>
              </div>
            );
          })
        )}
      </div>
      {error && (
        <div
          style={{
            padding: "8px 20px",
            fontFamily: font.mono,
            fontSize: 11,
            color: c.red,
            borderTop: `1px solid ${c.line}`,
          }}
        >
          {error}
        </div>
      )}
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
          disabled={sending}
          style={{
            background: c.lime,
            color: c.ink,
            border: "none",
            padding: "0 22px",
            fontFamily: font.space,
            fontWeight: 700,
            fontSize: 14,
            cursor: sending ? "default" : "pointer",
            opacity: sending ? 0.6 : 1,
          }}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

function PerformanceTab({ cur, onRefresh }: { cur: AgentDetailDTO; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const pending = cur.improvements.filter((q) => q.status === "pending" || q.status === "proposed");
  const queue = pending.length > 0 ? pending : cur.improvements;

  const resolve = async (improvementId: string, action: "approve" | "dismiss") => {
    setBusy((s) => ({ ...s, [improvementId]: true }));
    setError(null);
    try {
      await api.resolveImprovement(cur.id, improvementId, action);
      await onRefresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t update the improvement.");
    } finally {
      setBusy((s) => ({ ...s, [improvementId]: false }));
    }
  };

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
          SELF-REVIEW
        </div>
        {cur.metrics.length === 0 ? (
          <div style={{ fontSize: 14, color: c.faint }}>No metrics recorded yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {cur.metrics.map((p) => (
              <div key={p.id}>
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
                    {p.value}{" "}
                    {p.delta && <span style={{ color: c.green, fontSize: 11 }}>{p.delta}</span>}
                  </span>
                </div>
                <div style={{ height: 4, background: c.line }}>
                  <div style={{ height: 4, width: `${p.weight}%`, background: c.lime }} />
                </div>
              </div>
            ))}
          </div>
        )}
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
        {error && (
          <div style={{ fontFamily: font.mono, fontSize: 11, color: c.red }}>{error}</div>
        )}
        {queue.length === 0 ? (
          <div
            style={{
              border: `1px solid ${c.border}`,
              background: c.panel,
              padding: "16px 18px",
              fontSize: 14,
              color: c.faint,
            }}
          >
            The agent has no proposed improvements right now.
          </div>
        ) : (
          queue.map((q) => {
            const resolved = q.status !== "pending" && q.status !== "proposed";
            const approved = q.status === "approved";
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
                  <div style={{ fontSize: 14, color: c.text }}>{q.text}</div>
                  {q.impact && (
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
                  )}
                </div>
                {resolved ? (
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 12.5,
                      color: approved ? c.accent : c.faint,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {approved ? "✓ Approved" : "Dismissed"}
                  </span>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <Btn
                      onClick={() => resolve(q.id, "approve")}
                      disabled={!!busy[q.id]}
                      hoverStyle={{ background: c.limeWash }}
                      style={{
                        border: `1px solid ${c.limeBorder}`,
                        background: "transparent",
                        color: c.accent,
                        padding: "8px 14px",
                        fontFamily: font.space,
                        fontSize: 12.5,
                        fontWeight: 500,
                        cursor: busy[q.id] ? "default" : "pointer",
                        whiteSpace: "nowrap",
                        opacity: busy[q.id] ? 0.6 : 1,
                      }}
                    >
                      Approve
                    </Btn>
                    <Btn
                      onClick={() => resolve(q.id, "dismiss")}
                      disabled={!!busy[q.id]}
                      hoverStyle={{ borderColor: c.borderMute, color: c.text }}
                      style={{
                        border: `1px solid ${c.borderStrong}`,
                        background: "transparent",
                        color: c.muted,
                        padding: "8px 14px",
                        fontFamily: font.space,
                        fontSize: 12.5,
                        fontWeight: 500,
                        cursor: busy[q.id] ? "default" : "pointer",
                        whiteSpace: "nowrap",
                        opacity: busy[q.id] ? 0.6 : 1,
                      }}
                    >
                      Dismiss
                    </Btn>
                  </div>
                )}
              </div>
            );
          })
        )}
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

function SettingsTab({ cur, onRefresh }: { cur: AgentDetailDTO; onRefresh: () => Promise<void> }) {
  const router = useRouter();
  const [instr, setInstr] = useState(cur.instructions ?? "");
  const [rules, setRules] = useState(cur.rules ?? "");
  const [channels, setChannels] = useState<string[]>(cur.channels);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lifeBusy, setLifeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const display = statusDisplay(cur.status);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const toggleChannel = (type: string) => {
    setChannels((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateAgent(cur.id, { instructions: instr, rules, channels });
      await onRefresh();
      setSaved(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaved(false), 2200);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t save changes.");
    } finally {
      setSaving(false);
    }
  };

  const runLifecycle = async (action: "pause" | "resume" | "terminate") => {
    if (lifeBusy) return;
    setLifeBusy(true);
    setError(null);
    try {
      await api.lifecycle(cur.id, action);
      if (action === "terminate") {
        router.push("/dashboard/fleet");
        return;
      }
      await onRefresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Lifecycle action failed.");
    } finally {
      setLifeBusy(false);
    }
  };

  const paused = cur.status === "paused";

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
            CHANNELS
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CHANNEL_OPTIONS.map((type) => {
              const on = channels.includes(type);
              return (
                <Btn
                  key={type}
                  onClick={() => toggleChannel(type)}
                  hoverStyle={on ? undefined : { borderColor: c.borderMute, color: c.text }}
                  style={{
                    border: `1px solid ${on ? c.limeBorder : c.borderStrong}`,
                    background: on ? c.limeWash : "transparent",
                    color: on ? c.accent : c.muted,
                    padding: "8px 14px",
                    fontFamily: font.space,
                    fontSize: 12.5,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {CHANNEL_LABEL[type] ?? type}
                </Btn>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              background: c.lime,
              color: c.ink,
              border: "none",
              padding: "12px 24px",
              fontFamily: font.space,
              fontWeight: 700,
              fontSize: 14,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save changes"}
          </button>
          <span style={{ fontSize: 12.5, color: c.faint }}>
            Changes are re-briefed to the agent on its next cycle — no restart needed.
          </span>
          {error && (
            <span style={{ fontFamily: font.mono, fontSize: 11, color: c.red }}>{error}</span>
          )}
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
              <span style={{ fontFamily: font.mono, fontSize: 12.5 }}>
                {ENGINE_LABEL[cur.engine] ?? cur.engine}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: c.faint }}>Machine</span>
              <span style={{ fontFamily: font.mono, fontSize: 12.5 }}>
                {cur.vmId}@{cur.vmRegion}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: c.faint }}>Status</span>
              <span style={{ fontFamily: font.mono, fontSize: 12.5, color: display.color }}>
                {display.label}
              </span>
            </div>
          </div>
        </div>
        <Btn
          onClick={() => runLifecycle(paused ? "resume" : "pause")}
          disabled={lifeBusy}
          hoverStyle={{ borderColor: c.amber, color: c.amber }}
          style={{
            border: `1px solid ${c.borderStrong}`,
            background: "transparent",
            color: c.text,
            padding: 12,
            fontFamily: font.space,
            fontWeight: 500,
            fontSize: 14,
            cursor: lifeBusy ? "default" : "pointer",
            opacity: lifeBusy ? 0.6 : 1,
          }}
        >
          {paused ? "Resume agent" : "Pause agent"}
        </Btn>
        <Btn
          onClick={() => runLifecycle("terminate")}
          disabled={lifeBusy}
          hoverStyle={{ background: c.redWash }}
          style={{
            border: `1px solid ${c.redBorder}`,
            background: "transparent",
            color: c.red,
            padding: 12,
            fontFamily: font.space,
            fontSize: 14,
            cursor: lifeBusy ? "default" : "pointer",
            opacity: lifeBusy ? 0.6 : 1,
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
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();

  const [agent, setAgent] = useState<AgentDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialTab = search.get("tab") || "activity";
  const [tab, setTab] = useState(initialTab);

  const load = useCallback(async () => {
    try {
      const res = await api.getAgent(id);
      setAgent(res.agent);
      setNotFound(false);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setNotFound(true);
      } else {
        setError(e instanceof ApiError ? e.message : "Couldn’t load this agent.");
      }
    }
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) {
        setLoading(true);
        setNotFound(false);
        setError(null);
      }
      try {
        const res = await api.getAgent(id);
        if (alive) setAgent(res.agent);
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(e instanceof ApiError ? e.message : "Couldn’t load this agent.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div style={{ padding: `${r.contentPy} ${r.pagePx}`, color: c.faint, fontSize: 14 }}>
        Loading agent…
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
        <div
          style={{
            border: `1px solid ${c.border}`,
            background: c.panel,
            padding: 48,
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 22, marginBottom: 8 }}>
            Agent not found
          </div>
          <div style={{ fontSize: 14, color: c.muted, marginBottom: 24 }}>
            This agent doesn’t exist or has been terminated.
          </div>
          <Btn
            onClick={() => router.push("/dashboard/fleet")}
            hoverStyle={{ background: c.limeHover }}
            style={{
              background: c.lime,
              color: c.ink,
              border: "none",
              padding: "11px 22px",
              fontFamily: font.space,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            ← All agents
          </Btn>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
        <div
          style={{
            border: `1px solid ${c.redBorder}`,
            background: c.panel,
            padding: 32,
            textAlign: "center",
            fontSize: 14,
            color: c.text2,
          }}
        >
          {error ?? "Couldn’t load this agent."}
        </div>
      </div>
    );
  }

  const cur = agent;
  const display = statusDisplay(cur.status);

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
            background: cur.hue ?? c.accent,
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
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: "clamp(18px, 4vw, 22px)" }}>
            {cur.name}
          </div>
          <div style={{ fontSize: 14, color: c.muted }}>
            {cur.role} ·{" "}
            <span style={{ fontFamily: font.mono, fontSize: 12.5 }}>
              {ENGINE_LABEL[cur.engine] ?? cur.engine}
            </span>{" "}
            · {cur.vmId}@{cur.vmRegion}
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
            <div style={{ color: c.text2, fontSize: 14, marginTop: 4 }}>
              {uptimeText(cur.uptimeStartedAt ? String(cur.uptimeStartedAt) : null)}
            </div>
          </div>
          <div>
            <div>CREDITS / MO</div>
            <div style={{ color: c.text2, fontSize: 14, marginTop: 4 }}>
              {cur.creditsUsed.toLocaleString()}
            </div>
          </div>
          <div>
            <div>STATUS</div>
            <div style={{ color: display.color, fontSize: 14, marginTop: 4 }}>● {display.label}</div>
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
                borderBottom: `2px solid ${on ? c.accent : "transparent"}`,
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
      {tab === "performance" && <PerformanceTab key={cur.id} cur={cur} onRefresh={load} />}
      {tab === "settings" && <SettingsTab key={cur.id} cur={cur} onRefresh={load} />}
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
