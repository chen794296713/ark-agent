# ArkAgent — Use Cases

Implementation-grade use cases for ArkAgent (`arkagent.ai` global / `iagent.cc` China). Each use case follows a fixed template and is cross-referenced to one of the ten canonical user stories (US1–US10) so coverage is auditable.

## Conventions

- **Agent Manager (AM)** — the external backend service that creates VMs, installs/deploys the OpenClaw or Hermes engine, manages & monitors the agent runtime, and brokers agent↔channel messaging. ArkAgent calls the AM HTTP API; the AM calls back via **signed webhooks** (`X-AM-Signature`, HMAC over the raw body). In dev a built-in **MOCK Agent Manager** simulates the lifecycle.
- **Shared agent fields** synced from the AM: `agent_manager_id`, `vm_id`, `vm_region`, `deployment_status`, `last_heartbeat_at`, `provisioned_at`.
- **Agent statuses:** `draft`, `provisioning`, `deploying`, `working`, `scheduled`, `needs_review`, `paused`, `error`, `terminated`.
- **Auth:** custom email + HTTP-only session-cookie (scrypt hashing; `sessions` stores only the SHA-256 of the token).
- **Persistence:** Postgres via Drizzle; all writes are scoped to the caller's `workspace_id` derived from the session.
- **Webhook idempotency:** every inbound AM webhook carries an `event_id`; handlers are idempotent and de-duplicate on it.

## Coverage Matrix

| User story | Use cases |
|---|---|
| US1 Sign up & workspace creation | UC-1, UC-2, UC-3 |
| US2 Sign in / sign out / session | UC-4, UC-5, UC-6, UC-7 |
| US3 Hire an agent | UC-8, UC-9, UC-10, UC-11, UC-12 |
| US4 Dashboard overview | UC-13, UC-14, UC-15, UC-16 |
| US5 Manage an agent | UC-17, UC-18, UC-19, UC-20, UC-21 |
| US6 Chat with an agent | UC-22, UC-23, UC-24, UC-25 |
| US7 Connect & manage channels | UC-26, UC-27, UC-28, UC-29 |
| US8 Agent lifecycle control | UC-30, UC-31, UC-32, UC-33 |
| US9 Billing & usage | UC-34, UC-35, UC-36, UC-37, UC-38 |
| US10 Localization & preferences | UC-39, UC-40, UC-41, UC-42 |

Total: 42 use cases.

---

## US1 — Sign up & workspace creation

### UC-1 — Register a new account and bootstrap a workspace
- **Linked user story:** US1
- **Actor(s):** Prospective user (unauthenticated)
- **Preconditions:** No session cookie; the email is not already registered.
- **Main success scenario:**
  1. User opens `/auth`, selects **Sign up**, and submits name, email, password.
  2. ArkAgent validates the email format and password policy (length/complexity) server-side in the `POST /api/auth/register` route handler.
  3. System confirms no `users` row exists for the normalized (lower-cased, trimmed) email.
  4. System hashes the password with scrypt (per-user random salt) and inserts a `users` row.
  5. System creates a personal `workspaces` row (default name `"<Name>'s Workspace"`, region inferred from domain: `arkagent.ai`→global, `iagent.cc`→China) and a `workspace_members` row linking the user as `owner`.
  6. System creates a session: generates a random token, stores its SHA-256 in `sessions`, and sets an HTTP-only, `SameSite=Lax`, `Secure` cookie.
  7. System seeds the workspace context (8 `agent_roles` are global seed data; `plans` are global) and redirects to `/dashboard`, which shows the empty roster with a "Hire your first agent" call to action.
- **Alternate / exception flows:**
  - **3a. Email already registered:** return a generic 409 ("account may already exist") without confirming existence; offer a link to sign in. No rows written.
  - **2a. Weak/invalid password or malformed email:** return 422 with field-level errors; no rows written.
  - **5a. Workspace insert fails:** the whole registration runs in a transaction; on failure roll back the `users` insert and return 500.
  - **1a. User is already authenticated (valid cookie):** redirect to `/dashboard`; skip registration.
- **Postconditions:** A `users` row, a personal `workspaces` row, an owner `workspace_members` row, and an active `sessions` row exist; the user is authenticated and viewing their dashboard.

### UC-2 — Reject duplicate or invalid registration input
- **Linked user story:** US1
- **Actor(s):** Prospective user
- **Preconditions:** User is on the sign-up form.
- **Main success scenario:**
  1. User submits the sign-up form.
  2. System runs synchronous validation (presence, email shape, password rules) and returns the first failing constraint.
  3. The `/auth` UI renders inline errors in the active language (en/zh/zht) and preserves entered values except the password.
- **Alternate / exception flows:**
  - **2a. Disposable/blocked email domain (if policy enabled):** return 422 with a domain-not-allowed message.
  - **2b. Rate limit exceeded (many attempts from one IP):** return 429; UI shows a "try again later" notice.
- **Postconditions:** No account is created; the user can correct input and resubmit.

### UC-3 — Default plan assignment on workspace creation
- **Linked user story:** US1 (supports US9)
- **Actor(s):** System (on behalf of new user)
- **Preconditions:** A new workspace was just created (UC-1).
- **Main success scenario:**
  1. On workspace creation the system attaches a free/trial posture: no active paid `subscriptions` row, credit balance `0`, and the workspace is flagged `requires_plan_before_launch`.
  2. The dashboard surfaces a banner prompting plan selection (deep-links to billing, US9) before an agent can be launched to `working`.
- **Alternate / exception flows:**
  - **1a. Promo/seed credits enabled:** insert an initial `usage_records` credit grant and clear `requires_plan_before_launch`.
- **Postconditions:** Workspace exists with a known billing posture; agent launch is gated on plan/credits.

---

## US2 — Sign in / sign out / session

### UC-4 — Sign in with email and password
- **Linked user story:** US2
- **Actor(s):** Returning user (unauthenticated)
- **Preconditions:** A `users` row exists for the email; no valid session cookie.
- **Main success scenario:**
  1. User submits email + password to `POST /api/auth/login`.
  2. System loads the `users` row by normalized email and verifies the password with scrypt in constant time.
  3. On match, system mints a session token, stores its SHA-256 in `sessions` with an expiry, and sets the HTTP-only cookie.
  4. System resolves the user's primary `workspace_members` row and redirects to `/dashboard`.
- **Alternate / exception flows:**
  - **2a. Unknown email or wrong password:** return a single generic 401 ("invalid email or password") for both cases; do not reveal which failed.
  - **2b. Repeated failures:** apply throttling/lockout (429) keyed on email+IP.
  - **3a. User belongs to multiple workspaces:** select the last-active workspace (stored on the user profile) or the first by membership order.
- **Postconditions:** A valid `sessions` row and cookie exist; the user is authenticated.

### UC-5 — Maintain an authenticated session across requests
- **Linked user story:** US2
- **Actor(s):** Authenticated user
- **Preconditions:** A valid session cookie is present.
- **Main success scenario:**
  1. On each request the server reads the cookie, hashes the token (SHA-256), and looks it up in `sessions`.
  2. System checks the expiry and (optionally) rolls a sliding expiry forward.
  3. System attaches `user_id` + `workspace_id` to the request context; all data queries are scoped to that workspace.
- **Alternate / exception flows:**
  - **2a. Session expired:** delete/ignore the row, clear the cookie, and treat the request as unauthenticated (see UC-7).
  - **1a. No cookie / unknown token hash:** treat as unauthenticated; protected routes redirect to `/auth`.
- **Postconditions:** Request is served with the correct identity and workspace scope, or rejected as unauthenticated.

### UC-6 — Sign out
- **Linked user story:** US2
- **Actor(s):** Authenticated user
- **Preconditions:** Valid session.
- **Main success scenario:**
  1. User clicks **Sign out**, firing `POST /api/auth/logout`.
  2. System deletes the matching `sessions` row (by token hash) and clears the cookie (`Max-Age=0`).
  3. System redirects to the landing page (`/`).
- **Alternate / exception flows:**
  - **2a. Session already gone:** treat as success (idempotent); still clear the cookie.
  - **2b. Sign out everywhere (if offered):** delete all `sessions` rows for the user, not just the current token.
- **Postconditions:** No valid session cookie; protected routes require re-authentication.

### UC-7 — Handle expired or revoked session mid-use
- **Linked user story:** US2
- **Actor(s):** Authenticated user whose session lapses
- **Preconditions:** User has the app open; the session expires or is revoked server-side.
- **Main success scenario:**
  1. A client request (page nav or API/fetch, e.g. opening an agent or sending a chat) carries a now-invalid cookie.
  2. Server returns 401 for API calls / redirect for navigations.
  3. The client routes the user to `/auth` with a "session expired, please sign in again" notice and preserves the intended destination for post-login redirect.
- **Alternate / exception flows:**
  - **2a. In-flight write (e.g. saving agent settings) when session expires:** the write is rejected with 401 and not persisted; the UI keeps unsaved edits and re-prompts after re-login.
- **Postconditions:** The user re-authenticates and is returned to their intended destination; no partial writes were applied under an invalid session.

---

## US3 — Hire an agent

### UC-8 — Complete the 4-step hire wizard and launch an agent
- **Linked user story:** US3
- **Actor(s):** Authenticated user; Agent Manager
- **Preconditions:** User is signed in; workspace has a plan/credits (UC-3 gate satisfied); at least the chosen channels are connectable (US7).
- **Main success scenario:**
  1. User opens `/hire`. **Step 1 – Role:** picks one of the 8 seeded `agent_roles` (e.g. Sales Prospector, Customer Support, OPC Operator).
  2. **Step 2 – Job brief:** writes `instructions` and `rules` (free text). The wizard validates non-empty instructions.
  3. **Step 3 – Engine + channels:** chooses engine `OpenClaw` or `Hermes` and selects one or more workspace channels to attach.
  4. **Step 4 – Review & launch:** user confirms the summary and clicks **Launch**.
  5. ArkAgent creates an `agents` row (`status = draft → provisioning`), persists role/instructions/rules/engine, and creates `agent_channels` join rows for the selected channels.
  6. ArkAgent calls the AM provisioning API (`POST` create-agent) with engine, region, brief, and channel bindings.
  7. AM responds with `agent_manager_id` + accepted; ArkAgent stores it and sets `deployment_status` accordingly.
  8. AM provisions the VM and, via signed webhook, reports `provisioning → deploying`; ArkAgent updates `status`, `vm_id`, `vm_region`, `provisioned_at`.
  9. AM finishes engine deploy and webhooks `deploying → working`; ArkAgent sets `status = working`, records the first `last_heartbeat_at`, and writes an `agent_activities` "agent online" entry.
  10. UI transitions the new agent card to **WORKING** and routes the user to the agent detail page.
- **Alternate / exception flows:**
  - **4a. Validation gap (no role / empty instructions / no channel):** block **Launch** with inline guidance; remain on the failing step.
  - **6a. AM rejects the request (4xx):** keep agent as `draft`, surface the AM error, allow edit & retry; no `provisioning` transition.
  - **8a. Provision failure webhook (`error`):** set `status = error`, store the failure reason, show a retry/cancel affordance (see UC-12); no credits consumed for the failed VM.
  - **5a. Credit/plan gate fails at launch:** block launch and deep-link to billing (US9); agent remains `draft`.
  - **7a. AM accepts but no terminal webhook within SLA:** a reconciliation job re-queries the AM; if still unknown, mark `error` and notify.
- **Postconditions:** An `agents` row exists at `working` (success) or `draft`/`error` (failure) with AM shared fields populized as available; `agent_channels` reflect the selection.

### UC-9 — AI auto-generate a job brief
- **Linked user story:** US3
- **Actor(s):** Authenticated user; brief-generation service
- **Preconditions:** User is on Step 2 of `/hire` with a role selected.
- **Main success scenario:**
  1. User clicks **Auto-generate** and optionally supplies a one-line goal (e.g. "book demos for our SEA logistics ICP").
  2. System generates role-appropriate `instructions` and `rules` draft text (seeded `GenText` per role in the prototype; LLM-backed in production).
  3. UI populates both fields; the user edits freely before continuing.
- **Alternate / exception flows:**
  - **2a. Generation service unavailable:** fall back to the static per-role template; show a non-blocking notice.
  - **1a. User regenerates:** previous draft is replaced; unsaved manual edits prompt a confirm before overwrite.
- **Postconditions:** Step 2 holds editable instructions/rules; nothing is persisted until launch (UC-8).

### UC-10 — Save a hire as a draft and resume later
- **Linked user story:** US3
- **Actor(s):** Authenticated user
- **Preconditions:** User started the wizard but does not launch.
- **Main success scenario:**
  1. User exits the wizard (explicit **Save draft** or navigates away after Step ≥1).
  2. System persists an `agents` row with `status = draft` capturing whatever fields are filled.
  3. The draft appears on the dashboard roster marked **DRAFT** with a **Resume** action that reopens the wizard pre-filled.
- **Alternate / exception flows:**
  - **2a. Only role chosen, no instructions:** still allowed as a draft (launch remains gated by UC-8 validation).
  - **3a. User deletes the draft:** remove the `agents` row and any `agent_channels`; no AM call was ever made.
- **Postconditions:** A reusable `draft` agent exists; no VM/AM resources were provisioned.

### UC-11 — Choose engine and region for provisioning
- **Linked user story:** US3
- **Actor(s):** Authenticated user; Agent Manager
- **Preconditions:** User is on Step 3.
- **Main success scenario:**
  1. User selects engine `OpenClaw` or `Hermes`.
  2. System derives the target `vm_region` from workspace region/data-residency (China workspaces pin to China regions; global picks nearest, e.g. `sgp-04`).
  3. The chosen engine + region are sent to the AM in the provision call (UC-8 step 6) and later echoed back as shared fields.
- **Alternate / exception flows:**
  - **2a. Selected engine unavailable in the required region:** block selection with an explanation and offer the supported engine/region pairing.
  - **1a. China-residency workspace + global-only engine:** disallow and explain the residency constraint.
- **Postconditions:** Engine + region are fixed for this agent and used by the AM to place the VM.

### UC-12 — Retry or cancel a failed provision
- **Linked user story:** US3 (supports US8)
- **Actor(s):** Authenticated user; Agent Manager
- **Preconditions:** An agent is in `status = error` after a failed provision/deploy (UC-8 alt 8a).
- **Main success scenario:**
  1. User opens the errored agent and reads the stored failure reason.
  2. User clicks **Retry**; ArkAgent re-issues the AM provision call (idempotency key = agent id) and sets `status = provisioning`.
  3. Normal provision→deploy→working webhooks resume (as UC-8 steps 8–9).
- **Alternate / exception flows:**
  - **2a. Repeated failure:** after N retries, keep `error` and recommend changing engine/region or contacting support.
  - **1a. User cancels instead:** ArkAgent calls AM to release any partial VM, then sets the agent to `draft` (re-editable) or deletes it; ensure no orphaned `vm_id`.
- **Postconditions:** Agent is recovering (`provisioning`), reset to `draft`, or removed — with no leaked AM/VM resources.

---

## US4 — Dashboard overview

### UC-13 — View the agent roster
- **Linked user story:** US4
- **Actor(s):** Authenticated user
- **Preconditions:** Signed in; workspace may have zero or more agents.
- **Main success scenario:**
  1. User opens `/dashboard`.
  2. System loads all `agents` for the workspace with current `status`, engine, `vm_region`, channel summary, credits used, and uptime.
  3. UI renders a card per agent with a status pill (color-coded), the latest activity line, and quick actions; empty state shows the hire CTA.
- **Alternate / exception flows:**
  - **2a. Some agents in `error`/`needs_review`:** render distinct pills and sort/elevate them for attention.
  - **2b. Data load partial failure:** render available cards and a non-blocking "some data failed to load" banner with retry.
- **Postconditions:** User sees the current roster and can drill into any agent (US5).

### UC-14 — Watch the live activity feed
- **Linked user story:** US4
- **Actor(s):** Authenticated user; Agent Manager (event source)
- **Preconditions:** At least one `working`/`scheduled` agent.
- **Main success scenario:**
  1. Dashboard subscribes to the workspace activity stream (poll or push).
  2. As the AM webhooks inbound `agent_activities` (actions, summaries, escalations, learnings), ArkAgent persists them and the feed appends newest-first with role color and tag (e.g. MEETING, ESCALATED, LEARNING).
  3. User can filter the feed by agent or tag.
- **Alternate / exception flows:**
  - **2a. Duplicate webhook (`event_id` seen):** de-duplicate; feed shows the activity once.
  - **1a. No live transport:** fall back to periodic refresh.
- **Postconditions:** The feed reflects persisted `agent_activities`, consistent across reloads.

### UC-15 — Monitor credit usage at a glance
- **Linked user story:** US4 (supports US9)
- **Actor(s):** Authenticated user
- **Preconditions:** Signed in; a plan with included credits (or trial grant).
- **Main success scenario:**
  1. Dashboard reads aggregated `usage_records` to compute credits used vs included for the current cycle.
  2. UI shows a usage bar and per-agent contribution; nearing-limit triggers a warning state.
- **Alternate / exception flows:**
  - **2a. Over the included credits:** show overage state and deep-link to billing/plan upgrade (US9).
  - **1a. No plan yet:** show the plan-selection prompt (UC-3).
- **Postconditions:** User understands current consumption and any action needed.

### UC-16 — Triage items needing review
- **Linked user story:** US4 (supports US5)
- **Actor(s):** Authenticated user
- **Preconditions:** One or more agents have `needs_review` status or pending `agent_improvements`.
- **Main success scenario:**
  1. Dashboard aggregates agents in `needs_review` and the count of pending self-review `agent_improvements` across the workspace.
  2. UI renders a "Needs review" panel; clicking an item deep-links to the relevant agent tab (improvements queue or escalation).
- **Alternate / exception flows:**
  - **1a. Nothing pending:** panel collapses or shows an "all clear" state.
- **Postconditions:** User can jump straight to actionable review items (handled in US5).

---

## US5 — Manage an agent

### UC-17 — Review agent activity, tasks, and performance
- **Linked user story:** US5
- **Actor(s):** Authenticated user
- **Preconditions:** Signed in; agent belongs to the workspace.
- **Main success scenario:**
  1. User opens `/dashboard/fleet/[id]` and lands on the **Activity** tab (chronological `agent_activities`).
  2. User switches to **Tasks** (live `agent_tasks` with state: done/in-progress/queued) and **Performance** (`agent_metrics` with deltas and an insight note).
  3. Data is read scoped to the workspace and rendered with role color coding.
- **Alternate / exception flows:**
  - **2a. Agent has no metrics yet (newly launched):** show "no data yet — check back after the first cycle".
  - **1a. Agent id not in this workspace:** return 404 / not-authorized; do not leak existence.
- **Postconditions:** User has a full read-only picture across tabs; no state changed.

### UC-18 — Approve a self-review improvement suggestion
- **Linked user story:** US5
- **Actor(s):** Authenticated user; Agent Manager
- **Preconditions:** Agent has a `pending` row in `agent_improvements` (delivered via self-review webhook).
- **Main success scenario:**
  1. User opens the agent's improvements queue and reads a suggestion + expected impact (e.g. "Shorten follow-up #2 → +6% reply rate").
  2. User clicks **Approve**.
  3. ArkAgent sets the `agent_improvements` row to `approved` and pushes the change to the AM (instructs the runtime to adopt it / re-sync the brief).
  4. AM acknowledges; ArkAgent writes an `agent_activities` "improvement adopted" entry; if the agent was `needs_review` solely for this, status returns to `working`.
- **Alternate / exception flows:**
  - **3a. AM rejects/unreachable:** revert the row to `pending`, surface the error, allow retry; no activity entry written.
  - **2a. Concurrent approval (two reviewers):** second write is a no-op (already `approved`); UI reconciles.
- **Postconditions:** Suggestion is `approved` and reflected in the running agent; queue count decreases.

### UC-19 — Dismiss a self-review improvement suggestion
- **Linked user story:** US5
- **Actor(s):** Authenticated user
- **Preconditions:** A `pending` `agent_improvements` row exists.
- **Main success scenario:**
  1. User clicks **Dismiss** on a suggestion (optionally with a reason).
  2. ArkAgent sets the row to `dismissed` and informs the AM so the runtime won't re-propose it immediately.
  3. Queue count decreases; an audit note is written.
- **Alternate / exception flows:**
  - **2a. AM unreachable:** still persist `dismissed` locally and queue the AM notification for retry (dismissal is user-final).
- **Postconditions:** Suggestion is `dismissed` and excluded from the pending queue.

### UC-20 — Edit instructions, rules, or channels and re-sync to the AM
- **Linked user story:** US5
- **Actor(s):** Authenticated user; Agent Manager
- **Preconditions:** Agent exists; user is on the **Settings** tab.
- **Main success scenario:**
  1. User edits `instructions`/`rules` and/or changes attached channels, then **Save**.
  2. ArkAgent validates and persists to `agents` and updates `agent_channels`.
  3. ArkAgent calls the AM to re-sync the brief and channel bindings to the running engine.
  4. AM acknowledges; ArkAgent writes an `agent_activities` "configuration updated" entry. The agent keeps running with the new brief.
- **Alternate / exception flows:**
  - **3a. AM re-sync fails:** keep the local save but flag "pending sync"; a retry job re-pushes; surface a banner until synced.
  - **1a. Removing a channel that has open conversations:** warn the user; on confirm, detach `agent_channels` and stop relaying on that channel.
  - **7a. Session expired during save:** reject with 401, keep unsaved edits client-side (see UC-7).
- **Postconditions:** Persisted config matches the running engine (or is flagged pending-sync until reconciled).

### UC-21 — Rename or re-tag an agent
- **Linked user story:** US5
- **Actor(s):** Authenticated user
- **Preconditions:** Agent exists in workspace.
- **Main success scenario:**
  1. User edits display name/tags in **Settings** and saves.
  2. ArkAgent updates the `agents` row; if the name is AM-visible, it re-syncs (UC-20 pattern).
- **Alternate / exception flows:**
  - **2a. Duplicate name in workspace:** allow but warn, or block per policy.
- **Postconditions:** Agent metadata updated and reflected on the dashboard.

---

## US6 — Chat with an agent

### UC-22 — Send a message to an agent via web chat
- **Linked user story:** US6
- **Actor(s):** Authenticated user; Agent Manager
- **Preconditions:** Agent is `working` (or `scheduled`) and has the **Web** channel attached; a `conversations` row exists or is created on first message.
- **Main success scenario:**
  1. User types a message in the agent's chat panel and sends.
  2. ArkAgent appends a `messages` row (`direction = outbound`, `from = user`) to the `conversations` thread and renders it immediately.
  3. ArkAgent relays the message to the AM (send-message API) with conversation + agent identifiers.
  4. AM acknowledges receipt (queued for the runtime).
  5. UI shows a "delivered/typing" affordance pending the reply.
- **Alternate / exception flows:**
  - **3a. AM send fails (5xx/timeout):** mark the message **failed** with a retry control; the `messages` row records the failed delivery state.
  - **1a. Agent paused/terminated:** block sending with an explanation (resume first, US8).
  - **1b. Web channel not attached:** prompt to attach the Web channel (US7).
- **Postconditions:** The outbound `messages` row is persisted; the message is delivered to the AM or marked failed for retry.

### UC-23 — Receive an agent reply via webhook
- **Linked user story:** US6
- **Actor(s):** Agent Manager; Authenticated user (viewer)
- **Preconditions:** A prior outbound message was relayed; the AM signs callbacks.
- **Main success scenario:**
  1. The agent runtime produces a reply; the AM POSTs a signed inbound-message webhook with `conversation_id`, `event_id`, and body.
  2. ArkAgent verifies `X-AM-Signature`, de-duplicates on `event_id`, and appends a `messages` row (`direction = inbound`, `from = agent`).
  3. If the user is viewing the thread, the reply streams in live; otherwise an unread indicator appears on the dashboard.
- **Alternate / exception flows:**
  - **2a. Invalid signature:** reject 401 and log; do not persist (see UC-25).
  - **2b. Unknown `conversation_id`:** create or reject per policy; never attach to another workspace's thread.
  - **2c. Duplicate `event_id`:** ignore (idempotent); no duplicate bubble.
- **Postconditions:** The agent reply is persisted once and visible; conversation history is consistent.

### UC-24 — Load and persist full conversation history
- **Linked user story:** US6
- **Actor(s):** Authenticated user
- **Preconditions:** A `conversations` thread with prior `messages`.
- **Main success scenario:**
  1. User opens the chat panel.
  2. ArkAgent loads the thread's `messages` newest-last with pagination, showing sender, timestamp, and channel origin (e.g. "VIA TELEGRAM").
  3. Scrolling up lazy-loads older pages.
- **Alternate / exception flows:**
  - **2a. Very long thread:** windowed loading; jump-to-latest control.
  - **1a. No history:** show an empty thread with a starter prompt.
- **Postconditions:** The complete, ordered history is available and unchanged.

### UC-25 — Reject a chat callback with an invalid signature
- **Linked user story:** US6 (supports webhook security for US3/US4/US5/US8)
- **Actor(s):** Agent Manager (or an impostor)
- **Preconditions:** ArkAgent shares an HMAC secret with the AM.
- **Main success scenario:**
  1. An inbound webhook arrives.
  2. ArkAgent recomputes the HMAC over the raw body and compares (constant-time) to `X-AM-Signature`.
  3. On mismatch it returns 401 and writes a security log entry; no `messages`/`agent_activities` rows are created.
- **Alternate / exception flows:**
  - **2a. Missing signature header:** reject 400/401.
  - **2b. Stale timestamp/replay:** reject if outside the allowed clock-skew window even when the signature is well-formed.
- **Postconditions:** Only authentic AM events mutate state; spoofed/replayed events are rejected and logged.

---

## US7 — Connect & manage channels

### UC-26 — Connect a workspace channel
- **Linked user story:** US7
- **Actor(s):** Authenticated user; Agent Manager
- **Preconditions:** Signed in; channel not yet connected (Telegram/WhatsApp/WeChat/LINE/Slack/Email/Web).
- **Main success scenario:**
  1. User opens channel settings, picks a channel, and enters its required fields (e.g. bot token, API keys per the `ChannelDef` fields).
  2. ArkAgent validates the shape and **encrypts** secrets at rest, creating/updating the `channels` row (`connected = true`).
  3. ArkAgent verifies connectivity with the AM (handshake/test); on success marks the channel verified.
- **Alternate / exception flows:**
  - **2a. Missing required field:** block with field-level errors; nothing stored.
  - **3a. Invalid token / handshake fails:** keep `connected = false`, show the provider error, do not store an unusable secret as verified.
  - **3b. AM unreachable for verification:** store as `connected` but `unverified`; offer re-test.
- **Postconditions:** A `channels` row exists with encrypted secrets; verified channels are attachable to agents.

### UC-27 — Attach a channel to an agent
- **Linked user story:** US7 (supports US3/US5/US6)
- **Actor(s):** Authenticated user; Agent Manager
- **Preconditions:** Channel is connected/verified; agent exists.
- **Main success scenario:**
  1. User attaches a verified channel to an agent (during hire UC-8 or from Settings UC-20).
  2. ArkAgent creates an `agent_channels` join row and re-syncs bindings to the AM so the runtime listens on that channel.
  3. AM acknowledges; the agent card's channel summary updates (e.g. "TG · WA · Web").
- **Alternate / exception flows:**
  - **2a. Channel unverified:** block attach and prompt to verify first.
  - **2b. AM bind fails:** flag the attach as pending-sync and retry.
- **Postconditions:** `agent_channels` reflects the binding and the agent can transact on that channel.

### UC-28 — Detach or reconfigure a channel
- **Linked user story:** US7
- **Actor(s):** Authenticated user; Agent Manager
- **Preconditions:** A connected channel, possibly attached to agents.
- **Main success scenario:**
  1. User detaches a channel from an agent or edits the channel's credentials.
  2. ArkAgent removes the relevant `agent_channels` row(s) or re-encrypts updated secrets, then re-syncs to the AM.
  3. The runtime stops/updates listening accordingly.
- **Alternate / exception flows:**
  - **1a. Channel attached to multiple agents:** confirm scope (this agent vs all) before detaching.
  - **2a. Credential rotation while conversations are open:** re-verify; warn if the new token can't access existing threads.
- **Postconditions:** Channel bindings and secrets reflect the change; affected agents updated.

### UC-29 — Handle an invalid or expired channel token
- **Linked user story:** US7
- **Actor(s):** Agent Manager; Authenticated user
- **Preconditions:** A previously connected channel's token becomes invalid/expired (provider revocation).
- **Main success scenario:**
  1. The AM detects auth failure on the channel and webhooks a channel-error event.
  2. ArkAgent marks the `channels` row `connected = false`/`error`, flags affected agents, and surfaces a "reconnect channel" prompt on the dashboard.
  3. User re-enters credentials (UC-26) to restore service.
- **Alternate / exception flows:**
  - **2a. Multiple agents affected:** show the impact list; queue their channel listening as paused until reconnect.
  - **1a. Transient provider outage (not auth):** mark `degraded`, auto-retry before declaring error.
- **Postconditions:** Broken channels are clearly flagged; service resumes after reconnect with secrets re-encrypted.

---

## US8 — Agent lifecycle control

### UC-30 — Pause a running agent
- **Linked user story:** US8
- **Actor(s):** Authenticated user; Agent Manager
- **Preconditions:** Agent is `working` or `scheduled`.
- **Main success scenario:**
  1. User clicks **Pause** on the agent.
  2. ArkAgent calls the AM pause API and optimistically sets `status = paused`.
  3. AM stops scheduling/relaying for the agent and webhooks confirmation; ArkAgent writes a "paused by <user>" `agent_activities` entry.
  4. The agent stops acting and stops consuming run credits (idle VM may still incur baseline cost per plan).
- **Alternate / exception flows:**
  - **2a. AM pause fails/unreachable:** revert the optimistic status to `working`, show an error, allow retry.
  - **1a. Agent already paused:** no-op (idempotent).
- **Postconditions:** Agent is `paused`; no new actions or messages are processed.

### UC-31 — Resume a paused agent
- **Linked user story:** US8
- **Actor(s):** Authenticated user; Agent Manager
- **Preconditions:** Agent is `paused`; VM still allocated.
- **Main success scenario:**
  1. User clicks **Resume**.
  2. ArkAgent calls the AM resume API and sets `status = working` (or `scheduled` if it had a schedule).
  3. AM restarts the runtime/scheduling and resumes heartbeats; ArkAgent writes a "resumed" activity entry.
- **Alternate / exception flows:**
  - **2a. VM was reclaimed during a long pause:** AM re-provisions (`provisioning → deploying → working`); UI shows the transition.
  - **2b. AM resume fails:** keep `paused`, show error, allow retry.
- **Postconditions:** Agent is back to `working`/`scheduled` and processing again.

### UC-32 — Terminate an agent
- **Linked user story:** US8
- **Actor(s):** Authenticated user; Agent Manager
- **Preconditions:** Agent exists in any non-`terminated` state.
- **Main success scenario:**
  1. User clicks **Terminate** and confirms an explicit warning (irreversible; VM destroyed).
  2. ArkAgent calls the AM terminate API and sets `status = terminated`.
  3. AM tears down the VM, detaches channels, stops billing for run credits, and webhooks confirmation; ArkAgent clears live fields (`last_heartbeat_at`) while preserving history (`agent_activities`, `messages`, `usage_records`) for audit.
  4. The agent card moves to a terminated/archived section.
- **Alternate / exception flows:**
  - **2a. AM teardown partially fails:** keep `terminated` locally but flag "cleanup pending"; a reconciliation job confirms VM destruction to avoid leaked `vm_id`.
  - **1a. User cancels at the confirm dialog:** no change.
- **Postconditions:** Agent is `terminated`, its VM released, channels detached; historical records retained.

### UC-33 — React to an unexpected agent error or lost heartbeat
- **Linked user story:** US8 (supports US4)
- **Actor(s):** Agent Manager; System; Authenticated user
- **Preconditions:** A `working` agent stops heartbeating or the AM reports a runtime error.
- **Main success scenario:**
  1. The AM webhooks an error/health event, or ArkAgent's monitor detects `last_heartbeat_at` exceeding the threshold.
  2. ArkAgent sets `status = error`, records the reason, and surfaces it in the dashboard "needs review"/error state (US4).
  3. User chooses to retry (re-provision/restart via AM, like UC-12), pause, or terminate.
- **Alternate / exception flows:**
  - **2a. Self-healing:** AM auto-restarts and resumes heartbeats; ArkAgent returns the agent to `working` and notes the blip.
  - **1a. Flapping heartbeats:** debounce before flipping to `error` to avoid noise.
- **Postconditions:** The fault is visible and actionable; status reflects reality (`error`, recovered `working`, or user-chosen state).

---

## US9 — Billing & usage

### UC-34 — View credits used vs included and per-agent usage
- **Linked user story:** US9
- **Actor(s):** Authenticated user
- **Preconditions:** Signed in; workspace has a plan or trial.
- **Main success scenario:**
  1. User opens `/dashboard/billing`.
  2. System aggregates `usage_records` into credits used vs the plan's included credits for the cycle, plus a per-agent breakdown and trend bars.
  3. UI renders the usage meter, per-agent rows, seat roll-up, and discounts.
- **Alternate / exception flows:**
  - **2a. No usage yet:** show zeros and the included allotment.
  - **2b. Mid-cycle plan change:** prorate the included credits and reflect it in the meter.
- **Postconditions:** User sees an accurate consumption picture for the current cycle.

### UC-35 — Choose a plan and billing cycle
- **Linked user story:** US9
- **Actor(s):** Authenticated user
- **Preconditions:** Signed in; workspace owner/admin role.
- **Main success scenario:**
  1. User compares the three plans — Associate ($49 / 5k credits), Professional ($149 / 25k), Director ($399 / 100k) — and picks one plus a cycle (monthly/annual).
  2. System computes price (applying annual discount), seats, and credit allotment, then proceeds to payment (UC-36/UC-37).
- **Alternate / exception flows:**
  - **1a. Downgrade below current usage:** warn that overage may apply or that agents may be gated; require confirmation.
  - **1b. Non-owner attempts change:** block with a permission message.
- **Postconditions:** A selected plan/cycle is staged, pending successful payment.

### UC-36 — Pay via Stripe (global)
- **Linked user story:** US9
- **Actor(s):** Authenticated user (global / `arkagent.ai`); Stripe
- **Preconditions:** A plan/cycle is selected; workspace region = global.
- **Main success scenario:**
  1. System creates a Stripe checkout/subscription for the chosen plan.
  2. User completes payment on Stripe.
  3. Stripe webhook confirms success; ArkAgent inserts/updates the `subscriptions` row (active, period dates), generates an `invoices` row, and grants the cycle's included credits via a `usage_records` credit entry.
  4. The UC-3 launch gate is cleared; agents may be launched/resumed.
- **Alternate / exception flows:**
  - **2a. Payment declined:** Stripe reports failure; no `subscriptions`/credit grant; UI shows the decline reason and offers retry/another method.
  - **3a. Webhook delayed:** show "payment processing"; reconcile when the webhook lands; never double-grant credits (idempotent on Stripe event id).
  - **3b. Currency/tax handling:** apply per Stripe locale; reflected on the invoice.
- **Postconditions:** On success, an active subscription, an invoice, and a credit grant exist; on failure, no billing state changes.

### UC-37 — Pay via Alipay (China)
- **Linked user story:** US9
- **Actor(s):** Authenticated user (China / `iagent.cc`); Alipay
- **Preconditions:** A plan/cycle is selected; workspace region = China.
- **Main success scenario:**
  1. System creates an Alipay payment for the selected plan (CNY pricing).
  2. User completes payment in Alipay.
  3. Alipay async notify confirms success; ArkAgent records the `subscriptions` row, generates a (fapiao-compatible) `invoices` row, and grants included credits via `usage_records`.
  4. Launch gate cleared.
- **Alternate / exception flows:**
  - **2a. Payment declined/abandoned:** no subscription/credit grant; offer retry.
  - **3a. Async notify retried by Alipay:** idempotent on the trade number; no double grant.
  - **1a. Global-only payment method selected for a China workspace:** disallow; route to Alipay.
- **Postconditions:** On success, active subscription + invoice + credit grant; on failure, unchanged billing state.

### UC-38 — View invoices and handle overage
- **Linked user story:** US9
- **Actor(s):** Authenticated user
- **Preconditions:** At least one paid cycle (or accrued overage).
- **Main success scenario:**
  1. User opens the invoices list and downloads/views any `invoices` row.
  2. If usage exceeded included credits, the system shows the overage and the next invoice's overage line (or prompts an upgrade per plan rules).
- **Alternate / exception flows:**
  - **2a. Hard credit cap reached:** agents are gated (cannot consume run credits) until upgrade/top-up; surface a clear prompt and link to UC-35.
  - **1a. Failed renewal payment:** mark subscription `past_due`, notify, and apply a grace period before gating.
- **Postconditions:** User can audit invoices and understands/acts on overage; gating is consistent with plan and payment state.

---

## US10 — Localization & preferences

### UC-39 — Switch interface language (en/zh/zht)
- **Linked user story:** US10
- **Actor(s):** Authenticated user (or guest on landing)
- **Preconditions:** App loaded.
- **Main success scenario:**
  1. User selects a language (English / Simplified Chinese / Traditional Chinese) from the switcher.
  2. The i18n layer swaps the active dictionary and re-renders all visible strings immediately.
  3. For an authenticated user, the choice is persisted to the user profile so it follows across devices/sessions.
- **Alternate / exception flows:**
  - **2a. Missing translation key:** fall back to English for that key and log the gap; no broken UI.
  - **3a. Guest (no session):** persist only in a cookie/localStorage until they sign in, then migrate to the profile.
- **Postconditions:** UI renders in the chosen language and the preference persists for authenticated users.

### UC-40 — Switch light/dark theme
- **Linked user story:** US10
- **Actor(s):** User
- **Preconditions:** App loaded; "Terminal Lime" design system supports both themes.
- **Main success scenario:**
  1. User toggles the theme (ThemeToggle).
  2. The theme tokens swap (dark↔light) and re-render with no layout shift.
  3. For an authenticated user, the choice is persisted to the profile; for guests it persists locally.
- **Alternate / exception flows:**
  - **1a. System-preference mode:** if "auto" is offered, follow `prefers-color-scheme` until the user picks explicitly.
- **Postconditions:** Theme is applied and persisted at the appropriate scope.

### UC-41 — Persist and restore preferences on next session
- **Linked user story:** US10
- **Actor(s):** Authenticated user; System
- **Preconditions:** Language/theme previously set and saved to the profile.
- **Main success scenario:**
  1. On sign-in (UC-4) the system reads the user's saved language and theme.
  2. The app initializes with those preferences before first paint (SSR/initial render) to avoid a flash of the wrong locale/theme.
- **Alternate / exception flows:**
  - **1a. No saved preference:** derive defaults from domain/region (`iagent.cc`→zh, `arkagent.ai`→en) and system theme.
- **Postconditions:** Returning users land in their preferred language and theme automatically.

### UC-42 — Region/domain-aware defaults and content
- **Linked user story:** US10 (supports US9 payment routing)
- **Actor(s):** Visitor; System
- **Preconditions:** Visitor arrives on `arkagent.ai` (global) or `iagent.cc` (China).
- **Main success scenario:**
  1. The system detects the domain/region and sets sensible defaults: language (en vs zh), available channels (e.g. WeChat/LINE emphasis in China), and payment method (Stripe vs Alipay, see UC-36/UC-37).
  2. The user can still override language/theme manually (UC-39/UC-40).
- **Alternate / exception flows:**
  - **1a. Data-residency constraint:** China workspaces pin agent regions/engines accordingly (see UC-11); content reflects the constraint.
- **Postconditions:** Visitors get region-appropriate defaults while retaining manual control over preferences.

---

## Auditable coverage summary

- **US1:** UC-1, UC-2, UC-3
- **US2:** UC-4, UC-5, UC-6, UC-7
- **US3:** UC-8, UC-9, UC-10, UC-11, UC-12
- **US4:** UC-13, UC-14, UC-15, UC-16
- **US5:** UC-17, UC-18, UC-19, UC-20, UC-21
- **US6:** UC-22, UC-23, UC-24, UC-25
- **US7:** UC-26, UC-27, UC-28, UC-29
- **US8:** UC-30, UC-31, UC-32, UC-33
- **US9:** UC-34, UC-35, UC-36, UC-37, UC-38
- **US10:** UC-39, UC-40, UC-41, UC-42

Every user story US1–US10 is covered by at least three use cases; total = 42 (UC-1 … UC-42).
