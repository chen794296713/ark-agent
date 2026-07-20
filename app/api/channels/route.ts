import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { channels, agents, agentManagerConfig } from "@/lib/db/schema";
import { requireAuth, parseBody, json } from "@/lib/api";
import { connectChannelSchema } from "@/lib/validation";
import { serializeChannel } from "@/lib/serializers";
import { getChannels } from "@/app/lib/openclaw_manager_api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  const url = new URL(req.url);
  const instanceUuid = url.searchParams.get("instance_uuid");

  if (instanceUuid) {
    // Agent-level channels: verify ownership and resolve externalId
    const [agentRow] = await db
      .select({ workspaceId: agents.workspaceId })
      .from(agents)
      .where(eq(agents.id, instanceUuid))
      .limit(1);

    if (!agentRow || agentRow.workspaceId !== auth.ctx.workspace.id) {
      return json({ channels: [] });
    }

    // Look up OpenClaw externalId
    const [cfg] = await db
      .select({ externalId: agentManagerConfig.externalId })
      .from(agentManagerConfig)
      .where(eq(agentManagerConfig.agentId, instanceUuid))
      .limit(1);

    if (!cfg?.externalId) {
      return json({ channels: [] });
    }

    // Fetch from OpenClaw Manager API
    const openclawChannels = await getChannels(cfg.externalId);
    return json({
      channels: openclawChannels.map((ch) => ({
        type: ch.type,
        enabled: ch.enabled,
        config: ch.config,
      })),
    });
  }

  // Workspace-level channels (legacy)
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
