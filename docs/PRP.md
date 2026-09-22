# ArkAgent v2 — Product Requirements Prompt

**Status:** the product-side reference point for the v2 corpus. It does **not** override
`docs/TASK_PLAN_V2.md`, which stays normative on engineering: migration order, conflict
resolutions, wave contents. Where this document and the task plan disagree about *what to build*,
raise it as a conflict; where they disagree about *how*, the task plan wins.

**What this document is for.** The product owner's original request was a run-on paragraph of ten
requirements. §1 is that request rewritten as a brief a cold team could execute from. §2 records
every interpretation I made and what I would have asked instead. §3–§8 are the product spec proper.

**Its one structural job.** `docs/TEST_PLAN_V2.md` §0.3 says plainly that because no PRP existed,
that plan *defines* the acceptance-criterion namespace and publishes the mapping in its §B.13.
This document now references those identifiers rather than minting new ones. **§B.13 stands
unedited.** Every `AC-*` id in §5 below is taken from it verbatim; nothing in this document
requires a change to any test-case row.

**Reading order for the product owner:** §1 (the brief), §2 (what I assumed on your behalf),
§8 (the eleven things only you can decide). Everything between is for the team.

**State of the tree, re-verified 2026-08-29 against the working copy.** Several defects this
document was originally written against have since been fixed, and three documents it treated as
missing now exist. Where a claim below says "today", it has been re-checked. Specifically:
`npm test` is quoted, carries `NODE_OPTIONS=--conditions=react-server`, and reports **89 pass /
0 fail**; `npm run typecheck` exists; `engineEnum` is four-valued and built from
`lib/harness/index.ts`, with `lib/harness/provisioning.ts` throwing `HarnessNotProvisionableError`
on an unmapped harness; `agentManagerMode()` resolves `unconfigured` in production
(`lib/agent-manager/index.ts:33-42`); `getBillDatasets` is gone, replaced by
`lib/services/billing.ts` + `app/api/billing/usage/route.ts`; `channelDefs[].note` and its
"USED BY NOVA" string are gone; both false pricing claims are cut from all four locales;
`document.documentElement.lang` tracks the language (`lib/store.tsx:215-218`);
`lib/db/migrations/0007_v2_enum_values.sql` exists; and `docs/DATA_MODEL_V2.md`,
`docs/REMINDERS_AND_SCHEDULERS.md` and `docs/HARNESSES_AND_ACTIVITY.md` have all been written.
`docs/README_V2.md` still says the last three do not exist; that index is stale, not this section.

---

## 1. The rewritten prompt

Copy the block below verbatim into a fresh session, a contractor's statement of work, or the top of
a sprint plan. It is self-contained: it names the product, the users, the ten deliverables, the
decisions that resolve the original's ambiguities, the constraints, what is explicitly not being
built, and how "done" is judged.

```text
ARKAGENT v2 — PRODUCT REQUIREMENTS PROMPT

CONTEXT
ArkAgent is the control plane and system of record for autonomous AI agents that run on
remote VMs owned by an external Agent Manager. ArkAgent never executes an agent: it writes
rows, and a backend service the customer's team owns reads those rows and runs the work.
Stack: Next.js 16 App Router, React 19, TypeScript, Postgres via Drizzle, deployed on Vercel.
Four harnesses, and only four: OpenClaw, Hermes, Codex Harness, DeepSeek Harness.
Four UI languages, all first-class: en, zh, zht, ja.

MISSION
Take ArkAgent from a demo-grade prototype to something a stranger can sign up for, pay for
and trust. Four moves: (a) delete every fabricated number from every screen a customer sees;
(b) make agent creation template-driven and AI-guided instead of a blank five-field form;
(c) give agents schedules, an editable configuration surface, and honest observability;
(d) ship a curated Skill Repository that the generator draws from and a human can browse.

BUILD — ten deliverables
1. MOCK-DATA CLEANUP. Every number on every screen traces to a Postgres row or is absent.
   Kill the billing chart fiction, the fake agent roster, the cross-tenant "USED BY NOVA"
   channel note, and the two unbacked pricing claims. Keep the four fixtures that are
   actually the no-LLM-key fallback; they are catalogue, not mock. A brand-new empty
   workspace is the acceptance environment for the whole release.
2. AI GUIDANCE. One docked assistant component, present on the hire wizard, the template
   gallery, the skill browser and the agent config page. Its replies carry typed action
   chips that patch the form behind it. Chips are RESTRICTIVE-ONLY: no chip may enable a
   tool, raise autonomy, raise a spend limit, or attach a high-risk skill. With no LLM key
   it degrades to a curated guide with the same chips, in the same place — never disappears.
3. TEMPLATE-DRIVEN CREATION. Picking a template routes to the hire wizard pre-filled at the
   brief step; the generator runs when the user asks for one, producing all six sections at
   once — ROLES, AGENTS, SKILLS, RULES & BOUNDARIES, CONTEXT (file upload + pasted text),
   REMINDERS & SCHEDULERS. A gallery click never provisions a VM.
4. REMINDERS & SCHEDULERS. Users say when in their own language; the product shows the
   interpretation, the next five fire times, and the timezone before saving. Build on the
   finished cron engine in lib/schedule/**. Dispatch is exactly-once per scheduled instant
   under concurrent ticks, DST-correct, and cannot be wedged by a failed run.
5. AGENT CONFIG MANAGEMENT. A two-pane editor over nine sections, replacing today's settings
   tab. Concurrency is detected on a config revision, not on a parent row's updated_at.
   No secret is ever serialised into a client payload.
6. RICH ACTIVITY. Timeline, run drill-down with an ordered step trace, health, cost — served
   entirely from the database, filterable, cursor-paged, and identical in shape for all four
   harnesses. Activity rows are stored as a code plus parameters and rendered per language at
   read time, never as prose frozen at ingest.
7. AGENT TEMPLATE GENERATOR. A ten-stage pipeline in lib/atg/** that emits one validated
   AgentTemplateDraft. The model never names a skill; it names capabilities, and a database
   query turns capabilities into version-pinned identifiers. Per-stage deterministic fallback.
8. SKILL REPOSITORY. A curated catalogue of ~101 real skills with deterministic risk scoring,
   a browsable /dashboard/skills, and a locked-down sync pipeline. Nothing a crawler finds is
   customer-visible until a human publishes it.
9. TEMPLATE PAGE. Build BOTH: a new /dashboard/templates gallery with card and list views,
   filters and a detail drawer; AND rewire the hire wizard's role step to consume templates.
10. CONTRAST & WEIGHT. Re-specify the four-tier text ramp to 13 / 9.5 / 7 / 4.5:1 floors across
    all six palettes and all four surfaces, add real weight tokens, and forbid the faintest
    tier from ever carrying a sentence a user must read to operate the product.

STANDING DECISIONS — assumptions made to unblock; overturn only in writing
A1  "Production ready" means the CONTROL PLANE is production ready. The runtime backend does
    not exist yet. Ship a product that is complete, honest and useful with no Agent Manager
    and no LLM key; when unconfigured in production, 503 rather than simulate.
A2  "Better UI" means measured contrast and weight, not a redesign. No new layout language,
    no component library, no Tailwind.
A3  The generator produces a reusable TEMPLATE, not an agent. Materialisation is a separate,
    explicit, idempotency-keyed act because it provisions a VM and bills a seat.
A4  "Safe" skill is a deterministic arithmetic band (low/medium/high) over capability blast
    radius plus trust modifiers, with floors popularity cannot launder away. A human publishes;
    an LLM may only raise a band, never lower one.
A5  "Harness system" in the original means the same four harnesses named everywhere else.
    There is no fifth thing called Harness.
A6  Codex and DeepSeek can be generated, stored and configured but NOT provisioned until the
    Manager has a category id for them. Refuse loudly at launch; never silently substitute.
A7  Every AI feature has a deterministic no-key path that produces the same output SHAPE.
    Every runtime feature has a mock path. Both are tested in CI, not aspirational.
A8  Untrusted text — skill bodies, another tenant's template, uploaded context, runtime output
    — is data everywhere. It renders as text nodes and never reaches a system prompt.
A9  Cross-workspace access returns 404, never 403.
A10 Uploaded context is text-only at launch (txt/md/csv/json) unless the storage decision in
    the open questions lands first. No new runtime npm dependency for parsing.
A11 The demo account does not ship. Seeding it in production throws.

HARD CONSTRAINTS
Inline style objects reading CSS custom properties via lib/theme.ts. No Tailwind, no CSS
modules, ever. Every user-visible string in a per-screen dictionary under lib/i18n/ in all four
languages, written natively, with a compile-time key-set equality gate. Zod v4. server-only on
server modules. DB access only in lib/services/** and route handlers. No new runtime npm
dependencies. Node 24. Harnesses are exactly openclaw | hermes | codex | deepseek.

OUT OF SCOPE FOR v2
Agent-to-agent orchestration. A public template marketplace with ratings or payments. Skill
authoring or an upload path. Landing, auth, billing, payment and admin layouts (they inherit
the new tokens only). Mobile apps. SSO beyond what exists. Credit rollover and free trials
unless the open questions resolve to implement.

DEFINITION OF DONE
A brand-new workspace, on a deployment with no LLM key and no Agent Manager, can: browse
templates and skills; generate a template; review and edit all six sections; save it; launch an
agent from it; edit that agent's configuration; create a schedule and see when it will next
fire; and open an Activity page that shows honest empty states — in four languages, across six
palettes, at 1440/1024/375, with every contrast floor met, and with zero outbound network
requests. Nothing on any screen is invented.

HOW TO WORK
docs/TASK_PLAN_V2.md is normative on engineering: read its §1 conflict ledger before trusting any
sibling design, and its §2.1 before writing a migration. Seven waves, 67 tasks; Wave 0 gates
everything. Do not re-specify what is already built: lib/schedule/** is a finished, tested cron
engine, and the four specs TASK_PLAN §0 called missing all now exist — DATA_MODEL_V2.md owns slots
0007-0012, REMINDERS_AND_SCHEDULERS.md owns schedule execution, HARNESSES_AND_ACTIVITY.md owns
harness adapters and activity telemetry. Re-grep the audit by symbol name, never by line number.
```

*(Brief above: ~1,220 words — sized to be pasted whole, not summarised.)*

**One caveat if you paste this brief into a cold session:** deliverable 1's four named targets are
no longer all live. The billing chart, the "USED BY NOVA" channel note and both pricing claims are
already fixed; the fake agent roster in `lib/data.ts` is not. See §5 F1 for what remains, and the
state-of-the-tree note at the top of this document for the rest.

---

## 2. Ambiguity ledger

Every phrase in the original request that could have been built two ways. Columns: what was said,
what I decided it meant, why, and the question I would have asked if asking had been free. The
**Confidence** column is honest — `guess` means I would not defend this one hard, and it is
mirrored into §8 as an open question.

### 2.1 "I want this to be production ready" — for a product whose runtime does not exist

| | |
|---|---|
| **Decision** | Production ready means **the control plane is production ready**, judged on a deployment with `AGENT_MANAGER_MODE` unset and `OPENROUTER_API_KEY` unset. Everything persists, every screen renders, every AI feature falls back deterministically, and anything requiring a runtime returns **503 with an explanation** rather than a simulated success. |
| **Why** | `docs/research/RUNTIME_INTEGRATION.md` §0 is unambiguous: there are two integration surfaces and only one is real. `getAgentManager().updateAgent()` is a no-op against the actual Manager, and its failure is swallowed by a `try {} catch {}` whose comment says "webhook will reconcile" — and no webhook ever arrives. Nothing today tells the Manager what `agents.id` is, so **no inbound event can route**. A definition of "production ready" that required working telemetry would be unachievable by this team alone. A definition that permitted simulation would ship the exact defect `MOCK_DATA_AUDIT.md` calls its highest-severity finding: `AGENT_MANAGER_MODE` unset yielding the in-process simulator **in production**, so an agent reports `working` and invents a VM id while the customer is billed for a seat. **That one is fixed** — `agentManagerMode()` (`lib/agent-manager/index.ts:33-42`) now returns `unconfigured` and `getAgentManager()` throws `AgentManagerUnconfiguredError`. The live risk has inverted and is now TC-153: the resolver still gates `live` on `AGENT_MANAGER_BASE_URL`, which `RUNTIME_INTEGRATION.md` §4.1 repoints to `OPENCLAW_MANAGER_API_URL`/`_API_KEY`, so a *correctly configured* v2 production deploy would 503 on every agent route. W6-2 must repoint the resolver, not just harden it. |
| **Rejected** | "Production ready = agents actually run." Not reachable from this repo; it is a different team's roadmap, and blocking on it would mean shipping nothing. |
| **Would have asked** | "Is there a date by which the Manager will accept a registration call and emit signed events, and is there egress between the two networks at all?" (→ §8.3) |
| **Confidence** | firm |

### 2.2 "a better UI" / "the font color is too grey" (items at the top and item 10)

| | |
|---|---|
| **Decision** | A **measured contrast and weight uplift**, not a redesign. Re-specify the four-tier ramp with explicit floors (13 / 9.5 / 7 / 4.5:1) against **all four** surfaces in **all six** palettes, add weight tokens as CSS variables, and forbid `--c-faint` from carrying a sentence. Layout, information architecture and visual language stay. New screens (templates, skills) are new because they did not exist, not because old ones were re-imagined. |
| **Why** | The complaint is falsifiable, so treat it as a bug rather than taste. `UI_DESIGN_V2.md` §A.0 shows `app/globals.css:59-64` carries a comment asserting AAA body ink and AA mono tiers — **and that claim is false in five of six palettes**, with ivory-light `faint` at **2.28:1**. Two latent bugs fall out of the same audit and are strictly worse than greyness: `--c-green-ink` renders white on bright green at **1.97:1**, and `app/layout.tsx:32-37` requests Newsreader in `style:["italic"]` only, so **every Ivory heading in the product currently renders in Georgia**. Fixing measurable defects is a better use of the sentence "better UI" than a re-skin nobody asked to review. |
| **Rejected** | Adding a fifth text tier so the faint one could stay dim: 185 call sites would each need a judgement call, and the ramp stops being scannable. |
| **Would have asked** | "Is 'better UI' about legibility, or about the product looking unfinished? If the second, name one screen that offends you." |
| **Confidence** | firm on the diagnosis, **medium** on the scope — if the owner meant "it looks like a prototype", contrast alone will not satisfy them. |

### 2.3 "Redesign the Template page" (item 9) — the hire wizard's role step, or a new gallery?

| | |
|---|---|
| **Decision** | **Both, and they are different objects.** Build `/dashboard/templates` as a first-class gallery over `agent_templates` with card and list views, filters and a detail drawer; and rewire `app/hire/page.tsx` step 1 so the wizard consumes templates instead of the five-field role tile. The gallery's CTA routes to `/hire?template=<id>` pre-filled at step 2 — it **does not create an agent**. |
| **Why** | The original says "show more information about the template, view in cards and list views", and today's only template-ish surface is the hire wizard's role roster: five fields from `agent_roles` (`mono`, `name`, `blurb`, `hue`, `minPlan`), which answers *"what job title?"* and nothing else (`UI_DESIGN_V2.md` §B.0). Card/list views, filters and a drawer do not fit inside a wizard step, and a wizard step is not linkable, shareable or browsable. But leaving the wizard on `agent_roles` would mean the richer object is invisible at the exact moment the user is choosing. Splitting them also enforces the rule that matters: **a gallery click must never provision a VM** — creating an agent is billable and not undoable within a toast window. |
| **Rejected** | Gallery only, with `/hire` retired. The wizard carries channel selection, plan tier and the launch sequence; folding it into a drawer would make the highest-stakes action in the product a side panel. |
| **Would have asked** | "When you say Template page, are you looking at the hire wizard or imagining a new page in the sidebar?" |
| **Confidence** | firm — the corpus already builds both, and both have owners. |

### 2.4 "top and popular and safe SKILLs" (items 7 and 8) — what is safe, and who decides?

| | |
|---|---|
| **Decision** | Three separate things, decided separately. **Top/popular** is evidence: stars, verified downloads, publisher identity — displayed, never trusted. **Safe** is a deterministic arithmetic band computed with no LLM: capability blast radius (0–10 by what the skill can reach) plus trust modifiers (vendor-published −3, clean scan −2, stale >12 months +2, undeclared env vars +3, undeclared network host +4), clamped and banded low ≤2 / medium 3–6 / high ≥7, with **floors that popularity cannot undercut** — anything that moves money, transacts on-chain, publishes publicly, controls a desktop, drives an authenticated browser, brokers credentials or auto-updates is never below `high`. **Who decides** is a human: everything a crawler finds lands in `draft` and is invisible to customers until someone flips it to `published`. An LLM reviewer, where configured, may only **raise** a band. |
| **Why** | The three words are not synonyms and the original treats them as one. ClawHavoc (Feb 2026) poisoned somewhere between 335 and 1,184 ClawHub skills; the publishers looked reputable, which is precisely why an auto-publish trust threshold was rejected. `@steipete/github` has 196,851 downloads and a clean scan verdict and still inherits the operator's entire `gh` scope — popularity laundered into safety is the specific failure the floors exist to stop. Determinism is also a hard requirement: the rubric has to reproduce all 101 seeded bands exactly, or the first sync silently rescores the catalogue and flips a drift warning on every already-attached skill. |
| **Rejected** | "Ask a model whether this skill is safe." The input to that call is the attack. It fails open. |
| **Would have asked** | "Who on your side owns publishing a skill to customers, and what is their SLA? The pipeline is designed but the queue needs a human." (→ §8.10) |
| **Confidence** | firm on the rubric, **guess** on the operating model — a review queue with nobody staffed on it is a catalogue frozen at 101 entries. |

### 2.5 "generate templates" (item 7) — a reusable TEMPLATE, or one configured AGENT?

| | |
|---|---|
| **Decision** | The generator produces a **reusable, persisted, forkable `AgentTemplateDraft`**. Turning one into a live agent is a **separate, explicit, idempotency-keyed act** — `POST /api/templates/{id}/materialize`. |
| **Why** | The original says both things in one paragraph: item 3 wants "create an agent from the template agent", item 7 wants a generator that builds "templates". They are reconcilable only if generation and instantiation are two steps. And they must be: materialisation writes eleven tables in one transaction, bills a `subscriptions` seat, increments `workspaces.credits_included` and provisions a VM. That is not a thing to do speculatively while a user is still reading. The two-step shape also buys the features the owner asked for elsewhere — a gallery to browse, a fork path, and a template that materialises identically a year later because the stored `draft` is the only input. |
| **Rejected** | One-click instantiate with an undo toast. Provisioning is not undoable inside the toast window. |
| **Would have asked** | "When someone generates a template, do you expect it to appear in the gallery for their whole team, or is it private scratch work?" (default chosen: private; workspace/public are explicit visibility changes) |
| **Confidence** | firm |

### 2.6 "OpenClaw, Hermes, and Harness system" (item 8) vs the four named harnesses (item 6)

| | |
|---|---|
| **Decision** | Item 8's "Harness system" is a compression of the same four names in item 6 — OpenClaw, Hermes, **Codex Harness**, **DeepSeek Harness**. There is no fifth product. The Skill Repository covers all four. |
| **Why** | Item 6 enumerates four and says "please support all these four"; item 8 lists two proper nouns and one category word that is the suffix of the other two names. The research settles it in the direction that makes the ambiguity irrelevant: **all four harnesses read the same agentskills.io `SKILL.md` from `.agents/skills/`**, so there is no per-harness skill format to build. Harness is a *runtime dependency* facet (does this VM have `node`, does this env var exist), not a format facet — which is why compatibility is recorded as an assertion with a basis (`declared` / `verified` / `inferred` / `unknown`) and never as a silent default of `true`. |
| **Rejected** | Treating "Harness" as an umbrella needing its own catalogue partition. It would have produced three catalogues where one is correct. |
| **Would have asked** | "Is 'Harness system' shorthand for Codex + DeepSeek, or a third thing I have not seen?" |
| **Confidence** | firm |

### 2.7 "clean up the mock data" (item 1) — delete everything that looks fake?

| | |
|---|---|
| **Decision** | **No.** Four classes, not one: DELETE pure fiction (10 findings), REPLACE-WITH-QUERY where the UI genuinely needs the data (6), KEEP the env-gated fallbacks and reference catalogues (18), KEEP-BUT-GATE the demo-only rows (7). |
| **Why** | Several of the most fixture-looking things in the repo are the thing that makes the no-LLM-key constraint true. `genTexts` in `lib/data.ts` *is* the deterministic fallback that `POST /api/agents/generate-brief` returns verbatim when no key is set; deleting it makes the hire wizard return empty strings on every keyless deployment. `rolesData` is the only source for the `agent_roles` catalogue and the fallback when the Manager is unreachable. `lib/payments/config.ts`'s mock mode is the reference implementation of a correctly gated mock and is what stops production handing out paid seats for free. `MOCK_DATA_AUDIT.md` §4 lists twelve of these; it is the half of that document that matters. |
| **Rejected** | A repo-wide grep-and-delete on `mock|demo|fixture`. It would have removed four load-bearing systems and broken every non-live deployment including CI. |
| **Would have asked** | Nothing — the audit already answers it. |
| **Confidence** | firm |

### 2.8 "a lot more detailed information" about activity (item 6)

| | |
|---|---|
| **Decision** | Four tabs — **TIMELINE / RUNS / HEALTH / COST** — all served from Postgres, with a run→step drill-down, composable filters and cursor paging. Ship it with **honest empty states before it has data**, and render any `source='mock'` sample visibly distinctly, never charted as real. |
| **Why** | "More detail" has an obvious failure mode here, and it is named as risk R3 in the task plan: the telemetry this page draws does not exist yet — runs and steps are marked PROPOSED upstream — so the temptation is to seed plausible rows so the page demos well. That is the same defect as the billing chart, rebuilt on a bigger canvas. The structural fix is in the data model: activity rows carry a `code` plus `params` and are rendered per-language at read time, because prose written at ingest freezes one of four languages forever. |
| **Rejected** | A single infinite feed. It cannot answer "why did the 08:30 run cost $0.34", which is the actual question. |
| **Would have asked** | "When your backend populates logs, will it send us a run/step model or a flat event stream? The design assumes runs." |
| **Confidence** | firm on shape, **medium** on whether the backend will emit the run/step structure the drill-down needs. |

### 2.9 "user can tell the agent when to do what and expect what to happen" (item 4)

| | |
|---|---|
| **Decision** | Three artefacts, not one: **when** (a validated cron plus IANA timezone), **what** (a prompt injected as a *user* turn, never as a system instruction), and **expect** (an explicit `deliverTo` — where the result lands — plus a `maxRunsPerDay` circuit breaker). Natural language in all four languages is a first-class input; the interpretation, the next five fire times and the timezone are shown before save. |
| **Why** | "Expect what to happen" is the half most designs drop, and it is the second question every user asks after *when*. The prompt boundary is a security decision, not a style one: `agent_schedules.prompt` is user-authored and, for generated templates, model-authored — treating it as a system instruction would make the generator a privilege-escalation path into every scheduled run. |
| **Would have asked** | "If a scheduled run produces nothing worth reporting, do you want silence or a heartbeat?" (default chosen: silence; failures always notify) |
| **Confidence** | firm |

### 2.10 "All the agent set up information should be written to the database"

| | |
|---|---|
| **Decision** | Read literally and made a release gate: **every** piece of agent setup — roles, agents, skills, rules, context, schedules, channels — is readable from Postgres alone, with no browser-only state, and the backend team gets one document (`BACKEND_INTEGRATION_CONTRACT.md`) that names every table and column plus a single `AgentManifest` projection so they never have to reverse-engineer a join. |
| **Why** | It is the one line in the original that is unambiguous and it constrains the data model more than anything else in the request. It is also already violated in two places: skills live as a string array inside `agents.settings` JSONB (which cannot express a version or a provenance), and the config editor's save path never reaches the runtime at all. |
| **Confidence** | firm |

### 2.11 "have the test teams to run the full test"

| | |
|---|---|
| **Decision** | Interpreted as **executable gates, not a manual QA cycle**: `node:test` through `tsx` with ephemeral per-file Postgres schemas built from the real migrations, injected LLM and runtime doubles, and a global `fetch` guard that makes "zero outbound requests in mock mode" structural rather than a promise. The manual matrix is limited to what a machine genuinely cannot assert: appearance across 6 palettes × 4 languages. |
| **Why** | There is no test team. The defect that motivated this — the unquoted glob in the `test` script dropping every top-level test **while exiting 0** the moment a subdirectory appeared under `tests/` — is **fixed** (W0-1/W0-2): the script is now `NODE_OPTIONS=--conditions=react-server tsx --test "tests/**/*.test.ts"`, `tests/_probe/` exists, and the suite reports **89 pass / 0 fail**. A "full test" that reports success on zero tests is worse than no tests, which is why the *same* failure mode is still open one level up: **there is no `test:integration` script in `package.json` at all**, and `TASK_PLAN_V2.md` §6.1 and §7.9 below both gate on it. Creating it, and making CI fail when it reports zero non-skipped tests, is a prerequisite of every integration acceptance check in this document, not a Wave 6 nicety. |
| **Confidence** | firm |

---

## 3. Scope

Reconciled line by line against `TASK_PLAN_V2.md` §3. **The rule I held myself to: if no wave
builds it, this document does not promise it.** Every IN row names the wave that delivers it.

### 3.1 In scope for v2

| # | Commitment | Waves | Notes |
|---|---|---|---|
| 1 | Mock-data cleanup; honest billing usage; landing and channels de-fiction; seed hardening | W0-8 … W0-12 | The audit's classes A and B, in the audit's dependency order |
| 2 | Four-harness enum end to end, with provisioning that refuses rather than substitutes | W0-4, W0-5, W6-2 | 13 hardcoded two-value unions removed |
| 3 | Test-harness repair, `typecheck` script, fresh-replay migration CI | W0-1, W0-2, W0-6 | Without this, every later gate is unfalsifiable |
| 4 | Contrast + weight uplift across six palettes; `--c-border-field`; focus-ring fix; component promotion | W1-1 … W1-6 | Prerequisite for all new UI |
| 5 | Skill Repository: schema, 101-entry seed, deterministic safety scorer, locked-down sync, `/dashboard/skills`, attach/detach | W2-1 … W2-9 | |
| 6 | Reminders & Schedulers: the control-plane cron, CRUD, editor, run history | W3-1 … W3-9 | **W3-1 has landed**: `docs/REMINDERS_AND_SCHEDULERS.md` (2,892 lines) exists and answers both of its gating questions (§5 F4). W3-2 is still a specification-plus-build task |
| 7 | Agent Template Generator: ten-stage pipeline, deterministic composer, linter, injection defence, materialisation, the template API | W4-1 … W4-10 | |
| 8 | `/dashboard/templates` gallery + the AI-guided DESCRIBE → GENERATING → REVIEW flow | W4-11, W4-12 | |
| 9 | Agent config editor, save + re-sync on a config revision, harness switching | W5-5 … W5-7 | |
| 10 | Rich Activity: timeline, runs, health, cost, all DB-served | W5-1 … W5-4 | Ships with empty states before it has data |
| 11 | Webhook v2 signature, replay window, idempotency ledger; `AGENT_MANAGER_MODE` hardening; full degradation pass | W6-1 … W6-3 | |
| 12 | Five new i18n dictionaries × 4 languages + the key-set equality gate | §5 of the task plan | A missing key is a build failure |
| 13 | The docked AI-help panel on **all four** of its screens | W4-12, **plus additions to W2-8, W5-5 and the `app/hire/page.tsx` rewire** | **Scope gap, called out rather than hidden.** `UI_DESIGN_V2.md` §C.4 places the panel on `/hire`, `/dashboard/templates`, `/dashboard/skills` and the agent config page. The only task whose file list reaches it is W4-12 (`app/dashboard/templates/**`). W2-8, W5-5 and the hire rewire must each gain a "mount `<AiHelp screen=…>`" line, or F2 is a promise three of its four screens do not keep |
| 14 | An `npm run test:integration` script, and CI that fails on zero non-skipped tests | W0-2 (extend) | Referenced by `TASK_PLAN_V2.md` §6.1 and §7.9 below; **does not exist in `package.json` today** |

### 3.2 Explicitly out of scope for v2

Each of these is a thing a reader might reasonably expect from the original request. None has a wave.

| Not building | Why, in one line |
|---|---|
| Agents that actually run | Not this repo. ArkAgent writes rows; the Manager runs work (§2.1). |
| A public template marketplace — ratings, installs-by-strangers, payments | `visibility='public'` is a cross-tenant *read* and nothing more; no discovery ranking, no reviews, no revenue share |
| Skill authoring or upload | The catalogue is curated and synced from an allowlist; there is no customer write path into `skills` |
| Serving skill bundle bytes from ArkAgent | Decision 13 of the Skill Repository: no `body` column, no source endpoint. This is what makes the licence policy enforceable |
| Agent-to-agent orchestration, handoffs, or a supervisor agent | A template may carry up to 3 agents; they do not talk to each other |
| Landing, auth, billing, payment and admin **layout** work | They inherit the new colour and weight tokens; no layout work (`UI_DESIGN_V2.md` non-scope) |
| A visual cron builder beyond the specified control set | NL field + day chips + time/timezone + advanced. No drag-on-a-calendar |
| Binary context extraction (`.pdf`, `.docx`) | No parser, no blob client, and the constraints forbid new runtime dependencies (§8.1) |
| Mobile apps; offline; native notifications | Responsive web at 1440/1024/768/375 only |
| New auth methods beyond what already exists | Google/WeChat/SSO routes exist untouched |
| Credit rollover; free trials | Currently **claimed on the landing page and implemented nowhere** (§8.8, §8.9) |
| Redis, a queue, a job runner, or any new runtime dependency | Rate limits count rows in tables that already exist; the cron is a Vercel schedule over `FOR UPDATE SKIP LOCKED` |

### 3.3 Deferred to v3 — named so they are not silently forgotten

| Deferred | Trigger that unblocks it |
|---|---|
| Live runtime telemetry rendered as real data | The Manager emits signed `agent.run_*` events and knows `agents.id` (§8.3) |
| Codex and DeepSeek **provisioning** | The Manager publishes a `category_id` for each (§8.5) |
| Binary and OCR context extraction; a "searchable knowledge base" claim | The storage/extraction decision (§8.1) and the indexing answer (§8.2) |
| Automated skill publishing above a trust threshold | Never, unless the review queue proves the rubric over ≥2 sync cycles |
| Cross-workspace template sharing with attribution or ratings | Real usage of `visibility='public'` |
| Provider-sourced model catalogue replacing the seven hardcoded ids | A cached provider fetch, once `settings.model` is actually honoured |
| Multi-region, SOC2, audit-log export | A customer asks in a contract |

---

## 4. Personas and jobs to be done

Three personas carry the v2 work. They are not new — they are the existing ones re-cut around
template-driven creation and scheduling, which change who can succeed alone.

### P1 · The operator-owner — "Wei", founder or ops lead, 3–30 person company

Buys the seat, configures the agent, is the one who notices when it goes wrong. Not technical
enough to write a cron expression; entirely technical enough to notice a fabricated number.
Works in zh or en; his team may work in the other.

| Job | Today | v2 |
|---|---|---|
| "I have a job to offload and no idea what an agent should look like" | Picks a job title from a 5-field tile and writes a brief into a blank textarea | Browses templates that state what the agent does, which skills it needs and what it will cost in setup time; or describes the job in prose and reviews six generated sections |
| "Make it do the thing every weekday at 08:30 and tell me what happened" | Impossible — there is no schedule surface at all | Types "every weekday at 8:30" in his own language, sees the interpretation and the next five fire times, picks where the result lands |
| "Tighten what it is allowed to do without breaking it" | A settings tab with hardcoded English labels whose save never reaches the runtime | Nine-section editor, localised, with a truthful sync state and conflict detection |
| "Did it work, and what did it cost me?" | A billing chart that is the same fiction for every customer | Timeline → run → step trace, with cost in micro-USD summed from real rows, or an honest empty state |

### P2 · The evaluator — first session, has not paid, deciding in ten minutes

Lands from the marketing page, signs up, and gives the product one sitting. Sees exactly the
screens a brand-new empty workspace has — which is why "a new workspace sees no invented data" is
a P0 rather than a nicety: for this persona, invented data is the *entire* first impression, and
discovering it is fake is unrecoverable.

| Job | v2 |
|---|---|
| "Show me this is real in under five minutes" | Gallery → detail drawer → "Start from this template" → pre-filled wizard, with no VM provisioned and no card charged |
| "Show me it will not do something stupid with my data" | RULES & BOUNDARIES is a *first-class section of the template*, visible before launch, not a settings page found later |
| "I do not read English" | Four languages, complete, enforced at compile time — including the generated template, which is written natively in the requested locale rather than machine-translated |

### P3 · The platform operator — internal; runs the deployment, curates the catalogue

New in v2, and the persona the corpus most quietly depends on: someone must publish skills, or
the catalogue is frozen at its seed (§8.10).

| Job | v2 |
|---|---|
| "Keep the catalogue current without shipping malware" | Sync writes `draft`; a human publishes; the denylist is a checked-in module reviewable in a PR |
| "Know why a generation failed" | `llm_usage.correlation_id` + `stage` group the nine calls of one user action; `template_generations` keeps an auditable row |
| "Deploy without accidentally simulating" | `AGENT_MANAGER_MODE` resolves to `unconfigured` in production; `scripts/check-runtime.ts` says so at build time |

### The persona v2 deliberately does not serve

**The skill author.** There is no upload path, no authoring UI, no submission queue. Adding one
means accepting customer-authored code into a catalogue every other tenant reads, and the whole
safety model is built on the opposite assumption.

---

## 5. Feature specs — one per numbered requirement

Ten specs, in the owner's original numbering. Every acceptance criterion is an **existing**
`AC-*` id from `TEST_PLAN_V2.md` §B.13; none is invented here. Where a requirement has no
dedicated criterion in §B.13, that is called out as a **coverage gap** with the id it should be
tested under — a gap closes by adding a `TC-` row to §B, never by adding an `AC-`.

### F1 · Clean up the mock data *(original item 1)*

**User problem.** A paying customer with zero agents opened Billing and saw a 14-bar credit chart,
"4 agent seats" and a cycle estimate — none of it theirs. A workspace whose `channels.label` was
null read "USED BY NOVA" on its own Channels screen. The landing page promised a 14-day trial that
`stripeTrialDays()` returns `0` for. Every one of these is a trust loss that no later feature
recovers.

**Already landed, and not to be re-done.** `getBillDatasets` and the proration helpers are deleted;
Billing reads `GET /api/billing/usage` through `lib/services/billing.ts`, with
`tests/billing-usage.test.ts` behind it. `channelDefs[].connected`/`.note` are gone and the channels
page keys by `type` (`app/dashboard/channels/page.tsx:161`). Both false pricing claims are cut in
all four locales; `lib/i18n/landing.ts:110-122` records the cut and the conditions for restoring
either. `components/DemoPill.tsx` is deleted, the `lib/store.tsx` shadow roster is deleted, and the
demo workspace is behind `SEED_DEMO=1`.

**Solution shape — what is left.** In the audit's dependency order: `lib/data.ts`'s `agentsData` +
`roleIdByName` (still present at `:45` and `:239`), `invoiceFixtures`/`demoCycleTotal` (demo-only,
gate rather than delete), `landingRoles` → `GET /api/roles` on `app/page.tsx`, and `heroFeed`
(`lib/data.ts:261`) → `lib/i18n/landing.ts` in four languages. Then the production gates:
`ADMIN_PASSWORD` a hard exit under `NODE_ENV=production`, and `scripts/purge-demo.ts` as a release
step. **Keep** `genTexts`, `rolesData`, `roleEngine`, `planCatalog`, `lib/payments/config.ts` and
the other load-bearing items in `MOCK_DATA_AUDIT.md` §4 — that list is written against a stale
`lib/data.ts` (conflict C12), so re-grep it by symbol name, never by line.

*Not promised here:* renaming `lib/data.ts` to `lib/catalog.ts`. No wave does it, `TASK_PLAN_V2.md`
§4.2 keeps the file under its current name, and a rename touching every import site is not free.
Raise it as its own task if it is wanted.

**Acceptance criteria**
- [ ] `AC-DATA-1` — a new workspace sees only its own real data (TC-128)
- [ ] `AC-DATA-2` — the demo workspace and the default admin password cannot exist in production (TC-129, TC-130, TC-131)
- [ ] `AC-DEG-1` — mock mode is functional, deterministic, distinguishable, and makes no outbound request (TC-119, TC-121, TC-123)
- [ ] `AC-SEC-2` — no secret or token is serialised into any client-visible payload (TC-161)

**Success metric.** Zero screens in the product render a number that cannot be traced to a
Postgres row, verified by walking every screen of an empty workspace. Secondary: support tickets
of the form "what is this chart" go to zero because the chart is empty when the data is.

**Failure modes.** (a) Grep-and-delete removes `genTexts` and the keyless deployment starts
returning empty briefs. (b) Billing is rewritten but the seed still creates the demo workspace, so
the chart looks right on the only host anyone tests on. (c) The false pricing claims come back with
an implementation that lands in only one locale. (d) The half of this task that is done is
re-done from the audit's stale line numbers, reverting the fix (conflict C12).

### F2 · AI help that guides a user who does not know what to build *(original item 2)*

**User problem.** The blank-page problem, and it is not confined to one screen: a user is equally
stuck on the hire wizard, in the gallery, in the skill browser and in the config editor. A generic
chatbot does not solve it, because advice the user then has to hand-translate into form fields is
just more reading.

**Solution shape.** One docked component, collapsed to a 56×56 affordance at bottom-right,
expanding to 320px (docking into the review gutter at ≥1280px). Present on `/hire`,
`/dashboard/templates`, `/dashboard/skills` and the agent config page. Replies carry **typed action
chips** that patch the form behind them, applied optimistically and undoable from the same message.
Suggested prompts are per-screen and per-state from a static table in `lib/i18n/atg.ts`. Three
non-negotiables: chips are **restrictive-only** (no chip may enable a tool, raise autonomy, raise a
spend limit, or attach a `high`-risk skill — a chip that grants capability is prompt-injection
privilege escalation with a button on it); the `context` prop is untrusted and is fenced exactly as
the user's brief is fenced, with the fence token stripped from the content; and with no LLM key the
panel becomes a **guide** — the prompt list stays, each prompt maps to a written answer plus the
same chips, and only the free-text composer is disabled.

**Acceptance criteria**
- [ ] `AC-ATG-5` — with no LLM key the product still produces a complete result with no network call (TC-024, TC-025, TC-030)
- [ ] `AC-SEC-1` — untrusted third-party text is data everywhere it is consumed and never renders as executable markup (TC-157, TC-157b)
- [ ] `AC-DEG-1` — the panel is present, functional and distinguishable in mock mode (TC-119, TC-121, TC-123)
- [ ] `AC-I18N-1` — all four languages complete, enforced at compile time (TC-140, TC-141, TC-142)
- [ ] **Coverage gap:** no P0 case exercises *"an action chip cannot widen a permission"*. Add a `TC-` row under `AC-SEC-1` asserting that a chip payload raising `autonomy`, enabling a `tools` flag, raising `approvalAmountUsd`, or attaching a `high`-risk skill is rejected server-side by the same Zod schema the form's own submit uses.
- [ ] **Wave gap (§3.1 row 13):** only **W4-12** builds this panel, and only on `/dashboard/templates`. `/hire`, `/dashboard/skills` and the agent config page get it only if W2-8, W5-5 and the hire rewire each pick it up. Three of the four screens are unbuilt until that happens, and F2's whole thesis is that the affordance is in the same place everywhere.

**Success metric.** Of users who open the panel on the DESCRIBE screen, the share who go on to
complete a generation, versus those who never open it. Guardrail metric: chip-apply undo rate — a
high one means the chips are guessing.

**Failure modes.** (a) The panel becomes a chatbot because chips are "phase 2", and it is then
decorative. (b) With no key the panel hides, so the UI is a different shape on every deployment and
nobody tests the one customers get. (c) A chip is allowed to loosen a boundary "because the user
asked", which is exactly the sentence an injected template says.

### F3 · Template-driven, easy setup that generates all six sections *(original item 3)*

**User problem.** Today's wizard asks for a job title and a free-text brief and gives back an agent
with no skills, no rules, no context and no schedule. The user does not know what they were
supposed to type, and the agent that results does nothing until they figure it out.

**Solution shape.** Choosing a template routes to `/hire?template=<id>`, opening at step 2 with a
banner naming what came pre-filled and a `[Clear]`. Asking for a generated one runs the pipeline
and lands on **REVIEW & EDIT**, which is the whole product: six sections, in this order, each
independently editable — **ROLES** (1–3, each with a nullable FK into `agent_roles`), **AGENTS**
(1–3, brief, channels, tasks), **SKILLS** (0–12, version-pinned, risk-badged), **RULES &
BOUNDARIES** (autonomy, approval threshold, external-send policy, retention, credit cap, prose
rules), **CONTEXT** (0–8; three kinds, not two — `pasted_text`, `file_request` and `url`, per
`templateContextItemSchema` in `AGENT_TEMPLATE_GENERATOR.md` §7.2 — with `awaiting_upload` distinct
from `pending` so the UI can draw the upload action), **REMINDERS & SCHEDULERS** (0–8, the F4
editor inline). Saving writes one `agent_templates` row; launching is the separate materialise call.

The `url` kind is the reason `AC-CTX-2` has an SSRF clause at all: it accepts a customer- or
model-supplied public HTTPS URL, validated at the schema boundary by `isSafePublicHttpsUrl` (a
*syntactic* check — no credentials, https, not an IP literal). Syntax is not enough on its own; see
§7.3 for the fetch-side rule, and §8.1 for the open question of whether ArkAgent fetches these at
all or leaves them to the runtime.

**Acceptance criteria**
- [ ] `AC-TPL-2` — a template always presents exactly the six named sections (TC-011, TC-012)
- [ ] `AC-TPL-4` — section edits are transactional, referentially checked, safe under concurrency (TC-035, TC-036, TC-039, TC-049)
- [ ] `AC-TPL-5` — built-in templates are immutable; editing forks a workspace copy (TC-037)
- [ ] `AC-CTX-1` — every supported artefact uploads, indexes, and is readable from Postgres alone (TC-051, TC-052, TC-055)
- [ ] `AC-CTX-2` — type and size limits enforced independently client and server including by content sniffing; user URLs cannot reach internal networks (TC-056, TC-059, TC-060, TC-061, TC-158)
- [ ] `AC-CTX-3` — context capture is identical in mock mode (TC-062)
- [ ] `AC-ATG-6` — harness values are constrained to the four-value enum at the schema boundary (TC-040, TC-041)

**Success metric.** Median time from first template view to a launched agent, and the share of
launched agents that have ≥1 skill **and** ≥1 schedule at launch (today: structurally zero).

**Failure modes.** (a) The gallery CTA provisions a VM, and a browse becomes a bill. (b) CONTEXT
ships text-only but the copy still says "searchable knowledge base" (§8.2). (c) Six sections become
five because schedules are "a later screen", and the feature the owner asked for in item 4 quietly
leaves the creation flow.

### F4 · Reminders & Schedulers *(original item 4)*

**User problem.** There is no way to tell an agent to do something at a time. The whole product is
reactive, so an "autonomous" agent only acts when a human pokes it — which is the opposite of what
was bought.

**Solution shape.** Build on `lib/schedule/**`, which is finished and tested: a dependency-free
5-field cron engine with IANA timezone support and a decided, tested DST policy (a skipped wall
clock fires at the jump instant; a repeated one fires once on the first pass, unless the expression
is an interval, where both fire), a deterministic four-language natural-language parser with a
confidence floor, and a four-language describer. **Do not re-implement any of it.**

**W3-1 has landed and both of its questions are answered** — `docs/REMINDERS_AND_SCHEDULERS.md`
now owns the execution path, and this document defers to it rather than restating it. For the
record, so nobody re-opens them: `kind='interval'` is **removed from the writable API** (the enum
value and column stay; the editor's "every N minutes" control already encodes `*/N` cron, and any
row that does exist is interpreted **start-anchored**, which makes `scheduled_for` pre-computable
and `UNIQUE (schedule_id, scheduled_for)` real again); and a one-off is stored `kind='once'`,
`run_at` set, **`cron_expr = NULL`** — `ParsedSchedule.cron` is a carrier for time-of-day only and
never reaches the column, so nothing fires annually because nothing stores a yearly cron, and the
tick that fires a `once` is also what disables it.

What is still ahead is the control-plane cron (W3-2): a Vercel schedule hitting
`/api/cron/schedules` with a bearer `CRON_SECRET` that **fails closed when unset** (without it the
endpoint is a public agent-trigger), claiming rows `FOR UPDATE SKIP LOCKED`, with a stale-`running`
sweep. The editor gives an NL field, day chips, time and timezone pickers, an ADVANCED section
exposing `deliverTo` and the `maxRunsPerDay` ceiling, and a live PREVIEW of the next five runs.

**Acceptance criteria**
- [ ] `AC-SCH-1` — NL in all four languages produces a validated cron with a visible interpretation (TC-063…TC-066)
- [ ] `AC-SCH-2` — low-confidence parses require confirmation; unparseable input is never guessed (TC-067, TC-069)
- [ ] `AC-SCH-3` — every cron reaching the database is valid, including model-produced ones (TC-070…TC-074)
- [ ] `AC-SCH-4` — a schedule that can never fire cannot be saved (TC-050)
- [ ] `AC-SCH-5` — dispatch is exactly-once per scheduled instant under concurrent ticks (TC-077, TC-078)
- [ ] `AC-SCH-6` — downtime catch-up fires once, is bounded, and is recorded (TC-079, TC-080)
- [ ] `AC-SCH-7` — a failed run cannot wedge a schedule (TC-081, TC-087)
- [ ] `AC-SCH-8` — DST-correct: gap times fire at the jump, ambiguous times fire once (TC-084, TC-085)
- [ ] `AC-SCH-9` — `enabled` and `next_run_at` are always consistent (TC-076, TC-088)

**Success metric.** Share of live agents with ≥1 enabled schedule, and the schedule-run success
rate (`succeeded / (succeeded + failed)`) once telemetry exists. Leading indicator before then:
the share of NL entries accepted without falling back to the cron form.

**Failure modes.** (a) The platform's cron tick is coarser than the schedules users can create, so
a `*/15` promise is a `0 * * * *` reality — decide this before shipping the control (§8.6).
(b) `CRON_SECRET` is unset in one environment and the tick endpoint is a public "run every agent
now" button. (c) `agent_schedules.prompt` is spliced into a system prompt instead of injected as a
user turn, making every generated template a privilege-escalation path.

### F5 · Edit and manage agent configuration *(original item 5)*

**User problem.** Two defects that compound. The settings tab's labels are hardcoded English in a
four-language product; and — worse — **its save never reaches the runtime at all**:
`updateAgent()` targets a `/v1/agents/{id}` surface no known service serves, inside a
`try {} catch {}` whose comment promises a webhook that never arrives. The user edits, sees a
success state, and nothing changes.

**Solution shape.** A two-pane editor with a section rail over nine sections, every label
localised, replacing the flat tab. Persist **before** any runtime push and show a truthful sync
state — `pending` until the runtime acknowledges, never a green tick on a dispatch. Concurrency is
detected on a **`config_revision` weak ETag**, not `If-Match: <agents.updated_at>`: `updated_at`
does not move when a child row changes, which is most config edits, so two people editing different
schedules both pass today. The applied revision arrives back on `agent.heartbeat`. `AgentConfigDTO`
carries no secret. Harness switching flags incompatible skills `needs_recheck` rather than removing
them — removal destroys `risk_acknowledged` and `acknowledged_by_id`, so re-attaching later
re-asks nothing.

**Acceptance criteria**
- [ ] `AC-CFG-1` — configuration is persisted before any runtime push; the sync state is visible and truthful (TC-089, TC-090, TC-092)
- [ ] `AC-CFG-2` — cross-workspace and unauthenticated access to any v2 resource is impossible and unconfirmable, including money-spending and job-triggering routes (TC-034, TC-132…TC-136, **TC-136b**, TC-137, TC-154, TC-154b — §B.13 lists TC-136b explicitly and a numeric range silently drops it)
- [ ] `AC-HRN-1` — all four harnesses are selectable, labelled correctly, and persisted (TC-094, TC-095)
- [ ] `AC-HRN-2` — unavailable harnesses are disabled with an explanation, not failed at launch (TC-098)
- [ ] `AC-HRN-3` — a failed re-provision never leaves `engine` pointing at a harness that is not running (TC-099)
- [ ] `AC-HRN-4` — existing agents, seeds and API consumers keep working after the enum change (TC-100)
- [ ] `AC-SEC-2` — no secret in any client-visible payload (TC-161)

**Success metric.** Config edits per active agent per month (today, effectively an abandoned
surface), and the rate of lost-update conflicts detected rather than silently overwritten.

**Failure modes.** (a) The editor is rebuilt beautifully on top of the same broken push, so the lie
gets a nicer frame. (b) `updated_at` is kept as the ETag because it "already exists". (c) A harness
switch silently drops acknowledged high-risk skills.

### F6 · Far more detailed activity, from the database *(original item 6)*

**User problem.** "Is it working, and what did it cost?" is unanswerable. The activity surface is a
flat feed with no runs, no steps, no cost attribution and no health.

**Solution shape.** `docs/HARNESSES_AND_ACTIVITY.md` Part 2 now owns the event taxonomy (§5) and
the Activity page's information architecture (§6); this is the product-level summary, not a second
specification. Four tabs. **TIMELINE** — composable filters, cursor paging, rows rendered from
`code` + `params` through `lib/i18n/activity.ts` (the v2 event carries an *empty* `text`
deliberately: rendering prose at ingest freezes one of four languages forever). **RUNS** — the
drill-down into ordered `agent_run_steps` with timings and token usage, ordered by `occurredAt`,
not by the run's clock. **HEALTH** — samples with `source ∈ {runtime, mock}`; the DISK card shows an
absolute figure because there is no `disk_limit_bytes` and a percentage of an unknown denominator
is a fabricated number. **COST** — summed in **micro-USD** and converted once at render; an integer
of cents cannot express the `$0.0117` the page draws. All four are identical in shape across all
four harnesses; per-harness differences are capability degradation, shown as absence, never as a
different page.

**Acceptance criteria**
- [ ] `AC-ACT-1` — activity is served entirely from the database with composable filters and cursor paging (TC-101, TC-102)
- [ ] `AC-ACT-2` — a run drills down into ordered steps with timings and token usage (TC-103)
- [ ] `AC-ACT-3` — reading activity never mutates the agent and never leaks secrets (TC-106, TC-108)
- [ ] `AC-DATA-1` — a brand-new workspace sees no invented activity (TC-128)
- [ ] `AC-DEG-1` — `source='mock'` samples are visibly distinct and never charted as real (TC-119, TC-121, TC-123)
- [ ] `AC-I18N-2` — dates and numbers are locale-formatted (TC-143)

**Success metric.** Once telemetry lands: share of sessions that open a run drill-down, and
median time-to-first-answer on "why did this run fail". Before then, the only honest metric is that
the page renders correct empty states in four languages against a zero-row fixture.

**Failure modes.** (a) The page is seeded with plausible rows so it demos well — the billing-chart
defect rebuilt on a bigger canvas, and the reason `source` exists. (b) The backend emits a flat
event stream and the run/step drill-down has nothing to drill into (§2.8). (c) Activity rows are
stored as English prose and the Japanese customer reads English forever.

### F7 · The Agent Template Generator *(original item 7)*

**User problem.** Describing an agent well requires knowing what an agent *is*. Most users do not,
and a single-prompt generator makes it worse by confidently inventing skills that do not exist.

**Solution shape.** Ten stages, not one prompt, and the ordering is the design: the model emits
**capabilities**, never skill identifiers, and a database query over the catalogue turns
capabilities into real `(source, owner, slug, version)` tuples — which is the only durable defence
against hallucinated dependencies. Stages carry their own temperatures (creative for name and
mission at 0.4–0.55; ≤0.2 for boundaries, because a creative spending limit is a defect), their own
schemas of 10–20 fields (JSON validity collapses on a 90-field schema), and their own fallbacks —
so a 429 on the boundaries stage substitutes the deterministic composer for **that section only**
and the mode becomes `hybrid`. Repair is surgical: one section, one Zod error, inside a 12-call
circuit breaker. A guardrail linter runs after assembly and **every remediation moves in the
restrictive direction only** — a loosening remediation must not be expressible. `provenance` is
recomputed server-side on every write, because a client-supplied `materializable: true` would be a
one-request bypass of every rule the linter enforces. Cost overruns **downgrade** to the
deterministic path with a warning rather than returning 429: refusing to work because *we* spent
money is our problem, not the customer's. Rate limits — 6/hour, 20/day, concurrency 1 — count rows
in tables that already exist; no Redis.

**Acceptance criteria**
- [ ] `AC-ATG-1` — generation succeeds end to end and persists one template plus one auditable generation record (TC-015, TC-016, TC-033)
- [ ] `AC-ATG-2` — the generation row is written before the stream opens; a disconnect cancels cleanly and never wedges the workspace (TC-017, TC-032)
- [ ] `AC-ATG-3` — schema failures trigger a bounded per-stage repair ladder inside an 11-call budget and never write a partial template (TC-019, TC-020, TC-023)
- [ ] `AC-ATG-4` — provider errors are classified separately from validation errors (TC-022, TC-027)
- [ ] `AC-ATG-5` — with no LLM key the product still produces a complete, schema-valid template with no network call (TC-024, TC-025, TC-030)
- [ ] `AC-ATG-6` — harness values are constrained to the four-value enum at the schema boundary (TC-040, TC-041)
- [ ] `AC-SKL-1` — proposed skill identity is fully qualified and version-pinned; `latest` is never resolved at runtime (TC-043, TC-046, TC-111)
- [ ] `AC-SEC-1` — the user's brief and all third-party text are fenced as data and never reach a system prompt (TC-157, TC-157b)

**Success metric.** Share of generations that reach `ready` without a repair; share of generated
templates materialised without the user editing a section (a proxy for "the draft was right");
median generated-to-launched time. Cost guardrail: median micro-USD per generation.

**Failure modes.** (a) `lib/atg/defaults/**` — ~1,500 lines of hand-written product copy in four
languages — is deferred as boring, and since it is the **majority path whenever no key is set**, the
default deployment is visibly worse than the keyed one. This is the single most under-estimated item
in the corpus; it is scheduled *before* the pipeline that consumes it for that reason. (b) The
injection scanner's naive overlap check strips the guardrail a legitimate brief asked for — a user
writing *"never email credentials"* trips the exfil pattern, boundaries correctly emits *"NEVER send
credentials by email"*, and the check deletes it. Only capability-**seeking** findings may arm the
rule and only capability-**granting** elements are strippable. (c) The published-status gate is
checked in retrieval but not re-asserted in the gates module, and the tag-fallback path proposes
unreviewed freshly-crawled third-party code.

### F8 · The Skill Repository *(original item 8)*

**User problem.** Skills today are 14 hardcoded ids in `lib/agent-settings.ts` stored as a string
array inside `agents.settings` JSONB — a shape that cannot express a version, a source or a
provenance, which is precisely what a runtime needs to install anything. And the ecosystem the user
wants to draw from is actively hostile: ClawHavoc poisoned 335–1,184 published skills in Feb 2026.

**Solution shape.** A curated catalogue of 101 real, verified entries (43 low / 33 medium / 25 high;
30 ClawHub rows) across a 16-category taxonomy, with identity as `(source_id, owner_handle, slug)`
plus a minted `public_id` — bare slugs collide six ways on ClawHub alone. One canonical body format,
because all four harnesses read the same `SKILL.md`; harness compatibility is an **assertion with a
basis**, never a default. Deterministic risk scoring (§2.4) with hard gates for scanner failures,
VirusTotal hits, exfiltration patterns, injection directives and denylisted publishers — and
deliberately **not** for `secrets`, which matches the setup docs of nearly every MCP server and, as
a gate, would quarantine the catalogue and force-disable every already-attached skill; it is a `+4`
signal that becomes a hard gate only when a secret-path match co-occurs with an egress sink. Sync
runs from an allowlist with `redirect: "manual"`, per-hop host re-checks, a 15s timeout and a 512KB
cap, and releases its lock in a `finally`. New rows land `draft`. `agent_skills.version` is pinned
at attach; detach sets `enabled=false, state='removing'` and **retains the row**, because a hard
delete 404s its own confirmation webhook. `AgentSettings.skills[]` becomes a server-derived mirror.

**Acceptance criteria**
- [ ] `AC-SKL-1` — skill identity is fully qualified and version-pinned; `latest` is never resolved at runtime (TC-043, TC-046, TC-111)
- [ ] `AC-SKL-2` — the repository defaults to safe skills; attaching a high-risk skill needs explicit confirmation (TC-042, TC-044, TC-109)
- [ ] `AC-SKL-3` — safety scoring is deterministic and reproducible; an LLM may only raise a band (TC-118)
- [ ] `AC-SKL-4` — a partial sync is a success with warnings; delisted skills are marked, never deleted; pinned versions re-verified daily (TC-115, TC-116, TC-159)
- [ ] `AC-SEC-3` — skills whose licence is unverified are deep-linked to their origin, never redistributed from ArkAgent (TC-156)
- [ ] `AC-SEC-1` — skill names, summaries, descriptions and tags render as text nodes and never reach a system prompt (TC-157, TC-157b)
- [ ] `AC-CFG-2` — the sync route fails closed without its secret; attach/detach is workspace-scoped and 404s cross-workspace (TC-132…TC-137)

**Success metric.** Skills attached per launched agent; share of attachments the generator proposed
versus a human browsed; and — the one that matters for safety — zero `blocked` rows ever serialised
to a non-staff client, asserted rather than observed.

**Failure modes.** (a) Nobody is staffed on the publish queue, so the catalogue is frozen at its
seed and the "grab the top and popular skills from the web" requirement quietly does not happen
(§8.10). (b) The seed's bands and the rubric's output diverge, so the first sync rescores four
document skills and flips a drift warning on every agent using them — hence the equality assertion.
(c) The licence question is left open and ArkAgent redistributes bytes for 30 rows whose licence is
unverified (§8.4).

### F9 · Redesign the Template page — cards and list *(original item 9)*

**User problem.** A five-field role tile cannot answer *"what will this actually do, will my harness
run it, and how long will it take me to set up?"* — which is the entire question at that moment.

**Solution shape.** `/dashboard/templates`: a header and control bar, a card grid
(`repeat(auto-fill, minmax(320px, 1fr))` → 3 columns at 1124px usable), a list view over the **same
result set**, filters and sort with **linkable state**, and a detail drawer showing the six sections
before commitment. Cards show category, harness, skill/schedule/agent counts, `automates`,
difficulty and time-to-value — all computed at assemble time from skill count, required-context
count and required-credential count, **never model-authored**. Badges distinguish `⬦ YOURS` from
`⬦ PUBLIC` via `origin` (a real column) and `ownedByViewer` (computed in the serializer, and it must
never become a column — the same row is "yours" to one tenant and "public" to another). Three
distinct empty states — no templates at all, no results for these filters, no public templates —
because they need different actions. Third-party template text is **data**: text nodes, no markdown,
no `dangerouslySetInnerHTML`. And the hire wizard's step 1 is rewired onto the same objects.
Any card cell without a backing column is **dropped, not invented**.

**Acceptance criteria**
- [ ] `AC-TPL-1` — card and list views over the same result set, with linkable filter/sort state (TC-001, TC-002, TC-006)
- [ ] `AC-TPL-3` — a workspace with no templates gets an actionable empty state, never fabricated content (TC-008)
- [ ] `AC-TPL-2` — the drawer presents exactly the six named sections (TC-011, TC-012)
- [ ] `AC-SEC-1` — a public template from another tenant renders inert (TC-157, TC-157b)
- [ ] `AC-UI-4` — works at 1440, 1024 and 375 with no horizontal page scroll (TC-151)
- [ ] `AC-I18N-1` — four languages complete on the gallery and the drawer (TC-140, TC-141, TC-142)

**Success metric.** Share of new agents created from a template rather than from a blank wizard
(target: the majority), and gallery → drawer → CTA funnel conversion.

**Failure modes.** (a) The card grows a LEVEL badge or a skill preview with no column behind it, and
the page that exists to end fabricated data ships with two invented cells. (b) Card and list drift
into different result sets. (c) The CTA is wired to materialise, so browsing bills.

### F10 · Font weight and colour *(original item 10)*

**User problem.** Stated by the owner as "the font color is too grey", and it is measurable: the
comment in `app/globals.css` claims AAA body ink and AA mono tiers, and **that claim is false in
five of six palettes** — ivory-light `--c-faint` sits at 2.28:1 while carrying helper text. The
weight scale has a hole in the middle: four numeric weights in use, 119 of them `700`, body copy
inheriting `400`, antialiased on a dark ground where thin stems erode.

**Solution shape.** Re-specify the ramp as a contract before touching a hex value: `--c-text` ≥13:1
(primary), `--c-text2` ≥9.5:1 (**default body copy**), `--c-muted` ≥7:1 (secondary and all mono
field labels), `--c-faint` ≥4.5:1 (**tertiary only — may never carry a sentence the user must read
to operate the product**). Floors hold against the worst of all four surfaces. Derive new values by
holding each token's OKLCH hue and chroma and binary-searching lightness — this is a contrast fix,
not a re-skin, and each palette keeps its character. Add `--c-border-field` at 3:1 for non-text
boundaries (using `#647084` for terminal-dark, since the originally proposed `#626F82` fails its own
floor at 2.99 on `--c-hover`). Weights become CSS variables with `html[lang^="ja"]` step-downs,
because CJK falls back to static families where 440 snaps to Medium — which requires
`documentElement.lang` to track the UI language. **The client half of that is already done**
(`lib/store.tsx:215-218` sets it in an effect on every language change); the half that is not is
the **server** render: `app/layout.tsx:62` emits `<html>` with no `lang` derived from the boot
language, so first paint carries the wrong (or no) `lang` and the Japanese step-down flashes in on
hydration. Render `lang` on the server from the same source the pre-paint boot script reads, the
way `data-theme`/`data-direction` already are. Fix the three latent
bugs in the same PR: `--c-green-ink` white on bright green (1.97:1), midnight-dark's 3.16:1 primary
CTA, and the Newsreader `style:["italic"]`-only load that makes every Ivory heading render in
Georgia. Fix the focus rule before adding screens.

**Acceptance criteria**
- [ ] `AC-UI-1` — every text tier meets its floor (13 / 9.5 / 7 / 4.5:1) in all six palettes against all four surfaces (TC-146, TC-147)
- [ ] `AC-UI-2` — non-text boundaries meet WCAG 1.4.11 3:1 via `--c-border-field`; status colours used as text meet 4.5:1 (TC-149b, TC-149c)
- [ ] `AC-UI-3` — fill/ink and tinted-wash pairings pass after the uplift, including the three that fail today (TC-148)
- [ ] `AC-UI-4` — every v2 screen works at 1440, 1024 and 375 with no horizontal page scroll (TC-151)

**Success metric.** 306 contrast assertions green across six palettes; zero `c.faint` call sites
carrying a sentence; and a screenshot review across 6 palettes × 4 languages signed off by the
owner — because the test asserts ratios, not appearance, and can be fully green while looking wrong.

**Failure modes.** (a) The suite passes and the product looks washed out, because ratio ≠ taste — the
named screenshot review exists for exactly this. (b) The test asserts only the client-side
`documentElement.lang` effect, which already passes, and nobody notices that the server-rendered
`<html>` has no `lang` — so the Japanese weight fix is green and still wrong for one paint on every
page load. Assert the SSR attribute, not just the effect. (c) The uplift lands
inside a feature PR, becomes unreviewable, and gets reverted wholesale when one screen regresses —
hence Wave 1 ships alone, before anything is built on top of it.

---

## 6. The golden path, end to end

One walkthrough, seventeen steps, naming the exact screen and the exact call at each. This is the
path that must work on a deployment with **no** `OPENROUTER_API_KEY` and **no** Agent Manager —
steps 5–9 take their deterministic branch, step 13 **succeeds but does not provision**, and
everything else is identical. It is also the release rehearsal: if a change breaks a step here, it
does not ship.

**The distinction step 13 rests on, because getting it wrong deletes steps 14–17.** Materialisation
and provisioning are two acts. `POST /api/templates/{id}/materialize` commits its eleven-step
transaction *before* any network call and returns `201 { agent, provisioned: boolean, reason? }`;
provisioning is step 12, outside the transaction, and its failure does **not** roll the agent back
(`AGENT_TEMPLATE_GENERATOR.md` §7.3, §9.4). So on a no-Manager build the agent row exists, the
schedules exist, the config is editable, and `provisioned: false` is rendered honestly on the fleet
card — which is exactly what §7.10 asks a brand-new workspace to be able to walk. **503 belongs to
the routes that genuinely need a runtime** — provision/re-provision, lifecycle, chat, WeChat QR —
not to materialise. A materialise that 503'd would make the last four steps of this walkthrough
unreachable and turn the release gate into a claim nobody can execute.

| # | Screen | Call | What must be true |
|---|---|---|---|
| 1 | `/auth` — `app/auth/page.tsx` | `POST /api/auth/register` | A new workspace is created with **zero** agents, zero usage rows and no demo data. This workspace is the acceptance environment for the entire release (`AC-DATA-1`). |
| 2 | `/dashboard` — `app/dashboard/page.tsx` | `GET /api/dashboard` | Already fully DB-backed. An empty workspace shows designed empty states, not a feed of Nova and Atlas. |
| 3 | `/dashboard/templates` (new) | `GET /api/templates?scope=all&view=card&page=1&perPage=24` | Card grid of `TemplateSummaryDTO` — no `draft` in the payload, which would make 24 cards a 1 MB response. Filter and sort state is in the URL, so this view is linkable. **Unreconciled conflict, decide before W4-10:** `AGENT_TEMPLATE_GENERATOR.md` §9.4 (the route's owner) specifies `page`/`perPage` with `200 { templates, total, page, perPage }`; `TEST_PLAN_V2.md` UC-V2-1 step 3 describes `?limit=24` with a **cursor**. This document follows the owner. Activity (step 17) is genuinely cursor-paged per `AC-ACT-1`; templates are not, and TC-001/TC-002 must assert the same shape the route returns. |
| 4 | Same page, detail drawer | `GET /api/templates/{id}` | The full `draft`, rendered as **text nodes**. Six sections visible before any commitment. `⬦ YOURS` / `⬦ PUBLIC` from `origin` + `ownedByViewer`. |
| 5 | DESCRIBE (`/dashboard/templates/new`) | — | The user finds nothing that fits and describes the job in prose, in any of the four languages. The docked AI help panel (F2) is present here with per-screen suggested prompts. |
| 6 | GENERATING | `POST /api/templates/generate` (SSE) | The `template_generations` row is written **before** the stream opens, so a disconnect lands `canceled` rather than wedging the workspace (`AC-ATG-2`). Rate pre-check and insert are two sequenced statements; the partial unique index — not the pre-check — is the real concurrency control. `maxDuration` respects the plan ceiling (§8.6). |
| 6b | GENERATING, no SSE | `GET /api/templates/generations/{id}` | Polling fallback. Same states, same terminal outcomes. **Workspace-scoped: 404 for another tenant's generation id** — the row holds the verbatim brief and the full draft (§7.1). |
| 6c | GENERATING, **no LLM key** | *(no network call at all)* | Every stage substitutes `lib/atg/defaults/**`; `mode: "deterministic"`; the stage list still animates because the stages still run. The test-harness `fetch` guard makes "zero outbound requests" structural (`AC-ATG-5`, `AC-DEG-1`). |
| 7 | REVIEW & EDIT — ROLES, AGENTS | *(local draft state)* | 1–3 roles, each with a nullable `baseRoleId`; 1–3 agents with brief, channels, tasks. |
| 8 | REVIEW & EDIT — SKILLS | `GET /api/skills?includeHigh=false` | The model never named these: capabilities were retrieved against `search_tsv` and ranked deterministically. Versions are pinned. High-risk requires explicit confirmation (`AC-SKL-2`). `includeHigh` parses with `z.stringbool()` — `z.coerce.boolean().parse("false")` is `true`, which defeats the filter with the exact query string that means "keep hiding them". |
| 9 | REVIEW & EDIT — RULES & BOUNDARIES | *(local; lint runs server-side on save)* | Autonomy, approval threshold, external-send policy, `retentionDays`, credit cap, prose rules. Linter remediations move in the restrictive direction only. |
| 10 | REVIEW & EDIT — CONTEXT | `POST /api/agents/{id}/context` after materialise; before it, items sit in the draft as `awaiting_upload` | File upload **and** paste-text. `awaiting_upload` (no bytes exist) stays distinct from `pending` (bytes here, indexing not started) — collapsing them tells the runtime to fetch a null `content_url` and erases the state the `[Upload]` action is drawn from. Type and size are enforced independently client- and server-side, including by content sniffing (`AC-CTX-2`). |
| 11 | REVIEW & EDIT — REMINDERS & SCHEDULERS | *(in-draft; `lib/schedule/parse` + `describe` run client-side)* | "every weekday at 8:30" → cron + timezone + the next five fire times + an explicit `deliverTo`. Low confidence demands confirmation (`AC-SCH-2`). |
| 12 | Save | `POST /api/templates` | The client's `draft` is **re-parsed**; `provenance` is **recomputed** from a fresh `lint()`. A client-supplied `materializable: true` earns nothing (`AC-TPL-4`). |
| 13 | `/hire?template=<id>` — `app/hire/page.tsx`, opening at step 2 | `POST /api/templates/{id}/materialize` with a required `Idempotency-Key` | One transaction, eleven steps: agents (`status='draft'`), agent_channels via `ensureChannels(tx,…)`, agent_tasks, agent_skills, agent_context_items, agent_schedules, a creation activity, subscriptions, credit allowance, `use_count`, generation status. Provisioning is step 12, deliberately **outside** it. Success is `201 { agent, provisioned, reason? }`; a replayed `Idempotency-Key` returns `200 { agent, provisioned }` without opening the transaction. `400` missing key · `402` plan shortfall (render the upgrade path) · `409` a precondition the user can fix, **never auto-retried**, because every 409 means the agent differs from the one they read · `500 {error, stage}` names the stage and rolls steps 1–11 back whole. Materialising another tenant's public template **forks it first**. With no Manager the route still returns `201` with `provisioned: false` and a reason; the agent is real, unprovisioned and editable. |
| 14 | `/dashboard/fleet` | `GET /api/agents` | The new agent appears with its real harness label — all four harnesses render. A harness with no Manager `category_id` (`codex`, `deepseek`) shows as unprovisioned with the reason, never as a silently substituted Hermes VM: `lib/harness/provisioning.ts` throws `HarnessNotProvisionableError` rather than falling back. |
| 15 | `/dashboard/fleet/{id}` → CONFIG | `PATCH /api/agents/{id}` with the `config_revision` weak ETag | Nine sections, localised. Persist first, push second, show `pending` until the runtime acknowledges. Two people editing different sections conflict correctly (`AC-CFG-1`). |
| 16 | Same page → SCHEDULES | `POST /api/agents/{id}/schedules` | Then, unattended: `GET /api/cron/schedules` (bearer `CRON_SECRET`, failing closed) claims due rows `FOR UPDATE SKIP LOCKED` and fires each occurrence exactly once (`AC-SCH-5`). |
| 17 | Same page → ACTIVITY | `GET /api/agents/{id}/activity?…` then the run drill-down | TIMELINE / RUNS / HEALTH / COST. Rows render from `code` + `params` per language. With no runtime this is a correct, designed **empty state** — which is the honest end of the golden path today, and the reason `AC-DATA-1` (TC-128, "a new workspace sees only its own real data") gates the release. TC-119 is a different case and belongs to `AC-DEG-1`: mock mode makes **zero** outbound requests. |

**Two exits from the golden path that must be as well built as the path itself.** A user who
abandons at step 5 and returns finds no orphaned `running` generation (the 5-minute stale sweep).
A user who reaches step 13 and hits `402` sees the upgrade path with the required `minPlan`, not a
generic error — the plan gate is the most likely place a paying customer meets a failure.

---

## 7. The production-readiness bar

"Ready for public users" is otherwise a feeling. Below it is a set of claims, each specific enough
to be wrong. Anything marked **gate** blocks the release; anything marked *target* is a number to
argue about now rather than after launch.

### 7.1 Authorisation and tenancy

- **gate** Every `/api/agents/{id}/**` route resolves through `getAgentRow(id, ctx.workspace.id)`
  and returns **404**, never 403 — a 403 confirms the resource exists, which is a cross-tenant
  disclosure on an id-guessing attack. `docs/API.md:40` is authoritative.
- **gate** The same rule for `/api/templates/{id}` (`PATCH` and `DELETE` are own-workspace only; a
  public template from another tenant is a 404 on write and a read-only 200 on `GET`) and for every
  `/api/skills/**` write.
- **gate** `scope=public` is the **only** cross-tenant read in the product, it returns summaries
  only, and every string it exposes has passed the injection output-check at publish time.
- **gate** Materialising another tenant's public template **forks it first**, so the resulting agent
  references a row this workspace owns; otherwise its author could edit an agent's config out from
  under a customer.
- **gate** `origin`, `originRef`, `provenance` and `ownedByViewer` are server-set or server-computed
  and are ignored on input, always.
- **gate** The generation routes are workspace-scoped, not merely session-gated.
  `GET /api/templates/generations/{id}` returns **404** for a row belonging to another workspace: it
  carries the user's verbatim brief, the full `draft` and the stage history, so an unscoped read is a
  cross-tenant disclosure of the most sensitive text in the product. The same rule applies to the
  `generationId` accepted in the body of `POST /api/templates` — it must be verified to belong to
  the caller's workspace before it is written into `provenance`, or a template can be minted
  claiming another tenant's audit trail.
- **gate** `POST /api/templates/generate` counts its rate limits **per workspace**, from
  `ctx.workspace.id` on the server, never from anything the client supplies.
- **gate** `GET /api/billing/usage` and every other money-reading route resolves through the same
  workspace scope; there is no admin-shaped bypass parameter on a customer route.
- Staff-only surfaces re-check `platformRole` server-side; the hidden nav row is cosmetic.

### 7.2 Secrets, signing, and the trust boundary

- **gate** No secret, token or credential appears in any DTO. `SECRET_KEYS` is exported and asserted
  in a serializer test, and `agent_skills.config` rejects secret-shaped keys on write (`AC-SEC-2`).
- **gate** Inbound webhooks verify a **v2 timestamp-bound signature** over `"v2." + timestamp +
  "." + rawBody`, with an `x-arkagent-key-id` header for key routing — the routing key cannot live
  inside a body you must verify before parsing. Shape-check the hex with a `HEX64` regex: `Buffer.from`
  truncates, so `<valid-64-hex>zz` verifies today.
- **gate** Replay window ±300 seconds (`BACKEND_INTEGRATION_CONTRACT.md` §1.5); the
  **`runtime_event_receipts`** ledger makes a duplicate `eventId` a no-op; retention 30 days by a
  daily batched sweep. The table is named here deliberately: it is `runtime_event_receipts`
  (`BACKEND_INTEGRATION_CONTRACT.md` §3.2, `DATA_MODEL_V2.md` §11.3), and it lands in migration
  slot **0012** per `DATA_MODEL_V2.md` §2.2 additions A2 and A3 — §2.1's runtime row named six
  tables and this is the seventh, and every DDL slot shifted up one when `0007_v2_enum_values.sql`
  turned out to be already journaled. "`webhook_events`" is not a table in any schema in this
  corpus; if you find that name in a task description, it means this one.
- **gate** `/api/cron/schedules` and `/api/skills/sync` authenticate with `CRON_SECRET` via
  `timingSafeEqual` and **fail closed when the secret is unset**. The previous `x-vercel-cron`
  header is client-settable on a public URL — i.e. an unauthenticated write to a table every
  customer reads, and an unauthenticated "run every agent now" button.
- **gate** An unsigned or badly signed inbound request is rejected with 401 **before the body is
  parsed**.

### 7.3 Prompt injection and untrusted content

- **gate** Third-party text — skill descriptions and `SKILL.md` bodies, another tenant's template
  prose, uploaded context, tool results, runtime activity strings — is rendered as React text nodes.
  No markdown rendering, no `dangerouslySetInnerHTML`, anywhere on the new screens.
- **gate** None of it reaches a system prompt. The user's brief and the AI-help `context` prop are
  fenced in `<screen_context>` with a `DATA_NOT_INSTRUCTIONS` marker, and the fence token is
  stripped from the content so it cannot close its own fence.
- **gate** No model call is used to decide whether input contains an injection. That call's input
  *is* the attack, and it fails open.
- **gate** Action chips and lint remediations are **restrictive-only**, enforced by the type, not by
  review: no chip or remediation may enable a tool, raise autonomy, raise a spend limit, or attach a
  `high`-risk skill.
- **gate** SSRF, and it is **two rules, not one**, because the previous single-sentence version
  demanded an allowlist for a path that cannot have one.
  - *Skill sync* (`lib/skills/sync/fetch.ts`) fetches only hosts on a checked-in **source
    allowlist**, with upstream-supplied `owner`/`slug`/`repo` `SEGMENT`-validated **before**
    interpolation, `redirect: "manual"`, a per-hop host re-check against the same allowlist, a 15 s
    timeout and a 512 KB read cap, releasing its lock in a `finally`.
  - *Context items of `kind: "url"`* are customer- or model-supplied and are **arbitrary public
    URLs**, so no allowlist exists. `isSafePublicHttpsUrl` is a syntactic pre-filter only. The fetch
    rule is deny-by-default on the **resolved address**: resolve first, refuse loopback, link-local
    (`169.254.0.0/16`, `fe80::/10`), private (`10/8`, `172.16/12`, `192.168/16`), CGNAT
    (`100.64/10`), ULA (`fc00::/7`), multicast and `0.0.0.0/8`; re-resolve and re-check on **every**
    redirect hop with `redirect: "manual"`; https only; same 15 s timeout and 512 KB cap; no
    credentials in the URL; the response is stored as bytes and never followed further.
  - Either way a 302 to `169.254.169.254` is refused, with a probe suite proving it (TC-158).
  - **If §8.1 resolves to "the runtime fetches, not us", this second rule becomes moot for the
    control plane and must instead appear in the backend conformance checklist.** It does not simply
    disappear — someone still dereferences that URL.

### 7.4 Rate limits, quotas, abuse

| Surface | Limit | Response on breach |
|---|---|---|
| Template generation | 6/hour, 20/day per workspace; concurrency 1 | `429 {limit, retryAfterSeconds}`; concurrency is a `409` from a partial unique index |
| Generation LLM spend | 2,000,000 µUSD ($2.00) per workspace per month | **Downgrade to deterministic** with warning `ATG-L024`, never a 429 — refusing to work because *we* spent money is our problem |
| Calls per generation | 12 hard circuit breaker | `error_code = "call_budget_exceeded"` |
| AI help composer | shares the generation budget | Counted-down retry line in the panel, never a silent dead button |
| Context upload | ≤8 items per template; per-file and total size caps enforced on both sides + content sniffing | `413` / `415` with the offending item named |
| Schedules | `maxRunsPerDay` ceiling per schedule, enforced by the dispatcher | Occurrence recorded as `skipped` with a reason, not dropped |
| Auth | **none today — a gap, not a baseline.** See below | — |

**The auth row is the one thing in this section that was asserted and is not true.** An earlier
draft of this table read "existing login throttling; registration requires a real email —
unchanged". Re-verified against the tree: `app/api/auth/login/route.ts` does a single
`SELECT` + `verifyPassword` with **no attempt counter, no per-IP or per-account backoff, and no
lockout**, and `lib/auth.ts` adds none; `app/api/auth/register/route.ts` never sets
`users.email_verified_at` and sends no verification mail, so any syntactically valid address mints
a workspace. A production-readiness bar for a paid, publicly-reachable product cannot carry
"unchanged" over an unthrottled credential-stuffing endpoint. The minimum, and it needs a wave:

- **gate** Per-account and per-IP failed-login backoff, counted in a table that already exists (the
  same "no Redis" rule the generation limiter follows), returning `429` with `retryAfterSeconds`
  and never distinguishing "wrong password" from "no such user" in its timing or its body.
- **gate** Registration either verifies the address before the workspace can spend anything, or the
  landing copy stops implying an account is a verified identity. Pick one and write it down.
- Both are release blockers for a **public** launch and neither is a blocker for an internal beta —
  which is a decision the owner should make explicitly, so it is escalated as §8.11.

*Target:* an abusive workspace cannot exceed **$2/month** of our LLM spend or hold more than one
generation slot, and neither limit is enforceable only in the client.

### 7.5 Data retention and deletion

- `settings.retentionDays` (1–3650, default 90; 30 when the work touches personal data) is a
  **commitment ArkAgent makes and only the runtime can honour** — it is in the manifest, and the
  conformance checklist requires the backend to apply it. `0` is not writable through the API and
  there must be no "keep forever" affordance added on either side.
- `template_generations` keeps its audit row after materialisation; purging generation history must
  never cascade into a template a customer relies on (hence `generation_id` is deliberately not a FK).
- The webhook idempotency ledger (`runtime_event_receipts`) is swept at 30 days, batched by `ctid`.
  An event redelivered after 30 days is processed again; the runtime must not retry for a month.
- **gate** Deleting an agent must remove or orphan-proof its `agent_skills`, `agent_context_items`,
  `agent_schedules` and `agent_runs` — a schedule surviving its agent is a dispatcher firing into
  nothing.
- **Open, and it should not stay open past launch:** there is no workspace-level export or
  account-deletion path in the corpus. Recommend a v3 commitment with a stated SLA; do not claim
  GDPR/PDPA compliance in marketing copy until it exists.

### 7.6 Internationalisation

- **gate** Four languages — en, zh, zht, ja — on **every** v2 screen, written natively, not
  machine-translated. Five new dictionaries (`templates`, `atg`, `skills`, `schedule`, `activity`)
  and eight modified.
- **gate** A unit test walks every dictionary and asserts all four locales have **identical key
  sets**, deep, including nested groups and function-valued entries. A missing key is a **build
  failure**, not a runtime fallback to English. This is the only mechanism that makes the claim true
  rather than aspirational.
- **gate** `agent_activities` stores `code` + `params` and renders per-language at read time. Prose
  written at ingest freezes one of four languages forever.
- **gate** A generated template is written natively in the requested `locale`, and the gallery
  labels the card with that locale rather than machine-translating it.
- **gate** Dates and numbers are locale-formatted through `BCP47[lang]` (`AC-I18N-2`).
- **gate** `documentElement.lang` tracks the UI language **on the server render as well as in the
  client effect** — required for the CJK weight step-downs. The effect exists
  (`lib/store.tsx:215-218`); `app/layout.tsx:62` does not yet emit `lang`, so the assertion is on
  the SSR'd markup, not only on the post-hydration DOM. Match with `^=`, because `html[lang="ja"]`
  cannot match `ja-JP`.

### 7.7 Empty, error and loading states

- **gate** Every new screen ships three states before it ships data: **empty** (and the template
  gallery needs three distinct empties — no templates, no filter results, no public templates),
  **error** (naming what failed and what to do; `409` names the item, `402` renders the upgrade
  path, `500 {stage}` shows the stage), and **loading** (skeletons that hold layout; the generation
  screen's stage list *is* the loading state and it is the product).
- **gate** Mock-sourced data (`source='mock'`, `install_source='mock'`) renders **visibly
  distinctly** and is never charted as real.
- **gate** A figure with no denominator is shown as an absolute, not a percentage — there is no
  `disk_limit_bytes`, so a disk percentage would be invented.
- **gate** No screen fabricates a value to avoid an empty state. This is the release's whole thesis.

### 7.8 Accessibility and presentation

- **gate** Text contrast floors **13 / 9.5 / 7 / 4.5:1** for `text` / `text2` / `muted` / `faint`,
  measured against the worst of `--c-bg`, `--c-panel`, `--c-panel-deep`, `--c-hover`, in all six
  palettes — 306 assertions, all green (`AC-UI-1`). These exceed WCAG AA deliberately; AA is 4.5:1
  and the complaint that started this work was about a product already passing it in places.
- **gate** Non-text boundaries meet WCAG 1.4.11 at **3:1** via `--c-border-field` (`AC-UI-2`).
- **gate** `--c-faint` never carries a sentence the user must read to operate the product.
- **gate** Never colour-only: risk bands and statuses carry a glyph and a border, not just a hue.
- **gate** A visible focus ring clearing 3:1 on every surface, with no shape change on focus.
- **gate** Keyboard paths for every new interactive component; ARIA on the drawer, the section rail
  and the docked panel; touch targets ≥44px; `prefers-reduced-motion` honoured.
- **gate** **1440 / 1024 / 375** with no horizontal body scroll — the three widths `AC-UI-4` and
  TC-151 actually assert, and the number this document uses everywhere it states the gate. 768 is
  designed for and manually spot-checked (§3.2), but it is not an automated assertion, and listing
  four widths against a three-width criterion is how a checklist item becomes unfalsifiable. Wide
  content scrolls inside its own container.

### 7.9 Observability and operations

The corpus is thin here, and this is the section I would most expect to be argued with.

- **gate** `llm_usage.correlation_id` + `stage` group every call of one user action, so "why did
  this generation fail" is one query.
- **gate** `template_generations` retains `status`, `error_code`, `cost_micro_usd` and stage
  history for every attempt, successful or not.
- **gate** `scripts/check-runtime.ts` (alongside the existing `check-payments.ts`) asserts at build
  time that the deployment's mode resolves to what the operator intended — `unconfigured` in
  production is a deliberate state, not an accident.
- **gate** CI **fails** when the integration suite reports zero non-skipped tests; a dead Postgres
  container must not read as green. CI drops and recreates the database on **every** run, because
  the enum-transaction hazard appears only on a full replay. **Prerequisite: `npm run
  test:integration` does not exist in `package.json` today** — `test`, `test:watch` and `typecheck`
  do. This gate is unenforceable until that script and its `tests/helpers/{db,llm,runtime,server}.ts`
  land; treat it as part of W0-2, not as Wave 6 polish.
- **gate** `vercel.json` declares the `crons` array and `CRON_SECRET` is in `.env.example`. Neither
  is true today (`vercel.json` carries only `$schema` and `framework`), and without both the
  schedule tick either never runs or runs unauthenticated.
- *Target:* a structured error log line for every 5xx carrying workspace id, route, and — for
  generation and materialisation — the stage. No PII, no brief text, no context bodies in logs.
- **Open:** there is no error-tracking service, no uptime monitor and no alerting policy anywhere in
  the corpus. Recommend picking one before public launch; it is a configuration decision, not a
  build (see §8.11).

### 7.10 The release gate, in one paragraph

A brand-new workspace, on a build with no LLM key and no Agent Manager, walks §6 end to end in four
languages across six palettes at three widths, with 306 contrast assertions green, the four-locale
key-set test green, the fresh-replay migration green, zero outbound requests in mock mode, no
secret in any payload, every cross-workspace probe returning 404, and **not one number on any
screen that does not trace to a row**. That is the bar. Everything above is how it is proven.

---

## 8. Open questions for the product owner

Eleven decisions. Seven (§8.1–§8.7) are `TASK_PLAN_V2.md` §8.2 items 1–7 in order — **not
duplicated here**; each row points at it and adds the one thing that document deliberately withheld,
a **recommended default** so nothing blocks while the decision is outstanding. Two (§8.8, §8.9) are
the false product claims `MOCK_DATA_AUDIT.md` found on the public landing page; **both have since
been resolved by cutting the strings**, so what is left is a smaller question, restated below. Two
are mine: §8.10 from §2.4, and §8.11 from §7.4/§7.9.

**How to read the defaults:** each is what the team will build if no answer arrives by the wave that
needs it. Silence is an answer, and it is the one in the right-hand column.

### 8.1 Context file storage and extraction · *(task plan §8.2 item 1 — blocks W4-8, TC-051…TC-062)*

No parser and no blob-storage client exists, and the hard constraint forbids new runtime
dependencies, so `.pdf`/`.docx` extraction has nowhere to live. Options given there: direct-to-storage
upload with the runtime extracting; text-only at launch; or an exception to the dependency rule.

> **Recommended default — text-only at launch.** Accept `.txt`, `.md`, `.csv`, `.json` and pasted
> text; reject everything else with a named reason at the picker, not after the upload. Binary
> extraction becomes a v3 item behind the runtime-extraction path, which is the only option that
> keeps the dependency constraint intact. Decide by **Wave 4**.

### 8.2 Does the runtime index context, or just drop files on disk? · *(§8.2 item 2 — blocks the CONTEXT copy)*

The UI says "searchable knowledge base" in one place and "files on the agent's disk" in another.
One of those is a lie, and the customer reads whichever we ship.

> **Recommended default — "files the agent can read".** Say the weaker, true thing in all four
> languages. Upgrade the copy if and when the backend confirms indexing; a promise of search that
> is really a directory listing is the same class of defect as the billing chart. Decide by
> **Wave 4**, alongside 8.1.

### 8.3 Network reachability, both directions · *(§8.2 item 3 — blocks Wave 6 entirely)*

Every Manager address on record is `http://10.21.27.155:18090` — RFC1918, plain HTTP — while the
read *and* write contract assumes outbound HTTPS to `app.arkagent.com`. If there is no egress,
§2 and §3 of the contract are both unreachable.

> **Recommended default — ship v2 without live runtime integration.** Wave 6 lands the webhook
> endpoint, the v2 signature and the mode hardening, and production resolves `unconfigured` (503).
> This is exactly assumption A1 and it makes the release date independent of another team's
> network. Needed answer, in one line: *is there egress between the two networks, in either
> direction, on any port?* Decide **before Wave 6 starts**.

### 8.4 Licence policy vs redistribution · *(§8.2 item 4 — blocks W2-5)*

30 seeded ClawHub rows have `license_verified = false`. If ArkAgent serves bundle bytes for them we
are redistributing unlicensed code.

> **Recommended default — never serve bytes.** `install.mode = "inline"` requires an OSI licence;
> everything else is `registry` or `git`, with the runtime pulling from origin and the UI
> deep-linking to it. This is already Skill Repository decision 13 and it is the only answer that
> does not need a lawyer. Decide by **Wave 2**.

### 8.5 `category_id` for Codex and DeepSeek · *(§8.2 item 5 — gates W0-5)*

The Manager has none, so those two harnesses can be generated and stored but not provisioned.

> **Recommended default — confirm "generate but refuse to provision".** All four harnesses are
> selectable and persistable; a live-mode materialise with an unmapped harness returns
> `409 {error: "This harness cannot be provisioned yet", harness}` and the picker disables it with
> that explanation. The alternative — hiding two of the four — makes the product look like it
> supports two harnesses, which contradicts the requirement that named four. **This is the most
> user-visible of the eleven and I would want it confirmed rather than defaulted.** Decide by
> **Wave 0**.

**Engineering note, not a decision.** This is already built and the mechanism has a name:
`lib/harness/provisioning.ts` holds `CATEGORY_ID` (`openclaw: 2`, `hermes: 4`, `codex: null`,
`deepseek: null`), `categoryIdFor()` throws `HarnessNotProvisionableError` rather than falling back,
and the deployment allowlist env var is **`ARK_ENABLED_HARNESSES`** — intersected with the
provisionable set, so an operator cannot enable a harness the Manager cannot start.
`TASK_PLAN_V2.md` W0-5 and §4.2 still call it `ATG_ENABLED_HARNESSES`; that name is wrong and
belongs to nothing. Do not introduce a second variable. Answering this question means filling in
two `null`s, not writing code.

### 8.6 Vercel plan and cron granularity · *(§8.2 item 6 — blocks W3-2 and W4-9)*

Hobby caps function duration at 60s and allows two daily cron jobs; the design needs per-minute
ticks and a `maxDuration` above 60. **A `*/15` schedule cannot beat the platform tick**, and the
schedule editor lets users create one.

> **Recommended default — assume Pro, and constrain the UI to the tick either way.** The editor's
> finest granularity must equal the actual tick, so the product never displays a next-run time it
> cannot honour. If the plan is Hobby, the minimum granularity is daily and the NL parser must
> refuse finer input with an explanation rather than silently rounding. Decide **before the
> schedule editor ships** — it changes what the control offers.

### 8.7 The fate of `demo` / `demo123` · *(§8.2 item 7)*

A guessable credential on a public host, behind a workspace holding four agents with real
`agent_manager_id` values, per-agent subscriptions and three paid invoices.

> **Recommended default — retire it, and purge it.** Split the seed so `db:seed` runs reference data
> only; gate the demo block behind `SEED_DEMO=1` **and** throw under `NODE_ENV=production`; ship
> `scripts/purge-demo.ts` and run it as a release step; make `ADMIN_PASSWORD` a hard exit in
> production, not a console warning. If a public demo is wanted for sales, it is a *separate,
> read-only, reset-nightly* deployment — not a login on the production host. Decide by **Wave 0**.

### 8.8 "14-DAY TRIAL ON EVERY SEAT" — **already cut; do you want it back?** · *(`MOCK_DATA_AUDIT.md`)*

**Status: resolved by cutting, W0-12 is done.** The claim is gone from all four locales. The hero
footer now reads "NO CREDIT CARD TO EXPLORE · LIVE IN MINUTES"
(`lib/i18n/landing.ts:154`/`:280`/`:406`/`:532`), and `:110-122` carries a standing comment naming
both cut claims and the conditions for restoring either. The product no longer promises a trial the
checkout does not grant.

> **What is still yours to decide: do you want a trial as a feature?** If yes it is nearly free —
> set `STRIPE_TRIAL_DAYS=14`, assert it in `scripts/check-payments.ts` so an unset value fails the
> build rather than the customer, and restore the string in **all four** locales reading the
> *configured* number rather than a hardcoded 14. If no, nothing further is needed. This is now a
> pricing question, not a release blocker, and it no longer belongs on the "answer this week" list.

### 8.9 "UNUSED CREDITS ROLL OVER ONE CYCLE" — **already cut** · *(`MOCK_DATA_AUDIT.md`)*

**Status: resolved by cutting, W0-12 is done.** Same footer, same four locales, same comment block.
There is still no rollover code anywhere in the repository — not a column, not a job, not a branch —
and the product no longer claims otherwise.

> **Recommended: leave it cut.** Rollover is a billing-engine feature: it needs a carry-forward
> column on `workspaces`, a cycle-close job, and a decision about what happens on downgrade and
> cancellation. None of that is in any wave, and inventing it late in a billing system is how
> customers get charged wrong. Put it on the pricing roadmap if it is a real commitment; do not
> restore the string before the column exists.

### 8.10 Who publishes a skill, and how fast? · *(new; from §2.4)*

The safety model rests on decision 9: nothing a crawler finds is customer-visible until a human
flips `status` to `published`. No document names that human, and a review queue with nobody on it
is a catalogue permanently frozen at its 101 seeded rows — at which point requirement 7's "go to
the web and grab the top and popular skills" has been designed and not delivered.

> **Recommended default — the platform operator (P3), reviewing weekly, with a stated target of
> 10 new rows per cycle.** Sync runs daily and writes `draft`; the weekly pass publishes or rejects
> with a reason recorded in the audit trail. Auto-publish above a trust threshold stays rejected —
> ClawHavoc's publishers looked reputable. If nobody can be staffed, say so, and we ship the seed as
> a **curated catalogue** and cut the sync pipeline's customer-facing promise rather than shipping a
> crawler whose output nobody looks at. Decide by **Wave 2**.

### 8.11 Auth hardening, error tracking, alerting — the "is this actually public?" question · *(new; from §7.4 and §7.9)*

Two gaps that share one decision. **First:** there is no login throttling and no email verification
(§7.4). `app/api/auth/login/route.ts` will answer an unbounded number of password guesses per
second, and registration mints a workspace for any well-formed address. **Second:** there is no
error-tracking service, no uptime monitor and no alerting policy in any of the twelve documents, so
the first report of an outage is a customer email.

Both are acceptable for an internal beta and neither is acceptable for public signup, which is why
they are one question: **is v2 a public launch or a controlled cohort?**

> **Recommended default — controlled cohort for v2, and say so.** Ship with signup gated (invite
> code or allowlist), Vercel's built-in logging and log drains, structured 5xx lines carrying
> workspace id, route and stage, and one alert on 5xx rate — all deployment configuration, no new
> runtime dependency. If the answer is "public", then **login backoff and email verification become
> Wave 0 release blockers**, not v3 items, and this document's definition of done grows two lines.
> Decide **before signup is opened to strangers**; the cohort answer blocks no wave, the public
> answer blocks the release.

### 8.12 Summary — what to decide, and by when

| By | Decisions |
|---|---|
| **Wave 0** | 8.5 harness provisioning behaviour · 8.7 demo account |
| **Wave 2** | 8.4 licence policy · 8.10 who publishes skills |
| **Wave 3** | 8.6 plan and cron granularity — and it also blocks W4-9's `maxDuration` |
| **Wave 4** | 8.1 context storage (and who dereferences a `url` context item) · 8.2 context indexing claim |
| **Before Wave 6** | 8.3 network reachability |
| **Before signup opens to strangers** | 8.11 public-vs-cohort, and with it auth hardening + alerting |
| **Resolved — no longer blocking** | 8.8 trial claim · 8.9 rollover claim (both cut, W0-12 done; 8.8 remains open only as a pricing choice) |

Three of these — 8.5, 8.7 and 8.11 — are cheap, are entirely within the owner's control, and are the
difference between a release that is honest and one that is not. They are the ones to answer this
week. **8.11 is the newest and the sharpest**: if the answer is "public", two security gaps that are
currently unscheduled become release blockers.

---

## Appendix A · Reconciliation with `TEST_PLAN_V2.md` §B.13

`TEST_PLAN_V2.md` §0.3 set the rule: when this document landed, reconcile §B.13 against it, editing
**only** that table and never an individual test-case row.

**Result of the reconciliation: §B.13 needs no edit.** Every acceptance criterion in §5 above is an
id already defined there, used with the same meaning. This document adopts that namespace wholesale
rather than renaming it, because the namespace was well chosen and 102 P0 rows already point at it.

Four follow-ups for QA, none of which touches an `AC-`:

1. **One coverage gap** (F2): no P0 case asserts that an AI-help action chip cannot widen a
   permission. Add a `TC-` row under the existing **`AC-SEC-1`**.
2. `AC-HRN-5` and `AC-DEG-3` are exercised by this document's §7 but are not referenced in §5,
   because they belong to no single numbered requirement. They stay as written.
3. **A wrong citation to retire, not an AC change.** `TASK_PLAN_V2.md` §7 R3 and an earlier draft of
   this document both attributed *"a brand-new workspace sees no invented data"* to **TC-119**. Per
   §B.13 that statement is **AC-DATA-1 / TC-128**; TC-119 is AC-DEG-1's mock-mode zero-egress case.
   Both are P0, both gate the release, and they are not the same test.
4. **A shape conflict §B should settle, not this document.** UC-V2-1 step 3 describes the template
   gallery as cursor-paged (`?limit=24`); `AGENT_TEMPLATE_GENERATOR.md` §9.4, which owns the route,
   specifies `page`/`perPage` with `{ templates, total, page, perPage }`. TC-001/TC-002 assert
   against whichever ships — and §6 step 3 of this document follows the route's owner. Activity
   (`AC-ACT-1`) is genuinely cursor-paged; templates are not.

### Requirement → criteria → wave, in one table

| Original item | Feature | Acceptance criteria | Waves |
|---|---|---|---|
| 1 · clean up the mock data | F1 | AC-DATA-1, AC-DATA-2, AC-DEG-1, AC-SEC-2 | W0-8 … W0-12 |
| 2 · AI help to guide the user | F2 | AC-ATG-5, AC-SEC-1, AC-DEG-1, AC-I18N-1 *(+1 gap)* | W4-12 **only — see §3.1 row 13; `/hire`, `/dashboard/skills` and the config editor have no task that mounts the panel** |
| 3 · easy setup from a template, six sections | F3 | AC-TPL-2, AC-TPL-4, AC-TPL-5, AC-CTX-1, AC-CTX-2, AC-CTX-3, AC-ATG-6 | W4-8, W4-12 |
| 4 · reminders & schedulers | F4 | AC-SCH-1 … AC-SCH-9 | W3-1 … W3-9 |
| 5 · edit & manage agent config | F5 | AC-CFG-1, AC-CFG-2, AC-HRN-1 … AC-HRN-4, AC-SEC-2 | W5-5 … W5-7 |
| 6 · far more detailed activity | F6 | AC-ACT-1, AC-ACT-2, AC-ACT-3, AC-DATA-1, AC-DEG-1, AC-I18N-2 | W5-1 … W5-4 |
| 7 · Agent Template Generator | F7 | AC-ATG-1 … AC-ATG-6, AC-SKL-1, AC-SEC-1 | W4-2 … W4-10 |
| 8 · Skill Repository | F8 | AC-SKL-1 … AC-SKL-4, AC-SEC-1, AC-SEC-3, AC-CFG-2 | W2-1 … W2-9 |
| 9 · template page, cards + list | F9 | AC-TPL-1, AC-TPL-2, AC-TPL-3, AC-SEC-1, AC-UI-4, AC-I18N-1 | W4-11 |
| 10 · font weight and colour | F10 | AC-UI-1, AC-UI-2, AC-UI-3, AC-UI-4 | W1-1 … W1-5 |
| *(cross-cutting)* | §7 | AC-DEG-2, AC-DEG-3, AC-HRN-5, AC-I18N-1, AC-I18N-2 | W0-2, W0-6 (AC-HRN-5's fresh replay), W6-1 … W6-3 |

Every one of the owner's ten items maps to at least one wave. **Three things this document names do
not**, and they are listed rather than quietly dropped: the AI-help panel on three of its four
screens (§3.1 row 13), the `npm run test:integration` script every integration gate depends on
(§3.1 row 14), and — if §8.11 resolves to "public" — login backoff and email verification (§7.4).
Each needs a task before the release checklist in §7.10 can honestly be walked.

---

## Appendix B · What this document deliberately does not restate

To keep one fact in one place, the following are referenced, never re-specified. If you need the
detail, go to the owner:

| Subject | Owner |
|---|---|
| Migration slot order, the enum-transaction hazard, the 21 conflict resolutions, all 67 tasks | `TASK_PLAN_V2.md` §1, §1a, §2.1, §3 |
| The ten-stage pipeline, `AgentTemplateDraft`, all stage prompts, the linter's 28 codes, materialisation | `AGENT_TEMPLATE_GENERATOR.md` |
| Skill tables, the 101-entry seed, the safety rubric's exact deltas, the sync fetch shapes | `SKILL_REPOSITORY.md` |
| Every runtime table, the 16 inbound events, HMAC signing, the six lifecycle sequences | `BACKEND_INTEGRATION_CONTRACT.md` |
| Every column and index in slots 0007–0012, and the three amendments to §2.1 (`llm_call_kind += 'template_gen'`; `runtime_event_receipts` in 0012; the one-slot shift, because 0007 is already journaled) | `DATA_MODEL_V2.md` §1.1, §2.2, §11.3, §18 |
| The schedule execution path: who fires, the claim protocol, `next_run_at` advance, the misfire policy, the tick route and its authz | `REMINDERS_AND_SCHEDULERS.md` §3 |
| The `HarnessAdapter` abstraction, the capability matrix, engine auto-match, the activity event taxonomy and the Activity page IA | `HARNESSES_AND_ACTIVITY.md` |
| Every screen, every hex, the six palettes, the component inventory | `UI_DESIGN_V2.md` |
| 36 use cases, 169 test cases, the automated strategy | `TEST_PLAN_V2.md` |
| Which fixture is fiction and which is the fallback | `MOCK_DATA_AUDIT.md` §4 |
| The cron engine's API and its decided DST policy | `lib/schedule/cron.ts` — read the file header |
