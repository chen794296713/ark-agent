/**
 * Zod v4 schemas for schedule CRUD, the preview endpoint and the tick.
 *
 * Lives here rather than in `lib/validation.ts` because that file is shared and
 * this vertical does not own it; the integrator re-exports.
 *
 * Every mutation is `.strict()`, for the reason the admin mutations already are:
 * Zod strips unknown keys by default, and a silently-dropped key on a scheduling
 * edit — `catchUp` misspelled, `deliverTo` sent as `deliver_to` — produces a row
 * that means something other than what the user submitted, with no error.
 *
 * Cross-field rules that need the clock or the database are NOT here. They live
 * in `validateScheduleInput` (lib/services/schedules.ts) so that POST, PATCH and
 * ATG materialization all pass through the same gate — a generated schedule must
 * not be able to enter through a side door that skips a check a hand-made one
 * must pass. docs/REMINDERS_AND_SCHEDULERS.md §3.8.4.
 */

import { z } from "zod";
import { isValidTimeZone } from "@/lib/schedule/cron";
import { SCHEDULE_LIMITS } from "./limits";

export const SCHEDULE_KINDS = ["cron", "once", "interval"] as const;
export const DELIVER_TO = ["chat", "email", "channel", "none"] as const;
export const OVERLAP_POLICIES = ["skip", "queue", "parallel"] as const;
export const RUN_STATUSES = ["started", "succeeded", "failed", "skipped"] as const;
export const LANGS = ["en", "zh", "zht", "ja"] as const;

/**
 * `interval` is accepted by the schema and refused by the service with the named
 * code `interval_not_supported`. Narrowing the enum here instead would produce a
 * generic "Validation failed" for the one input the doc requires an actionable
 * reason for (§3.6) — the user's next move is "use every N minutes", and a Zod
 * enum error cannot say that.
 */
const timezone = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, { message: "Unknown IANA time zone" });

const cronExpr = z.string().min(1).max(120);
const namefield = z.string().min(1).max(120);
const prompt = z.string().min(1).max(8000);
const expectation = z.string().max(SCHEDULE_LIMITS.MAX_EXPECTATION_CHARS);

const base = {
  name: namefield,
  kind: z.enum(SCHEDULE_KINDS),
  cronExpr: cronExpr.nullable().optional(),
  /** ISO 8601. Resolved from a wall clock by materializeParsed, never concatenated. */
  runAt: z.string().datetime({ offset: true }).nullable().optional(),
  intervalSeconds: z.number().int().min(60).nullable().optional(),
  timezone: timezone.optional(),
  prompt,
  expectation: expectation.nullable().optional(),
  deliverTo: z.enum(DELIVER_TO).default("chat"),
  overlapPolicy: z.enum(OVERLAP_POLICIES).default("skip"),
  catchUp: z.boolean().default(false),
  jitterSeconds: z.number().int().min(0).max(3600).default(0),
  maxRunsPerDay: z
    .number()
    .int()
    .min(1)
    .max(SCHEDULE_LIMITS.HARD_MAX_RUNS_PER_DAY)
    .default(SCHEDULE_LIMITS.DEFAULT_MAX_RUNS_PER_DAY),
  maxRuntimeSeconds: z.number().int().min(30).max(86_400).default(900),
  wakeRuntime: z.boolean().default(true),
  enabled: z.boolean().default(true),
};

export const createScheduleSchema = z.object(base).strict();

/**
 * PATCH is partial over the SAME shape, so a field cannot be validated one way
 * on create and another on edit. `.partial()` before `.strict()` because strict
 * applies to the resulting object, not to the source.
 */
export const updateScheduleSchema = z
  .object({
    ...base,
    // Defaults would turn "field absent" into "field reset to the default" on a
    // partial update, which is how a PATCH of `{ name }` silently re-enables a
    // paused schedule and resets its ceiling. Strip every default on this side.
    deliverTo: z.enum(DELIVER_TO),
    overlapPolicy: z.enum(OVERLAP_POLICIES),
    catchUp: z.boolean(),
    jitterSeconds: z.number().int().min(0).max(3600),
    maxRunsPerDay: z.number().int().min(1).max(SCHEDULE_LIMITS.HARD_MAX_RUNS_PER_DAY),
    maxRuntimeSeconds: z.number().int().min(30).max(86_400),
    wakeRuntime: z.boolean(),
    enabled: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

/**
 * The live editor preview. `phrase` and `cron` are alternatives, not both — a
 * request carrying neither is answered as a parse failure rather than a 4xx,
 * because an empty field is a state the editor is legitimately in (§4.4).
 */
export const previewScheduleSchema = z
  .object({
    phrase: z.string().max(SCHEDULE_LIMITS.MAX_PHRASE_CHARS).optional(),
    cron: cronExpr.optional(),
    timezone: timezone.optional(),
    lang: z.enum(LANGS).default("en"),
    /** Opt out of the model branch — the editor's per-keystroke calls set this. */
    deterministicOnly: z.boolean().default(false),
  })
  .strict();

export const scheduleRunsQuerySchema = z
  .object({
    status: z.enum(RUN_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().max(256).optional(),
  })
  .strict();

/**
 * `z.stringbool()`, NEVER `z.coerce.boolean()`.
 *
 * `z.coerce.boolean()` is `Boolean(x)`, so it parses the string "false" — which
 * is what a query string carries — as TRUE. On this flag that inverts the one
 * value an operator would ever bother to type: `?dryRun=false` would claim every
 * due row, release all of them, dispatch nothing, and report a healthy tick.
 * The union keeps a real JSON boolean working on the POST path.
 */
const stringBool = z.union([z.boolean(), z.stringbool()]);

/**
 * The tick's own body. `scheduleId` is a PLATFORM-OPERATOR parameter: the only
 * credential that reaches that route is CRON_SECRET, which is a platform secret,
 * not a tenant one. It restricts the claim; it cannot widen it.
 */
export const tickRequestSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
    dryRun: stringBool.default(false),
    scheduleId: z.string().uuid().optional(),
  })
  .strict();

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type PreviewScheduleInput = z.infer<typeof previewScheduleSchema>;
export type ScheduleRunsQuery = z.infer<typeof scheduleRunsQuerySchema>;
export type TickRequest = z.infer<typeof tickRequestSchema>;

/** The codes `validateScheduleInput` can refuse with. Each is an i18n key. */
export type ScheduleValidationCode =
  | "invalid_cron"
  | "invalid_timezone"
  | "never_matches"
  | "run_at_in_past"
  | "interval_not_supported"
  | "interval_not_representable"
  | "exceeds_max_runs_per_day"
  | "deliver_target_unavailable"
  | "schedule_limit_reached"
  | "invalid_cursor";
