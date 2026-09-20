import { apiError, jsonPrivate, requireAuth } from "@/lib/api";
import { deployAgentPackage } from "@/lib/agent-packages/service";
import { PackageDeploymentError } from "@/lib/agent-packages/deployment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { agentId } = await params;
  try {
    const result = await deployAgentPackage(agentId, auth.ctx.workspace.id);
    return jsonPrivate(result, result.pending ? 202 : 200);
  } catch (error) {
    if (error instanceof PackageDeploymentError) return apiError(error.message, error.status, { code: error.code });
    throw error;
  }
}
