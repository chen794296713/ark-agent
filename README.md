# ArkAgent

**Hire an AI employee, not another app.**

ArkAgent is a full-stack platform for **hiring autonomous AI agents** that run on dedicated VMs — selling, supporting, recruiting, and writing for you around the clock. You brief an agent like a person (role + instructions + rules), pick its channels, and manage it from the web console **or** from the messaging apps you already use (Telegram / WhatsApp / WeChat / LINE / Slack / Email).

🌐 Live: **[arkagent.ai](https://arkagent.ai)** (global) · **iagent.cc** (中国大陆)
🔑 Demo login: **`demo` / `demo123`** — the only account with sample data; every account you register starts empty.

---

## Two engines

Each agent is powered by one of two real open-source agent runtimes, integrated behind one control plane:

| Engine | Positioning | Best for |
|---|---|---|
| **OpenClaw** — *open runtime* | Plugins & Skills system (100+ skills) + Local Execution (shell/files/browser/docker) + heartbeat scheduler across 12+ channels | Outreach, support, channel-heavy roles |
| **Hermes** (Nous Research) — *precision* | Model-agnostic LLM provider + a self-improving learning loop (agent-curated memory, autonomous skill creation) | Legal, finance, research, long-horizon "one-person company" ops |

> ArkAgent is the **control plane** — it owns identity, workspaces, agent records, billing, and the operator UI. It does **not** run the agents itself: a separate **Agent Manager** service provisions a VM per agent, deploys OpenClaw/Hermes, monitors it, and bridges it to channels. ArkAgent calls the Agent Manager over an outbound HTTP API and receives HMAC-signed webhooks back. A built-in **mock** Agent Manager simulates all of this in-process so the full flow works with zero external dependencies.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, Turbopack, React Compiler) |
| UI | **React 19** + **TypeScript 5** (strict) |
| Database | **Postgres** + **Drizzle ORM** (`postgres-js`), migrations via `drizzle-kit` |
| Auth | Custom email + HTTP-only session cookies (`node:crypto` scrypt; only token SHA-256 stored) |
| Validation | **Zod 4** at every request boundary |
| Styling | Inline-style design system — "**Terminal Lime**" tokens in [`lib/theme.ts`](lib/theme.ts), responsive + dark/light themes |
| i18n | English / 简体中文 / 繁體中文, persisted per user |
| Hosting | **Vercel** |

Runtime dependencies are intentionally tiny: `next`, `react`, `drizzle-orm`, `postgres`, `zod`.

---

## Getting started

**Prerequisites:** Node 20+ and a Postgres database.

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
#   then fill in DATABASE_URL + DIRECT_DATABASE_URL and generate a SESSION_SECRET:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Apply the schema + seed reference data and the demo workspace
npm run db:migrate
npm run db:seed

# 4. Run
npm run dev        # http://localhost:3000  (or the PORT set in .env)
```

Sign in with **`demo` / `demo123`** to explore a fully-populated workspace, or **create an account** (a real email is required) to start with an empty one.

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
| `npm run db:seed` | Seed reference data + the `demo` workspace |

`AGENT_MANAGER_MODE=mock` (the default) uses the in-process simulator; set it to `live` plus `AGENT_MANAGER_BASE_URL` to talk to a real Agent Manager.

---

## Features

| Area | What works (backed by the DB + API) |
|---|---|
| **Auth** | Register (real email) / login (email *or* username) / logout / session — scrypt + cookie sessions |
| **Hire wizard** | Pick role → write brief (with ✦ AI auto-generate) → choose engine & channels → review → **launch**, which provisions the agent via the Agent Manager |
| **Dashboard** | Roster, live activity feed, credit usage, "needs review" count |
| **Agent detail** | Activity · Tasks · **Chat** (send → agent reply) · Performance + self-review approve/dismiss · **Settings** |
| **Settings** | Engine-aware config: behavior, autonomy & approvals, schedule, model & reasoning, OpenClaw skills/tools, Hermes learning loop, memory & knowledge, channels, notifications, spend caps |
| **Lifecycle** | Pause / resume / terminate |
| **Channels** | Connect Telegram / WhatsApp / WeChat / LINE / Slack / Email (secrets masked on read) |
| **Billing** | Credits, per-agent usage, invoices; pick plan + cycle and pay via Stripe (global) / Alipay (China) — *checkout simulated* |
| **i18n & theme** | EN / 简 / 繁 + dark/light, persisted to the user profile |

---

## Project layout

```
app/
  layout.tsx                root layout (fonts, AppProvider, no-FOUC theme script)
  page.tsx  auth/  hire/  payment/  directions/
  dashboard/                dashboard shell (auth gating) + overview/fleet/detail/channels/billing
  api/                      Route Handlers — auth, agents, lifecycle, messages, improvements,
                            channels, billing, dashboard, roles, plans, me, webhooks
components/                 ui.tsx, MobileNav, ThemeToggle, DemoPill
lib/
  db/                       schema.ts · index.ts (lazy client) · migrations/ · seed.ts
  auth.ts                   scrypt + session cookies (server-only)
  agent-manager/            client + mock + live + webhook (HMAC) — the Agent Manager contract
  services/agents.ts        create→provision, lifecycle, detail queries
  agent-settings.ts         AgentSettings model, defaults, catalogs
  validation.ts  serializers.ts  api.ts  client-api.ts  agent-display.ts
  theme.ts  i18n.ts  store.tsx  data.ts  types.ts
docs/                       PRD · SPEC · USER_STORIES · USE_CASES · TASK_PLAN · API · DATABASE
```

## Documentation

- [**PRD.md**](docs/PRD.md) — product requirements
- [**SPEC.md**](docs/SPEC.md) — technical specification (architecture, auth, data model, API, security, deployment)
- [**USER_STORIES.md**](docs/USER_STORIES.md) — the 10 user stories with acceptance criteria
- [**USE_CASES.md**](docs/USE_CASES.md) — 42 use cases covering every story
- [**TASK_PLAN.md**](docs/TASK_PLAN.md) — the ordered build plan
- [**API.md**](docs/API.md) — full REST + Agent Manager integration contract
- [**DATABASE.md**](docs/DATABASE.md) — schema, enums, and seed reference

---

## Deployment

Deploys to **Vercel** from `main`. Configure the env vars from `.env.example` in the project settings (at minimum `DATABASE_URL`, `DIRECT_DATABASE_URL`, `SESSION_SECRET`; the DB client is created lazily so the build never fails on a missing URL). Migrations run as a release step (`npm run db:migrate`); they are not run on the serverless request path.
