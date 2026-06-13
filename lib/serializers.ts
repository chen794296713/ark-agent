/**
 * DB row -> API DTO mappers. DTOs are plain data (camelCase, no presentation
 * colors); the client maps status/engine to labels & hues via lib/agent-display.
 * Channel secrets are masked here so they never leave the server.
 */
import type {
  User,
  Workspace,
  Agent,
  AgentTask,
  AgentActivity,
  AgentMetric,
  AgentImprovement,
  Message,
  Channel,
  Invoice,
  Plan,
  AgentRole,
} from "@/lib/db/schema";

export function publicUser(u: User) {
  return { id: u.id, email: u.email, name: u.name, locale: u.locale };
}
export type PublicUser = ReturnType<typeof publicUser>;

export function publicWorkspace(w: Workspace) {
  return {
    id: w.id,
    name: w.name,
    creditsIncluded: w.creditsIncluded,
    creditsUsed: w.creditsUsed,
    cycleResetsAt: w.cycleResetsAt,
  };
}

export function serializeAgent(
  a: Agent,
  opts: { roleName?: string; channels?: string[]; line?: string | null } = {},
) {
  return {
    id: a.id,
    name: a.name,
    mono: a.name.slice(0, 1).toUpperCase(),
    roleId: a.roleId,
    role: opts.roleName ?? a.roleId,
    engine: a.engine,
    planTier: a.planTier,
    status: a.status,
    hue: a.hue,
    creditsUsed: a.creditsUsed,
    vmId: a.vmId,
    vmRegion: a.vmRegion,
    deploymentStatus: a.deploymentStatus,
    instructions: a.instructions,
    rules: a.rules,
    channels: opts.channels ?? [],
    line: opts.line ?? null,
    uptimeStartedAt: a.uptimeStartedAt,
    lastHeartbeatAt: a.lastHeartbeatAt,
    createdAt: a.createdAt,
  };
}
export type AgentDTO = ReturnType<typeof serializeAgent>;

export function serializeTask(t: AgentTask) {
  return { id: t.id, text: t.text, status: t.status, meta: t.meta, sortOrder: t.sortOrder };
}

export function serializeActivity(a: AgentActivity) {
  return { id: a.id, text: a.text, tag: a.tag, occurredAt: a.occurredAt };
}

export function serializeMetric(m: AgentMetric) {
  return { id: m.id, label: m.label, value: m.value, delta: m.delta, weight: m.weight };
}

export function serializeImprovement(i: AgentImprovement) {
  return { id: i.id, text: i.text, impact: i.impact, status: i.status, createdAt: i.createdAt };
}

export function serializeMessage(m: Message) {
  return {
    id: m.id,
    sender: m.sender,
    body: m.body,
    channelType: m.channelType,
    status: m.status,
    meta: m.meta,
    createdAt: m.createdAt,
  };
}

const SECRET_KEYS = /token|secret|key|appsecret|password/i;
export function serializeChannel(c: Channel) {
  const config: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.config ?? {})) {
    config[k] = SECRET_KEYS.test(k) && v ? "••••••••" : v;
  }
  return { id: c.id, type: c.type, status: c.status, label: c.label, config };
}

export function serializeInvoice(i: Invoice) {
  return {
    id: i.id,
    number: i.number,
    amountCents: i.amountCents,
    currency: i.currency,
    status: i.status,
    issuedAt: i.issuedAt,
    paidAt: i.paidAt,
    pdfUrl: i.pdfUrl,
  };
}

export function serializePlan(p: Plan) {
  return {
    id: p.id,
    name: p.name,
    monthlyPriceCents: p.monthlyPriceCents,
    includedCredits: p.includedCredits,
    overageCentsPer1k: p.overageCentsPer1k,
    features: p.features,
  };
}

export function serializeRole(r: AgentRole) {
  return {
    id: r.id,
    name: r.name,
    blurb: r.blurb,
    longBlurb: r.longBlurb,
    hue: r.hue,
    mono: r.mono,
    defaultEngine: r.defaultEngine,
    defaultInstructions: r.defaultInstructions,
    defaultRules: r.defaultRules,
    minPlan: r.minPlan,
  };
}
