import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { apiError, jsonPrivate, parseBody, requireAuth } from "@/lib/api";
import {
  apiKeyPublicColumns,
  prepareApiKey,
  serializeApiKey,
} from "@/lib/services/api-keys";
import { createApiKeySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  const rows = await db
    .select({ ...apiKeyPublicColumns, key: apiKeys.token })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.userId, auth.ctx.user.id),
        eq(apiKeys.workspaceId, auth.ctx.workspace.id),
      ),
    )
    .orderBy(desc(apiKeys.createdAt));

  return jsonPrivate({
    apiKeys: rows.map((row) => ({ ...serializeApiKey(row), key: row.key })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const parsed = await parseBody(req, createApiKeySchema);
  if (parsed.res) return parsed.res;

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return apiError("Expiration must be in the future", 422);
  }

  const prepared = prepareApiKey({
    userId: auth.ctx.user.id,
    workspaceId: auth.ctx.workspace.id,
    name: parsed.data.name,
    description: parsed.data.description,
    expiresAt,
  });
  const [row] = await db
    .insert(apiKeys)
    .values(prepared.values)
    .returning(apiKeyPublicColumns);

  return jsonPrivate({ apiKey: serializeApiKey(row), key: prepared.token }, 201);
}
