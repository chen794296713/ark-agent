/**
 * Natural language -> a schedule, in a fixed order: deterministic FIRST, the
 * model only as an exception, and a hard fallback so the editor always has
 * something to open the cron form with.
 *
 * The ordering is not a fallback chain, it is a policy (§4.1):
 *  - `parseSchedulePhrase` is free, instant and pure, so the editor re-runs it
 *    on every keystroke. A model round trip cannot.
 *  - It is predictable — the same phrase gives the same cron next month, which
 *    is what makes the schedule tests assertions rather than approximations.
 *  - It already covers en / zh / zht / ja natively.
 *  - It works with OPENROUTER_API_KEY unset, which is this project's hard
 *    requirement for every AI feature.
 *
 * **A model result never overrides a deterministic one.** The model is asked
 * when the deterministic parser returns `null`, and — because a below-floor
 * parse is a guess the user must confirm anyway — as a SECOND OPINION when the
 * deterministic confidence is under `CONFIDENCE_FLOOR`. In that second case the
 * deterministic answer stays primary and the model's differing reading is
 * offered beside it as `alternative`. A model that can silently replace a
 * high-confidence deterministic parse is a model that makes the product's
 * behaviour untestable.
 *
 * This module is PURE and client-safe. The actual HTTP call to OpenRouter is
 * injected as `askModel` by the server route, so nothing here reads an env var.
 */

import { CONFIDENCE_FLOOR, extractTime, parseSchedulePhrase } from "@/lib/schedule/parse";
import { isValidCron } from "@/lib/schedule/cron";
import { unevenStep, type UnevenStep } from "./plan";

export type ScheduleBand = "accept" | "confirm" | "none";
export type PhraseSource = "deterministic" | "llm" | "fallback";

export interface PhraseCandidate {
  kind: "recurring" | "one_off";
  cron: string;
  onDate: string | null;
  matched: string;
  confidence: number;
  source: PhraseSource;
}

export interface ResolvedPhrase {
  /** The reading to show. Null only when the model and the parser both declined. */
  parsed: PhraseCandidate | null;
  band: ScheduleBand;
  /** A differing second opinion, offered beside `parsed`, never instead of it. */
  alternative: PhraseCandidate | null;
  /**
   * Always present. What the cron form opens seeded with, including in band
   * `none` — "I couldn't read that" is still a screen the user has to act on,
   * and an empty cron field is a worse starting point than `0 9 * * *`.
   */
  seed: PhraseCandidate;
  /** Non-null when the accepted cron uses a step that does not divide its field. */
  unevenStep: UnevenStep | null;
  /** The phrase named no time of day, so 09:00 was assumed. Drives `nlAssumedTime`. */
  assumedTime: boolean;
  llmConsulted: boolean;
  llmAvailable: boolean;
}

/**
 * A model result never reaches the "accept silently" band. It always lands in
 * CONFIRM so a human sees the interpretation before it is saved.
 */
export const LLM_CONFIDENCE_CEILING = 0.85;

/** What the model is asked to return, before validation. */
export interface RawModelSchedule {
  kind: "recurring" | "one_off" | null;
  cron: string | null;
  onDate?: string | null;
  confidence?: number;
}

export type AskModel = (args: {
  text: string;
  timezone: string;
  today: string;
}) => Promise<RawModelSchedule | null>;

/**
 * The one place model text is authored. It is a SYSTEM prompt because it
 * contains no user content; the phrase travels as a user turn (`modelUserTurn`),
 * which is the trust boundary — not the wording of this string.
 */
export const SCHEDULE_SYSTEM_PROMPT = `You convert a scheduling phrase into a 5-field cron expression.

Return ONLY a JSON object, no prose, no code fence:
  {"kind":"recurring","cron":"<m h dom mon dow>","onDate":null,"confidence":<0..1>}
  {"kind":"one_off","cron":"<m h dom mon dow>","onDate":"YYYY-MM-DD","confidence":<0..1>}

Rules:
- Exactly 5 space-separated fields: minute hour day-of-month month day-of-week.
- Allowed: * n a-b a-b/s */s a,b,c ; names JAN-DEC and SUN-SAT ; 0 and 7 both mean Sunday.
- FORBIDDEN, and a reason to return confidence 0: a seconds field, @daily-style macros,
  and the Quartz extensions L, W and #.
- The expression is evaluated in the user's own timezone. Do not convert to UTC.
- For a one-off, put the DATE in onDate and the time-of-day in the cron's minute and hour.
- If the phrase names no time of day, use 09:00 and lower confidence.
- If you cannot read it as a schedule, return {"kind":null,"cron":null,"confidence":0}.`;

/**
 * The phrase is user content and travels as user content. It is never spliced
 * into the system prompt, and nothing it can contain changes the instructions
 * above — this is the same rule the dispatched turn obeys for `prompt`.
 */
export function modelUserTurn(text: string, timezone: string, today: string): string {
  return `Today is ${today} in ${timezone}. Phrase: ${text}`;
}

/**
 * Re-validate everything the model returned before it is shown.
 *
 * A 6-field cron is a parse failure, not a schedule. Trusting the model's own
 * `cron` string would let a hallucinated Quartz expression reach `cron_expr`,
 * where the tick would throw on every claim.
 */
export function validateModelSchedule(raw: RawModelSchedule | null): PhraseCandidate | null {
  if (!raw || raw.kind === null || !raw.cron) return null;
  if (!isValidCron(raw.cron)) return null;
  const onDate = raw.onDate ?? null;
  if (raw.kind === "one_off" && !/^\d{4}-\d{2}-\d{2}$/.test(onDate ?? "")) return null;
  const confidence = Math.min(
    typeof raw.confidence === "number" && raw.confidence >= 0 ? raw.confidence : 0.5,
    LLM_CONFIDENCE_CEILING,
  );
  return {
    kind: raw.kind,
    cron: raw.cron,
    onDate: raw.kind === "one_off" ? onDate : null,
    matched: "interpreted by the model",
    confidence,
    source: "llm",
  };
}

/** Best-effort JSON extraction from a completion that may still be fenced. */
export function parseModelJson(text: string): RawModelSchedule | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    const kind = o.kind === "recurring" || o.kind === "one_off" ? o.kind : null;
    return {
      kind,
      cron: typeof o.cron === "string" ? o.cron : null,
      onDate: typeof o.onDate === "string" ? o.onDate : null,
      confidence: typeof o.confidence === "number" ? o.confidence : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * The hard fallback. It always answers, and it never auto-applies.
 *
 * "Every day at the time you mentioned, or 09:00" is the least surprising
 * default in the product and it is what the cron form should open holding. It is
 * emitted with a confidence far below the floor and `source: "fallback"`, so no
 * band ever accepts it silently.
 */
export function fallbackSchedule(text: string): PhraseCandidate {
  const t = extractTime(text);
  const hour = t?.hour ?? 9;
  const minute = t?.minute ?? 0;
  return {
    kind: "recurring",
    cron: `${minute} ${hour} * * *`,
    onDate: null,
    matched: t ? "time only — assumed daily" : "assumed daily at 09:00",
    confidence: t ? 0.2 : 0.1,
    source: "fallback",
  };
}

/**
 * Which band a candidate lands in.
 *
 * Band A requires BOTH a confidence at or above the floor AND an even step. A
 * `*​/7` parse comes back at 0.8 — verified — which would otherwise be saved
 * silently as a cadence that fires seven times and then waits four minutes.
 * That case is demoted to CONFIRM with the two admissible neighbours offered.
 */
export function bandFor(c: PhraseCandidate | null, uneven: UnevenStep | null): ScheduleBand {
  if (!c || c.source === "fallback") return "none";
  if (c.source === "llm") return "confirm"; // never auto-applied, whatever it claims
  if (c.confidence < CONFIDENCE_FLOOR) return "confirm";
  return uneven ? "confirm" : "accept";
}

export interface ResolveOptions {
  timezone: string;
  /** `zonedParts(now, timezone)` — the SCHEDULE's zone, not the server's. Relative
   *  one-offs ("tomorrow at 9") silently stop parsing without it. */
  today: { year: number; month: number; day: number };
  askModel?: AskModel;
  llmAvailable?: boolean;
}

/** `YYYY-MM-DD` from the caller's civil date parts. */
function todayIso(today: { year: number; month: number; day: number }): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${today.year}-${p(today.month)}-${p(today.day)}`;
}

export async function resolveSchedulePhrase(
  text: string,
  opts: ResolveOptions,
): Promise<ResolvedPhrase> {
  const llmAvailable = opts.llmAvailable ?? Boolean(opts.askModel);
  const deterministic = parseSchedulePhrase(text, { today: opts.today });

  let parsed: PhraseCandidate | null = deterministic
    ? {
        kind: deterministic.kind,
        cron: deterministic.cron,
        onDate: deterministic.onDate ?? null,
        matched: deterministic.matched,
        confidence: deterministic.confidence,
        source: "deterministic",
      }
    : null;

  let alternative: PhraseCandidate | null = null;
  let llmConsulted = false;

  // Escalate when there is nothing, or when what we have is a guess the user
  // must confirm anyway. Never when the deterministic answer already clears the
  // floor — that answer is the product's contract.
  const wantsModel = !parsed || parsed.confidence < CONFIDENCE_FLOOR;
  if (wantsModel && opts.askModel && text.trim()) {
    llmConsulted = true;
    let raw: RawModelSchedule | null = null;
    try {
      raw = await opts.askModel({
        text,
        timezone: opts.timezone,
        today: todayIso(opts.today),
      });
    } catch {
      // A model outage is not a parse error. Fall through with whatever the
      // deterministic parser gave us — including nothing.
      raw = null;
    }
    const candidate = validateModelSchedule(raw);
    if (candidate) {
      if (!parsed) parsed = candidate;
      else if (candidate.cron !== parsed.cron) alternative = candidate;
    }
  }

  const uneven = parsed ? unevenStep(parsed.cron) : null;
  const band = bandFor(parsed, uneven);

  return {
    parsed,
    band,
    alternative,
    seed: parsed ?? fallbackSchedule(text),
    unevenStep: uneven,
    // The same signal the parser used to apply its 0.15 penalty, surfaced so the
    // editor can show "assumed 09:00" prominently rather than hiding it.
    assumedTime: extractTime(text) === null,
    llmConsulted,
    llmAvailable,
  };
}
