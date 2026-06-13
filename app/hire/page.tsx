"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { api, ApiError, type RoleDTO } from "@/lib/client-api";
import { ENGINE_LABEL, planLabel } from "@/lib/agent-display";
import { Btn } from "@/components/ui";

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
  const [remind, setRemind] = useState("Daily summary at 18:00 · Weekly report Friday");
  const [taskDraft, setTaskDraft] = useState("");
  const [tasks, setTasks] = useState<string[]>([
    "Build a list of 50 target accounts",
    "Send intro sequence to new leads",
  ]);
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
        setRolesError(err instanceof ApiError ? err.message : "Couldn't load roles.");
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
      ? "Auto-match (we pick per brief)"
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
          err instanceof ApiError ? err.message : "Launch failed. Please try again.",
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
    { num: "01", label: "Role", sub: "Pick the job" },
    { num: "02", label: "Brief", sub: "Instructions & tasks" },
    { num: "03", label: "Engine & channels", sub: "OpenClaw / Hermes" },
    { num: "04", label: "Review & launch", sub: "Provision the VM" },
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
    "Provisioning dedicated VM — sgp-07 (Singapore)",
    "Installing " + (ENGINE_LABEL[resolvedEngine] ?? "OpenClaw") + " runtime",
    "Loading job brief, rules & first tasks",
    "Connecting " + (chanLabels.join(", ") || "web console"),
    revName + " is live — first task started",
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
          ← ArkAgent
        </Btn>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            letterSpacing: ".14em",
            color: c.accent,
          }}
        >
          NEW HIRE
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: font.mono,
            fontSize: 12,
            color: c.faint,
          }}
        >
          STEP {hireStep} / 4
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
              TIP
            </div>
            Write the brief like you're onboarding a sharp new hire on their first day. You can
            always add tasks later.
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
                Choose the role
              </h2>
              <p style={{ color: c.muted, margin: "0 0 32px" }}>
                Pick a ready-made role, or describe your own from scratch.
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
                  Loading roles…
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
                  No roles are available right now.
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
                Write the job brief
              </h2>
              <p style={{ color: c.muted, margin: "0 0 32px" }}>
                Hiring: <span style={{ color: c.accent }}>{selRoleObj?.name ?? "—"}</span> — plain
                language is all it needs.
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
                    AGENT NAME
                  </div>
                  <input
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="e.g. Aria"
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
                      INSTRUCTIONS
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
                      {genBusyI ? "✦ GENERATING…" : "✦ AUTO-GENERATE"}
                    </Btn>
                  </div>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Find logistics companies in Southeast Asia with 20–200 employees. Reach out on LinkedIn and email, qualify budget and timeline, then book intro calls on my calendar."
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
                      RULES &amp; BOUNDARIES
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
                      {genBusyR ? "✦ GENERATING…" : "✦ AUTO-GENERATE"}
                    </Btn>
                  </div>
                  <textarea
                    value={rules}
                    onChange={(e) => setRules(e.target.value)}
                    placeholder="Never discount more than 10%. Escalate refund requests to me. Don't contact existing customers."
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
                    FIRST TASKS
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
                      placeholder="Add a task and press Enter…"
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
                      + Add
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
                    REMINDERS &amp; SCHEDULE
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
                Engine &amp; channels
              </h2>
              <p style={{ color: c.muted, margin: "0 0 32px" }}>
                Pick the runtime — or let us match it to the brief. Add the channels you'll
                manage it from.
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
                      RECOMMENDED
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
                    Auto-match
                  </div>
                  <div style={{ fontSize: 13, color: c.muted }}>
                    We read the brief and pick. Switch anytime.
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
                      COMMUNITY
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
                    100+ skills, every chat channel, huge ecosystem.
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
                      PRECISION
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
                    Deep reasoning, guardrails, full audit trail.
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
                CHANNELS — WHERE YOU'LL TALK TO IT
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
                Web console is always included. Tokens &amp; accounts are configured in Dashboard
                → Channels after launch.
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
                Review &amp; launch
              </h2>
              <p style={{ color: c.muted, margin: "0 0 32px" }}>
                A dedicated machine will be provisioned for this agent.
              </p>
              <div
                style={{
                  border: `1px solid ${c.border}`,
                  background: c.panel,
                  marginBottom: 24,
                }}
              >
                {[
                  { k: "ROLE", v: selRoleObj?.name ?? "—", last: false },
                  { k: "NAME", v: revName, last: false },
                  { k: "ENGINE", v: engineName, last: false },
                  {
                    k: "CHANNELS",
                    v: chanLabels.length ? chanLabels.join(" · ") + " · Web" : "Web console",
                    last: false,
                  },
                  {
                    k: "FIRST TASKS",
                    v: tasks.length + " queued · reminders: " + remind.toLowerCase(),
                    last: false,
                  },
                  {
                    k: "PLAN",
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
                  ⏻ Launch {revName}
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
                      {revName} is live.
                    </div>
                    <div style={{ fontSize: 13.5, color: c.muted, marginTop: 3 }}>
                      First task started. You'll get a summary at 18:00.
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
                    Open dashboard →
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
                ← Back
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
                {hireStep === 3 ? "Review →" : "Continue →"}
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
