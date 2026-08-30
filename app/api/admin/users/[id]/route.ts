import { and, desc, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agents,
  llmUsage,
  sessions,
  userIdentities,
  users,
  workspaceMembers,
  workspaces,
} from "@/lib/db/schema";
import { apiError, jsonPrivate, notFound, requirePlatformRole } from "@/lib/api";
import { revokeAllSessions } from "@/lib/auth";
import { recordAdminAction, requestIp } from "@/lib/admin/audit";
import {
  adminIdentityColumns,
  adminSessionColumns,
  EMPTY_USAGE,
  isUuid,
  loadAdminUser,
  otherActiveAdminExists,
  usageTotalColumns,
  utcBucket,
  withErrorRate,
  type UsageTotalsRow,
} from "@/lib/admin/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const WINDOW_DAYS = 30;

/** GET /api/admin/users/:id — the full support view of one account. */
export async function GET(_req: Request, { params }: Ctx) {
  const gate = await requirePlatformRole("support");
  if (gate.res) return gate.res;
  const { id } = await params;
  if (!isUuid(id)) return apiError("Invalid user id", 400);

  const user = await loadAdminUser(id);
  if (!user) return notFound("User not found");

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const inWindow = and(eq(llmUsage.userId, id), gte(llmUsage.createdAt, since));
  const dayBucket = utcBucket("day");

  const [wsRows, identities, sessionRows, byModel, byDay] = await Promise.all([
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        ownerId: workspaces.ownerId,
        memberRole: workspaceMembers.role,
        creditsIncluded: workspaces.creditsIncluded,
        creditsUsed: workspaces.creditsUsed,
        cycleResetsAt: workspaces.cycleResetsAt,
        createdAt: workspaces.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, id))
      .orderBy(desc(workspaces.createdAt)),
    db
      .select(adminIdentityColumns)
      .from(userIdentities)
      .where(eq(userIdentities.userId, id))
      .orderBy(desc(userIdentities.createdAt)),
    // Expired rows are dead weight in the console: they cannot authenticate,
    // and listing them makes "revoke sessions" look like it did nothing.
    db
      .select(adminSessionColumns)
      .from(sessions)
      .where(and(eq(sessions.userId, id), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.createdAt)),
    db
      .select({ provider: llmUsage.provider, model: llmUsage.model, ...usageTotalColumns() })
      .from(llmUsage)
      .where(inWindow)
      .groupBy(llmUsage.provider, llmUsage.model)
      .orderBy(desc(sql`sum(${llmUsage.totalTokens})`)),
    db
      .select({ day: dayBucket, ...usageTotalColumns() })
      .from(llmUsage)
      .where(inWindow)
      .groupBy(dayBucket)
      .orderBy(dayBucket),
  ]);

  const workspaceIds = wsRows.map((w) => w.id);
  const agentRows = workspaceIds.length
    ? await db
        .select({
          id: agents.id,
          name: agents.name,
          status: agents.status,
          engine: agents.engine,
          creditsUsed: agents.creditsUsed,
          roleId: agents.roleId,
          planTier: agents.planTier,
          workspaceId: agents.workspaceId,
          createdAt: agents.createdAt,
        })
        .from(agents)
        .where(inArray(agents.workspaceId, workspaceIds))
        .orderBy(desc(agents.createdAt))
    : [];

  // The daily buckets already cover the whole window, so the headline totals
  // are their sum rather than a fifth round trip that could disagree.
  const totals = byDay.reduce<UsageTotalsRow>(
    (acc, d) => ({
      calls: acc.calls + d.calls,
      promptTokens: acc.promptTokens + d.promptTokens,
      completionTokens: acc.completionTokens + d.completionTokens,
      totalTokens: acc.totalTokens + d.totalTokens,
      costMicroUsd: acc.costMicroUsd + d.costMicroUsd,
      errors: acc.errors + d.errors,
      estimatedCalls: acc.estimatedCalls + d.estimatedCalls,
    }),
    { ...EMPTY_USAGE },
  );

  return jsonPrivate({
    user,
    workspaces: wsRows.map(({ ownerId, ...w }) => ({ ...w, isOwner: ownerId === id })),
    agents: agentRows,
    identities,
    sessions: sessionRows,
    usage: {
      windowDays: WINDOW_DAYS,
      totals: withErrorRate(totals),
      byModel,
      // Sparse: only days that actually saw traffic appear here.
      byDay,
    },
  });
}

/**
 * DELETE /api/admin/users/:id — hard delete.
 *
 * Workspaces, agents, identities and sessions go with the row (ON DELETE
 * CASCADE). `llm_usage` and `admin_audit_log` do NOT: both are ON DELETE SET
 * NULL by design, so platform spend history and the trail of who did what
 * deliberately survive the account they describe.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const gate = await requirePlatformRole("admin");
  if (gate.res) return gate.res;
  const { id } = await params;
  if (!isUuid(id)) return apiError("Invalid user id", 400);

  if (gate.actor.id === id) {
    return apiError("You cannot delete your own account from the admin console", 400);
  }

  const target = await loadAdminUser(id);
  if (!target) return notFound("User not found");

  if (target.platformRole === "admin" && !(await otherActiveAdminExists(id))) {
    return apiError("Cannot delete the last remaining platform admin", 400);
  }

  // Explicit rather than relying on the sessions FK cascade: the guarantee we
  // owe is "the cookie stops working", and it should not quietly depend on a
  // migration keeping that ON DELETE rule.
  const revoked = await revokeAllSessions(id);
  await db.delete(users).where(eq(users.id, id));

  await recordAdminAction({
    actorUserId: gate.actor.id,
    action: "user_deleted",
    // The row is gone, so the FK would reject the id and the trail entry with
    // it — the identifying detail has to live in the summary instead.
    targetUserId: null,
    summary: `deleted account ${id} <${target.email}>; ${revoked} sessions revoked`,
    ip: requestIp(req),
  });

  return jsonPrivate({ ok: true as const, deletedId: id, sessionsRevoked: revoked });
}
