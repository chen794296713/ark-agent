"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { rolesData, genTexts, hireChannels } from "@/lib/data";
import { useApp } from "@/lib/store";
import { Btn } from "@/components/ui";
import type { Agent } from "@/lib/types";

const LIME = c.lime;
const INKBG = c.panel; // #0E1116
const BORD = c.border; // #232B38

function HireInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { setCreatedAgent } = useApp();

  const preRole = params.get("role");
  const initialRole =
    preRole && rolesData.some((r) => r.id === preRole) ? preRole : "prospector";

  const [hireStep, setHireStep] = useState(1);
  const [selRole, setSelRole] = useState(initialRole);
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
  const [channels, setChannels] = useState<Record<string, boolean>>({ ...hireChannels });
  const [genBusyI, setGenBusyI] = useState(false);
  const [genBusyR, setGenBusyR] = useState(false);

  const [launching, setLaunching] = useState(false);
  const [launchStep, setLaunchStep] = useState(-1);
  const lvRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (lvRef.current) clearInterval(lvRef.current);
    };
  }, []);

  const selRoleObj = useMemo(
    () => rolesData.find((r) => r.id === selRole) || rolesData[0],
    [selRole],
  );

  const gt = genTexts[selRole] || genTexts.prospector;

  const genInstr = () => {
    if (genBusyI) return;
    setGenBusyI(true);
    setTimeout(() => {
      setInstructions(gt.i);
      setGenBusyI(false);
    }, 900);
  };
  const genRules = () => {
    if (genBusyR) return;
    setGenBusyR(true);
    setTimeout(() => {
      setRules(gt.r);
      setGenBusyR(false);
    }, 900);
  };

  const addTask = () => {
    const v = taskDraft.trim();
    if (!v) return;
    setTasks((t) => t.concat([v]));
    setTaskDraft("");
  };

  const launch = () => {
    if (launching) return;
    setLaunching(true);
    setLaunchStep(0);
    lvRef.current = setInterval(() => {
      setLaunchStep((ls) => {
        if (ls >= 4) {
          if (lvRef.current) clearInterval(lvRef.current);
          return ls;
        }
        return ls + 1;
      });
    }, 950);
  };

  const chanList = Object.keys(channels).filter((k) => channels[k]);
  const revName = agentName.trim() || "Aria";
  const engineName =
    engine === "auto"
      ? "Auto-match (we pick per brief)"
      : engine === "openclaw"
        ? "OpenClaw"
        : "Hermes";

  const launchDone = launchStep >= 4;

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
    } else {
      router.push("/");
    }
  };

  const enterDash = () => {
    const created: Agent = {
      id: "created",
      name: revName,
      role: selRoleObj.name,
      engine: engine === "hermes" ? "Hermes" : "OpenClaw",
      hue: selRoleObj.hue,
      mono: revName[0].toUpperCase(),
      st: "ONBOARDING",
      sc: LIME,
      vm: "sgp-07",
      up: "0d 0h",
      credits: "0",
      chansTxt: chanList.map((ch) => ch.split(" ")[0]).join(" · ") || "Web",
      line: "Just hired · running first task",
      act: [
        {
          t: "JUST NOW",
          txt: "Started first task: " + (tasks[0] || "reviewing the job brief"),
          tag: "STARTED",
          tagC: LIME,
        },
      ],
      tasks: tasks.map((txt, i) => ({
        txt,
        sym: i === 0 ? "◌" : "·",
        c: i === 0 ? LIME : "#525B6B",
        tc: i === 0 ? "#E8ECF1" : "#9AA3B2",
        meta: i === 0 ? "IN PROGRESS" : "QUEUED",
      })),
      perfNote: "First self-review will run after one week of activity.",
      perf: [{ label: "Tasks started", val: "1", delta: "", w: "10%" }],
      queue: [],
      chat: [
        {
          who: "them",
          txt:
            "Hi! I’m " +
            revName +
            ", your new " +
            selRoleObj.name +
            ". I’ve read the brief and started on the first task. I’ll check in at 18:00 — message me here or on " +
            (chanList[0] || "the web console") +
            " anytime.",
          meta: revName.toUpperCase() + " · JUST NOW",
        },
      ],
    };
    setCreatedAgent(created);
    router.push("/dashboard");
  };

  // ----- stepper rail -----
  const stepDefs = [
    { num: "01", label: "Role", sub: "Pick the job" },
    { num: "02", label: "Brief", sub: "Instructions & tasks" },
    { num: "03", label: "Engine & channels", sub: "OpenClaw / Hermes" },
    { num: "04", label: "Review & launch", sub: "Provision the VM" },
  ];

  // ----- engine cards -----
  const mkEc = (id: string) => ({
    bc: engine === id ? LIME : BORD,
    bg: engine === id ? "#11150C" : INKBG,
    dot: engine === id ? LIME : "transparent",
    pick: () => setEngine(id),
  });
  const ec = { auto: mkEc("auto"), open: mkEc("openclaw"), hermes: mkEc("hermes") };

  // ----- launch rows -----
  const launchDefs = [
    "Provisioning dedicated VM — sgp-07 (Singapore)",
    "Installing " + (engine === "hermes" ? "Hermes" : "OpenClaw") + " runtime",
    "Loading job brief, rules & first tasks",
    "Connecting " + (chanList.join(", ") || "web console"),
    revName + " is live — first task started",
  ];
  const launchRows = launchDefs.map((label, i) => {
    const done = launchStep > i;
    const active = launchStep === i;
    return {
      label,
      sym: done ? "✓" : active ? "◌" : "·",
      c: done ? c.green : active ? LIME : "#525B6B",
      tc: done ? c.muted : active ? "#E8ECF1" : "#525B6B",
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
          borderBottom: "1px solid #1B212C",
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
            color: "#9AA3B2",
            fontSize: 14,
            cursor: "pointer",
            fontFamily: font.sans,
            padding: 0,
          }}
          hoverStyle={{ color: "#E8ECF1" }}
        >
          ← ArkAgent
        </Btn>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            letterSpacing: ".14em",
            color: "#D8FF3E",
          }}
        >
          NEW HIRE
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: font.mono,
            fontSize: 12,
            color: "#525B6B",
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
            borderRight: "1px solid #1B212C",
            padding: `48px ${r.pagePx} 48px ${r.pagePxWide}`,
            display: "flex",
            flexDirection: "column",
            gap: 32,
          }}
        >
          {stepDefs.map((d, i) => {
            const numC =
              i + 1 === hireStep ? LIME : i + 1 < hireStep ? c.green : "#525B6B";
            const labelC =
              i + 1 === hireStep ? "#E8ECF1" : i + 1 < hireStep ? "#9AA3B2" : "#525B6B";
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
                  <div style={{ fontSize: 12.5, color: "#525B6B", marginTop: 2 }}>
                    {d.sub}
                  </div>
                </div>
              </div>
            );
          })}
          <div
            style={{
              marginTop: "auto",
              border: "1px solid #232B38",
              padding: 16,
              fontSize: 13,
              color: "#9AA3B2",
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                color: "#D8FF3E",
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
              <p style={{ color: "#9AA3B2", margin: "0 0 32px" }}>
                Pick a ready-made role, or describe your own from scratch.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: r.col2,
                  gap: 12,
                }}
              >
                {rolesData.map((r) => {
                  const sel = selRole === r.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setSelRole(r.id)}
                      style={{
                        border: "1px solid " + (sel ? LIME : BORD),
                        background: sel ? "#11150C" : INKBG,
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
                          background: r.hue,
                          color: "#0B0D10",
                          display: "grid",
                          placeItems: "center",
                          fontFamily: font.space,
                          fontWeight: 700,
                        }}
                      >
                        {r.mono}
                      </div>
                      <div>
                        <div
                          style={{
                            fontFamily: font.space,
                            fontWeight: 700,
                            fontSize: 15.5,
                          }}
                        >
                          {r.name}
                        </div>
                        <div style={{ fontSize: 12.5, color: "#9AA3B2" }}>{r.blurb}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
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
              <p style={{ color: "#9AA3B2", margin: "0 0 32px" }}>
                Hiring: <span style={{ color: "#D8FF3E" }}>{selRoleObj.name}</span> — plain
                language is all it needs.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div>
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      letterSpacing: ".12em",
                      color: "#9AA3B2",
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
                      background: "#0E1116",
                      border: "1px solid #232B38",
                      color: "#E8ECF1",
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
                        color: "#9AA3B2",
                      }}
                    >
                      INSTRUCTIONS
                    </span>
                    <Btn
                      onClick={genInstr}
                      style={{
                        background: "none",
                        border: "1px solid #3A4520",
                        color: "#D8FF3E",
                        fontFamily: font.mono,
                        fontSize: 11,
                        letterSpacing: ".06em",
                        padding: "5px 10px",
                        cursor: "pointer",
                      }}
                      hoverStyle={{ background: "#11150C" }}
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
                      background: "#0E1116",
                      border: "1px solid #232B38",
                      color: "#E8ECF1",
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
                        color: "#9AA3B2",
                      }}
                    >
                      RULES &amp; BOUNDARIES
                    </span>
                    <Btn
                      onClick={genRules}
                      style={{
                        background: "none",
                        border: "1px solid #3A4520",
                        color: "#D8FF3E",
                        fontFamily: font.mono,
                        fontSize: 11,
                        letterSpacing: ".06em",
                        padding: "5px 10px",
                        cursor: "pointer",
                      }}
                      hoverStyle={{ background: "#11150C" }}
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
                      background: "#0E1116",
                      border: "1px solid #232B38",
                      color: "#E8ECF1",
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
                      color: "#9AA3B2",
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
                          border: "1px solid #232B38",
                          background: "#0E1116",
                          padding: "10px 14px",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: 12,
                            color: "#D8FF3E",
                          }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span style={{ fontSize: 14.5, color: "#C6CEDA", flex: 1 }}>
                          {txt}
                        </span>
                        <Btn
                          onClick={() => setTasks((t) => t.filter((_, j) => j !== i))}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#525B6B",
                            cursor: "pointer",
                            fontSize: 15,
                            padding: 0,
                          }}
                          hoverStyle={{ color: "#F87171" }}
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
                        background: "#0E1116",
                        border: "1px dashed #2A3342",
                        color: "#E8ECF1",
                        padding: "11px 14px",
                        fontSize: 14.5,
                        fontFamily: font.sans,
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={addTask}
                      style={{
                        border: "1px solid #2A3342",
                        background: "transparent",
                        color: "#D8FF3E",
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
                      color: "#9AA3B2",
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
                      background: "#0E1116",
                      border: "1px solid #232B38",
                      color: "#E8ECF1",
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
              <p style={{ color: "#9AA3B2", margin: "0 0 32px" }}>
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
                        color: "#D8FF3E",
                      }}
                    >
                      RECOMMENDED
                    </span>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: "1px solid #3A4520",
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
                  <div style={{ fontSize: 13, color: "#9AA3B2" }}>
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
                        border: "1px solid #3A4520",
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
                  <div style={{ fontSize: 13, color: "#9AA3B2" }}>
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
                        color: "#6AA6FF",
                      }}
                    >
                      PRECISION
                    </span>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: "1px solid #3A4520",
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
                  <div style={{ fontSize: 13, color: "#9AA3B2" }}>
                    Deep reasoning, guardrails, full audit trail.
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  letterSpacing: ".12em",
                  color: "#9AA3B2",
                  marginBottom: 12,
                }}
              >
                CHANNELS — WHERE YOU'LL TALK TO IT
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.keys(channels).map((label) => {
                  const on = channels[label];
                  return (
                    <button
                      key={label}
                      onClick={() =>
                        setChannels((cs) => ({ ...cs, [label]: !cs[label] }))
                      }
                      style={{
                        border: "1px solid " + (on ? LIME : BORD),
                        background: on ? "#11150C" : "transparent",
                        color: on ? "#E8ECF1" : "#9AA3B2",
                        padding: "10px 18px",
                        fontSize: 14,
                        fontFamily: font.sans,
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 13, color: "#525B6B", marginTop: 14 }}>
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
              <p style={{ color: "#9AA3B2", margin: "0 0 32px" }}>
                A dedicated machine will be provisioned for this agent.
              </p>
              <div
                style={{
                  border: "1px solid #232B38",
                  background: "#0E1116",
                  marginBottom: 24,
                }}
              >
                {[
                  { k: "ROLE", v: selRoleObj.name, last: false },
                  { k: "NAME", v: revName, last: false },
                  { k: "ENGINE", v: engineName, last: false },
                  {
                    k: "CHANNELS",
                    v: chanList.length ? chanList.join(" · ") + " · Web" : "Web console",
                    last: false,
                  },
                  {
                    k: "FIRST TASKS",
                    v: tasks.length + " queued · reminders: " + remind.toLowerCase(),
                    last: false,
                  },
                  {
                    k: "PLAN",
                    v: "Professional — $149/mo · 25,000 credits incl.",
                    last: true,
                  },
                ].map((row) => (
                  <div
                    key={row.k}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "16px 20px",
                      borderBottom: row.last ? undefined : "1px solid #1B212C",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 12,
                        color: "#525B6B",
                      }}
                    >
                      {row.k}
                    </span>
                    <span style={{ fontSize: 14.5, color: "#E8ECF1" }}>{row.v}</span>
                  </div>
                ))}
              </div>

              {!launching && (
                <Btn
                  onClick={launch}
                  style={{
                    background: "#D8FF3E",
                    color: "#0B0D10",
                    border: "none",
                    padding: "16px 32px",
                    fontFamily: font.space,
                    fontWeight: 700,
                    fontSize: 16,
                    cursor: "pointer",
                    width: "100%",
                  }}
                  hoverStyle={{ background: "#E9FF7A" }}
                >
                  ⏻ Launch {revName}
                </Btn>
              )}

              {launching && (
                <div
                  style={{
                    border: "1px solid #3A4520",
                    background: "#0B0D10",
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
                    border: "1px solid #1E3A2A",
                    background: "#0F1A14",
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
                        color: "#4ADE80",
                      }}
                    >
                      {revName} is live.
                    </div>
                    <div style={{ fontSize: 13.5, color: "#9AA3B2", marginTop: 3 }}>
                      First task started. You'll get a summary at 18:00.
                    </div>
                  </div>
                  <button
                    onClick={enterDash}
                    style={{
                      background: "#4ADE80",
                      color: "#0B0D10",
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
                borderTop: "1px solid #1B212C",
                paddingTop: 24,
              }}
            >
              <button
                onClick={backStep}
                style={{
                  background: "none",
                  border: "none",
                  color: "#9AA3B2",
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
                style={{
                  background: canNext ? LIME : "#2A3342",
                  color: canNext ? "#0B0D10" : "#525B6B",
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
