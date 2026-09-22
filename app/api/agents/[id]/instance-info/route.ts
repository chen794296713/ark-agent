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

function serializeInstanceTasks(config: unknown) {
  const rawTasks: unknown[] =
    config && typeof config === "object" && Array.isArray((config as Record<string, unknown>).tasks)
      ? ((config as Record<string, unknown>).tasks as unknown[])
      : [];
  return rawTasks
    .filter((task): task is Record<string, unknown> => !!task && typeof task === "object")
    .map((task) => ({
      id: task.id,
      content: task.content ?? "",
      sortOrder: task.sortOrder ?? task.sort_order ?? 0,
      sessionKey: task.sessionKey ?? task.session_key ?? null,
      result: task.result ?? null,
      status: task.status ?? "pending",
      createdAt: task.createdAt ?? task.created_at ?? null,
      updatedAt: task.updatedAt ?? task.updated_at ?? null,
    }))
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
    // The first upstream task is the internal brief (instructions + rules).
    // It is never a user-visible task or result.
    .slice(1);
}

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
    providers: rows.map((r) => {
      const tasks = serializeInstanceTasks(r.config);
      const config =
        r.config && typeof r.config === "object"
          ? { ...(r.config as Record<string, unknown>), tasks }
          : r.config;
      return {
        provider: r.provider,
        externalId: r.externalId,
        status: r.status,
        lastError: r.lastError,
        config,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        tasks,
      };
    }),
    autoStopped,
  });
}
