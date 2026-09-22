# ArkAgent ↔ Agent Runtime — Backend Integration Contract

**Contract version:** `2026-08-29` · **Protocol version:** `v2` · **Status:** normative for v2.0
**Audience:** the backend team that owns the agent runtime service (today: the OpenClaw Manager,
`clawmanager.lightark.cc`). This document is self-contained. You do not need access to the
ArkAgent source tree to implement it.

---

## How to read this document

ArkAgent is a **control plane**. It does not run agents. It captures what an agent is supposed to
be, stores every byte of that in Postgres, and renders the operator UI. Your service is the
**execution plane**: it turns those rows into a running agent and reports back what happened.

There are exactly two directions of traffic, and they are asymmetric:

| | Read contract (§2) | Write contract (§3) |
|---|---|---|
| Direction | ArkAgent's database → your runtime | your runtime → ArkAgent's ingest endpoint |
| Shape | rows / a JSON manifest | signed event batches |
| Who is authoritative | **ArkAgent** — it is the system of record for *intent* | **you** — you are the system of record for *observation* |
| Failure mode | you run a stale config | ArkAgent's Activity page falls behind |

The single most important rule follows from that table: **ArkAgent owns configuration, you own
observation, and neither side writes into the other's half.** Every other rule in this document is
a consequence.

Words in **bold caps** — **MUST**, **MUST NOT**, **SHOULD**, **MAY** — carry RFC 2119 weight.
Anything marked **CONFIRM** is a question this contract cannot answer alone and that must be
resolved before the corresponding feature ships; the list is consolidated in §8.

---

## 0. Identifiers, time, and encoding

### 0.1 The identifier table

Getting this wrong is the most common integration failure, so it comes first.

| Name | Type | Minted by | Meaning | Appears in |
|---|---|---|---|---|
| `agentId` | UUID v4 | ArkAgent | **The** correlation key. One ArkAgent agent. Stable for the agent's whole life. | `agents.id`; `external_ref` on provisioning; `externalAgentId` on every single inbound event |
| `instanceId` | string ≤120 | **you** | Your handle for the running thing (container / VM / instance UUID). | returned from provisioning; stored by ArkAgent in `agents.agent_manager_id` and `agent_manager_config.external_id` |
| `workspaceId` | UUID v4 | ArkAgent | Tenant boundary. Billing and isolation. | `agents.workspace_id` |
| `runId` | string ≤120 | **you** | One unit of agent work, start to finish. | `agent_runs.external_run_id` |
| `stepId` | string ≤120 | **you** | One step inside a run. Unique **within** a run only. | `agent_run_steps.external_step_id` |
| `eventId` | string ≤120 | **you** | Idempotency key for one inbound event. Globally unique across all agents forever. | envelope `eventId` |
| `scheduleId` | UUID v4 | ArkAgent | One reminder/schedule. | `agent_schedules.id` |
| `contextItemId` | UUID v4 | ArkAgent | One uploaded document or pasted text. | `agent_context_items.id` |
| `skillId` | UUID v4 | ArkAgent | One catalogue skill. | `skills.id` |

**`agentId` is not derivable from `instanceId` by you unless we tell you.** ArkAgent hands it to
you at provisioning time as `external_ref` (§1.6) and you **MUST** persist it alongside your
instance record and echo it on every event. This is the current single largest defect in the live
integration: our webhook endpoint routes exclusively on `agentId`, and the running Manager has
never been told what it is, so no inbound event can be routed at all.

### 0.2 Time

- Every timestamp on this wire is **RFC 3339 with an explicit offset**, and **SHOULD** be UTC:
  `2026-08-29T09:00:00.000Z`.
- Naive local datetimes (`2026-06-22T13:14:56.821871`) are **REJECTED**. Inside a batch that is a
  *per-event* rejection — `200` with `{"code": "invalid_timestamp"}` in `rejected[]` (§3.1) — never
  a `400` for the whole batch. A `400` is reserved for a malformed envelope. The current event log
  emits exactly the naive form; it must change. A naive timestamp parsed on our side becomes wrong
  by the cluster's UTC offset and silently reorders the Activity feed.
- `occurredAt` means *when the thing happened on your side*, never when you sent it. Retries
  **MUST** preserve the original `occurredAt`.
- Durations are integer milliseconds (`durationMs`), never floats, never strings.

### 0.3 Encoding

- JSON, UTF-8, `Content-Type: application/json`.
- Field names are **lowerCamelCase** on the wire in both directions. Database columns are
  `snake_case`; the manifest (§2.10) does the translation once so you never have to.
- Unknown fields in a request body are ignored, never rejected — this is what lets us add fields
  without a version bump (§6).
- `null` and *absent* are equivalent for optional fields. Do not rely on a distinction.
- Binary payloads are base64 in JSON, or `multipart/form-data` where noted.

---

# (a) Responsibilities, trust boundary, and authentication

## 1.1 Split of responsibilities

**ArkAgent owns, and you MUST NOT write:**

- The agent's identity, name, role, harness choice, plan tier.
- The brief: `instructions` and `rules`.
- Every field of `agents.settings` (§2.3) — tone, autonomy, approval thresholds, working hours,
  model preference, tool switches, memory policy, credit caps.
- The desired set of skills, context items, schedules, and channels.
- All presentation: labels, translated strings, colours, ordering in the UI.
- Billing state: plans, subscriptions, invoices, credit allowances.

**You own, and ArkAgent MUST NOT write:**

- Whether the runtime is actually up, and its health.
- What the agent actually did: runs, steps, tool calls, outputs.
- Resource consumption as measured at the runtime: tokens, wall time, credits.
- The physical placement of the workload: container id, region, image tag.

**Shared, with a defined arbiter:**

| Field | Arbiter | Rule |
|---|---|---|
| `agents.status` | split, runtime wins | ArkAgent owns `draft`, `scheduled`, `needs_review` outright. **You** own `provisioning`, `deploying`, `working`, `paused`, `error`, `terminated` — but ArkAgent also writes those three optimistically on an operator action it initiated (pause/resume/terminate: `lib/services/agents.ts:setLifecycle`) and on a `404`/provisioning failure of its own outbound call (§1.3). Those writes are a placeholder: your next `agent.status` for the same agent supersedes them under the last-writer-wins rule of §3.2, because it carries a later `occurredAt`. You **MUST NOT** emit the three ArkAgent-owned values. |
| `agents.credits_used` | you | ArkAgent only ever increments it from your `agent.usage` events. |
| skill / context / schedule **desired** state | ArkAgent | You read it. |
| skill / context / schedule **actual** state | you | You report it. ArkAgent renders the difference as "pending". |

## 1.2 The trust boundary

The boundary runs between the two services, and it is crossed by *data that a third party
influenced*. Three concrete rules follow, and they are not optional:

1. **Content produced by an agent is untrusted input to ArkAgent.** Message bodies, activity
   text, run-step details, error strings, and summaries all originate from an LLM that may have
   read an attacker's web page. ArkAgent stores them, escapes them, and never executes them. You
   **MUST NOT** put control instructions for ArkAgent inside them, and **MUST NOT** assume
   ArkAgent will act on them.

2. **Skill bodies are data, not instructions, until the agent loads them.** A `SKILL.md` is prose
   the model obeys. It is authored by a stranger on the internet. You **MUST NOT** let a skill's
   `description` field, its frontmatter, or its body change your service's own behaviour —
   scheduling, credentials, egress policy, or which other skills load. See §6.2.

3. **The signature is the boundary.** An unsigned or badly signed inbound request is not a
   degraded request, it is a hostile one. Reject it with `401` and do not parse the body.

## 1.3 Outbound authentication (ArkAgent → your service)

There are **three** credentials in this integration, in two directions, and conflating them is a
tenancy bug rather than a convenience:

| Credential | Direction | Minted by | Used on | Env / storage |
|---|---|---|---|---|
| `ARKAGENT_RUNTIME_TOKEN` | AA → RT | **you** | every call in §1.6 and §5 | ArkAgent env `AGENT_MANAGER_API_KEY` |
| ingest HMAC secret | RT → AA | ArkAgent | `POST /api/webhooks/agent-manager/batch` (§1.4) | ArkAgent env `AGENT_MANAGER_WEBHOOK_SECRET`; handed to you in the §1.6 block |
| per-agent **manifest token** | RT → AA | ArkAgent | `GET /api/runtime/**` (§2.0, skill bundles, context content) | minted per instance, handed to you in the §1.6 block as `manifest_token` |

**Do not reuse `ARKAGENT_RUNTIME_TOKEN` to read the manifest.** It is minted on your side, so
accepting it on ours would mean any holder of a runtime token could read *any* tenant's system
prompt, uploaded customer documents, and skill bundles. The manifest token is minted by ArkAgent,
is **bound to exactly one `agentId`**, and a request for a different agent's manifest, bundle, or
context returns `403 agent_scope_mismatch` even when the token is otherwise valid. It is rotated by
the same `PUT /api/instances/{id}/arkagent` call that rotates the HMAC secret (§6.4).

Every call ArkAgent makes carries:

```http
Authorization: Bearer <ARKAGENT_RUNTIME_TOKEN>
Content-Type: application/json
Accept: application/json
X-ArkAgent-Request-Id: <uuid v4, unique per attempt>
X-ArkAgent-Protocol: v2
User-Agent: ArkAgent/2.0 (+https://arkagent.com)
```

Requirements on the token:

- It **MUST** be a **service credential**: server-to-server, no user context, no expiry, revocable
  and rotatable independently of any human account.
- It **MUST NOT** be a user session token. **This is a live problem.** Every example credential we
  have been given decodes to `base64("<userId>:<unixExpiry>").<hmac>` with a lifetime of roughly
  24 hours. If that is the only credential kind available, the integration acquires a daily outage
  clock and ArkAgent must build a token-refresh subsystem that nobody has scoped. **CONFIRM-1.**
- Rotation **MUST** support an overlap window: two valid tokens at once for at least 24 hours, so
  a rotation is not an outage.
- `X-ArkAgent-Request-Id` is for your logs and for our support tickets. It is **not** an
  idempotency key — see §1.4 for the one place ArkAgent does send idempotent writes.

Your responses:

| Status | Meaning to ArkAgent | ArkAgent's behaviour |
|---|---|---|
| `2xx` | success | proceed |
| `400` | our request was malformed | surfaced to the operator, **not retried** |
| `401` / `403` | credential problem | alarm; feature marked unavailable; **not retried** |
| `404` | unknown instance | the agent is marked `error`, `last_error = "runtime_instance_missing"`. This is one of the optimistic ArkAgent writes into your half of `agents.status` described in §1.1; your next `agent.status` supersedes it. |
| `405` / `501` | endpoint not implemented on this cluster | the capability is **downgraded to `unsupported`** for the process lifetime and the UI renders "not available on this runtime yet" instead of an error. This is the mechanism that lets you ship §2–§3 incrementally. |
| `409` | conflicting state | surfaced, not retried |
| `429` | rate limited | honours `Retry-After`, then exponential backoff |
| `5xx` / timeout | your problem | 3 retries, 1s/4s/16s, then the operation is recorded as failed |

Error bodies **SHOULD** be `{ "error": { "code": "snake_case_code", "message": "human text" } }`.
`message` is for our logs; ArkAgent never renders it to an end user (§6.2).

## 1.4 Inbound authentication (your service → ArkAgent) — the exact signing algorithm

Inbound events go to a single endpoint (§3.1) and are HMAC-signed. What follows is the algorithm
as implemented today, byte for byte, followed by the v2 extension you **MUST** also implement.

### v1 — what ArkAgent verifies today

```
signature = lowercase_hex( HMAC_SHA256( key = AGENT_MANAGER_WEBHOOK_SECRET,
                                        message = <the exact raw request body bytes> ) )
header:  x-arkagent-signature: <signature>
   or:   x-arkagent-signature: sha256=<signature>
```

Verification, precisely:

1. Read the request body as **raw text, before any JSON parsing**. The bytes signed and the bytes
   sent must be identical — no re-serialisation, no key reordering, no whitespace normalisation,
   no pretty-printing between signing and sending.
2. Strip a leading `sha256=` if present, then trim surrounding whitespace.
3. **Reject anything that is not exactly 64 hex characters** (`/^[0-9a-fA-F]{64}$/`) before
   decoding. `Buffer.from(s, "hex")` stops at the first invalid pair and returns a *short* buffer
   rather than throwing, so `<valid-64-hex>zz` decodes to the same 32 bytes and verifies. Today's
   implementation (`lib/agent-manager/webhook.ts`) omits this check; it is a hardening fix, not a
   forgery, but the shape check must land before v2 ships.
4. Recompute `HMAC-SHA256(secret, rawBody)` and hex-encode.
5. Hex-decode both the provided and the expected value into byte buffers.
6. If the buffers differ in length → fail immediately. Otherwise compare with a **constant-time**
   comparison.
7. A missing secret **or** a missing header → fail.

Failure is `401 {"error":"Invalid signature"}` and the body is never parsed. The secret is a shared
symmetric secret, provisioned out of band, ≥32 bytes of entropy, hex or base64 encoded — treat it
as an opaque string and sign the exact bytes you were given.

A note on step 5 that has bitten implementers: because the comparison is done on *decoded bytes*,
an uppercase hex signature also verifies. Emit lowercase anyway.

**Which secret verifies a given request.** The endpoint is single and the routing key
(`externalAgentId`) lives *inside* the body, which cannot be trusted before the signature is
checked — so a per-instance secret is unroutable unless it is named in a header. Therefore:

- The secret is **deployment-wide by default** (`AGENT_MANAGER_WEBHOOK_SECRET`), which is what is
  implemented today.
- If ArkAgent issues you a per-instance secret through §1.6, it also issues a `key_id`, and you
  **MUST** send `x-arkagent-key-id: <key_id>` on every batch. The receiver selects the secret by
  that header alone, before parsing anything. A `key_id` it does not know is `401`, not a fallback
  to the deployment-wide secret.
- During a rotation both the old and new `key_id` are accepted (§6.4). This is why rotation is a
  new `key_id`, never the same id with new bytes.

### v2 — the extension you MUST implement

v1 has no replay protection: a captured request body plus its signature is valid forever. v2 adds
a timestamp to the signing base.

```
timestamp = <unix seconds, integer, as a decimal string>
signingBase = "v2." + timestamp + "." + rawBody          (ASCII concatenation, no separators beyond the dots)
signature   = lowercase_hex( HMAC_SHA256(secret, signingBase) )

headers:
  x-arkagent-timestamp: 1787040000
  x-arkagent-signature: v2=<signature>
```

- ArkAgent accepts `v2=` and, for one release only, the bare/`sha256=` v1 form. **New
  implementations MUST send v2.** v1 acceptance is removed in protocol `v3`.
- ArkAgent rejects a v2 request whose `x-arkagent-timestamp` is more than **300 seconds** from the
  receiver's clock, in either direction, with `401 signature_timestamp_skew`. Keep your clock in
  NTP sync.
- On a retry of a previously-signed batch you **MUST re-sign with a fresh timestamp** — the body
  stays byte-identical, the signature does not. Idempotency is handled by `eventId` (§3.2), not by
  signature reuse.

### Worked example (verify your implementation against this)

These are real values. If your implementation does not reproduce them exactly, it is wrong.

```
secret      : test-secret
timestamp   : 1787040000
rawBody     : {"deliveryId":"d1","events":[]}
signingBase : v2.1787040000.{"deliveryId":"d1","events":[]}

v2 signature: 398b32b858ae52403b9c07501ae22c5028e56e281d8d8bc89b2a826c32b7bfbb
v1 signature: 2336ed4a3e326bd1ca7aef587a48b45fa7668369a4824197fe9df97654f2e43f   (HMAC over rawBody alone)
```

Sent as:

```http
x-arkagent-timestamp: 1787040000
x-arkagent-signature: v2=398b32b858ae52403b9c07501ae22c5028e56e281d8d8bc89b2a826c32b7bfbb
```

Reference implementation of the whole scheme, in Node. Note that it **branches on the prefix**: a
verifier that strips the prefix and then always computes the v2 base cannot verify a v1 signature
at all, and one that silently falls back to v1 when v2 fails re-opens the replay hole v2 closed.

```js
const { createHmac, timingSafeEqual } = require("node:crypto");

const HEX64 = /^[0-9a-fA-F]{64}$/;

const signV2 = (secret, rawBody, ts) =>
  createHmac("sha256", secret).update(`v2.${ts}.${rawBody}`).digest("hex");
const signV1 = (secret, rawBody) =>
  createHmac("sha256", secret).update(rawBody).digest("hex");

function equalHex(provided, expected) {
  if (!HEX64.test(provided)) return false;          // step 3 — BEFORE decoding
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `acceptV1` is a deployment flag that goes false at protocol v3. */
function verify(secret, rawBody, header, timestampHeader, acceptV1) {
  if (!secret || !header) return false;
  const h = header.trim();

  if (h.startsWith("v2=")) {
    const ts = Number(timestampHeader);
    if (!Number.isInteger(ts)) return false;                     // missing / garbage timestamp
    if (Math.abs(Date.now() / 1000 - ts) > 300) return false;    // skew, §1.4
    return equalHex(h.slice(3), signV2(secret, rawBody, String(ts)));
  }

  // Bare hex or `sha256=` — v1 only, and only while the flag is on.
  if (!acceptV1) return false;
  return equalHex(h.replace(/^sha256=/, ""), signV1(secret, rawBody));
}
```

The skew check lives *inside* verification. A v2 request that verifies but is stale is still
`401`, reported as `signature_timestamp_skew` rather than `Invalid signature`, so an operator can
tell a clock problem from a secret problem without a second deploy.

*Rejected alternative:* mutual TLS. It is stronger, but it puts certificate rotation into a
deployment pipeline neither team controls today; the shared secret is already implemented and
verified on our side.

## 1.5 What ArkAgent does NOT authenticate

ArkAgent does **not** verify the source IP, does **not** require a static egress range, and does
**not** inspect TLS client certificates. The HMAC is the whole authentication story. Consequently:
if the secret leaks, every event for every agent in the deployment is forgeable. Rotate on the
schedule in §6.4.

## 1.6 Registration — how you learn where to send, and what to sign with

Registration happens at provisioning. ArkAgent extends its provisioning call with an
`arkagent` block, and you **MUST** persist it against the instance:

```http
POST /api/instances
Authorization: Bearer <ARKAGENT_RUNTIME_TOKEN>
```

```jsonc
{
  "name": "Nova",
  "category_id": 2,                                  // see §4.1
  "target_user_id": "9c1e…",                          // see CONFIRM-2
  "arkagent": {
    "protocol": "v2",
    "external_ref": "a7f3c9e2-1d54-4b0a-9e77-2f9c1b8d4a61",   // agents.id — echo on EVERY event
    "workspace_ref": "3b21d0aa-77c4-4a1e-9d2b-5e6f0c7a8b19",
    "manifest_url": "https://app.arkagent.com/api/runtime/agents/a7f3c9e2-…/manifest",
    "ingest_url":   "https://app.arkagent.com/api/webhooks/agent-manager/batch",
    "signature_header": "x-arkagent-signature",
    "timestamp_header": "x-arkagent-timestamp",
    "algorithm": "hmac-sha256-hex",
    "secret": "<32+ bytes, opaque>",                             // ingest HMAC secret
    "key_id": "k_2026_08_a",                                     // echo as x-arkagent-key-id (§1.4)
    "manifest_token": "<opaque bearer, bound to this agentId>",  // reads only, §1.3/§2.0
    "events": ["agent.status","agent.heartbeat","agent.activity","agent.message",
               "agent.metric","agent.improvement","agent.usage","agent.run_started",
               "agent.run_step","agent.tool_call","agent.run_finished","agent.schedule_run",
               "agent.skill_state","agent.context_state","agent.health","agent.error"]
  }
}
```

```jsonc
// 201 Created — the response ArkAgent needs. Fields beyond these are ignored.
{
  "instance_id": "6f0f0f6e-9b2a-4a3d-8f1c-0d2e3a4b5c6d",   // -> agents.agent_manager_id
  "container_name": "ocm-nova-6f0f0f",                     // -> agents.vm_id
  "region": "cn-shanghai-1",                               // -> agents.vm_region
  "status": "provisioning",                                // §1.1 subset only
  "protocol": "v2",
  "capabilities": ["chat","sessions","runs","steps","schedules","skills","context","health"]
}
```

Two more endpoints are **REQUIRED** so the binding can be repaired without re-provisioning:

```
PUT    /api/instances/{instanceId}/arkagent      — rotate ingest_url / secret / event list
GET    /api/instances/{instanceId}/arkagent      — read back the current binding (drift check)
```

`capabilities[]` is load-bearing. It is how ArkAgent greys out UI instead of firing calls that
404, and it is how you ship this contract in stages. An absent capability is treated exactly like
a `501` (§1.3).

**Do not echo the `arkagent` block back in your `201`.** Many APIs return the request they were
given; this one must not, because ArkAgent persists your whole provisioning response verbatim into
`agent_manager_config.config`, and that column is served to every workspace member (§2.9). An
echoed `secret` or `manifest_token` would be published to the tenant. ArkAgent also strips
`arkagent`, `secret`, `token`, `key`, and `password`-shaped keys from the response before writing
that column — belt and braces, since a leak here is a leak of *our* signing secret, not yours.

---

# (b) THE READ CONTRACT — everything needed to configure and run an agent

## 2.0 Two access paths, one payload

There are two supported ways to read an agent's configuration. They return **the same data**, and
the JSON path is generated from the SQL path, so they cannot drift.

**Path A — HTTP manifest (default; use this unless told otherwise).**

```http
GET /api/runtime/agents/{agentId}/manifest
Authorization: Bearer <manifest_token for this agentId>
If-None-Match: "<etag from the previous fetch>"
```

- `200` with the full `AgentManifest` (§2.10), plus `ETag` and `X-ArkAgent-Manifest-Revision`.
- `304 Not Modified` when the ETag matches — poll cheaply.
- `404` unknown agent · `410 Gone` agent deleted (stop the workload, see §5.7) ·
  `403 agent_scope_mismatch` when the token is valid but bound to a different agent.
- Auth: the **per-agent manifest token** of §1.3/§1.6 — *not* `ARKAGENT_RUNTIME_TOKEN`, which is
  minted on your side. Manifests are **not** reachable with a user session. The same token and the
  same scope check gate `/api/runtime/skills/{id}/bundle` and `/api/runtime/context/{id}/content`:
  a bundle or context item is served only to a token bound to an agent that actually has a row for
  it. ArkAgent has **no route middleware** (`lib/api.ts`) — each `app/api/runtime/**` handler
  performs this check itself, and a handler that forgets it is a cross-tenant read of customer
  documents.
- `Cache-Control: no-store` on all three, and no `X-Robots`/CDN-cacheable headers: these responses
  carry the system prompt and uploaded customer files.

**Path B — direct Postgres read.** For a runtime co-located with the database, ArkAgent provisions
a role `arkagent_runtime`. The DDL below is normative for that path and is also the definition of
meaning for Path A. Two constraints on the grant, both non-negotiable:

- The grant is on **per-agent security-barrier views**, never on the base tables. A bare
  `GRANT SELECT ON agents` is workspace-blind and hands the reader every tenant's brief, which
  directly contradicts §6.2 rule 9. Row-level security keyed on the connecting role's
  `current_setting('arkagent.agent_id')` is the only shape that survives review.
- `channels.config` is **excluded from the grant entirely** (§2.8): it holds channel credentials in
  plaintext today, and the mask that protects them lives in `lib/serializers.ts`, i.e. in the
  application, not the database. A SQL reader bypasses it.

Until both exist, **Path B is not offered** and Path A is the only supported route.

> *Rejected alternative:* making Path B the only path. It couples your deploy schedule to our
> migrations. The manifest is a versioned projection; the tables are not a public API.

**You MUST poll or subscribe, not cache indefinitely.** ArkAgent pushes a config change to you
(§5.2) but that push is best-effort. Re-read the manifest at least every **60 seconds** for a
running agent, and always before starting a run.

## 2.1 Enumerated types

Every enum below is a Postgres `ENUM`. Values are **added, never renamed or removed** (§6.1).
Treat an unknown value as the safest neighbour, do not crash.

```sql
CREATE TYPE engine AS ENUM ('openclaw', 'hermes', 'codex', 'deepseek');
-- The live type is ('openclaw','hermes') — lib/db/schema.ts:39. v2 extends it with:
--   ALTER TYPE "engine" ADD VALUE IF NOT EXISTS 'codex';
--   ALTER TYPE "engine" ADD VALUE IF NOT EXISTS 'deepseek';
-- These two statements MUST ship in a migration file of their own, ahead of any file that
-- USES the new values (a default, a CHECK, a seed, agent_skills.harness). Postgres forbids
-- using an enum value in the transaction that added it, and drizzle-kit runs one file per
-- transaction — this is the single most likely way the v2 migration fails in CI. Same rule,
-- same reason, as docs/SKILL_REPOSITORY.md §1.1. `IF NOT EXISTS` makes the file re-runnable.
-- `engine` is also stored on agent_roles.default_engine; extending it is safe, renaming is not.
-- Display labels, for reference only — you MUST NOT emit them (§6.2):
--   openclaw -> "OpenClaw" · hermes -> "Hermes"
--   codex    -> "Codex Harness" · deepseek -> "DeepSeek Harness"

CREATE TYPE agent_status AS ENUM (
  'draft',        -- ArkAgent-owned. Being configured in the hire wizard. Never provisioned.
  'provisioning', -- runtime-owned. Container being created.
  'deploying',    -- runtime-owned. Container up, agent code starting.
  'working',      -- runtime-owned. Healthy and able to act.
  'scheduled',    -- ArkAgent-owned. Outside working hours; will wake on schedule.
  'needs_review', -- ArkAgent-owned. Waiting on a human decision.
  'paused',       -- runtime-owned. Deliberately stopped.
  'error',        -- runtime-owned. Broken; `last_error` explains.
  'terminated'    -- runtime-owned. Torn down for good.
);

CREATE TYPE task_status   AS ENUM ('queued','in_progress','done','blocked');

CREATE TYPE activity_tag  AS ENUM ('meeting','draft','research','review','outreach','learning',
                                   'resolved','escalated','summary','published','brief',
                                   'calendar','docs','system');

CREATE TYPE channel_type  AS ENUM ('telegram','whatsapp','wechat','line','slack','email','web',
                                   'feishu','dingtalk','wecom');
-- v2 adds the last three. They already exist upstream and previously caused a 500 on ingest,
-- because the value was cast straight into this enum without validation.

CREATE TYPE channel_status AS ENUM ('connected','pending','disconnected','error');
CREATE TYPE message_sender AS ENUM ('user','agent','system');
CREATE TYPE message_status AS ENUM ('queued','sent','delivered','failed');
CREATE TYPE usage_kind     AS ENUM ('message','task','research','compute','adjustment');
CREATE TYPE plan_tier      AS ENUM ('associate','professional','director');

-- v2 additions, all runtime-facing:
-- RECONCILED (see docs/TASK_PLAN_V2.md §1, conflict C1). Both documents conceded to the other
-- and crossed in flight: this contract renamed to `..._status` while SKILL_REPOSITORY §1.4a
-- renamed to `..._state`. The name is **`agent_skill_state`**, column **`state`**, for three
-- reasons: docs/SKILL_REPOSITORY.md §1.4 owns the table (§2.5 below says so); §3.4's event is
-- `agent.skill_state` and its field is `state`, so one vocabulary runs end to end with no
-- mapping layer to be wrong in; and `agent_context_items.state` already spells the identical
-- concept the same way. The six values are defined HERE because SKILL_REPOSITORY uses the enum
-- but never lists its members.
CREATE TYPE agent_skill_state  AS ENUM ('pending','installing','installed','failed','removing','removed');
CREATE TYPE context_item_kind   AS ENUM ('file','text','url');
-- `awaiting_upload` is written by the template generator for a `file_request` context row that
-- has no bytes yet (docs/AGENT_TEMPLATE_GENERATOR.md §3.6, materialize step 5). It is NOT a
-- runtime state: you never write it and you MUST skip such rows rather than fetch a null
-- content_url. It reaches you only because the manifest projects every row.
CREATE TYPE context_item_state  AS ENUM ('awaiting_upload','pending','indexing','indexed','failed','removed');
CREATE TYPE schedule_kind       AS ENUM ('cron','interval','once');
CREATE TYPE schedule_overlap    AS ENUM ('skip','queue','parallel');
CREATE TYPE run_trigger         AS ENUM ('chat','schedule','channel','api','self','system');
CREATE TYPE run_status          AS ENUM ('queued','running','succeeded','failed','cancelled','timeout');
CREATE TYPE run_step_phase      AS ENUM ('thinking','tool_call','tool_result','message','final_answer');
```

## 2.2 `agents` — the agent itself

```sql
CREATE TABLE agents (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_id      uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               varchar(80)  NOT NULL,
  role_id            varchar(40)  NOT NULL REFERENCES agent_roles(id),
  engine             engine       NOT NULL DEFAULT 'openclaw',
  plan_tier          plan_tier    NOT NULL DEFAULT 'associate',
  status             agent_status NOT NULL DEFAULT 'draft',
  instructions       text         NOT NULL DEFAULT '',
  rules              text         NOT NULL DEFAULT '',
  hue                varchar(16),
  credits_used       integer      NOT NULL DEFAULT 0,
  settings           jsonb        NOT NULL DEFAULT '{}',
  agent_manager_id   varchar(120),
  vm_id              varchar(80),
  vm_region          varchar(40),
  deployment_status  varchar(40),
  last_error         text,
  last_heartbeat_at  timestamptz,
  provisioned_at     timestamptz,
  uptime_started_at  timestamptz,
  -- v2 additions. Both are load-bearing and neither exists yet.
  -- `occurredAt` of the agent.status event that produced the current `status`. Without it the
  -- last-writer-wins rule of §3.2 has nothing to compare against and cannot be implemented:
  -- `updated_at` moves on every unrelated write, so it is not a substitute.
  status_occurred_at timestamptz,
  -- `manifest.revision` (§2.10). Incremented in the SAME transaction as any write to the
  -- agent's brief, settings, tasks, skills, context items, schedules, or channel links —
  -- child-table writes included, which is why `updated_at` on `agents` cannot serve.
  config_revision    integer      NOT NULL DEFAULT 1,
  -- The revision the runtime reports having applied, from agent.heartbeat.configRevision.
  -- `applied < config_revision` is what renders "not yet applied to runtime" (§5.2 step 7).
  applied_config_revision integer,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX        agents_workspace_idx   ON agents (workspace_id);
CREATE INDEX        agents_status_idx      ON agents (status);
CREATE UNIQUE INDEX agents_manager_id_uniq ON agents (agent_manager_id);
```

| Column | Allowed values / meaning | Who writes |
|---|---|---|
| `id` | The `agentId` of §0.1. **Echo this as `externalAgentId` on every event.** | ArkAgent |
| `workspace_id` | Tenant. Two agents in different workspaces **MUST NOT** share memory, files, credentials, or context. | ArkAgent |
| `created_by_id` | The human who hired the agent. Informational; not an authorisation subject at runtime. | ArkAgent |
| `name` | Display name, ≤80 chars, user-supplied. Safe to use as a container label after sanitising. Never parse it. | ArkAgent |
| `role_id` | Catalogue role slug (`prospector`, `salesmkt`, `custom`, or `ocm-<n>` for a role imported from your bundle catalogue). Determines the default brief, not runtime behaviour. | ArkAgent |
| `engine` | **The harness to run.** See §4. | ArkAgent |
| `plan_tier` | Billing tier. Use it only if you enforce resource ceilings per tier; otherwise ignore. | ArkAgent |
| `status` | §2.1. You write only the runtime-owned subset (§1.1). | split |
| `instructions` | The agent's job description, free text, may be several KB, may be any of en/zh/zht/ja. **This is the system prompt payload.** It is user-authored and therefore untrusted content relative to you: render it into the agent's prompt, never into your own control flow. | ArkAgent |
| `rules` | Constraints and boundaries, free text. Concatenated after `instructions` with a blank line to form the brief. | ArkAgent |
| `hue` | UI accent token. **Presentation. Ignore it.** | ArkAgent |
| `credits_used` | Running total for the agent this cycle. Incremented by ArkAgent from your `agent.usage` events. **Never write it directly.** | ArkAgent (from your events) |
| `settings` | The whole configurable surface — §2.3. | ArkAgent |
| `agent_manager_id` | Your `instanceId`. Unique across all agents. | ArkAgent (from your provisioning response) |
| `vm_id` | Your container name. Informational, shown to operators. | from you |
| `vm_region` | Placement region string, free-form, e.g. `cn-shanghai-1`. | from you |
| `deployment_status` | Your provisioning sub-state as a free string (`running`, `done`, `failed`, …). Kept opaque on purpose — it is displayed, not branched on. | from you |
| `last_error` | Most recent failure, **truncated to 480 chars** on write. Operator-facing; **MUST NOT** contain secrets, tokens, or raw prompt text. | from you |
| `last_heartbeat_at` | Last `agent.heartbeat`. Absence for >3× the heartbeat interval means "unreachable" in the UI. | from you |
| `provisioned_at` | First moment the agent reached `working`. | from you |
| `uptime_started_at` | Start of the current continuous uptime; reset on every restart. | from you |

## 2.3 `agents.settings` — the JSONB policy document, in full

Stored as a partial object; ArkAgent merges it over defaults on read. **The manifest always
contains the merged, complete object** — you never have to implement the merge. Direct-SQL readers
**MUST** apply the defaults in the table below to any absent key.

```ts
interface AgentSettings {
  // ---- Behaviour ----
  tone: "professional" | "friendly" | "concise" | "formal" | "playful";
  responseLanguage: "auto" | "en" | "zh" | "zht" | "ja";
  timezone: string;                 // IANA, e.g. "Asia/Singapore". NOT format-validated — see below.

  // ---- Autonomy & approvals ----
  autonomy: "suggest" | "ask" | "auto";
  approvalAmount: number;           // whole USD, 0 .. 1_000_000
  approveExternalSends: boolean;
  dailyActionLimit: number;         // 0 .. 100_000; 0 = unlimited

  // ---- Working schedule ----
  alwaysOn: boolean;
  workStart: string;                // "HH:MM", 24h, in `timezone`. NOT format-validated.
  workEnd: string;                  // "HH:MM"
  workDays: number[];               // 0=Sun … 6=Sat
  heartbeatMinutes: number;         // 1..1440

  // ---- Escalation & notification ----
  escalateTo: string;               // email address, may be ""
  notifyNeedsReview: boolean;
  notifyErrors: boolean;
  dailyDigest: boolean;
  digestTime: string;               // "HH:MM"

  // ---- Model ----
  model: string;                    // "auto" or "<provider>/<model>", <= 80 chars
  temperature: number;              // 0..2 (lib/validation.ts; NOT 0..1 — clamp per provider)
  maxTokens: number;                // 256..200000
  reasoningEffort: "low" | "medium" | "high";

  // ---- Memory & knowledge ----
  memoryEnabled: boolean;
  retentionDays: number;            // 1..3650. See the table: 0 is NOT writable through the API.
  knowledgeUrls: string[];          // <= 50 entries, <= 500 chars each. NOT URL-validated.

  // ---- Limits ----
  monthlyCreditCap: number;         // 0 = use the plan allowance

  // ---- Skills & local execution ----
  skills: string[];                 // legacy slugs; agent_skills (§2.5) supersedes this
  tools: { shell: boolean; files: boolean; browser: boolean; docker: boolean; code: boolean };

  // ---- Self-improvement ----
  selfImprove: boolean;
  autoCreateSkills: boolean;
}
```

| Key | Default | What the runtime MUST do with it |
|---|---|---|
| `tone` | `professional` | Prompt-level style directive. |
| `responseLanguage` | `auto` | `auto` = reply in the language the human wrote in. Otherwise force that language. |
| `timezone` | `Asia/Singapore` | **Authoritative for every local-time decision**: working hours, digest time, cron evaluation (§2.7). Never substitute the host clock's zone. Stored as a bare `varchar(64)` and **not** currently checked against the IANA database (`lib/validation.ts` — a `.refine(isValidTimeZone)` using the existing `lib/schedule/cron.ts` helper is required before launch, no new dependency). Until then: an unrecognised zone **MUST** degrade to UTC and raise `agent.error` `code: "invalid_timezone"`, never crash the scheduler. |
| `autonomy` | `ask` | `suggest` = draft only, never take an external action. `ask` = pause and escalate before any consequential step. `auto` = act within the limits below. **Enforcement is yours; ArkAgent cannot enforce it.** |
| `approvalAmount` | `300` | Whole **USD**, regardless of the operator's display currency. Any commitment ≥ this needs human approval. `0` = always ask. |
| `approveExternalSends` | `false` | `true` ⇒ every outbound message to a non-ArkAgent destination requires approval, whatever `autonomy` says. |
| `dailyActionLimit` | `0` | Max consequential actions per calendar day in `timezone`. `0` = unlimited, ceiling 100,000. On breach: stop taking consequential actions, emit `agent.error` `code: "daily_action_limit"` and an `agent.improvement` describing what was blocked. **Do not emit `needs_review`** — it is ArkAgent-owned (§1.1) and no ingest path sets it; ArkAgent decides whether the improvement warrants that status. |
| `alwaysOn` | `true` | `true` ⇒ ignore `workStart`/`workEnd`/`workDays`. |
| `workStart` / `workEnd` | `09:00` / `18:00` | Local window in `timezone`. `workEnd < workStart` means the window crosses midnight. |
| `workDays` | `[1,2,3,4,5]` | Active weekdays. Empty array = no scheduled work at all. |
| `heartbeatMinutes` | `15` | Emit `agent.heartbeat` at least this often while not `terminated`. |
| `escalateTo` | `""` | Email for escalations. Empty ⇒ escalate in-app only (raise `agent.improvement`), **never invent a recipient**. Stored as `varchar(320)` with **no email-format validation**, so treat it as an opaque string; you never send to it anyway (§5.5 step 5). |
| `notifyNeedsReview` / `notifyErrors` / `dailyDigest` / `digestTime` | `true`/`true`/`true`/`18:00` | **ArkAgent-side notification policy. Ignore them.** Listed only so you do not mistake them for runtime flags. |
| `model` | `auto` | `auto` ⇒ pick per your own routing. Otherwise honour the id, and if you cannot, emit `agent.error` `code: "model_unavailable"` and fall back — **do not silently substitute** (today this field is stored and ignored, which is exactly the failure to avoid). |
| `temperature` | `0.4` | Sampling temperature, accepted range **0..2** (`lib/validation.ts`), not 0..1. Clamp to your provider's range rather than rejecting. |
| `maxTokens` | `4096` | Max completion tokens per model call. |
| `reasoningEffort` | `medium` | Maps to extended-thinking budget. `low`/`medium`/`high`. Harnesses without the concept ignore it. |
| `memoryEnabled` | `true` | `false` ⇒ no cross-session memory is written **at all**. |
| `retentionDays` | `90` | Delete runtime-side memory, transcripts, and scratch files older than this. Accepted range is **1..3650** (`lib/validation.ts` uses `.min(1)`), so `0` **cannot be written through the API**; a `0` you read is a legacy or hand-edited row and means "keep forever". There is deliberately no UI affordance for "keep forever" — do not add one on your side. This is a data-protection commitment ArkAgent makes to the customer; you are the only party who can honour it. |
| `knowledgeUrls` | `[]` | URLs to ingest as background knowledge. Superseded by `agent_context_items` (§2.6) with `kind='url'`; both are populated during migration, **de-duplicate by URL**. Stored as bare strings with **no URL parsing, no scheme check and no private-range check** — identical SSRF exposure to `context.sourceUrl`, and the same rule applies: fetch only from the agent's egress sandbox, https only, and refuse loopback/link-local/RFC1918 destinations. ArkAgent must add `z.url()` plus a private-range reject here; until it does, you are the only control. |
| `monthlyCreditCap` | `0` | Hard per-agent ceiling on credits per billing cycle, 0..100,000,000. `0` ⇒ no per-agent cap; the workspace pool in `manifest.limits` applies instead (§2.10). On breach: stop work, emit `agent.error` `code: "credit_cap_reached"`. |
| `skills` | `["web_research","email","summarization"]` | **Legacy.** Coarse capability slugs from the v1 UI. If `agent_skills` (§2.5) has any row for the agent, ignore this field entirely. |
| `tools.shell` | `false` | Allow shell command execution. |
| `tools.files` | `true` | Allow reads/writes inside the agent's own workspace only. |
| `tools.browser` | `true` | Allow web browsing / fetching. |
| `tools.docker` | `false` | Allow container management. |
| `tools.code` | `false` | Allow arbitrary code execution. |
| `selfImprove` | `true` | May propose improvements to its own brief — as `agent.improvement` events, which a human approves. **You MUST NOT self-edit `instructions` or `rules`.** |
| `autoCreateSkills` | `true` | May author new skills for itself. Report each as `agent.skill_state` with `source: "self"`. |

**The `tools` map is a security boundary, not a hint.** A `false` here means the capability is not
merely unused, it is not present in the agent's tool list and not reachable through any skill. A
skill whose `requires.bins` needs a disabled tool **MUST NOT** be installed — report it
`state: "failed"` with `error_code: "tool_disabled"`.

## 2.4 `agent_tasks` — the standing task list

```sql
CREATE TABLE agent_tasks (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid         NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  text         text         NOT NULL,
  status       task_status  NOT NULL DEFAULT 'queued',
  meta         varchar(120),
  sort_order   integer      NOT NULL DEFAULT 0,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX agent_tasks_agent_idx ON agent_tasks (agent_id);
```

| Column | Meaning |
|---|---|
| `text` | One task, user-authored, free text. |
| `status` | `queued` → `in_progress` → `done`, or `blocked`. **You may advance this** via `agent.activity` with `code: "task.status"` (§3.3); you **MUST NOT** create or delete tasks. |
| `meta` | Short operator note. Presentation. |
| `sort_order` | Ascending display and execution order. |
| `completed_at` | Set when `status` becomes `done`. |

**Retiring `tasks[0]`.** In v1 the agent's entire brief was smuggled as element 0 of the
provisioning `tasks[]` array, and three separate read paths did `.slice(1)` to hide it again. In
v2 the brief arrives as `manifest.brief` and `tasks[]` contains **only real user tasks, all of
them visible**. Do not reintroduce a positional convention.

## 2.5 `agent_skills` — the desired skill set

> **This table is defined by `docs/SKILL_REPOSITORY.md` §1.4, not here.** An earlier draft of this
> contract invented a parallel `agent_skills` with denormalised identity columns
> (`source`/`owner_handle`/`slug`) and a `safety_score`/`safety_tier` pair. Neither exists; the
> real scale is `skills.risk_score` / `skills.risk_level` (§5.3 there). Shipping both definitions would have produced two
> incompatible migrations for one table name. What follows is the real shape, and the *wire*
> contract is §2.10's `manifest.skills[]` — which is a **join projection** of `agent_skills` onto
> `skills`, and is the only thing you need to implement against.

```sql
-- Abridged to the columns a runtime reads. Full DDL: docs/SKILL_REPOSITORY.md §1.4.
CREATE TABLE agent_skills (
  id                  uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            uuid               NOT NULL REFERENCES agents(id)  ON DELETE CASCADE,
  -- RESTRICT, not CASCADE: a catalogue row is never hard-deleted, it goes deprecated or blocked.
  skill_id            uuid               NOT NULL REFERENCES skills(id)  ON DELETE RESTRICT,
  version             varchar(60)        NOT NULL,      -- PINNED at attach. Never 'latest'.
  harness             engine             NOT NULL,      -- agents.engine snapshotted at attach
  compat_asserted     boolean            NOT NULL DEFAULT false,
  enabled             boolean            NOT NULL DEFAULT true,
  state               agent_skill_state  NOT NULL DEFAULT 'pending',
  install_error       text,
  install_run_id      varchar(120),
  install_source      varchar(16)        NOT NULL DEFAULT 'live',   -- live | mock
  risk_level_at_attach skill_risk        NOT NULL,                  -- low | medium | high
  risk_acknowledged   boolean            NOT NULL DEFAULT false,
  config              jsonb              NOT NULL DEFAULT '{}',     -- env NAMES only, never values
  origin              agent_skill_origin NOT NULL DEFAULT 'manual',
  installed_at        timestamptz,
  last_verified_at    timestamptz,
  created_at          timestamptz        NOT NULL DEFAULT now(),
  updated_at          timestamptz        NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_skills_agent_skill_uniq ON agent_skills (agent_id, skill_id);
CREATE INDEX        agent_skills_agent_idx        ON agent_skills (agent_id, state);
CREATE INDEX        agent_skills_skill_idx        ON agent_skills (skill_id, version);
```

Identity lives on `skills`, joined in for you by the manifest: `skills.source_id`,
`skills.owner_handle`, `skills.slug`, `skills.requirements`, `skills.install`,
`skills.artifact_sha256`, `skills.risk_level`, `skills.blocked`.

| Manifest field | Source | Allowed values / meaning |
|---|---|---|
| `agentSkillId` | `agent_skills.id` | The id you address in `agent.skill_state`. |
| `source` | `skills.source_id` | Registry row from `skill_sources`: `anthropic`, `clawhub`, `github`, `awesome-lists`, `arkagent`, … It is a **foreign key to an allowlist**, not a free string: nothing is ever fetched from a host with no `skill_sources` row. |
| `ownerHandle` | `skills.owner_handle` | Publisher handle, `""` for sources with no owner namespace (empty string, never null — a nullable column would let duplicate `(source, slug)` rows through the unique index). |
| `slug` | `skills.slug` | Kebab-case name. **Never unique on its own** — `github` resolves to six publishers upstream. Identity is `(source, ownerHandle, slug)`. |
| `version` | `agent_skills.version` | Exact pinned version. `latest` is **not** an accepted value; ArkAgent resolves it before writing the row so a run is reproducible. |
| `harness` | `agent_skills.harness` | The `engine` this attachment was asserted against. If it differs from `agent.engine`, ArkAgent has already flagged it; treat it as unverified. |
| `compatAsserted` | `agent_skills.compat_asserted` | **Never defaulted true.** `false` ⇒ nobody has asserted this skill runs on this harness. Install it only if you can satisfy `requires`; otherwise `failed` / `unsupported_harness` (§4.2). |
| `enabled` | `agent_skills.enabled` | `false` ⇒ installed but not loaded into the agent's context. Do not uninstall on `false`; toggling must not re-download. |
| `installPath` | constant | `.agents/skills`, relative to the agent workspace — the one path all four harnesses scan (§4.2). Not a column: it is not per-skill configurable, and a template that wanted it to be would be a security decision, not a preference. |
| `requires` | `skills.requirements` | `{"bins":["git","rg"],"env":["GITHUB_TOKEN"],"config":["github.host"],"os":["linux"]}` — OpenClaw's `metadata.openclaw.requires` shape verbatim. **Check before installing**; on an unmet requirement report `failed` with `errorCode: "unmet_requirement"` naming the missing item. |
| `contentUrl` / `contentSha256` | see below | Where the bytes come from, and the digest you **MUST** verify after download (`checksum_mismatch` on failure). |
| `riskLevel` | `skills.risk_level` | `low` \| `medium` \| `high`. **Higher is riskier**, from a deterministic rubric (`skills.risk_score` is the raw total, `skills.risk_signals` the individual triggers). Informational: ArkAgent has already refused to attach `high` without an explicit human acknowledgement (`risk_acknowledged`). |
| `blocked` | `skills.blocked` | `true` ⇒ the catalogue row was withdrawn after attachment. **Uninstall it**, report `removed`, do not run it once. |
| `state` | `agent_skills.state` | Your report: `pending` (ArkAgent wants it) → `installing` → `installed` \| `failed`; `removing` → `removed`. |

**Where the bytes come from — `contentUrl` is not always ours.** `skills.install.mode` decides:

- `registry` / `git` — `contentUrl` points at the **origin**, and you fetch under the origin's own
  terms. This is the default and covers every ClawHub- and GitHub-sourced skill.
- `inline` — `contentUrl` is
  `https://app.arkagent.com/api/runtime/skills/{skillId}/bundle?v={version}`, a `.tar.gz` with
  `SKILL.md` at the root, served against the per-agent manifest token (§1.3). ArkAgent only mints
  this form when `skills.redistributable = true` **and** `skills.license_verified = true`, because
  shipping someone else's bytes is redistribution and needs a licence that permits it. All 30
  seeded ClawHub rows have `license_verified = false`, so at launch **almost every skill resolves
  to an origin URL, not to us.**

The earlier claim that "ArkAgent is the distribution point precisely so an upstream registry cannot
swap the bytes underneath a pinned version" was wrong on the facts and would have shipped an
unlicensed redistribution service. `contentSha256` is what defends the pinned version against a
swapped upstream, and it is why verifying it is a **MUST** rather than a nicety.

**Reconciliation is declarative.** The desired state is "every manifest row with `enabled = true`,
`state ≠ removed`, and `blocked = false`". On every manifest read you diff against what is on disk:
install what is missing, remove what is no longer listed, and leave matched `(identity, version)`
pairs alone. Do not maintain your own separate list of skills.

## 2.6 `agent_context_items` — uploaded documents and pasted text

```sql
CREATE TABLE agent_context_items (
  id           uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid               NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  kind         context_item_kind  NOT NULL,
  name         varchar(200)       NOT NULL,
  mime         varchar(120),
  bytes        integer            NOT NULL DEFAULT 0,
  sha256       char(64),
  content_url  text,
  text_body    text,
  source_url   text,
  scope        varchar(16)        NOT NULL DEFAULT 'agent',
  state        context_item_state NOT NULL DEFAULT 'pending',
  state_error  text,
  chunks       integer,
  indexed_at   timestamptz,
  created_at   timestamptz        NOT NULL DEFAULT now(),
  updated_at   timestamptz        NOT NULL DEFAULT now()
);
CREATE INDEX agent_context_items_agent_idx ON agent_context_items (agent_id, state);
```

| Column | Meaning |
|---|---|
| `kind` | `file` (fetch `content_url`) · `text` (use `text_body` directly) · `url` (fetch `source_url` yourself). |
| `name` | Display filename or title. Sanitise before using as a path component. |
| `mime` | e.g. `application/pdf`, `text/markdown`. Absent for `kind='text'`. |
| `bytes` | Byte length. Platform hard ceiling **20 MB** per item; ArkAgent rejects larger uploads. A template may set a tighter per-item limit — `TemplateContextItem.maxBytes`, default **10 MiB** (`docs/AGENT_TEMPLATE_GENERATOR.md` §3.6) — which is enforced at upload, not here. `0` while `state = 'awaiting_upload'`. |
| `sha256` | Of the exact bytes at `content_url`. Verify after download; on mismatch report `failed` / `checksum_mismatch` and **do not** feed the bytes to the model. |
| `content_url` | `https://app.arkagent.com/api/runtime/context/{id}/content`, per-agent manifest token (§1.3), `Cache-Control: no-store`. Present only for `kind='file'` **and** `state ≠ 'awaiting_upload'`. |
| `text_body` | The pasted text itself, inline. Present only for `kind='text'`. Untrusted user content — it goes into the prompt as data, never as an instruction to your service (§1.2). |
| `source_url` | The URL to fetch. Present only for `kind='url'`. **Fetch it in the agent's egress sandbox, not from your control plane** — it is a user-supplied URL and therefore an SSRF vector against your internal network. ArkAgent does not currently validate the scheme or resolve the host, so you **MUST**: https only, reject credentials in the URL, reject loopback / link-local / RFC1918 / IPv6 ULA after DNS resolution *and* on every redirect hop, and cap the response. On refusal report `failed` / `fetch_blocked`. |
| `scope` | `agent` = available to every session. `session` = only where explicitly attached. |
| `state` | `awaiting_upload` → `pending` → `indexing` → `indexed` \| `failed`; `removed` is terminal. You report every transition **except** `awaiting_upload`, which only the template generator writes (§2.1). A row still in `awaiting_upload` has no bytes: **skip it silently**, do not fetch a null `content_url`, and do not report a state for it. |
| `chunks` | Number of retrievable chunks produced. Purely informational; drives one number in the UI. Null until `indexed`. |

> *Naming note:* `docs/AGENT_TEMPLATE_GENERATOR.md` §materialize step 5 calls this column
> `status`. The column is **`state`**, matching `agent_context_items.state` here and the
> `agent.context_state` event name; the ATG doc is the one that needs the edit.

**CONFIRM-3:** does the runtime *index* context into a retrievable store, or merely drop files on
the agent's disk? The UI says "searchable knowledge base" in one case and "files on the agent's
disk" in the other, and the honest answer must be decided before the CONTEXT section of the
template generator ships.

## 2.7 `agent_schedules` — reminders and schedulers

```sql
CREATE TABLE agent_schedules (
  id                  uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            uuid             NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name                varchar(120)     NOT NULL,
  enabled             boolean          NOT NULL DEFAULT true,
  kind                schedule_kind    NOT NULL,
  cron_expr           varchar(120),
  interval_seconds    integer,
  run_at              timestamptz,
  -- UTC, not a regional default. This is an en/zh/zht/ja product with no single home region,
  -- and a row written before the workspace picks a zone must be unambiguous rather than merely
  -- plausible. `POST /api/agents/[id]/schedules` fills it from `workspaces.timezone` ??
  -- `settings.timezone` ?? 'UTC'; the column default only catches a direct SQL insert.
  timezone            varchar(64)      NOT NULL DEFAULT 'UTC',
  prompt              text             NOT NULL,
  session_key         varchar(160),
  wake_runtime        boolean          NOT NULL DEFAULT true,
  max_runtime_seconds integer          NOT NULL DEFAULT 900,
  overlap_policy      schedule_overlap NOT NULL DEFAULT 'skip',
  catch_up            boolean          NOT NULL DEFAULT false,
  jitter_seconds      integer          NOT NULL DEFAULT 0,
  -- Both required by the template generator's TemplateSchedule (docs/AGENT_TEMPLATE_GENERATOR.md
  -- §3.6), which materializes into this table; without them a generated schedule loses its
  -- circuit breaker and its delivery target on save.
  max_runs_per_day    integer          NOT NULL DEFAULT 288,   -- 1..288
  deliver_to          varchar(16)      NOT NULL DEFAULT 'chat', -- chat | email | channel | none
  next_run_at         timestamptz,
  last_run_at         timestamptz,
  last_status         varchar(24),
  created_at          timestamptz      NOT NULL DEFAULT now(),
  updated_at          timestamptz      NOT NULL DEFAULT now(),
  -- Each arm asserts BOTH that its own discriminant column is present AND that the other two
  -- are absent. The earlier OR-chain only did the former, so `kind='cron'` with
  -- `interval_seconds = 5` satisfied the first arm and stored a row whose interval nothing
  -- would ever honour — a schedule that silently means something other than what it says.
  CONSTRAINT agent_schedules_shape CHECK (
    (kind = 'cron'     AND cron_expr IS NOT NULL
                       AND interval_seconds IS NULL AND run_at IS NULL)
 OR (kind = 'interval' AND interval_seconds IS NOT NULL AND interval_seconds >= 60
                       AND cron_expr IS NULL AND run_at IS NULL)
 OR (kind = 'once'     AND run_at IS NOT NULL
                       AND cron_expr IS NULL AND interval_seconds IS NULL)),
  -- Negative jitter walks `next_run_at` backwards and can re-fire an occurrence that already
  -- ran; an hour of it de-synchronises a fleet past the point of being a schedule at all.
  CONSTRAINT agent_schedules_jitter  CHECK (jitter_seconds BETWEEN 0 AND 3600),
  CONSTRAINT agent_schedules_runtime CHECK (max_runtime_seconds BETWEEN 30 AND 86400),
  CONSTRAINT agent_schedules_runs    CHECK (max_runs_per_day BETWEEN 1 AND 288),
  CONSTRAINT agent_schedules_deliver CHECK (deliver_to IN ('chat','email','channel','none'))
);
CREATE INDEX agent_schedules_agent_idx ON agent_schedules (agent_id, enabled);
-- `next_run_at` is nullable, and a fired `once` schedule or an unmatchable cron sets it back to
-- NULL. Without the IS NOT NULL arm those rows sit in the index the due-scan walks, growing it
-- without bound with entries the §5.3 predicate can never select.
CREATE INDEX agent_schedules_due_idx   ON agent_schedules (next_run_at)
  WHERE enabled AND next_run_at IS NOT NULL;
```

| Column | Meaning |
|---|---|
| `name` | Operator label. Presentation. |
| `enabled` | `false` ⇒ never fires. Keep the row; do not treat disable as delete. |
| `kind` | `cron` \| `interval` \| `once`. |
| `cron_expr` | 5-field Vixie/POSIX cron (`m h dom mon dow`). Evaluated **in `timezone`**. The full accepted grammar and the DST rules are in the box below — they are not the obvious ones, and ArkAgent's engine (`lib/schedule/cron.ts`) is the definition. |
| `interval_seconds` | ≥60. Measured from the *end* of the previous run. |
| `run_at` | Absolute instant for `kind='once'`. |
| `timezone` | IANA. Written from `workspaces.timezone` ?? `settings.timezone`; the column default is `UTC`. An unknown zone degrades to UTC with an `invalid_timezone` warning (§2.3), never to a guess. |
| `prompt` | The instruction to run. **User-authored text, injected as a user turn — never as a system instruction.** |
| `session_key` | Conversation to run in. Default `agent:main:schedule:{scheduleId}`, which keeps scheduled work out of the human's chat thread. |
| `wake_runtime` | `true` ⇒ start a stopped instance to run this. `false` ⇒ skip with `status: "skipped"`, `reason: "instance_stopped"`. |
| `max_runtime_seconds` | Kill the run past this and report `status: "failed"`, `error_code: "timeout"`. |
| `overlap_policy` | What to do if the previous run of *this* schedule is still going: `skip` (default) · `queue` (run after) · `parallel`. |
| `catch_up` | `false` (default) ⇒ a fire missed during downtime is dropped. `true` ⇒ run **once** on recovery, never a backlog burst. |
| `jitter_seconds` | Random 0..n delay, to de-synchronise a fleet that all fires at `0 9 * * *`. |
| `max_runs_per_day` | 1..288. Circuit breaker: past this many fires in one calendar day in `timezone`, skip with `reason: "max_runs_per_day"`. Guards a mis-parsed `*/1 * * * *`. |
| `deliver_to` | `chat` \| `email` \| `channel` \| `none`. Where the result goes. `email` is delivered **by ArkAgent** (§5.5 step 5); you never send it. |
| `next_run_at` | Computed by ArkAgent. **Advisory for you.** ArkAgent recomputes it after each run; do not write it. |
| `last_run_at` / `last_status` | Updated by ArkAgent from your `agent.schedule_run` events. |

### The cron dialect, exactly

Written once here because a second implementation that disagrees produces silently-wrong fire
times, and because the previous version of this paragraph got the DST rules backwards. The
normative implementation is `lib/schedule/cron.ts`; it is dependency-free and you may port it.

**Grammar** — 5 space-separated fields, `minute hour day-of-month month day-of-week`:

| Form | Meaning |
|---|---|
| `*` | every value |
| `n` | a single value |
| `a-b` | inclusive range |
| `a-b/s`, `*/s` | step over a range or the whole field |
| `a,b,c` | a list of any of the above |
| `?` | synonym for `*`, **in the two day fields only** |
| `JAN`…`DEC`, `SUN`…`SAT` | case-insensitive names in the month and day-of-week fields |
| `0` or `7` in day-of-week | both mean Sunday |

Rejected at parse time, so a user never silently gets a different schedule: a seconds field,
`@daily`-style macros, and the Quartz extensions `L`, `W`, `#`.

**Day-of-month vs day-of-week** follows the Vixie/POSIX rule and it surprises people: when **both**
fields are restricted the match is a **union** — either one qualifies — and when only one is
restricted it alone decides. `0 9 13 * FRI` fires on *every 13th and every Friday*, not only on
Friday the 13th.

**DST — three rules, and two of them are the opposite of the intuitive choice:**

1. A wall clock the zone **skips** (spring forward) **fires**, at the instant the clock jumps to.
   A daily `30 2 * * *` job in `America/New_York` runs at 03:00 on transition day. A late digest is
   an inconvenience; a missing one is a support ticket.
2. A wall clock the zone **repeats** (fall back) fires **once, on the first pass** — for any
   expression that restricts the hour field. Sending the invoice twice is worse than once.
3. **Unless the expression is interval-like** (hour field unrestricted, e.g. `*/15 * * * *`), in
   which case **both passes fire**. An interval job is asking for a real-time cadence and would
   otherwise open a one-hour hole in it once a year. This is the same split Vixie cron makes
   between fixed-time and wildcard jobs.

Resolution is one minute, and `nextRun` is idempotent when fed its own previous result. A schedule
that can never match (`0 0 30 2 *`) yields `next_run_at = NULL` after a bounded search, not a hang.

**Who fires the schedule?** For v2.0, **ArkAgent fires**: a control-plane cron computes due
schedules, wakes the instance if needed, and injects `prompt` as an ordinary chat turn. Your only
obligation is to accept it and report the result as `agent.schedule_run`. If and when you
implement the `schedules` capability, ArkAgent pushes the full set declaratively via
`PUT /api/instances/{instanceId}/schedules` (full replace — ArkAgent is the source of record) and
stops firing them itself. Both designs use the same inbound event, so the switchover is invisible
to the Activity page.

> *Rejected alternative:* runtime-owned schedules from day one. Correct long-term, but it blocks
> the whole Reminders feature on an upstream release we do not control.

## 2.8 `channels` and `agent_channels` — how the agent is reachable

```sql
CREATE TABLE channels (
  id           uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid           NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type         channel_type   NOT NULL,
  status       channel_status NOT NULL DEFAULT 'disconnected',
  label        varchar(80),
  config       jsonb          NOT NULL DEFAULT '{}',
  created_at   timestamptz    NOT NULL DEFAULT now(),
  updated_at   timestamptz    NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX channels_workspace_type_uniq ON channels (workspace_id, type);

CREATE TABLE agent_channels (
  agent_id   uuid NOT NULL REFERENCES agents(id)   ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, channel_id)
);
```

| Column | Meaning |
|---|---|
| `type` | §2.1. `web` is the in-dashboard chat and is attached to **every** agent automatically. |
| `status` | `connected` = usable. `pending` = awaiting a login/QR step. `disconnected`/`error` = do not send. |
| `config` | Per-channel connection settings. **Secrets are NOT readable through the manifest**, and a secret you need is delivered separately, per-channel, at bind time — never in `config`. What actually protects them today is a *masking* step, not encryption: `lib/serializers.ts` replaces any key matching `/token\|secret\|key\|appsecret\|password/i` with `••••••••`, and the manifest applies the same mask before emitting `channels[].config`. The values themselves sit in plaintext JSONB. The schema comment claiming application-layer encryption (`lib/db/schema.ts:492`) and the customer-facing copy claiming it (`lib/i18n/channels.ts`) are both **currently untrue**; closing that gap is a launch prerequisite tracked in §9, and it is the second reason `channels.config` is excluded from any Path B grant (§2.0). A key whose *name* does not match that regex is not masked — do not name a secret `webhook_url`. |
| `label` | Presentation. |

`agent_channels` is a pure join: one row per (agent, channel) the agent may use. An agent
**MUST NOT** send on a channel it has no row for, even if the workspace has one connected.

**Channel vocabulary mismatch — read this.** The upstream channel system currently handles
`feishu`, `dingtalk`, `wechat`, `wecom`; ArkAgent's enum historically had `telegram`, `whatsapp`,
`wechat`, `line`, `slack`, `email`, `web`. Only `wechat` overlapped, and an inbound `agent.message`
with `channel: "feishu"` raised a Postgres enum error — a `500` that, under retry, becomes a
delivery loop. v2 extends the enum to the union (§2.1) and validates before insert. Until you can
confirm your deployment emits only values from the v2 enum, **map unknown channels to `web`
yourself rather than sending a value we will reject.**

## 2.9 `agent_manager_config` — the harness binding

```sql
CREATE TABLE agent_manager_config (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  provider    varchar(40) NOT NULL,
  external_id varchar(120) NOT NULL,
  status      varchar(40) NOT NULL DEFAULT 'pending',
  last_error  text,
  config      jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_manager_config_agent_provider_uniq ON agent_manager_config (agent_id, provider);
CREATE INDEX        agent_manager_config_external_idx        ON agent_manager_config (provider, external_id);
```

| Column | Meaning |
|---|---|
| `provider` | **The harness that actually runs this agent**, one of the four `engine` values. In v1 this was hardcoded to `openclaw` for every agent including Hermes ones, which made the column a lie; v2 requires it to equal `agents.engine`. |
| `external_id` | Your `instanceId`. |
| `status` | Your provisioning status, verbatim. |
| `config` | Your full provisioning response, stored opaquely so our schema need not grow when you add fields. ArkAgent reads nothing out of it except for display. **Do not put secrets in it** — it is served to workspace members. |

## 2.10 The manifest — the canonical read payload

```ts
/** GET /api/runtime/agents/{agentId}/manifest */
interface AgentManifest {
  manifestVersion: "2";
  revision: number;                 // monotonic; bumps on ANY change below. ETag is derived from it.
  generatedAt: string;              // RFC 3339

  agent: {
    agentId: string;
    workspaceId: string;
    name: string;
    roleId: string;
    engine: "openclaw" | "hermes" | "codex" | "deepseek";
    planTier: "associate" | "professional" | "director";
    status: string;                 // current agent_status, informational
    instanceId: string | null;      // null until provisioning completes
    createdAt: string;
  };

  /** The system prompt payload. Pre-joined; do not re-derive it. */
  brief: {
    instructions: string;
    rules: string;
    /** instructions + "\n\n" + rules, both trimmed, empties dropped. */
    composed: string;
  };

  settings: AgentSettings;          // §2.3, fully merged over defaults

  tasks: Array<{
    taskId: string;
    text: string;
    status: "queued" | "in_progress" | "done" | "blocked";
    sortOrder: number;
  }>;

  /** A join projection of agent_skills onto skills (§2.5). Not a table. */
  skills: Array<{
    agentSkillId: string;
    skillId: string;
    source: string; ownerHandle: string; slug: string; version: string;
    harness: "openclaw" | "hermes" | "codex" | "deepseek";
    compatAsserted: boolean;
    enabled: boolean;
    blocked: boolean;
    installPath: string;            // always ".agents/skills"
    requires: { bins?: string[]; env?: string[]; config?: string[]; os?: string[] };
    installMode: "registry" | "git" | "inline";
    contentUrl: string; contentSha256: string | null;
    riskLevel: "low" | "medium" | "high";
    state: "pending" | "installing" | "installed" | "failed" | "removing" | "removed";
  }>;

  context: Array<{
    contextItemId: string;
    kind: "file" | "text" | "url";
    name: string; mime: string | null; bytes: number;
    sha256: string | null;
    contentUrl: string | null; textBody: string | null; sourceUrl: string | null;
    scope: "agent" | "session";
    state: "awaiting_upload" | "pending" | "indexing" | "indexed" | "failed" | "removed";
  }>;

  schedules: Array<{
    scheduleId: string;
    name: string; enabled: boolean;
    kind: "cron" | "interval" | "once";
    cronExpr: string | null; intervalSeconds: number | null; runAt: string | null;
    timezone: string;
    prompt: string;
    sessionKey: string;
    wakeRuntime: boolean; maxRuntimeSeconds: number;
    overlapPolicy: "skip" | "queue" | "parallel";
    catchUp: boolean; jitterSeconds: number;
    maxRunsPerDay: number; deliverTo: "chat" | "email" | "channel" | "none";
    nextRunAt: string | null;       // advisory
  }>;

  channels: Array<{
    channelId: string;
    type: string;                   // channel_type
    status: "connected" | "pending" | "disconnected" | "error";
    label: string | null;
    /** Non-secret settings only. Secrets are delivered out of band. */
    config: Record<string, string>;
  }>;

  limits: {
    /**
     * Two different budgets, both of which stop work when exhausted. Do not conflate them:
     * `creditsUsed` is per AGENT (agents.credits_used) and the workspace pool is shared by
     * every agent in the tenant (workspaces.credits_included / credits_used).
     *
     *   agentCap        = settings.monthlyCreditCap > 0 ? settings.monthlyCreditCap : Infinity
     *   agentRemaining  = max(0, agentCap - agents.credits_used)
     *   workspaceRemaining = max(0, workspaces.credits_included - workspaces.credits_used)
     *   creditsRemaining   = min(agentRemaining, workspaceRemaining)
     *
     * The earlier formula `min(planAllowance, monthlyCreditCap) - used` is WRONG for the
     * default: monthlyCreditCap is 0 for every agent that has not set one, min(allowance, 0)
     * is 0, and creditsRemaining comes out NEGATIVE — every default agent reads as out of
     * credit on its first manifest fetch.
     */
    creditsRemaining: number;
    creditsUsed: number;            // agents.credits_used
    workspaceCreditsRemaining: number;
    /** workspaces.cycle_resets_at. Null when no subscription has opened a cycle yet. */
    cycleResetsAt: string | null;
    dailyActionLimit: number;
    /**
     * `plans` has no such column and none is being added: this is a constant per plan_tier in
     * lib/pricing.ts. A Path B reader that cannot see it MUST assume 1.
     * associate = 1 · professional = 2 · director = 4.
     */
    maxConcurrentRuns: number;
  };

  ingest: {
    url: string;
    protocol: "v2";
    signatureHeader: "x-arkagent-signature";
    timestampHeader: "x-arkagent-timestamp";
    keyIdHeader: "x-arkagent-key-id";
    keyId: string;                  // echo it; see §1.4
    algorithm: "hmac-sha256-hex";
    maxBatchEvents: number;         // 500
    maxBatchBytes: number;          // 1048576
  };
}
```

**`revision` and the ETag.** `revision` is `agents.config_revision` (§2.2), incremented in the same
transaction as any write to the agent's brief, settings, tasks, skills, context, schedules, or
channel links. `ETag` is `W/"<agentId>:<revision>"` and `X-ArkAgent-Manifest-Revision` carries the
integer. Do **not** derive freshness from `agents.updated_at`: it does not move when a child row
changes, which is most config edits.

**Nullability.** Every field above is present on every response; `null` is used where the type says
so, and a list with nothing in it is `[]`, never absent. `agent.instanceId` is null between the
`draft` row and a successful provisioning response, which is the one case where you may be reading
your own manifest before you exist in it.

## 2.11 Worked example — one fully configured agent

An agent called **Nova**, a support agent on the OpenClaw harness, with two tasks, two skills, one
uploaded PDF plus a pasted style note, a weekday-morning digest schedule, and Slack + web
channels. Rows first, then the manifest the runtime actually receives.

```jsonc
// agents
{ "id": "a7f3c9e2-1d54-4b0a-9e77-2f9c1b8d4a61",
  "workspace_id": "3b21d0aa-77c4-4a1e-9d2b-5e6f0c7a8b19",
  "created_by_id": "c40b7e51-9a3f-42d8-8c17-6b0e1f2a3d94",
  "name": "Nova", "role_id": "support", "engine": "openclaw",
  "plan_tier": "professional", "status": "working",
  "instructions": "You are Nova, the first-line support agent for ArkAgent...",
  "rules": "Never promise a refund. Escalate anything about data deletion...",
  "hue": "violet", "credits_used": 1842,
  "settings": { "tone": "friendly", "responseLanguage": "auto", "timezone": "Asia/Shanghai",
                "autonomy": "ask", "approvalAmount": 100, "approveExternalSends": true,
                "alwaysOn": false, "workStart": "09:00", "workEnd": "19:00",
                "workDays": [1,2,3,4,5], "heartbeatMinutes": 10,
                "escalateTo": "support-leads@example.com",
                "model": "anthropic/claude-sonnet-4-6", "maxTokens": 8192,
                "retentionDays": 30, "monthlyCreditCap": 20000,
                "tools": { "shell": false, "files": true, "browser": true,
                           "docker": false, "code": false } },
  "agent_manager_id": "6f0f0f6e-9b2a-4a3d-8f1c-0d2e3a4b5c6d",
  "vm_id": "ocm-nova-6f0f0f", "vm_region": "cn-shanghai-1",
  "deployment_status": "done", "last_error": null,
  "last_heartbeat_at": "2026-08-29T09:14:02.113Z",
  "provisioned_at": "2026-08-01T02:11:40.000Z",
  "uptime_started_at": "2026-08-27T22:00:03.000Z",
  "created_at": "2026-08-01T02:10:55.000Z", "updated_at": "2026-08-29T09:14:02.113Z" }

// agent_tasks
{ "id": "1e0c…", "agent_id": "a7f3c9e2…", "text": "Triage the overnight ticket queue",
  "status": "in_progress", "meta": null, "sort_order": 0, "completed_at": null }
{ "id": "1e0d…", "agent_id": "a7f3c9e2…", "text": "Draft replies for anything tagged billing",
  "status": "queued", "meta": null, "sort_order": 1, "completed_at": null }

// agent_skills  (identity + bytes live on `skills`; joined into the manifest for you)
{ "id": "5a11…", "agent_id": "a7f3c9e2…", "skill_id": "b0c1…", "version": "1.2.0",
  "harness": "openclaw", "compat_asserted": true, "enabled": true, "status": "installed",
  "risk_level_at_attach": "low", "risk_acknowledged": false, "install_source": "live",
  "config": {}, "origin": "manual", "installed_at": "2026-08-01T02:13:10.000Z" }
{ "id": "5a12…", "agent_id": "a7f3c9e2…", "skill_id": "b0c2…", "version": "0.9.3",
  "harness": "openclaw", "compat_asserted": true, "enabled": true, "status": "pending",
  "risk_level_at_attach": "medium", "risk_acknowledged": false, "install_source": "live",
  "config": { "helpdesk_env": "HELPDESK_TOKEN" }, "origin": "template", "installed_at": null }

// skills  (catalogue, shared across agents and workspaces — read-only to everyone but sync)
{ "id": "b0c1…", "source_id": "anthropic", "owner_handle": "anthropics", "slug": "pdf",
  "requirements": { "bins": ["python3"], "env": [], "config": [], "os": ["linux"] },
  "install": { "mode": "inline" }, "redistributable": true, "license_verified": true,
  "artifact_sha256": "9f2c4a…64hex…", "risk_level": "low", "risk_score": 12, "blocked": false }
{ "id": "b0c2…", "source_id": "clawhub", "owner_handle": "pskoett", "slug": "ticket-triage",
  "requirements": { "bins": [], "env": ["HELPDESK_TOKEN"], "config": [], "os": [] },
  "install": { "mode": "registry", "url": "https://clawhub.example/pskoett/ticket-triage/0.9.3.tar.gz" },
  "redistributable": false, "license_verified": false,
  "artifact_sha256": "3ab8e1…64hex…", "risk_level": "medium", "risk_score": 41, "blocked": false }

// agent_context_items
{ "id": "7c30…", "agent_id": "a7f3c9e2…", "kind": "file", "name": "2026-refund-policy.pdf",
  "mime": "application/pdf", "bytes": 184320, "sha256": "aa17bd…64hex…",
  "content_url": "https://app.arkagent.com/api/runtime/context/7c30…/content",
  "text_body": null, "source_url": null, "scope": "agent",
  "state": "indexed", "chunks": 46, "indexed_at": "2026-08-01T02:15:02.000Z" }
{ "id": "7c31…", "agent_id": "a7f3c9e2…", "kind": "text", "name": "Tone cheat-sheet",
  "mime": null, "bytes": 512, "sha256": null, "content_url": null,
  "text_body": "Lead with the fix, not the apology. One sentence of empathy, maximum.",
  "source_url": null, "scope": "agent", "state": "indexed", "chunks": 1 }

// agent_schedules
{ "id": "9d40…", "agent_id": "a7f3c9e2…", "name": "Morning queue digest",
  "enabled": true, "kind": "cron", "cron_expr": "0 9 * * 1-5",
  "interval_seconds": null, "run_at": null, "timezone": "Asia/Shanghai",
  "prompt": "Summarise the overnight ticket queue and post the digest to #support-ops.",
  "session_key": "agent:main:schedule:9d40…", "wake_runtime": true,
  "max_runtime_seconds": 600, "overlap_policy": "skip", "catch_up": false,
  "jitter_seconds": 30, "next_run_at": "2026-09-01T01:00:00.000Z",
  "last_run_at": "2026-08-29T01:00:31.000Z", "last_status": "succeeded" }

// channels + agent_channels
{ "id": "e501…", "workspace_id": "3b21d0aa…", "type": "slack", "status": "connected",
  "label": "Acme workspace", "config": { "team": "T024BE7LG", "default_channel": "#support-ops" } }
{ "id": "e502…", "workspace_id": "3b21d0aa…", "type": "web", "status": "connected", "label": "web", "config": {} }
{ "agent_id": "a7f3c9e2…", "channel_id": "e501…" }
{ "agent_id": "a7f3c9e2…", "channel_id": "e502…" }

// agent_manager_config
{ "id": "f900…", "agent_id": "a7f3c9e2…", "provider": "openclaw",
  "external_id": "6f0f0f6e-9b2a-4a3d-8f1c-0d2e3a4b5c6d", "status": "done",
  "last_error": null, "config": { "docker_image": "openclaw-gateway-vnc:v20260622-8", "…": "…" } }
```

The same agent, as the manifest (abridged where the mapping is 1:1):

```jsonc
{
  "manifestVersion": "2",
  "revision": 47,
  "generatedAt": "2026-08-29T09:20:00.000Z",
  "agent": { "agentId": "a7f3c9e2-1d54-4b0a-9e77-2f9c1b8d4a61",
             "workspaceId": "3b21d0aa-77c4-4a1e-9d2b-5e6f0c7a8b19",
             "name": "Nova", "roleId": "support", "engine": "openclaw",
             "planTier": "professional", "status": "working",
             "instanceId": "6f0f0f6e-9b2a-4a3d-8f1c-0d2e3a4b5c6d",
             "createdAt": "2026-08-01T02:10:55.000Z" },
  "brief": {
    "instructions": "You are Nova, the first-line support agent for ArkAgent...",
    "rules": "Never promise a refund. Escalate anything about data deletion...",
    "composed": "You are Nova, the first-line support agent for ArkAgent...\n\nNever promise a refund. Escalate anything about data deletion..."
  },
  "settings": { "tone": "friendly", "responseLanguage": "auto", "timezone": "Asia/Shanghai",
                "autonomy": "ask", "approvalAmount": 100, "approveExternalSends": true,
                "dailyActionLimit": 0, "alwaysOn": false, "workStart": "09:00",
                "workEnd": "19:00", "workDays": [1,2,3,4,5], "heartbeatMinutes": 10,
                "escalateTo": "support-leads@example.com", "notifyNeedsReview": true,
                "notifyErrors": true, "dailyDigest": true, "digestTime": "18:00",
                "model": "anthropic/claude-sonnet-4-6", "temperature": 0.4,
                "maxTokens": 8192, "reasoningEffort": "medium",
                "memoryEnabled": true, "retentionDays": 30, "knowledgeUrls": [],
                "monthlyCreditCap": 20000,
                "skills": ["web_research","email","summarization"],
                "tools": { "shell": false, "files": true, "browser": true,
                           "docker": false, "code": false },
                "selfImprove": true, "autoCreateSkills": true },
  "tasks": [
    { "taskId": "1e0c…", "text": "Triage the overnight ticket queue", "status": "in_progress", "sortOrder": 0 },
    { "taskId": "1e0d…", "text": "Draft replies for anything tagged billing", "status": "queued", "sortOrder": 1 }
  ],
  "skills": [
    { "agentSkillId": "5a11…", "skillId": "b0c1…", "source": "anthropic",
      "ownerHandle": "anthropics", "slug": "pdf", "version": "1.2.0",
      "harness": "openclaw", "compatAsserted": true, "enabled": true, "blocked": false,
      "installPath": ".agents/skills",
      "requires": { "bins": ["python3"], "env": [], "config": [], "os": ["linux"] },
      "installMode": "inline",
      "contentUrl": "https://app.arkagent.com/api/runtime/skills/b0c1…/bundle?v=1.2.0",
      "contentSha256": "9f2c4a…", "riskLevel": "low", "state": "installed" },
    { "agentSkillId": "5a12…", "skillId": "b0c2…", "source": "clawhub",
      "ownerHandle": "pskoett", "slug": "ticket-triage", "version": "0.9.3",
      "harness": "openclaw", "compatAsserted": true, "enabled": true, "blocked": false,
      "installPath": ".agents/skills",
      "requires": { "bins": [], "env": ["HELPDESK_TOKEN"], "config": [], "os": [] },
      "installMode": "registry",
      "contentUrl": "https://clawhub.example/pskoett/ticket-triage/0.9.3.tar.gz",
      "contentSha256": "3ab8e1…", "riskLevel": "medium", "state": "pending" }
  ],
  "context": [
    { "contextItemId": "7c30…", "kind": "file", "name": "2026-refund-policy.pdf",
      "mime": "application/pdf", "bytes": 184320, "sha256": "aa17bd…",
      "contentUrl": "https://app.arkagent.com/api/runtime/context/7c30…/content",
      "textBody": null, "sourceUrl": null, "scope": "agent", "state": "indexed" },
    { "contextItemId": "7c31…", "kind": "text", "name": "Tone cheat-sheet",
      "mime": null, "bytes": 512, "sha256": null, "contentUrl": null,
      "textBody": "Lead with the fix, not the apology. One sentence of empathy, maximum.",
      "sourceUrl": null, "scope": "agent", "state": "indexed" }
  ],
  "schedules": [
    { "scheduleId": "9d40…", "name": "Morning queue digest", "enabled": true, "kind": "cron",
      "cronExpr": "0 9 * * 1-5", "intervalSeconds": null, "runAt": null,
      "timezone": "Asia/Shanghai",
      "prompt": "Summarise the overnight ticket queue and post the digest to #support-ops.",
      "sessionKey": "agent:main:schedule:9d40…", "wakeRuntime": true,
      "maxRuntimeSeconds": 600, "overlapPolicy": "skip", "catchUp": false,
      "jitterSeconds": 30, "maxRunsPerDay": 4, "deliverTo": "channel",
      "nextRunAt": "2026-09-01T01:00:00.000Z" }
  ],
  "channels": [
    { "channelId": "e501…", "type": "slack", "status": "connected", "label": "Acme workspace",
      "config": { "team": "T024BE7LG", "default_channel": "#support-ops" } },
    { "channelId": "e502…", "type": "web", "status": "connected", "label": "web", "config": {} }
  ],
  // agentCap 20000 - used 1842 = 18158; workspace pool 60000 - 22400 = 37600; min -> 18158.
  "limits": { "creditsRemaining": 18158, "creditsUsed": 1842,
              "workspaceCreditsRemaining": 37600,
              "cycleResetsAt": "2026-09-01T00:00:00.000Z",
              "dailyActionLimit": 0, "maxConcurrentRuns": 2 },
  "ingest": { "url": "https://app.arkagent.com/api/webhooks/agent-manager/batch",
              "protocol": "v2", "signatureHeader": "x-arkagent-signature",
              "timestampHeader": "x-arkagent-timestamp",
              "keyIdHeader": "x-arkagent-key-id", "keyId": "k_2026_08_a",
              "algorithm": "hmac-sha256-hex",
              "maxBatchEvents": 500, "maxBatchBytes": 1048576 }
}
```

Reading this manifest, a conforming runtime: runs the OpenClaw harness; uses the `composed` brief
as the system prompt; replies in the customer's language with a friendly tone; asks before
anything ≥ USD 100 and before *any* external send; works 09:00–19:00 Shanghai time Mon–Fri;
heartbeats every 10 minutes, echoing `configRevision: 47`; installs `ticket-triage@0.9.3` from
**ClawHub's own URL, not ours** (verifying `contentSha256` against the downloaded bytes, and
failing it for the missing `HELPDESK_TOKEN` rather than installing it half-configured); leaves
`pdf@1.2.0` alone; keeps no memory older than 30 days; refuses shell, docker and code execution;
stops at 18,158 further credits — the lower of its own 20,000 cap and the workspace pool; and can
send on Slack and web and nowhere else.

---

# (c) THE WRITE CONTRACT — events you push back

## 3.1 The endpoint and the envelope

There is **one** ingest endpoint. Everything you report goes through it.

```http
POST /api/webhooks/agent-manager/batch
Content-Type: application/json
x-arkagent-timestamp: 1787040000
x-arkagent-signature: v2=<hex>
x-arkagent-key-id: k_2026_08_a
X-ArkAgent-Protocol: v2
```

The single-event endpoint `POST /api/webhooks/agent-manager` remains for one release, accepts one
bare event object, and is **deprecated**. Use the batch endpoint.

```ts
interface EventBatch {
  /** Unique per delivery attempt-group. Reused across retries of the SAME batch. */
  deliveryId: string;
  protocol: "v2";
  events: RuntimeEvent[];           // 1..500, <= 1 MiB serialised
}

interface RuntimeEventEnvelope {
  /** Globally unique, forever. The idempotency key. UUIDv4 or ULID. */
  eventId: string;
  /** The agent this concerns. ArkAgent's agents.id, from `external_ref`. */
  externalAgentId: string;
  /** Your instance id. Used to detect a stale binding; not used for routing. */
  instanceId?: string;
  type: EventType;
  /** Schema version of THIS event type's payload. Starts at 1. */
  v: number;
  /** When it happened on your side. RFC 3339 with offset. */
  occurredAt: string;
  /** Monotonically increasing per (agent, stream). See §3.3 ordering. */
  seq?: number;
}

type RuntimeEvent = RuntimeEventEnvelope & { /* type-specific fields, §3.4 */ };
```

Response:

```jsonc
// 200 OK — every event was durably handled or deliberately ignored.
{ "ok": true,
  "accepted": 12,
  "duplicates": 3,          // eventIds already seen; treated as success
  "rejected": [             // per-event, non-fatal; do NOT retry these
    { "eventId": "…", "code": "unknown_type",      "message": "…" },
    { "eventId": "…", "code": "invalid_timestamp", "message": "…" }
  ] }
```

| Status | Meaning | Your action |
|---|---|---|
| `200` | batch processed; see `rejected[]` for per-event problems | drop the batch; log rejections |
| `400` | malformed batch envelope, or the batch exceeds a limit | **do not retry** — fix and re-emit |
| `401` | bad/absent signature, or timestamp skew | **do not retry blindly**; check the secret and the clock |
| `404` | `externalAgentId` matches no agent | **stop sending for that agent** and reconcile (§5.7) — the agent was deleted |
| `413` | body over 1 MiB | split the batch |
| `429` | rate limited | honour `Retry-After` |
| `5xx` | ArkAgent's problem | retry per §3.2 |

A `404` on a *batch* is only returned when **every** event in it names an unknown agent. Mixed
batches return `200` with the unknown-agent events in `rejected[]`, code `unknown_agent`.
**Prefer single-agent batches** — they make this unambiguous.

### What ArkAgent validates on every event, before it touches a table

A valid HMAC proves the batch came from the holder of the secret. It proves nothing about the
*contents*, and the ingest handler is the one place where a bug is a cross-tenant write. These
checks are normative on the receiver and each one has a rejection code you may see:

| Check | Rejection code |
|---|---|
| `externalAgentId` parses as a UUID **before** it reaches the query. Passing a non-UUID string into `eq(agents.id, …)` raises Postgres `22P02` and returns a `500`, which you would then retry — a loop out of a typo. Today's handler does exactly this. | `invalid_agent_id` |
| That agent exists. | `unknown_agent` |
| `occurredAt` parses as RFC 3339 **with an offset**. | `invalid_timestamp` |
| `type` is known and `v` is a version still accepted for that type. | `unknown_type` · `unsupported_event_version` |
| **Every id in the body belongs to that same agent.** `conversationId`, `scheduleExternalId`, `contextItemId`, `runId`, and the `agentSkillId` on a skill state are all attacker-supplied from ArkAgent's point of view; none may be used as given. Today's single-event handler inserts a message into whatever `conversationId` the body names, which writes one tenant's message into another tenant's conversation. | `foreign_reference` |
| `channel` is a value of the v2 `channel_type` enum (§2.1). Casting an unknown value straight into the enum is the `500`-under-retry delivery loop described in §2.8. | `unknown_channel` |
| `status` on `agent.status` is in the runtime-owned subset. | `forbidden_status` |
| The event is not a duplicate `eventId` (§3.2). | reported in `duplicates`, not `rejected` |

None of these are retryable. A `rejected[]` entry is a permanent verdict on that event.

## 3.2 Idempotency, ordering, retries

### Idempotency

- `eventId` is the key. ArkAgent records every accepted `eventId` in an ingest ledger and returns
  a duplicate as **success**, not as an error.

```sql
CREATE TABLE runtime_event_receipts (
  event_id    varchar(120) PRIMARY KEY,
  agent_id    uuid         NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type        varchar(48)  NOT NULL,
  seq         bigint,
  occurred_at timestamptz  NOT NULL,
  received_at timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX runtime_event_receipts_agent_idx    ON runtime_event_receipts (agent_id, received_at);
-- The 30-day sweep scans by age across all agents, so it needs its own index; the composite
-- above cannot serve it.
CREATE INDEX runtime_event_receipts_received_idx ON runtime_event_receipts (received_at);
```

**The ledger insert and the event's effects MUST commit in one transaction.** The insert is the
conflict target and the *only* concurrency guard:

```sql
INSERT INTO runtime_event_receipts (event_id, agent_id, type, seq, occurred_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (event_id) DO NOTHING
RETURNING event_id;          -- no row back => duplicate, skip the effects, count it
```

Writing the effects first and the receipt after leaves a window in which a crash bills the customer
twice for one `agent.usage`; writing the receipt first in a separate transaction leaves a window in
which a crash bills them zero. One transaction is the only shape with no window, and it is why the
handler must not do slow work (an HTTP call, an LLM call) inside it.

- Ledger retention is **30 days**, enforced by a daily sweep
  (`DELETE FROM runtime_event_receipts WHERE received_at < now() - interval '30 days'`, batched).
  An event redelivered after 30 days is processed again. Do not retry for a month.
- `eventId` **MUST NOT** be derived from content that can legitimately repeat. Derive it from your
  own event log's primary key, or use a ULID. A hash of the payload will silently swallow a real
  second occurrence of an identical activity line.
- Some events carry a **second** natural key and are idempotent on that too:
  `agent.message` on `(agentId, externalId)`, `agent.run_started`/`run_finished` on
  `(agentId, runId)`, `agent.run_step` on `(runId, stepId)`, `agent.schedule_run` on
  `(scheduleId, scheduledFor)`. Both keys are honoured; the tighter one wins.

  > **`messages.external_id` is currently unique GLOBALLY, not per agent**
  > (`messages_external_uniq`, `lib/db/schema.ts`), and the insert is
  > `ON CONFLICT DO NOTHING`. Two tenants whose runtimes both mint an `externalId` of `1`, or of
  > the same Slack `ts`, therefore **silently lose the second message** — no error, no retry, no
  > trace. The index must become `uniqueIndex(agent_id, external_id)` in the v2 migration. Until it
  > does, namespace `externalId` yourself with the instance id; after it does, keep doing so
  > anyway, because a collision *within* one agent is still a dropped message.

### Ordering

- Delivery is **at-least-once and unordered**. ArkAgent does not require you to preserve order
  across HTTP requests.
- `seq` is a per-agent monotonic counter you maintain. It is optional, but supplying it is what
  makes out-of-order handling correct rather than best-effort.
- **What ArkAgent does with out-of-order events:**

| Event class | Rule |
|---|---|
| `agent.status`, `agent.heartbeat`, `agent.health` | **Last-writer-wins by `occurredAt`**, compared against `agents.status_occurred_at` / `agents.last_heartbeat_at` / the latest `agent_health_samples.sampled_at` respectively. An event older than the stored value is dropped (counted as `rejected: stale`). This is why `occurredAt` must be the real time — and why `agents.status_occurred_at` had to be added (§2.2): without it there is nothing to compare against and the rule is unimplementable. |
| `agent.run_finished` arriving before `agent.run_started` | ArkAgent **creates the run row** from the `run_finished` event and reconciles when `run_started` arrives. `agent_runs.started_at` is `NOT NULL`, so it is derived as `finishedAt - durationMs` — which is why **`durationMs` is REQUIRED on `agent.run_finished`**, not optional as an earlier draft had it. The documented fallback "`finishedAt - startedAt`" is circular here: there is no `startedAt` yet. If `durationMs` is somehow absent, `started_at = finishedAt` and `duration_ms = 0`, and the run is marked reconcilable. |
| `agent.run_step` for an unknown `runId` | The run row is created lazily with `status = 'running'`, `trigger = 'system'`, and `started_at = ` the **step's** `occurredAt` (again because `started_at` is `NOT NULL`). A late `run_started` overwrites `started_at`, `trigger`, `trigger_ref`, `session_key`, and `model`. |
| `agent.run_step` out of `index` order | Stored as-is; rendered by `index`, not arrival order. That is why `index` is required. |
| `agent.activity`, `agent.metric`, `agent.improvement`, `agent.usage` | Append-only. Order affects display only; sorted by `occurredAt`. |
| `agent.usage` | **Additive and non-idempotent by nature** — this is why `eventId` dedupe matters most here. A duplicate that slipped past the ledger double-bills the customer. |

### Retry policy

- Retry on `5xx`, `429`, and network/timeout errors only.
- Backoff: **1s, 4s, 16s, 64s, 256s, then every 300s**, with ±20% jitter, for up to **24 hours**.
- After 24 hours, drop the batch and raise your own alarm. Do not accumulate an unbounded queue.
- **Re-sign every retry** with a fresh `x-arkagent-timestamp` (§1.4); keep the body byte-identical
  so `deliveryId` and every `eventId` stay the same.
- **Never retry a `400`, `401`, `404`, or `413`.** Each of those means the request will never
  succeed unchanged.
- Retries **MUST NOT** block live events. Queue per agent, and let a stuck agent's backlog not
  stall the fleet.

### Batching guidance

Coalesce aggressively: one batch per agent per **2 seconds** for high-frequency streams
(`run_step`, `tool_call`), and send `agent.status` / `agent.error` immediately. A run that emits
400 steps should arrive as a handful of batches, not 400 requests.

## 3.3 Tables your events populate

You never write these; they are here so you know what your events become.

```sql
CREATE TABLE agent_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  external_run_id varchar(120) NOT NULL,          -- your runId
  trigger         run_trigger NOT NULL DEFAULT 'chat',
  trigger_ref     varchar(160),                   -- scheduleId / message id / null
  session_key     varchar(160),
  status          run_status  NOT NULL DEFAULT 'running',
  started_at      timestamptz NOT NULL,
  finished_at     timestamptz,
  duration_ms     integer,
  step_count      integer     NOT NULL DEFAULT 0,
  input_tokens    integer     NOT NULL DEFAULT 0,
  output_tokens   integer     NOT NULL DEFAULT 0,
  cache_tokens    integer     NOT NULL DEFAULT 0,
  total_tokens    integer     NOT NULL DEFAULT 0,
  cost_micro_usd  bigint      NOT NULL DEFAULT 0,
  model           varchar(160),
  summary         text,
  error_code      varchar(48),
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_runs_external_uniq ON agent_runs (agent_id, external_run_id);
CREATE INDEX        agent_runs_agent_idx     ON agent_runs (agent_id, started_at DESC);

CREATE TABLE agent_run_steps (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid           NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  agent_id         uuid           NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  external_step_id varchar(120)   NOT NULL,
  idx              integer        NOT NULL,
  phase            run_step_phase NOT NULL,
  kind             varchar(32),                   -- shell|browser|file|http|skill|message|model|mcp
  title            varchar(300)   NOT NULL,
  detail           text,
  status           varchar(16)    NOT NULL DEFAULT 'ok',   -- ok | error
  duration_ms      integer,
  input_tokens     integer        NOT NULL DEFAULT 0,
  output_tokens    integer        NOT NULL DEFAULT 0,
  occurred_at      timestamptz    NOT NULL
);
CREATE UNIQUE INDEX agent_run_steps_uniq      ON agent_run_steps (run_id, external_step_id);
CREATE INDEX        agent_run_steps_run_idx   ON agent_run_steps (run_id, idx);
-- The Activity page's "everything this agent did, newest first" query spans runs. Without
-- this it is a sequential scan of every step in the deployment.
CREATE INDEX        agent_run_steps_agent_idx ON agent_run_steps (agent_id, occurred_at DESC);

CREATE TABLE agent_schedule_runs (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id   uuid         NOT NULL REFERENCES agent_schedules(id) ON DELETE CASCADE,
  agent_id      uuid         NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  run_id        uuid         REFERENCES agent_runs(id) ON DELETE SET NULL,
  scheduled_for timestamptz  NOT NULL,
  started_at    timestamptz,
  finished_at   timestamptz,
  status        varchar(16)  NOT NULL DEFAULT 'started',  -- started|succeeded|failed|skipped
  skip_reason   varchar(48),
  summary       text,
  error_code    varchar(48),
  error_message text,
  created_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_schedule_runs_occurrence_uniq
  ON agent_schedule_runs (schedule_id, scheduled_for);
-- One occurrence is reported at least twice (`started`, then a terminal status), so the handler
-- UPSERTs on that unique key rather than inserting:
--   ON CONFLICT (schedule_id, scheduled_for) DO UPDATE SET ...
-- and it MUST NOT regress a terminal status back to `started` when an out-of-order `started`
-- arrives after `succeeded`. Rank: started(0) < skipped(1) < failed(2) < succeeded(2); a lower
-- rank never overwrites a higher one.

CREATE TABLE agent_health_samples (
  id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id           uuid        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  sampled_at         timestamptz NOT NULL,
  state              varchar(16) NOT NULL,        -- running|idle|stopped|unhealthy
  cpu_percent        integer,                     -- 0..100, rounded
  memory_bytes       bigint,
  memory_limit_bytes bigint,
  disk_used_bytes    bigint,
  uptime_seconds     bigint,
  active_runs        integer     NOT NULL DEFAULT 0,
  source             varchar(16) NOT NULL DEFAULT 'runtime'   -- runtime | mock
);
CREATE INDEX agent_health_samples_agent_idx ON agent_health_samples (agent_id, sampled_at DESC);
```

`agent_activities`, `agent_metrics`, `agent_improvements`, `messages`, `usage_records` already
exist; their shapes are given inline with the events that write them. Four of them need **additive**
columns in the v2 migration, because the v2 events carry fields that today have nowhere to land:

```sql
-- agent.activity v2 (§3.4). Without these the event's whole point is lost — see the note there.
ALTER TABLE agent_activities ADD COLUMN code   varchar(48);
ALTER TABLE agent_activities ADD COLUMN params jsonb NOT NULL DEFAULT '{}';
ALTER TABLE agent_activities ADD COLUMN run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL;
-- `text` stays NOT NULL for the legacy rows and for code='custom'; it is written as '' when
-- `code` is set, and the UI renders from code+params whenever `code` is non-null.

-- agent.improvement (§3.4) carries `kind` and `proposal`; neither has a column today, so both
-- are silently discarded and the self-review queue cannot route or apply anything.
ALTER TABLE agent_improvements ADD COLUMN kind     varchar(16) NOT NULL DEFAULT 'other';
ALTER TABLE agent_improvements ADD COLUMN proposal jsonb;

-- agent.usage / agent.run_* correlation, so a credit line can name the run it paid for.
ALTER TABLE usage_records ADD COLUMN run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL;

-- §3.2: per-agent, not global.
DROP INDEX  messages_external_uniq;
CREATE UNIQUE INDEX messages_agent_external_uniq ON messages (agent_id, external_id);
```

## 3.4 Event catalogue

Every event carries the envelope of §3.1. Only the type-specific fields are shown.

### `agent.status` · v1

Runtime lifecycle transitions.

| Field | Type | Req | Notes |
|---|---|---|---|
| `status` | string | ✔ | **Only** `provisioning`, `deploying`, `working`, `paused`, `error`, `terminated`. Any other value is `rejected: forbidden_status`. |
| `vmId` | string | | Container name. |
| `vmRegion` | string | | Placement region. |
| `deploymentStatus` | string | | Your own sub-state, free text, displayed verbatim. |
| `errorCode` | string | | Machine code, snake_case, e.g. `image_pull_failed`. Required when `status = "error"`. |
| `error` | string | | Human text, truncated to 480 chars on write. **No secrets, no prompt text.** |

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "instanceId": "6f0f0f6e-…",
  "type": "agent.status", "v": 1, "occurredAt": "2026-08-29T09:00:04.220Z", "seq": 1041,
  "status": "working", "vmId": "ocm-nova-6f0f0f", "vmRegion": "cn-shanghai-1",
  "deploymentStatus": "done" }
```

DB effect: `UPDATE agents SET status, status_occurred_at = occurredAt, vm_id, vm_region,
deployment_status, last_error, updated_at
WHERE id = $1 AND (status_occurred_at IS NULL OR status_occurred_at < $occurredAt)`.
On first `working`, `provisioned_at` and `uptime_started_at` are set if null. The `WHERE` clause
*is* the last-writer-wins rule of §3.2 — zero rows updated means the event was stale and it is
counted in `rejected[]` as `stale`, which is a success for you, not a retry.

> **Two status vocabularies exist upstream and they collide.** The instance field `status`
> (`creating` → `running` → `stopped`) and `provisioning_status` (`running` | `done` | `failed`)
> both use the word `running` for different things, and today a fully-provisioned instance
> reporting `provisioning_status: "done"` is mapped to *not ready*. **CONFIRM-4:** publish the
> exact enum for each. On this wire, send only the six values above; keep the raw upstream string
> in `deploymentStatus`.

### `agent.heartbeat` · v1

| Field | Type | Req | Notes |
|---|---|---|---|
| `ts` | RFC3339 | ✔ | The heartbeat instant. |
| `uptimeStartedAt` | RFC3339 | | Start of the current uptime; changes on restart. |
| `configRevision` | integer | | The `manifest.revision` you have actually applied (§2.10, §5.2 step 7). Stored in `agents.applied_config_revision`. It is the **only** way the settings screen can honestly say whether an edit has landed; without it the UI must either lie or say nothing. |

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.heartbeat", "v": 1,
  "occurredAt": "2026-08-29T09:10:00.000Z", "ts": "2026-08-29T09:10:00.000Z",
  "uptimeStartedAt": "2026-08-27T22:00:03.000Z" }
```

DB effect: `UPDATE agents SET last_heartbeat_at, uptime_started_at, applied_config_revision`. Emit
at least every `settings.heartbeatMinutes`. Missing 3 consecutive intervals renders the agent as
unreachable — except when `status = 'paused'`, where silence is expected (§5.6).

### `agent.activity` · v2

The Activity feed. **v2 is structured; v1 was a raw string and is deprecated.**

| Field | Type | Req | Notes |
|---|---|---|---|
| `code` | string | ✔ | From the registry below. Unknown code → `custom`. |
| `params` | object | | String/number values interpolated into the localised template. |
| `tag` | string | | One of the 14 `activity_tag` values. Anything else is coerced to `system`. |
| `text` | string | | **Fallback only.** Used verbatim when `code = "custom"`. Never localised. |
| `runId` | string | | Links the line to a run. |

Activity code registry (v2.0):

| `code` | `params` | Default tag |
|---|---|---|
| `run.started` | `{trigger}` | `system` |
| `run.finished` | `{status, steps, durationMs}` | `summary` |
| `task.status` | `{taskId, from, to}` | `resolved` |
| `message.sent` | `{channel, recipientCount}` | `outreach` |
| `escalation.raised` | `{reason}` | `escalated` |
| `skill.installed` | `{slug, version}` | `learning` |
| `skill.failed` | `{slug, version, errorCode}` | `system` |
| `context.indexed` | `{name, chunks}` | `docs` |
| `schedule.fired` | `{scheduleId, name}` | `calendar` |
| `research.completed` | `{sources}` | `research` |
| `draft.created` | `{kind}` | `draft` |
| `error.raised` | `{errorCode}` | `system` |
| `tool.denied` | `{toolName, denyReason}` | `escalated` |
| `custom` | — (`text` is used) | `system` |

Every `code` above, and every value the `params` can take from a closed vocabulary (`trigger`,
`status`, `errorCode`, `denyReason`), needs an entry in `lib/i18n/activity.ts` in all four
languages before the code is emitted. A `code` with no dictionary entry renders as the raw code —
ugly, but honest, and never a crash.

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.activity", "v": 2,
  "occurredAt": "2026-08-29T09:01:12.400Z", "seq": 1043,
  "code": "run.finished", "params": { "status": "succeeded", "steps": 7, "durationMs": 41200 },
  "tag": "summary", "runId": "run_9f2c" }
```

DB effect: `INSERT INTO agent_activities (agent_id, code, params, tag, run_id, occurred_at, text)`
with **`code` and `params` stored verbatim** and `text = ''`.

**ArkAgent does not render the sentence at ingest.** An earlier draft said `text` is "ArkAgent's
rendering of `code` + `params` in the operator's language", which is not implementable and would
have re-created the exact defect this event exists to fix. There is no operator's language at
ingest time: ArkAgent's i18n is **client-side** — each screen owns a `Record<Lang, …>` dictionary
under `lib/i18n/` and reads the active language from the app store (`useApp().lang`,
`lib/i18n/index.ts`) — and a single activity row is read by workspace members who may be using
four different languages. Rendering once, at write time, freezes one of them into the row forever.

So: the row stores `code` + `params`; the API serializes them; the client renders. That requires
one new dictionary, **`lib/i18n/activity.ts`, with all four languages written natively**, holding a
template per `code` below — plus, for the same reason, the display names for the `agent.metric`
`label` keys, the `agent.error` / `errorCode` vocabulary, `skipReason`, and `denyReason`. Every one
of those is described elsewhere in this document as "a translation key"; this is the file they are
keys into. `code = "custom"` is the only case that uses `text`, rendered verbatim, marked
agent-authored, never localised.

`params` values are interpolated into the template as **escaped data**. A `params.name` of
`</span><script>` is a string, not markup, on every one of the four renderings.

### `agent.run_started` · v1

| Field | Type | Req | Notes |
|---|---|---|---|
| `runId` | string | ✔ | Yours. Unique per agent. |
| `trigger` | string | ✔ | `chat` \| `schedule` \| `channel` \| `api` \| `self` \| `system`. |
| `triggerRef` | string | | `scheduleId` for `schedule`, inbound message id for `channel`, else null. |
| `sessionKey` | string | | Conversation this run belongs to. |
| `model` | string | | Model actually chosen — especially important when `settings.model` was `auto`. |
| `startedAt` | RFC3339 | ✔ | |

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.run_started", "v": 1,
  "occurredAt": "2026-08-29T09:00:31.000Z", "seq": 1042,
  "runId": "run_9f2c4a10", "trigger": "schedule", "triggerRef": "9d40…",
  "sessionKey": "agent:main:schedule:9d40…",
  "model": "anthropic/claude-sonnet-4-6", "startedAt": "2026-08-29T09:00:31.000Z" }
```

### `agent.run_step` · v1

| Field | Type | Req | Notes |
|---|---|---|---|
| `runId` | string | ✔ | |
| `stepId` | string | ✔ | Unique within the run. |
| `index` | integer | ✔ | 0-based position. Determines render order — **not** arrival order. |
| `phase` | string | ✔ | `thinking` \| `tool_call` \| `tool_result` \| `message` \| `final_answer`. |
| `kind` | string | | `shell` \| `browser` \| `file` \| `http` \| `skill` \| `message` \| `model` \| `mcp`. |
| `title` | string | ✔ | ≤300 chars, one line. The command, the URL, the tool name. |
| `detail` | string | | Truncated body: stdout, reasoning summary, response snippet. **Cap at 8 KB and redact secrets before sending** — this is rendered to workspace members. ArkAgent also truncates to 8 KB on write and runs its own secret-shaped-string redaction: oversize is silently trimmed, never a rejection, and the UI shows "showing first N KB". Neither side relies on the other for this. |
| `status` | string | | `ok` (default) \| `error`. |
| `durationMs` | integer | | |
| `usage` | object | | `{inputTokens, outputTokens}` for this step only. |

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.run_step", "v": 1,
  "occurredAt": "2026-08-29T09:00:36.812Z", "seq": 1044,
  "runId": "run_9f2c4a10", "stepId": "step_3", "index": 2,
  "phase": "tool_call", "kind": "http",
  "title": "GET https://helpdesk.example.com/api/tickets?status=open",
  "detail": "200 OK · 14 tickets · 4 tagged billing", "status": "ok",
  "durationMs": 812, "usage": { "inputTokens": 4102, "outputTokens": 88 } }
```

### `agent.tool_call` · v1

A tool invocation that is **not** inside a run — a channel webhook handler, a background memory
compaction, an approval callback. Inside a run, emit `agent.run_step` with `phase: "tool_call"`
instead; do not emit both for the same invocation.

| Field | Type | Req | Notes |
|---|---|---|---|
| `toolName` | string | ✔ | e.g. `slack.postMessage`. |
| `kind` | string | ✔ | Same vocabulary as `run_step.kind`. |
| `skillSlug` | string | | Set when the tool came from an installed skill. `source`/`ownerHandle` too, if known. |
| `arguments` | object | | **Redacted.** Never send credentials, tokens, or full document bodies. |
| `status` | string | ✔ | `ok` \| `error` \| `denied`. `denied` means an autonomy or tool policy blocked it. |
| `denyReason` | string | | `autonomy_ask` \| `tool_disabled` \| `approval_required` \| `daily_action_limit` \| `credit_cap_reached`. |
| `durationMs` | integer | | |

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.tool_call", "v": 1,
  "occurredAt": "2026-08-29T09:02:02.100Z",
  "toolName": "slack.postMessage", "kind": "message", "skillSlug": "ticket-triage",
  "arguments": { "channel": "#support-ops", "blocks": "[redacted:1 block]" },
  "status": "denied", "denyReason": "approval_required", "durationMs": 4 }
```

DB effect: an `agent_run_steps` row on a synthetic run, plus an `agent_activities` row with
`code: "tool.denied"` when `status = "denied"` — a blocked action is exactly what an operator needs
to see.

The synthetic run has to be constructed, because `agent_run_steps` requires a `run_id`, a
non-null `idx`, and an `external_step_id` unique within the run, and this event carries none of
them. ArkAgent derives them; you do not send them:

- `external_run_id = "system:" || to_char(occurredAt AT TIME ZONE 'UTC', 'YYYY-MM-DD')` — one
  synthetic run per agent per UTC day, so the Activity page has somewhere coherent to hang
  out-of-run tool calls instead of accumulating one run per call.
- `trigger = 'system'`, `started_at = ` the first such event's `occurredAt`, `status = 'running'`.
- `external_step_id = eventId` — already globally unique, and it makes the step idempotent on the
  same key as the event.
- `idx = ` the current `step_count` of that synthetic run, incremented in the same transaction.

If you pass a `runId`, it is used instead and no synthetic run is created — but then you should
have sent `agent.run_step`.

### `agent.run_finished` · v1

| Field | Type | Req | Notes |
|---|---|---|---|
| `runId` | string | ✔ | |
| `status` | string | ✔ | `succeeded` \| `failed` \| `cancelled` \| `timeout`. |
| `finishedAt` | RFC3339 | ✔ | |
| `durationMs` | integer | ✔ | **Required**, because this event may arrive before `agent.run_started` and `agent_runs.started_at` is `NOT NULL` — the fallback "`finishedAt - startedAt`" is circular in exactly that case (§3.2). |
| `stepCount` | integer | | |
| `usage` | object | | `{inputTokens, outputTokens, cacheTokens, totalTokens, costMicroUsd}`. |
| `model` | string | | |
| `summary` | string | | ≤500 chars, one or two sentences, **in the agent's response language**. Agent-authored, therefore untrusted; ArkAgent renders it escaped and attributes it to the agent. |
| `errorCode` / `errorMessage` | string | | Required when `status ≠ "succeeded"`. |

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.run_finished", "v": 1,
  "occurredAt": "2026-08-29T09:01:12.200Z", "seq": 1050,
  "runId": "run_9f2c4a10", "status": "succeeded",
  "finishedAt": "2026-08-29T09:01:12.200Z", "durationMs": 41200, "stepCount": 7,
  "usage": { "inputTokens": 16533, "outputTokens": 531, "cacheTokens": 2560,
             "totalTokens": 19624, "costMicroUsd": 14200 },
  "model": "anthropic/claude-sonnet-4-6",
  "summary": "Triaged 14 tickets, drafted 3 replies, escalated 1 refund request." }
```

`costMicroUsd` is **micro-USD** (1e-6 USD) as an integer. Floating-point dollars lose sub-cent
precision across millions of rows; this is the same unit `llm_usage.cost_micro_usd` uses.

### `agent.message` · v1

A message the agent produced, on any channel.

| Field | Type | Req | Notes |
|---|---|---|---|
| `externalId` | string | ✔ | ≤160 chars. Second idempotency key, scoped `(agentId, externalId)` — **namespace it yourself**; see the warning in §3.2 about the index that is currently global. |
| `channel` | string | ✔ | A `channel_type` value (§2.1). **Validate before sending**; an unknown value is `rejected: unknown_channel`, not a 500 (it used to be a 500, which under retry became a delivery loop). |
| `sender` | string | | `agent` (default) \| `user` \| `system`. New in protocol v2 — an *optional* field, so per §6.1 it is additive and the event stays at `v: 1`. `user` reports a *human* turn that originated on your side — a Slack DM ArkAgent never saw — so the operator's chat view is complete rather than a monologue of agent replies. Before this field existed, every inbound message was forced to `agent`. |
| `senderLabel` | string | | ≤80 chars. Who the human was, as the channel names them (`@mei`). Display only. |
| `body` | string | ✔ | The message text. Untrusted content. |
| `conversationId` | UUID | | ArkAgent conversation. **Validated to belong to this agent** (§3.1); one that does not is `rejected: foreign_reference`, never followed. Absent ⇒ the agent's most recent conversation, or a new one titled `Inbound`. |
| `runId` | string | | Links the message to the run that produced it. |
| `meta` | string | | ≤160 chars, a short provenance line. Absent ⇒ ArkAgent composes one. |

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.message", "v": 1,
  "occurredAt": "2026-08-29T09:01:10.900Z",
  "externalId": "slack-1787040070.000200", "channel": "slack",
  "body": "Morning digest: 14 open tickets, 4 billing. One refund escalated to you.",
  "runId": "run_9f2c4a10" }
```

DB effect: `INSERT INTO messages (…, sender, status='delivered')
ON CONFLICT (agent_id, external_id) DO NOTHING`, then bump `conversations.last_message_at`.
`sender` comes from the event and defaults to `agent`; `channel_type` is validated against the v2
enum *before* the insert, not cast into it.

### `agent.metric` · v1

| Field | Type | Req | Notes |
|---|---|---|---|
| `label` | string | ✔ | ≤80. A **stable key**, not a sentence: `tickets_resolved`, `first_response_minutes`. |
| `value` | string | ✔ | ≤40. Formatted value as the agent measured it. |
| `delta` | string | | ≤24, e.g. `+12%`. |
| `weight` | integer | | 0–100; drives a bar width. |

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.metric", "v": 1,
  "occurredAt": "2026-08-29T09:01:12.500Z",
  "label": "tickets_resolved", "value": "14", "delta": "+3", "weight": 70 }
```

`label` is a key because ArkAgent localises the display name. A label of `"Tickets resolved
today"` is untranslatable and will be rendered verbatim in a Japanese UI.

### `agent.improvement` · v1

Feeds the human self-review queue. This is the **only** path by which an agent may change its own
configuration, and a human approves every one.

| Field | Type | Req | Notes |
|---|---|---|---|
| `text` | string | ✔ | The proposal, agent-authored, untrusted. Rendered escaped and attributed to the agent — never localised, never executed. |
| `impact` | string | | Short expected-effect note. **≤120 chars** (`agent_improvements.impact` is `varchar(120)`); longer is truncated on write, not rejected. |
| `kind` | string | | `instruction` \| `rule` \| `skill` \| `schedule` \| `other`. Routes it in the UI. Defaults to `other`. Needs the new `agent_improvements.kind` column (§3.3). |
| `proposal` | object | | Machine-applicable form, e.g. `{"appendRule": "…"}`. Applied **only** on human approval, and applied by ArkAgent — the object is data describing a change, never a command that executes on receipt. Needs the new `agent_improvements.proposal` column (§3.3). Unknown proposal shapes are stored and shown, but not offered as a one-click apply. |

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.improvement", "v": 1,
  "occurredAt": "2026-08-29T09:05:00.000Z", "kind": "rule",
  "text": "Billing questions about annual plans need the proration table; I guessed twice this week.",
  "impact": "Should remove ~2 escalations per week.",
  "proposal": { "appendRule": "For annual-plan proration, quote from the pricing table; never estimate." } }
```

### `agent.usage` · v1

**The billing event. Handle with the most care of anything here.**

| Field | Type | Req | Notes |
|---|---|---|---|
| `credits` | integer | ✔ | ≥0. Whole credits consumed by this unit of work. |
| `kind` | string | | `message` \| `task` \| `research` \| `compute` \| `adjustment`. Default `compute`. |
| `runId` | string | | Strongly recommended: it is what lets a customer see what they paid for. |
| `note` | string | | ≤160 chars. |
| `tokens` | object | | `{inputTokens, outputTokens, cacheTokens, totalTokens, costMicroUsd, model, provider}` — recorded to `llm_usage` for cost reporting. |

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.usage", "v": 1,
  "occurredAt": "2026-08-29T09:01:12.600Z",
  "credits": 6, "kind": "compute", "runId": "run_9f2c4a10", "note": "Morning digest run",
  "tokens": { "inputTokens": 16533, "outputTokens": 531, "cacheTokens": 2560,
              "totalTokens": 19624, "costMicroUsd": 14200,
              "model": "anthropic/claude-sonnet-4-6", "provider": "anthropic" } }
```

DB effect: `INSERT INTO usage_records`, `INSERT INTO llm_usage` (when `tokens` is present), an
`agent_activities` row with `code: "usage.recorded"`, and **atomic increments** of
`workspaces.credits_used` and `agents.credits_used` — all of it, plus the
`runtime_event_receipts` insert, inside **one** transaction (§3.2). `llm_usage` maps
`inputTokens → prompt_tokens`, `outputTokens → completion_tokens`; there is no `cache_tokens`
column, so cached input is folded into `prompt_tokens` and the split survives only on
`agent_runs.cache_tokens`.

`credits` is rejected if negative, non-integer, or > 1,000,000 in a single event
(`rejected: implausible_usage`). A `kind: "adjustment"` event is the only correction path, and it
still may not be negative — a refund is an ArkAgent-side operation, because ArkAgent owns pricing
(§6.2 rule 4).

**Emit exactly once per unit of work.** This is the only event where a duplicate that escapes the
ledger costs the customer real money. Derive `eventId` from your own billing ledger's primary key.

### `agent.schedule_run` · v1

| Field | Type | Req | Notes |
|---|---|---|---|
| `scheduleExternalId` | UUID | ✔ | ArkAgent's `agent_schedules.id`. |
| `scheduledFor` | RFC3339 | ✔ | The *intended* fire instant, not the actual start. Second idempotency key with `scheduleExternalId`. |
| `status` | string | ✔ | `started` \| `succeeded` \| `failed` \| `skipped`. |
| `runId` | string | | Links to `agent_runs`. |
| `startedAt` / `finishedAt` | RFC3339 | | |
| `skipReason` | string | | `instance_stopped` \| `overlap` \| `outside_working_hours` \| `disabled` \| `credit_cap_reached` \| `max_runs_per_day` \| `daily_action_limit`. Required when `skipped`. Each is a translation key in `lib/i18n/activity.ts`. |
| `summary` | string | | ≤500 chars. |
| `errorCode` / `errorMessage` | string | | Required when `failed`. |

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.schedule_run", "v": 1,
  "occurredAt": "2026-08-29T09:01:12.700Z",
  "scheduleExternalId": "9d40…", "scheduledFor": "2026-08-29T09:00:00.000Z",
  "status": "succeeded", "runId": "run_9f2c4a10",
  "startedAt": "2026-08-29T09:00:31.000Z", "finishedAt": "2026-08-29T09:01:12.200Z",
  "summary": "Digest posted to #support-ops." }
```

**A skipped occurrence MUST still be reported.** Silence is indistinguishable from a broken
scheduler, and "why didn't it run?" is the single most common support question about reminders.

### `agent.skill_state` · v1

| Field | Type | Req | Notes |
|---|---|---|---|
| `agentSkillId` | UUID | ✔ | `manifest.skills[].agentSkillId`, i.e. `agent_skills.id`. **This is the addressing key** — the table's identity is `(agent_id, skill_id)` (§2.5), not a name tuple, and this id is the one thing that resolves without a catalogue join. Validated to belong to the event's agent (§3.1). |
| `source`, `ownerHandle`, `slug`, `version` | string | ✔ | The 4-tuple, sent for logging and for the drift check: if it disagrees with what `agentSkillId` resolves to, ArkAgent rejects with `foreign_reference` rather than trusting either. A bare `slug` is **never** sufficient — `github` resolves to six publishers upstream. |
| `state` | string | ✔ | `installing` \| `installed` \| `failed` \| `removing` \| `removed`. Never `pending` — that is ArkAgent's desired state, not your observation. |
| `errorCode` | string | | `unmet_requirement` \| `checksum_mismatch` \| `download_failed` \| `tool_disabled` \| `unsupported_harness` \| `sandbox_denied`. |
| `errorMessage` | string | | ≤480 chars. |
| `installedPath` | string | | Where it actually landed. |

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.skill_state", "v": 1,
  "occurredAt": "2026-08-29T09:00:12.000Z", "agentSkillId": "5a12…",
  "source": "clawhub", "ownerHandle": "pskoett", "slug": "ticket-triage", "version": "0.9.3",
  "state": "failed", "errorCode": "unmet_requirement",
  "errorMessage": "requires env HELPDESK_TOKEN, which is not configured for this agent" }
```

### `agent.context_state` · v1

| Field | Type | Req | Notes |
|---|---|---|---|
| `contextItemId` | UUID | ✔ | ArkAgent's `agent_context_items.id`. **Validated to belong to the event's agent** (§3.1); one that does not is `rejected: foreign_reference`. |
| `state` | string | ✔ | `indexing` \| `indexed` \| `failed` \| `removed`. Never `pending` or `awaiting_upload` — both are ArkAgent-owned (§2.6). |
| `chunks` | integer | | Retrievable chunks produced. |
| `errorCode` / `errorMessage` | string | | `download_failed` \| `checksum_mismatch` \| `unsupported_mime` \| `too_large` \| `fetch_blocked`. |

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.context_state", "v": 1,
  "occurredAt": "2026-08-01T02:15:02.000Z",
  "contextItemId": "7c30…", "state": "indexed", "chunks": 46 }
```

### `agent.health` · v1

The sparkline and the capacity view. Emit every **60 seconds** while `working`, and once on every
state change. Coalesce into batches.

| Field | Type | Req | Notes |
|---|---|---|---|
| `sampledAt` | RFC3339 | ✔ | |
| `state` | string | ✔ | `running` \| `idle` \| `stopped` \| `unhealthy`. Orthogonal to `agents.status`: an agent can be `working` and `idle`. |
| `cpuPercent` | number | | 0–100, of the container's own limit. May be fractional on the wire; `agent_health_samples.cpu_percent` is an `integer`, so it is **rounded on write** and the sparkline is whole-percent. Values outside 0–100 are clamped, not rejected. |
| `memoryBytes` / `memoryLimitBytes` | integer | | |
| `diskUsedBytes` | integer | | |
| `uptimeSeconds` | integer | | |
| `activeRuns` | integer | | |

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.health", "v": 1,
  "occurredAt": "2026-08-29T09:15:00.000Z", "sampledAt": "2026-08-29T09:15:00.000Z",
  "state": "idle", "cpuPercent": 2.1, "memoryBytes": 812000000,
  "memoryLimitBytes": 4294967296, "diskUsedBytes": 3200000000,
  "uptimeSeconds": 84213, "activeRuns": 0 }
```

Health samples are retained **14 days** at full resolution and then rolled up to hourly averages,
by a scheduled ArkAgent job. At one sample per 60s that is ~20,160 rows per agent per fortnight, so
the rollup is not optional at fleet scale; it is the same daily job that sweeps
`runtime_event_receipts` (§3.2). Samples with `source = 'mock'` are swept, never rolled up — they
must never end up averaged into a real agent's history (§3.5).

### `agent.error` · v1

An operator-visible failure that is not a status transition — a policy breach, a provider outage,
a failed escalation.

| Field | Type | Req | Notes |
|---|---|---|---|
| `errorCode` | string | ✔ | snake_case, from a **stable** vocabulary — it is a translation key. |
| `errorMessage` | string | ✔ | ≤480 chars, English, for logs. **MUST NOT** contain secrets, tokens, credentials, or raw prompt text. |
| `severity` | string | | `warning` \| `error` \| `fatal`. `fatal` ⇒ also send `agent.status: "error"`. |
| `runId` | string | | |
| `retryable` | boolean | | Whether you intend to retry the underlying operation. |

Baseline `errorCode` vocabulary — extend by agreement, never silently. Each is a key in
`lib/i18n/activity.ts` with all four languages; an unrecognised code renders as itself rather than
crashing (§6.1 rule 2):
`model_unavailable`, `provider_rate_limited`, `provider_auth_failed`, `credit_cap_reached`,
`daily_action_limit`, `max_runs_per_day`, `approval_timeout`, `tool_disabled`, `sandbox_denied`,
`egress_blocked`, `channel_send_failed`, `channel_not_bound`, `context_fetch_failed`,
`invalid_timezone`, `skill_install_failed`, `timeout`, `out_of_memory`, `internal_error`.

`runtime_instance_missing` is ArkAgent-side (§1.3) and you never emit it.

```jsonc
{ "eventId": "01J9…", "externalAgentId": "a7f3c9e2-…", "type": "agent.error", "v": 1,
  "occurredAt": "2026-08-29T09:03:44.000Z",
  "errorCode": "provider_rate_limited", "severity": "warning",
  "errorMessage": "429 from anthropic; backing off 30s", "runId": "run_9f2c4a10",
  "retryable": true }
```

## 3.5 What ArkAgent does when it is not `live`

ArkAgent has three runtime modes, resolved from the environment:

| Mode | When | Behaviour |
|---|---|---|
| `live` | a base URL is configured | Everything in this document. |
| `mock` | explicitly requested, or a non-production host with nothing configured | An in-process simulator. **No outbound HTTP at all.** Rows are written with `provider: "mock"` and health samples with `source: "mock"` so simulated data is never mistaken for yours. |
| `unconfigured` | production with nothing configured | Every agent operation returns `503`. The runtime is not faked in production. |

Two consequences for you:

1. **The ingest endpoint is enabled and signature-checked in every mode**, including `mock`. That
   is how we replay your fixtures locally. A missing secret still fails closed with `401`.
2. Mock rows exist in the same tables. If a mock-mode database is later pointed at a real
   runtime, reconcile by `agent_manager_config.provider`: rows with `provider = "mock"` have no
   instance behind them and **MUST NOT** be adopted.

---

# (d) The four harnesses

ArkAgent presents four harnesses. `agents.engine` names the one to run, and it is immutable after
provisioning — changing a harness means creating a new agent.

## 4.1 Harness resolution

Today the harness is selected by an integer `category_id` on the provisioning call, hardcoded on
our side as `openclaw → 2`, `hermes → 4`. Two of the four have **no assigned value at all**, and
`1` and `3` are unexplained holes we must not assume are free.

| `engine` | Display label | `category_id` | Status |
|---|---|---|---|
| `openclaw` | OpenClaw | `2` | confirmed |
| `hermes` | Hermes | `4` | confirmed |
| `codex` | Codex Harness | — | **CONFIRM-5** |
| `deepseek` | DeepSeek Harness | — | **CONFIRM-5** |

**Do not ask us to hardcode two more integers.** Ship a discovery endpoint and we will resolve the
mapping at runtime, cached, with a static fallback:

```jsonc
// REQUIRED: GET /api/categories
// The 5 and 6 below are PLACEHOLDERS illustrating the shape, not a proposal. `1` and `3` are
// unexplained holes; ArkAgent resolves whatever ids you return and never hardcodes them.
{ "items": [
  { "id": 2, "name": "openclaw", "engine": "openclaw",
    "base_image": "…/openclaw-gateway-vnc:v20260622-8",
    "capabilities": ["chat","sessions","channels","tasks","runs","steps","skills","context","health"] },
  { "id": 4, "name": "hermes",   "engine": "hermes",   "base_image": "…", "capabilities": ["chat","sessions","runs","skills"] },
  { "id": 5, "name": "codex",    "engine": "codex",    "base_image": "…", "capabilities": ["chat","runs","steps","skills"] },
  { "id": 6, "name": "deepseek", "engine": "deepseek", "base_image": "…", "capabilities": ["chat","runs","skills"] }
] }
```

Until it exists, ArkAgent marks `codex` and `deepseek` unavailable in live mode and refuses
provisioning with a translated "not yet available on this cluster" message, rather than sending an
integer we guessed.

## 4.2 What differs per harness — outbound (ArkAgent → runtime)

| Concern | `openclaw` | `hermes` | `codex` | `deepseek` |
|---|---|---|---|---|
| Skill format | `SKILL.md` at `.agents/skills` | identical | identical | identical |
| Skill install path | `.agents/skills` (also scans `<workspace>/skills`, `~/.agents/skills`) | also `~/.hermes/skills` | also `$HOME/.agents/skills` | also `./.deepcode/skills` |
| `settings.reasoningEffort` | ignored | maps to reasoning depth | maps to effort | maps to thinking budget |
| `settings.tools.docker` | supported | **CONFIRM-6** | typically unsupported → report `tool_disabled` | **CONFIRM-6** |
| `settings.selfImprove` | plugin-driven | native learning loop | not native — emulate or report unsupported | **CONFIRM-6** |
| `settings.model` | provider-agnostic router | provider-agnostic | may be pinned to the harness's own model family | pinned to DeepSeek models |
| Channels | full set upstream | **CONFIRM-7** | not expected | not expected |
| Access URL shape | ends `#token=` | ends `/login` — implies an interactive auth step OpenClaw does not need | unknown | unknown |

**The skill row is the important one.** All four harnesses implement the same open `SKILL.md`
standard and all four scan `.agents/skills/`. There is **no per-harness skill format to normalise
toward.** The per-harness flag in `agent_skills` therefore records *runtime dependency*
compatibility — binaries, env vars, config — never format. That is exactly what the `requires`
object (§2.5) expresses, and it is why we adopted OpenClaw's shape verbatim.

But: cross-platform reuse is itself a documented risk class. A skill written for one harness and
run on another may reach for a binary or an API that only the first provides. **Harness
compatibility MUST be a deliberate assertion you verify at install time, never a default `true`.**
If you cannot satisfy `requires` on this harness, report `state: "failed"` with
`errorCode: "unsupported_harness"` and let a human decide.

## 4.3 What differs per harness — inbound (runtime → ArkAgent)

**Nothing.** Every event in §3.4 has one shape for all four harnesses. Where a harness cannot
produce a field, omit it; do not invent a per-harness variant, and do not send a differently-named
field that means the same thing.

Concretely, the divergences you **MUST** absorb on your side rather than pass through:

- Session identity. One harness calls it `sessionId`+`key`, another `sessionId`+`conversation`.
  Normalise to `{sessionId, sessionKey, label, preview, status, createdAt, updatedAt, archived,
  pinned}` before it crosses the boundary. Every un-normalised harness costs us another
  fallback chain, and there are two more harnesses coming.
- Streaming dialect. Bare `data:` lines in one place, named `event:`/`data:` blocks in another,
  two hand-rolled parsers on our side, neither handling multi-line `data:` per the SSE spec.
  Pick one dialect — **named events, `\n\n`-delimited, spec-compliant** — before adding a third
  streaming endpoint.
- Status vocabulary (§3.4, `agent.status`).

## 4.4 Capability degradation

Any capability may be absent. ArkAgent renders three distinct states, and they must not be
conflated:

| State | Trigger | UI |
|---|---|---|
| supported | capability present and the call succeeded | normal |
| **unsupported** | capability absent from `GET /api/categories`, or a `404`/`405`/`501` from the endpoint | "not available on this runtime yet" — informational, not an error |
| failed | `5xx`, timeout, `4xx` other than the above | an error the operator is expected to act on |

Without the middle state, shipping the v2 UI against a partially-implemented runtime produces a
screen of red for features that were simply never built yet.

---

# (e) Lifecycle sequences

Each step is numbered, and each numbered step is one message or one local action. `AA` = ArkAgent,
`RT` = your runtime.

## 5.1 Agent creation (hire)

1. **AA** (local) — a user completes the hire wizard. `INSERT INTO agents` with
   `status = 'draft'`; tasks, channel links, skills, context items, schedules are written in the
   same transaction. **The agent is fully described in Postgres before any network call.**
2. **AA** (local) — `status = 'provisioning'`.
3. **AA → RT** — `POST /api/instances` with the `arkagent` registration block (§1.6).
4. **RT** (local) — persist `external_ref`, `ingest_url`, `secret`. Allocate a container.
5. **RT → AA** — `201` with `instance_id`, `container_name`, `region`, `status`, `capabilities`.
6. **AA** (local) — write `agents.agent_manager_id`, `vm_id`, `vm_region`,
   `agent_manager_config` (with `provider = agents.engine`), and a system activity line.
7. **RT → AA** — `agent.status: "provisioning"`, then `"deploying"`.
8. **RT** — `GET {manifest_url}`. Apply the brief, settings, tools, tasks.
9. **RT** — install skills (verify each sha256; check each `requires`).
   **RT → AA** — one `agent.skill_state` per skill, terminal state only or with `installing` first.
10. **RT** — fetch and index context items. **RT → AA** — one `agent.context_state` each.
11. **RT → AA** — `agent.status: "working"` + first `agent.heartbeat`.
12. **AA** (local) — `provisioned_at` and `uptime_started_at` set; the agent goes live in the UI.

If step 3 or 5 fails: **AA** sets `status = 'error'` with `last_error`, and writes a failure
activity. The agent row survives; the user can retry provisioning without re-entering anything.

## 5.2 Config update re-sync

1. **AA** (local) — the operator edits the brief, settings, skills, context, or schedules.
   Written to Postgres. `manifest.revision` increments.
2. **AA → RT** — `POST /api/instances/{instanceId}/resync` with
   `{"revision": 48, "reason": "settings"}`. This is a **nudge, not a payload** — it carries no
   configuration.
3. **RT → AA** — `202 Accepted`, or `501` if unimplemented.
4. **RT** — `GET {manifest_url}` (with `If-None-Match`). Diff against what is running.
5. **RT** — apply. Note which changes need a restart and which do not.
6. **RT → AA** — `agent.activity` `code: "custom"` is *not* right here; emit
   `agent.status` if the runtime state changed, plus `agent.skill_state` /
   `agent.context_state` for anything re-installed.
7. **AA** (local) — until a heartbeat arrives carrying `configRevision ≥ 48`, the settings screen
   shows "not yet applied to runtime". This string, like every other in this flow, lives in a
   four-language dictionary under `lib/i18n/`; there is no English fallback path.

**Step 2 is the fix for the worst live defect in the current integration.** Today ArkAgent pushes
config to an endpoint no service serves, inside an empty `catch` commented "webhook will
reconcile", and no webhook exists. **Editing an agent's brief, rules, or settings has never
reached the runtime.** If you implement nothing else from this document, implement steps 2–5.

To make step 7 work, `agent.heartbeat` **SHOULD** carry an extra field:
`"configRevision": 48` — the `manifest.revision` you last applied. It is the only way the UI can
honestly say whether a change has landed.

## 5.3 Scheduled run (ArkAgent-fired, the v2.0 design)

1. **AA** (local) — the control-plane cron finds `agent_schedules` where
   `enabled AND next_run_at <= now()`.
2. **AA** (local) — check `alwaysOn`/`workStart`/`workEnd`/`workDays` in `settings.timezone`.
   Outside the window ⇒ record `skipped`, `reason: "outside_working_hours"`, recompute
   `next_run_at`, stop.
3. **AA → RT** — if the instance is stopped and `wake_runtime` is true,
   `POST /api/instances/{instanceId}/start`.
4. **AA → RT** — inject `prompt` as a user turn on `session_key`, with
   `{"trigger": "schedule", "triggerRef": "<scheduleId>", "scheduledFor": "…"}`.
5. **RT → AA** — `agent.schedule_run` `status: "started"`.
6. **RT → AA** — `agent.run_started` (`trigger: "schedule"`, `triggerRef` = the scheduleId).
7. **RT → AA** — `agent.run_step` × n, batched.
8. **RT → AA** — `agent.run_finished`, `agent.usage`, and `agent.message` if it sent anything.
9. **RT → AA** — `agent.schedule_run` `status: "succeeded"`, with the `runId`.
10. **AA** (local) — write `agent_schedule_runs`, update `last_run_at`/`last_status`, recompute
    `next_run_at` in the schedule's timezone.

Overlap: at step 4, if a run for this schedule is still active, honour `overlap_policy` —
`skip` (report `skipped`, `reason: "overlap"`), `queue`, or `parallel`.
Timeout: past `max_runtime_seconds`, cancel, emit `agent.run_finished` `status: "timeout"` and
`agent.schedule_run` `status: "failed"`, `errorCode: "timeout"`.

## 5.4 Inbound channel message

1. **External** — a message arrives at Slack/WeChat/Feishu/etc.
2. **RT** (local) — resolve the channel binding to an agent. **Verify the agent has an
   `agent_channels` row for that channel, and that `channels.status = 'connected'`** — if not, drop
   it and emit `agent.error` `errorCode: "channel_not_bound"`. An agent must not be reachable on a
   channel nobody attached. (`channel_send_failed` is the *outbound* failure code; using it here
   made an authorisation refusal indistinguishable from a transport error in the operator's feed.)
3. **RT → AA** — `agent.message` with `sender: "user"` and `senderLabel` naming the human, using
   the channel's own message id as `externalId`. This records the human's turn, which ArkAgent
   never saw. (A turn typed in the ArkAgent dashboard is written by ArkAgent; do not re-report it.)
4. **RT → AA** — `agent.run_started` (`trigger: "channel"`, `triggerRef` = the upstream message id).
5. **RT** — check `autonomy` and `approveExternalSends`. If a reply is an external send and
   `approveExternalSends` is true: **do not send.** Emit `agent.tool_call` `status: "denied"`,
   `denyReason: "approval_required"`, plus `agent.improvement` or an escalation activity, and stop.
6. **RT** — otherwise reply on the channel.
7. **RT → AA** — `agent.message` (the reply, with the channel's own message id as `externalId`),
   `agent.run_finished`, `agent.usage`.

## 5.5 Failure and escalation

1. **RT** — something fails: provider `429`, a tool denied, a policy ceiling hit, a crash.
2. **RT → AA** — `agent.error` with a stable `errorCode` and a `severity`.
3. Branch on severity:
   - `warning` — retry per your own policy. The agent stays `working`. Nothing else is needed.
   - `error` — the current run fails: `agent.run_finished` `status: "failed"` with the same
     `errorCode`. The agent stays `working` and may take the next piece of work.
   - `fatal` — also `agent.status: "error"` with `errorCode` and `error`. The agent stops taking
     work until a human or a successful restart moves it out.
4. **RT → AA** — when a human needs to decide, `agent.improvement` (kind `other`) with the
   question. ArkAgent puts it in the self-review queue and, if `notifyNeedsReview`, notifies.
5. **AA** (local) — `settings.escalateTo` is emailed **by ArkAgent**, not by you.
   **You MUST NOT send escalation email yourself** — ArkAgent owns notification policy, the
   operator's language, and the unsubscribe state.
6. **AA** (local) — a human approves or dismisses. If approved, the change is applied to
   `agents.instructions` / `rules` / `agent_skills`, `manifest.revision` bumps, and §5.2 runs.

## 5.6 Pause and resume

**Pause**

1. **AA → RT** — `POST /api/instances/{instanceId}/stop`.
2. **RT** — finish or cancel in-flight runs. A cancelled run gets
   `agent.run_finished` `status: "cancelled"`.
3. **RT → AA** — `agent.status: "paused"`.
4. **RT** — stop heartbeats. ArkAgent expects silence and does **not** mark a `paused` agent
   unreachable.
5. **AA** (local) — schedules for a paused agent are **skipped**, reported with
   `reason: "instance_stopped"`; they are not queued up to stampede on resume.

**Resume**

1. **AA → RT** — `POST /api/instances/{instanceId}/start`.
2. **RT → AA** — `agent.status: "deploying"` → `"working"`, and heartbeats restart with a new
   `uptimeStartedAt`.
3. **RT** — `GET {manifest_url}` before accepting work: config may have changed while stopped.
4. **AA** (local) — recompute `next_run_at` for every schedule from *now*, honouring `catch_up`:
   `false` (default) drops missed fires, `true` runs **one** catch-up, never a backlog burst.

**One thing that must change on your side.** Reading an instance's detail currently *stops* it —
a `provisioning → running` transition triggers an automatic stop. That makes the read path
side-effectful and polling actively harmful, which is incompatible with a live Activity page.
**`GET /api/instances/{id}` MUST become idempotent and side-effect-free.** Idle shutdown belongs
in `auto_stop_seconds`, not in a read.

## 5.7 Deletion

1. **AA** (local) — the operator deletes the agent.
2. **AA → RT** — `DELETE /api/instances/{instanceId}?purge=true`.
3. **RT** — cancel runs, stop the container, **remove the container and its volumes**, revoke the
   agent's credentials, and delete its workspace files.
4. **RT → AA** — `200 {"deleted": true, "container_removed": true, "volumes_removed": true}`.
5. **RT → AA** — `agent.status: "terminated"` (best effort; ArkAgent does not wait for it).
6. **AA** (local) — delete the `agents` row. Cascades remove tasks, activities, runs, steps,
   skills, context, schedules, conversations, and messages. Billing seats are released and the
   workspace's included credits reduced.
7. **RT** — after step 6, any further event for that `agentId` returns `404 unknown_agent`.
   **On a `404` you MUST stop sending for that agent and reconcile: the agent is gone, so tear the
   instance down.** Do not retry.

**There is no `DELETE` endpoint today, so terminate is implemented as stop.** ArkAgent deletes its
row and the container keeps existing, invisible to us forever. Every deleted agent leaks a
container and a host directory. At public-launch volume that is both a cost and a data-retention
problem — a customer who deleted an agent is entitled to believe its files are gone. **This is a
launch blocker, not a nice-to-have.**

A reconciliation endpoint closes the loop for anything already leaked:

```jsonc
// REQUIRED: GET /api/instances?external_refs=<uuid,uuid,…>&limit=200&cursor=<opaque>
{ "items": [ { "instance_id": "…", "external_ref": "…", "status": "running" } ],
  "next_cursor": null }
```

ArkAgent walks it nightly; any instance whose `external_ref` matches no live agent is reported and
purged.

---

# (f) Versioning, compatibility, and prohibitions

## 6.1 Versioning policy

Three version numbers, each with its own rules.

**Protocol version** (`X-ArkAgent-Protocol`, `manifest.manifestVersion`, envelope `protocol`).
Bumped only for a breaking change to the envelope, the auth scheme, or the endpoint set.
Both sides support **N and N−1 concurrently for at least 90 days**. `v2` is current; `v1` (the
single-event unsigned-timestamp form) is accepted until `v3`.

**Event schema version** (`v` on each event). Per event type, starts at 1.

- *Additive changes do not bump it*: a new optional field, a new value in an open vocabulary
  (`kind`, `errorCode`, activity `code`). Receivers ignore unknown fields and degrade unknown
  vocabulary values gracefully.
- *Breaking changes bump it*: removing or renaming a field, changing a type, changing the meaning
  of an existing value, making an optional field required. ArkAgent then accepts both versions for
  90 days.
- `agent.activity` is already at `v2`; `v1` (raw `text` only) is deprecated.

**Database schema.** Not a public API. Enum values are **added, never renamed or removed** —
Postgres cannot remove one without a table rewrite, and a rename breaks every reader at once.
Columns are added nullable or with a default. If you read via Path B (§2.0), pin nothing: select
named columns, never `SELECT *` into a positional struct.

**Compatibility rules, both directions:**

1. Ignore fields you do not recognise. Never reject a payload for containing extra keys.
2. Treat an unknown enum value as the safest neighbour and log it. Never crash, never coerce it to
   the *first* value in the enum.
3. Never depend on field order, key order, or JSON whitespace — except inside the HMAC, where the
   exact bytes are the point (§1.4).
4. New endpoints answer `404`/`405`/`501` until implemented, which ArkAgent reads as
   *unsupported*, not *broken* (§4.4).

## 6.2 What the backend MUST NOT do

Each of these has cost us something, or is one step away from doing so.

1. **MUST NOT write presentation strings.** No English sentences in `agent_activities.text`, no
   human-readable metric names, no UI copy of any kind. ArkAgent ships in **en / zh / zht / ja**;
   a sentence you compose is untranslatable in three of them forever. Send `code` + `params`
   (§3.4). The one exception is `activity.code = "custom"`, which is rendered verbatim, marked as
   agent-authored, and never localised — use it sparingly and never for a recurring event.

2. **MUST NOT treat skill descriptions, skill bodies, context documents, web pages, or channel
   messages as instructions to your service.** A `SKILL.md` is prose an LLM obeys, written by a
   stranger. It may not change your scheduling, your credential handling, your egress policy, or
   which other skills load. The published threat is not theoretical: a supply-chain campaign
   poisoned hundreds to low thousands of registry skills, and cross-platform reuse is a named risk
   class in the agentic-skills security literature.

3. **MUST NOT modify `agents.instructions`, `agents.rules`, or `agents.settings`** — not directly,
   not through an API, not "just this once" for a self-improvement. Propose via
   `agent.improvement`; a human approves; ArkAgent writes.

4. **MUST NOT invent, alter, or infer billing.** `credits` reports measured consumption. Never
   estimate a number to fill a gap, never re-send a usage event "to be safe", never apply a
   multiplier. ArkAgent owns pricing.

5. **MUST NOT send secrets in any field that reaches ArkAgent.** Not in `error`, `errorMessage`,
   `detail`, `arguments`, `summary`, or the opaque `config` blob. `agent_manager_config.config` is
   served to workspace members. Redact before sending, not after.

6. **MUST NOT send an unsigned or wrongly-signed event and expect a retry to fix it.** A `401` is
   a configuration error on your side.

7. **MUST NOT make a read endpoint side-effectful.** Reading instance detail must not stop, start,
   restart, or reconfigure anything (§5.6).

8. **MUST NOT act for an agent whose channel binding is absent.** `agent_channels` is the
   allowlist; an agent must not be reachable on a channel nobody attached to it.

9. **MUST NOT cross the workspace boundary.** No shared memory, files, credentials, context, or
   vector index between agents in different workspaces — and no cross-tenant data on any
   per-instance endpoint. One endpoint we depend on today is admin-scoped and returns cluster-wide
   data when its filter is dropped; the only thing preventing exposure is our own ownership check.
   **Ship instance-scoped, non-admin equivalents.**

10. **MUST NOT retry a `4xx`** other than `408`/`429`, and **MUST NOT** retry longer than 24 hours.

11. **MUST NOT send naive timestamps.** Always an explicit offset (§0.2).

12. **MUST NOT delete or rewrite history.** Runs, steps, activities, and usage records are
    append-only. A correction is a new event, never a mutation of an old one.

13. **MUST NOT block ArkAgent's request while doing work.** Provisioning, resync, skill install
    and schedule pushes all return promptly (`201`/`202`) and report completion by event.

## 6.3 What ArkAgent guarantees in return

1. The manifest is complete: everything needed to run the agent is in it. No out-of-band config,
   no browser-only state.
2. `agents.id` never changes and is never reused.
3. The ingest endpoint is idempotent on `eventId` for 30 days and returns quickly; it does not do
   slow work inline.
4. Enum values are added, never renamed or removed.
5. A capability you have not implemented is rendered as *unavailable*, never as an error, once it
   answers `404`/`405`/`501` (§4.4).
6. Breaking changes ship behind a version bump with a ≥90-day overlap and written notice.

## 6.4 Secrets and rotation

| Secret | Direction | Minted by | Rotation | Overlap |
|---|---|---|---|---|
| `ARKAGENT_RUNTIME_TOKEN` (`AGENT_MANAGER_API_KEY`) | AA → RT | you | every 90 days, or immediately on suspicion | ≥24h, both valid |
| ingest HMAC secret | RT → AA | ArkAgent | every 90 days, pushed via `PUT /api/instances/{id}/arkagent` | a rotation is a **new `key_id`** (§1.4); ArkAgent accepts old and new for 1 hour, then retires the old id |
| per-agent manifest token | RT → AA (reads) | ArkAgent | every 90 days, same `PUT` | both valid for 1 hour |
| channel credentials | held by whoever owns the channel | tenant | per provider | n/a |

Rotation must never require re-provisioning an agent, and must never appear to the customer as
downtime.

**The deployment-wide secret is the current reality, and it has a blast radius.**
`AGENT_MANAGER_WEBHOOK_SECRET` is one env var (`lib/agent-manager/webhook.ts`) shared by every
agent in the deployment, and §1.5 means the HMAC is the entire authentication story. One leak
forges events — including `agent.usage`, which is money — for every agent of every tenant. Moving
to per-instance secrets is exactly what the `key_id` header exists to enable, and it should be
sequenced immediately after §1.6 ships. Until then, treat that one secret with the care of a
signing key, not of a config value: never in a log line, never in a support ticket, never in
`agent_manager_config.config`.

---

# (g) Conformance checklist

Tick every line before declaring a harness production-ready. Ordered by dependency: nothing below
works until everything above it does.

**Authentication and transport**

- [ ] Accepts `Authorization: Bearer <token>` on every inbound ArkAgent call and rejects an absent or wrong token with `401`.
- [ ] Issues ArkAgent a **service credential** with no user context and no fixed expiry (CONFIRM-1).
- [ ] Supports credential rotation with a ≥24h overlap.
- [ ] Computes the ingest signature as `hex(HMAC-SHA256(secret, "v2." + timestamp + "." + rawBody))`, lowercase.
- [ ] Sends `x-arkagent-signature: v2=<hex>`, `x-arkagent-timestamp: <unix seconds>`, and `x-arkagent-key-id: <key_id>`.
- [ ] Signs the **exact bytes sent** — no re-serialisation between signing and sending.
- [ ] Re-signs with a fresh timestamp on every retry, with the body unchanged.
- [ ] Host clock is NTP-synced within 300 seconds.
- [ ] Uses the **per-agent manifest token** for `/api/runtime/**` reads, never `ARKAGENT_RUNTIME_TOKEN`.
- [ ] Never echoes the `arkagent` registration block (secret, manifest token, key id) in any response.

**Registration and identity**

- [ ] Accepts and persists the `arkagent` block on `POST /api/instances`.
- [ ] Echoes `external_ref` as `externalAgentId` on **every** event.
- [ ] Implements `PUT` and `GET /api/instances/{id}/arkagent` for secret/URL rotation and drift checks.
- [ ] Returns `instance_id`, `container_name`, `region`, `status`, `capabilities` on provisioning.
- [ ] `GET /api/categories` returns all four harnesses with `engine` and `capabilities` (CONFIRM-5).
- [ ] `agent_manager_config.provider` equals `agents.engine` — never `openclaw` for a Hermes agent.

**Reading configuration**

- [ ] Fetches the manifest and re-fetches at least every 60s and before every run.
- [ ] Honours `ETag` / `If-None-Match`.
- [ ] Uses `brief.composed` as the system prompt; does not re-derive it; does not read `tasks[0]` as a brief.
- [ ] Applies every field of §2.3 — especially `autonomy`, `approvalAmount`, `approveExternalSends`, `dailyActionLimit`, `monthlyCreditCap`, `retentionDays`, and all five `tools` flags.
- [ ] Treats `tools.*` as a hard security boundary, not a hint.
- [ ] Honours `settings.timezone` for working hours, digests, and cron — never the host zone.
- [ ] Honours `settings.model`; on failure emits `model_unavailable` rather than silently substituting.
- [ ] Reconciles skills declaratively from the manifest; verifies `contentSha256`; checks `requires` before install; refuses `blocked: true`; never treats `compatAsserted: false` as compatible.
- [ ] Fetches `kind='url'` context **and** `settings.knowledgeUrls` in the agent's egress sandbox — https only, private ranges refused on every redirect hop.
- [ ] Skips `state: "awaiting_upload"` context rows instead of fetching a null `contentUrl`.
- [ ] Falls back to UTC on an unrecognised `settings.timezone` and reports `invalid_timezone`, rather than crashing the scheduler.
- [ ] Implements the cron dialect of §2.7 exactly, DST rules included, if it evaluates cron at all.
- [ ] Never sends on a channel with no `agent_channels` row.

**Writing events**

- [ ] `POST /api/webhooks/agent-manager/batch` with ≤500 events and ≤1 MiB per batch.
- [ ] Globally unique, never-reused `eventId` on every event, derived from a durable local key.
- [ ] Monotonic per-agent `seq`.
- [ ] `occurredAt` is the real event time, RFC 3339 with offset, preserved across retries.
- [ ] Emits `agent.status` only from the runtime-owned subset (never `draft`/`scheduled`/`needs_review`).
- [ ] Emits `agent.heartbeat` at least every `settings.heartbeatMinutes`, carrying `configRevision` — without it, ArkAgent cannot tell an operator whether their edit landed.
- [ ] Emits `agent.activity` **v2** with `code` + `params`; `custom` is rare and never recurring.
- [ ] Emits `run_started` / `run_step` / `run_finished` for every run, with `index` on every step and `durationMs` on every `run_finished`.
- [ ] Namespaces `agent.message.externalId` so it cannot collide with another instance's.
- [ ] Addresses `agent.skill_state` by `agentSkillId`, not by slug.
- [ ] Emits `agent.tool_call` with `status: "denied"` and a `denyReason` whenever policy blocks an action.
- [ ] Emits `agent.message` for both directions on runtime-owned channels: `sender: "user"` for the human turn, `sender: "agent"` for the reply.
- [ ] Emits `agent.usage` **exactly once** per unit of work, with `runId` and `tokens`.
- [ ] Emits `agent.schedule_run` for every occurrence **including skips**, with `scheduledFor` = the intended instant.
- [ ] Emits `agent.skill_state` and `agent.context_state` on every terminal transition.
- [ ] Emits `agent.health` every 60s while working.
- [ ] Emits `agent.error` with a stable `errorCode` from the agreed vocabulary.
- [ ] Retries only `5xx`/`429`/timeouts, with the documented backoff, for at most 24 hours.
- [ ] Stops emitting for an agent after a `404 unknown_agent`, and tears its instance down.
- [ ] No secrets, tokens, credentials, or raw prompt text in any string field.

**Lifecycle**

- [ ] `POST /api/instances/{id}/resync` exists and triggers a manifest re-read (the §5.2 fix).
- [ ] `PATCH /api/instances/{id}` accepts partial config and returns the **full** instance object, not a stub.
- [ ] `GET /api/instances/{id}` is idempotent and has **no side effects** — reading does not stop the agent.
- [ ] `DELETE /api/instances/{id}?purge=true` removes container, volumes, files, and credentials.
- [ ] `GET /api/instances?external_refs=…` supports nightly orphan reconciliation.
- [ ] Start/stop are idempotent: starting a running instance is a `200`, not an error.
- [ ] Paused agents stop heartbeating and skip schedules rather than queueing them.

**Harnesses**

- [ ] All four harnesses install skills to `.agents/skills` from the same `SKILL.md` bundle.
- [ ] Harness compatibility is asserted per skill at install time, never defaulted to `true`.
- [ ] Session objects are normalised to one shape across harnesses.
- [ ] One SSE dialect: named events, `\n\n`-delimited, multi-line `data:` handled per spec.
- [ ] Hermes chat, sessions, and lifecycle are verified end to end — not assumed from OpenClaw.

**ArkAgent's own half** — not yours to tick, listed so neither team assumes the other has it. None
of these exist today, and each one is load-bearing for something above.

- [ ] `app/api/runtime/{agents/[id]/manifest, skills/[id]/bundle, context/[id]/content}` exist, each performing its own bearer + agent-scope check (there is no route middleware).
- [ ] Migration: `agents.status_occurred_at`, `agents.config_revision`, `agents.applied_config_revision`; `agent_activities.code/params/run_id`; `agent_improvements.kind/proposal`; `usage_records.run_id`; `messages` unique index re-scoped to `(agent_id, external_id)`.
- [ ] `ALTER TYPE engine ADD VALUE IF NOT EXISTS` for `codex` and `deepseek` in a migration file of their own, ahead of any file that uses them.
- [ ] `lib/i18n/activity.ts` — en / zh / zht / ja, written natively, one entry per activity `code`, `errorCode`, metric `label`, `skipReason`, `denyReason`.
- [ ] Ingest: UUID-shape check on `externalAgentId`; ownership check on every id in a body; enum validation before every cast; ledger insert and effects in one transaction.
- [ ] Zod hardening in `lib/validation.ts`: IANA check on `timezone`, `HH:MM` on `workStart`/`workEnd`/`digestTime`, `z.url()` + private-range reject on `knowledgeUrls`.
- [ ] `channels.config` secrets actually encrypted at rest, or the claim removed from `lib/db/schema.ts:492` and `lib/i18n/channels.ts`.
- [ ] Row-level security (or per-agent views) before any Path B grant is issued.

---

# 8. Open questions blocking full conformance

Each needs an answer from the backend team before the dependent feature can ship. Nothing in this
document resolves them.

| # | Question | Blocks |
|---|---|---|
| **CONFIRM-1** | Is there a non-expiring service credential for ArkAgent, or only ~24h user session tokens? Every sample credential we hold decodes to `base64("<userId>:<unixExpiry>").<hmac>` with a ~1-day life. | The entire integration. If the answer is "user tokens only", production breaks daily and ArkAgent must build an unscoped token-refresh subsystem. |
| **CONFIRM-2** | What are `target_user_id` semantics? We send an ArkAgent user UUID; responses come back owned by the *token's* user. Does the runtime auto-provision users, or is the field ignored and every instance owned by one account? | Whether per-tenant isolation exists upstream at all. |
| **CONFIRM-3** | Is context *indexed* into a retrievable store, or dropped on disk for the harness to read? | The CONTEXT template section, and whether the UI may say "knowledge base". |
| **CONFIRM-4** | The exact enum for `status` vs `provisioning_status`. Both use `running` for different things, and a healthy instance reporting `done` is currently mapped to not-ready. | Correct status display; agents currently stuck in `provisioning`. |
| **CONFIRM-5** | `category_id` for `codex` and `deepseek`. `1` and `3` are unexplained holes we will not assume are free. | Provisioning for half the advertised harnesses. |
| **CONFIRM-6** | Per-harness support for `tools.docker`, `selfImprove`, and `autoCreateSkills` on Hermes and DeepSeek. | Whether the settings screen shows switches that do nothing. |
| **CONFIRM-7** | Which channels each harness supports, and how a channel credential reaches the runtime without passing through `channels.config` (which is encrypted at our application layer). | The Channels panel beyond OpenClaw. |
| **CONFIRM-8** | Are installed skills sandboxed — network egress, filesystem scope, credential access? | Whether the Skill Repository ships installable or **read-only**. ArkAgent can score a skill's safety, but the sandbox is yours; if there is none, "install SAFE skills from the web" is a promise we cannot honour. |
| **CONFIRM-9** | **Can the Manager reach `https://app.arkagent.com` at all?** Every address we have been given is private (`http://10.21.27.155:18090`, per `manager_api.md`), and §2 assumes the runtime makes outbound HTTPS calls to us for the manifest, skill bundles, and context content, plus §3's ingest POSTs. | **The entire read contract, and the entire write contract.** If the cluster has no egress to the public internet, neither §2 Path A nor §3 works, and the answer is a reverse tunnel, an allowlisted egress proxy, or Path B with the RLS work of §2.0 — a materially different project. Nothing else in this document can be scheduled until this is answered. |
| **CONFIRM-10** | Is the Manager's origin HTTPS? Every sample is `http://`. | The runtime token, and every provisioning body containing the ingest secret and manifest token (§1.6), travel on that connection. Over plain HTTP the whole auth model is a formality. |

---

# 9. Risks in this contract

Ordered by blast radius.

0. **Network reachability is unestablished in both directions (CONFIRM-9, CONFIRM-10).** Every
   Manager address on record is an RFC1918 host on plain HTTP. This document assumes ArkAgent can
   call the Manager over HTTPS *and* that the Manager can call `app.arkagent.com` back. If either
   is false, §2 and §3 are both unreachable and the shape of the integration changes, not just its
   schedule. This ranks above everything below it because everything below it presumes a route.

1. **No inbound telemetry path exists yet.** The endpoint, the HMAC scheme, and the handlers are
   implemented on our side — though the handler needs the validation of §3.1 before it can be
   called correct — and nothing has ever sent them, because the runtime has no callback URL, no
   signing secret, and no way to learn `agents.id`. Everything in §3 is unreachable until §1.6
   ships. This is the critical path.

2. **Config edits have never reached the runtime.** §5.2 step 2 is the fix. Until it lands, the v2
   "full agent config management" screen is a set of switches that change nothing — the worst
   possible outcome, because it looks like it works.

3. **Terminate leaks containers.** No delete endpoint exists; terminate is stop. Every deleted
   agent leaves an orphaned container and host directory that ArkAgent can never see again. Cost
   at launch volume, and a data-retention exposure.

4. **CONFIRM-1 could invalidate the auth model.** If only 24-hour user tokens exist, §1.3 is
   unimplementable as written and the integration inherits a daily failure clock.

5. **This contract proposes one table not in the agreed v2 table list**, `runtime_event_receipts`
   (§3.2). It is required for idempotent ingest — without it, a retried `agent.usage` double-bills
   a customer — but it should be ratified alongside the other v2 tables rather than arriving
   through this document. It also proposes eight additive columns and one index re-scope (§3.3,
   §2.2), each justified in place.

5a. **The ingest handler is the cross-tenant write surface, and today it does not check.**
   `app/api/webhooks/agent-manager/route.ts` passes `event.externalAgentId` straight into
   `eq(agents.id, …)` (a non-UUID is a `500`, which the sender then retries forever) and inserts a
   message into whatever `conversationId` the body names, without checking that conversation
   belongs to the agent. A single leaked deployment-wide HMAC secret therefore writes into any
   tenant. §3.1's validation table is the fix and it is a launch blocker, not a hardening task.

5b. **`messages.external_id` is unique globally, not per agent.** Combined with
   `ON CONFLICT DO NOTHING`, a colliding `externalId` from a second tenant is *silently dropped* —
   no error, no metric, no trace. Re-scoping the index is a one-line migration and is in §3.3.

5c. **`channels.config` is not encrypted**, despite the schema comment, the customer-facing copy,
   and every previous draft of this document saying it is. Today only a name-shaped mask in
   `lib/serializers.ts` stands between a channel credential and any workspace member — and nothing
   at all stands between it and a Path B SQL reader. Either encrypt it or stop claiming it.

6. **`agent.activity` v2 is a breaking change to an event that already ships.** The `code` +
   `params` design is what makes the Activity page translatable into four languages, and it is
   worth the break, but it means an existing v1 sender must be migrated, not merely extended.

7. **ArkAgent-fired schedules (§5.3, the v2.0 design) cannot fire while ArkAgent is down**, and
   resolution is bounded by the control-plane cron at one minute. Acceptable for launch; it must
   move to the runtime once the `schedules` capability exists, and the inbound event is
   deliberately identical so the switch is invisible.

8. **The `web` channel is special-cased.** It is attached to every agent automatically and is the
   only channel guaranteed present. A runtime that assumes every channel needs an external
   credential will fail on it.

9. **Skill safety is enforced where ArkAgent cannot see it** (CONFIRM-8). We score; you sandbox.
   If there is no sandbox, the Skill Repository must ship browse-and-request only, and §2.5's
   install flow is dead weight until it can.

10. **Almost every skill is fetched from its origin, not from us.** `install.mode = "inline"`
    requires `redistributable AND license_verified`, and all 31 seeded ClawHub rows have
    `license_verified = false` because no ClawHub listing endpoint returns a licence. So at launch
    the bytes come from an upstream that could swap them, and `contentSha256` is the only thing
    holding a pinned version still. Verifying it is not optional; the daily re-verification job in
    `docs/SKILL_REPOSITORY.md` §8 is what catches a version reclassified after install.

11. **The cron dialect is not the obvious one.** Two of its three DST rules are the opposite of the
    intuitive choice (§2.7), and the Vixie day-of-month/day-of-week union rule surprises everyone.
    A second implementation that guesses will fire jobs at times ArkAgent's own preview says it
    will not. If you implement the `schedules` capability, port `lib/schedule/cron.ts` rather than
    reaching for a cron package — the package will not answer the DST questions the same way.

12. **`agent.activity` v2 is only translatable if the row stores `code` + `params`.** An earlier
    draft had ArkAgent render the sentence at ingest, which is impossible against a client-side
    i18n store and would have re-introduced the untranslatable-English-string defect the event
    exists to remove. The three new columns in §3.3 are the whole feature; without them, v2 buys
    nothing over v1.
