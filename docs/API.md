# ArkAgent HTTP API Reference

ArkAgent is a Next.js 16 application backed by Postgres (via Drizzle ORM). It uses
custom email/password authentication with opaque session cookies, and integrates
with an external **Agent Manager** service that provisions and monitors remote
OpenClaw/Hermes agent VMs.

This document has two sections:

1. **[ArkAgent REST API](#1-arkagent-rest-api)** — the HTTP endpoints consumed by the
   ArkAgent website.
2. **[Agent Manager integration contract](#2-agent-manager-integration-contract)** —
   the outbound calls ArkAgent makes to the Agent Manager and the inbound webhooks it
   receives.

---

## Conventions

All endpoints live under `/api`. Routes run on the Node.js runtime
(`export const runtime = "nodejs"`) and are dynamic (`force-dynamic`).

### Authentication

Authentication is **cookie-based**. On register/login the server creates a session
row and sets an HTTP-only cookie:

- Cookie name: `ark_session` (overridable via `SESSION_COOKIE_NAME`).
- Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production.
- TTL: 30 days (overridable via `SESSION_TTL_DAYS`).
- The cookie holds an opaque random token; only its SHA-256 hash is stored in the
  `sessions` table.

Authenticated endpoints call `requireAuth()`, which resolves the current user **and
their owned workspace**. If there is no valid session (or the user has no owned
workspace) the request fails with `401`.

Every authenticated endpoint is **workspace-scoped**: agents, channels, billing, etc.
are filtered to `workspace.ownerId === currentUser.id`. Accessing a resource that
exists but belongs to another workspace returns `404` (not `403`), because the lookup
is constrained by `workspaceId`.

### Standard error envelope

Errors are returned as JSON: `{ "error": "<message>", ...extra }`.

| Status | When | Body |
|--------|------|------|
| `400`  | Malformed JSON body | `{ "error": "Invalid JSON body" }` |
| `400`  | Business rule (e.g. unknown plan) | `{ "error": "<message>" }` |
| `401`  | Not authenticated | `{ "error": "Not authenticated" }` |
| `401`  | Bad login credentials | `{ "error": "Invalid email or password" }` |
| `404`  | Resource not found / not in workspace | `{ "error": "<message>" }` |
| `409`  | Conflict (duplicate email) | `{ "error": "An account with this email already exists" }` |
| `422`  | Zod validation failure | `{ "error": "Validation failed", "issues": { ... } }` |

The `422` `issues` object is the output of Zod's `error.flatten()`, i.e.
`{ formErrors: string[], fieldErrors: { <field>: string[] } }`.

### Common response object shapes

These DTOs (from `lib/serializers.ts`) recur across endpoints.

**PublicUser**
```jsonc
{ "id": "uuid", "email": "string", "name": "string", "locale": "en" | "zh" | "zht" }
```

**Workspace**
```jsonc
{
  "id": "uuid",
  "name": "string",
  "creditsIncluded": 0,
  "creditsUsed": 0,
  "cycleResetsAt": "2026-07-01T00:00:00.000Z" | null
}
```

**Agent** (list/summary form)
```jsonc
{
  "id": "uuid",
  "name": "string",
  "mono": "A",                       // first letter, uppercased
  "roleId": "string",                // e.g. "prospector"
  "role": "string",                  // role display name (falls back to roleId)
  "engine": "openclaw" | "hermes",
  "planTier": "associate" | "professional" | "director",
  "status": "draft" | "provisioning" | "deploying" | "working" | "scheduled" | "needs_review" | "paused" | "error" | "terminated",
  "hue": "string" | null,
  "creditsUsed": 0,
  "vmId": "string" | null,
  "vmRegion": "string" | null,
  "deploymentStatus": "string" | null,
  "instructions": "string",
  "rules": "string",
  "channels": ["web", "telegram"],   // channel type strings
  "line": "string" | null,           // most-recent activity line
  "uptimeStartedAt": "iso" | null,
  "lastHeartbeatAt": "iso" | null,
  "createdAt": "iso"
}
```

**AgentDetail** = Agent (above) plus:
```jsonc
{
  "tasks":        [{ "id": "uuid", "text": "string", "status": "queued" | "in_progress" | "done" | "blocked", "meta": "string" | null, "sortOrder": 0 }],
  "activities":   [{ "id": "uuid", "text": "string", "tag": "string", "occurredAt": "iso" }],
  "metrics":      [{ "id": "uuid", "label": "string", "value": "string", "delta": "string" | null, "weight": 0 }],
  "improvements": [{ "id": "uuid", "text": "string", "impact": "string" | null, "status": "pending" | "approved" | "dismissed", "createdAt": "iso" }]
}
```
> `improvements` in the detail payload contains only `status === "pending"` rows.
> `activities` are ordered newest-first; `tasks` by `sortOrder` ascending.

**Message**
```jsonc
{
  "id": "uuid",
  "sender": "user" | "agent" | "system",
  "body": "string",
  "channelType": "telegram" | "whatsapp" | "wechat" | "line" | "slack" | "email" | "web",
  "status": "queued" | "sent" | "delivered" | "failed",
  "meta": "string" | null,
  "createdAt": "iso"
}
```

**Channel** — secret-bearing config values (keys matching `/token|secret|key|appsecret|password/i`)
are masked to `"••••••••"` before leaving the server.
```jsonc
{
  "id": "uuid",
  "type": "telegram" | "whatsapp" | "wechat" | "line" | "slack" | "email" | "web",
  "status": "connected" | "pending" | "disconnected" | "error",
  "label": "string" | null,
  "config": { "<key>": "<value-or-masked>" }
}
```

**Plan**
```jsonc
{
  "id": "associate" | "professional" | "director",
  "name": "string",
  "monthlyPriceCents": 0,
  "includedCredits": 0,
  "overageCentsPer1k": 200,
  "features": ["string"]
}
```

**Role**
```jsonc
{
  "id": "string",
  "name": "string",
  "blurb": "string",
  "longBlurb": "string" | null,
  "hue": "string",
  "mono": "string",
  "defaultEngine": "openclaw" | "hermes",
  "defaultInstructions": "string" | null,
  "defaultRules": "string" | null,
  "minPlan": "associate" | "professional" | "director"
}
```

**Invoice**
```jsonc
{
  "id": "uuid",
  "number": "string",
  "amountCents": 0,
  "currency": "string",          // "usd" | "cny"
  "status": "draft" | "open" | "paid" | "void",
  "issuedAt": "iso",
  "paidAt": "iso" | null,
  "pdfUrl": "string" | null
}
```

---

# 1. ArkAgent REST API

## Auth

### POST `/api/auth/register`

Create a new user, an owned workspace, set the membership to `owner`, and start a
session (sets the cookie).

- **Auth:** none.
- **Request body** (`registerSchema`):

  | Field | Type | Required | Constraints |
  |-------|------|----------|-------------|
  | `email` | string | yes | valid email, max 320 chars (lower-cased + trimmed server-side) |
  | `password` | string | yes | min 8, max 200 chars |
  | `name` | string | yes | min 1, max 120 chars |

- **Success — `201 Created`:**
  ```jsonc
  { "user": PublicUser, "workspace": Workspace }
  ```
  Also sets the `ark_session` cookie.
- **Errors:**
  - `409` — email already exists (`"An account with this email already exists"`).
  - `422` — validation failure.
  - `400` — invalid JSON body.

### POST `/api/auth/login`

Verify credentials and start a session.

- **Auth:** none.
- **Request body** (`loginSchema`):

  | Field | Type | Required | Constraints |
  |-------|------|----------|-------------|
  | `email` | string | yes | valid email, max 320 (lower-cased + trimmed) |
  | `password` | string | yes | min 1, max 200 |

- **Success — `200 OK`:**
  ```jsonc
  { "user": PublicUser, "workspace": Workspace | null }
  ```
  Sets the `ark_session` cookie. `workspace` is `null` if the user owns no workspace.
- **Errors:**
  - `401` — wrong email or password (`"Invalid email or password"`). The same message
    is returned whether the email exists or not.
  - `422` / `400` — validation / malformed body.

### POST `/api/auth/logout`

Destroy the current session row and clear the cookie. Idempotent — succeeds even with
no active session.

- **Auth:** cookie (optional; no-op if absent).
- **Request body:** none.
- **Success — `200 OK`:** `{ "ok": true }`

### GET `/api/auth/me`

Return the signed-in user and their owned workspace.

- **Auth:** required.
- **Success — `200 OK`:** `{ "user": PublicUser, "workspace": Workspace }`
- **Errors:** `401` if not authenticated (or no owned workspace).

## Account

### PATCH `/api/me/preferences`

Update the current user's locale and/or display name. Both fields are optional; if
neither is provided the current user is returned unchanged (no DB write).

- **Auth:** required.
- **Request body** (`prefsSchema`):

  | Field | Type | Required | Constraints |
  |-------|------|----------|-------------|
  | `locale` | enum | no | `"en"` \| `"zh"` \| `"zht"` |
  | `name` | string | no | min 1, max 120 |

- **Success — `200 OK`:** `{ "user": PublicUser }`
- **Errors:** `401`, `422`, `400`.

## Catalog (reference data)

### GET `/api/roles`

List all agent roles, ordered by `sortOrder` ascending.

- **Auth:** none.
- **Success — `200 OK`:** `{ "roles": Role[] }`

### GET `/api/plans`

List all billing plans, ordered by `sortOrder` ascending.

- **Auth:** none.
- **Success — `200 OK`:** `{ "plans": Plan[] }`

## Agents

### GET `/api/agents`

List the workspace's agents (summary form), ordered by `createdAt` ascending.

- **Auth:** required.
- **Success — `200 OK`:** `{ "agents": Agent[] }`
- **Errors:** `401`.

### POST `/api/agents`

Create ("hire") an agent. This inserts the agent row (initial status
`provisioning`), links channels (always including `web`), seeds tasks, calls the
Agent Manager `provisionAgent` (best-effort — failures set the agent `status` to
`error` with `lastError`), creates a monthly `subscriptions` seat, and rolls the
plan's `includedCredits` into the workspace allowance.

- **Auth:** required.
- **Request body** (`createAgentSchema`):

  | Field | Type | Required | Constraints / default |
  |-------|------|----------|-----------------------|
  | `name` | string | yes | min 1, max 80 |
  | `roleId` | string | yes | min 1, max 40 (must match a seeded role) |
  | `engine` | enum | yes | `"openclaw"` \| `"hermes"` |
  | `planTier` | enum | no | `"associate"` \| `"professional"` \| `"director"` (default `"associate"`) |
  | `instructions` | string | no | max 8000 (default `""`) |
  | `rules` | string | no | max 8000 (default `""`) |
  | `channels` | string[] | no | each one of `telegram` \| `whatsapp` \| `wechat` \| `line` \| `slack` \| `email` \| `web` (default `[]`; `web` is force-added) |
  | `tasks` | string[] | no | each min 1, max 400 (default `[]`) |

- **Success — `201 Created`:** `{ "agent": AgentDetail }`
- **Errors:**
  - `401`.
  - `422` / `400` — validation / malformed body.
  - Note: an unknown `roleId` causes the service to throw (`Unknown role: …`), which
    surfaces as an unhandled `500`.

### GET `/api/agents/{id}`

Return full agent detail (with tasks, activities, metrics, pending improvements).

- **Auth:** required.
- **Path params:** `id` — agent UUID.
- **Success — `200 OK`:** `{ "agent": AgentDetail }`
- **Errors:** `401`; `404` (`"Agent not found"`) if the agent doesn't exist in the
  caller's workspace.

### PATCH `/api/agents/{id}`

Update an agent's editable fields and optionally re-link its channels. If the agent
has an `agentManagerId`, the new instructions/rules are best-effort synced to the
Agent Manager via `updateAgent` (failure is swallowed; the webhook reconciles).

- **Auth:** required.
- **Path params:** `id` — agent UUID.
- **Request body** (`updateAgentSchema`) — all fields optional:

  | Field | Type | Constraints |
  |-------|------|-------------|
  | `name` | string | min 1, max 80 |
  | `instructions` | string | max 8000 |
  | `rules` | string | max 8000 |
  | `planTier` | enum | `"associate"` \| `"professional"` \| `"director"` |
  | `channels` | string[] | channel types (`web` is force-added when provided) |

- **Success — `200 OK`:** `{ "agent": AgentDetail }`
- **Errors:** `401`; `404` if not found; `422` / `400`.

### DELETE `/api/agents/{id}`

Terminate the agent (equivalent to a `terminate` lifecycle action). Sets status to
`terminated` and logs a system activity; does not hard-delete the row.

- **Auth:** required.
- **Path params:** `id` — agent UUID.
- **Success — `200 OK`:** `{ "agent": AgentDetail }`
- **Errors:** `401`; `404`.

### POST `/api/agents/{id}/lifecycle`

Pause, resume, or terminate an agent. If the agent has an `agentManagerId`, the
action is forwarded to the Agent Manager `setLifecycle` and the returned status is
applied; otherwise a status is derived locally. A system activity is logged.

- **Auth:** required.
- **Path params:** `id` — agent UUID.
- **Request body** (`lifecycleSchema`):

  | Field | Type | Required | Constraints |
  |-------|------|----------|-------------|
  | `action` | enum | yes | `"pause"` \| `"resume"` \| `"terminate"` |

- **Success — `200 OK`:** `{ "agent": AgentDetail }`
- **Errors:** `401`; `404`; `422` / `400`.

### GET `/api/agents/{id}/messages`

Return the messages of the agent's most recent conversation, oldest-first.

- **Auth:** required.
- **Path params:** `id` — agent UUID.
- **Success — `200 OK`:**
  ```jsonc
  { "conversationId": "uuid" | null, "messages": Message[] }
  ```
  If the agent has no conversation yet: `{ "conversationId": null, "messages": [] }`.
- **Errors:** `401`; `404`.

### POST `/api/agents/{id}/messages`

Send a message to the agent over the `web` channel. Persists the user message,
forwards it to the Agent Manager `sendMessage` (best-effort). In **mock mode**
(`AGENT_MANAGER_MODE !== "live"`) a role-flavored agent reply is synthesized and
stored immediately; in **live mode** the reply arrives later via an `agent.message`
webhook and `replyMessage` is `null`. Also bumps the conversation timestamp and
records 1 credit of `message` usage.

- **Auth:** required.
- **Path params:** `id` — agent UUID.
- **Request body** (`sendMessageSchema`):

  | Field | Type | Required | Constraints |
  |-------|------|----------|-------------|
  | `body` | string | yes | min 1, max 4000 |
  | `conversationId` | string (uuid) | no | accepted by the schema; the route currently uses/creates the latest conversation regardless |

- **Success — `200 OK`:**
  ```jsonc
  {
    "conversationId": "uuid",
    "userMessage": Message,
    "replyMessage": Message | null   // null in live mode
  }
  ```
- **Errors:** `401`; `404`; `422` / `400`.

### POST `/api/agents/{id}/improvements/{improvementId}`

Approve or dismiss a self-review improvement suggestion. Sets the improvement's
status (`approved` / `dismissed`) and `resolvedAt`, and logs a `learning` activity.

- **Auth:** required.
- **Path params:** `id` — agent UUID; `improvementId` — improvement UUID.
- **Request body** (`improvementActionSchema`):

  | Field | Type | Required | Constraints |
  |-------|------|----------|-------------|
  | `action` | enum | yes | `"approve"` \| `"dismiss"` |

- **Success — `200 OK`:** `{ "agent": AgentDetail }`
- **Errors:**
  - `401`.
  - `404` — `"Agent not found"` (agent not in workspace) or `"Improvement not found"`
    (improvement does not belong to the agent).
  - `422` / `400`.

## Dashboard

### GET `/api/dashboard`

Aggregate view for the workspace home: workspace, headline stats, agent list, and a
recent activity feed (max 12, across non-terminated agents, newest-first).

- **Auth:** required.
- **Success — `200 OK`:**
  ```jsonc
  {
    "workspace": Workspace,
    "stats": {
      "activeAgents": 0,        // non-terminated agents
      "tasksThisWeek": 0,       // tasks with status in_progress or done
      "creditsUsed": 0,
      "needsReview": 0          // needs_review agents + pending improvements
    },
    "agents": Agent[],
    "activity": [
      {
        "id": "uuid", "text": "string", "tag": "string", "occurredAt": "iso",
        "agentId": "uuid", "who": "string", "hue": "string" | null
      }
    ]
  }
  ```
- **Errors:** `401`.

## Channels

### GET `/api/channels`

List the workspace's channels, ordered by `createdAt` ascending. Secret config
values are masked.

- **Auth:** required.
- **Success — `200 OK`:** `{ "channels": Channel[] }`
- **Errors:** `401`.

### POST `/api/channels`

Connect (or update) a channel of a given type for the workspace. There is one channel
per `(workspace, type)`; an existing channel is updated (config merged, status set to
`connected`), otherwise a new one is created.

- **Auth:** required.
- **Request body** (`connectChannelSchema`):

  | Field | Type | Required | Constraints / default |
  |-------|------|----------|-----------------------|
  | `type` | enum | yes | `telegram` \| `whatsapp` \| `wechat` \| `line` \| `slack` \| `email` \| `web` |
  | `config` | object (string→string) | no | default `{}`; merged into existing config |
  | `label` | string | no | max 80 |

- **Success:**
  - `201 Created` if a new channel was created.
  - `200 OK` if an existing channel was updated.
  - Body (both cases): `{ "channel": Channel }` (config masked).
- **Errors:** `401`; `422` / `400`.

### DELETE `/api/channels/{id}`

Disconnect a channel: keeps the row, sets status to `disconnected`, and clears the
config (so secrets are removed).

- **Auth:** required.
- **Path params:** `id` — channel UUID.
- **Success — `200 OK`:** `{ "channel": Channel }`
- **Errors:** `401`; `404` (`"Channel not found"`) if not in the workspace.

## Billing

### GET `/api/billing`

Billing overview: credit balance, per-agent seat usage, invoices (newest-first),
subscription count, and the plan catalog.

- **Auth:** required.
- **Success — `200 OK`:**
  ```jsonc
  {
    "credits": { "included": 0, "used": 0, "resetsAt": "iso" | null },
    "seats": [
      {
        "id": "uuid", "name": "string", "mono": "A", "hue": "string" | null,
        "planTier": "associate" | "professional" | "director",
        "planName": "string", "creditsUsed": 0, "priceCents": 0
      }
    ],
    "seatCount": 0,             // number of non-terminated agent seats
    "invoices": Invoice[],
    "subscriptions": 0,         // count of subscription rows
    "plans": Plan[]
  }
  ```
- **Errors:** `401`.

### POST `/api/billing/checkout`

Simulated checkout. Records a `subscriptions` row and a **paid** `invoices` row.
Annual cycle applies a 20% discount (`monthly * 12 * 0.8`); `alipay` invoices are
billed in `cny`, otherwise `usd`.

- **Auth:** required.
- **Request body** (`checkoutSchema`):

  | Field | Type | Required | Constraints / default |
  |-------|------|----------|-----------------------|
  | `planId` | enum | yes | `"associate"` \| `"professional"` \| `"director"` |
  | `cycle` | enum | no | `"monthly"` \| `"annual"` (default `"monthly"`) |
  | `provider` | enum | no | `"stripe"` \| `"alipay"` (default `"stripe"`) |
  | `agentId` | string (uuid) | no | optional seat association |

- **Success — `201 Created`:**
  ```jsonc
  { "subscriptionId": "uuid", "invoice": Invoice }
  ```
- **Errors:**
  - `401`.
  - `400` — `"Unknown plan"` if `planId` has no matching plan row.
  - `422` / `400` — validation / malformed body.

## Webhooks

### POST `/api/webhooks/agent-manager`

Inbound webhook from the Agent Manager. **Not** session-authenticated — instead it is
verified with an HMAC-SHA256 signature in the `x-arkagent-signature` header. See
[section 2](#inbound-webhooks-agent-manager--arkagent) for the full event catalog.

- **Auth:** HMAC signature (header `x-arkagent-signature`), not a session cookie.
- **Request body:** a single `WebhookEvent` (see below). All variants carry
  `externalAgentId` (the ArkAgent agent UUID).
- **Success — `200 OK`:** `{ "ok": true }`
- **Errors:**
  - `401` — `"Invalid signature"` (missing/invalid HMAC or missing secret).
  - `400` — `"Invalid JSON"`.
  - `404` — `"Unknown agent"` if `externalAgentId` matches no agent.

---

# 2. Agent Manager integration contract

The Agent Manager is an external service that provisions and monitors remote
OpenClaw/Hermes agent VMs. The contract lives in `lib/agent-manager/`:

- `types.ts` — the `AgentManagerClient` interface, request/response types, and the
  `WebhookEvent` union.
- `live.ts` — the real HTTP client (`liveClient`).
- `mock.ts` — an in-process simulator (`mockClient`).
- `webhook.ts` — HMAC signing/verification for inbound webhooks.
- `index.ts` — `getAgentManager()` selects live vs. mock.

## Mode switch (`AGENT_MANAGER_MODE`)

`getAgentManager()` returns:

- `liveClient` when `AGENT_MANAGER_MODE === "live"`.
- `mockClient` otherwise (the default).

The mock simulates VM creation, deployment, lifecycle, and replies entirely
in-process so the full ArkAgent flow works (and is testable) without the external
service. Notably, in mock mode `POST /api/agents/{id}/messages` synthesizes the agent
reply inline; in live mode the reply instead arrives via an `agent.message` webhook.

### Environment variables

| Variable | Used by | Purpose |
|----------|---------|---------|
| `AGENT_MANAGER_MODE` | `index.ts`, messages route | `"live"` selects the live client; anything else uses the mock. |
| `AGENT_MANAGER_BASE_URL` | `live.ts` | Base URL of the Agent Manager (trailing slash stripped). Required in live mode. |
| `AGENT_MANAGER_API_KEY` | `live.ts` | Bearer token sent as `Authorization: Bearer <key>` on every outbound call. |
| `AGENT_MANAGER_WEBHOOK_SECRET` | `webhook.ts` | Shared secret for HMAC-SHA256 verification of inbound webhooks. |

## Outbound calls (ArkAgent → Agent Manager)

All live calls go through `live.ts`'s `call()` helper:

- Method + path: as listed below, against `AGENT_MANAGER_BASE_URL`.
- Headers: `Content-Type: application/json`, `Authorization: Bearer <AGENT_MANAGER_API_KEY>`.
- `cache: "no-store"`.
- A non-2xx response throws `Agent Manager <METHOD> <path> failed: <status> <body>`.

### `provisionAgent` — `POST /v1/agents`

Called from `createAgent` when an agent is hired.

- **Request body** (`ProvisionInput`):
  ```jsonc
  {
    "externalAgentId": "uuid",        // ArkAgent's agent id; echoed on every webhook
    "engine": "openclaw" | "hermes",
    "roleId": "string",
    "name": "string",
    "instructions": "string",
    "rules": "string",
    "channels": [ { "type": "string", "config": { "<key>": "<value>" } } ],
    "region": "string"                // optional
  }
  ```
- **Response** (`ProvisionResult`):
  ```jsonc
  {
    "agentManagerId": "string",       // stored as agents.agentManagerId
    "vmId": "string",
    "vmRegion": "string",
    "status": "provisioning" | "deploying" | "working" | "error",
    "deploymentStatus": "string"
  }
  ```
  ArkAgent persists `agentManagerId`, `vmId`, `vmRegion`, `deploymentStatus`,
  `status`, and timestamps. If the call throws, the agent is set to `status: "error"`
  with `lastError`.

### `updateAgent` — `PATCH /v1/agents/{agentManagerId}`

Called from `PATCH /api/agents/{id}` to re-sync config. Best-effort; failures are
swallowed (the webhook reconciles).

- **Request body** (`UpdateInput`) — all optional:
  ```jsonc
  {
    "instructions": "string",
    "rules": "string",
    "channels": [ { "type": "string", "config": { "<key>": "<value>" } } ]
  }
  ```
- **Response** (`LifecycleResult`): `{ "status": "string" }`

### `sendMessage` — `POST /v1/agents/{agentManagerId}/messages`

Called from `POST /api/agents/{id}/messages`. ArkAgent passes
`agentManagerId ?? agent.id` as the path id. Best-effort; failures are swallowed.

- **Request body** (`SendMessageInput`):
  ```jsonc
  { "conversationId": "uuid", "body": "string", "channel": "web" }
  ```
- **Response** (`SendMessageResult`):
  ```jsonc
  {
    "accepted": true,
    "externalId": "string",
    "reply": { "body": "string", "externalId": "string", "meta": "string" }  // optional
  }
  ```
  In mock mode `reply` is populated inline. In live mode `reply` is usually omitted
  and the reply arrives later via an `agent.message` webhook.

### `setLifecycle` — `POST /v1/agents/{agentManagerId}/lifecycle`

Called from `setLifecycle` (lifecycle endpoint, DELETE agent). Best-effort; on
failure ArkAgent derives the status locally.

- **Request body:** `{ "action": "pause" | "resume" | "terminate" }`
- **Response** (`LifecycleResult`): `{ "status": "string" }`

## Inbound webhooks (Agent Manager → ArkAgent)

Delivered to `POST /api/webhooks/agent-manager`. Each request is a single
`WebhookEvent` JSON object and must be HMAC-signed.

### HMAC-SHA256 signature scheme

- The sender computes `HMAC-SHA256(AGENT_MANAGER_WEBHOOK_SECRET, rawRequestBody)` and
  hex-encodes it.
- It is sent in the `x-arkagent-signature` header, optionally prefixed with
  `sha256=`.
- ArkAgent (`verifyWebhookSignature`) strips an optional `sha256=` prefix, recomputes
  the HMAC over the **raw request body**, and compares using a constant-time
  comparison (`timingSafeEqual`). Length-mismatched buffers fail before comparison.
- Verification returns `false` (→ `401`) if the secret or the signature header is
  missing.
- The body must be signed exactly as sent — verification runs on the raw text before
  JSON parsing.

A helper `signWebhook(rawBody)` is exposed for tests / the mock to produce the hex
signature.

### Event dispatch

After signature verification and JSON parse, the route looks up the agent by
`event.externalAgentId` (→ `404 "Unknown agent"` if missing), then dispatches on
`event.type`. All events return `{ "ok": true }` (`200`) on success.

| `type` | Fields | Effect on ArkAgent |
|--------|--------|--------------------|
| `agent.status` | `externalAgentId`, `status`, `vmId?`, `vmRegion?`, `deploymentStatus?`, `error?` | Updates `agents.status` (and any provided `vmId` / `vmRegion` / `deploymentStatus`); `error` (truncated to 480 chars) is stored as `lastError`. |
| `agent.heartbeat` | `externalAgentId`, `ts` (iso), `uptimeStartedAt?` (iso) | Sets `lastHeartbeatAt = ts`; sets `uptimeStartedAt` if provided. |
| `agent.activity` | `externalAgentId`, `text`, `tag?`, `occurredAt?` (iso) | Inserts an `agent_activities` row. `tag` is coerced to `system` unless it is one of the known activity tags (`meeting, draft, research, review, outreach, learning, resolved, escalated, summary, published, brief, calendar, docs, system`). `occurredAt` defaults to now. |
| `agent.message` | `externalAgentId`, `conversationId?`, `channel`, `body`, `externalId`, `meta?` | Inserts an `agent`-sender message. Resolves `conversationId` (uses the latest conversation, or creates one with subject `"Inbound"`). Dedupes on `externalId` via `onConflictDoNothing`. `meta` defaults to `"<AGENT NAME> · VIA <CHANNEL>"`. Bumps the conversation's `lastMessageAt`. |
| `agent.metric` | `externalAgentId`, `label`, `value`, `delta?`, `weight?` | Inserts an `agent_metrics` row (`delta` → null if absent; `weight` → 0 if absent). |
| `agent.improvement` | `externalAgentId`, `text`, `impact?` | Inserts an `agent_improvements` row with `status: "pending"` (appears in the self-review queue). |
| `agent.usage` | `externalAgentId`, `credits` (number), `kind?` | Inserts a `usage_records` row (`kind: "compute"`), logs a `"Consumed N credits"` system activity, and increments both `workspaces.creditsUsed` and `agents.creditsUsed` by `credits`. |

> Note: the message dedupe relies on the unique index on `messages.externalId`, so a
> re-delivered `agent.message` with the same `externalId` is a no-op.

## curl examples

### Outbound: provision an agent (ArkAgent → Agent Manager)

```bash
curl -X POST "$AGENT_MANAGER_BASE_URL/v1/agents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_MANAGER_API_KEY" \
  -d '{
    "externalAgentId": "3f8a1c2e-1111-2222-3333-444455556666",
    "engine": "openclaw",
    "roleId": "prospector",
    "name": "Ada",
    "instructions": "Qualify inbound leads and book demos.",
    "rules": "Never quote pricing without approval.",
    "channels": [{ "type": "web", "config": {} }]
  }'
```

### Outbound: set lifecycle (ArkAgent → Agent Manager)

```bash
curl -X POST "$AGENT_MANAGER_BASE_URL/v1/agents/am_abc123/lifecycle" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_MANAGER_API_KEY" \
  -d '{ "action": "pause" }'
```

### Inbound: signed webhook (Agent Manager → ArkAgent)

```bash
BODY='{"type":"agent.status","externalAgentId":"3f8a1c2e-1111-2222-3333-444455556666","status":"working","deploymentStatus":"deployed"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$AGENT_MANAGER_WEBHOOK_SECRET" | sed 's/^.* //')

curl -X POST "https://app.arkagent.com/api/webhooks/agent-manager" \
  -H "Content-Type: application/json" \
  -H "x-arkagent-signature: sha256=$SIG" \
  -d "$BODY"
```

### ArkAgent REST: register, then create an agent (cookie session)

```bash
# Register — saves the ark_session cookie to cookies.txt
curl -X POST "https://app.arkagent.com/api/auth/register" \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{ "email": "ada@example.com", "password": "supersecret", "name": "Ada Lovelace" }'

# Create an agent using the saved session cookie
curl -X POST "https://app.arkagent.com/api/agents" \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "Ada",
    "roleId": "prospector",
    "engine": "openclaw",
    "planTier": "professional",
    "instructions": "Qualify inbound leads.",
    "channels": ["web", "slack"],
    "tasks": ["Review the inbound queue", "Draft a follow-up sequence"]
  }'
```

### ArkAgent REST: send a message to an agent

```bash
curl -X POST "https://app.arkagent.com/api/agents/<AGENT_ID>/messages" \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{ "body": "What is the status of the Q3 outreach?" }'
```
