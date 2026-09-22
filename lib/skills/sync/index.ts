import "server-only";

/**
 * `runSync(source, opts)` — the one implementation behind all three triggers:
 * `npm run skills:sync`, `POST /api/skills/sync`, and Vercel Cron.
 *
 * Three properties are load-bearing and each one has a failure mode that is
 * silent if it is got wrong:
 *
 *  1. **The lease is claimed and ALWAYS released.** Serverless has no
 *     process-local mutex, so a cron run and a hand-triggered admin run would
 *     otherwise double-crawl the same cursor and double-count the stats. The 15
 *     minutes is a CRASH ceiling, not a cooldown: a 20-second run that left the
 *     lock set would 409 every operator retry for the rest of the quarter hour,
 *     so the release is in a `finally` and runs on failure as well as success.
 *  2. **Upstream shape is validated, and drift is not an error.** A feed that
 *     changed shape must not write garbage into a table every customer reads,
 *     and must not page a human at 03:10 either. It is recorded as
 *     `schema_drift` on the source row and the page is skipped.
 *  3. **Sync never writes curation.** `status`, `verified`, `popularity`,
 *     `review_note` and `category` are set on INSERT and untouched on UPDATE. A
 *     crawler that could republish what a human unpublished is not a crawler,
 *     it is a bypass.
 *
 * Degradation: with no `GITHUB_TOKEN` the GitHub-backed sources are skipped with
 * a recorded notice rather than failing; with no rows in `skill_sources` every
 * call is a clean `unknown_source`; with no network the run ends `error` and the
 * catalogue keeps serving what it already has. Nothing here needs
 * `OPENROUTER_API_KEY` — the scorer is arithmetic.
 */
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { skills, skillSources } from "@/lib/db/schema";
import type { SyncStats } from "@/lib/runtime/types";
import type { SkillInstall } from "../types";
import type { SyncMode } from "../validation";
import { fetchUpstream, readJson, SyncError, upstreamUrl } from "./fetch";
import { normalizeSkill, type NormalizedSkill, type SourceLike, type UpstreamSkill } from "./normalize";

export { SyncError } from "./fetch";

/** The lease. Long enough to survive a slow page, short enough to self-heal a crash. */
const LEASE_MINUTES = 15;

export interface RunSyncOptions {
  mode: SyncMode;
  maxPages: number;
  cursor?: string;
  dryRun: boolean;
}

export interface RunSyncResult {
  source: string;
  mode: SyncMode;
  dryRun: boolean;
  stats: Required<SyncStats>;
  cursor: string | null;
  done: boolean;
  error?: string;
}

export type RunSyncOutcome =
  | { ok: true; result: RunSyncResult }
  | { ok: false; reason: "unknown_source" | "disabled" | "locked" };

const emptyStats = (): Required<SyncStats> => ({
  fetched: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  blocked: 0,
  durationMs: 0,
});

// ---------------------------------------------------------------------------
// Upstream schemas. Anything that does not parse is drift, never a 500.
// ---------------------------------------------------------------------------

const clawhubPage = z.object({
  skills: z
    .array(
      z.object({
        slug: z.string().min(1).max(200),
        ownerHandle: z.string().max(200).optional(),
        name: z.string().max(400).optional(),
        description: z.string().max(20_000).optional(),
        topics: z.array(z.string().max(200)).max(64).optional(),
        downloads: z.number().optional(),
        stars: z.number().optional(),
        version: z.string().max(200).optional(),
        updatedAt: z.string().max(60).optional(),
        suspicious: z.boolean().optional(),
      }),
    )
    .max(500),
  nextCursor: z.string().max(2000).nullish(),
});

const mcpPage = z.object({
  servers: z
    .array(
      z.object({
        server: z.object({
          name: z.string().min(1).max(300),
          title: z.string().max(300).optional(),
          description: z.string().max(20_000).optional(),
          version: z.string().max(200).optional(),
          remotes: z
            .array(z.object({ type: z.string().max(40).optional(), url: z.string().max(1000).optional() }))
            .max(20)
            .optional(),
        }),
        _meta: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .max(500),
  metadata: z.object({ nextCursor: z.string().max(2000).nullish() }).optional(),
});

interface Page {
  rows: UpstreamSkill[];
  nextCursor: string | null;
  /** Rows the adapter itself refused — a suspicious flag, a bad segment, a stale version. */
  skipped: number;
}

const parseDate = (s: string | undefined): Date | null => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
};

/**
 * ClawHub. `nonSuspiciousOnly=true` is sent AND the per-row `suspicious` flag is
 * re-checked: a query parameter is a request, not a guarantee, and this is the
 * directory ClawHavoc was run against.
 *
 * `ownerHandle` is taken from the listing when it is there and the row is
 * skipped when it is not. The published listing endpoint omits it, and the
 * documented recovery is one `/search?mode=exact` request PER ROW — 200 extra
 * requests per page against a directory we self-limit on. A row whose publisher
 * we cannot name is a row we cannot key, attribute, or denylist, and inventing
 * an empty owner would collapse every publisher of a given slug onto one
 * catalogue entry. It is counted in `skipped`, so the gap is visible.
 */
async function fetchClawhub(base: string, cursor: string | null): Promise<Page> {
  const url = upstreamUrl(base, "skills");
  url.searchParams.set("limit", "200");
  url.searchParams.set("sort", "updated");
  url.searchParams.set("nonSuspiciousOnly", "true");
  if (cursor) url.searchParams.set("cursor", cursor);

  const parsed = clawhubPage.safeParse(await readJson(await fetchUpstream(url)));
  if (!parsed.success) throw new SyncError("schema_drift");

  let skipped = 0;
  const rows: UpstreamSkill[] = [];
  for (const s of parsed.data.skills) {
    if (s.suspicious === true || !s.ownerHandle) {
      skipped += 1;
      continue;
    }
    const version = s.version ?? "0.0.0";
    const install: SkillInstall = { mode: "registry", registry: "clawhub", ref: s.slug, version };
    rows.push({
      ownerHandle: s.ownerHandle,
      slug: s.slug,
      name: s.name ?? s.slug,
      summary: (s.description ?? "").slice(0, 400),
      description: s.description ?? "",
      publisherName: s.ownerHandle,
      publisherVerified: false,
      topics: s.topics ?? [],
      format: "agent_skill",
      sourceUrl: `https://clawhub.ai/${encodeURIComponent(s.ownerHandle)}/skills/${encodeURIComponent(s.slug)}`,
      homepageUrl: null,
      // No ClawHub listing endpoint returns a licence. UNKNOWN is the honest
      // value and it gates `install.mode = "inline"`, which we never use here.
      license: "UNKNOWN",
      version,
      stars: s.stars ?? 0,
      downloads: s.downloads ?? 0,
      upstreamUpdatedAt: parseDate(s.updatedAt),
      requirements: {},
      permissions: {},
      install,
      provenance: "unavailable",
    });
  }
  return { rows, nextCursor: parsed.data.nextCursor ?? null, skipped };
}

/** The MCP registry returns every historical version; only `active` + `isLatest` is a row. */
async function fetchMcpRegistry(base: string, cursor: string | null): Promise<Page> {
  const url = upstreamUrl(base, "servers");
  url.searchParams.set("limit", "100");
  if (cursor) url.searchParams.set("cursor", cursor);

  const parsed = mcpPage.safeParse(await readJson(await fetchUpstream(url)));
  if (!parsed.success) throw new SyncError("schema_drift");

  let skipped = 0;
  const rows: UpstreamSkill[] = [];
  for (const entry of parsed.data.servers) {
    const meta = entry._meta?.["io.modelcontextprotocol.registry/official"];
    const official = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
    if (official.status !== "active" || official.isLatest !== true) {
      skipped += 1;
      continue;
    }
    // Reverse-DNS names: `io.github.owner/server`. The last segment is the slug
    // and the one before it the owner; anything else is drift, not a guess.
    const parts = entry.server.name.split("/");
    const slug = parts[parts.length - 1] ?? "";
    const owner = parts.length > 1 ? (parts[0].split(".").pop() ?? "") : "";
    if (!slug) {
      skipped += 1;
      continue;
    }
    const remote = entry.server.remotes?.find((r) => typeof r.url === "string" && r.url);
    const install: SkillInstall = remote?.url
      ? { mode: "mcp_http", url: remote.url, headerEnv: [] }
      : { mode: "mcp_stdio", command: "npx", args: ["-y", entry.server.name], env: [] };
    rows.push({
      ownerHandle: owner,
      slug,
      name: entry.server.title ?? slug,
      summary: (entry.server.description ?? "").slice(0, 400),
      description: entry.server.description ?? "",
      publisherName: owner,
      publisherVerified: false,
      topics: ["mcp"],
      format: "mcp_server",
      sourceUrl: `https://registry.modelcontextprotocol.io/v0/servers?search=${encodeURIComponent(entry.server.name)}`,
      homepageUrl: null,
      license: "UNKNOWN",
      version: entry.server.version ?? "0.0.0",
      stars: 0,
      downloads: 0,
      upstreamUpdatedAt: parseDate(typeof official.updatedAt === "string" ? official.updatedAt : undefined),
      requirements: { config: ["mcp.client"] },
      // An MCP server reaches a declared endpoint over the network and holds
      // whatever the header env names. `declared-hosts` is the honest floor; the
      // curation pass tightens or loosens it with a human's name on it.
      permissions: { network: "declared-hosts" },
      install,
      provenance: "unavailable",
    });
  }
  return { rows, nextCursor: parsed.data.metadata?.nextCursor ?? null, skipped };
}

// ---------------------------------------------------------------------------
// Persist
// ---------------------------------------------------------------------------

/**
 * One row at a time rather than one statement per page.
 *
 * The obvious spelling — a 200-row `INSERT … ON CONFLICT` inside a transaction —
 * loses the whole page when a single row trips the `public_id` unique index, and
 * that index is exactly the one a collision is expected on. Per row, a bad row
 * costs a `skipped` and the other 199 land.
 *
 * The UPDATE column list is upstream FACTS only. `status`, `verified`,
 * `popularity`, `review_note` and `category` are curation and appear only in the
 * INSERT.
 */
async function upsert(row: NormalizedSkill): Promise<"created" | "updated" | "skipped"> {
  const insertValues = {
    publicId: row.publicId,
    sourceId: row.sourceId,
    ownerHandle: row.ownerHandle,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    description: row.description,
    publisherName: row.publisherName,
    publisherVerified: row.publisherVerified,
    category: row.category,
    format: row.format,
    tags: row.tags,
    harnessCompat: row.harnessCompat,
    harnesses: row.harnesses,
    requirements: row.requirements,
    permissions: row.permissions,
    install: row.install,
    redistributable: row.redistributable,
    license: row.license,
    riskLevel: row.riskLevel,
    riskScore: row.riskScore,
    riskSignals: row.riskSignals,
    riskScoredAt: new Date(),
    blocked: row.blocked,
    blockReason: row.blockReason,
    status: row.status,
    provenance: row.provenance,
    sourceUrl: row.sourceUrl,
    attributionUrl: row.attributionUrl,
    homepageUrl: row.homepageUrl,
    stars: row.stars,
    downloads: row.downloads,
    upstreamUpdatedAt: row.upstreamUpdatedAt,
    upstreamFetchedAt: new Date(),
    latestVersion: row.latestVersion,
  };

  try {
    const result = await db
      .insert(skills)
      .values(insertValues)
      .onConflictDoUpdate({
        target: [skills.sourceId, skills.ownerHandle, skills.slug],
        set: {
          name: insertValues.name,
          summary: insertValues.summary,
          description: insertValues.description,
          publisherName: insertValues.publisherName,
          tags: insertValues.tags,
          harnessCompat: insertValues.harnessCompat,
          harnesses: insertValues.harnesses,
          requirements: insertValues.requirements,
          permissions: insertValues.permissions,
          install: insertValues.install,
          // A licence only ever improves — an endpoint that returns none must
          // not un-resolve one a better-informed run already established. The
          // two columns move together: `redistributable` is a fact ABOUT the
          // licence, so it has to follow whichever licence won the CASE, not the
          // one that happened to arrive.
          license: sql`case when ${skills.license} in ('', 'UNKNOWN', 'NONE', 'NOASSERTION') then ${row.license} else ${skills.license} end`,
          redistributable: sql`case when ${skills.license} in ('', 'UNKNOWN', 'NONE', 'NOASSERTION') then ${row.redistributable} else ${skills.redistributable} end`,
          riskLevel: insertValues.riskLevel,
          riskScore: insertValues.riskScore,
          riskSignals: insertValues.riskSignals,
          riskScoredAt: insertValues.riskScoredAt,
          // MONOTONIC, and both halves in ONE statement — which is what keeps
          // the schema's `blocked = (status = 'blocked')` invariant true at
          // every instant. Sync may BLOCK and may never unblock: a plain
          // `blocked: row.blocked` writes `false` over a row a human blocked
          // last week, leaving `blocked = false` beside `status = 'blocked'`
          // (the invariant broken) and re-listing a skill someone took down.
          // Unblocking is curation and has its own audited admin verb.
          blocked: sql`${skills.blocked} or ${row.blocked}`,
          ...(row.blocked ? { status: "blocked" as const, blockReason: row.blockReason } : {}),
          provenance: insertValues.provenance,
          sourceUrl: insertValues.sourceUrl,
          attributionUrl: insertValues.attributionUrl,
          homepageUrl: insertValues.homepageUrl,
          stars: insertValues.stars,
          downloads: insertValues.downloads,
          upstreamUpdatedAt: insertValues.upstreamUpdatedAt,
          upstreamFetchedAt: insertValues.upstreamFetchedAt,
          latestVersion: insertValues.latestVersion,
          updatedAt: new Date(),
        },
      })
      // `xmax = 0` is true only on the INSERT arm of an upsert, so it separates
      // created from updated without a second round trip.
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    return result[0]?.inserted ? "created" : "updated";
  } catch {
    // A `public_id` collision between two distinct identities. The row is
    // skipped rather than retried here: the disambiguating mint would change the
    // key every consumer holds, and doing that silently inside a crawler is
    // worse than one missing row an operator can see in the stats.
    return "skipped";
  }
}

// ---------------------------------------------------------------------------
// The orchestrator
// ---------------------------------------------------------------------------

export async function runSync(sourceId: string, opts: RunSyncOptions): Promise<RunSyncOutcome> {
  const started = Date.now();

  const [source] = await db.select().from(skillSources).where(eq(skillSources.id, sourceId)).limit(1);
  if (!source) return { ok: false, reason: "unknown_source" };
  if (!source.enabled) return { ok: false, reason: "disabled" };

  // The claim. No row back means another run holds the lease — an expected
  // outcome, not a failure.
  const claimed = await db
    .update(skillSources)
    .set({ syncLockUntil: sql`now() + make_interval(mins => ${LEASE_MINUTES})` })
    .where(
      and(
        eq(skillSources.id, sourceId),
        eq(skillSources.enabled, true),
        or(isNull(skillSources.syncLockUntil), lt(skillSources.syncLockUntil, sql`now()`)),
      ),
    )
    .returning({ cursor: skillSources.syncCursor });
  if (claimed.length === 0) return { ok: false, reason: "locked" };

  const sourceLike: SourceLike = {
    id: source.id,
    trust: source.trust,
    autoPublish: source.autoPublish,
    attributionTemplate: source.attributionTemplate,
  };

  const stats = emptyStats();
  let cursor = opts.cursor ?? claimed[0].cursor ?? null;
  let done = false;
  let error: string | undefined;

  try {
    // A source with no API base is a curated list or a manual entry: there is
    // nothing to crawl and saying so is not an error.
    const base = source.apiBaseUrl;
    const fetcher =
      base && source.id === "clawhub"
        ? fetchClawhub
        : base && source.id === "mcp-registry"
          ? fetchMcpRegistry
          : null;

    if (!fetcher || !base) {
      done = true;
      error = "no_crawler";
    } else {
      const perPageDelayMs = Math.ceil(60_000 / Math.max(1, source.rateLimitPerMin));
      for (let page = 0; page < opts.maxPages; page += 1) {
        const result = await fetcher(base, cursor);
        stats.fetched += result.rows.length;
        stats.skipped += result.skipped;

        for (const up of result.rows) {
          const row = normalizeSkill(sourceLike, up);
          if (row.blocked) stats.blocked += 1;
          if (opts.dryRun) {
            stats.skipped += 1;
            continue;
          }
          const outcome = await upsert(row);
          if (outcome === "created") stats.created += 1;
          else if (outcome === "updated") stats.updated += 1;
          else stats.skipped += 1;
        }

        cursor = result.nextCursor;
        if (!cursor) {
          done = true;
          break;
        }
        // Self-limit well under the documented ceiling: a bug on our side must
        // not be able to get the platform IP-banned.
        if (page + 1 < opts.maxPages) await new Promise((r) => setTimeout(r, perPageDelayMs));
      }
    }
  } catch (e) {
    // Normalized class only. An upstream failure is not a 500 — the sync
    // succeeded in doing what it could, and the class lands on the source row.
    error = e instanceof SyncError ? e.code : "network";
  } finally {
    stats.durationMs = Date.now() - started;
    // Released on success AND on failure. A lease left set after a 20-second run
    // 409s every operator retry for the next quarter hour.
    await db
      .update(skillSources)
      .set({
        syncLockUntil: null,
        lastSyncedAt: new Date(),
        lastSyncStatus: error ? "error" : "ok",
        lastSyncError: error ? error.slice(0, 200) : null,
        lastSyncStats: stats,
        // A dry run must not move the cursor — the next real run would skip
        // exactly the pages nobody wrote.
        ...(opts.dryRun ? {} : { syncCursor: cursor }),
        updatedAt: new Date(),
      })
      .where(eq(skillSources.id, sourceId));
  }

  return {
    ok: true,
    result: {
      source: sourceId,
      mode: opts.mode,
      dryRun: opts.dryRun,
      stats,
      cursor,
      done,
      ...(error ? { error } : {}),
    },
  };
}
