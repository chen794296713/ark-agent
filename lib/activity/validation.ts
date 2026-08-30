/**
 * Query-string validation and the keyset cursor codec.
 *
 * Client-safe (Zod only): the browser helpers in ./client.ts build the same
 * query string this parses, so the two cannot drift into a filter the server
 * silently drops.
 *
 * These schemas live here rather than in `lib/validation.ts` because that file
 * belongs to another owner; the integrator re-exports whichever of these the
 * shared module should carry.
 *
 * TWO CLASSES OF BAD INPUT, TREATED DIFFERENTLY, ON PURPOSE:
 *
 *  - A malformed *structural* parameter — an unparseable date, a 10^6 limit, a
 *    forged cursor, a range wider than 90 days — is a **400**. These are the
 *    parameters that bound the query, and serving an unbounded scan because a
 *    date did not parse is how any signed-in user fires a full-partition read.
 *  - An unrecognised *filter value* — `severity=purple`, `type=made.up` — is
 *    **dropped**, not rejected. Every one of these lands in `inArray`/`eq`
 *    against a pgEnum, Drizzle passes the string straight through, and Postgres
 *    answers `22P02 invalid input value for enum`, which surfaces as a 500 with
 *    the enum's full value list in the message. Dropping is also the kinder
 *    behaviour for a bookmarked URL from an older deploy. What was dropped is
 *    reported back in `ignoredFilters` so the UI can say the filter did nothing
 *    rather than showing an unexplained full list.
 */
import { z } from "zod";
import { CHANNEL_TYPE_IDS } from "@/lib/channels";
import {
  ACTIVITY_CODES,
  ACTIVITY_TAGS,
  RUN_STATUSES,
  RUN_TRIGGERS,
  SEVERITIES,
  type ActivityCode,
  type ActivityTag,
  type RunStatus,
  type RunTrigger,
  type Severity,
} from "./types";

/** Rows per page. 50 is the page the UI draws; 100 is the ceiling any client may ask for. */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

/** The default window. Wide enough to be useful, narrow enough to be a range scan. */
export const DEFAULT_RANGE_DAYS = 7;
/** The cost view answers a monthly question, so it defaults wider. */
export const DEFAULT_COST_RANGE_DAYS = 30;
/** Health is a "what is happening now" view. */
export const DEFAULT_HEALTH_RANGE_HOURS = 24;
/**
 * The hard ceiling on `to - from`. Every index below is a range scan bounded by
 * this; without it the bound is the table.
 */
export const MAX_RANGE_DAYS = 90;

const DAY_MS = 86_400_000;

export class ActivityQueryError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ActivityQueryError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// The cursor
// ---------------------------------------------------------------------------

/**
 * `base64url(JSON)` of the sort key's three parts, opaque to the client.
 *
 * It carries NO AUTHORITY: the agent comes from the path and is workspace-
 * checked before any query runs, so a cursor lifted from another agent's page
 * simply selects nothing. That is why it needs no signature — and why it must
 * still be parsed, because a forged one that reached Drizzle unparsed would be
 * a `22P02` on a uuid cast.
 */
export const cursorSchema = z.object({
  /** The boundary row's timestamp, RFC 3339. */
  t: z.string().min(1).max(40),
  /** Which table it came from. `run` outranks `act` at an equal timestamp. */
  k: z.enum(["run", "act"]),
  /** The boundary row's id. */
  i: z.string().uuid(),
});
export type Cursor = z.infer<typeof cursorSchema>;

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

/**
 * Decode, or throw a 400 `bad_cursor`.
 *
 * Never a 500 and never a silent restart from the head: restarting would replay
 * rows the user already read, which is precisely the bug keyset pagination
 * exists to prevent.
 */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new ActivityQueryError("bad_cursor", "Malformed pagination cursor");
  }
  const res = cursorSchema.safeParse(parsed);
  if (!res.success) throw new ActivityQueryError("bad_cursor", "Malformed pagination cursor");
  const t = new Date(res.data.t);
  if (Number.isNaN(t.getTime())) {
    throw new ActivityQueryError("bad_cursor", "Malformed pagination cursor");
  }
  return res.data;
}

/** Rank at an equal timestamp: a run sorts before an activity row. */
export function cursorRank(k: Cursor["k"]): 0 | 1 {
  return k === "run" ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * Which branch of the merged timeline a filter belongs to.
 *
 * A filter that belongs to one branch EXCLUDES the other branch rather than
 * leaving it unfiltered. Without this the two branches read tables with
 * disjoint filterable columns, so ticking "schedule" narrows the runs and
 * leaves every message, skill install and error in place — which reads as a
 * broken filter, not as a design.
 */
export const RUN_ONLY_FILTERS = ["trigger", "outcome", "model", "session"] as const;
export const ACT_ONLY_FILTERS = ["tag", "type", "channel"] as const;

export interface TimelineFilters {
  from: Date;
  to: Date;
  limit: number;
  cursor: Cursor | null;
  /** Free text over run summaries and legacy activity text. See the honesty note in ./queries.ts. */
  q: string | null;
  severity: Severity | null;
  trigger: RunTrigger[] | null;
  outcome: RunStatus[] | null;
  type: ActivityCode[] | null;
  tag: ActivityTag | null;
  channel: string | null;
  session: string | null;
  run: string | null;
  model: string | null;
  /** Filter values the server did not recognise and therefore did not apply. */
  ignored: string[];
}

/** A list parameter: `?trigger=chat,schedule`. Unknown members are dropped. */
function enumList<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  name: string,
  ignored: string[],
): T[] | null {
  if (raw === null || raw.trim() === "") return null;
  const wanted = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const ok: T[] = [];
  for (const w of wanted) {
    if ((allowed as readonly string[]).includes(w)) {
      if (!ok.includes(w as T)) ok.push(w as T);
    } else {
      ignored.push(`${name}=${w}`);
    }
  }
  // Every value was unrecognised ⇒ the filter is absent, not "match nothing".
  // A URL from an older deploy should show the agent's activity, not an empty
  // page the user cannot explain.
  return ok.length > 0 ? ok : null;
}

function enumOne<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  name: string,
  ignored: string[],
): T | null {
  const list = enumList(raw, allowed, name, ignored);
  return list ? list[0] : null;
}

/** An opaque identifier filter (session key, run id, model name). Bounded, never parsed. */
function opaque(raw: string | null, max: number): string | null {
  if (raw === null) return null;
  const v = raw.trim();
  if (v === "" || v.length > max) return null;
  return v;
}

const timeRangeSchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
});

/**
 * Resolve `?from=&to=` to a bounded window.
 *
 * BOTH ENDS ARE ALWAYS BOUNDED. An unbounded timeline query is a full-partition
 * scan any signed-in user can fire, and the range is what turns every index
 * below into a range scan rather than a filter.
 */
export function parseRange(
  params: URLSearchParams,
  opts: { defaultMs: number; maxDays?: number; now?: Date } = { defaultMs: DEFAULT_RANGE_DAYS * DAY_MS },
): { from: Date; to: Date } {
  const raw = timeRangeSchema.parse({ from: params.get("from"), to: params.get("to") });
  const now = opts.now ?? new Date();
  const to = raw.to ? parseInstant(raw.to, "to") : now;
  const from = raw.from ? parseInstant(raw.from, "from") : new Date(to.getTime() - opts.defaultMs);
  if (from.getTime() > to.getTime()) {
    throw new ActivityQueryError("bad_range", "`from` is after `to`");
  }
  const maxMs = (opts.maxDays ?? MAX_RANGE_DAYS) * DAY_MS;
  if (to.getTime() - from.getTime() > maxMs) {
    throw new ActivityQueryError(
      "range_too_wide",
      `Range is capped at ${opts.maxDays ?? MAX_RANGE_DAYS} days`,
    );
  }
  return { from, to };
}

function parseInstant(raw: string, which: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new ActivityQueryError("bad_range", `\`${which}\` is not an RFC 3339 timestamp`);
  }
  return d;
}

export function parseLimit(params: URLSearchParams, fallback = DEFAULT_LIMIT): number {
  const raw = params.get("limit");
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
    throw new ActivityQueryError("bad_limit", `\`limit\` must be an integer in 1..${MAX_LIMIT}`);
  }
  return n;
}

/**
 * Parse the timeline query string. Throws `ActivityQueryError` (→ 4xx) only for
 * the structural parameters; unknown filter values land in `ignored`.
 */
export function parseTimelineQuery(params: URLSearchParams, now?: Date): TimelineFilters {
  const ignored: string[] = [];
  const { from, to } = parseRange(params, { defaultMs: DEFAULT_RANGE_DAYS * DAY_MS, now });
  const type = enumList(params.get("type"), ACTIVITY_CODES, "type", ignored);
  const channel = enumOne(params.get("channel"), CHANNEL_TYPE_IDS, "channel", ignored);

  // `params->>'channel'` is a JSONB predicate with no index, so it is only
  // accepted alongside a `type` filter that restricts to the two message codes
  // — the index then does the selective work first and the JSON test runs over
  // a handful of rows. Refusing loudly beats serving it slowly.
  if (channel !== null) {
    const messageOnly =
      type !== null && type.every((t) => t === "message.sent" || t === "message.received");
    if (!messageOnly) {
      throw new ActivityQueryError(
        "unsupported_filter",
        "`channel` requires `type=message.sent` or `type=message.received`",
      );
    }
  }

  const q = params.get("q");
  return {
    from,
    to,
    limit: parseLimit(params),
    cursor: decodeCursor(params.get("cursor")),
    q: q && q.trim() !== "" ? q.trim().slice(0, 120) : null,
    severity: enumOne(params.get("severity"), SEVERITIES, "severity", ignored),
    trigger: enumList(params.get("trigger"), RUN_TRIGGERS, "trigger", ignored),
    outcome: enumList(params.get("outcome"), RUN_STATUSES, "outcome", ignored),
    type,
    tag: enumOne(params.get("tag"), ACTIVITY_TAGS, "tag", ignored),
    channel,
    session: opaque(params.get("session"), 160),
    run: opaque(params.get("run"), 120),
    model: opaque(params.get("model"), 160),
    ignored,
  };
}

export interface RunFilters {
  from: Date;
  to: Date;
  limit: number;
  cursor: Cursor | null;
  trigger: RunTrigger[] | null;
  outcome: RunStatus[] | null;
  session: string | null;
  model: string | null;
  q: string | null;
  ignored: string[];
}

/**
 * The run list takes no `severity`: a run already has a status, and offering
 * both invites `severity=info` + `outcome=failed`, which returns nothing for
 * reasons the user cannot see.
 */
export function parseRunQuery(params: URLSearchParams, now?: Date): RunFilters {
  const ignored: string[] = [];
  const { from, to } = parseRange(params, { defaultMs: DEFAULT_RANGE_DAYS * DAY_MS, now });
  const q = params.get("q");
  return {
    from,
    to,
    limit: parseLimit(params),
    cursor: decodeCursor(params.get("cursor")),
    trigger: enumList(params.get("trigger"), RUN_TRIGGERS, "trigger", ignored),
    outcome: enumList(params.get("outcome"), RUN_STATUSES, "outcome", ignored),
    session: opaque(params.get("session"), 160),
    model: opaque(params.get("model"), 160),
    q: q && q.trim() !== "" ? q.trim().slice(0, 120) : null,
    ignored,
  };
}

export interface HealthQuery {
  from: Date;
  to: Date;
}

export function parseHealthQuery(params: URLSearchParams, now?: Date): HealthQuery {
  return parseRange(params, {
    defaultMs: DEFAULT_HEALTH_RANGE_HOURS * 3_600_000,
    now,
  });
}

export interface CostQuery {
  from: Date;
  to: Date;
}

export function parseCostQuery(params: URLSearchParams, now?: Date): CostQuery {
  return parseRange(params, { defaultMs: DEFAULT_COST_RANGE_DAYS * DAY_MS, now });
}

/**
 * Escape a user string for `ILIKE`.
 *
 * `%`, `_` and `\` are wildcards; unescaped, `?q=%` is an unbounded sequential
 * scan any signed-in user can fire. Mirrors the escaping already applied in
 * `app/api/admin/users/route.ts`.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** `%term%`. Drizzle's `ilike()` does NOT add wildcards, so a bare term is an equality test. */
export function likePattern(input: string): string {
  return `%${escapeLike(input)}%`;
}
