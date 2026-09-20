import { apiError, jsonPrivate, parseBody, requireAuth } from "@/lib/api";
import { configureAgentPackage, configurePackageSchema, packageIdempotencyKey } from "@/lib/agent-packages/service";
import { PackageDeploymentError } from "@/lib/agent-packages/deployment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const parsed = await parseBody(req, configurePackageSchema);
  if (parsed.res) return parsed.res;
  try {
    const key = packageIdempotencyKey(req.headers.get("idempotency-key"));
    const result = await configureAgentPackage(auth.ctx, parsed.data, key);
    return jsonPrivate(result, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof PackageDeploymentError) return apiError(error.message, error.status, { code: error.code });
    throw error;
  }
}
