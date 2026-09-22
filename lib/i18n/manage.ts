/**
 * Copy for the agent-management (CONFIG) and ACTIVITY surfaces — §E and §F of
 * docs/UI_DESIGN_V2.md.
 *
 * Written natively in each language, not translated word-for-word. Two habits
 * matter here more than elsewhere:
 *  - Placeholders are `{name}` tokens interpolated by `mt()`, never string
 *    concatenation, because the word order of "3 unsaved changes in Skills" is
 *    different in all four languages and concatenation freezes English's.
 *  - Error strings say what is wrong AND what to do. "Invalid" is not a message.
 */
import type { Lang } from "@/lib/types";

export interface ManageDict {
  // ── shell / rail ────────────────────────────────────────────────────────
  configHeading: string;
  railLabel: string;
  secRules: string;
  secSkills: string;
  secContext: string;
  secSchedules: string;
  statusClean: string;
  statusDirty: string;
  statusInvalid: string;
  edited: string;
  configLoading: string;
  configLoadError: string;
  configUnavailable: string;
  tryAgain: string;
  cancel: string;
  confirm: string;
  close: string;

  // ── dirty bar ───────────────────────────────────────────────────────────
  unsavedOne: string;
  unsavedMany: string;
  discard: string;
  saveAndResync: string;
  saving: string;
  problemOne: string;
  problemMany: string;
  goToFirstProblem: string;
  savedPushed: string;
  savedUnreachable: string;
  savedRetryHint: string;
  retryNow: string;
  whatDoesThisMean: string;
  whatDoesThisMeanBody: string;
  savedSimulator: string;
  savedUnimplemented: string;
  saveFailed: string;
  conflictTitle: string;
  conflictBody: string;
  reviewDifferences: string;
  overwrite: string;
  leaveTitle: string;
  leaveBody: string;
  keepEditing: string;
  discardAndLeave: string;
  revertField: string;

  // ── rules & boundaries ──────────────────────────────────────────────────
  rulesTitle: string;
  rulesDesc: string;
  ruleMust: string;
  ruleNever: string;
  ruleEscalate: string;
  ruleMustHint: string;
  ruleNeverHint: string;
  ruleEscalateHint: string;
  addRule: string;
  rulePlaceholder: string;
  removeRule: string;
  moveUp: string;
  moveDown: string;
  noRulesTitle: string;
  noRulesBody: string;
  ruleCounter: string;
  boundariesTitle: string;
  autonomyLabel: string;
  autonomySuggest: string;
  autonomyAsk: string;
  autonomyAuto: string;
  autonomyHint: string;
  approvalAmount: string;
  approvalAmountHint: string;
  dailyActionLimit: string;
  dailyActionLimitHint: string;
  approveExternal: string;
  approveExternalDesc: string;

  // ── skills ──────────────────────────────────────────────────────────────
  skillsTitle: string;
  skillsDesc: string;
  addSkill: string;
  skillCounter: string;
  noSkillsTitle: string;
  noSkillsBody: string;
  colSkill: string;
  colVersion: string;
  colRisk: string;
  colState: string;
  riskLow: string;
  riskMedium: string;
  riskHigh: string;
  stPending: string;
  stInstalling: string;
  stInstalled: string;
  stFailed: string;
  stRemoving: string;
  stRemoved: string;
  installErrorLabel: string;
  mockInstall: string;
  needsRecheck: string;
  needsRecheckHint: string;
  compatOk: string;
  compatUnmet: string;
  compatUnknown: string;
  compatOkHint: string;
  compatUnmetHint: string;
  compatUnknownHint: string;
  unmetTitle: string;
  blockedBadge: string;
  blockedHint: string;
  updateAvailable: string;
  enableSkill: string;
  disableSkill: string;
  detach: string;
  detachTitle: string;
  detachBody: string;
  riskConfirmTitle: string;
  riskConfirmBody: string;
  riskAckCheckbox: string;
  riskNotAcknowledged: string;
  acknowledgeRisk: string;
  skillsUnavailable: string;

  // ── context ─────────────────────────────────────────────────────────────
  contextTitle: string;
  contextDesc: string;
  dropHere: string;
  browseFiles: string;
  addText: string;
  textNameLabel: string;
  textNamePlaceholder: string;
  textBodyLabel: string;
  textBodyPlaceholder: string;
  addTextAction: string;
  kFile: string;
  kText: string;
  kUrl: string;
  cAwaitingUpload: string;
  cPending: string;
  cIndexing: string;
  cIndexed: string;
  cFailed: string;
  cRemoved: string;
  chunksLabel: string;
  uploadNow: string;
  uploading: string;
  removeItem: string;
  removeItemTitle: string;
  removeItemBody: string;
  noContextTitle: string;
  noContextBody: string;
  contextQuota: string;
  urlIsText: string;
  retryIndexing: string;
  allowedTypes: string;

  // ── schedules ───────────────────────────────────────────────────────────
  schedulesTitle: string;
  schedulesDesc: string;
  addSchedule: string;
  noSchedulesTitle: string;
  noSchedulesBody: string;
  schedName: string;
  schedKind: string;
  schedCron: string;
  schedInterval: string;
  schedRunAt: string;
  schedTimezone: string;
  schedPrompt: string;
  schedPromptHint: string;
  schedDeliver: string;
  schedMaxRuns: string;
  schedMaxRunsHint: string;
  kCron: string;
  kInterval: string;
  kOnce: string;
  dChat: string;
  dEmail: string;
  dChannel: string;
  dNone: string;
  nextRun: string;
  nextRunNone: string;
  nextThree: string;
  pauseSchedule: string;
  resumeSchedule: string;
  pauseAll: string;
  pauseAllTitle: string;
  pauseAllBody: string;
  lastRun: string;
  lsStarted: string;
  lsSucceeded: string;
  lsFailed: string;
  lsSkipped: string;
  neverRun: string;
  historyTitle: string;
  historyEmpty: string;
  historyError: string;
  historyLoading: string;
  showHistory: string;
  hideHistory: string;
  editSchedule: string;
  doneEditing: string;
  deleteSchedule: string;
  deleteScheduleTitle: string;
  deleteScheduleBody: string;
  cronHelp: string;
  intervalSecondsUnit: string;

  // ── validation ──────────────────────────────────────────────────────────
  errRuleEmpty: string;
  errRuleLong: string;
  errRuleCount: string;
  errApprovalInt: string;
  errLimitInt: string;
  errScheduleName: string;
  errSchedulePrompt: string;
  errCron: string;
  errCronUnsupported: string;
  errTimezone: string;
  errInterval: string;
  errRunAt: string;
  errRunAtPast: string;
  errMaxRuns: string;
  errContextTooLarge: string;
  errContextType: string;
  errContextQuota: string;
  errContextEmpty: string;
  errContextTextLong: string;
  errContextUrl: string;
  errContextName: string;
  errSkillCount: string;
  errSkillRisk: string;

  // ── activity: shell + timeline ──────────────────────────────────────────
  actTimeline: string;
  actRuns: string;
  actHealth: string;
  actCost: string;
  searchPlaceholder: string;
  filterTrigger: string;
  filterOutcome: string;
  filterTag: string;
  filterRange: string;
  filterAll: string;
  range1: string;
  range7: string;
  range30: string;
  rangeAll: string;
  trgChat: string;
  trgSchedule: string;
  trgChannel: string;
  trgApi: string;
  trgSelf: string;
  trgSystem: string;
  rsQueued: string;
  rsRunning: string;
  rsSucceeded: string;
  rsFailed: string;
  rsCancelled: string;
  rsTimeout: string;
  live: string;
  liveOn: string;
  liveOff: string;
  liveUnavailable: string;
  dayToday: string;
  dayYesterday: string;
  daySummary: string;
  stepsCount: string;
  loadMore: string;
  loadingMore: string;
  timelineErrorTitle: string;
  timelineErrorBody: string;
  activityUnavailable: string;
  emptyTitle: string;
  emptyBodyNext: string;
  emptyBodyNoSchedule: string;
  emptySimulator: string;
  emptyFiltered: string;
  clearFilters: string;
  runNow: string;
  openChat: string;
  newSinceAway: string;
  showThem: string;

  // ── activity: run drawer ────────────────────────────────────────────────
  runIdLabel: string;
  copyRunId: string;
  copied: string;
  exportJson: string;
  rerun: string;
  rerunUnavailable: string;
  expandAll: string;
  collapseAll: string;
  phThinking: string;
  phToolCall: string;
  phToolResult: string;
  phMessage: string;
  phFinalAnswer: string;
  stepsTitle: string;
  noStepsQueued: string;
  noSteps: string;
  truncated: string;
  ribbonLabel: string;
  durationLabel: string;
  tokensLabel: string;
  costLabel: string;
  timeoutAgainst: string;
  runErrorTitle: string;
  runLoadError: string;
  untrustedNote: string;

  // ── activity: health ────────────────────────────────────────────────────
  healthTitle: string;
  legendRunning: string;
  legendIdle: string;
  legendUnhealthy: string;
  legendStopped: string;
  legendNoSample: string;
  metricCpu: string;
  metricMemory: string;
  metricDisk: string;
  metricUptime: string;
  peakAt: string;
  peakOnly: string;
  growthIn: string;
  sinceTime: string;
  restarts7d: string;
  livenessTitle: string;
  lastHeartbeat: string;
  activeRuns: string;
  lastActivity: string;
  configInSync: string;
  syncInSync: string;
  syncPending: string;
  syncNotReported: string;
  hbOk: string;
  hbStale: string;
  hbVeryStale: string;
  hbUnknown: string;
  noHealthTitle: string;
  noHealthBody: string;
  mockSamples: string;
  srSparkCaption: string;
  noMemLimit: string;
  healthErrorTitle: string;

  // ── activity: cost ──────────────────────────────────────────────────────
  costGroupBy: string;
  byRun: string;
  byTrigger: string;
  byModel: string;
  bySkill: string;
  metricSpend: string;
  metricRuns: string;
  metricCostPerRun: string;
  vsPrev: string;
  noPrev: string;
  dailySpend: string;
  breakdownTitle: string;
  colRuns: string;
  colTokens: string;
  colCost: string;
  colShare: string;
  mostExpensive: string;
  estimatedFootnote: string;
  noCostTitle: string;
  noCostBody: string;
  costErrorTitle: string;
  dayCursorHint: string;
  // ── management panels (added by the panels vertical) ────────────────────
  /** Joins the section names inside "{n} unsaved changes in {sections}". */
  charCounter: string;
  listSep: string;
  unsavedRegion: string;
  ruleKind: string;
  ruleTextLabel: string;
  browseSkills: string;
  skillSearchPlaceholder: string;
  skillCatalogEmpty: string;
  skillCatalogLoading: string;
  skillCatalogError: string;
  attachAction: string;
  attachedAlready: string;
  riskAcknowledged: string;
  contextUnavailable: string;
  addUrl: string;
  urlLabel: string;
  urlPlaceholder: string;
  addUrlAction: string;
  uploadDeferred: string;
  schedulesUnavailable: string;
  newScheduleDefault: string;
  reasonLabel: string;
}

const en: ManageDict = {
  configHeading: "Configuration",
  railLabel: "Configuration sections",
  secRules: "RULES",
  secSkills: "SKILLS",
  secContext: "CONTEXT",
  secSchedules: "SCHEDULES",
  statusClean: "no changes",
  statusDirty: "unsaved changes",
  statusInvalid: "needs fixing",
  edited: "edited",
  configLoading: "Loading configuration…",
  configLoadError: "Couldn't load this agent's configuration.",
  configUnavailable:
    "The configuration API isn't part of this build yet, so nothing here can be edited.",
  tryAgain: "Try again",
  cancel: "Cancel",
  confirm: "Confirm",
  close: "Close",

  unsavedOne: "1 unsaved change in {sections}",
  unsavedMany: "{n} unsaved changes in {sections}",
  discard: "Discard",
  saveAndResync: "Save & re-sync",
  saving: "Saving…",
  problemOne: "1 problem",
  problemMany: "{n} problems",
  goToFirstProblem: "Go to the first problem",
  savedPushed: "Saved and pushed to {name} · {time}",
  savedUnreachable: "Saved. {name} is still running the previous configuration.",
  savedRetryHint: "We'll retry automatically.",
  retryNow: "Retry now",
  whatDoesThisMean: "What does this mean?",
  whatDoesThisMeanBody:
    "Your changes are stored. Pushing them to the running machine is a second step, and it failed. The agent keeps working on its old settings until the push succeeds — it does not stop.",
  savedSimulator: "Saved. The runtime is in simulator mode, so nothing was pushed.",
  savedUnimplemented:
    "Saved. This runtime doesn't accept configuration pushes yet, so {name} will pick the changes up on its next restart.",
  saveFailed: "Couldn't save. Nothing was changed.",
  conflictTitle: "{name} was changed elsewhere.",
  conflictBody:
    "Someone else saved this agent while you were editing. Overwriting replaces their changes with yours.",
  reviewDifferences: "Review differences",
  overwrite: "Overwrite",
  leaveTitle: "Leave without saving?",
  leaveBody: "You have {n} unsaved changes. They will be lost.",
  keepEditing: "Keep editing",
  discardAndLeave: "Discard and leave",
  revertField: "Revert this field",

  rulesTitle: "RULES & BOUNDARIES",
  rulesDesc:
    "Hard limits the agent is told about on every run. Short, specific sentences work best.",
  ruleMust: "MUST",
  ruleNever: "NEVER",
  ruleEscalate: "ESCALATE",
  ruleMustHint: "Always do this.",
  ruleNeverHint: "Never do this, whatever the reason.",
  ruleEscalateHint: "Stop and ask a human when this happens.",
  addRule: "+ Add rule",
  rulePlaceholder: "e.g. Quote a price only from the current price list",
  removeRule: "Remove rule",
  moveUp: "Move up",
  moveDown: "Move down",
  noRulesTitle: "No rules yet",
  noRulesBody:
    "Without rules the agent falls back to its brief alone. One or two boundaries usually prevent the mistakes you would otherwise review by hand.",
  ruleCounter: "{n} of {max}",
  boundariesTitle: "BOUNDARIES",
  autonomyLabel: "Autonomy",
  autonomySuggest: "Suggest",
  autonomyAsk: "Ask first",
  autonomyAuto: "Act alone",
  autonomyHint:
    "Suggest drafts everything for you. Ask first acts, but pauses on anything below. Act alone only pauses on the limits below.",
  approvalAmount: "Ask before spending more than",
  approvalAmountHint: "Whole numbers only. 0 means ask before any spend.",
  dailyActionLimit: "Actions per day",
  dailyActionLimitHint: "A circuit breaker, not a target. 0 means no limit.",
  approveExternal: "Ask before sending anything outside the workspace",
  approveExternalDesc: "Emails, channel messages and API calls to third parties.",

  skillsTitle: "SKILLS",
  skillsDesc:
    "Capabilities installed on the machine. Each one runs code, so risk is worth a look before attaching.",
  addSkill: "+ Add skill",
  skillCounter: "{n} of {max} attached",
  noSkillsTitle: "No skills attached",
  noSkillsBody:
    "The agent can still read, write and reply. Skills add the things it cannot do on its own — reaching a CRM, driving a browser, running a report.",
  colSkill: "SKILL",
  colVersion: "VERSION",
  colRisk: "RISK",
  colState: "STATE",
  riskLow: "low",
  riskMedium: "medium",
  riskHigh: "high",
  stPending: "queued",
  stInstalling: "installing",
  stInstalled: "installed",
  stFailed: "install failed",
  stRemoving: "removing",
  stRemoved: "removed",
  installErrorLabel: "Install error",
  mockInstall: "Simulated — nothing was installed on a real machine.",
  needsRecheck: "NEEDS RECHECK",
  needsRecheckHint:
    "Checked against {asserted}; this agent now runs {engine}. It stays attached and disabled until you re-check or remove it.",
  compatOk: "compatible",
  compatUnmet: "requirements unmet",
  compatUnknown: "unverified",
  compatOkHint: "The publisher asserts this works on {engine}.",
  compatUnmetHint: "This skill needs something the machine does not have.",
  compatUnknownHint:
    "Nobody has checked this skill against {engine}. It may work; we have not confirmed it.",
  unmetTitle: "Missing",
  blockedBadge: "WITHDRAWN",
  blockedHint:
    "The publisher withdrew this skill after it was attached. It will not install again — remove it.",
  updateAvailable: "{version} available",
  enableSkill: "Enable",
  disableSkill: "Disable",
  detach: "Detach",
  detachTitle: "Detach {name}?",
  detachBody:
    "The skill is uninstalled from the machine on the next sync. Its configuration and your risk acknowledgement are lost, so re-attaching later asks again.",
  riskConfirmTitle: "Attach a high-risk skill?",
  riskConfirmBody:
    "{name} can take actions that are hard to undo. It runs with the agent's credentials and nobody reviews each call. Attach it only if you trust the publisher.",
  riskAckCheckbox: "I understand what this skill can do",
  riskNotAcknowledged: "Not acknowledged",
  acknowledgeRisk: "Acknowledge",
  skillsUnavailable: "The skills API isn't part of this build yet.",

  contextTitle: "CONTEXT",
  contextDesc:
    "Documents the agent can search while it works. Uploaded text is data — the agent reads it, it never runs it.",
  dropHere: "Drop files here",
  browseFiles: "Choose a file",
  addText: "Paste text",
  textNameLabel: "Name",
  textNamePlaceholder: "e.g. Refund policy, June 2026",
  textBodyLabel: "Text",
  textBodyPlaceholder: "Paste the text the agent should be able to look up…",
  addTextAction: "Add",
  kFile: "FILE",
  kText: "TEXT",
  kUrl: "URL",
  cAwaitingUpload: "waiting for a file",
  cPending: "queued",
  cIndexing: "indexing",
  cIndexed: "ready",
  cFailed: "indexing failed",
  cRemoved: "removed",
  chunksLabel: "{n} chunks",
  uploadNow: "Upload",
  uploading: "Uploading…",
  removeItem: "Remove",
  removeItemTitle: "Remove {name}?",
  removeItemBody: "The agent stops being able to look this up. The file itself is deleted.",
  noContextTitle: "No context yet",
  noContextBody:
    "Add the documents you would hand a new hire — a price list, a policy, past answers you were happy with.",
  contextQuota: "{count} of {maxItems} items · {used} of {maxSize}",
  urlIsText: "Shown as text. ArkAgent never opens a link stored in context.",
  retryIndexing: "Index again",
  allowedTypes: "Text, Markdown, CSV, HTML, JSON, PDF, Word or Excel · up to 20 MB each",

  schedulesTitle: "SCHEDULES",
  schedulesDesc: "When the agent starts work on its own, and what it is told to do.",
  addSchedule: "+ Add schedule",
  noSchedulesTitle: "Nothing scheduled",
  noSchedulesBody:
    "This agent only acts when someone talks to it. A schedule lets it start on its own — a morning sweep, an hourly inbox check.",
  schedName: "Name",
  schedKind: "Repeat",
  schedCron: "Cron expression",
  schedInterval: "Every",
  schedRunAt: "Run at",
  schedTimezone: "Timezone",
  schedPrompt: "Instruction",
  schedPromptHint: "Written to the agent as a message from you when the schedule fires.",
  schedDeliver: "Deliver result to",
  schedMaxRuns: "Runs per day, at most",
  schedMaxRunsHint: "A circuit breaker for a mistyped schedule. 1 to 288.",
  kCron: "Cron",
  kInterval: "Interval",
  kOnce: "Once",
  dChat: "Chat",
  dEmail: "Email",
  dChannel: "Channel",
  dNone: "Nowhere",
  nextRun: "Next run",
  nextRunNone: "never — nothing matches this expression",
  nextThree: "Then",
  pauseSchedule: "Pause",
  resumeSchedule: "Resume",
  pauseAll: "Pause all",
  pauseAllTitle: "Pause every schedule?",
  pauseAllBody:
    "All {n} schedules stop firing. Resuming is one at a time — we cannot know which ones were already off.",
  lastRun: "Last run",
  lsStarted: "started",
  lsSucceeded: "succeeded",
  lsFailed: "failed",
  lsSkipped: "skipped",
  neverRun: "never run",
  historyTitle: "Recent runs",
  historyEmpty: "This schedule hasn't fired yet.",
  historyError: "Couldn't load the run history.",
  historyLoading: "Loading…",
  showHistory: "History",
  hideHistory: "Hide history",
  editSchedule: "Edit",
  doneEditing: "Done",
  deleteSchedule: "Delete",
  deleteScheduleTitle: "Delete {name}?",
  deleteScheduleBody: "The schedule and its run history are removed. Pausing keeps both.",
  cronHelp: "Five fields: minute hour day-of-month month day-of-week.",
  intervalSecondsUnit: "seconds",

  errRuleEmpty: "Write the rule, or remove the row.",
  errRuleLong: "Too long by {over} characters — keep a rule under {max}.",
  errRuleCount: "At most {max} rules. Merge or remove some.",
  errApprovalInt: "Whole numbers only, 0 or more.",
  errLimitInt: "Whole numbers only, 0 or more.",
  errScheduleName: "A name is required, up to {max} characters.",
  errSchedulePrompt:
    "Say what the agent should do, up to {max} characters. A schedule with no instruction costs credits and does nothing.",
  errCron: "That isn't a valid five-field cron expression.",
  errCronUnsupported:
    "\"{token}\" isn't supported. Use five fields — minute hour day-of-month month day-of-week — with no shorthand.",
  errTimezone: "\"{tz}\" isn't a timezone this browser knows.",
  errInterval: "At least {min} seconds between runs.",
  errRunAt: "Pick a date and time.",
  errRunAtPast: "That time has passed. Pick a future one.",
  errMaxRuns: "Between {min} and {max} runs per day.",
  errContextTooLarge: "{name} is over {maxMb} MB. Split it or upload the relevant part.",
  errContextType: "{name} is a {mime} file, which the agent cannot read.",
  errContextQuota: "This agent is at its context limit: {maxItems} items or {maxMb} MB.",
  errContextEmpty: "There's nothing in it to add.",
  errContextTextLong: "That's {len} characters. Paste up to {max}, or attach it as a file.",
  errContextUrl: "Use a plain http:// or https:// address, with no username or password in it.",
  errContextName: "Give it a name.",
  errSkillCount: "{count} skills attached; the limit is {max}. Detach one first.",
  errSkillRisk: "{name} is high-risk. Acknowledge it or detach it before saving.",

  actTimeline: "TIMELINE",
  actRuns: "RUNS",
  actHealth: "HEALTH",
  actCost: "COST",
  searchPlaceholder: "Search activity…",
  filterTrigger: "Trigger",
  filterOutcome: "Outcome",
  filterTag: "Tag",
  filterRange: "Range",
  filterAll: "All",
  range1: "Today",
  range7: "Last 7 days",
  range30: "Last 30 days",
  rangeAll: "All time",
  trgChat: "Chat",
  trgSchedule: "Schedule",
  trgChannel: "Channel",
  trgApi: "API",
  trgSelf: "Self",
  trgSystem: "System",
  rsQueued: "queued",
  rsRunning: "running",
  rsSucceeded: "succeeded",
  rsFailed: "failed",
  rsCancelled: "cancelled",
  rsTimeout: "timed out",
  live: "Live",
  liveOn: "Live updates on",
  liveOff: "Live updates off",
  liveUnavailable: "Live updates aren't available for this agent.",
  dayToday: "TODAY",
  dayYesterday: "YESTERDAY",
  daySummary: "{runs} runs · {ok} ok · {failed} failed · {running} in flight",
  stepsCount: "{n} steps",
  loadMore: "Load 50 more",
  loadingMore: "Loading…",
  timelineErrorTitle: "Couldn't load activity.",
  timelineErrorBody:
    "This is a failed request, not an empty history — your agent's work is still there.",
  activityUnavailable: "The activity API isn't part of this build yet.",
  emptyTitle: "Nothing yet",
  emptyBodyNext:
    "{name} is working but hasn't been triggered. Its next scheduled run is {when}.",
  emptyBodyNoSchedule:
    "{name} only acts when someone talks to it or a channel delivers a message. Add a schedule if it should start on its own.",
  emptySimulator:
    "The runtime is in simulator mode, so no real activity is recorded. What you configure here is saved; nothing runs.",
  emptyFiltered: "No activity matches these filters.",
  clearFilters: "Clear filters",
  runNow: "Run it now",
  openChat: "Open chat",
  newSinceAway: "{n} new since you looked away",
  showThem: "Show",

  runIdLabel: "Run",
  copyRunId: "Copy run id",
  copied: "Copied",
  exportJson: "Export JSON",
  rerun: "Re-run",
  rerunUnavailable: "Only scheduled and API runs can be re-run.",
  expandAll: "Expand all",
  collapseAll: "Collapse all",
  phThinking: "thinking",
  phToolCall: "tool call",
  phToolResult: "tool result",
  phMessage: "message",
  phFinalAnswer: "final answer",
  stepsTitle: "STEPS",
  noStepsQueued: "Waiting to start — no steps yet.",
  noSteps: "This run recorded no steps.",
  truncated: "…truncated",
  ribbonLabel: "Step durations",
  durationLabel: "Duration",
  tokensLabel: "Tokens",
  costLabel: "Cost",
  timeoutAgainst: "{elapsed} against a {limit} limit",
  runErrorTitle: "Error",
  runLoadError: "Couldn't load this run.",
  untrustedNote:
    "Step titles and output come from the agent and the tools it drove. Shown as text; nothing here is opened or run.",

  healthTitle: "HEALTH",
  legendRunning: "running",
  legendIdle: "idle",
  legendUnhealthy: "unhealthy",
  legendStopped: "stopped",
  legendNoSample: "no sample",
  metricCpu: "CPU",
  metricMemory: "MEMORY",
  metricDisk: "DISK",
  metricUptime: "UPTIME",
  peakAt: "peak {value} at {time}",
  peakOnly: "peak {value}",
  growthIn: "{delta} in {days}d",
  sinceTime: "since {time}",
  restarts7d: "{n} restarts in 7d",
  livenessTitle: "LIVENESS",
  lastHeartbeat: "Last heartbeat",
  activeRuns: "Active runs",
  lastActivity: "Last activity",
  configInSync: "Config in sync",
  syncInSync: "in sync · rev {rev}",
  syncPending: "pending since {time} · rev {want} → {have}",
  syncNotReported: "not reported",
  hbOk: "healthy",
  hbStale: "late",
  hbVeryStale: "not responding",
  hbUnknown: "never reported",
  noHealthTitle: "No health data",
  noHealthBody:
    "This agent's runtime hasn't reported health samples. The liveness below is derived from heartbeats only.",
  mockSamples: "Simulated samples — not measurements from a real machine.",
  srSparkCaption: "{metric} readings over the selected range",
  noMemLimit: "no limit reported",
  healthErrorTitle: "Couldn't load health data.",

  costGroupBy: "Group by",
  byRun: "by run",
  byTrigger: "by trigger",
  byModel: "by model",
  bySkill: "by skill",
  metricSpend: "SPEND",
  metricRuns: "RUNS",
  metricCostPerRun: "COST / RUN",
  vsPrev: "vs previous {n}d",
  noPrev: "no earlier period to compare",
  dailySpend: "DAILY SPEND",
  breakdownTitle: "BREAKDOWN",
  colRuns: "RUNS",
  colTokens: "TOKENS",
  colCost: "COST",
  colShare: "SHARE",
  mostExpensive: "MOST EXPENSIVE RUNS",
  estimatedFootnote:
    "Some runs have no price for their model, so their cost is unknown and shown as —, not as zero.",
  noCostTitle: "No spend recorded",
  noCostBody:
    "Cost appears once runs are recorded with token counts. Nothing has been billed against this agent yet.",
  costErrorTitle: "Couldn't load cost data.",
  dayCursorHint: "Use the left and right arrow keys to read each day.",
  charCounter: "{n} of {max} characters",
  listSep: ", ",
  unsavedRegion: "Unsaved changes",
  ruleKind: "Rule type",
  ruleTextLabel: "Rule {n}",
  browseSkills: "Attach a skill",
  skillSearchPlaceholder: "Search skills…",
  skillCatalogEmpty: "Nothing matches that.",
  skillCatalogLoading: "Loading skills…",
  skillCatalogError: "Couldn't load the skill catalogue.",
  attachAction: "Attach",
  attachedAlready: "Already attached",
  riskAcknowledged: "acknowledged",
  contextUnavailable: "The context API isn't part of this build yet.",
  addUrl: "Add a link",
  urlLabel: "Address",
  urlPlaceholder: "An address, e.g. https://example.com/policy",
  addUrlAction: "Add",
  uploadDeferred:
    "Uploads aren't wired up in this build, so this is listed as waiting for a file. No bytes were stored.",
  schedulesUnavailable: "The schedules API isn't part of this build yet.",
  newScheduleDefault: "New schedule",
  reasonLabel: "Reason",
};

const zh: ManageDict = {
  configHeading: "配置",
  railLabel: "配置分区",
  secRules: "规则",
  secSkills: "技能",
  secContext: "资料",
  secSchedules: "定时任务",
  statusClean: "无改动",
  statusDirty: "有未保存的改动",
  statusInvalid: "需要修正",
  edited: "已修改",
  configLoading: "正在加载配置…",
  configLoadError: "无法加载该智能体的配置。",
  configUnavailable: "此版本尚未提供配置接口，这里的内容暂时无法编辑。",
  tryAgain: "重试",
  cancel: "取消",
  confirm: "确认",
  close: "关闭",

  unsavedOne: "{sections} 有 1 处改动未保存",
  unsavedMany: "{sections} 共有 {n} 处改动未保存",
  discard: "放弃改动",
  saveAndResync: "保存并同步",
  saving: "正在保存…",
  problemOne: "1 处问题",
  problemMany: "{n} 处问题",
  goToFirstProblem: "跳到第一处问题",
  savedPushed: "已保存并推送到 {name} · {time}",
  savedUnreachable: "已保存。{name} 仍在使用旧配置运行。",
  savedRetryHint: "系统会自动重试。",
  retryNow: "立即重试",
  whatDoesThisMean: "这是什么意思？",
  whatDoesThisMeanBody:
    "改动已经存下来了。推送到正在运行的机器是第二步，这一步失败了。在推送成功之前，智能体会继续按旧设置工作，并不会停下来。",
  savedSimulator: "已保存。运行时处于模拟模式，未推送任何内容。",
  savedUnimplemented: "已保存。当前运行时还不支持接收配置推送，{name} 会在下次重启时读取新配置。",
  saveFailed: "保存失败，没有任何改动生效。",
  conflictTitle: "{name} 已被其他人修改。",
  conflictBody: "在你编辑期间，有人保存过这个智能体。覆盖会用你的改动替换掉对方的。",
  reviewDifferences: "查看差异",
  overwrite: "覆盖",
  leaveTitle: "不保存就离开？",
  leaveBody: "你还有 {n} 处改动未保存，离开后会丢失。",
  keepEditing: "继续编辑",
  discardAndLeave: "放弃并离开",
  revertField: "还原此项",

  rulesTitle: "规则与边界",
  rulesDesc: "每次运行都会告知智能体的硬性限制。句子越短越具体，效果越好。",
  ruleMust: "必须",
  ruleNever: "禁止",
  ruleEscalate: "上报",
  ruleMustHint: "始终这样做。",
  ruleNeverHint: "无论什么理由都不要这样做。",
  ruleEscalateHint: "遇到这种情况先停下来，交给人处理。",
  addRule: "+ 添加规则",
  rulePlaceholder: "例如：报价只能取自当前价目表",
  removeRule: "删除规则",
  moveUp: "上移",
  moveDown: "下移",
  noRulesTitle: "还没有规则",
  noRulesBody:
    "没有规则时，智能体只能依据工作简介行事。加上一两条边界，通常就能避免那些你事后要人工复核的差错。",
  ruleCounter: "{n} / {max}",
  boundariesTitle: "边界",
  autonomyLabel: "自主程度",
  autonomySuggest: "只出方案",
  autonomyAsk: "先问再做",
  autonomyAuto: "自行处理",
  autonomyHint:
    "「只出方案」把一切都写成草稿交给你。「先问再做」会动手，但碰到下面的限制会停下来问。「自行处理」只在触及下面的限制时才停。",
  approvalAmount: "超过这个金额要先问",
  approvalAmountHint: "只能填整数。填 0 表示任何支出都要先问。",
  dailyActionLimit: "每天动作次数上限",
  dailyActionLimitHint: "这是保险丝，不是目标。填 0 表示不限制。",
  approveExternal: "发往工作区之外前先问",
  approveExternalDesc: "包括邮件、渠道消息，以及调用第三方接口。",

  skillsTitle: "技能",
  skillsDesc: "安装在机器上的能力。每个技能都会执行代码，挂载前值得先看一眼风险。",
  addSkill: "+ 添加技能",
  skillCounter: "已挂载 {n} / {max}",
  noSkillsTitle: "尚未挂载技能",
  noSkillsBody:
    "没有技能，智能体照样能读、能写、能回复。技能补的是它自己做不到的事——连上 CRM、操作浏览器、跑一份报表。",
  colSkill: "技能",
  colVersion: "版本",
  colRisk: "风险",
  colState: "状态",
  riskLow: "低",
  riskMedium: "中",
  riskHigh: "高",
  stPending: "排队中",
  stInstalling: "安装中",
  stInstalled: "已安装",
  stFailed: "安装失败",
  stRemoving: "移除中",
  stRemoved: "已移除",
  installErrorLabel: "安装错误",
  mockInstall: "模拟结果——并未在真实机器上安装。",
  needsRecheck: "需重新核对",
  needsRecheckHint:
    "当初是按 {asserted} 核对的，而这个智能体现在跑的是 {engine}。在你重新核对或移除之前，它会保留但保持停用。",
  compatOk: "兼容",
  compatUnmet: "依赖未满足",
  compatUnknown: "未核实",
  compatOkHint: "发布者声明它可在 {engine} 上运行。",
  compatUnmetHint: "这个技能需要机器上没有的东西。",
  compatUnknownHint: "没有人针对 {engine} 核对过这个技能。也许能用，但我们没有确认过。",
  unmetTitle: "缺少",
  blockedBadge: "已下架",
  blockedHint: "挂载之后，发布者下架了这个技能。它不会再次安装成功，请移除。",
  updateAvailable: "有新版本 {version}",
  enableSkill: "启用",
  disableSkill: "停用",
  detach: "卸下",
  detachTitle: "卸下 {name}？",
  detachBody:
    "下次同步时会从机器上卸载。它的配置和你做过的风险确认都会一并丢失，以后重新挂载会再问一次。",
  riskConfirmTitle: "挂载一个高风险技能？",
  riskConfirmBody:
    "{name} 可以做出难以撤销的动作。它使用智能体的凭据运行，没有人会逐次审核。只有在你信任发布者时才挂载它。",
  riskAckCheckbox: "我清楚这个技能能做什么",
  riskNotAcknowledged: "尚未确认",
  acknowledgeRisk: "确认风险",
  skillsUnavailable: "此版本尚未提供技能接口。",

  contextTitle: "资料",
  contextDesc: "智能体工作时可以检索的文档。上传的内容只是数据——它只会阅读，不会执行。",
  dropHere: "把文件拖到这里",
  browseFiles: "选择文件",
  addText: "粘贴文本",
  textNameLabel: "名称",
  textNamePlaceholder: "例如：退款政策（2026 年 6 月）",
  textBodyLabel: "文本",
  textBodyPlaceholder: "把希望智能体日后能查到的内容粘贴到这里…",
  addTextAction: "添加",
  kFile: "文件",
  kText: "文本",
  kUrl: "网址",
  cAwaitingUpload: "等待上传文件",
  cPending: "排队中",
  cIndexing: "索引中",
  cIndexed: "可检索",
  cFailed: "索引失败",
  cRemoved: "已移除",
  chunksLabel: "{n} 个片段",
  uploadNow: "上传",
  uploading: "正在上传…",
  removeItem: "移除",
  removeItemTitle: "移除 {name}？",
  removeItemBody: "智能体将无法再查到这份资料，文件本身也会被删除。",
  noContextTitle: "还没有资料",
  noContextBody: "把你会交给新同事的材料放进来——价目表、政策说明、以前满意的回复。",
  contextQuota: "{count} / {maxItems} 项 · {used} / {maxSize}",
  urlIsText: "只作为文本显示。ArkAgent 不会打开资料里的任何链接。",
  retryIndexing: "重新索引",
  allowedTypes: "文本、Markdown、CSV、HTML、JSON、PDF、Word 或 Excel · 单个不超过 20 MB",

  schedulesTitle: "定时任务",
  schedulesDesc: "智能体何时自己开工，以及开工时要做什么。",
  addSchedule: "+ 添加定时任务",
  noSchedulesTitle: "没有定时任务",
  noSchedulesBody:
    "现在这个智能体只有被人找上门时才会做事。加个定时任务，它就能自己开工——早上巡一遍，或每小时看一次收件箱。",
  schedName: "名称",
  schedKind: "重复方式",
  schedCron: "Cron 表达式",
  schedInterval: "每隔",
  schedRunAt: "执行时间",
  schedTimezone: "时区",
  schedPrompt: "指令",
  schedPromptHint: "触发时，这段文字会以你的口吻作为消息发给智能体。",
  schedDeliver: "结果送到",
  schedMaxRuns: "每天最多运行",
  schedMaxRunsHint: "为写错的表达式准备的保险丝。范围 1 到 288。",
  kCron: "Cron",
  kInterval: "固定间隔",
  kOnce: "仅一次",
  dChat: "对话",
  dEmail: "邮件",
  dChannel: "渠道",
  dNone: "不送",
  nextRun: "下次运行",
  nextRunNone: "永不——没有时间点符合这个表达式",
  nextThree: "再往后",
  pauseSchedule: "暂停",
  resumeSchedule: "恢复",
  pauseAll: "全部暂停",
  pauseAllTitle: "暂停所有定时任务？",
  pauseAllBody: "全部 {n} 个任务都会停止触发。恢复只能逐个来——我们无法知道原本哪些就是关着的。",
  lastRun: "上次运行",
  lsStarted: "已开始",
  lsSucceeded: "成功",
  lsFailed: "失败",
  lsSkipped: "已跳过",
  neverRun: "从未运行",
  historyTitle: "最近运行",
  historyEmpty: "这个定时任务还没有触发过。",
  historyError: "无法加载运行记录。",
  historyLoading: "加载中…",
  showHistory: "运行记录",
  hideHistory: "收起记录",
  editSchedule: "编辑",
  doneEditing: "完成",
  deleteSchedule: "删除",
  deleteScheduleTitle: "删除 {name}？",
  deleteScheduleBody: "定时任务及其运行记录都会被删除。若只是想停一停，用暂停即可。",
  cronHelp: "五个字段：分 时 日 月 周。",
  intervalSecondsUnit: "秒",

  errRuleEmpty: "写清楚这条规则，或者删掉这一行。",
  errRuleLong: "超出 {over} 个字符——一条规则请控制在 {max} 字符以内。",
  errRuleCount: "最多 {max} 条规则，请合并或删掉一些。",
  errApprovalInt: "只能填 0 或更大的整数。",
  errLimitInt: "只能填 0 或更大的整数。",
  errScheduleName: "名称必填，最多 {max} 个字符。",
  errSchedulePrompt: "写清楚要智能体做什么，最多 {max} 个字符。没有指令的任务照样消耗额度却什么都不做。",
  errCron: "这不是合法的五字段 cron 表达式。",
  errCronUnsupported: "不支持「{token}」。请写成五个字段——分 时 日 月 周——不要用简写。",
  errTimezone: "浏览器不认识「{tz}」这个时区。",
  errInterval: "两次运行之间至少间隔 {min} 秒。",
  errRunAt: "请选择日期和时间。",
  errRunAtPast: "这个时间已经过去了，请选一个将来的。",
  errMaxRuns: "每天运行次数应在 {min} 到 {max} 之间。",
  errContextTooLarge: "{name} 超过 {maxMb} MB。请拆分，或只上传需要的部分。",
  errContextType: "{name} 是 {mime} 文件，智能体读不了。",
  errContextQuota: "这个智能体的资料已达上限：{maxItems} 项或 {maxMb} MB。",
  errContextEmpty: "里面没有可以添加的内容。",
  errContextTextLong: "这段文本有 {len} 个字符，最多粘贴 {max} 个；再长就改成上传文件吧。",
  errContextUrl: "请填写普通的 http:// 或 https:// 网址，且不要在里面带用户名和密码。",
  errContextName: "请给它起个名字。",
  errSkillCount: "已挂载 {count} 个技能，上限是 {max}。请先卸下一个。",
  errSkillRisk: "{name} 属于高风险。保存前请确认风险或将其卸下。",

  actTimeline: "时间线",
  actRuns: "运行",
  actHealth: "健康",
  actCost: "费用",
  searchPlaceholder: "搜索活动…",
  filterTrigger: "触发方式",
  filterOutcome: "结果",
  filterTag: "标签",
  filterRange: "时间范围",
  filterAll: "全部",
  range1: "今天",
  range7: "近 7 天",
  range30: "近 30 天",
  rangeAll: "全部时间",
  trgChat: "对话",
  trgSchedule: "定时",
  trgChannel: "渠道",
  trgApi: "接口",
  trgSelf: "自发",
  trgSystem: "系统",
  rsQueued: "排队中",
  rsRunning: "运行中",
  rsSucceeded: "成功",
  rsFailed: "失败",
  rsCancelled: "已取消",
  rsTimeout: "超时",
  live: "实时",
  liveOn: "实时更新已开启",
  liveOff: "实时更新已关闭",
  liveUnavailable: "该智能体暂不支持实时更新。",
  dayToday: "今天",
  dayYesterday: "昨天",
  daySummary: "{runs} 次运行 · {ok} 成功 · {failed} 失败 · {running} 进行中",
  stepsCount: "{n} 步",
  loadMore: "再加载 50 条",
  loadingMore: "加载中…",
  timelineErrorTitle: "无法加载活动记录。",
  timelineErrorBody: "这是请求失败，不是没有记录——智能体做过的事都还在。",
  activityUnavailable: "此版本尚未提供活动接口。",
  emptyTitle: "还没有记录",
  emptyBodyNext: "{name} 在待命，但还没有被触发过。下一次定时运行是 {when}。",
  emptyBodyNoSchedule: "{name} 只有在有人找它、或渠道送来消息时才会行动。想让它自己开工，就加一个定时任务。",
  emptySimulator: "运行时处于模拟模式，不会记录真实活动。这里配置的内容会保存，但不会真的运行。",
  emptyFiltered: "没有符合当前筛选条件的活动。",
  clearFilters: "清除筛选",
  runNow: "立即运行",
  openChat: "打开对话",
  newSinceAway: "你离开期间新增 {n} 条",
  showThem: "查看",

  runIdLabel: "运行",
  copyRunId: "复制运行 ID",
  copied: "已复制",
  exportJson: "导出 JSON",
  rerun: "重新运行",
  rerunUnavailable: "只有定时和接口触发的运行可以重跑。",
  expandAll: "全部展开",
  collapseAll: "全部收起",
  phThinking: "思考",
  phToolCall: "调用工具",
  phToolResult: "工具返回",
  phMessage: "消息",
  phFinalAnswer: "最终答复",
  stepsTitle: "步骤",
  noStepsQueued: "还在排队，尚无步骤。",
  noSteps: "这次运行没有记录任何步骤。",
  truncated: "…已截断",
  ribbonLabel: "各步骤耗时",
  durationLabel: "耗时",
  tokensLabel: "Token",
  costLabel: "费用",
  timeoutAgainst: "已用 {elapsed}，上限 {limit}",
  runErrorTitle: "错误",
  runLoadError: "无法加载这次运行。",
  untrustedNote: "步骤标题与输出来自智能体及它调用的工具，这里只按文本显示，不会打开也不会执行。",

  healthTitle: "健康",
  legendRunning: "运行中",
  legendIdle: "空闲",
  legendUnhealthy: "异常",
  legendStopped: "已停止",
  legendNoSample: "无采样",
  metricCpu: "CPU",
  metricMemory: "内存",
  metricDisk: "磁盘",
  metricUptime: "运行时长",
  peakAt: "峰值 {value}，出现在 {time}",
  peakOnly: "峰值 {value}",
  growthIn: "{days} 天内增加 {delta}",
  sinceTime: "自 {time} 起",
  restarts7d: "7 天内重启 {n} 次",
  livenessTitle: "存活状态",
  lastHeartbeat: "最近心跳",
  activeRuns: "进行中的运行",
  lastActivity: "最近活动",
  configInSync: "配置同步",
  syncInSync: "已同步 · 版本 {rev}",
  syncPending: "自 {time} 起待同步 · 版本 {want} → {have}",
  syncNotReported: "未上报",
  hbOk: "正常",
  hbStale: "偏晚",
  hbVeryStale: "无响应",
  hbUnknown: "从未上报",
  noHealthTitle: "没有健康数据",
  noHealthBody: "该智能体的运行时还没有上报健康采样。下面的存活状态仅由心跳推算。",
  mockSamples: "模拟采样——并非来自真实机器的测量值。",
  srSparkCaption: "所选时间范围内的 {metric} 读数",
  noMemLimit: "未上报上限",
  healthErrorTitle: "无法加载健康数据。",

  costGroupBy: "分组方式",
  byRun: "按运行",
  byTrigger: "按触发方式",
  byModel: "按模型",
  bySkill: "按技能",
  metricSpend: "支出",
  metricRuns: "运行次数",
  metricCostPerRun: "单次费用",
  vsPrev: "对比前 {n} 天",
  noPrev: "没有可比较的前一周期",
  dailySpend: "每日支出",
  breakdownTitle: "构成",
  colRuns: "运行",
  colTokens: "TOKEN",
  colCost: "费用",
  colShare: "占比",
  mostExpensive: "花费最高的运行",
  estimatedFootnote: "有些运行所用模型没有对应价格，费用无法计算，显示为「—」而不是零。",
  noCostTitle: "还没有支出记录",
  noCostBody: "只要开始记录带 token 统计的运行，费用就会出现。目前这个智能体还没有产生任何计费。",
  costErrorTitle: "无法加载费用数据。",
  dayCursorHint: "用左右方向键逐日查看。",
  charCounter: "{n} / {max} 字符",
  listSep: "、",
  unsavedRegion: "未保存的更改",
  ruleKind: "规则类型",
  ruleTextLabel: "第 {n} 条规则",
  browseSkills: "添加技能",
  skillSearchPlaceholder: "搜索技能…",
  skillCatalogEmpty: "没有匹配的技能。",
  skillCatalogLoading: "正在加载技能…",
  skillCatalogError: "技能目录加载失败。",
  attachAction: "添加",
  attachedAlready: "已添加",
  riskAcknowledged: "已确认",
  contextUnavailable: "此版本尚未包含资料接口。",
  addUrl: "添加链接",
  urlLabel: "地址",
  urlPlaceholder: "网址，例如 https://example.com/policy",
  addUrlAction: "添加",
  uploadDeferred: "此版本尚未接通上传，所以这条只是登记为等待文件，没有存入任何内容。",
  schedulesUnavailable: "此版本尚未包含日程接口。",
  newScheduleDefault: "新日程",
  reasonLabel: "原因",
};

const zht: ManageDict = {
  configHeading: "設定",
  railLabel: "設定分區",
  secRules: "規則",
  secSkills: "技能",
  secContext: "資料",
  secSchedules: "排程",
  statusClean: "沒有變更",
  statusDirty: "有尚未儲存的變更",
  statusInvalid: "需要修正",
  edited: "已修改",
  configLoading: "正在載入設定…",
  configLoadError: "無法載入這個智能體的設定。",
  configUnavailable: "這個版本還沒有設定 API，這裡的內容暫時無法編輯。",
  tryAgain: "重試",
  cancel: "取消",
  confirm: "確認",
  close: "關閉",

  unsavedOne: "{sections} 有 1 處變更尚未儲存",
  unsavedMany: "{sections} 共有 {n} 處變更尚未儲存",
  discard: "捨棄變更",
  saveAndResync: "儲存並重新同步",
  saving: "正在儲存…",
  problemOne: "1 個問題",
  problemMany: "{n} 個問題",
  goToFirstProblem: "跳到第一個問題",
  savedPushed: "已儲存並推送到 {name} · {time}",
  savedUnreachable: "已儲存。{name} 仍以舊設定執行中。",
  savedRetryHint: "系統會自動重試。",
  retryNow: "立即重試",
  whatDoesThisMean: "這是什麼意思？",
  whatDoesThisMeanBody:
    "你的變更已經存下來了。推送到執行中的機器是第二個步驟，而這一步失敗了。在推送成功之前，智能體會沿用舊設定繼續工作，並不會停下來。",
  savedSimulator: "已儲存。執行環境處於模擬模式，沒有推送任何內容。",
  savedUnimplemented: "已儲存。目前的執行環境還不接受設定推送，{name} 會在下次重啟時讀取新設定。",
  saveFailed: "儲存失敗，沒有任何變更生效。",
  conflictTitle: "{name} 已被其他人修改。",
  conflictBody: "在你編輯期間，有人儲存過這個智能體。覆寫會用你的變更取代對方的。",
  reviewDifferences: "檢視差異",
  overwrite: "覆寫",
  leaveTitle: "不儲存就離開？",
  leaveBody: "你還有 {n} 處變更尚未儲存，離開後就會遺失。",
  keepEditing: "繼續編輯",
  discardAndLeave: "捨棄並離開",
  revertField: "還原這一項",

  rulesTitle: "規則與界線",
  rulesDesc: "每次執行都會告知智能體的硬性限制。句子越短、越具體越好。",
  ruleMust: "必須",
  ruleNever: "禁止",
  ruleEscalate: "上報",
  ruleMustHint: "一律照做。",
  ruleNeverHint: "不管什麼理由都不要這樣做。",
  ruleEscalateHint: "遇到這種情況先停下來，交給人處理。",
  addRule: "+ 新增規則",
  rulePlaceholder: "例如：報價只能取自現行價目表",
  removeRule: "刪除規則",
  moveUp: "上移",
  moveDown: "下移",
  noRulesTitle: "還沒有規則",
  noRulesBody:
    "沒有規則時，智能體只能依工作簡介行事。加上一兩條界線，通常就能省掉事後人工複核的那些差錯。",
  ruleCounter: "{n} / {max}",
  boundariesTitle: "界線",
  autonomyLabel: "自主程度",
  autonomySuggest: "只出方案",
  autonomyAsk: "先問再做",
  autonomyAuto: "自行處理",
  autonomyHint:
    "「只出方案」把一切寫成草稿交給你。「先問再做」會動手，但碰到下面的限制會停下來問。「自行處理」只在觸及下面的限制時才停。",
  approvalAmount: "超過這個金額要先問",
  approvalAmountHint: "只能填整數。填 0 表示任何支出都要先問。",
  dailyActionLimit: "每天動作次數上限",
  dailyActionLimitHint: "這是保險絲，不是目標。填 0 表示不限制。",
  approveExternal: "送出工作區之外前先問",
  approveExternalDesc: "包含電子郵件、通道訊息，以及呼叫第三方 API。",

  skillsTitle: "技能",
  skillsDesc: "安裝在機器上的能力。每個技能都會執行程式碼，掛上之前值得先看一眼風險。",
  addSkill: "+ 新增技能",
  skillCounter: "已掛載 {n} / {max}",
  noSkillsTitle: "尚未掛載技能",
  noSkillsBody:
    "沒有技能，智能體照樣能讀、能寫、能回覆。技能補的是它自己做不到的事——連上 CRM、操作瀏覽器、跑一份報表。",
  colSkill: "技能",
  colVersion: "版本",
  colRisk: "風險",
  colState: "狀態",
  riskLow: "低",
  riskMedium: "中",
  riskHigh: "高",
  stPending: "排隊中",
  stInstalling: "安裝中",
  stInstalled: "已安裝",
  stFailed: "安裝失敗",
  stRemoving: "移除中",
  stRemoved: "已移除",
  installErrorLabel: "安裝錯誤",
  mockInstall: "模擬結果——並未安裝到真實機器上。",
  needsRecheck: "需重新確認",
  needsRecheckHint:
    "當初是對照 {asserted} 確認的，而這個智能體現在跑的是 {engine}。在你重新確認或移除之前，它會保留但維持停用。",
  compatOk: "相容",
  compatUnmet: "依賴未滿足",
  compatUnknown: "未查證",
  compatOkHint: "發布者聲明它可以在 {engine} 上運作。",
  compatUnmetHint: "這個技能需要機器上沒有的東西。",
  compatUnknownHint: "沒有人針對 {engine} 查證過這個技能。也許能用，但我們沒有確認過。",
  unmetTitle: "缺少",
  blockedBadge: "已下架",
  blockedHint: "掛上之後，發布者把這個技能下架了。它不會再安裝成功，請移除。",
  updateAvailable: "有新版本 {version}",
  enableSkill: "啟用",
  disableSkill: "停用",
  detach: "卸下",
  detachTitle: "卸下 {name}？",
  detachBody:
    "下次同步時會從機器上解除安裝。它的設定和你做過的風險確認都會一併遺失，日後重新掛上會再問一次。",
  riskConfirmTitle: "掛上一個高風險技能？",
  riskConfirmBody:
    "{name} 可以做出難以復原的動作。它以智能體的憑證執行，沒有人會逐次審核。只有在你信任發布者時才掛上它。",
  riskAckCheckbox: "我清楚這個技能能做什麼",
  riskNotAcknowledged: "尚未確認",
  acknowledgeRisk: "確認風險",
  skillsUnavailable: "這個版本還沒有技能 API。",

  contextTitle: "資料",
  contextDesc: "智能體工作時可以查詢的文件。上傳的內容只是資料——它只會閱讀，不會執行。",
  dropHere: "把檔案拖到這裡",
  browseFiles: "選擇檔案",
  addText: "貼上文字",
  textNameLabel: "名稱",
  textNamePlaceholder: "例如：退款政策（2026 年 6 月）",
  textBodyLabel: "文字",
  textBodyPlaceholder: "把希望智能體日後查得到的內容貼在這裡…",
  addTextAction: "新增",
  kFile: "檔案",
  kText: "文字",
  kUrl: "網址",
  cAwaitingUpload: "等待上傳檔案",
  cPending: "排隊中",
  cIndexing: "建立索引中",
  cIndexed: "可查詢",
  cFailed: "索引失敗",
  cRemoved: "已移除",
  chunksLabel: "{n} 個片段",
  uploadNow: "上傳",
  uploading: "正在上傳…",
  removeItem: "移除",
  removeItemTitle: "移除 {name}？",
  removeItemBody: "智能體將無法再查到這份資料，檔案本身也會刪除。",
  noContextTitle: "還沒有資料",
  noContextBody: "把你會交給新同事的材料放進來——價目表、政策說明、以前滿意的回覆。",
  contextQuota: "{count} / {maxItems} 項 · {used} / {maxSize}",
  urlIsText: "只以文字顯示。ArkAgent 不會開啟資料裡的任何連結。",
  retryIndexing: "重新建立索引",
  allowedTypes: "文字、Markdown、CSV、HTML、JSON、PDF、Word 或 Excel · 每個上限 20 MB",

  schedulesTitle: "排程",
  schedulesDesc: "智能體什麼時候自己開工，以及開工時要做什麼。",
  addSchedule: "+ 新增排程",
  noSchedulesTitle: "沒有排程",
  noSchedulesBody:
    "現在這個智能體只有被人找上門時才會做事。加一個排程，它就能自己開工——早上巡一遍，或每小時看一次收件匣。",
  schedName: "名稱",
  schedKind: "重複方式",
  schedCron: "Cron 運算式",
  schedInterval: "每隔",
  schedRunAt: "執行時間",
  schedTimezone: "時區",
  schedPrompt: "指令",
  schedPromptHint: "觸發時，這段文字會以你的名義當成訊息送給智能體。",
  schedDeliver: "結果送到",
  schedMaxRuns: "每天最多執行",
  schedMaxRunsHint: "為寫錯的運算式準備的保險絲。範圍 1 到 288。",
  kCron: "Cron",
  kInterval: "固定間隔",
  kOnce: "只執行一次",
  dChat: "對話",
  dEmail: "電子郵件",
  dChannel: "通道",
  dNone: "不送",
  nextRun: "下次執行",
  nextRunNone: "永不——沒有時間點符合這個運算式",
  nextThree: "再往後",
  pauseSchedule: "暫停",
  resumeSchedule: "恢復",
  pauseAll: "全部暫停",
  pauseAllTitle: "暫停所有排程？",
  pauseAllBody: "全部 {n} 個排程都會停止觸發。恢復只能一個一個來——我們無從得知原本哪些就是關著的。",
  lastRun: "上次執行",
  lsStarted: "已開始",
  lsSucceeded: "成功",
  lsFailed: "失敗",
  lsSkipped: "已略過",
  neverRun: "從未執行",
  historyTitle: "最近執行",
  historyEmpty: "這個排程還沒有觸發過。",
  historyError: "無法載入執行紀錄。",
  historyLoading: "載入中…",
  showHistory: "執行紀錄",
  hideHistory: "收起紀錄",
  editSchedule: "編輯",
  doneEditing: "完成",
  deleteSchedule: "刪除",
  deleteScheduleTitle: "刪除 {name}？",
  deleteScheduleBody: "排程和它的執行紀錄都會刪除。只是想停一停的話，用暫停就好。",
  cronHelp: "五個欄位：分 時 日 月 週。",
  intervalSecondsUnit: "秒",

  errRuleEmpty: "把規則寫清楚，或是刪掉這一列。",
  errRuleLong: "超出 {over} 個字元——一條規則請控制在 {max} 字元以內。",
  errRuleCount: "最多 {max} 條規則，請合併或刪掉一些。",
  errApprovalInt: "只能填 0 或更大的整數。",
  errLimitInt: "只能填 0 或更大的整數。",
  errScheduleName: "名稱必填，最多 {max} 個字元。",
  errSchedulePrompt: "寫清楚要智能體做什麼，最多 {max} 個字元。沒有指令的排程照樣耗用額度卻什麼也不做。",
  errCron: "這不是合法的五欄位 cron 運算式。",
  errCronUnsupported: "不支援「{token}」。請寫成五個欄位——分 時 日 月 週——不要用簡寫。",
  errTimezone: "瀏覽器不認得「{tz}」這個時區。",
  errInterval: "兩次執行之間至少要間隔 {min} 秒。",
  errRunAt: "請選擇日期與時間。",
  errRunAtPast: "這個時間已經過去了，請選一個未來的。",
  errMaxRuns: "每天執行次數要在 {min} 到 {max} 之間。",
  errContextTooLarge: "{name} 超過 {maxMb} MB。請拆開，或只上傳需要的部分。",
  errContextType: "{name} 是 {mime} 檔案，智能體讀不了。",
  errContextQuota: "這個智能體的資料已達上限：{maxItems} 項或 {maxMb} MB。",
  errContextEmpty: "裡面沒有可以加入的內容。",
  errContextTextLong: "這段文字有 {len} 個字元，最多貼上 {max} 個；再長就改成上傳檔案吧。",
  errContextUrl: "請填寫一般的 http:// 或 https:// 網址，而且不要在裡面帶帳號密碼。",
  errContextName: "請給它一個名稱。",
  errSkillCount: "已掛載 {count} 個技能，上限是 {max}。請先卸下一個。",
  errSkillRisk: "{name} 屬於高風險。儲存前請確認風險或把它卸下。",

  actTimeline: "時間軸",
  actRuns: "執行",
  actHealth: "健康",
  actCost: "費用",
  searchPlaceholder: "搜尋活動…",
  filterTrigger: "觸發方式",
  filterOutcome: "結果",
  filterTag: "標籤",
  filterRange: "時間範圍",
  filterAll: "全部",
  range1: "今天",
  range7: "近 7 天",
  range30: "近 30 天",
  rangeAll: "全部時間",
  trgChat: "對話",
  trgSchedule: "排程",
  trgChannel: "通道",
  trgApi: "API",
  trgSelf: "自發",
  trgSystem: "系統",
  rsQueued: "排隊中",
  rsRunning: "執行中",
  rsSucceeded: "成功",
  rsFailed: "失敗",
  rsCancelled: "已取消",
  rsTimeout: "逾時",
  live: "即時",
  liveOn: "即時更新已開啟",
  liveOff: "即時更新已關閉",
  liveUnavailable: "這個智能體暫不支援即時更新。",
  dayToday: "今天",
  dayYesterday: "昨天",
  daySummary: "{runs} 次執行 · {ok} 成功 · {failed} 失敗 · {running} 進行中",
  stepsCount: "{n} 個步驟",
  loadMore: "再載入 50 筆",
  loadingMore: "載入中…",
  timelineErrorTitle: "無法載入活動紀錄。",
  timelineErrorBody: "這是請求失敗，不是沒有紀錄——智能體做過的事都還在。",
  activityUnavailable: "這個版本還沒有活動 API。",
  emptyTitle: "還沒有紀錄",
  emptyBodyNext: "{name} 在待命，但還沒有被觸發過。下一次排程執行是 {when}。",
  emptyBodyNoSchedule: "{name} 只有在有人找它、或通道送來訊息時才會行動。想讓它自己開工，就加一個排程。",
  emptySimulator: "執行環境處於模擬模式，不會記錄真實活動。這裡設定的內容會儲存，但不會真的執行。",
  emptyFiltered: "沒有符合目前篩選條件的活動。",
  clearFilters: "清除篩選",
  runNow: "立即執行",
  openChat: "開啟對話",
  newSinceAway: "你離開期間新增 {n} 筆",
  showThem: "查看",

  runIdLabel: "執行",
  copyRunId: "複製執行 ID",
  copied: "已複製",
  exportJson: "匯出 JSON",
  rerun: "重新執行",
  rerunUnavailable: "只有排程和 API 觸發的執行可以重跑。",
  expandAll: "全部展開",
  collapseAll: "全部收合",
  phThinking: "思考",
  phToolCall: "呼叫工具",
  phToolResult: "工具回應",
  phMessage: "訊息",
  phFinalAnswer: "最終答覆",
  stepsTitle: "步驟",
  noStepsQueued: "還在排隊，尚無步驟。",
  noSteps: "這次執行沒有記錄任何步驟。",
  truncated: "…已截斷",
  ribbonLabel: "各步驟耗時",
  durationLabel: "耗時",
  tokensLabel: "Token",
  costLabel: "費用",
  timeoutAgainst: "已用 {elapsed}，上限 {limit}",
  runErrorTitle: "錯誤",
  runLoadError: "無法載入這次執行。",
  untrustedNote: "步驟標題與輸出來自智能體及它操作的工具，這裡只以文字顯示，不會開啟也不會執行。",

  healthTitle: "健康",
  legendRunning: "執行中",
  legendIdle: "閒置",
  legendUnhealthy: "異常",
  legendStopped: "已停止",
  legendNoSample: "無取樣",
  metricCpu: "CPU",
  metricMemory: "記憶體",
  metricDisk: "磁碟",
  metricUptime: "運行時間",
  peakAt: "尖峰 {value}，出現在 {time}",
  peakOnly: "尖峰 {value}",
  growthIn: "{days} 天內增加 {delta}",
  sinceTime: "自 {time} 起",
  restarts7d: "7 天內重啟 {n} 次",
  livenessTitle: "存活狀態",
  lastHeartbeat: "最近心跳",
  activeRuns: "進行中的執行",
  lastActivity: "最近活動",
  configInSync: "設定同步",
  syncInSync: "已同步 · 版本 {rev}",
  syncPending: "自 {time} 起待同步 · 版本 {want} → {have}",
  syncNotReported: "未回報",
  hbOk: "正常",
  hbStale: "偏晚",
  hbVeryStale: "沒有回應",
  hbUnknown: "從未回報",
  noHealthTitle: "沒有健康資料",
  noHealthBody: "這個智能體的執行環境還沒有回報健康取樣。下面的存活狀態只由心跳推算。",
  mockSamples: "模擬取樣——不是來自真實機器的量測值。",
  srSparkCaption: "所選時間範圍內的 {metric} 讀數",
  noMemLimit: "未回報上限",
  healthErrorTitle: "無法載入健康資料。",

  costGroupBy: "分組方式",
  byRun: "依執行",
  byTrigger: "依觸發方式",
  byModel: "依模型",
  bySkill: "依技能",
  metricSpend: "支出",
  metricRuns: "執行次數",
  metricCostPerRun: "每次費用",
  vsPrev: "對比前 {n} 天",
  noPrev: "沒有可比較的前一期",
  dailySpend: "每日支出",
  breakdownTitle: "組成",
  colRuns: "執行",
  colTokens: "TOKEN",
  colCost: "費用",
  colShare: "占比",
  mostExpensive: "花費最高的執行",
  estimatedFootnote: "有些執行所用的模型沒有對應價格，費用無從計算，顯示為「—」而不是零。",
  noCostTitle: "還沒有支出紀錄",
  noCostBody: "只要開始記錄帶 token 統計的執行，費用就會出現。目前這個智能體還沒有產生任何計費。",
  costErrorTitle: "無法載入費用資料。",
  dayCursorHint: "用左右方向鍵逐日查看。",
  charCounter: "{n} / {max} 字元",
  listSep: "、",
  unsavedRegion: "未儲存的變更",
  ruleKind: "規則類型",
  ruleTextLabel: "第 {n} 條規則",
  browseSkills: "新增技能",
  skillSearchPlaceholder: "搜尋技能…",
  skillCatalogEmpty: "沒有符合的技能。",
  skillCatalogLoading: "正在載入技能…",
  skillCatalogError: "技能目錄載入失敗。",
  attachAction: "新增",
  attachedAlready: "已新增",
  riskAcknowledged: "已確認",
  contextUnavailable: "此版本尚未包含資料介面。",
  addUrl: "新增連結",
  urlLabel: "網址",
  urlPlaceholder: "網址，例如 https://example.com/policy",
  addUrlAction: "新增",
  uploadDeferred: "此版本尚未接通上傳，所以這筆只是登記為等待檔案，沒有存入任何內容。",
  schedulesUnavailable: "此版本尚未包含排程介面。",
  newScheduleDefault: "新排程",
  reasonLabel: "原因",
};

const ja: ManageDict = {
  configHeading: "設定",
  railLabel: "設定セクション",
  secRules: "ルール",
  secSkills: "スキル",
  secContext: "資料",
  secSchedules: "スケジュール",
  statusClean: "変更なし",
  statusDirty: "未保存の変更あり",
  statusInvalid: "要修正",
  edited: "変更あり",
  configLoading: "設定を読み込み中…",
  configLoadError: "このエージェントの設定を読み込めませんでした。",
  configUnavailable: "このビルドには設定 API がまだ含まれていないため、ここは編集できません。",
  tryAgain: "再試行",
  cancel: "キャンセル",
  confirm: "確定",
  close: "閉じる",

  unsavedOne: "{sections} に未保存の変更が 1 件あります",
  unsavedMany: "{sections} に未保存の変更が {n} 件あります",
  discard: "変更を破棄",
  saveAndResync: "保存して再同期",
  saving: "保存中…",
  problemOne: "問題 1 件",
  problemMany: "問題 {n} 件",
  goToFirstProblem: "最初の問題へ移動",
  savedPushed: "保存し、{name} に反映しました · {time}",
  savedUnreachable: "保存しました。{name} は以前の設定のまま動いています。",
  savedRetryHint: "自動で再試行します。",
  retryNow: "今すぐ再試行",
  whatDoesThisMean: "どういう意味？",
  whatDoesThisMeanBody:
    "変更は保存済みです。稼働中のマシンへ反映するのは次の手順で、そこが失敗しました。反映が成功するまで、エージェントは以前の設定のまま働き続けます。停止はしません。",
  savedSimulator: "保存しました。ランタイムはシミュレーターモードのため、何も送信していません。",
  savedUnimplemented:
    "保存しました。このランタイムはまだ設定の受け取りに対応していないため、{name} は次回の再起動時に読み込みます。",
  saveFailed: "保存できませんでした。変更は何も反映されていません。",
  conflictTitle: "{name} は別の場所で変更されました。",
  conflictBody: "あなたの編集中に、他の誰かがこのエージェントを保存しました。上書きすると相手の変更は失われます。",
  reviewDifferences: "差分を確認",
  overwrite: "上書き",
  leaveTitle: "保存せずに移動しますか？",
  leaveBody: "未保存の変更が {n} 件あります。移動すると失われます。",
  keepEditing: "編集を続ける",
  discardAndLeave: "破棄して移動",
  revertField: "この項目を元に戻す",

  rulesTitle: "ルールと境界",
  rulesDesc: "実行のたびにエージェントへ伝える絶対の制約です。短く具体的な一文ほどよく効きます。",
  ruleMust: "必ず",
  ruleNever: "禁止",
  ruleEscalate: "エスカレーション",
  ruleMustHint: "常にこうする。",
  ruleNeverHint: "どんな理由があってもしない。",
  ruleEscalateHint: "この状況では手を止めて人に回す。",
  addRule: "+ ルールを追加",
  rulePlaceholder: "例：見積もりは現行の価格表からのみ提示する",
  removeRule: "ルールを削除",
  moveUp: "上へ",
  moveDown: "下へ",
  noRulesTitle: "ルールはまだありません",
  noRulesBody:
    "ルールがないと、エージェントは業務ブリーフだけを頼りに動きます。境界を 1〜2 本引いておくと、あとで人が確認していた種類のミスはたいてい防げます。",
  ruleCounter: "{n} / {max}",
  boundariesTitle: "境界",
  autonomyLabel: "自律度",
  autonomySuggest: "提案のみ",
  autonomyAsk: "確認してから",
  autonomyAuto: "自分で進める",
  autonomyHint:
    "「提案のみ」はすべて下書きにして渡します。「確認してから」は動きますが、下の制限に触れると止まって尋ねます。「自分で進める」は下の制限に触れたときだけ止まります。",
  approvalAmount: "この金額を超えるときは確認する",
  approvalAmountHint: "整数のみ。0 なら支出のたびに確認します。",
  dailyActionLimit: "1 日あたりの操作回数の上限",
  dailyActionLimitHint: "目標ではなくブレーカーです。0 で無制限。",
  approveExternal: "ワークスペースの外へ出す前に確認する",
  approveExternalDesc: "メール、チャネルへの投稿、外部 API の呼び出しが対象です。",

  skillsTitle: "スキル",
  skillsDesc: "マシンに入れる能力です。どれもコードを実行するので、追加する前にリスクを見ておく価値があります。",
  addSkill: "+ スキルを追加",
  skillCounter: "{n} / {max} 件",
  noSkillsTitle: "スキルは未追加です",
  noSkillsBody:
    "スキルがなくても、読む・書く・返すはできます。スキルが補うのは自力では届かない部分です。CRM につなぐ、ブラウザを操作する、レポートを回す、といったことです。",
  colSkill: "スキル",
  colVersion: "バージョン",
  colRisk: "リスク",
  colState: "状態",
  riskLow: "低",
  riskMedium: "中",
  riskHigh: "高",
  stPending: "待機中",
  stInstalling: "インストール中",
  stInstalled: "インストール済み",
  stFailed: "インストール失敗",
  stRemoving: "削除中",
  stRemoved: "削除済み",
  installErrorLabel: "インストールエラー",
  mockInstall: "シミュレーションです。実機には何も入っていません。",
  needsRecheck: "要再確認",
  needsRecheckHint:
    "{asserted} を前提に確認したスキルですが、このエージェントは現在 {engine} で動いています。再確認するか外すまで、付いたまま無効の状態で残ります。",
  compatOk: "対応",
  compatUnmet: "要件を満たしていません",
  compatUnknown: "未確認",
  compatOkHint: "配布元は {engine} での動作を明示しています。",
  compatUnmetHint: "このスキルはマシンに無いものを必要としています。",
  compatUnknownHint: "{engine} での確認は誰も行っていません。動くかもしれませんが、裏は取れていません。",
  unmetTitle: "不足",
  blockedBadge: "取り下げ済み",
  blockedHint: "追加後に配布元がこのスキルを取り下げました。もうインストールできないため、外してください。",
  updateAvailable: "{version} が利用可能",
  enableSkill: "有効化",
  disableSkill: "無効化",
  detach: "取り外す",
  detachTitle: "{name} を取り外しますか？",
  detachBody:
    "次回の同期でマシンからアンインストールされます。設定とリスク確認の記録も消えるため、後で付け直すと再び確認を求められます。",
  riskConfirmTitle: "高リスクのスキルを追加しますか？",
  riskConfirmBody:
    "{name} は取り消しにくい操作を実行できます。エージェントの資格情報で動き、一件ごとの承認もありません。配布元を信頼できる場合にだけ追加してください。",
  riskAckCheckbox: "このスキルにできることを理解しました",
  riskNotAcknowledged: "未確認",
  acknowledgeRisk: "リスクを確認",
  skillsUnavailable: "このビルドにはスキル API がまだ含まれていません。",

  contextTitle: "資料",
  contextDesc: "作業中にエージェントが参照できる文書です。アップロードした内容はデータで、読むだけで実行はされません。",
  dropHere: "ここにファイルをドロップ",
  browseFiles: "ファイルを選ぶ",
  addText: "テキストを貼り付け",
  textNameLabel: "名前",
  textNamePlaceholder: "例：返金ポリシー（2026 年 6 月）",
  textBodyLabel: "テキスト",
  textBodyPlaceholder: "後で参照できるようにしたい内容を貼り付けてください…",
  addTextAction: "追加",
  kFile: "ファイル",
  kText: "テキスト",
  kUrl: "URL",
  cAwaitingUpload: "ファイル待ち",
  cPending: "待機中",
  cIndexing: "索引作成中",
  cIndexed: "参照可能",
  cFailed: "索引作成に失敗",
  cRemoved: "削除済み",
  chunksLabel: "{n} チャンク",
  uploadNow: "アップロード",
  uploading: "アップロード中…",
  removeItem: "削除",
  removeItemTitle: "{name} を削除しますか？",
  removeItemBody: "エージェントはこれを参照できなくなります。ファイル自体も削除されます。",
  noContextTitle: "資料はまだありません",
  noContextBody: "新しく入った人に渡すものを入れてください。価格表、方針、これまでの納得のいく回答などです。",
  contextQuota: "{count} / {maxItems} 件 · {used} / {maxSize}",
  urlIsText: "テキストとして表示します。ArkAgent が資料内のリンクを開くことはありません。",
  retryIndexing: "索引を作り直す",
  allowedTypes: "テキスト、Markdown、CSV、HTML、JSON、PDF、Word、Excel · 1 件 20 MB まで",

  schedulesTitle: "スケジュール",
  schedulesDesc: "エージェントが自分から動き出すタイミングと、そのとき何をするかです。",
  addSchedule: "+ スケジュールを追加",
  noSchedulesTitle: "スケジュールはありません",
  noSchedulesBody:
    "今このエージェントは、話しかけられたときにしか動きません。スケジュールを入れると自分から動き出します。朝の巡回、1 時間ごとの受信箱チェックなどです。",
  schedName: "名前",
  schedKind: "繰り返し",
  schedCron: "cron 式",
  schedInterval: "間隔",
  schedRunAt: "実行日時",
  schedTimezone: "タイムゾーン",
  schedPrompt: "指示",
  schedPromptHint: "起動時に、あなたからのメッセージとしてエージェントに渡されます。",
  schedDeliver: "結果の届け先",
  schedMaxRuns: "1 日の実行回数の上限",
  schedMaxRunsHint: "書き間違えた式に備えるブレーカーです。1〜288。",
  kCron: "cron",
  kInterval: "一定間隔",
  kOnce: "1 回だけ",
  dChat: "チャット",
  dEmail: "メール",
  dChannel: "チャネル",
  dNone: "届けない",
  nextRun: "次回",
  nextRunNone: "実行されません — この式に一致する時刻がありません",
  nextThree: "その後",
  pauseSchedule: "一時停止",
  resumeSchedule: "再開",
  pauseAll: "すべて一時停止",
  pauseAllTitle: "すべてのスケジュールを止めますか？",
  pauseAllBody:
    "{n} 件すべてが起動しなくなります。再開は 1 件ずつです。どれが元から止まっていたかは判断できません。",
  lastRun: "前回",
  lsStarted: "開始",
  lsSucceeded: "成功",
  lsFailed: "失敗",
  lsSkipped: "スキップ",
  neverRun: "実行履歴なし",
  historyTitle: "最近の実行",
  historyEmpty: "このスケジュールはまだ起動していません。",
  historyError: "実行履歴を読み込めませんでした。",
  historyLoading: "読み込み中…",
  showHistory: "実行履歴",
  hideHistory: "履歴を閉じる",
  editSchedule: "編集",
  doneEditing: "完了",
  deleteSchedule: "削除",
  deleteScheduleTitle: "{name} を削除しますか？",
  deleteScheduleBody: "スケジュールと実行履歴が消えます。止めるだけなら一時停止で足ります。",
  cronHelp: "5 つのフィールド：分 時 日 月 曜日。",
  intervalSecondsUnit: "秒",

  errRuleEmpty: "ルールの内容を書くか、この行を削除してください。",
  errRuleLong: "{over} 文字超過です。1 件は {max} 文字までにしてください。",
  errRuleCount: "ルールは最大 {max} 件です。まとめるか減らしてください。",
  errApprovalInt: "0 以上の整数のみです。",
  errLimitInt: "0 以上の整数のみです。",
  errScheduleName: "名前は必須です。{max} 文字まで。",
  errSchedulePrompt:
    "何をさせたいかを書いてください（{max} 文字まで）。指示のないスケジュールはクレジットだけ消費して何もしません。",
  errCron: "5 フィールドの cron 式として正しくありません。",
  errCronUnsupported: "「{token}」には対応していません。分 時 日 月 曜日 の 5 フィールドで、省略記法を使わずに書いてください。",
  errTimezone: "「{tz}」はこのブラウザーが知らないタイムゾーンです。",
  errInterval: "実行間隔は {min} 秒以上にしてください。",
  errRunAt: "日付と時刻を選んでください。",
  errRunAtPast: "その時刻は過ぎています。未来の時刻を選んでください。",
  errMaxRuns: "1 日の実行回数は {min}〜{max} の範囲です。",
  errContextTooLarge: "{name} は {maxMb} MB を超えています。分割するか、必要な部分だけを上げてください。",
  errContextType: "{name} は {mime} 形式で、エージェントには読めません。",
  errContextQuota: "このエージェントの資料は上限に達しています（{maxItems} 件または {maxMb} MB）。",
  errContextEmpty: "追加できる中身がありません。",
  errContextTextLong: "{len} 文字あります。貼り付けは {max} 文字までで、それ以上はファイルとして添付してください。",
  errContextUrl: "http:// または https:// で始まる通常のアドレスを、ユーザー名とパスワードを含めずに入力してください。",
  errContextName: "名前を付けてください。",
  errSkillCount: "{count} 件追加されています。上限は {max} 件です。まず 1 件外してください。",
  errSkillRisk: "{name} は高リスクです。保存する前にリスクを確認するか、外してください。",

  actTimeline: "タイムライン",
  actRuns: "実行",
  actHealth: "ヘルス",
  actCost: "コスト",
  searchPlaceholder: "活動を検索…",
  filterTrigger: "きっかけ",
  filterOutcome: "結果",
  filterTag: "タグ",
  filterRange: "期間",
  filterAll: "すべて",
  range1: "今日",
  range7: "直近 7 日",
  range30: "直近 30 日",
  rangeAll: "全期間",
  trgChat: "チャット",
  trgSchedule: "スケジュール",
  trgChannel: "チャネル",
  trgApi: "API",
  trgSelf: "自発",
  trgSystem: "システム",
  rsQueued: "待機中",
  rsRunning: "実行中",
  rsSucceeded: "成功",
  rsFailed: "失敗",
  rsCancelled: "中止",
  rsTimeout: "時間切れ",
  live: "ライブ",
  liveOn: "ライブ更新オン",
  liveOff: "ライブ更新オフ",
  liveUnavailable: "このエージェントではライブ更新を利用できません。",
  dayToday: "今日",
  dayYesterday: "昨日",
  daySummary: "{runs} 回 · 成功 {ok} · 失敗 {failed} · 進行中 {running}",
  stepsCount: "{n} ステップ",
  loadMore: "さらに 50 件",
  loadingMore: "読み込み中…",
  timelineErrorTitle: "活動を読み込めませんでした。",
  timelineErrorBody: "履歴が空なのではなく、リクエストが失敗しました。作業の記録は残っています。",
  activityUnavailable: "このビルドには活動 API がまだ含まれていません。",
  emptyTitle: "まだ記録はありません",
  emptyBodyNext: "{name} は待機中で、まだ一度も起動されていません。次回のスケジュール実行は {when} です。",
  emptyBodyNoSchedule:
    "{name} は話しかけられたときか、チャネルにメッセージが届いたときだけ動きます。自分から動かすならスケジュールを追加してください。",
  emptySimulator:
    "ランタイムはシミュレーターモードのため、実際の活動は記録されません。ここでの設定は保存されますが、実行はされません。",
  emptyFiltered: "この条件に一致する活動はありません。",
  clearFilters: "条件をクリア",
  runNow: "今すぐ実行",
  openChat: "チャットを開く",
  newSinceAway: "離席中に {n} 件増えました",
  showThem: "表示",

  runIdLabel: "実行",
  copyRunId: "実行 ID をコピー",
  copied: "コピーしました",
  exportJson: "JSON で書き出す",
  rerun: "再実行",
  rerunUnavailable: "再実行できるのはスケジュールと API による実行だけです。",
  expandAll: "すべて展開",
  collapseAll: "すべて折りたたむ",
  phThinking: "思考",
  phToolCall: "ツール呼び出し",
  phToolResult: "ツールの応答",
  phMessage: "メッセージ",
  phFinalAnswer: "最終回答",
  stepsTitle: "ステップ",
  noStepsQueued: "開始待ちのため、ステップはまだありません。",
  noSteps: "この実行にステップの記録はありません。",
  truncated: "…以下省略",
  ribbonLabel: "各ステップの所要時間",
  durationLabel: "所要時間",
  tokensLabel: "トークン",
  costLabel: "コスト",
  timeoutAgainst: "上限 {limit} に対して {elapsed}",
  runErrorTitle: "エラー",
  runLoadError: "この実行を読み込めませんでした。",
  untrustedNote:
    "ステップの見出しと出力は、エージェントとそれが操作したツールが生成したものです。テキストとして表示するだけで、開いたり実行したりはしません。",

  healthTitle: "ヘルス",
  legendRunning: "稼働",
  legendIdle: "待機",
  legendUnhealthy: "不調",
  legendStopped: "停止",
  legendNoSample: "サンプルなし",
  metricCpu: "CPU",
  metricMemory: "メモリ",
  metricDisk: "ディスク",
  metricUptime: "稼働時間",
  peakAt: "ピーク {value}（{time}）",
  peakOnly: "ピーク {value}",
  growthIn: "{days} 日で {delta} 増加",
  sinceTime: "{time} から",
  restarts7d: "7 日間で {n} 回の再起動",
  livenessTitle: "生存確認",
  lastHeartbeat: "最終ハートビート",
  activeRuns: "実行中",
  lastActivity: "最終活動",
  configInSync: "設定の同期",
  syncInSync: "同期済み · rev {rev}",
  syncPending: "{time} から未反映 · rev {want} → {have}",
  syncNotReported: "未報告",
  hbOk: "正常",
  hbStale: "遅延",
  hbVeryStale: "応答なし",
  hbUnknown: "報告なし",
  noHealthTitle: "ヘルスデータがありません",
  noHealthBody:
    "このエージェントのランタイムはヘルスサンプルを報告していません。下の生存確認はハートビートだけから導いたものです。",
  mockSamples: "シミュレーションのサンプルで、実機の測定値ではありません。",
  srSparkCaption: "選択期間の {metric} の推移",
  noMemLimit: "上限の報告なし",
  healthErrorTitle: "ヘルスデータを読み込めませんでした。",

  costGroupBy: "集計単位",
  byRun: "実行ごと",
  byTrigger: "きっかけごと",
  byModel: "モデルごと",
  bySkill: "スキルごと",
  metricSpend: "支出",
  metricRuns: "実行回数",
  metricCostPerRun: "1 回あたり",
  vsPrev: "前の {n} 日と比較",
  noPrev: "比較できる前期間がありません",
  dailySpend: "日次支出",
  breakdownTitle: "内訳",
  colRuns: "実行",
  colTokens: "トークン",
  colCost: "コスト",
  colShare: "構成比",
  mostExpensive: "コストの高い実行",
  estimatedFootnote:
    "一部の実行はモデルの価格が未登録のため、コストを算出できません。0 ではなく「—」と表示しています。",
  noCostTitle: "支出の記録はありません",
  noCostBody:
    "トークン数つきの実行が記録され始めると、ここにコストが表示されます。このエージェントにはまだ課金がありません。",
  costErrorTitle: "コストデータを読み込めませんでした。",
  dayCursorHint: "左右の矢印キーで日ごとに読み上げられます。",
  charCounter: "{n} / {max} 文字",
  listSep: "、",
  unsavedRegion: "未保存の変更",
  ruleKind: "ルールの種類",
  ruleTextLabel: "ルール {n}",
  browseSkills: "スキルを追加",
  skillSearchPlaceholder: "スキルを検索…",
  skillCatalogEmpty: "該当するスキルはありません。",
  skillCatalogLoading: "スキルを読み込んでいます…",
  skillCatalogError: "スキルカタログを読み込めませんでした。",
  attachAction: "追加",
  attachedAlready: "追加済み",
  riskAcknowledged: "確認済み",
  contextUnavailable: "このビルドには資料APIがまだ含まれていません。",
  addUrl: "リンクを追加",
  urlLabel: "アドレス",
  urlPlaceholder: "アドレス。例: https://example.com/policy",
  addUrlAction: "追加",
  uploadDeferred: "このビルドではアップロードが未接続のため、ファイル待ちとして記録しただけです。中身は保存されていません。",
  schedulesUnavailable: "このビルドにはスケジュールAPIがまだ含まれていません。",
  newScheduleDefault: "新しいスケジュール",
  reasonLabel: "理由",
};

export const manage: Record<Lang, ManageDict> = { en, zh, zht, ja };

/**
 * Interpolate `{token}` placeholders. Missing values render as the empty string
 * rather than as a literal `{name}` — a half-substituted sentence in a save bar is
 * worse than a slightly clipped one, and the tests catch a missing param.
 */
export function mt(
  template: string,
  params?: Record<string, string | number | null | undefined>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = params[key];
    return v === null || v === undefined ? "" : String(v);
  });
}
