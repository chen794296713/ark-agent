import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { channels } from "@/lib/db/schema";
import { requireAuth, json, notFound } from "@/lib/api";
import { serializeChannel } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Disconnect a channel (keeps the row but clears secrets + marks disconnected). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const [existing] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.id, id), eq(channels.workspaceId, auth.ctx.workspace.id)))
    .limit(1);
  if (!existing) return notFound("Channel not found");
  const [row] = await db
    .update(channels)
    .set({ status: "disconnected", config: {}, updatedAt: new Date() })
    .where(eq(channels.id, id))
    .returning();
  return json({ channel: serializeChannel(row) });
}
