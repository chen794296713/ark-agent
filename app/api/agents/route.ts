import { requireAuth, parseBody, json, apiError } from "@/lib/api";
import { createAgentSchema } from "@/lib/validation";
import { listAgents, createAgent } from "@/lib/services/agents";
import { harnessLabel } from "@/lib/harness";
import { enabledHarnesses, isHarnessEnabled } from "@/lib/harness/provisioning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  return json({ agents: await listAgents(auth.ctx.workspace.id) });
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const parsed = await parseBody(req, createAgentSchema);
  if (parsed.res) return parsed.res;

  // Refuse an unprovisionable harness HERE, not eight frames down inside
  // createAgent(). By then the agent row, its channel links, its tasks and its
  // billing seat all exist, and the failure lands as a `status: "error"` agent
  // the user has to notice and delete. A 422 costs them one dropdown change.
  if (!isHarnessEnabled(parsed.data.engine)) {
    return apiError(
      `The ${harnessLabel(parsed.data.engine)} runtime is not available on this deployment.`,
      422,
      { availableHarnesses: enabledHarnesses() },
    );
  }

  try {
    const agent = await createAgent(auth.ctx, parsed.data);
    return json({ agent }, 201);
  } catch (err) {
    if (err instanceof Error && /Unknown role/.test(err.message)) {
      return apiError("Unknown role", 400);
    }
    throw err;
  }
}
