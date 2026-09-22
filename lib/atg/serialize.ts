/**
 * Row → DTO for `agent_templates` and `template_generations`, plus the three
 * denormalized card values the schema says are "computed at assemble, never
 * model-authored".
 *
 * Client-safe: pure mapping over plain objects, no Drizzle import and no
 * `server-only`. The row shapes below are declared STRUCTURALLY for that
 * reason — `lib/db/schema.ts` pulls the pooled `postgres` client in with it,
 * and `tests/atg-serialize.test.ts` must be able to import this file with no
 * database at all.
 *
 * Two rules govern every function here, and both are security rules:
 *
 *  1. **Allow-list, never spread.** Nothing returns `{ ...row }`.
 *     `agent_templates` carries `created_by_id`, `generation_id` and
 *     `forked_from_id`; `template_generations` carries the user's verbatim
 *     `brief`, its sha, a `correlation_id` and `injection_findings` with raw
 *     excerpts of what someone tried. A spread ships all of them the day
 *     somebody adds a column, and the reviewer of that commit is looking at the
 *     migration, not at this file.
 *  2. **A `public` template's text was written by ANOTHER TENANT.** `name`,
 *     `summary`, `automates`, `description` and every tag reach the DOM. React
 *     escapes text nodes, so this is not the XSS control — it is the control on
 *     zero-width characters, bidi overrides and 40 KB of smuggled prose in a
 *     `varchar(200)`'s worth of screen space.
 *
 * The DTO field names match `components/template/types.ts` exactly. The
 * assertion lives in `tests/atg-serialize.test.ts` rather than here — a
 * type-only import of a component module from `lib/` would compile, but it
 * points the dependency arrow the wrong way — and it makes a drift between the
 * page's shape and the API's a compile error rather than a blank gallery.
 */
import type { Harness } from "@/lib/harness";
import type { PlanTier } from "@/lib/pricing";
import type { Lang } from "@/lib/types";
import { sanitizeSkillText, sanitizeTag } from "@/lib/skills/safety";
import type {
  AgentTemplateDraft,
  DraftStageTrace,
  DraftWarning,
  StageId,
  TemplateCategory,
} from "./types";

// ---------------------------------------------------------------------------
// DTOs — mirrored in components/template/types.ts
// ---------------------------------------------------------------------------

export type TemplateVisibility = "private" | "workspace" | "public";
export type TemplateOrigin = "generated" | "manual" | "seeded" | "forked";
export type TemplateDifficulty = "beginner" | "intermediate" | "advanced";

/** The card/list payload. Deliberately without `draft`, which is 10–40 KB — a
 *  24-card gallery carrying it would be a 1 MB response. */
export interface TemplateSummaryDTO {
  id: string;
  slug: string;
  name: string;
  summary: string;
  category: TemplateCategory;
  tags: string[];
  mono: string;
  hue: string;
  locale: Lang;
  harness: Harness;
  minPlan: PlanTier;
  skillCount: number;
  scheduleCount: number;
  agentCount: number;
  useCount: number;
  difficulty?: string;
  timeToValueMinutes?: number;
  automates?: string;
  createdAt?: string;
  materializable: boolean;
  visibility: TemplateVisibility;
  updatedAt: string;
  origin: TemplateOrigin;
  /** Computed per-caller: the same row is "yours" to one tenant and "public" to
   *  another, so it can never be a column. */
  ownedByViewer: boolean;
}

export interface TemplateDetailDTO extends TemplateSummaryDTO {
  description?: string;
  draft: AgentTemplateDraft;
}

export interface TemplateListResponse {
  templates: TemplateSummaryDTO[];
  total: number;
  page: number;
  perPage?: number;
  /** Filter values the server did not recognise and dropped. */
  ignoredFilters?: string[];
}

export interface TemplateDetailResponse {
  template: TemplateDetailDTO;
}

export type GenerationStatus =
  | "queued"
  | "running"
  | "ready"
  | "needs_review"
  | "materialized"
  | "failed"
  | "canceled"
  | "expired";

export type GenerationMode = "llm" | "hybrid" | "deterministic";

/**
 * `GET /api/templates/generations/{id}` — the polling transport's payload.
 *
 * `brief`, `briefSha256`, `correlationId`, `injectionFindings` and `userId` are
 * absent on purpose. The first is the customer's own words and does not need a
 * second copy on the wire; the last is a list of the attack strings someone put
 * in a text box, which belongs in the audit trail and not in a JSON body a
 * browser extension can read.
 */
export interface GenerationDTO {
  id: string;
  status: GenerationStatus;
  mode: GenerationMode;
  progress: { stage: StageId; index: number; total: number } | null;
  stageTraces: DraftStageTrace[];
  warnings: DraftWarning[];
  draft: AgentTemplateDraft | null;
  /** A normalized class ("timeout", "stage_charter_failed"), never a provider body. */
  error: string | null;
  cost: {
    promptTokens: number;
    completionTokens: number;
    costMicroUsd: number;
    llmCalls: number;
  } | null;
  templateId: string | null;
  agentId: string | null;
  createdAt: string;
  finishedAt: string | null;
}

// ---------------------------------------------------------------------------
// Row shapes — structural, so Drizzle stays out of the browser bundle
// ---------------------------------------------------------------------------

export interface TemplateRowLike {
  id: string;
  workspaceId: string | null;
  slug: string;
  name: string;
  summary: string;
  description?: string;
  category: string;
  tags: unknown;
  mono: string;
  hue: string;
  locale: Lang;
  harness: Harness;
  minPlan: PlanTier;
  visibility: TemplateVisibility;
  origin: TemplateOrigin;
  skillCount: number;
  scheduleCount: number;
  agentCount: number;
  automates: string;
  difficulty: string;
  timeToValueMinutes: number;
  materializable: boolean;
  useCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  draft?: unknown;
}

export interface GenerationRowLike {
  id: string;
  status: GenerationStatus;
  mode: GenerationMode;
  stageTraces: unknown;
  warnings: unknown;
  draft: unknown;
  errorCode: string | null;
  promptTokens: number;
  completionTokens: number;
  costMicroUsd: number;
  llmCalls: number;
  templateId: string | null;
  agentId: string | null;
  createdAt: Date | string;
  finishedAt: Date | string | null;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const CATEGORIES: ReadonlySet<string> = new Set<TemplateCategory>([
  "sales",
  "support",
  "marketing",
  "operations",
  "finance",
  "research",
  "engineering",
  "hr",
  "personal",
  "other",
]);

/** `agent_templates.category` is `varchar(24)`, not an enum, so an unknown
 *  string is representable and must not become a missing dictionary lookup. */
export function asCategory(value: unknown): TemplateCategory {
  return typeof value === "string" && CATEGORIES.has(value) ? (value as TemplateCategory) : "other";
}

/** `#rgb`, `#rrggbb`, `#rrggbbaa` — nothing else. The value reaches the DOM as a
 *  CSS `background`, and `url(https://attacker.example/p.gif)` is a legal one. */
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
export const HUE_FALLBACK = "#9AA3B2";

export function safeHue(hue: unknown): string {
  return typeof hue === "string" && HEX_COLOR.test(hue.trim()) ? hue.trim() : HUE_FALLBACK;
}

/** `mono` is `varchar(8)` and may hold a ZWJ sequence. Keep at most two code
 *  points — never a UTF-16 slice, which would render half a surrogate pair. */
export function safeMono(mono: unknown): string {
  const glyphs = Array.from(typeof mono === "string" ? mono : "");
  const kept = glyphs.filter((g) => !/[\p{Cc}\p{Cf}]/u.test(g)).slice(0, 2);
  return kept.length > 0 ? kept.join("") : "T";
}

export function tagList(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const clean = sanitizeTag(t);
    if (clean && !out.includes(clean)) out.push(clean);
    if (out.length === 8) break;
  }
  return out;
}

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function arrayOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function count(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0;
}

// ---------------------------------------------------------------------------
// The three computed card columns
// ---------------------------------------------------------------------------

/** A `file_request` or a `url` the user must supply before the agent works. */
function requiredContextCount(draft: AgentTemplateDraft): number {
  return draft.context.filter((c) => c.required && c.kind !== "pasted_text").length;
}

/** A skill that reads an env var is a skill that needs a credential pasted in,
 *  which is the single biggest contributor to "it took me an afternoon". */
function credentialSkillCount(draft: AgentTemplateDraft): number {
  return draft.skills.filter((s) => (s.requirements?.env?.length ?? 0) > 0).length;
}

/** The weights `components/template/derive.SETUP_WEIGHTS` uses for its
 *  client-side fallback, plus the two terms only the draft can answer. An agent
 *  is a VM and a brief; a schedule is a decision about when; a skill is mostly a
 *  checkbox; a credential and a required upload are each a trip elsewhere. */
export const SETUP_WEIGHTS = {
  agent: 3,
  schedule: 2,
  skill: 1,
  requiredContext: 2,
  credential: 2,
} as const;

export const LEVEL_BOUNDS = { beginner: 14, intermediate: 26 } as const;

export function setupWeight(draft: AgentTemplateDraft): number {
  return (
    draft.agents.length * SETUP_WEIGHTS.agent +
    draft.schedules.length * SETUP_WEIGHTS.schedule +
    draft.skills.length * SETUP_WEIGHTS.skill +
    requiredContextCount(draft) * SETUP_WEIGHTS.requiredContext +
    credentialSkillCount(draft) * SETUP_WEIGHTS.credential
  );
}

/** `agent_templates.difficulty`. Computed, never model-authored. */
export function difficultyFor(draft: AgentTemplateDraft): TemplateDifficulty {
  const w = setupWeight(draft);
  if (w <= LEVEL_BOUNDS.beginner) return "beginner";
  if (w <= LEVEL_BOUNDS.intermediate) return "intermediate";
  return "advanced";
}

/**
 * `agent_templates.time_to_value_minutes`. Three minutes of wizard, two per
 * agent brief, one per schedule to confirm a time, half a minute per skill to
 * read what it does, and three per required upload or credential because each
 * of those is a trip to another application.
 *
 * Never below two — "0 min" reads as a bug, not as a promise — and never above
 * 240, because past four hours the number has stopped being information.
 */
export function timeToValueFor(draft: AgentTemplateDraft): number {
  const raw =
    3 +
    draft.agents.length * 2 +
    draft.schedules.length +
    Math.ceil(draft.skills.length / 2) +
    (requiredContextCount(draft) + credentialSkillCount(draft)) * 3;
  return Math.min(240, Math.max(2, Math.round(raw)));
}

/**
 * `agent_templates.automates` — present tense, one sentence, ≤140 chars.
 *
 * Derived from the draft's own summary rather than asked of a model: this
 * column is read by every card in the gallery and must exist with no
 * `OPENROUTER_API_KEY` configured. The first sentence of `meta.summary` is
 * already a present-tense one-liner in the draft's locale (the charter prompt
 * requires it), so this is a trim, not a rewrite. An empty result is stored as
 * `''`, which is the column's own default and the documented signal for the
 * card to fall back to `summary`.
 */
export function automatesFor(draft: AgentTemplateDraft): string {
  const summary = sanitizeSkillText(draft.meta.summary ?? "", 400);
  if (!summary) return "";
  if (summary.length <= 140) return summary;
  // Cut at a sentence end when there is one inside the budget; a hard slice
  // mid-word reads as a truncated database field, which is what it would be.
  const window = summary.slice(0, 140);
  const stop = Math.max(
    window.lastIndexOf("."),
    window.lastIndexOf("。"),
    window.lastIndexOf("！"),
    window.lastIndexOf("？"),
  );
  if (stop >= 40) return window.slice(0, stop + 1).trim();
  const space = window.lastIndexOf(" ");
  return (space >= 40 ? window.slice(0, space) : window).trim();
}

/**
 * Every column `agent_templates` denormalizes off a draft, in one object.
 *
 * Returned rather than written so the caller controls the transaction, and
 * pure so a test can assert "this draft produces these card values" without a
 * database. `materializable` is read from the draft's own provenance because
 * only the linter may set it — never from a request body.
 */
export interface TemplateColumns {
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  mono: string;
  hue: string;
  locale: Lang;
  harness: Harness;
  minPlan: PlanTier;
  skillCount: number;
  scheduleCount: number;
  agentCount: number;
  automates: string;
  difficulty: TemplateDifficulty;
  timeToValueMinutes: number;
  materializable: boolean;
  draftSchemaVersion: number;
}

export function templateColumnsFromDraft(draft: AgentTemplateDraft): TemplateColumns {
  return {
    slug: draft.meta.slug.slice(0, 48),
    name: sanitizeSkillText(draft.meta.name, 60) || draft.meta.slug.slice(0, 60),
    summary: sanitizeSkillText(draft.meta.summary, 200),
    description: sanitizeSkillText(draft.meta.description, 1200),
    category: asCategory(draft.meta.category),
    tags: tagList(draft.meta.tags),
    mono: safeMono(draft.meta.mono),
    hue: safeHue(draft.meta.hue),
    locale: draft.locale,
    harness: draft.harness,
    minPlan: draft.meta.minPlan,
    skillCount: draft.skills.length,
    scheduleCount: draft.schedules.length,
    agentCount: draft.agents.length,
    automates: automatesFor(draft),
    difficulty: difficultyFor(draft),
    timeToValueMinutes: timeToValueFor(draft),
    materializable: draft.provenance.materializable === true,
    draftSchemaVersion: draft.schemaVersion,
  };
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

/**
 * `ownedByViewer` is computed from the caller's workspace, and a platform
 * template (`workspace_id IS NULL`) is owned by nobody: it is readable
 * everywhere and writable through the admin surface only, so reporting it as
 * "yours" would put an Edit affordance on a row the PATCH route will 404.
 */
export function serializeTemplateCard(
  row: TemplateRowLike,
  viewerWorkspaceId: string,
): TemplateSummaryDTO {
  const createdAt = iso(row.createdAt);
  const automates = sanitizeSkillText(row.automates ?? "", 140);
  return {
    id: row.id,
    slug: row.slug,
    name: sanitizeSkillText(row.name, 60),
    summary: sanitizeSkillText(row.summary, 200),
    category: asCategory(row.category),
    tags: tagList(row.tags),
    mono: safeMono(row.mono),
    hue: safeHue(row.hue),
    locale: row.locale,
    harness: row.harness,
    minPlan: row.minPlan,
    skillCount: count(row.skillCount),
    scheduleCount: count(row.scheduleCount),
    agentCount: count(row.agentCount),
    useCount: count(row.useCount),
    difficulty: row.difficulty,
    timeToValueMinutes: count(row.timeToValueMinutes),
    // `''` is the column default and means "not computed"; sending it would
    // make the card render a blank line instead of falling back to `summary`.
    ...(automates ? { automates } : {}),
    ...(createdAt ? { createdAt } : {}),
    materializable: row.materializable === true,
    visibility: row.visibility,
    updatedAt: iso(row.updatedAt) ?? new Date(0).toISOString(),
    origin: row.origin,
    ownedByViewer: row.workspaceId !== null && row.workspaceId === viewerWorkspaceId,
  };
}

/**
 * The drawer's payload: the card plus the whole draft.
 *
 * The draft is returned as it was stored, NOT re-sanitized field by field. That
 * is deliberate: it is a 10–40 KB structured document that the review screen
 * renders as data and that `agentTemplateDraftSchema` already validated on the
 * way in, and a second pass here would rewrite a customer's own prose on every
 * read. What it is not is executable — no consumer feeds it back into a prompt
 * without `screenInjection`.
 */
export function serializeTemplateDetail(
  row: TemplateRowLike & { draft: unknown },
  viewerWorkspaceId: string,
): TemplateDetailDTO {
  const description = sanitizeSkillText(row.description ?? "", 1200);
  return {
    ...serializeTemplateCard(row, viewerWorkspaceId),
    ...(description ? { description } : {}),
    draft: row.draft as AgentTemplateDraft,
  };
}

/**
 * The ten stages the pipeline reports, in order. Used to turn "the last trace
 * we wrote" into the `{ stage, index, total }` the polling client draws its
 * progress bar from — the stream sends that frame directly, so the two
 * transports agree on the same ledger.
 */
export const GENERATION_STAGES: readonly StageId[] = [
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

function progressFrom(traces: DraftStageTrace[]): GenerationDTO["progress"] {
  const last = traces[traces.length - 1];
  if (!last) return null;
  const index = GENERATION_STAGES.indexOf(last.stage);
  return {
    stage: last.stage,
    index: index >= 0 ? index : traces.length - 1,
    total: GENERATION_STAGES.length,
  };
}

export function serializeGeneration(row: GenerationRowLike): GenerationDTO {
  const stageTraces = arrayOf<DraftStageTrace>(row.stageTraces);
  const terminal = row.status !== "queued" && row.status !== "running";
  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    // A finished run has no "current stage"; leaving the last one active makes
    // the screen look stuck on `finalize` after the draft has already arrived.
    progress: terminal ? null : progressFrom(stageTraces),
    stageTraces,
    warnings: arrayOf<DraftWarning>(row.warnings),
    draft: (row.draft ?? null) as AgentTemplateDraft | null,
    error: row.errorCode,
    cost: {
      promptTokens: count(row.promptTokens),
      completionTokens: count(row.completionTokens),
      costMicroUsd: count(row.costMicroUsd),
      llmCalls: count(row.llmCalls),
    },
    templateId: row.templateId,
    agentId: row.agentId,
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
    finishedAt: iso(row.finishedAt),
  };
}
