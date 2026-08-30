/**
 * Cron engine tests.
 *
 * The DST vectors are the reason this file exists. Every transition instant
 * below was read out of the platform's own IANA database first (by scanning the
 * UTC offset hour by hour and bisecting to the minute), so the expectations are
 * anchored to reality rather than to a remembered rule about "the second Sunday
 * in March" — which is exactly the kind of thing that is right until a
 * government changes it.
 *
 * Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CronParseError,
  cronError,
  isValidCron,
  nextRun,
  nextRuns,
  offsetMinutes,
  parseCron,
  resolveLocal,
  runsBetween,
  zonedParts,
} from "../lib/schedule/cron";

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

test("parses every field form", () => {
  const f = parseCron("*/15 9-17 1,15 JAN-MAR mon-fri");
  assert.deepEqual(f.minute, [0, 15, 30, 45]);
  assert.deepEqual(f.hour, [9, 10, 11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual(f.dayOfMonth, [1, 15]);
  assert.deepEqual(f.month, [1, 2, 3]);
  assert.deepEqual(f.dayOfWeek, [1, 2, 3, 4, 5]);
  assert.equal(f.domRestricted, true);
  assert.equal(f.dowRestricted, true);
});

test("* is not a restriction, which the Vixie union rule depends on", () => {
  const f = parseCron("0 0 * * *");
  assert.equal(f.domRestricted, false);
  assert.equal(f.dowRestricted, false);
});

test("day-of-week 7 folds onto Sunday", () => {
  assert.deepEqual(parseCron("0 0 * * 7").dayOfWeek, [0]);
  assert.deepEqual(parseCron("0 0 * * 0,7").dayOfWeek, [0]);
});

test("? is accepted in the day fields only", () => {
  assert.ok(isValidCron("0 0 ? * MON"));
  assert.ok(!isValidCron("0 ? * * *"));
});

test("n/step means 'from n, stepping'", () => {
  assert.deepEqual(parseCron("5/20 * * * *").minute, [5, 25, 45]);
});

test("rejects malformed expressions with a usable message", () => {
  const bad: [string, RegExp][] = [
    ["* * * *", /Expected 5 fields/],
    ["60 * * * *", /out of range/],
    ["* 24 * * *", /out of range/],
    ["* * 0 * *", /out of range/],
    ["fri-mon * * * *", /not a valid minute/],
    ["0 0 * * fri-mon", /runs backwards/],
    ["*/0 * * * *", /step must be at least 1/],
    ["0 0 * * * *", /Expected 5 fields/],
    ["@daily", /Expected 5 fields/],
    ["0 0 1 xyz *", /not a valid month/],
  ];
  for (const [expr, re] of bad) {
    assert.throws(() => parseCron(expr), CronParseError, `expected ${expr} to throw`);
    assert.match(cronError(expr)!, re, `message for ${expr}`);
  }
});

// ---------------------------------------------------------------------------
// Next run — UTC and fixed-offset zones
// ---------------------------------------------------------------------------

test("hourly and stepped minutes in UTC", () => {
  const from = new Date("2026-08-29T10:07:00Z");
  assert.equal(iso(nextRun("0 * * * *", from, "UTC")), "2026-08-29T11:00:00.000Z");
  assert.equal(iso(nextRun("*/15 * * * *", from, "UTC")), "2026-08-29T10:15:00.000Z");
  assert.equal(iso(nextRun("7 * * * *", from, "UTC")), "2026-08-29T11:07:00.000Z");
});

test("the result is strictly after the instant asked from", () => {
  const exact = new Date("2026-08-29T10:00:00Z");
  assert.equal(iso(nextRun("0 * * * *", exact, "UTC")), "2026-08-29T11:00:00.000Z");
});

test("seconds in the input are discarded, not rounded down past a match", () => {
  const from = new Date("2026-08-29T10:14:59.999Z");
  assert.equal(iso(nextRun("*/15 * * * *", from, "UTC")), "2026-08-29T10:15:00.000Z");
});

test("weekday schedule in a zone with no DST (Asia/Shanghai, +08)", () => {
  // 2026-08-29 is a Saturday, so the next weekday 09:00 is Monday the 31st.
  const from = new Date("2026-08-29T00:00:00Z"); // 08:00 Sat in Shanghai
  assert.equal(iso(nextRun("0 9 * * 1-5", from, "Asia/Shanghai")), "2026-08-31T01:00:00.000Z");
});

test("half-hour zone (Asia/Kolkata, +05:30)", () => {
  const from = new Date("2026-08-29T00:00:00Z");
  assert.equal(iso(nextRun("0 9 * * *", from, "Asia/Kolkata")), "2026-08-29T03:30:00.000Z");
});

test("month and leap-day arithmetic", () => {
  const from = new Date("2026-01-15T00:00:00Z");
  assert.equal(iso(nextRun("0 0 29 2 *", from, "UTC")), "2028-02-29T00:00:00.000Z");
  assert.equal(iso(nextRun("0 0 1 JAN *", from, "UTC")), "2027-01-01T00:00:00.000Z");
});

test("an expression that can never match returns null rather than hanging", () => {
  assert.equal(nextRun("0 0 30 2 *", new Date("2026-01-01T00:00:00Z"), "UTC"), null);
});

test("Vixie union: restricting BOTH day fields matches either", () => {
  // "0 0 13 * FRI" fires on the 13th of any month OR on any Friday.
  const from = new Date("2026-09-10T12:00:00Z"); // Thursday
  const runs = nextRuns("0 0 13 * FRI", from, "UTC", 3).map((d) => d.toISOString());
  assert.deepEqual(runs, [
    "2026-09-11T00:00:00.000Z", // Friday
    "2026-09-13T00:00:00.000Z", // the 13th (a Sunday)
    "2026-09-18T00:00:00.000Z", // Friday
  ]);
});

test("a STEP over * restricts the day fields — `*/2` is not `*`", () => {
  // Regression: `restricted` was set for literals and `a-b` ranges but not for
  // `*/n`, so the correctly-parsed [1,3,5,…] set was computed and then ignored
  // by the Vixie union rule. `0 0 */2 * *` fired every single day.
  const dom = parseCron("0 0 */2 * *");
  assert.equal(dom.domRestricted, true);
  assert.deepEqual(dom.dayOfMonth, [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31]);

  const from = new Date("2026-01-01T12:00:00Z");
  const every2nd = nextRuns("0 0 */2 * *", from, "UTC", 6).map((d) => d.toISOString().slice(0, 10));
  assert.deepEqual(every2nd, [
    "2026-01-03", "2026-01-05", "2026-01-07", "2026-01-09", "2026-01-11", "2026-01-13",
  ]);
  // The spelled-out equivalent must agree exactly.
  assert.deepEqual(
    nextRuns("0 0 1-31/2 * *", from, "UTC", 6).map((d) => d.toISOString().slice(0, 10)),
    every2nd,
  );

  // Same rule on day-of-week: 2026-01-03 is a Saturday, so 0,2,4,6 gives
  // Sat, Sun, Tue, Thu, Sat, Sun.
  const dow = parseCron("0 9 * * */2");
  assert.equal(dow.dowRestricted, true);
  assert.deepEqual(dow.dayOfWeek, [0, 2, 4, 6]);
  assert.deepEqual(
    nextRuns("0 9 * * */2", from, "UTC", 6).map((d) => d.toISOString().slice(0, 10)),
    ["2026-01-03", "2026-01-04", "2026-01-06", "2026-01-08", "2026-01-10", "2026-01-11"],
  );
});

test("`*/1` is genuinely equivalent to `*` and stays unrestricted", () => {
  const f = parseCron("0 0 */1 * */1");
  assert.equal(f.domRestricted, false);
  assert.equal(f.dowRestricted, false);
  assert.deepEqual(
    nextRuns("0 0 */1 * *", new Date("2026-01-01T12:00:00Z"), "UTC", 3).map((d) => d.toISOString().slice(0, 10)),
    ["2026-01-02", "2026-01-03", "2026-01-04"],
  );
});

test("a step in a non-day field does not change day matching", () => {
  // `restricted` is only consulted for the two day fields; a stepped minute or
  // hour must not accidentally start gating days.
  const f = parseCron("*/15 */4 * * *");
  assert.equal(f.domRestricted, false);
  assert.equal(f.dowRestricted, false);
  assert.deepEqual(
    nextRuns("*/15 */4 * * *", new Date("2026-01-01T03:50:00Z"), "UTC", 3).map((d) => d.toISOString()),
    ["2026-01-01T04:00:00.000Z", "2026-01-01T04:15:00.000Z", "2026-01-01T04:30:00.000Z"],
  );
});

test("restricting only one day field lets that field alone decide", () => {
  const from = new Date("2026-09-10T12:00:00Z");
  assert.equal(iso(nextRun("0 0 13 * *", from, "UTC")), "2026-09-13T00:00:00.000Z");
  assert.equal(iso(nextRun("0 0 * * FRI", from, "UTC")), "2026-09-11T00:00:00.000Z");
});

// ---------------------------------------------------------------------------
// DST — spring forward (the wall clock is skipped)
// ---------------------------------------------------------------------------
// Transitions verified against the platform IANA database:
//   America/New_York  2026-03-08T07:00:00Z  -300 -> -240   (02:00 local never exists)
//   Europe/London     2026-03-29T01:00:00Z     0 ->   60   (01:00 local never exists)
//   Australia/Adelaide 2026-10-03T16:30:00Z  +570 -> +630  (02:00 local never exists)

test("spring forward: a skipped daily time fires at the instant the clock jumps", () => {
  // 02:30 does not exist on 2026-03-08 in New York; the clock goes 01:59 -> 03:00.
  const from = new Date("2026-03-07T12:00:00Z");
  assert.equal(iso(nextRun("30 2 * * *", from, "America/New_York")), "2026-03-08T07:00:00.000Z");
  const shown = zonedParts(new Date("2026-03-08T07:00:00Z"), "America/New_York");
  assert.equal(shown.hour, 3);
  assert.equal(shown.minute, 0);
});

test("spring forward: the day after is back on schedule at the new offset", () => {
  const from = new Date("2026-03-08T07:00:00Z");
  // 02:30 EDT = 06:30Z.
  assert.equal(iso(nextRun("30 2 * * *", from, "America/New_York")), "2026-03-09T06:30:00.000Z");
});

test("spring forward in Europe/London", () => {
  const from = new Date("2026-03-28T12:00:00Z");
  assert.equal(iso(nextRun("30 1 * * *", from, "Europe/London")), "2026-03-29T01:00:00.000Z");
});

test("spring forward in a half-hour DST zone (Australia/Adelaide)", () => {
  const from = new Date("2026-10-02T00:00:00Z");
  assert.equal(iso(nextRun("30 2 4 10 *", from, "Australia/Adelaide")), "2026-10-03T16:30:00.000Z");
});

test("a schedule outside the gap is untouched by the transition", () => {
  const from = new Date("2026-03-07T12:00:00Z");
  // 04:00 exists on both sides; on 2026-03-08 it is EDT, so 08:00Z.
  assert.equal(iso(nextRun("0 4 * * *", from, "America/New_York")), "2026-03-08T08:00:00.000Z");
});

// ---------------------------------------------------------------------------
// DST — fall back (the wall clock repeats)
// ---------------------------------------------------------------------------
//   America/New_York  2026-11-01T06:00:00Z  -240 -> -300  (01:00-01:59 happens twice)
//   Europe/London     2026-10-25T01:00:00Z    60 ->    0  (01:00-01:59 happens twice)
//   Australia/Adelaide 2026-04-04T16:30:00Z +630 -> +570  (02:00-02:59 happens twice)

test("fall back: an ambiguous time fires once, on the first pass", () => {
  const from = new Date("2026-10-31T12:00:00Z");
  // 01:30 EDT = 05:30Z is the first pass; 01:30 EST = 06:30Z is the second.
  assert.equal(iso(nextRun("30 1 * * *", from, "America/New_York")), "2026-11-01T05:30:00.000Z");
});

test("fall back: the repeat is skipped, not fired again", () => {
  const from = new Date("2026-11-01T05:30:00Z");
  // The next fire is the following day, NOT 06:30Z the same morning.
  assert.equal(iso(nextRun("30 1 * * *", from, "America/New_York")), "2026-11-02T06:30:00.000Z");
});

test("fall back in Europe/London", () => {
  const from = new Date("2026-10-24T12:00:00Z");
  assert.equal(iso(nextRun("30 1 * * *", from, "Europe/London")), "2026-10-25T00:30:00.000Z");
});

test("fall back in a half-hour DST zone (Australia/Adelaide)", () => {
  const from = new Date("2026-04-04T00:00:00Z");
  assert.equal(iso(nextRun("30 2 5 4 *", from, "Australia/Adelaide")), "2026-04-04T16:00:00.000Z");
});

test("every replayed occurrence fires, not just the first", () => {
  // Regression: the replay probe used to start AT `after`, so once the caller
  // iterated into the repeated hour it read the post-transition offset at both
  // ends of its window, concluded there was no transition, and dropped every
  // replayed occurrence after the first. `*/30` fired 01:00 GMT and then jumped
  // straight to 02:00, silently losing 01:30 GMT.
  const runs = nextRuns("*/30 * * * *", new Date("2026-10-25T00:00:00Z"), "Europe/London", 6);
  assert.deepEqual(runs.map((d) => d.toISOString()), [
    "2026-10-25T00:30:00.000Z", // 01:30 BST
    "2026-10-25T01:00:00.000Z", // 01:00 GMT (repeat)
    "2026-10-25T01:30:00.000Z", // 01:30 GMT (repeat)
    "2026-10-25T02:00:00.000Z",
    "2026-10-25T02:30:00.000Z",
    "2026-10-25T03:00:00.000Z",
  ]);
});

test("a 30-minute DST shift replays a 30-minute window (Australia/Lord_Howe)", () => {
  // Lord Howe moves by 30 minutes, not an hour: 2026-04-04T15:00Z takes the
  // clock from 01:59 back to 01:30, so only 01:30-01:59 is replayed.
  const runs = nextRuns("*/15 * * * *", new Date("2026-04-04T14:30:00Z"), "Australia/Lord_Howe", 6);
  assert.deepEqual(runs.map((d) => d.toISOString()), [
    "2026-04-04T14:45:00.000Z", // 01:45 +11:00
    "2026-04-04T15:00:00.000Z", // 01:30 +10:30 (repeat)
    "2026-04-04T15:15:00.000Z", // 01:45 +10:30 (repeat)
    "2026-04-04T15:30:00.000Z", // 02:00
    "2026-04-04T15:45:00.000Z",
    "2026-04-04T16:00:00.000Z",
  ]);
});

test("a wall-clock schedule in a 30-minute-shift zone still fires once", () => {
  // The same zone, the same transition, but an expression that names an hour:
  // 01:45 exists twice and must fire only on the first pass.
  assert.equal(
    iso(nextRun("45 1 5 4 *", new Date("2026-04-01T00:00:00Z"), "Australia/Lord_Howe")),
    "2026-04-04T14:45:00.000Z",
  );
  // ...and 02:15 on 2026-10-04 is skipped by the forward shift, so it fires at
  // 02:30, the moment the clock reappears.
  assert.equal(
    iso(nextRun("15 2 4 10 *", new Date("2026-10-01T00:00:00Z"), "Australia/Lord_Howe")),
    "2026-10-03T15:30:00.000Z",
  );
});

test("China's historical DST is handled like any other (Asia/Shanghai, 1991)", () => {
  // Shanghai is fixed +08:00 today, but the zone HAS transitions -- 1986-1991.
  // Nothing in the engine special-cases "no DST here", and this proves it.
  const tz = "Asia/Shanghai";
  // Spring forward 1991-04-13T18:00Z: 01:59 -> 03:00, so 02:30 never exists.
  assert.equal(iso(nextRun("30 2 * * *", new Date("1991-04-13T12:00:00Z"), tz)), "1991-04-13T18:00:00.000Z");
  // Fall back 1991-09-14T17:00Z: 01:00-01:59 on the 15th happens twice.
  const daily = nextRuns("30 1 * * *", new Date("1991-09-13T12:00:00Z"), tz, 3);
  assert.deepEqual(daily.map((d) => d.toISOString()), [
    "1991-09-13T16:30:00.000Z", // 09-14 01:30 +09:00
    "1991-09-14T16:30:00.000Z", // 09-15 01:30 +09:00 (first pass only)
    "1991-09-15T17:30:00.000Z", // 09-16 01:30 +08:00
  ]);
});

test("a half-hour zone with DST (America/St_Johns, -03:30/-02:30)", () => {
  const tz = "America/St_Johns";
  // Spring forward 2026-03-08T05:30Z: 01:59 -> 03:00, so 02:30 is a gap.
  assert.equal(iso(nextRun("30 2 * * *", new Date("2026-03-07T12:00:00Z"), tz)), "2026-03-08T05:30:00.000Z");
  // A time well clear of the transition keeps its :30 offset.
  assert.equal(iso(nextRun("0 9 * * *", new Date("2026-11-01T00:00:00Z"), tz)), "2026-11-01T12:30:00.000Z");
});

test("a quarter-hour zone (Asia/Kathmandu, +05:45)", () => {
  assert.equal(
    iso(nextRun("30 5 * * *", new Date("2026-08-29T00:00:00Z"), "Asia/Kathmandu")),
    "2026-08-29T23:45:00.000Z",
  );
});

test("a misfire sweep across a spring-forward keeps the local hour", () => {
  // The point of storing a zone rather than an offset: 09:00 stays 09:00, and
  // the UTC instant moves by an hour halfway through the outage.
  const { runs } = runsBetween(
    "0 9 * * 1-5",
    new Date("2026-03-05T00:00:00Z"),
    new Date("2026-03-11T00:00:00Z"),
    "America/New_York",
  );
  assert.deepEqual(runs.map((d) => d.toISOString()), [
    "2026-03-05T14:00:00.000Z", // Thu 09:00 EST
    "2026-03-06T14:00:00.000Z", // Fri 09:00 EST
    "2026-03-09T13:00:00.000Z", // Mon 09:00 EDT -- the weekend is skipped
    "2026-03-10T13:00:00.000Z", // Tue 09:00 EDT
  ]);
});

test("an hourly schedule across fall back fires on both repeated hours", () => {
  // Hourly is offset-agnostic: every wall-clock hour boundary in the doubled
  // hour is a distinct instant, and all of them are real.
  const runs = nextRuns("0 * * * *", new Date("2026-11-01T04:30:00Z"), "America/New_York", 4);
  assert.deepEqual(runs.map((d) => d.toISOString()), [
    "2026-11-01T05:00:00.000Z", // 01:00 EDT
    "2026-11-01T06:00:00.000Z", // 01:00 EST (the repeat)
    "2026-11-01T07:00:00.000Z", // 02:00 EST
    "2026-11-01T08:00:00.000Z",
  ]);
});

// ---------------------------------------------------------------------------
// resolveLocal / offsets
// ---------------------------------------------------------------------------

test("resolveLocal classifies exact, ambiguous and gap", () => {
  const tz = "America/New_York";
  assert.equal(resolveLocal({ year: 2026, month: 6, day: 1, hour: 12, minute: 0 }, tz).kind, "exact");
  assert.equal(resolveLocal({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, tz).kind, "gap");
  assert.equal(resolveLocal({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, tz).kind, "ambiguous");
});

test("offsetMinutes tracks the transition", () => {
  assert.equal(offsetMinutes(new Date("2026-03-08T06:59:00Z"), "America/New_York"), -300);
  assert.equal(offsetMinutes(new Date("2026-03-08T07:00:00Z"), "America/New_York"), -240);
  assert.equal(offsetMinutes(new Date("2026-08-29T00:00:00Z"), "Asia/Kolkata"), 330);
});

test("an unknown time zone is rejected rather than silently treated as UTC", () => {
  assert.throws(() => nextRun("0 0 * * *", new Date(), "Mars/Olympus"), RangeError);
});

// ---------------------------------------------------------------------------
// Sweeps
// ---------------------------------------------------------------------------

test("runsBetween is half-open and ordered", () => {
  const { runs, truncated } = runsBetween(
    "0 * * * *",
    new Date("2026-08-29T00:00:00Z"),
    new Date("2026-08-29T05:00:00Z"),
    "UTC",
  );
  assert.equal(truncated, false);
  assert.deepEqual(runs.map((d) => d.toISOString()), [
    "2026-08-29T01:00:00.000Z",
    "2026-08-29T02:00:00.000Z",
    "2026-08-29T03:00:00.000Z",
    "2026-08-29T04:00:00.000Z",
  ]);
});

test("runsBetween reports truncation instead of exploding on a long outage", () => {
  const { runs, truncated } = runsBetween(
    "* * * * *",
    new Date("2026-08-01T00:00:00Z"),
    new Date("2026-08-29T00:00:00Z"),
    "UTC",
    10,
  );
  assert.equal(runs.length, 10);
  assert.equal(truncated, true);
});

// ---------------------------------------------------------------------------
// Property check — every returned instant really shows a matching wall clock
// ---------------------------------------------------------------------------

test("returned instants match the expression's fields in the target zone", () => {
  const zones = ["UTC", "Asia/Shanghai", "Asia/Kolkata", "America/New_York", "Europe/London", "Australia/Adelaide"];
  const exprs = ["0 9 * * 1-5", "*/20 * * * *", "0 0 1 * *", "45 6,18 * * *", "15 3 * * SUN"];
  // A fixed spread of start instants — deterministic, and dense enough to land
  // on both sides of every transition above.
  const starts = [
    "2026-01-15T03:11:00Z", "2026-03-08T05:00:00Z", "2026-03-29T00:30:00Z",
    "2026-06-30T23:59:00Z", "2026-10-03T16:00:00Z", "2026-10-25T00:45:00Z",
    "2026-11-01T05:15:00Z", "2027-02-28T12:00:00Z",
  ];
  for (const tz of zones) {
    for (const expr of exprs) {
      const f = parseCron(expr);
      for (const s of starts) {
        const from = new Date(s);
        const got = nextRun(expr, from, tz);
        assert.ok(got, `${expr} @ ${tz} from ${s} produced no run`);
        assert.ok(got!.getTime() > from.getTime(), "must be strictly later");
        const p = zonedParts(got!, tz);
        const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
        const dayOk =
          f.domRestricted && f.dowRestricted
            ? f.dayOfMonth.includes(p.day) || f.dayOfWeek.includes(dow)
            : f.domRestricted
              ? f.dayOfMonth.includes(p.day)
              : f.dowRestricted
                ? f.dayOfWeek.includes(dow)
                : true;
        // The one licensed exception: a gap fire lands on the instant the clock
        // jumped to, which by definition is not the requested wall clock.
        const isGapFire = resolveLocal(
          { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute },
          tz,
        ).instant.getTime() !== got!.getTime();
        if (isGapFire) continue;
        assert.ok(f.month.includes(p.month), `${expr} @ ${tz}: month ${p.month}`);
        assert.ok(dayOk, `${expr} @ ${tz}: day ${p.year}-${p.month}-${p.day}`);
        assert.ok(f.hour.includes(p.hour), `${expr} @ ${tz}: hour ${p.hour} (${got!.toISOString()})`);
        assert.ok(f.minute.includes(p.minute), `${expr} @ ${tz}: minute ${p.minute}`);
      }
    }
  }
});

test("iterating from a previous result never repeats or goes backwards", () => {
  for (const tz of ["America/New_York", "Australia/Adelaide", "Europe/London"]) {
    const runs = nextRuns("30 1 * * *", new Date("2026-10-20T00:00:00Z"), tz, 40);
    assert.equal(runs.length, 40);
    for (let i = 1; i < runs.length; i++) {
      assert.ok(runs[i].getTime() > runs[i - 1].getTime(), `${tz} run ${i} went backwards`);
    }
  }
});
