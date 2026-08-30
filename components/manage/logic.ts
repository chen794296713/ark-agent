/**
 * Pure logic for the agent-management surface: dirty diffing, validation and the
 * small formatters the panels share. No React, no fetch, no DB — everything here
 * is a function of its arguments, which is why `tests/manage-config.test.ts` can
 * cover the parts that actually break (E.3's diff contract and E.4's rules).
 *
 * Validation returns CODES, not prose. A validator that returned English would
 * force every message through one language, and E.4 requires the client message to
 * be the same message the server sends — which is per-field and per-locale.
 * `lib/i18n/manage.ts` owns the wording; this file owns the decision.
 */
import { cronError, isValidTimeZone } from "@/lib/schedule/cron";
import type {
  AgentSkillRow,
  ContextItemRow,
  ManageSection,
  ManagedConfig,
  RuleRow,
  ScheduleRow,
} from "./types";

// ---------------------------------------------------------------------------
// Limits — the client mirror of the Zod schemas. The SERVER is the control.
// ---------------------------------------------------------------------------

export const LIMITS = {
  ruleTextMax: 280,
  ruleCountMax: 50,
  scheduleNameMax: 120,
  schedulePromptMax: 4000,
  scheduleIntervalMin: 60,
  maxRunsPerDayMin: 1,
  maxRunsPerDayMax: 288,
  skillCountMax: 12,
  // Base-10, to the byte, because `formatBytes` prints base-10: a 20 MiB cap
  // silently accepts a file every file manager calls "20.9 MB" while the error
  // string promises 20, which is the exact confusion the formatter avoids.
  contextItemMaxBytes: 20_000_000,
  contextItemCountMax: 50,
  contextTotalMaxBytes: 100_000_000,
  contextTextMax: 200_000,
} as const;

/**
 * Mirror of the §6.6 upload allowlist. Deliberately short: an agent's context is
 * text we chunk and embed, so a format we cannot read is a 20 MB bill for nothing.
 * A blank/unknown MIME is REJECTED rather than assumed — browsers report `""` for
 * plenty of files and "probably text" is how a binary ends up in a prompt.
 */
export const CONTEXT_MIME_ALLOWLIST = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export function isAllowedContextMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const bare = mime.split(";")[0]!.trim().toLowerCase();
  return (CONTEXT_MIME_ALLOWLIST as readonly string[]).includes(bare);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ErrCode =
  | "errRuleEmpty"
  | "errRuleLong"
  | "errRuleCount"
  | "errApprovalInt"
  | "errLimitInt"
  | "errScheduleName"
  | "errSchedulePrompt"
  | "errCron"
  | "errCronUnsupported"
  | "errTimezone"
  | "errInterval"
  | "errRunAt"
  | "errRunAtPast"
  | "errMaxRuns"
  | "errContextTooLarge"
  | "errContextType"
  | "errContextQuota"
  | "errContextEmpty"
  | "errContextName"
  | "errContextTextLong"
  | "errContextUrl"
  | "errSkillCount"
  | "errSkillRisk";

export interface FieldError {
  code: ErrCode;
  /** Interpolated into the message with `{name}` placeholders. */
  params?: Record<string, string | number>;
  /** Untranslated technical detail (e.g. the cron parser's own words). */
  detail?: string;
}

/** Keyed by the same dotted paths as the dirty diff, so one map serves both. */
export type ErrorMap = Record<string, FieldError>;

// ---------------------------------------------------------------------------
// Dirty diffing (E.3 rule 1: dirty means DIFFERENT, not TOUCHED)
// ---------------------------------------------------------------------------

/** Structural equality over the JSON-shaped values this config is made of. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]));
}

/**
 * Flatten the managed slice to dotted paths. Row identity is the row `id`, so a
 * reorder shows up as one `*.order` change rather than as N false edits — the
 * naive index-keyed flatten reports "5 unsaved changes" for a single drag, and a
 * user who is told they changed five things stops believing the counter.
 */
export function flattenConfig(cfg: ManagedConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  out["rules.order"] = cfg.rules.map((x) => x.id).join(",");
  for (const rule of cfg.rules) {
    out[`rules.${rule.id}.kind`] = rule.kind;
    out[`rules.${rule.id}.text`] = rule.text;
  }

  out["autonomy.level"] = cfg.autonomy.level;
  out["autonomy.approvalAmount"] = cfg.autonomy.approvalAmount;
  out["autonomy.approveExternalSends"] = cfg.autonomy.approveExternalSends;
  out["autonomy.dailyActionLimit"] = cfg.autonomy.dailyActionLimit;

  out["skills.attached"] = cfg.skills.map((x) => x.id).sort().join(",");
  for (const s of cfg.skills) {
    out[`skills.${s.id}.enabled`] = s.enabled;
    out[`skills.${s.id}.version`] = s.version;
    out[`skills.${s.id}.riskAcknowledged`] = s.riskAcknowledged;
  }

  out["context.items"] = cfg.context.map((x) => x.id).sort().join(",");

  out["schedules.set"] = cfg.schedules.map((x) => x.id).sort().join(",");
  for (const s of cfg.schedules) {
    out[`schedules.${s.id}.name`] = s.name;
    out[`schedules.${s.id}.kind`] = s.kind;
    out[`schedules.${s.id}.cronExpr`] = s.cronExpr;
    out[`schedules.${s.id}.intervalSeconds`] = s.intervalSeconds;
    out[`schedules.${s.id}.runAt`] = s.runAt;
    out[`schedules.${s.id}.timezone`] = s.timezone;
    out[`schedules.${s.id}.prompt`] = s.prompt;
    out[`schedules.${s.id}.deliverTo`] = s.deliverTo;
    out[`schedules.${s.id}.maxRunsPerDay`] = s.maxRunsPerDay;
    out[`schedules.${s.id}.enabled`] = s.enabled;
  }

  return out;
}

/** The four row collections, and the membership path each one flattens to. */
const ROW_SETS = [
  ["rules", "rules.order"],
  ["skills", "skills.attached"],
  ["context", "context.items"],
  ["schedules", "schedules.set"],
] as const;

type RowSet = (typeof ROW_SETS)[number][0];

function rowIds(cfg: ManagedConfig, kind: RowSet): string[] {
  switch (kind) {
    case "rules":
      return cfg.rules.map((x) => x.id);
    case "skills":
      return cfg.skills.map((x) => x.id);
    case "context":
      return cfg.context.map((x) => x.id);
    case "schedules":
      return cfg.schedules.map((x) => x.id);
  }
}

/**
 * Every path whose draft value differs from server truth.
 *
 * A row that exists on only one side is ONE change — the row — not one per field.
 * The flattened projection has ten paths per schedule, so the naive set-difference
 * counts a single "add schedule" as eleven unsaved changes, which is the same lie
 * about the counter that `flattenConfig` keys on row id to avoid. Reorder is judged
 * on the rows that SURVIVE, so appending a rule is one change rather than two.
 */
export function changedPaths(base: ManagedConfig, draft: ManagedConfig): string[] {
  const out = new Set<string>();
  const membership = new Set<string>();

  for (const [kind, membershipPath] of ROW_SETS) {
    membership.add(membershipPath);
    const before = rowIds(base, kind);
    const after = rowIds(draft, kind);
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    for (const id of after) if (!beforeSet.has(id)) out.add(`${kind}.${id}`);
    for (const id of before) if (!afterSet.has(id)) out.add(`${kind}.${id}`);
    // Only `rules` is user-ordered; the other three flatten to a sorted join
    // precisely because their order carries no meaning.
    if (kind === "rules") {
      const kept = before.filter((id) => afterSet.has(id)).join(",");
      const still = after.filter((id) => beforeSet.has(id)).join(",");
      if (kept !== still) out.add(membershipPath);
    }
  }

  const a = flattenConfig(base);
  const b = flattenConfig(draft);
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (membership.has(k)) continue; // decided per row above
    const parts = k.split(".");
    // `rules.<id>.text` on a row that was added or removed is already counted by
    // the row path; reporting it again is the inflation this function exists to stop.
    if (parts.length >= 3 && out.has(`${parts[0]}.${parts[1]}`)) continue;
    if (!deepEqual(a[k], b[k])) out.add(k);
  }

  return [...out].sort();
}

/** `autonomy` lives inside the RULES & BOUNDARIES card, not a section of its own. */
const SECTION_OF_PREFIX: Record<string, ManageSection> = {
  rules: "rules",
  autonomy: "rules",
  skills: "skills",
  context: "context",
  schedules: "schedules",
};

export function sectionOfPath(path: string): ManageSection | null {
  return SECTION_OF_PREFIX[path.split(".")[0]!] ?? null;
}

export type SectionCounts = Record<ManageSection, number>;

const emptyCounts = (): SectionCounts => ({ rules: 0, skills: 0, context: 0, schedules: 0 });

/** Fold a path list into the per-section counters the §E.1 rail glyphs render. */
export function countBySection(paths: Iterable<string>): SectionCounts {
  const out = emptyCounts();
  for (const p of paths) {
    const s = sectionOfPath(p);
    if (s) out[s] += 1;
  }
  return out;
}

export function totalOf(counts: SectionCounts): number {
  return counts.rules + counts.skills + counts.context + counts.schedules;
}

// ---------------------------------------------------------------------------
// Validation (E.4)
// ---------------------------------------------------------------------------

export function validateRules(rules: RuleRow[]): ErrorMap {
  const errors: ErrorMap = {};
  if (rules.length > LIMITS.ruleCountMax) {
    errors["rules"] = { code: "errRuleCount", params: { max: LIMITS.ruleCountMax } };
  }
  for (const rule of rules) {
    const text = rule.text.trim();
    if (!text) {
      errors[`rules.${rule.id}.text`] = { code: "errRuleEmpty" };
    } else if (text.length > LIMITS.ruleTextMax) {
      errors[`rules.${rule.id}.text`] = {
        // `{over}`, not `{len}`: that is the hole the dictionary actually has, and
        // `mt()` renders a missing param as "" — "Too long by  characters".
        code: "errRuleLong",
        params: { max: LIMITS.ruleTextMax, over: text.length - LIMITS.ruleTextMax },
      };
    }
  }
  return errors;
}

/** An integer ≥ 0. `""`, `1.5` and `-1` are all the same answer: no. */
function isNonNegativeInt(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

export function validateBoundaries(b: {
  approvalAmount: number;
  dailyActionLimit: number;
}): ErrorMap {
  const errors: ErrorMap = {};
  if (!isNonNegativeInt(b.approvalAmount)) {
    errors["autonomy.approvalAmount"] = { code: "errApprovalInt" };
  }
  if (!isNonNegativeInt(b.dailyActionLimit)) {
    errors["autonomy.dailyActionLimit"] = { code: "errLimitInt" };
  }
  return errors;
}

/** The month and day-of-week names `lib/schedule/cron.ts` resolves. */
const CRON_NAME_TOKENS =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|sun|mon|tue|wed|thu|fri|sat)\b/gi;

/**
 * Forms cron cannot express, separated from forms cron got wrong. `@daily`, a
 * seconds field and the Quartz `L`/`W`/`#` extensions all parse as "expected 5
 * fields" or "not a valid value", which tells a user who copied a line from a
 * Kubernetes manifest nothing at all about why it was refused.
 */
export function cronUnsupportedReason(expr: string): string | null {
  const e = expr.trim();
  if (!e) return null;
  if (e.startsWith("@")) return e.split(/\s+/)[0]!;
  const fields = e.split(/\s+/);
  if (fields.length === 6 || fields.length === 7) return "seconds";
  // Strip the month and day names `parseCron` accepts BEFORE hunting for Quartz
  // tokens, or `0 9 * * MON-WED` is rejected for the W in WED and `0 0 1 JUL *`
  // for the L in JUL — two expressions the parser handles perfectly well.
  const withoutNames = e.replace(CRON_NAME_TOKENS, "");
  const quartz = withoutNames.match(/[LW#]/i);
  if (quartz) return quartz[0]!;
  return null;
}

/**
 * E.4's timezone rule, which `lib/schedule/cron.ts` already implements: construct
 * an `Intl.DateTimeFormat` in a try/catch, never test membership of
 * `Intl.supportedValuesOf("timeZone")` — that omits IANA link names such as
 * `Asia/Calcutta` that live agents are already stored with. A second copy here
 * would be a second thing to keep in step with the scheduler.
 */
export const isValidTimeZoneSafe = isValidTimeZone;

/** Validate one schedule. Paths are bare field names so the editor can key on them. */
export function validateSchedule(s: ScheduleRow, now: Date = new Date()): ErrorMap {
  const errors: ErrorMap = {};

  const name = s.name.trim();
  if (!name || name.length > LIMITS.scheduleNameMax) {
    errors["name"] = { code: "errScheduleName", params: { max: LIMITS.scheduleNameMax } };
  }

  const prompt = s.prompt.trim();
  if (!prompt || prompt.length > LIMITS.schedulePromptMax) {
    errors["prompt"] = { code: "errSchedulePrompt", params: { max: LIMITS.schedulePromptMax } };
  }

  if (!isValidTimeZoneSafe(s.timezone)) {
    errors["timezone"] = { code: "errTimezone", params: { tz: s.timezone } };
  }

  if (s.kind === "cron") {
    const expr = (s.cronExpr ?? "").trim();
    const unsupported = cronUnsupportedReason(expr);
    if (unsupported) {
      errors["cronExpr"] = { code: "errCronUnsupported", params: { token: unsupported } };
    } else {
      const detail = expr ? cronError(expr) : "empty";
      if (detail) errors["cronExpr"] = { code: "errCron", detail };
    }
  } else if (s.kind === "interval") {
    const secs = s.intervalSeconds ?? 0;
    if (!Number.isInteger(secs) || secs < LIMITS.scheduleIntervalMin) {
      errors["intervalSeconds"] = {
        code: "errInterval",
        params: { min: LIMITS.scheduleIntervalMin },
      };
    }
  } else {
    const at = s.runAt ? new Date(s.runAt) : null;
    if (!at || Number.isNaN(at.getTime())) {
      errors["runAt"] = { code: "errRunAt" };
    } else if (at.getTime() <= now.getTime() && s.enabled && !s.lastRunAt) {
      // A one-shot keeps its `run_at` forever, so every schedule that has already
      // fired — and every one the user paused — is permanently "in the past".
      // Flagging those disables Save for the WHOLE config over a row nobody
      // touched. The check belongs only to a row that could still fire.
      errors["runAt"] = { code: "errRunAtPast" };
    }
  }

  if (
    !Number.isInteger(s.maxRunsPerDay) ||
    s.maxRunsPerDay < LIMITS.maxRunsPerDayMin ||
    s.maxRunsPerDay > LIMITS.maxRunsPerDayMax
  ) {
    errors["maxRunsPerDay"] = {
      code: "errMaxRuns",
      params: { min: LIMITS.maxRunsPerDayMin, max: LIMITS.maxRunsPerDayMax },
    };
  }

  return errors;
}

export function validateSchedules(schedules: ScheduleRow[], now?: Date): ErrorMap {
  const out: ErrorMap = {};
  for (const s of schedules) {
    for (const [field, err] of Object.entries(validateSchedule(s, now))) {
      out[`schedules.${s.id}.${field}`] = err;
    }
  }
  return out;
}

/**
 * A `removed` row is not attached any more, so it counts against neither the cap
 * nor the acknowledgement rule — counting it would leave an agent permanently at
 * 12/12 after a dozen detaches.
 */
export function activeSkills(skills: AgentSkillRow[]): AgentSkillRow[] {
  return skills.filter((s) => s.state !== "removed");
}

export function validateSkills(skills: AgentSkillRow[]): ErrorMap {
  const errors: ErrorMap = {};
  const active = activeSkills(skills);
  if (active.length > LIMITS.skillCountMax) {
    errors["skills"] = {
      code: "errSkillCount",
      params: { max: LIMITS.skillCountMax, count: active.length },
    };
  }
  for (const s of active) {
    // The CURRENT risk level governs, not the level at attach: a skill promoted to
    // `high` after a re-scan must re-ask, which is the entire point of keeping both.
    if (s.riskLevel === "high" && !s.riskAcknowledged) {
      errors[`skills.${s.id}.riskAcknowledged`] = {
        code: "errSkillRisk",
        params: { name: s.name },
      };
    }
  }
  return errors;
}

/** Rows that survive a harness switch but must not run until re-asserted (§E.2). */
export function needsRecheck(skill: AgentSkillRow, engine: string): boolean {
  return skill.state !== "removed" && skill.assertedHarness !== engine;
}

/** The MB figures the copy quotes, derived so a limit change cannot outrun them. */
const itemMaxMb = LIMITS.contextItemMaxBytes / 1_000_000;
const totalMaxMb = LIMITS.contextTotalMaxBytes / 1_000_000;

export function contextUsage(items: ContextItemRow[]): { count: number; bytes: number } {
  const live = items.filter((i) => i.state !== "removed");
  return {
    count: live.length,
    bytes: live.reduce((sum, i) => sum + (Number.isFinite(i.bytes) ? i.bytes : 0), 0),
  };
}

export function validateContextItems(items: ContextItemRow[]): ErrorMap {
  const errors: ErrorMap = {};
  const { count, bytes } = contextUsage(items);
  if (count > LIMITS.contextItemCountMax || bytes > LIMITS.contextTotalMaxBytes) {
    errors["context"] = {
      code: "errContextQuota",
      params: { maxItems: LIMITS.contextItemCountMax, maxMb: totalMaxMb },
    };
  }
  return errors;
}

/** Pre-flight for one file the user just dropped, before any byte is uploaded. */
export function validateContextUpload(
  file: { name: string; size: number; type: string },
  existing: ContextItemRow[],
): FieldError | null {
  if (!file.name.trim()) return { code: "errContextName" };
  if (file.size <= 0) return { code: "errContextEmpty" };
  if (file.size > LIMITS.contextItemMaxBytes) {
    return { code: "errContextTooLarge", params: { maxMb: itemMaxMb, name: file.name } };
  }
  if (!isAllowedContextMime(file.type)) {
    return { code: "errContextType", params: { name: file.name, mime: file.type || "unknown" } };
  }
  const { count, bytes } = contextUsage(existing);
  if (count + 1 > LIMITS.contextItemCountMax || bytes + file.size > LIMITS.contextTotalMaxBytes) {
    return {
      code: "errContextQuota",
      params: { maxItems: LIMITS.contextItemCountMax, maxMb: totalMaxMb },
    };
  }
  return null;
}

/**
 * Pre-flight for a pasted snippet. `LIMITS.contextTextMax` existed with nothing
 * reading it, so a 5 MB paste reached the server as the only line of defence.
 * The quota is charged in BYTES — one CJK character is three of them, and a
 * 200k-character paste in Chinese is 600 KB, not 200 KB.
 */
export function validateContextText(
  text: string,
  existing: ContextItemRow[],
): FieldError | null {
  const value = text.trim();
  if (!value) return { code: "errContextEmpty" };
  if (value.length > LIMITS.contextTextMax) {
    return {
      code: "errContextTextLong",
      params: { len: value.length, max: LIMITS.contextTextMax },
    };
  }
  const size = new TextEncoder().encode(value).length;
  const { count, bytes } = contextUsage(existing);
  if (count + 1 > LIMITS.contextItemCountMax || bytes + size > LIMITS.contextTotalMaxBytes) {
    return {
      code: "errContextQuota",
      params: { maxItems: LIMITS.contextItemCountMax, maxMb: totalMaxMb },
    };
  }
  return null;
}

/**
 * Pre-flight for a `url` context item. Two refusals, both about what the string
 * becomes later rather than how it looks now:
 *
 *  - **Scheme allowlist, not a blocklist.** `source_url` is stored, echoed back and
 *    eventually fetched by the runtime (§2.6 — in the agent's egress sandbox, never
 *    from the control plane). `javascript:`, `data:` and `file:` are the three that
 *    turn a stored string into an action the first time anything treats it as a
 *    link, and an allowlist cannot be out-argued by a new scheme.
 *  - **No credentials in the authority.** `https://user:token@host/x` puts a secret
 *    in a column we render on screen and hand to a third-party runtime. There is no
 *    version of that which is not a leak.
 *
 * This is a MIRROR. The server re-checks, and it is the server that must also do
 * the DNS-resolution and redirect-hop checks a client cannot perform.
 */
export function validateContextUrl(raw: string): FieldError | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { code: "errContextUrl" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { code: "errContextUrl" };
  if (url.username || url.password) return { code: "errContextUrl" };
  return null;
}

/** The whole managed slice at once — what the save bar disables Save on. */
export function validateManaged(cfg: ManagedConfig, now?: Date): ErrorMap {
  return {
    ...validateRules(cfg.rules),
    ...validateBoundaries(cfg.autonomy),
    ...validateSkills(cfg.skills),
    ...validateContextItems(cfg.context),
    ...validateSchedules(cfg.schedules, now),
  };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Byte sizes in the user's locale. Base-10 units, because a file manager showing
 * "20 MB" and an upload rejected at 20 MB must agree; base-2 makes the limit look
 * arbitrary by 4.8%.
 */
export function formatBytes(bytes: number, locale = "en-US"): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let u = 0;
  while (n >= 1000 && u < units.length - 1) {
    n /= 1000;
    u += 1;
  }
  const digits = u === 0 ? 0 : n < 10 ? 1 : 0;
  return `${n.toLocaleString(locale, { maximumFractionDigits: digits })} ${units[u]}`;
}

/** "45s" / "12m" / "2h" / "1d" for an interval schedule. */
export function formatInterval(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round((seconds / 3600) * 10) / 10}h`;
  return `${Math.round((seconds / 86400) * 10) / 10}d`;
}

/** A locally-unique id for a row that does not exist server-side yet. */
export function draftId(prefix: string): string {
  return `${prefix}_new_${Math.random().toString(36).slice(2, 10)}`;
}

export function isDraftId(id: string): boolean {
  return id.includes("_new_");
}
