# ArkAgent — Top 10 User Stories (US1–US10)

> Product: **ArkAgent** (`arkagent.ai` global / `iagent.cc` China) — *"Hire an AI employee, not another app."*
> Stack: Next.js 16 App Router + React 19 + TypeScript on Vercel · Postgres via Drizzle · custom session-cookie auth · i18n `en`/`zh`/`zht`.
>
> These stories are the canonical specification. Each one is written to be **testable**: the acceptance criteria below are intended to be turned 1:1 into automated tests (unit, route-handler integration, and end-to-end). Where a criterion describes externally-observed behavior it uses **Given / When / Then**.
>
> **External system — Agent Manager.** A backend service implemented outside this repo that (1) creates a VM for the OpenClaw/Hermes engine, (2) installs & deploys the engine, (3) manages & monitors the agent runtime, and (4) brokers agent↔channel communication. ArkAgent calls the Agent Manager HTTP API to provision/control agents and to send messages; the Agent Manager calls ArkAgent back via **signed webhooks** (status changes, heartbeats, inbound agent messages, activity, self-review suggestions). The agent record stores the shared fields `agent_manager_id`, `vm_id`, `vm_region`, `deployment_status`, `last_heartbeat_at`, `provisioned_at`. In dev, a built-in **MOCK Agent Manager** simulates the lifecycle so all criteria below are runnable without the real service.
>
> **Agent status machine:** `draft → provisioning → deploying → working`, plus `scheduled`, `needs_review`, `paused`, `error`, `terminated`.

## Conventions used in this document

- **Auth model:** email + scrypt-hashed password; HTTP-only session cookie; `sessions` table stores only the SHA-256 of the token. "Authenticated" below means a valid, unexpired session cookie resolves to a `users` row.
- **Tenancy:** every domain row is scoped to a `workspace`. A request is authorized only if the session user is a member (`workspace_members`) of the target workspace. Cross-workspace access **must** return `404` (not `403`) to avoid leaking existence.
- **API:** route handlers under `app/api/**`. JSON bodies. Mutations require a same-site session cookie. Webhook endpoints are unauthenticated by cookie but **require a valid Agent Manager signature**.
- **Credits:** plans = associate ($49 / 5k credits), professional ($149 / 25k), director ($399 / 100k). Usage is recorded in `usage_records` (credit ledger) and rolled up per workspace.
- **Priority scale:** P0 = launch-blocking, P1 = important for GA, P2 = fast-follow.

---

## US1 — Sign up & workspace creation

**Story.** As a **new prospective customer**, I want to **register with my email and password and automatically get a personal workspace**, so that **I have an isolated tenant ready to hire agents into without any extra setup**.

**Priority:** P0

### Acceptance criteria

1. **Given** an email not already registered, **when** the user submits a valid email + password (≥ 10 chars), **then** a `users` row is created with the password stored as a scrypt hash (never plaintext), a `workspaces` row is created, and a `workspace_members` row links the user to that workspace as `owner`.
2. **Given** a successful registration, **when** the response returns, **then** a session is established (HTTP-only, `Secure`, `SameSite=Lax` cookie) and the user is redirected to `/dashboard`.
3. **Given** an email that already exists, **when** the user submits, **then** the request fails with a `409`-class error and **no** new `users`/`workspaces`/`workspace_members` rows are created.
4. **Given** a password that fails the policy (too short / empty), **when** submitted, **then** validation fails with a field-level error and no rows are created.
5. **Given** any registration, **when** the `sessions` row is written, **then** it contains only the SHA-256 of the session token — the raw token never persists to the DB.
6. The new workspace is seeded with the 8 `agent_roles` (prospector, salesmkt, admin, hr, support, legal, content, opc) being readable, and the workspace starts on no paid plan (free/unbilled state) until US9.
7. Email is normalized (trim + lowercase) before the uniqueness check.

**Primary screens / endpoints**
- Screen: `app/auth/page.tsx` (sign-up form).
- Endpoint: `POST /api/auth/register` → creates user + workspace + membership, sets session cookie.

---

## US2 — Sign in / sign out / session

**Story.** As a **returning user**, I want to **sign in, stay signed in across visits, and sign out**, so that **I can securely access my workspace and end my session when I'm done**.

**Priority:** P0

### Acceptance criteria

1. **Given** valid credentials, **when** the user signs in, **then** a new session is created, the session cookie is set, and the user lands on `/dashboard`.
2. **Given** invalid credentials (wrong password or unknown email), **when** the user submits, **then** the response is a generic `401` with **no** disclosure of which field was wrong, and no session is created.
3. **Given** an authenticated user with a valid cookie, **when** they revisit any protected route, **then** the session resolves (cookie token → SHA-256 → `sessions` row) and access is granted without re-login.
4. **Given** an expired or unknown session token, **when** a protected route is requested, **then** the user is redirected to `/auth` and the stale cookie is cleared.
5. **Given** an authenticated user, **when** they sign out, **then** the `sessions` row is deleted (revoked) server-side and the cookie is cleared; reusing the old token afterward fails.
6. Password verification uses constant-time comparison of the scrypt hash.
7. **Given** an unauthenticated request to a protected API route, **when** received, **then** it returns `401` (no redirect for API; redirect is for page routes only).

**Primary screens / endpoints**
- Screen: `app/auth/page.tsx` (sign-in form); `components/MobileNav.tsx` / dashboard layout for the sign-out control.
- Endpoints: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session` (current-user probe).

---

## US3 — Hire an agent

**Story.** As a **workspace owner/admin**, I want to **hire an agent through a 4-step wizard (role → job brief → engine + channels → review & launch)**, so that **a configured agent is provisioned on a dedicated VM and starts working without me touching infrastructure**.

**Priority:** P0

### Acceptance criteria

1. **Step 1 — Role.** **Given** the wizard at `/hire`, **when** the user opens step 1, **then** all 8 seeded `agent_roles` are selectable and exactly one must be chosen to advance.
2. **Step 2 — Job brief.** The user must provide **instructions** and **rules**; an **"AI auto-generate"** action populates draft instructions/rules from the chosen role, and the user may edit the result before continuing. Empty instructions block advancing.
3. **Step 3 — Engine + channels.** The user picks exactly one engine — **OpenClaw** or **Hermes** — and selects one or more channels to attach. (Channels available for selection are the workspace's connected channels from US7.)
4. **Step 4 — Review & launch.** **Given** a complete config, **when** the user confirms launch, **then** ArkAgent persists an `agents` row (status `draft`→`provisioning`) with role, instructions, rules, engine, and `agent_channels` links, then calls the Agent Manager **provision** API.
5. **Given** the provision call succeeds, **when** the Agent Manager acknowledges, **then** the agent record stores `agent_manager_id`, `vm_id`, `vm_region`, `provisioned_at`, and `deployment_status`; status transitions `provisioning → deploying → working` driven by Agent Manager webhooks (US-shared status machine).
6. **Given** the provision call fails, **when** the error returns, **then** the agent moves to status `error`, the failure is surfaced in the UI, and the user can retry without re-entering the brief.
7. Each wizard step validates before allowing "next"; navigating "back" preserves prior input.
8. **Given** the dev environment, **when** launching, **then** the MOCK Agent Manager drives `provisioning → deploying → working` so the full happy path is testable offline.
9. Hiring requires authentication and workspace membership; the agent is created **in the active workspace only**.

**Primary screens / endpoints**
- Screen: `app/hire/page.tsx` (4-step wizard).
- Endpoints: `POST /api/agents` (create + kick off provisioning), `POST /api/agents/:id/brief/generate` (AI auto-generate instructions/rules), inbound `POST /api/webhooks/agent-manager` (status transitions).

---

## US4 — Dashboard overview

**Story.** As a **workspace member**, I want a **dashboard showing my agent roster, a live activity feed, credit usage, and items needing review**, so that **I can see at a glance what my AI employees are doing and what needs my attention**.

**Priority:** P0

### Acceptance criteria

1. **Given** an authenticated member, **when** they open `/dashboard`, **then** the roster lists every agent in the active workspace with name, role, engine, and current status badge (one of the status-machine values).
2. **Given** recent activity, **when** the dashboard loads, **then** the **activity feed** shows the most recent `agent_activities` for the workspace in reverse-chronological order.
3. **Given** workspace usage, **when** the dashboard loads, **then** **credit usage** shows credits used vs. included for the current cycle, rolled up from `usage_records` against the workspace's plan allowance.
4. **Given** agents with status `needs_review` and/or pending `agent_improvements`, **when** the dashboard loads, **then** a **"needs review"** section counts and links to those items (feeding US5).
5. **Given** a workspace with zero agents, **when** the dashboard loads, **then** an empty state invites the user to **Hire an agent** (links to US3 `/hire`).
6. Status badges reflect live state: an agent transitioning via webhook updates its badge without a full reload (poll or revalidate).
7. The dashboard only ever shows data for the **active workspace**; switching workspaces re-scopes all panels.

**Primary screens / endpoints**
- Screens: `app/dashboard/page.tsx`, `app/dashboard/layout.tsx`, `app/dashboard/fleet/page.tsx` (roster).
- Endpoints: `GET /api/agents` (roster), `GET /api/activities` (feed), `GET /api/usage/summary` (credits), `GET /api/improvements?status=pending` (review queue).

---

## US5 — Manage an agent

**Story.** As a **workspace owner/admin**, I want an **agent detail view with Activity, Tasks, Performance, and Settings tabs where I can approve/dismiss self-review suggestions and edit the brief/channels**, so that **I can supervise and tune an agent over time**.

**Priority:** P0

### Acceptance criteria

1. **Given** an agent in the active workspace, **when** the user opens its detail page, **then** four tabs are available: **Activity**, **Tasks**, **Performance**, **Settings**.
2. **Activity tab** lists this agent's `agent_activities` (reverse-chronological). **Tasks tab** lists `agent_tasks` with their states. **Performance tab** renders `agent_metrics` for the agent.
3. **Self-review queue.** **Given** a pending `agent_improvements` suggestion, **when** the user **approves** it, **then** it moves to `approved` and the change is applied/synced to the Agent Manager; **when** the user **dismisses** it, **then** it moves to `dismissed` and no sync occurs. Re-acting on an already-decided suggestion is rejected.
4. **Settings tab — edit brief/channels.** **Given** the user edits instructions, rules, or attached channels and saves, **when** the save succeeds, **then** the `agents` / `agent_channels` rows update **and** ArkAgent re-syncs the new config to the Agent Manager.
5. **Given** a re-sync to the Agent Manager fails, **when** the error returns, **then** the local edit is not silently lost — the UI shows the sync failure and offers retry; persisted local state and remote state are reconciled (no partial "saved but not synced" with no signal).
6. **Given** an agent with status `needs_review`, **when** all its pending suggestions are resolved, **then** the agent can return to `working` (resume path overlaps US8).
7. All detail/tab/mutation routes enforce workspace membership; a non-member request returns `404`.

**Primary screens / endpoints**
- Screen: `app/dashboard/fleet/[id]/page.tsx` (tabbed detail).
- Endpoints: `GET /api/agents/:id`, `GET /api/agents/:id/activities`, `GET /api/agents/:id/tasks`, `GET /api/agents/:id/metrics`, `PATCH /api/agents/:id` (edit brief/channels → re-sync), `POST /api/improvements/:id/approve`, `POST /api/improvements/:id/dismiss`.

---

## US6 — Chat with an agent

**Story.** As a **workspace member**, I want to **chat with an agent in the web channel and see its replies in a persistent conversation**, so that **I can interact with my AI employee directly and review the full history later**.

**Priority:** P0

### Acceptance criteria

1. **Given** an agent in `working` status, **when** the user opens its web chat, **then** the existing `conversations`/`messages` history loads in order.
2. **Given** the user sends a message, **when** submitted, **then** a `messages` row (role = user) is persisted immediately and ArkAgent relays the message to the Agent Manager for that agent.
3. **Given** the Agent Manager produces a reply, **when** the inbound webhook fires, **then** the reply is persisted as a `messages` row (role = agent) in the same `conversation` and rendered in the thread.
4. **Given** the webhook signature is invalid, **when** an inbound message arrives, **then** it is rejected (`401`) and **not** persisted.
5. **Given** a returning user, **when** they reopen the conversation, **then** the **full history persists** across sessions and reloads.
6. **Given** an agent **not** in `working` status (e.g., `paused`, `provisioning`, `error`), **when** the user tries to send, **then** sending is blocked/queued with a clear status message and no relay is attempted.
7. Sending and receiving messages records credit usage in `usage_records` attributable to the agent (feeds US4/US9).
8. Message relay and webhook handling are scoped so a message only ever lands in a conversation the sender's workspace owns.

**Primary screens / endpoints**
- Screen: agent web-chat view (within `app/dashboard/fleet/[id]/` or a dedicated chat route).
- Endpoints: `GET /api/conversations/:id/messages`, `POST /api/conversations/:id/messages` (send + relay), inbound `POST /api/webhooks/agent-manager/message` (agent reply).

---

## US7 — Connect & manage channels

**Story.** As a **workspace owner/admin**, I want to **connect and configure Telegram, WhatsApp, WeChat, LINE, Slack, and Email at the workspace level and attach them to specific agents**, so that **my agents can work in the messaging tools my team and customers already use**.

**Priority:** P1

### Acceptance criteria

1. **Given** the channels screen, **when** the user connects a channel type (Telegram / WhatsApp / WeChat / LINE / Slack / Email), **then** a `channels` row is created at the **workspace** level with its config, and its **secrets are stored encrypted at rest** (never returned to the client in plaintext).
2. **Given** a connected channel, **when** the user attaches it to an agent, **then** an `agent_channels` link is created and the agent's channel set is re-synced to the Agent Manager.
3. **Given** the user detaches a channel from an agent, **when** saved, **then** the `agent_channels` link is removed and the change is re-synced; the workspace-level `channels` row remains for reuse.
4. **Given** invalid or rejected credentials, **when** the user attempts to connect, **then** the connection is marked failed/unverified and not usable for attachment until fixed.
5. **Given** any read of channel config via the API, **when** returned, **then** secret fields are masked/omitted.
6. Channel CRUD and attachment routes enforce workspace membership; channels are never shared across workspaces.
7. Only channels in `connected`/verified state appear as attachable in the US3 hire wizard and US5 settings tab.

**Primary screens / endpoints**
- Screen: workspace channels settings (e.g., `app/dashboard/.../channels` or settings section).
- Endpoints: `GET /api/channels`, `POST /api/channels` (connect, encrypt secrets), `PATCH /api/channels/:id`, `DELETE /api/channels/:id`, `POST /api/agents/:id/channels` (attach/detach → re-sync).

---

## US8 — Agent lifecycle control

**Story.** As a **workspace owner/admin**, I want to **pause, resume, and terminate an agent**, so that **I can stop an agent's work, restart it, or permanently decommission it and its VM**.

**Priority:** P0

### Acceptance criteria

1. **Pause.** **Given** an agent in `working`, **when** the user pauses it, **then** ArkAgent calls the Agent Manager **pause** API and, on success, status becomes `paused`; while paused, the agent does not perform work or consume work-credits.
2. **Resume.** **Given** an agent in `paused`, **when** the user resumes it, **then** ArkAgent calls the Agent Manager **resume** API and, on success, status returns to `working`.
3. **Terminate.** **Given** an agent in any non-terminated state, **when** the user terminates it, **then** ArkAgent calls the Agent Manager **terminate** API; on success the agent moves to `terminated`, the VM is released, and the agent becomes read-only (history retained, no further control actions).
4. **Given** an Agent Manager control call fails, **when** the error returns, **then** the local status is **not** falsely advanced — the agent reflects the real state (or `error`) and the action can be retried.
5. **Given** a `terminated` agent, **when** the user attempts pause/resume/edit/chat, **then** those actions are rejected.
6. Lifecycle transitions are constrained to the status machine (e.g., you cannot resume a `terminated` agent; you cannot pause a `draft`/`provisioning` agent).
7. Every transition writes an `agent_activities` entry and updates `deployment_status`/`last_heartbeat_at` as reported by the Agent Manager.
8. All lifecycle endpoints enforce workspace membership.

**Primary screens / endpoints**
- Screens: `app/dashboard/fleet/page.tsx` (roster row controls), `app/dashboard/fleet/[id]/page.tsx` (Settings tab controls).
- Endpoints: `POST /api/agents/:id/pause`, `POST /api/agents/:id/resume`, `POST /api/agents/:id/terminate`, inbound `POST /api/webhooks/agent-manager` (status/heartbeat reconciliation).

---

## US9 — Billing & usage

**Story.** As a **workspace owner**, I want to **see credits used vs. included and per-agent usage, view invoices, pick a plan + billing cycle, and pay via Stripe (global) or Alipay (China)**, so that **I can manage cost and keep my agents running on the right plan**.

**Priority:** P1

### Acceptance criteria

1. **Given** the billing screen, **when** it loads, **then** it shows **credits used vs. included** for the current cycle and a **per-agent usage** breakdown, both derived from `usage_records`.
2. **Given** the three plans (associate $49/5k, professional $149/25k, director $399/100k), **when** the user selects a plan **and** a billing cycle, **then** the choice is captured and a `subscriptions` row is created/updated.
3. **Payment — global.** **Given** a global user, **when** they pay, **then** a **Stripe** checkout/payment flow runs and, on success, the subscription is activated and an `invoices` row is recorded.
4. **Payment — China.** **Given** a China (`iagent.cc`) user, **when** they pay, **then** an **Alipay** flow runs and, on success, the subscription is activated and an `invoices` row is recorded.
5. **Given** a successful payment, **when** the plan activates, **then** the workspace's **included credits** update to the plan allowance and US4's usage panel reflects the new ceiling.
6. **Given** seats in a workspace, **when** usage is computed, **then** **seats roll up to workspace credits** (per-workspace credit pool, not per-user).
7. **Given** a failed/cancelled payment, **when** it returns, **then** the previous plan/credit state is unchanged and no `invoices` row is created.
8. **Given** invoices exist, **when** the user opens the invoices view, **then** historical `invoices` are listed (date, amount, status) and individually viewable.

**Primary screens / endpoints**
- Screens: `app/dashboard/billing/page.tsx`, `app/payment/page.tsx`.
- Endpoints: `GET /api/billing/usage` (used vs included + per-agent), `GET /api/billing/invoices`, `POST /api/billing/subscription` (pick plan + cycle), `POST /api/billing/checkout` (Stripe/Alipay), inbound `POST /api/webhooks/stripe` and `POST /api/webhooks/alipay` (activation + invoice).

---

## US10 — Localization & preferences

**Story.** As a **user in any of our markets**, I want to **use the product in English, Simplified Chinese, or Traditional Chinese and switch between light/dark themes, with my choices remembered**, so that **the product feels native to me on every device and visit**.

**Priority:** P1

### Acceptance criteria

1. **Given** the locale switcher, **when** the user selects `en`, `zh`, or `zht`, **then** the UI re-renders in that language and the preference is **persisted to the user profile** (`users` row), surviving logout/login and device changes.
2. **Given** the theme toggle, **when** the user selects light or dark, **then** the "Terminal Lime" design-system tokens swap accordingly and the choice is persisted to the user profile.
3. **Given** a returning authenticated user, **when** any page first renders, **then** their saved language and theme are applied **before** first paint (no flash of the wrong locale/theme).
4. **Given** a user with no saved preference, **when** they first arrive, **then** sensible defaults apply (e.g., locale from request/`Accept-Language`, theme from system) and are then editable.
5. **Given** the China deployment (`iagent.cc`), **when** localized strings render, **then** Chinese is the natural default while all three locales remain available.
6. All user-facing strings come from the i18n catalogs for `en`/`zh`/`zht` — no hard-coded display strings; missing keys fall back to `en`.
7. Switching language/theme does not log the user out or lose in-progress wizard state.

**Primary screens / endpoints**
- Screens: `components/ThemeToggle.tsx`, language switcher in `app/layout.tsx` / `app/dashboard/layout.tsx` / `components/MobileNav.tsx`; tokens in `lib/theme.ts`.
- Endpoints: `PATCH /api/me/preferences` (persist `locale` + `theme` to the user profile), `GET /api/auth/session` (returns saved preferences for first-paint hydration).

---

## Traceability summary

| US | Title | Priority | Primary screen(s) | Key endpoint(s) |
|----|-------|----------|-------------------|-----------------|
| US1 | Sign up & workspace creation | P0 | `app/auth/page.tsx` | `POST /api/auth/register` |
| US2 | Sign in / sign out / session | P0 | `app/auth/page.tsx` | `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/session` |
| US3 | Hire an agent | P0 | `app/hire/page.tsx` | `POST /api/agents` · `POST /api/agents/:id/brief/generate` · webhook |
| US4 | Dashboard overview | P0 | `app/dashboard/page.tsx` · `fleet/page.tsx` | `GET /api/agents` · `GET /api/activities` · `GET /api/usage/summary` |
| US5 | Manage an agent | P0 | `app/dashboard/fleet/[id]/page.tsx` | `PATCH /api/agents/:id` · `POST /api/improvements/:id/{approve,dismiss}` |
| US6 | Chat with an agent | P0 | agent web-chat view | `POST /api/conversations/:id/messages` · inbound message webhook |
| US7 | Connect & manage channels | P1 | workspace channels settings | `POST /api/channels` · `POST /api/agents/:id/channels` |
| US8 | Agent lifecycle control | P0 | `fleet/page.tsx` · `fleet/[id]/page.tsx` | `POST /api/agents/:id/{pause,resume,terminate}` |
| US9 | Billing & usage | P1 | `app/dashboard/billing/page.tsx` · `app/payment/page.tsx` | `POST /api/billing/checkout` · Stripe/Alipay webhooks |
| US10 | Localization & preferences | P1 | `components/ThemeToggle.tsx` · `lib/theme.ts` | `PATCH /api/me/preferences` |
