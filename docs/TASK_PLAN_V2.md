# ArkAgent v2 — Executable Task Plan

**Status:** normative. This document supersedes the sibling designs wherever they disagree, and
§1 records every place they did.

**Audience:** the ArkAgent engineers building v2. The backend/runtime team reads
`docs/BACKEND_INTEGRATION_CONTRACT.md` instead; QA reads `docs/TEST_PLAN_V2.md`. See
`docs/README_V2.md` for the map.

---

## 0. How to read this

The v2 corpus is eight design documents totalling ~21,000 lines, written in parallel by separate
authors. They are individually good and collectively contradictory: the same table is defined
twice with different column names, the same migration slot is claimed twice, and one column is
declared twice with two different expressions in a way that fails **silently** rather than loudly.
This document does two jobs:

1. **§1 — the conflict ledger.** Every cross-document contradiction found, the winner, the reason,
   and which file was edited. All edits are already applied; the corpus on disk is consistent.
2. **§2–§8 — the plan.** Waves, tasks, files, i18n, verification gates, risks, definition of done.

**All four documents named in the original brief now exist.** An earlier revision of this section
said three (four, in fact) had never been written; that is no longer true, and the tasks that were
written around their absence have been converted:

| Document | Lines | Owns | Closed |
|---|---|---|---|
| `docs/DATA_MODEL_V2.md` | 3,919 | Every v2 table, column, index, constraint, JSONB payload, retention pass and read query; the migration slot map | The three-way schema split that caused C1, C2 and C5 |
| `docs/REMINDERS_AND_SCHEDULERS.md` | 2,892 | Who fires a due schedule, the claim protocol, the advance/dispatch ordering, misfire policy, the tick route and its authz | **W3-1**, and both of its gating questions |
| `docs/HARNESSES_AND_ACTIVITY.md` | 2,943 | `lib/harness/**`, the capability matrix, `HarnessAdapter`, auto-match, the activity-code vocabulary, and every Activity view | The telemetry half of R5 |
| `docs/PRP.md` | 1,313 | The product requirements the acceptance-criterion namespace hangs off | The "there is no PRP" note in `README_V2.md` |

They introduced **eight new cross-document conflicts**, C14–C21 in §1, and one of them — C14 —
corrects §2.1 of this document. Wave 3's two specification tasks are now implementation tasks
(§3). §8.2 lists what the product owner still owes; it is unchanged in substance, and three items
gained a stated schema or scheduling consequence.

**Sizes.** `S` ≤ 0.5 day · `M` 1–2 days · `L` 3–5 days · `XL` > 5 days, and should have been split.
Estimates assume one engineer who has read the owning design document.

---

## 1. The conflict ledger

**Twenty-one conflicts.** C1–C13 came from the first reconciliation of the eight-document corpus.
**C14–C21 came from the four documents written afterwards** (`DATA_MODEL_V2.md`,
`REMINDERS_AND_SCHEDULERS.md`, `HARNESSES_AND_ACTIVITY.md`, `PRP.md`) and are recorded at the end
of this section. Each row: what disagreed, who won, why, and what was edited. Every "edited"
column names a change already made — this is a record, not a to-do list.

### C1 · `agent_skills` — the state column and its enum · **BUILD-BREAKING**

| Document | Said |
|---|---|
| `SKILL_REPOSITORY.md` §1.4 | column `state`, type `agent_skill_state` |
| `BACKEND_INTEGRATION_CONTRACT.md` §2.1/§2.5 | column `status`, type `agent_skill_status` |
| `AGENT_TEMPLATE_GENERATOR.md` §7.3.1 | column `status` |
| `UI_DESIGN_V2.md` §D | `agent_skills.status` |

The two owning documents **each conceded to the other in the same review round and crossed in
flight**, so the contradiction survived being "fixed" twice. Each doc now cites the other as its
authority for the opposite answer.

**Winner: `state` / `agent_skill_state`.** Three reasons, in order of weight: (a) `BACKEND_INTEGRATION_CONTRACT.md` §2.5 itself now says "this table is defined by `docs/SKILL_REPOSITORY.md` §1.4, not here", so the table's owner is settled and the owner says `state`; (b) the wire event is `agent.skill_state` and its payload field is `state` — one vocabulary end to end means there is no mapping layer for a mapping to be wrong in; (c) `agent_context_items.state` already spells the identical concept the same way, and that spelling was itself the outcome of an earlier `state`-vs-`status` decision in the same contract.

**Edited:** `BACKEND_INTEGRATION_CONTRACT.md` §2.1 (enum name + the six values, which SKILL_REPOSITORY uses but never lists), §2.5 (column, index, manifest mapping row); `AGENT_TEMPLATE_GENERATOR.md` §7.3.1; `UI_DESIGN_V2.md` §F.5; `SKILL_REPOSITORY.md` §1.4a (the reconciliation row, which had recorded the concession that caused the crossing).

### C2 · `skills.search_tsv` — declared twice, two different expressions · **SILENT FAILURE**

| Document | Expression |
|---|---|
| `SKILL_REPOSITORY.md` §1.3 | `to_tsvector('simple', name ‖ slug ‖ summary ‖ description)`, no weights, no tags, no GIN index |
| `AGENT_TEMPLATE_GENERATOR.md` §5.2 | `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `'english'`, `setweight` A/B, tags included, + `skills_search_idx` |

This is the most dangerous conflict in the corpus because **neither migration errors.** Both are
guarded, so whichever ran second was a no-op. ATG then queries the surviving column with
`websearch_to_tsquery('english', …)` and reads `ts_rank`'s A/B weights. Against a `'simple'`
column, the stemmed query lexeme `invoic` never matches the indexed lexeme `invoices`:
`capabilityMatch` — **3.00 of the ranker's 7.20-point scale** — silently collapses toward zero,
every generated template falls back to the tag-containment path, and nothing in any log says so.

**Winner: ATG's expression, SKILL_REPOSITORY's ownership.** One declaration, inside the `skills`
`CREATE TABLE`, carrying `'english'` + `setweight` + tags, with `skills_search_idx` beside it.
The Skill Repository's stated objection — "a tsvector needs a text-search configuration per UI
language and we have four" — does not apply, because ATG's *query* text is English by construction
(§2.4 there) and **browse search stays `ILIKE`**, which is substring matching and is what a CJK
query actually needs. Both designs get what they need; they were never really in conflict, only
their migrations were.

**Also fixed, and this one was a hard error:** ATG's expression was **invalid PostgreSQL**. A
generation expression may not contain a subquery, and ATG's tag term was
`(SELECT string_agg(t,' ') FROM jsonb_array_elements_text(tags) AS t)` — itself introduced as the
"fix" for an earlier `array_to_string(ARRAY(SELECT …))`, which fails for the same reason. Both
raise `ERROR: cannot use subquery in column generation expression`. Replaced with
`coalesce(tags::text,'')`: the `jsonb→text` cast is immutable, and `'["pdf","extract"]'::text`
tokenises to `pdf` and `extract` with the punctuation discarded, which is precisely what a
B-weighted tag term needs.

**Edited:** `SKILL_REPOSITORY.md` §1.3 (column expression, new index, the "rejected for now"
paragraph, the conflict blockquote); `AGENT_TEMPLATE_GENERATOR.md` §5.2 (the `ALTER TABLE` block
is gone, replaced by a pointer plus the reasoning).

### C3 · `context_item_state.awaiting_upload`

`BACKEND_INTEGRATION_CONTRACT.md` §2.1/§2.6 defines it and requires the generator to write it.
`AGENT_TEMPLATE_GENERATOR.md` §7.3.2 asserted the value "does not exist" and mapped
`kind: "file_request"` → `pending`. `UI_DESIGN_V2.md` §C.3.3 and `TEST_PLAN_V2.md` §B.4 both side
with the contract.

**Winner: the contract.** The distinction is load-bearing, not cosmetic: `awaiting_upload` means
"no bytes exist", `pending` means "bytes are here, indexing has not started". Collapsing them
tells the runtime to fetch a null `content_url` on every generated template, and erases the state
the UI draws the `[ Upload ]` action from.

**Edited:** `AGENT_TEMPLATE_GENERATOR.md` §7.3.2 (prose + two mapping rows) and §14 R1.

### C4 · `agent_schedules.max_runs_per_day` and `deliver_to`

`AGENT_TEMPLATE_GENERATOR.md` §3.6 and §7.3.3 both state these have "**no column**" and are
ATG-side only. `BACKEND_INTEGRATION_CONTRACT.md` §2.7 added both columns — explicitly *because*
the generator needs them — after the ATG paragraph was written.

**Winner: the contract.** ATG's own lint rule ATG-L007 is a circuit breaker whose ceiling would
otherwise be discarded at save time, and `deliverTo` is, in `UI_DESIGN_V2.md`'s words, "the second
question every user asks after *when*".

**Edited:** `AGENT_TEMPLATE_GENERATOR.md` §3.6 (the field comment) and §7.3.3 (two new mapping
rows; the "no column" row narrowed to the four fields that genuinely have none).

### C5 · Migration slot collision

`SKILL_REPOSITORY.md` §9 claimed `0007` + `0008`. `AGENT_TEMPLATE_GENERATOR.md` §0.2 claimed
`0008` + `0009`. Both wrote `0008`. At the time, `meta/_journal.json` ended at `0006_goofy_dorian_gray`; it now ends at `0007_v2_enum_values`, which is what **C14** is about.

**Winner: neither — a global order, fixed in §2.1 below.** No single design owns the shared
enum-values file, which is the one file with a real Postgres hazard attached to it.

**Edited:** both documents now name the shared files and point here.

### C6 · `agent_schedules` constraints — three defects in the owning doc

Not a cross-document conflict; a defect in the only document that defines the table, found while
reconciling C4.

- The `agent_schedules_shape` CHECK asserted only that each `kind`'s **own** column was non-null,
  so `kind='cron'` with `interval_seconds = 5` passed and stored a row meaning something other
  than what it says. Each arm now also asserts the other two discriminants are NULL.
- Nothing bounded `jitter_seconds`; a negative value walks `next_run_at` backwards and can re-fire
  an occurrence that already ran. Added CHECKs for `jitter_seconds`, `max_runtime_seconds`,
  `max_runs_per_day` and `deliver_to`.
- `agent_schedules_due_idx … WHERE enabled` indexes rows where `next_run_at IS NULL` — which is
  every fired `once` schedule and every unmatchable cron. Narrowed to match the §5.3 predicate.
- `timezone NOT NULL DEFAULT 'Asia/Singapore'` — an arbitrary regional default in an en/zh/zht/ja
  product. Now `UTC`, with the real value written from `workspaces.timezone` at insert.

**Edited:** `BACKEND_INTEGRATION_CONTRACT.md` §2.7.

### C7 · `TemplateSummaryDTO` field list

`UI_DESIGN_V2.md` §B.10 adds `origin` and `ownedByViewer` and renders both in §B.3's badge.
`AGENT_TEMPLATE_GENERATOR.md` §9.4, which owns the type, lists neither.

**Winner: UI (superset).** `origin` is a real column; `ownedByViewer` is computed in the
serializer and must never become one — the same row is "yours" to one tenant and "public" to
another. **Edited:** `AGENT_TEMPLATE_GENERATOR.md` §9.4.

### C8 · `TimelineItemDTO`'s activity variant drops the v2 event's payload

`BACKEND_INTEGRATION_CONTRACT.md` §3.3/§3.4 make `agent_activities.text` an **empty string**
whenever `code` is set, because rendering prose at ingest freezes one of four languages in
forever — which is the entire point of the v2 `agent.activity` event. `UI_DESIGN_V2.md` §F.5's
activity variant carried only `text` and `tag`, so every v2 activity row would render blank.

**Winner: the contract.** **Edited:** `UI_DESIGN_V2.md` §F.5 — added `code`, `params`, `runId`,
with the render rule (`code` non-null ⇒ render from `code`+`params` via `lib/i18n/activity.ts`;
`text` only when `code` is null) and the reminder that `params` is untrusted runtime data.

### C9 · Four mandated routes that no document specifies

`app/api/agents/[id]/schedules/**`, `app/api/agents/[id]/context/**`,
`app/api/agents/[id]/activity/**` and `app/api/cron/schedules` are architectural constants. Only
fragments exist: `UI_DESIGN_V2.md` §F.1 names the activity query params, `TEST_PLAN_V2.md` names a
few status codes, and `BACKEND_INTEGRATION_CONTRACT.md` §5.3 *assumes* the cron endpoint exists
while `docs/PAYMENTS.md:496` states flatly "there is no cron in this app today" and `vercel.json`
declares no `crons` array.

**Resolved, after the fact.** `docs/REMINDERS_AND_SCHEDULERS.md` §3.8 now specifies
`app/api/cron/schedules` and `app/api/agents/[id]/schedules/**` (route by route, with authz, Zod
shapes and status codes); `docs/HARNESSES_AND_ACTIVITY.md` §6.0 specifies
`app/api/agents/[id]/activity/**` — all seven views nested *under* `activity/`, not as siblings;
`docs/AGENT_TEMPLATE_GENERATOR.md` §7.2 and `docs/DATA_MODEL_V2.md` §9.1 between them specify
`app/api/agents/[id]/context/**`. **W3-1 is closed and W3-2 is now an implementation task** (§3).
The four routes are still architectural constants; they are no longer unspecified.

### C10 · Seeded ClawHub row count · 30 vs 31

`SKILL_REPOSITORY.md` §3.4 and `TEST_PLAN_V2.md` say 30 (`mcporter` deliberately excluded);
`BACKEND_INTEGRATION_CONTRACT.md` §2.5 said 31. **Winner: 30.** **Edited:** the contract.

### C11 · `safety_score`/`safety_tier` vs `risk_score`/`risk_level`

`SKILL_REPOSITORY.md` §1.4a still records this as "**Unresolved** — goes to the backend team". It
is resolved: the contract's §2.5 has since been rewritten to read `skills.risk_level` /
`skills.risk_score`, and `safety_score`/`safety_tier` exist in no schema. A stale "unresolved"
marker on a settled question is how a team builds both. **Edited:** `SKILL_REPOSITORY.md` §1.4a.

### C12 · `MOCK_DATA_AUDIT.md` describes a stale `lib/data.ts`

Re-verified against the working tree: the file is **394 lines with 10 exports**, not 412 with 12.
`hireChannels` and `overviewFeed` **no longer exist** — two Wave-0 deletion tasks that are already
done — and every line reference after `:250` was off by 8–18. **Edited:** counts corrected, the
two dead rows struck through rather than deleted so the finding count still reconciles, line refs
re-anchored, and a standing instruction added to re-grep by symbol name rather than by line.

### C13 · `RunStepDTO.startedAt` names a column that does not exist

`agent_run_steps` has `occurred_at`; only `agent_runs` has `started_at`. The DTO field name
invited exactly the mis-join that would order a step trace by its run's clock. **Edited:**
`UI_DESIGN_V2.md` §F.5 → `occurredAt`.

---

## 1a. The second round — conflicts introduced by the four late documents

C1–C13 above reconciled the eight documents that existed in the first round. `DATA_MODEL_V2.md`,
`REMINDERS_AND_SCHEDULERS.md`, `HARNESSES_AND_ACTIVITY.md` and `PRP.md` were written afterwards,
against that reconciled corpus, and introduced eight more. C14 is the only one that changes this
document; the rest were resolved by editing the losing sibling.

### C14 · The migration slot map in §2.1 is off by one · **SILENT FAILURE, and §2.1 is the loser**

`DATA_MODEL_V2.md` §1.1 found it, and it is right. §2.1 below was written when
`meta/_journal.json` ended at `0006_goofy_dorian_gray` and instructed the engineer to put eleven
`ALTER TYPE … ADD VALUE` statements into `0007_v2_enum_values.sql`. **That file now exists on disk
and is journaled** (`idx: 7`, `tag: "0007_v2_enum_values"`, `when: 1788007550400`) with exactly two
statements — `engine += 'codex'`, `engine += 'deepseek'`. W0-6 shipped.

Editing it is worse than useless. `drizzle-orm` decides applied-ness by
`Number(lastDbMigration.created_at) < migration.folderMillis`
(`node_modules/drizzle-orm/pg-core/dialect.cjs:64`) and **never re-reads or re-hashes an applied
file.** So an amended 0007 would apply cleanly on a fresh CI replay and go green, while every
database that has already run it — production, dev, every branch — would never receive `feishu`,
`dingtalk`, `wecom`, the five `skill_*` admin verbs, `template_gen` or `schedule_parse`. The first
symptom is a **runtime** 500: `invalid input value for enum channel_type: "feishu"` on the first
Feishu ingest, and the same for `llm_call_kind` on every ATG model call. Nothing in the migration
log would explain it.

**Winner: `DATA_MODEL_V2.md`. §2.1 is corrected below**, not the other way round — this is the one
place in the corpus where a sibling found a real defect in the normative document rather than a
disagreement with it. Every DDL slot shifts up by exactly one and the unshipped enum values get a
new `0008_v2_enum_values_2.sql`; §2.1's per-slot *contents* are unchanged and remain normative.
Also folded in: two enum values §2.1 never listed (`llm_call_kind += 'template_gen'`, from
`AGENT_TEMPLATE_GENERATOR.md` §0.2; `+= 'schedule_parse'`, from `REMINDERS_AND_SCHEDULERS.md`
§4.2) and three tables its runtime row never listed (`runtime_event_receipts`, `scheduler_ticks`,
and the `schedule_run_rank(text)` function).

**Edited:** §2.1, §4.1, §6.2, §7 R1 and §8.1 here; `HARNESSES_AND_ACTIVITY.md` (21 slot
references); `REMINDERS_AND_SCHEDULERS.md` (13); `PRP.md` (3).

### C15 · `ChannelType`'s client-safe home — `lib/channels.ts` vs `lib/channels/types.ts`

Both `HARNESSES_AND_ACTIVITY.md` §1.3.1(a) and `DATA_MODEL_V2.md` §13 independently found that
`ChannelType` exists only as `(typeof channelTypeEnum.enumValues)[number]` in `lib/db/schema.ts`,
that `AgentTemplateDraft` needs it, and that importing it drags Drizzle and `postgres` into the
template editor's browser bundle. They reached the same fix and gave it two different paths and
two different tasks: `lib/channels.ts` under **W0-4b**, versus `lib/channels/types.ts` under
**W0-7**.

**Winner: `lib/channels.ts`, W0-4b.** W0-7 is the core-columns migration task, which is the wrong
home for a client-safe types module; and a single flat file needs no `index.ts` re-export, unlike
`lib/harness/`, which has three. **Edited:** `DATA_MODEL_V2.md` §13 and its appendix. W0-4b is
folded into W0-4 in §3.

### C16 · `scheduler_ticks` exists in one document and no schema

`REMINDERS_AND_SCHEDULERS.md` §3.0 delta 12 defines it and R1 there makes it the entire mitigation
for "the platform tick is coarser than the finest schedule and nothing says so".
`DATA_MODEL_V2.md`'s slot map named seven runtime tables and not this one.

**Winner: `REMINDERS_AND_SCHEDULERS.md`.** The table earns its place: it is the only evidence that
the cron ran at the granularity the product sells, and without it every other table looks healthy
while a five-minute poll runs twice a day. **Edited:** `DATA_MODEL_V2.md` gains §11.4, amendment
**A5**, a §2.1 row, and two appendix types; §2.1 below names it.

Note the deliberate asymmetry recorded there: `scheduler_ticks` prunes **itself**, one `DELETE`
per tick, rather than joining the nightly sweep — a ledger whose purpose is proving the tick ran
must not depend on a second cron entry the plan may not allow.

### C17 · `agent_schedules` / `agent_schedule_runs` — two documents, two column sets

`DATA_MODEL_V2.md` §9.2/§11.1 declare both tables from `BACKEND_INTEGRATION_CONTRACT.md` §2.7/§3.3
as amended by C6. `REMINDERS_AND_SCHEDULERS.md` §3.0 then adds eleven columns and constraints
across them — the claim lease, `expectation`, misfire accounting, retry state, the `source`
discriminator, two indexes and the `agent_schedules_enabled_next` CHECK — none of which the schema
document carried.

**Winner: `REMINDERS_AND_SCHEDULERS.md` on the column set and its semantics; `DATA_MODEL_V2.md`
on the Drizzle spelling and the CHECKs.** The execution path is the only thing that knows why a
claim lease must outlive the route's `maxDuration`, and the schema document is the only place a
migration author reads before writing 0012. Absorbed rather than cross-referenced, because a
column that exists in one document and not the other is a column that does not get written.
**Edited:** `DATA_MODEL_V2.md` §9.2, §11.1 and a new §19.4b.

**Two sub-decisions inside it, both load-bearing:**

- **`agent_schedule_runs.schedule_id` loses its foreign key** and keeps `uuid NOT NULL`.
  `ON DELETE CASCADE` erases the run history that `DELETE /schedules/{id}` is supposed to preserve;
  `ON DELETE SET NULL` retains rows that `GET …/runs` — which filters by `schedule_id` — can never
  read again. The label is snapshotted into a new `schedule_name`, and `agent_id`'s FK is what
  still bounds the table. This is a **prerequisite** for the `DELETE` route, not a follow-up: if it
  slips, `DELETE` ships as 405 rather than destructive.
- **The rank helper is `schedule_run_rank(s text)`, created in 0012 beside the table**
  (`DATA_MODEL_V2.md` §11.1), not a `scheduleRunRank()` deferred to W3-8 with the ladder written
  out four times inline. Four copies of a ladder whose `failed = succeeded` tie is the subtle part
  is four places to get it wrong. **Edited:** `REMINDERS_AND_SCHEDULERS.md` §3.8.3.

### C18 · `lib/i18n/activity.ts` — Wave 5 file, Wave 3 need

`HARNESSES_AND_ACTIVITY.md` assigned it to W5-4. `REMINDERS_AND_SCHEDULERS.md` D20 showed that
Wave 3's run-history panel renders `status`, `skip_reason` and `error_code` — all of which live in
that dictionary — and therefore cannot ship after Wave 5.

**Winner: `REMINDERS_AND_SCHEDULERS.md`.** **W3-9 creates the file** with the `schedule.*`
namespace only; **W5-4 extends it** with the run, step, health, metric and tool vocabularies and
gains a dependency on W3-9. **Edited:** `HARNESSES_AND_ACTIVITY.md` §10.1 and amendment A8; §3 and
§5.1 below.

### C19 · The nightly sweep — `POST` vs `GET`, and one endpoint or two names

`HARNESSES_AND_ACTIVITY.md` §7.2 specified `POST /api/cron/sweep`; `DATA_MODEL_V2.md` §14.0
specified `GET`, on the grounds that `GET` is what Vercel Cron issues, and separately noted that an
earlier draft had invented a second name, `/api/cron/nightly`, for the same endpoint.

**Winner: `DATA_MODEL_V2.md`** — with `POST` also exported, matching `/api/cron/schedules`, so a
manual re-run and an external scheduler both work and the bearer check is identical on both verbs.
One endpoint, one name, one `vercel.json` entry. `DATA_MODEL_V2.md` §14 owns the pass list;
`HARNESSES_AND_ACTIVITY.md` §7.2 supplies the retention numbers (90 / 400 / 400). **Edited:**
`HARNESSES_AND_ACTIVITY.md` §7.2 and its file manifest.

### C20 · `vercel.json` has two cron entries, and only one document wrote it

`REMINDERS_AND_SCHEDULERS.md` §3.1 is the section that creates the `crons` array — the file today
holds only `$schema` and `framework` — and it declared one entry. `DATA_MODEL_V2.md` §14.0 and
`HARNESSES_AND_ACTIVITY.md` §7.2 both need a second, for the nightly sweep.

**Winner: two entries, written in the document that creates the array.** A second PR that "adds
crons" to a file that already has them is how one of the two goes missing. **Edited:**
`REMINDERS_AND_SCHEDULERS.md` §3.1, with the note that Hobby's limit is two invocations *a day*,
not two entries — which is why `DATA_MODEL_V2.md` §14 consolidates every retention pass into the
single `sweep` invocation rather than one cron per table.

### C21 · Slot references and line counts across the late documents

Mechanical, and listed once so the count reconciles. `HARNESSES_AND_ACTIVITY.md` carried 21 stale
slot numbers, `REMINDERS_AND_SCHEDULERS.md` 13, `PRP.md` 3 — all consequences of C14, all fixed in
place. `PRP.md` §3.1 also cited `REMINDERS_AND_SCHEDULERS.md` at 1,819 lines; it is 2,890 after
review. **Edited:** all three.

---

## 2. Wave structure

Seven waves, **67 tasks** — 58 originally, plus nine the four late documents surfaced (W0-5b,
W0-5c, W0-6b, W0-13, W3-10, W5-8, W5-9, W5-10, and W0-4b folded into W0-4). Each wave is
independently buildable and independently verifiable: at
every wave boundary `npm run build`, `npx tsc --noEmit` and the test suite pass, and the app runs
with no LLM key and no Agent Manager.

| Wave | Theme | Tasks | Rough size |
|---|---|---|---|
| **0** | Schema, migrations, four harnesses, mock-data cleanup, test-harness repair | 16 | ~4 weeks |
| **1** | Contrast, weight, and the component primitives | 6 | ~1.5 weeks |
| **2** | Skill Repository — catalogue, sync, safety, `/dashboard/skills` | 9 | ~3 weeks |
| **3** | Reminders & Schedulers — cron tick, CRUD, editor (W3-1's spec is **done**) | 10 | ~3 weeks |
| **4** | Agent Template Generator + `/dashboard/templates` | 12 | ~4 weeks |
| **5** | Agent config management + rich Activity | 10 | ~3.5 weeks |
| **6** | Runtime integration, degradation, release hardening | 3 | ~1 week |

Waves 2 and 3 are independent of each other and may run in parallel by two engineers. Wave 4
depends on both. Waves 1 and 5 touch mostly disjoint files from 2/3 and can be interleaved.

### 2.1 Migration slot order — normative, and the one thing that must not be improvised

> **Corrected by conflict C14.** An earlier revision of this section said the journal ended at
> `0006_goofy_dorian_gray` and gave `0007_v2_enum_values.sql` eleven `ALTER TYPE` statements. That
> file is now **on disk and journaled** with two. Every DDL slot below is therefore one higher than
> it was, and the unshipped enum values get their own new file. The per-slot *contents* are
> unchanged. `DATA_MODEL_V2.md` §1.1 and §2.1–§2.3 carry the full argument, the column-level DDL
> and the `dialect.cjs:64` citation; this table is the index.

> **Empirically corrected (verified against this project's Postgres 18 via
> `npm run db:check`).** The direction of this hazard is the opposite of what an
> earlier revision of this section said. Postgres refuses to *use* an enum value
> added in the current transaction — **unless the enum type was itself created in
> that transaction.** On a fresh replay every type is created in the one
> transaction, so the hazard **cannot fire**: CI is always green regardless of how
> the files are arranged. It is the **incremental** path — a deployed database
> where the type was committed long ago, receiving a pending batch that both adds
> a value and names it — that raises
> `unsafe use of new value "…" of enum type …` and rolls the whole batch back.
> **So this breaks production, not CI.** The remedy is unchanged and now matters
> more, not less: an `ALTER TYPE … ADD VALUE` migration must contain nothing
> else, so the value is committed before any later file names it.
> `scripts/check-migrations.ts` replays every deployed state to prove it.

`meta/_journal.json` ends at **`0007_v2_enum_values`** (`idx: 7`, `when: 1788007550400`). Five new
files; **thirteen** on a fresh replay, not twelve.

| Slot | File | Contents | Why it is alone / must be here |
|---|---|---|---|
| **0007** | `0007_v2_enum_values.sql` | **ALREADY SHIPPED. DO NOT EDIT.** `engine` += `codex`, `deepseek`, both with a hand-added `IF NOT EXISTS` | Journaled. drizzle re-reads nothing, so an edit here is a permanent silent no-op on every migrated database while CI's fresh replay goes green (C14) |
| **0008** | `0008_v2_enum_values_2.sql` | **`ALTER TYPE … ADD VALUE IF NOT EXISTS` and nothing else.** `admin_action` += the five skill verbs; `channel_type` += `feishu`, `dingtalk`, `wecom`; `llm_call_kind` += `template_gen`, `schedule_parse`. **Ten statements** | drizzle-kit wraps **all** pending migrations in **one** transaction (`node_modules/drizzle-orm/pg-core/dialect.js`). Postgres forbids *using* a value in the transaction that added it. A pending batch applied to an EXISTING database therefore fails if any later file in it references `'template_gen'` as a literal, while a fresh replay succeeds (the type is created in the same transaction, which makes the new value safe). This is the single most likely way the v2 migration fails, and it fails only in production — `npm run db:check` pass 2 is what catches it |
| **0009** | `0009_v2_core_columns.sql` | Additive columns with no forward FK: `workspaces.timezone`, `agents.idempotency_key` (+ partial unique index), `agents.config_revision`, `agents.applied_config_revision`, `agents.status_occurred_at`, `agent_improvements.kind`, `agent_improvements.proposal`; re-scope `messages_external_uniq` → `(agent_id, external_id)` | Unblocks ATG materialize and the config-resync ETag without pulling in the runtime tables. **This list is closed** — see the rule below |
| **0010** | `0010_v2_skills.sql` | Eight skill enums, `skill_sources`, `skills` (incl. `search_tsv` + `skills_search_idx`), `agent_skills`; + `admin_audit_log.target_ref` | C2's single declaration lives here. `target_ref` is written by skill curation, so it ships with skill curation |
| **0011** | `0011_v2_templates.sql` | Four template enums, `agent_templates`, `template_generations`; + `llm_usage.stage`, `.correlation_id` (+ index) | Depends on `skills` for the `agent_skills` FK path used by materialize. The `llm_usage` columns are written by ATG, which is what this slot creates |
| **0012** | `0012_v2_runtime.sql` | Seven runtime enums; **nine tables** — `agent_context_items`, `agent_schedules`, `agent_runs`, `agent_run_steps`, `agent_schedule_runs`, `agent_health_samples`, `runtime_event_receipts`, `scheduler_ticks` — the `schedule_run_rank(text)` function, the three `run_id` FK columns (`agent_activities.run_id`, `usage_records.run_id`) + `agent_activities.code`/`.params`, the four Activity indexes and the two in-place index widenings, and two `autovacuum_vacuum_scale_factor` settings | The `run_id` columns must land **after** `agent_runs` exists. Statement order *within* the file matters: `agent_schedules` and `agent_runs` before `agent_schedule_runs`, which FKs `agents` and references both |

**The three tables and one function §2.1 did not originally name**, each with the document that
owns it: `runtime_event_receipts` (`BACKEND_INTEGRATION_CONTRACT.md` §3.2 — the only concurrency
guard on event ingest; without it a redelivered `agent.usage` double-bills the customer);
`scheduler_ticks` (`REMINDERS_AND_SCHEDULERS.md` §3.0 delta 12 — C16); `agent_schedule_runs` (in
the original list, restated here because C17 changes its shape); and `schedule_run_rank(text)`
(`DATA_MODEL_V2.md` §11.1 — C17).

**The rule for anything not named above.** The 0009 list is **closed**: a reviewer checking that
file against this table should find an exact match. Everything else ships **in the migration that
creates the tables whose feature writes it** — which is why `admin_audit_log.target_ref` is in
0010 and the `llm_usage` correlation columns are in 0011, not swept into 0009 on the grounds that
it is "the additive-columns file". A column three waves ahead of the code that writes it makes a
`git bisect` on a skills bug reason about a core-columns migration.

**Two hand-edits to generated SQL are required and are not optional.** `drizzle-kit` emits
`ALTER TYPE "public"."locale" ADD VALUE 'ja';` **without** `IF NOT EXISTS` — see the existing
`lib/db/migrations/0003_worthless_ultron.sql` for the precedent, and `0007_v2_enum_values.sql`
where the guard was already added by hand. Add it again in 0008, and verify `0008` contains no
`CREATE`/`ALTER TABLE` statement before committing:

```bash
grep -Ei 'create|alter table|insert' lib/db/migrations/0008_v2_enum_values_2.sql   # must be empty
```

And when `db:generate` folds enum additions and table DDL into one file — it will, if you change
both in one run — split it by hand and fix `meta/_journal.json` so 0008 sorts before 0009.

**One Postgres exemption is relied on; one must never be.** A value belonging to a type
`CREATE TYPE`d **in the same transaction** is usable immediately, and slots 0010–0012 depend on
that in five places (`WHERE visibility = 'public'`, `WHERE status in ('queued','running')`, the
`agent_schedules_shape` CHECK, `agent_schedules_deliver`, and every `.default("…")` on a new enum
column) — there is no way to write those without it, and `DATA_MODEL_V2.md` §1.2 verifies it on
15.13. PostgreSQL 17's further relaxation of `ADD VALUE` is the one that must never be relied on:
Vercel Postgres, Neon and Supabase are not all on the same major, and CI is where you would find
out.

---

## 3. The waves

### Wave 0 — Schema, harnesses, mock-data cleanup

Everything else needs this. Nothing in Waves 1–6 may begin until W0 is merged.

| # | Task | Files | Depends | Acceptance check | Size |
|---|---|---|---|---|---|
| **W0-1** | **Fix `npm test`'s silent test-dropping.** `"tsx --test tests/**/*.test.ts"` is shell-unquoted; adding any subdirectory under `tests/` makes `sh` expand `**` as `*`, dropping all 65 top-level tests **while exiting 0**. The v2 layout requires subdirectories. | `package.json` | — | Add `tests/_probe/x.test.ts`; `npm test` reports 66, not 1 | S |
| **W0-2** | Add `NODE_OPTIONS=--conditions=react-server` to every test script. 19 modules open with `import "server-only"` and are otherwise unimportable under `tsx --test`. Add a `typecheck` script (`tsc --noEmit`); it does not exist. | `package.json` | W0-1 | `npx tsx --test` can import `lib/api.ts`; `npm run typecheck` exists and passes | S |
| **W0-3** | **Fix the cron day-field step bug.** `parseField` sets `restricted` only for literals and `a-b` ranges, so `*/n` leaves `domRestricted=false` and `dayMatches` discards the parsed set. **Verified:** `0 0 */2 * *` fires Jan 2,3,4,5,6,7 — every day — while the identical `0 0 1-31/2 * *` correctly fires 3,5,7,9. `0 9 * * */2` is daily too. Fix is in `dayMatches` only. | `lib/schedule/cron.ts`, `tests/cron.test.ts` | — | `0 0 */2 * *` from 2026-01-01 yields Jan 3,5,7,9,11,13; bare `*`/`*` still matches | S |
| **W0-4** | Extend `engineEnum` to four values and **eliminate every hardcoded two-value union.** 13 sites: `lib/db/schema.ts:39`, `lib/validation.ts:76,130`, `lib/client-api.ts:383,480,487`, `lib/agent-display.ts:23`, `lib/agent-manager/types.ts:11`, `lib/services/agents.ts:168`, `lib/db/seed.ts:66`, `app/dashboard/fleet/page.tsx:14`, `app/dashboard/fleet/[id]/page.tsx:1646,1647,1977`, `app/hire/page.tsx:228-231,339`. **Merged, and the dependency inverted relative to this row:** `lib/harness/index.ts` owns `HARNESS_IDS` and `Harness`, and `lib/db/schema.ts:43` is `pgEnum("engine", HARNESS_IDS)` — schema depends on harness, not the reverse, so a client component can name a harness without pulling Drizzle into the browser bundle (`HARNESSES_AND_ACTIVITY.md` §1.3). **Add the `Equal<Engine, Harness>` compile-time assertion**, or the two names silently diverge. **Absorbs W0-4b:** `lib/channels.ts` gets `CHANNEL_TYPE_IDS` + `ChannelType` and `channelTypeEnum` is rebuilt from it — the same enum with the same problem (conflict C15). | those 13 + `lib/harness/index.ts`, `lib/channels.ts`, `lib/db/schema.ts` | — | `grep -rn '"openclaw" \| "hermes"' lib app components` returns nothing; `tsc --noEmit` clean; `tests/unit/harness-client-safety.test.ts` green | M |
| **W0-5** | **Fix the harness→`category_id` mis-provisioning.** `lib/services/agents.ts:211` is `input.engine === "openclaw" ? 2 : 4` — a two-way branch on a four-value enum. Once W0-4 lands, a user who hires a **Codex** agent silently gets a **Hermes** VM (`category_id 4`, image `hermes-agent-vnc`) with no error. Replace with an exhaustive `Record<Harness, number>` that **throws** on an unmapped harness, and gate provisioning behind an env allowlist. **Merged as `lib/harness/provisioning.ts`** (`categoryIdFor()`, `HarnessNotProvisionableError`). Two corrections it needs, both from `HARNESSES_AND_ACTIVITY.md` §3.4/A11: the env var shipped as `ARK_ENABLED_HARNESSES` while this plan says `ATG_ENABLED_HARNESSES` — **`ATG_` is normative, `ARK_` stays a one-release alias**, because unset fails *open* and a silent rename converts a deliberate allowlist into an open gate; and `enabledHarnesses()` must distinguish **unset** from **set-but-empty** (`raw === undefined`, not `!raw`), or `ATG_ENABLED_HARNESSES=` — the spelling an operator reaches for to turn everything off — returns every provisionable harness. | `lib/harness/provisioning.ts`, `lib/services/agents.ts`, `lib/agent-manager/index.ts`, `.env.example` | W0-4 | A `codex` hire in live mode returns a refusal, never a Hermes VM; unit test asserts the throw **and** that `ATG_ENABLED_HARNESSES=` yields `[]` | S |
| **W0-6** | ~~Migration `0007_v2_enum_values.sql`~~ — **DONE and journaled** (`idx: 7`). It holds the two `engine` values and nothing else. **Do not edit it**: drizzle re-reads nothing, so an edit is a silent no-op on every migrated database (C14). | `lib/db/migrations/0007_*` | W0-4 | *(shipped)* | S |
| **W0-6b** | **NEW (C14).** Migration `0008_v2_enum_values_2.sql` — the ten remaining `ALTER TYPE … ADD VALUE IF NOT EXISTS` statements (§2.1), hand-edited for the guard, containing nothing else. | `lib/db/migrations/0008_*`, `meta/_journal.json` | W0-6 | `grep -Ei 'create\|alter table\|insert' 0008_*.sql` is empty; drop the DB, `npm run db:migrate` from empty succeeds | S |
| **W0-7** | Migration **`0009_v2_core_columns.sql`** (C14 renumbered it) + the matching `lib/db/schema.ts` declarations. Column-level DDL is `DATA_MODEL_V2.md` §3. | `lib/db/schema.ts`, `lib/db/migrations/0009_*` | W0-6b | Fresh migrate succeeds; `tsc --noEmit` clean | S |
| **W0-8** | **Delete `agentsData` and the dead prototype surface.** `lib/data.ts` `agentsData` + `roleIdByName`; `lib/store.tsx:21,134-141,160-161,295-304,324-330,335` (the shadow agent roster — verified unread by all 30 `useApp()` call sites); `lib/types.ts` `Screen`, `ActItem`, `TaskItem`, `PerfItem`, `QueueItem`, `ChatMsg`, prototype `Agent`; `components/DemoPill.tsx` (never imported) and its 4 orphaned i18n keys. **Keep** `rolesData`, `genTexts`, `roleEngine`, `planCatalog` — they are the no-LLM-key fallback and the seed's reference catalogue. | `lib/data.ts`, `lib/store.tsx`, `lib/types.ts`, `components/DemoPill.tsx`, `lib/i18n/common.ts`, `lib/db/seed.ts` | — | `npm run build` clean; `grep -rn agentsData lib app components` returns nothing | M |
| **W0-9** | **Replace `getBillDatasets` — the largest production lie in the repo.** It renders a 14-bar credit chart, "4 agent seats" and an invented estimate to **every paying customer**, not just the demo account. Build `GET /api/billing/usage?range=…` over `usage_records` per `MOCK_DATA_AUDIT.md` §2.1. | `app/api/billing/usage/route.ts` (new), `app/dashboard/billing/page.tsx`, `lib/client-api.ts`, `lib/data.ts` | W0-8 | A brand-new workspace with zero agents sees an empty chart and a zero estimate, not fiction | M |
| **W0-10** | Landing + channels de-fiction: `app/page.tsx` renders `GET /api/roles` instead of `landingRoles`; `heroFeed` moves into `lib/i18n/landing.ts` in four languages; `channelDefs[].connected`/`.note` deleted (a workspace with a null `channels.label` currently reads "USED BY NOVA" on its own screen); channels page iterates API rows keyed by `type`, not by display name. | `app/page.tsx`, `app/dashboard/channels/page.tsx`, `lib/data.ts`, `lib/i18n/landing.ts` | W0-8 | No workspace-specific string in the repo renders to a different workspace | M |
| **W0-11** | **Seed and demo-account hardening.** `ADMIN_PASSWORD` becomes **required** under `NODE_ENV=production` (`process.exit(1)`, not the current console warning at `lib/db/seed.ts:338-352`); the demo workspace moves behind `SEED_DEMO=1` (the script already exists); `app/directions/**` and its two links gate behind `NEXT_PUBLIC_SHOW_DIRECTIONS`; `app/lib/openclaw_manager_api.ts:6-9` throws at module init in production instead of silently defaulting to a specific host. | `lib/db/seed.ts`, `app/lib/openclaw_manager_api.ts`, `app/dashboard/layout.tsx`, `app/page.tsx` | W0-8 | Production seed with no `ADMIN_PASSWORD` exits non-zero | S |
| **W0-12** | **Cut the two false product claims** in `lib/i18n/landing.ts` (4 locales × 2): "14-DAY TRIAL ON EVERY SEAT" — `stripeTrialDays()` returns **0** unless `STRIPE_TRIAL_DAYS` is set — and "UNUSED CREDITS ROLL OVER ONE CYCLE", for which there is **no code anywhere in the repo**. Either implement or remove; do not ship as-is. | `lib/i18n/landing.ts` | — | Every pricing claim traces to code or is gone | S |
| **W0-5b** | **NEW** (`HARNESSES_AND_ACTIVITY.md` §2.3–§2.5). `lib/harness/adapter.ts` + the four adapters, to retire the **three surviving `engine === "openclaw"` identity checks** — `lib/services/agents.ts:301`, `app/api/agents/[id]/route.ts:23`, `app/dashboard/fleet/[id]/page.tsx:919`. They are three *different* capability questions wearing one identity test, which is why adding a harness broke provisioning silently (W0-5). `skillCompat` **delegates** to the existing `deriveHarnessCompat` rather than reimplementing it. | `lib/harness/adapter.ts`, `lib/harness/adapters/**`, those 3 sites | W0-5 | `grep -rn 'engine === "openclaw"' lib app` returns nothing | M |
| **W0-5c** | **NEW.** `lib/harness/profiles.ts` (tri-state `Support`, **not** the six booleans that shipped — a boolean cannot carry `unknown`, which is exactly the state degradation needs); `lib/harness/match.ts`, **client-safe**, with its gates passed in rather than imported (`isHarnessEnabled` and `resolveHarness` are `server-only`); `lib/harness/categories.ts` with a **mode-aware** `isProvisionable()` so mock mode can offer four harnesses; `lib/i18n/harness.ts`; `GET /api/harnesses` (`requireAuth`, per-harness `chat: Support`, **no `category_id` in the payload**); `roleEngine()` at `lib/db/seed.ts:61-63` `support` → `openclaw`, whose current default is Hermes — unverified end to end. Plus the two live registry bugs at `lib/harness/index.ts:96,145`: `openclaw.selfImproving` → `true`, `deepseek.codeNative` → `false` (it renders "specialised for code" for a files-and-network-only harness). | `lib/harness/{profiles,match,categories}.ts`, `lib/i18n/harness.ts`, `app/api/harnesses/route.ts`, `lib/db/seed.ts`, `lib/harness/index.ts` | W0-5b | Auto-match never selects a chat-unverified harness; every reason code has four languages; `HARNESS_PROFILES` is total over `Harness` | M |
| **W0-13** | **NEW.** Documentation index repair: `README_V2.md` still listed three of the four late documents as "commissioned and never written", so its own stated reading order never reached `DATA_MODEL_V2.md` — and an engineer following it builds `lib/db/schema.ts` from the three partitioned owners, which is the exact failure that document was written to end. **Done as part of this pass**; the row stays so the count reconciles. | `docs/README_V2.md` | — | The index has a row for all four; no "never written" section remains | S |

**Wave 0 gate:**
```bash
npm run typecheck && npm run lint && npm test
dropdb arkagent_ci && createdb arkagent_ci && npm run db:migrate   # fresh replay, not incremental
npm run db:seed                     # must NOT create the demo workspace
SEED_DEMO=1 npm run db:seed         # must
npm run build
grep -rn '"openclaw" | "hermes"' lib app components   # must be empty
```

### Wave 1 — Contrast, weight, primitives

| # | Task | Files | Depends | Acceptance check | Size |
|---|---|---|---|---|---|
| **W1-1** | Apply the new hex for every failing token across all six palettes per `UI_DESIGN_V2.md` §A.3, and redefine the ramp contract: `muted` becomes AAA body-secondary, `faint` becomes tertiary-only and **may never carry a sentence** (185 call sites today, mostly 11–12px, and ivory-light sits at **2.28:1**). | `app/globals.css` | — | `UT-CONTRAST` goes red→green; 306 assertions pass | M |
| **W1-2** | Fix the three latent bugs found in the audit: `--c-green-ink` white on bright green (**2.29** ivory-dark, **1.97** midnight-dark); midnight-dark `--c-ink` making the primary CTA **3.16**; and `app/layout.tsx:31-35` requesting Newsreader `style:["italic"]` only — so **every Ivory heading currently renders in Georgia**. | `app/globals.css`, `app/layout.tsx` | W1-1 | All three assertions pass; Ivory headings render in Newsreader | S |
| **W1-3** | Add the `w.*` weight tokens as **CSS variables, not literals** — CJK falls back to static families where 440 snaps to Medium — with `html[lang^="ja"]` step-downs. Requires `documentElement.lang` to track the UI language, which it does not today. Note `html[lang="ja"]` cannot match `ja-JP`; use `^=`. | `lib/theme.ts`, `app/globals.css`, `lib/store.tsx` | W1-1 | Switching to 日本語 changes `documentElement.lang` and the rendered weight | M |
| **W1-4** | Add `--c-border-field` (3:1 non-text) to **`:root` and all six palette blocks** and wire it into `lib/theme.ts`'s `c`. The proposed terminal-dark value `#626F82` fails its own floor at 2.99 on `--c-hover`; use `#647084`. | `app/globals.css`, `lib/theme.ts` | W1-1 | Token clears 3:1 on all four surfaces in all six palettes | S |
| **W1-5** | Fix the existing focus rule before adding screens: drop the `box-shadow: 0 0 0 2px var(--c-bg)` (fills only the ring's inner edge) and `border-radius: inherit` (takes the *parent's* radius, visibly changing shape on focus). Add `.ark-hscroll { padding-block: 4px }` so the ring is not clipped. | `app/globals.css` | W1-1 | Bare outline clears 3:1 on every surface; no shape change on focus | S |
| **W1-6** | Build the new primitives and promote the components currently trapped inside `app/dashboard/fleet/[id]/page.tsx` (3,730 lines) into `components/` — **move, do not rewrite**. | `components/**`, `app/dashboard/fleet/[id]/page.tsx` | W1-1…W1-5 | Fleet detail page still renders identically; no new top-level class names beyond the three named in §H.4/§I.3 | L |

**Wave 1 gate:** `npm test` (contrast suite green), `npm run build`, and a manual pass of the 6-palette × 4-language matrix on one existing screen.

### Wave 2 — Skill Repository

| # | Task | Files | Depends | Acceptance check | Size |
|---|---|---|---|---|---|
| **W2-1** | Migration **`0010_v2_skills.sql`** (C14) + schema declarations, **including `search_tsv` with the C2 expression and `skills_search_idx`**, plus `admin_audit_log.target_ref` (§2.1's rule). Column-level DDL is `DATA_MODEL_V2.md` §4–§6. | `lib/db/schema.ts`, `lib/db/migrations/0010_*` | W0 | Fresh replay succeeds; `\d+ skills` shows an `'english'` generated column | M |
| **W2-2** | `lib/skills/**` — catalog types, the 16-category taxonomy, `mintPublicId()` with its collision handling, and `deriveHarnessCompat` (whose `format` parameter is currently dead and whose unknown-`requires.config` handling marks most real skills 0/4). | `lib/skills/**` | W2-1 | `mintPublicId` round-trips every seed row; unit tests for the six-way ClawHub slug collision | M |
| **W2-3** | The 101-entry seed (43 low / 33 medium / 25 high; **30** ClawHub rows, not 31), with an **equality assertion** that the rubric in §5.3 reproduces each seeded `risk_level` — otherwise the first sync silently rescores `docx`/`pdf`/`pptx`/`xlsx` and flips `riskDrift` on every live attachment. | `lib/db/seed-skills.ts`, `tests/skills-catalog.test.ts` | W2-2 | Seed count and per-band counts asserted; scorer output equals seeded values | M |
| **W2-4** | Safety scoring: hard gates, capability score, trust modifiers, banding. `secrets` is a **+4 signal, not a hard gate** — as a gate it matches the setup docs of nearly every MCP server and force-disables the skill on every agent already using it. | `lib/skills/safety.ts` | W2-2 | The published rubric reproduces all 101 seed bands | M |
| **W2-5** | Sync pipeline with `lib/skills/sync/fetch.ts`: source allowlist, `SEGMENT` validation of upstream-supplied `owner`/`slug`/`repo` **before** interpolation, `redirect: "manual"`, 15 s timeout, 512 KB read cap, post-interpolation host re-check. Release the lock in a `finally`. | `lib/skills/sync/**` | W2-2 | A 302 to `169.254.169.254` is refused; a 20 s run does not hold the 15-minute lease | L |
| **W2-6** | `GET /api/skills`, `GET /api/skills/[slug]`, `POST /api/skills/sync`. Sync authenticates with a `CRON_SECRET` bearer + `timingSafeEqual`, **failing closed when unset** — the `x-vercel-cron` header it previously used is client-settable on a public URL, i.e. an unauthenticated write to the table every customer reads. `includeHigh` uses `z.stringbool()`, not `z.coerce.boolean()` (verified: `z.coerce.boolean().parse("false") === true`, which defeats the filter with the exact query string that means "keep hiding them"). | `app/api/skills/**`, `lib/validation.ts` | W2-4 | `?includeHigh=false` hides high-risk skills; unauthenticated sync is 401 | M |
| **W2-7** | Attach/detach: `POST`/`PATCH`/`DELETE /api/agents/[id]/skills`. `DELETE` sets `enabled=false` + `state='removing'` and **retains the row** — a hard delete 404s its own confirmation webhook. Cross-workspace is **404, not 403** (`docs/API.md:40`). `origin`/`originRef` are server-set only. | `app/api/agents/[id]/skills/**`, `lib/services/skills.ts` | W2-6 | Detach survives the round trip; a foreign `agentId` is 404 | M |
| **W2-8** | `/dashboard/skills` — card + list views, three top-level facets, detail drawer, the four-step server-driven add-to-agent flow (including the **tool-reconciliation step**, which changes the agent's authority and was missing). Risk pills use `c.text` + coloured border + glyph, never coloured text: measured, `c.green` on `c.greenWash` is **3.14/3.54/3.14** in the three light palettes. | `app/dashboard/skills/page.tsx`, `components/**` | W1-6, W2-6 | Four languages × six palettes; no `dangerouslySetInnerHTML` | L |
| **W2-9** | Retire `lib/agent-settings.ts:182-198`'s 14 hardcoded `SKILLS`. `AgentSettings.skills[]` becomes a **server-derived mirror** — note `agentSettingsSchema` currently caps entries at 40 chars and five seeded `publicId`s are 41–48, and `PATCH /api/agents/[id]` accepts `settings` wholesale so the Settings tab would clobber the mirror. | `lib/agent-settings.ts`, `lib/validation.ts`, `app/api/agents/[id]/route.ts` | W2-7 | Saving the Settings tab does not drop attached skills | M |

**Wave 2 gate:** `npm test`, `npm run test:integration`, seed-count assertions, an SSRF probe suite, and `/dashboard/skills` rendered in 4 languages × 6 palettes.

### Wave 3 — Reminders & Schedulers

**W3-1 is DONE.** `docs/REMINDERS_AND_SCHEDULERS.md` (2,892 lines) exists and answers both of its
gating questions — see the two rows below for what it decided. Conflict C9 is closed. Wave 3 is
now implementation only, and it has one new task (**W3-10**) that the document surfaced.

**Read `docs/REMINDERS_AND_SCHEDULERS.md` §3 before writing any of this.** The ordering it fixes —
*claim → advance `next_run_at` and insert the occurrence in one transaction → dispatch* — is not a
detail. Advancing before dispatching makes a duplicate fire **impossible** and a lost fire
possible-but-bounded-and-visible, and that trade is deliberate: a double-fired invoice reminder is
worse than a reported miss.

| # | Task | Files | Depends | Acceptance check | Size |
|---|---|---|---|---|---|
| **W3-1** | ~~Write `docs/REMINDERS_AND_SCHEDULERS.md`~~ — **DONE.** Both gating questions are answered and the answers are binding on W3-3/W3-6/W3-7. (a) **`kind='interval'` is removed from the writable API** — the UI already encodes `*/N` as cron — and any surviving row is reinterpreted **start-anchored**, which restores `scheduled_for` as a pre-computable idempotency key. The enum value stays in the DDL, unreachable, because the C6 CHECK and the contract both keep it and removing it costs an enum migration for no gain. (b) **`once` never stores a cron.** `materializeParsed()` converts `parse.ts`'s carrier cron + `onDate` into an absolute `run_at` via `resolveLocal`, and the tick **disables the row at advance time** — so nothing fires annually, and the runner that disables it is named. | `docs/REMINDERS_AND_SCHEDULERS.md` | W0 | *(shipped)* | M |
| **W3-2** | **Build the control-plane cron to `REMINDERS_AND_SCHEDULERS.md` §3.** Not a specification task any more. `vercel.json` still has no `crons` array, no `/api/cron/**` route, no `CRON_SECRET`. Implement §3.8.1's handler (`GET` **and** `POST`, `Bearer $CRON_SECRET` via `timingSafeEqual`, failing closed when unset — without it the endpoint is a public agent-trigger), §3.2's single-statement claim (`FOR UPDATE SKIP LOCKED` inside a CTE an `UPDATE` consumes, writing a **durable 300 s lease** — deliberately longer than the route's `maxDuration` of 60 — rather than holding a transaction open across the dispatch), §3.4's advance-then-dispatch ordering with the `ClaimLostError` guard that rolls back the occurrence insert when the claim was stolen, §3.5's five gates in the order `jitter → misfire → gate`, §3.9's re-anchor-to-`now` after a truncated outage (bounded at two `nextRunParsed` calls — the naive loop makes ~39,800 of them after a 28-day outage on `*/1`, inside a 60 s function holding 200 claims), and §3.0 delta 12's `scheduler_ticks` write. `vercel.json` gets **two** entries (C20). | `app/api/cron/schedules/route.ts`, `lib/services/schedules.ts`, `vercel.json`, `.env.example` | W3-3 | Unauthenticated tick is 401; two concurrent ticks fire an occurrence once (TC-078); a 28-day outage replay makes ≤2 `nextRunParsed` calls (TC-SCH-F); a jittered occurrence is not classified `skipped/misfire` (TC-SCH-G) | L |
| **W3-3** | Migration **`0012_v2_runtime.sql`**'s schedule half + schema declarations (C14), carrying the C6 constraint fixes **and the eleven C17 deltas**: `agent_schedules` += `claimed_at`, `claim_token`, `expectation` and the `agent_schedules_enabled_next` CHECK, with `agent_schedules_due_idx` widened to `(next_run_at, claimed_at)`; `agent_schedule_runs` += `missed_count`, `missed_truncated`, `trigger`, `attempt`, `next_attempt_at`, `expectation_met`, `source`, `schedule_name`, two indexes and two CHECKs, **and no foreign key on `schedule_id`**; plus `scheduler_ticks`, `runtime_event_receipts` and the `schedule_run_rank(text)` function. Every delta is folded into the `CREATE TABLE` — the `ALTER` forms in §3.0 there are a diff against the contract, not the file; a column added by `ALTER` right after its own `CREATE TABLE` is a shape drizzle-kit will never regenerate. Column-level DDL is `DATA_MODEL_V2.md` §9.2, §11.1, §11.3, §11.4. | `lib/db/schema.ts`, `lib/db/migrations/0012_*` | W0-7 | `kind='cron'` + `interval_seconds=5` is rejected; negative jitter is rejected; `UPDATE … SET enabled=false` without nulling `next_run_at` is rejected (TC-076); deleting a schedule leaves its run history readable | M |
| **W3-4** | Add a `windowedInterval` shape to `describe.ts`. Today `*/15 9-17 * * 1-5` — which `UI_DESIGN_V2.md` §C.3.4's own "every [15] minutes between [09:00] and [18:00]" control composes — renders as *"At minute 0, 15, 30, 45, hour 9-17, on Monday, Tuesday, …"*. The most-used compound control produces the least readable output. | `lib/schedule/describe.ts`, `lib/i18n/schedule.ts` | W0-3 | The four-language sentence for that cron is idiomatic | M |
| **W3-5** | `lib/schedule/**` API alignment. `UI_DESIGN_V2.md` §C.3.4 cites three functions that do not exist as written: `nextRuns(cron, tz, 5)` (real signature takes a mandatory `after`), `fromNaturalLanguage` (it is `parseSchedulePhrase(input, opts)`, and it needs `opts.today` or relative one-offs silently stop parsing), and "live-validated by `lib/schedule/parse`" (validation is in `cron.ts`). | `docs/UI_DESIGN_V2.md`, `lib/schedule/**` | W3-1 | Every cited signature compiles, **and a call site that omits `timeZone` fails a test.** `nextRun(expression, after, timeZone = "UTC")` — the zone has a **default**, so `nextRun(expr, now)` compiles and silently evaluates in UTC: a `0 9 * * *` schedule in `Asia/Shanghai` then fires at 17:00 local with no error anywhere. Same for `nextRuns` and `runsBetween` (`DATA_MODEL_V2.md` §9.2) | S |
| **W3-6** | `app/api/agents/[id]/schedules/**` CRUD. Workspace scoping via `getAgentRow(id, ctx.workspace.id)` → 404; `created_by_id` for audit. **`prompt` is user-authored text injected as a user turn, never a system instruction** — and that boundary must hold for template- and LLM-generated prompts too, which ATG writes straight into the column. | `app/api/agents/[id]/schedules/**`, `lib/services/schedules.ts`, `lib/validation.ts` | W3-3 | Cross-workspace is 404; a schedule with an injection payload in `prompt` cannot escalate | M |
| **W3-7** | Schedule editor UI per §C.3.4, with the NL field, day chips, timezone picker, ADVANCED (exposing `deliver_to` and the `max_runs_per_day` ceiling), and a live PREVIEW. | `components/ScheduleEditor.tsx`, `app/dashboard/fleet/[id]/page.tsx` | W1-6, W3-5 | Preview dates are correct across a DST boundary in all four languages | L |
| **W3-8** | Run history: `agent_schedule_runs` UPSERT with the documented no-regression rank (`started(0) < skipped(1) < failed(2) = succeeded(2)`), and the history view. | `lib/services/schedules.ts`, `app/dashboard/fleet/[id]/page.tsx` | W3-6 | An out-of-order `started` after `succeeded` does not regress the row | M |
| **W3-9** | `lib/i18n/schedule.ts` — new dictionary, **103 keys**, four languages (§7 there), **and it creates `lib/i18n/activity.ts`** with the `schedule.*` namespace only: run statuses, skip reasons, error codes. Conflict C18 — that file was a Wave-5 task, and W3-8's run history renders exactly those three vocabularies, so it cannot ship after Wave 5. W5-4 extends it. | `lib/i18n/schedule.ts`, `lib/i18n/activity.ts`, `lib/i18n/index.ts` | W3-7 | No untranslated string on any schedule surface; the four-locale key-set gate covers both files | M |
| **W3-10** | **NEW.** The two transport gaps `REMINDERS_AND_SCHEDULERS.md` surfaced, both of which promise delivery the repo cannot perform. (a) `deliver_to='email'` and `settings.notifyErrors` both promise mail and **there is no mail client in this repository** — no `nodemailer`, no Resend, no SMTP — while the hard constraint forbids adding one. Gate both behind `MAIL_TRANSPORT_URL` (one HTTP hop, no dependency); unset, `email` is **refused at create** with a named reason and the option renders disabled. (b) `SendMessageInput` (`lib/agent-manager/types.ts:42`) has no `metadata` field, so `{trigger, triggerRef, scheduledFor}` — the half of the idempotency key the runtime must echo on `agent.schedule_run` — has nowhere to travel. | `lib/agent-manager/types.ts`, `lib/services/schedules.ts`, `lib/validation.ts`, `.env.example` | W3-2 | With `MAIL_TRANSPORT_URL` unset, `deliver_to='email'` is a 422 with a translated reason, never a silent non-delivery | S |

**Wave 3 gate:** `npm test` (cron + parse + describe + the new windowed shape), an integration test that a schedule fires exactly once under two concurrent ticks, and a DST-boundary preview check.

### Wave 4 — Agent Template Generator + template gallery

| # | Task | Files | Depends | Acceptance check | Size |
|---|---|---|---|---|---|
| **W4-1** | Migration **`0011_v2_templates.sql`** (C14) + schema, plus `llm_usage.stage` / `.correlation_id` (§2.1's rule). Column-level DDL is `DATA_MODEL_V2.md` §7–§8. | `lib/db/schema.ts`, `lib/db/migrations/0011_*` | W2-1 | Fresh replay succeeds | S |
| **W4-2** | `lib/atg/types.ts` + `schema.ts` — `AgentTemplateDraft` and its Zod v4 mirror, with the `Exact<>` assertion **and** the "no optional properties anywhere in the draft types" rule that makes it a real contract (`{a:string}` and `{a:string;b?:undefined}` are mutually assignable, so the assertion alone does not catch optional-vs-required drift). | `lib/atg/types.ts`, `lib/atg/schema.ts` | W4-1 | Round-trip parse of all 128 eval fixtures | M |
| **W4-3** | `lib/atg/defaults/**` — the deterministic composer's data tables. **This is ~1,500 lines of hand-written copy in four languages and is the single largest under-estimated item in the corpus** (ATG R5). It is also the *majority* path for months, since it runs whenever no LLM key is set. | `lib/atg/defaults/**` | W4-2 | 8 roles × 4 locales × 4 harnesses = 128 combinations parse | XL |
| **W4-4** | `lib/atg/retrieve.ts` + `rank.ts` + `gates.ts` — retrieval on `search_tsv`, the eight-term ranker, the gates. **`status='published'` is gate G0 and must be re-asserted in `gates.ts`**, because §5.5's tag fallback is a second entry point; without it ATG proposes unreviewed freshly-crawled third-party code. Recalibrate `capabilityMatch`'s 0.35 saturation constant against the real seeded catalogue before trusting `MIN_SCORE = 2.20`. | `lib/atg/{retrieve,rank,gates}.ts` | W2-3, W4-2 | No `draft`/`blocked`/`deprecated` skill is ever proposed; ranker reproduces a golden ordering | L |
| **W4-5** | `lib/atg/pipeline.ts` — the ten stages, per-stage fallback, the repair budget. | `lib/atg/pipeline.ts`, `lib/atg/prompts/**` | W4-3, W4-4 | With `ATG_DISABLE_LLM=1` every stage falls back and the draft still validates | L |
| **W4-6** | `lib/atg/lint.ts` — the guardrail linter. **Every remediation moves in the restrictive direction only**; a loosening remediation is a privilege-escalation path. ATG-L013 is `error` (as the only unremediable finding it is what makes `materializable=false` reachable at all). | `lib/atg/lint.ts` | W4-2 | A loosening remediation cannot be expressed; L013 blocks materialization | M |
| **W4-7** | `lib/atg/injection.ts` — the input scan and the output check. Only capability-**seeking** findings arm ATG-L017, and only capability-**granting** elements are strippable: a legitimate brief saying *"never email credentials"* trips the `exfil` pattern, boundaries correctly emits *"NEVER send credentials by email"*, and the naive overlap check then strips the guardrail the user asked for. CJK spans are 8 contiguous characters ("5 tokens" degenerates to 5 characters with no whitespace). | `lib/atg/injection.ts` | W4-2 | The "never email credentials" brief keeps its rule | M |
| **W4-8** | `lib/atg/materialize.ts` — the 11-step transaction. **`ensureChannels()` must be exported and take a `tx`**; it is module-private and captures the module-level `db`, so step 2 would run *outside* the transaction and leave orphan `channels` rows behind a rollback. Provisioning stays outside the transaction, deliberately. | `lib/atg/materialize.ts`, `lib/services/agents.ts` | W4-6, W3-3, W2-7 | A forced failure at step 6 leaves zero rows; a failure at step 12 leaves a recoverable `status='draft'` agent | L |
| **W4-9** | `POST /api/templates/generate` (SSE + polling fallback). `maxDuration` must respect the plan ceiling — 120 exceeds Hobby's 60 s. Cancel puts the row in `canceled` and **does not** keep a draft. Rate-limit pre-check and insert must be two sequenced statements: a data-modifying CTE and the `SELECT` beside it share one snapshot, so the sweep's own rows still count and the workspace wedges on a permanent 409. | `app/api/templates/generate/route.ts` | W4-5 | A client disconnect lands `canceled`; the rate limiter recovers after a sweep | M |
| **W4-10** | The rest of the template API. **`provenance` is recomputed server-side from a fresh `lint()`** on `POST` and `PATCH` — a client-supplied `provenance.materializable: true` is a one-request bypass of every rule in §6.3, money and external-send remediations included. Fork and public-import re-lint. `Idempotency-Key` required on materialize; missing is 400. | `app/api/templates/**` | W4-8 | A crafted `POST` with `materializable:true` does not earn the badge | M |
| **W4-11** | `/dashboard/templates` — card + list views, filters, detail drawer. Third-party template text is **data**: text nodes, no markdown, no `dangerouslySetInnerHTML`. Drop or back the two unbacked cells (LEVEL, skill preview) — do not render an invented number. | `app/dashboard/templates/page.tsx`, `components/**` | W1-6, W4-10 | Four languages × six palettes; a public template from another tenant renders inert | L |
| **W4-12** | The AI-guided creation flow: DESCRIBE → GENERATING → REVIEW & EDIT across the six sections. Action chips are **restrictive-only** — a chip that could enable a tool or raise autonomy is prompt-injection privilege escalation with a button on it. | `app/dashboard/templates/**`, `components/**` | W4-11 | The six sections map to `draft.{roles,agents,skills,boundaries,context,schedules}` | L |

**Wave 4 gate:** `npm test`, `scripts/atg-eval.ts` in deterministic mode green, an injection corpus with zero escapes, and a full generate→review→materialize→provision round trip in mock mode.

### Wave 5 — Agent config + Activity

| # | Task | Files | Depends | Acceptance check | Size |
|---|---|---|---|---|---|
| **W5-1** | Migration **`0012_v2_runtime.sql`**'s run/activity half + schema (C14): `agent_runs`, `agent_run_steps`, `agent_health_samples`, `runtime_event_receipts`, the `run_id` forward FKs, `agent_activities.code`/`.params`, and the four Activity indexes — including the two **in-place edits** to `agent_runs_agent_idx` and `agent_run_steps_agent_idx` for the keyset tiebreak, which must not be added as second `CREATE INDEX` statements beside the originals (`HARNESSES_AND_ACTIVITY.md` A3: same file, `already exists` on a fresh replay). Drop the superseded `agent_activities_agent_idx` **last**, and delete its declaration at `lib/db/schema.ts:448` or the next `drizzle-kit generate` recreates it. | `lib/db/schema.ts`, `lib/db/migrations/0012_*` | W3-3 | Fresh replay succeeds | S |
| **W5-2** | `lib/activity/**` — run/step/health query and aggregation helpers. Sum costs in **micro-USD** and convert once at render; an integer of cents cannot express the `$0.0117` the page draws. | `lib/activity/**` | W5-1 | Aggregates match a hand-computed fixture to the micro-USD | M |
| **W5-3** | `app/api/agents/[id]/activity/**` — the filtered feed, run drill-down, step trace, health, cost. | `app/api/agents/[id]/activity/**` | W5-2 | Cross-workspace 404; filters map to the documented params | M |
| **W5-4** | The Activity tab rebuild: TIMELINE / RUNS / HEALTH / COST. Render activity rows from `code`+`params` (C8). The DISK card shows an absolute figure — there is no `disk_limit_bytes`, and a percentage of an unknown denominator is a fabricated number. A `source='mock'` sample is never charted as real. | `app/dashboard/fleet/[id]/page.tsx`, `components/**` | W1-6, W5-3 | No blank rows for v2 activity events; mock samples visibly distinct | L |
| **W5-5** | The config editor: two-pane, nine sections. `AgentConfigDTO` may carry **no secret**. `lib/agent-settings.ts`'s `TONES`/`LANGUAGES`/`AUTONOMY_LEVELS`/`TOOLS`/`TIMEZONES`/`WEEKDAYS` labels are hardcoded English today and bypass the i18n rule. | `app/dashboard/fleet/[id]/page.tsx`, `lib/agent-settings.ts`, `lib/i18n/fleet-detail.ts` | W1-6 | Every label localised; no secret in the DTO | L |
| **W5-6** | Save and re-sync. `If-Match: <agents.updated_at>` **cannot detect the conflicts it exists for** — `updated_at` does not move when a child row changes, which is most config edits, so two people editing different schedules both pass. Use the `config_revision` weak ETag; the applied revision arrives on `agent.heartbeat`. | `app/api/agents/[id]/route.ts`, `lib/services/agents.ts` | W5-5, W0-7 | Two concurrent edits to different sections conflict correctly | M |
| **W5-7** | Harness switching. Incompatible skills are flagged **`needs_recheck`, not removed** — removal destroys `risk_acknowledged` and `acknowledged_by_id`, so re-attaching later re-asks nothing. | `lib/services/agents.ts`, `app/dashboard/fleet/[id]/page.tsx` | W5-6, W2-7 | A harness switch preserves acknowledgements | M |
| **W5-8** | **NEW.** `GET`/`POST` `/api/cron/sweep` — the **single** nightly job. `Bearer $CRON_SECRET` via `timingSafeEqual`, failing closed when unset; `FOR UPDATE SKIP LOCKED` so two platform ticks cannot double-run; every delete batched (`… WHERE id IN (SELECT id … LIMIT 5000)` in a loop) so no statement holds a long lock on a table the Activity page is reading. Passes, in order: `agent_run_steps` 90 d (driven from `agent_runs.steps_pruned_at`, or the driver re-walks the 310 days between the step window and the run window every night), `agent_runs` 400 d, `agent_activities` 400 d, `agent_schedule_runs` 180 d, `runtime_event_receipts` 30 d, `template_generations` redact-at-7/purge-at-90, `agents.idempotency_key` cleared at 24 h, and the health rollup — **whose cutoff must be truncated to an hour boundary**, or 59 minutes in 60 it deletes in-window samples that appear in no average. `DATA_MODEL_V2.md` §14 owns the pass list; `HARNESSES_AND_ACTIVITY.md` §7.2 supplies the numbers. Vercel Cron issues `GET` (C19). | `app/api/cron/sweep/route.ts`, `lib/activity/retention.ts`, `vercel.json` | W5-1 | A straddling rollup hour is left wholly intact; an unauthenticated sweep is 401; the step prune terminates | M |
| **W5-9** | **NEW.** The **ERRORS** view (`HARNESSES_AND_ACTIVITY.md` §6.6, amendment A5) — a fifth tab, not a filter, because it unions `agent_improvements`, which no timeline filter can reach. It is the view opened during an incident. `UI_DESIGN_V2.md` §F's four-tab strip is amended. | `app/dashboard/fleet/[id]/page.tsx`, `app/api/agents/[id]/activity/incidents/route.ts` | W5-4 | Severity is derived from `code`+`params` server-side and client-side by the **same** function | M |
| **W5-10** | **NEW.** Empty states across all six Activity views — six resolution reasons each, four languages, plus the specimen component (`HARNESSES_AND_ACTIVITY.md` §8). **Its own task deliberately:** folded into W5-4 it is the thing cut when the wave runs long, and with the telemetry pipe empty it is the only part of the Activity page most users see in the first month. The resolution order must return `telemetry_unsupported` only on `supports(...) === "no"`, never on `"unknown"` — which is every telemetry capability on every harness today, so the `!== "yes"` form makes `no_data_yet` unreachable and every empty OpenClaw page reads "{harness} doesn't report this yet". | `components/ActivityEmpty.tsx`, `app/dashboard/fleet/[id]/page.tsx`, `lib/i18n/activity.ts` | W5-4 | All six reasons on all six views; a `runs: "unknown"` harness with no rows yields `no_data_yet` | M |

**Wave 5 gate:** `npm test`, `npm run test:integration`, and an Activity page rendered against a seeded run/step fixture in four languages.

### Wave 6 — Integration, degradation, release

| # | Task | Files | Depends | Acceptance check | Size |
|---|---|---|---|---|---|
| **W6-1** | The batch webhook endpoint with the **v2 timestamp-bound signature** (`"v2." + timestamp + "." + rawBody`), an `x-arkagent-key-id` header for routing (the routing key cannot live in a body you must verify before parsing), `HEX64` shape-checking (`Buffer.from` truncates, so `<valid-64-hex>zz` currently verifies), and a `webhook_events` idempotency ledger. | `app/api/webhooks/agent-manager/batch/route.ts`, `lib/agent-manager/webhook.ts` | W5-3 | Replay outside the window is rejected; a duplicate `eventId` is a no-op | L |
| **W6-2** | **Harden `AGENT_MANAGER_MODE`.** Today unset ⇒ mock, **even in production**. Make it resolve to `unconfigured` (503) in production, matching `lib/payments/config.ts` — which `MOCK_DATA_AUDIT.md` §1.5 rightly calls the reference implementation of a correctly gated mock. Add `scripts/check-runtime.ts` alongside `check-payments.ts`. | `lib/agent-manager/index.ts`, `scripts/check-runtime.ts`, `.env.example` | W6-1 | Production with no config 503s rather than pantomiming a VM | M |
| **W6-3** | Full-product degradation pass: every AI feature with no `OPENROUTER_API_KEY`, every runtime feature with no Manager, in all four languages and all six palettes. | across | all | The whole product is usable with neither configured | M |

**Wave 6 gate:** the full §6 release checklist.

---

## 4. File manifest

### 4.1 Created

**Migrations (5 new; 0007 already shipped)** — ~~`0007_v2_enum_values.sql`~~ (journaled, do not edit) · `0008_v2_enum_values_2.sql` (enum values only, the CI hazard) · `0009_v2_core_columns.sql` · `0010_v2_skills.sql` · `0011_v2_templates.sql` · `0012_v2_runtime.sql`. Conflict **C14** renumbered every DDL slot; §2.1 is the authority and `DATA_MODEL_V2.md` §3–§12 is the column-level DDL

**`lib/atg/**` (12)** — `types.ts` (the draft shape) · `schema.ts` (Zod mirror + `Exact<>`) · `pipeline.ts` (ten stages) · `prompts/*.ts` (seven stage prompts + repair + narration) · `retrieve.ts` · `rank.ts` · `gates.ts` · `lint.ts` · `injection.ts` · `materialize.ts` · `deterministic.ts` · `defaults/**` (the no-key floor, four languages)

**`lib/skills/**` (7)** — `catalog.ts` · `taxonomy.ts` · `safety.ts` · `compat.ts` · `sync/index.ts` · `sync/fetch.ts` (the SSRF boundary) · `publicId.ts`

**`lib/activity/**` (8)** — `codes.ts` (**client-safe**) · `severity.ts` (**client-safe** — the row renderer picks its border colour from the same function the server filters with, and a second copy is a second answer) · `cursor.ts` (keyset codec + Zod + `keysetWhere`) · `timeline.ts` · `runs.ts` · `health.ts` · `cost.ts` · `incidents.ts`

**`lib/harness/**` (5, two already merged)** — `index.ts` **(exists)** · `provisioning.ts` **(exists)** · `profiles.ts` · `adapter.ts` + `adapters/**` · `match.ts` (client-safe) · `categories.ts`

**Client-safe leaf modules (1)** — `lib/channels.ts` (C15)

**`lib/services/**` (3)** — `skills.ts` · `schedules.ts` · `templates.ts`

**Routes (14)** — `app/api/templates/route.ts` · `templates/generate/route.ts` · `templates/[id]/route.ts` · `templates/[id]/fork/route.ts` · `templates/[id]/materialize/route.ts` · `templates/generations/[id]/route.ts` · `app/api/skills/route.ts` · `skills/[slug]/route.ts` · `skills/sync/route.ts` · `app/api/agents/[id]/skills/route.ts` · `agents/[id]/schedules/route.ts` · `agents/[id]/context/route.ts` · `agents/[id]/activity/route.ts` · `app/api/cron/schedules/route.ts` · `app/api/billing/usage/route.ts`

**Pages (2)** — `app/dashboard/templates/page.tsx` · `app/dashboard/skills/page.tsx`

**i18n (7)** — see §5

**Docs (6, all written)** — `docs/TASK_PLAN_V2.md` (this) · `docs/README_V2.md` · `docs/PRP.md` · `docs/DATA_MODEL_V2.md` · `docs/REMINDERS_AND_SCHEDULERS.md` (W3-1, done) · `docs/HARNESSES_AND_ACTIVITY.md`

**Tests/scripts** — `tests/helpers/{db,llm,runtime,server,setup}.ts` · `tests/**` per `TEST_PLAN_V2.md` §C.3 · `scripts/atg-eval.ts` · `scripts/check-runtime.ts`

### 4.2 Modified

| File | Reason |
|---|---|
| `lib/db/schema.ts` | **14 new tables** (the 11, plus `runtime_event_receipts`, `scheduler_ticks` and `agent_schedule_runs`'s revised shape), **19 new enum types**, 10 appended enum values, `engineEnum` and `channelTypeEnum` both rebuilt from client-safe id lists, additive columns, and the `Equal<Engine, Harness>` assertion. Delete the `agent_activities_agent_idx` declaration at `:448`. `DATA_MODEL_V2.md` is the authority |
| `lib/db/seed.ts` | Demo workspace behind `SEED_DEMO`; `ADMIN_PASSWORD` required in production; skill catalogue seed |
| `lib/data.ts` | Delete `agentsData`, `roleIdByName`, `getBillDatasets`, `channelDefs` fictional fields |
| `lib/store.tsx` | Delete the shadow agent roster (verified unread by all 30 call sites); track `documentElement.lang` |
| `lib/types.ts` | Delete the six prototype-only types; keep `Lang` and `Role` |
| `lib/theme.ts` | `w.*` weight tokens, `c.borderField` |
| `app/globals.css` | New hex for all six palettes, `--c-border-field`, `--w-*`, `--r-*`, focus-rule fix |
| `app/layout.tsx` | Newsreader loaded non-italic — every Ivory heading currently renders in Georgia |
| `lib/validation.ts` | 4-value `engine`; schedule/skill/template/context schemas; `z.stringbool()` |
| `lib/serializers.ts` | `TemplateSummaryDTO`, `SkillCardDTO`, activity DTOs; export `SECRET_KEYS` |
| `lib/client-api.ts` | 4-value `engine`; all new endpoints |
| `lib/api.ts` | Lift `escapeLike` out of `app/api/admin/users/route.ts` |
| `lib/agent-manager/{index,types}.ts` | 4-value harness; harden the mode gate |
| `lib/agent-manager/webhook.ts` | v2 signature, `keyId` routing, `HEX64` gate |
| `lib/services/agents.ts` | Exhaustive harness→`category_id` map that throws; export `ensureChannels(tx, …)` |
| `lib/agent-settings.ts` | Retire `SKILLS`; localise the six label catalogues |
| `lib/agent-display.ts` | Four harness labels |
| `lib/schedule/{cron,describe}.ts` | Day-field step bug; `windowedInterval` shape |
| `app/dashboard/fleet/[id]/page.tsx` | Config editor, Activity rebuild, component extraction (3,730 lines) |
| `app/dashboard/fleet/page.tsx` | 4-value harness filter |
| `app/dashboard/layout.tsx` | Nav entries for Templates and Skills; gate Directions |
| `app/dashboard/billing/page.tsx` | Real usage query |
| `app/dashboard/channels/page.tsx` | Iterate API rows keyed by `type` |
| `app/page.tsx` | `GET /api/roles`; `heroFeed` from i18n; gate the Directions link |
| `app/hire/page.tsx` | Four harness choices + two new blurbs × 4 languages |
| `app/api/agents/[id]/route.ts` | `config_revision` ETag; do not clobber the skills mirror |
| `app/lib/openclaw_manager_api.ts` | Throw at module init in production |
| `package.json` | Quote the test glob; `--conditions=react-server`; `typecheck` |
| `vercel.json` | The `crons` array (there is none today) — **two entries**: `/api/cron/schedules` at `* * * * *` and `/api/cron/sweep` at `0 3 * * *` (C20) |
| `.env.example` | `CRON_SECRET`, `ATG_ENABLED_HARNESSES` (**normative name**; the code shipped `ARK_ENABLED_HARNESSES`, which stays a one-release alias because unset fails *open*), `MAIL_TRANSPORT_URL` (W3-10), `ATG_*`, `NEXT_PUBLIC_SHOW_DIRECTIONS` |
| `components/DemoPill.tsx` | **Delete** (never imported) |

---

## 5. i18n work

Every user-visible string goes through a per-screen dictionary with all four languages
(`en`, `zh`, `zht`, `ja`), **written natively, not translated word-for-word**. **Seven** new
dictionaries and eight modified ones.

### 5.1 New dictionaries

| File | Key groups | Notes |
|---|---|---|
| `lib/i18n/templates.ts` | gallery header/controls · card + list labels · 3 empty states · detail-drawer section titles · CTA · **28 lint codes `ATG-L001…L028`** · 10 stage labels · `rulesDict` (used by `renderRules` on **both** server and browser, so this module must stay client-safe) | Largest new dictionary |
| `lib/i18n/atg.ts` | DESCRIBE screen · generating/progress copy · cost meter · cancel/retry · 409/422/429/402 pre-stream screens · review-and-edit chrome | Split from `templates.ts` so the gallery does not ship the generator's copy |
| `lib/i18n/skills.ts` | filters + 3 facets · card/list labels · risk band names · detail drawer · 4-step add-to-agent flow · sync status · empty + failure states | |
| `lib/i18n/schedule.ts` | editor label · When segment · day chips · time + timezone picker · Repeat · ADVANCED · PREVIEW · Cancel/Save · validity messages · run-history statuses · **disabled state** · empty state | Currently missing entirely; §C.3.4 specifies a full editor with none of it |
| `lib/i18n/activity.ts` | `agent.activity` **`code` → sentence** for every code · metric labels · `errorCode` · `skipReason` · `denyReason` · run statuses · step phases + kinds · health states · empty-state reasons · banners — **eleven key spaces** | **The reason C8 exists.** Rendering at ingest freezes one of four languages in forever. **Created by W3-9** with the `schedule.*` namespace, extended by W5-4 (conflict C18). `params` is untrusted third-party text: text nodes only, and `ActivityParams` is `Record<string, string \| number>` — a boolean has no localisation and renders as the English "true" in the 日本語 UI |
| `lib/i18n/harness.ts` | Four harness labels and blurbs · the nine capability names · tri-state `Support` renderings · auto-match reason codes · the `unprovisionable` refusal reason | New in W0-5c. `HARNESSES_AND_ACTIVITY.md` amendment A8: this is the **sixth** dictionary an earlier revision of this table did not list |

### 5.2 Modified dictionaries

| File | Change |
|---|---|
| `lib/i18n/dashboard-layout.ts` | `navTemplates`, `navSkills` — a **type error** today, since `navDefs` keys index this |
| `lib/i18n/hire.ts` | Two new harness blurbs × 4 languages beside the existing `openclawBlurb`/`hermesBlurb`; source `tasksDefault`/`remindDefault` from the template instead of hardcoded sales copy shown to someone hiring a Legal Reviewer |
| `lib/i18n/fleet-detail.ts` | Config-editor sections; Activity tabs; `skillsTitle`/`fieldSkills` go stale in four languages when the chip grid is replaced |
| `lib/i18n/landing.ts` | `heroFeed` moves in (4 locales); **delete the two false claims** (W0-12) |
| `lib/i18n/common.ts` | Drop the 4 `DemoPill`-only nav keys; keep the 5 the dashboard layout uses |
| `lib/i18n/billing.ts` | Real-usage empty and zero states |
| `lib/i18n/channels.ts` | Field labels keyed by `type`, not display name |
| `lib/i18n/index.ts` | Register the **seven** new dictionaries |

### 5.3 The completeness gate

A unit test walks every dictionary and asserts all four locales have **identical key sets** —
deep, including nested groups and function-valued entries. A missing key is a build failure, not
a runtime fallback to English. This is the only mechanism that makes "no screen ships with a
missing translation" true rather than aspirational.

---

## 6. Verification gates

### 6.1 Every wave

```bash
npm run typecheck          # tsc --noEmit — script added in W0-2
npm run lint
npm test                   # unit; must report the expected count, not "0 passing"
npm run test:integration   # CI must FAIL when this reports zero non-skipped tests,
                           # or a dead Postgres container reads as green
npm run build
```

### 6.2 Additionally, per wave

| Wave | Extra |
|---|---|
| 0 | Fresh-database replay (`dropdb && createdb && db:migrate`) — **not** an incremental migrate; the enum hazard only appears on a full replay. **Plus an incremental replay from a database already at 0007**, which is the only thing that catches C14's silent no-op, and an assertion that `meta/_journal.json`'s `when` for `0007_v2_enum_values` is still `1788007550400`. `db:seed` creates no demo workspace; `SEED_DEMO=1` does. `grep -rn '"openclaw" \| "hermes"'` is empty. |
| 1 | `UT-CONTRAST` green across 306 assertions × 6 palettes × 4 surfaces. Manual: one screen in 6 palettes × 4 languages. |
| 2 | Seed-count and rubric-equality assertions. SSRF probe suite (redirect to link-local, oversize body, timeout). `/dashboard/skills` in 4 × 6. |
| 3 | Schedule fires exactly once under two concurrent ticks. DST-boundary preview in 4 languages. Unauthenticated cron tick is 401. |
| 4 | `scripts/atg-eval.ts` deterministic-mode green (128 combinations). Injection corpus, zero escapes. Full generate→materialize→provision in mock mode. |
| 5 | Activity page against a seeded run/step fixture in 4 languages. Concurrent-edit conflict detection. |
| 6 | The §8 release checklist, end to end. |

---

## 7. Risk register — the five most likely to go wrong

### R1 · The migration passes locally and fails in CI · **highest likelihood**

drizzle-kit wraps **all** pending migrations in **one** transaction, and Postgres forbids using an
enum value in the transaction that added it. Developers migrate incrementally and never see it;
CI builds from empty and always does. Compounded by drizzle-kit emitting `ADD VALUE` **without**
`IF NOT EXISTS` (precedent: `0003_worthless_ultron.sql`), so a partially-applied migration cannot
be re-run either.

**And it has a second, worse form, found after this section was written (C14).** `0007` is already
journaled. drizzle decides applied-ness by `folderMillis`, never by file hash, so editing an
applied file is a **permanent silent no-op** on every migrated database *while a fresh CI replay
goes green* — the failure surfaces months later as `invalid input value for enum channel_type` on
a production ingest, with nothing in the migration log to explain it. This is the reason the ten
remaining enum values are in a new `0008` and every DDL slot moved.

**Mitigation:** `0008` contains `ALTER TYPE … ADD VALUE IF NOT EXISTS` and nothing else, guards
added by hand; a CI job that drops and recreates the database on **every** run, not nightly; a
lint step that fails the build if `0008` contains any `CREATE` or `ALTER TABLE`; **and a CI step
that also migrates a database pinned at 0007**, because a fresh replay is exactly the path that
cannot see an edit-to-an-applied-file bug.

### R2 · `lib/atg/defaults/**` is under-estimated by a factor of two or more

~1,500 lines of hand-written product copy in four languages, and it is the **majority path for
months** — it runs whenever no LLM key is configured, which is the guaranteed-working
configuration the hard constraints demand. It is also the least interesting work in the project,
so it will be deferred, and when it is deferred the no-key product is visibly worse than the
keyed one, which is exactly the outcome the constraint exists to prevent.

**Mitigation:** W4-3 is scheduled **before** the pipeline that consumes it, not after. Ship 3
roles × 4 locales complete rather than 8 roles × 1 locale. `scripts/atg-eval.ts` runs in
deterministic mode in CI on every commit, so a regression in the floor is a red build. Budget a
dedicated writer for the copy.

### R3 · Activity ships over synthetic data

Everything in `§F` — runs, steps, health, cost — depends on inbound telemetry that **does not
exist**: `RUNTIME_INTEGRATION.md` §3.2 marks runs/steps **PROPOSED**, §3.7 notes webhook
registration is absent and blocks all of §2 and half of §3, and nothing today tells the Manager
what `agents.id` is, so no inbound event can route at all. The temptation is to seed plausible
rows so the page demos well.

**Mitigation:** `agent_health_samples.source` and `agent_skills.install_source` carry
`'runtime' | 'mock'`, and the UI must render mock data **visibly distinctly** — never charted as
real. Ship the Activity page with honest empty states before it has data. TC-119's "a brand-new
workspace sees no invented data" is a P0 and gates the release.

### R4 · The contrast uplift is a large, visible, un-reviewed change

`--c-muted` and `--c-faint` move across all six palettes and 185+ call sites. It is mechanical,
it touches every screen, and its test asserts ratios rather than appearance — so it can be fully
green and still look wrong. The CJK weight fix additionally depends on `documentElement.lang`
tracking the UI language, which it does not today; drop that one line and the fix silently does
nothing for Japanese.

**Mitigation:** W1 lands as its own reviewable PR, before any new screen is built on top of it.
Screenshot review across 6 palettes × 4 languages is a named acceptance step, not an afterthought.
An explicit assertion that `documentElement.lang` changes with the language switcher.

### R5 · ~~Two features are specified nowhere~~ · **CLOSED, and replaced**

Both features now have owning documents: `REMINDERS_AND_SCHEDULERS.md` for the schedule execution
path (C9, W3-1) and `HARNESSES_AND_ACTIVITY.md` Part 2 for the telemetry path. The three concrete
questions this row named are all answered: `kind='interval'` is off the writable API and
reinterpreted start-anchored; `once` never stores a cron and the tick disables the row at advance
time; Vercel's cron granularity is measured by `scheduler_ticks` and surfaced as a
`tick_too_coarse` banner rather than hidden.

**What replaces it is worse, and it is not a specification problem.** `HARNESSES_AND_ACTIVITY.md`
§11.2 CONFIRM-9 asks whether the Agent Manager can reach `app.arkagent.com` **at all**. Every
Manager address on record is `http://10.21.27.155:18090` — RFC1918, plain HTTP — while every table
the Activity page reads is filled by events the runtime POSTs to us. **If the answer is no, all of
Part 2 is unreachable in every mode but mock**, and the realistic v2.0 outcome is a
beautifully-specified page showing §8's empty states for months.

**Mitigation, and it is the one part of Part 2 that depends on nobody else:** persist the
`responseId` and `usage` that the chat SSE stream **already** receives and currently discards.
That makes COST and the `chat` half of TIMELINE real with no upstream change at all. Build it
first, not last. Everything else stays behind honest empty states — and the temptation to seed
plausible rows so the page demos well is R3, on a bigger canvas.

---

## 8. Definition of done

### 8.1 Release checklist

**Data and truth**
- [ ] A brand-new workspace sees **no** invented data anywhere — no bar chart, no seat estimate, no "USED BY NOVA", no fabricated uptime.
- [ ] Every number on every screen traces to a row in Postgres or is absent.
- [ ] Mock-sourced data (`source='mock'`, `install_source='mock'`, `agent_schedule_runs.source='mock'`) is visibly distinct and never charted as real.
- [ ] Every Activity view's empty state resolves to `no_data_yet` — **not** `telemetry_unsupported` — when a capability is `unknown`, which is every telemetry capability on every harness today.
- [ ] No aggregate is rendered without `.mapWith(Number)`: the driver is `drizzle-orm/postgres-js` + `postgres@3`, which returns `int8` and `numeric` as **strings**, so an unmapped `sum()` concatenates.
- [ ] No pricing or product claim without code behind it (W0-12).
- [ ] The demo workspace exists only under `SEED_DEMO=1`; production seed with no `ADMIN_PASSWORD` exits non-zero.

**Schema and backend readability**
- [ ] Fresh-database replay of all **13** migrations succeeds from empty, **and** an incremental migrate from a database pinned at `0007` reaches the same schema (C14: the two paths diverge, and only the second sees an edit to an applied file).
- [ ] `0008_v2_enum_values_2.sql` contains `ALTER TYPE … ADD VALUE IF NOT EXISTS` and nothing else — `grep -Ei 'create|alter table|insert'` is empty — and `0007_v2_enum_values.sql` is byte-identical to what is journaled.
- [ ] Every closed-vocabulary `varchar` named in `DATA_MODEL_V2.md` §9.2 carries its CHECK; `deliver_to`, `scope`, `last_status`, `install_source`, the two `status` columns, `skip_reason`, `state` and `source` are constrained, not merely commented.
- [ ] Every piece of agent setup — roles, agents, skills, rules, context, schedules — is readable from Postgres alone, with no browser-only state.
- [ ] All four harnesses are creatable and updatable; an unmappable harness **refuses to provision** rather than silently producing a Hermes VM.
- [ ] Auto-match never selects a harness whose chat path is unverified; `ATG_ENABLED_HARNESSES=` (set but empty) yields **no** harnesses, not all of them.
- [ ] `HARNESS_PROFILES` and the shipped `HARNESSES` registry agree, asserted by a test — they disagreed on two capabilities, one of which renders "specialised for code" for a files-and-network-only harness.

**Degradation** *(the two hard constraints)*
- [ ] With **no** `OPENROUTER_API_KEY`: template generation, brief generation and every AI affordance fall back deterministically and produce a usable result.
- [ ] With **no** Agent Manager: every screen renders, every config persists, and production 503s rather than pantomiming a VM.
- [ ] Zero outbound network requests in mock mode, enforced structurally by the test-harness `fetch` guard.

**Security**
- [ ] Every `/api/agents/[id]/**` route resolves through `getAgentRow(id, ctx.workspace.id)` and returns **404**, not 403.
- [ ] `/api/cron/schedules`, `/api/cron/sweep` and `/api/skills/sync` fail closed without their secret, on **every** verb they export.
- [ ] `vercel.json` declares both cron entries; a deploy with an empty `crons` array does not pass (TC-154b).
- [ ] A schedule fires **exactly once** under two concurrent ticks, and a **lost** fire is visible as `failed / dispatch_lost` and auto-retried — never silently absent.
- [ ] No route reads a runtime table without joining through `agents` to the caller's workspace. Run detail and schedule history are the two that were filtered on `runId`/`scheduleId` alone, i.e. any signed-in user could read any tenant's step trace, including `agent_run_steps.detail`.
- [ ] Every filter query param is Zod-parsed before it reaches an `inArray` against a pgEnum. Postgres answers a bad enum literal with `22P02` **carrying the enum's full value list** — a 500 that leaks schema.
- [ ] SSRF: no user- or model-supplied URL is fetched from the control plane without allowlist, post-DNS check, per-redirect-hop check, timeout and size cap.
- [ ] Prompt injection: third-party text (templates, skills, tool results, schedule prompts) is rendered as **data** and never reaches a system prompt; action chips are restrictive-only.
- [ ] No secret in any DTO; `agent_skills.config` rejects secret-shaped keys.
- [ ] Webhook v2 signature with replay window and `eventId` idempotency.

**Presentation and i18n**
- [ ] All 306 contrast assertions pass across six palettes; `--c-faint` never carries a sentence.
- [ ] The four-locale key-set equality test passes for every dictionary, **including `lib/i18n/activity.ts` and `lib/i18n/harness.ts`**.
- [ ] `<html lang>` is emitted **server-side** and tracks the UI language. `lib/store.tsx:215-218` already sets it on the client; `app/layout.tsx:62` emits no `lang` at all, so the CJK weight step-down flashes on hydration while a client-side test stays green.
- [ ] `deliver_to='email'` and `settings.notifyErrors` either have a transport or are refused with a translated reason. Neither may silently not send.
- [ ] Every new screen manually verified in 4 languages × 6 palettes, at all four breakpoints.
- [ ] No horizontal body scroll; wide content scrolls inside its own container.

**Backwards compatibility**
- [ ] Existing agents, seeds and API consumers keep working; no enum value renamed or removed.
- [ ] `agents.instructions` / `agents.rules` still render from the structured draft via `renderRules`, and the two never diverge.

### 8.2 Still needs the product owner

These are decisions, not engineering tasks. Each blocks a named task. Items 1–7 are the original
seven; **8–11 were surfaced by the four late documents** and each carries a default so that an
unanswered question does not block a wave.

1. **Context file storage and extraction.** No parser and no blob-storage client exists, and the hard constraint forbids adding runtime dependencies. `.pdf`/`.docx` extraction has no home. **Blocks W4-8's context path and TC-051…TC-062.** Options: direct-to-storage upload with the runtime extracting; text-only context at launch; or an exception to the dependency constraint.
2. **Does the runtime index context, or just drop files on disk?** (`BACKEND_INTEGRATION_CONTRACT.md` CONFIRM-3.) The UI says "searchable knowledge base" in one place and "files on the agent's disk" in another. One is a lie. **Blocks the CONTEXT section's user-facing copy.**
3. **Network reachability, both directions.** Every Manager address on record is `http://10.21.27.155:18090` — RFC1918, plain HTTP — while the whole read *and* write contract assumes outbound HTTPS to `app.arkagent.com`. If there is no egress, §2 and §3 of the contract are both unreachable. **Blocks Wave 6 entirely.**
4. **Licence policy vs. redistribution.** 30 seeded ClawHub rows have `license_verified = false`. If ArkAgent serves bundle bytes for them, we are redistributing unlicensed code. **Blocks W2-5.** Either the runtime fetches from origin for `registry`/`git` modes, or the seed shrinks to OSI-licensed rows only.
5. **`category_id` for Codex and DeepSeek.** The Manager has none, so those two harnesses can be generated and stored but **not provisioned**. **Gates W0-5's allowlist.** Confirm that "generate but refuse to provision" is the intended launch behaviour.
6. **Vercel plan and cron granularity.** Hobby caps function duration at 60 s and allows two daily cron jobs; the design needs per-minute ticks and **two** cron entries. **Blocks W3-2, W4-9 and W5-8.** `REMINDERS_AND_SCHEDULERS.md` §8.2 recommends **Pro** and sets `maxDuration = 60` so the route works on either. It also ships either way: a coarse tick degrades into the misfire path and is reported by `scheduler_ticks` as a `tick_too_coarse` banner rather than hidden — but a product that sells "every 15 minutes" on a plan that ticks twice a day is selling something it does not have. This is also why `DATA_MODEL_V2.md` §14 consolidates **every** retention pass into one nightly invocation.
7. **The fate of the `demo` / `demo123` account** for a public production release.
8. **Moderation and takedown for `visibility = 'public'` templates.** New, from `DATA_MODEL_V2.md` §19.6 item 7. `agent_templates` has no `status`/`blocked` column and no admin verb, while `skills` has both plus five `admin_action` values. A public gallery puts one tenant's `name`, `description` and `draft.schedules[].prompt` on another tenant's screen with no moderation surface anywhere. The fork-first and never-a-system-instruction rules are specified; takedown is not. If it ships to real customers, it is a fifth enum plus two columns in a **later** slot — nothing today writes them, so this is a decision, not a schedule risk.
9. **Who owns the skill publish queue.** New, from `PRP.md`. Requirement 7's "grab skills from the web" is designed end to end — sync, rubric, banding — and gated on a human publishing each row. Nobody is currently staffed on that queue, and without it the catalogue is 101 seeded entries and nothing else, forever. Default if unanswered: launch with the seed and no live sync, and say so on the page.
10. **Observability and alerting.** New, from `PRP.md`. There is no error tracker, no uptime check and no alert on a failed cron in this repository. `scheduler_ticks` makes a coarse tick *diagnosable*; nothing makes it *noticed*. Default if unanswered: the `tick_too_coarse` banner and a weekly manual check of `/dashboard/admin`.
11. **Is `deliver_to='email'` in scope at all for v2.0?** New, from `REMINDERS_AND_SCHEDULERS.md` R8. There is no mail client in the repository and the hard constraint forbids adding one; W3-10's `MAIL_TRANSPORT_URL` HTTP hop is the workaround, and it needs somebody to stand up the endpoint. If the answer is "not at launch", `deliver_to` ships with three values and the UI says so.
