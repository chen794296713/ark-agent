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
  const { instanceUuid: agentId, channelType, enabled, config } = parsed.data;

  // Verify the agent belongs to this workspace
  const [agentRow] = await db
    .select({ id: agents.id, workspaceId: agents.workspaceId })
    .from(agents)
    .where(eq(agents.agentManagerId, agentId))
    .limit(1);
  
  if (!agentRow || agentRow.workspaceId !== auth.ctx.workspace.id) {
    console.log("agentRow: agent not found",agentId);
    return notFound("Agent not found");
  }

  // Look up the OpenClaw instance UUID (externalId)
  const PROVIDER = "openclaw";
  const [cfg] = await db
    .select({ externalId: agentManagerConfig.externalId })
    .from(agentManagerConfig)
    .where(eq(agentManagerConfig.externalId, agentId))
    .limit(1);

  console.log("cfg",agentId)
  if (!cfg?.externalId) {
    console.log("cfg: externalId not found", cfg);
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
