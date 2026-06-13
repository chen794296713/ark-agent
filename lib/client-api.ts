/**
 * Browser-side API client. Thin typed wrappers over the /api/** route handlers.
 * Every call sends the session cookie (same-origin) and throws ApiError on 4xx/5xx.
 */
import type { AgentDTO } from "@/lib/serializers";

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
  locale: "en" | "zh" | "zht";
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
  setPrefs: (body: { locale?: "en" | "zh" | "zht"; name?: string }) =>
    req<{ user: SessionUser }>("PATCH", "/api/me/preferences", body),

  // ---- reference ----
  roles: () => req<{ roles: RoleDTO[] }>("GET", "/api/roles"),
  plans: () => req<{ plans: PlanDTO[] }>("GET", "/api/plans"),

  // ---- agents ----
  listAgents: () => req<{ agents: AgentDTO[] }>("GET", "/api/agents"),
  getAgent: (id: string) => req<{ agent: AgentDetailDTO }>("GET", `/api/agents/${id}`),
  createAgent: (body: CreateAgentBody) => req<{ agent: AgentDetailDTO }>("POST", "/api/agents", body),
  updateAgent: (id: string, body: Partial<CreateAgentBody>) =>
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

  // ---- dashboard / channels / billing ----
  dashboard: () => req<DashboardDTO>("GET", "/api/dashboard"),
  channels: () => req<{ channels: ChannelDTO[] }>("GET", "/api/channels"),
  connectChannel: (body: { type: string; config: Record<string, string>; label?: string }) =>
    req<{ channel: ChannelDTO }>("POST", "/api/channels", body),
  disconnectChannel: (id: string) => req<{ channel: ChannelDTO }>("DELETE", `/api/channels/${id}`),
  billing: () => req<BillingDTO>("GET", "/api/billing"),
  checkout: (body: { planId: string; cycle: "monthly" | "annual"; provider: "stripe" | "alipay"; agentId?: string }) =>
    req<{ subscriptionId: string; invoice: InvoiceDTO }>("POST", "/api/billing/checkout", body),
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
