/**
 * `POST /api/templates/generate` — the Agent Template Generator's front door.
 *
 * TWO TRANSPORTS, ONE PIPELINE. `stream: true` (the default) answers
 * `text/event-stream` and reports each stage as it lands; `stream: false`
 * answers `202 { generationId }` and runs the same work in `after()`, for a
 * proxy that buffers SSE into uselessness or a tab that is about to be
 * backgrounded. Neither is a fallback nobody built — the frames are identical
 * and the row in `template_generations` is the same either way, which is what
 * lets a client switch transports mid-flight and keep watching.
 *
 * The SSE framing mirrors `app/api/agents/[id]/messages/route.ts`: a
 * `ReadableStream` writing `data: {json}\n\n`, `no-cache, no-transform` and
 * `x-accel-buffering: no` so an intermediary does not hold the frames back.
 *
 * DEGRADATION, which is a requirement here and not a nicety:
 *
 *  - **No `OPENROUTER_API_KEY`** — the pipeline composes the WHOLE draft from
 *    `lib/atg/deterministic.ts`, lints it, and returns it. The response is a
 *    complete, valid, materializable `AgentTemplateDraft`; only
 *    `provenance.mode` differs (`deterministic`), and the UI says so. This
 *    route has no branch that refuses.
 *  - **Monthly model budget spent** — same thing, on purpose. Answering 429
 *    because the month's spend is used up would make the product worse than it
 *    is with no key at all.
 *  - **Agent Manager unconfigured** — irrelevant here. Generating a template
 *    touches no VM; provisioning happens at materialize.
 *
 * LIMITS (per WORKSPACE, not per seat — a seat limit is one an organisation can
 * multiply by hiring):
 *
 *  - 10 generations/hour and 40/day → `429` with `limit` and
 *    `retryAfterSeconds`. Both are `ATG_MAX_GENERATIONS_PER_HOUR` /
 *    `..._PER_DAY`.
 *  - $5.00 of model spend per calendar month
 *    (`ATG_MONTHLY_COST_CAP_MICRO_USD`) → the deterministic path, not a refusal.
 *  - One in-flight generation per workspace → `409`, enforced by the partial
 *    unique index `template_generations_one_running`, with a stale sweep so a
 *    killed invocation cannot lock a workspace out forever.
 *  - The pipeline's own circuit breaker caps a run at 12 model calls
 *    (`ATG_MAX_LLM_CALLS_PER_GENERATION`), so token spend per generation is
 *    bounded before any of the above is consulted.
 */
import { after } from "next/server";
import { apiError, json, parseBody, requireAuth } from "@/lib/api";
import { isLLMConfigured } from "@/lib/llm/openrouter";
import {
  BriefTooThinError,
  generateTemplate,
  loadSeededRoles,
  runIntake,
  type GenerateResult,
} from "@/lib/atg/pipeline";
import {
  appendStageTrace,
  checkGenerationQuota,
  failGeneration,
  finishGeneration,
  GenerationConflictError,
  startGeneration,
  workspaceSlugs,
} from "@/lib/atg/queries";
import { generateTemplateSchema } from "@/lib/atg/validation";
import type { AgentTemplateDraft, DraftStageTrace, StageId } from "@/lib/atg/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A ten-stage run with repairs. The pipeline's own call ceiling bounds it long
 *  before this does; this is the backstop that stops a hung provider holding a
 *  function open. */
export const maxDuration = 120;

/**
 * The ledger the client draws, and it is transport-honest: the `skills` stage
 * exists only on the model path (`composeAllDeterministic` never runs it), so
 * announcing it in a deterministic run would leave one row spinning until the
 * draft arrived.
 */
const MODEL_LEDGER: StageId[] = [
  "intake",
  "charter",
  "capabilities",
  "skills",
  "boundaries",
  "context",
  "schedules",
  "assemble",
  "lint",
  "finalize",
];
const RULES_LEDGER: StageId[] = MODEL_LEDGER.filter((s) => s !== "skills");

/** The six sections that stream as their own frame. `agents` is not one: the
 *  draft's agents are produced inside charter/assemble and arrive whole. */
const SECTIONS = ["meta", "roles", "skills", "boundaries", "context", "schedules"] as const;

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  const parsed = await parseBody(req, generateTemplateSchema);
  if (parsed.res) return parsed.res;
  const body = parsed.data;
  const now = new Date();

  // Intake is pure and total, so the thin-brief refusal happens BEFORE a row is
  // written. A `template_generations` row that only ever says "too thin" is a
  // row that consumed the workspace's one in-flight slot for nothing.
  const facts = runIntake(
    {
      brief: body.brief,
      locale: body.locale ?? null,
      harness: body.harness ?? null,
      timezone: body.timezone ?? null,
      now,
    },
    auth.ctx.workspace,
  );
  if (facts.tooThin) {
    return apiError("Tell us a little more about the job.", 422, { code: "brief_too_thin" });
  }

  const quota = await checkGenerationQuota(auth.ctx.workspace.id, now);
  if (!quota.allowed) {
    return apiError("Too many generations for now.", 429, {
      code: "rate_limited",
      limit: quota.limit,
      retryAfterSeconds: quota.retryAfterSeconds,
    });
  }

  let generationId: string;
  try {
    const row = await startGeneration({
      workspaceId: auth.ctx.workspace.id,
      userId: auth.ctx.user.id,
      brief: facts.brief,
      briefSha256: facts.briefSha256,
      locale: facts.locale,
      harness: facts.harness,
      roleHint: body.roleHint ?? null,
      injectionFindings: facts.injection,
    });
    generationId = row.id;
  } catch (e) {
    if (e instanceof GenerationConflictError) {
      return apiError("A generation is already running for this workspace.", 409, {
        code: "generation_in_flight",
        generationId: e.generationId,
      });
    }
    throw e;
  }

  const modelPlanned = isLLMConfigured() && !quota.budgetExhausted;
  const ledger = modelPlanned ? MODEL_LEDGER : RULES_LEDGER;

  const [roles, existingSlugs] = await Promise.all([
    loadSeededRoles(),
    workspaceSlugs(auth.ctx.workspace.id),
  ]);

  const run = (onStage?: (t: DraftStageTrace) => void, signal?: AbortSignal) =>
    generateTemplate({
      brief: body.brief,
      locale: body.locale ?? null,
      harness: body.harness ?? null,
      timezone: body.timezone ?? null,
      workspace: auth.ctx.workspace,
      userId: auth.ctx.user.id,
      existingSlugs,
      budgetExhausted: quota.budgetExhausted,
      generationId,
      roles,
      now,
      ...(onStage ? { onStage } : {}),
      ...(signal ? { signal } : {}),
    });

  // ---- Queued transport ---------------------------------------------------
  if (!body.stream) {
    // `after` runs the pipeline once the 202 is on the wire. The row is already
    // `running`, so the client's first poll finds it; the stale sweep in
    // `startGeneration` is what covers the case where this invocation dies.
    after(async () => {
      const startedAt = Date.now();
      try {
        const result = await run((trace) => void appendStageTrace(generationId, trace));
        await persist(generationId, result, startedAt);
      } catch (e) {
        await failGeneration(generationId, errorCodeFor(e), startedAt);
      }
    });
    return json({ generationId, pollAfterMs: 1500 }, 202);
  }

  // ---- Streaming transport ------------------------------------------------
  return streamGeneration({
    generationId,
    ledger,
    modelPlanned,
    signal: req.signal,
    run,
  });
}

// ---------------------------------------------------------------------------
// The stream
// ---------------------------------------------------------------------------

function streamGeneration(opts: {
  generationId: string;
  ledger: StageId[];
  modelPlanned: boolean;
  signal: AbortSignal;
  run: (onStage: (t: DraftStageTrace) => void, signal: AbortSignal) => Promise<GenerateResult>;
}): Response {
  const encoder = new TextEncoder();
  const { generationId, ledger } = opts;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        } catch {
          // The client went away mid-frame. The pipeline's own abort signal is
          // what stops the work; this only stops us shouting into a closed pipe.
          closed = true;
        }
      };
      /** A comment frame. Carries no event and exists to defeat a proxy that
       *  buffers until it has "enough" bytes. */
      const ping = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          closed = true;
        }
      };

      const startedAt = Date.now();
      // `mode` here is the PLANNED mode, not the achieved one: no stage has run
      // yet, so nothing can honestly say whether any of them fell back. The
      // truth arrives in `done` as `draft.provenance.mode`.
      send({
        type: "start",
        generationId,
        mode: opts.modelPlanned ? "llm" : "deterministic",
        stages: ledger,
      });
      if (ledger[0]) {
        send({ type: "stage", stage: ledger[0], index: 0, total: ledger.length, label: ledger[0] });
      }

      let seen = 0;
      const onStage = (trace: DraftStageTrace) => {
        void appendStageTrace(generationId, trace);
        send({
          type: "stage_done",
          stage: trace.stage,
          outcome: trace.outcome,
          durationMs: trace.durationMs,
        });
        seen += 1;
        const next = ledger[Math.min(seen, ledger.length - 1)];
        if (next && seen < ledger.length) {
          ping();
          // `label` is the stage id, deliberately. Every user-visible string in
          // this app lives in `lib/i18n/*` in four languages, and the client
          // renders `t.generating.stages[stage]`; sending English prose here
          // would be a hardcoded string that only one of four audiences reads.
          send({ type: "stage", stage: next, index: seen, total: ledger.length, label: next });
        }
      };

      try {
        const result = await opts.run(onStage, opts.signal);
        const row = await persist(generationId, result, startedAt);

        for (const warning of result.warnings) send({ type: "warning", warning });
        // The pipeline composes internally and hands back one draft, so the
        // section frames are emitted from the finished draft rather than as the
        // sections are written. That is what the six-card reveal reads, and it
        // is one extra copy of a bounded document on a request that already took
        // seconds — not a second generation.
        for (const section of SECTIONS) {
          send({ type: "section", section, value: sectionValue(result.draft, section) });
        }
        send({
          type: "done",
          generationId,
          status: row?.status === "needs_review" ? "needs_review" : "ready",
          draft: result.draft,
        });
      } catch (e) {
        const code = errorCodeFor(e);
        await failGeneration(generationId, code, startedAt);
        // The message is a class, never a provider body: those carry key
        // fragments and verbatim prompt text, and this frame reaches a browser.
        send({ type: "error", message: code, code, generationId });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by the client's disconnect */
        }
      }
    },
    cancel() {
      // The tab closed or Cancel was pressed. `req.signal` has already aborted,
      // so the pipeline is unwinding; the row is left for the stale sweep rather
      // than written from a torn-down request context.
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform, no-store",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}

// ---------------------------------------------------------------------------
// Shared tail
// ---------------------------------------------------------------------------

function sectionValue(draft: AgentTemplateDraft, section: (typeof SECTIONS)[number]): unknown {
  switch (section) {
    case "meta":
      return draft.meta;
    case "roles":
      return draft.roles;
    case "skills":
      return draft.skills;
    case "boundaries":
      return draft.boundaries;
    case "context":
      return draft.context;
    case "schedules":
      return draft.schedules;
  }
}

function persist(generationId: string, result: GenerateResult, startedAt: number) {
  return finishGeneration(generationId, {
    draft: result.draft,
    mode: result.mode,
    stageTraces: result.stages,
    warnings: result.warnings,
    materializable: result.materializable,
    startedAt,
  });
}

/**
 * A NORMALIZED class, never a message.
 *
 * `template_generations.error_code` is `varchar(40)` and is read by support
 * staff, and the same string is what the `error` frame carries to the browser.
 * An upstream body in either place would leak request URLs and prompt text.
 */
function errorCodeFor(e: unknown): string {
  if (e instanceof BriefTooThinError) return "brief_too_thin";
  if (e instanceof DOMException && e.name === "AbortError") return "aborted";
  if (e instanceof Error && e.name === "AbortError") return "aborted";
  return "pipeline_failed";
}
