/**
 * A dependency-free 5-field cron engine with IANA time-zone support.
 *
 * ArkAgent schedules fire in the *user's* zone ("every weekday at 09:00 in
 * Asia/Shanghai"), not in UTC, so the whole engine reasons in local wall-clock
 * fields and converts to a UTC instant only at the very end. That ordering is
 * what makes DST correct: a daily 09:00 job must stay at 09:00 across a
 * transition, which is impossible if you store a fixed UTC offset.
 *
 * We write this instead of taking a dependency because the interesting part —
 * mapping a wall-clock time in a zone back to an instant — is ~40 lines on top
 * of `Intl.DateTimeFormat`, which the platform already ships with the full IANA
 * database. A cron package would still not answer the DST questions for us.
 *
 * Grammar (5 fields, space-separated): `minute hour day-of-month month day-of-week`
 *   *            every value
 *   n            a single value
 *   a-b          an inclusive range
 *   a-b/s, * /s  a step over a range (or the whole field)
 *   a,b,c        a list of any of the above
 *   ?            accepted as a synonym for `*` in the two day fields only
 *   names        JAN…DEC (month) and SUN…SAT (day-of-week), case-insensitive
 *   7 or 0       both mean Sunday
 *
 * Deliberately NOT supported (rejected at parse time with a clear message, so a
 * user never gets a schedule that silently means something else):
 *   @yearly/@daily-style macros — the UI composes expressions, it does not ask
 *     the user to type them, and `describe()` is friendlier than a macro.
 *   L, W, #, and seconds — Quartz extensions with no equivalent in Vixie cron,
 *     and each one multiplies the DST edge cases.
 *
 * Day-of-month vs day-of-week follows the Vixie/POSIX rule: when BOTH fields are
 * restricted the match is a UNION (either one qualifies), and when only one is
 * restricted it alone decides. This surprises people, so the schedule editor
 * warns when a user restricts both.
 *
 * DST POLICY — three decisions, each one visible in tests/cron.test.ts:
 *
 *  1. A wall clock the zone SKIPS (spring forward) fires at the instant the
 *     clock jumps to. A daily 02:30 job in America/New_York runs at 03:00 on
 *     transition day rather than not at all: a late digest is an inconvenience,
 *     a missing one is a support ticket.
 *  2. A wall clock the zone REPEATS (fall back) fires once, on the first pass —
 *     for expressions that name an hour. Sending the invoice twice is worse
 *     than sending it once.
 *  3. ...unless the expression is an INTERVAL (`* / 15 * * * *`, hour field
 *     unrestricted), in which case both passes fire, because an interval job is
 *     asking for a real-time cadence and would otherwise open a one-hour hole
 *     once a year. This is the same split Vixie cron makes between "fixed-time"
 *     and "wildcard" jobs.
 */

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** A parsed expression: one sorted, deduplicated value set per field. */
export interface CronFields {
  minute: number[]; // 0-59
  hour: number[]; // 0-23
  dayOfMonth: number[]; // 1-31
  month: number[]; // 1-12
  dayOfWeek: number[]; // 0-6, Sunday = 0
  /** True when the field was `*` or `?`, which the Vixie union rule needs. */
  domRestricted: boolean;
  dowRestricted: boolean;
}

export class CronParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CronParseError";
  }
}

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

interface FieldSpec {
  name: string;
  min: number;
  max: number;
  names?: string[];
  /** Offset added to a name index to get the numeric value (months are 1-based). */
  nameBase?: number;
}

const SPECS: FieldSpec[] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12, names: MONTH_NAMES, nameBase: 1 },
  { name: "day-of-week", min: 0, max: 7, names: DAY_NAMES, nameBase: 0 },
];

function parseValue(raw: string, spec: FieldSpec): number {
  const token = raw.trim().toLowerCase();
  if (spec.names) {
    const idx = spec.names.indexOf(token.slice(0, 3));
    if (idx >= 0) return idx + (spec.nameBase ?? 0);
  }
  if (!/^\d+$/.test(token)) {
    throw new CronParseError(`"${raw}" is not a valid ${spec.name} value`);
  }
  const n = Number(token);
  if (n < spec.min || n > spec.max) {
    throw new CronParseError(
      `${spec.name} value ${n} is out of range (${spec.min}-${spec.max})`,
    );
  }
  return n;
}

/** Expand one comma-separated field into its value set. */
function parseField(raw: string, spec: FieldSpec): { values: number[]; restricted: boolean } {
  const field = raw.trim();
  if (!field) throw new CronParseError(`${spec.name} is empty`);

  const out = new Set<number>();
  let restricted = false;

  for (const part of field.split(",")) {
    const piece = part.trim();
    if (!piece) throw new CronParseError(`${spec.name} has an empty list entry`);

    // Split off an optional step.
    const [rangePart, stepPart, ...extra] = piece.split("/");
    if (extra.length) throw new CronParseError(`${spec.name} has more than one "/" in "${piece}"`);

    let step = 1;
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart.trim())) {
        throw new CronParseError(`${spec.name} step "${stepPart}" is not a number`);
      }
      step = Number(stepPart.trim());
      if (step < 1) throw new CronParseError(`${spec.name} step must be at least 1`);
    }

    let lo: number;
    let hi: number;
    const range = rangePart.trim();
    if (range === "*" || range === "?") {
      // `?` is only meaningful in the two day fields; elsewhere it is a typo we
      // should not quietly accept as "every value".
      if (range === "?" && spec.name !== "day-of-month" && spec.name !== "day-of-week") {
        throw new CronParseError(`"?" is only allowed in the day fields, not ${spec.name}`);
      }
      lo = spec.min;
      hi = spec.max;
      // `*` alone is not a restriction — but `*/2` is. The two day fields
      // combine through the Vixie union rule, which consults `restricted` and
      // NOT the value set, so leaving this false made `0 0 */2 * *` match every
      // day: the parsed [1,3,5,…] was computed correctly and then ignored.
      // `*/1` is genuinely equivalent to `*`, so only a real step counts.
      if (step > 1) restricted = true;
    } else if (range.includes("-")) {
      const [a, b, ...rest] = range.split("-");
      if (rest.length) throw new CronParseError(`${spec.name} range "${range}" is malformed`);
      lo = parseValue(a, spec);
      hi = parseValue(b, spec);
      if (lo > hi) {
        // Wrapping ranges (fri-mon) are a Quartz extension; rejecting is kinder
        // than silently producing an empty set.
        throw new CronParseError(
          `${spec.name} range ${a}-${b} runs backwards; write it as two entries instead`,
        );
      }
      restricted = true;
    } else {
      lo = parseValue(range, spec);
      hi = stepPart === undefined ? lo : spec.max; // `5/10` means "from 5, step 10"
      restricted = true;
    }

    for (let v = lo; v <= hi; v += step) out.add(v);
  }

  let values = [...out].sort((a, b) => a - b);
  // Day-of-week accepts 7 for Sunday; fold it onto 0 so matching is uniform.
  if (spec.name === "day-of-week") {
    values = [...new Set(values.map((v) => (v === 7 ? 0 : v)))].sort((a, b) => a - b);
  }
  if (!values.length) throw new CronParseError(`${spec.name} matches no values`);
  return { values, restricted };
}

/** Parse a 5-field cron expression. Throws `CronParseError` on anything invalid. */
export function parseCron(expression: string): CronFields {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new CronParseError(
      `Expected 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`,
    );
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields.map((f, i) => parseField(f, SPECS[i]));
  return {
    minute: minute.values,
    hour: hour.values,
    dayOfMonth: dayOfMonth.values,
    month: month.values,
    dayOfWeek: dayOfWeek.values,
    domRestricted: dayOfMonth.restricted,
    dowRestricted: dayOfWeek.restricted,
  };
}

/** True when `expression` parses. Never throws — for form validation. */
export function isValidCron(expression: string): boolean {
  try {
    parseCron(expression);
    return true;
  } catch {
    return false;
  }
}

/** The parse error message, or null when the expression is valid. */
export function cronError(expression: string): string | null {
  try {
    parseCron(expression);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid expression";
  }
}

// ---------------------------------------------------------------------------
// Time-zone plumbing
// ---------------------------------------------------------------------------

/** A wall-clock reading with no zone attached. `month` is 1-based. */
export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone);
  if (!fmt) {
    // `en-US` with explicit 2-digit numeric parts and hourCycle h23 keeps the
    // output locale-independent — a locale that formats hour 0 as "24" would
    // otherwise shift every midnight job by a day.
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Throws a `RangeError` if `timeZone` is not a zone this runtime knows. */
export function assertTimeZone(timeZone: string): void {
  partsFormatter(timeZone).format(new Date(0));
}

/** True when `timeZone` is a valid IANA zone. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    assertTimeZone(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Read the wall-clock fields an instant shows in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string): LocalParts & { second: number } {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: string): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** The zone's UTC offset in minutes at `instant` (east of Greenwich is positive). */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Round: sub-second drift is impossible here, but the division makes intent clear.
  return Math.round((asUTC - instant.getTime()) / 60_000);
}

/**
 * What happened when we tried to place a wall-clock time in a zone.
 *
 *  - `exact`      the time exists once (the overwhelmingly common case)
 *  - `ambiguous`  the clock repeated it (fall back); `instant` is the FIRST
 *                 occurrence, because a cron job must fire once, and firing at
 *                 the first pass is what every other scheduler does
 *  - `gap`        the clock skipped it (spring forward); `instant` is the
 *                 moment the clock jumped to, so a 02:30 daily job fires at
 *                 03:00 rather than silently not running that day. Skipping is
 *                 the other defensible policy; we chose "fire late" because a
 *                 missed daily digest is a support ticket and a 30-minute-late
 *                 one is not.
 */
export interface Resolution {
  kind: "exact" | "ambiguous" | "gap";
  instant: Date;
}

const DAY_MS = 86_400_000;

/** Place a wall-clock reading into `timeZone`, resolving DST edges explicitly. */
export function resolveLocal(local: LocalParts, timeZone: string): Resolution {
  const wall = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0);

  // Collect every UTC offset that could plausibly apply to this wall clock by
  // probing a day either side of it. A fixed-point iteration from the naive
  // instant is NOT enough: it converges to whichever side of the transition the
  // first guess happened to land on, which silently returns the *second*
  // occurrence of an ambiguous time and reports it as unambiguous. Sampling
  // both sides is the only way to learn that two answers exist. One day of
  // slack is ample — no zone shifts twice within a day, and no shift exceeds
  // a couple of hours.
  const offsets = new Set<number>();
  for (const probe of [-DAY_MS, 0, DAY_MS]) {
    offsets.add(offsetMinutes(new Date(wall + probe), timeZone));
  }

  const shows = (t: number): boolean => {
    const p = zonedParts(new Date(t), timeZone);
    return (
      p.year === local.year &&
      p.month === local.month &&
      p.day === local.day &&
      p.hour === local.hour &&
      p.minute === local.minute
    );
  };

  const candidates = [...offsets].map((off) => wall - off * 60_000).sort((a, b) => a - b);
  const hits = [...new Set(candidates.filter(shows))];

  if (hits.length === 1) return { kind: "exact", instant: new Date(hits[0]) };
  if (hits.length > 1) return { kind: "ambiguous", instant: new Date(hits[0]) };

  // No candidate renders the requested wall clock, so the clock skipped it.
  // Bisect between the outermost candidates for the exact minute the offset
  // changes: that instant is the first one the clock shows after the gap.
  return {
    kind: "gap",
    instant: new Date(transitionAfter(candidates[0], candidates[candidates.length - 1], timeZone)),
  };
}

/**
 * Binary-search the exact minute at which the offset changes between two
 * instants known to sit on opposite sides of a transition. Returns the first
 * instant (minute resolution) that carries the later offset — the moment the
 * wall clock jumps.
 */
function transitionAfter(loMs: number, hiMs: number, timeZone: string): number {
  const loOff = offsetMinutes(new Date(loMs), timeZone);
  let lo = loMs;
  let hi = hiMs;
  while (hi - lo > 60_000) {
    const mid = lo + Math.floor((hi - lo) / 2 / 60_000) * 60_000;
    if (mid === lo) break;
    if (offsetMinutes(new Date(mid), timeZone) === loOff) lo = mid;
    else hi = mid;
  }
  return hi;
}

// ---------------------------------------------------------------------------
// Calendar arithmetic on LocalParts
// ---------------------------------------------------------------------------

/**
 * Normalize a possibly out-of-range wall-clock reading (day 32, hour 24, …).
 * `Date.UTC` is used purely as a proleptic-Gregorian calculator here — no zone
 * is implied, which is the whole reason this is safe.
 */
function normalize(p: LocalParts): LocalParts {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** Day of week (0 = Sunday) for a wall-clock date — zone-independent. */
function weekdayOf(p: LocalParts): number {
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** Does this calendar date satisfy the Vixie day-of-month / day-of-week rule? */
function dayMatches(p: LocalParts, f: CronFields): boolean {
  const domHit = f.dayOfMonth.includes(p.day);
  const dowHit = f.dayOfWeek.includes(weekdayOf(p));
  if (f.domRestricted && f.dowRestricted) return domHit || dowHit;
  if (f.domRestricted) return domHit;
  if (f.dowRestricted) return dowHit;
  return true;
}

/** The smallest value in `set` that is >= `from`, or null when none is. */
function ceilIn(set: number[], from: number): number | null {
  for (const v of set) if (v >= from) return v;
  return null;
}

/** Does this complete wall-clock reading satisfy every field? */
function matchesLocal(p: LocalParts, f: CronFields): boolean {
  return (
    f.minute.includes(p.minute) &&
    f.hour.includes(p.hour) &&
    f.month.includes(p.month) &&
    dayMatches(p, f)
  );
}

/**
 * Whether this expression describes an INTERVAL ("every 15 minutes") rather
 * than a WALL-CLOCK TIME ("09:00 on weekdays"). An unrestricted hour field is
 * the discriminator, and it decides what happens during a fall-back transition:
 * an interval job wants to keep its real-time cadence and so fires on both
 * passes of the repeated hour, while a wall-clock job must fire exactly once —
 * sending the daily invoice twice is a far worse failure than sending it late.
 * This is the same split Vixie cron makes.
 */
function isIntervalLike(f: CronFields): boolean {
  return f.hour.length === 24;
}

/**
 * For an interval expression, the first instant in `(afterMs, limitMs)` that
 * falls in a REPLAYED wall-clock window — the occurrences the wall-clock walk
 * below structurally cannot reach, because it only ever moves the clock
 * forward. Returns null when no fall-back transition lies in the window.
 */
function repeatedRun(
  f: CronFields,
  afterMs: number,
  limitMs: number,
  timeZone: string,
): number | null {
  // A transition more than a day out cannot be replaying anything we are about
  // to miss, and bounding the probe keeps this cheap for sparse expressions.
  const windowEnd = Math.min(limitMs, afterMs + 26 * 3_600_000);
  if (windowEnd <= afterMs) return null;

  // The probe starts BEFORE `after`, not at it. Callers iterate — nextRuns and
  // the misfire sweep feed each result back in as the next `after` — so `after`
  // is routinely already inside the replayed window. Probing from there reads
  // the same post-transition offset at both ends, concludes no transition
  // exists, and drops every replayed occurrence except the first: `*/30` in
  // Europe/London fired 01:00 GMT and then skipped 01:30 GMT entirely. No zone
  // has ever shifted by more than two hours at once, so one hour of slack past
  // that is enough to see over any replayed window we could be standing in.
  const probeStart = afterMs - 3 * 3_600_000;
  const offStart = offsetMinutes(new Date(probeStart), timeZone);
  const offEnd = offsetMinutes(new Date(windowEnd), timeZone);
  // Equal offsets: no transition. A larger end offset: the clock jumped
  // forward, which skips wall time rather than replaying it.
  if (offEnd >= offStart) return null;

  const transition = transitionAfter(probeStart, windowEnd, timeZone);
  const replayed = offStart - offEnd; // minutes of wall clock shown a second time
  for (let m = 0; m < replayed; m++) {
    const instant = transition + m * 60_000;
    if (instant <= afterMs || instant >= limitMs) continue;
    if (matchesLocal(zonedParts(new Date(instant), timeZone), f)) return instant;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Next-run computation
// ---------------------------------------------------------------------------

/**
 * Bound on the field-level search. A schedule such as `0 0 30 2 *` (30 February)
 * never matches; without a bound the loop would run forever. Four years of days
 * covers every legitimate expression including 29 February, with slack.
 */
const MAX_STEPS = 4 * 366 * 24;

export interface NextRunOptions {
  /** IANA zone the expression is written in. Defaults to UTC. */
  timeZone?: string;
  /**
   * Ignore occurrences at or before this instant. Defaults to `after`, so the
   * result is always strictly later than the instant you asked from.
   */
  after?: Date;
}

/**
 * The first instant strictly after `after` at which `expression` fires in
 * `timeZone`, or null when it never fires again inside the search bound.
 *
 * Resolution is one minute: `after` is rounded up to the next whole minute
 * before searching, which is also what makes the function idempotent when it is
 * fed its own previous result.
 */
export function nextRun(
  expression: string,
  after: Date,
  timeZone = "UTC",
): Date | null {
  const fields = parseCron(expression);
  return nextRunParsed(fields, after, timeZone);
}

/** `nextRun` for an already-parsed expression — use this in loops. */
export function nextRunParsed(
  fields: CronFields,
  after: Date,
  timeZone = "UTC",
): Date | null {
  assertTimeZone(timeZone);
  const afterMs = after.getTime();
  if (!Number.isFinite(afterMs)) return null;

  // Start one minute past `after` in local terms, seconds discarded.
  const start = zonedParts(new Date(afterMs), timeZone);
  let cur: LocalParts = normalize({
    year: start.year,
    month: start.month,
    day: start.day,
    hour: start.hour,
    minute: start.minute + 1,
  });

  for (let step = 0; step < MAX_STEPS; step++) {
    // ---- month ----
    const month = ceilIn(fields.month, cur.month);
    if (month === null) {
      cur = normalize({ year: cur.year + 1, month: 1, day: 1, hour: 0, minute: 0 });
      continue;
    }
    if (month !== cur.month) {
      cur = normalize({ year: cur.year, month, day: 1, hour: 0, minute: 0 });
      continue;
    }

    // ---- day (dom / dow union) ----
    if (!dayMatches(cur, fields)) {
      cur = normalize({ ...cur, day: cur.day + 1, hour: 0, minute: 0 });
      continue;
    }

    // ---- hour ----
    const hour = ceilIn(fields.hour, cur.hour);
    if (hour === null) {
      cur = normalize({ ...cur, day: cur.day + 1, hour: 0, minute: 0 });
      continue;
    }
    if (hour !== cur.hour) {
      cur = normalize({ ...cur, hour, minute: 0 });
      continue;
    }

    // ---- minute ----
    const minute = ceilIn(fields.minute, cur.minute);
    if (minute === null) {
      cur = normalize({ ...cur, hour: cur.hour + 1, minute: 0 });
      continue;
    }
    if (minute !== cur.minute) {
      cur = normalize({ ...cur, minute });
      continue;
    }

    // Every field matches — turn the wall clock into an instant.
    const res = resolveLocal(cur, timeZone);
    if (res.instant.getTime() > afterMs) {
      // The walk above only ever moves the clock forward, so it cannot see the
      // second pass of a replayed hour. For an interval expression that second
      // pass is a legitimate earlier fire, and skipping it would leave a
      // once-a-year hole in the cadence.
      if (isIntervalLike(fields)) {
        const replay = repeatedRun(fields, afterMs, res.instant.getTime(), timeZone);
        if (replay !== null) return new Date(replay);
      }
      return res.instant;
    }
    // An ambiguous wall clock can resolve to an instant we have already passed
    // (we return the first pass, and the caller then asks from it); step over
    // it rather than returning the past.
    cur = normalize({ ...cur, minute: cur.minute + 1 });
  }
  return null;
}

/** The next `count` fire instants, ascending. Used by the "next runs" preview. */
export function nextRuns(
  expression: string,
  after: Date,
  timeZone = "UTC",
  count = 5,
): Date[] {
  const fields = parseCron(expression);
  const out: Date[] = [];
  let cursor = after;
  for (let i = 0; i < count; i++) {
    const next = nextRunParsed(fields, cursor, timeZone);
    if (!next) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

/**
 * Every fire instant in `[from, to)` — how the misfire sweep finds runs that
 * were due while the scheduler was down. Capped so a per-minute expression over
 * a long outage cannot exhaust memory; the caller treats a truncated list as
 * "collapse to one catch-up run".
 */
export function runsBetween(
  expression: string,
  from: Date,
  to: Date,
  timeZone = "UTC",
  limit = 500,
): { runs: Date[]; truncated: boolean } {
  const fields = parseCron(expression);
  const runs: Date[] = [];
  let cursor = from;
  while (runs.length < limit) {
    const next = nextRunParsed(fields, cursor, timeZone);
    if (!next || next.getTime() >= to.getTime()) return { runs, truncated: false };
    runs.push(next);
    cursor = next;
  }
  return { runs, truncated: true };
}
