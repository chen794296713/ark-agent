/**
 * Cron -> human sentence, in all four UI languages.
 *
 * The structural assertions matter more than the exact wording: the contract is
 * that all four languages describe the SAME schedule, and that no expression
 * ever renders as an empty string or a lie.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeCron, describeCron, describeSchedule } from "../lib/schedule/describe";
import type { Lang } from "../lib/types";

const LANGS: Lang[] = ["en", "zh", "zht", "ja"];

test("classifies each recognised shape", () => {
  assert.deepEqual(analyzeCron("* * * * *"), { kind: "everyMinute" });
  assert.deepEqual(analyzeCron("*/15 * * * *"), { kind: "minuteInterval", step: 15 });
  assert.deepEqual(analyzeCron("0 * * * *"), { kind: "hourly", minute: 0 });
  assert.deepEqual(analyzeCron("30 * * * *"), { kind: "hourly", minute: 30 });
  assert.deepEqual(analyzeCron("0 */4 * * *"), { kind: "hourInterval", step: 4, minute: 0 });
  assert.deepEqual(analyzeCron("30 9 * * *"), { kind: "daily", hour: 9, minute: 30 });
  assert.deepEqual(analyzeCron("0 9 * * 1-5"), { kind: "weekdays", hour: 9, minute: 0 });
  assert.deepEqual(analyzeCron("0 11 * * 0,6"), { kind: "weekends", hour: 11, minute: 0 });
  assert.deepEqual(analyzeCron("0 10 * * 1"), { kind: "weekly", days: [1], hour: 10, minute: 0 });
  assert.deepEqual(analyzeCron("0 14 * * 2,4"), { kind: "weekly", days: [2, 4], hour: 14, minute: 0 });
  assert.deepEqual(analyzeCron("0 9 1 * *"), { kind: "monthly", day: 1, hour: 9, minute: 0 });
  assert.deepEqual(analyzeCron("0 9 1 1 *"), { kind: "yearly", month: 1, day: 1, hour: 9, minute: 0 });
});

test("anything unrecognised falls back to generic rather than mis-describing", () => {
  assert.equal(analyzeCron("0,15,45 9-17 * * 1-5").kind, "generic");
  assert.equal(analyzeCron("0 9 13 * 5").kind, "generic");
  // A stepped hour with several minutes is a real schedule, just not a named shape.
  assert.equal(analyzeCron("0,30 */2 * * *").kind, "generic");
});

test("every language renders every shape, non-empty", () => {
  const exprs = [
    "* * * * *", "*/15 * * * *", "0 * * * *", "30 * * * *", "0 */4 * * *",
    "30 9 * * *", "0 9 * * 1-5", "0 11 * * 0,6", "0 10 * * 1", "0 14 * * 2,4",
    "0 9 1 * *", "0 9 1 1 *", "0,15,45 9-17 * * 1-5", "0 9 13 * 5",
  ];
  for (const expr of exprs) {
    for (const lang of LANGS) {
      const text = describeCron(expr, lang);
      assert.ok(text && text.trim().length > 0, `${expr} in ${lang} rendered empty`);
    }
  }
});

test("the four languages agree on the numbers they mention", () => {
  // A translation that drifts to a different hour is the failure this catches.
  for (const [expr, needle] of [["30 9 * * *", "09:30"], ["0 14 * * 2,4", "14:00"]] as const) {
    for (const lang of LANGS) {
      assert.match(describeCron(expr, lang)!, new RegExp(needle), `${expr} in ${lang}`);
    }
  }
});

test("English wording for the common shapes", () => {
  assert.equal(describeCron("0 9 * * 1-5", "en"), "Every weekday at 09:00");
  assert.equal(describeCron("*/15 * * * *", "en"), "Every 15 minutes");
  assert.equal(describeCron("0 9 1 * *", "en"), "Monthly on the 1st at 09:00");
  assert.equal(describeCron("0 9 2 * *", "en"), "Monthly on the 2nd at 09:00");
  assert.equal(describeCron("0 9 3 * *", "en"), "Monthly on the 3rd at 09:00");
  assert.equal(describeCron("0 9 11 * *", "en"), "Monthly on the 11th at 09:00");
  assert.equal(describeCron("0 9 21 * *", "en"), "Monthly on the 21st at 09:00");
  assert.equal(describeCron("0 14 * * 1,3,5", "en"), "Every Monday, Wednesday and Friday at 14:00");
});

test("CJK wording for the common shapes", () => {
  assert.equal(describeCron("0 9 * * 1-5", "zh"), "每个工作日 09:00");
  assert.equal(describeCron("0 10 * * 1", "zh"), "每周一 10:00");
  assert.equal(describeCron("0 10 * * 1", "zht"), "每週一 10:00");
  assert.equal(describeCron("0 10 * * 1", "ja"), "毎週月曜日 10:00");
  assert.equal(describeCron("*/15 * * * *", "ja"), "15 分ごと");
  assert.equal(describeCron("0 9 1 * *", "zh"), "每月 1 号 09:00");
});

test("the Vixie union is spelled out, not silently implied", () => {
  // "0 9 13 * FRI" fires on the 13th OR on Fridays. A description that reads as
  // "the 13th, on Fridays" would be understood as an intersection.
  for (const lang of LANGS) {
    const text = describeCron("0 9 13 * 5", lang)!;
    assert.match(text, /OR|或|または/, `${lang} did not disclose the union`);
  }
});

test("an unparseable expression describes as null, never as a guess", () => {
  for (const lang of LANGS) {
    assert.equal(describeCron("not a cron", lang), null);
    assert.equal(describeCron("99 * * * *", lang), null);
    assert.equal(describeSchedule("* * * *", "UTC", lang), null);
  }
});

test("describeSchedule appends the zone", () => {
  assert.equal(
    describeSchedule("0 9 * * 1-5", "Asia/Shanghai", "en"),
    "Every weekday at 09:00 · Asia/Shanghai",
  );
});
