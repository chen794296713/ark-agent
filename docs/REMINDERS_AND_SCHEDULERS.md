# Reminders & Schedulers — the execution path

**Status:** design, normative for Wave 3. Produced by task **W3-1** (`docs/TASK_PLAN_V2.md` §3,
conflict **C9**). It answers the two questions W3-1 was opened for — the `kind='interval'`
idempotency contradiction and the `once` round trip — and then specifies the thing no document in
the corpus specifies: **who fires a due schedule, how it is claimed exactly once, and what happens
when that goes wrong.**

**Audience:** the ArkAgent engineer building Wave 3 (tasks W3-2 … W3-9). Their contract remains
`docs/BACKEND_INTEGRATION_CONTRACT.md`; what the backend/runtime team needs from *this* document is
four things and no more — §3.5.4's dispatch shape (including the `metadata` field of D21, which
they must echo as `scheduledFor`), §3.8.3's ingest handling, §3.8.5's read endpoint, and the four
new `skipReason` values of D13. Everything else here is ArkAgent-internal.

## What this document owns, and what it must not contradict

| Owned here | Owned elsewhere — cited, never restated as a proposal |
|---|---|
| The firing architecture (§3.1) and the claim protocol (§3.3) | The cron dialect and the DST policy — `lib/schedule/cron.ts:37-51`, `BACKEND_INTEGRATION_CONTRACT.md` §2.7 "The cron dialect, exactly" |
| `next_run_at` advance and misfire policy (§3.4, §3.9) | The `agent_schedules` / `agent_schedule_runs` DDL — `BACKEND_INTEGRATION_CONTRACT.md` §2.7 and §3.3, with the C4 and C6 corrections already applied |
| The tick route, the CRUD routes, their authz (§3.8) | The `agent.schedule_run` event schema — `BACKEND_INTEGRATION_CONTRACT.md` §3.4 |
| Retries, backoff, the expectation signal (§3.10) | The six lifecycle sequences — `BACKEND_INTEGRATION_CONTRACT.md` §5.3, §5.6 |
| The NL composition order (§4) | The screen layout — `UI_DESIGN_V2.md` §C.3.4. §5 here **extends** it; where the two disagree on a signature, §5 wins (that is task W3-5) |
| The schema deltas §3.0 requires | Everything else in the schema. §3.0 is additive and enumerated; it invents nothing outside `agent_schedules` and `agent_schedule_runs` |

**The DST policy is not reopened.** `lib/schedule/cron.ts:37-51` states it, `tests/cron.test.ts`
proves it, and `BACKEND_INTEGRATION_CONTRACT.md` §2.7 republishes it for the runtime. This document
cites it in three places and proposes nothing.

### The two W3-1 questions, answered in one line each

- **`kind='interval'`** (§3.6) — removed from the writable API. The column and the enum value stay;
  the editor's "every N minutes" control already encodes `*/N` cron (`UI_DESIGN_V2.md` §C.3.4), and
  any row that does exist is interpreted **start-anchored**, which makes `scheduled_for`
  pre-computable and the idempotency index real again.
- **`kind='once'`** (§3.7) — `ParsedSchedule.cron` is a carrier for time-of-day only and **never**
  reaches `cron_expr`. A one-off is written `kind='once'`, `run_at`, `cron_expr = NULL`, and the
  tick that fires it is also what disables it. Nothing fires annually because nothing stores a
  yearly cron.

---

## Contents

1. [The user's mental model](#1-the-users-mental-model) — kinds, the five things a user supplies, the column map
2. [What already exists](#2-what-already-exists) — the exact exported API of `lib/schedule/**`
3. [The execution path](#3-the-execution-path) — the core of this document
4. [Natural language → schedule](#4-natural-language--schedule)
5. [The UI contract](#5-the-ui-contract)
6. [Limits and abuse](#6-limits-and-abuse)
7. [i18n](#7-i18n)
8. [Deltas, open questions, and the test map](#8-deltas-open-questions-and-the-test-map)

---

# 1. The user's mental model

## 1.1 Two kinds, not three

The product surface has **two** kinds. The database has three, and one of them is not reachable.

| What the user calls it | What they mean | Stored as | Distinguished by |
|---|---|---|---|
| **A schedule** ("every weekday at 08:30") | a repeating instruction with an open end | `kind='cron'`, `cron_expr` set | it has a *next* run after this one |
| **A reminder** ("remind me on 3 September at 09:00") | a single instruction at a single instant | `kind='once'`, `run_at` set | firing it **ends** it — the tick disables the row |
| — (not offered) | — | `kind='interval'` | see §3.6 — legal in the DDL, refused by the API |

That is the whole taxonomy, and the distinction that matters is **"does firing consume it?"** A
reminder is a schedule with a population of one; everything downstream — claiming, dispatch, run
history, delivery, credits — is identical, which is why the two share one table, one editor, one
tick and one event.

The words matter in the UI: `UI_DESIGN_V2.md` §C.3.4 titles the section **REMINDERS &
SCHEDULERS**, and the editor labels a `once` row **Reminder** and a `cron` row **Schedule**. The
column is `kind`; the user never sees the word `cron` outside ADVANCED.

## 1.2 The five things a user supplies, and the column for each

Every schedule the product can express is five answers. This table is the contract between the
editor (§5), the validator (`lib/validation.ts`), and the tick (§3.5) — **every row names a real
column**, and the four that need a new one are marked and specified in §3.0.

### WHEN

| The user's answer | Column | Notes |
|---|---|---|
| "every weekday at 08:30" | `cron_expr varchar(120)` | 5-field Vixie cron. `kind='cron'`. Evaluated in `timezone`, never in UTC and never in the server's zone. |
| "on 3 September at 09:00" | `run_at timestamptz` | `kind='once'`. An absolute instant, resolved from wall clock + zone at write time by `resolveLocal` (§3.7). |
| "…in Asia/Shanghai" | `timezone varchar(64)` | IANA. Written from `workspaces.timezone` ?? `settings.timezone` ?? `'UTC'` at insert; the DDL default of `'UTC'` only catches a direct SQL insert (C6). |
| "which kind of when" | `kind schedule_kind` | `cron` \| `once`. `interval` is unreachable through the API (§3.6). |
| "don't fire the whole fleet at once" | `jitter_seconds integer` | 0..3600 (C6). Not exposed in the editor; defaults to 0. Applied **at dispatch, never to `next_run_at`** — see §3.4.4. |
| — computed, never typed | `next_run_at timestamptz` | ArkAgent-owned. The due predicate reads it; the runtime is told it is advisory (§2.7). |

### WHAT

| The user's answer | Column | Notes |
|---|---|---|
| "Check the shared inbox and draft replies" | `prompt text NOT NULL` | **User-authored text, dispatched as a user turn, never as a system instruction** (task W3-6, and §3.5 step 6 here). This holds for ATG- and LLM-generated prompts too — ATG writes straight into this column. |
| "call it Morning sweep" | `name varchar(120) NOT NULL` | Operator label. Presentation only. |
| "…in its own thread, not my chat" | `session_key varchar(160)` | Defaults to `agent:main:schedule:{scheduleId}`, which keeps scheduled work out of the human's conversation. Not exposed. |
| "is it on?" | `enabled boolean NOT NULL` | `false` never fires. **Disable is not delete** — the row and its history stay. |

### WHAT TO EXPECT

This is the one answer with no column in `BACKEND_INTEGRATION_CONTRACT.md` §2.7, and its absence is
why "my daily digest is broken" is unanswerable today: a run that started, succeeded, and produced
nothing is indistinguishable from a run that did its job on a quiet day.

| The user's answer | Column | Notes |
|---|---|---|
| "I expect a list of overnight tickets, or 'nothing new'" | **`expectation varchar(280)`** — NEW, §3.0 | Nullable. Two deterministic uses, no LLM: it is appended to the dispatched turn as a fenced acceptance note (§3.5 step 6), and it is what the run-history row's **unmet** badge refers to (§3.10.4). |
| — derived per occurrence | **`agent_schedule_runs.expectation_met boolean`** — NEW, §3.0 | `NULL` = not evaluated. `false` = the run terminated `succeeded` and produced no observable output. Evaluated by rule, never by a model (§3.10.4). |

### WHERE TO DELIVER

| The user's answer | Column | Notes |
|---|---|---|
| "post it in chat" / "email me" / "put it in Slack" / "just log it" | `deliver_to varchar(16) NOT NULL DEFAULT 'chat'` | `chat` \| `email` \| `channel` \| `none`, CHECK-constrained (C6). Exists **because** the generator materializes it (C4). `channel` is delivered by the **runtime** on its existing outbound path; `email` is sent **by ArkAgent** (§5.5 step 5 of the contract) and requires `MAIL_TRANSPORT_URL` — unset, the value is refused at create time. §3.5.4 has the table. |
| — the target itself | not a column | `email` resolves to `settings.escalateTo` ?? the workspace owner; `channel` resolves to the agent's connected `agent_channels` row. Both are validated at **create** time, not at fire time (§3.8.4) — a schedule that can never deliver must not be creatable, for the same reason a cron that can never match must not be (AC-SCH-4). |

### WHAT IF IT FAILS

| The user's answer | Column | Notes |
|---|---|---|
| "if the last one is still going, don't start another" | `overlap_policy schedule_overlap NOT NULL DEFAULT 'skip'` | `skip` \| `queue` \| `parallel`. Enforced by ArkAgent at dispatch (§3.5 step 5), not only by the runtime. |
| "if you were down, don't spam me on the way back" | `catch_up boolean NOT NULL DEFAULT false` | `false` drops the missed window; `true` runs **exactly one** catch-up. §3.9. |
| "don't let it hang forever" | `max_runtime_seconds integer NOT NULL DEFAULT 900` | 30..86400 (C6). Enforced by the runtime; ArkAgent's lease (§3.3.2) is the backstop when the runtime says nothing at all. |
| "don't let a mis-typed cron bankrupt me" | `max_runs_per_day integer NOT NULL DEFAULT 288` | 1..288 (C6). The circuit breaker ATG-L007 already respects. §6.3 lowers the **API** default to 96 while leaving the DDL default alone. |
| "wake it up if it's asleep" | `wake_runtime boolean NOT NULL DEFAULT true` | `false` ⇒ a stopped instance means `skipped`, `reason: "instance_stopped"`. |
| — what actually happened | `last_run_at`, `last_status varchar(24)`, and the `agent_schedule_runs` history | ArkAgent-owned, written from `agent.schedule_run` events (§3.8.3). |

## 1.3 The invariant the whole feature rests on

> `enabled = true` **iff** `next_run_at IS NOT NULL`.

`TEST_PLAN_V2.md` UC-V2-22 asks for this as a CHECK rather than a convention, and it is right:
`agent_schedules_due_idx … WHERE enabled AND next_run_at IS NOT NULL` is a partial index, not a
constraint, so a stray `UPDATE` can produce an enabled row that can never be selected — a schedule
that is on, shows a green toggle, and never fires. §3.0 adds the constraint. Every state change in
§3.4 preserves it, including the two that clear `next_run_at`: a fired `once`, and a cron that can
never match again.

---

# 2. What already exists

`lib/schedule/**` is **finished, tested and normative**. It is 1,329 lines, has no dependencies, and
`tests/{cron,schedule-parse,schedule-describe}.test.ts` cover it. Nothing in Wave 3 may
reimplement any of it, and `UI_DESIGN_V2.md` §C.3.4's sentence "no second parser may exist in the
client" is a hard rule on both sides of the wire — the runtime is invited to *port* `cron.ts`
(`BACKEND_INTEGRATION_CONTRACT.md` §2.7 names it as the definition), never to substitute a package.

Three modules, all **pure and client-safe** — no `server-only`, no I/O, no `Date.now()` inside them
except through arguments you pass. That is deliberate: the editor runs the same code on every
keystroke that the tick runs at fire time, so the preview cannot disagree with reality.

## 2.1 `lib/schedule/cron.ts` — the engine

```ts
import {
  parseCron, isValidCron, cronError,
  nextRun, nextRunParsed, nextRuns, runsBetween,
  resolveLocal, zonedParts, offsetMinutes, assertTimeZone, isValidTimeZone,
  CronParseError,
  type CronFields, type LocalParts, type Resolution, type NextRunOptions,
} from "@/lib/schedule/cron";
```

| Export | Signature | Use it for |
|---|---|---|
| `parseCron` | `(expression: string) => CronFields` — throws `CronParseError` | Parse once, evaluate many. |
| `isValidCron` | `(expression: string) => boolean` — never throws | Form validation, and re-validating a **model-produced** cron before it is shown (AC-SCH-3). |
| `cronError` | `(expression: string) => string \| null` | The inline message. Returns the *specific* reason, which is why TC-073 can demand "Expected 5 fields" rather than "invalid". |
| `nextRun` | `(expression, after: Date, timeZone = "UTC") => Date \| null` | One-shot next occurrence. |
| `nextRunParsed` | `(fields: CronFields, after: Date, timeZone = "UTC") => Date \| null` | **The tick uses this**, in a loop, on already-parsed fields. |
| `nextRuns` | `(expression, after: Date, timeZone = "UTC", count = 5) => Date[]` | The PREVIEW block. Note the signature: `after` is **mandatory and second** — `UI_DESIGN_V2.md` §C.3.4 cites `nextRuns(cron, tz, 5)`, which does not compile. Task W3-5. |
| `runsBetween` | `(expression, from: Date, to: Date, timeZone = "UTC", limit = 500) => { runs: Date[]; truncated: boolean }` | The misfire sweep (§3.9). Half-open `(from, to)`: strictly after `from`, strictly before `to`. |
| `resolveLocal` | `(local: LocalParts, timeZone) => Resolution` where `Resolution = { kind: "exact" \| "ambiguous" \| "gap"; instant: Date }` | Turning a wall clock into an instant. **This is how a `once` reminder gets its `run_at`** (§3.7). |
| `zonedParts` | `(instant: Date, timeZone) => LocalParts & { second: number }` | "What day is it, for this user?" — the `max_runs_per_day` window (§6.3) and `parseSchedulePhrase`'s `opts.today`. |
| `offsetMinutes` | `(instant: Date, timeZone) => number` | Diagnostics; the DST badge in the preview. |
| `assertTimeZone` / `isValidTimeZone` | `(timeZone: string) => void` (throws `RangeError`) / `=> boolean` | Zone validation. `.refine(isValidTimeZone)` is what `lib/validation.ts` is missing today (§2.3 of the contract flags it). |

Behaviours you must not re-derive, all proven in `tests/cron.test.ts`:

- **Resolution is one minute**, and `nextRun` is **idempotent when fed its own previous result** —
  which is the property that makes the `nextRuns` loop and the `runsBetween` loop terminate.
- A cron that can never match (`0 0 30 2 *`) returns `null` **after a bounded search**
  (`MAX_STEPS = 4 * 366 * 24`, `cron.ts:501`), never hangs.
- The Vixie union rule: both day fields restricted ⇒ **either** qualifies.
- The three DST rules (`cron.ts:37-51`): a **gap** wall clock fires at the jump instant; a
  **repeated** one fires once on the first pass; **unless** the expression is interval-like
  (unrestricted hour field), where both passes fire.

```ts
// Preview — exactly what the editor renders.
nextRuns("30 8 * * 1-5", new Date("2026-08-29T12:00:00Z"), "Asia/Singapore", 5);
// [ 2026-08-31T00:30Z, 2026-09-01T00:30Z, 2026-09-02T00:30Z, 2026-09-03T00:30Z, 2026-09-04T00:30Z ]
// i.e. Mon 31 Aug 08:30 SGT and the four weekdays after it.

// The advance the tick performs, anchored to the instant that just fired.
const fields = parseCron("30 8 * * 1-5");
nextRunParsed(fields, new Date("2026-08-31T00:30:00Z"), "Asia/Singapore");
// 2026-09-01T00:30:00Z

// Misfire accounting after an outage. Half-open, so `from` itself is NOT in `runs`.
runsBetween("*/5 * * * *", new Date("2026-08-01T00:00:00Z"), new Date("2026-08-29T00:00:00Z"), "UTC");
// { runs: [ …500 dates… ], truncated: true }   <- the cap, and the flag §3.9 keys on

// A wall clock the zone skips: 02:30 on a US spring-forward morning.
resolveLocal({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, "America/New_York");
// { kind: "gap", instant: 2026-03-08T07:00:00Z }   <- 03:00 local, per DST rule 1
```

## 2.2 `lib/schedule/parse.ts` — deterministic natural language

```ts
import {
  parseSchedulePhrase, extractTime, CONFIDENCE_FLOOR,
  type ParsedSchedule, type ParsedScheduleKind, type ParseOptions,
} from "@/lib/schedule/parse";
```

| Export | Signature | Notes |
|---|---|---|
| `parseSchedulePhrase` | `(input: string, opts?: ParseOptions) => ParsedSchedule \| null` | `null` means "nothing recognisable" — the signal to escalate to the model (§4), never to guess. |
| `CONFIDENCE_FLOOR` | `0.6` | The single threshold. §4.3 defines the three bands around it. |
| `extractTime` | `(input: string) => { hour, minute } \| null` | Exposed for the editor's "assumed 09:00" hint. |
| `ParseOptions` | `{ today?: { year, month, day } }` | **Relative one-offs silently stop parsing without it.** Pass `zonedParts(new Date(), tz)` — the schedule's zone, not the server's. `UI_DESIGN_V2.md` §C.3.4 omits this; task W3-5. |

`ParsedSchedule.kind` is `"recurring" | "one_off"` and is **not** `agent_schedules.kind`
(`cron | interval | once`). `ParsedSchedule.cron` is **not** `cron_expr` for a one-off. §3.7 owns
that conversion; nothing else may perform it.

```ts
parseSchedulePhrase("every weekday at 9am");
// { kind:"recurring", cron:"0 9 * * 1-5", matched:"every weekday", confidence:0.92 }

parseSchedulePhrase("每天早上九点");
// { kind:"recurring", cron:"0 9 * * *", matched:"daily", confidence:0.93 }   <- daily, not weekday

parseSchedulePhrase("9am");
// { kind:"recurring", cron:"0 9 * * *", matched:"time only — assumed daily", confidence:0.55 }
//   0.55 < CONFIDENCE_FLOOR -> the confirm band, §4.3

parseSchedulePhrase("tomorrow at 9", { today: { year: 2026, month: 8, day: 29 } });
// { kind:"one_off", cron:"0 9 30 8 *", onDate:"2026-08-30", matched:"tomorrow", confidence:0.9 }
//   the cron here is a TIME-OF-DAY CARRIER. It must never be written to cron_expr. §3.7.

parseSchedulePhrase("asdfgh");   // null -> §4.2 model path, or the cron form

// The trap §3.6 has to close. `every N minutes` accepts EVERY N in 1..59, not only the
// divisors of 60, and the result clears CONFIDENCE_FLOOR — so without an extra rule the
// NL field silently saves an uneven cadence.
parseSchedulePhrase("every 7 minutes");
// { kind:"recurring", cron:"*/7 * * * *", matched:"every 7 minutes", confidence:0.8 }
//   0.8 >= 0.6 -> band A. `*/7` fires :00 :07 … :56, then a 4-minute gap. §3.6 (iii).
parseSchedulePhrase("every 90 minutes");   // null — out of the 1..59 range, so band C/D,
//   NOT a 422. `interval_not_representable` is reachable only from the ADVANCED cron field
//   and from the API, never from this phrase. §3.6.
```

## 2.3 `lib/schedule/describe.ts` — cron → a sentence

```ts
import { analyzeCron, describeCron, describeSchedule, type CronShape } from "@/lib/schedule/describe";
```

| Export | Signature | Notes |
|---|---|---|
| `analyzeCron` | `(expression: string) => CronShape` — throws on a bad expression | The one structural analysis all four languages render from, so a Japanese string cannot quietly describe a different schedule from the English one. |
| `describeCron` | `(expression: string, lang: Lang = "en") => string \| null` | `null` when it does not parse — show `cronError()` instead of a lie. |
| `describeSchedule` | `(expression, timeZone, lang = "en") => string \| null` | `describeCron` + ` · <zone>`. **This is the schedule list row.** |

```ts
describeSchedule("30 8 * * 1-5", "Asia/Singapore", "en");  // "Every weekday at 08:30 · Asia/Singapore"
//   ^ the exact string this tree produces. NOT "Weekdays at 08:30" — every copy of this
//     sentence in §4.3, §4.4 and the UI mocks must use the real one.
describeCron("0 9 * * 1", "ja");                            // "毎週月曜日 09:00"
describeCron("*/15 9-17 * * 1-5", "en");
// today: "At minute 0, 15, 30, 45, hour 9-17, on Monday, Tuesday, …"  <- the generic fallback
```

That last line is task **W3-4**: `*/15 9-17 * * 1-5` is exactly what §C.3.4's *"every [15] minutes
between [09:00] and [18:00]"* control composes, so the most-used compound produces the least
readable sentence. W3-4 adds a `windowedInterval` shape to `CronShape` between `hourInterval` and
`daily`. This document depends on it only for display; nothing in §3 changes.

---

# 3. The execution path

## 3.0 The schema deltas this design requires

Eleven additive changes inside `agent_schedules` and `agent_schedule_runs`, plus one small new table.
They ship in the
schedule half of migration **`0012_v2_runtime.sql`** (`TASK_PLAN_V2.md` §2.1, task **W3-3**) and
are **normative deltas to `BACKEND_INTEGRATION_CONTRACT.md` §2.7 / §3.3** — §8.1 lists the exact
edits owed to that document. Nothing here renames or removes anything; no enum gains a value, so
none of this collides with the C5 enum-transaction hazard.

> **How these reach the migration file.** `agent_schedules` and `agent_schedule_runs` are
> **created** in `0012_v2_runtime.sql`, so none of what follows ships as an `ALTER`. The `ALTER`
> form below is the *diff against the contract's DDL*, written that way so the reviewer can see
> exactly what changed; **W3-3 folds every one of them into the `CREATE TABLE` statement** and the
> due index is emitted **once**, in its final form. A `DROP INDEX IF EXISTS` in the same file that
> creates the index is dead code, and a column added by `ALTER` immediately after its own
> `CREATE TABLE` is the shape drizzle-kit will never regenerate from `lib/db/schema.ts` — the two
> would diverge on the first `drizzle-kit generate`. This matters because §2.1's hazard is about
> *replay*: 0012 must be a single self-consistent file that a fresh database can run once.
>
> **One dependency outside this list.** §3.8.3's ingest handler writes `runtime_event_receipts`
> (`BACKEND_INTEGRATION_CONTRACT.md` §3.2), which `TASK_PLAN_V2.md` §2.1 does **not** list among
> 0012's contents and which the contract itself flags as "one table not in the agreed v2 table
> list". W3-3 creates it in 0012 alongside the rest, or `agent.schedule_run` ingest has no
> idempotency ledger. §8.1 D11 records the edit owed to §2.1.

```sql
-- ── agent_schedules ────────────────────────────────────────────────────────
-- (1) The claim lease. BACKEND_INTEGRATION_CONTRACT §2.7 has no claim column, and
--     TEST_PLAN_V2 UC-V2-20 step 1 is explicit that adding it is part of this work.
ALTER TABLE agent_schedules ADD COLUMN claimed_at    timestamptz;
ALTER TABLE agent_schedules ADD COLUMN claim_token   uuid;

-- (2) "What a good run looks like". §1.2 WHAT TO EXPECT. User-authored, <=280 chars,
--     dispatched as fenced data inside the user turn — never as a system instruction.
ALTER TABLE agent_schedules ADD COLUMN expectation   varchar(280);

-- (3) The invariant of §1.3, as a constraint rather than a convention. TEST_PLAN_V2
--     UC-V2-22 asks for this by name; TC-076 asserts the raw UPDATE is REJECTED.
ALTER TABLE agent_schedules ADD CONSTRAINT agent_schedules_enabled_next CHECK (
  (enabled AND next_run_at IS NOT NULL) OR (NOT enabled AND next_run_at IS NULL));

-- (4) The due scan now also filters on the lease, so the partial index must carry it.
--     This SUPERSEDES agent_schedules_due_idx as written in §2.7 — same name, same WHERE,
--     plus the lease column so the claim predicate is index-only; C6's IS NOT NULL arm is
--     preserved. 0012 emits this form and only this form: there is no DROP.
CREATE INDEX agent_schedules_due_idx ON agent_schedules (next_run_at, claimed_at)
  WHERE enabled AND next_run_at IS NOT NULL;

-- ── agent_schedule_runs ────────────────────────────────────────────────────
-- (5) Misfire accounting. `missed_truncated` carries runsBetween()'s own `truncated`
--     flag, so "247 missed" and "at least 500 missed" are different sentences in the UI
--     rather than the same lie. TEST_PLAN_V2 TC-079/TC-080.
ALTER TABLE agent_schedule_runs ADD COLUMN missed_count     integer NOT NULL DEFAULT 0;
ALTER TABLE agent_schedule_runs ADD COLUMN missed_truncated boolean NOT NULL DEFAULT false;

-- (6) Why this occurrence exists. TC-087 says a manual retry is `trigger='manual'`;
--     run_trigger (§2.1) has no such value and adding one would need its own migration
--     file ahead of use (the C5 hazard). This is a plain varchar on OUR table, and
--     agent_runs.trigger stays 'schedule' with trigger_ref = the schedule id.
ALTER TABLE agent_schedule_runs ADD COLUMN trigger varchar(12) NOT NULL DEFAULT 'schedule';
ALTER TABLE agent_schedule_runs ADD CONSTRAINT agent_schedule_runs_trigger
  CHECK (trigger IN ('schedule','manual','catch_up'));

-- (7) Retry state. §3.10.2. attempt starts at 1 for the first dispatch.
ALTER TABLE agent_schedule_runs ADD COLUMN attempt        integer NOT NULL DEFAULT 1;
ALTER TABLE agent_schedule_runs ADD COLUMN next_attempt_at timestamptz;

-- (8) The expectation signal. NULL = not evaluated. §3.10.4.
ALTER TABLE agent_schedule_runs ADD COLUMN expectation_met boolean;

-- (9) Who produced this row. Mirrors agent_health_samples.source (§3.3) — same name, same
--     width (varchar(16), not 8), for the same reason: a mock-mode occurrence must be
--     legible as mock in the UI and in support.
ALTER TABLE agent_schedule_runs ADD COLUMN source varchar(16) NOT NULL DEFAULT 'runtime';
ALTER TABLE agent_schedule_runs ADD CONSTRAINT agent_schedule_runs_source
  CHECK (source IN ('runtime','mock','local'));

-- (10) The history view and the stale sweep both scan by status+time; without this the
--      sweep is a full scan of every occurrence ever recorded.
CREATE INDEX agent_schedule_runs_sched_idx ON agent_schedule_runs (schedule_id, scheduled_for DESC);
CREATE INDEX agent_schedule_runs_open_idx  ON agent_schedule_runs (started_at)
  WHERE status = 'started';

-- (11) DELETE must not erase history, and history must stay ADDRESSABLE after the delete.
--      §3.3 declares schedule_id NOT NULL REFERENCES agent_schedules(id) ON DELETE CASCADE,
--      which erases it. `ON DELETE SET NULL` is worse than it looks: the rows survive but
--      `GET …/runs` filters by schedule_id, so nothing can ever read them again — "retained"
--      and unreachable is not what UC-V2-22 asked for. So: keep the column NOT NULL, drop
--      the foreign key, and snapshot the label. `agent_id` keeps its FK (ON DELETE CASCADE),
--      which is what still bounds the table and what every tenant query scopes on.
ALTER TABLE agent_schedule_runs DROP CONSTRAINT agent_schedule_runs_schedule_id_fkey;
ALTER TABLE agent_schedule_runs ADD COLUMN schedule_name varchar(120) NOT NULL DEFAULT '';
```

> *Rejected alternative:* a soft-delete flag on `agent_schedules`. The reason given in an earlier
> draft — "it puts a `deleted_at IS NULL` predicate into the due scan forever" — is **wrong**: a
> soft-deleted row is `enabled = false, next_run_at = NULL` and is therefore already outside
> `agent_schedules_due_idx`'s `WHERE` clause, so the due scan never sees it and needs no extra
> predicate. It is rejected for the real reason instead: it puts `deleted_at IS NULL` into every
> *list* query, the CRUD uniqueness rules, and the `MAX_ROWS_PER_AGENT` count, and one missed
> predicate resurrects a schedule the user deleted. Dropping one FK is a smaller surface.

```sql
-- ── scheduler_ticks — the tick ledger ──────────────────────────────────────
-- (12) One row per invocation of /api/cron/schedules. It exists for exactly one
--      reason that cannot be derived from anything else: on a plan whose cron
--      granularity is coarser than the schedules users created, EVERY other table
--      looks healthy. Without a record of when the tick actually ran, "my 5-minute
--      poll runs twice a day" is undiagnosable. Not agent-scoped and not tenant-scoped.
--      ROWS are never served to a tenant: /dashboard/admin reads them behind
--      requirePlatformRole("support") (lib/api.ts:61), and the only thing that crosses to
--      a tenant is the single derived scalar `observedTickSeconds` (§3.1, §3.8.2).
CREATE TABLE scheduler_ticks (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  claimed     integer     NOT NULL DEFAULT 0,
  dispatched  integer     NOT NULL DEFAULT 0,
  skipped     integer     NOT NULL DEFAULT 0,
  failed      integer     NOT NULL DEFAULT 0,
  retried     integer     NOT NULL DEFAULT 0,
  swept       integer     NOT NULL DEFAULT 0,
  saturated   boolean     NOT NULL DEFAULT false,   -- the claim batch hit its LIMIT
  source      varchar(12) NOT NULL DEFAULT 'vercel_cron'  -- vercel_cron | external | manual
);
CREATE INDEX scheduler_ticks_started_idx ON scheduler_ticks (started_at DESC);
```

The ledger is pruned by the tick itself — one `DELETE FROM scheduler_ticks WHERE started_at <
now() - interval '7 days'` per invocation, which at one row a minute is ~10k rows and never grows.

The unique index that makes all of this safe already exists in §3.3 and is not touched:

```sql
CREATE UNIQUE INDEX agent_schedule_runs_occurrence_uniq
  ON agent_schedule_runs (schedule_id, scheduled_for);
```

**Drizzle declarations** land in `lib/db/schema.ts` alongside the rest of the 0012 tables (W3-3),
in the style the file already uses — `pgTable(name, cols, (t) => [ …indexes… ])`, `timestamp(col,
{ withTimezone: true })` for every `timestamptz` (`lib/db/schema.ts:201` is the pattern; a bare
`timestamp()` emits `timestamp without time zone` and every DST guarantee in this document dies
silently), and `bigint("id", { mode: "number" }).generatedAlwaysAsIdentity()` for
`scheduler_ticks.id`. `claim_token` is `uuid("claim_token")` and nullable; `expectation_met` is
`boolean("expectation_met")` and nullable — a three-valued column on purpose, and the serializer
must not coerce `null` to `false`. `schedule_id` is declared **without** `.references()`, with a
comment naming this section, so a later "helpful" re-add does not reintroduce the cascade.

## 3.1 Who fires a due schedule

Three candidates, scored against the four constraints that actually decide it.

| | **(1) Backend polls a due-schedules endpoint** | **(2) Vercel Cron → an ArkAgent route that dispatches** | **(3) The runtime holds its own timers** |
|---|---|---|---|
| **ArkAgent is serverless — no long-lived process** | ✅ no ArkAgent process at all | ✅ the platform *is* the process; the route is a 60 s function | ✅ nothing on our side |
| **The runtime already holds the agent's context** | 🟡 it does, but it must ask us what is due, so the round trip exists anyway | 🟡 one extra hop: we inject `prompt` as a turn on `session_key`, which the runtime already knows how to receive (§5.3 step 4) | ✅ zero hops |
| **A missed daily digest is a support ticket** | ❌ liveness now depends on a poller we neither run, monitor, nor can page | ✅ one owner, one log, one alarm; missed ticks are visible in our own tick ledger | ❌ a **stopped** instance has no timer, so every `wake_runtime = true` schedule silently never fires — which is most of them |
| **Duplicate fires must be impossible** | ❌ exactly-once moves to a party whose retry semantics we cannot audit; two pollers = two fires unless *they* implement claiming | ✅ the claim and the `(schedule_id, scheduled_for)` unique index are both in our Postgres, under our test suite (TC-078) | ❌ same, plus a restarted container replaying its timers |
| **Ships when?** | needs a new upstream endpoint | **needs nothing upstream** | needs the whole `schedules` capability, marked ❌ in `research/RUNTIME_INTEGRATION.md` §3.1 |

### Decision — **(2). ArkAgent fires.**

A Vercel Cron entry invokes `/api/cron/schedules` once a minute; the route claims due rows from
Postgres, advances `next_run_at`, and injects each `prompt` as an ordinary user turn through the
existing chat path. This is `BACKEND_INTEGRATION_CONTRACT.md` §2.7's stated v2.0 design
("**ArkAgent fires**") and `research/RUNTIME_INTEGRATION.md` §3.1's recommended option (A), so this
document adds the mechanism rather than a new architecture.

- **(1) loses** because it makes an external service the guarantor of exactly-once for our
  customers' money, on an endpoint we would have to write anyway.
- **(3) loses** because the `schedules` capability does not exist upstream today, and a runtime
  timer inside a stopped container cannot honour `wake_runtime` — the single most common
  configuration.

Both rejected options remain reachable without a rewrite. The forward path is already in the
contract: when the runtime implements `schedules`, ArkAgent pushes the set declaratively via
`PUT /api/instances/{instanceId}/schedules` and **stops ticking those agents**, while
`agent.schedule_run` stays the only result event — so the Activity page and the run history never
learn that the firing authority changed. §3.8.5 specifies the read endpoint that makes that
migration a configuration change rather than a port.

### The platform tick is a real constraint, and it is measured, not assumed

`vercel.json` today contains only `$schema` and `framework`; there is no `crons` array and no
`/api/cron/**` route, and `docs/PAYMENTS.md:496` says so flatly. W3-2 adds:

```jsonc
// vercel.json
{ "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "crons": [
    { "path": "/api/cron/schedules", "schedule": "* * * * *" },
    // The nightly retention/rollup sweep. Not this document's — DATA_MODEL_V2.md §14.0 owns it
    // and HARNESSES_AND_ACTIVITY.md §7.2 supplies its numbers — but it is written here because
    // this is the file that creates the array, and a second PR that "adds crons" to a file that
    // already has them is how one of the two entries goes missing. Vercel Cron issues GET.
    { "path": "/api/cron/sweep", "schedule": "0 3 * * *" }
  ] }
```

**Two entries, and the plan gates the count as well as the granularity.** Hobby allows two
invocations *a day*, not two entries, so on Hobby the per-minute line is not merely coarse — it is
the reason `DATA_MODEL_V2.md` §14 consolidates every retention pass into the single `sweep`
invocation rather than one cron per table.

Per-minute cron requires a plan that allows it; Hobby allows **two invocations a day**, which would
turn every schedule in the product into a twice-daily one that reports itself as on-time. That is
`TASK_PLAN_V2.md` §8.2 decision 6 and it blocks W3-2. This design does **not** paper over it:

- The tick is **cadence-agnostic** — it processes everything due, so a coarse tick degrades into
  the misfire path (§3.9) rather than into silence.
- The route records its own start instant in the `scheduler_ticks` ledger (§3.0, delta 12) and computes `observedTickSeconds` as the median gap over the last 20 ticks.
- When `observedTickSeconds` exceeds the finest gap any enabled schedule in the workspace needs,
  the schedule list shows an amber banner — `schedule.tickTooCoarse` — naming the observed cadence.
  A user who asked for every 5 minutes and is getting every 12 hours must be told, not guessed at.
- The same route accepts an authenticated `POST` from any external pinger, so a deployment on a
  restrictive plan has a documented escape hatch (§3.8.1) rather than a broken feature.

> *Rejected alternative:* a self-rescheduling durable timer (QStash, an SQS delay queue, a
> `setTimeout` in a long-running worker). Correct, and it removes the platform-cadence question
> entirely — but every option adds a runtime dependency, and "no new runtime npm dependencies" is a
> hard constraint of this project. Revisit if §8.2 decision 6 comes back as "Hobby".

## 3.2 Three independent guarantees, not one

Before the SQL: exactly-once here is not one mechanism, it is three, layered so that no single bug
can produce a duplicate fire. Each is testable on its own.

| # | Guarantee | Mechanism | Fails if… |
|---|---|---|---|
| **G1** | Two ticks running at the same instant cannot claim the same row | `FOR UPDATE SKIP LOCKED` inside the claiming statement | never — this is a Postgres row lock, held for the duration of one statement |
| **G2** | A later tick cannot re-select an occurrence that has already been claimed | `next_run_at` is advanced **before** any dispatch, and the lease hides the row in between | the process dies between the claim and the advance — covered by G3 and by the lease expiry |
| **G3** | Two dispatches of the same occurrence cannot both be recorded | `UNIQUE (schedule_id, scheduled_for)` on `agent_schedule_runs`, inserted **before** dispatch | never — it is a database constraint |

G3 is the one that matters, and it is why the occurrence row is written **before** the dispatch
rather than after: the insert is the permit. A worker that cannot insert the occurrence row does
not dispatch. TC-078 asserts exactly this — the second tick's duplicate insert is rejected by the
index, and **the second tick treats the violation as success, not as an error**.

## 3.3 The claim protocol

### 3.3.1 The claiming statement

One statement. `FOR UPDATE SKIP LOCKED` inside a CTE that an `UPDATE` consumes, so the lock lives
only for the statement and the lease it writes is durable.

```sql
-- lib/services/schedules.ts :: claimDueSchedules(tickId, limit)
WITH due AS (
  SELECT s.id
    FROM agent_schedules s
    JOIN agents a ON a.id = s.agent_id
   WHERE s.enabled
     AND s.next_run_at IS NOT NULL
     AND s.next_run_at <= now()
     -- the lease: unclaimed, or claimed by a worker that is no longer alive
     AND (s.claimed_at IS NULL OR s.claimed_at < now() - ($2::integer * interval '1 second'))
     -- A draft / provisioning / deploying / paused / errored / terminated agent is skipped
     -- for DISPATCH without mutating `enabled`, so resuming restores the user's intent
     -- (§5.6 of the contract, and TEST_PLAN_V2 UC-V2-22 flow 1b). Filtered here rather than
     -- after the claim so a paused fleet does not consume the batch limit.
     -- An ALLOW-list of the three agent_status values that can accept work, not a deny-list
     -- of the six that cannot. `agent_status` (lib/db/schema.ts:44-54) has nine values, and
     -- the deny-list form omitted `error`, `provisioning` and `deploying` — an agent with no
     -- VM yet, or one the runtime has marked broken, would have been dispatched to. An
     -- allow-list makes a tenth status fail closed instead.
     AND a.status IN ('working','scheduled','needs_review')
   ORDER BY s.next_run_at
   LIMIT $3
   FOR UPDATE OF s SKIP LOCKED
)
UPDATE agent_schedules s
   SET claimed_at  = now(),
       claim_token = $1::uuid
  FROM due
 WHERE s.id = due.id
RETURNING s.*;
```

`$1` is a per-tick `claim_token` (one UUID for the whole tick, so every row a tick owns carries the
same token and a single guarded release is possible). `$2` is `SCHEDULER_LEASE_SECONDS`. `$3` is
the batch limit (§6.4).

**Why a `FOR UPDATE SKIP LOCKED` CTE and not a bare conditional `UPDATE … WHERE claimed_at IS NULL
RETURNING *`?** Both are atomic and both are correct for G1. The CTE form wins on two counts:

1. `ORDER BY next_run_at LIMIT n` is meaningful. A bare conditional `UPDATE … LIMIT` is not valid
   Postgres, and `UPDATE … WHERE id IN (SELECT … LIMIT n)` without `SKIP LOCKED` makes concurrent
   ticks *block* on each other instead of sliding past — under a per-minute cron with a slow tick,
   that converts overlap into a queue of stalled functions holding connections.
2. The oldest-first ordering is what keeps a backlog fair. Without it a saturated tick starves
   whichever schedules the planner happens to skip.

**Why not hold the transaction open across dispatch** (`BEGIN; SELECT … FOR UPDATE SKIP LOCKED;
<HTTP call>; COMMIT;`)? Rejected: it pins a pooled Postgres connection across network I/O — on a
serverless deployment behind a transaction-mode pooler that is the classic pool-exhaustion
pathology — and it makes the claim vanish when the function is killed, so a dispatch that was
already sent becomes re-claimable immediately. The durable lease is the whole point.

### 3.3.2 The lease

```
SCHEDULER_LEASE_SECONDS   default 300   (5 minutes)
route maxDuration          60           (Vercel function ceiling for this route)
```

**The lease MUST exceed the route's `maxDuration`.** If it did not, a tick still legitimately
working could have its claim stolen by the next tick, and the same occurrence would be dispatched
twice — G2 defeated by configuration. 300 > 60 with a 5× margin; W3-2 asserts this relationship in
a test, not in a comment, because the two numbers live in different files (`vercel.json` /
`route.ts` vs the env).

The lease is **released explicitly** at the end of a successful claim-and-advance
(`claimed_at = NULL, claim_token = NULL` in the same statement that advances `next_run_at`), so in
the healthy path the lease is held for milliseconds, not minutes. It only *expires* after a crash.

### 3.3.3 When a worker dies holding a claim

The interesting question, and the answer differs by exactly where it died. The dividing line is the
occurrence insert, because that is the permit.

| Death point | State left behind | What the next tick does | Result |
|---|---|---|---|
| **A** — after the claim, before the advance | `claimed_at` set, `next_run_at` unchanged, no occurrence row | Lease expires after 300 s; the row is due again with the **same** `next_run_at`, so it is re-claimed and dispatched | The occurrence fires, up to 5 minutes late. Correct: nothing was dispatched, so nothing is duplicated. |
| **B** — after the advance + occurrence insert, before dispatch | `next_run_at` advanced, `claimed_at` cleared, occurrence row `started` | Never re-claimed (G2). The **stale-run sweep** (§3.5.2) finds an occurrence `started` for longer than the lease with no terminal event and writes `failed`, `error_code: 'dispatch_lost'` | The occurrence is **lost**, and it is *reported as lost* — then retried by §3.10.2 if it is still inside the retry window |
| **C** — after dispatch, before the response was read | as B, but the runtime is actually running the work | Same sweep — but the runtime's own `agent.schedule_run` `succeeded` arrives and **UPSERTs over** the swept row, because `succeeded` outranks `failed` (§3.8.3's rank rule) | Self-healing. The truth wins, whichever order the two writes arrive in. |

This is the deliberate trade the whole design turns on, and it is worth stating plainly:

> **A duplicate fire is impossible. A lost fire is possible, bounded to a worker crash, and always
> visible.** Case B is the only way to lose one, it lasts one lease, it produces a `failed` row
> with a named `error_code`, it is auto-retried once inside a 15-minute window, and it is one click
> from **Run now**. The alternative ordering — dispatch first, record after — turns every crash into
> a possible double fire, and a double fire on a `deliver_to='email'` invoice reminder is a
> customer-visible incident that no amount of history can undo.

Case C is why the rank rule in `BACKEND_INTEGRATION_CONTRACT.md` §3.3 is load-bearing rather than
tidy: `started(0) < skipped(1) < failed(2) = succeeded(2)`, and a lower rank never overwrites a
higher one. §3.8.3 refines the one place it is ambiguous (`failed` vs `succeeded`, equal rank).

## 3.4 Advancing `next_run_at`

### 3.4.1 When: before dispatch, in the same transaction as the occurrence insert

The ordering is **claim → advance + insert occurrence (one transaction) → dispatch**, and the
"before" is what makes duplicates structurally impossible rather than merely unlikely.

The due predicate is `next_run_at <= now()`. If the advance happened after the run completed, then
for the entire duration of the run the row still satisfies that predicate — so with a per-minute
tick, a 4-minute run is selected by four consecutive ticks. `overlap_policy` would catch three of
them, but `overlap_policy` is a *policy* evaluated in application code, and the fourth failure mode
is the one that matters: if the run never reports a terminal status (case B above), the row stays
due **forever** and the schedule fires every minute until someone notices. Advancing first removes
the row from the due set the instant it is claimed, permanently, regardless of what happens next.

The advance and the occurrence insert are one transaction because either alone is a hole: advance
without the occurrence row and the fire is untraceable; occurrence row without the advance and the
next tick re-selects it and hits G3 (harmless, but it burns a claim slot every tick forever).

```ts
// lib/services/schedules.ts — the atomic step, per claimed row
const occ = await db.transaction(async (tx) => {
  const [row] = await tx
    .insert(agentScheduleRuns)
    .values({ scheduleId, scheduleName: schedule.name, agentId, scheduledFor,
              status: "started", startedAt: new Date(),
              trigger, missedCount, missedTruncated, source, attempt: 1 })
    .onConflictDoNothing({ target: [agentScheduleRuns.scheduleId, agentScheduleRuns.scheduledFor] })
    .returning();
  if (!row) return null;            // G3: someone else owns this occurrence. Release and move on.
  const advanced = await tx.update(agentSchedules)
    .set({ nextRunAt: next.nextRunAt, enabled: next.enabled,
           lastRunAt: scheduledFor, lastStatus: "started",
           claimedAt: null, claimToken: null, updatedAt: new Date() })
    .where(and(eq(agentSchedules.id, scheduleId), eq(agentSchedules.claimToken, tickToken)))
    .returning({ id: agentSchedules.id });
  // THE GUARD THAT MATTERS. If the token no longer matches, our lease expired and another
  // tick owns this row. Without this check the occurrence row is committed and the advance
  // is not — which is precisely the "burns a claim slot every tick forever" state described
  // two paragraphs down, except now it also DISPATCHES. Throwing rolls back the insert.
  if (advanced.length === 0) throw new ClaimLostError(scheduleId);
  return row;
});
if (occ === null) { /* G3 */ }      // release the claim, no dispatch, not an error
// ClaimLostError is caught by the per-row wrapper of §3.5.1: no occurrence, no dispatch,
// counted in `skipped`, warning `claim_lost`. The healthier tick already did the work.
```

The `claim_token` guard on the `UPDATE` is not decoration: it is what stops a tick whose lease has
already expired — a tick that has been paused by the platform for six minutes and then resumed —
from stamping a stale `next_run_at` over the value a healthier tick has since written. **And
because the guard can legitimately match zero rows, the transaction must inspect the row count.**
An `UPDATE … WHERE claim_token = $tick` that matches nothing is not an error Postgres reports; it
is a silent no-op that commits the occurrence insert and leaves `next_run_at` where it was.

### 3.4.2 How: `nextRunParsed`, anchored to the instant that fired

```ts
// lib/schedule/advance.ts — pure, client-safe, shared by the tick and by the editor preview.
import { parseCron, nextRunParsed, type CronFields } from "./cron";

export interface AdvanceInput {
  kind: "cron" | "interval" | "once";
  cronExpr: string | null;
  intervalSeconds: number | null;
  timezone: string;
}
export interface AdvanceResult {
  /** null ⇒ this schedule has no future. `enabled` is then false, per §1.3. */
  nextRunAt: Date | null;
  enabled: boolean;
  /** Set when nextRunAt is null and it was not a `once`. Surfaces in the UI. */
  reason?: "once_consumed" | "never_matches";
}

export function advanceSchedule(s: AdvanceInput, anchor: Date, now: Date): AdvanceResult {
  if (s.kind === "once") return { nextRunAt: null, enabled: false, reason: "once_consumed" };

  if (s.kind === "interval") {
    // Start-anchored, not end-anchored. §3.6.
    const step = (s.intervalSeconds ?? 60) * 1000;
    let t = anchor.getTime() + step;
    if (t <= now.getTime()) {
      // Jump whole intervals rather than looping: a 60 s interval over a 3-day outage
      // is 4,320 iterations of nothing. FLOOR + 1, not CEIL: with ceil, an exact multiple
      // lands t on `now` itself, which still satisfies the `next_run_at <= now()` due
      // predicate and re-fires the same instant on the very next tick.
      const behind = Math.floor((now.getTime() - t) / step) + 1;
      t += behind * step;
    }
    return { nextRunAt: new Date(t), enabled: true };
  }

  const fields: CronFields = parseCron(s.cronExpr!);      // validated at write time
  // ONE call from the anchor. §3.9 guarantees the anchor is at or after the newest
  // occurrence we are accounting for, so this is the correct next instant in the sequence.
  let next = nextRunParsed(fields, anchor, s.timezone);
  if (!next) return { nextRunAt: null, enabled: false, reason: "never_matches" };
  if (next.getTime() <= now.getTime()) {
    // Still in the past. Do NOT walk the sequence forward one occurrence at a time — for
    // `*/1 * * * *` after a 28-day outage that is ~40,000 calls to a function that itself
    // walks wall-clock minutes, inside a 60-second serverless function. Re-anchor to `now`
    // in a single call. The occurrences we skipped are already accounted for by §3.9's
    // missed_count / missed_truncated; walking them again would only re-derive a number we
    // have already recorded.
    next = nextRunParsed(fields, now, s.timezone);
  }
  return next
    ? { nextRunAt: next, enabled: true }
    : { nextRunAt: null, enabled: false, reason: "never_matches" };
}
```

**`anchor`, not `scheduledFor`.** The parameter is named for what it is, because §3.9 passes three
different things into it: `scheduledFor` on the normal path, `newest` after a bounded misfire, and
`now` after a **truncated** one. That last case is the one the earlier `while` loop got wrong:
`runsBetween` caps at 500, so `newest` after a 28-day per-minute outage is only 500 minutes past
`scheduledFor` and still ~39,800 occurrences behind `now`.

**Anchored to `scheduledFor` on the healthy path, not to `now()`.** Anchoring to `now()` after a
slow tick silently deletes the occurrences in between, so a schedule that fell 90 seconds behind
loses a fire and nothing records it. Anchoring to the instant that fired means the sequence
ArkAgent walks is *exactly* the sequence the cron defines, and the decision about the occurrences
in between is made once, explicitly, by the misfire policy (§3.9) — which is where it belongs and
where the user's `catch_up` flag can reach it.

**Cost is bounded at two `nextRunParsed` calls, always.** That is the whole reason the fallback
re-anchors to `now` instead of stepping. `nextRunParsed` is itself bounded (`MAX_STEPS = 4·366·24`,
`cron.ts:501`) but each call can walk months of wall-clock minutes, so the number of *calls* is the
budget that matters inside a 60-second function holding up to 200 claims.

### 3.4.3 The two terminal states, and the invariant

| Situation | `next_run_at` | `enabled` | `last_status` | Surfaced as |
|---|---|---|---|---|
| A `once` reminder just fired | `NULL` | `false` | terminal status of the run | The row renders greyed with "Fired — 3 Sep 09:00" and a **Duplicate** action. TC-083. |
| A cron whose next match is beyond the search bound (`0 0 30 2 *`) | `NULL` | `false` | *unchanged* | Amber row: "This will never run again." Creation is refused for the same condition (AC-SCH-4, TC-050), so this can only arise from an edit that narrowed a live expression. |
| Everything else | the computed instant | `true` | as reported | normal |

**`last_status` is a run status and nothing else.** It holds one of
`started | succeeded | failed | skipped` — the same closed vocabulary as
`agent_schedule_runs.status`, which is what makes one `lib/i18n/activity.ts` entry render both.
Writing `never_matches` into it, as an earlier draft did, puts a *schedule* state into a *run*
column and breaks that shared rendering. The two terminal states are derived instead, and are
distinguishable without a new column:

```
enabled = false AND next_run_at IS NULL AND kind = 'once'  ->  fired, consumed   (§5.5 onceConsumed)
enabled = false AND next_run_at IS NULL AND kind = 'cron'  ->  will never run    (§5.5 neverRuns)
enabled = false AND next_run_at IS NULL AND last_run_at IS NULL AND kind = 'cron'
                                                           ->  paused by the user, never ran
```

The third row is why the user-facing pause is distinguishable from `never_matches` at all: a user
toggle leaves `last_run_at` alone, and a cron that has never matched has never run. Where that is
ambiguous — a live schedule the user narrowed into unmatchability after it had already run — the
serializer recomputes `nextRun(cronExpr, now, timezone) === null` and reports `neverRuns`. It is
one `cron.ts` call on a row the user is already looking at, and it is cheaper than a column.

Both terminal states satisfy the §1.3 CHECK. So does the user toggling `enabled` off, which the
CRUD route must implement as **`enabled = false, next_run_at = NULL`** in one `UPDATE` — and
toggling on as `enabled = true, next_run_at = nextRun(cron, now(), tz)`, recomputed from **now**,
never from the stale stored value (TC-088).

### 3.4.4 Jitter is applied at dispatch, never to `next_run_at`

`jitter_seconds` de-synchronises a fleet that all fires at `0 9 * * *`. It must **not** be added to
`next_run_at`, for two reasons: the previewed times would stop matching the actual ones, and jitter
compounds across occurrences into drift. Instead the claim predicate stays exact and the tick
delays the *dispatch* by a per-occurrence random offset in `[0, jitter_seconds]` — in practice, by
deferring the row to a later tick:

```
jitterOffset  = hash(scheduleId, scheduled_for) mod (jitter_seconds + 1)   // seconds, 0..n
dispatchAfter = scheduled_for + jitterOffset
```

A deterministic hash rather than `Math.random()`, so a retried or re-swept occurrence lands on the
same offset instead of walking. If `dispatchAfter > now()`, the tick releases the claim
(`claimed_at = NULL`) **without advancing** and the row is picked up by a later tick — which is why
`jitter_seconds` is capped at 3600 (C6) and why the editor does not expose it (§C.3.4 keeps it
hidden as a fleet-operations knob).

> **`dispatchAfter`, not `scheduled_for`, is the instant lateness is measured from.** This is not a
> refinement, it is a correctness requirement, and getting it wrong breaks jitter completely.
> §3.9.1's misfire grace is `SCHEDULER_GRACE_SECONDS = 120`. A schedule with `jitter_seconds = 300`
> is *designed* to be dispatched up to 300 s after `scheduled_for`; measuring lateness from
> `scheduled_for` would put every single one of its occurrences in the **misfired** band, and with
> the default `catch_up = false` every one of them would be written `skipped / misfire` and never
> run. A fleet-operations knob would have silently disabled the fleet. So §3.9.1 reads:
> `lateness = now - dispatchAfter`, and `dispatchAfter = scheduled_for` whenever
> `jitter_seconds = 0`, which is the default and the overwhelming majority of rows.

**The deferral is not free, and it is counted honestly.** Each tick that defers a jittered row
claims it and releases it, so a `jitter_seconds = 3600` occurrence is claimed and released up to 60
times before it runs. Those claims are recorded in `scheduler_ticks.claimed` but **not** in
`dispatched`, and a deferral does not set `saturated` on its own — otherwise a jittered fleet would
report permanent saturation. This is the second reason the cap is 3600 and the editor does not
expose the field.

## 3.5 The tick, end to end

### 3.5.1 The loop

`app/api/cron/schedules/route.ts` — one handler, shared by `GET` and `POST` (§3.8.1).

```
 0. AUTHENTICATE. Bearer CRON_SECRET, timingSafeEqual. Fail closed when unset -> 401.
 1. INSERT scheduler_ticks (started_at, source) RETURNING id.
 2. SWEEP stale occurrences               (§3.5.2)  -> swept
 3. CLAIM  due schedules, LIMIT 200       (§3.3.1)  -> rows[], saturated = rows.length === 200
 4. For each row, sequentially per agent / concurrently across agents (§6.4):
      4a. JITTER: compute dispatchAfter (§3.4.4). If dispatchAfter > now, release the claim
          without advancing. Stop here.
      4b. MISFIRE: lateness = now - dispatchAfter (§3.9) -> decides the anchor, whether this
          occurrence runs at all, and missed_count / missed_truncated.
      4c. GATE: working hours, instance stopped, overlap, max_runs_per_day, credits,
          delivery target (§3.5.3) -> a gate that fails writes a `skipped` occurrence,
          advances, and stops here.
      4d. ADVANCE + INSERT OCCURRENCE, one transaction (§3.4.1).
          Conflict -> release the claim and stop here (G3, not an error).
          ClaimLostError -> release nothing, stop here, count as `skipped`.
      4e. DISPATCH (§3.5.4).
      4f. Record the dispatch outcome on the occurrence row.
 5. RETRY PASS: occurrences eligible for a retry (§3.10.2) -> dispatch, same 4e/4f.
 6. PRUNE scheduler_ticks older than 7 days.
 7. UPDATE scheduler_ticks SET finished_at, duration_ms, counters, saturated.
 8. 200 { tickId, startedAt, durationMs, claimed, dispatched, skipped, failed, retried,
           swept, saturated, observedTickSeconds, warnings[] }
```

**The order 4a → 4b → 4c is load-bearing, and it is not the order an earlier draft had.** Jitter
must resolve before lateness is measured, or every jittered occurrence reads as misfired
(§3.4.4). Lateness must resolve before the gates, because the *misfire* decision changes which
instant the gates are evaluated against: a `catch_up = true` schedule runs at `newest`, and asking
"was `scheduledFor` inside working hours?" when the occurrence is going to run at `newest` answers
the wrong question. Gate 2 therefore tests the instant that will actually be dispatched.

Two further properties of this loop are deliberate and testable:

- **It never throws out of step 4.** One agent whose runtime is unreachable must not abort the tick
  for every other tenant. Each row is wrapped; a thrown error becomes `failed` on that occurrence
  with `error_code: 'dispatch_failed'` and the loop continues. A tick that 500s is a tick Vercel
  retries, which is the one thing that could produce the duplicate this design exists to prevent —
  the claim protocol survives it, but there is no reason to test that in production every minute.
- **It is idempotent under replay.** Invoking it twice in the same second is TC-078, and the
  correct outcome is that the second invocation claims nothing and returns `claimed: 0`.

### 3.5.2 The stale-run sweep

```sql
UPDATE agent_schedule_runs
   SET status = 'failed', error_code = 'dispatch_lost',
       error_message = 'No terminal status was reported before the lease expired.',
       finished_at = now(),
       next_attempt_at = CASE WHEN attempt < 3 AND now() - scheduled_for < interval '15 minutes'
                              THEN now() + (CASE attempt WHEN 1 THEN interval '1 minute'
                                                         ELSE interval '5 minutes' END)
                              ELSE NULL END
 WHERE status = 'started'
   AND started_at < now() - ($1::integer * interval '1 second')   -- SCHEDULER_LEASE_SECONDS
RETURNING id, schedule_id;
```

This is case B of §3.3.3, and case C's self-healing depends on it not being destructive: a later
`agent.schedule_run` `succeeded` UPSERTs over this row because `succeeded` ties `failed` at rank 2
and the tie-break is last-write-wins (§3.8.3). A second statement, in the same transaction, updates
`agent_schedules.last_status` for the affected schedules so the list does not keep showing
"running" forever — **guarded the same way §3.8.3 guards it**, so a sweep of an old occurrence
cannot stamp over a newer one:

```sql
UPDATE agent_schedules s
   SET last_status = 'failed', updated_at = now()
  FROM swept w
 WHERE s.id = w.schedule_id
   AND (s.last_run_at IS NULL OR s.last_run_at <= w.scheduled_for);
```

The sweep does **not** touch `enabled` or `next_run_at`: those advanced before the dispatch
(§3.4.1) and a lost occurrence is not a reason to stop a schedule (AC-SCH-7).

**The sweep threshold is the lease, not `max_runtime_seconds`.** They measure different things:
`max_runtime_seconds` (default 900, up to 86400) is how long the *runtime* may work; the lease is
how long ArkAgent waits for the runtime to say *anything at all*. A run legitimately taking 40
minutes reports `started` within seconds, and `started` is what the sweep looks for the absence of.

### 3.5.3 The gates, in order

Each gate that fails writes exactly one `agent_schedule_runs` row with `status='skipped'` and a
`skip_reason` drawn from `BACKEND_INTEGRATION_CONTRACT.md` §3.4's enumerated list, extended by
D13 — every value is a translation key in `lib/i18n/activity.ts`, and **no reason is emitted
before its dictionary entry exists in all four languages** (§7.1).

| Order | Gate | Condition | `skip_reason` | Advances `next_run_at`? |
|---|---|---|---|---|
| 1 | Agent state | `agents.status NOT IN ('working','scheduled','needs_review')` | — | filtered before the claim (§3.3.1); no occurrence row, no advance — resuming restores intent (UC-V2-22 flow 1b). See the note below: this is the one gate that writes nothing, and it is a deliberate exception to the rule under this table |
| 2 | Working hours | `!settings.alwaysOn` and `scheduled_for` falls outside `workStart`–`workEnd` on a `workDays` weekday, evaluated in `settings.timezone` via `zonedParts` | `outside_working_hours` | ✅ yes |
| 3 | Instance stopped | runtime reports the instance stopped **and** `wake_runtime = false` | `instance_stopped` | ✅ yes |
| 4 | Overlap | a prior occurrence of *this* schedule is still `started`, and `overlap_policy = 'skip'` | `overlap` | ✅ yes |
| 5 | Daily ceiling | occurrences of this schedule already recorded today, counted in the schedule's **own** `timezone` via `zonedParts`, ≥ `max_runs_per_day` | `max_runs_per_day` | ✅ yes |
| 6 | Credits | `workspaces.credits_included - workspaces.credits_used <= 0`, or `settings.monthlyCreditCap > 0 AND agents.credits_used >= settings.monthlyCreditCap` | `credit_cap_reached` | ✅ yes |
| 7 | Delivery target | `deliver_to='channel'` and no `agent_channels ⋈ channels` row for this agent with `channels.status='connected'`; or `deliver_to='email'` and no usable address (§3.8.4) | `channel_not_bound` | ✅ yes |

Gates 2–7 each write exactly one row; `skip_reason` is the column, and `skipped` is the status.
Four of the reasons above — `channel_not_bound`, `misfire`, `misfire_too_old` (§3.9) and
`dispatch_unsupported` (§3.5.4) — are **not** in `BACKEND_INTEGRATION_CONTRACT.md` §3.4's
enumerated `skipReason` list. They are ArkAgent-originated, the runtime never sends them, and they
are added to that list by delta **D13** so there is exactly one vocabulary and exactly one
dictionary. The sentence "no new skip reasons are invented" below is therefore narrowed to its
true form: **ArkAgent invents no reason the runtime could have sent, and every reason it does
originate is registered in the same enumerated list before it is emitted.**

Gate 2 uses `settings.timezone` (the agent's working day) while gate 5 uses
`agent_schedules.timezone` (the schedule's own zone). They are usually the same and are allowed to
differ; conflating them is how a Singapore agent with a US-Eastern schedule gets its ceiling reset
at the wrong midnight.

`overlap_policy = 'queue'` defers rather than skips: release the claim without advancing, and let a
later tick pick it up once the prior occurrence terminates. `'parallel'` skips gate 4 entirely.
Neither is exposed in the editor (§C.3.4).

**A `queue` deferral is bounded, and the bound is not the misfire clock.** Deferral without
advancing means the row stays due, so on the next tick it is re-claimed, re-measured for lateness
(4b), and — once the prior run has been going longer than `SCHEDULER_GRACE_SECONDS` — classified as
**misfired**, at which point `catch_up = false` writes `skipped / misfire` and nothing ever runs.
`queue` would have been a slower, less honest `skip`. So the deferral is explicit rather than
emergent:

- a row deferred by `queue` carries its own clock, `now - dispatchAfter`, and gate 4 is evaluated
  **before** the misfire band is allowed to consume it (this is why 4b hands the band to 4c rather
  than acting on it);
- the deferral is capped at the blocking occurrence's `max_runtime_seconds`. Past that, the
  blocking run is itself past its own limit and the sweep (§3.5.2) is about to fail it; the queued
  occurrence is written `skipped`, `skip_reason: 'overlap'`, and advanced. It never becomes a
  `misfire`, because nothing was missed — it was refused, and the reason the user needs is
  "the previous run was still going", not "ArkAgent was unavailable".

Concretely: 4b computes the band and attaches it to the occurrence; 4c gate 4 may override a
`misfired` band with a `skipped / overlap` outcome; only a band that survives gate 4 reaches
§3.9.3.

**A skipped occurrence is always written — with exactly one exception, and it is deliberate.**
`BACKEND_INTEGRATION_CONTRACT.md` §3.4 states the rule for the runtime and it applies identically
to ArkAgent's own gates: *silence is indistinguishable from a broken scheduler, and "why didn't it
run?" is the single most common support question about reminders.*

The exception is **gate 1**, and it is a conflict with the contract that has to be named rather
than glossed. `BACKEND_INTEGRATION_CONTRACT.md` §5.6 pause step 5 says schedules for a paused agent
are *"skipped, reported with `reason: "instance_stopped"`"* — one reported occurrence per fire.
This document does not do that, because a fleet paused for three weeks with a `*/5` schedule would
accumulate **6,048 identical `skipped` rows per schedule**, which is not observability, it is a
denial of service against the run-history table and against the operator reading it.

**Decision: a paused, terminated, draft, provisioning, deploying or errored agent produces no
occurrence rows at all.** `next_run_at` is left where it is, `enabled` is never touched, and the
whole pause is accounted for **once**, on resume, by §3.9.5 — one `skipped / misfire` row carrying
`missed_count`, or one `started / catch_up` row, exactly as any other outage. The user gets the
same fact ("nothing ran while it was paused, here is how much"), in one row instead of six
thousand. `BACKEND_INTEGRATION_CONTRACT.md` §5.6 step 5 is narrowed accordingly — delta **D14**.

### 3.5.4 Dispatch, and its two fallbacks

Dispatch is **two** calls, not one, and the first is the one every draft of this section has
omitted.

```ts
// 0. WAKE. BACKEND_INTEGRATION_CONTRACT §5.3 step 3: "if the instance is stopped and
//    wake_runtime is true, POST /api/instances/{instanceId}/start". Skipping this is why
//    gate 3 exists at all — without a wake, `wake_runtime = true` (the DDL default, and the
//    single most common configuration) silently never fires on a stopped instance.
if (schedule.wakeRuntime && instanceState === "stopped") {
  await manager.setLifecycle(agent.agentManagerId, "resume");
}

// 1. The turn ArkAgent injects. §5.3 step 4 of the contract.
await manager.sendMessage(agent.agentManagerId, {
  conversationId: sessionKey,          // agent:main:schedule:{scheduleId}
  channel: "web",
  body: buildScheduledTurn(schedule),  // below
  metadata: { trigger: "schedule", triggerRef: scheduleId,
              scheduledFor: scheduledFor.toISOString() },
});
```

**Two shipped types have to change, and W3-2 owns both.**

| File | Today | Needed |
|---|---|---|
| `lib/agent-manager/types.ts:42` | `SendMessageInput = { conversationId; body; channel }` | `+ metadata?: Record<string, string>`. Without it the `{trigger, triggerRef, scheduledFor}` correlation of §5.3 step 4 **has nowhere to travel**, and `scheduledFor` is the second half of the idempotency key the runtime must echo back on `agent.schedule_run` (§3.8.3). Every other guarantee in this document assumes the runtime knows which occurrence it is running. |
| `lib/agent-manager/live.ts:45` | forwards `input` verbatim to `POST /v1/agents/{id}/messages` | unchanged — it already forwards the whole body, so adding the field is enough. `mock.ts:62` ignores it, which is correct. |

**How ArkAgent learns the instance is stopped.** It does not poll. `agents.status` (gate 1) already
excludes `paused` and `terminated`; a `working` agent whose *container* is stopped is a runtime
fact ArkAgent learns from `agent_health_samples.state` (§3.3 of the contract) — the newest sample
for this agent, and only when it is fresher than two heartbeat intervals. **When there is no fresh
sample, ArkAgent dispatches anyway**: the runtime is the authority on its own instance, and
refusing to dispatch on missing telemetry converts a monitoring gap into a missed digest. Gate 3
therefore fires only on a *positive* `stopped` reading with `wake_runtime = false`; everything else
proceeds and the runtime reports `skipped / instance_stopped` itself if it disagrees.

> *Note, not a defect:* `LifecycleAction` is `"pause" | "resume" | "terminate"`
> (`lib/agent-manager/types.ts:15`), so the wake uses `"resume"`. That is the existing vocabulary
> and this document does not widen it; if W6 adds a distinct `start`, this call moves with it.

`buildScheduledTurn` is the security boundary and it is three lines with a rule attached:

```ts
const FENCE_BREAK = /<\/?expected-result[^>]*>/gi;

export function buildScheduledTurn(s: { prompt: string; expectation: string | null }): string {
  const expect = s.expectation
    // Strip anything that could close the fence early. `expectation` is user-authored and
    // capped at 280 chars, so this is cheap; a fence a user can close is not a fence.
    ? `\n\n<expected-result>\n${s.expectation.replace(FENCE_BREAK, "")}\n</expected-result>`
    : "";
  return `${s.prompt}${expect}`;
}
```

> **`prompt` and `expectation` are user-authored text dispatched as a *user turn*. Neither may ever
> reach a system prompt, a tool-policy field, or an autonomy setting** — task W3-6 states this for
> `prompt`, and it applies identically to `expectation` and to any future free-text column here.
> The rule holds for ATG- and LLM-generated prompts too, which ATG writes straight into the column:
> a template is third-party content the moment it is published, and `TASK_PLAN_V2.md` §8.1 lists
> "third-party text is rendered as data and never reaches a system prompt" in the definition of
> done. The `<expected-result>` fence is a *delimiter for the model*, not a trust boundary — the
> trust boundary is that this whole string is a user turn.

| Mode (`agentManagerMode()`) | Dispatch behaviour | Occurrence `source` |
|---|---|---|
| `live` | as above; the runtime reports `agent.schedule_run` (§3.8.3) | `runtime` |
| `mock` | `mockClient.sendMessage` returns a reply inline, so no webhook loop exists. The tick writes the terminal status **itself**: `succeeded`, `summary` = the mock reply truncated to 500, `finished_at = now()`, and one `agent_activities` row, `code = 'schedule.fired'`. Zero outbound requests, which `TEST_PLAN_V2.md` §C makes structural. | `mock` |
| `unconfigured` | **Do not dispatch, and do not 503 the tick.** Each due occurrence is written `skipped`, `skip_reason='instance_stopped'`, and `next_run_at` advances. The response carries `warnings: ["agent_manager_unconfigured"]`. A 503 here would make Vercel retry a route that is working exactly as designed. | `local` |
| `live`, runtime answers `501` / `unsupported` | The Manager has no chat path for this agent. Occurrence `skipped`, `skip_reason='dispatch_unsupported'` (D13), schedule stays enabled, `next_run_at` advances. TC-082. | `runtime` |

### Where the result actually goes — `deliver_to`, honestly

`deliver_to` decides delivery, and **three of its four values are somebody else's job or nobody's
yet.** This has to be written down, because the contract says ArkAgent sends the email and there is
no mail transport in this repository — no `nodemailer`, no Resend, no SMTP client — and "no new
runtime npm dependencies" is a hard project constraint.

| value | Who delivers | Wave 3 behaviour |
|---|---|---|
| `chat` | nobody — the run *is* the delivery. The reply lands in the `session_key` conversation and the run history links to it. | Works. The default, and the only value the editor pre-selects. |
| `none` | nobody, deliberately. The run happens; nothing is pushed anywhere. | Works. |
| `channel` | **the runtime**, on its own outbound path (`agent.message`, `BACKEND_INTEGRATION_CONTRACT.md` §5.4). ArkAgent never sends to a channel; `agent_channels` is the allowlist and §6.2 rule 8 forbids acting without it. | Works in `live` mode. ArkAgent's only job is gate 7 — refuse at **create** time when no connected binding exists. In `mock` and `unconfigured` mode nothing is sent, and the run history shows `MOCK` / `skipped` accordingly. |
| `email` | **ArkAgent** — `BACKEND_INTEGRATION_CONTRACT.md` §5.5 step 5, explicitly not the runtime. | **There is no mail transport in this repo.** Wave 3 therefore gates the value behind one env var, `MAIL_TRANSPORT_URL`: unset (the default, and the state of every environment today) ⇒ `deliverTo: "email"` is refused at create time with `422 deliver_target_unavailable`, the editor renders the Email option disabled with `schedule.deliverEmailUnavailable`, and no existing row can be edited into it. Set ⇒ delivery is one `fetch` to that transport from `lib/notify/mail.ts`, which is also what `settings.notifyErrors` (§3.10.3) and `settings.escalateTo` (§5.5 of the contract) will use. **No npm dependency either way** — a transport URL takes an HTTP POST. |

Refusing beats the two alternatives. Silently downgrading `email` to `chat` gives the user a
schedule that says "email me" and never does; accepting it and failing at fire time turns a
configuration error into a nightly `failed` row. The same argument already decided
`never_matches` and `channel_not_bound` (§3.8.4), and this is the third instance of the same rule:
**a schedule that cannot deliver is not saveable.**

Mock mode is not a convenience: `TEST_PLAN_V2.md` requires every runtime feature to have a
mock-manager fallback, and it is the only way the integration tests for §3.9's catch-up policy can
run at all.

## 3.6 `kind='interval'` — W3-1 question (a), resolved

### The contradiction

`BACKEND_INTEGRATION_CONTRACT.md` §2.7 defines `interval_seconds` as "measured from the **end** of
the previous run", and §3.3 dedupes occurrences on `UNIQUE (schedule_id, scheduled_for)`. These
cannot both hold. A `scheduled_for` that is only knowable after the previous run ends:

- cannot be pre-computed, so the occurrence row cannot be inserted **before** dispatch — which is
  where G3, the entire exactly-once guarantee, lives;
- cannot be previewed — `nextRuns` has nothing to walk, so the PREVIEW block that
  `UI_DESIGN_V2.md` §C.3.4 calls "the whole point" is blank for this kind;
- cannot be caught up — §3.9 needs to know which instants were missed, and "the end of a run that
  never happened" is not an instant;
- drifts by the run duration on every occurrence, so "every 15 minutes" becomes every 15 minutes
  plus 40 seconds, then plus 80, until it is meaningless.

### Decision — remove it from the writable surface; make any row that exists start-anchored

Two parts, and both are needed.

**(i) The API refuses to create or convert to `kind='interval'`.** `POST` and `PATCH` on
`/api/agents/[id]/schedules` reject `kind: "interval"` with `422 { error: "Validation failed",
code: "interval_not_supported" }`. The Zod schema's `kind` enum is `["cron","once"]` — narrower
than the Postgres enum on purpose. The column, the enum value and the C6 CHECK arm all stay, so
nothing in the DDL or in `BACKEND_INTEGRATION_CONTRACT.md` §2.7 changes and no migration touches
`schedule_kind`.

This costs nothing, because **every interval a user can express is already a cron**, and
`UI_DESIGN_V2.md` §C.3.4 says so in its own words: *"The Repeat every N minutes control encodes as
a `*/N` cron, not as `kind = 'interval'`, so the CHECK constraint is satisfied by `cron_expr`."*

**(iii) `*/N` must divide its field, and this has to be enforced in three places, not one.**
A `*/N` step only produces an even cadence when `N` divides the field size. `*/7` fires at
`:00 :07 … :56` and then waits four minutes; `*/25` fires three times an hour at 25-minute, then
10-minute, intervals. Both are legal cron, both parse, and both mean something other than what the
user typed. The admissible sets are exactly what `describe.ts`'s `stepOf()`
(`lib/schedule/describe.ts:36`) accepts — it requires `size % step === 0` **and**
`values.length === size / step` — namely:

```
minutes  {1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30}     the divisors of 60 below 60
hours    {1, 2, 3, 4, 6, 8, 12}                      the divisors of 24 below 24
```

(An earlier draft listed the minute set as `{1,2,3,5,10,15,20,30}`, which omits 4, 6 and 12 — three
steps `stepOf` accepts, `describeCron` renders idiomatically, and the picker should offer.)

The three enforcement points:

1. **The editor's step picker** offers only those values, so the control cannot compose a bad one.
2. **`validateScheduleInput`** (§3.8.4) rejects any submitted `cronExpr` whose minute or hour field
   is a step that `stepOf` refuses, with `422 interval_not_representable` naming the two admissible
   neighbours. This is the only path that catches a hand-typed `*/25` in ADVANCED.
3. **The NL band** (§4.3) — and this is the one that was missing. `parseSchedulePhrase("every 7
   minutes")` returns `{cron:"*/7 * * * *", confidence:0.8}`, **verified on this tree**; 0.8 clears
   `CONFIDENCE_FLOOR`, so band A would have saved it silently. A band-A parse whose cron fails
   `stepOf` is **demoted to band B (CONFIRM)** with the two neighbours offered as the choices, never
   auto-applied.

`"every 90 minutes"` is *not* an example of this rule: `parse.ts` accepts only 1..59 minutes and
1..23 hours, so it returns `null` and lands in band C/D. The reachable cases are `*/7`, `*/8`,
`*/9`, `*/11`, `*/13`…`*/25`… — the non-divisors inside the accepted range.

**(ii) A row that does exist is interpreted start-anchored.** `agent_schedules` is readable by
direct SQL (§2.0), rows predate this document, and the runtime may one day write them. So the tick
must have a defined behaviour, and `advanceSchedule` (§3.4.2) gives it one:
`next_run_at = scheduled_for + interval_seconds`, anchored to the **previous scheduled instant**,
not to the end of the previous run. That single change makes `scheduled_for` pre-computable, which
restores G3, the preview, and the catch-up path — the kind becomes an ordinary fixed-cadence
schedule that simply cannot be typed in the UI.

**This narrows one sentence in `BACKEND_INTEGRATION_CONTRACT.md` §2.7** — the `interval_seconds`
row of its column table. §8.1 records the edit owed.

> *Rejected alternative:* keep end-anchored semantics and give intervals a different dedupe key —
> `scheduled_for = the claim instant, truncated to the second`. It compiles and it never collides,
> which is exactly the problem: the unique index becomes decorative, two ticks a second apart both
> "succeed", and run history can no longer be reconciled against any expected sequence. An
> idempotency key that is always unique is not an idempotency key.

## 3.7 `kind='once'` — W3-1 question (b), resolved

### The contradiction

`parseSchedulePhrase("tomorrow at 9")` returns `{ kind: "one_off", cron: "0 9 30 8 *", onDate:
"2026-08-30" }`. The cron is `m h d M *` — day-of-month and month restricted, day-of-week open —
which fires **every 30 August at 09:00, forever**. The table stores one-offs as `kind='once'` +
`run_at timestamptz`, and no document named the runner that would ever disable such a row.

### Decision — a one-off never stores a cron, and the tick that fires it disables it

`ParsedSchedule.cron` for a `one_off` is a **time-of-day carrier**. Exactly one function is
permitted to consume it, it is pure and client-safe so the editor preview and the server agree, and
`cron_expr` is `NULL` on every `once` row that reaches the database (which the C6 shape CHECK
already requires — `kind='once' AND run_at IS NOT NULL AND cron_expr IS NULL AND interval_seconds
IS NULL`).

```ts
// lib/schedule/materialize.ts — the ONLY conversion from a parse result to a writable row.
import { parseCron, resolveLocal, type Resolution } from "./cron";
import type { ParsedSchedule } from "./parse";

export type ScheduleWriteShape =
  | { kind: "cron"; cronExpr: string; runAt: null; intervalSeconds: null }
  | { kind: "once"; cronExpr: null;   runAt: Date;  intervalSeconds: null };

export interface MaterializeResult {
  shape: ScheduleWriteShape;
  /** From resolveLocal. "gap"/"ambiguous" drive the amber DST note in the editor. */
  resolution?: Resolution["kind"];
}

export function materializeParsed(p: ParsedSchedule, timeZone: string): MaterializeResult {
  if (p.kind === "recurring") {
    return { shape: { kind: "cron", cronExpr: p.cron, runAt: null, intervalSeconds: null } };
  }
  // one_off: take the DATE from onDate and the TIME from the carrier cron's first
  // minute/hour, then place that wall clock in the schedule's own zone.
  if (!p.onDate) throw new Error("one_off without onDate");     // parse.ts guarantees it
  const [year, month, day] = p.onDate.split("-").map(Number);
  const f = parseCron(p.cron);
  const res = resolveLocal({ year, month, day, hour: f.hour[0], minute: f.minute[0] }, timeZone);
  return {
    shape: { kind: "once", cronExpr: null, runAt: res.instant, intervalSeconds: null },
    resolution: res.kind,
  };
}
```

`resolveLocal` gives the DST answer for free and it is the same one the cron path uses: a wall
clock the zone **skips** resolves to the instant the clock jumped to (`kind: "gap"`), a **repeated**
one to the first pass (`kind: "ambiguous"`). The editor shows `· clocks change` in `c.amber` when
`resolution !== "exact"` (§5.3).

**Who disables it:** the tick, at advance time, in the same transaction that inserts the occurrence
(§3.4.1). `advanceSchedule` returns `{ nextRunAt: null, enabled: false, reason: "once_consumed" }`
for `kind === "once"` **before** dispatch — so a `once` reminder is consumed the moment it is
claimed, not when it succeeds. That is correct and it is the same reasoning as §3.4.1: a reminder
whose dispatch crashed must not be re-sent by the next tick. It is recoverable by **Run now** or by
the retry pass, both of which leave `enabled = false` alone.

Two write-time rules complete it:

- `run_at` in the past at create time → `422 run_at_in_past`, with a 60-second grace so a slow form
  submission does not fail. ATG materialization obeys the same rule (`AGENT_TEMPLATE_GENERATOR.md`
  §7.3 step 5) — a template generated last week must not silently fire on save.
- A `once` row is **editable and deletable** but never *creatable* from the cron editor
  (§C.3.4: "`once` schedules can be created by ATG but only edited or deleted here"). §5 extends
  that: the NL field **does** create them, because "remind me tomorrow at 9" is the single most
  natural reminder phrasing in the product and `parse.ts` already handles it in four languages.


## 3.8 The API surface

Seven routes. Six are tenant-facing and share one authorization rule; one is the tick.

| Method | Path | Auth | § |
|---|---|---|---|
| `GET` · `POST` | `/api/cron/schedules` | `Bearer CRON_SECRET` | 3.8.1 |
| `GET` · `POST` | `/api/agents/[id]/schedules` | session | 3.8.2 |
| `GET` · `PATCH` · `DELETE` | `/api/agents/[id]/schedules/[scheduleId]` | session | 3.8.2 |
| `POST` | `/api/agents/[id]/schedules/[scheduleId]/run` | session | 3.8.2 |
| `GET` | `/api/agents/[id]/schedules/[scheduleId]/runs` | session | 3.8.2 |
| `POST` | `/api/agents/[id]/schedules/parse` | session | 4.4 |
| `GET` | `/api/runtime/agents/[agentId]/schedules` | manifest token | 3.8.5 |

**The tenant authorization rule, on every one of the six.** `requireAuth()` (`lib/api.ts:71`) →
`getAgentRow(id, ctx.workspace.id)` (`lib/services/agents.ts:125`) → `notFound()` when it returns
null. Cross-workspace is **404, not 403** — `docs/API.md:40` is authoritative. The nested
`scheduleId` is then re-scoped in the same query — `WHERE id = $scheduleId AND agent_id = $agentId`
— never fetched by id alone; a schedule id from another tenant must 404 even when the caller owns
*an* agent. All DB access stays in `lib/services/schedules.ts`, per the project constraint.

`created_by_id` for audit is asked for by task W3-6 and is not a column in §2.7. §8.1 records it as
an owed edit rather than smuggling it in as an eleventh delta.

### 3.8.1 `POST | GET /api/cron/schedules` — the tick

```ts
// app/api/cron/schedules/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;            // must stay < SCHEDULER_LEASE_SECONDS (§3.3.2)
```

**Both verbs, one handler.** Vercel Cron invokes the path with a `GET`; `TEST_PLAN_V2.md` UC-V2-20
step 0 writes it as `POST`, and both must work — `POST` is what the integration tests and any
external pinger use. Neither is public.

```
Authorization: Bearer <CRON_SECRET>
```

- Compared with `crypto.timingSafeEqual` over equal-length buffers.
- **Fails closed with 401 when `CRON_SECRET` is unset.** Same defect W2-6 fixes on
  `/api/skills/sync`, and worse here: without the secret this endpoint is an unauthenticated
  *agent trigger* on a public URL — anyone could pin a workspace's credits at zero.
- **`x-vercel-cron` is not accepted as authentication.** It is a client-settable header on a public
  URL. It may be *read*, only to set `scheduler_ticks.source`.
- `CRON_SECRET` joins `.env.example` with a comment naming what it gates.
- The response carries `Cache-Control: no-store`. A tick response summarises every workspace's
  activity in one body and must not be cached by anything.
- `scheduleId` is a **platform-operator** parameter and is deliberately not workspace-scoped: the
  only credential that reaches this route is `CRON_SECRET`, which is a platform secret, not a
  tenant one. It restricts the claim; it cannot widen it. Any use of it is written to
  `scheduler_ticks.source = 'manual'` so a support-triggered fire is distinguishable from the cron
  in the ledger.

Request (all optional; JSON body on `POST`, query string on `GET`):

```jsonc
{ "limit": 200,          // 1..500, default SCHEDULER_BATCH_LIMIT (200)
  "dryRun": false,       // claim, evaluate gates, roll back; dispatch nothing
  "scheduleId": null }   // restrict the claim to one schedule — support tool, never the cron
```

Response `200`:

```jsonc
{ "tickId": 91827,
  "startedAt": "2026-08-31T00:30:00.412Z",
  "durationMs": 1840,
  "claimed": 7, "dispatched": 5, "skipped": 1, "failed": 1, "retried": 0, "swept": 2,
  "saturated": false,
  "observedTickSeconds": 60,
  "warnings": [] }
```

| Status | When |
|---|---|
| `200` | always, including when individual schedules failed — those live in the counters and in `agent_schedule_runs`, not in the HTTP status |
| `401` | absent, malformed, or mismatched bearer; **or `CRON_SECRET` unset** |
| `422` | `limit` out of range |
| `500` | only for a failure outside the per-schedule loop (the ledger insert, the claim statement). Vercel retries a 500, so the loop itself never produces one (§3.5.1) |

`warnings[]` values: `agent_manager_unconfigured` · `tick_saturated` (the batch hit its limit, so
due work waited) · `tick_too_coarse` (observed cadence exceeds the finest enabled schedule, §3.1).

### 3.8.2 Tenant CRUD

#### `GET /api/agents/[id]/schedules`

`200 { schedules: ScheduleDTO[], tick: TickHealthDTO }`, ordered
`enabled DESC, next_run_at ASC NULLS LAST, created_at ASC`.

```ts
/** The §3.1 banner's only data source. Derived scalars — never `scheduler_ticks` rows. */
export interface TickHealthDTO {
  /** Median gap over the last 20 scheduler_ticks rows, seconds. null before 3 ticks exist. */
  observedSeconds: number | null;
  /** started_at of the newest tick, ISO 8601. null when the cron has never run. */
  lastTickAt: string | null;
  /** The finest gap any ENABLED schedule on this agent needs, seconds. */
  finestNeededSeconds: number | null;
  /** observedSeconds > finestNeededSeconds. Drives `schedule.tickTooCoarse`. */
  tooCoarse: boolean;
}
```

Without this the §3.1 banner has no source: `scheduler_ticks` is not tenant-scoped and its rows are
never served (§3.0 delta 12), so the *only* thing that crosses the boundary is this four-field
scalar. `finestNeededSeconds` is computed from the agent's own enabled rows via
`runsBetween(cronExpr, midnight, midnight+24h, tz, 289)` reduced to the smallest consecutive gap —
the same bounded call §6.3 already makes, so it costs nothing extra. `lastTickAt` older than
`observedSeconds × 3` is what the banner says "the scheduler has not run since…" about; a scheduler
that stopped entirely is a different sentence from one that is merely coarse.

```ts
// lib/serializers.ts
export interface ScheduleDTO {
  id: string;
  agentId: string;
  name: string;
  enabled: boolean;
  kind: "cron" | "once" | "interval";
  cronExpr: string | null;
  runAt: string | null;                 // ISO 8601, UTC
  intervalSeconds: number | null;
  timezone: string;
  prompt: string;
  expectation: string | null;
  deliverTo: "chat" | "email" | "channel" | "none";
  overlapPolicy: "skip" | "queue" | "parallel";
  catchUp: boolean;
  jitterSeconds: number;
  maxRunsPerDay: number;
  maxRuntimeSeconds: number;
  wakeRuntime: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  createdAt: string;
  updatedAt: string;
  // ---- computed in the serializer; none of these are columns ----
  /** describeSchedule(cronExpr, timezone, lang). null for `once` and for an unparseable expr. */
  humanReadable: string | null;
  /** nextRuns(cronExpr, now, timezone, 5). Empty for a fired `once` or a never-matching cron. */
  upcoming: string[];
  /** cronError(cronExpr). Non-null only for a row edited into invalidity by direct SQL. */
  invalidReason: string | null;
}
```

`session_key`, `claimed_at` and `claim_token` are **not** in the DTO. They are internal, and
`session_key` publishes the naming scheme of a conversation the user never created.

#### `POST /api/agents/[id]/schedules`

```jsonc
// lib/validation.ts :: createScheduleSchema — .strict(), like the admin mutations, and for the
// same reason: a silently-stripped unknown key on a scheduling edit is the wrong failure mode.
{ "name": "Morning sweep",
  "kind": "cron",                              // "cron" | "once"   — NOT "interval" (§3.6)
  "cronExpr": "30 8 * * 1-5",                  // required iff kind=cron
  "runAt": "2026-09-03T01:00:00.000Z",         // required iff kind=once
  "timezone": "Asia/Singapore",
  "prompt": "Check the shared inbox and draft replies",
  "expectation": "A list of drafts, or 'inbox clear'",
  "deliverTo": "chat",
  "maxRunsPerDay": 96,
  "enabled": true }
```

`201 { schedule: ScheduleDTO }`. `next_run_at` is computed **before** the insert — `kind='cron'` →
`nextRun(cronExpr, new Date(), timezone)`, `kind='once'` → `runAt` — inside the same transaction, so
the §1.3 CHECK is satisfied by construction rather than by a follow-up `UPDATE`.

| Code | Status | When |
|---|---|---|
| `invalid_cron` | 422 | `cronError()` non-null. The body carries that **specific** message, never "invalid" (TC-073). |
| `invalid_timezone` | 422 | `!isValidTimeZone(timezone)`. Refuse; never silently fall back to UTC (TC-074). |
| `never_matches` | 422 | `nextRun()` returned `null` (`0 0 30 2 *`). AC-SCH-4 / TC-050. |
| `run_at_in_past` | 422 | `kind='once'` and `runAt < now() - 60s`. |
| `interval_not_supported` | 422 | `kind: "interval"`. §3.6. |
| `interval_not_representable` | 422 | an "every N minutes/hours" request that is not an even cron step. §3.6. |
| `exceeds_max_runs_per_day` | 422 | the expression's own daily fire count exceeds `maxRunsPerDay`. §6.3. |
| `deliver_target_unavailable` | 422 | `deliverTo='email'` with no `escalateTo` and no owner email, or `deliverTo='channel'` with no connected channel. |
| `schedule_limit_reached` | 409 | per-agent or per-workspace cap. §6.1. |
| — | 404 | agent not in this workspace. |
| — | 401 | no session. |

Note what is **not** here: no `503`. Creating a schedule is a Postgres write and must succeed with
no Agent Manager configured and no LLM key. Only *dispatch* degrades (§3.5.4).

#### `PATCH /api/agents/[id]/schedules/[scheduleId]`

Partial, `.strict()`, identical validation. Three behaviours that are not obvious:

- **Any change to `cronExpr`, `runAt`, `timezone` or `enabled` recomputes `next_run_at` from
  `now()`**, never from the stored value (TC-088).
- `enabled: false` sets `next_run_at = NULL` in the same `UPDATE` (§1.3).
- An in-flight run is **not** cancelled — UC-V2-22 flow 1a: it completes and is recorded; only
  future scheduling changes.

`200 { schedule: ScheduleDTO }`.

#### `DELETE /api/agents/[id]/schedules/[scheduleId]`

`204 No Content`.

`agent_schedule_runs.schedule_id` is `ON DELETE CASCADE` in `BACKEND_INTEGRATION_CONTRACT.md` §3.3,
which means deleting a schedule **erases its history** — and UC-V2-22 explicitly wants the runs
retained ("historical `agent_schedule_runs` are retained so history is not rewritten"). Decision:
**the foreign key is dropped, `schedule_id` stays `uuid NOT NULL`, and `schedule_name` is
snapshotted beside it (§3.0 delta 11). That edit is a Wave-3 prerequisite for this endpoint, not a
follow-up**; §8.1 D3 records it.

`ON DELETE SET NULL` — the obvious middle answer, and the one an earlier draft chose — is wrong:
`GET …/runs` and the Activity drill-down both filter by `schedule_id`, so nulling it retains the
rows and makes every one of them permanently unreachable. "Retained" then means "occupies disk".
With the FK dropped, the id remains a valid opaque key, `GET /api/agents/[id]/schedules/[scheduleId]/runs`
keeps working after the delete (its authorization scopes on `agent_id`, which still has its FK and
still cascades when the *agent* is deleted), and the `(schedule_id, scheduled_for)` unique index
stays meaningful. The cost is one intentionally dangling reference, documented in §3.0 and in the
Drizzle declaration.

#### `POST /api/agents/[id]/schedules/[scheduleId]/run` — Run now

```jsonc
// 202 Accepted
{ "occurrence": { "id": "…", "scheduledFor": "2026-08-31T04:12:07.000Z",
                  "status": "started", "trigger": "manual", "attempt": 1 } }
```

- `scheduled_for = now()` truncated to the second. A cron occurrence always has `:00` seconds
  (minute resolution), so a manual run can only collide with another manual run in the same second
  — and that collision is correctly rejected by the unique index.
- `trigger = 'manual'` on `agent_schedule_runs` (§3.0 delta 6). `agent_runs.trigger` stays
  `'schedule'` with `trigger_ref = scheduleId`, because `run_trigger` (§2.1) has no `manual` value
  and adding one would need its own migration file ahead of use (the C5 hazard). TC-087 is
  satisfied on our column.
- **`next_run_at` is not touched.** TC-087 asserts this.
- Gates 3–7 of §3.5.3 still apply (a manual run may not exceed the credit cap). Gates 1–2 do not —
  a human asking for it now overrides working hours.
- `409 run_in_flight` when a run of this schedule is `started` and `overlap_policy = 'skip'`.
- `503` when `agentManagerMode() === 'unconfigured'`. Unlike create, this one genuinely needs a
  runtime and the operator asked for it interactively, so a 503 is the honest answer.
- **404** when the schedule id does not resolve inside this agent — including a schedule that was
  deleted, whose *history* is still readable (above) but which can no longer be run.
- The manual occurrence is written with `source` = `runtime` \| `mock` \| `local` exactly as the
  tick writes it (§3.5.4), so a Run now in mock mode is tagged `MOCK` in the history like any
  other simulated occurrence.

#### `GET /api/agents/[id]/schedules/[scheduleId]/runs`

`?status=&limit=25&cursor=` — the cursor is the opaque base64 of `(scheduled_for, id)`, newest
first, matching `agent_schedule_runs_sched_idx`.

```ts
export interface ScheduleRunDTO {
  id: string;
  scheduleId: string;                // NOT nullable — the FK is gone, the id is not (§3.0 delta 11)
  scheduleName: string;              // snapshot, so a deleted schedule's history still has a name
  runId: string | null;              // -> agent_runs; the Activity drill-down (UC-V2-26)
  scheduledFor: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;         // computed, not a column
  status: "started" | "succeeded" | "failed" | "skipped";
  skipReason: string | null;         // an i18n key in lib/i18n/activity.ts, never prose
  summary: string | null;
  errorCode: string | null;
  // NOTE: `error_message` is NOT in this DTO. It is ≤480 chars of English written for our
  // logs (`BACKEND_INTEGRATION_CONTRACT.md` §3.4, `agent.error`), it is untranslatable in
  // three of the four UI languages, and the contract's own §6.2 rule 5 concedes that the
  // runtime is the party trusted not to put secrets in it. A comment saying "never
  // rendered" beside a serialized field is not a control; not serializing it is.
  // Support reads it from the row. See §3.10.3 for what the operator sees instead.
  trigger: "schedule" | "manual" | "catch_up";
  attempt: number;
  missedCount: number;
  missedTruncated: boolean;
  expectationMet: boolean | null;
  source: "runtime" | "mock" | "local";
  tokens: { input: number; output: number; total: number } | null;   // joined from agent_runs
}
```

`200 { runs: ScheduleRunDTO[], nextCursor: string | null }`.

### 3.8.3 Run-result ingestion — `agent.schedule_run`, and nothing else

**There is no second event.** The result of a scheduled run arrives on the existing ingest endpoint
`POST /api/webhooks/agent-manager/batch` as `agent.schedule_run` v1
(`BACKEND_INTEGRATION_CONTRACT.md` §3.4), HMAC-signed per §1.4, inside the standard envelope of
§3.1. This document adds a handler, not a vocabulary. That is what makes the eventual switch to
runtime-owned firing invisible to the Activity page and to run history — the contract says so, and
§3.8.5 is the other half of that promise.

Fields, as already specified: `scheduleExternalId` (our `agent_schedules.id`), `scheduledFor` (**the
intended fire instant**, not the actual start — the second idempotency key), `status`, `runId`,
`startedAt` / `finishedAt`, `skipReason`, `summary`, `errorCode` / `errorMessage`.

`scheduledFor` is the field the runtime must echo, and ArkAgent gives it to them in the dispatch
metadata (§3.5.4). The handler:

There is **no `rank()` function in PostgreSQL that does this** — `rank()` is a window function and
cannot appear in an `ON CONFLICT DO UPDATE` target list. The rank is an inline `CASE`, written once
per side, and `array_position` is not a substitute either because `failed` and `succeeded` must
compare **equal**:

```sql
INSERT INTO agent_schedule_runs
  (schedule_id, schedule_name, agent_id, run_id, scheduled_for, started_at, finished_at,
   status, skip_reason, summary, error_code, error_message, source)
VALUES (…, 'runtime')
ON CONFLICT (schedule_id, scheduled_for) DO UPDATE SET
  run_id      = COALESCE(EXCLUDED.run_id, agent_schedule_runs.run_id),
  started_at  = COALESCE(agent_schedule_runs.started_at, EXCLUDED.started_at),
  finished_at = COALESCE(EXCLUDED.finished_at, agent_schedule_runs.finished_at),
  summary     = COALESCE(EXCLUDED.summary, agent_schedule_runs.summary),
  status = CASE WHEN (CASE EXCLUDED.status            WHEN 'started' THEN 0 WHEN 'skipped' THEN 1 ELSE 2 END)
                 >= (CASE agent_schedule_runs.status  WHEN 'started' THEN 0 WHEN 'skipped' THEN 1 ELSE 2 END)
                THEN EXCLUDED.status ELSE agent_schedule_runs.status END,
  skip_reason = CASE WHEN (CASE EXCLUDED.status           WHEN 'started' THEN 0 WHEN 'skipped' THEN 1 ELSE 2 END)
                      >= (CASE agent_schedule_runs.status WHEN 'started' THEN 0 WHEN 'skipped' THEN 1 ELSE 2 END)
                     THEN EXCLUDED.skip_reason ELSE agent_schedule_runs.skip_reason END,
  error_code = CASE WHEN (CASE EXCLUDED.status            WHEN 'started' THEN 0 WHEN 'skipped' THEN 1 ELSE 2 END)
                     >= (CASE agent_schedule_runs.status  WHEN 'started' THEN 0 WHEN 'skipped' THEN 1 ELSE 2 END)
                    THEN EXCLUDED.error_code ELSE agent_schedule_runs.error_code END,
  error_message = CASE WHEN (CASE EXCLUDED.status            WHEN 'started' THEN 0 WHEN 'skipped' THEN 1 ELSE 2 END)
                        >= (CASE agent_schedule_runs.status  WHEN 'started' THEN 0 WHEN 'skipped' THEN 1 ELSE 2 END)
                       THEN EXCLUDED.error_message ELSE agent_schedule_runs.error_message END
```

**The function is not optional and it is not W3-8's.** `DATA_MODEL_V2.md` §11.1 creates
`schedule_run_rank(s text) RETURNS int LANGUAGE sql IMMUTABLE PARALLEL SAFE` in
`0012_v2_runtime.sql` beside the table, and that spelling wins: a rank duplicated four times in
one statement is four places to get the `failed = succeeded` tie wrong, and the migration that
creates the table is the only place the ladder can be created *before* the first upsert runs. The
four `CASE`s collapse to
`schedule_run_rank(EXCLUDED.status) >= schedule_run_rank(agent_schedule_runs.status)`. The
expanded form is retained above so the rank is auditable without opening the migration.

`error_message` moves in lockstep with `error_code`; an earlier draft guarded the code and not the
message, which produced rows whose `error_code` came from the `failed` event and whose
`error_message` was still the `started` event's `NULL`. The columns `attempt`, `trigger`,
`missed_count`, `missed_truncated`, `schedule_name` and `source` are **never** in the `DO UPDATE`
set: they are ArkAgent-owned and the runtime has no opinion about them.

with the rank from §3.3: `started(0) < skipped(1) < failed(2) = succeeded(2)`, and **a lower rank
never overwrites a higher one** — an out-of-order `started` arriving after `succeeded` must not
regress the row (task W3-8's acceptance criterion).

**The one ambiguity in that rank, resolved here:** `failed` and `succeeded` share rank 2, so
`>=` lets whichever arrives last win. That is correct and deliberate — it is exactly what makes
case C of §3.3.3 self-heal, because a real `succeeded` from the runtime must be able to overwrite
ArkAgent's own swept `failed / dispatch_lost`. The rule is therefore: **at equal rank, last write
wins**, and the *only* equal-rank pair is `failed`/`succeeded`. Where that matters for the operator
— a run that reported `succeeded` then `failed` — both are visible in the Activity feed, which is
append-only.

Ingest-side validation, on top of the §3.1 table which already applies:

| Check | Outcome |
|---|---|
| `scheduleExternalId` parses as a UUID **and** the schedule belongs to `externalAgentId`'s agent | else `rejected: foreign_reference` — the §3.1 rule, applied to this id |
| `scheduledFor` parses as RFC 3339 with an offset | else `rejected: invalid_timestamp` |
| An occurrence row exists for `(schedule_id, scheduled_for)` | if not, **insert it** rather than reject, provided `scheduled_for` is within ±1 h of an instant the schedule could plausibly produce. This is deliberate forward-compatibility: under runtime-owned firing (§3.1's option 3) the runtime is the one that mints occurrences. Outside that window → `rejected: foreign_reference`. |
| `status='skipped'` carries a `skipReason` from §3.4's enumerated list | else the event is accepted with `skip_reason = null` and an `agent.error`-shaped log line; an unknown reason must not 500 the batch (§2.1's "treat an unknown value as the safest neighbour") |

Side effects, all inside the one transaction §3.2 of the contract requires:

1. the UPSERT above;
2. `UPDATE agent_schedules SET last_run_at, last_status` — **guarded**, so a late event for an old
   occurrence cannot overwrite a newer one: `WHERE id = $1 AND (last_run_at IS NULL OR last_run_at
   <= $scheduledFor)`;
3. **at most one** `agent_activities` row, from the registry in
   `BACKEND_INTEGRATION_CONTRACT.md` §3.4 — not a code composed at runtime:

   | occurrence status | `code` | `params` | `tag` |
   |---|---|---|---|
   | `succeeded` | `schedule.fired` | `{ scheduleId, name }` | `calendar` |
   | `skipped` | `schedule.skipped` | `{ scheduleId, name, skipReason, missedCount }` | `calendar` |
   | `failed` | `schedule.failed` | `{ scheduleId, name, errorCode }` | `calendar` |
   | `started` | — none — | | |

   `'schedule.' || status` would have emitted `schedule.started`, `schedule.succeeded` and
   `schedule.ran` (§3.5.4's mock path used that third spelling), none of which are in the registry;
   an unregistered code renders as the raw string (§6.1 rule 2 of the contract), so the Activity
   feed would have shown `schedule.succeeded` to every user in every language. `schedule.fired` is
   the registry's own name and is already `{scheduleId, name}` — **`name`, not `scheduleName`.**
   `schedule.skipped` and `schedule.failed` are the two codes `HARNESSES_AND_ACTIVITY.md` §5.5
   marks **PROPOSED** and ranks 2nd and 3rd most valuable; this document adopts both, and delta
   **D15** registers them. No row is written for `started`, because a `started` and a terminal
   event for the same occurrence would double every scheduled run in the feed.
   `tag` is `calendar` (`activity_tag`, `lib/db/schema.ts:61`) and `text` is `''` — per conflict
   C8, prose is never frozen at ingest and the UI renders from `code` + `params` through
   `lib/i18n/activity.ts`;
4. `expectation_met` evaluation (§3.10.4);
5. the `runtime_event_receipts` insert that makes the whole thing idempotent on `eventId`.

**Credits are not touched here.** Billing is `agent.usage` and only `agent.usage` (§3.4). A
scheduled run that costs credits emits both events; correlating them is `runId`'s job.

### 3.8.4 Validation lives in one place

`lib/validation.ts` gains `createScheduleSchema` / `updateScheduleSchema` (Zod v4, `.strict()`),
and every cross-field rule that needs the database or the clock lives in
`lib/services/schedules.ts :: validateScheduleInput(ctx, agent, input)` — called by `POST`, by
`PATCH`, and by ATG materialization, so a generated schedule cannot enter through a side door that
skips a check a hand-made one must pass.

```ts
export type ScheduleValidationCode =
  | "invalid_cron" | "invalid_timezone" | "never_matches" | "run_at_in_past"
  | "interval_not_supported" | "interval_not_representable"
  | "exceeds_max_runs_per_day" | "deliver_target_unavailable" | "schedule_limit_reached";
```

Three of these are checks no schema can express and each one prevents a schedule that would look
saved and never work:

- **`never_matches`** — `nextRun()` returned `null`. AC-SCH-4.
- **`deliver_target_unavailable`** — three independent conditions, all checked at **create**, not at
  fire, for the same reason as `never_matches`: a schedule that can never deliver is a schedule that
  does not work, and the moment to say so is while the user is looking at it.
  1. `deliverTo === 'email'` and `MAIL_TRANSPORT_URL` is unset (§3.5.4) — no transport, no promise.
  2. `deliverTo === 'email'` and neither `settings.escalateTo` nor `users.email` for the workspace
     owner parses as an address. `settings.escalateTo` is a free-text `string` in
     `lib/agent-settings.ts:53` with **no format validation today**, so the check is
     `z.string().email().safeParse(...)` here rather than a truthiness test — an `escalateTo` of
     `"me"` currently passes every check in the codebase.
  3. `deliverTo === 'channel'` and no row in `agent_channels ⋈ channels` for this agent with
     `channels.status = 'connected'`. Scoped by `agent_id`, and `channels.workspace_id` is asserted
     equal to the caller's workspace — a channel row is workspace-owned and an agent must never
     reach one through a stale binding.
- **`exceeds_max_runs_per_day`** — §6.3.

`timezone` also gains the `.refine(isValidTimeZone)` that `BACKEND_INTEGRATION_CONTRACT.md` §2.3
says is required before launch, using the existing `cron.ts` helper. No new dependency.

### 3.8.5 `GET /api/runtime/agents/[agentId]/schedules` — read-only, for the runtime

The "due-schedules endpoint" of §3.1's option (1), specified but **not** as a claim endpoint. It
never mutates, it never marks anything as taken, and calling it does not fire anything.

```http
GET /api/runtime/agents/{agentId}/schedules
Authorization: Bearer <manifest_token>          # §1.3 — bound to exactly this agentId
X-ArkAgent-Protocol: v2
```

```jsonc
// 200 — BYTE-FOR-BYTE the `schedules` array of the manifest (BACKEND_INTEGRATION_CONTRACT
// §2.10), served on its own for drift checks. Same field names, same order, all seventeen
// fields. A "drift check" between two differently-shaped projections detects nothing.
{ "agentId": "a7f3c9e2-…", "revision": 41,
  "schedules": [
    { "scheduleId": "9d40…", "name": "Morning sweep", "enabled": true, "kind": "cron",
      "cronExpr": "30 8 * * 1-5", "intervalSeconds": null, "runAt": null,
      "timezone": "Asia/Singapore",
      "prompt": "Check the shared inbox and draft replies",
      "sessionKey": "agent:main:schedule:9d40…",
      "wakeRuntime": true, "maxRuntimeSeconds": 900,
      "overlapPolicy": "skip", "catchUp": false, "jitterSeconds": 0,
      "maxRunsPerDay": 96, "deliverTo": "chat",
      "nextRunAt": "2026-08-31T00:30:00.000Z" } ] }
```

An earlier draft of this block used `externalId` and `cron`, dropped `name`, `catchUp`,
`jitterSeconds` and `maxRunsPerDay`, and would have shipped a second wire vocabulary for the same
five tables. One serializer — `serializeScheduleForManifest()` in `lib/serializers.ts` — produces
both, and a test asserts the two responses are deep-equal for the same agent.

- `403 agent_scope_mismatch` for a token bound to a different agent — the §1.3 rule, unmodified.
  The check is **in this handler**: `BACKEND_INTEGRATION_CONTRACT.md` §1.3 notes ArkAgent has no
  route middleware (`lib/api.ts`), so every `app/api/runtime/**` handler performs its own bearer +
  scope check or it has none.
- `Cache-Control: no-store` on the response, and `expectation` is **not** included: it is operator
  notes about what a good run looks like, and the runtime is told what to do by `prompt` plus the
  fenced note in the dispatched turn (§3.5.4), not by a config read.
- `nextRunAt` is **advisory** and says so in §2.7: ArkAgent recomputes it after every run and the
  runtime must not write it back.
- Three uses, all read: reconciliation after a restart, a drift check against a pushed set, and —
  when the `schedules` capability finally exists — the source for
  `PUT /api/instances/{instanceId}/schedules` on our side.

> *Rejected alternative:* a global `GET /api/cron/due` that any authenticated runtime could poll.
> It crosses the tenancy boundary by construction (one response, many workspaces), and the
> manifest-token model exists precisely so no runtime credential can read another agent's
> configuration.

## 3.9 Misfire and catch-up after downtime

### 3.9.1 The three bands

At claim time the tick has `scheduledFor` (the `next_run_at` it just took), the jitter offset for
this occurrence, and `now`. Lateness is `now - dispatchAfter`, where
`dispatchAfter = scheduledFor + jitterOffset` (§3.4.4) and `jitterOffset` is `0` for every schedule
that does not set `jitter_seconds` — i.e. all of them, by default. Lateness decides everything.

| Band | Lateness | What happens |
|---|---|---|
| **On time** | ≤ `SCHEDULER_GRACE_SECONDS` (120) | Not a misfire. Run `scheduledFor`. Advance one step. `missed_count = 0`. |
| **Misfired** | > 120 s and ≤ `SCHEDULER_MISFIRE_MAX_AGE` (24 h) | §3.9.2. `catch_up` decides whether anything runs. |
| **Too old** | > 24 h | `catch_up` is **ignored**. One `skipped` occurrence, `skip_reason: 'misfire_too_old'`, realign to the future. |

The 120-second grace exists because a one-minute platform tick plus a queued function plus clock
skew routinely produces 30–90 seconds of lateness on a perfectly healthy system, and treating that
as a misfire would put a `missed_count` badge on every normal run.

The 24-hour ceiling exists because a catch-up is only useful while the work is still wanted. A
three-week-old "post the daily digest" firing on restore is the classic scheduler embarrassment:
noisy, confusing, and occasionally expensive when `deliver_to='email'`.

### 3.9.2 The misfire computation, on `runsBetween`

```ts
// lib/services/schedules.ts
const { runs, truncated } = runsBetween(cronExpr, scheduledFor, now, timezone, 500);
// runsBetween is OPEN at both ends: strictly after `scheduledFor`, strictly before `now`
// (lib/schedule/cron.ts:636 — the doc comment there says "[from, to)", which is wrong; the
// implementation starts from nextRunParsed(fields, from), so `from` is excluded).
// So the total number of occurrences the outage swallowed is 1 + runs.length —
// `scheduledFor` itself, plus everything runsBetween found after it.
const missedCount     = 1 + runs.length;
const missedTruncated = truncated;              // -> "at least N", never "N" (TC-080)

// THE ANCHOR advanceSchedule() is given (§3.4.2). When the list was truncated, `runs.at(-1)`
// is only the 500th missed occurrence and may still be weeks behind `now` — anchoring there
// makes the advance walk the remaining tens of thousands. When truncated, anchor to `now`.
const newest = truncated ? now : (runs.at(-1) ?? scheduledFor);
```

`truncated` therefore does two jobs, and they are different: it changes the **sentence**
(`missedAtLeast` instead of `missed`, §3.9.4) *and* it changes the **anchor**. Only the first was
obvious.

`runsBetween`'s 500-result cap is not a limitation to work around — it is the mechanism that keeps
this bounded. A per-minute cron over a 28-day outage is 40,320 occurrences; the cap returns 500 and
`truncated: true`, the tick does not hang, and the number is reported honestly as a floor.
`TEST_PLAN_V2.md` TC-080 asserts exactly this on this tree — **verified**:
`runsBetween("*/5 * * * *", 2026-08-01T00:00Z, 2026-08-29T00:00Z, "UTC")` returns
`{ runs.length: 500, truncated: true }`.

One reconciliation is owed: TC-080 phrases the label as *"at least 500"*, and `missedCount` is
`1 + runs.length = 501`, so the rendered string is *"at least 501"*. Both are floors and 501 is the
tighter one — `scheduledFor` itself was genuinely missed and `runsBetween` genuinely excludes it.
Delta **D18** updates TC-080's expected string.

### 3.9.3 The policy, per schedule

`catch_up` is per schedule, not global, and defaults to `false`.

| `catch_up` | Occurrences written | `next_run_at` anchored to |
|---|---|---|
| `false` | **one** `skipped` occurrence at `scheduled_for = scheduledFor`, `skip_reason: 'misfire'`, carrying `missed_count` and `missed_truncated`. Nothing runs. | `newest` |
| `true` | **one** `started` occurrence at `scheduled_for = newest`, `trigger: 'catch_up'`, carrying `missed_count` / `missed_truncated`. Plus, when `runs.length > 0`, one aggregate `skipped` occurrence at `scheduledFor` with `skip_reason: 'misfire'` recording the ones that were dropped. | `newest` |

**When `truncated`, `newest` is `now` (§3.9.2), and a `catch_up = true` occurrence is therefore
written at `scheduled_for = now` truncated to the minute.** That instant is not necessarily one the
cron would have produced, which is a deliberate and stated trade: it keeps the unique index
meaningful, keeps the advance to two `nextRunParsed` calls, and the run row says so — `trigger:
'catch_up'` with `missed_truncated: true` reads as *"a catch-up after an outage too long to
enumerate"*, which is the truth. The alternative — walking 40,000 instants to find the last legal
one — is the thing that would time the tick out during exactly the incident it exists to recover
from.

**One run, never a backlog burst** — the contract says it twice (§2.7 `catch_up`, §5.6 resume step
4) and it is the whole point.

**Which instant does the catch-up run use?** `newest` — the most recent missed occurrence, not the
oldest. A daily digest that missed Monday, Tuesday and Wednesday should produce *Wednesday's*
digest; producing Monday's and calling it caught up is worse than producing nothing. The dropped
older instants are not silently forgotten: they are the aggregate `skipped` row, and the UI renders
them as "3 runs missed while ArkAgent was unavailable".

### 3.9.4 One missed run versus five hundred — the same control flow

The brief for this section asks for the policy at both extremes, and the answer is that there is
one policy and it does not branch on the count:

| Scenario | `catch_up=false` | `catch_up=true` |
|---|---|---|
| **1 missed** (`0 9 * * *`, tick ran 40 min late) | 1 `skipped/misfire` row, `missed_count: 1`. Next run tomorrow 09:00. | 1 `started/catch_up` row at today's 09:00 instant, `missed_count: 1`. Next run tomorrow 09:00. |
| **500+ missed** (`*/5 * * * *`, a 3-day outage) | 1 `skipped/misfire` row, `missed_count: 501`, `missed_truncated: true`. Next run at the next 5-minute boundary. | 1 `started/catch_up` row at the newest boundary + 1 aggregate `skipped` row, `missed_count: 501`, `missed_truncated: true`. Next run at the next boundary. |

The count changes the number in the badge and nothing else. That is deliberate: a policy that
behaves differently at scale is a policy that is untested at scale, and the outage that produces
500 missed runs is precisely the moment nobody wants novel behaviour.

`missed_truncated: true` changes the sentence, not the logic — `schedule.missedAtLeast` instead of
`schedule.missed` (§7). "501 runs missed" when the truth is 864 is a number the support engineer
will chase; "at least 500" is not.

### 3.9.5 Resume after a pause is a misfire, not a special case

`BACKEND_INTEGRATION_CONTRACT.md` §5.6 resume step 4 says: *recompute `next_run_at` for every
schedule from now, honouring `catch_up`.* That is this exact code path — the resume handler calls
the same `applyMisfire()` the tick calls, with `scheduledFor` = the stored `next_run_at`. There is
no second implementation, and no schedule "stampedes on resume" because §3.9.3 writes exactly one
occurrence either way.

While an agent is `paused` or `terminated` its schedules are filtered out **before** the claim
(§3.3.1) rather than skipped after it, so a paused fleet does not consume the batch limit and
`enabled` is never mutated — resuming restores the user's intent exactly (UC-V2-22 flow 1b).

## 3.10 Retries, backoff, and the expectation signal

### 3.10.1 What is retryable, and what is not

The unit of retry is an **occurrence**, never a schedule: retrying a schedule would re-fire whatever
is due now, which is a different piece of work.

| `error_code` | Source | Retryable | Why |
|---|---|---|---|
| `dispatch_failed` | ArkAgent — the runtime returned `5xx` or timed out | ✅ | transport |
| `runtime_unreachable` | ArkAgent — connection refused / DNS | ✅ | transport |
| `dispatch_lost` | ArkAgent — §3.5.2 sweep | ✅ | the work may never have started |
| `timeout` | runtime — exceeded `max_runtime_seconds` | ❌ | it will time out again; the fix is the setting |
| `credit_cap_reached` | gate 6 | ❌ | recorded as `skipped`, not `failed`; retrying would breach the cap |
| `model_unavailable`, `tool_disabled`, `channel_not_bound` | runtime / gate 7 | ❌ | configuration, not transport |
| `agent_manager_unconfigured` | §3.5.4 | ❌ | recorded as `skipped` |

A `4xx` from the runtime is **never** retried — `BACKEND_INTEGRATION_CONTRACT.md` §1.3 already
says `400` is not retried and `401`/`403` raise an alarm and mark the feature unavailable.

`dispatch_failed`, `runtime_unreachable` and `dispatch_lost` are **not** in the contract's baseline
`errorCode` vocabulary (§3.4), which says "extend by agreement, never silently". All three are
ArkAgent-originated — the runtime cannot produce them, because they describe our failure to reach
it — and delta **D16** registers them there so `lib/i18n/activity.ts` has exactly one list to cover.
`timeout`, `credit_cap_reached`, `model_unavailable`, `tool_disabled` and `channel_not_bound` in
the table above are already in that baseline and are cited, not invented.

### 3.10.2 Backoff

Two layers, and the split matters because one lives inside a 60-second function and the other does
not.

**In-tick (transport only):** one immediate re-attempt after 1 s for a connection error or a `5xx`.
Not the 1 s / 4 s / 16 s ladder of §1.3 — that ladder is for interactive calls, and 21 seconds of
sleeping inside a per-minute tick that may hold 200 claims is how one unhealthy tenant starves
everyone else. One retry costs one second and catches the large majority of transient failures.

**Across ticks (the retry pass, step 5 of §3.5.1):**

Claim and re-open in one statement, the same shape as §3.3.1 and for the same reason — two ticks
must not retry the same occurrence:

```sql
WITH due AS (
  SELECT r.id
    FROM agent_schedule_runs r
    JOIN agents a ON a.id = r.agent_id
   WHERE r.status = 'failed'
     AND r.error_code IN ('dispatch_failed','runtime_unreachable','dispatch_lost')
     AND r.attempt < $2                      -- SCHEDULER.RETRY_MAX_ATTEMPTS (3)
     AND r.next_attempt_at IS NOT NULL
     AND r.next_attempt_at <= now()
     -- The hard window, applied HERE as well as in the sweep. A row whose next_attempt_at
     -- was set before the window closed must not be retried after it closed.
     AND now() - r.scheduled_for <= ($3::integer * interval '1 second')   -- RETRY_WINDOW_SECONDS
     AND a.status IN ('working','scheduled','needs_review')
   ORDER BY r.next_attempt_at
   LIMIT 50
   FOR UPDATE OF r SKIP LOCKED
)
UPDATE agent_schedule_runs r
   SET status = 'started', attempt = r.attempt + 1, started_at = now(),
       finished_at = NULL, error_code = NULL, error_message = NULL, next_attempt_at = NULL
  FROM due
 WHERE r.id = due.id
RETURNING r.*;
```

Then dispatch each returned row through 4e/4f. Three things this statement settles that prose
could not:

- **It reopens the row rather than inserting a new one.** `status` goes `failed` → `started`, which
  is a *rank regression* (2 → 0) and would be refused by §3.8.3's UPSERT rule. That rule governs
  **ingest only** — events arriving from the runtime, which have no way to know an ArkAgent-side
  retry happened. ArkAgent's own writes are not ingest and are not ranked. W3-8's test asserts both
  halves: an out-of-order `started` *event* does not regress the row; the retry pass does.
- **`error_code = NULL` on reopen** is what stops the retry pass from re-selecting the same row on
  the next tick before the dispatch outcome has been written.
- **The reopened row is visible to the sweep again** (§3.5.2 selects `status='started'`), so a
  retry that also disappears becomes `dispatch_lost` on the next lease boundary rather than sitting
  `started` forever.

- Backoff: attempt 1 → +60 s, attempt 2 → +300 s. Then `attempt = 3` and `next_attempt_at = NULL`;
  the occurrence stays `failed` and is the operator's to retry with **Run now**.
- **Hard window:** no retry is scheduled when `now() - scheduled_for > 15 minutes`. A digest that is
  twenty minutes late is a misfire question (§3.9), not a transport question, and retrying it
  eleven minutes into the next occurrence's window creates the overlap `overlap_policy` exists to
  prevent.
- The retry re-uses the **same** occurrence row — same `scheduled_for`, `attempt` incremented — so
  the unique index still holds and history shows one occurrence with three attempts rather than
  three occurrences.
- **A failed run never wedges a schedule.** `next_run_at` advanced before the dispatch (§3.4.1), so
  the next occurrence is already scheduled regardless of how this one ends. That is AC-SCH-7, and
  it is a property of the ordering rather than of the retry logic.

### 3.10.3 What the user sees

A `failed` occurrence with retries remaining renders `Retrying · attempt 2 of 3` with the next
attempt time; exhausted, it renders `Failed` with the `error_code` translated through
`lib/i18n/activity.ts` and a **Run now** button. `error_message` is **never** rendered, and is not
even serialized (§3.8.2's `ScheduleRunDTO`). The reason is `BACKEND_INTEGRATION_CONTRACT.md` §3.4's
own definition of the field — *"≤480 chars, **English**, for logs"* — not §6.2, which constrains
what the runtime may *send*, not what ArkAgent may render. An English-only string has no place on a
surface that ships in zh / zht / ja.

`TEST_PLAN_V2.md` UC-V2-21 flow 1a says *"the error is shown in full"*, which was written before
the field's definition was settled and is the one place the two documents disagree. **The
translated `error_code` plus the `attempt n of 3` line is "in full" for an operator**; the raw
English string is a support artefact and stays in the row. Delta **D17** narrows that flow. Two consecutive `failed` occurrences on the same schedule raise
one notification when `settings.notifyErrors` is on; the third and subsequent do not, because a
schedule failing every five minutes must not send 288 emails.

**The notification has the same transport problem `deliver_to='email'` has, and the same answer.**
It goes through `lib/notify/mail.ts` to `MAIL_TRANSPORT_URL`; with that unset — which is every
environment today — **nothing is sent and nothing is queued**, the run history still shows the
failures, and the schedule list still shows the badge. A notification that silently does not exist
is acceptable; a notification that silently *fails* and reports success is not, so the tick records
`warnings: ["mail_transport_unconfigured"]` once per invocation rather than per notification. The
same applies to §3.10.4's `schedule.silent` flag.

### 3.10.4 "Expectation not met" — the ran-but-did-nothing signal

The complaint behind almost every schedule support ticket is not *"it didn't run"*. It is *"it ran
and nothing happened"*, and today those two are indistinguishable in every table we have.

`expectation_met` is evaluated by rule, in the ingest handler, when an occurrence reaches
`succeeded`. **No model is involved** — the schedule's `expectation` text is what the user reads on
the run row, not something we ask an LLM to grade.

```ts
// null  = not evaluated (skipped, failed, still started, or the run produced no telemetry at all)
// true  = the run produced observable output
// false = the run terminated successfully and produced nothing observable
function evaluateExpectation(occ, run, schedule): boolean | null {
  if (occ.status !== "succeeded") return null;
  if (!run) return null;                              // no agent_runs row: nothing to judge
  const producedOutput =
    run.stepCount > 0 ||
    (occ.summary != null && occ.summary.trim().length > 0) ||
    run.messagesSent > 0;
  if (schedule.deliverTo !== "none" && !producedOutput) return false;
  return producedOutput ? true : null;
}
```

The three signals are all columns or bounded counts on rows the handler already has open inside its
one transaction (§3.2 of the contract) — no extra round trip, and no model:

| signal | source |
|---|---|
| `run.stepCount` | `SELECT count(*) FROM agent_run_steps WHERE run_id = $1` — indexed by `agent_run_steps_run_idx` |
| `occ.summary` | the `summary` the runtime sent on this very event |
| `run.messagesSent` | `SELECT count(*) FROM messages WHERE conversation_id = $sessionKey AND sender = 'agent' AND created_at BETWEEN run.started_at AND run.finished_at` |

Evaluated only when `occ.status` reaches `succeeded`, i.e. at most once per occurrence.

Three consequences, in order of usefulness:

1. The run-history row shows an amber **`no output`** badge instead of a green tick. The user can
   see the difference between "quiet day" and "broken" because the badge is on the run, and the
   `expectation` text they wrote is right beside it.
2. After **two consecutive** unmet occurrences the schedule is flagged in the list
   (`schedule.silent`), and one notification is sent when `settings.notifyErrors` is on. Two, not
   one: a digest with nothing to report is a legitimate outcome and the single most common false
   positive available.
3. An `agent_improvements` row is **not** created. That queue is for the agent proposing changes to
   its own brief (§3.4 `agent.improvement`), and a silent schedule is an operator-facing
   observation, not a proposal from the agent.

`expectation` being `NULL` does not disable the signal — the rule above never reads the text. The
text changes what the operator is shown next to the badge, which is the difference between "no
output" and "no output — you expected: *a list of drafts, or 'inbox clear'*".

---

# 4. Natural language → schedule

## 4.1 The order is fixed: deterministic first, model only below the floor

```
        user types a phrase
                │
        parseSchedulePhrase(text, { today: zonedParts(now, tz) })
                │
        ┌───────┴────────────────────────────────┐
        │                                        │
   returns a ParsedSchedule                  returns null
        │                                        │
   confidence >= 0.6 ?                    LLM key configured ?
        │                                        │
   ┌────┴─────┐                          ┌───────┴────────┐
  yes         no                        yes               no
   │           │                         │                 │
 ACCEPT     CONFIRM                  PROPOSE            CRON FORM
 (§4.3 A)   (§4.3 B)                 (§4.2, §4.3 C)     (§4.3 D)
```

The deterministic parser runs **first, always, and on every keystroke**. This is not a fallback
ordering — it is the primary path, and the model is the exception:

- It is free, instant, and pure, so the editor can re-run it as the user types and show a live
  interpretation. A model round trip cannot.
- It is predictable. The same phrase gives the same cron today and next month, which is what makes
  `TEST_PLAN_V2.md` TC-063…TC-065 assertions rather than approximations.
- It already covers the four languages natively — `每天早上九点`, `毎週月曜の朝9時`, `every weekday
  at 9am` — which is the shape of the overwhelming majority of real input.
- It works with `OPENROUTER_API_KEY` unset, which is the project's hard requirement for every AI
  feature.

The model is asked exactly one question, only when the deterministic parser returned `null` — never
to "improve" a parse it already produced. A model that overrides a high-confidence deterministic
result is a model that makes the product's behaviour untestable.

## 4.2 The model path

`lib/schedule/llm.ts`, called only from the server route in §4.4. Uses the existing
`lib/llm/openrouter.ts` client (`chatCompletion`, `lib/llm/openrouter.ts:295`);
`isLLMConfigured()` (`:47`) gates it.

**It is `server-only`, and it does not live in `lib/schedule/**` with the pure modules.** Every
other file in that directory is client-safe by construction (§2), and the editor imports from it on
every keystroke; a module that reads `OPENROUTER_API_KEY` cannot sit beside them. The file is
`lib/schedule/llm.ts` only in the sense that its *name* is here — W3-6 places it at
**`lib/services/schedule-llm.ts`** with `import "server-only"` at the top, and `lib/schedule/**`
stays pure. Same reasoning applies to §6's constants: see the note there.

**Every call is recorded.** `recordLlmUsage()` (`lib/llm/usage.ts:65`) takes a `kind` from
`llm_call_kind`, which today is `chat | brief | self_review` (`lib/db/schema.ts:148`). None of them
is this. Reusing `brief` would put schedule parses into the admin console's brief-generation cost
line and make both numbers wrong. **`schedule_parse` is added to `llm_call_kind` in migration
`0008_v2_enum_values_2.sql`** — an enum-values-only file, so the value is added in its own
migration ahead of first use (the C5 hazard). **It cannot go in `0007_v2_enum_values.sql`:** that
file is already on disk and journaled (`meta/_journal.json`, `idx: 7`), and drizzle decides
applied-ness by `folderMillis`, never by file hash, so an edit to it is a permanent silent no-op on
every database that has already run it — `DATA_MODEL_V2.md` §1.1 has the argument and the
`dialect.cjs:64` citation, and its amendment **A3** is why every DDL slot in this document is one
higher than an earlier draft said. Delta **D19** records the one-line edit to
`TASK_PLAN_V2.md` §2.1.

**System prompt** (the only place model text is authored; it is a *system* prompt because it
contains no user content):

```
You convert a scheduling phrase into a 5-field cron expression.

Return ONLY a JSON object, no prose, no code fence:
  {"kind":"recurring","cron":"<m h dom mon dow>","onDate":null,"confidence":<0..1>}
  {"kind":"one_off","cron":"<m h dom mon dow>","onDate":"YYYY-MM-DD","confidence":<0..1>}

Rules:
- Exactly 5 space-separated fields: minute hour day-of-month month day-of-week.
- Allowed: * n a-b a-b/s */s a,b,c ; names JAN-DEC and SUN-SAT ; 0 and 7 both mean Sunday.
- FORBIDDEN, and a reason to return confidence 0: a seconds field, @daily-style macros,
  and the Quartz extensions L, W and #.
- The expression is evaluated in the user's own timezone. Do not convert to UTC.
- For a one-off, put the DATE in onDate and the time-of-day in the cron's minute and hour.
- If the phrase names no time of day, use 09:00 and lower confidence.
- If you cannot read it as a schedule, return {"kind":null,"cron":null,"confidence":0}.
```

**User turn:** `Today is {YYYY-MM-DD} in {timezone}. Phrase: {text}` — the phrase is user content
and travels as user content. Temperature `0`, `maxTokens` 120, one attempt, no retry (a schedule
the model cannot read on the first try is a phrase the user should retype).

**Everything it returns is re-validated before it is shown:**

```ts
const raw = await askModel(text, tz, today);
if (!raw || raw.kind === null) return null;
if (!isValidCron(raw.cron)) return null;             // TC-071: a 6-field cron is a parse failure,
                                                     // not a schedule
if (raw.kind === "one_off" && !/^\d{4}-\d{2}-\d{2}$/.test(raw.onDate ?? "")) return null;
return { ...raw, source: "llm", confidence: Math.min(raw.confidence ?? 0.5, 0.85) };
```

The confidence ceiling of **0.85** is deliberate: a model result never reaches the "accept
silently" band. It always lands in CONFIRM (§4.3 C) so a human sees the interpretation before it is
saved. `AGENT_TEMPLATE_GENERATOR.md` §3.6 uses the same value for pure-LLM proposals
(`confidence: 0.5` there, capped by the same principle).

**With no key, this path does not exist.** `isLLMConfigured()` is false, the route returns
`{ parsed: null, llmAvailable: false }`, and the UI opens the cron form focused. TC-069:
*"I couldn't read that"; nothing is guessed.*

## 4.3 The four bands, and what the UI shows in each

`CONFIDENCE_FLOOR = 0.6` is the only threshold, and `parse.ts:45` is its home.

| Band | Condition | UI | Save |
|---|---|---|---|
| **A · ACCEPT** | `confidence >= 0.6` **and** the cron's minute/hour steps pass `stepOf` (§3.6 iii) | `↩ use this` chip plus *"understood as: **Every weekday at 08:30 · Asia/Singapore**"* — the exact `describeSchedule` output, not a paraphrase — and the next **3** fire times inline (the full 5 appear in PREVIEW once applied) | enabled |
| **B · CONFIRM** | `0 < confidence < 0.6`, **or** a ≥0.6 parse whose step fails `stepOf` | The interpretation as an explicit **proposal**, with a **Yes, daily** / **Change** pair. "Change" opens the cron form **seeded with the guess**. For an uneven step the pair becomes the two admissible neighbours (`every 5 minutes` / `every 10 minutes` for `*/7`). | **disabled until one is chosen** |
| **C · MODEL** | deterministic returned `null`, model returned a valid cron (≤0.85) | Same as B, plus a quiet `via AI` marker. Never auto-applied. | disabled until confirmed |
| **D · NOTHING** | deterministic `null` and (no key, or the model returned nothing valid) | *"I couldn't read that."* The cron form opens, focused. **Nothing is offered.** | n/a |

Band B's exact wording matters and `TEST_PLAN_V2.md` UC-V2-19 flow 1a is emphatic about a case that
looks like B and is not:

- `"9am"` → `{cron:"0 9 * * *", confidence:0.55}` — **below** the floor. Band B. Save disabled.
- `"every weekday"` → `{cron:"0 9 * * 1-5", confidence:0.77}` — **above** the floor, penalised by
  the missing clock. Band A, **Save enabled**, and the assumed **09:00 must be shown prominently**
  rather than hidden. These are different flows; treating them alike either blocks a good parse or
  ships an unconfirmed guess.

`extractTime()` returning `null` is what the editor keys the "assumed 09:00" hint on — the same
signal the parser used to apply its 0.15 penalty.

## 4.4 `POST /api/agents/[id]/schedules/parse`

Agent-scoped so the authorization rule of §3.8 applies unchanged, and so the phrase never travels
on a workspace-wide route where it could be correlated across agents.

```jsonc
// request
{ "text": "every weekday at 8:30",
  "timezone": "Asia/Singapore",
  "lang": "en" }
```

```jsonc
// 200
{ "parsed": { "kind": "recurring", "cron": "30 8 * * 1-5", "onDate": null,
              "matched": "every weekday", "confidence": 0.92, "source": "deterministic" },
  "band": "accept",                                  // accept | confirm | none
  "humanReadable": "Every weekday at 08:30 · Asia/Singapore",
  "upcoming": ["2026-08-31T00:30:00.000Z", "2026-09-01T00:30:00.000Z", "2026-09-02T00:30:00.000Z"],
  "write": { "kind": "cron", "cronExpr": "30 8 * * 1-5", "runAt": null },   // materializeParsed
  "llmAvailable": true }
```

- `text` ≤ 200 chars, `.strict()`. Longer is rejected `422` — a scheduling phrase is short, and the
  limit is also the cheapest defence against using this route as a free LLM proxy.
- `timezone` is `.refine(isValidTimeZone)` and `lang` is the four-value `Lang` union. A phrase is
  never sent to a model with an attacker-chosen zone string.
- **Rate limited to 20 model calls / minute / workspace.** The deterministic parser runs in the
  browser on every keystroke and needs no route at all; this route is called only on blur or on
  explicit request, and only its band-C branch costs money — so the limit is applied **only to the
  branch that reaches the model**, never to the deterministic answer.

  There is no rate limiter in this repository and "no new runtime npm dependencies" forbids
  importing one, so the mechanism is named rather than assumed: a `COUNT(*)` over `llm_usage`
  (`lib/llm/usage.ts`) for this workspace with `kind = 'schedule_parse'` and
  `created_at > now() - interval '1 minute'`, evaluated **before** the call and inside the same
  transaction that will record it. That is one indexed count against a table the call already
  writes, it is correct across serverless instances in a way an in-memory bucket is not, and it
  needs nothing new. Over the limit ⇒ `429 { code: "rate_limited", retryAfterSeconds }`, and the
  UI falls back to band D (the cron form) rather than showing an error — the deterministic result,
  if there was one, is still returned.
- `write` is `materializeParsed()`'s output (§3.7) — the client posts it back to `POST
  /api/agents/[id]/schedules` unchanged. The client never assembles `runAt` itself, so there is
  exactly one place where a one-off's wall clock becomes an instant.
- `{ "parsed": null, "band": "none", "llmAvailable": false }` is the no-key answer, and it is a
  `200`, not a `503` — "I couldn't read that" is a result, not an outage.

---

# 5. The UI contract

This section **extends** `UI_DESIGN_V2.md` §C.3.4; it does not replace it. The wireframes, the
control inventory, the `When` segmented control, the day chips, ADVANCED, PREVIEW, the five
non-exposed columns and the a11y rules in §J all stand. What follows is what §C.3.4 does not say,
plus the three signatures it cites that do not compile (task **W3-5**).

Styling is inline style objects reading CSS custom properties through `lib/theme.ts` (`c.*`,
`font.*`, `r.*`). No Tailwind, no CSS modules. New components:

```
components/ScheduleEditor.tsx      the editor of §C.3.4, both call sites
components/ScheduleList.tsx        the rows of §C.3.4, plus the toggle / edit / delete affordances
components/CronPreview.tsx         the PREVIEW block; aria-live="polite" per §J
components/ScheduleRunHistory.tsx  §5.4
lib/i18n/schedule.ts               §7
```

## 5.1 The three cited signatures that must be corrected (W3-5)

| §C.3.4 says | Reality | Fix |
|---|---|---|
| `lib/schedule/nextRuns(cron, tz, 5)` | `nextRuns(expression, after: Date, timeZone = "UTC", count = 5)` — `after` is mandatory and second | `nextRuns(cron, new Date(), tz, 5)`. Edit `UI_DESIGN_V2.md`. |
| `lib/schedule/fromNaturalLanguage` | no such export; it is `parseSchedulePhrase(input, opts)` | and it needs `opts.today = zonedParts(new Date(), tz)` or **relative one-offs silently stop parsing** |
| "live-validated by `lib/schedule/parse`" | validation is `cronError` / `isValidCron` in `cron.ts` | `parse.ts` never validates an expression |

## 5.2 Two call sites, one component

`ScheduleEditor` is used unchanged in both places, which is the point of extracting it.

**(a) The agent management page** — `/dashboard/fleet/[id]`, the REMINDERS & SCHEDULERS section of
§C.3, alongside SKILLS · RULES · CONTEXT. Rows come from `GET /api/agents/[id]/schedules`; editing
one expands it in place; Save issues `POST` or `PATCH`. §C.3's section header also carries the
`⏻` per row and the **pause all** action — one `UPDATE agent_schedules SET enabled = false,
next_run_at = NULL WHERE agent_id = $1` in the transaction that bumps `config_revision`, and a
**button with a confirm**, never a toggle, because un-pausing cannot know which rows were already
off.

**(b) The AI-guided creation flow** — the REVIEW & EDIT step of `/dashboard/templates`
(`AGENT_TEMPLATE_GENERATOR.md`, task W4-12), section six of six, bound to
`draft.schedules: TemplateSchedule[]`. Two differences, both in the wrapper, none in the editor:

- Nothing is persisted until the template is saved or materialized, so `onChange` writes to the
  draft instead of issuing a `PATCH`.
- A `TemplateSchedule` carries `source` (`user_phrase | deterministic | llm`) and `confidence`,
  which the row renders as a provenance marker. An `llm`-sourced schedule shows the same **via AI**
  marker as band C (§4.3) and is never pre-confirmed.

The field mapping between the two is total and worth writing down once, because it is the C4
mapping that had to be corrected:

| `TemplateSchedule` | column | note |
|---|---|---|
| `title` | `name` | |
| `cron` + `onDate` | `cron_expr` **or** `run_at` | via `materializeParsed`-equivalent (§3.7); `kind:"one_off"` → `kind='once'` |
| `timezone` · `prompt` · `deliverTo` · `enabled` · `maxRunsPerDay` | same-named columns | `deliver_to` and `max_runs_per_day` **do** have columns (conflict C4) |
| `catchUpPolicy` (`skip` \| `run_once`) | `catch_up` boolean | `run_once` → `true` |
| `payloadKind`, `agentKey`, `key`, `source`, `confidence`, `humanReadable` | **no column** | ATG-side only, as §7.3.3 says after the C4 narrowing |

## 5.3 PREVIEW — "next 5 runs"

`nextRuns` already does this; `CronPreview` renders it and adds nothing computational.

```tsx
const upcoming = useMemo(() => {
  if (!isValidCron(cron) || !isValidTimeZone(tz)) return [];
  return nextRuns(cron, new Date(), tz, 5);
}, [cron, tz]);
```

- Pure client-side maths — **no network, no LLM** — so it works in every degraded mode. §C.3.4
  calls it "the whole point" and it is right: cron is unreadable, DST is a trap, and five concrete
  local datetimes are what makes a non-technical user trust the control.
- Rendered with `Intl.DateTimeFormat` in `BCP47[lang]` (`lib/i18n/index.ts`), in the schedule's
  timezone — **never** `toLocaleDateString()` with our own `Lang` code, which silently falls back
  to the browser default and shows a 日本語 user "Aug 31, 2026".
- **Empty is a state, not a blank.** Zero results means the expression can never match; the block
  renders `schedule.previewNeverRuns` in `c.amber` and Save is blocked (AC-SCH-4).
- **DST is shown, not hidden.** When `offsetMinutes` differs between consecutive previewed runs,
  that row carries `· clocks change` in `c.amber`, with the applicable rule from `cron.ts:37-51` in
  its `title`. Computing this by adding 86,400,000 ms to a UTC instant produces five wrong dates
  once a year; walk the zone.
- **Both day fields restricted** ⇒ a union note under the preview: *"fires on the 13th **or** any
  Friday"*. TC-075. §C.3.4's ADVANCED helper line says the same thing in words; the preview is
  what makes it visible.
- `aria-live="polite"`, not focusable (§J): a change to the cron announces the new next run.

`ScheduleList` rows show `describeSchedule(...)` on line 2 and `Next: … (in 2d 18h)` plus the raw
cron in `c.faint` on line 3, exactly as §C.3.4 draws it. The relative part is `Intl.RelativeTimeFormat`.

## 5.4 Run history

New, and specified nowhere before this document. It is a collapsible panel under each expanded
schedule row, fed by `GET …/runs` (§3.8.2), newest first, cursor-paged at 25.

```
 ┌─ RUN HISTORY · Morning sweep ─────────────────────────────────────────────────┐
 │ [ All ][ Succeeded ][ Failed ][ Skipped ]                        12 runs      │
 │ ───────────────────────────────────────────────────────────────────────────── │
 │ ✓  Mon 31 Aug 08:30   started 08:30:04   41s   1,240 tok   Posted 14 drafts   │
 │ ▲  Fri 28 Aug 08:30   started 08:30:02   6s    120 tok     no output          │  c.amber
 │ ✕  Thu 27 Aug 08:30   —                  —     —           Dispatch failed    │  c.red
 │    attempt 3 of 3                                              [ Run now ]    │
 │ ⊘  Wed 26 Aug 08:30   skipped · outside working hours                         │  c.muted
 │ ⊘  Tue 25 Aug 08:30   skipped · 3 runs missed while ArkAgent was unavailable   │
 └───────────────────────────────────────────────────────────────────────────────┘
```

Rules:

- Every row is **one occurrence**, keyed by `scheduled_for`. A retried occurrence shows
  `attempt n of 3` on the same row, never as extra rows (§3.10.2).
- `status` and `skip_reason` render through `lib/i18n/activity.ts` from the **code**, never from
  stored prose (conflict C8). `error_message` is never rendered **and never serialized** — it is
  ≤480 chars of English written for our logs (`BACKEND_INTEGRATION_CONTRACT.md` §3.4), which is
  three-quarters wrong on a surface that ships in zh / zht / ja. §3.10.3, D17.
- `missed_count > 0` renders `schedule.missed` / `schedule.missedAtLeast` depending on
  `missed_truncated` (§3.9.4).
- `expectation_met === false` is the amber **no output** row, with the schedule's own `expectation`
  text shown on expand (§3.10.4).
- `run_id` non-null makes the row a link into the Activity drill-down (UC-V2-26).
- `source: 'mock'` adds a small `MOCK` tag. A demo run must never be mistaken for a real one.
- **Run now** is present on every terminal row, not only failures — re-running yesterday's digest
  is a legitimate thing to want.

## 5.5 Empty and degraded states

Six of them. Each one says what to do next; none is a blank panel.

| State | Copy key | What it says |
|---|---|---|
| No schedules on this agent | `schedule.emptyTitle` / `schedule.emptyBody` | "Nothing scheduled yet. Tell this agent when to work — *'every weekday at 8:30'*." with the NL field focused and two example chips in the active language. |
| Schedule saved, never run | `schedule.historyEmpty` | Shows the **next** fire time, not a blank table (UC-V2-21 flow 1b). |
| Schedule disabled | `schedule.disabledNote` | "Paused. It will not run until you turn it back on." The row keeps its cron and history; disable is not delete. |
| `kind='once'` already fired | `schedule.onceConsumed` | "Fired 3 Sep 09:00." Row greyed, `enabled=false`, with **Duplicate** rather than a dead toggle. |
| Cron can never run again | `schedule.neverRuns` | Amber. Only reachable by an edit that narrowed a live expression; creation already refuses it. |
| Runtime unconfigured / mock | `schedule.runtimeMock` / `schedule.runtimeUnconfigured` | The editor stays fully usable — schedules are Postgres rows. A quiet banner says runs will be simulated, or will be recorded as skipped, so a demo is never mistaken for a deployment. |
| Email delivery unavailable | `schedule.deliverEmailUnavailable` | `MAIL_TRANSPORT_URL` unset (§3.5.4). The **Email** option in the `deliver_to` select is rendered `disabled` with this string as its title, rather than absent — a missing option looks like a product that has no email, a disabled one looks like a deployment that has not configured it. |
| The scheduler itself has not run | `schedule.tickStalled` | `tick.lastTickAt` older than `3 × tick.observedSeconds`, or `lastTickAt === null` (§3.8.2's `TickHealthDTO`). Distinct from `tickTooCoarse`: coarse means late, stalled means never. Amber, and it names the last observed tick. |

Plus the platform banner of §3.1, which is not an empty state but belongs on the same screen:
`schedule.tickTooCoarse` — *"Scheduled runs are currently checked about every 12 hours on this
deployment. Schedules finer than that will run late."*

---

# 6. Limits and abuse

Every number here is a constant, not a literal in a route, because every one of them will be
argued about and two of them are plan-dependent (§8.2). They live in **two** files, and the split
is the same one §2 draws: `lib/schedule/**` is pure and client-safe, so nothing in it may read
`process.env`.

| File | Holds | Why there |
|---|---|---|
| `lib/schedule/limits.ts` | `SCHEDULE_LIMITS` — pure numbers the **editor** also needs (the step picker, the ceiling line in ADVANCED, the "20 schedules" message) | imported by client components |
| `lib/services/scheduler-config.ts` | `SCHEDULER` — the tick's operational knobs, each `Number(process.env.X) || <default>`, with `import "server-only"` | reads the environment (§8.6) |

```ts
// lib/schedule/limits.ts — pure, client-safe, no env
export const SCHEDULE_LIMITS = {
  MAX_ENABLED_PER_AGENT: 20,
  MAX_ROWS_PER_AGENT: 50,
  MAX_ENABLED_PER_WORKSPACE: 200,
  DEFAULT_MAX_RUNS_PER_DAY: 96,       // API default (every 15 min). DDL default stays 288.
  HARD_MAX_RUNS_PER_DAY: 288,         // the C6 CHECK ceiling
  // The only step values that produce an even cadence (§3.6 iii); mirrors describe.ts stepOf.
  // Written as a line comment on purpose: a JSDoc block containing a cron step would be
  // terminated by the step's own closing characters.
  MINUTE_STEPS: [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30],
  HOUR_STEPS: [1, 2, 3, 4, 6, 8, 12],
} as const;
```

```ts
// lib/services/scheduler-config.ts — server-only, env-backed
import "server-only";
export const SCHEDULER = {
  LEASE_SECONDS:           num("SCHEDULER_LEASE_SECONDS", 300),
  GRACE_SECONDS:           num("SCHEDULER_GRACE_SECONDS", 120),
  MISFIRE_MAX_AGE_SECONDS: num("SCHEDULER_MISFIRE_MAX_AGE_SECONDS", 86_400),
  BATCH_LIMIT:             num("SCHEDULER_BATCH_LIMIT", 200),
  PER_AGENT_PER_TICK:      4,
  RETRY_MAX_ATTEMPTS:      3,
  RETRY_WINDOW_SECONDS:    900,
} as const;
```

`MIN_INTERVAL_SECONDS` is deliberately **not** a constant: §6.2 derives the 5-minute floor from
`HARD_MAX_RUNS_PER_DAY` and nothing reads a second copy of it. A constant no code path consults is
a number that drifts.

## 6.1 How many schedules

**20 enabled per agent, 50 rows per agent, 200 enabled per workspace.**

- 20 is chosen against the demand side: ATG proposes 0–8 (`AGENT_TEMPLATE_GENERATOR.md` §3.6), and
  a human operating a busy agent adds a handful more. 20 is generous for the real case and small
  enough that the per-agent fan-out in one tick stays bounded.
- 50 *rows* rather than 50 enabled, because disabling is not deleting (§1.2) and a user who
  seasonally toggles schedules must not hit a wall.
- 200 per workspace is the number that bounds the tick: 200 workspaces × 200 = the claim batch is
  the real limiter, not this. It exists to stop one tenant from monopolising the queue.

Enforced in `lib/services/schedules.ts :: createSchedule` inside the insert transaction, behind an
advisory lock so two concurrent creates cannot both see 19:

```sql
SELECT pg_advisory_xact_lock(hashtextextended($agentId::text, 0));
SELECT count(*) FROM agent_schedules WHERE agent_id = $agentId AND enabled;
```

`409 schedule_limit_reached` with `{ limit, scope: "agent" | "workspace" }` so the UI can say which
one. A `PATCH` that flips `enabled` from false to true passes the same gate.

## 6.2 Minimum interval

**5 minutes.** Not a separate check — it falls out of `HARD_MAX_RUNS_PER_DAY = 288`, which the C6
CHECK already enforces at the database, and 86,400 / 288 = 300 seconds. One number, one place.

`*/1 * * * *` is therefore refusable with a reason the user can act on rather than a flat "no": the
expression fires 1,440 times a day against a ceiling of 288.

## 6.3 The daily-fire check

The check that makes `max_runs_per_day` real at write time rather than only at fire time:

```ts
// lib/services/schedules.ts :: dailyFireCount(cronExpr, timezone, day)
// Both bounds are computed with resolveLocal, never with +86_400_000: on a DST day the local
// day is 23 or 25 hours long, and adding a fixed 24 h either clips an hour of fires or counts
// an hour of the next day's.
const p        = zonedParts(day, timezone);
const midnight = resolveLocal({ ...p, hour: 0, minute: 0 }, timezone).instant;
const nextMid  = resolveLocal(nextCalendarDay({ ...p, hour: 0, minute: 0 }), timezone).instant;

// runsBetween is OPEN at `from` (§3.9.2), so an occurrence AT local midnight is excluded.
// Verified on this tree: with `from = midnight`, `*/5 * * * *` counts 287 rather than 288 and
// `0 0 * * *` counts 0 rather than 1 — an off-by-one that silently under-reports every
// schedule that fires at midnight, i.e. every daily digest set to 00:00.
// Starting one minute BEFORE local midnight puts the 00:00 occurrence back in range without
// admitting 23:59 (nextRunParsed rounds up to the next whole minute past `from`).
const from = new Date(midnight.getTime() - 60_000);
const { runs, truncated } = runsBetween(
  cronExpr, from, nextMid, timezone, SCHEDULE_LIMITS.HARD_MAX_RUNS_PER_DAY + 1);
if (truncated || runs.length > maxRunsPerDay) throw new ScheduleError("exceeds_max_runs_per_day");
return runs.length;
```

- Bounded at 289 steps, so the check costs microseconds even for `* * * * *`.
- Evaluated in the schedule's **own** `timezone`, on a representative day — the same window the
  runtime gate of §3.5.3 counts against, and gate 5 uses this same function so the write-time
  number and the fire-time number cannot disagree.
- The 25-hour DST day genuinely fires more times than the ceiling for an interval schedule. That is
  accepted: gate 5 skips the excess, the row is `skipped / max_runs_per_day`, and the user sees why.
  Refusing to *create* a schedule because of one day a year would be worse.
- This is ATG-L007 (`AGENT_TEMPLATE_GENERATOR.md`) applied at the API, so a hand-typed cron in
  ADVANCED faces the same rule a generated one does. The generator never proposes anything under 15
  minutes, i.e. never above 96 — which is why the **API default drops to 96** while the DDL default
  stays 288 for compatibility with rows already written.
- §C.3.4 requires the ceiling to be visible: a read-only line in ADVANCED showing the effective
  `max_runs_per_day` and what happens at it (*"skips with `max_runs_per_day`"*). A user typing
  `*/1 * * * *` must see why it will be throttled, and if they lift the ceiling to 288 they must see
  the expression still exceeds it.

## 6.4 Tick fan-out

The claim batch is `LIMIT 200` per tick, ordered oldest-first (§3.3.1). Two consequences:

- **Fairness.** Oldest-first means a backlog drains in order and nothing starves. Saturation
  (`claimed === limit`) sets `scheduler_ticks.saturated` and raises `tick_saturated` in the
  response, which is the signal to raise the limit or shorten the tick.
- **Per-agent cap.** At most `PER_AGENT_PER_TICK = 4` occurrences are dispatched for one agent in a
  single tick, so an agent with 20 schedules that all fire at 09:00 cannot consume a fifth of the
  batch. The rest are released unclaimed and picked up by the next tick — one minute later, which
  is inside the §3.9.1 grace and therefore not even a misfire.

Dispatch is concurrent across agents (bounded to 10 in flight) and sequential within one agent, so
`overlap_policy` is evaluated against a stable view of that agent's in-flight runs.

## 6.5 Credits per run, and what a runaway costs

**ArkAgent does not price a scheduled run.** Credits are consumed by `agent.usage` and only by
`agent.usage` (`BACKEND_INTEGRATION_CONTRACT.md` §3.4), which the runtime emits with a `runId` that
ties the charge to the run the schedule produced. There is no second billing path and this document
must not invent one: `usage_records` gains `run_id` in the 0012 migration, and that is the whole
correlation story.

What ArkAgent does own is the **pre-flight refusal** — gate 6 of §3.5.3, before dispatch:

```
workspaces.credits_included - workspaces.credits_used <= 0    -> skipped, credit_cap_reached
settings.monthlyCreditCap > 0 and agents.credits_used >= it   -> skipped, credit_cap_reached
```

There is no `workspaces.credits_remaining` column and there must not be one: `credits_included`
and `credits_used` are the two columns that exist (`lib/db/schema.ts:193-194`) and the remainder is
derived at read time, the same way `manifest.limits.creditsRemaining` derives it
(`BACKEND_INTEGRATION_CONTRACT.md` §2.10). Materialising it would give the tick and the manifest
two answers to the same question.

and the rule that the resulting `agent_activities` row is written **once per calendar day per
schedule**, not once per fire. A capped workspace with a `*/5` schedule would otherwise generate
288 identical "credit cap reached" entries a day, which buries the one that mattered.

### The worked example, because "runaway" needs a number

Take the worst schedule the DDL permits: `*/5 * * * *`, `max_runs_per_day = 288`, at the 6 credits
per run that §3.4's own `agent.usage` example uses.

| | |
|---|---|
| Fires per day | **288** |
| Credits per day | **1,728** |
| An Associate plan's entire monthly allowance (5,000 credits, `lib/db/seed.ts:110`) | consumed in **2.9 days** |
| Credits in a 30-day month | **51,840** |
| Overage beyond the allowance | 46,840 credits |
| At $2 per 1,000 credits (`lib/pricing.ts`) | **≈ $93.70 of overage on a $49 seat** |

**What stops it, and when.** Five brakes, in the order they engage:

| # | Brake | Engages at | Owned by |
|---|---|---|---|
| 1 | `exceeds_max_runs_per_day` at write time (§6.3) | **before the row exists** — this is the one that actually prevents the scenario | ArkAgent |
| 2 | `max_runs_per_day` gate at fire time | fire 289 of the local day | ArkAgent |
| 3 | `settings.monthlyCreditCap` / workspace pool | when the pool empties | ArkAgent (gate 6) |
| 4 | `settings.dailyActionLimit` | on consequential actions | the runtime — ArkAgent cannot enforce it (§2.3) |
| 5 | Per-agent / per-workspace schedule caps (§6.1) | at creation | ArkAgent |

The important line in that table is brake 1, and it is the reason the **API default drops to 96**.
With the DDL default of 288 a user can create the schedule above and brake 2 permits every one of
its fires — the "circuit breaker" is set exactly at the runaway. At 96 the same expression is
refused at creation with a message naming both numbers, and the user must deliberately raise the
ceiling to reach the cost above. **The maximum unbraked spend is therefore one day at the user's own
declared ceiling**, and the user had to type that ceiling.

Two things this design deliberately does **not** do: it does not silently rewrite a user's cron to
something cheaper, and it does not stop a schedule permanently on cost. It refuses, explains, and
skips — the row stays, `enabled` stays true, and the schedule resumes when the cap resets. A
scheduler that disables itself over money and never says so is how a customer loses a month of
digests.

---

# 7. i18n

## 7.1 Two dictionaries, and which owns what

| File | Owns | Task |
|---|---|---|
| **`lib/i18n/schedule.ts`** — new | Every string on the editor, the list, the preview and the run-history panel | W3-9 |
| **`lib/i18n/activity.ts`** — **does not exist; Wave 3 creates it** | The **codes**: run statuses, skip reasons, error codes, activity `code` templates. Anything that arrives as an enum from an event and is rendered from `code` + `params` (conflict C8) | W3-9 |

The split is not cosmetic. `BACKEND_INTEGRATION_CONTRACT.md` §3.4 states that every `skipReason`
"is a translation key in `lib/i18n/activity.ts`", and conflict C8 established that ingest never
freezes prose. So a skip reason has exactly one home, shared by the Activity feed and by the run
history, and `schedule.ts` must not duplicate it.

> **`lib/i18n/activity.ts` is not on disk.** `ls lib/i18n/` today returns sixteen dictionaries and
> `activity.ts` is not among them; the file is scheduled by `HARNESSES_AND_ACTIVITY.md` §5.6 and
> `TASK_PLAN_V2.md` §3 as **W5-4**, in Wave 5. Wave 3's run-history panel (§5.4) renders `status`,
> `skip_reason` and `error_code` and therefore **cannot ship after it**. Earlier drafts of this
> section described the file as "exists, extended", which would have left W3-8 and W3-9 with
> nowhere to put a single string.
>
> **Decision: W3-9 creates `lib/i18n/activity.ts`** containing exactly the `schedule.*` namespace
> of §7.3 — four statuses, ten skip reasons, four error codes, and the three `schedule.*` activity
> `code` templates of §3.8.3 — in all four languages. **W5-4 extends the same file** with the run,
> step, health, metric and tool vocabularies; it no longer creates it. W3-9 therefore gains a
> dependency on nothing, and W5-4 gains a dependency on W3-9. Delta **D20** records the edit to
> `TASK_PLAN_V2.md` §3 and to `HARNESSES_AND_ACTIVITY.md` §8.9.

> **Filename note.** The commissioning brief for this document said `lib/i18n/schedules.ts`;
> `TASK_PLAN_V2.md` §3 (W3-9) and §5 both say **`lib/i18n/schedule.ts`**, and `TASK_PLAN_V2.md` is
> normative. Singular, matching `lib/schedule/**`.

Registered in `lib/i18n/index.ts` like every other screen dictionary, read through
`useApp().lang`, and written **natively in all four languages** — idiomatic 简体中文 / 繁體中文 /
日本語, never a word-for-word rendering of the English.

## 7.2 `lib/i18n/schedule.ts` — the key groups

```ts
import type { Lang } from "@/lib/types";

export interface ScheduleDict {
  // ── section + list ───────────────────────────────────────────────────────
  sectionTitle: string;            // "Reminders & schedulers"
  countOne: string; countMany: string;   // "1 schedule" / "{n} schedules"
  addSchedule: string;             // "+ Add schedule"
  edit: string; remove: string; removeConfirm: string;   // the ✎ / ✕ affordances of §C.3.4
  toggleOn: string; toggleOff: string;                   // the ⏻ control's two states
  pauseAll: string; pauseAllConfirm: string;
  next: string;                    // "Next:"  (prefix on the list row)
  labelSchedule: string;           // badge on a kind='cron' row
  labelReminder: string;           // badge on a kind='once' row
  viaAi: string;                   // provenance marker, band C / TemplateSchedule.source='llm'

  // ── the editor (UI_DESIGN_V2 §C.3.4) ─────────────────────────────────────
  fieldLabel: string;              // "Label"
  fieldWhen: string;               // "When"
  whenDaily: string; whenWeekdays: string; whenWeekly: string; whenCustom: string;
  fieldDays: string;               // "Days"
  dayShort: [string, string, string, string, string, string, string];  // S M T W T F S
  fieldTime: string; fieldTimezone: string;
  fieldRepeat: string;             // "every [n] minutes between [hh:mm] and [hh:mm]"
  repeatEvery: string; repeatBetween: string; repeatAnd: string;
  fieldWhatItDoes: string;         // "What it does"  -> prompt
  fieldExpect: string;             // "What you expect back"  -> expectation
  fieldExpectHint: string;         // "Optional. Shown beside runs that produced nothing."
  fieldDeliverTo: string;
  deliverChat: string; deliverEmail: string; deliverChannel: string; deliverNone: string;
  deliverEmailUnavailable: string; // MAIL_TRANSPORT_URL unset — the disabled option's title (§3.5.4)
  advanced: string;                // "ADVANCED"
  advancedCron: string;            // "Cron"
  advancedCronHelp: string;        // "5 fields: minute hour day-of-month month day-of-week"
  advancedUnionWarning: string;    // the Vixie union note, TC-075
  advancedCeiling: string;         // "Runs at most {n}× a day; past that it skips."
  cancel: string; save: string; saving: string; saveError: string;

  // ── natural language (§4.3) ──────────────────────────────────────────────
  nlPlaceholder: string;           // "every weekday at 8:30"
  nlUnderstoodAs: string;          // "understood as:"
  nlUseThis: string;               // "↩ use this"
  nlAssumedTime: string;           // "assumed {time}"          — band A with no clock in the phrase
  nlConfirmQuestion: string;       // "Did you mean {description}?"   — band B
  nlConfirmYes: string; nlConfirmChange: string;
  nlUnreadable: string;            // "I couldn't read that."   — band D
  nlUnevenStep: string;            // "{n} minutes doesn't divide the hour evenly." — §3.6 (iii)
  nlExamples: [string, string];    // two example chips, in the active language

  // ── preview (§5.3) ───────────────────────────────────────────────────────
  previewTitle: string;            // "Next 5 runs · {timezone}"
  previewNeverRuns: string;        // "This will never run."
  previewDstNote: string;          // "clocks change"
  previewDstRuleGap: string; previewDstRuleAmbiguous: string;   // the `title` tooltips
  previewUnion: string;            // "fires on the {n}th or any {weekday}"

  // ── run history (§5.4) ───────────────────────────────────────────────────
  historyTitle: string;
  historyAll: string; historySucceeded: string; historyFailed: string; historySkipped: string;
  historyDuration: string; historyTokens: string; historyMore: string;
  historyAttempt: string;          // "attempt {n} of {max}"
  historyRetrying: string;         // "retrying at {time}"
  runNow: string; runNowBusy: string; runNowError: string;
  noOutput: string;                // the amber badge, expectation_met === false
  noOutputExpected: string;        // "you expected: {expectation}"
  missed: string;                  // "{n} runs missed while ArkAgent was unavailable"
  missedAtLeast: string;           // "at least {n} runs missed …"   — missed_truncated
  mockTag: string;                 // "MOCK"

  // ── empty + degraded (§5.5) ──────────────────────────────────────────────
  emptyTitle: string; emptyBody: string;
  historyEmpty: string;            // "No runs yet. First run {when}."
  disabledNote: string;
  onceConsumed: string; duplicate: string;
  neverRuns: string;
  runtimeMock: string; runtimeUnconfigured: string;
  tickTooCoarse: string; tickStalled: string;

  // ── validation messages (§3.8.4 codes) ───────────────────────────────────
  errInvalidCron: string;          // prefix; the specific text comes from cronError()
  errInvalidTimezone: string;
  errNeverMatches: string;
  errRunAtInPast: string;
  errIntervalNotSupported: string;
  errIntervalNotRepresentable: string;
  errExceedsMaxRunsPerDay: string; // "{cron} fires {n}× a day; the ceiling is {max}."
  errDeliverTargetUnavailable: string;
  errScheduleLimitReached: string;
  errRunInFlight: string;          // the 409 from POST …/run
  errRateLimited: string;          // the 429 from …/parse (§4.4)
}
```

**103 keys**, counted from the interface above — not the 81 an earlier draft claimed, which was a
guess and would have shipped a dictionary the type checker rejects. (`dayShort` and `nlExamples`
are one key each; they are tuples, not groups.) W3-9's acceptance criterion is *"no untranslated
string on any schedule surface"*, which includes the three the previous attempt would have missed:
the **disabled state**, the **empty state** (`TASK_PLAN_V2.md` §5 names both) and the **row
affordances** — `✎` / `✕` / `⏻` are the only interactive controls in §C.3.4's list row and every
one of them needs an accessible name in four languages (§J).

## 7.3 The enumerated vocabularies, in four languages

These are the keys where a translation slip changes meaning rather than tone, so they are written
out here rather than left to W3-9. Statuses and skip reasons live in `lib/i18n/activity.ts` under
the `schedule.*` namespace; the bands live in `schedule.ts`.

| key | en | zh | zht | ja |
|---|---|---|---|---|
| `schedule.status.started` | Running | 运行中 | 執行中 | 実行中 |
| `schedule.status.succeeded` | Succeeded | 已完成 | 已完成 | 完了 |
| `schedule.status.failed` | Failed | 失败 | 失敗 | 失敗 |
| `schedule.status.skipped` | Skipped | 已跳过 | 已略過 | スキップ |
| `schedule.skip.instance_stopped` | Agent was stopped | 智能体已停止 | 智能體已停止 | エージェントが停止中 |
| `schedule.skip.overlap` | Previous run still going | 上一次运行尚未结束 | 上一次執行尚未結束 | 前回の実行が継続中 |
| `schedule.skip.outside_working_hours` | Outside working hours | 不在工作时间内 | 不在工作時間內 | 稼働時間外 |
| `schedule.skip.max_runs_per_day` | Daily run limit reached | 已达当日运行上限 | 已達當日執行上限 | 1日の実行上限に到達 |
| `schedule.skip.credit_cap_reached` | Credit limit reached | 已达额度上限 | 已達額度上限 | クレジット上限に到達 |
| `schedule.skip.daily_action_limit` | Daily action limit reached | 已达当日操作上限 | 已達當日操作上限 | 1日の操作上限に到達 |
| `schedule.skip.channel_not_bound` | No connected channel | 未连接对应渠道 | 未連接對應通道 | 連携チャネルがありません |
| `schedule.skip.misfire` | Missed while unavailable | 服务不可用期间错过 | 服務無法使用期間錯過 | 停止中に実行機会を逃しました |
| `schedule.skip.misfire_too_old` | Too old to catch up | 已过期，不再补跑 | 已過期，不再補跑 | 期限切れのため補完なし |
| `schedule.err.dispatch_failed` | Could not reach the agent | 无法连接到智能体 | 無法連線到智能體 | エージェントに接続できません |
| `schedule.err.dispatch_lost` | No response before the timeout | 超时未收到响应 | 逾時未收到回應 | 応答がないまま時間切れ |
| `schedule.err.timeout` | Run exceeded its time limit | 运行超出时间上限 | 執行超出時間上限 | 実行が時間上限を超過 |
| `schedule.err.runtime_unreachable` | Agent unreachable | 智能体无法访问 | 智能體無法連線 | エージェントに到達できません |
| `schedule.skip.disabled` | Schedule is off | 该安排已关闭 | 該安排已關閉 | この設定はオフです |
| `schedule.skip.dispatch_unsupported` | This agent cannot run schedules | 该智能体不支持定时运行 | 該智能體不支援定時執行 | このエージェントは定期実行に対応していません |
| `schedule.fired` | Ran {name} | 已运行「{name}」 | 已執行「{name}」 | 「{name}」を実行しました |
| `schedule.skipped` | Skipped {name} — {skipReason} | 已跳过「{name}」— {skipReason} | 已略過「{name}」— {skipReason} | 「{name}」をスキップ — {skipReason} |
| `schedule.failed` | {name} failed — {errorCode} | 「{name}」失败 — {errorCode} | 「{name}」失敗 — {errorCode} | 「{name}」が失敗 — {errorCode} |
| `noOutput` | no output | 无输出 | 無輸出 | 出力なし |
| `nlUnreadable` | I couldn't read that. | 没能理解这个时间安排。 | 沒能理解這個時間安排。 | この指定は読み取れませんでした。 |
| `previewNeverRuns` | This will never run. | 这个安排永远不会触发。 | 這個安排永遠不會觸發。 | この設定では実行されません。 |
| `previewDstNote` | clocks change | 时钟调整 | 時鐘調整 | 時刻変更あり |

## 7.4 Four rules that are not string lookups

1. **Dates and relative times go through `BCP47[lang]`** (`lib/i18n/index.ts`), never through our
   own `Lang` code. `toLocaleDateString("zht", …)` silently falls back to the browser default —
   this is the documented reason `BCP47` exists, and the preview is exactly where it would bite.
2. **The schedule *sentence* is `describeCron`, not a template.** `describeCron(cron, lang)` already
   produces the four languages from one structural analysis, precisely so a Japanese string cannot
   quietly describe a different schedule from the English one. `schedule.ts` must never build
   "every {n} minutes" itself. W3-4's `windowedInterval` shape lands there, not here.
3. **Counts are two keys, not a plural library.** `countOne` / `countMany`, `missed` /
   `missedAtLeast`. The three CJK languages have no plural inflection and English needs exactly
   one branch; a plural runtime for that is a dependency this project does not take.
4. **Day-chip order follows the locale.** `dayShort` is indexed 0=Sunday to match
   `CronFields.dayOfWeek`, but the *rendered* order starts on Monday for `zh`/`zht`/`ja` and on
   Sunday for `en`. The chip's value is its index; only its position moves.

---

# 8. Deltas, open questions, and the test map

## 8.1 Edits this document owes to its siblings

Recorded here in the style of `TASK_PLAN_V2.md` §1, so the corpus stays consistent. Each is a
one-line change; none is a redesign. **They are prerequisites for the tasks named, not follow-ups.**

| # | File | Edit | Blocks |
|---|---|---|---|
| **D1** | `BACKEND_INTEGRATION_CONTRACT.md` §2.7 | Add the three new `agent_schedules` columns — `claimed_at`, `claim_token`, `expectation` — and the `agent_schedules_enabled_next` CHECK, to the DDL block and the column table | W3-3 |
| **D2** | `BACKEND_INTEGRATION_CONTRACT.md` §2.7 | Narrow the `interval_seconds` row: "measured from the end of the previous run" → "measured from the previous **scheduled** instant", with a pointer to §3.6 here for why | W3-3 |
| **D3** | `BACKEND_INTEGRATION_CONTRACT.md` §3.3 | Add the eight new `agent_schedule_runs` columns (incl. `schedule_name`) and the two new indexes; **drop the `schedule_id` foreign key, keeping the column `uuid NOT NULL`** so a deleted schedule neither erases nor orphans its history (§3.0 delta 11 — `ON DELETE SET NULL` retains rows that no query can reach) | W3-3, and `DELETE` in §3.8.2 |
| **D4** | `BACKEND_INTEGRATION_CONTRACT.md` §3.3 | State the equal-rank tie-break explicitly: at rank 2 (`failed` = `succeeded`) the **last write wins**, which is what makes §3.3.3 case C self-heal | W3-8 |
| **D5** | `BACKEND_INTEGRATION_CONTRACT.md` §3.4, `agent.schedule_run` | Add `missed_count` / `missed_truncated` as **ArkAgent-derived, not runtime-supplied**, so the runtime does not try to compute them | — |
| **D6** | `UI_DESIGN_V2.md` §C.3.4 | The three signature corrections of §5.1: `nextRuns(cron, new Date(), tz, 5)`; `parseSchedulePhrase(input, { today })` not `fromNaturalLanguage`; validation is `cron.ts`, not `parse.ts` | W3-5, W3-7 |
| **D7** | `UI_DESIGN_V2.md` §C.3.4 | Add `expectation` to the editor's *What it does* group and note that the NL field **does** create `once` reminders (the current text says `once` is ATG-only) | W3-7 |
| **D8** | `README_V2.md` | ~~Move `REMINDERS_AND_SCHEDULERS.md` out of "commissioned and never written"; give it a row in the engineer table~~ — **DONE** | — |
| **D9** | `TASK_PLAN_V2.md` §2.1 | Note that slot 0012's schedule half now also creates `scheduler_ticks` | W3-3 |
| **D10** | `BACKEND_INTEGRATION_CONTRACT.md` §2.7 | Add `created_by_id uuid REFERENCES users(id) ON DELETE SET NULL` for the audit trail W3-6 asks for | W3-6 |
| **D11** | `TASK_PLAN_V2.md` §2.1 | Add `runtime_event_receipts` to slot **0012**'s contents. §3.8.3 step 5's idempotency ledger is defined in `BACKEND_INTEGRATION_CONTRACT.md` §3.2 but is in no migration; the contract itself flags it as "one table not in the agreed v2 table list" | W3-3, W3-8 |
| **D12** | `TASK_PLAN_V2.md` §2.1 | Add `scheduler_ticks` to slot **0012**'s contents (§3.0 delta 12) | W3-2, W3-3 |
| **D13** | `BACKEND_INTEGRATION_CONTRACT.md` §3.4, `agent.schedule_run` | Extend the enumerated `skipReason` list with the four ArkAgent-originated values: `channel_not_bound`, `misfire`, `misfire_too_old`, `dispatch_unsupported`. Mark them "ArkAgent-originated — the runtime never sends these" | W3-2, W3-9 |
| **D14** | `BACKEND_INTEGRATION_CONTRACT.md` §5.6 pause step 5 | Narrow "schedules for a paused agent are skipped, reported with `reason: instance_stopped`" to: **no occurrence rows are written while an agent is not dispatchable**; the whole pause is accounted for once, on resume, by the misfire path (§3.5.3 gate 1, §3.9.5). Per-fire reporting during a three-week pause is 6,048 rows per schedule | W3-2 |
| **D15** | `BACKEND_INTEGRATION_CONTRACT.md` §3.4 activity-code registry | Register `schedule.skipped` `{scheduleId, name, skipReason, missedCount}` and `schedule.failed` `{scheduleId, name, errorCode}`, both tag `calendar` — the two codes `HARNESSES_AND_ACTIVITY.md` §5.5 marks PROPOSED. `schedule.fired` already exists and is used unchanged | W3-8, W3-9 |
| **D16** | `BACKEND_INTEGRATION_CONTRACT.md` §3.4 `errorCode` baseline | Register `dispatch_failed`, `runtime_unreachable`, `dispatch_lost`, all ArkAgent-originated. The list says "extend by agreement, never silently" | W3-2, W3-9 |
| **D17** | `TEST_PLAN_V2.md` UC-V2-21 flow 1a | "the error is shown in full" → the **translated `error_code`** plus `attempt n of 3`; `error_message` is English-only log text and is not serialized (§3.8.2, §3.10.3) | W3-8 |
| **D18** | `TEST_PLAN_V2.md` TC-080, TC-077, TC-088, UC-V2-20 step 1 | TC-080's label is "at least **501**" (`1 + runs.length`, §3.9.2). TC-077's expected status is `started`, not `running` — `agent_schedule_runs.status` has no `running` value. TC-088's "assert the interval kind" is unreachable once §3.6 closes the writable surface; replace with TC-SCH-D. UC-V2-20 step 1 names the claim column `last_claimed_at`; it is **`claimed_at`** (§3.0 delta 1) | W3-2, W3-3 |
| **D19** | `TASK_PLAN_V2.md` §2.1, slot **0008** | Add `llm_call_kind += schedule_parse` to the enum-values file. §4.2's model call has no `kind` today and `chat \| brief \| self_review` are all wrong for it; adding it anywhere but the enum-values file re-opens the C5 hazard. **Not 0007** — that file is already on disk and journaled, so editing it is a silent no-op on every migrated database (`DATA_MODEL_V2.md` §1.1, amendment A3) | W3-6 |
| **D20** | `TASK_PLAN_V2.md` §3, `HARNESSES_AND_ACTIVITY.md` §8.9 | **`lib/i18n/activity.ts` moves from W5-4 to W3-9**, which creates it with the `schedule.*` namespace; W5-4 extends it. Wave 3 renders skip reasons and error codes and cannot ship after Wave 5 | W3-8, W3-9, W5-4 |
| **D21** | `lib/agent-manager/types.ts:42` | `SendMessageInput` gains `metadata?: Record<string, string>`. Without it §5.3 step 4's `{trigger, triggerRef, scheduledFor}` has nowhere to travel and the runtime cannot echo `scheduledFor` on `agent.schedule_run` | W3-2 |
| **D22** | `UI_DESIGN_V2.md` §D, SCHEDULES row (line 1899) | "pause all" is `UPDATE agent_schedules SET enabled = false, next_run_at = NULL WHERE agent_id = $1` — the stated SQL omits `next_run_at` and now violates `agent_schedules_enabled_next` (§3.0 delta 3) | W3-7 |

## 8.2 Decisions still owed by the product owner

Two, and both are already on `TASK_PLAN_V2.md` §8.2's list. Neither blocks writing the code; both
block shipping it.

1. **Vercel plan and cron granularity** (§8.2 decision 6, blocks W3-2). Per-minute cron and
   `maxDuration > 60` need a plan that allows them; Hobby allows two daily invocations and caps
   functions at 60 s. This design ships either way — §3.1's `tick_too_coarse` banner and §3.9's
   misfire path mean a coarse tick degrades honestly instead of lying — but a product that sells
   "every 15 minutes" on a plan that ticks twice a day is selling something it does not have.
   **The recommendation is Pro**, and `maxDuration = 60` is chosen so the route works on either.
2. **Whether the schedule caps of §6.1 are plan-scaled.** 20 per agent / 200 per workspace are flat
   today. Director at 100,000 credits a month can afford more schedules than Associate at 5,000,
   and a flat cap is either too tight for the top tier or too loose for the bottom. Flat is
   *shipped* because a plan-scaled cap needs a pricing decision, not an engineering one, and the
   constant lives in `lib/schedule/limits.ts` where a plan lookup can replace it without touching a
   route.

## 8.3 Risks

| # | Risk | Mitigation |
|---|---|---|
| **R1** | The platform tick is coarser than the finest schedule and nothing says so — every table looks healthy while the product is silently broken | `scheduler_ticks` (§3.0 delta 12), `observedTickSeconds`, and the `tick_too_coarse` banner. This is the entire reason the ledger table exists. |
| **R2** | A worker dies between the advance and the terminal event, and the occurrence is lost | §3.3.3 case B: bounded to one lease, always recorded as `failed / dispatch_lost`, auto-retried inside 15 minutes, one click from **Run now**. Accepted deliberately, because the alternative ordering risks a duplicate fire. |
| **R3** | `prompt` or `expectation` is treated as an instruction rather than as data somewhere downstream — a template author's text becoming an agent's system prompt | `buildScheduledTurn` (§3.5.4) is the single construction site and it is three lines. W3-6's acceptance criterion is that an injection payload in `prompt` cannot escalate; the same test must cover `expectation`. |
| **R4** | The runtime never implements `agent.schedule_run`, so every occurrence sits at `started` until swept | The sweep (§3.5.2) turns that into a visible `dispatch_lost` rather than a permanent "running". In `mock` mode ArkAgent writes the terminal status itself (§3.5.4), so the whole feature is demonstrable and testable with no runtime at all. |
| **R5** | `runsBetween`'s 500 cap is read as a total and shown to a user as "500 runs missed" | `missed_truncated` is a column, `missedAtLeast` is a separate i18n key, and TC-080 asserts the flag. |
| **R6** | The `DELETE` route ships before D3 and erases run history via the cascade | D3 is listed as a **prerequisite**, not a follow-up. If D3 slips, `DELETE` ships disabled (`405`) rather than destructive. |
| **R7** | Two ticks, or a tick and a Run now, dispatch the same occurrence | Three independent guarantees (§3.2), the third of which is a database unique index. TC-078. |
| **R8** | `deliver_to='email'` and `settings.notifyErrors` both promise mail, and **there is no mail client in this repository** — no `nodemailer`, no Resend, no SMTP — while "no new runtime npm dependencies" forbids adding one | §3.5.4: the transport is one HTTP hop behind `MAIL_TRANSPORT_URL`. Unset, `email` is refused at create time with a named reason and the option renders disabled; notifications are silently not sent and the tick warns once. Nothing promises delivery it cannot perform. |
| **R9** | The advance walks the cron sequence occurrence-by-occurrence after a long outage and times the tick out during exactly the incident it exists to recover from | §3.4.2 is bounded at two `nextRunParsed` calls; §3.9.2 re-anchors to `now` when `runsBetween` truncated. TC-SCH-F asserts the call count, not the wall time. |
| **R10** | `jitter_seconds` is set on a fleet and every occurrence is silently reclassified as a misfire and dropped | §3.4.4 / §3.9.1: lateness is measured from `dispatchAfter`, not `scheduled_for`. TC-SCH-G. |
| **R11** | `lib/i18n/activity.ts` is a Wave-5 file that Wave 3's run history needs, so W3-8 ships rendering raw enum values | D20 moves file creation to W3-9 with the `schedule.*` namespace only; W5-4 extends it. |

## 8.4 Test map

Every P0 in `TEST_PLAN_V2.md` §B.5 / §B.6 now has a specified mechanism to test against.

| AC | Satisfied by | Test cases |
|---|---|---|
| AC-SCH-1 | §4.1 order, §4.4 route, `describeSchedule` | TC-063 … TC-066 |
| AC-SCH-2 | §4.3 bands B and D | TC-067, TC-069 |
| AC-SCH-3 | §4.2's re-validation, §3.8.4 | TC-070 … TC-074 |
| AC-SCH-4 | §3.8.2 `never_matches`, §5.3 empty preview | TC-050 |
| AC-SCH-5 | §3.2 G1/G2/G3, §3.3.1, §3.4.1 | TC-077, TC-078 |
| AC-SCH-6 | §3.9.2 – §3.9.4 | TC-079, TC-080 |
| AC-SCH-7 | §3.4.1 (advance before dispatch), §3.10.2 | TC-081, TC-087 |
| AC-SCH-8 | `cron.ts:37-51`, unchanged; §3.7 for `once` | TC-084, TC-085 |
| AC-SCH-9 | §1.3 CHECK, §3.4.3 | TC-076, TC-088 |
| **AC-CFG-2** | §3.8's one authorization rule on all six tenant routes; §3.8.1's fail-closed bearer. This document's routes are inside that AC and the earlier draft's map omitted them | TC-134 (`POST /api/agents/{W2 agent}/schedules` → 404), TC-137 (no session → 401 on each), **TC-154b** (`CRON_SECRET` unset / wrong / correct → 401 · 401 · 200, plus `vercel.json` declares the `crons` entry) |

Five tests this document adds, none of which existed before it:

| New | Asserts |
|---|---|
| **TC-SCH-A** | The lease strictly exceeds the route's `maxDuration` — read from `vercel.json` / the route module and the env, not asserted in a comment (§3.3.2) |
| **TC-SCH-B** | A worker killed between the claim and the advance re-fires after the lease and produces **one** occurrence; killed after the advance, it produces one `dispatch_lost` and **no** second dispatch (§3.3.3 A and B) |
| **TC-SCH-C** | An `agent.schedule_run` `succeeded` arriving after a swept `failed / dispatch_lost` overwrites it; a `started` arriving after `succeeded` does not (§3.8.3, rank + tie-break) |
| **TC-SCH-D** | `POST /api/agents/[id]/schedules` with `kind:"interval"` is `422 interval_not_supported`, and a `*/N` "every N minutes" control produces `kind='cron'` (§3.6) |
| **TC-SCH-E** | A one-off written from `parseSchedulePhrase("tomorrow at 9")` has `cron_expr IS NULL`, and after firing has `enabled=false, next_run_at IS NULL` — i.e. it does **not** fire again next year (§3.7) |
| **TC-SCH-F** | `advanceSchedule` makes **at most two** `nextRunParsed` calls regardless of how stale the anchor is. Drive it with `*/1 * * * *` and a 28-day-old `scheduledFor` behind a spy; assert ≤2 calls and a `nextRunAt` in the future (§3.4.2). This is the tick-timeout regression. |
| **TC-SCH-G** | A schedule with `jitter_seconds = 300` and `catch_up = false` **runs**; it is not written `skipped / misfire`. Lateness is measured from `dispatchAfter` (§3.4.4, §3.9.1). |
| **TC-SCH-H** | `dailyFireCount("0 0 * * *", tz)` is **1** and `dailyFireCount("*/5 * * * *", tz)` is **288** — the half-open-window off-by-one of §6.3, which under-reported both by one full local midnight. |
| **TC-SCH-I** | The occurrence insert commits only with the advance: force `claim_token` to change between the claim and the transaction and assert **zero** `agent_schedule_runs` rows and **zero** dispatches (§3.4.1's `ClaimLostError`). |
| **TC-SCH-J** | `GET /api/runtime/agents/{id}/schedules` is deep-equal to the `schedules` array of `GET /api/runtime/agents/{id}/manifest` for the same agent (§3.8.5). |
| **TC-SCH-K** | `POST …/schedules` with `cronExpr: "*/7 * * * *"` is `422 interval_not_representable`, and `parseSchedulePhrase("every 7 minutes")` lands in **band B**, not band A (§3.6 iii, §4.3). |

TC-SCH-E is the regression test for the defect W3-1 was opened to fix, and it is the one to write
first.

## 8.5 What each Wave 3 task now has to do

| Task | Unblocked / changed by this document |
|---|---|
| **W3-1** | Done — this document. Both questions answered: §3.6 and §3.7. |
| **W3-2** | §3.3 (claim SQL + lease), §3.5 (the loop + sweep), §3.8.1 (auth, verbs, response), §3.1 (the `vercel.json` entry and the plan caveat). |
| **W3-3** | §3.0 — twelve deltas, all additive, no enum changes. Plus D1–D3, D10, D11, D12. |
| **W3-4** | Unchanged: add `windowedInterval` to `describe.ts`. §5.3 and §7.4 rule 2 depend on it for display only. |
| **W3-5** | §5.1 — the three corrections, and D6. |
| **W3-6** | §3.8.2 CRUD, §3.8.4 validation, §3.5.4's `buildScheduledTurn` boundary, D10 for `created_by_id`. |
| **W3-7** | §5.2 (two call sites, one component), §5.3 (preview rules), §5.5 (six empty states). |
| **W3-8** | §3.8.3 — the UPSERT, the rank, and the equal-rank tie-break (D4). §5.4 for the history view. |
| **W3-9** | §7 — 103 keys in `lib/i18n/schedule.ts`, **plus creating** `lib/i18n/activity.ts` with the `schedule.*` namespace (D20 moves that file from W5-4 to here). |

## 8.6 Environment

```bash
# .env.example additions
# Authenticates POST|GET /api/cron/schedules. The route FAILS CLOSED (401) when this is
# unset — without it the endpoint is an unauthenticated agent trigger on a public URL.
CRON_SECRET=

# Claim lease. MUST exceed the tick route's maxDuration (60), or a still-running tick can
# have its claim stolen and an occurrence dispatched twice. Default 300.
SCHEDULER_LEASE_SECONDS=300

# Rows claimed per tick. Default 200; raise when scheduler_ticks.saturated goes true.
SCHEDULER_BATCH_LIMIT=200

# Misfire grace, in seconds. Lateness at or under this is not a misfire. Default 120.
SCHEDULER_GRACE_SECONDS=120

# Past this much lateness, catch_up is ignored entirely. Default 86400 (24 h).
SCHEDULER_MISFIRE_MAX_AGE_SECONDS=86400

# HTTP endpoint that accepts a POST and sends mail. UNSET (the default) means
# deliver_to='email' is REFUSED at create time with 422 deliver_target_unavailable, and
# settings.notifyErrors / settings.escalateTo notifications are not sent. There is no mail
# client in this repository and "no new runtime npm dependencies" is a hard constraint, so
# the transport is an HTTP hop or it does not exist. See §3.5.4.
MAIL_TRANSPORT_URL=
```

`lib/services/scheduler-config.ts` (§6) reads all five `SCHEDULER_*` values with the defaults above;
`lib/notify/mail.ts` reads `MAIL_TRANSPORT_URL` and is the single call site. Nothing else is added,
and **no new runtime npm dependency is introduced anywhere in this design** — the five constants are
numbers and the mail transport is a `fetch`.
