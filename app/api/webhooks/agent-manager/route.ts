import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agents,
  agentActivities,
  agentImprovements,
  agentMetrics,
  conversations,
  messages,
  usageRecords,
  workspaces,
} from "@/lib/db/schema";
import { verifyWebhookSignature, type WebhookEvent } from "@/lib/agent-manager";
import { apiError, json } from "@/lib/api";
import type { Agent } from "@/lib/db/schema";

type ActivityTag = typeof agentActivities.$inferInsert["tag"];
type MessageChannel = typeof messages.$inferInsert["channelType"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVITY_TAGS = new Set([
  "meeting", "draft", "research", "review", "outreach", "learning", "resolved",
  "escalated", "summary", "published", "brief", "calendar", "docs", "system",
]);

/** Inbound events from the Agent Manager (HMAC-signed). See docs/API.md. */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-arkagent-signature");
  if (!verifyWebhookSignature(raw, sig)) return apiError("Invalid signature", 401);

  let event: WebhookEvent;
  try {
    event = JSON.parse(raw) as WebhookEvent;
  } catch {
    return apiError("Invalid JSON", 400);
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, event.externalAgentId))
    .limit(1);
  if (!agent) return apiError("Unknown agent", 404);

  switch (event.type) {
    case "agent.status":
      await db
        .update(agents)
        .set({
          status: event.status as Agent["status"],
          ...(event.vmId ? { vmId: event.vmId } : {}),
          ...(event.vmRegion ? { vmRegion: event.vmRegion } : {}),
          ...(event.deploymentStatus ? { deploymentStatus: event.deploymentStatus } : {}),
          ...(event.error ? { lastError: event.error.slice(0, 480) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agent.id));
      break;

    case "agent.heartbeat":
      await db
        .update(agents)
        .set({
          lastHeartbeatAt: new Date(event.ts),
          ...(event.uptimeStartedAt ? { uptimeStartedAt: new Date(event.uptimeStartedAt) } : {}),
        })
        .where(eq(agents.id, agent.id));
      break;

    case "agent.activity":
      await db.insert(agentActivities).values({
        agentId: agent.id,
        text: event.text,
        tag: (ACTIVITY_TAGS.has(event.tag ?? "") ? event.tag : "system") as ActivityTag,
        occurredAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
      });
      break;

    case "agent.message": {
      let convId = event.conversationId;
      if (!convId) {
        const [conv] = await db
          .select()
          .from(conversations)
          .where(eq(conversations.agentId, agent.id))
          .orderBy(desc(conversations.lastMessageAt))
          .limit(1);
        convId = conv?.id;
        if (!convId) {
          const [created] = await db
            .insert(conversations)
            .values({ agentId: agent.id, subject: "Inbound" })
            .returning();
          convId = created.id;
        }
      }
      await db
        .insert(messages)
        .values({
          conversationId: convId,
          agentId: agent.id,
          sender: "agent",
          body: event.body,
          channelType: event.channel as MessageChannel,
          status: "delivered",
          externalId: event.externalId,
          meta: event.meta ?? `${agent.name.toUpperCase()} · VIA ${event.channel.toUpperCase()}`,
        })
        .onConflictDoNothing();
      await db
        .update(conversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(conversations.id, convId));
      break;
    }

    case "agent.metric":
      await db.insert(agentMetrics).values({
        agentId: agent.id,
        label: event.label,
        value: event.value,
        delta: event.delta ?? null,
        weight: event.weight ?? 0,
      });
      break;

    case "agent.improvement":
      await db.insert(agentImprovements).values({
        agentId: agent.id,
        text: event.text,
        impact: event.impact ?? null,
        status: "pending",
      });
      break;

    case "agent.usage": {
      await db.insert(usageRecords).values({
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        kind: "compute",
        credits: event.credits,
      });
      await db.insert(agentActivities).values({
        agentId: agent.id,
        text: `Consumed ${event.credits} credits`,
        tag: "system",
      });
      // Atomic increments — safe under concurrent usage webhooks.
      await db
        .update(workspaces)
        .set({ creditsUsed: sql`${workspaces.creditsUsed} + ${event.credits}` })
        .where(eq(workspaces.id, agent.workspaceId));
      await db
        .update(agents)
        .set({ creditsUsed: sql`${agents.creditsUsed} + ${event.credits}` })
        .where(eq(agents.id, agent.id));
      break;
    }
  }

  return json({ ok: true });
}
