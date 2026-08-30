/**
 * Row -> DTO mappers for the Activity read layer.
 *
 * Pure and dependency-free on purpose: no Drizzle, no `db`, no `server-only`.
 * Every function takes a structural row and returns plain JSON, so the whole
 * layer is testable without a database and the DTO shapes stay legible to the
 * page that will be built against them.
 *
 * Two invariants run through the file:
 *
 *  1. **Severity is computed, never copied.** `severityOf()` is the single
 *     definition; a serializer that read a `severity` field would let an
 *     untrusted runtime grade its own noise.
 *  2. **Everything the runtime, a skill or a model authored is DATA.**
 *     `summary`, `text`, `title`, `detail` and every `params` value are
 *     rendered as text nodes, escaped, and attributed. Nothing here builds
 *     markup, resolves a URL, or feeds a string back into a prompt.
 */
import type { ActivityParams } from "@/lib/runtime/types";
import {
  normalizeCode,
  severityOf,
  severityOfRunStatus,
  type ActivityDTO,
  type ActivityTag,
  type HealthBucketDTO,
  type RunDTO,
  type RunDetailDTO,
  type RunStatus,
  type RunStepDTO,
  type RunTrigger,
  type StepPhase,
} from "./types";

/**
 * `agent_run_steps.detail` is capped at 8 KB on the way out.
 *
 * A trace of 200 steps whose details are megabytes is a response no browser
 * renders and no operator reads. The cap is on BYTES, not characters, because
 * the failure it prevents is a payload size and a CJK detail is three bytes a
 * character.
 */
export const DETAIL_MAX_BYTES = 8 * 1024;

/** UTF-8 safe truncation. Returns the original string when it already fits. */
export function truncateDetail(detail: string | null): { detail: string | null; truncated: boolean } {
  if (detail === null) return { detail: null, truncated: false };
  const bytes = Buffer.byteLength(detail, "utf8");
  if (bytes <= DETAIL_MAX_BYTES) return { detail, truncated: false };
  // Slice on the byte buffer, then decode with the replacement-character
  // behaviour of TextDecoder so a cut multi-byte sequence cannot produce a
  // lone surrogate in the JSON.
  const cut = Buffer.from(detail, "utf8").subarray(0, DETAIL_MAX_BYTES);
  return { detail: new TextDecoder("utf-8").decode(cut).replace(/�+$/, ""), truncated: true };
}

/**
 * Coerce a JSONB blob to `ActivityParams`.
 *
 * The column is `unknown` at the type level and third-party at the trust level.
 * Objects, arrays and booleans are DROPPED rather than stringified: `true` has
 * no localisation, so a boolean param renders as the English word "true" in the
 * 日本語 feed, and an object renders as `[object Object]`. A flag belongs in the
 * code — two codes, two sentences — not in `params`. Dropping is also what keeps
 * the renderer's contract true: it is handed primitives or nothing.
 */
export function coerceParams(raw: unknown): ActivityParams {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ActivityParams = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
  }
  return out;
}

/** What `serializeActivity` needs. A superset of today's columns — see the note. */
export interface ActivityRow {
  id: string;
  occurredAt: Date;
  tag: ActivityTag;
  text: string;
  /**
   * `code`, `params` and `runId` are specified by HARNESSES_AND_ACTIVITY §5.3
   * and BACKEND_INTEGRATION_CONTRACT §3.3 but are NOT columns on
   * `agent_activities` today (lib/db/schema.ts:620 declares id/agent_id/text/
   * tag/occurred_at and nothing else). They are optional here so this
   * serializer is already correct on the day the migration lands, and so the
   * query layer can pass `undefined` until then without a second code path.
   */
  code?: string | null;
  params?: unknown;
  runId?: string | null;
}

export function serializeActivity(row: ActivityRow): ActivityDTO {
  const code = normalizeCode(row.code);
  const params = coerceParams(row.params);
  return {
    kind: "activity",
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    code,
    params,
    severity: severityOf(code, params),
    tag: row.tag,
    runId: row.runId ?? null,
    // A v2 row stores '' and renders from the dictionary. Passing it through
    // unchanged is deliberate: the renderer checks `code` first, and a
    // serializer that substituted a placeholder here would make the blank-row
    // bug invisible to the test that exists to catch it.
    text: row.text,
  };
}

export interface RunRow {
  id: string;
  externalRunId: string;
  trigger: RunTrigger;
  triggerRef: string | null;
  sessionKey: string | null;
  status: RunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  stepCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
  costMicroUsd: number;
  model: string | null;
  summary: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * `unpriced` is the whole reason this is not a field-for-field copy.
 *
 * `cost_micro_usd` defaults to 0, and a run whose model ArkAgent cannot price
 * also lands at 0. Zero and unpriced are different facts: the first means the
 * run was free, the second means we do not know. Reporting tokens with no cost
 * is the signal, and it is exactly what the interim path produces today — the
 * Manager's chat stream carries usage but no price.
 */
export function serializeRun(row: RunRow): RunDTO {
  return {
    kind: "run",
    id: row.id,
    runId: row.externalRunId,
    trigger: row.trigger,
    triggerRef: row.triggerRef,
    sessionKey: row.sessionKey,
    status: row.status,
    severity: severityOfRunStatus(row.status),
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    durationMs: row.durationMs,
    stepCount: row.stepCount,
    usage: {
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheTokens: row.cacheTokens,
      totalTokens: row.totalTokens,
      costMicroUsd: row.costMicroUsd,
      model: row.model,
      unpriced: row.costMicroUsd === 0 && row.totalTokens > 0,
    },
    summary: row.summary,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
  };
}

export interface RunStepRow {
  id: string;
  occurredAt: Date;
  idx: number;
  phase: StepPhase;
  kind: string | null;
  title: string;
  detail: string | null;
  status: string;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
}

export function serializeRunStep(row: RunStepRow): RunStepDTO {
  const { detail, truncated } = truncateDetail(row.detail);
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    idx: row.idx,
    phase: row.phase,
    kind: row.kind,
    title: row.title,
    detail,
    detailTruncated: truncated,
    // The column is a varchar the runtime fills, not an enum. Anything that is
    // not the one value we can act on is `error` — a step reporting a status we
    // have never seen is not a success.
    status: row.status === "ok" ? "ok" : "error",
    durationMs: row.durationMs,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
  };
}

export function serializeRunDetail(
  row: RunRow & { stepsPrunedAt: Date | null },
  steps: RunStepRow[],
  opts: { stepsTruncated: boolean },
): RunDetailDTO {
  return {
    ...serializeRun(row),
    stepsTruncated: opts.stepsTruncated,
    stepsPrunedAt: row.stepsPrunedAt ? row.stepsPrunedAt.toISOString() : null,
    steps: steps.map(serializeRunStep),
  };
}

/**
 * A bucketed row from the health aggregate.
 *
 * Every numeric here arrives from postgres.js as a STRING (`count(*)` is
 * `bigint`, `avg()` is `numeric`) unless the query mapped it, so this
 * serializer coerces defensively rather than trusting the driver — `cpu + 1`
 * concatenating instead of adding is the bug class, and it renders as a
 * plausible number.
 */
export interface HealthBucketRow {
  ts: Date | string;
  state: string | null;
  cpu: number | string | null;
  cpuPeak: number | string | null;
  mem: number | string | null;
  memLimit: number | string | null;
  disk: number | string | null;
  activeRuns: number | string | null;
  samples: number | string;
  mockSamples: number | string;
  rollupSamples: number | string;
}

const HEALTH_STATES = ["idle", "running", "stopped", "unhealthy"] as const;

export function serializeHealthBucket(row: HealthBucketRow): HealthBucketDTO {
  const state = typeof row.state === "string" && (HEALTH_STATES as readonly string[]).includes(row.state)
    ? (row.state as HealthBucketDTO["state"])
    : null;
  return {
    ts: (row.ts instanceof Date ? row.ts : new Date(row.ts)).toISOString(),
    state,
    cpuPercent: num(row.cpu),
    cpuPeak: num(row.cpuPeak),
    memoryBytes: num(row.mem),
    memoryLimitBytes: num(row.memLimit),
    diskUsedBytes: num(row.disk),
    activeRuns: num(row.activeRuns) ?? 0,
    samples: num(row.samples) ?? 0,
    mockSamples: num(row.mockSamples) ?? 0,
    rollupSamples: num(row.rollupSamples) ?? 0,
  };
}

/**
 * `null` survives as `null` — it is the meaningful answer for cpu/mem/disk,
 * where absence is a GAP and not a zero. `Number(null)` is 0, which is the trap.
 */
function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Exported for the aggregate mappers in the query layer, which face the same driver. */
export const toNumber = (v: number | string | null | undefined): number => num(v) ?? 0;
