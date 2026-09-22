/**
 * Query-string and request-body validation for the skills vertical.
 *
 * Client-safe (Zod only): `./client.ts` builds the same query string this
 * parses, so a filter the browser sends cannot silently be one the server drops.
 *
 * These schemas live here rather than in `lib/validation.ts` because that file
 * belongs to another owner; the integrator re-exports whichever of them the
 * shared module should carry.
 *
 * The two-class rule is the one `lib/activity/validation.ts` already
 * established, and it is a security property here, not a nicety:
 *
 *  - a malformed STRUCTURAL parameter (`page=1e9`, `perPage=100000`) is a 400,
 *    because those are the parameters that bound the scan and serving an
 *    unbounded one because a number did not parse is how any signed-in user
 *    fires a full-table read;
 *  - an unrecognised FILTER VALUE (`risk=purple`, `category=__proto__`) is
 *    DROPPED and reported in `ignoredFilters`. Every one of these otherwise
 *    lands in `inArray` against a pgEnum, Drizzle passes the string through
 *    verbatim, and Postgres answers `22P02 invalid input value for enum` — a
 *    500 carrying the enum's full value list.
 */
import { z } from "zod";
import { HARNESS_IDS, type Harness } from "@/lib/harness";
import {
  SKILL_CATEGORY_IDS,
  SKILL_FORMAT_IDS,
  SKILL_RISK_IDS,
  type SkillCategory,
  type SkillFormat,
  type SkillRisk,
} from "./types";

/** The page the UI draws. */
export const DEFAULT_PER_PAGE = 24;
/** The ceiling any client may ask for. Bounds the row count AND the facet pass. */
export const MAX_PER_PAGE = 60;
/**
 * The deepest page we will serve. OFFSET is O(offset) in Postgres, so an
 * unbounded `page` is a free sequential scan for anyone with a session; 100
 * pages of 60 is 6,000 rows, well past where anyone is still browsing.
 */
export const MAX_PAGE = 100;
/** Longest free-text query. The ILIKE below is bounded by it, not by the client. */
export const MAX_QUERY_LEN = 80;

export const SKILL_SORTS = ["popularity", "recent", "name", "risk"] as const;
export type SkillSort = (typeof SKILL_SORTS)[number];

export class SkillQueryError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "SkillQueryError";
    this.code = code;
    this.status = status;
  }
}

export interface SkillListFilters {
  q: string;
  categories: SkillCategory[];
  risks: SkillRisk[];
  harnesses: Harness[];
  formats: SkillFormat[];
  sources: string[];
  verifiedOnly: boolean;
  /**
   * Default FALSE. `high` means "holds a credential, writes outside the
   * workspace, or does something a human cannot undo"; a catalogue that shows
   * those beside a style guide by default is a catalogue that taught the
   * operator the band is decorative. The response reports `hiddenByRisk` so the
   * filter is visible rather than silent.
   */
  includeHigh: boolean;
  page: number;
  perPage: number;
  sort: SkillSort;
  /** Workspace-checked by the route BEFORE any query runs. Never trusted here. */
  agentId: string | null;
  /** Filter values that were not recognised, so the UI can say the filter did nothing. */
  ignoredFilters: string[];
}

/** `?risk=low&risk=high` and `?risk=low,high` are the same request. */
function multi(params: URLSearchParams, key: string, cap = 16): string[] {
  const out: string[] = [];
  for (const raw of params.getAll(key)) {
    for (const part of raw.split(",")) {
      const v = part.trim();
      if (v && !out.includes(v)) out.push(v);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

function intParam(params: URLSearchParams, key: string, dflt: number, min: number, max: number): number {
  const raw = params.get(key);
  if (raw === null || raw === "") return dflt;
  // `Number` and not `parseInt`: parseInt("1e9") is 1, so a client asking for a
  // billion rows would be silently served page 1 and the bound would look like
  // it worked. An unparseable bound is a 400, never a default.
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new SkillQueryError("bad_range", `${key} must be an integer in [${min}, ${max}]`);
  }
  return n;
}

/** A uuid, or a 400. The route still checks the workspace; this only checks shape. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `skill_sources.id` is `varchar(40)` of our own minting, so the alphabet is
 * known. Bounding it here keeps an arbitrary 10KB string out of the `inArray`.
 */
const SOURCE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Keep the values that are in `allowed`; record the rest as ignored. */
function keepFrom<T extends string>(
  values: readonly string[],
  allowed: readonly T[],
  kind: string,
  ignored: string[],
): T[] {
  const set: ReadonlySet<string> = new Set(allowed);
  const out: T[] = [];
  for (const v of values) {
    if (set.has(v)) out.push(v as T);
    else ignored.push(`${kind}:${v.slice(0, 32)}`);
  }
  return out;
}

/** Keep the values matching `shape`; record the rest as ignored. */
function keepMatching(
  values: readonly string[],
  shape: RegExp,
  kind: string,
  ignored: string[],
): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (shape.test(v)) out.push(v);
    else ignored.push(`${kind}:${v.slice(0, 32)}`);
  }
  return out;
}

export function parseSkillListQuery(params: URLSearchParams): SkillListFilters {
  const ignored: string[] = [];

  const rawQ = params.get("q") ?? "";
  if (rawQ.length > MAX_QUERY_LEN) {
    throw new SkillQueryError("q_too_long", `q must be at most ${MAX_QUERY_LEN} characters`);
  }

  const agentId = params.get("agentId");
  if (agentId !== null && agentId !== "" && !UUID.test(agentId)) {
    throw new SkillQueryError("bad_agent_id", "agentId must be a uuid");
  }

  const rawSort = params.get("sort");
  const sort: SkillSort =
    rawSort && (SKILL_SORTS as readonly string[]).includes(rawSort) ? (rawSort as SkillSort) : "popularity";
  if (rawSort && sort !== rawSort) ignored.push(`sort:${rawSort.slice(0, 32)}`);

  const risks = keepFrom<SkillRisk>(multi(params, "risk"), SKILL_RISK_IDS, "risk", ignored);

  return {
    // Collapsed and trimmed here so the ILIKE pattern the query builds is one
    // the user could have typed. `%` and `_` are escaped in ./queries.ts, at
    // the point the pattern is built, not here.
    q: rawQ.replace(/\s+/g, " ").trim(),
    categories: keepFrom<SkillCategory>(multi(params, "category"), SKILL_CATEGORY_IDS, "category", ignored),
    risks,
    harnesses: keepFrom<Harness>(multi(params, "harness"), HARNESS_IDS, "harness", ignored),
    formats: keepFrom<SkillFormat>(multi(params, "format"), SKILL_FORMAT_IDS, "format", ignored),
    sources: keepMatching(multi(params, "source"), SOURCE_ID, "source", ignored),
    verifiedOnly: params.get("verifiedOnly") === "1" || params.get("verifiedOnly") === "true",
    // `?risk=high` IS the request to see high-risk rows, so it satisfies the
    // gate on its own. Read independently, the two predicates are
    // `risk_level IN ('high') AND risk_level IN ('low','medium')` — always
    // empty — and the browser would show a permanently blank facet the user
    // had just clicked, with `hiddenByRisk` as the only clue that the filter
    // and the toggle were fighting each other.
    includeHigh:
      params.get("includeHigh") === "1" ||
      params.get("includeHigh") === "true" ||
      risks.includes("high"),
    page: intParam(params, "page", 1, 1, MAX_PAGE),
    perPage: intParam(params, "perPage", DEFAULT_PER_PAGE, 1, MAX_PER_PAGE),
    sort,
    agentId: agentId || null,
    ignoredFilters: ignored,
  };
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

/**
 * Keys that may never appear in `agent_skills.config`.
 *
 * The secret itself lives in the runtime's own store; this column holds env var
 * NAMES and non-secret values. `.strict()` is a no-op on a `z.record` and is NOT
 * the mechanism — this `.check()` is.
 *
 * The pattern is a byte-for-byte copy of the one masking channel config in
 * `lib/serializers.ts` (a module-private `const` there, and that file is owned
 * by the integrator). `tests/skills-api.test.ts` asserts the two sources are
 * identical so the copy cannot rot silently; when the integrator exports the
 * original, this constant becomes an import and the test becomes redundant.
 */
export const SKILL_CONFIG_SECRET_KEYS = /token|secret|key|appsecret|password/i;

const skillConfigSchema = z
  .record(z.string().min(1).max(80), z.string().max(500))
  .refine((cfg) => Object.keys(cfg).every((k) => !SKILL_CONFIG_SECRET_KEYS.test(k)), {
    message: "config may not carry secret-looking keys; the runtime holds the secret",
  })
  .refine((cfg) => Object.keys(cfg).length <= 40, { message: "config may hold at most 40 keys" });

/**
 * POST /api/agents/:id/skills.
 *
 * `version` is required and is never "latest": the AST07 control is that an
 * attachment pins the exact string that was scored, so a later reclassification
 * shows as drift instead of being installed silently.
 *
 * `compatAsserted` and `riskAcknowledged` are deliberately separate booleans and
 * neither defaults true — the first is the AST10 cross-harness assertion, the
 * second the §6.5 gate on a `high` skill. `origin`, `originRef` and
 * `installSource` are SERVER-SET and are absent from this schema on purpose: an
 * unvalidated client-supplied uuid in an audit field is an audit field that lies.
 */
export const attachSkillSchema = z.object({
  publicId: z.string().min(1).max(160),
  version: z.string().min(1).max(60),
  compatAsserted: z.boolean().optional().default(false),
  riskAcknowledged: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true),
  config: skillConfigSchema.optional(),
});
export type AttachSkillInput = z.infer<typeof attachSkillSchema>;

/** PATCH on one attachment. Only the two switches an operator owns. */
export const updateAgentSkillSchema = z
  .object({
    enabled: z.boolean().optional(),
    config: skillConfigSchema.optional(),
  })
  .refine((b) => b.enabled !== undefined || b.config !== undefined, {
    message: "nothing to update",
  });

/** The four things a sync run can be asked to do (SKILL_REPOSITORY §6.3). */
export const SYNC_MODES = ["delta", "full", "verify-pinned", "enrich"] as const;
export type SyncMode = (typeof SYNC_MODES)[number];

/**
 * POST /api/skills/sync.
 *
 * `source` is constrained to our own alphabet rather than left free: it is
 * interpolated into nothing, but it selects the row whose `api_base_url` the
 * pipeline will fetch, and a source id is not a place to accept 4KB of anything.
 *
 * The field names are the ones `SkillSyncResponse` echoes back — `source`,
 * `mode`, `cursor`, `dryRun`. An earlier spelling took `sourceId`/`limit` and no
 * `mode` at all, which left the route unable to fill two of the six fields its
 * own response type declares.
 *
 * `dryRun` defaults FALSE. The daily cron posts a fixed body, and a default of
 * `true` turns a forgotten field into a sync that reports success every night
 * while writing nothing — the failure mode nobody notices for a quarter.
 *
 * `.strict()`, like every other privileged schema in this app: silence is the
 * wrong answer to a misspelled parameter on a route that writes the table every
 * customer reads.
 */
export const syncSkillsSchema = z
  .object({
    source: z.string().regex(SOURCE_ID, "unknown source id"),
    mode: z.enum(SYNC_MODES).optional().default("delta"),
    /** Hard ceiling on upstream pages per call, so one invocation cannot run for an hour. */
    maxPages: z.number().int().min(1).max(50).optional().default(5),
    /** Resume token; omit to continue from `skill_sources.sync_cursor`. */
    cursor: z.string().max(2000).optional(),
    dryRun: z.boolean().optional().default(false),
  })
  .strict();
export type SyncSkillsInput = z.infer<typeof syncSkillsSchema>;

export { HARNESS_IDS };
