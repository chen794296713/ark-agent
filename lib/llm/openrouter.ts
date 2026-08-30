import "server-only";

import { normalizeModelId } from "@/lib/llm/model-id";

/**
 * OpenRouter LLM client (OpenAI-compatible Chat Completions).
 *
 * This is the single place ArkAgent talks to a language model. It is provider-
 * agnostic by design: OpenRouter routes to whatever model id is configured in
 * `LLM_MODEL`, authenticated with `OPENROUTER_API_KEY`. Both a streaming and a
 * one-shot helper are exposed; callers that don't have a key should gate on
 * `isLLMConfigured()` and fall back to their own default behavior.
 *
 * Env:
 *   OPENROUTER_API_KEY   – required to make any call.
 *   LLM_MODEL            – model id (e.g. "openai/gpt-4o-mini", "anthropic/…").
 *                          An "openrouter/" routing prefix is accepted and stripped.
 *   OPENROUTER_BASE_URL  – optional override (defaults to the public endpoint).
 *   OPENROUTER_STREAM_USAGE – "0" stops asking for usage on streamed calls.
 *   NEXT_PUBLIC_APP_URL  – optional; sent as HTTP-Referer for OpenRouter attribution.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * What one call cost. Handed to `onUsage`; persisted by lib/llm/usage.ts.
 *
 * `costMicroUsd` is integer micro-USD (1e-6 USD) so sub-cent prices survive
 * without a float, and is 0 whenever the provider quoted no price.
 */
export interface LlmUsageSample {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costMicroUsd: number;
  estimated: boolean;
}

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/** Whether an LLM is configured (an API key is present). */
export function isLLMConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

// Re-exported so this module stays the single entry point for LLM callers.
export { normalizeModelId };

/**
 * The configured model id, normalized, falling back to a sensible default when
 * `LLM_MODEL` is unset or blank.
 */
export function llmModel(): string {
  return normalizeModelId(process.env.LLM_MODEL || "") || DEFAULT_MODEL;
}

/** The model for one call: an explicit override if usable, else the configured one. */
function resolveModel(requested?: string): string {
  return (requested ? normalizeModelId(requested) : "") || llmModel();
}

function baseUrl(): string {
  return (process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    // OpenRouter attribution headers (optional but recommended).
    "X-Title": process.env.OPENROUTER_APP_TITLE || "ArkAgent",
  };
  const referer = process.env.NEXT_PUBLIC_APP_URL || process.env.OPENROUTER_HTTP_REFERER;
  if (referer) headers["HTTP-Referer"] = referer;
  return headers;
}

/**
 * A provider error delivered inside the SSE body rather than as an HTTP status.
 * A distinct class so the parse-noise filter can be precise about what it drops.
 */
class OpenRouterStreamError extends Error {
  constructor(providerMessage?: unknown) {
    // The provider's own wording is not echoed: this message reaches the
    // browser through the chat SSE `error` frame.
    super("OpenRouter stream error");
    this.name = "OpenRouterStreamError";
    if (typeof providerMessage === "string" && providerMessage) {
      console.error(`[llm] stream error: ${providerMessage.slice(0, 300)}`);
    }
  }
}

async function safeErrorText(res: Response): Promise<string> {
  try {
    const body = await res.text();
    return body.slice(0, 500);
  } catch {
    return res.statusText;
  }
}

// ---------------------------------------------------------------------------
// Usage accounting
// ---------------------------------------------------------------------------

/**
 * OpenRouter's own docs now mark `stream_options.include_usage` deprecated and
 * inert — it always puts a usage block on the final SSE frame. The flag stays
 * because `OPENROUTER_BASE_URL` may point at a plain OpenAI-compatible gateway,
 * where usage on a stream is opt-in and omitting this yields no accounting at
 * all. An older proxy could reject the unknown field outright, hence the
 * escape hatch: default on, `OPENROUTER_STREAM_USAGE=0` to drop it.
 */
function includeStreamUsage(): boolean {
  return process.env.OPENROUTER_STREAM_USAGE !== "0";
}

function toTokenCount(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
}

/** OpenRouter bills in credits, which are 1:1 with US dollars. */
function costToMicroUsd(cost: unknown): number {
  return typeof cost === "number" && Number.isFinite(cost) && cost > 0
    ? Math.round(cost * 1_000_000)
    : 0;
}

/** Read a provider `usage` block, or null if this response carried none. */
function readUsage(model: string, raw: unknown): LlmUsageSample | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const hasCounts =
    typeof u.prompt_tokens === "number" ||
    typeof u.completion_tokens === "number" ||
    typeof u.total_tokens === "number";
  if (!hasCounts) return null;
  const promptTokens = toTokenCount(u.prompt_tokens);
  const completionTokens = toTokenCount(u.completion_tokens);
  return {
    model,
    promptTokens,
    completionTokens,
    totalTokens: toTokenCount(u.total_tokens) || promptTokens + completionTokens,
    costMicroUsd: costToMicroUsd(u.cost),
    estimated: false,
  };
}

/** ~4 characters per token — the usual English-prose rule of thumb. */
const CHARS_PER_TOKEN = 4;

/**
 * Fallback when a response carries no usage block (a proxied gateway that
 * strips it, or a stream cut short). Recording a rough number beats recording
 * zeros, which would read as "this call was free". The estimate is well off for
 * CJK and code, and we have no price table, so cost stays 0 and the sample is
 * flagged `estimated` for every consumer downstream.
 */
function estimateUsage(model: string, messages: ChatMessage[], output: string): LlmUsageSample {
  const promptChars = messages.reduce((n, m) => n + m.content.length + m.role.length, 0);
  const promptTokens = Math.ceil(promptChars / CHARS_PER_TOKEN);
  const completionTokens = Math.ceil(output.length / CHARS_PER_TOKEN);
  return {
    model,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    costMicroUsd: 0,
    estimated: true,
  };
}

/** Accounting is never allowed to fail a completion the caller already paid for. */
function emitUsage(opts: { onUsage?: (u: LlmUsageSample) => void }, sample: LlmUsageSample): void {
  if (!opts.onUsage) return;
  try {
    opts.onUsage(sample);
  } catch {
    /* best-effort */
  }
}

interface CompletionOptions {
  messages: ChatMessage[];
  /** 0..2; defaults to the model default when omitted. */
  temperature?: number;
  maxTokens?: number;
  /** Override the configured model for this call. */
  model?: string;
  signal?: AbortSignal;
  /** Called once, after the response is complete, with what the call cost. */
  onUsage?: (u: LlmUsageSample) => void;
}

/**
 * Stream a chat completion. Invokes `onDelta` for each token as it arrives and
 * resolves with the full concatenated text. Throws on transport/API errors.
 */
export async function streamChatCompletion(
  opts: CompletionOptions & { onDelta: (delta: string) => void },
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const requestedModel = resolveModel(opts.model);
  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      model: requestedModel,
      messages: opts.messages,
      stream: true,
      ...(includeStreamUsage() ? { stream_options: { include_usage: true } } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    // The provider's body can echo request context and key fragments, and this
    // message is relayed verbatim to the browser — by the self-review route's 502
    // and by the chat SSE `error` frame. Keep the detail in the server log and
    // hand the caller a status class.
    console.error(`[llm] OpenRouter request failed (${res.status}): ${await safeErrorText(res)}`);
    throw new Error(`OpenRouter request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  // `openrouter/auto` resolves to a concrete model mid-stream; bill that one.
  let billedModel = requestedModel;
  let usage: LlmUsageSample | null = null;

  const finish = (): string => {
    emitUsage(opts, usage ?? estimateUsage(billedModel, opts.messages, full));
    return full;
  };

  // OpenRouter emits Server-Sent Events: `data: {json}` lines, terminated by
  // `data: [DONE]`, with `:`-prefixed comment lines used as keep-alives.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line || line.startsWith(":")) continue; // blank / comment keep-alive
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return finish();
      try {
        const parsed = JSON.parse(data);
        if (typeof parsed?.model === "string" && parsed.model) billedModel = parsed.model;
        // The accounting frame arrives just before [DONE]. OpenRouter ships it
        // with one content-free delta repeating `finish_reason`, so it also
        // falls harmlessly through the delta branch below.
        const sample = readUsage(billedModel, parsed?.usage);
        if (sample) usage = sample;
        const delta: unknown = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          full += delta;
          opts.onDelta(delta);
        }
        const err = parsed?.error;
        if (err) throw new OpenRouterStreamError(err?.message);
      } catch (e) {
        // Only JSON noise from a partial line is ignorable. Discriminating on
        // the message text instead would swallow every provider error whose
        // wording happens not to contain "OpenRouter" — reporting a truncated
        // reply to the user as a success, and billing it as one.
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  return finish();
}

/**
 * One-shot (non-streaming) chat completion. Returns the assistant text.
 * Applies a default 45s timeout unless a signal is supplied.
 */
export async function chatCompletion(opts: CompletionOptions): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const requestedModel = resolveModel(opts.model);
  const signal = opts.signal ?? AbortSignal.timeout(45_000);
  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      model: requestedModel,
      messages: opts.messages,
      stream: false,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    }),
    signal,
  });

  if (!res.ok) {
    // The provider's body can echo request context and key fragments, and this
    // message is relayed verbatim to the browser — by the self-review route's 502
    // and by the chat SSE `error` frame. Keep the detail in the server log and
    // hand the caller a status class.
    console.error(`[llm] OpenRouter request failed (${res.status}): ${await safeErrorText(res)}`);
    throw new Error(`OpenRouter request failed (${res.status})`);
  }
  const json = await res.json();
  const content: unknown = json?.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : "";
  const billedModel =
    typeof json?.model === "string" && json.model ? json.model : requestedModel;
  emitUsage(opts, readUsage(billedModel, json?.usage) ?? estimateUsage(billedModel, opts.messages, text));
  return text;
}
