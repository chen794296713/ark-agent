import { apiError, jsonPrivate, notFound, requireAuth } from "@/lib/api";
import { getAgentPackageRecord, getConfiguredAgentPackage } from "@/lib/agent-packages/service";
import { PackageDeploymentError } from "@/lib/agent-packages/deployment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  try {
    if (new URL(req.url).searchParams.get("download") === "1") {
      const row = await getAgentPackageRecord(id, auth.ctx.workspace.id);
      if (!row) return notFound("Agent package not found");
      const response = jsonPrivate(row.bundle);
      response.headers.set("content-disposition", `attachment; filename="${row.packageId}-${row.packageVersion}-${row.bundle.harness}.json"`);
      return response;
    }
    const result = await getConfiguredAgentPackage(id, auth.ctx.workspace.id);
    return result ? jsonPrivate(result) : notFound("Agent package not found");
  } catch (error) {
    if (error instanceof PackageDeploymentError) return apiError(error.message, error.status, { code: error.code });
    throw error;
  }
}
