/**
 * Copy for the AI-guided agent creation flow (docs/UI_DESIGN_V2.md §C).
 *
 * Three screens — DESCRIBE, GENERATING, REVIEW & EDIT — plus the six section
 * editors. Written natively in each language rather than translated word for
 * word: a 简体中文 user describing a job to a new hire does not phrase it the
 * way an English speaker does, and the DESCRIBE screen lives or dies on
 * sounding like a person asking a normal question.
 *
 * The stage labels are the ones fixed by docs/AGENT_TEMPLATE_GENERATOR.md §9.2.
 * The SSE `label` field is English and for logs only; the screen always renders
 * `t.generating.stages[stage]`.
 */
import type { Lang } from "@/lib/types";
import type { StageId } from "@/lib/atg/types";

/** A concrete starting point offered to a user with a blank page. */
export interface Starter {
  /** Stable id — used as a React key and for analytics, never displayed. */
  id: string;
  /** Chip label, short enough for a 56px-tall chip at 13px. */
  label: string;
  /** What gets written into the textarea when the chip is picked. */
  brief: string;
}

/**
 * A finished brief, paired with the six sections it produced.
 *
 * The single most useful thing to show someone staring at an empty box is not
 * a longer instruction — it is one real answer and what came out of it. The
 * outcome lines are keyed by section so they render under the SAME names the
 * review screen uses, and the reader recognises them again ten seconds later.
 */
export interface WorkedExample {
  brief: string;
  outcome: { key: SectionKeyName; line: string }[];
}

export interface CreateDict {
  /** The doorway on the classic hire wizard (`/hire`) into this flow. */
  entry: { cta: string; hint: string };
  describe: {
    title: string;
    sub: string;
    textareaLabel: string;
    placeholder: string;
    counter: (used: number, max: number) => string;
    minHint: (remaining: number) => string;
    seedsLead: string;
    seedFillHint: string;
    starters: Starter[];
    lostToggle: string;
    lostLead: string;
    lostPrompts: string[];
    lostUse: string;
    exampleToggle: string;
    exampleLead: string;
    exampleBriefLabel: string;
    exampleOutcomeLabel: string;
    exampleUse: string;
    example: WorkedExample;
    advanced: string;
    advancedHint: string;
    harnessLabel: string;
    harnessAuto: string;
    harnessHint: string;
    channelsLabel: string;
    channelsHint: string;
    timezoneLabel: string;
    hoursLabel: string;
    hoursTo: string;
    submit: string;
    submitBusy: string;
    err: {
      thin: string;
      network: string;
      networkRetry: string;
      conflictTitle: string;
      conflictBody: string;
      conflictOpen: string;
      rateTitle: string;
      rateHour: string;
      rateDay: string;
      rateCost: string;
      countdown: (seconds: number) => string;
      seeUsage: string;
      generic: string;
    };
  };
  generating: {
    title: string;
    briefLabel: string;
    stages: Record<StageId, string>;
    listLabel: string;
    progress: (done: number, total: number) => string;
    tokens: (n: number) => string;
    costUnavailable: string;
    cancel: string;
    cancelHint: string;
    pending: string;
    active: string;
    done: string;
    failedStage: string;
    modeDeterministicTitle: string;
    modeDeterministicBody: string;
    modeHybridTitle: string;
    modeHybridBody: (stages: string) => string;
    learnMore: string;
    pollNotice: string;
    failedTitle: string;
    failedBody: string;
    tryAgain: string;
    startOver: string;
    outcome: Record<"ok" | "repaired" | "fallback" | "skipped" | "failed", string>;
  };
  review: {
    title: string;
    subtitle: (name: string, harness: string, role: string) => string;
    rename: string;
    renameLabel: string;
    readyTitle: string;
    stateOk: string;
    stateReview: string;
    stateEmpty: string;
    jumpTo: (section: string) => string;
    sectionNames: Record<SectionKeyName, string>;
    countdownToLaunch: (sections: number, needsReview: number) => string;
    saveTemplate: string;
    continueCta: string;
    busy: string;
    streaming: string;
    confidenceLabel: string;
    confidenceHigh: string;
    confidenceMedium: string;
    confidenceLow: string;
    warningsTitle: string;
    warningsNone: string;
    untrustedNote: string;
    editHint: string;
    error: string;
    /** The agent row exists but the Agent Manager could not place it on a VM. */
    notProvisioned: string;
  };
  role: {
    title: string;
    edit: string;
    titleField: string;
    missionField: string;
    responsibilities: string;
    responsibilityAdd: string;
    metrics: string;
    metricLabel: string;
    metricTarget: string;
    stakeholders: string;
    handoffs: string;
    empty: string;
    why: string;
  };
  agent: {
    title: string;
    edit: string;
    nameField: string;
    harnessField: string;
    autonomyField: string;
    toneField: string;
    languageField: string;
    languageAuto: string;
    instructionsField: string;
    instructionsHint: string;
    channelsField: string;
    toolsField: string;
    tasksField: string;
    taskAdd: string;
    primary: string;
    makePrimary: string;
    alwaysOn: string;
    alwaysOnHint: string;
    hoursField: string;
    hoursTo: string;
    daysField: string;
    timezoneField: string;
    heartbeatField: string;
    heartbeatHint: (n: number) => string;
    empty: string;
    tools: Record<"shell" | "files" | "browser" | "docker" | "code", string>;
    tone: Record<"professional" | "friendly" | "concise" | "formal" | "playful", string>;
    autonomy: Record<"suggest" | "ask" | "auto", string>;
    autonomyHint: Record<"suggest" | "ask" | "auto", string>;
  };
  skills: {
    title: string;
    count: (n: number) => string;
    addSkill: string;
    addUnavailable: string;
    risk: Record<"low" | "medium" | "high", string>;
    riskLabel: string;
    compatOk: string;
    compatNo: string;
    compatUnknown: string;
    compatOkHint: (harness: string) => string;
    compatNoHint: (missing: string) => string;
    compatUnknownHint: string;
    unverifiedMode: string;
    highBlocked: string;
    requiredToggle: string;
    optionalToggle: string;
    remove: string;
    details: string;
    suggested: string;
    restore: string;
    empty: string;
    requires: string;
    noRequirements: string;
    ranked: (score: number) => string;
  };
  rules: {
    title: string;
    count: (n: number) => string;
    autonomy: string;
    approvalAmount: string;
    approvalHint: string;
    externalSends: string;
    externalSendsHint: string;
    dailyLimit: string;
    dailyLimitHint: string;
    dailyLimitUnlimited: string;
    rulesHeading: string;
    severityHard: string;
    severitySoft: string;
    severityField: string;
    categoryField: string;
    categories: Record<RuleCategoryName, string>;
    rulePlaceholder: string;
    addRule: string;
    moveUp: string;
    moveDown: string;
    moved: (text: string, position: number, total: number) => string;
    prohibitions: string;
    prohibitionAdd: string;
    escalation: string;
    escalationTriggers: string;
    escalationTriggerAdd: string;
    escalationChannel: string;
    escalationTo: string;
    escalationToHint: string;
    channels: Record<"email" | "chat" | "none", string>;
    dataHandling: string;
    piiAllowed: string;
    piiHint: string;
    retentionDays: string;
    redactFields: string;
    redactAdd: string;
    spend: string;
    monthlyCap: string;
    monthlyCapHint: string;
    empty: string;
  };
  context: {
    title: string;
    summary: (items: number, size: string) => string;
    addFile: string;
    paste: string;
    addUrl: string;
    dropTitle: string;
    dropBusy: string;
    dropTypes: (types: string) => string;
    dropLimit: (size: string) => string;
    quota: (used: string, total: string) => string;
    slotsLeft: (n: number) => string;
    kind: Record<"pasted_text" | "file_request" | "url", string>;
    stateStaged: string;
    stateAwaiting: string;
    stateReady: string;
    statePending: string;
    stateFailedHint: string;
    urlPending: string;
    remove: string;
    purposeField: string;
    titleField: string;
    bodyField: string;
    bodyChars: (n: number, max: number) => string;
    urlField: string;
    urlHint: string;
    urlInvalid: string;
    save: string;
    cancel: string;
    requiredToggle: string;
    empty: string;
    emptyHint: string;
    rejectedType: (name: string, type: string) => string;
    rejectedSize: (name: string, size: string, limit: string) => string;
    rejectedQuota: (name: string) => string;
    rejectedEmpty: (name: string) => string;
    readInline: string;
    readInlineFailed: string;
    fileDeferred: string;
    untrusted: string;
    duplicate: (name: string) => string;
  };
  schedules: {
    title: string;
    count: (n: number) => string;
    add: string;
    on: string;
    off: string;
    edit: string;
    remove: string;
    next: string;
    noNext: string;
    readOnlyOnce: (date: string) => string;
    labelField: string;
    phraseField: string;
    phraseHint: string;
    phraseUnderstood: (text: string) => string;
    phraseUse: string;
    phraseUnsure: string;
    phraseNone: string;
    phraseRemote: string;
    whenField: string;
    presetDaily: string;
    presetWeekdays: string;
    presetWeekly: string;
    presetCustom: string;
    daysField: string;
    dayNames: string[];
    dayNamesLong: string[];
    timeField: string;
    timezoneField: string;
    repeatField: string;
    repeatEvery: (n: string) => string;
    repeatBetween: string;
    repeatAnd: string;
    advanced: string;
    cronField: string;
    cronHelp: string;
    cronUnion: string;
    cronValid: string;
    cronInvalid: (reason: string) => string;
    maxRuns: (n: number) => string;
    maxRunsHint: string;
    promptField: string;
    promptHint: string;
    deliverField: string;
    deliver: Record<"chat" | "email" | "channel" | "none", string>;
    previewTitle: (tz: string) => string;
    previewEmpty: string;
    dstNote: string;
    dstTitle: string;
    save: string;
    cancel: string;
    empty: string;
    kindLabel: Record<"recurring" | "one_off" | "reminder", string>;
    sourceLlm: string;
    sourceDeterministic: string;
    sourceUser: string;
  };
  common: {
    edit: string;
    done: string;
    cancel: string;
    save: string;
    add: string;
    remove: string;
    yes: string;
    no: string;
    none: string;
    unknown: string;
    loading: string;
    retry: string;
    back: string;
  };
}

/** The six review sections, in the order they are drawn. */
export type SectionKeyName =
  | "roles"
  | "agents"
  | "skills"
  | "boundaries"
  | "context"
  | "schedules";

type RuleCategoryName =
  | "money"
  | "external_comms"
  | "data"
  | "scope"
  | "quality"
  | "legal"
  | "safety"
  | "schedule";

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------

const en: CreateDict = {
  entry: {
    cta: "Describe it instead →",
    hint: "Say what you need in your own words and we'll draft the whole agent — the role, the rules, the schedule.",
  },
  describe: {
    title: "What should this employee take off your plate?",
    sub: "Write it the way you'd explain it to a new hire. We'll do the rest.",
    textareaLabel: "What you need done",
    placeholder:
      "Every morning, check the shared inbox for new enquiries, look up the company, and draft a reply for me. Don't ever quote a price.",
    counter: (used, max) => `${used}/${max}`,
    minHint: (remaining) =>
      remaining === 1
        ? "One more character and we can start."
        : `${remaining} more characters and we can start.`,
    seedsLead: "Not sure? Start from one of these —",
    seedFillHint: "Picking one fills the box above. Nothing is created yet.",
    starters: [
      {
        id: "inbound",
        label: "Qualify my inbound leads",
        brief:
          "Every weekday morning, read the new enquiries in our shared inbox, look up each company, decide whether they fit the kind of customer we sell to, and draft a first reply for me to approve. Never quote a price.",
      },
      {
        id: "invoices",
        label: "Chase unpaid invoices",
        brief:
          "Each Monday, check which invoices are past due, draft a polite chaser email for each one, and tell me the total outstanding. Ask me before sending anything to a customer.",
      },
      {
        id: "weekly",
        label: "Summarise my week",
        brief:
          "Every Friday at 5pm, read the week's Slack channels and my calendar, and write me a short summary of what happened, what slipped, and what needs a decision from me next week.",
      },
      {
        id: "competitor",
        label: "Watch a competitor",
        brief:
          "Once a week, check our main competitor's website, blog and pricing page, note anything that changed since last time, and send me a short brief with links.",
      },
      {
        id: "support",
        label: "Triage support tickets",
        brief:
          "Read new support tickets as they arrive, sort them into billing, bug and how-to, draft an answer for the how-to ones from our help centre, and escalate anything angry to me straight away.",
      },
      {
        id: "research",
        label: "Research a list of companies",
        brief:
          "Given a list of company names, find each one's size, industry, funding and a named contact, cite the source for every fact, and put it all in one table for me.",
      },
    ],
    lostToggle: "I don't know where to start",
    lostLead:
      "Most people find it by answering one of these out loud. Any answer is enough to begin with — you can change everything later.",
    lostPrompts: [
      "What did you do this week that you'd rather never do again?",
      "What do you check every morning before you start real work?",
      "What waits on you, that shouldn't have to?",
      "What would you hand to a competent new hire on their first day?",
      "Which question do people ask you over and over?",
    ],
    lostUse: "Use this",
    exampleToggle: "Show me a worked example",
    exampleLead:
      "One brief, and the agent it produced. Yours does not have to be this long — this is just what \"enough detail\" looks like.",
    exampleBriefLabel: "The brief",
    exampleOutcomeLabel: "What we drafted from it",
    exampleUse: "Start from this brief",
    example: {
      brief:
        "Every weekday at 8:30, read the new enquiries in our shared inbox, look up each company's size and industry, decide whether they look like the kind of customer we sell to, and draft a first reply for me to approve. Never quote a price, and never send anything without me. If someone sounds angry, tell me straight away.",
      outcome: [
        { key: "roles", line: "Inbound qualifier — reads every enquiry and hands you a decision, not a queue." },
        { key: "agents", line: "One agent, replies in the language it was written to, asks before anything leaves the building." },
        { key: "skills", line: "Web lookup and inbox reading. Both low risk." },
        { key: "boundaries", line: "NEVER quote a price · approve every outbound email · escalate anything angry." },
        { key: "context", line: "Asks you for one page on who you sell to." },
        { key: "schedules", line: "Weekdays at 08:30, results to chat." },
      ],
    },
    advanced: "Add detail (harness, working hours, channels)",
    advancedHint:
      "All optional. Leave it alone and we'll pick sensible defaults you can change on the next screen.",
    harnessLabel: "Harness",
    harnessAuto: "Pick for me",
    harnessHint: "The runtime the agent runs on. Change it later at no cost.",
    channelsLabel: "Reachable on",
    channelsHint: "You connect the accounts after the agent exists.",
    timezoneLabel: "Time zone",
    hoursLabel: "Working hours",
    hoursTo: "to",
    submit: "Draft my agent",
    submitBusy: "Drafting…",
    err: {
      thin: "Tell us a bit more about what you need — one more sentence is usually enough.",
      network:
        "We couldn't reach the drafting service. Nothing was created, and your text is still here.",
      networkRetry: "Try again",
      conflictTitle: "A draft is already being generated",
      conflictBody:
        "Someone in this workspace — possibly you, in another tab — started a draft that hasn't finished.",
      conflictOpen: "Open it",
      rateTitle: "You've generated a lot today",
      rateHour: "This workspace has hit its hourly drafting limit.",
      rateDay: "This workspace has hit its daily drafting limit.",
      rateCost: "This workspace has used up its drafting budget for the period.",
      countdown: (s) =>
        s > 60
          ? `You can try again in ${Math.ceil(s / 60)} min.`
          : `You can try again in ${s}s.`,
      seeUsage: "See usage",
      generic: "Something went wrong starting the draft. Your text is still here.",
    },
  },
  generating: {
    title: "Drafting your agent",
    briefLabel: "From your brief",
    stages: {
      intake: "Reading your brief",
      charter: "Defining the job",
      capabilities: "Working out what it needs",
      skills: "Choosing tools",
      boundaries: "Setting the rules",
      context: "Listing what to give it",
      schedules: "Planning its rhythm",
      assemble: "Putting it together",
      lint: "Safety check",
      finalize: "Finishing up",
    },
    listLabel: "Drafting progress",
    progress: (done, total) => `${done} / ${total}`,
    tokens: (n) => `${n.toLocaleString("en-US")} tok`,
    costUnavailable: "cost not reported",
    cancel: "Stop and go back",
    cancelHint: "Stopping discards this draft. Your description is kept.",
    pending: "Waiting",
    active: "Working",
    done: "Done",
    failedStage: "Failed",
    modeDeterministicTitle: "Drafted from rules, not a model.",
    modeDeterministicBody:
      "No AI provider is configured, so this is a keyword-and-template draft. Everything below is editable.",
    modeHybridTitle: "Some steps fell back to rules.",
    modeHybridBody: (stages) =>
      `${stages} were keyword-matched rather than reasoned. Everything is editable.`,
    learnMore: "Learn more",
    pollNotice: "Streaming was blocked, so we're checking for progress instead.",
    failedTitle: "The draft stopped partway",
    failedBody:
      "The steps above that finished are still good. You can retry from here, or start again with a different description.",
    tryAgain: "Try again",
    startOver: "Start over",
    outcome: {
      ok: "ok",
      repaired: "repaired",
      fallback: "rules",
      skipped: "skipped",
      failed: "failed",
    },
  },
  review: {
    title: "Review your agent",
    subtitle: (name, harness, role) => `${name} · ${harness} · ${role}`,
    rename: "Rename",
    renameLabel: "Agent name",
    readyTitle: "READY TO LAUNCH",
    stateOk: "Looks right",
    stateReview: "Needs a look",
    stateEmpty: "Empty",
    jumpTo: (section) => `Jump to ${section}`,
    sectionNames: {
      roles: "Role",
      agents: "Agent",
      skills: "Skills",
      boundaries: "Rules & boundaries",
      context: "Context",
      schedules: "Reminders & schedules",
    },
    countdownToLaunch: (sections, needsReview) =>
      needsReview === 0
        ? `${sections} sections · all set`
        : `${sections} sections · ${needsReview} need review`,
    saveTemplate: "Save as template",
    continueCta: "Continue",
    busy: "Working…",
    streaming: "Still being written…",
    confidenceLabel: "Confidence",
    confidenceHigh: "High — the brief was specific",
    confidenceMedium: "Medium — some of this is a guess",
    confidenceLow: "Low — please read every section",
    warningsTitle: "Worth checking",
    warningsNone: "Nothing flagged.",
    untrustedNote:
      "Text below came from a model or a third-party catalogue. It is shown as text and never run.",
    editHint: "Nothing is created until you press Continue. Change anything you like.",
    notProvisioned:
      "The agent exists, but no machine has been assigned to it yet. It starts on its own as soon as the runtime has capacity.",
    error: "That didn't work. Nothing has been created.",
  },
  role: {
    title: "ROLE",
    edit: "Change",
    titleField: "Job title",
    missionField: "Mission",
    responsibilities: "Responsibilities",
    responsibilityAdd: "Add a responsibility",
    metrics: "What good looks like",
    metricLabel: "Measure",
    metricTarget: "Target",
    stakeholders: "Works with",
    handoffs: "Hands off to",
    empty: "No role was drafted. Add a title and a one-line mission.",
    why: "Why this role",
  },
  agent: {
    title: "AGENT",
    edit: "Edit",
    nameField: "Name",
    harnessField: "Harness",
    autonomyField: "Autonomy",
    toneField: "Tone",
    languageField: "Replies in",
    languageAuto: "Match whoever writes in",
    instructionsField: "Instructions",
    instructionsHint:
      "This is the standing brief the agent reads before every task. Plain language works best.",
    channelsField: "Reachable on",
    toolsField: "Tools it may use",
    tasksField: "Starting tasks",
    taskAdd: "Add a task",
    primary: "PRIMARY",
    makePrimary: "Make this the primary agent",
    alwaysOn: "Always on",
    alwaysOnHint: "Ignore the working hours below and answer whenever it is asked.",
    hoursField: "Working hours",
    hoursTo: "to",
    daysField: "Working days",
    timezoneField: "Time zone",
    heartbeatField: "Check-in every",
    heartbeatHint: (n) => `${n} minutes between checks.`,
    empty: "No agent was drafted.",
    tools: {
      shell: "Shell",
      files: "Files",
      browser: "Browser",
      docker: "Containers",
      code: "Code",
    },
    tone: {
      professional: "Professional",
      friendly: "Friendly",
      concise: "Concise",
      formal: "Formal",
      playful: "Playful",
    },
    autonomy: {
      suggest: "Suggest only",
      ask: "Ask first",
      auto: "Act on its own",
    },
    autonomyHint: {
      suggest: "It drafts and proposes. You do everything.",
      ask: "It asks before anything that leaves the building.",
      auto: "It acts within the limits below without asking.",
    },
  },
  skills: {
    title: "SKILLS",
    count: (n) => (n === 1 ? "1 selected" : `${n} selected`),
    addSkill: "Add skill",
    addUnavailable: "The skill catalogue isn't wired up yet on this screen.",
    risk: { low: "low", medium: "medium", high: "high" },
    riskLabel: "Risk",
    compatOk: "Works here",
    compatNo: "Won't run",
    compatUnknown: "Unverified",
    compatOkHint: (harness) => `Asserted compatible with ${harness}.`,
    compatNoHint: (missing) => `Needs ${missing}, which this harness doesn't provide.`,
    compatUnknownHint:
      "Nobody has checked this skill against this harness. Not the same as broken — and not the same as working.",
    unverifiedMode:
      "The agent runtime isn't connected, so no skill can be verified against a real machine yet.",
    highBlocked:
      "Needs review after setup — add it from the agent's Skills tab, where the risk is acknowledged on the record.",
    requiredToggle: "Required",
    optionalToggle: "Optional",
    remove: "Remove skill",
    details: "Skill details",
    suggested: "Suggested by your brief but not added:",
    restore: "Add back",
    empty: "No skills were matched. The agent will still run; it just has fewer tools.",
    requires: "Requires",
    noRequirements: "No special requirements.",
    ranked: (score) => `match ${score.toFixed(2)}`,
  },
  rules: {
    title: "RULES & BOUNDARIES",
    count: (n) => (n === 1 ? "1 rule" : `${n} rules`),
    autonomy: "How much it decides alone",
    approvalAmount: "Ask me above",
    approvalHint: "Whole US dollars. 0 means ask about any amount at all.",
    externalSends: "Approve anything sent outside the company",
    externalSendsHint: "Emails, messages, posts — nothing leaves without you.",
    dailyLimit: "Actions per day",
    dailyLimitHint: "A circuit breaker, not a budget. 0 removes the cap.",
    dailyLimitUnlimited: "No cap",
    rulesHeading: "Rules",
    severityHard: "NEVER",
    severitySoft: "SHOULD",
    severityField: "Strength",
    categoryField: "About",
    categories: {
      money: "Money",
      external_comms: "Sending things out",
      data: "Data",
      scope: "Scope",
      quality: "Quality",
      legal: "Legal",
      safety: "Safety",
      schedule: "Timing",
    },
    rulePlaceholder: "Type a rule…",
    addRule: "Add rule",
    moveUp: "Move up",
    moveDown: "Move down",
    moved: (text, position, total) => `${text} moved to position ${position} of ${total}`,
    prohibitions: "Absolutely not",
    prohibitionAdd: "Add something it must never do",
    escalation: "When to come to you",
    escalationTriggers: "Situations",
    escalationTriggerAdd: "Add a situation",
    escalationChannel: "Reach you on",
    escalationTo: "Where to send it",
    escalationToHint:
      "You'll set the address once the agent exists — we never fill this in from a draft.",
    channels: { email: "Email", chat: "Chat", none: "Don't notify" },
    dataHandling: "Data",
    piiAllowed: "May handle personal data",
    piiHint: "Names, emails, phone numbers, anything that identifies a person.",
    retentionDays: "Keep working data for",
    redactFields: "Always redact",
    redactAdd: "Add a field to redact",
    spend: "Spend",
    monthlyCap: "Monthly credit cap",
    monthlyCapHint: "0 uses your plan's allowance.",
    empty: "No rules were drafted. An agent with no rules is one you have to watch.",
  },
  context: {
    title: "CONTEXT",
    summary: (items, size) =>
      items === 1 ? `1 item · ${size}` : `${items} items · ${size}`,
    addFile: "Add file",
    paste: "Paste text",
    addUrl: "Add link",
    dropTitle: "Drop files here, or click to choose",
    dropBusy: "Reading…",
    dropTypes: (types) => types,
    dropLimit: (size) => `up to ${size} each`,
    quota: (used, total) => `${used} of ${total} used`,
    slotsLeft: (n) => (n === 1 ? "room for 1 more item" : `room for ${n} more items`),
    kind: { pasted_text: "text", file_request: "file", url: "link" },
    stateStaged: "ready to upload",
    stateAwaiting: "waiting for a file",
    stateReady: "stored",
    statePending: "pending",
    stateFailedHint: "This item couldn't be read.",
    urlPending: "not fetched yet — the agent fetches it, not us",
    remove: "Remove item",
    purposeField: "What it's for",
    titleField: "Title",
    bodyField: "Text",
    bodyChars: (n, max) => `${n.toLocaleString("en-US")} / ${max.toLocaleString("en-US")} characters`,
    urlField: "Address",
    urlHint: "Public https pages only. The agent fetches it from its own machine, not from here.",
    urlInvalid: "That isn't a public https address we can hand to an agent.",
    save: "Save",
    cancel: "Cancel",
    requiredToggle: "The agent can't work without this",
    empty: "Nothing yet",
    emptyHint:
      "An agent with no context guesses. Give it the doc you'd hand a new hire on day one.",
    rejectedType: (name, type) => `${name} — ${type} isn't a type we accept.`,
    rejectedSize: (name, size, limit) => `${name} is ${size}. The limit is ${limit}.`,
    rejectedQuota: (name) => `${name} doesn't fit in what's left of this agent's quota.`,
    rejectedEmpty: (name) => `${name} is empty.`,
    readInline: "read into the draft",
    readInlineFailed: "We couldn't read that file's text. It'll be uploaded instead.",
    fileDeferred:
      "Large files and PDFs are attached after the agent exists — the row below remembers what to ask you for.",
    untrusted:
      "File names and pasted text are shown exactly as they arrived, and are never treated as instructions.",
    duplicate: (name) => `${name} is already on the list.`,
  },
  schedules: {
    title: "REMINDERS & SCHEDULES",
    count: (n) => (n === 1 ? "1 schedule" : `${n} schedules`),
    add: "Add schedule",
    on: "on",
    off: "off",
    edit: "Edit schedule",
    remove: "Remove schedule",
    next: "Next",
    noNext: "Never fires — check the expression",
    readOnlyOnce: (date) => `One-off, ${date}. Editable once the agent exists.`,
    labelField: "Label",
    phraseField: "Say when, in your own words",
    phraseHint: 'Try "every weekday at 8:30" or "the first of the month at 9am".',
    phraseUnderstood: (text) => `Understood as: ${text}`,
    phraseUse: "Use this",
    phraseUnsure: "We think you mean this, but we're not sure — check the preview.",
    phraseNone: "We couldn't read that as a time. Use the controls below instead.",
    phraseRemote: "Checked with the server.",
    whenField: "When",
    presetDaily: "Daily",
    presetWeekdays: "Weekdays",
    presetWeekly: "Weekly",
    presetCustom: "Custom",
    daysField: "Days",
    dayNames: ["S", "M", "T", "W", "T", "F", "S"],
    dayNamesLong: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    timeField: "Time",
    timezoneField: "Time zone",
    repeatField: "Repeat",
    repeatEvery: (n) => `every ${n} minutes`,
    repeatBetween: "between",
    repeatAnd: "and",
    advanced: "Advanced",
    cronField: "Cron",
    cronHelp: "5 fields: minute hour day-of-month month day-of-week.",
    cronUnion:
      "When both day-of-month and day-of-week are restricted, it fires on either — not both.",
    cronValid: "valid",
    cronInvalid: (reason) => reason,
    maxRuns: (n) => `At most ${n} runs a day`,
    maxRunsHint: "Anything past the ceiling is skipped, not queued.",
    promptField: "What it does",
    promptHint: "One instruction, in plain language. This is what the agent is asked each time.",
    deliverField: "Send the result to",
    deliver: { chat: "Chat", email: "Email", channel: "Its channel", none: "Nowhere" },
    previewTitle: (tz) => `Next 5 runs · ${tz}`,
    previewEmpty: "Nothing to preview — fix the expression above.",
    dstNote: "clocks change",
    dstTitle:
      "The clocks change in this zone near this run. A skipped hour fires at the instant the clock jumps to; a repeated hour fires once.",
    save: "Save",
    cancel: "Cancel",
    empty: "No schedule yet. An agent with no rhythm only works when you poke it.",
    kindLabel: { recurring: "Repeating", one_off: "One-off", reminder: "Reminder" },
    sourceLlm: "drafted by the model",
    sourceDeterministic: "matched from your words",
    sourceUser: "your phrasing",
  },
  common: {
    edit: "Edit",
    done: "Done",
    cancel: "Cancel",
    save: "Save",
    add: "Add",
    remove: "Remove",
    yes: "Yes",
    no: "No",
    none: "None",
    unknown: "Unknown",
    loading: "Loading…",
    retry: "Retry",
    back: "Back",
  },
};

// ---------------------------------------------------------------------------
// 简体中文
// ---------------------------------------------------------------------------

const zh: CreateDict = {
  entry: {
    cta: "换成描述需求 →",
    hint: "用你自己的话说清楚要做什么，我们来起草整个智能体——职责、规则、日程。",
  },
  describe: {
    title: "你希望这位员工替你分担什么？",
    sub: "就像跟新同事交代工作一样写出来，剩下的交给我们。",
    textareaLabel: "你需要他做的事",
    placeholder:
      "每天早上看一遍公共邮箱里的新询盘，查一下对方公司，帮我起草回复。任何情况下都不要报价。",
    counter: (used, max) => `${used}/${max}`,
    minHint: (remaining) => `再写 ${remaining} 个字就可以开始了。`,
    seedsLead: "还没想好？可以从这些开始 —",
    seedFillHint: "点一个会把内容填进上面的框里，不会直接创建。",
    starters: [
      {
        id: "inbound",
        label: "筛选进来的销售线索",
        brief:
          "每个工作日早上，读一遍公共邮箱里的新询盘，查一下每家公司，判断是不是我们要的客户类型，然后帮我起草一封初次回复等我确认。任何情况下都不要报价。",
      },
      {
        id: "invoices",
        label: "催收逾期账款",
        brief:
          "每周一查一遍哪些账单已经逾期，为每一笔起草一封客气的催款邮件，并告诉我未收总额。发给客户之前一定先问我。",
      },
      {
        id: "weekly",
        label: "帮我总结这一周",
        brief:
          "每周五下午五点，看一遍这一周的 Slack 频道和我的日历，写一份简短总结：发生了什么、什么拖了、下周需要我拍板什么。",
      },
      {
        id: "competitor",
        label: "盯住一个竞争对手",
        brief:
          "每周一次，看看主要竞争对手的官网、博客和价格页，记下和上次相比有什么变化，发我一份带链接的简报。",
      },
      {
        id: "support",
        label: "给客服工单分类",
        brief:
          "新工单一进来就读，分成账单、故障、使用问题三类，使用问题从帮助中心找答案起草回复，遇到情绪激动的客户立刻升级给我。",
      },
      {
        id: "research",
        label: "调研一批公司",
        brief:
          "给你一份公司名单，逐家查规模、行业、融资情况和一位对接人，每条事实都标注来源，最后汇总成一张表给我。",
      },
    ],
    lostToggle: "我不知道从哪儿开始",
    lostLead:
      "大部分人把下面任一个问题念出来就有答案了。先写个大概就行，后面每一处都能改。",
    lostPrompts: [
      "这周你做过、最不想再做第二遍的是什么？",
      "每天真正开工前，你都要先去看一眼什么？",
      "有哪些事本来不该等你，却卡在你这儿？",
      "如果来了一位靠谱的新人，第一天你会先把什么交给他？",
      "有哪个问题别人反复来问你？",
    ],
    lostUse: "就用这个",
    exampleToggle: "看一个完整的例子",
    exampleLead: "一段描述，加上它生成出来的智能体。你写的不用这么长——这只是让你看看「写够了」大概是什么样。",
    exampleBriefLabel: "描述",
    exampleOutcomeLabel: "我们据此起草的内容",
    exampleUse: "就从这段描述开始",
    example: {
      brief:
        "每个工作日早上八点半，读一遍公共邮箱里的新询盘，查清楚每家公司的规模和行业，判断像不像我们要的客户，然后起草一封初次回复等我确认。任何情况下都不要报价，也不要替我发出任何东西。遇到语气不好的客户，立刻告诉我。",
      outcome: [
        { key: "roles", line: "线索初筛——每封新询盘都读，交给你的是结论，不是一堆待办。" },
        { key: "agents", line: "一个智能体，对方用什么语言写就用什么语言回，对外发出前一律先问你。" },
        { key: "skills", line: "网页查询和邮箱读取，都是低风险。" },
        { key: "boundaries", line: "绝不报价 · 对外邮件逐封确认 · 客户情绪不对立刻升级。" },
        { key: "context", line: "会向你要一份「我们卖给谁」的说明。" },
        { key: "schedules", line: "工作日 08:30 运行，结果发到聊天。" },
      ],
    },
    advanced: "补充设置（运行环境、工作时间、渠道）",
    advancedHint: "都可以不填。不填我们会给一套合理的默认值，下一屏还能改。",
    harnessLabel: "运行环境",
    harnessAuto: "帮我选",
    harnessHint: "智能体实际运行的运行时。之后随时可以换，不额外收费。",
    channelsLabel: "在哪里找得到他",
    channelsHint: "账号在智能体创建之后再连。",
    timezoneLabel: "时区",
    hoursLabel: "工作时间",
    hoursTo: "至",
    submit: "生成草稿",
    submitBusy: "生成中…",
    err: {
      thin: "再多说一点吧——通常一句话就够了。",
      network: "连不上生成服务。什么都没有创建，你写的内容还在。",
      networkRetry: "重试",
      conflictTitle: "已经有一份草稿在生成中",
      conflictBody: "这个工作区里有人——也可能是你在另一个标签页——已经启动了一次生成，还没跑完。",
      conflictOpen: "去看看",
      rateTitle: "今天生成得有点多",
      rateHour: "这个工作区已经用完了本小时的生成次数。",
      rateDay: "这个工作区已经用完了今天的生成次数。",
      rateCost: "这个工作区本周期的生成额度已经用完。",
      countdown: (s) => (s > 60 ? `${Math.ceil(s / 60)} 分钟后可以再试。` : `${s} 秒后可以再试。`),
      seeUsage: "查看用量",
      generic: "启动生成时出了点问题，你写的内容还在。",
    },
  },
  generating: {
    title: "正在生成你的智能体",
    briefLabel: "来自你的描述",
    stages: {
      intake: "正在理解你的需求",
      charter: "确定岗位职责",
      capabilities: "梳理所需能力",
      skills: "挑选技能",
      boundaries: "设定规则与权限",
      context: "列出所需资料",
      schedules: "安排工作节奏",
      assemble: "组装模板",
      lint: "安全检查",
      finalize: "收尾",
    },
    listLabel: "生成进度",
    progress: (done, total) => `${done} / ${total}`,
    tokens: (n) => `${n.toLocaleString("zh-CN")} tok`,
    costUnavailable: "未返回费用",
    cancel: "停止并返回",
    cancelHint: "停止会丢弃这份草稿，你写的描述会保留。",
    pending: "等待中",
    active: "进行中",
    done: "完成",
    failedStage: "失败",
    modeDeterministicTitle: "这份草稿由规则生成，没有用模型。",
    modeDeterministicBody: "当前没有配置 AI 服务商，所以这是一份基于关键词和模板的草稿。下面每一项都能改。",
    modeHybridTitle: "有几步退回到了规则。",
    modeHybridBody: (stages) => `${stages} 是靠关键词匹配出来的，不是推理出来的。所有内容都能改。`,
    learnMore: "了解详情",
    pollNotice: "流式连接被拦截了，改用轮询获取进度。",
    failedTitle: "生成中途停了",
    failedBody: "上面已完成的几步仍然有效。可以从这里重试，或者换个描述重新开始。",
    tryAgain: "重试",
    startOver: "重新开始",
    outcome: {
      ok: "正常",
      repaired: "已修正",
      fallback: "走规则",
      skipped: "已跳过",
      failed: "失败",
    },
  },
  review: {
    title: "检查你的智能体",
    subtitle: (name, harness, role) => `${name} · ${harness} · ${role}`,
    rename: "改名",
    renameLabel: "智能体名称",
    readyTitle: "上线前检查",
    stateOk: "没问题",
    stateReview: "需要看一下",
    stateEmpty: "还空着",
    jumpTo: (section) => `跳到${section}`,
    sectionNames: {
      roles: "岗位",
      agents: "智能体",
      skills: "技能",
      boundaries: "规则与边界",
      context: "资料",
      schedules: "提醒与排程",
    },
    countdownToLaunch: (sections, needsReview) =>
      needsReview === 0 ? `${sections} 个部分 · 都就绪了` : `${sections} 个部分 · ${needsReview} 个待确认`,
    saveTemplate: "存为模板",
    continueCta: "继续",
    busy: "处理中…",
    streaming: "还在生成…",
    confidenceLabel: "把握程度",
    confidenceHigh: "高——你的描述很具体",
    confidenceMedium: "中——有一部分是猜的",
    confidenceLow: "低——请逐项确认",
    warningsTitle: "值得看一眼",
    warningsNone: "没有需要提醒的。",
    untrustedNote: "以下文字来自模型或第三方目录，只作为文本展示，绝不会被执行。",
    editHint: "按下「继续」之前什么都不会创建，随便改。",
    notProvisioned: "智能体已创建，但还没有分配到机器。运行环境一有余量就会自动启动。",
    error: "没成功。什么都没有创建。",
  },
  role: {
    title: "岗位",
    edit: "更改",
    titleField: "岗位名称",
    missionField: "核心职责",
    responsibilities: "具体负责",
    responsibilityAdd: "添加一项职责",
    metrics: "做到什么算好",
    metricLabel: "指标",
    metricTarget: "目标",
    stakeholders: "配合对象",
    handoffs: "交接给",
    empty: "没有生成岗位。填一个名称和一句职责就行。",
    why: "为什么是这个岗位",
  },
  agent: {
    title: "智能体",
    edit: "编辑",
    nameField: "名称",
    harnessField: "运行环境",
    autonomyField: "自主程度",
    toneField: "语气",
    languageField: "回复语言",
    languageAuto: "跟随对方的语言",
    instructionsField: "工作说明",
    instructionsHint: "这是智能体每次干活前都会读的常驻说明。用大白话写效果最好。",
    channelsField: "在哪里找得到他",
    toolsField: "可以使用的工具",
    tasksField: "开局任务",
    taskAdd: "添加任务",
    primary: "主智能体",
    makePrimary: "设为主智能体",
    alwaysOn: "全天待命",
    alwaysOnHint: "不看下面的工作时间，随叫随到。",
    hoursField: "工作时间",
    hoursTo: "至",
    daysField: "工作日",
    timezoneField: "时区",
    heartbeatField: "检查间隔",
    heartbeatHint: (n) => `每 ${n} 分钟检查一次。`,
    empty: "没有生成智能体。",
    tools: { shell: "命令行", files: "文件", browser: "浏览器", docker: "容器", code: "代码" },
    tone: {
      professional: "专业",
      friendly: "亲切",
      concise: "简洁",
      formal: "正式",
      playful: "轻松",
    },
    autonomy: { suggest: "只提建议", ask: "先问我", auto: "自己决定" },
    autonomyHint: {
      suggest: "他只起草和建议，动手的还是你。",
      ask: "凡是要发出去的，都先问过你。",
      auto: "在下面的限额内自己行动，不再问你。",
    },
  },
  skills: {
    title: "技能",
    count: (n) => `已选 ${n} 项`,
    addSkill: "添加技能",
    addUnavailable: "技能库还没有接到这一屏。",
    risk: { low: "低", medium: "中", high: "高" },
    riskLabel: "风险",
    compatOk: "可用",
    compatNo: "跑不了",
    compatUnknown: "未核实",
    compatOkHint: (harness) => `已确认与 ${harness} 兼容。`,
    compatNoHint: (missing) => `需要 ${missing}，当前运行环境没有。`,
    compatUnknownHint: "还没有人在这个运行环境上验证过这个技能。它既不等于坏，也不等于好。",
    unverifiedMode: "运行时还没接上，暂时无法在真实机器上核实任何技能。",
    highBlocked: "创建完成后再处理——请到智能体的「技能」页添加，那里会留下风险确认记录。",
    requiredToggle: "必需",
    optionalToggle: "可选",
    remove: "移除技能",
    details: "技能详情",
    suggested: "根据你的描述推荐、但没有加入的：",
    restore: "加回来",
    empty: "没有匹配到技能。智能体照样能跑，只是手上的工具少一些。",
    requires: "依赖",
    noRequirements: "没有特殊依赖。",
    ranked: (score) => `匹配度 ${score.toFixed(2)}`,
  },
  rules: {
    title: "规则与边界",
    count: (n) => `${n} 条规则`,
    autonomy: "他能自己决定多少",
    approvalAmount: "超过这个金额要问我",
    approvalHint: "以整数美元计。填 0 表示任何金额都要问。",
    externalSends: "对外发送前都要我确认",
    externalSendsHint: "邮件、消息、发帖——没有你点头就不出门。",
    dailyLimit: "每天动作次数上限",
    dailyLimitHint: "这是保险丝，不是预算。填 0 表示不限。",
    dailyLimitUnlimited: "不限",
    rulesHeading: "规则",
    severityHard: "绝不",
    severitySoft: "应当",
    severityField: "强度",
    categoryField: "关于",
    categories: {
      money: "钱",
      external_comms: "对外发送",
      data: "数据",
      scope: "职责范围",
      quality: "质量",
      legal: "法务",
      safety: "安全",
      schedule: "时间",
    },
    rulePlaceholder: "写一条规则…",
    addRule: "添加规则",
    moveUp: "上移",
    moveDown: "下移",
    moved: (text, position, total) => `${text} 已移到第 ${position} 条，共 ${total} 条`,
    prohibitions: "绝对不许",
    prohibitionAdd: "添加一件绝不能做的事",
    escalation: "什么时候来找你",
    escalationTriggers: "触发情形",
    escalationTriggerAdd: "添加一种情形",
    escalationChannel: "通过什么找你",
    escalationTo: "发到哪里",
    escalationToHint: "地址等智能体创建之后你自己填——我们绝不会从草稿里替你填。",
    channels: { email: "邮件", chat: "聊天", none: "不通知" },
    dataHandling: "数据",
    piiAllowed: "允许处理个人信息",
    piiHint: "姓名、邮箱、电话，任何能指向具体某个人的信息。",
    retentionDays: "工作数据保留",
    redactFields: "始终脱敏的字段",
    redactAdd: "添加要脱敏的字段",
    spend: "花费",
    monthlyCap: "每月额度上限",
    monthlyCapHint: "填 0 表示按套餐额度走。",
    empty: "没有生成规则。没有规则的智能体，你得一直盯着。",
  },
  context: {
    title: "资料",
    summary: (items, size) => `${items} 项 · ${size}`,
    addFile: "添加文件",
    paste: "粘贴文字",
    addUrl: "添加链接",
    dropTitle: "把文件拖到这里，或点击选择",
    dropBusy: "读取中…",
    dropTypes: (types) => types,
    dropLimit: (size) => `单个不超过 ${size}`,
    quota: (used, total) => `已用 ${used} / ${total}`,
    slotsLeft: (n) => `还能再加 ${n} 项`,
    kind: { pasted_text: "文字", file_request: "文件", url: "链接" },
    stateStaged: "待上传",
    stateAwaiting: "等一个文件",
    stateReady: "已保存",
    statePending: "待处理",
    stateFailedHint: "这一项读不出来。",
    urlPending: "尚未抓取——由智能体去抓，不是我们",
    remove: "移除",
    purposeField: "用来做什么",
    titleField: "标题",
    bodyField: "正文",
    bodyChars: (n, max) => `${n.toLocaleString("zh-CN")} / ${max.toLocaleString("zh-CN")} 字符`,
    urlField: "网址",
    urlHint: "只支持公开的 https 页面。抓取由智能体在自己的机器上完成，不经过这里。",
    urlInvalid: "这不是一个可以交给智能体的公开 https 网址。",
    save: "保存",
    cancel: "取消",
    requiredToggle: "没有这份资料就没法干活",
    empty: "还什么都没有",
    emptyHint: "没有资料的智能体只能靠猜。把你第一天会交给新人的那份文档给它。",
    rejectedType: (name, type) => `${name}——不接受 ${type} 这种类型。`,
    rejectedSize: (name, size, limit) => `${name} 有 ${size}，上限是 ${limit}。`,
    rejectedQuota: (name) => `${name} 超出了这个智能体剩余的配额。`,
    rejectedEmpty: (name) => `${name} 是空的。`,
    readInline: "已读入草稿",
    readInlineFailed: "读不出这个文件的文字，改为上传处理。",
    fileDeferred: "大文件和 PDF 要等智能体创建之后再上传——下面这一行会记住该向你要什么。",
    untrusted: "文件名和粘贴的文字都按原样展示，绝不会被当成指令执行。",
    duplicate: (name) => `${name} 已经在列表里了。`,
  },
  schedules: {
    title: "提醒与排程",
    count: (n) => `${n} 条排程`,
    add: "添加排程",
    on: "开",
    off: "关",
    edit: "编辑排程",
    remove: "删除排程",
    next: "下次",
    noNext: "永远不会触发——检查一下表达式",
    readOnlyOnce: (date) => `一次性，${date}。智能体创建后才能改。`,
    labelField: "名称",
    phraseField: "用你自己的话说什么时候",
    phraseHint: "比如「每个工作日早上八点半」或者「每月一号上午九点」。",
    phraseUnderstood: (text) => `理解为：${text}`,
    phraseUse: "就这样",
    phraseUnsure: "我们大概是这个意思，但不确定——请看下面的预览。",
    phraseNone: "这句话读不出时间，请用下面的控件设置。",
    phraseRemote: "已与服务端核对。",
    whenField: "频率",
    presetDaily: "每天",
    presetWeekdays: "工作日",
    presetWeekly: "每周",
    presetCustom: "自定义",
    daysField: "星期",
    dayNames: ["日", "一", "二", "三", "四", "五", "六"],
    dayNamesLong: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],
    timeField: "时间",
    timezoneField: "时区",
    repeatField: "重复",
    repeatEvery: (n) => `每 ${n} 分钟`,
    repeatBetween: "从",
    repeatAnd: "到",
    advanced: "高级",
    cronField: "Cron",
    cronHelp: "五个字段：分 时 日 月 星期。",
    cronUnion: "当“日”和“星期”都限定时，两者满足其一就触发，不是同时满足。",
    cronValid: "有效",
    cronInvalid: (reason) => reason,
    maxRuns: (n) => `每天最多 ${n} 次`,
    maxRunsHint: "超过上限的会被跳过，不会排队。",
    promptField: "做什么",
    promptHint: "一句话的指令。每次触发时智能体收到的就是这句。",
    deliverField: "结果发到",
    deliver: { chat: "聊天", email: "邮件", channel: "所属渠道", none: "不发送" },
    previewTitle: (tz) => `接下来 5 次 · ${tz}`,
    previewEmpty: "无法预览——先修正上面的表达式。",
    dstNote: "夏令时切换",
    dstTitle:
      "这次触发附近该时区会调整时钟。被跳过的那一小时会在时钟跳到的瞬间触发；重复的那一小时只触发一次。",
    save: "保存",
    cancel: "取消",
    empty: "还没有排程。没有节奏的智能体，只有你戳一下才动一下。",
    kindLabel: { recurring: "重复", one_off: "一次性", reminder: "提醒" },
    sourceLlm: "模型生成",
    sourceDeterministic: "由你的话匹配",
    sourceUser: "你的原话",
  },
  common: {
    edit: "编辑",
    done: "完成",
    cancel: "取消",
    save: "保存",
    add: "添加",
    remove: "移除",
    yes: "是",
    no: "否",
    none: "无",
    unknown: "未知",
    loading: "加载中…",
    retry: "重试",
    back: "返回",
  },
};

// ---------------------------------------------------------------------------
// 繁體中文
// ---------------------------------------------------------------------------

const zht: CreateDict = {
  entry: {
    cta: "改用描述需求 →",
    hint: "用你自己的話說清楚要做什麼，我們來草擬整個智能體——職責、規則、排程。",
  },
  describe: {
    title: "你希望這位員工替你分擔什麼？",
    sub: "就像跟新同事交代工作那樣寫下來，剩下的交給我們。",
    textareaLabel: "你需要他做的事",
    placeholder:
      "每天早上看一遍公用信箱裡的新詢問，查一下對方公司，幫我擬一封回覆。任何情況下都不要報價。",
    counter: (used, max) => `${used}/${max}`,
    minHint: (remaining) => `再寫 ${remaining} 個字就可以開始了。`,
    seedsLead: "還沒想好？可以從這些開始 —",
    seedFillHint: "點一個會把內容填進上面的框，不會直接建立。",
    starters: [
      {
        id: "inbound",
        label: "篩選進來的業務線索",
        brief:
          "每個工作日早上，讀一遍公用信箱裡的新詢問，查一下每家公司，判斷是不是我們要的客戶類型，然後幫我擬一封初次回覆等我確認。任何情況下都不要報價。",
      },
      {
        id: "invoices",
        label: "催收逾期帳款",
        brief:
          "每週一查一遍哪些帳單已經逾期，為每一筆擬一封客氣的催款信，並告訴我未收總額。寄給客戶之前一定先問我。",
      },
      {
        id: "weekly",
        label: "幫我總結這一週",
        brief:
          "每週五下午五點，看一遍這一週的 Slack 頻道和我的行事曆，寫一份簡短總結：發生了什麼、什麼延誤了、下週需要我拍板什麼。",
      },
      {
        id: "competitor",
        label: "盯住一個競爭對手",
        brief:
          "每週一次，看看主要競爭對手的官網、部落格和價格頁，記下和上次相比有什麼變化，寄我一份附連結的簡報。",
      },
      {
        id: "support",
        label: "替客服工單分類",
        brief:
          "新工單一進來就讀，分成帳務、故障、使用問題三類，使用問題就從說明中心找答案擬回覆，遇到情緒激動的客戶立刻升級給我。",
      },
      {
        id: "research",
        label: "調查一批公司",
        brief:
          "給你一份公司名單，逐家查規模、產業、募資情況和一位窗口，每條事實都標註來源，最後彙整成一張表給我。",
      },
    ],
    lostToggle: "我不知道從哪裡開始",
    lostLead: "多數人把下面任一個問題唸出來就有答案了。先寫個大概就好，之後每一處都能改。",
    lostPrompts: [
      "這週你做過、最不想再做第二遍的是什麼？",
      "每天真正開工前，你都要先去看一眼什麼？",
      "有哪些事本來不該等你，卻卡在你這裡？",
      "如果來了一位可靠的新人，第一天你會先把什麼交給他？",
      "有哪個問題別人一問再問？",
    ],
    lostUse: "就用這個",
    exampleToggle: "看一個完整的例子",
    exampleLead: "一段描述，加上它產生出來的智能體。你寫的不用這麼長——這只是讓你看看「寫夠了」大概是什麼樣。",
    exampleBriefLabel: "描述",
    exampleOutcomeLabel: "我們據此起草的內容",
    exampleUse: "就從這段描述開始",
    example: {
      brief:
        "每個工作日早上八點半，讀一遍公用信箱裡的新詢問，查清楚每家公司的規模和產業，判斷像不像我們要的客戶，然後草擬一封初次回覆等我確認。任何情況下都不要報價，也不要替我寄出任何東西。遇到語氣不好的客戶，立刻告訴我。",
      outcome: [
        { key: "roles", line: "線索初篩——每封新詢問都讀，交給你的是結論，不是一堆待辦。" },
        { key: "agents", line: "一個智能體，對方用什麼語言寫就用什麼語言回，對外寄出前一律先問你。" },
        { key: "skills", line: "網頁查詢與信箱讀取，都是低風險。" },
        { key: "boundaries", line: "絕不報價 · 對外信件逐封確認 · 客戶情緒不對立刻升級。" },
        { key: "context", line: "會向你要一份「我們賣給誰」的說明。" },
        { key: "schedules", line: "工作日 08:30 執行，結果送到聊天。" },
      ],
    },
    advanced: "補充設定（執行環境、工作時間、管道）",
    advancedHint: "都可以不填。不填我們會給一組合理的預設值，下一頁還能改。",
    harnessLabel: "執行環境",
    harnessAuto: "幫我選",
    harnessHint: "智能體實際運行的執行環境。之後隨時可以換，不另外收費。",
    channelsLabel: "在哪裡找得到他",
    channelsHint: "帳號等智能體建立之後再連。",
    timezoneLabel: "時區",
    hoursLabel: "工作時間",
    hoursTo: "至",
    submit: "產生草稿",
    submitBusy: "產生中…",
    err: {
      thin: "再多說一點吧——通常一句話就夠了。",
      network: "連不上產生服務。什麼都沒有建立，你寫的內容還在。",
      networkRetry: "重試",
      conflictTitle: "已經有一份草稿在產生中",
      conflictBody: "這個工作區裡有人——也可能是你在另一個分頁——已經啟動了一次產生，還沒跑完。",
      conflictOpen: "去看看",
      rateTitle: "今天產生得有點多",
      rateHour: "這個工作區已經用完本小時的產生次數。",
      rateDay: "這個工作區已經用完今天的產生次數。",
      rateCost: "這個工作區本週期的產生額度已經用完。",
      countdown: (s) => (s > 60 ? `${Math.ceil(s / 60)} 分鐘後可以再試。` : `${s} 秒後可以再試。`),
      seeUsage: "查看用量",
      generic: "啟動產生時出了點問題，你寫的內容還在。",
    },
  },
  generating: {
    title: "正在產生你的智能體",
    briefLabel: "來自你的描述",
    stages: {
      intake: "正在理解你的需求",
      charter: "確定職務內容",
      capabilities: "梳理所需能力",
      skills: "挑選技能",
      boundaries: "設定規則與權限",
      context: "列出所需資料",
      schedules: "安排工作節奏",
      assemble: "組裝範本",
      lint: "安全檢查",
      finalize: "收尾",
    },
    listLabel: "產生進度",
    progress: (done, total) => `${done} / ${total}`,
    tokens: (n) => `${n.toLocaleString("zh-TW")} tok`,
    costUnavailable: "未回報費用",
    cancel: "停止並返回",
    cancelHint: "停止會捨棄這份草稿，你寫的描述會保留。",
    pending: "等待中",
    active: "進行中",
    done: "完成",
    failedStage: "失敗",
    modeDeterministicTitle: "這份草稿由規則產生，沒有用模型。",
    modeDeterministicBody: "目前沒有設定 AI 服務商，所以這是一份以關鍵字和範本組成的草稿。下面每一項都能改。",
    modeHybridTitle: "有幾步退回到規則。",
    modeHybridBody: (stages) => `${stages} 是靠關鍵字比對出來的，不是推理出來的。所有內容都能改。`,
    learnMore: "了解詳情",
    pollNotice: "串流連線被擋下，改用輪詢取得進度。",
    failedTitle: "產生中途停了",
    failedBody: "上面已完成的幾步仍然有效。可以從這裡重試，或換個描述重新開始。",
    tryAgain: "重試",
    startOver: "重新開始",
    outcome: {
      ok: "正常",
      repaired: "已修正",
      fallback: "走規則",
      skipped: "已略過",
      failed: "失敗",
    },
  },
  review: {
    title: "檢查你的智能體",
    subtitle: (name, harness, role) => `${name} · ${harness} · ${role}`,
    rename: "改名",
    renameLabel: "智能體名稱",
    readyTitle: "上線前檢查",
    stateOk: "沒問題",
    stateReview: "需要看一下",
    stateEmpty: "還空著",
    jumpTo: (section) => `跳到${section}`,
    sectionNames: {
      roles: "職務",
      agents: "智能體",
      skills: "技能",
      boundaries: "規則與界線",
      context: "資料",
      schedules: "提醒與排程",
    },
    countdownToLaunch: (sections, needsReview) =>
      needsReview === 0 ? `${sections} 個部分 · 都就緒了` : `${sections} 個部分 · ${needsReview} 個待確認`,
    saveTemplate: "存成範本",
    continueCta: "繼續",
    busy: "處理中…",
    streaming: "還在產生…",
    confidenceLabel: "把握程度",
    confidenceHigh: "高——你的描述很具體",
    confidenceMedium: "中——有一部分是猜的",
    confidenceLow: "低——請逐項確認",
    warningsTitle: "值得看一眼",
    warningsNone: "沒有需要提醒的。",
    untrustedNote: "以下文字來自模型或第三方目錄，只當作文字顯示，絕不會被執行。",
    editHint: "按下「繼續」之前什麼都不會建立，隨你怎麼改。",
    notProvisioned: "智能體已建立，但還沒有分配到機器。執行環境一有餘量就會自動啟動。",
    error: "沒成功。什麼都沒有建立。",
  },
  role: {
    title: "職務",
    edit: "更改",
    titleField: "職稱",
    missionField: "核心職責",
    responsibilities: "負責事項",
    responsibilityAdd: "新增一項職責",
    metrics: "做到什麼算好",
    metricLabel: "指標",
    metricTarget: "目標",
    stakeholders: "配合對象",
    handoffs: "交接給",
    empty: "沒有產生職務。填一個職稱和一句職責就行。",
    why: "為什麼是這個職務",
  },
  agent: {
    title: "智能體",
    edit: "編輯",
    nameField: "名稱",
    harnessField: "執行環境",
    autonomyField: "自主程度",
    toneField: "語氣",
    languageField: "回覆語言",
    languageAuto: "跟隨對方的語言",
    instructionsField: "工作說明",
    instructionsHint: "這是智能體每次做事前都會讀的常駐說明。用白話寫效果最好。",
    channelsField: "在哪裡找得到他",
    toolsField: "可以使用的工具",
    tasksField: "起手任務",
    taskAdd: "新增任務",
    primary: "主智能體",
    makePrimary: "設為主要智能體",
    alwaysOn: "全天待命",
    alwaysOnHint: "不看下面的工作時間，隨叫隨到。",
    hoursField: "工作時間",
    hoursTo: "至",
    daysField: "工作日",
    timezoneField: "時區",
    heartbeatField: "檢查間隔",
    heartbeatHint: (n) => `每 ${n} 分鐘檢查一次。`,
    empty: "沒有產生智能體。",
    tools: { shell: "命令列", files: "檔案", browser: "瀏覽器", docker: "容器", code: "程式碼" },
    tone: {
      professional: "專業",
      friendly: "親切",
      concise: "簡潔",
      formal: "正式",
      playful: "輕鬆",
    },
    autonomy: { suggest: "只提建議", ask: "先問我", auto: "自己決定" },
    autonomyHint: {
      suggest: "他只擬稿和建議，動手的還是你。",
      ask: "凡是要送出去的，都先問過你。",
      auto: "在下面的限額內自己行動，不再問你。",
    },
  },
  skills: {
    title: "技能",
    count: (n) => `已選 ${n} 項`,
    addSkill: "新增技能",
    addUnavailable: "技能庫還沒接到這一頁。",
    risk: { low: "低", medium: "中", high: "高" },
    riskLabel: "風險",
    compatOk: "可用",
    compatNo: "跑不動",
    compatUnknown: "未核實",
    compatOkHint: (harness) => `已確認與 ${harness} 相容。`,
    compatNoHint: (missing) => `需要 ${missing}，目前的執行環境沒有。`,
    compatUnknownHint: "還沒有人在這個執行環境上驗證過這個技能。它既不等於壞，也不等於好。",
    unverifiedMode: "執行環境還沒接上，暫時無法在真實機器上核實任何技能。",
    highBlocked: "建立完成後再處理——請到智能體的「技能」頁新增，那裡會留下風險確認紀錄。",
    requiredToggle: "必要",
    optionalToggle: "選用",
    remove: "移除技能",
    details: "技能詳情",
    suggested: "依你的描述推薦、但沒有加入的：",
    restore: "加回來",
    empty: "沒有比對到技能。智能體照樣能跑，只是手上的工具少一些。",
    requires: "相依",
    noRequirements: "沒有特殊相依。",
    ranked: (score) => `符合度 ${score.toFixed(2)}`,
  },
  rules: {
    title: "規則與界線",
    count: (n) => `${n} 條規則`,
    autonomy: "他能自己決定多少",
    approvalAmount: "超過這個金額要問我",
    approvalHint: "以整數美元計。填 0 表示任何金額都要問。",
    externalSends: "對外送出前都要我確認",
    externalSendsHint: "郵件、訊息、貼文——沒有你點頭就不出門。",
    dailyLimit: "每天動作次數上限",
    dailyLimitHint: "這是保險絲，不是預算。填 0 表示不限。",
    dailyLimitUnlimited: "不限",
    rulesHeading: "規則",
    severityHard: "絕不",
    severitySoft: "應當",
    severityField: "強度",
    categoryField: "關於",
    categories: {
      money: "錢",
      external_comms: "對外送出",
      data: "資料",
      scope: "職責範圍",
      quality: "品質",
      legal: "法務",
      safety: "安全",
      schedule: "時間",
    },
    rulePlaceholder: "寫一條規則…",
    addRule: "新增規則",
    moveUp: "上移",
    moveDown: "下移",
    moved: (text, position, total) => `${text} 已移到第 ${position} 條，共 ${total} 條`,
    prohibitions: "絕對不許",
    prohibitionAdd: "新增一件絕不能做的事",
    escalation: "什麼時候來找你",
    escalationTriggers: "觸發情境",
    escalationTriggerAdd: "新增一種情境",
    escalationChannel: "透過什麼找你",
    escalationTo: "送到哪裡",
    escalationToHint: "地址等智能體建立之後你自己填——我們絕不會從草稿裡替你填。",
    channels: { email: "郵件", chat: "聊天", none: "不通知" },
    dataHandling: "資料",
    piiAllowed: "允許處理個人資料",
    piiHint: "姓名、信箱、電話，任何能指向特定某個人的資訊。",
    retentionDays: "工作資料保留",
    redactFields: "一律遮蔽的欄位",
    redactAdd: "新增要遮蔽的欄位",
    spend: "花費",
    monthlyCap: "每月額度上限",
    monthlyCapHint: "填 0 表示照方案額度走。",
    empty: "沒有產生規則。沒有規則的智能體，你得一直盯著。",
  },
  context: {
    title: "資料",
    summary: (items, size) => `${items} 項 · ${size}`,
    addFile: "新增檔案",
    paste: "貼上文字",
    addUrl: "新增連結",
    dropTitle: "把檔案拖到這裡，或點擊選擇",
    dropBusy: "讀取中…",
    dropTypes: (types) => types,
    dropLimit: (size) => `單個不超過 ${size}`,
    quota: (used, total) => `已用 ${used} / ${total}`,
    slotsLeft: (n) => `還能再加 ${n} 項`,
    kind: { pasted_text: "文字", file_request: "檔案", url: "連結" },
    stateStaged: "待上傳",
    stateAwaiting: "等一個檔案",
    stateReady: "已儲存",
    statePending: "待處理",
    stateFailedHint: "這一項讀不出來。",
    urlPending: "尚未抓取——由智能體去抓，不是我們",
    remove: "移除",
    purposeField: "用來做什麼",
    titleField: "標題",
    bodyField: "內文",
    bodyChars: (n, max) => `${n.toLocaleString("zh-TW")} / ${max.toLocaleString("zh-TW")} 字元`,
    urlField: "網址",
    urlHint: "只支援公開的 https 頁面。抓取由智能體在自己的機器上完成，不經過這裡。",
    urlInvalid: "這不是一個可以交給智能體的公開 https 網址。",
    save: "儲存",
    cancel: "取消",
    requiredToggle: "沒有這份資料就沒辦法做事",
    empty: "還什麼都沒有",
    emptyHint: "沒有資料的智能體只能用猜的。把你第一天會交給新人的那份文件給它。",
    rejectedType: (name, type) => `${name}——不接受 ${type} 這種類型。`,
    rejectedSize: (name, size, limit) => `${name} 有 ${size}，上限是 ${limit}。`,
    rejectedQuota: (name) => `${name} 超出這個智能體剩下的配額。`,
    rejectedEmpty: (name) => `${name} 是空的。`,
    readInline: "已讀進草稿",
    readInlineFailed: "讀不出這個檔案的文字，改用上傳處理。",
    fileDeferred: "大檔案和 PDF 要等智能體建立之後再上傳——下面這一行會記住該向你要什麼。",
    untrusted: "檔名和貼上的文字都照原樣顯示，絕不會被當成指令執行。",
    duplicate: (name) => `${name} 已經在清單裡了。`,
  },
  schedules: {
    title: "提醒與排程",
    count: (n) => `${n} 條排程`,
    add: "新增排程",
    on: "開",
    off: "關",
    edit: "編輯排程",
    remove: "刪除排程",
    next: "下次",
    noNext: "永遠不會觸發——檢查一下運算式",
    readOnlyOnce: (date) => `一次性，${date}。智能體建立後才能改。`,
    labelField: "名稱",
    phraseField: "用你自己的話說什麼時候",
    phraseHint: "例如「每個工作日早上八點半」或「每月一號上午九點」。",
    phraseUnderstood: (text) => `理解為：${text}`,
    phraseUse: "就這樣",
    phraseUnsure: "我們大概是這個意思，但不確定——請看下面的預覽。",
    phraseNone: "這句話讀不出時間，請用下面的控制項設定。",
    phraseRemote: "已與伺服器核對。",
    whenField: "頻率",
    presetDaily: "每天",
    presetWeekdays: "工作日",
    presetWeekly: "每週",
    presetCustom: "自訂",
    daysField: "星期",
    dayNames: ["日", "一", "二", "三", "四", "五", "六"],
    dayNamesLong: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],
    timeField: "時間",
    timezoneField: "時區",
    repeatField: "重複",
    repeatEvery: (n) => `每 ${n} 分鐘`,
    repeatBetween: "從",
    repeatAnd: "到",
    advanced: "進階",
    cronField: "Cron",
    cronHelp: "五個欄位：分 時 日 月 星期。",
    cronUnion: "當「日」和「星期」都限定時，兩者滿足其一就觸發，不是同時滿足。",
    cronValid: "有效",
    cronInvalid: (reason) => reason,
    maxRuns: (n) => `每天最多 ${n} 次`,
    maxRunsHint: "超過上限的會被略過，不會排隊。",
    promptField: "做什麼",
    promptHint: "一句話的指令。每次觸發時智能體收到的就是這句。",
    deliverField: "結果送到",
    deliver: { chat: "聊天", email: "郵件", channel: "所屬管道", none: "不送出" },
    previewTitle: (tz) => `接下來 5 次 · ${tz}`,
    previewEmpty: "無法預覽——先修正上面的運算式。",
    dstNote: "日光節約時間變更",
    dstTitle:
      "這次觸發前後該時區會調整時鐘。被略過的那一小時會在時鐘跳到的瞬間觸發；重複的那一小時只觸發一次。",
    save: "儲存",
    cancel: "取消",
    empty: "還沒有排程。沒有節奏的智能體，只有你戳一下才動一下。",
    kindLabel: { recurring: "重複", one_off: "一次性", reminder: "提醒" },
    sourceLlm: "模型產生",
    sourceDeterministic: "由你的話比對",
    sourceUser: "你的原話",
  },
  common: {
    edit: "編輯",
    done: "完成",
    cancel: "取消",
    save: "儲存",
    add: "新增",
    remove: "移除",
    yes: "是",
    no: "否",
    none: "無",
    unknown: "未知",
    loading: "載入中…",
    retry: "重試",
    back: "返回",
  },
};

// ---------------------------------------------------------------------------
// 日本語
// ---------------------------------------------------------------------------

const ja: CreateDict = {
  entry: {
    cta: "言葉で説明する →",
    hint: "必要なことを自分の言葉で書けば、役割・ルール・スケジュールまで一式を下書きします。",
  },
  describe: {
    title: "この社員に、どの仕事を任せますか？",
    sub: "新しく入った人に説明するつもりで書いてください。あとはこちらで組み立てます。",
    textareaLabel: "任せたい仕事",
    placeholder:
      "毎朝、共有メールボックスの新規問い合わせを確認して、相手の会社を調べ、返信の下書きを作ってください。価格は絶対に提示しないこと。",
    counter: (used, max) => `${used}/${max}`,
    minHint: (remaining) => `あと ${remaining} 文字で開始できます。`,
    seedsLead: "決めかねますか？ こんなところから —",
    seedFillHint: "選ぶと上の入力欄に入ります。まだ何も作成されません。",
    starters: [
      {
        id: "inbound",
        label: "問い合わせの見極め",
        brief:
          "平日の朝、共有メールボックスの新規問い合わせを読み、各社を調べて、うちが売る相手かどうかを判断し、私が承認できる形で初回返信の下書きを作ってください。価格は絶対に出さないこと。",
      },
      {
        id: "invoices",
        label: "未回収の請求を追う",
        brief:
          "毎週月曜、期限を過ぎた請求書を洗い出し、一件ずつ丁寧な督促メールの下書きを作り、未回収の合計額を教えてください。顧客に送る前に必ず私に確認すること。",
      },
      {
        id: "weekly",
        label: "1週間をまとめる",
        brief:
          "毎週金曜17時に、その週の Slack と私のカレンダーを読み、何が起きたか・何が遅れたか・来週私が判断すべきことを短くまとめてください。",
      },
      {
        id: "competitor",
        label: "競合を見張る",
        brief:
          "週に一度、主要な競合のサイト・ブログ・価格ページを確認し、前回からの変化を記録して、リンク付きの短いレポートを送ってください。",
      },
      {
        id: "support",
        label: "問い合わせの一次仕分け",
        brief:
          "新しい問い合わせが届いたら読み、請求・不具合・使い方の3つに仕分けし、使い方のものはヘルプセンターを元に回答案を作り、怒っている人はすぐ私にエスカレーションしてください。",
      },
      {
        id: "research",
        label: "企業リストを調べる",
        brief:
          "会社名のリストを渡すので、各社の規模・業種・資金調達・担当者名を調べ、事実ごとに出典を付けて、一枚の表にまとめてください。",
      },
    ],
    lostToggle: "どこから書けばいいか分からない",
    lostLead:
      "たいていは、次のどれかに声に出して答えると見つかります。ざっくりで構いません。あとから全部変えられます。",
    lostPrompts: [
      "今週やった中で、二度とやりたくない作業は何ですか？",
      "本題に入る前に、毎朝必ず確認していることは？",
      "本来あなたを待つ必要がないのに、あなたで止まっている仕事は？",
      "有能な新人が来たら、初日にまず何を渡しますか？",
      "同じ質問を、何度も聞かれていませんか？",
    ],
    lostUse: "これにする",
    exampleToggle: "実際の例を見る",
    exampleLead:
      "ひとつの依頼文と、そこから作られたエージェントです。ここまで長く書く必要はありません。「これくらい書けば足りる」の目安として見てください。",
    exampleBriefLabel: "依頼文",
    exampleOutcomeLabel: "そこから作った下書き",
    exampleUse: "この依頼文から始める",
    example: {
      brief:
        "平日の朝8時30分に、共有メールボックスの新しい問い合わせを読んで、各社の規模と業種を調べ、うちの客層に合うかを判断して、最初の返信を下書きしてください。金額は絶対に出さないこと。私の確認なしに送らないこと。怒っている相手がいたら、すぐ知らせてください。",
      outcome: [
        { key: "roles", line: "問い合わせの一次判断——すべて読んで、作業の山ではなく結論を渡します。" },
        { key: "agents", line: "エージェント1体。書かれた言語で返信し、社外に出す前に必ず確認します。" },
        { key: "skills", line: "Web調査とメール閲覧。どちらもリスクは低。" },
        { key: "boundaries", line: "金額は出さない · 社外メールは毎回承認 · 怒っている相手は即エスカレーション。" },
        { key: "context", line: "「誰に売っているか」の資料を1つ求めます。" },
        { key: "schedules", line: "平日 08:30 に実行、結果はチャットへ。" },
      ],
    },
    advanced: "詳細を指定（ハーネス・稼働時間・チャネル）",
    advancedHint: "すべて任意です。空のままなら妥当な初期値を選び、次の画面で変更できます。",
    harnessLabel: "ハーネス",
    harnessAuto: "おまかせ",
    harnessHint: "エージェントが実際に動く実行環境です。あとから無料で変更できます。",
    channelsLabel: "連絡できる場所",
    channelsHint: "アカウントの接続はエージェント作成後に行います。",
    timezoneLabel: "タイムゾーン",
    hoursLabel: "稼働時間",
    hoursTo: "〜",
    submit: "下書きを作る",
    submitBusy: "作成中…",
    err: {
      thin: "もう少しだけ詳しく書いてください。ひと文足せば十分なことがほとんどです。",
      network: "生成サービスに接続できませんでした。何も作成されておらず、入力内容は残っています。",
      networkRetry: "再試行",
      conflictTitle: "すでに下書きを生成中です",
      conflictBody:
        "このワークスペースの誰か——別のタブのあなたかもしれません——が始めた生成がまだ終わっていません。",
      conflictOpen: "開く",
      rateTitle: "今日はかなりの回数を生成しています",
      rateHour: "このワークスペースは1時間あたりの生成上限に達しました。",
      rateDay: "このワークスペースは本日の生成上限に達しました。",
      rateCost: "このワークスペースは今期の生成予算を使い切りました。",
      countdown: (s) => (s > 60 ? `${Math.ceil(s / 60)} 分後に再試行できます。` : `${s} 秒後に再試行できます。`),
      seeUsage: "利用状況を見る",
      generic: "生成の開始でエラーが発生しました。入力内容は残っています。",
    },
  },
  generating: {
    title: "エージェントを作成中",
    briefLabel: "あなたの依頼内容",
    stages: {
      intake: "依頼内容を読み取り中",
      charter: "職務を定義中",
      capabilities: "必要な能力を整理中",
      skills: "スキルを選定中",
      boundaries: "ルールと権限を設定中",
      context: "必要な資料を洗い出し中",
      schedules: "稼働リズムを設計中",
      assemble: "テンプレートを組み立て中",
      lint: "安全性を確認中",
      finalize: "仕上げ中",
    },
    listLabel: "作成の進捗",
    progress: (done, total) => `${done} / ${total}`,
    tokens: (n) => `${n.toLocaleString("ja-JP")} tok`,
    costUnavailable: "コスト未報告",
    cancel: "中止して戻る",
    cancelHint: "中止するとこの下書きは破棄されます。入力した説明は残ります。",
    pending: "待機中",
    active: "実行中",
    done: "完了",
    failedStage: "失敗",
    modeDeterministicTitle: "この下書きはモデルではなくルールで作りました。",
    modeDeterministicBody:
      "AI プロバイダーが設定されていないため、キーワードとテンプレートによる下書きです。以下はすべて編集できます。",
    modeHybridTitle: "一部の工程がルールに切り替わりました。",
    modeHybridBody: (stages) =>
      `${stages} は推論ではなくキーワード一致で組み立てています。すべて編集できます。`,
    learnMore: "詳しく",
    pollNotice: "ストリーミングが遮断されたため、定期取得で進捗を確認しています。",
    failedTitle: "途中で止まりました",
    failedBody:
      "上で完了した工程はそのまま使えます。ここから再試行するか、説明を変えてやり直してください。",
    tryAgain: "再試行",
    startOver: "最初から",
    outcome: {
      ok: "正常",
      repaired: "修正済み",
      fallback: "ルール",
      skipped: "スキップ",
      failed: "失敗",
    },
  },
  review: {
    title: "内容を確認",
    subtitle: (name, harness, role) => `${name} · ${harness} · ${role}`,
    rename: "名前を変更",
    renameLabel: "エージェント名",
    readyTitle: "公開前チェック",
    stateOk: "問題なし",
    stateReview: "要確認",
    stateEmpty: "未入力",
    jumpTo: (section) => `${section}へ移動`,
    sectionNames: {
      roles: "職務",
      agents: "エージェント",
      skills: "スキル",
      boundaries: "ルールと権限",
      context: "資料",
      schedules: "リマインダーとスケジュール",
    },
    countdownToLaunch: (sections, needsReview) =>
      needsReview === 0
        ? `${sections} 項目 · すべて確認済み`
        : `${sections} 項目 · ${needsReview} 件が要確認`,
    saveTemplate: "テンプレートとして保存",
    continueCta: "次へ",
    busy: "処理中…",
    streaming: "まだ作成中…",
    confidenceLabel: "確度",
    confidenceHigh: "高——依頼が具体的でした",
    confidenceMedium: "中——一部は推測です",
    confidenceLow: "低——各項目を必ず確認してください",
    warningsTitle: "確認しておきたい点",
    warningsNone: "指摘はありません。",
    untrustedNote:
      "以下の文章はモデルまたは外部カタログ由来です。文字として表示するだけで、実行されることはありません。",
    editHint: "「次へ」を押すまで何も作成されません。自由に書き換えてください。",
    notProvisioned:
      "エージェントは作成されましたが、まだマシンが割り当てられていません。実行環境に空きができ次第、自動で起動します。",
    error: "うまくいきませんでした。何も作成されていません。",
  },
  role: {
    title: "職務",
    edit: "変更",
    titleField: "職種名",
    missionField: "ミッション",
    responsibilities: "担当すること",
    responsibilityAdd: "担当を追加",
    metrics: "うまくいっている状態",
    metricLabel: "指標",
    metricTarget: "目標",
    stakeholders: "関わる相手",
    handoffs: "引き継ぎ先",
    empty: "職務が作成されませんでした。職種名と一行のミッションを入れてください。",
    why: "この職務にした理由",
  },
  agent: {
    title: "エージェント",
    edit: "編集",
    nameField: "名前",
    harnessField: "ハーネス",
    autonomyField: "自律度",
    toneField: "話し方",
    languageField: "返信の言語",
    languageAuto: "相手に合わせる",
    instructionsField: "業務指示",
    instructionsHint: "毎回の作業前に必ず読む常設の指示です。普段の言葉で書くのが一番効きます。",
    channelsField: "連絡できる場所",
    toolsField: "使ってよいツール",
    tasksField: "最初のタスク",
    taskAdd: "タスクを追加",
    primary: "主担当",
    makePrimary: "このエージェントを主担当にする",
    alwaysOn: "常時稼働",
    alwaysOnHint: "下の勤務時間を無視して、呼ばれたらいつでも応答します。",
    hoursField: "勤務時間",
    hoursTo: "〜",
    daysField: "稼働曜日",
    timezoneField: "タイムゾーン",
    heartbeatField: "確認の間隔",
    heartbeatHint: (n) => `${n} 分ごとに確認します。`,
    empty: "エージェントが作成されませんでした。",
    tools: { shell: "シェル", files: "ファイル", browser: "ブラウザ", docker: "コンテナ", code: "コード" },
    tone: {
      professional: "プロフェッショナル",
      friendly: "フレンドリー",
      concise: "簡潔",
      formal: "フォーマル",
      playful: "くだけた",
    },
    autonomy: { suggest: "提案のみ", ask: "先に確認", auto: "自分で判断" },
    autonomyHint: {
      suggest: "下書きと提案だけ。実行するのはあなたです。",
      ask: "外に出るものは、必ず事前に確認します。",
      auto: "下の上限の範囲内なら確認せずに実行します。",
    },
  },
  skills: {
    title: "スキル",
    count: (n) => `${n} 件を選択`,
    addSkill: "スキルを追加",
    addUnavailable: "この画面ではスキルカタログがまだ接続されていません。",
    risk: { low: "低", medium: "中", high: "高" },
    riskLabel: "リスク",
    compatOk: "動作する",
    compatNo: "動かない",
    compatUnknown: "未検証",
    compatOkHint: (harness) => `${harness} との互換性が宣言されています。`,
    compatNoHint: (missing) => `${missing} が必要ですが、このハーネスにはありません。`,
    compatUnknownHint:
      "このハーネスで誰も検証していません。壊れているという意味でも、動くという意味でもありません。",
    unverifiedMode: "ランタイムが未接続のため、実機でのスキル検証はまだできません。",
    highBlocked:
      "作成後に対応してください——エージェントの「スキル」タブから追加すると、リスク承認が記録されます。",
    requiredToggle: "必須",
    optionalToggle: "任意",
    remove: "スキルを外す",
    details: "スキルの詳細",
    suggested: "依頼内容から候補に挙がったが未追加のもの：",
    restore: "戻す",
    empty: "該当するスキルがありませんでした。道具は少なくても動作はします。",
    requires: "必要なもの",
    noRequirements: "特別な要件はありません。",
    ranked: (score) => `一致度 ${score.toFixed(2)}`,
  },
  rules: {
    title: "ルールと権限",
    count: (n) => `${n} 件のルール`,
    autonomy: "どこまで自分で決めてよいか",
    approvalAmount: "この金額を超えたら確認",
    approvalHint: "米ドルの整数。0 ならどんな金額でも確認します。",
    externalSends: "社外に出すものは必ず承認",
    externalSendsHint: "メール・メッセージ・投稿——あなたの承認なしには出しません。",
    dailyLimit: "1日あたりの実行回数",
    dailyLimitHint: "予算ではなくブレーカーです。0 で上限なし。",
    dailyLimitUnlimited: "上限なし",
    rulesHeading: "ルール",
    severityHard: "禁止",
    severitySoft: "推奨",
    severityField: "強さ",
    categoryField: "分類",
    categories: {
      money: "お金",
      external_comms: "社外への送信",
      data: "データ",
      scope: "担当範囲",
      quality: "品質",
      legal: "法務",
      safety: "安全",
      schedule: "タイミング",
    },
    rulePlaceholder: "ルールを入力…",
    addRule: "ルールを追加",
    moveUp: "上へ",
    moveDown: "下へ",
    moved: (text, position, total) => `${text} を ${total} 件中 ${position} 番目に移動しました`,
    prohibitions: "絶対に禁止",
    prohibitionAdd: "絶対にさせないことを追加",
    escalation: "あなたに上げる場面",
    escalationTriggers: "該当する状況",
    escalationTriggerAdd: "状況を追加",
    escalationChannel: "連絡手段",
    escalationTo: "送り先",
    escalationToHint: "宛先はエージェント作成後にご自身で設定します。下書きから自動入力することはありません。",
    channels: { email: "メール", chat: "チャット", none: "通知しない" },
    dataHandling: "データ",
    piiAllowed: "個人情報を扱ってよい",
    piiHint: "氏名・メール・電話番号など、個人を特定できる情報です。",
    retentionDays: "作業データの保持期間",
    redactFields: "常に伏せる項目",
    redactAdd: "伏せる項目を追加",
    spend: "支出",
    monthlyCap: "月間クレジット上限",
    monthlyCapHint: "0 ならプランの枠を使います。",
    empty: "ルールが作成されませんでした。ルールのないエージェントは、ずっと見張ることになります。",
  },
  context: {
    title: "資料",
    summary: (items, size) => `${items} 件 · ${size}`,
    addFile: "ファイルを追加",
    paste: "テキストを貼る",
    addUrl: "リンクを追加",
    dropTitle: "ここにドロップ、またはクリックして選択",
    dropBusy: "読み込み中…",
    dropTypes: (types) => types,
    dropLimit: (size) => `1件あたり ${size} まで`,
    quota: (used, total) => `${total} 中 ${used} 使用`,
    slotsLeft: (n) => `あと ${n} 件まで追加できます`,
    kind: { pasted_text: "テキスト", file_request: "ファイル", url: "リンク" },
    stateStaged: "アップロード待ち",
    stateAwaiting: "ファイル待ち",
    stateReady: "保存済み",
    statePending: "保留",
    stateFailedHint: "この項目は読み取れませんでした。",
    urlPending: "未取得——取りに行くのはエージェントで、こちらではありません",
    remove: "削除",
    purposeField: "何のための資料か",
    titleField: "タイトル",
    bodyField: "本文",
    bodyChars: (n, max) => `${n.toLocaleString("ja-JP")} / ${max.toLocaleString("ja-JP")} 文字`,
    urlField: "URL",
    urlHint: "公開された https ページのみ。取得はエージェント側の環境で行われ、ここは経由しません。",
    urlInvalid: "エージェントに渡せる公開 https の URL ではありません。",
    save: "保存",
    cancel: "キャンセル",
    requiredToggle: "これがないと仕事にならない",
    empty: "まだ何もありません",
    emptyHint: "資料がなければ推測するしかありません。新人の初日に渡す資料を渡してください。",
    rejectedType: (name, type) => `${name} — ${type} は受け付けていない形式です。`,
    rejectedSize: (name, size, limit) => `${name} は ${size} です。上限は ${limit} です。`,
    rejectedQuota: (name) => `${name} はこのエージェントの残り容量に収まりません。`,
    rejectedEmpty: (name) => `${name} は空です。`,
    readInline: "下書きに取り込み済み",
    readInlineFailed: "このファイルの文字を読み取れませんでした。アップロードに切り替えます。",
    fileDeferred:
      "大きなファイルやPDFは、エージェントができてから添付します。下の行が「何を求めるか」を覚えています。",
    untrusted: "ファイル名と貼り付けたテキストはそのまま表示され、指示として扱われることはありません。",
    duplicate: (name) => `${name} はすでに一覧にあります。`,
  },
  schedules: {
    title: "リマインダーとスケジュール",
    count: (n) => `${n} 件`,
    add: "スケジュールを追加",
    on: "オン",
    off: "オフ",
    edit: "スケジュールを編集",
    remove: "スケジュールを削除",
    next: "次回",
    noNext: "一度も実行されません——式を確認してください",
    readOnlyOnce: (date) => `単発、${date}。編集はエージェント作成後に可能です。`,
    labelField: "名前",
    phraseField: "いつ実行するか、普段の言葉で",
    phraseHint: "例：「平日の8時半」「毎月1日の9時」",
    phraseUnderstood: (text) => `こう解釈しました：${text}`,
    phraseUse: "これにする",
    phraseUnsure: "たぶんこの意味ですが、確信はありません。プレビューで確認してください。",
    phraseNone: "時刻として読み取れませんでした。下のコントロールで指定してください。",
    phraseRemote: "サーバーで確認済み。",
    whenField: "頻度",
    presetDaily: "毎日",
    presetWeekdays: "平日",
    presetWeekly: "毎週",
    presetCustom: "カスタム",
    daysField: "曜日",
    dayNames: ["日", "月", "火", "水", "木", "金", "土"],
    dayNamesLong: ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"],
    timeField: "時刻",
    timezoneField: "タイムゾーン",
    repeatField: "繰り返し",
    repeatEvery: (n) => `${n} 分ごと`,
    repeatBetween: "開始",
    repeatAnd: "終了",
    advanced: "詳細",
    cronField: "cron",
    cronHelp: "5つのフィールド：分 時 日 月 曜日。",
    cronUnion: "日と曜日の両方を指定した場合、どちらか一方に一致すれば実行されます（両方ではありません）。",
    cronValid: "有効",
    cronInvalid: (reason) => reason,
    maxRuns: (n) => `1日あたり最大 ${n} 回`,
    maxRunsHint: "上限を超えた分はスキップされ、キューには入りません。",
    promptField: "何をするか",
    promptHint: "指示は一つ、普段の言葉で。毎回これがエージェントに渡ります。",
    deliverField: "結果の送り先",
    deliver: { chat: "チャット", email: "メール", channel: "所属チャネル", none: "送らない" },
    previewTitle: (tz) => `次の5回 · ${tz}`,
    previewEmpty: "プレビューできません——上の式を直してください。",
    dstNote: "時刻変更あり",
    dstTitle:
      "この実行の前後で、このタイムゾーンの時計が変わります。飛ばされた時刻は時計が進んだ瞬間に、重複した時刻は一度だけ実行されます。",
    save: "保存",
    cancel: "キャンセル",
    empty: "まだスケジュールがありません。リズムのないエージェントは、つついた時しか動きません。",
    kindLabel: { recurring: "繰り返し", one_off: "単発", reminder: "リマインダー" },
    sourceLlm: "モデルが作成",
    sourceDeterministic: "あなたの言葉から一致",
    sourceUser: "あなたの表現",
  },
  common: {
    edit: "編集",
    done: "完了",
    cancel: "キャンセル",
    save: "保存",
    add: "追加",
    remove: "削除",
    yes: "はい",
    no: "いいえ",
    none: "なし",
    unknown: "不明",
    loading: "読み込み中…",
    retry: "再試行",
    back: "戻る",
  },
};

export const create: Record<Lang, CreateDict> = { en, zh, zht, ja };
