/**
 * The scheduler's pure arithmetic: what fires next, what a phrase becomes on
 * disk, how much an outage swallowed, and how many times a day an expression
 * fires. Every function here is a total function of its arguments — no clock, no
 * environment, no database — which is what lets the editor preview and the tick
 * run the same code and reach the same answer.
 *
 * All of it builds on `lib/schedule/cron.ts`, which is finished, tested and
 * normative. Nothing here re-derives a cron behaviour; it composes them.
 *
 * docs/REMINDERS_AND_SCHEDULERS.md §3.4, §3.6, §3.7, §3.9, §6.3.
 */

import {
  nextRunParsed,
  parseCron,
  resolveLocal,
  runsBetween,
  zonedParts,
  type CronFields,
  type LocalParts,
  type Resolution,
} from "@/lib/schedule/cron";
import type { ParsedSchedule } from "@/lib/schedule/parse";
import { SCHEDULE_LIMITS, isEvenStep, stepNeighbours } from "./limits";

// ---------------------------------------------------------------------------
// Advancing next_run_at
// ---------------------------------------------------------------------------

export interface AdvanceInput {
  kind: "cron" | "interval" | "once";
  cronExpr: string | null;
  intervalSeconds: number | null;
  timezone: string;
}

export interface AdvanceResult {
  /** null ⇒ this schedule has no future. `enabled` is then false, per §1.3. */
  nextRunAt: Date | null;
  enabled: boolean;
  /** Set when nextRunAt is null. Surfaces in the UI as onceConsumed / neverRuns. */
  reason?: "once_consumed" | "never_matches";
}

/**
 * The next instant after `anchor`, clamped forward past `now`.
 *
 * `anchor`, not `scheduledFor`, because §3.9 passes three different things:
 * `scheduledFor` on the healthy path, the newest missed occurrence after a
 * bounded misfire, and `now` after a truncated one. Anchoring to the instant
 * that fired (rather than to `now`) means the sequence we walk is exactly the
 * sequence the cron defines, so a tick that ran 90 seconds late does not
 * silently delete the occurrence in between — the misfire policy decides that,
 * explicitly, where the user's `catch_up` flag can reach it.
 *
 * Cost is bounded at TWO nextRunParsed calls, always. That is the whole reason
 * the fallback re-anchors to `now` instead of stepping: `*​/1` after a 28-day
 * outage is ~40,000 occurrences, and each call can itself walk months of
 * wall-clock minutes inside a 60-second function holding 200 claims.
 */
export function advanceSchedule(s: AdvanceInput, anchor: Date, now: Date): AdvanceResult {
  // A one-off is consumed the moment it is claimed, not when it succeeds — a
  // reminder whose dispatch crashed must not be re-sent by the next tick. §3.7.
  if (s.kind === "once") return { nextRunAt: null, enabled: false, reason: "once_consumed" };

  if (s.kind === "interval") {
    // Start-anchored, not end-anchored (§3.6 ii): an end-anchored instant is
    // only knowable after the run ends, which makes `scheduled_for`
    // un-pre-computable and destroys the unique index that IS exactly-once.
    const step = Math.max(1, s.intervalSeconds ?? 60) * 1000;
    let t = anchor.getTime() + step;
    if (t <= now.getTime()) {
      // Jump whole intervals rather than looping. FLOOR + 1, not CEIL: with
      // ceil, an exact multiple lands `t` on `now` itself, which still
      // satisfies `next_run_at <= now()` and re-fires on the very next tick.
      const behind = Math.floor((now.getTime() - t) / step) + 1;
      t += behind * step;
    }
    return { nextRunAt: new Date(t), enabled: true };
  }

  if (!s.cronExpr) return { nextRunAt: null, enabled: false, reason: "never_matches" };
  let fields: CronFields;
  try {
    fields = parseCron(s.cronExpr);
  } catch {
    // Only reachable for a row edited into invalidity by direct SQL; the write
    // path refuses it. Treat it as unmatchable rather than throwing inside a
    // tick that is holding a claim on 199 other schedules.
    return { nextRunAt: null, enabled: false, reason: "never_matches" };
  }
  let next = nextRunParsed(fields, anchor, s.timezone);
  if (!next) return { nextRunAt: null, enabled: false, reason: "never_matches" };
  if (next.getTime() <= now.getTime()) next = nextRunParsed(fields, now, s.timezone);
  return next
    ? { nextRunAt: next, enabled: true }
    : { nextRunAt: null, enabled: false, reason: "never_matches" };
}

// ---------------------------------------------------------------------------
// A parse result -> a writable row
// ---------------------------------------------------------------------------

export type ScheduleWriteShape =
  | { kind: "cron"; cronExpr: string; runAt: null; intervalSeconds: null }
  | { kind: "once"; cronExpr: null; runAt: Date; intervalSeconds: null };

export interface MaterializeResult {
  shape: ScheduleWriteShape;
  /** From resolveLocal. "gap" / "ambiguous" drive the amber DST note (§5.3). */
  resolution?: Resolution["kind"];
}

/**
 * The ONLY conversion from a parse result to a writable row.
 *
 * `ParsedSchedule.cron` for a one-off is a TIME-OF-DAY CARRIER — `0 9 30 8 *`
 * means "09:00 on 30 August", not "every 30 August forever". Writing it to
 * `cron_expr` is the annual-reminder bug §3.7 exists to close, so a `once` row
 * carries `run_at` and a NULL `cron_expr`, which the C6 shape CHECK enforces.
 */
export function materializeParsed(p: ParsedSchedule, timeZone: string): MaterializeResult {
  if (p.kind === "recurring") {
    return { shape: { kind: "cron", cronExpr: p.cron, runAt: null, intervalSeconds: null } };
  }
  if (!p.onDate) throw new Error("one_off without onDate");
  const [year, month, day] = p.onDate.split("-").map(Number);
  const f = parseCron(p.cron);
  const res = resolveLocal({ year, month, day, hour: f.hour[0], minute: f.minute[0] }, timeZone);
  return {
    shape: { kind: "once", cronExpr: null, runAt: res.instant, intervalSeconds: null },
    resolution: res.kind,
  };
}

// ---------------------------------------------------------------------------
// Even steps (§3.6 iii)
// ---------------------------------------------------------------------------

export interface UnevenStep {
  unit: "minute" | "hour";
  step: number;
  below: number | null;
  above: number | null;
}

/**
 * Detect a `*​/N` step that does not divide its field.
 *
 * `*​/7` fires :00 :07 … :56 and then waits four minutes; `*​/25` fires three
 * times an hour at 25- then 10-minute gaps. Both are legal cron, both parse,
 * and both mean something other than what the user typed. This is the check
 * `describe.ts`'s `stepOf` already implies — mirrored here rather than exported
 * from there, because that module owns rendering, not validation.
 *
 * Returns null when the expression is fine (including when it uses no step).
 */
export function unevenStep(expression: string): UnevenStep | null {
  let f: CronFields;
  try {
    f = parseCron(expression);
  } catch {
    return null; // an invalid expression is `invalid_cron`, a different error
  }
  const check = (values: number[], size: number, unit: "minute" | "hour"): UnevenStep | null => {
    // A step is only what the user typed if the set starts at 0 and is evenly
    // spaced. A hand-written list like `0,7,23` is not a step and is left alone.
    if (values.length < 2 || values[0] !== 0) return null;
    const step = values[1];
    for (let i = 0; i < values.length; i++) if (values[i] !== i * step) return null;
    // CEIL, not `length * step === size`. An UNEVEN step is by definition one
    // whose multiples do not land on the field width — `*​/7` produces nine
    // values ending at 56, and `9 * 7 = 63` is not 60 — so the exact-product
    // test rejects precisely the expressions this function exists to catch and
    // returns null for every input. (describe.ts's `stepOf` uses the exact
    // product deliberately: it renders "every N minutes" only for EVEN steps.
    // Mirroring its predicate here inverted this one's meaning.)
    if (values.length !== Math.ceil(size / step)) return null; // not a whole-field step
    if (isEvenStep(step, unit)) return null;
    return { unit, step, ...stepNeighbours(step, unit) };
  };
  return check(f.minute, 60, "minute") ?? check(f.hour, 24, "hour");
}

// ---------------------------------------------------------------------------
// The daily-fire ceiling (§6.3)
// ---------------------------------------------------------------------------

function nextCalendarDay(p: LocalParts): LocalParts {
  // Date arithmetic on the CIVIL calendar, deliberately: adding 86_400_000 ms to
  // an instant lands on the wrong civil day whenever the zone changes offset.
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: 0,
    minute: 0,
  };
}

/**
 * How many times `cronExpr` fires on the local day containing `day`.
 *
 * Both bounds come from `resolveLocal`, never from `+86_400_000`: a DST day is
 * 23 or 25 hours long, and a fixed 24 h either clips an hour of fires or counts
 * an hour of the next day's.
 *
 * `runsBetween` is OPEN at `from`, so an occurrence AT local midnight would be
 * excluded — `*​/5` counts 287 instead of 288 and `0 0 * * *` counts 0 instead
 * of 1, which silently under-reports every daily digest set to 00:00. Starting
 * one minute BEFORE midnight puts it back without admitting 23:59, because
 * nextRunParsed rounds up to the next whole minute past `from`.
 *
 * Bounded at 289 steps, so this costs microseconds even for `* * * * *`.
 */
export function dailyFireCount(
  cronExpr: string,
  timezone: string,
  day: Date,
): { count: number; truncated: boolean } {
  const p = zonedParts(day, timezone);
  const midnight = resolveLocal({ ...p, hour: 0, minute: 0 }, timezone).instant;
  const nextMid = resolveLocal(nextCalendarDay(p), timezone).instant;
  const from = new Date(midnight.getTime() - 60_000);
  const { runs, truncated } = runsBetween(
    cronExpr,
    from,
    nextMid,
    timezone,
    SCHEDULE_LIMITS.HARD_MAX_RUNS_PER_DAY + 1,
  );
  return { count: runs.length, truncated };
}

/**
 * The finest gap any of these expressions needs, in seconds — the denominator of
 * the "is the platform tick coarse enough to matter?" banner (§3.1, §3.8.2).
 * Uses the same bounded 24-hour window as `dailyFireCount`, so it costs nothing
 * a create already pays.
 */
export function finestGapSeconds(
  schedules: { cronExpr: string | null; timezone: string }[],
  day: Date,
): number | null {
  let finest: number | null = null;
  for (const s of schedules) {
    if (!s.cronExpr) continue;
    let runs: Date[];
    try {
      const p = zonedParts(day, s.timezone);
      const midnight = resolveLocal({ ...p, hour: 0, minute: 0 }, s.timezone).instant;
      const nextMid = resolveLocal(nextCalendarDay(p), s.timezone).instant;
      runs = runsBetween(
        s.cronExpr,
        midnight,
        nextMid,
        s.timezone,
        SCHEDULE_LIMITS.HARD_MAX_RUNS_PER_DAY + 1,
      ).runs;
    } catch {
      continue;
    }
    for (let i = 1; i < runs.length; i++) {
      const gap = (runs[i].getTime() - runs[i - 1].getTime()) / 1000;
      if (finest === null || gap < finest) finest = gap;
    }
    // A once-a-day expression has one run and no gap; 24 h is its real need.
    if (runs.length === 1 && (finest === null || finest > 86_400)) finest = 86_400;
  }
  return finest;
}

/** Median gap between consecutive tick start instants, newest-first input. */
export function medianTickSeconds(startedAt: Date[]): number | null {
  if (startedAt.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < startedAt.length; i++) {
    const g = (startedAt[i - 1].getTime() - startedAt[i].getTime()) / 1000;
    if (g > 0) gaps.push(g);
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  return gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
}

// ---------------------------------------------------------------------------
// Misfire (§3.9)
// ---------------------------------------------------------------------------

export type MisfireBand = "on_time" | "misfired" | "too_old";

export interface MisfireInput {
  cronExpr: string | null;
  timezone: string;
  scheduledFor: Date;
  now: Date;
  /** Applied at dispatch, never to next_run_at (§3.4.4). 0 for every schedule by default. */
  jitterOffsetSeconds: number;
  graceSeconds: number;
  maxAgeSeconds: number;
}

export interface MisfireResult {
  band: MisfireBand;
  latenessSeconds: number;
  /** `scheduledFor` itself plus everything runsBetween found after it. */
  missedCount: number;
  missedTruncated: boolean;
  /** What `advanceSchedule` must be anchored to. */
  anchor: Date;
}

/**
 * Classify how late this occurrence is and how much the outage swallowed.
 *
 * The 120-second grace exists because a one-minute platform tick plus a queued
 * function plus clock skew routinely produces 30-90 seconds of lateness on a
 * perfectly healthy system; treating that as a misfire would put a "3 missed"
 * badge on every normal run. The 24-hour ceiling exists because a catch-up is
 * only useful while the work is still wanted — a three-week-old "post the daily
 * digest" firing on restore is noisy, confusing and occasionally expensive.
 *
 * `truncated` does TWO jobs and they are different: it changes the SENTENCE
 * ("at least 501" rather than "501") and it changes the ANCHOR. Only the first
 * is obvious. `runs.at(-1)` after a 28-day per-minute outage is merely the 500th
 * missed occurrence and is still ~39,800 behind `now`, so anchoring there makes
 * the advance walk the rest.
 */
export function classifyMisfire(input: MisfireInput): MisfireResult {
  const dispatchAfter = input.scheduledFor.getTime() + input.jitterOffsetSeconds * 1000;
  const latenessSeconds = Math.max(0, Math.round((input.now.getTime() - dispatchAfter) / 1000));

  if (latenessSeconds <= input.graceSeconds) {
    return {
      band: "on_time",
      latenessSeconds,
      missedCount: 0,
      missedTruncated: false,
      anchor: input.scheduledFor,
    };
  }

  const band: MisfireBand = latenessSeconds > input.maxAgeSeconds ? "too_old" : "misfired";

  // A `once` (no cron) missed exactly itself; there is no sequence to walk.
  if (!input.cronExpr) {
    return {
      band,
      latenessSeconds,
      missedCount: 1,
      missedTruncated: false,
      anchor: input.scheduledFor,
    };
  }

  let runs: Date[] = [];
  let truncated = false;
  try {
    ({ runs, truncated } = runsBetween(
      input.cronExpr,
      input.scheduledFor,
      input.now,
      input.timezone,
      500,
    ));
  } catch {
    /* an unparseable expression is handled by advanceSchedule; count only self */
  }
  return {
    band,
    latenessSeconds,
    missedCount: 1 + runs.length,
    missedTruncated: truncated,
    anchor: truncated ? input.now : (runs.at(-1) ?? input.scheduledFor),
  };
}

/**
 * A stable per-occurrence offset in [0, jitterSeconds]. Deterministic on
 * (scheduleId, scheduledFor) so two ticks that both look at the same occurrence
 * compute the same delay — a random() here would make the deferral flap.
 */
export function jitterOffsetSeconds(
  scheduleId: string,
  scheduledFor: Date,
  jitterSeconds: number,
): number {
  if (jitterSeconds <= 0) return 0;
  const key = `${scheduleId}:${scheduledFor.getTime()}`;
  // FNV-1a, 32-bit. Not a security hash — it only has to spread a fleet.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % (jitterSeconds + 1);
}
