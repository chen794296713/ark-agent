/**
 * Mock Agent Manager — simulates VM creation, engine deployment, lifecycle and
 * agent replies in-process, so the full ArkAgent flow works (and is testable)
 * without the external service. Enabled when AGENT_MANAGER_MODE !== "live".
 */
import { randomUUID, createHash } from "node:crypto";
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

const REGIONS = ["sgp-04", "sgp-02", "fra-01", "sfo-03", "nrt-02"];

function pickRegion(seed: string): string {
  const n = createHash("sha256").update(seed).digest()[0];
  return REGIONS[n % REGIONS.length];
}

function replyFor(role: string, body: string): string {
  const b = body.trim();
  const lead =
    role === "support"
      ? "On it — I'll handle that across every channel."
      : role === "prospector" || role === "salesmkt"
      ? "Got it. I'll fold that into the outreach plan and report back."
      : role === "content"
      ? "Understood — I'll draft that and queue it for your approval."
      : role === "hr"
      ? "Noted. I'll adjust the sourcing and screening accordingly."
      : role === "legal"
      ? "Understood — I'll review against our standard positions and flag risks."
      : "Understood. I'll take care of it and keep you posted.";
  return `${lead} (Re: "${b.length > 80 ? b.slice(0, 77) + "..." : b}")`;
}

export const mockClient: AgentManagerClient = {
  async provisionAgent(input: ProvisionInput): Promise<ProvisionResult> {
    const region = input.region || pickRegion(input.externalAgentId);
    // Mock provisions quickly and reports the agent already working.
    return {
      agentManagerId: `am_${randomUUID()}`,
      vmId: `${region}-${createHash("sha256")
        .update(input.externalAgentId)
        .digest("hex")
        .slice(0, 4)}`,
      vmRegion: region,
      status: "working",
      deploymentStatus: "deployed",
    };
  },

  async updateAgent(): Promise<LifecycleResult> {
    return { status: "working" };
  },

  async sendMessage(
    agentManagerId: string,
    input: SendMessageInput,
  ): Promise<SendMessageResult> {
    // role is encoded by the caller into the channel hint is not available, so
    // derive a generic-but-plausible reply; the route passes role via channel? no —
    // keep it simple and role-agnostic here, route may override.
    return {
      accepted: true,
      externalId: `am_msg_${randomUUID()}`,
      reply: {
        body: replyFor("", input.body),
        externalId: `am_reply_${randomUUID()}`,
        meta: "VIA WEB",
      },
    };
  },

  async setLifecycle(
    _agentManagerId: string,
    action: LifecycleAction,
  ): Promise<LifecycleResult> {
    return {
      status: action === "pause" ? "paused" : action === "terminate" ? "terminated" : "working",
    };
  },
};

/** Exposed so a route can generate a role-flavored mock reply. */
export function mockReply(role: string, body: string): string {
  return replyFor(role, body);
}
