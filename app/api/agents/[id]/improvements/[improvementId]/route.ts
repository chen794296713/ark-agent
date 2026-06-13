import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentImprovements, agentActivities } from "@/lib/db/schema";
import { requireAuth, parseBody, json, notFound } from "@/lib/api";
import { improvementActionSchema } from "@/lib/validation";
import { getAgentRow, getAgentDetail } from "@/lib/services/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; improvementId: string }> },
) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id, improvementId } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  const parsed = await parseBody(req, improvementActionSchema);
  if (parsed.res) return parsed.res;

  const [imp] = await db
    .select()
    .from(agentImprovements)
    .where(and(eq(agentImprovements.id, improvementId), eq(agentImprovements.agentId, id)))
    .limit(1);
  if (!imp) return notFound("Improvement not found");

  const status = parsed.data.action === "approve" ? "approved" : "dismissed";
  await db
    .update(agentImprovements)
    .set({ status, resolvedAt: new Date() })
    .where(eq(agentImprovements.id, improvementId));

  await db.insert(agentActivities).values({
    agentId: id,
    text:
      parsed.data.action === "approve"
        ? `Approved self-review improvement: ${imp.text}`
        : `Dismissed self-review suggestion: ${imp.text}`,
    tag: "learning",
  });

  return json({ agent: await getAgentDetail(id, auth.ctx.workspace.id) });
}
