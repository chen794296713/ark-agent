/**
 * The template gallery's pure logic.
 *
 * Two things are worth pinning here and nothing else in the vertical is.
 *
 * First, LEVEL and SETUP. `agent_templates` DOES carry `difficulty`,
 * `time_to_value_minutes` and `automates` (schema.ts:1390-1394, migration 0009),
 * so the stored value must win; the count-derived estimate is only the fallback
 * for the window where `lib/serializers.ts` has not put the columns on the DTO.
 * Both halves of that are pinned here, because a regression in either one
 * silently re-labels every template in the gallery.
 *
 * Second, the filter state comes out of the address bar, which is untrusted
 * input. `parseFilters` is the only thing between `?sort=name;DROP TABLE` and a
 * query string sent to the API, and `apiQuery` is the only thing keeping a param
 * the server's allowlist does not know (`level`, `plan`) out of that request —
 * which would come back 422 and look like a broken gallery.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FILTERS,
  HUE_FALLBACK,
  LEVEL_BOUNDS,
  MAX_QUERY_LEN,
  PER_PAGE,
  TEMPLATE_CATEGORIES,
  apiQuery,
  asDifficulty,
  estimatedLevel,
  estimatedMinutes,
  filtersToQuery,
  firstGlyph,
  formatCount,
  hasActiveFilters,
  isEstimated,
  isThirdParty,
  matchesFilters,
  meetsPlan,
  num,
  parseFilters,
  relativeTime,
  safeHue,
  setupMinutes,
  setupWeight,
  sortTemplates,
  tagList,
  templateBadge,
  templateLevel,
  whatItDoes,
  type GalleryFilters,
} from "../components/template/derive";
import type { TemplateSummaryDTO } from "../components/template/types";
import {
  TEMPLATE_LEVELS,
  TEMPLATE_SCOPES,
  TEMPLATE_SORTS,
  templateGallery,
} from "../lib/i18n/template-gallery";
import { HARNESS_IDS } from "../lib/harness";
import { PLAN_TIERS } from "../lib/pricing";
import { LANGS } from "../lib/i18n";
import { isViewMode, VIEW_MODES } from "../components/ViewToggle";

function tpl(over: Partial<TemplateSummaryDTO> = {}): TemplateSummaryDTO {
  return {
    id: "t1",
    slug: "lead-qualify",
    name: "Inbound Lead Qualifier",
    summary: "Watches your inbound forms and drafts a first reply.",
    category: "sales",
    tags: ["web-research", "crm-sync"],
    mono: "P",
    hue: "#D8FF3E",
    locale: "en",
    harness: "openclaw",
    minPlan: "professional",
    skillCount: 7,
    scheduleCount: 2,
    agentCount: 1,
    useCount: 1204,
    materializable: true,
    visibility: "public",
    updatedAt: "2026-08-26T09:00:00.000Z",
    origin: "generated",
    ownedByViewer: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Derived level and setup time
// ---------------------------------------------------------------------------

test("setup weight counts an agent heaviest and a skill lightest", () => {
  assert.equal(setupWeight({ agentCount: 1, skillCount: 0, scheduleCount: 0 }), 3);
  assert.equal(setupWeight({ agentCount: 0, skillCount: 0, scheduleCount: 1 }), 2);
  assert.equal(setupWeight({ agentCount: 0, skillCount: 1, scheduleCount: 0 }), 1);
  assert.equal(setupWeight({ agentCount: 1, skillCount: 7, scheduleCount: 2 }), 14);
});

test("a negative count cannot drag the weight below zero", () => {
  // A count column is NOT NULL DEFAULT 0, but an older row deserialised through
  // a half-built API is not something the card should render as "-2 skills".
  assert.equal(setupWeight({ agentCount: -3, skillCount: -1, scheduleCount: -1 }), 0);
  assert.equal(estimatedLevel({ agentCount: -3, skillCount: -1, scheduleCount: -1 }), "beginner");
});

test("the canonical one-agent template is beginner, and the boundaries are inclusive", () => {
  assert.equal(estimatedLevel({ agentCount: 1, skillCount: 7, scheduleCount: 2 }), "beginner");
  assert.equal(estimatedLevel({ agentCount: 0, skillCount: LEVEL_BOUNDS.beginner, scheduleCount: 0 }), "beginner");
  assert.equal(estimatedLevel({ agentCount: 0, skillCount: LEVEL_BOUNDS.beginner + 1, scheduleCount: 0 }), "intermediate");
  assert.equal(estimatedLevel({ agentCount: 0, skillCount: LEVEL_BOUNDS.intermediate, scheduleCount: 0 }), "intermediate");
  assert.equal(estimatedLevel({ agentCount: 0, skillCount: LEVEL_BOUNDS.intermediate + 1, scheduleCount: 0 }), "advanced");
});

test("setup minutes never reads as zero, and grows with the template", () => {
  assert.equal(estimatedMinutes({ agentCount: 0, skillCount: 0, scheduleCount: 0 }), 3);
  assert.ok(estimatedMinutes({ agentCount: -9, skillCount: -9, scheduleCount: -9 }) >= 2);
  const small = estimatedMinutes({ agentCount: 1, skillCount: 2, scheduleCount: 0 });
  const large = estimatedMinutes({ agentCount: 3, skillCount: 12, scheduleCount: 8 });
  assert.ok(large > small);
  assert.ok(Number.isInteger(large));
});

// ---------------------------------------------------------------------------
// The stored columns beat the estimate
// ---------------------------------------------------------------------------

test("agent_templates.difficulty wins over the count-derived level", () => {
  // A heavy template the assemble stage judged easy stays easy. Deriving over
  // the top of a stored, server-computed column is how the gallery ends up
  // disagreeing with the review screen about the same row.
  const heavy = { agentCount: 3, skillCount: 12, scheduleCount: 8 };
  assert.equal(estimatedLevel(heavy), "advanced");
  assert.equal(templateLevel({ ...heavy, difficulty: "beginner" }), "beginner");
});

test("difficulty is varchar(16), so an unknown value falls back instead of leaking", () => {
  // A missing dictionary key would render `undefined` in the metric strip.
  assert.equal(asDifficulty("expert"), null);
  assert.equal(asDifficulty(7), null);
  assert.equal(asDifficulty("advanced"), "advanced");
  assert.equal(templateLevel({ agentCount: 1, skillCount: 0, scheduleCount: 0, difficulty: "expert" }), "beginner");
});

test("time_to_value_minutes wins, but a garbled one still cannot read as instant", () => {
  const counts = { agentCount: 1, skillCount: 2, scheduleCount: 0 };
  assert.equal(setupMinutes({ ...counts, timeToValueMinutes: 25 }), 25);
  assert.equal(setupMinutes({ ...counts, timeToValueMinutes: 0 }), estimatedMinutes(counts));
  assert.equal(setupMinutes({ ...counts, timeToValueMinutes: Number.NaN }), estimatedMinutes(counts));
  assert.equal(setupMinutes(counts), estimatedMinutes(counts));
});

test("the estimate caveat is shown only when the values are actually estimated", () => {
  assert.equal(isEstimated(tpl()), true);
  assert.equal(isEstimated(tpl({ difficulty: "advanced" })), true, "half a row is still an estimate");
  assert.equal(isEstimated(tpl({ difficulty: "advanced", timeToValueMinutes: 12 })), false);
});

test("automates is the card line when assemble wrote one; '' is the column default", () => {
  assert.equal(whatItDoes(tpl()), tpl().summary);
  assert.equal(whatItDoes(tpl({ automates: "" })), tpl().summary, "NOT NULL DEFAULT '' is not a line");
  assert.equal(whatItDoes(tpl({ automates: "  " })), tpl().summary);
  assert.equal(whatItDoes(tpl({ automates: "Replies to every inbound form." })), "Replies to every inbound form.");
});

test("a count that arrives as null, a string or NaN does not print '~NaN min'", () => {
  // Math.max(0, NaN) is NaN, and every `NaN <= x` is false — so an un-coerced
  // count both prints NaN and silently labels the template "advanced".
  assert.equal(num(Number.NaN), 0);
  assert.equal(num(null), 0);
  assert.equal(num(undefined), 0);
  assert.equal(num("7"), 7);
  assert.equal(num(-4), 0);
  assert.equal(num(2.9), 2);
  const broken = { agentCount: Number.NaN, skillCount: Number.NaN, scheduleCount: Number.NaN };
  assert.equal(estimatedLevel(broken), "beginner");
  assert.equal(estimatedMinutes(broken), 3);
  assert.equal(formatCount(Number.NaN, "en"), "0");
});

test("tags survive a serializer that sends null", () => {
  assert.deepEqual(tagList(null), []);
  assert.deepEqual(tagList(["a", 3, "b"]), ["a", "b"]);
  // The search predicate is what would have thrown on `null.join`.
  const t = { ...tpl(), tags: null as unknown as string[] };
  assert.equal(matchesFilters(t, { ...DEFAULT_FILTERS, q: "qualifier" }), true);
});

// ---------------------------------------------------------------------------
// Badges, glyph, plan gate
// ---------------------------------------------------------------------------

test("a multi-code-point monogram is not sliced in half", () => {
  // "👩‍🚀" is woman + ZWJ + rocket. mono[0] would be a lone surrogate.
  assert.equal(firstGlyph("👩‍🚀"), "👩");
  assert.equal(firstGlyph("P"), "P");
  assert.equal(firstGlyph(""), "◆");
});

test("a hostile hue from another tenant never reaches a CSS background", () => {
  // `agent_templates.hue` is varchar(16) of free text and, on a scope=public
  // row, was written by a different workspace. React assigns style values
  // through the CSSOM, so a second declaration cannot be injected — but
  // `url(...)` is a perfectly valid single background value, and rendering it
  // would make every viewer of that card fetch a stranger's URL.
  assert.equal(safeHue("url(https://attacker.example/p.gif)"), null);
  assert.equal(safeHue("image-set(url(//x/y))"), null);
  assert.equal(safeHue("red;position:fixed;top:0"), null);
  assert.equal(safeHue("var(--c-lime)"), null);
  assert.equal(safeHue(null), null);
  assert.equal(safeHue("  #D8FF3E "), "#D8FF3E");
  assert.equal(safeHue("#abc"), "#abc");
  assert.equal(safeHue("#D8FF3E80"), "#D8FF3E80");
  // The fallback is the column's own default, not the brand fill: a template
  // that lost its colour should look unset, not featured.
  assert.equal(HUE_FALLBACK, "#9AA3B2");
});

test("YOURS beats PUBLIC, and a platform template gets no badge at all", () => {
  assert.equal(templateBadge(tpl({ ownedByViewer: true, visibility: "public" })), "yours");
  assert.equal(templateBadge(tpl({ ownedByViewer: false, visibility: "public" })), "public");
  assert.equal(templateBadge(tpl({ ownedByViewer: false, visibility: "workspace" })), null);
});

test("third-party is exactly 'public and not mine' — the drawer's warning depends on it", () => {
  assert.equal(isThirdParty(tpl({ ownedByViewer: false, visibility: "public" })), true);
  assert.equal(isThirdParty(tpl({ ownedByViewer: true, visibility: "public" })), false);
  assert.equal(isThirdParty(tpl({ ownedByViewer: false, visibility: "workspace" })), false);
});

test("an unknown viewer plan does not raise an upgrade wall we cannot justify", () => {
  assert.equal(meetsPlan("director", null), true);
  assert.equal(meetsPlan("director", "associate"), false);
  assert.equal(meetsPlan("associate", "director"), true);
  assert.equal(meetsPlan("professional", "professional"), true);
});

// ---------------------------------------------------------------------------
// URL state — untrusted input
// ---------------------------------------------------------------------------

test("every filter value is checked against its allowlist", () => {
  const f = parseFilters(
    new URLSearchParams({
      q: "lead",
      harness: "openclaw",
      category: "sales",
      level: "advanced",
      plan: "director",
      scope: "public",
      sort: "updated",
      page: "3",
    }),
  );
  assert.deepEqual(f, {
    q: "lead",
    harness: "openclaw",
    category: "sales",
    level: "advanced",
    plan: "director",
    scope: "public",
    sort: "updated",
    page: 3,
  });
});

test("a hand-edited query param falls back to the default, never to a request", () => {
  const f = parseFilters(
    new URLSearchParams({
      harness: "'; DROP TABLE agent_templates; --",
      category: "use_count DESC",
      level: "impossible",
      plan: "enterprise",
      scope: "everything",
      sort: "name; DELETE",
      page: "-4",
    }),
  );
  assert.equal(f.harness, "all");
  assert.equal(f.category, "all");
  assert.equal(f.level, "all");
  assert.equal(f.plan, "all");
  assert.equal(f.scope, "all");
  assert.equal(f.sort, "used");
  assert.equal(f.page, 1);
});

test("a pasted essay cannot become the search term", () => {
  const f = parseFilters(new URLSearchParams({ q: "x".repeat(5000) }));
  assert.equal(f.q.length, MAX_QUERY_LEN);
});

test("an empty gallery produces an empty query string, so the link stays clean", () => {
  assert.equal(filtersToQuery(DEFAULT_FILTERS).toString(), "");
});

test("filtersToQuery and parseFilters round-trip", () => {
  const f: GalleryFilters = {
    q: "revenue",
    harness: "hermes",
    category: "finance",
    level: "intermediate",
    plan: "associate",
    scope: "workspace",
    sort: "name",
    page: 2,
  };
  assert.deepEqual(parseFilters(filtersToQuery(f)), f);
});

test("apiQuery sends only params the server's allowlist knows", () => {
  const q = apiQuery({
    ...DEFAULT_FILTERS,
    q: "  lead  ",
    level: "advanced",
    plan: "director",
    harness: "codex",
  });
  assert.equal(q.get("level"), null, "level is derived here — there is no column to filter on");
  assert.equal(q.get("plan"), null, "plan is derived here too");
  assert.equal(q.get("q"), "lead", "the term is trimmed before it is sent");
  assert.equal(q.get("harness"), "codex");
  assert.equal(q.get("perPage"), String(PER_PAGE));
  assert.equal(q.get("page"), "1");
  assert.equal(q.get("sort"), "used");
});

test("hasActiveFilters ignores sort and page — neither is something to clear", () => {
  assert.equal(hasActiveFilters(DEFAULT_FILTERS), false);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, sort: "name", page: 4 }), false);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, q: " " }), false);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, level: "advanced" }), true);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, scope: "public" }), true);
});

// ---------------------------------------------------------------------------
// The client-side mirror of the server's filter
// ---------------------------------------------------------------------------

test("search reads name, summary and tags — the three indexed columns", () => {
  const t = tpl();
  assert.equal(matchesFilters(t, { ...DEFAULT_FILTERS, q: "QUALIFIER" }), true);
  assert.equal(matchesFilters(t, { ...DEFAULT_FILTERS, q: "inbound forms" }), true);
  assert.equal(matchesFilters(t, { ...DEFAULT_FILTERS, q: "crm-sync" }), true);
  assert.equal(matchesFilters(t, { ...DEFAULT_FILTERS, q: "payroll" }), false);
});

test("scope=workspace hides other tenants; scope=public hides your own", () => {
  const mine = tpl({ ownedByViewer: true, visibility: "workspace" });
  const theirs = tpl({ ownedByViewer: false, visibility: "public" });
  assert.equal(matchesFilters(mine, { ...DEFAULT_FILTERS, scope: "workspace" }), true);
  assert.equal(matchesFilters(theirs, { ...DEFAULT_FILTERS, scope: "workspace" }), false);
  assert.equal(matchesFilters(theirs, { ...DEFAULT_FILTERS, scope: "public" }), true);
  assert.equal(matchesFilters(mine, { ...DEFAULT_FILTERS, scope: "public" }), false);
});

test("the derived level filters even though no column backs it", () => {
  const heavy = tpl({ agentCount: 3, skillCount: 12, scheduleCount: 8 });
  assert.equal(matchesFilters(heavy, { ...DEFAULT_FILTERS, level: "advanced" }), true);
  assert.equal(matchesFilters(heavy, { ...DEFAULT_FILTERS, level: "beginner" }), false);
});

test("sorting is total and stable — ties break by name, and the input is not mutated", () => {
  const list = [
    tpl({ id: "b", name: "Beta", useCount: 5, updatedAt: "2026-01-01T00:00:00.000Z" }),
    tpl({ id: "a", name: "Alpha", useCount: 5, updatedAt: "2026-03-01T00:00:00.000Z" }),
    tpl({ id: "c", name: "Gamma", useCount: 9, updatedAt: "2026-02-01T00:00:00.000Z" }),
  ];
  const snapshot = list.map((x) => x.id);
  assert.deepEqual(sortTemplates(list, "used").map((x) => x.id), ["c", "a", "b"]);
  assert.deepEqual(sortTemplates(list, "name").map((x) => x.id), ["a", "b", "c"]);
  assert.deepEqual(sortTemplates(list, "updated").map((x) => x.id), ["a", "c", "b"]);
  assert.deepEqual(list.map((x) => x.id), snapshot, "sortTemplates must copy, not sort in place");
});

test("'Newest' means created_at, and without it the server's order is left alone", () => {
  // Re-sorting "Newest" by updated_at would put the OLDEST row first whenever
  // it was the most recently edited — the exact opposite of the label.
  const noDates = [tpl({ id: "a", name: "A" }), tpl({ id: "b", name: "B" })];
  assert.deepEqual(sortTemplates(noDates, "new").map((x) => x.id), ["a", "b"]);

  const dated = [
    tpl({ id: "old", name: "Old", createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2026-08-28T00:00:00.000Z" }),
    tpl({ id: "new", name: "New", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(sortTemplates(dated, "new").map((x) => x.id), ["new", "old"]);
  assert.deepEqual(sortTemplates(dated, "updated").map((x) => x.id), ["old", "new"]);
});

test("an unparseable updatedAt sorts last instead of throwing", () => {
  const ok = tpl({ id: "ok", updatedAt: "2026-05-05T00:00:00.000Z" });
  const bad = tpl({ id: "bad", name: "Zzz", updatedAt: "not a date" });
  assert.deepEqual(sortTemplates([bad, ok], "updated").map((x) => x.id), ["ok", "bad"]);
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

test("relative time is localized, and a bad timestamp is an em dash not a crash", () => {
  const now = Date.parse("2026-08-29T12:00:00.000Z");
  const threeDays = "2026-08-26T12:00:00.000Z";
  assert.match(relativeTime(threeDays, "en", now), /3 days ago/);
  assert.notEqual(relativeTime(threeDays, "ja", now), relativeTime(threeDays, "en", now));
  assert.equal(relativeTime("nonsense", "en", now), "—");
});

test("counts are grouped for the viewer's locale", () => {
  assert.equal(formatCount(1204, "en"), "1,204");
  assert.equal(formatCount(0, "ja"), "0");
});

// ---------------------------------------------------------------------------
// The dictionaries — a missing key is a hardcoded English string waiting to happen
// ---------------------------------------------------------------------------

test("all four languages carry the same keys", () => {
  const reference = Object.keys(templateGallery.en).sort();
  for (const { code } of LANGS) {
    assert.deepEqual(Object.keys(templateGallery[code]).sort(), reference, `${code} dictionary`);
  }
});

test("every enum the gallery renders has a label in every language", () => {
  for (const { code } of LANGS) {
    const d = templateGallery[code];
    for (const cat of TEMPLATE_CATEGORIES) assert.ok(d.categories[cat], `${code}.categories.${cat}`);
    for (const lv of TEMPLATE_LEVELS) assert.ok(d.levels[lv], `${code}.levels.${lv}`);
    for (const s of TEMPLATE_SORTS) assert.ok(d.sorts[s], `${code}.sorts.${s}`);
    for (const s of TEMPLATE_SCOPES) assert.ok(d.scopes[s], `${code}.scopes.${s}`);
    for (const p of PLAN_TIERS) assert.ok(d.plans[p], `${code}.plans.${p}`);
    for (const { code: l } of LANGS) assert.ok(d.langNames[l], `${code}.langNames.${l}`);
    for (const k of ["generated", "manual", "seeded", "forked"] as const) {
      assert.ok(d.origins[k], `${code}.origins.${k}`);
    }
    for (const k of ["low", "medium", "high"] as const) assert.ok(d.risk[k], `${code}.risk.${k}`);
    for (const k of ["suggest", "ask", "auto"] as const) {
      assert.ok(d.autonomy[k], `${code}.autonomy.${k}`);
    }
    for (const k of ["pasted_text", "file_request", "url"] as const) {
      assert.ok(d.contextKind[k], `${code}.contextKind.${k}`);
    }
  }
});

test("no dictionary leaks English into a CJK locale for the strings a user reads", () => {
  // Not a spell-check — a guard against the copy-paste that leaves `heading`
  // and `emptyTitle` in English after the other 150 keys were translated.
  for (const code of ["zh", "zht", "ja"] as const) {
    const d = templateGallery[code];
    for (const key of ["heading", "emptyTitle", "errorTitle", "start", "preview"] as const) {
      assert.notEqual(d[key], templateGallery.en[key], `${code}.${key} is still English`);
    }
  }
});

test("the harness filter offers every harness the schema knows", () => {
  // The gallery's harness options come from HARNESS_LIST, so a fifth harness
  // appears in the filter instead of silently hiding every template on it.
  assert.equal(HARNESS_IDS.length, 4);
  for (const id of HARNESS_IDS) {
    assert.equal(parseFilters(new URLSearchParams({ harness: id })).harness, id);
  }
});

test("the stored view accepts only the two modes it can draw", () => {
  assert.deepEqual([...VIEW_MODES], ["card", "list"]);
  assert.equal(isViewMode("list"), true);
  assert.equal(isViewMode("gallery"), false);
});
