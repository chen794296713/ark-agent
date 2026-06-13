import { requireAuth, parseBody, json, apiError } from "@/lib/api";
import { createAgentSchema } from "@/lib/validation";
import { listAgents, createAgent } from "@/lib/services/agents";

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
