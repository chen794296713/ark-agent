import { and, desc, eq, gt, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys, users, workspaces } from "@/lib/db/schema";
import { apiError, jsonPrivate, parseBody } from "@/lib/api";
import { loginBlockedReason, verifyPassword } from "@/lib/auth";
import {
  apiKeyPublicColumns,
  DEFAULT_API_KEY_NAME,
  prepareApiKey,
  serializeApiKey,
} from "@/lib/services/api-keys";
import { apiKeyCredentialsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseBody(req, apiKeyCredentialsSchema);
  if (parsed.res) return parsed.res;

  const username = parsed.data.username.toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, username)).limit(1);
  const passwordOk = user ? verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !passwordOk) return apiError("Invalid username or password", 401);

  const blocked = loginBlockedReason(user);
  if (blocked) return apiError(blocked, 403);

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, user.id))
      .for("update");

    const [workspace] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, user.id))
      .limit(1);
    if (!workspace) return null;

    const [latest] = await tx
      .select({ ...apiKeyPublicColumns, token: apiKeys.token })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.userId, user.id),
          eq(apiKeys.workspaceId, workspace.id),
          isNotNull(apiKeys.token),
          isNull(apiKeys.disabledAt),
          or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
        ),
      )
      .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id))
      .limit(1);

    if (latest?.token) {
      return { apiKey: latest, key: latest.token, created: false };
    }

    const prepared = prepareApiKey({
      userId: user.id,
      workspaceId: workspace.id,
      name: DEFAULT_API_KEY_NAME,
    });
    const [apiKey] = await tx
      .insert(apiKeys)
      .values(prepared.values)
      .returning(apiKeyPublicColumns);
    return { apiKey, key: prepared.token, created: true };
  });

  if (!result) return apiError("User has no workspace", 409);
  return jsonPrivate(
    {
      apiKey: serializeApiKey(result.apiKey),
      key: result.key,
      created: result.created,
    },
    result.created ? 201 : 200,
  );
}
