/**
 * The activity event taxonomy, as a CLOSED vocabulary, plus every DTO the
 * Activity page reads.
 *
 * Two vocabularies exist and conflating them is the usual mistake
 * (`docs/HARNESSES_AND_ACTIVITY.md` §5.1): the 16 **wire events** the runtime
 * POSTs are the backend contract's, and are not reopened here; the **activity
 * codes** below are what one row of the feed *is*, so it can be rendered in
 * four languages. The relationship is many-to-one in both directions, so a code
 * is never named after an event type.
 *
 * SEVERITY IS DERIVED FROM THE CODE, NEVER STORED. An untrusted runtime must
 * not grade its own noise: it asserts a *code*, and ArkAgent decides what that
 * code means to an operator. A `severity` field on the wire is a field a
 * misbehaving harness sets to `error` on every line, and a `severity` column is
 * one a legacy row cannot fill. Both the row renderer and the server-side
 * filter predicate call the same function here, so there is one answer.
 *
 * CLIENT-SAFE, deliberately: no `server-only`, no `@/lib/db` import, no
 * `process.env`. The timeline row picks its border colour from `severityOf()`
 * and a second copy of that table would be a second answer.
 */
import type { ActivityParams } from "@/lib/runtime/types";
import type { Harness } from "@/lib/harness";
import type { HarnessCapability } from "@/lib/harness/profiles";

// ---------------------------------------------------------------------------
// Enum mirrors
//
// These tuples restate five `pgEnum`s from lib/db/schema.ts. They are NOT a
// second source of truth: `tests/activity-taxonomy.test.ts` asserts each one is
// deep-equal to `<enum>.enumValues`, so a value added in the migration and not
// here is a failing test rather than a runtime `22P02 invalid input value`.
// The mirror exists because schema.ts pulls Drizzle in, and this module is
// imported by client components.
// ---------------------------------------------------------------------------

/** `run_trigger`. What caused a unit of work to start. */
export const RUN_TRIGGERS = ["chat", "schedule", "channel", "api", "self", "system"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

/** `run_status`. */
export const RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timeout",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** `run_step_phase`. */
export const STEP_PHASES = [
  "thinking",
  "tool_call",
  "tool_result",
  "message",
  "final_answer",
] as const;
export type StepPhase = (typeof STEP_PHASES)[number];

/** `activity_tag` — the pre-existing 14-value vocabulary, unchanged by v2. */
export const ACTIVITY_TAGS = [
  "meeting",
  "draft",
  "research",
  "review",
  "outreach",
  "learning",
  "resolved",
  "escalated",
  "summary",
  "published",
  "brief",
  "calendar",
  "docs",
  "system",
] as const;
export type ActivityTag = (typeof ACTIVITY_TAGS)[number];

/** `agent_status`, needed by the §8.1 empty-state resolution order. */
export const AGENT_STATUSES = [
  "draft",
  "provisioning",
  "deploying",
  "working",
  "scheduled",
  "needs_review",
  "paused",
  "error",
  "terminated",
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

// ---------------------------------------------------------------------------
// The code registry
// ---------------------------------------------------------------------------

/**
 * The 24 activity codes of §5.3, in registry order. `custom` is the escape
 * hatch and the ONLY code that renders `agent_activities.text`; an unknown code
 * is coerced to it at ingest, which is what keeps an extension point closed.
 *
 * Adding a code here is a compile error in four languages at once, because
 * `ActivityDict.code` is a total `Record<ActivityCode, string>`.
 */
export const ACTIVITY_CODES = [
  // lifecycle
  "status.changed",
  "config.applied",
  "runtime.unreachable",
  // run
  "run.started",
  "run.finished",
  // tool call
  "tool.denied",
  // message
  "message.sent",
  "message.received",
  // decision & escalation
  "task.status",
  "escalation.raised",
  "draft.created",
  "research.completed",
  // learning
  "skill.installed",
  "skill.removed",
  "skill.failed",
  "context.indexed",
  "context.failed",
  "improvement.proposed",
  // error
  "error.raised",
  // schedule
  "schedule.fired",
  "schedule.skipped",
  "schedule.failed",
  // cost
  "usage.recorded",
  // escape hatch
  "custom",
] as const;
export type ActivityCode = (typeof ACTIVITY_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(ACTIVITY_CODES);

/** Narrow a runtime-supplied string to the closed set. Never throws. */
export function isActivityCode(x: string | null | undefined): x is ActivityCode {
  return typeof x === "string" && CODE_SET.has(x);
}

/**
 * Coerce whatever the row carries to a code we can render. An unrecognised code
 * becomes `custom`, which renders the row's `text` verbatim and badged as
 * agent-authored — the ingest handler's rule, applied again on read because a
 * row written before that rule existed is still in the table.
 *
 * `null` stays `null`: a legacy row has no code at all, and pretending it is
 * `custom` would claim the runtime authored ArkAgent's own bookkeeping lines.
 */
export function normalizeCode(x: string | null | undefined): ActivityCode | null {
  if (x === null || x === undefined || x === "") return null;
  return isActivityCode(x) ? x : "custom";
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

/**
 * Four levels. There is no `debug`: that granularity is `agent_run_steps`,
 * which has its own view.
 *
 *  info    it happened, it worked
 *  notice  it happened and it was NOT what you asked for — a skip, a proposal,
 *          a denial. A denial is the policy working, not a fault.
 *  warning degraded, retryable, or unverifiable
 *  error   a unit of work failed, or the agent stopped taking work
 */
export const SEVERITIES = ["info", "notice", "warning", "error"] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * The three codes whose severity depends on `params`. Everything else is
 * constant, and a flat `Record<ActivityCode, Severity>` cannot express any of
 * these three — which is why `severityOf` is a function.
 */
export const VARIABLE_CODES = ["run.finished", "status.changed", "error.raised"] as const;
export type VariableCode = (typeof VARIABLE_CODES)[number];

/** The 21 codes whose severity is a constant. */
const CONSTANT_SEVERITY: Readonly<Record<Exclude<ActivityCode, VariableCode>, Severity>> = {
  "config.applied": "info",
  // Derived by ArkAgent from missed heartbeats, not reported by anyone. It is a
  // warning and not an error because the agent may be fine and the network not.
  "runtime.unreachable": "warning",
  "run.started": "info",
  "tool.denied": "notice",
  "message.sent": "info",
  "message.received": "info",
  "task.status": "info",
  "escalation.raised": "warning",
  "draft.created": "info",
  "research.completed": "info",
  "skill.installed": "info",
  "skill.removed": "info",
  "skill.failed": "warning",
  "context.indexed": "info",
  "context.failed": "warning",
  "improvement.proposed": "notice",
  "schedule.fired": "info",
  "schedule.skipped": "notice",
  "schedule.failed": "error",
  "usage.recorded": "info",
  "custom": "info",
};

/** Run statuses that make a `run.finished` row an `error`. */
const FINISHED_ERROR = ["failed", "timeout"] as const;
/** …a `notice`. Everything else, including a missing status, is `info`. */
const FINISHED_NOTICE = ["cancelled"] as const;
/** `agent.error.severity`. `fatal` maps to `error`; an absent value defaults to `error`. */
const RAISED_WARNING = ["warning"] as const;
/** The one `agents.status` transition that is an incident. */
const STATUS_ERROR = ["error"] as const;

/**
 * Severity as a pure function of `(code, params)`.
 *
 * A `null` code is a pre-v2 or legacy ArkAgent bookkeeping row: `info`, always.
 * We cannot know better, and guessing from `tag = 'escalated'` would put
 * unaudited legacy text into an incident view.
 */
export function severityOf(code: string | null | undefined, params: ActivityParams = {}): Severity {
  const c = normalizeCode(code);
  if (c === null) return "info";
  switch (c) {
    case "run.finished": {
      const s = str(params.status);
      if ((FINISHED_ERROR as readonly string[]).includes(s)) return "error";
      if ((FINISHED_NOTICE as readonly string[]).includes(s)) return "notice";
      return "info";
    }
    case "status.changed":
      return (STATUS_ERROR as readonly string[]).includes(str(params.to)) ? "error" : "info";
    case "error.raised":
      // The one code carrying the runtime's own severity, and the exception that
      // proves the rule: the runtime is grading its OWN FAILURE, not its own
      // importance. An absent value means the event was a failure, so it
      // defaults to `error` — defaulting it to `warning` would hide unlabelled
      // failures from the incident view.
      return (RAISED_WARNING as readonly string[]).includes(str(params.severity, "error"))
        ? "warning"
        : "error";
    default:
      return CONSTANT_SEVERITY[c];
  }
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" || typeof v === "number" ? String(v) : fallback;
}

/**
 * Codes that are ALWAYS this severity → a plain `IN` list, served by the
 * `(agent_id, code, occurred_at)` index.
 */
export function constantCodes(sev: Severity): ActivityCode[] {
  return (Object.keys(CONSTANT_SEVERITY) as Exclude<ActivityCode, VariableCode>[]).filter(
    (c) => CONSTANT_SEVERITY[c] === sev,
  );
}

/**
 * One `params` test, pushed into SQL as
 * `code = $code AND coalesce(params->>$jsonPath, $fallback) <op> ANY($values)`
 * where `<op>` is `=` normally and `<>` when `negate` is set.
 *
 * `negate` is not a convenience. The `info` arm of `status.changed` is "any
 * destination status except `error`", and the destination is `agents.status` —
 * a nine-value enum this client-safe module would otherwise have to mirror a
 * second time, and would then have to keep mirroring. Negation states the rule
 * that is actually being applied, and it is what makes the four bands
 * exhaustive: every `(code, params)` pair falls in exactly one band, including
 * pairs whose param value nobody has defined yet.
 */
export interface CodeParamPredicate {
  code: VariableCode;
  /** The JSONB key, e.g. `status`. */
  jsonPath: string;
  /** `coalesce(params->>key, fallback)` — the value an absent key stands for. */
  fallback: string;
  values: string[];
  negate: boolean;
}

/** Codes that MAY be this severity, each with the `params` test that decides it. */
export function variableCodePredicates(sev: Severity): CodeParamPredicate[] {
  const out: CodeParamPredicate[] = [];
  if (sev === "error") {
    out.push({ code: "run.finished", jsonPath: "status", fallback: "", values: [...FINISHED_ERROR], negate: false });
    out.push({ code: "status.changed", jsonPath: "to", fallback: "", values: [...STATUS_ERROR], negate: false });
    out.push({ code: "error.raised", jsonPath: "severity", fallback: "error", values: [...RAISED_WARNING], negate: true });
  } else if (sev === "notice") {
    out.push({ code: "run.finished", jsonPath: "status", fallback: "", values: [...FINISHED_NOTICE], negate: false });
  } else if (sev === "warning") {
    out.push({ code: "error.raised", jsonPath: "severity", fallback: "error", values: [...RAISED_WARNING], negate: false });
  } else {
    // info is the complement on both of its variable codes.
    out.push({
      code: "run.finished",
      jsonPath: "status",
      fallback: "",
      values: [...FINISHED_ERROR, ...FINISHED_NOTICE],
      negate: true,
    });
    out.push({ code: "status.changed", jsonPath: "to", fallback: "", values: [...STATUS_ERROR], negate: true });
  }
  return out;
}

/** Evaluate a predicate in TypeScript. The SQL form must agree with this exactly. */
export function predicateMatches(p: CodeParamPredicate, params: ActivityParams): boolean {
  const v = str(params[p.jsonPath], p.fallback);
  const hit = p.values.includes(v);
  return p.negate ? !hit : hit;
}

/**
 * The multi-severity form, for the incident view's `warning | error` band.
 *
 * There is deliberately no variadic `severityCodes(...sevs)`: the union of two
 * bands' CODE lists is not the union of the two bands. A `run.finished` row is
 * in exactly one band, decided by `params`, and flattening to codes would drag
 * every succeeded run into an incident view.
 */
export function severityBand(sevs: readonly Severity[]): {
  codes: ActivityCode[];
  predicates: CodeParamPredicate[];
} {
  const codes = new Set<ActivityCode>();
  const predicates: CodeParamPredicate[] = [];
  for (const s of sevs) {
    for (const c of constantCodes(s)) codes.add(c);
    predicates.push(...variableCodePredicates(s));
  }
  return { codes: [...codes], predicates };
}

/**
 * The OTHER half of the severity mapping: for a run, severity is its status.
 *
 * No run status maps to `warning`, so `severity=warning` must return ZERO runs
 * — the timeline suppresses the run branch entirely in that case rather than
 * leaving it unfiltered, which is what an empty array here signals.
 */
export function runStatusesFor(sev: Severity): RunStatus[] {
  switch (sev) {
    case "info":
      return ["succeeded", "queued", "running"];
    case "notice":
      return ["cancelled"];
    case "error":
      return ["failed", "timeout"];
    case "warning":
      return [];
  }
}

/** A run's severity, for the timeline row's glyph. Mirror of `runStatusesFor`. */
export function severityOfRunStatus(status: RunStatus): Severity {
  if (status === "failed" || status === "timeout") return "error";
  if (status === "cancelled") return "notice";
  return "info";
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

/**
 * Why a view came back thin. Computed SERVER-SIDE, because a client cannot tell
 * "nothing happened" from "your filters excluded everything" from "the runtime
 * is a simulator" — all three are `items.length === 0`, and a view that renders
 * a generic "no data" has thrown the distinction away.
 *
 * Nothing writes the runtime tables yet, so at launch this field is the Activity
 * page for most agents.
 */
export type EmptyReason =
  | "no_data_yet"
  | "never_provisioned"
  | "runtime_mock"
  | "runtime_unconfigured"
  | "telemetry_unsupported"
  | "filtered_out";

export const EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data_yet",
  "never_provisioned",
  "runtime_mock",
  "runtime_unconfigured",
  "telemetry_unsupported",
  "filtered_out",
] as const;

/** One key space per view in `ActivityDict.empty`. */
export type ViewKey = "timeline" | "runs" | "toolCalls" | "health" | "cost" | "errors";
export const VIEW_KEYS: readonly ViewKey[] = [
  "timeline",
  "runs",
  "toolCalls",
  "health",
  "cost",
  "errors",
] as const;

/** The capability each view's `telemetry_unsupported` test asks about (§8.1 step 4). */
export const VIEW_CAPABILITY: Readonly<Record<ViewKey, HarnessCapability>> = {
  timeline: "runs",
  runs: "runs",
  toolCalls: "steps",
  health: "health",
  cost: "runs",
  errors: "runs",
};

/** Runtime mode, mirrored from lib/agent-manager so a client component can read it. */
export type ManagerMode = "live" | "mock" | "unconfigured";

/**
 * The agent facts every view needs and no view should re-query. Passed in from
 * the route, which has already resolved the row through
 * `getAgentRow(id, workspace.id)` — so possession of one of these is proof the
 * workspace check happened.
 */
export interface AgentFacts {
  id: string;
  name: string;
  status: AgentStatus;
  engine: Harness;
  lastHeartbeatAt: Date | null;
  uptimeStartedAt: Date | null;
  configRevision: number;
  appliedConfigRevision: number;
  heartbeatMinutes: number;
}

// ---------------------------------------------------------------------------
// DTOs
//
// Every one is plain JSON: ISO strings for instants, camelCase, no presentation
// colour, no secret. Money is ALWAYS micro-USD (1e-6) and is summed in
// micro-USD, converted once at render — summing per-run values already rounded
// to cents makes a 412-run month wrong by more than the total.
// ---------------------------------------------------------------------------

/**
 * One activity row.
 *
 * `params` is UNTRUSTED third-party text interpolated into a localised
 * sentence. The renderer emits text nodes only: no `dangerouslySetInnerHTML`,
 * and no URL inside it becomes an `href`.
 */
export interface ActivityDTO {
  kind: "activity";
  id: string;
  occurredAt: string;
  /**
   * `null` for a pre-v2 or legacy ArkAgent row, which has no code at all and
   * renders `text`. Not `"custom"` — that would claim the agent authored it.
   */
  code: ActivityCode | null;
  params: ActivityParams;
  /** Derived here, never read from a column. */
  severity: Severity;
  tag: ActivityTag;
  runId: string | null;
  /**
   * Agent-authored, untrusted, never localised. Non-empty only for legacy rows
   * and `code = "custom"`; a v2 row stores `''` and renders from the dictionary,
   * so any renderer that draws `text` without first checking `code` will draw
   * blank rows for every v2 event.
   */
  text: string;
}

/** One run, as it appears in the timeline and the run list. */
export interface RunDTO {
  kind: "run";
  id: string;
  /** The runtime's own run id (`agent_runs.external_run_id`). */
  runId: string;
  trigger: RunTrigger;
  triggerRef: string | null;
  sessionKey: string | null;
  status: RunStatus;
  severity: Severity;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  stepCount: number;
  usage: RunUsageDTO;
  /** Agent-authored, untrusted. Rendered escaped and attributed to the agent. */
  summary: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface RunUsageDTO {
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
  costMicroUsd: number;
  model: string | null;
  /**
   * TRUE when the run reported tokens but ArkAgent has no price for its model.
   *
   * `cost_micro_usd` defaults to 0 and an unpriced run also lands at 0, so zero
   * and unpriced are the same number and different facts. The view renders `—`
   * with a footnote for this case and never `$0.00`, which would tell the
   * customer their agent is free.
   */
  unpriced: boolean;
}

/** One step in a run's trace. Rendered in `idx` order, never arrival order. */
export interface RunStepDTO {
  id: string;
  /** The step's OWN clock, not the run's. Ordering by it re-introduces C13. */
  occurredAt: string;
  idx: number;
  phase: StepPhase;
  /** shell|browser|file|http|skill|message|model|mcp — the runtime extends it freely. */
  kind: string | null;
  /** Untrusted. For a tool call this is the tool name. */
  title: string;
  /** Truncated server-side; text nodes inside a <pre>, never markup, never a link. */
  detail: string | null;
  detailTruncated: boolean;
  status: "ok" | "error";
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
}

/** One run plus its trace. */
export interface RunDetailDTO extends RunDTO {
  /** True when the trace was cut at the cap; the UI offers an export instead. */
  stepsTruncated: boolean;
  /**
   * Set when the nightly prune deleted this run's steps. Lets the drawer say
   * "step trace pruned" instead of drawing an empty trace that looks like a bug.
   */
  stepsPrunedAt: string | null;
  steps: RunStepDTO[];
}

export type TimelineItemDTO = ActivityDTO | RunDTO;

export interface TimelineResponseDTO {
  items: TimelineItemDTO[];
  /** `null` ⇒ no more rows in this range. Opaque; pass back as `?cursor=`. */
  nextCursor: string | null;
  /** Per-day counts for the sticky day headers, over the RETURNED window only. */
  days: { date: string; runs: number; ok: number; failed: number; running: number }[];
  managerMode: ManagerMode;
  /** Populated only when `items` is empty. The most important field here. */
  emptyReason: EmptyReason | null;
  /**
   * Filter values the server did not recognise and therefore did not apply, as
   * `"severity=purple"`. An unknown value is dropped rather than 500ing, and
   * dropping it silently is how a chip that does nothing survives — so the page
   * says which ones it ignored.
   */
  ignoredFilters: string[];
}

export interface RunListResponseDTO {
  items: RunDTO[];
  nextCursor: string | null;
  managerMode: ManagerMode;
  emptyReason: EmptyReason | null;
  ignoredFilters: string[];
}

export type HeartbeatState = "ok" | "stale" | "dead" | "expected_silence";

/**
 * Liveness is derived from `agents`, never from a health sample, so this block
 * renders even when the samples table is empty — which is its launch state.
 */
export interface LivenessDTO {
  lastHeartbeatAt: string | null;
  heartbeatMinutes: number;
  /**
   * `expected_silence` exists because a paused agent must not be marked
   * unreachable. Without the fourth state every paused agent shows a red dot
   * and operators learn to ignore the red dot.
   */
  heartbeatState: HeartbeatState;
  activeRuns: number;
  lastActivityAt: string | null;
  configRevision: number;
  appliedConfigRevision: number;
  /** True while the runtime has not yet applied the current manifest. */
  configPending: boolean;
  uptimeStartedAt: string | null;
  /**
   * Observed restarts, and the label must say "observed": there is no
   * `uptime_started_at` on a sample, so a restart is visible only as a DECREASE
   * in `uptime_seconds` between consecutive samples. One inside a 60-second gap
   * that returns higher is invisible, and past the 14-day rollup the resolution
   * is hourly.
   */
  restarts7dObserved: number;
}

export interface HealthBucketDTO {
  ts: string;
  /** `null` ⇒ no sample in this bucket: a GAP, not `idle`. */
  state: "idle" | "running" | "stopped" | "unhealthy" | null;
  cpuPercent: number | null;
  cpuPeak: number | null;
  memoryBytes: number | null;
  memoryLimitBytes: number | null;
  /** `max`, never `avg`: there is no disk limit column, and averaging a
   *  monotonically-growing series hides the thing the card is for. */
  diskUsedBytes: number | null;
  activeRuns: number;
  /** Counts ROWS, which past 14 days are hourly rollups, not minutes. */
  samples: number;
  /** > 0 ⇒ hatched and labelled simulated. Never averaged in silently. */
  mockSamples: number;
  rollupSamples: number;
}

export interface HealthDTO {
  bucketSeconds: number;
  buckets: HealthBucketDTO[];
  liveness: LivenessDTO;
  /** Drives the banner and the empty state. */
  sampleSource: "runtime" | "mock" | "none";
  managerMode: ManagerMode;
  emptyReason: EmptyReason | null;
}

/**
 * The cost view aggregates TWO ledgers and never converts between them.
 *
 *  - `daily` / `byTrigger` / `byModel` / `topRuns` / `totals` come from
 *    `agent_runs`, whose token counts and micro-USD the runtime reports.
 *  - `llm` comes from `llm_usage`, ArkAgent's OWN record of the model calls it
 *    made on the agent's behalf (chat, brief, self-review, template
 *    generation). It is what makes this view non-empty before the runtime
 *    reports anything, and its `estimated` count is what proves a `$0` is a
 *    missing price rather than a free run.
 *  - `credits` comes from `usage_records`, the billing ledger. Credits are not
 *    convertible to dollars here: ArkAgent owns pricing, and a made-up exchange
 *    rate in a cost view is a fabricated number.
 */
export interface CostDTO {
  from: string;
  to: string;
  /** The zone `daily` was bucketed in. */
  timezone: string;
  /** True when `workspaces.timezone` was unusable and UTC was substituted. */
  timezoneInvalid: boolean;
  totals: {
    costMicroUsd: number;
    runs: number;
    costPerRunMicroUsd: number;
    totalTokens: number;
    /** Runs that reported tokens and priced at zero. Rendered `—`, never `$0.00`. */
    unpricedRuns: number;
  };
  /** The window immediately before this one, for the trend. `null` ⇒ none. */
  previous: { costMicroUsd: number; runs: number } | null;
  daily: { day: string; costMicroUsd: number; runs: number; totalTokens: number; unpriced: number }[];
  byTrigger: { trigger: RunTrigger; runs: number; totalTokens: number; costMicroUsd: number }[];
  byModel: { model: string | null; runs: number; totalTokens: number; costMicroUsd: number }[];
  topRuns: {
    id: string;
    runId: string;
    startedAt: string;
    summary: string | null;
    durationMs: number | null;
    totalTokens: number;
    costMicroUsd: number;
    unpriced: boolean;
    status: RunStatus;
  }[];
  /** ArkAgent's own model spend for this agent. A DIFFERENT ledger from `totals`. */
  llm: {
    calls: number;
    totalTokens: number;
    costMicroUsd: number;
    /** Calls whose token counts were inferred because the provider sent none. */
    estimatedCalls: number;
    byKind: { kind: string; calls: number; totalTokens: number; costMicroUsd: number }[];
  };
  /** Credits, from `usage_records`. Its own row, never folded into a dollar total. */
  credits: { used: number; byKind: { kind: string; credits: number }[] };
  managerMode: ManagerMode;
  emptyReason: EmptyReason | null;
}
