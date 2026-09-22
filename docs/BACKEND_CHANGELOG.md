# Control-plane changes — handoff to the Agent Manager / runtime team

**Period:** 29–30 August 2026 · **Audience:** the team that owns the Agent Manager and the agent
runtimes · **Status of this document:** every claim below was verified against the code at the time
of writing, and each one names the file it lives in so you can check it yourself.

This is a **change log with actions**, not a specification. The specification is
[`BACKEND_INTEGRATION_CONTRACT.md`](./BACKEND_INTEGRATION_CONTRACT.md), which is self-contained and
written to be implemented against without reading our source. This document tells you *what moved*,
*why*, and *what you now have to do about it*.

---

## 0. The short version

The control plane grew from **24 to 37 database tables** (13 added, all in migration `0009`) and to
**68 API route handlers** (27 at the last commit; counts are `grep -c pgTable lib/db/schema.ts` and
`find app/api -name route.ts | wc -l`). Nine of the thirteen new tables exist for you: three
you **read** to configure an agent, and six you **write** to report what it did. Four of those six
have no writer anywhere today — that is the work this document is asking for. The other two,
`agent_activities` and `agent_schedule_runs`, we already write to ourselves; see §7.

Four things need a decision or a change on your side before any of it functions:

| # | Blocker | Impact if not done |
|---|---|---|
| **B1** | **We never tell you `agents.id`, and every inbound event is routed by it.** | No webhook you send can be delivered. This is the single blocker; nothing else matters until it is fixed. |
| **B2** | No `category_id` for the `codex` and `deepseek` runtimes. | Two of the four supported harnesses cannot be provisioned; they are gated out of the UI. |
| **B3** | Scheduled runs are dispatched but no terminal result comes back. | Every scheduled run shows as dispatched and never completes. |
| **B4** | `applied_config_revision` is never advanced. | The UI cannot tell a user whether a saved change reached the VM. |

---

## 1. B1 — agent identity (read this first)

**This is broken today and it is the highest-priority item.**

When we provision, `lib/services/openclaw_instances.ts` calls the Manager with exactly:

```json
{ "name": "…", "category_id": 2, "target_user_id": "…", "tasks": ["<brief>", "…"], "agent_id": 17 }
```

`agent_id` there is the **Manager's own template id**, not ours, and it is omitted entirely when the
role is `custom`. Our agent's UUID is never sent. Both provisioning paths — `createAgent` in
`lib/services/agents.ts` and the template materializer in `lib/atg/materialize.ts` — go through this
one call, so there is no second path that sends it.

When you send an event back, `app/api/webhooks/agent-manager/route.ts` resolves it with:

```ts
.where(eq(agents.id, event.externalAgentId))
```

That is the handler's only lookup — there is no fallback on `agent_manager_config.external_id` or on
`agents.agent_manager_id`. So `externalAgentId` must be **our `agents.id` UUID**. You have never been
given it, which means every event you send today resolves to no agent and returns `404`. The webhook
handler, the HMAC verification (constant-time, fails closed when the secret is unset) and all seven
event handlers are implemented — they simply cannot route. One caveat before you assume they are
also complete: the `agent.improvement` handler drops fields you may expect it to keep, per §2.2.

**Ignore `ProvisionInput.externalAgentId` in `lib/agent-manager/types.ts` if you find it.** Its
comment says "the Agent Manager echoes it on every webhook" and `liveClient.provisionAgent` would
POST it to `/v1/agents` — but nothing in the codebase calls `provisionAgent`. It is dead code, and
it is the likeliest thing to mislead you into believing this problem is already solved.

### What we need from you

Pick one and tell us which:

- **(a) Accept and echo it.** Take an `external_agent_id` field on instance creation and include it
  verbatim on every event. This is our preference: it is one field and it makes the id opaque to you.
- **(b) Give us a stable instance id at creation and route on that.** We already store the instance
  UUID you return in **two** places — `agent_manager_config.external_id` and `agents.agent_manager_id`,
  the latter carrying a unique index (`agents_manager_id_uniq`). Routing on it is therefore a single
  indexed lookup with no join, and needs no change on your side at all.

Either works. (a) is less work for both sides. Until one lands, treat every inbound-event section
below as blocked.

**Related:** the same call flattens the agent's brief and rules into `tasks[0]`, joined by a blank
line. That is a workaround, not a design. If you can take `instructions` and `rules` as their own
fields we will send them separately.

---

## 2. Schema changes you must know about

Full DDL: [`DATA_MODEL_V2.md`](./DATA_MODEL_V2.md). Migrations `0007`–`0009` in
`lib/db/migrations/`. All are applied and verified against a fresh **and** an incremental replay
(`npm run db:check`).

### 2.1 Enum values added — these will appear in payloads

| Enum | Added | Why it matters to you |
|---|---|---|
| `engine` | `codex`, `deepseek` | The harness set is now four. See §3. |
| `channel_type` | `feishu`, `dingtalk`, `wecom` | These already arrive from your side and previously **500'd on ingest** because the value was cast straight into the enum without validation. They now persist. **The cast is still unvalidated** (`event.channel as MessageChannel`), so any `agent.message` carrying a channel outside the enum still 500s — send only the ten declared values (`lib/channels.ts`). |
| `llm_call_kind` | `template_gen`, `schedule_parse` | Control-plane model calls only; informational. |
| `admin_action` | five `skill_*` verbs | Our audit log only. |

> **A migration rule that will bite you if you write migrations against this database.**
> `ALTER TYPE … ADD VALUE` must go in a migration file containing **nothing else**. drizzle wraps
> every *pending* migration in one transaction, and Postgres refuses to *use* a value added in that
> same transaction — **unless the type was created there too**. That exception is the trap: on a
> fresh replay every type is created in the one transaction, so **CI is always green**, while a
> deployed database receiving the same batch fails and rolls the whole thing back. **It breaks
> production, not CI.** `scripts/check-migrations.ts` replays real deployed states to prove it.

### 2.2 Columns added to tables you already read

| Table | Column | What it is |
|---|---|---|
| `agents` | `config_revision` | Integer, bumped on every configuration change. **The value you poll.** See §5. |
| `agents` | `applied_config_revision` | The revision **you** have applied. We never write it; you do. |
| `agents` | `status_occurred_at` | When the runtime says the status began, distinct from when we recorded it — so an out-of-order status event can be discarded rather than applied. **Column only so far**, exactly like `agent_improvements.kind` below: the `agent.status` variant of `WebhookEvent` declares no such field and the handler neither reads nor writes it. Tell us you can stamp it and we will add the field and the discard rule together. |
| `agents` | `idempotency_key` | Ours, for create-request replay. Ignore it. |
| `workspaces` | `timezone` | The authoritative IANA zone for the workspace. Schedules default to it. |
| `agent_improvements` | `kind`, `proposal` | Intended for your `agent.improvement` event: `kind` is a free varchar (default `'other'`), `proposal` an optional machine-applicable patch. **Columns only so far.** The `agent.improvement` variant of `WebhookEvent` still declares just `text` and `impact`, and the handler writes neither new column — `kind` is still discarded today. Tell us the shape you can send and we will wire the ingest. |

### 2.3 One index change that affects de-duplication

`messages_external_uniq` was **globally unique on `external_id`**. It is now
`messages_agent_external_uniq` on **`(agent_id, external_id)`**.

`external_id` is *your* identifier, and two runtimes are free to mint the same one. Under the old
index the second agent's message was silently dropped by our `onConflictDoNothing` ingest. You do
not need to change anything — this makes your existing behaviour correct — but if you were working
around it by globally namespacing ids, you no longer have to.

---

## 3. Four harnesses (B2)

`engine` is now `openclaw | hermes | codex | deepseek`. The registry is `lib/harness/index.ts`; the
capability profiles are `lib/harness/profiles.ts`.

**Only OpenClaw and Hermes can be provisioned**, because `lib/harness/provisioning.ts` maps:

```
openclaw → category_id 2      hermes → category_id 4
codex    → (none)             deepseek → (none)
```

`categoryIdFor()` **throws** (`HarnessNotProvisionableError`) on an unmapped harness rather than
guessing. That replaced `input.engine === "openclaw" ? 2 : 4` — a two-way branch on what is now a
four-value enum, which would have silently provisioned a **Hermes** VM for anyone who hired a Codex
agent: wrong image, no error, a running container, a billed seat.

Codex and DeepSeek are gated out of every picker and refused with `422` at the API. To turn them on:

1. Tell us the `category_id` for each, and the base image behind it.
2. We add them to the map and enable them via `ATG_ENABLED_HARNESSES`.

### Capability claims are tri-state, and we need you to settle them

`HARNESS_PROFILES` records each surface as `yes` / `no` / **`unknown`**. `unknown` means *nobody has
verified it* — and it never renders a control, because a switch built on an unverified claim is one
that silently does nothing.

These four are open against you. They are the ids `HARNESS_PROFILES` carries, numbered as in
[`BACKEND_INTEGRATION_CONTRACT.md`](./BACKEND_INTEGRATION_CONTRACT.md) §8 ("Open questions blocking
full conformance") — that table is the authoritative wording, and these are its questions restated:

| Id | Carried by | Question |
|---|---|---|
| CONFIRM-4 | OpenClaw | The exact enum for `status` vs `provisioning_status`. Both use `running` for different things, and a healthy instance reporting `done` is currently mapped to not-ready — which is why agents sit in `provisioning`. |
| CONFIRM-5 | Codex, DeepSeek | `category_id` for `codex` and `deepseek`. `1` and `3` are unexplained holes we will not assume are free. **This is B2** — the same question, not a separate one. |
| CONFIRM-6 | Hermes, DeepSeek | Per-harness support for `tools.docker`, `selfImprove` and `autoCreateSkills`. Decides whether the settings screen shows switches that do nothing. |
| CONFIRM-7 | Hermes | **Which channels each harness supports**, and how a channel credential reaches the runtime without passing through `channels.config` (encrypted at our application layer). Nothing has exercised a Hermes channel end to end. |

CONFIRM-7 changed a product default: Customer Support previously defaulted to Hermes — the one role
whose entire job is holding conversations on channels, on the harness whose channel support is
unverified. It now defaults to OpenClaw (`lib/db/seed.ts`, `roleEngine()`, which returns `hermes`
for `content` and `legal` only; `support` was in that list and is not any more).

---

## 4. Tables you READ — the agent's configuration

An agent's configuration is no longer just `instructions` + `rules`. It is six sections, three of
which are backed by new tables. All are keyed by `agent_id` and all are already migrated.

| Section | Table | What to do with it |
|---|---|---|
| ROLES | `agents.role_id` → `agent_roles` | Unchanged. |
| AGENTS | `agents.*` + `agents.settings` JSONB | Unchanged shape; see `lib/agent-settings.ts` for the full settings model. |
| **SKILLS** | **`agent_skills`** → `skills` | Install these into the harness's skill directory. See §4.1. |
| **RULES & BOUNDARIES** | `agents.rules` + `settings` | Unchanged storage; the UI now writes structured rules into it. |
| **CONTEXT** | **`agent_context_items`** | Documents and pasted text the agent should know. See §4.2. |
| **REMINDERS & SCHEDULERS** | **`agent_schedules`** | You do **not** poll these — we dispatch. See §6. |

### 4.1 `agent_skills`

One row per skill attached to an agent. The columns that matter to you:

- `skill_id` → `skills`, which carries `slug`, `owner_handle`, `source_id`, `format`
  (`agent_skill` / `mcp_server` / `skill_pack`), `install` (JSONB) and `requirements` (JSONB).
  Note there is **no `skills.version`**: the catalogue holds `latest_version` and `known_versions`,
  and the *pinned* version you install is `agent_skills.version`, snapshotted at attach and never
  "latest".
- `state` — the enum is **`agent_skill_state`** with values
  `pending · installing · installed · failed · removing · removed`.
  We write exactly two: `pending` on attach and `removing` on detach. **You own every other
  transition** and report it with `agent.skill_state` (payload field is `state`, not `status` —
  one vocabulary end to end).
- `config` — per-agent skill configuration, JSONB. Env var **names** and non-secret values only;
  keys matching `/token|secret|key|appsecret|password/i` are rejected at write time.

All four harnesses read the same agentskills.io `SKILL.md` format from `.agents/skills/`. Skill
compatibility is therefore about **runtime dependencies** — binaries, environment, config — carried
in `skills.requirements`, and never about format.

> **Treat every string in `skills` as untrusted third-party data.** Names, summaries and
> descriptions come from public registries. Do not interpolate them into a system prompt without
> framing them as data, and do not execute anything they contain.

### 4.2 `agent_context_items`

- `kind` — `file` | `text` | `url`
- `state` — `awaiting_upload · pending · indexing · indexed · failed · removed`.
  `awaiting_upload` means **no bytes exist yet**; `pending` means bytes are present and indexing has
  not started. The distinction is load-bearing: collapsing them makes you fetch a null
  `content_url`. We write `pending`, `awaiting_upload` (template generator only) and `removed`;
  `indexing`, `indexed` and `failed` are yours. A row in `awaiting_upload` must be **skipped
  silently** — never fetched.
- `text_body` for pasted text, `content_url` for files, `source_url` for URLs.
- `sha256`, `bytes`, `mime` for verification.

Same warning: uploaded content and file names are untrusted.

---

## 5. The config revision protocol (B4)

`agents.config_revision` is an integer we increment **in the same transaction** as any write that
changes what the agent should do — brief, rules, settings, skills, context, schedules, channels.

You should:

1. Poll or receive `config_revision`.
2. Apply the configuration.
3. Report the revision you applied. We store it in `applied_config_revision`.

`applied_config_revision < config_revision` means a resync is due, and the UI says so instead of
implying a save reached the machine.

**Honest current state on our side.** Four writers bump it today:
`PATCH /api/agents/[id]`, `lib/services/agent-config.ts` (skills and context),
`lib/services/schedules.ts` and `lib/atg/materialize.ts`. The channel re-link inside that same PATCH
currently runs outside the increment; we know, and it is on our list. **Nothing advances
`applied_config_revision`, because nothing on your side reports it yet.**

We do **not** yet detect concurrent edits — there is no `If-Match` and last write wins. If you need
optimistic concurrency, say so and we will add it.

---

## 6. Scheduled runs (B3)

This is fully built on our side: a due schedule is claimed, dispatched, `next_run_at` advanced and a
run row recorded, and a second tick produces **no duplicate**. The no-duplicate guarantee is
structural rather than merely tested — the advance and the occurrence insert are one transaction
that runs *before* dispatch, and `agent_schedule_runs` carries `UNIQUE (schedule_id, scheduled_for)`
with an `onConflictDoNothing` insert. (Our automated tests cover the scheduler's pure arithmetic and
its validation surface; none of them touch a database, so treat "verified" as "verified by
construction and review", not by an integration run.) What is missing is the terminal result from
you.

### How a run reaches you

A Vercel Cron hits `/api/cron/schedules` every minute. It claims due schedules with a durable lease
(`FOR UPDATE SKIP LOCKED` + `claimed_at`/`claim_token`), advances `next_run_at` **before**
dispatching — which is what makes a duplicate fire impossible and a lost fire merely visible — then
calls the Manager's send-message path with:

```json
{
  "conversationId": "agent:main:schedule:<schedule_id>",
  "channel": "web",
  "body": "<the schedule's prompt, plus its expectation if set>",
  "metadata": {
    "trigger": "schedule",
    "triggerRef": "<agent_schedules.id>",
    "scheduledFor": "<ISO-8601 instant>"
  }
}
```

`conversationId` is `agent_schedules.session_key` when the schedule sets one, and the
`agent:main:schedule:<schedule_id>` form above only as the fallback — do not parse it for the
schedule id, use `metadata.triggerRef`.

If `wake_runtime` is set and the latest health sample says `stopped`, we send a `resume` first
(live mode only, and only when the agent has an `agent_manager_id`).

### What we need back

**Echo `triggerRef` and `scheduledFor` verbatim.** Together they are the occurrence's idempotency
key — `agent_schedule_runs` has `UNIQUE (schedule_id, scheduled_for)`. Without them we cannot match
a result to the run that produced it.

Then write the terminal state via `agent.schedule_run`:

| Field | Notes |
|---|---|
| `status` | `succeeded` · `failed` · `skipped` |
| `summary` | ≤ 500 chars, shown in the run history |
| `error_code`, `error_message` | On failure. Transport codes (`dispatch_failed`, `runtime_unreachable`, `dispatch_lost`) are retried by us; anything else is terminal |
| `run_id` | Link to `agent_runs` if you are writing them |

Until this arrives, every scheduled run sits at "dispatched" forever.

**Time zones are ours, not yours.** Schedules store a cron expression plus an IANA zone, and we
compute the next instant with explicit DST policy (`lib/schedule/cron.ts`): a *skipped* wall clock
fires at the instant the clock jumps; a *repeated* one fires once, unless the expression is an
interval, in which case both passes fire. You receive instants. Do not re-derive them.

---

## 7. Tables you WRITE — the observability surface

**Four of the six have no writer anywhere in the codebase today** — `agent_runs`,
`agent_run_steps`, `agent_health_samples` and `runtime_event_receipts` are read-only from our side,
and `runtime_event_receipts` is not referenced outside the schema at all. The Activity page reads
them correctly and its empty states are the launch-day experience by design. This is the largest
piece of work on your side and the one that makes the product feel alive.

The two exceptions matter, because you will find rows in them and they are **not** yours:

- **`agent_activities`** is already written by the control plane in several places — the
  `agent.activity` and `agent.usage` webhook handlers, self-review, improvement decisions, agent
  create/lifecycle, the scheduler, and the demo seed. Your `agent.activity` events append to the
  same timeline; they do not own it.
- **`agent_schedule_runs`** is written by our own cron tick, which opens the occurrence row before
  dispatch (§6). You **update** that row via `agent.schedule_run`; you do not create it.

Event schemas, batch shape, idempotency and retry policy are all in
[`BACKEND_INTEGRATION_CONTRACT.md`](./BACKEND_INTEGRATION_CONTRACT.md) §3. Summary:

| Table | One row per | Volume |
|---|---|---|
| `agent_runs` | Unit of work — a chat turn, a scheduled run, a channel message | Moderate |
| `agent_run_steps` | Step inside a run: thinking · tool_call · tool_result · message · final_answer | **High — the volume driver** |
| `agent_health_samples` | Periodic sample: `state`, `cpu_percent`, `memory_bytes`, `uptime_seconds`, `active_runs`, `source` | High |
| `agent_schedule_runs` | Scheduled occurrence — §6 | Low |
| `agent_activities` | Human-readable timeline entry | Moderate |
| `runtime_event_receipts` | Every event you send — the idempotency ledger | = event count |

### `runtime_event_receipts` — read this before you build ingest

`event_id` is the primary key and **must not be derived from content that can legitimately repeat**.
A payload hash silently swallows a real second occurrence of an identical activity line. Use your
own event-log primary key, or a ULID.

The optional `seq` is a **per-agent monotonic counter**, and it is what makes ordering correct under
out-of-order delivery. Send it if you can.

Without this table a redelivered `agent.usage` event **double-bills the customer**: the handler
increments `workspaces.credits_used` and `agents.credits_used` with atomic SQL, which is safe under
concurrency but has no notion of replay. Today **nothing consults `runtime_event_receipts`** — the
table exists and the ingest path does not use it yet, so there is currently no replay guard at all.
Wiring it is on us; deriving a usable `event_id` is on you, and the two have to land together.

### Events already implemented on our side

`agent.status` · `agent.heartbeat` · `agent.activity` · `agent.message` · `agent.metric` ·
`agent.improvement` · `agent.usage` — all handled in
`app/api/webhooks/agent-manager/route.ts`, HMAC-verified. They work the moment B1 is resolved.

Events the new tables need, and which we have **not** implemented yet — tell us the shape you can
produce and we will build the handler: `agent.run`, `agent.run_step`, `agent.health`,
`agent.schedule_run`, `agent.skill_state`, `agent.context_state`.

---

## 8. Control-plane behaviour changes that affect you

| Change | Detail |
|---|---|
| **The simulator is gone in production** | `AGENT_MANAGER_MODE` unset used to resolve to the in-process mock — *including in production*, where it reported every agent as `working`, invented VM ids and uptimes, and billed for a seat behind which no machine was ever started. With no base URL and no explicit mode it now resolves to `unconfigured` **when `NODE_ENV=production`** — and agent routes return **503**. Outside production the mock is still the default. Set `AGENT_MANAGER_BASE_URL`, or `AGENT_MANAGER_MODE=mock` explicitly for a non-production host. |
| **Agent chat 503s rather than faking** | With neither a runtime nor a model configured, production returns 503 instead of streaming a canned reply that only looks like a model. |
| **`OPENCLAW_MANAGER_API_*` fail loudly** | An unset key used to send `Bearer ` to a hardcoded default host and 401 — which reads as your outage rather than our misconfiguration. Both now throw in production with the variable named. |
| **Cron endpoints fail closed** | `/api/cron/schedules` requires `Bearer $CRON_SECRET`; `/api/skills/sync` accepts that **or** a platform-admin session. Both compare the secret with `timingSafeEqual` and refuse when it is unset. Registered in `vercel.json` at `* * * * *` and `17 3 * * *` respectively. |
| **Harness changes are gated on both routes** | `POST /api/agents` and `PATCH /api/agents/[id]` both refuse an unprovisionable harness with `422`. Previously only create was gated, so Settings could move a live agent onto a runtime that does not exist. |
| **Deletion** | `DELETE /api/agents/[id]` stops the runtime, then removes the agent and its billing seat. `usage_records.agent_id` is `ON DELETE SET NULL`, so spend history survives. |

---

## 9. What we need from you, in order

1. **B1 — agent identity.** Nothing inbound works until this is decided. §1.
2. **B3 — `agent.schedule_run`.** Scheduled runs are dispatched and never complete without it. §6.
3. **B2 — `category_id` for `codex` and `deepseek`**, plus the base images. This is CONFIRM-5. §3.
4. **Answer CONFIRM-4, CONFIRM-6 and CONFIRM-7** (CONFIRM-5 is item 3). Each unanswered one hides a
   UI control or leaves a status mapped wrong. §3.
5. **B4 — report `applied_config_revision`.** §5.
6. **Run and step telemetry.** The largest piece, and the one the Activity page exists for. §7.
7. **Skill and context state transitions** — `agent_skills.state`, `agent_context_items.state`. §4.

### Two things we need to agree on

- **Transport — and we should not have to ask you this one.** The contract assumes outbound HTTPS in
  both directions. Two of the three Manager addresses on record are fine: `https://clawmanager.lightark.cc`
  (the code default, public HTTPS) and `http://localhost:4000` (the `.env.example` development
  default). But `manager_api.md`, the reference this entire integration was built from, documents
  the Manager **only** at `http://10.21.27.155:18090` — plain HTTP on a private RFC1918 range.
  That is exactly the case that changes the webhook design, and it is already the documented one.
  This is CONFIRM-9 and CONFIRM-10 in the contract, where it is logged as risk **#0**: if the
  cluster has no public egress, neither the read contract nor the write contract works as specified,
  and the answer is a reverse tunnel, an allowlisted egress proxy, or a materially different
  project. **Confirm the production origin before anything else in §9 is scheduled.**
- **Whether you poll or we push.** Today we push (schedules) and you push (events). If you would
  rather poll for due schedules, we will expose a read-only manifest endpoint instead —
  `REMINDERS_AND_SCHEDULERS.md` §3.8.5 has the design.

---

## 10. Reading order

| You are | Read |
|---|---|
| Implementing ingest | [`BACKEND_INTEGRATION_CONTRACT.md`](./BACKEND_INTEGRATION_CONTRACT.md) end to end. It is self-contained. |
| Wondering what a column means | [`DATA_MODEL_V2.md`](./DATA_MODEL_V2.md) |
| Wondering why the Manager API looks the way it does | [`research/RUNTIME_INTEGRATION.md`](./research/RUNTIME_INTEGRATION.md) — what it does today vs what v2 needs, with a gap table |
| Working on schedules | [`REMINDERS_AND_SCHEDULERS.md`](./REMINDERS_AND_SCHEDULERS.md) |
| Working on skills | [`SKILL_REPOSITORY.md`](./SKILL_REPOSITORY.md) |
| Deploying any of it | [`DEPLOYMENT.md`](./DEPLOYMENT.md) |

Questions on any of this should come back to the control-plane team with the section number — every
claim here names the file it came from, so we can check it together.
