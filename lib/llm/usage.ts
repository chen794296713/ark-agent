import "server-only";

/**
 * LLM cost accounting.
 *
 * Every model call in ArkAgent lands one row in `llm_usage` — successes and
 * failures alike, so the admin console can show error rates and not just spend.
 * The write is deliberately fire-and-forget in effect: it swallows its own
 * failures, because a broken analytics insert must never surface in a user's
 * chat or block a hire flow.
 */

import { db } from "@/lib/db";
import { llmCallKindEnum, llmUsage } from "@/lib/db/schema";
import { llmModel, type LlmUsageSample } from "@/lib/llm/openrouter";

export type LlmCallKind = (typeof llmCallKindEnum.enumValues)[number];

/**
 * A normalized failure class — never the provider's message. `llm_usage.error_code`
 * is served to support staff, and OpenRouter error bodies carry key fragments
 * and verbatim prompt text.
 */
export type LlmErrorCode = "timeout" | "upstream_4xx" | "upstream_5xx" | "no_key" | "unknown";

/** `llm_usage.model` is varchar(160); an `openrouter/auto` resolution can be long. */
const MODEL_MAX = 160;

/** Thrown by openrouter.ts as `OpenRouter request failed (429): <body>`. */
const STATUS_RE = /OpenRouter request failed \((\d{3})\)/;

/** Map any thrown value onto one of the five stored classes. */
export function classifyLlmError(e: unknown): LlmErrorCode {
  if (!e) return "unknown";

  // fetch() rejects an aborted or timed-out request with a DOMException whose
  // name is AbortError / TimeoutError, and carries no useful message.
  const name = typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "";
  if (name === "AbortError" || name === "TimeoutError") return "timeout";

  const message = e instanceof Error ? e.message : String(e);
  if (message.includes("OPENROUTER_API_KEY is not set")) return "no_key";

  const status = STATUS_RE.exec(message);
  if (status) {
    const code = Number(status[1]);
    if (code >= 500) return "upstream_5xx";
    if (code >= 400) return "upstream_4xx";
  }
  return "unknown";
}

export interface RecordLlmUsageInput {
  /** Absent when the call failed before the provider reported anything. */
  sample?: LlmUsageSample | null;
  kind: LlmCallKind;
  userId?: string | null;
  workspaceId?: string | null;
  agentId?: string | null;
  latencyMs?: number | null;
  errorCode?: LlmErrorCode | null;
}

/** Record one model call. Never throws, never rejects. */
export async function recordLlmUsage(input: RecordLlmUsageInput): Promise<void> {
  try {
    const s = input.sample ?? null;
    await db.insert(llmUsage).values({
      userId: input.userId ?? null,
      workspaceId: input.workspaceId ?? null,
      agentId: input.agentId ?? null,
      kind: input.kind,
      // A failed call still names the model we were about to bill against.
      model: (s?.model || llmModel()).slice(0, MODEL_MAX),
      promptTokens: s?.promptTokens ?? 0,
      completionTokens: s?.completionTokens ?? 0,
      totalTokens: s?.totalTokens ?? 0,
      costMicroUsd: s?.costMicroUsd ?? 0,
      // No sample means the zeros below are a placeholder, not a measurement —
      // flag them so aggregate spend never silently under-reports as fact.
      estimated: s ? s.estimated : true,
      latencyMs: input.latencyMs == null ? null : Math.max(0, Math.round(input.latencyMs)),
      errorCode: input.errorCode ?? null,
    });
  } catch (e) {
    // One line, no payload: the values we were inserting include the model id
    // and ids, and the driver error may quote the statement.
    console.warn(
      `[llm-usage] insert failed for kind=${input.kind} (${e instanceof Error ? e.name : "unknown"})`,
    );
  }
}
