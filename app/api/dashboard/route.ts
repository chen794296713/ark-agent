import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, agentActivities, agentImprovements, agentTasks } from "@/lib/db/schema";
import { requireAuth, json } from "@/lib/api";
import { publicWorkspace } from "@/lib/serializers";
import { listAgents } from "@/lib/services/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const ws = auth.ctx.workspace;

  const agentList = await listAgents(ws.id);
  const liveAgentIds = agentList.filter((a) => a.status !== "terminated").map((a) => a.id);

  const [activityRows, pendingImprovements, taskRows] = await Promise.all([
    liveAgentIds.length
      ? db
          .select({
            id: agentActivities.id,
            text: agentActivities.text,
            tag: agentActivities.tag,
            occurredAt: agentActivities.occurredAt,
            agentId: agents.id,
            who: agents.name,
            hue: agents.hue,
          })
          .from(agentActivities)
          .innerJoin(agents, eq(agents.id, agentActivities.agentId))
          .where(inArray(agentActivities.agentId, liveAgentIds))
          .orderBy(desc(agentActivities.occurredAt))
          .limit(12)
      : Promise.resolve([]),
    liveAgentIds.length
      ? db
          .select({ id: agentImprovements.id })
          .from(agentImprovements)
          .where(
            and(
              inArray(agentImprovements.agentId, liveAgentIds),
              eq(agentImprovements.status, "pending"),
            ),
          )
      : Promise.resolve([]),
    liveAgentIds.length
      ? db.select({ status: agentTasks.status }).from(agentTasks).where(inArray(agentTasks.agentId, liveAgentIds))
      : Promise.resolve([]),
  ]);

  const needsReview =
    agentList.filter((a) => a.status === "needs_review").length + pendingImprovements.length;
  const tasksActive = taskRows.filter((t) => t.status === "in_progress" || t.status === "done").length;

  return json({
    workspace: publicWorkspace(ws),
    stats: {
      activeAgents: liveAgentIds.length,
      tasksThisWeek: tasksActive,
      creditsUsed: ws.creditsUsed,
      needsReview,
    },
    agents: agentList,
    activity: activityRows,
  });
}
