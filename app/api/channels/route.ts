import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { channels } from "@/lib/db/schema";
import { requireAuth, parseBody, json } from "@/lib/api";
import { connectChannelSchema } from "@/lib/validation";
import { serializeChannel } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const rows = await db
    .select()
    .from(channels)
    .where(eq(channels.workspaceId, auth.ctx.workspace.id))
    .orderBy(asc(channels.createdAt));
  return json({ channels: rows.map(serializeChannel) });
}

/** Connect (or update) a channel for the workspace. */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const parsed = await parseBody(req, connectChannelSchema);
  if (parsed.res) return parsed.res;
  const { type, config, label } = parsed.data;

  const [existing] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.workspaceId, auth.ctx.workspace.id), eq(channels.type, type)))
    .limit(1);

  let row;
  if (existing) {
    [row] = await db
      .update(channels)
      .set({
        config: { ...(existing.config ?? {}), ...config },
        status: "connected",
        label: label ?? existing.label,
        updatedAt: new Date(),
      })
      .where(eq(channels.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(channels)
      .values({
        workspaceId: auth.ctx.workspace.id,
        type,
        config,
        status: "connected",
        label: label ?? type,
      })
      .returning();
  }
  return json({ channel: serializeChannel(row) }, existing ? 200 : 201);
}
