/**
 * Browser fetch helpers for the schedule surfaces.
 *
 * Plain async functions that call `fetch` and throw on `!ok`; the integrator
 * re-exports them from `lib/client-api.ts`. Nothing here imports a server
 * module, and none of it validates — the server is the authority on every rule
 * in `validateScheduleInput`, and a second copy of those checks in the browser
 * is a second place for them to drift.
 *
 * The thrown error carries the server's `code` (`invalid_cron`,
 * `never_matches`, `schedule_limit_reached`, …) so the editor can render the
 * right i18n string rather than the English message.
 */

import type { Lang } from "@/lib/types";
import type { ScheduleDTO, ScheduleRunDTO, TickHealthDTO } from "./serialize";
import type { CreateScheduleInput, UpdateScheduleInput } from "./validation";

export class ScheduleApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ScheduleApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const b = (body ?? {}) as Record<string, unknown>;
    throw new ScheduleApiError(
      res.status,
      typeof b.error === "string" ? b.error : `Request failed (${res.status})`,
      typeof b.code === "string" ? b.code : undefined,
      b,
    );
  }
  return body as T;
}

export interface SchedulesResponse {
  schedules: ScheduleDTO[];
  tick: TickHealthDTO;
}

export function fetchSchedules(agentId: string, lang: Lang = "en"): Promise<SchedulesResponse> {
  return request(`/api/agents/${agentId}/schedules?lang=${lang}`);
}

export function createSchedule(
  agentId: string,
  input: CreateScheduleInput,
  lang: Lang = "en",
): Promise<{ schedule: ScheduleDTO }> {
  return request(`/api/agents/${agentId}/schedules?lang=${lang}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSchedule(
  agentId: string,
  scheduleId: string,
  input: UpdateScheduleInput,
  lang: Lang = "en",
): Promise<{ schedule: ScheduleDTO }> {
  return request(`/api/agents/${agentId}/schedules/${scheduleId}?lang=${lang}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** The toggle. `enabled: false` clears `next_run_at` server-side, in one UPDATE. */
export function setScheduleEnabled(
  agentId: string,
  scheduleId: string,
  enabled: boolean,
  lang: Lang = "en",
): Promise<{ schedule: ScheduleDTO }> {
  return updateSchedule(agentId, scheduleId, { enabled }, lang);
}

export function deleteSchedule(agentId: string, scheduleId: string): Promise<void> {
  return request(`/api/agents/${agentId}/schedules/${scheduleId}`, { method: "DELETE" });
}

export interface ScheduleRunsResponse {
  runs: ScheduleRunDTO[];
  nextCursor: string | null;
}

export function fetchScheduleRuns(
  agentId: string,
  scheduleId: string,
  opts: { status?: string; limit?: number; cursor?: string } = {},
): Promise<ScheduleRunsResponse> {
  const q = new URLSearchParams();
  if (opts.status) q.set("status", opts.status);
  if (opts.limit) q.set("limit", String(opts.limit));
  if (opts.cursor) q.set("cursor", opts.cursor);
  const qs = q.toString();
  return request(
    `/api/agents/${agentId}/schedules/${scheduleId}/runs${qs ? `?${qs}` : ""}`,
  );
}

export interface SchedulePreviewResponse {
  parsed: {
    kind: "recurring" | "one_off";
    cron: string;
    onDate: string | null;
    matched: string;
    confidence: number;
    source: "deterministic" | "llm" | "fallback";
  } | null;
  band: "accept" | "confirm" | "none" | "cron";
  alternative: SchedulePreviewResponse["parsed"];
  seed: SchedulePreviewResponse["parsed"];
  humanReadable: string | null;
  upcoming: string[];
  dstShift: boolean[];
  unionWarning: boolean;
  error: { code: string; message: string; detail?: Record<string, unknown> } | null;
  unevenStep: { unit: "minute" | "hour"; step: number; below: number | null; above: number | null } | null;
  assumedTime: boolean;
  llmAvailable: boolean;
  timezone: string;
}

/**
 * The live preview. A parse failure comes back as `error`, with a 200 — the
 * caller renders it, it does not catch it. Pass `deterministicOnly` for the
 * per-keystroke call so the model branch is only reached on blur.
 */
export function previewSchedule(
  agentId: string,
  input: { phrase?: string; cron?: string; timezone?: string; lang?: Lang; deterministicOnly?: boolean },
): Promise<SchedulePreviewResponse> {
  return request(`/api/agents/${agentId}/schedules/preview`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
