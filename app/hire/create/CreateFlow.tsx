"use client";

/**
 * The DESCRIBE → GENERATING → REVIEW state machine (docs/UI_DESIGN_V2.md §C).
 *
 * Everything that is not pure lives here: the abort controller, the polling
 * loop, and the two commits. The three screens are presentational and take
 * exactly what they draw.
 *
 * **Degradation is the default, not the fallback.**
 *  - No `OPENROUTER_API_KEY`: the route still streams the same ten stages and
 *    answers `mode: "deterministic"`; this file does nothing differently, and
 *    C.2 shows the rule-based banner. Never an error.
 *  - The generate route not deployed / the provider down: a 404 or a network
 *    failure surfaces as a `GenerateFailure` with `kind: "unavailable"` on the
 *    DESCRIBE screen, with the brief still in the textarea.
 *  - Agent Manager unconfigured: nothing here changes. `managerMode` stays
 *    `"unconfigured"`, which is what makes every skill render `⚠ unverified`
 *    rather than a tick nobody has earned (§C.3.1, RISKS R4). It is a floor:
 *    the only way to a green tick is a route that asserts one, and none does
 *    yet, so the honest answer is the one the user gets.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useHarnessOptions } from "@/lib/harness/client";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { resolveLocalTimeZone } from "@/components/create/shared";
import { useApp } from "@/lib/store";
import { create } from "@/lib/i18n/create";
import { isHarness } from "@/lib/harness";
import type { AgentTemplateDraft, StageId, StageOutcome } from "@/lib/atg/types";
import {
  GenerateFailure,
  cancelGeneration,
  fetchGeneration,
  materializeTemplate,
  saveTemplate,
  streamGeneration,
  type GenerationStatus,
} from "@/components/create/client";
import {
  briefLine as clampBrief,
  fallbackStages,
  isDraftLike,
  stageRows,
  type GenerationMode,
  type ManagerMode,
  type StreamedSection,
} from "@/components/create/logic";
import DescribeStep, {
  emptyDescribeValue,
  type DescribeValue,
} from "@/components/create/DescribeStep";
import GeneratingStep, { type GeneratingCost } from "@/components/create/GeneratingStep";
// The six generated sections. `ReviewSections` is the richer implementation —
// one component per section, each independently editable — and replaces the
// single-file ReviewStep that shipped first.
import ReviewSections from "@/components/create/ReviewSections";

type Phase = "describe" | "generating" | "review";

/**
 * Nothing configured has asserted a live runtime to this screen, and §C.3.1 is
 * explicit that `unknown` must not be drawn as either a tick or a cross. A
 * constant, not a guess: when a route starts reporting the mode, it replaces
 * this and the SKILLS rows get their third state from real data.
 */
const MANAGER_MODE: ManagerMode = "unconfigured";

interface StageRecord {
  outcome: StageOutcome | null;
  durationMs: number | null;
}

export default function CreateFlow() {
  const router = useRouter();
  const { options: harnessOptions } = useHarnessOptions();
  const enabledHarnessIds = useMemo(
    () => harnessOptions.filter((h) => h.enabled).map((h) => h.id),
    [harnessOptions],
  );
  const params = useSearchParams();
  const { lang } = useApp();
  const t = create[lang];

  const [phase, setPhase] = useState<Phase>("describe");
  const [value, setValue] = useState<DescribeValue>(emptyDescribeValue);
  const [failure, setFailure] = useState<GenerateFailure | null>(null);

  const [generationId, setGenerationId] = useState<string | null>(null);
  const [mode, setMode] = useState<GenerationMode | null>(null);
  const [stages, setStages] = useState<StageId[]>([]);
  const [seen, setSeen] = useState<Map<StageId, StageRecord>>(() => new Map());
  const [active, setActive] = useState<StageId | null>(null);
  const [streamed, setStreamed] = useState<Set<StreamedSection>>(() => new Set());
  const [draft, setDraft] = useState<AgentTemplateDraft | null>(null);
  const [complete, setComplete] = useState(false);
  const [cost, setCost] = useState<GeneratingCost | null>(null);
  const [fallbacks, setFallbacks] = useState<StageId[]>([]);
  const [streamFailed, setStreamFailed] = useState(false);
  const [polling, setPolling] = useState(false);

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [provisionNotice, setProvisionNotice] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  // A generation the user resumed from `?generation=`; read once on mount.
  const resumeId = params.get("generation");

  const resetRun = useCallback(() => {
    setGenerationId(null);
    setMode(null);
    setStages([]);
    setSeen(new Map());
    setActive(null);
    setStreamed(new Set());
    setDraft(null);
    setComplete(false);
    setCost(null);
    setFallbacks([]);
    setStreamFailed(false);
    setPolling(false);
    setCommitError(null);
    setProvisionNotice(false);
  }, []);

  /** Fold one status poll into the same state the stream writes. */
  const applyStatus = useCallback((status: GenerationStatus) => {
    setMode(status.mode);
    const progress = status.progress;
    if (progress) {
      setStages((prev) => (prev.length > 0 ? prev : seedStages(progress.total)));
      setActive(progress.stage);
    }
    setSeen(
      new Map(
        status.stageTraces.map((trace) => [
          trace.stage,
          { outcome: trace.outcome, durationMs: trace.durationMs },
        ]),
      ),
    );
    setFallbacks(fallbackStages(status.stageTraces));
    setCost(status.cost);
    if (status.status === "failed" || status.status === "canceled") {
      setStreamFailed(true);
      return;
    }
    if (isDraftLike(status.draft)) {
      setDraft(status.draft);
      setComplete(status.status !== "queued" && status.status !== "running");
      if (status.status !== "queued" && status.status !== "running") setActive(null);
    }
  }, []);

  const start = useCallback(
    async (brief: DescribeValue) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      resetRun();
      setFailure(null);
      setPhase("generating");
      try {
        await streamGeneration(
          {
            brief: brief.brief.trim(),
            locale: lang,
            harness: isHarness(brief.harness) ? brief.harness : undefined,
            channels: brief.channels.length > 0 ? brief.channels : undefined,
            // Resolved here rather than in the DESCRIBE state, so the SSR pass
            // and hydration cannot disagree about the picker's value.
            timezone: brief.timezone || resolveLocalTimeZone(),
          },
          {
            signal: controller.signal,
            onEvent: (event) => {
              switch (event.type) {
                case "start":
                  setGenerationId(event.generationId);
                  setMode(event.mode);
                  setStages(event.stages);
                  break;
                case "stage":
                  setActive(event.stage);
                  break;
                case "stage_done":
                  setActive((cur) => (cur === event.stage ? null : cur));
                  setSeen((prev) => {
                    const next = new Map(prev);
                    next.set(event.stage, {
                      outcome: event.outcome,
                      durationMs: event.durationMs,
                    });
                    return next;
                  });
                  break;
                case "section":
                  setStreamed((prev) => new Set(prev).add(event.section));
                  setDraft((prev) => mergeSection(prev, event.section, event.value));
                  // The user can start editing ROLES while SKILLS is still
                  // being written — that is the point of streaming sections.
                  setPhase((p) => (p === "generating" ? "review" : p));
                  break;
                case "done":
                  if (!isDraftLike(event.draft)) {
                    setStreamFailed(true);
                    break;
                  }
                  setDraft(event.draft);
                  setFallbacks(fallbackStages(event.draft.provenance.stages));
                  setMode(event.draft.provenance.mode);
                  setComplete(true);
                  setActive(null);
                  setPhase("review");
                  break;
                case "error":
                  // §C.2: keep the completed stages on screen and mark the
                  // failed one — the stages that succeeded are what tells the
                  // user how far it got. So the ledger comes back even if a
                  // streamed section had already moved us on to REVIEW.
                  setStreamFailed(true);
                  setActive(null);
                  setPhase("generating");
                  break;
                case "warning":
                  break;
              }
            },
          },
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        const f =
          err instanceof GenerateFailure
            ? err
            : new GenerateFailure("unknown", err instanceof Error ? err.message : "unknown");
        if (f.kind === "auth") {
          router.push("/auth");
          return;
        }
        setFailure(f);
        setPhase("describe");
      }
    },
    [lang, resetRun, router],
  );

  // ---- resume a generation started elsewhere (409 → "Open it", or a link) ----
  useEffect(() => {
    if (!resumeId) return;
    let alive = true;
    const controller = new AbortController();
    const loop = async () => {
      setPhase("generating");
      setPolling(true);
      setGenerationId(resumeId);
      let delay = 1500;
      for (let i = 0; alive && i < 400; i++) {
        try {
          const status = await fetchGeneration(resumeId, controller.signal);
          if (!alive) return;
          applyStatus(status);
          if (status.status === "failed" || status.status === "canceled") return;
          if (isDraftLike(status.draft) && status.status !== "running" && status.status !== "queued") {
            setPhase("review");
            return;
          }
        } catch (err) {
          if (!alive) return;
          // A 404 here is another workspace's id or a route that is not
          // deployed. Both mean "we cannot show you this", not a crash.
          setPolling(false);
          setPhase("describe");
          setFailure(
            err instanceof GenerateFailure ? err : new GenerateFailure("unavailable", "poll"),
          );
          return;
        }
        await sleep(delay);
        delay = Math.min(delay * 1.4, 8000);
      }
    };
    void loop();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [resumeId, applyStatus]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const cancel = () => {
    abortRef.current?.abort();
    if (generationId) void cancelGeneration(generationId);
    resetRun();
    setPhase("describe");
  };

  const commit = async (kind: "template" | "agent") => {
    if (!draft || committing) return;
    setCommitting(true);
    setCommitError(null);
    setProvisionNotice(false);
    try {
      const { template } = await saveTemplate(draft, generationId ?? undefined);
      if (kind === "template") {
        router.push("/dashboard/templates");
        return;
      }
      const result = await materializeTemplate(
        template.id,
        {
          name: draft.meta.name,
          channels: draft.agents[0]?.channels ?? [],
          acceptWarnings: true,
          acknowledgedWarnings: draft.provenance.warnings.map((w) => w.code),
        },
        newIdempotencyKey(),
      );
      if (!result.provisioned) setProvisionNotice(true);
      router.push(`/dashboard/fleet/${result.agent.id}`);
    } catch (err) {
      if (err instanceof GenerateFailure && err.kind === "auth") {
        router.push("/auth");
        return;
      }
      setCommitError(t.review.error);
    } finally {
      setCommitting(false);
    }
  };

  const rows = stageRows(stages, seen, active);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          height: 60,
          borderBottom: `1px solid ${c.line}`,
          display: "flex",
          alignItems: "center",
          padding: `0 ${r.pagePx}`,
          gap: 24,
        }}
      >
        <Btn
          onClick={() => router.push("/hire")}
          style={{
            background: "none",
            border: "none",
            color: c.muted,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: font.sans,
            padding: 0,
          }}
          hoverStyle={{ color: c.text }}
        >
          ← {t.common.back}
        </Btn>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            letterSpacing: ".14em",
            color: c.accent,
          }}
        >
          {phase === "review"
            ? t.review.title
            : phase === "generating"
              ? t.generating.title
              : t.describe.textareaLabel}
        </span>
      </div>

      <div
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 1240,
          margin: "0 auto",
          padding: `40px ${r.pagePx} 96px`,
        }}
      >
        {phase === "describe" && (
          <DescribeStep
            lang={lang}
            value={value}
            onChange={setValue}
            busy={false}
            failure={failure}
            onSubmit={() => void start(value)}
            onRetry={() => void start(value)}
            onOpenConflict={(id) => router.push(`/hire/create?generation=${encodeURIComponent(id)}`)}
            // Only the harnesses this deployment can actually provision. The
            // component defaults to all four, which would offer a runtime that
            // POST /api/agents then refuses with a 422.
            harnesses={enabledHarnessIds}
          />
        )}

        {phase === "generating" && (
          <GeneratingStep
            lang={lang}
            briefLine={clampBrief(value.brief)}
            rows={rows}
            mode={mode}
            fallbacks={fallbacks}
            cost={cost}
            polling={polling}
            failed={streamFailed}
            onCancel={cancel}
            onRetry={() => void start(value)}
            onStartOver={() => {
              resetRun();
              setPhase("describe");
            }}
          />
        )}

        {phase === "review" && draft && (
          <ReviewSections
            lang={lang}
            draft={draft}
            onChange={setDraft}
            managerMode={MANAGER_MODE}
            streamed={streamed}
            complete={complete}
            busy={committing}
            error={commitError}
            provisionNotice={provisionNotice}
            onSaveTemplate={() => void commit("template")}
            onContinue={() => void commit("agent")}
          />
        )}
      </div>
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A per-attempt key. `crypto.randomUUID` is unavailable on insecure origins. */
function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `atg-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Placeholder ids for the polling transport, which reports only `index/total`
 *  before the first trace lands. Replaced the moment real ids arrive. */
function seedStages(total: number): StageId[] {
  const ORDER: StageId[] = [
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
  return ORDER.slice(0, Math.max(0, Math.min(ORDER.length, total)));
}

/**
 * Fold one `section` frame into the in-progress draft.
 *
 * The frame's `value` is `unknown` by contract, so every branch checks the
 * shape before writing: a malformed frame must leave the previous draft alone,
 * not replace `roles` with a string and take the review screen down with it.
 * `done` replaces this wholesale after `isDraftLike`, so nothing built here
 * survives into what gets saved.
 */
function mergeSection(
  prev: AgentTemplateDraft | null,
  section: StreamedSection,
  value: unknown,
): AgentTemplateDraft | null {
  const base = prev ?? emptyDraft();
  switch (section) {
    case "meta":
      return typeof value === "object" && value !== null
        ? { ...base, meta: { ...base.meta, ...(value as object) } }
        : base;
    case "boundaries":
      return typeof value === "object" && value !== null
        ? { ...base, boundaries: { ...base.boundaries, ...(value as object) } }
        : base;
    case "roles":
      return Array.isArray(value) ? { ...base, roles: value } : base;
    case "skills":
      return Array.isArray(value) ? { ...base, skills: value } : base;
    case "context":
      return Array.isArray(value) ? { ...base, context: value } : base;
    case "schedules":
      return Array.isArray(value) ? { ...base, schedules: value } : base;
  }
}

/** The shell a streamed section lands in before `done` sends the real thing. */
function emptyDraft(): AgentTemplateDraft {
  return {
    schemaVersion: 1,
    locale: "en",
    harness: "openclaw",
    meta: {
      name: "",
      slug: "",
      summary: "",
      description: "",
      category: "other",
      tags: [],
      mono: "·",
      hue: "#D8FF3E",
      minPlan: "associate",
      estimatedCreditsPerMonth: 0,
    },
    roles: [],
    agents: [],
    skills: [],
    boundaries: {
      autonomy: "ask",
      approvalAmountUsd: 0,
      approveExternalSends: true,
      dailyActionLimit: 0,
      rules: [],
      prohibitions: [],
      escalation: { to: null, triggers: [], channel: "none" },
      dataHandling: { piiAllowed: false, retentionDays: 30, redactFields: [] },
      spend: { monthlyCreditCap: 0 },
    },
    context: [],
    schedules: [],
    provenance: {
      generationId: "",
      mode: "deterministic",
      stages: [],
      briefSha256: "",
      warnings: [],
      injectionFindings: [],
      materializable: false,
    },
  };
}
