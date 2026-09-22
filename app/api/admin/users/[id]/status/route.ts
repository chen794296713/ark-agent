import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { apiError, jsonPrivate, notFound, parseBody, requirePlatformRole } from "@/lib/api";
import { adminUserStatusSchema } from "@/lib/validation";
import { revokeAllSessions } from "@/lib/auth";
import { recordAdminAction, requestIp } from "@/lib/admin/audit";
import {
  adminUserColumns,
  isUuid,
  loadAdminUser,
  otherActiveAdminExists,
} from "@/lib/admin/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/users/:id/status — suspend or reinstate an account. */
export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await requirePlatformRole("admin");
  if (gate.res) return gate.res;
  const { id } = await params;
  if (!isUuid(id)) return apiError("Invalid user id", 400);

  const parsed = await parseBody(req, adminUserStatusSchema);
  if (parsed.res) return parsed.res;
  const next = parsed.data.status;

  // The actor is necessarily active (a suspended user holds no session), so a
  // self-targeted call is either a no-op or a self-lockout. Refuse both.
  if (gate.actor.id === id) {
    return apiError("You cannot change your own account status", 400);
  }

  const target = await loadAdminUser(id);
  if (!target) return notFound("User not found");

  if (target.status === next) {
    return jsonPrivate({ user: target, changed: false as const, sessionsRevoked: 0 });
  }

  // Suspending the last admin locks the platform out just as thoroughly as
  // demoting them: neither one can sign in to reverse the decision.
  if (next === "suspended" && target.platformRole === "admin" && !(await otherActiveAdminExists(id))) {
    return apiError("Cannot suspend the last remaining platform admin", 400);
  }

  const [updated] = await db
    .update(users)
    .set({ status: next, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning(adminUserColumns);

  // Same operation, not a follow-up call: getCurrentUser() already refuses a
  // suspended user, but leaving live rows behind means a reinstatement silently
  // hands back every session the account held before the suspension.
  const revoked = next === "suspended" ? await revokeAllSessions(id) : 0;

  await recordAdminAction({
    actorUserId: gate.actor.id,
    action: "status_changed",
    targetUserId: id,
    summary: `status ${target.status}→${next}${revoked ? `; ${revoked} sessions revoked` : ""}`,
    ip: requestIp(req),
  });

  return jsonPrivate({ user: updated ?? target, changed: true as const, sessionsRevoked: revoked });
}
