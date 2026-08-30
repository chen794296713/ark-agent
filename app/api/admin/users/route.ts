import { and, countDistinct, desc, eq, gte, ilike, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, llmUsage, userIdentities, users, workspaceMembers } from "@/lib/db/schema";
import { apiError, jsonPrivate, requirePlatformRole } from "@/lib/api";
import { adminUserQuerySchema } from "@/lib/validation";
import {
  adminUserColumns,
  countAll,
  EMPTY_USAGE,
  usageTotalColumns,
  withErrorRate,
} from "@/lib/admin/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

/**
 * `%` and `_` are wildcards to LIKE/ILIKE, so a raw `q` is not a search term —
 * it is a pattern. `q=%` becomes an unbounded sequential scan that any
 * support-tier session can fire at will, and a `_` in an email silently widens
 * the match. Backslash is Postgres's default LIKE escape character; escaping it
 * along with the two metacharacters makes the input literal again.
 */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** GET /api/admin/users — paginated directory with per-user rollups. */
export async function GET(req: Request) {
  const gate = await requirePlatformRole("support");
  if (gate.res) return gate.res;

  const url = new URL(req.url);
  // The schema is `.strict()`, so only known keys may be handed to it — an
  // unrelated query param (a cache-buster, a tracking tag) would 422 the page.
  const raw: Record<string, string> = {};
  for (const key of ["q", "role", "status", "page", "perPage"] as const) {
    const value = url.searchParams.get(key);
    if (value !== null && value !== "") raw[key] = value;
  }
  const parsed = adminUserQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError("Validation failed", 422, { issues: parsed.error.flatten() });
  }
  const { q, role, status, page, perPage } = parsed.data;

  const filters: SQL[] = [];
  if (role) filters.push(eq(users.platformRole, role));
  if (status) filters.push(eq(users.status, status));
  const term = q?.trim();
  if (term) {
    const pattern = `%${escapeLike(term)}%`;
    const match = or(ilike(users.email, pattern), ilike(users.name, pattern));
    if (match) filters.push(match);
  }
  const where = filters.length ? and(...filters) : undefined;

  const [totalRows, rows] = await Promise.all([
    db.select({ n: countAll() }).from(users).where(where),
    db
      .select(adminUserColumns)
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(perPage)
      .offset((page - 1) * perPage),
  ]);

  const ids = rows.map((r) => r.id);
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Rollups are scoped to the ids actually on this page, so the cost of the
  // list is bounded by `perPage` rather than by the size of the platform.
  const [agentCounts, identityCounts, usageRows] = ids.length
    ? await Promise.all([
        db
          .select({ userId: workspaceMembers.userId, n: countDistinct(agents.id) })
          .from(workspaceMembers)
          .innerJoin(agents, eq(agents.workspaceId, workspaceMembers.workspaceId))
          .where(inArray(workspaceMembers.userId, ids))
          .groupBy(workspaceMembers.userId),
        db
          .select({ userId: userIdentities.userId, n: countAll() })
          .from(userIdentities)
          .where(inArray(userIdentities.userId, ids))
          .groupBy(userIdentities.userId),
        db
          .select({ userId: llmUsage.userId, ...usageTotalColumns() })
          .from(llmUsage)
          .where(and(inArray(llmUsage.userId, ids), gte(llmUsage.createdAt, since)))
          .groupBy(llmUsage.userId),
      ])
    : [[], [], []];

  const agentByUser = new Map(agentCounts.map((r) => [r.userId, r.n]));
  const identityByUser = new Map(identityCounts.map((r) => [r.userId, r.n]));
  const usageByUser = new Map(
    usageRows.flatMap(({ userId, ...totals }) => (userId ? [[userId, totals] as const] : [])),
  );

  const total = totalRows[0]?.n ?? 0;
  return jsonPrivate({
    page,
    perPage,
    total,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
    windowDays: WINDOW_DAYS,
    users: rows.map((u) => ({
      ...u,
      agentCount: agentByUser.get(u.id) ?? 0,
      identityCount: identityByUser.get(u.id) ?? 0,
      usage: withErrorRate(usageByUser.get(u.id) ?? EMPTY_USAGE),
    })),
  });
}
