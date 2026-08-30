/**
 * Mirrors of the §F.5 activity DTOs. Declared locally for the same reason as
 * `components/manage/types.ts`: the activity/runs/health APIs are being written in
 * parallel, and this vertical has to compile and be reviewable before they land.
 *
 * Every enum below carries EVERY member of its pgEnum. An earlier draft of §F
 * dropped `run_trigger.system`, `run_status.queued`, `run_status.timeout`,
 * `run_step_phase.message` and the `mcp` kind — a row carrying any of those then
 * fell through every branch and rendered as a blank line, which reads as "the agent
 * did something we will not tell you about".
 */

export type RunTrigger = "chat" | "schedule" | "channel" | "api" | "self" | "system";

export const RUN_TRIGGERS: RunTrigger[] = [
  "chat",
  "schedule",
  "channel",
  "api",
  "self",
  "system",
];

export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timeout";

export const RUN_STATUSES: RunStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timeout",
];

export type StepPhase = "thinking" | "tool_call" | "tool_result" | "message" | "final_answer";

/** `agent_run_steps.kind` is a NULLABLE varchar(32), not an enum. Unknown values
 *  are data to print, not a parse failure. */
export type StepKind =
  | "shell"
  | "browser"
  | "file"
  | "http"
  | "skill"
  | "message"
  | "model"
  | "mcp";

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
  /** MICRO-USD (1e-6). Cents cannot express the $0.0117 this page renders. */
  costMicroUsd: number;
  /** True when no price table covers `model` — renders "—", never "$0.00". */
  estimated: boolean;
  model: string | null;
}

export type TimelineItemDTO =
  | {
      type: "run";
      id: string;
      runId: string;
      trigger: RunTrigger;
      triggerRef: string | null;
      triggerLabel: string | null;
      status: RunStatus;
      summary: string | null;
      errorCode: string | null;
      errorMessage: string | null;
      startedAt: string;
      finishedAt: string | null;
      durationMs: number | null;
      stepCount: number;
      usage: RunUsage | null;
    }
  | {
      type: "activity";
      id: string;
      /** v2 structured vocabulary. Non-null ⇒ render from code + params. */
      code: string | null;
      /** Untrusted runtime data. Text nodes only. */
      params: Record<string, string | number>;
      /** Rendered ONLY when `code` is null (pre-v2 rows and code='custom'). */
      text: string;
      tag: string;
      runId: string | null;
      occurredAt: string;
    };

export interface RunStepDTO {
  id: string;
  /** agent_run_steps.idx. */
  index: number;
  phase: StepPhase;
  kind: StepKind | string | null;
  title: string;
  detail: string | null;
  detailTruncated: boolean;
  status: "ok" | "error";
  /** agent_run_steps.occurred_at. A step has no started_at; only the run does. */
  occurredAt: string;
  durationMs: number | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  skillRef: { slug: string; ownerHandle: string; version: string } | null;
}

export interface RunDetailDTO {
  id: string;
  runId: string;
  trigger: RunTrigger;
  triggerRef: string | null;
  triggerLabel: string | null;
  sessionKey: string | null;
  status: RunStatus;
  summary: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  /** From the schedule, so a `timeout` is legible without opening the schedule. */
  maxRuntimeSeconds: number | null;
  usage: RunUsage | null;
  steps: RunStepDTO[];
}

export interface HealthSampleDTO {
  ts: string;
  /** varchar(16), NOT agents.status — that one has nine values and no "running". */
  state: "running" | "idle" | "stopped" | "unhealthy";
  cpuPercent: number | null;
  memoryBytes: number | null;
  memoryLimitBytes: number | null;
  /** There is no disk_limit_bytes column, so DISK is absolute, never a percentage. */
  diskUsedBytes: number | null;
  uptimeSeconds: number | null;
  activeRuns: number;
  /** A mock sample must never be charted as a real one. */
  source: "runtime" | "mock";
}

export interface LivenessDTO {
  lastHeartbeatAt: string | null;
  heartbeatMinutes: number;
  activeRuns: number;
  lastActivityAt: string | null;
  uptimeStartedAt: string | null;
  restarts7d: number | null;
  configRevision: number;
  configAppliedRevision: number | null;
  configAppliedAt: string | null;
  managerMode: "live" | "mock" | "unconfigured";
}

export interface CostBucketDTO {
  /** Trigger id, model name, skill slug or run id — whatever the grouping is. */
  key: string;
  label: string;
  runs: number;
  totalTokens: number;
  costMicroUsd: number;
  /** True when ANY row in the bucket had no price coverage. */
  estimated: boolean;
}

export interface CostDayDTO {
  /** YYYY-MM-DD in the workspace timezone, computed server-side. */
  day: string;
  costMicroUsd: number;
  runs: number;
  estimated: boolean;
}

export interface CostSummaryDTO {
  rangeDays: number;
  costMicroUsd: number;
  previousCostMicroUsd: number | null;
  runs: number;
  previousRuns: number | null;
  totalTokens: number;
  /** True when any run in the range lacked price coverage. */
  estimated: boolean;
  days: CostDayDTO[];
  buckets: CostBucketDTO[];
  topRuns: {
    runId: string;
    label: string;
    startedAt: string;
    durationMs: number | null;
    totalTokens: number;
    costMicroUsd: number;
    status: RunStatus;
    estimated: boolean;
  }[];
}

export type TimelineGrouping = "run" | "trigger" | "model" | "skill";

export interface TimelineFilters {
  q: string;
  trigger: RunTrigger | "all";
  outcome: RunStatus | "all";
  tag: string | "all";
  rangeDays: 1 | 7 | 30 | 0;
}

export const DEFAULT_FILTERS: TimelineFilters = {
  q: "",
  trigger: "all",
  outcome: "all",
  tag: "all",
  rangeDays: 7,
};

export interface TimelinePage {
  items: TimelineItemDTO[];
  /** Keyset cursor, not an offset. Null ⇒ no more rows. */
  nextCursor: string | null;
  managerMode: "live" | "mock" | "unconfigured";
  /** Next scheduled fire, for the empty state's "why is this empty" sentence. */
  nextRunAt: string | null;
}
