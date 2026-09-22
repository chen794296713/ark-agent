/**
 * The shape of every JSONB column the runtime tables carry.
 *
 * These are a CONTRACT with the backend agent service, not internal types: the
 * runtime writes most of these blobs and ArkAgent only reads them. Changing a
 * field here without changing docs/BACKEND_INTEGRATION_CONTRACT.md breaks a
 * system that cannot see this file.
 *
 * Client-safe on purpose — the Activity and Skills pages render these directly,
 * and a `server-only` import here would drag Drizzle into the browser bundle.
 *
 * Untrusted by default: everything a third-party skill or a remote runtime puts
 * in one of these fields is DATA. It is rendered as text and never interpreted
 * as an instruction, a URL to fetch, or HTML.
 */
import type { Autonomy } from "@/lib/agent-settings";
import type { Harness } from "@/lib/harness";
/** skill_sources.last_sync_stats — every value is a count except durationMs. */
export interface SyncStats {
  fetched?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  blocked?: number;
  durationMs?: number;
}

/**
 * skills.harness_compat. Why we believe a skill runs on a harness.
 * `declared` = the publisher says so · `verified` = we installed it there ·
 * `inferred` = the §2.3 rubric derived it from `requirements` ·
 * `unknown` = nobody asserted anything, which renders as "untested", NOT as a green tick.
 */
export type CompatBasis = "verified" | "declared" | "inferred" | "unknown";

export interface HarnessCompat {
  supported: boolean;
  basis: CompatBasis;
  /** Sanitized, ≤160 chars. e.g. "needs the OpenClaw `slack` tool". */
  note?: string;
}

export type HarnessCompatMap = Partial<Record<Harness, HarnessCompat>>;

/**
 * skills.requirements. OpenClaw's `metadata.openclaw.requires.{bins,env,config}` + `os`, adopted
 * verbatim. `env` holds variable NAMES only — never values.
 */
export interface SkillRequirements {
  /** Binaries that must be on PATH: ["gh"], ["node","npx"]. */
  bins?: string[];
  /** Env var names the skill reads: ["GITHUB_TOKEN"]. Names only. */
  env?: string[];
  /** Harness-specific HOST capabilities: ["openclaw.tool.slack"], ["mcp.client"]. */
  config?: string[];
  /** ["darwin","linux"] — absent means any. */
  os?: string[];
}

/**
 * skills.permissions. The authority a skill asks for, normalized so it can be DIFFED against
 * AgentSettings.tools rather than mapped to it.
 */
export interface SkillPermissions {
  /** Keys are exactly AgentSettings["tools"] keys, so reconciliation is a set operation. */
  tools?: Array<"shell" | "files" | "browser" | "docker" | "code">;
  /** `arbitrary` forces the risk band to ≥ medium. */
  network?: "none" | "public-read" | "declared-hosts" | "arbitrary";
  /** Hosts the skill legitimately talks to. A fetch outside this set is the +4 risk signal. */
  hosts?: string[];
  filesystem?: "none" | "workspace-read" | "workspace-write" | "host-read" | "host-write";
  /** Credential scope in one phrase: "gh CLI (full user scope)", "Notion workspace token". */
  credentials?: string[];
  /** True when the skill can take an action a human cannot undo: send, publish, pay, apply. */
  irreversible?: boolean;
}

/** skills.install. How the runtime obtains the body. Discriminated on `mode`. */
export type SkillInstall =
  | { mode: "registry"; registry: "clawhub"; ref: string; version: string }
  | { mode: "git"; repo: string; ref: string; subdir: string }
  | { mode: "inline"; sha256: string; bytes: number }
  | { mode: "mcp_stdio"; command: string; args: string[]; env: string[] }
  | { mode: "mcp_http"; url: string; headerEnv: string[] };

/** skills.risk_signals — the individual rubric triggers, rendered in the drawer as prose. */
export interface RiskSignal {
  /** Stable machine code, and the i18n key for the sentence: "vendor_publisher". */
  code: string;
  delta: number;
  /** Sanitized detail, ≤200 chars. Rendered as TEXT, never as markup. */
  detail?: string;
}

/** skills.known_versions — last ≤20, newest first, bounded on write. */
export interface SkillVersionRef {
  version: string;
  publishedAt: string | null;
  sha256: string | null;
  riskLevel: "low" | "medium" | "high" | null;
}

/**
 * agent_skills.config. A record, not an interface, because the keys are the skill's own env var
 * names. The constraint that matters is negative and is enforced by an explicit Zod `.check()`:
 * NO key may match SECRET_KEYS (/token|secret|key|appsecret|password/i, exported from
 * lib/serializers.ts:107 — a module-private `const` today; W2-7 adds the `export` keyword to it,
 * so there is one definition and not two that drift). `.strict()` is a no-op
 * on a z.record and is NOT the mechanism.
 */
export type SkillConfig = Record<string, string>;

/**
 * agent_activities.params. Interpolation values for the localised template keyed by
 * agent_activities.code. UNTRUSTED runtime data: escaped at render in all four languages.
 * A union of primitives, not `unknown`, so a renderer can never be handed an object to stringify.
 *
 * `string | number` and NOT `| boolean` — HARNESSES_AND_ACTIVITY §9 types it this way and it owns
 * the code registry, every template, and every params column in that registry. An earlier draft
 * here added `boolean`, which is worse than merely inconsistent: `true` has no localisation, so a
 * boolean param renders as the English word "true" in the 日本語 UI. A flag belongs in the `code`
 * (two codes, two sentences), not in `params`. The event validator REJECTS a boolean param with
 * `rejected: invalid_param_type` rather than coercing it.
 */
export type ActivityParams = Record<string, string | number>;

/**
 * agent_improvements.proposal. A machine-applicable description of a config change, applied ONLY
 * on human approval and applied BY ArkAgent — data describing a change, never a command that
 * executes on receipt. The union is closed; an unknown shape is stored and shown but is NOT
 * offered as a one-click apply, which is what `unknown` below represents at the parse boundary.
 */
export type ImprovementProposal =
  | { appendRule: string }
  | { appendInstruction: string }
  | { attachSkill: { publicId: string; version: string | null; reason: string } }
  | { addSchedule: { name: string; cron: string; timezone: string; prompt: string } }
  | { patchSettings: { autonomy?: Autonomy; temperature?: number; heartbeatMinutes?: number } };
// Tone, ResponseLanguage, Autonomy, ReasoningEffort and AgentSettings are imported from
// lib/agent-settings.ts (:14-17, :123); ChannelType from the channelTypeEnum union. The
// patchSettings arm spells its three keys out rather than Partial<Pick<…>> so that the arm cannot
// be satisfied by {} — a discriminated union whose members are all-optional is not discriminated.
