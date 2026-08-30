/**
 * GET /api/skills — browse the catalogue.
 *
 * Auth: **any authenticated session**, and that is a deliberate pair of
 * decisions, not an oversight. The catalogue is not public — an unauthenticated
 * crawl of it is a free competitor dataset and, more to the point, a list of
 * every skill we have risk-scored. It is also not workspace-scoped: `skills`
 * carries no `workspace_id` because the catalogue is the same for every tenant.
 *
 * The one tenant boundary on this route is `?agentId=`, which decorates each
 * card with that agent's attachment state. It is re-checked against
 * `ctx.workspace.id` BEFORE any query that joins `agent_skills` runs — a
 * foreign uuid would otherwise read which skills another workspace's agent has
 * installed. A miss is 404, never 403: a 403 confirms the uuid exists somewhere,
 * which is a cross-tenant membership oracle (docs/API.md).
 *
 * No fetch happens here, ever. `GET /api/skills` reads `skills` and nothing
 * else — no fetch-on-miss, no lazy enrichment, no refresh-if-stale. A hostile
 * upstream can make our catalogue stale; it can never make this page hang.
 */
import { apiError, json, notFound, requireAuth } from "@/lib/api";
import { agentInWorkspace, listSkills, listSkillSources } from "@/lib/skills/queries";
import { parseSkillListQuery, SkillQueryError } from "@/lib/skills/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  let filters;
  try {
    filters = parseSkillListQuery(new URL(req.url).searchParams);
  } catch (e) {
    // A malformed STRUCTURAL parameter is a 400. An unrecognised FILTER VALUE is
    // not — it is dropped and reported in `ignoredFilters`, because every one of
    // those otherwise reaches an `inArray` against a pgEnum and comes back as a
    // 500 carrying the enum's full value list.
    if (e instanceof SkillQueryError) return apiError(e.message, e.status, { code: e.code });
    throw e;
  }

  if (filters.agentId && !(await agentInWorkspace(filters.agentId, auth.ctx.workspace.id))) {
    return notFound("Agent not found");
  }

  // `support` and above. `ROLE_RANK` in lib/api.ts makes "staff" ambiguous
  // otherwise, and the only thing this widens is visibility of `draft` rows.
  const staff = auth.ctx.user.platformRole !== "user";

  const [page, sources] = await Promise.all([
    listSkills(filters, { staff, attachmentsForAgentId: filters.agentId }),
    listSkillSources(),
  ]);

  // The facet counts are keyed on `source_id`; the browser needs the display
  // name and the homepage to render the chip, and neither is on a card.
  return json({ ...page, sources });
}
