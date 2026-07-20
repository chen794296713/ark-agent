import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { channels, agents, agentManagerConfig } from "@/lib/db/schema";
import { requireAuth, parseBody, json } from "@/lib/api";
import { connectChannelSchema } from "@/lib/validation";
import { serializeChannel } from "@/lib/serializers";
import { getChannelStatus } from "@/app/lib/openclaw_manager_api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/channels?instance_uuid=<agentId>
 *
 * Returns channel status for a specific agent. Uses OpenClaw Manager's
 * /api/channels/status endpoint to get the full channel state (enabled,
 * configured, config) for all channels.
 */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  const url = new URL(req.url);
  const instanceUuid = url.searchParams.get("instance_uuid");

  if (instanceUuid) {
    // Try two lookup strategies:
    // 1. Direct agent lookup by id
    // 2. Look up agentManagerConfig.externalId (OpenClaw instance UUID)
    let externalId: string | null = null;
    let agentId: string | null = null;

    // Strategy 1: Check if instanceUuid is a valid agent id in our DB
    const [agentRow] = await db
      .select({ workspaceId: agents.workspaceId })
      .from(agents)
      .where(eq(agents.id, instanceUuid))
      .limit(1);

    if (agentRow) {
      // instanceUuid is a valid agent id
      if (agentRow.workspaceId !== auth.ctx.workspace.id) {
        return json({ channels: [] });
      }
      agentId = instanceUuid;
    } else {
      // Strategy 2: Look up by externalId (OpenClaw instance UUID)
      const [cfgByExternal] = await db
        .select({ agentId: agentManagerConfig.agentId })
        .from(agentManagerConfig)
        .where(eq(agentManagerConfig.externalId, instanceUuid))
        .limit(1);

      if (cfgByExternal) {
        const [agentForExternal] = await db
          .select({ workspaceId: agents.workspaceId })
          .from(agents)
          .where(eq(agents.id, cfgByExternal.agentId))
          .limit(1);

        if (!agentForExternal || agentForExternal.workspaceId !== auth.ctx.workspace.id) {
          return json({ channels: [] });
        }
        agentId = cfgByExternal.agentId;
      } else {
        return json({ channels: [] });
      }
    }

    // Look up OpenClaw externalId for the agent
    const [cfg] = await db
      .select({ externalId: agentManagerConfig.externalId })
      .from(agentManagerConfig)
      .where(eq(agentManagerConfig.agentId, agentId))
      .limit(1);

    if (!cfg?.externalId) {
      return json({ channels: [] });
    }
    externalId = cfg.externalId;

    // Fetch full channel status from OpenClaw Manager
    const status = await getChannelStatus(externalId);
    if (!status) {
      return json({ channels: [] });
    }

    // Normalise channels map to array
    const channels_list = Object.values(status.channels).map((ch) => ({
      type: ch.channel_type,
      label: ch.label,
      enabled: ch.enabled,
      configured: ch.configured,
      config: ch.config,
    }));

    return json({ channels: channels_list });
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
