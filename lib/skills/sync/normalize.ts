/**
 * Upstream row → catalogue row. Pure, so it is testable without a database and
 * without a network.
 *
 * The invariants this stage owns:
 *
 *  - every third-party string passes `sanitizeSkillText` / `sanitizeTag` BEFORE
 *    it is stored, and detection (`scoreSkill`, which calls `detectInjection`)
 *    runs on the RAW bytes, not on the sanitized ones — stripping the evidence
 *    and then looking for it is how a scanner is fooled;
 *  - `attributionUrl` is built from OUR template, interpolated per segment, and
 *    re-parsed through `safeUrl`. It is rendered as an `href`; the template
 *    being ours does not make the values in it ours;
 *  - the row is `draft` unless the source auto-publishes AND the licence
 *    resolves to an OSI id. ClawHavoc's publishers were legitimate accounts, so
 *    a reputation threshold would have published all of them;
 *  - `category`, `status`, `verified` and `popularity` are curation. They are
 *    returned for an INSERT and are dropped by the caller on an UPDATE, so a
 *    crawler can never republish what a human unpublished.
 */
import type { Harness } from "@/lib/harness";
import { deriveHarnessCompat, supportedHarnesses } from "../harness";
import { mintPublicId, slugifySegment } from "../public-id";
import { isRedistributable, sanitizeSkillText, sanitizeTag, scoreSkill } from "../safety";
import { safeUrl } from "../serialize";
import { classifyCategory } from "../taxonomy";
import type {
  HarnessCompatMap,
  SkillCategory,
  SkillFormat,
  SkillInstall,
  SkillPermissions,
  SkillRequirements,
  SkillRisk,
  RiskSignal,
} from "../types";

/** What every adapter reduces its own feed to. One shape, one normalizer. */
export interface UpstreamSkill {
  ownerHandle: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  publisherName: string;
  publisherVerified: boolean;
  topics: string[];
  format: SkillFormat;
  sourceUrl: string;
  homepageUrl: string | null;
  license: string;
  version: string;
  stars: number;
  downloads: number;
  upstreamUpdatedAt: Date | null;
  requirements: SkillRequirements;
  permissions: SkillPermissions;
  install: SkillInstall;
  declaredCompat?: HarnessCompatMap;
  provenance: string;
  /** Raw upstream body when one was fetched. Scored, never stored, never prompted. */
  body?: string | null;
  scanner?: {
    decision?: string | null;
    status?: string | null;
    virusTotalMalicious?: number | null;
  } | null;
}

export interface SourceLike {
  id: string;
  trust: string;
  autoPublish: boolean;
  attributionTemplate: string | null;
}

export interface NormalizedSkill {
  publicId: string;
  sourceId: string;
  ownerHandle: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  publisherName: string;
  publisherVerified: boolean;
  category: SkillCategory;
  format: SkillFormat;
  tags: string[];
  harnessCompat: HarnessCompatMap;
  harnesses: Harness[];
  requirements: SkillRequirements;
  permissions: SkillPermissions;
  install: SkillInstall;
  redistributable: boolean;
  license: string;
  riskLevel: SkillRisk;
  riskScore: number;
  riskSignals: RiskSignal[];
  blocked: boolean;
  blockReason: string | null;
  status: "draft" | "published" | "blocked";
  provenance: string;
  sourceUrl: string;
  attributionUrl: string | null;
  homepageUrl: string | null;
  stars: number;
  downloads: number;
  upstreamUpdatedAt: Date | null;
  latestVersion: string;
}

/**
 * `{owner}` / `{slug}` in the source's own template, encoded per segment and
 * re-parsed. `safeUrl` is the gate that keeps a `javascript:` out of an href.
 */
export function attributionUrlFor(template: string | null, owner: string, slug: string): string | null {
  if (!template) return null;
  const filled = template
    .replace(/\{owner\}/g, encodeURIComponent(owner))
    .replace(/\{slug\}/g, encodeURIComponent(slug));
  return safeUrl(filled);
}

/** A non-negative integer, whatever the upstream sent. NaN is 0, not NaN. */
const nat = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), 2_000_000_000) : 0;

export function normalizeSkill(source: SourceLike, up: UpstreamSkill, now = new Date()): NormalizedSkill {
  const ownerHandle = sanitizeTag(up.ownerHandle).slice(0, 80);
  const slug = slugifySegment(up.slug).slice(0, 120);
  const tags = Array.from(new Set(up.topics.map(sanitizeTag).filter(Boolean))).slice(0, 20);
  const name = sanitizeSkillText(up.name, 120) || slug;
  const summary = sanitizeSkillText(up.summary, 300);
  const license = sanitizeTag(up.license).toUpperCase() || "UNKNOWN";

  const compat = deriveHarnessCompat(up.requirements, up.format, up.declaredCompat);

  // Scored on the RAW body, and on the raw name/summary too: an injection
  // directive hidden in a title is still a directive.
  const score = scoreSkill({
    permissions: up.permissions,
    requirements: up.requirements,
    tags,
    license,
    format: up.format,
    install: up.install,
    publisherVerified: up.publisherVerified,
    ownerHandle,
    slug,
    stars: nat(up.stars),
    downloads: nat(up.downloads),
    upstreamUpdatedAt: up.upstreamUpdatedAt,
    provenance: up.provenance,
    scanner: up.scanner ?? null,
    body: [up.name, up.summary, up.description, up.body ?? ""].join("\n"),
    now,
  });

  // Auto-publish only where the source is a vendor AND the licence resolved.
  // Everything else waits for a person; §4.5 is explicit that a reputation
  // threshold would have published the whole ClawHavoc campaign.
  const status: NormalizedSkill["status"] = score.blocked
    ? "blocked"
    : source.autoPublish && isRedistributable(license)
      ? "published"
      : "draft";

  return {
    publicId: mintPublicId(source.id, ownerHandle, slug),
    sourceId: source.id,
    ownerHandle,
    slug,
    name,
    summary,
    description: sanitizeSkillText(up.description, 8000),
    publisherName: sanitizeSkillText(up.publisherName, 120),
    publisherVerified: up.publisherVerified,
    category: classifyCategory([...tags, name, summary]),
    format: up.format,
    tags,
    harnessCompat: compat,
    harnesses: supportedHarnesses(compat),
    requirements: up.requirements,
    permissions: up.permissions,
    install: up.install,
    // The legal gate is on shipping the bytes ourselves. A registry or git
    // install is the runtime fetching from the origin under the origin's terms.
    redistributable: isRedistributable(license),
    license,
    riskLevel: score.riskLevel,
    riskScore: score.riskScore,
    riskSignals: score.riskSignals,
    blocked: score.blocked,
    blockReason: score.blockReason,
    status,
    provenance: sanitizeTag(up.provenance) || "unavailable",
    sourceUrl: safeUrl(up.sourceUrl) ?? "",
    attributionUrl: attributionUrlFor(source.attributionTemplate, ownerHandle, slug),
    homepageUrl: safeUrl(up.homepageUrl),
    stars: nat(up.stars),
    downloads: nat(up.downloads),
    upstreamUpdatedAt: up.upstreamUpdatedAt,
    latestVersion: sanitizeSkillText(up.version, 60) || "0.0.0",
  };
}

/**
 * A licence only ever IMPROVES. `UNKNOWN`, `NONE` and `NOASSERTION` never
 * overwrite a resolved SPDX id that a human or an earlier, better-informed run
 * already established — a re-crawl of a listing endpoint that returns no licence
 * would otherwise quietly un-resolve the whole catalogue.
 */
export function betterLicense(existing: string, incoming: string): string {
  const unresolved = (l: string) => l === "" || l === "UNKNOWN" || l === "NONE" || l === "NOASSERTION";
  if (unresolved(incoming)) return existing;
  if (unresolved(existing)) return incoming;
  return existing;
}
