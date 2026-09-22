# ArkAgent — Deployment & Operations

**Audience:** whoever puts this on the internet and keeps it running.

This document is executable start to finish. Every command in it exists in `package.json`; every
environment variable in it is read by a file named beside it. Where a claim could not be verified
against the repository it is marked as such, and where an existing doc disagrees with the code, the
code wins and the discrepancy is called out.

ArkAgent is the **control plane**. It owns identity, workspaces, agent configuration, schedules,
billing and the operator UI. It does **not** run agents — a separate **Agent Manager** / **OpenClaw
Manager** provisions a VM per agent. Almost everything in section 9 that looks like "the agent is
broken" is actually "the Manager is unreachable or misconfigured".

**Contents**

| § | Section |
|---|---|
| 1 | [Requirements](#1-requirements) |
| 2 | [Environment variables](#2-environment-variables) |
| 3 | [Local development from a clean clone](#3-local-development-from-a-clean-clone) |
| 4 | [Database and migrations](#4-database-and-migrations) |
| 5 | [Seeding](#5-seeding) |
| 6 | [Deploying to Vercel](#6-deploying-to-vercel) |
| 7 | [The cron endpoints](#7-the-cron-endpoints) |
| 8 | [Production readiness checklist](#8-production-readiness-checklist) |
| 9 | [Operations](#9-operations) |
| 10 | [Rollback](#10-rollback) |

---

## 1. Requirements

### Runtime

| Thing | Value | Where it is declared |
|---|---|---|
| Node | **24** | `.nvmrc` (`24`), `package.json` → `"engines": { "node": "24.x" }` |
| Package manager | npm (lockfile v3, `package-lock.json`) | repo root |
| Next.js | 16.3.0, App Router, Turbopack, React Compiler | `package.json`, `next.config.ts` |
| React | 19.2.8 | `package.json` |

`next.config.ts` sets `reactCompiler: true` and pins `turbopack.root` to the project directory — a
stray lockfile in a parent directory otherwise makes Next.js infer the wrong root for file tracing.

> **Discrepancy — Docker image lags the engine field.** `docker/Dockerfile` builds on
> `harbor.lightark.cc/infra/node:22.15-bookworm-slim`, while `package.json` declares `node: 24.x`
> and `.nvmrc` says `24`. `npm ci` does not enforce `engines` by default, so this builds today, but
> the container is not running the Node the project targets. Either bump the image to 24 or accept
> that the Docker path is unverified against the declared engine.

### Postgres

`docker/docker-compose.yml` pins `postgres:16-alpine`. The only in-repo statement about the
development server is a comment in `scripts/check-migrations.ts:21` — "verified against this
project's Postgres 18"; there is no version pin anywhere else, so treat 18 as the author's box
rather than a requirement.

**The floor the code actually needs is 13**, and it is the highest of four separate version
requirements:

| Feature | Used where | Minimum |
|---|---|---|
| `gen_random_uuid()` as a built-in (no `pgcrypto`) | 27 column defaults across `lib/db/migrations/*.sql`; there is **no** `CREATE EXTENSION` anywhere in the migration set | **13** |
| `ALTER TYPE … ADD VALUE` inside a transaction block | `0003`, `0007`, `0008` — and drizzle wraps every pending migration in one transaction | 12 |
| `GENERATED ALWAYS AS IDENTITY` | 5 tables incl. `scheduler_ticks` | 10 |
| `FOR UPDATE … SKIP LOCKED` | the schedule claim statement, `lib/services/schedules.ts:939` and `:1563` | 9.5 |

On Postgres 12 or older you would have to add `CREATE EXTENSION pgcrypto` yourself; nothing in the
repo does. **Run 16 or newer.** The connecting role used by `npm run db:check` additionally needs
**`CREATEDB`** — it creates and drops a scratch database called `ark_migration_check`.

`lib/db/index.ts` parses `DATABASE_URL` itself rather than handing it to `postgres-js`, because the
pooler query parameters below are not valid libpq parameters and the server would reject them as
startup options:

| Query parameter | Effect |
|---|---|
| `sslmode` | anything other than `disable` ⇒ `ssl: "require"` |
| `pgbouncer=true` | disables prepared statements (transaction pooling is incompatible with them) |
| `connection_limit` | pool size, default `10` |
| `connect_timeout` | seconds, default `30` |

### External services — required vs optional

| Service | Required? | What happens without it |
|---|---|---|
| **Postgres** | **Required** | Nothing works. `lib/db/index.ts` throws `DATABASE_URL is not set` on first query (not at import — module evaluation is side-effect-free so `next build` succeeds without a database) |
| **Agent Manager** (`AGENT_MANAGER_BASE_URL`) | **Required in production** | `agentManagerMode()` returns `unconfigured` and `getAgentManager()` throws. It never silently falls back to the simulator — but **nothing converts that throw into a 503**; every call site swallows it. See §2.3 |
| **OpenClaw Manager** (`OPENCLAW_MANAGER_API_*`) | **Required in production** | `assertConfigured()` in `app/lib/openclaw_manager_api.ts:22` throws per call in production rather than sending `Bearer ` to the built-in default host. `createAgent()` catches it and parks the new agent at `status = 'error'` with `last_error` set — `POST /api/agents` still answers **201** |
| **Stripe** | Optional (required to take USD payments) | Stripe checkout returns **503** in production; in development it falls back to `mock` and fulfils inline |
| **Alipay / GoHire gateway** | Optional (required to take CNY payments) | Same shape as Stripe |
| **OpenRouter** | Optional | Brief generation falls back to the role's seeded default. Agent chat returns **503** in production when there is *also* no live runtime (`app/api/agents/[id]/messages/route.ts:99`). Self-review returns 503 without a key regardless (`app/api/agents/[id]/self-review/route.ts:35`) |
| **Google OAuth** | Optional | `/api/auth/sso` reports `google: false`, the button renders disabled |
| **WeChat login** | Optional | Same — `/api/auth/sso` reports `wechat: false` |
| **Vercel Cron** (or any pinger) | **Required for schedules** | Nothing ever fires. Reminders and schedulers are driven entirely by `/api/cron/schedules` |

---

## 2. Environment variables

Source of truth is **`.env.example`** — it is heavily commented and should be read alongside this
table. Next.js loads `.env` automatically (`next build` prints `Environments: .env`). The
`tsx --env-file=.env` scripts (`db:check`, `db:seed`, `skills:sync`, `llm:check`) load it explicitly;
`pricing:check` and `payments:check` need no environment at all.

**`NODE_ENV` is the master switch.** It is not in `.env.example` because the framework sets it, but
every fail-closed behaviour in this document keys off `NODE_ENV === "production"`. On Vercel,
Production **and Preview** deployments both build with `NODE_ENV=production`. A Preview deployment is
therefore subject to every production refusal — it will not quietly hand out mock agents or free
seats, and it *will* throw if `NEXT_PUBLIC_APP_URL` is unset.

### 2.1 Database

| Variable | Required | Default | What it does / what breaks |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | none | Pooled runtime connection. Missing ⇒ `Error: DATABASE_URL is not set` on the first query — the app boots and every page 500s |
| `DIRECT_DATABASE_URL` | Yes for migrations | falls back to `DATABASE_URL` | Non-pooled connection used by `drizzle.config.ts` and `db:check`. DDL through pgbouncer in transaction mode is unreliable; point this at the direct port |

### 2.2 Session / auth

| Variable | Required | Default | What it does / what breaks |
|---|---|---|---|
| `SESSION_SECRET` | **No — nothing reads it** | — | Reserved. Verified: zero references in `lib/`, `app/`, `components/`, `scripts/`. Sessions are 32 random bytes with only the SHA-256 stored (`lib/auth.ts`), so there is no signing key. Setting it does nothing; leaving it unset is safe. `docker/standalone.env.template` still lists it — that template is stale on this point |
| `SESSION_COOKIE_NAME` | No | `ark_session` | Cookie name (`lib/auth.ts:21`). **Changing it on a live deployment signs everyone out** |
| `SESSION_TTL_DAYS` | No | `30` | Session lifetime (`lib/auth.ts:22`). A non-numeric value yields `NaN` and is not validated — set a number |

### 2.3 Agent runtime — `AGENT_MANAGER_MODE`

Resolved by `agentManagerMode()` in `lib/agent-manager/index.ts`. Three modes: `live`, `mock`,
`unconfigured`.

| `AGENT_MANAGER_MODE` | `AGENT_MANAGER_BASE_URL` | Result |
|---|---|---|
| `mock` | anything | `mock` — the in-process simulator, **including in production** |
| `live` | set | `live` |
| `live` | unset | **`unconfigured`** |
| unset | set | `live` |
| unset | unset, `NODE_ENV != production` | `mock` |
| unset | unset, `NODE_ENV = production` | **`unconfigured`** |

**Production never falls back to the simulator by accident.** `getAgentManager()` throws
`AgentManagerUnconfiguredError` when unconfigured. This is deliberate: a simulated fleet reports
every agent as `working`, invents VM ids and uptimes, and answers chat with canned text while the
customer is billed for a seat behind which no machine was ever started — a failure that looks
exactly like success. Running the simulator on a production host is still possible, but only by
writing `AGENT_MANAGER_MODE=mock` by name.

> **Gap — the refusal is not surfaced to anyone.** `AgentManagerUnconfiguredError` is thrown but
> **never caught and mapped to an HTTP status**. Verified: `grep -rn "AgentManagerUnconfiguredError"
> app lib` matches only `lib/agent-manager/index.ts`, and `grep -rn ", 503" app lib` returns exactly
> three unrelated sites (billing checkout, skills sync, self-review). What actually happens at each
> of the three call sites:
>
> | Call site | Behaviour when unconfigured |
> |---|---|
> | `app/api/agents/[id]/route.ts:95` (PATCH) | wrapped in `try { … } catch { /* best-effort */ }`. The PATCH returns **200**; the config is silently never pushed upstream |
> | `lib/services/agents.ts:296` (pause / resume / terminate) | the catch writes the *intended* local status. The route returns **200** and the dashboard shows `paused` for a VM nobody told |
> | `lib/services/schedules.ts:1354` (dispatch) | swallowed per occurrence, so the tick still returns **200** and the occurrence is recorded failed in `agent_schedule_runs` |
>
> Hiring does not go through `getAgentManager()` at all — it uses the OpenClaw Manager client, and
> `createAgent()`'s catch parks the agent at `status = 'error'`. **No route returns a 503 because
> the Agent Manager is unconfigured.** (`POST /api/agents/[id]/messages` does 503, but on a
> different condition — no live runtime *and* no `OPENROUTER_API_KEY`.) The symptom is a dashboard
> that keeps answering 200 while nothing reaches a VM. Diagnose from `agents.status` /
> `agents.last_error` and the runtime logs instead.

| Variable | Required | Default | What it does / what breaks |
|---|---|---|---|
| `AGENT_MANAGER_MODE` | No | inferred (table above) | See above |
| `AGENT_MANAGER_BASE_URL` | **Yes in production** | none | Upstream origin. Unset in production ⇒ `unconfigured`, and every lifecycle change, config push and scheduled dispatch is dropped on the floor (see the box above) |
| `AGENT_MANAGER_API_KEY` | Yes with `live` | none | Bearer token sent on every outbound call |
| `AGENT_MANAGER_WEBHOOK_SECRET` | **Yes in production** | none | HMAC-SHA256 key for inbound webhooks. `verifyWebhookSignature()` (`lib/agent-manager/webhook.ts`) returns `false` when it is unset, so `POST /api/webhooks/agent-manager` answers **401** to everything. Status, heartbeat and activity events stop arriving and the fleet freezes at its last known state |

### 2.4 OpenClaw Manager

| Variable | Required | Default | What it does / what breaks |
|---|---|---|---|
| `OPENCLAW_MANAGER_API_URL` | **Yes in production** | `https://clawmanager.lightark.cc` | Base URL. In production `assertConfigured()` **throws** rather than using the built-in default host (`app/lib/openclaw_manager_api.ts:22`) |
| `OPENCLAW_MANAGER_API_KEY` | **Yes in production** | `""` | Bearer token. Unset outside production, calls go out as `Bearer ` and come back 401 — which reads as an upstream outage rather than a missing variable. In production it throws instead, naming the variable |
| `OPENCLAW_DEBUG_LOG` | No | `0` | `1` logs Manager request URLs, query parameters and JSON bodies. **Leave off in production** — bodies can contain agent configuration |

The check is per call, not at module load: throwing at import time would take down every route that
transitively imports the client, including ones that never talk to the Manager.

**Where the throw lands.** `createAgent()` (`lib/services/agents.ts:250`) catches everything from
the provisioning call and writes `agents.status = 'error'` plus `agents.last_error`, then continues
on to create the billing seat. `POST /api/agents` therefore answers **201** with an agent that was
never provisioned — and the seat is billed. `agents.last_error` carries the first 480 characters of
the thrown message, which is where the variable name will be. Alert on
`SELECT count(*) FROM agents WHERE status = 'error'`, not on HTTP status codes.

### 2.5 Harness gate — `ATG_ENABLED_HARNESSES`

`enabledHarnesses()` in `lib/harness/provisioning.ts`. **Three states, not two:**

| Value | Result |
|---|---|
| **unset** | every *provisionable* harness — today `openclaw`, `hermes` |
| a list, e.g. `openclaw,hermes` | the **intersection** of that list and what is provisionable |
| **set but empty** (`ATG_ENABLED_HARNESSES=`) | **nothing.** The gate fails closed |

The empty case is the one to know. Treating an empty value as "unset" would fail *open*; an operator
who writes `ATG_ENABLED_HARNESSES=` is asking for none, and a templating accident that resolves to an
empty string should stop hiring loudly rather than quietly offering everything.

The list is intersected, never trusted: `CATEGORY_ID` in the same file maps `openclaw → 2`,
`hermes → 4`, and `codex`/`deepseek` → `null` because the OpenClaw Manager has not assigned them ids.
Listing `codex` puts no button in the UI, and `categoryIdFor("codex")` throws
`HarnessNotProvisionableError` rather than guessing — the expression it replaced,
`engine === "openclaw" ? 2 : 4`, silently provisioned a **Hermes** VM for anyone who hired a Codex
agent.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `ATG_ENABLED_HARNESSES` | No | unset ⇒ all provisionable | Normative name |
| `ARK_ENABLED_HARNESSES` | No | — | **One-release alias.** Read only when `ATG_ENABLED_HARNESSES` is `undefined` (`?? `, not `||`), so an explicitly-empty `ATG_` value still wins and still means "none". Migrate off it |

### 2.6 Payments

`lib/payments/config.ts`. Each provider resolves independently to `mock`, `live` or `unconfigured`.

| `PAYMENTS_MODE` | Credentials | `NODE_ENV` | Result |
|---|---|---|---|
| `mock` | any | any | **`mock`** — fulfils inline, subscription + paid invoice in the same request |
| unset / `live` | present | any | `live` |
| unset / `live` | absent | not production | `mock` |
| unset / `live` | absent | **production** | **`unconfigured`** ⇒ `POST /api/billing/checkout` returns **503** |

`PAYMENTS_MODE=live` without a key is a misconfiguration, not a licence to charge nothing — it still
resolves to `unconfigured` in production. Verify the whole matrix with **`npm run payments:check`**
(no database, no network, no credentials needed).

**Never set `PAYMENTS_MODE=mock` on a real deployment.** Inline fulfilment hands out paid seats for
free to anyone who can register.

| Variable | Required | Default | What it does / what breaks |
|---|---|---|---|
| `PAYMENTS_MODE` | No | unset | Explicit override. `mock` is the only value with force; see above |
| `STRIPE_SECRET_KEY` | For USD | none | **Its presence is what switches Stripe live.** The flow is server-side hosted Checkout, so no publishable key is used |
| `STRIPE_WEBHOOK_SECRET` | With Stripe live | none | Signing secret for `<NEXT_PUBLIC_APP_URL>/api/webhooks/stripe`. Missing or wrong ⇒ every webhook fails verification and returns **400**: **money is taken and no seat is ever granted.** The webhook is the only place a Stripe payment grants a seat. `stripe listen` prints its own `whsec_`, which is *not* the Dashboard one |
| `STRIPE_PRICE_*` (6: `{ASSOCIATE,PROFESSIONAL,DIRECTOR}_{MONTHLY,ANNUAL}`) | No | unset | Optional recurring Price ids. Unset, sessions are built from inline `price_data` using `lib/pricing.ts` and **no Stripe Products need to exist**. Stripe Prices are immutable, so a price change means new ids here |
| `STRIPE_PAYMENT_METHOD_TYPES` | No | unset | Comma-separated. **Leave unset** — that lets Stripe's Dashboard-managed automatic methods decide. Setting it freezes the list into a deploy, and every method listed must be activated on the account or session creation fails |
| `STRIPE_TRIAL_DAYS` | No | `0` | Free-trial days. `0` or unset disables trials |
| `STRIPE_API_VERSION` | No | `2026-08-26.dahlia` (`DEFAULT_STRIPE_API_VERSION`) | Pins the API version so an SDK bump cannot change payload shapes under the webhook. **Match it to the version set on the endpoint in the Dashboard** — an older endpoint delivers shapes the handler does not expect |
| `ALIPAY_ENABLED` | For CNY | `false` | `true` or `1` requests live. Anything else ⇒ mock/unconfigured |
| `ALIPAY_API_URL` | With Alipay live | `https://worker.gohire.top/payment/payment/create` | GoHire gateway order-create endpoint. Set explicitly rather than trusting the default |
| `ALIPAY_PLATFORM` | With Alipay live | `gohire` | Tenant the gateway routes and attributes orders on. **The wrong value means your orders land in someone else's ledger** — confirm with the operator |
| `ALIPAY_CALLBACK_SECRET` | **Yes for Alipay live** | none (present in `.env.example:170` but deliberately left commented out with **no placeholder value** — a shipped placeholder would be a publicly known secret the moment anyone enabled Alipay without editing it) | The gateway does not sign its callbacks. This token is baked into the `notify_url` we hand it and demanded back on every callback — it is the only thing preventing a forged `TRADE_SUCCESS` from granting a free seat. **`ALIPAY_ENABLED=true` without it does not go live**: `alipayConfig()` logs `[payments] ALIPAY_ENABLED is set but ALIPAY_CALLBACK_SECRET is missing` and resolves to `unconfigured`, because taking real money while every notify is rejected is worse than being switched off. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

This is **not** a direct Alipay merchant integration — no `app_id`, no RSA keypair. See
`docs/PAYMENTS.md` for what to ask the gateway operator for.

### 2.7 Scheduled work

| Variable | Required | Default | What it does / what breaks |
|---|---|---|---|
| `CRON_SECRET` | **Yes** | none | Bearer secret for `/api/cron/schedules` and `POST /api/skills/sync`. **The check fails CLOSED:** `authorizeTick()` (`lib/services/schedules.ts:1639`) returns `false` immediately when it is unset, so *every* tick 401s and **no schedule ever fires**. Without the fail-closed behaviour the endpoint would be an unauthenticated agent trigger on a public URL — anyone could pin a workspace's credits at zero. Compared with `timingSafeEqual`, with a length pre-check so the failure path does not leak the secret's length. Generate: `openssl rand -hex 32` |

`x-vercel-cron` is **not** accepted as authentication anywhere. It is a client-settable header on a
public URL; it is read only to label the `scheduler_ticks.source` column.

Undocumented in `.env.example` but read by `lib/services/schedules.ts` — all optional, all ignored
unless they parse to a finite number `> 0`:

| Variable | Default | Meaning |
|---|---|---|
| `SCHEDULER_LEASE_SECONDS` | `300` | Claim lease. **MUST stay above the tick route's `maxDuration` (60)** or a tick still working can have its claim stolen and the same occurrence dispatched twice. A test asserts the relation because the two numbers live in different files |
| `SCHEDULER_GRACE_SECONDS` | `120` | Lateness below which a run is not a misfire — a healthy per-minute cron routinely runs 30–90 s late |
| `SCHEDULER_MISFIRE_MAX_AGE_SECONDS` | `86400` | Past 24 h a catch-up is abandoned |
| `SCHEDULER_BATCH_LIMIT` | `200` | Occurrences claimed per tick |

Not environment-configurable (constants in the same `SCHEDULER` object): `PER_AGENT_PER_TICK: 4`,
`MAX_IN_FLIGHT: 10`, `RETRY_MAX_ATTEMPTS: 3`, `RETRY_WINDOW_SECONDS: 900`, `TICK_RETENTION_DAYS: 7`.

### 2.8 App origin, admin, flags

| Variable | Required | Default | What it does / what breaks |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | **Yes in production** | `http://localhost:3000` outside production | Public origin. Payment return/cancel URLs, the Alipay `notify_url` and every OAuth `redirect_uri` are built from it — derived from configuration, never from the inbound `Host` header, so a spoofed host cannot redirect an OAuth code elsewhere. **`appUrl()` throws in production when unset** rather than minting localhost URLs no provider can reach. Trailing slashes are stripped |
| `PORT` | No | `3000` | Consumed by `next start`, not by application code |
| `LOG_LEVEL` | **No — nothing reads it** | — | Verified: zero references in `lib/`, `app/`, `components/`, `scripts/`. Present in `.env.example` and `docker/standalone.env.template`; setting it has no effect |
| `ADMIN_EMAIL` | No | `admin@iagent.cc` | Platform admin bootstrapped by `npm run db:seed` |
| `ADMIN_PASSWORD` | **Yes in production** | **`Lightark@1` — a credential published in this source tree** (`lib/db/seed.ts:28`) | Unset, the seed creates the platform admin with that password and prints a boxed warning. Anyone who can read this repository can then sign in as a platform administrator on any host where the seed has run. **Set it before the deployment is reachable, and re-run `npm run db:seed`** (or change it from the account screen) |
| `ADMIN_NAME` | No | `Platform Admin` | Display name |
| `SEED_DEMO` | No | `0` | `1` builds the demo workspace (`demo` / `demo123`). **Refused outright under `NODE_ENV=production`** — `lib/db/seed.ts:200` throws `Refusing to seed the demo workspace in production`. Two independent checks: the flag says what the operator wanted, the `NODE_ENV` check says what is allowed |
| `NEXT_PUBLIC_SHOW_DIRECTIONS` | No | unset ⇒ off | `1` exposes `/directions`, an internal brand-direction review page, plus its links in the landing footer and dashboard sidebar. Unset, **the route 404s**. Being `NEXT_PUBLIC_*` it is inlined **at build time** — changing it requires a rebuild, not a restart. The `DirectionSwitcher` control is unaffected |

### 2.9 LLM (OpenRouter)

| Variable | Required | Default | What it does / what breaks |
|---|---|---|---|
| `OPENROUTER_API_KEY` | No (see below) | none | Presence alone is `isLLMConfigured()`. Without it, brief generation falls back to the role's seeded default. **In production, agent chat returns 503** when there is also no live OpenClaw runtime attached — pantomiming a model to a paying customer is worse than saying nothing |
| `LLM_MODEL` | No | `openai/gpt-4o-mini` | OpenRouter model id. An `openrouter/` routing prefix is accepted and stripped. **An unknown id fails at call time with a 400, not at boot** — verify with `npm run llm:check` |
| `OPENROUTER_APP_TITLE` | No | `ArkAgent` | Sent as `X-Title` |
| `OPENROUTER_BASE_URL` | No | `https://openrouter.ai/api/v1` | Override for a proxy |
| `OPENROUTER_STREAM_USAGE` | No | on | `0` stops asking for token counts on streamed calls. Set it only if a proxied base URL rejects `stream_options` — **usage accounting degrades to estimates when it is off** |

### 2.10 SSO (optional)

`GET /api/auth/sso` is an unauthenticated availability probe that reports only *whether* credentials
exist, never any part of them. A provider with no credentials renders as a disabled button rather
than failing at the provider with an opaque error.

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Both, or neither | Authorized redirect URI: `${NEXT_PUBLIC_APP_URL}/api/auth/google/callback`, byte for byte |
| `WECHAT_WEB_APP_ID` / `WECHAT_WEB_APP_SECRET` | Pair | 网站应用 — desktop QR flow |
| `WECHAT_MP_APP_ID` / `WECHAT_MP_APP_SECRET` | Pair | 公众号 — in-WeChat flow |

Either WeChat pair may be set on its own; the authorized callback domain must be the host of
`NEXT_PUBLIC_APP_URL`.

---

## 3. Local development from a clean clone

```bash
# 0. Node 24 — `.nvmrc` pins it
nvm use          # or: fnm use / asdf install

# 1. Install exactly what the lockfile says
npm ci

# 2. Configure
cp .env.example .env
#    Fill in DATABASE_URL and DIRECT_DATABASE_URL. Nothing else is required to
#    run locally: outside production, payments fall back to `mock`, the agent
#    runtime falls back to the in-process simulator, and the LLM falls back to
#    seeded defaults.

# 3. Apply the schema
npm run db:migrate

# 4. Seed reference data — plans, agent roles, the platform admin
npm run db:seed

# 5. Optional: the demo workspace (dev/CI only; throws under NODE_ENV=production)
npm run db:seed:demo

# 6. Run
npm run dev      # http://localhost:3000
```

**How to tell each step worked**

| Step | Success looks like | Failure looks like |
|---|---|---|
| `npm ci` | no `EBADENGINE` warnings on Node 24 | `EBADENGINE` ⇒ you are not on Node 24 |
| `npm run db:migrate` | drizzle-kit prints the applied files and exits 0 | `DIRECT_DATABASE_URL or DATABASE_URL must be set` (thrown by `drizzle.config.ts`), or a connection error |
| `npm run db:seed` | `✓ seed complete` followed by `admin login → …` | See the boxed `WARNING: the platform admin is using the DEFAULT password` — that is not a failure, it is the warning you must act on before deploying |
| `npm run db:seed:demo` | `→ rebuilding demo workspace…` then `demo login → demo / demo123` | `Refusing to seed the demo workspace in production` ⇒ your shell has `NODE_ENV=production` |
| `npm run dev` | `http://localhost:3000` renders the landing page | — |

Without `db:seed:demo`, sign in at `/auth` by registering; you get an empty workspace. Every
registered account starts empty — only the demo workspace carries fixture data.

### Local Docker

`docker/docker-compose.yml` brings up the app plus `postgres:16-alpine` with a healthcheck gate.
`docker/standalone.env.template` is the environment template for that path. Two caveats already
noted: the Dockerfile's base image is Node 22.15 rather than 24, and the template lists
`SESSION_SECRET` and `LOG_LEVEL`, neither of which any code reads. The compose file does **not** run
migrations — apply them yourself against the container's Postgres before first use.

### The gate commands

Run all four before pushing anything you intend to deploy:

```bash
npm run typecheck                      # tsc --noEmit
npm test                               # node:test via tsx
npm run build                          # next build (this ALSO runs tsc; a type error fails the deploy)
npm run db:check                       # migration replay, fresh AND incremental
npx eslint app lib components scripts  # 0 errors (warnings are tolerated)
```

`next build` type-checks as part of the build, so `typecheck` and `build` fail together — a
half-written file blocks the Vercel deploy, not just local CI.

> **State at the time of writing.** All of `npm run typecheck` (exit 0), `npm test` (all passing),
> `npm run build` (exit 0), `npx eslint app lib components scripts` (0 errors, 23 warnings),
> `npm run payments:check` and `npm run pricing:check` pass. `npm run db:check` needs a reachable
> Postgres with `CREATEDB` and was not run for this note — run it yourself before deploying.

### Scripts reference

| Script | What it does | Needs |
|---|---|---|
| `npm run dev` | Dev server (Turbopack) | database |
| `npm run build` / `npm start` | Production build / serve | — / database |
| `npm run lint` | ESLint | — |
| `npm run typecheck` | `tsc --noEmit` | — |
| `npm test` / `npm run test:watch` | `node:test` via `tsx` under the `react-server` condition | — |
| `npm run db:generate` | Generate a migration from `lib/db/schema.ts` | direct DB |
| `npm run db:migrate` | Apply pending migrations | direct DB |
| `npm run db:check` | Replay migrations fresh **and** incrementally | direct DB + `CREATEDB` |
| `npm run db:push` | Push the schema directly — **dev shortcut, never production** | direct DB |
| `npm run db:studio` | Drizzle Studio | direct DB |
| `npm run db:seed` | Reference data only | database |
| `npm run db:seed:demo` | Reference data **+** demo workspace | database, non-production |
| `npm run skills:seed` | **Broken — `scripts/seed-skills.ts` does not exist.** See §5 | — |
| `npm run skills:sync` | Refresh the Skill Repository from an allowlisted source | database |
| `npm run llm:check` | Verify `OPENROUTER_API_KEY` + `LLM_MODEL` end to end | OpenRouter key |
| `npm run pricing:check` | Assert the USD/CNY price ladder and currency routing | nothing |
| `npm run payments:check` | Assert the payments mode matrix and the Alipay token check | nothing |

> **Discrepancy — `README.md` presents a broken script as working.** `README.md:90` and its script
> table at `README.md:117` list `npm run skills:seed` — "Load the curated skill catalogue into the
> database" — but `scripts/seed-skills.ts` does not exist and the command exits non-zero. (Its
> `skills:sync` row is correct.)

---

## 4. Database and migrations

Migrations live in `lib/db/migrations/`, ordered by `meta/_journal.json`. There are **ten**, `0000`
through `0009`, producing **37 tables**.

### The drizzle-kit workflow

```bash
# 1. Edit lib/db/schema.ts
# 2. Generate SQL from the diff
npm run db:generate

# 3. READ the generated file. Then prove it replays (see the hazard below)
npm run db:check

# 4. Apply
npm run db:migrate
```

`drizzle.config.ts` uses `DIRECT_DATABASE_URL || DATABASE_URL` — DDL runs on a real session, not
through pgbouncer. It loads `.env` via `process.loadEnvFile` and throws if neither URL is set.

`npm run db:push` writes the schema straight to the database with no migration file. It is a
development shortcut. **Never run it against production** — it leaves no journal entry, so the next
`db:migrate` on any other database diverges.

### The enum-in-one-transaction hazard

This is the one thing about this schema you must know, and its direction is counter-intuitive.

`drizzle-orm`'s migrator wraps **all pending migrations in a single transaction**
(`node_modules/drizzle-orm/pg-core/dialect.js`). Postgres allows you to *add* an enum value inside a
transaction, but refuses to **use** one that was added in that same transaction:

```
ERROR: unsafe use of new value "codex" of enum type engine
```

A `DEFAULT` clause, an `INSERT`, a comparison and a `CHECK` that names the value are all "uses". All
four were verified against this project's Postgres 18.

**The exception is what makes it dangerous.** If the enum *type itself* was created in the same
transaction, using a newly added value **is** allowed. On a fresh replay from empty, every type is
created inside that one transaction — so the hazard cannot fire, and a fresh replay is green no
matter how the files are arranged. It is the **incremental** path, against a database where the type
was committed months ago, that fails and rolls the whole batch back.

> **It breaks production and not CI.** A green CI run is not evidence.

**The rule:** every `ALTER TYPE … ADD VALUE` goes in its own migration file **containing nothing
else**, so the value is committed before any later file names it. `0007_v2_enum_values.sql` and
`0008_v2_enum_values_2.sql` are exactly that — 12 `ADD VALUE` statements and no other DDL between
them. `0009_v2_schema.sql` then adds 19 new enum *types*, 13 tables and several columns, and is safe
because a `CREATE TYPE` and its first use in the same transaction are fine; it appends no value to a
pre-existing type.

Two corollaries recorded in those files:

- **You cannot amend an already-journaled migration.** drizzle decides applied-ness by timestamp and
  never re-reads or re-hashes an applied file (`dialect.js:62` — `created_at` is compared, and the
  `hash` column is written but never read back). Appending values to `0007` would apply on a fresh
  replay and go green, while every already-migrated database silently never received them. That is
  why `0008` exists as a separate file rather than as more lines in `0007`.
- **`IF NOT EXISTS` is hand-added.** drizzle-kit emits a bare `ADD VALUE` (see
  `0003_worthless_ultron.sql` for the precedent), which errors on a database that already has the
  value from a `db:push`. Add it by hand to every `ADD VALUE` you generate.

### `npm run db:check` — the proof

```bash
npm run db:check                   # the two states that matter
npm run db:check -- --exhaustive   # every deployed state; use when changing migration layout
```

**The `--` is load-bearing.** The script reads `process.argv.includes("--exhaustive")`
(`scripts/check-migrations.ts:191`), and npm consumes a bare leading `--exhaustive` as one of its
own config flags instead of forwarding it — verified: `npm run <script> --exhaustive` delivers
`[]` to the script, `npm run <script> -- --exhaustive` delivers `["--exhaustive"]`. Written without
the `--`, the command runs the ordinary two-state check and reports success, which reads as proof
it did not perform.

It replays the migration set into a throwaway database named `ark_migration_check` (created and
dropped by the script — the connecting role needs `CREATEDB`) in **two passes**:

| Pass | What it does | What it represents |
|---|---|---|
| **1 — fresh** | all ten files, in one transaction, from empty | CI, and a new developer |
| **2 — incremental** | commit files `0..K` individually, then run `K+1..N` in **one** transaction | a deployment. **This is the pass that catches the hazard** |

By default pass 2 runs two values of `K`: `K = 1` (every enum type committed, everything else in one
pending batch — the strictest case) and `K = N-1` (one new migration against a fully migrated
database — the case that actually runs on release day).

Both passes order the files by **filename** (`readdirSync(dir).filter(…).sort()`), not by
`meta/_journal.json` — which `db:migrate` does use. The two agree today because every `tag` matches
its filename; a hand-edited journal would make `db:check` prove the wrong order.

Success:

```
✓ fresh replay — 10 migrations in one transaction
✓ incremental replay — deployed states 1, 9 of 10 upgrade cleanly
```

On failure it prints the failing pass, file, statement and error, and when the error matches
`unsafe use of new value` / `invalid input value for enum` it prints the explanation and the fix.
Exit code 1.

---

## 5. Seeding

### `npm run db:seed` — reference data only

Idempotent, safe to re-run, safe in production. It writes:

| Table | What | Conflict behaviour |
|---|---|---|
| `plans` | the price ladder from `lib/pricing.ts` | upsert |
| `agent_roles` | roles, blurbs, hues, default harness, default instructions/rules, `min_plan` | **upsert, not do-nothing** — a do-nothing insert would mean a corrected blurb or re-pointed default harness never reaches an existing deployment. Only the columns the seed owns are written; `ocm-*` rows mirrored from the OpenClaw Manager by `/api/roles` are untouched because they are not in the seed's row set |
| `users` | the platform admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`) | upsert |

It ends with `✓ seed complete` and the admin login line. **If `ADMIN_PASSWORD` was unset it prints a
boxed warning** that the admin is using the password published in this source tree. Act on it.

### `npm run db:seed:demo` — plus the demo workspace

Equivalent to `SEED_DEMO=1 npm run db:seed`. Adds a fully-populated *Ark Industries Pte Ltd*
workspace behind the login **`demo` / `demo123`**: four agents, seven channels, credits, billing
seats, paid invoices and activity. It first **deletes** any prior demo data (current and legacy demo
emails) so re-running rebuilds rather than duplicating.

**It is refused in production.** Two independent checks, deliberately:

```
Error: Refusing to seed the demo workspace in production (SEED_DEMO=1 with NODE_ENV=production).
```

The flag says what the operator wanted; the `NODE_ENV` check says what is allowed. The point is that
a misconfigured CI variable must not be able to publish a guessable login to a live database.
`demo` / `demo123` is guessable, and the workspace behind it owns agents carrying real
`agent_manager_id` values, billing seats and paid invoices — all reconfigurable and deletable by
anyone who signs in.

### Skills

| Command | State |
|---|---|
| `npm run skills:seed` | **Broken.** It runs `tsx … scripts/seed-skills.ts`, and that file does not exist. Running it exits non-zero with a module-not-found error. `lib/skills/catalog.ts` — the seed catalogue it would read — is also absent |
| `npm run skills:sync` | Works. `npm run skills:sync -- --source=clawhub --mode=delta` |

**Consequence, stated plainly: the Skill Repository is an empty page today.** `skill_sources` has no
rows, so `POST /api/skills/sync` answers `404 Unknown source` for every id and `/dashboard/skills`
renders its empty state. That is the launch-day experience until the seed catalogue lands.

`skills:sync` flags (`scripts/sync-skills.ts`): `--source=<id>` (required), `--mode=` (default
`delta`), `--max-pages=` (default 5, range 1–50), `--cursor=`, `--dry-run`. It exits non-zero only
for something a human must act on — an unknown or disabled source, or a bad argument. A held lease
exits 0 (the lock working) and an upstream failure exits 0 with the class printed, because a CI job
that goes red because an upstream had a bad minute is a CI job people learn to ignore.

---

## 6. Deploying to Vercel

`vercel.json` declares `"framework": "nextjs"`, so the defaults apply — build `next build`, output
`.next`, install `npm ci`. Do not override the build command; overriding it is how the type-check
step gets skipped.

### Project settings

| Setting | Value | Why |
|---|---|---|
| Framework preset | Next.js | from `vercel.json` |
| Node.js version | **24.x** | matches `.nvmrc` and `engines`. Vercel reads `engines.node` |
| Build command | default (`next build`) | it runs `tsc`; a type error must fail the deploy |
| Install command | default (`npm ci`) | honours the lockfile |
| Root directory | repo root | `next.config.ts` pins `turbopack.root` to it |
| Plan | **Pro** | see the cron and `maxDuration` limits below |

### Environment scoping

Vercel scopes variables to **Production**, **Preview** and **Development**. Scope them deliberately:

| Variable | Production | Preview | Development |
|---|---|---|---|
| `DATABASE_URL` / `DIRECT_DATABASE_URL` | prod database | **a separate database** — a Preview deployment runs real migrations and real writes | local |
| `NEXT_PUBLIC_APP_URL` | the real HTTPS origin | the preview origin | `http://localhost:3000` |
| `AGENT_MANAGER_*`, `OPENCLAW_MANAGER_*` | live | live or unset | mock |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | live keys | **test keys, never live** | unset |
| `ALIPAY_*` | live | disabled | disabled |
| `CRON_SECRET` | set | set | set |
| `ADMIN_PASSWORD` | set | set | optional |
| `SEED_DEMO` | must not be `1` | must not be `1` | `1` if you want it |
| `PAYMENTS_MODE` | **never set** | never set | never set |
| `NEXT_PUBLIC_SHOW_DIRECTIONS` | unset | `1` if reviewers need it | as you like |

Two traps:

1. **Preview builds with `NODE_ENV=production`.** Every fail-closed refusal in §2 applies there.
   A Preview with no `NEXT_PUBLIC_APP_URL` throws at `appUrl()`; a Preview with no Agent Manager
   silently drops every lifecycle change and parks every hire at `status = 'error'` (§2.3), and a
   Preview with no Stripe key gets a **503** from `POST /api/billing/checkout`. That is correct
   behaviour, not a bug to work around by setting `AGENT_MANAGER_MODE=mock` — if you do, remember
   it is scoped and never let it reach Production.
2. **`NEXT_PUBLIC_*` variables are inlined at build time.** Changing `NEXT_PUBLIC_APP_URL` or
   `NEXT_PUBLIC_SHOW_DIRECTIONS` requires a **redeploy**, not a restart.

### Webhook endpoints to register

| Provider | URL | Auth |
|---|---|---|
| Stripe | `<NEXT_PUBLIC_APP_URL>/api/webhooks/stripe` | `STRIPE_WEBHOOK_SECRET`; set the endpoint's API version to `STRIPE_API_VERSION` |
| Agent Manager | `<NEXT_PUBLIC_APP_URL>/api/webhooks/agent-manager` | HMAC-SHA256 of the raw body in `x-arkagent-signature` (optionally `sha256=`-prefixed), keyed by `AGENT_MANAGER_WEBHOOK_SECRET` |
| Alipay / GoHire | built by the app from `NEXT_PUBLIC_APP_URL` with the token appended | `ALIPAY_CALLBACK_SECRET` as a `token` query parameter |

Stripe events to enable on the endpoint (listed in `app/api/webhooks/stripe/route.ts`):
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`,
`customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.

### Cron entries — read this before choosing a plan

`vercel.json` declares exactly two:

```json
"crons": [
  { "path": "/api/cron/schedules", "schedule": "* * * * *" },
  { "path": "/api/skills/sync",    "schedule": "17 3 * * *" }
]
```

**The Hobby plan's limit is not two entries — it is two *invocations per day*.** Both entries fit the
count, and then `* * * * *` is not honoured: the schedule tick runs **once a day**. Every reminder
and every scheduled agent run in the product is driven by that tick, so on Hobby, a schedule set for
09:00 fires whenever the daily invocation happens to land, and `SCHEDULER_MISFIRE_MAX_AGE_SECONDS`
(24 h) means most catch-ups will be abandoned as too old. **Reminders and Schedulers are unusable on
Hobby.** Either run Pro, or drive `/api/cron/schedules` yourself from an external per-minute pinger
(§7) and delete the entry from `vercel.json`.

Pro is also required by `export const maxDuration = 300` on `/api/skills/sync`; Hobby caps a function
at 60 s and would kill a sync mid-page. On Hobby, call it with `maxPages: 1` and let the returned
`cursor` carry the run across invocations — which is why the response returns one.

> Vercel's plan limits are an external product detail. The two entries and their schedules are
> verified from `vercel.json`; confirm the current cron limits against Vercel's own documentation
> before you commit to a plan.

> **Defect — the second cron entry cannot work as declared.** Vercel Cron invokes a path with
> **GET**. `app/api/skills/sync/route.ts` exports **only `POST`** (verified: the file's sole handler
> is `export async function POST`). The daily `17 3 * * *` invocation will therefore receive
> **405 Method Not Allowed** and never sync anything. Fix by adding a `GET` handler that delegates to
> the same logic (as `/api/cron/schedules` does — it exports both verbs for exactly this reason), or
> by driving the sync from an external POST pinger. Until then, run `npm run skills:sync` manually.
> Related, and cosmetic: `scripts/sync-skills.ts`'s header comment says the cron runs at 03:10 UTC;
> `vercel.json` says 03:17.

---

## 7. The cron endpoints

### `GET | POST /api/cron/schedules` — the schedule tick

**What it does.** Claims due schedule occurrences, dispatches them to their agents, advances
`next_run_at`, records a row in `agent_schedule_runs`, sweeps expired leases, prunes its own ledger,
and writes one summary row to `scheduler_ticks`.

**Auth.** `Authorization: Bearer <CRON_SECRET>`, compared with `timingSafeEqual`. **Fails closed when
`CRON_SECRET` is unset** — every request 401s and nothing fires. `x-vercel-cron` is *not* accepted as
authentication; it is read only to set `scheduler_ticks.source` to `vercel_cron`.

**Both verbs, one handler.** Vercel Cron issues GET; tests and external pingers use POST. GET takes
`limit`, `dryRun` and `scheduleId` as query parameters; POST takes the same as a JSON body (an empty
body is normal, not an error).

**Safe to call twice.** Everything is idempotent (the claim's lease predicate, the occurrence
insert's unique index) or ledgered. Two concurrent invocations slide past each other on
`FOR UPDATE … SKIP LOCKED` rather than blocking, and neither can dispatch the other's occurrence.

**Status codes.** `200` always — *including when individual schedules failed*. Failures live in the
response counters and in `agent_schedule_runs`, not in the HTTP status, because Vercel retries a 500
and a retried tick is a second fire attempt. `500` is reserved for a failure outside the per-schedule
loop.

```bash
# Manual tick
curl -sS -X POST "$APP_URL/api/cron/schedules" \
  -H "Authorization: Bearer $CRON_SECRET"

# Dry run — claims nothing, dispatches nothing
curl -sS "$APP_URL/api/cron/schedules?dryRun=1" \
  -H "Authorization: Bearer $CRON_SECRET"

# Fire one schedule by id (ledgered as source=manual, so support-triggered fires
# are distinguishable from the platform cron)
curl -sS -X POST "$APP_URL/api/cron/schedules" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "content-type: application/json" \
  -d '{"scheduleId":"<uuid>"}'
```

`401 Not authorized` means the bearer did not match — or `CRON_SECRET` is unset on the deployment.

**How to tell a tick ran.** `scheduler_ticks` is the ledger. One row per invocation:

```sql
SELECT id, started_at, finished_at, duration_ms,
       claimed, dispatched, skipped, failed, retried, swept,
       saturated, source
FROM scheduler_ticks
ORDER BY started_at DESC
LIMIT 20;
```

| Column | Read it as |
|---|---|
| `source` | `vercel_cron` \| `external` \| `manual` — who invoked it |
| `claimed` / `dispatched` | work found and work sent |
| `skipped` / `failed` / `retried` | per-occurrence outcomes; a non-zero `failed` with a 200 response is normal and expected |
| `swept` | expired leases reclaimed |
| `saturated` | **the claim batch hit its `LIMIT`. The tick is behind, not idle.** Persistent `true` means raise `SCHEDULER_BATCH_LIMIT` or tick more often |
| `finished_at IS NULL` | the tick never completed — a timeout or a crash |

Gaps in `started_at` are the diagnostic for "the platform cron is not running". The tick prunes rows
older than `TICK_RETENTION_DAYS` (7), so at one row a minute the table stays around 10k rows.

### `POST /api/skills/sync` — the catalogue crawl

**What it does.** The only place in the app that makes an outbound request to a skill source.

**Auth.** Platform-role `admin` **or** `Bearer CRON_SECRET` (same fail-closed `timingSafeEqual`
check). `support` is deliberately excluded — sync writes to the one table every customer reads.

**Status codes:** `200` the run finished (`stats` and `cursor` say what it did; an *upstream* failure
is also a 200, with `error` set and `fetched: 0`, so Vercel does not retry it) · `404` unknown source
— including the launch-day case where `skill_sources` is empty · `409` another run holds the
15-minute lease, expected rather than a failure · `503` the source exists but is disabled.

```bash
curl -sS -X POST "$APP_URL/api/skills/sync" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "content-type: application/json" \
  -d '{"source":"clawhub","mode":"delta","maxPages":5}'
```

A human-triggered run is written to `admin_audit_log`; a cron run is not (the column is not nullable
and a cron invocation has no actor), so its trail is `skill_sources.last_sync_*`, which the run has
already written.

Today every id returns `404 Unknown source` — see §5.

---

## 8. Production readiness checklist

Every item is verifiable by a command or a URL. Set `APP_URL` to the deployment's origin first.

### Build gates — all five must be green

```
[ ] npm run typecheck                       exits 0
[ ] npm test                                0 failing
[ ] npm run build                           exits 0 (this also runs tsc)
[ ] npm run db:check                        "✓ fresh replay" AND "✓ incremental replay"
[ ] npx eslint app lib components scripts   0 errors (warnings OK)
```

> **Agent Template Generator — partially landed, and not reachable.** `lib/atg/` now contains
> `types.ts`, `schema.ts`, `defaults.ts`, `safety.ts`, `prompts.ts`, `validate.ts`, `pipeline.ts`,
> `deterministic.ts` and `retrieval.ts`. Still absent: **`materialize.ts`**, and **`app/api/templates/`
> — there is no template API route at all**, as `find app/api -name route.ts` confirms. The gallery
> at `/dashboard/templates` ships and handles this by design: its own header comment names
> `GET /api/templates` as "not deployed yet", and a router 404 renders the error frame with the
> control bar still populated rather than crashing. **The template gallery is empty on launch day
> for the same reason the Skill Repository is.** Confirm the current state before relying on this
> paragraph: `ls lib/atg/ app/api/templates/ 2>&1`.

### Configuration self-checks

```
[ ] npm run payments:check                  "ALL MODE CHECKS PASSED"
[ ] npm run pricing:check                   "ALL PRICING CHECKS PASSED"
[ ] npm run llm:check                       key valid, model in catalog, streaming works
                                            (skip if you are deploying without OpenRouter)
```

### Secrets and fail-closed switches

```
[ ] ADMIN_PASSWORD is set — the default is published in this repo.
    Verify the default no longer works:
      curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$APP_URL/api/auth/login" \
        -H 'content-type: application/json' \
        -d '{"email":"admin@iagent.cc","password":"Lightark@1"}'
    MUST print 401. A 200 means the published credential is live — rotate now.

[ ] CRON_SECRET is set. Unauthenticated tick is refused:
      curl -sS -o /dev/null -w '%{http_code}\n' "$APP_URL/api/cron/schedules"     # 401
    …and the real secret is accepted:
      curl -sS -o /dev/null -w '%{http_code}\n' "$APP_URL/api/cron/schedules?dryRun=1" \
        -H "Authorization: Bearer $CRON_SECRET"                                    # 200

[ ] AGENT_MANAGER_WEBHOOK_SECRET is set. An unsigned webhook is refused:
      curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$APP_URL/api/webhooks/agent-manager" \
        -H 'content-type: application/json' -d '{}'                               # 401

[ ] STRIPE_WEBHOOK_SECRET is set and matches the Dashboard endpoint. An unsigned
    webhook is refused:
      curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$APP_URL/api/webhooks/stripe" \
        -H 'content-type: application/json' -d '{}'                               # 400
    Then send a real test event from the Stripe Dashboard and confirm it is
    delivered with a 2xx.

[ ] PAYMENTS_MODE is NOT set on any production-scoped environment.
[ ] AGENT_MANAGER_MODE is NOT `mock` on any production-scoped environment.
[ ] ALIPAY_CALLBACK_SECRET is set if ALIPAY_ENABLED=true (otherwise Alipay is
    silently disabled — grep the deploy logs for
    "ALIPAY_ENABLED is set but ALIPAY_CALLBACK_SECRET is missing").
[ ] OPENCLAW_DEBUG_LOG is 0 or unset.
```

### Reachability

```
[ ] curl -sS "$APP_URL/api/plans"       -> {"plans":[…]}  (non-empty ⇒ db:seed has run)
[ ] curl -sS "$APP_URL/api/auth/sso"    -> {"providers":{"google":…,"wechat":…}}
                                            matches which SSO credentials you set
[ ] curl -sS -o /dev/null -w '%{http_code}\n' "$APP_URL/directions"   -> 404
    (unless NEXT_PUBLIC_SHOW_DIRECTIONS=1 was set at BUILD time and you meant it)
[ ] The landing page renders at $APP_URL and /auth accepts a registration.
```

### Database state

```sql
-- ten migrations applied
SELECT count(*) FROM drizzle.__drizzle_migrations;          -- 10

-- reference data present
SELECT count(*) FROM plans;                                  -- > 0
SELECT count(*) FROM agent_roles;                            -- > 0

-- the demo workspace is NOT here
SELECT count(*) FROM users WHERE email IN ('demo','wei@company.com');   -- 0

-- the platform admin exists
SELECT email, platform_role FROM users WHERE platform_role = 'admin';
```

### Cron

```
[ ] vercel.json's two entries appear in the Vercel dashboard's Cron Jobs tab.
[ ] The plan actually honours "* * * * *" (Pro), or you have an external
    per-minute pinger — see §6.
[ ] After 5 minutes on a live deployment:
      SELECT count(*) FROM scheduler_ticks
       WHERE started_at > now() - interval '5 minutes';     -- ≈ 5 on Pro
```

### Known-incomplete — confirm these are acceptable for launch

```
[ ] Skill Repository is EMPTY. `npm run skills:seed` is broken (scripts/seed-skills.ts
    does not exist) and skill_sources has no rows, so POST /api/skills/sync returns
    404 for every id and /dashboard/skills shows its empty state.
[ ] The /api/skills/sync cron entry returns 405 to Vercel's GET (§6).
[ ] Runs and Health show EMPTY STATES. Nothing writes agent_runs,
    agent_run_steps or agent_health_samples — verified, there is no INSERT
    against any of the three anywhere in lib/ or app/. The runtime team
    implements against docs/BACKEND_INTEGRATION_CONTRACT.md. Verify:
      SELECT count(*) FROM agent_runs;                       -- 0
      SELECT count(*) FROM agent_health_samples;             -- 0
    These empty states ARE the launch-day experience.
    NOT empty: agent_activities. The control plane writes it itself in eight
    places (lifecycle changes, provisioning outcomes, self-review, applied
    improvements, inbound webhooks, schedule dispatch), and the table is still
    its v1 shape — id, agent_id, text, tag, occurred_at, no enrichment columns.
    The Activity timeline therefore shows control-plane events on day one; only
    the run-level detail behind it is missing.
[ ] Codex and DeepSeek cannot be provisioned. categoryIdFor() throws for both
    because the OpenClaw Manager has no category_id for them. They are gated out
    of every picker; do not list them in ATG_ENABLED_HARNESSES. Hiring one is
    refused at the route with a 422 before createAgent() is reached
    (app/api/agents/route.ts) — an error the user can act on, not a 500.

[ ] The template gallery at /dashboard/templates is EMPTY. GET /api/templates
    does not exist (no app/api/templates/ directory), so the page renders its
    error frame. lib/atg/materialize.ts is also still missing.

[ ] An unconfigured or unreachable Agent Manager does NOT produce a 503 on any
    route — the throw is swallowed at every call site (§2.3). Watch this
    instead:
      SELECT count(*) FROM agents WHERE status = 'error';   -- expect 0
      SELECT last_error FROM agents WHERE last_error IS NOT NULL LIMIT 5;
```

---

## 9. Operations

### Health checks

There is **no dedicated `/api/health` route.** Use these instead:

| Probe | Command | Proves |
|---|---|---|
| App + database | `curl -sS "$APP_URL/api/plans"` | the process is up, the pool connects, and reference data exists — this one query exercises the whole stack |
| Configuration | `curl -sS "$APP_URL/api/auth/sso"` | the process is up without touching the database |
| Scheduler | `SELECT max(started_at) FROM scheduler_ticks;` | the tick is running. On Pro this should be under two minutes old |
| Agent runtime | `SELECT count(*) FROM agents WHERE status = 'error';` and the deployment's runtime logs | **there is no HTTP probe for this.** `GET /api/agents/<id>` never touches the Agent Manager — it reads the database and answers 200 whether or not a runtime exists. An unconfigured or unreachable Manager surfaces only as errored agent rows, dropped lifecycle changes and failed `agent_schedule_runs` |

Point an uptime monitor at `/api/plans`, not `/`.

### When agents stop working

Work down this list; the first four are configuration, not incidents.

1. **Lifecycle buttons "work" but nothing happens on the VM; agents pile up at `status = 'error'`.**
   `AGENT_MANAGER_BASE_URL` is unset (or `AGENT_MANAGER_MODE=live` with no URL) and
   `NODE_ENV=production` ⇒ `unconfigured`. `AgentManagerUnconfiguredError` carries the fix —
   `Agent runtime is not configured. Set AGENT_MANAGER_BASE_URL (and AGENT_MANAGER_API_KEY)…` —
   but **that message never reaches an HTTP response**; every call site catches it (§2.3). Find it
   in the runtime logs, or in `agents.last_error` for a hire that failed. Do not wait for a 503.
2. **Hiring is refused for one harness only.** `POST /api/agents` answers **422** with
   `availableHarnesses` when the requested engine is not in `enabledHarnesses()`. Only `openclaw`
   and `hermes` are provisionable. Check `ATG_ENABLED_HARNESSES`; if it is set-but-empty, *no*
   harness is offered, by design. (`HarnessNotProvisionableError` from `categoryIdFor()` is the
   deeper backstop inside `createAgent()`; the route's 422 normally fires first.)
3. **Provisioning fails against the Manager.** `OPENCLAW_MANAGER_API_KEY` is unset. Outside
   production this shows as an upstream 401; in production `assertConfigured()` throws and names the
   variable. Either way `createAgent()` catches it, so the hire returns **201** and the agent lands
   at `status = 'error'` with the reason in `agents.last_error` — **and the billing seat is still
   created.** Reconcile seats after fixing the configuration. Temporarily set `OPENCLAW_DEBUG_LOG=1`
   to log the request URL, query and body — **turn it off again.**
4. **Fleet frozen at its last known state; no status changes, no heartbeats.** Inbound webhooks are
   being rejected. `AGENT_MANAGER_WEBHOOK_SECRET` is unset or does not match the sender's; the route
   returns 401 to everything. Test with a signed body:
   `HMAC-SHA256(secret, rawBody)` hex in `x-arkagent-signature`.
5. **Schedules never fire.** In order: is `CRON_SECRET` set (unset ⇒ 401 on every tick)? Is the
   platform cron invoking at all (`SELECT max(started_at) FROM scheduler_ticks`)? Are you on Hobby
   (§6)? Then look at the tick row: `saturated = true` means the batch limit is the bottleneck;
   `finished_at IS NULL` means the tick timed out; a non-zero `failed` sends you to
   `agent_schedule_runs` for the per-occurrence reason.
6. **A schedule fires but the agent does nothing.** Dispatch requires the agent to be in
   `working`, `scheduled` or `needs_review` — an allow-list, so an agent in `error`, `provisioning`
   or `deploying` is skipped rather than dispatched to a VM that is not there.
7. **Agent chat 503s.** Neither a live OpenClaw runtime nor `OPENROUTER_API_KEY`. In production the
   app refuses rather than streaming a canned reply that only looks like a model. Run
   `npm run llm:check`.
8. **Chat 400s from the model provider.** `LLM_MODEL` is not a real OpenRouter id. An unknown id is
   only discovered at call time — `npm run llm:check` resolves it against the catalog.
9. **Checkout 503s.** The provider is `unconfigured`: no `STRIPE_SECRET_KEY`, or `ALIPAY_ENABLED=true`
   without `ALIPAY_CALLBACK_SECRET`. `npm run payments:check` reproduces the whole matrix locally.
10. **Money taken, no seat granted.** The webhook is failing verification. Stripe: wrong
    `STRIPE_WEBHOOK_SECRET`, or the endpoint's API version differs from `STRIPE_API_VERSION`; the
    Dashboard's delivery log shows the 400s and Stripe will retry, so fixing the secret recovers the
    backlog. Alipay: wrong or missing `token` on the notify URL — look for
    `[alipay-callback] rejected: bad or missing token`.

### Logs

Everything goes to stdout/stderr; on Vercel, the deployment's **Runtime Logs** (or
`vercel logs <deployment-url>`). Nothing is written to a file and there is no log shipper configured.
`LOG_LEVEL` is inert — it is in `.env.example` but no code reads it, so there is no log-level dial to
turn.

Distinctive strings worth searching for:

| String | Meaning |
|---|---|
| `[cron/schedules] tick failed` | a failure *outside* the per-schedule loop (the only 500 case) |
| `[stripe-webhook] verification failed:` | signature mismatch |
| `[alipay-callback] rejected: bad or missing token` | forged or misconfigured notify |
| `[payments] ALIPAY_ENABLED is set but ALIPAY_CALLBACK_SECRET is missing` | Alipay silently disabled |
| `[checkout] refused: <provider> is not configured in this environment` | the 503 from `POST /api/billing/checkout` |
| `Agent runtime is not configured. Set AGENT_MANAGER_BASE_URL` | `AgentManagerUnconfiguredError`, caught and logged — never an HTTP status |
| `DATABASE_URL is not set` | the variable is missing from this environment's scope |

There is **no** deprecation warning for `ARK_ENABLED_HARNESSES`. `enabledHarnesses()` reads it via a
silent `??` fallback (`lib/harness/provisioning.ts:82`) and logs nothing, so a deployment still
running the old name gives you no signal at all. Grep your Vercel environment for it instead.

Durable in-database trails, which outlive log retention: `scheduler_ticks` (every tick),
`agent_schedule_runs` (every occurrence), `admin_audit_log` (every human admin action) and
`skill_sources.last_sync_*` (every sync).

`runtime_event_receipts` is **not** one of them yet. The table and its by-age index exist in
`0009_v2_schema.sql`, and a schema comment describes a 30-day sweep — but nothing in `lib/` or
`app/` inserts into it or sweeps it (`grep -rn "runtimeEventReceipts" lib app` matches
`lib/db/schema.ts` only). It is part of the runtime team's contract, not a trail you can read today.

### Rotating secrets

| Secret | Procedure | Blast radius |
|---|---|---|
| `CRON_SECRET` | Update the Vercel variable, redeploy. | Ticks 401 between the change and the redeploy. Nothing is lost — the next successful tick catches up occurrences younger than `SCHEDULER_MISFIRE_MAX_AGE_SECONDS` |
| `STRIPE_WEBHOOK_SECRET` | Add the new endpoint secret in the Dashboard, update the variable, redeploy, then remove the old endpoint. | Events during the gap fail 400; **Stripe retries**, so they land once the secret is right |
| `AGENT_MANAGER_WEBHOOK_SECRET` | Must be rotated **on both sides at once**, coordinated with the Manager team. | Every inbound event 401s during the gap. Redelivery depends on the Manager — assume events in the window are lost |
| `AGENT_MANAGER_API_KEY`, `OPENCLAW_MANAGER_API_KEY` | Issue the new key upstream, update, redeploy, revoke the old. | Outbound calls 401 during the gap |
| `ALIPAY_CALLBACK_SECRET` | Update and redeploy. The token is baked into the `notify_url` at order-create time, so **notifies for orders created before the change carry the old token and will be rejected**. Rotate during a quiet window and reconcile open orders afterwards | Unpaid-looking paid orders |
| `ADMIN_PASSWORD` | Set the variable and re-run `npm run db:seed` (idempotent upsert), or change it from the account screen | None |
| `SESSION_COOKIE_NAME` | Not a secret — changing it signs every user out | All sessions |
| `DATABASE_URL` credentials | Rotate at the database, update both `DATABASE_URL` and `DIRECT_DATABASE_URL`, redeploy | Requests error until the redeploy completes |

`SESSION_SECRET` is not on this list because nothing reads it. Rotating it does nothing.

### Purging the demo workspace from a database that has it

If `db:seed:demo` was ever run against a database that later became production, `demo` / `demo123`
is a live login. Copy the seed's own cleanup ordering: delete the **workspace** first (which cascades
agents, channels, subscriptions, invoices and usage), then the user (cascading its sessions and
identities). Both `agents.workspace_id` and `agents.created_by_id` are `ON DELETE CASCADE`, so either
order removes the agents — the workspace-first order is what `lib/db/seed.ts` does, and doing it the
same way keeps this reproducible against the code.

```sql
BEGIN;

-- What you are about to remove — check this first.
SELECT u.id, u.email, w.id AS workspace_id, w.name
FROM users u
LEFT JOIN workspaces w ON w.owner_id = u.id
WHERE u.email IN ('demo', 'wei@company.com');

DELETE FROM workspaces
WHERE owner_id IN (SELECT id FROM users WHERE email IN ('demo', 'wei@company.com'));

DELETE FROM users
WHERE email IN ('demo', 'wei@company.com');

COMMIT;
```

Then verify, and check nothing else was seeded under a renamed demo login:

```sql
SELECT count(*) FROM users WHERE email IN ('demo','wei@company.com');   -- 0
```

**This is irreversible.** Take a backup first. `wei@company.com` is included because it is the legacy
demo email the seed also cleans up; leaving it behind orphans demo data such as colliding invoice
numbers.

Note what this does **not** do: agents in that workspace carried real `agent_manager_id` values. If
they were ever provisioned against a live Manager, deleting the rows here does not stop the VMs.
Ask the Manager team to reap them.

---

## 10. Rollback

### Reverting a deployment

**Code is reversible. The database is not, and they roll back separately.**

On Vercel, use **Instant Rollback** — promote the previous production deployment from the
dashboard's Deployments list, or:

```bash
vercel rollback <previous-deployment-url>
# or promote a known-good build explicitly
vercel promote <previous-deployment-url>
```

This swaps the alias to an already-built deployment. It does **not** run migrations, and it does not
un-run the ones that already ran.

Two things a rollback does not restore:

1. **`NEXT_PUBLIC_*` values are baked into the build being promoted.** Rolling back restores the
   *old* `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SHOW_DIRECTIONS` as well as the old code.
2. **Server-side environment variables are read at request time**, so the rolled-back code runs
   against the *current* variables. If the release changed a variable, revert it separately.

### What is and is not reversible in the database

**Run migrations before promoting the new code, and design them so the previous release still runs
against the new schema.** There are no `down` migrations in this repository — drizzle-kit generates
forward-only SQL, and nothing in `lib/db/migrations/` reverses anything.

| Change | Reversible? | Notes |
|---|---|---|
| New table | Yes | `DROP TABLE` by hand. Old code never referenced it |
| New nullable column | Yes | Old code ignores it. `DROP COLUMN` if you must |
| New index | Yes | `DROP INDEX` |
| **New enum value** | **No** | Postgres has no `ALTER TYPE … DROP VALUE`. Once `codex` is in `engine`, it is in `engine` for good. Removing it means recreating the type and rewriting every column that uses it. `0007` and `0008` added 12 such values — they are permanent |
| New **NOT NULL** column | No, in practice | The old code does not write it, so inserts from a rolled-back deployment fail. Ship nullable first, backfill, tighten in a later release |
| Renamed or dropped column | No | The old code selects a column that is gone. Ship additively: add the new, dual-write, drop in a later release |
| Row data written by the new release | No | Nothing reverses application writes. `agent_schedule_runs`, `scheduler_ticks`, `usage_records`, `admin_audit_log` and every fulfilled order are append-only history |
| A payment fulfilled by the new release | **No** | A granted seat is a real subscription and a real invoice. Reverse it in the provider and in the app, deliberately |

Practical sequence for a release that includes a migration:

```
1. npm run db:check                 # prove the incremental path — this is the pass that
                                    # catches the enum hazard, which breaks production and not CI
2. Back up the database.            # the only real undo
3. npm run db:migrate               # additive changes only
4. Promote the new deployment.
5. If it goes wrong: roll the DEPLOYMENT back. Leave the schema forward.
   Additive migrations are compatible with the previous release by construction —
   which is why they must be additive.
```

If a migration itself fails, drizzle's single-transaction wrapping means the whole pending batch
rolls back and the database is left at the last-applied file. Fix the file and re-run; do not
hand-patch `drizzle.__drizzle_migrations`, because drizzle decides applied-ness by timestamp and
never re-hashes an applied file — a hand-patched journal diverges silently and permanently.

---

## See also

| Document | For |
|---|---|
| `docs/BACKEND_INTEGRATION_CONTRACT.md` | What the runtime team implements — the source of the empty Runs and Health surfaces, and of `runtime_event_receipts` |
| `docs/PAYMENTS.md` | Stripe and GoHire/Alipay setup in detail, including what to ask the gateway operator for |
| `docs/API.md` | The API routes (v1 surface; v2 added ~30 more) |
| `docs/DATABASE.md`, `docs/DATA_MODEL_V2.md` | The 37 tables |
| `docs/REMINDERS_AND_SCHEDULERS.md` | The scheduler's design, claim protocol and DST handling |
| `docs/SKILL_REPOSITORY.md` | The sync pipeline and safety scorer |
| `docs/HARNESSES_AND_ACTIVITY.md` | Harness capability profiles and the `ATG_ENABLED_HARNESSES` gate |
| `docs/TASK_PLAN_V2.md` | Normative plan; §2.1 is the migration-layout rule |
