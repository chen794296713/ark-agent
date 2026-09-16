import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys, users, workspaces, workspaceMembers } from "@/lib/db/schema";
import { hashPassword, createSession, isReservedEmail } from "@/lib/auth";
import { parseBody, apiError, jsonPrivate } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { publicUser, publicWorkspace } from "@/lib/serializers";
import {
  apiKeyPublicColumns,
  DEFAULT_API_KEY_NAME,
  prepareApiKey,
  serializeApiKey,
} from "@/lib/services/api-keys";

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

  const passwordHash = hashPassword(password);
  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, passwordHash, name })
      .returning();

    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: `${name.split(" ")[0]}'s Workspace`, ownerId: user.id })
      .returning();
    await tx.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: "owner",
    });

    const prepared = prepareApiKey({
      userId: user.id,
      workspaceId: workspace.id,
      name: DEFAULT_API_KEY_NAME,
    });
    const [apiKey] = await tx
      .insert(apiKeys)
      .values(prepared.values)
      .returning(apiKeyPublicColumns);

    return { user, workspace, apiKey, key: prepared.token };
  });

  await createSession(created.user.id);
  return jsonPrivate(
    {
      user: publicUser(created.user),
      workspace: publicWorkspace(created.workspace),
      apiKey: serializeApiKey(created.apiKey),
      key: created.key,
    },
    201,
  );
}
