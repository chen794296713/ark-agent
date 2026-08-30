import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, agentChannels, channels } from "@/lib/db/schema";
import { getAgentManager } from "@/lib/agent-manager";
import { requireAuth, parseBody, json, notFound, apiError } from "@/lib/api";
import { harnessLabel } from "@/lib/harness";
import { enabledHarnesses, isHarnessEnabled } from "@/lib/harness/provisioning";
import { updateAgentSchema } from "@/lib/validation";
import { mergeSettings } from "@/lib/agent-settings";
import { deleteAgent, getAgentDetail, getAgentRow } from "@/lib/services/agents";
import { getOpenclawVisibleTasks } from "@/lib/services/openclaw_instances";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
type ChannelType = typeof channels.$inferInsert["type"];

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const detail = await getAgentDetail(id, auth.ctx.workspace.id);
  if (!detail) return notFound("Agent not found");
  const runtimeTasks = detail.engine === "openclaw"
    ? await getOpenclawVisibleTasks(id)
    : null;
  return json({ agent: runtimeTasks ? { ...detail, tasks: runtimeTasks } : detail });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const row = await getAgentRow(id, auth.ctx.workspace.id);
  if (!row) return notFound("Agent not found");
  const parsed = await parseBody(req, updateAgentSchema);
  if (parsed.res) return parsed.res;
  const { name, instructions, rules, planTier, engine, channels: chanTypes, settings } = parsed.data;

  // POST /api/agents gates the harness; this route did not, so an agent could be
  // MOVED onto an unprovisionable runtime from the Settings tab — the same
  // failure the create gate exists to prevent, one screen over. A harness change
  // is also a re-provision, so refusing here is the only place it is cheap.
  if (engine !== undefined && engine !== row.engine && !isHarnessEnabled(engine)) {
    return apiError(
      `The ${harnessLabel(engine)} runtime is not available on this deployment.`,
      422,
      { availableHarnesses: enabledHarnesses() },
    );
  }
  const nextSettings =
    settings !== undefined ? mergeSettings({ ...(row.settings ?? {}), ...settings }) : undefined;

  await db
    .update(agents)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(instructions !== undefined ? { instructions } : {}),
      ...(rules !== undefined ? { rules } : {}),
      ...(planTier !== undefined ? { planTier } : {}),
      ...(engine !== undefined ? { engine } : {}),
      ...(nextSettings !== undefined ? { settings: nextSettings } : {}),
      // The revision the runtime polls against, and the ETag it compares. Every
      // write that changes what the agent should DO has to bump it, or the VM
      // keeps running the previous brief and nothing anywhere says so. Bumped
      // unconditionally here: this route only runs when something changed, and
      // an over-count costs one no-op resync while an under-count costs a stale
      // agent. `sql` increments in place so two concurrent PATCHes cannot read
      // the same value and write the same successor.
      configRevision: sql`${agents.configRevision} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, id));

  // Re-link channels if provided.
  if (chanTypes) {
    const types = Array.from(new Set<ChannelType>([...chanTypes, "web"]));
    const existing = await db
      .select()
      .from(channels)
      .where(eq(channels.workspaceId, auth.ctx.workspace.id));
    const byType = new Map(existing.map((c) => [c.type, c.id]));
    const missing = types.filter((t) => !byType.has(t));
    if (missing.length) {
      const ins = await db
        .insert(channels)
        .values(
          missing.map((t) => ({
            workspaceId: auth.ctx.workspace.id,
            type: t,
            status: (t === "web" ? "connected" : "pending") as "connected" | "pending",
            label: t,
          })),
        )
        .returning();
      for (const c of ins) byType.set(c.type, c.id);
    }
    await db.delete(agentChannels).where(eq(agentChannels.agentId, id));
    await db
      .insert(agentChannels)
      .values(types.map((t) => ({ agentId: id, channelId: byType.get(t)! })))
      .onConflictDoNothing();
  }

  // Re-sync config to the Agent Manager.
  if (row.agentManagerId) {
    try {
      await getAgentManager().updateAgent(row.agentManagerId, {
        instructions: instructions ?? row.instructions,
        rules: rules ?? row.rules,
      });
    } catch {
      /* best-effort; webhook will reconcile */
    }
  }

  return json({ agent: await getAgentDetail(id, auth.ctx.workspace.id) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const deleted = await deleteAgent(id, auth.ctx.workspace.id);
  if (!deleted) return notFound("Agent not found");
  return json({ ok: true as const });
}
