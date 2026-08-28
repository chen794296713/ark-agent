import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, agentManagerConfig } from "@/lib/db/schema";
import { requireAuth, parseBody, json, notFound } from "@/lib/api";
import { upsertChannelSchema } from "@/lib/validation";
import { upsertChannel as callUpsertChannel } from "@/app/lib/openclaw_manager_api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upsert a channel for a specific agent instance.
 * Body: { instanceUuid, channelType, enabled, config }
 *
 * instanceUuid = agents.id (ArkAgent UUID).
 * The OpenClaw Manager API requires agentManagerConfig.externalId (the OpenClaw
 * instance UUID), so we look it up here before forwarding.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  const parsed = await parseBody(req, upsertChannelSchema);
  if (parsed.res) return parsed.res;
  const { instanceUuid, channelType, enabled, config } = parsed.data;

  // Verify the agent belongs to this workspace
  // Supports two lookup strategies:
  // 1. instanceUuid = agents.id (ArkAgent UUID)
  // 2. instanceUuid = agentManagerConfig.externalId (OpenClaw instance UUID)
  let agentId: string | null = null;

  // Strategy 1: Look up by agents.id
  const [agentById] = await db
    .select({ id: agents.id, workspaceId: agents.workspaceId })
    .from(agents)
    .where(eq(agents.id, instanceUuid))
    .limit(1);

  if (agentById) {
    if (agentById.workspaceId !== auth.ctx.workspace.id) {
      return notFound("Agent not found");
    }
    agentId = agentById.id;
  } else {
    // Strategy 2: Look up by externalId (OpenClaw instance UUID)
    const [cfgByExternal] = await db
      .select({ agentId: agentManagerConfig.agentId })
      .from(agentManagerConfig)
      .where(eq(agentManagerConfig.externalId, instanceUuid))
      .limit(1);

    if (cfgByExternal) {
      const [agentForExternal] = await db
        .select({ id: agents.id, workspaceId: agents.workspaceId })
        .from(agents)
        .where(eq(agents.id, cfgByExternal.agentId))
        .limit(1);

      if (!agentForExternal || agentForExternal.workspaceId !== auth.ctx.workspace.id) {
        return notFound("Agent not found");
      }
      agentId = cfgByExternal.agentId;
    } else {
      return notFound("Agent not found");
    }
  }

  // Look up the OpenClaw instance UUID (externalId) for this agent
  const [cfg] = await db
    .select({ externalId: agentManagerConfig.externalId })
    .from(agentManagerConfig)
    .where(eq(agentManagerConfig.agentId, agentId))
    .limit(1);

  if (!cfg?.externalId) {
    return json({ error: "Agent has no OpenClaw instance configured" }, 400);
  }

  // Call the OpenClaw Manager API with the externalId (instance UUID)
  await callUpsertChannel({
    instanceUuid: cfg.externalId,
    channelType,
    enabled,
    config,
  });

  return json({ ok: true });
}
