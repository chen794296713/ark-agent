/**
 * Request validation for the template HTTP surface.
 *
 * Client-safe (Zod and pure helpers only): `./client.ts` builds the same query
 * string this parses, so a filter the browser sends cannot silently be one the
 * server drops. Nothing here reads the environment or the database.
 *
 * These schemas live in this vertical's own file rather than in
 * `lib/validation.ts`, which belongs to the integrator.
 *
 * The two-class rule is the one `lib/skills/validation.ts` established, and it
 * is a correctness property rather than a nicety:
 *
 *  - a malformed STRUCTURAL parameter (`page=1e9`, `perPage=100000`) is a 400,
 *    because those are the parameters that bound the scan and serving an
 *    unbounded one because a number failed to parse is how any signed-in user
 *    fires a full-table read;
 *  - an unrecognised FILTER VALUE (`category=__proto__`, `sort=name;DROP`) is
 *    DROPPED and reported in `ignoredFilters`. Every one of those otherwise
 *    reaches an `inArray` against a pgEnum, Drizzle passes the string through
 *    verbatim, and Postgres answers `22P02 invalid input value for enum` — a
 *    500 carrying the enum's full value list.
 */
import { z } from "zod";
import { CHANNEL_TYPE_IDS } from "@/lib/channels";
import { HARNESS_IDS, type Harness } from "@/lib/harness";
import { PLAN_TIERS, type PlanTier } from "@/lib/pricing";
import { agentTemplateDraftSchema, templateCategorySchema } from "./schema";
import { BRIEF_MAX_CHARS } from "./validate";
import type { TemplateCategory } from "./types";

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

/** The page the gallery draws (`components/template/derive.PER_PAGE`). */
export const DEFAULT_PER_PAGE = 24;
/** The ceiling any client may ask for. Bounds the row count AND the count pass. */
export const MAX_PER_PAGE = 60;
/**
 * The deepest page we will serve. OFFSET is O(offset) in Postgres, so an
 * unbounded `page` is a free sequential scan for anyone holding a session.
 */
export const MAX_PAGE = 100;
/** Longest free-text query. The ILIKE in ./queries.ts is bounded by this. */
export const MAX_QUERY_LEN = 120;

/** Sort keys, mirroring `lib/i18n/template-gallery.TEMPLATE_SORTS`. */
export const TEMPLATE_SORTS = ["used", "new", "updated", "name"] as const;
export type TemplateSort = (typeof TEMPLATE_SORTS)[number];

/** Which rows the caller wants, mirroring `TEMPLATE_SCOPES`. */
export const TEMPLATE_SCOPES = ["all", "workspace", "public"] as const;
export type TemplateScope = (typeof TEMPLATE_SCOPES)[number];

/** `agent_templates.difficulty`, mirroring `TEMPLATE_LEVELS`. */
export const TEMPLATE_DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type TemplateDifficultyFilter = (typeof TEMPLATE_DIFFICULTIES)[number];

export const TEMPLATE_CATEGORIES = [
  "sales",
  "support",
  "marketing",
  "operations",
  "finance",
  "research",
  "engineering",
  "hr",
  "personal",
  "other",
] as const satisfies readonly TemplateCategory[];

/** `agent_roles.id` is `varchar(40)` of our own minting, so the alphabet is known. */
const ROLE_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export class TemplateQueryError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "TemplateQueryError";
    this.code = code;
    this.status = status;
  }
}

export interface TemplateListFilters {
  q: string;
  /** `agent_roles.id` — matched against the draft's roles, see ./queries. */
  role: string | null;
  harnesses: Harness[];
  categories: TemplateCategory[];
  difficulties: TemplateDifficultyFilter[];
  plans: PlanTier[];
  scope: TemplateScope;
  sort: TemplateSort;
  page: number;
  perPage: number;
  /** Values that were not recognised and were dropped rather than 400'd. */
  ignoredFilters: string[];
}

function multi(params: URLSearchParams, key: string): string[] {
  // `?harness=a&harness=b` and `?harness=a,b` are the same request. Bounded at
  // 12 so a 4 KB comma list cannot become a 400-term `inArray`.
  return params
    .getAll(key)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter((v) => v !== "")
    .slice(0, 12);
}

function intParam(
  params: URLSearchParams,
  key: string,
  dflt: number,
  min: number,
  max: number,
): number {
  const raw = params.get(key);
  if (raw === null || raw === "") return dflt;
  // `Number`, not `parseInt`: parseInt("1e9") is 1, so a client asking for a
  // billion rows would be silently served page 1 and the bound would look like
  // it worked. An unparseable bound is a 400, never a default.
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new TemplateQueryError("bad_range", `${key} must be an integer in [${min}, ${max}]`);
  }
  return n;
}

function keepFrom<T extends string>(
  values: readonly string[],
  allowed: readonly T[],
  kind: string,
  ignored: string[],
): T[] {
  const set: ReadonlySet<string> = new Set(allowed);
  const out: T[] = [];
  for (const v of values) {
    if (set.has(v)) {
      if (!out.includes(v as T)) out.push(v as T);
    } else {
      ignored.push(`${kind}:${v.slice(0, 32)}`);
    }
  }
  return out;
}

/** Narrow the query string into a filter state. Everything unrecognised is
 *  dropped and reported; only the bounds throw. */
export function parseTemplateListQuery(params: URLSearchParams): TemplateListFilters {
  const ignored: string[] = [];

  const rawQ = params.get("q") ?? "";
  if (rawQ.length > MAX_QUERY_LEN) {
    throw new TemplateQueryError("q_too_long", `q must be at most ${MAX_QUERY_LEN} characters`);
  }

  const rawRole = params.get("role");
  let role: string | null = null;
  if (rawRole !== null && rawRole !== "") {
    if (ROLE_ID.test(rawRole)) role = rawRole;
    else ignored.push(`role:${rawRole.slice(0, 32)}`);
  }

  const rawSort = params.get("sort");
  const sort: TemplateSort =
    rawSort && (TEMPLATE_SORTS as readonly string[]).includes(rawSort)
      ? (rawSort as TemplateSort)
      : "used";
  if (rawSort && rawSort !== sort) ignored.push(`sort:${rawSort.slice(0, 32)}`);

  const rawScope = params.get("scope");
  const scope: TemplateScope =
    rawScope && (TEMPLATE_SCOPES as readonly string[]).includes(rawScope)
      ? (rawScope as TemplateScope)
      : "all";
  if (rawScope && rawScope !== scope) ignored.push(`scope:${rawScope.slice(0, 32)}`);

  return {
    // Collapsed and trimmed here so the pattern ./queries.ts builds is one the
    // user could have typed. `%` and `_` are escaped where the pattern is
    // built, not here.
    q: rawQ.replace(/\s+/g, " ").trim(),
    role,
    harnesses: keepFrom<Harness>(multi(params, "harness"), HARNESS_IDS, "harness", ignored),
    categories: keepFrom<TemplateCategory>(
      multi(params, "category"),
      TEMPLATE_CATEGORIES,
      "category",
      ignored,
    ),
    difficulties: keepFrom<TemplateDifficultyFilter>(
      multi(params, "difficulty"),
      TEMPLATE_DIFFICULTIES,
      "difficulty",
      ignored,
    ),
    plans: keepFrom<PlanTier>(multi(params, "plan"), PLAN_TIERS, "plan", ignored),
    scope,
    sort,
    page: intParam(params, "page", 1, 1, MAX_PAGE),
    perPage: intParam(params, "perPage", DEFAULT_PER_PAGE, 1, MAX_PER_PAGE),
    ignoredFilters: ignored,
  };
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

/**
 * `POST /api/templates` — persist an edited draft.
 *
 * The whole draft is re-validated against `agentTemplateDraftSchema`, and the
 * route then re-lints it: `provenance.materializable` arrives from a browser
 * and is never trusted, and neither are the denormalized card counts, which are
 * recomputed from the draft rather than read off the body.
 *
 * `visibility` may NOT be set to `public` here. Publishing a template to every
 * other tenant is a separate, deliberate act (PATCH), not something a create
 * call can do while the user believes they are saving a private draft.
 *
 * `.strict()`, like every other privileged schema in this app: silence is the
 * wrong answer to a misspelled key on a route that writes a row other people
 * can read.
 */
export const createTemplateSchema = z
  .object({
    draft: agentTemplateDraftSchema,
    /** `template_generations.id` this draft came from. Verified server-side. */
    generationId: z.uuid().optional(),
    visibility: z.enum(["private", "workspace"]).optional().default("private"),
    /** Overrides `draft.meta.name` when the user renamed it on the review screen. */
    name: z.string().min(1).max(60).optional(),
  })
  .strict();
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

/**
 * `PATCH /api/templates/{id}` — edit a template this workspace owns.
 *
 * Every field is optional and at least one must be present: an empty PATCH that
 * returned 200 would tell the caller a change landed when none did.
 *
 * The denormalized card columns (`skillCount`, `difficulty`, `automates`,
 * `timeToValueMinutes`, `materializable`, `useCount`) are absent BY DESIGN.
 * They are computed from `draft` at write time; accepting them from a client
 * would let the gallery advertise "beginner · 4 min" over a template that
 * attaches nine high-risk skills.
 */
export const updateTemplateSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    summary: z.string().min(1).max(200).optional(),
    description: z.string().max(1200).optional(),
    category: templateCategorySchema.optional(),
    tags: z.array(z.string().min(1).max(32)).max(8).optional(),
    visibility: z.enum(["private", "workspace", "public"]).optional(),
    minPlan: z.enum(PLAN_TIERS).optional(),
    draft: agentTemplateDraftSchema.optional(),
    /** Un-archive. Archiving is `DELETE`; this is the way back. */
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "nothing to update" });
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

/**
 * `POST /api/templates/generate`.
 *
 * `brief` is the user's own words and is UNTRUSTED: `normalizeBrief` and
 * `screenInjection` in ./validate.ts run on it before a single token reaches a
 * model. The cap here is the same `BRIEF_MAX_CHARS` the normalizer enforces, so
 * the browser learns about the limit before the request rather than instead of
 * one.
 *
 * `stream` picks the transport, not the work: `true` is the SSE response and
 * `false` is a 202 plus a `generationId` to poll. Both run the same pipeline.
 */
export const generateTemplateSchema = z
  .object({
    brief: z.string().min(1).max(BRIEF_MAX_CHARS),
    locale: z.enum(["en", "zh", "zht", "ja"]).optional(),
    harness: z.enum(HARNESS_IDS).optional(),
    /** A nudge for role resolution, never a promise — `resolveRole` still decides. */
    roleHint: z.string().max(40).optional(),
    channels: z.array(z.enum(CHANNEL_TYPE_IDS)).max(8).optional(),
    timezone: z.string().max(64).optional(),
    stream: z.boolean().optional().default(true),
  })
  .strict();
export type GenerateTemplateInput = z.infer<typeof generateTemplateSchema>;

/**
 * `POST /api/templates/{id}/materialize`.
 *
 * `acknowledgedWarnings` carries the `ATG-Lxxx` codes the user was actually
 * shown and clicked past. It is not decoration: a warning that appeared after
 * the screen was rendered — because the catalogue re-scored a skill in the
 * meantime — is one nobody accepted, and the route refuses rather than hiring
 * an agent against a rule the operator never read.
 */
export const materializeTemplateSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    planTier: z.enum(PLAN_TIERS).optional(),
    channels: z.array(z.enum(CHANNEL_TYPE_IDS)).max(8).optional(),
    acceptWarnings: z.boolean().optional().default(false),
    acknowledgedWarnings: z.array(z.string().max(16)).max(64).optional().default([]),
  })
  .strict();
export type MaterializeTemplateInput = z.infer<typeof materializeTemplateSchema>;

/**
 * The `Idempotency-Key` header materialize requires.
 *
 * `agents.idempotency_key` is `varchar(80)`, so anything longer is rejected
 * here rather than by Postgres. The alphabet is the one a `randomUUID()` or a
 * nanoid produces; a key with a comma in it would survive a header split and
 * address a different agent than the caller meant.
 */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,80}$/;

export function readIdempotencyKey(req: Request): string | null {
  const raw = req.headers.get("idempotency-key");
  if (raw === null) return null;
  const key = raw.trim();
  return IDEMPOTENCY_KEY.test(key) ? key : null;
}

/** A uuid, or nothing. The route still scopes by workspace; this checks shape
 *  only, so a path segment that is not a uuid becomes a 404 instead of a 500
 *  from `22P02 invalid input syntax for type uuid`. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
