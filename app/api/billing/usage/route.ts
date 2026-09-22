import { requireAuth, json, apiError } from "@/lib/api";
import { billingUsageQuerySchema } from "@/lib/validation";
import { getBillingUsage } from "@/lib/services/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Credit usage for the billing chart, scoped to the caller's own workspace.
 *
 * The workspace id comes from the session, never from the query string — the
 * range is the only thing a client may choose here.
 */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  const url = new URL(req.url);
  const parsed = billingUsageQuerySchema.safeParse({
    range: url.searchParams.get("range") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) {
    return apiError("Invalid range", 422, { issues: parsed.error.flatten() });
  }

  const usage = await getBillingUsage(auth.ctx.workspace.id, parsed.data.range, {
    from: parsed.data.from,
    to: parsed.data.to,
  });
  if (!usage) return apiError("Workspace not found", 404);
  return json(usage);
}
