# ArkAgent

ArkAgent is a web workspace for configuring AI coworkers and managing their work. Start with a professional role, customize its goals and instructions, and manage its skills, context, schedules, channels, and activity from one dashboard.

This repository contains the Next.js application, API routes, database schema, and versioned agent packages. Agent execution is handled by external runtime services; running the web app alone does not launch an autonomous agent.

## What you can do

- **Configure a role package.** Choose Recruiting, Job Applicant, Video Creator, Sales Outreach, or Email Assistant. Each package includes procedural skills, specialist definitions, workflows, quality checks, and connection requirements.
- **Create a custom agent.** Generate and review a brief with the Agent Template Generator, or start from the template gallery. Generation has a deterministic fallback when no LLM key is configured.
- **Manage a fleet.** Edit instructions, rules, skills, context, and schedules; inspect conversations, activity, runs, health, and usage as runtime data becomes available.
- **Operate a workspace.** Manage accounts, channel connections, billing, and administration. Payment integrations cover Stripe and Alipay through the GoHire gateway.
- **Use your preferred language.** The interface supports English, Simplified Chinese, Traditional Chinese, and Japanese, with light and dark themes.

## Agent packages and runtime support

The five featured roles are versioned packages with editable configuration:

| Package ID | Role focus |
| --- | --- |
| `recruiting` | Hiring briefs, candidate research, screening, and interview coordination |
| `job-applicant` | Job discovery, application materials, application tracking, and interview preparation |
| `video-creator` | Creative briefs, scripts, storyboards, editing, captions, and delivery workflows |
| `sales-outreach` | Account research, lead qualification, outreach drafts, and sales handoffs |
| `email-assistant` | Work inbox triage, reply drafts, follow-ups, and daily briefings |

Saving a customized package creates an **unbilled draft**. The saved bundle can be inspected and downloaded before deployment. Deployment uses a separate package manager protocol that verifies the bundle, installed skills, enforced policy, and required connections. A verified installation remains paused; it is not evidence that a professional task has run successfully.

A *harness* is the runtime that executes an agent. Package compilation and legacy VM provisioning have different support:

| Harness | Package configuration and export | Legacy provisioning mapping |
| --- | --- | --- |
| OpenClaw | Available | Available |
| Hermes | Available | Available |
| Codex | Available | Not assigned |
| DeepSeek | Not offered | Not assigned |

Legacy provisioning still requires a working OpenClaw Manager service. `ATG_ENABLED_HARNESSES` can restrict the mapped harnesses; adding an unmapped harness to the variable does not enable it. Package deployment instead requires `ARK_PACKAGE_MANAGER_URL`, `ARK_PACKAGE_MANAGER_TOKEN`, and an explicit `ARK_PACKAGE_MANAGER_HARNESSES` allowlist.

Mail, calendars, applicant tracking systems, CRMs, media renderers, and other tools must be connected and supported by the runtime. Package definitions describe the intended workflows; they do not supply those external integrations. See the [package runtime contract](docs/AGENT_PACKAGE_RUNTIME_CONTRACT.md) and [verification record](docs/AGENT_PACKAGES_VERIFICATION.md) for the implementation boundary.

## Local development

### Prerequisites

- **Node.js 24.x**, as declared in [`.nvmrc`](.nvmrc) and [`package.json`](package.json).
- **npm**, using the committed `package-lock.json`.
- A **PostgreSQL development database**. The deployment guide recommends PostgreSQL 16 or newer.

### 1. Install dependencies

```sh
git clone https://github.com/kenny9911/ark-agent.git
cd ark-agent
nvm use
npm ci
cp .env.example .env
```

If you do not use nvm, install Node.js 24 before running `npm ci`.

### 2. Configure the development environment

Edit `.env` using [`.env.example`](.env.example) as the full reference. Set both database URLs to your development database and choose an administrator password. For an existing local database without TLS, the relevant settings look like this:

```dotenv
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/arkagent?sslmode=disable
DIRECT_DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/arkagent?sslmode=disable
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-unique-password
AGENT_MANAGER_MODE=mock
PAYMENTS_MODE=mock
OPENROUTER_API_KEY=
```

Use your database provider's connection and TLS settings for a remote database. `DATABASE_URL` serves application queries; `DIRECT_DATABASE_URL` is the non-pooled connection used by migration tooling.

The template includes a placeholder `OPENROUTER_API_KEY`. **Clear it or replace it with a real key**: any non-empty value enables LLM requests. Keep `.env` private; it is ignored by Git.

### 3. Initialize the database and start the app

```sh
npm run db:migrate
npm run db:seed
npm run skills:seed
npm run dev
```

Open [localhost:3000](http://localhost:3000). Register an account to create an empty workspace, or sign in with the administrator credentials you configured. The two seed commands populate plans, role reference data, the platform administrator, and the skill catalog.

For a populated development workspace, optionally run:

```sh
npm run db:seed:demo
```

This enables the local demo login `demo` / `demo123` and rebuilds its sample workspace. Demo seeding is refused when `NODE_ENV=production`.

### What local mode provides

With PostgreSQL configured, you can explore the dashboard, save package drafts, browse seeded skills, and use deterministic template generation without external service credentials. Mock payments simulate checkout without charging a provider.

`AGENT_MANAGER_MODE=mock` selects the simulator for the Agent Manager adapter. It does **not** replace the separate OpenClaw Manager API used by legacy hiring, nor the package deployment service. Legacy hiring can therefore fail without its manager, and package deployment returns an unavailable response until its service is configured.

## Configuration by feature

| Feature | Main settings | Notes |
| --- | --- | --- |
| Database | `DATABASE_URL`, `DIRECT_DATABASE_URL` | Required for persisted application data and migrations |
| Public origin | `NEXT_PUBLIC_APP_URL` | Used for OAuth and payment callback/return URLs; set the public HTTPS origin in production |
| Administrator | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Applied by `db:seed`; set your own password before seeding an exposed environment |
| Agent Manager adapter | `AGENT_MANAGER_MODE`, `AGENT_MANAGER_BASE_URL`, `AGENT_MANAGER_API_KEY`, `AGENT_MANAGER_WEBHOOK_SECRET` | Runtime operations and signed inbound webhooks |
| Legacy instance provisioning | `OPENCLAW_MANAGER_API_URL`, `OPENCLAW_MANAGER_API_KEY`, `ATG_ENABLED_HARNESSES` | Separate from the adapter's mock/live switch |
| Package deployment | `ARK_PACKAGE_MANAGER_URL`, `ARK_PACKAGE_MANAGER_TOKEN`, `ARK_PACKAGE_MANAGER_HARNESSES` | Requires an HTTPS endpoint implementing the package runtime contract |
| LLM features | `OPENROUTER_API_KEY`, `LLM_MODEL` | Powers model-backed generation and chat; individual features define their no-key behavior |
| Scheduled jobs | `CRON_SECRET` | Bearer authentication for schedule ticks and skill discovery sync |
| Payments | `PAYMENTS_MODE`, `STRIPE_*`, `ALIPAY_*` | Provider setup and callback configuration are detailed in the [payments guide](docs/PAYMENTS.md) |
| Social sign-in | `GOOGLE_CLIENT_*`, `WECHAT_WEB_APP_*`, `WECHAT_MP_APP_*` | Optional Google and WeChat login credentials |

In production, absent payment credentials resolve to an unconfigured provider, and an absent Agent Manager configuration does not automatically select the simulator. Explicit mock settings still override those defaults, so replace development settings before deployment. The [deployment guide](docs/DEPLOYMENT.md) documents how configuration failures surface in each path.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run stop` | Stop this checkout's Next.js server |
| `npm run restart` | Restart the development server |
| `npm run build` | Create a production build |
| `npm start` | Serve an existing production build |
| `npm run restart:prod` | Restart the production server using its existing build |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Node.js test suite through `tsx` |
| `npm run test:watch` | Rerun tests during development |
| `npm run db:generate` | Generate SQL migrations from the Drizzle schema |
| `npm run db:migrate` | Apply committed migrations |
| `npm run db:check` | Replay migrations from fresh and previously migrated states |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run skills:sync` | Fetch skill candidates from configured sources for review |
| `npm run llm:check` | Check the configured OpenRouter model and connection |
| `npm run pricing:check` | Validate pricing invariants |
| `npm run payments:check` | Check payment configuration and mock behavior |

Run the standard code checks before submitting changes:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

For database changes, also run `npm run db:check` against a disposable development PostgreSQL server. The connecting role needs `CREATEDB`; the script creates and drops a database named `ark_migration_check`. Do not edit migrations that have already been applied. Keep enum-value additions in separate migration files and verify both fresh and incremental replay.

### Export a package

```sh
npm run packages:export -- recruiting hermes /tmp/ark-recruiting
```

The destination must not exist. The exporter writes the compiled files and `bundle.json` under `/tmp/ark-recruiting/workspace/`. Use any package ID from the table above and one of `openclaw`, `hermes`, or `codex`. Exporting a bundle does not install a runtime or provision an agent.

## Repository map

The application uses Next.js 16 App Router, React 19, TypeScript, CSS Modules, PostgreSQL, and Drizzle ORM. Tests use `node:test` through `tsx`.

```text
app/                    Pages and API routes
  api/                  Auth, agents, packages, templates, billing, cron, webhooks
  dashboard/            Fleet, templates, skills, channels, billing, account, admin
  hire/                 Package customization and custom-agent creation
components/             Marketing, workspace, and shared UI components
lib/
  agent-packages/        Role definitions, compilation, policy, persistence, deployment
  agent-manager/        Mock/live runtime adapter and webhook verification
  atg/                  Agent Template Generator pipeline and deterministic fallback
  db/                   Drizzle schema, SQL migrations, and seed data
  harness/              Harness capabilities and provisioning gates
  services/             Agent, billing, configuration, and scheduling operations
  skills/               Catalog, safety scoring, queries, and discovery sync
  activity/             Runtime activity queries and serialization
  payments/             Stripe and Alipay integration
  i18n/                 Interface translations
scripts/                Maintenance, validation, seeding, and export commands
tests/                  Automated regression tests
docs/                   Product, integration, deployment, and design documentation
public/                 Static assets and role illustrations
docker/                 Container deployment configuration
```

## Deployment and current boundaries

See [Deployment](docs/DEPLOYMENT.md) for the full operating guide. A release needs the production environment configured, migrations applied as a separate release step, reference data seeded, and a successful `npm run build`. Use `npm start` for a Node.js host.

[`vercel.json`](vercel.json) configures a schedule tick every minute and skill discovery sync daily at 03:17 UTC. Other hosts need an external scheduler calling the same endpoints with `Authorization: Bearer <CRON_SECRET>`.

Keep these implementation boundaries in mind:

- **Package deployment needs an external implementation.** There is no mock-success or legacy fallback for installing a package. Connected provider execution and live task quality are separate verification work.
- **Detailed runtime telemetry is incomplete.** The app can display run, step, and health records, but the current webhook handler does not populate those tables. Empty views do not prove an agent is healthy or idle.
- **Legacy provisioning is limited to mapped harnesses.** Codex package export does not imply legacy Codex VM availability; DeepSeek remains gated.
- **Discovered skills require review.** Sync stores new candidates as drafts instead of automatically publishing them.
- **The Docker configuration needs alignment.** Its image currently uses Node.js 22 while the application targets Node.js 24. Review that path before using it as your deployment baseline.

## Documentation

| Document | Use it for |
| --- | --- |
| [User guide](docs/USER_GUIDE.md) | Navigating the product and managing agents |
| [Product specification](docs/PRODUCT_SPEC.md) | Product scope and feature behavior |
| [Package specification](docs/AGENT_PACKAGES_PRODUCT_SPEC.md) | The five professional role packages |
| [Package runtime contract](docs/AGENT_PACKAGE_RUNTIME_CONTRACT.md) | Implementing verified package installation |
| [Package verification](docs/AGENT_PACKAGES_VERIFICATION.md) and [remaining tasks](docs/AGENT_PACKAGES_TASKS.md) | Tested behavior and remaining launch work |
| [Deployment](docs/DEPLOYMENT.md) | Environment setup, releases, operations, and troubleshooting |
| [Payments](docs/PAYMENTS.md) | Stripe and Alipay setup and callbacks |
| [Backend integration contract](docs/BACKEND_INTEGRATION_CONTRACT.md) | Runtime events, manifests, and integration responsibilities |
| [API reference](docs/API.md) and [database reference](docs/DATABASE.md) | Original API and data model documentation |
| [Design and planning index](docs/README_V2.md) | Detailed subsystem specifications and implementation plans |
| [Design system](DESIGN.md) | Visual language and interface conventions |

Some documents describe planned work or earlier versions. For current commands, configuration, and behavior, consult `package.json`, `.env.example`, and the implementation alongside the relevant guide.
