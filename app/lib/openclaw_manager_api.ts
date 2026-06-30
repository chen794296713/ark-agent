/**
 * OpenClaw Manager API client
 * 对接 manager_api.md 中的所有接口
 */

const BASE_URL = process.env.OPENCLAW_MANAGER_API_URL || "http://10.21.27.155:18090";
const API_KEY = process.env.OPENCLAW_MANAGER_API_KEY || "MToxNzgyMjA1NzY4.1DyMW7eTT0x95QgCGlZfNBBWlmsua_YfuVQg5WM8VOo";

function getHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
  };
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`OpenClaw API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ============ 预处理返回结构 ============

/**
 * 预处理创建智能体的返回数据
 */
function preprocessInstance(raw: Record<string, unknown>): PreprocessedInstance {
  return {
    id: raw.id as number,
    uuid: raw.uuid as string,
    userId: raw.user_id as number | undefined,
    name: raw.name as string,
    status: raw.status as string,
    slug: raw.slug as string | null,
    dockerContainerName: raw.docker_container_name as string | null,
    dockerImage: raw.docker_image as string | null,
    accessUrl: raw.access_url as string | null,
    accessUrls: (raw.access_urls as string[]) || [],
    autoStopSeconds: raw.auto_stop_seconds as number | null,
    cpuLimit: raw.cpu_limit as number | null,
    memoryLimit: raw.memory_limit as string | null,
    autoUpdate: raw.auto_update as boolean | null,
    envVars: (raw.env_vars as Record<string, string>) || {},
    modelConfig: (raw.model_config as Record<string, unknown>) || {},
    defaultApiKey: raw.default_api_key as string | null,
    externalApiUrl: raw.external_api_url as string | null,
    externalApiUrls: (raw.external_api_urls as string[]) || [],
    provisioningStatus: raw.provisioning_status as string,
    provisioningError: raw.provisioning_error as string | null,
    errorMessage: raw.error_message as string | null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
    lastActiveAt: raw.last_active_at as string | null,
    isReady: raw.provisioning_status === "running",
    isFailed: raw.provisioning_status === "failed" || !!raw.provisioning_error,
  };
}

/**
 * 预处理事件数据
 */
function preprocessEvent(raw: Record<string, unknown>): PreprocessedEvent {
  return {
    id: raw.id as number,
    instance_uuid: raw.instance_uuid as string,
    action: raw.action as string,
    result: raw.result as string,
    message: raw.message as string,
    metadata: raw.metadata_json as Record<string, unknown> | null,
    created_at: raw.created_at as string,
    isSuccess: raw.result === "success",
    isError: raw.result === "error" || raw.result === "failed",
  };
}

/**
 * 预处理对话消息：统一 content 为字符串
 */
function preprocessMessage(raw: Record<string, unknown>): PreprocessedMessage {
  let content = "";
  if (typeof raw.content === "string") {
    content = raw.content;
  } else if (Array.isArray(raw.content)) {
    content = (raw.content as Array<{ type: string; text: string }>)
      .map((item) => (item.type === "text" ? item.text : ""))
      .join("");
  }

  return {
    role: raw.role as "user" | "assistant" | "system",
    content,
    rawContent: raw.content as string | Array<{ type: string; text: string }>,
    timestamp: raw.timestamp as number | undefined,
    model: raw.model as string | undefined,
    provider: raw.provider as string | undefined,
    usage: raw.usage as PreprocessedMessage["usage"],
    isUser: raw.role === "user",
    isAssistant: raw.role === "assistant",
  };
}

// ============ 预处理后的类型定义 ============

export interface PreprocessedInstance {
  id: number;
  uuid: string;
  userId?: number;
  name: string;
  status: string;
  slug: string | null;
  dockerContainerName: string | null;
  dockerImage: string | null;
  accessUrl: string | null;
  accessUrls: string[];
  autoStopSeconds: number | null;
  cpuLimit: number | null;
  memoryLimit: string | null;
  autoUpdate: boolean | null;
  envVars: Record<string, string>;
  modelConfig: Record<string, unknown>;
  defaultApiKey: string | null;
  externalApiUrl: string | null;
  externalApiUrls: string[];
  provisioningStatus: string;
  provisioningError: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
  isReady: boolean;
  isFailed: boolean;
}

export interface PreprocessedEvent {
  id: number;
  instance_uuid: string;
  action: string;
  result: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  isSuccess: boolean;
  isError: boolean;
}

export interface PreprocessedMessage {
  role: "user" | "assistant" | "system";
  content: string;
  rawContent: string | Array<{ type: string; text: string }>;
  timestamp?: number;
  model?: string;
  provider?: string;
  usage?: {
    input: number;
    output: number;
    totalTokens: number;
    cacheRead: number;
    cacheWrite: number;
    cost: { total: number };
  };
  isUser: boolean;
  isAssistant: boolean;
}

export interface PreprocessedChatHistory {
  sessionKey: string;
  agent: string;
  messages: PreprocessedMessage[];
  userMessages: PreprocessedMessage[];
  assistantMessages: PreprocessedMessage[];
  lastMessage: PreprocessedMessage | null;
  text: string;
}

// ============ 请求参数类型 ============

export interface CreateInstanceParams {
  name: string;
  category_id: number;
  target_user_id: string;
}

export interface SendChatParams {
  agent: string;
  message: string;
}

export interface StreamChatParams {
  agent: string;
  message: string;
  sessionKey?: string;
}

// SSE 事件类型（参考 OpenAI Responses API 流式协议）
export type StreamEventType =
  | "response.created"
  | "response.in_progress"
  | "response.output_item.added"
  | "response.content_part.added"
  | "response.output_text.delta"
  | "response.output_text.done"
  | "response.content_part.done"
  | "response.output_item.done"
  | "response.completed"
  | "response.error";

export interface StreamChatDelta {
  itemId?: string;
  outputIndex?: number;
  contentIndex?: number;
  delta?: string;
  text?: string;
}

export interface StreamChatResponse {
  id: string;
  object: string;
  createdAt: number;
  status: string;
  model: string;
  output?: unknown[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface StreamChatEvent {
  type: StreamEventType | string;
  response?: StreamChatResponse;
  item?: Record<string, unknown>;
  itemId?: string;
  outputIndex?: number;
  contentIndex?: number;
  part?: Record<string, unknown>;
  delta?: string;
  text?: string;
  message?: string;
  error?: { message: string; type?: string };
}

export interface StreamChatHandle {
  responseId: string;
  fullText: string;
  finalResponse: StreamChatResponse | null;
  events: StreamChatEvent[];
  isCompleted: boolean;
}

// ============ API 方法 ============

/**
 * 创建智能体
 * POST /api/instances
 * 返回预处理后的实例数据
 */
export async function createInstance(
  params: CreateInstanceParams
): Promise<PreprocessedInstance> {
  const url = `${BASE_URL}/api/instances`;
  const raw = await request<Record<string, unknown>>(url, {
    method: "POST",
    body: JSON.stringify(params),
  });
  return preprocessInstance(raw);
}

/**
 * 查询智能体创建状态
 * GET /api/instances/:uuid/events
 * 返回预处理后的事件列表
 */
export async function getInstanceEvents(
  instanceUuid: string,
  limit = 50
): Promise<PreprocessedEvent[]> {
  const url = `${BASE_URL}/api/instances/${instanceUuid}/events?limit=${limit}`;
  const rawList = await request<Record<string, unknown>[]>(url, {
    method: "GET",
  });
  return rawList.map(preprocessEvent);
}

/**
 * 获取智能体当前状态
 * GET /api/instances/:uuid/events?limit=1
 * 返回最新的 provisioning 状态
 */
export async function getInstanceStatus(
  instanceUuid: string
): Promise<{ status: string; message: string; isReady: boolean }> {
  const events = await getInstanceEvents(instanceUuid, 1);
  const latest = events[0];

  if (!latest) {
    return { status: "unknown", message: "No events found", isReady: false };
  }

  return {
    status: latest.action,
    message: latest.message,
    isReady: latest.action === "provision_completed",
  };
}

/**
 * 发起对话
 * POST /api/openclaw/instances/:uuid/chat/send
 */
export async function sendChat(
  instanceUuid: string,
  params: SendChatParams
): Promise<{ runId: string; status: string; sessionKey: string }> {
  const url = `${BASE_URL}/api/openclaw/instances/${instanceUuid}/chat/send`;
  const raw = await request<Record<string, unknown>>(url, {
    method: "POST",
    body: JSON.stringify(params),
  });

  return {
    runId: (raw.response as Record<string, unknown>)?.runId as string,
    status: (raw.response as Record<string, unknown>)?.status as string,
    sessionKey: raw.sessionKey as string,
  };
}

/**
 * 获取对话历史
 * GET /api/openclaw/instances/:uuid/chat/history
 * 返回预处理后的对话历史
 */
export async function getChatHistory(
  instanceUuid: string,
  agent = "main"
): Promise<PreprocessedChatHistory> {
  const url = `${BASE_URL}/api/openclaw/instances/${instanceUuid}/chat/history?agent=${agent}`;
  const raw = await request<Record<string, unknown>>(url, {
    method: "GET",
  });

  const rawMessages = (raw.messages as Record<string, unknown>[]) || [];
  const messages = rawMessages.map(preprocessMessage);
  const userMessages = messages.filter((m) => m.isUser);
  const assistantMessages = messages.filter((m) => m.isAssistant);
  const lastMessage = messages[messages.length - 1] || null;

  return {
    sessionKey: raw.sessionKey as string,
    agent: raw.agent as string,
    messages,
    userMessages,
    assistantMessages,
    lastMessage,
    text: lastMessage?.content || "",
  };
}

/**
 * Stream chat (SSE)
 */
export async function streamChat(
  instanceUuid: string,
  params: StreamChatParams,
  options?: { signal?: AbortSignal; onEvent?: (e: StreamChatEvent) => void }
): Promise<StreamChatHandle> {
  const url = BASE_URL + "/api/openclaw/instances/" + instanceUuid + "/chat/stream";
  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(params),
    signal: options?.signal,
  });
  console.log("stream_chat:", url,JSON.stringify(params));
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error("OpenClaw API error " + res.status + ": " + text);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  const handle: StreamChatHandle = {
    responseId: "",
    fullText: "",
    finalResponse: null,
    events: [],
    isCompleted: false,
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      handleLine(line, handle, options?.onEvent);
    }
  }

  if (buffer.length) handleLine(buffer, handle, options?.onEvent);

  handle.isCompleted = true;
  return handle;
}

function handleLine(
  line: string,
  handle: StreamChatHandle,
  onEvent?: (e: StreamChatEvent) => void
) {
  if (!line) return;
  const trimmed = line.replace(/\r$/, "");

  if (trimmed.startsWith(":")) return;
  if (!trimmed.startsWith("data:")) return;

  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") {
    handle.isCompleted = true;
    return;
  }

  let parsed: StreamChatEvent;
  try {
    parsed = JSON.parse(payload) as StreamChatEvent;
  } catch {
    return;
  }

  handle.events.push(parsed);
  if (onEvent) onEvent(parsed);

  if (process.env.OPENCLAW_DEBUG_LOG === "1") {
    const summary: Record<string, unknown> = { type: parsed.type };
    if (parsed.type === "response.output_text.delta") {
      summary.deltaLen = parsed.delta?.length ?? 0;
    } else if (parsed.type === "response.output_text.done") {
      summary.textLen = parsed.text?.length ?? 0;
      summary.hasDelta = Boolean(parsed.delta);
    } else if (parsed.type === "response.completed") {
      const out = parsed.response?.output;
      summary.responseStatus = parsed.response?.status;
      summary.responseModel = parsed.response?.model;
      summary.outputCount = Array.isArray(out) ? out.length : 0;
      if (Array.isArray(out)) {
        summary.outputText = out.map((item) => {
          const it = item as { content?: Array<{ type?: string; text?: string }> };
          return (it.content ?? []).map((c) => ({
            type: c.type,
            textLen: c.text?.length ?? 0,
          }));
        });
      }
    } else if (
      typeof parsed.type === "string" &&
      parsed.type.toLowerCase().includes("error")
    ) {
      // Dump the entire error event so nothing is hidden — upstream may send
      // `error`, `response.error`, or a custom type, with the message in any
      // of several shapes (error / message / response.error / code).
      const raw = parsed as unknown as Record<string, unknown>;
      summary.error = raw.error ?? null;
      summary.message = raw.message ?? null;
      summary.code = raw.code ?? null;
      summary.raw = parsed;
    }
    console.log("[openclaw-stream]", JSON.stringify(summary));
  }

  if (parsed.type === "response.created" || parsed.type === "response.in_progress") {
    if (parsed.response?.id) handle.responseId = parsed.response.id;
  }

  if (parsed.type === "response.output_text.delta" && parsed.delta) {
    handle.fullText += parsed.delta;
  }

  if (parsed.type === "response.output_text.done" && parsed.text) {
    if (!handle.fullText) handle.fullText = parsed.text;
  }

  if (parsed.type === "response.completed" && parsed.response) {
    handle.finalResponse = parsed.response;
    handle.responseId = parsed.response.id;
  }
}

/**
 * 将流式结果转换为预处理消息
 */
export function streamHandleToMessage(
  handle: StreamChatHandle
): PreprocessedMessage {
  const usage = handle.finalResponse?.usage;
  return {
    role: "assistant",
    content: handle.fullText,
    rawContent: [
      { type: "output_text", text: handle.fullText },
    ],
    timestamp: handle.finalResponse?.createdAt,
    model: handle.finalResponse?.model,
    provider: "openclaw",
    usage: usage
      ? {
          input: usage.inputTokens,
          output: usage.outputTokens,
          totalTokens: usage.totalTokens,
          cacheRead: 0,
          cacheWrite: 0,
          cost: { total: 0 },
        }
      : undefined,
    isUser: false,
    isAssistant: true,
  };
}

/**
 * 流式对话的便捷封装：直接返回最终消息
 */
export async function chat(
  instanceUuid: string,
  params: StreamChatParams,
  options?: { signal?: AbortSignal; onEvent?: (e: StreamChatEvent) => void }
): Promise<PreprocessedMessage> {
  const handle = await streamChat(instanceUuid, params, options);
  return streamHandleToMessage(handle);
}

/**
 * 停止智能体
 * POST /api/instances/:uuid/stop
 * 返回预处理后的实例数据
 */
export async function stopInstance(instanceUuid: string): Promise<PreprocessedInstance> {
  const url = `${BASE_URL}/api/instances/${instanceUuid}/stop`;
  const raw = await request<Record<string, unknown>>(url, { method: "POST" });
  return preprocessInstance(raw);
}

/**
 * 启动智能体
 * POST /api/instances/:uuid/start
 * 返回预处理后的实例数据
 */
export async function startInstance(instanceUuid: string): Promise<PreprocessedInstance> {
  const url = `${BASE_URL}/api/instances/${instanceUuid}/start`;
  const raw = await request<Record<string, unknown>>(url, { method: "POST" });
  return preprocessInstance(raw);
}

/**
 * 获取智能体详细信息（实时）
 * GET /api/instances/:uuid
 * 返回预处理后的实例数据（包含最新状态）
 */
export async function getInstance(instanceUuid: string): Promise<PreprocessedInstance> {
  const url = `${BASE_URL}/api/instances/${instanceUuid}`;
  const raw = await request<Record<string, unknown>>(url, { method: "GET" });
  return preprocessInstance(raw);
}
