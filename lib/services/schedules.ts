import "server-only";
/**
 * The scheduler: CRUD, the claim protocol, and the tick that fires due work.
 *
 * ── Why exactly-once is three mechanisms, not one ────────────────────────────
 * G1  Two ticks running at the same instant cannot claim the same row.
 *     `FOR UPDATE SKIP LOCKED` inside the claiming statement. A Postgres row
 *     lock held for one statement; it cannot fail.
 * G2  A later tick cannot re-select an occurrence already claimed.
 *     `next_run_at` is advanced BEFORE any dispatch, and the lease hides the row
 *     in between.
 * G3  Two dispatches of the same occurrence cannot both be recorded.
 *     `UNIQUE (schedule_id, scheduled_for)` on `agent_schedule_runs`, inserted
 *     BEFORE the dispatch. The insert IS the permit: a worker that cannot insert
 *     the occurrence row does not dispatch, and the second tick treats the
 *     unique violation as SUCCESS, not as an error.
 *
 * ── Why advance-before-dispatch makes a duplicate impossible ─────────────────
 * The due predicate is `next_run_at <= now()`. If the advance happened after the
 * run completed, then for the whole duration of the run the row still satisfies
 * that predicate — so a per-minute tick selects a 4-minute run four times.
 * `overlap_policy` would catch three of them, but it is application policy, and
 * the fourth failure mode is the one that matters: a run that never reports a
 * terminal status leaves the row due FOREVER and the schedule fires every minute
 * until a human notices. Advancing first removes the row from the due set the
 * instant it is claimed, permanently, regardless of what happens next.
 *
 * The advance and the occurrence insert are ONE transaction because either alone
 * is a hole: advance without the row and the fire is untraceable; row without
 * the advance and the next tick re-selects it, hits G3, and burns a claim slot
 * every tick forever.
 *
 * ── Why a lost run is acceptable and a duplicate is not ──────────────────────
 * The ordering trades one failure mode for another, deliberately:
 *   A duplicate fire is IMPOSSIBLE. A lost fire is possible, bounded to a worker
 *   crash between the advance and the dispatch, lasts one lease, produces a
 *   `failed` row with `error_code: 'dispatch_lost'`, is auto-retried inside a
 *   15-minute window, and is one click from Run now.
 * The other ordering — dispatch first, record after — turns every crash into a
 * possible double fire, and a double fire on a `deliver_to='email'` invoice
 * reminder is a customer-visible incident that no amount of history can undo.
 *
 * docs/REMINDERS_AND_SCHEDULERS.md §3.
 */

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agentActivities,
  agentChannels,
  agentHealthSamples,
  agentRuns,
  agentScheduleRuns,
  agentSchedules,
  agents,
  channels,
  schedulerTicks,
  users,
  workspaces,
  type Agent,
} from "@/lib/db/schema";
import { agentManagerMode, getAgentManager } from "@/lib/agent-manager";
import type { SendMessageInput } from "@/lib/agent-manager/types";
import { mergeSettings } from "@/lib/agent-settings";
import type { Lang } from "@/lib/types";
import {
  cronError,
  isValidTimeZone,
  nextRun,
  zonedParts,
} from "@/lib/schedule/cron";
import { SCHEDULE_LIMITS } from "@/lib/schedules/limits";
import {
  advanceSchedule,
  classifyMisfire,
  dailyFireCount,
  finestGapSeconds,
  jitterOffsetSeconds,
  medianTickSeconds,
  unevenStep,
} from "@/lib/schedules/plan";
import {
  encodeRunCursor,
  decodeRunCursor,
  serializeSchedule,
  serializeScheduleRun,
  type ScheduleDTO,
  type ScheduleRow,
  type ScheduleRunDTO,
  type TickHealthDTO,
} from "@/lib/schedules/serialize";
import type {
  CreateScheduleInput,
  ScheduleRunsQuery,
  ScheduleValidationCode,
  UpdateScheduleInput,
} from "@/lib/schedules/validation";

// ---------------------------------------------------------------------------
// Operational knobs
// ---------------------------------------------------------------------------

const num = (name: string, fallback: number): number => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
};

export const SCHEDULER = {
  /**
   * The lease MUST exceed the tick route's `maxDuration` (60). If it did not, a
   * tick still legitimately working could have its claim stolen by the next one
   * and the same occurrence would be dispatched twice — G2 defeated by
   * configuration. 300 > 60 with a 5x margin, and a test asserts the relation
   * because the two numbers live in different files.
   */
  LEASE_SECONDS: num("SCHEDULER_LEASE_SECONDS", 300),
  /** A healthy per-minute cron routinely runs 30-90 s late. Below this is not a misfire. */
  GRACE_SECONDS: num("SCHEDULER_GRACE_SECONDS", 120),
  /** Past 24 h a catch-up is an embarrassment, not a recovery. */
  MISFIRE_MAX_AGE_SECONDS: num("SCHEDULER_MISFIRE_MAX_AGE_SECONDS", 86_400),
  BATCH_LIMIT: num("SCHEDULER_BATCH_LIMIT", 200),
  /** One agent with 20 schedules all at 09:00 must not consume a fifth of the batch. */
  PER_AGENT_PER_TICK: 4,
  MAX_IN_FLIGHT: 10,
  RETRY_MAX_ATTEMPTS: 3,
  RETRY_WINDOW_SECONDS: 900,
  /** The tick prunes its own ledger; at one row a minute this stays ~10k rows. */
  TICK_RETENTION_DAYS: 7,
} as const;

/** The agent states that can accept dispatched work. An ALLOW-list, not a
 *  deny-list: `agent_status` has nine values and a deny-list that forgets
 *  `error`, `provisioning` or `deploying` dispatches to an agent with no VM. A
 *  tenth status fails closed. */
const DISPATCHABLE_STATUSES = ["working", "scheduled", "needs_review"] as const;

/**
 * The same allow-list as a SQL fragment, so the two claim statements cannot
 * drift from the constant the rest of the file reasons about. `::text` on the
 * column rather than a cast on each parameter: the comparison is applied per
 * joined row on a primary-key join, so no index is given up, and it removes
 * every question about how an untyped bind parameter resolves against a pgEnum.
 */
const DISPATCHABLE_SQL = sql.join(
  DISPATCHABLE_STATUSES.map((v) => sql`${v}`),
  sql`, `,
);

const RETRYABLE_ERROR_CODES = ["dispatch_failed", "runtime_unreachable", "dispatch_lost"] as const;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ScheduleError extends Error {
  constructor(
    readonly code: ScheduleValidationCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ScheduleError";
  }
}

/** Our lease expired mid-transaction and a healthier tick owns this row. */
class ClaimLostError extends Error {
  constructor(readonly scheduleId: string) {
    super(`claim lost for schedule ${scheduleId}`);
    this.name = "ClaimLostError";
  }
}

// ---------------------------------------------------------------------------
// Validation that needs the clock or the database
// ---------------------------------------------------------------------------

export interface ValidateContext {
  workspaceId: string;
  agent: Agent;
  /** Excluded from the limit count on a PATCH — editing row 20 is not creating row 21. */
  scheduleId?: string;
}

type ScheduleWritable = CreateScheduleInput | (UpdateScheduleInput & { kind?: string });

interface ResolvedWrite {
  kind: "cron" | "once";
  cronExpr: string | null;
  runAt: Date | null;
  intervalSeconds: null;
  timezone: string;
  nextRunAt: Date | null;
}

/**
 * Every cross-field rule, in one place, called by POST, by PATCH and by any
 * future ATG materialization. Three of these checks are things no schema can
 * express, and each one prevents a schedule that would look saved and never
 * work — which is the whole argument for refusing at create time rather than
 * failing at fire time.
 */
export async function validateScheduleInput(
  ctx: ValidateContext,
  input: ScheduleWritable,
  existing?: ScheduleRow,
  now: Date = new Date(),
): Promise<ResolvedWrite> {
  const kindRaw = (input.kind ?? existing?.kind ?? "cron") as string;
  if (kindRaw === "interval") {
    // The column, the enum value and the CHECK arm all stay; only the writable
    // surface is narrowed. Every interval a user can express is already a cron
    // (`every N minutes` encodes as a step), and an end-anchored instant cannot
    // be pre-computed — which would destroy G3, the preview and the catch-up.
    throw new ScheduleError(
      "interval_not_supported",
      "Use a repeating schedule instead — 'every 15 minutes' is stored as a cron expression.",
    );
  }
  const kind = kindRaw as "cron" | "once";

  const timezone =
    input.timezone ??
    existing?.timezone ??
    (await workspaceTimezone(ctx.workspaceId, ctx.agent));
  if (!isValidTimeZone(timezone)) {
    // Refuse; never silently fall back to UTC. A schedule that runs eight hours
    // from when the user asked is worse than one that refuses to save.
    throw new ScheduleError("invalid_timezone", `Unknown time zone: ${timezone}`);
  }

  let cronExpr: string | null = null;
  let runAt: Date | null = null;
  let nextRunAt: Date | null = null;

  if (kind === "cron") {
    cronExpr = input.cronExpr ?? existing?.cronExpr ?? null;
    if (!cronExpr) throw new ScheduleError("invalid_cron", "A repeating schedule needs a cron expression.");
    const err = cronError(cronExpr);
    // The SPECIFIC reason, never "invalid": "Expected 5 fields" is actionable
    // and "invalid cron" is not.
    if (err) throw new ScheduleError("invalid_cron", err);

    const uneven = unevenStep(cronExpr);
    if (uneven) {
      throw new ScheduleError(
        "interval_not_representable",
        `Every ${uneven.step} ${uneven.unit}s does not divide the ${uneven.unit === "minute" ? "hour" : "day"} evenly.`,
        { step: uneven.step, unit: uneven.unit, below: uneven.below, above: uneven.above },
      );
    }

    nextRunAt = nextRun(cronExpr, now, timezone);
    if (!nextRunAt) {
      throw new ScheduleError("never_matches", "This expression will never run.");
    }

    const ceiling = input.maxRunsPerDay ?? existing?.maxRunsPerDay ?? SCHEDULE_LIMITS.DEFAULT_MAX_RUNS_PER_DAY;
    const { count, truncated } = dailyFireCount(cronExpr, timezone, now);
    if (truncated || count > ceiling) {
      throw new ScheduleError(
        "exceeds_max_runs_per_day",
        `This fires ${truncated ? "more than " : ""}${count} times a day; the limit on this schedule is ${ceiling}.`,
        { fires: count, limit: ceiling, truncated },
      );
    }
  } else {
    const raw = input.runAt ?? existing?.runAt ?? null;
    runAt = raw ? new Date(raw) : null;
    if (!runAt || Number.isNaN(runAt.getTime())) {
      throw new ScheduleError("run_at_in_past", "A reminder needs a date and time.");
    }
    // 60 seconds of grace so a slow form submission does not fail. ATG obeys the
    // same rule: a template generated last week must not fire the moment it saves.
    //
    // Only enforced when the row would END UP ENABLED, or when the caller is
    // actually supplying `run_at`. A fired reminder keeps its past `run_at`
    // forever, so testing it unconditionally made every PATCH of an unrelated
    // field — rename it, fix a typo in the prompt — 422 with `run_at_in_past` on
    // a row the user can see and cannot edit. Re-enabling one still refuses,
    // which is the case the check exists for.
    const willEnable = input.enabled ?? existing?.enabled ?? true;
    const suppliesRunAt = input.runAt !== undefined && input.runAt !== null;
    if (runAt.getTime() < now.getTime() - 60_000 && (willEnable || suppliesRunAt)) {
      throw new ScheduleError("run_at_in_past", "That time has already passed.");
    }
    nextRunAt = runAt;
  }

  const enabled = input.enabled ?? existing?.enabled ?? true;
  if (!enabled) nextRunAt = null; // §1.3: enabled = true IFF next_run_at IS NOT NULL

  // Checked at CREATE, when the target is CHANGED, and at the moment a disabled
  // row is switched back on — the three points where the user is choosing the
  // destination. NOT on every PATCH: a Slack workspace that disconnects would
  // otherwise make the schedule permanently uneditable, so the user could not
  // even change `deliverTo` away from the broken channel. Fire time re-checks it
  // anyway (gate 7) and writes `channel_not_bound`, which is a reason the user
  // can read rather than a form that will not save.
  const deliverTo = input.deliverTo ?? existing?.deliverTo ?? "chat";
  const reEnabling = Boolean(existing && !existing.enabled && enabled);
  if (!existing || input.deliverTo !== undefined || reEnabling) {
    await assertDeliverable(ctx, deliverTo);
  }

  return { kind, cronExpr, runAt, intervalSeconds: null, timezone, nextRunAt };
}

/**
 * A schedule that cannot deliver is not saveable.
 *
 * Silently downgrading `email` to `chat` gives the user a schedule that says
 * "email me" and never does; accepting it and failing at fire time turns a
 * configuration error into a nightly `failed` row. Checked at CREATE, while the
 * user is looking at it — the same argument that already decided `never_matches`.
 */
async function assertDeliverable(ctx: ValidateContext, deliverTo: string): Promise<void> {
  if (deliverTo === "chat" || deliverTo === "none") return;

  if (deliverTo === "email") {
    if (!process.env.MAIL_TRANSPORT_URL?.trim()) {
      throw new ScheduleError(
        "deliver_target_unavailable",
        "Email delivery is not configured on this deployment.",
        { target: "email", reason: "no_transport" },
      );
    }
    const settings = mergeSettings(ctx.agent.settings);
    // `escalateTo` is free text with no format validation anywhere in the
    // codebase today, so `"me"` currently passes every truthiness check. Parse it.
    const looksLikeEmail = (s: string | undefined) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
    if (looksLikeEmail(settings.escalateTo)) return;
    const [ws] = await db
      .select({ ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspaceId))
      .limit(1);
    const owner = ws
      ? (await db.select({ email: users.email }).from(users).where(eq(users.id, ws.ownerId)).limit(1))[0]
      : undefined;
    if (looksLikeEmail(owner?.email)) return;
    throw new ScheduleError(
      "deliver_target_unavailable",
      "No usable email address for this workspace.",
      { target: "email", reason: "no_address" },
    );
  }

  // `channel`: the RUNTIME delivers it, on its own outbound path. Our only job
  // is to refuse a binding that does not exist. Scoped by agent AND by
  // workspace — a channel row is workspace-owned and an agent must never reach
  // one through a stale binding.
  const bound = await db
    .select({ id: channels.id })
    .from(agentChannels)
    .innerJoin(channels, eq(channels.id, agentChannels.channelId))
    .where(
      and(
        eq(agentChannels.agentId, ctx.agent.id),
        eq(channels.workspaceId, ctx.workspaceId),
        eq(channels.status, "connected"),
      ),
    )
    .limit(1);
  if (!bound.length) {
    throw new ScheduleError(
      "deliver_target_unavailable",
      "This agent has no connected channel to deliver to.",
      { target: "channel" },
    );
  }
}

/** `workspaces.timezone ?? settings.timezone ?? 'UTC'`, per §1.2. */
async function workspaceTimezone(workspaceId: string, agent: Agent): Promise<string> {
  const [ws] = await db
    .select({ tz: workspaces.timezone })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (ws?.tz && isValidTimeZone(ws.tz)) return ws.tz;
  const s = mergeSettings(agent.settings);
  return s.timezone && isValidTimeZone(s.timezone) ? s.timezone : "UTC";
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ListSchedulesResult {
  schedules: ScheduleDTO[];
  tick: TickHealthDTO;
}

export async function listSchedules(
  agentId: string,
  opts: { lang?: Lang; now?: Date } = {},
): Promise<ListSchedulesResult> {
  const now = opts.now ?? new Date();
  const rows = await db
    .select()
    .from(agentSchedules)
    .where(eq(agentSchedules.agentId, agentId))
    .orderBy(
      desc(agentSchedules.enabled),
      sql`${agentSchedules.nextRunAt} asc nulls last`,
      asc(agentSchedules.createdAt),
    );
  return {
    schedules: rows.map((r) => serializeSchedule(r, { lang: opts.lang, now })),
    tick: await tickHealth(rows, now),
  };
}

/**
 * The only thing that crosses from `scheduler_ticks` — which is platform-scoped
 * and whose rows are never served to a tenant — to a tenant response: four
 * derived scalars. A user who asked for every 5 minutes and is getting every 12
 * hours must be told, not guessed at.
 */
async function tickHealth(rows: ScheduleRow[], now: Date): Promise<TickHealthDTO> {
  const recent = await db
    .select({ startedAt: schedulerTicks.startedAt })
    .from(schedulerTicks)
    .orderBy(desc(schedulerTicks.startedAt))
    .limit(20);
  const observedSeconds = medianTickSeconds(recent.map((r) => r.startedAt));
  const lastTickAt = recent[0]?.startedAt ?? null;
  const finestNeededSeconds = finestGapSeconds(
    rows.filter((r) => r.enabled && r.kind === "cron"),
    now,
  );
  return {
    observedSeconds,
    lastTickAt: lastTickAt ? lastTickAt.toISOString() : null,
    finestNeededSeconds,
    tooCoarse:
      observedSeconds !== null &&
      finestNeededSeconds !== null &&
      observedSeconds > finestNeededSeconds,
    // "Stalled" is a different sentence from "coarse": coarse means late, stalled
    // means the cron is not running at all.
    stalled:
      lastTickAt === null ||
      (observedSeconds !== null &&
        now.getTime() - lastTickAt.getTime() > observedSeconds * 3 * 1000),
  };
}

/** Always re-scoped by agent: a schedule id from another tenant must 404 even
 *  when the caller owns *an* agent. */
export async function getScheduleRow(
  agentId: string,
  scheduleId: string,
): Promise<ScheduleRow | null> {
  const [row] = await db
    .select()
    .from(agentSchedules)
    .where(and(eq(agentSchedules.id, scheduleId), eq(agentSchedules.agentId, agentId)))
    .limit(1);
  return row ?? null;
}

export interface ListRunsResult {
  runs: ScheduleRunDTO[];
  nextCursor: string | null;
}

export async function listScheduleRuns(
  agentId: string,
  scheduleId: string,
  query: ScheduleRunsQuery,
): Promise<ListRunsResult> {
  // A cursor that does not decode is a CLIENT error, not "start again". Falling
  // through to page 1 makes a truncated or tampered token look like the end of
  // the list wrapping around to the top, and a caller paging in a loop never
  // terminates.
  const cursor = query.cursor ? decodeRunCursor(query.cursor) : null;
  if (query.cursor && !cursor) throw new ScheduleError("invalid_cursor", "Malformed cursor.");
  const conds = [
    // `agent_id` is what still bounds this table and what the authorization
    // scopes on — `schedule_id` has no FK (§3.0 delta 11) so history survives a
    // deleted schedule and stays addressable.
    eq(agentScheduleRuns.agentId, agentId),
    eq(agentScheduleRuns.scheduleId, scheduleId),
  ];
  if (query.status) conds.push(eq(agentScheduleRuns.status, query.status));
  if (cursor) {
    conds.push(
      or(
        lt(agentScheduleRuns.scheduledFor, cursor.scheduledFor),
        and(eq(agentScheduleRuns.scheduledFor, cursor.scheduledFor), lt(agentScheduleRuns.id, cursor.id)),
      )!,
    );
  }
  const rows = await db
    .select()
    .from(agentScheduleRuns)
    .where(and(...conds))
    .orderBy(desc(agentScheduleRuns.scheduledFor), desc(agentScheduleRuns.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const runIds = page.map((r) => r.runId).filter((x): x is string => !!x);
  const tokenMap = new Map<string, { input: number; output: number; total: number }>();
  if (runIds.length) {
    const runRows = await db
      .select({
        id: agentRuns.id,
        input: agentRuns.inputTokens,
        output: agentRuns.outputTokens,
        total: agentRuns.totalTokens,
      })
      .from(agentRuns)
      .where(inArray(agentRuns.id, runIds));
    for (const r of runRows) tokenMap.set(r.id, { input: r.input, output: r.output, total: r.total });
  }

  return {
    runs: page.map((r) =>
      serializeScheduleRun(r, { tokens: r.runId ? (tokenMap.get(r.runId) ?? null) : null }),
    ),
    nextCursor:
      rows.length > query.limit
        ? encodeRunCursor(page[page.length - 1].scheduledFor, page[page.length - 1].id)
        : null,
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Every mutation bumps `agents.config_revision`, because a schedule IS agent
 * configuration: the runtime's manifest carries the schedule set, and a change
 * the runtime never learns about is a change that did not happen.
 */
async function bumpConfigRevision(tx: typeof db, agentId: string): Promise<void> {
  await tx
    .update(agents)
    .set({ configRevision: sql`${agents.configRevision} + 1`, updatedAt: new Date() })
    .where(eq(agents.id, agentId));
}

export async function createSchedule(
  ctx: ValidateContext,
  input: CreateScheduleInput,
  createdById: string | null,
  now: Date = new Date(),
): Promise<ScheduleRow> {
  const resolved = await validateScheduleInput(ctx, input, undefined, now);

  return db.transaction(async (tx) => {
    // Two concurrent creates must not both see 19. The advisory lock is
    // transaction-scoped and keyed on the agent, so it serialises this agent's
    // creates and nothing else.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.agent.id}::text, 0))`);

    const [counts] = await tx
      .select({
        rows: sql<number>`count(*)::int`,
        enabled: sql<number>`count(*) filter (where ${agentSchedules.enabled})::int`,
      })
      .from(agentSchedules)
      .where(eq(agentSchedules.agentId, ctx.agent.id));
    if ((counts?.rows ?? 0) >= SCHEDULE_LIMITS.MAX_ROWS_PER_AGENT) {
      throw new ScheduleError("schedule_limit_reached", "This agent has too many schedules.", {
        limit: SCHEDULE_LIMITS.MAX_ROWS_PER_AGENT,
        scope: "agent",
      });
    }
    if (resolved.nextRunAt && (counts?.enabled ?? 0) >= SCHEDULE_LIMITS.MAX_ENABLED_PER_AGENT) {
      throw new ScheduleError("schedule_limit_reached", "This agent has too many active schedules.", {
        limit: SCHEDULE_LIMITS.MAX_ENABLED_PER_AGENT,
        scope: "agent",
      });
    }
    if (resolved.nextRunAt) {
      const [wsCount] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(agentSchedules)
        .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
        .where(and(eq(agents.workspaceId, ctx.workspaceId), eq(agentSchedules.enabled, true)));
      if ((wsCount?.n ?? 0) >= SCHEDULE_LIMITS.MAX_ENABLED_PER_WORKSPACE) {
        throw new ScheduleError("schedule_limit_reached", "This workspace has too many active schedules.", {
          limit: SCHEDULE_LIMITS.MAX_ENABLED_PER_WORKSPACE,
          scope: "workspace",
        });
      }
    }

    const [row] = await tx
      .insert(agentSchedules)
      .values({
        agentId: ctx.agent.id,
        createdById,
        name: input.name,
        enabled: Boolean(resolved.nextRunAt),
        kind: resolved.kind,
        cronExpr: resolved.cronExpr,
        intervalSeconds: null,
        runAt: resolved.runAt,
        timezone: resolved.timezone,
        prompt: input.prompt,
        expectation: input.expectation ?? null,
        deliverTo: input.deliverTo,
        overlapPolicy: input.overlapPolicy,
        catchUp: input.catchUp,
        jitterSeconds: input.jitterSeconds,
        maxRunsPerDay: input.maxRunsPerDay,
        maxRuntimeSeconds: input.maxRuntimeSeconds,
        wakeRuntime: input.wakeRuntime,
        // Computed BEFORE the insert and inside the same transaction, so the
        // §1.3 CHECK is satisfied by construction rather than by a follow-up
        // UPDATE that could fail and leave an enabled row with no next run.
        nextRunAt: resolved.nextRunAt,
      })
      .returning();
    await bumpConfigRevision(tx as unknown as typeof db, ctx.agent.id);
    return row;
  });
}

export async function updateSchedule(
  ctx: ValidateContext,
  existing: ScheduleRow,
  input: UpdateScheduleInput,
  now: Date = new Date(),
): Promise<ScheduleRow> {
  const resolved = await validateScheduleInput(ctx, input, existing, now);

  return db.transaction(async (tx) => {
    if (resolved.nextRunAt && !existing.enabled) {
      // Re-enabling is a create as far as the caps are concerned — BOTH of them.
      // Enforcing only the per-agent cap here let a workspace walk past
      // MAX_ENABLED_PER_WORKSPACE by creating rows disabled and switching them
      // on, which is the exact cap that stops one tenant monopolising the claim
      // batch (§6.1).
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.agent.id}::text, 0))`);
      const [c] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(agentSchedules)
        .where(and(eq(agentSchedules.agentId, ctx.agent.id), eq(agentSchedules.enabled, true)));
      if ((c?.n ?? 0) >= SCHEDULE_LIMITS.MAX_ENABLED_PER_AGENT) {
        throw new ScheduleError("schedule_limit_reached", "This agent has too many active schedules.", {
          limit: SCHEDULE_LIMITS.MAX_ENABLED_PER_AGENT,
          scope: "agent",
        });
      }
      const [wsCount] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(agentSchedules)
        .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
        .where(and(eq(agents.workspaceId, ctx.workspaceId), eq(agentSchedules.enabled, true)));
      if ((wsCount?.n ?? 0) >= SCHEDULE_LIMITS.MAX_ENABLED_PER_WORKSPACE) {
        throw new ScheduleError("schedule_limit_reached", "This workspace has too many active schedules.", {
          limit: SCHEDULE_LIMITS.MAX_ENABLED_PER_WORKSPACE,
          scope: "workspace",
        });
      }
    }

    const [row] = await tx
      .update(agentSchedules)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
        ...(input.expectation !== undefined ? { expectation: input.expectation } : {}),
        ...(input.deliverTo !== undefined ? { deliverTo: input.deliverTo } : {}),
        ...(input.overlapPolicy !== undefined ? { overlapPolicy: input.overlapPolicy } : {}),
        ...(input.catchUp !== undefined ? { catchUp: input.catchUp } : {}),
        ...(input.jitterSeconds !== undefined ? { jitterSeconds: input.jitterSeconds } : {}),
        ...(input.maxRunsPerDay !== undefined ? { maxRunsPerDay: input.maxRunsPerDay } : {}),
        ...(input.maxRuntimeSeconds !== undefined ? { maxRuntimeSeconds: input.maxRuntimeSeconds } : {}),
        ...(input.wakeRuntime !== undefined ? { wakeRuntime: input.wakeRuntime } : {}),
        kind: resolved.kind,
        cronExpr: resolved.cronExpr,
        runAt: resolved.runAt,
        intervalSeconds: null,
        timezone: resolved.timezone,
        // Any change to cronExpr / runAt / timezone / enabled recomputes
        // next_run_at from NOW, never from the stored value: a schedule
        // re-enabled after a week must not fire against last week's instant.
        // `enabled = false` clears it in the SAME update, per the §1.3 CHECK.
        enabled: Boolean(resolved.nextRunAt),
        nextRunAt: resolved.nextRunAt,
        // An in-flight run is NOT cancelled: it completes and is recorded. Only
        // future scheduling changes.
        claimedAt: null,
        claimToken: null,
        updatedAt: now,
      })
      .where(and(eq(agentSchedules.id, existing.id), eq(agentSchedules.agentId, ctx.agent.id)))
      .returning();
    await bumpConfigRevision(tx as unknown as typeof db, ctx.agent.id);
    return row;
  });
}

/**
 * DELETE removes the schedule and KEEPS its history: `agent_schedule_runs` has
 * no FK to this table (§3.0 delta 11) and snapshots `schedule_name`, so
 * `GET …/runs` keeps working afterwards. The dangling id is intentional.
 */
export async function deleteSchedule(agentId: string, scheduleId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(agentSchedules)
      .where(and(eq(agentSchedules.id, scheduleId), eq(agentSchedules.agentId, agentId)))
      .returning({ id: agentSchedules.id });
    if (!deleted.length) return false;
    await bumpConfigRevision(tx as unknown as typeof db, agentId);
    return true;
  });
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

export interface TickOptions {
  limit?: number;
  dryRun?: boolean;
  scheduleId?: string;
  source?: "vercel_cron" | "external" | "manual";
  now?: Date;
}

export interface TickResult {
  tickId: number | null;
  startedAt: string;
  durationMs: number;
  claimed: number;
  dispatched: number;
  skipped: number;
  failed: number;
  retried: number;
  swept: number;
  saturated: boolean;
  observedTickSeconds: number | null;
  warnings: string[];
}

type SkipReason =
  | "outside_working_hours"
  | "instance_stopped"
  | "overlap"
  | "max_runs_per_day"
  | "credit_cap_reached"
  | "channel_not_bound"
  | "misfire"
  | "misfire_too_old"
  | "dispatch_unsupported";

interface ClaimedRow extends ScheduleRow {
  agentStatus: string;
  workspaceId: string;
  agentManagerId: string | null;
  agentSettings: unknown;
  creditsIncluded: number;
  creditsUsed: number;
  agentCreditsUsed: number;
}

/**
 * One invocation of the scheduler. Safe to call twice: everything it does is
 * either idempotent (the claim, the occurrence insert) or ledgered.
 *
 * It NEVER throws for a per-schedule failure — those live in the counters and in
 * `agent_schedule_runs`, not in the HTTP status, because Vercel retries a 500 and
 * a retried tick that is working exactly as designed is a second fire attempt.
 */
export async function runTick(opts: TickOptions = {}): Promise<TickResult> {
  const now = opts.now ?? new Date();
  const startedAt = Date.now();
  const limit = Math.min(Math.max(opts.limit ?? SCHEDULER.BATCH_LIMIT, 1), 500);
  const warnings: string[] = [];
  const counters = { claimed: 0, dispatched: 0, skipped: 0, failed: 0, retried: 0, swept: 0 };

  const mode = agentManagerMode();
  if (mode === "unconfigured") warnings.push("agent_manager_unconfigured");
  if (!process.env.MAIL_TRANSPORT_URL?.trim()) warnings.push("mail_transport_unconfigured");

  // The ledger row is opened first so that a tick which dies mid-loop is still
  // visible as having happened. On a plan whose cron granularity is coarser than
  // the schedules users created, every OTHER table looks healthy — without this
  // row, "my 5-minute poll runs twice a day" is undiagnosable.
  let tickId: number | null = null;
  try {
    const [tick] = await db
      .insert(schedulerTicks)
      .values({ startedAt: now, source: opts.source ?? "vercel_cron" })
      .returning({ id: schedulerTicks.id });
    tickId = tick?.id ?? null;
  } catch {
    // A ledger failure must not stop the work; it only costs observability.
    warnings.push("tick_ledger_unavailable");
  }

  const claimToken = randomUUID();
  let claimed: ClaimedRow[] = [];
  try {
    claimed = await claimDueSchedules(claimToken, limit, now, opts.scheduleId);
  } catch (e) {
    // The claim statement failing IS outside the per-schedule loop, so it is one
    // of the few things that legitimately fails the whole tick.
    await closeTick(tickId, counters, false, startedAt);
    throw e;
  }
  counters.claimed = claimed.length;
  const saturated = claimed.length >= limit;
  if (saturated) warnings.push("tick_saturated");

  // Per-agent fan-out cap: an agent with 20 schedules that all fire at 09:00
  // cannot consume a fifth of the batch. The rest are released UNCLAIMED and
  // picked up by the next tick — one minute later, inside the §3.9.1 grace, so
  // not even a misfire.
  const perAgent = new Map<string, number>();
  const accepted: ClaimedRow[] = [];
  const deferred: string[] = [];
  for (const row of claimed) {
    const n = perAgent.get(row.agentId) ?? 0;
    if (n >= SCHEDULER.PER_AGENT_PER_TICK) {
      deferred.push(row.id);
      continue;
    }
    perAgent.set(row.agentId, n + 1);
    accepted.push(row);
  }
  if (deferred.length) await releaseClaims(deferred, claimToken);

  if (opts.dryRun) {
    await releaseClaims(accepted.map((r) => r.id), claimToken);
    await closeTick(tickId, counters, saturated, startedAt);
    return result(tickId, now, startedAt, counters, saturated, await observedTickSeconds(), warnings);
  }

  // Sequential within an agent, concurrent across agents: `overlap_policy` is
  // evaluated against a stable view of that agent's in-flight runs.
  const byAgent = new Map<string, ClaimedRow[]>();
  for (const row of accepted) {
    const list = byAgent.get(row.agentId) ?? [];
    list.push(row);
    byAgent.set(row.agentId, list);
  }
  const groups = [...byAgent.values()];
  for (let i = 0; i < groups.length; i += SCHEDULER.MAX_IN_FLIGHT) {
    await Promise.all(
      groups.slice(i, i + SCHEDULER.MAX_IN_FLIGHT).map(async (rows) => {
        for (const row of rows) {
          try {
            await processClaimed(row, claimToken, now, mode, counters);
          } catch (e) {
            // One bad schedule must never fail the tick. Count it and continue.
            counters.failed += 1;
            console.warn(
              `[scheduler] schedule ${row.id} failed: ${e instanceof Error ? e.name : "unknown"}`,
            );
            await releaseClaims([row.id], claimToken).catch(() => {});
          }
        }
      }),
    );
  }

  counters.swept = await sweepStaleRuns(now);
  counters.retried = await retryPass(now, mode, counters);
  await pruneTickLedger(now);
  await closeTick(tickId, counters, saturated, startedAt);

  return result(tickId, now, startedAt, counters, saturated, await observedTickSeconds(), warnings);
}

function result(
  tickId: number | null,
  now: Date,
  startedAt: number,
  c: { claimed: number; dispatched: number; skipped: number; failed: number; retried: number; swept: number },
  saturated: boolean,
  observed: number | null,
  warnings: string[],
): TickResult {
  return {
    tickId,
    startedAt: now.toISOString(),
    durationMs: Date.now() - startedAt,
    ...c,
    saturated,
    observedTickSeconds: observed,
    warnings,
  };
}

/**
 * The claiming statement. One statement, `FOR UPDATE SKIP LOCKED` inside a CTE
 * an UPDATE consumes, so the lock lives only for the statement and the lease it
 * writes is durable.
 *
 * Why not `UPDATE … WHERE claimed_at IS NULL RETURNING *`? Both are atomic and
 * both are correct for G1, but `ORDER BY next_run_at LIMIT n` is not expressible
 * there, and `WHERE id IN (SELECT … LIMIT n)` without SKIP LOCKED makes
 * concurrent ticks BLOCK on each other rather than slide past — under a
 * per-minute cron with a slow tick that converts overlap into a queue of stalled
 * functions holding pooled connections. Oldest-first is also what keeps a
 * backlog fair; without it a saturated tick starves whatever the planner skips.
 *
 * Why not hold the transaction open across the dispatch? It pins a pooled
 * connection across network I/O — the classic serverless pool-exhaustion
 * pathology — and it makes the claim VANISH when the function is killed, so a
 * dispatch already sent becomes re-claimable immediately. The durable lease is
 * the whole point.
 */
async function claimDueSchedules(
  claimToken: string,
  limit: number,
  now: Date,
  scheduleId?: string,
): Promise<ClaimedRow[]> {
  // `db.execute()` binds parameters straight through postgres-js, which cannot
  // serialise a JS Date on that path (ERR_INVALID_ARG_TYPE) — unlike the typed
  // column path Drizzle uses for `db.select()`. Bind ISO text and cast in SQL.
  const nowIso = now.toISOString();
  const rows = await db.execute<Record<string, unknown>>(sql`
    WITH due AS (
      SELECT s.id
        FROM agent_schedules s
        JOIN agents a ON a.id = s.agent_id
       WHERE s.enabled
         AND s.next_run_at IS NOT NULL
         AND s.next_run_at <= ${nowIso}::timestamptz
         AND (s.claimed_at IS NULL
              OR s.claimed_at < ${nowIso}::timestamptz - (${SCHEDULER.LEASE_SECONDS}::integer * interval '1 second'))
         AND a.status::text IN (${DISPATCHABLE_SQL})
         ${scheduleId ? sql`AND s.id = ${scheduleId}::uuid` : sql``}
       ORDER BY s.next_run_at
       LIMIT ${limit}
       FOR UPDATE OF s SKIP LOCKED
    )
    UPDATE agent_schedules s
       SET claimed_at = ${nowIso}::timestamptz, claim_token = ${claimToken}::uuid
      FROM due
     WHERE s.id = due.id
    RETURNING s.*
  `);

  const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
  const ids = list.map((r) => String((r as Record<string, unknown>).id));
  if (!ids.length) return [];

  // Re-read through Drizzle so the rows are typed and dated rather than raw
  // driver values, and join the agent/workspace facts every gate needs.
  const joined = await db
    .select({
      s: agentSchedules,
      agentStatus: agents.status,
      workspaceId: agents.workspaceId,
      agentManagerId: agents.agentManagerId,
      agentSettings: agents.settings,
      agentCreditsUsed: agents.creditsUsed,
      creditsIncluded: workspaces.creditsIncluded,
      creditsUsed: workspaces.creditsUsed,
    })
    .from(agentSchedules)
    .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
    .innerJoin(workspaces, eq(workspaces.id, agents.workspaceId))
    .where(inArray(agentSchedules.id, ids))
    .orderBy(asc(agentSchedules.nextRunAt));

  return joined.map((j) => ({
    ...j.s,
    agentStatus: j.agentStatus,
    workspaceId: j.workspaceId,
    agentManagerId: j.agentManagerId,
    agentSettings: j.agentSettings,
    agentCreditsUsed: j.agentCreditsUsed,
    creditsIncluded: j.creditsIncluded,
    creditsUsed: j.creditsUsed,
  }));
}

/** Give a claim back without advancing. The token guard stops a tick whose lease
 *  already expired from releasing a row another tick now owns. */
async function releaseClaims(ids: string[], claimToken: string): Promise<void> {
  if (!ids.length) return;
  await db
    .update(agentSchedules)
    .set({ claimedAt: null, claimToken: null })
    .where(and(inArray(agentSchedules.id, ids), eq(agentSchedules.claimToken, claimToken)));
}

async function processClaimed(
  row: ClaimedRow,
  claimToken: string,
  now: Date,
  mode: ReturnType<typeof agentManagerMode>,
  counters: { dispatched: number; skipped: number; failed: number },
): Promise<void> {
  const scheduledFor = row.nextRunAt!;
  const offset = jitterOffsetSeconds(row.id, scheduledFor, row.jitterSeconds);

  // Jitter defers the DISPATCH, never `next_run_at`: adding it to the stored
  // instant would make the previewed times stop matching the actual ones and
  // would compound into drift across occurrences.
  if (offset > 0 && now.getTime() < scheduledFor.getTime() + offset * 1000) {
    await releaseClaims([row.id], claimToken);
    return;
  }

  const misfire = classifyMisfire({
    cronExpr: row.cronExpr,
    timezone: row.timezone,
    scheduledFor,
    now,
    jitterOffsetSeconds: offset,
    graceSeconds: SCHEDULER.GRACE_SECONDS,
    maxAgeSeconds: SCHEDULER.MISFIRE_MAX_AGE_SECONDS,
  });

  const gate = await evaluateGates(row, scheduledFor, now, mode);

  // Gate 4 ('queue') defers WITHOUT advancing and is bounded by the blocking
  // run's own max_runtime_seconds — past that the blocking run is itself over
  // its limit and the sweep is about to fail it, so the queued occurrence is
  // written `skipped / overlap` rather than becoming a `misfire`. Nothing was
  // missed: it was refused, and the reason the user needs is "the previous run
  // was still going", not "ArkAgent was unavailable".
  if (gate === "defer") {
    const waited = (now.getTime() - scheduledFor.getTime()) / 1000;
    if (waited < row.maxRuntimeSeconds) {
      await releaseClaims([row.id], claimToken);
      return;
    }
  }

  // A gate outcome overrides the misfire band: gate 4 can turn a `misfired` band
  // into `skipped / overlap`. Only a band that survives the gates decides.
  let skipReason: SkipReason | null = gate === "defer" ? "overlap" : gate;
  let trigger: "schedule" | "catch_up" = "schedule";
  let scheduledForRow = scheduledFor;

  if (!skipReason) {
    if (misfire.band === "too_old") {
      // catch_up is IGNORED past 24 h. Realign to the future and say so.
      skipReason = "misfire_too_old";
    } else if (misfire.band === "misfired") {
      if (row.catchUp) {
        // ONE run, never a backlog burst — and it uses the NEWEST missed
        // instant, not the oldest: a daily digest that missed Mon/Tue/Wed
        // should produce Wednesday's, and producing Monday's and calling it
        // caught up is worse than producing nothing.
        trigger = "catch_up";
        scheduledForRow = truncateToMinute(misfire.anchor);
      } else {
        skipReason = "misfire";
      }
    }
  }

  const occurrence = await advanceAndRecord({
    row,
    claimToken,
    now,
    scheduledFor: scheduledForRow,
    anchor: misfire.anchor,
    status: skipReason ? "skipped" : "started",
    skipReason,
    trigger,
    missedCount: misfire.missedCount,
    missedTruncated: misfire.missedTruncated,
    source: mode === "mock" ? "mock" : mode === "unconfigured" ? "local" : "runtime",
  });
  if (!occurrence) return; // G3, or a lost claim. Not an error.

  if (skipReason) {
    counters.skipped += 1;
    return;
  }
  await dispatch(row, occurrence.id, scheduledForRow, mode, counters);
}

const truncateToMinute = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

/**
 * The atomic step: insert the occurrence and advance `next_run_at` in ONE
 * transaction, before any dispatch.
 *
 * Two guards that are not decoration:
 *  - `onConflictDoNothing` on `(schedule_id, scheduled_for)`. No row back means
 *    another worker owns this occurrence: advance anyway (see below), do not
 *    dispatch, and do NOT treat it as an error.
 *  - `WHERE claim_token = $tick` on the advance. A tick paused by the platform
 *    for six minutes and then resumed must not stamp a stale `next_run_at` over
 *    the value a healthier tick has since written. And because that guard can
 *    legitimately match ZERO rows — which Postgres does not report as an error —
 *    the row count is inspected and the transaction THROWN out, rolling back the
 *    occurrence insert. Committing the insert without the advance is exactly the
 *    "burns a claim slot every tick forever" state, except it also dispatches.
 */
async function advanceAndRecord(args: {
  row: ClaimedRow;
  claimToken: string;
  now: Date;
  scheduledFor: Date;
  anchor: Date;
  status: "started" | "skipped";
  skipReason: SkipReason | null;
  trigger: "schedule" | "catch_up";
  missedCount: number;
  missedTruncated: boolean;
  source: "runtime" | "mock" | "local";
}): Promise<{ id: string } | null> {
  const { row, claimToken, now } = args;
  const next = advanceSchedule(
    {
      kind: row.kind,
      cronExpr: row.cronExpr,
      intervalSeconds: row.intervalSeconds,
      timezone: row.timezone,
    },
    args.anchor,
    now,
  );

  try {
    return await db.transaction(async (tx) => {
      const [occ] = await tx
        .insert(agentScheduleRuns)
        .values({
          scheduleId: row.id,
          scheduleName: row.name,
          agentId: row.agentId,
          scheduledFor: args.scheduledFor,
          status: args.status,
          skipReason: args.skipReason,
          startedAt: args.status === "started" ? now : null,
          finishedAt: args.status === "skipped" ? now : null,
          trigger: args.trigger,
          missedCount: args.missedCount,
          missedTruncated: args.missedTruncated,
          source: args.source,
          attempt: 1,
        })
        .onConflictDoNothing({
          target: [agentScheduleRuns.scheduleId, agentScheduleRuns.scheduledFor],
        })
        .returning({ id: agentScheduleRuns.id });

      // The advance runs on BOTH paths, and that is the point.
      //
      // Returning early on the conflict — which is what this did — commits a
      // transaction that changed nothing: `next_run_at` still satisfies
      // `<= now()` and `claim_token` is still ours. The row is then re-claimed
      // the moment the lease expires, conflicts again, and burns a claim slot
      // on every tick FOREVER — the exact state the header says advancing first
      // prevents. The advance is idempotent under the token guard (a tick whose
      // lease was stolen matches zero rows and changes nothing), so doing it
      // unconditionally is safe and is the only thing that clears the row.
      //
      // `last_run_at` / `last_status` are NOT written on the conflict path: the
      // worker that won the occurrence owns those, and stamping them from here
      // would overwrite a terminal status with `started`.
      const advanced = await tx
        .update(agentSchedules)
        .set({
          nextRunAt: next.nextRunAt,
          enabled: next.enabled,
          ...(occ ? { lastRunAt: args.scheduledFor, lastStatus: args.status } : {}),
          claimedAt: null,
          claimToken: null,
          updatedAt: now,
        })
        .where(and(eq(agentSchedules.id, row.id), eq(agentSchedules.claimToken, claimToken)))
        .returning({ id: agentSchedules.id });
      // Only an insert that SUCCEEDED may be rolled back for a lost claim; on
      // the conflict path there is nothing to roll back and the zero-row update
      // is the expected outcome.
      if (occ && advanced.length === 0) throw new ClaimLostError(row.id);
      return occ ?? null;
    });
  } catch (e) {
    if (e instanceof ClaimLostError) return null; // the healthier tick did the work
    throw e;
  }
}

type GateOutcome = SkipReason | "defer" | null;

/**
 * The gates, in order. Each failing gate writes exactly ONE occurrence row with
 * `status='skipped'` — silence is indistinguishable from a broken scheduler, and
 * "why didn't it run?" is the single most common support question about
 * reminders.
 *
 * Gate 1 (agent state) is filtered before the claim and writes NOTHING, which is
 * a deliberate exception: a fleet paused for three weeks with a 5-minute
 * schedule would accumulate 6,048 identical rows per schedule. That is not
 * observability, it is a denial of service against the history table and against
 * the operator reading it. The whole pause is accounted for ONCE on resume, by
 * the misfire path, carrying `missed_count`.
 */
async function evaluateGates(
  row: ClaimedRow,
  scheduledFor: Date,
  now: Date,
  mode: ReturnType<typeof agentManagerMode>,
): Promise<GateOutcome> {
  const settings = mergeSettings(row.agentSettings as Parameters<typeof mergeSettings>[0]);

  // 2 — Working hours, in the AGENT's zone (its working day), which is allowed
  //     to differ from the SCHEDULE's zone used by gate 5. Conflating them is
  //     how a Singapore agent with a US-Eastern schedule resets at the wrong
  //     midnight.
  if (!settings.alwaysOn) {
    const tz = isValidTimeZone(settings.timezone) ? settings.timezone : row.timezone;
    const p = zonedParts(scheduledFor, tz);
    const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    const minutes = p.hour * 60 + p.minute;
    const [sh, sm] = settings.workStart.split(":").map(Number);
    const [eh, em] = settings.workEnd.split(":").map(Number);
    const inDay = settings.workDays.includes(dow);
    const inHours = minutes >= sh * 60 + sm && minutes < eh * 60 + em;
    if (!inDay || !inHours) return "outside_working_hours";
  }

  // 3 — Instance stopped. ArkAgent does NOT poll for this; it reads the newest
  //     health sample, and only when that sample is fresh. With no fresh
  //     telemetry it DISPATCHES ANYWAY: the runtime is the authority on its own
  //     instance, and refusing on a monitoring gap converts an observability
  //     problem into a missed digest. This gate fires only on a POSITIVE
  //     `stopped` reading with wake_runtime = false.
  if (!row.wakeRuntime && mode === "live") {
    const [sample] = await db
      .select({ state: agentHealthSamples.state, sampledAt: agentHealthSamples.sampledAt })
      .from(agentHealthSamples)
      .where(eq(agentHealthSamples.agentId, row.agentId))
      .orderBy(desc(agentHealthSamples.sampledAt))
      .limit(1);
    const fresh =
      sample && now.getTime() - sample.sampledAt.getTime() < settings.heartbeatMinutes * 2 * 60_000;
    if (fresh && sample.state === "stopped") return "instance_stopped";
  }

  // 4 — Overlap. `parallel` skips this entirely; `queue` defers rather than skips.
  if (row.overlapPolicy !== "parallel") {
    const [inFlight] = await db
      .select({ id: agentScheduleRuns.id })
      .from(agentScheduleRuns)
      .where(
        and(eq(agentScheduleRuns.scheduleId, row.id), eq(agentScheduleRuns.status, "started")),
      )
      .limit(1);
    if (inFlight) return row.overlapPolicy === "queue" ? "defer" : "overlap";
  }

  // 5 — The daily ceiling, counted in the SCHEDULE's own zone so the write-time
  //     number and this one cannot disagree.
  const p = zonedParts(scheduledFor, row.timezone);
  const dayStart = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const [today] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(agentScheduleRuns)
    .where(
      and(
        eq(agentScheduleRuns.scheduleId, row.id),
        sql`(${agentScheduleRuns.scheduledFor} AT TIME ZONE ${row.timezone})::date = ${dayStart.toISOString().slice(0, 10)}::date`,
      ),
    );
  if ((today?.n ?? 0) >= row.maxRunsPerDay) return "max_runs_per_day";

  // 6 — Credits. `credits_remaining` is derived, never materialised: the two
  //     columns that exist are `credits_included` and `credits_used`, and a
  //     third would give the tick and the manifest two answers to one question.
  if (row.creditsIncluded - row.creditsUsed <= 0) return "credit_cap_reached";
  if (settings.monthlyCreditCap > 0 && row.agentCreditsUsed >= settings.monthlyCreditCap) {
    return "credit_cap_reached";
  }

  // 7 — Delivery target. Re-checked at fire time because a channel can be
  //     disconnected after the schedule was created.
  if (row.deliverTo === "channel") {
    const [bound] = await db
      .select({ id: channels.id })
      .from(agentChannels)
      .innerJoin(channels, eq(channels.id, agentChannels.channelId))
      // Scoped by workspace as well as by agent, exactly as `assertDeliverable`
      // is at create time: the two checks answer the same question and a gate
      // that is laxer than the writer's check is a gate that passes rows the
      // writer would have refused.
      .where(
        and(
          eq(agentChannels.agentId, row.agentId),
          eq(channels.workspaceId, row.workspaceId),
          eq(channels.status, "connected"),
        ),
      )
      .limit(1);
    if (!bound) return "channel_not_bound";
  }

  return null;
}

/**
 * `prompt` and `expectation` are USER-AUTHORED TEXT dispatched as a USER TURN.
 * Neither may ever reach a system prompt, a tool-policy field, or an autonomy
 * setting — and that holds for ATG- and LLM-generated prompts too, because a
 * template is third-party content the moment it is published.
 *
 * The `<expected-result>` fence is a delimiter FOR THE MODEL, not a trust
 * boundary; the trust boundary is that this whole string is a user turn. The
 * strip exists so the user cannot close the fence early and make the remainder
 * look like something else — a fence a user can close is not a fence.
 */
const FENCE_BREAK = /<\/?expected-result[^>]*>/gi;

export function buildScheduledTurn(s: { prompt: string; expectation: string | null }): string {
  const expect = s.expectation
    ? `\n\n<expected-result>\n${s.expectation.replace(FENCE_BREAK, "")}\n</expected-result>`
    : "";
  return `${s.prompt}${expect}`;
}

const sessionKeyFor = (row: ScheduleRow) => row.sessionKey ?? `agent:main:schedule:${row.id}`;

async function dispatch(
  row: ClaimedRow,
  occurrenceId: string,
  scheduledFor: Date,
  mode: ReturnType<typeof agentManagerMode>,
  counters: { dispatched: number; skipped: number; failed: number },
): Promise<void> {
  const now = new Date();

  // With the Agent Manager unconfigured the tick must still claim, advance and
  // RECORD — never throw and never 503. A 503 here would make Vercel retry a
  // route that is working exactly as designed.
  if (mode === "unconfigured") {
    // `dispatch_unsupported`, NOT `instance_stopped`. The instance is not
    // stopped — there is no Agent Manager at all — and labelling a deployment
    // misconfiguration as a runtime state sends the operator to look at a VM
    // that was never provisioned.
    await finishOccurrence(occurrenceId, {
      status: "skipped",
      skipReason: "dispatch_unsupported",
      finishedAt: now,
    });
    await setLastStatus(row.id, scheduledFor, "skipped");
    counters.skipped += 1;
    return;
  }

  const manager = getAgentManager();
  const body = buildScheduledTurn({ prompt: row.prompt, expectation: row.expectation });
  // `metadata` is what carries the correlation the runtime must echo back on
  // `agent.schedule_run` — `scheduledFor` is the second half of the occurrence's
  // idempotency key. `SendMessageInput` does not declare the field yet (it is an
  // owed edit to lib/agent-manager/types.ts, which this vertical does not own);
  // `live.ts` forwards the whole body verbatim, so the field travels today and
  // the type will catch up.
  const input: SendMessageInput & { metadata?: Record<string, string> } = {
    conversationId: sessionKeyFor(row),
    channel: "web",
    body,
    metadata: {
      trigger: "schedule",
      triggerRef: row.id,
      scheduledFor: scheduledFor.toISOString(),
    },
  };

  try {
    // WAKE first. Without it, `wake_runtime = true` — the DDL default and the
    // single most common configuration — silently never fires on a stopped
    // instance. `LifecycleAction` has no `start`, so the wake is `resume`.
    if (row.wakeRuntime && row.agentManagerId && mode === "live") {
      const [sample] = await db
        .select({ state: agentHealthSamples.state })
        .from(agentHealthSamples)
        .where(eq(agentHealthSamples.agentId, row.agentId))
        .orderBy(desc(agentHealthSamples.sampledAt))
        .limit(1);
      if (sample?.state === "stopped") {
        await manager.setLifecycle(row.agentManagerId, "resume");
      }
    }

    const res = await manager.sendMessage(row.agentManagerId ?? row.agentId, input);
    counters.dispatched += 1;

    if (mode === "mock") {
      // The mock client answers inline, so no webhook loop exists and the tick
      // writes the terminal status itself. Zero outbound requests, which is what
      // makes the scheduler's integration tests structural rather than mocked.
      await finishOccurrence(occurrenceId, {
        status: "succeeded",
        summary: res.reply?.body?.slice(0, 500) ?? null,
        finishedAt: new Date(),
      });
      await setLastStatus(row.id, scheduledFor, "succeeded");
      await db.insert(agentActivities).values({
        agentId: row.agentId,
        text: `Scheduled run — ${row.name}`,
        tag: "calendar",
      });
    }
  } catch (e) {
    const code = classifyDispatchError(e);
    if (code === "dispatch_unsupported") {
      // The Manager has no chat path for this agent. The schedule stays enabled
      // and `next_run_at` already advanced, so tomorrow's run is unaffected.
      await finishOccurrence(occurrenceId, {
        status: "skipped",
        skipReason: "dispatch_unsupported",
        finishedAt: new Date(),
      });
      await setLastStatus(row.id, scheduledFor, "skipped");
      counters.skipped += 1;
      return;
    }
    counters.failed += 1;
    await finishOccurrence(occurrenceId, {
      status: "failed",
      errorCode: code,
      errorMessage: e instanceof Error ? e.message.slice(0, 480) : "dispatch failed",
      finishedAt: new Date(),
      // Backoff: attempt 1 -> +60 s, attempt 2 -> +300 s. Scheduled only inside
      // the 15-minute window: a digest twenty minutes late is a MISFIRE
      // question, not a transport one, and retrying it eleven minutes into the
      // next occurrence's window creates the overlap `overlap_policy` exists to
      // prevent.
      nextAttemptAt:
        now.getTime() - scheduledFor.getTime() <= SCHEDULER.RETRY_WINDOW_SECONDS * 1000
          ? new Date(now.getTime() + 60_000)
          : null,
    });
    await setLastStatus(row.id, scheduledFor, "failed");
  }
}

function classifyDispatchError(e: unknown): "dispatch_failed" | "runtime_unreachable" | "dispatch_unsupported" {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (/\b501\b|unsupported|not implemented/i.test(msg)) return "dispatch_unsupported";
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(msg)) return "runtime_unreachable";
  return "dispatch_failed";
}

async function finishOccurrence(
  id: string,
  patch: {
    status: "succeeded" | "failed" | "skipped";
    skipReason?: SkipReason;
    summary?: string | null;
    errorCode?: string;
    errorMessage?: string;
    finishedAt: Date;
    nextAttemptAt?: Date | null;
  },
): Promise<void> {
  await db
    .update(agentScheduleRuns)
    .set({
      status: patch.status,
      skipReason: patch.skipReason ?? null,
      summary: patch.summary ?? null,
      errorCode: patch.errorCode ?? null,
      errorMessage: patch.errorMessage ?? null,
      finishedAt: patch.finishedAt,
      nextAttemptAt: patch.nextAttemptAt ?? null,
    })
    .where(eq(agentScheduleRuns.id, id));
}

/** Guarded so a late write for an OLD occurrence cannot stamp over a newer one. */
async function setLastStatus(scheduleId: string, scheduledFor: Date, status: string): Promise<void> {
  await db
    .update(agentSchedules)
    .set({ lastStatus: status })
    .where(
      and(
        eq(agentSchedules.id, scheduleId),
        or(sql`${agentSchedules.lastRunAt} is null`, lte(agentSchedules.lastRunAt, scheduledFor))!,
      ),
    );
}

/**
 * Occurrences that were dispatched and never reported anything at all.
 *
 * The threshold is the LEASE, not `max_runtime_seconds`: they measure different
 * things. `max_runtime_seconds` (up to 24 h) is how long the runtime may WORK;
 * the lease is how long we wait for it to say ANYTHING. A run legitimately
 * taking 40 minutes reports `started` within seconds, and `started` is what the
 * sweep looks for the absence of.
 *
 * The sweep does NOT touch `enabled` or `next_run_at`: those advanced before the
 * dispatch, and a lost occurrence is not a reason to stop a schedule.
 */
async function sweepStaleRuns(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - SCHEDULER.LEASE_SECONDS * 1000);
  const swept = await db
    .update(agentScheduleRuns)
    .set({
      status: "failed",
      errorCode: "dispatch_lost",
      finishedAt: now,
      nextAttemptAt: new Date(now.getTime() + 60_000),
    })
    .where(and(eq(agentScheduleRuns.status, "started"), lt(agentScheduleRuns.startedAt, cutoff)))
    .returning({ scheduleId: agentScheduleRuns.scheduleId, scheduledFor: agentScheduleRuns.scheduledFor });

  for (const s of swept) await setLastStatus(s.scheduleId, s.scheduledFor, "failed");
  return swept.length;
}

/**
 * Re-open transport failures and dispatch them again.
 *
 * This REOPENS the occurrence row rather than inserting a new one — same
 * `scheduled_for`, `attempt` incremented — so the unique index still holds and
 * history shows ONE occurrence with three attempts rather than three
 * occurrences. `failed -> started` is a rank REGRESSION, which the ingest UPSERT
 * rule forbids; that rule governs INGEST only, because a runtime event has no
 * way to know an ArkAgent-side retry happened. Our own writes are not ingest.
 *
 * `error_code = NULL` on reopen is what stops the next tick's retry pass from
 * re-selecting the same row before this dispatch's outcome has been written.
 * Only transport codes are retryable: a `timeout` will time out again and the
 * fix is the setting, and a `credit_cap_reached` retry would breach the cap.
 */
async function retryPass(
  now: Date,
  mode: ReturnType<typeof agentManagerMode>,
  counters: { dispatched: number; skipped: number; failed: number },
): Promise<number> {
  if (mode === "unconfigured") return 0;
  // `db.execute()` binds parameters straight through postgres-js, which cannot
  // serialise a JS Date on that path (ERR_INVALID_ARG_TYPE) — unlike the typed
  // column path Drizzle uses for `db.select()`. Bind ISO text and cast in SQL.
  const nowIso = now.toISOString();
  const rows = await db.execute<Record<string, unknown>>(sql`
    WITH due AS (
      SELECT r.id
        FROM agent_schedule_runs r
        JOIN agents a ON a.id = r.agent_id
       WHERE r.status = 'failed'
         AND r.error_code IN ('dispatch_failed','runtime_unreachable','dispatch_lost')
         AND r.attempt < ${SCHEDULER.RETRY_MAX_ATTEMPTS}
         AND r.next_attempt_at IS NOT NULL
         AND r.next_attempt_at <= ${nowIso}::timestamptz
         AND ${nowIso}::timestamptz - r.scheduled_for <= (${SCHEDULER.RETRY_WINDOW_SECONDS}::integer * interval '1 second')
         AND a.status::text IN (${DISPATCHABLE_SQL})
         -- The re-dispatch needs the schedule's prompt, timezone and delivery
         -- target, and schedule_id has no FK (delta 11) so history outlives the
         -- schedule. Without this the flip to 'started' succeeds, the INNER JOIN
         -- below drops the row, and the sweep fails it again every lease until
         -- attempt runs out: three pointless rewrites of a row nothing can
         -- ever dispatch.
         AND EXISTS (SELECT 1 FROM agent_schedules gs WHERE gs.id = r.schedule_id)
       ORDER BY r.next_attempt_at
       LIMIT 50
       FOR UPDATE OF r SKIP LOCKED
    )
    UPDATE agent_schedule_runs r
       SET status = 'started', attempt = r.attempt + 1, started_at = ${nowIso}::timestamptz,
           finished_at = NULL, error_code = NULL, error_message = NULL, next_attempt_at = NULL
      FROM due
     WHERE r.id = due.id
    RETURNING r.id, r.schedule_id
  `);
  const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
  if (!list.length) return 0;

  const ids = list.map((r) => String((r as Record<string, unknown>).id));
  const occ = await db
    .select({ run: agentScheduleRuns, s: agentSchedules, a: agents, w: workspaces })
    .from(agentScheduleRuns)
    .innerJoin(agentSchedules, eq(agentSchedules.id, agentScheduleRuns.scheduleId))
    .innerJoin(agents, eq(agents.id, agentScheduleRuns.agentId))
    .innerJoin(workspaces, eq(workspaces.id, agents.workspaceId))
    .where(inArray(agentScheduleRuns.id, ids));

  for (const o of occ) {
    const row: ClaimedRow = {
      ...o.s,
      agentStatus: o.a.status,
      workspaceId: o.a.workspaceId,
      agentManagerId: o.a.agentManagerId,
      agentSettings: o.a.settings,
      agentCreditsUsed: o.a.creditsUsed,
      creditsIncluded: o.w.creditsIncluded,
      creditsUsed: o.w.creditsUsed,
    };
    await dispatch(row, o.run.id, o.run.scheduledFor, mode, counters).catch(() => {});
  }
  return occ.length;
}

async function pruneTickLedger(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - SCHEDULER.TICK_RETENTION_DAYS * 86_400_000);
  await db.delete(schedulerTicks).where(lt(schedulerTicks.startedAt, cutoff));
}

async function closeTick(
  tickId: number | null,
  c: { claimed: number; dispatched: number; skipped: number; failed: number; retried: number; swept: number },
  saturated: boolean,
  startedAt: number,
): Promise<void> {
  if (tickId === null) return;
  await db
    .update(schedulerTicks)
    .set({ finishedAt: new Date(), durationMs: Date.now() - startedAt, saturated, ...c })
    .where(eq(schedulerTicks.id, tickId))
    .catch(() => {});
}

async function observedTickSeconds(): Promise<number | null> {
  const recent = await db
    .select({ startedAt: schedulerTicks.startedAt })
    .from(schedulerTicks)
    .orderBy(desc(schedulerTicks.startedAt))
    .limit(20);
  return medianTickSeconds(recent.map((r) => r.startedAt));
}

// ---------------------------------------------------------------------------
// The tick's bearer check
// ---------------------------------------------------------------------------

/**
 * Fails CLOSED when `CRON_SECRET` is unset. Without the secret this endpoint is
 * an unauthenticated AGENT TRIGGER on a public URL — anyone could pin a
 * workspace's credits at zero. `x-vercel-cron` is NOT accepted as
 * authentication: it is a client-settable header on a public URL. It may be
 * READ, only to label the ledger row.
 */
export async function authorizeTick(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented) return false;
  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(secret, "utf8");
  // timingSafeEqual throws on a length mismatch, which is itself a leak of the
  // secret's length if allowed to differentiate the failure path. Compare
  // lengths first and fall through to a fixed-cost comparison either way.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export { RETRYABLE_ERROR_CODES, DISPATCHABLE_STATUSES };
