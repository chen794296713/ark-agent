/**
 * The row -> DTO boundary, where three bug classes live and none of them is a
 * type error:
 *
 *  1. **A driver string treated as a number.** postgres.js returns `int8` and
 *     `numeric` as JavaScript STRINGS. `sql<number>` is a claim, not a cast, so
 *     `a + b` concatenates and the view renders a plausible wrong figure. Every
 *     numeric coercion here is asserted with `strictEqual` against a number,
 *     which fails on `"5"`.
 *  2. **Zero conflated with unknown.** `cost_micro_usd` defaults to 0 and an
 *     unpriced model also lands at 0. One means free, the other means we do not
 *     know, and rendering `$0.00` for the second tells a customer their agent
 *     costs nothing.
 *  3. **Untrusted text taking a shortcut into the DTO.** `summary`, `text`,
 *     `title`, `detail` and every `params` value are third-party. They must
 *     arrive as inert primitives — never a boolean or an object the renderer
 *     would stringify into `[object Object]` in a Japanese feed.
 *
 * Pure functions only: no database, no fixtures, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DETAIL_MAX_BYTES,
  coerceParams,
  serializeActivity,
  serializeHealthBucket,
  serializeRun,
  serializeRunDetail,
  serializeRunStep,
  toNumber,
  truncateDetail,
  type RunRow,
  type RunStepRow,
} from "@/lib/activity/serialize";
import {
  ActivityQueryError,
  decodeCursor,
  encodeCursor,
  escapeLike,
  likePattern,
  parseTimelineQuery,
} from "@/lib/activity/validation";
import { pickBucketSeconds } from "@/lib/activity/queries";

const AT = new Date("2026-03-04T05:06:07.000Z");

// ---------------------------------------------------------------------------
// truncateDetail
// ---------------------------------------------------------------------------

test("a detail that fits is returned identically, not copied through a codec", () => {
  const d = "ls -la /srv";
  const out = truncateDetail(d);
  assert.equal(out.detail, d);
  assert.equal(out.truncated, false);
});

test("null detail stays null — absence is not an empty string", () => {
  assert.deepEqual(truncateDetail(null), { detail: null, truncated: false });
});

test("the cap is on BYTES, so a CJK detail is cut three times sooner than an ASCII one", () => {
  // 4 KB of CJK is 12 KB on the wire: under a character cap this passes, and
  // the payload the cap exists to prevent is produced anyway.
  const cjk = "私".repeat(4096);
  assert.ok(cjk.length < DETAIL_MAX_BYTES, "precondition: fits a CHARACTER cap");
  const out = truncateDetail(cjk);
  assert.equal(out.truncated, true, "but must not fit the BYTE cap");
  assert.ok(Buffer.byteLength(out.detail!, "utf8") <= DETAIL_MAX_BYTES);
});

test("cutting mid-character leaves no replacement character in the JSON", () => {
  // 8 KB is not divisible by 3, so this cut lands inside a multi-byte sequence
  // — the case that produces U+FFFD, or a lone surrogate if sliced on the string.
  const out = truncateDetail("漢".repeat(5000));
  assert.equal(out.truncated, true);
  assert.ok(!out.detail!.includes("�"), "no replacement character survives");
  assert.ok(!/[\uD800-\uDFFF]/.test(out.detail!), "and no lone surrogate");
  assert.ok(Buffer.byteLength(out.detail!, "utf8") <= DETAIL_MAX_BYTES);
});

test("a detail of exactly the cap is not truncated — the boundary is inclusive", () => {
  const out = truncateDetail("a".repeat(DETAIL_MAX_BYTES));
  assert.equal(out.truncated, false);
  assert.equal(out.detail!.length, DETAIL_MAX_BYTES);
});

// ---------------------------------------------------------------------------
// coerceParams
// ---------------------------------------------------------------------------

test("params keeps strings and finite numbers and drops everything else", () => {
  const out = coerceParams({
    skill: "web-search",
    count: 3,
    // Dropped: `true` has no localisation and renders as the English word
    // "true" in the Japanese feed.
    ok: true,
    // Dropped: renders as "[object Object]".
    nested: { a: 1 },
    list: [1, 2],
    missing: null,
    nan: Number.NaN,
    inf: Number.POSITIVE_INFINITY,
  });
  assert.deepEqual(out, { skill: "web-search", count: 3 });
});

test("a non-object params column yields an empty bag rather than throwing", () => {
  for (const junk of [null, undefined, "a string", 42, ["a"], true]) {
    assert.deepEqual(coerceParams(junk), {}, `for ${JSON.stringify(junk) ?? "undefined"}`);
  }
});

test("a hostile params key cannot reach the object prototype", () => {
  // The column is third-party JSONB. A `__proto__` key must not become a
  // prototype mutation that leaks into every other object in the process.
  const out = coerceParams(JSON.parse('{"__proto__": "polluted", "safe": "yes"}'));
  assert.equal(out.safe, "yes");
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
});

// ---------------------------------------------------------------------------
// serializeActivity
// ---------------------------------------------------------------------------

const actRow = {
  id: "11111111-1111-4111-8111-111111111111",
  occurredAt: AT,
  tag: "system" as const,
  text: "",
};

test("severity is COMPUTED, and a severity supplied on the row is ignored", () => {
  // The whole point of the taxonomy: an untrusted runtime must not grade its
  // own noise. A row claiming `severity: "error"` on an info code stays info.
  const dto = serializeActivity({
    ...actRow,
    code: "message.sent",
    params: { severity: "error" },
  });
  assert.equal(dto.severity, "info");
});

test("a legacy row has no code, is info, and renders its own text", () => {
  const dto = serializeActivity({ ...actRow, text: "Reviewed the Q3 draft" });
  assert.equal(dto.code, null, "null, not 'custom' — nobody claimed to author it");
  assert.equal(dto.severity, "info");
  assert.equal(dto.text, "Reviewed the Q3 draft");
  assert.deepEqual(dto.params, {});
});

test("an unknown code is coerced to custom rather than rendered raw", () => {
  const dto = serializeActivity({ ...actRow, code: "totally.invented", text: "hi" });
  assert.equal(dto.code, "custom");
  assert.equal(dto.severity, "info");
});

test("run.finished grades on params.status, which is what makes severity variable", () => {
  const sev = (status: string) =>
    serializeActivity({ ...actRow, code: "run.finished", params: { status } }).severity;
  assert.equal(sev("succeeded"), "info");
  assert.equal(sev("failed"), "error");
  assert.equal(sev("timeout"), "error");
  assert.equal(sev("cancelled"), "notice");
  assert.equal(sev("who-knows"), "info", "an unknown status must not manufacture an incident");
});

test("a v2 row keeps its empty text, so the blank-row bug stays visible to this test", () => {
  // A serializer that substituted a placeholder here would hide a renderer that
  // draws `text` without checking `code` first.
  const dto = serializeActivity({ ...actRow, code: "skill.installed", params: { skill: "x" } });
  assert.equal(dto.text, "");
  assert.equal(dto.kind, "activity");
});

test("instants leave as ISO strings and ids are passed through untouched", () => {
  const dto = serializeActivity({ ...actRow, runId: "run-7" });
  assert.equal(dto.occurredAt, "2026-03-04T05:06:07.000Z");
  assert.equal(dto.runId, "run-7");
  assert.equal(serializeActivity(actRow).runId, null, "absent runId is null, not undefined");
});

// ---------------------------------------------------------------------------
// serializeRun — the unpriced/zero distinction
// ---------------------------------------------------------------------------

const runRow: RunRow = {
  id: "22222222-2222-4222-8222-222222222222",
  externalRunId: "run_abc",
  trigger: "schedule",
  triggerRef: "sched-1",
  sessionKey: "sess-1",
  status: "succeeded",
  startedAt: AT,
  finishedAt: new Date("2026-03-04T05:07:07.000Z"),
  durationMs: 60_000,
  stepCount: 4,
  inputTokens: 100,
  outputTokens: 50,
  cacheTokens: 10,
  totalTokens: 160,
  costMicroUsd: 4200,
  model: "anthropic/claude-sonnet-4",
  summary: "Filed the report",
  errorCode: null,
  errorMessage: null,
};

test("a run that reported tokens but priced at zero is UNPRICED, not free", () => {
  // This is the day-one shape of the interim path: the Manager's chat stream
  // carries usage but no price. Rendering `$0.00` here is a lie.
  const dto = serializeRun({ ...runRow, costMicroUsd: 0, totalTokens: 160 });
  assert.equal(dto.usage.unpriced, true);
  assert.equal(dto.usage.costMicroUsd, 0);
});

test("a run that did no model work is priced at zero and is NOT flagged unpriced", () => {
  const dto = serializeRun({ ...runRow, costMicroUsd: 0, totalTokens: 0 });
  assert.equal(dto.usage.unpriced, false);
});

test("a priced run is never flagged unpriced", () => {
  assert.equal(serializeRun(runRow).usage.unpriced, false);
});

test("run severity comes from status, and every status maps", () => {
  const sev = (status: RunRow["status"]) => serializeRun({ ...runRow, status }).severity;
  assert.equal(sev("succeeded"), "info");
  assert.equal(sev("queued"), "info");
  assert.equal(sev("running"), "info");
  assert.equal(sev("cancelled"), "notice");
  assert.equal(sev("failed"), "error");
  assert.equal(sev("timeout"), "error");
});

test("an unfinished run has a null finishedAt rather than an epoch date", () => {
  const dto = serializeRun({ ...runRow, finishedAt: null, durationMs: null, status: "running" });
  assert.equal(dto.finishedAt, null);
  assert.equal(dto.durationMs, null);
  assert.equal(dto.startedAt, "2026-03-04T05:06:07.000Z");
});

test("the DTO is discriminated and exposes the runtime's own id under `runId`", () => {
  const dto = serializeRun(runRow);
  assert.equal(dto.kind, "run");
  assert.equal(dto.id, runRow.id, "`id` stays ArkAgent's uuid");
  assert.equal(dto.runId, "run_abc", "`runId` is the runtime's");
});

// ---------------------------------------------------------------------------
// serializeRunStep
// ---------------------------------------------------------------------------

const stepRow: RunStepRow = {
  id: "33333333-3333-4333-8333-333333333333",
  occurredAt: AT,
  idx: 0,
  phase: "tool_call",
  kind: "shell",
  title: "bash",
  detail: "echo hi",
  status: "ok",
  durationMs: 12,
  inputTokens: 5,
  outputTokens: 7,
};

test("only the literal 'ok' is a success — the column is a varchar the runtime fills", () => {
  // A step reporting a status we have never seen is not a success. Anything
  // else is `error`, including casing variants and optimistic synonyms.
  assert.equal(serializeRunStep(stepRow).status, "ok");
  for (const s of ["OK", "success", "", "ok ", "failed", "unknown"]) {
    assert.equal(serializeRunStep({ ...stepRow, status: s }).status, "error", `status=${s}`);
  }
});

test("a step's oversized detail is truncated and flagged, never silently dropped", () => {
  const dto = serializeRunStep({ ...stepRow, detail: "x".repeat(DETAIL_MAX_BYTES + 10) });
  assert.equal(dto.detailTruncated, true);
  assert.equal(Buffer.byteLength(dto.detail!, "utf8"), DETAIL_MAX_BYTES);
  assert.equal(serializeRunStep(stepRow).detailTruncated, false);
});

test("a step carries its OWN clock, not the run's", () => {
  // Ordering by this instant is the bug the `idx` column exists to prevent, so
  // the field must remain the step's own value for the drawer to show drift.
  const own = new Date("2026-03-04T05:09:00.000Z");
  assert.equal(serializeRunStep({ ...stepRow, occurredAt: own }).occurredAt, own.toISOString());
});

// ---------------------------------------------------------------------------
// serializeRunDetail
// ---------------------------------------------------------------------------

test("a pruned trace is distinguishable from a run that never had steps", () => {
  // Without `stepsPrunedAt` the drawer draws an empty trace, which looks like a
  // bug rather than a retention policy.
  const pruned = new Date("2026-04-01T00:00:00.000Z");
  const dto = serializeRunDetail({ ...runRow, stepsPrunedAt: pruned }, [], { stepsTruncated: false });
  assert.equal(dto.stepsPrunedAt, pruned.toISOString());
  assert.deepEqual(dto.steps, []);

  const never = serializeRunDetail({ ...runRow, stepsPrunedAt: null }, [], { stepsTruncated: false });
  assert.equal(never.stepsPrunedAt, null);
});

test("the detail DTO is a superset of the list DTO, so one row renders in both", () => {
  const detail = serializeRunDetail({ ...runRow, stepsPrunedAt: null }, [stepRow], {
    stepsTruncated: true,
  });
  const list = serializeRun(runRow);
  for (const [k, v] of Object.entries(list)) {
    assert.deepEqual(detail[k as keyof typeof list], v, `field ${k} must not drift`);
  }
  assert.equal(detail.stepsTruncated, true);
  assert.equal(detail.steps.length, 1);
});

test("steps are emitted in the order given — the query orders by idx, not the clock", () => {
  const steps = [2, 0, 1].map((idx) => ({ ...stepRow, idx, id: `id-${idx}` }));
  const dto = serializeRunDetail({ ...runRow, stepsPrunedAt: null }, steps, {
    stepsTruncated: false,
  });
  assert.deepEqual(
    dto.steps.map((s) => s.idx),
    [2, 0, 1],
    "the serializer must not re-sort and hide a broken ORDER BY",
  );
});

// ---------------------------------------------------------------------------
// serializeHealthBucket — the driver-string trap
// ---------------------------------------------------------------------------

test("bigint and numeric aggregates arriving as STRINGS become real numbers", () => {
  // This is the postgres.js behaviour that makes `sql<number>` a lie: count(*)
  // is int8 and avg() is numeric, both delivered as strings. Adding two of them
  // concatenates, and the result renders as a plausible figure.
  const dto = serializeHealthBucket({
    ts: "2026-03-04T05:00:00.000Z",
    state: "running",
    cpu: "37",
    cpuPeak: "91",
    mem: "1048576",
    memLimit: "2097152",
    disk: "500",
    activeRuns: "2",
    samples: "60",
    mockSamples: "0",
    rollupSamples: "0",
  });
  for (const k of ["cpuPercent", "cpuPeak", "memoryBytes", "activeRuns", "samples"] as const) {
    assert.equal(typeof dto[k], "number", `${k} must not stay a string`);
  }
  assert.equal(dto.cpuPercent! + 1, 38, "and must add, not concatenate");
  assert.equal(dto.ts, "2026-03-04T05:00:00.000Z");
});

test("a missing reading stays null — a gap is not a zero", () => {
  // `Number(null)` is 0, which draws a CPU line at the floor and reads as an
  // idle agent instead of a hole in the series.
  const dto = serializeHealthBucket({
    ts: new Date("2026-03-04T05:00:00.000Z"),
    state: null,
    cpu: null,
    cpuPeak: null,
    mem: null,
    memLimit: null,
    disk: null,
    activeRuns: null,
    samples: 0,
    mockSamples: 0,
    rollupSamples: 0,
  });
  assert.equal(dto.cpuPercent, null);
  assert.equal(dto.memoryBytes, null);
  assert.equal(dto.diskUsedBytes, null);
  assert.equal(dto.state, null);
  assert.equal(dto.activeRuns, 0, "but counts floor at 0 rather than null");
  assert.equal(dto.samples, 0);
});

test("a state outside the four the schema knows renders as a gap, not as itself", () => {
  const base = {
    ts: AT,
    cpu: null,
    cpuPeak: null,
    mem: null,
    memLimit: null,
    disk: null,
    activeRuns: 0,
    samples: 1,
    mockSamples: 0,
    rollupSamples: 0,
  };
  assert.equal(serializeHealthBucket({ ...base, state: "on_fire" }).state, null);
  for (const s of ["idle", "running", "stopped", "unhealthy"]) {
    assert.equal(serializeHealthBucket({ ...base, state: s }).state, s);
  }
});

test("mock samples are counted separately so they are never averaged in silently", () => {
  const dto = serializeHealthBucket({
    ts: AT,
    state: "running",
    cpu: "50",
    cpuPeak: "50",
    mem: null,
    memLimit: null,
    disk: null,
    activeRuns: 0,
    samples: "10",
    mockSamples: "10",
    rollupSamples: "0",
  });
  assert.equal(dto.samples, 10);
  assert.equal(dto.mockSamples, 10, "the caller needs this to label the bucket simulated");
});

test("toNumber floors absence at zero for the aggregate mappers", () => {
  assert.equal(toNumber("42"), 42);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber("not-a-number"), 0);
});

// ---------------------------------------------------------------------------
// The cursor codec — the other serialization boundary
// ---------------------------------------------------------------------------

test("a cursor round-trips through base64url", () => {
  const c = { t: "2026-03-04T05:06:07.000Z", k: "run" as const, i: runRow.id };
  assert.deepEqual(decodeCursor(encodeCursor(c)), c);
});

test("no cursor is null, not an error — the first page has none", () => {
  assert.equal(decodeCursor(null), null);
  assert.equal(decodeCursor(undefined), null);
  assert.equal(decodeCursor(""), null);
});

test("a forged cursor is a 400, never a 500 and never a silent restart", () => {
  // Restarting from the head would replay rows the user already read, which is
  // the bug keyset pagination exists to prevent.
  const bad = [
    "not-base64!!",
    Buffer.from("{").toString("base64url"),
    Buffer.from(JSON.stringify({ t: "x", k: "run" })).toString("base64url"),
    // A non-uuid id would reach Drizzle and 22P02 on the ::uuid cast.
    Buffer.from(JSON.stringify({ t: AT.toISOString(), k: "run", i: "1; drop" })).toString("base64url"),
    // An unparseable timestamp would 22007 on the ::timestamptz cast.
    Buffer.from(JSON.stringify({ t: "never", k: "act", i: runRow.id })).toString("base64url"),
    Buffer.from(JSON.stringify({ t: AT.toISOString(), k: "other", i: runRow.id })).toString("base64url"),
  ];
  for (const raw of bad) {
    assert.throws(
      () => decodeCursor(raw),
      (e: unknown) => e instanceof ActivityQueryError && e.status === 400 && e.code === "bad_cursor",
      `must reject ${raw.slice(0, 24)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Filter parsing — unknown values are dropped, structure is rejected
// ---------------------------------------------------------------------------

const qs = (s: string) => new URLSearchParams(s);
const NOW = new Date("2026-03-10T00:00:00.000Z");

test("an unknown filter value is dropped and reported, never a 500", () => {
  // Every one of these lands in `inArray` against a pgEnum, where Postgres
  // answers 22P02 with the enum's full value list in the message.
  const f = parseTimelineQuery(qs("severity=purple&trigger=chat,telepathy&outcome=exploded"), NOW);
  assert.equal(f.severity, null);
  assert.deepEqual(f.trigger, ["chat"], "the recognised member survives");
  assert.equal(f.outcome, null, "all members unknown ⇒ absent, not 'match nothing'");
  assert.deepEqual(f.ignored.sort(), ["outcome=exploded", "severity=purple", "trigger=telepathy"]);
});

test("filters compose, and each lands in its own field", () => {
  const f = parseTimelineQuery(
    qs("severity=error&trigger=schedule,chat&outcome=failed&tag=research&session=s1&run=r1&model=m1&q=report"),
    NOW,
  );
  assert.equal(f.severity, "error");
  assert.deepEqual(f.trigger, ["schedule", "chat"]);
  assert.deepEqual(f.outcome, ["failed"]);
  assert.equal(f.tag, "research");
  assert.equal(f.session, "s1");
  assert.equal(f.run, "r1");
  assert.equal(f.model, "m1");
  assert.equal(f.q, "report");
  assert.deepEqual(f.ignored, []);
});

test("a duplicated filter member is not applied twice", () => {
  const f = parseTimelineQuery(qs("trigger=chat,chat,chat"), NOW);
  assert.deepEqual(f.trigger, ["chat"]);
});

test("a malformed structural parameter is a 4xx with a machine code", () => {
  const cases: [string, string][] = [
    ["from=yesterday", "bad_range"],
    ["from=2026-03-09T00:00:00Z&to=2026-03-01T00:00:00Z", "bad_range"],
    ["from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z", "range_too_wide"],
    ["limit=0", "bad_limit"],
    ["limit=1000", "bad_limit"],
    ["limit=abc", "bad_limit"],
    ["limit=2.5", "bad_limit"],
  ];
  for (const [q, code] of cases) {
    assert.throws(
      () => parseTimelineQuery(qs(q), NOW),
      (e: unknown) => e instanceof ActivityQueryError && e.code === code && e.status === 400,
      `${q} should be ${code}`,
    );
  }
});

test("the window is ALWAYS bounded, so no query can become a full-partition scan", () => {
  const f = parseTimelineQuery(qs(""), NOW);
  assert.equal(f.to.getTime(), NOW.getTime());
  assert.equal(f.from.getTime(), NOW.getTime() - 7 * 86_400_000);
});

test("an unindexed channel filter is refused loudly rather than served slowly", () => {
  // `params->>'channel'` has no index; it is only accepted behind a `type`
  // filter that restricts to the two message codes.
  assert.throws(
    () => parseTimelineQuery(qs("channel=slack"), NOW),
    (e: unknown) => e instanceof ActivityQueryError && e.code === "unsupported_filter",
  );
  const ok = parseTimelineQuery(qs("channel=slack&type=message.sent,message.received"), NOW);
  assert.equal(ok.channel, "slack");
});

test("a pasted essay cannot become the search term", () => {
  const f = parseTimelineQuery(qs(`q=${"a".repeat(500)}`), NOW);
  assert.equal(f.q!.length, 120);
});

test("ILIKE wildcards in a search term are escaped, so `%` cannot force a scan", () => {
  assert.equal(escapeLike("100%_done\\"), "100\\%\\_done\\\\");
  assert.equal(likePattern("a%b"), "%a\\%b%");
  assert.equal(likePattern("plain"), "%plain%", "and a bare term is wrapped, not an equality test");
});

// ---------------------------------------------------------------------------
// Health bucketing
// ---------------------------------------------------------------------------

test("every legal range picks a real bucket width, including the widest", () => {
  // A `pickBucket` with no arm above 30 days returns `undefined` for a legal
  // 90-day request, which divides by NaN and groups every sample into one bucket.
  const H = 3_600_000;
  const D = 86_400_000;
  for (const ms of [60_000, H, 24 * H, 24 * H + 1, 7 * D, 30 * D, 90 * D]) {
    const b = pickBucketSeconds(ms);
    assert.equal(typeof b, "number");
    assert.ok(Number.isFinite(b) && b > 0, `range ${ms} produced ${b}`);
  }
});

test("bucket width grows with the range, so the point count stays bounded", () => {
  const D = 86_400_000;
  const widths = [24, 7 * 24, 30 * 24, 90 * 24].map((h) => pickBucketSeconds(h * 3_600_000));
  for (let i = 1; i < widths.length; i++) {
    assert.ok(widths[i] > widths[i - 1], "each wider range must bucket more coarsely");
  }
  // ~300 points is the target: a day of raw 60s samples is 1,440 rows to draw
  // roughly 120 pixels of ink.
  assert.ok(D / 1000 / widths[0] <= 300);
});
