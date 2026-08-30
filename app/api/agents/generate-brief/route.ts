import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentRoles } from "@/lib/db/schema";
import { requireAuth, parseBody, json, notFound } from "@/lib/api";
import { generateBriefSchema } from "@/lib/validation";
import { isLLMConfigured, chatCompletion, type LlmUsageSample } from "@/lib/llm/openrouter";
import { buildBriefPrompt } from "@/lib/llm/agent-prompt";
import { recordLlmUsage, classifyLlmError } from "@/lib/llm/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auto-generate a job brief (instructions) or operating rules for a role using
 * the configured LLM. Falls back to the role's seeded defaults when no LLM is
 * configured or the call fails, so the hire flow always returns usable text.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const parsed = await parseBody(req, generateBriefSchema);
  if (parsed.res) return parsed.res;
  const { roleId, field, agentName, tasks, locale } = parsed.data;

  const [role] = await db
    .select()
    .from(agentRoles)
    .where(eq(agentRoles.id, roleId))
    .limit(1);
  if (!role) return notFound("Role not found");

  const fallback =
    (field === "instructions" ? role.defaultInstructions : role.defaultRules) ?? "";

  if (!isLLMConfigured()) {
    return json({ text: fallback, source: "default" as const });
  }

  // Captured by the onUsage callback below; still populated on the failure
  // path when the provider answered but the response was unusable.
  let sample: LlmUsageSample | undefined;
  const startedAt = Date.now();

  try {
    const { system, user } = buildBriefPrompt({
      field,
      roleName: role.name,
      roleBlurb: role.blurb,
      agentName,
      tasks,
      lang: locale ?? "en",
    });
    const text = await chatCompletion({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.6,
      maxTokens: 700,
      onUsage: (u) => {
        sample = u;
      },
    });
    await recordLlmUsage({
      sample,
      kind: "brief",
      userId: auth.ctx.user.id,
      workspaceId: auth.ctx.workspace.id,
      latencyMs: Date.now() - startedAt,
    });
    const clean = text.trim();
    return json({
      text: clean || fallback,
      source: clean ? ("llm" as const) : ("default" as const),
    });
  } catch (e) {
    // Recorded, not just swallowed — a silent fallback to seeded copy is
    // indistinguishable from success in the UI, so the error rate only exists
    // here.
    await recordLlmUsage({
      sample,
      kind: "brief",
      userId: auth.ctx.user.id,
      workspaceId: auth.ctx.workspace.id,
      latencyMs: Date.now() - startedAt,
      errorCode: classifyLlmError(e),
    });
    // Never break the hire flow on an LLM hiccup — fall back to seeded copy.
    return json({ text: fallback, source: "default" as const });
  }
}
