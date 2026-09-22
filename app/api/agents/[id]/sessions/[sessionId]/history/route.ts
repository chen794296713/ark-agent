import { requireAuth, json, notFound } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import {
  getOpenclawConfigByAgentId,
  getOpenclawSessionHistory,
} from "@/lib/services/openclaw_instances";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; sessionId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id, sessionId } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  const config = await getOpenclawConfigByAgentId(id);
  if (!config?.externalId) return json({ sessionId, messages: [] });

  const history = await getOpenclawSessionHistory(config.externalId, sessionId);
  return json({
    sessionId: history.sessionId,
    sessionKey: history.sessionKey,
    status: history.status,
    messages: history.messages.map((message, index) => ({
      id: `${history.sessionId}-${index}`,
      sender: message.role === "user" ? "user" : "agent",
      body: message.content,
      channelType: "web",
      status: "delivered",
      meta: message.role === "user" ? "YOU" : `${agent.name.toUpperCase()} · VIA WEB`,
      createdAt: message.timestamp
        ? new Date(message.timestamp).toISOString()
        : new Date().toISOString(),
    })),
  });
}
