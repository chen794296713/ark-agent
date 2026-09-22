/**
 * The no-API-key path, and the majority path until a key is configured.
 *
 * This is not a stub. Until `OPENROUTER_API_KEY` is set — and, per stage,
 * whenever a model call exhausts its escalation ladder — the template a customer
 * reviews is composed entirely here, from `lib/atg/defaults.ts`, the seeded
 * `agent_roles` rows, and the real `skills` catalogue. Its output passes the
 * SAME `agentTemplateDraftSchema` as the model path, for all eight seeded roles
 * × four locales × four harnesses, and `tests/atg-deterministic.test.ts` asserts
 * exactly that.
 *
 * TOTAL AND PURE. No `server-only`, no database, no environment reads, no
 * `fetch`. The caller does every piece of I/O and hands the rows in — which is
 * what lets the tests and the eval harness load this module without a database,
 * and what lets `lib/atg/retrieval.ts` (which IS server-only) reuse the ranking
 * and gating below rather than keep a second copy of them. The dependency runs
 * retrieval → here, never the other way.
 *
 * On locale: the seeded `agent_roles` row is English. Its `blurb`,
 * `long_blurb`, `default_instructions` and `default_rules` are therefore used
 * ONLY when `locale === "en"`; every other locale composes from the
 * hand-written four-language tables in `defaults.ts`. Splicing an English
 * sentence into a Japanese draft would be a worse floor than a generic one.
 */
import type { Lang } from "@/lib/types";
import type { Harness } from "@/lib/harness";
import { isChannelType, type ChannelType } from "@/lib/channels";
import type { AgentRole } from "@/lib/db/schema";
import type { SkillRequirements } from "@/lib/runtime/types";
import { DEFAULT_SETTINGS } from "@/lib/agent-settings";
import { roleHue } from "@/lib/theme";
import { isValidCron, isValidTimeZone, runsBetween } from "@/lib/schedule/cron";
import { describeCron } from "@/lib/schedule/describe";
import { CONFIDENCE_FLOOR, parseSchedulePhrase, type ParsedSchedule } from "@/lib/schedule/parse";
import type { CapabilityRequest } from "./schema";
import { CONTEXT_DEFAULT_MAX_BYTES, DEFAULT_CONTEXT_MIME_TYPES } from "./safety";
import {
  CHANNEL_HINTS,
  DEFAULT_REDACT_FIELDS,
  DEFAULT_ROLE_ID,
  HARNESS_TOOL_FLOOR,
  LEGAL_MEDICAL_FINANCIAL_RE,
  ROLE_CADENCE,
  ROLE_CAPABILITY_SEEDS,
  ROLE_CATEGORY,
  ROLE_CATEGORY_AFFINITY,
  ROLE_CONTEXT_SEEDS,
  ROLE_FLOOR,
  ROLE_HANDOFF_DEFAULTS,
  ROLE_LEXICON,
  ROLE_METRIC_DEFAULTS,
  ROLE_NAME,
  ROLE_RESPONSIBILITY_DEFAULTS,
  RULE_TEMPLATES,
  SCHEDULE_PROMPT_TEMPLATES,
  SKILL_PURPOSE_FALLBACK,
  SKILL_PURPOSE_TEMPLATES,
  TOOL_HINTS,
  UNIVERSAL_CONTEXT_SEEDS,
  isSeededRoleId,
  type ContextSeed,
  type SeededRoleId,
} from "./defaults";
import type {
  AgentTemplateDraft,
  DraftProvenance,
  DraftStageTrace,
  InjectionFinding,
  RuleCategory,
  StageId,
  TemplateAgent,
  TemplateAgentSettings,
  TemplateBoundaries,
  TemplateContextItem,
  TemplateRole,
  TemplateRule,
  TemplateSchedule,
  TemplateSkill,
} from "./types";

// ---------------------------------------------------------------------------
// Stage 0's output — the facts every later stage reads
// ---------------------------------------------------------------------------

export interface IntakeFacts {
  /** The user's text after `normalizeBrief()`. Never the raw body. */
  brief: string;
  /** SHA-256 of `brief`. The dedupe key and the support handle. */
  briefSha256: string;
  locale: Lang;
  harness: Harness;
  /** Deterministic role guess. `score < ROLE_FLOOR` means "we guessed". */
  roleGuess: { roleId: string; score: number; alternatives: string[] };
  channelHints: ChannelType[];
  /** Never `shell` or `docker`: a keyword must not be able to open a shell. */
  toolHints: Array<"files" | "browser" | "code">;
  scheduleHints: Array<{ sentence: string; parsed: ParsedSchedule }>;
  moneyHints: Array<{ amount: number; currency: string; raw: string }>;
  injection: InjectionFinding[];
  /** The one zone every schedule in this draft is written in. */
  timezone: string;
  tooThin: boolean;
}

// ---------------------------------------------------------------------------
// Intake helpers — pure, and shared with the model path
// ---------------------------------------------------------------------------

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;

function hasKeyword(haystack: string, keyword: string): boolean {
  if (!keyword) return false;
  if (CJK_RE.test(keyword)) return haystack.includes(keyword);
  // Word boundaries for Latin, so "bill" does not fire on "billboard".
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

/**
 * The largest per-language lexicon in `defaults.ts`. Scores are scaled by
 * `BASE / max(BASE, size)` so a role that simply lists more keywords cannot win
 * on breadth — the normalization §8.2 asks for, expressed so that a single solid
 * keyword hit still clears `ROLE_FLOOR`.
 */
const BASE_LEXICON = 14;

/** English words in the role's own `name`/`blurb` are worth +2 each. */
function seededWords(role: AgentRole): string[] {
  return `${role.name} ${role.blurb}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);
}

/**
 * Score every seeded role against the brief and pick one.
 *
 * Rejected alternative: embeddings over the role blurbs. It needs a model or a
 * vector column, and it would make the no-key path depend on a key.
 */
export function resolveRole(
  brief: string,
  lang: Lang,
  roles: AgentRole[],
): { roleId: string; score: number; alternatives: string[] } {
  const hay = brief.toLowerCase();
  const scored: Array<{ id: string; score: number; sortOrder: number }> = [];

  for (const role of roles) {
    if (!isSeededRoleId(role.id)) continue;
    // The locale's lexicon plus the English one: a Chinese brief routinely says
    // "CRM" or "SEO" in Latin script, and dropping those halves recall.
    const lexicon = [...new Set([...ROLE_LEXICON[role.id][lang], ...ROLE_LEXICON[role.id].en])];
    let raw = 0;
    for (const kw of lexicon) if (hasKeyword(hay, kw)) raw += 3;
    for (const w of seededWords(role)) if (hasKeyword(hay, w)) raw += 2;
    scored.push({
      id: role.id,
      score: raw * (BASE_LEXICON / Math.max(BASE_LEXICON, lexicon.length)),
      sortOrder: role.sortOrder,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.sortOrder - b.sortOrder);
  const best = scored[0];
  if (!best || best.score < ROLE_FLOOR) {
    return {
      roleId: DEFAULT_ROLE_ID,
      score: best?.score ?? 0,
      alternatives: scored.slice(0, 3).map((s) => s.id),
    };
  }
  return {
    roleId: best.id,
    score: best.score,
    alternatives: scored.slice(1, 4).filter((s) => s.score > 0).map((s) => s.id),
  };
}

/** Channel words matched verbatim. `web` is added at assembly, never detected. */
export function detectChannelHints(brief: string): ChannelType[] {
  const out: ChannelType[] = [];
  for (const { channel, re } of CHANNEL_HINTS) {
    if (re.test(brief) && isChannelType(channel) && !out.includes(channel)) out.push(channel);
  }
  return out;
}

/**
 * Local-execution tools a keyword may switch ON. `shell` and `docker` are
 * absent from `TOOL_HINTS` by construction and this function cannot return
 * them: opening a shell because a brief contained the word "script" is not a
 * default anyone should ship.
 */
export function detectToolHints(brief: string): Array<"files" | "browser" | "code"> {
  const out: Array<"files" | "browser" | "code"> = [];
  for (const { tool, re } of TOOL_HINTS) {
    if (re.test(brief) && !out.includes(tool)) out.push(tool);
  }
  return out;
}

/**
 * Money amounts the user wrote themself, with a currency.
 *
 * Symbol-first and number-first forms, because "$300", "300 USD" and "3000元"
 * are all things people write. `¥`/`￥` is ambiguous between CNY and JPY; it is
 * read as CNY, which converts to the SMALLER dollar figure of the two and is
 * therefore the conservative reading for a spending threshold.
 */
const MONEY_RE =
  /([$€£]|¥|￥|USD|CNY|RMB|JPY|EUR|GBP|SGD)\s?([\d][\d,]*(?:\.\d+)?)|([\d][\d,]*(?:\.\d+)?)\s?(美元|人民币|人民幣|元|円|万円|dollars?|usd|cny|rmb|jpy|eur|gbp|sgd)/gi;

const SYMBOL_CURRENCY: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "CNY",
  "￥": "CNY",
  元: "CNY",
  人民币: "CNY",
  人民幣: "CNY",
  美元: "USD",
  円: "JPY",
  万円: "JPY",
  dollar: "USD",
  dollars: "USD",
};

export function detectMoneyHints(
  brief: string,
): Array<{ amount: number; currency: string; raw: string }> {
  const out: Array<{ amount: number; currency: string; raw: string }> = [];
  for (const m of brief.matchAll(MONEY_RE)) {
    const unitRaw = (m[1] ?? m[4] ?? "").trim();
    const numRaw = m[2] ?? m[3] ?? "";
    const amount = Number(numRaw.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const key = unitRaw.toLowerCase();
    const currency =
      SYMBOL_CURRENCY[unitRaw] ?? SYMBOL_CURRENCY[key] ?? unitRaw.toUpperCase().slice(0, 3);
    const scaled = unitRaw === "万円" ? amount * 10_000 : amount;
    out.push({ amount: scaled, currency, raw: m[0].trim().slice(0, 40) });
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Every sentence the deterministic parser recognised, pre-parsed.
 *
 * This is why stage 6 is `mixed`: for the overwhelmingly common phrasings the
 * schedule is solved before the model is consulted, for free, in all four
 * languages.
 */
export function parseScheduleHints(
  brief: string,
  today: { year: number; month: number; day: number } | null,
): Array<{ sentence: string; parsed: ParsedSchedule }> {
  const out: Array<{ sentence: string; parsed: ParsedSchedule }> = [];
  for (const raw of brief.split(/[.!?。！？\n]+/)) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const parsed = parseSchedulePhrase(sentence, today ? { today } : {});
    if (parsed) out.push({ sentence: sentence.slice(0, 200), parsed });
    if (out.length >= 8) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The shared skill engine: gates (§5.4), ranking (§5.3), greedy selection
// ---------------------------------------------------------------------------

/**
 * One catalogue row as the generator sees it. A plain data shape rather than a
 * Drizzle row type, so this module never has to import the schema at value
 * level and the tests can build one by hand.
 */
export interface CatalogCandidate {
  id: string;
  sourceId: string;
  /** `''` when the source has no owner namespace — the column is NOT NULL. */
  ownerHandle: string;
  slug: string;
  publicId: string;
  latestVersion: string;
  name: string;
  summary: string;
  category: string;
  tags: string[];
  riskLevel: "low" | "medium" | "high";
  riskScore: number;
  blocked: boolean;
  status: string;
  requirements: SkillRequirements;
  /** An ASSERTION. Empty means "nobody said", which gates the row out (G3). */
  harnesses: Harness[];
  installMode: string | null;
  redistributable: boolean;
  downloads: number;
  stars: number;
  upstreamUpdatedAt: string | null;
  /** `ts_rank` from the retrieval query; 0 for a tag-fallback hit. */
  textRank: number;
  /** The capability query that produced this row. */
  capability: string;
}

/** `skill_sources.id` is operator-chosen. An unrecognised id is treated as `github`. */
const SOURCE_ID_TO_TEMPLATE_SOURCE: Record<string, string> = {
  clawhub: "clawhub",
  github: "github",
  mcp_registry: "mcp_registry",
  anthropic: "anthropic",
  openclaw: "openclaw",
  arkagent: "builtin",
};

/**
 * What each harness can actually satisfy. Used for the `harnessFit` term only —
 * an unsatisfiable requirement scores zero there, it does not gate. G3 is the
 * only compatibility GATE, and it reads the publisher's own assertion.
 */
const HARNESS_RUNTIME: Record<Harness, { os: string[]; bins: string[] }> = {
  openclaw: {
    os: ["linux", "darwin"],
    bins: ["sh", "bash", "curl", "git", "node", "npx", "npm", "python", "python3", "pip"],
  },
  hermes: { os: ["linux"], bins: ["sh", "curl", "git", "node", "npx", "python3"] },
  codex: { os: ["linux"], bins: ["sh", "git", "node", "npx", "npm", "python3"] },
  deepseek: { os: ["linux"], bins: ["curl", "node"] },
};

export type GateId = "G0" | "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7";

/**
 * Applied BEFORE ranking, so a gated skill never reaches the model and never
 * reaches the score table. Returns the gate that rejected the row, or null.
 *
 * G4 (high risk) is the one people argue about. A generated proposal is one the
 * user did not ask for specifically, arriving inside twelve other decisions, on
 * a screen they will skim — so money movement and credential brokering must cost
 * a deliberate act in the editor, not a scroll past a coloured badge. The gap is
 * reported by `ATG-L005` rather than hidden.
 */
export function gateCandidate(c: CatalogCandidate, harness: Harness): GateId | null {
  // G2 before G0 so a deprecated row reports as deprecated rather than as
  // "not published": the two mean different things to the person reading the
  // gate log, and `deprecated` is the one with a note attached.
  if (c.status === "deprecated") return "G2";
  if (c.status !== "published") return "G0";
  // Redundant with G0 today, and kept anyway: `blocked` is set by the daily
  // re-verification sweep and `status` is not always rewritten with it.
  if (c.blocked) return "G1";
  // Absent or empty `harnesses` gates OUT. Compatibility is an assertion, and
  // "nobody told us" is not "compatible with all four".
  if (!Array.isArray(c.harnesses) || !c.harnesses.includes(harness)) return "G3";
  if (c.riskLevel === "high") return "G4";
  if (c.installMode === "inline" && !c.redistributable) return "G5";
  if (c.latestVersion === "0.0.0" || c.latestVersion === "latest") return "G6";
  if ((c.requirements.env?.length ?? 0) > 4) return "G7";
  return null;
}

const RISK_PENALTY: Record<CatalogCandidate["riskLevel"], number> = {
  low: 0,
  medium: 0.35,
  high: 1,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function maintenanceTerm(iso: string | null, now: number): number {
  // Unknown is not stale: MCP-registry rows never carry an upstream timestamp.
  if (!iso) return 0.35;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0.35;
  const days = (now - t) / DAY_MS;
  if (days <= 90) return 1;
  if (days >= 540) return 0;
  return 1 - (days - 90) / (540 - 90);
}

function harnessFitTerm(c: CatalogCandidate, harness: Harness): number {
  const bins = c.requirements.bins ?? [];
  const os = c.requirements.os ?? [];
  if (bins.length === 0 && os.length === 0) return 0.25; // unknown
  const runtime = HARNESS_RUNTIME[harness];
  const binsOk = bins.every((b) => runtime.bins.includes(b.toLowerCase()));
  const osOk = os.length === 0 || os.some((o) => runtime.os.includes(o.toLowerCase()));
  return binsOk && osOk ? 1 : 0;
}

export interface RankResult {
  score: number;
  /** The three largest contributing terms, in English, for the "why?" popover. */
  reasons: string[];
}

/**
 * Every term is in [0,1] before weighting, so the weights read as relative
 * importance. `redundancy` is recomputed inside the greedy loop, which is why
 * the already-selected categories are a parameter and not a field.
 */
export function rankCandidate(
  c: CatalogCandidate,
  roleId: string,
  selectedCategories: ReadonlySet<string>,
  harness: Harness,
  now = Date.now(),
): RankResult {
  const affinity = ROLE_CATEGORY_AFFINITY[isSeededRoleId(roleId) ? roleId : DEFAULT_ROLE_ID];
  const capabilityMatch = Math.min(1, c.textRank / 0.35);
  const roleAffinity = affinity.primary.includes(c.category)
    ? 1
    : affinity.adjacent.includes(c.category)
      ? 0.5
      : 0.15;
  const reach = Math.max(c.downloads, c.stars * 10);
  const popularity = Math.min(1, Math.log10(1 + Math.max(0, reach)) / 6);
  const trust = 1 - Math.min(10, Math.max(0, c.riskScore)) / 10;
  const maintenance = maintenanceTerm(c.upstreamUpdatedAt, now);
  const harnessFit = harnessFitTerm(c, harness);
  const riskPenalty = RISK_PENALTY[c.riskLevel];
  const redundancy = selectedCategories.has(c.category) ? 1 : 0;

  const terms: Array<{ label: string; value: number }> = [
    { label: `strong text match for "${c.capability}"`, value: 3 * capabilityMatch },
    { label: `fits a ${c.category} job`, value: 1.5 * roleAffinity },
    { label: `widely used (${c.downloads || c.stars} on its source)`, value: popularity },
    { label: `trusted (risk score ${c.riskScore})`, value: 0.8 * trust },
    { label: c.upstreamUpdatedAt ? "actively maintained" : "maintenance unknown", value: 0.5 * maintenance },
    { label: `runs on ${harness}`, value: 0.4 * harnessFit },
  ];
  const score =
    terms.reduce((n, t) => n + t.value, 0) - 2 * riskPenalty - 1 * redundancy;

  const reasons = terms
    .filter((t) => t.value > 0.05)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((t) => t.label.slice(0, 120));
  if (c.riskLevel === "medium") reasons.push("medium risk: writes to an external service");

  return { score, reasons };
}

/** Below this, no skill is better than a badly-matched one. */
export const MIN_SCORE = 2.2;
/** The schema allows 12; the generator never uses the headroom. */
export const MAX_SKILLS = 8;
/** The running medium-risk quota. Selection-time, not a pre-rank gate. */
export const MAX_MEDIUM = 2;

export interface SelectedSkill {
  candidate: CatalogCandidate;
  capability: CapabilityRequest;
  required: boolean;
  score: number;
  reasons: string[];
}

export interface SkillSelection {
  selected: SelectedSkill[];
  /** `must` capabilities nothing could cover. What `ATG-L005` renders. */
  uncovered: string[];
  /** Gate hits, for the trace. */
  gated: number;
}

/**
 * Greedy, capability-major. A `must` capability that no candidate could cover —
 * because everything was gated, because nothing scored, or because the medium
 * quota was full — is REPORTED, never dropped: a refusal has to be legible.
 */
export function selectSkills(
  capabilities: CapabilityRequest[],
  candidates: CatalogCandidate[],
  roleId: string,
  harness: Harness,
  now = Date.now(),
): SkillSelection {
  const open = candidates.filter((c) => gateCandidate(c, harness) === null);
  const gated = candidates.length - open.length;
  const takenIds = new Set<string>();
  const categories = new Set<string>();
  const selected: SelectedSkill[] = [];
  const uncovered: string[] = [];
  let mediumCount = 0;

  const ordered = [...capabilities].sort((a, b) => {
    const rank = (n: CapabilityRequest["necessity"]) => (n === "must" ? 0 : 1);
    return rank(a.necessity) - rank(b.necessity);
  });

  for (const capability of ordered) {
    if (selected.length >= MAX_SKILLS) break;
    const pool = open
      .filter((c) => !takenIds.has(c.id) && c.capability === capability.capability)
      .map((c) => ({ c, r: rankCandidate(c, roleId, categories, harness, now) }))
      .sort((a, b) => b.r.score - a.r.score);

    let pick = pool[0];
    if (!pick || pick.r.score < MIN_SCORE) {
      if (capability.necessity === "must") uncovered.push(capability.capability);
      continue;
    }
    if (pick.c.riskLevel === "medium" && mediumCount >= MAX_MEDIUM) {
      const low = pool.find((p) => p.c.riskLevel === "low" && p.r.score >= MIN_SCORE);
      if (!low) {
        if (capability.necessity === "must") uncovered.push(capability.capability);
        continue;
      }
      pick = low;
    }
    if (pick.c.riskLevel === "medium") mediumCount += 1;
    takenIds.add(pick.c.id);
    categories.add(pick.c.category);
    selected.push({
      candidate: pick.c,
      capability,
      required: capability.necessity === "must",
      score: pick.r.score,
      reasons: pick.r.reasons,
    });
  }

  return { selected, uncovered, gated };
}

function kebab(input: string, fallback: string): string {
  const out = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44)
    .replace(/-+$/g, "");
  return out.length > 0 ? out : fallback;
}

function truncate(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1).trim()}…`;
}

/**
 * Turn a selection into draft rows.
 *
 * `purpose` is composed from `SKILL_PURPOSE_TEMPLATES[category][lang]` with the
 * English capability interpolated — the capability is a retrieval query, and
 * spelling it out is what makes the line specific rather than boilerplate.
 */
export function buildTemplateSkills(selected: SelectedSkill[], lang: Lang): TemplateSkill[] {
  const used = new Set<string>();
  return selected.map((s, i) => {
    const c = s.candidate;
    let key = kebab(c.slug, `sk-${i + 1}`);
    if (used.has(key)) key = `${key.slice(0, 40)}-${i + 1}`;
    used.add(key);
    const template = SKILL_PURPOSE_TEMPLATES[c.category] ?? SKILL_PURPOSE_FALLBACK;
    return {
      key,
      skillId: c.id,
      source: SOURCE_ID_TO_TEMPLATE_SOURCE[c.sourceId] ?? "github",
      ownerHandle: c.ownerHandle === "" ? null : c.ownerHandle.slice(0, 80),
      slug: c.slug.slice(0, 120),
      // Pinned, never "latest": a floating ref resolved at agent runtime is
      // update drift by construction. G6 already removed the "0.0.0" sentinel.
      version: c.latestVersion,
      displayName: truncate(c.name, 120),
      purpose: truncate(template[lang].replace("{capability}", s.capability.capability), 160),
      riskLevel: c.riskLevel,
      // Only a deliberate act in the editor accepts a risk. The generator never does.
      riskAccepted: false,
      harnessCompatible: true,
      requirements: c.requirements,
      required: s.required,
      rankScore: Math.round(s.score * 1000) / 1000,
      rankReasons: s.reasons.slice(0, 8),
    };
  });
}

// ---------------------------------------------------------------------------
// Composition frames
//
// `defaults.ts` is not editable from here and does not carry a localized
// `mission`, `summary`, `description` or agent `brief`. These frames fill that
// gap, hand-written in the same four languages and to the same standard: the
// floor cannot ship an English sentence inside a 日本語 draft.
// ---------------------------------------------------------------------------

type ByLang<T> = Record<Lang, T>;

const MISSION_FRAME: ByLang<(name: string, doing: string) => string> = {
  en: (n, d) => `Own the ${n} job end to end so nobody has to chase it. Day to day that means ${d}.`,
  zh: (n, d) => `完整承担「${n}」这份工作，不用别人来催。日常主要是${d}。`,
  zht: (n, d) => `完整承擔「${n}」這份工作，不用別人來催。日常主要是${d}。`,
  ja: (n, d) => `「${n}」の業務を最後まで受け持ち、誰かが催促しなくても回るようにします。日々の中心は${d}です。`,
};

const DESCRIPTION_FRAME: ByLang<(mission: string, schedules: number, autonomy: string) => string> = {
  en: (m, s, a) =>
    `${m} It runs ${s === 0 ? "no fixed routine yet" : `${s} scheduled routine${s === 1 ? "" : "s"}`} and ${a}. Everything below is a starting point you can edit before you hire it.`,
  zh: (m, s, a) =>
    `${m} 目前${s === 0 ? "还没有固定的定时任务" : `安排了 ${s} 个定时任务`}，并且${a}。下面所有内容都是起点，录用前都可以改。`,
  zht: (m, s, a) =>
    `${m} 目前${s === 0 ? "還沒有固定的定時任務" : `安排了 ${s} 個定時任務`}，並且${a}。下面所有內容都是起點，錄用前都可以改。`,
  ja: (m, s, a) =>
    `${m} 定期実行は${s === 0 ? "まだ設定されていません" : `${s}件あります`}。${a}。以下はすべて出発点で、採用前に編集できます。`,
};

const AUTONOMY_CLAUSE: ByLang<Record<"suggest" | "ask" | "auto", string>> = {
  en: {
    suggest: "proposes everything for your review before it acts",
    ask: "asks before anything that spends money or leaves the company",
    auto: "acts within the limits set below",
  },
  zh: {
    suggest: "所有动作都先给你过目再执行",
    ask: "涉及花钱或对外发送的动作都会先问你",
    auto: "在下面设定的范围内自行处理",
  },
  zht: {
    suggest: "所有動作都先給你過目再執行",
    ask: "涉及花錢或對外發送的動作都會先問你",
    auto: "在下面設定的範圍內自行處理",
  },
  ja: {
    suggest: "行動する前にすべて確認を求めます",
    ask: "費用が発生することや社外への送信は事前に確認します",
    auto: "以下に定めた範囲内で自ら判断します",
  },
};

const BRIEF_FRAME: ByLang<(name: string, bullets: string) => string> = {
  en: (n, b) =>
    `You are our ${n}. Work the job below on your own initiative and keep the manager informed rather than asking permission for every step.\n\n${b}\n\nWhen something falls outside this list, say so and hand it back rather than improvising.`,
  zh: (n, b) =>
    `你是我们的「${n}」。请主动推进下面这些工作，及时同步进展，不必每一步都请示。\n\n${b}\n\n遇到不在这个范围内的事情，直说并交回来，不要自行发挥。`,
  zht: (n, b) =>
    `你是我們的「${n}」。請主動推進下面這些工作，及時同步進度，不必每一步都請示。\n\n${b}\n\n遇到不在這個範圍內的事情，直說並交回來，不要自行發揮。`,
  ja: (n, b) =>
    `あなたは当社の「${n}」です。以下の業務を自分から進め、逐一の許可より進捗の共有を優先してください。\n\n${b}\n\nこの範囲に収まらない件は、勝手に判断せず、その旨を伝えて差し戻してください。`,
};

const STAKEHOLDER_DEFAULTS: ByLang<string[]> = {
  en: ["The person who hired it", "Whoever owns the work it hands off"],
  zh: ["录用它的人", "接手它移交事项的同事"],
  zht: ["錄用它的人", "接手它移交事項的同事"],
  ja: ["採用した本人", "引き継ぎ先の担当者"],
};

/** The schedule title for a cadence the USER named. The cadence is the title. */
const USER_SCHEDULE_TITLE: ByLang<(cadence: string) => string> = {
  en: (c) => `Routine · ${c}`,
  zh: (c) => `定时任务 · ${c}`,
  zht: (c) => `定時任務 · ${c}`,
  ja: (c) => `定期実行 · ${c}`,
};

// ---------------------------------------------------------------------------
// Rule classification (§8.6)
// ---------------------------------------------------------------------------

const RULE_CLASSIFIERS: Array<{ category: RuleCategory; re: RegExp }> = [
  { category: "money", re: /(pay|invoice|refund|discount|price|pricing|spend|budget|付款|支付|发票|發票|退款|折扣|价格|價格|报销|報銷|支払|返金|値引|請求)/i },
  { category: "external_comms", re: /(send|email|publish|post|外部|对外|對外|发送|發送|发布|發布|邮件|郵件|送信|投稿|公開|配信)/i },
  { category: "data", re: /(confidential|private|personal data|pii|ats|机密|機密|保密|个人信息|個人資料|机密性|機密性|個人情報|守秘)/i },
  { category: "legal", re: /(legal|contract|compliance|tax|medical|法律|合同|合約|合规|合規|税|稅|法務|契約|医療|醫療)/i },
  { category: "safety", re: /(install|command|shell|sudo|irreversible|安装|安裝|命令|不可撤销|不可撤銷|インストール|コマンド|取り返し)/i },
  { category: "schedule", re: /(hours|schedule|daily|weekly|时段|時段|每天|每周|每週|定时|定時|時間帯|毎日|毎週)/i },
  { category: "quality", re: /(never invent|statistic|source|accurate|捏造|编造|編造|数据来源|資料來源|正确|正確|出典|捏造)/i },
];

function classifyRule(text: string): RuleCategory {
  for (const { category, re } of RULE_CLASSIFIERS) if (re.test(text)) return category;
  return "scope";
}

const NEGATION_START =
  /^\s*(never|no\b|do not|don't|绝不|絕不|不要|不得|请勿|請勿|禁止|絶対に|しない)/i;

function sentences(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[.!?。！？\n]+/)
    .map((s) => s.trim())
    .filter((s) => Array.from(s).length >= 12);
}

const ESCALATION_RE = /(escalate|flag|route|approve|escalat|升级|升級|上报|上報|轉交|转交|エスカレ|報告|承認)/i;

// ---------------------------------------------------------------------------
// Per-section deterministic composers — also used per-stage by the pipeline
// ---------------------------------------------------------------------------

/** The seeded role for `roleId`, or the admin row, or a synthesized stand-in. */
function pickRole(roles: AgentRole[], roleId: string): AgentRole {
  return (
    roles.find((r) => r.id === roleId) ??
    roles.find((r) => r.id === DEFAULT_ROLE_ID) ?? {
      id: DEFAULT_ROLE_ID,
      name: "Admin Assistant",
      blurb: "Inbox, calendar, documents, reminders",
      longBlurb: null,
      hue: roleHue.admin,
      mono: "A",
      defaultEngine: "openclaw",
      defaultInstructions: null,
      defaultRules: null,
      minPlan: "associate",
      sortOrder: 0,
    }
  );
}

function seededId(roleId: string): SeededRoleId {
  return isSeededRoleId(roleId) ? roleId : DEFAULT_ROLE_ID;
}

/** `roles[0]` — the ROLES section. */
export function deterministicCharterRole(
  facts: IntakeFacts,
  role: AgentRole,
): TemplateRole {
  const lang = facts.locale;
  const id = seededId(role.id);
  const english = lang === "en";
  const title = english ? truncate(role.name, 80) : truncate(ROLE_NAME[id][lang], 80);

  const fromSeed = english
    ? sentences(role.defaultInstructions).map((s) => truncate(s, 160))
    : [];
  const responsibilities = [...fromSeed.slice(0, 6)];
  for (const pad of ROLE_RESPONSIBILITY_DEFAULTS[id][lang]) {
    if (responsibilities.length >= 6) break;
    if (!responsibilities.includes(pad)) responsibilities.push(truncate(pad, 160));
  }

  const doing = responsibilities
    .slice(0, 2)
    .map((r) => (lang === "en" ? r.charAt(0).toLowerCase() + r.slice(1) : r))
    .join(lang === "ja" ? "、" : english ? ", and " : "、");
  const mission = english
    ? truncate(role.longBlurb ?? role.blurb, 400)
    : truncate(MISSION_FRAME[lang](title, doing), 400);

  const handoffSentences = english
    ? sentences(role.defaultRules).filter((s) => ESCALATION_RE.test(s)).slice(0, 3)
    : [];
  const handoffs = (
    handoffSentences.length > 0 ? handoffSentences : ROLE_HANDOFF_DEFAULTS[id][lang]
  )
    .map((h) => truncate(h, 160))
    .slice(0, 5);

  return {
    key: "role-1",
    // A real `agent_roles.id`, never a value anyone invented: this becomes
    // `agents.role_id`, which is a foreign key.
    baseRoleId: role.id,
    title,
    mission,
    responsibilities: responsibilities.slice(0, 8),
    successMetrics: ROLE_METRIC_DEFAULTS[id][lang].slice(0, 5),
    stakeholders: STAKEHOLDER_DEFAULTS[lang].map((s) => truncate(s, 80)).slice(0, 5),
    handoffs,
  };
}

/** What the deterministic path asks the catalogue for, bound to the drafted role key. */
export function deterministicCapabilities(roleId: string): CapabilityRequest[] {
  return ROLE_CAPABILITY_SEEDS[seededId(roleId)].map((c) => ({ ...c, roleKey: "role-1" }));
}

/** RULES & BOUNDARIES. Never `auto` — see the note inside. */
export function deterministicBoundaries(
  facts: IntakeFacts,
  role: AgentRole,
  channels: ChannelType[],
): TemplateBoundaries {
  const lang = facts.locale;
  const id = seededId(role.id);
  const english = lang === "en";
  const irreversible = id === "legal" || LEGAL_MEDICAL_FINANCIAL_RE.test(facts.brief);

  // Never "auto". The deterministic path does not have enough understanding to
  // grant autonomy, and defaulting to it would make the no-key deployment the
  // LEAST safe one.
  const autonomy: TemplateBoundaries["autonomy"] = irreversible ? "suggest" : "ask";

  // Order matters, and it is the order that was wrong the first time this was
  // written: the unconditional default must come LAST, or a Legal Reviewer
  // quietly inherits a $300 spending allowance.
  let approvalAmountUsd: number;
  if (irreversible) {
    approvalAmountUsd = 0;
  } else if (facts.moneyHints.length > 0) {
    // Coarse and deliberately conservative, rounding DOWN.
    const usd = facts.moneyHints.map((h) =>
      h.currency === "CNY" ? h.amount / 7 : h.currency === "JPY" ? h.amount / 150 : h.amount,
    );
    approvalAmountUsd = Math.max(0, Math.floor(Math.min(...usd)));
  } else {
    approvalAmountUsd = DEFAULT_SETTINGS.approvalAmount;
  }

  const rules: TemplateRule[] = [];
  const push = (text: string) => {
    const trimmed = truncate(text, 200);
    if (!trimmed || rules.some((r) => r.text === trimmed)) return;
    rules.push({
      text: trimmed,
      severity: NEGATION_START.test(trimmed) ? "hard" : "soft",
      category: classifyRule(trimmed),
    });
  };
  if (english) for (const s of sentences(role.defaultRules)) push(s);
  // Pad until both mandatory categories are present and there are at least 3.
  for (const category of ["money", "external_comms", "quality", "data", "safety"] as RuleCategory[]) {
    const needed =
      (category === "money" && !rules.some((r) => r.category === "money")) ||
      (category === "external_comms" && !rules.some((r) => r.category === "external_comms")) ||
      rules.length < 3;
    if (!needed) continue;
    for (const text of RULE_TEMPLATES[category][lang]) {
      push(text);
      if (rules.length >= 12) break;
    }
  }

  return {
    autonomy,
    approvalAmountUsd,
    approveExternalSends: channels.some((c) => c !== "web"),
    dailyActionLimit: 200,
    rules: rules.slice(0, 12),
    prohibitions: [RULE_TEMPLATES.safety[lang][0], RULE_TEMPLATES.data[lang][0]]
      .map((p) => truncate(p, 200))
      .slice(0, 10),
    escalation: {
      // Literal null. A generated address is either hallucinated or lifted out
      // of the brief; the UI collects it after materialization.
      to: null,
      triggers: ROLE_HANDOFF_DEFAULTS[id][lang].map((t) => truncate(t, 160)).slice(0, 6),
      channel: "chat",
    },
    dataHandling: {
      piiAllowed: id === "hr" || id === "support" || id === "admin",
      retentionDays: id === "hr" || id === "support" || id === "admin" ? 30 : 90,
      redactFields: [...DEFAULT_REDACT_FIELDS],
    },
    spend: { monthlyCreditCap: 0 },
  };
}

function seedToContextItem(seed: ContextSeed, index: number): TemplateContextItem {
  const fileRequest = seed.kind === "file_request";
  return {
    key: `ctx-${index + 1}`,
    kind: seed.kind,
    title: truncate(seed.title, 80),
    purpose: truncate(seed.purpose, 200),
    required: seed.required,
    body: seed.kind === "pasted_text" ? (seed.body?.slice(0, 8000) ?? null) : null,
    // The deterministic path never proposes a url: it has no way to know a page
    // the user owns, and inventing one is how a template ships an SSRF payload.
    url: null,
    acceptedMimeTypes: fileRequest ? [...DEFAULT_CONTEXT_MIME_TYPES] : [],
    maxBytes: fileRequest ? CONTEXT_DEFAULT_MAX_BYTES : null,
    placeholder: seed.placeholder ? truncate(seed.placeholder, 200) : null,
    // Set by the linter, not here.
    containsPii: false,
  };
}

/** CONTEXT. The universal pair first, then the role's own seeds. Capped at 5. */
export function deterministicContext(facts: IntakeFacts, role: AgentRole): TemplateContextItem[] {
  const lang = facts.locale;
  const id = seededId(role.id);
  const seeds = [...UNIVERSAL_CONTEXT_SEEDS[lang], ...ROLE_CONTEXT_SEEDS[id][lang]].slice(0, 5);
  return seeds.map(seedToContextItem);
}

function runsPerDay(cron: string, tz: string, now: Date): number {
  if (!isValidCron(cron) || !isValidTimeZone(tz)) return 0;
  try {
    const { runs, truncated } = runsBetween(cron, now, new Date(now.getTime() + DAY_MS), tz, 400);
    return truncated ? 400 : runs.length;
  } catch {
    return 0;
  }
}

/**
 * `describeCron` is TOTAL for any expression that passed `isValidCron`:
 * `analyzeCron` falls through to a generic shape that renders every valid cron
 * field by field. A null here means the two functions disagree, which is a bug
 * in one of them and not something to paper over with a silent drop.
 */
function humanReadable(cron: string, lang: Lang): string {
  const text = describeCron(cron, lang);
  if (text === null) {
    throw new Error(`atg: cron "${cron}" passed isValidCron but not analyzeCron`);
  }
  return truncate(text, 200);
}

/** REMINDERS & SCHEDULERS. The user's own phrasing wins; the role cadence is the floor. */
export function deterministicSchedules(
  facts: IntakeFacts,
  role: AgentRole,
  roleTitle: string,
  agentKey: string,
  now: Date,
): TemplateSchedule[] {
  const lang = facts.locale;
  const id = seededId(role.id);
  const out: TemplateSchedule[] = [];

  const build = (
    cron: string,
    title: string,
    payloadKind: TemplateSchedule["payloadKind"],
    source: TemplateSchedule["source"],
    confidence: number,
    kind: TemplateSchedule["kind"],
    onDate: string | null,
  ): TemplateSchedule | null => {
    if (!isValidCron(cron)) return null;
    const perDay = runsPerDay(cron, facts.timezone, now);
    return {
      key: `sch-${out.length + 1}`,
      agentKey,
      title: truncate(title, 80),
      kind,
      cron,
      timezone: facts.timezone,
      onDate,
      payloadKind,
      prompt: truncate(SCHEDULE_PROMPT_TEMPLATES[payloadKind][lang](roleTitle), 600),
      deliverTo: "chat",
      catchUpPolicy: "skip",
      enabled: true,
      // 1..288 by schema; the generator never proposes above 96.
      maxRunsPerDay: Math.min(96, Math.max(1, perDay * 2 || 4)),
      source,
      confidence,
      humanReadable: humanReadable(cron, lang),
    };
  };

  for (const hint of facts.scheduleHints) {
    if (out.length >= 4) break;
    if (hint.parsed.confidence < CONFIDENCE_FLOOR) continue;
    const cadence = describeCron(hint.parsed.cron, lang);
    if (cadence === null) continue;
    const item = build(
      hint.parsed.cron,
      USER_SCHEDULE_TITLE[lang](cadence),
      "task",
      "user_phrase",
      hint.parsed.confidence,
      hint.parsed.kind === "one_off" ? "one_off" : "recurring",
      hint.parsed.kind === "one_off" ? (hint.parsed.onDate ?? null) : null,
    );
    // A one-off the parser could not date is a recurring cron in disguise; the
    // schema refuses it, so it is dropped rather than guessed at.
    if (item && (item.kind !== "one_off" || item.onDate !== null)) out.push(item);
  }

  if (out.length === 0) {
    for (const seed of ROLE_CADENCE[id]) {
      if (out.length >= 4) break;
      const item = build(seed.cron, seed.title[lang], seed.payloadKind, "deterministic", 0.5, "recurring", null);
      if (item) out.push(item);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Agent, meta, provenance
// ---------------------------------------------------------------------------

/** The generator-controllable subset of `AgentSettings`, merged over the defaults. */
function agentSettings(facts: IntakeFacts): TemplateAgentSettings {
  const d = DEFAULT_SETTINGS;
  return {
    tone: d.tone,
    responseLanguage: facts.locale,
    timezone: facts.timezone,
    alwaysOn: d.alwaysOn,
    workStart: d.workStart,
    workEnd: d.workEnd,
    workDays: [...d.workDays],
    heartbeatMinutes: d.heartbeatMinutes,
    temperature: d.temperature,
    maxTokens: d.maxTokens,
    reasoningEffort: d.reasoningEffort,
    memoryEnabled: d.memoryEnabled,
    selfImprove: d.selfImprove,
    autoCreateSkills: d.autoCreateSkills,
    notifyNeedsReview: d.notifyNeedsReview,
    notifyErrors: d.notifyErrors,
    dailyDigest: d.dailyDigest,
    digestTime: d.digestTime,
  };
}

/**
 * Rough monthly burn, so the gallery card can warn before someone materializes
 * something that eats their allowance. COMPUTED — never model-authored, and
 * never authoritative.
 */
const CREDITS_PER_SCHEDULED_RUN = 4;
const CREDITS_PER_HEARTBEAT = 0.05;

function estimateCredits(
  schedules: TemplateSchedule[],
  settings: TemplateAgentSettings,
  timezone: string,
  now: Date,
): number {
  let runs = 0;
  for (const s of schedules) {
    if (!s.enabled) continue;
    runs += runsPerDay(s.cron, timezone, now) * 30;
  }
  const activeMinutesPerMonth = settings.alwaysOn ? 30 * 24 * 60 : 30 * 9 * 60;
  const heartbeats = activeMinutesPerMonth / Math.max(1, settings.heartbeatMinutes);
  const total = runs * CREDITS_PER_SCHEDULED_RUN + heartbeats * CREDITS_PER_HEARTBEAT;
  return Math.min(10_000_000, Math.max(0, Math.round(total)));
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** 4 base36 characters of the brief digest, so two same-role zh templates differ. */
function slugSalt(sha: string): string {
  const n = parseInt((sha || "0").slice(0, 8), 16);
  return (Number.isFinite(n) ? n : 0).toString(36).slice(0, 4).padStart(4, "0");
}

const RULES_STAGES: StageId[] = ["intake", "assemble", "lint"];
const ALL_STAGES: StageId[] = [
  "intake",
  "charter",
  "capabilities",
  "skills",
  "boundaries",
  "context",
  "schedules",
  "assemble",
  "lint",
  "finalize",
];

function fallbackTraces(startedAt: string): DraftStageTrace[] {
  return ALL_STAGES.map((stage) => ({
    stage,
    engine: stage === "skills" ? "db" : "rules",
    model: null,
    startedAt,
    durationMs: 0,
    attempts: 0,
    // Deterministic BY DESIGN for these three; a substitution for the rest.
    outcome: RULES_STAGES.includes(stage) ? "ok" : "fallback",
    promptTokens: 0,
    completionTokens: 0,
    errorCode: null,
  }));
}

export interface ComposeOptions {
  /** The generation this draft belongs to. Defaults to a fresh uuid. */
  generationId?: string;
  /** "Now", so a test gets the same credit estimate twice. */
  now?: Date;
  /** Stage traces from a partially-successful model run, for `hybrid` mode. */
  stages?: DraftStageTrace[];
  mode?: DraftProvenance["mode"];
}

/**
 * The whole draft, from facts + catalogue + seeded roles + workspace.
 *
 * Total: every branch below has a value for every seeded role and every locale,
 * and the return passes `agentTemplateDraftSchema` without a repair pass.
 */
export function composeDeterministic(
  facts: IntakeFacts,
  catalog: CatalogCandidate[],
  roles: AgentRole[],
  workspace: { name: string | null; timezone: string },
  opts: ComposeOptions = {},
): AgentTemplateDraft {
  const lang = facts.locale;
  const now = opts.now ?? new Date();
  const role = pickRole(roles, facts.roleGuess.roleId);
  const id = seededId(role.id);
  const english = lang === "en";
  // Intake already resolved the zone; the workspace is the belt to that pair of
  // braces. The workspace NAME is deliberately never written into a template —
  // a gallery card reading "Acme's Invoice Chaser" leaks a tenant name into a
  // row that can be shared.
  const timezone = isValidTimeZone(facts.timezone)
    ? facts.timezone
    : isValidTimeZone(workspace.timezone)
      ? workspace.timezone
      : DEFAULT_SETTINGS.timezone;
  const zoned: IntakeFacts = facts.timezone === timezone ? facts : { ...facts, timezone };

  const templateRole = deterministicCharterRole(zoned, role);
  const capabilities = deterministicCapabilities(role.id);
  const selection = selectSkills(capabilities, catalog, role.id, zoned.harness, now.getTime());
  const skills = buildTemplateSkills(selection.selected, lang);

  const channels: ChannelType[] = [...new Set<ChannelType>([...facts.channelHints, "web"])];
  const boundaries = deterministicBoundaries(zoned, role, channels);
  const context = deterministicContext(zoned, role);
  const schedules = deterministicSchedules(zoned, role, templateRole.title, "agent-1", now);

  const settings = agentSettings(zoned);
  const tools = { ...HARNESS_TOOL_FLOOR[zoned.harness] };
  // Hints may only OPEN files/browser/code. `shell` and `docker` cannot be
  // switched on by a keyword — enabling a shell because a brief said "script"
  // is not a default anyone should ship.
  for (const hint of facts.toolHints) tools[hint] = true;

  const name = truncate(english ? ROLE_NAME[id].en : ROLE_NAME[id][lang], 60);
  // The 2-4 word noun-phrase heuristic §8.3 permits is deliberately NOT
  // implemented: every spelling of it produced names like "Unpaid Invoices" for
  // "chase my unpaid invoices", and a wrong name on a gallery card is worse than
  // a generic right one. Naming from the brief is the model path's job.
  const latinName = /^[\x20-\x7e]+$/.test(name);
  const slug = latinName ? kebab(name, id) : `${id}-${slugSalt(facts.briefSha256)}`;

  const agent: TemplateAgent = {
    key: "agent-1",
    roleKey: templateRole.key,
    name,
    harness: zoned.harness,
    isPrimary: true,
    brief: truncate(
      // When role resolution fell back — nothing scored above the floor — the
      // user's own words beat our generic copy, because our copy is about a job
      // we only guessed at.
      facts.roleGuess.score < ROLE_FLOOR && facts.brief.length > 0
        ? facts.brief
        : english && role.defaultInstructions
          ? role.defaultInstructions
          : BRIEF_FRAME[lang](
              templateRole.title,
              templateRole.responsibilities.map((r) => `- ${r}`).join("\n"),
            ),
      4000,
    ),
    settings,
    tools,
    channels,
    tasks: templateRole.responsibilities.slice(0, 5).map((text, i) => ({
      text: truncate(text, 400),
      meta: null,
      sortOrder: i,
    })),
    skillKeys: skills.map((s) => s.key),
    scheduleKeys: schedules.map((s) => s.key),
    contextKeys: context.map((c) => c.key),
  };

  const summary = truncate(
    english ? role.blurb : ROLE_RESPONSIBILITY_DEFAULTS[id][lang][0],
    200,
  );
  const description = truncate(
    DESCRIPTION_FRAME[lang](
      templateRole.mission,
      schedules.length,
      AUTONOMY_CLAUSE[lang][boundaries.autonomy],
    ),
    1200,
  );

  const tags = [...new Set([ROLE_CATEGORY[id], id, ...capabilities.flatMap((c) => c.tags)])]
    .map((t) => kebab(t, "general"))
    .slice(0, 8);

  const startedAt = now.toISOString();
  const provenance: DraftProvenance = {
    generationId: opts.generationId ?? crypto.randomUUID(),
    mode: opts.mode ?? "deterministic",
    stages: opts.stages ?? fallbackTraces(startedAt),
    briefSha256: facts.briefSha256,
    // The linter owns these two; composition leaves them empty rather than
    // pretending to have run itself.
    warnings: [],
    injectionFindings: facts.injection.slice(0, 40),
    materializable: true,
  };

  return {
    schemaVersion: 1,
    locale: lang,
    harness: zoned.harness,
    meta: {
      name,
      slug,
      summary,
      description,
      category: ROLE_CATEGORY[id],
      tags,
      mono: Array.from(role.mono).slice(0, 2).join("") || "A",
      hue: HEX_RE.test(role.hue) ? role.hue : (roleHue[id] ?? roleHue.admin),
      minPlan: role.minPlan,
      estimatedCreditsPerMonth: estimateCredits(schedules, settings, timezone, now),
    },
    roles: [templateRole],
    agents: [agent],
    skills,
    boundaries,
    context,
    schedules,
    provenance,
  };
}

/** What `ATG-L005` needs from a composition, without re-running the selection. */
export function uncoveredCapabilities(
  facts: IntakeFacts,
  catalog: CatalogCandidate[],
  roleId: string,
  now = Date.now(),
): string[] {
  return selectSkills(deterministicCapabilities(roleId), catalog, roleId, facts.harness, now)
    .uncovered;
}
