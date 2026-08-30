/**
 * GET /api/skills/[slug] — the detail payload behind the drawer.
 *
 * `[slug]` resolves as a `public_id` first and falls back to a UNIQUE match on
 * the bare `slug`, mirroring ClawHub's own AMBIGUOUS_SKILL_SLUG behaviour so a
 * bare slug in a hand-written template still works when it is unambiguous — and
 * 409s with the candidates when it is not, rather than silently picking whichever
 * row sorted first.
 *
 * 404 covers both "no such skill" and "draft or blocked, and you are not staff".
 * They are the same answer on purpose: a distinguishable response would turn this
 * route into a way to enumerate what is sitting in the review queue.
 */
import { apiError, json, notFound, requireAuth } from "@/lib/api";
import { agentInWorkspace, getSkillDetail } from "@/lib/skills/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The mint's alphabet plus the slug's. Anything else cannot name a row. */
const KEY = /^[A-Za-z0-9._-]{1,160}$/;

/**
 * `agents.id` is a `uuid` column, so a non-uuid `?agentId=` reaches Postgres as
 * `22P02 invalid input syntax for type uuid` and surfaces as a 500 — a shape
 * error rendered as a server fault. The list route checks this in
 * `parseSkillListQuery`; this route has no query parser and must do it itself.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  const { slug } = await params;
  // Bounded before it reaches an indexed equality. A 40KB path segment is not a
  // key, and refusing it here keeps it out of the query planner entirely.
  if (!KEY.test(slug)) return notFound();

  const agentId = new URL(req.url).searchParams.get("agentId");
  if (agentId) {
    if (!UUID.test(agentId)) return apiError("agentId must be a uuid", 400, { code: "bad_agent_id" });
    if (!(await agentInWorkspace(agentId, auth.ctx.workspace.id))) return notFound("Agent not found");
  }

  const staff = auth.ctx.user.platformRole !== "user";
  const found = await getSkillDetail(slug, { staff, agentId });
  if (!found) return notFound();
  if (found.ambiguous) {
    return apiError("Ambiguous skill slug", 409, { candidates: found.candidates });
  }
  return json({ skill: found.skill });
}
