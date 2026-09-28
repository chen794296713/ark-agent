import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, workspaces, workspaceMembers } from "@/lib/db/schema";
import { hashPassword, createSession, isReservedEmail } from "@/lib/auth";
import { parseBody, apiError, json } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { publicUser, publicWorkspace } from "@/lib/serializers";
import { ensureOpenClawManagerUser } from "@/app/lib/openclaw_manager_api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseBody(req, registerSchema);
  if (parsed.res) return parsed.res;
  const email = parsed.data.email.toLowerCase().trim();
  const { password, name } = parsed.data;

  // Same 409 as a taken address: telling an anonymous caller that this
  // particular address is "reserved" is a free hint about where staff live.
  if (isReservedEmail(email)) {
    return apiError("An account with this email already exists", 409);
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) return apiError("An account with this email already exists", 409);

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: hashPassword(password), name })
    .returning();

  const [ws] = await db
    .insert(workspaces)
    .values({ name: `${name.split(" ")[0]}'s Workspace`, ownerId: user.id })
    .returning();
  await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: user.id, role: "owner" });

  // Mirror the new ArkAgent account into OpenClaw Manager. Manager credentials
  // are derived from this user's email (`local-part@iagent1`). An upstream
  // outage must not roll back a valid local registration; the first later
  // Manager call repeats the same idempotent register/sign-in flow.
  try {
    await ensureOpenClawManagerUser({ email: user.email, name: user.name });
  } catch (error) {
    console.error(
      "OpenClaw Manager user bootstrap failed; it will retry on first use",
      error instanceof Error ? error.message : "Unknown error",
    );
  }

  await createSession(user.id);
  return json({ user: publicUser(user), workspace: publicWorkspace(ws) }, 201);
}
