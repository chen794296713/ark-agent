import "server-only";

/**
 * Skill selection: how a capability VERB becomes a real `skills` row.
 *
 * The whole point of this module is what it makes IMPOSSIBLE. A model asked to
 * name skills will invent `@acme/invoice-chaser@1.2.0` with total confidence, so
 * the model never emits a skill identifier at all: it names capabilities ("read
 * a bank statement CSV"), Postgres turns those into real
 * `(source, owner, slug, version)` tuples, and the optional rerank call can only
 * REORDER and ANNOTATE the list the database produced. An id in a rerank
 * response that is not in the candidate set is discarded and counted.
 *
 * `server-only`: this is the one ATG module that touches the database. The
 * gates, the ranking formula and the greedy selector live in
 * `lib/atg/deterministic.ts` — pure, client-safe, and shared verbatim with the
 * no-key path, because §8.5's central claim is that the fallback's skills are
 * real catalogue entries selected by exactly this pipeline. The dependency runs
 * one way: this module imports that one.
 *
 * ATG reads the catalogue and never writes it. It also must not hard-depend on
 * a populated one: an empty `skills` table yields zero candidates, one `info`
 * warning, and a draft whose every other section is unaffected. A `skills` table
 * that does not exist at all (the Skill Repository has not shipped) returns
 * SQLSTATE 42P01, which is caught HERE and only here — any other database error
 * propagates, because swallowing a connection failure as "no skills" would ship
 * silently degraded templates for a week before anyone noticed.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { Harness } from "@/lib/harness";
import type { Lang } from "@/lib/types";
import type { SkillRequirements } from "@/lib/runtime/types";
import {
  buildTemplateSkills,
  gateCandidate,
  rankCandidate,
  selectSkills,
  type CatalogCandidate,
  type SelectedSkill,
  type SkillSelection,
} from "./deterministic";
import type { CapabilityRequest } from "./schema";
import type { TemplateSkill } from "./types";

export type { CatalogCandidate, SelectedSkill, SkillSelection };
export { gateCandidate, rankCandidate, selectSkills, buildTemplateSkills };

/** Per capability. The ranker and the gates discard the noise. */
const PER_CAPABILITY_LIMIT = 40;
/** Across all capabilities, taken round-robin so one broad query cannot starve the rest. */
const POOL_LIMIT = 120;
/** Postgres `undefined_table`. The ONE error class this module absorbs. */
const UNDEFINED_TABLE = "42P01";

let missingTableLogged = false;

interface RawRow {
  id: string;
  source_id: string;
  owner_handle: string;
  slug: string;
  public_id: string;
  latest_version: string;
  name: string;
  summary: string;
  category: string;
  tags: unknown;
  risk_level: string;
  risk_score: number | string;
  blocked: boolean;
  status: string;
  requirements: unknown;
  harnesses: unknown;
  install: unknown;
  redistributable: boolean;
  downloads: number | string;
  stars: number | string;
  upstream_updated_at: Date | string | null;
  text_rank: number | string;
}

function rowsOf(result: unknown): RawRow[] {
  if (Array.isArray(result)) return result as RawRow[];
  const wrapped = (result as { rows?: unknown }).rows;
  return Array.isArray(wrapped) ? (wrapped as RawRow[]) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function asRequirements(value: unknown): SkillRequirements {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  return {
    bins: asStringArray(v.bins),
    env: asStringArray(v.env),
    config: asStringArray(v.config),
    os: asStringArray(v.os),
  };
}

function asRisk(value: string): CatalogCandidate["riskLevel"] {
  return value === "low" || value === "medium" || value === "high" ? value : "high";
}

function toCandidate(row: RawRow, capability: string): CatalogCandidate {
  const install = row.install as { mode?: unknown } | null;
  const updated = row.upstream_updated_at;
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    ownerHandle: String(row.owner_handle ?? ""),
    slug: String(row.slug),
    publicId: String(row.public_id),
    latestVersion: String(row.latest_version ?? "0.0.0"),
    name: String(row.name),
    summary: String(row.summary ?? ""),
    category: String(row.category),
    tags: asStringArray(row.tags),
    // An unrecognised band reads as `high`, which G4 gates out. Fail closed.
    riskLevel: asRisk(String(row.risk_level)),
    riskScore: Number(row.risk_score ?? 0),
    blocked: row.blocked === true,
    status: String(row.status),
    requirements: asRequirements(row.requirements),
    harnesses: asStringArray(row.harnesses) as Harness[],
    installMode: install && typeof install.mode === "string" ? install.mode : null,
    redistributable: row.redistributable === true,
    downloads: Number(row.downloads ?? 0),
    stars: Number(row.stars ?? 0),
    upstreamUpdatedAt:
      updated instanceof Date ? updated.toISOString() : updated ? String(updated) : null,
    textRank: Number(row.text_rank ?? 0),
    capability,
  };
}

const CANDIDATE_COLUMNS = sql`s.id, s.source_id, s.owner_handle, s.slug, s.public_id,
  s.latest_version, s.name, s.summary, s.category, s.tags, s.risk_level, s.risk_score,
  s.blocked, s.status, s.requirements, s.harnesses, s.install, s.redistributable,
  s.downloads, s.stars, s.upstream_updated_at`;

/**
 * One capability, one full-text query.
 *
 * `status = 'published'` is the most important predicate here. `skills.status`
 * defaults to `'draft'`, and `draft` means "discovered by sync, read by nobody";
 * without this line ATG would propose freshly-crawled, unreviewed third-party
 * code to users — precisely the failure the Skill Repository's safety design
 * exists to prevent. It is enforced in SQL AND re-asserted by `gateCandidate`,
 * because the tag fallback below is a second entry point.
 *
 * `websearch_to_tsquery` rather than `plainto_tsquery`: it tolerates the quoted
 * phrases and `-` negations a capability string may contain without throwing.
 */
async function queryOne(capability: string, harness: Harness): Promise<CatalogCandidate[]> {
  const harnessJson = JSON.stringify([harness]);
  const primary = await db.execute(sql`
    SELECT ${CANDIDATE_COLUMNS}, ts_rank(s.search_tsv, q) AS text_rank
      FROM skills s, websearch_to_tsquery('english', ${capability}) AS q
     WHERE s.search_tsv @@ q
       AND s.status = 'published'
       AND s.blocked = false
       AND s.harnesses @> ${harnessJson}::jsonb
     ORDER BY text_rank DESC, s.downloads DESC
     LIMIT ${PER_CAPABILITY_LIMIT}
  `);
  return rowsOf(primary).map((r) => toCandidate(r, capability));
}

/**
 * The niche-phrasing fallback: containment against `skills_tags_gin`, not an
 * `ILIKE` scan. Recall matters more than precision at this stage — the ranker
 * and the gates discard what does not fit — but a sequential scan of the whole
 * catalogue per capability does not.
 */
async function queryByTags(
  capability: string,
  tags: string[],
  harness: Harness,
): Promise<CatalogCandidate[]> {
  if (tags.length === 0) return [];
  const harnessJson = JSON.stringify([harness]);
  const out: CatalogCandidate[] = [];
  for (const tag of tags.slice(0, 5)) {
    const rows = await db.execute(sql`
      SELECT ${CANDIDATE_COLUMNS}, 0::float4 AS text_rank
        FROM skills s
       WHERE s.tags @> ${JSON.stringify([tag])}::jsonb
         AND s.status = 'published'
         AND s.blocked = false
         AND s.harnesses @> ${harnessJson}::jsonb
       ORDER BY s.downloads DESC
       LIMIT ${PER_CAPABILITY_LIMIT}
    `);
    for (const row of rowsOf(rows)) out.push(toCandidate(row, capability));
  }
  return out;
}

export interface RetrievalResult {
  candidates: CatalogCandidate[];
  /** True when the catalogue table is absent or empty — drives `ATG-L014`. */
  catalogUnavailable: boolean;
}

/**
 * Candidates for every capability, deduped by `(skill id, capability)` and
 * capped round-robin at 120.
 *
 * The dedupe key is the PAIR, not the id: the same skill legitimately covers two
 * capabilities, and collapsing it to one row would silently make the second
 * capability uncoverable while the first looked fine.
 */
export async function findCandidates(
  capabilities: CapabilityRequest[],
  harness: Harness,
): Promise<RetrievalResult> {
  const perCapability: CatalogCandidate[][] = [];
  try {
    for (const cap of capabilities) {
      const seen = new Set<string>();
      const rows: CatalogCandidate[] = [];
      for (const c of await queryOne(cap.capability, harness)) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        rows.push(c);
      }
      if (rows.length === 0) {
        for (const c of await queryByTags(cap.capability, cap.tags, harness)) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          rows.push(c);
        }
      }
      perCapability.push(rows);
    }
  } catch (e) {
    const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
    if (code !== UNDEFINED_TABLE) throw e;
    if (!missingTableLogged) {
      missingTableLogged = true;
      console.warn("[atg] skills table is absent; generating templates without catalogue skills");
    }
    return { candidates: [], catalogUnavailable: true };
  }

  const candidates: CatalogCandidate[] = [];
  for (let i = 0; candidates.length < POOL_LIMIT; i++) {
    let drew = false;
    for (const rows of perCapability) {
      if (i >= rows.length) continue;
      drew = true;
      candidates.push(rows[i]);
      if (candidates.length >= POOL_LIMIT) break;
    }
    if (!drew) break;
  }

  return { candidates, catalogUnavailable: candidates.length === 0 };
}

// ---------------------------------------------------------------------------
// Rerank resolution — the model may only reorder and annotate
// ---------------------------------------------------------------------------

export interface RerankItem {
  id: string;
  purpose: string;
  required: boolean;
}

export interface RerankResolution {
  skills: TemplateSkill[];
  /** Ids the model returned that the database never offered. */
  invented: number;
  /** Ids the model returned that a hard gate refuses. High risk is the usual one. */
  refused: number;
}

/**
 * Turn a rerank response into draft rows, discarding everything the model was
 * not entitled to say.
 *
 * Three discards, in order of how much they matter:
 *
 *  1. **Invented ids.** An id outside the candidate set is dropped and counted.
 *     There is no lookup, no fuzzy match, no "did you mean" — a model that
 *     names a skill we did not offer is hallucinating, and resolving its guess
 *     would be doing the hallucination's work for it.
 *  2. **Gated ids.** The gates run again on the survivors. A `high`-risk skill
 *     is never auto-selected however persuasively the model argues for it;
 *     reaching one requires a deliberate act in the editor, which is what sets
 *     `riskAccepted`.
 *  3. **Overflow.** At most `MAX_SKILLS`, deterministic rank order as the
 *     tiebreak, so the model's ordering never smuggles in a ninth.
 *
 * The model's `purpose` line survives — it is the one thing it is genuinely
 * better at — but it is rendered as text and never executed, like every other
 * string that came from a model or a publisher.
 */
export function resolveRerank(
  items: RerankItem[],
  candidates: CatalogCandidate[],
  capabilities: CapabilityRequest[],
  roleId: string,
  harness: Harness,
  lang: Lang,
  maxSkills = 8,
  now = Date.now(),
): RerankResolution {
  const byId = new Map<string, CatalogCandidate>();
  for (const c of candidates) if (!byId.has(c.id)) byId.set(c.id, c);
  const capabilityByText = new Map(capabilities.map((c) => [c.capability, c]));

  let invented = 0;
  let refused = 0;
  const chosen: SelectedSkill[] = [];
  const takenIds = new Set<string>();
  const categories = new Set<string>();

  for (const item of items) {
    const candidate = byId.get(item.id);
    if (!candidate) {
      invented += 1;
      continue;
    }
    if (gateCandidate(candidate, harness) !== null) {
      refused += 1;
      continue;
    }
    if (takenIds.has(candidate.id)) continue;
    const capability =
      capabilityByText.get(candidate.capability) ??
      ({
        capability: candidate.capability,
        roleKey: "role-1",
        necessity: item.required ? "must" : "nice",
        tags: [],
      } satisfies CapabilityRequest);
    const ranked = rankCandidate(candidate, roleId, categories, harness, now);
    takenIds.add(candidate.id);
    categories.add(candidate.category);
    chosen.push({
      candidate,
      capability,
      required: item.required,
      score: ranked.score,
      reasons: ranked.reasons,
    });
    if (chosen.length >= maxSkills) break;
  }

  const skills = buildTemplateSkills(chosen, lang).map((skill, i) => ({
    ...skill,
    // The model's own sentence, kept — it is written for the person approving
    // the template, which the deterministic template string cannot be.
    purpose: (items.find((it) => it.id === chosen[i].candidate.id)?.purpose ?? skill.purpose)
      .trim()
      .slice(0, 160),
  }));

  return { skills, invented, refused };
}
