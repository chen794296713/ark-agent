/**
 * The Agent Template Generator's floor.
 *
 * The one claim this file exists to keep honest: **a draft composed with no
 * model, in any language, for any seeded role, on any harness, passes the same
 * Zod schema as a draft the model wrote.** That is 8 roles × 4 locales × 4
 * harnesses = 128 combinations, and it is asserted as a table rather than
 * spot-checked, because "the fallback probably works" is how a fallback rots.
 *
 * Everything else here defends a specific way the floor could go quietly wrong:
 * an English sentence spliced into a 日本語 draft, a high-risk skill reaching a
 * template nobody asked for one in, a `latest` version pinned into a row, a
 * spending allowance handed to a Legal Reviewer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { genTexts, landingRoles, rolesData } from "../lib/data";
import { roleHue } from "../lib/theme";
import { HARNESS_IDS, type Harness } from "../lib/harness";
import type { AgentRole } from "../lib/db/schema";
import type { Lang } from "../lib/types";
import { agentTemplateDraftSchema } from "../lib/atg/schema";
import { ROLE_FLOOR, ROLE_IDS } from "../lib/atg/defaults";
import {
  buildTemplateSkills,
  composeDeterministic,
  detectMoneyHints,
  deterministicBoundaries,
  deterministicCapabilities,
  gateCandidate,
  parseScheduleHints,
  resolveRole,
  selectSkills,
  type CatalogCandidate,
  type IntakeFacts,
} from "../lib/atg/deterministic";

const LANGS: Lang[] = ["en", "zh", "zht", "ja"];
const NOW = new Date("2026-03-02T01:00:00.000Z");

/**
 * The seeded `agent_roles` rows, built exactly the way `lib/db/seed.ts` builds
 * them. Constructing them here rather than reading the database is the point:
 * the composer takes its rows as an argument precisely so it can be tested
 * without one.
 */
const SEEDED_ROLES: AgentRole[] = rolesData.map((r, i) => ({
  id: r.id,
  name: r.name,
  blurb: r.blurb,
  longBlurb: landingRoles.find((l) => l.id === r.id)?.long ?? null,
  hue: roleHue[r.id] ?? "#9AA3B2",
  mono: r.mono,
  defaultEngine: "openclaw",
  defaultInstructions: genTexts[r.id]?.i ?? null,
  defaultRules: genTexts[r.id]?.r ?? null,
  minPlan: r.minPlan,
  sortOrder: i,
}));

function facts(over: Partial<IntakeFacts> = {}): IntakeFacts {
  return {
    brief: "Chase my unpaid invoices and keep the books tidy.",
    briefSha256: "a".repeat(64),
    locale: "en",
    harness: "openclaw",
    roleGuess: { roleId: "opc", score: 9, alternatives: [] },
    channelHints: [],
    toolHints: [],
    scheduleHints: [],
    moneyHints: [],
    injection: [],
    timezone: "Asia/Singapore",
    tooThin: false,
    ...over,
  };
}

function candidate(over: Partial<CatalogCandidate> = {}): CatalogCandidate {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    sourceId: "clawhub",
    ownerHandle: "acme",
    slug: "ledger-reader",
    publicId: "clawhub:acme/ledger-reader",
    latestVersion: "1.4.0",
    name: "Ledger Reader",
    summary: "Reads a bank statement or ledger CSV and returns normalized rows.",
    category: "finance-payments",
    tags: ["csv", "accounting"],
    riskLevel: "low",
    riskScore: 1,
    blocked: false,
    status: "published",
    requirements: { bins: [], env: [], config: [], os: [] },
    harnesses: ["openclaw", "hermes", "codex", "deepseek"],
    installMode: "registry",
    redistributable: true,
    downloads: 42_000,
    stars: 300,
    upstreamUpdatedAt: "2026-02-01T00:00:00.000Z",
    textRank: 0.5,
    capability: "read a bank statement or ledger CSV",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// The table that matters
// ---------------------------------------------------------------------------

test("composes a schema-valid draft for every seeded role x locale x harness", () => {
  let checked = 0;
  for (const roleId of ROLE_IDS) {
    for (const locale of LANGS) {
      for (const harness of HARNESS_IDS) {
        const draft = composeDeterministic(
          facts({ locale, harness, roleGuess: { roleId, score: 9, alternatives: [] } }),
          [],
          SEEDED_ROLES,
          { name: "Acme", timezone: "Asia/Singapore" },
          { generationId: "22222222-2222-4222-8222-222222222222", now: NOW },
        );
        const parsed = agentTemplateDraftSchema.safeParse(draft);
        assert.ok(
          parsed.success,
          `${roleId}/${locale}/${harness} failed: ${JSON.stringify(parsed.error?.issues?.slice(0, 3))}`,
        );
        assert.equal(draft.locale, locale);
        assert.equal(draft.harness, harness);
        assert.equal(draft.provenance.mode, "deterministic");
        checked += 1;
      }
    }
  }
  assert.equal(checked, ROLE_IDS.length * LANGS.length * HARNESS_IDS.length);
  assert.equal(checked, 128);
});

test("a non-English draft never inherits the seeded row's English copy", () => {
  // The seeded `agent_roles` row is English. Splicing its blurb into a Japanese
  // draft would pass the schema and fail the user, so the check is on CONTENT.
  const latinOnly = /^[\x20-\x7e]+$/;
  for (const roleId of ROLE_IDS) {
    for (const locale of ["zh", "zht", "ja"] as Lang[]) {
      const draft = composeDeterministic(
        facts({ locale, roleGuess: { roleId, score: 9, alternatives: [] } }),
        [],
        SEEDED_ROLES,
        { name: null, timezone: "Asia/Tokyo" },
        { now: NOW },
      );
      const role = SEEDED_ROLES.find((r) => r.id === roleId)!;
      assert.notEqual(draft.meta.summary, role.blurb, `${roleId}/${locale} summary`);
      assert.notEqual(draft.roles[0].mission, role.longBlurb ?? role.blurb);
      for (const field of [
        draft.meta.summary,
        draft.roles[0].mission,
        draft.roles[0].title,
        ...draft.roles[0].responsibilities,
        ...draft.boundaries.rules.map((r) => r.text),
        ...draft.context.map((c) => c.title),
        ...draft.schedules.map((s) => s.prompt),
      ]) {
        assert.ok(!latinOnly.test(field), `${roleId}/${locale}: english leaked — "${field}"`);
      }
    }
  }
});

test("the English draft does use the seeded row, which is what it is for", () => {
  const draft = composeDeterministic(
    facts({ locale: "en", roleGuess: { roleId: "support", score: 9, alternatives: [] } }),
    [],
    SEEDED_ROLES,
    { name: null, timezone: "Asia/Singapore" },
    { now: NOW },
  );
  const role = SEEDED_ROLES.find((r) => r.id === "support")!;
  assert.equal(draft.meta.summary, role.blurb);
  assert.equal(draft.agents[0].brief, role.defaultInstructions);
});

// ---------------------------------------------------------------------------
// Role resolution
// ---------------------------------------------------------------------------

test("role resolution reads the brief in every language", () => {
  assert.equal(
    resolveRole("chase my unpaid invoices and keep my books tidy", "en", SEEDED_ROLES).roleId,
    "opc",
  );
  assert.equal(resolveRole("帮我筛选简历，安排面试", "zh", SEEDED_ROLES).roleId, "hr");
  assert.equal(resolveRole("契約書のレビューと条項の指摘をお願いしたい", "ja", SEEDED_ROLES).roleId, "legal");
  assert.equal(resolveRole("回覆客戶的工單和常見問題", "zht", SEEDED_ROLES).roleId, "support");
});

test("nothing scoring falls back to admin and says the score was under the floor", () => {
  const guess = resolveRole("i would like a thing that does the stuff", "en", SEEDED_ROLES);
  assert.equal(guess.roleId, "admin");
  assert.ok(guess.score < ROLE_FLOOR, `score ${guess.score} should be under ${ROLE_FLOOR}`);
});

test("a guessed role uses the user's own words as the brief, not our generic copy", () => {
  const brief = "Please look after whatever comes up around the studio each week";
  const draft = composeDeterministic(
    facts({ brief, roleGuess: { roleId: "admin", score: 0, alternatives: [] } }),
    [],
    SEEDED_ROLES,
    { name: null, timezone: "Asia/Singapore" },
    { now: NOW },
  );
  assert.equal(draft.agents[0].brief, brief);
});

// ---------------------------------------------------------------------------
// Gates — what can never be proposed
// ---------------------------------------------------------------------------

test("every hard gate refuses its own case", () => {
  assert.equal(gateCandidate(candidate(), "openclaw"), null);
  assert.equal(gateCandidate(candidate({ status: "draft" }), "openclaw"), "G0");
  assert.equal(gateCandidate(candidate({ blocked: true }), "openclaw"), "G1");
  assert.equal(gateCandidate(candidate({ status: "deprecated" }), "openclaw"), "G2");
  assert.equal(gateCandidate(candidate({ harnesses: ["hermes"] }), "openclaw"), "G3");
  // "Nobody asserted compatibility" is NOT "compatible with all four".
  assert.equal(gateCandidate(candidate({ harnesses: [] }), "openclaw"), "G3");
  assert.equal(gateCandidate(candidate({ riskLevel: "high" }), "openclaw"), "G4");
  assert.equal(
    gateCandidate(candidate({ installMode: "inline", redistributable: false }), "openclaw"),
    "G5",
  );
  assert.equal(gateCandidate(candidate({ latestVersion: "0.0.0" }), "openclaw"), "G6");
  assert.equal(gateCandidate(candidate({ latestVersion: "latest" }), "openclaw"), "G6");
  assert.equal(
    gateCandidate(
      candidate({ requirements: { env: ["A", "B", "C", "D", "E"] } }),
      "openclaw",
    ),
    "G7",
  );
});

test("a high-risk skill is never auto-selected, however well it scores", () => {
  const caps = deterministicCapabilities("opc");
  const perfect = candidate({
    riskLevel: "high",
    riskScore: 0,
    textRank: 1,
    downloads: 5_000_000,
    capability: caps[0].capability,
  });
  const { selected, uncovered } = selectSkills(caps, [perfect], "opc", "openclaw", NOW.getTime());
  assert.equal(selected.length, 0);
  // And the refusal is legible rather than silent.
  assert.ok(uncovered.includes(caps[0].capability));
});

test("the medium-risk quota falls back to a low-risk candidate rather than dropping the capability", () => {
  const caps = deterministicCapabilities("opc").filter((c) => c.necessity === "must");
  const pool: CatalogCandidate[] = [];
  caps.forEach((cap, i) => {
    pool.push(
      candidate({
        id: `aaaaaaaa-0000-4000-8000-00000000000${i}`,
        slug: `medium-${i}`,
        riskLevel: "medium",
        riskScore: 4,
        textRank: 1,
        category: "finance-payments",
        capability: cap.capability,
      }),
      candidate({
        id: `bbbbbbbb-0000-4000-8000-00000000000${i}`,
        slug: `low-${i}`,
        riskLevel: "low",
        riskScore: 0,
        textRank: 1,
        category: "documents-files",
        capability: cap.capability,
      }),
    );
  });
  const { selected } = selectSkills(caps, pool, "opc", "openclaw", NOW.getTime());
  const mediums = selected.filter((s) => s.candidate.riskLevel === "medium");
  assert.ok(mediums.length <= 2, `selected ${mediums.length} medium-risk skills`);
  assert.equal(selected.length, caps.length, "every must capability still got covered");
});

test("an empty catalogue yields no skills and a draft that is still valid", () => {
  const draft = composeDeterministic(
    facts(),
    [],
    SEEDED_ROLES,
    { name: null, timezone: "Asia/Singapore" },
    { now: NOW },
  );
  assert.deepEqual(draft.skills, []);
  assert.deepEqual(draft.agents[0].skillKeys, []);
  assert.ok(agentTemplateDraftSchema.safeParse(draft).success);
});

test("a selected skill is pinned, compatible and never risk-accepted by the generator", () => {
  const caps = deterministicCapabilities("opc");
  const pool = caps.map((cap, i) =>
    candidate({
      id: `cccccccc-0000-4000-8000-00000000000${i}`,
      slug: `tool-${i}`,
      textRank: 1,
      capability: cap.capability,
      category: i % 2 === 0 ? "finance-payments" : "documents-files",
    }),
  );
  const { selected } = selectSkills(caps, pool, "opc", "openclaw", NOW.getTime());
  const skills = buildTemplateSkills(selected, "ja");
  assert.ok(skills.length > 0);
  for (const s of skills) {
    assert.notEqual(s.version, "latest");
    assert.equal(s.harnessCompatible, true);
    assert.equal(s.riskAccepted, false);
    assert.ok(s.skillId !== null, "the floor selects real catalogue rows, never placeholders");
    assert.ok(s.purpose.length > 0 && s.purpose.length <= 160);
    // The purpose line is localized even though the capability query is English.
    assert.ok(/[぀-ヿ一-鿿]/.test(s.purpose), `purpose not localized: ${s.purpose}`);
  }
});

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

test("money in the brief becomes the approval threshold, rounded down", () => {
  const hints = detectMoneyHints("Escalate refunds over $300 to me, and never over 2,000 USD.");
  assert.deepEqual(
    hints.map((h) => [h.amount, h.currency]),
    [
      [300, "USD"],
      [2000, "USD"],
    ],
  );
  const b = deterministicBoundaries(
    facts({ moneyHints: hints }),
    SEEDED_ROLES.find((r) => r.id === "opc")!,
    ["web"],
  );
  // The SMALLEST amount wins: a threshold is a ceiling, not an average.
  assert.equal(b.approvalAmountUsd, 300);
});

test("CNY and JPY convert downwards, never upwards", () => {
  const cny = detectMoneyHints("超过 3500 元 的付款要先问我");
  assert.equal(cny[0]?.currency, "CNY");
  const b = deterministicBoundaries(
    facts({ locale: "zh", moneyHints: cny }),
    SEEDED_ROLES.find((r) => r.id === "opc")!,
    ["web"],
  );
  assert.equal(b.approvalAmountUsd, 500);
});

test("legal work gets no spending allowance and never acts alone", () => {
  const legal = SEEDED_ROLES.find((r) => r.id === "legal")!;
  const b = deterministicBoundaries(
    facts({ moneyHints: [{ amount: 900, currency: "USD", raw: "$900" }] }),
    legal,
    ["web"],
  );
  // The order of the branches is the whole point: an earlier draft put the
  // unconditional default first and quietly gave a Legal Reviewer $300.
  assert.equal(b.approvalAmountUsd, 0);
  assert.equal(b.autonomy, "suggest");
});

test("the deterministic path never grants full autonomy", () => {
  for (const roleId of ROLE_IDS) {
    for (const locale of LANGS) {
      const b = deterministicBoundaries(
        facts({ locale }),
        SEEDED_ROLES.find((r) => r.id === roleId)!,
        ["web", "email"],
      );
      assert.notEqual(b.autonomy, "auto", `${roleId}/${locale}`);
      assert.equal(b.approveExternalSends, true);
      assert.ok(b.rules.some((r) => r.category === "money"));
      assert.ok(b.rules.some((r) => r.category === "external_comms"));
      assert.equal(b.escalation.to, null);
    }
  }
});

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

test("a cadence the user named beats the role default", () => {
  const hints = parseScheduleHints("Send me a summary every Friday at 17:00.", {
    year: 2026,
    month: 3,
    day: 2,
  });
  assert.ok(hints.length > 0);
  const draft = composeDeterministic(
    facts({ scheduleHints: hints }),
    [],
    SEEDED_ROLES,
    { name: null, timezone: "Asia/Singapore" },
    { now: NOW },
  );
  assert.ok(draft.schedules.length > 0);
  assert.equal(draft.schedules[0].source, "user_phrase");
  assert.equal(draft.schedules[0].cron, "0 17 * * 5");
  // `humanReadable` is derived, never authored, so what the user reads is what
  // the runner will do.
  assert.ok(draft.schedules[0].humanReadable.length > 0);
});

test("a brief with no cadence still gets one, from the role", () => {
  for (const roleId of ROLE_IDS) {
    const draft = composeDeterministic(
      facts({ roleGuess: { roleId, score: 9, alternatives: [] } }),
      [],
      SEEDED_ROLES,
      { name: null, timezone: "Asia/Singapore" },
      { now: NOW },
    );
    assert.ok(draft.schedules.length >= 1, `${roleId} got no cadence at all`);
    assert.equal(draft.schedules[0].source, "deterministic");
    for (const s of draft.schedules) {
      assert.equal(s.timezone, "Asia/Singapore");
      assert.ok(s.maxRunsPerDay >= 1 && s.maxRunsPerDay <= 96);
    }
  }
});

// ---------------------------------------------------------------------------
// Tools and channels
// ---------------------------------------------------------------------------

test("a keyword can open files, browser or code — never shell or docker", () => {
  const draft = composeDeterministic(
    facts({ toolHints: ["files", "browser", "code"] }),
    [],
    SEEDED_ROLES,
    { name: null, timezone: "Asia/Singapore" },
    { now: NOW },
  );
  assert.equal(draft.agents[0].tools.files, true);
  assert.equal(draft.agents[0].tools.shell, false);
  assert.equal(draft.agents[0].tools.docker, false);
});

test("web is always a channel and the harness floor is the starting tool surface", () => {
  const draft = composeDeterministic(
    facts({ harness: "deepseek", channelHints: ["telegram"] }),
    [],
    SEEDED_ROLES,
    { name: null, timezone: "Asia/Singapore" },
    { now: NOW },
  );
  assert.deepEqual(draft.agents[0].channels.sort(), ["telegram", "web"]);
  assert.equal(draft.agents[0].tools.browser, false, "deepseek has no browser floor");
});

test("the workspace name never reaches the template", () => {
  const draft = composeDeterministic(
    facts(),
    [],
    SEEDED_ROLES,
    { name: "Meridian Logistics", timezone: "Asia/Singapore" },
    { now: NOW },
  );
  assert.ok(!JSON.stringify(draft).includes("Meridian"));
});

test("an unusable workspace zone falls back rather than producing an invalid draft", () => {
  const draft = composeDeterministic(
    facts({ timezone: "Mars/Olympus" }),
    [],
    SEEDED_ROLES,
    { name: null, timezone: "Not/AZone" },
    { now: NOW },
  );
  assert.ok(agentTemplateDraftSchema.safeParse(draft).success);
});

test("the credit estimate is computed, bounded and never model-authored", () => {
  for (const harness of HARNESS_IDS as readonly Harness[]) {
    const draft = composeDeterministic(
      facts({ harness }),
      [],
      SEEDED_ROLES,
      { name: null, timezone: "Asia/Singapore" },
      { now: NOW },
    );
    assert.ok(Number.isInteger(draft.meta.estimatedCreditsPerMonth));
    assert.ok(draft.meta.estimatedCreditsPerMonth > 0);
    assert.ok(draft.meta.estimatedCreditsPerMonth <= 10_000_000);
  }
});
