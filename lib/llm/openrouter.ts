import "server-only";

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
 *   OPENROUTER_BASE_URL  – optional override (defaults to the public endpoint).
 *   NEXT_PUBLIC_APP_URL  – optional; sent as HTTP-Referer for OpenRouter attribution.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/** Whether an LLM is configured (an API key is present). */
export function isLLMConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

let warnedPrefix = false;

/**
 * Normalize a model id to OpenRouter's own form.
 *
 * OpenRouter ids are always `vendor/model` (e.g. `openai/gpt-5.6-luna`).
 * Aggregators and directories often list them with an extra `openrouter/`
 * prefix (`openrouter/openai/gpt-5.6-luna`), which OpenRouter rejects with a
 * 400. A three-or-more-segment id starting with `openrouter/` is unambiguously
 * that mistake, so strip it — while leaving genuine two-segment ids such as
 * `openrouter/auto` untouched.
 */
export function normalizeModelId(id: string): string {
  const parts = id.split("/");
  if (parts.length >= 3 && parts[0] === "openrouter") {
    const fixed = parts.slice(1).join("/");
    if (!warnedPrefix) {
      warnedPrefix = true;
      console.warn(
        `[llm] LLM_MODEL="${id}" is not an OpenRouter id; using "${fixed}". ` +
          `Update LLM_MODEL to remove the "openrouter/" prefix.`,
      );
    }
    return fixed;
  }
  return id;
}

/** The configured model id, falling back to a sensible default. */
export function llmModel(): string {
  return normalizeModelId(process.env.LLM_MODEL || DEFAULT_MODEL);
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

async function safeErrorText(res: Response): Promise<string> {
  try {
    const body = await res.text();
    return body.slice(0, 500);
  } catch {
    return res.statusText;
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

  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      model: opts.model ? normalizeModelId(opts.model) : llmModel(),
      messages: opts.messages,
      stream: true,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`OpenRouter request failed (${res.status}): ${await safeErrorText(res)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

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
      if (data === "[DONE]") return full;
      try {
        const parsed = JSON.parse(data);
        const delta: unknown = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          full += delta;
          opts.onDelta(delta);
        }
        const err = parsed?.error;
        if (err) throw new Error(err?.message || "OpenRouter stream error");
      } catch (e) {
        // Re-throw explicit API errors; ignore JSON parse noise on partial lines.
        if (e instanceof Error && e.message.includes("OpenRouter")) throw e;
      }
    }
  }
  return full;
}

/**
 * One-shot (non-streaming) chat completion. Returns the assistant text.
 * Applies a default 45s timeout unless a signal is supplied.
 */
export async function chatCompletion(opts: CompletionOptions): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const signal = opts.signal ?? AbortSignal.timeout(45_000);
  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      model: opts.model ? normalizeModelId(opts.model) : llmModel(),
      messages: opts.messages,
      stream: false,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`OpenRouter request failed (${res.status}): ${await safeErrorText(res)}`);
  }
  const json = await res.json();
  const content: unknown = json?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}
