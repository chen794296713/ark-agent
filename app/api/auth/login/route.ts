import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, workspaces } from "@/lib/db/schema";
import { verifyPassword, createSession } from "@/lib/auth";
import { parseBody, apiError, json } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { publicUser, publicWorkspace } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseBody(req, loginSchema);
  if (parsed.res) return parsed.res;
  const email = parsed.data.email.toLowerCase().trim();

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Constant-ish work whether or not the user exists.
  const ok = user ? verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !ok) return apiError("Invalid email or password", 401);

  await createSession(user.id);
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, user.id))
    .limit(1);
  return json({ user: publicUser(user), workspace: ws ? publicWorkspace(ws) : null });
}
