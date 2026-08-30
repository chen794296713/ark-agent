import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agentActivities,
  agentImprovements,
  agentMetrics,
  agentRoles,
} from "@/lib/db/schema";
import { requireAuth, parseBody, json, notFound, apiError } from "@/lib/api";
import { selfReviewSchema } from "@/lib/validation";
import { getAgentRow, getAgentDetail } from "@/lib/services/agents";
import { isLLMConfigured, chatCompletion, type LlmUsageSample } from "@/lib/llm/openrouter";
import { buildSelfReviewPrompt, parseImprovements } from "@/lib/llm/agent-prompt";
import { recordLlmUsage, classifyLlmError } from "@/lib/llm/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Run the agent's self-review loop: the LLM inspects the agent's recent
 * activity and metrics and proposes improvements, which are stored as pending
 * rows for the manager to approve or dismiss in the Performance tab.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  const parsed = await parseBody(req, selfReviewSchema);
  if (parsed.res) return parsed.res;

  if (!isLLMConfigured()) {
    return apiError("Self-review needs an LLM. Set OPENROUTER_API_KEY to enable it.", 503);
  }

  const [role] = await db
    .select({ name: agentRoles.name })
    .from(agentRoles)
    .where(eq(agentRoles.id, agent.roleId))
    .limit(1);

  const [activities, metrics, existing] = await Promise.all([
    db
      .select({ text: agentActivities.text })
      .from(agentActivities)
      .where(eq(agentActivities.agentId, id))
      .orderBy(desc(agentActivities.occurredAt))
      .limit(25),
    db
      .select({ label: agentMetrics.label, value: agentMetrics.value })
      .from(agentMetrics)
      .where(eq(agentMetrics.agentId, id)),
    db
      .select({ text: agentImprovements.text })
      .from(agentImprovements)
      .where(and(eq(agentImprovements.agentId, id), eq(agentImprovements.status, "pending")))
      .limit(20),
  ]);

  const { system, user } = buildSelfReviewPrompt({
    agentName: agent.name,
    roleName: role?.name ?? "AI employee",
    instructions: agent.instructions,
    rules: agent.rules,
    activities: activities.map((a) => a.text),
    metrics: metrics.map((m) => ({ label: m.label, value: m.value })),
    existing: existing.map((e) => e.text),
    lang: parsed.data.locale ?? "en",
    count: parsed.data.count,
  });

  let suggestions: { text: string; impact: string | null }[] = [];
  let sample: LlmUsageSample | undefined;
  const startedAt = Date.now();
  try {
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.5,
      maxTokens: 700,
      onUsage: (u) => {
        sample = u;
      },
    });
    suggestions = parseImprovements(raw);
  } catch (e) {
    await recordLlmUsage({
      sample,
      kind: "self_review",
      userId: auth.ctx.user.id,
      workspaceId: auth.ctx.workspace.id,
      agentId: id,
      latencyMs: Date.now() - startedAt,
      errorCode: classifyLlmError(e),
    });
    return apiError(
      e instanceof Error ? e.message : "Self-review failed",
      502,
    );
  }
  await recordLlmUsage({
    sample,
    kind: "self_review",
    userId: auth.ctx.user.id,
    workspaceId: auth.ctx.workspace.id,
    agentId: id,
    latencyMs: Date.now() - startedAt,
  });

  if (!suggestions.length) {
    return json({
      created: 0,
      agent: await getAgentDetail(id, auth.ctx.workspace.id),
    });
  }

  await db.insert(agentImprovements).values(
    suggestions.map((s) => ({ agentId: id, text: s.text, impact: s.impact, status: "pending" as const })),
  );
  await db.insert(agentActivities).values({
    agentId: id,
    text: `Self-review completed — ${suggestions.length} improvement${suggestions.length === 1 ? "" : "s"} queued for approval`,
    tag: "learning",
  });

  return json({
    created: suggestions.length,
    agent: await getAgentDetail(id, auth.ctx.workspace.id),
  });
}
