# Database Reference

ArkAgent persists state in **Postgres** accessed through **Drizzle ORM** (`drizzle-orm/postgres-js`). The schema lives in [`lib/db/schema.ts`](../lib/db/schema.ts); the runtime client in [`lib/db/index.ts`](../lib/db/index.ts); migration config in [`drizzle.config.ts`](../drizzle.config.ts); and reference + demo seeding in [`lib/db/seed.ts`](../lib/db/seed.ts).

The data model spans five domains:

- **Identity** — `users`, `sessions`, `workspaces`, `workspace_members`
- **Catalog** (seeded reference) — `agent_roles`, `plans`
- **Agents** — `agents`, `agent_tasks`, `agent_activities`, `agent_metrics`, `agent_improvements`, `agent_manager_config`
- **Channels & messaging** — `channels`, `agent_channels`, `conversations`, `messages`
- **Billing** — `subscriptions`, `invoices`, `usage_records`, `payment_orders`, `payment_events`

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
| `locale` | `en`, `zh`, `zht`, `ja` |
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
| `payment_order_status` | `pending`, `paid`, `failed`, `closed`, `refunded` |
| `usage_kind` | `message`, `task`, `research`, `compute`, `adjustment` |

`payment_order_status` is the lifecycle of one checkout attempt: `pending` is written before the user leaves for the provider; the provider's webhook (Stripe) or notify callback (Alipay) moves it to a terminal state. `closed` is the provider's own timeout/cancel. `refunded` exists as a value but nothing in the app sets it — see [PAYMENTS.md → Known gaps](PAYMENTS.md#known-gaps).

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
| `stripe_customer_id` | varchar(64) | yes | — | Stripe Customer (`cus_…`) this workspace bills through. Created lazily on the first international checkout and reused, so a workspace accumulates one payment history rather than one per purchase. |
| `created_at` | timestamptz | no | now() | |

Constraints: `workspaces_owner_idx` IDX on `(owner_id)`; `workspaces_stripe_customer_uniq` UNIQUE on `(stripe_customer_id)` — one Stripe Customer belongs to exactly one workspace, so a provider event can never mutate the wrong billing row. NULLs are exempt, so workspaces that have never paid are fine.

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
| `monthly_price_cents` | integer | no | — | USD list price in **cents** (international market) |
| `included_credits` | integer | no | — | |
| `overage_cents_per_1k` | integer | no | `200` | USD overage price per 1,000 credits |
| `monthly_price_fen` | integer | no | `0` | CNY list price in **分** (China market). A deliberately local ladder, not an FX conversion of the USD one — see [`lib/pricing.ts`](../lib/pricing.ts). |
| `overage_fen_per_1k` | integer | no | `1400` | CNY overage price per 1,000 credits |

> The two CNY columns arrive in migration `0004`, which also **backfills** them for the three seeded plans. The `DEFAULT 0` alone would only be right on a fresh database — an already-seeded one would carry `monthly_price_fen = 0` and quote every China-market seat at ¥0.00 until someone re-seeded. The backfill values must stay in step with `priceLadder.cny` in [`lib/pricing.ts`](../lib/pricing.ts); `npm run pricing:check` pins the ladder itself.
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


#### `agent_manager_config`
Cached per-provider configuration returned by the external Agent Manager for one agent
(see [API.md](API.md)). One row per `(agent, provider)` pair.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `agent_id` | uuid | no | — | FK → `agents.id` (CASCADE) |
| `provider` | varchar(40) | no | — | runtime/provider name |
| `external_id` | varchar(120) | no | — | the provider's own id for this agent |
| `status` | varchar(40) | no | `pending` | |
| `last_error` | text | yes | — | |
| `config` | jsonb | no | `{}` | provider config blob, surfaced by `GET /api/agents/[id]/instance-info` |
| `created_at` | timestamptz | no | now() | |
| `updated_at` | timestamptz | no | now() | |

Constraints: `agent_manager_config_agent_provider_uniq` UNIQUE on `(agent_id, provider)`;
`agent_manager_config_external_idx` IDX on `(provider, external_id)`.

> This table predates migration `0004` in `lib/db/schema.ts` but was only ever applied
> with `db:push`, so `0004` is the first migration that contains it. Its statements there
> are guarded (`CREATE TABLE IF NOT EXISTS`, and a `duplicate_object`-tolerant FK) so the
> migration applies cleanly to both a fresh database and one that was already pushed.

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
| `provider` | `payment_provider` | yes | — | How this seat is paid for. |
| `external_id` | varchar(80) | yes | — | Stripe: the `sub_…` id, which is what the webhook matches on. Alipay: the `out_trade_no`, because there is no recurring object to point at. |
| `currency` | varchar(8) | no | `usd` | `usd` or `cny` — the currency the seat was bought in. |
| `cancel_at_period_end` | boolean | no | `false` | Mirrored from Stripe by `customer.subscription.updated`. |
| `current_period_start` | timestamptz | no | now() | |
| `current_period_end` | timestamptz | yes | — | |
| `created_at` | timestamptz | no | now() | |

Constraints: `subscriptions_workspace_idx` IDX on `(workspace_id)`.

A Stripe seat renews itself and its row is kept in sync by the webhook. An Alipay seat is a one-off payment that opens a fixed period — 30 days for a monthly purchase (`ALIPAY_PERIOD_DAYS`), 365 for an annual one — and extending it means a fresh purchase, which creates a new row. That asymmetry is why `provider` exists on this table.

#### `invoices`
| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `workspace_id` | uuid | no | — | FK → `workspaces.id` (CASCADE) |
| `number` | varchar(40) | no | — | `INV-{year}-{out_trade_no suffix}`, derived from the order number rather than from fresh randomness. `out_trade_no` already carries a unique index, so this is collision-free by construction — a random suffix would eventually violate `invoices_number_uniq` and abort a fulfilment transaction *after* the money was taken |
| `amount_cents` | integer | no | — | **Minor units of `currency`** — US cents for a Stripe invoice, 分 for an Alipay one. The column name predates the second currency. |
| `currency` | varchar(8) | no | `usd` | `usd` or `cny` |
| `status` | `invoice_status` | no | `open` | fulfilment writes `paid` |
| `provider` | `payment_provider` | yes | — | which provider settled it; drives the badge in the billing table |
| `period_start` | timestamptz | yes | — | |
| `period_end` | timestamptz | yes | — | |
| `issued_at` | timestamptz | no | now() | |
| `paid_at` | timestamptz | yes | — | |
| `pdf_url` | text | yes | — | |
| `provider_ref` | varchar(120) | yes | — | Provider-side identifier — a Stripe payment-intent/session id, or the Alipay `out_trade_no`. Lets a support request be traced from our invoice number straight into the provider dashboard. |
| `hosted_url` | text | yes | — | Provider-hosted receipt/invoice page, when the provider gives us one. |

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

#### `payment_orders`

One row per checkout attempt, for **both** providers. The row is written *before* the user is redirected, so an asynchronous confirmation always has a local order to land on.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `workspace_id` | uuid | no | — | FK → `workspaces.id` (CASCADE) |
| `user_id` | uuid | no | — | FK → `users.id` (CASCADE) |
| `out_trade_no` | varchar(64) | no | — | Our order number, `ARK-{base36 ms}-{6 hex}`. Sent to Alipay as `out_trade_no` and set on Stripe as `client_reference_id`, so both confirmations look the order up by one key. |
| `provider` | `payment_provider` | no | — | |
| `status` | `payment_order_status` | no | `pending` | |
| `plan_id` | `plan_tier` | no | — | |
| `cycle` | `billing_cycle` | no | `monthly` | |
| `agent_id` | uuid | yes | — | FK → `agents.id` (SET NULL); optional seat association |
| `amount_minor` | integer | no | — | Charged amount in **minor units** (US cents / 分). Computed server-side from `lib/pricing.ts`, never taken from the client. |
| `currency` | varchar(8) | no | — | `usd` for Stripe, `cny` for Alipay |
| `return_url` | text | yes | — | where the browser is sent once the provider hands control back |
| `pay_url` | text | yes | — | the provider-hosted page we redirected to |
| `stripe_session_id` | varchar(120) | yes | — | Checkout Session (`cs_…`) |
| `stripe_payment_intent_id` | varchar(120) | yes | — | |
| `stripe_subscription_id` | varchar(120) | yes | — | |
| `stripe_customer_id` | varchar(64) | yes | — | |
| `alipay_trade_status` | varchar(32) | yes | — | `WAIT_BUYER_PAY` / `TRADE_SUCCESS` / `TRADE_CLOSED` |
| `provider_payload` | jsonb | yes | — | verbatim last provider payload, kept for support and reconciliation |
| `invoice_id` | uuid | yes | — | FK → `invoices.id` (SET NULL); set by fulfilment |
| `subscription_id` | uuid | yes | — | FK → `subscriptions.id` (SET NULL); set by fulfilment |
| `failure_reason` | text | yes | — | truncated to 480 chars |
| `completed_at` | timestamptz | yes | — | when the order was claimed as `paid` |
| `created_at` | timestamptz | no | now() | |
| `updated_at` | timestamptz | no | now() | |

Constraints: `payment_orders_out_trade_no_uniq` UQ on `(out_trade_no)`; `payment_orders_stripe_session_uniq` UQ on `(stripe_session_id)`; `payment_orders_workspace_idx` IDX on `(workspace_id, created_at)`; `payment_orders_status_idx` IDX on `(status)`.

Fulfilment — creating the subscription + invoice — happens **exactly once**, guarded by a conditional `UPDATE … SET status='paid'` inside a transaction whose `WHERE` carries three clauses:

- `provider = $expected`, passed in by the caller, so the CN gateway cannot settle a USD Stripe order (or vice versa) even if a future caller forgets to check;
- `status = 'pending'`, the normal path;
- **or** `status = 'closed'` **and** `updated_at` within the two-hour reclaim window. Alipay sends `TRADE_CLOSED` on timeout and can still deliver a later `TRADE_SUCCESS`, so a success notify has to be able to rescue a just-closed order. The window is what stops that becoming dangerous: Alipay also closes a trade once it has been **refunded**, and the gateway reports both the same way, so an old `closed` order is ambiguous and is escalated to a human instead of being fulfilled.

Postgres row-locks the order, so of N concurrent deliveries exactly one gets a row back and does the work; the rest get a `blockedBy` reason. `closeOrder()` is `WHERE status='pending'`, so a late `TRADE_CLOSED` or `checkout.session.expired` can never revoke a paid seat.

The invoice records what the **provider** collected (`session.amount_total`), not the order's asking price — a promotion code or a trial makes the two differ. A zero-value cycle is written `status='open'` with `paid_at` null, and its subscription starts `trialing`.

#### `payment_events`

An audit trail of the provider events that actually drove a fulfilment. The unique index on `(provider, event_id)` makes a redelivery a no-op insert.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | no | random | PK |
| `provider` | `payment_provider` | no | — | |
| `event_id` | varchar(160) | no | — | Stripe's own `evt_…`. The Alipay gateway sends no event id, so the callback synthesises `"{out_trade_no}:{pay_status}"` — a redelivery of the same status is deduplicated, a genuine status change still gets through. |
| `event_type` | varchar(80) | no | — | Stripe event type, or the Alipay `pay_status` |
| `order_id` | uuid | yes | — | FK → `payment_orders.id` (SET NULL). Set to the order the event fulfilled. `NULL` only if that order is later deleted. |
| `payload` | jsonb | yes | — | |
| `received_at` | timestamptz | no | now() | |

Constraints: `payment_events_provider_event_uniq` UQ on `(provider, event_id)`; `payment_events_order_idx` IDX on `(order_id)`.

**This table is an audit trail, not the concurrency guard.** Exactly-once is enforced by
the conditional claim on `payment_orders` (`WHERE provider = $1 AND status IN
('pending','closed')`), and the row here is written *after* that claim succeeds, in the
same transaction — so it commits with the fulfilment or not at all.

That ordering is deliberate, and both halves of it matter:

- Writing the row **before** fulfilling would let a process killed mid-transaction (a
  function timeout, an OOM) leave a committed claim nothing could release. The provider's
  retry would be discarded as a duplicate: money taken, seat never granted, silently.
- **Gating** on the row would mask a real problem. A success notify for an order in a
  terminal state is reported once and then, on every redelivery, answered "duplicate,
  200" — so the one signal that money moved against a written-off order would disappear
  after the first delivery.

A row present with its order still `pending` should therefore be impossible; if you see
one, treat it as a bug. See [PAYMENTS.md](PAYMENTS.md#idempotency-and-failure-handling).

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
  workspaces ──► payment_orders (user_id → users, CASCADE;
                                 agent_id → agents, SET NULL)
                      │
                      ├── invoice_id ──────► invoices        (SET NULL)
                      ├── subscription_id ─► subscriptions   (SET NULL)
                      └──◄ order_id ──────── payment_events  (SET NULL)
```

Deleting a `users` row cascades to `workspaces` → `agents` → all agent children, channels, conversations, messages, subscriptions, invoices, usage records, and payment orders. (The seed relies on this: it deletes the demo user to rebuild the demo workspace.) `payment_events.order_id` is `SET NULL`, so the dedup ledger survives an order being deleted — a redelivered webhook for a purged order is still recognised as already-seen.

---

## 6. Seeded data (`npm run db:seed`)

The seed is **idempotent for reference data** (`onConflictDoNothing`, except `plans`, which upserts so a repricing takes effect on a re-seed) and **rebuilds the demo workspace** each run by deleting the demo user (`demo`) and letting cascades clear its data. The `demo` account is the ONLY one seeded with mock data; every registered user starts with an empty, real workspace.

### Reference: 3 plans

Prices are written from [`lib/pricing.ts`](../lib/pricing.ts) (`planPrice` / `overagePer1k`), so the table can never drift from the ladder the landing page and checkout quote from. The plans insert is an **upsert**, not `onConflictDoNothing`: the three ids exist in every database that has ever been seeded, so a do-nothing insert would leave the CNY columns pinned at their defaults forever.

| id | name | USD / month | CNY / month | included credits | overage / 1k |
| --- | --- | --- | --- | --- | --- |
| `associate` | Associate | $49.00 (4900¢) | ¥349.00 (34900分) | 5,000 | 200¢ / 1400分 |
| `professional` | Professional | $149.00 (14900¢) | ¥1,068.00 (106800分) | 25,000 | 200¢ / 1400分 |
| `director` | Director | $399.00 (39900¢) | ¥2,868.00 (286800分) | 100,000 | 200¢ / 1400分 |

CNY is a local ladder, not an FX conversion of the USD one.

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
