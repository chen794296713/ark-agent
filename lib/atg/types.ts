/**
 * `AgentTemplateDraft` — what the Agent Template Generator produces, and the
 * shape stored in `agent_templates.draft` and `template_generations.draft`.
 *
 * It is the whole contract between the generator, the review screen, and
 * materialisation, and it covers the six sections the product owner asked for:
 * ROLES, AGENTS, SKILLS, RULES & BOUNDARIES, CONTEXT, REMINDERS & SCHEDULERS.
 *
 * Client-safe: the review screen edits a draft in the browser before anything
 * is committed.
 *
 * Every string in a draft that came from a model or from third-party skill
 * metadata is UNTRUSTED. It is rendered as text, never executed, and never fed
 * back into a prompt without the injection screen in lib/atg/validate.ts.
 */
import type { ChannelType } from "@/lib/channels";
import type { Harness } from "@/lib/harness";
// The draft's behaviour block is the same vocabulary the live agent settings
// use, so a materialised template and a hand-edited agent cannot disagree.
import type {
  Autonomy,
  ReasoningEffort,
  ResponseLanguage,
  Tone,
} from "@/lib/agent-settings";
import type { SkillRequirements } from "@/lib/runtime/types";

export interface AgentTemplateDraft {
  /** Bumped only on a breaking change. A row with an unknown version 409s at materialize. */
  schemaVersion: 1;
  /** The language every human-visible string below is WRITTEN IN. Not the viewer's language. */
  locale: "en" | "zh" | "zht" | "ja";
  harness: Harness;
  meta: TemplateMeta;
  roles: TemplateRole[];            // 1..3
  agents: TemplateAgent[];          // 1..3
  skills: TemplateSkill[];          // 0..12
  boundaries: TemplateBoundaries;
  context: TemplateContextItem[];   // 0..8
  schedules: TemplateSchedule[];    // 0..8
  provenance: DraftProvenance;
}

export type TemplateCategory =
  | "sales" | "support" | "marketing" | "operations" | "finance"
  | "research" | "engineering" | "hr" | "personal" | "other";

export interface TemplateMeta {
  name: string;                     // display name in `locale`
  slug: string;                     // URL-safe ASCII, unique per workspace
  summary: string;                  // one gallery line, in `locale`
  description: string;              // 2–5 sentences, in `locale`, plain prose
  category: TemplateCategory;
  tags: string[];                   // ≤8 kebab-case, ENGLISH, for filtering and search
  /** 1–2 code points. agent_templates.mono is varchar(8) so the column has headroom. */
  mono: string;
  hue: string;                      // "#rrggbb", from lib/theme roleHue values
  minPlan: "associate" | "professional" | "director";
  /** Schedules/month × per-run estimate + heartbeat cost. COMPUTED, never model-authored. */
  estimatedCreditsPerMonth: number;
}

export type MetricUnit = "percent" | "count" | "currency" | "duration" | "ratio" | "text";
export interface TemplateMetric { label: string; target: string; unit: MetricUnit }

export interface TemplateRole {
  key: string;                      // draft-local join key
  /** agent_roles.id, or null for a role with no catalogue equivalent. */
  baseRoleId: string | null;
  title: string;
  mission: string;
  responsibilities: string[];
  successMetrics: TemplateMetric[];
  stakeholders: string[];
  handoffs: string[];
}

export interface TemplateAgentSettings {
  tone: Tone;
  responseLanguage: ResponseLanguage;
  timezone: string;                 // IANA, validated with isValidTimeZone()
  alwaysOn: boolean;
  workStart: string;                // "HH:MM"
  workEnd: string;                  // "HH:MM"
  workDays: number[];               // 0=Sun … 6=Sat
  heartbeatMinutes: number;         // 1..1440
  temperature: number;              // 0..1
  maxTokens: number;                // 256..200000
  reasoningEffort: ReasoningEffort;
  memoryEnabled: boolean;
  selfImprove: boolean;
  autoCreateSkills: boolean;
  notifyNeedsReview: boolean;
  notifyErrors: boolean;
  dailyDigest: boolean;
  digestTime: string;               // "HH:MM"
}

export interface TemplateTask { text: string; meta: string | null; sortOrder: number }

export interface TemplateAgent {
  key: string;
  roleKey: string;                  // → TemplateRole.key
  name: string;
  harness: Harness;
  isPrimary: boolean;
  brief: string;                    // → agents.instructions
  settings: TemplateAgentSettings;
  tools: { shell: boolean; files: boolean; browser: boolean; docker: boolean; code: boolean };
  channels: ChannelType[];
  tasks: TemplateTask[];
  skillKeys: string[];              // → TemplateSkill.key
  scheduleKeys: string[];
  contextKeys: string[];
}

export interface TemplateSkill {
  key: string;
  /** skills.id. Null only in a deterministic-fallback draft with no catalogue match. */
  skillId: string | null;
  source: string;                   // skills.source_id
  ownerHandle: string | null;
  slug: string;
  /** Null ⇒ re-resolve against skills.latest_version at materialize. NEVER the string "latest". */
  version: string | null;
  displayName: string;
  purpose: string;                  // template-level explanation; NO agent_skills column
  riskLevel: "low" | "medium" | "high";
  riskAccepted: boolean;
  /** Always true — §3.8 makes anything else unrepresentable. → agent_skills.compat_asserted. */
  harnessCompatible: boolean;
  requirements: SkillRequirements;
  required: boolean;                // drives the "missing skill" warning; NO column
  rankScore: number;                // audit trail for §5.3's ranking
  rankReasons: string[];
}

export type RuleCategory =
  | "money" | "external_comms" | "data" | "scope" | "quality" | "legal" | "safety" | "schedule";

export interface TemplateRule {
  text: string;                     // ≤200, imperative, in `locale`
  severity: "hard" | "soft";        // "hard" is prefixed NEVER/ALWAYS by renderRules()
  category: RuleCategory;
}

export interface TemplateBoundaries {
  autonomy: Autonomy;
  /** Whole USD in APPROVAL_CURRENCY, deliberately independent of the viewer's display currency. */
  approvalAmountUsd: number;
  approveExternalSends: boolean;
  /** 0 = unlimited. The linter refuses 0 when autonomy is "auto". */
  dailyActionLimit: number;
  rules: TemplateRule[];            // 3..12
  prohibitions: string[];           // ≤10, ≤200 chars each, in `locale`
  escalation: {
    /**
     * Typed `null`, not `string | null`, ON PURPOSE: a model that emits an address here has either
     * hallucinated one or lifted one out of the user's brief, and both write a stranger's address
     * into an agent's notification config. The UI collects it after materialization.
     */
    to: null;
    triggers: string[];             // ≤6 situations, in `locale`
    channel: "email" | "chat" | "none";
  };
  dataHandling: { piiAllowed: boolean; retentionDays: number; redactFields: string[] };
  spend: { monthlyCreditCap: number };   // 0 = use the plan allowance
}

export type ContextKind = "pasted_text" | "file_request" | "url";

export interface TemplateContextItem {
  key: string;
  kind: ContextKind;
  title: string;                    // ≤80, in `locale`  → agent_context_items.name
  purpose: string;                  // ≤200, in `locale`; NO column
  required: boolean;                // NO column — drives the "what this agent still needs" list
  body: string | null;              // pasted_text only, ≤8000 → text_body
  /**
   * url only. https, no userinfo, not private/link-local/loopback. Validated by
   * isSafePublicHttpsUrl(), not by z.url() alone: the AGENT RUNTIME fetches this, and a
   * model-authored link-local address in a template is an SSRF payload we shipped.
   */
  url: string | null;
  acceptedMimeTypes: string[];      // file_request only; intersected with CONTEXT_MIME_ALLOWLIST
  maxBytes: number | null;          // file_request only; default 10 MiB, ceiling 20 MB
  placeholder: string | null;
  containsPii: boolean;             // set by the LINTER, not the model
}

export type SchedulePayloadKind = "task" | "digest" | "check" | "reminder";

export interface TemplateSchedule {
  key: string;
  agentKey: string;
  title: string;                    // ≤80, in `locale`  → agent_schedules.name
  kind: "recurring" | "one_off" | "reminder";
  cron: string;                     // 5-field, validated by isValidCron() before it reaches here
  timezone: string;                 // IANA, validated by isValidTimeZone()
  /** "YYYY-MM-DD" in `timezone` for one_off, else null. Why a one-off still carries a cron. */
  onDate: string | null;
  payloadKind: SchedulePayloadKind;
  prompt: string;                   // ≤600, in `locale`
  deliverTo: "chat" | "email" | "channel" | "none";
  catchUpPolicy: "skip" | "run_once";
  enabled: boolean;
  maxRunsPerDay: number;            // 1..288; the generator never proposes above 96
  source: "user_phrase" | "deterministic" | "llm";
  confidence: number;               // 0..1
  /** From describeCron(cron, locale). NEVER model-authored, and RE-DERIVED on read. */
  humanReadable: string;
}


export type StageId =
  | "intake" | "charter" | "capabilities" | "skills" | "boundaries"
  | "context" | "schedules" | "assemble" | "lint" | "finalize";

export type StageOutcome = "ok" | "repaired" | "fallback" | "skipped" | "failed";

export interface DraftStageTrace {
  stage: StageId;
  engine: "rules" | "llm" | "db" | "mixed";
  model: string | null;
  startedAt: string;                // ISO 8601
  durationMs: number;
  attempts: number;
  outcome: StageOutcome;
  promptTokens: number;
  completionTokens: number;
  /** Normalized class from classifyLlmError(); NEVER a provider message. */
  errorCode: string | null;
}

export type WarningSeverity = "info" | "warn" | "error";

export interface DraftWarning {
  code: string;                     // "ATG-L001"; the localized copy lives in lib/i18n/templates.ts
  severity: WarningSeverity;
  path: string;                     // JSON pointer, e.g. "/boundaries/approvalAmountUsd"
  message: string;                  // English, for logs
  remediation: string | null;
  remediated: boolean;
}

export interface InjectionFinding {
  /** "override" | "exfil" | "hidden_text" | "encoded_blob" | "role_play" | "tool_grab" */
  pattern: string;
  offset: number;                   // byte offset into the NORMALIZED brief
  excerpt: string;                  // ≤80 chars, for the audit trail
  severity: WarningSeverity;
}

export interface DraftProvenance {
  generationId: string;
  mode: "llm" | "hybrid" | "deterministic";
  stages: DraftStageTrace[];
  briefSha256: string;
  warnings: DraftWarning[];
  injectionFindings: InjectionFinding[];
  materializable: boolean;
}
