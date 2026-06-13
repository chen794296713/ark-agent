# ArkAgent — Technical Specification

> **Product:** ArkAgent (`arkagent.ai` global / `iagent.cc` China) — *"Hire an AI employee, not another app."*
> **Scope:** This document is the engineering blueprint for the ArkAgent web application. ArkAgent is the **control plane**: it owns identity, workspaces, the agent records, billing, and the operator UI. It does **not** run the agents themselves — a separate backend service, the **Agent Manager**, provisions a VM per agent, installs the OpenClaw or Hermes engine, monitors the runtime, and bridges the agent to messaging channels. ArkAgent talks to the Agent Manager over an outbound HTTP API and receives inbound signed webhooks.
>
> Detailed request/response shapes for every endpoint and webhook live in **[`docs/API.md`](./API.md)**. This spec describes the *system*; `API.md` describes the *wire*.
>
> The ten canonical user stories (**US1–US10**) are referenced throughout by ID. See the product brief for their full text.

---

## 1. System Architecture

ArkAgent is a single Next.js 16 application deployed on Vercel. The browser talks only to Next.js; Next.js owns the only credentials to Postgres and to the Agent Manager. The Agent Manager reaches back into ArkAgent solely through a small set of HMAC-signed webhook endpoints.

```
                              ARKAGENT  (Next.js 16 on Vercel · Node runtime)
   ┌────────────┐            ┌──────────────────────────────────────────────────────┐
   │            │  HTTPS     │  app/  (App Router)                                    │
   │  Browser   │  HTML +    │  ┌───────────────────────┐   ┌──────────────────────┐ │
   │  (React 19 │◀──RSC─────▶│  │  UI · Server Components│   │  API · route handlers│ │
   │   client)  │  fetch     │  │  /, /auth, /dashboard, │   │  app/api/**          │ │
   │            │  JSON      │  │  /hire, /payment, …    │   │  (auth, agents,      │ │
   └────────────┘            │  │  + "use client" islands│   │   lifecycle, msgs,   │ │
        │   ▲                │  └───────────┬───────────┘   │   channels, billing, │ │
        │   │ Set-Cookie     │              │ getAuthContext │   webhooks)          │ │
        │   │ ark_session    │              ▼               └──────────┬───────────┘ │
        │   │ (HttpOnly)     │        lib/auth.ts · lib/db (Drizzle)    │             │
        └───┘                │              │                          │             │
                            └───────────────┼──────────────────────────┼─────────────┘
                                            │ SQL (postgres-js, SSL)    │ outbound HTTPS
                                            ▼                           │ (Bearer + HMAC)
                                  ┌───────────────────┐                 ▼
                                  │  Postgres (remote)│        ┌──────────────────────┐
                                  │  18 tables /      │        │   AGENT MANAGER       │
                                  │  Drizzle ORM      │        │  (external service)   │
                                  │  via pgbouncer    │        │  • create VM          │
                                  └───────────────────┘        │  • deploy OpenClaw/   │
                                            ▲                   │    Hermes engine      │
                                            │                   │  • monitor runtime    │
                            inbound webhooks │  (HMAC verified)  │  • channel I/O bridge │
                                            └───────────────────┤                       │
                                  POST /api/webhooks/agent-mgr/* └──────────────────────┘
                                  (status, heartbeat, inbound message,
                                   activity, self-review suggestion)
```

**Two integration directions:**

1. **Outbound (ArkAgent → Agent Manager).** Synchronous control calls triggered by operator actions: provision/deploy an agent (US3), re-sync edited instructions/rules/channels (US5), relay an outbound chat message (US6), pause/resume/terminate (US8). Carried with a service Bearer token; bodies are HMAC-signed.
2. **Inbound (Agent Manager → ArkAgent).** Asynchronous webhooks delivering lifecycle truth: `deployment_status` transitions, heartbeats, inbound agent messages (US6), activity-feed entries (US4), and self-review improvement suggestions (US5). Every request is verified against an HMAC signature before any DB write.

In **development**, a built-in **Mock Agent Manager** stands in for the real service. It accepts the outbound calls and, on a timer, fires the same signed webhooks back at ArkAgent — driving the `provisioning → deploying → working` transition (US3) and emitting fake activity/heartbeats so the full UI is exercisable without external dependencies.

---

## 2. Tech Stack & Rationale

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 16.2.9** (App Router) | One deployable owns SSR UI *and* the API surface (route handlers under `app/api/**`). No separate backend to host the control plane. **Note:** this is Next.js 16 — Middleware is now **Proxy**, route `params` are **async** (`await ctx.params`), and `GET` route handlers are **not cached by default**. Build against the bundled docs in `node_modules/next/dist/docs/`, not from memory. |
| UI runtime | **React 19.2** + React Compiler (`reactCompiler: true`) | Server Components by default; client interactivity isolated to `"use client"` islands. The React Compiler removes most manual `memo`/`useCallback` overhead. |
| Language | **TypeScript 5** (strict) | End-to-end types; Drizzle infers row types (`$inferSelect`/`$inferInsert`) so the DB schema is the single source of truth. |
| Database | **Postgres** (remote) via **Drizzle ORM 0.45** + `postgres-js` | Relational integrity across 18 tables with FKs and cascade rules; Drizzle gives typed queries and SQL-first migrations. |
| Migrations | **drizzle-kit 0.31** | `db:generate` → SQL files in `lib/db/migrations/`, applied with `db:migrate`. DDL runs over the **direct** (non-pooled) connection. |
| Validation | **Zod 4** | Parse/validate every request body and webhook payload at the route boundary before touching the DB. |
| Hosting | **Vercel** | First-party Next.js 16 support, env-var management, regional functions. `vercel.json` pins the `nextjs` framework preset. |
| Auth | **Custom** (`node:crypto` scrypt + session cookie) | No third-party dependency; full control over the China deployment. Detailed in §3. |
| Payments | **Stripe** (global) / **Alipay** (China) | Region-appropriate processors behind one billing model (US9). |

**Deliberate non-choices:** no NextAuth/Clerk (auth is custom and dependency-free), no Prisma (Drizzle is closer to SQL and faster on serverless cold starts), no Redis session store (sessions live in Postgres). The runtime `dependencies` set is intentionally tiny — `next`, `react`, `drizzle-orm`, `postgres`, `zod` — to keep cold starts and the supply-chain surface small.

---

## 3. Auth Design (US1, US2)

Authentication is custom, dependency-free, and implemented in `lib/auth.ts` (marked `import "server-only"` so it can never be bundled to the client).

**Password hashing.** Passwords are hashed with **scrypt** (`node:crypto`) using a per-user 16-byte random salt. The stored value is `"{saltHex}:{hashHex}"` where the hash is a 64-byte scrypt digest. Verification recomputes the digest and compares with `timingSafeEqual` (length-checked first), so the comparison is constant-time and resistant to timing attacks. No password or plaintext is ever logged or returned.

**Sessions.** On sign-in (US2) or sign-up (US1) the server mints a 32-byte random **opaque token** (`randomBytes(32).toString("hex")`) and:
- Stores **only its SHA-256** in `sessions.tokenHash` (plus `userId`, `expiresAt`, captured `userAgent` and first `x-forwarded-for` IP). The raw token is never persisted, so a database leak yields no replayable credentials.
- Sets the raw token in an **HTTP-only cookie** (`ark_session`, configurable via `SESSION_COOKIE_NAME`) with `sameSite: "lax"`, `secure` in production, `path: "/"`, and an expiry of `SESSION_TTL_DAYS` (default 30).

**Validation.** `getCurrentUser()` reads the cookie, SHA-256s the token, and joins `sessions → users` requiring `tokenHash` match **and** `expiresAt > now()`. Expired or unknown tokens resolve to `null`. `getAuthContext()` builds on this, additionally loading the user's owned **workspace** and returning `{ user, workspace }` — the standard handle every protected route and Server Component uses to scope queries.

**Sign-out (US2).** `destroySession()` deletes the matching `sessions` row by token hash and clears the cookie.

**Route protection.**
- **Server Components / pages** call `getAuthContext()` at the top; a `null` result `redirect()`s to `/auth`. This is the authoritative authorization check (it hits the DB).
- **API route handlers** (`app/api/**`) call `getAuthContext()` first and return `401` when unauthenticated; all subsequent queries are filtered by `workspace.id` for tenant isolation (§9).
- **Proxy** (`proxy.ts`, formerly Middleware) may perform an *optimistic* cookie-presence check to redirect obviously-unauthenticated traffic away from `/dashboard/*` early. Per the Next.js 16 guidance, Proxy is **not** the authorization boundary — it cannot do DB session lookups and runs before cache; the real check is always `getAuthContext()` in the route/page.

---

## 4. Data Model Overview

The schema (`lib/db/schema.ts`, Postgres via Drizzle) is **18 tables** plus the supporting `pgEnum`s, grouped into five domains. UUID v4 primary keys throughout (except `plans`, keyed by tier enum; `agent_roles`, keyed by slug; and `usage_records`, a `bigint` identity ledger). All foreign keys declare `onDelete` behavior (`cascade` within a tenant tree, `set null` for soft references). Summary below — see the schema file for every column.

**Identity** — `users`, `sessions`, `workspaces`, `workspace_members`
New sign-ups (US1) create a `users` row (unique email, scrypt hash, `locale` default `en`) and an owned `workspaces` row that carries the rolled-up credit allowance (`creditsIncluded`/`creditsUsed`/`cycleResetsAt`, US9). `workspace_members` is the M:N join with a `member_role` (`owner`/`admin`/`member`) for multi-user workspaces. `sessions` stores only the token SHA-256 (§3).

**Catalog (seeded reference)** — `agent_roles`, `plans`
`agent_roles` holds the **8 seeded roles** (prospector, salesmkt, admin, hr, support, legal, content, opc) with display metadata (`hue`, `mono`), a `defaultEngine`, default instructions/rules used to pre-fill the hire wizard (US3), and a `minPlan` gate. `plans` holds the **3 tiers** (associate $49/5k credits, professional $149/25k, director $399/100k) with pricing, included credits, overage rate, and a `features` JSON array.

**Agents** — `agents`, `agent_tasks`, `agent_activities`, `agent_metrics`, `agent_improvements`
`agents` is the central record: workspace + creator, `roleId`, `engine` (`openclaw`/`hermes`), `planTier`, the operator-authored `instructions` and `rules` (the "job brief", US3), credit counter, and a 9-value `status` (`draft`, `provisioning`, `deploying`, `working`, `scheduled`, `needs_review`, `paused`, `error`, `terminated`). It also carries the **fields shared with the Agent Manager**: `agentManagerId` (unique), `vmId`, `vmRegion`, `deploymentStatus`, `lastError`, `lastHeartbeatAt`, `provisionedAt`, `uptimeStartedAt`. The four child tables back the agent-detail tabs (US5): `agent_tasks` (queued/in_progress/done/blocked), `agent_activities` (the live feed, US4, tagged via `activity_tag`), `agent_metrics` (the Performance tab — label/value/delta/weighted bar), and `agent_improvements` (the **self-review queue**: `pending`/`approved`/`dismissed`).

**Comms** — `channels`, `agent_channels`, `conversations`, `messages`
`channels` are workspace-level connections (one per `type` per workspace: telegram, whatsapp, wechat, line, slack, email, web) with a `status` and a `config` JSONB whose **secret values are encrypted at the app layer** (§9, US7). `agent_channels` attaches channels to agents (M:N). `conversations` group `messages`; each message records `sender` (`user`/`agent`/`system`), `channelType`, delivery `status`, and an `externalId` — a **unique** idempotency key used to dedupe Agent Manager-delivered messages (US6).

**Billing** — `subscriptions`, `invoices`, `usage_records`
One `subscriptions` row = one **agent seat** (plan + monthly/annual cycle + status), so seats roll up into the workspace credit pool. `invoices` carry amount/currency/status and the `payment_provider` (`stripe`/`alipay`, US9). `usage_records` is an append-only **credit ledger** (`kind` = message/task/research/compute/adjustment, signed `credits`), the source of truth behind the billing dashboard's per-agent and per-period rollups.

---

## 5. API Surface Overview

All server endpoints are **Route Handlers** under `app/api/**` (`route.ts` files; Node runtime, §8). Each parses its body with Zod, authorizes with `getAuthContext()`, and scopes every query by `workspace.id`. Dynamic segments use the Next.js 16 typed, **async** context: `async function GET(req, ctx: RouteContext<'/api/agents/[id]'>) { const { id } = await ctx.params }`. Full schemas, status codes, and examples are in **[`docs/API.md`](./API.md)**; the groups:

| Group | Representative endpoints | Stories |
| --- | --- | --- |
| **Auth** | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` | US1, US2 |
| **Agents** | `GET /api/agents`, `POST /api/agents` (hire/launch), `GET /api/agents/[id]`, `PATCH /api/agents/[id]` (edit brief/channels → re-sync) | US3, US4, US5 |
| **Agent lifecycle** | `POST /api/agents/[id]/pause`, `/resume`, `/terminate` | US8 |
| **Self-review** | `POST /api/agents/[id]/improvements/[impId]` (approve/dismiss) | US5 |
| **Messages** | `GET /api/agents/[id]/conversations`, `GET/POST /api/conversations/[cid]/messages` (send → relay to Agent Manager) | US6 |
| **Channels** | `GET /api/channels`, `POST /api/channels` (connect), `PATCH /api/channels/[id]`, attach/detach to agents | US7 |
| **Billing** | `GET /api/billing/usage`, `GET /api/invoices`, `POST /api/billing/subscribe` (pick plan + cycle, init Stripe/Alipay) | US9 |
| **Preferences** | `PATCH /api/me` (locale + theme persistence) | US10 |
| **Webhooks** | `POST /api/webhooks/agent-mgr/*` (status, heartbeat, message, activity, improvement) — HMAC-verified, **no** session cookie | §6 |

Convention: mutations return the updated resource; list endpoints return `{ data: [...] }`. Validation failures → `422`, auth failures → `401`, cross-workspace access → `404` (not `403`, to avoid leaking existence). `GET` handlers are uncached by default in Next.js 16; control-plane reads stay request-time so operators always see live state.

---

## 6. Agent Manager Integration Contract

ArkAgent and the Agent Manager are independent services bound by a versioned HTTP contract. This section summarizes the shape; **[`docs/API.md`](./API.md)** is authoritative for payloads, headers, and retry semantics.

**Outbound (ArkAgent → Agent Manager).** Base URL `AGENT_MANAGER_URL`, authenticated with `Authorization: Bearer ${AGENT_MANAGER_API_KEY}`. Each request body is HMAC-signed (see signing below) so the Agent Manager can verify origin.

| Call | Trigger | Effect |
| --- | --- | --- |
| `POST /agents` (provision + deploy) | Launch in hire wizard (US3) | Agent Manager creates the VM, installs the chosen engine; ArkAgent stores `agentManagerId`, sets status `provisioning` |
| `PATCH /agents/{amId}` (sync config) | Edit instructions/rules/channels (US5) | Pushes the new brief/channel attachments to the running agent |
| `POST /agents/{amId}/messages` (relay) | User sends a web-chat message (US6) | Delivers the outbound message; the reply returns later via webhook |
| `POST /agents/{amId}/{pause\|resume\|terminate}` | Lifecycle controls (US8) | Stops/starts/destroys the runtime; ArkAgent reflects status |

**Inbound (Agent Manager → ArkAgent webhooks).** All land at `POST /api/webhooks/agent-mgr/*`, carry no session cookie, and are verified by HMAC before any write:

| Webhook | Updates |
| --- | --- |
| `deployment.status` | Advances `agents.status` / `deploymentStatus` (drives `provisioning → deploying → working`, US3) and sets `provisionedAt`/`uptimeStartedAt`; sets `error` + `lastError` on failure |
| `heartbeat` | Stamps `lastHeartbeatAt` (powers liveness in the dashboard, US4) |
| `message.inbound` | Inserts an `agent`-sender `messages` row (deduped on `externalId`) into the conversation (US6) |
| `activity` | Appends an `agent_activities` row (live feed, US4) |
| `improvement.suggested` | Enqueues an `agent_improvements` row as `pending` (self-review queue, US5) and may flip status to `needs_review` |

**HMAC signing (both directions).** A shared secret `AGENT_MANAGER_WEBHOOK_SECRET` keys an HMAC-SHA-256 over `${timestamp}.${rawBody}`. The signature and timestamp travel in headers (e.g. `X-Ark-Signature`, `X-Ark-Timestamp`). The receiver recomputes over the **raw** body and compares with `timingSafeEqual`, **rejecting requests whose timestamp is outside a small skew window** (replay protection). Webhook handlers must read the raw request text *before* JSON-parsing so the signed bytes match exactly. Inbound writes are **idempotent** (unique `externalId` on messages; status transitions are monotonic) because at-least-once delivery means retries are expected.

---

## 7. Internationalization (US10)

ArkAgent ships in three languages: **English (`en`)**, **Simplified Chinese (`zh`)**, **Traditional Chinese (`zht`)** — the `locale` pgEnum and `Lang` type agree on these three codes everywhere.

**Dictionaries.** UI copy lives in typed dictionaries keyed by `Lang` (`lib/i18n.ts` exports `dict: Record<Lang, Dict>`); the `Dict` interface makes every translation key compile-checked, so a missing string in one language is a build error rather than a runtime blank.

**Locale resolution.**
1. **First visit** — `detectLang(navigator.language)` maps the browser locale: `zh-TW/HK/MO` or `…Hant` → `zht`, any other `zh*` → `zh`, everything else → `en`.
2. **Signed-in users** — the persisted `users.locale` is the source of truth and overrides detection.
3. **Manual switch** — the nav language switcher updates client state immediately (`lib/store.tsx`) and, for signed-in users, persists via `PATCH /api/me` so the choice follows them across devices.

**Theme (also US10).** Dark/light is a sibling preference. To avoid a flash-of-unstyled-content, a tiny pre-paint script in the root layout reads `localStorage["ark-theme"]` and sets `<html data-theme>` before React hydrates; `lib/store.tsx` then adopts whatever the script applied. Signed-in users' theme/locale persist to their profile.

---

## 8. Rendering, Runtime, Caching & Error Handling

**Rendering model.** Pages are **React Server Components** by default — they call `getAuthContext()` and Drizzle directly, server-side, with no client data-fetching round-trip. Interactivity is confined to `"use client"` islands (`lib/store.tsx`, `ThemeToggle`, `MobileNav`, the hire wizard, chat). The React Compiler (`reactCompiler: true`) handles memoization.

**Runtime.** Every route that touches Postgres, `node:crypto`, or `cookies()`/`headers()` runs on the **Node.js runtime** (`export const runtime = 'nodejs'` — also the Next.js 16 default). The **Edge runtime is not used** for these: `postgres-js` and `node:crypto` (scrypt) require Node, and edge is unsupported under Cache Components. `lib/auth.ts` and `lib/db` are `server-only`.

**Database connection.** `lib/db/index.ts` parses `DATABASE_URL` manually rather than handing the raw URL to `postgres-js`, because the pooler URL carries non-libpq params (`pgbouncer`, `connection_limit`, `pool_timeout`). When `pgbouncer=true`, **prepared statements are disabled** (`prepare: false`) since transaction-pooling mode is incompatible with them. A single client is memoized on `globalThis` to survive HMR and avoid pool exhaustion in dev. DDL/migrations use the **direct** (non-pooled) `DIRECT_DATABASE_URL`.

**Caching.** This is the control plane, so freshness wins. Per Next.js 16, `GET` Route Handlers are **uncached by default** and we keep them that way — every read reflects live agent state, credit usage, and conversation history. Any genuinely static reference data (e.g. the seeded `plans`/`agent_roles` catalog rendered on marketing pages) may opt into caching via a `use cache` helper with a coarse `cacheLife`, never inline in a handler body. No agent/workspace/billing data is cached.

**Error handling.** Route handlers wrap work in try/catch and return structured JSON errors (`422` validation with Zod issue details, `401` unauthenticated, `404` not-found/cross-tenant, `409` conflict, `502` when an upstream Agent Manager call fails) — never raw stack traces. Outbound Agent Manager calls are time-bounded and surface failures as `agents.lastError` + an `error` status rather than crashing the request. UI route segments use `error.tsx`/`not-found.tsx` boundaries; `loading.tsx` provides streamed fallbacks for slower Server Components.

---

## 9. Security

**Tenant isolation (authz by workspace).** Authorization is enforced in the route/page layer, not at the edge. Every authenticated handler derives `workspace.id` from `getAuthContext()` and filters **all** queries by it; an agent/channel/conversation/invoice ID that resolves to a different workspace returns `404`. IDs are unguessable UUIDs, and FKs cascade within the tenant tree so deletes never orphan cross-tenant rows.

**Channel secret encryption (US7).** `channels.config` is JSONB that holds connection credentials (bot tokens, API keys, webhook secrets per channel type). Secret values are **encrypted at the application layer** before they are written — using authenticated symmetric encryption (AES-256-GCM via `node:crypto`) keyed by a server-side `CHANNEL_ENCRYPTION_KEY` env var. Plaintext secrets exist only transiently in memory while a connect/sync request is processed; they are never returned to the client (the API echoes masked values) and never logged. Rotating the key re-encrypts on next write.

**Webhook signature verification (§6).** Inbound Agent Manager webhooks are unauthenticated by cookie and therefore **must** pass HMAC-SHA-256 verification over the raw body with a timestamp-skew check before any side effect. Comparison uses `timingSafeEqual`; failures return `401` and are not retried into the DB. Idempotency keys (`externalId`) and monotonic status transitions make replayed-but-valid deliveries harmless.

**Auth hardening.** Session tokens are high-entropy and stored only as SHA-256 (§3); cookies are `HttpOnly` + `Secure` (prod) + `SameSite=Lax`. scrypt with per-user salt and constant-time verification defends offline cracking and timing attacks. No secret (password, token, channel credential, signing key) is ever logged.

**Transport & input.** TLS everywhere (browser↔Vercel, Vercel↔Postgres with `ssl: "require"`, Vercel↔Agent Manager). Drizzle parameterizes all SQL (no string interpolation → no injection). Zod validates and narrows every request body and webhook payload at the boundary. Secrets live only in Vercel env vars, never in the repo.

---

## 10. Deployment

**Platform.** Vercel, `nextjs` framework preset pinned in `vercel.json`. `turbopack.root` is pinned to the project directory in `next.config.ts` so a stray home-directory lockfile cannot mislead Next.js into inferring the wrong workspace root during file tracing.

**Build.** `next build`. The React Compiler runs via `babel-plugin-react-compiler`. TypeScript and ESLint (`eslint-config-next`) gate the build.

**Environment variables.**

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled (pgbouncer) Postgres URL for app runtime queries |
| `DIRECT_DATABASE_URL` | Direct (non-pooled) URL for migrations / DDL |
| `SESSION_COOKIE_NAME` | Session cookie name (default `ark_session`) |
| `SESSION_TTL_DAYS` | Session lifetime in days (default `30`) |
| `AGENT_MANAGER_URL` | Base URL of the Agent Manager service |
| `AGENT_MANAGER_API_KEY` | Bearer token for outbound Agent Manager calls |
| `AGENT_MANAGER_WEBHOOK_SECRET` | Shared HMAC secret for signing/verifying webhooks (both directions) |
| `CHANNEL_ENCRYPTION_KEY` | AES-256-GCM key for encrypting `channels.config` secrets |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Global payments (US9) |
| `ALIPAY_*` | China payments (US9) |
| `NODE_ENV` | Toggles `secure` cookies, prod DB-client memoization, and the dev Mock Agent Manager |

All are configured in Vercel project settings (per environment); none are committed. `vercel env pull` populates a local `.env` for development.

**Migrations.** SQL migrations are versioned in `lib/db/migrations/` (generated by `npm run db:generate`). They are applied with `npm run db:migrate` against `DIRECT_DATABASE_URL` as a release step (not during the serverless request path). Reference data (8 `agent_roles`, 3 `plans`) is loaded by `npm run db:seed`.

**Regions & environments.** Global traffic runs on `arkagent.ai`; the China deployment runs on `iagent.cc` with region-appropriate Postgres, the Alipay provider, and locale defaulting toward `zh`/`zht`. **Dev/Preview** deployments use the **Mock Agent Manager** (no real VMs are provisioned) so previews exercise the full US3–US8 lifecycle safely; **Production** points `AGENT_MANAGER_URL` at the real service.
