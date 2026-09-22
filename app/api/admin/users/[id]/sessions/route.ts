import { z } from "zod";
import type { User } from "@/lib/db/schema";
import { apiError, jsonPrivate, notFound, parseBody, requirePlatformRole } from "@/lib/api";
import { revokeAllSessions } from "@/lib/auth";
import { recordAdminAction, requestIp } from "@/lib/admin/audit";
import { isUuid, loadAdminUser } from "@/lib/admin/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** The only action this endpoint takes; `.strict()` so a typo is a 422. */
const sessionActionSchema = z.object({ action: z.literal("revoke") }).strict();

/** POST /api/admin/users/:id/sessions — body `{ action: "revoke" }`. */
export async function POST(req: Request, ctx: Ctx) {
  // The gate runs before the body is looked at: an anonymous caller must get
  // 401, not a validation report that confirms the endpoint's shape.
  const gate = await requirePlatformRole("admin");
  if (gate.res) return gate.res;
  const parsed = await parseBody(req, sessionActionSchema);
  if (parsed.res) return parsed.res;
  return revoke(req, ctx, gate.actor);
}

/** DELETE /api/admin/users/:id/sessions — same effect, no body. */
export async function DELETE(req: Request, ctx: Ctx) {
  const gate = await requirePlatformRole("admin");
  if (gate.res) return gate.res;
  return revoke(req, ctx, gate.actor);
}

async function revoke(req: Request, { params }: Ctx, actor: User) {
  const { id } = await params;
  if (!isUuid(id)) return apiError("Invalid user id", 400);

  const target = await loadAdminUser(id);
  if (!target) return notFound("User not found");

  const revoked = await revokeAllSessions(id);

  await recordAdminAction({
    actorUserId: actor.id,
    action: "sessions_revoked",
    targetUserId: id,
    summary: `revoked ${revoked} sessions`,
    ip: requestIp(req),
  });

  return jsonPrivate({
    ok: true as const,
    revoked,
    // Revoking your own sessions is allowed — it is "sign out everywhere", not
    // a lockout — but the cookie that carried this request is now dead, so the
    // console has to send itself to /auth instead of rendering a stale page.
    selfRevoked: actor.id === id,
  });
}
