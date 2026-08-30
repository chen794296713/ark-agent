/**
 * The template DTOs the gallery reads, declared locally on purpose.
 *
 * `lib/serializers.ts` is the integrator's file and will eventually export
 * `TemplateSummaryDTO` in exactly this shape (docs/AGENT_TEMPLATE_GENERATOR.md
 * §9.4, docs/UI_DESIGN_V2.md §B.10). Declaring it here keeps this vertical from
 * editing a shared file mid-flight; when the serializer lands, these types are
 * deleted and the import is re-pointed — the field names are identical so
 * nothing else moves.
 *
 * `AgentTemplateDraft` is NOT redeclared: it is already written in lib/atg/types.
 */
import type { AgentTemplateDraft, TemplateCategory } from "@/lib/atg/types";
import type { Harness } from "@/lib/harness";
import type { PlanTier } from "@/lib/pricing";
import type { Lang } from "@/lib/types";

export type TemplateVisibility = "private" | "workspace" | "public";
export type TemplateOrigin = "generated" | "manual" | "seeded" | "forked";

/** `agent_templates.difficulty` — `varchar(16)`, so the column can hold a value
 *  this union does not know. `asDifficulty()` in ./derive narrows it. */
export type TemplateDifficulty = "beginner" | "intermediate" | "advanced";

/**
 * The card/list payload. Deliberately without `draft`, which is 10–40 KB — a
 * 24-card gallery carrying it would be a 1 MB response, which is why §7.1
 * denormalises the counts in the first place. Nothing in the gallery may read
 * `draft`; the drawer, which fetches one template at a time, is where it lives.
 */
export interface TemplateSummaryDTO {
  id: string;
  slug: string;
  name: string;
  /** agent_templates.summary, varchar(200) — the card's one-line "what it does". */
  summary: string;
  category: TemplateCategory;
  tags: string[];
  /** varchar(8): a ZWJ emoji is more than two code points. Render Array.from(mono)[0]. */
  mono: string;
  hue: string;
  /** The language the strings above are WRITTEN in. Never machine-translated. */
  locale: Lang;
  harness: Harness;
  minPlan: PlanTier;
  skillCount: number;
  scheduleCount: number;
  agentCount: number;
  useCount: number;
  /**
   * The three cells below are REAL COLUMNS on `agent_templates`
   * (lib/db/schema.ts:1390-1394, migration 0009_v2_schema.sql:231-233), computed
   * at ATG §2.9 assemble from skill / required-context / required-credential
   * counts and never model-authored. `docs/UI_DESIGN_V2.md` §B.3 says they do
   * not exist; it is stale — the schema shipped and the schema wins.
   *
   * Optional because `lib/serializers.ts` is the integrator's file and §9.4's
   * field list predates the migration. When a field is absent the gallery falls
   * back to a count-derived estimate and LABELS it as one — see ./derive. That
   * is a fallback, not the design.
   */
  difficulty?: string;
  /** `time_to_value_minutes`. Minutes to a working agent, computed server-side. */
  timeToValueMinutes?: number;
  /** `automates` varchar(140), present tense, one sentence. `summary` is the
   *  documented fallback (the column defaults to ''). */
  automates?: string;
  /** `created_at`. Present so "Newest" can sort on the column it names instead
   *  of on `updated_at`, which is a different question. */
  createdAt?: string;
  materializable: boolean;
  visibility: TemplateVisibility;
  updatedAt: string;
  origin: TemplateOrigin;
  /** Computed per-caller in the serializer — the same row is "yours" to one
   *  tenant and "public" to another, so it can never be a column. */
  ownedByViewer: boolean;
}

/** `GET /api/templates` — the list envelope §9.4 fixes. */
export interface TemplateListResponse {
  templates: TemplateSummaryDTO[];
  total: number;
  page: number;
  perPage?: number;
}

/** `GET /api/templates/{id}` — the summary row plus the full draft. */
export interface TemplateDetailDTO extends TemplateSummaryDTO {
  description?: string;
  draft: AgentTemplateDraft;
}

export interface TemplateDetailResponse {
  template: TemplateDetailDTO;
}
