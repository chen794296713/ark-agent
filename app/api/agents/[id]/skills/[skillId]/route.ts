/**
 * PATCH  /api/agents/[id]/skills/[skillId] — enable/disable, or replace config.
 * DELETE /api/agents/[id]/skills/[skillId] — detach.
 *
 * `[skillId]` addresses ONE ATTACHMENT of one skill to one agent. Both readings
 * of the segment resolve: the attachment id (`agent_skills.id`, which is what
 * `AgentSkillDTO.id` carries) and the catalogue id (`agent_skills.skill_id`,
 * which is what a caller holding a skill row has). Both are matched only within
 * this agent, so neither can reach another tenant's row.
 *
 * The workspace check runs first and on its own: `getAgentRow(id,
 * ctx.workspace.id)` before anything touches `agent_skills`. A cross-workspace
 * agent id is a 404, and so is a well-formed attachment id that belongs to
 * someone else — the two are indistinguishable from outside on purpose.
 *
 * What PATCH cannot change: `state`, `version`, `harness`, `origin`,
 * `riskLevelAtAttach`. `updateAgentSkillSchema` has no keys for them. State is
 * the runtime's to report; re-pinning a version in place would swap what is
 * installed while leaving the risk snapshot that was taken for the old one, and
 * that is a detach plus a fresh attach, which re-runs every gate.
 */
import { json, notFound, parseBody, requireAuth } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import { isUuid, updateAgentSkillSchema } from "@/lib/agent-config/validation";
import {
  agentConfigErrorResponse,
  detachAgentSkill,
  updateAgentSkill,
} from "@/lib/services/agent-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; skillId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id, skillId } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");
  // Both columns this resolves against are `uuid`. A non-uuid segment would
  // reach Postgres as `22P02 invalid input syntax for type uuid` and surface as
  // a 500 — a shape error rendered as a server fault.
  if (!isUuid(skillId)) return notFound("Skill not attached to this agent");

  const parsed = await parseBody(req, updateAgentSkillSchema);
  if (parsed.res) return parsed.res;

  try {
    const item = await updateAgentSkill(agent, skillId, parsed.data);
    if (!item) return notFound("Skill not attached to this agent");
    return json({ item });
  } catch (e) {
    return agentConfigErrorResponse(e);
  }
}

/**
 * Detach.
 *
 * Two outcomes, and the body says which, because they mean different things to
 * the operator. `deleted` — the attachment never reached a VM and the row is
 * gone. `removing` — the runtime has it installed, the row is marked `removing`
 * and disabled, and the bytes come off the VM when the runtime next syncs. A
 * `removing` row is still listed, deliberately: an uninstall that has been asked
 * for and not confirmed is exactly the state an operator should be able to see.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id, skillId } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");
  if (!isUuid(skillId)) return notFound("Skill not attached to this agent");

  try {
    const outcome = await detachAgentSkill(agent, skillId);
    if (!outcome) return notFound("Skill not attached to this agent");
    return json({ outcome });
  } catch (e) {
    return agentConfigErrorResponse(e);
  }
}
