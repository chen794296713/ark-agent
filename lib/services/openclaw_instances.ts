import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentManagerConfig, agents } from "@/lib/db/schema";
import {
  createInstance,
  getInstanceEvents,
  getChatHistory,
  sendChat,
  streamChat,
  chat,
  streamHandleToMessage,
  stopInstance,
  startInstance,
  getInstance,
  type PreprocessedInstance,
  type PreprocessedEvent,
  type PreprocessedChatHistory,
  type PreprocessedMessage,
  type StreamChatEvent,
  type StreamChatHandle,
  type StreamChatParams,
} from "@/app/lib/openclaw_manager_api";
import type { AgentManagerConfig } from "@/lib/db/schema";

const PROVIDER = "openclaw";

export interface CreateOpenclawInstanceInput {
  agentId: string;
  name: string;
  categoryId: number;
  targetUserId: string;
}

export interface CreateOpenclawInstanceResult {
  config: AgentManagerConfig;
  preprocessed: PreprocessedInstance;
}

/**
 * 调用 OpenClaw Manager 创建实例，并把完整响应存入 agent_manager_config。
 */
export async function createOpenclawInstance(
  input: CreateOpenclawInstanceInput
): Promise<CreateOpenclawInstanceResult> {
  const preprocessed = await createInstance({
    name: input.name,
    category_id: input.categoryId,
    target_user_id: input.targetUserId,
  });

  const [row] = await db
    .insert(agentManagerConfig)
    .values({
      agentId: input.agentId,
      provider: PROVIDER,
      externalId: preprocessed.uuid,
      status: preprocessed.provisioningStatus,
      lastError: preprocessed.provisioningError,
      config: preprocessed as unknown as Record<string, unknown>,
    })
    .returning();

  return { config: row, preprocessed };
}

/**
 * 获取指定 agent 的 openclaw provider 配置。
 */
export async function getOpenclawConfigByAgentId(
  agentId: string
): Promise<AgentManagerConfig | null> {
  const [row] = await db
    .select()
    .from(agentManagerConfig)
    .where(
      and(
        eq(agentManagerConfig.agentId, agentId),
        eq(agentManagerConfig.provider, PROVIDER)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * 通过 provider 外部 ID 查找配置。
 */
export async function getOpenclawConfigByExternalId(
  externalId: string
): Promise<AgentManagerConfig | null> {
  const [row] = await db
    .select()
    .from(agentManagerConfig)
    .where(
      and(
        eq(agentManagerConfig.provider, PROVIDER),
        eq(agentManagerConfig.externalId, externalId)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * 把最新状态写回配置行（status / lastError）。
 */
export async function syncOpenclawStatus(
  externalId: string,
  status: string,
  lastError: string | null = null
): Promise<AgentManagerConfig | null> {
  const [updated] = await db
    .update(agentManagerConfig)
    .set({ status, lastError, updatedAt: new Date() })
    .where(
      and(
        eq(agentManagerConfig.provider, PROVIDER),
        eq(agentManagerConfig.externalId, externalId)
      )
    )
    .returning();
  return updated ?? null;
}

/**
 * 拉取 OpenClaw 实例的最近事件（直接走上游 API，DB 不再单独存 events）。
 */
export async function getOpenclawInstanceEventsFromApi(
  externalId: string
): Promise<PreprocessedEvent[]> {
  return getInstanceEvents(externalId);
}

/**
 * 发送对话
 */
export async function sendOpenclawChat(
  externalId: string,
  agent: string,
  message: string
) {
  return sendChat(externalId, { agent, message });
}

/**
 * 获取对话历史
 */
export async function getOpenclawChatHistory(
  externalId: string,
  agent = "main"
): Promise<PreprocessedChatHistory> {
  return getChatHistory(externalId, agent);
}

/**
 * 流式对话（实时回调每个 SSE 事件）
 */
export async function streamOpenclawChat(
  externalId: string,
  params: StreamChatParams,
  options?: {
    signal?: AbortSignal;
    onEvent?: (event: StreamChatEvent) => void;
  }
): Promise<StreamChatHandle> {
  return streamChat(externalId, params, options);
}

/**
 * 流式对话便捷封装：等待完成后返回最终回复
 */
export async function chatOpenclaw(
  externalId: string,
  params: StreamChatParams,
  options?: {
    signal?: AbortSignal;
    onEvent?: (event: StreamChatEvent) => void;
  }
): Promise<PreprocessedMessage> {
  return chat(externalId, params, options);
}

export { streamHandleToMessage };

/**
 * 停止 OpenClaw 实例
 */
export async function stopOpenclawInstance(externalId: string): Promise<PreprocessedInstance> {
  return stopInstance(externalId);
}

/**
 * 启动 OpenClaw 实例
 */
export async function startOpenclawInstance(externalId: string): Promise<PreprocessedInstance> {
  return startInstance(externalId);
}

/**
 * 获取 OpenClaw 实例详细信息（实时）
 */
export async function getOpenclawInstance(externalId: string): Promise<PreprocessedInstance> {
  return getInstance(externalId);
}

/**
 * 同步 OpenClaw 实例最新状态到 DB。
 * 1. 更新 agentManagerConfig 表（status / config / lastError）
 *    status 列直接存储 OpenClaw 返回的 status（running/stopped/provisioning 等）
 * 2. 如果 status 发生变化，同步更新 agents 表的 status
 *    status -> agents.status 映射：
 *    "running" -> "working"
 *    "provisioning" -> "provisioning"
 *    "stopped" | "stopping" -> "paused"
 *    其他/失败 -> "error"
 * 3. 如果 status 从非 running 变为 running，
 *    自动调用 /stop 将实例暂停（符合"查看即暂停"的产品行为）
 */
export async function syncOpenclawInstanceToDb(
  externalId: string
): Promise<{ statusChanged: boolean; newStatus: string; autoStopped: boolean }> {
  const latest = await getInstance(externalId);
  const existing = await getOpenclawConfigByExternalId(externalId);
  if (!existing) return { statusChanged: false, newStatus: latest.status, autoStopped: false };

  const oldStatus = existing.status;
  const newStatus = latest.status;

  await db
    .update(agentManagerConfig)
    .set({
      status: newStatus,
      lastError: latest.provisioningError,
      config: latest as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(agentManagerConfig.id, existing.id));

  const statusChanged = oldStatus !== newStatus;
  let autoStopped = false;

  // Map upstream status to agent status
  if (statusChanged && existing.agentId) {
    let agentStatus: "working" | "provisioning" | "paused" | "error" = "error";
    if (newStatus === "running") {
      agentStatus = "working";
    } else if (newStatus === "provisioning") {
      agentStatus = "provisioning";
    } else if (newStatus === "stopped" || newStatus === "stopping") {
      agentStatus = "paused";
    }
    await db
      .update(agents)
      .set({ status: agentStatus, updatedAt: new Date() })
      .where(eq(agents.id, existing.agentId));

    // Auto-pause: if upstream just became running, stop the running instance.
    // This matches the "view info → instance pauses" product behaviour.
    if (agentStatus === "working" && (oldStatus === "provisioning" || oldStatus === "pending" || oldStatus === null)) {
      try {
        const stopped = await stopInstance(externalId);
        // Update DB immediately so the UI reflects the paused state.
        await db
          .update(agentManagerConfig)
          .set({ status: stopped.status, updatedAt: new Date() })
          .where(eq(agentManagerConfig.id, existing.id));
        await db
          .update(agents)
          .set({ status: "paused", updatedAt: new Date() })
          .where(eq(agents.id, existing.agentId));
        autoStopped = true;
      } catch {
        /* best-effort; will reconcile on next sync */
      }
    }
  }

  return { statusChanged, newStatus, autoStopped };
}
