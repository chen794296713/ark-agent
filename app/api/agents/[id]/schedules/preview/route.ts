/**
 * POST /api/agents/[id]/schedules/preview
 *
 * The live editor preview: a phrase or a cron expression in, and the parsed
 * schedule, the human sentence, the next five fire instants and the writable row
 * shape out.
 *
 * **This route never 500s on bad input.** A malformed cron, an unreadable
 * phrase, an expression that can never match — all of them are RESULTS, returned
 * as data with a 200, because the editor is calling this while the user is still
 * typing and an error toast on every third keystroke is not a product. The only
 * non-200s are 401 (no session), 404 (agent not in this workspace) and 422 (the
 * envelope itself is malformed — a 900-character "phrase", an unknown lang).
 * The model branch's rate limit is deliberately NOT a 429: exhausting it drops
 * back to the deterministic parser, which is the primary reading anyway, so the
 * editor keeps working. The `x-schedule-parse-rate-limited` header says the
 * assisted second opinion was skipped.
 *
 * Agent-scoped rather than workspace-wide so the §3.8 authorization rule applies
 * unchanged, and so a scheduling phrase never travels on a route where it could
 * be correlated across agents.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { apiError, json, notFound, parseBody, requireAuth } from "@/lib/api";
import { db } from "@/lib/db";
import { llmUsage } from "@/lib/db/schema";
import { getAgentRow } from "@/lib/services/agents";
import { chatCompletion, isLLMConfigured, type LlmUsageSample } from "@/lib/llm/openrouter";
import { classifyLlmError, recordLlmUsage } from "@/lib/llm/usage";
import {
  cronError,
  isValidTimeZone,
  nextRuns,
  offsetMinutes,
  parseCron,
  zonedParts,
} from "@/lib/schedule/cron";
import { describeSchedule } from "@/lib/schedule/describe";
import { mergeSettings } from "@/lib/agent-settings";
import { SCHEDULE_LIMITS } from "@/lib/schedules/limits";
import { previewScheduleSchema } from "@/lib/schedules/validation";
import { scheduleErrorText } from "@/lib/i18n/schedules";
import type { Lang } from "@/lib/types";
import { dailyFireCount, materializeParsed, unevenStep } from "@/lib/schedules/plan";
import {
  SCHEDULE_SYSTEM_PROMPT,
  modelUserTurn,
  parseModelJson,
  resolveSchedulePhrase,
  type AskModel,
  type ResolvedPhrase,
} from "@/lib/schedules/nl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PreviewResponse {
  parsed: ResolvedPhrase["parsed"];
  band: ResolvedPhrase["band"] | "cron";
  alternative: ResolvedPhrase["alternative"];
  seed: ResolvedPhrase["seed"] | null;
  humanReadable: string | null;
  upcoming: string[];
  /** True on any previewed instant whose UTC offset differs from the one before. */
  dstShift: boolean[];
  /** Both day fields restricted ⇒ the Vixie union note. */
  unionWarning: boolean;
  /** The one thing the user can act on when nothing else worked. */
  error: { code: string; message: string; detail?: Record<string, unknown> } | null;
  unevenStep: ReturnType<typeof unevenStep>;
  assumedTime: boolean;
  llmAvailable: boolean;
  timezone: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  const parsed = await parseBody(req, previewScheduleSchema);
  if (parsed.res) return parsed.res;
  const { phrase, cron, lang, deterministicOnly } = parsed.data;

  const settings = mergeSettings(agent.settings);
  const timezone =
    parsed.data.timezone ??
    (isValidTimeZone(auth.ctx.workspace.timezone) ? auth.ctx.workspace.timezone : null) ??
    (isValidTimeZone(settings.timezone) ? settings.timezone : "UTC");

  const now = new Date();

  // ---- The ADVANCED cron field: no parser, no model, just the engine --------
  if (cron !== undefined) {
    return json(previewCron(cron, timezone, lang, now, isLLMConfigured()));
  }

  if (!phrase?.trim()) {
    return json(emptyPreview(timezone, isLLMConfigured()));
  }

  // ---- The natural-language field ------------------------------------------
  let askModel: AskModel | undefined;
  let rateLimited = false;
  if (!deterministicOnly && isLLMConfigured()) {
    // No rate limiter exists in this repository and no new runtime dependency
    // may be added, so the mechanism is a COUNT over the table the call already
    // writes: correct across serverless instances in a way an in-memory bucket
    // is not, and it costs one indexed count. Only the branch that reaches the
    // model is limited — the deterministic answer is free and always returned.
    const [used] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(llmUsage)
      .where(
        and(
          eq(llmUsage.workspaceId, auth.ctx.workspace.id),
          eq(llmUsage.kind, "schedule_parse"),
          gte(llmUsage.createdAt, new Date(now.getTime() - 60_000)),
        ),
      );
    if ((used?.n ?? 0) >= SCHEDULE_LIMITS.PARSE_RATE_PER_MINUTE) rateLimited = true;
    else askModel = makeAskModel(auth.ctx.user.id, auth.ctx.workspace.id, id);
  }

  const resolved = await resolveSchedulePhrase(phrase, {
    timezone,
    // The SCHEDULE's zone, not the server's: without `today`, relative one-offs
    // ("tomorrow at 9") silently stop parsing rather than failing loudly.
    today: zonedParts(now, timezone),
    askModel,
    llmAvailable: isLLMConfigured(),
  });

  const body: PreviewResponse = {
    parsed: resolved.parsed,
    band: resolved.band,
    alternative: resolved.alternative,
    seed: resolved.seed,
    humanReadable: null,
    upcoming: [],
    dstShift: [],
    unionWarning: false,
    // Every `message` here is the USER's string, in the user's language.
    // `code` is what a caller branches on; the English draft these replaced
    // reached a zh/zht/ja editor verbatim on every failed keystroke.
    error:
      resolved.parsed === null
        ? { code: "unreadable", message: scheduleErrorText("unreadable", lang) }
        : null,
    unevenStep: resolved.unevenStep,
    assumedTime: resolved.assumedTime,
    llmAvailable: resolved.llmAvailable,
    timezone,
  };

  const shown = resolved.parsed ?? resolved.seed;
  if (shown.kind === "recurring") {
    body.humanReadable = describeSchedule(shown.cron, timezone, lang);
    const runs = nextRuns(shown.cron, now, timezone, 5);
    body.upcoming = runs.map((d) => d.toISOString());
    body.dstShift = dstShifts(runs, timezone);
    body.unionWarning = unionRestricted(shown.cron);
    const fires = dailyFireCount(shown.cron, timezone, now);
    if (fires.truncated || fires.count > SCHEDULE_LIMITS.HARD_MAX_RUNS_PER_DAY) {
      body.error = {
        code: "exceeds_max_runs_per_day",
        message: scheduleErrorText("exceeds_max_runs_per_day", lang),
        // The two numbers travel as data, not inside the sentence, so one
        // dictionary entry serves all four languages.
        detail: { fires: fires.count, limit: SCHEDULE_LIMITS.HARD_MAX_RUNS_PER_DAY },
      };
    }
    if (!runs.length) {
      body.error = { code: "never_matches", message: scheduleErrorText("never_matches", lang) };
    }
  } else {
    // A one-off: exactly one instant, produced by the single conversion allowed
    // to consume the parser's time-of-day carrier cron.
    try {
      const { shape } = materializeParsed(
        { kind: "one_off", cron: shown.cron, onDate: shown.onDate ?? undefined, matched: shown.matched, confidence: shown.confidence },
        timezone,
      );
      if (shape.kind === "once") body.upcoming = [shape.runAt.toISOString()];
    } catch {
      body.error = { code: "unreadable", message: scheduleErrorText("unreadable", lang) };
    }
  }

  const res = json(body);
  if (rateLimited) res.headers.set("x-schedule-parse-rate-limited", "1");
  return res;
}

function emptyPreview(timezone: string, llmAvailable: boolean): PreviewResponse {
  return {
    parsed: null,
    band: "none",
    alternative: null,
    seed: null,
    humanReadable: null,
    upcoming: [],
    dstShift: [],
    unionWarning: false,
    error: null,
    unevenStep: null,
    assumedTime: true,
    llmAvailable,
    timezone,
  };
}

function previewCron(
  expr: string,
  timezone: string,
  lang: Lang,
  now: Date,
  llmAvailable: boolean,
): PreviewResponse {
  const out = emptyPreview(timezone, llmAvailable);
  out.band = "cron";
  const err = cronError(expr);
  if (err) {
    // The localized sentence for the user; the parser's own specific English
    // ("Expected 5 fields, got 6") rides along in `detail.reason`, because it is
    // the only thing that says WHICH field is wrong and it is untranslated.
    // `describeCron` returns null for an unparseable expression precisely so the
    // UI shows this instead of a lie.
    out.error = {
      code: "invalid_cron",
      message: scheduleErrorText("invalid_cron", lang),
      detail: { reason: err },
    };
    return out;
  }
  out.parsed = {
    kind: "recurring",
    cron: expr,
    onDate: null,
    matched: "typed",
    confidence: 1,
    source: "deterministic",
  };
  out.seed = out.parsed;
  out.humanReadable = describeSchedule(expr, timezone, lang);
  const runs = nextRuns(expr, now, timezone, 5);
  out.upcoming = runs.map((d) => d.toISOString());
  out.dstShift = dstShifts(runs, timezone);
  out.unionWarning = unionRestricted(expr);
  out.unevenStep = unevenStep(expr);
  if (!runs.length) {
    out.error = { code: "never_matches", message: scheduleErrorText("never_matches", lang) };
  }
  return out;
}

/**
 * A clock change on the previewed run, computed by WALKING THE ZONE. Adding
 * 86_400_000 ms to a UTC instant produces five wrong dates once a year.
 */
function dstShifts(runs: Date[], timezone: string): boolean[] {
  return runs.map((d, i) =>
    i === 0 ? false : offsetMinutes(d, timezone) !== offsetMinutes(runs[i - 1], timezone),
  );
}

/** Both day fields restricted ⇒ EITHER qualifies (the Vixie union rule). */
function unionRestricted(expr: string): boolean {
  try {
    const f = parseCron(expr);
    return f.domRestricted && f.dowRestricted;
  } catch {
    return false;
  }
}

/**
 * The model branch. One attempt, temperature 0, 120 tokens, no retry — a
 * schedule the model cannot read on the first try is a phrase the user should
 * retype, and a retry inside an interactive preview only doubles the latency.
 *
 * Every call is recorded under `kind: 'schedule_parse'`. Reusing `brief` would
 * put schedule parses into the admin console's brief-generation cost line and
 * make both numbers wrong.
 */
function makeAskModel(userId: string, workspaceId: string, agentId: string): AskModel {
  return async ({ text, timezone, today }) => {
    let sample: LlmUsageSample | undefined;
    const startedAt = Date.now();
    try {
      const raw = await chatCompletion({
        messages: [
          { role: "system", content: SCHEDULE_SYSTEM_PROMPT },
          // The phrase is user content and travels as user content.
          { role: "user", content: modelUserTurn(text, timezone, today) },
        ],
        temperature: 0,
        maxTokens: 120,
        onUsage: (u) => {
          sample = u;
        },
      });
      await recordLlmUsage({
        sample,
        kind: "schedule_parse",
        userId,
        workspaceId,
        agentId,
        latencyMs: Date.now() - startedAt,
      });
      return parseModelJson(raw);
    } catch (e) {
      await recordLlmUsage({
        sample,
        kind: "schedule_parse",
        userId,
        workspaceId,
        agentId,
        latencyMs: Date.now() - startedAt,
        errorCode: classifyLlmError(e),
      });
      // A model outage is not a parse error; the deterministic answer stands.
      return null;
    }
  };
}

/** Never reachable in normal use — declared so a stray GET is a clean 405. */
export async function GET() {
  return apiError("Use POST", 405);
}
