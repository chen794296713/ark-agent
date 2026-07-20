import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, agentManagerConfig } from "@/lib/db/schema";
import { requireAuth, json, notFound } from "@/lib/api";
import { wechatLogin } from "@/app/lib/openclaw_manager_api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Request a WeChat QR code login for a specific agent instance.
 * POST /api/channels/wechat/login?instance_uuid=<agentId>
 *
 * The OpenClaw Manager API requires agentManagerConfig.externalId (the OpenClaw
 * instance UUID), so we look it up from openclaw config.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  const url = new URL(req.url);
  const agentId = url.searchParams.get("instance_uuid");
  if (!agentId) {
    return json({ error: "instance_uuid is required" }, 400);
  }

  // Verify the agent belongs to this workspace
  const [agentRow] = await db
    .select({ id: agents.id, workspaceId: agents.workspaceId })
    .from(agents)
    .where(eq(agents.agentManagerId, agentId))
    .limit(1);

  if (!agentRow || agentRow.workspaceId !== auth.ctx.workspace.id) {
    return notFound("Agent not found");
  }

  // Look up the OpenClaw instance UUID
  const [cfg] = await db
    .select({ externalId: agentManagerConfig.externalId })
    .from(agentManagerConfig)
    .where(eq(agentManagerConfig.externalId, agentId))
    .limit(1);

  if (!cfg?.externalId) {
    return json({ error: "Agent has no OpenClaw instance configured" }, 400);
  }

  // Call the OpenClaw Manager API with the externalId
  const result = await wechatLogin(cfg.externalId);
  return json(result);
}
