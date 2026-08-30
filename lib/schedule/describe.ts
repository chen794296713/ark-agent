/**
 * Cron -> a sentence a person can check.
 *
 * A schedule editor that shows only `0 9 * * 1-5` makes the user verify our
 * work in a notation they do not read, so every place a schedule appears we
 * render this instead. The four languages are produced from ONE structural
 * analysis rather than four parallel pattern matchers, because the failure mode
 * of the parallel version is a Japanese string that quietly describes a
 * different schedule from the English one.
 *
 * Pure and client-safe.
 */

import { parseCron, type CronFields } from "./cron";
import type { Lang } from "@/lib/types";

/** The recognised shapes, in the order `analyzeCron` tries them. */
export type CronShape =
  | { kind: "everyMinute" }
  | { kind: "minuteInterval"; step: number }
  | { kind: "hourly"; minute: number }
  | { kind: "hourInterval"; step: number; minute: number }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "weekdays"; hour: number; minute: number }
  | { kind: "weekends"; hour: number; minute: number }
  | { kind: "weekly"; days: number[]; hour: number; minute: number }
  | { kind: "monthly"; day: number; hour: number; minute: number }
  | { kind: "yearly"; month: number; day: number; hour: number; minute: number }
  /** Anything the shapes above do not cover — rendered field by field. */
  | { kind: "generic"; fields: CronFields };

const ALL_MINUTES = 60;
const ALL_HOURS = 24;

/** Is this value set an even step over the whole field, e.g. `*​/15`? */
function stepOf(values: number[], size: number): number | null {
  if (values.length < 2 || values[0] !== 0) return null;
  const step = values[1];
  if (size % step !== 0 || values.length !== size / step) return null;
  for (let i = 0; i < values.length; i++) if (values[i] !== i * step) return null;
  return step;
}

const sameSet = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Classify an expression into the most specific shape that fits it. */
export function analyzeCron(expression: string): CronShape {
  const f = parseCron(expression);
  const everyMinute = f.minute.length === ALL_MINUTES;
  const everyHour = f.hour.length === ALL_HOURS;
  const everyMonth = f.month.length === 12;
  const anyDay = !f.domRestricted && !f.dowRestricted;

  if (anyDay && everyMonth) {
    if (everyMinute && everyHour) return { kind: "everyMinute" };
    if (everyHour) {
      const step = stepOf(f.minute, ALL_MINUTES);
      if (step) return { kind: "minuteInterval", step };
      if (f.minute.length === 1) return { kind: "hourly", minute: f.minute[0] };
    }
    if (f.minute.length === 1) {
      const step = stepOf(f.hour, ALL_HOURS);
      if (step) return { kind: "hourInterval", step, minute: f.minute[0] };
      if (f.hour.length === 1) return { kind: "daily", hour: f.hour[0], minute: f.minute[0] };
    }
  }

  // Everything below wants exactly one clock time; anything else is generic.
  if (f.minute.length === 1 && f.hour.length === 1) {
    const minute = f.minute[0];
    const hour = f.hour[0];

    if (f.dowRestricted && !f.domRestricted && everyMonth) {
      if (sameSet(f.dayOfWeek, [1, 2, 3, 4, 5])) return { kind: "weekdays", hour, minute };
      if (sameSet(f.dayOfWeek, [0, 6])) return { kind: "weekends", hour, minute };
      return { kind: "weekly", days: f.dayOfWeek, hour, minute };
    }
    if (f.domRestricted && !f.dowRestricted && f.dayOfMonth.length === 1) {
      if (everyMonth) return { kind: "monthly", day: f.dayOfMonth[0], hour, minute };
      if (f.month.length === 1) {
        return { kind: "yearly", month: f.month[0], day: f.dayOfMonth[0], hour, minute };
      }
    }
  }
  return { kind: "generic", fields: f };
}

// ---------------------------------------------------------------------------
// Localised vocabulary
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES: Record<Lang, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
  zht: ["週日", "週一", "週二", "週三", "週四", "週五", "週六"],
  ja: ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"],
};

const MONTH_NAMES: Record<Lang, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  zh: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  zht: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  ja: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
};

/** "1st", "2nd", "23rd" — English only; the CJK languages just take the number. */
function ordinalEn(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
/** 24-hour throughout: the product's audience spans zh/ja, where it is the norm,
 *  and a schedule is exactly the place an am/pm slip is expensive. */
const hhmm = (hour: number, minute: number) => `${pad(hour)}:${pad(minute)}`;

/** Join a day list the way each language does: "Mon, Wed and Fri" / "周一、周三和周五". */
function joinDays(days: number[], lang: Lang): string {
  const names = days.map((d) => WEEKDAY_NAMES[lang][d]);
  if (names.length === 1) return names[0];
  if (lang === "en") {
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  const sep = lang === "ja" ? "・" : "、";
  return names.join(sep);
}

/** Compress a numeric set for the generic fallback: [1,2,3,7] -> "1-3, 7". */
function compactList(values: number[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < values.length) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[j] + 1) j++;
    out.push(j - i >= 2 ? `${values[i]}-${values[j]}` : values.slice(i, j + 1).join(", "));
    i = j + 1;
  }
  return out.join(", ");
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

type Renderer = (s: CronShape) => string;

const RENDERERS: Record<Lang, Renderer> = {
  en: (s) => {
    switch (s.kind) {
      case "everyMinute": return "Every minute";
      case "minuteInterval": return `Every ${s.step} minutes`;
      case "hourly": return s.minute === 0 ? "Every hour, on the hour" : `Every hour at :${pad(s.minute)}`;
      case "hourInterval": return `Every ${s.step} hours at :${pad(s.minute)}`;
      case "daily": return `Every day at ${hhmm(s.hour, s.minute)}`;
      case "weekdays": return `Every weekday at ${hhmm(s.hour, s.minute)}`;
      case "weekends": return `Every weekend day at ${hhmm(s.hour, s.minute)}`;
      case "weekly": return `Every ${joinDays(s.days, "en")} at ${hhmm(s.hour, s.minute)}`;
      case "monthly": return `Monthly on the ${ordinalEn(s.day)} at ${hhmm(s.hour, s.minute)}`;
      case "yearly": return `Every year on ${MONTH_NAMES.en[s.month - 1]} ${ordinalEn(s.day)} at ${hhmm(s.hour, s.minute)}`;
      case "generic": return genericEn(s.fields);
    }
  },
  zh: (s) => {
    switch (s.kind) {
      case "everyMinute": return "每分钟";
      case "minuteInterval": return `每 ${s.step} 分钟`;
      case "hourly": return s.minute === 0 ? "每小时整点" : `每小时的 ${pad(s.minute)} 分`;
      case "hourInterval": return `每 ${s.step} 小时的 ${pad(s.minute)} 分`;
      case "daily": return `每天 ${hhmm(s.hour, s.minute)}`;
      case "weekdays": return `每个工作日 ${hhmm(s.hour, s.minute)}`;
      case "weekends": return `每个周末 ${hhmm(s.hour, s.minute)}`;
      case "weekly": return `每${joinDays(s.days, "zh")} ${hhmm(s.hour, s.minute)}`;
      case "monthly": return `每月 ${s.day} 号 ${hhmm(s.hour, s.minute)}`;
      case "yearly": return `每年 ${s.month} 月 ${s.day} 日 ${hhmm(s.hour, s.minute)}`;
      case "generic": return genericCjk(s.fields, "zh");
    }
  },
  zht: (s) => {
    switch (s.kind) {
      case "everyMinute": return "每分鐘";
      case "minuteInterval": return `每 ${s.step} 分鐘`;
      case "hourly": return s.minute === 0 ? "每小時整點" : `每小時的 ${pad(s.minute)} 分`;
      case "hourInterval": return `每 ${s.step} 小時的 ${pad(s.minute)} 分`;
      case "daily": return `每天 ${hhmm(s.hour, s.minute)}`;
      case "weekdays": return `每個工作日 ${hhmm(s.hour, s.minute)}`;
      case "weekends": return `每個週末 ${hhmm(s.hour, s.minute)}`;
      case "weekly": return `每${joinDays(s.days, "zht")} ${hhmm(s.hour, s.minute)}`;
      case "monthly": return `每月 ${s.day} 號 ${hhmm(s.hour, s.minute)}`;
      case "yearly": return `每年 ${s.month} 月 ${s.day} 日 ${hhmm(s.hour, s.minute)}`;
      case "generic": return genericCjk(s.fields, "zht");
    }
  },
  ja: (s) => {
    switch (s.kind) {
      case "everyMinute": return "毎分";
      case "minuteInterval": return `${s.step} 分ごと`;
      case "hourly": return s.minute === 0 ? "毎時 00 分" : `毎時 ${pad(s.minute)} 分`;
      case "hourInterval": return `${s.step} 時間ごと（${pad(s.minute)} 分）`;
      case "daily": return `毎日 ${hhmm(s.hour, s.minute)}`;
      case "weekdays": return `平日 ${hhmm(s.hour, s.minute)}`;
      case "weekends": return `土日 ${hhmm(s.hour, s.minute)}`;
      case "weekly": return `毎週${joinDays(s.days, "ja")} ${hhmm(s.hour, s.minute)}`;
      case "monthly": return `毎月 ${s.day} 日 ${hhmm(s.hour, s.minute)}`;
      case "yearly": return `毎年 ${s.month} 月 ${s.day} 日 ${hhmm(s.hour, s.minute)}`;
      case "generic": return genericCjk(s.fields, "ja");
    }
  },
};

function genericEn(f: CronFields): string {
  const parts: string[] = [];
  parts.push(f.minute.length === 60 ? "every minute" : `minute ${compactList(f.minute)}`);
  if (f.hour.length !== 24) parts.push(`hour ${compactList(f.hour)}`);
  if (f.domRestricted) parts.push(`day ${compactList(f.dayOfMonth)}`);
  if (f.month.length !== 12) parts.push(`month ${compactList(f.month)}`);
  if (f.dowRestricted) parts.push(`on ${f.dayOfWeek.map((d) => WEEKDAY_NAMES.en[d]).join(", ")}`);
  const base = `At ${parts.join(", ")}`;
  // The Vixie union is the single most misread part of cron, so when both day
  // fields are restricted the description says so rather than leaving the user
  // to assume an intersection.
  return f.domRestricted && f.dowRestricted
    ? `${base} (day-of-month OR day-of-week — either one fires it)`
    : base;
}

function genericCjk(f: CronFields, lang: "zh" | "zht" | "ja"): string {
  const L = {
    zh: { min: "分", hour: "时", day: "日", month: "月", on: "于", union: "（按“日”或“星期”任一匹配触发）" },
    zht: { min: "分", hour: "時", day: "日", month: "月", on: "於", union: "（依「日」或「星期」任一符合即觸發）" },
    ja: { min: "分", hour: "時", day: "日", month: "月", on: "", union: "（日または曜日のいずれかで実行）" },
  }[lang];
  const parts: string[] = [];
  if (f.minute.length !== 60) parts.push(`${compactList(f.minute)} ${L.min}`);
  if (f.hour.length !== 24) parts.push(`${compactList(f.hour)} ${L.hour}`);
  if (f.domRestricted) parts.push(`${compactList(f.dayOfMonth)} ${L.day}`);
  if (f.month.length !== 12) parts.push(`${compactList(f.month)} ${L.month}`);
  if (f.dowRestricted) {
    parts.push(f.dayOfWeek.map((d) => WEEKDAY_NAMES[lang][d]).join(lang === "ja" ? "・" : "、"));
  }
  const base = parts.join(" · ") || (lang === "ja" ? "毎分" : "每分钟");
  return f.domRestricted && f.dowRestricted ? `${base}${L.union}` : base;
}

/**
 * A human sentence for `expression` in `lang`. Returns null when the expression
 * does not parse, so a caller can show the parse error instead of a lie.
 */
export function describeCron(expression: string, lang: Lang = "en"): string | null {
  let shape: CronShape;
  try {
    shape = analyzeCron(expression);
  } catch {
    return null;
  }
  return RENDERERS[lang](shape);
}

/** `describeCron` with the zone appended — what the schedule list shows. */
export function describeSchedule(
  expression: string,
  timeZone: string,
  lang: Lang = "en",
): string | null {
  const text = describeCron(expression, lang);
  return text === null ? null : `${text} · ${timeZone}`;
}
