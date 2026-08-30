/**
 * Natural language -> cron, without a model.
 *
 * The schedule editor's primary path asks the LLM to turn "every weekday at 9am,
 * summarise overnight tickets" into a structured schedule. This module is the
 * path that runs when no `OPENROUTER_API_KEY` is configured, when the model is
 * down, and — importantly — FIRST, before the model is called at all: the
 * phrasings people actually type are a short list, and matching one of them
 * deterministically is faster, free, and more predictable than a round trip.
 *
 * It recognises the same shapes in the four UI languages, because a 简体中文
 * user types "每天早上九点" and would otherwise be pushed onto the model path
 * for the single most common request in the product.
 *
 * Pure and client-safe: the editor runs it on every keystroke to show a live
 * "next 5 runs" preview.
 */

import { isValidCron } from "./cron";

export type ParsedScheduleKind = "recurring" | "one_off";

export interface ParsedSchedule {
  kind: ParsedScheduleKind;
  /** A 5-field cron expression. Present for both kinds — a one-off still needs
   *  a time-of-day, and storing one shape keeps the runner simple. */
  cron: string;
  /**
   * For `one_off`, the single wall-clock date it should fire on, as
   * `YYYY-MM-DD` in the schedule's own zone. The runner disables the schedule
   * after that date passes.
   */
  onDate?: string;
  /** Which rule matched — surfaced in the UI as "understood as …" and logged. */
  matched: string;
  /**
   * 0-1. Below `CONFIDENCE_FLOOR` the caller should prefer the model, or ask
   * the user to confirm. A bare time with no frequency word is the classic
   * low-confidence case: "9am" probably means daily, but not certainly.
   */
  confidence: number;
}

/** Below this, the caller should escalate to the LLM or ask the user. */
export const CONFIDENCE_FLOOR = 0.6;

// ---------------------------------------------------------------------------
// Time of day
// ---------------------------------------------------------------------------

interface TimeOfDay {
  hour: number;
  minute: number;
}

/** CJK numerals up to 24, enough for an hour or a day-of-month. */
const CJK_DIGITS: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/** Parse "九", "十", "十五", "二十三" — the forms that appear in a clock time. */
function cjkNumber(text: string): number | null {
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const chars = [...text];
  if (chars.some((ch) => !(ch in CJK_DIGITS))) return null;
  const ten = chars.indexOf("十");
  if (ten === -1) {
    // A bare run of digits: 九 -> 9. Multi-character without 十 is not a number
    // anyone writes for a time, so treat only the single-character case.
    return chars.length === 1 ? CJK_DIGITS[chars[0]] : null;
  }
  const before = chars.slice(0, ten).map((ch) => CJK_DIGITS[ch]);
  const after = chars.slice(ten + 1).map((ch) => CJK_DIGITS[ch]);
  const tens = before.length === 0 ? 1 : before.length === 1 ? before[0] : NaN;
  const ones = after.length === 0 ? 0 : after.length === 1 ? after[0] : NaN;
  const n = tens * 10 + ones;
  return Number.isFinite(n) ? n : null;
}

/**
 * Meridiem words across the four languages. Chinese and Japanese put the
 * qualifier BEFORE the number (上午九点 / 午後3時), English after (9am), so both
 * positions are searched.
 */
// `\b` is the wrong boundary here: in "6pm" the digit and the "p" are both word
// characters, so `\bpm\b` does not match and every 12-hour time silently reads
// as morning. Letter lookarounds match "6pm" and "9 am" while still refusing
// the "am" inside "spam".
const AM_WORDS = /(?<![a-z])(am|a\.m\.)(?![a-z])|上午|早上|早晨|清晨|午前|朝/;
const PM_WORDS = /(?<![a-z])(pm|p\.m\.)(?![a-z])|下午|傍晚|晚上|夜里|夜裡|午後|夕方|夜/;
const NOON_WORDS = /\b(noon|midday)\b|中午|正午/;
const MIDNIGHT_WORDS = /\b(midnight)\b|午夜|零点|零點/;

/**
 * Pull a time of day out of free text.
 *
 * Returns null rather than guessing when there is no time at all, so the caller
 * can apply its own default (09:00) and lower the confidence accordingly.
 */
export function extractTime(input: string): TimeOfDay | null {
  const text = input.toLowerCase();

  if (MIDNIGHT_WORDS.test(text)) return { hour: 0, minute: 0 };
  if (NOON_WORDS.test(text) && !/\d/.test(text)) return { hour: 12, minute: 0 };

  // 1) 24-hour or explicit clock: "09:00", "9:30pm", "18.30". Digit lookarounds
  //    rather than `\b`, so a trailing meridiem ("9:30pm") does not swallow the
  //    boundary and defeat the match.
  const clock = text.match(/(?<![\d:.])(\d{1,2})[:.](\d{2})(?!\d)/);
  if (clock) {
    let hour = Number(clock[1]);
    const minute = Number(clock[2]);
    if (hour <= 23 && minute <= 59) {
      hour = applyMeridiem(hour, text, clock.index ?? 0);
      return { hour, minute };
    }
  }

  // 2) CJK clock: "9点30分", "九時半", "15時"
  const cjk = text.match(/([0-9〇零一二两兩三四五六七八九十]{1,3})\s*[点點時时]\s*(?:([0-9〇零一二两兩三四五六七八九十]{1,3})\s*分|(半))?/);
  if (cjk) {
    const hour = cjkNumber(cjk[1]);
    if (hour !== null && hour <= 24) {
      const minute = cjk[3] ? 30 : cjk[2] ? (cjkNumber(cjk[2]) ?? 0) : 0;
      if (minute <= 59) {
        return { hour: applyMeridiem(hour === 24 ? 0 : hour, text, cjk.index ?? 0), minute };
      }
    }
  }

  // 3) Bare hour with a meridiem: "9am", "at 6 pm", "9 o'clock"
  const bare = text.match(/\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.|o'?clock)\b/);
  if (bare) {
    const hour = Number(bare[1]);
    if (hour <= 24) return { hour: applyMeridiem(hour === 24 ? 0 : hour, text, bare.index ?? 0), minute: 0 };
  }

  // 4) "at 9" / "9点" already covered; "at 17" as a last resort.
  const at = text.match(/\b(?:at|@|by)\s+(\d{1,2})\b/);
  if (at) {
    const hour = Number(at[1]);
    if (hour <= 23) return { hour: applyMeridiem(hour, text, at.index ?? 0), minute: 0 };
  }

  return null;
}

/**
 * Fold a 12-hour reading onto 24. `at` is where the number sat in the string so
 * a qualifier written before it (下午3点) counts as much as one written after
 * it (3pm) — searching the whole string would let "morning standup at 3pm" read
 * as 03:00.
 */
function applyMeridiem(hour: number, text: string, at: number): number {
  if (hour > 12) return hour; // already unambiguous
  const before = text.slice(Math.max(0, at - 12), at);
  const after = text.slice(at, at + 12);
  const pm = PM_WORDS.test(before) || PM_WORDS.test(after);
  const am = AM_WORDS.test(before) || AM_WORDS.test(after);
  if (pm && hour < 12) return hour + 12;
  if (am && hour === 12) return 0;
  return hour;
}

// ---------------------------------------------------------------------------
// Day of week
// ---------------------------------------------------------------------------

const WEEKDAY_PATTERNS: Array<[RegExp, number]> = [
  [/\b(sun|sunday)\b|周日|週日|星期日|星期天|礼拜天|禮拜天|日曜/, 0],
  [/\b(mon|monday)\b|周一|週一|星期一|礼拜一|禮拜一|月曜/, 1],
  [/\b(tue|tues|tuesday)\b|周二|週二|星期二|礼拜二|禮拜二|火曜/, 2],
  [/\b(wed|weds|wednesday)\b|周三|週三|星期三|礼拜三|禮拜三|水曜/, 3],
  [/\b(thu|thur|thurs|thursday)\b|周四|週四|星期四|礼拜四|禮拜四|木曜/, 4],
  [/\b(fri|friday)\b|周五|週五|星期五|礼拜五|禮拜五|金曜/, 5],
  [/\b(sat|saturday)\b|周六|週六|星期六|礼拜六|禮拜六|土曜/, 6],
];

/** Every weekday named in the text, ascending. Empty when none is. */
function extractWeekdays(text: string): number[] {
  const found = WEEKDAY_PATTERNS.filter(([re]) => re.test(text)).map(([, d]) => d);
  return [...new Set(found)].sort((a, b) => a - b);
}

const WEEKDAYS_WORD = /\b(weekdays?|business days?|working days?)\b|工作日|平日|平常日/;
const WEEKEND_WORD = /\b(weekends?)\b|周末|週末|週末|土日/;

// ---------------------------------------------------------------------------
// Frequency
// ---------------------------------------------------------------------------

const EVERY = /\b(every|each|per)\b|每隔|每|毎|ごと/;
const MINUTES_UNIT = /\b(min|mins|minute|minutes)\b|分钟|分鐘|分間|分/;
const HOURS_UNIT = /\b(hour|hours|hourly|hr|hrs)\b|小时|小時|時間|時|时/;
const DAILY = /\b(daily|every ?day|each day)\b|每天|每日|毎日|毎朝/;
const WEEKLY = /\b(weekly|every ?week|each week)\b|每周|每週|毎週/;
const MONTHLY = /\b(monthly|every ?month|each month)\b|每月|毎月/;
const HOURLY = /\b(hourly)\b|每小时|每小時|毎時/;

/** "in 30 minutes" / "every 15 minutes" -> the number, or null. */
function extractInterval(text: string, unit: RegExp): number | null {
  // Latin: "every 15 minutes" | "every 15 min"
  const latin = text.match(new RegExp(String.raw`(?:every|each|per)\s*(\d{1,4})\s*(?:${unit.source})`, "i"));
  if (latin) return Number(latin[1]);
  // CJK: "每15分钟" | "15分ごと" | "每隔30分钟"
  const cjk = text.match(new RegExp(String.raw`(?:每隔?|毎)\s*([0-9〇零一二两兩三四五六七八九十]{1,3})\s*(?:${unit.source})`));
  if (cjk) return cjkNumber(cjk[1]);
  const suffix = text.match(new RegExp(String.raw`([0-9〇零一二两兩三四五六七八九十]{1,3})\s*(?:${unit.source})\s*(?:ごと|おき|每)`));
  if (suffix) return cjkNumber(suffix[1]);
  return null;
}

/** "on the 1st" / "每月1号" / "15日" -> day of month, or null. */
function extractDayOfMonth(text: string): number | null {
  const ordinal = text.match(/\b(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/);
  if (ordinal) {
    const n = Number(ordinal[1]);
    if (n >= 1 && n <= 31) return n;
  }
  const cjk = text.match(/([0-9〇零一二两兩三四五六七八九十]{1,3})\s*[号號日]/);
  if (cjk) {
    const n = cjkNumber(cjk[1]);
    if (n !== null && n >= 1 && n <= 31) return n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// One-off dates
// ---------------------------------------------------------------------------

const TODAY_WORDS = /\b(today|tonight)\b|今天|今日|今晚|今夜/;
const TOMORROW_WORDS = /\b(tomorrow)\b|明天|明日|翌日|あした/;

/** `YYYY-MM-DD` for a wall-clock date `days` after `base`, in `base`'s own fields. */
function shiftDate(base: { year: number; month: number; day: number }, days: number): string {
  const d = new Date(Date.UTC(base.year, base.month - 1, base.day + days));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

export interface ParseOptions {
  /**
   * "Now" as wall-clock fields in the schedule's zone. Only relative one-offs
   * ("tomorrow at 9") need it; pass the result of `zonedParts(new Date(), tz)`.
   * Omitted, relative dates are simply not recognised — which is the right
   * failure, since guessing a date from the server's zone would be wrong for
   * most users.
   */
  today?: { year: number; month: number; day: number };
}

/**
 * Best-effort structured schedule from a phrase. Returns null when nothing
 * recognisable is present, which is the caller's signal to use the model.
 */
export function parseSchedulePhrase(
  input: string,
  opts: ParseOptions = {},
): ParsedSchedule | null {
  const raw = input.trim();
  if (!raw) return null;
  // Lower-casing is safe for CJK and needed for the Latin patterns. Full-width
  // digits and colons are normalised so "９：００" behaves like "9:00".
  const text = raw
    .toLowerCase()
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ":");

  const time = extractTime(text);
  const t = time ?? { hour: 9, minute: 0 };
  // A phrase with no clock in it is a weaker signal than one with a time.
  const timePenalty = time ? 0 : 0.15;

  // ---- interval: every N minutes / hours -------------------------------
  const everyMinutes = EVERY.test(text) ? extractInterval(text, MINUTES_UNIT) : null;
  if (everyMinutes && everyMinutes >= 1 && everyMinutes <= 59) {
    return finish({
      kind: "recurring",
      cron: `*/${everyMinutes} * * * *`,
      matched: `every ${everyMinutes} minutes`,
      confidence: 0.95,
    });
  }
  const everyHours = EVERY.test(text) ? extractInterval(text, HOURS_UNIT) : null;
  if (everyHours && everyHours >= 1 && everyHours <= 23) {
    return finish({
      kind: "recurring",
      cron: `${t.minute} */${everyHours} * * *`,
      matched: `every ${everyHours} hours`,
      confidence: 0.9,
    });
  }
  if (HOURLY.test(text)) {
    return finish({
      kind: "recurring",
      cron: `${t.minute} * * * *`,
      matched: "hourly",
      confidence: 0.9,
    });
  }

  // ---- one-off: today / tomorrow ---------------------------------------
  if (opts.today && (TOMORROW_WORDS.test(text) || TODAY_WORDS.test(text))) {
    const days = TOMORROW_WORDS.test(text) ? 1 : 0;
    const onDate = shiftDate(opts.today, days);
    const [, month, day] = onDate.split("-").map(Number);
    return finish({
      kind: "one_off",
      cron: `${t.minute} ${t.hour} ${day} ${month} *`,
      onDate,
      matched: days ? "tomorrow" : "today",
      confidence: time ? 0.9 : 0.5,
    });
  }

  // ---- monthly ----------------------------------------------------------
  const dom = extractDayOfMonth(text);
  if (MONTHLY.test(text)) {
    const day = dom ?? 1;
    return finish({
      kind: "recurring",
      cron: `${t.minute} ${t.hour} ${day} * *`,
      matched: `monthly on day ${day}`,
      confidence: 0.88,
    });
  }

  // ---- weekly / named days ---------------------------------------------
  const days = extractWeekdays(text);
  if (WEEKDAYS_WORD.test(text)) {
    return finish({
      kind: "recurring",
      cron: `${t.minute} ${t.hour} * * 1-5`,
      matched: "every weekday",
      confidence: 0.92,
    });
  }
  if (WEEKEND_WORD.test(text)) {
    return finish({
      kind: "recurring",
      cron: `${t.minute} ${t.hour} * * 0,6`,
      matched: "every weekend day",
      confidence: 0.9,
    });
  }
  if (days.length) {
    return finish({
      kind: "recurring",
      cron: `${t.minute} ${t.hour} * * ${days.join(",")}`,
      matched: `weekly on ${days.length} day(s)`,
      confidence: 0.9,
    });
  }
  if (WEEKLY.test(text)) {
    // "weekly" with no day named: Monday is the conventional start of a work
    // week in every locale this product ships in.
    return finish({
      kind: "recurring",
      cron: `${t.minute} ${t.hour} * * 1`,
      matched: "weekly on Monday",
      confidence: 0.72,
    });
  }

  // ---- daily -------------------------------------------------------------
  if (DAILY.test(text)) {
    return finish({
      kind: "recurring",
      cron: `${t.minute} ${t.hour} * * *`,
      matched: "daily",
      confidence: 0.93,
    });
  }

  // ---- a bare time, no frequency ----------------------------------------
  // "at 18:00" almost always means "every day at 18:00", but not certainly, so
  // this lands under the floor and the caller confirms it.
  if (time) {
    return finish({
      kind: "recurring",
      cron: `${t.minute} ${t.hour} * * *`,
      matched: "time only — assumed daily",
      confidence: 0.55,
    });
  }

  return null;

  function finish(p: ParsedSchedule): ParsedSchedule | null {
    // A rule that composes an invalid expression is a bug, not a user error;
    // returning null routes the request to the model instead of persisting
    // something the cron engine will reject later.
    if (!isValidCron(p.cron)) return null;
    return { ...p, confidence: Math.max(0, Math.min(1, p.confidence - timePenalty)) };
  }
}
