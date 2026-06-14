# Database Reference

ArkAgent persists state in **Postgres** accessed through **Drizzle ORM** (`drizzle-orm/postgres-js`). The schema lives in [`lib/db/schema.ts`](../lib/db/schema.ts); the runtime client in [`lib/db/index.ts`](../lib/db/index.ts); migration config in [`drizzle.config.ts`](../drizzle.config.ts); and reference + demo seeding in [`lib/db/seed.ts`](../lib/db/seed.ts).

The data model spans five domains:

- **Identity** — `users`, `sessions`, `workspaces`, `workspace_members`
- **Catalog** (seeded reference) — `agent_roles`, `plans`
- **Agents** — `agents`, `agent_tasks`, `agent_activities`, `agent_metrics`, `agent_improvements`
- **Channels & messaging** — `channels`, `agent_channels`, `conversations`, `messages`
- **Billing** — `subscriptions`, `invoices`, `usage_records`

---

## 1. Connection & pooling

### Two connection strings

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | the app runtime (`lib/db/index.ts`) | **Pooled** connection through pgbouncer (transaction pooling). |
| `DIRECT_DATABASE_URL` | migrations (`drizzle.config.ts`) | **Direct**, non-pooled session for running DDL. Falls back to `DATABASE_URL` if unset. |

Migrations must run on a real session rather than through pgbouncer, because DDL and certain session-scoped operations are incompatible with transaction pooling. `drizzle.config.ts` therefore prefers `DIRECT_DATABASE_URL` and throws if neither variable is present. It also loads `.env` via Node's built-in `process.loadEnvFile` (Node ≥ 21), tolerating its absence in CI where vars are injected directly.

### URL parsing and `prepare: false`

The pooled `DATABASE_URL` carries pooler-only query parameters (`pgbouncer`, `connection_limit`, `pool_timeout`, etc.) that are **not** valid libpq startup parameters. Passing the raw URL to `postgres-js` would forward them as startup options and the server would reject them. `lib/db/index.ts` therefore parses the URL itself (`parsePgUrl`) and maps the relevant pieces to `postgres-js` options:

| URL component / param | postgres-js option | Notes |
| --- | --- | --- |
| `hostname` | `host` | |
| `port` | `port` | defaults to `5432` |
| `username` | `user` | URL-decoded |
| `password` | `password` | URL-decoded |
| `pathname` | `database` | leading `/` stripped; defaults to `postgres` |
| `sslmode` | `ssl` | `"require"` unless `sslmode=disable` (or absent → `false`) |
| `pgbouncer=true` | `prepare: false` | **prepared statements are disabled behind pgbouncer** — transaction pooling mode is incompatible with them |
| `connection_limit` | `max` | defaults to `10` |
| `connect_timeout` | `connect_timeout` | defaults to `30` seconds |

The client is memoized on `globalThis.__arkPg` outside production so HMR reloads in dev reuse one pool instead of exhausting connections.

---

## 2. Enums

All enums are Postgres `pgEnum` types.

| Enum | Values |
| --- | --- |
| `locale` | `en`, `zh`, `zht` |
| `member_role` | `owner`, `admin`, `member` |
| `engine` | `openclaw`, `hermes` |
| `agent_status` | `draft`, `provisioning`, `deploying`, `working`, `scheduled`, `needs_review`, `paused`, `error`, `terminated` |
| `task_status` | `queued`, `in_progress`, `done`, `blocked` |
| `activity_tag` | `meeting`, `draft`, `research`, `review`, `outreach`, `learning`, `resolved`, `escalated`, `summary`, `published`, `brief`, `calendar`, `docs`, `system` |
| `improvement_status` | `pending`, `approved`, `dismissed` |
| `channel_type` | `telegram`, `whatsapp`, `wechat`, `line`, `slack`, `email`, `web` |
| `channel_status` | `connected`, `pending`, `disconnected`, `error` |
| `message_sender` | `user`, `agent`, `system` |
| `message_status` | `queued`, `sent`, `delivered`, `failed` |
| `plan_tier` | `associate`, `professional`, `director` |
| `billing_cycle` | `monthly`, `annual` |
| `subscription_status` | `trialing`, `active`, `past_due`, `canceled` |
| `invoice_status` | `draft`, `open`, `paid`, `void` |
| `payment_provider` | `stripe`, `alipay` |
| `usage_kind` | `message`, `task`, `research`, `compute`, `adjustment` |

---

## 3. Tables

Notation: PK = primary key, FK = foreign key, UQ = unique index, IDX = non-unique index. All `timestamp` columns are `withTimezone` (Postgres `timestamptz`). UUID PKs default to `gen_random_uuid()` (`defaultRandom()`).

### Identity

#### `users`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `email` | varchar(320) | no | — | |
| `password_hash` | text | no | — | scrypt `salt:hash` (see seed) |
| `name` | varchar(120) | no | — | |
| `locale` | `locale` | no | `en` | |
| `email_verified_at` | timestamptz | yes | — | |
| `created_at` | timestamptz | no | now() | |
| `updated_at` | timestamptz | no | now() | |

Constraints: `users_email_uniq` UQ on `(email)`.

#### `workspaces`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `name` | varchar(160) | no | — | |
| `owner_id` | uuid | no | — | FK → `users.id` (ON DELETE CASCADE) |
| `credits_included` | integer | no | `0` | aggregate cycle credit allowance (sum of agent seats) |
| `credits_used` | integer | no | `0` | |
| `cycle_resets_at` | timestamptz | yes | — | |
| `created_at` | timestamptz | no | now() | |

Constraints: `workspaces_owner_idx` IDX on `(owner_id)`.

#### `workspace_members`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `workspace_id` | uuid | no | — | FK → `workspaces.id` (CASCADE), composite PK |
| `user_id` | uuid | no | — | FK → `users.id` (CASCADE), composite PK |
| `role` | `member_role` | no | `member` | |
| `created_at` | timestamptz | no | now() | |

Constraints: composite PK `(workspace_id, user_id)`; `workspace_members_user_idx` IDX on `(user_id)`.

#### `sessions`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `user_id` | uuid | no | — | FK → `users.id` (CASCADE) |
| `token_hash` | varchar(64) | no | — | SHA-256 of the opaque cookie token; **raw token is never stored** |
| `expires_at` | timestamptz | no | — | |
| `user_agent` | text | yes | — | |
| `ip` | varchar(64) | yes | — | |
| `created_at` | timestamptz | no | now() | |

Constraints: `sessions_token_uniq` UQ on `(token_hash)`; `sessions_user_idx` IDX on `(user_id)`.

### Catalog (seeded reference)

#### `agent_roles`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | varchar(40) | no | — | PK (slug, e.g. `prospector`) |
| `name` | varchar(80) | no | — | |
| `blurb` | text | no | — | short tagline |
| `long_blurb` | text | yes | — | landing-page copy |
| `hue` | varchar(16) | no | — | accent color |
| `mono` | varchar(2) | no | — | monogram letter |
| `default_engine` | `engine` | no | `openclaw` | |
| `default_instructions` | text | yes | — | prefilled job brief |
| `default_rules` | text | yes | — | prefilled rules |
| `min_plan` | `plan_tier` | no | `associate` | minimum plan to hire this role |
| `sort_order` | integer | no | `0` | |

#### `plans`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `plan_tier` | no | — | PK |
| `name` | varchar(60) | no | — | |
| `monthly_price_cents` | integer | no | — | |
| `included_credits` | integer | no | — | |
| `overage_cents_per_1k` | integer | no | `200` | overage price per 1,000 credits |
| `features` | jsonb (`string[]`) | no | `[]` | feature bullet list |
| `sort_order` | integer | no | `0` | |

### Agents

#### `agents`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `workspace_id` | uuid | no | — | FK → `workspaces.id` (CASCADE) |
| `created_by_id` | uuid | no | — | FK → `users.id` |
| `name` | varchar(80) | no | — | |
| `role_id` | varchar(40) | no | — | FK → `agent_roles.id` |
| `engine` | `engine` | no | `openclaw` | |
| `plan_tier` | `plan_tier` | no | `associate` | |
| `status` | `agent_status` | no | `draft` | |
| `instructions` | text | no | `""` | the "job brief" written during hire |
| `rules` | text | no | `""` | |
| `hue` | varchar(16) | yes | — | presentation accent (mirrors role hue, overridable) |
| `credits_used` | integer | no | `0` | |
| `agent_manager_id` | varchar(120) | yes | — | **shared with Agent Manager** (see §4) |
| `vm_id` | varchar(80) | yes | — | **shared with Agent Manager** |
| `vm_region` | varchar(40) | yes | — | **shared with Agent Manager** |
| `deployment_status` | varchar(40) | yes | — | **shared with Agent Manager** |
| `last_error` | text | yes | — | last provisioning/runtime error |
| `last_heartbeat_at` | timestamptz | yes | — | **shared with Agent Manager** |
| `provisioned_at` | timestamptz | yes | — | **shared with Agent Manager** |
| `uptime_started_at` | timestamptz | yes | — | |
| `created_at` | timestamptz | no | now() | |
| `updated_at` | timestamptz | no | now() | |

Constraints: `agents_workspace_idx` IDX on `(workspace_id)`; `agents_status_idx` IDX on `(status)`; `agents_manager_id_uniq` UQ on `(agent_manager_id)`.

#### `agent_tasks`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `agent_id` | uuid | no | — | FK → `agents.id` (CASCADE) |
| `text` | text | no | — | |
| `status` | `task_status` | no | `queued` | |
| `meta` | varchar(120) | yes | — | |
| `sort_order` | integer | no | `0` | |
| `created_at` | timestamptz | no | now() | |
| `completed_at` | timestamptz | yes | — | |

Constraints: `agent_tasks_agent_idx` IDX on `(agent_id)`.

#### `agent_activities`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `agent_id` | uuid | no | — | FK → `agents.id` (CASCADE) |
| `text` | text | no | — | |
| `tag` | `activity_tag` | no | `system` | |
| `occurred_at` | timestamptz | no | now() | |

Constraints: `agent_activities_agent_idx` IDX on `(agent_id, occurred_at)`.

#### `agent_metrics`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `agent_id` | uuid | no | — | FK → `agents.id` (CASCADE) |
| `label` | varchar(80) | no | — | |
| `value` | varchar(40) | no | — | |
| `delta` | varchar(24) | yes | — | |
| `weight` | integer | no | `0` | 0–100 bar width |
| `captured_at` | timestamptz | no | now() | |

Constraints: `agent_metrics_agent_idx` IDX on `(agent_id)`.

#### `agent_improvements` (self-review queue)
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `agent_id` | uuid | no | — | FK → `agents.id` (CASCADE) |
| `text` | text | no | — | |
| `impact` | varchar(120) | yes | — | |
| `status` | `improvement_status` | no | `pending` | |
| `created_at` | timestamptz | no | now() | |
| `resolved_at` | timestamptz | yes | — | |

Constraints: `agent_improvements_agent_idx` IDX on `(agent_id, status)`.

### Channels & messaging

#### `channels`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `workspace_id` | uuid | no | — | FK → `workspaces.id` (CASCADE) |
| `type` | `channel_type` | no | — | |
| `status` | `channel_status` | no | `disconnected` | |
| `label` | varchar(80) | yes | — | |
| `config` | jsonb (`Record<string,string>`) | no | `{}` | connection config; secrets encrypted at the app layer |
| `created_at` | timestamptz | no | now() | |
| `updated_at` | timestamptz | no | now() | |

Constraints: `channels_workspace_idx` IDX on `(workspace_id)`; `channels_workspace_type_uniq` UQ on `(workspace_id, type)` — one channel per type per workspace.

#### `agent_channels` (join table)
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `agent_id` | uuid | no | — | FK → `agents.id` (CASCADE), composite PK |
| `channel_id` | uuid | no | — | FK → `channels.id` (CASCADE), composite PK |

Constraints: composite PK `(agent_id, channel_id)`.

#### `conversations`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `agent_id` | uuid | no | — | FK → `agents.id` (CASCADE) |
| `channel_id` | uuid | yes | — | FK → `channels.id` (ON DELETE SET NULL) |
| `subject` | varchar(160) | yes | — | |
| `created_at` | timestamptz | no | now() | |
| `last_message_at` | timestamptz | no | now() | |

Constraints: `conversations_agent_idx` IDX on `(agent_id, last_message_at)`.

#### `messages`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `conversation_id` | uuid | no | — | FK → `conversations.id` (CASCADE) |
| `agent_id` | uuid | no | — | FK → `agents.id` (CASCADE) |
| `sender` | `message_sender` | no | — | |
| `body` | text | no | — | |
| `channel_type` | `channel_type` | no | `web` | |
| `status` | `message_status` | no | `sent` | |
| `external_id` | varchar(160) | yes | — | idempotency/dedupe key for Agent Manager-delivered messages |
| `meta` | varchar(160) | yes | — | |
| `created_at` | timestamptz | no | now() | |

Constraints: `messages_conversation_idx` IDX on `(conversation_id, created_at)`; `messages_external_uniq` UQ on `(external_id)`.

### Billing

#### `subscriptions`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `workspace_id` | uuid | no | — | FK → `workspaces.id` (CASCADE) |
| `agent_id` | uuid | yes | — | FK → `agents.id` (ON DELETE SET NULL); one subscription = one agent seat |
| `plan_id` | `plan_tier` | no | — | |
| `cycle` | `billing_cycle` | no | `monthly` | |
| `status` | `subscription_status` | no | `active` | |
| `current_period_start` | timestamptz | no | now() | |
| `current_period_end` | timestamptz | yes | — | |
| `created_at` | timestamptz | no | now() | |

Constraints: `subscriptions_workspace_idx` IDX on `(workspace_id)`.

#### `invoices`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `workspace_id` | uuid | no | — | FK → `workspaces.id` (CASCADE) |
| `number` | varchar(40) | no | — | |
| `amount_cents` | integer | no | — | |
| `currency` | varchar(8) | no | `usd` | |
| `status` | `invoice_status` | no | `open` | |
| `provider` | `payment_provider` | yes | — | |
| `period_start` | timestamptz | yes | — | |
| `period_end` | timestamptz | yes | — | |
| `issued_at` | timestamptz | no | now() | |
| `paid_at` | timestamptz | yes | — | |
| `pdf_url` | text | yes | — | |

Constraints: `invoices_workspace_idx` IDX on `(workspace_id, issued_at)`; `invoices_number_uniq` UQ on `(number)`.

#### `usage_records`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | bigint | no | identity (generated always) | PK |
| `workspace_id` | uuid | no | — | FK → `workspaces.id` (CASCADE) |
| `agent_id` | uuid | yes | — | FK → `agents.id` (ON DELETE SET NULL) |
| `kind` | `usage_kind` | no | `compute` | |
| `credits` | integer | no | `0` | |
| `note` | varchar(160) | yes | — | |
| `occurred_at` | timestamptz | no | now() | |

Constraints: `usage_records_workspace_idx` IDX on `(workspace_id, occurred_at)`.

---

## 4. Fields shared with the Agent Manager

The external **Agent Manager** provisions and monitors the remote OpenClaw/Hermes runtime. The following columns on `agents` are the contract surface it reads/writes (see `docs/API.md`):

| Column | Direction | Meaning |
| --- | --- | --- |
| `agent_manager_id` | ArkAgent ↔ Manager | Stable identifier for the agent in the Manager. Globally unique (`agents_manager_id_uniq`). |
| `vm_id` | Manager → ArkAgent | Identifier of the VM the agent runs on. |
| `vm_region` | Manager → ArkAgent | Region of that VM (e.g. `sgp-04`). |
| `deployment_status` | Manager → ArkAgent | Free-form deployment state string (e.g. `deployed`). |
| `last_heartbeat_at` | Manager → ArkAgent | Timestamp of the last liveness heartbeat. |
| `provisioned_at` | Manager → ArkAgent | When provisioning completed. |

`messages.external_id` is also a shared field: it is the idempotency/dedupe key for messages delivered by the Agent Manager, enforced unique by `messages_external_uniq`.

---

## 5. Entity-relationship overview

```
                              ┌───────────┐
                              │  agent_   │  (catalog / seeded)
                              │  roles    │
                              └─────▲─────┘
                                    │ role_id
                                    │
  ┌─────────┐  owner_id   ┌─────────┴────────┐  workspace_id   ┌─────────────────┐
  │  users  │◄────────────│   workspaces     │────────────────►│    channels     │
  └────▲────┘             └───┬──────────┬───┘                 └────────▲────────┘
       │                      │          │                              │
       │ user_id              │ ws_id    │ ws_id                        │ channel_id
       │                      │          │                              │ (SET NULL)
  ┌────┴──────────────┐       │     ┌────▼─────┐                        │
  │ workspace_members │       │     │  agents  │──┐ created_by_id ──────┘ (via
  │  (PK ws+user)     │       │     └────┬─────┘  └──► users               agent_channels
  └───────────────────┘       │          │                                join, PK
                              │          │ agent_id (CASCADE)            agent+channel)
  ┌──────────┐  user_id       │          │
  │ sessions │◄───────────────┘          ├──────────────┬──────────────┬───────────────┐
  └──────────┘                           ▼              ▼              ▼               ▼
                                  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐
                                  │agent_tasks │ │agent_      │ │agent_      │ │agent_improvements│
                                  │            │ │activities  │ │metrics     │ │ (self-review)    │
                                  └────────────┘ └────────────┘ └────────────┘ └──────────────────┘

  agents ──agent_id──► conversations ──conversation_id──► messages
  (conversations.channel_id → channels, SET NULL)

  Billing (all workspace_id → workspaces, CASCADE):
  workspaces ──► subscriptions (agent_id → agents, SET NULL; one seat per agent)
  workspaces ──► invoices
  workspaces ──► usage_records (agent_id → agents, SET NULL)
```

Deleting a `users` row cascades to `workspaces` → `agents` → all agent children, channels, conversations, messages, subscriptions, invoices, and usage records. (The seed relies on this: it deletes the demo user to rebuild the demo workspace.)

---

## 6. Seeded data (`npm run db:seed`)

The seed is **idempotent for reference data** (`onConflictDoNothing`) and **rebuilds the demo workspace** each run by deleting the demo user (`demo`) and letting cascades clear its data. The `demo` account is the ONLY one seeded with mock data; every registered user starts with an empty, real workspace.

### Reference: 3 plans

| id | name | monthly price | included credits | overage / 1k |
| --- | --- | --- | --- | --- |
| `associate` | Associate | $49.00 (4900¢) | 5,000 | 200¢ |
| `professional` | Professional | $149.00 (14900¢) | 25,000 | 200¢ |
| `director` | Director | $399.00 (39900¢) | 100,000 | 200¢ |

Each plan ships a `features` bullet list (e.g. Associate: 1 channel + OpenClaw engine; Professional: all channels + both engines; Director: dedicated VM + OPC mode + audit log).

### Reference: 8 agent roles

Sourced from `rolesData` in `lib/data.ts`. `default_engine` and `min_plan` are derived in the seed (`roleEngine`, `roleMinPlan`): roles `support`, `content`, and `legal` default to the **hermes** engine, all others to **openclaw**; `opc` requires the **director** plan, `legal` requires **professional**, the rest **associate**.

| id | name | engine | min plan |
| --- | --- | --- | --- |
| `prospector` | Sales Prospector | openclaw | associate |
| `salesmkt` | Sales & Marketing | openclaw | associate |
| `admin` | Admin Assistant | openclaw | associate |
| `hr` | HR Recruiter | openclaw | associate |
| `support` | Customer Support | hermes | associate |
| `legal` | Legal Reviewer | hermes | professional |
| `content` | Content Creator | hermes | associate |
| `opc` | OPC Operator | openclaw | director |

### Demo workspace

- **User**: `Demo` — login `demo` / `demo123` (scrypt-hashed, email pre-verified), locale `en`. This is the only mock-data account.
- **Workspace**: `Ark Industries Pte Ltd`, owned by Demo (who is also the `owner` member). `credits_included = 30000`, `credits_used = 18420`, cycle resets ~17 days ahead.
- **Channels** (7, one per type): `telegram`, `whatsapp`, `wechat`, `web` → `connected`; `slack` → `pending`; `line`, `email` → `disconnected`.
- **Agents**: one per entry in `agentsData`, each with:
  - role mapped from `roleIdByName` (fallback `admin`), engine lower-cased, plan from `planForAgent` (Nova/Atlas → `professional`, else `associate`), status mapped from prototype labels.
  - Agent-Manager fields populated: `agent_manager_id = am_<uuid>`, `vm_id`, `vm_region`, `deployment_status = "deployed"`, `provisioned_at` (~20d ago), `uptime_started_at` (~12d ago), `last_heartbeat_at = now`.
  - child rows: `agent_tasks`, `agent_activities`, `agent_metrics`, `agent_improvements` (status `pending`), plus `agent_channels` links (Nova → telegram/whatsapp/web; Atlas → whatsapp/wechat/web; Mei → wechat/email; Juno → slack; default → web).
  - one `active` monthly `subscription` per agent, one `compute` `usage_record`, and (when prototype chat exists) a `web` `conversation` seeded with `delivered` `messages` (`me` → `user`, else `agent`).
- **Invoices**: one `paid` Stripe invoice per `invoiceData` entry, numbered `INV-2026-100`, `INV-2026-101`, … with amounts derived from the prototype dollar strings.
