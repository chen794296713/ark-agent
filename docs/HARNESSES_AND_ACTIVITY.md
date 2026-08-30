# ArkAgent v2 — Harnesses & Activity

**Status:** design. Subordinate to `docs/TASK_PLAN_V2.md`, which is normative and whose §1
conflict ledger outranks anything here. This document filled two of the four gaps
`docs/README_V2.md` once listed as never written; **all four now exist and are indexed there.**
Its own findings are C14–C21 in that ledger's §1a.

**Audience:** the ArkAgent engineers building Wave 0's harness tasks (W0-4, W0-5) and Wave 5's
Activity rebuild (W5-1…W5-4). The backend/runtime team does **not** read this — they read
`docs/BACKEND_INTEGRATION_CONTRACT.md`, which this document never contradicts.

---

## 0. What this document owns, and what it must not touch

| Owned here | Owned elsewhere — cited, never redefined |
|---|---|
| `lib/harness/**` — the `HarnessAdapter` abstraction and its four implementations | The 16 inbound event schemas · `BACKEND_INTEGRATION_CONTRACT.md` §3.4 |
| The harness → `category_id` resolution and its failure mode (W0-5) | `agent_runs`, `agent_run_steps`, `agent_schedule_runs`, `agent_health_samples` DDL · contract §3.3 |
| `ATG_ENABLED_HARNESSES` — the availability gate | `agent_activities` / `agent_metrics` / `usage_records` / `llm_usage` DDL · `lib/db/schema.ts` |
| The engine auto-match scorer and its four-language rationale | HMAC signing, idempotency, ordering, retries · contract §1.4, §3.2 |
| The **activity code** vocabulary — the closed set the backend codes against | The visual grammar of the Activity tab (glyphs, hex, spacing) · `UI_DESIGN_V2.md` §F |
| Every Activity view's query, index, DTO, filters, pagination and empty state | The DTO field names themselves, where `UI_DESIGN_V2.md` §F.5 already declares them |
| Event volume, retention and the rollup decision | Migration slot order · `TASK_PLAN_V2.md` §2.1 |
| `lib/i18n/activity.ts` and `lib/i18n/harness.ts` structure | The four-language copy itself, which is a Wave-5 implementation task |

**Three rules this document imposes on itself.**

1. **No second event vocabulary.** Every wire event named here is one of the contract's 16. Where a
   view needs something the contract does not emit, it is marked **PROPOSED** in bold, listed once
   in §5.6, and carries the name of the contract section it would amend.
2. **No new migration slot.** `TASK_PLAN_V2.md` §2.1 fixes six files, 0007–0012, and improvising a
   seventh is exactly what that section forbids. Everything additive here lands in **0012**
   (`0012_v2_runtime.sql`), which already owns `agent_activities.code` / `.params` / `.run_id` — so
   an index on those same columns belongs in the same file by construction, and so do the two index
   definitions §6.0 **amends** (they are created in 0012 and must be edited there, not duplicated).
   Part 1 needs **zero** schema change
   beyond the two enum files' groups, because the per-harness data it wants already has a home in
   `agent_manager_config.config` (`lib/db/schema.ts:415-435`), a JSONB column whose stated purpose
   is "the full upstream response stored opaquely … so the schema doesn't need to grow".
3. **No fabricated numbers on screen.** Inherited from `UI_DESIGN_V2.md` §F.3 (no disk percentage
   without a denominator) and §F.4 (no `$0.00` for an unpriced model). It is restated here as a
   design rule because §8's empty states are the place it is most tempting to break.

---

# PART 1 — THE FOUR HARNESSES

## 1. Capability matrix

### 1.1 The finding that removes half the problem

`docs/research/SKILL_ECOSYSTEM.md` §0: **all four harnesses read the same skill format from the
same directory.** The Agent Skills format (a folder with a `SKILL.md` carrying YAML frontmatter)
is an open standard at agentskills.io, and `.agents/skills/` is honoured by every one of the four.

The consequence is worth stating in the negative, because it deletes work that a reasonable
engineer would otherwise plan for: **there is no per-harness skill compiler, no format
normaliser, and no per-harness body column.** `skills` stores one canonical body.

What *does* differ is **runtime dependency** — a binary on `PATH`, an env var, a host-specific
tool. That is precisely what `skills.requirements` (`SKILL_REPOSITORY.md` §1.3, adopted verbatim
from OpenClaw's `metadata.openclaw.requires.{bins,env,config}` + `os`) already expresses, and it
is why `skills.harnesses` is an *assertion* array and not a format flag.

So the matrix below is a matrix of **runtime surfaces**, not of formats. Read every "no" as "this
skill's `requirements` cannot be satisfied here", never as "this skill would not parse here".

### 1.2 The matrix

`✔` supported · `✕` not supported · `?` unverified, with the contract's CONFIRM number.
Sources: `BACKEND_INTEGRATION_CONTRACT.md` §4.1–§4.4, `research/RUNTIME_INTEGRATION.md` §1.2,
`research/SKILL_ECOSYSTEM.md` §0, `AGENT_TEMPLATE_GENERATOR.md` §4.1 `HARNESS_BRIEF`.

| | **OpenClaw** | **Hermes** | **Codex Harness** | **DeepSeek Harness** |
|---|---|---|---|---|
| `engine` value | `openclaw` | `hermes` | `codex` | `deepseek` |
| Display label | OpenClaw | Hermes | Codex Harness | DeepSeek Harness |
| `category_id` | `2` | `4` | **unassigned** (CONFIRM-5) | **unassigned** (CONFIRM-5) |
| Base image (observed) | `openclaw-gateway-vnc:v20260622-8` | `hermes-agent-vnc:v20260625-7` | — | — |
| **Local execution** | | | | |
| shell | ✔ | ✔ | ✔ (repo-scoped) | ? CONFIRM-6 |
| files | ✔ | ✔ | ✔ | ✔ |
| headless browser | ✔ | ✕ (narrower surface) | ✕ | ✕ |
| docker | ✔ | ? CONFIRM-6 | ✕ → `tool_disabled` | ? CONFIRM-6 |
| code / test execution | ✔ | ✔ | ✔ **best in class** | ✕ |
| **Skills** | | | | |
| Format | agentskills.io `SKILL.md` | identical | identical | identical |
| Canonical install dir | `.agents/skills` | `.agents/skills` | `.agents/skills` | `.agents/skills` |
| Also scans | `<workspace>/skills`, `~/.agents/skills`, `<state-dir>/skills`, bundled | `~/.hermes/skills`, `<repo>/.hermes/skills`, taps | `$HOME/.agents/skills`, `/etc/codex/skills`, built-in | `./.deepcode/skills`, `~/.deepcode/skills`, built-in |
| MCP client | ✔ | ✔ native | ✔ | ✔ |
| **Memory / learning** | | | | |
| `settings.selfImprove` | ✔ plugin-driven | ✔ **native loop** | ✕ emulate or report unsupported | ? CONFIRM-6 |
| `settings.autoCreateSkills` | ✔ | ✔ (authors new skills) | ✕ | ? CONFIRM-6 |
| Memory curation | plugin | native | session-scoped only | session-scoped only |
| **Tool calling** | full tool surface | full, narrower host set | repo tools + tests + diff | files + network only |
| **Scheduling** | heartbeat scheduler present | ? CONFIRM-6 | ✕ | ✕ |
| **Channels** | full set upstream (`feishu`/`dingtalk`/`wechat`/`wecom` verified E13–E15) | ? CONFIRM-7 | ✕ not expected | ✕ not expected |
| **Model providers** | provider-agnostic router | provider-agnostic | may be pinned to its own family | pinned to DeepSeek models |
| `settings.reasoningEffort` | ignored | → reasoning depth | → effort | → thinking budget |
| **Access URL shape** | ends `#token=` | ends `/login` (interactive step) | unknown | unknown |
| **Chat verified?** | ✔ E7/E8/E10/E11 | ✕ **unverified** (RUNTIME_INTEGRATION risk 12) | ✕ | ✕ |

**Two rows carry more weight than the rest.**

*Scheduling.* Only OpenClaw is known to have a scheduler, and it does not matter: the v2 design
(`BACKEND_INTEGRATION_CONTRACT.md` §5.3) fires schedules from **ArkAgent's** control-plane cron
and injects a user turn. `lib/schedule/**` is already built and dependency-free. Scheduling is
therefore harness-independent by design, and the row above is informational — it must never gate a
schedule in the UI. Rejected alternative: delegate cron to the harness that has one, which would
have made reminders an OpenClaw-only feature and produced four different DST policies.

*Chat verified.* Hermes' `access_url` ends `/login` rather than `#token=`, every chat and session
endpoint lives under `/api/openclaw/…`, and `setLifecycle` only calls start/stop when
`engine === "openclaw"`. **Nobody should assume Hermes chat works today.** The adapter in §2.4
therefore declares Hermes' chat capability `unknown`, not `yes` — which routes it through the
`unsupported` UI state of §9 instead of a red error.

### 1.3 What is already on disk, and the delta

**`lib/harness/index.ts` and `lib/harness/provisioning.ts` already exist.** They landed during
W0-4/W0-5 and this document describes them rather than re-specifying them:

| Exists today | Where |
|---|---|
| `HARNESS_IDS = ["openclaw","hermes","codex","deepseek"] as const` | `lib/harness/index.ts:27` |
| `export type Harness = (typeof HARNESS_IDS)[number]` | `lib/harness/index.ts:29` |
| `isHarness`, `HarnessChoice`, `HARNESS_CHOICES`, `isHarnessChoice` | `lib/harness/index.ts:31-47` |
| `HarnessDef` + `HARNESSES` + `harnessLabel()` + `HARNESS_LIST` | `lib/harness/index.ts:72-156` |
| `CATEGORY_ID: Record<Harness, number \| null>`, `categoryIdFor()` **that throws**, `isProvisionable()`, `enabledHarnesses()`, `isHarnessEnabled()`, `HarnessNotProvisionableError` | `lib/harness/provisioning.ts` (`server-only`) |

**The dependency was inverted, and correctly.** `TASK_PLAN_V2.md` W0-4 specifies
`export type Harness = (typeof engineEnum.enumValues)[number]`. The implementation points the
other way — `lib/db/schema.ts:43` is `pgEnum("engine", HARNESS_IDS)` — so that a client component
can import `Harness` without pulling Drizzle and `postgres` into the browser bundle. That is a
better answer to the same problem and it keeps W0-4's actual guarantee (one list; every exhaustive
`Record<Harness, …>` becomes a compile error when a fifth harness appears). The pattern W0-4 named
survives at `lib/db/schema.ts:818` as `export type Engine = (typeof engineEnum.enumValues)[number]`.

**Assert the two are the same type**, or the inversion is only a convention:

```ts
// lib/db/schema.ts — beside the existing `Engine` alias
type Expect<T extends true> = T;
type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends (<G>() => G extends B ? 1 : 2)
  ? true : false;
type _EngineIsHarness = Expect<Equal<Engine, Harness>>;   // compile-time only
```

Without it, a future `pgEnum("engine", [...HARNESS_IDS, "legacy"])` compiles and the two names
quietly mean different sets — the exact failure mode W0-4 exists to close.

#### 1.3.1 The delta: `HarnessProfile`

`HarnessDef.capabilities` (`lib/harness/index.ts:57-70`) is six **booleans**, and it answers a
product question: *which UI sections exist for this harness.* That is a legitimate question and
the flags should stay.

It is not the question §9 asks. Degradation needs three states — supported / **unsupported** /
failed — and a boolean cannot carry the middle one. Today's file asserts `hermes.channels: true`
and `hermes.selfImproving: true` where `BACKEND_INTEGRATION_CONTRACT.md` §4.2 marks both
**CONFIRM-6/CONFIRM-7 unverified**, and asserts `codex.localExecution: true` /
`deepseek.localExecution: true` where the contract says Codex is repository-scoped and DeepSeek is
"files and network only". Those booleans are claims about someone else's runtime that nobody has
verified, and a `true` there renders a switch that silently does nothing.

So: **add** `lib/harness/profiles.ts` (client-safe, no `server-only`) carrying the runtime surface
as a tri-state. Do not change `HarnessDef`.

**Two prerequisites, because the obvious spelling of this file does not compile.**

*(a) `ChannelType` does not exist as a client-safe export.* `@/lib/types` has `ChannelDef` and
`ChannelField` and nothing else channel-shaped; the only `ChannelType`s in the tree are two local
Drizzle-derived aliases (`lib/db/seed.ts:58`, `lib/services/agents.ts:36`, both
`typeof channels.$inferInsert["type"]`) and an unrelated four-value literal union inside the fleet
page (`app/dashboard/fleet/[id]/page.tsx:3163`). Deriving the type from `$inferInsert` in
`profiles.ts` would pull `lib/db/schema.ts` — and therefore `drizzle-orm` and `postgres` — into the
browser bundle, which is the one thing §2.2 forbids. **Invert the dependency the same way W0-4
inverted `engine`:**

```ts
// lib/channels.ts — NEW, client-safe. The single declaration of the set.
export const CHANNEL_TYPE_IDS = [
  "telegram", "whatsapp", "wechat", "line", "slack", "email", "web",
  // added by 0008 (TASK_PLAN_V2 §2.1: `channel_type` += feishu, dingtalk, wecom)
  "feishu", "dingtalk", "wecom",
] as const;
export type ChannelType = (typeof CHANNEL_TYPE_IDS)[number];
export function isChannelType(v: string): v is ChannelType {
  return (CHANNEL_TYPE_IDS as readonly string[]).includes(v);
}
```

and `lib/db/schema.ts:82` becomes `pgEnum("channel_type", CHANNEL_TYPE_IDS)`, exactly as `:43` is
`pgEnum("engine", HARNESS_IDS)`. Order is append-only for the same Postgres reason. This also gives
§6.1's `channel` filter a validator it does not otherwise have. **PROPOSED delta to
`TASK_PLAN_V2.md` §4.2** (`lib/db/schema.ts` row); no new migration — 0008 already adds the three
values.

*(b) `schedules` is not a harness capability and must not be one.* The contract's §4.1
`capabilities[]` enumeration is exactly
`chat · sessions · channels · tasks · runs · steps · skills · context · health` — nine values, no
`schedules` — and §3.3's rule below maps an **absent** capability to `"no"`. Putting `schedules` in
the type therefore hard-codes `schedules: "no"` on all four harnesses the first time the endpoint
answers, which is precisely the gating §1.2 forbids: ArkAgent fires schedules from its own cron and
no harness answer may suppress that UI. The capability set mirrors the contract exactly.

```ts
// lib/harness/profiles.ts  — client-safe
import { type Harness, HARNESS_IDS } from "./index";
import type { ChannelType } from "@/lib/channels";

/** Three states, never two. `unknown` is what CONFIRM-4/5/6/7 resolve into. */
export type Support = "yes" | "no" | "unknown";

/** Capabilities ArkAgent asks about. EXACTLY the `capabilities[]` array that
 *  GET /api/categories returns (contract §4.1) — no more, because §3.3 reads an
 *  absent entry as a negative, and no less, because a returned value we have no
 *  key for is silently discarded. Scheduling is deliberately NOT here: ArkAgent
 *  owns it (§1.2). */
export type HarnessCapability =
  | "chat" | "sessions" | "channels" | "tasks"
  | "runs" | "steps" | "skills" | "context" | "health";

export interface HarnessProfile {
  readonly harness: Harness;
  /** Always ".agents/skills" — the universal path (SKILL_ECOSYSTEM §0). Typed as
   *  a literal so a future edit that diverges is a compile error, not a bug. */
  readonly skillDir: ".agents/skills";
  readonly altSkillDirs: readonly string[];
  readonly tools: Readonly<Record<"shell" | "files" | "browser" | "docker" | "code", Support>>;
  readonly memory: Readonly<{ selfImprove: Support; autoCreateSkills: Support }>;
  readonly channels: readonly ChannelType[] | "unknown";
  readonly models: Readonly<{ providerAgnostic: boolean; pinnedFamily: string | null }>;
  readonly reasoningEffort: "ignored" | "depth" | "effort" | "thinking_budget";
  readonly accessUrl: "fragment_token" | "login_redirect" | "unknown";
  readonly capabilities: Readonly<Record<HarnessCapability, Support>>;
  /** Contract CONFIRM ids still open. Rendered in the config editor as
   *  "unverified on this runtime" — never hidden, never silently treated as no. */
  readonly confirms: readonly string[];
}

export const HARNESS_PROFILES: Readonly<Record<Harness, HarnessProfile>> = {
  openclaw: {
    harness: "openclaw", skillDir: ".agents/skills",
    altSkillDirs: ["<workspace>/skills", "~/.agents/skills", "<state-dir>/skills"],
    tools: { shell: "yes", files: "yes", browser: "yes", docker: "yes", code: "yes" },
    memory: { selfImprove: "yes", autoCreateSkills: "yes" },
    channels: ["telegram", "whatsapp", "wechat", "line", "slack", "email", "web",
               "feishu", "dingtalk", "wecom"],
    models: { providerAgnostic: true, pinnedFamily: null },
    reasoningEffort: "ignored", accessUrl: "fragment_token",
    capabilities: { chat: "yes", sessions: "yes", channels: "yes", tasks: "yes",
                    runs: "unknown", steps: "unknown", skills: "unknown",
                    context: "unknown", health: "unknown" },
    confirms: ["CONFIRM-4"],
  },
  hermes: {
    harness: "hermes", skillDir: ".agents/skills",
    altSkillDirs: ["~/.hermes/skills", "<repo>/.hermes/skills"],
    tools: { shell: "yes", files: "yes", browser: "no", docker: "unknown", code: "yes" },
    memory: { selfImprove: "yes", autoCreateSkills: "yes" },
    channels: "unknown",
    models: { providerAgnostic: true, pinnedFamily: null },
    reasoningEffort: "depth", accessUrl: "login_redirect",
    capabilities: { chat: "unknown", sessions: "unknown", channels: "unknown",
                    tasks: "unknown", runs: "unknown", steps: "unknown", skills: "unknown",
                    context: "unknown", health: "unknown" },
    confirms: ["CONFIRM-6", "CONFIRM-7"],
  },
  codex: {
    harness: "codex", skillDir: ".agents/skills",
    altSkillDirs: ["$HOME/.agents/skills", "/etc/codex/skills"],
    tools: { shell: "yes", files: "yes", browser: "no", docker: "no", code: "yes" },
    memory: { selfImprove: "no", autoCreateSkills: "no" },
    channels: [],
    models: { providerAgnostic: false, pinnedFamily: "codex" },
    reasoningEffort: "effort", accessUrl: "unknown",
    capabilities: { chat: "unknown", sessions: "unknown", channels: "no", tasks: "unknown",
                    runs: "unknown", steps: "unknown", skills: "unknown",
                    context: "unknown", health: "unknown" },
    confirms: ["CONFIRM-5"],
  },
  deepseek: {
    harness: "deepseek", skillDir: ".agents/skills",
    altSkillDirs: ["./.deepcode/skills", "~/.deepcode/skills"],
    tools: { shell: "unknown", files: "yes", browser: "no", docker: "unknown", code: "no" },
    memory: { selfImprove: "unknown", autoCreateSkills: "unknown" },
    channels: [],
    models: { providerAgnostic: false, pinnedFamily: "deepseek" },
    reasoningEffort: "thinking_budget", accessUrl: "unknown",
    capabilities: { chat: "unknown", sessions: "unknown", channels: "no", tasks: "unknown",
                    runs: "unknown", steps: "unknown", skills: "unknown",
                    context: "unknown", health: "unknown" },
    confirms: ["CONFIRM-5", "CONFIRM-6"],
  },
};
```

**`capabilities` starts almost entirely `unknown`, and that is correct.** Nothing upstream
implements the run / step / skill / context / health surfaces yet (`RUNTIME_INTEGRATION.md` §c gap
table); all of them are PROPOSED. A profile shipping `yes` here would drive §9's UI into "failed"
for features that were never built. `GET /api/categories` (§3.3), once it exists, **overwrites**
these at runtime; the static table is only the boot-time floor.

#### 1.3.2 Two tables, one truth — the reconciliation rule

Adding `HARNESS_PROFILES` beside `HARNESSES[h].capabilities` creates two client-safe tables that
can disagree, and **as first drafted they already did**, in two places:

| Claim | `HARNESSES` (on disk) | `HARNESS_PROFILES` (above) |
|---|---|---|
| OpenClaw self-improvement | `selfImproving: false` (`lib/harness/index.ts:96`) | `memory.selfImprove: "yes"` |
| DeepSeek code execution | `codeNative: true` (`lib/harness/index.ts:145`) | `tools.code: "no"` |

Both are resolved in favour of the contract, which is the only source either table is derived from:
§4.2 says OpenClaw's `settings.selfImprove` is **plugin-driven**, i.e. it works, so
`HARNESSES.openclaw.capabilities.selfImproving` becomes `true`; and the contract's DeepSeek row is
"files and network only", so `HARNESSES.deepseek.capabilities.codeNative` becomes `false` — which
also fixes a live product bug, because `codeNative` is what renders the "specialised for code" copy
in the hire wizard for a harness that cannot run code.

The standing rule, and a test that enforces it (§10.3, `tests/unit/harness/registry.test.ts`):

> For every harness, `HARNESSES[h].capabilities.X` is **true iff** the corresponding
> `HARNESS_PROFILES[h]` entry is `"yes"`, per this mapping —
> `localExecution` ↔ `tools.shell`, `selfImproving` ↔ `memory.selfImprove`,
> `modelAgnostic` ↔ `models.providerAgnostic`, `channels` ↔ (`channels` is a non-empty array),
> `codeNative` ↔ `tools.code`. `portableSkills` is `true` for all four by §1.1 and has no
> tri-state counterpart. **`"unknown"` maps to `false`** on the boolean side: the booleans decide
> *whether a UI section exists*, and a section built on an unverified claim renders a control that
> silently does nothing.

That last clause is why the two tables are not merged: `false` and `"unknown"` are the same answer
to "should I draw this switch?" and different answers to "is this runtime capable?". Rejected
alternative: delete `HarnessCapabilities` and derive the booleans inline at every call site — it
scatters the `"unknown" ⇒ false` decision across ~10 files, and the first one to spell it
`!== "no"` re-opens the bug.

### 1.4 What ArkAgent must store per harness — and where

**No new columns.** Everything has a home already:

| Fact | Column | Note |
|---|---|---|
| Which harness | `agents.engine` | Immutable after provisioning (contract §d preamble); W5-7's "harness switching" is therefore a **draft-stage** operation only, and on a provisioned agent it is create-new-agent. |
| Provider binding | `agent_manager_config.provider` | **Must equal `agents.engine`.** Today it is hardcoded `"openclaw"` for every engine (`RUNTIME_INTEGRATION.md` risk 12) — a Hermes agent is recorded as an OpenClaw one, which breaks the §3.5 mock/live reconciliation rule that keys on this column. Fix in W0-5, same commit. |
| Instance id | `agent_manager_config.external_id` | The upstream UUID. |
| Resolved category, image, capabilities, access-URL shape | `agent_manager_config.config` (JSONB) | Under a single reserved key: `config.arkagent_harness = { categoryId, baseImage, capabilities, accessUrlShape, resolvedAt }`. The column exists precisely so this does not become a migration (`lib/db/schema.ts:409-414`). |
| Applied config revision | `agents.applied_config_revision` | Added in 0009. Drives "not yet applied to runtime". |
| Per-skill compatibility | `skills.harnesses[]` + `agent_skills.state` | An **asserted** array, never a default `true` (contract §4.2). Failure is `agent.skill_state` with `errorCode: "unsupported_harness"`. |

The reserved key is namespaced `arkagent_` because the rest of the blob is the upstream response
verbatim; a bare `capabilities` key would collide the first time the Manager adds one.
---

## 2. The `HarnessAdapter` abstraction

### 2.1 The problem the type system cannot see

W0-4 removed every `"openclaw" | "hermes"` **type** from the codebase — `grep -rn '"openclaw" |
"hermes"' lib app components` now returns nothing. What it did not remove is the harder half:
**identity checks standing in for capability questions.** Three survive:

| Site | Written as | Actually asks |
|---|---|---|
| `lib/services/agents.ts:301` | `if (row.engine === "openclaw")` | "does this harness expose the instance start/stop API?" |
| `app/api/agents/[id]/route.ts:23` | `detail.engine === "openclaw" ? getOpenclawVisibleTasks(id) : null` | "does this harness expose a runtime-visible task list?" |
| `app/dashboard/fleet/[id]/page.tsx:919` | `const isOpenclaw = cur.engine === "openclaw"` | "does this harness report token usage?" |

Three different questions, one identity test, three files. Adding Codex means finding all three
and answering each correctly — and the answer for two of them is *"unknown"*, which
`=== "openclaw"` cannot express. That is the abstraction's whole job: turn identity into
capability, and make `unknown` representable.

### 2.2 Where it lives

```
lib/harness/
  index.ts          EXISTS — HARNESS_IDS, Harness, HARNESSES, harnessLabel, HARNESS_LIST   [client-safe]
  profiles.ts       NEW §1.3.1 — HarnessProfile, HARNESS_PROFILES, Support               [client-safe]
  provisioning.ts   EXISTS — CATEGORY_ID, categoryIdFor, enabledHarnesses                [server-only]
  adapter.ts        NEW — the HarnessAdapter interface + resolveHarness()                [server-only]
  adapters/
    openclaw.ts     NEW                                                                   [server-only]
    hermes.ts       NEW                                                                   [server-only]
    codex.ts        NEW                                                                   [server-only]
    deepseek.ts     NEW                                                                   [server-only]
  categories.ts     NEW — GET /api/categories fetch + process-lifetime cache §3.3        [server-only]
  match.ts          NEW — the engine auto-match scorer §4                                 [client-safe]
```

**Why `lib/harness/**` and not `lib/agent-manager/harness.ts`**, which is what
`research/RUNTIME_INTEGRATION.md` §4.1 proposed: everything under `lib/agent-manager/**` opens with
`import "server-only"` (`lib/agent-manager/index.ts:1`), and `app/hire/page.tsx:8`,
`app/dashboard/fleet/[id]/page.tsx:10` and `lib/agent-display.ts:6` are client modules that already
import from `lib/harness`. Putting the harness table behind a server boundary would force a
duplicate list in the client bundle, which is the one thing W0-4 exists to prevent. The split
inside `lib/harness/` is therefore load-bearing: **`index.ts`, `profiles.ts` and `match.ts` must
never import `server-only`, a DB module, or `process.env`.** `tests/unit/harness-client-safety.test.ts`
(§10.3) asserts it as a source-text check — a runtime import test would pass, because the modules
*work* on the server; what breaks is the browser bundle.

This is also why §4's `matchHarness()` takes its two gate results as **arguments** rather than
calling `isHarnessEnabled()` and `resolveHarness()`: both are `server-only`, `match.ts` is not, and
the hire wizard is a client component.

### 2.3 The interface

```ts
// lib/harness/adapter.ts
import "server-only";
import type { Harness } from "./index";
import type { HarnessProfile, HarnessCapability, Support } from "./profiles";
// The MERGED shape. `StoredAgentSettings` is the partial that lives in the JSONB
// column; every question this interface asks ("does this harness honour docker?")
// is about the resolved value, and a `undefined` there reads as "off" for a
// default-on tool. `mergeSettings()` produces it and is client-safe.
import type { AgentSettings } from "@/lib/agent-settings";
import type { SkillRequirements, SkillFormat } from "@/lib/skills/types";
import { deriveHarnessCompat } from "@/lib/skills/harness";   // client-safe, SKILL_REPOSITORY §2.3

export interface HarnessAdapter {
  readonly harness: Harness;
  readonly profile: HarnessProfile;

  /**
   * The Manager `category_id`. Delegates to `categoryIdFor()`; throws
   * `HarnessNotProvisionableError` for an unmapped harness. Never returns a
   * fallback — §3.
   */
  categoryId(): number;

  /**
   * Live capability, in precedence order:
   *   1. the cached GET /api/categories answer for this harness, if any
   *   2. a capability downgraded to "no" by a 404/405/501 this process saw
   *   3. profile.capabilities[cap]
   * Returns the TRI-STATE. Callers that collapse it to a boolean are the bug.
   */
  supports(cap: HarnessCapability): Support;

  /** Provisioning body for POST /api/instances, minus the shared fields. */
  provisionBody(input: ProvisionInput): Record<string, unknown>;

  /**
   * Chat transport. `dialect` exists because two SSE dialects and two
   * hand-rolled parsers are in the tree today (RUNTIME_INTEGRATION risk 15);
   * the adapter names the dialect so there is ONE parser with a mode, not a
   * third parser.
   */
  chatEndpoint(instanceId: string): { path: string; dialect: SseDialect } | null;

  /**
   * OpenClaw's access_url ends `#token=`; Hermes' ends `/login`, which implies
   * an interactive auth step. Returning the flag rather than the URL alone is
   * what stops the UI opening a login page in an iframe and calling it a
   * console.
   */
  accessUrl(raw: string): { url: string; needsInteractiveLogin: boolean };

  /** Normalise the harness's session shape to ArkAgent's (contract §4.3). */
  normalizeSession(raw: unknown): SessionDTO | null;

  /**
   * The two colliding upstream status vocabularies (contract §3.4 blockquote,
   * CONFIRM-4). Returns the six-value wire status plus the raw string, which is
   * displayed verbatim as `deploymentStatus` and never parsed again.
   */
  normalizeStatus(raw: { status?: string; provisioning_status?: string }):
    { status: RuntimeStatus; deploymentStatus: string };

  /**
   * Can this skill's HOST-CAPABILITY requirements be met here? Never a format
   * question (§1.1), and never a `bins` / `env` / `os` question either — those
   * are properties of the VM image, not of the harness, and
   * `SKILL_REPOSITORY.md` §2.3 rules explicitly that treating them as harness
   * incompatibility marks most real skills unattachable.
   *
   * This is a THIN WRAPPER, not a second implementation:
   *   deriveHarnessCompat(req, format)[this.harness]
   * from `lib/skills/harness.ts`, which already owns `HARNESS_CAPS` (the
   * per-harness `requires.config` capability sets) and the `HOST_CAP_PREFIXES`
   * rule. A second copy here would drift, and the two copies disagreeing is
   * exactly how a skill becomes attachable in the picker and fails at install.
   * `missing` is that function's `note`, split; it maps 1:1 onto the contract's
   * `unsupported_harness` errorCode.
   */
  skillCompat(req: SkillRequirements, format: SkillFormat):
    { supported: boolean; basis: "verified" | "declared" | "inferred" | "unknown";
      missing: string[] };

  /**
   * Which settings survive the trip. `dropped[]` is what makes the config
   * editor honest: a switch this harness ignores renders disabled with the
   * reason, instead of appearing to work. `settings.reasoningEffort` on
   * OpenClaw is the canonical case — it is silently discarded today.
   */
  applySettings(s: AgentSettings):
    { applied: AgentSettings; dropped: { key: string; reason: DropReason }[] };
}

export type SseDialect = "bare-data" | "named-events";
export type DropReason = "unsupported" | "unverified" | "pinned_model" | "tool_disabled";
export type RuntimeStatus =
  | "provisioning" | "deploying" | "working" | "paused" | "error" | "terminated";

/** The registry. Exhaustive by construction; a fifth harness is a compile error. */
export function resolveHarness(h: Harness): HarnessAdapter;
```

`resolveHarness` reads from a `Record<Harness, HarnessAdapter>` literal, not a `Map` and not a
`switch` with a `default`. The literal is what makes a missing fifth harness a type error;
a `default:` branch is how the `? 2 : 4` bug got written in the first place.

### 2.4 The four implementations

Each adapter is thin — a profile, a handful of endpoint strings, and the two normalisers. The
inbound side needs no per-harness code at all: contract §4.3 is titled "What differs per harness —
inbound" and its body is one word, **"Nothing."**

| Adapter | `provisionBody` | `chatEndpoint` | `normalizeStatus` | `applySettings` drops |
|---|---|---|---|---|
| `openclaw.ts` | `category_id: 2`, `agent_id` (role bundle), `tasks[0]` = the brief | `/api/openclaw/instances/{id}/chat/stream`, `bare-data` | maps `provisioning_status: "done"` **and** `"running"` → ready (today only `"running"` is accepted, so healthy instances stick in `provisioning` — `RUNTIME_INTEGRATION` risk 9) | `reasoningEffort` → `unsupported` |
| `hermes.ts` | `category_id: 4` | `null` until CONFIRM-7 — `supports("chat")` is `unknown`, so the UI shows the §9 *unsupported* state rather than calling an OpenClaw path with a Hermes instance id | same | `tools.docker` → `unverified`; `channels` → `unverified` |
| `codex.ts` | throws `HarnessNotProvisionableError` before a body is built | `null` | same | `tools.docker` → `tool_disabled`; `tools.browser` → `unsupported`; `selfImprove` → `unsupported`; `model` → `pinned_model` |
| `deepseek.ts` | throws | `null` | same | `tools.{shell,docker}` → `unverified`; `tools.{browser,code}` → `unsupported`; `model` → `pinned_model` |

**`dropped[]` is not cosmetic.** `AgentSettings` is pushed to the runtime in the manifest
(contract §2.10). A setting the harness ignores is a promise the product made and the runtime
never saw; surfacing it as `dropped` is the difference between "this switch does nothing" being a
documented state and being a support ticket.

### 2.5 The refactor — W0-4's 13 sites, and the three W0-4 did not name

**Landed** (verified in the working tree at the time of writing):

| # | Site | Now |
|---|---|---|
| 1 | `lib/db/schema.ts:39` | `pgEnum("engine", HARNESS_IDS)` at `:43`; `Engine` alias at `:818` |
| 2–3 | `lib/validation.ts:76,130` | `z.enum(HARNESS_IDS)` at `:77`, `:131` |
| 4–6 | `lib/client-api.ts:383,480,487` | `Harness` |
| 7 | `lib/agent-display.ts:23` | `ENGINE_LABEL` derived from `HARNESSES` at `:30`; `harnessLabel()` re-exported at `:34` — closes `MOCK_DATA_AUDIT.md` §4 item 9, where a Codex agent rendered `undefined` in the fleet card |
| 8 | `lib/agent-manager/types.ts:11` | `AmEngine` → `Harness` |
| 9 | `lib/services/agents.ts:168` | `engine: Harness` at `:170` |
| 10 | `lib/db/seed.ts:61-63` (`roleEngine`) | four-value |
| 11 | `app/dashboard/fleet/page.tsx:14` | `EngineFilter` from `HARNESS_IDS`; renders via `ENGINE_LABEL[a.engine] ?? a.engine` at `:87`, `:322` |
| 12 | `app/dashboard/fleet/[id]/page.tsx:1646,1647,1977` | `HARNESS_LIST` at `:10` |
| 13 | `app/hire/page.tsx:228-231,339` | `isHarness` / `Harness` at `:8` |

**Not landed, and not on W0-4's list** — these are the adapter's actual job:

| # | Site | Replace with | Why it is not a mechanical edit |
|---|---|---|---|
| 14 | `lib/services/agents.ts:301` `if (row.engine === "openclaw")` | `resolveHarness(row.engine).supports("tasks") === "yes"` — gate the instance start/stop calls on the lifecycle capability, not the identity | For Hermes the honest answer is `unknown`: the endpoints exist under `/api/openclaw/…` and nobody has run them against a Hermes instance. `unknown` must **attempt** the call and downgrade the capability on `404/405/501` (§9), because refusing outright would break Hermes lifecycle if it does work |
| 15 | `app/api/agents/[id]/route.ts:23` | `supports("tasks")` | Same three-state handling. On `unsupported` the response omits `tasks` entirely rather than sending `[]` — an empty array is indistinguishable from "the agent has no tasks" |
| 16 | `app/dashboard/fleet/[id]/page.tsx:919` `isOpenclaw` / `notOpenclaw` | `supports("chat")` for the console; a separate `usage` probe for the token report | The variable is used for two unrelated decisions. `notOpenclaw` currently renders "token reporting is only available for OpenClaw agents", which is a *product* claim built from an identity check; once the adapter exists it becomes a capability claim that can change without a deploy |

**Acceptance for the second table:** `grep -rn 'engine === "' lib app components` returns only
comments. That grep, not the type-level one, is the real W0-4 gate.
---

## 3. `category_id` — the mis-provisioning defect and the availability gate

### 3.1 The defect, stated exactly

`lib/services/agents.ts` used to read:

```ts
const categoryId = input.engine === "openclaw" ? 2 : 4;
```

A two-way branch on what 0007 makes a four-value enum. `2` provisions
`openclaw-gateway-vnc`; `4` provisions `hermes-agent-vnc`. The `else` arm therefore means
"Hermes", and after W0-4 a customer who chose **Codex Harness** in the hire wizard receives a
**Hermes VM**: correct API responses, a running container, a billed seat, a working chat window,
and the wrong runtime. There is no error anywhere in the system, and the only way to notice is to
read `category_name` in the instance detail. `RUNTIME_INTEGRATION.md` §1.2 confirms `1` and `3` are
unexplained holes upstream that must not be assumed free.

### 3.2 The fix, as landed

`lib/harness/provisioning.ts` (already on disk) — an **exhaustive** `Record<Harness, number | null>`
and a function that throws:

```ts
const CATEGORY_ID: Record<Harness, number | null> = {
  openclaw: 2,
  hermes: 4,
  codex: null,      // CONFIRM-5
  deepseek: null,   // CONFIRM-5
};

export function categoryIdFor(harness: Harness): number {
  const id = CATEGORY_ID[harness];
  if (id === null) throw new HarnessNotProvisionableError(harness);
  return id;
}
```

Three properties, each of which is the point:

1. **`Record<Harness, …>` is exhaustive.** A fifth harness in `HARNESS_IDS` fails to compile until
   someone answers the question. The old ternary had no such obligation, which is why it silently
   absorbed two new enum values.
2. **`null` is a fact, not a placeholder.** It records "the Manager has not assigned one", which is
   true of an external service and cannot be fixed by choosing better.
3. **It throws.** There is no safe default, because every default is somebody else's runtime.
   `HarnessNotProvisionableError` is caught at the route boundary and returned as a **422** with a
   translated message, never a 500 stack trace.

**One correction to make in the same commit.** `agent_manager_config.provider` is written as the
literal `"openclaw"` for every engine (`RUNTIME_INTEGRATION.md` risk 12). Contract §3.5 keys
mock/live reconciliation on exactly this column — `rows with provider = "mock" have no instance
behind them and MUST NOT be adopted` — and §5.1 step 6 says it is `agents.engine`. Write
`input.engine` (or `"mock"` in mock mode). A Hermes agent recorded as OpenClaw is a reconciliation
bug waiting for the first real cluster.

### 3.3 Runtime discovery — `GET /api/categories`

Both `BACKEND_INTEGRATION_CONTRACT.md` §4.1 and `RUNTIME_INTEGRATION.md` §1.2 ask the backend team
for a discovery endpoint rather than two more hardcoded integers. **This document does not ask for
a third time; it specifies the client.**

`lib/harness/categories.ts` (server-only):

```ts
interface CategoryRow {
  id: number; name: string; engine: string;
  base_image?: string; capabilities?: string[];
}

/**
 * Process-lifetime cache with a 10-minute soft TTL. Deliberately NOT a
 * database table: the mapping is a property of the cluster we are pointed at,
 * and persisting it means a stale row survives a cluster swap and provisions
 * into the wrong image — the exact failure class this endpoint exists to end.
 */
export async function harnessCategories(): Promise<Map<Harness, ResolvedCategory>>;
```

Resolution order for `categoryId()`, highest first:

1. a cached `GET /api/categories` row whose `engine` matches — **live mode only**;
2. `CATEGORY_ID[harness]` from `provisioning.ts` — the static floor;
3. `null` ⇒ throw.

An endpoint answer that **disagrees** with the static floor (say `openclaw → 7`) wins, and logs a
`warn` naming both values. A `404`/`501` from the endpoint is not an error — it is the expected
answer today, downgrades `categories` to `unsupported` for the process, and falls through to (2).

`capabilities[]` from the endpoint overwrites `HARNESS_PROFILES[h].capabilities`, mapping a listed
capability to `"yes"` and an **absent** one to `"no"` — absent from an explicit enumeration is a
real negative, unlike the `"unknown"` the static table carries. That asymmetry is the whole value
of the endpoint.

**Mock mode never calls it.** `harnessCategories()` returns the static floor plus `codex` and
`deepseek` mapped to synthetic ids `-1` and `-2`, so the four-harness UI is developable end to end
(`RUNTIME_INTEGRATION.md` §4.2, "Harness availability"). Those ids are negative on purpose: if one
ever escapes into a live provisioning body, the Manager rejects it loudly instead of creating
something.

**And that synthetic mapping is dead unless the gate consults it.** `isProvisionable()` as landed
reads the static `CATEGORY_ID` only (`lib/harness/provisioning.ts:55-57`), so in mock mode `codex`
and `deepseek` are still `null` → still excluded by `enabledHarnesses()` → still absent from every
picker, and nobody can develop the four-harness UI after all. The gate must be mode-aware:

```ts
// lib/harness/provisioning.ts
export function isProvisionable(harness: Harness): boolean {
  if (CATEGORY_ID[harness] !== null) return true;
  // Mock mode has a synthetic id for every harness (§3.3). Live/unconfigured do not.
  return agentManagerMode() === "mock";
}
```

`agentManagerMode()` is already exported from `lib/agent-manager/index.ts:33`, which is
`server-only` — and so is `provisioning.ts`, so the import is legal. `categoryIdFor()` keeps
throwing in live mode, unchanged; only the *availability* predicate widens, and only where there is
no cluster to provision the wrong thing on. `GET /api/harnesses` (§3.5) therefore returns four
available harnesses in mock and two in live, which is the honest answer in both.

### 3.4 The availability gate — and its name

The gate exists on disk as `enabledHarnesses()` / `isHarnessEnabled()`, reading
**`ARK_ENABLED_HARNESSES`**. `TASK_PLAN_V2.md` W0-5 and its §4 file manifest both name it
**`ATG_ENABLED_HARNESSES`**. `.env.example:67` currently carries the `ARK_` spelling, commented
out.

**Decision: the normative name is `ATG_ENABLED_HARNESSES`, and `ARK_ENABLED_HARNESSES` is read as
a deprecated alias for one release.** Not because `ATG_` is the better name — it is not; this gate
governs provisioning and the hire wizard, neither of which belongs to the Agent Template Generator
— but because `TASK_PLAN_V2.md` is normative and a doc/code split on an env-var name is precisely
the kind of thing that survives a review and fails in staging.

The alias is not politeness. `enabledHarnesses()` treats **unset as "every provisionable
harness"**, so a rename with no alias turns a deliberate allowlist into an unset variable that
fails **open**: an operator who set `ARK_ENABLED_HARNESSES=openclaw` to dark-launch Hermes gets
Hermes in the picker on the next deploy, silently.

```ts
// module scope — `enabledHarnesses()` is called on every hire request and on every
// /api/harnesses read; warning inside it would print the same line thousands of times a day.
if (!process.env.ATG_ENABLED_HARNESSES && process.env.ARK_ENABLED_HARNESSES) {
  console.warn("[harness] ARK_ENABLED_HARNESSES is deprecated; rename to ATG_ENABLED_HARNESSES");
}

export function enabledHarnesses(): Harness[] {
  // `??` not `||`: ATG_ wins whenever it is SET, including set-to-empty. With `||`,
  // `ATG_ENABLED_HARNESSES=` beside a stale `ARK_ENABLED_HARNESSES=openclaw` silently
  // re-reads the deprecated variable, which is the failure the alias exists to prevent.
  const raw = process.env.ATG_ENABLED_HARNESSES ?? process.env.ARK_ENABLED_HARNESSES;
  const provisionable = HARNESS_IDS.filter(isProvisionable);
  // UNSET means "every provisionable harness" (§11.3 risk 4). SET-BUT-EMPTY is a
  // deliberate empty allowlist and must NOT collapse to the same branch — the landed
  // `if (!raw)` conflates them, so `ATG_ENABLED_HARNESSES=` fails OPEN today.
  if (raw === undefined) return [...provisionable];
  const requested = raw.split(",").map((s) => s.trim().toLowerCase()).filter(isHarness);
  return provisionable.filter((h) => requested.includes(h));
}
```

The `raw === undefined` line is a behaviour change to `lib/harness/provisioning.ts:70-72`, and it
is the point: today `ATG_ENABLED_HARNESSES=` — the spelling an operator reaches for to turn
everything off — returns **every** provisionable harness. With the fix it returns none, every hire
is a 422, and the mistake is visible in one request instead of in the fleet a week later.

The **intersection** semantics already implemented are right and must be kept: the enabled set is
`provisionable ∩ requested`, never `requested`. An operator listing `codex` before the Manager
assigns it an id would otherwise put a hire button in the UI whose only possible outcome is a 422.

### 3.5 What the user sees for a gated harness

Three distinct states, and conflating any two of them is a bug:

| State | Condition | Hire wizard | Config editor | Copy key |
|---|---|---|---|---|
| **available** | in `enabledHarnesses()` | selectable | selectable | — |
| **not yet on this cluster** | `isProvisionable()` is false | listed, disabled, with the reason | not offered | `harness.unmapped` |
| **turned off here** | provisionable but excluded by the allowlist | **not listed at all** | not offered | — (nothing is shown) |

The middle state is *listed and disabled*, not hidden, because "Codex Harness — not yet available
on this cluster" is information a prospect wants; the third is hidden, because an operator who
turned a harness off does not want customers asking about it. Same mechanism, opposite treatment,
and the difference is which of the two predicates is false.

**Server-side enforcement is not optional.** `enabledHarnesses()` is server-only, and
`POST /api/agents` re-checks `isHarnessEnabled(input.engine)` before it writes a row — a hidden
option in a client bundle is not a permission (`lib/feature-flags.ts` states the same rule for
`NEXT_PUBLIC_*`). Refusal is **422**, with a machine `code: "harness_not_available"` so the client
can localise rather than print the server's English.

**The client learns the set from `GET /api/harnesses`**, a new tiny route returning
`{ harness, label, short, vendor, available, reason }[]` derived from `HARNESSES` +
`enabledHarnesses()`. Rejected alternative: a `NEXT_PUBLIC_ATG_ENABLED_HARNESSES` mirror — it is
inlined at build time, so the value can only change with a redeploy, and the live-mode set is
supposed to change when `GET /api/categories` starts answering.

**Authz on that route, because "tiny" is how a route ships without any.** It opens with
`const gate = await requireAuth(); if (gate.res) return gate.res;` like every other authenticated
handler; it is workspace-independent (the allowlist is a deployment property, not a tenant one) so
there is nothing to scope, but it must not be anonymous — the response enumerates which runtimes
this cluster can reach, which is deployment reconnaissance. It carries **no** `category_id`, no
`base_image` and no env-var name: `available` and a `reason` key are the entire contract. The
configuration hint of §8.2 is the only place a raw variable name is ever rendered, and only to a
platform role.

**Product-owner decision still owed** — `TASK_PLAN_V2.md` §8.2 item 5: is *"generate and store a
Codex template, but refuse to provision it"* the intended launch behaviour? Everything above
assumes yes. If the answer is no, `codex` and `deepseek` come out of `HARNESS_IDS` and out of
0007, and this section shrinks to nothing.
---

## 4. Engine auto-match

`app/hire/page.tsx:339` already offers `auto` as a third choice beside the harnesses, and today it
resolves to `selRoleObj?.defaultEngine ?? "openclaw"` — a single column lookup that ignores every
skill the user picked. `lib/harness/match.ts` replaces it with a scorer.

**It is deterministic and contains no LLM call.** There is no fallback to specify because there is
nothing to fall back from — which is the correct shape for a decision the user is entitled to see
justified.

**`match.ts` is client-safe and therefore takes its gates as arguments.** This is not a style
preference; the obvious spelling does not build. `isHarnessEnabled()` lives in `provisioning.ts`
and `resolveHarness()` in `adapter.ts`, and **both open with `import "server-only"`** — a
`match.ts` that calls them cannot be imported by the hire wizard, which is the only thing that
calls it, and §10.3's `harness-client-safety` test would fail on the file it was written to
protect. So the signature carries the server's answers in:

```ts
// lib/harness/match.ts — client-safe: no server-only, no process.env, no @/lib/db
export interface MatchInput {
  /** From GET /api/harnesses (§3.5). The server evaluated G-A. */
  available: readonly Harness[];
  /** From the same payload: supports("chat") per harness. The server evaluated G-C. */
  chat: Readonly<Record<Harness, Support>>;
  roleId: string;
  /** The catalogue rows the wizard already fetched — `harnesses`, `requirements`, `format`. */
  skills: readonly { publicId: string; slug: string; harnesses: Harness[];
                     requirements: SkillRequirements; format: SkillFormat }[];
  // The MERGED shape, not `StoredAgentSettings`: the stored type is
  // `Partial<Omit<AgentSettings,"tools">> & { tools?: Partial<…> }`
  // (lib/agent-settings.ts:123), so `settings.tools.docker` is `boolean | undefined`
  // there and S2 would score `undefined` as "off" for a default that is on.
  // `mergeSettings()` is client-safe; call it before constructing MatchInput.
  settings: Pick<AgentSettings, "tools" | "selfImprove">;
  channels: readonly ChannelType[];
  schedulesPerDay: number;
  /** agent_roles.default_engine, for the §4.2 margin fallback. */
  defaultEngine: Harness;
}
export function matchHarness(input: MatchInput): MatchResult;
```

`GET /api/harnesses` grows `chat: Support` per row to feed this. Rejected alternative: make
`match.ts` server-only and call it from a route the wizard polls — it turns a pure function the
user can watch update as they tick skills into a round trip per keystroke.

### 4.1 Gates, then score

Two gates run first, and a gated-out harness is **excluded**, never scored zero. (Same rule as
`AGENT_TEMPLATE_GENERATOR.md` §gates G3: a scored-zero candidate can still win a weak field.)

| Gate | Rule | Exclusion reason code |
|---|---|---|
| **G-A** | `h ∈ input.available` — server-side `isHarnessEnabled(h)`, i.e. provisionable **and** allowlisted | `match.excluded_unmapped` |
| **G-B** | some selected skill **explicitly denies** `h`: its `harnesses[]` is non-empty and omits `h` | `match.excluded_skill` |
| **G-C** | `input.chat[h] === "yes"` — server-side `resolveHarness(h).supports("chat")` | `match.excluded_chat_unverified` |

**G-B is a negative assertion, not a positive one, and the difference is the whole gate.**
`skills.harnesses` is `jsonb().$type<Engine[]>().notNull().default([])` (`SKILL_REPOSITORY.md`
§1.3) and is populated by `deriveHarnessCompat` with `basis: "inferred"` (§2.3 there). Written as
*"every selected skill's `harnesses[]` **contains** `h`"* — the first drafting — a single catalogue
row that has not been scored yet carries `[]`, `[]` contains nothing, **all four harnesses are
excluded, and the scorer returns no candidate at all.** Reading an empty array as "unasserted"
instead of "incompatible" is the same rule the contract states for install
(*"never a default `true`"* cuts both ways: never a default `false` either — it is an assertion or
it is nothing). An unasserted skill contributes to S1 at half credit, exactly like any other
`"unknown"`.

**G-C deserves its own line.** Every agent has a dashboard console; a harness whose chat path is
unverified cannot be *auto-selected* into it. Today `capabilities.chat` is `"yes"` only for
OpenClaw, so **in live mode the scorer returns `openclaw` for all eight roles, and that is the
right answer rather than a bug** — Hermes chat is unverified (`RUNTIME_INTEGRATION.md` risk 12) and
Codex/DeepSeek have no `category_id`. The moment CONFIRM-7 lands and Hermes' profile flips to
`chat: "yes"`, the scorer starts choosing it with no code change. A user who picks Hermes
*explicitly* is not blocked by G-C; the gate constrains only the automatic choice.

In **mock mode** all four pass G-A and G-C — the mock chat path (`mockReply`) is harness-independent
— so the scorer genuinely differentiates and its unit tests are meaningful without a runtime.

### 4.2 The scoring table

Ten points. Each signal is a 0..1 fraction times its weight. A `Support` of `"unknown"` scores
**half** the fraction it would score at `"yes"` — half credit for a plausible claim nobody has
checked, which is exactly what `unknown` means.

| # | Signal | Weight | Fraction |
|---|---|---|---|
| S1 | **Skill fit** | **3.00** | `deriveHarnessCompat(skill.requirements, skill.format)[h]` over the selected skills: `supported && basis ∈ {verified, declared}` scores 1, `supported && basis === "inferred"` scores 0.75, an unasserted skill (`harnesses: []`) scores 0.5, `!supported` scores 0 — divided by total selected. No skills selected ⇒ `0.5` (neutral, not 0 — an empty basket is not evidence against any harness) |
| S2 | **Tool fit** | **2.50** | `settings.tools` the user turned on that `profile.tools[t] === "yes"`, ÷ turned on. Nothing on ⇒ `0.5` |
| S3 | **Channel fit** | **1.50** | requested channels present in `profile.channels`, ÷ requested. `channels: "unknown"` ⇒ `0.5`; only `web` requested ⇒ `1.0` for everyone (the dashboard console is not a differentiator) |
| S4 | **Role affinity** | **1.50** | the table in §4.3 |
| S5 | **Memory fit** | **1.00** | `1.0` if `settings.selfImprove` is on and `profile.memory.selfImprove === "yes"`; `0.5` if `"unknown"`; `0` if `"no"`; `0.5` if the user did not ask for it |
| S6 | **Volume profile** | **0.50** | `1.0` when the draft's schedules imply > 20 runs/day **and** no browser/docker tool is on — a bulk read-and-summarise shape. Otherwise `0.5` |

**S1 is a `requires.config` question and nothing else.** `SKILL_REPOSITORY.md` §2.3 is explicit:
*"A required binary is a property of the VM image, not of the harness, so it never makes a skill
harness-incompatible."* The same is true of `env` (a per-agent secret) and `os` (an image choice).
Scoring `bins`/`env`/`os` here — the first drafting of S1 — would mark almost every real skill
partly incompatible with all four harnesses and turn the 3.00-point signal into noise that is
identical across candidates, which is worse than not scoring it. Unmet `bins` surface separately as
an attach-time warning, per that section. And S1 must **not** be the same predicate as G-B, or the
gate has already removed every row that could score below 1.0 and 3.00 points are constant: G-B is
the explicit denial, S1 is the graded strength of the assertion.

**Margin rule.** The winner must lead the runner-up by **≥ 0.75** (7.5 % of scale). Below that,
`auto` resolves to `agent_roles.default_engine` and the rationale uses `match.tie`, naming both.
Rejected alternative: always take the top score. A 0.05 lead is noise from a half-credit `unknown`,
and presenting it as a recommendation is a confidence the data does not support.

**Ties inside the margin do not become a picker.** The wizard commits to one harness and says why;
offering a choice at the moment the system admits it cannot tell is how a hire wizard grows a
decision the user has no basis to make.

### 4.3 Role affinity — the eight roles

Values are 0..1, multiplied by S4's 1.50. Roles are `rolesData` at `lib/data.ts:16-23`.

| `roleId` | Role | `openclaw` | `hermes` | `codex` | `deepseek` |
|---|---|---|---|---|---|
| `prospector` | Sales Prospector | **1.0** | 0.6 | 0.1 | 0.4 |
| `salesmkt` | Sales & Marketing | **1.0** | 0.7 | 0.1 | 0.4 |
| `admin` | Admin Assistant | **1.0** | 0.7 | 0.2 | 0.3 |
| `hr` | HR Recruiter | **0.9** | 0.8 | 0.1 | 0.5 |
| `support` | Customer Support | **1.0** | 0.7 | 0.1 | 0.5 |
| `legal` | Legal Reviewer | 0.5 | **1.0** | 0.2 | 0.8 |
| `content` | Content Creator | 0.7 | **1.0** | 0.2 | 0.6 |
| `opc` | OPC Operator | **1.0** | 0.8 | 0.3 | 0.3 |
| *(`custom`, unknown)* | — | 0.6 | 0.6 | 0.4 | 0.4 |

The shape is legible: browser + channels + continuous operation favour OpenClaw; long-horizon
reasoning and knowledge curation favour Hermes; DeepSeek scores second on the two document-heavy
roles because bulk extraction is what it is for; Codex scores low everywhere because none of the
eight roles is a software-engineering role. **Codex's low row is a finding about the role catalogue,
not about Codex** — if Codex is worth shipping, the catalogue needs a ninth role that it wins.

**This table disagrees with `roleEngine()` (`lib/db/seed.ts:61-63`)**, which maps `support`, `content` and `legal` to
Hermes and everything else to OpenClaw. `content` and `legal` agree. **`support` does not, and the
seed is wrong**: a support agent's defining requirement is being reachable on customer channels
("24/7 answers on every channel"), and Hermes' channel support is CONFIRM-7 — unverified. Change
`agent_roles.default_engine` for `support` to `openclaw` in the same commit, or the tie-break
fallback in §4.2 hands a support agent to a harness that may not be able to answer a customer.

### 4.4 The rationale string

The user sees one sentence. It is composed from a **closed set of reason codes** with per-language
templates — the same discipline as `agent_activities.code` (§5), and for the same reason: a
sentence assembled in English and translated at render is a sentence that reads like a translation
in three of the four languages.

`lib/i18n/harness.ts` — a **sixth** new dictionary beyond the five `TASK_PLAN_V2.md` §5.1 lists,
which is why it appears in amendment A8. It follows the house shape exactly: a `Record<Lang, …>`
exported beside the interface, registered in `lib/i18n/index.ts`, and subject to §5.3's
identical-key-set gate.

```ts
export interface HarnessMatchDict {
  /** "{harness} — {a}, and {b}." / "{harness} — {a}." */
  frame1: string; frame2: string;
  skills: string; tools: string; channels: string; memory: string;
  role: string; volume: string; onlyAvailable: string;
  tie: string;
  excludedUnmapped: string; excludedSkill: string; excludedChatUnverified: string;
  /** Header above the exclusion list in the "why not the others?" disclosure. */
  whyNot: string;
}

/** The export the app imports, exactly like `hire` at lib/i18n/hire.ts:512. */
export const harnessMatch: Record<Lang, HarnessMatchDict> = { en, zh, zht, ja };
```

| key | en | zh | zht | ja |
|---|---|---|---|---|
| `frame2` | `{harness} — {a}, and {b}.` | `{harness}——{a}，而且{b}。` | `{harness}——{a}，而且{b}。` | `{harness} — {a}。さらに{b}。` |
| `skills` | `it can run all {n} skills you picked` | `它能运行你选的全部 {n} 个技能` | `它能執行你選的全部 {n} 個技能` | `選んだスキル{n}件をすべて実行できます` |
| `tools` | `it provides the {tools} tools this job needs` | `它提供这份工作需要的{tools}工具` | `它提供這份工作需要的{tools}工具` | `この仕事に必要な{tools}ツールを備えています` |
| `channels` | `it is the only runtime verified on {channels}` | `它是唯一在{channels}上验证过的运行时` | `它是唯一在{channels}上驗證過的執行環境` | `{channels}での動作が確認できている唯一のランタイムです` |
| `memory` | `it curates its own memory and can write new skills` | `它会自己整理记忆，还能编写新技能` | `它會自己整理記憶，還能撰寫新技能` | `自分で記憶を整理し、新しいスキルも書けます` |
| `role` | `it is what {role} agents run on by default` | `它是「{role}」岗位的默认运行时` | `它是「{role}」職務的預設執行環境` | `「{role}」の既定のランタイムです` |
| `volume` | `it is the cheapest option for reading at this volume` | `在这个处理量下它最省钱` | `在這個處理量下它最省錢` | `この処理量では最も低コストです` |
| `onlyAvailable` | `it is the only runtime available on this cluster right now` | `它是这个集群目前唯一可用的运行时` | `它是這個叢集目前唯一可用的執行環境` | `現在このクラスタで利用できる唯一のランタイムです` |
| `tie` | `Either {a} or {b} would work. We picked {a}, this job's usual choice.` | `{a} 和 {b} 都合适。这里选了 {a}，它是这份工作的常用选择。` | `{a} 與 {b} 都合適。這裡選了 {a}，它是這份工作的常用選擇。` | `{a}と{b}のどちらでも動きます。この仕事で通常使う{a}を選びました。` |
| `excludedUnmapped` | `{harness} isn't available on this cluster yet.` | `{harness} 目前在这个集群上还不可用。` | `{harness} 目前在這個叢集上還無法使用。` | `{harness}はこのクラスタではまだ利用できません。` |
| `excludedSkill` | `{harness} was ruled out: it can't run {slug}.` | `排除了 {harness}：它无法运行「{slug}」。` | `排除了 {harness}：它無法執行「{slug}」。` | `{harness}は除外しました。「{slug}」を実行できないためです。` |
| `excludedChatUnverified` | `{harness} was ruled out: its chat channel isn't verified yet.` | `排除了 {harness}：它的对话通道还没有验证过。` | `排除了 {harness}：它的對話通道尚未驗證。` | `{harness}は除外しました。チャット経路が未検証のためです。` |
| `whyNot` | `Why not the others?` | `为什么不是其他的？` | `為什麼不是其他的？` | `ほかを選ばなかった理由` |

Composition: take the **two** highest-contributing signals whose fraction is ≥ 0.75, render
`frame2`; one qualifying signal renders `frame1`; none — which happens only when every harness but
one was gated out — renders `onlyAvailable`. Exclusions are never in the sentence; they live behind
the `whyNot` disclosure, so the default reading is one line.

`{harness}` interpolates `harnessLabel()`, never a translated string — "OpenClaw" is "OpenClaw" in
Japanese. `{role}` interpolates the localised role name. `{tools}` and `{channels}` are joined with
the language's own list separator (`、` in ja, `、` in zh/zht, `, ` + `and` in en), which is a
`Intl.ListFormat(BCP47[lang])` call, not a hardcoded `", "`.

**All `params` are escaped data.** A skill slug is third-party text (`SKILL_REPOSITORY.md`); it is
interpolated as a text node, exactly as `agent_activities.params` is (§5.2).
---

# PART 2 — ACTIVITY & OBSERVABILITY

## 5. The event taxonomy

### 5.1 Two layers, and only one of them is new

There are **two** vocabularies, and most of the confusion in this area comes from treating them as
one.

| Layer | What it is | Closed set | Owner |
|---|---|---|---|
| **Wire events** | What the runtime POSTs to `/api/webhooks/agent-manager/batch` | **16 types**, `agent.status` … `agent.error` | `BACKEND_INTEGRATION_CONTRACT.md` §3.4. **Not reopened here.** |
| **Activity codes** | What one row of the Activity feed *is*, so it can be rendered in four languages | **14 defined, +10 proposed = 24** | This document, §5.3 |

The relationship is many-to-one in both directions: one `agent.run_finished` produces one
`run.finished` activity row *and* updates `agent_runs`; one `agent.usage` produces a
`usage.recorded` row *and* a `usage_records` row *and* an `llm_usage` row. A code is **not** an
event type and must never be named after one.

The 16 wire events, and what each contributes to the Activity page:

| Wire event | v | Feeds | Activity row? |
|---|---|---|---|
| `agent.status` | 1 | `agents.status`, HEALTH liveness | **PROPOSED** `status.changed` (§5.5) |
| `agent.heartbeat` | 1 | `agents.last_heartbeat_at`, `applied_config_revision`, HEALTH | **PROPOSED** `config.applied` on revision crossing |
| `agent.activity` | **2** | `agent_activities` | yes — it *is* the code carrier |
| `agent.run_started` | 1 | `agent_runs` | `run.started` |
| `agent.run_step` | 1 | `agent_run_steps` | no — steps are the drill-down, not the feed |
| `agent.tool_call` | 1 | `agent_run_steps` on a synthetic run | `tool.denied` **only when** `status = "denied"` |
| `agent.run_finished` | 1 | `agent_runs` | `run.finished` |
| `agent.message` | 1 | `messages`, `conversations` | `message.sent`; **PROPOSED** `message.received` when `sender = "user"` |
| `agent.metric` | 1 | `agent_metrics` | no |
| `agent.improvement` | 1 | `agent_improvements` | **PROPOSED** `improvement.proposed` |
| `agent.usage` | 1 | `usage_records`, `llm_usage`, COST | `usage.recorded` — **named by the contract, missing from its registry** (§5.5) |
| `agent.schedule_run` | 1 | `agent_schedule_runs` | `schedule.fired`; **PROPOSED** `schedule.skipped`, `schedule.failed` |
| `agent.skill_state` | 1 | `agent_skills.state` | `skill.installed`, `skill.failed`; **PROPOSED** `skill.removed` |
| `agent.context_state` | 1 | `agent_context_items.state` | `context.indexed`; **PROPOSED** `context.failed` |
| `agent.health` | 1 | `agent_health_samples` | no — 1,440/day would drown the feed (§7.1) |
| `agent.error` | 1 | — | `error.raised` |

`research.completed`, `draft.created`, `task.status` and `escalation.raised` have **no dedicated
wire event**: the runtime emits them as `agent.activity` v2 with that `code`. That is the design —
`agent.activity` is the extension point, and the code registry is what keeps the extension closed.

### 5.2 Severity is derived, never stored

Severity is **a pure function of `(code, params)`**, in `lib/activity/severity.ts`, not a column.
Three reasons, in order of weight:

1. **An untrusted runtime must not grade its own noise.** Severity is ArkAgent's editorial
   judgement about what an operator needs to see. The runtime asserts a *code*; the product decides
   what that code means. A `severity` field on the wire is a field a misbehaving harness sets to
   `error` on every line.
2. **No migration.** `TASK_PLAN_V2.md` §2.1 fixes five slots; a `severity` column would need a
   seventh or a re-opened 0012, and it buys nothing a lookup does not.
3. **Legacy rows have no code.** Pre-v2 `agent_activities` rows carry only `text`, so a stored
   column would be `NULL` for all of them and every query would need the same fallback anyway.

Four levels. There is no `debug` — that granularity is `agent_run_steps`, which has its own view.

| Severity | Means | Default in the feed | Glyph / colour (`UI_DESIGN_V2.md` §F tokens) |
|---|---|---|---|
| `info` | it happened, it worked | shown | tag glyph, `c.text2` |
| `notice` | it happened and it was *not* what you asked for — a skip, a proposal, a denial | shown | `c.blue` |
| `warning` | degraded, retryable, or unverifiable | shown, `borderLeft 2px c.amber` | `⚠` |
| `error` | a unit of work failed, or the agent stopped taking work | shown, `borderLeft 2px c.red` | `▲` |

**A function, not a lookup — because three codes are not constant.** `run.finished` is `info`,
`notice` or `error` depending on `params.status`; `status.changed` is `error` only when
`params.to === "error"`; `error.raised` is `warning` or `error` depending on `params.severity`
(§5.3). A flat `Record<ActivityCode, Severity>` cannot express any of the three, and an earlier
drafting of this section claimed one could, which made §10.3's "every code has exactly one
severity" test unsatisfiable against §5.3's own table. The signature is therefore:

```ts
// lib/activity/severity.ts — CLIENT-SAFE. No `server-only`, no db import: the row
// renderer needs it to pick the border colour, and it is the same function the
// server uses to build the filter predicate. One definition, two callers.
export type Severity = "info" | "notice" | "warning" | "error";
export function severityOf(code: string | null, params: Record<string, unknown>): Severity;

/** The three codes whose severity depends on params. Everything else is constant. */
export const VARIABLE_CODES = ["run.finished", "status.changed", "error.raised"] as const;
```

**Filtering by severity is a server-side predicate, not a client filter** — a client-side filter
over a keyset page returns 3 rows for a page of 50 and looks broken. The predicate has two arms,
because of the three variable codes:

```ts
// lib/activity/severity.ts
/** Codes that are ALWAYS this severity → a plain IN list, served by the index. */
export function constantCodes(sev: Severity): string[];
/** Codes that MAY be this severity → each needs a params test pushed into SQL. */
export function variableCodePredicates(sev: Severity):
  { code: string; jsonPath: string; values: string[] }[];
```

which the query assembles as

```sql
(code = ANY($constant))
  OR (code = 'run.finished'  AND params->>'status'   = ANY($runStatuses))
  OR (code = 'status.changed' AND params->>'to'      = ANY($toStatuses))
  OR (code = 'error.raised'  AND coalesce(params->>'severity','error') = ANY($sevs))
```

The `code = ANY(...)` term still drives `agent_activities_agent_code_idx`; the three `params`
tests are heap filters over the rows that index already selected, which is a handful. `coalesce`
matters: `severity` is optional on `agent.error` (contract §3.4), and an absent value means the
event was a failure, so it defaults to `error` — defaulting it to `warning` would hide unlabelled
failures from the ERRORS tab.

For **runs**, severity maps to `agent_runs.status`: `succeeded`/`queued`/`running` → `info`,
`cancelled` → `notice`, `failed`/`timeout` → `error`. There is no run status that maps to
`warning`, so a `severity=warning` filter must return **zero runs**, not all of them — §6.1's run
branch is suppressed entirely in that case rather than left unfiltered.

Rows with `code IS NULL` (pre-v2 and legacy ArkAgent bookkeeping) are severity `info` and are
matched **only** by the `info` band. They are never surfaced by a `warning`/`error` filter, because
we cannot know, and guessing from `tag = 'escalated'` would put unaudited legacy text into an
incident view.

### 5.3 The registry

`params` are the **only** interpolation values. `tag` is the existing 14-value `activityTagEnum`
(`lib/db/schema.ts:61`). "Emitted by" is the *capability* the harness needs, resolved through
`supports()` — `✔` yes, `?` unknown today, `✕` no. Because every capability but `chat`/`tasks`/
`channels` is `unknown` on every harness right now (§1.3.1), most of this matrix is `?`, and that
is an accurate picture of launch.

#### Lifecycle

| `code` | Sev | `params` | tag | From | OC | HM | CX | DS |
|---|---|---|---|---|---|---|---|---|
| `status.changed` **P** | info / **error** when `to = "error"` | `{from, to, errorCode?}` — `to` and `errorCode` are the event's; **`from` is ArkAgent's**, read from `agents.status` inside the same ingest transaction that overwrites it. `agent.status` carries no `from`, and a `from` reconstructed after the UPDATE is the new value. Omitted (not `null`) when the row was stale under the last-writer-wins `WHERE`, because then nothing changed. | `system` | `agent.status` | ✔ | ✔ | ✔ | ✔ |
| `config.applied` **P** | info | `{revision}` | `system` | `agent.heartbeat.configRevision` | ✔ | ? | ? | ? |
| `runtime.unreachable` **P** | warning | `{missedIntervals, lastHeartbeatAt}` | `system` | **ArkAgent-derived**, no wire event | ✔ | ✔ | ✔ | ✔ |

#### Run

| `code` | Sev | `params` | tag | From | OC | HM | CX | DS |
|---|---|---|---|---|---|---|---|---|
| `run.started` | info | `{trigger}` | `system` | `agent.run_started` | ? | ? | ? | ? |
| `run.finished` | info / **error** when `status ∈ {failed,timeout}` / notice when `cancelled` | `{status, steps, durationMs}` | `summary` | `agent.run_finished` | ? | ? | ? | ? |

#### Tool call

| `code` | Sev | `params` | tag | From | OC | HM | CX | DS |
|---|---|---|---|---|---|---|---|---|
| `tool.denied` | **notice** | `{toolName, denyReason}` | `escalated` | `agent.tool_call` `status="denied"` | ? | ? | ? | ? |

`denyReason` ∈ `autonomy_ask · tool_disabled · approval_required · daily_action_limit ·
credit_cap_reached`. **Notice, not warning**: a denial is the policy working. It becomes a warning
only via `error.raised` when the *policy itself* failed (`approval_timeout`). A successful
out-of-run tool call writes a `agent_run_steps` row and **no** activity row — one line per HTTP
call is how a feed becomes a log.

#### Message

| `code` | Sev | `params` | tag | From | OC | HM | CX | DS |
|---|---|---|---|---|---|---|---|---|
| `message.sent` | info | `{channel, recipientCount}` | `outreach` | `agent.message` `sender="agent"` | ✔ | ? | ✕ | ✕ |
| `message.received` **P** | info | `{channel, senderLabel}` | `outreach` | `agent.message` `sender="user"` | ✔ | ? | ✕ | ✕ |

`message.received` is the half the feed is missing. Contract §5.4 step 3 requires the runtime to
report the *human's* turn on a channel ArkAgent never saw — and with no code for it, the timeline
renders a monologue of agent replies to invisible questions. `senderLabel` is display-only, ≤80
chars, and untrusted.

#### Decision & escalation

| `code` | Sev | `params` | tag | From | OC | HM | CX | DS |
|---|---|---|---|---|---|---|---|---|
| `task.status` | info | `{taskId, from, to}` | `resolved` | `agent.activity` | ✔ | ✔ | ? | ? |
| `escalation.raised` | **warning** | `{reason}` | `escalated` | `agent.activity` | ✔ | ✔ | ? | ? |
| `draft.created` | info | `{kind}` | `draft` | `agent.activity` | ✔ | ✔ | ? | ? |
| `research.completed` | info | `{sources}` | `research` | `agent.activity` | ✔ | ✔ | ? | ? |

#### Learning

| `code` | Sev | `params` | tag | From | OC | HM | CX | DS |
|---|---|---|---|---|---|---|---|---|
| `skill.installed` | info | `{slug, version}` | `learning` | `agent.skill_state` `installed` | ? | ? | ? | ? |
| `skill.removed` **P** | info | `{slug, version}` | `learning` | `agent.skill_state` `removed` | ? | ? | ? | ? |
| `skill.failed` | **warning** | `{slug, version, errorCode}` | `system` | `agent.skill_state` `failed` | ? | ? | ? | ? |
| `context.indexed` | info | `{name, chunks}` | `docs` | `agent.context_state` `indexed` | ? | ? | ? | ? |
| `context.failed` **P** | **warning** | `{name, errorCode}` | `docs` | `agent.context_state` `failed` | ? | ? | ? | ? |
| `improvement.proposed` **P** | **notice** | `{kind}` | `learning` | `agent.improvement` | ? | ✔ | ✕ | ? |

`improvement.proposed` is Hermes' `✔` and Codex's `✕` in one row — it is the only code whose
emission is genuinely harness-shaped, because it is `settings.selfImprove` made visible.
`skill.failed` with `errorCode: "unsupported_harness"` is the contract's designed outcome when a
skill's `requires` cannot be met (§4.2); it must read as a *harness* problem in the feed, not as a
broken skill.

#### Error

| `code` | Sev | `params` | tag | From | OC | HM | CX | DS |
|---|---|---|---|---|---|---|---|---|
| `error.raised` | warning / **error** / **error** by `severity` | `{errorCode, severity, retryable}` — **widens the contract's registry entry, which is `{errorCode}` only; amendment A2** | `system` | `agent.error` | ✔ | ✔ | ✔ | ✔ |

`severity` and `retryable` are already fields on the `agent.error` event, so nothing new crosses the
wire — but §3.4's registry row lists `params: {errorCode}`, and an ingest handler written to that
row drops the two fields §5.2's predicate and the ERRORS tab both read. Widening the registry row is
part of A2, not an optional nicety. `retryable` is `boolean` where every other `params` value is
`string | number` (`TimelineItemDTO`, `UI_DESIGN_V2.md` §F.5); it is stored as the string
`"true"`/`"false"` so the DTO's declared type stays true, and the dictionary key is
`error.retryable.true` / `.false`.

This is the one code that carries the runtime's own `severity` (`warning` / `error` / `fatal`), and
it is the exception that proves §5.2's rule: the runtime is grading *its own failure*, not its own
importance. `fatal` maps to `error` and is always accompanied by `agent.status: "error"`. The
`errorCode` vocabulary is the contract's 18-value list and is closed by agreement, never silently.

#### Schedule

| `code` | Sev | `params` | tag | From | OC | HM | CX | DS |
|---|---|---|---|---|---|---|---|---|
| `schedule.fired` | info | `{scheduleId, name}` | `calendar` | `agent.schedule_run` `started`/`succeeded` | ✔ | ✔ | ✔ | ✔ |
| `schedule.skipped` **P** | **notice** | `{scheduleId, name, skipReason}` | `calendar` | `agent.schedule_run` `skipped` | ✔ | ✔ | ✔ | ✔ |
| `schedule.failed` **P** | **error** | `{scheduleId, name, errorCode}` | `calendar` | `agent.schedule_run` `failed` | ✔ | ✔ | ✔ | ✔ |

All four are `✔` because ArkAgent fires schedules itself (§1.2) — these rows exist even for a
harness with no scheduler, and even when the run never started.

**`schedule.skipped` is the highest-value PROPOSED code in this document.** The contract says, in
bold, *"A skipped occurrence MUST still be reported… 'why didn't it run?' is the single most common
support question about reminders"* — and then provides no code to render the answer, so the seven
`skipReason` values (`instance_stopped · overlap · outside_working_hours · disabled ·
credit_cap_reached · max_runs_per_day · daily_action_limit`) land in a table nobody reads. Every one
of them is a translation key in `lib/i18n/activity.ts`.

#### Cost

| `code` | Sev | `params` | tag | From | OC | HM | CX | DS |
|---|---|---|---|---|---|---|---|---|
| `usage.recorded` **P** | info | `{credits, kind, costMicroUsd?}` | `summary` | `agent.usage` | ✔ | ✔ | ✔ | ✔ |

#### Escape hatch

| `code` | Sev | `params` | tag | Note |
|---|---|---|---|---|
| `custom` | info | — (`text` is used) | `system` | The **only** code that renders `agent_activities.text`. Agent-authored, untrusted, never localised, badged as agent-written. An unknown code is coerced to `custom` at ingest (contract §3.4). |

### 5.4 What "which harness emits it" actually means

Contract §4.3 is titled *"What differs per harness — inbound"* and its body is one word:
**"Nothing."** Every event has one shape for all four. So the columns above are not four dialects —
they are four answers to *"can this runtime produce the underlying observation at all"*, resolved
through `supports()`, and they change without a deploy when `GET /api/categories` starts answering.

The renderer therefore has **no per-harness branch**. It has a per-code branch and a per-capability
*empty state*. That distinction is what keeps the Activity page from growing a fifth copy of itself
when a fifth harness arrives.

### 5.5 The ten PROPOSED codes, collected

Each amends `BACKEND_INTEGRATION_CONTRACT.md` §3.4's "Activity code registry (v2.0)" table. None
introduces a wire event; all ten are derived from events that already exist, so the backend team's
work does not change — only ArkAgent's ingest handler and `lib/i18n/activity.ts`.

| # | Code | Derived from | Why the feed is wrong without it |
|---|---|---|---|
| 1 | `usage.recorded` | `agent.usage` | **Not a proposal — a correction.** §3.4's `agent.usage` DB effect already says it writes "an `agent_activities` row with `code: "usage.recorded"`", but the code is absent from the registry table three pages earlier. As written, the contract requires a code it does not define, so it renders as the raw string. |
| 2 | `schedule.skipped` | `agent.schedule_run` `skipped` | The contract's own most-common-support-question is unanswerable. |
| 3 | `schedule.failed` | `agent.schedule_run` `failed` | A failed occurrence is indistinguishable from a fired one. |
| 4 | `status.changed` | `agent.status` | The timeline cannot show the moment an agent entered `error`. |
| 5 | `message.received` | `agent.message` `sender="user"` | The feed shows a monologue (contract §5.4 step 3). |
| 6 | `improvement.proposed` | `agent.improvement` | A self-review item appears in the queue with no trace of when it was raised. |
| 7 | `skill.removed` | `agent.skill_state` `removed` | Install is visible, uninstall is silent. |
| 8 | `context.failed` | `agent.context_state` `failed` | A document that never indexed looks identical to one nobody uploaded. |
| 9 | `config.applied` | `agent.heartbeat.configRevision` | "not yet applied to runtime" (contract §5.2 step 7) never resolves visibly. |
| 10 | `runtime.unreachable` | **ArkAgent-derived** — 3 missed heartbeat intervals | The only row here with no upstream source. Written by the same sweep job as the health rollup; **suppressed while `status = 'paused'`**, where silence is expected (contract §5.6 step 4). |

### 5.6 `lib/i18n/activity.ts`

One new dictionary, four languages, written natively. It holds **eleven** key spaces — the five the
contract names as "a translation key", four label spaces for the filter chips, plus `empty` (§8.9)
and `banner` (§9.2), which are declared in their own sections and listed here so the file has one
complete shape:

```ts
/** The closed set of §5.3 codes. Declared in lib/activity/codes.ts (client-safe)
 *  beside severityOf(), so the dictionary's Record<ActivityCode, …> is exhaustive
 *  and a new code is a compile error in four languages at once. */
export type ActivityCode = (typeof ACTIVITY_CODES)[number];

export interface ActivityDict {
  /** One template per §5.3 code. "{n} skills installed" style, params interpolated. */
  code: Record<ActivityCode, string>;
  /** agent.error errorCode — the contract's 18 values. */
  error: Record<string, string>;
  /** agent_schedule_runs.skip_reason — 7 values. */
  skipReason: Record<string, string>;
  /** agent.tool_call denyReason — 5 values. */
  denyReason: Record<string, string>;
  /** agent.metric label — stable keys, not sentences. */
  metric: Record<string, string>;
  /** Severity, trigger, phase and status labels for the filter chips. */
  severity: Record<Severity, string>;
  trigger: Record<RunTrigger, string>;
  phase: Record<StepPhase, string>;
  status: Record<RunStatus, string>;
  /** §8.9 — six views × six reasons. */
  empty: Record<ViewKey, Record<EmptyReason, { title: string; body: string }>>;
  /** §9.2 — the three non-dismissible mode banners. */
  banner: Record<"mock" | "unconfigured" | "degraded", string>;
}

export const activity: Record<Lang, ActivityDict> = { en, zh, zht, ja };
```

**A key with no entry renders as the raw key.** Ugly, honest, never a crash — contract §6.1 rule 2.
The renderer must not `throw` on an unknown code, and must not fall back to English, which would
put an English sentence in the middle of a Japanese feed and look like a bug in the agent rather
than a gap in a dictionary.
---

## 6. The Activity page — information architecture

`UI_DESIGN_V2.md` §F owns the visual grammar: the tab strip, the glyph tables, the hex, the
spacing, the sparkline construction. This section owns what is behind it — the query, the index,
the DTO, the filters, the pagination and the empty state, for each view.

**One amendment to §F.** Its tab strip is `TIMELINE · RUNS · HEALTH · COST`. This document adds a
fifth, **ERRORS**, and describes TOOL CALLS as a sub-view of RUNS rather than a tab:

```
 ▸TIMELINE◂   RUNS   ERRORS   HEALTH   COST
```

ERRORS is a tab and not a saved filter because it is the view an operator opens *during* an
incident, and requiring them to assemble `severity=error` + `outcome=failed,timeout` +
`tag=escalated` from three separate controls at that moment is a design that only works for the
person who wrote it. It also unions three sources the TIMELINE filter cannot union (failed runs,
`error.raised` rows, and the pending `agent_improvements` queue), so it is not expressible as a
filter over the timeline in any case.

### 6.0 Shared contract

#### Route surface

```
GET /api/agents/[id]/activity                  timeline      §6.1
GET /api/agents/[id]/activity/stream           SSE, 60s cap  §6.1
GET /api/agents/[id]/activity/runs             run list      §6.2
GET /api/agents/[id]/activity/runs/[runId]     run + steps   §6.2
GET /api/agents/[id]/activity/tool-calls       out-of-run    §6.3
GET /api/agents/[id]/activity/health           samples       §6.4
GET /api/agents/[id]/activity/cost             aggregates    §6.5
GET /api/agents/[id]/activity/incidents        errors        §6.6
```

**All seven sub-views nest under `activity/`, and that is not cosmetic.** `TASK_PLAN_V2.md` §4.1
and W5-3 both scope this work to `app/api/agents/[id]/activity/**`; siblings named `/runs`,
`/health` and `/cost` would be outside the task's stated file list, outside its acceptance check,
and — for `/cost` and `/health` — would read as agent-wide resources rather than as one tab's
backing queries. `activity/runs/[runId]` also keeps the run drill-down under the same `[id]` guard
without a second `params` shape.

Every route resolves the agent with `getAgentRow(id, ctx.workspace.id)` and returns **404** for a
cross-workspace id — never 403 (`docs/API.md:38-41`).

**Every query parameter is Zod-parsed before it reaches Drizzle, and a parse failure is 400.**
This is not covered by the cursor rule below. `trigger`, `outcome`, `tag`, `type`, `severity`,
`kind`, `phase` and `channel` all land in `inArray`/`eq` against **pgEnum** columns; Drizzle passes
an unrecognised string straight through and Postgres answers `22P02 invalid input value for enum`,
which surfaces as a **500 with the enum's full value list in the message**. Schemas go in
`lib/validation.ts` beside the existing ones, built from the same const tuples the enums are
(`HARNESS_IDS`, `CHANNEL_TYPE_IDS`, `ACTIVITY_CODES`, `activityTagEnum.enumValues`). `limit` is
`z.coerce.number().int().min(1).max(100).default(50)`; anything else lets a client ask for 10⁶ rows.

#### Pagination is keyset, everywhere. Three reasons, and only one is performance.

1. **Correctness under head insertion.** The timeline is `ORDER BY time DESC` and, in live mode,
   new rows arrive at the head continuously. With `OFFSET 50`, every row that arrives between the
   first page and "Load 50 more" shifts the window by one: the user is shown rows they already read
   and silently skipped past others. This is wrong at 60 rows, not just at a million, and it is the
   reason keyset is mandatory rather than an optimisation.
2. **There is no meaningful offset across a merged stream.** The timeline reads two tables whose
   row counts grow independently. `OFFSET 50` over a merge has no definition that survives either
   side growing.
3. **Cost.** `OFFSET n` makes the server produce and discard `n` rows. A user scrolling to
   yesterday on a busy agent pays for every row above it, on every page.

**Cursor:** `base64url(JSON)` of `{ t: ISO8601, k: "run" | "act", i: uuid }`, opaque to the client
and parsed with Zod on the way back in — a malformed or forged cursor is a **400 `bad_cursor`**, not
a 500. It carries no authority: the agent comes from the path and is workspace-checked, so a cursor
from another agent's page simply selects nothing.

**Sort key:** `(timestamp DESC, kind DESC, id DESC)`, with `kind` ordered `"run" > "act"`. `id` is a
random v4 uuid, so comparing a run id against an activity id is meaningless — but it is *stable*,
which is the only property keyset needs, and `kind` makes the order deterministic when two rows
share a microsecond.

**The cursor predicate is therefore kind-aware, and the obvious spelling loses rows.** Writing
`(timestamp, id) < ($t, $i)` on *both* branches — the first drafting — ignores `kind`, and at a
shared timestamp the two tables' ids are unrelated random uuids. Concretely: page 1 ends on a run
at `T` with id `R`. The activity branch of page 2 asks `(occurred_at, id) < (T, R)`, so an activity
row at exactly `T` is returned only if its uuid happens to sort below `R` — a coin flip. Roughly
half of all same-timestamp activity rows are **silently dropped**, and the same collision in the
other direction duplicates one. Since one `agent.run_finished` event writes a run row and a
`run.finished` activity row with the *identical* `occurredAt`, shared timestamps are the common
case here, not a corner. This is exactly the class of failure §6.0 chose keyset to avoid, so the
predicate is spelled out per branch:

```ts
// lib/activity/cursor.ts
// kind rank: run = 1, act = 0. Higher rank sorts FIRST at an equal timestamp.
export function keysetWhere(col: Column, id: Column, rank: 0 | 1, cur: Cursor | null) {
  if (!cur) return undefined;
  const curRank = cur.k === "run" ? 1 : 0;
  if (rank === curRank) {
    // same table as the cursor row: strict row comparison on (time, id)
    return sql`(${col}, ${id}) < (${cur.t}::timestamptz, ${cur.i}::uuid)`;
  }
  if (rank < curRank) {
    // this branch sorts AFTER the cursor row at an equal timestamp → include that timestamp
    return sql`${col} <= ${cur.t}::timestamptz`;
  }
  // this branch sorts BEFORE the cursor row at an equal timestamp → it was already emitted
  return sql`${col} < ${cur.t}::timestamptz`;
}
```

`mergeByTime` then applies the same `(t, kindRank, id)` comparator it uses to order, so the `<=`
arm cannot re-emit the boundary row: rows already returned are those strictly greater than the
cursor under the full three-part key, and the merge drops anything not strictly less. The
`::timestamptz` / `::uuid` casts are **mandatory on every branch** — postgres.js sends string
parameters untyped, and an untyped parameter inside a row comparison against
`(timestamptz, uuid)` resolves inconsistently between the row form and the scalar form. §6.2 and
§6.3 use the same helper; the casts are not optional there either.

#### The merge is done in TypeScript, not in SQL

Each branch runs its own Drizzle query with `limit + 1`, using its own index and its own real
column types; the server merges by timestamp and truncates to `limit`. At most `2 × (limit + 1)`
rows are read.

Rejected alternative: `UNION ALL` in SQL. It forces both branches into one column list, which means
padding a dozen columns with `sql<null>` casts on each side, gives the planner a merge-append it
can and does get wrong on a two-index scan, and produces a result set Drizzle types as a union of
nullable everything — precisely the shape `UI_DESIGN_V2.md` §F.5 made a *discriminated* DTO to
avoid.

#### Every aggregate is `.mapWith(Number)`. This is not optional.

The driver is **postgres.js** (`lib/db/index.ts`, `drizzle-orm/postgres-js` + `postgres@3`), and it
returns `int8` and `numeric` as **JavaScript strings**, deliberately, because neither fits a
`number` safely. Every aggregate in §6.4 and §6.5 lands in one of those types:

| Expression | Postgres result type | What postgres.js returns |
|---|---|---|
| `count(*)` | `bigint` | `"1440"` |
| `sum(cost_micro_usd)` (`bigint` column) | `numeric` | `"142000"` |
| `sum(total_tokens)` (`integer` column) | `bigint` | `"19624"` |
| `avg(cpu_percent)`, `round(avg(…))` | `numeric` | `"37"` |
| `max(memory_bytes)` (`bigint` column) | `bigint` | `"812000000"` |

A bare `sql<number>\`sum(...)\`` is therefore a **lie the type system accepts**: `totals.costMicroUsd`
becomes a string, `a + b` concatenates instead of adding, and the COST view renders
`$142000142000`. The Drizzle column helpers do not save this — `bigint(..., { mode: "number" })`
maps the *column*, not an expression over it. Every `sql<number>` in §6.4 and §6.5 carries
`.mapWith(Number)`:

```ts
costMicroUsd: sql<number>`coalesce(sum(${agentRuns.costMicroUsd}), 0)`.mapWith(Number),
runs:         sql<number>`count(*)`.mapWith(Number),
```

`coalesce(…, 0)` is on every `sum`/`max` for the second half of the same problem: `sum()` over zero
rows is `NULL`, and `Number(null)` is `0` while `Number(undefined)` is `NaN` — the group-by queries
never see an empty group, but `totals` and `previous` do. Where `null` is the *meaningful* answer —
`cpu`, `mem`, `disk` in §6.4, which are nullable columns whose absence is a gap, not a zero — the
`coalesce` is omitted and the mapper is `.mapWith((v) => (v === null ? null : Number(v)))`.

`agent_cost_daily` in §7.3 has the same exposure and the same fix; it is called out here once
rather than in three places.

#### Time range

`?from=&to=` are RFC 3339, defaulting to the last 7 days. Both are **required to be bounded**: an
unbounded timeline query is a full-partition scan any signed-in user can fire, and the range is
what makes every index below a range scan rather than a filter. `to - from` is capped at 90 days
with a **400 `range_too_wide`**; the COST view's 30-day default and the HEALTH view's 24-hour
default are narrower still.

#### Indexes — all in `0012_v2_runtime.sql`

`TASK_PLAN_V2.md` §2.1 assigns 0012 the runtime tables plus `agent_activities.code` / `.params`.
An index on those same columns belongs in the same file by construction; nothing here claims a new
slot.

```sql
-- Timeline keyset. Supersedes agent_activities_agent_idx, which is a strict prefix.
CREATE INDEX agent_activities_agent_time_idx
  ON agent_activities (agent_id, occurred_at DESC, id DESC);
DROP INDEX IF EXISTS agent_activities_agent_idx;

-- Severity and event-type filters expand to `code = ANY($codes)` (§5.2).
CREATE INDEX agent_activities_agent_code_idx
  ON agent_activities (agent_id, code, occurred_at DESC);

-- ERRORS (§6.6). Partial: on a healthy agent this index is a few hundred rows out of
-- hundreds of thousands, so the incident view stays instant on the day it matters most.
CREATE INDEX agent_runs_agent_failed_idx
  ON agent_runs (agent_id, started_at DESC)
  WHERE status IN ('failed', 'timeout', 'cancelled');
```

**The `DROP INDEX` is half the change; the other half is `lib/db/schema.ts`.**
`agent_activities_agent_idx` is *declared* at `lib/db/schema.ts:448` as
`index("agent_activities_agent_idx").on(t.agentId, t.occurredAt)`. Dropping it in SQL while
leaving the declaration means the next `drizzle-kit generate` diffs the live schema against the
model, sees a missing index, and emits a `CREATE INDEX` to put it back — so the drop survives
exactly until the next migration is generated. Delete the declaration in the same commit and
replace it with the two above. `IF EXISTS` is on the drop because a database created after this
migration lands (a fresh CI replay generating from the model) will not have it.

**One amendment to `BACKEND_INTEGRATION_CONTRACT.md` §3.3** — `agent_runs_agent_idx` is defined
there as `(agent_id, started_at DESC)` with no `id`, so the keyset row comparison
`(started_at, id) < ($t, $i)` is served by the index for the timestamp and filtered on the heap for
the tiebreak. That is correct but not index-only, and the tiebreak is exactly the path a busy agent
hits. **This is an edit to the contract's own `CREATE INDEX` line, not an extra statement in the
same file:** 0012 creates `agent_runs` and its indexes together, so a second
`CREATE INDEX agent_runs_agent_idx` in that file fails the whole migration with
`relation "agent_runs_agent_idx" already exists` — and it fails on a fresh CI replay, which is the
one place §2.1 warns migrations fail. The line in 0012 reads:

```sql
-- AMENDED from BACKEND_INTEGRATION_CONTRACT.md §3.3: `id DESC` added for the keyset tiebreak.
CREATE INDEX agent_runs_agent_idx ON agent_runs (agent_id, started_at DESC, id DESC);
```

`agent_activities`' existing index is declared **ascending**. A btree scans backwards at
essentially no cost, so DESC ordering was never the problem — the missing `id` was.

**`agent_run_steps_agent_idx` also needs the tiebreak**, for the same reason and in the same file:
§6.3 pages `agent_run_steps` by `(agent_id, occurred_at DESC, id DESC)`, and the contract defines
that index without `id`. Amend the contract's line rather than adding a second index (A3 covers
both):

```sql
CREATE INDEX agent_run_steps_agent_idx ON agent_run_steps (agent_id, occurred_at DESC, id DESC);
```

### 6.1 TIMELINE

*What did this agent do, newest first, across both tables.*

#### Query

**Branch suppression comes first, and without it the filters look broken.** The two branches read
different tables with disjoint filterable columns: `trigger`, `outcome` and `model` exist only on
runs; `tag`, `type` and `channel` only on activities. A `trigger=schedule` filter applied to the
run branch alone leaves the activity branch **unfiltered**, so the user ticks "schedule" and still
sees every message, skill install and error in the window. So:

```ts
// lib/activity/timeline.ts
const RUN_ONLY = ["trigger", "outcome", "model"] as const;
const ACT_ONLY = ["tag", "type", "channel"] as const;
const wantRuns = !ACT_ONLY.some((k) => filters[k] !== undefined)
              && (!filters.severity || runStatusesFor(filters.severity).length > 0);
const wantActs = !RUN_ONLY.some((k) => filters[k] !== undefined);
```

A filter that belongs to one branch **excludes the other branch entirely** rather than leaving it
unfiltered. `severity` is the one filter that spans both, via §5.2's two mappings — and
`severity=warning` maps to no run status at all, which is why `wantRuns` tests for an empty status
set rather than assuming every severity has a run arm. When a branch is suppressed its query is
not issued; `mergeByTime` merges one list, and the `nextCursor` it emits is still valid because the
comparator is unchanged.

```ts
const codes = filters.severity ? constantCodes(filters.severity) : null;
const varPreds = filters.severity ? variableCodePredicates(filters.severity) : [];
// `%term%`, not `term`. Drizzle's ilike() does NOT add wildcards, so
// ilike(col, escapeLike(q)) is an equality test that will silently never match.
const like = filters.q ? `%${escapeLike(filters.q)}%` : null;

const activityRows = await db
  .select({
    id: agentActivities.id,
    code: agentActivities.code,
    params: agentActivities.params,
    text: agentActivities.text,
    tag: agentActivities.tag,
    runId: agentActivities.runId,
    occurredAt: agentActivities.occurredAt,
  })
  .from(agentActivities)
  .where(and(
    eq(agentActivities.agentId, agentId),
    gte(agentActivities.occurredAt, from),
    lte(agentActivities.occurredAt, to),
    keysetWhere(agentActivities.occurredAt, agentActivities.id, 0, cursor),   // §6.0
    // §5.2: constant codes as an indexed IN list, OR'd with the three params-dependent ones.
    filters.severity
      ? or(inArray(agentActivities.code, codes!),
           ...varPreds.map((p) => and(eq(agentActivities.code, p.code),
             inArray(sql`coalesce(${agentActivities.params}->>${p.jsonPath}, '')`, p.values))))
      : undefined,
    filters.type ? inArray(agentActivities.code, filters.type) : undefined,
    filters.tag ? eq(agentActivities.tag, filters.tag) : undefined,
    // ILIKE over `text` only — a v2 row's text is '' and its prose lives in the
    // dictionary, so `q` cannot match a localised sentence. See the note below.
    like ? ilike(agentActivities.text, like) : undefined,
  ))
  .orderBy(desc(agentActivities.occurredAt), desc(agentActivities.id))
  .limit(limit + 1);

const runRows = await db
  .select(/* the TimelineItemDTO "run" projection */)
  .from(agentRuns)
  .where(and(
    eq(agentRuns.agentId, agentId),
    gte(agentRuns.startedAt, from),
    lte(agentRuns.startedAt, to),
    keysetWhere(agentRuns.startedAt, agentRuns.id, 1, cursor),   // §6.0
    filters.trigger ? inArray(agentRuns.trigger, filters.trigger) : undefined,
    filters.outcome ? inArray(agentRuns.status, filters.outcome) : undefined,
    // §5.2's OTHER mapping. Without this line a severity filter silently applies to
    // the activity branch only and every run in the window comes back regardless.
    filters.severity ? inArray(agentRuns.status, runStatusesFor(filters.severity)) : undefined,
    // Synthetic day-runs are tool-call carriers, not work. §6.3.
    not(sqlLike(agentRuns.externalRunId, "system:%")),
    like ? ilike(agentRuns.summary, like) : undefined,
  ))
  .orderBy(desc(agentRuns.startedAt), desc(agentRuns.id))
  .limit(limit + 1);

return mergeByTime(wantActs ? activityRows : [], wantRuns ? runRows : [], limit);   // §6.0
```

`sqlLike` is Drizzle's `like` operator, aliased at import because the local `like` above is the
escaped search pattern — two things named `like` in one function is how the wrong one gets passed.
`not(sqlLike(external_run_id, 'system:%'))` is NULL-safe here only because `external_run_id` is
`NOT NULL` (contract §3.3); on any nullable column `NOT LIKE` would drop the NULL rows.

**Indexes used:** `agent_activities_agent_time_idx` (or `…_agent_code_idx` when a severity or
event-type filter is present) and `agent_runs_agent_idx`. Both are range scans bounded by
`from`/`to`; neither degrades with table size, only with the size of the window.

**`escapeLike` is not optional.** `%`, `_` and `\` must be escaped exactly as
`app/api/admin/users/route.ts:26` already does, or `?q=%` is an unbounded sequential scan any
signed-in user can fire (`UI_DESIGN_V2.md` §F.1).

**An honest limitation of `q`.** A v2 activity row stores `text = ''` and renders from
`code` + `params`, so free-text search **cannot** match the sentence the user is reading — it
matches `agent_runs.summary`, legacy `text`, and `code='custom'` rows only. The search box says so:
placeholder *"Search run summaries"*, not *"Search activity"*. Rejected alternative: search the
rendered string client-side over the loaded page, which finds matches only in the 50 rows already
on screen and is worse than not offering it.

#### DTO

`TimelineItemDTO` is declared in `UI_DESIGN_V2.md` §F.5 and is **not** restated here. The envelope
is new:

```ts
export interface TimelineResponseDTO {
  items: TimelineItemDTO[];
  /** null ⇒ no more rows in this range. Opaque; pass back as ?cursor=. */
  nextCursor: string | null;
  /** Per-day counts for the sticky day headers, computed for the returned window
   *  only — a global count would need a second unbounded aggregate. */
  days: { date: string; runs: number; ok: number; failed: number; running: number }[];
  /** Drives §9. "live" | "mock" | "unconfigured". */
  managerMode: AgentManagerMode;
  /** Why the view may be thin. Populated only when items is empty — §8. */
  emptyReason: EmptyReason | null;
}

export type EmptyReason =
  | "no_data_yet"          // agent is live, nothing has happened in range
  | "never_provisioned"    // status is draft/provisioning — nothing could have happened
  | "runtime_mock"         // AGENT_MANAGER_MODE = mock
  | "runtime_unconfigured" // AGENT_MANAGER_MODE = unconfigured
  | "telemetry_unsupported"// live, and supports("runs") === "no" — nothing writes these tables.
                          // NOT `!== "yes"`: every telemetry capability is "unknown" today (§8.1 step 4)
  | "filtered_out";        // rows exist in range; the filters excluded them
```

`emptyReason` is the single most important field in this document's DTOs. §8 explains why.

#### Filters

| Param | Values | Maps to |
|---|---|---|
| `from`, `to` | RFC 3339, ≤ 90 days | both branches' range predicate |
| `q` | free text, `ILIKE`-escaped | `agent_runs.summary`, legacy `agent_activities.text` |
| `trigger` | `chat · schedule · channel · api · self · system` (all six) | `agent_runs.trigger` |
| `outcome` | `queued · running · succeeded · failed · cancelled · timeout` (all six) | `agent_runs.status` |
| `severity` | `info · notice · warning · error` | §5.2's two-armed predicate on the activity branch (`constantCodes` IN-list OR the three `params` tests) **and** `runStatusesFor()` on the run branch. `warning` maps to no run status, so it suppresses the run branch entirely rather than leaving it unfiltered |
| `type` | any `ActivityCode` from §5.3 | `agent_activities.code` |
| `tag` | the 14 `activity_tag` values | `agent_activities.tag` |
| `harness` | a `Harness` | **not on this route** — an agent has exactly one harness. It is a *fleet*-level filter and lives on `/dashboard/fleet`, where `EngineFilter` already implements it (`app/dashboard/fleet/page.tsx:14`). Accepting it here would imply an agent could change harness mid-history, which contract §d forbids. |
| `session` | `session_key` | `agent_runs.session_key` |
| `run` | a run id | narrows to one run's rows; the drill-down uses §6.2 instead |
| `channel` | a `channel_type` | `agent_activities.params->>'channel'` — a **JSONB** predicate with no index, therefore only accepted **together with** a `type` filter that restricts to `message.sent`/`message.received`, so the index does the selective work first |

A filter combination that no index serves is refused with **400 `unsupported_filter`** naming the
missing companion, rather than being served slowly. The `channel` rule above is the only such case
today.

#### Live mode

`GET /api/agents/[id]/activity/stream`, SSE, per `UI_DESIGN_V2.md` §F.1: 60-second self-cap, `id:`
on every frame so `Last-Event-ID` resumes, `: ping` every 15 s, a final `event: bye` carrying the
cursor. Off by default on mobile. The stream **re-runs the same keyset query** with the cursor
rather than tailing a change feed — one implementation, one filter semantics, and a reconnect that
cannot skip a row.

**`Last-Event-ID` is a client-controlled header and gets the identical Zod parse `?cursor=` gets.**
It is the same value by a different transport — `EventSource` sends it automatically on reconnect,
which is precisely why it is easy to forget it is untrusted. A malformed one is a **400
`bad_cursor`**, not a 500 and not a silent restart from the head, which would replay a minute of
rows the user already saw. Like `?cursor=`, it carries no authority: the agent comes from the path
and is workspace-checked before the stream opens.

If the deployment cannot hold a 60-second function, poll the same endpoint every 10 s with the
identical UI. A stream that cannot be resumed is worse than polling.

#### Empty state

Six distinct reasons, six distinct screens — §8.
### 6.2 RUNS — the list, the drill-down, and the step trace

*What is one unit of work, start to finish.*

#### The list

```ts
const rows = await db
  .select({
    id: agentRuns.id, externalRunId: agentRuns.externalRunId,
    trigger: agentRuns.trigger, triggerRef: agentRuns.triggerRef,
    sessionKey: agentRuns.sessionKey, status: agentRuns.status,
    startedAt: agentRuns.startedAt, finishedAt: agentRuns.finishedAt,
    durationMs: agentRuns.durationMs, stepCount: agentRuns.stepCount,
    inputTokens: agentRuns.inputTokens, outputTokens: agentRuns.outputTokens,
    cacheTokens: agentRuns.cacheTokens, totalTokens: agentRuns.totalTokens,
    costMicroUsd: agentRuns.costMicroUsd, model: agentRuns.model,
    summary: agentRuns.summary,
    errorCode: agentRuns.errorCode, errorMessage: agentRuns.errorMessage,
  })
  .from(agentRuns)
  .where(and(
    eq(agentRuns.agentId, agentId),
    gte(agentRuns.startedAt, from), lte(agentRuns.startedAt, to),
    not(sqlLike(agentRuns.externalRunId, "system:%")),   // §6.3
    keysetWhere(agentRuns.startedAt, agentRuns.id, 1, cursor),   // §6.0 — casts included
    filters.trigger ? inArray(agentRuns.trigger, filters.trigger) : undefined,
    filters.outcome ? inArray(agentRuns.status, filters.outcome) : undefined,
    filters.model ? eq(agentRuns.model, filters.model) : undefined,
    filters.session ? eq(agentRuns.sessionKey, filters.session) : undefined,
  ))
  .orderBy(desc(agentRuns.startedAt), desc(agentRuns.id))
  .limit(limit + 1);
```

**Index:** `agent_runs_agent_idx` `(agent_id, started_at DESC, id DESC)` — the §6.0 amendment.
`filters.session` adds a heap filter; a `session_key` index is **not** proposed, because the range
predicate already bounds the scan and a session lives inside a few days by construction. Add one
only if measurement contradicts that.

#### The step trace

```ts
const steps = await db
  .select({ /* RunStepDTO projection */ })
  .from(agentRunSteps)
  .where(eq(agentRunSteps.runId, runId))
  .orderBy(asc(agentRunSteps.idx));
```

**Index:** `agent_run_steps_run_idx` `(run_id, idx)` — contract §3.3, already specified. **Order by
`idx`, never by `occurred_at`.** The contract says `index` "determines render order — **not**
arrival order", steps arrive out of order under batching, and `agent_run_steps` has no `started_at`
at all — only `occurred_at`. That naming trap is conflict **C13** in `TASK_PLAN_V2.md` §1, resolved
in favour of `occurredAt` on the DTO; ordering by it would silently re-introduce the bug the
rename was meant to prevent.

**No pagination on steps.** A run is bounded by `max_runtime_seconds` and `stepCount` is a column;
a run with 2,000 steps is a pathology to surface, not to paginate. Above 200 steps the response
carries `stepsTruncated: true` and the UI offers `Export JSON`.

**`Export JSON` is the same route with `?format=json`, not a new one**, so it inherits the
`getAgentRow(id, ctx.workspace.id)` guard rather than needing its own — an export endpoint is the
classic place a workspace check is forgotten, because it does not look like a read. It streams with
`Content-Disposition: attachment` and `Content-Type: application/json`, is capped at **5,000 steps**
(above that it 409s with `run_too_large`; a run with 5,000 steps is an incident, not a download),
and applies the identical 8 KB `detail` truncation — an export is not a privilege escalation to the
untruncated body.

**`detail` is truncated to 8 KB server-side** with `detailTruncated: true`, and passes ArkAgent's
own secret-shaped-string redaction on **write**, not on read. The contract requires both sides to
redact and says "neither side relies on the other for this" — so the redactor is the existing
`SECRET_KEYS` mask that `lib/serializers.ts:107` already applies to channel config, exported from
there (`TASK_PLAN_V2.md` §4.2 already schedules that export) and reused by the ingest handler in
`lib/agent-manager/webhook.ts`. Redacting on read would leave the secret in the row, where the next
export, the next backup and the next support query all still find it.

#### DTO

`RunStepDTO` is `UI_DESIGN_V2.md` §F.5. The run envelope is new:

```ts
export interface RunDetailDTO {
  id: string; runId: string;                 // agent_runs.external_run_id
  trigger: RunTrigger; triggerRef: string | null;
  /** Resolved for display: a schedule's name, an inbound message's channel+sender.
   *  Resolved SERVER-SIDE by a lookup, because triggerRef is an opaque id and a
   *  client cannot join it. Null when the referent was deleted. */
  triggerLabel: string | null;
  sessionKey: string | null;
  status: RunStatus;
  startedAt: string; finishedAt: string | null; durationMs: number | null;
  /** Present only when status === "timeout": the ceiling that was hit, so the
   *  cause is legible without opening the schedule (UI_DESIGN_V2 §F.2). */
  timeoutAfterMs: number | null;
  stepCount: number; stepsTruncated: boolean;
  usage: { inputTokens: number; outputTokens: number; cacheTokens: number;
           totalTokens: number; costMicroUsd: number; model: string | null } | null;
  /** Agent-authored, untrusted, rendered escaped and attributed. */
  summary: string | null;
  errorCode: string | null; errorMessage: string | null;
  steps: RunStepDTO[];
  /** Re-run is offered only for trigger ∈ {schedule, api} — §F.2. Server-computed,
   *  because whether a re-run is legal depends on the agent's current status and
   *  the schedule still existing, neither of which the client knows. */
  canRerun: boolean;
}
```

#### The `costMicroUsd = 0` trap

`agent_runs.cost_micro_usd` defaults to `0`, and a run whose model ArkAgent cannot price also
lands at `0`. **Zero and unpriced are different facts and the DTO must not merge them.** The COST
view already refuses to render `$0.00` for an unpriced model (§F.4); the same rule applies to the
run header. The distinguishing signal is `llm_usage.estimated` (`lib/db/schema.ts:750`), which is
an existing, deliberate honesty flag (`MOCK_DATA_AUDIT.md` §4 item 12) — join it and render `—`
with a footnote when it is true.

#### Filters

Same `trigger` / `outcome` / `session` / `from` / `to` as §6.1, plus `model`. No `severity` — a run
already has a status, and offering both invites a query where `severity=info` and
`outcome=failed` return nothing for reasons the user cannot see.

#### Empty state

`no_data_yet` here is the **default** at launch and says so — §8.3.

### 6.3 TOOL CALLS — the sub-view nobody would have designed on purpose

Contract §3.4 (`agent.tool_call`) creates a **synthetic run** for any tool invocation that happens
outside a run — a channel webhook handler, a background memory compaction, an approval callback:

```
external_run_id = "system:" || to_char(occurredAt AT TIME ZONE 'UTC', 'YYYY-MM-DD')
trigger         = 'system'
external_step_id= eventId
idx             = the synthetic run's current step_count, incremented in the same transaction
```

One synthetic run **per agent per UTC day**, accumulating every out-of-run tool call as steps.

**This has a consequence the contract does not draw, and it is the reason this sub-view exists.**
An agent that has run for a year has 365 synthetic runs in `agent_runs`, each `trigger: 'system'`,
each `status: 'running'` forever, each with no `finished_at`, no summary and no cost. Rendered in
the RUNS list beside real work, they are 365 rows of noise that never complete — and one of them,
today's, is *always* at the top, permanently marked "running".

**Decision: synthetic runs are excluded from TIMELINE and RUNS by
`NOT (external_run_id LIKE 'system:%')`, and surfaced here instead.** Their steps are real and
worth seeing; their run wrapper is an artefact of a `NOT NULL` foreign key.

Rejected alternative: give the ingest handler a `runs.synthetic boolean` column. It is the cleaner
model and it needs a migration slot that §2.1 does not have; the `LIKE 'system:%'` predicate is
served by the same index prefix and is reversible. Revisit if a sixth migration opens for another
reason.

#### Query

```ts
const toolCalls = await db
  .select({
    id: agentRunSteps.id, occurredAt: agentRunSteps.occurredAt,
    title: agentRunSteps.title, kind: agentRunSteps.kind,
    detail: agentRunSteps.detail, status: agentRunSteps.status,
    durationMs: agentRunSteps.durationMs, phase: agentRunSteps.phase,
  })
  .from(agentRunSteps)
  .where(and(
    eq(agentRunSteps.agentId, agentId),
    gte(agentRunSteps.occurredAt, from), lte(agentRunSteps.occurredAt, to),
    keysetWhere(agentRunSteps.occurredAt, agentRunSteps.id, 1, cursor),   // §6.0, single-source
    // The view's defining predicate, and it was missing from the first drafting of this
    // query: without it this is "every step ever", not "tool calls outside a run".
    eq(agentRunSteps.phase, "tool_call"),
    includeInRun ? undefined : exists(
      db.select({ x: sql`1` }).from(agentRuns).where(and(
        eq(agentRuns.id, agentRunSteps.runId),
        sqlLike(agentRuns.externalRunId, "system:%"),
      ))),
    // `denied` is NOT a value of agent_run_steps.status (ok | error only). Filtering on it
    // against the column returns nothing; it is answered by the denial join below.
    filters.status && filters.status !== "denied"
      ? eq(agentRunSteps.status, filters.status) : undefined,
    filters.status === "denied" ? inArray(agentRunSteps.id, deniedStepIds) : undefined,
    filters.kind ? eq(agentRunSteps.kind, filters.kind) : undefined,
  ))
  .orderBy(desc(agentRunSteps.occurredAt), desc(agentRunSteps.id))
  .limit(limit + 1);
```

**Index:** `agent_run_steps_agent_idx`, amended in §6.0 to `(agent_id, occurred_at DESC, id DESC)`
— contract §3.3, which already justifies the first two columns as *"the Activity page's 'everything
this agent did, newest first' query spans steps across runs. Without this it is a sequential scan of
every step in the deployment."* This view is the query that comment was written for; the `id`
column is the keyset tiebreak, and out-of-run tool calls arriving in one 2-second coalesced batch
(contract §3.2 batching guidance) genuinely do share an `occurred_at`, so it is not hypothetical
here the way it is on `agent_runs`.

The `EXISTS` on `agent_runs` costs one index probe per candidate row on the primary key, over the
few hundred rows the range scan already selected. Rejected alternative: denormalise a
`synthetic boolean` onto the step — that is the migration §2.1 does not have, restated.

The default filter is `phase = 'tool_call'` **plus** membership of a synthetic run; the toggle
`Include in-run calls` (`?includeInRun=true`) drops the second condition and shows every tool call
the agent has ever made, which is the view for "did it ever touch the CRM?".

#### DTO

```ts
export interface ToolCallDTO {
  id: string;
  occurredAt: string;
  /** agent.tool_call.toolName lands in agent_run_steps.title. */
  toolName: string;
  kind: StepKind | string | null;
  status: "ok" | "error" | "denied";
  /** Only when status === "denied". A translation key in lib/i18n/activity.ts. */
  denyReason: string | null;
  durationMs: number | null;
  /** Redacted upstream AND truncated here. Text nodes inside <pre>; no URL in it
   *  becomes an href. */
  detail: string | null; detailTruncated: boolean;
  /** Set when the call came from an installed skill; opens the D.3 drawer. */
  skillRef: { slug: string; ownerHandle: string; version: string } | null;
  /** null when the call was inside a real run — then it links there instead. */
  syntheticDay: string | null;
  runId: string | null;
}
```

**`status: "denied"` has no column.** `agent_run_steps.status` is `'ok' | 'error'`, and the
contract maps a denial to a step plus an `agent_activities` row with `code: "tool.denied"`. So the
DTO's `denied` is reconstructed from the `tool.denied` activity rows for the window, and
`denyReason` comes from `params->>'denyReason'`, which is exactly what §5.3 stores it for. This is
the one place where the activity row is the authoritative record and the step is the supporting
detail; everywhere else it is the reverse.

**The correlation key is not `(agent_id, occurred_at)` alone.** Both rows are written from the same
event, so they share `occurred_at` exactly — but a coalesced batch (contract §3.2: one batch per
agent per 2 seconds for `tool_call`) routinely carries several denials whose `occurredAt` the
runtime stamped identically, and a timestamp-only join then cross-products them and attaches the
wrong `denyReason` to the wrong tool. Two extra terms make it exact:

```sql
LEFT JOIN agent_activities a
  ON a.agent_id    = s.agent_id
 AND a.code        = 'tool.denied'
 AND a.occurred_at = s.occurred_at
 AND a.run_id      = s.run_id                  -- 0012 adds agent_activities.run_id
 AND a.params->>'toolName' = s.title           -- agent.tool_call.toolName lands in step.title
```

`run_id` narrows to the one synthetic day-run, `toolName` = `title` is the contract's own mapping
(`agent.tool_call.toolName` → `agent_run_steps.title`), and the residual ambiguity — the same tool
denied twice in the same microsecond in the same run — is a genuine tie the UI may render either
way, because both rows carry the same `denyReason`.

**PROPOSED, and cheaper than the join** — amends contract §3.4: have the ingest handler write the
step's `external_step_id` (which is the `eventId`) into `params.stepId` on the `tool.denied` row it
creates from the same event. It is an ArkAgent-side change, zero wire change, and it turns the join
above into an equality on a unique key. Until then, the four-term join is what §6.3 ships.

#### Empty state

Distinct from RUNS: *"Nothing outside a run."* On a healthy agent this view **should** be empty,
and the copy says so rather than implying something is missing (§8.4).
### 6.4 HEALTH — uptime and capacity

*Is it up, is it working, and is it running out of room.*

#### Query — bucketed server-side, always ~300 points

1,440 samples per agent per day at the contract's 60-second cadence. Sending a day of raw samples
to draw a 32px sparkline is ~180 KB of JSON for ~120 pixels of ink. Bucket in SQL:

```ts
// ≤24h → 300 (288 buckets) · ≤7d → 1800 (336) · ≤30d → 7200 (360) · ≤90d → 21600 (360).
// The last arm is not decoration: §6.0 caps every range at 90 days, and a pickBucket
// with no arm above 30d returns undefined for a legal request, which divides by NaN and
// groups every sample into one bucket.
const bucketSeconds = pickBucket(range);
const bucket = sql<Date>`
  to_timestamp(floor(extract(epoch from ${agentHealthSamples.sampledAt}) / ${bucketSeconds})
               * ${bucketSeconds})`;

const buckets = await db
  .select({
    ts: bucket,
    cpu: sql<number>`round(avg(${agentHealthSamples.cpuPercent}))`,
    cpuPeak: sql<number>`max(${agentHealthSamples.cpuPercent})`,
    mem: sql<number>`round(avg(${agentHealthSamples.memoryBytes}))`,
    memLimit: sql<number>`max(${agentHealthSamples.memoryLimitBytes})`,
    disk: sql<number>`max(${agentHealthSamples.diskUsedBytes})`,
    activeRuns: sql<number>`max(${agentHealthSamples.activeRuns})`,
    /* Worst state in the bucket wins the strip cell: an operator wants the worst
       thing that happened in those five minutes, not the average of it. */
    state: sql<string>`(array['idle','running','stopped','unhealthy'])[
      max(array_position(array['idle','running','stopped','unhealthy'],
                         ${agentHealthSamples.state}))]`,
    samples: sql<number>`count(*)`,
    mockSamples: sql<number>`count(*) filter (where ${agentHealthSamples.source} = 'mock')`,
  })
  .from(agentHealthSamples)
  .where(and(
    eq(agentHealthSamples.agentId, agentId),
    gte(agentHealthSamples.sampledAt, from),
    lte(agentHealthSamples.sampledAt, to),
  ))
  .groupBy(bucket)
  .orderBy(asc(bucket));
```

**Index:** `agent_health_samples_agent_idx` `(agent_id, sampled_at DESC)` — contract §3.3. The
`GROUP BY` is over a bounded range scan, so it sorts at most `range / 60s` rows: 1,440 for a day,
20,160 for the 14-day full-resolution window, which is the reason the retention rule exists.

**Disk shows `max`, not `avg`.** There is no `disk_limit_bytes` column, so the card renders an
absolute figure and a 7-day delta, never a percentage (`UI_DESIGN_V2.md` §F.3). Averaging a
monotonically-growing series also hides exactly the thing the card is for.

**No pagination.** The response is a fixed ~300 buckets by construction; the range picker is the
control.

**Past 14 days the series changes granularity, and the DTO has to say so.** §7.2 rolls samples
older than 14 days up to one row per hour **in place**, so any window wider than a fortnight mixes
60-second samples with 3,600-second aggregates in the same `avg()` — an unweighted mean in which
one rolled-up hour counts as much as one live minute, biasing every figure toward the recent half.
Two consequences, both handled rather than ignored:

- Each bucket returns `rollupSamples: count(*) filter (where source = 'rollup')` beside
  `mockSamples`, and a bucket with `rollupSamples > 0` renders with §7.2's thinner stroke. The
  §6.4 DTO carries it; without it `samples: 24` for a day looks like a runtime that stopped
  reporting.
- `cpu`/`mem` are weighted when the window can contain rollups:
  `sum(cpu_percent * w) / sum(w)` where `w = (case when source = 'rollup' then 60 else 1 end)`.
  Inside 14 days every `w` is 1 and the expression is `avg()` exactly.

Rejected alternative: refuse ranges over 14 days on this view. The 30- and 90-day windows are the
ones a capacity question is actually asked in, and answering "no data" for them because the data was
compressed is worse than a weighted mean with a visible stroke change.

#### Mock samples are counted, never charted

`mockSamples` is returned per bucket. A bucket with `mockSamples > 0` renders hatched with an
`aria-label` saying simulated, and the view shows a banner. Contract §3.5 requires mock rows to be
distinguishable in the same tables; W5-4's acceptance check requires them to be *visibly* distinct.
A mock sample averaged silently into a real agent's history is the single worst outcome available
on this page, because it is indistinguishable from success.

#### DTO

`HealthSampleDTO` is `UI_DESIGN_V2.md` §F.5 (per-sample). The bucketed envelope is new:

```ts
export interface HealthViewDTO {
  bucketSeconds: number;
  buckets: {
    ts: string; state: HealthState | null;   // null ⇒ no sample: a GAP, not "idle"
    cpuPercent: number | null; cpuPeak: number | null;
    memoryBytes: number | null; memoryLimitBytes: number | null;
    diskUsedBytes: number | null; activeRuns: number;
    /** `samples` counts ROWS, which past 14 days are hourly rollups, not minutes. */
    samples: number; mockSamples: number; rollupSamples: number;
  }[];
  /** Always rendered, even with zero samples — derived from `agents`, not from
   *  agent_health_samples, so the view is never blank (§F.3). */
  liveness: {
    lastHeartbeatAt: string | null;
    heartbeatMinutes: number;         // settings.heartbeatMinutes
    /** ok | stale (>3×) | dead (>10×) | expected_silence (status='paused') */
    heartbeatState: "ok" | "stale" | "dead" | "expected_silence";
    activeRuns: number;
    lastActivityAt: string | null;
    configRevision: number; appliedConfigRevision: number | null;
    uptimeStartedAt: string | null; restarts7d: number;
  };
  /** "runtime" | "mock" | "none" — drives the banner and §8.5's empty state. */
  sampleSource: "runtime" | "mock" | "none";
}
```

`heartbeatState: "expected_silence"` exists because contract §5.6 step 4 says ArkAgent must **not**
mark a `paused` agent unreachable. Without the fourth state, every paused agent shows a red
liveness dot, and operators learn to ignore the red dot.

**`restarts7d` cannot be counted the obvious way, because the column it wants does not exist.**
`agent_health_samples` carries `uptime_seconds bigint` and **no `uptime_started_at`** (contract
§3.3; `HealthSampleDTO` in `UI_DESIGN_V2.md` §F.5 agrees — `uptimeSeconds: number | null`). The
wire event has the same shape: `agent.health` sends `uptimeSeconds`, and only `agent.heartbeat`
sends `uptimeStartedAt`, which lands in `agents.uptime_started_at` and keeps just the current one.
So a restart is observable only as a **decrease** in `uptime_seconds` between consecutive samples:

```sql
SELECT count(*) FROM (
  SELECT uptime_seconds,
         lag(uptime_seconds) OVER (ORDER BY sampled_at) AS prev
  FROM agent_health_samples
  WHERE agent_id = $1 AND sampled_at >= now() - interval '7 days'
    AND source <> 'mock' AND uptime_seconds IS NOT NULL
) t WHERE prev IS NOT NULL AND uptime_seconds < prev;
```

`source <> 'mock'` keeps a simulator's sawtooth out of a real agent's restart count (contract §3.5),
and the window function runs over the same bounded range scan the buckets already use. It is
**undercounting by construction** — a restart inside one 60-second gap that returns to a higher
uptime is invisible, and after the 14-day rollup the resolution is hourly — so the label is
`restarts (7d, observed)`, not `restarts`. Rejected alternative: add `uptime_started_at` to
`agent_health_samples`. It is a wire change, a column, and a contract amendment for a number that
the `lag()` above answers well enough; §11.1 does not request it.

#### Empty state

The **most likely** view to be empty at launch: `agent.health` is PROPOSED and unimplemented
upstream (`RUNTIME_INTEGRATION.md` §3.6). The `liveness` block still renders — §8.5.

### 6.5 COST — token and credit analytics

*What did this cost, what drove it, is it trending up.* Three questions, and the view answers
nothing else (`UI_DESIGN_V2.md` §F.4).

#### Query — direct aggregate, no rollup table

```ts
// Day bucketing uses the WORKSPACE timezone (workspaces.timezone, added in 0009),
// not UTC. "Daily spend" bucketed in UTC for a Shanghai workspace draws every
// evening's work on the following day's bar.
//
// AT TIME ZONE with an unknown zone raises 22023 at QUERY time, i.e. a 500 on the
// COST tab of every agent in that workspace, from a column a user can set. Validate
// with the already-shipped `isValidTimeZone` (lib/schedule/cron.ts) BEFORE it reaches
// SQL, and fall back to "UTC" with a `timezoneInvalid: true` flag on the DTO so the
// header can say which zone it actually bucketed in. `assertTimeZone` (same module)
// is the throwing variant and belongs in the schedules writer, not here — a bad
// stored value must not make the read path unreachable.
const tz = isValidTimeZone(ws.timezone) ? ws.timezone : "UTC";
const day = sql<string>`to_char(${agentRuns.startedAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;

const daily = await db
  .select({
    day,
    // Every aggregate is .mapWith(Number) — §6.0. postgres.js returns bigint and
    // numeric as strings, and `sum()` over bigint is numeric.
    runs: sql<number>`count(*)`.mapWith(Number),
    costMicroUsd: sql<number>`coalesce(sum(${agentRuns.costMicroUsd}), 0)`.mapWith(Number),
    totalTokens: sql<number>`coalesce(sum(${agentRuns.totalTokens}), 0)`.mapWith(Number),
    /* An unpriced model contributes 0 to the sum. Count it so the view can say
       "3 runs not priced" instead of drawing a shorter bar and calling it cheaper. */
    unpriced: sql<number>`count(*) filter (where ${agentRuns.costMicroUsd} = 0
                                             and ${agentRuns.totalTokens} > 0)`.mapWith(Number),
  })
  .from(agentRuns)
  .where(and(eq(agentRuns.agentId, agentId),
             gte(agentRuns.startedAt, from), lte(agentRuns.startedAt, to),
             not(sqlLike(agentRuns.externalRunId, "system:%"))))
  .groupBy(day).orderBy(asc(day));
```

**`credits` is a second query against a second table, and it needs its own scoping.**
`CostViewDTO.credits` comes from `usage_records`, not from `agent_runs`, and `usage_records.agent_id`
is `.references(… { onDelete: "set null" })` — nullable — while its only index is
`usage_records_workspace_idx (workspace_id, occurred_at)`. So the predicate is **both** columns, in
that order:

```ts
const credits = await db
  .select({ kind: usageRecords.kind,
            credits: sql<number>`coalesce(sum(${usageRecords.credits}), 0)`.mapWith(Number) })
  .from(usageRecords)
  .where(and(eq(usageRecords.workspaceId, ctx.workspace.id),   // drives the index
             eq(usageRecords.agentId, agentId),                // heap filter
             gte(usageRecords.occurredAt, from), lte(usageRecords.occurredAt, to)))
  .groupBy(usageRecords.kind);
```

Filtering on `agentId` alone would be correct-by-accident (the agent was already workspace-checked)
and would also miss the index entirely. `usage_records` is the **only** table on this page that is
workspace-scoped rather than agent-scoped, which is exactly why it is the one that gets forgotten.

`BY TRIGGER` and `BY MODEL` are the same shape with `groupBy(agentRuns.trigger)` /
`groupBy(agentRuns.model)`. `MOST EXPENSIVE RUNS` is `orderBy(desc(agentRuns.costMicroUsd)).limit(10)`.

**Index:** `agent_runs_agent_idx`, as a range scan. At the §7.1 volumes a 30-day window is ~2,000
rows for a busy agent — an aggregate over 2,000 index-ordered rows is sub-millisecond. **No
covering index is proposed**; adding `INCLUDE (cost_micro_usd, total_tokens, …)` would make it
index-only at the cost of a materially larger index on the hottest write path, for a query that is
already fast. Revisit on measurement, not on principle.

#### `BY SKILL` is tokens, not cost — and the header says so

`UI_DESIGN_V2.md` §F.4's group-by control lists *by skill*. There is no skill column on
`agent_runs`, and attributing a whole run's cost to each skill it touched double-counts —
a fabricated number, which rule 3 of §0 forbids. What **is** derivable: `agent_run_steps` carries
per-step `input_tokens` / `output_tokens`, and a step with `kind = 'skill'` names one skill.

So the grouping is over **skill steps only**, the column header reads `TOKENS IN SKILL STEPS`, not
`COST`, and the caption states that the shares are of skill-step tokens and do not sum to the run
total. Rejected alternative: drop the control. It answers a real question ("is `lead-enrichment`
expensive?") and the honest version of that answer is still useful.

**PROPOSED, amends contract §3.3 and §3.4.** `agent.tool_call` carries `skillSlug`, `source` and
`ownerHandle`; **`agent.run_step` does not** — and §3.4 says that inside a run you must emit
`agent.run_step` instead of `agent.tool_call`. So the in-run path loses the skill attribution the
out-of-run path has, and `RunStepDTO.skillRef` (`UI_DESIGN_V2.md` §F.5) has no source but parsing
the free-text `title`. Add the same four fields to `agent.run_step` — additive, so it stays `v: 1`
per §6.1 — and four nullable columns to `agent_run_steps` inside slot 0012, which already creates
that table:

```sql
skill_slug    varchar(120),
skill_source  varchar(24),
skill_owner   varchar(80),
skill_version varchar(40),
```

Until then `skillRef` is `null` and skill steps do not link to the D.3 drawer. **Do not parse the
title** — `lead-enrichment@1.4.0` is a convention, not a contract, and a slug is `@owner/slug` plus
a version anyway (`SKILL_ECOSYSTEM.md` §0: bare slugs are not unique; `github` resolves to six
publishers).

#### DTO

```ts
export interface CostViewDTO {
  currency: string;                    // resolved through lib/pricing, never hardcoded "$"
  /** EVERY money field is micro-USD. Summed in micro-USD, converted once at
   *  render (UI_DESIGN_V2 §F.5): summing per-run values already rounded to cents
   *  turns a 412-run month into a number wrong by more than the total. */
  totals: { costMicroUsd: number; runs: number; costPerRunMicroUsd: number;
            totalTokens: number; unpricedRuns: number };
  previous: { costMicroUsd: number; runs: number } | null;   // null ⇒ no prior window
  daily: { day: string; costMicroUsd: number; runs: number;
           totalTokens: number; unpriced: number }[];
  byTrigger: { trigger: RunTrigger; runs: number;
               totalTokens: number; costMicroUsd: number }[];
  byModel:   { model: string | null; runs: number;
               totalTokens: number; costMicroUsd: number }[];
  bySkillSteps: { slug: string | null; steps: number; totalTokens: number }[];
  topRuns: { runId: string; startedAt: string; summary: string | null;
             durationMs: number | null; totalTokens: number;
             costMicroUsd: number; unpriced: boolean; status: RunStatus }[];
  /** Credits are a separate ledger from tokens and are NOT convertible here —
   *  ArkAgent owns pricing (contract §6.2 rule 4). Shown as its own row. */
  credits: { used: number; kind: Record<string, number> };
}
```

#### The interim win, restated because it is the only thing that makes this view real

`streamOpenclawReply` (`app/api/agents/[id]/messages/route.ts:183`) already receives
`responseId` and `finalResponse.usage` `{inputTokens, outputTokens, totalTokens}`
(`app/lib/openclaw_manager_api.ts:371-375, 393`) and discards both into a debug log. Persisting an
`agent_runs` row keyed on `(agentId, responseId)` — which is exactly the shape
`agent_runs_external_uniq` expects — plus an `llm_usage` row makes COST and the `chat`-triggered
half of TIMELINE real against **today's** Manager, with no upstream change. Ship it in v2.0
regardless of what the backend team commits to.

Its honest gap: the Manager's usage carries tokens but no cost, and the model is not one ArkAgent
priced. `cost_micro_usd` is `0` with `llm_usage.estimated = true`, and every such run renders `—`
with a footnote, never `$0.00`.

#### Filters and pagination

Range only (`last 7d · 30d · 90d`, default 30d), plus the group-by selector. No pagination: every
list is a `LIMIT 10`. `topRuns` rows link into §6.2.

#### Empty state

§8.6 — and the "no cost data" case has **two** causes that must not be conflated: no runs at all,
versus runs whose model is unpriced.

### 6.6 ERRORS & ESCALATIONS

*What went wrong, and what is waiting on me.*

Three sources, merged, newest first. None of them is expressible as a filter over §6.1 (the third
is not even in the same tables), which is why this is a tab.

```ts
// A. failed work
const failedRuns = await db.select(/* … */).from(agentRuns)
  .where(and(eq(agentRuns.agentId, agentId),
             inArray(agentRuns.status, ["failed", "timeout", "cancelled"]),
             gte(agentRuns.startedAt, from), lte(agentRuns.startedAt, to),
             keysetWhere(agentRuns.startedAt, agentRuns.id, 1, cursor)))   // §6.0
  .orderBy(desc(agentRuns.startedAt), desc(agentRuns.id)).limit(limit + 1);

// B. runtime-reported problems and policy events.
// severityBand(["warning","error"]) is the §5.2 predicate builder, NOT a bare code list:
// `error.raised` is in both bands and is separated only by params->>'severity', and
// `run.finished` is in the error band only when params->>'status' is failed|timeout.
const problems = await db.select(/* … */).from(agentActivities)
  .where(and(eq(agentActivities.agentId, agentId),
             severityBand(["warning", "error"]),
             gte(agentActivities.occurredAt, from), lte(agentActivities.occurredAt, to),
             keysetWhere(agentActivities.occurredAt, agentActivities.id, 0, cursor)))
  .orderBy(desc(agentActivities.occurredAt), desc(agentActivities.id)).limit(limit + 1);

// C. waiting on a human. agent_improvements has no workspace column; the agent was
// already resolved by getAgentRow(id, ctx.workspace.id), so agentId IS the scope.
const pending = await db.select(/* … */).from(agentImprovements)
  .where(and(eq(agentImprovements.agentId, agentId),
             eq(agentImprovements.status, "pending")))
  .orderBy(desc(agentImprovements.createdAt)).limit(50);
```

**A and B share one cursor and one merge, exactly as §6.1 does** — the `kind` ranks are the same
(`run` = 1, `act` = 0) so `keysetWhere` and `mergeByTime` are reused unchanged rather than
reimplemented. **C is not in the merge and is not in the cursor**: it is a separate array on the
DTO, so a `cursor` that pointed into C would have nothing to point at.

`severityBand(sevs)` is the multi-severity form of §5.2's predicate builder; `severityCodes(sev)`
does not exist as a variadic and must not be written as one, because the union of two bands' code
lists is not the union of the two bands (a `run.finished` row is in exactly one of them, decided by
`params`).

**Indexes:** `agent_runs_agent_failed_idx` (the partial index from §6.0 — on a healthy agent it
holds a few hundred rows out of hundreds of thousands, so the incident view is instant on the day
it matters most), `agent_activities_agent_code_idx`, and the existing
`agent_improvements_agent_idx` `(agent_id, status)` (`lib/db/schema.ts:480`).

**C is not range-filtered and not paginated.** A pending self-review item from six weeks ago is
still pending, and hiding it behind a 7-day window is how an escalation gets lost. It sits in a
pinned block above the merged stream, capped at 50 with a link to the full queue.

#### DTO

```ts
export type IncidentDTO =
  | { type: "run_failed"; id: string; runId: string; occurredAt: string;
      status: Extract<RunStatus, "failed" | "timeout" | "cancelled">;
      errorCode: string | null; errorMessage: string | null;
      trigger: RunTrigger; triggerLabel: string | null; durationMs: number | null }
  | { type: "problem"; id: string; occurredAt: string;
      code: string; params: Record<string, string | number>;
      severity: "warning" | "error"; runId: string | null }
  | { type: "awaiting_review"; id: string; createdAt: string;
      kind: "instruction" | "rule" | "skill" | "schedule" | "other";
      /** Agent-authored, untrusted: text node, escaped, attributed to the agent. */
      text: string; impact: string | null;
      /** Machine-applicable form. Applied ONLY on human approval and applied by
       *  ArkAgent — data describing a change, never a command (contract §3.4). */
      proposal: Record<string, unknown> | null;
      /** false for an unrecognised proposal shape: shown, but no one-click apply. */
      applicable: boolean };

export interface IncidentsResponseDTO {
  awaitingReview: Extract<IncidentDTO, { type: "awaiting_review" }>[];
  items: IncidentDTO[];
  nextCursor: string | null;
  /** Rolling counts for the tab badge and the header strip. */
  counts: { failedRuns: number; warnings: number; errors: number; pendingReview: number };
  emptyReason: EmptyReason | null;
}
```

`kind` and `proposal` are the two columns 0009 adds to `agent_improvements` (contract §3.3);
without them the queue "cannot route or apply anything", which is the state it is in today.

#### Filters

`from` / `to`, and `severity` restricted to `warning | error`. `errorCode` is a chip list built
from the counts in the current window — a fixed 18-item dropdown of codes that mostly never occur
is worse than four chips for the four codes this agent actually hit.

#### Empty state

The one empty state that is **good news**, and the copy must say so — §8.7.
---

## 7. Performance

### 7.1 Expected volume

Three agent shapes. "Busy" is a `*/15` schedule across a nine-hour window plus channel traffic;
"typical" is hourly in a twelve-hour window; "quiet" is a daily digest. Seven steps per run is the
contract's own worked example (§3.4).

| Table | quiet · 3 runs/day | typical · 18 runs/day | busy · 66 runs/day |
|---|---|---|---|
| `agent_runs` | 3 | 18 | 66 |
| `agent_run_steps` | 21 | 126 | 462 |
| `agent_activities` | 14 | 79 | 280 |
| `usage_records` | 3 | 18 | 66 |
| `llm_usage` | 3 | 18 | 66 |
| `agent_health_samples` | **1,440** | **1,440** | **1,440** |
| **rows / agent / day** | **1,484** | **1,699** | **2,380** |

**Health is 60–97 % of every row this product writes**, and it is the same number for all three
shapes because the sample rate is time-based, not work-based. Every other line on this page is
noise next to it. That single fact decides the retention design in §7.2.

`agent.heartbeat` is not in the table: at `settings.heartbeatMinutes` it is ~288 events/day and it
writes **no rows** — it is an `UPDATE` on three `agents` columns.

#### Activity rows by severity

The number the ERRORS tab and the severity filter are sized against.

| Severity | quiet | typical | busy | share |
|---|---|---|---|---|
| `info` | 13 | 76 | 270 | **96 %** |
| `notice` | 0.3 | 1.4 | 4.5 | 1.6 % |
| `warning` | 0.3 | 1.0 | 3.0 | 1.1 % |
| `error` | 0.3 | 0.9 | 4.0 | 1.4 % |

Two design consequences, both non-obvious:

- **`warning` + `error` is under 3 % of the feed**, which is why §6.6's partial index is a few
  hundred rows against hundreds of thousands, and why ERRORS stays instant on the worst day.
- **The TIMELINE must not default to a severity filter.** Filtering to `warning`+ hides 97 % of
  what the agent did, and "it did nothing" is the wrong answer to "what happened today".

#### Fleet

500 agents at 20 % busy / 60 % typical / 20 % quiet is
`100 × 2,380 + 300 × 1,699 + 100 × 1,484` = **896,100 rows/day**, ~327 M/year unswept. That is where
§7.4's 10⁶ figure comes from — it is a *deployment* number, and no query on this page ever touches
it, which is the point of §7.4.

Storage is dominated by one column: `agent_run_steps.detail`, capped at 8 KB and averaging ~600 B.
Steps at that mix are `100 × 462 + 300 × 126 + 100 × 21` = 86,100/day, so ~52 MB/day or roughly
**1.6 GB/month**, before TOAST compression. Row *count* is a health-samples problem; row *size* is a
step-detail problem. They need different answers — which is why §7.2 retains steps for 90 days and
samples for 14.

### 7.2 Retention and rollup

One nightly job at `/api/cron/sweep`, authenticated by `Authorization: Bearer $CRON_SECRET`
compared with `timingSafeEqual` and **failing closed when the secret is unset** — the same pattern
W2-6 and W3-2 use, and for the same reason (an unauthenticated maintenance endpoint on a public URL
is a delete button). It claims work with `FOR UPDATE SKIP LOCKED` so two platform ticks cannot
double-run, and every delete is batched — `DELETE … WHERE id IN (SELECT id … LIMIT 5000)` in a
loop — so no single statement holds a long lock on a table the Activity page is reading.

**The route exports `GET`, not `POST`** — that is what Vercel Cron issues, and
`DATA_MODEL_V2.md` §14.0 overrides an earlier draft of this section on the point. It exports `POST`
as well, matching `/api/cron/schedules`, so a manual re-run and an external scheduler both work; the
bearer check is identical on both verbs. `DATA_MODEL_V2.md` §14 also owns the pass list and the
retention numbers this section supplies (90 / 400 / 400) — one script, one `vercel.json` entry,
because the plan that gates the per-minute tick gates the number of cron entries too.

| Table | Full resolution | Then | Rationale |
|---|---|---|---|
| `agent_health_samples` | **14 days** | roll up to **hourly**, in place | Contract §3.4 already specifies 14 days and hourly. 1,440/day → 24/day is a **60×** reduction and it is not optional at fleet scale. |
| `agent_run_steps` | **90 days** | **delete** | A step trace is a debugging artefact with a short half-life. The `agent_runs` row keeps `summary`, `step_count` and every token/cost total, so nothing billable is lost. |
| `agent_runs` | **400 days** | delete | 400 = a year plus a quarter, so year-over-year comparison works and the boundary is never inside a comparison. |
| `agent_activities` | **400 days** | delete | Small rows; matches runs so the merged timeline never has a run with no activity or the reverse. |
| `agent_health_samples` where `source='mock'` | — | **swept, never rolled up** | Contract §3.5. A mock sample averaged into a real agent's history is unrecoverable. |
| `runtime_event_receipts` | per contract §3.2 | swept by the same job | It is already the same job. |

**The health rollup is in place, not into a second table.** Delete the ~60 rows of an hour, insert
one row at the hour boundary carrying the averages, and mark it. That needs a third value in
`agent_health_samples.source`, which is a `varchar(16)` and not an enum, so it is not a migration —
but it **is** a **PROPOSED amendment to `UI_DESIGN_V2.md` §F.5**, whose `HealthSampleDTO.source` is
typed `"runtime" | "mock"`:

```ts
source: "runtime" | "mock" | "rollup";
```

A `rollup` bucket renders with a thinner stroke and a `<title>` saying hourly average — an average
of averages is a weaker claim than a sample and should not draw the same line. Rejected
alternative: a separate `agent_health_hourly` table. It needs a migration slot §2.1 does not have,
and it forces every read path to union two tables for a chart that is already bucketed in SQL.

**Autovacuum needs tuning on the two bulk-delete tables**, or the nightly sweep leaves dead tuples
that every subsequent range scan walks:

```sql
ALTER TABLE agent_run_steps      SET (autovacuum_vacuum_scale_factor = 0.02);
ALTER TABLE agent_health_samples SET (autovacuum_vacuum_scale_factor = 0.02);
```

At the default 0.2 a 100 M-row table waits for 20 M dead tuples before vacuuming, which on an
append-plus-nightly-delete workload means the index bloats for weeks.

### 7.3 The cost rollup — deferred, deliberately, with the trigger written down

**v2.0 has no rollup table.** §6.5 aggregates `agent_runs` directly, and at §7.1's volumes a
30-day window is ~2,000 rows for the busiest agent — an aggregate over 2,000 index-ordered rows is
sub-millisecond. Building a rollup for that is a cache with an invalidation problem, bought with a
migration slot §2.1 does not have.

**The trigger for building it**, so this is a decision and not an omission: when a single agent's
30-day window exceeds **50,000 runs**, or when a *workspace-* or *fleet-*wide cost view is built —
that query aggregates across every agent and is the one that genuinely cannot scan.

The deferred design, specified now so it is not improvised then:

```sql
-- PROPOSED, v2.1. Not in slots 0007-0012.
CREATE TABLE agent_cost_daily (
  agent_id       uuid   NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id   uuid   NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  day            date   NOT NULL,          -- in workspaces.timezone, not UTC
  runs           integer NOT NULL DEFAULT 0,
  failed_runs    integer NOT NULL DEFAULT 0,
  input_tokens   bigint  NOT NULL DEFAULT 0,
  output_tokens  bigint  NOT NULL DEFAULT 0,
  cache_tokens   bigint  NOT NULL DEFAULT 0,
  total_tokens   bigint  NOT NULL DEFAULT 0,
  cost_micro_usd bigint  NOT NULL DEFAULT 0,
  unpriced_runs  integer NOT NULL DEFAULT 0,
  credits        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, day)
);
CREATE INDEX agent_cost_daily_ws_idx ON agent_cost_daily (workspace_id, day DESC);
```

Refreshed by the same nightly sweep with `INSERT … ON CONFLICT (agent_id, day) DO UPDATE`,
recomputing the **last three days** each run rather than only yesterday, because events arrive late
(contract §3.2's retry policy explicitly allows it) and a rollup that only ever writes yesterday
silently under-reports every retried batch.

Rejected alternative: a materialized view. `REFRESH MATERIALIZED VIEW CONCURRENTLY` recomputes the
entire history nightly and needs its own unique index; a three-day upsert is O(3 days) and can run
in the same transaction as the sweep.

### 7.4 How the timeline stays fast at 10⁶ rows

Five properties, and none of them is a cache.

1. **Every query is `(agent_id, time)`-bounded.** 10⁶ is a deployment-wide number. A single agent's
   7-day window is 500–2,000 rows for the busiest shape in §7.1. The composite index makes it a
   range scan whose cost is proportional to the *window*, not to the table — so the page does not
   slow down as the deployment grows, only as the user widens the range, which is a control they
   can see.
2. **Keyset means page 40 costs what page 1 costs.** `OFFSET` would make the last page of a long
   scroll 40× the first. §6.0 rejects offset for correctness first, but this is the reason it also
   never needs revisiting.
3. **The merge reads at most `2 × (limit + 1)` rows per page** — 102 at the default 50. Two index
   scans, both stopping at 51 rows, merged in memory.
4. **There is no `COUNT(*)` anywhere in this UI, and that is a design decision.** An exact count of
   a keyset stream requires the full scan the keyset exists to avoid. So the timeline says
   "Load 50 more", never "page 3 of 412"; the day headers count only the returned window; and the
   ERRORS badge counts within the selected range, which is stated next to it. A count that is
   cheap and honest is fine; a count that is expensive and exact is not worth what it costs.
5. **The one query that could scan is closed.** `?q=%` with an unescaped `ILIKE` is an unbounded
   sequential scan any signed-in user can fire. `escapeLike()` (`app/api/admin/users/route.ts:26`)
   is mandatory, and the `to - from ≤ 90 days` cap in §6.0 bounds it even then.

**Partitioning is not proposed.** It becomes worth its complexity for `agent_run_steps` somewhere
around 10⁹ rows — roughly a decade of the fleet in §7.1, or a 30× larger fleet. Before then, the
90-day sweep keeps the table under ~100 M rows, which a two-column composite index handles without
comment. Writing this down is the point: partitioning is a decision that must be *made*, not
drifted into, and the number that would trigger it is 10⁹, not 10⁶.
---

## 8. Empty states — the common case at launch

**Nothing writes these tables today.** `agent_runs`, `agent_run_steps`, `agent_schedule_runs` and
`agent_health_samples` are all new in 0012, and every event that would fill them is PROPOSED
upstream (`RUNTIME_INTEGRATION.md` §c). On the day this ships, the empty state **is** the Activity
page for most agents. It is designed here first, not last.

### 8.0 Three rules

1. **The empty state names its cause, and the cause is computed on the server.** A client cannot
   tell "nothing happened" from "your filters excluded everything" from "the runtime is a
   simulator" — all three are `items.length === 0`. That is what `emptyReason` (§6.1) is for, and
   any view that renders a generic "no data" has thrown the information away.
2. **An empty state never shows data.** The teaching device is an *inert specimen*, governed by
   §8.8. `MOCK_DATA_AUDIT.md` exists because plausible-looking fake data outlives the sprint that
   added it.
3. **The offered action must be real.** `[ Run it now ]` appears only when the agent can actually
   run — `status = 'working'`, the runtime is `live`, and `supports("chat") === "yes"`. An action
   that 503s is worse than no action.

### 8.1 Resolution order

Evaluated server-side, first match wins:

| # | Condition | `emptyReason` |
|---|---|---|
| 1 | `agents.status ∈ {draft, provisioning, deploying}` | `never_provisioned` |
| 2 | `agentManagerMode() === "unconfigured"` | `runtime_unconfigured` |
| 3 | `agentManagerMode() === "mock"` | `runtime_mock` |
| 4 | live **and** `resolveHarness(engine).supports(<this view's capability>) === "no"` | `telemetry_unsupported` |
| 5 | any filter is set **and** the same range with no filters returns ≥ 1 row | `filtered_out` |
| 6 | otherwise | `no_data_yet` |

**Step 4 tests `=== "no"`, not `!== "yes"`, and the difference is the whole launch experience.**
Every telemetry capability on every harness is `"unknown"` today (§1.3.1) — including OpenClaw's
`runs` and `steps`. Written as `!== "yes"`, step 4 fires for **every** agent on **every** empty
view, `no_data_yet` becomes unreachable, and §8.3's "`no_data_yet` here is what most users will see
first" is false on the day it ships. It also contradicts §9.3, which says `"unknown"` means *query
anyway*: a view that queried and got nothing has learned nothing about the capability, so it says
"nothing yet", not "this runtime doesn't do that".

Step 5 is a second query — `SELECT 1 … LIMIT 1` on the same index, one per branch the filters did
not suppress — and it runs **only** when the page came back empty *and* filters were set. It costs
nothing on the common path and it is the difference between "your agent did nothing" (a lie) and
"your filters excluded 214 rows".

The view's capability for step 4: TIMELINE and RUNS → `runs`; TOOL CALLS → `steps`; HEALTH →
`health`; COST → `runs`; ERRORS → `runs`.

### 8.2 TIMELINE

| `emptyReason` | Headline | Body | Actions | Specimen |
|---|---|---|---|---|
| `never_provisioned` | Not deployed yet | This agent is still being set up. Activity starts the moment its runtime reports in. | `[ View deployment ]` | no |
| `runtime_unconfigured` | No runtime connected | This deployment has no agent runtime, so nothing can report activity. | `[ Contact your admin ]` — and, **only** for a platform role, the configuration hint | no |
| `runtime_mock` | Simulator mode | The runtime is simulated, so no real activity is recorded. What you see here is generated. | — | no |
| `telemetry_unsupported` | {harness} doesn't report this yet | {harness} can run your agent, but it doesn't send run and step detail. You'll still see messages, schedules and errors. | `[ What's supported ]` | **yes** |
| `filtered_out` | No matches | {n} things happened in this range; none match these filters. | `[ Clear filters ]` | no |
| `no_data_yet` | Nothing yet today | {name} is working and hasn't been triggered. Its next scheduled run is {when}. | `[ Run it now ]` `[ Open chat ]` | **yes** |

`no_data_yet` with **no** schedule is a different sentence, not a blank slot: *"{name} is working
and has nothing scheduled. It'll act when you message it or a channel does."* A template with an
empty hole reads as a bug.

### 8.3 RUNS — the launch default

`no_data_yet` here is what most users will see first, so it does the most teaching:

> **No runs yet**
> A run is one unit of work — a scheduled job, a message you send, or something arriving on a
> channel. Each one records the steps it took, how long it took, what it cost, and whether it
> worked.
> `[ Run it now ]`  `[ Set up a schedule ]`
> *(inert specimen run row, per §8.8)*

`telemetry_unsupported` is the honest variant and it must not be dressed up as the above: *"Runs
are recorded by the agent's runtime. {harness} doesn't send them yet, so this stays empty even
while your agent works. Messages, schedules and errors still appear on the timeline."*

### 8.4 TOOL CALLS — the empty state that means nothing is wrong

> **Nothing outside a run**
> Tool calls that happen on their own — a channel webhook, a background memory pass, an approval
> callback — land here. An empty list means everything this agent did happened inside a run, which
> is the normal case.

No specimen, no action. Padding this with a call to action would invite the user to fix something
that is not broken.

### 8.5 HEALTH

The view is **never fully empty**: the LIVENESS block reads from `agents.last_heartbeat_at`,
`config_revision` and `applied_config_revision`, none of which needs a health sample.

| Case | Copy |
|---|---|
| `sampleSource: "none"` | **No health data** — This agent's runtime hasn't reported CPU, memory or disk. Liveness below comes from heartbeats. |
| `sampleSource: "mock"` | **Simulated** — These readings are generated by the simulator, not measured. *(banner above hatched charts)* |
| `heartbeatState: "expected_silence"` | The liveness row reads **Paused — no heartbeat expected**, not a red dot. Contract §5.6 step 4. |

### 8.6 COST — two causes, never merged

| Case | Copy |
|---|---|
| no runs in range | **No spend yet** — Cost appears once runs report token usage. |
| runs exist, all unpriced | **{n} runs, no price on file** — These runs reported {tokens} tokens, but ArkAgent has no price for {model}, so cost shows as —. |

The second is the one that matters, because it is what the interim win of §6.5 produces on day one:
real runs, real tokens, `cost_micro_usd = 0`, `llm_usage.estimated = true`. Rendering that as
`$0.00` — or as "no spend yet" — tells the customer their agent is free.

### 8.7 ERRORS — the empty state that is good news

| Case | Copy |
|---|---|
| runs > 0, no incidents | **Nothing went wrong** — {n} runs in the last {range}, none failed, nothing waiting on you. |
| runs = 0 | **Nothing to report** — No runs in this range, so nothing could fail. |

The first turns an empty view into a small report, which is the only empty state on this page a
user should be pleased to see. The second exists because *"none failed"* over zero runs is a claim
the data does not support.

### 8.8 The specimen — rules, because this is where honesty gets lost

A specimen is a single inert row that shows the *shape* of what will appear.

- **Greyscale only.** No status colour, no green tick, no red border. Colour is the product's
  signal for real state, and a coloured specimen borrows it.
- **Carries the word "Example"** in the row, as a chip — not only in a caption above it.
- **`aria-hidden="true"`**, immediately preceded by an `sr-only` sentence that says the same thing
  in prose. A decorative diagram read aloud cell by cell is noise; the sentence is the accessible
  equivalent (`UI_DESIGN_V2.md` §I.4).
- **Not clickable.** No `href`, no handler, `pointer-events: none`. A specimen that opens an empty
  drawer is worse than no specimen.
- **Never uses workspace data.** Not the agent's name, not a real skill slug, not a plausible
  timestamp. Neutral placeholders only. The moment a specimen contains the user's agent's name it
  stops reading as an example.
- **One per view, maximum.** Three specimens is a mock-up.
- **Shown only for `no_data_yet` and `telemetry_unsupported`.** For `filtered_out`,
  `runtime_mock`, `runtime_unconfigured` and `never_provisioned` there is nothing to teach — the
  user either knows what a run is or has a different problem, and a specimen there is decoration
  standing where an explanation should be.

### 8.9 Localisation

Every string above is a key under `ActivityDict.empty`, four languages, written natively:

```ts
empty: Record<ViewKey, Record<EmptyReason, { title: string; body: string }>>
// ViewKey = "timeline" | "runs" | "toolCalls" | "health" | "cost" | "errors"
```

`{harness}` interpolates `harnessLabel()` (never translated); `{name}` is the agent's name;
`{when}` is `Intl.DateTimeFormat(BCP47[lang])`; `{n}` and `{tokens}` go through the locale-aware
formatter, **not** `fmtInt`, which hardcodes `toLocaleString("en-US")`
(`app/dashboard/fleet/[id]/page.tsx:879`) and must take a BCP-47 tag as part of this work
(`UI_DESIGN_V2.md` §J).
---

## 9. Degradation — what the Activity page does when the runtime is not live

There are **two independent axes**, and conflating them is how a v2 UI ends up a screen of red.

- **Mode** — `live` / `mock` / `unconfigured` (`lib/agent-manager/index.ts:33-42`).
- **Capability** — within `live`: supported / **unsupported** / failed (contract §4.4).

### 9.1 The reads are not "agent operations"

Contract §3.5 says that in `unconfigured` mode "every agent operation returns `503`". **The
Activity read routes are excepted, and this is a deliberate decision, not an oversight.**

Everything §6 queries lives in ArkAgent's own Postgres. A terminated agent's run history,
ArkAgent's own bookkeeping activity rows ("Agent paused by operator"), last month's credits — all
of it exists and is correct whether or not a runtime is reachable right now. Returning 503 would
hide records ArkAgent owns because a *different* system is down.

So:

| Surface | `unconfigured` |
|---|---|
| `GET …/activity`, `/runs`, `/tool-calls`, `/health`, `/cost`, `/incidents` | **200**, real rows, `emptyReason: "runtime_unconfigured"` when empty |
| `GET …/activity/stream` (SSE) | **503** — there is nothing to stream from |
| `Run it now`, `Re-run`, pause/resume | **503** `AgentManagerUnconfiguredError` |

*Unconfigured means we cannot act, not that we cannot remember.*

### 9.2 Per-view behaviour by mode

| View | `live` | `mock` | `unconfigured` |
|---|---|---|---|
| **TIMELINE** | as designed | Real rows. The mock chat path writes a real `agent_runs` row plus **3–5 deterministic `agent_run_steps`** seeded from the run id (`RUNTIME_INTEGRATION.md` §4.2), so the merged timeline has genuine structure to render and its layout is testable without a runtime. Persistent banner. | Real rows (ArkAgent's own bookkeeping). Banner. Live toggle hidden. |
| **RUNS** | as designed | Same synthetic runs; `trigger: "chat"`, real token counts when `isLLMConfigured()`, zero otherwise | Historic runs only |
| **TOOL CALLS** | as designed | empty — the mock emits no out-of-run tool calls, and inventing some would teach a shape that does not exist | empty |
| **HEALTH** | as designed | Synthetic samples on a sine curve seeded by `agents.id`, `source: "mock"`, **hatched and banner-ed** (§8.5) | LIVENESS block only, from `agents.last_heartbeat_at` |
| **COST** | as designed | Aggregated from the same real `llm_usage` rows the mock chat path writes, `provider: "mock"` | Historic totals |
| **ERRORS** | as designed | Only what the mock actually produced | Historic only |

**The banner is one component, three messages, and it is not dismissible.** A dismissed banner
plus generated data is indistinguishable from production. Text lives in `ActivityDict.banner`, four
languages.

**Zero outbound HTTP in mock mode**, enforced structurally by the test harness's global `fetch`
guard (`TEST_PLAN_V2.md` §C), not by discipline. This is Wave 0's stated gate and the Activity page
must not be the thing that breaks it — nothing in §6 makes a network call; every view reads
Postgres.

### 9.3 Live mode with a partially-capable runtime

This is the state the product will actually be in for months, and it is the one the three-value
`Support` type exists for.

| `supports(cap)` | What §6 does | What the user sees |
|---|---|---|
| `"yes"` | query normally | the view |
| `"unknown"` | **query anyway** — §9.3.1 says how `unknown` ever resolves | the view; `no_data_yet` when it is empty, never `telemetry_unsupported` (§8.1 step 4) |
| `"no"` | do not query; return `emptyReason: "telemetry_unsupported"` | *"{harness} doesn't report this yet"* — informational, `c.muted`, **never an error colour** |
| a `5xx`, a timeout, or a `4xx` that is not 404/405/501 | surface the failure | *"⚠ Couldn't load activity."* + `[ Try again ]`, filters preserved |

#### 9.3.1 Inbound capabilities cannot be probed, and the 404 rule does not reach them

The `404`/`405`/`501` downgrade is a real mechanism and it applies to **outbound** capabilities
only — `chat`, `sessions`, `tasks`, `channels` — where ArkAgent calls the runtime and the runtime
can answer "no such endpoint". §2.5's three identity checks are exactly those, and that is where
the rule belongs.

**`runs`, `steps`, `health`, `skills` and `context` are inbound.** ArkAgent never calls the runtime
for them; the runtime POSTs events and ArkAgent reads its own Postgres (§9.1). There is no request
to 404, so a downgrade written against them can never fire — which is how "unknown" would have
stayed unknown forever while the UI quietly behaved as if it were `no`. Their resolution is the
reverse:

| Direction | Rule |
|---|---|
| `unknown → yes` | the first time **any** row for that capability exists for this agent in this range. One `agent_runs` row proves `runs`; one `agent_health_samples` row with `source = 'runtime'` proves `health`. Observation, not assertion. |
| `unknown → no` | **only** `GET /api/categories` (§3.3), which enumerates capabilities and whose *absence* of one is a real negative. Never inferred from silence: an agent that has not run yet and a harness that cannot report runs look identical, and guessing between them is how a working feature gets a "not supported" banner. |
| persisted? | never. Both directions are per-process, so a deploy re-derives. A capability written to the database outlives the cluster it was true of. |

**`unknown` attempts the call.** Refusing outright would permanently disable Hermes' run telemetry
on the theory that nobody has verified it, and the only way anyone ever verifies it is by trying.

**A failed fetch is not an empty timeline.** Rendering zero rows over a failed request tells the
user their agent did nothing, which is a lie with the same shape as the truth
(`UI_DESIGN_V2.md` §F.1). The two states are visually distinct and the failed one keeps the
filters.

---

## 10. Files, tasks and tests

### 10.1 File manifest

| File | State | Owner task |
|---|---|---|
| `lib/harness/index.ts` | **exists** | W0-4 |
| `lib/harness/provisioning.ts` | **exists** | W0-5 |
| `lib/harness/profiles.ts` | new — §1.3.1 | W0-5 |
| `lib/harness/adapter.ts` + `adapters/{openclaw,hermes,codex,deepseek}.ts` | new — §2.3, §2.4 | **W0-5b** (proposed) |
| `lib/harness/categories.ts` | new — §3.3 | **W0-5c** — the mock path (`-1`/`-2`) is what makes the four-harness UI developable, so it cannot wait for W6; only the live `fetch` is W6 |
| `lib/harness/match.ts` | new — §4, **client-safe**, gates passed in | **W0-5c** (proposed) |
| `lib/channels.ts` | new — §1.3.1(a): `CHANNEL_TYPE_IDS` + `ChannelType`, client-safe; `channelTypeEnum` is rebuilt from it. This path and W0-4b beat `DATA_MODEL_V2.md`'s earlier `lib/channels/types.ts` under W0-7 (conflict **C15**); that document has been edited | W0-4b |
| `lib/activity/codes.ts` | new — `ACTIVITY_CODES` + `ActivityCode` (§5.6). **client-safe** | W5-2 |
| `lib/activity/severity.ts` | new — §5.2 `severityOf` / `severityBand` / `runStatusesFor`. **client-safe** — the row renderer picks its border colour from the same function the server filters with, and a second copy is a second answer | W5-2 |
| `lib/activity/timeline.ts`, `runs.ts`, `health.ts`, `cost.ts`, `incidents.ts` | new — §6, `server-only` | W5-2 |
| `lib/activity/cursor.ts` | new — §6.0 keyset codec + Zod + `keysetWhere` | W5-2 |
| `app/api/agents/[id]/activity/{route.ts,stream,runs,runs/[runId],tool-calls,health,cost,incidents}` | new — §6.0. All **under `activity/`**, matching `TASK_PLAN_V2.md` §4.1 and W5-3's file scope | W5-3 |
| `app/api/harnesses/route.ts` | new — §3.5, `requireAuth`, no `category_id` in the payload | W0-5c |
| `app/api/cron/sweep/route.ts` | new — §7.2. `GET` **and** `POST`; Vercel Cron issues `GET` (`DATA_MODEL_V2.md` §14.0) | **W5-8** (proposed) |
| `lib/i18n/activity.ts` | **created by W3-9**, extended here — §5.6, §8.9, §9.2. `REMINDERS_AND_SCHEDULERS.md` §8.1 D20: Wave 3's run history renders `status` / `skip_reason` / `error_code` and cannot ship after Wave 5, so W3-9 creates the file with the `schedule.*` namespace and W5-4 adds the run, step, health, metric and tool vocabularies | **W3-9** + W5-4 |
| `lib/i18n/harness.ts` | new — §4.4. **A sixth dictionary**; `TASK_PLAN_V2.md` §5.1 lists five | W0-5c |
| `lib/i18n/index.ts` | register both new dictionaries; §5.3's key-set gate covers them | W0-5c, W5-4 |
| `lib/validation.ts` | Zod schemas for every §6.0 query param — an unvalidated enum filter is a 500, not a 400 | W5-3 |
| `lib/db/migrations/0012_v2_runtime.sql` | §6.0's two new indexes + the `DROP` + the two **amended** contract index definitions (`agent_runs_agent_idx`, `agent_run_steps_agent_idx` — edited in place, not added beside) + the four skill columns of §6.5 | W5-1 |
| `lib/db/schema.ts` | the `_EngineIsHarness` assertion (§1.3); `pgEnum("channel_type", CHANNEL_TYPE_IDS)`; **delete** the `agent_activities_agent_idx` declaration at `:448` and replace it with §6.0's two; new column declarations | W0-4, W5-1 |
| `lib/services/agents.ts:301`, `app/api/agents/[id]/route.ts:23`, `app/dashboard/fleet/[id]/page.tsx:919` | the three surviving identity checks — §2.5 | W0-5b |
| `lib/db/seed.ts:61-63` (`roleEngine`) | `support` → `openclaw` — §4.3 | W0-5c |
| `.env.example` | `ATG_ENABLED_HARNESSES` (rename `ARK_`), `CRON_SECRET` | W0-5 |

### 10.2 Task deltas for `TASK_PLAN_V2.md` §3

Five tasks this document implies that the 58 do not cover. They need absorbing into the plan
rather than appearing as surprises.

| Proposed | Task | Wave | Size |
|---|---|---|---|
| **W0-4b** | `lib/channels.ts` + `pgEnum("channel_type", CHANNEL_TYPE_IDS)` (§1.3.1a). Absorbed into W0-4, whose whole point is "one list per enum" — `channel_type` is the second enum with the same problem and 0008 already adds its three new values, so this is a rename, not a migration | 0 | S |
| **W0-5b** | `HarnessAdapter` + the four adapters; retire the three surviving `engine === "openclaw"` checks (§2.5); `skillCompat` delegates to `deriveHarnessCompat` rather than reimplementing it | 0 | M |
| **W0-5c** | `lib/harness/match.ts` (**client-safe**, gates passed in) + `lib/i18n/harness.ts` + `GET /api/harnesses` (with `requireAuth` and per-harness `chat: Support`) + `lib/harness/categories.ts`'s mock arm; fix `roleEngine()` at `seed.ts:61-63`; A10's two `HARNESSES` corrections; A11's two `provisioning.ts` corrections | 0 | M |
| **W5-8** | `GET|POST /api/cron/sweep` — retention, health rollup, `runtime_event_receipts`, `template_generations` redact/purge, `agents.idempotency_key` clear (§7.2, and `DATA_MODEL_V2.md` §14, which owns the pass list) | 5 | M |
| **W5-9** | The ERRORS tab (§6.6) — it is a fifth view, not a filter | 5 | M |
| **W5-10** | Empty states across all six views, six reasons each, four languages, plus the specimen component (§8) | 5 | M |

W5-10 is deliberately its own task. Folded into W5-4 it becomes the thing that gets cut when the
wave runs long, and it is the only part of the Activity page most users will see in the first
month.

### 10.3 Tests

`node:test` via `tsx`, no framework. **Paths follow `TEST_PLAN_V2.md` §C.3, which mandates
`tests/unit/**` and `tests/integration/**`** — after W0-1 the `test` script globs
`tests/unit/**/*.test.ts` only (§C.4), so a suite dropped at `tests/foo.test.ts` is silently never
run, which is the exact failure W0-1 was written to fix. The four suites that need a database are
integration, not unit, and take `tests/helpers/db.ts`'s per-file ephemeral schema.

| File | Asserts |
|---|---|
| `tests/unit/harness-registry.test.ts` | `HARNESS_IDS` ≡ `engineEnum.enumValues`; `HARNESS_PROFILES` and `CATEGORY_ID` are total over `Harness`; **§1.3.2's boolean↔tri-state mapping holds for all four harnesses**; `harnessLabel()` on an unknown id returns the id, not `undefined` (the `MOCK_DATA_AUDIT` §4 item 9 regression) |
| `tests/unit/harness-provisioning.test.ts` | `categoryIdFor("codex")` **throws**; `categoryIdFor("openclaw") === 2`; `enabledHarnesses()` intersects rather than trusts; `ATG_` wins over `ARK_` **including when set to empty**; `ATG_ENABLED_HARNESSES=` yields `[]`, not everything; `ARK_` alone still works and warns once |
| `tests/unit/harness-client-safety.test.ts` | `index.ts`, `profiles.ts`, `match.ts`, `lib/channels.ts`, `lib/activity/{codes,severity}.ts` contain no `server-only`, no `process.env`, no `@/lib/db` import — a source-text assertion, because the failure it prevents is a bundle-size regression no runtime test catches |
| `tests/unit/harness-match.test.ts` | The §4.3 table reproduces a golden harness per role at fixed inputs; the ≥ 0.75 margin falls back to `defaultEngine`; a chat-unverified harness never wins; **a selected skill with `harnesses: []` excludes nobody** (§4.1 G-B); every reason code has all four languages |
| `tests/unit/activity-severity.test.ts` | `severityOf(code, params)` is total over `ACTIVITY_CODES` and every code has a dictionary entry in all four languages; the three `VARIABLE_CODES` return a different severity for different `params`, and the other 21 ignore `params` entirely; `severityBand` over all four bands covers every `(code, params)` combination exactly once |
| `tests/unit/activity-cursor.test.ts` | Round-trip; a truncated, a reordered and a foreign-agent cursor all produce **400**, never a throw; `keysetWhere` emits `<` for the cursor's own kind, `<=` for the kind that sorts after it and strict `<` for the kind that sorts before |
| `tests/integration/activity-keyset.test.ts` | Against a seeded fixture: paging the whole range yields every row exactly once; **a run row and an activity row sharing an `occurredAt` to the microsecond are both returned, in either page order** — the §6.0 defect; **inserting rows at the head between page 1 and page 2 does not duplicate or skip** — the property §6.0 chose keyset for |
| `tests/integration/activity-filters.test.ts` | A run-only filter (`trigger`) suppresses the activity branch and vice versa; `severity=warning` returns **no runs**; `severity=error` returns both a `failed` run and an `error.raised` row whose `params.severity` is `error`, and **not** one whose `params.severity` is `warning`; `?q=` matches a substring, not only an exact summary |
| `tests/integration/activity-empty.test.ts` | The §8.1 resolution order returns the right `emptyReason` for all six conditions on all six views; a `runs: "unknown"` harness with no rows yields `no_data_yet`, **not** `telemetry_unsupported` |
| `tests/integration/activity-cost.test.ts` | Micro-USD sums match a hand-computed fixture exactly (W5-2's stated gate) **and are `typeof "number"`, catching the postgres.js string-aggregate trap of §6.0**; an unpriced run renders `—`, never `$0.00`; day bucketing uses `workspaces.timezone`, verified across a UTC+8 midnight; an invalid stored timezone falls back to UTC instead of 500ing |
---

## 11. Amendments requested, open questions, and risks

### 11.1 Amendments this document requests

None of these is a new event type or a new migration slot. Each names the section it changes.

| # | Document | §  | Change |
|---|---|---|---|
| A1 | `BACKEND_INTEGRATION_CONTRACT.md` | §3.4 | Add `usage.recorded` to the activity code registry. **The contract already requires it** — `agent.usage`'s DB effect names it — and the registry omits it, so as written the contract mandates a code it does not define. |
| A2 | `BACKEND_INTEGRATION_CONTRACT.md` | §3.4 | Add the nine other codes of §5.5, and **widen `error.raised`'s registered `params` from `{errorCode}` to `{errorCode, severity, retryable}`** — both fields already exist on the `agent.error` event, and the narrow registry row is what makes an ingest handler drop the field §5.2's severity predicate reads. All are derived from existing events; the backend team's work does not change. |
| A3 | `BACKEND_INTEGRATION_CONTRACT.md` | §3.3 | **Edit two index definitions in place** — not add statements beside them, which fails 0012 with `already exists` on a fresh replay: `agent_runs_agent_idx` → `(agent_id, started_at DESC, id DESC)` and `agent_run_steps_agent_idx` → `(agent_id, occurred_at DESC, id DESC)`, both for the keyset tiebreak (§6.0, §6.3). |
| A3b | `BACKEND_INTEGRATION_CONTRACT.md` | §3.4 | `agent.tool_call`'s ingest also writes `params.stepId` (= the step's `external_step_id`, i.e. the `eventId`) onto the `tool.denied` activity row. ArkAgent-side only, no wire change; it replaces §6.3's four-term correlation join with an equality on a unique key. |
| A4 | `BACKEND_INTEGRATION_CONTRACT.md` | §3.3, §3.4 | Add `skillSlug` / `source` / `ownerHandle` / `version` to `agent.run_step` and four nullable columns to `agent_run_steps`. `agent.tool_call` has them; `run_step` does not; and §3.4 tells the runtime to use `run_step` inside a run — so the in-run path loses the attribution `RunStepDTO.skillRef` needs. Additive ⇒ stays `v: 1`. |
| A5 | `UI_DESIGN_V2.md` | §F | Fifth tab, **ERRORS** (§6.6). It unions three sources the timeline filter cannot union, and it is the view opened during an incident. |
| A6 | `UI_DESIGN_V2.md` | §F.5 | `HealthSampleDTO.source` gains `"rollup"` (§7.2). |
| A7 | `UI_DESIGN_V2.md` | §F.4 | The *by skill* grouping is **tokens**, not cost, with a header and caption that say so (§6.5). |
| A8 | `TASK_PLAN_V2.md` | §3, §4, §5.1 | The five task deltas of §10.2; `ATG_ENABLED_HARNESSES` confirmed as the name with `ARK_` as a one-release alias (§3.4); **§5.1's five new i18n dictionaries become six** — `lib/i18n/harness.ts` (§4.4) — and `lib/i18n/activity.ts` moves from W5-4 to **W3-9** (`REMINDERS_AND_SCHEDULERS.md` D20); §4.2's `lib/db/schema.ts` row gains the `channel_type` inversion of §1.3.1(a). |
| A9 | `lib/db/seed.ts` | `:61-63` | `roleEngine()`: `support` → `openclaw` (§4.3). |
| A10 | `lib/harness/index.ts` | `:96`, `:145` | §1.3.2: `openclaw.selfImproving` → `true`, `deepseek.codeNative` → `false`. The second is a live copy bug — `codeNative` renders "specialised for code" in the hire wizard for a harness the contract describes as files-and-network only. |
| A11 | `lib/harness/provisioning.ts` | `:55-57`, `:70-72` | `isProvisionable()` becomes mode-aware so mock mode can offer four harnesses (§3.3); `enabledHarnesses()` distinguishes **unset** from **set-but-empty**, which today both fail open (§3.4). |
| A12 | `UI_DESIGN_V2.md` | §F.1 | The filter param list grows `severity`, `type`, `session`, `run`, `model` and `channel` (§6.1), and the search placeholder becomes *"Search run summaries"* — `q` cannot match a v2 activity row, whose `text` is `''`. |

### 11.2 Open questions

Ordered by what they block. CONFIRM-n are the contract's; the rest are new.

| # | Question | Blocks |
|---|---|---|
| **CONFIRM-5** | `category_id` for `codex` and `deepseek` | Provisioning for half the advertised harnesses. `categoryIdFor()` throws until answered — which is correct, and also means those two harnesses ship as UI with no runtime. |
| **CONFIRM-6 / -7** | Per-harness `docker` / `selfImprove` / channels on Hermes and DeepSeek | Whether the config editor shows switches that do nothing. Until answered, `dropped[]` says "unverified" (§2.4), which is honest but is not an answer. |
| **CONFIRM-9** | Can the Manager reach `app.arkagent.com` at all? | **Everything in Part 2.** Every table §6 reads is filled by events the runtime POSTs to us. No egress ⇒ no Activity page, ever, in any mode but mock. This ranks above every other item in this document. |
| **Q-A** | Is *"generate and store a Codex template but refuse to provision it"* the intended launch behaviour? (`TASK_PLAN_V2.md` §8.2 item 5) | §3.5's three-state UI. A "no" deletes `codex`/`deepseek` from 0007 and §3–§4 shrink to nothing. |
| **Q-B** | What is `settings.heartbeatMinutes`' default, and is it pushed to the runtime? | §6.4's `heartbeatState` thresholds (3× stale, 10× dead) are ratios of a number ArkAgent stores and, per the gap table, **has never sent anywhere**. If the runtime's real cadence differs, every agent reads stale or every stale agent reads healthy. |
| **Q-C** | Does the runtime emit `sender: "user"` on `agent.message` from day one? | §5.5's `message.received`. Without it the feed is a monologue and no amount of ArkAgent-side work fixes it. |
| **Q-D** | Should `agent.run_step.detail` be retained at all after 90 days? | §7.2. The 90-day delete is a judgement about a debugging artefact; a compliance requirement would override it and would need a slot for a `detail_evicted` flag. |

### 11.3 Risks

1. **The Activity page's data source does not exist.** Every table §6 queries is new, and every
   event that fills them is PROPOSED upstream (`RUNTIME_INTEGRATION.md` §c). The realistic v2.0
   outcome is a beautifully-specified page showing §8's empty states for months. **The mitigation
   is §6.5's interim win** — persisting `responseId` + `usage` from the SSE stream ArkAgent
   *already* receives, which makes COST and the `chat` half of TIMELINE real with no upstream
   change. It is the only part of Part 2 that does not depend on anyone else, and it should be
   built first, not last.
2. **Two of four harnesses cannot be provisioned, and the UI advertises four.** `codex` and
   `deepseek` reach the hire wizard as disabled options with a translated reason (§3.5). That is
   the honest treatment, and it is also a product surface that says "coming soon" to a paying
   customer. If CONFIRM-5 is not answered before launch, consider shipping two harnesses.
3. **Hermes is unverified end to end.** Its chat path has never been run, its `access_url` implies
   an interactive login OpenClaw does not need, and its `agent_manager_config.provider` is written
   as `"openclaw"` today. §2.4 routes it through the `unsupported` state, which is honest — but a
   customer who hires Hermes and cannot chat will not read it that way. **Verify before launch or
   gate it behind `ATG_ENABLED_HARNESSES`.**
4. **`enabledHarnesses()` fails open when unset.** Unset means "every provisionable harness". That
   is the right default for existing deployments and the wrong one for a dark launch, which is why
   the `ARK_` → `ATG_` rename must keep the alias (§3.4). A silent rename converts a deliberate
   allowlist into an open gate on the next deploy.
5. **The severity table is ArkAgent's editorial judgement and it will be wrong somewhere.** §5.2
   deliberately denies the runtime the ability to grade its own events. The cost is that a code we
   graded `info` may be the one an operator needed to see. It is a one-line change in a lookup
   table with no migration — which is the reason it is a lookup table.
6. **`params` is untrusted third-party text interpolated into a localised sentence.** The contract
   says a `params.name` of `</span><script>` must render as a string on all four renderings.
   Everything on this page — activity rows, step titles and details, run summaries, skill slugs,
   `senderLabel` — is model- or third-party-authored. Text nodes only, no `dangerouslySetInnerHTML`
   anywhere in `lib/activity/**` or the Activity components, and no URL in a `detail` becomes an
   `href`.
7. **The health rollup is the only thing standing between this design and an unbounded table.** At
   1,440 rows/agent/day it is 60 % of everything written. If W5-8's sweep job slips, the first
   symptom is not a slow page — the range scans stay fast — it is disk. Ship the sweep in the same
   wave as the tables.
8. **`agent_activities.text` stays `NOT NULL`.** V2 rows write `''`. Any code path that renders
   `text` without first checking `code` will draw blank rows for every v2 event, which is
   `TASK_PLAN_V2.md`'s conflict C8 and W5-4's stated acceptance check. It is worth restating here
   because §6.1's `q` filter is the one place this document deliberately searches `text` — and it
   must therefore never be described to the user as searching activity.
