/**
 * The AI-guided creation flow's pure logic.
 *
 * Five things here are worth pinning and the rest of the vertical is not.
 *
 * 1. **The SSE framing.** `EventSource` cannot POST, so the transport is a
 *    hand-rolled reader and every framing mistake — a keep-alive comment read
 *    as an event, a frame split across a chunk boundary, a multi-line `data:` —
 *    shows up as a silently missing section rather than an error.
 * 2. **`isSafePublicHttpsUrl`.** A `url` context item is a stored instruction to
 *    the agent runtime to go and fetch something. A dotted-quad regex is not a
 *    check: a resolver takes `2130706433`, `0177.0.0.1` and `127.1` as
 *    127.0.0.1, and `::ffff:169.254.169.254` as the cloud metadata endpoint.
 *    Every one of those spellings is pinned as REFUSED.
 * 3. **The cron ⇄ preset round trip.** The presets write cron and the ADVANCED
 *    field reads it back; a mapping that does not round-trip silently rewrites
 *    a schedule the user was happy with. The all-day interval case is here
 *    because clamping an EXCLUSIVE end hour to 23 dropped 23:00 from
 *    `*​/15 * * * 1-5` every time the editor re-encoded it.
 * 4. **The six-section verdict.** `empty`, `review` and `ok` are three different
 *    answers, and a model-authored link-local URL must reach `review` whether or
 *    not the item is flagged required.
 * 5. **The dictionary.** Four languages, written natively. A key present in one
 *    and missing in another is a crash; an English sentence in the 日本語 dict is
 *    the defect this test caught once already.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentTemplateDraft } from "../lib/atg/types";
import { create } from "../lib/i18n/create";
import type { Lang } from "../lib/types";
import {
  DEFAULT_SHAPE,
  acceptFile,
  compatState,
  cronFromShape,
  draftConfidence,
  fallbackStages,
  ipv4Octets,
  isDraftLike,
  isSafePublicHttpsUrl,
  parseSseChunk,
  reviewCount,
  sanitizeUntrusted,
  sectionState,
  sectionStates,
  shapeFromCron,
  stageRows,
  type ScheduleShape,
} from "../components/create/logic";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function draft(patch: Partial<AgentTemplateDraft> = {}): AgentTemplateDraft {
  return {
    schemaVersion: 1,
    locale: "en",
    harness: "openclaw",
    meta: {
      name: "Inbound Lead Qualifier",
      slug: "inbound-lead-qualifier",
      summary: "s",
      description: "d",
      category: "sales",
      tags: [],
      mono: "P",
      hue: "#D8FF3E",
      minPlan: "associate",
      estimatedCreditsPerMonth: 10,
    },
    roles: [
      {
        key: "r1",
        baseRoleId: null,
        title: "Prospector",
        mission: "Find and qualify new business",
        responsibilities: ["read the inbox"],
        successMetrics: [],
        stakeholders: [],
        handoffs: [],
      },
    ],
    agents: [
      {
        key: "a1",
        roleKey: "r1",
        name: "Aria",
        harness: "openclaw",
        isPrimary: true,
        brief: "You watch the shared inbox.",
        settings: {
          tone: "professional",
          responseLanguage: "auto",
          timezone: "Asia/Singapore",
          alwaysOn: false,
          workStart: "09:00",
          workEnd: "18:00",
          workDays: [1, 2, 3, 4, 5],
          heartbeatMinutes: 15,
          temperature: 0.4,
          maxTokens: 4096,
          reasoningEffort: "medium",
          memoryEnabled: true,
          selfImprove: false,
          autoCreateSkills: false,
          notifyNeedsReview: true,
          notifyErrors: true,
          dailyDigest: false,
          digestTime: "17:00",
        },
        tools: { shell: false, files: true, browser: true, docker: false, code: false },
        channels: [],
        tasks: [],
        skillKeys: [],
        scheduleKeys: [],
        contextKeys: [],
      },
    ],
    skills: [],
    boundaries: {
      autonomy: "ask",
      approvalAmountUsd: 300,
      approveExternalSends: true,
      dailyActionLimit: 50,
      rules: [
        { text: "Never quote a price", severity: "hard", category: "money" },
        { text: "Cite every claim", severity: "soft", category: "quality" },
        { text: "Escalate anything angry", severity: "hard", category: "scope" },
      ],
      prohibitions: [],
      escalation: { to: null, triggers: [], channel: "none" },
      dataHandling: { piiAllowed: false, retentionDays: 30, redactFields: [] },
      spend: { monthlyCreditCap: 0 },
    },
    context: [],
    schedules: [],
    provenance: {
      generationId: "g1",
      mode: "llm",
      stages: [],
      briefSha256: "x".repeat(64),
      warnings: [],
      injectionFindings: [],
      materializable: true,
    },
    ...patch,
  };
}

function contextItem(patch: Partial<AgentTemplateDraft["context"][number]>) {
  return {
    key: "c1",
    kind: "url" as const,
    title: "t",
    purpose: "p",
    required: false,
    body: null,
    url: null,
    acceptedMimeTypes: [],
    maxBytes: null,
    placeholder: null,
    containsPii: false,
    ...patch,
  };
}

// ---------------------------------------------------------------------------
// 1. SSE framing
// ---------------------------------------------------------------------------

test("a keep-alive comment is a frame with no data and produces no event", () => {
  const { events, discarded, rest } = parseSseChunk(": ping\n\n");
  assert.deepEqual(events, []);
  assert.equal(discarded, 0);
  assert.equal(rest, "");
});

test("a frame split across a chunk boundary is handed back, not parsed", () => {
  const whole = `data: ${JSON.stringify({ type: "stage", stage: "intake", index: 0, total: 10, label: "x" })}\n\n`;
  const cut = Math.floor(whole.length / 2);
  const first = parseSseChunk(whole.slice(0, cut));
  assert.deepEqual(first.events, []);
  assert.equal(first.discarded, 0);
  const second = parseSseChunk(first.rest + whole.slice(cut));
  assert.equal(second.events.length, 1);
  assert.equal(second.events[0].type, "stage");
});

test("several data: lines in one frame concatenate with a newline", () => {
  // Split on a structural boundary, which is where a server that chunks its
  // JSON actually splits — the halves only parse if they were rejoined, and
  // rejoined with a newline rather than an empty string or a space.
  const { events, discarded } = parseSseChunk(
    'data: {"type":"warning",\ndata: "warning":{"code":"ATG-L001"}}\n\n',
  );
  assert.equal(discarded, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "warning");
});

test("CRLF from a rewriting proxy does not leave \\r on the payload", () => {
  const { events, discarded } = parseSseChunk(
    `data: ${JSON.stringify({ type: "start", generationId: "g", mode: "llm", stages: [] })}\r\n\r\n`,
  );
  assert.equal(discarded, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "start");
});

test("an unknown type and unparseable JSON are counted, never emitted", () => {
  const { events, discarded } = parseSseChunk(
    'data: {"type":"nope"}\n\ndata: not json\n\ndata: [DONE]\n\n',
  );
  assert.deepEqual(events, []);
  assert.equal(discarded, 2); // [DONE] is a sentinel, not a discard
});

// ---------------------------------------------------------------------------
// 2. The URL allowlist — the SSRF surface
// ---------------------------------------------------------------------------

test("every spelling of an IPv4 literal normalises to the same four octets", () => {
  assert.deepEqual(ipv4Octets("127.0.0.1"), [127, 0, 0, 1]);
  assert.deepEqual(ipv4Octets("2130706433"), [127, 0, 0, 1]);
  assert.deepEqual(ipv4Octets("0x7f000001"), [127, 0, 0, 1]);
  assert.deepEqual(ipv4Octets("0177.0.0.1"), [127, 0, 0, 1]);
  assert.deepEqual(ipv4Octets("127.1"), [127, 0, 0, 1]);
  assert.equal(ipv4Octets("example.com"), null);
  assert.equal(ipv4Octets("1.2.3.4.5"), null);
  assert.equal(ipv4Octets("999.1.1.1"), null);
});

test("a private address is refused however it is spelled", () => {
  for (const host of [
    "127.0.0.1",
    "2130706433",
    "0x7f000001",
    "0177.0.0.1",
    "127.1",
    "169.254.169.254",
    "2852039166", // 169.254.169.254 in decimal — the cloud metadata endpoint
    "10.0.0.5",
    "172.16.0.1",
    "192.168.1.1",
    "100.64.0.1",
    "[::1]",
    "[fd00::1]",
    "[fe80::1]",
    "[::ffff:169.254.169.254]", // URL normalises this to [::ffff:a9fe:a9fe]
    "[::ffff:7f00:1]",
    "[::127.0.0.1]",
    "[ff02::1]",
    "localhost",
    "app.localhost",
    "db.internal",
    "printer.local",
    "intranet",
  ]) {
    assert.equal(
      isSafePublicHttpsUrl(`https://${host}/x`),
      false,
      `${host} must not be storable in a template`,
    );
  }
});

test("scheme, credentials and port are all part of the check", () => {
  assert.equal(isSafePublicHttpsUrl("http://example.com/"), false);
  assert.equal(isSafePublicHttpsUrl("https://user:pw@example.com/"), false);
  assert.equal(isSafePublicHttpsUrl("https://example.com:8080/"), false);
  assert.equal(isSafePublicHttpsUrl("not a url"), false);
  assert.equal(isSafePublicHttpsUrl("https://example.com:443/pricing"), true);
});

test("an ordinary public URL still passes", () => {
  assert.equal(isSafePublicHttpsUrl("https://acme.com/pricing"), true);
  assert.equal(isSafePublicHttpsUrl("https://8.8.8.8/"), true);
  assert.equal(isSafePublicHttpsUrl("https://sub.example.co.uk/a?b=c"), true);
});

// ---------------------------------------------------------------------------
// 3. Cron ⇄ preset
// ---------------------------------------------------------------------------

function roundTrip(shape: ScheduleShape): string {
  const cron = cronFromShape(shape);
  const back = shapeFromCron(cron);
  assert.ok(back, `${cron} must map back onto a preset`);
  return cronFromShape(back);
}

test("the presets write cron that reads back as the same cron", () => {
  assert.equal(cronFromShape(DEFAULT_SHAPE), "30 8 * * 1-5");
  assert.equal(roundTrip(DEFAULT_SHAPE), "30 8 * * 1-5");
  assert.equal(
    roundTrip({ ...DEFAULT_SHAPE, preset: "daily", days: [0, 1, 2, 3, 4, 5, 6] }),
    "30 8 * * *",
  );
  assert.equal(roundTrip({ ...DEFAULT_SHAPE, preset: "weekly", days: [1] }), "30 8 * * 1");
});

test("an all-day repeat keeps 23:00 — an exclusive end hour is not an hour", () => {
  const allDay: ScheduleShape = {
    ...DEFAULT_SHAPE,
    repeatEvery: 15,
    repeatFrom: 0,
    repeatTo: 24,
  };
  assert.equal(cronFromShape(allDay), "*/15 * * * 1-5");
  assert.equal(roundTrip(allDay), "*/15 * * * 1-5");
  // ...and a window that ends at midnight keeps its last hour too.
  const evening: ScheduleShape = { ...DEFAULT_SHAPE, repeatEvery: 30, repeatFrom: 9, repeatTo: 24 };
  assert.equal(cronFromShape(evening), "*/30 9-23 * * 1-5");
  assert.equal(roundTrip(evening), "*/30 9-23 * * 1-5");
});

test("a window inside the day encodes the exclusive end as end-1", () => {
  const shape: ScheduleShape = { ...DEFAULT_SHAPE, repeatEvery: 15, repeatFrom: 9, repeatTo: 18 };
  assert.equal(cronFromShape(shape), "*/15 9-17 * * 1-5");
  const back = shapeFromCron("*/15 9-17 * * 1-5");
  assert.equal(back?.repeatFrom, 9);
  assert.equal(back?.repeatTo, 18);
});

test("a cron no preset can express stays on Custom rather than being rewritten", () => {
  assert.equal(shapeFromCron("0 9 1 * *"), null); // day-of-month
  assert.equal(shapeFromCron("0 9 * 3 *"), null); // one month only
  assert.equal(shapeFromCron("0 9 * * MON"), null); // named day
  assert.equal(shapeFromCron("nonsense"), null);
});

test("0 and 7 are both Sunday, so a day chip cannot light up twice", () => {
  assert.deepEqual(shapeFromCron("0 9 * * 0,7")?.days, [0]);
});

// ---------------------------------------------------------------------------
// 4. The six-section verdict
// ---------------------------------------------------------------------------

test("empty and review are different answers", () => {
  const d = draft();
  assert.equal(sectionState(d, "context"), "empty");
  assert.equal(sectionState(d, "schedules"), "empty");
  assert.equal(sectionState(d, "roles"), "ok");
  assert.equal(sectionState(d, "boundaries"), "ok");
});

test("a link-local URL is review whether or not the item is required", () => {
  for (const required of [true, false]) {
    const d = draft({
      context: [contextItem({ required, url: "https://169.254.169.254/latest/meta-data" })],
    });
    assert.equal(sectionState(d, "context"), "review");
  }
  const ok = draft({ context: [contextItem({ url: "https://acme.com/pricing" })] });
  assert.equal(sectionState(ok, "context"), "ok");
});

test("an agent that acts on its own with no daily ceiling is the one blocking case", () => {
  const uncapped = draft({
    boundaries: { ...draft().boundaries, autonomy: "auto", dailyActionLimit: 0 },
  });
  assert.equal(sectionState(uncapped, "boundaries"), "review");
  const capped = draft({
    boundaries: { ...draft().boundaries, autonomy: "auto", dailyActionLimit: 50 },
  });
  assert.equal(sectionState(capped, "boundaries"), "ok");
});

test("with no Manager configured no skill can be ticked, and that is not a cross", () => {
  const skill = {
    key: "s1",
    skillId: "id",
    source: "src",
    ownerHandle: "@anthropic",
    slug: "web-research",
    version: null,
    displayName: "web-research",
    purpose: "Searches the web",
    riskLevel: "low" as const,
    riskAccepted: false,
    harnessCompatible: true,
    requirements: {},
    required: true,
    rankScore: 1,
    rankReasons: [],
  };
  assert.equal(compatState(skill, "unconfigured"), "unknown");
  assert.equal(compatState(skill, "mock"), "unknown");
  assert.equal(compatState(skill, "live"), "ok");
  assert.equal(compatState({ ...skill, harnessCompatible: false }, "live"), "no");

  const d = draft({ skills: [skill] });
  assert.equal(sectionState(d, "skills", "unconfigured"), "review");
  assert.equal(sectionState(d, "skills", "live"), "ok");
});

test("reviewCount counts empty as well — an agent with no rules disappoints", () => {
  const states = sectionStates(draft(), "unconfigured");
  assert.equal(states.context, "empty");
  assert.equal(states.skills, "empty");
  assert.equal(states.schedules, "empty");
  assert.equal(reviewCount(states), 3);
});

// ---------------------------------------------------------------------------
// 5. Provenance and the banners
// ---------------------------------------------------------------------------

test("the hybrid banner never names a stage that is deterministic by design", () => {
  const named = fallbackStages([
    trace("intake", "rules", "ok"),
    trace("lint", "rules", "ok"),
    trace("finalize", "rules", "ok"),
    trace("assemble", "rules", "ok"),
    trace("charter", "llm", "ok"),
    trace("skills", "db", "fallback"),
    trace("schedules", "rules", "ok"),
  ]);
  assert.deepEqual(named, ["skills", "schedules"]);
});

test("a deterministic draft is capped at medium however clean it looks", () => {
  const d = draft();
  assert.equal(draftConfidence(d), "high");
  assert.equal(
    draftConfidence(draft({ provenance: { ...d.provenance, mode: "deterministic" } })),
    "medium",
  );
  assert.equal(
    draftConfidence(draft({ provenance: { ...d.provenance, mode: "hybrid" } })),
    "medium",
  );
  assert.equal(
    draftConfidence(
      draft({
        provenance: {
          ...d.provenance,
          warnings: [
            { code: "E", severity: "error", path: "/", message: "m", remediation: null, remediated: false },
          ],
        },
      }),
    ),
    "low",
  );
  // A remediated error is not an error any more.
  assert.equal(
    draftConfidence(
      draft({
        provenance: {
          ...d.provenance,
          warnings: [
            { code: "E", severity: "error", path: "/", message: "m", remediation: null, remediated: true },
          ],
        },
      }),
    ),
    "high",
  );
});

test("the ledger renders whatever stage ids the server sent, in that order", () => {
  const rows = stageRows(
    ["intake", "charter", "skills"],
    new Map([["intake", { outcome: "ok" as const, durationMs: 400 }]]),
    "charter",
  );
  assert.deepEqual(
    rows.map((r) => [r.stage, r.status]),
    [
      ["intake", "done"],
      ["charter", "active"],
      ["skills", "pending"],
    ],
  );
});

test("a half-written generations row is 'still generating', not a white screen", () => {
  assert.equal(isDraftLike(draft()), true);
  assert.equal(isDraftLike(null), false);
  assert.equal(isDraftLike({}), false);
  assert.equal(isDraftLike({ ...draft(), roles: undefined }), false);
  assert.equal(isDraftLike({ ...draft(), provenance: { generationId: "g" } }), false);
  assert.equal(isDraftLike({ ...draft(), boundaries: { autonomy: "ask" } }), false);
});

// ---------------------------------------------------------------------------
// 6. Untrusted text and the upload gate
// ---------------------------------------------------------------------------

test("an invisible reordering character never reaches the DOM", () => {
  // A filename that renders as "annexcod.exe" in every browser.
  assert.equal(sanitizeUntrusted("annex‮exe.doc"), "annexexe.doc");
  assert.equal(sanitizeUntrusted("a b​c﻿d"), "abcd");
  assert.equal(sanitizeUntrusted("  lots   of \n space  "), "lots of space");
  assert.equal(sanitizeUntrusted("x".repeat(50), 10), `${"x".repeat(9)}…`);
});

test("a 40 MB .exe is rejected for being an .exe — the answer that tells you something", () => {
  const opts = { maxBytes: 10_000_000, usedBytes: 0, itemCount: 0, existingTitles: [] };
  const exe = acceptFile({ name: "payload.exe", type: "application/x-msdownload", size: 40e6 }, opts);
  assert.equal(exe.ok, false);
  assert.equal(exe.ok === false && exe.code, "type");
});

test("the client mirrors the server's ceiling and never widens it", () => {
  const opts = { maxBytes: 50_000_000, usedBytes: 0, itemCount: 0, existingTitles: [] };
  // 50 MB was asked for; the platform ceiling is 20 MB and wins.
  const big = acceptFile({ name: "a.pdf", type: "application/pdf", size: 25e6 }, opts);
  assert.equal(big.ok === false && big.code, "size");
});

test("a bidi-disguised duplicate is still a duplicate", () => {
  const first = acceptFile(
    { name: "ICP.md", type: "", size: 100 },
    { maxBytes: 10e6, usedBytes: 0, itemCount: 0, existingTitles: ["‪ICP.md"] },
  );
  assert.equal(first.ok === false && first.code, "duplicate");
});

test("the per-agent quota is enforced before the upload starts", () => {
  const quota = acceptFile(
    { name: "a.pdf", type: "application/pdf", size: 1000 },
    { maxBytes: 10e6, usedBytes: 0, itemCount: 50, existingTitles: [] },
  );
  assert.equal(quota.ok === false && quota.code, "quota");
});

test("an extension rescues a mime the browser refused to name", () => {
  const md = acceptFile(
    { name: "notes.md", type: "application/octet-stream", size: 100 },
    { maxBytes: 10e6, usedBytes: 0, itemCount: 0, existingTitles: [] },
  );
  assert.equal(md.ok, true);
  assert.equal(md.ok === true && md.mime, "text/markdown");
});

// ---------------------------------------------------------------------------
// 7. The dictionary
// ---------------------------------------------------------------------------

const LANGS: Lang[] = ["en", "zh", "zht", "ja"];

/** Every key path in a dictionary, so a missing branch is named, not counted. */
function paths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => paths(item, `${prefix}[${i}]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

test("all four languages carry exactly the same keys, arrays included", () => {
  const base = paths(create.en).sort();
  for (const lang of LANGS.slice(1)) {
    assert.deepEqual(paths(create[lang]).sort(), base, `${lang} drifted from en`);
  }
});

test("no dictionary leaks English into a CJK locale", () => {
  const CJK = /[぀-ヿ㐀-䶿一-鿿]/;
  for (const lang of ["zh", "zht", "ja"] as const) {
    for (const [path, value] of walk(create[lang])) {
      // Ids, format templates and proper nouns are exempt: `starters[].id` is a
      // React key, `example.outcome[].key` is a `SectionKeyName` enum value that
      // looks up the localised section heading, and "Slack" is "Slack" in every
      // language. The test below pins those keys across locales, which is what
      // makes exempting them safe.
      if (/\.(id|key)$/.test(path) || path.startsWith("entry.cta")) continue;
      if (typeof value !== "string" || value.length < 6) continue;
      if (!/[A-Za-z]{4}/.test(value)) continue;
      assert.ok(CJK.test(value), `${lang}.${path} reads as English: ${value}`);
    }
  }
});

test("a week has seven days in every language, and the starters match", () => {
  for (const lang of LANGS) {
    assert.equal(create[lang].schedules.dayNames.length, 7, lang);
    assert.equal(create[lang].schedules.dayNamesLong.length, 7, lang);
    assert.equal(create[lang].describe.starters.length, create.en.describe.starters.length, lang);
    assert.equal(create[lang].describe.lostPrompts.length, create.en.describe.lostPrompts.length);
  }
});

test("the worked example's section keys are identical across languages", () => {
  // These are `SectionKeyName` values, not copy — they resolve to the localised
  // section heading at render time. The leak detector above exempts `.key` on
  // exactly that basis, so if they ever diverged the exemption would be hiding
  // real untranslated copy.
  const keys = create.en.describe.example.outcome.map((o) => o.key);
  assert.deepEqual([...new Set(keys)].length, keys.length, "duplicate section key");
  for (const lang of LANGS) {
    assert.deepEqual(
      create[lang].describe.example.outcome.map((o) => o.key),
      keys,
      `${lang} example outcome keys drifted`,
    );
  }
});

test("the starter ids are stable and identical across languages — they are React keys", () => {
  const ids = create.en.describe.starters.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const lang of LANGS) {
    assert.deepEqual(create[lang].describe.starters.map((s) => s.id), ids, lang);
  }
});

test("every stage the pipeline can emit has a label in every language", () => {
  const stages = [
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
  ] as const;
  for (const lang of LANGS) {
    for (const stage of stages) {
      assert.ok(create[lang].generating.stages[stage], `${lang}/${stage}`);
    }
  }
});

/** Depth-first walk yielding `[dottedPath, leaf]` for every string leaf. */
function* walk(value: unknown, prefix = ""): Generator<[string, unknown]> {
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) yield* walk(item, `${prefix}[${i}]`);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) yield* walk(v, prefix ? `${prefix}.${k}` : k);
    return;
  }
  yield [prefix, value];
}

function trace(
  stage: AgentTemplateDraft["provenance"]["stages"][number]["stage"],
  engine: AgentTemplateDraft["provenance"]["stages"][number]["engine"],
  outcome: AgentTemplateDraft["provenance"]["stages"][number]["outcome"],
) {
  return {
    stage,
    engine,
    model: null,
    startedAt: "2026-08-30T00:00:00.000Z",
    durationMs: 100,
    attempts: 1,
    outcome,
    promptTokens: 0,
    completionTokens: 0,
    errorCode: null,
  };
}
