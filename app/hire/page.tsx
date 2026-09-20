"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { api, ApiError, type RoleDTO } from "@/lib/client-api";
import { ENGINE_LABEL, planLabel } from "@/lib/agent-display";
import { isHarness, type Harness } from "@/lib/harness";
import { useApp } from "@/lib/store";
import { hire } from "@/lib/i18n/hire";
import { create } from "@/lib/i18n/create";
import { getTranslatedRole } from "@/lib/i18n/roles";
import { getAgent } from "@/lib/agent-catalog";
import styles from "./hire.module.css";

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
  // A marketing job is a reviewed starting brief, not an interchangeable
  // manager template. Freeze the entry choice now; choose its localized copy
  // after hydration, when the role catalogue resolves and editing is enabled.
  const [agentPreset] = useState(() => {
    const slug = params.get("agent");
    const agent = slug ? getAgent(slug) : undefined;
    return { requested: slug !== null, agent };
  });
  const selectedAgent = agentPreset.agent;
  const isPresetHire = agentPreset.requested && !!selectedAgent;
  const localeRef = useRef(lang);
  const presetInitialized = useRef(false);

  useEffect(() => {
    localeRef.current = lang;
  }, [lang]);

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
        if (agentPreset.requested) {
          if (!selectedAgent || !rs.some((role) => role.id === CUSTOM_ROLE_ID)) {
            setSelRole("");
            setRolesError({
              en: "This agent brief is unavailable right now. Return to the agent directory and choose an agent again.",
              zh: "暂时无法载入此智能体的工作简报。请返回智能体目录重新选择。",
              zht: "暫時無法載入此智慧體的工作簡報。請返回智慧體目錄重新選擇。",
              ja: "このエージェントの業務設定を読み込めません。エージェント一覧に戻り、もう一度選んでください。",
            }[localeRef.current]);
            return;
          }
          if (!presetInitialized.current) {
            const copy = selectedAgent.copy[localeRef.current];
            setCustomRoleName(copy.name);
            setInstructions(copy.instructions);
            setRules(copy.rules);
            setTasks([...copy.tasks]);
            presetInitialized.current = true;
          }
          setSelRole(CUSTOM_ROLE_ID);
          return;
        }
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
        setRolesError(err instanceof ApiError ? err.message : hire[localeRef.current].rolesLoadError);
      })
      .finally(() => {
        if (alive) setRolesLoading(false);
      });
    return () => {
      alive = false;
    };
    // Entry selection is read once; localeRef supplies the hydrated locale
    // without re-running the request or replacing edited fields later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selRoleObj = useMemo(
    () => roles.find((x) => x.id === selRole),
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

  const canNext = !rolesLoading && !rolesError && !!selRoleObj &&
    (!agentPreset.requested || isCustomRole) &&
    (hireStep !== 1 || !isCustomRole || !!customRoleName.trim());
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
    if (launching || !selRoleObj || (agentPreset.requested && !isCustomRole)) return;
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

  const ui = onboardingCopy[lang];
  const presetCopy = selectedAgent && isCustomRole ? selectedAgent.copy[lang] : null;
  const stepDefs = [t.steps.role, t.steps.brief, t.steps.engine, t.steps.review];
  const engineChoices = [
    { id: "auto", name: t.autoMatch, description: t.autoMatchBlurb },
    { id: "openclaw", name: "OpenClaw", description: t.openclawBlurb },
    { id: "hermes", name: "Hermes", description: t.hermesBlurb },
  ];
  const reviewRows = [
    { label: t.rowRole, value: selRoleDisplay?.name ?? "—" },
    { label: t.rowName, value: revName },
    { label: t.rowEngine, value: engineName },
    { label: t.rowChannels, value: chanLabels.length ? `${chanLabels.join(" · ")} · ${t.webSuffix}` : t.webConsole },
    { label: t.rowPlan, value: planLabel(planTier) },
  ];
  const goToStep = (step: number) => {
    setHireStep(step);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const agentContext = presetCopy && selectedAgent ? (
    <div className={styles.agentContext}>
      <Image src={selectedAgent.image} alt="" width={112} height={140} sizes="112px" className={styles.portrait} />
      <div>
        <h2>{presetCopy.name}</h2>
        <p>{presetCopy.summary}</p>
        <span className={styles.portraitNote}>{ui.illustration}</span>
      </div>
    </div>
  ) : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>ArkAgent</Link>
        <Link href="/#agents" className={styles.directoryLink}>
          <Arrow direction="left" />{ui.directory}
        </Link>
      </header>

      <div className={styles.layout}>
        <aside className={styles.rail}>
          <div className={styles.railIntro}>
            <h2>{ui.setup}</h2>
            <p>{ui.intro}</p>
          </div>
          <nav aria-label={ui.steps}>
            <ol className={styles.steps}>
              {stepDefs.map((step, index) => (
                <li key={step.label} className={index + 1 === hireStep ? styles.currentStep : index + 1 < hireStep ? styles.completedStep : undefined}>
                  <button
                    type="button"
                    aria-current={index + 1 === hireStep ? "step" : undefined}
                    disabled={index + 1 > hireStep || launching}
                    onClick={() => goToStep(index + 1)}
                    className={styles.stepButton}
                  >
                    <span className={styles.stepNumber}>{index + 1 < hireStep ? <Check /> : index + 1}</span>
                    <span className={styles.stepText}><strong>{step.label}</strong><span>{step.sub}</span></span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <p className={styles.railNote}>{t.tipBody}</p>
        </aside>

        <main className={styles.main}>
          {hireStep === 1 && (
            <>
              <div className={styles.sectionHeading}><h1>{isPresetHire ? ui.chosenRole : t.s1Title}</h1><p>{isPresetHire ? ui.chosenSub : t.s1Sub}</p></div>
              {agentContext}
              {!isPresetHire && <div className={styles.alternative}>
                <p>{create[lang].entry.hint}</p>
                <Link href="/hire/create">{create[lang].entry.cta}<Arrow /></Link>
              </div>}

              {rolesLoading && <div role="status" className={styles.notice}><span className={styles.spinner} aria-hidden="true" />{t.loadingRoles}</div>}
              {!rolesLoading && rolesError && <div role="alert" className={styles.error}>{rolesError}</div>}
              {!rolesLoading && !rolesError && roles.length === 0 && <div className={styles.notice}>{t.noRoles}</div>}
              {!rolesLoading && !rolesError && roles.length > 0 && isPresetHire && (
                <div className={styles.presetSelection}>
                  <p className={styles.roleDescription}>{presetCopy?.toolNote}</p>
                  <Link href="/#agents" className={styles.changeAgent}>{ui.changeAgent}<Arrow /></Link>
                </div>
              )}
              {!rolesLoading && !rolesError && roles.length > 0 && !isPresetHire && (
                <>
                  <label className={styles.search}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
                    <span className={styles.visuallyHidden}>{t.searchRolesPlaceholder}</span>
                    <input type="search" value={roleSearch} onChange={(event) => { setRoleSearch(event.target.value); setRolePage(1); }} placeholder={t.searchRolesPlaceholder} />
                  </label>
                  {filteredRoles.length === 0 ? <p className={styles.notice}>{t.noRolesMatch}</p> : (
                    <fieldset className={styles.roleList}>
                      <legend className={styles.visuallyHidden}>{t.s1Title}</legend>
                      {visibleRoles.map((role) => {
                        const selected = selRole === role.id;
                        const copy = role.id === CUSTOM_ROLE_ID
                          ? { name: presetCopy?.name ?? t.customRoleName, blurb: presetCopy?.summary ?? t.customRoleBlurb }
                          : getTranslatedRole(role.id, role.name, role.blurb, lang);
                        return (
                          <label key={role.id} className={`${styles.roleOption} ${selected ? styles.selectedOption : ""}`}>
                            <input type="radio" name="agent-role" value={role.id} checked={selected} onChange={() => setSelRole(role.id)} />
                            <span><strong>{copy.name}</strong><span>{copy.blurb}</span></span>
                          </label>
                        );
                      })}
                    </fieldset>
                  )}
                  {isCustomRole && (
                    <div className={styles.customName}>
                      <label htmlFor="custom-role-name">{t.customRoleName}</label>
                      <input id="custom-role-name" value={customRoleName} onChange={(event) => setCustomRoleName(event.target.value)} placeholder={t.customRolePlaceholder} />
                    </div>
                  )}
                  {totalRolePages > 1 && (
                    <nav className={styles.pagination} aria-label={ui.rolePages}>
                      <button type="button" className={styles.secondaryButton} disabled={currentRolePage === 1} onClick={() => setRolePage(Math.max(1, currentRolePage - 1))}><Arrow direction="left" />{t.rolePrevious}</button>
                      <span aria-live="polite">{t.rolePage(currentRolePage, totalRolePages)}</span>
                      <button type="button" className={styles.secondaryButton} disabled={currentRolePage === totalRolePages} onClick={() => setRolePage(Math.min(totalRolePages, currentRolePage + 1))}>{t.roleNext}<Arrow /></button>
                    </nav>
                  )}
                </>
              )}
            </>
          )}

          {hireStep === 2 && (
            <>
              <div className={styles.sectionHeading}><h1>{t.s2Title}</h1><p>{t.s2Hiring(selRoleDisplay?.name ?? "—")}</p></div>
              {agentContext ?? (selRoleDisplay?.blurb && <p className={styles.roleDescription}>{selRoleDisplay.blurb}</p>)}
              <div className={styles.form}>
                <div className={styles.field}>
                  <label htmlFor="agent-name">{sentenceLabel(t.agentName)}</label>
                  <input id="agent-name" value={agentName} onChange={(event) => setAgentName(event.target.value)} placeholder={selRoleDisplay?.name ?? t.agentNamePlaceholder} />
                </div>
                <div className={styles.field}>
                  <div className={styles.fieldHeader}><label htmlFor="agent-instructions">{sentenceLabel(t.instructions)}</label><button type="button" className={styles.textButton} disabled={genBusyI} onClick={genInstr}>{genBusyI ? ui.drafting : ui.draft}</button></div>
                  <textarea id="agent-instructions" rows={6} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder={t.instructionsPlaceholder} />
                </div>
                <div className={styles.field}>
                  <div className={styles.fieldHeader}><label htmlFor="agent-rules">{sentenceLabel(t.rules)}</label><button type="button" className={styles.textButton} disabled={genBusyR} onClick={genRules}>{genBusyR ? ui.drafting : ui.draft}</button></div>
                  <textarea id="agent-rules" rows={5} value={rules} onChange={(event) => setRules(event.target.value)} placeholder={t.rulesPlaceholder} />
                </div>
                <fieldset className={styles.tasksField}>
                  <legend>{sentenceLabel(t.firstTasks)}</legend>
                  <ol className={styles.taskList}>
                    {tasks.map((task, index) => (
                      <li key={index}><span>{task}</span><button type="button" className={styles.iconButton} aria-label={`${ui.removeTask}: ${task}`} onClick={() => setTasks((current) => current.filter((_, taskIndex) => taskIndex !== index))}><Close /></button></li>
                    ))}
                  </ol>
                  <div className={styles.addTask}>
                    <label className={styles.visuallyHidden} htmlFor="new-task">{t.addTaskPlaceholder}</label>
                    <input id="new-task" value={taskDraft} onChange={(event) => setTaskDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTask(); } }} placeholder={t.addTaskPlaceholder} />
                    <button type="button" className={styles.secondaryButton} disabled={!taskDraft.trim()} onClick={addTask}>{sentenceLabel(t.addTask)}</button>
                  </div>
                </fieldset>
                <div className={styles.field}>
                  <label htmlFor="agent-reminders">{sentenceLabel(t.reminders)}</label>
                  <input id="agent-reminders" value={remind} onChange={(event) => setRemind(event.target.value)} />
                </div>
              </div>
            </>
          )}

          {hireStep === 3 && (
            <>
              <div className={styles.sectionHeading}><h1>{t.s3Title}</h1><p>{t.s3Sub}</p></div>
              <fieldset className={styles.engineList}>
                <legend className={styles.visuallyHidden}>{t.s3Title}</legend>
                {engineChoices.map((choice) => (
                  <label key={choice.id} className={`${styles.engineOption} ${engine === choice.id ? styles.selectedOption : ""}`}>
                    <input type="radio" name="agent-engine" value={choice.id} checked={engine === choice.id} onChange={() => setEngine(choice.id)} />
                    <span><strong>{choice.name}</strong><span>{choice.description}</span></span>
                    {choice.id === "auto" && <span className={styles.recommended}>{sentenceLabel(t.recommended)}</span>}
                  </label>
                ))}
              </fieldset>
              <fieldset className={styles.channelsField}>
                <legend>{sentenceLabel(t.channelsLabel)}</legend>
                <div className={styles.channels}>
                  {CHANNEL_TYPES.map((type) => (
                    <label key={type} className={`${styles.channel} ${channels[type] ? styles.selectedOption : ""}`}>
                      <input type="checkbox" checked={channels[type]} onChange={() => setChannels((current) => ({ ...current, [type]: !current[type] }))} />
                      <span>{getChannelLabel(type)}</span>
                    </label>
                  ))}
                </div>
                <p className={styles.helpText}>{t.channelsNote}</p>
              </fieldset>
            </>
          )}

          {hireStep === 4 && (
            <>
              <div className={styles.sectionHeading}><h1>{t.s4Title}</h1><p>{t.s4Sub}</p></div>
              {agentContext}
              <dl className={styles.review}>
                {reviewRows.map((row) => <div key={row.label}><dt>{sentenceLabel(row.label)}</dt><dd>{row.value}</dd></div>)}
              </dl>
              <section className={styles.reviewBrief} aria-labelledby="review-brief-title">
                <div className={styles.fieldHeader}><h2 id="review-brief-title">{t.steps.brief.label}</h2><button type="button" className={styles.textButton} disabled={launching} onClick={() => goToStep(2)}>{ui.editBrief}</button></div>
                {instructions && <div><h3>{sentenceLabel(t.instructions)}</h3><p>{instructions}</p></div>}
                {rules && <div><h3>{sentenceLabel(t.rules)}</h3><p>{rules}</p></div>}
                {tasks.length > 0 && <div><h3>{sentenceLabel(t.firstTasks)}</h3><ul>{tasks.map((task, index) => <li key={index}>{task}</li>)}</ul></div>}
                <div><h3>{sentenceLabel(t.reminders)}</h3><p>{remind}</p></div>
              </section>
              {launchError && <div role="alert" className={styles.error}>{launchError}</div>}
              {launching && !launchDone && <div className={styles.notice} role="status"><span className={styles.spinner} aria-hidden="true" /><span>{ui.preparing}</span></div>}
              {launchDone && <div className={styles.success} role="status"><Check /><div><strong>{t.agentLive(revName)}</strong><button type="button" className={styles.textButton} onClick={enterDash}>{sentenceLabel(t.openDashboard)}</button></div></div>}
            </>
          )}

          {!launching && (
            <footer className={styles.actions}>
              <button type="button" className={styles.backButton} onClick={backStep}><Arrow direction="left" />{sentenceLabel(t.navBack)}</button>
              {hireStep < 4 ? (
                <button type="button" className={styles.primaryButton} disabled={!canNext} onClick={nextStep}>{sentenceLabel(hireStep === 3 ? t.reviewNext : t.continueNext)}<Arrow /></button>
              ) : (
                <button type="button" className={styles.primaryButton} disabled={!canNext} onClick={launch}>{sentenceLabel(t.launchBtn(revName))}<Arrow /></button>
              )}
            </footer>
          )}
        </main>
      </div>
    </div>
  );
}

const onboardingCopy = {
  en: { chosenRole: "Your chosen role", chosenSub: "Start with this brief and make it your own in the next step.", changeAgent: "Choose a different agent", setup: "A new teammate.", intro: "Give them a role, a clear brief, and a way to reach you.", directory: "Meet the agents", steps: "Agent setup steps", rolePages: "Role pages", illustration: "Illustrated AI coworker", draft: "Draft with AI", drafting: "Drafting…", removeTask: "Remove task", editBrief: "Edit brief", preparing: "Setting up your agent. This may take a moment." },
  zh: { chosenRole: "你选好的搭档", chosenSub: "工作简报已经准备好，下一步可以按你的需要调整。", changeAgent: "选择其他智能体", setup: "迎接新搭档。", intro: "选好岗位，交代清楚工作，再约定沟通方式。", directory: "认识智能体", steps: "智能体设置步骤", rolePages: "岗位分页", illustration: "AI 搭档的插画形象", draft: "帮我起草", drafting: "正在起草…", removeTask: "删除任务", editBrief: "修改简报", preparing: "正在为你配置智能体，请稍候。" },
  zht: { chosenRole: "你選好的搭檔", chosenSub: "工作簡報已經準備好，下一步可以按你的需要調整。", changeAgent: "選擇其他智慧體", setup: "迎接新搭檔。", intro: "選好職位，交代清楚工作，再約定溝通方式。", directory: "認識智慧體", steps: "智慧體設定步驟", rolePages: "職位分頁", illustration: "AI 搭檔的插畫形象", draft: "幫我起草", drafting: "正在起草…", removeTask: "刪除任務", editBrief: "修改簡報", preparing: "正在為你設定智慧體，請稍候。" },
  ja: { chosenRole: "選んだエージェント", chosenSub: "業務内容の下書きを用意しました。次のステップで、自分に合わせて調整できます。", changeAgent: "別のエージェントを選ぶ", setup: "新しい仕事仲間。", intro: "役割と仕事内容を伝えて、連絡方法を決めましょう。", directory: "エージェントを見る", steps: "エージェントの設定手順", rolePages: "役割一覧のページ", illustration: "AI パートナーのイラスト", draft: "AI と下書き", drafting: "下書き中…", removeTask: "タスクを削除", editBrief: "業務内容を編集", preparing: "エージェントを設定しています。少々お待ちください。" },
};

/** Keep the localized wording while retiring the old terminal-style casing. */
function sentenceLabel(value: string) {
  const clean = value.replace(/[✦⏻←→]/g, "").replace(/^\+\s*/, "").trim();
  return /[A-Z]/.test(clean) && clean === clean.toUpperCase()
    ? clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase()
    : clean;
}

function Arrow({ direction = "right" }: { direction?: "left" | "right" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" style={direction === "left" ? { transform: "rotate(180deg)" } : undefined}><path d="M4 12h15m-6-6 6 6-6 6" /></svg>;
}

function Check() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

function Close() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>;
}

export default function HirePage() {
  return <Suspense fallback={null}><HireInner /></Suspense>;
}
