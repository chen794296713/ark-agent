import { desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { llmUsage, workspaces } from "@/lib/db/schema";
import { apiError, jsonPrivate, requirePlatformRole } from "@/lib/api";
import {
  EMPTY_USAGE,
  usageTotalColumns,
  utcBucket,
  withErrorRate,
  type UsageTotalsRow,
} from "@/lib/admin/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_DAYS = [1, 7, 30, 90] as const;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Caps the payload; the headline totals still come from the full series. */
const TOP_N = 50;

/** GET /api/admin/llm-usage?days=1|7|30|90 — platform-wide spend rollups. */
export async function GET(req: Request) {
  const gate = await requirePlatformRole("support");
  if (gate.res) return gate.res;

  const raw = new URL(req.url).searchParams.get("days");
  const days = raw === null || raw === "" ? 30 : Number(raw);
  if (!ALLOWED_DAYS.includes(days as (typeof ALLOWED_DAYS)[number])) {
    return apiError(`days must be one of ${ALLOWED_DAYS.join(", ")}`, 400);
  }

  // A single day is unreadable at day granularity — one bar is not a trend.
  const granularity = days === 1 ? "hour" : "day";
  const step = granularity === "hour" ? HOUR_MS : DAY_MS;
  // Snap the window start down to a bucket edge so the SQL buckets and the
  // gap-filled ones below land on exactly the same instants.
  const since = new Date(Math.floor((Date.now() - days * DAY_MS) / step) * step);
  const inWindow = gte(llmUsage.createdAt, since);
  const bucket = utcBucket(granularity);

  const [seriesRows, byModel, byWorkspace, byKind] = await Promise.all([
    db
      .select({ bucket, ...usageTotalColumns() })
      .from(llmUsage)
      .where(inWindow)
      .groupBy(bucket)
      .orderBy(bucket),
    db
      .select({ provider: llmUsage.provider, model: llmUsage.model, ...usageTotalColumns() })
      .from(llmUsage)
      .where(inWindow)
      .groupBy(llmUsage.provider, llmUsage.model)
      .orderBy(desc(sql`sum(${llmUsage.totalTokens})`))
      .limit(TOP_N),
    db
      .select({
        workspaceId: llmUsage.workspaceId,
        // Null for usage recorded against a workspace that has since been
        // deleted — the FK is ON DELETE SET NULL so the spend still counts.
        workspaceName: workspaces.name,
        ...usageTotalColumns(),
      })
      .from(llmUsage)
      .leftJoin(workspaces, eq(workspaces.id, llmUsage.workspaceId))
      .where(inWindow)
      .groupBy(llmUsage.workspaceId, workspaces.name)
      .orderBy(desc(sql`sum(${llmUsage.totalTokens})`))
      .limit(TOP_N),
    db
      .select({ kind: llmUsage.kind, ...usageTotalColumns() })
      .from(llmUsage)
      .where(inWindow)
      .groupBy(llmUsage.kind)
      .orderBy(desc(sql`sum(${llmUsage.totalTokens})`)),
  ]);

  const byBucket = new Map(seriesRows.map(({ bucket: key, ...totals }) => [key, totals]));
  const series = buckets(since, step, granularity).map((key) => ({
    bucket: key,
    ...(byBucket.get(key) ?? EMPTY_USAGE),
  }));

  const totals = seriesRows.reduce<UsageTotalsRow>(
    (acc, d) => ({
      calls: acc.calls + d.calls,
      promptTokens: acc.promptTokens + d.promptTokens,
      completionTokens: acc.completionTokens + d.completionTokens,
      totalTokens: acc.totalTokens + d.totalTokens,
      costMicroUsd: acc.costMicroUsd + d.costMicroUsd,
      errors: acc.errors + d.errors,
      estimatedCalls: acc.estimatedCalls + d.estimatedCalls,
    }),
    { ...EMPTY_USAGE },
  );

  return jsonPrivate({
    days,
    granularity,
    since: since.toISOString(),
    totals: withErrorRate(totals),
    series,
    byModel,
    byWorkspace,
    byKind,
  });
}

/**
 * Every bucket in the window, including the empty ones. A sparse series draws a
 * chart that skips quiet days and reads as continuous traffic.
 * The labels must match `utcBucket()`'s `to_char` output exactly.
 */
function buckets(since: Date, step: number, granularity: "day" | "hour"): string[] {
  const label = (ms: number) => {
    const iso = new Date(ms).toISOString();
    return granularity === "hour" ? `${iso.slice(0, 13)}:00:00Z` : iso.slice(0, 10);
  };
  const end = Math.floor(Date.now() / step) * step;
  const out: string[] = [];
  for (let ms = since.getTime(); ms <= end; ms += step) out.push(label(ms));
  return out;
}
