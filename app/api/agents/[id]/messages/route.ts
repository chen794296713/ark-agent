import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentRoles, conversations, messages, usageRecords } from "@/lib/db/schema";
import { requireAuth, parseBody, json, notFound } from "@/lib/api";
import { sendMessageSchema } from "@/lib/validation";
import { getAgentRow } from "@/lib/services/agents";
import { serializeMessage } from "@/lib/serializers";
import { mockReply } from "@/lib/agent-manager";
import {
  getOpenclawConfigByAgentId,
  streamOpenclawChat,
} from "@/lib/services/openclaw_instances";
import { mergeSettings } from "@/lib/agent-settings";
import { isLLMConfigured, streamChatCompletion, type ChatMessage } from "@/lib/llm/openrouter";
import { buildAgentSystemPrompt } from "@/lib/llm/agent-prompt";
import type { Agent, Message } from "@/lib/db/schema";

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

  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conv.id));

  const openclawConfig = await getOpenclawConfigByAgentId(id);
  const useStream =
    process.env.AGENT_MANAGER_MODE === "live" && !!openclawConfig?.externalId;
  // When no live OpenClaw runtime is attached, prefer a real LLM (OpenRouter)
  // over the canned mock reply — as long as an API key is configured.
  const useLLM = !useStream && isLLMConfigured();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
        );
      };
      try {
        send({ type: "user_message", conversationId: conv!.id, message: serializeMessage(userMsg) });
        if (useStream) {
          await streamOpenclawReply({
            externalId: openclawConfig!.externalId,
            agentId: id,
            conversationId: conv!.id,
            agentName: agent.name,
            body: parsed.data.body,
            sessionKey: parsed.data.sessionKey,
            onDelta: (delta) => send({ type: "delta", delta }),
            onComplete: (replyMessage) =>
              send({ type: "done", conversationId: conv!.id, replyMessage: serializeMessage(replyMessage) }),
            onError: (message) => send({ type: "error", message }),
          });
        } else if (useLLM) {
          await streamLLMReply({
            agent,
            conversationId: conv!.id,
            onDelta: (delta) => send({ type: "delta", delta }),
            onComplete: (replyMessage) =>
              send({ type: "done", conversationId: conv!.id, replyMessage: serializeMessage(replyMessage) }),
            onError: (message) => send({ type: "error", message }),
          });
        } else {
          const text = mockReply(agent.roleId, parsed.data.body);
          for (const token of tokenizeMockReply(text)) {
            send({ type: "delta", delta: token });
            await sleep(15);
          }
          const reply = await persistAgentReply({
            agentId: id,
            conversationId: conv!.id,
            agentName: agent.name,
            body: text,
          });
          send({ type: "done", conversationId: conv!.id, replyMessage: serializeMessage(reply) });
        }
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "Stream failed" });
      } finally {
        controller.close();
        try {
          await db.insert(usageRecords).values({
            workspaceId: auth.ctx.workspace.id,
            agentId: id,
            kind: "message",
            credits: 1,
            note: "web chat",
          });
        } catch {
          /* usage tracking is best-effort */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}

async function streamOpenclawReply(opts: {
  externalId: string;
  agentId: string;
  conversationId: string;
  agentName: string;
  body: string;
  sessionKey?: string;
  onDelta: (delta: string) => void;
  onComplete: (replyMessage: Message) => void;
  onError: (message: string) => void;
}) {
  try {
    const handle = await streamOpenclawChat(
      opts.externalId,
      {
        agent: "main",
        message: opts.body,
        ...(opts.sessionKey ? { sessionKey: opts.sessionKey } : {}),
      },
      {
        onEvent: (event) => {
          if (event.type === "response.output_text.delta" && event.delta) {
            opts.onDelta(event.delta);
          } else if (
            event.type === "response.output_text.done" &&
            event.text &&
            !event.delta
          ) {
            opts.onDelta(event.text);
          } else if (event.type === "response.error") {
            const msg =
              (event.error as { message?: string } | undefined)?.message ||
              event.message ||
              "Stream error";
            opts.onError(msg);
          }
        },
      }
    );
    if (process.env.OPENCLAW_DEBUG_LOG === "1") {
      const types = handle.events.reduce<Record<string, number>>((acc, e) => {
        const t = String(e.type ?? "unknown");
        acc[t] = (acc[t] ?? 0) + 1;
        return acc;
      }, {});
      console.log(
        "[openclaw-stream-summary]",
        JSON.stringify({
          externalId: opts.externalId,
          agentId: opts.agentId,
          events: handle.events.length,
          eventTypes: types,
          fullTextLength: handle.fullText.length,
          fullTextSample: handle.fullText.slice(0, 200),
          finalResponseStatus: handle.finalResponse?.status ?? null,
          finalResponseModel: handle.finalResponse?.model ?? null,
          finalResponseOutputItems: Array.isArray(handle.finalResponse?.output)
            ? handle.finalResponse!.output!.length
            : 0,
        })
      );
    }
    const reply = await persistAgentReply({
      agentId: opts.agentId,
      conversationId: opts.conversationId,
      agentName: opts.agentName,
      body: handle.fullText || "(empty reply)",
    });
    opts.onComplete(reply);
  } catch (e) {
    opts.onError(e instanceof Error ? e.message : "OpenClaw stream failed");
  }
}

async function streamLLMReply(opts: {
  agent: Agent;
  conversationId: string;
  onDelta: (delta: string) => void;
  onComplete: (replyMessage: Message) => void;
  onError: (message: string) => void;
}) {
  try {
    const [role] = await db
      .select({ name: agentRoles.name, blurb: agentRoles.blurb })
      .from(agentRoles)
      .where(eq(agentRoles.id, opts.agent.roleId))
      .limit(1);
    const settings = mergeSettings(opts.agent.settings);

    // Recent conversation history (includes the message we just stored).
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, opts.conversationId))
      .orderBy(asc(messages.createdAt));
    const recent = history.slice(-20);

    const llmMessages: ChatMessage[] = [
      {
        role: "system",
        content: buildAgentSystemPrompt({
          agentName: opts.agent.name,
          roleName: role?.name ?? "AI employee",
          roleBlurb: role?.blurb ?? null,
          instructions: opts.agent.instructions,
          rules: opts.agent.rules,
          settings,
        }),
      },
    ];
    for (const m of recent) {
      if (m.sender === "user") llmMessages.push({ role: "user", content: m.body });
      else if (m.sender === "agent") llmMessages.push({ role: "assistant", content: m.body });
    }

    const full = await streamChatCompletion({
      messages: llmMessages,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      onDelta: opts.onDelta,
    });

    const reply = await persistAgentReply({
      agentId: opts.agent.id,
      conversationId: opts.conversationId,
      agentName: opts.agent.name,
      body: full.trim() || "(no reply)",
    });
    opts.onComplete(reply);
  } catch (e) {
    opts.onError(e instanceof Error ? e.message : "LLM reply failed");
  }
}

async function persistAgentReply(opts: {
  agentId: string;
  conversationId: string;
  agentName: string;
  body: string;
}): Promise<Message> {
  const [row] = await db
    .insert(messages)
    .values({
      conversationId: opts.conversationId,
      agentId: opts.agentId,
      sender: "agent",
      body: opts.body,
      channelType: "web",
      status: "delivered",
      meta: `${opts.agentName.toUpperCase()} · VIA WEB`,
    })
    .returning();
  return row;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function tokenizeMockReply(text: string): string[] {
  const out: string[] = [];
  const re = /([\s,.;:!?，。；：！？”'》）)]+|[^\s,.;:!?，。；：！？”'》）)]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[0]);
  if (out.length === 0) out.push(text);
  return out;
}
