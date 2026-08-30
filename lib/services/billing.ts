import "server-only";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, subscriptions, usageRecords, workspaces } from "@/lib/db/schema";

/**
 * Real credit usage for the billing screen.
 *
 * This replaces `getBillDatasets()` in lib/data.ts, which returned invented
 * numbers — 18,420 credits, fourteen hardcoded bar heights, "4 agent seats" —
 * to EVERY workspace, not just the seeded demo. A brand-new account with no
 * agents saw a full chart and an estimate for four seats it had never bought.
 *
 * Everything below comes from `usage_records`, which the chat route and the
 * Agent Manager webhook already write. A workspace with no usage now gets an
 * empty chart, which is the correct answer.
 */

export type UsageRange = "cycle" | "last" | "d90" | "custom";

/** A monthly cycle, for prorating and for stepping back to the previous one. */
const CYCLE_DAYS = 30;
const DAY_MS = 86_400_000;

export interface UsageBucket {
  /** `YYYY-MM-DD`, UTC. One entry per day in the window, zero-filled. */
  date: string;
  credits: number;
}

export interface AgentUsage {
  id: string;
  name: string;
  hue: string | null;
  credits: number;
}

export interface BillingUsage {
  range: UsageRange;
  /** Inclusive start / exclusive end, ISO. */
  from: string;
  to: string;
  /** Credits consumed inside the window — NOT the workspace lifetime total. */
  credits: number;
  /** Allowance for the window: the workspace's per-cycle grant × whole cycles. */
  included: number;
  buckets: UsageBucket[];
  perAgent: AgentUsage[];
  /** Whole monthly cycles the window spans; prorates the seat subtotal. */
  cycles: number;
  /** Seats billed annually, so the UI only shows a discount that is real. */
  annualSeats: number;
  monthlySeats: number;
}

/** `YYYY-MM-DD` in UTC. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The current cycle's start.
 *
 * `workspaces.cycle_resets_at` is the END of the cycle, so the start is one
 * cycle back from it. When it is null — every workspace that has never been
 * billed — fall back to the workspace's own creation date rather than to a
 * calendar month, so a two-day-old account does not get charted against a
 * window that predates it.
 */
function cycleStart(resetsAt: Date | null, createdAt: Date, now: Date): Date {
  // The reset date must still be AHEAD of us. A stale one — the cycle-reset job
  // stopped running — describes a cycle that already closed, and stepping back
  // from it charts a window that ended weeks ago: the user reads it as "no
  // usage this cycle" when the truth is "this number is not being maintained".
  if (resetsAt && resetsAt.getTime() > now.getTime()) {
    return new Date(resetsAt.getTime() - CYCLE_DAYS * DAY_MS);
  }
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return createdAt > monthStart ? createdAt : monthStart;
}

/** Resolve a range key to a half-open [from, to) window. */
export function resolveWindow(
  range: UsageRange,
  ws: { cycleResetsAt: Date | null; createdAt: Date },
  now: Date,
  custom?: { from?: string; to?: string },
): { from: Date; to: Date } {
  const start = cycleStart(ws.cycleResetsAt, ws.createdAt, now);
  switch (range) {
    case "cycle":
      return { from: start, to: now };
    case "last":
      return { from: new Date(start.getTime() - CYCLE_DAYS * DAY_MS), to: start };
    case "d90":
      return { from: new Date(now.getTime() - 90 * DAY_MS), to: now };
    case "custom": {
      const from = custom?.from ? new Date(`${custom.from}T00:00:00.000Z`) : start;
      // The picker's `to` is an inclusive DAY; the query is half-open, so the
      // window ends at the start of the following day or the last day is lost.
      const to = custom?.to
        ? new Date(new Date(`${custom.to}T00:00:00.000Z`).getTime() + DAY_MS)
        : now;
      if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) {
        return { from: start, to: now };
      }
      return { from, to };
    }
  }
}

/** Zero-fill the days the query returned no row for, so the chart has no gaps. */
function fillDays(rows: Map<string, number>, from: Date, to: Date): UsageBucket[] {
  const out: UsageBucket[] = [];
  // Walk whole UTC days; `to` is exclusive, so a window ending mid-day still
  // includes that day.
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  // 400 days is a year of daily bars plus slack — beyond that the chart is
  // unreadable anyway, and the cap stops a hand-typed custom range from
  // allocating an unbounded array.
  for (let i = 0; i < 400 && cursor.getTime() < to.getTime(); i++) {
    const key = isoDay(cursor);
    out.push({ date: key, credits: rows.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export async function getBillingUsage(
  workspaceId: string,
  range: UsageRange,
  custom?: { from?: string; to?: string },
  now: Date = new Date(),
): Promise<BillingUsage | null> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!ws) return null;

  const { from, to } = resolveWindow(range, ws, now, custom);

  // `date_trunc(...)::date` is grouped by the same expression rather than by an
  // alias: Postgres allows GROUP BY on an output-column name, but repeating the
  // expression keeps this readable next to the index it uses
  // (`usage_records_workspace_idx` on (workspace_id, occurred_at)).
  const bucketExpr = sql<string>`to_char(date_trunc('day', ${usageRecords.occurredAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;
  const inWindow = and(
    eq(usageRecords.workspaceId, workspaceId),
    gte(usageRecords.occurredAt, from),
    lt(usageRecords.occurredAt, to),
  );

  const [bucketRows, agentRows, seatRows] = await Promise.all([
    db
      .select({ bucket: bucketExpr, credits: sql<number>`coalesce(sum(${usageRecords.credits}), 0)::int` })
      .from(usageRecords)
      .where(inWindow)
      .groupBy(bucketExpr)
      .orderBy(asc(bucketExpr)),
    db
      .select({
        agentId: usageRecords.agentId,
        credits: sql<number>`coalesce(sum(${usageRecords.credits}), 0)::int`,
      })
      .from(usageRecords)
      .where(inWindow)
      .groupBy(usageRecords.agentId),
    db
      .select({ cycle: subscriptions.cycle })
      .from(subscriptions)
      .where(and(eq(subscriptions.workspaceId, workspaceId), eq(subscriptions.status, "active"))),
  ]);

  const byDay = new Map(bucketRows.map((r) => [r.bucket, Number(r.credits)]));
  const buckets = fillDays(byDay, from, to);
  const credits = bucketRows.reduce((sum, r) => sum + Number(r.credits), 0);

  // Name the agents that actually appear, in one query rather than N.
  const namedIds = agentRows.map((r) => r.agentId).filter((id): id is string => id !== null);
  const names = namedIds.length
    ? await db
        .select({ id: agents.id, name: agents.name, hue: agents.hue })
        .from(agents)
        .where(and(eq(agents.workspaceId, workspaceId), inArray(agents.id, namedIds)))
    : [];
  const nameById = new Map(names.map((a) => [a.id, a]));

  const perAgent: AgentUsage[] = agentRows
    .map((r) => {
      // A usage row whose agent was deleted keeps its credits — they were spent
      // and they are billed — but it has no name to show.
      const a = r.agentId ? nameById.get(r.agentId) : undefined;
      return {
        id: r.agentId ?? "deleted",
        name: a?.name ?? "Deleted agent",
        hue: a?.hue ?? null,
        credits: Number(r.credits),
      };
    })
    .sort((x, y) => y.credits - x.credits);

  const spanMs = to.getTime() - from.getTime();
  const cycles = Math.max(spanMs / (CYCLE_DAYS * DAY_MS), 0);
  const annualSeats = seatRows.filter((s) => s.cycle === "annual").length;

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    credits,
    // Rounded to whole cycles: the grant is per cycle, so a 90-day window has
    // three of them and a 10-day window still has the one it sits inside.
    included: Math.round(ws.creditsIncluded * Math.max(1, Math.round(cycles))),
    buckets,
    perAgent,
    cycles,
    annualSeats,
    monthlySeats: seatRows.length - annualSeats,
  };
}
