import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, jsonPrivate, parseBody, unauthorized } from "@/lib/api";
import { API_KEY_PERMISSIONS, generateApiKey } from "@/lib/api-keys";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    permissions: z.array(z.enum(API_KEY_PERMISSIONS)).min(1).max(2),
    expiresAt: z.iso.datetime().nullable(),
  })
  .strict();

function serialize(row: typeof apiKeys.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    permissions: row.permissions,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    expired: row.expiresAt !== null && row.expiresAt.getTime() <= Date.now(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(req: Request) {
  void req;
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  const rows = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.userId, auth.user.id),
        eq(apiKeys.workspaceId, auth.workspace.id),
      ),
    )
    .orderBy(desc(apiKeys.createdAt));
  return jsonPrivate({ apiKeys: rows.map(serialize) });
}

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  const parsed = await parseBody(req, createApiKeySchema);
  if (parsed.res) return parsed.res;

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return apiError("Expiration time must be in the future", 422);
  }

  const existing = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.userId, auth.user.id),
        eq(apiKeys.workspaceId, auth.workspace.id),
      ),
    );
  if (existing.length >= 50) {
    return apiError("An account can have at most 50 API keys", 422);
  }

  const permissions = Array.from(new Set(parsed.data.permissions));
  const [created] = await db
    .insert(apiKeys)
    .values({
      userId: auth.user.id,
      workspaceId: auth.workspace.id,
      name: parsed.data.name,
      key: generateApiKey(),
      permissions,
      expiresAt,
    })
    .returning();
  return jsonPrivate({ apiKey: serialize(created) }, 201);
}
