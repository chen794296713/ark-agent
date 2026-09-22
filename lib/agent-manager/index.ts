import "server-only";
import type { AgentManagerClient } from "./types";
import { mockClient } from "./mock";
import { liveClient } from "./live";

/**
 * Which Agent Manager a request talks to.
 *
 *  - `live`   the external service, over HTTPS
 *  - `mock`   the in-process simulator (lib/agent-manager/mock.ts)
 *  - `unconfigured`  neither — the caller must refuse the operation
 */
export type AgentManagerMode = "live" | "mock" | "unconfigured";

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * Resolve the mode from the environment.
 *
 * This deliberately mirrors `lib/payments/config.ts`, and for the same reason.
 * The old rule was `AGENT_MANAGER_MODE === "live" ? live : mock`, which makes
 * the SIMULATOR the default — including in production. A deployment that forgot
 * the variable would report every agent as `working`, invent VM ids and
 * uptimes, answer chat with canned text, and bill the customer for a seat
 * behind which no machine was ever started. That failure is silent and looks
 * exactly like success, which is what makes it the worst one available.
 *
 * So: `live` requires a base URL to go with it; anything unconfigured in
 * production resolves to `unconfigured` and the route returns 503. Running the
 * simulator on a production host is still possible, but only by asking for it
 * by name — which no real deployment would do by accident.
 */
export function agentManagerMode(): AgentManagerMode {
  const explicit = process.env.AGENT_MANAGER_MODE?.trim().toLowerCase();
  const baseUrl = process.env.AGENT_MANAGER_BASE_URL?.trim();

  if (explicit === "mock") return "mock";
  if (explicit === "live") return baseUrl ? "live" : "unconfigured";
  // No explicit mode: infer from whether an upstream is actually reachable.
  if (baseUrl) return "live";
  return isProduction() ? "unconfigured" : "mock";
}

/** True when agent operations can proceed at all. */
export function isAgentManagerConfigured(): boolean {
  return agentManagerMode() !== "unconfigured";
}

export class AgentManagerUnconfiguredError extends Error {
  constructor() {
    super(
      "Agent runtime is not configured. Set AGENT_MANAGER_BASE_URL (and AGENT_MANAGER_API_KEY), " +
        "or AGENT_MANAGER_MODE=mock for a non-production environment.",
    );
    this.name = "AgentManagerUnconfiguredError";
  }
}

/**
 * The active Agent Manager client.
 *
 * Throws `AgentManagerUnconfiguredError` rather than returning a simulator when
 * the environment is not set up — callers turn that into a 503 so the operator
 * sees a configuration error instead of a fleet of agents that do not exist.
 */
export function getAgentManager(): AgentManagerClient {
  const mode = agentManagerMode();
  if (mode === "unconfigured") throw new AgentManagerUnconfiguredError();
  return mode === "live" ? liveClient : mockClient;
}

export { mockReply } from "./mock";
export { verifyWebhookSignature } from "./webhook";
export type * from "./types";
