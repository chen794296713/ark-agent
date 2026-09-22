/**
 * Pure logic behind the activity views: glyph tables, day grouping, client-side
 * filtering, cost arithmetic and the health strip's bucketing. Kept out of the
 * components so `tests/activity-view.test.ts` can assert the parts that are easy to
 * get quietly wrong — micro-USD summation, timezone-free day keys, and the
 * every-enum-member glyph tables.
 */
import { c } from "@/lib/theme";
import type {
  CostBucketDTO,
  HealthSampleDTO,
  RunStatus,
  RunTrigger,
  StepPhase,
  TimelineFilters,
  TimelineItemDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Glyph tables — one entry per enum member, checked by the tests.
// ---------------------------------------------------------------------------

/** Cause, in one column, so the eye can scan it. */
export const TRIGGER_GLYPH: Record<RunTrigger, { glyph: string; color: string }> = {
  schedule: { glyph: "◷", color: c.accent },
  chat: { glyph: "✎", color: c.blue },
  channel: { glyph: "⌁", color: c.text2 },
  api: { glyph: "⎇", color: c.muted },
  self: { glyph: "↻", color: c.amber },
  system: { glyph: "⚙", color: c.muted },
};

/**
 * `timeout` gets its own glyph rather than being folded into `failed`: it is what
 * `max_runtime_seconds` produces, and the fix (raise the ceiling) has nothing to do
 * with the fix for a failure (the tool broke).
 */
export const STATUS_GLYPH: Record<RunStatus, { glyph: string; color: string }> = {
  queued: { glyph: "·", color: c.faint },
  running: { glyph: "◐", color: c.accent },
  succeeded: { glyph: "✓", color: c.green },
  failed: { glyph: "✕", color: c.red },
  cancelled: { glyph: "⊘", color: c.muted },
  timeout: { glyph: "⏱", color: c.amber },
};

/** Phase is WHAT KIND OF MOMENT; kind is WHAT TOOL. Never colour-code both. */
export const PHASE_GLYPH: Record<StepPhase, { glyph: string; color: string }> = {
  thinking: { glyph: "◇", color: c.muted },
  tool_call: { glyph: "▶", color: c.accent },
  tool_result: { glyph: "◀", color: c.text2 },
  message: { glyph: "✎", color: c.blue },
  final_answer: { glyph: "✔", color: c.green },
};

/** An unknown kind prints verbatim; null prints an em dash. Never blank. */
export function kindLabel(kind: string | null | undefined): string {
  const k = (kind ?? "").trim();
  return k === "" ? "—" : k;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export function itemTime(item: TimelineItemDTO): string {
  return item.type === "run" ? item.startedAt : item.occurredAt;
}

/**
 * A stable per-day key in the VIEWER's zone. `toISOString().slice(0,10)` is the
 * bug this replaces: it buckets by UTC, so everything a Tokyo user did after 09:00
 * lands under tomorrow and "TODAY" is empty all afternoon.
 */
export function dayKey(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export interface DayGroup {
  key: string;
  items: TimelineItemDTO[];
  runs: number;
  ok: number;
  failed: number;
  running: number;
}

/**
 * Group into days, newest first, preserving the server's ordering inside a day.
 * The per-day counters are computed here rather than on the row so the sticky
 * header can state the day's shape before the user scrolls it.
 */
export function groupByDay(items: TimelineItemDTO[], timeZone?: string): DayGroup[] {
  const order: string[] = [];
  const map = new Map<string, DayGroup>();
  for (const item of items) {
    const key = dayKey(itemTime(item), timeZone);
    let g = map.get(key);
    if (!g) {
      g = { key, items: [], runs: 0, ok: 0, failed: 0, running: 0 };
      map.set(key, g);
      order.push(key);
    }
    g.items.push(item);
    if (item.type === "run") {
      g.runs += 1;
      if (item.status === "succeeded") g.ok += 1;
      else if (item.status === "failed" || item.status === "timeout") g.failed += 1;
      else if (item.status === "running" || item.status === "queued") g.running += 1;
    }
  }
  return order.map((k) => map.get(k)!);
}

export type DayLabelKind = "today" | "yesterday" | "date";

export function dayLabelKind(key: string, now: Date = new Date(), timeZone?: string): DayLabelKind {
  const today = dayKey(now.toISOString(), timeZone);
  if (key === today) return "today";
  const y = new Date(now.getTime() - 86400_000);
  if (key === dayKey(y.toISOString(), timeZone)) return "yesterday";
  return "date";
}

/** "41.2s" / "3m 20s" / "182s". Sub-minute keeps a decimal; above it does not. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${(Math.round(s * 10) / 10).toString()}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ---------------------------------------------------------------------------
// Filtering — a client mirror of the query params, for the live buffer only.
// ---------------------------------------------------------------------------

/**
 * The SERVER filters the page. This exists so a row arriving over SSE while a
 * filter is set does not appear in a list it does not belong to — a live row that
 * ignores the active filter is worse than no live mode, because the user reads the
 * list as "everything matching" and it silently is not.
 */
export function matchesFilters(item: TimelineItemDTO, f: TimelineFilters): boolean {
  const q = f.q.trim().toLowerCase();
  if (item.type === "run") {
    if (f.trigger !== "all" && item.trigger !== f.trigger) return false;
    if (f.outcome !== "all" && item.status !== f.outcome) return false;
    if (f.tag !== "all") return false;
    if (q) {
      const hay = `${item.summary ?? ""} ${item.triggerLabel ?? ""} ${item.errorMessage ?? ""}`;
      if (!hay.toLowerCase().includes(q)) return false;
    }
    return true;
  }
  if (f.trigger !== "all") return false;
  if (f.outcome !== "all") return false;
  if (f.tag !== "all" && item.tag !== f.tag) return false;
  if (q && !item.text.toLowerCase().includes(q)) return false;
  return true;
}

/** Newest first, de-duplicated by id — SSE replays after a reconnect. */
export function mergeTimeline(
  existing: TimelineItemDTO[],
  incoming: TimelineItemDTO[],
): TimelineItemDTO[] {
  const seen = new Set(existing.map((i) => i.id));
  const fresh = incoming.filter((i) => !seen.has(i.id));
  if (fresh.length === 0) return existing;
  return [...fresh, ...existing].sort(
    (a, b) => new Date(itemTime(b)).getTime() - new Date(itemTime(a)).getTime(),
  );
}

// ---------------------------------------------------------------------------
// Money — micro-USD in, once-converted display out.
// ---------------------------------------------------------------------------

/**
 * Sum in micro-USD. Summing per-run values already rounded to cents turns a
 * 412-run month into a number that is wrong by more than the total.
 */
export function sumMicroUsd(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) total += v;
  }
  return total;
}

export function microUsdToUsd(micro: number): number {
  return micro / 1_000_000;
}

/**
 * Render micro-USD. Sub-cent amounts keep four decimals — a per-run figure shown as
 * "$0.01" makes every run look identical, and the whole point of the view is that
 * they are not. `estimated` renders as an em dash, never as $0.00, which reads as
 * "this was free".
 */
export function formatMicroUsd(
  micro: number,
  opts: { locale?: string; currency?: string; estimated?: boolean } = {},
): string {
  if (opts.estimated) return "—";
  const usd = microUsdToUsd(micro);
  const digits = usd !== 0 && Math.abs(usd) < 0.1 ? 4 : 2;
  return usd.toLocaleString(opts.locale ?? "en-US", {
    style: "currency",
    currency: opts.currency ?? "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** null when there is no comparable previous period — NOT 0%, which claims "flat". */
export function pctDelta(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

/** Share of the total, 0..100. An empty total is 0 share, not NaN. */
export function bucketShares(buckets: CostBucketDTO[]): number[] {
  const total = sumMicroUsd(buckets.map((b) => b.costMicroUsd));
  if (total <= 0) return buckets.map(() => 0);
  return buckets.map((b) => (b.costMicroUsd / total) * 100);
}

/** 1.94 M / 512 K / 88 — compact token counts that stay scannable in a column. */
export function formatTokens(n: number, locale = "en-US"): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 2 })} M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString(locale, { maximumFractionDigits: 1 })} K`;
  return n.toLocaleString(locale);
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export type StripCellState = HealthSampleDTO["state"] | "nosample";

export const STRIP_COLOR: Record<StripCellState, string> = {
  running: c.green,
  idle: c.line,
  unhealthy: c.amber,
  stopped: c.faint,
  // A gap is not "idle". Rendering a missing sample as idle invents a fact.
  nosample: c.panelDeep,
};

/**
 * Bucket samples into fixed-width cells over [from, to). The last state seen in a
 * bucket wins, and `unhealthy` wins over everything in the bucket — a five-minute
 * cell that contains one unhealthy sample should not read as healthy.
 */
export function buildStateStrip(
  samples: HealthSampleDTO[],
  from: Date,
  to: Date,
  bucketMs = 5 * 60_000,
): StripCellState[] {
  const span = to.getTime() - from.getTime();
  if (span <= 0 || bucketMs <= 0) return [];
  const cells = Math.max(1, Math.min(720, Math.ceil(span / bucketMs)));
  const out: StripCellState[] = new Array(cells).fill("nosample");
  for (const s of samples) {
    const t = new Date(s.ts).getTime();
    if (Number.isNaN(t) || t < from.getTime() || t >= to.getTime()) continue;
    const i = Math.min(cells - 1, Math.floor((t - from.getTime()) / bucketMs));
    if (out[i] === "unhealthy") continue;
    out[i] = s.state;
  }
  return out;
}

/** Peak value and its timestamp, ignoring nulls. Null when nothing was reported. */
export function peakOf(
  samples: HealthSampleDTO[],
  pick: (s: HealthSampleDTO) => number | null,
): { value: number; ts: string } | null {
  let best: { value: number; ts: string } | null = null;
  for (const s of samples) {
    const v = pick(s);
    if (v === null || !Number.isFinite(v)) continue;
    if (!best || v > best.value) best = { value: v, ts: s.ts };
  }
  return best;
}

export type Liveness = "ok" | "stale" | "very_stale" | "unknown";

/**
 * Heartbeat freshness, in multiples of the configured interval rather than in
 * absolute seconds: an agent on a 15-minute heartbeat is not late at 60s.
 */
export function livenessOf(
  lastHeartbeatAt: string | null,
  heartbeatMinutes: number,
  now: Date = new Date(),
): Liveness {
  if (!lastHeartbeatAt) return "unknown";
  const t = new Date(lastHeartbeatAt).getTime();
  if (Number.isNaN(t)) return "unknown";
  const interval = Math.max(1, heartbeatMinutes) * 60_000;
  const age = now.getTime() - t;
  if (age > interval * 10) return "very_stale";
  if (age > interval * 3) return "stale";
  return "ok";
}

export type SyncState = "in_sync" | "pending" | "not_reported";

/** The §E.5 signal, shared by the RUNTIME card and the HEALTH liveness block. */
export function syncStateOf(
  configRevision: number,
  configAppliedRevision: number | null,
): SyncState {
  if (configAppliedRevision === null) return "not_reported";
  return configAppliedRevision >= configRevision ? "in_sync" : "pending";
}

/** Build an SVG polyline for a sparkline in a `w × h` box. "" when there is no data. */
export function sparklinePoints(
  values: Array<number | null>,
  width: number,
  height: number,
): string {
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v !== null && Number.isFinite(p.v));
  if (pts.length === 0) return "";
  const max = Math.max(...pts.map((p) => p.v as number));
  const min = Math.min(...pts.map((p) => p.v as number));
  const span = max - min || 1;
  const stepX = pts.length === 1 ? 0 : width / (values.length - 1 || 1);
  return pts
    .map((p) => {
      const x = pts.length === 1 ? width / 2 : p.i * stepX;
      const y = height - ((p.v as number) - min) / span * (height - 2) - 1;
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(" ");
}
