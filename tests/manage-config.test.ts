/**
 * The management surface's pure logic — the dirty diff of E.3 and the validators
 * of E.4. Three things here are load-bearing and nothing else in the vertical
 * would catch them:
 *
 * First, the unsaved-changes COUNT. `flattenConfig` projects ten dotted paths per
 * schedule, so a set-difference over the flattened maps reports a single "add
 * schedule" as eleven unsaved changes and a single delete as three. The whole
 * reason the projection is keyed on row id — rather than on array index — is that
 * a counter nobody believes is worse than no counter, and only these tests pin
 * that a row is one change.
 *
 * Second, the validators feed a translated string with `{token}` holes, and `mt()`
 * renders a missing param as the empty string. A validator that supplies `{len}`
 * against a dictionary that interpolates `{over}` produces "Too long by
 *  characters" in all four languages and throws nothing at all. The parameter
 * cross-check below is the only thing standing between that and a customer.
 *
 * Third, `cronUnsupportedReason` decides which of two messages a rejected cron
 * gets. It hunts for the Quartz tokens `L`, `W` and `#` — which also live inside
 * the month and day names `parseCron` accepts, so `MON-WED` and `JUL` must not be
 * refused for spelling.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTEXT_MIME_ALLOWLIST,
  LIMITS,
  activeSkills,
  changedPaths,
  contextUsage,
  countBySection,
  cronUnsupportedReason,
  deepEqual,
  draftId,
  formatBytes,
  formatInterval,
  isAllowedContextMime,
  isDraftId,
  isValidTimeZoneSafe,
  needsRecheck,
  sectionOfPath,
  totalOf,
  validateBoundaries,
  validateContextText,
  validateContextUpload,
  validateContextUrl,
  validateManaged,
  validateRules,
  validateSchedule,
  validateSkills,
} from "../components/manage/logic";
import type { ErrCode, FieldError } from "../components/manage/logic";
import type {
  AgentSkillRow,
  ContextItemRow,
  ManagedConfig,
  RuleRow,
  ScheduleRow,
} from "../components/manage/types";
import { manage, mt } from "../lib/i18n/manage";
import type { Lang } from "../lib/types";

const LANGS: Lang[] = ["en", "zh", "zht", "ja"];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function rule(id: string, over: Partial<RuleRow> = {}): RuleRow {
  return { id, kind: "must", text: `rule ${id}`, sortOrder: 0, ...over };
}

function schedule(id: string, over: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id,
    name: `schedule ${id}`,
    kind: "cron",
    cronExpr: "0 9 * * 1-5",
    intervalSeconds: null,
    runAt: null,
    timezone: "Asia/Taipei",
    prompt: "Summarise yesterday's tickets.",
    deliverTo: "chat",
    maxRunsPerDay: 4,
    enabled: true,
    nextRunAt: null,
    lastRunAt: null,
    lastStatus: null,
    ...over,
  };
}

function skill(id: string, over: Partial<AgentSkillRow> = {}): AgentSkillRow {
  return {
    id,
    skillId: `sk_${id}`,
    slug: "pdf-fill",
    ownerHandle: "anthropic",
    source: "anthropic",
    publicId: `anthropic/pdf-fill@${id}`,
    version: "1.4.0",
    name: "PDF Fill",
    summary: null,
    riskLevel: "low",
    riskLevelAtAttach: "low",
    riskAcknowledged: false,
    enabled: true,
    state: "installed",
    installError: null,
    installSource: "live",
    assertedHarness: "openclaw",
    compatAsserted: true,
    compatBasis: "asserted",
    unmetRequirements: [],
    blocked: false,
    updateAvailable: null,
    ...over,
  };
}

function contextItem(id: string, over: Partial<ContextItemRow> = {}): ContextItemRow {
  return {
    id,
    kind: "file",
    title: `doc ${id}`,
    mime: "text/plain",
    bytes: 1_000,
    sourceUrl: null,
    state: "indexed",
    stateError: null,
    chunks: 3,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

function config(over: Partial<ManagedConfig> = {}): ManagedConfig {
  return {
    configRevision: 14,
    rules: [rule("r1"), rule("r2", { kind: "never" })],
    autonomy: {
      level: "ask",
      approvalAmount: 50,
      approveExternalSends: true,
      dailyActionLimit: 20,
    },
    skills: [skill("as1")],
    context: [contextItem("ci1")],
    schedules: [schedule("s1")],
    engine: "openclaw",
    managerMode: "live",
    ...over,
  };
}

/** Structured clone without depending on the runtime's own deep-copy helper. */
function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

// ---------------------------------------------------------------------------
// E.3 — dirty means DIFFERENT, and a row is ONE change
// ---------------------------------------------------------------------------

test("an untouched config is clean, and a round-tripped edit is clean again", () => {
  const base = config();
  assert.deepEqual(changedPaths(base, clone(base)), []);

  const draft = clone(base);
  draft.rules[0]!.text = "rule r1!";
  assert.deepEqual(changedPaths(base, draft), ["rules.r1.text"]);

  // Typing a character and deleting it clears the dot — E.3 rule 1.
  draft.rules[0]!.text = "rule r1";
  assert.deepEqual(changedPaths(base, draft), []);
});

test("adding a schedule is ONE change, not one per projected field", () => {
  const base = config();
  const draft = clone(base);
  draft.schedules.push(schedule("s2"));
  // Ten field paths plus the membership path would be eleven.
  assert.deepEqual(changedPaths(base, draft), ["schedules.s2"]);
});

test("deleting a rule is ONE change, not one per column", () => {
  const base = config();
  const draft = clone(base);
  draft.rules = [draft.rules[0]!];
  assert.deepEqual(changedPaths(base, draft), ["rules.r2"]);
});

test("reordering rules is one change, and appending one is not also a reorder", () => {
  const base = config();

  const reordered = clone(base);
  reordered.rules = [reordered.rules[1]!, reordered.rules[0]!];
  assert.deepEqual(changedPaths(base, reordered), ["rules.order"]);

  const appended = clone(base);
  appended.rules.push(rule("r3"));
  assert.deepEqual(changedPaths(base, appended), ["rules.r3"]);
});

test("skills, context and schedules are unordered — moving them is not an edit", () => {
  const base = config({
    skills: [skill("a"), skill("b")],
    context: [contextItem("x"), contextItem("y")],
    schedules: [schedule("p"), schedule("q")],
  });
  const draft = clone(base);
  draft.skills.reverse();
  draft.context.reverse();
  draft.schedules.reverse();
  assert.deepEqual(changedPaths(base, draft), []);
});

test("an edit and an add on the same section stay separate changes", () => {
  const base = config();
  const draft = clone(base);
  draft.schedules[0]!.prompt = "Something else entirely.";
  draft.schedules.push(schedule("s2"));
  assert.deepEqual(changedPaths(base, draft), ["schedules.s1.prompt", "schedules.s2"]);
});

test("autonomy counts against RULES, because that is the card it lives in", () => {
  const base = config();
  const draft = clone(base);
  draft.autonomy.level = "auto";
  draft.autonomy.dailyActionLimit = 5;
  draft.skills[0]!.enabled = false;

  const counts = countBySection(changedPaths(base, draft));
  assert.equal(counts.rules, 2);
  assert.equal(counts.skills, 1);
  assert.equal(counts.context, 0);
  assert.equal(counts.schedules, 0);
  assert.equal(totalOf(counts), 3);
});

test("every path the diff can emit resolves to a section", () => {
  const base = config();
  const draft = clone(base);
  draft.rules[0]!.kind = "escalate";
  draft.rules.push(rule("r9"));
  draft.autonomy.approvalAmount = 0;
  draft.skills[0]!.version = "2.0.0";
  draft.context.push(contextItem("ci2"));
  draft.schedules[0]!.maxRunsPerDay = 9;
  const paths = changedPaths(base, draft);
  assert.ok(paths.length >= 6);
  for (const p of paths) assert.notEqual(sectionOfPath(p), null, `${p} has no section`);
});

test("deepEqual reads structure, not identity, and does not confuse null with {}", () => {
  assert.ok(deepEqual({ a: [1, { b: null }] }, { a: [1, { b: null }] }));
  assert.ok(!deepEqual({ a: 1 }, { a: 1, b: undefined }));
  assert.ok(!deepEqual(null, {}));
  assert.ok(!deepEqual([1, 2], [2, 1]));
});

// ---------------------------------------------------------------------------
// E.4 — validation, and the parameters the copy actually interpolates
// ---------------------------------------------------------------------------

test("a rule must say something, and 281 characters is one too many", () => {
  const ok = validateRules([rule("r1", { text: "  spaced  " })]);
  assert.deepEqual(Object.keys(ok), []);

  const blank = validateRules([rule("r1", { text: "   " })]);
  assert.equal(blank["rules.r1.text"]?.code, "errRuleEmpty");

  const long = validateRules([rule("r1", { text: "x".repeat(LIMITS.ruleTextMax + 3) })]);
  assert.equal(long["rules.r1.text"]?.code, "errRuleLong");
  // The dictionary says "too long by {over}", so `over` is the number it needs.
  assert.equal(long["rules.r1.text"]?.params?.over, 3);
});

test("boundaries take whole numbers, and reject the shapes a text input produces", () => {
  assert.deepEqual(Object.keys(validateBoundaries({ approvalAmount: 0, dailyActionLimit: 0 })), []);
  const bad = validateBoundaries({ approvalAmount: 1.5, dailyActionLimit: -1 });
  assert.equal(bad["autonomy.approvalAmount"]?.code, "errApprovalInt");
  assert.equal(bad["autonomy.dailyActionLimit"]?.code, "errLimitInt");
  assert.equal(
    validateBoundaries({ approvalAmount: Number.NaN, dailyActionLimit: 3 })[
      "autonomy.approvalAmount"
    ]?.code,
    "errApprovalInt",
  );
});

test("cron names are not Quartz tokens — MON-WED and JUL must survive", () => {
  assert.equal(cronUnsupportedReason("0 9 * * MON-WED"), null);
  assert.equal(cronUnsupportedReason("0 0 1 JUL *"), null);
  assert.equal(cronUnsupportedReason("*/15 * * * SAT,SUN"), null);
  assert.equal(cronUnsupportedReason("0 9 * * 1-5"), null);
});

test("the forms cron cannot express get named rather than mislabelled", () => {
  assert.equal(cronUnsupportedReason("@daily"), "@daily");
  assert.equal(cronUnsupportedReason("0 0 9 * * *"), "seconds");
  assert.equal(cronUnsupportedReason("0 9 L * *"), "L");
  assert.equal(cronUnsupportedReason("0 9 15W * *"), "W");
  assert.equal(cronUnsupportedReason("0 9 * * 6#3"), "#");
  assert.equal(cronUnsupportedReason("   "), null);
});

test("a cron schedule is judged on its expression, an interval on its floor", () => {
  assert.deepEqual(Object.keys(validateSchedule(schedule("s"))), []);

  const badCron = validateSchedule(schedule("s", { cronExpr: "0 9 * *" }));
  assert.equal(badCron["cronExpr"]?.code, "errCron");
  assert.ok(badCron["cronExpr"]?.detail, "the parser's own words are kept for the log");

  const unsupported = validateSchedule(schedule("s", { cronExpr: "@hourly" }));
  assert.equal(unsupported["cronExpr"]?.code, "errCronUnsupported");
  assert.equal(unsupported["cronExpr"]?.params?.token, "@hourly");

  const tooFast = validateSchedule(
    schedule("s", { kind: "interval", cronExpr: null, intervalSeconds: 30 }),
  );
  assert.equal(tooFast["intervalSeconds"]?.code, "errInterval");
  assert.deepEqual(
    Object.keys(
      validateSchedule(
        schedule("s", { kind: "interval", cronExpr: null, intervalSeconds: LIMITS.scheduleIntervalMin }),
      ),
    ),
    [],
  );
});

test("a one-shot that already fired does not brick Save for the whole config", () => {
  const now = new Date("2026-08-30T12:00:00.000Z");
  const past = "2026-08-01T09:00:00.000Z";

  const pending = validateSchedule(
    schedule("s", { kind: "once", cronExpr: null, runAt: past }),
    now,
  );
  assert.equal(pending["runAt"]?.code, "errRunAtPast", "a live one-shot in the past is an error");

  const fired = validateSchedule(
    schedule("s", { kind: "once", cronExpr: null, runAt: past, lastRunAt: past }),
    now,
  );
  assert.equal(fired["runAt"], undefined, "it ran; its run_at is history, not a mistake");

  const paused = validateSchedule(
    schedule("s", { kind: "once", cronExpr: null, runAt: past, enabled: false }),
    now,
  );
  assert.equal(paused["runAt"], undefined, "a paused one-shot cannot fire, so it cannot be late");

  const missing = validateSchedule(schedule("s", { kind: "once", cronExpr: null, runAt: null }), now);
  assert.equal(missing["runAt"]?.code, "errRunAt");
});

test("timezone validation accepts IANA link names, which supportedValuesOf omits", () => {
  assert.ok(isValidTimeZoneSafe("Asia/Calcutta"));
  assert.ok(isValidTimeZoneSafe("UTC"));
  assert.ok(!isValidTimeZoneSafe("Mars/Olympus"));
  assert.equal(
    validateSchedule(schedule("s", { timezone: "Mars/Olympus" }))["timezone"]?.code,
    "errTimezone",
  );
});

test("a detached skill stops counting, against the cap and against the risk gate", () => {
  const rows = [
    ...Array.from({ length: LIMITS.skillCountMax }, (_, i) => skill(`a${i}`, { state: "removed" })),
    skill("live", { riskLevel: "high" }),
  ];
  assert.equal(activeSkills(rows).length, 1);
  const errors = validateSkills(rows);
  assert.equal(errors["skills"], undefined, "twelve detached skills are not twelve attached ones");
  assert.equal(errors["skills.live.riskAcknowledged"]?.code, "errSkillRisk");

  const acked = validateSkills([skill("live", { riskLevel: "high", riskAcknowledged: true })]);
  assert.deepEqual(Object.keys(acked), []);
});

test("risk is judged on the CURRENT level, not the level at attach time", () => {
  const promoted = skill("x", {
    riskLevelAtAttach: "low",
    riskLevel: "high",
    riskAcknowledged: false,
  });
  assert.equal(validateSkills([promoted])["skills.x.riskAcknowledged"]?.code, "errSkillRisk");
});

test("a skill asserted against another harness needs a re-check, unless it is gone", () => {
  assert.ok(needsRecheck(skill("x", { assertedHarness: "codex" }), "openclaw"));
  assert.ok(!needsRecheck(skill("x", { assertedHarness: "openclaw" }), "openclaw"));
  assert.ok(!needsRecheck(skill("x", { assertedHarness: "codex", state: "removed" }), "openclaw"));
});

// ---------------------------------------------------------------------------
// Context — the three kinds, all of which reach the same quota
// ---------------------------------------------------------------------------

test("an unknown MIME is refused rather than guessed", () => {
  assert.ok(isAllowedContextMime("text/plain"));
  assert.ok(isAllowedContextMime("Text/Markdown; charset=utf-8"), "parameters and case are noise");
  assert.ok(!isAllowedContextMime(""));
  assert.ok(!isAllowedContextMime(null));
  assert.ok(!isAllowedContextMime("application/x-msdownload"));
  assert.ok(CONTEXT_MIME_ALLOWLIST.includes("application/pdf"));
});

test("the per-file cap is the number the error message prints", () => {
  const at = validateContextUpload(
    { name: "a.txt", size: LIMITS.contextItemMaxBytes, type: "text/plain" },
    [],
  );
  assert.equal(at, null);

  const over = validateContextUpload(
    { name: "a.txt", size: LIMITS.contextItemMaxBytes + 1, type: "text/plain" },
    [],
  );
  assert.equal(over?.code, "errContextTooLarge");
  // Base-10 throughout: `formatBytes` prints MB, so the cap is MB, not MiB.
  assert.equal(over?.params?.maxMb, 20);
  assert.equal(formatBytes(LIMITS.contextItemMaxBytes), "20 MB");
});

test("an empty or nameless file never starts an upload", () => {
  assert.equal(validateContextUpload({ name: " ", size: 10, type: "text/plain" }, [])?.code, "errContextName");
  assert.equal(validateContextUpload({ name: "a.txt", size: 0, type: "text/plain" }, [])?.code, "errContextEmpty");
  assert.equal(
    validateContextUpload({ name: "a.exe", size: 10, type: "" }, [])?.code,
    "errContextType",
  );
});

test("the quota counts live items only, and is checked before the byte is sent", () => {
  const removed = Array.from({ length: 60 }, (_, i) =>
    contextItem(`gone${i}`, { state: "removed", bytes: 5_000_000 }),
  );
  assert.deepEqual(contextUsage(removed), { count: 0, bytes: 0 });

  const full = Array.from({ length: LIMITS.contextItemCountMax }, (_, i) => contextItem(`c${i}`));
  assert.equal(
    validateContextUpload({ name: "one-more.txt", size: 10, type: "text/plain" }, full)?.code,
    "errContextQuota",
  );

  const heavy = [contextItem("big", { bytes: LIMITS.contextTotalMaxBytes })];
  assert.equal(
    validateContextUpload({ name: "a.txt", size: 1, type: "text/plain" }, heavy)?.code,
    "errContextQuota",
  );
});

test("pasted text has a limit, and an empty paste is not a context item", () => {
  assert.equal(validateContextText("   ", [])?.code, "errContextEmpty");
  assert.equal(validateContextText("hello", []), null);

  const long = validateContextText("x".repeat(LIMITS.contextTextMax + 1), []);
  assert.equal(long?.code, "errContextTextLong");
  assert.equal(long?.params?.max, LIMITS.contextTextMax);

  // One CJK character is three bytes: the quota must be charged on the encoding,
  // not on `String.length`, or a Chinese paste is under-counted threefold.
  const nearlyFull = [contextItem("big", { bytes: LIMITS.contextTotalMaxBytes - 100 })];
  assert.equal(validateContextText("字".repeat(40), nearlyFull)?.code, "errContextQuota");
  assert.equal(validateContextText("字".repeat(10), nearlyFull), null);
});

test("a context URL is checked against a scheme allowlist, and never carries a credential", () => {
  assert.equal(validateContextUrl("https://example.com/policy.pdf"), null);
  assert.equal(validateContextUrl("  http://example.com/x  "), null);
  assert.equal(validateContextUrl("javascript:alert(1)")?.code, "errContextUrl");
  assert.equal(validateContextUrl("data:text/html,<script>")?.code, "errContextUrl");
  assert.equal(validateContextUrl("file:///etc/passwd")?.code, "errContextUrl");
  assert.equal(validateContextUrl("not a url")?.code, "errContextUrl");
  assert.equal(
    validateContextUrl("https://user:sk-secret@example.com/x")?.code,
    "errContextUrl",
    "a token in the authority would be stored, echoed back and handed to the runtime",
  );
});

// ---------------------------------------------------------------------------
// The validators and the dictionary have to agree — in all four languages
// ---------------------------------------------------------------------------

/** Every distinct error the validators can raise, with the params they attach. */
function everyError(): FieldError[] {
  const now = new Date("2026-08-30T12:00:00.000Z");
  const cfg = config({
    rules: [
      rule("empty", { text: "" }),
      rule("long", { text: "x".repeat(LIMITS.ruleTextMax + 7) }),
      ...Array.from({ length: LIMITS.ruleCountMax }, (_, i) => rule(`r${i}`)),
    ],
    autonomy: {
      level: "auto",
      approvalAmount: -1,
      approveExternalSends: false,
      dailyActionLimit: 2.5,
    },
    skills: [
      ...Array.from({ length: LIMITS.skillCountMax + 1 }, (_, i) => skill(`s${i}`)),
      skill("risky", { riskLevel: "high" }),
    ],
    context: Array.from({ length: LIMITS.contextItemCountMax + 1 }, (_, i) => contextItem(`c${i}`)),
    schedules: [
      schedule("bad", {
        name: "",
        prompt: "",
        cronExpr: "0 9 * *",
        timezone: "Mars/Olympus",
        maxRunsPerDay: 0,
      }),
      schedule("shorthand", { cronExpr: "@daily" }),
      schedule("fast", { kind: "interval", cronExpr: null, intervalSeconds: 1 }),
      schedule("once", { kind: "once", cronExpr: null, runAt: null }),
      schedule("late", { kind: "once", cronExpr: null, runAt: "2020-01-01T00:00:00.000Z" }),
    ],
  });

  const out = Object.values(validateManaged(cfg, now));
  out.push(
    validateContextUpload({ name: " ", size: 1, type: "text/plain" }, [])!,
    validateContextUpload({ name: "a.txt", size: 0, type: "text/plain" }, [])!,
    validateContextUpload({ name: "a.txt", size: 1e12, type: "text/plain" }, [])!,
    validateContextUpload({ name: "a.bin", size: 1, type: "application/octet-stream" }, [])!,
    validateContextText("x".repeat(LIMITS.contextTextMax + 1), [])!,
    validateContextUrl("javascript:alert(1)")!,
  );
  return out;
}

test("the fixture actually raises every error code the vertical can produce", () => {
  const raised = new Set(everyError().map((e) => e.code));
  const declared: ErrCode[] = [
    "errRuleEmpty",
    "errRuleLong",
    "errRuleCount",
    "errApprovalInt",
    "errLimitInt",
    "errScheduleName",
    "errSchedulePrompt",
    "errCron",
    "errCronUnsupported",
    "errTimezone",
    "errInterval",
    "errRunAt",
    "errRunAtPast",
    "errMaxRuns",
    "errContextTooLarge",
    "errContextType",
    "errContextQuota",
    "errContextEmpty",
    "errContextName",
    "errContextTextLong",
    "errContextUrl",
    "errSkillCount",
    "errSkillRisk",
  ];
  for (const code of declared) assert.ok(raised.has(code), `nothing raises ${code}`);
});

test("no error message renders with an empty hole in any language", () => {
  for (const err of everyError()) {
    for (const lang of LANGS) {
      const template = manage[lang][err.code];
      const rendered = mt(template, err.params);
      assert.doesNotMatch(
        rendered,
        /\{\w+\}/,
        `${lang}.${err.code} left a placeholder: ${rendered}`,
      );
      for (const token of template.match(/\{(\w+)\}/g) ?? []) {
        const key = token.slice(1, -1);
        assert.notEqual(
          err.params?.[key],
          undefined,
          `${lang}.${err.code} interpolates ${token} but the validator never supplies it`,
        );
      }
      assert.doesNotMatch(rendered, /\s\s|\s[.,。、]/, `${lang}.${err.code} reads: ${rendered}`);
    }
  }
});

test("all four languages carry the same keys and the same placeholders", () => {
  const keys = Object.keys(manage.en).sort();
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(manage[lang]).sort(), keys, `${lang} has a different key set`);
    for (const key of keys) {
      const k = key as keyof (typeof manage)["en"];
      const holes = (s: string) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort();
      assert.deepEqual(
        holes(manage[lang][k]),
        holes(manage.en[k]),
        `${lang}.${key} interpolates a different set of values than English`,
      );
      assert.ok(manage[lang][k].trim().length > 0, `${lang}.${key} is blank`);
    }
  }
});

test("no dictionary leaks an English sentence into a CJK locale", () => {
  const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;
  for (const lang of LANGS.filter((l) => l !== "en")) {
    for (const [key, value] of Object.entries(manage[lang])) {
      const prose = value.replace(/\{\w+\}/g, "");
      // A run of four or more Latin letters with no CJK anywhere is a sentence
      // nobody translated; a bare "Cron", "API" or "URL" is the term itself.
      const words = prose.match(/[A-Za-z]{4,}/g) ?? [];
      if (words.length >= 2 && !CJK.test(value)) {
        assert.fail(`${lang}.${key} is still English: ${value}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Formatters and draft ids
// ---------------------------------------------------------------------------

test("byte sizes are base-10, and zero is zero rather than NaN", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(-5), "0 B");
  assert.equal(formatBytes(Number.NaN), "0 B");
  assert.equal(formatBytes(999), "999 B");
  assert.equal(formatBytes(1_000), "1 KB");
  assert.equal(formatBytes(1_500_000), "1.5 MB");
  assert.equal(formatBytes(20_000_000), "20 MB");
});

test("an interval reads in the largest unit that stays honest", () => {
  assert.equal(formatInterval(0), "—");
  assert.equal(formatInterval(Number.NaN), "—");
  assert.equal(formatInterval(45), "45s");
  assert.equal(formatInterval(720), "12m");
  assert.equal(formatInterval(7_200), "2h");
  assert.equal(formatInterval(86_400), "1d");
});

test("a draft id is recognisable, and a server id is never mistaken for one", () => {
  const id = draftId("schedule");
  assert.ok(isDraftId(id));
  assert.ok(!isDraftId("7f3e6b1a-2c4d-4e8f-9a0b-1c2d3e4f5a6b"));
  assert.notEqual(draftId("schedule"), draftId("schedule"));
});
