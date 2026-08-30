/**
 * Pure display logic for the template gallery.
 *
 * It lives beside the components rather than in `lib/` because every function
 * here answers a *rendering* question.
 *
 * **LEVEL and SETUP are stored columns, not inventions.** `agent_templates`
 * carries `difficulty varchar(16)`, `time_to_value_minutes integer` and
 * `automates varchar(140)` (lib/db/schema.ts:1390-1394, shipped in migration
 * 0009_v2_schema.sql:231-233), all three computed at ATG §2.9 assemble and never
 * model-authored. `docs/UI_DESIGN_V2.md` §B.3 asserts they do not exist; that
 * paragraph predates the migration and is wrong, and the schema is the contract.
 *
 * The count-derived `templateLevel` / `setupMinutes` below survive as a FALLBACK
 * for the window in which `lib/serializers.ts` — the integrator's file, whose
 * §9.4 field list also predates the migration — has not yet put the columns on
 * the DTO. When they are absent the card shows an estimate and says so; when
 * they are present the stored value wins and the "estimate" hint disappears.
 * The card still never opens `draft` to compute anything: a per-tile read of a
 * 10–40 KB blob is a 1 MB gallery, and a per-tile summariser is a per-request
 * LLM call in a product that must work with no key at all.
 *
 * Everything here is deterministic and side-effect free so tests/template-gallery
 * can pin it without a database or a browser.
 */
import type { Harness } from "@/lib/harness";
import { isHarness } from "@/lib/harness";
import type { TemplateCategory } from "@/lib/atg/types";
import type { PlanTier } from "@/lib/pricing";
import { PLAN_TIERS } from "@/lib/pricing";
import type { Lang } from "@/lib/types";
import { BCP47 } from "@/lib/i18n";
import {
  TEMPLATE_LEVELS,
  TEMPLATE_SCOPES,
  TEMPLATE_SORTS,
  type TemplateLevel,
  type TemplateScope,
  type TemplateSort,
} from "@/lib/i18n/template-gallery";
import type { TemplateDifficulty, TemplateSummaryDTO } from "./types";

/** The 10 template categories, as a runtime list for the filter control.
 *  `satisfies` makes a drift between this list and the union a compile error —
 *  the union is the source of truth, this is only its iteration order. */
export const TEMPLATE_CATEGORIES = [
  "sales",
  "marketing",
  "support",
  "operations",
  "finance",
  "research",
  "engineering",
  "hr",
  "personal",
  "other",
] as const satisfies readonly TemplateCategory[];

// ---------------------------------------------------------------------------
// Derived "how much work is this" signals
// ---------------------------------------------------------------------------

/**
 * A count column read off a DTO. `Math.max(0, NaN)` is `NaN`, so clamping alone
 * is not enough: a field the serializer omitted or sent as a string would print
 * "~NaN min" on the card and, because every `NaN <= x` is false, silently label
 * the template "advanced". Coerce first, then clamp.
 */
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/** How much each stored count contributes to perceived setup effort. An agent
 *  is a VM and a brief; a schedule is a decision about when; a skill is mostly
 *  a checkbox — hence 3 / 2 / 1. */
export const SETUP_WEIGHTS = { agent: 3, schedule: 2, skill: 1 } as const;

export interface TemplateCounts {
  agentCount: number;
  skillCount: number;
  scheduleCount: number;
}

export function setupWeight(t: TemplateCounts): number {
  return (
    num(t.agentCount) * SETUP_WEIGHTS.agent +
    num(t.scheduleCount) * SETUP_WEIGHTS.schedule +
    num(t.skillCount) * SETUP_WEIGHTS.skill
  );
}

/** Boundaries chosen so the canonical one-agent template stays "beginner" and
 *  only a genuinely multi-agent setup reads as "advanced". */
export const LEVEL_BOUNDS = { beginner: 14, intermediate: 26 } as const;

/** The count-derived estimate. Only reached when the row carries no
 *  `difficulty` — see `templateLevel`. */
export function estimatedLevel(t: TemplateCounts): TemplateLevel {
  const w = setupWeight(t);
  if (w <= LEVEL_BOUNDS.beginner) return "beginner";
  if (w <= LEVEL_BOUNDS.intermediate) return "intermediate";
  return "advanced";
}

/** `agent_templates.difficulty` is `varchar(16)`, not an enum, so an unknown
 *  string is representable and must not become a missing dictionary lookup. */
export function asDifficulty(value: unknown): TemplateDifficulty | null {
  return typeof value === "string" && (TEMPLATE_LEVELS as readonly string[]).includes(value)
    ? (value as TemplateDifficulty)
    : null;
}

/** The stored `difficulty` when the serializer sends one, else the estimate. */
export function templateLevel(t: TemplateCounts & { difficulty?: string }): TemplateLevel {
  return asDifficulty(t.difficulty) ?? estimatedLevel(t);
}

/**
 * Minutes to a working agent, estimated. Three minutes of wizard, two per agent
 * brief, one per schedule to confirm a time, and half a minute per skill to read
 * what it does. Never below two — "0 min" reads as a bug, not as a promise.
 */
export function estimatedMinutes(t: TemplateCounts): number {
  const raw = 3 + num(t.agentCount) * 2 + num(t.scheduleCount) + Math.ceil(num(t.skillCount) / 2);
  return Math.max(2, Math.round(raw));
}

/** The stored `time_to_value_minutes` when present, else the estimate. The
 *  column defaults to 10 and is NOT NULL, so 0 means "the serializer sent a
 *  garbled value", not "instant" — hence the same ≥2 floor either way. */
export function setupMinutes(t: TemplateCounts & { timeToValueMinutes?: number }): number {
  const stored = t.timeToValueMinutes;
  if (typeof stored === "number" && Number.isFinite(stored) && stored >= 1) {
    return Math.max(2, Math.round(stored));
  }
  return estimatedMinutes(t);
}

/** True when LEVEL and SETUP came out of the counts rather than off the row, so
 *  the card can label them as estimates only when they actually are. */
export function isEstimated(t: TemplateSummaryDTO): boolean {
  return (
    asDifficulty(t.difficulty) === null ||
    !(typeof t.timeToValueMinutes === "number" && Number.isFinite(t.timeToValueMinutes))
  );
}

/**
 * The card's one-line "what it does": `automates` when the assemble stage wrote
 * one, else `summary`. The column is NOT NULL DEFAULT '', so an empty string is
 * the normal "not computed yet" value and must fall through rather than render
 * a blank line.
 */
export function whatItDoes(t: TemplateSummaryDTO): string {
  const a = typeof t.automates === "string" ? t.automates.trim() : "";
  return a !== "" ? a : t.summary;
}

// ---------------------------------------------------------------------------
// Badges, plan gate, glyph
// ---------------------------------------------------------------------------

/**
 * `⬦ YOURS` for a row this workspace owns, `⬦ PUBLIC` for another tenant's
 * public row, and deliberately nothing for a platform template — absence is the
 * strongest signal and keeps the card quiet. The PUBLIC badge is not decoration:
 * it is the only thing on the card saying the words were written by a stranger.
 */
export function templateBadge(t: TemplateSummaryDTO): "yours" | "public" | null {
  if (t.ownedByViewer) return "yours";
  if (t.visibility === "public") return "public";
  return null;
}

/** True when the row's text was authored outside the viewer's workspace, and so
 *  must be rendered as data and flagged in the drawer. */
export function isThirdParty(t: TemplateSummaryDTO): boolean {
  return !t.ownedByViewer && t.visibility === "public";
}

export function planRank(plan: PlanTier): number {
  return PLAN_TIERS.indexOf(plan);
}

/** Whether `viewer` is high enough for `required`. An unknown viewer tier (the
 *  workspace plan has not loaded yet) is treated as sufficient: showing an
 *  upgrade wall we are not sure about is worse than a 402 the user can read. */
export function meetsPlan(required: PlanTier, viewer: PlanTier | null): boolean {
  if (!viewer) return true;
  return planRank(viewer) >= planRank(required);
}

/** `mono` is varchar(8) and may hold a multi-code-point emoji; slicing it by
 *  UTF-16 index would render half a surrogate pair. */
export function firstGlyph(mono: string): string {
  return Array.from(mono ?? "")[0] ?? "◆";
}

/** `#rgb`, `#rrggbb`, `#rrggbbaa` — nothing else. */
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * `agent_templates.hue` is `varchar(16)` of free text, and on a `scope=public`
 * row it was written by ANOTHER TENANT. It reaches the DOM as a CSS `background`
 * value, and React does not sanitise style values — it assigns them through the
 * CSSOM. That blocks a second declaration (`red;position:fixed` is simply an
 * invalid value and is dropped), but it does NOT block a valid one-value
 * payload: `url(https://attacker.example/p.gif)` is a legal background and would
 * make every viewer of that card fetch a stranger's URL, which is a tracking
 * pixel with the viewer's IP on it and a CSP report at best.
 *
 * So the value is an allowlisted hex literal or it is not used at all. The
 * fallback is the neutral the column itself defaults to (`#9AA3B2`), not the
 * brand fill — a template that lost its colour should look unset, not featured.
 */
export function safeHue(hue: unknown): string | null {
  return typeof hue === "string" && HEX_COLOR.test(hue.trim()) ? hue.trim() : null;
}

export const HUE_FALLBACK = "#9AA3B2";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** `tags` is `jsonb` with a `[]` default, but a half-built serializer can still
 *  hand back `null`, and `null.join` takes the whole grid down. */
export function tagList(tags: unknown): string[] {
  return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [];
}

export function formatCount(n: number, lang: Lang): string {
  const v = num(n);
  try {
    return new Intl.NumberFormat(BCP47[lang]).format(v);
  } catch {
    return String(v);
  }
}

const REL_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/**
 * "3 days ago" in the viewer's language. `Intl.RelativeTimeFormat` rather than
 * a hand-rolled ladder: `lib/agent-display.relTime` is English-only, and this
 * string sits in a four-language table where "3d ago" is simply wrong.
 */
export function relativeTime(iso: string, lang: Lang, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const diff = then - now;
  const abs = Math.abs(diff);
  try {
    const rtf = new Intl.RelativeTimeFormat(BCP47[lang], { numeric: "auto" });
    for (const [unit, ms] of REL_UNITS) {
      if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
    }
    return rtf.format(0, "minute");
  } catch {
    return iso.slice(0, 10);
  }
}

// ---------------------------------------------------------------------------
// Filter state — parsed from the URL, which is untrusted input
// ---------------------------------------------------------------------------

export interface GalleryFilters {
  q: string;
  harness: Harness | "all";
  category: TemplateCategory | "all";
  level: TemplateLevel | "all";
  plan: PlanTier | "all";
  scope: TemplateScope;
  sort: TemplateSort;
  page: number;
}

export const DEFAULT_FILTERS: GalleryFilters = {
  q: "",
  harness: "all",
  category: "all",
  level: "all",
  plan: "all",
  scope: "all",
  sort: "used",
  page: 1,
};

export const PER_PAGE = 24;

/** Longest `q` we will send. The server escapes and bounds it too; this stops a
 *  megabyte of pasted text becoming a URL nobody can share. */
export const MAX_QUERY_LEN = 120;

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Narrow the address bar into a filter state. Every value is checked against its
 * allowlist and anything unrecognised falls back to the default — a hand-edited
 * `?sort=name;DROP` must produce the default sort, never a request.
 */
export function parseFilters(params: URLSearchParams): GalleryFilters {
  const page = Number.parseInt(params.get("page") ?? "", 10);
  return {
    q: (params.get("q") ?? "").slice(0, MAX_QUERY_LEN),
    harness: harnessOrAll(params.get("harness")),
    category:
      oneOf(params.get("category"), ["all", ...TEMPLATE_CATEGORIES] as const) ?? "all",
    level: oneOf(params.get("level"), ["all", ...TEMPLATE_LEVELS] as const) ?? "all",
    plan: oneOf(params.get("plan"), ["all", ...PLAN_TIERS] as const) ?? "all",
    scope: oneOf(params.get("scope"), TEMPLATE_SCOPES) ?? "all",
    sort: oneOf(params.get("sort"), TEMPLATE_SORTS) ?? "used",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

function harnessOrAll(value: string | null): Harness | "all" {
  return value !== null && isHarness(value) ? value : "all";
}

/** Only non-default values reach the URL, so a pristine gallery is a clean link. */
export function filtersToQuery(f: GalleryFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim().slice(0, MAX_QUERY_LEN));
  if (f.harness !== "all") p.set("harness", f.harness);
  if (f.category !== "all") p.set("category", f.category);
  if (f.level !== "all") p.set("level", f.level);
  if (f.plan !== "all") p.set("plan", f.plan);
  if (f.scope !== "all") p.set("scope", f.scope);
  if (f.sort !== "used") p.set("sort", f.sort);
  if (f.page > 1) p.set("page", String(f.page));
  return p;
}

/**
 * What `GET /api/templates` is asked for. `level` is NOT sent: it is derived
 * here from counts, so there is no column for the server to filter on and a
 * param it does not know would be a 422 under §9.4's allowlist.
 */
export function apiQuery(f: GalleryFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim().slice(0, MAX_QUERY_LEN));
  if (f.harness !== "all") p.set("harness", f.harness);
  if (f.category !== "all") p.set("category", f.category);
  if (f.scope !== "all") p.set("scope", f.scope);
  p.set("sort", f.sort);
  p.set("page", String(f.page));
  p.set("perPage", String(PER_PAGE));
  return p;
}

export function hasActiveFilters(f: GalleryFilters): boolean {
  return (
    f.q.trim() !== "" ||
    f.harness !== "all" ||
    f.category !== "all" ||
    f.level !== "all" ||
    f.plan !== "all" ||
    f.scope !== "all"
  );
}

// ---------------------------------------------------------------------------
// Client-side mirror of the server's filter + sort
// ---------------------------------------------------------------------------

/**
 * Re-applies every predicate to the page the API returned.
 *
 * Two reasons, neither of them redundancy for its own sake: `level` and `plan`
 * have no server-side equivalent (no column, and not in §9.4's param list), and
 * the API is built by a sibling — if it ships without honouring `q` or
 * `category` yet, the control the user just moved still has to do something
 * visible rather than silently nothing.
 */
export function matchesFilters(t: TemplateSummaryDTO, f: GalleryFilters): boolean {
  const q = f.q.trim().toLowerCase();
  if (q) {
    const haystack = `${t.name}\n${t.summary}\n${tagList(t.tags).join(" ")}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (f.harness !== "all" && t.harness !== f.harness) return false;
  if (f.category !== "all" && t.category !== f.category) return false;
  if (f.plan !== "all" && t.minPlan !== f.plan) return false;
  if (f.level !== "all" && templateLevel(t) !== f.level) return false;
  if (f.scope === "workspace" && !t.ownedByViewer) return false;
  if (f.scope === "public" && (t.ownedByViewer || t.visibility !== "public")) return false;
  return true;
}

/**
 * A stable, total order over the page the API returned.
 *
 * `new` is the interesting arm. It means `created_at` (§B.3's control table
 * spells the column out), and `created_at` is optional on the DTO — so when it
 * is missing the list is returned in the order the server sent it rather than
 * re-sorted by `updated_at`. Those are different questions: a template written
 * two years ago and edited yesterday is the OLDEST row and the most recently
 * updated one, and re-sorting "Newest" by `updated_at` would put it first while
 * claiming to have done the opposite. Leaving the server's order alone is
 * either correct (it honoured `sort=new`) or neutral (it did not), and neither
 * is a lie.
 */
export function sortTemplates(
  list: TemplateSummaryDTO[],
  sort: TemplateSort,
): TemplateSummaryDTO[] {
  const out = [...list];
  const byName = (a: TemplateSummaryDTO, b: TemplateSummaryDTO) => a.name.localeCompare(b.name);
  const time = (iso: string | undefined) => {
    const t = Date.parse(iso ?? "");
    return Number.isNaN(t) ? 0 : t;
  };
  switch (sort) {
    case "name":
      return out.sort(byName);
    case "used":
      return out.sort((a, b) => num(b.useCount) - num(a.useCount) || byName(a, b));
    case "updated":
      return out.sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || byName(a, b));
    case "new":
      return out.every((t) => t.createdAt === undefined)
        ? out
        : out.sort((a, b) => time(b.createdAt) - time(a.createdAt) || byName(a, b));
    default:
      return out;
  }
}
