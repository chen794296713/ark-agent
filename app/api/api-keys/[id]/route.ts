import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { apiError, jsonPrivate, notFound, parseBody, requireAuth } from "@/lib/api";
import { updateApiKeySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function serialize(row: typeof apiKeys.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tokenPrefix: row.tokenPrefix,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    disabledAt: row.disabledAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function validId(id: string): boolean {
  return z.string().uuid().safeParse(id).success;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  if (!validId(id)) return apiError("Invalid API key id", 400);

  const parsed = await parseBody(req, updateApiKeySchema);
  if (parsed.res) return parsed.res;
  const expiresAt =
    parsed.data.expiresAt === undefined
      ? undefined
      : parsed.data.expiresAt === null
        ? null
        : new Date(parsed.data.expiresAt);
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return apiError("Expiration must be in the future", 422);
  }

  const [row] = await db
    .update(apiKeys)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description || null }
        : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
      ...(parsed.data.enabled !== undefined
        ? { disabledAt: parsed.data.enabled ? null : new Date() }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.userId, auth.ctx.user.id),
        eq(apiKeys.workspaceId, auth.ctx.workspace.id),
      ),
    )
    .returning();

  if (!row) return notFound("API key not found");
  return jsonPrivate({ apiKey: serialize(row) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  if (!validId(id)) return apiError("Invalid API key id", 400);

  const [deleted] = await db
    .delete(apiKeys)
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.userId, auth.ctx.user.id),
        eq(apiKeys.workspaceId, auth.ctx.workspace.id),
      ),
    )
    .returning({ id: apiKeys.id });
  if (!deleted) return notFound("API key not found");
  return jsonPrivate({ ok: true });
}
