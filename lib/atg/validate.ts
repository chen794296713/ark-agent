/**
 * Everything that stands between a generated draft and a live agent.
 *
 * Four jobs, in the order a draft meets them:
 *
 *  1. **Intake hygiene** — `normalizeBrief()` NFKC-normalizes the user's text,
 *     strips the invisible ranges and the fence token, and reports each strip as
 *     an `InjectionFinding` rather than cleaning silently. A bidi override in a
 *     product brief is a signal, not a typo.
 *  2. **The injection screen** — `screenInjection()`, a regex bank in all four
 *     languages. It never aborts and never edits meaning: a legitimate brief
 *     genuinely can say "never email credentials".
 *  3. **Schema validation** — `validateDraft()` over `agentTemplateDraftSchema`.
 *  4. **The guardrail linter** — `lintDraft()` finds, `remediateDraft()` fixes.
 *
 * THE RULE OF REMEDIATION, and it is the reason this file can be trusted: every
 * automatic fix moves in the RESTRICTIVE direction. Nothing here grants a
 * capability, raises a limit, widens a permission or enables a tool. A
 * remediation that loosened something would turn a lint failure into a
 * privilege-escalation path, so there is no code below that writes `true` into a
 * tool flag, raises `dailyActionLimit`, or moves `autonomy` towards `auto`.
 *
 * `ATG-L013` is the ONE error with no safe automatic fix — a hard rule
 * contradicted by a task the same draft schedules is a human judgement — and it
 * is therefore the only way `materializable` is ever false. Every other `error`
 * has a remediation, and `tests/atg-validate.test.ts` asserts that invariant so
 * adding an unremediable rule forces a deliberate decision.
 *
 * Pure and client-safe: no `server-only`, no I/O, no environment reads. The
 * review screen runs the same linter in the browser on an edited draft.
 */
import { z } from "zod";
import type { Lang } from "@/lib/types";
import { isValidCron, isValidTimeZone, runsBetween, zonedParts } from "@/lib/schedule/cron";
import { roleHue } from "@/lib/theme";
import { agentTemplateDraftSchema } from "./schema";
import {
  CONTEXT_MAX_BYTES_CEILING,
  DEFAULT_CONTEXT_MIME_TYPES,
  isContextMimeType,
  isSafePublicHttpsUrl,
} from "./safety";
import { RULE_TEMPLATES, STOPWORDS } from "./defaults";
import type {
  AgentTemplateDraft,
  DraftWarning,
  InjectionFinding,
  TemplateRule,
  WarningSeverity,
} from "./types";

// ---------------------------------------------------------------------------
// 1 · Intake hygiene
// ---------------------------------------------------------------------------

/** After NFKC. NFKC can LENGTHEN a string ("ﬁ" → "fi"), so the cap is applied last. */
export const BRIEF_MAX_CHARS = 4000;

/**
 * The invisible ranges, written as escapes and never as literal characters: a
 * module that smuggles the very code points it defends against cannot be
 * reviewed by reading it.
 *
 * U+200B–U+200D zero-width space/non-joiner/joiner · U+2060 word joiner ·
 * U+FEFF BOM · U+00AD soft hyphen · U+202A–U+202E and U+2066–U+2069 bidi
 * overrides and isolates.
 */
const INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF\u00AD\u202A-\u202E\u2066-\u2069]/g;

/** C0 and C1 controls, keeping `\n` and `\t`. */
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** A brief must not be able to open or close its own fence. */
const FENCE_RE = /<\/?user_brief[^>]*>/gi;

export interface NormalizedBrief {
  brief: string;
  findings: InjectionFinding[];
}

function excerpt(source: string, offset: number): string {
  return source.slice(Math.max(0, offset - 20), offset + 60).replace(/\s+/g, " ").slice(0, 80);
}

/**
 * NFKC, strip, collapse, cap — and record every strip.
 *
 * Order matters: normalize first so a full-width `＜` becomes `<` before the
 * fence strip looks for one, and cap last because NFKC can grow the string.
 */
export function normalizeBrief(raw: string): NormalizedBrief {
  const findings: InjectionFinding[] = [];
  const normalized = (raw ?? "").normalize("NFKC");

  for (const m of normalized.matchAll(INVISIBLE_RE)) {
    findings.push({
      pattern: "hidden_text",
      offset: m.index ?? 0,
      excerpt: excerpt(normalized, m.index ?? 0),
      severity: "warn",
    });
  }
  for (const m of normalized.matchAll(FENCE_RE)) {
    findings.push({
      pattern: "fence_break",
      offset: m.index ?? 0,
      excerpt: excerpt(normalized, m.index ?? 0),
      severity: "error",
    });
  }

  const brief = normalized
    .replace(INVISIBLE_RE, "")
    .replace(FENCE_RE, " ")
    .replace(CONTROL_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, BRIEF_MAX_CHARS);

  return { brief, findings };
}

// ---------------------------------------------------------------------------
// 2 · The injection screen
// ---------------------------------------------------------------------------

/**
 * Severity is FIXED per pattern, never inferred. `ATG-L023` counts
 * `error`-severity findings, and a rule that counts something the design never
 * pinned down is a rule nobody can implement twice the same way.
 *
 * `exfil` is deliberately `warn` and deliberately does NOT arm `ATG-L017`. The
 * single likeliest `exfil` match in a real brief is a legitimate instruction —
 * *"never email credentials to anyone"* — which the boundaries stage correctly
 * turns into a hard rule. An overlap check armed by `exfil` would delete exactly
 * the guardrail the user asked for, which is strictly worse than the attack.
 */
interface InjectionPattern {
  id: string;
  severity: WarningSeverity;
  /** Arms `ATG-L017`'s output overlap check. Capability-seeking patterns only. */
  arms: boolean;
  re: RegExp;
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  {
    id: "override",
    severity: "error",
    arms: true,
    re: /(ignore\s+(all\s+)?(previous|prior|above)|disregard[\s\S]{0,20}instructions|忽略(以上|之前|前面)[\s\S]{0,6}(指令|指示|提示)|これまでの指示を無視|前の指示は無視)/gi,
  },
  {
    id: "role_play",
    severity: "error",
    arms: true,
    re: /(you\s+are\s+(now|actually)|system\s+prompt|developer\s+mode|作为系统|作為系統|システムプロンプト|開発者モード)/gi,
  },
  {
    id: "tool_grab",
    severity: "error",
    arms: true,
    re: /((install|add|enable)[\s\S]{0,30}(skill|plugin|mcp)|enable\s+(shell|docker|root)|\bsudo\b|--dangerously)/gi,
  },
  { id: "encoded_blob", severity: "warn", arms: true, re: /([A-Za-z0-9+/]{120,}={0,2}|[0-9a-fA-F]{120,})/g },
  {
    id: "exfil",
    severity: "warn",
    arms: false,
    re: /(~\/\.ssh|\.env\b|~\/\.aws|id_rsa|keychain|send[\s\S]{0,30}(to|至|へ)[\s\S]{0,40}@|curl[\s\S]{0,60}\|\s*(sh|bash))/gi,
  },
  {
    id: "hidden_text",
    severity: "warn",
    arms: false,
    re: /(<!--[\s\S]{0,200}?-->|color:\s*#?(fff(fff)?|white)\b)/gi,
  },
];

/** Patterns whose presence in the brief arms the `ATG-L017` output check. */
const ARMING_PATTERNS = new Set(
  INJECTION_PATTERNS.filter((p) => p.arms).map((p) => p.id).concat("fence_break"),
);

/**
 * Find, record, and change nothing.
 *
 * Deliberately NOT done: asking a model whether the input is an injection. That
 * is a model call whose input is the attack, and it fails open.
 */
export function screenInjection(brief: string): InjectionFinding[] {
  const out: InjectionFinding[] = [];
  for (const p of INJECTION_PATTERNS) {
    // Fresh lastIndex per call — these are module-level /g regexes.
    p.re.lastIndex = 0;
    for (const m of brief.matchAll(p.re)) {
      out.push({
        pattern: p.id,
        offset: m.index ?? 0,
        excerpt: (m[0] ?? "").replace(/\s+/g, " ").slice(0, 80),
        severity: p.severity,
      });
      if (out.length >= 40) return out;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3 · The PII detector (§6.5) — sets a flag, never rejects
// ---------------------------------------------------------------------------

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /\+?\d[\d\s().-]{7,16}\d/;
const DIGIT_RUN_RE = /\d[\d\s-]{11,21}\d/g;
const PII_WORD_RE = /(passport|social\s+security|身份证|身分證|マイナンバー)/i;

/** Luhn, on the digits only. 13–19 digits is the card-number band. */
function luhnOk(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** PRC resident identity card: 17 digits plus a checksum character. */
const PRC_ID_RE = /\b\d{17}[\dXx]\b/g;
const PRC_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const PRC_CHECK = "10X98765432";

function prcIdOk(value: string): boolean {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += (value.charCodeAt(i) - 48) * PRC_WEIGHTS[i];
  return PRC_CHECK[sum % 11] === value[17].toUpperCase();
}

/** True when the text carries something a retention policy has to care about. */
export function containsPii(text: string): boolean {
  if (!text) return false;
  if (EMAIL_RE.test(text)) return true;
  if (PII_WORD_RE.test(text)) return true;
  if (PHONE_RE.test(text)) return true;
  for (const m of text.matchAll(DIGIT_RUN_RE)) {
    if (luhnOk(m[0].replace(/\D/g, ""))) return true;
  }
  for (const m of text.matchAll(PRC_ID_RE)) {
    if (prcIdOk(m[0])) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The `tooThin` test (§2.2) — not a length test
// ---------------------------------------------------------------------------

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;

/**
 * Content tokens after stopword removal. A 6-character Chinese brief can be
 * perfectly specific and a 200-character English one can say nothing, so this
 * counts meaning, not bytes. CJK has no whitespace to tokenize on, so it counts
 * segments left after punctuation and stopword stripping.
 */
export function contentTokenCount(brief: string, lang: Lang): number {
  const stop = STOPWORDS[lang] ?? STOPWORDS.en;
  if (lang === "en" && !CJK_RE.test(brief)) {
    return brief
      .toLowerCase()
      .split(/[^a-z0-9'-]+/)
      .filter((w) => w.length > 1 && !stop.has(w)).length;
  }
  let text = brief;
  for (const word of stop) text = text.split(word).join(" ");
  return text
    .split(/[\s\p{P}\p{S}]+/u)
    .filter((s) => s.length > 0)
    .reduce((n, seg) => n + (CJK_RE.test(seg) ? seg.length : 1), 0);
}

/** Fewer than three content tokens is "help me with stuff". The route answers 422. */
export function isTooThin(brief: string, lang: Lang): boolean {
  return contentTokenCount(brief, lang) < 3;
}

// ---------------------------------------------------------------------------
// 4a · Failure class 1 — the model did not return JSON
// ---------------------------------------------------------------------------

export type JsonRead = { ok: true; value: unknown } | { ok: false; reason: string };

/**
 * Tolerant strict-JSON reader. Three recoveries, in order: a fence, a prose
 * preamble or epilogue, and a trailing comma.
 *
 * Deliberately NOT recovered: smart quotes. Replacing U+201C/U+201D with `"`
 * would fix the rare model that quotes its KEYS wrongly and corrupt the far
 * commoner case of a curly quote appearing INSIDE a legitimate string value — a
 * Japanese mission, a rule quoting the user. JSON permits those; a blind replace
 * turns a valid document into an invalid one. The repair call handles the rare
 * case instead.
 */
export function readJsonObject(raw: string): JsonRead {
  if (!raw?.trim()) return { ok: false, reason: "empty response" };
  let body = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
  if (fence) body = fence[1].trim();
  if (!body.startsWith("{")) {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) body = body.slice(start, end + 1);
  }
  for (const candidate of [body, body.replace(/,(\s*[}\]])/g, "$1")]) {
    try {
      const value: unknown = JSON.parse(candidate);
      // A bare array or string parses fine and then fails every stage schema
      // with a useless error. Reject it here, where the reason is legible.
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return { ok: false, reason: "top level is not an object" };
      }
      return { ok: true, value };
    } catch {
      /* try the next recovery */
    }
  }
  return { ok: false, reason: "unparseable after fence/brace/comma recovery" };
}

// ---------------------------------------------------------------------------
// 4 · Schema validation
// ---------------------------------------------------------------------------

export type DraftValidation =
  | { ok: true; draft: AgentTemplateDraft }
  | { ok: false; errors: string };

/** Parse a draft, returning `z.treeifyError()` text a repair prompt can carry. */
export function validateDraft(value: unknown): DraftValidation {
  const parsed = agentTemplateDraftSchema.safeParse(value);
  if (parsed.success) return { ok: true, draft: parsed.data };
  return { ok: false, errors: JSON.stringify(z.treeifyError(parsed.error)).slice(0, 4000) };
}

// ---------------------------------------------------------------------------
// 5 · The guardrail linter
// ---------------------------------------------------------------------------

/** What the linter cannot read off the draft itself. */
export interface LintContext {
  /** Slugs already taken in this workspace. Drives ATG-L020. */
  existingSlugs?: readonly string[];
  /** `must` capabilities no candidate could cover. Drives ATG-L005. */
  uncoveredCapabilities?: readonly string[];
  /** The workspace's ATG budget was spent and this ran deterministically. ATG-L024. */
  budgetExhausted?: boolean;
  /** The user asked for a deliberately mixed-harness template. Suppresses ATG-L015. */
  multiHarnessRequested?: boolean;
  /** The seeded role's own avatar, for ATG-L025's replacement. */
  seeded?: { mono: string; hue: string } | null;
  /** "Now", so schedule maths is deterministic in tests. */
  now?: Date;
}

const MONEY_RE =
  /(pay(ment|ing|out)?|invoic|refund|charge|billing|purchase|spend|transfer|wire|deposit|salary|付款|支付|发票|發票|退款|收款|转账|轉帳|报销|報銷|账单|帳單|請求書|支払|返金|送金|入金|経費|給与)/i;

const SEND_RE =
  /(send|e-?mail|publish|post|reply|dispatch|broadcast|发送|發送|发布|發布|回复|回覆|邮件|郵件|投稿|送信|返信|公開|配信)/i;

const CONTAINER_RE =
  /(container|docker|build|deploy|environment|image|容器|镜像|鏡像|构建|建置|部署|环境|環境|コンテナ|ビルド|デプロイ)/i;

/** A "hard" rule opens with one of these, or its equivalent in the output language. */
const NEGATION_RE = /^\s*(never|do not|don't|no\b|绝不|絕不|不要|不得|請勿|请勿|禁止|絶対に|してはいけない|しないこと)/i;

/**
 * A qualifier that turns an absolute prohibition into a gate. `ATG-L013` skips
 * any hard rule carrying one — see the note at its call site.
 */
const CONDITIONAL_RE =
  /(without|unless|until|except|approval|approve|sign-?off|permission|未经|未經|除非|批准|核准|承認|事前|なしに|なく)/i;

const HUE_VALUES = new Set(Object.values(roleHue).map((h) => h.toLowerCase()));

function warn(
  code: string,
  severity: WarningSeverity,
  path: string,
  message: string,
  remediation: string | null,
): DraftWarning {
  return { code, severity, path, message, remediation, remediated: false };
}

/** Every string in the draft that describes work the agent will DO. */
function actionTexts(d: AgentTemplateDraft): string[] {
  const out: string[] = [];
  for (const r of d.roles) out.push(...r.responsibilities, r.mission);
  for (const a of d.agents) {
    out.push(a.brief);
    for (const t of a.tasks) out.push(t.text);
  }
  for (const s of d.schedules) out.push(s.prompt, s.title);
  for (const s of d.skills) out.push(s.purpose, s.displayName);
  return out;
}

function externalChannels(d: AgentTemplateDraft): string[] {
  const set = new Set<string>();
  for (const a of d.agents) for (const c of a.channels) if (c !== "web") set.add(c);
  return [...set];
}

function anyAgent(d: AgentTemplateDraft, pick: (a: AgentTemplateDraft["agents"][number]) => boolean): boolean {
  return d.agents.some(pick);
}

/** Runs of a cron in the 24 hours after `now`, capped so a per-minute cron is cheap. */
function runsInDay(cron: string, tz: string, now: Date): number {
  if (!isValidCron(cron) || !isValidTimeZone(tz)) return 0;
  const to = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  try {
    const { runs, truncated } = runsBetween(cron, now, to, tz, 400);
    return truncated ? 400 : runs.length;
  } catch {
    return 0;
  }
}

/** Digits that look like real data in a generated skeleton. ATG-L021. */
const FAKE_DATA_RE = /([$¥€£￥]\s?\d|\d{3,})/;

/**
 * Find every finding. Pure — it never touches the draft.
 *
 * The codes are stable ids; the localized copy the UI renders lives in
 * `lib/i18n/templates.ts` keyed by `code`, and `message` stays English for logs.
 */
export function lintDraft(draft: AgentTemplateDraft, ctx: LintContext = {}): DraftWarning[] {
  const w: DraftWarning[] = [];
  const b = draft.boundaries;
  const now = ctx.now ?? new Date();
  const texts = actionTexts(draft);
  const touchesMoney = texts.some((t) => MONEY_RE.test(t));
  const ext = externalChannels(draft);
  const hasMoneyRule = b.rules.some((r) => r.category === "money");
  const hasExternalRule = b.rules.some((r) => r.category === "external_comms");

  // --- money and autonomy -------------------------------------------------
  if (touchesMoney && (b.autonomy === "auto" || (b.approvalAmountUsd > 0 && !hasMoneyRule))) {
    w.push(
      warn(
        "ATG-L001",
        "error",
        "/boundaries/autonomy",
        "the agent's work touches money without an approval gate",
        "autonomy set to ask, approval amount set to 0, a hard money rule appended",
      ),
    );
  }
  if (ext.length > 0 && b.autonomy === "auto" && !b.approveExternalSends) {
    w.push(
      warn(
        "ATG-L002",
        "error",
        "/boundaries/approveExternalSends",
        `autonomous agent can send on ${ext.join(", ")} without review`,
        "external sends now require approval",
      ),
    );
  }
  if (anyAgent(draft, (a) => a.tools.shell && a.tools.browser) && b.autonomy === "auto") {
    w.push(
      warn(
        "ATG-L003",
        "error",
        "/boundaries/autonomy",
        "shell and browser together are not an autonomous combination",
        "autonomy set to ask",
      ),
    );
  }
  draft.agents.forEach((a, i) => {
    if (a.tools.docker && !texts.some((t) => CONTAINER_RE.test(t))) {
      w.push(
        warn(
          "ATG-L004",
          "warn",
          `/agents/${i}/tools/docker`,
          "docker enabled with no responsibility that needs a container",
          "docker disabled",
        ),
      );
    }
  });
  for (const cap of ctx.uncoveredCapabilities ?? []) {
    w.push(
      warn(
        "ATG-L005",
        "info",
        "/skills",
        `no catalogue skill could cover "${cap}"`.slice(0, 300),
        null,
      ),
    );
  }
  if (b.autonomy === "auto" && draft.skills.some((s) => (s.requirements.env?.length ?? 0) >= 3)) {
    w.push(
      warn(
        "ATG-L006",
        "error",
        "/boundaries/autonomy",
        "a selected skill brokers three or more credentials",
        "autonomy set to ask",
      ),
    );
  }

  // --- schedules ----------------------------------------------------------
  const slots = new Map<string, number>();
  draft.schedules.forEach((s, i) => {
    if (!isValidCron(s.cron) || !isValidTimeZone(s.timezone)) {
      w.push(
        warn("ATG-L010", "error", `/schedules/${i}/cron`, "unparseable cron or time zone", "schedule dropped"),
      );
      return;
    }
    const perDay = runsInDay(s.cron, s.timezone, now);
    if (perDay > 96 || perDay > s.maxRunsPerDay) {
      w.push(
        warn(
          "ATG-L007",
          "error",
          `/schedules/${i}/cron`,
          `fires ${perDay} times a day, above the generator's ceiling of 96 and its own cap of ${s.maxRunsPerDay}`,
          "interval raised to 15 minutes, or the schedule disabled when it cannot be raised",
        ),
      );
    }
    const [minute, hour] = s.cron.split(/\s+/);
    const slot = `${minute}|${hour}|${s.timezone}`;
    slots.set(slot, (slots.get(slot) ?? 0) + 1);
    if (s.kind === "one_off" && s.onDate) {
      const today = zonedParts(now, s.timezone);
      const todayKey = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
      if (s.onDate < todayKey && s.enabled) {
        w.push(
          warn("ATG-L009", "error", `/schedules/${i}/onDate`, "one-off date already passed", "schedule disabled"),
        );
      }
    }
  });
  for (const [slot, n] of slots) {
    if (n >= 3) {
      w.push(
        warn(
          "ATG-L008",
          "warn",
          "/schedules",
          `${n} schedules share the slot ${slot}`,
          "staggered in 7-minute steps",
        ),
      );
    }
  }

  // --- escalation, retention, PII ----------------------------------------
  const approvalsNeeded = b.autonomy !== "auto" || b.approveExternalSends;
  if (approvalsNeeded && b.escalation.channel === "none") {
    w.push(
      warn(
        "ATG-L011",
        "warn",
        "/boundaries/escalation/channel",
        "approvals are required but there is nowhere to send them",
        "escalation channel set to chat",
      ),
    );
  }
  const piiItems = draft.context.filter(
    (c) => containsPii(`${c.body ?? ""}\n${c.placeholder ?? ""}\n${c.purpose}`) || c.containsPii,
  );
  if (piiItems.length > 0 && b.dataHandling.retentionDays > 365) {
    w.push(
      warn(
        "ATG-L012",
        "warn",
        "/boundaries/dataHandling/retentionDays",
        "personal data held longer than a year",
        "retention clamped to 365 days and the item flagged",
      ),
    );
  }

  // --- a hard rule contradicted by the work the draft schedules -----------
  for (const rule of b.rules) {
    if (rule.severity !== "hard") continue;
    // A CONDITIONAL prohibition is not contradicted by a task that does the
    // thing: "never send without approval" plus "draft and send the follow-up"
    // is the approval gate working, not a contradiction. Firing on those would
    // make ATG-L013 — the one unremediable error — a false positive on every
    // outreach template, which is the fastest way to teach people to ignore it.
    if (CONDITIONAL_RE.test(rule.text)) continue;
    const forbidsSending = NEGATION_RE.test(rule.text) && SEND_RE.test(rule.text);
    const forbidsMoney = NEGATION_RE.test(rule.text) && MONEY_RE.test(rule.text);
    if (!forbidsSending && !forbidsMoney) continue;
    const contradicted = [
      ...draft.schedules.map((s) => s.prompt),
      ...draft.agents.flatMap((a) => a.tasks.map((t) => t.text)),
    ].some((t) => {
      if (NEGATION_RE.test(t)) return false;
      return (forbidsSending && SEND_RE.test(t)) || (forbidsMoney && MONEY_RE.test(t));
    });
    if (contradicted) {
      w.push(
        warn(
          "ATG-L013",
          "error",
          "/boundaries/rules",
          `hard rule "${rule.text.slice(0, 80)}" is contradicted by a task or schedule this draft creates`,
          null,
        ),
      );
      break;
    }
  }

  // --- skills, harness, references ---------------------------------------
  const proposed = draft.skills.filter((s) => s.skillId === null);
  if (draft.skills.length === 0) {
    w.push(warn("ATG-L014", "info", "/skills", "no catalogue skill was selected", null));
  } else if (proposed.length > 2) {
    w.push(
      warn(
        "ATG-L014",
        "info",
        "/skills",
        `${proposed.length} unresolved skills`,
        "unresolved entries beyond the second dropped",
      ),
    );
  }
  if (!ctx.multiHarnessRequested) {
    draft.agents.forEach((a, i) => {
      if (a.harness !== draft.harness) {
        w.push(
          warn(
            "ATG-L015",
            "error",
            `/agents/${i}/harness`,
            "agent harness disagrees with the template harness",
            "agent harness set to the template's",
          ),
        );
      }
    });
  }
  const skillKeys = new Set(draft.skills.map((s) => s.key));
  const scheduleKeys = new Set(draft.schedules.map((s) => s.key));
  const contextKeys = new Set(draft.context.map((c) => c.key));
  const roleKeys = new Set(draft.roles.map((r) => r.key));
  const agentKeys = new Set(draft.agents.map((a) => a.key));
  const dangling =
    draft.agents.some(
      (a) =>
        !roleKeys.has(a.roleKey) ||
        a.skillKeys.some((k) => !skillKeys.has(k)) ||
        a.scheduleKeys.some((k) => !scheduleKeys.has(k)) ||
        a.contextKeys.some((k) => !contextKeys.has(k)),
    ) || draft.schedules.some((s) => !agentKeys.has(s.agentKey));
  if (dangling) {
    w.push(warn("ATG-L016", "error", "/agents", "a draft-local reference points at nothing", "reference dropped"));
  }

  // --- the output check the injection screen arms ------------------------
  const armed = draft.provenance.injectionFindings.filter((f) => ARMING_PATTERNS.has(f.pattern));
  if (armed.length > 0) {
    const tainted = taintedElements(draft, armed);
    if (tainted.length > 0) {
      w.push(
        warn(
          "ATG-L017",
          "error",
          tainted[0].path,
          `${tainted.length} generated element(s) echo text next to a capability-seeking injection finding`,
          "the offending skill, context item, schedule prompt or task removed",
        ),
      );
    }
  }

  // --- limits -------------------------------------------------------------
  if (
    anyAgent(draft, (a) => a.settings.alwaysOn && a.settings.heartbeatMinutes < 5) &&
    b.spend.monthlyCreditCap === 0
  ) {
    w.push(
      warn(
        "ATG-L018",
        "warn",
        "/agents/0/settings/heartbeatMinutes",
        "sub-5-minute heartbeat with no spend cap",
        "heartbeat raised to 15 minutes",
      ),
    );
  }
  if (b.autonomy === "auto" && b.dailyActionLimit === 0) {
    w.push(
      warn(
        "ATG-L019",
        "error",
        "/boundaries/dailyActionLimit",
        "unlimited actions with full autonomy",
        "daily action limit set to 200",
      ),
    );
  }
  if ((ctx.existingSlugs ?? []).includes(draft.meta.slug)) {
    w.push(
      warn("ATG-L020", "error", "/meta/slug", "slug already used in this workspace", "suffixed until unique"),
    );
  }

  // --- generated content that looks like real data ------------------------
  draft.context.forEach((c, i) => {
    if (c.body && FAKE_DATA_RE.test(c.body)) {
      w.push(
        warn(
          "ATG-L021",
          "warn",
          `/context/${i}/body`,
          "generated skeleton contains something that reads as real data",
          "the run replaced with a blank and the item marked required",
        ),
      );
    }
    if (c.kind === "file_request") {
      if (!c.acceptedMimeTypes.every(isContextMimeType) || (c.maxBytes ?? 0) > CONTEXT_MAX_BYTES_CEILING) {
        w.push(
          warn(
            "ATG-L026",
            "error",
            `/context/${i}/acceptedMimeTypes`,
            "file request outside the mime allowlist or the size ceiling",
            "intersected with the allowlist and clamped",
          ),
        );
      }
    }
    if (c.kind === "url" && (c.url === null || !isSafePublicHttpsUrl(c.url))) {
      w.push(
        warn("ATG-L027", "error", `/context/${i}/url`, "unsafe or non-public url", "context item dropped"),
      );
    }
  });

  if (!hasMoneyRule || !hasExternalRule) {
    w.push(
      warn(
        "ATG-L022",
        "warn",
        "/boundaries/rules",
        `missing a rule in ${!hasMoneyRule ? "money" : ""}${!hasMoneyRule && !hasExternalRule ? " and " : ""}${!hasExternalRule ? "external_comms" : ""}`,
        "the deterministic default rule appended",
      ),
    );
  }

  const errorFindings = draft.provenance.injectionFindings.filter((f) => f.severity === "error");
  if (errorFindings.length >= 2) {
    w.push(
      warn(
        "ATG-L023",
        "error",
        "/boundaries/autonomy",
        `${errorFindings.length} error-severity injection findings in the brief`,
        "autonomy forced to suggest, external sends gated, daily limit capped at 50",
      ),
    );
  }
  if (ctx.budgetExhausted) {
    w.push(
      warn("ATG-L024", "info", "/provenance/mode", "the monthly AI budget was spent; generated from role defaults", null),
    );
  }
  if (Array.from(draft.meta.mono).length > 2 || !HUE_VALUES.has(draft.meta.hue.toLowerCase())) {
    w.push(
      warn(
        "ATG-L025",
        "warn",
        "/meta/mono",
        "avatar tile is not a 1-2 code point mono on a catalogue hue",
        "replaced with the seeded role's avatar",
      ),
    );
  }

  return w;
}

/**
 * Which generated elements sit next to a capability-seeking injection finding.
 *
 * Only capability-GRANTING elements are ever returned: a skill, a context item,
 * a schedule prompt, a task. Never a `hard` rule and never a prohibition —
 * those can only restrict, and the restrictive-direction principle governs this
 * remediation exactly as it governs the others.
 */
interface Tainted {
  path: string;
  kind: "skill" | "context" | "schedule" | "task";
  index: number;
  agentIndex?: number;
}

/** 5 whitespace tokens for Latin, 8 contiguous CJK characters where there are none. */
function sharesLongSpan(generated: string, window: string, lang: Lang): boolean {
  const cjk = lang !== "en" || CJK_RE.test(window);
  if (cjk) {
    const hay = window.replace(/\s+/g, "");
    const needle = generated.replace(/\s+/g, "");
    for (let i = 0; i + 8 <= needle.length; i++) {
      const span = needle.slice(i, i + 8);
      if (CJK_RE.test(span) && hay.includes(span)) return true;
    }
    return false;
  }
  const words = generated.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = ` ${window.toLowerCase().split(/\s+/).filter(Boolean).join(" ")} `;
  for (let i = 0; i + 5 <= words.length; i++) {
    if (hay.includes(` ${words.slice(i, i + 5).join(" ")} `)) return true;
  }
  return false;
}

function taintedElements(draft: AgentTemplateDraft, armed: InjectionFinding[]): Tainted[] {
  // The excerpt IS the window: the brief itself is not carried in the draft, and
  // an 80-character excerpt around each finding is what §6.4's 200-character
  // window degrades to once the draft is the only thing we hold.
  const windows = armed.map((f) => f.excerpt);
  const hit = (text: string) => windows.some((win) => sharesLongSpan(text, win, draft.locale));
  const out: Tainted[] = [];
  draft.skills.forEach((s, i) => {
    if (hit(`${s.displayName} ${s.purpose}`)) out.push({ path: `/skills/${i}`, kind: "skill", index: i });
  });
  draft.context.forEach((c, i) => {
    if (hit(`${c.title} ${c.purpose} ${c.body ?? ""}`)) {
      out.push({ path: `/context/${i}`, kind: "context", index: i });
    }
  });
  draft.schedules.forEach((s, i) => {
    if (hit(s.prompt)) out.push({ path: `/schedules/${i}`, kind: "schedule", index: i });
  });
  draft.agents.forEach((a, ai) => {
    a.tasks.forEach((t, i) => {
      if (hit(t.text)) out.push({ path: `/agents/${ai}/tasks/${i}`, kind: "task", index: i, agentIndex: ai });
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Remediation — restrictive direction only
// ---------------------------------------------------------------------------

function defaultRule(category: "money" | "external_comms", lang: Lang): TemplateRule {
  const text = RULE_TEMPLATES[category][lang][0];
  return { text: text.slice(0, 200), severity: "hard", category };
}

/** Raise a step-minute cron to the 15-minute floor. Null when it cannot be raised. */
function raiseInterval(cron: string): string | null {
  const m = /^\*\/(\d+) \* \* \* \*$/.exec(cron.trim());
  if (m && Number(m[1]) < 15) return "*/15 * * * *";
  const perMinute = /^\* \* \* \* \*$/.test(cron.trim());
  return perMinute ? "*/15 * * * *" : null;
}

function bumpSlug(slug: string, taken: ReadonlySet<string>, seed: string): string {
  const base = slug.slice(0, 45).replace(/-+$/, "") || "template";
  for (let n = 2; n <= 99; n++) {
    const next = `${base}-${n}`;
    if (!taken.has(next)) return next;
  }
  // Past -99, a 4-char base36 hash of the brief digest. `varchar(48)` is the
  // column, so the truncation above is what keeps the append from overflowing.
  const suffix = parseInt(seed.slice(0, 8) || "0", 16).toString(36).slice(0, 4).padStart(4, "0");
  return `${base}-${suffix}`;
}

export interface RemediationResult {
  draft: AgentTemplateDraft;
  warnings: DraftWarning[];
  /** False only when an `error` survives the fix pass — in practice, only ATG-L013. */
  materializable: boolean;
}

/**
 * Lint, fix what can be fixed restrictively, re-lint, and report honestly.
 *
 * A warning is marked `remediated` when its code no longer appears in the
 * second pass — the fix is judged by its effect, not by the intention of the
 * branch that applied it.
 */
/**
 * One fix pass. Mutates `draft` in place; every branch is idempotent, so
 * running it twice is safe — which is what `remediateDraft` does, because a
 * restrictive fix can legitimately expose a finding that was masked before it.
 * Tightening `autonomy` to "suggest", for instance, is what makes an escalation
 * channel of "none" a problem (`ATG-L011`) in the first place.
 */
function applyFixes(
  draft: AgentTemplateDraft,
  codes: ReadonlySet<string>,
  ctx: LintContext,
): void {
  const lang = draft.locale;
  const b = draft.boundaries;
  const now = ctx.now ?? new Date();

  // Drops first, so the reference sweep at the end sees the final key sets.
  if (codes.has("ATG-L017")) {
    const tainted = taintedElements(
      draft,
      draft.provenance.injectionFindings.filter((f) => ARMING_PATTERNS.has(f.pattern)),
    );
    const skillIdx = new Set(tainted.filter((t) => t.kind === "skill").map((t) => t.index));
    const ctxIdx = new Set(tainted.filter((t) => t.kind === "context").map((t) => t.index));
    const schedIdx = new Set(tainted.filter((t) => t.kind === "schedule").map((t) => t.index));
    draft.skills = draft.skills.filter((_, i) => !skillIdx.has(i));
    draft.context = draft.context.filter((_, i) => !ctxIdx.has(i));
    draft.schedules = draft.schedules.filter((_, i) => !schedIdx.has(i));
    for (const t of tainted) {
      if (t.kind === "task" && t.agentIndex !== undefined) {
        const agent = draft.agents[t.agentIndex];
        if (agent) agent.tasks = agent.tasks.filter((_, i) => i !== t.index);
      }
    }
  }
  draft.schedules = draft.schedules.filter((s) => isValidCron(s.cron) && isValidTimeZone(s.timezone));
  draft.context = draft.context.filter((c) => c.kind !== "url" || (c.url !== null && isSafePublicHttpsUrl(c.url)));
  {
    let unresolved = 0;
    draft.skills = draft.skills.filter((s) => (s.skillId === null ? ++unresolved <= 2 : true));
  }

  // Boundaries.
  if (codes.has("ATG-L001")) {
    b.autonomy = b.autonomy === "suggest" ? "suggest" : "ask";
    b.approvalAmountUsd = 0;
    if (!b.rules.some((r) => r.category === "money")) b.rules.push(defaultRule("money", lang));
  }
  if (codes.has("ATG-L002")) b.approveExternalSends = true;
  if (codes.has("ATG-L003") || codes.has("ATG-L006")) {
    if (b.autonomy === "auto") b.autonomy = "ask";
  }
  if (codes.has("ATG-L019") && b.dailyActionLimit === 0) b.dailyActionLimit = 200;
  if (codes.has("ATG-L011")) b.escalation.channel = "chat";
  if (codes.has("ATG-L012")) b.dataHandling.retentionDays = Math.min(b.dataHandling.retentionDays, 365);
  if (codes.has("ATG-L023")) {
    b.autonomy = "suggest";
    b.approveExternalSends = true;
    b.dailyActionLimit = b.dailyActionLimit === 0 ? 50 : Math.min(b.dailyActionLimit, 50);
  }
  if (codes.has("ATG-L022")) {
    if (!b.rules.some((r) => r.category === "money")) b.rules.push(defaultRule("money", lang));
    if (!b.rules.some((r) => r.category === "external_comms")) {
      b.rules.push(defaultRule("external_comms", lang));
    }
  }
  b.rules = b.rules.slice(0, 12);

  // Agents.
  for (const a of draft.agents) {
    if (codes.has("ATG-L004") && a.tools.docker) a.tools.docker = false;
    if (codes.has("ATG-L015") && !ctx.multiHarnessRequested) a.harness = draft.harness;
    if (codes.has("ATG-L018") && a.settings.alwaysOn && a.settings.heartbeatMinutes < 5) {
      a.settings.heartbeatMinutes = 15;
    }
  }

  // Schedules.
  const used = new Map<string, number>();
  for (const s of draft.schedules) {
    if (runsInDay(s.cron, s.timezone, now) > 96 || runsInDay(s.cron, s.timezone, now) > s.maxRunsPerDay) {
      const raised = raiseInterval(s.cron);
      if (raised) s.cron = raised;
      else s.enabled = false;
    }
    if (s.kind === "one_off" && s.onDate) {
      const t = zonedParts(now, s.timezone);
      const today = `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
      if (s.onDate < today) s.enabled = false;
    }
    const [minute, hour] = s.cron.split(/\s+/);
    const slot = `${minute}|${hour}|${s.timezone}`;
    const n = used.get(slot) ?? 0;
    used.set(slot, n + 1);
    if (n >= 2 && /^\d+$/.test(minute)) {
      // Stagger in 7-minute steps. Only the minute moves, so a 09:00 report
      // stays a morning report.
      const shifted = (Number(minute) + 7 * (n - 1)) % 60;
      const parts = s.cron.split(/\s+/);
      parts[0] = String(shifted);
      s.cron = parts.join(" ");
    }
  }

  // Context.
  for (const c of draft.context) {
    if (c.kind === "file_request") {
      const kept = c.acceptedMimeTypes.filter(isContextMimeType);
      c.acceptedMimeTypes = kept.length ? kept : [...DEFAULT_CONTEXT_MIME_TYPES];
      if (c.maxBytes !== null) c.maxBytes = Math.min(c.maxBytes, CONTEXT_MAX_BYTES_CEILING);
    } else {
      c.acceptedMimeTypes = [];
      c.maxBytes = null;
    }
    if (c.body && FAKE_DATA_RE.test(c.body)) {
      c.body = c.body.replace(/[$¥€£￥]\s?\d[\d.,]*/g, "____").replace(/\d{3,}/g, "____");
      c.required = true;
    }
    c.containsPii = containsPii(`${c.body ?? ""}\n${c.placeholder ?? ""}\n${c.purpose}`);
  }

  // Meta.
  if (codes.has("ATG-L025")) {
    if (Array.from(draft.meta.mono).length > 2) {
      draft.meta.mono = ctx.seeded?.mono ?? Array.from(draft.meta.name)[0] ?? "A";
    }
    if (!HUE_VALUES.has(draft.meta.hue.toLowerCase())) {
      draft.meta.hue = ctx.seeded?.hue ?? roleHue.admin;
    }
  }
  if (codes.has("ATG-L020")) {
    const taken = new Set(ctx.existingSlugs ?? []);
    draft.meta.slug = bumpSlug(draft.meta.slug, taken, draft.provenance.briefSha256);
  }

  // Reference sweep — last, because every drop above can dangle a key.
  const skillKeys = new Set(draft.skills.map((s) => s.key));
  const scheduleKeys = new Set(draft.schedules.map((s) => s.key));
  const contextKeys = new Set(draft.context.map((c) => c.key));
  const roleKeys = new Set(draft.roles.map((r) => r.key));
  const agentKeys = new Set(draft.agents.map((a) => a.key));
  for (const a of draft.agents) {
    a.skillKeys = a.skillKeys.filter((k) => skillKeys.has(k));
    a.scheduleKeys = a.scheduleKeys.filter((k) => scheduleKeys.has(k));
    a.contextKeys = a.contextKeys.filter((k) => contextKeys.has(k));
    if (!roleKeys.has(a.roleKey) && draft.roles[0]) a.roleKey = draft.roles[0].key;
  }
  draft.schedules = draft.schedules.filter((s) => agentKeys.has(s.agentKey));
}

/** Two passes. A third has never changed anything, and the loop must terminate. */
const FIX_PASSES = 2;

/**
 * Lint, fix what can be fixed restrictively, re-lint, and report honestly.
 *
 * A warning is marked `remediated` when its code no longer appears in the final
 * pass — the fix is judged by its effect, not by the intention of the branch
 * that applied it.
 */
export function remediateDraft(input: AgentTemplateDraft, ctx: LintContext = {}): RemediationResult {
  const draft: AgentTemplateDraft = structuredClone(input);
  const before = lintDraft(draft, ctx);
  let pass = before;
  for (let i = 0; i < FIX_PASSES; i++) {
    applyFixes(draft, new Set(pass.map((x) => x.code)), ctx);
    const next = lintDraft(draft, ctx);
    if (next.length === pass.length && next.every((w, j) => w.code === pass[j]?.code)) {
      pass = next;
      break;
    }
    pass = next;
  }

  const after = pass;
  const seen = new Set(before.map((x) => x.code));
  const remaining = new Set(after.map((x) => x.code));
  const warnings = before.map((x) => ({
    ...x,
    remediated: x.remediation !== null && !remaining.has(x.code),
  }));
  // Anything a fix pass exposed — a tightened autonomy that made an escalation
  // channel of "none" a problem — is reported too, rather than hidden behind
  // the first pass's list.
  for (const x of after) {
    if (!seen.has(x.code)) warnings.push(x);
  }

  const materializable = !after.some((x) => x.severity === "error");
  draft.provenance.warnings = warnings;
  draft.provenance.materializable = materializable;

  return { draft, warnings, materializable };
}
