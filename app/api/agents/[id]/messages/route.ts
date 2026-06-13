import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages, usageRecords } from "@/lib/db/schema";
import { getAgentManager, mockReply } from "@/lib/agent-manager";
import { requireAuth, parseBody, json, notFound } from "@/lib/api";
import { sendMessageSchema } from "@/lib/validation";
import { getAgentRow } from "@/lib/services/agents";
import { serializeMessage } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function latestConversation(agentId: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.agentId, agentId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  return conv ?? null;
}

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");
  const conv = await latestConversation(id);
  if (!conv) return json({ conversationId: null, messages: [] });
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.createdAt));
  return json({ conversationId: conv.id, messages: rows.map(serializeMessage) });
}

export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");
  const parsed = await parseBody(req, sendMessageSchema);
  if (parsed.res) return parsed.res;

  // Resolve (or create) the web conversation.
  let conv = await latestConversation(id);
  if (!conv) {
    [conv] = await db
      .insert(conversations)
      .values({ agentId: id, subject: "Web chat" })
      .returning();
  }

  const [userMsg] = await db
    .insert(messages)
    .values({
      conversationId: conv.id,
      agentId: id,
      sender: "user",
      body: parsed.data.body,
      channelType: "web",
      status: "delivered",
      meta: "YOU",
    })
    .returning();

  const am = getAgentManager();
  let replyMsg = null;
  try {
    await am.sendMessage(agent.agentManagerId ?? agent.id, {
      conversationId: conv.id,
      body: parsed.data.body,
      channel: "web",
    });
  } catch {
    /* best-effort send; live mode replies arrive via webhook */
  }

  // In mock mode, synthesize a role-flavored reply immediately so the chat works
  // end-to-end. In live mode, the reply arrives via the agent.message webhook.
  if (process.env.AGENT_MANAGER_MODE !== "live") {
    [replyMsg] = await db
      .insert(messages)
      .values({
        conversationId: conv.id,
        agentId: id,
        sender: "agent",
        body: mockReply(agent.roleId, parsed.data.body),
        channelType: "web",
        status: "delivered",
        meta: `${agent.name.toUpperCase()} · VIA WEB`,
      })
      .returning();
  }

  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conv.id));
  await db.insert(usageRecords).values({
    workspaceId: auth.ctx.workspace.id,
    agentId: id,
    kind: "message",
    credits: 1,
    note: "web chat",
  });

  return json({
    conversationId: conv.id,
    userMessage: serializeMessage(userMsg),
    replyMessage: replyMsg ? serializeMessage(replyMsg) : null,
  });
}
