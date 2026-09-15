import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { apiError, jsonPrivate, parseBody, requireAuth } from "@/lib/api";
import { apiKeyDisplayPrefix, generateApiKey, hashApiKey } from "@/lib/api-key-token";
import { createApiKeySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const publicColumns = {
  id: apiKeys.id,
  name: apiKeys.name,
  description: apiKeys.description,
  tokenPrefix: apiKeys.tokenPrefix,
  expiresAt: apiKeys.expiresAt,
  disabledAt: apiKeys.disabledAt,
  lastUsedAt: apiKeys.lastUsedAt,
  createdAt: apiKeys.createdAt,
  updatedAt: apiKeys.updatedAt,
};

function serialized(row: {
  id: string;
  name: string;
  description: string | null;
  tokenPrefix: string;
  expiresAt: Date | null;
  disabledAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    disabledAt: row.disabledAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  const rows = await db
    .select(publicColumns)
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.userId, auth.ctx.user.id),
        eq(apiKeys.workspaceId, auth.ctx.workspace.id),
      ),
    )
    .orderBy(desc(apiKeys.createdAt));

  return jsonPrivate({ apiKeys: rows.map(serialized) });
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

  const token = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({
      userId: auth.ctx.user.id,
      workspaceId: auth.ctx.workspace.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      tokenPrefix: apiKeyDisplayPrefix(token),
      tokenHash: hashApiKey(token),
      expiresAt,
    })
    .returning(publicColumns);

  return jsonPrivate({ apiKey: serialized(row), key: token }, 201);
}
