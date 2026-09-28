import { and, eq } from "drizzle-orm";
import { jsonPrivate, notFound, unauthorized } from "@/lib/api";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  void req;
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  const { id } = await params;
  const [deleted] = await db
    .delete(apiKeys)
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.userId, auth.user.id),
        eq(apiKeys.workspaceId, auth.workspace.id),
      ),
    )
    .returning({ id: apiKeys.id });
  if (!deleted) return notFound("API key not found");
  return jsonPrivate({ ok: true as const });
}
