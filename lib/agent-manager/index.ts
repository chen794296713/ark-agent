import "server-only";
import type { AgentManagerClient } from "./types";
import { mockClient } from "./mock";
import { liveClient } from "./live";

/** Resolve the active Agent Manager client based on AGENT_MANAGER_MODE. */
export function getAgentManager(): AgentManagerClient {
  return process.env.AGENT_MANAGER_MODE === "live" ? liveClient : mockClient;
}

export { mockReply } from "./mock";
export { verifyWebhookSignature } from "./webhook";
export type * from "./types";
