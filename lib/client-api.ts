/**
 * Browser-side API client. Thin typed wrappers over the /api/** route handlers.
 * Every call sends the session cookie (same-origin) and throws ApiError on 4xx/5xx.
 */
import type { AgentDTO, PublicUser } from "@/lib/serializers";
import type { Harness } from "@/lib/harness";
import type { AgentSettings } from "@/lib/agent-settings";
import type { Currency } from "@/lib/pricing";
// Type-only, so the schema module (and Drizzle with it) never reaches the
// browser bundle — but the admin enums stay pinned to the database definition.
import type { PlatformRole, UserStatus } from "@/lib/db/schema";

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

/**
 * Aliased to the server serializer rather than hand-mirrored: a hand-written
 * twin lets a new field on publicUser() compile clean while being silently
 * invisible to the client, which is exactly how `platformRole` would have been
 * lost here.
 */
export type SessionUser = PublicUser;
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
  changePassword: (body: { currentPassword?: string; newPassword: string }) =>
    req<{ ok: true }>("PATCH", "/api/me/password", body),

  // ---- reference ----
  roles: () => req<{ roles: RoleDTO[] }>("GET", "/api/roles"),
  plans: () => req<{ plans: PlanDTO[] }>("GET", "/api/plans"),

  // ---- agents ----
  listAgents: () => req<{ agents: AgentDTO[] }>("GET", "/api/agents"),
  getAgent: (id: string) => req<{ agent: AgentDetailDTO }>("GET", `/api/agents/${id}`),
  createAgent: (body: CreateAgentBody) => req<{ agent: AgentDetailDTO }>("POST", "/api/agents", body),
  generateBrief: (body: {
    roleId: string;
    field: "instructions" | "rules";
    agentName?: string;
    tasks?: string[];
    locale?: "en" | "zh" | "zht" | "ja";
  }) => req<{ text: string; source: "llm" | "default" }>("POST", "/api/agents/generate-brief", body),
  updateAgent: (id: string, body: UpdateAgentBody) =>
    req<{ agent: AgentDetailDTO }>("PATCH", `/api/agents/${id}`, body),
  lifecycle: (id: string, action: "pause" | "resume" | "terminate") =>
    req<{ agent: AgentDetailDTO }>("POST", `/api/agents/${id}/lifecycle`, { action }),
  deleteAgent: (id: string) => req<{ ok: true }>("DELETE", `/api/agents/${id}`),
  resolveImprovement: (agentId: string, improvementId: string, action: "approve" | "dismiss") =>
    req<{ agent: AgentDetailDTO }>("POST", `/api/agents/${agentId}/improvements/${improvementId}`, { action }),
  runSelfReview: (agentId: string, body: { locale?: "en" | "zh" | "zht" | "ja"; count?: number } = {}) =>
    req<{ created: number; agent: AgentDetailDTO }>("POST", `/api/agents/${agentId}/self-review`, body),

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
      sessionKey?: string;
    },
  ) => streamMessage(agentId, body, options),
  sessions: (agentId: string) =>
    req<{ sessions: SessionDTO[] }>("GET", `/api/agents/${agentId}/sessions`),
  sessionHistory: (agentId: string, sessionId: string) =>
    req<{ sessionId: string; sessionKey: string; status: string | null; messages: MessageDTO[] }>(
      "GET",
      `/api/agents/${agentId}/sessions/${encodeURIComponent(sessionId)}/history`,
    ),

  // ---- channel management (per-agent, instance-uuid scoped) ----
  upsertChannel: (body: {
    instanceUuid: string;
    channelType: string;
    enabled: boolean;
    config: Record<string, unknown>;
  }) => req<void>("POST", "/api/channels/upsert", body),
  getChannels: (instanceUuid: string) =>
    req<{ channels: AgentChannelDTO[] }>("GET", `/api/channels?instance_uuid=${instanceUuid}`),
  getWechatLoginQrcode: (
    instanceUuid: string,
    options: { onEvent?: (e: WechatLoginEvent) => void; signal?: AbortSignal } = {}
  ) =>
    streamWechatLogin(
      `/api/channels/wechat/login?instance_uuid=${encodeURIComponent(instanceUuid)}`,
      options
    ),

  // ---- dashboard / channels / billing ----
  dashboard: () => req<DashboardDTO>("GET", "/api/dashboard"),
  channels: () => req<{ channels: ChannelDTO[] }>("GET", "/api/channels"),
  connectChannel: (body: { type: string; config: Record<string, string>; label?: string }) =>
    req<{ channel: ChannelDTO }>("POST", "/api/channels", body),
  disconnectChannel: (id: string) => req<{ channel: ChannelDTO }>("DELETE", `/api/channels/${id}`),
  billing: () => req<BillingDTO>("GET", "/api/billing"),
  billingUsage: (range: BillingUsageDTO["range"], from?: string, to?: string) => {
    const q = new URLSearchParams({ range });
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return req<BillingUsageDTO>("GET", `/api/billing/usage?${q}`);
  },
  /**
   * Start a checkout. In `live` mode the response carries a provider-hosted
   * `redirectUrl` to send the browser to — the seat is granted later, by the
   * Stripe webhook or the Alipay notify. In `mock` mode (no provider keys
   * configured) the order is fulfilled inline and `invoice` comes back at once.
   */
  checkout: (body: {
    planId: string;
    cycle: "monthly" | "annual";
    provider: "stripe" | "alipay";
    agentId?: string;
    locale?: "en" | "zh" | "zht" | "ja";
  }) => req<CheckoutResponse>("POST", "/api/billing/checkout", body),
  /** Poll one order after returning from the provider. */
  paymentOrder: (outTradeNo: string) =>
    req<{ order: PaymentOrderDTO; invoice: InvoiceDTO | null }>(
      "GET",
      `/api/payments/orders/${encodeURIComponent(outTradeNo)}`,
    ),

  // ---- agent runtime / instance info ----
  getAgentInstanceInfo: (agentId: string) =>
    req<{ providers: AgentManagerProviderInfo[]; autoStopped: boolean }>(
      "GET",
      `/api/agents/${agentId}/instance-info`
    ),

  // ---- agent usage / token report ----
  getAgentTokenReport: (agentId: string, days: 1 | 3 | 7 | 30) =>
    req<TokenReportDTO>("GET", `/api/agents/${agentId}/token-report?days=${days}`),

  // ---- platform admin ----
  // Every one of these 403s for a non-staff caller; the console renders that as
  // a "not authorized" panel rather than an error toast.
  adminOverview: () => req<AdminOverviewDTO>("GET", "/api/admin/overview"),
  adminUsers: (query: AdminUserQuery = {}) =>
    req<AdminUsersDTO>("GET", `/api/admin/users${adminUserQueryString(query)}`),
  adminUser: (id: string) =>
    req<AdminUserDetailDTO>("GET", `/api/admin/users/${encodeURIComponent(id)}`),
  adminSetUserRole: (id: string, platformRole: PlatformRole) =>
    req<AdminMutationResult>("PATCH", `/api/admin/users/${encodeURIComponent(id)}/role`, {
      platformRole,
    }),
  adminSetUserStatus: (id: string, status: UserStatus) =>
    req<AdminMutationResult>("PATCH", `/api/admin/users/${encodeURIComponent(id)}/status`, {
      status,
    }),
  adminDeleteUser: (id: string) =>
    req<AdminMutationResult>("DELETE", `/api/admin/users/${encodeURIComponent(id)}`),
  adminRevokeSessions: (id: string) =>
    req<AdminMutationResult>("POST", `/api/admin/users/${encodeURIComponent(id)}/sessions`, {
      action: "revoke",
    }),
  adminLlmUsage: (days = 30) => req<AdminLlmUsageDTO>("GET", `/api/admin/llm-usage?days=${days}`),
};

// ---- admin console shapes ----
// The console renders a live database, so a field the route stops sending must
// blank one cell rather than white-screen the page: everything below the
// envelope itself is optional and every read site falls back.

export interface AdminUserQuery {
  q?: string;
  role?: PlatformRole;
  status?: UserStatus;
  page?: number;
  perPage?: number;
}

function adminUserQueryString(query: AdminUserQuery): string {
  const params = new URLSearchParams();
  // Empty strings would narrow the search to nothing rather than widen it, so
  // only truthy filters are sent.
  if (query.q) params.set("q", query.q);
  if (query.role) params.set("role", query.role);
  if (query.status) params.set("status", query.status);
  if (query.page) params.set("page", String(query.page));
  if (query.perPage) params.set("perPage", String(query.perPage));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Rollup of one slice of llm_usage — a user, a model, a day, a workspace. */
export interface AdminUsageTotals {
  calls?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costMicroUsd?: number;
  errors?: number;
  /** Fraction (0–1) or percent; the console normalizes whichever arrives. */
  errorRate?: number;
}
export interface AdminUsageByModel extends AdminUsageTotals {
  model?: string;
  provider?: string;
}
export interface AdminUsageByDay extends AdminUsageTotals {
  day?: string;
  date?: string;
}
export interface AdminUsageByWorkspace extends AdminUsageTotals {
  workspaceId?: string;
  name?: string;
}
export interface AdminUsageDTO {
  days?: number;
  totals?: AdminUsageTotals;
  byModel?: AdminUsageByModel[];
  byDay?: AdminUsageByDay[];
}

/** Null once the referenced account is deleted — the FK is ON DELETE SET NULL. */
export interface AdminUserRefDTO {
  id: string;
  email: string;
  name: string;
}

export interface AdminAuditEntryDTO {
  /** `admin_audit_log.id` is a bigint read in number mode. */
  id: number;
  action?: string;
  summary?: string;
  actor?: AdminUserRefDTO | null;
  target?: AdminUserRefDTO | null;
  ip?: string | null;
  createdAt?: string;
}

export interface AdminOverviewDTO {
  users?: {
    total?: number;
    byStatus?: Partial<Record<UserStatus, number>>;
    byRole?: Partial<Record<PlatformRole, number>>;
  };
  agents?: {
    total?: number;
    byStatus?: Record<string, number | undefined>;
  };
  /** A bare count or a `{ total }` envelope — both spellings are tolerated. */
  workspaces?: number | { total?: number };
  llm?: AdminUsageTotals & { days?: number };
  audit?: AdminAuditEntryDTO[];
}

export interface AdminUserRowDTO {
  id: string;
  email?: string;
  name?: string;
  platformRole?: PlatformRole;
  status?: UserStatus;
  locale?: string;
  hasPassword?: boolean;
  createdAt?: string;
  agentCount?: number;
  identityCount?: number;
  counts?: { agents?: number; identities?: number };
  usage?: AdminUsageTotals;
}

export interface AdminUsersDTO {
  users?: AdminUserRowDTO[];
  page?: number;
  perPage?: number;
  total?: number;
}

export interface AdminWorkspaceRefDTO {
  id: string;
  name?: string;
  /** The user's role in this workspace, as returned by the detail route. */
  memberRole?: string;
  creditsUsed?: number;
  creditsIncluded?: number;
  createdAt?: string;
}

export interface AdminAgentRefDTO {
  id: string;
  name?: string;
  role?: string;
  roleId?: string;
  status?: string;
  engine?: string;
  creditsUsed?: number;
  workspaceId?: string;
  workspaceName?: string;
  createdAt?: string;
}

export interface AdminIdentityDTO {
  id: string;
  provider?: string;
  email?: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface AdminSessionDTO {
  id: string;
  ip?: string | null;
  userAgent?: string | null;
  createdAt?: string;
  expiresAt?: string | null;
  lastSeenAt?: string | null;
  current?: boolean;
}

export interface AdminUserDetailDTO {
  user?: AdminUserRowDTO;
  workspaces?: AdminWorkspaceRefDTO[];
  agents?: AdminAgentRefDTO[];
  identities?: AdminIdentityDTO[];
  sessions?: AdminSessionDTO[];
  usage?: AdminUsageDTO;
}

export interface AdminLlmUsageDTO extends AdminUsageDTO {
  byWorkspace?: AdminUsageByWorkspace[];
}

/**
 * Admin mutations answer with either the fresh row or a bare ack depending on
 * the verb; the console re-reads the user afterwards instead of trusting either.
 */
export interface AdminMutationResult {
  ok?: true;
  user?: AdminUserRowDTO;
  revoked?: number;
}

// ---- response shapes ----
export interface RoleDTO {
  id: string; name: string; blurb: string; longBlurb: string | null; hue: string; mono: string;
  defaultEngine: Harness; defaultInstructions: string | null; defaultRules: string | null;
  minPlan: "associate" | "professional" | "director";
  managerAgentId?: number; categoryId?: number; categoryName?: string; uploadFilename?: string;
}
export interface PlanDTO {
  id: "associate" | "professional" | "director";
  name: string;
  /** USD list price in cents (international market). */
  monthlyPriceCents: number;
  /** CNY list price in 分 (China market) — a local ladder, not an FX conversion. */
  monthlyPriceFen: number;
  includedCredits: number;
  overageCentsPer1k: number;
  overageFenPer1k: number;
  features: string[];
}

export interface PaymentOrderDTO {
  outTradeNo: string;
  provider: "stripe" | "alipay";
  status: "pending" | "paid" | "failed" | "closed" | "refunded";
  planId: "associate" | "professional" | "director";
  cycle: "monthly" | "annual";
  amountMinor: number;
  currency: Currency;
  payUrl: string | null;
  returnUrl: string | null;
  failureReason: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface CheckoutResponse {
  /** `live` = redirect to `redirectUrl`; `mock` = already fulfilled. */
  mode: "live" | "mock";
  order: PaymentOrderDTO;
  redirectUrl: string | null;
  subscriptionId: string | null;
  invoice: InvoiceDTO | null;
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
  tasks?: InstanceTaskDTO[];
}

export interface InstanceTaskDTO {
  id: number;
  content: string;
  sortOrder: number;
  sessionKey: string | null;
  result: string | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Token consumption report (per-day) for an agent's OpenClaw instance. */
export interface TokenReportDTO {
  instances: { id: number; name: string }[];
  report: {
    date: string;
    instanceId: number;
    instanceName: string;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
    totalTokens: number;
    calls: number;
  }[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
    totalTokens: number;
    calls: number;
  };
}
export interface TaskDTO { id: string; text: string; status: string; meta: string | null; sortOrder: number; result: string | null; }
export interface ActivityDTO { id: string; text: string; tag: string; occurredAt: string; }
export interface MetricDTO { id: string; label: string; value: string; delta: string | null; weight: number; }
export interface ImprovementDTO { id: string; text: string; impact: string | null; status: string; createdAt: string; }
export interface AgentDetailDTO extends AgentDTO {
  tasks: TaskDTO[]; activities: ActivityDTO[]; metrics: MetricDTO[]; improvements: ImprovementDTO[];
}
export interface CreateAgentBody {
  name: string; roleId: string; engine: Harness;
  managerAgentId?: number;
  planTier: "associate" | "professional" | "director"; instructions: string; rules: string;
  channels: string[]; tasks: string[];
}
export interface UpdateAgentBody {
  name?: string; instructions?: string; rules?: string;
  planTier?: "associate" | "professional" | "director"; engine?: Harness;
  channels?: string[]; settings?: Partial<AgentSettings>;
}
export interface ChannelDTO {
  id: string; type: string; status: string; label: string | null; config: Record<string, string>;
  /** Names of THIS workspace's live agents attached to the channel. */
  usedBy?: string[];
}

/** OpenClaw channel status returned by /api/channels?instance_uuid= */
export interface AgentChannelDTO {
  type: string;
  label: string;
  enabled: boolean;
  configured: boolean;
  config: Record<string, unknown>;
}
export interface SessionDTO {
  id: string;
  key: string;
  historyId: string;
  label: string;
  status: string | null;
  createdAt: string | null;
  updatedAt: number | null;
  preview: string | null;
  archived: boolean;
  pinned: boolean;
}
export interface InvoiceDTO {
  id: string;
  number: string;
  /** Amount in the invoice currency's MINOR units (US cents / 人民币分). */
  amountCents: number;
  currency: string;
  status: string;
  /** Which provider settled it — drives the badge on the billing table. */
  provider: "stripe" | "alipay" | null;
  issuedAt: string;
  paidAt: string | null;
  pdfUrl: string | null;
  hostedUrl: string | null;
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

/**
 * Real credit usage for the billing chart, from `usage_records`. Replaces the
 * invented `BillDataset` that lib/data.ts used to hand every workspace.
 */
export interface BillingUsageDTO {
  range: "cycle" | "last" | "d90" | "custom";
  from: string;
  to: string;
  credits: number;
  included: number;
  buckets: { date: string; credits: number }[];
  perAgent: { id: string; name: string; hue: string | null; credits: number }[];
  cycles: number;
  annualSeats: number;
  monthlySeats: number;
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

// ---- WeChat login streaming ----
export interface WechatLoginEvent {
  event: string;
  sessionId: string | null;
  ts: number | null;
  data: Record<string, unknown> | null;
}
export interface WechatLoginResponse {
  status: "pending" | "connected" | "expired" | "error";
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

async function streamWechatLogin(
  path: string,
  options: { onEvent?: (e: WechatLoginEvent) => void; signal?: AbortSignal }
): Promise<WechatLoginResponse> {
  const res = await fetch(path, {
    method: "POST",
    headers: { accept: "text/event-stream" },
    credentials: "same-origin",
    signal: options.signal,
  });
  if (!res.ok || !res.body) {
    let payload: { error?: string } | null = null;
    try { payload = (await res.json()) as { error?: string }; } catch {}
    throw new ApiError(payload?.error || `Request failed (${res.status})`, res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: WechatLoginResponse | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const parsed = parseWechatSseEvent(rawEvent);
      if (!parsed) continue;
      if (parsed.event === "done") {
        final = parsed.data as unknown as WechatLoginResponse;
      } else if (parsed.event === "error") {
        const msg = (parsed.data as { message?: string } | null)?.message || "WeChat login failed";
        throw new ApiError(msg, 500);
      } else {
        options.onEvent?.(parsed);
      }
    }
  }
  if (!final) throw new ApiError("Stream ended without a final response", 500);
  return final;
}

function parseWechatSseEvent(raw: string): WechatLoginEvent | null {
  let eventName = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed || trimmed.startsWith(":")) continue;
    if (trimmed.startsWith("event:")) eventName = trimmed.slice(6).trim() || "message";
    else if (trimmed.startsWith("data:")) dataLines.push(trimmed.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(dataLines.join("\n")) as Record<string, unknown>; } catch { return null; }
  return {
    event: eventName,
    sessionId: (parsed.session_id as string | undefined) ?? null,
    ts: typeof parsed.ts === "number" ? parsed.ts : null,
    data: parsed,
  };
}

async function streamMessage(
  agentId: string,
  body: string,
  options: { onDelta: (delta: string) => void; signal?: AbortSignal; sessionKey?: string }
): Promise<{ conversationId: string; replyMessage: MessageDTO; userMessage?: MessageDTO }> {
  const res = await fetch(`/api/agents/${agentId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({
      body,
      ...(options.sessionKey ? { sessionKey: options.sessionKey } : {}),
    }),
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
