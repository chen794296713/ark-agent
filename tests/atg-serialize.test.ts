/**
 * The template serializer: what leaves the server, and what may not.
 *
 * Three properties are asserted here rather than trusted:
 *
 *  1. **The DTO the API sends is the DTO the gallery reads.** The type-level
 *     assertions at the top fail to COMPILE if `lib/atg/serialize.ts` and
 *     `components/template/types.ts` ever drift. Those two files are owned by
 *     different verticals and declare the same shape on purpose; without this,
 *     a renamed field is a blank gallery discovered in a browser.
 *  2. **Nothing leaks.** `agent_templates` carries `created_by_id`,
 *     `generation_id` and `forked_from_id`; `template_generations` carries the
 *     customer's verbatim brief and the injection findings from screening it.
 *     The tests below assert the serializers are allow-lists by checking the
 *     exact key set, not by checking that one known field is absent — a spread
 *     added later would pass the second kind of test.
 *  3. **A public row's text is another tenant's text.** `hue` reaches the DOM
 *     as a CSS `background` value and `mono` as a glyph; both are re-derived
 *     rather than echoed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { genTexts, landingRoles, rolesData } from "../lib/data";
import { roleHue } from "../lib/theme";
import type { AgentRole } from "../lib/db/schema";
import { composeDeterministic, type IntakeFacts } from "../lib/atg/deterministic";
import { agentTemplateDraftSchema } from "../lib/atg/schema";
import type { AgentTemplateDraft } from "../lib/atg/types";
import {
  asCategory,
  automatesFor,
  difficultyFor,
  HUE_FALLBACK,
  safeHue,
  safeMono,
  serializeGeneration,
  serializeTemplateCard,
  serializeTemplateDetail,
  setupWeight,
  tagList,
  templateColumnsFromDraft,
  timeToValueFor,
  type GenerationRowLike,
  type TemplateDetailDTO,
  type TemplateRowLike,
  type TemplateSummaryDTO,
} from "../lib/atg/serialize";
import type {
  TemplateDetailDTO as GalleryDetailDTO,
  TemplateSummaryDTO as GallerySummaryDTO,
} from "../components/template/types";

// ---------------------------------------------------------------------------
// 0 · The contract between the API and the page, checked by the compiler
// ---------------------------------------------------------------------------

/** Mutual assignability. One direction alone would let either side add a
 *  required field the other does not send. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const _summaryMatches: Exact<TemplateSummaryDTO, GallerySummaryDTO> = true;
const _detailMatches: Exact<TemplateDetailDTO, GalleryDetailDTO> = true;
void _summaryMatches;
void _detailMatches;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-03-02T01:00:00.000Z");

const SEEDED_ROLES: AgentRole[] = rolesData.map((r, i) => ({
  id: r.id,
  name: r.name,
  blurb: r.blurb,
  longBlurb: landingRoles.find((l) => l.id === r.id)?.long ?? null,
  hue: roleHue[r.id] ?? "#9AA3B2",
  mono: r.mono,
  defaultEngine: "openclaw",
  defaultInstructions: genTexts[r.id]?.i ?? null,
  defaultRules: genTexts[r.id]?.r ?? null,
  minPlan: r.minPlan,
  sortOrder: i,
}));

function facts(over: Partial<IntakeFacts> = {}): IntakeFacts {
  return {
    brief: "Chase my unpaid invoices and keep the books tidy.",
    briefSha256: "b".repeat(64),
    locale: "en",
    harness: "openclaw",
    roleGuess: { roleId: "opc", score: 9, alternatives: [] },
    channelHints: [],
    toolHints: [],
    scheduleHints: [],
    moneyHints: [],
    injection: [],
    timezone: "Asia/Singapore",
    tooThin: false,
    ...over,
  };
}

function draft(over: Partial<IntakeFacts> = {}): AgentTemplateDraft {
  return composeDeterministic(
    facts(over),
    [],
    SEEDED_ROLES,
    { name: "Acme", timezone: "Asia/Singapore" },
    { now: NOW, generationId: "11111111-1111-4111-8111-111111111111" },
  );
}

function templateRow(d: AgentTemplateDraft, over: Partial<TemplateRowLike> = {}): TemplateRowLike {
  const columns = templateColumnsFromDraft(d);
  return {
    id: "22222222-2222-4222-8222-222222222222",
    workspaceId: "ws-1",
    ...columns,
    visibility: "private",
    origin: "generated",
    useCount: 3,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1 · The card is an allow-list
// ---------------------------------------------------------------------------

const CARD_KEYS = [
  "id",
  "slug",
  "name",
  "summary",
  "category",
  "tags",
  "mono",
  "hue",
  "locale",
  "harness",
  "minPlan",
  "skillCount",
  "scheduleCount",
  "agentCount",
  "useCount",
  "difficulty",
  "timeToValueMinutes",
  "automates",
  "createdAt",
  "materializable",
  "visibility",
  "updatedAt",
  "origin",
  "ownedByViewer",
];

test("the card serializer emits exactly the documented keys and nothing else", () => {
  const row = {
    ...templateRow(draft()),
    // Columns that exist on the table and must never reach a browser. They are
    // typed off the row shape, so a spread would carry them here.
    createdById: "user-9",
    generationId: "gen-9",
    forkedFromId: "tpl-9",
    archivedAt: null,
  } as TemplateRowLike;

  const dto = serializeTemplateCard(row, "ws-1");
  assert.deepEqual(Object.keys(dto).sort(), [...CARD_KEYS].sort());
  assert.equal("draft" in dto, false);
  assert.equal("createdById" in dto, false);
  assert.equal("generationId" in dto, false);
});

test("ownedByViewer is per-caller, and a platform row belongs to nobody", () => {
  const d = draft();
  assert.equal(serializeTemplateCard(templateRow(d), "ws-1").ownedByViewer, true);
  assert.equal(serializeTemplateCard(templateRow(d), "ws-2").ownedByViewer, false);
  // workspace_id IS NULL — readable everywhere, writable through the admin
  // surface only. Reporting it as "yours" would put Edit on a row PATCH 404s.
  assert.equal(
    serializeTemplateCard(templateRow(d, { workspaceId: null }), "ws-1").ownedByViewer,
    false,
  );
});

test("an empty `automates` is omitted, so the card falls back to `summary`", () => {
  const d = draft();
  const withNone = serializeTemplateCard(templateRow(d, { automates: "" }), "ws-1");
  assert.equal("automates" in withNone, false);
  const withOne = serializeTemplateCard(templateRow(d, { automates: "Chases invoices." }), "ws-1");
  assert.equal(withOne.automates, "Chases invoices.");
});

test("the detail payload adds the draft and nothing else", () => {
  const d = draft();
  const dto = serializeTemplateDetail({ ...templateRow(d), draft: d }, "ws-1");
  assert.deepEqual(Object.keys(dto).sort(), [...CARD_KEYS, "description", "draft"].sort());
  assert.equal(dto.draft.meta.slug, d.meta.slug);
});

// ---------------------------------------------------------------------------
// 2 · Third-party text is re-derived, never echoed
// ---------------------------------------------------------------------------

test("hue accepts only a hex literal — a CSS url() is a tracking pixel", () => {
  assert.equal(safeHue("#F472B6"), "#F472B6");
  assert.equal(safeHue("  #abc  "), "#abc");
  // Legal CSS `background` values, every one of them, and none of them a colour.
  assert.equal(safeHue("url(https://attacker.example/p.gif)"), HUE_FALLBACK);
  assert.equal(safeHue("red"), HUE_FALLBACK);
  assert.equal(safeHue("#F472B6;position:fixed"), HUE_FALLBACK);
  assert.equal(safeHue(null), HUE_FALLBACK);
  assert.equal(safeHue(42), HUE_FALLBACK);
});

test("mono keeps at most two CODE POINTS and never half a surrogate pair", () => {
  assert.equal(safeMono("A"), "A");
  assert.equal(safeMono("🙂"), "🙂");
  // A flag is two regional indicators; both are kept and neither is split.
  assert.equal(Array.from(safeMono("🇯🇵")).length, 2);
  // A whole word in a varchar(8) is a caption, not an avatar.
  assert.equal(Array.from(safeMono("INVOICES")).length, 2);
  assert.equal(safeMono(""), "T");
  assert.equal(safeMono(undefined), "T");
  // U+202E RIGHT-TO-LEFT OVERRIDE would flip the rest of the card's line.
  assert.equal(safeMono("‮"), "T");
});

test("tags are slugged, de-duplicated and capped at eight", () => {
  assert.deepEqual(tagList(["Invoice Chasing", "invoice-chasing", "AR"]), [
    "invoice-chasing",
    "ar",
  ]);
  assert.equal(tagList(Array.from({ length: 30 }, (_, i) => `t${i}`)).length, 8);
  // `jsonb` with a `[]` default still comes back null from a half-built query,
  // and `null.join` takes the whole grid down.
  assert.deepEqual(tagList(null), []);
  assert.deepEqual(tagList("invoices"), []);
});

test("an unknown category degrades to `other` rather than to a missing lookup", () => {
  assert.equal(asCategory("finance"), "finance");
  assert.equal(asCategory("__proto__"), "other");
  assert.equal(asCategory(null), "other");
});

// ---------------------------------------------------------------------------
// 3 · The computed card columns
// ---------------------------------------------------------------------------

test("the card columns are computed from the draft, never read off it", () => {
  const d = draft();
  const columns = templateColumnsFromDraft(d);
  assert.equal(columns.skillCount, d.skills.length);
  assert.equal(columns.scheduleCount, d.schedules.length);
  assert.equal(columns.agentCount, d.agents.length);
  assert.equal(columns.materializable, d.provenance.materializable);
  assert.ok(columns.automates.length <= 140);
  assert.ok(columns.timeToValueMinutes >= 2);
  assert.ok(["beginner", "intermediate", "advanced"].includes(columns.difficulty));
});

test("difficulty and setup time rise with the work, and stay inside their bounds", () => {
  const base = draft();
  const heavy: AgentTemplateDraft = {
    ...base,
    skills: Array.from({ length: 10 }, (_, i) => ({
      ...(base.skills[0] ?? {
        key: `s${i}`,
        skillId: null,
        source: "clawhub",
        ownerHandle: null,
        slug: `s${i}`,
        version: null,
        displayName: `S${i}`,
        purpose: "x",
        riskLevel: "low" as const,
        riskAccepted: false,
        harnessCompatible: true,
        requirements: { env: ["TOKEN"] },
        required: true,
        rankScore: 1,
        rankReasons: [],
      }),
      key: `s${i}`,
      slug: `s${i}`,
      requirements: { env: ["TOKEN"] },
    })),
  };
  assert.ok(setupWeight(heavy) > setupWeight(base));
  assert.equal(difficultyFor(heavy), "advanced");
  assert.ok(timeToValueFor(heavy) > timeToValueFor(base));
  assert.ok(timeToValueFor(heavy) <= 240);
});

test("`automates` trims to a sentence rather than mid-word, and never exceeds 140", () => {
  const d = draft();
  const long: AgentTemplateDraft = {
    ...d,
    meta: {
      ...d.meta,
      summary:
        "Chases every unpaid invoice on a weekly cadence. Then it files the replies, updates the ledger, and tells you which accounts have gone quiet for too long.",
    },
  };
  const out = automatesFor(long);
  assert.ok(out.length <= 140);
  assert.ok(out.endsWith("."), `expected a sentence end, got ${JSON.stringify(out)}`);
  assert.equal(automatesFor({ ...d, meta: { ...d.meta, summary: "" } }), "");
});

test("a deterministic draft round-trips through the column mapping and still validates", () => {
  const d = draft();
  assert.equal(agentTemplateDraftSchema.safeParse(d).success, true);
  const columns = templateColumnsFromDraft(d);
  // The column widths are the contract with Postgres; a value over them is a
  // `value too long` at insert, which is a 500 for a template that generated
  // perfectly well.
  assert.ok(columns.slug.length <= 48);
  assert.ok(columns.name.length <= 60);
  assert.ok(columns.summary.length <= 200);
  assert.ok(columns.mono.length <= 8);
  assert.ok(columns.tags.length <= 8);
});

// ---------------------------------------------------------------------------
// 4 · Generations
// ---------------------------------------------------------------------------

function generationRow(over: Partial<GenerationRowLike> = {}): GenerationRowLike {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    status: "running",
    mode: "hybrid",
    stageTraces: [
      {
        stage: "intake",
        engine: "rules",
        model: null,
        startedAt: NOW.toISOString(),
        durationMs: 2,
        attempts: 1,
        outcome: "ok",
        promptTokens: 0,
        completionTokens: 0,
        errorCode: null,
      },
    ],
    warnings: [],
    draft: null,
    errorCode: null,
    promptTokens: 120,
    completionTokens: 40,
    costMicroUsd: 900,
    llmCalls: 2,
    templateId: null,
    agentId: null,
    createdAt: NOW,
    finishedAt: null,
    ...over,
  };
}

test("a generation never carries the brief, its sha, or the injection findings", () => {
  const dto = serializeGeneration({
    ...generationRow(),
    // Columns on the table. `brief` is the customer's own words; the findings
    // are the attack strings someone typed into a text box.
    brief: "chase my invoices",
    briefSha256: "a".repeat(64),
    correlationId: "44444444-4444-4444-8444-444444444444",
    injectionFindings: [{ pattern: "override", offset: 0, excerpt: "ignore all", severity: "error" }],
    userId: "user-9",
    workspaceId: "ws-1",
  } as GenerationRowLike);

  for (const leaked of ["brief", "briefSha256", "correlationId", "injectionFindings", "userId", "workspaceId"]) {
    assert.equal(leaked in dto, false, `${leaked} must not be serialized`);
  }
});

test("progress tracks the last trace while running and is null once terminal", () => {
  const running = serializeGeneration(generationRow());
  assert.deepEqual(running.progress, { stage: "intake", index: 0, total: 10 });

  for (const status of ["ready", "needs_review", "failed", "canceled", "materialized"] as const) {
    const done = serializeGeneration(generationRow({ status }));
    // Leaving the last stage "active" after the draft has landed makes the
    // screen look stuck on a step that already finished.
    assert.equal(done.progress, null, `progress must be null for ${status}`);
  }
});

test("a half-written generation row degrades instead of throwing", () => {
  // `stage_traces` and `warnings` are NOT NULL with a `[]` default, but a row
  // read mid-write through a partial select is still representable, and every
  // consumer indexes these as arrays.
  const dto = serializeGeneration(generationRow({ stageTraces: null, warnings: undefined }));
  assert.deepEqual(dto.stageTraces, []);
  assert.deepEqual(dto.warnings, []);
  assert.equal(dto.draft, null);
  assert.equal(dto.cost?.costMicroUsd, 900);
});
