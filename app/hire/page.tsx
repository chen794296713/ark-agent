"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { api, ApiError, type RoleDTO } from "@/lib/client-api";
import { ENGINE_LABEL, planLabel } from "@/lib/agent-display";
import { isHarness, type Harness } from "@/lib/harness";
import { Btn } from "@/components/ui";
import { useApp } from "@/lib/store";
import { hire } from "@/lib/i18n/hire";
import { create } from "@/lib/i18n/create";
import { getTranslatedRole } from "@/lib/i18n/roles";

const LIME = c.lime;
const ACCENT = c.accent;
// Both are theme tokens; the trailing hex comments they used to carry named
// only the dark values and went stale the moment a second palette existed.
const INKBG = c.panel;
const BORD = c.border;
const CUSTOM_ROLE_ID = "custom";
const ROLE_PAGE_SIZE = 10;

/** Channel picker labels mapped to API type strings. Labels are set dynamically from i18n. */
const CHANNEL_TYPES = [
  "telegram",
  "whatsapp",
  "wechat",
  "line",
  "slack",
  "email",
] as const;
type ChannelType = (typeof CHANNEL_TYPES)[number];

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
  const [roleSearch, setRoleSearch] = useState("");
  const [rolePage, setRolePage] = useState(1);
  const [customRoleName, setCustomRoleName] = useState("");

  const [hireStep, setHireStep] = useState(1);
  const [selRole, setSelRole] = useState<string>("");
  const [agentName, setAgentName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [rules, setRules] = useState("");
  const [remind, setRemind] = useState(t.remindDefault);
  const [taskDraft, setTaskDraft] = useState("");
  const [tasks, setTasks] = useState<string[]>(() => [...t.tasksDefault]);
  const [engine, setEngine] = useState("auto");
  const [channels, setChannels] = useState<Record<ChannelType, boolean>>(() =>
    Object.fromEntries(
      CHANNEL_TYPES.map((type) => [type, type === "telegram" || type === "whatsapp"]),
    ) as Record<ChannelType, boolean>,
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
        setRolePage(1);
        // Honor a ?role= preselect when valid, else first role.
        setSelRole((cur) => {
          if (cur && rs.some((x) => x.id === cur)) return cur;
          if (preRole && rs.some((x) => x.id === preRole)) return preRole;
          return rs.find((x) => x.id !== CUSTOM_ROLE_ID)?.id ?? rs[0]?.id ?? "";
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

  const orderedRoles = useMemo(
    () => [...roles].sort((a, b) => {
      if (a.id === CUSTOM_ROLE_ID) return -1;
      if (b.id === CUSTOM_ROLE_ID) return 1;
      return 0;
    }),
    [roles],
  );

  const filteredRoles = useMemo(() => {
    const query = roleSearch.trim().toLocaleLowerCase();
    if (!query) return orderedRoles;
    return orderedRoles.filter((role) =>
      [
        role.id === CUSTOM_ROLE_ID ? t.customRoleName : role.name,
        role.id === CUSTOM_ROLE_ID ? t.customRoleBlurb : role.blurb,
        role.categoryName,
        role.uploadFilename,
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(query)),
    );
  }, [orderedRoles, roleSearch, t.customRoleBlurb, t.customRoleName]);

  const totalRolePages = Math.max(1, Math.ceil(filteredRoles.length / ROLE_PAGE_SIZE));
  const currentRolePage = Math.min(rolePage, totalRolePages);
  const visibleRoles = filteredRoles.slice(
    (currentRolePage - 1) * ROLE_PAGE_SIZE,
    currentRolePage * ROLE_PAGE_SIZE,
  );

  const isCustomRole = selRole === CUSTOM_ROLE_ID;

  // Translated role name and blurb for display
  const selRoleDisplay = useMemo(
    () => {
      if (!selRoleObj) return null;
      if (selRoleObj.id === CUSTOM_ROLE_ID) {
        return {
          name: customRoleName.trim() || t.customRoleName,
          blurb: t.customRoleBlurb,
        };
      }
      return getTranslatedRole(selRoleObj.id, selRoleObj.name, selRoleObj.blurb, lang);
    },
    [customRoleName, lang, selRoleObj, t.customRoleBlurb, t.customRoleName],
  );

  const genInstr = async () => {
    if (genBusyI || !selRoleObj) return;
    setGenBusyI(true);
    try {
      const { text } = await api.generateBrief({
        roleId: selRoleObj.id,
        field: "instructions",
        agentName: agentName.trim() || undefined,
        tasks: tasks.length ? tasks : undefined,
        locale: lang,
      });
      setInstructions(text || selRoleObj.defaultInstructions || "");
    } catch {
      setInstructions(selRoleObj.defaultInstructions || "");
    } finally {
      setGenBusyI(false);
    }
  };
  const genRules = async () => {
    if (genBusyR || !selRoleObj) return;
    setGenBusyR(true);
    try {
      const { text } = await api.generateBrief({
        roleId: selRoleObj.id,
        field: "rules",
        agentName: agentName.trim() || undefined,
        tasks: tasks.length ? tasks : undefined,
        locale: lang,
      });
      setRules(text || selRoleObj.defaultRules || "");
    } catch {
      setRules(selRoleObj.defaultRules || "");
    } finally {
      setGenBusyR(false);
    }
  };

  const addTask = () => {
    const v = taskDraft.trim();
    if (!v) return;
    setTasks((t) => t.concat([v]));
    setTaskDraft("");
  };

  // Selected channel TYPE strings (e.g. ["telegram","whatsapp"]).
  const chanTypes = CHANNEL_TYPES.filter((type) => channels[type]);

  // Channel labels from i18n
  const getChannelLabel = (type: ChannelType): string => {
    switch (type) {
      case "telegram": return t.channelTelegram;
      case "whatsapp": return t.channelWhatsApp;
      case "wechat": return t.channelWeChat;
      case "line": return t.channelLINE;
      case "slack": return t.channelSlack;
      case "email": return t.channelEmail;
    }
  };

  const chanLabels = chanTypes.map(getChannelLabel);
  const revName = agentName.trim() || selRoleDisplay?.name || "Aria";

  // Engine actually used: explicit pick, or the role's default for auto-match.
  const resolvedEngine: Harness =
    isHarness(engine)
      ? engine
      : selRoleObj?.defaultEngine ?? "openclaw";
  const engineName =
    engine === "auto"
      ? t.engineAuto
      : ENGINE_LABEL[engine] ?? "OpenClaw";

  const planTier: "associate" | "professional" | "director" =
    selRoleObj?.minPlan ?? "professional";

  const launchDone = launchStep >= 4 && !!createdId;

  const canNext = hireStep === 1
    ? !!selRole && (!isCustomRole || !!customRoleName.trim())
    : true;
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
        ...(selRoleObj.managerAgentId !== undefined
          ? { managerAgentId: selRoleObj.managerAgentId }
          : {}),
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
              <p style={{ color: c.muted, margin: "0 0 20px" }}>
                {t.s1Sub}
              </p>

              {/* The AI-guided alternative (docs/UI_DESIGN_V2.md §C). This
                  wizard is NOT replaced — a user who already knows which role
                  they want still picks a tile below. Copy lives in
                  lib/i18n/create.ts because it belongs to that flow. */}
              <div
                style={{
                  border: `1px solid ${c.limeBorder}`,
                  background: c.limeWash,
                  borderRadius: r.radiusMd,
                  padding: "14px 16px",
                  margin: "0 0 32px",
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ flex: "1 1 260px", fontSize: 13.5, color: c.text2, lineHeight: 1.6 }}>
                  {create[lang].entry.hint}
                </span>
                <Btn
                  onClick={() => router.push("/hire/create")}
                  style={{
                    border: `1px solid ${c.borderStrong}`,
                    background: "none",
                    borderRadius: r.radiusSm,
                    color: c.text,
                    fontFamily: font.sans,
                    fontSize: 13.5,
                    padding: "9px 14px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  hoverStyle={{ borderColor: c.accent, color: c.text }}
                >
                  {create[lang].entry.cta}
                </Btn>
              </div>

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
                <>
                  <input
                    type="search"
                    value={roleSearch}
                    onChange={(e) => {
                      setRoleSearch(e.target.value);
                      setRolePage(1);
                    }}
                    placeholder={t.searchRolesPlaceholder}
                    aria-label={t.searchRolesPlaceholder}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      marginBottom: 14,
                      background: c.panel,
                      border: `1px solid ${c.border}`,
                      color: c.text,
                      padding: "12px 14px",
                      fontSize: 14.5,
                      fontFamily: font.sans,
                      outline: "none",
                      borderRadius: r.radiusSm,
                    }}
                  />
                  {filteredRoles.length === 0 ? (
                    <div
                      style={{
                        border: `1px solid ${c.border}`,
                        background: c.panel,
                        padding: "18px 22px",
                        fontSize: 14,
                        color: c.muted,
                      }}
                    >
                      {t.noRolesMatch}
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: r.col2,
                        gap: 12,
                      }}
                    >
                      {visibleRoles.map((role) => {
                        const sel = selRole === role.id;
                        const translated = role.id === CUSTOM_ROLE_ID
                          ? { name: t.customRoleName, blurb: t.customRoleBlurb }
                          : getTranslatedRole(role.id, role.name, role.blurb, lang);
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
                              minHeight: 112,
                              boxSizing: "border-box",
                              borderRadius: r.radiusMd,
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
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  fontFamily: font.space,
                                  fontWeight: 700,
                                  fontSize: 15.5,
                                  lineHeight: "20px",
                                  display: "-webkit-box",
                                  WebkitBoxOrient: "vertical",
                                  WebkitLineClamp: 2,
                                  overflow: "hidden",
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {translated.name}
                              </div>
                              {role.id === CUSTOM_ROLE_ID && sel ? (
                                <input
                                  value={customRoleName}
                                  onChange={(e) => setCustomRoleName(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder={t.customRolePlaceholder}
                                  aria-label={t.customRoleName}
                                  autoFocus
                                  style={{
                                    width: "100%",
                                    boxSizing: "border-box",
                                    marginTop: 7,
                                    background: c.panelDeep,
                                    border: `1px solid ${customRoleName.trim() ? c.limeBorder : c.border}`,
                                    color: c.text,
                                    padding: "8px 10px",
                                    fontSize: 13,
                                    fontFamily: font.sans,
                                    outline: "none",
                                    borderRadius: r.radiusSm,
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    marginTop: 4,
                                    fontSize: 12.5,
                                    lineHeight: "18px",
                                    color: c.muted,
                                    display: "-webkit-box",
                                    WebkitBoxOrient: "vertical",
                                    WebkitLineClamp: 3,
                                    overflow: "hidden",
                                    overflowWrap: "anywhere",
                                  }}
                                >
                                  {translated.blurb}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {totalRolePages > 1 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        marginTop: 16,
                      }}
                    >
                      <Btn
                        type="button"
                        disabled={currentRolePage === 1}
                        onClick={() => setRolePage(Math.max(1, currentRolePage - 1))}
                        style={{
                          border: `1px solid ${c.borderStrong}`,
                          background: "transparent",
                          color: currentRolePage === 1 ? c.faint : c.text2,
                          padding: "8px 12px",
                          fontFamily: font.sans,
                          fontSize: 13,
                          cursor: currentRolePage === 1 ? "default" : "pointer",
                          opacity: currentRolePage === 1 ? 0.55 : 1,
                          borderRadius: r.radiusSm,
                        }}
                        hoverStyle={{ color: c.accent, borderColor: c.limeBorder }}
                      >
                        ← {t.rolePrevious}
                      </Btn>
                      <span style={{ color: c.muted, fontSize: 12.5, fontFamily: font.mono }}>
                        {t.rolePage(currentRolePage, totalRolePages)}
                      </span>
                      <Btn
                        type="button"
                        disabled={currentRolePage === totalRolePages}
                        onClick={() => setRolePage(Math.min(totalRolePages, currentRolePage + 1))}
                        style={{
                          border: `1px solid ${c.borderStrong}`,
                          background: "transparent",
                          color: currentRolePage === totalRolePages ? c.faint : c.text2,
                          padding: "8px 12px",
                          fontFamily: font.sans,
                          fontSize: 13,
                          cursor: currentRolePage === totalRolePages ? "default" : "pointer",
                          opacity: currentRolePage === totalRolePages ? 0.55 : 1,
                          borderRadius: r.radiusSm,
                        }}
                        hoverStyle={{ color: c.accent, borderColor: c.limeBorder }}
                      >
                        {t.roleNext} →
                      </Btn>
                    </div>
                  )}
                </>
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
              <p style={{ color: c.muted, margin: "0 0 14px" }}>
                {t.s2Hiring(selRoleDisplay?.name ?? "—")}
              </p>
              {selRoleDisplay?.blurb && (
                <div
                  style={{
                    borderLeft: `2px solid ${c.limeBorder}`,
                    paddingLeft: 14,
                    marginBottom: 32,
                  }}
                >
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10.5,
                      letterSpacing: ".1em",
                      color: c.accent,
                      marginBottom: 5,
                    }}
                  >
                    {/* {t.roleDescription} */}
                  </div>
                  <p
                    style={{
                      margin: 0,
                      color: c.text2,
                      fontSize: 14,
                      lineHeight: 1.6,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {selRoleDisplay.blurb}
                  </p>
                </div>
              )}
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
                      borderRadius: r.radiusSm,
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
                      borderRadius: r.radiusSm,
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
                      borderRadius: r.radiusSm,
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
                          borderRadius: r.radiusSm,
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
                        borderRadius: r.radiusSm,
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
                        borderRadius: r.radiusSm,
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
                      borderRadius: r.radiusSm,
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
                    borderRadius: r.radiusMd,
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
                    borderRadius: r.radiusMd,
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
                        color: c.orange,
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
                    borderRadius: r.radiusMd,
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
                {CHANNEL_TYPES.map((type) => {
                  const on = channels[type];
                  return (
                    <button
                      key={type}
                      onClick={() =>
                        setChannels((cs) => ({ ...cs, [type]: !cs[type] }))
                      }
                      style={{
                        border: "1px solid " + (on ? ACCENT : BORD),
                        background: on ? c.limeWash : "transparent",
                        color: on ? c.text : c.muted,
                        padding: "10px 18px",
                        fontSize: 14,
                        fontFamily: font.sans,
                        cursor: "pointer",
                        borderRadius: r.radiusSm,
                      }}
                    >
                      {getChannelLabel(type)}
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
                  borderRadius: r.radiusMd,
                  overflow: "hidden",
                }}
              >
                {[
                  { k: t.rowRole, v: selRoleDisplay?.name ?? "—", last: false },
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
                    borderRadius: r.radiusMd,
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
                    borderRadius: r.radiusMd,
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
                    borderRadius: r.radiusMd,
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
                      color: c.greenInk,
                      border: "none",
                      padding: "12px 22px",
                      fontFamily: font.space,
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      borderRadius: r.radiusSm,
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
                  borderRadius: r.radiusSm,
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
