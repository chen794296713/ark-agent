import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession, hashPassword, revokeAllSessions, verifyPassword } from "@/lib/auth";
import { apiError, json, parseBody, requireAuth } from "@/lib/api";
import { setPasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  const parsed = await parseBody(req, setPasswordSchema);
  if (parsed.res) return parsed.res;

  const { currentPassword, newPassword } = parsed.data;
  const { user } = auth.ctx;

  // An account created through Google/WeChat has no hash to verify against, so
  // it sets its first password here. Omitting the field is not a way past the
  // check: once a hash exists, a missing current password fails like a wrong one.
  if (user.passwordHash !== null) {
    if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
      return apiError("Current password is incorrect", 400);
    }
    if (currentPassword === newPassword) {
      return apiError("New password must be different from the current password", 400);
    }
  }

  await db
    .update(users)
    .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // Changing a password is how someone evicts whoever else holds a session, so
  // every session dies — including this one. Minting a fresh session right after
  // keeps the actor on the screen they are standing on instead of bouncing them
  // to /auth for the change they just made.
  await revokeAllSessions(user.id);
  await createSession(user.id);

  return json({ ok: true as const });
}
