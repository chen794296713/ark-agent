/**
 * Browser-side API client. Thin typed wrappers over the /api/** route handlers.
 * Every call sends the session cookie (same-origin) and throws ApiError on 4xx/5xx.
 */
import type { AgentDTO } from "@/lib/serializers";
import type { AgentSettings } from "@/lib/agent-settings";

export class ApiError extends Error {
  status: number;
  issues?: unknown;
  constructor(message: string, status: number, issues?: unknown) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const d = data as { error?: string; issues?: unknown } | null;
    throw new ApiError(d?.error || `Request failed (${res.status})`, res.status, d?.issues);
  }
  return data as T;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  locale: "en" | "zh" | "zht" | "ja";
}
export interface WorkspaceDTO {
  id: string;
  name: string;
  creditsIncluded: number;
  creditsUsed: number;
  cycleResetsAt: string | null;
}

export const api = {
  // ---- auth ----
  register: (body: { email: string; password: string; name: string }) =>
    req<{ user: SessionUser; workspace: WorkspaceDTO }>("POST", "/api/auth/register", body),
  login: (body: { email: string; password: string }) =>
    req<{ user: SessionUser; workspace: WorkspaceDTO | null }>("POST", "/api/auth/login", body),
  logout: () => req<{ ok: true }>("POST", "/api/auth/logout"),
  me: () => req<{ user: SessionUser; workspace: WorkspaceDTO }>("GET", "/api/auth/me"),
  setPrefs: (body: { locale?: "en" | "zh" | "zht" | "ja"; name?: string }) =>
    req<{ user: SessionUser }>("PATCH", "/api/me/preferences", body),

  // ---- reference ----
  roles: () => req<{ roles: RoleDTO[] }>("GET", "/api/roles"),
  plans: () => req<{ plans: PlanDTO[] }>("GET", "/api/plans"),

  // ---- agents ----
  listAgents: () => req<{ agents: AgentDTO[] }>("GET", "/api/agents"),
  getAgent: (id: string) => req<{ agent: AgentDetailDTO }>("GET", `/api/agents/${id}`),
  createAgent: (body: CreateAgentBody) => req<{ agent: AgentDetailDTO }>("POST", "/api/agents", body),
  updateAgent: (id: string, body: UpdateAgentBody) =>
    req<{ agent: AgentDetailDTO }>("PATCH", `/api/agents/${id}`, body),
  lifecycle: (id: string, action: "pause" | "resume" | "terminate") =>
    req<{ agent: AgentDetailDTO }>("POST", `/api/agents/${id}/lifecycle`, { action }),
  resolveImprovement: (agentId: string, improvementId: string, action: "approve" | "dismiss") =>
    req<{ agent: AgentDetailDTO }>("POST", `/api/agents/${agentId}/improvements/${improvementId}`, { action }),

  // ---- messages ----
  messages: (agentId: string) =>
    req<{ conversationId: string | null; messages: MessageDTO[] }>("GET", `/api/agents/${agentId}/messages`),
  sendMessage: (agentId: string, body: string) =>
    req<{ conversationId: string; userMessage: MessageDTO; replyMessage: MessageDTO | null }>(
      "POST",
      `/api/agents/${agentId}/messages`,
      { body },
    ),
  streamMessage: (
    agentId: string,
    body: string,
    options: {
      onDelta: (delta: string) => void;
      signal?: AbortSignal;
    },
  ) => streamMessage(agentId, body, options),

  // ---- dashboard / channels / billing ----
  dashboard: () => req<DashboardDTO>("GET", "/api/dashboard"),
  channels: () => req<{ channels: ChannelDTO[] }>("GET", "/api/channels"),
  connectChannel: (body: { type: string; config: Record<string, string>; label?: string }) =>
    req<{ channel: ChannelDTO }>("POST", "/api/channels", body),
  disconnectChannel: (id: string) => req<{ channel: ChannelDTO }>("DELETE", `/api/channels/${id}`),
  billing: () => req<BillingDTO>("GET", "/api/billing"),
  checkout: (body: { planId: string; cycle: "monthly" | "annual"; provider: "stripe" | "alipay"; agentId?: string }) =>
    req<{ subscriptionId: string; invoice: InvoiceDTO }>("POST", "/api/billing/checkout", body),

  // ---- agent runtime / instance info ----
  getAgentInstanceInfo: (agentId: string) =>
    req<{ providers: AgentManagerProviderInfo[] }>(
      "GET",
      `/api/agents/${agentId}/instance-info`
    ),
};

// ---- response shapes ----
export interface RoleDTO {
  id: string; name: string; blurb: string; longBlurb: string | null; hue: string; mono: string;
  defaultEngine: "openclaw" | "hermes"; defaultInstructions: string | null; defaultRules: string | null;
  minPlan: "associate" | "professional" | "director";
}
export interface PlanDTO {
  id: "associate" | "professional" | "director"; name: string; monthlyPriceCents: number;
  includedCredits: number; overageCentsPer1k: number; features: string[];
}
export interface MessageDTO {
  id: string; sender: "user" | "agent" | "system"; body: string; channelType: string;
  status: string; meta: string | null; createdAt: string;
}

/** Cached Agent Manager config blob (one per provider per agent). */
export interface AgentManagerProviderInfo {
  provider: string;
  externalId: string;
  status: string;
  lastError: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export interface TaskDTO { id: string; text: string; status: string; meta: string | null; sortOrder: number; }
export interface ActivityDTO { id: string; text: string; tag: string; occurredAt: string; }
export interface MetricDTO { id: string; label: string; value: string; delta: string | null; weight: number; }
export interface ImprovementDTO { id: string; text: string; impact: string | null; status: string; createdAt: string; }
export interface AgentDetailDTO extends AgentDTO {
  tasks: TaskDTO[]; activities: ActivityDTO[]; metrics: MetricDTO[]; improvements: ImprovementDTO[];
}
export interface CreateAgentBody {
  name: string; roleId: string; engine: "openclaw" | "hermes";
  planTier: "associate" | "professional" | "director"; instructions: string; rules: string;
  channels: string[]; tasks: string[];
}
export interface UpdateAgentBody {
  name?: string; instructions?: string; rules?: string;
  planTier?: "associate" | "professional" | "director"; engine?: "openclaw" | "hermes";
  channels?: string[]; settings?: Partial<AgentSettings>;
}
export interface ChannelDTO {
  id: string; type: string; status: string; label: string | null; config: Record<string, string>;
}
export interface InvoiceDTO {
  id: string; number: string; amountCents: number; currency: string; status: string;
  issuedAt: string; paidAt: string | null; pdfUrl: string | null;
}
export interface DashboardDTO {
  workspace: WorkspaceDTO;
  stats: { activeAgents: number; tasksThisWeek: number; creditsUsed: number; needsReview: number };
  agents: AgentDTO[];
  activity: { id: string; text: string; tag: string; occurredAt: string; agentId: string; who: string; hue: string | null }[];
}
export interface BillingDTO {
  credits: { included: number; used: number; resetsAt: string | null };
  seats: { id: string; name: string; mono: string; hue: string | null; planTier: string; planName: string; creditsUsed: number; priceCents: number }[];
  seatCount: number;
  invoices: InvoiceDTO[];
  subscriptions: number;
  plans: PlanDTO[];
}

// ---- SSE streaming ----
export interface StreamChunkUser {
  type: "user_message";
  conversationId: string;
  message: MessageDTO;
}
export interface StreamChunkDelta {
  type: "delta";
  delta: string;
}
export interface StreamChunkDone {
  type: "done";
  conversationId: string;
  replyMessage: MessageDTO;
}
export interface StreamChunkError {
  type: "error";
  message: string;
}
export type StreamChunk = StreamChunkUser | StreamChunkDelta | StreamChunkDone | StreamChunkError;

async function streamMessage(
  agentId: string,
  body: string,
  options: { onDelta: (delta: string) => void; signal?: AbortSignal }
): Promise<{ conversationId: string; replyMessage: MessageDTO; userMessage?: MessageDTO }> {
  const res = await fetch(`/api/agents/${agentId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({ body }),
    credentials: "same-origin",
    signal: options.signal,
  });
  return consumeSse(res, options.onDelta);
}

async function consumeSse(
  res: Response,
  onDelta: (delta: string) => void
): Promise<{ conversationId: string; replyMessage: MessageDTO; userMessage?: MessageDTO }> {
  if (!res.ok || !res.body) {
    let payload: { error?: string } | null = null;
    try { payload = (await res.json()) as { error?: string }; } catch {}
    throw new ApiError(payload?.error || `Request failed (${res.status})`, res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let conversationId = "";
  let replyMessage: MessageDTO | null = null;
  let userMessage: MessageDTO | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const result = parseSseEvent(event, onDelta);
      if (result.kind === "done") {
        conversationId = result.conversationId;
        replyMessage = result.replyMessage;
      } else if (result.kind === "error") {
        throw new ApiError(result.message, 500);
      } else if (result.kind === "user" && result.userMessage) {
        userMessage = result.userMessage;
      }
    }
  }
  if (!replyMessage) throw new ApiError("Stream ended without a final reply", 500);
  return { conversationId, replyMessage, userMessage };
}

function parseSseEvent(
  raw: string,
  onDelta: (delta: string) => void
):
  | { kind: "user"; userMessage?: MessageDTO }
  | { kind: "delta" }
  | { kind: "done"; conversationId: string; replyMessage: MessageDTO }
  | { kind: "error"; message: string }
  | { kind: "ignore" } {
  let data = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return { kind: "ignore" };
  let parsed: StreamChunk;
  try {
    parsed = JSON.parse(data) as StreamChunk;
  } catch {
    return { kind: "ignore" };
  }
  if (parsed.type === "user_message") return { kind: "user", userMessage: parsed.message };
  if (parsed.type === "delta") {
    onDelta(parsed.delta);
    return { kind: "delta" };
  }
  if (parsed.type === "done") {
    return { kind: "done", conversationId: parsed.conversationId, replyMessage: parsed.replyMessage };
  }
  if (parsed.type === "error") return { kind: "error", message: parsed.message };
  return { kind: "ignore" };
}
