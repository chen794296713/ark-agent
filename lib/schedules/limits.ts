/**
 * Every number the scheduler argues about, in one place.
 *
 * Split in two on purpose, along the line `lib/schedule/**` already draws
 * (docs/REMINDERS_AND_SCHEDULERS.md §6): this file is PURE and client-safe, so
 * the editor can render the step picker and the ceiling line from the same
 * constants the API enforces. Nothing here may read `process.env` — a module the
 * editor imports on every keystroke cannot touch the server environment.
 *
 * The tick's operational knobs live in `SCHEDULER` at the bottom of
 * `lib/services/schedules.ts`, which is `server-only` and env-backed.
 */

export const SCHEDULE_LIMITS = {
  /** Enabled rows per agent. ATG proposes 0-8; a human adds a handful. §6.1. */
  MAX_ENABLED_PER_AGENT: 20,
  /** Total rows per agent. Higher than the enabled cap because disable is not delete. */
  MAX_ROWS_PER_AGENT: 50,
  /** Stops one tenant monopolising the claim batch. §6.1. */
  MAX_ENABLED_PER_WORKSPACE: 200,
  /**
   * API default: every 15 minutes. The DDL default stays 288 for rows already
   * written. 288 is exactly the runaway (`*​/5` every day of the month), so a
   * "circuit breaker" set there breaks nothing — §6.5 brake 1.
   */
  DEFAULT_MAX_RUNS_PER_DAY: 96,
  /** The C6 CHECK ceiling. 86400/288 = 300s, which IS the 5-minute floor (§6.2). */
  HARD_MAX_RUNS_PER_DAY: 288,
  /** `expectation` is varchar(280). */
  MAX_EXPECTATION_CHARS: 280,
  /** A scheduling phrase is short; the cap is also the cheapest anti-LLM-proxy defence. */
  MAX_PHRASE_CHARS: 200,
  /** Model calls per workspace per minute on the preview route (§4.4). */
  PARSE_RATE_PER_MINUTE: 20,
  // Written as line comments, not JSDoc: a step expression contains the two
  // characters that close a JSDoc block, and pasting one truncates the comment.
  // The only steps that produce an even cadence — mirrors describe.ts stepOf(),
  // which requires size % step === 0 AND values.length === size / step.
  MINUTE_STEPS: [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30],
  HOUR_STEPS: [1, 2, 3, 4, 6, 8, 12],
} as const;

/**
 * `MIN_INTERVAL_SECONDS` is deliberately absent: §6.2 derives the 5-minute floor
 * from HARD_MAX_RUNS_PER_DAY and nothing reads a second copy. A constant no code
 * path consults is a number that drifts.
 */
export const MIN_INTERVAL_SECONDS = 86_400 / SCHEDULE_LIMITS.HARD_MAX_RUNS_PER_DAY;

/**
 * The two admissible neighbours of an uneven step, for the CONFIRM band's
 * choice pair (§4.3 band B) and for the `interval_not_representable` message.
 * Returns the largest admissible step below `n` and the smallest above it;
 * either may be null at the ends of the list.
 */
export function stepNeighbours(
  n: number,
  unit: "minute" | "hour",
): { below: number | null; above: number | null } {
  const steps: readonly number[] =
    unit === "minute" ? SCHEDULE_LIMITS.MINUTE_STEPS : SCHEDULE_LIMITS.HOUR_STEPS;
  let below: number | null = null;
  let above: number | null = null;
  for (const s of steps) {
    if (s < n) below = s;
    else if (s > n && above === null) above = s;
  }
  return { below, above };
}

export function isEvenStep(n: number, unit: "minute" | "hour"): boolean {
  const steps: readonly number[] =
    unit === "minute" ? SCHEDULE_LIMITS.MINUTE_STEPS : SCHEDULE_LIMITS.HOUR_STEPS;
  return steps.includes(n);
}
