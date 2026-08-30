import "server-only";

/**
 * The staged generator.
 *
 * Ten stages, four of them pure. Each model stage validates against its OWN
 * section schema immediately, so a failure is attributed to the stage that
 * caused it; `charter` and `boundaries` get up to two repair calls at
 * temperature 0; every stage that still fails is SUBSTITUTED by its
 * deterministic composer and keeps going. A generation therefore cannot fail —
 * it can only get less model-written, which is what `mode` reports.
 *
 * `mode` is reported honestly and is not decoration:
 *   `deterministic` — no model ran at all (no key, `ATG_DISABLE_LLM=1`, or the
 *                     circuit breaker tripped before the first call)
 *   `hybrid`        — at least one stage fell back
 *   `llm`           — every model stage returned `ok` or `repaired`
 *
 * Why staged and not one prompt: skill hallucination is unfixable inside a
 * single prompt (the model must never emit an identifier — see
 * `lib/atg/retrieval.ts`), safety sections and creative sections want opposite
 * temperatures, strict-JSON compliance collapses with schema size, repair has to
 * be surgical or the user watching the screen sees the agent's NAME change
 * because their approval threshold was out of range, and fallback has to be
 * per-stage or a 429 on stage 5 throws away four good sections.
 *
 * `server-only`: this module reads the environment, calls OpenRouter, queries
 * the catalogue and writes `llm_usage`. Everything it composes with —
 * `prompts.ts`, `deterministic.ts`, `validate.ts`, `schema.ts` — is pure and
 * stays that way.
 */
import { createHash, randomUUID } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentRoles, type AgentRole } from "@/lib/db/schema";
import { chatCompletion, isLLMConfigured, llmModel, normalizeModelId } from "@/lib/llm/openrouter";
import type { LlmUsageSample } from "@/lib/llm/openrouter";
import { classifyLlmError, recordLlmUsage } from "@/lib/llm/usage";
import { DEFAULT_SETTINGS } from "@/lib/agent-settings";
import { HARNESS_IDS, type Harness } from "@/lib/harness";
import type { Lang } from "@/lib/types";
import { isValidTimeZone, zonedParts } from "@/lib/schedule/cron";
import { describeCron } from "@/lib/schedule/describe";
import { parseSchedulePhrase } from "@/lib/schedule/parse";
import {
  boundariesResponseSchema,
  capabilitiesResponseSchema,
  charterResponseSchema,
  contextResponseSchema,
  narrationResponseSchema,
  schedulesResponseSchema,
  skillRerankResponseSchema,
  type CapabilityRequest,
} from "./schema";
import {
  boundariesPrompt,
  capabilitiesPrompt,
  charterPrompt,
  contextPrompt,
  narratePrompt,
  repairPrompt,
  schedulesPrompt,
  skillRerankPrompt,
  type StagePrompt,
} from "./prompts";
import {
  buildTemplateSkills,
  composeDeterministic,
  detectChannelHints,
  detectMoneyHints,
  detectToolHints,
  deterministicBoundaries,
  deterministicCapabilities,
  deterministicCharterRole,
  deterministicContext,
  deterministicSchedules,
  parseScheduleHints,
  resolveRole,
  selectSkills,
  type CatalogCandidate,
  type IntakeFacts,
} from "./deterministic";
import { findCandidates, resolveRerank } from "./retrieval";
import {
  contentTokenCount,
  isTooThin,
  lintDraft,
  normalizeBrief,
  readJsonObject,
  remediateDraft,
  screenInjection,
  validateDraft,
} from "./validate";
import { CONTEXT_DEFAULT_MAX_BYTES, DEFAULT_CONTEXT_MIME_TYPES, isContextMimeType } from "./safety";
import type {
  AgentTemplateDraft,
  DraftStageTrace,
  DraftWarning,
  StageId,
  StageOutcome,
  TemplateContextItem,
  TemplateRole,
  TemplateSchedule,
  TemplateSkill,
} from "./types";

// ---------------------------------------------------------------------------
// Model tiers and cost control
// ---------------------------------------------------------------------------

type ModelTier = "reason" | "fast";

/**
 * Reasoning work (charter, boundaries) defaults to the deployment's configured
 * model; volume work can be pointed at something cheaper. Both fall back to
 * `LLM_MODEL`, so a deployment that sets nothing new keeps working exactly as
 * before.
 */
function atgModel(tier: ModelTier): string {
  const raw = tier === "reason" ? process.env.ATG_REASON_MODEL : process.env.ATG_FAST_MODEL;
  return normalizeModelId(raw || "") || llmModel();
}

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** The circuit breaker. Worst case with every repair fired is 11 calls. */
function maxCalls(): number {
  return intEnv("ATG_MAX_LLM_CALLS_PER_GENERATION", 12);
}

/** `1` forces the deterministic path even with a key configured — used by evals. */
function llmDisabled(): boolean {
  return process.env.ATG_DISABLE_LLM === "1";
}

// ---------------------------------------------------------------------------
// Stage 0 · intake
// ---------------------------------------------------------------------------

export interface IntakeInput {
  brief: string;
  locale?: Lang | null;
  harness?: Harness | null;
  /** IANA. Falls back to the workspace zone, then to `DEFAULT_SETTINGS`. */
  timezone?: string | null;
  now?: Date;
}

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿]/g;

/** `request.locale` wins; absent, script ratios; else English. */
function detectLocale(brief: string, requested: Lang | null | undefined): Lang {
  if (requested) return requested;
  const cjk = (brief.match(CJK_RE) ?? []).length;
  if (cjk === 0) return "en";
  // Kana is the only cheap zh/ja discriminator that does not need a dictionary.
  if (/[぀-ゟ゠-ヿ]/.test(brief)) return "ja";
  // Simplified vs traditional: a handful of high-frequency characters that
  // differ. Wrong occasionally, and wrong in a way the user fixes with one tap
  // on the language switcher — unlike a wrong LOCALE FIELD, which would write a
  // whole template in the wrong script.
  return /[個們來這對時開國語會與後點題]/.test(brief) ? "zht" : "zh";
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Deterministic, total, and never a model call. Produces everything the later
 * stages read — including the ONE time zone every schedule in the draft shares,
 * resolved here because `parseSchedulePhrase({ today })` needs it to read
 * "tomorrow at 9" and this is where the sentences are parsed.
 */
export function runIntake(
  input: IntakeInput,
  workspace: { timezone: string },
): IntakeFacts {
  const { brief, findings } = normalizeBrief(input.brief);
  const locale = detectLocale(brief, input.locale);
  const timezone =
    input.timezone && isValidTimeZone(input.timezone)
      ? input.timezone
      : isValidTimeZone(workspace.timezone)
        ? workspace.timezone
        : DEFAULT_SETTINGS.timezone;
  const now = input.now ?? new Date();
  const parts = zonedParts(now, timezone);

  return {
    brief,
    briefSha256: sha256Hex(brief),
    locale,
    harness: input.harness && HARNESS_IDS.includes(input.harness) ? input.harness : "openclaw",
    // Filled by `withRoleGuess` once the seeded rows are in hand — intake itself
    // does no I/O, and the roles are a database read.
    roleGuess: { roleId: "admin", score: 0, alternatives: [] },
    channelHints: detectChannelHints(brief),
    toolHints: detectToolHints(brief),
    scheduleHints: parseScheduleHints(brief, {
      year: parts.year,
      month: parts.month,
      day: parts.day,
    }),
    moneyHints: detectMoneyHints(brief),
    // Findings from normalization (what was stripped) plus the regex bank.
    injection: [...findings, ...screenInjection(brief)].slice(0, 40),
    timezone,
    tooThin: isTooThin(brief, locale),
  };
}

/** The second half of intake, once the seeded roles have been read. */
export function withRoleGuess(facts: IntakeFacts, roles: AgentRole[]): IntakeFacts {
  return { ...facts, roleGuess: resolveRole(facts.brief, facts.locale, roles) };
}

/** The seeded catalogue rows §8 requires the caller to supply. */
export async function loadSeededRoles(): Promise<AgentRole[]> {
  return db
    .select()
    .from(agentRoles)
    .where(inArray(agentRoles.id, ["prospector", "salesmkt", "admin", "hr", "support", "legal", "content", "opc"]))
    .orderBy(asc(agentRoles.sortOrder));
}

/** One role by id, workspace-independent (`agent_roles` is a global catalogue). */
export async function loadRole(roleId: string): Promise<AgentRole | null> {
  const [row] = await db.select().from(agentRoles).where(eq(agentRoles.id, roleId)).limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// The stage runner
// ---------------------------------------------------------------------------

interface RunContext {
  facts: IntakeFacts;
  roles: AgentRole[];
  role: AgentRole;
  workspace: { id: string; name: string | null; timezone: string };
  userId: string | null;
  now: Date;
  generationId: string;
  traces: DraftStageTrace[];
  calls: number;
  usedLlm: boolean;
  fellBack: boolean;
  onStage?: (trace: DraftStageTrace) => void;
  signal?: AbortSignal;
}

function trace(
  ctx: RunContext,
  stage: StageId,
  engine: DraftStageTrace["engine"],
  outcome: StageOutcome,
  extra: Partial<DraftStageTrace> = {},
): void {
  const row: DraftStageTrace = {
    stage,
    engine,
    model: null,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    attempts: 0,
    outcome,
    promptTokens: 0,
    completionTokens: 0,
    errorCode: null,
    ...extra,
  };
  ctx.traces.push(row);
  ctx.onStage?.(row);
  if (outcome === "fallback" || outcome === "failed") ctx.fellBack = true;
  if (engine === "llm" && (outcome === "ok" || outcome === "repaired")) ctx.usedLlm = true;
}

interface CallResult {
  text: string | null;
  sample: LlmUsageSample | null;
  errorCode: string | null;
  latencyMs: number;
}

/**
 * One model call, always accounted for.
 *
 * Every call lands one `llm_usage` row with kind `template_gen` — successes and
 * failures alike, so the admin console can show error rates and not only spend.
 * The provider's message is never stored or returned: `classifyLlmError()`
 * normalizes it, because OpenRouter error bodies carry key fragments and
 * verbatim prompt text.
 */
async function callModel(
  ctx: RunContext,
  tier: ModelTier,
  prompt: { system: string; user: string },
  temperature: number,
  maxTokens: number,
): Promise<CallResult> {
  const started = Date.now();
  const model = atgModel(tier);
  if (ctx.calls >= maxCalls()) {
    return { text: null, sample: null, errorCode: "budget", latencyMs: 0 };
  }
  ctx.calls += 1;
  let sample: LlmUsageSample | null = null;
  try {
    const text = await chatCompletion({
      model,
      temperature,
      maxTokens,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      ...(ctx.signal ? { signal: ctx.signal } : {}),
      onUsage: (u) => {
        sample = u;
      },
    });
    const latencyMs = Date.now() - started;
    void recordLlmUsage({
      sample,
      kind: "template_gen",
      userId: ctx.userId,
      workspaceId: ctx.workspace.id,
      latencyMs,
    });
    return { text, sample, errorCode: null, latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - started;
    const errorCode = classifyLlmError(e);
    void recordLlmUsage({
      sample,
      kind: "template_gen",
      userId: ctx.userId,
      workspaceId: ctx.workspace.id,
      latencyMs,
      errorCode,
    });
    return { text: null, sample, errorCode, latencyMs };
  }
}

interface StageOptions<T> {
  stage: StageId;
  tier: ModelTier;
  temperature: number;
  maxTokens: number;
  prompt: StagePrompt;
  parse: (value: unknown) => { success: true; data: T } | { success: false; errors: string };
  /** Only `charter` and `boundaries` repair; see the note at the call sites. */
  repairs: 0 | 2;
}

/**
 * Tolerant read → up to `repairs` corrections at temperature 0 → give up.
 *
 * Two repair iterations, not three: the third attempt's marginal success rate
 * does not justify a third round-trip on a screen the user is watching, and the
 * deterministic section is always available.
 */
async function runLlmStage<T>(ctx: RunContext, o: StageOptions<T>): Promise<T | null> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  let attempts = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let lastErrorCode: string | null = null;
  let previous = "";
  let errors = "";
  let prompt: { system: string; user: string } = { system: o.prompt.system, user: o.prompt.user };

  for (let round = 0; round <= o.repairs; round++) {
    attempts += 1;
    const call = await callModel(
      ctx,
      round === 0 ? o.tier : "fast",
      prompt,
      round === 0 ? o.temperature : 0,
      o.maxTokens,
    );
    promptTokens += call.sample?.promptTokens ?? 0;
    completionTokens += call.sample?.completionTokens ?? 0;
    if (call.errorCode) {
      lastErrorCode = call.errorCode;
      break;
    }
    previous = call.text ?? "";
    const read = readJsonObject(previous);
    if (read.ok) {
      const parsed = o.parse(read.value);
      if (parsed.success) {
        trace(ctx, o.stage, "llm", round === 0 ? "ok" : "repaired", {
          model: atgModel(o.tier),
          startedAt,
          durationMs: Date.now() - started,
          attempts,
          promptTokens,
          completionTokens,
        });
        return parsed.data;
      }
      errors = parsed.errors;
      lastErrorCode = "schema";
    } else {
      errors = read.reason;
      lastErrorCode = "unparseable";
    }
    if (round === o.repairs) break;
    prompt = repairPrompt({
      lang: ctx.facts.locale,
      stage: o.stage,
      shape: o.prompt.shape,
      previous,
      errors,
    });
  }

  trace(ctx, o.stage, "llm", "fallback", {
    model: atgModel(o.tier),
    startedAt,
    durationMs: Date.now() - started,
    attempts,
    promptTokens,
    completionTokens,
    errorCode: lastErrorCode,
  });
  return null;
}

function zodParser<T>(schema: {
  safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: unknown };
}) {
  return (value: unknown): { success: true; data: T } | { success: false; errors: string } => {
    const r = schema.safeParse(value);
    if (r.success) return { success: true, data: r.data as T };
    return { success: false, errors: JSON.stringify(r.error).slice(0, 2000) };
  };
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

export interface GenerateInput {
  brief: string;
  locale?: Lang | null;
  harness?: Harness | null;
  timezone?: string | null;
  workspace: { id: string; name: string | null; timezone: string };
  userId?: string | null;
  /** Slugs already used in this workspace, for `ATG-L020`. */
  existingSlugs?: string[];
  /** The workspace's ATG spend is exhausted; force the deterministic path. */
  budgetExhausted?: boolean;
  generationId?: string;
  now?: Date;
  /** Seeded roles, if the caller already has them. Read here otherwise. */
  roles?: AgentRole[];
  onStage?: (trace: DraftStageTrace) => void;
  signal?: AbortSignal;
}

export interface GenerateResult {
  draft: AgentTemplateDraft;
  mode: AgentTemplateDraft["provenance"]["mode"];
  stages: DraftStageTrace[];
  warnings: DraftWarning[];
  materializable: boolean;
  facts: IntakeFacts;
}

/** Thrown for a brief with fewer than three content tokens. The route answers 422. */
export class BriefTooThinError extends Error {
  readonly tokens: number;
  constructor(tokens: number) {
    super("brief is too thin to generate from");
    this.name = "BriefTooThinError";
    this.tokens = tokens;
  }
}

export async function generateTemplate(input: GenerateInput): Promise<GenerateResult> {
  const now = input.now ?? new Date();
  const roles = input.roles ?? (await loadSeededRoles());
  const facts = withRoleGuess(
    runIntake(
      {
        brief: input.brief,
        locale: input.locale ?? null,
        harness: input.harness ?? null,
        timezone: input.timezone ?? null,
        now,
      },
      input.workspace,
    ),
    roles,
  );
  if (facts.tooThin) throw new BriefTooThinError(contentTokenCount(facts.brief, facts.locale));

  const role =
    roles.find((r) => r.id === facts.roleGuess.roleId) ??
    roles.find((r) => r.id === "admin") ??
    roles[0];
  const generationId = input.generationId ?? randomUUID();
  const ctx: RunContext = {
    facts,
    roles,
    role,
    workspace: input.workspace,
    userId: input.userId ?? null,
    now,
    generationId,
    traces: [],
    calls: 0,
    usedLlm: false,
    fellBack: false,
    ...(input.onStage ? { onStage: input.onStage } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  };

  trace(ctx, "intake", "rules", "ok");

  const modelAvailable = isLLMConfigured() && !llmDisabled() && input.budgetExhausted !== true;
  const draft = modelAvailable
    ? await generateWithModel(ctx)
    : composeAllDeterministic(ctx, await retrieveDeterministic(ctx));

  // Stage 8 · lint. Runs in EVERY mode: the fallback composer is not exempt from
  // its own safety rules.
  const lintStarted = new Date().toISOString();
  const lintFrom = Date.now();
  const linted = remediateDraft(draft, {
    ...(input.existingSlugs ? { existingSlugs: input.existingSlugs } : {}),
    ...(input.budgetExhausted ? { budgetExhausted: true } : {}),
    seeded: { mono: role?.mono ?? "A", hue: role?.hue ?? "#F472B6" },
    now,
  });
  trace(ctx, "lint", "rules", "ok", { startedAt: lintStarted, durationMs: Date.now() - lintFrom });

  const mode = ctx.usedLlm ? (ctx.fellBack ? "hybrid" : "llm") : "deterministic";
  const finalDraft: AgentTemplateDraft = {
    ...linted.draft,
    provenance: {
      ...linted.draft.provenance,
      generationId,
      mode,
      stages: ctx.traces,
      warnings: linted.warnings,
      materializable: linted.materializable,
    },
  };

  // Stage 9 · finalize. A draft that does not parse HERE is a bug in this
  // module, not in the model, so it is reported rather than quietly replaced.
  const validated = validateDraft(finalDraft);
  trace(ctx, "finalize", "rules", validated.ok ? "ok" : "failed", {
    errorCode: validated.ok ? null : "schema",
  });
  if (!validated.ok) {
    console.error(`[atg] assembled draft failed its own schema: ${validated.errors.slice(0, 400)}`);
  }

  return {
    draft: finalDraft,
    mode,
    stages: ctx.traces,
    warnings: linted.warnings,
    materializable: linted.materializable,
    facts,
  };
}

// ---------------------------------------------------------------------------
// The deterministic route through the pipeline
// ---------------------------------------------------------------------------

async function retrieveDeterministic(ctx: RunContext): Promise<CatalogCandidate[]> {
  const capabilities = deterministicCapabilities(ctx.role?.id ?? "admin");
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const { candidates } = await findCandidates(capabilities, ctx.facts.harness);
  trace(ctx, "skills", "db", "ok", { startedAt, durationMs: Date.now() - started });
  return candidates;
}

function composeAllDeterministic(ctx: RunContext, catalog: CatalogCandidate[]): AgentTemplateDraft {
  for (const stage of ["charter", "capabilities", "boundaries", "context", "schedules"] as StageId[]) {
    trace(ctx, stage, "rules", "fallback");
  }
  trace(ctx, "assemble", "rules", "ok");
  return composeDeterministic(
    ctx.facts,
    catalog,
    ctx.roles,
    { name: ctx.workspace.name, timezone: ctx.workspace.timezone },
    { generationId: ctx.generationId, now: ctx.now, stages: ctx.traces, mode: "deterministic" },
  );
}

// ---------------------------------------------------------------------------
// The model route
// ---------------------------------------------------------------------------

async function generateWithModel(ctx: RunContext): Promise<AgentTemplateDraft> {
  const { facts, role } = ctx;
  const lang = facts.locale;
  const harness = facts.harness;

  // A complete deterministic draft is composed FIRST, from a catalogue read that
  // the model path needs anyway. It is the substitution source for every stage
  // that falls back, which is what makes fallback per-stage instead of
  // all-or-nothing — and it costs one query, not one generation.
  const seedCapabilities = deterministicCapabilities(role?.id ?? "admin");
  const retrievalStarted = new Date().toISOString();
  const retrievalFrom = Date.now();
  const seedRetrieval = await findCandidates(seedCapabilities, harness);

  // ---- Stage 1 · charter ------------------------------------------------
  const charter = await runLlmStage(ctx, {
    stage: "charter",
    tier: "reason",
    temperature: 0.35,
    maxTokens: 900,
    repairs: 2,
    prompt: charterPrompt({
      lang,
      harness,
      brief: facts.brief,
      workspaceName: ctx.workspace.name,
      roleHint: role
        ? { id: role.id, name: role.name, blurb: role.blurb, longBlurb: role.longBlurb }
        : null,
      allowedRoleIds: ctx.roles.map((r) => r.id),
    }),
    parse: zodParser<import("zod").infer<typeof charterResponseSchema>>(charterResponseSchema),
  });

  const allowedRoleIds = new Set(ctx.roles.map((r) => r.id));
  const fallbackRole = deterministicCharterRole(facts, role);
  const templateRoles: TemplateRole[] = charter
    ? charter.roles.slice(0, 3).map((r, i) => ({
        key: kebabOr(r.key, `role-${i + 1}`),
        // The second anti-hallucination rule after skills: `agents.role_id` is a
        // foreign key, and a fabricated id fails at materialization, minutes
        // after the user approved the template.
        baseRoleId: r.baseRoleId && allowedRoleIds.has(r.baseRoleId) ? r.baseRoleId : null,
        title: r.title,
        mission: r.mission,
        responsibilities: r.responsibilities,
        successMetrics: r.successMetrics,
        stakeholders: r.stakeholders,
        handoffs: r.handoffs,
      }))
    : [fallbackRole];
  const primaryRole = templateRoles[0];

  // ---- Stage 2 · capabilities -------------------------------------------
  const capabilityResponse = await runLlmStage(ctx, {
    stage: "capabilities",
    tier: "fast",
    temperature: 0.4,
    maxTokens: 600,
    // No repair: the section is cheap to compose and its output is a suggestion,
    // not a decision, so a round-trip to fix a brace is not worth the second the
    // user spends watching it.
    repairs: 0,
    prompt: capabilitiesPrompt({
      lang,
      harness,
      brief: facts.brief,
      roles: templateRoles.map((r) => ({
        key: r.key,
        title: r.title,
        mission: r.mission,
        responsibilities: r.responsibilities,
      })),
      toolHints: facts.toolHints,
    }),
    parse: zodParser<import("zod").infer<typeof capabilitiesResponseSchema>>(
      capabilitiesResponseSchema,
    ),
  });
  const roleKeys = new Set(templateRoles.map((r) => r.key));
  const capabilities: CapabilityRequest[] = capabilityResponse
    ? capabilityResponse.capabilities.map((c) => ({
        ...c,
        roleKey: roleKeys.has(c.roleKey) ? c.roleKey : primaryRole.key,
      }))
    : seedCapabilities.map((c) => ({ ...c, roleKey: primaryRole.key }));

  // ---- Stage 3 · skills --------------------------------------------------
  const retrieval =
    capabilityResponse === null
      ? seedRetrieval
      : await findCandidates(capabilities, harness);
  const deterministicSelection = selectSkills(
    capabilities,
    retrieval.candidates,
    role?.id ?? "admin",
    harness,
    ctx.now.getTime(),
  );
  let skills: TemplateSkill[] = buildTemplateSkills(deterministicSelection.selected, lang);

  if (retrieval.candidates.length > 0) {
    const rerank = await runLlmStage(ctx, {
      stage: "skills",
      tier: "fast",
      temperature: 0.1,
      maxTokens: 700,
      repairs: 0,
      prompt: skillRerankPrompt({
        lang,
        harness,
        roles: templateRoles.map((r) => ({ key: r.key, title: r.title, mission: r.mission })),
        capabilities: capabilities.map((c) => ({
          capability: c.capability,
          necessity: c.necessity,
        })),
        // The model reorders the RANKED SHORTLIST, never the raw pool of 120: a
        // candidate the ranker put last is not made first by a persuasive
        // summary, and a shorter list is a cheaper and more accurate call.
        candidates: deterministicSelection.selected.map((s) => ({
            id: s.candidate.id,
            displayName: s.candidate.name,
            slug: s.candidate.slug,
            owner: s.candidate.ownerHandle || null,
            summary: s.candidate.summary,
            category: s.candidate.category,
            riskLevel: s.candidate.riskLevel,
            rankScore: s.score,
            requiresEnv: s.candidate.requirements.env ?? [],
            requiresBins: s.candidate.requirements.bins ?? [],
          })),
      }),
      parse: zodParser<import("zod").infer<typeof skillRerankResponseSchema>>(
        skillRerankResponseSchema,
      ),
    });
    if (rerank) {
      const resolved = resolveRerank(
        rerank.selected,
        retrieval.candidates,
        capabilities,
        role?.id ?? "admin",
        harness,
        lang,
        8,
        ctx.now.getTime(),
      );
      if (resolved.invented > 0 || resolved.refused > 0) {
        console.warn(
          `[atg] rerank discarded ${resolved.invented} invented and ${resolved.refused} gated skill ids`,
        );
      }
      // A rerank that discarded everything is worse than no rerank at all.
      if (resolved.skills.length > 0) skills = resolved.skills;
    }
  } else {
    trace(ctx, "skills", "db", "skipped", {
      startedAt: retrievalStarted,
      durationMs: Date.now() - retrievalFrom,
    });
  }
  // ---- Stage 4 · boundaries ---------------------------------------------
  const channels = [...new Set<(typeof facts.channelHints)[number] | "web">([...facts.channelHints, "web"])];
  const boundariesResponse = await runLlmStage(ctx, {
    stage: "boundaries",
    tier: "reason",
    temperature: 0.15,
    maxTokens: 1100,
    repairs: 2,
    prompt: boundariesPrompt({
      lang,
      harness,
      brief: facts.brief,
      roles: templateRoles.map((r) => ({
        title: r.title,
        mission: r.mission,
        responsibilities: r.responsibilities,
        handoffs: r.handoffs,
      })),
      // Skills BEFORE boundaries is the whole reason stage 4 comes after stage 3:
      // a template that ended up with a payments skill gets rules about payments
      // even when the user never wrote the word "payment".
      skills: skills.map((s) => ({
        displayName: s.displayName,
        purpose: s.purpose,
        riskLevel: s.riskLevel,
      })),
      moneyHints: facts.moneyHints,
      channels,
    }),
    parse: zodParser<import("zod").infer<typeof boundariesResponseSchema>>(boundariesResponseSchema),
  });
  const deterministicBounds = deterministicBoundaries(facts, role, [...facts.channelHints, "web"]);
  const boundaries = boundariesResponse
    ? { ...boundariesResponse, escalation: { ...boundariesResponse.escalation, to: null as null } }
    : deterministicBounds;

  // ---- Stage 5 · context -------------------------------------------------
  const contextResponse = await runLlmStage(ctx, {
    stage: "context",
    tier: "fast",
    temperature: 0.4,
    maxTokens: 800,
    repairs: 0,
    prompt: contextPrompt({
      lang,
      harness,
      brief: facts.brief,
      roles: templateRoles.map((r) => ({
        title: r.title,
        mission: r.mission,
        responsibilities: r.responsibilities,
      })),
      rules: boundaries.rules.map((r) => r.text),
    }),
    parse: zodParser<import("zod").infer<typeof contextResponseSchema>>(contextResponseSchema),
  });
  const context: TemplateContextItem[] = contextResponse
    ? contextResponse.context.slice(0, 8).map((c, i) => normalizeContextItem(c, i))
    : deterministicContext(facts, role);

  // ---- Stage 6 · schedules ----------------------------------------------
  const schedules = await runSchedulesStage(ctx, templateRoles, primaryRole.title);

  // ---- Stage 7 · assemble ------------------------------------------------
  const assembleStarted = new Date().toISOString();
  const assembleFrom = Date.now();
  const seed = composeDeterministic(
    facts,
    seedRetrieval.candidates,
    ctx.roles,
    { name: ctx.workspace.name, timezone: ctx.workspace.timezone },
    { generationId: ctx.generationId, now: ctx.now, mode: "hybrid" },
  );
  const agentKey = seed.agents[0].key;
  const assembled: AgentTemplateDraft = {
    ...seed,
    meta: {
      ...seed.meta,
      ...(charter
        ? {
            name: charter.meta.name,
            summary: charter.meta.summary,
            description: charter.meta.description,
            category: charter.meta.category,
            tags: charter.meta.tags
              .map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
              .filter((t) => t.length > 0)
              .slice(0, 8),
            mono: Array.from(charter.meta.mono).slice(0, 2).join("") || seed.meta.mono,
          }
        : {}),
      // Never model-authored: the slug is an identity, the hue is a palette
      // value, the plan is a billing decision and the credit estimate is
      // arithmetic. All four stay with the deterministic composition.
      slug: seed.meta.slug,
      hue: seed.meta.hue,
      minPlan: seed.meta.minPlan,
      estimatedCreditsPerMonth: seed.meta.estimatedCreditsPerMonth,
    },
    roles: templateRoles,
    agents: seed.agents.map((a) => ({
      ...a,
      roleKey: primaryRole.key,
      name: charter ? charter.meta.name.slice(0, 80) : a.name,
      skillKeys: skills.map((s) => s.key),
      scheduleKeys: schedules.map((s) => s.key),
      contextKeys: context.map((c) => c.key),
    })),
    skills,
    boundaries,
    context,
    schedules: schedules.map((s) => ({ ...s, agentKey })),
  };
  trace(ctx, "assemble", "rules", "ok", {
    startedAt: assembleStarted,
    durationMs: Date.now() - assembleFrom,
  });

  // Cross-reference and shape failures are repaired DETERMINISTICALLY, never by
  // the model: a dangling `skillKeys` entry means dropping the key, not asking a
  // model which skill was meant.
  const check = validateDraft(assembled);
  if (check.ok) return assembled;
  console.warn(`[atg] assembled draft failed validation; substituting deterministic sections`);
  ctx.fellBack = true;
  return { ...seed, provenance: { ...seed.provenance, mode: "hybrid" } };
}

function kebabOr(value: string, fallback: string): string {
  const out = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44)
    .replace(/-+$/g, "");
  return out.length > 0 ? out : fallback;
}

/**
 * The model proposes; the allowlist disposes.
 *
 * A `url` that fails `isSafePublicHttpsUrl` is not "fixed" — the item is
 * demoted to a `pasted_text` request, because a template is a persisted
 * instruction to FETCH and a model-authored link-local address in one is an
 * SSRF payload we shipped.
 */
function normalizeContextItem(
  c: {
    key: string;
    kind: "pasted_text" | "file_request" | "url";
    title: string;
    purpose: string;
    required: boolean;
    body: string | null;
    placeholder: string | null;
    acceptedMimeTypes: string[];
    url: string | null;
  },
  index: number,
): TemplateContextItem {
  const fileRequest = c.kind === "file_request";
  const mimes = c.acceptedMimeTypes.filter(isContextMimeType);
  return {
    key: kebabOr(c.key, `ctx-${index + 1}`),
    kind: c.kind,
    title: c.title,
    purpose: c.purpose,
    required: c.required,
    body: c.kind === "pasted_text" ? (c.body?.slice(0, 8000) ?? null) : null,
    url: c.kind === "url" ? c.url : null,
    acceptedMimeTypes: fileRequest ? (mimes.length ? mimes : [...DEFAULT_CONTEXT_MIME_TYPES]) : [],
    maxBytes: fileRequest ? CONTEXT_DEFAULT_MAX_BYTES : null,
    placeholder: c.placeholder,
    // The linter owns this flag.
    containsPii: false,
  };
}

/**
 * Stage 6 is `mixed` because most of it is already done.
 *
 * Every phrase the user wrote that the parser understood above its confidence
 * floor is already a schedule with `source: "user_phrase"` — no model call, no
 * risk of the model rewriting "every Friday at 5" into something else. The model
 * only fills a gap, it writes PHRASES rather than crons, and when its cron and
 * its own phrase disagree the deterministic parser wins.
 */
async function runSchedulesStage(
  ctx: RunContext,
  templateRoles: TemplateRole[],
  roleTitle: string,
): Promise<TemplateSchedule[]> {
  const { facts, role } = ctx;
  const lang = facts.locale;
  const fromUser = deterministicSchedules(facts, role, roleTitle, "agent-1", ctx.now);
  const fromPhrases = fromUser.filter((s) => s.source === "user_phrase");
  if (fromPhrases.length >= 3) {
    trace(ctx, "schedules", "rules", "ok");
    return fromPhrases.slice(0, 4);
  }

  const response = await runLlmStage(ctx, {
    stage: "schedules",
    tier: "fast",
    temperature: 0.15,
    maxTokens: 700,
    repairs: 0,
    prompt: schedulesPrompt({
      lang,
      harness: facts.harness,
      timezone: facts.timezone,
      roles: templateRoles.map((r) => ({ title: r.title, responsibilities: r.responsibilities })),
      agentKeys: ["agent-1"],
      existing: fromPhrases.map((s) => ({ title: s.title, humanReadable: s.humanReadable })),
    }),
    parse: zodParser<import("zod").infer<typeof schedulesResponseSchema>>(schedulesResponseSchema),
  });
  if (!response) return fromUser;

  const out: TemplateSchedule[] = [...fromPhrases];
  for (const s of response.schedules) {
    if (out.length >= 4) break;
    // The model's phrase is recompiled; its cron is only a cross-check. If the
    // two disagree, the parser wins and `source` records that it did.
    const parsed = parseSchedulePhrase(s.phrase);
    const cron = parsed?.cron ?? s.cron;
    const source: TemplateSchedule["source"] =
      parsed && parsed.cron !== s.cron ? "deterministic" : "llm";
    const human = describeCron(cron, lang);
    if (!human) continue;
    out.push({
      key: kebabOr(s.key, `sch-${out.length + 1}`),
      agentKey: "agent-1",
      title: s.title,
      kind: s.kind,
      cron,
      timezone: facts.timezone,
      onDate: null,
      payloadKind: s.payloadKind,
      prompt: s.prompt,
      deliverTo: s.deliverTo,
      catchUpPolicy: "skip",
      enabled: true,
      maxRunsPerDay: 96,
      source,
      confidence: parsed?.confidence ?? 0.5,
      // Never model-authored, and re-derived on read.
      humanReadable: human.slice(0, 200),
    });
  }
  return out.length > 0 ? out : fromUser;
}

// ---------------------------------------------------------------------------
// Stage 9's optional narration — best-effort, never blocking
// ---------------------------------------------------------------------------

/**
 * A one-paragraph gallery description. A failed narration leaves
 * `meta.description` exactly as composed, which is why nothing here throws and
 * why the caller may skip it entirely.
 */
export async function narrateDraft(
  draft: AgentTemplateDraft,
  ctx: { workspaceId: string; userId?: string | null; signal?: AbortSignal },
): Promise<string | null> {
  if (!isLLMConfigured() || llmDisabled()) return null;
  const prompt = narratePrompt({
    lang: draft.locale,
    meta: { name: draft.meta.name, category: draft.meta.category },
    roleTitles: draft.roles.map((r) => r.title),
    skillNames: draft.skills.map((s) => s.displayName),
    scheduleLines: draft.schedules.map((s) => s.humanReadable),
    autonomy: draft.boundaries.autonomy,
  });
  const started = Date.now();
  let sample: LlmUsageSample | null = null;
  try {
    const text = await chatCompletion({
      model: atgModel("fast"),
      temperature: 0.55,
      maxTokens: 400,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      ...(ctx.signal ? { signal: ctx.signal } : {}),
      onUsage: (u) => {
        sample = u;
      },
    });
    void recordLlmUsage({
      sample,
      kind: "template_gen",
      userId: ctx.userId ?? null,
      workspaceId: ctx.workspaceId,
      latencyMs: Date.now() - started,
    });
    const read = readJsonObject(text);
    if (!read.ok) return null;
    const parsed = narrationResponseSchema.safeParse(read.value);
    return parsed.success ? parsed.data.description : null;
  } catch (e) {
    void recordLlmUsage({
      sample,
      kind: "template_gen",
      userId: ctx.userId ?? null,
      workspaceId: ctx.workspaceId,
      latencyMs: Date.now() - started,
      errorCode: classifyLlmError(e),
    });
    return null;
  }
}

// Kept exported so a route can render the linter's findings without re-running
// the whole generation on an edited draft.
export { lintDraft, remediateDraft, validateDraft };
