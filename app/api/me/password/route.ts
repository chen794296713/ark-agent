import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { apiError, json, parseBody, requireAuth } from "@/lib/api";
import { changePasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  const parsed = await parseBody(req, changePasswordSchema);
  if (parsed.res) return parsed.res;

  const { currentPassword, newPassword } = parsed.data;
  if (!verifyPassword(currentPassword, auth.ctx.user.passwordHash)) {
    return apiError("Current password is incorrect", 400);
  }

  await db
    .update(users)
    .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, auth.ctx.user.id));

  return json({ ok: true as const });
}
