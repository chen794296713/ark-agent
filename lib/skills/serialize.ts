/**
 * Row → DTO. The only place a `skills` or `agent_skills` row becomes JSON.
 *
 * These live here rather than in `lib/serializers.ts` because that file belongs
 * to the integrator; it re-exports whichever of them the shared module carries.
 *
 * Two rules govern every function below, and both are security rules:
 *
 *  1. **Allow-list, never spread.** Nothing returns `{ ...row }`. `skills` holds
 *     `scanner_verdict` — a raw third-party envelope of unbounded shape — plus
 *     `review_note` and `reviewed_by_id`, which are staff-only. A spread ships
 *     all three the day someone adds a column, and the reviewer of that commit
 *     is looking at the migration, not at this file.
 *  2. **Third-party text is DATA.** `name`, `summary`, `description`,
 *     `publisher_name`, `block_reason` and every `risk_signals[].detail` came
 *     from a publisher we do not control. They are sanitized on ingest and
 *     sanitized AGAIN here, because rows predating a sanitizer change exist and
 *     because the drawer renders `detail` verbatim. React escapes text nodes, so
 *     this is not the XSS control — it is the control on zero-width characters,
 *     bidi overrides and 40KB of smuggled prose.
 *
 * Client-safe: pure mapping over plain objects, no Drizzle import.
 */
import type { Harness } from "@/lib/harness";
import { compatFor } from "./harness";
import { sanitizeSkillText, sanitizeTag } from "./safety";
import {
  isSkillCategory,
  type AgentSkillDTO,
  type AgentSkillOrigin,
  type AgentSkillState,
  type HarnessCompatMap,
  type RiskSignal,
  type ScannerSummary,
  type SkillCardDTO,
  type SkillDTO,
  type SkillFormat,
  type SkillInstall,
  type SkillPermissions,
  type SkillRequirements,
  type SkillRisk,
  type SkillStatus,
  type SkillVersionRef,
} from "./types";

/** The row shape the list query selects. Structural, so Drizzle stays out of the browser. */
export interface SkillRowLike {
  id: string;
  publicId: string;
  slug: string;
  ownerHandle: string;
  name: string;
  summary: string;
  description?: string;
  category: string;
  format: SkillFormat;
  tags: unknown;
  harnesses: unknown;
  harnessCompat: unknown;
  riskLevel: SkillRisk;
  riskScore?: number;
  riskSignals?: unknown;
  riskScoredAt?: Date | string | null;
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
  sourceUrl?: string;
  homepageUrl?: string | null;
  latestVersion: string;
  upstreamUpdatedAt: Date | string | null;
  requirements?: unknown;
  permissions?: unknown;
  install?: unknown;
  provenance?: string;
  artifactSha256?: string | null;
  scannerVerdict?: unknown;
  knownVersions?: unknown;
  deprecationNote?: string | null;
  deprecatedAt?: Date | string | null;
  status: SkillStatus;
  reviewNote?: string | null;
}

const iso = (d: Date | string | null | undefined): string | null =>
  d === null || d === undefined ? null : d instanceof Date ? d.toISOString() : String(d);

/** A `timestamptz` that is `NOT NULL` in the schema still arrives typed nullable. */
const isoRequired = (d: Date | string | null | undefined): string => iso(d) ?? new Date(0).toISOString();

function strings(v: unknown, cap: number, each: (s: string) => string): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const clean = each(item);
    if (clean) out.push(clean);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * `harnesses` is a denormalized jsonb array written by sync. It is read back as
 * `unknown` and re-derived from `harness_compat` rather than trusted, because
 * the two are written by the same function and a drift between them is exactly
 * the "green tick nobody earned" that `basis` exists to prevent. The compat map
 * is the record of WHY; the array is a facet index.
 */
function compatMap(v: unknown): HarnessCompatMap {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const src = v as Record<string, unknown>;
  const out: HarnessCompatMap = {};
  for (const h of ["openclaw", "hermes", "codex", "deepseek"] as const) {
    // `Object.hasOwn`, not a bare read: this object came out of jsonb and an
    // inherited `constructor` would otherwise answer the lookup.
    if (!Object.hasOwn(src, h)) continue;
    const e = src[h];
    if (!e || typeof e !== "object") continue;
    const rec = e as Record<string, unknown>;
    const basis = rec.basis;
    out[h] = {
      supported: rec.supported === true,
      basis:
        basis === "verified" || basis === "declared" || basis === "inferred" ? basis : "unknown",
      ...(typeof rec.note === "string" && rec.note
        ? { note: sanitizeSkillText(rec.note, 160) }
        : {}),
    };
  }
  return out;
}

function riskSignals(v: unknown): RiskSignal[] {
  if (!Array.isArray(v)) return [];
  const out: RiskSignal[] = [];
  for (const item of v.slice(0, 40)) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.code !== "string") continue;
    out.push({
      // The code is an i18n key on the drawer, so it is reduced to a key-shaped
      // alphabet. A signal whose code arrived mangled renders as itself, never
      // as a missing translation that falls through to raw upstream text.
      code: s.code.replace(/[^a-z0-9_]+/gi, "_").slice(0, 60),
      delta: typeof s.delta === "number" && Number.isFinite(s.delta) ? s.delta : 0,
      ...(typeof s.detail === "string" && s.detail
        ? { detail: sanitizeSkillText(s.detail, 200) }
        : {}),
    });
  }
  return out;
}

function versionRefs(v: unknown): SkillVersionRef[] {
  if (!Array.isArray(v)) return [];
  const out: SkillVersionRef[] = [];
  for (const item of v.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.version !== "string") continue;
    const lvl = r.riskLevel;
    out.push({
      version: sanitizeSkillText(r.version, 60),
      publishedAt: typeof r.publishedAt === "string" ? r.publishedAt : null,
      // A hex digest or nothing. A "sha256" the UI renders is a claim about the
      // artifact; a 4KB string in that slot is a publisher writing in our voice.
      sha256: typeof r.sha256 === "string" && /^[0-9a-f]{64}$/i.test(r.sha256) ? r.sha256 : null,
      riskLevel: lvl === "low" || lvl === "medium" || lvl === "high" ? lvl : null,
    });
  }
  return out;
}

/**
 * The five fields we act on, never the raw envelope.
 *
 * `scanner_verdict` is a third-party document of unbounded shape and the schema
 * says NEVER SERIALIZED. Mapping it — rather than passing it through — is the
 * difference between rendering data and rendering someone else's payload.
 */
export function scannerSummary(verdict: unknown): ScannerSummary | null {
  if (!verdict || typeof verdict !== "object" || Array.isArray(verdict)) return null;
  const v = verdict as Record<string, unknown>;
  const num = (x: unknown): number | null =>
    typeof x === "number" && Number.isFinite(x) ? Math.trunc(x) : null;
  const oneOf = (x: unknown, allowed: readonly string[]): string | null =>
    typeof x === "string" && allowed.includes(x) ? x : null;
  const vt = v.virusTotal && typeof v.virusTotal === "object" ? (v.virusTotal as Record<string, unknown>) : {};
  return {
    scanner: v.scanner === "clawhub" ? "clawhub" : null,
    decision: oneOf(v.decision, ["pass", "review", "warn", "fail"]),
    status: oneOf(v.status, ["clean", "warn", "malicious"]),
    virusTotalFlagged: num(vt.malicious ?? v.virusTotalMalicious),
    virusTotalTotal: num(vt.total ?? v.virusTotalTotal),
    scannedAt: typeof v.scannedAt === "string" ? v.scannedAt.slice(0, 40) : null,
    confidence: num(v.confidence),
  };
}

function requirements(v: unknown): SkillRequirements {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const r = v as Record<string, unknown>;
  const list = (x: unknown) => strings(x, 24, (s) => sanitizeSkillText(s, 80));
  return {
    bins: list(r.bins),
    env: list(r.env),
    config: list(r.config),
    os: list(r.os),
  };
}

function permissions(v: unknown): SkillPermissions {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const p = v as Record<string, unknown>;
  const TOOLS = ["shell", "files", "browser", "docker", "code"] as const;
  const NET = ["none", "public-read", "declared-hosts", "arbitrary"] as const;
  const FS = ["none", "workspace-read", "workspace-write", "host-read", "host-write"] as const;
  const net = typeof p.network === "string" && (NET as readonly string[]).includes(p.network) ? p.network : undefined;
  const fs = typeof p.filesystem === "string" && (FS as readonly string[]).includes(p.filesystem) ? p.filesystem : undefined;
  return {
    tools: strings(p.tools, 5, (s) => ((TOOLS as readonly string[]).includes(s) ? s : "")) as SkillPermissions["tools"],
    ...(net ? { network: net as SkillPermissions["network"] } : {}),
    hosts: strings(p.hosts, 24, (s) => sanitizeSkillText(s, 120)),
    ...(fs ? { filesystem: fs as SkillPermissions["filesystem"] } : {}),
    credentials: strings(p.credentials, 12, (s) => sanitizeSkillText(s, 120)),
    irreversible: p.irreversible === true,
  };
}

/**
 * `install` reaches the browser because the drawer shows how the runtime will
 * obtain the skill — but only the discriminant and the fields that describe the
 * fetch. `env` and `headerEnv` are variable NAMES; the values live in the
 * runtime's store and are not ours to hold, let alone to serialize.
 */
function install(v: unknown): SkillInstall {
  const fallback: SkillInstall = { mode: "registry", registry: "clawhub", ref: "", version: "" };
  if (!v || typeof v !== "object" || Array.isArray(v)) return fallback;
  const i = v as Record<string, unknown>;
  const str = (x: unknown, cap: number) => (typeof x === "string" ? sanitizeSkillText(x, cap) : "");
  switch (i.mode) {
    case "git":
      return { mode: "git", repo: str(i.repo, 300), ref: str(i.ref, 120), subdir: str(i.subdir, 200) };
    case "inline":
      return {
        mode: "inline",
        sha256: typeof i.sha256 === "string" && /^[0-9a-f]{64}$/i.test(i.sha256) ? i.sha256 : "",
        bytes: typeof i.bytes === "number" && Number.isFinite(i.bytes) ? Math.max(0, Math.trunc(i.bytes)) : 0,
      };
    case "mcp_stdio":
      return {
        mode: "mcp_stdio",
        command: str(i.command, 200),
        args: strings(i.args, 24, (s) => sanitizeSkillText(s, 200)),
        env: strings(i.env, 24, (s) => sanitizeSkillText(s, 80)),
      };
    case "mcp_http":
      // `safeUrl`, not `str`. This one field is an actual URL that the drawer
      // shows and that a future "open the server" affordance would put in an
      // href; `sanitizeSkillText` strips markup but keeps the scheme, so
      // `javascript:fetch(...)` survived it intact. An unusable scheme becomes
      // the empty string and the UI draws nothing rather than a live link.
      return {
        mode: "mcp_http",
        url: safeUrl(typeof i.url === "string" ? i.url : null) ?? "",
        headerEnv: strings(i.headerEnv, 12, (s) => sanitizeSkillText(s, 80)),
      };
    default:
      return { mode: "registry", registry: "clawhub", ref: str(i.ref, 200), version: str(i.version, 60) };
  }
}

export interface AttachmentBadgeRow {
  id: string;
  state: AgentSkillState;
  version: string;
  enabled: boolean;
}

export function serializeSkillCard(row: SkillRowLike, attachment?: AttachmentBadgeRow | null): SkillCardDTO {
  const compat = compatMap(row.harnessCompat);
  return {
    publicId: row.publicId,
    slug: row.slug,
    ownerHandle: row.ownerHandle,
    name: sanitizeSkillText(row.name, 120),
    summary: sanitizeSkillText(row.summary, 300),
    // A category outside the 16 cannot reach the browser: every consumer keys a
    // label map on it, and `agent-meta` misspelled once in a migration would
    // otherwise render as a blank chip on every card from that source.
    category: isSkillCategory(row.category) ? row.category : "coding-dev-tools",
    format: row.format,
    tags: strings(row.tags, 12, sanitizeTag),
    // Re-derived, not read: see compatMap.
    harnesses: (["openclaw", "hermes", "codex", "deepseek"] as const).filter(
      (h) => compatFor(compat, h).supported,
    ) as Harness[],
    harnessCompat: compat,
    riskLevel: row.riskLevel,
    license: sanitizeTag(row.license).toUpperCase() || "UNKNOWN",
    licenseVerified: row.licenseVerified,
    verified: row.verified,
    popularity: row.popularity,
    stars: row.stars,
    downloads: row.downloads,
    sourceId: row.sourceId,
    publisherName: sanitizeSkillText(row.publisherName, 120),
    publisherVerified: row.publisherVerified,
    attributionUrl: safeUrl(row.attributionUrl),
    latestVersion: sanitizeSkillText(row.latestVersion, 60),
    upstreamUpdatedAt: iso(row.upstreamUpdatedAt),
    ...(attachment === undefined
      ? {}
      : { attachment: attachment ? { ...attachment, version: sanitizeSkillText(attachment.version, 60) } : null }),
  };
}

/**
 * A link we are willing to put in an `href`.
 *
 * `attribution_url`, `source_url` and `homepage_url` are `text` columns written
 * by the sync pipeline from upstream fields. `javascript:` and `data:` are the
 * two schemes that turn a link into code, and an anchor is the one place React's
 * text escaping does not help. Anything that is not http(s) becomes null and the
 * UI draws no link rather than a link to nowhere.
 */
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

/**
 * The detail payload. `staff` gates the two fields the schema marks curation-only.
 *
 * `scanner_verdict` never appears whatever `staff` says: it is mapped to five
 * fields or it is null.
 */
export function serializeSkill(row: SkillRowLike, opts: { staff?: boolean; attachment?: AttachmentBadgeRow | null } = {}): SkillDTO {
  return {
    ...serializeSkillCard(row, opts.attachment),
    description: sanitizeSkillText(row.description ?? "", 4000),
    sourceUrl: safeUrl(row.sourceUrl) ?? "",
    homepageUrl: safeUrl(row.homepageUrl),
    requirements: requirements(row.requirements),
    permissions: permissions(row.permissions),
    install: install(row.install),
    riskScore: typeof row.riskScore === "number" ? row.riskScore : 0,
    riskSignals: riskSignals(row.riskSignals),
    riskScoredAt: iso(row.riskScoredAt),
    provenance: sanitizeTag(row.provenance ?? "unavailable") || "unavailable",
    artifactSha256:
      typeof row.artifactSha256 === "string" && /^[0-9a-f]{64}$/i.test(row.artifactSha256)
        ? row.artifactSha256
        : null,
    scannerSummary: scannerSummary(row.scannerVerdict),
    knownVersions: versionRefs(row.knownVersions),
    deprecationNote: row.deprecationNote ? sanitizeSkillText(row.deprecationNote, 200) : null,
    deprecatedAt: iso(row.deprecatedAt),
    // `deprecated` is a PUBLICLY visible state — that is the whole point of
    // deprecating a row rather than deleting it, and the drawer's "deprecated
    // upstream" notice is meant to key on it. Collapsing it to `published` for
    // every non-staff caller made the field say the opposite of the row. Only
    // `draft` and `blocked` are masked, and a non-staff caller never receives
    // one of those anyway — the mask is for a future admin-shaped code path
    // that forgets to pass `staff`.
    status: opts.staff || row.status === "deprecated" ? row.status : "published",
    reviewNote: opts.staff && row.reviewNote ? sanitizeSkillText(row.reviewNote, 1000) : null,
  };
}

export interface AgentSkillRowLike {
  id: string;
  version: string;
  harness: Harness;
  compatAsserted: boolean;
  enabled: boolean;
  state: AgentSkillState;
  installError: string | null;
  installSource: string;
  riskLevelAtAttach: SkillRisk;
  riskAcknowledged: boolean;
  origin: AgentSkillOrigin;
  createdAt: Date | string;
  installedAt: Date | string | null;
  lastVerifiedAt: Date | string | null;
}

const BAND_ORDER: Record<SkillRisk, number> = { low: 0, medium: 1, high: 2 };

/**
 * One attachment. `agentHarness` is the agent's CURRENT harness, so the AST10
 * drift flag is computed here rather than left for four call sites to forget.
 *
 * `config` is deliberately absent from the DTO. The column is supposed to hold
 * only non-secret values, but "supposed to" is an invariant enforced on write,
 * and a row written before that check existed is exactly the row whose config
 * should not be echoed back over the wire.
 */
export function serializeAgentSkill(
  row: AgentSkillRowLike,
  skill: SkillRowLike,
  agentHarness: Harness,
): AgentSkillDTO {
  return {
    id: row.id,
    skill: serializeSkillCard(skill),
    version: sanitizeSkillText(row.version, 60),
    harness: row.harness,
    compatAsserted: row.compatAsserted,
    enabled: row.enabled,
    state: row.state,
    // The runtime writes this. It is a remote system's error string, so it is
    // bounded and stripped like any other third-party text.
    installError: row.installError ? sanitizeSkillText(row.installError, 300) : null,
    installSource: row.installSource === "mock" ? "mock" : "live",
    riskLevelAtAttach: row.riskLevelAtAttach,
    riskAcknowledged: row.riskAcknowledged,
    riskDrift: BAND_ORDER[skill.riskLevel] > BAND_ORDER[row.riskLevelAtAttach],
    harnessDrift: row.harness !== agentHarness,
    origin: row.origin,
    createdAt: isoRequired(row.createdAt),
    installedAt: iso(row.installedAt),
    lastVerifiedAt: iso(row.lastVerifiedAt),
  };
}
