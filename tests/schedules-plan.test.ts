/**
 * The scheduler's pure arithmetic.
 *
 * The first block exists because of a specific, silent bug. `unevenStep` was
 * written by mirroring `describe.ts`'s `stepOf`, which detects EVEN steps — it
 * requires `values.length * step === size`. An uneven step is by definition one
 * whose multiples do NOT land on the field width, so the copied predicate
 * returned null for every input the function exists to catch, including both
 * examples in its own doc comment. `interval_not_representable`, the CONFIRM
 * demotion in `bandFor`, and the preview's step warning were all unreachable.
 * Anything that reintroduces an exact-product test must fail here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advanceSchedule,
  classifyMisfire,
  dailyFireCount,
  finestGapSeconds,
  jitterOffsetSeconds,
  materializeParsed,
  medianTickSeconds,
  unevenStep,
} from "../lib/schedules/plan";
import { encodeRunCursor, decodeRunCursor } from "../lib/schedules/serialize";
import { SCHEDULE_LIMITS, isEvenStep, stepNeighbours } from "../lib/schedules/limits";

const UTC = "UTC";
const SG = "Asia/Singapore";

// ---------------------------------------------------------------------------
// unevenStep
// ---------------------------------------------------------------------------

test("a step that does not divide its field is caught, with both neighbours", () => {
  const seven = unevenStep("*/7 * * * *");
  assert.deepEqual(seven, { unit: "minute", step: 7, below: 6, above: 10 });

  // Three fires an hour at 25- then 10-minute gaps.
  assert.deepEqual(unevenStep("*/25 * * * *"), {
    unit: "minute",
    step: 25,
    below: 20,
    above: 30,
  });

  // Hours too: 0,5,10,15,20 then a four-hour wait.
  assert.deepEqual(unevenStep("0 */5 * * *"), { unit: "hour", step: 5, below: 4, above: 6 });
});

test("every admissible step is accepted, in both units", () => {
  for (const s of SCHEDULE_LIMITS.MINUTE_STEPS) {
    assert.equal(unevenStep(`*/${s} * * * *`), null, `minute step ${s}`);
  }
  for (const s of SCHEDULE_LIMITS.HOUR_STEPS) {
    assert.equal(unevenStep(`0 */${s} * * *`), null, `hour step ${s}`);
  }
});

test("a hand-written list is not a step and is left alone", () => {
  // Unevenly spaced: not a step at all, so not this function's business.
  assert.equal(unevenStep("0,7,23 * * * *"), null);
  // Evenly spaced but not starting at 0 — also not a `*​/n`.
  assert.equal(unevenStep("5,25,45 * * * *"), null);
  // An even list written out longhand is still even.
  assert.equal(unevenStep("0,20,40 * * * *"), null);
});

test("a two-element prefix is not mistaken for a step", () => {
  // 0,7 has the right first gap but stops far short of covering the hour.
  assert.equal(unevenStep("0,7 * * * *"), null);
});

test("an unparseable expression is invalid_cron's problem, not this one's", () => {
  assert.equal(unevenStep("not a cron"), null);
  assert.equal(unevenStep("* * * *"), null);
});

test("the neighbour pair brackets the step and comes from the admissible list", () => {
  const { below, above } = stepNeighbours(7, "minute");
  assert.equal(below, 6);
  assert.equal(above, 10);
  assert.ok(isEvenStep(below!, "minute") && isEvenStep(above!, "minute"));
  // The ends of the list have no neighbour on one side.
  assert.equal(stepNeighbours(1, "minute").below, null);
  assert.equal(stepNeighbours(59, "minute").above, null);
});

// ---------------------------------------------------------------------------
// advanceSchedule
// ---------------------------------------------------------------------------

test("a one-off is consumed the moment it is claimed, not when it succeeds", () => {
  const r = advanceSchedule(
    { kind: "once", cronExpr: null, intervalSeconds: null, timezone: UTC },
    new Date("2026-08-30T09:00:00Z"),
    new Date("2026-08-30T09:00:05Z"),
  );
  assert.equal(r.nextRunAt, null);
  assert.equal(r.enabled, false);
  assert.equal(r.reason, "once_consumed");
});

test("the advance is anchored to the instant that fired, and clamped past now", () => {
  const s = { kind: "cron" as const, cronExpr: "0 * * * *", intervalSeconds: null, timezone: UTC };
  // 90 seconds late: the next hour is still in the future, so it is used as-is.
  const healthy = advanceSchedule(s, new Date("2026-08-30T09:00:00Z"), new Date("2026-08-30T09:01:30Z"));
  assert.equal(healthy.nextRunAt?.toISOString(), "2026-08-30T10:00:00.000Z");

  // Five hours late: anchor+1 is in the past, so it re-anchors to now.
  const late = advanceSchedule(s, new Date("2026-08-30T09:00:00Z"), new Date("2026-08-30T14:30:00Z"));
  assert.equal(late.nextRunAt?.toISOString(), "2026-08-30T15:00:00.000Z");
});

test("the advance never lands ON now, which would re-fire on the very next tick", () => {
  const now = new Date("2026-08-30T10:00:00Z");
  const r = advanceSchedule(
    { kind: "cron", cronExpr: "0 * * * *", intervalSeconds: null, timezone: UTC },
    new Date("2026-08-30T09:00:00Z"),
    now,
  );
  assert.ok(r.nextRunAt!.getTime() > now.getTime());
});

test("an interval jumps whole steps rather than looping, and stays strictly future", () => {
  const now = new Date("2026-08-30T10:00:00Z");
  const r = advanceSchedule(
    { kind: "interval", cronExpr: null, intervalSeconds: 300, timezone: UTC },
    new Date("2026-08-30T09:00:00Z"),
    now,
  );
  assert.ok(r.nextRunAt!.getTime() > now.getTime());
  assert.equal((r.nextRunAt!.getTime() - new Date("2026-08-30T09:00:00Z").getTime()) % 300_000, 0);
});

test("a row edited into invalidity by direct SQL is unmatchable, never a throw", () => {
  const r = advanceSchedule(
    { kind: "cron", cronExpr: "60 99 * * *", intervalSeconds: null, timezone: UTC },
    new Date(),
    new Date(),
  );
  assert.equal(r.nextRunAt, null);
  assert.equal(r.enabled, false);
});

test("enabled is true if and only if there is a next run — the §1.3 CHECK", () => {
  for (const s of [
    { kind: "once" as const, cronExpr: null, intervalSeconds: null, timezone: UTC },
    { kind: "cron" as const, cronExpr: "0 9 30 2 *", intervalSeconds: null, timezone: UTC },
    { kind: "cron" as const, cronExpr: "0 9 * * *", intervalSeconds: null, timezone: UTC },
  ]) {
    const r = advanceSchedule(s, new Date("2026-08-30T00:00:00Z"), new Date("2026-08-30T00:00:00Z"));
    assert.equal(r.enabled, r.nextRunAt !== null, JSON.stringify(s));
  }
});

// ---------------------------------------------------------------------------
// materializeParsed — the annual-reminder bug
// ---------------------------------------------------------------------------

test("a one-off becomes run_at with a NULL cron, never a yearly cron row", () => {
  const { shape } = materializeParsed(
    { kind: "one_off", cron: "0 9 30 8 *", onDate: "2026-08-30", matched: "30 August", confidence: 0.9 },
    SG,
  );
  assert.equal(shape.kind, "once");
  assert.equal(shape.cronExpr, null);
  // 09:00 in Singapore is 01:00Z.
  assert.equal(shape.runAt!.toISOString(), "2026-08-30T01:00:00.000Z");
});

// ---------------------------------------------------------------------------
// dailyFireCount / finestGapSeconds
// ---------------------------------------------------------------------------

test("a fire at local midnight is counted, and the day is not clipped", () => {
  const day = new Date("2026-08-30T05:00:00Z");
  // runsBetween is open at `from`, so a naive midnight bound loses this one.
  assert.equal(dailyFireCount("0 0 * * *", SG, day).count, 1);
  assert.equal(dailyFireCount("*/5 * * * *", SG, day).count, 288);
  assert.equal(dailyFireCount("0 9 * * *", SG, day).count, 1);
});

test("the finest gap is what the tick banner compares itself against", () => {
  const day = new Date("2026-08-30T05:00:00Z");
  assert.equal(finestGapSeconds([{ cronExpr: "*/5 * * * *", timezone: UTC }], day), 300);
  // One fire a day has no gap of its own; 24 h is its real need.
  assert.equal(finestGapSeconds([{ cronExpr: "0 9 * * *", timezone: UTC }], day), 86_400);
  // A `once` row carries no cron and cannot make the platform look slow.
  assert.equal(finestGapSeconds([{ cronExpr: null, timezone: UTC }], day), null);
});

// ---------------------------------------------------------------------------
// medianTickSeconds
// ---------------------------------------------------------------------------

test("tick cadence needs three samples before it claims to know anything", () => {
  const at = (m: number) => new Date(Date.UTC(2026, 7, 30, 10, m));
  assert.equal(medianTickSeconds([at(2), at(1)]), null);
  // Newest-first input, one minute apart.
  assert.equal(medianTickSeconds([at(3), at(2), at(1), at(0)]), 60);
  // A single outlier does not move the median the way a mean would.
  assert.equal(medianTickSeconds([at(30), at(3), at(2), at(1)]), 60);
});

// ---------------------------------------------------------------------------
// classifyMisfire
// ---------------------------------------------------------------------------

const misfireBase = {
  cronExpr: "0 * * * *",
  timezone: UTC,
  jitterOffsetSeconds: 0,
  graceSeconds: 120,
  maxAgeSeconds: 86_400,
};

test("normal platform lateness is on_time, not a misfire badge on every run", () => {
  const r = classifyMisfire({
    ...misfireBase,
    scheduledFor: new Date("2026-08-30T09:00:00Z"),
    now: new Date("2026-08-30T09:01:30Z"),
  });
  assert.equal(r.band, "on_time");
  assert.equal(r.missedCount, 0);
  assert.equal(r.anchor.toISOString(), "2026-08-30T09:00:00.000Z");
});

test("jitter defers the dispatch and must not be read as lateness", () => {
  // 200 s after the scheduled instant, but 180 s of that is this occurrence's
  // own jitter, leaving 20 s of real lateness — inside the grace.
  const r = classifyMisfire({
    ...misfireBase,
    jitterOffsetSeconds: 180,
    scheduledFor: new Date("2026-08-30T09:00:00Z"),
    now: new Date("2026-08-30T09:03:20Z"),
  });
  assert.equal(r.band, "on_time");
});

test("a bounded outage counts what it swallowed and anchors to the NEWEST missed", () => {
  const r = classifyMisfire({
    ...misfireBase,
    scheduledFor: new Date("2026-08-30T09:00:00Z"),
    now: new Date("2026-08-30T13:30:00Z"),
  });
  assert.equal(r.band, "misfired");
  assert.equal(r.missedTruncated, false);
  // 09:00 itself plus 10:00, 11:00, 12:00, 13:00.
  assert.equal(r.missedCount, 5);
  assert.equal(r.anchor.toISOString(), "2026-08-30T13:00:00.000Z");
});

test("past the ceiling it is too_old, and catch_up is not honoured", () => {
  const r = classifyMisfire({
    ...misfireBase,
    scheduledFor: new Date("2026-08-01T09:00:00Z"),
    now: new Date("2026-08-30T09:00:00Z"),
  });
  assert.equal(r.band, "too_old");
});

test("a truncated outage re-anchors to now, so the advance stays two calls", () => {
  const r = classifyMisfire({
    ...misfireBase,
    cronExpr: "* * * * *",
    scheduledFor: new Date("2026-08-01T09:00:00Z"),
    now: new Date("2026-08-30T09:00:00Z"),
  });
  assert.equal(r.missedTruncated, true);
  // runs.at(-1) would be the 500th missed minute and still 28 days behind.
  assert.equal(r.anchor.toISOString(), "2026-08-30T09:00:00.000Z");
});

test("a `once` missed exactly itself — there is no sequence to walk", () => {
  const r = classifyMisfire({
    ...misfireBase,
    cronExpr: null,
    scheduledFor: new Date("2026-08-30T09:00:00Z"),
    now: new Date("2026-08-30T12:00:00Z"),
  });
  assert.equal(r.missedCount, 1);
  assert.equal(r.missedTruncated, false);
});

// ---------------------------------------------------------------------------
// jitterOffsetSeconds
// ---------------------------------------------------------------------------

test("jitter is deterministic per occurrence, so two ticks agree", () => {
  const at = new Date("2026-08-30T09:00:00Z");
  const a = jitterOffsetSeconds("11111111-1111-4111-8111-111111111111", at, 600);
  const b = jitterOffsetSeconds("11111111-1111-4111-8111-111111111111", at, 600);
  assert.equal(a, b);
});

test("jitter stays inside [0, jitterSeconds] and is off when unset", () => {
  const at = new Date("2026-08-30T09:00:00Z");
  assert.equal(jitterOffsetSeconds("a", at, 0), 0);
  for (let i = 0; i < 200; i++) {
    const v = jitterOffsetSeconds(`schedule-${i}`, at, 300);
    assert.ok(v >= 0 && v <= 300, `offset ${v} out of range`);
  }
});

test("different occurrences of one schedule get different offsets", () => {
  const id = "22222222-2222-4222-8222-222222222222";
  const offsets = new Set(
    Array.from({ length: 24 }, (_, h) =>
      jitterOffsetSeconds(id, new Date(Date.UTC(2026, 7, 30, h)), 600),
    ),
  );
  assert.ok(offsets.size > 12, "jitter should spread across occurrences");
});

// ---------------------------------------------------------------------------
// The run-history cursor
// ---------------------------------------------------------------------------

test("the run cursor round-trips and rejects anything it did not write", () => {
  const at = new Date("2026-08-30T09:00:00.000Z");
  const id = "33333333-3333-4333-8333-333333333333";
  const back = decodeRunCursor(encodeRunCursor(at, id));
  assert.equal(back!.id, id);
  assert.equal(back!.scheduledFor.toISOString(), at.toISOString());

  assert.equal(decodeRunCursor("not-base64url-at-all!!"), null);
  assert.equal(decodeRunCursor(Buffer.from("nope", "utf8").toString("base64url")), null);
  assert.equal(decodeRunCursor(Buffer.from("2026-01-01T00:00:00Z|", "utf8").toString("base64url")), null);
});
