# ArkAgent v2 — Consolidated Data Model

**Status: normative for schema.** This document is the single source of truth for the v2 Postgres
schema. Where it disagrees with `SKILL_REPOSITORY.md` §1, `AGENT_TEMPLATE_GENERATOR.md` §7 or
`BACKEND_INTEGRATION_CONTRACT.md` §2–§3 on a *column, type, default, constraint, index or
migration slot*, this document wins and the disagreement is recorded in §19. Those three documents
remain normative for everything else they own — the sync pipeline, the ten-stage generator, the
wire events, the safety rubric. `TASK_PLAN_V2.md` remains normative for wave order; its §2.1 slot
assignment is **amended** here (§2.2) because a file it predates has since landed on disk.

**`HARNESSES_AND_ACTIVITY.md` is the fourth owning document and it outranks this one on its own
surface.** It was written after the three above and it owns `lib/harness/**` (hence `Harness` and
`HARNESS_IDS`), the closed activity-code vocabulary, and **every Activity view's query, index,
filter set, keyset cursor, DTO and retention window**. Where this document touches
`agent_activities`, `agent_runs`, `agent_run_steps` or `agent_health_samples` *reads or retention*,
it now reproduces that document rather than competing with it; the reconciliation is §19.4a. This
document still owns those tables' **columns, types and constraints**.

**`docs/README_V2.md` now indexes this document** and names it as the thing to read before any
migration or any `lib/db/schema.ts` declaration. It previously listed this file under "three
documents that were commissioned and never written", which meant its stated reading order never
reached here; that was task **W0-13** and it is done.

**Why it exists.** `TASK_PLAN_V2.md` §1 records that splitting one schema across three
ownership-partitioned documents directly produced conflicts **C1** (`agent_skills.state` vs
`.status` — build-breaking), **C2** (`skills.search_tsv` declared twice with two different
expressions, both `IF NOT EXISTS`-guarded, so the second was a silent no-op) and **C5** (two
designs both claiming migration slot `0008`). Those three conflicts have one cause: no file
contained the whole schema, so no reviewer could see a contradiction. This file is that file.

**Audience.** The engineer writing `lib/db/schema.ts` and `lib/db/migrations/0008…0012`, and the
reviewer checking their work. Every Drizzle block below is meant to be pasted into
`lib/db/schema.ts` with no edits beyond import hoisting.

**House style, non-negotiable, from `lib/db/schema.ts` (821 lines) as it stands.** Every new table
matches it or it does not land. **Line numbers below were re-anchored against the working tree on
2026-08-29; re-grep by symbol name, never by line, exactly as `MOCK_DATA_AUDIT.md` §0 now instructs
— the previous set was 1–5 lines stale throughout because Wave 0 landed under it.**

| Rule | Where it is already established |
|---|---|
| `uuid("id").defaultRandom().primaryKey()` for entity tables | `users`, `agents`, `channels`, … |
| `bigint("id",{mode:"number"}).primaryKey().generatedAlwaysAsIdentity()` for append-only high-volume logs | `usage_records:705`, `llm_usage:734`, `admin_audit_log:771` |
| `timestamp(name, { withTimezone: true })` — **always**, never a bare `timestamp` | every timestamp in the file |
| indexes as the **third table argument**, an array: `(t) => [index(...), uniqueIndex(...)]` | `users:182`, `agents:383-387`, `payment_orders:675-678` |
| `jsonb(...).$type<T>().notNull().default({})` — typed, not-null, defaulted, never a bare `jsonb` | `agents.settings:368`, `channels.config:497`, `plans.features:336` |
| index names are `{table}_{what}_{idx\|uniq}`, spelled out as string literals | throughout |
| a `//` or `/** */` comment on every column whose purpose is not self-evident | throughout — this is the file's strongest convention and the reason it is readable |
| inferred types exported at the bottom, `X` and `NewX` | `:789-821` |

Two columns below deliberately break the `jsonb` rule and say so where they are declared:
`skills.install` is `.notNull()` with **no** default (§5), and `agent_improvements.proposal` is
nullable (§3.3). Nothing else may.

---

## Table of contents

| § | Contents |
|---|---|
| **1** | Consolidated enum inventory — new `pgEnum`s and `ALTER TYPE … ADD VALUE`, and the transaction hazard |
| **2** | Migration slot map, and the three amendments to `TASK_PLAN_V2.md` §2.1 |
| **3** | Slot 0009 — column additions to existing tables |
| **4–6** | Slot 0010 — `skill_sources`, `skills`, `agent_skills` |
| **7–8** | Slot 0011 — `agent_templates`, `template_generations` |
| **9–12** | Slot 0012 — the six runtime tables, the ingest ledger, the forward-FK columns and the Activity indexes |
| **13** | Every JSONB payload as a TypeScript interface |
| **14** | Retention and pruning, with the DELETE statements and the index each uses |
| **15** | Idempotency and dedupe keys for every backend-written table |
| **16** | The 18 read queries the new UI needs, as Drizzle, each naming its index |
| **17** | Degradation — what each table holds with no LLM key and no Agent Manager |
| **18** | Migration checklist — fresh replay vs incremental, irreversibility, backfill |
| **19** | Corrections register — every defect found in the owning docs and what was done |
| **App.** | Inferred type exports for `lib/db/schema.ts` |

---

## 1. The consolidated enum inventory

Nineteen new enum types, and twelve values appended to four existing ones. Nothing is renamed and
nothing is removed — `BACKEND_INTEGRATION_CONTRACT.md` §6.1 makes that a contract term with the
runtime team, and `agent_status`, `engine` and `channel_type` are already persisted on live rows.

#
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

## 1.1 Values appended to existing types — two files, and 0007 is already spent

**`lib/db/migrations/0007_v2_enum_values.sql` EXISTS AND IS ALREADY JOURNALED.** Task **W0-6 is
done**. The file on disk contains exactly two statements — `engine += 'codex'`, `engine +=
'deepseek'` — and `meta/_journal.json` carries it as `idx: 7`, `tag: "0007_v2_enum_values"`,
`when: 1788007550400`. Any earlier draft of this document that says the journal "ends at
`0006_goofy_dorian_gray`" was written against a tree that no longer exists.

**Editing 0007 to add the other ten values is a silent no-op on every database that has already
run it, and CI will not catch it.** `drizzle-orm`'s migrator decides what is pending by comparing
`created_at` in `drizzle.__drizzle_migrations` against the journal's `folderMillis` —
`node_modules/drizzle-orm/pg-core/dialect.cjs:64`, `if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)`.
It never re-reads or re-hashes an applied file. A fresh replay (`dropdb && createdb`) would apply
the amended 0007 and go green; production, dev and every branch database that already ran the
two-statement version would never see `feishu`, `dingtalk`, `wecom`, the five `skill_*` admin
verbs, `template_gen`, or `schedule_parse` — and would fail at **runtime** with
`invalid input value for enum channel_type: "feishu"` on the first Feishu ingest and
`invalid input value for enum llm_call_kind: "template_gen"` on the first ATG model call.

**Therefore the remaining ten values get their own new file, `0008_v2_enum_values_2.sql`, and
every DDL slot shifts up by one.** Recorded as amendment **A3** (§2.2, §19.1).

```sql
-- lib/db/migrations/0007_v2_enum_values.sql  — ALREADY ON DISK AND JOURNALED. DO NOT EDIT.
ALTER TYPE "public"."engine" ADD VALUE IF NOT EXISTS 'codex';--> statement-breakpoint
ALTER TYPE "public"."engine" ADD VALUE IF NOT EXISTS 'deepseek';
```

```sql
-- lib/db/migrations/0008_v2_enum_values_2.sql  — NEW.
-- ALTER TYPE ... ADD VALUE statements ONLY. No CREATE TABLE, no ALTER TABLE, no INSERT.
-- Verify that before committing:  grep -Ei 'create|alter table|insert' 0008_v2_enum_values_2.sql
ALTER TYPE "public"."admin_action" ADD VALUE IF NOT EXISTS 'skill_publish';--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE IF NOT EXISTS 'skill_block';--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE IF NOT EXISTS 'skill_unblock';--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE IF NOT EXISTS 'skill_rescore';--> statement-breakpoint
ALTER TYPE "public"."admin_action" ADD VALUE IF NOT EXISTS 'skill_sync';--> statement-breakpoint
ALTER TYPE "public"."channel_type" ADD VALUE IF NOT EXISTS 'feishu';--> statement-breakpoint
ALTER TYPE "public"."channel_type" ADD VALUE IF NOT EXISTS 'dingtalk';--> statement-breakpoint
ALTER TYPE "public"."channel_type" ADD VALUE IF NOT EXISTS 'wecom';--> statement-breakpoint
ALTER TYPE "public"."llm_call_kind" ADD VALUE IF NOT EXISTS 'template_gen';--> statement-breakpoint
ALTER TYPE "public"."llm_call_kind" ADD VALUE IF NOT EXISTS 'schedule_parse';
```

*Rejected alternative 1:* append the nine to 0007 and bump its `when` in `meta/_journal.json` so the
migrator re-runs it. It would work — every statement is `IF NOT EXISTS`, so a re-run is a no-op —
and it is still wrong: a journal `when` is an applied-migration's identity, `0007_snapshot.json`
would have to be regenerated by hand, and the next `db:generate` fights the edit.
*Rejected alternative 2:* put the ten values **last**, as `0013`, leaving §2.1's numbering
untouched. Provably safe today (no DDL file uses any of the nine as a literal) and structurally
fragile forever: the invariant "enum values are added before anything that could use them" stops
being enforced by file order and becomes a code-review promise.

**`llm_call_kind += 'template_gen'` is an addition to `TASK_PLAN_V2.md` §2.1's enum list, and it is
load-bearing.** That list names `engine`, `admin_action` and `channel_type` only. But
`AGENT_TEMPLATE_GENERATOR.md` §0.2 requires the value, and `lib/atg/**` writes `llm_usage` rows with
`kind = 'template_gen'` from the first generation onward. Without it every ATG model call fails its
insert at runtime with `invalid input value for enum llm_call_kind`. Recorded as **A1** (§19.1).

The matching TypeScript, in `lib/db/schema.ts` — **append only, never reorder**, because these are
unions the seed writes literals into:

```ts
// ALREADY SHIPPED, DO NOT REWRITE. lib/db/schema.ts:43 is:
//   export const engineEnum = pgEnum("engine", HARNESS_IDS);
// with `import { HARNESS_IDS } from "../harness"` at :33. The dependency points
// SCHEMA -> lib/harness DELIBERATELY (see that file's header and
// docs/HARNESSES_AND_ACTIVITY.md, which owns the module): `HARNESS_IDS` and `Harness` must be
// importable by a client component without dragging Drizzle and `postgres` into the browser
// bundle. Do NOT re-declare the four values as a literal array here, and do NOT define
// `Harness` here — it is `lib/harness/index.ts`'s export, and W0-4/W0-5 are already merged
// (`lib/harness/provisioning.ts` exists, with `categoryIdFor()` and
// `HarnessNotProvisionableError`; the env gate is `ARK_ENABLED_HARNESSES`, not
// `ATG_ENABLED_HARNESSES` as README_V2 and TASK_PLAN W0-5 still say).
//
// `export type Engine = (typeof engineEnum.enumValues)[number]` ALSO already exists, at
// lib/db/schema.ts:818. It stays where it is as a deprecated alias; see §5.2 B2.

export const channelTypeEnum = pgEnum("channel_type", [
  "telegram", "whatsapp", "wechat", "line", "slack", "email", "web",
  // v2. These three already arrive from upstream and previously 500'd on ingest because the
  // value was cast straight into the enum without validation (BACKEND_INTEGRATION_CONTRACT §2.1).
  "feishu", "dingtalk", "wecom",
]);

export const adminActionEnum = pgEnum("admin_action", [
  "role_changed", "status_changed", "sessions_revoked",
  "password_reset", "user_deleted", "identity_unlinked",
  // v2 — the skill curation verbs (SKILL_REPOSITORY §1.5, §5.7).
  "skill_publish", "skill_block", "skill_unblock", "skill_rescore", "skill_sync",
]);

export const llmCallKindEnum = pgEnum("llm_call_kind", [
  "chat", "brief", "self_review",
  "template_gen",   // v2 — every ATG stage call (AGENT_TEMPLATE_GENERATOR §0.2, §2.1)
  "schedule_parse", // v2 — the NL→cron model branch (REMINDERS_AND_SCHEDULERS §4.2, delta D19)
]);
```

### 1.2 The transaction hazard, stated exactly

This is the single most likely way the v2 migration set fails, it fails **only in CI**, and it is
worth being precise about because two of the three owning documents state the rule slightly wrong.

1. `drizzle-kit migrate` collects every *pending* migration and executes them **inside one
   transaction** (`node_modules/drizzle-orm/pg-core/dialect.js`). It is not one transaction per
   file. On a database that is already at `0007`, a run that applies `0008`…`0012` runs all five in
   a single `BEGIN … COMMIT`.
2. PostgreSQL permits `ALTER TYPE … ADD VALUE` inside a transaction block (since 12), but the new
   label **may not be used** — as a literal in a `DEFAULT`, a `CHECK`, a `WHERE`, an `INSERT`, or a
   cast — until that transaction commits. The error is
   `ERROR: unsafe use of new value "codex" of enum type engine`.
3. **One exemption is relied on and is safe; one must never be relied on.**
   - *Relied on:* a value belonging to a type that was itself `CREATE TYPE`d **in the same
     transaction** is usable immediately. Postgres only tracks values added by
     `ALTER TYPE … ADD VALUE` to a pre-existing type as unsafe. Slots 0010–0012 depend on this in
     five places — `WHERE visibility = 'public'`, `WHERE status in ('queued','running')`, the
     `agent_schedules_shape` CHECK, `agent_schedules_deliver`, and every `.default("…")` on a new
     enum column — and there is no way to write those without it. **Verified on PostgreSQL 15.13:**
     `CREATE TYPE skill_status AS ENUM (…); CREATE TABLE …; CREATE INDEX … WHERE status =
     'published';` inside one `BEGIN … COMMIT` succeeds.
   - *Never relied on:* PostgreSQL 17's further relaxation of `ADD VALUE`. Vercel Postgres, Neon
     and Supabase are not all on the same major, and CI is where you would find out.
4. Declaring a **column** of a widened type is not a use. `agent_skills.harness engine NOT NULL`
   is safe in 0010. What is unsafe is `DEFAULT 'codex'`, `CHECK (harness <> 'deepseek')`, a seed
   `INSERT … VALUES ('template_gen')`, or `WHERE engine = 'codex'` in a backfill. **Verified on
   15.13:** `BEGIN; ALTER TYPE engine ADD VALUE IF NOT EXISTS 'codex'; CREATE TABLE e1 (h engine
   NOT NULL DEFAULT 'codex');` → `ERROR: unsafe use of new value "codex" of enum type engine`,
   while the same file with `CREATE TABLE e2 (h engine NOT NULL)` commits.

**Therefore 0007 and 0008 contain nothing but `ALTER TYPE`.** Not "mostly nothing" — nothing. The
incremental production path (apply the enum file alone, then the rest) would survive a mixed file;
the fresh-replay path CI runs (`dropdb && createdb && npm run db:migrate`, all thirteen files, one
transaction) would not, and that asymmetry is exactly how a broken migration reaches production
green.

**Two hand-edits to generated SQL are required and are not optional.** `drizzle-kit` emits
`ALTER TYPE "public"."locale" ADD VALUE 'ja';` **without** `IF NOT EXISTS` — see
`lib/db/migrations/0003_worthless_ultron.sql`, which is exactly that one line, and
`0007_v2_enum_values.sql`, where the guard was already added by hand. Add it again in 0008 so a
partially-applied migration is re-runnable. And when `db:generate` folds enum additions and table
DDL into one file (it will, if you change both in one run), split it by hand and fix
`meta/_journal.json` so 0008 sorts before 0009.

### 1.3 New enum types

`CREATE TYPE` is not `ALTER TYPE … ADD VALUE`, so these carry no transaction hazard and ship in the
same file as the tables that use them.

**Slot 0010 — eight skill enums** (`SKILL_REPOSITORY.md` §1.1, reproduced verbatim):

```ts
/** The 16-category taxonomy from docs/research/SKILL_ECOSYSTEM.md §B. Ordered as it renders. */
export const skillCategoryEnum = pgEnum("skill_category", [
  "search-research", "browser-automation", "coding-dev-tools", "version-control",
  "devops-cloud", "data-databases", "documents-files", "communication",
  "productivity", "crm-sales-marketing", "media", "knowledge-memory",
  "agent-meta", "security-secrets", "finance-payments", "design-creative",
]);

/**
 * How a skill is delivered. `agent_skill` is a SKILL.md folder every harness reads;
 * `mcp_server` is a process/URL registered in the harness's MCP client config;
 * `skill_pack` is a repo of many folders that materializes as several directories.
 */
export const skillFormatEnum = pgEnum("skill_format", ["agent_skill", "mcp_server", "skill_pack"]);

/** Higher is riskier. The rubric that produces it is SKILL_REPOSITORY §5.3 and nowhere else. */
export const skillRiskEnum = pgEnum("skill_risk", ["low", "medium", "high"]);

/**
 * `draft` = discovered but unreviewed, invisible outside the admin console.
 * `blocked` = failed a hard gate; never rendered, and existing attachments are quarantined.
 */
export const skillStatusEnum = pgEnum("skill_status", ["draft", "published", "deprecated", "blocked"]);

export const skillSourceKindEnum = pgEnum("skill_source_kind", [
  "registry", "git_repo", "curated_list", "manual",
]);

/**
 * Feeds the −3 "publisher is the service's own vendor" modifier and decides whether a source may
 * ever auto-publish. Only `official_vendor` may, and only for OSI-resolved licences.
 */
export const skillSourceTrustEnum = pgEnum("skill_source_trust", [
  "official_vendor", "verified_registry", "community", "unreviewed",
]);

/**
 * Lifecycle of ONE skill on ONE agent, driven by the runtime.
 * `agent_skill_state`, NOT `agent_skill_status` — TASK_PLAN_V2 §1 conflict C1. The wire event is
 * `agent.skill_state` and its payload field is `state`, so one vocabulary runs end to end and
 * there is no mapping layer for a mapping to be wrong in.
 */
export const agentSkillStateEnum = pgEnum("agent_skill_state", [
  "pending", "installing", "installed", "failed", "removing", "removed",
]);

/** Where the attachment came from, so a template rollout can be audited or reverted wholesale. */
export const agentSkillOriginEnum = pgEnum("agent_skill_origin", [
  "manual", "template", "atg", "role_default", "migration",
]);
```

**Slot 0011 — four template enums** (`AGENT_TEMPLATE_GENERATOR.md` §7.1, §7.2, transcribed from
raw SQL into the repo's `pgEnum` idiom):

```ts
export const templateVisibilityEnum = pgEnum("template_visibility", ["private", "workspace", "public"]);
export const templateOriginEnum = pgEnum("template_origin", ["generated", "manual", "seeded", "forked"]);

/**
 * `expired` = 7 days unapproved; the draft is retained and the brief redacted to ''.
 * `materialized` is terminal and does NOT prevent re-materializing the template it produced —
 * that is what agent_templates.use_count counts (§7.3 rollback notes there).
 */
export const templateGenerationStatusEnum = pgEnum("template_generation_status", [
  "queued", "running", "ready", "needs_review", "failed", "canceled", "expired", "materialized",
]);

/** `llm` = every stage modelled · `hybrid` = ≥1 stage fell back · `deterministic` = no LLM key. */
export const templateGenerationModeEnum = pgEnum("template_generation_mode", [
  "llm", "hybrid", "deterministic",
]);
```

**Slot 0012 — seven runtime enums** (`BACKEND_INTEGRATION_CONTRACT.md` §2.1):

```ts
export const contextItemKindEnum = pgEnum("context_item_kind", ["file", "text", "url"]);

/**
 * `awaiting_upload` means NO BYTES EXIST — it is written only by the template generator for a
 * `file_request` row (TASK_PLAN_V2 §1 conflict C3). `pending` means the bytes are here and
 * indexing has not started. Collapsing the two tells the runtime to fetch a null content_url on
 * every generated template, and erases the state the UI draws its [ Upload ] action from.
 * The runtime never writes `awaiting_upload` and must skip such rows silently.
 */
export const contextItemStateEnum = pgEnum("context_item_state", [
  "awaiting_upload", "pending", "indexing", "indexed", "failed", "removed",
]);

export const scheduleKindEnum = pgEnum("schedule_kind", ["cron", "interval", "once"]);
export const scheduleOverlapEnum = pgEnum("schedule_overlap", ["skip", "queue", "parallel"]);
export const runTriggerEnum = pgEnum("run_trigger", ["chat", "schedule", "channel", "api", "self", "system"]);
export const runStatusEnum = pgEnum("run_status", [
  "queued", "running", "succeeded", "failed", "cancelled", "timeout",
]);
export const runStepPhaseEnum = pgEnum("run_step_phase", [
  "thinking", "tool_call", "tool_result", "message", "final_answer",
]);
```

`run_status` is spelled `cancelled` (two l's) and `template_generation_status` is spelled
`canceled` (one l). That is not a typo to fix: both spellings are already published to the runtime
team and to the ATG API respectively, and renaming an enum value is the one thing §6.1 of the
contract forbids. They are different types; they never meet.

---

## 2. Migration slot map

### 2.1 The five remaining files, and the one-slot shift

`meta/_journal.json` ends at **`0007_v2_enum_values`** (`idx: 7`, `when: 1788007550400`) — W0-6 is
already merged, and 0007 holds only the two `engine` values (§1.1). Five new files; **thirteen**
total on a fresh replay, not twelve.

**Every DDL slot in `TASK_PLAN_V2.md` §2.1 shifts up by exactly one.** Its per-slot *contents* are
unchanged and remain normative; only the numbers move, because §2.1 was written when 0007 was still
unwritten and the two `engine` values were expected to share a file with the other ten.

| §2.1 said | Now | File | Creates | Alters |
|---|---|---|---|---|
| *(part of 0007)* | **0008** | `0008_v2_enum_values_2.sql` | — | 10 `ALTER TYPE … ADD VALUE IF NOT EXISTS` (§1.1). **Nothing else.** |
| 0008 | **0009** | `0009_v2_core_columns.sql` | — | `workspaces.timezone`; `agents.idempotency_key` (+ partial unique), `.config_revision`, `.applied_config_revision`, `.status_occurred_at`; `agent_improvements.kind`, `.proposal`; re-scope `messages_external_uniq` → `(agent_id, external_id)` |
| 0009 | **0010** | `0010_v2_skills.sql` | 8 enums, `skill_sources`, `skills`, `agent_skills` | `admin_audit_log.target_ref` |
| 0010 | **0011** | `0011_v2_templates.sql` | 4 enums, `agent_templates`, `template_generations` | `llm_usage.stage`, `.correlation_id` (+ index) |
| 0011 | **0012** | `0012_v2_runtime.sql` | 7 enums, `agent_context_items`, `agent_schedules`, `agent_runs`, `agent_run_steps`, `agent_schedule_runs`, `agent_health_samples`, `runtime_event_receipts`, `scheduler_ticks`, and the `schedule_run_rank(text)` function | `agent_activities.code`, `.params`, `.run_id`; `usage_records.run_id`; the four Activity indexes and the `agent_runs_agent_idx` widening from `HARNESSES_AND_ACTIVITY.md` §5.4 (§12.1 below); two `autovacuum_vacuum_scale_factor` settings |

Task ids move with them: **W0-7** now writes `0009`, **W2-1** writes `0010`, **W4-1** writes `0011`,
**W3-3/W5-x** write `0012`. A new **W0-6b** writes `0008`.

**Ordering constraints, and they are the only ones:**

- 0007 and 0008 before everything, for §1.2.
- 0010 before 0011, because `template_generations` and the materializer reason about `skills`; and
  because `agent_skills.origin_ref` points (logically) at `agent_templates`.
- 0012 last, because `agent_activities.run_id` and `usage_records.run_id` are forward FKs to
  `agent_runs`, which does not exist until 0012.
- `agent_schedule_runs` FKs `agent_schedules` **and** `agent_runs`; all three are in 0012, so the
  statement order *within* 0012 matters: schedules and runs before schedule_runs.

### 2.2 Three amendments to `TASK_PLAN_V2.md` §2.1

§2.1's per-slot contents are normative and are implemented as written, with three amendments that
the list omits and that nothing else in the corpus has a home for.

**A1 — `llm_call_kind += 'template_gen'` joins the enum files.** Argued in §1.1. Recorded in §19.1.

**A2 — `runtime_event_receipts` and `scheduler_ticks` join the runtime slot.** §2.1's runtime row
names six tables; there are nine. `scheduler_ticks` is `REMINDERS_AND_SCHEDULERS.md` §3.0 delta 12
(§11.4 below) — the tick ledger, which is the only evidence that the platform cron ran at the
granularity the product sells. The
ingest ledger is a seventh, defined in `BACKEND_INTEGRATION_CONTRACT.md` §3.2, and it is not
optional garnish: it is the *only* concurrency guard on event ingest, it must be inserted in the
same transaction as every event's effects, and without it a redelivered `agent.usage` double-bills
the customer. It has no forward FK beyond `agents`, so it could technically live in the
core-columns slot, but it belongs with the tables whose writes it guards. Recorded in §19.1.

**A3 — the one-slot shift.** Forced by 0007 already being on disk and journaled; §1.1 has the
argument and the `dialect.cjs:64` citation. Recorded in §19.1.

### 2.3 The rule for anything not named in §2.1

§2.1's per-slot enumeration is **closed**: the core-columns list is not extended, because that list
is the one thing the wave plan pins and a reviewer checking 0009 against it should find an exact
match. Everything else — `admin_audit_log.target_ref`, `llm_usage.stage`/`.correlation_id`, the
Activity indexes — ships **in the migration that creates the tables whose feature writes it**. So
`target_ref` (written by skill curation) is in 0010, the `llm_usage` correlation columns (written by
ATG) are in 0011, which is also where `AGENT_TEMPLATE_GENERATOR.md` §0.2's "File B" already put
them, and the Activity indexes are in 0012 beside `agent_activities.code`/`.params`, which is where
`HARNESSES_AND_ACTIVITY.md` §5.4 already put them.

*Rejected alternative:* sweep every additive column into the core-columns file on the grounds that
it is "the additive-columns file". It reads tidier and it is worse — it puts a column in a migration
three waves earlier than the code that writes it, so a `git bisect` on a skills bug has to reason
about a core-columns migration.

---

## 3. Slot 0009 — column additions to existing tables

Five tables gain columns here. Every one is additive with a default or a nullable type, so the
migration is safe to run against a populated database with no lock beyond the brief `ACCESS
EXCLUSIVE` a `SET DEFAULT`-less `ADD COLUMN` takes (PostgreSQL ≥11 does not rewrite the table).

### 3.1 `workspaces.timezone`

```ts
// lib/db/schema.ts — inside pgTable("workspaces", { … })
  /**
   * The one authoritative IANA zone per workspace. `agent_schedules.timezone`, the ATG schedule
   * stage, the cron tick and describeCron() all mean *this* when they say "the workspace
   * timezone" — before this column, every one of those references pointed at a field that did not
   * exist (AGENT_TEMPLATE_GENERATOR §0.2).
   *
   * The default is 'Asia/Singapore' and NOT 'UTC', deliberately, because it must equal
   * DEFAULT_SETTINGS.timezone (lib/agent-settings.ts:85) exactly: any other value silently changes
   * the effective zone of every agent that has not overridden it. That is the opposite decision
   * from agent_schedules.timezone (default 'UTC', TASK_PLAN_V2 §1 conflict C6) and both are right
   * — this column continues an existing behaviour, that one is new and its default only fires on a
   * direct SQL insert. If the product wants to stop defaulting new workspaces to a regional zone,
   * that is a change to DEFAULT_SETTINGS and to this column together, in one migration, not here.
   */
  timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Singapore"),
```

```sql
ALTER TABLE "workspaces" ADD COLUMN "timezone" varchar(64) NOT NULL DEFAULT 'Asia/Singapore';
```

No index. It is read once per request on a row already fetched by primary key.

### 3.2 `agents` — four columns

```ts
// lib/db/schema.ts — inside pgTable("agents", { … }), after uptimeStartedAt
  /**
   * Client-supplied Idempotency-Key of the request that created this agent — today only
   * POST /api/templates/{id}/materialize (AGENT_TEMPLATE_GENERATOR §7.3). A replayed key finds the
   * existing agent and returns 200 without opening the transaction; without it a double-click
   * during a slow Manager call bills two seats. Cleared by the nightly sweep after 24h so the
   * column never becomes a permanent join key (§14.7).
   */
  idempotencyKey: varchar("idempotency_key", { length: 80 }),

  /**
   * `manifest.revision` (BACKEND_INTEGRATION_CONTRACT §2.10) and the ETag the runtime polls
   * against. Incremented in the SAME transaction as any write to this agent's brief, settings,
   * tasks, skills, context items, schedules or channel links — CHILD-TABLE writes included, which
   * is precisely why `updated_at` cannot serve: it does not move when agent_skills does.
   */
  configRevision: integer("config_revision").notNull().default(1),

  /**
   * The revision the runtime reports having applied, from agent.heartbeat.configRevision.
   * `applied_config_revision < config_revision` is what renders "not yet applied to runtime"
   * (UI_DESIGN_V2 §5.2 step 7). Nullable: a runtime that never reports one is honestly unknown,
   * not "revision 0".
   */
  appliedConfigRevision: integer("applied_config_revision"),

  /**
   * `occurredAt` of the agent.status event that produced the current `status`. The last-writer-wins
   * rule of BACKEND_INTEGRATION_CONTRACT §3.2 compares against this and is otherwise
   * unimplementable — `updated_at` moves on every unrelated write, so an out-of-order status event
   * would look fresh. Backfilled to `updated_at` for existing rows (§18.4), NOT left null, because
   * a null compares as "no stored value" and lets a stale replay rewrite a live agent's status.
   */
  statusOccurredAt: timestamp("status_occurred_at", { withTimezone: true }),
```

and one index, appended to the existing array at `lib/db/schema.ts:383-387`:

```ts
  // Partial: the column is null on every agent not created through materialize, and a full unique
  // index would put all of them in one btree and forbid the second null-free duplicate anyway.
  uniqueIndex("agents_idempotency_uniq")
    .on(t.workspaceId, t.idempotencyKey)
    .where(sql`idempotency_key is not null`),
```

```sql
ALTER TABLE "agents" ADD COLUMN "idempotency_key" varchar(80);--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "config_revision" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "applied_config_revision" integer;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "status_occurred_at" timestamptz;--> statement-breakpoint
UPDATE "agents" SET "status_occurred_at" = "updated_at" WHERE "status_occurred_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_idempotency_uniq" ON "agents" ("workspace_id","idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
```

*Why `config_revision` is an `integer` and not a `timestamptz` or a hash:* the runtime echoes it
back in a heartbeat and the UI compares two of them for ordering. A monotonic counter compares with
`<`; a hash does not, and a timestamp invites two writers in the same millisecond.

### 3.3 `agent_improvements` — two columns

```ts
  /**
   * From agent.improvement (BACKEND_INTEGRATION_CONTRACT §3.4). Without it the event's `kind` is
   * silently discarded and the self-review queue cannot route anything. varchar, not an enum: the
   * runtime team extends this vocabulary independently and an unknown value must render, not 500.
   */
  kind: varchar("kind", { length: 16 }).notNull().default("other"),
  /**
   * The machine-applicable proposal, when the improvement is one the user can accept with a click
   * (a settings patch, a rule addition). Nullable — most improvements are prose. Shape: §13.9.
   */
  proposal: jsonb("proposal").$type<ImprovementProposal>(),
```

```sql
ALTER TABLE "agent_improvements" ADD COLUMN "kind" varchar(16) NOT NULL DEFAULT 'other';--> statement-breakpoint
ALTER TABLE "agent_improvements" ADD COLUMN "proposal" jsonb;
```

`proposal` is the one new `jsonb` in the schema that is **not** `.notNull().default({})`. The house
rule exists so a reader never has to distinguish "absent" from "empty"; here that distinction is the
whole point — `{}` would be a proposal that patches nothing, and the UI renders an [ Apply ] button
for it. Nullable is the honest type.

### 3.4 `messages_external_uniq` → `(agent_id, external_id)`

The existing index (`lib/db/schema.ts:556`) is `uniqueIndex("messages_external_uniq").on(t.externalId)`
— unique **globally**. Combined with the ingest handler's `ON CONFLICT DO NOTHING`, two tenants
whose runtimes both mint an `externalId` of `1`, or the same Slack `ts`, **silently lose the second
message**: no error, no retry, no trace. This is a live data-loss bug today, not a v2 concern.

```ts
// replaces messages_external_uniq
uniqueIndex("messages_agent_external_uniq").on(t.agentId, t.externalId),
```

```sql
DROP INDEX "messages_external_uniq";--> statement-breakpoint
CREATE UNIQUE INDEX "messages_agent_external_uniq" ON "messages" ("agent_id","external_id");
```

`external_id` is nullable and Postgres treats NULLs as distinct in a unique index, so every
web-originated message (which has none) is unaffected. **This is the one statement in 0009 that can
fail on production data** — if two rows in one agent already share an `external_id`, the `CREATE
UNIQUE INDEX` errors. §18.3 has the pre-flight query.

---

## 4. Slot 0010 — `skill_sources`

**Purpose.** The fetch allowlist. Nothing is ever retrieved from a host that is not a row here;
`skills.source_id` is a foreign key into it, not a free string. Eight seeded rows, and a ninth is a
deliberate operator act.

**Owner:** `SKILL_REPOSITORY.md` §1.2, reproduced faithfully.

**Expected volume:** 8 rows at seed, single digits forever. It is reference data like `agent_roles`
and `plans`, and it is seeded **unconditionally**, not behind `SEED_DEMO` — `MOCK_DATA_AUDIT.md` §4
classes reference catalogues separately from demo fixtures.

```ts
export const skillSources = pgTable(
  "skill_sources",
  {
    // A stable human-readable id, like agent_roles/plans: it appears in every seed literal, in
    // skills.public_id, and in log lines. A uuid here would make the seed unreadable and
    // unmergeable across environments.
    id: varchar("id", { length: 40 }).primaryKey(),
    kind: skillSourceKindEnum("kind").notNull(),
    trust: skillSourceTrustEnum("trust").notNull().default("community"),
    name: varchar("name", { length: 120 }).notNull(),
    homepageUrl: text("homepage_url").notNull(),
    /** Null for kinds we do not crawl (`manual`) or lists with no API (`curated_list`). */
    apiBaseUrl: text("api_base_url"),
    /**
     * URL template for the mandatory link-back, e.g. "https://clawhub.ai/{owner}/skills/{slug}".
     * ClawHub permits third-party directory reuse only if we cache, honour 429 and link back
     * without implying endorsement — a licence condition, not decoration, and the drawer renders
     * it (SKILL_REPOSITORY §7.4).
     */
    attributionTemplate: text("attribution_template"),
    enabled: boolean("enabled").notNull().default(true),
    /** Only ever true for `official_vendor`. Everything else lands in `draft`. */
    autoPublish: boolean("auto_publish").notNull().default(false),
    /**
     * Our self-imposed ceiling, per source, always well under the documented one so a bug on our
     * side cannot get the platform IP-banned. ClawHub documents 3,000/min/IP; we seed 600. The MCP
     * registry publishes no figure, so it and everything else keep the 60 default.
     */
    rateLimitPerMin: integer("rate_limit_per_min").notNull().default(60),
    /** Opaque continuation token from the last successful page (ClawHub cursor, MCP nextCursor). */
    syncCursor: text("sync_cursor"),
    /**
     * Cooperative lock, claimed with
     *   UPDATE skill_sources SET sync_lock_until = now() + interval '15 min'
     *   WHERE id = $1 AND (sync_lock_until IS NULL OR sync_lock_until < now()) RETURNING id
     * so a cron and a hand-triggered admin run cannot double-crawl. Serverless has no
     * process-local mutex. It is a LEASE, not a flag: the run's `finally` clears it on success AND
     * on failure, or a 20-second sync locks the admin route out for 15 minutes and every retry 409s.
     */
    syncLockUntil: timestamp("sync_lock_until", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncStatus: varchar("last_sync_status", { length: 24 }).notNull().default("never"),
    /** Normalized class ("rate_limited", "http_5xx", "schema_drift") — never a raw upstream body. */
    lastSyncError: varchar("last_sync_error", { length: 200 }),
    /** { fetched, created, updated, skipped, blocked, durationMs } from the last run. §13.2. */
    lastSyncStats: jsonb("last_sync_stats").$type<SyncStats>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("skill_sources_enabled_idx").on(t.enabled, t.kind)],
);
```

**Index justification.** One index, one query: the sync scheduler's
`SELECT * FROM skill_sources WHERE enabled AND kind = $1`. At eight rows the planner will
sequential-scan it anyway; the index is there so the *intent* is declared and so it stays correct
if an operator adds forty GitHub sources.

**Foreign keys.** None outbound. `skills.source_id` references it with the Drizzle default
(`NO ACTION`), deliberately: a source row must not be deletable while skills point at it, and
`restrict` semantics here are exactly right — you disable a source, you do not delete it.

---

## 5. Slot 0010 — `skills`

**Purpose.** The catalogue. One row per (source, owner, slug) upstream artefact, carrying its
classification, its harness compatibility assertion, its install descriptor, its risk score with
the signals that produced it, and its curation state.

**Owner:** `SKILL_REPOSITORY.md` §1.3, with `search_tsv` per conflict **C2** — one declaration,
here, with ATG's `'english'` + `setweight` expression.

**Expected volume.** 101 at seed. After the ClawHub and MCP-registry syncs, 3k–8k; the design's
stated ceiling for the `ILIKE` browse path is ~50k. Rows are never hard-deleted, so the table only
grows; §14.1 explains why that is correct and what happens instead.

Drizzle has no native `tsvector`, so declare a `customType` beside the table rather than dropping
the whole column to raw SQL — that keeps `db:generate` able to diff it:

```ts
import { customType } from "drizzle-orm/pg-core";

const customTsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
});
```

```ts
export const skills = pgTable(
  "skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // ---- Identity ----
    sourceId: varchar("source_id", { length: 40 })
      .notNull()
      .references(() => skillSources.id),
    /**
     * `@steipete`, `anthropics`, `googleapis`. Empty string — NOT null — for sources with no owner
     * namespace: Postgres treats NULLs as distinct in a unique index, so a nullable column would
     * silently permit duplicate (source, slug) rows.
     */
    ownerHandle: varchar("owner_handle", { length: 80 }).notNull().default(""),
    slug: varchar("slug", { length: 120 }).notNull(),
    /**
     * The URL key we mint (mintPublicId, SKILL_REPOSITORY §3). Stable forever once assigned.
     * /api/skills/[slug] resolves this first and falls back to a unique match on `slug`, mirroring
     * ClawHub's own AMBIGUOUS_SKILL_SLUG behaviour so a bare slug in a template still works when
     * it is unambiguous.
     *
     * 160 is a GUARANTEED bound, not a hope: naive concatenation reaches 40+1+80+1+120 = 242 and
     * would throw `value too long` on the first long ClawHub slug. The mint truncates and suffixes
     * a hash, so the length is an invariant of the function rather than a wager on upstream naming.
     */
    publicId: varchar("public_id", { length: 160 }).notNull(),

    // ---- Presentation (UNTRUSTED — sanitized on ingest, SKILL_REPOSITORY §5.5) ----
    name: varchar("name", { length: 120 }).notNull(),
    summary: varchar("summary", { length: 300 }).notNull().default(""),
    description: text("description").notNull().default(""),
    publisherName: varchar("publisher_name", { length: 120 }).notNull().default(""),
    /**
     * True only when the publisher handle is the vendor of the service the skill integrates.
     * `mukul975/Anthropic-Cybersecurity-Skills` is the exact name-vs-authority incoherence
     * ClawHavoc exploited, so the UI shows the raw handle whenever this is false.
     */
    publisherVerified: boolean("publisher_verified").notNull().default(false),

    // ---- Classification ----
    category: skillCategoryEnum("category").notNull(),
    format: skillFormatEnum("format").notNull().default("agent_skill"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),

    // ---- Harness compatibility (an assertion — SKILL_REPOSITORY §2.3) ----
    harnessCompat: jsonb("harness_compat").$type<HarnessCompatMap>().notNull().default({}),
    /**
     * Denormalized list of engine values where harnessCompat[e].supported === true. Written by the
     * same function that writes harnessCompat; exists purely so the browser's harness facet is a
     * `@>` containment lookup against a GIN index instead of a jsonb scan.
     */
    harnesses: jsonb("harnesses").$type<Harness[]>().notNull().default([]),
    /** OpenClaw's `metadata.openclaw.requires` shape, verbatim. §13.4. */
    requirements: jsonb("requirements").$type<SkillRequirements>().notNull().default({}),
    /** Normalized authority the skill asks for, diffable against AgentSettings.tools. §13.5. */
    permissions: jsonb("permissions").$type<SkillPermissions>().notNull().default({}),

    // ---- Install ----
    /** Discriminated on `mode`. §13.6. No default: a skill with no install path is not a skill. */
    install: jsonb("install").$type<SkillInstall>().notNull(),
    /**
     * Legal gate on `install.mode = "inline"` ONLY. A registry/git install is the runtime fetching
     * from the origin under the origin's own terms; shipping bytes ourselves is redistribution and
     * needs a licence that permits it.
     */
    redistributable: boolean("redistributable").notNull().default(false),
    license: varchar("license", { length: 60 }).notNull().default("UNKNOWN"),
    /**
     * False until a human read the SKILL.md frontmatter. All **30** seeded ClawHub rows ship false
     * — no ClawHub listing endpoint returns a licence (SKILL_ECOSYSTEM §F.1). Thirty, not
     * thirty-one: `mcporter` is deliberately excluded (TASK_PLAN_V2 §1 conflict C10).
     */
    licenseVerified: boolean("license_verified").notNull().default(false),

    // ---- Risk (SKILL_REPOSITORY §5) ----
    riskLevel: skillRiskEnum("risk_level").notNull().default("medium"),
    /** Raw rubric total, ≈ −8…+20. Persisted so a band change is explainable and diffable. */
    riskScore: integer("risk_score").notNull().default(0),
    /** The individual triggers, rendered in the drawer as prose. §13.7. */
    riskSignals: jsonb("risk_signals").$type<RiskSignal[]>().notNull().default([]),
    riskScoredAt: timestamp("risk_scored_at", { withTimezone: true }),
    /** Raw ClawHub /verify envelope, or null for GitHub/MCP rows with no scanner. NEVER serialized. */
    scannerVerdict: jsonb("scanner_verdict").$type<Record<string, unknown>>(),
    /** `server-resolved-github-import` | `unavailable` | `git` | `first-party`. */
    provenance: varchar("provenance", { length: 60 }).notNull().default("unavailable"),
    artifactSha256: varchar("artifact_sha256", { length: 64 }),
    /**
     * The manifest's `blocked` field. Denormalized from `status = 'blocked'` on purpose: the
     * runtime is told it may never join our catalogue, so the projection needs a boolean it can
     * read. INVARIANT: `blocked = (status = 'blocked')`, maintained by writing both in ONE
     * statement. Not a CHECK constraint — a two-statement update inside one transaction would
     * violate it at the first statement, and the sync pipeline legitimately writes it that way.
     * `tests/skills-catalog.test.ts` asserts the invariant instead.
     */
    blocked: boolean("blocked").notNull().default(false),
    blockReason: varchar("block_reason", { length: 200 }),

    // ---- Curation ----
    status: skillStatusEnum("status").notNull().default("draft"),
    /** A human read the source. Distinct from `status`: a published skill can be unverified. */
    verified: boolean("verified").notNull().default(false),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    /** 0–100 editorial rank, set by seed and admins. NEVER overwritten by sync. */
    popularity: integer("popularity").notNull().default(0),

    // ---- Upstream facts (owned by sync; never hand-edited) ----
    sourceUrl: text("source_url").notNull(),
    /** The mandatory link-back, materialized from skill_sources.attribution_template. */
    attributionUrl: text("attribution_url"),
    homepageUrl: text("homepage_url"),
    stars: integer("stars").notNull().default(0),
    downloads: bigint("downloads", { mode: "number" }).notNull().default(0),
    /** GitHub `pushed_at`. Drives the +2 "unmaintained" risk modifier. */
    upstreamUpdatedAt: timestamp("upstream_updated_at", { withTimezone: true }),
    upstreamFetchedAt: timestamp("upstream_fetched_at", { withTimezone: true }),
    latestVersion: varchar("latest_version", { length: 60 }).notNull().default("0.0.0"),
    /**
     * Last ≤20 known versions, newest first. Bounded on write. §13.8.
     * Rejected alternative: a `skill_versions` table. An attachment only ever needs the pinned
     * string plus enough history to render "you are 3 versions behind", and a fourth skill table
     * buys a join for that.
     */
    knownVersions: jsonb("known_versions").$type<SkillVersionRef[]>().notNull().default([]),
    deprecationNote: varchar("deprecation_note", { length: 200 }),
    /** WHEN it was deprecated. `status` records that it happened; this records when. */
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),

    /**
     * ATG's retrieval index (AGENT_TEMPLATE_GENERATOR §5.2), declared HERE and nowhere else —
     * TASK_PLAN_V2 §1 conflict C2. Two properties are load-bearing and both failed SILENTLY in the
     * earlier two-declaration version:
     *
     * 1. The configuration is 'english', not 'simple'. ATG queries with
     *    websearch_to_tsquery('english', …); against a 'simple' column the stemmed query lexeme
     *    `invoic` never matches the unstemmed indexed lexeme `invoices`, so capabilityMatch —
     *    3.00 of the ranker's 7.20-point scale — collapses to zero with no error raised. The "we
     *    have four UI languages" objection does not apply: ATG's query text is English by
     *    construction, and browse search stays ILIKE, so nothing user-typed reaches this column.
     * 2. setweight A/B with `tags` included, because ts_rank reads those weights.
     *
     * `coalesce(tags::text,'')` rather than an aggregate over jsonb_array_elements_text(tags):
     * a generation expression MAY NOT CONTAIN A SUBQUERY and Postgres rejects every spelling that
     * does with `cannot use subquery in column generation expression`. The cast is immutable, and
     * '["pdf","extract"]'::text tokenises to `pdf` and `extract` with the punctuation discarded.
     */
    searchTsv: customTsvector("search_tsv").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(name,'')), 'A') || setweight(to_tsvector('english', coalesce(replace(slug,'-',' '),'')), 'A') || setweight(to_tsvector('english', coalesce(summary,'')), 'B') || setweight(to_tsvector('english', coalesce(tags::text,'')), 'B')`,
    ),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("skills_identity_uniq").on(t.sourceId, t.ownerHandle, t.slug),
    uniqueIndex("skills_public_id_uniq").on(t.publicId),
    index("skills_browse_idx").on(t.status, t.popularity.desc(), t.id.asc()),
    index("skills_browse_cat_idx").on(t.status, t.category, t.popularity.desc(), t.id.asc()),
    index("skills_source_idx").on(t.sourceId, t.status),
    index("skills_slug_idx").on(t.slug),
    index("skills_risk_idx").on(t.status, t.riskLevel, t.popularity.desc()),
    // Facet lookups are containment tests. jsonb_path_ops is half the size of the default opclass
    // and supports exactly the `@>` we issue. `.op()` — not a `sql` template — because that is the
    // form drizzle-kit diffs; a raw expression re-generates on every db:generate.
    index("skills_tags_gin").using("gin", t.tags.op("jsonb_path_ops")),
    index("skills_harnesses_gin").using("gin", t.harnesses.op("jsonb_path_ops")),
    // ATG's retrieval index. Ships in the same migration as the column it indexes; without it
    // every `search_tsv @@ q` is a sequential scan of the whole catalogue.
    index("skills_search_idx").using("gin", t.searchTsv),
  ],
);
```

### 5.1 Index justification, one query each

| Index | The query that justifies it |
|---|---|
| `skills_identity_uniq` | Sync's upsert conflict target: `ON CONFLICT (source_id, owner_handle, slug) DO UPDATE`. Also the correctness guarantee that `owner_handle` is `''` and not null. |
| `skills_public_id_uniq` | `GET /api/skills/[slug]` first lookup. |
| `skills_browse_idx` | The default browse page: `WHERE status='published' AND blocked=false AND risk_level IN ('low','medium') ORDER BY popularity DESC, id ASC LIMIT 24` with **no category**. |
| `skills_browse_cat_idx` | The same query **with** a category facet. Two indexes and not one composite, because with `category` as a gap in the key `popularity` never provides the ordering, and every page becomes a full index scan plus a sort. The sort keys are spelled out in the direction the query asks for: a plain ascending index scanned backwards yields `id DESC`, not `id ASC`, so even the tiebreak would silently not be index-ordered. |
| `skills_source_idx` | Admin console, "everything from ClawHub awaiting review". |
| `skills_slug_idx` | The bare-slug fallback in `/api/skills/[slug]` and in template materialization when a draft carries a slug but no `skillId`. Non-unique on purpose: `github` resolves to six publishers upstream. |
| `skills_risk_idx` | The `?includeHigh=` facet and the admin risk-band listing. |
| `skills_tags_gin` | `tags @> '["pdf"]'` — the tag facet. |
| `skills_harnesses_gin` | `harnesses @> '["codex"]'` — the harness facet, which is on every skills page load because the agent context filters it. |
| `skills_search_idx` | `search_tsv @@ websearch_to_tsquery('english', $1)` — ATG stage 3, ~8 queries per generation. |

Ten indexes on one table is a lot, and it is justified by the read/write ratio: `skills` is written
by a nightly sync and read on every skills page, every ATG generation and every manifest build.

### 5.2 Corrections to `SKILL_REPOSITORY.md` §1.3

- **B1 · the stale "31 seeded ClawHub rows".** The `license_verified` comment still says 31. Conflict
  **C10** settled on **30** (`mcporter` excluded) and the contract was edited; this comment was
  missed. Corrected above. It matters because `tests/skills-catalog.test.ts` (W2-3) asserts the seed
  count and a doc that says 31 sends the engineer to add a row.
- **B2 · `harnesses` is `Harness[]`, not `Engine[]`.** §1.3 types it `Engine[]` and §1.6 exports
  `Engine`; W0-4 named the union `Harness` and it is **already merged**: `lib/harness/index.ts`
  exports `HARNESS_IDS` and `Harness`, and `lib/db/schema.ts:43` builds `engineEnum` from
  `HARNESS_IDS`. Import `Harness` from `@/lib/harness` — never from `lib/db/schema.ts`, which would
  pull Drizzle and `postgres` into any client component that touches a skill type, the exact thing
  `lib/harness`'s header says it exists to prevent. `export type Engine = (typeof
  engineEnum.enumValues)[number]` **already exists at `lib/db/schema.ts:818`**; leave it there as the
  deprecated alias (an earlier draft of this section said "do not add it to `lib/db/schema.ts`",
  which was advice about a line that had already shipped). Do **not** add a second `Engine` alias in
  `lib/skills/types.ts`; two aliases for one union is the drift this correction exists to stop.
- **B3 · the `blocked` / `status` invariant is documented, not constrained.** §1.3 declares both
  columns and never says how they relate. Stated above, with the reason a CHECK is the wrong tool.

---

## 6. Slot 0010 — `agent_skills` (and `admin_audit_log.target_ref`)

**Purpose.** The desired skill set of one agent, plus the runtime's report of what actually
installed. This is the table conflict **C1** was about, and the resolution is: column **`state`**,
type **`agent_skill_state`**, owned by `SKILL_REPOSITORY.md` §1.4, with the contract's §2.5
denormalized identity columns folded in.

**Expected volume.** agents × 4–8. At 2,000 agents that is ~12k rows; at 50,000 agents, ~300k. Small
enough that every index below is affordable, large enough that the "which agents have this
newly-blocked skill?" query must not be a sequential scan.

```ts
export const agentSkills = pgTable(
  "agent_skills",
  {
    // A surrogate key rather than the composite: the runtime reports install state per attachment
    // and needs one stable id to address (agent.skill_state.agentSkillId). `agent_channels`'
    // composite-PK style has no lifecycle to track and is not the right precedent here.
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /**
     * RESTRICT, not CASCADE: a catalogue row is never hard-deleted — it goes `deprecated` or
     * `blocked` — and a delete that silently detached skills from live agents would be invisible
     * to the operator AND to the runtime, which would keep the bytes on disk forever.
     */
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),

    /**
     * PINNED at attach. Never "latest". The OWASP AST07 control: a version that was clean when
     * installed can be reclassified later, and floating refs make that undetectable.
     */
    version: varchar("version", { length: 60 }).notNull(),
    /**
     * The harness this attachment was asserted compatible with — a snapshot of agents.engine at
     * attach time. When an agent switches engine, every row where this differs is flagged
     * `needs_recheck` in the UI instead of being assumed portable (AST10).
     */
    harness: engineEnum("harness").notNull(),
    /** A deliberate assertion that this skill runs on `harness`. NEVER defaulted true. */
    compatAsserted: boolean("compat_asserted").notNull().default(false),

    enabled: boolean("enabled").notNull().default(true),
    /**
     * `state`, not `status` — TASK_PLAN_V2 §1 conflict C1. The wire event is `agent.skill_state`
     * and its payload field is `state`; one vocabulary end to end means no mapping layer, and no
     * mapping layer means no place for the mapping to be wrong. ArkAgent writes only `pending`
     * (attach) and `removing` (detach); every other transition comes from the runtime.
     */
    state: agentSkillStateEnum("state").notNull().default("pending"),
    installError: text("install_error"),
    /** The Manager's runId from an agent.skill_state event, for log correlation. */
    installRunId: varchar("install_run_id", { length: 120 }),
    /** "live" | "mock" — so a mock-mode row is never mistaken for a real installation. */
    installSource: varchar("install_source", { length: 16 }).notNull().default("live"),

    /** Snapshot of skills.risk_level at attach. A later re-score shows as drift, not silently. */
    riskLevelAtAttach: skillRiskEnum("risk_level_at_attach").notNull(),
    /** Required before a `high` skill may be attached (SKILL_REPOSITORY §6.5). */
    riskAcknowledged: boolean("risk_acknowledged").notNull().default(false),
    acknowledgedById: uuid("acknowledged_by_id").references(() => users.id, { onDelete: "set null" }),

    /**
     * Per-agent skill config. Env var NAMES and non-secret values only — the secret itself lives
     * in the runtime's own store. `.strict()` is NOT the mechanism: this is a z.record and
     * `.strict()` is a no-op on one. The mechanism is an explicit `.check()` rejecting any key
     * matching the SECRET_KEYS regex already used by the channel-config mask
     * (`lib/serializers.ts:107`, /token|secret|key|appsecret|password/i). It is a module-private
     * `const` today; W2-7 must ADD the `export` keyword to it, so there is one definition and not
     * two that drift. lib/serializers.ts is client-safe (its only value import is mergeSettings;
     * everything else is `import type`), so importing it from lib/skills/schema.ts is fine.
     */
    config: jsonb("config").$type<Record<string, string>>().notNull().default({}),

    /**
     * Denormalized from `skills` at attach time, and NOT redundant. The runtime is told
     * (BACKEND_INTEGRATION_CONTRACT §2.5) that identity is this 4-tuple and that it must never
     * join our catalogue; §3.4's agent.skill_state event correlates on exactly these four fields.
     * Without them the webhook handler reverses a join to find its own row. They are a snapshot:
     * if a catalogue row is ever re-keyed, the attachment still resolves to what was installed.
     */
    sourceRef: varchar("source_ref", { length: 40 }).notNull(),
    ownerHandle: varchar("owner_handle", { length: 80 }).notNull().default(""),
    slug: varchar("slug", { length: 120 }).notNull(),
    /** Directory relative to the agent workspace. `.agents/skills` for all four harnesses. */
    installPath: varchar("install_path", { length: 200 }).notNull().default(".agents/skills"),

    origin: agentSkillOriginEnum("origin").notNull().default("manual"),
    /**
     * `agent_templates.id` when origin is `template` or `atg`; null otherwise. **Deliberately not
     * a foreign key** — see the corrections note below. SERVER-SET ONLY: it is never read from the
     * attach body, because an unvalidated client-supplied uuid in an audit field is an audit field
     * that lies.
     */
    originRef: uuid("origin_ref"),
    addedById: uuid("added_by_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    installedAt: timestamp("installed_at", { withTimezone: true }),
    /** Last daily security re-verification of this exact pinned version. */
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("agent_skills_agent_skill_uniq").on(t.agentId, t.skillId),
    // The contract's stated identity constraint. Equivalent to the one above GIVEN
    // skills_identity_uniq, and asserted anyway: a bad denormalization snapshot then fails loudly
    // at write time instead of quietly at install time on a customer's VM.
    uniqueIndex("agent_skills_agent_identity_uniq").on(t.agentId, t.sourceRef, t.ownerHandle, t.slug),
    index("agent_skills_agent_idx").on(t.agentId, t.state),
    // The recall query: "a skill just went blocked — which agents have it pinned?"
    index("agent_skills_skill_idx").on(t.skillId, t.version),
    // The daily re-verification sweep: oldest-verified first, across all agents.
    index("agent_skills_verify_idx").on(t.lastVerifiedAt),
  ],
);
```

### 6.1 Foreign-key semantics, stated deliberately

| FK | ON DELETE | Why |
|---|---|---|
| `agent_id → agents.id` | `cascade` | Deleting an agent must leave no orphan desired-state rows for a manifest to project. |
| `skill_id → skills.id` | `restrict` | The catalogue is append-only in practice; `restrict` makes that structural rather than a convention. If a hard delete is ever genuinely needed, the operator must detach first, which is the correct forcing function. |
| `acknowledged_by_id`, `added_by_id → users.id` | `set null` | Deleting a user must not delete an agent's skills, and must not rewrite the fact that the skill was attached. Same reasoning as `llm_usage`'s context columns (`lib/db/schema.ts:730-732`). |
| `origin_ref` | *no FK* | See below. |

### 6.2 Corrections to `SKILL_REPOSITORY.md` §1.4

- **B4 · `origin_ref` is not a foreign key, and will not become one.** §1.4 calls it "a nullable FK,
  added with that table". Three reasons it stays a bare `uuid`: (a) `agent_templates` lands in
  **0011**, one slot after this table, so a real FK would require a second `ALTER TABLE` in 0011 and
  the `lib/db/schema.ts` declaration would then not match the migration that created it; (b)
  `agent_templates.generation_id` is *already* deliberately not an FK, for the symmetric reason —
  purging generation history must never cascade into a customer's live config — and two audit
  pointers into the same neighbourhood should behave the same way; (c) an audit column whose meaning
  depends on a sibling discriminant (`origin`) is polymorphic in spirit, and a foreign key on a
  polymorphic column is a constraint that is wrong for four of its five cases. It is an audit
  breadcrumb. A dangling value is readable as "the template it came from is gone", which is true.
- **B5 · the six-value `state` ladder includes `removing`, and ArkAgent writes it.** The contract's
  §2.5 says "your report; ArkAgent never sets these except to `pending`". `DELETE
  /api/agents/[id]/skills` sets `enabled=false, state='removing'` and **retains the row** — a hard
  delete would 404 its own confirmation webhook. The contract's own ladder lists `removing`, so this
  is a documentation gap rather than a design change; flagged here so the runtime team does not
  treat an arriving `removing` as unexpected.

### 6.3 `admin_audit_log.target_ref` — the one alteration in 0010

```ts
  /**
   * Non-user audit target. `skills.public_id` for the five skill verbs; extensible to any string
   * key. Nullable, so every existing row and every existing writer is untouched.
   */
  targetRef: varchar("target_ref", { length: 160 }),
```

```sql
ALTER TABLE "admin_audit_log" ADD COLUMN "target_ref" varchar(160);
```

No index: the admin audit view filters by actor or target *user* and orders by time, both of which
the existing two indexes serve. A `target_ref` lookup is an operator forensics query on a table that
will not exceed six figures.

---

## 7. Slot 0011 — `agent_templates`

**Purpose.** A saved, validated `AgentTemplateDraft` plus the denormalized fields the gallery card
renders without a join. One row is one reusable agent configuration; materializing it produces
between one and three agents.

**Owner:** `AGENT_TEMPLATE_GENERATOR.md` §7.1, transcribed into the repo's Drizzle idiom, including
the three card affordances §7.1's reconciliation table adopts from `UI_DESIGN_V2.md` §C.2
(`automates`, `difficulty`, `time_to_value_minutes`) and the two `UI_DESIGN_V2.md` §B.10 adds
(`origin` — a real column; `ownedByViewer` — computed in the serializer and never a column, because
the same row is "yours" to one tenant and "public" to another; conflict **C7**).

**Expected volume.** ~12 platform-curated rows at seed, plus user rows. A workspace that generates
weekly for a year holds ~50. Platform-wide at 500 workspaces: low tens of thousands. The public
gallery reads across all of them, which is what §7.2's index correction is for.

```ts
export const agentTemplates = pgTable(
  "agent_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /**
     * NULL = a platform-curated template visible to every workspace. Seeded rows own that case; a
     * user template always has a workspace.
     */
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    slug: varchar("slug", { length: 48 }).notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    summary: varchar("summary", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    category: varchar("category", { length: 24 }).notNull().default("other"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /**
     * 1–2 code points for the avatar tile. varchar(8), not (2): Array.from splits on code points,
     * so a flag is 2 and any ZWJ sequence is more — and a CJK user's first instinct is an emoji.
     * The Zod schema is the tighter bound; the column has headroom on purpose.
     */
    mono: varchar("mono", { length: 8 }).notNull().default("T"),
    hue: varchar("hue", { length: 16 }).notNull().default("#9AA3B2"),
    /**
     * The locale the human-visible strings inside `draft` are written in. A zh template shown to
     * an en viewer renders its own language rather than a machine translation, and the gallery
     * card labels it. This is NOT the viewer's language.
     */
    locale: localeEnum("locale").notNull().default("en"),
    /**
     * The column TYPE is `engine` (the pgEnum the architecture constants mandate); the column NAME
     * is `harness` because `agents.engine` already means something adjacent and a template row
     * carrying both would be unreadable. UI_DESIGN_V2 §C.2 calls it `engine`; this name wins.
     */
    harness: engineEnum("harness").notNull().default("openclaw"),
    minPlan: planTierEnum("min_plan").notNull().default("associate"),
    visibility: templateVisibilityEnum("visibility").notNull().default("private"),
    origin: templateOriginEnum("origin").notNull().default("generated"),
    /**
     * The whole AgentTemplateDraft (§13.10), schema-validated on write AND re-validated on read
     * before materialization. This is the contract with the backend team: everything an agent
     * runtime needs is in here, and nothing about a template lives only in the browser.
     */
    draft: jsonb("draft").$type<AgentTemplateDraft>().notNull(),
    draftSchemaVersion: integer("draft_schema_version").notNull().default(1),

    // ---- Denormalized card fields, so the gallery needs no joins ----
    skillCount: integer("skill_count").notNull().default(0),
    scheduleCount: integer("schedule_count").notNull().default(0),
    agentCount: integer("agent_count").notNull().default(1),
    /** Present tense, one sentence. `meta.summary` is the fallback. Computed at assemble (§2.9). */
    automates: varchar("automates", { length: 140 }).notNull().default(""),
    /** `beginner` | `intermediate` | `advanced`. Computed from skill/context/credential counts. */
    difficulty: varchar("difficulty", { length: 16 }).notNull().default("beginner"),
    /** Setup estimate in minutes. Computed, never model-authored. */
    timeToValueMinutes: integer("time_to_value_minutes").notNull().default(10),
    /** False when an unremediated lint error blocks the one-click path (ATG §6.3). */
    materializable: boolean("materializable").notNull().default(true),

    /**
     * Which generation produced it; NULL for manual/seeded/forked. NOT a foreign key, so purging
     * generation history (§14.5) never cascades into a template a customer relies on. Same
     * decision, same reason, as agent_skills.origin_ref (§6.2 B4).
     */
    generationId: uuid("generation_id"),
    forkedFromId: uuid("forked_from_id").references((): AnyPgColumn => agentTemplates.id, {
      onDelete: "set null",
    }),
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    /** Soft delete. The gallery never shows an archived row; materialize still resolves one. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Slugs are unique per workspace. Platform templates (workspace_id IS NULL) need their own
    // constraint: NULLs are distinct in a btree by default, so the plain unique index alone would
    // let two platform templates share a slug.
    uniqueIndex("agent_templates_ws_slug_uniq")
      .on(t.workspaceId, t.slug)
      .where(sql`workspace_id is not null`),
    uniqueIndex("agent_templates_global_slug_uniq")
      .on(t.slug)
      .where(sql`workspace_id is null`),
    // Gallery, no category facet — the default view.
    index("agent_templates_gallery_idx")
      .on(t.workspaceId, t.updatedAt.desc())
      .where(sql`archived_at is null`),
    // Gallery WITH a category facet. Two indexes, for the same reason skills has two (§5.1).
    index("agent_templates_gallery_cat_idx")
      .on(t.workspaceId, t.category, t.updatedAt.desc())
      .where(sql`archived_at is null`),
    // The public gallery, across every workspace.
    index("agent_templates_public_idx")
      .on(t.category, t.useCount.desc())
      .where(sql`visibility = 'public' and archived_at is null`),
    index("agent_templates_tags_gin").using("gin", t.tags.op("jsonb_path_ops")),
  ],
);
```

`AnyPgColumn` must be imported from `drizzle-orm/pg-core` for the self-reference; it is the only new
type import this schema needs and TypeScript cannot infer the recursive type without it.

### 7.1 Index justification

| Index | Query |
|---|---|
| `agent_templates_ws_slug_uniq` / `_global_slug_uniq` | Slug allocation on save and fork; the two-partial-index shape is the only way to give platform rows a slug namespace of their own. |
| `agent_templates_gallery_idx` | `WHERE workspace_id = $1 AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 24` |
| `agent_templates_gallery_cat_idx` | the same, `AND category = $2` |
| `agent_templates_public_idx` | `WHERE visibility='public' AND archived_at IS NULL [AND category=$1] ORDER BY use_count DESC` |
| `agent_templates_tags_gin` | `tags @> '["invoicing"]'` |

Partial on `archived_at IS NULL` rather than composite on a mostly-null column: the gallery only
ever asks for live rows, and `archived_at` in the key position buys nothing while making the index
carry every archived row forever.

### 7.2 Corrections to `AGENT_TEMPLATE_GENERATOR.md` §7.1

- **C1 · `agent_templates_public_idx` had a dead leading key column.** As written it was
  `(visibility, category, use_count DESC) WHERE visibility = 'public'`. Inside that predicate
  `visibility` is single-valued, so it contributes nothing to selectivity and only widens every
  entry. Dropped from the key; kept in the predicate.
- **C2 · both gallery indexes lacked the no-facet variant.** `(workspace_id, category, updated_at
  DESC)` cannot order the default gallery query, which supplies **no** category — `category` is a
  gap in the key, so `updated_at` never provides the ordering and every page is an index scan plus
  a sort. This is the identical defect `SKILL_REPOSITORY.md` §1.3 already fixed for `skills` with
  two indexes; templates got the single-index version. Split. It costs one small btree.
- **C3 · `archived_at IS NULL` added to the public index predicate.** An archived public template
  was still being served by the public gallery.
- **C4 · `agent_templates_tags_idx` renamed to `_gin` and given `jsonb_path_ops`,** matching
  `skills_tags_gin`. Same query shape, same opclass, and the name now says what it is.

---

## 8. Slot 0011 — `template_generations` (and the `llm_usage` correlation columns)

**Purpose.** One row per generation attempt. It is the audit trail, the concurrency control, the
cost ledger, and the only way to tell a model failure from a thin brief.

**Owner:** `AGENT_TEMPLATE_GENERATOR.md` §7.2.

**Expected volume.** One per "Generate" click. Rate-limited per workspace, one in flight at a time.
At 500 workspaces generating twice a week that is ~52k rows a year, of which `failed`/`expired` are
purged at 90 days (§14.5) and the rest are kept.

```ts
export const templateGenerations = pgTable(
  "template_generations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: templateGenerationStatusEnum("status").notNull().default("queued"),
    mode: templateGenerationModeEnum("mode").notNull().default("deterministic"),
    locale: localeEnum("locale").notNull().default("en"),
    harness: engineEnum("harness").notNull().default("openclaw"),
    /**
     * The user's words, verbatim. The only way to reproduce a bad generation. REDACTED TO '' when
     * the row expires (§14.5) — a retained free-text description of someone's business seven days
     * after they abandoned it is a liability. NOT NULL, so redaction writes '', never NULL.
     */
    brief: text("brief").notNull(),
    /**
     * SHA-256 of the NORMALIZED brief. Dedupe key, cache key, and the support handle an engineer
     * can ask for without asking for the text. Survives redaction. varchar(64), not char(64), to
     * match `sessions.token_hash` (lib/db/schema.ts:237), which is the same thing.
     */
    briefSha256: varchar("brief_sha256", { length: 64 }).notNull(),
    roleHint: varchar("role_hint", { length: 40 }),
    /** The AgentTemplateDraft once stage 7 succeeds; NULL while queued/running/failed. §13.10. */
    draft: jsonb("draft").$type<AgentTemplateDraft>(),
    /**
     * DraftStageTrace[] (§13.11). Written incrementally, one row-update per stage, so a generation
     * that dies mid-flight still says which stage it died in.
     */
    stageTraces: jsonb("stage_traces").$type<DraftStageTrace[]>().notNull().default([]),
    warnings: jsonb("warnings").$type<DraftWarning[]>().notNull().default([]),
    injectionFindings: jsonb("injection_findings").$type<InjectionFinding[]>().notNull().default([]),
    /** Joins to llm_usage.correlation_id: every model call this generation made. */
    correlationId: uuid("correlation_id").defaultRandom().notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull().default(0),
    llmCalls: integer("llm_calls").notNull().default(0),
    durationMs: integer("duration_ms"),
    /**
     * A normalized class only ("timeout", "upstream_5xx", "stage_charter_failed", "stale_sweep").
     * NEVER a provider body: those carry key fragments and verbatim prompt text, and this column
     * is read by support staff. Same rule as llm_usage.error_code (lib/db/schema.ts:751-754).
     */
    errorCode: varchar("error_code", { length: 40 }),
    templateId: uuid("template_id").references(() => agentTemplates.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("template_generations_ws_idx").on(t.workspaceId, t.createdAt.desc()),
    index("template_generations_status_idx").on(t.status, t.createdAt.desc()),
    index("template_generations_brief_idx").on(t.workspaceId, t.briefSha256),
    uniqueIndex("template_generations_correlation_uniq").on(t.correlationId),
    /**
     * One in-flight generation per workspace. This partial unique index IS the whole concurrency
     * control: no lock table, no Redis, and the second request gets its 409 from a constraint
     * violation rather than from a check that raced.
     */
    uniqueIndex("template_generations_one_running")
      .on(t.workspaceId)
      .where(sql`status in ('queued', 'running')`),
  ],
);
```

### 8.1 Lifecycle, and the two sweeps it depends on

```
                  ┌── cancel ──────────────> canceled
queued ─> running ┼── stage 8 clean ───────> ready ──> approve ──> materialized
                  ├── unremediable lint ───> needs_review ──> (edit) ──> ready
                  └── stage 1|4|7 exhausted> failed
ready | needs_review ── 7 days, no approval ──> expired   (draft retained, brief redacted to '')
```

- **Stale sweep, one threshold not two.** A `queued` *or* `running` row whose **`created_at`** is
  older than `STALE_AFTER = 5 minutes` is swept to `failed` with `error_code = 'stale_sweep'`. Five
  minutes on `created_at` is the single rule — comfortably above the 120 s `maxDuration` a
  generation can legitimately occupy. It runs inside the rate-limit path every generate request
  already takes, as **a statement of its own before the counting query**: a data-modifying CTE is
  invisible to the `SELECT` beside it, which is the bug that made the first version wrong.
- **Expiry sweep** runs in `scripts/atg-sweep.ts` from a Vercel Cron entry at `0 3 * * *`, guarded by
  `CRON_SECRET`. The rate-limit path is the wrong place for it: a workspace that stops generating
  never runs it again, and that is precisely the workspace whose abandoned brief we promised to
  redact.

### 8.2 Index justification

| Index | Query |
|---|---|
| `template_generations_ws_idx` | The generation history list on `/dashboard/templates`. |
| `template_generations_status_idx` | Both sweeps: `WHERE status IN (…) AND created_at < $1`. Leading on `status` is right — the sweeps are always status-scoped, never global-by-age. |
| `template_generations_brief_idx` | "You generated this exact brief 20 minutes ago; reuse that draft?" — the `brief_sha256` cache hit. |
| `template_generations_correlation_uniq` | The `llm_usage.correlation_id → generation` reverse lookup in support tooling. Unique because a shared correlation id would attribute one generation's cost to another. |
| `template_generations_one_running` | Not a read index. It is the concurrency control. |

### 8.3 `llm_usage` — two columns and one index, in 0011

```ts
// lib/db/schema.ts — inside pgTable("llm_usage", { … })
  /**
   * Which ATG stage made this call ("charter", "capabilities", "skills", …). Diagnosing a failed
   * generation means finding its LLM calls, and llm_usage has no other way to say "these nine rows
   * are one user action" — which is exactly the question support asks.
   */
  stage: varchar("stage", { length: 32 }),
  /**
   * template_generations.correlation_id. No FK, and deliberately generic rather than
   * `generation_id`: the next multi-call feature reuses this column instead of adding a third.
   */
  correlationId: uuid("correlation_id"),
```

```ts
  index("llm_usage_correlation_idx").on(t.correlationId),
```

```sql
ALTER TABLE "llm_usage" ADD COLUMN "stage" varchar(32);--> statement-breakpoint
ALTER TABLE "llm_usage" ADD COLUMN "correlation_id" uuid;--> statement-breakpoint
CREATE INDEX "llm_usage_correlation_idx" ON "llm_usage" ("correlation_id");
```

Placed in 0011 rather than 0009 per §2.3: they are written by ATG, they ship with ATG's tables, and
`AGENT_TEMPLATE_GENERATOR.md` §0.2's "File B" already put them here.

---

## 9. Slot 0012 — `agent_context_items` and `agent_schedules`

`check` must be imported from `drizzle-orm/pg-core` for §9.2; it is not currently imported by
`lib/db/schema.ts` because no existing table has a table-level constraint.

### 9.1 `agent_context_items`

**Purpose.** Uploaded documents, pasted text and URLs the agent should know about. Projected into
the manifest; the runtime fetches, indexes and reports back.

**Owner:** `BACKEND_INTEGRATION_CONTRACT.md` §2.6.

**Expected volume.** 0–8 per agent from a template, plus manual uploads. ~5 × agents; low tens of
thousands at fleet scale. Never large, because the **bytes are not in this table** — only a URL, a
digest, and (for `kind='text'`) the pasted text itself.

```ts
export const agentContextItems = pgTable(
  "agent_context_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    kind: contextItemKindEnum("kind").notNull(),
    /** Display filename or title. The runtime sanitises before using it as a path component. */
    name: varchar("name", { length: 200 }).notNull(),
    /** e.g. "application/pdf". Absent for kind='text'. */
    mime: varchar("mime", { length: 120 }),
    /**
     * Byte length. Platform hard ceiling 20 MB per item, enforced at upload — comfortably inside
     * int4, so no bigint. `0` while state = 'awaiting_upload'. A template may set a tighter
     * per-item limit (TemplateContextItem.maxBytes, default 10 MiB); that is enforced at upload,
     * not here, because it is a template preference and this is a platform invariant.
     */
    bytes: integer("bytes").notNull().default(0),
    /** Of the exact bytes at content_url. varchar(64), not char(64) — matches sessions.token_hash. */
    sha256: varchar("sha256", { length: 64 }),
    /**
     * https://app.arkagent.com/api/runtime/context/{id}/content, served against the per-agent
     * manifest token with Cache-Control: no-store. Present only for kind='file' AND
     * state <> 'awaiting_upload'.
     */
    contentUrl: text("content_url"),
    /**
     * The pasted text, inline. Present only for kind='text'. UNTRUSTED user content: it goes into
     * the prompt as data, never as an instruction to the runtime service.
     */
    textBody: text("text_body"),
    /**
     * The URL to fetch, for kind='url'. Fetched in the AGENT'S egress sandbox, never from the
     * control plane — it is a user-supplied URL and therefore an SSRF vector.
     */
    sourceUrl: text("source_url"),
    /** 'agent' = available to every session · 'session' = only where explicitly attached. */
    scope: varchar("scope", { length: 16 }).notNull().default("agent"),
    /**
     * awaiting_upload → pending → indexing → indexed | failed; removed is terminal. The runtime
     * reports every transition EXCEPT awaiting_upload, which only the template generator writes
     * (TASK_PLAN_V2 §1 conflict C3). A row still in awaiting_upload has no bytes: the runtime must
     * skip it silently rather than fetch a null content_url.
     */
    state: contextItemStateEnum("state").notNull().default("pending"),
    stateError: text("state_error"),
    /** Retrievable chunks produced. Informational; null until indexed. */
    chunks: integer("chunks"),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agent_context_items_agent_idx").on(t.agentId, t.state)],
);
```

**Index justification.** One index, three queries, all of them `agent_id`-leading: the manifest
projection (`WHERE agent_id = $1`), the config screen's list (same), and the "what this agent still
needs" checklist (`WHERE agent_id = $1 AND state = 'awaiting_upload'`). `state` in second position
serves the third without a second btree.

**No retention policy.** These are the user's own documents and they live as long as the agent does
(`ON DELETE cascade`). A `removed` row is kept so the runtime's reconciliation can see the removal;
it is not swept. See §14.9 for why that is a deliberate exception.

### 9.2 `agent_schedules`

**Purpose.** Reminders and schedulers. ArkAgent fires them for v2.0 (a control-plane cron computes
due rows, wakes the instance, injects `prompt` as an ordinary chat turn); the runtime only reports
the result as `agent.schedule_run`.

**Owner:** `BACKEND_INTEGRATION_CONTRACT.md` §2.7, **as amended by conflict C6** — the three-arm
CHECK with mutual exclusion, the four bound CHECKs, the narrowed due index, and `timezone` defaulting
to `UTC` rather than a regional guess.

**And by `REMINDERS_AND_SCHEDULERS.md` §3.0, which owns the execution path.** That document was
written after this section and adds eleven columns/constraints across this table and
`agent_schedule_runs` plus one new table. They are absorbed here rather than left to diverge:
`claimed_at` / `claim_token` / `expectation` and the `agent_schedules_enabled_next` CHECK below;
eight columns, two indexes and the FK drop in §11.1; `scheduler_ticks` in §11.4. **Where the two
documents describe the same column, §3.0 there is authoritative on its semantics and this section
on its Drizzle spelling.** Recorded as conflict **C17** in `TASK_PLAN_V2.md` §1.

**Expected volume.** 0–8 per agent. ~4 × agents. The due-scan runs every minute against the partial
index, so what matters is not the table size but that the index contains only fireable rows.

```ts
export const agentSchedules = pgTable(
  "agent_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /**
     * Who created it. Required by W3-6's acceptance criterion ("`created_by_id` for audit") and
     * absent from BACKEND_INTEGRATION_CONTRACT §2.7's DDL — an omission, not a decision, and the
     * only column in this table the contract does not carry. `set null` for the same reason as
     * agent_skills.added_by_id: deleting a user must not delete an agent's schedules and must not
     * rewrite the fact that a human created one. NULL means the row was written by ATG
     * materialization on behalf of the workspace rather than by a person.
     */
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    name: varchar("name", { length: 120 }).notNull(),
    /** false ⇒ never fires. The row is KEPT; disable is not delete. */
    enabled: boolean("enabled").notNull().default(true),
    kind: scheduleKindEnum("kind").notNull(),
    /** 5-field Vixie/POSIX cron, evaluated in `timezone`. lib/schedule/cron.ts is the definition. */
    cronExpr: varchar("cron_expr", { length: 120 }),
    /** ≥60, measured from the END of the previous run. */
    intervalSeconds: integer("interval_seconds"),
    /** Absolute instant for kind='once'. Produced by resolveLocal(), not by string concatenation. */
    runAt: timestamp("run_at", { withTimezone: true }),
    /**
     * IANA. Default 'UTC', NOT a regional value: this is an en/zh/zht/ja product with no single
     * home region, and a row written before the workspace picks a zone must be unambiguous rather
     * than merely plausible (conflict C6). POST /api/agents/[id]/schedules fills it from
     * workspaces.timezone ?? settings.timezone ?? 'UTC'; this default only catches a direct SQL
     * insert. An unknown zone degrades to UTC with an `invalid_timezone` warning, never to a guess.
     */
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    /** The instruction to run. User-authored, injected as a USER turn, never as a system prompt. */
    prompt: text("prompt").notNull(),
    /** Conversation to run in. Default `agent:main:schedule:{id}`, applied at read, not stored. */
    sessionKey: varchar("session_key", { length: 160 }),
    /** true ⇒ start a stopped instance to run this; false ⇒ skip with reason instance_stopped. */
    wakeRuntime: boolean("wake_runtime").notNull().default(true),
    maxRuntimeSeconds: integer("max_runtime_seconds").notNull().default(900),
    overlapPolicy: scheduleOverlapEnum("overlap_policy").notNull().default("skip"),
    /** false ⇒ a fire missed during downtime is dropped. true ⇒ run ONCE on recovery. */
    catchUp: boolean("catch_up").notNull().default(false),
    /** Random 0..n delay, to de-synchronise a fleet that all fires at `0 9 * * *`. */
    jitterSeconds: integer("jitter_seconds").notNull().default(0),
    /**
     * Circuit breaker, 1..288. Past this many fires in one calendar day in `timezone`, skip with
     * reason max_runs_per_day. Guards a cron that was mis-parsed into every-minute. (The literal
     * is not written out here: a step expression contains the two characters that close a JSDoc
     * block, and pasting one into this comment silently truncates it.) Has a column — conflict C4 —
     * because ATG's lint rule ATG-L007 sets a ceiling that would otherwise be discarded at save.
     */
    maxRunsPerDay: integer("max_runs_per_day").notNull().default(288),
    /** chat | email | channel | none. `email` is delivered by ArkAgent; the runtime never sends it. */
    deliverTo: varchar("deliver_to", { length: 16 }).notNull().default("chat"),
    /** Computed by ArkAgent, advisory for the runtime. NULL for a fired `once` or unmatchable cron. */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastStatus: varchar("last_status", { length: 24 }),
    /**
     * The claim lease, from `REMINDERS_AND_SCHEDULERS.md` §3.0 deltas 1 and 2 — that document
     * owns the execution path and these three columns are its, not this one's. `claimed_at` +
     * `claim_token` are a DURABLE lease (300 s, deliberately longer than the tick route's
     * `maxDuration` of 60) rather than an open transaction: holding a transaction across the
     * dispatch would pin a pooled connection across network I/O, and a killed worker's claim
     * would vanish instead of expiring.
     */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimToken: uuid("claim_token"),
    /**
     * "What a good run looks like" — §1.2 WHAT TO EXPECT there. User-authored, ≤280 chars,
     * dispatched as FENCED DATA inside the user turn. Same trust boundary as `prompt`: never a
     * system instruction, and W3-6's injection acceptance criterion covers both columns.
     */
    expectation: varchar("expectation", { length: 280 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    /**
     * Each arm asserts BOTH that its own discriminant is present AND that the other two are
     * absent. The original OR-chain only did the former, so kind='cron' with interval_seconds = 5
     * satisfied the first arm and stored a row that MEANS something other than what it says
     * (conflict C6).
     */
    check(
      "agent_schedules_shape",
      sql`(kind = 'cron' AND cron_expr IS NOT NULL AND interval_seconds IS NULL AND run_at IS NULL)
       OR (kind = 'interval' AND interval_seconds IS NOT NULL AND interval_seconds >= 60 AND cron_expr IS NULL AND run_at IS NULL)
       OR (kind = 'once' AND run_at IS NOT NULL AND cron_expr IS NULL AND interval_seconds IS NULL)`,
    ),
    // Negative jitter walks next_run_at BACKWARDS and can re-fire an occurrence that already ran;
    // an hour of it de-synchronises a fleet past the point of being a schedule at all.
    check("agent_schedules_jitter", sql`jitter_seconds BETWEEN 0 AND 3600`),
    check("agent_schedules_runtime", sql`max_runtime_seconds BETWEEN 30 AND 86400`),
    check("agent_schedules_runs", sql`max_runs_per_day BETWEEN 1 AND 288`),
    check("agent_schedules_deliver", sql`deliver_to IN ('chat','email','channel','none')`),
    /**
     * `REMINDERS_AND_SCHEDULERS.md` §3.0 delta 3, as a constraint rather than a convention:
     * a disabled row must not keep a `next_run_at`, and an enabled one must have one, or a
     * crashed tick leaves a recurring schedule permanently outside the due index and it never
     * fires again. TEST_PLAN TC-076 asserts the raw UPDATE is rejected.
     */
    check(
      "agent_schedules_enabled_next",
      sql`(enabled AND next_run_at IS NOT NULL) OR (NOT enabled AND next_run_at IS NULL)`,
    ),
    index("agent_schedules_agent_idx").on(t.agentId, t.enabled),
    /**
     * The minute-by-minute due scan. `next_run_at` is nullable and a fired `once` or an
     * unmatchable cron sets it back to NULL; without the IS NOT NULL arm those rows sit in the
     * index forever, growing it without bound with entries the predicate can never select.
     */
    index("agent_schedules_due_idx")
      .on(t.nextRunAt, t.claimedAt)
      .where(sql`enabled and next_run_at is not null`),
  ],
);
```

**Why `deliver_to` is a CHECK-constrained `varchar` and not a pgEnum.** Every other closed
vocabulary here is an enum. This one is not, because it is the newest addition to the contract, the
runtime team has not frozen it, and a fifth delivery target (`webhook`) would be an `ALTER TYPE` in
the hazardous class rather than a one-line CHECK swap. The CHECK gives the same integrity guarantee
with a cheaper escape hatch.

**The same reasoning applies to five other `varchar`s, and the CHECK has to actually be written.**
An earlier draft of this document asserted that `scope`, `last_status`, `install_source`,
`agent_run_steps.status`, `agent_schedule_runs.status` and `agent_health_samples.state` were
"CHECK-constrained varchars" while declaring no CHECK for any of them — a `varchar` with a comment
listing four legal values is not a constraint, it is a wish, and `agent_health_samples.state` and
`agent_schedule_runs.status` are both read by logic that assumes a closed set (the §11.1 rank rule
and the §14.4 rollup). They are written here, each in the table that owns it:

```ts
// agent_context_items
check("agent_context_items_scope", sql`scope IN ('agent','session')`),
// agent_schedules
check("agent_schedules_last_status", sql`last_status IS NULL OR last_status IN ('started','succeeded','failed','skipped')`),
// agent_skills
check("agent_skills_install_source", sql`install_source IN ('live','mock')`),
// agent_run_steps
check("agent_run_steps_status", sql`status IN ('ok','error')`),
// agent_schedule_runs
check("agent_schedule_runs_status", sql`status IN ('started','succeeded','failed','skipped')`),
check("agent_schedule_runs_skip", sql`(status = 'skipped') = (skip_reason IS NOT NULL)`),
// agent_health_samples
check("agent_health_samples_state", sql`state IN ('running','idle','stopped','unhealthy')`),
check("agent_health_samples_source", sql`source IN ('runtime','mock','rollup')`),
```

`agent_schedule_runs_skip` is a biconditional, not a one-way `NOT NULL` guard: a `skip_reason` on a
`succeeded` row is exactly as wrong as a `skipped` row with no reason, and the UI renders the reason
whenever it is present.

**The cron dialect is `lib/schedule/cron.ts` and nothing else.** It is finished, dependency-free,
tested, and its DST policy is decided: a **skipped** wall clock fires at the instant the clock jumps
to; a **repeated** one fires once on the first pass, *unless* the hour field is unrestricted
(interval-like), in which case both passes fire.

**The real `nextRun` hazard, stated correctly.** The signature is
`nextRun(expression: string, after: Date, timeZone = "UTC"): Date | null` —
`lib/schedule/cron.ts:521`. An earlier draft claimed "there is no two-argument form; writing one
silently passes the zone as `after` and returns `null`". Both halves are false, and the truth is
worse: **`timeZone` has a default, so `nextRun(cronExpr, now)` compiles and silently evaluates the
expression in UTC** — a `0 9 * * *` schedule in `Asia/Shanghai` then fires at 17:00 local, with no
error anywhere. (Passing a zone string as the second argument is a *compile* error, not a silent
null; `after: Date` is required and typed.) Every call site that writes `next_run_at` must pass
three arguments, and `tests/schedule-tick.test.ts` must assert a non-UTC zone so a dropped third
argument fails a test rather than a customer. The same applies to `nextRuns(expression, after,
timeZone, count)` (`:612`) and `runsBetween(expression, from, to, timeZone, limit)` (`:636`), whose
`timeZone` parameters also default to `"UTC"`. `NextRunOptions` (`:503`) is exported but unused by
`nextRun`, which takes positionals — do not reach for an options object that nothing accepts.

---

## 10. Slot 0012 — `agent_runs` and `agent_run_steps`

These two are the volume problem in the v2 schema. Everything else is bounded by the number of
agents; these are bounded by how hard the agents work. Estimates, at three scales, assuming an
active agent performs ~40 runs/day averaging 25 steps:

| Table | 200 agents (launch) | 2,000 agents | 20,000 agents |
|---|---|---|---|
| `agent_runs` / day | 8k | 80k | 800k |
| `agent_runs` at 400-day retention | 3.2M | 32M | 320M |
| `agent_run_steps` / day | 200k | 2M | 20M |
| `agent_run_steps` at 90-day retention | 18M | 180M | **1.8B** |

**These windows are `HARNESSES_AND_ACTIVITY.md` §7.2's, not this document's.** An earlier draft
used 30 days for steps and 180 for runs and claimed in §19.4 that "nothing in the corpus says how
`agent_run_steps` is pruned" — false; §7.2 there sets steps at **90 days** and runs at **400**, with
a reason this document has no better answer to (400 = a year plus a quarter, so a year-over-year
comparison never has the boundary inside it, and matching `agent_activities` to `agent_runs` keeps
the merged timeline from ever showing a run with no activity or the reverse). §14 now implements 90
and 400.

The 20,000-agent column is where a single unpartitioned `agent_run_steps` stops being reasonable.
v2.0 ships it unpartitioned with a 90-day window (§14.3); **declarative monthly `RANGE` partitioning
on `occurred_at` is the known next step**, and the schema is written so that conversion needs no
application change — `occurred_at` is `NOT NULL`, it is in every index, and nothing joins on the
surrogate `id`.

### 10.1 `agent_runs`

**Purpose.** One row per unit of agent work, whatever triggered it. The Activity timeline's primary
row type, the thing a cost line points at, and the parent of the step trace.

**Owner:** `BACKEND_INTEGRATION_CONTRACT.md` §3.3. Written **only** by the event ingest handler.

```ts
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /** The runtime's own runId. Our second idempotency key, with agent_id. */
    externalRunId: varchar("external_run_id", { length: 120 }).notNull(),
    trigger: runTriggerEnum("trigger").notNull().default("chat"),
    /** scheduleId for trigger='schedule', inbound message id for 'channel', else null. */
    triggerRef: varchar("trigger_ref", { length: 160 }),
    sessionKey: varchar("session_key", { length: 160 }),
    status: runStatusEnum("status").notNull().default("running"),
    /**
     * NOT NULL, which is why out-of-order handling has explicit derivations:
     *  - run_finished before run_started ⇒ started_at = finishedAt - durationMs. This is why
     *    durationMs is REQUIRED on agent.run_finished; the documented "finishedAt - startedAt"
     *    fallback is circular, because there is no startedAt yet.
     *  - run_step for an unknown runId ⇒ the run is created lazily with started_at = the STEP's
     *    occurredAt, status='running', trigger='system'; a late run_started overwrites started_at,
     *    trigger, trigger_ref, session_key and model.
     */
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    stepCount: integer("step_count").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /**
     * Cached input tokens. `llm_usage` has no cache column, so the split survives ONLY here —
     * ingest folds cached input into llm_usage.prompt_tokens (contract §3.4, agent.usage).
     */
    cacheTokens: integer("cache_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    /** Micro-USD (1e-6), matching llm_usage.cost_micro_usd. Never a float. */
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull().default(0),
    model: varchar("model", { length: 160 }),
    /** ≤500 chars from the runtime. The one line the timeline row renders under the title. */
    summary: text("summary"),
    errorCode: varchar("error_code", { length: 48 }),
    errorMessage: text("error_message"),
    /**
     * Set by the nightly prune when this run's steps are deleted (§14.3). Lets the run detail
     * screen say "step trace pruned after 90 days" instead of rendering an empty trace that looks
     * like a bug, and — more importantly — keeps the prune's driver query from re-scanning the
     * same aged runs every night forever.
     */
    stepsPrunedAt: timestamp("steps_pruned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agent_runs_external_uniq").on(t.agentId, t.externalRunId),
    /**
     * The timeline's run branch. `id DESC` is the THIRD key column and is not optional:
     * HARNESSES_AND_ACTIVITY §5.4 paginates with the row comparison
     * `(started_at, id) < ($t, $i)`, and without `id` in the index the tiebreak is a heap filter —
     * which is exactly the path a busy agent hits on every page after the first. That document
     * carries this as a PROPOSED amendment to BACKEND_INTEGRATION_CONTRACT §3.3; it is adopted
     * here, so the amendment is closed.
     */
    index("agent_runs_agent_idx").on(t.agentId, t.startedAt.desc(), t.id.desc()),
    /**
     * The ERRORS view (HARNESSES_AND_ACTIVITY §6.6). Partial, because failures are ~1.4 % of a
     * healthy agent's runs, so this holds a few hundred entries against hundreds of thousands and
     * the incident view stays instant on the day it matters. The three values are spelled out
     * rather than `<> 'succeeded'` so that `queued`/`running` rows never enter it.
     */
    index("agent_runs_agent_failed_idx")
      .on(t.agentId, t.startedAt.desc())
      .where(sql`status in ('failed', 'timeout', 'cancelled')`),
    /**
     * The two prune drivers (§14.2, §14.3) are age-scoped ACROSS agents and cannot use the
     * composite above, whose leading column is agent_id.
     *
     * COMPLEMENTARY PARTIAL INDEXES, not one full index on started_at. Together they contain
     * exactly the same entries a full index would, but each is a pure range scan for its own
     * query and each shrinks to the work actually outstanding: the step-prune driver holds only
     * runs whose steps still exist, so it drains to near-zero instead of forcing a nightly walk
     * over five months of already-pruned rows to re-discover that they are already pruned.
     */
    index("agent_runs_steps_prune_idx").on(t.startedAt).where(sql`steps_pruned_at is null`),
    index("agent_runs_purge_idx").on(t.startedAt).where(sql`steps_pruned_at is not null`),
  ],
);
```

`agent_runs` is written only by the ingest handler and read by three screens; it carries no
`updated_at` on purpose. Every mutation it receives is an idempotent reconciliation keyed by
`(agent_id, external_run_id)`, and a column that would move on each redelivery of the same event
invites someone to sort by it.

**Autovacuum, from `HARNESSES_AND_ACTIVITY.md` §7.2, ships in the same migration as the tables.**
At the default `autovacuum_vacuum_scale_factor = 0.2` a 100M-row table waits for 20M dead tuples,
which on an append-plus-nightly-bulk-delete workload means weeks of index bloat that every range
scan walks:

```sql
ALTER TABLE "agent_run_steps"      SET (autovacuum_vacuum_scale_factor = 0.02);--> statement-breakpoint
ALTER TABLE "agent_health_samples" SET (autovacuum_vacuum_scale_factor = 0.02);
```

Drizzle has no declaration for storage parameters, so these are hand-written into `0012` and will
**not** appear in `lib/db/schema.ts` or in a `db:generate` diff. That is the one place in this
schema where the migration is ahead of the Drizzle file; §18.6 verifies it with a `pg_class.reloptions`
query rather than trusting the generator.

### 10.2 `agent_run_steps`

**Purpose.** The step trace inside a run — the thinking/tool-call/result ladder the run detail
drawer renders and the Activity page's cross-run "everything this agent did" feed reads.

```ts
export const agentRunSteps = pgTable(
  "agent_run_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    /**
     * Denormalized from the run. Not redundant: the Activity page's feed is agent-scoped and
     * spans runs, and without this column that query is a join against a table two orders of
     * magnitude smaller — i.e. a nested loop over every run the agent ever had.
     */
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    externalStepId: varchar("external_step_id", { length: 120 }).notNull(),
    /** The runtime's ordering index. Steps are RENDERED by this, never by arrival order. */
    idx: integer("idx").notNull(),
    phase: runStepPhaseEnum("phase").notNull(),
    /** shell|browser|file|http|skill|message|model|mcp. varchar: the runtime extends it freely. */
    kind: varchar("kind", { length: 32 }),
    title: varchar("title", { length: 300 }).notNull(),
    detail: text("detail"),
    /** ok | error. */
    status: varchar("status", { length: 16 }).notNull().default("ok"),
    durationMs: integer("duration_ms"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /**
     * The step's own clock, NOT the run's. `RunStepDTO` calls this `occurredAt` for exactly that
     * reason — TASK_PLAN_V2 §1 conflict C13, where the DTO said `startedAt` and invited a
     * mis-join that would order a step trace by its parent run's clock.
     */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("agent_run_steps_uniq").on(t.runId, t.externalStepId),
    index("agent_run_steps_run_idx").on(t.runId, t.idx),
    // The Activity page's "everything this agent did, newest first" query spans runs. Without this
    // it is a sequential scan of every step in the deployment.
    index("agent_run_steps_agent_idx").on(t.agentId, t.occurredAt.desc()),
  ],
);
```

**Three indexes and no fourth.** The nightly prune deliberately does **not** get its own
`(occurred_at)` index — a fourth btree on the highest-write table in the schema costs more on every
insert than it saves once a night. Instead the prune is driven from `agent_runs_steps_prune_idx` and
deletes by `run_id IN (…)`, which uses `agent_run_steps_run_idx`. §14.3 has the statement.

**Why `id` is a `uuid` and not a `bigint` identity**, when `usage_records` and `llm_usage` — the
existing append-only logs — both use `bigint … generatedAlwaysAsIdentity`: because rows arrive from
an untrusted external writer in batches that must be idempotent, and `ON CONFLICT (run_id,
external_step_id) DO NOTHING` on a client-generated `uuid` PK inserts cleanly in a multi-row
statement and leaves nothing behind on a duplicate batch. The identity idiom stays right for
`agent_health_samples`, whose rows are pure appends whose dedupe key is a secondary unique index,
and where the sequence gaps a conflicting batch burns are harmless in a `bigint`.

---

## 11. Slot 0012 — `agent_schedule_runs`, `agent_health_samples`, `runtime_event_receipts`, `scheduler_ticks`

### 11.1 `agent_schedule_runs`

**Purpose.** One row per schedule *occurrence*, including the ones that were skipped. A skipped
occurrence must still be recorded: silence is indistinguishable from a broken scheduler, and "why
didn't it run?" is the single most common support question about reminders.

**Expected volume.** schedules × fires/day. A workspace with 20 daily schedules produces 20 rows a
day. Fleet-wide at 2,000 agents × 4 schedules × 3 fires/day ≈ 24k/day, ~4.3M at 180-day retention.

```ts
export const agentScheduleRuns = pgTable(
  "agent_schedule_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /**
     * NO `.references()`, deliberately and permanently — `REMINDERS_AND_SCHEDULERS.md` §3.0
     * delta 11. `ON DELETE CASCADE` erases the history a deleted schedule produced, which is the
     * one thing UC-V2-22 asks DELETE to preserve; `ON DELETE SET NULL` is worse than it looks,
     * because `GET …/runs` filters by `schedule_id`, so the rows survive and nothing can ever
     * read them again. The column stays `NOT NULL`, the label is snapshotted in `schedule_name`,
     * and `agent_id`'s FK is what still bounds the table. A later "helpful" re-add of
     * `.references()` reintroduces the cascade: do not.
     */
    scheduleId: uuid("schedule_id").notNull(),
    /** Snapshot of agent_schedules.name at write time, so history survives the schedule. */
    scheduleName: varchar("schedule_name", { length: 120 }).notNull().default(""),
    /** Denormalized, for the agent-scoped history view — same reason as agent_run_steps.agent_id. */
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    /**
     * The INTENDED fire instant, not the actual start. This is the occurrence's identity and the
     * second idempotency key; a jittered or delayed start must not create a second row.
     */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** started | succeeded | failed | skipped. See the monotonicity rule below. */
    status: varchar("status", { length: 16 }).notNull().default("started"),
    /**
     * instance_stopped | overlap | outside_working_hours | disabled | credit_cap_reached |
     * max_runs_per_day | daily_action_limit — the contract's list — plus the four
     * ArkAgent-originated values REMINDERS_AND_SCHEDULERS.md §8.1 D13 registers:
     * channel_not_bound | misfire | misfire_too_old | dispatch_unsupported. The runtime never
     * sends those four. Required when status='skipped'. Each is a key in
     * lib/i18n/activity.ts with all four languages (created by W3-9, not W5-4 — D20 there).
     */
    skipReason: varchar("skip_reason", { length: 48 }),
    summary: text("summary"),
    errorCode: varchar("error_code", { length: 48 }),
    errorMessage: text("error_message"),
    /**
     * Misfire accounting — `REMINDERS_AND_SCHEDULERS.md` §3.0 delta 5. `missed_truncated`
     * carries `runsBetween()`'s own `truncated` flag, so "247 missed" and "at least 501 missed"
     * are different sentences rather than the same lie (TC-079/TC-080).
     */
    missedCount: integer("missed_count").notNull().default(0),
    missedTruncated: boolean("missed_truncated").notNull().default(false),
    /**
     * Why this occurrence exists. A plain varchar on OUR table rather than a `run_trigger` value:
     * TC-087 wants `manual` for a retry, and adding an enum value would need its own file ahead
     * of use (§1.2). `agent_runs.trigger` stays `'schedule'` with `trigger_ref` = the schedule id.
     */
    trigger: varchar("trigger", { length: 12 }).notNull().default("schedule"),
    /** Retry state — §3.10.2 there. `attempt` starts at 1 for the first dispatch. */
    attempt: integer("attempt").notNull().default(1),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    /** The expectation signal. NULL = not evaluated; the serializer must not coerce it to false. */
    expectationMet: boolean("expectation_met"),
    /** Mirrors agent_health_samples.source — same name, same width — so a mock occurrence is
     *  legible as mock in the UI and in support. */
    source: varchar("source", { length: 16 }).notNull().default("runtime"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agent_schedule_runs_occurrence_uniq").on(t.scheduleId, t.scheduledFor),
    // The per-schedule history panel, and the stale-`started` sweep. Without the second, the
    // sweep is a full scan of every occurrence ever recorded (§3.0 delta 10 there).
    index("agent_schedule_runs_sched_idx").on(t.scheduleId, t.scheduledFor.desc()),
    index("agent_schedule_runs_open_idx").on(t.startedAt).where(sql`status = 'started'`),
    check("agent_schedule_runs_trigger", sql`trigger IN ('schedule','manual','catch_up')`),
    check("agent_schedule_runs_source", sql`source IN ('runtime','mock','local')`),
    // "Every scheduled thing this agent did" — the Reminders screen's history tab, which spans
    // schedules. agent_id had no index at all in the contract; this query was a sequential scan.
    index("agent_schedule_runs_agent_idx").on(t.agentId, t.scheduledFor.desc()),
    check("agent_schedule_runs_status", sql`status IN ('started','succeeded','failed','skipped')`),
    check("agent_schedule_runs_skip", sql`(status = 'skipped') = (skip_reason IS NOT NULL)`),
  ],
);
```

**Status monotonicity — the UPSERT rule.** One occurrence is reported at least twice (`started`,
then a terminal status), and delivery is unordered, so the handler upserts on
`(schedule_id, scheduled_for)` and **must not regress a terminal status back to `started`**:

```
rank: started = 0 · skipped = 1 · failed = 2 · succeeded = 2
```

A lower rank never overwrites a higher one. Ranks that tie are last-write-wins by `occurredAt` —
`failed` and `succeeded` are both terminal and an occurrence legitimately yields exactly one of
them, so the tie is a redelivery, not a conflict. The contract's §3.3 states this as
"started(0) < skipped(1) < failed(2) < succeeded(2)", which reads as a total order and is not one;
restated here (**D5**, §19.4).

**There is no `status_rank` column, so the rank must be spelled out in the statement.** An earlier
draft of this section wrote `excluded.status_rank >= agent_schedule_runs.status_rank`, which does
not run: `excluded` exposes exactly the target table's columns, and Postgres answers
`ERROR: column excluded.status_rank does not exist` (verified on 15.13). Define the rank once as an
immutable SQL function so the statement stays readable and the ladder lives in one place:

```sql
-- 0012, beside the table.
CREATE FUNCTION schedule_run_rank(s text) RETURNS int
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT CASE s WHEN 'started' THEN 0 WHEN 'skipped' THEN 1
                 WHEN 'failed' THEN 2 WHEN 'succeeded' THEN 2 ELSE -1 END $$;
```

```sql
INSERT INTO agent_schedule_runs
  (schedule_id, agent_id, run_id, scheduled_for, status, skip_reason,
   started_at, finished_at, summary, error_code, error_message)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (schedule_id, scheduled_for) DO UPDATE SET
  status      = CASE WHEN schedule_run_rank(excluded.status)
                        >= schedule_run_rank(agent_schedule_runs.status)
                     THEN excluded.status ELSE agent_schedule_runs.status END,
  skip_reason = CASE WHEN schedule_run_rank(excluded.status)
                        >= schedule_run_rank(agent_schedule_runs.status)
                     THEN excluded.skip_reason ELSE agent_schedule_runs.skip_reason END,
  -- The remaining columns are additive facts, not state, so a late event may fill a NULL but
  -- never blank a value that is already there. COALESCE(excluded, existing) is the wrong order:
  -- it would let a redelivered `started` (all-NULL summary) erase a `succeeded` summary.
  run_id       = COALESCE(agent_schedule_runs.run_id,       excluded.run_id),
  started_at   = COALESCE(agent_schedule_runs.started_at,   excluded.started_at),
  finished_at  = COALESCE(excluded.finished_at,  agent_schedule_runs.finished_at),
  summary      = COALESCE(excluded.summary,      agent_schedule_runs.summary),
  error_code   = COALESCE(excluded.error_code,   agent_schedule_runs.error_code),
  error_message= COALESCE(excluded.error_message,agent_schedule_runs.error_message);
```

`status` and `skip_reason` move **together** or not at all — moving one without the other can
produce a `succeeded` row carrying a stale `skip_reason`, which the new
`agent_schedule_runs_skip` CHECK (§9.2) would then reject at write time, turning a display bug into
a 500. `finished_at` prefers the incoming value because a redelivered terminal event carries the
authoritative one, while `started_at` prefers the stored one because the first `started` is the
truth and a lazily-created row's is a guess.

*Rejected alternative:* a `status_rank` generated column. It is a fourth thing to keep in sync with
a vocabulary that is a `varchar`, and it would be indexed by nothing.

### 11.2 `agent_health_samples`

**Purpose.** The sparkline and the capacity view. Emitted every 60 s while `working`, plus once on
every state change.

**Expected volume.** ~1,440/agent/day. **This is the highest-row-count table in the schema.** At
2,000 agents that is 2.9M rows/day and ~40M at the 14-day full-resolution window; the hourly rollup
(§14.4) is what keeps it from being unbounded, and it is not optional at fleet scale.

```ts
export const agentHealthSamples = pgTable(
  "agent_health_samples",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull(),
    /** running | idle | stopped | unhealthy. ORTHOGONAL to agents.status: `working` + `idle` is normal. */
    state: varchar("state", { length: 16 }).notNull(),
    /** 0..100 of the container's own limit. Fractional on the wire; ROUNDED here, clamped not rejected. */
    cpuPercent: integer("cpu_percent"),
    memoryBytes: bigint("memory_bytes", { mode: "number" }),
    memoryLimitBytes: bigint("memory_limit_bytes", { mode: "number" }),
    diskUsedBytes: bigint("disk_used_bytes", { mode: "number" }),
    uptimeSeconds: bigint("uptime_seconds", { mode: "number" }),
    activeRuns: integer("active_runs").notNull().default(0),
    /**
     * runtime | mock | rollup. `mock` rows are swept and NEVER rolled up — they must not end up
     * averaged into a real agent's history (contract §3.5), and the UI renders them visibly
     * distinct. `rollup` is written by the §14.4 job in place of the raw rows it replaces.
     */
    source: varchar("source", { length: 16 }).notNull().default("runtime"),
  },
  (t) => [
    /**
     * ONE index doing two jobs. It is UNIQUE — not the plain index the contract specifies —
     * because (a) equal `sampled_at` values from one agent are by definition the same observation,
     * so this is the natural dedupe key for a redelivered batch whose eventIds were regenerated,
     * and (b) it is the ON CONFLICT arbiter the hourly rollup (§14.4) needs: the rollup row is
     * written at the bucket's first instant, where a raw sample may already sit.
     * A DESC unique index serves `WHERE agent_id=$1 ORDER BY sampled_at DESC LIMIT 120` directly,
     * and `ON CONFLICT (agent_id, sampled_at)` DOES infer it — index inference matches columns,
     * collation and opclass, and ignores ASC/DESC, which lives in `indoption`. Verified on 15.13.
     */
    uniqueIndex("agent_health_samples_agent_sample_uniq").on(t.agentId, t.sampledAt.desc()),
    check("agent_health_samples_state", sql`state IN ('running','idle','stopped','unhealthy')`),
    check("agent_health_samples_source", sql`source IN ('runtime','mock','rollup')`),
    // 0..100 of the container's own limit, clamped at ingest, not rejected — a runtime reporting
    // 103 % is a rounding artefact, not a reason to drop a health sample.
    check("agent_health_samples_cpu", sql`cpu_percent IS NULL OR cpu_percent BETWEEN 0 AND 100`),
    /**
     * The retention sweep and the rollup both scan BY AGE ACROSS ALL AGENTS. The composite above
     * cannot serve that — `agent_id` leads it — so without this index the nightly job sequential-
     * scans the largest table in the schema. Same structural point as
     * runtime_event_receipts_received_idx below.
     */
    index("agent_health_samples_sweep_idx").on(t.sampledAt),
  ],
);
```

### 11.3 `runtime_event_receipts`

**Purpose.** The ingest ledger. Not a log — **the only concurrency guard on event ingest.**

**Owner:** `BACKEND_INTEGRATION_CONTRACT.md` §3.2. Missing from `TASK_PLAN_V2.md` §2.1's slot list;
added here as **A2** (§2.2).

**Expected volume.** One row per accepted event. Events are batched but each carries its own
`eventId`, so this is roughly `runs × (2 + steps) + health + activity` ≈ 2× the step volume. At
2,000 agents, ~6M/day, ~180M at the 30-day retention — which is why the retention is 30 days and why
the sweep needs its own index.

```ts
export const runtimeEventReceipts = pgTable(
  "runtime_event_receipts",
  {
    /**
     * The runtime's eventId, and the primary key. It MUST NOT be derived from content that can
     * legitimately repeat — a payload hash silently swallows a real second occurrence of an
     * identical activity line. Derive it from the runtime's own event-log primary key, or a ULID.
     */
    eventId: varchar("event_id", { length: 120 }).primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 48 }).notNull(),
    /** Per-agent monotonic counter from the runtime. Optional; it is what makes ordering correct. */
    seq: bigint("seq", { mode: "number" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("runtime_event_receipts_agent_idx").on(t.agentId, t.receivedAt),
    // The 30-day sweep scans by age across all agents; the composite above cannot serve it.
    index("runtime_event_receipts_received_idx").on(t.receivedAt),
  ],
);
```

**The ledger insert and the event's effects MUST commit in one transaction**, with the insert as the
conflict target:

```sql
INSERT INTO runtime_event_receipts (event_id, agent_id, type, seq, occurred_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (event_id) DO NOTHING
RETURNING event_id;      -- no row back ⇒ duplicate: skip the effects, count it, return 200
```

Effects-first-receipt-after leaves a window where a crash bills the customer twice for one
`agent.usage`; receipt-first-in-its-own-transaction leaves a window where a crash bills them zero.
One transaction is the only shape with no window — and it is why the handler must do no slow work
(no HTTP, no LLM call) inside it.

---

### 11.4 `scheduler_ticks`

**Owner:** `REMINDERS_AND_SCHEDULERS.md` §3.0 delta 12. Reproduced here because this document is
the single place a migration author reads before writing 0012, and an earlier draft of §2.1's
runtime row named neither this table nor `runtime_event_receipts`.

**Purpose.** One row per invocation of `/api/cron/schedules`. It exists for exactly one thing that
cannot be derived from any other table: on a plan whose cron granularity is coarser than the
schedules users created, **every other table looks healthy**. `next_run_at` is computed correctly,
`agent_schedule_runs` has rows, nothing errors — and a five-minute poll runs twice a day. Without
a record of when the tick actually ran, that is undiagnosable.

**Not agent-scoped and not tenant-scoped.** Rows are never served to a tenant: `/dashboard/admin`
reads them behind `requirePlatformRole("support")` (`lib/api.ts:61`), and the only thing that
crosses to a tenant is the derived scalar `observedTickSeconds`, which drives the
`tick_too_coarse` banner.

```ts
export const schedulerTicks = pgTable(
  "scheduler_ticks",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    claimed: integer("claimed").notNull().default(0),
    dispatched: integer("dispatched").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    retried: integer("retried").notNull().default(0),
    swept: integer("swept").notNull().default(0),
    /** The claim batch hit its LIMIT — the tick is behind, not idle. */
    saturated: boolean("saturated").notNull().default(false),
    source: varchar("source", { length: 12 }).notNull().default("vercel_cron"),
  },
  (t) => [
    index("scheduler_ticks_started_idx").on(t.startedAt.desc()),
    check("scheduler_ticks_source", sql`source IN ('vercel_cron','external','manual')`),
  ],
);
```

**Retention is deliberately not §14's job.** The tick prunes its own ledger — one
`DELETE FROM scheduler_ticks WHERE started_at < now() - interval '7 days'` per invocation, ~10k
rows at one a minute, never growing. A ledger whose purpose is proving the tick ran must not
depend on a *second* cron entry that the plan may not allow.

`SchedulerTick` / `NewSchedulerTick` join the appendix's inferred-type list.

---

## 12. Slot 0012 — the forward-FK column additions, and the Activity indexes

These four columns reference `agent_runs`, so they cannot exist before it. They are the tail of
0012, after every `CREATE TABLE`.

```ts
// agent_activities — the agent.activity v2 event (contract §3.4)
  /**
   * The activity code from the closed registry (`run.finished`, `skill.installed`, …), or NULL for
   * a legacy v1 row. When `code` is non-null the UI renders from code+params via
   * lib/i18n/activity.ts and IGNORES `text`.
   */
  code: varchar("code", { length: 48 }),
  /**
   * Interpolation values. UNTRUSTED runtime data, interpolated as ESCAPED DATA in all four
   * renderings — a params.name of `</span><script>` is a string, not markup. §13.12.
   */
  params: jsonb("params").$type<ActivityParams>().notNull().default({}),
  runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "set null" }),

// usage_records — so a credit line can name the run it paid for
  runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
```

```sql
ALTER TABLE "agent_activities" ADD COLUMN "code" varchar(48);--> statement-breakpoint
ALTER TABLE "agent_activities" ADD COLUMN "params" jsonb NOT NULL DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "agent_activities" ADD COLUMN "run_id" uuid
  REFERENCES "agent_runs"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "run_id" uuid
  REFERENCES "agent_runs"("id") ON DELETE SET NULL;
```

**`agent_activities.text` stays `NOT NULL` and is written as `''` when `code` is set.** That is not
laziness — it is conflict **C8**. ArkAgent does **not** render the sentence at ingest, because
ArkAgent's i18n is client-side and one activity row is read by workspace members using up to four
different languages. Rendering once at write time freezes one of them into the row forever, which is
the exact defect the v2 event exists to fix. `code = 'custom'` is the only case that uses `text`,
rendered verbatim, marked agent-authored, never localised.

**`ON DELETE SET NULL` on both `run_id`s, deliberately.** The run prune (§14.2) deletes runs at 400
days while `usage_records` is kept indefinitely (financial history, §14.1). `cascade` there would
delete billing history to save space on a step trace, which is the worst possible trade; `restrict`
would make the prune impossible. `set null` loses the correlation and keeps the fact, which is the
right half to lose. `agent_activities` is on the same 400-day window as `agent_runs` on purpose
(§14.8), so in practice its `run_id` is nulled only by an out-of-band delete.

**No new index on either `run_id` column.** `agent_activities.run_id` is read only when a run
detail drawer is already open on a known run (a handful of rows), and `usage_records.run_id`
likewise. Both queries reach the row through their existing agent/workspace-leading indexes first.

### 12.1 The Activity indexes — also 0012, and they are not optional

An earlier draft of this section said "no new index" full stop. That was wrong:
`HARNESSES_AND_ACTIVITY.md` §5.4 specifies three index changes on `agent_activities` and
`agent_runs`, assigns them to this same migration ("an index on those same columns belongs in the
same file by construction"), and every Activity view's stated plan depends on them. They are
reproduced here so that `lib/db/schema.ts` and `0012` agree; that document remains the authority on
*why*, and on the filter semantics they serve.

```ts
// lib/db/schema.ts — REPLACES the existing (t) => [...] array on agentActivities.
  (t) => [
    /**
     * The timeline keyset. SUPERSEDES agent_activities_agent_idx (lib/db/schema.ts:448), which is
     * a strict prefix of this and therefore pure overhead once this exists. `id DESC` is load-
     * bearing: the cursor is the row comparison `(occurred_at, id) < ($t, $i)`, and without `id`
     * the tiebreak is a heap filter on the busiest page of the busiest agent.
     */
    index("agent_activities_agent_time_idx").on(t.agentId, t.occurredAt.desc(), t.id.desc()),
    /** Severity and event-type filters expand to `code = ANY($codes)`. */
    index("agent_activities_agent_code_idx").on(t.agentId, t.code, t.occurredAt.desc()),
  ],
```

```sql
CREATE INDEX "agent_activities_agent_time_idx"
  ON "agent_activities" ("agent_id","occurred_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX "agent_activities_agent_code_idx"
  ON "agent_activities" ("agent_id","code","occurred_at" DESC);--> statement-breakpoint
-- Dropped LAST, after both replacements exist, so no window has the timeline unindexed.
DROP INDEX "agent_activities_agent_idx";
```

`agent_runs`' two additions (`agent_runs_agent_idx` widened with `id DESC`, and the partial
`agent_runs_agent_failed_idx`) are declared with the table in §10.1 rather than here, because
`agent_runs` is created in this same migration and there is no existing index to replace.

**`agent_activities_sweep_idx` is deliberately still absent.** §14.8's retention pass scans by age
across agents and neither of the two indexes above can serve it. At 2,000 agents a nightly
sequential scan of ~15M rows is tolerable; past ~5,000 agents it is not, and the trigger condition
is written down in §14.8 rather than paid for now.

---

## 13. Every JSONB payload, as a TypeScript interface

Nineteen new `jsonb` columns. Every one is `$type<>`-annotated, and every type below is
**client-safe** — no `server-only`, no `db` import — because `lib/db/schema.ts` imports them by
`import type`, exactly as it already does for `StoredAgentSettings` (`lib/db/schema.ts:32`, beside `HARNESS_IDS` at `:33`), and
because the template editor's live preview and the skills drawer render these shapes in the browser.

| Module | Types |
|---|---|
| `lib/skills/types.ts` | `SyncStats`, `HarnessCompat`, `HarnessCompatMap`, `SkillRequirements`, `SkillPermissions`, `SkillInstall`, `RiskSignal`, `SkillVersionRef`, `SkillConfig` |
| `lib/atg/types.ts` | `AgentTemplateDraft` and its whole tree, `DraftStageTrace`, `DraftWarning`, `InjectionFinding`, `DraftProvenance` |
| `lib/runtime/types.ts` | `ActivityParams`, `ImprovementProposal` |

**"Client-safe" is a constraint on their imports, and two of them break it unless something is
moved.** `HarnessCompatMap` needs `Harness` and `TemplateAgent` needs `ChannelType`.

- `Harness` is already fine: import it from `@/lib/harness`, which is client-safe by construction
  and by its own header. **Never** from `lib/db/schema.ts`.
- `ChannelType` has **no client-safe home today.** It exists only as
  `(typeof channelTypeEnum.enumValues)[number]`, and `channelTypeEnum` lives in `lib/db/schema.ts`,
  so importing it from `lib/atg/types.ts` drags Drizzle and `postgres` into the template editor's
  browser bundle — the exact failure `lib/harness/index.ts` was carved out to prevent.
  **`HARNESSES_AND_ACTIVITY.md` §1.3.1(a) reaches the identical conclusion and names the file
  `lib/channels.ts`, under task W0-4b (folded into W0-4).** That path and that task win over an
  earlier draft of this document's `lib/channels/types.ts` under W0-7: a client-safe types module
  does not belong in the migration task, and one flat file needs no `index.ts` re-export.
  Recorded as conflict **C15** in `TASK_PLAN_V2.md` §1.

  ```ts
  // lib/channels.ts — client-safe: no server-only, no db import.
  export const CHANNEL_TYPE_IDS = [
    "telegram", "whatsapp", "wechat", "line", "slack", "email", "web",
    "feishu", "dingtalk", "wecom",
  ] as const;
  export type ChannelType = (typeof CHANNEL_TYPE_IDS)[number];
  ```

  and `lib/db/schema.ts` builds the pgEnum from it — `pgEnum("channel_type", CHANNEL_TYPE_IDS)` —
  exactly as it already does for `HARNESS_IDS`, so the list stays declared once. The order is the
  enum's on-disk order and is append-only.

`$type<T>()` is a compile-time assertion, not a runtime one. **Every one of these is Zod-validated
at the write boundary** — `lib/atg/schema.ts` for the draft, `lib/skills/schema.ts` for the skill
blobs, the event validator for the runtime ones. A `jsonb` column with a `$type` and no parser is a
column that lies in the type system.

### 13.1–13.9 · `lib/skills/types.ts` and `lib/runtime/types.ts`

```ts
/** skill_sources.last_sync_stats — every value is a count except durationMs. */
export interface SyncStats {
  fetched?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  blocked?: number;
  durationMs?: number;
}

/**
 * skills.harness_compat. Why we believe a skill runs on a harness.
 * `declared` = the publisher says so · `verified` = we installed it there ·
 * `inferred` = the §2.3 rubric derived it from `requirements` ·
 * `unknown` = nobody asserted anything, which renders as "untested", NOT as a green tick.
 */
export type CompatBasis = "verified" | "declared" | "inferred" | "unknown";

export interface HarnessCompat {
  supported: boolean;
  basis: CompatBasis;
  /** Sanitized, ≤160 chars. e.g. "needs the OpenClaw `slack` tool". */
  note?: string;
}

export type HarnessCompatMap = Partial<Record<Harness, HarnessCompat>>;

/**
 * skills.requirements. OpenClaw's `metadata.openclaw.requires.{bins,env,config}` + `os`, adopted
 * verbatim. `env` holds variable NAMES only — never values.
 */
export interface SkillRequirements {
  /** Binaries that must be on PATH: ["gh"], ["node","npx"]. */
  bins?: string[];
  /** Env var names the skill reads: ["GITHUB_TOKEN"]. Names only. */
  env?: string[];
  /** Harness-specific HOST capabilities: ["openclaw.tool.slack"], ["mcp.client"]. */
  config?: string[];
  /** ["darwin","linux"] — absent means any. */
  os?: string[];
}

/**
 * skills.permissions. The authority a skill asks for, normalized so it can be DIFFED against
 * AgentSettings.tools rather than mapped to it.
 */
export interface SkillPermissions {
  /** Keys are exactly AgentSettings["tools"] keys, so reconciliation is a set operation. */
  tools?: Array<"shell" | "files" | "browser" | "docker" | "code">;
  /** `arbitrary` forces the risk band to ≥ medium. */
  network?: "none" | "public-read" | "declared-hosts" | "arbitrary";
  /** Hosts the skill legitimately talks to. A fetch outside this set is the +4 risk signal. */
  hosts?: string[];
  filesystem?: "none" | "workspace-read" | "workspace-write" | "host-read" | "host-write";
  /** Credential scope in one phrase: "gh CLI (full user scope)", "Notion workspace token". */
  credentials?: string[];
  /** True when the skill can take an action a human cannot undo: send, publish, pay, apply. */
  irreversible?: boolean;
}

/** skills.install. How the runtime obtains the body. Discriminated on `mode`. */
export type SkillInstall =
  | { mode: "registry"; registry: "clawhub"; ref: string; version: string }
  | { mode: "git"; repo: string; ref: string; subdir: string }
  | { mode: "inline"; sha256: string; bytes: number }
  | { mode: "mcp_stdio"; command: string; args: string[]; env: string[] }
  | { mode: "mcp_http"; url: string; headerEnv: string[] };

/** skills.risk_signals — the individual rubric triggers, rendered in the drawer as prose. */
export interface RiskSignal {
  /** Stable machine code, and the i18n key for the sentence: "vendor_publisher". */
  code: string;
  delta: number;
  /** Sanitized detail, ≤200 chars. Rendered as TEXT, never as markup. */
  detail?: string;
}

/** skills.known_versions — last ≤20, newest first, bounded on write. */
export interface SkillVersionRef {
  version: string;
  publishedAt: string | null;
  sha256: string | null;
  riskLevel: "low" | "medium" | "high" | null;
}

/**
 * agent_skills.config. A record, not an interface, because the keys are the skill's own env var
 * names. The constraint that matters is negative and is enforced by an explicit Zod `.check()`:
 * NO key may match SECRET_KEYS (/token|secret|key|appsecret|password/i, exported from
 * lib/serializers.ts:107 — a module-private `const` today; W2-7 adds the `export` keyword to it,
 * so there is one definition and not two that drift). `.strict()` is a no-op
 * on a z.record and is NOT the mechanism.
 */
export type SkillConfig = Record<string, string>;

/**
 * agent_activities.params. Interpolation values for the localised template keyed by
 * agent_activities.code. UNTRUSTED runtime data: escaped at render in all four languages.
 * A union of primitives, not `unknown`, so a renderer can never be handed an object to stringify.
 *
 * `string | number` and NOT `| boolean` — HARNESSES_AND_ACTIVITY §9 types it this way and it owns
 * the code registry, every template, and every params column in that registry. An earlier draft
 * here added `boolean`, which is worse than merely inconsistent: `true` has no localisation, so a
 * boolean param renders as the English word "true" in the 日本語 UI. A flag belongs in the `code`
 * (two codes, two sentences), not in `params`. The event validator REJECTS a boolean param with
 * `rejected: invalid_param_type` rather than coercing it.
 */
export type ActivityParams = Record<string, string | number>;

/**
 * agent_improvements.proposal. A machine-applicable description of a config change, applied ONLY
 * on human approval and applied BY ArkAgent — data describing a change, never a command that
 * executes on receipt. The union is closed; an unknown shape is stored and shown but is NOT
 * offered as a one-click apply, which is what `unknown` below represents at the parse boundary.
 */
export type ImprovementProposal =
  | { appendRule: string }
  | { appendInstruction: string }
  | { attachSkill: { publicId: string; version: string | null; reason: string } }
  | { addSchedule: { name: string; cron: string; timezone: string; prompt: string } }
  | { patchSettings: { autonomy?: Autonomy; temperature?: number; heartbeatMinutes?: number } };
// Tone, ResponseLanguage, Autonomy, ReasoningEffort and AgentSettings are imported from
// lib/agent-settings.ts (:14-17, :123); ChannelType from the channelTypeEnum union. The
// patchSettings arm spells its three keys out rather than Partial<Pick<…>> so that the arm cannot
// be satisfied by {} — a discriminated union whose members are all-optional is not discriminated.
```

### 13.10 · `AgentTemplateDraft` — `agent_templates.draft` and `template_generations.draft`

The single largest blob in the schema, and the one the "everything a backend service needs must be
readable from Postgres alone" constraint rests on. Prose for each field is
`AGENT_TEMPLATE_GENERATOR.md` §3.1–§3.7; the Zod mirror is `lib/atg/schema.ts` §3.8.

```ts
export interface AgentTemplateDraft {
  /** Bumped only on a breaking change. A row with an unknown version 409s at materialize. */
  schemaVersion: 1;
  /** The language every human-visible string below is WRITTEN IN. Not the viewer's language. */
  locale: "en" | "zh" | "zht" | "ja";
  harness: Harness;
  meta: TemplateMeta;
  roles: TemplateRole[];            // 1..3
  agents: TemplateAgent[];          // 1..3
  skills: TemplateSkill[];          // 0..12
  boundaries: TemplateBoundaries;
  context: TemplateContextItem[];   // 0..8
  schedules: TemplateSchedule[];    // 0..8
  provenance: DraftProvenance;
}

export type TemplateCategory =
  | "sales" | "support" | "marketing" | "operations" | "finance"
  | "research" | "engineering" | "hr" | "personal" | "other";

export interface TemplateMeta {
  name: string;                     // display name in `locale`
  slug: string;                     // URL-safe ASCII, unique per workspace
  summary: string;                  // one gallery line, in `locale`
  description: string;              // 2–5 sentences, in `locale`, plain prose
  category: TemplateCategory;
  tags: string[];                   // ≤8 kebab-case, ENGLISH, for filtering and search
  /** 1–2 code points. agent_templates.mono is varchar(8) so the column has headroom. */
  mono: string;
  hue: string;                      // "#rrggbb", from lib/theme roleHue values
  minPlan: "associate" | "professional" | "director";
  /** Schedules/month × per-run estimate + heartbeat cost. COMPUTED, never model-authored. */
  estimatedCreditsPerMonth: number;
}

export type MetricUnit = "percent" | "count" | "currency" | "duration" | "ratio" | "text";
export interface TemplateMetric { label: string; target: string; unit: MetricUnit }

export interface TemplateRole {
  key: string;                      // draft-local join key
  /** agent_roles.id, or null for a role with no catalogue equivalent. */
  baseRoleId: string | null;
  title: string;
  mission: string;
  responsibilities: string[];
  successMetrics: TemplateMetric[];
  stakeholders: string[];
  handoffs: string[];
}

export interface TemplateAgentSettings {
  tone: Tone;
  responseLanguage: ResponseLanguage;
  timezone: string;                 // IANA, validated with isValidTimeZone()
  alwaysOn: boolean;
  workStart: string;                // "HH:MM"
  workEnd: string;                  // "HH:MM"
  workDays: number[];               // 0=Sun … 6=Sat
  heartbeatMinutes: number;         // 1..1440
  temperature: number;              // 0..1
  maxTokens: number;                // 256..200000
  reasoningEffort: ReasoningEffort;
  memoryEnabled: boolean;
  selfImprove: boolean;
  autoCreateSkills: boolean;
  notifyNeedsReview: boolean;
  notifyErrors: boolean;
  dailyDigest: boolean;
  digestTime: string;               // "HH:MM"
}

export interface TemplateTask { text: string; meta: string | null; sortOrder: number }

export interface TemplateAgent {
  key: string;
  roleKey: string;                  // → TemplateRole.key
  name: string;
  harness: Harness;
  isPrimary: boolean;
  brief: string;                    // → agents.instructions
  settings: TemplateAgentSettings;
  tools: { shell: boolean; files: boolean; browser: boolean; docker: boolean; code: boolean };
  channels: ChannelType[];
  tasks: TemplateTask[];
  skillKeys: string[];              // → TemplateSkill.key
  scheduleKeys: string[];
  contextKeys: string[];
}

export interface TemplateSkill {
  key: string;
  /** skills.id. Null only in a deterministic-fallback draft with no catalogue match. */
  skillId: string | null;
  source: string;                   // skills.source_id
  ownerHandle: string | null;
  slug: string;
  /** Null ⇒ re-resolve against skills.latest_version at materialize. NEVER the string "latest". */
  version: string | null;
  displayName: string;
  purpose: string;                  // template-level explanation; NO agent_skills column
  riskLevel: "low" | "medium" | "high";
  riskAccepted: boolean;
  /** Always true — §3.8 makes anything else unrepresentable. → agent_skills.compat_asserted. */
  harnessCompatible: boolean;
  requirements: SkillRequirements;
  required: boolean;                // drives the "missing skill" warning; NO column
  rankScore: number;                // audit trail for §5.3's ranking
  rankReasons: string[];
}

export type RuleCategory =
  | "money" | "external_comms" | "data" | "scope" | "quality" | "legal" | "safety" | "schedule";

export interface TemplateRule {
  text: string;                     // ≤200, imperative, in `locale`
  severity: "hard" | "soft";        // "hard" is prefixed NEVER/ALWAYS by renderRules()
  category: RuleCategory;
}

export interface TemplateBoundaries {
  autonomy: Autonomy;
  /** Whole USD in APPROVAL_CURRENCY, deliberately independent of the viewer's display currency. */
  approvalAmountUsd: number;
  approveExternalSends: boolean;
  /** 0 = unlimited. The linter refuses 0 when autonomy is "auto". */
  dailyActionLimit: number;
  rules: TemplateRule[];            // 3..12
  prohibitions: string[];           // ≤10, ≤200 chars each, in `locale`
  escalation: {
    /**
     * Typed `null`, not `string | null`, ON PURPOSE: a model that emits an address here has either
     * hallucinated one or lifted one out of the user's brief, and both write a stranger's address
     * into an agent's notification config. The UI collects it after materialization.
     */
    to: null;
    triggers: string[];             // ≤6 situations, in `locale`
    channel: "email" | "chat" | "none";
  };
  dataHandling: { piiAllowed: boolean; retentionDays: number; redactFields: string[] };
  spend: { monthlyCreditCap: number };   // 0 = use the plan allowance
}

export type ContextKind = "pasted_text" | "file_request" | "url";

export interface TemplateContextItem {
  key: string;
  kind: ContextKind;
  title: string;                    // ≤80, in `locale`  → agent_context_items.name
  purpose: string;                  // ≤200, in `locale`; NO column
  required: boolean;                // NO column — drives the "what this agent still needs" list
  body: string | null;              // pasted_text only, ≤8000 → text_body
  /**
   * url only. https, no userinfo, not private/link-local/loopback. Validated by
   * isSafePublicHttpsUrl(), not by z.url() alone: the AGENT RUNTIME fetches this, and a
   * model-authored link-local address in a template is an SSRF payload we shipped.
   */
  url: string | null;
  acceptedMimeTypes: string[];      // file_request only; intersected with CONTEXT_MIME_ALLOWLIST
  maxBytes: number | null;          // file_request only; default 10 MiB, ceiling 20 MB
  placeholder: string | null;
  containsPii: boolean;             // set by the LINTER, not the model
}

export type SchedulePayloadKind = "task" | "digest" | "check" | "reminder";

export interface TemplateSchedule {
  key: string;
  agentKey: string;
  title: string;                    // ≤80, in `locale`  → agent_schedules.name
  kind: "recurring" | "one_off" | "reminder";
  cron: string;                     // 5-field, validated by isValidCron() before it reaches here
  timezone: string;                 // IANA, validated by isValidTimeZone()
  /** "YYYY-MM-DD" in `timezone` for one_off, else null. Why a one-off still carries a cron. */
  onDate: string | null;
  payloadKind: SchedulePayloadKind;
  prompt: string;                   // ≤600, in `locale`
  deliverTo: "chat" | "email" | "channel" | "none";
  catchUpPolicy: "skip" | "run_once";
  enabled: boolean;
  maxRunsPerDay: number;            // 1..288; the generator never proposes above 96
  source: "user_phrase" | "deterministic" | "llm";
  confidence: number;               // 0..1
  /** From describeCron(cron, locale). NEVER model-authored, and RE-DERIVED on read. */
  humanReadable: string;
}
```

### 13.11 · Provenance — also `template_generations.stage_traces` / `.warnings` / `.injection_findings`

```ts
export type StageId =
  | "intake" | "charter" | "capabilities" | "skills" | "boundaries"
  | "context" | "schedules" | "assemble" | "lint" | "finalize";

export type StageOutcome = "ok" | "repaired" | "fallback" | "skipped" | "failed";

export interface DraftStageTrace {
  stage: StageId;
  engine: "rules" | "llm" | "db" | "mixed";
  model: string | null;
  startedAt: string;                // ISO 8601
  durationMs: number;
  attempts: number;
  outcome: StageOutcome;
  promptTokens: number;
  completionTokens: number;
  /** Normalized class from classifyLlmError(); NEVER a provider message. */
  errorCode: string | null;
}

export type WarningSeverity = "info" | "warn" | "error";

export interface DraftWarning {
  code: string;                     // "ATG-L001"; the localized copy lives in lib/i18n/templates.ts
  severity: WarningSeverity;
  path: string;                     // JSON pointer, e.g. "/boundaries/approvalAmountUsd"
  message: string;                  // English, for logs
  remediation: string | null;
  remediated: boolean;
}

export interface InjectionFinding {
  /** "override" | "exfil" | "hidden_text" | "encoded_blob" | "role_play" | "tool_grab" */
  pattern: string;
  offset: number;                   // byte offset into the NORMALIZED brief
  excerpt: string;                  // ≤80 chars, for the audit trail
  severity: WarningSeverity;
}

export interface DraftProvenance {
  generationId: string;
  mode: "llm" | "hybrid" | "deterministic";
  stages: DraftStageTrace[];
  briefSha256: string;
  warnings: DraftWarning[];
  injectionFindings: InjectionFinding[];
  materializable: boolean;
}
```

`template_generations.stage_traces`, `.warnings` and `.injection_findings` hold the same arrays as
`draft.provenance.{stages,warnings,injectionFindings}`. That is a deliberate duplication, not an
oversight: the generation row is written **incrementally, one update per stage**, so a generation
that dies before stage 7 has no `draft` at all and its trace must live outside it. Once the draft
exists the two agree, and `lib/atg/finalize.ts` writes them from one source. A test asserts equality
for any row where `draft IS NOT NULL`.

### 13.12 · The existing blobs, unchanged

`agents.settings` (`StoredAgentSettings`, `lib/agent-settings.ts`), `channels.config`,
`plans.features`, `agent_manager_config.config`, `payment_orders.provider_payload` and
`payment_events.payload` are untouched by v2. `agents.settings` is listed here only because
`BACKEND_INTEGRATION_CONTRACT.md` §2.3 makes it part of the manifest and because
`AgentSettings.skills[]` becomes a **mirror** of `agent_skills` (SKILL_REPOSITORY §2.5) — read from
the join, never from the blob, with the blob kept in sync for backwards compatibility.

---

## 14. Retention and pruning

### 14.0 Where it runs, and why it is one script

**Two cron entries in `vercel.json`, and no more**, because `TASK_PLAN_V2.md` §8.2 item 6 records
that the Vercel plan is undecided and Hobby allows **two daily cron jobs**:

| Entry | Schedule | Purpose |
|---|---|---|
| `/api/cron/schedules` | `* * * * *` (needs Pro) | The schedule tick. Not a retention job. |
| `/api/cron/sweep` | `0 3 * * *` | Every pass below, in order, in one invocation. |

The sweep route is `app/api/cron/sweep/route.ts` and its task is **W5-8** —
`HARNESSES_AND_ACTIVITY.md` §7.2 named and numbered it first, and an earlier draft of this section
invented a second name (`/api/cron/nightly`) for the same endpoint. One name. It exports **`GET`**,
not `POST`: Vercel Cron invokes the path with a GET, so a `POST`-only handler is a 405 every night
with nothing but a platform log to say so. (§7.2 there says `POST`; this is the one place this
document overrides it, and the reason is the platform, not taste.)

**The ATG expiry sweep is Pass 5a of this job and has no cron entry of its own.** §8.1 above once
described it as "`scripts/atg-sweep.ts` from a Vercel Cron entry at `0 3 * * *`", which is a third
daily entry the Hobby plan does not allow and a second script doing what this one already does.
`scripts/atg-sweep.ts` may exist as a hand-runnable wrapper around the same function; it does not
get a `vercel.json` entry.

Both entries authenticate with a `CRON_SECRET` bearer compared with `timingSafeEqual`, and **fail
closed when the secret is unset**. The `x-vercel-cron` header is not authentication: it is
client-settable on a public URL, i.e. an unauthenticated write to tables every customer reads. The
sweep additionally claims its work with `FOR UPDATE SKIP LOCKED` so that a manual invocation
overlapping the platform tick cannot double-run a pass.

**Every DELETE below is batched.** An unbounded `DELETE` on a table with 100M rows takes a lock for
minutes and can exceed the function's `maxDuration` mid-transaction. The shape is always:

```sql
DELETE FROM <table>
WHERE ctid IN (SELECT ctid FROM <table> WHERE <predicate> LIMIT 5000);
```
repeated until it reports 0 rows or the pass's time budget (20 s) expires. `ctid` rather than `id`
because the subquery then needs no index lookup to re-find the row it just found. A pass that runs
out of budget resumes tomorrow; nothing here needs to complete in one night.

### 14.1 What is never pruned, and why

| Table | Policy | Reason |
|---|---|---|
| `skill_sources` | never | 8 reference rows. |
| `skills` | **never hard-deleted** | A catalogue row that vanishes takes its `agent_skills` FK with it (`restrict` refuses, so the delete simply fails). Withdrawal is `status='deprecated'` or `status='blocked'` + `blocked=true`; both keep the row addressable by every attachment that pinned it. |
| `agent_skills` | never | Detach sets `enabled=false, state='removing'`. A hard delete would 404 its own confirmation webhook, and the row is the audit record of what was once installed. |
| `agent_templates` | never | `archived_at` is the soft delete. A materialized agent's `origin_ref` points here. |
| `agent_context_items` | never | The user's own documents. They live exactly as long as the agent (`ON DELETE cascade`), and a `removed` row is retained so the runtime's declarative reconciliation can see the removal rather than infer it from absence. |
| `usage_records`, `invoices`, `llm_usage` | out of scope | Financial history. Any policy here is a legal decision, not an engineering one. |

### 14.2 `agent_runs` — 400 days

```sql
-- Pass 3, after the step prune (a run may not be deleted while its steps still exist; the
-- cascade would make the batched step prune pointless).
DELETE FROM agent_runs
WHERE ctid IN (
  SELECT ctid FROM agent_runs
  WHERE steps_pruned_at IS NOT NULL
    AND started_at < now() - interval '400 days'
  LIMIT 5000
);
```
**Index:** `agent_runs_purge_idx` — `(started_at) WHERE steps_pruned_at IS NOT NULL`, a pure range
scan over exactly the eligible rows.
**Cascade:** `agent_run_steps.run_id` is `cascade` (already empty), `agent_schedule_runs.run_id` and
`agent_activities.run_id` and `usage_records.run_id` are all `set null` — the correlation is lost,
the billing and activity facts are kept. That asymmetry is the whole point of §12's FK choices.

### 14.3 `agent_run_steps` — 90 days

The highest-volume table and the one that decides whether this schema scales. Two statements, one
transaction per batch, so a crash never leaves a run marked pruned with its steps still present:

```sql
-- Pass 2. Driven from the RUN table, not from agent_run_steps, so no fourth index is needed on
-- the highest-write table in the schema.
WITH aged AS (
  SELECT id FROM agent_runs
  WHERE steps_pruned_at IS NULL
    AND started_at < now() - interval '90 days'
  ORDER BY started_at
  LIMIT 500
), gone AS (
  DELETE FROM agent_run_steps WHERE run_id IN (SELECT id FROM aged)
)
UPDATE agent_runs SET steps_pruned_at = now() WHERE id IN (SELECT id FROM aged);
```
**Indexes:** `agent_runs_steps_prune_idx` for the driver; `agent_run_steps_run_idx` `(run_id, idx)`
for the delete. 500 runs per batch rather than 5,000 because each run carries ~25 steps, so a batch
is already ~12,500 row deletions.

**Windows are `HARNESSES_AND_ACTIVITY.md` §7.2's — 90 days for steps, 400 for runs.** `steps_pruned_at`
and the two complementary partial indexes are this document's addition on top of them, and they are
what makes the pass terminate: without the marker the driver re-selects the same aged runs every
night for as long as `agent_runs` retains them — now **310 days** of index entries between the step
window and the run window, not five months — to discover nothing to do. With it, each run is visited
once and the driver index drains.

**The run detail drawer must render `steps_pruned_at` honestly** — "step trace pruned after 90 days"
— rather than an empty trace, which reads as a bug and generates the support ticket the retention
was supposed to save.

### 14.4 `agent_health_samples` — 14 days raw, then hourly rollup, in place

```sql
-- Pass 4a. Mock samples are SWEPT, never rolled up: averaging simulator output into a real
-- agent's history is the exact thing TASK_PLAN_V2 §8.1 "Data and truth" forbids.
DELETE FROM agent_health_samples
WHERE ctid IN (
  SELECT ctid FROM agent_health_samples
  WHERE source = 'mock' AND sampled_at < now() - interval '2 days'
  LIMIT 5000
);

-- Pass 4b. Roll up one hour-bucket at a time, oldest first, IN PLACE.
--
-- THE CUTOFF IS TRUNCATED TO AN HOUR BOUNDARY AND THAT IS NOT COSMETIC. An earlier version of
-- this statement selected buckets with `sampled_at < now() - interval '14 days'` while the
-- `cleared` arm deleted the WHOLE hour [h, h+1h). Whenever the cutoff fell mid-hour — which it
-- does 59 minutes out of every 60 — the samples in the same bucket that were NEWER than the
-- cutoff were deleted without ever being aggregated. VERIFIED on 15.13: 12 five-minute samples
-- spanning the cutoff hour produced ONE rollup row averaging only the 3 eligible samples, and
-- the other 9 were destroyed and are in no average anywhere.
--
-- date_trunc'ing the cutoff makes every selected bucket wholly older than it, so `bucket` and
-- `cleared` cover exactly the same rows. ORDER BY is required too: LIMIT 500 without one picks
-- an arbitrary 500 buckets, so "oldest first" was a comment describing nothing.
WITH cutoff AS (
  SELECT date_trunc('hour', now() - interval '14 days') AS t
), bucket AS (
  SELECT agent_id, date_trunc('hour', sampled_at) AS h,
         round(avg(cpu_percent))::int          AS cpu_percent,
         round(avg(memory_bytes))::bigint      AS memory_bytes,
         max(memory_limit_bytes)               AS memory_limit_bytes,
         max(disk_used_bytes)                  AS disk_used_bytes,
         max(uptime_seconds)                   AS uptime_seconds,
         round(avg(active_runs))::int          AS active_runs,
         (array_agg(state ORDER BY sampled_at DESC))[1] AS state
  FROM agent_health_samples, cutoff
  WHERE source = 'runtime' AND sampled_at < cutoff.t
  GROUP BY agent_id, date_trunc('hour', sampled_at)
  ORDER BY 2
  LIMIT 500
), cleared AS (
  DELETE FROM agent_health_samples s
  USING bucket b
  WHERE s.agent_id = b.agent_id
    AND s.sampled_at >= b.h AND s.sampled_at < b.h + interval '1 hour'
    AND s.source = 'runtime'
)
INSERT INTO agent_health_samples
  (agent_id, sampled_at, state, cpu_percent, memory_bytes, memory_limit_bytes,
   disk_used_bytes, uptime_seconds, active_runs, source)
SELECT agent_id, h, state, cpu_percent, memory_bytes, memory_limit_bytes,
       disk_used_bytes, uptime_seconds, active_runs, 'rollup'
FROM bucket
ON CONFLICT (agent_id, sampled_at) DO UPDATE SET
  cpu_percent = excluded.cpu_percent, memory_bytes = excluded.memory_bytes,
  memory_limit_bytes = excluded.memory_limit_bytes,
  disk_used_bytes = excluded.disk_used_bytes, uptime_seconds = excluded.uptime_seconds,
  active_runs = excluded.active_runs, state = excluded.state, source = 'rollup';

-- Pass 4c. Rollup rows themselves, at 400 days.
DELETE FROM agent_health_samples
WHERE ctid IN (SELECT ctid FROM agent_health_samples
               WHERE source = 'rollup' AND sampled_at < now() - interval '400 days' LIMIT 5000);
```
**Index:** `agent_health_samples_sweep_idx` `(sampled_at)` for every pass; the unique
`(agent_id, sampled_at DESC)` for the `ON CONFLICT` target and the delete's row lookup.

**What the `ON CONFLICT` is actually for.** Not "re-running the job upserts rather than
duplicating" — a second run finds nothing, because `bucket` selects only `source = 'runtime'` and
the rollup row is `source = 'rollup'`. The arbiter earns its place in the one case that does
collide: a raw sample sitting exactly on the hour boundary of a bucket that a previous, partial run
already rolled up. Without `ON CONFLICT` that batch aborts with a unique violation and the pass
wedges at the same bucket every night. Note also that `cleared`'s DELETE is **not** visible to the
INSERT's snapshot; the unique index still resolves it correctly because the deleted tuple is dead to
the current command. Verified on 15.13 — a bucket containing a sample at `h` rolls up cleanly.
`DO NOTHING` would be wrong here: it would keep the raw sample's values under a `rollup` label.

**In place rather than a second table.** `BACKEND_INTEGRATION_CONTRACT.md` §3.4 says samples are
"rolled up to hourly averages" and never says where. A separate `agent_health_hourly` would be a
thirteenth v2 table, would double the sparkline query into a UNION, and would need its own retention.
Rolling up in place costs one extra `source` value and makes the sparkline query — `WHERE
agent_id = $1 AND sampled_at > $2 ORDER BY sampled_at DESC` — work unchanged across the boundary,
with `source` available if the UI wants to draw the older half differently. The cost is honest:
resolution silently changes at 14 days, so the chart must label its own x-axis.

### 14.5 `template_generations` — redact at 7 days, purge at 90

```sql
-- Pass 5a. Expire + REDACT. `brief` is NOT NULL, so this writes '', never NULL. brief_sha256
-- survives, which is what a support engineer needs and is not a description of a business.
UPDATE template_generations
SET status = 'expired', brief = '', updated_at = now()
WHERE status IN ('ready', 'needs_review')
  AND created_at < now() - interval '7 days';

-- Pass 5b. Purge the dead ends. `ready`/`materialized` rows are kept: they are the audit trail of
-- a template a customer is using.
DELETE FROM template_generations
WHERE ctid IN (
  SELECT ctid FROM template_generations
  WHERE status IN ('failed', 'expired', 'canceled')
    AND created_at < now() - interval '90 days'
  LIMIT 5000
);
```
**Index:** `template_generations_status_idx` `(status, created_at DESC)` for both — status-leading is
right, because neither pass is ever global-by-age.

Pass 5a and 5b **are** the ATG expiry sweep. §8.1 above also describes it, and its mention of
"`scripts/atg-sweep.ts` from a Vercel Cron entry at `0 3 * * *`" is a description of *this* pass, not
of a third cron entry — see §14.0. If the wrapper script exists, it calls the same function.

The 5-minute **stale sweep** (`queued`/`running` → `failed`, `error_code='stale_sweep'`) does *not*
live here. It runs in the rate-limit path of every generate request, as a statement of its own
before the counting query, because a workspace whose generation wedged needs it unwedged in seconds,
not at 03:00.

**Pass 5c — the schedule-tick repair sweep, and it is not optional.** §16.12's claim nulls
`next_run_at` before the fire, which is what keeps a third tick from re-selecting a row mid-flight.
The cost is that a tick killed between the claim and the write-back leaves a live recurring schedule
with `next_run_at IS NULL`, permanently outside `agent_schedules_due_idx`, and it never fires again
— silently, on a table the customer believes is a reminder. Nothing detects that but this:

```sql
-- Pass 5c. Recompute next_run_at for enabled recurring schedules that have lost it.
-- `kind <> 'once'` because a fired one-off legitimately ends with NULL and must stay there.
SELECT id, cron_expr, interval_seconds, kind, timezone, last_run_at
FROM agent_schedules
WHERE enabled AND next_run_at IS NULL AND kind <> 'once'
LIMIT 500;
-- then, per row, in TypeScript:  nextRun(cronExpr, now, timezone)   <- THREE arguments (§9.2)
-- and UPDATE agent_schedules SET next_run_at = $1 WHERE id = $2 AND next_run_at IS NULL;
```

The `AND next_run_at IS NULL` on the write is what stops the sweep from stamping over a value a
live tick has just written. A row whose expression genuinely never matches again (`0 0 30 2 *`)
gets `null` back, stays null, and is re-examined tomorrow at a cost of one index-free scan of a
table with a few thousand rows; that is cheap enough not to need a "we already checked" marker.

### 14.6 `agent_schedule_runs` — 180 days · `runtime_event_receipts` — 30 days

```sql
-- Pass 6.
DELETE FROM agent_schedule_runs
WHERE ctid IN (SELECT ctid FROM agent_schedule_runs
               WHERE scheduled_for < now() - interval '180 days' LIMIT 5000);
-- Index: agent_schedule_runs_agent_idx is agent-leading and cannot serve this. This pass is the
-- ONE place in §14 that has no dedicated index, deliberately: at ~24k rows/day the sequential
-- scan is seconds, and a third btree on the table costs more on every ingest than it saves. If
-- the fleet passes ~10× that, add `index("agent_schedule_runs_sweep_idx").on(t.scheduledFor)`.

-- Pass 1 (runs FIRST: it is the cheapest and the most time-sensitive — an unswept ledger is what
-- makes ingest slow down).
DELETE FROM runtime_event_receipts
WHERE ctid IN (SELECT ctid FROM runtime_event_receipts
               WHERE received_at < now() - interval '30 days' LIMIT 5000);
-- Index: runtime_event_receipts_received_idx.
```

**An event redelivered after 30 days is processed again.** That is the accepted consequence and the
contract states it to the runtime team as "do not retry for a month" (the retry policy tops out at
24 hours, so the window is 30× the maximum legitimate retry).

### 14.7 `agents.idempotency_key` — cleared at 24 hours

```sql
-- Pass 7.
UPDATE agents SET idempotency_key = NULL
WHERE idempotency_key IS NOT NULL AND updated_at < now() - interval '24 hours';
```
**Index:** `agents_idempotency_uniq`, whose partial predicate `WHERE idempotency_key IS NOT NULL` is
exactly the row set this scans. The clear is what stops a materialize key from becoming a permanent
join key on the agents table.

### 14.8 `agent_activities` — 400 days

```sql
-- Pass 8.
DELETE FROM agent_activities
WHERE ctid IN (SELECT ctid FROM agent_activities
               WHERE occurred_at < now() - interval '400 days' LIMIT 5000);
```

**400 and not 365, because it must equal `agent_runs`.** `HARNESSES_AND_ACTIVITY.md` §7.2 sets both
to 400 and gives the reason this document has no better answer to: the TIMELINE merges the two
tables, so unequal windows produce a band of history — 35 days wide, at 365/400 — where every run
renders with its activity rows silently missing, which reads as data loss rather than as retention.
400 is also a year plus a quarter, so a year-over-year comparison never straddles the boundary.

**Index:** after §12.1, `agent_activities`' indexes are `agent_activities_agent_time_idx` and
`_agent_code_idx`, both agent-leading, so this pass is still a sequential scan. Activities are
low-volume (a handful per run, not per step) and 400 days of them at 2,000 agents is ~17M rows — a
nightly seq scan of that is tolerable but not forever. **If the fleet grows past ~5,000 agents, add
`index("agent_activities_sweep_idx").on(t.occurredAt)` before the retention pass starts timing
out.** Written here rather than added now because an unused index on an append-heavy table is a real
cost and this one has a clear trigger condition.

### 14.9 Summary

| Table | Window | Driver index | Batched |
|---|---|---|---|
| `runtime_event_receipts` | 30 d | `runtime_event_receipts_received_idx` | yes |
| `agent_run_steps` | **90 d** | `agent_runs_steps_prune_idx` → `agent_run_steps_run_idx` | yes, 500 runs |
| `agent_runs` | **400 d** | `agent_runs_purge_idx` | yes |
| `agent_health_samples` (raw) | 14 d → rollup | `agent_health_samples_sweep_idx` | yes, 500 buckets |
| `agent_health_samples` (`mock`) | 2 d, never rolled up | `agent_health_samples_sweep_idx` | yes |
| `agent_health_samples` (`rollup`) | 400 d | `agent_health_samples_sweep_idx` | yes |
| `agent_schedule_runs` | 180 d | *(seq scan — see 14.6)* | yes |
| `template_generations` | redact 7 d, purge 90 d | `template_generations_status_idx` | yes |
| `agent_activities` | **400 d** | *(seq scan — see 14.8)* | yes |
| `agent_schedules.next_run_at` (repair) | nightly | *(seq scan, few thousand rows — 14.5 Pass 5c)* | 500/pass |
| `agents.idempotency_key` | 24 h | `agents_idempotency_uniq` | no (small) |
| everything else | never | — | — |

The three bold windows are `HARNESSES_AND_ACTIVITY.md` §7.2's, adopted here in place of the 30/180/365
an earlier draft invented while asserting the corpus was silent about them. `agent_schedule_runs` at
180 d is this document's, unopposed.

---

## 15. Idempotency and dedupe, table by table

Event delivery is **at-least-once and unordered**. Every table below therefore needs two things: a
guard that makes a redelivered event a no-op, and a rule for what happens when events arrive out of
order. The guards are layered:

- **Layer 1 — the ledger.** `runtime_event_receipts.event_id`, inserted `ON CONFLICT DO NOTHING …
  RETURNING` in the same transaction as the effects. No row back ⇒ duplicate ⇒ skip the effects,
  return 200. This covers every table and is the only guard some of them have.
- **Layer 2 — a natural key.** Five tables carry one. It is tighter than the ledger (it survives the
  30-day ledger sweep, and it catches a re-emitted event whose `eventId` was regenerated), and where
  both exist **both are honoured; the tighter one wins.**
- **Layer 3 — a staleness comparison.** Three writes are last-writer-wins by `occurredAt` against a
  stored timestamp, because they are *state assignments* rather than appends.

### 15.1 The table

| Table | Layer-2 natural key | Conflict action | Out-of-order rule |
|---|---|---|---|
| `runtime_event_receipts` | `event_id` (PK) | `DO NOTHING … RETURNING` | n/a — it *is* the guard |
| `agents.status` + `.last_error` | — | conditional `UPDATE` | **Layer 3**: `WHERE status_occurred_at IS NULL OR status_occurred_at < $occurredAt`. An older event is dropped and counted `rejected: stale`. This is why `status_occurred_at` had to be added (§3.2) — `updated_at` moves on unrelated writes and is not a substitute |
| `agents.last_heartbeat_at`, `.applied_config_revision` | — | conditional `UPDATE` | **Layer 3** against `last_heartbeat_at` |
| `agent_runs` | `(agent_id, external_run_id)` | `ON CONFLICT DO UPDATE` | `run_finished` before `run_started` ⇒ **create the row from the finish event**, with `started_at = finishedAt − durationMs`. This is why `durationMs` is REQUIRED on `agent.run_finished`; the "finishedAt − startedAt" fallback is circular. If `durationMs` is somehow absent: `started_at = finishedAt`, `duration_ms = 0`, row flagged reconcilable. A late `run_started` overwrites `started_at`, `trigger`, `trigger_ref`, `session_key`, `model` — and **only** those five |
| `agent_run_steps` | `(run_id, external_step_id)` | `DO NOTHING` | Unknown `runId` ⇒ create the run lazily: `status='running'`, `trigger='system'`, `started_at =` the **step's** `occurredAt`. Steps out of `index` order are stored as-is and **rendered by `idx`**, never by arrival order — which is why `idx` is required on the wire |
| `agent_schedule_runs` | `(schedule_id, scheduled_for)` | `DO UPDATE` with the §11.1 rank guard | A lower status rank never overwrites a higher one. `scheduled_for` is the *intended* instant, so jitter and delay cannot fork one occurrence into two rows |
| `agent_health_samples` | `(agent_id, sampled_at)` | `DO NOTHING` | Pure append; equal `sampled_at` from one agent is by definition the same observation. Layer 3 also applies to the *derived* "current health" read, which takes `ORDER BY sampled_at DESC LIMIT 1` rather than trusting arrival order |
| `messages` | `(agent_id, external_id)` | `DO NOTHING` | Was globally unique and silently dropped cross-tenant collisions; §3.4 fixes it. `external_id` is nullable and NULLs are distinct, so web messages are unaffected |
| `agent_activities` | **none** | plain `INSERT` | Ledger only. A genuine second occurrence of an identical line is a real event and MUST NOT be swallowed, which is exactly why `eventId` may not be a content hash. Append-only; sorted by `occurred_at` at render |
| `agent_metrics` | **none** | plain `INSERT` | Append-only; the UI reads the latest per `label` |
| `agent_improvements` | **none** | plain `INSERT` | Append-only, human-reviewed |
| `usage_records` | **none** | plain `INSERT` | **Ledger only, and this is the dangerous one.** Usage is additive and non-idempotent by nature: a duplicate that escapes the ledger bills the customer twice. The runtime is told to derive `eventId` from its own billing ledger's primary key, and `credits` is rejected if negative, non-integer, or > 1,000,000 (`rejected: implausible_usage`) |
| `llm_usage` | **none** | plain `INSERT` | Written alongside `usage_records` in the same transaction; same guard |
| `agent_skills.state` | `id` (the `agentSkillId` on the wire) | `UPDATE` by id | A **state assignment**, so redelivery is naturally idempotent. The 4-tuple on the event is a **drift check**, not a lookup: if it disagrees with what `agentSkillId` resolves to, the event is rejected `foreign_reference` rather than either side being trusted |
| `agent_context_items.state` | `id` | `UPDATE` by id | Same. Validated to belong to the event's agent; one that does not is `foreign_reference` |
| `agents.credits_used`, `workspaces.credits_used` | — | atomic `UPDATE … SET x = x + $n` | Increments, never read-modify-write. Same transaction as the `usage_records` insert and the receipt |
| `agents.last_error` (from `agent.error`) | — | conditional `UPDATE` | The contract's 16th event had no row here. **Layer 3 against `status_occurred_at`**, the same clock `agent.status` uses, because `agent.error` and `agent.status` both assign the same failure state and a stale `agent.error` must not overwrite a newer recovery. It does **not** advance `status_occurred_at` on its own — it only writes `last_error` — so a subsequent same-instant `agent.status` still lands |

Two of the contract's 16 events are absent from this table because they write no row of their own:
`agent.tool_call` is materialized as an `agent_run_steps` row with `phase = 'tool_call'` and takes
that row's `(run_id, external_step_id)` guard, and `agent.heartbeat` is the `agents` UPDATE two rows
above. Every other event maps to exactly one row here.

### 15.2 The three writers that are not the runtime

| Writer | Table | Key | Note |
|---|---|---|---|
| Skill sync | `skills` | `(source_id, owner_handle, slug)` → `skills_identity_uniq` | `ON CONFLICT DO UPDATE`, and it updates **upstream facts only**. `popularity`, `status`, `verified`, `reviewed_*` and `review_note` are curation and are never overwritten by a crawl. The lock that stops two syncs racing is `skill_sources.sync_lock_until`, a 15-minute *lease* released in a `finally` on success **and** on failure |
| ATG | `template_generations` | `template_generations_one_running` (partial unique on `workspace_id`) | The 409 comes from the constraint, not from a check that raced |
| Materialize | `agents` | `agents_idempotency_uniq` `(workspace_id, idempotency_key)` | A replayed `Idempotency-Key` finds the existing agent and returns `200 { agent, provisioned }` **without opening the transaction**. A missing header is a `400`: without it a double-click during a slow Manager call bills two seats, and inventing a key server-side would defeat the purpose |

### 15.3 The rule that ties them together

**The receipt insert and the effects commit in one transaction, and that transaction does no slow
work.** No HTTP call, no LLM call, no Manager round-trip inside it. Effects-first leaves a window
where a crash double-bills; receipt-first-separately leaves a window where a crash bills zero. One
transaction is the only shape with no window — and the reason the ingest handler queues anything
slow instead of doing it inline.

---

## 16. The read queries the new UI needs

Eighteen queries, in Drizzle, each naming the index it uses. `db` is the `postgres-js` instance;
all of these live in `lib/services/**` per the access rule, never in a component.

### 16.0 The two rules every query below obeys

**Rule 1 — tenancy is established before the query, not inside it.** None of `agent_skills`,
`agent_context_items`, `agent_schedules`, `agent_schedule_runs`, `agent_runs`, `agent_run_steps` or
`agent_health_samples` carries a `workspace_id`; they reach one only through `agents.workspace_id`.
So **every agent-scoped query below is preceded, in the same request, by
`const agent = await getAgentRow(agentId, ctx.workspace.id); if (!agent) return notFound();`** — a
`404`, never a `403` (`docs/API.md:40`), and `TASK_PLAN_V2.md` §8.1 makes it a release gate. A query
below that takes an `agentId` is showing the shape *after* that check; a query that takes a
**`runId` or a `scheduleId` instead of an `agentId` has no such check available and must therefore
scope itself with a join** — §16.14 and §16.16 do, and an earlier draft of both did not, which made
them straightforward IDORs: any signed-in user could read any workspace's run trace or schedule
history by id. The two catalogue queries (§16.1–16.5) and the public gallery (§16.10) are
deliberately cross-tenant; they are marked so.

**Rule 2 — never `db.select()` with no projection on `skills`.** `select()` expands to every column,
which puts `scanner_verdict` — whose own comment says *NEVER serialized*, because it is a raw
third-party scanner envelope — and the `search_tsv` blob on the wire for all 24 cards of every
browse page. Every query below names its columns. This is not a performance note; it is the reason
the column comment is enforceable.

### 16.1 Skills browse — the default grid (`skills_browse_idx`) · cross-tenant by design

```ts
/** The only projection the card and the drawer need. `scanner_verdict` and `search_tsv` are
 *  absent by construction, not by a downstream serializer's diligence. */
const SKILL_CARD_COLUMNS = {
  id: skills.id, publicId: skills.publicId, slug: skills.slug, name: skills.name,
  summary: skills.summary, category: skills.category, format: skills.format,
  tags: skills.tags, harnesses: skills.harnesses, riskLevel: skills.riskLevel,
  popularity: skills.popularity, publisherName: skills.publisherName,
  publisherVerified: skills.publisherVerified, sourceId: skills.sourceId,
  attributionUrl: skills.attributionUrl, latestVersion: skills.latestVersion,
  license: skills.license, stars: skills.stars, downloads: skills.downloads,
} as const;

const rows = await db
  .select(SKILL_CARD_COLUMNS)
  .from(skills)
  .where(and(
    eq(skills.status, "published"),
    eq(skills.blocked, false),
    includeHigh ? undefined : inArray(skills.riskLevel, ["low", "medium"]),
  ))
  .orderBy(desc(skills.popularity), asc(skills.id))
  .limit(24).offset(page * 24);
```
Keyset would be better than `offset` and is deliberately not used: the grid is 24 rows with a page
count, and `popularity DESC, id ASC` is exactly the index order, so offset 10 is ten index entries
skipped, not ten rows fetched. Revisit past ~50 pages.

`name`, `summary`, `tags` and `publisher_name` are **untrusted upstream text** (§5's "Presentation
(UNTRUSTED)" block). They are sanitized on ingest and rendered as text nodes — never as markup, and
never concatenated into a prompt as anything but quoted data.

### 16.2 Skills browse with a category facet (`skills_browse_cat_idx`)

```ts
.where(and(eq(skills.status, "published"), eq(skills.category, cat), …))
.orderBy(desc(skills.popularity), asc(skills.id))
```
A second index rather than one composite, for the reason in §5.1: with `category` as a gap in the
key, `popularity` cannot provide the ordering.

### 16.3 Skills browse with the harness facet (`skills_harnesses_gin`)

```ts
.where(and(
  eq(skills.status, "published"),
  sql`${skills.harnesses} @> ${JSON.stringify([harness])}::jsonb`,
))
```
Containment, not `?`, because `jsonb_path_ops` supports `@>` and nothing else — which is the whole
reason that opclass was chosen. The tag facet is the identical shape against `skills_tags_gin`.

### 16.4 Skill search — browse (`skills_browse_idx` prefilter, then filter)

```ts
const pattern = `%${escapeLike(q)}%`;   // lift escapeLike from app/api/admin/users/route.ts:26-28
.where(and(
  eq(skills.status, "published"),
  or(ilike(skills.name, pattern), ilike(skills.slug, pattern), ilike(skills.summary, pattern)),
))
```
**`ILIKE` on purpose.** It is substring matching, which is what a CJK query needs and what no text
search configuration would give it. `search_tsv` is a different job (§16.5) and its presence does
not make browse use it. An unescaped `q=%` is an unbounded sequential scan any signed-in user could
fire, so `escapeLike` is not optional.

### 16.5 ATG capability retrieval (`skills_search_idx`)

```ts
const q = sql`websearch_to_tsquery('english', ${capability.capability})`;
await db.select({
    id: skills.id, slug: skills.slug, name: skills.name, tags: skills.tags,
    rank: sql<number>`ts_rank(${skills.searchTsv}, ${q})`,
  })
  .from(skills)
  .where(and(sql`${skills.searchTsv} @@ ${q}`, eq(skills.status, "published"), eq(skills.blocked, false)))
  .orderBy(sql`ts_rank(${skills.searchTsv}, ${q}) DESC`)
  .limit(25);
```
`'english'` on both sides. This is conflict **C2**: against a `'simple'` column the stemmed query
lexeme `invoic` never matches the indexed lexeme `invoices`, `capabilityMatch` (3.00 of the ranker's
7.20-point scale) collapses to zero, every generated template falls back to tag containment, and
**nothing in any log says so.**

### 16.6 An agent's skills, joined to the catalogue — the manifest projection (`agent_skills_agent_idx`)

```ts
await db.select({
    agentSkillId: agentSkills.id, version: agentSkills.version, harness: agentSkills.harness,
    compatAsserted: agentSkills.compatAsserted, enabled: agentSkills.enabled,
    state: agentSkills.state, installPath: agentSkills.installPath,
    source: skills.sourceId, ownerHandle: skills.ownerHandle, slug: skills.slug,
    requires: skills.requirements, install: skills.install,
    contentSha256: skills.artifactSha256, riskLevel: skills.riskLevel, blocked: skills.blocked,
  })
  .from(agentSkills)
  .innerJoin(skills, eq(agentSkills.skillId, skills.id))
  .where(and(eq(agentSkills.agentId, agentId), ne(agentSkills.state, "removed")));
```
The runtime never runs this join — it reads the projection. Identity on the wire is
`(source, ownerHandle, slug)`; the denormalized copies on `agent_skills` exist so the *webhook
handler* does not have to reverse this join to find its own row.

### 16.7 "This skill just went `blocked` — who has it?" (`agent_skills_skill_idx`)

```ts
await db.select({ agentId: agentSkills.agentId, version: agentSkills.version })
  .from(agentSkills)
  .where(and(eq(agentSkills.skillId, skillId), ne(agentSkills.state, "removed")));
```
The recall query. It runs inside the admin block action, so it must be an index lookup and not a
scan of every attachment on the platform.

### 16.8 The daily re-verification sweep (`agent_skills_verify_idx`)

```ts
await db.select().from(agentSkills)
  .where(or(isNull(agentSkills.lastVerifiedAt),
            lt(agentSkills.lastVerifiedAt, sql`now() - interval '24 hours'`)))
  .orderBy(asc(agentSkills.lastVerifiedAt)).limit(500);
```
`NULLS FIRST` is the btree default for `ASC`, so never-verified rows come first without an explicit
clause — which is the order you want.

### 16.9–16.10 Template gallery (`agent_templates_gallery_idx`, `_cat_idx`, `_public_idx`)

```ts
// Workspace gallery, no facet. No `visibility` term: a workspace has exactly one owner today
// (`requireAuth()` resolves "the current user AND their owned workspace", docs/API.md:39), so
// `private` and `workspace` are the same audience and filtering on either would hide the user's
// own drafts from the user. THE DAY workspaces gain a second member, this query gains
// `inArray(agentTemplates.visibility, ["workspace","public"])` for non-creators — the enum
// already carries the distinction so that change is a WHERE clause, not a migration.
.where(and(eq(agentTemplates.workspaceId, wsId), isNull(agentTemplates.archivedAt)))
.orderBy(desc(agentTemplates.updatedAt))

// Public gallery, across every workspace — the one deliberately cross-tenant read of a
// user-authored table.
.where(and(eq(agentTemplates.visibility, "public"), isNull(agentTemplates.archivedAt)))
.orderBy(desc(agentTemplates.useCount))
```
`ownedByViewer` is computed here, in the serializer, from `workspaceId === ctx.workspace.id`. It is
**never a column** — the same row is "yours" to one tenant and "public" to another (conflict C7).

**A `public` row is another tenant's user-authored text, and this is the only place in the schema
where one customer's prose reaches another's screen.** `name`, `summary`, `description`, `tags`,
and everything inside `draft` — `boundaries.rules[].text`, `schedules[].prompt`, `agents[].brief` —
are that tenant's input. Three consequences, all of them already someone else's rule and none of
them optional here:

1. **Rendered as text nodes, never markup**, exactly like `skills.name` (§16.1).
2. **Never a system instruction.** `draft.schedules[].prompt` becomes `agent_schedules.prompt`,
   which §9.2 says is injected as a **user turn**; a forked public template does not get to write
   another workspace's system prompt. `TASK_PLAN_V2.md` §8.1's prompt-injection gate covers this
   case explicitly ("third-party text (templates, skills, tool results, schedule prompts)").
3. **Materializing another tenant's public template is a fork first.**
   `AGENT_TEMPLATE_GENERATOR.md` §9.4 requires it, and the injection scan re-runs on the
   `visibility: 'public'` transition, not only at generation. The schema's part is that
   `forked_from_id` records the provenance and `origin` becomes `forked`.

There is no `blocked`/moderation column on `agent_templates`, and that is a gap this document is
recording rather than filling: takedown today means the owner archiving the row or an operator
setting `visibility='private'` by hand. If a public gallery ships to real customers, it needs the
same admin verb set `skills` has. **Owed decision, §19.6 item 7.**

### 16.11 Generation poll (`template_generations_ws_idx`) and the in-flight check

```ts
await db.select().from(templateGenerations)
  .where(and(eq(templateGenerations.id, id), eq(templateGenerations.workspaceId, wsId)))
  .limit(1);
```
The `workspaceId` term is not redundant with the PK: it is the tenancy check, and per
`docs/API.md:40` a foreign id must return **404, not 403**. The in-flight check needs no query at
all — the insert either succeeds or violates `template_generations_one_running`, and the 409 is
raised from the constraint violation.

### 16.12 The schedule tick — due scan and claim (`agent_schedules_due_idx`)

```ts
await db.execute(sql`
  WITH claimed AS (
    SELECT id, next_run_at AS due
    FROM agent_schedules
    WHERE enabled AND next_run_at IS NOT NULL AND next_run_at <= now()
    ORDER BY next_run_at
    LIMIT 200
    FOR UPDATE SKIP LOCKED
  )
  UPDATE agent_schedules s SET next_run_at = NULL
  FROM claimed c
  WHERE s.id = c.id
  RETURNING s.*, c.due`);
```

**`RETURNING c.due` is the whole point of the CTE, and omitting it is a silent correctness bug.**
`RETURNING s.*` on an `UPDATE … SET next_run_at = NULL` returns the row **after** the update, so
`next_run_at` comes back `NULL` — verified on 15.13. The tick then has no due instant, and the due
instant is exactly `agent_schedule_runs.scheduled_for`: the occurrence's identity, the
`(schedule_id, scheduled_for)` dedupe key, and the thing that makes jitter and delay unable to fork
one occurrence into two rows (§11.1). An earlier draft of this section wrote `RETURNING s.*` alone,
which leaves the handler synthesising `scheduled_for` from `now()` — so a tick that runs 400 ms late
writes a different key than its retry, and the occurrence fires twice.

`FOR UPDATE SKIP LOCKED` is what makes two overlapping minute-ticks safe; nulling `next_run_at` in
the claim is what stops a third tick re-selecting the same row before the fire completes. The
recomputed value is written back after the fire, from `nextRun(cronExpr, c.due, timezone)` —
**three positional arguments, and the third is not optional even though the signature gives it a
default of `"UTC"`** (§9.2). Compute from `c.due`, not from `now()`: `nextRun` rounds its `after` up
to the next whole minute, so seeding from a late `now()` drops an occurrence on a `* * * * *`
schedule.

**A row that ends with `next_run_at = NULL` leaves the partial index entirely** — which is right for
a fired `once` or an unmatchable expression like `0 0 30 2 *`, and is why conflict **C6** narrowed
the predicate. It is *wrong* for a recurring schedule whose tick died between the claim and the
write-back: that row is now permanently invisible to the due scan and never fires again, with no
error anywhere. **§14.5 Pass 5c is the repair sweep that makes this claim protocol safe**; the claim
must not ship without it.

### 16.13 An agent's schedules, and their next fire (`agent_schedules_agent_idx`)

```ts
await db.select().from(agentSchedules)
  .where(eq(agentSchedules.agentId, agentId))
  .orderBy(desc(agentSchedules.enabled), asc(agentSchedules.nextRunAt));
```
`humanReadable` is **not** read from the row. It is re-derived per request with
`describeCron(cronExpr, lang)`, so a schedule edited in SQL still renders truthfully in all four
languages instead of freezing whichever one was current at generation time.

### 16.14 Schedule history, including the skips (`agent_schedule_runs_occurrence_uniq`)

```ts
// `scheduleId` comes from the URL and there is NO getAgentRow() precondition available for it —
// so the tenancy check is IN the query, as a join to agents. Without it this is an IDOR: any
// signed-in user reads any workspace's schedule history by guessing or leaking a uuid.
await db.select({ /* AgentScheduleRun columns */ })
  .from(agentScheduleRuns)
  .innerJoin(agents, eq(agents.id, agentScheduleRuns.agentId))
  .where(and(
    eq(agentScheduleRuns.scheduleId, scheduleId),
    eq(agents.workspaceId, ctx.workspace.id),
  ))
  .orderBy(desc(agentScheduleRuns.scheduledFor)).limit(50);
```
An empty result is a **404**, not a 403 and not an empty list — `docs/API.md:40`. A unique btree on
`(schedule_id, scheduled_for)` scanned backwards serves the `DESC` ordering directly, and the join
is a primary-key lookup per row against a table two orders of magnitude smaller. The agent-wide
variant of this query is what `agent_schedule_runs_agent_idx` (§11.1, correction **D4**) was added
for; that one *does* take an `agentId` and so is covered by Rule 1 instead.

### 16.15 The Activity timeline — TWO queries merged in TypeScript, keyset-paginated

**`HARNESSES_AND_ACTIVITY.md` §6.1 owns this query and this document defers to it.** An earlier
draft here wrote it as a SQL `UNION ALL`, which that document names and rejects by name ("Rejected
alternative: `UNION ALL` in SQL. It forces both branches into one column list"), and wrote the
cursor as a bare `occurred_at < $cursorAt`, which is a **broken keyset**: `<` on a non-unique key
silently drops every row that shares the boundary instant, and a busy agent produces ties at the
page boundary routinely. The correct shape is two `limit + 1` queries against their own indexes,
each with the **row comparison** `(occurred_at, id) < ($t, $i)`, merged by `mergeByTime()`:

```ts
// lib/activity/timeline.ts — abridged; §6.1 there is the full version with every filter.
cursor ? sql`(${agentActivities.occurredAt}, ${agentActivities.id})
             < (${cursor.t}::timestamptz, ${cursor.i}::uuid)` : undefined,
// …and the run branch:
cursor ? sql`(${agentRuns.startedAt}, ${agentRuns.id})
             < (${cursor.t}::timestamptz, ${cursor.i}::uuid)` : undefined,
```

**Indexes:** `agent_activities_agent_time_idx` `(agent_id, occurred_at DESC, id DESC)` and
`agent_runs_agent_idx` `(agent_id, started_at DESC, id DESC)` — both from §12.1/§10.1, and both
carry `id` **precisely so this row comparison is index-served rather than a heap filter.** The
pre-v2 `agent_activities_agent_idx` cannot serve it and is dropped. `limit + 1` for the has-more
signal rather than a second `COUNT`. Comparing a run's uuid against an activity's uuid is
meaningless as an ordering, but it is *stable*, which is the only property a keyset tiebreak needs.

The `?q=` filter is an `ILIKE` over `agent_runs.summary` and legacy `agent_activities.text`, escaped
with `escapeLike`. It cannot use either index and is confined to the already agent-scoped and
`from`/`to`-bounded branch. **It cannot match a v2 activity's rendered sentence at all**, because
that row stores `text = ''` and renders from `code` + `params`; the placeholder must say "Search run
summaries", not "Search activity" (§6.1 there).

### 16.16 The run detail drawer (`agent_run_steps_run_idx`)

```ts
// Same IDOR as §16.14 and the same fix: `runId` arrives from the URL with no getAgentRow()
// precondition, so the workspace check is a join. An earlier draft filtered on runId alone,
// which returned any workspace's step trace — including agent_run_steps.detail, which carries
// tool output, file paths and API responses from that customer's VM.
await db.select({ /* AgentRunStep columns */ })
  .from(agentRunSteps)
  .innerJoin(agentRuns, eq(agentRuns.id, agentRunSteps.runId))
  .innerJoin(agents, eq(agents.id, agentRuns.agentId))
  .where(and(eq(agentRunSteps.runId, runId), eq(agents.workspaceId, ctx.workspace.id)))
  .orderBy(asc(agentRunSteps.idx));
```
Ordered by `idx`, **not** by `occurred_at`: steps arrive unordered, and `idx` is the runtime's own
ordering. If `run.stepsPrunedAt` is non-null the drawer renders "step trace pruned after 90 days"
rather than an empty list (§14.3) — and note that an empty result is ambiguous between "pruned",
"no such run" and "not your run", so the drawer must load the **run** row first (through the same
join) and branch on `stepsPrunedAt`; a missing run row is a 404.

`agent_run_steps.title` and `.detail` are **runtime-authored, untrusted**: rendered as text nodes,
never as markup, and truncated for display rather than parsed.

### 16.17 The health sparkline (`agent_health_samples_agent_sample_uniq`)

```ts
await db.select().from(agentHealthSamples)
  .where(and(eq(agentHealthSamples.agentId, agentId), ne(agentHealthSamples.source, "mock")))
  .orderBy(desc(agentHealthSamples.sampledAt)).limit(120);
```
The unique index is `(agent_id, sampled_at DESC)`, so this is a 120-entry forward scan. `mock` rows
are excluded here and rendered on a separate, visibly-distinct track when
`AGENT_MANAGER_MODE = mock` — never averaged into the same line. `rollup` rows **are** included: the
chart draws them with a thinner stroke and a `<title>` saying "hourly average"
(`HARNESSES_AND_ACTIVITY.md` §7.2 — an average of averages is a weaker claim than a sample and must
not draw the same line), which is why `HealthSampleDTO.source` is
`"runtime" | "mock" | "rollup"` and not the two-value union `UI_DESIGN_V2.md` §F.5 still declares.
That amendment (**A6** in §11.1 there) is adopted here.

`ne(source, "mock")` and not `eq(source, "runtime")`, deliberately: a fourth `source` value added
later should appear on the chart by default and be *designed out*, not silently vanish.

### 16.18 The context checklist (`agent_context_items_agent_idx`)

```ts
await db.select().from(agentContextItems)
  .where(and(eq(agentContextItems.agentId, agentId),
             eq(agentContextItems.state, "awaiting_upload")));
```
This is the query `awaiting_upload` exists for (conflict C3). A non-empty result is what makes the
"what this agent still needs" card render an `[ Upload ]` action instead of nothing.

---

## 17. Degradation — what these tables hold with no LLM key and no Agent Manager

Both are hard constraints, and both are schema questions before they are UI questions: a table that
can only be populated by a model or by a VM is a table that is empty on a correctly-configured
deployment, and the UI must be able to tell "empty" from "broken".

### 17.1 No `OPENROUTER_API_KEY`

| Table | Behaviour |
|---|---|
| `template_generations` | Rows are still created. `mode = 'deterministic'`, `llm_calls = 0`, `cost_micro_usd = 0`, and every `stage_traces[].engine` is `"rules"` with `outcome: "fallback"`. The row reaches `ready` and produces a real `draft` — `lib/atg/deterministic.ts` is the product's floor, not a stub, and the eval suite runs against it in CI on every commit because it is the only path that always executes |
| `agent_templates` | Written exactly as in the LLM path. A deterministic draft is a valid `AgentTemplateDraft`; nothing downstream can tell, except `provenance.mode` |
| `llm_usage` | No rows. `stage`/`correlation_id` stay null on the rows that do exist from other surfaces |
| `skills` | Unaffected. The safety rubric (§5.3 there) is deterministic; the *optional* LLM reviewer is skipped and `review_note` stays null |
| `agent_skills` | Unaffected. Skill ranking falls back from the LLM rerank to the deterministic score |

The one visible difference is `template_generations.mode` and `draft.provenance.mode`, which the UI
renders honestly rather than hiding.

### 17.2 `AGENT_MANAGER_MODE = mock`

Every table is populated, and every mock-sourced row is **marked**:

| Table | Marker |
|---|---|
| `agent_skills` | `install_source = 'mock'` |
| `agent_health_samples` | `source = 'mock'` — excluded from the sparkline's main track, swept at 2 days, and **never rolled up** (§14.4) |
| `agent_runs`, `agent_run_steps`, `agent_activities` | The simulator emits real events through the real ingest path, so these carry no marker of their own; they are attributable through `agents.agent_manager_id`, which is a mock id |
| `agents` | `vm_id` is a fake identifier; `deployment_status` is the simulator's |

`TASK_PLAN_V2.md` §8.1 makes this a release gate: *"Mock-sourced data is visibly distinct and never
charted as real."* The marker columns are how that gate is met, which is why `install_source` and
`source` are `NOT NULL` with a `'live'`/`'runtime'` default rather than nullable.

### 17.3 `AGENT_MANAGER_MODE = unconfigured` (production, nothing set)

**Every table above is still written except the ones only the runtime writes.** This is the case
the "everything a backend service needs must be readable from Postgres alone" constraint exists for:

- `agent_templates`, `template_generations`, `agent_skills`, `agent_context_items`,
  `agent_schedules` — all fully populated. Materialize commits steps 1–11 and **skips step 12**;
  the agent stays `status = 'draft'` with `last_error = "Agent runtime is not configured"` and the
  route returns `201 { provisioned: false, reason }` — not an error, because the config is real and
  persisted and a backend team can pick it up from Postgres the moment a Manager exists.
- `agent_runs`, `agent_run_steps`, `agent_health_samples`, `runtime_event_receipts` — **empty**, and
  correctly so. There is no runtime to emit events. The Activity timeline renders its empty state;
  it does not render fiction.
- **`agent_schedule_runs` is the one runtime table that is NOT empty**, and an earlier draft listed
  it in the line above and then contradicted itself two lines later. The tick still computes
  `next_run_at` and still writes an occurrence row per fire with `status = 'skipped'`,
  `skip_reason = 'instance_stopped'` and `run_id = NULL`. A skipped occurrence is still an
  occurrence, and silence is indistinguishable from a broken scheduler. This is also why
  `agent_schedule_runs.run_id` is nullable and why `skip_reason` carries `instance_stopped`.

The gate is `agentManagerMode()` / `isAgentManagerConfigured()` from `lib/agent-manager/index.ts`,
which already resolves to `"unconfigured"` in production and throws `AgentManagerUnconfiguredError`
— shipped in Wave 0. Nothing in this schema needs a fourth mode.

---

## 18. Migration checklist

### 18.1 Fresh replay — what CI does, and the path that actually breaks

```bash
dropdb arkagent_ci && createdb arkagent_ci
npm run db:migrate          # all 13 files (0000…0012), ONE transaction
npm run db:seed             # must NOT create the demo workspace
SEED_DEMO=1 npm run db:seed # must
```

`TASK_PLAN_V2.md` §8.1's checklist item said "all 12 migrations"; it is 13 after the A3 shift, and §8.1 has been corrected
(§2.1). This is the path §1.2 is about. Before committing, verify by hand:

```bash
# Both enum files contain ALTER TYPE and nothing else.
for f in lib/db/migrations/0007_v2_enum_values.sql lib/db/migrations/0008_v2_enum_values_2.sql; do
  grep -Eiv '^[[:space:]]*(--|$)|^ALTER TYPE .* ADD VALUE IF NOT EXISTS' "$f" && echo "BAD: $f"
done
#   ^ must print nothing at all

# Every ADD VALUE is guarded, and there are eleven across the two files.
grep -c 'IF NOT EXISTS' lib/db/migrations/0007_v2_enum_values.sql     # must be 2
grep -c 'IF NOT EXISTS' lib/db/migrations/0008_v2_enum_values_2.sql   # must be 9

# 0007 IS ALREADY APPLIED EVERYWHERE. If its content or its journal `when` has changed in this
# branch, every already-migrated database silently skips the change — the A3 defect (§1.1).
git diff --stat origin/main -- lib/db/migrations/0007_v2_enum_values.sql   # must be empty
jq '.entries[] | select(.tag=="0007_v2_enum_values") | .when' \
  lib/db/migrations/meta/_journal.json                                    # must be 1788007550400

# No DDL file uses a value added by 0007/0008 as a LITERAL. (Column declarations of type
# `engine` are fine and do not match this grep; DEFAULTs, CHECKs and INSERTs do.)
grep -n "'codex'\|'deepseek'\|'template_gen'\|'feishu'\|'dingtalk'\|'wecom'\|'skill_publish'\|'skill_block'\|'skill_unblock'\|'skill_rescore'\|'skill_sync'" \
  lib/db/migrations/0009*.sql lib/db/migrations/001[012]*.sql
#   ^ must print NOTHING. A hit is the transaction hazard of §1.2, and it fails only in CI.

# The journal orders them correctly.
jq -r '.entries[].tag' lib/db/migrations/meta/_journal.json | tail -6
#   ^ 0007_v2_enum_values, 0008_v2_enum_values_2, 0009_v2_core_columns,
#     0010_v2_skills, 0011_v2_templates, 0012_v2_runtime
```

### 18.2 Incremental — what production does

`drizzle-kit migrate` against a database at `0007`. Same single transaction, same hazard, so the
same file discipline applies; the only difference is that production has rows and CI does not.
Three statements touch existing data:

| Statement | Risk | Mitigation |
|---|---|---|
| `CREATE UNIQUE INDEX messages_agent_external_uniq` | **Can fail** on existing duplicates | Pre-flight, §18.3 |
| `UPDATE agents SET status_occurred_at = updated_at` | Full table scan, brief | Agents are thousands, not millions |
| `DROP INDEX agent_activities_agent_idx` (§12.1) | Brief `ACCESS EXCLUSIVE`; a concurrent timeline read blocks | It is the **last** statement of 0012, after both replacement indexes exist, so no window has the timeline unindexed |
| `ADD COLUMN … NOT NULL DEFAULT` ×6 | None on PG ≥11 — the default is stored in the catalogue, not written to every row | — |

Everything else is a `CREATE TABLE` or a `CREATE TYPE` on a name that does not exist.

**`CREATE INDEX`, not `CREATE INDEX CONCURRENTLY`, throughout.** `CONCURRENTLY` cannot run inside a
transaction block and drizzle wraps the whole run in one, so it is unavailable here by construction.
On the tables where it would matter (`agent_activities`, and eventually `agent_run_steps`) the build
takes an exclusive lock for its duration. Plan the deploy window accordingly, or build those two
indexes by hand outside the migration and mark them applied — do not reach for `CONCURRENTLY` inside
a drizzle migration and discover the restriction in production.

### 18.3 Pre-flight, run against production **before** 0009

```sql
-- Must return zero rows. Each row is a message pair that would be lost to the new unique index.
SELECT agent_id, external_id, count(*)
FROM messages
WHERE external_id IS NOT NULL
GROUP BY agent_id, external_id
HAVING count(*) > 1;
```
If it returns rows, they are already-corrupted duplicates from the global-uniqueness bug. Resolve by
keeping the earliest `created_at` per group and nulling `external_id` on the rest — **do not
delete**, because a message is a customer's content and the duplicate may carry a different body.

### 18.4 Backfill for existing rows

| Column | Backfill | Why not the default |
|---|---|---|
| `agents.status_occurred_at` | `= updated_at` | Left NULL, the last-writer-wins comparison has nothing to compare against, and the first stale replayed event rewrites a live agent's status. `updated_at` is the closest honest approximation of "when this status was set" |
| `agents.config_revision` | `1` (column default) | Every existing agent is at revision 1 by definition; the runtime has applied nothing yet |
| `agents.applied_config_revision` | NULL | Honest. "The runtime has never reported one" is not "revision 0" |
| `workspaces.timezone` | `'Asia/Singapore'` (column default) | Must equal `DEFAULT_SETTINGS.timezone` (`lib/agent-settings.ts:85`) or every agent that never overrode its zone silently changes behaviour — see §3.1 |
| `agent_improvements.kind` | `'other'` (column default) | Legacy rows genuinely have no kind |
| `agent_activities.params` | `'{}'` (column default) | Legacy rows are `code IS NULL` and render from `text` |
| `agent_activities.code` | NULL | The null is the discriminant: `code IS NULL` ⇒ render `text`; `code` set ⇒ render from `code` + `params` (conflict C8) |
| `agent_skills`, `skills`, everything in 0010–0012 | none | New tables. `npm run db:seed` writes the 8 sources and the 101 skills |

**No data backfill is required for `agent_runs`, `agent_run_steps`, `agent_health_samples` or
`runtime_event_receipts`.** They start empty and stay empty until a runtime exists (§17.3). Do not
seed them, even in the demo workspace: a fabricated run history is the exact class of thing
`MOCK_DATA_AUDIT.md` catalogues.

### 18.5 What is irreversible

| Change | Reversible? | Note |
|---|---|---|
| `ALTER TYPE … ADD VALUE` (all 11: 2 in 0007, 9 in 0008) | **No.** Postgres cannot drop an enum value | This is why 0007 and 0008 are append-only and why every review of them is a one-way door. The rollback for a wrong value is to stop using it and leave it in the type |
| `DROP INDEX messages_external_uniq` | Yes, mechanically — **no**, in practice | Recreating it fails the moment a second tenant has minted a colliding `external_id`, which is the bug being fixed |
| `CREATE TABLE` ×12 | Yes, `DROP TABLE` | But `agent_skills` FKs `skills` with `restrict`, so the drop order is the reverse of the create order |
| `ADD COLUMN` ×14 | Yes, `DROP COLUMN` | Cheap on PG ≥11. Fourteen, not thirteen: `workspaces.timezone` 1 + `agents` 4 + `agent_improvements` 2 + `admin_audit_log.target_ref` 1 + `llm_usage` 2 + `agent_activities` 3 + `usage_records.run_id` 1 (`agent_schedules.created_by_id` is on a new table and does not count) |
| `skills.search_tsv` generated column | Yes | It is derived; dropping and re-adding it recomputes from `name`/`slug`/`summary`/`tags` |
| The 14/90/400-day retention windows | Yes going forward, **no** backwards | Data already pruned is gone. Lengthen a window before you need it, not after |

**There is no down-migration in this repo and this change does not add one.** The rollback plan is
restore-from-snapshot, taken immediately before `db:migrate` runs against production. Say so in the
deploy runbook rather than shipping five `.down.sql` files nobody has ever executed.

### 18.6 Post-migration verification

```sql
-- 19 new types
SELECT count(*) FROM pg_type WHERE typname IN (
  'skill_category','skill_format','skill_risk','skill_status','skill_source_kind',
  'skill_source_trust','agent_skill_state','agent_skill_origin',
  'template_visibility','template_origin','template_generation_status','template_generation_mode',
  'context_item_kind','context_item_state','schedule_kind','schedule_overlap',
  'run_trigger','run_status','run_step_phase');                              -- expect 19

-- engine has four values, in order
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'engine' ORDER BY e.enumsortorder;   -- openclaw, hermes, codex, deepseek

-- search_tsv is 'english' and generated, not 'simple' (conflict C2)
SELECT pg_get_expr(d.adbin, d.adrelid) FROM pg_attrdef d
JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
WHERE a.attrelid = 'skills'::regclass AND a.attname = 'search_tsv';
--   ^ must contain 'english' and setweight, and must NOT contain a SELECT

-- 12 new tables
SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN (
  'skill_sources','skills','agent_skills','agent_templates','template_generations',
  'agent_context_items','agent_schedules','agent_schedule_runs','agent_runs',
  'agent_run_steps','agent_health_samples','runtime_event_receipts');        -- expect 12

-- the agent_schedules CHECKs exist (conflict C6)
SELECT conname FROM pg_constraint WHERE conrelid = 'agent_schedules'::regclass AND contype = 'c';
--   ^ agent_schedules_shape, _jitter, _runtime, _runs, _deliver, _last_status

-- every OTHER closed-vocabulary varchar is actually CHECK-constrained (§9.2). A `varchar` with a
-- comment listing its legal values is not a constraint, and this is the query that says so.
SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
WHERE contype='c' AND conrelid IN (
  'agent_context_items'::regclass,'agent_skills'::regclass,'agent_run_steps'::regclass,
  'agent_schedule_runs'::regclass,'agent_health_samples'::regclass)
ORDER BY 1,2;
--   ^ expect agent_context_items_scope; agent_skills_install_source; agent_run_steps_status;
--     agent_schedule_runs_status, _skip; agent_health_samples_state, _source, _cpu

-- the Activity indexes landed and the superseded one is gone (§12.1)
SELECT indexname FROM pg_indexes WHERE tablename='agent_activities' ORDER BY 1;
--   ^ agent_activities_agent_code_idx, agent_activities_agent_time_idx — and NOT
--     agent_activities_agent_idx

-- the schedule-run rank function exists (§11.1) — the UPSERT is invalid without it
SELECT schedule_run_rank('succeeded') > schedule_run_rank('started');   -- expect t

-- autovacuum was tuned (§10.1). drizzle-kit cannot express reloptions, so this is the ONLY
-- place that catches a hand-written statement being dropped from 0012.
SELECT relname, reloptions FROM pg_class
WHERE relname IN ('agent_run_steps','agent_health_samples');
--   ^ both must show {autovacuum_vacuum_scale_factor=0.02}
```

and then, in the app: `npm run typecheck && npm run lint && npm test && npm run build`.

---

## 19. Corrections register

Everything this document changed relative to the four owning documents, and why. Nothing here
contradicts `TASK_PLAN_V2.md` §1's thirteen resolved conflicts — C1, C2, C3, C4, C6, C7, C8, C10 and
C13 are all implemented above exactly as the ledger decided them. These are **new** findings.

### 19.1 Amendments to `TASK_PLAN_V2.md` §2.1's slot map

| # | Change | Consequence if not made |
|---|---|---|
| **A1** | `llm_call_kind += 'template_gen'` joins the enum files (**0008**) | Every ATG model call fails its `llm_usage` insert with `invalid input value for enum llm_call_kind`, or the value lands in 0011 — the file that first *uses* it, which is the precise transaction hazard the enum files exist to prevent |
| **A2** | `runtime_event_receipts` joins **0012** | The ingest ledger has no home. It is the only concurrency guard on event ingest; without it a redelivered `agent.usage` double-bills the customer |
| **A3** | **Every DDL slot shifts up by one** (0008→0009, 0009→0010, 0010→0011, 0011→0012), and the ten unshipped enum values get a new `0008_v2_enum_values_2.sql` | `0007_v2_enum_values.sql` already exists and is journaled with only the two `engine` values (§1.1). drizzle decides applied-ness by `folderMillis` vs `created_at` (`dialect.cjs:64`), never by file hash, so amending 0007 is a **permanent silent no-op** on every already-migrated database while a fresh CI replay goes green. Production would then 500 on the first Feishu channel ingest and on every ATG `llm_usage` insert, with nothing in the migration log to explain it |
| **A4** | `llm_call_kind += 'schedule_parse'` joins **0008** | `REMINDERS_AND_SCHEDULERS.md` §4.2's NL→cron model branch has no `llm_call_kind`, and `chat`/`brief`/`self_review` are all wrong for it — reusing `brief` puts schedule parses into the admin console's brief-generation cost line and makes both numbers wrong. That document's delta D19 named slot **0007**, which is now unreachable (A3) |
| **A5** | `scheduler_ticks` joins **0012** | `REMINDERS_AND_SCHEDULERS.md` §3.0 delta 12 (§11.4). Without it, a plan whose cron granularity is coarser than the schedules users created is undiagnosable — every other table looks healthy while the product silently does not fire |

**§2.1's runtime slot therefore holds nine tables, not six:** the six it names, plus
`runtime_event_receipts` (A2), `scheduler_ticks` (A5), and — already in §2.1's own list —
`agent_schedule_runs`. It also holds one function, `schedule_run_rank(text)` (§11.1).

### 19.2 `SKILL_REPOSITORY.md` §1

| # | Finding | Fix |
|---|---|---|
| **B1** | `skills.license_verified`'s comment still says "all **31** seeded ClawHub rows". Conflict **C10** settled on **30** (`mcporter` excluded) and the contract was edited; this comment was missed | Corrected to 30 (§5). It matters because `tests/skills-catalog.test.ts` asserts the seed count, and a doc saying 31 sends the engineer to add a row |
| **B2** | §1.3 types `skills.harnesses` as `Engine[]`; W0-4 named the union `Harness` and **has already shipped** — `lib/harness/index.ts` owns `HARNESS_IDS`/`Harness` and `lib/db/schema.ts:43` builds `engineEnum` from it | One name, imported from `@/lib/harness` and never from `lib/db/schema.ts` (which would drag Drizzle into the browser). `export type Engine` already exists at `lib/db/schema.ts:818` and stays as the sole deprecated alias; do **not** add a second one in `lib/skills/types.ts` |
| **B3** | `skills.blocked` and `skills.status = 'blocked'` are both declared and their relationship is never stated | Documented as an invariant maintained by a single UPDATE, **not** a CHECK — a two-statement update inside one transaction would violate a CHECK at the first statement, and the sync pipeline legitimately writes it that way. Asserted in a test instead |
| **B4** | `agent_skills.origin_ref` is described as "a nullable FK, added with that table" | It is a bare `uuid` with no FK, permanently. `agent_templates` lands one slot later; `agent_templates.generation_id` already sets the precedent for the same reason; and a foreign key on a column whose meaning depends on a sibling discriminant is wrong for four of its five cases (§6.2) |
| **B5** | The contract says ArkAgent "never sets `state` except to `pending`", but detach sets `removing` | Documentation gap, not a design change — `removing` is in the contract's own ladder. Flagged so the runtime does not treat an arriving `removing` as unexpected |

### 19.3 `AGENT_TEMPLATE_GENERATOR.md` §7

| # | Finding | Fix |
|---|---|---|
| **C1** | `agent_templates_public_idx (visibility, category, use_count DESC) WHERE visibility='public'` — the leading key column is single-valued inside its own predicate | Dropped from the key, kept in the predicate |
| **C2** | Only one gallery index, `(workspace_id, category, updated_at DESC)`, but the default gallery query supplies **no** category — so `category` is a gap in the key and `updated_at` never provides the ordering | Split into `_gallery_idx` and `_gallery_cat_idx`. This is the identical defect `SKILL_REPOSITORY.md` §1.3 already fixed for `skills`; templates got the single-index version |
| **C3** | The public gallery index had no `archived_at IS NULL` in its predicate | An archived public template was still being served. Added |
| **C4** | `agent_templates_tags_idx USING gin (tags)` uses the default opclass | Renamed `_gin` and given `jsonb_path_ops`, matching `skills_tags_gin`: same `@>` query, half the index size |
| **C5** | `brief_sha256 char(64)` | `varchar(64)`, matching `sessions.token_hash` (`lib/db/schema.ts:237`), which stores the same thing. `char` pads and the repo has no precedent for it |

### 19.4 `BACKEND_INTEGRATION_CONTRACT.md` §2–§3

| # | Finding | Fix |
|---|---|---|
| **D1** | `agent_health_samples` has no dedupe key at all — its only guard is the 30-day ledger | The `(agent_id, sampled_at)` index becomes **unique**. Equal `sampled_at` from one agent is by definition the same observation; it also makes the hourly rollup idempotent. One index doing both jobs on the highest-row-count table |
| **D2** | `agent_health_samples` retention scans **by age across all agents**, which `(agent_id, sampled_at DESC)` cannot serve | Added `agent_health_samples_sweep_idx (sampled_at)`. Same structural point the contract already makes for `runtime_event_receipts_received_idx` and then does not apply here |
| **D3** | The **contract** says nothing about how `agent_run_steps` is pruned, and it is the highest-volume table. (`HARNESSES_AND_ACTIVITY.md` §7.2 does — an earlier draft of this row claimed "nothing in the corpus" and was wrong) | §7.2's **90-day** window, plus this document's mechanism: driven from `agent_runs` so no fourth index lands on the step table, with a new `agent_runs.steps_pruned_at` marker so the driver terminates instead of re-walking the 310 days between the step window and the run window every night. Two complementary partial indexes on `agent_runs.started_at` (§10.1, §14.2, §14.3) |
| **D4** | `agent_schedule_runs.agent_id` has no index, but the Reminders history tab is agent-scoped and spans schedules | Added `agent_schedule_runs_agent_idx (agent_id, scheduled_for DESC)` |
| **D5** | The status monotonicity rule reads "started(0) < skipped(1) < failed(2) < succeeded(2)", which is presented as a total order and is not one | Restated: ranks are `started=0, skipped=1, failed=2, succeeded=2`; a lower rank never overwrites a higher one, and equal ranks are last-write-wins because an occurrence yields exactly one terminal status, so a tie is a redelivery (§11.1) |
| **D6** | `agent_context_items.sha256 char(64)` | `varchar(64)`, same reasoning as C5 |
| **D7** | §3.4 says health samples are "rolled up to hourly averages" and never says where | Rolled up **in place** with `source = 'rollup'`, rather than a twelfth table that would double the sparkline query into a UNION and need its own retention (§14.4). The cost is stated honestly: resolution changes at 14 days and the chart must label its own axis |
| **D8** | `agent_schedule_runs` retention is undefined | 180 days, deliberately with **no** dedicated index — at ~24k rows/day the nightly sequential scan is seconds, and a third btree costs more on every ingest than it saves. Trigger condition for adding one is stated (§14.6) |
| **D9** | The **contract** leaves `agent_activities` retention undefined and its only index is agent-leading. (Again, `HARNESSES_AND_ACTIVITY.md` §7.2 defines it; the earlier "undefined" claim was wrong) | §7.2's **400 days**, matching `agent_runs` so the merged timeline never has a band where runs render with their activity missing. Still a sequential scan, with the explicit trigger condition (~5,000 agents) for adding `agent_activities_sweep_idx` (§14.8) |
| **D10** | The §3.3 UPSERT sketch for `agent_schedule_runs` references `excluded.status_rank`, a column that does not exist. Verified: `ERROR: column excluded.status_rank does not exist` | An `IMMUTABLE` `schedule_run_rank(text)` function, created beside the table in 0012, plus a full statement that moves `status` and `skip_reason` together and `COALESCE`s the additive columns in the right direction (§11.1) |
| **D11** | `agent.error` (1 of the contract's 16 events) writes `agents.last_error` and appears in no idempotency rule | Layer 3 against `status_occurred_at`, the same clock `agent.status` uses, so a stale error cannot overwrite a newer recovery; it does not advance the clock itself (§15.1) |
| **D12** | `agent_schedules` has no `created_by_id`, but W3-6's acceptance criterion requires one for audit | Added, `set null` on user delete (§9.2). NULL means ATG materialization wrote it on the workspace's behalf |
| **D13** | Six closed-vocabulary `varchar`s are described as "CHECK-constrained" and carry no CHECK | Eight CHECK constraints written out (§9.2), including the `agent_schedule_runs` status/skip_reason biconditional and `agent_health_samples.source IN ('runtime','mock','rollup')`, which the §14.4 rollup depends on |

### 19.4a `HARNESSES_AND_ACTIVITY.md` — where this document deferred

That document did not exist when the schema was partitioned across three owners, and an earlier
draft of this file did not cite it once. It owns `lib/harness/**` and every Activity view. Six
places where this document was wrong and now follows it:

| # | Was | Now |
|---|---|---|
| **E1** | `Harness` declared in `lib/db/schema.ts` from a literal array | `lib/harness/index.ts` owns `HARNESS_IDS`/`Harness`; schema builds the pgEnum from it — already the shipped code (§1.1, B2) |
| **E2** | "No new index on `agent_activities`" | `agent_activities_agent_time_idx` and `_agent_code_idx` added in 0012, `agent_activities_agent_idx` dropped last (§12.1) |
| **E3** | `agent_runs_agent_idx (agent_id, started_at DESC)` | widened with `id DESC` so the keyset tiebreak is index-served, closing §5.4's PROPOSED amendment; plus the partial `agent_runs_agent_failed_idx` for ERRORS (§10.1) |
| **E4** | Timeline as a SQL `UNION ALL` with a `< $cursorAt` cursor | Two queries merged in TypeScript, with the row comparison `(t, id) < ($t, $i)` — the bare `<` silently drops every row tied on the boundary instant (§16.15) |
| **E5** | `ActivityParams = Record<string, string \| number \| boolean>` | `string \| number`. A boolean param has no localisation and renders as the English "true" in the 日本語 UI (§13) |
| **E6** | Retention 30 d steps / 180 d runs / 365 d activities, and a `/api/cron/nightly` endpoint | 90 / 400 / 400, on `/api/cron/sweep` (task W5-8), plus its autovacuum settings (§14, §10.1) |

One place where this document overrides it: the sweep route exports **`GET`**, not `POST`, because
that is what Vercel Cron issues (§14.0). `HARNESSES_AND_ACTIVITY.md` §7.2 has been edited to match.

### 19.4b `REMINDERS_AND_SCHEDULERS.md` — where this document deferred

That document owns the schedule **execution** path and was written after §9.2 and §11.1 here. It
adds eleven columns and constraints to two tables this document declares, plus one table it does
not. All of them are absorbed above; none is a redesign of anything here.

| # | What it adds | Where it now lives |
|---|---|---|
| **F1** | `agent_schedules.claimed_at`, `.claim_token` — a durable 300 s lease rather than an open transaction held across a network dispatch | §9.2 |
| **F2** | `agent_schedules.expectation varchar(280)` — user-authored, dispatched as fenced data, same trust boundary as `prompt` | §9.2 |
| **F3** | `agent_schedules_enabled_next` CHECK, and `agent_schedules_due_idx` widened to `(next_run_at, claimed_at)` so the claim predicate is index-only | §9.2 |
| **F4** | `agent_schedule_runs` += `missed_count`, `missed_truncated`, `trigger`, `attempt`, `next_attempt_at`, `expectation_met`, `source`, `schedule_name`; two indexes; two CHECKs | §11.1 |
| **F5** | **`agent_schedule_runs.schedule_id` loses its foreign key**, keeping `uuid NOT NULL`. `ON DELETE CASCADE` erases the history `DELETE` is supposed to preserve, and `ON DELETE SET NULL` retains rows that `GET …/runs` — which filters by `schedule_id` — can never read again | §11.1 |
| **F6** | `scheduler_ticks` | §11.4 |
| **F7** | Four ArkAgent-originated `skip_reason` values (`channel_not_bound`, `misfire`, `misfire_too_old`, `dispatch_unsupported`) beyond the contract's seven | §11.1 comment |

Two places where this document keeps its own answer, and the other has been edited to match:

- **The rank helper is `schedule_run_rank(s text)`, created in 0012 beside the table** (§11.1).
  §3.8.3 there writes the ladder out as four inline `CASE`s "so the rank is auditable without a
  second file" and defers a `scheduleRunRank(status)` function to W3-8. One name, one definition,
  created with the table — a rank duplicated four times in one statement is four places to get the
  `failed = succeeded` tie wrong.
- **`lib/i18n/activity.ts` is created by W3-9, not W5-4.** That is *its* finding (D20), not this
  document's, and §11.1's comment now says so; `HARNESSES_AND_ACTIVITY.md`'s file manifest has
  been edited.

### 19.5 Deliberate non-changes

Things that look like defects and are not:

- **`run_status` spells `cancelled`; `template_generation_status` spells `canceled`.** Both are
  already published — one to the runtime team, one to the ATG API — and renaming an enum value is
  the one thing contract §6.1 forbids. Different types; they never meet.
- **`workspaces.timezone` defaults to `'Asia/Singapore'` while `agent_schedules.timezone` defaults
  to `'UTC'`.** The first continues an existing behaviour and must equal `DEFAULT_SETTINGS.timezone`
  exactly; the second is new and its default only fires on a direct SQL insert (§3.1).
- **`deliver_to`, `scope`, `last_status`, `install_source`, `agent_run_steps.status`,
  `agent_schedule_runs.status`/`.skip_reason` and `agent_health_samples.state`/`.source` are
  CHECK-constrained `varchar`s, not enums.** Their vocabularies are not frozen by the runtime team,
  and a fifth value must be a one-line CHECK swap rather than an `ALTER TYPE` in the hazardous class.
  **The CHECKs are written out in §9.2** — this bullet used to make the claim while the document
  declared no constraint anywhere (correction **D13**).
- **`template_generations` duplicates `stage_traces`/`warnings`/`injection_findings` into
  `draft.provenance`.** The generation row is written incrementally, one update per stage, so a
  generation that dies before stage 7 has no `draft` for its trace to live in (§13.11).
- **`agent_skills` carries `source_ref`/`owner_handle`/`slug` denormalized from `skills`.** The
  runtime is told it may never join our catalogue, and `agent.skill_state` correlates on that
  4-tuple; without the columns the webhook handler reverses a join to find its own row (§6).

### 19.6 Still owed by the product owner

These are `TASK_PLAN_V2.md` §8.2 items that have a **schema** consequence, restated with what
changes if the answer goes the other way:

1. **Context storage and extraction (§8.2 item 1).** `agent_context_items` is written as though the
   bytes live elsewhere and only a URL + digest are stored. If the decision is text-only at launch,
   `content_url`/`mime`/`sha256`/`bytes` become dead columns for v2.0 — harmless, but say so rather
   than leaving four columns nothing writes.
2. **Does the runtime index context (§8.2 item 2, CONFIRM-3)?** If it merely drops files on disk,
   `chunks` and `indexed_at` are never written and `state` never reaches `indexed`. The enum keeps
   the values either way; the UI copy is what changes.
3. **Licence policy vs redistribution (§8.2 item 4).** If ArkAgent may not serve bundle bytes, then
   `skills.redistributable` is `false` for every seeded row and `install.mode = 'inline'` is
   unreachable at launch. The column stays; the seed shrinks.
4. **`category_id` for Codex and DeepSeek (§8.2 item 5).** No schema consequence — `engine` carries
   four values regardless, and `agent_templates.harness` stores what the user chose. Only
   provisioning is gated.
5. **Vercel plan and cron granularity (§8.2 item 6).** Direct consequence for §14: on Hobby there
   are two daily crons and no per-minute tick, so the schedule tick cannot run and
   `agent_schedules.next_run_at` is computed but never acted on. Every retention pass in §14 is
   already consolidated into **one** nightly entry for exactly this reason — including the ATG
   expiry sweep, which §8.1 once described as a third entry.
6. ~~**`README_V2.md` still lists this document as "commissioned and never written"**~~ —
   **DONE (W0-13).** The index has a row for all four late documents, the "never written" section
   is gone, and a new reading order sends anyone about to write a migration here first. Not a
   product-owner decision; retained so the item numbering below does not shift.
7. **Moderation and takedown for `visibility = 'public'` templates.** `agent_templates` has no
   `blocked`/`status` column and no admin verb, while `skills` has both plus five `admin_action`
   values. A public gallery is one tenant's prose on another tenant's screen (§16.9–16.10). If it
   ships to real customers, decide whether it needs the same curation surface; if the answer is
   yes, it is a fifth enum + two columns in a **later** slot, because nothing today writes them.

---

## Appendix · Inferred type exports

Appended to the block at `lib/db/schema.ts:789-821`, following the existing `X` / `NewX` pattern.

```ts
// ---- Skills ----
export type SkillSource = typeof skillSources.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type AgentSkill = typeof agentSkills.$inferSelect;
export type NewAgentSkill = typeof agentSkills.$inferInsert;
export type SkillCategory = (typeof skillCategoryEnum.enumValues)[number];
export type SkillRisk = (typeof skillRiskEnum.enumValues)[number];
export type SkillStatus = (typeof skillStatusEnum.enumValues)[number];
export type SkillFormat = (typeof skillFormatEnum.enumValues)[number];
export type AgentSkillState = (typeof agentSkillStateEnum.enumValues)[number];
export type AgentSkillOrigin = (typeof agentSkillOriginEnum.enumValues)[number];

// ---- Templates ----
export type AgentTemplate = typeof agentTemplates.$inferSelect;
export type NewAgentTemplate = typeof agentTemplates.$inferInsert;
export type TemplateGeneration = typeof templateGenerations.$inferSelect;
export type NewTemplateGeneration = typeof templateGenerations.$inferInsert;
export type TemplateVisibility = (typeof templateVisibilityEnum.enumValues)[number];
export type TemplateOrigin = (typeof templateOriginEnum.enumValues)[number];
export type TemplateGenerationStatus = (typeof templateGenerationStatusEnum.enumValues)[number];
export type TemplateGenerationMode = (typeof templateGenerationModeEnum.enumValues)[number];

// ---- Runtime ----
export type AgentContextItem = typeof agentContextItems.$inferSelect;
export type NewAgentContextItem = typeof agentContextItems.$inferInsert;
export type AgentSchedule = typeof agentSchedules.$inferSelect;
export type NewAgentSchedule = typeof agentSchedules.$inferInsert;
export type AgentScheduleRun = typeof agentScheduleRuns.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type AgentRunStep = typeof agentRunSteps.$inferSelect;
export type AgentHealthSample = typeof agentHealthSamples.$inferSelect;
export type RuntimeEventReceipt = typeof runtimeEventReceipts.$inferSelect;
export type ContextItemKind = (typeof contextItemKindEnum.enumValues)[number];
export type ContextItemState = (typeof contextItemStateEnum.enumValues)[number];
export type ScheduleKind = (typeof scheduleKindEnum.enumValues)[number];
export type ScheduleOverlap = (typeof scheduleOverlapEnum.enumValues)[number];
export type RunTrigger = (typeof runTriggerEnum.enumValues)[number];
export type RunStatus = (typeof runStatusEnum.enumValues)[number];
export type RunStepPhase = (typeof runStepPhaseEnum.enumValues)[number];
export type NewAgentScheduleRun = typeof agentScheduleRuns.$inferInsert;
export type NewAgentRunStep = typeof agentRunSteps.$inferInsert;
export type NewAgentHealthSample = typeof agentHealthSamples.$inferInsert;
export type NewRuntimeEventReceipt = typeof runtimeEventReceipts.$inferInsert;
export type SchedulerTick = typeof schedulerTicks.$inferSelect;
export type NewSchedulerTick = typeof schedulerTicks.$inferInsert;
export type NewSkillSource = typeof skillSources.$inferInsert;
```

The four `New*` runtime types and `NewSkillSource` are not optional garnish: every one of those
tables is written by the ingest handler or the seed, and `$inferInsert` is the only type that knows
which columns have defaults. Omitting them was the reason an earlier draft's insert examples had no
type to check against.

**`Harness` and `ChannelType` are NOT exported here, and must not be.**

- `Harness` is `lib/harness/index.ts`'s export; `lib/db/schema.ts:43` *consumes* it to build
  `engineEnum`. The dependency points schema → harness so a client component can name a harness
  without importing Drizzle. An earlier draft of this appendix said `Harness` "is exported from §1.1
  beside `engineEnum`" — it is not, and re-exporting it from the schema would re-create the bundling
  problem `lib/harness` exists to solve.
- `ChannelType` is needed by `AgentTemplateDraft` (§13.10) and has the same constraint. W0-4b gives
  it a client-safe home in `lib/channels.ts` on the identical pattern (§13, conflict C15); the schema builds
  `channelTypeEnum` from `CHANNEL_TYPE_IDS` and exports no `ChannelType` of its own.

`export type Engine = (typeof engineEnum.enumValues)[number]` already exists at
`lib/db/schema.ts:818` and is the one permitted exception — a pre-existing deprecated alias, left in
place rather than churned. New code writes `Harness`.
