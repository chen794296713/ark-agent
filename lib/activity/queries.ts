import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  not,
  or,
  sql,
  like as sqlLike,
  type SQL,
} from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  agentActivities,
  agentHealthSamples,
  agentRunSteps,
  agentRuns,
  llmUsage,
  usageRecords,
  workspaces,
} from "@/lib/db/schema";
import { agentManagerMode } from "@/lib/agent-manager";
import { HARNESS_PROFILES } from "@/lib/harness/profiles";
import { isValidTimeZone } from "@/lib/schedule/cron";
import {
  runStatusesFor,
  VIEW_CAPABILITY,
  type ActivityDTO,
  type AgentFacts,
  type CostDTO,
  type EmptyReason,
  type HealthDTO,
  type LivenessDTO,
  type ManagerMode,
  type RunDTO,
  type RunDetailDTO,
  type RunListResponseDTO,
  type TimelineItemDTO,
  type TimelineResponseDTO,
  type ViewKey,
} from "./types";
import {
  serializeActivity,
  serializeHealthBucket,
  serializeRun,
  serializeRunDetail,
  toNumber,
} from "./serialize";
import {
  ACT_ONLY_FILTERS,
  RUN_ONLY_FILTERS,
  cursorRank,
  encodeCursor,
  likePattern,
  type Cursor,
  type CostQuery,
  type HealthQuery,
  type RunFilters,
  type TimelineFilters,
} from "./validation";

/**
 * The Activity read layer. Server-only: it is the only module here that touches
 * Drizzle, and a client component importing it would drag the whole schema into
 * the browser bundle.
 *
 * -------------------------------------------------------------------------
 * WHAT IS MISSING FROM THE SCHEMA, AND WHY THIS FILE DOES NOT PRETEND OTHERWISE
 * -------------------------------------------------------------------------
 * `docs/HARNESSES_AND_ACTIVITY.md` §5.3 and `BACKEND_INTEGRATION_CONTRACT.md`
 * §3.3 both describe `agent_activities` as carrying `code`, `params` and
 * `run_id`. **It does not.** `lib/db/schema.ts:620` declares exactly
 * `id · agent_id · text · tag · occurred_at`, and no migration through
 * `0009_v2_schema.sql` adds the other three. Selecting a column that does not
 * exist is `42703` at query time — a 500 on the Activity page of every agent,
 * on every request — so this file reads the columns that are there.
 *
 * That is not a stub. §5.2 already defines the behaviour for a row with no
 * code: severity `info`, matched ONLY by the `info` band, never surfaced by a
 * `warning`/`error` filter, and rendered from `text`. Every row in the table
 * today is such a row, so the branch suppression in `wantActivities()` below is
 * the CORRECT answer for the data that exists, not a placeholder for one.
 *
 * When the migration lands, three things change and each is marked
 * `ACTIVITY-CODE-COLUMN`: the projection gains the columns, `wantActivities()`
 * stops suppressing on `severity`/`type`/`channel`/`run`, and the severity
 * predicate from `./types` (`constantCodes` + `variableCodePredicates`, already
 * written and tested) is assembled into the `where`. Nothing else moves.
 * -------------------------------------------------------------------------
 */

/** v4 uuid, so a caller-supplied id is never cast to `uuid` and 22P02'd. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A run trace above this many steps is a pathology to surface, not to paginate. */
export const MAX_STEPS = 200;

// ---------------------------------------------------------------------------
// Keyset pagination
// ---------------------------------------------------------------------------

/**
 * The cursor predicate for one branch of the merged stream.
 *
 * PAGINATION IS KEYSET AND NOT OFFSET, and the reason is correctness before it
 * is performance. The timeline is `ORDER BY time DESC` and, in live mode, new
 * rows arrive at the head continuously. With `OFFSET 50`, every row that
 * arrives between the first page and "load more" shifts the window by one: the
 * user is shown rows they already read and silently skipped past others. That
 * is wrong at 60 rows, not only at a million. Two further reasons: `OFFSET`
 * over a merge of two independently-growing tables has no definition that
 * survives either side growing, and `OFFSET n` makes the server produce and
 * discard `n` rows, so scrolling to yesterday pays for every row above it on
 * every page.
 *
 * The sort key is `(timestamp DESC, kind DESC, id DESC)` with `run > act`, and
 * the predicate is KIND-AWARE. The obvious spelling — `(t, id) < ($t, $i)` on
 * both branches — loses rows: at a shared timestamp the two tables' ids are
 * unrelated random uuids, so an activity row at exactly the cursor's timestamp
 * is returned only if its uuid happens to sort below the cursor's. Roughly half
 * of all same-timestamp rows are silently dropped and the other half duplicated
 * — and shared timestamps are the COMMON case here, because one
 * `agent.run_finished` writes a run row and a `run.finished` activity row with
 * the identical instant.
 *
 * The `::timestamptz` / `::uuid` casts are mandatory on every branch:
 * postgres.js sends string parameters untyped, and an untyped parameter inside
 * a row comparison against `(timestamptz, uuid)` resolves inconsistently
 * between the row form and the scalar form.
 */
export function keysetWhere(
  col: PgColumn,
  idCol: PgColumn,
  rank: 0 | 1,
  cur: Cursor | null,
): SQL | undefined {
  if (!cur) return undefined;
  const curRank = cursorRank(cur.k);
  if (rank === curRank) {
    return sql`(${col}, ${idCol}) < (${cur.t}::timestamptz, ${cur.i}::uuid)`;
  }
  if (rank < curRank) {
    // Sorts AFTER the cursor row at an equal timestamp ⇒ that timestamp is
    // still owed to the client.
    return sql`${col} <= ${cur.t}::timestamptz`;
  }
  // Sorts BEFORE the cursor row at an equal timestamp ⇒ already emitted.
  return sql`${col} < ${cur.t}::timestamptz`;
}

interface Sortable {
  t: number;
  rank: 0 | 1;
  id: string;
}

/**
 * Merge two already-sorted branches in TypeScript.
 *
 * Rejected alternative: `UNION ALL` in SQL. It forces both branches into one
 * column list — a dozen `sql<null>` casts on each side — hands the planner a
 * merge-append it gets wrong on a two-index scan, and produces a result set
 * Drizzle types as a union of nullable everything, which is precisely the shape
 * a discriminated DTO exists to avoid. Each branch here runs its own query with
 * its own index and its own real column types, and at most `2 × (limit + 1)`
 * rows are read.
 */
function mergeByTime<T extends Sortable>(branches: T[][], limit: number): { page: T[]; more: boolean } {
  const all = branches.flat();
  all.sort((a, b) => b.t - a.t || b.rank - a.rank || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return { page: all.slice(0, limit), more: all.length > limit };
}

function cursorFor(item: TimelineItemDTO): string {
  return encodeCursor({
    t: item.kind === "run" ? item.startedAt : item.occurredAt,
    k: item.kind === "run" ? "run" : "act",
    i: item.id,
  });
}

// ---------------------------------------------------------------------------
// Branch suppression
// ---------------------------------------------------------------------------

/**
 * A filter that belongs to one branch excludes the other branch ENTIRELY.
 *
 * The two branches read tables with disjoint filterable columns. Applying
 * `trigger=schedule` to the run branch alone leaves the activity branch
 * unfiltered, so the user ticks "schedule" and still sees every message, skill
 * install and error in the window — which reads as a broken filter. Suppressing
 * the other branch is the honest answer.
 */
function wantRuns(f: TimelineFilters): boolean {
  if (ACT_ONLY_FILTERS.some((k) => f[k] !== null)) return false;
  // `severity` is the one filter that spans both, and `warning` maps to NO run
  // status — so it suppresses the run branch rather than leaving it unfiltered.
  if (f.severity && runStatusesFor(f.severity).length === 0) return false;
  return true;
}

function wantActivities(f: TimelineFilters): boolean {
  if (RUN_ONLY_FILTERS.some((k) => f[k] !== null)) return false;
  // ACTIVITY-CODE-COLUMN. Every row in `agent_activities` has no `code`, so
  // §5.2's rule applies to all of them: they are `info`, and only the `info`
  // band matches them. A `type` or `channel` filter names a code no row can
  // carry, and a `run` filter names a `run_id` no row has.
  if (f.severity && f.severity !== "info") return false;
  if (f.type !== null || f.channel !== null || f.run !== null) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

interface EmptyInput {
  agent: AgentFacts;
  view: ViewKey;
  mode: ManagerMode;
  /** True when the user set at least one filter this request. */
  filtered: boolean;
  /** Runs the same range with no filters. Called ONLY on the empty+filtered path. */
  probeUnfiltered?: () => Promise<boolean>;
}

/**
 * §8.1's resolution order, first match wins, computed on the SERVER.
 *
 * A client cannot tell "nothing happened" from "your filters excluded
 * everything" from "the runtime is a simulator" — all three are
 * `items.length === 0`. Nothing writes the runtime tables yet, so this field is
 * the Activity page for most agents at launch.
 */
async function resolveEmptyReason(input: EmptyInput): Promise<EmptyReason> {
  const { agent, view, mode } = input;
  if (agent.status === "draft" || agent.status === "provisioning" || agent.status === "deploying") {
    return "never_provisioned";
  }
  if (mode === "unconfigured") return "runtime_unconfigured";
  if (mode === "mock") return "runtime_mock";
  // `=== "no"`, NOT `!== "yes"`, and the difference is the whole launch
  // experience: every telemetry capability on every harness is "unknown" today,
  // so `!== "yes"` would fire for every agent on every empty view and
  // `no_data_yet` would become unreachable. A view that queried and got nothing
  // has learned nothing about the capability — it says "nothing yet", not "this
  // runtime doesn't do that".
  if (HARNESS_PROFILES[agent.engine].capabilities[VIEW_CAPABILITY[view]] === "no") {
    return "telemetry_unsupported";
  }
  if (input.filtered && input.probeUnfiltered && (await input.probeUnfiltered())) {
    return "filtered_out";
  }
  return "no_data_yet";
}

/** Any filter beyond the range and the page size. */
function isFiltered(f: TimelineFilters | RunFilters): boolean {
  const keys = [
    "q",
    "trigger",
    "outcome",
    "session",
    "model",
    ...("severity" in f ? ["severity", "type", "tag", "channel", "run"] : []),
  ] as const;
  const bag = f as unknown as Record<string, unknown>;
  return keys.some((k) => bag[k] != null);
}

// ---------------------------------------------------------------------------
// TIMELINE
// ---------------------------------------------------------------------------

export interface TimelineInput {
  agent: AgentFacts;
  filters: TimelineFilters;
}

export async function getTimeline(input: TimelineInput): Promise<TimelineResponseDTO> {
  const { agent, filters: f } = input;
  const mode = agentManagerMode();
  const runs = wantRuns(f);
  const acts = wantActivities(f);
  const like = f.q ? likePattern(f.q) : null;

  const [runRows, actRows] = await Promise.all([
    runs ? selectRuns(agent.id, f, like) : Promise.resolve([]),
    acts ? selectActivities(agent.id, f, like) : Promise.resolve([]),
  ]);

  const runItems = runRows.map((r) => ({
    ...serializeRun(r),
    t: r.startedAt.getTime(),
    rank: 1 as const,
  }));
  const actItems = actRows.map((r) => ({
    ...serializeActivity(r),
    t: r.occurredAt.getTime(),
    rank: 0 as const,
  }));

  const { page, more } = mergeByTime<
    (RunDTO | ActivityDTO) & Sortable
  >([runItems, actItems], f.limit);
  const items: TimelineItemDTO[] = page.map(({ t: _t, rank: _rank, ...rest }) => rest as TimelineItemDTO);

  return {
    items,
    nextCursor: more && items.length > 0 ? cursorFor(items[items.length - 1]) : null,
    days: dayCounts(items),
    managerMode: mode,
    emptyReason:
      items.length > 0
        ? null
        : await resolveEmptyReason({
            agent,
            view: "timeline",
            mode,
            filtered: isFiltered(f),
            probeUnfiltered: () => probeAnyRow(agent.id, f.from, f.to),
          }),
    ignoredFilters: f.ignored,
  };
}

const RUN_PROJECTION = {
  id: agentRuns.id,
  externalRunId: agentRuns.externalRunId,
  trigger: agentRuns.trigger,
  triggerRef: agentRuns.triggerRef,
  sessionKey: agentRuns.sessionKey,
  status: agentRuns.status,
  startedAt: agentRuns.startedAt,
  finishedAt: agentRuns.finishedAt,
  durationMs: agentRuns.durationMs,
  stepCount: agentRuns.stepCount,
  inputTokens: agentRuns.inputTokens,
  outputTokens: agentRuns.outputTokens,
  cacheTokens: agentRuns.cacheTokens,
  totalTokens: agentRuns.totalTokens,
  costMicroUsd: agentRuns.costMicroUsd,
  model: agentRuns.model,
  summary: agentRuns.summary,
  errorCode: agentRuns.errorCode,
  errorMessage: agentRuns.errorMessage,
};

/**
 * Synthetic day-runs are excluded everywhere they would appear as work.
 *
 * The contract creates one run per agent per UTC day, `external_run_id` =
 * `"system:YYYY-MM-DD"`, to carry tool calls that happen outside a run. They
 * never finish, so an agent that has run for a year has 365 rows permanently
 * marked "running", one of which is always at the top of the list. Their steps
 * are real and belong in a tool-call view; their run wrapper is an artefact of
 * a NOT NULL foreign key.
 *
 * `NOT LIKE` is NULL-safe here only because `external_run_id` is `NOT NULL`.
 */
const notSynthetic = () => not(sqlLike(agentRuns.externalRunId, "system:%"));

function selectRuns(agentId: string, f: TimelineFilters, like: string | null) {
  return db
    .select(RUN_PROJECTION)
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.agentId, agentId),
        gte(agentRuns.startedAt, f.from),
        lte(agentRuns.startedAt, f.to),
        notSynthetic(),
        keysetWhere(agentRuns.startedAt, agentRuns.id, 1, f.cursor),
        f.trigger ? inArray(agentRuns.trigger, f.trigger) : undefined,
        f.outcome ? inArray(agentRuns.status, f.outcome) : undefined,
        // §5.2's OTHER mapping. Without this line a severity filter silently
        // applies to the activity branch only and every run comes back anyway.
        f.severity ? inArray(agentRuns.status, runStatusesFor(f.severity)) : undefined,
        f.session ? eq(agentRuns.sessionKey, f.session) : undefined,
        f.model ? eq(agentRuns.model, f.model) : undefined,
        f.run ? runIdMatch(f.run) : undefined,
        like ? ilike(agentRuns.summary, like) : undefined,
      ),
    )
    .orderBy(desc(agentRuns.startedAt), desc(agentRuns.id))
    .limit(f.limit + 1);
}

/** A run may be addressed by our uuid or by the runtime's own id. */
function runIdMatch(run: string): SQL | undefined {
  return UUID_RE.test(run)
    ? or(eq(agentRuns.id, run), eq(agentRuns.externalRunId, run))
    : eq(agentRuns.externalRunId, run);
}

function selectActivities(agentId: string, f: TimelineFilters, like: string | null) {
  return db
    .select({
      id: agentActivities.id,
      text: agentActivities.text,
      tag: agentActivities.tag,
      occurredAt: agentActivities.occurredAt,
      // ACTIVITY-CODE-COLUMN: `code`, `params` and `run_id` go here.
    })
    .from(agentActivities)
    .where(
      and(
        eq(agentActivities.agentId, agentId),
        gte(agentActivities.occurredAt, f.from),
        lte(agentActivities.occurredAt, f.to),
        keysetWhere(agentActivities.occurredAt, agentActivities.id, 0, f.cursor),
        f.tag ? eq(agentActivities.tag, f.tag) : undefined,
        // AN HONEST LIMITATION. A v2 row stores `text = ''` and renders from
        // `code` + `params`, so free-text search cannot match the sentence the
        // user is reading — it matches run summaries, legacy text and `custom`
        // rows only. The search box says "Search run summaries" for that reason.
        like ? ilike(agentActivities.text, like) : undefined,
      ),
    )
    .orderBy(desc(agentActivities.occurredAt), desc(agentActivities.id))
    .limit(f.limit + 1);
}

/** `SELECT 1 … LIMIT 1` per branch. Runs ONLY when the page came back empty AND filtered. */
async function probeAnyRow(agentId: string, from: Date, to: Date): Promise<boolean> {
  const [r, a] = await Promise.all([
    db
      .select({ x: sql<number>`1`.mapWith(Number) })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.agentId, agentId),
          gte(agentRuns.startedAt, from),
          lte(agentRuns.startedAt, to),
          notSynthetic(),
        ),
      )
      .limit(1),
    db
      .select({ x: sql<number>`1`.mapWith(Number) })
      .from(agentActivities)
      .where(
        and(
          eq(agentActivities.agentId, agentId),
          gte(agentActivities.occurredAt, from),
          lte(agentActivities.occurredAt, to),
        ),
      )
      .limit(1),
  ]);
  return r.length > 0 || a.length > 0;
}

/**
 * Per-day counts for the sticky day headers, over the RETURNED window only — a
 * global count would need a second unbounded aggregate to answer a question
 * about rows that are not on screen. Bucketed in UTC; only the cost view, whose
 * question is "what did this month cost", buckets in the workspace's zone.
 */
function dayCounts(items: TimelineItemDTO[]): TimelineResponseDTO["days"] {
  const byDay = new Map<string, { date: string; runs: number; ok: number; failed: number; running: number }>();
  for (const it of items) {
    const iso = it.kind === "run" ? it.startedAt : it.occurredAt;
    const date = iso.slice(0, 10);
    const row = byDay.get(date) ?? { date, runs: 0, ok: 0, failed: 0, running: 0 };
    if (it.kind === "run") {
      row.runs += 1;
      if (it.status === "succeeded") row.ok += 1;
      else if (it.status === "failed" || it.status === "timeout") row.failed += 1;
      else if (it.status === "running" || it.status === "queued") row.running += 1;
    }
    byDay.set(date, row);
  }
  return [...byDay.values()];
}

// ---------------------------------------------------------------------------
// RUNS
// ---------------------------------------------------------------------------

export async function getRuns(input: {
  agent: AgentFacts;
  filters: RunFilters;
}): Promise<RunListResponseDTO> {
  const { agent, filters: f } = input;
  const mode = agentManagerMode();
  const like = f.q ? likePattern(f.q) : null;

  const rows = await db
    .select(RUN_PROJECTION)
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.agentId, agent.id),
        gte(agentRuns.startedAt, f.from),
        lte(agentRuns.startedAt, f.to),
        notSynthetic(),
        keysetWhere(agentRuns.startedAt, agentRuns.id, 1, f.cursor),
        f.trigger ? inArray(agentRuns.trigger, f.trigger) : undefined,
        f.outcome ? inArray(agentRuns.status, f.outcome) : undefined,
        f.session ? eq(agentRuns.sessionKey, f.session) : undefined,
        f.model ? eq(agentRuns.model, f.model) : undefined,
        like ? ilike(agentRuns.summary, like) : undefined,
      ),
    )
    .orderBy(desc(agentRuns.startedAt), desc(agentRuns.id))
    .limit(f.limit + 1);

  const more = rows.length > f.limit;
  const items = rows.slice(0, f.limit).map(serializeRun);

  return {
    items,
    nextCursor:
      more && items.length > 0
        ? encodeCursor({ t: items[items.length - 1].startedAt, k: "run", i: items[items.length - 1].id })
        : null,
    managerMode: mode,
    emptyReason:
      items.length > 0
        ? null
        : await resolveEmptyReason({
            agent,
            view: "runs",
            mode,
            filtered: isFiltered(f),
            probeUnfiltered: async () => {
              const probe = await db
                .select({ x: sql<number>`1`.mapWith(Number) })
                .from(agentRuns)
                .where(
                  and(
                    eq(agentRuns.agentId, agent.id),
                    gte(agentRuns.startedAt, f.from),
                    lte(agentRuns.startedAt, f.to),
                    notSynthetic(),
                  ),
                )
                .limit(1);
              return probe.length > 0;
            },
          }),
    ignoredFilters: f.ignored,
  };
}

/**
 * One run and its step trace, or `null` when the id belongs to another agent —
 * which the route turns into a 404, never a 403 (docs/API.md): a 403 confirms
 * the row exists, which is a cross-workspace disclosure in itself.
 */
export async function getRun(agentId: string, runRef: string): Promise<RunDetailDTO | null> {
  const [row] = await db
    .select({ ...RUN_PROJECTION, stepsPrunedAt: agentRuns.stepsPrunedAt })
    .from(agentRuns)
    .where(and(eq(agentRuns.agentId, agentId), runIdMatch(runRef)))
    .limit(1);
  if (!row) return null;

  const steps = await db
    .select({
      id: agentRunSteps.id,
      occurredAt: agentRunSteps.occurredAt,
      idx: agentRunSteps.idx,
      phase: agentRunSteps.phase,
      kind: agentRunSteps.kind,
      title: agentRunSteps.title,
      detail: agentRunSteps.detail,
      status: agentRunSteps.status,
      durationMs: agentRunSteps.durationMs,
      inputTokens: agentRunSteps.inputTokens,
      outputTokens: agentRunSteps.outputTokens,
    })
    .from(agentRunSteps)
    // ORDER BY `idx`, NEVER `occurred_at`. `idx` is the runtime's render order;
    // steps arrive out of order under batching, and ordering by the clock
    // silently re-introduces the bug the C13 rename was made to prevent.
    .where(eq(agentRunSteps.runId, row.id))
    .orderBy(asc(agentRunSteps.idx))
    .limit(MAX_STEPS + 1);

  return serializeRunDetail(row, steps.slice(0, MAX_STEPS), {
    stepsTruncated: steps.length > MAX_STEPS,
  });
}

// ---------------------------------------------------------------------------
// HEALTH
// ---------------------------------------------------------------------------

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * ~300 points whatever the range.
 *
 * At the contract's 60-second cadence a day is 1,440 samples per agent; sending
 * them raw to draw a 32px sparkline is ~180 KB of JSON for ~120 pixels of ink.
 * The last arm is not decoration: every range is capped at 90 days, and a
 * `pickBucket` with no arm above 30 days returns `undefined` for a legal
 * request, which divides by NaN and groups every sample into one bucket.
 */
export function pickBucketSeconds(rangeMs: number): number {
  if (rangeMs <= 24 * HOUR_MS) return 300;
  if (rangeMs <= 7 * DAY_MS) return 1_800;
  if (rangeMs <= 30 * DAY_MS) return 7_200;
  return 21_600;
}

export async function getHealth(input: {
  agent: AgentFacts;
  range: HealthQuery;
}): Promise<HealthDTO> {
  const { agent, range } = input;
  const mode = agentManagerMode();
  const bucketSeconds = pickBucketSeconds(range.to.getTime() - range.from.getTime());

  const bucket = sql<Date>`
    to_timestamp(floor(extract(epoch from ${agentHealthSamples.sampledAt}) / ${bucketSeconds})
                 * ${bucketSeconds})`;

  /**
   * Past 14 days the series changes granularity: the sweep rolls samples up to
   * one row per hour IN PLACE, so any window wider than a fortnight mixes
   * 60-second samples with 3,600-second aggregates. An unweighted mean would
   * count one rolled-up hour as much as one live minute and bias every figure
   * toward the recent half. Inside 14 days every weight is 1 and this is
   * `avg()` exactly.
   */
  const w = sql`(case when ${agentHealthSamples.source} = 'rollup' then 60 else 1 end)`;

  const [buckets, liveness] = await Promise.all([
    db
      .select({
        ts: bucket,
        cpu: sql<number | null>`
          case when sum(case when ${agentHealthSamples.cpuPercent} is null then 0 else ${w} end) = 0
               then null
               else round(sum(coalesce(${agentHealthSamples.cpuPercent}, 0) * ${w})
                          / sum(case when ${agentHealthSamples.cpuPercent} is null then 0 else ${w} end))
          end`,
        cpuPeak: sql<number | null>`max(${agentHealthSamples.cpuPercent})`,
        mem: sql<number | null>`
          case when sum(case when ${agentHealthSamples.memoryBytes} is null then 0 else ${w} end) = 0
               then null
               else round(sum(coalesce(${agentHealthSamples.memoryBytes}, 0) * ${w})
                          / sum(case when ${agentHealthSamples.memoryBytes} is null then 0 else ${w} end))
          end`,
        memLimit: sql<number | null>`max(${agentHealthSamples.memoryLimitBytes})`,
        // `max`, not `avg`: there is no disk limit column, so the card renders
        // an absolute figure — and averaging a monotonically-growing series
        // hides exactly the thing the card is for.
        disk: sql<number | null>`max(${agentHealthSamples.diskUsedBytes})`,
        activeRuns: sql<number>`max(${agentHealthSamples.activeRuns})`,
        // The WORST state in the bucket wins the cell: an operator wants the
        // worst thing that happened in those five minutes, not its average.
        state: sql<string | null>`(array['idle','running','stopped','unhealthy'])[
          max(array_position(array['idle','running','stopped','unhealthy'],
                             ${agentHealthSamples.state}))]`,
        samples: sql<number>`count(*)`,
        // Counted, never charted silently. A mock sample averaged into a real
        // agent's history is the single worst outcome available on this page,
        // because it is indistinguishable from success.
        mockSamples: sql<number>`count(*) filter (where ${agentHealthSamples.source} = 'mock')`,
        rollupSamples: sql<number>`count(*) filter (where ${agentHealthSamples.source} = 'rollup')`,
      })
      .from(agentHealthSamples)
      .where(
        and(
          eq(agentHealthSamples.agentId, agent.id),
          gte(agentHealthSamples.sampledAt, range.from),
          lte(agentHealthSamples.sampledAt, range.to),
        ),
      )
      .groupBy(bucket)
      .orderBy(asc(bucket)),
    buildLiveness(agent),
  ]);

  const dto = buckets.map(serializeHealthBucket);
  const totalSamples = dto.reduce((n, b) => n + b.samples, 0);
  const mockSamples = dto.reduce((n, b) => n + b.mockSamples, 0);
  const sampleSource: HealthDTO["sampleSource"] =
    totalSamples === 0 ? "none" : mockSamples === totalSamples ? "mock" : "runtime";

  return {
    bucketSeconds,
    buckets: dto,
    liveness,
    sampleSource,
    managerMode: mode,
    // The view is NEVER fully empty — the liveness block reads from `agents` and
    // needs no sample — so `emptyReason` describes the CHARTS only.
    emptyReason:
      totalSamples > 0
        ? null
        : await resolveEmptyReason({ agent, view: "health", mode, filtered: false }),
  };
}

async function buildLiveness(agent: AgentFacts): Promise<LivenessDTO> {
  const [activeRuns, lastActivity, restarts] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(agentRuns)
      .where(and(eq(agentRuns.agentId, agent.id), inArray(agentRuns.status, ["running", "queued"]))),
    db
      .select({ at: sql<Date | null>`max(${agentActivities.occurredAt})` })
      .from(agentActivities)
      .where(eq(agentActivities.agentId, agent.id)),
    /**
     * `restarts7d` cannot be counted the obvious way, because the column it
     * wants does not exist: `agent_health_samples` carries `uptime_seconds` and
     * no `uptime_started_at`. A restart is observable only as a DECREASE in
     * `uptime_seconds` between consecutive samples — which UNDERCOUNTS by
     * construction (a restart inside one 60-second gap that returns higher is
     * invisible, and past the rollup the resolution is hourly), so the label
     * says "observed".
     *
     * `source <> 'mock'` keeps a simulator's sawtooth out of a real agent's
     * restart count.
     */
    db.execute<{ n: string | number }>(sql`
      select count(*) as n from (
        select ${agentHealthSamples.uptimeSeconds} as u,
               lag(${agentHealthSamples.uptimeSeconds}) over (order by ${agentHealthSamples.sampledAt}) as prev
        from ${agentHealthSamples}
        where ${agentHealthSamples.agentId} = ${agent.id}
          and ${agentHealthSamples.sampledAt} >= now() - interval '7 days'
          and ${agentHealthSamples.source} <> 'mock'
          and ${agentHealthSamples.uptimeSeconds} is not null
      ) t where prev is not null and u < prev`),
  ]);

  const rows = restarts as unknown as Array<{ n: string | number }>;
  return {
    lastHeartbeatAt: agent.lastHeartbeatAt ? agent.lastHeartbeatAt.toISOString() : null,
    heartbeatMinutes: agent.heartbeatMinutes,
    heartbeatState: heartbeatState(agent),
    activeRuns: activeRuns[0]?.n ?? 0,
    lastActivityAt: lastActivity[0]?.at ? new Date(lastActivity[0].at).toISOString() : null,
    configRevision: agent.configRevision,
    appliedConfigRevision: agent.appliedConfigRevision,
    configPending: agent.appliedConfigRevision < agent.configRevision,
    uptimeStartedAt: agent.uptimeStartedAt ? agent.uptimeStartedAt.toISOString() : null,
    restarts7dObserved: toNumber(rows[0]?.n ?? 0),
  };
}

/**
 * Silence is not always a fault.
 *
 * The contract forbids marking a `paused` agent unreachable, and the same
 * argument covers an agent that has not been provisioned yet and one that has
 * been terminated: nothing is expected to report, so a red dot there teaches
 * operators to ignore the red dot — which is the failure the fourth state
 * exists to prevent.
 */
function heartbeatState(agent: AgentFacts): LivenessDTO["heartbeatState"] {
  const quiet = ["paused", "terminated", "draft", "provisioning", "deploying"];
  if (quiet.includes(agent.status)) return "expected_silence";
  if (!agent.lastHeartbeatAt) return "dead";
  const ageMs = Date.now() - agent.lastHeartbeatAt.getTime();
  const beat = Math.max(1, agent.heartbeatMinutes) * 60_000;
  if (ageMs > beat * 10) return "dead";
  if (ageMs > beat * 3) return "stale";
  return "ok";
}

// ---------------------------------------------------------------------------
// COST
// ---------------------------------------------------------------------------

/**
 * EVERY aggregate below carries `.mapWith(Number)`, and that is not optional.
 *
 * The driver is postgres.js, which returns `int8` and `numeric` as JavaScript
 * STRINGS — deliberately, because neither fits a `number` safely. `count(*)` is
 * bigint, `sum()` over a bigint column is numeric, `sum()` over an integer
 * column is bigint. A bare `sql<number>` is therefore a lie the type system
 * accepts: `a + b` concatenates instead of adding, and the view renders
 * `$142000142000`. The Drizzle column helpers do not save this —
 * `bigint(…, { mode: "number" })` maps the COLUMN, not an expression over it.
 *
 * `coalesce(…, 0)` is on every `sum` for the second half of the same problem:
 * `sum()` over zero rows is NULL, and the totals query does see empty windows.
 */
export async function getCost(input: {
  agent: AgentFacts;
  workspaceId: string;
  range: CostQuery;
}): Promise<CostDTO> {
  const { agent, workspaceId, range } = input;
  const mode = agentManagerMode();
  const spanMs = range.to.getTime() - range.from.getTime();
  const prevFrom = new Date(range.from.getTime() - spanMs);

  const [ws] = await db
    .select({ timezone: workspaces.timezone })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  /**
   * Day bucketing uses the WORKSPACE timezone, not UTC: "daily spend" bucketed
   * in UTC for a Shanghai workspace draws every evening's work on the following
   * day's bar.
   *
   * `AT TIME ZONE` with an unknown zone raises `22023` at QUERY time — a 500 on
   * the cost tab of every agent in that workspace, from a column a user can
   * set. So the value is validated before it reaches SQL and falls back to UTC
   * with a flag the header can render. The throwing variant belongs in the
   * schedules writer; a bad stored value must not make the read path
   * unreachable.
   */
  const stored = ws?.timezone ?? "UTC";
  const timezoneInvalid = !isValidTimeZone(stored);
  const tz = timezoneInvalid ? "UTC" : stored;

  const inWindow = and(
    eq(agentRuns.agentId, agent.id),
    gte(agentRuns.startedAt, range.from),
    lte(agentRuns.startedAt, range.to),
    notSynthetic(),
  );

  const day = sql<string>`to_char(${agentRuns.startedAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;
  const cost = sql<number>`coalesce(sum(${agentRuns.costMicroUsd}), 0)`.mapWith(Number);
  const tokens = sql<number>`coalesce(sum(${agentRuns.totalTokens}), 0)`.mapWith(Number);
  const runCount = sql<number>`count(*)`.mapWith(Number);
  /**
   * An unpriced model contributes 0 to the sum. Counting it lets the view say
   * "3 runs not priced" instead of drawing a shorter bar and calling it
   * cheaper. This is the day-one shape of the interim path: real runs, real
   * tokens, `cost_micro_usd = 0`.
   */
  const unpriced = sql<number>`count(*) filter (where ${agentRuns.costMicroUsd} = 0
                                                  and ${agentRuns.totalTokens} > 0)`.mapWith(Number);

  const [daily, totals, previous, byTrigger, byModel, topRuns, llm, llmByKind, credits] =
    await Promise.all([
      db
        .select({ day, runs: runCount, costMicroUsd: cost, totalTokens: tokens, unpriced })
        .from(agentRuns)
        .where(inWindow)
        .groupBy(day)
        .orderBy(asc(day)),
      db
        .select({ runs: runCount, costMicroUsd: cost, totalTokens: tokens, unpriced })
        .from(agentRuns)
        .where(inWindow),
      db
        .select({ runs: runCount, costMicroUsd: cost })
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.agentId, agent.id),
            gte(agentRuns.startedAt, prevFrom),
            // Exclusive upper bound, so a run on the boundary is not counted twice.
            sql`${agentRuns.startedAt} < ${range.from}`,
            notSynthetic(),
          ),
        ),
      db
        .select({ trigger: agentRuns.trigger, runs: runCount, costMicroUsd: cost, totalTokens: tokens })
        .from(agentRuns)
        .where(inWindow)
        .groupBy(agentRuns.trigger),
      db
        .select({ model: agentRuns.model, runs: runCount, costMicroUsd: cost, totalTokens: tokens })
        .from(agentRuns)
        .where(inWindow)
        .groupBy(agentRuns.model),
      db
        .select({
          id: agentRuns.id,
          runId: agentRuns.externalRunId,
          startedAt: agentRuns.startedAt,
          summary: agentRuns.summary,
          durationMs: agentRuns.durationMs,
          totalTokens: agentRuns.totalTokens,
          costMicroUsd: agentRuns.costMicroUsd,
          status: agentRuns.status,
        })
        .from(agentRuns)
        .where(inWindow)
        .orderBy(desc(agentRuns.costMicroUsd), desc(agentRuns.totalTokens))
        .limit(10),
      /**
       * ArkAgent's OWN model spend for this agent — a DIFFERENT ledger from
       * `agent_runs`, and the one that is non-empty today, because the chat,
       * brief and self-review paths already write it. Scoped by `agent_id`
       * alone: the agent was resolved through `getAgentRow(id, workspace.id)`,
       * so `agent_id` IS the scope, and `llm_usage.workspace_id` is nullable
       * (`set null` on delete) — adding it to the predicate would silently drop
       * rows whose workspace row was later removed.
       */
      db
        .select({
          calls: sql<number>`count(*)`.mapWith(Number),
          totalTokens: sql<number>`coalesce(sum(${llmUsage.totalTokens}), 0)`.mapWith(Number),
          costMicroUsd: sql<number>`coalesce(sum(${llmUsage.costMicroUsd}), 0)`.mapWith(Number),
          estimatedCalls: sql<number>`count(*) filter (where ${llmUsage.estimated})`.mapWith(Number),
        })
        .from(llmUsage)
        .where(
          and(
            eq(llmUsage.agentId, agent.id),
            gte(llmUsage.createdAt, range.from),
            lte(llmUsage.createdAt, range.to),
          ),
        ),
      db
        .select({
          kind: llmUsage.kind,
          calls: sql<number>`count(*)`.mapWith(Number),
          totalTokens: sql<number>`coalesce(sum(${llmUsage.totalTokens}), 0)`.mapWith(Number),
          costMicroUsd: sql<number>`coalesce(sum(${llmUsage.costMicroUsd}), 0)`.mapWith(Number),
        })
        .from(llmUsage)
        .where(
          and(
            eq(llmUsage.agentId, agent.id),
            gte(llmUsage.createdAt, range.from),
            lte(llmUsage.createdAt, range.to),
          ),
        )
        .groupBy(llmUsage.kind),
      /**
       * Credits, from `usage_records` — the BILLING ledger, not the token one,
       * and never converted into a dollar figure here: ArkAgent owns pricing,
       * and a made-up exchange rate in a cost view is a fabricated number.
       *
       * This is the only table on the page that is workspace-scoped rather than
       * agent-scoped, which is exactly why it is the one that gets forgotten.
       * `workspace_id` leads the predicate because it leads the index;
       * `agent_id` is a heap filter over what that already selected.
       */
      db
        .select({
          kind: usageRecords.kind,
          credits: sql<number>`coalesce(sum(${usageRecords.credits}), 0)`.mapWith(Number),
        })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.workspaceId, workspaceId),
            eq(usageRecords.agentId, agent.id),
            gte(usageRecords.occurredAt, range.from),
            lte(usageRecords.occurredAt, range.to),
          ),
        )
        .groupBy(usageRecords.kind),
    ]);

  const t = totals[0] ?? { runs: 0, costMicroUsd: 0, totalTokens: 0, unpriced: 0 };
  const p = previous[0];
  const l = llm[0] ?? { calls: 0, totalTokens: 0, costMicroUsd: 0, estimatedCalls: 0 };
  const creditTotal = credits.reduce((n, c) => n + c.credits, 0);
  const empty = t.runs === 0 && l.calls === 0 && creditTotal === 0;

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    timezone: tz,
    timezoneInvalid,
    totals: {
      costMicroUsd: t.costMicroUsd,
      runs: t.runs,
      // Integer division on micro-USD, so the rounding happens once and at the
      // smallest unit rather than per run.
      costPerRunMicroUsd: t.runs > 0 ? Math.round(t.costMicroUsd / t.runs) : 0,
      totalTokens: t.totalTokens,
      unpricedRuns: t.unpriced,
    },
    previous: p && p.runs > 0 ? { costMicroUsd: p.costMicroUsd, runs: p.runs } : null,
    daily,
    byTrigger,
    byModel,
    topRuns: topRuns.map((r) => ({
      id: r.id,
      runId: r.runId,
      startedAt: r.startedAt.toISOString(),
      summary: r.summary,
      durationMs: r.durationMs,
      totalTokens: r.totalTokens,
      costMicroUsd: r.costMicroUsd,
      unpriced: r.costMicroUsd === 0 && r.totalTokens > 0,
      status: r.status,
    })),
    llm: { ...l, byKind: llmByKind },
    credits: { used: creditTotal, byKind: credits.map((c) => ({ kind: c.kind, credits: c.credits })) },
    managerMode: mode,
    emptyReason: empty
      ? await resolveEmptyReason({ agent, view: "cost", mode, filtered: false })
      : null,
  };
}
