"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
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
import {
  mergeSettings,
  TONES,
  LANGUAGES,
  AUTONOMY_LEVELS,
  REASONING_EFFORTS,
  MODELS,
  SKILLS,
  TOOLS,
  TIMEZONES,
  WEEKDAYS,
  type AgentSettings,
} from "@/lib/agent-settings";
import { useApp } from "@/lib/store";
import { fleetDetail } from "@/lib/i18n/fleet-detail";

const TAB_IDS = ["activity", "tasks", "chat", "performance", "settings"] as const;

const CHANNEL_OPTIONS = ["telegram", "whatsapp", "wechat", "line", "slack", "email", "web"];

function ActivityTab({ cur }: { cur: AgentDetailDTO }) {
  const { lang } = useApp();
  const t = fleetDetail[lang];
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
        {t.activityEmpty}
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
  const { lang } = useApp();
  const t = fleetDetail[lang];
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
        {t.tasksEmpty}
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
  const { lang } = useApp();
  const t = fleetDetail[lang];
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
        if (alive) setError(e instanceof ApiError ? e.message : t.chatLoadError);
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
      setError(e instanceof ApiError ? e.message : t.chatSendError);
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
        {t.chatWebConsole}{channelsText(cur.channels) ? t.chatAlsoOn(channelsText(cur.channels)) : ""}
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
          <div style={{ margin: "auto", fontSize: 13.5, color: c.faint }}>{t.chatLoading}</div>
        ) : messages.length === 0 ? (
          <div style={{ margin: "auto", fontSize: 13.5, color: c.faint }}>
            {t.chatEmpty(cur.name)}
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
                    `${(me ? t.chatYou : cur.name.toUpperCase())} · ${clock(m.createdAt)}`}
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
          placeholder={t.chatPlaceholder(cur.name)}
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
          {sending ? t.chatSending : t.chatSend}
        </button>
      </div>
    </div>
  );
}

function PerformanceTab({ cur, onRefresh }: { cur: AgentDetailDTO; onRefresh: () => Promise<void> }) {
  const { lang } = useApp();
  const t = fleetDetail[lang];
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
      setError(e instanceof ApiError ? e.message : t.perfUpdateError);
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
          {t.perfSelfReview}
        </div>
        {cur.metrics.length === 0 ? (
          <div style={{ fontSize: 14, color: c.faint }}>{t.perfNoMetrics}</div>
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
          {t.perfImprovementQueue}
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
            {t.perfNoImprovements}
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
                    {approved ? t.perfApproved : t.perfDismissed}
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
                      {t.perfApprove}
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
                      {t.perfDismiss}
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
          {t.perfFootnote}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings UI primitives
// ---------------------------------------------------------------------------
const sLabel: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 11,
  letterSpacing: ".1em",
  color: c.muted,
  marginBottom: 7,
  display: "block",
};
const sInput: CSSProperties = {
  width: "100%",
  background: c.bg,
  border: `1px solid ${c.border}`,
  color: c.text,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: font.sans,
  outline: "none",
};

function SettingCard({
  title,
  badge,
  badgeColor,
  desc,
  children,
}: {
  title: string;
  badge?: string;
  badgeColor?: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        background: c.panel,
        padding: 22,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: ".12em", color: c.text2 }}>
            {title}
          </span>
          {badge && (
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 9.5,
                letterSpacing: ".08em",
                color: badgeColor ?? c.faint,
                border: `1px solid ${badgeColor ?? c.border}`,
                padding: "2px 6px",
              }}
            >
              {badge}
            </span>
          )}
        </div>
        {desc && <div style={{ fontSize: 12.5, color: c.faint, marginTop: 5 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label style={sLabel}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 12, color: c.faint, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
  desc,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button
        type="button"
        onClick={() => onChange(!on)}
        aria-pressed={on}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          border: `1px solid ${on ? c.limeBorder : c.borderStrong}`,
          background: on ? c.lime : "transparent",
          position: "relative",
          cursor: "pointer",
          flexShrink: 0,
          transition: "background .15s ease, border-color .15s ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on ? 19 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: on ? c.ink : c.muted,
            transition: "left .15s ease",
          }}
        />
      </button>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: c.text }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: c.faint }}>{desc}</div>}
      </div>
    </div>
  );
}

function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${c.border}`, flexWrap: "wrap" }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              background: on ? c.lime : "transparent",
              color: on ? c.ink : c.muted,
              border: "none",
              padding: "7px 14px",
              fontFamily: font.mono,
              fontSize: 11.5,
              letterSpacing: ".03em",
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...sInput, fontFamily: font.mono, fontSize: 13, cursor: "pointer" }}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Chip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <Btn
      onClick={onClick}
      hoverStyle={on ? undefined : { borderColor: c.borderMute, color: c.text }}
      style={{
        border: `1px solid ${on ? c.limeBorder : c.borderStrong}`,
        background: on ? c.limeWash : "transparent",
        color: on ? c.accent : c.muted,
        padding: "7px 13px",
        fontFamily: font.space,
        fontSize: 12.5,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {label}
    </Btn>
  );
}

function SettingsTab({ cur, onRefresh }: { cur: AgentDetailDTO; onRefresh: () => Promise<void> }) {
  const { lang } = useApp();
  const t = fleetDetail[lang];
  const router = useRouter();
  const [name, setName] = useState(cur.name);
  const [engine, setEngine] = useState<"openclaw" | "hermes">(
    cur.engine === "hermes" ? "hermes" : "openclaw",
  );
  const [planTier, setPlanTier] = useState<"associate" | "professional" | "director">(
    cur.planTier as "associate" | "professional" | "director",
  );
  const [instr, setInstr] = useState(cur.instructions ?? "");
  const [rules, setRules] = useState(cur.rules ?? "");
  const [channels, setChannels] = useState<string[]>(cur.channels);
  const [s, setS] = useState<AgentSettings>(() => mergeSettings(cur.settings));
  const [knowledgeDraft, setKnowledgeDraft] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lifeBusy, setLifeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const display = statusDisplay(cur.status);
  const paused = cur.status === "paused";

  function set<K extends keyof AgentSettings>(k: K, v: AgentSettings[K]) {
    setS((p) => ({ ...p, [k]: v }));
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const toggleChannel = (type: string) =>
    setChannels((prev) => (prev.includes(type) ? prev.filter((x) => x !== type) : [...prev, type]));
  const toggleSkill = (id: string) =>
    set("skills", s.skills.includes(id) ? s.skills.filter((x) => x !== id) : [...s.skills, id]);
  const toggleDay = (d: number) =>
    set(
      "workDays",
      s.workDays.includes(d) ? s.workDays.filter((x) => x !== d) : [...s.workDays, d].sort(),
    );
  const addKnowledge = () => {
    const v = knowledgeDraft.trim();
    if (!v) return;
    set("knowledgeUrls", Array.from(new Set([...s.knowledgeUrls, v])));
    setKnowledgeDraft("");
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateAgent(cur.id, {
        name: name.trim() || cur.name,
        instructions: instr,
        rules,
        channels,
        engine,
        planTier,
        settings: s,
      });
      await onRefresh();
      setSaved(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaved(false), 2200);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.saveError);
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
      setError(e instanceof ApiError ? e.message : t.lifecycleError);
    } finally {
      setLifeBusy(false);
    }
  };

  const autonomyDesc = AUTONOMY_LEVELS.find((a) => a.id === s.autonomy)?.desc;

  return (
    <div style={{ display: "grid", gridTemplateColumns: r.detailSettings, gap: 20, alignItems: "start" }}>
      {/* ---- Form column ---- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <SettingCard title={t.identityTitle} desc={t.identityDesc}>
          <Field label={t.fieldAgentName}>
            <input value={name} onChange={(e) => setName(e.target.value)} style={sInput} />
          </Field>
          <Field label={t.fieldRole}>
            <input value={cur.role} disabled style={{ ...sInput, color: c.muted }} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: r.split, gap: 14 }}>
            <Field label={t.fieldEngine} hint={t.fieldEngineHint}>
              <SelectField
                value={engine}
                onChange={(v) => setEngine(v as "openclaw" | "hermes")}
                options={[
                  { id: "openclaw", label: t.engineOpenclaw },
                  { id: "hermes", label: t.engineHermes },
                ]}
              />
            </Field>
            <Field label={t.fieldPlan}>
              <SelectField
                value={planTier}
                onChange={(v) => setPlanTier(v as "associate" | "professional" | "director")}
                options={[
                  { id: "associate", label: t.planAssociate },
                  { id: "professional", label: t.planProfessional },
                  { id: "director", label: t.planDirector },
                ]}
              />
            </Field>
          </div>
        </SettingCard>

        <SettingCard title={t.behaviorTitle} desc={t.behaviorDesc}>
          <Field label={t.fieldInstructions} hint={t.fieldInstructionsHint}>
            <textarea
              value={instr}
              onChange={(e) => setInstr(e.target.value)}
              style={{ ...sInput, minHeight: 100, resize: "vertical", fontFamily: font.sans }}
            />
          </Field>
          <Field label={t.fieldRules} hint={t.fieldRulesHint}>
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              style={{ ...sInput, minHeight: 80, resize: "vertical", fontFamily: font.sans }}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: r.split, gap: 14 }}>
            <Field label={t.fieldTone}>
              <SelectField value={s.tone} onChange={(v) => set("tone", v as AgentSettings["tone"])} options={TONES} />
            </Field>
            <Field label={t.fieldReplyLanguage}>
              <SelectField
                value={s.responseLanguage}
                onChange={(v) => set("responseLanguage", v as AgentSettings["responseLanguage"])}
                options={LANGUAGES}
              />
            </Field>
          </div>
        </SettingCard>

        <SettingCard title={t.autonomyTitle} desc={t.autonomyDesc}>
          <Field label={t.fieldAutonomy} hint={autonomyDesc}>
            <Seg value={s.autonomy} onChange={(v) => set("autonomy", v)} options={AUTONOMY_LEVELS} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: r.split, gap: 14 }}>
            <Field label={t.fieldApprovalOver} hint={t.fieldApprovalOverHint}>
              <input
                type="number"
                min={0}
                value={s.approvalAmount}
                onChange={(e) => set("approvalAmount", Number(e.target.value) || 0)}
                style={sInput}
              />
            </Field>
            <Field label={t.fieldDailyActionLimit} hint={t.fieldDailyActionLimitHint}>
              <input
                type="number"
                min={0}
                value={s.dailyActionLimit}
                onChange={(e) => set("dailyActionLimit", Number(e.target.value) || 0)}
                style={sInput}
              />
            </Field>
          </div>
          <Toggle
            on={s.approveExternalSends}
            onChange={(v) => set("approveExternalSends", v)}
            label={t.toggleApproveExternal}
            desc={t.toggleApproveExternalDesc}
          />
        </SettingCard>

        <SettingCard title={t.scheduleTitle} desc={t.scheduleDesc}>
          <Toggle
            on={s.alwaysOn}
            onChange={(v) => set("alwaysOn", v)}
            label={t.toggleAlwaysOn}
            desc={t.toggleAlwaysOnDesc}
          />
          {!s.alwaysOn && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: r.split, gap: 14 }}>
                <Field label={t.fieldStart}>
                  <input type="time" value={s.workStart} onChange={(e) => set("workStart", e.target.value)} style={sInput} />
                </Field>
                <Field label={t.fieldEnd}>
                  <input type="time" value={s.workEnd} onChange={(e) => set("workEnd", e.target.value)} style={sInput} />
                </Field>
              </div>
              <Field label={t.fieldWorkingDays}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {WEEKDAYS.map((d, i) => (
                    <Chip key={i} label={d} on={s.workDays.includes(i)} onClick={() => toggleDay(i)} />
                  ))}
                </div>
              </Field>
            </>
          )}
          <div style={{ display: "grid", gridTemplateColumns: r.split, gap: 14 }}>
            <Field label={t.fieldTimezone}>
              <SelectField
                value={s.timezone}
                onChange={(v) => set("timezone", v)}
                options={TIMEZONES.map((tz) => ({ id: tz, label: tz }))}
              />
            </Field>
            <Field label={t.fieldHeartbeat} hint={t.fieldHeartbeatHint}>
              <SelectField
                value={String(s.heartbeatMinutes)}
                onChange={(v) => set("heartbeatMinutes", Number(v))}
                options={[
                  { id: "5", label: t.heartbeat5 },
                  { id: "15", label: t.heartbeat15 },
                  { id: "30", label: t.heartbeat30 },
                  { id: "60", label: t.heartbeat60 },
                ]}
              />
            </Field>
          </div>
        </SettingCard>

        <SettingCard title={t.modelTitle} badge={t.modelBadge} desc={t.modelDesc}>
          <Field label={t.fieldModel}>
            <SelectField value={s.model} onChange={(v) => set("model", v)} options={MODELS} />
          </Field>
          <Field label={t.fieldCreativity(s.temperature.toFixed(1))}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={s.temperature}
              onChange={(e) => set("temperature", Number(e.target.value))}
              style={{ width: "100%", accentColor: c.lime }}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: r.split, gap: 14 }}>
            <Field label={t.fieldMaxTokens}>
              <input
                type="number"
                min={256}
                step={256}
                value={s.maxTokens}
                onChange={(e) => set("maxTokens", Number(e.target.value) || 4096)}
                style={sInput}
              />
            </Field>
            <Field label={t.fieldReasoningDepth}>
              <Seg value={s.reasoningEffort} onChange={(v) => set("reasoningEffort", v)} options={REASONING_EFFORTS} />
            </Field>
          </div>
        </SettingCard>

        <SettingCard
          title={t.skillsTitle}
          badge="OPENCLAW"
          badgeColor="#E8804F"
          desc={t.skillsDesc}
        >
          <Field label={t.fieldSkills}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {SKILLS.map((sk) => (
                <Chip key={sk.id} label={sk.label} on={s.skills.includes(sk.id)} onClick={() => toggleSkill(sk.id)} />
              ))}
            </div>
          </Field>
          <Field label={t.fieldLocalExecution}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {TOOLS.map((tool) => (
                <Toggle
                  key={tool.id}
                  on={s.tools[tool.id]}
                  onChange={(v) => set("tools", { ...s.tools, [tool.id]: v })}
                  label={tool.label}
                  desc={tool.desc}
                />
              ))}
            </div>
          </Field>
        </SettingCard>

        <SettingCard
          title={t.learningTitle}
          badge="HERMES"
          badgeColor={c.blue}
          desc={t.learningDesc}
        >
          <Toggle
            on={s.selfImprove}
            onChange={(v) => set("selfImprove", v)}
            label={t.toggleSelfImprove}
            desc={t.toggleSelfImproveDesc}
          />
          <Toggle
            on={s.autoCreateSkills}
            onChange={(v) => set("autoCreateSkills", v)}
            label={t.toggleAutoCreateSkills}
            desc={t.toggleAutoCreateSkillsDesc}
          />
        </SettingCard>

        <SettingCard title={t.memoryTitle} desc={t.memoryDesc}>
          <Toggle
            on={s.memoryEnabled}
            onChange={(v) => set("memoryEnabled", v)}
            label={t.togglePersistentMemory}
            desc={t.togglePersistentMemoryDesc}
          />
          <Field label={t.fieldRetention}>
            <input
              type="number"
              min={1}
              value={s.retentionDays}
              onChange={(e) => set("retentionDays", Number(e.target.value) || 90)}
              style={{ ...sInput, maxWidth: 160 }}
            />
          </Field>
          <Field label={t.fieldKnowledgeSources} hint={t.fieldKnowledgeSourcesHint}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={knowledgeDraft}
                onChange={(e) => setKnowledgeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKnowledge();
                  }
                }}
                placeholder={t.knowledgePlaceholder}
                style={{ ...sInput, flex: 1, minWidth: 200 }}
              />
              <Btn
                onClick={addKnowledge}
                hoverStyle={{ borderColor: c.accent, color: c.accent }}
                style={{
                  border: `1px solid ${c.borderStrong}`,
                  background: "transparent",
                  color: c.muted,
                  padding: "0 16px",
                  fontFamily: font.space,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {t.addBtn}
              </Btn>
            </div>
            {s.knowledgeUrls.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                {s.knowledgeUrls.map((u) => (
                  <div
                    key={u}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      border: `1px solid ${c.line}`,
                      padding: "8px 12px",
                      fontFamily: font.mono,
                      fontSize: 12.5,
                      color: c.text2,
                    }}
                  >
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u}
                    </span>
                    <button
                      onClick={() => set("knowledgeUrls", s.knowledgeUrls.filter((x) => x !== u))}
                      style={{ background: "none", border: "none", color: c.faint, cursor: "pointer", fontSize: 14 }}
                      aria-label={t.removeAria}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Field>
        </SettingCard>

        <SettingCard title={t.channelsTitle} desc={t.channelsDesc}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CHANNEL_OPTIONS.map((type) => (
              <Chip
                key={type}
                label={CHANNEL_LABEL[type] ?? type}
                on={channels.includes(type)}
                onClick={() => toggleChannel(type)}
              />
            ))}
          </div>
        </SettingCard>

        <SettingCard title={t.escalationTitle} desc={t.escalationDesc}>
          <Field label={t.fieldEscalateTo}>
            <input
              value={s.escalateTo}
              onChange={(e) => set("escalateTo", e.target.value)}
              placeholder={t.escalateToPlaceholder}
              style={sInput}
            />
          </Field>
          <Toggle on={s.notifyNeedsReview} onChange={(v) => set("notifyNeedsReview", v)} label={t.toggleNotifyReview} />
          <Toggle on={s.notifyErrors} onChange={(v) => set("notifyErrors", v)} label={t.toggleNotifyErrors} />
          <div style={{ display: "flex", gap: 18, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Toggle on={s.dailyDigest} onChange={(v) => set("dailyDigest", v)} label={t.toggleDailyDigest} />
            {s.dailyDigest && (
              <Field label={t.fieldDigestTime}>
                <input type="time" value={s.digestTime} onChange={(e) => set("digestTime", e.target.value)} style={{ ...sInput, width: 130 }} />
              </Field>
            )}
          </div>
        </SettingCard>

        <SettingCard title={t.limitsTitle} desc={t.limitsDesc}>
          <Field label={t.fieldMonthlyCap} hint={t.fieldMonthlyCapHint}>
            <input
              type="number"
              min={0}
              step={1000}
              value={s.monthlyCreditCap}
              onChange={(e) => set("monthlyCreditCap", Number(e.target.value) || 0)}
              style={{ ...sInput, maxWidth: 200 }}
            />
          </Field>
        </SettingCard>
      </div>

      {/* ---- Sidebar: save + runtime + danger ---- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              background: c.lime,
              color: c.ink,
              border: "none",
              padding: "13px 20px",
              fontFamily: font.space,
              fontWeight: 700,
              fontSize: 14,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? t.saving : saved ? t.saved : t.saveChanges}
          </button>
          <div style={{ fontSize: 12, color: c.faint }}>
            {t.saveNote}
          </div>
          {error && <div style={{ fontFamily: font.mono, fontSize: 11, color: c.red }}>{error}</div>}
        </div>

        <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: 20 }}>
          <div style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: ".12em", color: c.muted, marginBottom: 14 }}>
            {t.runtime}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: c.faint }}>{t.runtimeEngine}</span>
              <span style={{ fontFamily: font.mono, fontSize: 12.5 }}>{ENGINE_LABEL[cur.engine] ?? cur.engine}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: c.faint }}>{t.runtimeMachine}</span>
              <span style={{ fontFamily: font.mono, fontSize: 12.5 }}>
                {cur.vmId}@{cur.vmRegion}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: c.faint }}>{t.runtimeStatus}</span>
              <span style={{ fontFamily: font.mono, fontSize: 12.5, color: display.color }}>{display.label}</span>
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
          {paused ? t.resumeAgent : t.pauseAgent}
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
          {t.terminateAgent}
        </Btn>
        <div style={{ border: `1px dashed ${c.border}`, padding: "12px 14px", fontSize: 12.5, color: c.faint }}>
          {t.dangerNote}
        </div>
      </div>
    </div>
  );
}

function AgentDetailInner() {
  const { lang } = useApp();
  const t = fleetDetail[lang];
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
        setError(e instanceof ApiError ? e.message : t.loadAgentError);
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
        else setError(e instanceof ApiError ? e.message : t.loadAgentError);
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
        {t.loadingAgent}
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
            {t.notFoundTitle}
          </div>
          <div style={{ fontSize: 14, color: c.muted, marginBottom: 24 }}>
            {t.notFoundBody}
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
            {t.allAgents}
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
          {error ?? t.loadAgentError}
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
        {t.allAgents}
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
            <div>{t.statUptime}</div>
            <div style={{ color: c.text2, fontSize: 14, marginTop: 4 }}>
              {uptimeText(cur.uptimeStartedAt ? String(cur.uptimeStartedAt) : null)}
            </div>
          </div>
          <div>
            <div>{t.statCredits}</div>
            <div style={{ color: c.text2, fontSize: 14, marginTop: 4 }}>
              {cur.creditsUsed.toLocaleString()}
            </div>
          </div>
          <div>
            <div>{t.statStatus}</div>
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
        {TAB_IDS.map((id) => {
          const on = tab === id;
          const label =
            id === "activity"
              ? t.tabActivity
              : id === "tasks"
                ? t.tabTasks
                : id === "chat"
                  ? t.tabChat
                  : id === "performance"
                    ? t.tabPerformance
                    : t.tabSettings;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
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
              {label}
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
