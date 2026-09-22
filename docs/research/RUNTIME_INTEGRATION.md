# Runtime Integration Map — ArkAgent ↔ Agent Manager

**Scope.** What the external Agent Manager (OpenClaw Manager, `clawmanager.lightark.cc`)
actually exposes today, versus what ArkAgent v2 needs it to expose for four harnesses
(`openclaw` · `hermes` · `codex` · `deepseek`).

**Sources read.** `manager_api.md` (Chinese, translated below), `app/lib/openclaw_manager_api.ts`,
`lib/services/openclaw_instances.ts`, `lib/services/agents.ts`, `lib/agent-manager/{index,types,mock,live,webhook}.ts`,
`app/api/webhooks/agent-manager/route.ts`, `app/api/agents/[id]/{instance-info,token-report,sessions,lifecycle,messages,route}.ts`,
`app/api/channels/{route,upsert,wechat/login}.ts`, `app/api/roles/route.ts`, `lib/db/schema.ts`, `.env.example`, `docs/API.md §2`.

**Audience.** ArkAgent engineers designing v2, and the backend team that owns the Manager.
Every "PROPOSED" shape below is a request to that team, not a description of reality.

---

## 0. There are two integration surfaces, and only one of them is real

This is the single most important thing to understand before reading anything else.

| | Surface A — `lib/agent-manager/**` | Surface B — `app/lib/openclaw_manager_api.ts` |
|---|---|---|
| Base URL env | `AGENT_MANAGER_BASE_URL` (`http://localhost:4000`) | `OPENCLAW_MANAGER_API_URL` (`https://clawmanager.lightark.cc`) |
| Auth env | `AGENT_MANAGER_API_KEY` | `OPENCLAW_MANAGER_API_KEY` |
| Paths | `/v1/agents`, `/v1/agents/{id}/lifecycle`, … | `/api/instances`, `/api/openclaw/instances/…`, `/api/channels/…` |
| Mode switch | `AGENT_MANAGER_MODE` (`getAgentManager()`) | **none — always calls out** |
| Documented in | `docs/API.md §2` | `manager_api.md` |
| Implemented upstream | **No evidence any service serves `/v1/agents`.** No sample, no curl, no log. | Yes — this is the service `manager_api.md` describes |
| Mock available | Yes (`lib/agent-manager/mock.ts`) | **No** |

Consequences that are live in `main` today:

1. **`getAgentManager().updateAgent()` is a no-op against the real Manager.**
   `PATCH /api/agents/{id}` (app/api/agents/[id]/route.ts:82) calls it whenever
   `row.agentManagerId` is set — and `createAgent` sets `agentManagerId = preprocessed.uuid`
   (the OpenClaw instance UUID). In live mode that becomes
   `PATCH {AGENT_MANAGER_BASE_URL}/v1/agents/<openclaw-uuid>`, which no known service serves.
   The call is inside `try {} catch {}` with the comment "webhook will reconcile", and no webhook
   ever arrives. **Net effect: editing an agent's brief, rules, or settings in the UI never
   reaches the runtime.** This directly blocks the v2 goal "full agent config management".

2. **`setLifecycle` double-dispatches.** `lib/services/agents.ts:277` calls the real
   `stopInstance`/`startInstance` for `engine === "openclaw"` **and then** calls
   `am.setLifecycle(row.agentManagerId, action)` on Surface A, whose failure is caught and
   replaced with a locally-derived status. So the local status is authoritative-by-accident,
   and `engine === "hermes"` agents get **no** runtime lifecycle call at all — only Surface A's
   404 and the local guess.

3. **Surface B ignores `AGENT_MANAGER_MODE` entirely.** `createAgent` calls
   `createOpenclawInstance` unconditionally; `app/api/roles/route.ts` calls
   `listOpenClawManagerAgents()` unconditionally; `/api/channels` calls `getChannelStatus`
   unconditionally; `instance-info` calls `syncOpenclawInstanceToDb` unconditionally. With
   `AGENT_MANAGER_MODE=mock` and no reachable Manager, **hiring an agent still fires a real
   HTTP request**, fails, and lands the agent in `status: "error"` with a `lastError`. The
   "works with nothing but a database" promise in `.env.example` is not honoured for agents.

**v2 must collapse these into one facade** (proposal in §4.1). Everything below documents
Surface B as the real contract, and treats Surface A as an unimplemented aspiration whose
webhook half is nonetheless the right shape to keep.

---

# (a) Existing upstream endpoints

## 1.1 Transport and auth

All Surface B calls go through `request()` / raw `fetch` in `app/lib/openclaw_manager_api.ts`:

```
{OPENCLAW_MANAGER_API_URL}{path}
Authorization: Bearer {OPENCLAW_MANAGER_API_KEY}
Content-Type: application/json
Accept: application/json, text/plain, */*
```

Non-2xx throws `OpenClaw API error {status}: {body}`. `OPENCLAW_DEBUG_LOG=1` logs method,
origin+pathname, query params, and parsed JSON body.

### FINDING — the bearer tokens in `manager_api.md` are ~24h user session tokens, not API keys

Every curl in `manager_api.md` carries a token shaped `base64("<user_id>:<expiry_unix>").<hmac>`:

| Token prefix | Decodes to | Expiry (UTC) | Sample captured |
|---|---|---|---|
| `MToxNzgyMjA1NzY4` | `1:1782205768` | 2026-06-23 09:09 | 2026-06-22 |
| `MToxNzgyMzAwNTAz` | `1:1782300503` | 2026-06-24 11:28 | 2026-06-23 |
| `MToxNzgyODk0NTQx` | `1:1782894541` | 2026-07-01 08:29 | 2026-06-30 |

Meanwhile every instance response carries `default_api_key: "ocm_…"` — a different, per-instance
token family. So the Manager has at least two credential kinds, and `.env.example` documents
`OPENCLAW_MANAGER_API_KEY` as if it were long-lived.

**Decision needed from the backend team:** does the Manager issue a non-expiring service
credential for ArkAgent (server-to-server, no user context), or must ArkAgent hold a refreshable
user token? If the latter, v2 needs a token-refresh path and the whole integration inherits a
24-hour failure clock. **Assume a service credential until told otherwise, and flag loudly if
production starts returning 401 on a schedule.**

### FINDING — `target_user_id` semantics are undefined

`POST /api/instances` takes `target_user_id`. `manager_api.md` sends the literal string `"test"`
and the response comes back with `user_id: 13` — i.e. the *token's* user, not the target.
ArkAgent sends `ctx.user.id`, an ArkAgent UUID that means nothing to the Manager
(`lib/services/agents.ts:218`). Either the Manager auto-provisions users by this key, or the
field is being silently ignored and every ArkAgent instance is owned by one Manager user.
**Must be confirmed** — it determines whether per-tenant isolation exists upstream at all.

## 1.2 `category_id` semantics and the four-harness mapping

`manager_api.md` states, verbatim (translated): *"category_id: 2 = openclaw / hermes = 4"*.
`GET /api/instances/{uuid}` corroborates: a `category_id: 4` instance reports
`instance_type: "hermes"`, `category_name: "hermes"`, image `hermes-agent-vnc:v20260625-7`.
A `category_id: 2` instance reports image `openclaw-gateway-vnc:v20260622-8`.

ArkAgent hardcodes it in exactly one place:

```ts
// lib/services/agents.ts:212
const categoryId = input.engine === "openclaw" ? 2 : 4;
```

| ArkAgent `engineEnum` | Display label | `category_id` | Status |
|---|---|---|---|
| `openclaw` | OpenClaw | `2` | Confirmed by `manager_api.md` + live responses |
| `hermes` | Hermes | `4` | Confirmed by `manager_api.md` + live responses |
| `codex` | Codex Harness | **UNASSIGNED** | **Backend team must confirm** |
| `deepseek` | DeepSeek Harness | **UNASSIGNED** | **Backend team must confirm** |

`1` and `3` are unexplained holes — likely other categories already in use upstream, so
ArkAgent must not assume they are free.

**PROPOSAL — do not hardcode two more integers.** Add a discovery endpoint and resolve the
mapping at runtime, cached, with a static fallback table:

```jsonc
// PROPOSED: GET /api/categories
{
  "items": [
    { "id": 2, "name": "openclaw", "instance_type": "openclaw",
      "base_image": "harbor.lightark.cc/infra/openclaw-gateway-vnc:v20260622-8",
      "capabilities": ["chat_stream","sessions","channels","tasks"] },
    { "id": 4, "name": "hermes",   "instance_type": "hermes",   "base_image": "…", "capabilities": ["chat_stream","sessions"] },
    { "id": 5, "name": "codex",    "instance_type": "codex",    "base_image": "…", "capabilities": ["chat_stream"] },
    { "id": 6, "name": "deepseek", "instance_type": "deepseek", "base_image": "…", "capabilities": ["chat_stream"] }
  ]
}
```

`capabilities[]` is the load-bearing part: it lets ArkAgent grey out per-harness UI instead of
firing calls that 404. Until it exists, ArkAgent should ship a `HARNESS_CATEGORY_ID` map in
`lib/agent-manager/harness.ts` with `codex`/`deepseek` marked `null` → provisioning refused
with a translated "harness not yet available on this cluster" message rather than a stack trace.

## 1.3 Endpoint inventory

Legend for **Doc**: `md` = specified in `manager_api.md`; `code-only` = implemented in the client
with no upstream documentation, i.e. reverse-engineered and unverified.

### E1 · `GET /api/agents` — Manager-side agent bundles (→ ArkAgent *roles*)

| | |
|---|---|
| Doc | code-only |
| Client | `listOpenClawManagerAgents()` (openclaw_manager_api.ts:61) |
| ArkAgent use | `app/api/roles/route.ts` — **the hire wizard's role catalogue** |

Response: `{ items: [{ id, user_id, category_id, category_name, name, description, upload_filename, created_at, updated_at }] }`.
Items with a non-`number` `id` or non-`string` `name` are dropped.

`app/api/roles/route.ts` maps each item to a synthetic role `ocm-{id}`, upserts it into the local
`agent_roles` table, derives `defaultEngine` by string-matching `category_name` for `"hermes"`
(defaulting to `openclaw`), and returns `managerAgentId: item.id`, later passed back as
`agent_id` on instance creation. `upload_filename` is surfaced as `longBlurb` and otherwise unused.

**This is the closest thing the Manager has to a template/skill bundle system** — see §3.3.
On any error the route falls back to the local `agent_roles` catalogue.

**Gap for v2:** the string-match `category_name.includes("hermes")` silently maps codex and
deepseek bundles to `openclaw`. Must become a `category_id` lookup via E0/`GET /api/categories`.

### E2 · `POST /api/instances` — provision

| | |
|---|---|
| Doc | md (partially) |
| Client | `createInstance()` (openclaw_manager_api.ts:381) |
| ArkAgent use | `createOpenclawInstance()` ← `createAgent()` |

Request as sent by ArkAgent:

```jsonc
{
  "name": "string",              // agents.name
  "category_id": 2,              // 2 openclaw | 4 hermes
  "target_user_id": "uuid",      // ArkAgent users.id — see FINDING above
  "agent_id": 17,                // OPTIONAL, code-only: the E1 bundle id; omitted for roleId "custom"
  "tasks": ["<brief>", "…"]      // code-only, NOT in manager_api.md
}
```

`tasks[0]` is a synthesised **brief** — `instructions + "\n\n" + rules`
(`lib/services/openclaw_instances.ts:56`). Every read path then does `.slice(1)` to hide it
(`getOpenclawVisibleTasks`, `serializeInstanceTasks` in instance-info/route.ts:36).
**The agent's entire job description is smuggled through element 0 of an undocumented array,
and its position is load-bearing in three separate files.** This is the most fragile thing in
the integration and the first thing v2 should replace (see §3.5, PROPOSED `PUT …/brief`).

Response (`manager_api.md` sample, normalised by `preprocessInstance`): `id`, `uuid`, `user_id`,
`name`, `base_image_id`, `base_image_name`, `slug`, `status`, `docker_container_name`,
`docker_image`, `access_url`, `access_urls[]`, `auto_stop_seconds` (900), `cpu_limit` (4),
`memory_limit` ("4g"), `auto_update`, `env_vars {}`, `model_config {}`, `last_active_at`,
`last_started_at`, `stopped_at`, `created_at`, `updated_at`, `error_message`,
`direct_access_url(s)`, `instance_type`, `category_name`, `agent_id`, `agent_name`,
`external_api_url(s)`, `default_api_key` (`ocm_…`), `provisioning_status`, `provisioning_error`.

Derived client-side: `isReady = provisioning_status === "running"`,
`isFailed = provisioning_status === "failed" || !!provisioning_error`.

ArkAgent writes: a full `agent_manager_config` row (`provider: "openclaw"` **for every engine
including hermes** — the provider column is a lie today), plus `agents.agentManagerId = uuid`,
`agents.vmId = docker_container_name`, `agents.deploymentStatus = provisioning_status`,
`agents.status`, `provisionedAt`, `uptimeStartedAt`, `lastHeartbeatAt`, and a `system` activity row.
On throw: `agents.status = "error"`, `lastError`, and a failure activity.

**Note the status vocabulary is doubled and inconsistent.** `status` (`creating` → `running` →
`stopped`) and `provisioning_status` (`running` | `done` | `failed`) both appear, and the same
word `running` means different things in each. `preprocessInstance.isReady` reads
`provisioning_status === "running"`, but the second sample in `manager_api.md` shows a healthy
instance with `provisioning_status: "done"` — **so `isReady` is `false` for a fully provisioned
instance.** Confirm the enum with the backend team; today `createAgent` can mark a working agent
as `provisioning`.

### E3 · `GET /api/instances/{uuid}` — instance detail

| | |
|---|---|
| Doc | md |
| Client | `getInstance()` (openclaw_manager_api.ts:753) |
| ArkAgent use | `syncOpenclawInstanceToDb()` ← `GET /api/agents/{id}/instance-info`; `getOpenclawVisibleTasks()` ← `GET /api/agents/{id}` |

Everything from E2 plus: `other`, `model_level_ids: [2]`, `model_feature_description`,
`traefik_router_name`, `traefik_service_name`, `host_root_path`, and an embedded `events[]`
array (same shape as E4). `preprocessInstance` also reads a `tasks[]` array
(`{id, content, sort_order, session_key, result, status, created_at, updated_at}`) that appears
in **neither** `manager_api.md` sample — code-only, unverified, and the source of the agent's
task list in the UI.

`syncOpenclawInstanceToDb` (openclaw_instances.ts:311) does four things:
1. overwrites `agent_manager_config.{status,lastError,config}` with the whole blob;
2. maps `status` → `agents.status`: `running`→`working`, `provisioning`→`provisioning`,
   `stopped`|`stopping`→`paused`, **anything else**→`error`;
3. on a `pending|provisioning|null` → `running` transition, **immediately calls `stopInstance`**
   ("view info → instance pauses" product behaviour);
4. returns `{statusChanged, newStatus, autoStopped}`.

Step 2's catch-all `error` will fire for the documented `creating` status. Step 3 means
**opening the fleet detail page stops the agent** — deliberate, but it makes this endpoint
non-idempotent and unsafe to poll, which matters a lot for the v2 Activity page.

### E4 · `GET /api/instances/{uuid}/events?limit=N` — provisioning event log

| | |
|---|---|
| Doc | md |
| Client | `getInstanceEvents()` (limit default 50), `getInstanceStatus()` (limit 1) |
| ArkAgent use | `getOpenclawInstanceEventsFromApi()` — **exported by the service and never called by any route** |

Response: a bare JSON **array** (not `{items}`), newest first:

```jsonc
[{ "id": 2213, "instance_uuid": "…", "action": "provision_completed",
   "result": "success", "message": "全部步骤执行完毕，实例已就绪",
   "metadata_json": null, "created_at": "2026-06-22T13:14:56.821871" }]
```

Observed `action` vocabulary: `provision_requested`, `step1_starting_docker`, `step1_image_pulled`
(with `metadata_json: {image}`), `step1_docker_ready`, `step2_starting_model`,
`step2_model_applied`, `step3_skipped` ("no Agent, skipping unpack step"), `provision_completed`,
`model_config_applied`. `result` ∈ `success | error | failed` (the latter two inferred from
`preprocessEvent`'s `isError`). Timestamps are **naive local datetimes with no timezone
offset** — `new Date(...)` will parse them as local time and skew.

**This is the only pull-based telemetry the Manager offers, and it covers container
provisioning only** — nothing about what the agent *did*. See §3.2.

### E5 · `POST /api/instances/{uuid}/start` · E6 · `POST /api/instances/{uuid}/stop`

| | |
|---|---|
| Doc | md |
| Client | `startInstance()` / `stopInstance()` |
| ArkAgent use | `setLifecycle()` for `engine === "openclaw"` only; `stopInstance` also fires from `syncOpenclawInstanceToDb`'s auto-pause |

No request body. Response is a **truncated** instance object — the samples show only
`{id, uuid, user_id, name, base_image_id, base_image_name, slug, status}` — yet the client runs
it through the full `preprocessInstance`, so `accessUrl`, `envVars`, `modelConfig`, `tasks`, and
`provisioningStatus` all come back `undefined`/empty. Anything that persists this response
**will blank out cached config**. `syncOpenclawInstanceToDb`'s auto-stop branch is careful to
write only `status`; nothing else should follow suit by accident.

**There is no `DELETE /api/instances/{uuid}`.** `setLifecycle("terminate")` therefore calls
`stopInstance` (comment at agents.ts:281 says so explicitly), and `deleteAgent` then removes the
ArkAgent row while the container keeps existing upstream. **This leaks VMs.** See §3.5.

### E7 · `POST /api/openclaw/instances/{uuid}/chat/stream` — SSE chat

| | |
|---|---|
| Doc | md |
| Client | `streamChat()` / `chat()` (openclaw_manager_api.ts:547) |
| ArkAgent use | `POST /api/agents/{id}/messages`, but **only when `AGENT_MANAGER_MODE === "live"`** |

Request: `{ "agent": "main", "message": "…", "sessionKey": "agent:main:web" }` (`sessionKey` optional).

Response: `text/event-stream`, OpenAI Responses-API shaped. Event types consumed:
`response.created`, `response.in_progress`, `response.output_item.added`,
`response.content_part.added`, `response.output_text.delta`, `response.output_text.done`,
`response.content_part.done`, `response.output_item.done`, `response.completed`,
`response.error`, terminated by `data: [DONE]`. The terminal `response.completed` carries
`usage: {input_tokens, output_tokens, total_tokens}` and `output[].phase` (observed:
`"final_answer"`).

The line splitter splits on `\n` (not `\n\n`) and ignores `event:` lines, so it relies on the
upstream putting each event on one `data:` line — true in the sample, brittle in general.

**Per-response token usage arrives here and is thrown away.** `streamHandleToMessage` builds a
`usage` object with `cacheRead: 0, cacheWrite: 0, cost: {total: 0}`, but
`streamOpenclawReply` in the messages route ignores it and persists only `handle.fullText`.
The `llm_usage` table is written **only** for the OpenRouter fallback path
(`recordLlmUsage` in `streamLLMReply`), never for runtime chat. So today an agent talking through
its own runtime produces **zero** ArkAgent-side usage accounting except a flat 1-credit
`usage_records` row. See §3.2.

`phase` on the output item is the only hint of multi-step reasoning the protocol exposes — a
harness that emits tool calls would presumably use other phases, and ArkAgent currently drops
every event that is not a text delta.

### E8 · `POST /api/openclaw/instances/{uuid}/chat/send` — non-streaming chat

| | |
|---|---|
| Doc | code-only |
| Client | `sendChat()` |
| ArkAgent use | **none** — exported via `sendOpenclawChat()`, called by no route |

Response reshaped as `{ runId: body.response.runId, status: body.response.status, sessionKey: body.sessionKey }`.
`runId` is the **only** run identifier the upstream is known to mint. It is not persisted anywhere.
For v2's `agent_runs` table this is the natural correlation key — see §3.2.

### E9 · `GET /api/openclaw/instances/{uuid}/chat/history?agent=&sessionKey=`

| | |
|---|---|
| Doc | code-only |
| Client | `getChatHistory()` |
| ArkAgent use | **none** — exported via `getOpenclawChatHistory()`, called by no route (superseded by E11) |

Response `{ sessionKey, agent, messages[] }`. Each message: `role`, `content` (string **or**
`[{type:"text",text}]` — the client flattens), `timestamp` (epoch **ms or s — ambiguous**),
`model`, `provider`, and a rich `usage: {input, output, totalTokens, cacheRead, cacheWrite, cost:{total}}`.

**Note this is the only place upstream is known to report cache tokens and cost per message** —
and it is dead code.

### E10 · `GET /api/openclaw/instances/{uuid}/sessions`

| | |
|---|---|
| Doc | code-only |
| Client | `listOpenClawSessions()` |
| ArkAgent use | `GET /api/agents/{id}/sessions` |

Response `{ sessions: [...] }`. The client normalises across harnesses with a comment that
spells out the divergence: *"Hermes uses sessionId / conversation, OpenClaw uses sessionId / key"*.
Fields probed: `sessionId | id | key`, `key | conversation | sessionId`, `preview`, `status`,
`created_at`, `updatedAt` (number), `archived`, `pinned`. A `preview` of `"—"` is treated as absent.

**This shape-guessing is the template for what codex/deepseek support will cost** — every new
harness adds another `??` chain unless the Manager normalises server-side. Ask for it (§3.5).

### E11 · `GET /api/openclaw/instances/{uuid}/sessions/{sessionId}/history`

| | |
|---|---|
| Doc | code-only |
| Client | `getOpenClawSessionHistory()` |
| ArkAgent use | `GET /api/agents/{id}/sessions/{sessionId}/history` |

Response `{ sessionId, sessionKey, status, messages[] }`, messages as E9. The ArkAgent route
synthesises ids as `${sessionId}-${index}` and **defaults a missing `timestamp` to `Date.now()`**,
so re-fetching an old session renders every undated message as "just now". Nothing is persisted —
this is a pure read-through proxy, and the chat history for a live agent therefore exists **only
upstream**, violating the "everything a backend service needs must be readable from Postgres"
constraint from the other direction.

### E12 · `GET /api/admin/token-report/instances` — token accounting

| | |
|---|---|
| Doc | md |
| Client | `getTokenReport()` (openclaw_manager_api.ts:847) |
| ArkAgent use | `GET /api/agents/{id}/token-report?days=&period=` → the fleet **Usage** tab |

**The documented query and the implemented query disagree:**

| | `manager_api.md` | `getTokenReport()` |
|---|---|---|
| filter param | `instance_id=<uuid>` | `instance_uuid=<uuid>` |
| extra param | — | `by=uuid` |
| period | `period=day` | `period=day\|hour` |
| range | `days=30` | `days` (route restricts to 1/3/7/30) |

Someone clearly hit the `instance_id`-takes-a-numeric-id trap and added `by=uuid`. The doc was
never updated. **Backend team: confirm `by=uuid` + `instance_uuid` is the supported form**, or
ArkAgent's Usage tab is one deploy away from silently reporting the whole cluster's tokens.

Response: `{ instances: [{id, name}], report: [{date, instance_id, instance_name, input_tokens, output_tokens, cache_tokens, total_tokens, calls}], totals: {…} }`,
snake_case → camelCase by `preprocessTokenReport`. `totals` is dereferenced without a null guard
(`raw.totals as Record<...>` then `.input_tokens`) — an empty response throws.

The path is under `/api/admin/` — **this is an admin-scoped endpoint being called with the
shared service credential on behalf of an end user.** ArkAgent enforces workspace ownership
before calling (token-report/route.ts:26), which is the only thing preventing cross-tenant token
data leaking into the UI. A non-admin credential would break the Usage tab entirely.
**Ask for a non-admin, instance-scoped equivalent.**

### E13 · `GET /api/channels/status?instance_uuid={uuid}`

| | |
|---|---|
| Doc | code-only |
| Client | `getChannelStatus()` — **swallows all errors and returns `null`** |
| ArkAgent use | `GET /api/channels?instance_uuid=` → fleet detail Channels panel |

Response `{ instance_uuid, instance_type, source, channels: { "<type>": {channel_type, label, enabled, configured, config} } }`.
Channel types handled in the UI: `feishu`, `dingtalk`, `wechat`, `wecom` — **none of which are in
ArkAgent's `channelTypeEnum`** (`telegram, whatsapp, wechat, line, slack, email, web`). Only
`wechat` overlaps. The local `channels` / `agent_channels` tables and the upstream channel state
are two disconnected systems that happen to share one word.

### E14 · `POST /api/channels/upsert`

| | |
|---|---|
| Doc | code-only |
| Client | `upsertChannel()` |
| ArkAgent use | `POST /api/channels/upsert` |

Request `{ instance_uuid, channel_type, enabled, config }`. Response ignored (`request<void>`).
ArkAgent accepts either an `agents.id` or an `agent_manager_config.externalId` as `instanceUuid`
and resolves to the OpenClaw UUID before forwarding — the same 40-line dual-lookup block is
copy-pasted across `channels/route.ts`, `channels/upsert/route.ts`, and `channels/wechat/login/route.ts`.

### E15 · `POST /api/channels/{uuid}/flows` — WeChat QR login (SSE)

| | |
|---|---|
| Doc | code-only |
| Client | `wechatLogin()` |
| ArkAgent use | `POST /api/channels/wechat/login?instance_uuid=` (proxied SSE) |

No body (`Content-Length: 0`). Emits named SSE events: `wait_matched` (payload
`data.stdout` contains an **ASCII-art QR code**, rendered in a `<pre>`; `data.matched_text`),
`step_completed`, `heartbeat`, `session_completed` (`data.exit_code`, `data.final_stdout`).
Terminal mapping: `exit_code === 0` → `connected`; `null` → `expired`; else → `error`. Stream
ending without `session_completed` → `expired`.

This is the only endpoint using the `event:`/`data:` SSE form (parsed by `parseSseEventBlock`,
split on `\n\n`), versus E7's bare `data:` lines. Two SSE dialects, two parsers.

---

# (b) Existing inbound webhooks

## 2.1 The one endpoint

`POST /api/webhooks/agent-manager` (app/api/webhooks/agent-manager/route.ts).

- **Auth:** HMAC-SHA256 of the **raw body** with `AGENT_MANAGER_WEBHOOK_SECRET`, hex, in
  `x-arkagent-signature` (optional `sha256=` prefix), compared with `timingSafeEqual`.
  Missing secret or header → `401`.
- **Routing:** `event.externalAgentId` must equal an `agents.id`, else `404 "Unknown agent"`.
  **Note this is ArkAgent's UUID, not the OpenClaw instance UUID** — the Manager has no
  documented way to learn it (`target_user_id` is the only ArkAgent identifier ever sent, and
  it is the *user* id, not the agent id).
- **Response:** `{ "ok": true }` for every handled type. Unknown types fall through the `switch`
  and also return `200` — silent drop.

## 2.2 Event catalogue and what each one writes

| `type` | Payload | DB effect |
|---|---|---|
| `agent.status` | `status`, `vmId?`, `vmRegion?`, `deploymentStatus?`, `error?` | `UPDATE agents SET status, [vm_id], [vm_region], [deployment_status], [last_error=error.slice(0,480)], updated_at` |
| `agent.heartbeat` | `ts` (ISO), `uptimeStartedAt?` | `UPDATE agents SET last_heartbeat_at = ts, [uptime_started_at]` |
| `agent.activity` | `text`, `tag?`, `occurredAt?` | `INSERT agent_activities`. `tag` coerced to `system` unless in the 14-value `activityTagEnum`; `occurredAt` defaults to now |
| `agent.message` | `channel`, `body`, `externalId`, `conversationId?`, `meta?` | `INSERT messages (sender='agent')` with `onConflictDoNothing` (dedupe on the unique `messages.external_id`); resolves/creates a conversation (`subject: "Inbound"`); bumps `conversations.last_message_at`. **`channel` is cast straight to `channelTypeEnum` with no validation — an unknown channel is a DB-level enum error, i.e. a 500** |
| `agent.metric` | `label`, `value`, `delta?`, `weight?` | `INSERT agent_metrics` |
| `agent.improvement` | `text`, `impact?` | `INSERT agent_improvements (status='pending')` → the self-review queue |
| `agent.usage` | `credits`, `kind?` | `INSERT usage_records (kind='compute')` + a `"Consumed N credits"` system activity + atomic `workspaces.credits_used += credits` and `agents.credits_used += credits`. **`kind` is accepted and ignored** |

## 2.3 The state of this in reality

**Nothing upstream is known to send any of these.** `manager_api.md` documents no webhook
registration surface, no callback URL field on `POST /api/instances`, and no signing scheme.
`AGENT_MANAGER_WEBHOOK_SECRET` has no counterpart in the OpenClaw Manager configuration.

Therefore **every piece of live agent telemetry ArkAgent shows today is pull-based**, and
the only pull that happens is `GET /api/agents/{id}/instance-info` when a user opens the fleet
detail page — which also stops the agent (§E3). `agents.lastHeartbeatAt` is set exactly once, at
creation. The Activity feed is populated only by ArkAgent's own writes ("OpenClaw instance
created…", "Agent paused by operator"). `agent_metrics` and `agent_improvements` are seed data.

**This is the single largest v2 gap**: the product owner wants "a far richer agent Activity page
backed by the database", and there is currently no mechanism by which the runtime can put
anything in that database.

The event shapes themselves are good and should be **kept**; what is missing is (i) an upstream
implementation, (ii) a registration endpoint, and (iii) the run/step/schedule events of §3.

---

# (c) GAP TABLE — v2 features vs. upstream reality

`✅` supported · `🟡` partial / requires reverse-engineering · `❌` absent.

| v2 feature | ArkAgent side | Upstream today | Verdict |
|---|---|---|---|
| **Reminders & schedulers** (`agent_schedules`, `agent_schedule_runs`) | `lib/schedule/**`, cron maths in-repo, `AgentSettings.heartbeatMinutes` already exists and is **never sent anywhere** | Only `auto_stop_seconds` (idle shutdown). No cron, no timers, no wake-on-schedule. | ❌ §3.1 |
| **Runs / steps telemetry** (`agent_runs`, `agent_run_steps`) | `lib/activity/**`, rich Activity page | E4 gives container provisioning steps only. E8 mints a `runId` that is discarded. E7 streams per-response `usage` that is discarded. No tool-call granularity. | 🟡→❌ §3.2 |
| **Skill Repository + installation** (`skills`, `agent_skills`) | `lib/skills/**`, safety scoring, `AgentSettings.skills[]` (never sent) | E1's `agent_id` bundle + `upload_filename` is create-time-only and undocumented. No list/install/remove. | ❌ §3.3 |
| **Context / knowledge upload** (`agent_context_items`) | file upload + pasted text, `AgentSettings.knowledgeUrls[]` (never sent) | `env_vars` (string map, create-time). `host_root_path` is exposed but not writable. `step3_skipped: "no Agent, skipping unpack"` implies a bundle-unpack path exists. | ❌ §3.4 |
| **Per-harness config management** | 4 harnesses, full settings surface | `model_config` + `model_level_ids` returned by E3; `model_config_applied` events prove *something* writes them (the Manager's own `/model-config` page, per the `Referer` in the token-report curl) — but no documented write API. `PATCH` on an instance: absent. | 🟡 §3.5 |
| **Agent brief / rules update** | `PATCH /api/agents/{id}` | Create-time only, via `tasks[0]`. Surface A's `PATCH /v1/agents/{id}` 404s. | ❌ §3.5 |
| **Real teardown** | `DELETE /api/agents/{id}` | No `DELETE /api/instances/{uuid}`. Terminate = stop. | ❌ §3.5 |
| **Health / uptime** (`agent_health_samples`) | health sparkline | `last_active_at`, `last_started_at`, `stopped_at` on E3 only; no CPU/memory/disk. | 🟡 §3.6 |
| **Chat + sessions** | fleet chat tab | E7/E10/E11 work for OpenClaw. Hermes `access_url` ends in `/login`, not `#token=`, so the same chat path is **unverified for Hermes**. | 🟡 |
| **Token/cost accounting** | Usage tab, `llm_usage` | E12 works (with the doc/impl mismatch and admin-scoping caveats). E9 has cache+cost per message and is dead code. | ✅ / 🟡 |
| **Channels** | Channels panel | E13/E14/E15 work for `feishu`/`dingtalk`/`wechat`/`wecom`. Disjoint from ArkAgent's `channelTypeEnum`. | 🟡 |
| **Harness discovery** | 4-harness UI | `category_id` 2 and 4 only; no enumeration endpoint. | ❌ §1.2 |

Everything marked ❌ or 🟡 below gets a proposed contract. **All of them are requests to the
backend team.** ArkAgent's own tables are the system of record either way — the API only has to
carry intent down and observations back up.

## 3.1 Schedules — PROPOSED

ArkAgent owns cron parsing and next-run computation (`lib/schedule/**`); the Manager only needs
to fire. Two viable designs; **prefer (A)**.

**(A) ArkAgent-driven (fewer upstream changes, ship first).** A Vercel Cron hits an internal
route that computes due schedules from `agent_schedules`, starts the instance if stopped, and
injects the prompt through **existing E7**. Requires **zero** new upstream endpoints. Costs:
the agent cannot fire while ArkAgent is down, and cron resolution is bounded by Vercel Cron
(1/min). This is the recommended v2.0 path.

**(B) Manager-driven (correct long-term).** ArkAgent pushes the schedule set declaratively:

```jsonc
// PROPOSED: PUT /api/instances/{uuid}/schedules      (full replace — ArkAgent is the SoR)
{
  "schedules": [
    { "external_id": "<agent_schedules.id uuid>",
      "enabled": true,
      "kind": "cron",                       // cron | interval | once
      "cron": "0 9 * * 1-5",                // when kind=cron
      "interval_seconds": null,             // when kind=interval
      "run_at": null,                       // ISO-8601, when kind=once
      "timezone": "Asia/Shanghai",          // IANA; AgentSettings.timezone
      "agent": "main",
      "session_key": "agent:main:schedule:<external_id>",
      "prompt": "Summarise yesterday's support tickets and post to #ops.",
      "wake_instance": true,                // start a stopped instance to run this
      "max_runtime_seconds": 900 }
  ]
}
// 200 -> { "accepted": 1, "rejected": [] }
//   rejected[]: { "external_id": "...", "reason": "invalid_cron" | "unsupported_kind" | ... }
```

```jsonc
// PROPOSED: POST /api/instances/{uuid}/schedules/{external_id}/run   — fire now ("Run now" button)
// 200 -> { "run_id": "run_…", "status": "queued" }
// PROPOSED: GET /api/instances/{uuid}/schedules                       — reconciliation / drift check
```

Inbound, to fill `agent_schedule_runs`:

```jsonc
// PROPOSED webhook: type "agent.schedule_run"
{ "type": "agent.schedule_run",
  "externalAgentId": "<ArkAgent agents.id>",
  "scheduleExternalId": "<agent_schedules.id>",
  "runId": "run_…",
  "status": "started" | "succeeded" | "failed" | "skipped",
  "startedAt": "2026-08-29T09:00:00Z",
  "finishedAt": "2026-08-29T09:00:41Z",
  "error": null,
  "summary": "Posted digest to #ops (14 tickets)." }
```

## 3.2 Runs and steps telemetry — PROPOSED

The `agent_runs` / `agent_run_steps` tables need a run identity and a step stream.
Upstream already mints `runId` (E8) — make it universal and observable.

**Pull (reconciliation / backfill):**

```jsonc
// PROPOSED: GET /api/instances/{uuid}/runs?since=<iso>&limit=100&cursor=<opaque>
{ "runs": [
    { "run_id": "run_9f2…", "session_key": "agent:main:web", "agent": "main",
      "trigger": "chat" | "schedule" | "channel" | "api" | "self",
      "trigger_ref": "<schedule external_id | channel message id | null>",
      "status": "running" | "succeeded" | "failed" | "cancelled",
      "started_at": "2026-08-29T09:00:00Z", "finished_at": "2026-08-29T09:00:41Z",
      "step_count": 7, "error": null,
      "usage": { "input_tokens": 16533, "output_tokens": 53, "cache_tokens": 256,
                 "total_tokens": 16586, "calls": 3, "cost_usd": 0.0142 },
      "model": "new-api/minimax/minimax-m2.7" } ],
  "next_cursor": null }

// PROPOSED: GET /api/instances/{uuid}/runs/{run_id}/steps
{ "steps": [
    { "step_id": "step_1", "index": 0, "phase": "thinking" | "tool_call" | "tool_result" | "final_answer",
      "kind": "shell" | "browser" | "file" | "http" | "skill" | "message" | "model",
      "title": "grep -rn TODO src/",
      "detail": "…truncated stdout/stderr or reasoning summary…",
      "status": "ok" | "error",
      "started_at": "…", "duration_ms": 812,
      "usage": { "input_tokens": 4102, "output_tokens": 88 } } ] }
```

**Push (live Activity page):**

```jsonc
// PROPOSED webhooks — same HMAC envelope as §2
{ "type": "agent.run_started",  "externalAgentId": "…", "runId": "run_…",
  "trigger": "schedule", "triggerRef": "<schedule id>", "sessionKey": "…", "startedAt": "…" }

{ "type": "agent.run_step",     "externalAgentId": "…", "runId": "run_…",
  "stepId": "step_3", "index": 2, "phase": "tool_call", "kind": "browser",
  "title": "GET https://example.com/pricing", "detail": "…", "status": "ok",
  "durationMs": 1204, "occurredAt": "…" }

{ "type": "agent.run_finished", "externalAgentId": "…", "runId": "run_…",
  "status": "succeeded", "finishedAt": "…", "error": null,
  "usage": { "inputTokens": 16533, "outputTokens": 53, "cacheTokens": 256,
             "totalTokens": 16586, "costUsd": 0.0142 },
  "summary": "Drafted 3 replies, escalated 1." }
```

**Cheap interim win, no upstream change required:** the E7 SSE stream already carries
`response.completed.usage` and `output[].phase`. `streamOpenclawReply`
(app/api/agents/[id]/messages/route.ts) should persist an `agent_runs` row keyed on
`handle.responseId` and write the usage into `llm_usage`, instead of discarding both. That gets
the Usage tab and a coarse run feed working against **today's** Manager. Do this in v2.0
regardless of what the backend team commits to.

## 3.3 Skills installation — PROPOSED

The Manager's "agents" (E1) are uploaded bundles (`upload_filename`) selectable **only at
instance creation** via `agent_id`. The `step3_skipped` event — *"no Agent, skipping unpack step"* —
confirms a server-side unpack stage exists. Skills need the same machinery, post-creation and
idempotent. ArkAgent's `skills` table is the catalogue; the Manager only installs.

```jsonc
// PROPOSED: GET /api/instances/{uuid}/skills
{ "skills": [ { "slug": "web-search", "version": "1.4.0", "source": "registry",
                "installed_at": "…", "status": "installed" | "failed" | "pending",
                "error": null } ] }

// PROPOSED: PUT /api/instances/{uuid}/skills   — declarative desired state; Manager diffs
{ "skills": [
    { "slug": "web-search", "version": "1.4.0",
      "source": "registry", "ref": "openclaw/web-search" },
    { "slug": "company-style-guide", "version": "2026.08.29",
      "source": "inline",                       // ArkAgent-hosted skill body
      "content_type": "application/zip",
      "content_base64": "UEsDBBQ…",             // ≤ 5 MB; else use "url"
      "url": null, "sha256": "…" } ] }
// 202 -> { "run_id": "install_…", "pending": 2 }

// PROPOSED: DELETE /api/instances/{uuid}/skills/{slug}
```

```jsonc
// PROPOSED webhook: type "agent.skill_state"
{ "type": "agent.skill_state", "externalAgentId": "…", "slug": "web-search",
  "version": "1.4.0", "status": "installed" | "failed" | "removed", "error": null }
```

**Safety note.** `lib/skills/**` scores skills for safety, but the enforcement point is the
runtime, not ArkAgent. Ask the backend team whether the Manager sandboxes installed skills
(network egress, filesystem scope) — if it does not, "SAFE skills sourced from the web" is a
label ArkAgent cannot honour, and the Skill Repository should ship read-only (browse + request)
until it can.

## 3.4 Context / knowledge upload — PROPOSED

`agent_context_items` holds files and pasted text. `env_vars` is the only writable per-instance
data channel today and is a flat string map set at creation — unsuitable for documents.

```jsonc
// PROPOSED: POST /api/instances/{uuid}/context      (JSON; or multipart/form-data)
{ "items": [
    { "external_id": "<agent_context_items.id>",
      "kind": "file" | "text" | "url",
      "name": "2026-pricing.pdf",
      "mime": "application/pdf",
      "content_base64": "JVBERi0…",       // kind=file, ≤ 20 MB
      "text": null,                        // kind=text
      "url": null,                         // kind=url (Manager fetches)
      "sha256": "…",
      "scope": "agent"                     // agent | session
    } ] }
// 202 -> { "accepted": ["<external_id>"], "rejected": [ { "external_id": "…", "reason": "too_large" } ] }

// PROPOSED: GET    /api/instances/{uuid}/context                  -> { "items": [ { external_id, name, mime, bytes, sha256, indexed_at, status } ] }
// PROPOSED: DELETE /api/instances/{uuid}/context/{external_id}
```

```jsonc
// PROPOSED webhook: type "agent.context_state"
{ "type": "agent.context_state", "externalAgentId": "…", "externalId": "…",
  "status": "indexed" | "failed", "error": null, "chunks": 128 }
```

**Decision for the backend team:** does the Manager index context into a retrievable store, or
just drop files into `host_root_path` for the harness to read? The answer changes the ArkAgent
UI (a "searchable knowledge base" vs. "files on the agent's disk") and must be settled before
the CONTEXT template section is designed.

## 3.5 Per-harness config, brief updates, teardown, session normalisation — PROPOSED

```jsonc
// PROPOSED: PATCH /api/instances/{uuid}      — all fields optional, partial update
{ "name": "Support · EU",
  "env_vars": { "TZ": "Europe/Berlin" },
  "model_config": { "agents": { "defaults": { "model": {
      "primary": "new-api/minimax/minimax-m3",
      "fallbacks": ["new-api/minimax/minimax-m2.7"] } } } },
  "model_level_ids": [2],
  "auto_stop_seconds": 1800,
  "cpu_limit": 4, "memory_limit": "4g", "auto_update": true }
// 200 -> the full instance object (E3 shape). MUST return the full object, not the E5/E6 stub.
```

```jsonc
// PROPOSED: PUT /api/instances/{uuid}/brief   — retires the tasks[0] smuggling of §E2
{ "instructions": "…", "rules": "…", "tone": "professional",
  "response_language": "auto", "autonomy": "ask", "timezone": "Asia/Shanghai" }
// 200 -> { "applied": true, "restart_required": false }

// PROPOSED: PUT /api/instances/{uuid}/tasks   — replace the visible task list
{ "tasks": [ { "external_id": "<agent_tasks.id>", "content": "…", "sort_order": 0 } ] }

// PROPOSED: DELETE /api/instances/{uuid}?purge=true
// 200 -> { "deleted": true, "container_removed": true, "volumes_removed": true }
```

Also request, to stop the `??`-chain in E10 growing once per harness:

```jsonc
// PROPOSED: normalise GET /api/openclaw/instances/{uuid}/sessions across harnesses
{ "sessions": [ { "session_id": "…", "session_key": "…", "label": "…", "preview": "…",
                  "status": "…", "created_at": "…", "updated_at": "…",
                  "archived": false, "pinned": false } ] }
```

And a home for `AgentSettings` fields that today die in Postgres — `autonomy`,
`approvalAmount`, `approveExternalSends`, `dailyActionLimit`, `alwaysOn`, `workStart`/`workEnd`/
`workDays`, `heartbeatMinutes`, `memoryEnabled`, `retentionDays`, `monthlyCreditCap`,
`tools.{shell,files,browser,docker,code}`, `selfImprove`, `autoCreateSkills`. Every one is
runtime policy. Fold them into `PUT /api/instances/{uuid}/policy` or extend the brief endpoint;
**do not** ship a v2 "full agent config management" screen whose switches change nothing.

## 3.6 Health samples — PROPOSED

```jsonc
// PROPOSED webhook: type "agent.health"  (or GET /api/instances/{uuid}/health for pull)
{ "type": "agent.health", "externalAgentId": "…", "ts": "2026-08-29T09:00:00Z",
  "state": "running" | "idle" | "stopped" | "unhealthy",
  "cpu_percent": 12.4, "memory_bytes": 812000000, "memory_limit_bytes": 4294967296,
  "disk_used_bytes": 3200000000, "uptime_seconds": 84213,
  "active_runs": 1, "last_activity_at": "…" }
```

Feeds `agent_health_samples` and finally makes `agents.lastHeartbeatAt` mean something. The
existing `agent.heartbeat` event stays as the cheap liveness signal.

## 3.7 Webhook registration — PROPOSED (blocks all of §2 and half of §3)

Nothing in the Manager knows ArkAgent's callback URL, its signing secret, or the mapping from an
OpenClaw instance UUID to an `agents.id`. All three must be established at provisioning time:

```jsonc
// PROPOSED: extend POST /api/instances
{ "name": "…", "category_id": 2, "target_user_id": "…",
  "external_ref": "<ArkAgent agents.id>",        // echoed as externalAgentId on every webhook
  "webhook": { "url": "https://app.arkagent.com/api/webhooks/agent-manager",
               "secret": "<AGENT_MANAGER_WEBHOOK_SECRET>",
               "signature_header": "x-arkagent-signature",
               "algorithm": "hmac-sha256-hex",
               "events": ["agent.status","agent.heartbeat","agent.activity","agent.message",
                          "agent.usage","agent.run_started","agent.run_step","agent.run_finished",
                          "agent.schedule_run","agent.skill_state","agent.context_state","agent.health"] } }

// PROPOSED: PUT /api/instances/{uuid}/webhook   — rotate URL/secret without re-provisioning
```

Delivery requirements to state explicitly: at-least-once with retry + exponential backoff; a
stable per-event `event_id` for idempotency (ArkAgent already dedupes messages on `externalId`,
but runs/steps need their own key); HMAC over the exact raw bytes sent.

---

# (d) Degradation story — behaviour when `AGENT_MANAGER_MODE != "live"`

## 4.1 First, fix the switch

Today the mode flag gates only two things: `getAgentManager()` (Surface A) and the `useStream`
branch in the messages route. Every Surface B call bypasses it. **v2 must route all upstream
traffic through one facade** so that a single flag governs the whole integration:

```
lib/agent-manager/
  index.ts        getRuntime(): AgentRuntime      // mode + capability aware
  types.ts        AgentRuntime — the full v2 surface (provision, lifecycle, chat,
                  sessions, runs, steps, schedules, skills, context, config, health)
  live.ts         → app/lib/openclaw_manager_api.ts (Surface B), per-harness capability guards
  mock.ts         deterministic in-process simulator for ALL of the above
  harness.ts      engine → { categoryId, capabilities } (from GET /api/categories, cached)
```

`AGENT_MANAGER_MODE=live` requires `OPENCLAW_MANAGER_API_URL` + `OPENCLAW_MANAGER_API_KEY` and
should **fail fast at boot** if either is missing, the way `NEXT_PUBLIC_APP_URL` already does.
Anything else selects the mock. Surface A's `/v1/agents` client is deleted; its `WebhookEvent`
union and HMAC verification are kept and extended (§3).

## 4.2 Per-feature behaviour in mock mode

The rule: **mock mode must never make an outbound HTTP request, and must never leave a row in an
`error` state that the live path would have left healthy.** Every write still lands in Postgres,
so a real Manager attached later reconciles against real rows.

| Feature | Mock behaviour |
|---|---|
| **Provision** (`POST /api/instances`) | `mockClient.provisionAgent` synthesises `uuid`, `docker_container_name`, region (deterministic from `agents.id` via SHA-256), `provisioning_status: "done"`, `status: "running"`. Writes a real `agent_manager_config` row with `provider: "mock"` so live and mock rows are never confused. Agent goes to `working`, not `error`. |
| **Instance detail / events** | Mock replays the canonical provisioning sequence from `manager_api.md` (`provision_requested` → `step1_*` → `step2_*` → `step3_skipped` → `provision_completed`) with timestamps derived from `agents.createdAt`. No auto-stop-on-view. |
| **Lifecycle** | Pure DB state machine: `pause`→`paused`, `resume`→`working`, `terminate`→`terminated`. Already the de-facto behaviour on error; make it the explicit mock path. |
| **Chat** | Unchanged and already correct — the messages route falls back to OpenRouter when `isLLMConfigured()`, and to `mockReply(roleId, body)` token-streamed at 15 ms/token otherwise. **This is the model every other feature should copy.** |
| **Sessions / history** | Backed by ArkAgent's own `conversations` + `messages` (which the mock chat path already writes), presented in the same DTO the live proxy returns. Fixes today's `{sessions: []}` dead panel. |
| **Runs / steps** | The mock chat path emits a synthetic `agent_runs` row plus 3–5 plausible `agent_run_steps` (`thinking` → `tool_call` → `final_answer`) so the Activity page has real structure to render. Deterministic, seeded from the run id. |
| **Schedules** | Fully local — this is the one v2 feature that needs **no** runtime at all in design (A) of §3.1. `lib/schedule/**` computes `nextRunAt`; the cron route executes against whatever chat backend is active (mock reply / OpenRouter / live runtime). Schedules are honestly "on" in mock mode. |
| **Skills** | `agent_skills` rows are written and shown as `installed` with a `mock` badge. No install is simulated beyond a short `pending`→`installed` transition on next read, so the UI's loading states get exercised. |
| **Context** | Files land in ArkAgent storage and `agent_context_items` exactly as in live mode — the upload half is ArkAgent's anyway. `status` goes `pending`→`indexed` immediately; `chunks` is a deterministic function of byte length. |
| **Config / brief / policy** | Writes to `agents.settings` + `agents.instructions`/`rules` (already the case) and skips the upstream push. The UI must show a "not yet applied to runtime" state **in live mode too**, since §3.5 is unimplemented upstream. |
| **Health** | Synthetic samples on a sine curve seeded by `agents.id`, marked `source: "mock"`, so the sparkline renders without pretending to be real. |
| **Token report** | Aggregated from ArkAgent's own `llm_usage` + `usage_records` instead of E12, in the same DTO. Works in live mode too as a fallback when E12 502s. |
| **Channels** | `getChannelStatus` returns a locally-stored map from `agent_channels`; `upsertChannel` writes locally. **WeChat QR login is refused outright** with a translated "requires a live runtime" message — a fake QR code is worse than an honest refusal. |
| **Webhooks** | `POST /api/webhooks/agent-manager` stays enabled and signature-checked in every mode (it is how a dev replays fixtures with `signWebhook`). Missing `AGENT_MANAGER_WEBHOOK_SECRET` continues to fail closed with `401`. |
| **Harness availability** | `harness.ts` reports `codex` and `deepseek` as available in mock mode (so the four-harness UI is developable) and gated on `GET /api/categories` in live mode. |

## 4.3 Live mode with a partially-capable Manager

Mock-vs-live is not the only axis: in live mode, most of §3 will be unimplemented for months.
Every §3 call site therefore needs a third state — **`unsupported`** — distinct from
"failed". `harness.ts` capability flags drive it, a `404`/`405` from a PROPOSED endpoint
downgrades the capability for the process lifetime, and the UI renders "not available on this
runtime yet" rather than an error toast. Without this, shipping the v2 UI against the current
Manager produces a screen full of red.

---

# RISKS

Ordered by blast radius. Items 1–4 are live defects, not future concerns.

1. **Config edits never reach the runtime.** `PATCH /api/agents/{id}` → `updateAgent` →
   `PATCH {AGENT_MANAGER_BASE_URL}/v1/agents/{uuid}` — a path no known service serves, failing
   into an empty `catch` that comments "webhook will reconcile" when no webhook exists. The v2
   "full agent config management" feature is built on a call that does nothing. **Fix before
   designing the settings UI.**

2. **No inbound telemetry path exists at all.** The webhook endpoint, its HMAC scheme, and seven
   event handlers are all implemented and correct — and nothing sends them. The Manager has no
   callback URL field, no signing secret, and no way to learn `agents.id`. Until §3.7 lands, the
   "far richer Activity page backed by the database" has no data source. **This is the critical
   path for v2.**

3. **Mock mode still calls the internet.** `createOpenclawInstance`, `listOpenClawManagerAgents`,
   `getChannelStatus`, and `syncOpenclawInstanceToDb` all fire regardless of
   `AGENT_MANAGER_MODE`. A fresh clone with only a database — the documented supported setup —
   hires an agent straight into `status: "error"`. Violates the project's own hard constraint.

4. **Terminate leaks containers.** No `DELETE /api/instances/{uuid}`, so `deleteAgent` stops the
   instance and deletes the ArkAgent row. Every deleted agent leaves an orphaned container and
   `host_root_path` upstream, invisible to ArkAgent forever. At public-launch volumes this is a
   cost and a data-retention problem.

5. **The bearer token may expire every ~24 hours.** Decoded samples are
   `base64("1:<unix expiry>").<hmac>` with ~1-day lifetimes, while `.env.example` treats
   `OPENCLAW_MANAGER_API_KEY` as static. If no service credential exists, production breaks
   daily and the fix is a token-refresh subsystem nobody has scoped.

6. **`by=uuid` is undocumented.** The Usage tab depends on a query form
   (`by=uuid&instance_uuid=`) that contradicts `manager_api.md` (`instance_id=`). If the
   parameter is dropped or renamed upstream, the endpoint may silently return **cluster-wide**
   token data into a customer's UI rather than erroring.

7. **`/api/admin/token-report/…` is admin-scoped.** ArkAgent calls an admin endpoint with a
   shared credential on behalf of end users; only ArkAgent's own workspace check prevents
   cross-tenant exposure. One missing `getAgentRow` guard is a data breach. Ask for an
   instance-scoped, non-admin equivalent.

8. **The brief is `tasks[0]`.** Undocumented parameter, position-dependent, `.slice(1)` in three
   files. Any upstream change to task ordering silently exposes the internal brief as a user task
   or hides a real one. Replace with `PUT …/brief` (§3.5).

9. **`provisioning_status` is ambiguous.** `isReady` requires `"running"`, but a healthy instance
   in `manager_api.md` reports `"done"`. Fresh agents can be marked `provisioning` forever, and
   `syncOpenclawInstanceToDb`'s catch-all maps the documented `creating` status to `error`.

10. **Opening a page stops the agent.** `GET /api/agents/{id}/instance-info` calls
    `syncOpenclawInstanceToDb`, which auto-stops on a `provisioning → running` transition. The
    read path has a side effect, which makes polling — required by a live Activity page —
    actively harmful.

11. **Four harnesses, two known `category_id`s.** `codex` and `deepseek` have no mapping, and
    `1`/`3` are unexplained holes that must not be assumed free. Blocks provisioning for half the
    advertised harnesses.

12. **Hermes is largely unverified.** `agent_manager_config.provider` is hardcoded to
    `"openclaw"` for every engine; `setLifecycle` only calls start/stop for
    `engine === "openclaw"`; the chat/session endpoints all live under `/api/openclaw/…`; and the
    Hermes `access_url` ends in `/login` rather than `#token=`, suggesting an interactive
    auth step OpenClaw does not need. **Nobody should assume Hermes chat works today** —
    verify before extrapolating to two more harnesses.

13. **`agent.message` webhooks can 500.** `event.channel` is cast straight into
    `channelTypeEnum`. An upstream channel (`feishu`, `dingtalk`, `wecom` — all four the
    channels UI already supports) would raise a Postgres enum error and, with retries, a
    delivery loop. Validate before insert; extend the enum.

14. **Event timestamps carry no timezone.** `"2026-06-22T13:14:56.821871"` parsed by `new Date()`
    is interpreted in the server's local zone. Activity ordering and any run-duration maths will
    skew by the cluster's UTC offset.

15. **Two SSE dialects, two hand-rolled parsers.** E7 splits on `\n` and ignores `event:` lines;
    E15 splits on `\n\n` and reads them. Neither handles multi-line `data:` per the SSE spec.
    Consolidate before adding a third streaming endpoint.

16. **Skill safety is enforced where ArkAgent cannot see it.** `lib/skills/**` can score, but the
    sandbox is the Manager's. Confirm the isolation model before shipping "install SAFE skills
    from the web", or ship the Skill Repository read-only.
