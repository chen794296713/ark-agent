import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAuth, parseBody, json } from "@/lib/api";
import { prefsSchema } from "@/lib/validation";
import { publicUser } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const parsed = await parseBody(req, prefsSchema);
  if (parsed.res) return parsed.res;
  const { locale, name } = parsed.data;
  if (locale === undefined && name === undefined) return json({ user: publicUser(auth.ctx.user) });

  const [updated] = await db
    .update(users)
    .set({
      ...(locale !== undefined ? { locale } : {}),
      ...(name !== undefined ? { name } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, auth.ctx.user.id))
    .returning();
  return json({ user: publicUser(updated) });
}
