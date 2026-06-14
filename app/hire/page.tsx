"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { api, ApiError, type RoleDTO } from "@/lib/client-api";
import { ENGINE_LABEL, planLabel } from "@/lib/agent-display";
import { Btn } from "@/components/ui";
import { useApp } from "@/lib/store";
import { hire } from "@/lib/i18n/hire";

const LIME = c.lime;
const ACCENT = c.accent;
const INKBG = c.panel; // #0E1116
const BORD = c.border; // #232B38

/** Channel picker labels (incl. native script) mapped to API type strings. */
const CHANNEL_OPTIONS: { label: string; type: string; on: boolean }[] = [
  { label: "Telegram", type: "telegram", on: true },
  { label: "WhatsApp", type: "whatsapp", on: true },
  { label: "WeChat 微信", type: "wechat", on: false },
  { label: "LINE", type: "line", on: false },
  { label: "Slack", type: "slack", on: false },
  { label: "Email", type: "email", on: false },
];

function HireInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { lang } = useApp();
  const t = hire[lang];

  const preRole = params.get("role");

  // ---- roles catalog (from API) ----
  const [roles, setRoles] = useState<RoleDTO[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);

  const [hireStep, setHireStep] = useState(1);
  const [selRole, setSelRole] = useState<string>("");
  const [agentName, setAgentName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [rules, setRules] = useState("");
  const [remind, setRemind] = useState(t.remindDefault);
  const [taskDraft, setTaskDraft] = useState("");
  const [tasks, setTasks] = useState<string[]>(() => [...t.tasksDefault]);
  const [engine, setEngine] = useState("auto");
  const [channels, setChannels] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CHANNEL_OPTIONS.map((o) => [o.type, o.on])),
  );
  const [genBusyI, setGenBusyI] = useState(false);
  const [genBusyR, setGenBusyR] = useState(false);

  const [launching, setLaunching] = useState(false);
  const [launchStep, setLaunchStep] = useState(-1);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const lvRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (lvRef.current) clearInterval(lvRef.current);
    };
  }, []);

  // Fetch the role catalog on mount. (rolesLoading starts true, rolesError null.)
  useEffect(() => {
    let alive = true;
    api
      .roles()
      .then(({ roles: rs }) => {
        if (!alive) return;
        setRoles(rs);
        // Honor a ?role= preselect when valid, else first role.
        setSelRole((cur) => {
          if (cur && rs.some((x) => x.id === cur)) return cur;
          if (preRole && rs.some((x) => x.id === preRole)) return preRole;
          return rs[0]?.id ?? "";
        });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 401) {
          router.push("/auth");
          return;
        }
        setRolesError(err instanceof ApiError ? err.message : t.rolesLoadError);
      })
      .finally(() => {
        if (alive) setRolesLoading(false);
      });
    return () => {
      alive = false;
    };
    // preRole is read once on mount; router is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selRoleObj = useMemo(
    () => roles.find((x) => x.id === selRole) || roles[0],
    [roles, selRole],
  );

  const genInstr = () => {
    if (genBusyI || !selRoleObj) return;
    setGenBusyI(true);
    setTimeout(() => {
      setInstructions(selRoleObj.defaultInstructions || "");
      setGenBusyI(false);
    }, 900);
  };
  const genRules = () => {
    if (genBusyR || !selRoleObj) return;
    setGenBusyR(true);
    setTimeout(() => {
      setRules(selRoleObj.defaultRules || "");
      setGenBusyR(false);
    }, 900);
  };

  const addTask = () => {
    const v = taskDraft.trim();
    if (!v) return;
    setTasks((t) => t.concat([v]));
    setTaskDraft("");
  };

  // Selected channel TYPE strings (e.g. ["telegram","whatsapp"]).
  const chanTypes = Object.keys(channels).filter((k) => channels[k]);
  const chanLabels = chanTypes.map(
    (t) => CHANNEL_OPTIONS.find((o) => o.type === t)?.label ?? t,
  );
  const revName = agentName.trim() || selRoleObj?.name || "Aria";

  // Engine actually used: explicit pick, or the role's default for auto-match.
  const resolvedEngine: "openclaw" | "hermes" =
    engine === "openclaw" || engine === "hermes"
      ? engine
      : selRoleObj?.defaultEngine ?? "openclaw";
  const engineName =
    engine === "auto"
      ? t.engineAuto
      : ENGINE_LABEL[engine] ?? "OpenClaw";

  const planTier: "associate" | "professional" | "director" =
    selRoleObj?.minPlan ?? "professional";

  const launchDone = launchStep >= 4 && !!createdId;

  const canNext = hireStep === 1 ? !!selRole : true;
  const nextStep = () => {
    if (!canNext) return;
    if (hireStep < 4) setHireStep(hireStep + 1);
    window.scrollTo(0, 0);
  };
  const backStep = () => {
    if (hireStep > 1) {
      setHireStep(hireStep - 1);
      setLaunching(false);
      setLaunchStep(-1);
      setLaunchError(null);
      setCreatedId(null);
      if (lvRef.current) clearInterval(lvRef.current);
    } else {
      router.push("/");
    }
  };

  const launch = () => {
    if (launching || !selRoleObj) return;
    setLaunching(true);
    setLaunchStep(0);
    setLaunchError(null);
    setCreatedId(null);

    // Run the provisioning animation in parallel with the real request.
    lvRef.current = setInterval(() => {
      setLaunchStep((ls) => {
        if (ls >= 4) {
          if (lvRef.current) clearInterval(lvRef.current);
          return ls;
        }
        return ls + 1;
      });
    }, 950);

    api
      .createAgent({
        name: revName,
        roleId: selRoleObj.id,
        engine: resolvedEngine,
        planTier,
        instructions,
        rules,
        channels: chanTypes,
        tasks,
      })
      .then(({ agent }) => {
        setCreatedId(agent.id);
      })
      .catch((err: unknown) => {
        if (lvRef.current) clearInterval(lvRef.current);
        setLaunching(false);
        setLaunchStep(-1);
        if (err instanceof ApiError && err.status === 401) {
          router.push("/auth");
          return;
        }
        setLaunchError(
          err instanceof ApiError ? err.message : t.launchFailed,
        );
      });
  };

  const enterDash = () => {
    if (createdId) router.push(`/dashboard/fleet/${createdId}`);
  };

  // Auto-advance to the dashboard once both the animation and the API resolve.
  useEffect(() => {
    if (launchDone && createdId) {
      const t = setTimeout(() => router.push(`/dashboard/fleet/${createdId}`), 600);
      return () => clearTimeout(t);
    }
  }, [launchDone, createdId, router]);

  // ----- stepper rail -----
  const stepDefs = [
    { num: "01", label: t.steps.role.label, sub: t.steps.role.sub },
    { num: "02", label: t.steps.brief.label, sub: t.steps.brief.sub },
    { num: "03", label: t.steps.engine.label, sub: t.steps.engine.sub },
    { num: "04", label: t.steps.review.label, sub: t.steps.review.sub },
  ];

  // ----- engine cards -----
  const mkEc = (id: string) => ({
    bc: engine === id ? ACCENT : BORD,
    bg: engine === id ? c.limeWash : INKBG,
    dot: engine === id ? LIME : "transparent",
    pick: () => setEngine(id),
  });
  const ec = { auto: mkEc("auto"), open: mkEc("openclaw"), hermes: mkEc("hermes") };

  // ----- launch rows -----
  const launchDefs = [
    t.launchProvisioning,
    t.launchInstalling(ENGINE_LABEL[resolvedEngine] ?? "OpenClaw"),
    t.launchLoadingBrief,
    t.launchConnecting(chanLabels.join(", ") || t.webConsole.toLowerCase()),
    t.launchLive(revName),
  ];
  const launchRows = launchDefs.map((label, i) => {
    const done = launchStep > i;
    const active = launchStep === i;
    return {
      label,
      sym: done ? "✓" : active ? "◌" : "·",
      c: done ? c.green : active ? ACCENT : c.faint,
      tc: done ? c.muted : active ? c.text : c.faint,
      op: done || active ? 1 : 0.55,
      anim: active ? "spin 1s linear infinite" : "none",
    };
  });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div
        style={{
          height: 60,
          borderBottom: `1px solid ${c.line}`,
          display: "flex",
          alignItems: "center",
          padding: `0 ${r.pagePx}`,
          gap: 24,
        }}
      >
        <Btn
          onClick={() => router.push("/")}
          style={{
            background: "none",
            border: "none",
            color: c.muted,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: font.sans,
            padding: 0,
          }}
          hoverStyle={{ color: c.text }}
        >
          {t.back}
        </Btn>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            letterSpacing: ".14em",
            color: c.accent,
          }}
        >
          {t.newHire}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: font.mono,
            fontSize: 12,
            color: c.faint,
          }}
        >
          {t.stepCounter(hireStep)}
        </span>
      </div>

      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: r.hireGrid,
          maxWidth: 1240,
          width: "100%",
          margin: "0 auto",
        }}
      >
        {/* Stepper rail */}
        <div
          style={{
            borderRight: `1px solid ${c.line}`,
            padding: `48px ${r.pagePx} 48px ${r.pagePxWide}`,
            display: "flex",
            flexDirection: "column",
            gap: 32,
          }}
        >
          {stepDefs.map((d, i) => {
            const numC =
              i + 1 === hireStep ? ACCENT : i + 1 < hireStep ? c.green : c.faint;
            const labelC =
              i + 1 === hireStep ? c.text : i + 1 < hireStep ? c.muted : c.faint;
            return (
              <div key={d.num} style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
                <span style={{ fontFamily: font.mono, fontSize: 13, color: numC }}>
                  {d.num}
                </span>
                <div>
                  <div
                    style={{
                      fontFamily: font.space,
                      fontWeight: 500,
                      fontSize: 15,
                      color: labelC,
                    }}
                  >
                    {d.label}
                  </div>
                  <div style={{ fontSize: 12.5, color: c.faint, marginTop: 2 }}>
                    {d.sub}
                  </div>
                </div>
              </div>
            );
          })}
          <div
            style={{
              marginTop: "auto",
              border: `1px solid ${c.border}`,
              padding: 16,
              fontSize: 13,
              color: c.muted,
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                color: c.accent,
                letterSpacing: ".1em",
                marginBottom: 8,
              }}
            >
              {t.tipLabel}
            </div>
            {t.tipBody}
          </div>
        </div>

        {/* Step content */}
        <div style={{ padding: `48px 0 120px ${r.pagePxWide}`, maxWidth: 760 }}>
          {/* Step 1 — Role */}
          {hireStep === 1 && (
            <>
              <h2
                style={{
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: "clamp(24px, 5vw, 32px)",
                  letterSpacing: "-.02em",
                  margin: "0 0 8px",
                }}
              >
                {t.s1Title}
              </h2>
              <p style={{ color: c.muted, margin: "0 0 32px" }}>
                {t.s1Sub}
              </p>

              {rolesLoading && (
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 13,
                    color: c.muted,
                    border: `1px solid ${c.border}`,
                    background: c.panel,
                    padding: "20px 22px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span style={{ color: ACCENT, animation: "spin 1s linear infinite", display: "inline-block" }}>
                    ◌
                  </span>
                  {t.loadingRoles}
                </div>
              )}

              {!rolesLoading && rolesError && (
                <div
                  style={{
                    border: `1px solid ${c.redBorder}`,
                    background: c.redWash,
                    padding: "18px 22px",
                    fontSize: 14,
                    color: c.text,
                  }}
                >
                  {rolesError}
                </div>
              )}

              {!rolesLoading && !rolesError && roles.length === 0 && (
                <div
                  style={{
                    border: `1px solid ${c.border}`,
                    background: c.panel,
                    padding: "18px 22px",
                    fontSize: 14,
                    color: c.muted,
                  }}
                >
                  {t.noRoles}
                </div>
              )}

              {!rolesLoading && !rolesError && roles.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: r.col2,
                    gap: 12,
                  }}
                >
                  {roles.map((role) => {
                    const sel = selRole === role.id;
                    return (
                      <div
                        key={role.id}
                        onClick={() => setSelRole(role.id)}
                        style={{
                          border: "1px solid " + (sel ? ACCENT : BORD),
                          background: sel ? c.limeWash : INKBG,
                          padding: "18px 20px",
                          cursor: "pointer",
                          display: "flex",
                          gap: 14,
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            flexShrink: 0,
                            background: role.hue,
                            color: c.ink,
                            display: "grid",
                            placeItems: "center",
                            fontFamily: font.space,
                            fontWeight: 700,
                          }}
                        >
                          {role.mono}
                        </div>
                        <div>
                          <div
                            style={{
                              fontFamily: font.space,
                              fontWeight: 700,
                              fontSize: 15.5,
                            }}
                          >
                            {role.name}
                          </div>
                          <div style={{ fontSize: 12.5, color: c.muted }}>{role.blurb}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Step 2 — Brief */}
          {hireStep === 2 && (
            <>
              <h2
                style={{
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: "clamp(24px, 5vw, 32px)",
                  letterSpacing: "-.02em",
                  margin: "0 0 8px",
                }}
              >
                {t.s2Title}
              </h2>
              <p style={{ color: c.muted, margin: "0 0 32px" }}>
                {t.s2Hiring(selRoleObj?.name ?? "—")}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div>
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      letterSpacing: ".12em",
                      color: c.muted,
                      marginBottom: 8,
                    }}
                  >
                    {t.agentName}
                  </div>
                  <input
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder={t.agentNamePlaceholder}
                    style={{
                      width: "100%",
                      maxWidth: 280,
                      background: c.panel,
                      border: `1px solid ${c.border}`,
                      color: c.text,
                      padding: "12px 14px",
                      fontSize: 15,
                      fontFamily: font.sans,
                      outline: "none",
                    }}
                  />
                </div>
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
                      {t.instructions}
                    </span>
                    <Btn
                      onClick={genInstr}
                      style={{
                        background: "none",
                        border: `1px solid ${c.limeBorder}`,
                        color: c.accent,
                        fontFamily: font.mono,
                        fontSize: 11,
                        letterSpacing: ".06em",
                        padding: "5px 10px",
                        cursor: "pointer",
                      }}
                      hoverStyle={{ background: c.limeWash }}
                    >
                      {genBusyI ? t.generating : t.autoGenerate}
                    </Btn>
                  </div>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder={t.instructionsPlaceholder}
                    style={{
                      width: "100%",
                      minHeight: 110,
                      background: c.panel,
                      border: `1px solid ${c.border}`,
                      color: c.text,
                      padding: "12px 14px",
                      fontSize: 15,
                      fontFamily: font.sans,
                      outline: "none",
                      resize: "vertical",
                    }}
                  />
                </div>
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
                      {t.rules}
                    </span>
                    <Btn
                      onClick={genRules}
                      style={{
                        background: "none",
                        border: `1px solid ${c.limeBorder}`,
                        color: c.accent,
                        fontFamily: font.mono,
                        fontSize: 11,
                        letterSpacing: ".06em",
                        padding: "5px 10px",
                        cursor: "pointer",
                      }}
                      hoverStyle={{ background: c.limeWash }}
                    >
                      {genBusyR ? t.generating : t.autoGenerate}
                    </Btn>
                  </div>
                  <textarea
                    value={rules}
                    onChange={(e) => setRules(e.target.value)}
                    placeholder={t.rulesPlaceholder}
                    style={{
                      width: "100%",
                      minHeight: 80,
                      background: c.panel,
                      border: `1px solid ${c.border}`,
                      color: c.text,
                      padding: "12px 14px",
                      fontSize: 15,
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
                      letterSpacing: ".12em",
                      color: c.muted,
                      marginBottom: 8,
                    }}
                  >
                    {t.firstTasks}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    {tasks.map((txt, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          border: `1px solid ${c.border}`,
                          background: c.panel,
                          padding: "10px 14px",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: 12,
                            color: c.accent,
                          }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span style={{ fontSize: 14.5, color: c.text2, flex: 1 }}>
                          {txt}
                        </span>
                        <Btn
                          onClick={() => setTasks((t) => t.filter((_, j) => j !== i))}
                          style={{
                            background: "none",
                            border: "none",
                            color: c.faint,
                            cursor: "pointer",
                            fontSize: 15,
                            padding: 0,
                          }}
                          hoverStyle={{ color: c.red }}
                        >
                          ✕
                        </Btn>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={taskDraft}
                      onChange={(e) => setTaskDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addTask();
                      }}
                      placeholder={t.addTaskPlaceholder}
                      style={{
                        flex: 1,
                        background: c.panel,
                        border: `1px dashed ${c.borderStrong}`,
                        color: c.text,
                        padding: "11px 14px",
                        fontSize: 14.5,
                        fontFamily: font.sans,
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={addTask}
                      style={{
                        border: `1px solid ${c.borderStrong}`,
                        background: "transparent",
                        color: c.accent,
                        padding: "0 18px",
                        fontFamily: font.space,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      {t.addTask}
                    </button>
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      letterSpacing: ".12em",
                      color: c.muted,
                      marginBottom: 8,
                    }}
                  >
                    {t.reminders}
                  </div>
                  <input
                    value={remind}
                    onChange={(e) => setRemind(e.target.value)}
                    style={{
                      width: "100%",
                      background: c.panel,
                      border: `1px solid ${c.border}`,
                      color: c.text,
                      padding: "12px 14px",
                      fontSize: 15,
                      fontFamily: font.sans,
                      outline: "none",
                    }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Step 3 — Engine & channels */}
          {hireStep === 3 && (
            <>
              <h2
                style={{
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: "clamp(24px, 5vw, 32px)",
                  letterSpacing: "-.02em",
                  margin: "0 0 8px",
                }}
              >
                {t.s3Title}
              </h2>
              <p style={{ color: c.muted, margin: "0 0 32px" }}>
                {t.s3Sub}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: r.col3,
                  gap: 12,
                  marginBottom: 40,
                }}
              >
                <div
                  onClick={ec.auto.pick}
                  style={{
                    border: "1px solid " + ec.auto.bc,
                    background: ec.auto.bg,
                    padding: "22px 20px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10.5,
                        letterSpacing: ".1em",
                        color: c.accent,
                      }}
                    >
                      {t.recommended}
                    </span>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: `1px solid ${c.limeBorder}`,
                        background: ec.auto.dot,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontFamily: font.space,
                      fontWeight: 700,
                      fontSize: 19,
                      marginBottom: 6,
                    }}
                  >
                    {t.autoMatch}
                  </div>
                  <div style={{ fontSize: 13, color: c.muted }}>
                    {t.autoMatchBlurb}
                  </div>
                </div>
                <div
                  onClick={ec.open.pick}
                  style={{
                    border: "1px solid " + ec.open.bc,
                    background: ec.open.bg,
                    padding: "22px 20px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10.5,
                        letterSpacing: ".1em",
                        color: "#E8804F",
                      }}
                    >
                      {t.community}
                    </span>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: `1px solid ${c.limeBorder}`,
                        background: ec.open.dot,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontFamily: font.space,
                      fontWeight: 700,
                      fontSize: 19,
                      marginBottom: 6,
                    }}
                  >
                    OpenClaw
                  </div>
                  <div style={{ fontSize: 13, color: c.muted }}>
                    {t.openclawBlurb}
                  </div>
                </div>
                <div
                  onClick={ec.hermes.pick}
                  style={{
                    border: "1px solid " + ec.hermes.bc,
                    background: ec.hermes.bg,
                    padding: "22px 20px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10.5,
                        letterSpacing: ".1em",
                        color: c.blue,
                      }}
                    >
                      {t.precision}
                    </span>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: `1px solid ${c.limeBorder}`,
                        background: ec.hermes.dot,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontFamily: font.space,
                      fontWeight: 700,
                      fontSize: 19,
                      marginBottom: 6,
                    }}
                  >
                    Hermes
                  </div>
                  <div style={{ fontSize: 13, color: c.muted }}>
                    {t.hermesBlurb}
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  letterSpacing: ".12em",
                  color: c.muted,
                  marginBottom: 12,
                }}
              >
                {t.channelsLabel}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {CHANNEL_OPTIONS.map((opt) => {
                  const on = channels[opt.type];
                  return (
                    <button
                      key={opt.type}
                      onClick={() =>
                        setChannels((cs) => ({ ...cs, [opt.type]: !cs[opt.type] }))
                      }
                      style={{
                        border: "1px solid " + (on ? ACCENT : BORD),
                        background: on ? c.limeWash : "transparent",
                        color: on ? c.text : c.muted,
                        padding: "10px 18px",
                        fontSize: 14,
                        fontFamily: font.sans,
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 13, color: c.faint, marginTop: 14 }}>
                {t.channelsNote}
              </div>
            </>
          )}

          {/* Step 4 — Review & launch */}
          {hireStep === 4 && (
            <>
              <h2
                style={{
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: "clamp(24px, 5vw, 32px)",
                  letterSpacing: "-.02em",
                  margin: "0 0 8px",
                }}
              >
                {t.s4Title}
              </h2>
              <p style={{ color: c.muted, margin: "0 0 32px" }}>
                {t.s4Sub}
              </p>
              <div
                style={{
                  border: `1px solid ${c.border}`,
                  background: c.panel,
                  marginBottom: 24,
                }}
              >
                {[
                  { k: t.rowRole, v: selRoleObj?.name ?? "—", last: false },
                  { k: t.rowName, v: revName, last: false },
                  { k: t.rowEngine, v: engineName, last: false },
                  {
                    k: t.rowChannels,
                    v: chanLabels.length
                      ? chanLabels.join(" · ") + " · " + t.webSuffix
                      : t.webConsole,
                    last: false,
                  },
                  {
                    k: t.rowFirstTasks,
                    v: t.tasksQueued(tasks.length, remind.toLowerCase()),
                    last: false,
                  },
                  {
                    k: t.rowPlan,
                    v: planLabel(planTier),
                    last: true,
                  },
                ].map((row) => (
                  <div
                    key={row.k}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "16px 20px",
                      borderBottom: row.last ? undefined : `1px solid ${c.line}`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 12,
                        color: c.faint,
                      }}
                    >
                      {row.k}
                    </span>
                    <span style={{ fontSize: 14.5, color: c.text }}>{row.v}</span>
                  </div>
                ))}
              </div>

              {launchError && (
                <div
                  style={{
                    border: `1px solid ${c.redBorder}`,
                    background: c.redWash,
                    padding: "14px 20px",
                    fontSize: 14,
                    color: c.text,
                    marginBottom: 16,
                  }}
                >
                  {launchError}
                </div>
              )}

              {!launching && (
                <Btn
                  onClick={launch}
                  style={{
                    background: c.lime,
                    color: c.ink,
                    border: "none",
                    padding: "16px 32px",
                    fontFamily: font.space,
                    fontWeight: 700,
                    fontSize: 16,
                    cursor: "pointer",
                    width: "100%",
                  }}
                  hoverStyle={{ background: c.limeHover }}
                >
                  {t.launchBtn(revName)}
                </Btn>
              )}

              {launching && (
                <div
                  style={{
                    border: `1px solid ${c.limeBorder}`,
                    background: c.bg,
                    padding: 24,
                    fontFamily: font.mono,
                    fontSize: 13.5,
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  {launchRows.map((l, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 14,
                        alignItems: "center",
                        opacity: l.op,
                      }}
                    >
                      <span
                        style={{
                          color: l.c,
                          width: 16,
                          display: "inline-block",
                          animation: l.anim,
                        }}
                      >
                        {l.sym}
                      </span>
                      <span style={{ color: l.tc }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {launchDone && (
                <div
                  style={{
                    marginTop: 20,
                    border: `1px solid ${c.greenBorder}`,
                    background: c.greenWash,
                    padding: "20px 24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 20,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: font.space,
                        fontWeight: 700,
                        fontSize: 17,
                        color: c.green,
                      }}
                    >
                      {t.agentLive(revName)}
                    </div>
                    <div style={{ fontSize: 13.5, color: c.muted, marginTop: 3 }}>
                      {t.agentLiveSub}
                    </div>
                  </div>
                  <button
                    onClick={enterDash}
                    style={{
                      background: c.green,
                      color: c.ink,
                      border: "none",
                      padding: "12px 22px",
                      fontFamily: font.space,
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.openDashboard}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Footer nav */}
          {hireStep < 4 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
                marginTop: 48,
                borderTop: `1px solid ${c.line}`,
                paddingTop: 24,
              }}
            >
              <button
                onClick={backStep}
                style={{
                  background: "none",
                  border: "none",
                  color: c.muted,
                  fontSize: 14.5,
                  cursor: "pointer",
                  fontFamily: font.sans,
                  padding: 0,
                }}
              >
                {t.navBack}
              </button>
              <button
                onClick={nextStep}
                disabled={!canNext}
                style={{
                  background: canNext ? LIME : c.borderStrong,
                  color: canNext ? c.ink : c.faint,
                  border: "none",
                  padding: "13px 28px",
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: canNext ? "pointer" : "not-allowed",
                }}
              >
                {hireStep === 3 ? t.reviewNext : t.continueNext}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HirePage() {
  return (
    <Suspense fallback={null}>
      <HireInner />
    </Suspense>
  );
}
