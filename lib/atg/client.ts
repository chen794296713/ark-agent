/**
 * Browser fetch helpers for the template API.
 *
 * No `server-only`, no database, no environment read — this is the module a
 * client component imports. It lives here rather than in `lib/client-api.ts`
 * because that file belongs to the integrator; when the shared module should
 * carry these, it re-exports them verbatim.
 *
 * **The SSE frame parser is imported, not re-written.** `parseSseChunk` in
 * `components/create/logic.ts` already handles the three things a naive
 * `split("\n\n")` gets wrong — a `: ping` comment frame, a frame carrying
 * several `data:` lines, and a chunk boundary landing mid-frame — and it is
 * covered by `tests/create-flow.test.ts`. A second copy in this file would be a
 * second thing to keep in step with the writer in
 * `app/api/templates/generate/route.ts`, and the two copies would disagree on
 * the day one of them was fixed.
 *
 * Every route below may answer with HTML rather than JSON — a 404 from the Next
 * router is a page, and `res.json()` on it throws a `SyntaxError` that surfaces
 * to the user as a blank screen. So every response is parsed defensively and a
 * failure becomes a typed error, never a crash.
 */
import type { ChannelType } from "@/lib/channels";
import type { Harness } from "@/lib/harness";
import type { PlanTier } from "@/lib/pricing";
import type { Lang } from "@/lib/types";
import { parseSseChunk, type GenerateEvent } from "@/components/create/logic";
import type { AgentTemplateDraft } from "./types";
import type {
  GenerationDTO,
  TemplateDetailResponse,
  TemplateListResponse,
  TemplateSummaryDTO,
} from "./serialize";

/** A generous multiple of the largest legitimate frame (the `done` draft). */
const MAX_PENDING_FRAME_CHARS = 2_000_000;

export class TemplateApiError extends Error {
  readonly status: number;
  /** The server's own machine-readable class, when it sent one. */
  readonly code: string | null;
  readonly retryAfterSeconds: number | null;
  readonly limit: "hour" | "day" | "cost" | null;
  readonly generationId: string | null;

  constructor(
    message: string,
    status: number,
    extra: {
      code?: string | null;
      retryAfterSeconds?: number | null;
      limit?: "hour" | "day" | "cost" | null;
      generationId?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "TemplateApiError";
    this.status = status;
    this.code = extra.code ?? null;
    this.retryAfterSeconds = extra.retryAfterSeconds ?? null;
    this.limit = extra.limit ?? null;
    this.generationId = extra.generationId ?? null;
  }
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function str(body: Record<string, unknown> | null, key: string): string | null {
  const v = body?.[key];
  return typeof v === "string" && v.length > 0 && v.length < 400 ? v : null;
}

/** Turn a non-2xx into a typed error. The message is for logs and for the
 *  dictionary to key off; it is never rendered raw. */
async function failureFor(res: Response): Promise<TemplateApiError> {
  const body = await readJson(res);
  const retry = body?.retryAfterSeconds;
  const limit = str(body, "limit");
  return new TemplateApiError(str(body, "error") ?? `HTTP ${res.status}`, res.status, {
    code: str(body, "code"),
    retryAfterSeconds: typeof retry === "number" ? retry : null,
    limit: limit === "hour" || limit === "day" || limit === "cost" ? limit : null,
    generationId: str(body, "generationId"),
  });
}

async function send<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { accept: "application/json", ...init.headers } });
  } catch (e) {
    // A network failure and a route that is not deployed are the same thing to
    // the user: it could not load. `0` marks "never reached HTTP".
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new TemplateApiError("network", 0);
  }
  if (!res.ok) throw await failureFor(res);
  if (res.status === 204) return undefined as T;
  const body = await readJson(res);
  if (body === null) throw new TemplateApiError("malformed", res.status);
  return body as T;
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

export function fetchTemplates(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<TemplateListResponse> {
  return send<TemplateListResponse>(
    `/api/templates?${params.toString()}`,
    signal ? { signal } : {},
  );
}

export function fetchTemplate(id: string, signal?: AbortSignal): Promise<TemplateDetailResponse> {
  return send<TemplateDetailResponse>(
    `/api/templates/${encodeURIComponent(id)}`,
    signal ? { signal } : {},
  );
}

/** Persist an edited draft. The server re-lints and recomputes every card
 *  column — a client-supplied `materializable: true` is never trusted. */
export function saveTemplate(
  draft: AgentTemplateDraft,
  options: { generationId?: string; name?: string; visibility?: "private" | "workspace" } = {},
): Promise<{ template: TemplateSummaryDTO }> {
  return send<{ template: TemplateSummaryDTO }>("/api/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft, ...options }),
  });
}

export interface TemplatePatch {
  name?: string;
  summary?: string;
  description?: string;
  category?: string;
  tags?: string[];
  visibility?: "private" | "workspace" | "public";
  minPlan?: PlanTier;
  draft?: AgentTemplateDraft;
  archived?: boolean;
}

export function patchTemplate(
  id: string,
  patch: TemplatePatch,
): Promise<{ template: TemplateSummaryDTO }> {
  return send<{ template: TemplateSummaryDTO }>(`/api/templates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}

/** Archive. The row is kept: agents materialized from it are running, and
 *  `agent_skills.origin_ref` still points here. */
export function deleteTemplate(id: string): Promise<void> {
  return send<void>(`/api/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface GenerateRequest {
  brief: string;
  locale?: Lang;
  harness?: Harness;
  roleHint?: string;
  channels?: ChannelType[];
  timezone?: string;
}

/**
 * POST the brief and read the `text/event-stream` back frame by frame.
 *
 * `EventSource` cannot POST, so this is `fetch` plus a `ReadableStream` reader;
 * that is also what makes Cancel work, since aborting the signal tears the
 * request down and the route marks the row `canceled`.
 *
 * Resolves when the stream closes. Every frame is handed to `onEvent` in order,
 * the terminal `done` / `error` frame included — what a partial run means is
 * the caller's decision, not this function's.
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
  } catch (e) {
    if (opts.signal.aborted) return;
    throw new TemplateApiError(e instanceof Error ? e.message : "network", 0);
  }
  if (!res.ok) throw await failureFor(res);
  if (!res.body) throw new TemplateApiError("stream not supported", res.status);

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
      // that strips blank lines would otherwise grow this without bound until
      // the tab dies — the `done` frame carries the whole draft and is nowhere
      // near this size.
      if (buffer.length > MAX_PENDING_FRAME_CHARS) {
        throw new TemplateApiError("unterminated SSE frame", res.status);
      }
      for (const event of events) opts.onEvent(event);
    }
    // A server that closed without a trailing blank line still owes us its last
    // frame; a synthetic terminator recovers it.
    if (buffer.trim()) {
      const { events } = parseSseChunk(`${buffer}\n\n`);
      for (const event of events) opts.onEvent(event);
    }
  } catch (e) {
    if (opts.signal.aborted) return;
    if (e instanceof TemplateApiError) throw e;
    throw new TemplateApiError(e instanceof Error ? e.message : "stream", 0);
  } finally {
    reader.releaseLock();
  }
}

export interface QueuedGeneration {
  generationId: string;
  pollAfterMs: number;
}

/** `stream: false` — a first-class transport, not a fallback nobody built. Used
 *  when a proxy buffers SSE into uselessness or the tab is backgrounded. */
export async function startQueuedGeneration(
  request: GenerateRequest,
  signal?: AbortSignal,
): Promise<QueuedGeneration> {
  const body = await send<{ generationId?: string; pollAfterMs?: number }>(
    "/api/templates/generate",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, stream: false }),
      ...(signal ? { signal } : {}),
    },
  );
  if (!body.generationId) throw new TemplateApiError("no generationId in 202", 202);
  return { generationId: body.generationId, pollAfterMs: body.pollAfterMs ?? 1500 };
}

/** The polling read. A 404 is another workspace's generation — or a route that
 *  is not deployed; both are "we cannot show you this", not a crash. */
export function fetchGeneration(id: string, signal?: AbortSignal): Promise<GenerationDTO> {
  return send<GenerationDTO>(
    `/api/templates/generations/${encodeURIComponent(id)}`,
    signal ? { signal } : {},
  );
}

// ---------------------------------------------------------------------------
// Materialize
// ---------------------------------------------------------------------------

export interface MaterializeBody {
  name?: string;
  planTier?: PlanTier;
  channels?: ChannelType[];
  acceptWarnings?: boolean;
  acknowledgedWarnings?: string[];
}

export interface MaterializeResponse {
  agent: { id: string; name: string; status: string };
  provisioned: boolean;
  reason?: string;
  replayed: boolean;
  skipped: string[];
}

/**
 * One key per ATTEMPT, minted by the caller and held across retries — a key
 * generated inside the request function would be new every time, which is no
 * key at all. `crypto.randomUUID` needs a secure context; the fallback is only
 * for an http:// dev origin and is not a security value.
 */
export function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `atg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function materializeTemplate(
  templateId: string,
  body: MaterializeBody,
  idempotencyKey: string,
): Promise<MaterializeResponse> {
  return send<MaterializeResponse>(
    `/api/templates/${encodeURIComponent(templateId)}/materialize`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    },
  );
}
