/**
 * GET  /api/agents/[id]/skills — what is attached to this agent, plus tool gaps.
 * POST /api/agents/[id]/skills — attach one catalogue skill.
 *
 * AUTHORIZATION, on this route and every sibling: `requireAuth()` ->
 * `getAgentRow(id, ctx.workspace.id)` -> `notFound()`. The agent id is re-checked
 * against the caller's workspace BEFORE any join runs, and a cross-workspace id
 * is a 404, never a 403 (docs/API.md) — a 403 confirms the id exists, which is a
 * membership oracle across tenants. The catalogue itself is global and carries no
 * `workspace_id`, so `agents.workspace_id` is the ONLY tenant boundary in this
 * vertical; skipping the check here would not fail a query, it would answer one.
 *
 * NO 503. Attaching a skill is a Postgres write and must succeed with no
 * `OPENROUTER_API_KEY` and no Agent Manager configured. The response says which
 * runtime state applies — "live", "mock" or "unsupported" — so the UI can tell
 * the operator the row is saved and nothing will install yet, rather than
 * refusing the write or implying an installation that cannot happen. The row is
 * written `state: "pending"` in every case: only the runtime installs anything.
 */
import { json, notFound, parseBody, requireAuth } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import { attachSkillSchema } from "@/lib/agent-config/validation";
import {
  agentConfigErrorResponse,
  attachSkill,
  listAgentSkills,
} from "@/lib/services/agent-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  return json(await listAgentSkills(agent));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  // `attachSkillSchema` is `lib/skills/validation.ts`'s, re-exported — not a
  // second copy. It is where `riskAcknowledged` and `compatAsserted` default
  // FALSE and where the secret-key check on `config` lives; a local rewrite
  // would be a second place for all three to drift.
  const parsed = await parseBody(req, attachSkillSchema);
  if (parsed.res) return parsed.res;

  try {
    return json(await attachSkill(agent, parsed.data, auth.ctx.user.id), 201);
  } catch (e) {
    return agentConfigErrorResponse(e);
  }
}
