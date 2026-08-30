/**
 * Deterministic natural-language schedule parsing.
 *
 * Every phrase here is one a user could plausibly type in one of the four UI
 * languages. The point of the module is to answer them WITHOUT a model call, so
 * a regression that silently drops a phrase to the LLM path is a real cost —
 * hence asserting the exact cron rather than just "not null".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTime, parseSchedulePhrase, CONFIDENCE_FLOOR } from "../lib/schedule/parse";
import { isValidCron } from "../lib/schedule/cron";

const cronOf = (phrase: string, opts = {}) => parseSchedulePhrase(phrase, opts)?.cron ?? null;

test("extracts times in every written form", () => {
  const cases: [string, number, number][] = [
    ["at 09:00", 9, 0],
    ["at 9am", 9, 0],
    ["at 9 am", 9, 0],
    ["at 6pm", 18, 0],
    ["9:30pm", 21, 30],
    ["18:45", 18, 45],
    ["at midnight", 0, 0],
    ["at noon", 12, 0],
    ["12am", 0, 0],
    ["每天早上9点", 9, 0],
    ["每天下午3点", 15, 0],
    ["晚上8点30分", 20, 30],
    ["九点", 9, 0],
    ["十点半", 10, 30],
    ["毎日9時", 9, 0],
    ["午後3時", 15, 0],
    ["15時30分", 15, 30],
  ];
  for (const [input, hour, minute] of cases) {
    const got = extractTime(input);
    assert.ok(got, `no time found in "${input}"`);
    assert.deepEqual(got, { hour, minute }, `"${input}"`);
  }
});

test("a qualifier before the number counts (下午3点), and a distant one does not", () => {
  assert.deepEqual(extractTime("morning standup at 3pm"), { hour: 15, minute: 0 });
  assert.deepEqual(extractTime("下午3点"), { hour: 15, minute: 0 });
  assert.deepEqual(extractTime("上午11点"), { hour: 11, minute: 0 });
});

test("daily phrasings across all four languages", () => {
  for (const p of ["every day at 9am", "daily at 09:00", "每天早上9点", "每日上午9點", "毎日9時"]) {
    assert.equal(cronOf(p), "0 9 * * *", p);
  }
});

test("weekday phrasings", () => {
  for (const p of ["every weekday at 9am", "on business days at 09:00", "工作日早上9点", "平日9時"]) {
    assert.equal(cronOf(p), "0 9 * * 1-5", p);
  }
});

test("named days, including several at once", () => {
  assert.equal(cronOf("every Monday at 10:00"), "0 10 * * 1");
  assert.equal(cronOf("每周一上午10点"), "0 10 * * 1");
  assert.equal(cronOf("毎週月曜10時"), "0 10 * * 1");
  assert.equal(cronOf("every Tuesday and Thursday at 14:00"), "0 14 * * 2,4");
  assert.equal(cronOf("每周六和周日下午5点"), "0 17 * * 0,6");
});

test("weekends", () => {
  assert.equal(cronOf("every weekend at 11:00"), "0 11 * * 0,6");
  assert.equal(cronOf("周末上午11点"), "0 11 * * 0,6");
});

test("minute and hour intervals", () => {
  assert.equal(cronOf("every 15 minutes"), "*/15 * * * *");
  assert.equal(cronOf("每15分钟"), "*/15 * * * *");
  assert.equal(cronOf("每隔30分钟检查一次"), "*/30 * * * *");
  assert.equal(cronOf("15分ごと"), "*/15 * * * *");
  assert.equal(cronOf("every 2 hours"), "0 */2 * * *");
  assert.equal(cronOf("hourly"), "0 * * * *");
  assert.equal(cronOf("每小时"), "0 * * * *");
});

test("an interval keeps the stated minute offset", () => {
  assert.equal(cronOf("every 3 hours starting at 09:30"), "30 */3 * * *");
});

test("monthly", () => {
  assert.equal(cronOf("monthly on the 1st at 09:00"), "0 9 1 * *");
  assert.equal(cronOf("每月15号下午2点"), "0 14 15 * *");
  assert.equal(cronOf("毎月1日9時"), "0 9 1 * *");
  // No day named: the 1st is the sensible default.
  assert.equal(cronOf("monthly at 08:00"), "0 8 1 * *");
});

test("one-off dates need a reference day and produce a dated expression", () => {
  const today = { year: 2026, month: 8, day: 29 };
  const tomorrow = parseSchedulePhrase("tomorrow at 9am", { today });
  assert.equal(tomorrow?.kind, "one_off");
  assert.equal(tomorrow?.cron, "0 9 30 8 *");
  assert.equal(tomorrow?.onDate, "2026-08-30");

  const cjk = parseSchedulePhrase("明天下午3点提醒我", { today });
  assert.equal(cjk?.cron, "0 15 30 8 *");
  assert.equal(cjk?.onDate, "2026-08-30");

  // Month rollover is calendar arithmetic, not +1 to the day number.
  const eom = parseSchedulePhrase("tomorrow at 07:00", { today: { year: 2026, month: 8, day: 31 } });
  assert.equal(eom?.onDate, "2026-09-01");
  assert.equal(eom?.cron, "0 7 1 9 *");
});

test("without a reference day, a relative date is not guessed", () => {
  // Falls through to the bare-time rule rather than inventing a date from the
  // server's clock, which would be in the wrong zone for most users.
  const got = parseSchedulePhrase("tomorrow at 9am");
  assert.equal(got?.kind, "recurring");
  assert.ok(got!.confidence < CONFIDENCE_FLOOR);
});

test("a bare time is low confidence so the caller confirms it", () => {
  const got = parseSchedulePhrase("at 18:00");
  assert.equal(got?.cron, "0 18 * * *");
  assert.ok(got!.confidence < CONFIDENCE_FLOOR, "should fall below the floor");
});

test("a frequency with no time defaults to 09:00 but is penalised", () => {
  const withTime = parseSchedulePhrase("every weekday at 9am")!;
  const without = parseSchedulePhrase("every weekday")!;
  assert.equal(without.cron, "0 9 * * 1-5");
  assert.ok(without.confidence < withTime.confidence);
  assert.ok(without.confidence >= CONFIDENCE_FLOOR, "still confident enough to use");
});

test("unrecognisable input returns null rather than a wrong guess", () => {
  for (const p of ["", "   ", "do the thing", "把报告发给我", "asdfgh"]) {
    assert.equal(parseSchedulePhrase(p), null, `"${p}" should not parse`);
  }
});

test("full sentences parse, not just bare phrases", () => {
  assert.equal(
    cronOf("every weekday at 9am, summarise overnight support tickets and post to Slack"),
    "0 9 * * 1-5",
  );
  assert.equal(
    cronOf("每天下午6点给我发一份当日销售总结"),
    "0 18 * * *",
  );
  assert.equal(
    cronOf("毎週金曜17時に週次レポートを作成してください"),
    "0 17 * * 5",
  );
});

test("full-width digits and colons normalise", () => {
  assert.equal(cronOf("每天０９：００"), "0 9 * * *");
});

test("every produced expression is a valid cron", () => {
  const phrases = [
    "every day at 9am", "every weekday at 9am", "every 15 minutes", "hourly",
    "monthly on the 1st at 09:00", "every Monday at 10:00", "每天早上9点",
    "每15分钟", "毎週月曜10時", "工作日早上9点", "at 18:00", "every weekend at 11:00",
    "every Tuesday and Thursday at 14:00", "every 2 hours",
  ];
  for (const p of phrases) {
    const got = parseSchedulePhrase(p, { today: { year: 2026, month: 8, day: 29 } });
    assert.ok(got, `"${p}" did not parse`);
    assert.ok(isValidCron(got!.cron), `"${p}" produced invalid cron ${got!.cron}`);
  }
});
