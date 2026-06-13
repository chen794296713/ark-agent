import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agents,
  agentRoles,
  agentChannels,
  agentTasks,
  agentActivities,
  agentMetrics,
  agentImprovements,
  channels,
  subscriptions,
  workspaces,
  plans,
} from "@/lib/db/schema";
import type { Agent } from "@/lib/db/schema";
import { getAgentManager } from "@/lib/agent-manager";
import type { AuthContext } from "@/lib/auth";
import {
  serializeAgent,
  serializeActivity,
  serializeImprovement,
  serializeMetric,
  serializeTask,
} from "@/lib/serializers";

type ChannelType = typeof channels.$inferInsert["type"];
type PlanTier = "associate" | "professional" | "director";

/** Map of channel type -> id for a workspace, creating any that don't exist. */
async function ensureChannels(
  workspaceId: string,
  types: ChannelType[],
): Promise<Map<ChannelType, string>> {
  const existing = await db
    .select()
    .from(channels)
    .where(eq(channels.workspaceId, workspaceId));
  const byType = new Map<ChannelType, string>(existing.map((c) => [c.type, c.id]));
  const missing = types.filter((t) => !byType.has(t));
  if (missing.length) {
    const inserted = await db
      .insert(channels)
      .values(
        missing.map((t) => ({
          workspaceId,
          type: t,
          status: (t === "web" ? "connected" : "pending") as "connected" | "pending",
          label: t,
        })),
      )
      .returning();
    for (const c of inserted) byType.set(c.type, c.id);
  }
  return byType;
}

async function roleNameMap(roleIds: string[]): Promise<Map<string, string>> {
  if (!roleIds.length) return new Map();
  const rows = await db
    .select({ id: agentRoles.id, name: agentRoles.name })
    .from(agentRoles)
    .where(inArray(agentRoles.id, Array.from(new Set(roleIds))));
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function channelsForAgents(agentIds: string[]): Promise<Map<string, ChannelType[]>> {
  const out = new Map<string, ChannelType[]>();
  if (!agentIds.length) return out;
  const rows = await db
    .select({ agentId: agentChannels.agentId, type: channels.type })
    .from(agentChannels)
    .innerJoin(channels, eq(channels.id, agentChannels.channelId))
    .where(inArray(agentChannels.agentId, agentIds));
  for (const r of rows) {
    const list = out.get(r.agentId) ?? [];
    list.push(r.type);
    out.set(r.agentId, list);
  }
  return out;
}

async function latestLines(agentIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!agentIds.length) return out;
  const rows = await db
    .select({ agentId: agentActivities.agentId, text: agentActivities.text, at: agentActivities.occurredAt })
    .from(agentActivities)
    .where(inArray(agentActivities.agentId, agentIds))
    .orderBy(desc(agentActivities.occurredAt));
  for (const r of rows) if (!out.has(r.agentId)) out.set(r.agentId, r.text);
  return out;
}

export async function listAgents(workspaceId: string) {
  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.workspaceId, workspaceId))
    .orderBy(asc(agents.createdAt));
  const ids = rows.map((a) => a.id);
  const [roleNames, chans, lines] = await Promise.all([
    roleNameMap(rows.map((a) => a.roleId)),
    channelsForAgents(ids),
    latestLines(ids),
  ]);
  return rows.map((a) =>
    serializeAgent(a, {
      roleName: roleNames.get(a.roleId),
      channels: chans.get(a.id) ?? [],
      line: lines.get(a.id) ?? null,
    }),
  );
}

export async function getAgentRow(agentId: string, workspaceId: string): Promise<Agent | null> {
  const [row] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function getAgentDetail(agentId: string, workspaceId: string) {
  const row = await getAgentRow(agentId, workspaceId);
  if (!row) return null;
  const [roleNames, chans, lines, tasks, activities, metrics, improvements] = await Promise.all([
    roleNameMap([row.roleId]),
    channelsForAgents([agentId]),
    latestLines([agentId]),
    db.select().from(agentTasks).where(eq(agentTasks.agentId, agentId)).orderBy(asc(agentTasks.sortOrder)),
    db.select().from(agentActivities).where(eq(agentActivities.agentId, agentId)).orderBy(desc(agentActivities.occurredAt)),
    db.select().from(agentMetrics).where(eq(agentMetrics.agentId, agentId)),
    db
      .select()
      .from(agentImprovements)
      .where(and(eq(agentImprovements.agentId, agentId), eq(agentImprovements.status, "pending")))
      .orderBy(desc(agentImprovements.createdAt)),
  ]);
  return {
    ...serializeAgent(row, {
      roleName: roleNames.get(row.roleId),
      channels: chans.get(agentId) ?? [],
      line: lines.get(agentId) ?? null,
    }),
    tasks: tasks.map(serializeTask),
    activities: activities.map(serializeActivity),
    metrics: metrics.map(serializeMetric),
    improvements: improvements.map(serializeImprovement),
  };
}

export interface CreateAgentInput {
  name: string;
  roleId: string;
  engine: "openclaw" | "hermes";
  planTier: PlanTier;
  instructions: string;
  rules: string;
  channels: ChannelType[];
  tasks: string[];
}

export async function createAgent(ctx: AuthContext, input: CreateAgentInput) {
  const [role] = await db.select().from(agentRoles).where(eq(agentRoles.id, input.roleId)).limit(1);
  if (!role) throw new Error(`Unknown role: ${input.roleId}`);

  const [agent] = await db
    .insert(agents)
    .values({
      workspaceId: ctx.workspace.id,
      createdById: ctx.user.id,
      name: input.name,
      roleId: input.roleId,
      engine: input.engine,
      planTier: input.planTier,
      status: "provisioning",
      instructions: input.instructions,
      rules: input.rules,
      hue: role.hue,
    })
    .returning();

  // Link channels (always include web for the dashboard chat).
  const types = Array.from(new Set<ChannelType>([...(input.channels ?? []), "web"]));
  const chanMap = await ensureChannels(ctx.workspace.id, types);
  await db
    .insert(agentChannels)
    .values(types.map((t) => ({ agentId: agent.id, channelId: chanMap.get(t)! })))
    .onConflictDoNothing();

  if (input.tasks.length) {
    await db.insert(agentTasks).values(
      input.tasks.map((text, i) => ({ agentId: agent.id, text, status: "queued" as const, sortOrder: i })),
    );
  }

  // Ask the Agent Manager to provision the VM + deploy the engine.
  const am = getAgentManager();
  try {
    const result = await am.provisionAgent({
      externalAgentId: agent.id,
      engine: input.engine,
      roleId: input.roleId,
      name: input.name,
      instructions: input.instructions,
      rules: input.rules,
      channels: types.map((t) => ({ type: t, config: {} })),
    });
    await db
      .update(agents)
      .set({
        agentManagerId: result.agentManagerId,
        vmId: result.vmId,
        vmRegion: result.vmRegion,
        deploymentStatus: result.deploymentStatus,
        status: result.status as Agent["status"],
        provisionedAt: new Date(),
        uptimeStartedAt: new Date(),
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id));
    await db.insert(agentActivities).values({
      agentId: agent.id,
      text: `Provisioned on ${result.vmRegion} (${result.vmId}) and deployed the ${input.engine} engine`,
      tag: "system",
    });
  } catch (err) {
    await db
      .update(agents)
      .set({ status: "error", lastError: String(err).slice(0, 480), updatedAt: new Date() })
      .where(eq(agents.id, agent.id));
  }

  // Create a billing seat and roll the included credits into the workspace.
  await db.insert(subscriptions).values({
    workspaceId: ctx.workspace.id,
    agentId: agent.id,
    planId: input.planTier,
    cycle: "monthly",
    status: "active",
    currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
  });
  const [plan] = await db.select().from(plans).where(eq(plans.id, input.planTier)).limit(1);
  if (plan) {
    await db
      .update(workspaces)
      .set({ creditsIncluded: sql`${workspaces.creditsIncluded} + ${plan.includedCredits}` })
      .where(eq(workspaces.id, ctx.workspace.id));
  }

  return (await getAgentDetail(agent.id, ctx.workspace.id))!;
}

export async function setLifecycle(
  agentId: string,
  workspaceId: string,
  action: "pause" | "resume" | "terminate",
) {
  const row = await getAgentRow(agentId, workspaceId);
  if (!row) return null;
  const am = getAgentManager();
  let status: Agent["status"] = row.status;
  try {
    if (row.agentManagerId) {
      const res = await am.setLifecycle(row.agentManagerId, action);
      status = res.status as Agent["status"];
    } else {
      status = action === "pause" ? "paused" : action === "terminate" ? "terminated" : "working";
    }
  } catch {
    status = action === "pause" ? "paused" : action === "terminate" ? "terminated" : "working";
  }
  await db.update(agents).set({ status, updatedAt: new Date() }).where(eq(agents.id, agentId));
  await db.insert(agentActivities).values({
    agentId,
    text: action === "pause" ? "Agent paused by operator" : action === "resume" ? "Agent resumed by operator" : "Agent terminated by operator",
    tag: "system",
  });
  return getAgentDetail(agentId, workspaceId);
}
