/**
 * Local mirrors of the parts of `AgentConfigDTO` (docs/UI_DESIGN_V2.md §E.6) this
 * vertical renders. They are declared HERE rather than imported from
 * `lib/client-api.ts` on purpose: the config API is being written in parallel by a
 * sibling agent, and a component that cannot compile until someone else's DTO lands
 * is a component nobody can review. The integrator re-points these to the shared DTO
 * once it exists; the field names and enum members below are already the DDL's, so
 * that is a rename of the import, not of the code.
 *
 * Every enum member here is the FULL set from `lib/db/schema.ts`. A missing member is
 * not a smaller type — it is a row that renders blank.
 */
import type { Harness } from "@/lib/harness";

export type RiskLevel = "low" | "medium" | "high";

/** `agent_skill_state`. The column is `state`, not `status`. */
export type SkillInstallState =
  | "pending"
  | "installing"
  | "installed"
  | "failed"
  | "removing"
  | "removed";

/**
 * Three display states, never two: `asserted` ⇒ ✓, `inferred`/`unknown` with an
 * unmet requirement ⇒ ✕, `unknown` with none ⇒ ⚠. Collapsing ⚠ into either lies
 * about what we actually checked.
 */
export type CompatBasis = "asserted" | "inferred" | "unknown";

export interface AgentSkillRow {
  /** agent_skills.id — the ATTACHMENT id, not the skill id. */
  id: string;
  skillId: string;
  /** Identity is (source, ownerHandle, slug); a bare slug resolves six ways. */
  slug: string;
  ownerHandle: string;
  source: string;
  publicId: string;
  /** Pinned. Never the string "latest". */
  version: string;
  name: string;
  summary: string | null;
  riskLevel: RiskLevel;
  riskLevelAtAttach: RiskLevel;
  riskAcknowledged: boolean;
  enabled: boolean;
  state: SkillInstallState;
  installError: string | null;
  /** A mock-mode row must never read as a real installation. */
  installSource: "live" | "mock";
  /** agent_skills.harness — the engine this attachment was asserted against. */
  assertedHarness: Harness;
  compatAsserted: boolean;
  compatBasis: CompatBasis;
  /** e.g. ["bin:gh>=2.40", "env:GH_TOKEN"]. Rendered verbatim as text. */
  unmetRequirements: string[];
  /** skills.blocked — withdrawn after attachment. */
  blocked: boolean;
  updateAvailable: string | null;
}

/** `context_item_kind`. "url", not "link". */
export type ContextKind = "file" | "text" | "url";

/** `context_item_state`. `awaiting_upload` means NO BYTES EXIST. */
export type ContextState =
  | "awaiting_upload"
  | "pending"
  | "indexing"
  | "indexed"
  | "failed"
  | "removed";

export interface ContextItemRow {
  id: string;
  kind: ContextKind;
  /** agent_context_items.name. */
  title: string;
  mime: string | null;
  /** NOT NULL DEFAULT 0 — zero while awaiting_upload, which is not "an empty file". */
  bytes: number;
  /** Rendered as TEXT, never as an href. */
  sourceUrl: string | null;
  state: ContextState;
  stateError: string | null;
  chunks: number | null;
  createdAt: string;
}

export type ScheduleKind = "cron" | "interval" | "once";
export type ScheduleDeliverTo = "chat" | "email" | "channel" | "none";
export type ScheduleLastStatus = "started" | "succeeded" | "failed" | "skipped";

export interface ScheduleRow {
  id: string;
  /** agent_schedules.name — the column is `name`. */
  name: string;
  kind: ScheduleKind;
  cronExpr: string | null;
  intervalSeconds: number | null;
  runAt: string | null;
  timezone: string;
  /** The instruction, injected as a USER turn. NOT NULL upstream. */
  prompt: string;
  deliverTo: ScheduleDeliverTo;
  maxRunsPerDay: number;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: ScheduleLastStatus | null;
}

/** One row of `agent_schedule_runs`, for the per-schedule history strip. */
export interface ScheduleRunRow {
  id: string;
  status: "started" | "succeeded" | "failed" | "skipped";
  /** `skipped` carries a reason — instance_stopped, max_runs_per_day, overlap. */
  reason: string | null;
  runId: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export type RuleKind = "must" | "never" | "escalate";

export interface RuleRow {
  id: string;
  kind: RuleKind;
  text: string;
  sortOrder: number;
}

export type AutonomyLevel = "suggest" | "ask" | "auto";

export interface BoundarySettings {
  level: AutonomyLevel;
  approvalAmount: number;
  approveExternalSends: boolean;
  dailyActionLimit: number;
}

/** The slice of E.6 this vertical owns, plus the concurrency token. */
export interface ManagedConfig {
  configRevision: number;
  rules: RuleRow[];
  autonomy: BoundarySettings;
  skills: AgentSkillRow[];
  context: ContextItemRow[];
  schedules: ScheduleRow[];
  /** agents.engine — SKILLS needs it to flag rows asserted against another harness. */
  engine: Harness;
  managerMode: "live" | "mock" | "unconfigured";
}

/** The five sections this vertical renders into the §E.1 rail. */
export const MANAGE_SECTIONS = ["rules", "skills", "context", "schedules"] as const;
export type ManageSection = (typeof MANAGE_SECTIONS)[number];
