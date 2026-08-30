/**
 * Browser fetch helpers for the per-agent skills and context routes.
 *
 * Plain async functions that call `fetch` and throw on `!ok`; the integrator
 * re-exports them from `lib/client-api.ts`. Nothing here imports a server module.
 *
 * Nothing here VALIDATES, either, and that is deliberate — the same rule
 * `lib/skills/client.ts` states. The server is the authority on every cap, every
 * allowlist and the SSRF guard, and a second copy of those rules in the browser
 * is a second place for them to drift out of step with the ones that actually
 * hold. The caps in `./validation.ts` are exported for the UI's character
 * counters and disabled-button states, which is a rendering concern; the refusal
 * still comes from the server.
 *
 * `AgentConfigApiError` carries `code` as well as `status`, because the error
 * copy for this surface is the manage screen's, in the operator's language.
 * `code` is the machine key it renders from — `risk_ack_required`,
 * `context_url_unsafe`, `skill_limit_reached` — and `message` is the server's
 * English fallback for a code the UI does not know yet.
 */
import type { AgentSkillDTO, AgentSkillListResponse, AttachSkillResponse } from "@/lib/skills/types";
import type { ContextItemDTO, ContextItemDetailDTO, ContextListResponse } from "./serialize";
import type { CreateContextItemInput, UpdateContextItemInput } from "./validation";

export class AgentConfigApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AgentConfigApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) },
    ...init,
  });
  // A 204 or an HTML error page must not become "Unexpected token <" thrown from
  // somewhere with no status in it.
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const b = (body ?? {}) as Record<string, unknown>;
    throw new AgentConfigApiError(
      res.status,
      typeof b.error === "string" ? b.error : `Request failed (${res.status})`,
      typeof b.code === "string" ? b.code : undefined,
      b,
    );
  }
  return body as T;
}

const agentPath = (agentId: string) => `/api/agents/${encodeURIComponent(agentId)}`;

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export function fetchAgentSkills(agentId: string): Promise<AgentSkillListResponse> {
  return request(`${agentPath(agentId)}/skills`);
}

/**
 * Attach one skill.
 *
 * `version` is required and must be a version the catalogue row has actually
 * published — never the string "latest". The pin is the AST07 control: the exact
 * string that was risk-scored is the string that gets installed, so a later
 * reclassification shows up as drift instead of being installed silently.
 *
 * `riskAcknowledged` must be sent `true` to attach a `high`-risk skill, and the
 * UI must have actually asked. Defaulting it here would move the §6.5 gate from
 * the operator to this function.
 */
export interface AttachSkillBody {
  publicId: string;
  version: string;
  compatAsserted?: boolean;
  riskAcknowledged?: boolean;
  enabled?: boolean;
  /** Env var NAMES and non-secret values only. Secret-looking keys are refused server-side. */
  config?: Record<string, string>;
}

export function attachAgentSkill(
  agentId: string,
  body: AttachSkillBody,
): Promise<AttachSkillResponse> {
  return request(`${agentPath(agentId)}/skills`, { method: "POST", body: JSON.stringify(body) });
}

export function updateAgentSkill(
  agentId: string,
  attachmentId: string,
  body: { enabled?: boolean; config?: Record<string, string> },
): Promise<{ item: AgentSkillDTO }> {
  return request(`${agentPath(agentId)}/skills/${encodeURIComponent(attachmentId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * Detach. `outcome` is `"deleted"` when nothing had reached the VM, and
 * `"removing"` when the runtime still has to uninstall it — a row that stays
 * visible until it confirms, which is the honest thing to show.
 */
export function detachAgentSkill(
  agentId: string,
  attachmentId: string,
): Promise<{ outcome: "deleted" | "removing" }> {
  return request(`${agentPath(agentId)}/skills/${encodeURIComponent(attachmentId)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export function fetchAgentContext(agentId: string): Promise<ContextListResponse> {
  return request(`${agentPath(agentId)}/context`);
}

export function fetchContextItem(
  agentId: string,
  itemId: string,
): Promise<{ item: ContextItemDetailDTO }> {
  return request(`${agentPath(agentId)}/context/${encodeURIComponent(itemId)}`);
}

/**
 * Create one item.
 *
 * A `file` item is REGISTERED here, not uploaded: the row comes back in
 * `awaiting_upload` with no bytes, and the upload is a separate step. The UI
 * should draw it as "waiting for a file" rather than as a document the agent can
 * already read.
 */
export function createContextItem(
  agentId: string,
  body: CreateContextItemInput,
): Promise<{ item: ContextItemDTO }> {
  return request(`${agentPath(agentId)}/context`, { method: "POST", body: JSON.stringify(body) });
}

export function updateContextItem(
  agentId: string,
  itemId: string,
  body: UpdateContextItemInput,
): Promise<{ item: ContextItemDetailDTO }> {
  return request(`${agentPath(agentId)}/context/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteContextItem(
  agentId: string,
  itemId: string,
): Promise<{ outcome: "deleted" | "removing" }> {
  return request(`${agentPath(agentId)}/context/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}
