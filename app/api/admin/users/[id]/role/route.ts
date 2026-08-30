import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { apiError, jsonPrivate, notFound, parseBody, requirePlatformRole } from "@/lib/api";
import { adminUserRoleSchema } from "@/lib/validation";
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

/**
 * PATCH /api/admin/users/:id/role
 *
 * No session revocation on demotion: `platformRole` is re-read from the users
 * row by getCurrentUser() on every request, so the loss of privilege lands on
 * the target's very next call without touching their sessions.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await requirePlatformRole("admin");
  if (gate.res) return gate.res;
  const { id } = await params;
  if (!isUuid(id)) return apiError("Invalid user id", 400);

  const parsed = await parseBody(req, adminUserRoleSchema);
  if (parsed.res) return parsed.res;
  const next = parsed.data.platformRole;

  // Self-demotion is how a platform ends up with nobody who can undo it.
  if (gate.actor.id === id) {
    return apiError("You cannot change your own platform role", 400);
  }

  const target = await loadAdminUser(id);
  if (!target) return notFound("User not found");

  if (target.platformRole === next) {
    return jsonPrivate({ user: target, changed: false as const });
  }

  if (target.platformRole === "admin" && !(await otherActiveAdminExists(id))) {
    return apiError("Cannot remove the last remaining platform admin", 400);
  }

  const [updated] = await db
    .update(users)
    .set({ platformRole: next, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning(adminUserColumns);

  await recordAdminAction({
    actorUserId: gate.actor.id,
    action: "role_changed",
    targetUserId: id,
    summary: `role ${target.platformRole}→${next}`,
    ip: requestIp(req),
  });

  return jsonPrivate({ user: updated ?? target, changed: true as const });
}
