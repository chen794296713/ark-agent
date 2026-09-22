/**
 * Browser fetch helpers for the Activity views.
 *
 * Plain async functions that call `fetch` and throw on `!ok` — no React, no
 * store, no shared client instance. The integrator re-exports these from
 * `lib/client-api.ts`; keeping them here means the page can be built against
 * them before that wiring exists.
 *
 * Every helper builds its query string through `buildQuery`, which drops
 * `null`/`undefined`/empty rather than sending `?severity=` — an empty
 * parameter is a filter value the server has to decide about, and the decision
 * it would make (ignore it) is one the client should not force it to make.
 */
import type {
  CostDTO,
  HealthDTO,
  RunDetailDTO,
  RunListResponseDTO,
  TimelineResponseDTO,
} from "./types";

/**
 * A failed Activity request is NOT an empty timeline.
 *
 * Rendering zero rows over a failed request tells the user their agent did
 * nothing, which is a lie with the same shape as the truth. Callers catch this
 * and render "couldn't load" with the filters preserved, distinct from every
 * empty state.
 */
export class ActivityFetchError extends Error {
  readonly status: number;
  /** The server's machine code (`bad_cursor`, `range_too_wide`, …), when it sent one. */
  readonly code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "ActivityFetchError";
    this.status = status;
    this.code = code;
  }
}

export interface TimelineParams {
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string | null;
  q?: string;
  severity?: string;
  /** Comma-joined server-side; pass an array. */
  trigger?: string[];
  outcome?: string[];
  type?: string[];
  tag?: string;
  channel?: string;
  session?: string;
  run?: string;
  model?: string;
}

export interface RunListParams {
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string | null;
  q?: string;
  trigger?: string[];
  outcome?: string[];
  session?: string;
  model?: string;
}

export interface RangeParams {
  from?: string;
  to?: string;
}

type QueryValue = string | number | string[] | null | undefined;

function buildQuery(params: Record<string, QueryValue>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      sp.set(k, v.join(","));
    } else if (v !== "") {
      sp.set(k, String(v));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* an empty or non-JSON body is still a failure we can describe by status */
  }
  if (!res.ok) {
    const b = body as { error?: string; code?: string } | null;
    throw new ActivityFetchError(
      b?.error || `Request failed (${res.status})`,
      res.status,
      b?.code ?? null,
    );
  }
  return body as T;
}

/** Encoded because an agent id reaches this from a route param, not only from our own list. */
const agentPath = (agentId: string) => `/api/agents/${encodeURIComponent(agentId)}`;

export function fetchTimeline(agentId: string, params: TimelineParams = {}): Promise<TimelineResponseDTO> {
  return get<TimelineResponseDTO>(`${agentPath(agentId)}/activity${buildQuery({ ...params })}`);
}

export function fetchRuns(agentId: string, params: RunListParams = {}): Promise<RunListResponseDTO> {
  return get<RunListResponseDTO>(`${agentPath(agentId)}/runs${buildQuery({ ...params })}`);
}

export function fetchRun(agentId: string, runId: string): Promise<RunDetailDTO> {
  return get<RunDetailDTO>(`${agentPath(agentId)}/runs/${encodeURIComponent(runId)}`);
}

export function fetchHealth(agentId: string, params: RangeParams = {}): Promise<HealthDTO> {
  return get<HealthDTO>(`${agentPath(agentId)}/health${buildQuery({ ...params })}`);
}

export function fetchCost(agentId: string, params: RangeParams = {}): Promise<CostDTO> {
  return get<CostDTO>(`${agentPath(agentId)}/activity/cost${buildQuery({ ...params })}`);
}
