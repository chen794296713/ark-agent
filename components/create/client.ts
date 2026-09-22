"use client";

/**
 * Browser fetch helpers for the creation flow.
 *
 * These live here rather than in `lib/client-api.ts` because that file is
 * shared and owned by the integrator; every function below is a plain async
 * call that throws on a non-2xx, ready to be re-exported verbatim.
 *
 * **Every route these call may not exist yet.** They are being built in
 * parallel, so a 404 or a network failure is a normal, expected outcome and is
 * surfaced as a typed `GenerateFailure` the screens render as a recoverable
 * state — never as an unhandled rejection.
 */
import type { AgentTemplateDraft, DraftStageTrace, DraftWarning, StageId } from "@/lib/atg/types";
import type { ChannelType } from "@/lib/channels";
import type { Harness } from "@/lib/harness";
import type { Lang } from "@/lib/types";
import { parseSseChunk, type GenerateEvent, type GenerationMode } from "./logic";

/** A generous multiple of the largest legitimate frame (the `done` draft). */
const MAX_PENDING_FRAME_CHARS = 2_000_000;

export interface GenerateRequest {
  brief: string;
  locale?: Lang;
  harness?: Harness;
  roleHint?: string;
  channels?: ChannelType[];
  timezone?: string;
}

/** What went wrong, in the vocabulary the DESCRIBE screen renders. */
export type FailureKind =
  | "thin" // 422 IntakeFacts.tooThin — return to the textarea, not a modal
  | "conflict" // 409 — a generation is already running for this workspace
  | "rate" // 429
  | "auth" // 401
  | "unavailable" // 503 / 404 (route not deployed yet) / network
  | "stream" // an { type: "error" } frame after the stream opened
  | "unknown";

export class GenerateFailure extends Error {
  readonly kind: FailureKind;
  readonly status: number;
  readonly generationId: string | null;
  readonly retryAfterSeconds: number | null;
  readonly limit: "hour" | "day" | "cost" | null;
  readonly code: string | null;

  constructor(
    kind: FailureKind,
    message: string,
    extra: {
      status?: number;
      generationId?: string | null;
      retryAfterSeconds?: number | null;
      limit?: "hour" | "day" | "cost" | null;
      code?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "GenerateFailure";
    this.kind = kind;
    this.status = extra.status ?? 0;
    this.generationId = extra.generationId ?? null;
    this.retryAfterSeconds = extra.retryAfterSeconds ?? null;
    this.limit = extra.limit ?? null;
    this.code = extra.code ?? null;
  }
}

function bodyString(body: Record<string, unknown>, key: string): string | null {
  const v = body[key];
  return typeof v === "string" ? v : null;
}

/** Map a pre-stream JSON error onto a kind. The status is the signal; the
 *  message is for logs, never rendered raw — the dictionary owns the copy. */
async function failureFor(res: Response): Promise<GenerateFailure> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // A route that does not exist yet answers with HTML, not JSON.
  }
  const message = bodyString(body, "error") ?? `HTTP ${res.status}`;
  const generationId = bodyString(body, "generationId");
  switch (res.status) {
    case 401:
      return new GenerateFailure("auth", message, { status: 401 });
    case 409:
      return new GenerateFailure("conflict", message, { status: 409, generationId });
    case 422: {
      // Zod issues => a malformed request we should not have sent. A bare
      // message => IntakeFacts.tooThin, which is a prompt to keep typing.
      const thin = !("issues" in body);
      return new GenerateFailure(thin ? "thin" : "unknown", message, { status: 422 });
    }
    case 429: {
      const retry = body.retryAfterSeconds;
      const limit = bodyString(body, "limit");
      return new GenerateFailure("rate", message, {
        status: 429,
        retryAfterSeconds: typeof retry === "number" ? retry : null,
        limit: limit === "hour" || limit === "day" || limit === "cost" ? limit : null,
      });
    }
    default:
      return new GenerateFailure("unavailable", message, { status: res.status });
  }
}

/**
 * POST the brief and read the `text/event-stream` back frame by frame.
 *
 * `EventSource` cannot POST, so this is `fetch` + a `ReadableStream` reader;
 * that is also what makes Cancel work, since aborting the signal tears down the
 * request and moves the row to `canceled` server-side.
 *
 * Resolves when the stream closes. Every frame is handed to `onEvent` in
 * order, including the terminal `done` / `error` frame — the caller decides
 * what a partial run means rather than having it decided here.
 */
export async function streamGeneration(
  request: GenerateRequest,
  opts: { signal: AbortSignal; onEvent: (event: GenerateEvent) => void },
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/templates/generate", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ ...request, stream: true }),
      signal: opts.signal,
    });
  } catch (err) {
    if (opts.signal.aborted) return;
    throw new GenerateFailure("unavailable", err instanceof Error ? err.message : "network");
  }
  if (!res.ok) throw await failureFor(res);
  if (!res.body) {
    throw new GenerateFailure("unavailable", "stream not supported", { status: res.status });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseChunk(buffer);
      buffer = rest;
      // `rest` is the tail no blank line has terminated yet. An intermediary
      // that strips blank lines, or a server that never closes a frame, would
      // otherwise grow this without bound until the tab dies — the `done`
      // frame carries the whole draft but is nowhere near this size.
      if (buffer.length > MAX_PENDING_FRAME_CHARS) {
        throw new GenerateFailure("unavailable", "unterminated SSE frame", {
          status: res.status,
        });
      }
      for (const event of events) opts.onEvent(event);
    }
    // A server that closed without a trailing blank line still owes us its
    // last frame; feeding a synthetic terminator recovers it.
    if (buffer.trim()) {
      const { events } = parseSseChunk(`${buffer}\n\n`);
      for (const event of events) opts.onEvent(event);
    }
  } catch (err) {
    if (opts.signal.aborted) return;
    throw new GenerateFailure("unavailable", err instanceof Error ? err.message : "stream");
  } finally {
    reader.releaseLock();
  }
}

export interface QueuedGeneration {
  generationId: string;
  pollAfterMs: number;
}

/** `stream: false` — a first-class transport, not a fallback nobody built.
 *  Used when a proxy buffers SSE into uselessness or the tab is backgrounded. */
export async function startQueuedGeneration(
  request: GenerateRequest,
  signal?: AbortSignal,
): Promise<QueuedGeneration> {
  const res = await fetch("/api/templates/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...request, stream: false }),
    signal,
  }).catch((err: unknown) => {
    throw new GenerateFailure("unavailable", err instanceof Error ? err.message : "network");
  });
  if (!res.ok) throw await failureFor(res);
  const body = (await res.json()) as { generationId?: string; pollAfterMs?: number };
  if (!body.generationId) {
    throw new GenerateFailure("unknown", "no generationId in 202", { status: res.status });
  }
  return { generationId: body.generationId, pollAfterMs: body.pollAfterMs ?? 1500 };
}

export interface GenerationStatus {
  id: string;
  status: "queued" | "running" | "ready" | "needs_review" | "materialized" | "failed" | "canceled";
  mode: GenerationMode;
  progress: { stage: StageId; index: number; total: number } | null;
  stageTraces: DraftStageTrace[];
  warnings: DraftWarning[];
  draft: AgentTemplateDraft | null;
  error: string | null;
  cost: {
    promptTokens: number;
    completionTokens: number;
    costMicroUsd: number;
    llmCalls: number;
  } | null;
}

/** The polling read. `404` is another workspace's generation — or a route that
 *  is not deployed yet; both are "we cannot show you this", not a crash. */
export async function fetchGeneration(
  id: string,
  signal?: AbortSignal,
): Promise<GenerationStatus> {
  const res = await fetch(`/api/templates/generations/${encodeURIComponent(id)}`, {
    signal,
    headers: { accept: "application/json" },
  }).catch((err: unknown) => {
    throw new GenerateFailure("unavailable", err instanceof Error ? err.message : "network");
  });
  if (!res.ok) throw await failureFor(res);
  return (await res.json()) as GenerationStatus;
}

export async function cancelGeneration(id: string): Promise<void> {
  await fetch(`/api/templates/generations/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  }).catch(() => {
    // Best effort: aborting the stream is what actually stops the work, and a
    // cancel that cannot be delivered must not block the user from going back.
  });
}

export interface SchedulePreview {
  cron: string;
  timezone: string;
  description: string;
  nextRuns: string[];
  confidence: number;
  matched?: string;
}

/**
 * The server's reading of a natural-language phrase.
 *
 * Optional by design: the same parse runs client-side on every keystroke via
 * `lib/schedule/parse`, which is deterministic, free and identical. This call
 * only ever confirms — if it fails, or there is no agent yet to address it to,
 * the local answer stands and the user sees no error.
 */
export async function previewSchedule(
  agentId: string,
  input: { phrase: string; timezone: string },
  signal?: AbortSignal,
): Promise<SchedulePreview | null> {
  try {
    const res = await fetch(
      `/api/agents/${encodeURIComponent(agentId)}/schedules/preview`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal,
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as SchedulePreview;
  } catch {
    return null;
  }
}

export interface MaterializeResult {
  agent: { id: string; name: string };
  provisioned: boolean;
  reason?: string;
}

/**
 * Draft → real agent. `Idempotency-Key` is required by the route: a retry after
 * a timeout must not hire two agents, and the key is generated once per attempt
 * by the caller so a React re-render cannot mint a new one.
 */
export async function materializeTemplate(
  templateId: string,
  body: {
    name?: string;
    planTier?: string;
    channels?: ChannelType[];
    acceptWarnings?: boolean;
    acknowledgedWarnings?: string[];
  },
  idempotencyKey: string,
): Promise<MaterializeResult> {
  const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}/materialize`, {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  }).catch((err: unknown) => {
    throw new GenerateFailure("unavailable", err instanceof Error ? err.message : "network");
  });
  if (!res.ok) throw await failureFor(res);
  return (await res.json()) as MaterializeResult;
}

/** Persist the edited draft as a template. The server re-lints and recomputes
 *  `provenance` — a client-supplied `materializable: true` is never trusted. */
export async function saveTemplate(
  draft: AgentTemplateDraft,
  generationId?: string,
): Promise<{ template: { id: string } }> {
  const res = await fetch("/api/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft, ...(generationId ? { generationId } : {}) }),
  }).catch((err: unknown) => {
    throw new GenerateFailure("unavailable", err instanceof Error ? err.message : "network");
  });
  if (!res.ok) throw await failureFor(res);
  return (await res.json()) as { template: { id: string } };
}
