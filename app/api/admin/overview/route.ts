import { desc, eq, gte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  adminAuditLog,
  agents,
  agentStatusEnum,
  llmUsage,
  platformRoleEnum,
  users,
  userStatusEnum,
  workspaces,
} from "@/lib/db/schema";
import { jsonPrivate, requirePlatformRole } from "@/lib/api";
import {
  countAll,
  EMPTY_USAGE,
  usageTotalColumns,
  withErrorRate,
  type AdminUserRef,
} from "@/lib/admin/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
const RECENT_AUDIT = 20;

/**
 * GET /api/admin/overview — platform totals for the console landing page.
 *
 * Readable at `support`, like every other GET here; only mutations require
 * `admin`. This guard call is the entire authorization boundary — the app has
 * no middleware, so a route that forgets it is simply public.
 */
export async function GET() {
  const gate = await requirePlatformRole("support");
  if (gate.res) return gate.res;

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [userBuckets, newUsers, agentBuckets, workspaceRows, usageRows, auditRows] =
    await Promise.all([
      // One grouped scan answers both breakdowns; two queries would disagree
      // with each other under concurrent writes.
      db
        .select({ status: users.status, platformRole: users.platformRole, n: countAll() })
        .from(users)
        .groupBy(users.status, users.platformRole),
      db.select({ n: countAll() }).from(users).where(gte(users.createdAt, since)),
      db.select({ status: agents.status, n: countAll() }).from(agents).groupBy(agents.status),
      db.select({ n: countAll() }).from(workspaces),
      db.select(usageTotalColumns()).from(llmUsage).where(gte(llmUsage.createdAt, since)),
      recentAudit(),
    ]);

  const usersByStatus = zeroed(userStatusEnum.enumValues);
  const usersByRole = zeroed(platformRoleEnum.enumValues);
  let userTotal = 0;
  for (const row of userBuckets) {
    usersByStatus[row.status] += row.n;
    usersByRole[row.platformRole] += row.n;
    userTotal += row.n;
  }

  const agentsByStatus = zeroed(agentStatusEnum.enumValues);
  let agentTotal = 0;
  for (const row of agentBuckets) {
    agentsByStatus[row.status] += row.n;
    agentTotal += row.n;
  }
  // "Live" excludes the tombstone state, which otherwise inflates the headline
  // number for the whole lifetime of the platform.
  const terminated = agentsByStatus.terminated;

  return jsonPrivate({
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    users: {
      total: userTotal,
      newInWindow: newUsers[0]?.n ?? 0,
      byStatus: usersByStatus,
      byRole: usersByRole,
    },
    agents: { total: agentTotal, live: agentTotal - terminated, byStatus: agentsByStatus },
    workspaces: { total: workspaceRows[0]?.n ?? 0 },
    llm: withErrorRate(usageRows[0] ?? EMPTY_USAGE),
    audit: auditRows,
  });
}

function zeroed<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
}

async function recentAudit() {
  // Both FKs point at `users`, so each side needs its own alias.
  const actor = alias(users, "actor");
  const target = alias(users, "target");
  const rows = await db
    .select({
      id: adminAuditLog.id,
      action: adminAuditLog.action,
      summary: adminAuditLog.summary,
      ip: adminAuditLog.ip,
      createdAt: adminAuditLog.createdAt,
      actorId: actor.id,
      actorEmail: actor.email,
      actorName: actor.name,
      targetId: target.id,
      targetEmail: target.email,
      targetName: target.name,
    })
    .from(adminAuditLog)
    .leftJoin(actor, eq(actor.id, adminAuditLog.actorUserId))
    .leftJoin(target, eq(target.id, adminAuditLog.targetUserId))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(RECENT_AUDIT);

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    summary: r.summary,
    ip: r.ip,
    createdAt: r.createdAt,
    // Null once the referenced account is deleted: the FK is ON DELETE SET
    // NULL so the trail outlives the row it describes.
    actor: ref(r.actorId, r.actorEmail, r.actorName),
    target: ref(r.targetId, r.targetEmail, r.targetName),
  }));
}

function ref(id: string | null, email: string | null, name: string | null): AdminUserRef {
  return id && email !== null && name !== null ? { id, email, name } : null;
}
