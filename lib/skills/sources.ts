/**
 * The eight `skill_sources` rows — the fetch allowlist, and the reason
 * `POST /api/skills/sync` currently 404s for every id.
 *
 * `runSync` starts with `SELECT … FROM skill_sources WHERE id = $1` and returns
 * `unknown_source` when the table is empty, which it is: `lib/db/seed.ts` never
 * writes this table. Until these rows exist there is no id an admin can pass and
 * no source a cron can crawl, so the whole discovery pipeline is unreachable
 * code. `scripts/seed-skills.ts` loads them.
 *
 * Three of the columns are load-bearing rather than descriptive:
 *
 *  - **`apiBaseUrl`** is where `runSync` gets its base. The fetcher's host
 *    allowlist (`lib/skills/sync/fetch.ts`) admits exactly `clawhub.ai`,
 *    `api.github.com` and `registry.modelcontextprotocol.io`, so every base here
 *    must resolve to one of those. A source with no API is `null` and is simply
 *    never crawled — disabling a source is a DB update, not a deploy.
 *  - **`autoPublish`** decides whether an ingested row lands `published` or
 *    `draft`, and it is true for `official_vendor` only. Even then
 *    `normalizeSkill` publishes only when the licence resolves to an OSI id:
 *    ClawHavoc's publishers were legitimate registered accounts, so a
 *    reputation threshold alone would have auto-published the entire campaign.
 *  - **`attributionTemplate`** is a licence condition, not decoration. ClawHub
 *    permits third-party directory reuse provided we cache, honour 429, and link
 *    back to `https://clawhub.ai/<owner>/skills/<slug>` without implying
 *    endorsement. It is seeded for ClawHub alone; the GitHub-backed sources link
 *    back through `sourceUrl` and need no template.
 *
 * `rateLimitPerMin` is our self-imposed ceiling and is always well under the
 * documented one, so a bug on our side cannot get the platform IP-banned.
 * ClawHub documents 3,000/min read per IP and we seed 600 — a fifth. The MCP
 * registry publishes no figure at all (SKILL_ECOSYSTEM §F.5), so it keeps the
 * conservative 60 default along with everything else.
 *
 * Client-safe: pure data. The admin sync panel renders these ids and labels.
 */

/** `skill_source_kind`. Mirrors `skillSourceKindEnum` in lib/db/schema.ts. */
export type SkillSourceKind = "registry" | "git_repo" | "curated_list" | "manual";

/**
 * `skill_source_trust`. Feeds the −3 "publisher is the service's own vendor"
 * modifier and decides whether a source may ever auto-publish.
 */
export type SkillSourceTrust = "official_vendor" | "verified_registry" | "community" | "unreviewed";

export interface SeedSkillSource {
  /** Stable human-readable id. It appears in every seed literal and in `skills.public_id`. */
  id: string;
  kind: SkillSourceKind;
  trust: SkillSourceTrust;
  name: string;
  homepageUrl: string;
  /** Null for kinds we do not crawl (`manual`) and lists with no API (`curated_list`). */
  apiBaseUrl: string | null;
  /** `{owner}` / `{slug}` template for the mandatory link-back. ClawHub only. */
  attributionTemplate: string | null;
  enabled: boolean;
  /** Only ever true for `official_vendor`. Everything else lands in `draft`. */
  autoPublish: boolean;
  rateLimitPerMin: number;
  /** Why this source is on the allowlist at all — shown in the admin sync panel. */
  note: string;
}

export const SEED_SKILL_SOURCES: SeedSkillSource[] = [
  {
    id: "anthropic-skills",
    kind: "git_repo",
    trust: "official_vendor",
    name: "Anthropic Agent Skills",
    homepageUrl: "https://github.com/anthropics/skills",
    apiBaseUrl: "https://api.github.com/repos/anthropics/skills",
    attributionTemplate: null,
    enabled: true,
    autoPublish: true,
    rateLimitPerMin: 60,
    note: "The reference implementations of the agentskills.io format. Repo licence resolves to a mix: most skills are source-available and the four document skills declare Proprietary, so nothing here is ever materialized inline.",
  },
  {
    id: "openclaw-skills",
    kind: "git_repo",
    trust: "official_vendor",
    name: "OpenClaw First-Party Skills",
    homepageUrl: "https://github.com/openclaw/agent-skills",
    apiBaseUrl: "https://api.github.com/repos/openclaw/agent-skills",
    attributionTemplate: null,
    enabled: true,
    autoPublish: true,
    rateLimitPerMin: 60,
    note: "MIT throughout, and the only catalogued bodies we would have the right to mirror.",
  },
  {
    id: "clawhub",
    kind: "registry",
    trust: "verified_registry",
    name: "ClawHub",
    homepageUrl: "https://clawhub.ai",
    apiBaseUrl: "https://clawhub.ai/api/v1",
    attributionTemplate: "https://clawhub.ai/{owner}/skills/{slug}",
    enabled: true,
    autoPublish: false,
    rateLimitPerMin: 600,
    note: "The community registry, and the only source that returns machine-readable safety data: /verify carries ClawScan, SkillSpector and VirusTotal verdicts with no auth. It returns no licence on any listing endpoint, which is why every seeded ClawHub row is licence-UNKNOWN.",
  },
  {
    id: "mcp-reference",
    kind: "git_repo",
    trust: "verified_registry",
    name: "MCP Reference Servers",
    homepageUrl: "https://github.com/modelcontextprotocol/servers",
    apiBaseUrl: "https://api.github.com/repos/modelcontextprotocol/servers",
    attributionTemplate: null,
    enabled: true,
    autoPublish: false,
    rateLimitPerMin: 60,
    note: "The maintainers state these are educational examples, not production-ready, so the source does not auto-publish. The thirteen servers moved to modelcontextprotocol/servers-archived (last push 2025-05-28) are never crawled as live.",
  },
  {
    id: "mcp-registry",
    kind: "registry",
    trust: "verified_registry",
    name: "Official MCP Registry",
    homepageUrl: "https://registry.modelcontextprotocol.io",
    apiBaseUrl: "https://registry.modelcontextprotocol.io/v0",
    attributionTemplate: null,
    enabled: true,
    autoPublish: false,
    rateLimitPerMin: 60,
    note: "Cursor-paginated and unauthenticated. The raw feed returns every historical version of every server, so the crawler keeps only status == active and isLatest == true. No seeded rows: this source exists to be crawled, not transcribed.",
  },
  {
    id: "github",
    kind: "git_repo",
    trust: "community",
    name: "GitHub",
    homepageUrl: "https://github.com",
    apiBaseUrl: "https://api.github.com",
    attributionTemplate: null,
    enabled: true,
    autoPublish: false,
    rateLimitPerMin: 60,
    note: "Topic discovery plus the weekly stars/pushed_at/licence enrichment. Degrades without GITHUB_TOKEN: 60 req/h anonymous is enough to enrich the catalogued repos but not to run topic search, so discovery is skipped with a logged notice rather than failing the run.",
  },
  {
    id: "awesome-lists",
    kind: "curated_list",
    trust: "unreviewed",
    name: "Curated Awesome Lists",
    homepageUrl: "https://github.com/VoltAgent/awesome-openclaw-skills",
    apiBaseUrl: null,
    attributionTemplate: null,
    enabled: false,
    autoPublish: false,
    rateLimitPerMin: 60,
    note: "Markdown with no API, parsed for candidate slugs only — never a star count and never a risk verdict. Four list-claimed popularity figures were checked against the primary APIs and all four were wrong. Ships disabled: candidates land as draft rows with popularity 0 and no upstream facts, and a human promotes them.",
  },
  {
    id: "arkagent",
    kind: "manual",
    trust: "official_vendor",
    name: "ArkAgent First-Party",
    homepageUrl: "https://github.com/arkagent/skills",
    apiBaseUrl: null,
    attributionTemplate: null,
    enabled: true,
    autoPublish: true,
    rateLimitPerMin: 60,
    note: "Skills authored in-house. Never crawled — there is nothing upstream to crawl — so rows here change only when this repository does.",
  },
];

export const SEED_SKILL_SOURCE_IDS: readonly string[] = SEED_SKILL_SOURCES.map((s) => s.id);

/**
 * Hosts the fetcher will admit, derived from the rows rather than restated.
 *
 * `lib/skills/sync/fetch.ts` owns the enforcement copy; this exists so a test
 * can assert the two lists agree, because a source whose `apiBaseUrl` points at
 * a host the fetcher refuses is a row that can only ever fail.
 */
export const SEED_SOURCE_HOSTS: readonly string[] = Array.from(
  new Set(
    SEED_SKILL_SOURCES.map((s) => (s.apiBaseUrl ? new URL(s.apiBaseUrl).hostname : null)).filter(
      (h): h is string => h !== null,
    ),
  ),
);
