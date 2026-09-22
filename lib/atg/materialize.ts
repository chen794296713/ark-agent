import "server-only";

/**
 * Draft → running agent.
 *
 * **The rows are committed BEFORE the VM is provisioned, and that order is the
 * whole design.** An agent that exists in Postgres with no VM is recoverable —
 * the operator sees it in the fleet as `error`, and a retry re-provisions it.
 * The reverse — a VM the Manager is billing us for with no row pointing at it —
 * is a leak nobody can see, because the only record of it is in someone else's
 * database. So: one transaction writes `agents`, `agent_channels`,
 * `agent_tasks`, `agent_skills`, `agent_context_items`, `agent_schedules` and
 * the billing seat; it commits; and only then does anything talk to the network.
 *
 * **Idempotent on `agents.idempotency_key`.** A retry after a timeout must not
 * hire two agents. The partial unique index
 * `agents_idempotency_uniq (workspace_id, idempotency_key)` is the arbiter, not
 * a pre-flight SELECT that could race: the replay path is entered both from the
 * cheap lookup at the top AND from the 23505 the insert may raise.
 *
 * **Degradation.** With the Agent Manager unconfigured, everything above still
 * happens and the function returns `{ provisioned: false, reason:
 * "agent_manager_unconfigured" }`; the agent sits in `draft` with all of its
 * skills, context, schedules and tasks attached, and provisioning is a later
 * action rather than a lost one. With a harness the Manager has no `category_id`
 * for, same shape, `reason: "harness_not_provisionable"`. No model is called
 * anywhere in this file, so `OPENROUTER_API_KEY` is irrelevant to it.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agentChannels,
  agentContextItems,
  agentRoles,
  agentSchedules,
  agentSkills,
  agentTasks,
  agents,
  channels,
  plans,
  skills,
  subscriptions,
  workspaces,
  type Agent,
  type AgentTemplate,
} from "@/lib/db/schema";
import { DEFAULT_SETTINGS, type StoredAgentSettings } from "@/lib/agent-settings";
import type { ChannelType } from "@/lib/channels";
import type { PlanTier } from "@/lib/pricing";
import { categoryIdFor, HarnessNotProvisionableError, isHarnessEnabled } from "@/lib/harness/provisioning";
import { agentManagerMode } from "@/lib/agent-manager";
import { createOpenclawInstance } from "@/lib/services/openclaw_instances";
import { isValidCron, isValidTimeZone, nextRun, resolveLocal } from "@/lib/schedule/cron";
import { SCHEDULE_LIMITS } from "@/lib/schedules/limits";
import { isContextMimeType, isSafePublicHttpsUrl } from "./safety";
import { recordTemplateUse } from "./queries";
import type {
  AgentTemplateDraft,
  TemplateAgent,
  TemplateContextItem,
  TemplateSchedule,
} from "./types";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type MaterializeErrorCode =
  | "unknown_schema_version"
  | "not_materializable"
  | "empty_draft"
  | "harness_disabled"
  | "unknown_role";

export class MaterializeError extends Error {
  readonly code: MaterializeErrorCode;
  readonly status: number;
  constructor(code: MaterializeErrorCode, message: string, status = 409) {
    super(message);
    this.name = "MaterializeError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Draft → column mappings
// ---------------------------------------------------------------------------

/**
 * The agent's `rules` column, composed from the draft's boundaries.
 *
 * `lib/atg/types.ts` describes a `renderRules()` that prefixes a hard rule with
 * NEVER/ALWAYS. That helper does not exist, and writing it here would put two
 * English words into a draft whose `locale` may be `ja` — the rule texts
 * themselves are already written in the draft's language, and this app's
 * standard is that no user-visible English is hardcoded in a code path. So the
 * severity is carried by a GLYPH, which is language-neutral and survives being
 * pasted into a system prompt: `!` for hard, `-` for soft.
 */
export function renderRules(draft: AgentTemplateDraft): string {
  const lines: string[] = [];
  for (const rule of draft.boundaries.rules) {
    lines.push(`${rule.severity === "hard" ? "!" : "-"} ${rule.text}`);
  }
  for (const p of draft.boundaries.prohibitions) lines.push(`! ${p}`);
  return lines.join("\n").slice(0, 8000);
}

/**
 * The draft's behaviour block, as a `StoredAgentSettings` blob.
 *
 * `escalateTo` is deliberately absent: `TemplateBoundaries.escalation.to` is
 * typed `null` on purpose (a model that emits an address there has either
 * hallucinated one or lifted it out of the user's brief), and writing an empty
 * string would overwrite a value the workspace may already have set elsewhere.
 * `knowledgeUrls` is absent for the same class of reason — a URL an agent
 * fetches is an `agent_context_items` row with a state machine, not a settings
 * field with no provenance.
 */
export function settingsFromDraft(
  draft: AgentTemplateDraft,
  agent: TemplateAgent,
): StoredAgentSettings {
  const s = agent.settings;
  const b = draft.boundaries;
  return {
    tone: s.tone,
    responseLanguage: s.responseLanguage,
    timezone: isValidTimeZone(s.timezone) ? s.timezone : DEFAULT_SETTINGS.timezone,

    autonomy: b.autonomy,
    approvalAmount: Math.max(0, Math.round(b.approvalAmountUsd)),
    approveExternalSends: b.approveExternalSends,
    dailyActionLimit: Math.max(0, Math.round(b.dailyActionLimit)),

    alwaysOn: s.alwaysOn,
    workStart: s.workStart,
    workEnd: s.workEnd,
    workDays: s.workDays,
    heartbeatMinutes: s.heartbeatMinutes,

    notifyNeedsReview: s.notifyNeedsReview,
    notifyErrors: s.notifyErrors,
    dailyDigest: s.dailyDigest,
    digestTime: s.digestTime,

    temperature: s.temperature,
    maxTokens: s.maxTokens,
    reasoningEffort: s.reasoningEffort,

    memoryEnabled: s.memoryEnabled,
    retentionDays: Math.max(1, Math.round(b.dataHandling.retentionDays)),
    monthlyCreditCap: Math.max(0, Math.round(b.spend.monthlyCreditCap)),

    tools: agent.tools,
    selfImprove: s.selfImprove,
    autoCreateSkills: s.autoCreateSkills,
  };
}

/**
 * `agent_context_items.kind` is `file | text | url`; the draft's vocabulary is
 * `pasted_text | file_request | url`. The mapping is where `awaiting_upload` is
 * written — the ONE state only the template generator produces, meaning "no
 * bytes exist yet", which the runtime must skip silently rather than fetch a
 * null `content_url`.
 *
 * Every branch returns the SAME key set, `null`s included. A heterogeneous
 * array reaching one multi-row INSERT is a bet on how the query builder fills
 * an absent key, and the losing side of that bet is a `text_body` from row 1
 * landing on row 2.
 */
type ContextValues = typeof agentContextItems.$inferInsert;

function contextRow(item: TemplateContextItem, agentId: string): ContextValues | null {
  const base = {
    agentId,
    name: item.title.slice(0, 200),
    mime: null,
    textBody: null,
    sourceUrl: null,
    bytes: 0,
  };
  if (item.kind === "pasted_text") {
    const body = item.body ?? "";
    return {
      ...base,
      kind: "text",
      textBody: body,
      state: "pending",
      bytes: Buffer.byteLength(body, "utf8"),
    };
  }
  if (item.kind === "url") {
    // Re-checked HERE and not only at generation: the row may have been written
    // by an older linter, edited through PATCH, or forked from another tenant,
    // and the AGENT RUNTIME is what fetches it. A link-local address stored in a
    // template is an SSRF payload we shipped.
    if (!item.url || !isSafePublicHttpsUrl(item.url)) return null;
    return { ...base, kind: "url", sourceUrl: item.url, state: "pending" };
  }
  return {
    ...base,
    kind: "file",
    mime: (item.acceptedMimeTypes ?? []).find(isContextMimeType) ?? null,
    // No bytes exist yet. `contentUrl` stays null and the runtime skips the row.
    state: "awaiting_upload",
  };
}

/**
 * The draft's schedule vocabulary is `recurring | one_off | reminder` and every
 * one of them carries a cron; `agent_schedules.kind` is `cron | interval | once`
 * with a CHECK that only one discriminant may be set. A `one_off` therefore
 * becomes `once` with an absolute `run_at` resolved from its `onDate` in its own
 * zone — not from the server's clock, which is a different day for half the
 * planet.
 *
 * `next_run_at` is computed BEFORE the insert and inside the same transaction,
 * so `agent_schedules_enabled_next` (enabled ⇔ next_run_at IS NOT NULL) is
 * satisfied by construction rather than by a follow-up UPDATE that could fail
 * and leave an enabled schedule that never fires.
 */
function scheduleRow(s: TemplateSchedule, agentId: string, createdById: string | null, now: Date) {
  const timezone = isValidTimeZone(s.timezone) ? s.timezone : "UTC";
  if (!isValidCron(s.cron)) return null;

  const deliverTo = ["chat", "email", "channel", "none"].includes(s.deliverTo) ? s.deliverTo : "chat";
  const maxRunsPerDay = Math.min(
    SCHEDULE_LIMITS.HARD_MAX_RUNS_PER_DAY,
    Math.max(1, Math.round(s.maxRunsPerDay || SCHEDULE_LIMITS.DEFAULT_MAX_RUNS_PER_DAY)),
  );
  const common = {
    agentId,
    createdById,
    name: s.title.slice(0, 120),
    prompt: s.prompt,
    timezone,
    deliverTo,
    maxRunsPerDay,
    catchUp: s.catchUpPolicy === "run_once",
  };

  if (s.kind === "one_off" && s.onDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.onDate);
    if (!m) return null;
    const midnight = resolveLocal(
      { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: 0, minute: 0 },
      timezone,
    ).instant;
    // The cron says WHEN in the day; the date says WHICH day. Searching from
    // the day's own midnight is what makes "the 3rd at 09:00" mean the 3rd.
    const after = midnight.getTime() > now.getTime() ? midnight : now;
    const runAt = nextRun(s.cron, new Date(after.getTime() - 60_000), timezone);
    if (!runAt) return null;
    return {
      ...common,
      kind: "once" as const,
      cronExpr: null,
      intervalSeconds: null,
      runAt,
      enabled: s.enabled,
      nextRunAt: s.enabled ? runAt : null,
    };
  }

  const nextRunAt = nextRun(s.cron, now, timezone);
  if (!nextRunAt) return null;
  return {
    ...common,
    kind: "cron" as const,
    cronExpr: s.cron.slice(0, 120),
    intervalSeconds: null,
    runAt: null,
    enabled: s.enabled,
    nextRunAt: s.enabled ? nextRunAt : null,
  };
}

// ---------------------------------------------------------------------------
// The transaction
// ---------------------------------------------------------------------------

export interface MaterializeInput {
  template: AgentTemplate;
  draft: AgentTemplateDraft;
  workspaceId: string;
  userId: string;
  /** From the required `Idempotency-Key` header. Never generated server-side:
   *  a key minted here would be new on every retry, which is no key at all. */
  idempotencyKey: string;
  overrides?: { name?: string; planTier?: PlanTier; channels?: ChannelType[] };
  now?: Date;
}

export interface MaterializeResult {
  agent: Agent;
  /** True only when the Agent Manager confirmed an instance. */
  provisioned: boolean;
  /** Why not, when `provisioned` is false. A normalized class, never an
   *  upstream error body — those carry key fragments and request URLs. */
  reason?: string;
  /** The idempotency key matched an existing agent; nothing new was written. */
  replayed: boolean;
  /** Parts of the draft that could not be materialized, as normalized codes.
   *  A skill the catalogue has since blocked is skipped, not fatal — the agent
   *  is still worth having, and the operator is told what it is missing. */
  skipped: string[];
}

/** One `agent_skills` row minus its `agent_id`, which does not exist until the
 *  transaction has inserted the agent. Named so the accumulator has a type
 *  before the loop that fills it. */
type AttachValues = Omit<typeof agentSkills.$inferInsert, "agentId">;

async function findByIdempotencyKey(
  workspaceId: string,
  key: string,
): Promise<Agent | null> {
  const [row] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.idempotencyKey, key)))
    .limit(1);
  return row ?? null;
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "23505";
}

export async function materializeTemplate(input: MaterializeInput): Promise<MaterializeResult> {
  const now = input.now ?? new Date();
  const { draft, template, workspaceId, userId } = input;

  // ---- Replay ------------------------------------------------------------
  const replay = await findByIdempotencyKey(workspaceId, input.idempotencyKey);
  if (replay) {
    return {
      agent: replay,
      provisioned: Boolean(replay.agentManagerId),
      replayed: true,
      skipped: [],
      ...(replay.agentManagerId ? {} : { reason: "not_provisioned" }),
    };
  }

  // ---- Preconditions -----------------------------------------------------
  if (draft.schemaVersion !== 1) {
    throw new MaterializeError(
      "unknown_schema_version",
      `draft schemaVersion ${String(draft.schemaVersion)} is not supported`,
    );
  }
  if (!template.materializable || draft.provenance.materializable !== true) {
    throw new MaterializeError(
      "not_materializable",
      "this template has an unremediated lint error and cannot be materialized",
    );
  }
  const primary = draft.agents.find((a) => a.isPrimary) ?? draft.agents[0];
  if (!primary) throw new MaterializeError("empty_draft", "the draft declares no agents", 422);

  const harness = primary.harness;
  if (!isHarnessEnabled(harness)) {
    throw new MaterializeError("harness_disabled", `the ${harness} harness is not enabled`);
  }

  // ---- Resolve the role --------------------------------------------------
  // `agents.role_id` is a foreign key, so an unknown id is a 500 at insert
  // time. The draft's `baseRoleId` is nullable by design (a role with no
  // catalogue equivalent), so the fallback is not an error path.
  const roleKey = draft.roles.find((r) => r.key === primary.roleKey)?.baseRoleId ?? null;
  const roleRows = await db
    .select({ id: agentRoles.id, hue: agentRoles.hue })
    .from(agentRoles)
    .where(roleKey ? inArray(agentRoles.id, [roleKey, "admin"]) : eq(agentRoles.id, "admin"));
  const role = roleRows.find((r) => r.id === roleKey) ?? roleRows[0];
  if (!role) {
    throw new MaterializeError("unknown_role", "no agent role is seeded in this deployment", 503);
  }

  // ---- Resolve the skills against the live catalogue ----------------------
  const skipped: string[] = [];
  const wantedIds = draft.skills
    .map((s) => s.skillId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const catalogue = wantedIds.length
    ? await db
        .select({
          id: skills.id,
          sourceId: skills.sourceId,
          ownerHandle: skills.ownerHandle,
          slug: skills.slug,
          latestVersion: skills.latestVersion,
          riskLevel: skills.riskLevel,
          status: skills.status,
          blocked: skills.blocked,
        })
        .from(skills)
        .where(inArray(skills.id, wantedIds))
    : [];
  const byId = new Map(catalogue.map((s) => [s.id, s]));

  const skillValues: AttachValues[] = [];
  for (const s of draft.skills) {
    const row = s.skillId ? byId.get(s.skillId) : undefined;
    if (!row) {
      // A deterministic-fallback draft with no catalogue match, or a row the
      // catalogue has since dropped. Not fatal.
      skipped.push(`skill_unresolved:${s.slug.slice(0, 60)}`);
      continue;
    }
    if (row.blocked || row.status === "blocked") {
      // Re-checked at attach and not only at generation: a version that was
      // clean when the template was written can be reclassified later, and
      // installing it anyway would make the catalogue's verdict decorative.
      skipped.push(`skill_blocked:${row.slug.slice(0, 60)}`);
      continue;
    }
    if (row.riskLevel === "high" && !s.riskAccepted) {
      skipped.push(`skill_needs_ack:${row.slug.slice(0, 60)}`);
      continue;
    }
    skillValues.push({
      skillId: row.id,
      // PINNED. Never "latest": a null `version` in the draft means "re-resolve
      // at materialize", and this is that resolution — after which the string
      // is frozen, so a later reclassification shows as drift (OWASP AST07).
      version: (s.version ?? row.latestVersion).slice(0, 60),
      harness,
      compatAsserted: s.harnessCompatible === true,
      riskLevelAtAttach: row.riskLevel,
      riskAcknowledged: s.riskAccepted === true,
      sourceRef: row.sourceId,
      ownerHandle: row.ownerHandle,
      slug: row.slug,
      origin: "atg" as const,
      originRef: template.id,
      addedById: userId,
      state: "pending" as const,
      installSource: agentManagerMode() === "mock" ? "mock" : "live",
    });
  }

  // ---- Channels ----------------------------------------------------------
  // `web` is always present: it is the dashboard chat, and an agent nobody can
  // talk to is not a delivered agent.
  const channelTypes = Array.from(
    new Set<ChannelType>([...(input.overrides?.channels ?? primary.channels ?? []), "web"]),
  );

  const planTier: PlanTier = input.overrides?.planTier ?? draft.meta.minPlan;
  const agentName = (input.overrides?.name ?? primary.name).slice(0, 80);

  // ---- One transaction ---------------------------------------------------
  let created: Agent;
  try {
    created = await db.transaction(async (tx) => {
      const [agent] = await tx
        .insert(agents)
        .values({
          workspaceId,
          createdById: userId,
          name: agentName,
          roleId: role.id,
          engine: harness,
          planTier,
          // Not `provisioning`: nothing has been asked of the Manager yet, and
          // a status that claims otherwise before the commit is a status that
          // lies for as long as the commit takes.
          status: "draft",
          instructions: primary.brief.slice(0, 8000),
          rules: renderRules(draft),
          hue: template.hue || role.hue,
          settings: settingsFromDraft(draft, primary),
          idempotencyKey: input.idempotencyKey,
        })
        .returning();

      // -- channels --
      const existing = await tx
        .select({ id: channels.id, type: channels.type })
        .from(channels)
        .where(eq(channels.workspaceId, workspaceId));
      const byType = new Map(existing.map((c) => [c.type, c.id]));
      const missing = channelTypes.filter((t) => !byType.has(t));
      if (missing.length) {
        const inserted = await tx
          .insert(channels)
          .values(
            missing.map((t) => ({
              workspaceId,
              type: t,
              status: (t === "web" ? "connected" : "pending") as "connected" | "pending",
              label: t,
            })),
          )
          .returning({ id: channels.id, type: channels.type });
        for (const c of inserted) byType.set(c.type, c.id);
      }
      const links = channelTypes
        .map((t) => byType.get(t))
        .filter((id): id is string => typeof id === "string")
        .map((channelId) => ({ agentId: agent.id, channelId }));
      if (links.length) await tx.insert(agentChannels).values(links).onConflictDoNothing();

      // -- tasks --
      if (primary.tasks.length) {
        await tx.insert(agentTasks).values(
          primary.tasks.slice(0, 50).map((t, i) => ({
            agentId: agent.id,
            text: t.text,
            meta: t.meta,
            status: "queued" as const,
            sortOrder: Number.isFinite(t.sortOrder) ? t.sortOrder : i,
          })),
        );
      }

      // -- skills --
      if (skillValues.length) {
        await tx
          .insert(agentSkills)
          .values(skillValues.map((v) => ({ ...v, agentId: agent.id })))
          .onConflictDoNothing();
      }

      // -- context --
      const contextValues = draft.context
        .map((c) => contextRow(c, agent.id))
        .filter((v): v is NonNullable<typeof v> => v !== null);
      if (contextValues.length) await tx.insert(agentContextItems).values(contextValues);
      const droppedContext = draft.context.length - contextValues.length;
      if (droppedContext > 0) skipped.push(`context_unsafe:${droppedContext}`);

      // -- schedules --
      // Only the primary agent's schedules: a draft may address a schedule to a
      // second agent, and this transaction hires one. `scheduleKeys` is the
      // join, with `agentKey` as the fallback for a draft that only set one.
      const wanted = new Set(primary.scheduleKeys);
      const mine = draft.schedules.filter(
        (s) => wanted.has(s.key) || s.agentKey === primary.key,
      );
      const scheduleValues = mine
        .slice(0, SCHEDULE_LIMITS.MAX_ROWS_PER_AGENT)
        .map((s) => scheduleRow(s, agent.id, userId, now))
        .filter((v): v is NonNullable<typeof v> => v !== null);
      if (scheduleValues.length) await tx.insert(agentSchedules).values(scheduleValues);
      const droppedSchedules = mine.length - scheduleValues.length;
      if (droppedSchedules > 0) skipped.push(`schedule_unresolvable:${droppedSchedules}`);

      // -- billing seat --
      // The same two writes `createAgent` makes. An agent that exists without a
      // seat is an agent nobody is billed for, and a materialize path that
      // quietly skipped this would be the cheapest way to run a fleet for free.
      await tx.insert(subscriptions).values({
        workspaceId,
        agentId: agent.id,
        planId: planTier,
        cycle: "monthly",
        status: "active",
        currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
      });
      const [plan] = await tx.select().from(plans).where(eq(plans.id, planTier)).limit(1);
      if (plan) {
        await tx
          .update(workspaces)
          .set({ creditsIncluded: sql`${workspaces.creditsIncluded} + ${plan.includedCredits}` })
          .where(eq(workspaces.id, workspaceId));
      }

      // The manifest revision the runtime polls against. Every child-table write
      // above happened inside this transaction, so one bump covers all of them —
      // and it happens here rather than being left at the column default,
      // because a runtime that has seen revision 1 must be told there is a 2.
      const [bumped] = await tx
        .update(agents)
        .set({ configRevision: sql`${agents.configRevision} + 1`, updatedAt: new Date() })
        .where(eq(agents.id, agent.id))
        .returning();
      return bumped ?? agent;
    });
  } catch (e) {
    // Two requests carrying the same key raced past the lookup above. The index
    // decided; this reads the winner rather than reporting a conflict for
    // something the caller explicitly asked to be idempotent.
    if (isUniqueViolation(e)) {
      const winner = await findByIdempotencyKey(workspaceId, input.idempotencyKey);
      if (winner) {
        return {
          agent: winner,
          provisioned: Boolean(winner.agentManagerId),
          replayed: true,
          skipped: [],
        };
      }
    }
    throw e;
  }

  // Best-effort, and outside the transaction on purpose: a failed counter must
  // never roll back an agent that exists.
  await recordTemplateUse(template.id, now).catch(() => {});

  // ---- Provisioning, after the commit ------------------------------------
  const provision = await provisionAgent(created, {
    tasks: primary.tasks.map((t) => t.text),
  });
  return { agent: provision.agent, provisioned: provision.provisioned, replayed: false, skipped,
    ...(provision.reason ? { reason: provision.reason } : {}) };
}

/**
 * Ask the Agent Manager for a VM.
 *
 * Everything here is recoverable: the agent row already exists, so a failure is
 * a status and a `last_error`, never an exception that reaches the caller. The
 * three no-VM outcomes are distinguished because they need different operator
 * actions — configure the Manager, enable the harness upstream, or read the
 * error.
 */
async function provisionAgent(
  agent: Agent,
  input: { tasks: string[] },
): Promise<{ agent: Agent; provisioned: boolean; reason?: string }> {
  if (agentManagerMode() === "unconfigured") {
    return { agent, provisioned: false, reason: "agent_manager_unconfigured" };
  }

  let categoryId: number;
  try {
    categoryId = categoryIdFor(agent.engine);
  } catch (e) {
    const reason =
      e instanceof HarnessNotProvisionableError ? "harness_not_provisionable" : "harness_unknown";
    const [row] = await db
      .update(agents)
      .set({ status: "error", lastError: reason, updatedAt: new Date() })
      .where(eq(agents.id, agent.id))
      .returning();
    return { agent: row ?? agent, provisioned: false, reason };
  }

  try {
    const { config, preprocessed } = await createOpenclawInstance({
      agentId: agent.id,
      name: agent.name,
      categoryId,
      targetUserId: agent.createdById,
      instructions: agent.instructions,
      rules: agent.rules,
      tasks: input.tasks,
    });
    const dockerContainerName =
      typeof config.config.docker_container_name === "string"
        ? config.config.docker_container_name
        : null;
    const [row] = await db
      .update(agents)
      .set({
        agentManagerId: preprocessed.uuid,
        vmId: dockerContainerName,
        deploymentStatus: preprocessed.provisioningStatus,
        status: preprocessed.isReady ? "working" : "provisioning",
        provisionedAt: preprocessed.isReady ? new Date() : null,
        uptimeStartedAt: preprocessed.isReady ? new Date() : null,
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id))
      .returning();
    return { agent: row ?? agent, provisioned: true };
  } catch (e) {
    // `String(e)` and not the response body: an upstream error can carry the
    // request URL with our API key in it, and `last_error` is rendered in the
    // dashboard.
    const [row] = await db
      .update(agents)
      .set({
        status: "error",
        lastError: String(e instanceof Error ? e.message : e).slice(0, 480),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id))
      .returning();
    return { agent: row ?? agent, provisioned: false, reason: "agent_manager_error" };
  }
}
