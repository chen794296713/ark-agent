import { requireAuth, parseBody, json, notFound, apiError } from "@/lib/api";
import { PackageDeploymentError } from "@/lib/agent-packages/deployment";
import { lifecycleSchema } from "@/lib/validation";
import { setLifecycle } from "@/lib/services/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const parsed = await parseBody(req, lifecycleSchema);
  if (parsed.res) return parsed.res;
  try {
    const detail = await setLifecycle(id, auth.ctx.workspace.id, parsed.data.action);
    if (!detail) return notFound("Agent not found");
    return json({ agent: detail });
  } catch (error) {
    if (error instanceof PackageDeploymentError) return apiError(error.message, error.status, { code: error.code });
    throw error;
  }
}
