# ArkAgent v2 — document index

**Sixteen documents, ~32,600 lines.** This page says what each one is for and who needs to read it,
so nobody reads 300 KB to find out it was written for someone else.

**Start here:** `TASK_PLAN_V2.md`. It is the only normative document — where the designs
contradict each other, its §1 records which one won and why, and the corpus on disk has already
been edited to match.

---

## Read this first, whoever you are

| Document | Lines | What it is |
|---|---|---|
| **`TASK_PLAN_V2.md`** | 866 | **Normative.** The conflict ledger — **21** cross-document contradictions and their resolutions, C1–C13 from the first reconciliation and C14–C21 from the four documents written after it — the seven-wave work breakdown with **67 tasks**, the migration slot order, the full file manifest, the i18n plan, the verification gates, the risk register, and the definition of done. Read §1 and §1a before trusting any other document, and §2.1 before writing a migration. **§2.1 was corrected by C14: every DDL slot is one higher than it was**, because `0007_v2_enum_values.sql` turned out to be already on disk and journaled. |
| **`PRP.md`** | 1,313 | The product requirements the whole corpus hangs off, written last and therefore against a corpus that already existed: the rewritten brief, eleven marked assumptions where the original was ambiguous, the ten requirements mapped feature by feature onto waves and acceptance criteria, a golden-path walkthrough, the security and degradation gates, and twelve open product questions. **Read it before arguing about scope** — §3 is explicit that if no wave builds a thing, this document does not promise it, and it names twelve items out and seven deferred to v3. |

---

## For ArkAgent engineers

| Document | Lines | Read it when | Health |
|---|---|---|---|
| **`DATA_MODEL_V2.md`** | 3,919 | **Before writing any migration or any `lib/db/schema.ts` declaration.** The consolidated enum inventory, the migration slot map, every v2 table with full DDL — types, nullability, defaults, indexes, constraints and the reason for each — every JSONB payload as a TypeScript interface, the retention and pruning passes, the idempotency rules table by table, and the eighteen read queries the new UI needs with the index each one uses. It exists because the v2 schema was previously partitioned across three design documents by ownership, which is the direct cause of conflicts C1, C2 and C5. | New; **corrects `TASK_PLAN_V2.md` §2.1** (conflict C14) and requests five amendments (A1–A5), listed in its §19.1; edited for conflicts C15, C16, C17 |
| **`AGENT_TEMPLATE_GENERATOR.md`** | 3,508 | Building anything under `lib/atg/**`, `/dashboard/templates`, or `/api/templates/**`. The ten-stage pipeline, the `AgentTemplateDraft` contract and its Zod mirror, all seven stage prompts, skill retrieval and ranking, the guardrail linter, injection defence, materialization, and the deterministic no-key fallback. | Reviewed; edited for conflicts C2, C3, C4, C5, C7 |
| **`SKILL_REPOSITORY.md`** | 3,308 | Building `lib/skills/**`, `/dashboard/skills`, or the sync pipeline. Thirteen framing decisions, the full data model, the canonical Skill record, a 101-entry curated seed, the discovery/sync pipeline, the safety rubric, the APIs, and the UI contract. | Reviewed; edited for conflicts C1, C2, C5, C11 |
| **`UI_DESIGN_V2.md`** | 3,451 | Building any screen. The contrast and weight fix (measured, with new hex for all six palettes), the template gallery, the AI-guided creation flow, the skill browser, the config editor, the Activity rebuild, the component inventory, responsive rules, and accessibility. **§A is a prerequisite for every other wave's UI work.** | Reviewed; edited for conflicts C1, C8, C13 |
| **`HARNESSES_AND_ACTIVITY.md`** | 2,943 | Building `lib/harness/**`, `lib/activity/**`, or the Activity tab. The four-harness capability matrix, the `HarnessAdapter` abstraction and the three surviving `engine === "openclaw"` checks, the harness→`category_id` resolution and the `ATG_ENABLED_HARNESSES` gate, the engine auto-match scorer, the closed activity-code vocabulary (14 existing + 10 PROPOSED), and every Activity view's query, index, DTO, filters, keyset pagination and empty state. §8 (empty states) is the launch-day design, not an appendix. | New; requests **twelve** amendments to sibling docs (A1–A12), listed in its §11.1; edited for conflicts C14, C15, C18, C19 |
| **`MOCK_DATA_AUDIT.md`** | 271 | Wave 0, and any time you are unsure whether a fixture is load-bearing. 41 findings classified DELETE / REPLACE-WITH-QUERY / KEEP / KEEP-BUT-GATE, each traced to **every** consumer, with a removal sequence that never leaves `next build` broken. **§4 "DO NOT BREAK" is the important half** — several things that look like mock data are the no-LLM-key fallback. | Re-verified against the working tree; line refs re-anchored (conflict C12) |
| **`REMINDERS_AND_SCHEDULERS.md`** | 2,892 | Building `app/api/cron/schedules`, `app/api/agents/[id]/schedules/**`, the schedule editor or the run-history panel — i.e. all of Wave 3. Who fires a due schedule and why the other two candidates lose; the claim protocol and its durable lease; the `claim → advance + insert → dispatch` ordering and the trade it makes (a duplicate fire is impossible, a lost fire is bounded and visible); the five dispatch gates; the misfire policy; the tick route with its authz; the CRUD surface; a 103-key i18n dictionary; and eleven schema deltas owed to the contract. **§3.3.3's three failure cases are the part to read twice.** | New; task **W3-1 is closed by it**; requests 22 sibling edits, listed in its §8.1; edited for conflicts C14, C17, C20 |

## For the backend / runtime team

| Document | Lines | What it is |
|---|---|---|
| **`BACKEND_INTEGRATION_CONTRACT.md`** | 2,772 | **The only document this team needs.** Written to be implemented against without reading anything else: identifiers and time, the responsibility split and trust boundary, the exact HMAC signing algorithm with worked examples you can verify against, the full read contract (every table and column a runtime needs, plus the `AgentManifest` projection), the write contract (16 event schemas, idempotency, ordering, retries), the four harnesses, six lifecycle sequences, versioning and prohibitions, and a conformance checklist. Ends with 10 open questions and 11 risks. |
| `research/RUNTIME_INTEGRATION.md` | 955 | Background, not contract. What the Manager API **actually** does today versus what v2 needs — endpoint inventory, the `category_id` → harness mapping, and a gap table marking runs/steps telemetry, schedules, skills install, context upload and webhook registration all **PROPOSED**. Read this to understand why parts of the contract are unreachable today. |

> **Two things gate everything in the contract**, and both are in `TASK_PLAN_V2.md` §8.2:
> nothing currently tells the Manager what `agents.id` is, so no inbound event can route; and
> every Manager address on record is RFC1918 plain HTTP, while the contract assumes outbound
> HTTPS in both directions.

## For QA

| Document | Lines | What it is |
|---|---|---|
| **`TEST_PLAN_V2.md`** | 2,152 | 36 use cases, 169 test cases (102 P0), 47 acceptance criteria, the P0→AC mapping, the automated strategy (`node:test` via `tsx`, ephemeral per-file Postgres schemas built from the real migrations, injected LLM and runtime doubles, and a global `fetch` guard that makes "zero outbound requests in mock mode" structural), and the manual matrix. §C.2 documents a live defect in `npm test` — the unquoted glob silently drops all 65 tests while exiting 0 — which task W0-1 fixes. |
| `research/SKILL_ECOSYSTEM.md` | 552 | Where the seed catalogue came from: 100 verified entries, the 16-category taxonomy, machine-readable sync sources, the OWASP Agentic Skills Top 10 as our risk vocabulary, and the scoring rubric. §F lists the claims that are **unverified** — read it before treating any download count or licence as fact. |

## Inherited v1 documents — still current

| Document | Status |
|---|---|
| `API.md`, `DATABASE.md`, `SPEC.md`, `PRD.md` | Current for v1 surface. v2 extends; it does not replace. `API.md:40` is authoritative on cross-workspace being **404, not 403**. |
| `PAYMENTS.md` | Current and unaffected. `lib/payments/config.ts` is the reference implementation of a correctly gated mock — copy its pattern for `AGENT_MANAGER_MODE` (task W6-2). |
| `USE_CASES.md`, `USER_STORIES.md`, `TASK_PLAN.md` | v1 history. `TEST_PLAN_V2.md` carries the conventions forward; `TASK_PLAN.md` is superseded by `TASK_PLAN_V2.md`. |

---

## The four late documents, and what closed when they landed

`PRP.md` · `DATA_MODEL_V2.md` · `REMINDERS_AND_SCHEDULERS.md` · `HARNESSES_AND_ACTIVITY.md`

All four were commissioned in the original brief, written after the other twelve documents had
already been reconciled with each other, and are now on disk and indexed above. An earlier revision
of this page listed three of them as "never written" — which meant its own stated reading order
never reached `DATA_MODEL_V2.md`, and an engineer following it built `lib/db/schema.ts` from the
three partitioned owners: the exact failure that document exists to end.

Three things that used to be true here and are not:

- **"There is no PRP", so `TEST_PLAN_V2.md` §B.13 defines the acceptance-criterion namespace
  rather than referencing one.** `PRP.md` now exists and **resolves against** that namespace — all
  51 acceptance-criterion ids it uses come from §B.13 and none were minted. §B.13 stays the
  definition; the PRP is what gives it a product to be about. `TASK_PLAN_V2.md` §8.1 remains the
  reconciliation point for "done".
- **"There is no data model document", so the schema is distributed across three design docs by
  ownership.** `DATA_MODEL_V2.md` is now the single authority for every table, column, index and
  constraint. The three owning documents keep their features; they no longer each declare a
  fragment of the schema. **`TASK_PLAN_V2.md` §2.1 remains the authority on migration *order*** —
  and `DATA_MODEL_V2.md` found a real defect in it, which is why every DDL slot moved up one.
- **"The schedule execution path is specified nowhere", so W3-1 and W3-2 are specification
  tasks.** W3-1 is closed by `REMINDERS_AND_SCHEDULERS.md`, and W3-2 is now an implementation task
  against its §3. The four routes conflict C9 called unspecified — `/api/cron/schedules`,
  `/api/agents/[id]/schedules/**`, `/api/agents/[id]/context/**`,
  `/api/agents/[id]/activity/**` — all have an owning section now.

**They also introduced eight new conflicts**, C14–C21, recorded in `TASK_PLAN_V2.md` §1a with the
winners and the edits already applied. The one worth knowing before you touch anything:

> **C14.** `lib/db/migrations/0007_v2_enum_values.sql` is already on disk and journaled with two
> statements. `drizzle-orm` decides applied-ness by `folderMillis`, never by file hash, so editing
> it is a permanent silent no-op on every migrated database *while a fresh CI replay goes green*.
> The remaining ten enum values live in a new `0008_v2_enum_values_2.sql`, and the DDL slots are
> now 0009 core · 0010 skills · 0011 templates · 0012 runtime.

---

## Reading orders

**New engineer, first week** → `PRP.md` §1–§3 (what we are building and what is out) · `TASK_PLAN_V2.md` §0, §1, §1a, §2 · `MOCK_DATA_AUDIT.md` §4 · `UI_DESIGN_V2.md` §A · the design doc for your wave.

**Anyone about to write a migration or a `lib/db/schema.ts` line** → `TASK_PLAN_V2.md` §2.1 (order — normative) · `DATA_MODEL_V2.md` §1.2 (the transaction hazard, stated exactly), §2 (the slot map), then the section for your slot · `DATA_MODEL_V2.md` §18 (the replay checklist). Do not skip §1.2: one Postgres exemption is relied on five times and one must never be.

**Backend/runtime team** → `BACKEND_INTEGRATION_CONTRACT.md` end to end · `research/RUNTIME_INTEGRATION.md` §3 for what is not built yet · `TASK_PLAN_V2.md` §8.2 for what we need from you.

**QA** → `TEST_PLAN_V2.md` §0 and §C · `TASK_PLAN_V2.md` §6 (gates) and §8.1 (definition of done).

**Product owner** → `PRP.md` §1 (the brief, as resolved) and §8 (twelve open questions, each with a default) · `TASK_PLAN_V2.md` §1 and §1a (what the designs disagreed about), §7 (risks), §8.2 (**eleven decisions that block named tasks** — seven original, four surfaced by the late documents).
