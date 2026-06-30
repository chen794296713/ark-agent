import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentManagerConfig } from "@/lib/db/schema";
import { requireAuth, notFound, json } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import {
  syncOpenclawInstanceToDb,
  getOpenclawConfigByAgentId,
} from "@/lib/services/openclaw_instances";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/agents/:id/instance-info
 *
 * Returns the Agent Manager config blob for this agent. For OpenClaw providers,
 * this always fetches fresh data from the upstream API and syncs it to the DB
 * so the cached config stays up to date with the latest instance state.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  // Sync openclaw provider from upstream API (fresh data).
  let autoStopped = false;
  const openclawConfig = await getOpenclawConfigByAgentId(id);
  if (openclawConfig) {
    try {
      const result = await syncOpenclawInstanceToDb(openclawConfig.externalId);
      autoStopped = result.autoStopped;
    } catch {
      /* best-effort; fall back to cached DB row */
    }
  }

  // Return fresh rows (openclaw will reflect latest data; others are cached).
  const rows = await db
    .select()
    .from(agentManagerConfig)
    .where(eq(agentManagerConfig.agentId, id));

  return json({
    providers: rows.map((r) => ({
      provider: r.provider,
      externalId: r.externalId,
      status: r.status,
      lastError: r.lastError,
      config: r.config,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    autoStopped,
  });
}
