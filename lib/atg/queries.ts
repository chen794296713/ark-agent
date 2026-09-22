import "server-only";

/**
 * Every database read and write the template surface makes.
 *
 * `server-only`: this module imports Drizzle and the pooled `postgres` client.
 * The DTO mappers it calls live in ./serialize.ts precisely so the gallery can
 * share the shapes without sharing the connection.
 *
 * SCOPING, which is the whole security story of this file:
 *
 *  - A template is **readable** when it belongs to the caller's workspace, when
 *    it is a platform row (`workspace_id IS NULL`), or when it is `public`.
 *    Nothing else, ever — a `private` row in another tenant is invisible.
 *  - A template is **writable** only when `workspace_id` equals the caller's.
 *    A public row from another tenant reads and forks; it never PATCHes.
 *  - A miss is 404 at the route, never 403. A 403 confirms the uuid exists
 *    somewhere, which is a cross-tenant membership oracle (docs/API.md).
 *
 * `template_generations` is simpler: `workspace_id` is NOT NULL and every read
 * and write is scoped by it. There is no cross-workspace case at all.
 */
import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agentTemplates,
  llmUsage,
  templateGenerations,
  type AgentTemplate,
  type TemplateGeneration,
} from "@/lib/db/schema";
import type { Harness } from "@/lib/harness";
import type { Lang } from "@/lib/types";
import type { AgentTemplateDraft, DraftStageTrace, DraftWarning, InjectionFinding } from "./types";
import { templateColumnsFromDraft, type TemplateColumns } from "./serialize";
import type { TemplateListFilters } from "./validation";

// ---------------------------------------------------------------------------
// Operational knobs
// ---------------------------------------------------------------------------

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * The generation budget, per WORKSPACE — not per user. A generation is a
 * multi-call model job costing real money, and a seat-level limit is a limit an
 * organisation can multiply by hiring.
 *
 * The two count limits answer 429. The cost cap does NOT: exhausting it forces
 * the deterministic path (`budgetExhausted`), so the user still gets a complete,
 * valid, materializable draft — it is simply composed by rules rather than by a
 * model, exactly as it would be with no `OPENROUTER_API_KEY` at all. Refusing to
 * generate anything because the month's model spend is used up would be a worse
 * product than the one this app is required to be without a key.
 */
export const ATG_LIMITS = {
  PER_HOUR: intEnv("ATG_MAX_GENERATIONS_PER_HOUR", 10),
  PER_DAY: intEnv("ATG_MAX_GENERATIONS_PER_DAY", 40),
  /** Model spend per workspace per calendar month, in micro-USD. $5.00. */
  MONTHLY_COST_MICRO_USD: intEnv("ATG_MONTHLY_COST_CAP_MICRO_USD", 5_000_000),
  /**
   * How long a `queued`/`running` row may sit before the next request treats it
   * as dead. The partial unique index `template_generations_one_running` is the
   * only concurrency control there is, so without this sweep one crashed
   * serverless invocation locks a workspace out of the generator permanently.
   * Longer than any run: the pipeline's own circuit breaker is 12 model calls.
   */
  STALE_AFTER_MS: intEnv("ATG_GENERATION_STALE_MINUTES", 10) * 60_000,
} as const;

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

/**
 * `%` and `_` are wildcards to LIKE and ordinary characters to a person, so a
 * search for `100%` must not become a search for "starts with 100". `\` is
 * escaped first or it would escape the escapes.
 */
function likePattern(q: string): string {
  return `%${q.replace(/\\/g, "\\\\").replace(/[%_]/g, (c) => `\\${c}`)}%`;
}

/** The columns a card needs. Named explicitly so `draft` — 10–40 KB a row —
 *  cannot join the list payload by accident. */
const cardColumns = {
  id: agentTemplates.id,
  workspaceId: agentTemplates.workspaceId,
  slug: agentTemplates.slug,
  name: agentTemplates.name,
  summary: agentTemplates.summary,
  category: agentTemplates.category,
  tags: agentTemplates.tags,
  mono: agentTemplates.mono,
  hue: agentTemplates.hue,
  locale: agentTemplates.locale,
  harness: agentTemplates.harness,
  minPlan: agentTemplates.minPlan,
  visibility: agentTemplates.visibility,
  origin: agentTemplates.origin,
  skillCount: agentTemplates.skillCount,
  scheduleCount: agentTemplates.scheduleCount,
  agentCount: agentTemplates.agentCount,
  automates: agentTemplates.automates,
  difficulty: agentTemplates.difficulty,
  timeToValueMinutes: agentTemplates.timeToValueMinutes,
  materializable: agentTemplates.materializable,
  useCount: agentTemplates.useCount,
  createdAt: agentTemplates.createdAt,
  updatedAt: agentTemplates.updatedAt,
} as const;

export type TemplateCardRow = {
  [K in keyof typeof cardColumns]: AgentTemplate[K & keyof AgentTemplate];
};

/** The visibility predicate. Nothing else in this file may widen it. */
function visibleTo(workspaceId: string, scope: TemplateListFilters["scope"]): SQL {
  const own = eq(agentTemplates.workspaceId, workspaceId);
  const platform = isNull(agentTemplates.workspaceId);
  const publicElsewhere = and(
    eq(agentTemplates.visibility, "public"),
    or(isNull(agentTemplates.workspaceId), ne(agentTemplates.workspaceId, workspaceId)),
  );
  if (scope === "workspace") return own;
  // `public` means "not mine", which is what the gallery's own filter means —
  // a workspace's own published template still appears under "Yours".
  if (scope === "public") return publicElsewhere!;
  return or(own, platform, publicElsewhere)!;
}

function listPredicate(filters: TemplateListFilters, workspaceId: string): SQL {
  const parts: (SQL | undefined)[] = [
    isNull(agentTemplates.archivedAt),
    visibleTo(workspaceId, filters.scope),
  ];
  if (filters.q) {
    const pattern = likePattern(filters.q);
    parts.push(
      or(
        sql`${agentTemplates.name} ilike ${pattern}`,
        sql`${agentTemplates.summary} ilike ${pattern}`,
        sql`${agentTemplates.automates} ilike ${pattern}`,
      ),
    );
  }
  if (filters.harnesses.length) parts.push(inArray(agentTemplates.harness, filters.harnesses));
  if (filters.categories.length) parts.push(inArray(agentTemplates.category, filters.categories));
  if (filters.difficulties.length) {
    parts.push(inArray(agentTemplates.difficulty, filters.difficulties));
  }
  if (filters.plans.length) parts.push(inArray(agentTemplates.minPlan, filters.plans));
  if (filters.role) {
    // There is no `role` column: a template's roles live inside the draft, and
    // denormalising a 1..3 array onto the row would be a third card column to
    // keep in step. Containment against the jsonb is unindexed, so it is applied
    // AFTER the indexed workspace/visibility predicates have already narrowed
    // the set — the row count reaching it is one gallery page's worth of
    // candidates, not the table.
    const probe = JSON.stringify([{ baseRoleId: filters.role }]);
    parts.push(sql`${agentTemplates.draft} -> 'roles' @> ${probe}::jsonb`);
  }
  return and(...parts)!;
}

function listOrder(sort: TemplateListFilters["sort"]): SQL[] {
  switch (sort) {
    case "name":
      return [asc(agentTemplates.name), asc(agentTemplates.id)];
    case "new":
      return [desc(agentTemplates.createdAt), asc(agentTemplates.id)];
    case "updated":
      return [desc(agentTemplates.updatedAt), asc(agentTemplates.id)];
    case "used":
    default:
      // `id` breaks every tie: without a total order, two pages of an equal
      // `use_count` can return the same row twice and omit another.
      return [desc(agentTemplates.useCount), asc(agentTemplates.name), asc(agentTemplates.id)];
  }
}

export interface TemplatePage {
  rows: TemplateCardRow[];
  total: number;
  page: number;
  perPage: number;
}

export async function listTemplates(
  filters: TemplateListFilters,
  workspaceId: string,
): Promise<TemplatePage> {
  const where = listPredicate(filters, workspaceId);
  const [rows, totals] = await Promise.all([
    db
      .select(cardColumns)
      .from(agentTemplates)
      .where(where)
      .orderBy(...listOrder(filters.sort))
      .limit(filters.perPage)
      .offset((filters.page - 1) * filters.perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(agentTemplates).where(where),
  ]);
  return {
    rows: rows as TemplateCardRow[],
    total: totals[0]?.n ?? 0,
    page: filters.page,
    perPage: filters.perPage,
  };
}

/** One template, if this workspace may READ it. `null` for a private row in
 *  another tenant — the route turns that into 404, not 403. */
export async function getTemplateForRead(
  id: string,
  workspaceId: string,
): Promise<AgentTemplate | null> {
  const [row] = await db
    .select()
    .from(agentTemplates)
    .where(and(eq(agentTemplates.id, id), visibleTo(workspaceId, "all")))
    .limit(1);
  return row ?? null;
}

/**
 * One template, if this workspace may WRITE it.
 *
 * Strictly `workspace_id = :ws`. A platform row (`workspace_id IS NULL`) is
 * deliberately excluded: it is readable by everyone, and letting any tenant
 * PATCH it would let one customer rewrite a template every other customer sees.
 *
 * An archived row is still returned — un-archiving is a PATCH, and a row you
 * cannot address is a row you cannot restore.
 */
export async function getTemplateForWrite(
  id: string,
  workspaceId: string,
): Promise<AgentTemplate | null> {
  const [row] = await db
    .select()
    .from(agentTemplates)
    .where(and(eq(agentTemplates.id, id), eq(agentTemplates.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

/** The slugs `ATG-L020` de-duplicates against. Bounded: a workspace with 5,000
 *  templates does not need all of them to name the 5,001st. */
export async function workspaceSlugs(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ slug: agentTemplates.slug })
    .from(agentTemplates)
    .where(eq(agentTemplates.workspaceId, workspaceId))
    .limit(500);
  return rows.map((r) => r.slug);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** `slug` is `varchar(48)` and unique per workspace. */
function suffixSlug(base: string, n: number): string {
  const tail = `-${n}`;
  return `${base.slice(0, 48 - tail.length)}${tail}`;
}

export interface CreateTemplateArgs {
  workspaceId: string;
  createdById: string;
  draft: AgentTemplateDraft;
  generationId?: string | null;
  visibility?: "private" | "workspace";
  nameOverride?: string;
}

/**
 * Persist a draft as a template.
 *
 * Every card column is recomputed from the draft by `templateColumnsFromDraft`
 * — nothing denormalized is read off the request. `materializable` comes from
 * the draft's own provenance, which only the linter writes.
 *
 * The slug retry is a loop and not an upfront `SELECT ... WHERE slug = ?`: the
 * check and the insert cannot be made atomic without a lock, so the constraint
 * is allowed to be the arbiter and a 23505 simply means "try the next suffix".
 */
export async function createTemplate(args: CreateTemplateArgs): Promise<AgentTemplate> {
  const columns: TemplateColumns = templateColumnsFromDraft(args.draft);
  const name = args.nameOverride ? args.nameOverride.slice(0, 60) : columns.name;
  const base = columns.slug;

  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = attempt === 0 ? base : suffixSlug(base, attempt + 1);
    try {
      const [row] = await db
        .insert(agentTemplates)
        .values({
          ...columns,
          slug,
          name,
          workspaceId: args.workspaceId,
          createdById: args.createdById,
          visibility: args.visibility ?? "private",
          origin: "generated",
          draft: args.draft,
          generationId: args.generationId ?? null,
        })
        .returning();
      return row;
    } catch (e) {
      if (!isUniqueViolation(e) || attempt === 5) throw e;
    }
  }
  // Unreachable: the loop either returns or throws.
  throw new Error("could not allocate a unique template slug");
}

export interface PatchTemplateArgs {
  name?: string;
  summary?: string;
  description?: string;
  category?: string;
  tags?: string[];
  visibility?: "private" | "workspace" | "public";
  minPlan?: AgentTemplate["minPlan"];
  draft?: AgentTemplateDraft;
  archived?: boolean;
}

/**
 * Edit a template this workspace owns.
 *
 * When `draft` is present every denormalized card column is recomputed from it,
 * in the same statement. Letting a caller change the draft without the counts
 * following is how a gallery ends up advertising "1 skill" over a template that
 * installs nine.
 */
export async function updateTemplate(
  id: string,
  workspaceId: string,
  patch: PatchTemplateArgs,
): Promise<AgentTemplate | null> {
  const values: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.draft) {
    const columns = templateColumnsFromDraft(patch.draft);
    Object.assign(values, columns, { draft: patch.draft });
  }
  if (patch.name !== undefined) values.name = patch.name.slice(0, 60);
  if (patch.summary !== undefined) values.summary = patch.summary.slice(0, 200);
  if (patch.description !== undefined) values.description = patch.description.slice(0, 1200);
  if (patch.category !== undefined) values.category = patch.category.slice(0, 24);
  if (patch.tags !== undefined) values.tags = patch.tags.slice(0, 8);
  if (patch.visibility !== undefined) values.visibility = patch.visibility;
  if (patch.minPlan !== undefined) values.minPlan = patch.minPlan;
  if (patch.archived !== undefined) values.archivedAt = patch.archived ? new Date() : null;

  const [row] = await db
    .update(agentTemplates)
    .set(values)
    .where(and(eq(agentTemplates.id, id), eq(agentTemplates.workspaceId, workspaceId)))
    .returning();
  return row ?? null;
}

/**
 * DELETE is a soft delete, and that is not a euphemism: `agent_skills.origin_ref`
 * and `template_generations.template_id` point at this row, agents materialized
 * from it are running, and the audit answer to "where did this agent's skills
 * come from" must survive someone tidying the gallery. The gallery never shows
 * an archived row; materialize still resolves one.
 */
export async function archiveTemplate(id: string, workspaceId: string): Promise<boolean> {
  const [row] = await db
    .update(agentTemplates)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(agentTemplates.id, id),
        eq(agentTemplates.workspaceId, workspaceId),
        isNull(agentTemplates.archivedAt),
      ),
    )
    .returning({ id: agentTemplates.id });
  return Boolean(row);
}

/** Bumped once per successful materialization, by the materializer. */
export async function recordTemplateUse(id: string, now = new Date()): Promise<void> {
  await db
    .update(agentTemplates)
    .set({ useCount: sql`${agentTemplates.useCount} + 1`, lastUsedAt: now })
    .where(eq(agentTemplates.id, id));
}

// ---------------------------------------------------------------------------
// Generations
// ---------------------------------------------------------------------------

/** postgres.js surfaces the SQLSTATE on `.code`; 23505 is unique_violation. */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "23505";
}

export class GenerationConflictError extends Error {
  readonly generationId: string | null;
  constructor(generationId: string | null) {
    super("a generation is already running for this workspace");
    this.name = "GenerationConflictError";
    this.generationId = generationId;
  }
}

/**
 * Fail every `queued`/`running` row older than the stale window.
 *
 * Called before each attempt to start one. Without it, a serverless invocation
 * killed mid-pipeline leaves a row that the partial unique index treats as
 * in-flight forever, and the workspace can never generate again — a
 * self-inflicted denial of service with no operator-visible cause.
 */
export async function releaseStaleGenerations(workspaceId: string, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - ATG_LIMITS.STALE_AFTER_MS);
  await db
    .update(templateGenerations)
    .set({ status: "failed", errorCode: "stale_sweep", finishedAt: now, updatedAt: now })
    .where(
      and(
        eq(templateGenerations.workspaceId, workspaceId),
        inArray(templateGenerations.status, ["queued", "running"]),
        sql`${templateGenerations.createdAt} < ${cutoff}`,
      ),
    );
}

export interface GenerationQuota {
  /** False ⇒ 429. `limit` says which ceiling and `retryAfterSeconds` when. */
  allowed: boolean;
  limit: "hour" | "day" | null;
  retryAfterSeconds: number | null;
  /**
   * The month's model budget is spent. NOT a refusal: the route passes it to
   * the pipeline, which composes the whole draft deterministically. The user
   * gets a working template and the deployment gets a predictable bill.
   */
  budgetExhausted: boolean;
}

export async function checkGenerationQuota(
  workspaceId: string,
  now = new Date(),
): Promise<GenerationQuota> {
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // Counts come from `template_generations`, over `template_generations_ws_idx`.
  // One pass, and correct across serverless instances in a way an in-memory
  // token bucket is not.
  const [counts] = await db
    .select({
      hour: sql<number>`count(*) filter (where ${templateGenerations.createdAt} >= ${hourAgo})::int`,
      day: sql<number>`count(*)::int`,
    })
    .from(templateGenerations)
    .where(
      and(
        eq(templateGenerations.workspaceId, workspaceId),
        gte(templateGenerations.createdAt, dayAgo),
      ),
    );

  // Spend comes from `llm_usage` and NOT from `template_generations.cost_micro_usd`.
  // The generator records each model call with a fire-and-forget insert it does
  // not await, so the last call of a run can land after the generation row has
  // already been finalized — reading the denormalized column would undercount
  // exactly the workspace that is generating hardest. `llm_usage_workspace_idx`
  // covers this, and `kind = 'template_gen'` is written by every ATG stage call.
  const [spendRow] = await db
    .select({ micro: sql<string>`coalesce(sum(${llmUsage.costMicroUsd}), 0)::text` })
    .from(llmUsage)
    .where(
      and(
        eq(llmUsage.workspaceId, workspaceId),
        eq(llmUsage.kind, "template_gen"),
        gte(llmUsage.createdAt, monthStart),
      ),
    );

  const hour = counts?.hour ?? 0;
  const day = counts?.day ?? 0;
  const spend = Number(spendRow?.micro ?? 0);
  const budgetExhausted =
    Number.isFinite(spend) && spend >= ATG_LIMITS.MONTHLY_COST_MICRO_USD;

  if (hour >= ATG_LIMITS.PER_HOUR) {
    return { allowed: false, limit: "hour", retryAfterSeconds: 900, budgetExhausted };
  }
  if (day >= ATG_LIMITS.PER_DAY) {
    return { allowed: false, limit: "day", retryAfterSeconds: 3600, budgetExhausted };
  }
  return { allowed: true, limit: null, retryAfterSeconds: null, budgetExhausted };
}

export interface StartGenerationArgs {
  workspaceId: string;
  userId: string;
  brief: string;
  briefSha256: string;
  locale: Lang;
  harness: Harness;
  roleHint?: string | null;
  injectionFindings?: InjectionFinding[];
}

/**
 * Claim the workspace's one in-flight generation slot.
 *
 * The claim IS the insert: `template_generations_one_running` is a partial
 * unique index on `(workspace_id) where status in ('queued','running')`, so the
 * second concurrent request gets its 409 from a constraint violation rather
 * than from a check that raced. The pre-select below only exists to name the
 * generation already running, so the UI can offer to watch it.
 */
export async function startGeneration(args: StartGenerationArgs): Promise<TemplateGeneration> {
  const now = new Date();
  await releaseStaleGenerations(args.workspaceId, now);
  try {
    const [row] = await db
      .insert(templateGenerations)
      .values({
        workspaceId: args.workspaceId,
        userId: args.userId,
        status: "running",
        mode: "deterministic",
        locale: args.locale,
        harness: args.harness,
        brief: args.brief,
        briefSha256: args.briefSha256,
        roleHint: args.roleHint?.slice(0, 40) ?? null,
        injectionFindings: args.injectionFindings ?? [],
        startedAt: now,
      })
      .returning();
    return row;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const [running] = await db
      .select({ id: templateGenerations.id })
      .from(templateGenerations)
      .where(
        and(
          eq(templateGenerations.workspaceId, args.workspaceId),
          inArray(templateGenerations.status, ["queued", "running"]),
        ),
      )
      .limit(1);
    throw new GenerationConflictError(running?.id ?? null);
  }
}

/**
 * Append one stage trace, so a generation that dies mid-flight still says which
 * stage it died in.
 *
 * `stage_traces || $1` in SQL rather than read-modify-write in TypeScript: the
 * SSE writer and a concurrent cancel both touch this row, and a JS-side
 * concat would silently drop whichever wrote first.
 */
export async function appendStageTrace(id: string, trace: DraftStageTrace): Promise<void> {
  await db
    .update(templateGenerations)
    .set({
      stageTraces: sql`${templateGenerations.stageTraces} || ${JSON.stringify([trace])}::jsonb`,
      promptTokens: sql`${templateGenerations.promptTokens} + ${trace.promptTokens}`,
      completionTokens: sql`${templateGenerations.completionTokens} + ${trace.completionTokens}`,
      llmCalls: sql`${templateGenerations.llmCalls} + ${trace.engine === "llm" ? 1 : 0}`,
      updatedAt: new Date(),
    })
    .where(eq(templateGenerations.id, id));
}

export interface FinishGenerationArgs {
  draft: AgentTemplateDraft;
  mode: "llm" | "hybrid" | "deterministic";
  stageTraces: DraftStageTrace[];
  warnings: DraftWarning[];
  materializable: boolean;
  costMicroUsd?: number;
  startedAt: number;
}

export async function finishGeneration(
  id: string,
  args: FinishGenerationArgs,
): Promise<TemplateGeneration | null> {
  const now = new Date();
  const [row] = await db
    .update(templateGenerations)
    .set({
      // `needs_review` is not a failure — it is the linter saying a human has
      // to look at something before this becomes an agent. The route sends the
      // draft either way; only the button on the review screen differs.
      status: args.materializable ? "ready" : "needs_review",
      mode: args.mode,
      draft: args.draft,
      stageTraces: args.stageTraces,
      warnings: args.warnings,
      promptTokens: args.stageTraces.reduce((n, t) => n + t.promptTokens, 0),
      completionTokens: args.stageTraces.reduce((n, t) => n + t.completionTokens, 0),
      llmCalls: args.stageTraces.filter((t) => t.engine === "llm").length,
      costMicroUsd: Math.max(0, Math.round(args.costMicroUsd ?? 0)),
      durationMs: Math.max(0, Date.now() - args.startedAt),
      finishedAt: now,
      updatedAt: now,
    })
    .where(eq(templateGenerations.id, id))
    .returning();
  return row ?? null;
}

/** `errorCode` is a NORMALIZED class ("timeout", "stage_charter_failed"), never
 *  a provider body: those carry key fragments and verbatim prompt text, and
 *  this column is read by support staff. */
export async function failGeneration(
  id: string,
  errorCode: string,
  startedAt?: number,
): Promise<void> {
  const now = new Date();
  await db
    .update(templateGenerations)
    .set({
      status: "failed",
      errorCode: errorCode.slice(0, 40),
      ...(startedAt ? { durationMs: Math.max(0, Date.now() - startedAt) } : {}),
      finishedAt: now,
      updatedAt: now,
    })
    .where(and(eq(templateGenerations.id, id), inArray(templateGenerations.status, ["queued", "running"])));
}

export async function cancelGeneration(id: string, workspaceId: string): Promise<boolean> {
  const now = new Date();
  const [row] = await db
    .update(templateGenerations)
    .set({ status: "canceled", finishedAt: now, updatedAt: now })
    .where(
      and(
        eq(templateGenerations.id, id),
        eq(templateGenerations.workspaceId, workspaceId),
        inArray(templateGenerations.status, ["queued", "running"]),
      ),
    )
    .returning({ id: templateGenerations.id });
  return Boolean(row);
}

/** Scoped by workspace, always. A generation carries the customer's verbatim
 *  brief; reading another tenant's by uuid is the whole reason this takes two
 *  arguments and not one. */
export async function getGeneration(
  id: string,
  workspaceId: string,
): Promise<TemplateGeneration | null> {
  const [row] = await db
    .select()
    .from(templateGenerations)
    .where(and(eq(templateGenerations.id, id), eq(templateGenerations.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

/** Link a generation to the template it produced, so `use_count`, the audit
 *  trail and the "resume where I left off" path all resolve. */
export async function linkGenerationTemplate(id: string, templateId: string): Promise<void> {
  await db
    .update(templateGenerations)
    .set({ templateId, updatedAt: new Date() })
    .where(eq(templateGenerations.id, id));
}

/** Terminal, and deliberately NOT a bar to re-materializing the same template —
 *  that is what `agent_templates.use_count` counts. */
export async function markGenerationMaterialized(
  templateId: string,
  agentId: string,
): Promise<void> {
  await db
    .update(templateGenerations)
    .set({ status: "materialized", agentId, updatedAt: new Date() })
    .where(
      and(
        eq(templateGenerations.templateId, templateId),
        inArray(templateGenerations.status, ["ready", "needs_review"]),
      ),
    );
}
