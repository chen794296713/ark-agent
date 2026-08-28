import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentManagerConfig } from "@/lib/db/schema";
import { requireAuth, json, notFound, apiError } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import { getOpenclawTokenReport } from "@/lib/services/openclaw_instances";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/agents/:id/token-report?days=30
 *
 * 返回 token 消耗报告（按天）。仅支持 OpenClaw provider；其他 provider 返回 404。
 * `days` 用于控制统计范围（支持 1 / 3 / 7 / 30 等）。
 */
export async function GET(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;

  // 校验 agent 归属当前 workspace
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  // 解析 days / period 参数
  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days") ?? "30");
  if (![1, 3, 7, 30].includes(daysParam)) {
    return apiError("days must be one of 1, 3, 7, 30", 400);
  }
  const periodParam = url.searchParams.get("period") ?? "day";
  if (periodParam !== "day" && periodParam !== "hour") {
    return apiError("period must be 'day' or 'hour'", 400);
  }

  // 取 openclaw provider 配置
  const [cfg] = await db
    .select()
    .from(agentManagerConfig)
    .where(
      and(
        eq(agentManagerConfig.agentId, id),
        eq(agentManagerConfig.provider, "openclaw"),
      ),
    )
    .limit(1);

  if (!cfg) return notFound("No OpenClaw provider configured for this agent");

  try {
    const report = await getOpenclawTokenReport(
      cfg.externalId,
      periodParam,
      daysParam,
    );
    return json(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load token report";
    return apiError(msg, 502);
  }
}
