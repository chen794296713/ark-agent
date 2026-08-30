/**
 * Schedule rows -> API DTOs.
 *
 * Three fields are COMPUTED here rather than stored, and that is the point of
 * putting the serializer beside the pure cron engine: `humanReadable`,
 * `upcoming` and `invalidReason` all come from `lib/schedule/**`, so the row the
 * list renders and the row the tick fires cannot disagree about what an
 * expression means.
 *
 * Three columns are deliberately NOT serialized:
 *  - `session_key`   internal; it publishes the naming scheme of a conversation
 *                    the user never created.
 *  - `claimed_at` / `claim_token`   lease state; a tenant has no use for it and
 *                    a leaked token is a way to reason about our tick timing.
 *  - `error_message` on a run: <=480 chars of ENGLISH written for our logs
 *                    (contract §3.4), on a surface that ships in zh/zht/ja. A
 *                    comment saying "never rendered" beside a serialized field
 *                    is not a control; not serializing it is.
 *
 * docs/REMINDERS_AND_SCHEDULERS.md §3.8.2.
 */

import type { Lang } from "@/lib/types";
import { cronError, nextRun, nextRuns } from "@/lib/schedule/cron";
import { describeSchedule } from "@/lib/schedule/describe";
import type { agentScheduleRuns, agentSchedules } from "@/lib/db/schema";

export type ScheduleRow = typeof agentSchedules.$inferSelect;
export type ScheduleRunRow = typeof agentScheduleRuns.$inferSelect;

export interface ScheduleDTO {
  id: string;
  agentId: string;
  name: string;
  enabled: boolean;
  kind: "cron" | "once" | "interval";
  cronExpr: string | null;
  runAt: string | null;
  intervalSeconds: number | null;
  timezone: string;
  prompt: string;
  expectation: string | null;
  deliverTo: string;
  overlapPolicy: string;
  catchUp: boolean;
  jitterSeconds: number;
  maxRunsPerDay: number;
  maxRuntimeSeconds: number;
  wakeRuntime: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  createdAt: string;
  updatedAt: string;
  // ---- computed; none of these are columns ----
  /** describeSchedule(...). null for `once` and for an unparseable expression. */
  humanReadable: string | null;
  /** The next five instants. Empty for a fired `once` or a never-matching cron. */
  upcoming: string[];
  /** cronError(...). Non-null only for a row edited into invalidity by direct SQL. */
  invalidReason: string | null;
  /**
   * Which terminal state a disabled row is in (§3.4.3). Derived, not stored:
   * `last_status` is a RUN status and writing a schedule state into it would
   * break the one i18n entry that renders both.
   */
  terminalState: "once_consumed" | "never_runs" | "paused" | null;
}

export interface ScheduleRunDTO {
  id: string;
  scheduleId: string;
  scheduleName: string;
  runId: string | null;
  scheduledFor: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  status: string;
  skipReason: string | null;
  summary: string | null;
  errorCode: string | null;
  trigger: string;
  attempt: number;
  nextAttemptAt: string | null;
  missedCount: number;
  missedTruncated: boolean;
  expectationMet: boolean | null;
  source: string;
  tokens: { input: number; output: number; total: number } | null;
}

/** The §3.1 banner's only data source. Derived scalars — never tick rows. */
export interface TickHealthDTO {
  observedSeconds: number | null;
  lastTickAt: string | null;
  finestNeededSeconds: number | null;
  tooCoarse: boolean;
  stalled: boolean;
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export interface SerializeScheduleOptions {
  lang?: Lang;
  /** Injected so a list of 20 rows shares one clock. */
  now?: Date;
  /** How many upcoming instants to compute. The editor preview wants 5. */
  upcomingCount?: number;
}

export function serializeSchedule(
  row: ScheduleRow,
  opts: SerializeScheduleOptions = {},
): ScheduleDTO {
  const lang = opts.lang ?? "en";
  const now = opts.now ?? new Date();
  const count = opts.upcomingCount ?? 5;

  let humanReadable: string | null = null;
  let upcoming: string[] = [];
  let invalidReason: string | null = null;

  if (row.kind === "cron" && row.cronExpr) {
    invalidReason = cronError(row.cronExpr);
    if (!invalidReason) {
      humanReadable = describeSchedule(row.cronExpr, row.timezone, lang);
      // A disabled row still previews: the user is deciding whether to turn it
      // back on, and "here is when it would run" is the answer they need.
      upcoming = nextRuns(row.cronExpr, now, row.timezone, count).map((d) => d.toISOString());
    }
  } else if (row.kind === "once" && row.runAt) {
    // A `once` in the future is its own preview; a fired one has no future.
    upcoming = row.runAt.getTime() > now.getTime() ? [row.runAt.toISOString()] : [];
  } else if (row.kind === "interval" && row.intervalSeconds) {
    const anchor = row.nextRunAt ?? now;
    for (let i = 0; i < count; i++) {
      upcoming.push(new Date(anchor.getTime() + i * row.intervalSeconds * 1000).toISOString());
    }
  }

  return {
    id: row.id,
    agentId: row.agentId,
    name: row.name,
    enabled: row.enabled,
    kind: row.kind,
    cronExpr: row.cronExpr,
    runAt: iso(row.runAt),
    intervalSeconds: row.intervalSeconds,
    timezone: row.timezone,
    prompt: row.prompt,
    expectation: row.expectation,
    deliverTo: row.deliverTo,
    overlapPolicy: row.overlapPolicy,
    catchUp: row.catchUp,
    jitterSeconds: row.jitterSeconds,
    maxRunsPerDay: row.maxRunsPerDay,
    maxRuntimeSeconds: row.maxRuntimeSeconds,
    wakeRuntime: row.wakeRuntime,
    nextRunAt: iso(row.nextRunAt),
    lastRunAt: iso(row.lastRunAt),
    lastStatus: row.lastStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    humanReadable,
    upcoming,
    invalidReason,
    terminalState: terminalStateOf(row, now),
  };
}

/**
 * Distinguish the three ways a row can be `enabled = false, next_run_at = NULL`.
 *
 * A user toggle leaves `last_run_at` alone and a cron that has never matched has
 * never run, which separates "paused" from "never runs" for a fresh row. Where
 * that is ambiguous — a live schedule the user narrowed into unmatchability
 * after it had already run — we recompute `nextRun(...) === null` on a row the
 * user is already looking at. One cron call, cheaper than a column.
 */
function terminalStateOf(row: ScheduleRow, now: Date): ScheduleDTO["terminalState"] {
  if (row.enabled || row.nextRunAt) return null;
  if (row.kind === "once") return "once_consumed";
  if (!row.cronExpr) return "paused";
  try {
    if (nextRun(row.cronExpr, now, row.timezone) === null) return "never_runs";
  } catch {
    return "never_runs";
  }
  return "paused";
}

export interface SerializeRunOptions {
  tokens?: { input: number; output: number; total: number } | null;
}

export function serializeScheduleRun(
  row: ScheduleRunRow,
  opts: SerializeRunOptions = {},
): ScheduleRunDTO {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    scheduleName: row.scheduleName,
    runId: row.runId,
    scheduledFor: row.scheduledFor.toISOString(),
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    // Computed, not a column. Null unless BOTH ends are known — a run that
    // started and never finished has no duration, and rendering `now - started`
    // would show a "duration" that grows forever.
    durationMs:
      row.startedAt && row.finishedAt
        ? row.finishedAt.getTime() - row.startedAt.getTime()
        : null,
    status: row.status,
    skipReason: row.skipReason,
    summary: row.summary,
    errorCode: row.errorCode,
    trigger: row.trigger,
    attempt: row.attempt,
    nextAttemptAt: iso(row.nextAttemptAt),
    missedCount: row.missedCount,
    missedTruncated: row.missedTruncated,
    // Three-valued on purpose: null = not evaluated, false = ran and produced
    // nothing. Coercing null to false would put a "no output" badge on every
    // skipped run.
    expectationMet: row.expectationMet,
    source: row.source,
    tokens: opts.tokens ?? null,
  };
}

/** The opaque `(scheduled_for, id)` cursor of the run-history list. */
export function encodeRunCursor(scheduledFor: Date, id: string): string {
  return Buffer.from(`${scheduledFor.toISOString()}|${id}`, "utf8").toString("base64url");
}

export function decodeRunCursor(cursor: string): { scheduledFor: Date; id: string } | null {
  try {
    const [ts, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const d = new Date(ts);
    if (!id || Number.isNaN(d.getTime())) return null;
    return { scheduledFor: d, id };
  } catch {
    return null;
  }
}
