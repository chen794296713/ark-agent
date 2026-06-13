/**
 * Contract between ArkAgent and the external Agent Manager.
 *
 * OUTBOUND  (ArkAgent -> Agent Manager): the AgentManagerClient methods below.
 * INBOUND   (Agent Manager -> ArkAgent): WebhookEvent, delivered to
 *            POST /api/webhooks/agent-manager and HMAC-signed (see webhook.ts).
 *
 * Full reference: docs/API.md.
 */

export type AmEngine = "openclaw" | "hermes";
export type LifecycleAction = "pause" | "resume" | "terminate";

export interface ProvisionInput {
  /** ArkAgent's agent UUID — the Agent Manager echoes it on every webhook. */
  externalAgentId: string;
  engine: AmEngine;
  roleId: string;
  name: string;
  instructions: string;
  rules: string;
  channels: { type: string; config: Record<string, string> }[];
  region?: string;
}

export interface ProvisionResult {
  agentManagerId: string;
  vmId: string;
  vmRegion: string;
  status: string; // provisioning | deploying | working | error
  deploymentStatus: string;
}

export interface UpdateInput {
  instructions?: string;
  rules?: string;
  channels?: { type: string; config: Record<string, string> }[];
}

export interface SendMessageInput {
  conversationId: string;
  body: string;
  channel: string;
}

export interface SendMessageResult {
  accepted: boolean;
  externalId: string;
  /**
   * In mock mode the reply is returned inline so the UI works without a live
   * webhook loop. In live mode this is usually undefined and the reply arrives
   * later via an `agent.message` webhook.
   */
  reply?: { body: string; externalId: string; meta?: string };
}

export interface LifecycleResult {
  status: string;
}

export interface AgentManagerClient {
  provisionAgent(input: ProvisionInput): Promise<ProvisionResult>;
  updateAgent(agentManagerId: string, input: UpdateInput): Promise<LifecycleResult>;
  sendMessage(agentManagerId: string, input: SendMessageInput): Promise<SendMessageResult>;
  setLifecycle(agentManagerId: string, action: LifecycleAction): Promise<LifecycleResult>;
}

/** Inbound webhook events (Agent Manager -> ArkAgent). */
export type WebhookEvent =
  | {
      type: "agent.status";
      externalAgentId: string;
      status: string;
      vmId?: string;
      vmRegion?: string;
      deploymentStatus?: string;
      error?: string;
    }
  | { type: "agent.heartbeat"; externalAgentId: string; ts: string; uptimeStartedAt?: string }
  | {
      type: "agent.activity";
      externalAgentId: string;
      text: string;
      tag?: string;
      occurredAt?: string;
    }
  | {
      type: "agent.message";
      externalAgentId: string;
      conversationId?: string;
      channel: string;
      body: string;
      externalId: string;
      meta?: string;
    }
  | {
      type: "agent.metric";
      externalAgentId: string;
      label: string;
      value: string;
      delta?: string;
      weight?: number;
    }
  | { type: "agent.improvement"; externalAgentId: string; text: string; impact?: string }
  | { type: "agent.usage"; externalAgentId: string; credits: number; kind?: string };
