# Mock / demo / fixture data audit

Scope: every hardcoded fixture, prototype leftover, dev-mode simulator and fabricated
figure in the repository, traced to **all** of its consumers, with a removal sequence that
never leaves `next build` broken between steps.

Method: `lib/data.ts` read in full; every one of its 12 exports traced by name across
`app/**`, `lib/**`, `components/**`, `scripts/**`; repo-wide grep for
`mock|demo|fixture|prototype|placeholder|hardcoded|stub|fake|dummy|seeded|TODO|FIXME`
(112 hits, all triaged below); `lib/store.tsx`, `lib/db/seed.ts`,
`lib/agent-manager/mock.ts`, `lib/payments/config.ts` and every page that imports from
`@/lib/data` read line by line.

**Classification key**

| | Meaning |
|---|---|
| **A · DELETE** | Pure fiction, no production purpose. |
| **B · REPLACE WITH DB QUERY** | UI needs this data, but it must come from Postgres. |
| **C · KEEP** | Real fallback, reference catalog, or dev-mode mock that production disables **by configuration** (env var named per row). |
| **D · KEEP BUT GATE** | Only reachable for the seeded demo account or outside production. |

**Counts:** A = 10 · B = 6 · C = 18 · D = 7 · **41 findings**

> **Re-verified against the working tree before Wave 0 was planned.** `lib/data.ts` is 394 lines
> with **10** exports, not 412/12 — `hireChannels` and `overviewFeed` were already deleted, and
> the two rows for them below are struck through rather than removed so the count still
> reconciles. Every other line reference in §1.1 has been re-anchored. Treat §1.1's line numbers
> as accurate as of this revision and re-grep by symbol name, never by line, when implementing.

---

## 1 · Inventory

### 1.1 `lib/data.ts` — the prototype mock module (394 lines, 10 exports)

| file:line | symbol | what it fakes | class | consumers | replacement plan |
|---|---|---|---|---|---|
| `lib/data.ts:25-34` | `rolesData` | The 8-role job catalog (prospector…opc) with `mono`, `hue`, `minPlan` | **C** | `lib/db/seed.ts:16,134` · `lib/data.ts:42-49,247` | Legitimate **reference catalog**: the seed's only source for `agent_roles`. It is build-time input, never read at request time. Keep as-is; the runtime read path is already `GET /api/roles` → `agent_roles`. |
| `lib/data.ts:41-50` | `landingRoles` | 8 long marketing blurbs, `featured` flag on `opc` | **C** (seed) + **B** (landing) | `lib/db/seed.ts:14,138` (→ `agent_roles.long_blurb`) · **`app/page.tsx:9,510`** | Seed use is fine. The **landing-page use is class B**: `app/page.tsx` renders the catalog straight from this array, so (a) the blurbs are hardcoded English in a four-language app, and (b) the roster can disagree with `GET /api/roles`, which now prefers OpenClaw Manager templates and falls back to `agent_roles`. Landing must fetch `GET /api/roles` (cacheable — see §4) and render `longBlurb ?? blurb`. |
| `lib/data.ts:52-207` | **`agentsData`** | **The fake roster** — Nova / Atlas / Mei / Juno, with invented VM ids (`sgp-04`, `fra-01`), uptimes, credit balances, 16 activity lines, 13 tasks, 12 metrics, 5 improvement suggestions and 10 chat turns | **A** | `lib/store.tsx:21,296` · `lib/db/seed.ts:11,206` | **Delete.** The store consumer is dead (§1.2). The seed consumer dies with the demo workspace (§3, step 6). Nothing else in the repo reads it. |
| `lib/data.ts:210-243` | `genTexts` | Default instructions + rules per role | **C** | `lib/db/seed.ts:12,142-143,219-220` | **Reference catalog.** Written into `agent_roles.default_instructions` / `.default_rules`, which is the deterministic fallback `POST /api/agents/generate-brief` returns when `OPENROUTER_API_KEY` is unset (`app/api/agents/generate-brief/route.ts:32-37,88-89`). This is exactly the "AI feature must work with no key" guarantee — load-bearing, see §4. |
| `lib/data.ts:246-248` | `roleIdByName` | Reverse map name → id | **A** | `lib/db/seed.ts:15,207` | Exists only to map `agentsData[].role` (a display string) back to a role id. Dies with `agentsData`. |
| `lib/data.ts:250-257` | `channelDefs` — **`fields` only** | Which credentials each channel needs (`BOT TOKEN`, `APPID`, …) + placeholder examples | **B** | `app/dashboard/channels/page.tsx:5,53,86,109,150` | The **field schema** is real and belongs in code, but the **list** must come from the API. Today the page iterates the array and looks the DB row up by display name through `TYPE_BY_NAME`. Replace: iterate `GET /api/channels` rows (`channels` table, `type` enum) and key the field schema off `type`, not off the string `"WeChat 微信"`. |
| `lib/data.ts:251-256` | `channelDefs[].connected` / `.note` | `connected: true`, `note: "USED BY NOVA"`, `"USED BY ATLAS · MEI"`, `"USED BY JUNO (PENDING)"` | **A** | `app/dashboard/channels/page.tsx:161` — `const note = ch?.label || d.note` | **Fiction rendered to real users.** Any workspace whose `channels.label` is null sees "USED BY NOVA" on its own Channels screen. `.connected` has no consumer at all (status comes from `ch?.status`). Delete both fields; render the real agent names by joining `agent_channels` → `agents`. |
| ~~`hireChannels`~~ | — | Default channel tick-boxes for the hire wizard | **A — ALREADY GONE** | **none** | **Re-verified against the working tree: this export no longer exists in `lib/data.ts`.** It was removed before this audit was published. No task; listed so nobody goes looking for it. `app/hire/page.tsx` builds its own defaults from `CHANNEL_TYPES`. |
| `lib/data.ts:261-268` | `heroFeed` | 6 invented activity lines cycling in the landing hero card | **C** | `app/page.tsx:9,45-47` | Landing-page **illustration**, not workspace data — legitimate marketing chrome. But it is untranslated English in a four-language app: move verbatim into `lib/i18n/landing.ts` as `heroFeed: {time, txt}[]` for all four locales. See RISKS for the fabricated-metric caveat. |
| ~~`overviewFeed`~~ | — | Fake dashboard activity feed (Atlas/Nova/Juno/Mei) | **A — ALREADY GONE** | **none** | **Re-verified: no longer exists in `lib/data.ts`.** No task. `app/dashboard/page.tsx` already renders `api.dashboard().activity`, served from `agent_activities` by `app/api/dashboard/route.ts:19-36`. |
| `lib/data.ts:281-329` | `demoSeatMix`, `DAYS_PER_CYCLE`, `demoSeatSubtotal`, `overageCost`, `estimate`, `demoCycleTotal`, `spanDays` — all module-private except `demoCycleTotal` | Prices "the demo roster" — 2 Professional + 2 Associate seats — for every viewer | **D** | `lib/data.ts:329,349-351,394,403-406` (internal) | Only meaningful for the seeded workspace. `demoCycleTotal` survives as long as `invoiceFixtures` does; the rest dies with `getBillDatasets`. |
| `lib/data.ts:330-334` | `invoiceFixtures` | 3 fake paid invoices (Jun/May USD·Stripe, Apr CNY·Alipay) | **D** | `lib/db/seed.ts:13,321` | Seed-only, and the **only** fixture exercising the per-invoice-currency render path (`app/dashboard/billing/page.tsx:52-61`). Keep while the demo workspace exists; delete with it. |
| `lib/data.ts:341-394` | **`getBillDatasets`** | Credit totals (`18,420`, `27,910`, `71,300`, `9,940`), included allowances, 56 hardcoded bar heights, x-axis labels, "4 agent seats", per-agent breakdown rows | **B** | **`app/dashboard/billing/page.tsx:21,114-115`** → rendered at `:324,337,354-356,388,404-433` | **The largest production lie in the repo — it renders for every paying customer, not just the demo account.** A brand-new workspace with zero agents sees a 14-bar credit chart, "CREDITS · THIS CYCLE (JUN 1 – 13)" and an estimate for 4 seats. See §2 for the exact replacement query. |

### 1.2 `lib/store.tsx` — "legacy prototype agent state"

| file:line | symbol | what it fakes | class | consumers | replacement plan |
|---|---|---|---|---|---|
| `lib/store.tsx:21` | `import { agentsData }` | — | **A** | — | Delete with the block below. |
| `lib/store.tsx:134-141` | `AppState` fields `createdAgent`, `setCreatedAgent`, `agents`, `getAgent`, `paused`, `togglePause`, `isPaused` | A client-side agent roster and pause map that shadows the real API | **A** | **none** — verified: every `useApp()` call site (`app/page.tsx:26`, `app/hire/page.tsx:36`, `app/dashboard/**`, `components/**`, 30 sites) destructures only `lang`/`user`/`workspace`/`authReady`/`theme`/`direction`/`currency` and the auth methods | **Delete the whole block** (`:21`, `:134-141`, `:160-161`, `:295-304`, `:324-330`, and `createdAgent, agents, getAgent, paused, togglePause, isPaused` from the dep array at `:335`). Real pause/resume already goes through `POST /api/agents/[id]/lifecycle`; `app/dashboard/fleet/page.tsx` reads `a.status === "paused"` off the DTO. |

### 1.3 `lib/types.ts` — prototype-only type surface

| file:line | symbol | class | consumers | plan |
|---|---|---|---|---|
| `lib/types.ts:6-12` | `Screen` | **A** | **none** | Delete. |
| `lib/types.ts:28-33,35-41,43-48,50-54,56-60` | `ActItem`, `TaskItem`, `PerfItem`, `QueueItem`, `ChatMsg` | **A** | `lib/data.ts` only | Delete after `agentsData`. |
| `lib/types.ts:62-82` | `Agent` (the presentational one, with `hue`/`mono`/`st`/`sc`/`up`) | **A** | `lib/data.ts:52` · `lib/store.tsx:30,135-138` | Delete. Not to be confused with `Agent` from `lib/db/schema.ts:793`, which is load-bearing (§4). |
| `lib/types.ts:90-96,98-101,109-128,135-142` | `ChannelDef`, `GenText`, `BillDataset`, `InvoiceFixture` | **A/B/C/D** — follow their data | `lib/data.ts` only | `GenText` survives with `genTexts`; `InvoiceFixture` with the demo seed; `BillDataset` and `ChannelDef` die with §2.1 / §2.3. |
| `lib/types.ts:14-26` | `Role` | **C** | `lib/data.ts:25,41` | Keep while `rolesData` seeds the catalog. |
| `lib/types.ts:1` | `/** Shared domain types for the ArkAgent prototype. */` | cosmetic | — | Reword; `Lang` is imported by 21 modules and this file is permanent. |

### 1.4 `lib/db/seed.ts` — the demo workspace

| file:line | symbol | what it fakes | class | plan |
|---|---|---|---|---|
| `lib/db/seed.ts:23-24` | `DEMO_EMAIL = "demo"`, `DEMO_PASSWORD = "demo123"` | Public demo login | **D** | §5 — the full fate of this account. |
| `lib/db/seed.ts:31-34` | `ADMIN_EMAIL = "admin@iagent.cc"`, `ADMIN_PASSWORD = "Lightark@1"` | Hardcoded platform-admin credential, live on any host where the seed has run | **D — security-critical** | Not mock data, but it ships in the source tree. Make `ADMIN_PASSWORD` **required** when `NODE_ENV=production`: `process.exit(1)` instead of the console warning at `:338-352`. |
| `lib/db/seed.ts:40-42,55-86` | `num`, `daysAgo`, `daysAhead`, `mapStatus`, `mapTask`, `mapTag`, `planForAgent`, `channelsForAgent`, `roleEngine` | Translate prototype strings (`"WORKING"`, `"✓"`, `"6,420"`) into enums; `planForAgent`/`channelsForAgent` switch on the literal names `Nova`/`Atlas`/`Mei`/`Juno` | **A** (except `roleEngine`, **C**) | `roleEngine` feeds `agent_roles.default_engine` and stays. Everything else dies with `agentsData`. |
| `lib/db/seed.ts:94-131` | `planCatalog` (3 tiers, features, included credits) | — | **C** | Real reference data, priced from `lib/pricing.ts` via the upsert at `:116-131`. |
| `lib/db/seed.ts:134-147` | `roleRows` → `agent_roles` | — | **C** | The catalog seed. Keep. |
| `lib/db/seed.ts:155` | `LEGACY_DEMO_EMAILS = ["wei@company.com"]` | Cleanup list for a renamed demo login | **D** | Dies with the demo block. |
| `lib/db/seed.ts:176-187` | Workspace `"Ark Industries Pte Ltd"`, `creditsIncluded: 30000`, `creditsUsed: 18420` | Invented usage matched to `getBillDatasets().cycle.cr` | **D** | §5. |
| `lib/db/seed.ts:190-203` | `channelSeed` (7 channels with invented statuses) | — | **D** | Demo-workspace rows. |
| `lib/db/seed.ts:206-314` | The `for (const a of agentsData)` loop — agents, tasks, activities, metrics, improvements, agent_channels, subscriptions, conversations, messages, usage_records | — | **D** | §5. |
| `lib/db/seed.ts:320-331` | Invoice insert `INV-2026-100..102` | — | **D** | §5. |
| `lib/db/seed.ts:367-407` | `seedPlatformAdmin()` | — | **C** | Correct as designed (deliberate overwrite defeats email squatting). Only the default password is the problem. |

### 1.5 Dev-mode simulators (all env-gated)

| file:line | symbol | what it fakes | class | gate | notes |
|---|---|---|---|---|---|
| `lib/agent-manager/mock.ts:18-97` | `mockClient` — `provisionAgent`, `updateAgent`, `sendMessage`, `setLifecycle`, `upsertChannel` | VM provisioning, deployment, lifecycle, channel config | **C** | **`AGENT_MANAGER_MODE`** (`lib/agent-manager/index.ts:8` — live only when `=== "live"`) | Gate is **weaker than payments**: unset ⇒ mock, even in production. Harden — see §4/RISKS. |
| `lib/agent-manager/mock.ts:99-101` | `mockReply(role, body)` | Role-flavoured canned agent reply | **C** | `AGENT_MANAGER_MODE` **and** `OPENROUTER_API_KEY` | `app/api/agents/[id]/messages/route.ts:132` reaches it only when there is no live OpenClaw `externalId` **and** no LLM key (`:90-95`). |
| `lib/agent-manager/mock.ts:62-78` | `mockClient.sendMessage` | — | **A** (body) | — | Unreachable in practice: the messages route calls `mockReply` directly and never `sendMessage`. Its `replyFor("", …)` always takes the generic branch, and the comment at `:66-68` is a half-finished sentence. Keep the method (the `AgentManagerClient` interface requires it), delete the dead comment and make it delegate to `mockReply`. |
| `app/api/agents/[id]/messages/route.ts:131-143,351-362` | canned-reply branch + `tokenizeMockReply` | Streams a canned reply token-by-token with a 15 ms sleep so it *looks* like a model | **C** | `AGENT_MANAGER_MODE` + `OPENROUTER_API_KEY` | In production this should 503 like self-review does (`app/api/agents/[id]/self-review/route.ts:34-36`), not pantomime a model. |
| `lib/payments/config.ts:20-28,54-80,127-151` | `mode: "mock"` for Stripe and Alipay | Inline order fulfilment: a real subscription + paid invoice with no provider account | **C** | **`NODE_ENV`** + **`PAYMENTS_MODE`** | **The reference implementation of a correctly gated mock.** Absent credentials resolve to `unconfigured` (503) in production; `mock` requires an explicit `PAYMENTS_MODE=mock`. Verified by `scripts/check-payments.ts:32-61`. Do not touch. |
| `app/api/billing/checkout/route.ts:70-90` | mock-mode fulfilment branch | — | **C** | as above | |
| `app/payment/page.tsx:69-79,443` | `paidRef` mock receipt | — | **C** | as above | Says so on screen rather than implying money moved. |
| `app/api/agents/generate-brief/route.ts:32-37,88-89` | fallback to `agent_roles.default_*` | — | **C** | **`OPENROUTER_API_KEY`** | Deterministic rule-based fallback. Load-bearing (§4). |
| `lib/llm/usage.ts:79-81` | `estimated: true` when no usage sample | — | **C** | — | Correct: flags zeros as placeholders so aggregate spend never under-reports as fact. |
| `lib/llm/openrouter.ts:43` | `DEFAULT_MODEL = "openai/gpt-4o-mini"` | — | **C** | `LLM_MODEL` | |
| `app/lib/openclaw_manager_api.ts:6-9` | `BASE_URL` default `https://clawmanager.lightark.cc`, `API_KEY` default `""` | — | **C** | `OPENCLAW_MANAGER_API_URL` / `_API_KEY` | Silently points at a specific host when unset. Should throw at module init in production. |
| `scripts/check-llm.ts`, `check-payments.ts`, `check-pricing.ts` | — | — | **C** | dev-only npm scripts | Keep. |

### 1.6 Hardcoded fixtures outside `lib/data.ts`

| file:line | symbol | what it fakes | class | consumers | replacement plan |
|---|---|---|---|---|---|
| `components/DemoPill.tsx` (whole file, 115 lines) | `DemoPill` | Floating "jump between prototype screens" navigator | **A** | **none** — never imported or rendered | Delete the file **and** the 9 nav keys × 4 languages it owns in `lib/i18n/common.ts:18-26,64-72` (`navLanding`, `navSignIn`, `navAccount`, `navHire`, `navDashboard`, `navFleet`, `navBilling`, `navPayment`, `navDirections`). `navFleet`/`navBilling`/`navPayment`/`navAccount`/`navDirections` are **also** used by `app/dashboard/layout.tsx:17-27` — keep those five, drop `navLanding`, `navSignIn`, `navHire`, `navDashboard`. |
| `app/directions/page.tsx` (whole file) · `lib/i18n/directions.ts` · `lib/theme.ts:69-79` (`dirBg`, `dirLime`, `dirInk`, `dirMuted`, `ivory`, `ivoryInk`, `midnight`, `midnightBlue`) | Internal brand-direction pitch page | Three mock hero mockups with "Nova · Sales Prospector", copy reading `"← Back to prototype"` and *"say the word and I'll re-skin everything"* | **D** | `app/dashboard/layout.tsx:22,54` (sidebar nav) · `app/page.tsx:1483` (landing footer) | This is an internal design-review artefact linked from **the production dashboard sidebar and the public landing footer**. Gate the route and both links behind `process.env.NEXT_PUBLIC_SHOW_DIRECTIONS === "1"` (or delete outright). The `DirectionSwitcher` **component** is a real user-facing feature and stays. |
| `app/page.tsx:326-380` | Hero employee card: `"Nova"`, `ENGINE OpenClaw`, `VM sgp-04`, `UPTIME 12d 4h` | Product screenshot | **C** | landing only | Marketing illustration. Keep; see RISKS on the fabricated numbers. |
| `app/page.tsx:895-950` | Self-review card: `31% +4`, `9 +2` | Performance figures | **C** | landing only | Same. |
| `lib/agent-settings.ts:182-198` | `SKILLS` — 14 hardcoded skill ids | The OpenClaw skills ecosystem ("Representative slice") | **B** | `app/dashboard/fleet/[id]/page.tsx:36` (Settings tab) · `DEFAULT_SETTINGS.skills` at `:115` | Replace with the **`skills`** table and the Skill Repository (`lib/skills/**`). Settings should select from `skills` and write rows into **`agent_skills`**, not a string array in `agents.settings` JSONB. |
| `lib/agent-settings.ts:172-180` | `MODELS` — 7 hardcoded model ids | An LLM catalog | **B** | `app/dashboard/fleet/[id]/page.tsx:35` | The ids are unverified against OpenRouter, **and `settings.model` is silently ignored**: `app/api/agents/[id]/messages/route.ts:294-302` calls `streamChatCompletion` without a `model` option even though `CompletionOptions.model` exists (`lib/llm/openrouter.ts:195-196`). Either pass `settings.model` through or stop offering the control. Long-term, source the list from the provider. |
| `lib/agent-settings.ts:143-169,200-221` | `TONES`, `LANGUAGES`, `AUTONOMY_LEVELS`, `REASONING_EFFORTS`, `TOOLS`, `TIMEZONES`, `WEEKDAYS` | — | **C** | Settings tab | Real reference catalogs. Note: all labels are **hardcoded English** and bypass the i18n rule — a separate defect, not mock data. |
| `lib/agent-settings.ts:82-120` | `DEFAULT_SETTINGS` | — | **C** | `mergeSettings` everywhere | Real defaults. `skills: ["web_research","email","summarization"]` at `:115` moves with §1.6/`SKILLS`. |
| `lib/i18n/hire.ts:136-140, 238-242, 338-342, 438-442` | `tasksDefault` (`"Build a list of 50 target accounts"`, `"Send intro sequence to new leads"`) + `remindDefault` | Prefilled first tasks, shown for **every** role including "Custom role" | **B** | `app/hire/page.tsx:54-55` | Sales-prospector copy offered to someone hiring a Legal Reviewer. Source from the selected template (**`agent_templates`** → REMINDERS & SCHEDULERS + first tasks); empty when the template has none. |
| `lib/i18n/roles.ts:15-36` | `roleTranslations` — four empty dictionaries with `// Example:` comment blocks | Scaffolding | **A** | `getTranslatedRole` at `:41-53`, called from `app/hire/page.tsx:160,602` | The **function** is a live pass-through and stays. Delete the four placeholder comment blocks, or populate them — an empty dictionary that always falls through is dead weight that reads as unfinished work. |
| `app/api/roles/route.ts:11-24` | `ROLE_HUES`, `CUSTOM_ROLE` | — | **C** | `/api/roles` | Real: `CUSTOM_ROLE` is upserted so `agents.role_id = "custom"` satisfies the FK. Keep. |
| `app/api/roles/route.ts:106-109` | local-catalog fallback when OpenClaw Manager is unreachable | — | **C** | — | Correct outage behaviour. |
| `app/dashboard/channels/page.tsx:12-19` | `TYPE_BY_NAME` | Display-name → enum bridge | **A** (with §1.1) | channels page | Deleted when the page iterates API rows keyed by `type`. **Load-bearing until then** (§4). |
| `lib/i18n/landing.ts:242-243` (+ zh `:368-369`, zht `:494-495`, ja `:620-621`) | `"14-DAY TRIAL ON EVERY SEAT"`, `"UNUSED CREDITS ROLL OVER ONE CYCLE"` | Product claims | **not mock data — false claims** | landing pricing footer | `stripeTrialDays()` returns **0** unless `STRIPE_TRIAL_DAYS` is set (`lib/payments/config.ts:103-106`), and there is **no credit-rollover code anywhere in the repo**. Either implement both or cut the copy before a public release. |

---

## 2 · Class-B replacements — the exact tables and queries

### 2.1 `getBillDatasets` → `GET /api/billing/usage?range=cycle|last|d90|custom&from=&to=`

Everything the estimate card needs is already in Postgres.

**Credit series (the bar chart).** `usage_records` carries `workspace_id`, `agent_id`, `kind`, `credits`, `created_at`:

```sql
SELECT date_trunc('day', created_at) AS bucket, SUM(credits)::int AS credits
FROM usage_records
WHERE workspace_id = $1 AND created_at >= $2 AND created_at < $3
GROUP BY bucket ORDER BY bucket;
```

Bar heights become `credits / max(credits)`, computed in the serializer — never stored. `x` is `[first bucket, midpoint, last bucket]` formatted client-side through `BCP47[lang]`.

**Headline totals.** `workspaces.credits_included`, `.credits_used`, `.cycle_resets_at` — already served by `app/api/billing/route.ts:37-41` and already overlaid on the chart at `app/dashboard/billing/page.tsx:135-137`.

**Seat subtotal.** `subscriptions` (`workspace_id`, `agent_id`, `plan_id`, `status`) joined to `plans` (`monthly_price_cents`, `monthly_price_fen`) — the same join `app/api/billing/route.ts:15-34` already performs for the seat table. `seatsLabel` becomes `n agent seats` with the real `n` (`billing.seatCount`).

**Overage.** `max(0, credits_used − credits_included) / 1000 × plans.overage_{cents,fen}_per_1k`. `overagePer1k()` in `lib/pricing.ts` already does the arithmetic; only the input must come from the row.

**Per-agent breakdown (`bd.pr`).** `SUM(usage_records.credits) GROUP BY agent_id` over the same window, joined to `agents.name`/`.hue`.

**Discount.** Keep `ANNUAL_DISCOUNT` from `lib/pricing.ts`, applied to the real seat subtotal.

Delete `BillDataset` from `lib/types.ts` and add a `BillingUsageDTO` to `lib/serializers.ts` + `lib/client-api.ts`.

### 2.2 `landingRoles` on the landing page → `agent_roles`

`app/page.tsx:510` iterates the static array. Replace with `GET /api/roles` (`app/api/roles/route.ts` → `agent_roles`, `serializeRole`), rendering `longBlurb ?? blurb` and passing each through `getTranslatedRole(id, name, blurb, lang)`. The "from …/mo" line already derives from `minPlan` at paint time and needs no change.

### 2.3 `channelDefs` list → `channels`

`app/dashboard/channels/page.tsx` iterates `channelDefs` and looks the DB row up by display name. Invert it: iterate `GET /api/channels` (`app/api/channels/route.ts` → `channels`, `serializeChannel`) and index a `CHANNEL_FIELDS: Record<ChannelType, ChannelField[]>` constant by `ch.type`. Labels come from `lib/i18n/channels.ts`; `note` comes from a real join:

```sql
SELECT c.id, array_agg(a.name) AS used_by
FROM channels c
JOIN agent_channels ac ON ac.channel_id = c.id
JOIN agents a ON a.id = ac.agent_id AND a.status <> 'terminated'
WHERE c.workspace_id = $1 GROUP BY c.id;
```

### 2.4 `SKILLS` → `skills` + `agent_skills`

Settings tab reads the catalog from `GET /api/skills` (`skills`, filtered by safety score / `skill_sources`) and writes selections as `agent_skills` rows keyed `(agent_id, skill_id)`. `AgentSettings.skills: string[]` becomes a read-through of that join so the backend agent service can resolve versions and provenance, which a JSONB string array cannot express.

### 2.5 `MODELS` → provider catalog + honour `settings.model`

Short term: pass `model: settings.model === "auto" ? undefined : settings.model` into `streamChatCompletion` at `app/api/agents/[id]/messages/route.ts:294`, and validate the id with `normalizeModelId` before storing. Long term the list is a cached provider fetch, not a literal.

### 2.6 `tasksDefault` / `remindDefault` → `agent_templates`

The hire wizard seeds step 2 from the chosen template's first tasks and its REMINDERS & SCHEDULERS section (→ `agent_schedules` on submit), falling back to `[]` and `""`. Remove the four literal arrays from `lib/i18n/hire.ts`; keep the placeholders.

---

## 3 · Removal sequence

Dependency-ordered. **Every step compiles and boots on its own.** Run `npx tsc --noEmit && npm run build` after each.

**Step 1 — dead code with zero consumers.** No behaviour change.
- Delete `overviewFeed` and `hireChannels` from `lib/data.ts`.
- Delete `components/DemoPill.tsx`; delete `navLanding`, `navSignIn`, `navHire`, `navDashboard` from `lib/i18n/common.ts` (all four languages). **Keep** `navFleet`, `navBilling`, `navPayment`, `navAccount`, `navDirections` — `app/dashboard/layout.tsx:17-27` uses them.
- Delete the four `// Example:` blocks in `lib/i18n/roles.ts:16-35`.

**Step 2 — the legacy store block.** Still no behaviour change (nothing consumes it).
- Remove `lib/store.tsx:21` (`agentsData` import), `:134-141`, `:160-161`, `:295-304`, `:324-330`, and the six names from the dep array at `:335`. Update the module docblock at `:7`.
- `lib/data.ts` now has exactly two runtime consumers left: `app/page.tsx` and `app/dashboard/billing/page.tsx` (plus `app/dashboard/channels/page.tsx`).

**Step 3 — billing (class B, the big one).** Do this before touching the seed: it is the only change that alters what a real customer sees.
- Add `GET /api/billing/usage` per §2.1 (service function in `lib/services/billing.ts`, DTO in `lib/serializers.ts`, client method in `lib/client-api.ts`, Zod range schema in `lib/validation.ts`).
- Rewrite `app/dashboard/billing/page.tsx:114-115` and the render sites at `:324-433` to read the DTO.
- Delete `getBillDatasets`, `estimate`, `overageCost`, `demoSeatSubtotal`, `demoSeatMix`, `DAYS_PER_CYCLE`, `spanDays` from `lib/data.ts`, and `BillDataset` from `lib/types.ts`. Keep `demoCycleTotal` — `invoiceFixtures` still calls it.

**Step 4 — landing roster (class B).**
- `app/page.tsx`: fetch `GET /api/roles`, drop the `landingRoles` import at `:9`, keep `heroFeed` for now.
- `landingRoles` is now seed-only.

**Step 5 — channels (class B + A).**
- Introduce `CHANNEL_FIELDS` keyed by `ChannelType`; rewrite `app/dashboard/channels/page.tsx` per §2.3; delete `TYPE_BY_NAME`.
- Delete `channelDefs` from `lib/data.ts` and `ChannelDef`/`ChannelField` from `lib/types.ts`.

**Step 6 — the fake roster and the demo workspace (class A + D).** Decide §5 first.
- Delete `agentsData` and `roleIdByName` from `lib/data.ts`.
- Delete `lib/types.ts:28-82` (`ActItem`, `TaskItem`, `PerfItem`, `QueueItem`, `ChatMsg`, `Agent`) and `:6-12` (`Screen`).
- In `lib/db/seed.ts`: delete the imports at `:11,15`, the mappers at `:40,55-86` (**keep `roleEngine`**), and the demo block `:149-331`. Move `seedPlatformAdmin()` and the plans/roles seed into a `seedReference()` that always runs; put the demo block behind `SEED_DEMO=1` (§5).
- If the demo workspace is retired entirely: also delete `invoiceFixtures`, `demoCycleTotal` and `InvoiceFixture`, leaving `lib/data.ts` as `rolesData` + `landingRoles` + `genTexts` — at which point **rename it `lib/catalog.ts`**, because nothing in it is mock data any more.

**Step 7 — heroFeed relocation (cosmetic).**
- Move `heroFeed` into `lib/i18n/landing.ts` for all four languages; `lib/data.ts` loses its last landing consumer.

**Step 8 — production gates (no deletions).**
- `AGENT_MANAGER_MODE`: fail fast in production when unset (§4).
- Messages route: 503 instead of `mockReply` when `NODE_ENV === "production"`.
- `ADMIN_PASSWORD`: required in production; `process.exit(1)` rather than the warning banner at `lib/db/seed.ts:338-352`.
- `/directions`: gate route + both links.
- `app/lib/openclaw_manager_api.ts`: throw when `OPENCLAW_MANAGER_API_KEY` is empty in production.

**Step 9 — docs.** `docs/DATABASE.md:522-565`, `docs/SPEC.md:89,102,105,276,278`, `docs/API.md:795-815`, `README.md:8,57,65,78,136` all describe the demo account, the roster and `DemoPill`. Update last, once the code is settled.

---

## 4 · DO NOT BREAK — things that look like mock data but are load-bearing

1. **`genTexts` (`lib/data.ts:210-243`) and `agent_roles.default_instructions` / `.default_rules`.** These *are* the deterministic no-LLM fallback. `POST /api/agents/generate-brief` returns them verbatim when `OPENROUTER_API_KEY` is unset (`:32-37`) and when the provider errors (`:88-89`). Deleting them makes the hire wizard return empty strings on any deployment without a key — a direct violation of the "must work with no LLM API key" constraint.
2. **`rolesData` (`lib/data.ts:25-34`).** The only source for the `agent_roles` catalog. `app/api/roles/route.ts:106-109` falls back to it (via the table) when OpenClaw Manager is unreachable; `POST /api/agents` FKs `role_id` into it.
3. **`CUSTOM_ROLE` upsert (`app/api/roles/route.ts:26-39`).** Looks like a UI placeholder; it is a real row that must exist before any agent can be created with `roleId: "custom"`, or the FK fails.
4. **`lib/payments/config.ts` mock mode.** Correctly gated. Do not "clean it up" — `fallbackMode()` at `:25-28` is the thing that stops production handing out paid seats for free, and `scripts/check-payments.ts` asserts it.
5. **`invoiceFixtures`' April CNY/Alipay row (`lib/data.ts:351`).** The only fixture exercising the per-invoice-currency path at `app/dashboard/billing/page.tsx:52-61`. Remove it and the "a ¥ invoice must stay ¥" regression goes untested.
6. **`TYPE_BY_NAME` (`app/dashboard/channels/page.tsx:12-19`).** Keys are exact display strings including `"WeChat 微信"`. Renaming `channelDefs[].name` without updating this silently breaks connect/disconnect for that channel — it returns early at `:89` with no error.
7. **`Agent` from `lib/db/schema.ts:793`** vs **`Agent` from `lib/types.ts:62`.** Same name, different things. Only the second is deletable. `lib/services/agents.ts:17`, `app/api/agents/[id]/messages/route.ts:22` and `lib/serializers.ts:9` use the schema one.
8. **`lib/agent-manager/mock.ts` while `AGENT_MANAGER_MODE` is unset.** Today the default *is* mock (`lib/agent-manager/index.ts:8`). Deleting the mock before the gate is hardened breaks every non-live deployment, including local dev and CI.
9. **`ENGINE_LABEL` (`lib/agent-display.ts:23`) and `EngineFilter` (`app/dashboard/fleet/page.tsx:13`).** Only `openclaw` and `hermes`. When the enum grows to `codex`/`deepseek`, the fleet card renders `undefined` and the filter silently drops those agents. Not mock data — a break waiting for the harness work.
10. **`app/api/dashboard/route.ts` and `app/api/billing/route.ts`.** Already fully DB-backed. The pages that consume them (`app/dashboard/page.tsx`, and the seats/invoices half of the billing page) need no change; only the chart half is faked.
11. **`lib/theme.ts:71-79` `ivory`/`midnight`/`dir*` tokens.** Used by `components/DirectionSwitcher.tsx:28` to draw the picker swatches, not only by `/directions`. Gating the page must not delete the tokens.
12. **`estimated: true` in `lib/llm/usage.ts:79-81`.** A deliberate honesty flag on zero-cost rows, not a stub.

---

## 5 · The `demo` / `demo123` account — fate for a public production release

**Do not ship it.** `demo` / `demo123` is a guessable credential on a public host, and the workspace behind it contains four agents with real `agent_manager_id` values, a `subscriptions` row per agent and three `paid` invoices. Anyone who signs in can pause, reconfigure, chat with and delete them, and the Channels screen will hand them the workspace's channel config shape.

**Concretely:**

1. **Split the seed in two.** `npm run db:seed` runs `seedReference()` only — `plans` (upsert), `agent_roles`, `CUSTOM_ROLE`, and `seedPlatformAdmin()`. This is safe and idempotent on every host.
2. **Gate the demo block.** Wrap `lib/db/seed.ts:149-331` in `if (process.env.SEED_DEMO === "1" && process.env.NODE_ENV !== "production")`, and add `SEED_DEMO` to `.env.example` documented as dev/CI-only. Add `npm run db:seed:demo` for local use.
3. **Refuse outright in production.** At the top of the demo block: `if (process.env.NODE_ENV === "production") throw new Error("refusing to seed the demo workspace in production")`. A flag alone is not enough — the whole point is that nobody can set it by accident on a live host.
4. **Purge any already-seeded production database.** The existing cleanup at `:156-163` is exactly the right delete (workspace first, then user; cascades handle agents/channels/subscriptions/invoices/usage). Ship it as a one-shot `scripts/purge-demo.ts` that deletes `demo` and every `LEGACY_DEMO_EMAILS` entry, and run it as a release step.
5. **Keep the username-or-email login.** `lib/validation.ts:20` accepts a bare username specifically so `demo` can sign in; that is a general capability, not a demo hack, and registration still requires a real email (`docs/SPEC.md:89`). Leave it.
6. **Replace the demo with a real empty-state.** Every screen that today "looks alive" only because the demo has data — Activity, Performance, the billing chart — needs a designed empty state. `app/dashboard/fleet/[id]/page.tsx:50-60` and `:677-679` already have them; the billing chart (§2.1) and the Channels "used by" note (§2.3) do not.
7. **Same treatment for the platform admin.** `admin@iagent.cc` / `Lightark@1` (`lib/db/seed.ts:31-34`, `.env.example:143`) is a published credential with full console access on any seeded host. Make `ADMIN_PASSWORD` mandatory in production and turn the warning banner into a hard exit.
8. **Update the docs in the same commit.** `README.md:8,65` advertises the credential at the top of the file; `docs/DATABASE.md:557` and `docs/SPEC.md:102,276` repeat it.

---

## RISKS

- **`AGENT_MANAGER_MODE` defaults to mock.** Unlike `PAYMENTS_MODE`, an unset value in production yields the in-process simulator: agents report `working`, invent VM ids, and never touch a real machine, while the customer is billed for a seat. This should mirror `lib/payments/config.ts:25-28` — production + no `AGENT_MANAGER_BASE_URL` ⇒ hard failure, not simulation. Highest-severity finding in this audit.
- **Fabricated metrics on the public landing page.** `31% reply rate`, `9 meetings booked`, `12d 4h` uptime and a named agent "Nova" are presented as a product screenshot with no "illustrative" marker. Fine as design; a substantiation problem the moment the site is a public commercial page. Recommend a visible `ILLUSTRATIVE` label or replacing them with figures you can back.
- **Marketing claims with no implementation.** "14-DAY TRIAL ON EVERY SEAT" (`stripeTrialDays()` = 0 by default) and "UNUSED CREDITS ROLL OVER ONE CYCLE" (no rollover code exists). Both appear in all four locales.
- **`AgentSettings.model` is stored and ignored.** The Settings tab writes it to `agents.settings`, the backend agent service will read it from Postgres and honour it, and ArkAgent's own chat path does not — so the same agent answers with two different models depending on which side is driving.
- **The four-harness enum change is a UI break, not just a DB one.** `ENGINE_LABEL`, `EngineFilter`, `roleEngine()` and `seed.ts:216` (`a.engine.toLowerCase()`) all assume two engines.
- **`docs/*` will be wrong the moment step 6 lands.** `docs/DATABASE.md:542,555-565` documents the demo workspace as a feature of the schema. Left stale, it will be re-implemented by someone reading the docs.
