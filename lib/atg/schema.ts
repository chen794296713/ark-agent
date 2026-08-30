/**
 * The Zod v4 mirror of `AgentTemplateDraft`, plus the per-stage response
 * schemas the model is actually asked for.
 *
 * Two families live here and they are not the same thing:
 *
 *  - The **draft** schemas describe what is persisted. They are non-strict,
 *    because a draft read back from `agent_templates.draft` may have been
 *    written by an older `schemaVersion` and the version check is what guards
 *    that case.
 *  - The **stage** schemas describe what one model call returns. They are
 *    `.strict()`, because a model that invents a key is telling us the prompt
 *    drifted from its shape block, and dropping it silently is how that goes
 *    unnoticed for a release.
 *
 * Client-safe: `lib/schedule/cron.ts` and `./safety` carry no `server-only`,
 * which is what lets the browser-side template editor validate a draft it is
 * editing without a round-trip.
 */
import { z } from "zod";
import { isValidCron, isValidTimeZone } from "@/lib/schedule/cron";
import { CHANNEL_TYPE_IDS } from "@/lib/channels";
import { HARNESS_IDS } from "@/lib/harness";
import type { AgentTemplateDraft } from "./types";
import { CONTEXT_MAX_BYTES_CEILING, isContextMimeType, isSafePublicHttpsUrl } from "./safety";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Draft-local join keys. ASCII kebab so they survive a URL and a JSON pointer. */
const kebabKey = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be kebab-case ascii");

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

const hexHue = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #rrggbb");

const timezone = z.string().max(64).refine(isValidTimeZone, "unknown IANA time zone");

const cron = z.string().max(120).refine(isValidCron, "not a valid 5-field cron expression");

/**
 * Code points, not code units: "李" is 1 and "🙂" is 1, but a regional-indicator
 * flag pair is 2. The column is `varchar(8)`, so 1–2 code points sits well
 * inside it while still rejecting a word.
 */
const mono = z
  .string()
  .refine((s) => {
    const n = Array.from(s).length;
    return n >= 1 && n <= 2;
  }, "must be one or two code points");

export const harnessSchema = z.enum(HARNESS_IDS);
export const localeSchema = z.enum(["en", "zh", "zht", "ja"]);
export const planTierSchema = z.enum(["associate", "professional", "director"]);
export const channelTypeSchema = z.enum(CHANNEL_TYPE_IDS);
export const riskLevelSchema = z.enum(["low", "medium", "high"]);
export const autonomySchema = z.enum(["suggest", "ask", "auto"]);
export const templateCategorySchema = z.enum([
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
export const ruleCategorySchema = z.enum([
  "money",
  "external_comms",
  "data",
  "scope",
  "quality",
  "legal",
  "safety",
  "schedule",
]);
export const stageIdSchema = z.enum([
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
]);

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export const templateMetaSchema = z.object({
  name: z.string().min(1).max(60),
  slug: kebabKey,
  summary: z.string().min(1).max(200),
  description: z.string().min(1).max(1200),
  category: templateCategorySchema,
  tags: z.array(kebabKey).max(8),
  mono,
  hue: hexHue,
  minPlan: planTierSchema,
  estimatedCreditsPerMonth: z.number().int().min(0).max(10_000_000),
});

export const templateMetricSchema = z.object({
  label: z.string().min(1).max(60),
  target: z.string().min(1).max(40),
  unit: z.enum(["percent", "count", "currency", "duration", "ratio", "text"]),
});

export const templateRoleSchema = z.object({
  key: kebabKey,
  baseRoleId: z.string().max(40).nullable(),
  title: z.string().min(1).max(80),
  mission: z.string().min(1).max(400),
  responsibilities: z.array(z.string().min(1).max(160)).min(3).max(8),
  successMetrics: z.array(templateMetricSchema).min(1).max(5),
  stakeholders: z.array(z.string().min(1).max(80)).max(5),
  handoffs: z.array(z.string().min(1).max(160)).max(5),
});

export const templateAgentSettingsSchema = z.object({
  tone: z.enum(["professional", "friendly", "concise", "formal", "playful"]),
  responseLanguage: z.enum(["auto", "en", "zh", "zht", "ja"]),
  timezone,
  alwaysOn: z.boolean(),
  workStart: hhmm,
  workEnd: hhmm,
  workDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  heartbeatMinutes: z.number().int().min(1).max(1440),
  temperature: z.number().min(0).max(1),
  maxTokens: z.number().int().min(256).max(200_000),
  reasoningEffort: z.enum(["low", "medium", "high"]),
  memoryEnabled: z.boolean(),
  selfImprove: z.boolean(),
  autoCreateSkills: z.boolean(),
  notifyNeedsReview: z.boolean(),
  notifyErrors: z.boolean(),
  dailyDigest: z.boolean(),
  digestTime: hhmm,
});

export const templateTaskSchema = z.object({
  text: z.string().min(1).max(400),
  meta: z.string().max(120).nullable(),
  sortOrder: z.number().int().min(0).max(99),
});

export const templateAgentSchema = z.object({
  key: kebabKey,
  roleKey: kebabKey,
  name: z.string().min(1).max(80),
  harness: harnessSchema,
  isPrimary: z.boolean(),
  brief: z.string().min(1).max(4000),
  settings: templateAgentSettingsSchema,
  tools: z.object({
    shell: z.boolean(),
    files: z.boolean(),
    browser: z.boolean(),
    docker: z.boolean(),
    code: z.boolean(),
  }),
  channels: z.array(channelTypeSchema).max(CHANNEL_TYPE_IDS.length),
  tasks: z.array(templateTaskSchema).max(8),
  skillKeys: z.array(kebabKey).max(12),
  scheduleKeys: z.array(kebabKey).max(8),
  contextKeys: z.array(kebabKey).max(8),
});

/**
 * OpenClaw's `metadata.openclaw.requires` shape, adopted verbatim from
 * `lib/runtime/types.ts`. Every field is optional there — "the publisher told us
 * nothing" and "the publisher told us nothing is needed" are different facts —
 * so every field is optional here, or the `Exact<>` assertion below would fail.
 */
export const skillRequirementsSchema = z.object({
  bins: z.array(z.string().max(80)).max(20).optional(),
  env: z.array(z.string().max(80)).max(20).optional(),
  config: z.array(z.string().max(80)).max(20).optional(),
  os: z.array(z.string().max(40)).max(8).optional(),
});

export const templateSkillSchema = z
  .object({
    key: kebabKey,
    skillId: z.uuid().nullable(),
    // `skills.source_id` is an operator-chosen slug, not a closed set — a new
    // catalogue source must not invalidate every template that predates it.
    source: z.string().min(1).max(40),
    ownerHandle: z.string().max(80).nullable(),
    slug: z.string().min(1).max(120),
    version: z.string().max(40).nullable(),
    displayName: z.string().min(1).max(120),
    purpose: z.string().min(1).max(160),
    riskLevel: riskLevelSchema,
    riskAccepted: z.boolean(),
    harnessCompatible: z.boolean(),
    requirements: skillRequirementsSchema,
    required: z.boolean(),
    rankScore: z.number(),
    rankReasons: z.array(z.string().max(120)).max(8),
  })
  // A floating ref resolved at agent runtime is AST07 update drift by
  // construction. Cheaper to make it unrepresentable than to remember to check.
  .refine((s) => s.version !== "latest", {
    message: "version must be pinned, never 'latest'",
    path: ["version"],
  })
  .refine((s) => s.harnessCompatible, {
    message: "incompatible skills must not reach the draft",
    path: ["harnessCompatible"],
  });

export const templateRuleSchema = z.object({
  text: z.string().min(1).max(200),
  severity: z.enum(["hard", "soft"]),
  category: ruleCategorySchema,
});

export const templateBoundariesSchema = z.object({
  autonomy: autonomySchema,
  approvalAmountUsd: z.number().int().min(0).max(1_000_000),
  approveExternalSends: z.boolean(),
  dailyActionLimit: z.number().int().min(0).max(100_000),
  rules: z.array(templateRuleSchema).min(3).max(12),
  prohibitions: z.array(z.string().min(1).max(200)).max(10),
  escalation: z.object({
    // Literal null. A generated address is either hallucinated or lifted out of
    // the user's brief, and both write a stranger's address into an agent's
    // notification config. The UI collects it after materialization.
    to: z.null(),
    triggers: z.array(z.string().min(1).max(160)).max(6),
    channel: z.enum(["email", "chat", "none"]),
  }),
  dataHandling: z.object({
    piiAllowed: z.boolean(),
    retentionDays: z.number().int().min(1).max(3650),
    redactFields: z.array(z.string().max(60)).max(20),
  }),
  spend: z.object({
    monthlyCreditCap: z.number().int().min(0).max(100_000_000),
  }),
});

export const templateContextItemSchema = z
  .object({
    key: kebabKey,
    kind: z.enum(["pasted_text", "file_request", "url"]),
    title: z.string().min(1).max(80),
    purpose: z.string().min(1).max(200),
    required: z.boolean(),
    body: z.string().max(8000).nullable(),
    url: z.string().max(500).nullable(),
    // Typed `string[]`, constrained by refinement rather than `z.enum`, because
    // `TemplateContextItem.acceptedMimeTypes` is `string[]` in the contract and
    // narrowing it here would break the Exact<> assertion.
    acceptedMimeTypes: z.array(z.string().max(120)).max(10),
    maxBytes: z.number().int().min(1).max(CONTEXT_MAX_BYTES_CEILING).nullable(),
    placeholder: z.string().max(200).nullable(),
    containsPii: z.boolean(),
  })
  .refine((c) => c.kind !== "url" || (c.url !== null && isSafePublicHttpsUrl(c.url)), {
    message: "url items need a public https url with no credentials",
    path: ["url"],
  })
  .refine((c) => c.kind === "url" || c.url === null, {
    message: "only url items carry a url",
    path: ["url"],
  })
  .refine((c) => c.kind === "pasted_text" || c.body === null, {
    message: "only pasted_text items carry a body",
    path: ["body"],
  })
  .refine((c) => c.acceptedMimeTypes.every(isContextMimeType), {
    message: "mime type outside CONTEXT_MIME_ALLOWLIST",
    path: ["acceptedMimeTypes"],
  })
  .refine((c) => c.kind === "file_request" || c.acceptedMimeTypes.length === 0, {
    message: "only file_request items accept mime types",
    path: ["acceptedMimeTypes"],
  })
  .refine((c) => c.kind === "file_request" || c.maxBytes === null, {
    message: "only file_request items carry a size cap",
    path: ["maxBytes"],
  });

export const templateScheduleSchema = z
  .object({
    key: kebabKey,
    agentKey: kebabKey,
    title: z.string().min(1).max(80),
    kind: z.enum(["recurring", "one_off", "reminder"]),
    cron,
    timezone,
    onDate: isoDate.nullable(),
    payloadKind: z.enum(["task", "digest", "check", "reminder"]),
    prompt: z.string().min(1).max(600),
    deliverTo: z.enum(["chat", "email", "channel", "none"]),
    catchUpPolicy: z.enum(["skip", "run_once"]),
    enabled: z.boolean(),
    maxRunsPerDay: z.number().int().min(1).max(288),
    source: z.enum(["user_phrase", "deterministic", "llm"]),
    confidence: z.number().min(0).max(1),
    humanReadable: z.string().min(1).max(200),
  })
  .refine((s) => (s.kind === "one_off") === (s.onDate !== null), {
    message: "onDate is required for one_off and forbidden otherwise",
    path: ["onDate"],
  });

export const draftStageTraceSchema = z.object({
  stage: stageIdSchema,
  engine: z.enum(["rules", "llm", "db", "mixed"]),
  model: z.string().max(160).nullable(),
  startedAt: z.iso.datetime(),
  durationMs: z.number().int().min(0),
  attempts: z.number().int().min(0).max(5),
  outcome: z.enum(["ok", "repaired", "fallback", "skipped", "failed"]),
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  errorCode: z.string().max(40).nullable(),
});

export const draftWarningSchema = z.object({
  code: z.string().max(16),
  severity: z.enum(["info", "warn", "error"]),
  path: z.string().max(200),
  message: z.string().max(300),
  remediation: z.string().max(300).nullable(),
  remediated: z.boolean(),
});

export const injectionFindingSchema = z.object({
  pattern: z.string().max(40),
  offset: z.number().int().min(0),
  excerpt: z.string().max(80),
  severity: z.enum(["info", "warn", "error"]),
});

export const draftProvenanceSchema = z.object({
  generationId: z.uuid(),
  mode: z.enum(["llm", "hybrid", "deterministic"]),
  stages: z.array(draftStageTraceSchema).max(20),
  briefSha256: z.string().length(64),
  warnings: z.array(draftWarningSchema).max(60),
  injectionFindings: z.array(injectionFindingSchema).max(40),
  materializable: z.boolean(),
});

// ---------------------------------------------------------------------------
// The whole draft, with cross-reference integrity
// ---------------------------------------------------------------------------

export const agentTemplateDraftSchema = z
  .object({
    schemaVersion: z.literal(1),
    locale: localeSchema,
    harness: harnessSchema,
    meta: templateMetaSchema,
    roles: z.array(templateRoleSchema).min(1).max(3),
    agents: z.array(templateAgentSchema).min(1).max(3),
    skills: z.array(templateSkillSchema).max(12),
    boundaries: templateBoundariesSchema,
    context: z.array(templateContextItemSchema).max(8),
    schedules: z.array(templateScheduleSchema).max(8),
    provenance: draftProvenanceSchema,
  })
  // Referential integrity is checked HERE rather than at materialization,
  // because a dangling key is a generation defect the repair loop can fix and a
  // transaction rollback cannot.
  .superRefine((d, ctx) => {
    const roleKeys = new Set(d.roles.map((r) => r.key));
    const agentKeys = new Set(d.agents.map((a) => a.key));
    const skillKeys = new Set(d.skills.map((s) => s.key));
    const scheduleKeys = new Set(d.schedules.map((s) => s.key));
    const contextKeys = new Set(d.context.map((c) => c.key));

    const dup = (label: string, list: { key: string }[], set: Set<string>) => {
      if (set.size !== list.length) {
        ctx.addIssue({ code: "custom", path: [label], message: `duplicate ${label} keys` });
      }
    };
    dup("roles", d.roles, roleKeys);
    dup("agents", d.agents, agentKeys);
    dup("skills", d.skills, skillKeys);
    dup("schedules", d.schedules, scheduleKeys);
    dup("context", d.context, contextKeys);

    if (d.agents.filter((a) => a.isPrimary).length !== 1) {
      ctx.addIssue({ code: "custom", path: ["agents"], message: "exactly one primary agent" });
    }

    d.agents.forEach((a, i) => {
      if (!roleKeys.has(a.roleKey)) {
        ctx.addIssue({ code: "custom", path: ["agents", i, "roleKey"], message: "unknown roleKey" });
      }
      for (const k of a.skillKeys) {
        if (!skillKeys.has(k)) {
          ctx.addIssue({
            code: "custom",
            path: ["agents", i, "skillKeys"],
            message: `unknown skill ${k}`,
          });
        }
      }
      for (const k of a.scheduleKeys) {
        if (!scheduleKeys.has(k)) {
          ctx.addIssue({
            code: "custom",
            path: ["agents", i, "scheduleKeys"],
            message: `unknown schedule ${k}`,
          });
        }
      }
      for (const k of a.contextKeys) {
        if (!contextKeys.has(k)) {
          ctx.addIssue({
            code: "custom",
            path: ["agents", i, "contextKeys"],
            message: `unknown context ${k}`,
          });
        }
      }
    });

    d.schedules.forEach((s, i) => {
      if (!agentKeys.has(s.agentKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["schedules", i, "agentKey"],
          message: "unknown agentKey",
        });
      }
    });
  });

export type AgentTemplateDraftParsed = z.infer<typeof agentTemplateDraftSchema>;

/**
 * Mutual assignability between the hand-written contract and the parser.
 *
 * A field present on one side and absent on the other fails to compile; a field
 * REQUIRED on one side and OPTIONAL on the other does not, because `{a: string}`
 * and `{a: string; b?: undefined}` are mutually assignable. So: no optional
 * properties anywhere in the draft types — every nullable field is spelled
 * `T | null`, never `T?`. That rule is what makes this an actual contract
 * rather than a comforting one. (`SkillRequirements` is the deliberate
 * exception; it is a foreign shape, and both sides spell it identically.)
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _draftContractHolds: Exact<AgentTemplateDraft, AgentTemplateDraftParsed> = true;
void _draftContractHolds;

// ---------------------------------------------------------------------------
// Stage schemas — what ONE model call returns, not what is persisted
// ---------------------------------------------------------------------------

/** Stage 1. Assembly fills slug, hue, minPlan and the credit estimate. */
export const charterResponseSchema = z
  .object({
    meta: z
      .object({
        name: z.string().min(1).max(60),
        summary: z.string().min(1).max(200),
        description: z.string().min(1).max(1200),
        category: templateCategorySchema,
        tags: z.array(z.string().min(1).max(48)).max(8),
        mono: z.string().min(1).max(8),
      })
      .strict(),
    roles: z
      .array(
        z
          .object({
            key: z.string().min(1).max(48),
            baseRoleId: z.string().max(40).nullable(),
            title: z.string().min(1).max(80),
            mission: z.string().min(1).max(400),
            responsibilities: z.array(z.string().min(1).max(160)).min(3).max(8),
            successMetrics: z.array(templateMetricSchema).min(1).max(5),
            stakeholders: z.array(z.string().min(1).max(80)).max(5),
            handoffs: z.array(z.string().min(1).max(160)).max(5),
          })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict();
export type CharterResponse = z.infer<typeof charterResponseSchema>;

/** Stage 2. Consumed by retrieval; never stored. */
export const capabilityRequestSchema = z
  .object({
    capability: z.string().min(1).max(80),
    roleKey: z.string().min(1).max(48),
    necessity: z.enum(["must", "nice"]),
    tags: z.array(z.string().min(1).max(40)).max(5),
  })
  .strict();
export type CapabilityRequest = z.infer<typeof capabilityRequestSchema>;

export const capabilitiesResponseSchema = z
  .object({ capabilities: z.array(capabilityRequestSchema).min(1).max(10) })
  .strict();

/** Stage 3 rerank. Ids outside the candidate set are discarded by the caller. */
export const skillRerankResponseSchema = z
  .object({
    selected: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            purpose: z.string().min(1).max(160),
            required: z.boolean(),
          })
          .strict(),
      )
      .max(12),
    rejected: z
      .array(z.object({ id: z.string().max(64), reason: z.string().max(160) }).strict())
      .max(5)
      .default([]),
  })
  .strict();

/** Stage 4. `escalation.to` is never asked for; assembly writes the null. */
export const boundariesResponseSchema = z
  .object({
    autonomy: autonomySchema,
    approvalAmountUsd: z.number().int().min(0).max(1_000_000),
    approveExternalSends: z.boolean(),
    dailyActionLimit: z.number().int().min(0).max(100_000),
    rules: z.array(templateRuleSchema).min(3).max(12),
    prohibitions: z.array(z.string().min(1).max(200)).max(10),
    escalation: z
      .object({
        triggers: z.array(z.string().min(1).max(160)).max(6),
        channel: z.enum(["email", "chat", "none"]),
      })
      .strict(),
    dataHandling: z
      .object({
        piiAllowed: z.boolean(),
        retentionDays: z.number().int().min(1).max(3650),
        redactFields: z.array(z.string().max(60)).max(20),
      })
      .strict(),
    spend: z.object({ monthlyCreditCap: z.number().int().min(0).max(100_000_000) }).strict(),
  })
  .strict();
export type BoundariesResponse = z.infer<typeof boundariesResponseSchema>;

/** Stage 5. Assembly fills url, maxBytes and containsPii. */
export const contextResponseSchema = z
  .object({
    context: z
      .array(
        z
          .object({
            key: z.string().min(1).max(48),
            kind: z.enum(["pasted_text", "file_request", "url"]),
            title: z.string().min(1).max(80),
            purpose: z.string().min(1).max(200),
            required: z.boolean(),
            body: z.string().max(8000).nullable(),
            placeholder: z.string().max(200).nullable(),
            acceptedMimeTypes: z.array(z.string().max(120)).max(10).default([]),
            url: z.string().max(500).nullable().default(null),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

/**
 * Stage 6. The model writes a PHRASE; `lib/schedule/parse.ts` compiles it. The
 * `cron` field is a cross-check, and when the two disagree the parser wins.
 */
export const schedulesResponseSchema = z
  .object({
    schedules: z
      .array(
        z
          .object({
            key: z.string().min(1).max(48),
            agentKey: z.string().min(1).max(48),
            title: z.string().min(1).max(80),
            phrase: z.string().min(1).max(80),
            cron: z.string().max(120),
            kind: z.enum(["recurring", "reminder"]),
            payloadKind: z.enum(["task", "digest", "check", "reminder"]),
            prompt: z.string().min(1).max(600),
            deliverTo: z.enum(["chat", "email", "none"]),
          })
          .strict(),
      )
      .max(3),
  })
  .strict();

/** Stage 9, optional. A failed narration never blocks a generation. */
export const narrationResponseSchema = z
  .object({ description: z.string().min(1).max(1200) })
  .strict();
