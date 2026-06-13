import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, agentChannels, channels } from "@/lib/db/schema";
import { getAgentManager } from "@/lib/agent-manager";
import { requireAuth, parseBody, json, notFound } from "@/lib/api";
import { updateAgentSchema } from "@/lib/validation";
import { getAgentDetail, getAgentRow, setLifecycle } from "@/lib/services/agents";

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
  return json({ agent: detail });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const row = await getAgentRow(id, auth.ctx.workspace.id);
  if (!row) return notFound("Agent not found");
  const parsed = await parseBody(req, updateAgentSchema);
  if (parsed.res) return parsed.res;
  const { name, instructions, rules, planTier, channels: chanTypes } = parsed.data;

  await db
    .update(agents)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(instructions !== undefined ? { instructions } : {}),
      ...(rules !== undefined ? { rules } : {}),
      ...(planTier !== undefined ? { planTier } : {}),
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
  const detail = await setLifecycle(id, auth.ctx.workspace.id, "terminate");
  if (!detail) return notFound("Agent not found");
  return json({ agent: detail });
}
