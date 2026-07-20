/**
 * Live Agent Manager client — delegates to the OpenClaw Manager API.
 * Enabled when AGENT_MANAGER_MODE === "live".
 * Channel operations (upsertChannel, wechatLogin) are handled via openclaw_manager_api.ts.
 */
import type {
  AgentManagerClient,
  LifecycleAction,
  LifecycleResult,
  ProvisionInput,
  ProvisionResult,
  SendMessageInput,
  SendMessageResult,
  UpdateInput,
} from "./types";

function baseUrl(): string {
  const u = process.env.AGENT_MANAGER_BASE_URL;
  if (!u) throw new Error("AGENT_MANAGER_BASE_URL is not set");
  return u.replace(/\/$/, "");
}

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.AGENT_MANAGER_API_KEY ?? ""}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Agent Manager ${method} ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export const liveClient: AgentManagerClient = {
  provisionAgent: (input: ProvisionInput) =>
    call<ProvisionResult>("/v1/agents", "POST", input),
  updateAgent: (id: string, input: UpdateInput) =>
    call<LifecycleResult>(`/v1/agents/${id}`, "PATCH", input),
  sendMessage: (id: string, input: SendMessageInput) =>
    call<SendMessageResult>(`/v1/agents/${id}/messages`, "POST", input),
  setLifecycle: (id: string, action: LifecycleAction) =>
    call<LifecycleResult>(`/v1/agents/${id}/lifecycle`, "POST", { action }),
  // Channel operations are handled by openclaw_manager_api.ts directly
  upsertChannel: async (_id: string, _channelType: string, _enabled: boolean, _config: Record<string, unknown>) => {
    // No-op for the generic Agent Manager interface;
    // the channel API routes call openclaw_manager_api directly.
  },
};
