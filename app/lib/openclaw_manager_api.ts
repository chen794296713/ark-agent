/**
 * OpenClaw Manager API client
 * 对接 manager_api.md 中的所有接口
 */

const BASE_URL = (
  process.env.OPENCLAW_MANAGER_API_URL || "https://clawmanager.lightark.cc"
).replace(/\/+$/, "");
const API_KEY = process.env.OPENCLAW_MANAGER_API_KEY || "";

function getHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
  };
}

function logRequest(url: string, options?: RequestInit): void {
  if (process.env.OPENCLAW_DEBUG_LOG !== "1") return;

  const parsedUrl = new URL(url);
  let body: unknown;
  if (typeof options?.body === "string") {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = options.body;
    }
  } else if (options?.body !== undefined) {
    body = "[non-string body]";
  }

  console.info(
    "[openclaw-manager:request]",
    JSON.stringify({
      method: options?.method || "GET",
      url: `${parsedUrl.origin}${parsedUrl.pathname}`,
      query: Object.fromEntries(parsedUrl.searchParams.entries()),
      ...(body !== undefined ? { body } : {}),
    }),
  );
}

export interface OpenClawManagerAgent {
  id: number;
  user_id: number;
  category_id: number;
  category_name: string;
  name: string;
  description: string;
  upload_filename: string;
  created_at: string;
  updated_at: string;
}

/**
 * 获取 OpenClaw Manager 中可用于岗位选择的模板列表。
 * GET /api/agents
 */
export async function listOpenClawManagerAgents(): Promise<OpenClawManagerAgent[]> {
  const raw = await request<{ items?: unknown }>(`${BASE_URL}/api/agents`, {
    method: "GET",
  });

  if (!Array.isArray(raw.items)) return [];
  return raw.items.filter((item): item is OpenClawManagerAgent => {
    if (!item || typeof item !== "object") return false;
    const value = item as Record<string, unknown>;
    return typeof value.id === "number" && typeof value.name === "string";
  });
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  logRequest(url, options);
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
  agent_id?: number;
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
  const requestOptions: RequestInit = {
    method: "POST",
    body: JSON.stringify(params),
    signal: options?.signal,
  };
  logRequest(url, requestOptions);
  const res = await fetch(url, {
    ...requestOptions,
    headers: getHeaders(),
  });
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

// ============ Token 消耗报告 ============

/**
 * 单日单实例的 token 消耗记录
 */
export interface TokenReportEntry {
  date: string;
  instanceId: number;
  instanceName: string;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
  calls: number;
}

/**
 * 实例摘要（仅包含 id 和 name）
 */
export interface TokenReportInstance {
  id: number;
  name: string;
}

/**
 * token 报告汇总
 */
export interface TokenReportTotals {
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
  calls: number;
}

/**
 * 预处理后的 token 报告
 */
export interface PreprocessedTokenReport {
  instances: TokenReportInstance[];
  report: TokenReportEntry[];
  totals: TokenReportTotals;
}

/**
 * 预处理 token 报告返回数据，统一字段命名
 */
function preprocessTokenReport(raw: Record<string, unknown>): PreprocessedTokenReport {
  return {
    instances: ((raw.instances as Record<string, unknown>[]) ?? []).map((i) => ({
      id: i.id as number,
      name: i.name as string,
    })),
    report: ((raw.report as Record<string, unknown>[]) ?? []).map((e) => ({
      date: e.date as string,
      instanceId: e.instance_id as number,
      instanceName: e.instance_name as string,
      inputTokens: (e.input_tokens as number) ?? 0,
      outputTokens: (e.output_tokens as number) ?? 0,
      cacheTokens: (e.cache_tokens as number) ?? 0,
      totalTokens: (e.total_tokens as number) ?? 0,
      calls: (e.calls as number) ?? 0,
    })),
    totals: (() => {
      const t = raw.totals as Record<string, unknown>;
      return {
        inputTokens: (t.input_tokens as number) ?? 0,
        outputTokens: (t.output_tokens as number) ?? 0,
        cacheTokens: (t.cache_tokens as number) ?? 0,
        totalTokens: (t.total_tokens as number) ?? 0,
        calls: (t.calls as number) ?? 0,
      };
    })(),
  };
}

export interface GetTokenReportParams {
  instanceId: string;
  /** 统计粒度，按天 / 按小时 */
  period?: "day" | "hour";
  /** 统计天数 */
  days: number;
}

/**
 * 查询 token 消耗报告
 * GET /api/admin/token-report/instances?period=&days=&instance_id=
 */
export async function getTokenReport(
  params: GetTokenReportParams
): Promise<PreprocessedTokenReport> {
  const period = params.period ?? "day";
  const url =
    `${BASE_URL}/api/admin/token-report/instances` +
    `?period=${encodeURIComponent(period)}` +
    `&by=uuid` +
    `&days=${encodeURIComponent(String(params.days))}` +
    `&instance_uuid=${encodeURIComponent(params.instanceId)}`;
  const raw = await request<Record<string, unknown>>(url, { method: "GET" });
  return preprocessTokenReport(raw);
}

// ============ 渠道管理 ============

// OpenClaw /api/channels/status response shape
export interface OpenClawChannelStatus {
  instance_uuid: string;
  instance_type: string;
  source: string;
  channels: Record<string, OpenClawChannelEntry>;
}

export interface OpenClawChannelEntry {
  channel_type: string;
  label: string;
  enabled: boolean;
  configured: boolean;
  config: Record<string, unknown>;
}

/**
 * 获取渠道状态（完整配置）— 回显用
 * GET /api/channels/status?instance_uuid=<uuid>
 *
 * 返回每个渠道的 enabled / configured / config 信息。
 */
export async function getChannelStatus(instanceUuid: string): Promise<OpenClawChannelStatus | null> {
  const url = `${BASE_URL}/api/channels/status?instance_uuid=${encodeURIComponent(instanceUuid)}`;
  try {
    const raw = await request<OpenClawChannelStatus>(url, { method: "GET" });
    return raw ?? null;
  } catch {
    return null;
  }
}

/**
 * 渠道配置 upsert（飞书/钉钉/微信/企微）
 * POST /api/channels/upsert
 */
export async function upsertChannel(params: {
  instanceUuid: string;
  channelType: string;
  enabled: boolean;
  config: Record<string, unknown>;
}): Promise<void> {
  const url = `${BASE_URL}/api/channels/upsert`;
  await request<void>(url, {
    method: "POST",
    body: JSON.stringify({
      instance_uuid: params.instanceUuid,
      channel_type: params.channelType,
      enabled: params.enabled,
      config: params.config,
    }),
  });
}

/**
 * 微信扫码登录 — 流式返回 (POST /api/channels/:uuid/flows 返回 SSE)
 *
 * 上游会以 SSE 形式推送若干事件:
 *   - wait_matched:    等待扫码命中,data.stdout 内含 ASCII QR 码 + fallback URL
 *   - step_completed:  单步完成
 *   - heartbeat:       心跳
 *   - session_completed: 整个会话结束
 *
 * 该函数会消费整条流,聚合成最终结果返回;同时通过 options.onEvent
 * 实时把每个事件吐给调用方,用于前端展示中间状态。
 */
export type WechatLoginStatus = "pending" | "connected" | "expired" | "error";

export interface WechatLoginResponse {
  status: WechatLoginStatus;
  qrcodeUrl: string | null;
  qrcodeImage: string | null;
  expiresIn: number;
  message: string;
  rawOutput: string | null;
  sessionId: string | null;
  finalStdout: string | null;
  connected: boolean;
  exitCode: number | null;
  events: WechatLoginEvent[];
}

/** SSE 事件载荷 (与上游保持一致). */
export interface WechatLoginEvent {
  event: string;
  sessionId: string | null;
  ts: number | null;
  data: Record<string, unknown> | null;
  raw: string;
}

export interface WechatLoginOptions {
  signal?: AbortSignal;
  onEvent?: (e: WechatLoginEvent) => void;
}

/**
 * 从 wait_matched.data.stdout 里尝试抽取 fallback URL (二维码加载失败时使用).
 */
function extractFallbackUrl(stdout: string | null | undefined): string | null {
  if (!stdout) return null;
  const m = stdout.match(/https?:\/\/\S+/);
  return m ? m[0].replace(/[)\]】。.,;]+$/, "") : null;
}

/**
 * 发起微信扫码登录,并以 SSE 流的方式返回过程事件.
 * POST /api/channels/:uuid/flows
 */
export async function wechatLogin(
  instanceUuid: string,
  options?: WechatLoginOptions
): Promise<WechatLoginResponse> {
  const url = `${BASE_URL}/api/channels/${encodeURIComponent(instanceUuid)}/flows`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...getHeaders(),
      Accept: "text/event-stream, */*",
      "Content-Length": "0",
    },
    body: "",
    signal: options?.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`OpenClaw API error ${res.status}: ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  // 聚合结果
  let status: WechatLoginResponse["status"] = "pending";
  let qrcodeUrl: string | null = null;
  let qrcodeImage: string | null = null;
  let expiresIn = 120;
  let message = "";
  let rawOutput: string | null = null;
  let sessionId: string | null = null;
  let finalStdout: string | null = null;
  let exitCode: number | null = null;
  const events: WechatLoginEvent[] = [];

  const pushEvent = (ev: WechatLoginEvent) => {
    events.push(ev);
    if (ev.sessionId) sessionId = ev.sessionId;
    const payload = ev.data;
    if (!payload) {
      options?.onEvent?.(ev);
      return;
    }
    if (ev.event === "wait_matched") {
      const inner = (payload.data as Record<string, unknown> | undefined) ?? {};
      const stdout = typeof inner.stdout === "string" ? inner.stdout : null;
      const matchedText = typeof inner.matched_text === "string" ? inner.matched_text : null;
      if (stdout) {
        rawOutput = stdout;
        finalStdout = stdout;
        // 上游没有直接给图;优先尝试 stdout 里的 fallback URL,否则就地用 stdout 渲染.
        qrcodeUrl = extractFallbackUrl(stdout);
        qrcodeImage = stdout; // 浏览器用 <pre> 渲染 ASCII QR,见 ChannelModal
      }
      if (matchedText) message = matchedText;
    } else if (ev.event === "session_completed") {
      const inner = (payload.data as Record<string, unknown> | undefined) ?? {};
      exitCode = (inner.exit_code as number | null | undefined) ?? null;
      const fs = typeof inner.final_stdout === "string" ? inner.final_stdout : null;
      if (fs) {
        finalStdout = fs;
        if (!rawOutput) rawOutput = fs;
      }
      // exit_code 为 null 通常是超时;非 0 也视作异常.
      if (exitCode === 0) {
        status = "connected";
        message = "WeChat login successful";
      } else if (exitCode === null) {
        status = "expired";
        message = "WeChat login session expired";
      } else {
        status = "error";
        message = `WeChat login failed (exit ${exitCode})`;
      }
    } else if (ev.event === "step_completed") {
      // 单步完成;继续等扫码命中.
    } else if (ev.event === "heartbeat") {
      // 心跳 — 不改变 UI 状态.
    }
    options?.onEvent?.(ev);
  };

  // SSE 协议: 事件之间用 \n\n 分隔, 单个事件由 event: / data: 等行组成.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      parseSseEventBlock(rawEvent, pushEvent);
    }
  }
  if (buffer.trim()) parseSseEventBlock(buffer, pushEvent);

  // 流结束但从未收到 session_completed 时, 标记为 expired.
  if (status === "pending") status = "expired";

  return {
    status,
    qrcodeUrl,
    qrcodeImage,
    expiresIn,
    message,
    rawOutput,
    sessionId,
    finalStdout,
    connected: (status as WechatLoginStatus) === "connected",
    exitCode,
    events,
  };
}

function parseSseEventBlock(
  block: string,
  emit: (e: WechatLoginEvent) => void
) {
  if (!block.trim()) return;
  let eventName = "message";
  let dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim() || "message";
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (dataLines.length === 0) return;
  const dataStr = dataLines.join("\n");
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(dataStr) as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  if (!parsed) return;
  emit({
    event: eventName,
    sessionId: (parsed.session_id as string | undefined) ?? null,
    ts: typeof parsed.ts === "number" ? parsed.ts : null,
    data: parsed,
    raw: dataStr,
  });
}
