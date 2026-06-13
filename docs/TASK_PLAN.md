# ArkAgent — Implementation Task Plan

This is the ordered, top‑to‑bottom build plan that turns the existing front‑end
prototype + migrated database into the full product described in the spec. It
implements all ten canonical user stories (US1–US10).

## How to read this plan

- Each task is a checkbox with a short description, the **files** it touches, its
  **deps** (task IDs that must land first), and the **UC** (US IDs) it satisfies.
- Tasks are grouped into epics **A–K** and ordered so an engineer can execute them
  in sequence. Within an epic, tasks are also ordered.
- **Current state (important):** the front‑end (`app/**`, `components/**`,
  `lib/data.ts`, `lib/store.tsx`, `lib/i18n.ts`, `lib/theme.ts`) is a fully built,
  pixel‑true prototype that runs entirely on **static data** (`lib/data.ts`) and
  **client‑only state** (`lib/store.tsx`). Pages navigate with `router.push` and
  fake their effects. Epic A (DB schema, migration `0000_faithful_nova.sql`, db
  client, auth crypto helpers in `lib/auth.ts`, `.env.example`) is **done**. The
  job of this plan is to stand up the API layer + Agent Manager integration and
  re‑wire the existing screens onto real data, while preserving the look & feel.
- **Stack conventions (Next.js 16 / React 19):** All server logic lives in
  **Route Handlers** (`app/api/**/route.ts`) using the Web `Request`/`Response`
  APIs (see `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`).
  Route Handlers are **not cached by default** — every handler here is dynamic
  (reads cookies/headers/DB). Dynamic route params are async: use
  `RouteContext<'/api/agents/[id]'>` and `await ctx.params`. Read the relevant
  guide in `node_modules/next/dist/docs/` before writing any new convention.

### Conventions used by every API task

- **Auth gate:** mutating/reading handlers call `getAuthContext()` (from
  `lib/auth.ts`) and return `401` when null. All workspace‑scoped queries filter
  by `auth.workspace.id` — never trust an ID from the client without an ownership
  check (defense against IDOR).
- **Validation:** request bodies are parsed with **Zod** (already a dep);
  invalid input → `422` with `{ error, issues }`.
- **Shape:** handlers return `Response.json(...)`; errors use a shared
  `lib/api/respond.ts` helper (`ok`, `badRequest`, `unauthorized`, `notFound`,
  `serverError`). All list endpoints return `{ data: [...] }`.
- **DTO mapping:** the prototype types in `lib/types.ts` (`Agent`, `ActItem`,
  `PerfItem`, …) are presentation shapes; DB rows are normalized. A mapper layer
  (`lib/api/serialize.ts`) converts DB rows → these UI shapes so the existing
  components render unchanged.

---

## Epic A — Infra / Foundation  ✅ DONE

Already in the repo; listed for completeness and so later tasks can declare deps.

- [x] **A1** Drizzle schema — 18 tables + enums.
  Files: `lib/db/schema.ts`. UC: all.
- [x] **A2** Initial migration generated & applied.
  Files: `lib/db/migrations/0000_faithful_nova.sql`, `lib/db/migrations/meta/*`. UC: all.
- [x] **A3** Postgres client (pgbouncer‑safe URL parsing, HMR‑safe singleton).
  Files: `lib/db/index.ts`. UC: all.
- [x] **A4** Auth crypto + session helpers (scrypt, SHA‑256 token, cookie).
  Files: `lib/auth.ts`. Deps: A3. UC: US1, US2.
- [x] **A5** Env template + drizzle config.
  Files: `.env.example`, `drizzle.config.ts`, `package.json` scripts (`db:*`). UC: all.

- [ ] **A6** **Seed script** for reference + demo data. Seeds the 8 `agent_roles`
  (prospector/salesmkt/admin/hr/support/legal/content/opc — names/hues/mono/default
  engine/instructions/rules from `lib/data.ts` `rolesData`/`landingRoles`) and the
  3 `plans` (associate $49/5k, professional $149/25k, director $399/100k). Idempotent
  (`onConflictDoNothing`). Optional `--demo` flag seeds a demo workspace + the four
  prototype agents (nova/atlas/mei/juno) so the dashboard has data without hiring.
  Files: `lib/db/seed.ts` (referenced by existing `db:seed` script). Deps: A1–A3. UC: US3, US4, US9.

- [ ] **A7** **Env loader / config module** with typed access + fail‑fast on missing
  required vars (`DATABASE_URL`, `SESSION_*`, `AGENT_MANAGER_*`, `NEXT_PUBLIC_APP_URL`).
  Files: `lib/env.ts`. Deps: A5. UC: all.

---

## Epic B — Authentication (US1, US2)

- [ ] **B1** Shared API response helpers + error envelope.
  Files: `lib/api/respond.ts`. Deps: A. UC: all.
- [ ] **B2** Zod auth schemas (signup: email/password/name; login: email/password).
  Files: `lib/api/schemas/auth.ts`. Deps: B1. UC: US1, US2.
- [ ] **B3** **POST `/api/auth/signup`** — create user (`hashPassword`), create their
  personal workspace + `workspace_members` (role `owner`), set `users.locale` from
  the posted/Accept‑Language locale, then `createSession`. Returns the user + workspace.
  Rejects duplicate email (unique index `users_email_uniq`) → `409`.
  Files: `app/api/auth/signup/route.ts`. Deps: A4, A6, B2. UC: **US1**.
- [ ] **B4** **POST `/api/auth/login`** — `verifyPassword`, `createSession`. Generic
  error on bad creds (no user‑enumeration).
  Files: `app/api/auth/login/route.ts`. Deps: A4, B2. UC: **US2**.
- [ ] **B5** **POST `/api/auth/logout`** — `destroySession`, clears cookie.
  Files: `app/api/auth/logout/route.ts`. Deps: A4. UC: **US2**.
- [ ] **B6** **GET `/api/auth/me`** — current user + workspace (from `getAuthContext`)
  or `401`. Used by the client to hydrate session state.
  Files: `app/api/auth/me/route.ts`. Deps: A4. UC: **US2**.
- [ ] **B7** **Route protection** for the dashboard. A server check in
  `app/dashboard/layout.tsx` (convert to a Server Component shell that reads
  `getAuthContext()` and `redirect("/auth")` when null), with the existing client
  chrome extracted into a child client component.
  Files: `app/dashboard/layout.tsx`, `app/dashboard/DashboardChrome.tsx` (new). Deps: A4. UC: **US2**.

---

## Epic C — Agent Manager client + mock + webhooks (US3, US5, US6, US8)

The Agent Manager is external. We talk to it over HTTP and it calls us back via
signed webhooks. In dev, a built‑in **mock** simulates the whole lifecycle.

- [ ] **C1** **Agent Manager client interface** — `provisionAgent`, `updateAgent`
  (re‑sync instructions/rules/channels), `pauseAgent`, `resumeAgent`,
  `terminateAgent`, `sendMessage`. Defines request/response DTOs. Selects
  implementation from `AGENT_MANAGER_MODE` (`mock` | `live`).
  Files: `lib/agent-manager/index.ts`, `lib/agent-manager/types.ts`. Deps: A7. UC: US3, US5, US6, US8.
- [ ] **C2** **Live HTTP client** — `fetch` to `AGENT_MANAGER_BASE_URL` with
  `Authorization: Bearer ${AGENT_MANAGER_API_KEY}`, timeouts, retry on 5xx, typed
  errors. Maps responses to `agents.agentManagerId/vmId/vmRegion/deploymentStatus`.
  Files: `lib/agent-manager/live.ts`. Deps: C1. UC: US3, US5, US8.
- [ ] **C3** **Mock Agent Manager** — in‑process simulator. `provisionAgent`
  immediately returns ids and schedules (via timers / a tick endpoint) webhook
  callbacks that walk `provisioning → deploying → working`, emit heartbeats, seed
  a few `agent_activities`, and generate `agent_improvements`. `sendMessage` posts a
  canned agent reply back through the inbound‑message webhook after a short delay.
  Files: `lib/agent-manager/mock.ts`. Deps: C1, D1 (webhook dispatch helper). UC: US3, US6.
- [ ] **C4** **Webhook signature verify** — HMAC‑SHA256 over the raw body using
  `AGENT_MANAGER_WEBHOOK_SECRET`, constant‑time compare, timestamp/nonce replay
  guard. Shared verifier used by all webhook routes.
  Files: `lib/agent-manager/webhook.ts`. Deps: A7. UC: US3, US5, US6, US8.
- [ ] **C5** **POST `/api/webhooks/agent-manager`** — single signed entrypoint that
  dispatches by `event` type:
  - `status.changed` → update `agents.status` + `deploymentStatus`/`lastError`, set
    `provisionedAt`/`uptimeStartedAt` on first `working`.
  - `heartbeat` → update `lastHeartbeatAt`.
  - `activity.created` → insert `agent_activities`.
  - `improvement.suggested` → insert `agent_improvements` (status `pending`),
    flip agent to `needs_review` per policy.
  - `message.inbound` → upsert into `conversations`/`messages` (dedupe on
    `messages.externalId` via the unique index) and bump `conversations.lastMessageAt`.
  - `usage.reported` → insert `usage_records` + increment `agents.creditsUsed` and
    `workspaces.creditsUsed` (see Epic G).
  All writes are idempotent. Verifies signature (C4) first.
  Files: `app/api/webhooks/agent-manager/route.ts`. Deps: C4, C1. UC: **US3, US5, US6, US8, US9**.
- [ ] **C6** **Mock tick driver** — `POST /api/dev/agent-manager/tick` (dev‑only,
  guarded by `AGENT_MANAGER_MODE === "mock"`) so tests and the running app can
  advance the simulated lifecycle deterministically instead of relying on wall‑clock
  timers. Also exposes a tiny status page hook for E2E.
  Files: `app/api/dev/agent-manager/tick/route.ts`. Deps: C3, C5. UC: US3, US6.

---

## Epic D — Agents API + lifecycle (US3, US4, US5, US8)

- [ ] **D1** **Webhook self‑dispatch helper** — for `mock` mode, sign and POST events
  to our own `/api/webhooks/agent-manager` so the mock exercises the identical code
  path the live service would (no special‑casing in the webhook route).
  Files: `lib/agent-manager/dispatch.ts`. Deps: C4, C5. UC: US3, US6.
- [ ] **D2** **DTO serializers** — DB rows → prototype UI shapes (`Agent`, `ActItem`,
  `TaskItem`, `PerfItem`, `QueueItem`, `ChatMsg`) so existing components render
  unchanged. Maps status enum → display label + status color (`st`/`sc`), builds
  `chansTxt`, `up` (uptime from `uptimeStartedAt`), `credits` strings.
  Files: `lib/api/serialize.ts`. Deps: A1. UC: US4, US5.
- [ ] **D3** **Zod agent schemas** — hire payload (roleId, name, instructions, rules,
  engine, channels[], tasks[]), update payload (instructions/rules/channels/name).
  Files: `lib/api/schemas/agents.ts`. Deps: B1. UC: US3, US5.
- [ ] **D4** **POST `/api/agents/generate-brief`** — AI auto‑generate for the hire
  wizard. Given a roleId, returns `{ instructions, rules }`. Backed by role defaults
  in `agent_roles` (seeded from `lib/data.ts genTexts`) now; pluggable to a real LLM
  later. Auth‑gated.
  Files: `app/api/agents/generate-brief/route.ts`. Deps: B6, A6. UC: **US3**.
- [ ] **D5** **POST `/api/agents`** (hire / launch) — validates plan/role access for
  the workspace, inserts the `agents` row (`status: "draft"`), attaches selected
  channels (`agent_channels`), seeds initial `agent_tasks` from the wizard, creates
  a per‑seat `subscriptions` row, then calls `agentManager.provisionAgent(...)`.
  On success persists `agentManagerId/vmId/vmRegion`, flips to `provisioning`, and
  returns the serialized agent. On provider failure → `status: "error"` + `lastError`.
  Files: `app/api/agents/route.ts`. Deps: B6, C1, D2, D3, G‑seat logic (G3). UC: **US3**.
- [ ] **D6** **GET `/api/agents`** — workspace roster (serialized), including computed
  `needs_review` counts for the dashboard.
  Files: `app/api/agents/route.ts` (same file, `GET`). Deps: D2. UC: **US4**.
- [ ] **D7** **GET `/api/agents/[id]`** — single agent + tabs payload: activity,
  tasks, metrics, pending improvements, conversation summary. Ownership‑checked.
  Files: `app/api/agents/[id]/route.ts`. Deps: D2. UC: **US5**.
- [ ] **D8** **PATCH `/api/agents/[id]`** — edit name/instructions/rules/channels;
  persists, then `agentManager.updateAgent(...)` to re‑sync the runtime. Re‑computes
  `agent_channels`.
  Files: `app/api/agents/[id]/route.ts` (`PATCH`). Deps: C1, D3. UC: **US5**.
- [ ] **D9** **Lifecycle endpoint** **POST `/api/agents/[id]/lifecycle`** with
  `{ action: "pause" | "resume" | "terminate" }` — calls the matching Agent Manager
  method, updates status (`paused` / `working` / `terminated`), records an
  `agent_activities` row, and (on terminate) cancels the seat subscription.
  Files: `app/api/agents/[id]/lifecycle/route.ts`. Deps: C1, G3. UC: **US8**.
- [ ] **D10** **Improvements review** **POST `/api/agents/[id]/improvements/[impId]`**
  with `{ decision: "approve" | "dismiss" }` — updates `agent_improvements.status` +
  `resolvedAt`; on approve, folds the suggestion into instructions and re‑syncs
  (reuses D8). Clears `needs_review` when the queue empties.
  Files: `app/api/agents/[id]/improvements/[impId]/route.ts`. Deps: D8. UC: **US5**.
- [ ] **D11** **Tasks API** — `GET`/`POST` `/api/agents/[id]/tasks` and
  `PATCH /api/agents/[id]/tasks/[taskId]` (status transitions queued→in_progress→done).
  Files: `app/api/agents/[id]/tasks/route.ts`, `app/api/agents/[id]/tasks/[taskId]/route.ts`. Deps: D7. UC: US5.

---

## Epic E — Chat / messages (US6)

- [ ] **E1** **Zod message schema** + conversation resolver (find‑or‑create the web
  conversation for an agent in this workspace).
  Files: `lib/api/schemas/messages.ts`, `lib/api/conversations.ts`. Deps: B1. UC: US6.
- [ ] **E2** **GET `/api/agents/[id]/conversation`** — the web conversation +
  full message history (ordered), serialized to `ChatMsg[]`.
  Files: `app/api/agents/[id]/conversation/route.ts`. Deps: E1, D2. UC: **US6**.
- [ ] **E3** **POST `/api/agents/[id]/messages`** — persist the user `message`
  (`sender: "user"`, `channelType: "web"`, `status: "sent"`), relay via
  `agentManager.sendMessage(...)`. The agent reply arrives asynchronously through the
  `message.inbound` webhook (C5) and is deduped by `externalId`.
  Files: `app/api/agents/[id]/messages/route.ts`. Deps: C1, E1. UC: **US6**.
- [ ] **E4** **Reply delivery to the client** — short‑poll `GET /api/agents/[id]/conversation?after=<msgId>`
  (cursor) so the chat UI can fetch the webhook‑delivered reply. (SSE/streaming is a
  later optional upgrade; polling keeps the prototype chat working with minimal change.)
  Files: `app/api/agents/[id]/conversation/route.ts` (cursor support). Deps: E2, C5. UC: **US6**.

---

## Epic F — Channels (US7)

- [ ] **F1** **Secret encryption util** — AES‑256‑GCM encrypt/decrypt for channel
  `config` secret fields, keyed from `SESSION_SECRET`/dedicated key. Stored values in
  `channels.config` are ciphertext; never returned in plaintext to the client (masked).
  Files: `lib/crypto/secrets.ts`. Deps: A7. UC: **US7**.
- [ ] **F2** **Channel schemas** — per‑type field definitions (telegram/whatsapp/
  wechat/line/slack/email/web) mirroring `lib/data.ts channelDefs`; validation +
  which fields are secret.
  Files: `lib/api/schemas/channels.ts`. Deps: B1. UC: US7.
- [ ] **F3** **GET `/api/channels`** — workspace channels with status + masked config.
  Files: `app/api/channels/route.ts`. Deps: F1, F2. UC: **US7**.
- [ ] **F4** **POST/PATCH `/api/channels`** — connect/configure a channel (upsert on
  the `channels_workspace_type_uniq` index), encrypt secrets (F1), set status
  `connected`/`pending`/`error`. Web channel auto‑exists per workspace.
  Files: `app/api/channels/route.ts`. Deps: F1, F2. UC: **US7**.
- [ ] **F5** **Attach/detach channels to an agent** — handled via D8 (agent PATCH
  rewrites `agent_channels`); add `GET /api/agents/[id]/channels` for the detail view.
  Files: `app/api/agents/[id]/channels/route.ts`. Deps: D8, F3. UC: **US7**.

---

## Epic G — Billing / usage (US9)

- [ ] **G1** **Plans/usage serializers** — DB → prototype billing shapes
  (`BillDataset`, `PlanRow`, invoice rows) used by the billing page; compute
  credits used vs included, per‑agent breakdown, period bars.
  Files: `lib/api/serialize.ts` (billing section), `lib/api/billing.ts`. Deps: A1. UC: US9.
- [ ] **G2** **GET `/api/billing`** — workspace plan(s), credits included/used,
  per‑agent usage (from `usage_records`), invoices, and plan catalog. Supports a
  `?range=cycle|last|d90|custom&from=&to=` query for the range tabs.
  Files: `app/api/billing/route.ts`. Deps: G1. UC: **US9**.
- [ ] **G3** **Seat / credit roll‑up service** — creating an agent adds a seat
  `subscriptions` row and rolls the plan's `includedCredits` into
  `workspaces.creditsIncluded`; terminating removes it. Used by D5/D9.
  Files: `lib/api/billing.ts`. Deps: A6. UC: **US9**.
- [ ] **G4** **Usage ledger writer** — single helper that records a `usage_records`
  row and increments `agents.creditsUsed` + `workspaces.creditsUsed` in one tx.
  Called by the `usage.reported` webhook (C5) and by message/task handlers.
  Files: `lib/api/billing.ts`. Deps: A1. UC: **US9**.
- [ ] **G5** **POST `/api/billing/checkout`** — pick plan + cycle (monthly/annual),
  choose provider (`stripe` global / `alipay` China by region). Creates a checkout
  intent (Stripe PaymentIntent / Alipay order) and returns client params. Behind a
  `BILLING_MODE=mock|live` switch so the prototype payment screen works without keys.
  Files: `app/api/billing/checkout/route.ts`, `lib/payments/index.ts`,
  `lib/payments/stripe.ts`, `lib/payments/alipay.ts`. Deps: G3. UC: **US9**.
- [ ] **G6** **POST `/api/webhooks/stripe`** and **POST `/api/webhooks/alipay`** —
  verify provider signature, mark `invoices.status = paid` + `subscriptions.status`,
  activate the seat/credits.
  Files: `app/api/webhooks/stripe/route.ts`, `app/api/webhooks/alipay/route.ts`. Deps: G5. UC: **US9**.

---

## Epic H — Frontend wiring per page

Goal: keep the existing UI; replace static `lib/data.ts` reads and faked
`router.push` effects with real API calls. Introduce a tiny typed fetch client
and a session store; convert each route's data dependency to its endpoint.

- [ ] **H0** **Client API + session foundation.** A typed `apiFetch` wrapper
  (credentials: include, JSON, error envelope) and a rework of `lib/store.tsx` so
  `createdAgent`/`agents`/`paused` come from the API (`/api/auth/me`, `/api/agents`)
  instead of `agentsData`; keep `lang`/`theme` behavior. Add SWR‑style fetch hooks
  (no new dep required — a small `useResource` hook).
  Files: `lib/api/client.ts`, `lib/store.tsx`, `lib/hooks/useResource.ts`. Deps: B6, D6. UC: US2, US4.
- [ ] **H1** **Landing** (`/`). Mostly static; wire the two CTAs to `/auth` and
  `/dashboard/fleet/<demo>` correctly, and ensure "Hire" deep‑links carry `?role=`.
  Keep `landingRoles`/`heroFeed` static (marketing copy).
  Files: `app/page.tsx`. Deps: H0. UC: US3 (entry).
- [ ] **H2** **Auth** (`/auth`). Replace `doAuth` `router.push` with real calls:
  signup → `POST /api/auth/signup`, login → `POST /api/auth/login`, then `router.push("/dashboard")`.
  Wire the "forgot" path to a stubbed `POST /api/auth/forgot` (sends nothing in mock).
  Surface field/credential errors inline. Persist locale on signup.
  Files: `app/auth/page.tsx`. Deps: B3, B4, H0. UC: **US1, US2**.
- [ ] **H3** **Hire wizard** (`/hire`). Replace the local `setCreatedAgent` mock with:
  step‑2 "AI auto‑generate" → `POST /api/agents/generate-brief`; review→launch →
  `POST /api/agents`; on success route to `/dashboard/fleet/<newId>` and let the
  status poll show `provisioning → deploying → working`. Roles list from
  `GET /api/agent-roles` (or seeded `lib/data.ts` for now). Channels list from `GET /api/channels`.
  Files: `app/hire/page.tsx`. Deps: D4, D5, C6, H0. UC: **US3**.
- [ ] **H4** **Dashboard overview** (`/dashboard`). Roster, live activity feed,
  credit usage, items needing review all from `GET /api/agents` + `GET /api/billing`.
  Replace static aggregates.
  Files: `app/dashboard/page.tsx`. Deps: D6, G2, H0. UC: **US4**.
- [ ] **H5** **Fleet grid** (`/dashboard/fleet`). Cards from `GET /api/agents`;
  the pause toggle calls `POST /api/agents/[id]/lifecycle` (action pause/resume)
  instead of client‑only `togglePause`, with optimistic UI + revert on error.
  Files: `app/dashboard/fleet/page.tsx`. Deps: D6, D9, H0. UC: **US4, US8**.
- [ ] **H6** **Fleet detail** (`/dashboard/fleet/[id]`). Tabs wired to endpoints:
  - Activity → `GET /api/agents/[id]` (activities).
  - Tasks → D11.
  - Chat → `GET /api/agents/[id]/conversation` + `POST .../messages` + cursor poll
    for the webhook reply (replaces the hardcoded `REPLIES` map).
  - Performance → metrics from `GET /api/agents/[id]`.
  - Settings → `PATCH /api/agents/[id]` (instructions/rules/channels), pause/resume/
    terminate via D9, and approve/dismiss improvements via D10.
  Status badge reflects real `status` and live polling during provisioning.
  Files: `app/dashboard/fleet/[id]/page.tsx`. Deps: D7, D8, D9, D10, D11, E2, E3, E4, H0. UC: **US5, US6, US8**.
- [ ] **H7** **Channels** (`/dashboard/channels`). List + connect from `GET/POST/PATCH
  /api/channels`; replace `chanSaved` local state with real status; show masked secrets.
  Files: `app/dashboard/channels/page.tsx`. Deps: F3, F4, H0. UC: **US7**.
- [ ] **H8** **Billing & usage** (`/dashboard/billing`). Datasets from `GET /api/billing`
  keyed by the range tabs (cycle/last/d90/custom) replacing `getBillDatasets`;
  invoices + per‑agent rows from the API; "change plan" routes to `/payment`.
  Files: `app/dashboard/billing/page.tsx`. Deps: G2, H0. UC: **US9**.
- [ ] **H9** **Payment** (`/payment`). Region/cycle/provider selection posts to
  `POST /api/billing/checkout`; on confirm, drive Stripe (global) / Alipay (CN)
  mock flow to `done`, then route back to billing. Region default from `lang`.
  Files: `app/payment/page.tsx`. Deps: G5, G6, H0. UC: **US9**.

---

## Epic I — Internationalization & preferences (US10)

- [ ] **I1** **Expand the dictionary** beyond landing/nav copy to cover dashboard,
  hire, fleet, channels, billing, payment, auth in en/zh/zht. Keep `detectLang`.
  Files: `lib/i18n.ts` (grow `Dict` + add namespaces). Deps: none. UC: **US10**.
- [ ] **I2** **Persist language + theme to the user profile.** `lang`/`theme` changes
  call **PATCH `/api/me/preferences`** (writes `users.locale`; theme stored in a
  cookie/profile field). On load, `getAuthContext` seeds initial `lang`/`theme` so
  SSR matches and there's no flash. Reconcile with the existing `localStorage`/
  pre‑paint theme script in `app/layout.tsx`.
  Files: `app/api/me/preferences/route.ts`, `lib/store.tsx`, `app/layout.tsx`. Deps: B6, H0. UC: **US10**.
- [ ] **I3** **Region/domain awareness** — surface arkagent.ai vs iagent.cc and the
  Stripe‑vs‑Alipay default from locale/host (used by H9). Center the mapping in one
  helper.
  Files: `lib/i18n.ts` or `lib/region.ts`. Deps: I1. UC: US10, US9.

---

## Epic J — Tests (Playwright E2E + API)

- [ ] **J1** **Test harness setup** — install `@playwright/test` + `vitest` (or node
  test runner) and config; add `test`, `test:e2e`, `test:api` scripts; a test DB
  bootstrap (migrate + seed) and `AGENT_MANAGER_MODE=mock`, `BILLING_MODE=mock` env.
  Files: `playwright.config.ts`, `vitest.config.ts`, `tests/setup/*`, `package.json`. Deps: A6, C3. UC: all.
- [ ] **J2** **API integration tests** for every route handler — auth (signup/login/
  logout/me), agents CRUD + lifecycle, webhook signature verify + idempotency
  (replay a `message.inbound` twice → one row), channels (secret masking), billing
  roll‑up, generate‑brief. Use the mock Agent Manager + `tick` endpoint.
  Files: `tests/api/**/*.test.ts`. Deps: B–G complete, C6. UC: all.
- [ ] **J3** **E2E: US1+US2** — sign up → land on dashboard → log out → log back in →
  session persists across reload.
  Files: `tests/e2e/auth.spec.ts`. Deps: H2, B7. UC: **US1, US2**.
- [ ] **J4** **E2E: US3** — hire wizard 4 steps, AI auto‑generate, launch, watch
  status go `provisioning → deploying → working` (driven by `tick`).
  Files: `tests/e2e/hire.spec.ts`. Deps: H3, C6. UC: **US3**.
- [ ] **J5** **E2E: US4+US5+US8** — dashboard roster/activity/review counts; open an
  agent; approve a self‑review suggestion; edit instructions; pause/resume/terminate.
  Files: `tests/e2e/manage.spec.ts`. Deps: H4, H5, H6. UC: **US4, US5, US8**.
- [ ] **J6** **E2E: US6** — chat: send a message, the webhook reply appears, history
  persists across reload.
  Files: `tests/e2e/chat.spec.ts`. Deps: H6, E3, E4, C6. UC: **US6**.
- [ ] **J7** **E2E: US7** — connect Telegram + WhatsApp, attach to an agent, confirm
  secrets are masked on reload.
  Files: `tests/e2e/channels.spec.ts`. Deps: H7. UC: **US7**.
- [ ] **J8** **E2E: US9** — billing page shows credits used/included + invoices; pick
  plan + cycle; complete a mock Stripe and a mock Alipay payment.
  Files: `tests/e2e/billing.spec.ts`. Deps: H8, H9. UC: **US9**.
- [ ] **J9** **E2E: US10** — switch en/zh/zht and light/dark; reload → preference
  persisted (cookie/profile).
  Files: `tests/e2e/i18n.spec.ts`. Deps: I2. UC: **US10**.

---

## Epic K — Build / CI / Deploy

- [ ] **K1** **Typecheck + lint gate** — `tsc --noEmit` + `eslint` clean across the
  new API/serializer/test code; fix any React 19 / Next 16 type issues.
  Files: `package.json` (`typecheck` script), `eslint.config.mjs`. Deps: B–J. UC: all.
- [ ] **K2** **`next build` passes** — confirm all new dynamic Route Handlers don't
  trip static prerendering (they read cookies/DB → inherently dynamic); guard
  dev‑only routes (`/api/dev/**`) behind `AGENT_MANAGER_MODE`/`NODE_ENV`.
  Files: build verification; `app/api/dev/**`. Deps: K1. UC: all.
- [ ] **K3** **Migration + seed in deploy pipeline** — run `db:migrate` then a
  reference‑only `db:seed` on deploy (no `--demo` in prod). Document `DIRECT_DATABASE_URL`
  usage for migrations vs pooled `DATABASE_URL` at runtime.
  Files: deploy docs/scripts, `package.json`. Deps: A2, A6. UC: all.
- [ ] **K4** **CI workflow** — GitHub Actions: install, typecheck, lint, API tests,
  Playwright E2E against a built app + test Postgres service, all in mock mode.
  Files: `.github/workflows/ci.yml`. Deps: J1–J9, K1, K2. UC: all.
- [ ] **K5** **Vercel deploy config** — env vars in Vercel (DB, `SESSION_*`,
  `AGENT_MANAGER_*` set to `live` + real URL/keys/secret, `BILLING_*`,
  `NEXT_PUBLIC_APP_URL`), confirm `vercel.json` framework preset, webhook URLs
  registered with the Agent Manager + Stripe/Alipay.
  Files: `vercel.json`, deploy docs, `.env.example` (kept in sync). Deps: K2, K3. UC: all.

---

## Dependency summary (critical path)

```
A (done) → B (auth) → C (agent‑mgr client/mock/webhooks) → D (agents+lifecycle)
                                   ↘ E (chat) ↘ F (channels) ↘ G (billing)
                          → H0 (client/store) → H1‑H9 (page wiring)
                          → I (i18n/prefs) → J (tests) → K (CI/deploy)
```

## US → primary tasks traceability

| US  | Title | Primary tasks |
| --- | --- | --- |
| US1 | Sign up & workspace creation | B3, H2, J3 |
| US2 | Sign in / out / session | B4, B5, B6, B7, H0, H2, J3 |
| US3 | Hire an agent | D4, D5, C3, C5, C6, H3, J4 |
| US4 | Dashboard overview | D6, D2, H4, H5, J5 |
| US5 | Manage an agent | D7, D8, D10, D11, H6, J5 |
| US6 | Chat with an agent | E1–E4, C5, H6, J6 |
| US7 | Connect & manage channels | F1–F5, H7, J7 |
| US8 | Agent lifecycle control | D9, C5, H5, H6, J5 |
| US9 | Billing & usage | G1–G6, H8, H9, J8 |
| US10| Localization & preferences | I1–I3, J9 |
