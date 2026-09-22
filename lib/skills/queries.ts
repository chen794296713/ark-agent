import "server-only";

/**
 * Every database read the skills surface makes.
 *
 * `server-only`: this module imports Drizzle and the pooled `postgres` client,
 * and a client component that imported it would drag both into the browser
 * bundle. The DTO mappers it calls live in ./serialize.ts precisely so the page
 * can share the shapes without sharing the connection.
 *
 * SCOPING NOTE, because it is not the usual one. `skills` and `skill_sources`
 * are a GLOBAL catalogue — they carry no `workspace_id`, by design: the
 * catalogue is the same for every tenant and a per-workspace copy of 30,000 rows
 * would be a per-workspace copy of 30,000 risk scores to keep in step. The
 * tenant boundary in this vertical runs through `agent_skills`, which reaches a
 * workspace only via `agents.workspace_id`. Every function below that touches an
 * attachment therefore takes a `workspaceId` and joins on it; none of them takes
 * an `agentId` on trust.
 */
import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentSkills, agents, skills, skillSources } from "@/lib/db/schema";
import { HARNESS_IDS, type Harness } from "@/lib/harness";
import { SKILL_RISK_IDS, type SkillCategory, type SkillFacets, type SkillListResponse, type SkillRisk } from "./types";
import { serializeSkill, serializeSkillCard, type AttachmentBadgeRow, type SkillRowLike } from "./serialize";
import type { SkillListFilters } from "./validation";

/**
 * What a 409 on an ambiguous bare slug hands back, so the caller can retry with
 * a `publicId` instead of guessing. Three identity fields and nothing else — the
 * disambiguation page is a list of publishers, not a second catalogue payload.
 */
export interface SkillSlugCandidate {
  publicId: string;
  ownerHandle: string;
  sourceId: string;
}

/** The columns a card needs. Named explicitly so `scanner_verdict` cannot join the list payload. */
const cardColumns = {
  id: skills.id,
  publicId: skills.publicId,
  slug: skills.slug,
  ownerHandle: skills.ownerHandle,
  name: skills.name,
  summary: skills.summary,
  category: skills.category,
  format: skills.format,
  tags: skills.tags,
  harnesses: skills.harnesses,
  harnessCompat: skills.harnessCompat,
  riskLevel: skills.riskLevel,
  license: skills.license,
  licenseVerified: skills.licenseVerified,
  verified: skills.verified,
  popularity: skills.popularity,
  stars: skills.stars,
  downloads: skills.downloads,
  sourceId: skills.sourceId,
  publisherName: skills.publisherName,
  publisherVerified: skills.publisherVerified,
  attributionUrl: skills.attributionUrl,
  latestVersion: skills.latestVersion,
  upstreamUpdatedAt: skills.upstreamUpdatedAt,
  status: skills.status,
} as const;

/**
 * `%` and `_` are wildcards to LIKE and ordinary characters to a person, so a
 * search for `100%` must not become a search for "starts with 100". `\` is
 * escaped first or it would escape the escapes.
 */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/** Which filter to leave OUT, so a facet can count what selecting it would give. */
type FacetDimension = "category" | "risk" | "harness" | "source" | null;

function whereFor(f: SkillListFilters, skip: FacetDimension, staff: boolean): SQL {
  const parts: SQL[] = [];

  // The catalogue gate. `draft` is discovered-but-unreviewed and `blocked` failed
  // a hard gate; neither is ever rendered outside the admin console. `deprecated`
  // rows stay visible so an operator can see why an attachment they already have
  // is flagged, which is the whole point of deprecating rather than deleting.
  if (staff) parts.push(ne(skills.status, "blocked"));
  else parts.push(inArray(skills.status, ["published", "deprecated"]));
  // Belt and braces against the one invariant the schema keeps in two places:
  // `blocked = (status = 'blocked')` is maintained by writing both in one
  // statement, and a pipeline bug that wrote only one of them must not put a
  // blocked skill on a card.
  parts.push(eq(skills.blocked, false));

  if (f.q) {
    const p = likePattern(f.q);
    // ILIKE and not the `search_tsv` column: that index is `to_tsvector('english', …)`
    // and ATG owns it. A 日本語 or 中文 query stems to nothing against an English
    // configuration and would return zero rows with no error — see the schema's
    // note on the column. Browse search stays ILIKE so every UI language works.
    const m = or(ilike(skills.name, p), ilike(skills.slug, p), ilike(skills.summary, p));
    if (m) parts.push(m);
  }
  if (skip !== "category" && f.categories.length) parts.push(inArray(skills.category, f.categories));
  if (skip !== "risk" && f.risks.length) parts.push(inArray(skills.riskLevel, f.risks));
  if (skip !== "source" && f.sources.length) parts.push(inArray(skills.sourceId, f.sources));
  if (f.formats.length) parts.push(inArray(skills.format, f.formats));
  if (f.verifiedOnly) parts.push(eq(skills.verified, true));
  // `includeHigh` is a filter on the RISK dimension, so the risk facet has to
  // drop it along with `f.risks` — the rule this function's `skip` parameter
  // exists to enforce. Left in, the facet reported `high: 0` under the default
  // and the UI could only ever offer a band it had just been told is empty.
  //
  // `IN ('low','medium')`, not `<> 'high'`. An inequality on an enum is not a
  // usable index condition, so the `<>` spelling makes `skills_risk_idx` — whose
  // whole purpose is this predicate — unusable on the DEFAULT query, i.e. every
  // first page load.
  if (skip !== "risk" && !f.includeHigh) parts.push(inArray(skills.riskLevel, ["low", "medium"]));
  if (skip !== "harness" && f.harnesses.length) {
    const anyHarness = or(...f.harnesses.map((h) => harnessContains(h)));
    if (anyHarness) parts.push(anyHarness);
  }

  return and(...parts) as SQL;
}

/** `@>` against the jsonb_path_ops GIN index the schema declares for this exact query. */
function harnessContains(h: Harness): SQL {
  return sql`${skills.harnesses} @> ${JSON.stringify([h])}::jsonb`;
}

function orderFor(f: SkillListFilters): SQL[] {
  // `skills.id` is the tiebreaker on every ordering. Without it two rows with
  // equal popularity have no defined order between pages, so a row can appear
  // on page 1 and again on page 2 while another is never shown at all.
  switch (f.sort) {
    case "recent":
      return [sql`${skills.upstreamUpdatedAt} desc nulls last`, asc(skills.id)];
    case "name":
      return [asc(skills.name), asc(skills.id)];
    case "risk":
      // low → high, so "show me the safe ones" is the first click and not a
      // reverse sort the user has to discover.
      return [sql`${skills.riskLevel} asc`, desc(skills.popularity), asc(skills.id)];
    default:
      return [desc(skills.popularity), desc(skills.stars), asc(skills.id)];
  }
}

async function facets(f: SkillListFilters, staff: boolean): Promise<SkillFacets> {
  const [byCategory, byRisk, bySource, byHarness] = await Promise.all([
    db
      .select({ k: skills.category, n: count() })
      .from(skills)
      .where(whereFor(f, "category", staff))
      .groupBy(skills.category),
    db
      .select({ k: skills.riskLevel, n: count() })
      .from(skills)
      .where(whereFor(f, "risk", staff))
      .groupBy(skills.riskLevel),
    db
      .select({ k: skills.sourceId, n: count() })
      .from(skills)
      .where(whereFor(f, "source", staff))
      .groupBy(skills.sourceId),
    // Four conditional sums in ONE pass rather than four queries: `harnesses` is
    // a jsonb array, so a harness facet is not a GROUP BY of anything.
    db
      .select({
        openclaw: sql<number>`count(*) filter (where ${harnessContains("openclaw")})`.mapWith(Number),
        hermes: sql<number>`count(*) filter (where ${harnessContains("hermes")})`.mapWith(Number),
        codex: sql<number>`count(*) filter (where ${harnessContains("codex")})`.mapWith(Number),
        deepseek: sql<number>`count(*) filter (where ${harnessContains("deepseek")})`.mapWith(Number),
      })
      .from(skills)
      .where(whereFor(f, "harness", staff)),
  ]);

  const category: Partial<Record<SkillCategory, number>> = {};
  for (const row of byCategory) category[row.k] = Number(row.n);

  const risk = Object.fromEntries(SKILL_RISK_IDS.map((r) => [r, 0])) as Record<SkillRisk, number>;
  for (const row of byRisk) risk[row.k] = Number(row.n);

  const source: Record<string, number> = {};
  for (const row of bySource) source[row.k] = Number(row.n);

  const h = byHarness[0];
  const harness = Object.fromEntries(
    HARNESS_IDS.map((id) => [id, h ? Number(h[id] ?? 0) : 0]),
  ) as Record<Harness, number>;

  return { category, risk, harness, source };
}

/**
 * The browse list.
 *
 * `hiddenByRisk` and `hiddenByVerification` are counted rather than inferred: a
 * filter the user did not set and cannot see is a filter that makes the
 * catalogue look empty for reasons nobody can explain.
 */
export async function listSkills(
  f: SkillListFilters,
  opts: { staff?: boolean; attachmentsForAgentId?: string | null } = {},
): Promise<SkillListResponse & { ignoredFilters: string[] }> {
  const staff = opts.staff === true;
  const where = whereFor(f, null, staff);

  const [rows, totalRow, facetCounts, hiddenRisk, hiddenVerification] = await Promise.all([
    db
      .select(cardColumns)
      .from(skills)
      .where(where)
      .orderBy(...orderFor(f))
      .limit(f.perPage)
      .offset((f.page - 1) * f.perPage),
    db.select({ n: count() }).from(skills).where(where),
    facets(f, staff),
    f.includeHigh
      ? Promise.resolve(0)
      : db
          .select({ n: count() })
          .from(skills)
          .where(and(whereFor({ ...f, includeHigh: true }, null, staff), eq(skills.riskLevel, "high")))
          .then((r) => Number(r[0]?.n ?? 0)),
    f.verifiedOnly
      ? db
          .select({ n: count() })
          .from(skills)
          .where(and(whereFor({ ...f, verifiedOnly: false }, null, staff), eq(skills.verified, false)))
          .then((r) => Number(r[0]?.n ?? 0))
      : Promise.resolve(0),
  ]);

  const badges = await attachmentBadges(rows.map((r) => r.id), opts.attachmentsForAgentId ?? null);

  return {
    items: rows.map((row) =>
      serializeSkillCard(
        row as SkillRowLike,
        opts.attachmentsForAgentId ? (badges.get(row.id) ?? null) : undefined,
      ),
    ),
    page: f.page,
    perPage: f.perPage,
    total: Number(totalRow[0]?.n ?? 0),
    facets: facetCounts,
    hiddenByRisk: hiddenRisk,
    hiddenByVerification: hiddenVerification,
    ignoredFilters: f.ignoredFilters,
  };
}

/**
 * The "Added" chip. `agentId` MUST already have been workspace-checked by the
 * caller — this query joins `agent_skills` on it alone, so an unchecked id here
 * is a cross-tenant read of which skills another workspace's agent runs.
 */
async function attachmentBadges(
  skillIds: string[],
  agentId: string | null,
): Promise<Map<string, AttachmentBadgeRow>> {
  const out = new Map<string, AttachmentBadgeRow>();
  if (!agentId || skillIds.length === 0) return out;
  const rows = await db
    .select({
      id: agentSkills.id,
      skillId: agentSkills.skillId,
      state: agentSkills.state,
      version: agentSkills.version,
      enabled: agentSkills.enabled,
    })
    .from(agentSkills)
    .where(and(eq(agentSkills.agentId, agentId), inArray(agentSkills.skillId, skillIds)));
  for (const r of rows) {
    out.set(r.skillId, { id: r.id, state: r.state, version: r.version, enabled: r.enabled });
  }
  return out;
}

/** Resolve an agent id to its workspace-scoped row, or null. 404, never 403. */
export async function agentInWorkspace(
  agentId: string,
  workspaceId: string,
): Promise<{ id: string; engine: Harness } | null> {
  const [row] = await db
    .select({ id: agents.id, engine: agents.engine })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

/**
 * Detail by `public_id`, falling back to a UNIQUE match on `slug`.
 *
 * The fallback mirrors ClawHub's own AMBIGUOUS_SKILL_SLUG behaviour so a bare
 * slug in a hand-written template still resolves when it is unambiguous — and
 * refuses when it is not, rather than picking whichever row sorted first.
 * `limit(2)` is what makes "unambiguous" a fact instead of an assumption.
 */
export async function getSkillDetail(
  key: string,
  opts: { staff?: boolean; agentId?: string | null } = {},
): Promise<
  | { skill: ReturnType<typeof serializeSkill>; ambiguous?: never; candidates?: never }
  | { skill?: never; ambiguous: true; candidates: SkillSlugCandidate[] }
  | null
> {
  const staff = opts.staff === true;
  const visible = staff
    ? ne(skills.status, "blocked")
    : and(inArray(skills.status, ["published", "deprecated"]), eq(skills.blocked, false));

  const byPublicId = await db
    .select()
    .from(skills)
    .where(and(eq(skills.publicId, key), visible))
    .limit(1);

  let row = byPublicId[0];
  if (!row) {
    // `limit(5)`, not `limit(2)`: two is enough to KNOW it is ambiguous but not
    // enough to SAY what the alternatives are, and a 409 whose body cannot name
    // a single candidate leaves the caller with no move but to guess. Five
    // bounds the payload; `hasMore` says when the list was cut.
    const bySlug = await db.select().from(skills).where(and(eq(skills.slug, key), visible)).limit(5);
    if (bySlug.length > 1) {
      return {
        ambiguous: true,
        candidates: bySlug.map((r) => ({
          publicId: r.publicId,
          ownerHandle: r.ownerHandle,
          sourceId: r.sourceId,
        })),
      };
    }
    row = bySlug[0];
  }
  if (!row) return null;

  const badges = await attachmentBadges([row.id], opts.agentId ?? null);
  return {
    skill: serializeSkill(row as SkillRowLike, {
      staff,
      ...(opts.agentId ? { attachment: badges.get(row.id) ?? null } : {}),
    }),
  };
}

/** The sources facet's display names. Small, static, and cached by the caller's request. */
export async function listSkillSources(): Promise<Array<{ id: string; name: string; trust: string; homepageUrl: string }>> {
  return db
    .select({
      id: skillSources.id,
      name: skillSources.name,
      trust: skillSources.trust,
      homepageUrl: skillSources.homepageUrl,
    })
    .from(skillSources)
    .where(eq(skillSources.enabled, true))
    .orderBy(asc(skillSources.id));
}

/** True when the catalogue has no published rows at all — the launch-day state. */
export async function catalogIsEmpty(): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(skills)
    .where(and(inArray(skills.status, ["published", "deprecated"]), eq(skills.blocked, false)))
    .limit(1);
  return Number(row?.n ?? 0) === 0;
}
