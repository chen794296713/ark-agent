# ArkAgent

**Hire an AI employee, not another app.**

ArkAgent is a full-stack platform for **hiring autonomous AI agents** that run on dedicated VMs — selling, supporting, recruiting, and writing for you around the clock. You brief an agent like a person (role + instructions + rules), pick its channels, and manage it from the web console **or** from the messaging apps you already use (Telegram / WhatsApp / WeChat / LINE / Slack / Email).

🌐 Live: **[arkagent.ai](https://arkagent.ai)** (global) · **iagent.cc** (中国大陆)
🔑 Demo login: **`demo` / `demo123`** — opt-in via `npm run db:seed:demo`, and **refused in production**. It is a guessable credential and the workspace behind it owns real agents, billing seats and paid invoices. Every account you register starts empty.

---

## Four harnesses, one control plane

An agent runs on a **harness** — the runtime that actually executes it on its VM. ArkAgent supports
four, behind one configuration surface:

| Harness | Positioning | Best for | Provisionable today |
|---|---|---|---|
| **OpenClaw** | Portable skills + local execution (shell / files / browser / docker) across 10 channels | Outreach, support, channel-heavy roles | **Yes** |
| **Hermes** (Nous Research) | Model-agnostic provider with a self-improving learning loop | Research, long-horizon "one-person company" ops | **Yes** |
| **Codex Harness** (OpenAI) | Repository-scoped coding agent, pinned to its own model family | Engineering work inside a codebase | Not yet — see below |
| **DeepSeek Harness** | Files-and-network agent, pinned to its own model family | Document and data work | Not yet — see below |

All four read the same portable `SKILL.md` format from `.agents/skills/`, so a skill is not written
per harness — compatibility is about *runtime dependencies* (binaries, environment, config), which
is what the Skill Repository records.

**Codex and DeepSeek are in the enum, the schema and the code, but gated out of every picker.** The
OpenClaw Manager has not assigned them a `category_id`, so [`categoryIdFor()`](lib/harness/provisioning.ts)
throws rather than guessing — previously a two-way branch on a four-value enum would have
provisioned a *Hermes* VM for anyone who hired a Codex agent, silently. Enable them with
`ATG_ENABLED_HARNESSES` once the runtime team assigns ids.

Capability claims are **tri-state** ([`lib/harness/profiles.ts`](lib/harness/profiles.ts)):
`yes` / `no` / `unknown`. `unknown` means *nobody has verified it*, and it never renders a control —
a switch built on an unverified claim is one that silently does nothing.

> ArkAgent is the **control plane**: it owns identity, workspaces, agent configuration, billing and
> the operator UI. It does **not** run agents. A separate **Agent Manager** provisions a VM per
> agent, deploys the harness, monitors it and bridges it to channels. ArkAgent calls it over an
> outbound HTTP API and receives HMAC-signed webhooks back. In development an in-process **mock**
> stands in; **in production an unconfigured runtime returns `503` rather than simulating one.**

---

## Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16.3** (App Router, Turbopack, React Compiler) |
| UI | **React 19.2** + **TypeScript 5** (strict) |
| Database | **Postgres** + **Drizzle ORM** (`postgres-js`), migrations via `drizzle-kit` |
| Auth | Custom email + HTTP-only session cookies (`node:crypto` scrypt; only token SHA-256 stored) |
| Validation | **Zod 4** at every request boundary |
| Styling | Inline-style design system in [`lib/theme.ts`](lib/theme.ts), responsive. Three brand directions — **Terminal Lime**, **Ivory Studio**, **Midnight Console** — each in dark + light, ported from the Claude Design source |
| i18n | English / 简体中文 / 繁體中文 / 日本語 — natively written, persisted per user |
| LLM | **OpenRouter** (model-agnostic via `LLM_MODEL`) — agent replies, brief generation, self-review |
| Payments | **Stripe** (USD, international) + **Alipay** via the GoHire gateway (CNY, 中国大陆) — one price ladder in [`lib/pricing.ts`](lib/pricing.ts), integer minor units end to end |
| Scheduling | A dependency-free cron engine with IANA time zones and explicit DST policy ([`lib/schedule/cron.ts`](lib/schedule/cron.ts)) — no npm package |
| Tests | **`node:test`** via `tsx` — no test framework dependency |
| Hosting | **Vercel** (Node 24 LTS), two cron entries in [`vercel.json`](vercel.json) |

Runtime dependencies are intentionally tiny: `next`, `react`, `drizzle-orm`, `postgres`, `zod`, and `stripe` (the only SDK — the Alipay gateway is plain `fetch`).

---

## Getting started

**Prerequisites:** Node 24 (see `.nvmrc`) and a Postgres database.

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
#   Fill in DATABASE_URL + DIRECT_DATABASE_URL. Nothing else is required to run
#   locally: payments start in mock mode and the agent runtime is simulated
#   until you add keys. Set CRON_SECRET if you want to exercise the scheduler
#   tick — those routes fail closed without it.

# 3. Apply the schema + seed reference data (plans, roles, platform admin)
npm run db:migrate
npm run db:seed

#    …and optionally the demo workspace (dev/CI only; refused in production)
npm run db:seed:demo

# 4. Load the skill catalogue so /dashboard/skills has something to show
npm run skills:seed

# 5. Run
npm run dev        # http://localhost:3000  (or the PORT set in .env)
```

After `npm run db:seed:demo`, sign in with **`demo` / `demo123`** to explore a fully-populated workspace, or **create an account** (a real email is required) to start with an empty one.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a SQL migration from the schema |
| `npm run db:migrate` | Apply migrations (uses `DIRECT_DATABASE_URL`) |
| `npm run db:push` | Push the schema directly (dev shortcut) |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:seed` | Seed reference data only — plans, agent roles, the platform admin |
| `npm run db:seed:demo` | Also build the demo workspace (dev/CI only; throws in production) |
| `npm run db:check` | Replay every migration into a scratch database, fresh **and** incrementally |
| `npm test` | Unit tests (`node:test` via `tsx`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run llm:check` | Verify `OPENROUTER_API_KEY` + `LLM_MODEL` work end-to-end |
| `npm run pricing:check` | Assert the USD/CNY price ladder, annual math and currency routing (no DB, no keys) |
| `npm run payments:check` | Assert the Stripe/Alipay mode resolution, including the production fail-closed |
| `npm run skills:seed` | Load the curated skill catalogue into the database |
| `npm run skills:sync` | Refresh the Skill Repository from its allowlisted sources |

**Agent runtime.** `AGENT_MANAGER_MODE=mock` uses the in-process simulator; `live` plus `AGENT_MANAGER_BASE_URL` talks to a real Agent Manager. Unset, it is inferred — and **in production it resolves to `unconfigured`, which returns `503`**, because a simulated fleet reports every agent as working, invents VM ids and uptimes, and bills for a seat behind which no machine was ever started.

**Schedules.** With `CRON_SECRET` set you can fire the tick by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/schedules
```

It claims due schedules, dispatches them, advances `next_run_at` and records a run. It is safe to call twice — the claim protocol makes a duplicate fire impossible.

**LLM.** Set `OPENROUTER_API_KEY` and `LLM_MODEL` (an OpenRouter id like `openai/gpt-5.6-luna`; an `openrouter/` prefix is accepted and stripped) to enable real agent replies, hire-brief generation and self-review. Without a key the app falls back to seeded defaults and the deterministic template generator, so it still runs — except that in **production** agent chat returns `503` rather than streaming a canned reply that only looks like a model. Run `npm run llm:check` to confirm the key and model resolve.

**Payments.** With no payment keys configured, checkout is fulfilled inline — you get a real subscription and a real paid invoice without an external account, so the whole flow works on a fresh clone. See [Payments](#payments) below.

---

## Features

| Area | What works, backed by the database and API |
|---|---|
| **Auth** | Register / login (email *or* username) / logout, plus Google and WeChat SSO. scrypt + HTTP-only cookie sessions; only the token's SHA-256 is stored |
| **Template gallery** | `/dashboard/templates` — browse agent templates in **card or list view**, filter by role, harness, category and difficulty, and open a detail drawer showing all six configuration sections |
| **AI-guided creation** | Describe what you need in plain language; the **Agent Template Generator** drafts every section for you to review and edit before anything is created |
| **The six sections** | ROLES · AGENTS · SKILLS · RULES & BOUNDARIES · CONTEXT (file upload + pasted text) · REMINDERS & SCHEDULERS — all persisted to Postgres for the runtime to read |
| **Skill Repository** | `/dashboard/skills` — searchable catalogue with a **deterministic risk score** (no model needed), harness compatibility, and an SSRF-guarded sync pipeline that lands discovered skills as `draft`, never `published` |
| **Reminders & schedulers** | Natural-language scheduling in four languages, a dependency-free cron engine with real IANA/DST handling, a per-minute tick with an exactly-once claim protocol, and per-schedule run history |
| **Agent management** | Full configuration editing — brief, rules, skills, context, schedules, harness, channels, limits — with a config revision the runtime polls so a save that has not reached the VM says so |
| **Activity** | Timeline, run drill-down with step traces, health and uptime, token and credit analytics |
| **Fleet & chat** | Roster, live feed, streamed chat in the agent's persona, self-review queue, pause / resume / terminate |
| **Channels** | Telegram · WhatsApp · WeChat · LINE · Slack · Email · Feishu · DingTalk · WeCom (secrets masked on read) |
| **Billing** | Credits and per-agent usage computed from real `usage_records`, invoices, and seat purchase via **Stripe** (USD) or **Alipay** (CNY) |
| **i18n & theme** | EN / 简 / 繁 / 日, three brand directions × dark and light — six palettes, all meeting a written contrast contract enforced by tests |

### Accessibility and contrast

The colour ramp has a contract, and it is a test rather than a comment:

| Tier | Floor | Used for |
|---|---|---|
| `--c-text` | ≥ 13:1 | headings, values, active nav |
| `--c-text2` | ≥ 9.5:1 | **default body copy** |
| `--c-muted` | ≥ 7:1 | secondary copy and every mono label |
| `--c-faint` | ≥ 4.5:1 | **tertiary only** — timestamps, placeholders, never a sentence |

Every tier is measured against all four surfaces it can be painted on, in all six palettes, by
[`tests/contrast.test.ts`](tests/contrast.test.ts) — which parses `app/globals.css` itself, so a
hand edit cannot pass while the tokens say otherwise. The stylesheet previously *claimed* AAA in a
comment and was wrong in five of six palettes.

---

## Payments

ArkAgent sells one thing — an **agent seat** — into two markets, with two currencies and two providers:

| Market | Currency | Provider | Seat renewal |
|---|---|---|---|
| International | **USD** — $49 / $149 / $399 per month | **Stripe** hosted Checkout | Stripe subscription, renews itself |
| 中国大陆 | **CNY** — ¥349 / ¥1,068 / ¥2,868 per month | **Alipay**, via the GoHire gateway | one-off payment opening a fixed period (30 days monthly, 365 annual); renewal is a fresh purchase |

Annual is billed up front at **−20%**. CNY is a local price ladder, not an FX conversion of the USD one. Both live in [`lib/pricing.ts`](lib/pricing.ts) as **integer minor units** (US cents / 人民币分) — nothing in the money path is ever a float, and no screen hardcodes a currency symbol.

A seat is granted only when the provider confirms out of band (`/api/webhooks/stripe`, `/api/payments/alipay/callback`), never by the browser returning from the payment page. Fulfilment is exactly-once by a conditional claim on the order row inside a single transaction, which also writes the subscription, the invoice and an audit row — so a provider retry, a concurrent redelivery, or a crash mid-fulfilment all land somewhere safe.

**In development, with no payment keys at all, the app still works end to end** — checkout fulfils inline and creates a real subscription and invoice, which is what keeps the demo and a fresh clone usable. **In production that fallback is deliberately unavailable**: an unconfigured provider returns `503` rather than quietly handing out paid seats for free.

> **Setting it up for real?** [**docs/PAYMENTS.md**](docs/PAYMENTS.md) has the full architecture, every env var, and step-by-step operator checklists for what to do in the Stripe Dashboard and what to ask the Alipay gateway operator for.

---

## Project layout

```
app/
  page.tsx  auth/  hire/  hire/create/  payment/  directions/
  dashboard/                shell (auth gating) + overview · fleet · fleet/[id] · templates ·
                            skills · channels · billing · account · admin
  api/                      58 Route Handlers — auth & SSO, agents, lifecycle, messages, skills,
                            templates, schedules, activity/runs/health, channels, billing,
                            payments, cron, admin, webhooks
components/
  ui.tsx  MobileNav  ThemeToggle  DirectionSwitcher  LanguageSwitcher  CurrencySwitcher
  template/                 gallery card · row · drawer
  create/                   the AI-guided creation steps
  manage/                   skills · context · schedules · rules panels
  activity/                 timeline · run drawer · health · cost
lib/
  db/                       schema.ts (37 tables) · migrations/ · seed.ts · demo-fixtures.ts
  harness/                  index.ts (the four harnesses) · profiles.ts (tri-state capabilities) ·
                            provisioning.ts (category ids, the enablement gate)
  schedule/                 cron.ts (IANA + DST) · parse.ts (NL → cron) · describe.ts (cron → prose)
  schedules/                validation · serialize · nl · limits · client
  skills/                   types · taxonomy · safety (risk scoring) · queries · sync/
  atg/                      types (AgentTemplateDraft) · schema (Zod mirror) · defaults · safety
  activity/                 types · queries · serialize
  runtime/types.ts          the JSONB payload contract shared with the backend team
  services/                 agents · billing · schedules · openclaw_instances
  payments/                 config · orders · stripe · alipay
  llm/  i18n/  channels.ts  pricing.ts  theme.ts  auth.ts  api.ts  feature-flags.ts
scripts/
  check-migrations.ts       fresh + incremental migration replay (npm run db:check)
  check-llm.ts  check-pricing.ts  check-payments.ts  sync-skills.ts
tests/                      node:test via tsx — cron/DST, NL parsing, contrast, harness,
                            billing windows, skills safety, activity, schedules
```

## Documentation

**Start here**

| Document | For |
|---|---|
| [**PRODUCT_SPEC.md**](docs/PRODUCT_SPEC.md) | What the product is and does, feature by feature, with current status |
| [**USER_GUIDE.md**](docs/USER_GUIDE.md) | The end-user guide — hiring and managing an agent, no technical background assumed |
| [**DEPLOYMENT.md**](docs/DEPLOYMENT.md) | Build, deploy, configure and operate it |
| [**BACKEND_INTEGRATION_CONTRACT.md**](docs/BACKEND_INTEGRATION_CONTRACT.md) | **The specification the runtime team implements** — self-contained |
| [**BACKEND_CHANGELOG.md**](docs/BACKEND_CHANGELOG.md) | **What changed and what the runtime team must now do** — the handoff, with four named blockers |

**Design corpus** (`docs/README_V2.md` is the index)

| Document | For |
|---|---|
| [TASK_PLAN_V2.md](docs/TASK_PLAN_V2.md) | **Normative.** The conflict ledger, wave plan and migration slot order |
| [PRP.md](docs/PRP.md) | The rewritten requirements brief and its assumption ledger |
| [DATA_MODEL_V2.md](docs/DATA_MODEL_V2.md) | Every table, column, index and JSONB payload |
| [AGENT_TEMPLATE_GENERATOR.md](docs/AGENT_TEMPLATE_GENERATOR.md) · [SKILL_REPOSITORY.md](docs/SKILL_REPOSITORY.md) | The two biggest subsystems |
| [REMINDERS_AND_SCHEDULERS.md](docs/REMINDERS_AND_SCHEDULERS.md) · [HARNESSES_AND_ACTIVITY.md](docs/HARNESSES_AND_ACTIVITY.md) | Scheduling and observability |
| [UI_DESIGN_V2.md](docs/UI_DESIGN_V2.md) | Screens, the contrast fix, the component inventory |
| [TEST_PLAN_V2.md](docs/TEST_PLAN_V2.md) · [MOCK_DATA_AUDIT.md](docs/MOCK_DATA_AUDIT.md) | QA, and the mock-data inventory |

**v1, still current for the surfaces they describe**
[PRD](docs/PRD.md) · [SPEC](docs/SPEC.md) · [API](docs/API.md) · [DATABASE](docs/DATABASE.md) · [PAYMENTS](docs/PAYMENTS.md) · [USE_CASES](docs/USE_CASES.md)

---

## Status

Verified on every change: `npm run typecheck` · `npm test` · `npm run lint` · `npm run build` · `npm run db:check`.

**Not yet true, and worth knowing before you demo it:**

- **Nothing writes the run, step or health tables yet.** The Activity page reads them correctly and
  its empty states are the launch-day experience by design — the runtime team implements
  [the contract](docs/BACKEND_INTEGRATION_CONTRACT.md) against them.
- **Codex and DeepSeek cannot be provisioned** until the OpenClaw Manager assigns them category ids.
- The Skill Repository ships a curated catalogue; the discovery sync lands new skills as `draft`
  for review rather than publishing them.

---

## Deployment

Deploys to **Vercel** from `main`. See [**docs/DEPLOYMENT.md**](docs/DEPLOYMENT.md) for the complete
guide; the essentials:

1. Set the env vars from `.env.example` in project settings. At minimum `DATABASE_URL`,
   `DIRECT_DATABASE_URL` and `NEXT_PUBLIC_APP_URL` — the app refuses to start in production without
   the last one rather than minting unreachable localhost callback URLs.
2. Run migrations as a **release step** (`npm run db:migrate`), never on the request path. Verify
   first with `npm run db:check`, which replays every migration into a scratch database both from
   empty *and* incrementally.
3. Seed reference data with `npm run db:seed`. Do **not** set `SEED_DEMO` — the demo workspace is
   refused outright under `NODE_ENV=production`.
4. Set `ADMIN_PASSWORD`. The repository default is a published credential.
5. Set `CRON_SECRET`. The cron routes fail **closed** without it — an unauthenticated tick could
   otherwise fire every schedule in the database on demand.

### The one migration rule

`ALTER TYPE … ADD VALUE` goes in its own migration file containing **nothing else**.

drizzle wraps every *pending* migration in a single transaction, and Postgres refuses to *use* an
enum value added in that same transaction — unless the type was created there too. That exception is
the trap: on a fresh replay every type is created in the one transaction, so **CI is always green**,
while a deployed database receiving the same batch fails and rolls the whole thing back. **It breaks
production, not CI.** `npm run db:check` replays real deployed states to prove it, and its error
message says exactly this.
