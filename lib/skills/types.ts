/**
 * The canonical Skill record — the vocabulary every other skills module speaks.
 *
 * Client-safe on purpose: the browser renders `SkillCardDTO` and needs the
 * category list, the risk words and the compat basis. A `server-only` import
 * here would drag Drizzle and `postgres` into the page bundle, which is exactly
 * why `lib/harness/index.ts` and `lib/channels.ts` are shaped the same way.
 *
 * The JSONB payload interfaces are NOT redeclared here. They are a contract with
 * the backend agent service and live in `lib/runtime/types.ts`; this module
 * re-exports them so a consumer has one import, not two, and so there is no
 * second definition to drift.
 */
import { HARNESS_IDS, type Harness } from "@/lib/harness";

export type {
  CompatBasis,
  HarnessCompat,
  HarnessCompatMap,
  RiskSignal,
  SkillConfig,
  SkillInstall,
  SkillPermissions,
  SkillRequirements,
  SkillVersionRef,
  SyncStats,
} from "@/lib/runtime/types";

import type {
  HarnessCompatMap,
  RiskSignal,
  SkillInstall,
  SkillPermissions,
  SkillRequirements,
  SkillVersionRef,
} from "@/lib/runtime/types";

/**
 * The 16-category taxonomy, in the order it renders.
 *
 * `lib/db/schema.ts` declares `skillCategoryEnum` with the same 16 values in the
 * same order. It cannot import this file (the schema is the dependency root and
 * this module imports `@/lib/harness`, which is fine, but the schema predates
 * it), so `tests/skills-catalog.test.ts` asserts the two lists are identical
 * rather than trusting a comment. Postgres can append an enum value but never
 * reorder one, so this order is a schema fact.
 */
export const SKILL_CATEGORY_IDS = [
  "search-research",
  "browser-automation",
  "coding-dev-tools",
  "version-control",
  "devops-cloud",
  "data-databases",
  "documents-files",
  "communication",
  "productivity",
  "crm-sales-marketing",
  "media",
  "knowledge-memory",
  "agent-meta",
  "security-secrets",
  "finance-payments",
  "design-creative",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORY_IDS)[number];

export function isSkillCategory(value: string): value is SkillCategory {
  return (SKILL_CATEGORY_IDS as readonly string[]).includes(value);
}

export const SKILL_FORMAT_IDS = ["agent_skill", "mcp_server", "skill_pack"] as const;
export type SkillFormat = (typeof SKILL_FORMAT_IDS)[number];

export const SKILL_RISK_IDS = ["low", "medium", "high"] as const;
export type SkillRisk = (typeof SKILL_RISK_IDS)[number];

export const SKILL_STATUS_IDS = ["draft", "published", "deprecated", "blocked"] as const;
export type SkillStatus = (typeof SKILL_STATUS_IDS)[number];

export const AGENT_SKILL_STATE_IDS = [
  "pending",
  "installing",
  "installed",
  "failed",
  "removing",
  "removed",
] as const;
export type AgentSkillState = (typeof AGENT_SKILL_STATE_IDS)[number];

export const AGENT_SKILL_ORIGIN_IDS = [
  "manual",
  "template",
  "atg",
  "role_default",
  "migration",
] as const;
export type AgentSkillOrigin = (typeof AGENT_SKILL_ORIGIN_IDS)[number];

/**
 * The blast-radius tiers of SKILL_REPOSITORY §5.2, as a closed union rather than
 * a bare number: `capability: 3` is not a tier, and a typo that produced one
 * would silently shift a band.
 *
 * The gap between 2 and 4 is deliberate — §5.2's table skips 3, 5, 7 and 9 so
 * that the modifier sum (§5.3) can move a skill within a band without hopping
 * one. Do not fill them in.
 */
export const CAPABILITY_TIERS = [0, 1, 2, 4, 6, 8, 10] as const;
export type CapabilityTier = (typeof CAPABILITY_TIERS)[number];

/** Human-readable tier ids, used as the i18n key for the drawer's "blast radius" line. */
export const CAPABILITY_TIER_CODES: Record<CapabilityTier, string> = {
  0: "inert",
  1: "local_data",
  2: "public_read",
  4: "local_exec",
  6: "service_write",
  8: "broad_credential",
  10: "irreversible",
};

/**
 * The order harnesses render in every skills surface — an alias, not a second
 * list. Hand-copying the four ids here is how the picker ends up one harness
 * behind `HARNESS_IDS` on the day a fifth is added; `lib/harness/index.ts` owns
 * the order and says so.
 *
 * Product names are untranslated wherever this drives a label: a 日本語 user
 * searching for "Hermes" must find it.
 */
export const HARNESS_ORDER: readonly Harness[] = HARNESS_IDS;

// ---------------------------------------------------------------------------
// DTOs — SKILL_REPOSITORY §2.2
// ---------------------------------------------------------------------------

/**
 * The list payload. Everything `UI_DESIGN_V2.md` D.1 draws on a card is on it,
 * including `upstreamUpdatedAt` (the "UPDATED · 6d ago" strip), because a card
 * that has to fetch the detail route to finish rendering is not a card.
 */
export interface SkillCardDTO {
  publicId: string;
  slug: string;
  ownerHandle: string;
  name: string;
  summary: string;
  category: SkillCategory;
  format: SkillFormat;
  tags: string[];
  harnesses: Harness[];
  harnessCompat: HarnessCompatMap;
  riskLevel: SkillRisk;
  license: string;
  licenseVerified: boolean;
  verified: boolean;
  popularity: number;
  stars: number;
  downloads: number;
  sourceId: string;
  publisherName: string;
  publisherVerified: boolean;
  attributionUrl: string | null;
  latestVersion: string;
  upstreamUpdatedAt: string | null;
  /** Present only when the request carried `?agentId=` — drives the "Added" chip. */
  attachment?: SkillAttachmentBadge | null;
}

export interface SkillAttachmentBadge {
  id: string;
  state: AgentSkillState;
  version: string;
  enabled: boolean;
}

export interface ScannerSummary {
  scanner: "clawhub" | null;
  /** "pass" | "review" | "fail" */
  decision: string | null;
  /** "clean" | "warn" | "malicious" */
  status: string | null;
  virusTotalFlagged: number | null;
  /** The denominator. D.3 renders "0 / 68 vendors"; without this it cannot. */
  virusTotalTotal: number | null;
  scannedAt: string | null;
  confidence: number | null;
}

export interface SkillDTO extends SkillCardDTO {
  description: string;
  sourceUrl: string;
  homepageUrl: string | null;
  requirements: SkillRequirements;
  permissions: SkillPermissions;
  install: SkillInstall;
  riskScore: number;
  riskSignals: RiskSignal[];
  riskScoredAt: string | null;
  provenance: string;
  artifactSha256: string | null;
  /**
   * The mapped five fields, never the raw `scanner_verdict` blob: that is a
   * third-party document of unbounded shape, and mapping it is the difference
   * between rendering data and rendering someone else's payload.
   */
  scannerSummary: ScannerSummary | null;
  knownVersions: SkillVersionRef[];
  deprecationNote: string | null;
  deprecatedAt: string | null;
  /** `published` for everyone but a staff session. */
  status: SkillStatus;
  /** Staff sessions only; null otherwise. */
  reviewNote: string | null;
}

/** One attachment of one skill to one agent. */
export interface AgentSkillDTO {
  id: string;
  skill: SkillCardDTO;
  version: string;
  harness: Harness;
  compatAsserted: boolean;
  enabled: boolean;
  state: AgentSkillState;
  installError: string | null;
  installSource: string;
  riskLevelAtAttach: SkillRisk;
  riskAcknowledged: boolean;
  /** `skills.risk_level` has risen since attach — the AST07 drift signal. */
  riskDrift: boolean;
  /** The attachment's harness is no longer the agent's harness (AST10). */
  harnessDrift: boolean;
  origin: AgentSkillOrigin;
  createdAt: string;
  installedAt: string | null;
  lastVerifiedAt: string | null;
}

export interface SkillFacets {
  category: Partial<Record<SkillCategory, number>>;
  risk: Record<SkillRisk, number>;
  harness: Record<Harness, number>;
  source: Record<string, number>;
}

export interface SkillListResponse {
  items: SkillCardDTO[];
  page: number;
  perPage: number;
  total: number;
  facets: SkillFacets;
  /** How many rows the `includeHigh=false` default removed. A hidden filter is an untrustworthy one. */
  hiddenByRisk: number;
  hiddenByVerification: number;
}

export interface AgentSkillListResponse {
  items: AgentSkillDTO[];
  /** Union of `permissions.tools` the attached skills need that the agent has switched off. */
  toolGaps: string[];
}

export interface AttachSkillResponse {
  item: AgentSkillDTO;
  toolsEnabled: string[];
  /** "live" | "mock" | "unsupported" — the toast says which. */
  runtime: string;
}

export interface SkillSyncResponse {
  source: string;
  mode: string;
  dryRun: boolean;
  stats: {
    fetched: number;
    created: number;
    updated: number;
    skipped: number;
    blocked: number;
    durationMs: number;
  };
  cursor: string | null;
  done: boolean;
  /** Normalized class only — never a raw upstream body. */
  error?: string;
}
