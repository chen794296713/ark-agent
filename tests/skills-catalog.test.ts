/**
 * The catalogue's identity layer: the taxonomy, the public-id mint, and the
 * harness-compatibility derivation.
 *
 * Three of these assert things the source only claimed in a comment, and each
 * claim was wrong when it was checked:
 *
 *  - `taxonomy.ts` imported a `SKILL_CATEGORIES` that `types.ts` does not
 *    export, so the module did not compile at all.
 *  - `mintPublicIdWithDigest` — the collision retry — returned a string
 *    byte-identical to `mintPublicId`'s for any identity long enough to trip
 *    the 160-char truncation, so the retry re-hit the unique violation it
 *    exists to escape.
 *  - the host-capability prefix list spelled the fourth harness `deepcode.`,
 *    so a `deepseek.*` requirement was read as ordinary skill config and every
 *    harness scored compatible with it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { HARNESS_IDS } from "../lib/harness";
import {
  agentSkillOriginEnum,
  agentSkillStateEnum,
  skillCategoryEnum,
  skillFormatEnum,
  skillRiskEnum,
  skillStatusEnum,
} from "../lib/db/schema";
import {
  AGENT_SKILL_ORIGIN_IDS,
  AGENT_SKILL_STATE_IDS,
  CAPABILITY_TIERS,
  CAPABILITY_TIER_CODES,
  SKILL_CATEGORY_IDS,
  SKILL_FORMAT_IDS,
  SKILL_RISK_IDS,
  SKILL_STATUS_IDS,
  isSkillCategory,
} from "../lib/skills/types";
import { CATEGORY_LABELS, categoryLabel, classifyCategory } from "../lib/skills/taxonomy";
import { mintPublicId, mintPublicIdWithDigest, slugifySegment } from "../lib/skills/public-id";
import {
  compatFor,
  compatFromList,
  deriveHarnessCompat,
  isHostCapability,
  supportedHarnesses,
} from "../lib/skills/harness";
import type { Lang } from "../lib/types";
import { SEED_SKILLS, SEED_SKILLS_BY_PUBLIC_ID, SEED_TOTALS } from "../lib/skills/catalog";
import {
  SEED_SKILL_SOURCES,
  SEED_SKILL_SOURCE_IDS,
  SEED_SOURCE_HOSTS,
} from "../lib/skills/sources";
import {
  HIGH_FLOOR_TAGS,
  capabilityTier,
  isRedistributable,
  maxBand,
  sanitizeTag,
  scoreSkill,
} from "../lib/skills/safety";
import { ALLOWED_HOSTS } from "../lib/skills/sync/fetch";
import { attributionUrlFor } from "../lib/skills/sync/normalize";
import { syncSkillsSchema } from "../lib/skills/validation";

const LANGS: Lang[] = ["en", "zh", "zht", "ja"];

// ---------------------------------------------------------------------------
// The lists and the pgEnums are one list
// ---------------------------------------------------------------------------

test("every skills union matches the pgEnum it is stored in, value for value and in order", () => {
  // Postgres can append an enum value but never reorder one, so order is a
  // schema fact and not a style choice.
  assert.deepEqual([...skillCategoryEnum.enumValues], [...SKILL_CATEGORY_IDS]);
  assert.deepEqual([...skillFormatEnum.enumValues], [...SKILL_FORMAT_IDS]);
  assert.deepEqual([...skillRiskEnum.enumValues], [...SKILL_RISK_IDS]);
  assert.deepEqual([...skillStatusEnum.enumValues], [...SKILL_STATUS_IDS]);
  assert.deepEqual([...agentSkillStateEnum.enumValues], [...AGENT_SKILL_STATE_IDS]);
  assert.deepEqual([...agentSkillOriginEnum.enumValues], [...AGENT_SKILL_ORIGIN_IDS]);
});

test("isSkillCategory narrows exactly the 16", () => {
  for (const c of SKILL_CATEGORY_IDS) assert.equal(isSkillCategory(c), true);
  assert.equal(isSkillCategory("agent-metal"), false);
  assert.equal(isSkillCategory("__proto__"), false);
});

test("every capability tier has a code and no tier was invented", () => {
  for (const t of CAPABILITY_TIERS) assert.ok(CAPABILITY_TIER_CODES[t]);
  assert.equal(Object.keys(CAPABILITY_TIER_CODES).length, CAPABILITY_TIERS.length);
  // The gaps at 3, 5, 7 and 9 are deliberate — modifiers move a skill inside a
  // band without hopping one. A filled-in gap is a silently rebanded catalogue.
  assert.deepEqual([...CAPABILITY_TIERS], [0, 1, 2, 4, 6, 8, 10]);
});

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

test("every category is labelled in all four languages", () => {
  for (const cat of SKILL_CATEGORY_IDS) {
    for (const lang of LANGS) {
      const label = CATEGORY_LABELS[cat][lang];
      assert.ok(label && label.trim().length > 0, `${cat}.${lang} is empty`);
    }
  }
});

test("the three CJK labels are written in CJK, not left as English", () => {
  const cjk = /[぀-ヿ㐀-鿿]/;
  for (const cat of SKILL_CATEGORY_IDS) {
    for (const lang of ["zh", "zht", "ja"] as const) {
      const label = CATEGORY_LABELS[cat][lang];
      assert.ok(cjk.test(label), `${cat}.${lang} = ${JSON.stringify(label)} carries no CJK`);
      assert.notEqual(label, CATEGORY_LABELS[cat].en, `${cat}.${lang} is the English string`);
    }
  }
});

test("categoryLabel falls back to the raw id rather than throwing on an unknown category", () => {
  assert.equal(categoryLabel("media", "ja"), CATEGORY_LABELS.media.ja);
  assert.equal(categoryLabel("not-a-category", "en"), "not-a-category");
});

test("the classifier respects word boundaries", () => {
  // `git` must not match inside `digit`, which is why the fallback is what a
  // bare arithmetic string classifies as.
  assert.equal(classifyCategory(["digital audio digit"]), "media");
  assert.equal(classifyCategory(["github-mcp-server", "pull-request"]), "version-control");
});

test("the classifier is deterministic, needs no key, and always returns a real category", () => {
  for (const signals of [[], ["zzz"], ["Slack Notifier", "slack", "message"], ["stripe invoice"]]) {
    const got = classifyCategory(signals);
    assert.equal(isSkillCategory(got), true);
    assert.equal(classifyCategory(signals), got);
  }
  assert.equal(classifyCategory([]), "coding-dev-tools");
});

// ---------------------------------------------------------------------------
// The public-id mint
// ---------------------------------------------------------------------------

test("slugifySegment produces the alphabet the varchar column expects", () => {
  assert.equal(slugifySegment("Hello, World!"), "hello-world");
  assert.equal(slugifySegment("--a--b--"), "a-b");
});

test("a single-namespace source drops the owner segment but keeps it on the row", () => {
  assert.equal(mintPublicId("anthropic-skills", "anthropics", "pdf"), "anthropic-skills-pdf");
  assert.equal(mintPublicId("clawhub", "steipete", "github"), "clawhub-steipete-github");
});

test("the repeat-collapse runs over the parts, never over the joined string", () => {
  // Collapsing the joined string would give `github-mcp-server` and silently
  // re-key every row whose slug starts with its own owner's name.
  assert.equal(mintPublicId("github", "github", "github-mcp-server"), "github-github-mcp-server");
});

test("the mint never exceeds the varchar(160) the column declares", () => {
  const id = mintPublicId("clawhub", "o".repeat(80), "s".repeat(120));
  assert.equal(id.length, 160);
});

test("truncation stays injective — two long identities do not collide", () => {
  const a = mintPublicId("clawhub", "owner", `${"x".repeat(200)}-a`);
  const b = mintPublicId("clawhub", "owner", `${"x".repeat(200)}-b`);
  assert.equal(a.length, 160);
  assert.notEqual(a, b);
});

test("the collision retry actually differs from the id it is retrying", () => {
  // Short identity: the tail is simply appended.
  const shortId = mintPublicId("clawhub", "o", "s");
  assert.notEqual(mintPublicIdWithDigest("clawhub", "o", "s"), shortId);
  // Long identity: the id ALREADY ends in a digest, and an unsalted retry
  // recomputed the same eight characters over the same stem.
  const longSlug = "s".repeat(200);
  const longId = mintPublicId("clawhub", "owner", longSlug);
  const retry = mintPublicIdWithDigest("clawhub", "owner", longSlug);
  assert.notEqual(retry, longId, "the retry would re-hit the unique violation it exists to escape");
  assert.ok(retry.length <= 160);
});

test("an identity with no ASCII alphanumerics still mints a usable, distinct key", () => {
  // Two CJK-titled skills from the same source. Without the guard both slugify
  // to "" and the second one can never be inserted.
  const a = mintPublicId("clawhub", "owner", "\u4e2d\u6587\u6280\u80fd");
  const b = mintPublicId("clawhub", "owner", "\u65e5\u672c\u8a9e\u30b9\u30ad\u30eb");
  for (const id of [a, b]) {
    assert.ok(id.length > 0);
    assert.ok(/^[a-z0-9-]+$/.test(id), `${id} is outside the slug alphabet`);
    assert.ok(!id.startsWith("-") && !id.endsWith("-"));
  }
  assert.notEqual(a, b);
  assert.notEqual(mintPublicIdWithDigest("clawhub", "owner", "\u4e2d\u6587\u6280\u80fd"), a);
});

test("the mint is a pure function of the identity triple", () => {
  assert.equal(mintPublicId("a", "b", "c"), mintPublicId("a", "b", "c"));
  assert.equal(mintPublicIdWithDigest("a", "b", "c"), mintPublicIdWithDigest("a", "b", "c"));
});

// ---------------------------------------------------------------------------
// Harness compatibility
// ---------------------------------------------------------------------------

test("every harness prefix is recognised as a host capability, and skill config is not", () => {
  for (const h of HARNESS_IDS) {
    assert.equal(isHostCapability(`${h}.tool.example`), true, `${h}.* must be a host capability`);
  }
  assert.equal(isHostCapability("mcp.client"), true);
  // The integration contract's own worked example. Reading it as a missing host
  // capability marks the skill 0/4 and makes it unattachable without an override.
  assert.equal(isHostCapability("github.host"), false);
});

test("a requirement only one harness provides is unsupported on the other three", () => {
  const compat = deriveHarnessCompat({ config: ["openclaw.tool.slack"] }, "agent_skill");
  assert.deepEqual(supportedHarnesses(compat), ["openclaw"]);
  for (const h of HARNESS_IDS) {
    assert.equal(compat[h]?.basis, "inferred", "an inference must never be dressed as a verdict");
  }
  assert.ok(compat.codex?.note?.includes("openclaw.tool.slack"));
});

test("a deepseek-specific requirement is honoured now that the prefix is spelled right", () => {
  const compat = deriveHarnessCompat({ config: ["deepseek.something"] }, "agent_skill");
  assert.deepEqual(supportedHarnesses(compat), []);
});

test("an MCP server needs an MCP client whether or not the publisher said so", () => {
  const compat = deriveHarnessCompat({}, "mcp_server");
  assert.deepEqual(supportedHarnesses(compat), [...HARNESS_IDS]);
});

test("a required binary never makes a skill harness-specific", () => {
  const compat = deriveHarnessCompat({ bins: ["gh"], env: ["GITHUB_TOKEN"] }, "agent_skill");
  assert.deepEqual(supportedHarnesses(compat), [...HARNESS_IDS]);
});

test("a publisher assertion wins over inference, an inferred one does not", () => {
  const declared = deriveHarnessCompat({ config: ["openclaw.tool.slack"] }, "agent_skill", {
    codex: { supported: true, basis: "declared" },
  });
  assert.equal(declared.codex?.supported, true);
  const inferred = deriveHarnessCompat({ config: ["openclaw.tool.slack"] }, "agent_skill", {
    codex: { supported: true, basis: "inferred" },
  });
  assert.equal(inferred.codex?.supported, false, "we do not take our own guess as evidence");
});

test("compatFromList draws four rows, not one", () => {
  const compat = compatFromList(["openclaw"], "untested");
  assert.equal(Object.keys(compat).length, HARNESS_IDS.length);
  assert.equal(compat.hermes?.note, "untested");
});

test("an absent entry reads as untested, never as permission", () => {
  assert.deepEqual(compatFor({}, "codex"), { supported: false, basis: "unknown" });
  // The attach gate is `!== true` for exactly this reason.
  assert.equal(compatFor({}, "codex").supported !== true, true);
});

// ---------------------------------------------------------------------------
// The seed catalogue
//
// 101 rows transcribed from docs/research/SKILL_ECOSYSTEM.md section A. These
// assertions exist because the catalogue is data a human types, and every one of
// them names a way a typo becomes a production defect rather than a red test:
// a mis-minted `publicId` is a failed insert on the first sync, a duplicate
// identity is a row that can never be updated, and a `high` skill mislabelled
// `low` is the browse default hiding the thing it exists to warn about.
// ---------------------------------------------------------------------------

test("every seeded publicId is exactly what the mint produces", () => {
  // The mint is the sync pipeline's spelling too. A seed row keyed any other way
  // is not updated by the first crawl — it is shadowed by a second row.
  for (const s of SEED_SKILLS) {
    assert.equal(
      s.publicId,
      mintPublicId(s.sourceId, s.ownerHandle, s.slug),
      `${s.publicId} is not the mint of (${s.sourceId}, ${s.ownerHandle}, ${s.slug})`,
    );
  }
});

test("no two rows share a publicId, and no two share an identity triple", () => {
  const ids = new Set(SEED_SKILLS.map((s) => s.publicId));
  assert.equal(ids.size, SEED_SKILLS.length, "duplicate publicId");
  // `skills_identity_uniq` is the constraint the seed upserts on. Two rows with
  // the same triple means the second silently overwrites the first.
  const triples = new Set(SEED_SKILLS.map((s) => `${s.sourceId} ${s.ownerHandle} ${s.slug}`));
  assert.equal(triples.size, SEED_SKILLS.length, "duplicate (sourceId, ownerHandle, slug)");
  // Two skills legitimately share the bare slug `skill-creator` — one Anthropic,
  // one community — which is precisely why identity is the triple and not the
  // slug. ClawHub returns AMBIGUOUS_SKILL_SLUG for six publishers of `github`.
  assert.equal(SEED_SKILLS.filter((s) => s.slug === "skill-creator").length, 2);
});

test("every row satisfies the column widths and alphabets it will be stored in", () => {
  for (const s of SEED_SKILLS) {
    assert.match(s.publicId, /^[a-z0-9-]+$/, `${s.publicId} is outside the slug alphabet`);
    assert.ok(s.publicId.length <= 160, `${s.publicId} exceeds varchar(160)`);
    assert.ok(s.slug.length > 0 && s.slug.length <= 120, `${s.publicId}: slug width`);
    assert.ok(s.ownerHandle.length <= 80, `${s.publicId}: ownerHandle width`);
    assert.ok(s.name.length > 0 && s.name.length <= 120, `${s.publicId}: name width`);
    assert.ok(s.summary.length > 0 && s.summary.length <= 300, `${s.publicId}: summary width`);
    assert.ok(s.license.length > 0 && s.license.length <= 60, `${s.publicId}: license width`);
    assert.ok(
      s.publisherName.length > 0 && s.publisherName.length <= 120,
      `${s.publicId}: publisher width`,
    );
    assert.ok((s.note ?? "").length <= 400, `${s.publicId}: note is longer than the drawer renders`);
    assert.ok((s.deprecationNote ?? "").length <= 200, `${s.publicId}: deprecationNote width`);
  }
});

test("every row's classification is a value the pgEnum can hold", () => {
  for (const s of SEED_SKILLS) {
    assert.ok(isSkillCategory(s.category), `${s.publicId}: ${s.category}`);
    assert.ok((SKILL_FORMAT_IDS as readonly string[]).includes(s.format), `${s.publicId}: ${s.format}`);
    assert.ok((SKILL_RISK_IDS as readonly string[]).includes(s.riskLevel), `${s.publicId}: ${s.riskLevel}`);
    assert.ok((SKILL_STATUS_IDS as readonly string[]).includes(s.status), `${s.publicId}: ${s.status}`);
    assert.ok(
      Number.isInteger(s.popularity) && s.popularity >= 0 && s.popularity <= 100,
      `${s.publicId}: popularity`,
    );
    assert.ok(s.tags.length > 0 && s.tags.length <= 20, `${s.publicId}: tag count`);
    for (const t of s.tags) {
      // Tags are a facet the browse page filters on. A tag that does not survive
      // `sanitizeTag` filters nothing.
      assert.equal(sanitizeTag(t), t, `${s.publicId}: tag ${JSON.stringify(t)} is not normalized`);
    }
  }
});

test("every row declares at least one harness, and only real harness ids", () => {
  for (const s of SEED_SKILLS) {
    assert.ok(s.harnesses.length > 0, `${s.publicId} runs nowhere`);
    for (const h of s.harnesses) {
      assert.ok((HARNESS_IDS as readonly string[]).includes(h), `${s.publicId}: ${h}`);
    }
    assert.equal(new Set(s.harnesses).size, s.harnesses.length, `${s.publicId}: repeated harness`);
  }
  // AST10 is a named OWASP risk, so a 1-of-4 row has to actually exist in the
  // seed — a catalogue where everything is ALL4 has not modelled the problem.
  assert.ok(SEED_SKILLS.some((s) => s.harnesses.length === 1));
});

test("every sourceUrl is https, and ClawHub rows point at their canonical page", () => {
  for (const s of SEED_SKILLS) {
    const url = new URL(s.sourceUrl);
    assert.equal(url.protocol, "https:", `${s.publicId}: ${s.sourceUrl}`);
    if (s.sourceId === "clawhub") {
      // The link-back is a condition of ClawHub's directory-reuse permission,
      // not a nicety, and it is built from owner + slug.
      assert.equal(url.hostname, "clawhub.ai");
      assert.equal(url.pathname, `/${s.ownerHandle}/skills/${s.slug}`, s.publicId);
    }
  }
});

test("only a licence that permits redistribution may ship its bytes inline", () => {
  // `install.mode: "inline"` is us shipping the body. Registry and git installs
  // are the runtime fetching from the origin under the origin's own terms, which
  // is what unblocks the 30 licence-UNKNOWN ClawHub rows.
  for (const s of SEED_SKILLS) {
    if (s.install.mode === "inline") {
      assert.ok(isRedistributable(s.license), `${s.publicId} ships inline under ${s.license}`);
    }
    if (s.sourceId === "clawhub") assert.equal(s.install.mode, "registry", s.publicId);
  }
  assert.deepEqual(
    SEED_SKILLS.filter((s) => s.install.mode === "inline").map((s) => s.publicId),
    ["arkagent-translate", "arkagent-daily-digest"],
  );
});

test("the risk floors hold on every row", () => {
  for (const s of SEED_SKILLS) {
    const floorTag = s.tags.find((t) => (HIGH_FLOOR_TAGS as readonly string[]).includes(t));
    if (floorTag) {
      assert.equal(s.riskLevel, "high", `${s.publicId} carries the floor tag "${floorTag}"`);
    }
    if (s.permissions.irreversible) {
      assert.equal(s.riskLevel, "high", `${s.publicId} is irreversible`);
    }
    // Holding a credential for an account we do not control is authority over
    // that account. No amount of publisher reputation makes it as safe as prose.
    if (capabilityTier(s.permissions).tier >= 6) {
      assert.notEqual(s.riskLevel, "low", `${s.publicId} holds a credential and is banded low`);
    }
  }
  // The floors have to bite somewhere or they are decoration.
  assert.ok(SEED_SKILLS.some((s) => s.permissions.irreversible));
});

test("no seeded row trips a hard gate, and the rubric never has to LOWER a prior", () => {
  // The seed is the scorer's input, not a bypass of it. `scripts/seed-skills.ts`
  // persists maxBand(prior, derived), so what this pins is the direction: a
  // researched band may be stricter than the arithmetic, and the arithmetic may
  // raise it, but nothing in the seed can talk a band DOWN.
  for (const s of SEED_SKILLS) {
    const derived = scoreSkill({
      permissions: s.permissions,
      requirements: s.requirements,
      tags: s.tags,
      license: s.license,
      format: s.format,
      install: s.install,
      publisherVerified: s.publisherVerified,
      ownerHandle: s.ownerHandle,
      slug: s.slug,
      widelyAdopted: s.widelyAdopted,
    });
    assert.equal(derived.blocked, false, `${s.publicId} is hard-gated: ${derived.blockReason}`);
    const persisted = maxBand(s.riskLevel, derived.riskLevel);
    assert.ok(
      persisted === s.riskLevel || persisted === derived.riskLevel,
      `${s.publicId}: persisted band came from neither source`,
    );
    // Whatever the arithmetic says, a seeded `high` stays high.
    if (s.riskLevel === "high") assert.equal(persisted, "high", s.publicId);
  }
});

test("the honesty flags say what the research could and could not establish", () => {
  for (const s of SEED_SKILLS) {
    if (s.sourceId === "clawhub") {
      // No ClawHub listing endpoint returns a licence and nobody read a
      // SKILL.md, so claiming either flag would be a fabrication.
      assert.equal(s.license, "UNKNOWN", s.publicId);
      assert.equal(s.licenseVerified, false, s.publicId);
      assert.equal(s.verified, false, s.publicId);
      assert.equal(s.publisherVerified, false, s.publicId);
    }
    // An unresolved licence may never be claimed as verified-and-redistributable.
    if (!s.licenseVerified) assert.equal(isRedistributable(s.license), false, s.publicId);
  }
  // mcporter is excluded on purpose: `mode=exact` would not resolve its owner
  // handle, so its canonical ref is unverified and the row would be unaddressable.
  assert.equal(
    SEED_SKILLS.some((s) => s.slug === "mcporter"),
    false,
  );
  // The pack whose NAME implies an authority its owner does not have. This is the
  // exact incoherence ClawHavoc exploited, so the handle must be the publisher.
  const cyber = SEED_SKILLS.find((s) => s.slug === "anthropic-cybersecurity-skills");
  assert.equal(cyber?.ownerHandle, "mukul975");
  assert.equal(cyber?.publisherVerified, false);
});

test("the seed totals are asserted, not asserted about in prose", () => {
  const count = (p: (s: (typeof SEED_SKILLS)[number]) => boolean) => SEED_SKILLS.filter(p).length;
  assert.equal(SEED_SKILLS.length, SEED_TOTALS.total);
  for (const [id, n] of Object.entries(SEED_TOTALS.bySource)) {
    assert.equal(count((s) => s.sourceId === id), n, `source ${id}`);
  }
  for (const [level, n] of Object.entries(SEED_TOTALS.byRisk)) {
    assert.equal(count((s) => s.riskLevel === level), n, `risk ${level}`);
  }
  for (const [status, n] of Object.entries(SEED_TOTALS.byStatus)) {
    assert.equal(count((s) => s.status === status), n, `status ${status}`);
  }
  assert.equal(count((s) => !s.verified), SEED_TOTALS.unverified);
  assert.equal(count((s) => !s.licenseVerified), SEED_TOTALS.licenceUnverified);
  assert.equal(count((s) => s.widelyAdopted === true), SEED_TOTALS.widelyAdopted);
  // Every source a skill names must be a source we would actually fetch from.
  for (const s of SEED_SKILLS) {
    assert.ok(SEED_SKILL_SOURCE_IDS.includes(s.sourceId), `${s.publicId}: bad source ${s.sourceId}`);
  }
});

test("the lookup map covers the array and nothing else", () => {
  assert.equal(SEED_SKILLS_BY_PUBLIC_ID.size, SEED_SKILLS.length);
  for (const s of SEED_SKILLS) assert.equal(SEED_SKILLS_BY_PUBLIC_ID.get(s.publicId), s);
});

// ---------------------------------------------------------------------------
// The sync sources
//
// `runSync` starts by looking the id up in `skill_sources`; with the table empty
// every trigger returned `unknown_source` and the route 404'd for every id.
// ---------------------------------------------------------------------------

test("the eight source ids are unique and fit the varchar the primary key declares", () => {
  assert.equal(SEED_SKILL_SOURCES.length, 8);
  assert.equal(new Set(SEED_SKILL_SOURCE_IDS).size, 8);
  for (const s of SEED_SKILL_SOURCES) {
    assert.match(s.id, /^[a-z0-9-]{1,40}$/, s.id);
    assert.ok(s.name.length > 0 && s.name.length <= 120, s.id);
    assert.equal(new URL(s.homepageUrl).protocol, "https:", s.id);
  }
});

test("every source id the sync route can be handed parses as one", () => {
  for (const id of SEED_SKILL_SOURCE_IDS) {
    assert.doesNotThrow(() => syncSkillsSchema.parse({ source: id }), `${id} is not a legal source id`);
  }
});

test("no source names an egress host the fetcher would refuse", () => {
  // An allowlist checked only against the template is not an allowlist, and a
  // source row whose base host is not admitted is a row that can only ever fail.
  for (const s of SEED_SKILL_SOURCES) {
    if (!s.apiBaseUrl) continue;
    const url = new URL(s.apiBaseUrl);
    assert.equal(url.protocol, "https:", s.id);
    assert.ok(ALLOWED_HOSTS.has(url.hostname), `${s.id} points at ${url.hostname}; fetch.ts refuses it`);
  }
  for (const h of SEED_SOURCE_HOSTS) assert.ok(ALLOWED_HOSTS.has(h), h);
});

test("only an official vendor may auto-publish, and a crawl-less source has no API base", () => {
  for (const s of SEED_SKILL_SOURCES) {
    if (s.autoPublish) {
      assert.equal(s.trust, "official_vendor", `${s.id} auto-publishes on ${s.trust} trust`);
    }
    // ClawHavoc's publishers were legitimate registered accounts. A registry that
    // auto-published on reputation would have published the whole campaign.
    if (s.kind === "registry") assert.equal(s.autoPublish, false, s.id);
    if (s.kind === "manual" || s.kind === "curated_list") {
      assert.equal(s.apiBaseUrl, null, `${s.id} is not crawled but names an API base`);
    }
    // Our ceiling is always well under the documented one, so a bug on our side
    // cannot get the platform IP-banned.
    assert.ok(s.rateLimitPerMin > 0 && s.rateLimitPerMin <= 600, s.id);
  }
  const clawhub = SEED_SKILL_SOURCES.find((s) => s.id === "clawhub");
  assert.equal(clawhub?.rateLimitPerMin, 600, "a fifth of ClawHub's documented 3,000/min");
  // The MCP registry publishes no rate limit at all, so it keeps the default.
  assert.equal(SEED_SKILL_SOURCES.find((s) => s.id === "mcp-registry")?.rateLimitPerMin, 60);
});

test("ClawHub is the only source with a link-back template, and it renders as a real URL", () => {
  const withTemplate = SEED_SKILL_SOURCES.filter((s) => s.attributionTemplate !== null);
  assert.deepEqual(
    withTemplate.map((s) => s.id),
    ["clawhub"],
  );
  const template = withTemplate[0].attributionTemplate as string;
  assert.equal(
    attributionUrlFor(template, "steipete", "github"),
    "https://clawhub.ai/steipete/skills/github",
  );
  // The template is ours; the values in it are not. A `javascript:` reaching an
  // href is a stored XSS even when we wrote the surrounding string.
  assert.equal(attributionUrlFor(template, "a b", "c/d"), "https://clawhub.ai/a%20b/skills/c%2Fd");
});

test("the curated-list source ships disabled", () => {
  // Four popularity figures claimed by curated lists were checked against the
  // primary APIs and all four were wrong. The list is a candidate feed for a
  // human queue, not a source of facts, so nothing crawls it unattended.
  const lists = SEED_SKILL_SOURCES.find((s) => s.id === "awesome-lists");
  assert.equal(lists?.enabled, false);
  assert.equal(lists?.trust, "unreviewed");
});
