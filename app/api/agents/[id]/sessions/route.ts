import { requireAuth, json, notFound } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import { getOpenclawConfigByAgentId, getOpenclawSessions } from "@/lib/services/openclaw_instances";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  const config = await getOpenclawConfigByAgentId(id);
  if (!config?.externalId) return json({ sessions: [] });

  return json({ sessions: await getOpenclawSessions(config.externalId) });
}
