import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, agentManagerConfig } from "@/lib/db/schema";
import { requireAuth, json, notFound } from "@/lib/api";
import { wechatLogin } from "@/app/lib/openclaw_manager_api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Request a WeChat QR code login for a specific agent instance.
 * POST /api/channels/wechat/login?instance_uuid=<agentId>
 *
 * Returns an SSE stream that proxies upstream `/api/channels/{uuid}/flows`.
 * Browser receives events named: wait_matched, step_completed, heartbeat,
 * session_completed, plus a terminal `done` event whose payload is the
 * aggregated WechatLoginResponse JSON.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  const url = new URL(req.url);
  const instanceUuid = url.searchParams.get("instance_uuid");
  if (!instanceUuid) {
    return json({ error: "instance_uuid is required" }, 400);
  }

  let agentId: string | null = null;

  // Strategy 1: Look up by agents.id
  const [agentById] = await db
    .select({ id: agents.id, workspaceId: agents.workspaceId })
    .from(agents)
    .where(eq(agents.id, instanceUuid))
    .limit(1);

  if (agentById) {
    if (agentById.workspaceId !== auth.ctx.workspace.id) {
      return notFound("Agent not found");
    }
    agentId = agentById.id;
  } else {
    // Strategy 2: Look up by agentManagerConfig.externalId (OpenClaw instance UUID)
    const [cfgByExternal] = await db
      .select({ agentId: agentManagerConfig.agentId })
      .from(agentManagerConfig)
      .where(eq(agentManagerConfig.externalId, instanceUuid))
      .limit(1);

    if (cfgByExternal) {
      const [agentForExternal] = await db
        .select({ id: agents.id, workspaceId: agents.workspaceId })
        .from(agents)
        .where(eq(agents.id, cfgByExternal.agentId))
        .limit(1);

      if (!agentForExternal || agentForExternal.workspaceId !== auth.ctx.workspace.id) {
        return notFound("Agent not found");
      }
      agentId = cfgByExternal.agentId;
    } else {
      return notFound("Agent not found");
    }
  }

  // Look up the OpenClaw instance UUID (externalId) for this agent
  const [cfg] = await db
    .select({ externalId: agentManagerConfig.externalId })
    .from(agentManagerConfig)
    .where(eq(agentManagerConfig.agentId, agentId))
    .limit(1);

  if (!cfg?.externalId) {
    return json({ error: "Agent has no OpenClaw instance configured" }, 400);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      try {
        const result = await wechatLogin(cfg.externalId, {
          signal: req.signal,
          onEvent: (e) => send(e.event, e.data),
        });
        send("done", result);
      } catch (e) {
        send("error", {
          message: e instanceof Error ? e.message : "WeChat login stream failed",
        });
      } finally {
        controller.close();
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
