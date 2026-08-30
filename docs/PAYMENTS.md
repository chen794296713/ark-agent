# Payment Implementation

ArkAgent sells one thing — an **agent seat** — into two markets, with two currencies and two providers:

| Market | Currency | Provider | Settles through |
| --- | --- | --- | --- |
| International | **USD** (US cents) | **Stripe** | your own Stripe account |
| 中国大陆 | **CNY** (人民币分) | **Alipay** | the **GoHire** payment gateway, not a direct Alipay merchant integration |

The price ladder for both currencies lives in [`lib/pricing.ts`](../lib/pricing.ts) and is the single source of truth. Every amount everywhere — database, provider request, invoice, UI — is an **integer in minor units**. Nothing in the money path is ever a float.

The provider code lives in [`lib/payments/`](../lib/payments/); the HTTP surface is three routes under `app/api/`.

---

## Table of Contents

1. [Architecture](#architecture)
2. [The price ladder](#the-price-ladder)
3. [Mock vs live](#mock-vs-live)
4. [Environment variables](#environment-variables)
5. [What you need to do in Stripe](#what-you-need-to-do-in-stripe)
6. [What you need to do for Alipay](#what-you-need-to-do-for-alipay)
7. [Endpoints](#endpoints)
8. [Idempotency and failure handling](#idempotency-and-failure-handling)
9. [Known gaps](#known-gaps)

---

## Architecture

The rule the whole design turns on: **the browser coming back never grants anything.** A seat is granted only when the provider tells the server, out of band, that money moved. A payer who closes the tab still gets their seat; a payer who forges a success URL does not.

```
                        POST /api/billing/checkout
                                    │
                         createOrder() writes a
                         `pending` payment_orders row
                         (amount computed server-side
                          from lib/pricing.ts)
                                    │
                 ┌──────────────────┴──────────────────┐
        currency = usd                          currency = cny
                 │                                     │
     createStripeCheckout()                   createAlipayOrder()
     Checkout Session, mode:                  POST worker.gohire.top
     "subscription",                          /payment/payment/create
     client_reference_id =                    out_trade_no =
     outTradeNo                               outTradeNo
                 │                                     │
                 ▼                                     ▼
     checkout.stripe.com/…                    Alipay hosted pay page
     (user pays)                              (QR / Alipay app)
                 │                                     │
                 │  ── browser returns to ──►  /payment/return?order=…
                 │     (proves nothing; the page polls)
                 │                                     │
     POST /api/webhooks/stripe            GET|POST /api/payments/alipay/callback
     verified by stripe-signature         authenticated by ?token=
                 │                                     │
                 └──────────────────┬──────────────────┘
                                    ▼
                         fulfilOrder() — ONE transaction:
                           UPDATE payment_orders
                             SET status='paid'
                             WHERE provider = $expected
                               AND status IN ('pending','closed')
                                          ← the atomic claim; exactly
                                            one caller gets a row back
                           INSERT subscriptions
                           INSERT invoices   (amount = what the
                                              provider collected)
                           INSERT payment_events  (audit)
                           link them back onto the order
                                    │
                                    ▼
                  GET /api/payments/orders/{outTradeNo}
                  the return page polls this until status = "paid"
```

**Files**

| Path | Responsibility |
| --- | --- |
| [`lib/pricing.ts`](../lib/pricing.ts) | Currencies, price ladder, cycle math, formatting. No secrets, safe on the client. |
| [`lib/payments/config.ts`](../lib/payments/config.ts) | Reads the environment; decides mock vs live per provider; builds absolute URLs. |
| [`lib/payments/orders.ts`](../lib/payments/orders.ts) | Provider-agnostic order lifecycle: `createOrder`, `fulfilOrder`, `closeOrder`, `needsAttention`. |
| [`lib/payments/stripe.ts`](../lib/payments/stripe.ts) | Customer creation, Checkout Session creation, webhook signature verification. |
| [`lib/payments/alipay.ts`](../lib/payments/alipay.ts) | Gateway order creation, notify-URL minting, callback token verification. |
| [`lib/payments/serialize.ts`](../lib/payments/serialize.ts) | `PaymentOrder` → `PaymentOrderDTO`. Provider ids and raw payloads never leave the server. |
| `app/api/billing/checkout/route.ts` | Starts a checkout. |
| `app/api/webhooks/stripe/route.ts` | The only place a Stripe payment grants a seat. |
| `app/api/payments/alipay/callback/route.ts` | The only place an Alipay payment grants a seat. |
| `app/api/payments/orders/[outTradeNo]/route.ts` | Order status poll, workspace-scoped. |

**Order numbers.** `newOutTradeNo()` mints `ARK-{base36 ms}-{6 hex}` — e.g. `ARK-M1K2P9F-3A7B0C`. The same string is sent to Alipay as `out_trade_no` and set on Stripe as `client_reference_id`, so both confirmations look the order up by one key. It is unique across both providers (`payment_orders_out_trade_no_uniq`).

---

## The price ladder

CNY is a **local ladder**, not an FX conversion of the USD one.

| Tier | USD / month | CNY / month | Overage per 1,000 credits |
| --- | --- | --- | --- |
| `associate` | $49.00 (`4900`¢) | ¥349.00 (`34900`分) | $2.00 / ¥14.00 |
| `professional` | $149.00 (`14900`¢) | ¥1,068.00 (`106800`分) | $2.00 / ¥14.00 |
| `director` | $399.00 (`39900`¢) | ¥2,868.00 (`286800`分) | $2.00 / ¥14.00 |

Annual is billed up front at **−20%**: `annualTotal = monthly × 12 × 0.8`. `cycleTotal(tier, currency, cycle)` is the only function that computes a charge, and `POST /api/billing/checkout` is the only caller — the client never sends an amount, so a tampered request cannot buy a Director seat at Associate prices.

Currency is chosen by the provider, not by the request body: `stripe` → `usd`, `alipay` → `cny`. The UI picks a default from the language (`zh` → CNY, everything else → USD) and lets the visitor override it.

---

## Mock vs live

Each provider resolves to one of three modes, independently.

| Mode | When | `POST /api/billing/checkout` does |
| --- | --- | --- |
| `live` | Credentials present (Stripe: `STRIPE_SECRET_KEY`. Alipay: `ALIPAY_ENABLED=true` **and** `ALIPAY_CALLBACK_SECRET` set) | Creates a pending order and returns a provider-hosted `redirectUrl`. The seat is granted later, by the webhook or notify. |
| `mock` | No credentials, **outside production** — or `PAYMENTS_MODE=mock` anywhere | Fulfils inline: subscription + invoice in the same request, `{"mode":"mock","redirectUrl":null,"invoice":{…}}`. This is what makes a fresh clone usable with nothing but a database. |
| `unconfigured` | No credentials, **in production** | Refuses with `503`. |

**Why `unconfigured` exists.** Mock mode grants a real, paid seat for free. If a
production deployment could fall into it just by missing an environment variable, then
anyone able to register could `POST /api/billing/checkout {"provider":"alipay"}` and be
issued a Director seat and a `paid` invoice without paying — and the half-configured
state (Stripe keys present, Alipay never switched on) is the *normal* first deployment.
So in production, absent credentials mean the payment method is unavailable, never free.
Reaching `mock` in production requires setting `PAYMENTS_MODE=mock` explicitly, which is
an opt-in no real deployment should have.

`PAYMENTS_MODE=mock` forces both providers to mock, in any environment — that is the
explicit production opt-in. There is no `live` override: forcing "live" cannot conjure
credentials, so a provider without them falls back exactly as if it were unset (`mock`
outside production, `unconfigured` in it).

**Alipay needs two things, not one.** `ALIPAY_ENABLED=true` with no
`ALIPAY_CALLBACK_SECRET` does not go live — it logs an error and stays unconfigured.
Going live in that state would be the worst outcome available: the gateway would take
real money, and every notify would be rejected as unauthenticated, so customers would pay
and never receive a seat.

---

## Environment variables

| Variable | Required for | Description | Example |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | **both, in production** | Public origin used to build the Stripe return/cancel URLs and the Alipay `notify_url`. `appUrl()` **throws at runtime in production when unset** rather than silently defaulting — a localhost value here means payers land on a dead port and CN payments are never credited. Falls back to `http://localhost:3000` outside production. | `https://arkagent.ai` |
| `PAYMENTS_MODE` | neither | Force `mock` or `live` for both providers. Unset = auto-detect per provider. | `mock` |
| `STRIPE_SECRET_KEY` | Stripe | Secret API key. Its presence is what switches Stripe to live. Never the publishable key — this integration is entirely server-side. | `sk_test_51…` |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Signing secret for the webhook endpoint. Without it `constructStripeEvent()` throws and every webhook is rejected `400`, so payments are taken and never fulfilled. | `whsec_…` |
| `STRIPE_PRICE_ASSOCIATE_MONTHLY` | no | Recurring Price id to use instead of inline `price_data`. | `price_1AbC…` |
| `STRIPE_PRICE_ASSOCIATE_ANNUAL` | no | ″ | `price_1AbC…` |
| `STRIPE_PRICE_PROFESSIONAL_MONTHLY` | no | ″ | `price_1AbC…` |
| `STRIPE_PRICE_PROFESSIONAL_ANNUAL` | no | ″ | `price_1AbC…` |
| `STRIPE_PRICE_DIRECTOR_MONTHLY` | no | ″ | `price_1AbC…` |
| `STRIPE_PRICE_DIRECTOR_ANNUAL` | no | ″ | `price_1AbC…` |
| `STRIPE_PAYMENT_METHOD_TYPES` | no | Comma-separated explicit methods. **Leave unset** and Stripe's Dashboard-managed automatic payment methods decide; setting it opts out of that and freezes the list into a deploy. | `card,link` |
| `STRIPE_TRIAL_DAYS` | no | Free-trial days applied to the subscription. `0`, unset, or non-numeric = no trial. | `14` |
| `STRIPE_API_VERSION` | no | Pins the Stripe API version so an SDK bump cannot silently change payload shapes. Defaults to `DEFAULT_STRIPE_API_VERSION`. | `2026-08-26.dahlia` |
| `ALIPAY_ENABLED` | Alipay | `true` or `1` switches Alipay to live. Anything else (including unset) = mock. There is no key to detect, so this flag is the switch. | `true` |
| `ALIPAY_API_URL` | no | Gateway order-create endpoint. Set it explicitly rather than relying on the default. | `https://worker.gohire.top/payment/payment/create` |
| `ALIPAY_PLATFORM` | no | Tenant identifier the gateway routes and attributes orders on. Default `gohire`. | `gohire` |
| `ALIPAY_CALLBACK_SECRET` | **Alipay, in production** | Random token embedded in the `notify_url` query string and required back on every callback. The gateway does not sign its notifies, so this is the **only** thing standing between a guessed order number and a free seat. When unset, `verifyAlipayCallbackToken()` **fails closed in production** (every callback is rejected `401`) and permits unauthenticated callbacks only in development. | 32 random hex bytes |

---

## What you need to do in Stripe

Do all of this in **test mode** first. Test and live mode have entirely separate API keys, webhook endpoints, Products, Prices, Customers and payment-method activations — nothing you create in one exists in the other, and every step has to be repeated in live mode before launch.

1. **Create a Stripe account** at [dashboard.stripe.com/register](https://dashboard.stripe.com/register). You can build and test the whole flow before the account is activated; activation (business details, bank account, tax info) is only needed before you take real money.

2. **Flip the Dashboard into Test mode** using the toggle in the header. Everything below happens in test mode.

3. **Copy the test secret key.** *Developers → API keys* → reveal the **Secret key** (`sk_test_…`) → put it in `STRIPE_SECRET_KEY`. Ignore the Publishable key: this integration redirects to Stripe-hosted Checkout server-side and never loads Stripe.js, so there is no client-side key. For production, prefer a **restricted key** with write access to Checkout Sessions, Customers and Subscriptions, and read access to Invoices.

4. **Decide whether you want Products and Prices at all.** You do **not** need them. When `STRIPE_PRICE_*` is unset for a tier + cycle, `createStripeCheckout()` builds inline `price_data` from `lib/pricing.ts` — the amount, the currency, the `month`/`year` interval and the product name are generated per session.

   | | Inline `price_data` (default, nothing to configure) | Configured `STRIPE_PRICE_*` |
   | --- | --- | --- |
   | Where the charged amount comes from | `lib/pricing.ts`, sent as inline `price_data` | The Stripe Price you configured. **`lib/pricing.ts` still drives everything ArkAgent displays and stores** — the app only sends Stripe the price *id*, and never reads the amount back when creating the order. If the two disagree, the customer is charged the Dashboard amount while the UI quotes the ladder. Keep them in step by hand. |
   | Changing a price | Edit the ladder, deploy | Create a **new** Price (Prices are immutable), archive the old one, update the env var, redeploy |
   | Stripe reporting | Every session creates an ad-hoc product; revenue does not roll up per plan | Clean per-product revenue reporting and Dashboard-side price experiments |
   | Coupons / promotion codes | Work either way (`allow_promotion_codes: true`) | Work either way |

   If you want the reporting: *Product catalog → Add product*, one per tier (`Associate`, `Professional`, `Director`), each with a **recurring** price in **USD** — monthly at $49 / $149 / $399, and, if you sell annual, a second yearly price at the −20% total ($470.40 / $1,430.40 / $3,830.40). Copy each `price_…` into the matching `STRIPE_PRICE_*` variable. Configure them per tier+cycle independently; any combination you leave unset falls back to inline pricing.

5. **Create the webhook endpoint.** *Developers → Webhooks → Add endpoint*.
   - **URL:** `https://<your-domain>/api/webhooks/stripe`
   - **Events to send** — exactly these seven, which are the ones `app/api/webhooks/stripe/route.ts` handles:

     | Event | What the handler does |
     | --- | --- |
     | `checkout.session.completed` | Fulfils the order (subscription + paid invoice) when `payment_status` is `paid` or `no_payment_required`. **This is normally the one that grants the seat.** |
     | `checkout.session.async_payment_succeeded` | Fulfils the order for a *delayed-notification* method. Identical handling to `completed`. |
     | `checkout.session.async_payment_failed` | Marks the order `failed`. |
     | `checkout.session.expired` | Closes the pending order (`status = closed`). |
     | `customer.subscription.updated` | Re-reads the subscription from Stripe and mirrors status / `cancel_at_period_end` / period end onto our row. |
     | `customer.subscription.deleted` | Marks our subscription `canceled`. |
     | `invoice.payment_failed` | Marks the subscription `past_due`. |

     Any other event is acknowledged with `200` and ignored, so subscribing to more is harmless but pointless.

     The two `async_payment_*` events are **not optional**. Because payment methods are chosen in the Dashboard rather than pinned in code (step 9), enabling any delayed-notification method — most bank debits, and some regional wallets — makes `checkout.session.completed` fire *before* the money settles, with `payment_status` still `unpaid`. The handler correctly leaves the order `pending` in that case and waits for the real outcome. If you have not subscribed to the async events, that outcome never arrives and the seat is never granted.
   - **API version:** set the endpoint's version to match `STRIPE_API_VERSION` (default `2026-08-26.dahlia`). A mismatch delivers payload shapes the handler does not expect — `invoice.parent.subscription_details` and the subscription-item `current_period_end` are exactly where that bites.

6. **Copy the signing secret.** On the endpoint page, reveal **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`. Note that the Stripe CLI (step 7) prints a *different* secret; the Dashboard one is for your deployed environment.

7. **Test locally with the Stripe CLI.** The Dashboard cannot reach `localhost`, so forward events instead:

   ```bash
   stripe login
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

   `stripe listen` prints its own `whsec_…` — put **that** one in your local `.env` as `STRIPE_WEBHOOK_SECRET`, leave `stripe listen` running, and start the app in another terminal. Then buy a seat through the UI and pay with the test card **`4242 4242 4242 4242`**, any future expiry, any CVC, any postcode. Useful failure cards: `4000 0000 0000 0002` (declined), `4000 0025 0000 3155` (requires 3-D Secure).

8. **Check that it actually landed.** After a test purchase:
   - the `stripe listen` terminal shows `checkout.session.completed` forwarded with a `200`;
   - *Dashboard → Payments* shows the payment and *Subscriptions* shows an active subscription whose metadata carries `workspaceId` / `outTradeNo` / `planId` / `cycle`;
   - *Dashboard → Customers* has one customer per workspace (reused on later purchases — the id is stored on `workspaces.stripe_customer_id`);
   - in ArkAgent, the `payment_orders` row is `paid` with `completed_at` set, and a `paid` invoice appears in the billing screen.

9. **Activate payment methods** — *Settings → Payment methods*. With `STRIPE_PAYMENT_METHOD_TYPES` unset (recommended) Stripe offers whatever is activated there and no code change is needed. If you *do* set it, every method you list must be activated on the account or `checkout.sessions.create` fails outright.

10. **Set your branding** — *Settings → Business → Branding* and *Public details*. Stripe-hosted Checkout is the only payment UI your international customers ever see, and the statement descriptor is what shows on their card statement.

11. **Go live.** Activate the account, flip the Dashboard to Live mode, then repeat: new live secret key, a **new** webhook endpoint on your production domain with a **new** signing secret, the Products/Prices again if you use them, and payment methods re-activated. Swap the `STRIPE_*` values in your production environment.

**Two things Stripe cannot do here.** USD is the only currency this integration sends to Stripe (`order.currency` is `usd` for every Stripe order), and Stripe is not a usable route to the mainland-China market — that is what the Alipay path exists for. Do not try to serve CN customers by adding a CNY price in Stripe; nothing in the code would select it.

---

## What you need to do for Alipay

**Read this first: this is not a direct Alipay integration.** ArkAgent never speaks to Alipay. It POSTs an order to the **GoHire payment gateway** (`https://worker.gohire.top/payment/payment/create`, tenant `platform: "gohire"`), the gateway creates the Alipay trade with *its* merchant credentials and returns a hosted `pay_url`, and the gateway calls your `notify_url` when the trade status changes.

What this means for you:

- You do **not** need an Alipay merchant account, an Alipay Open Platform `app_id`, an RSA2 keypair, or any Alipay certificate. There is no Alipay credential anywhere in this codebase.
- You **do** need the gateway operator to onboard you. There is no self-serve portal and no signup flow — it is a human conversation, and nothing on the CN path can be tested end to end until it happens.
- Funds settle to the **gateway's** Alipay merchant, not yours. That is a commercial dependency, not just a technical one.

### 1. Contact the gateway operator and settle the commercial terms

Before any code runs against the live gateway, get in writing: how and when your share is remitted, what fee is taken, what the reconciliation report looks like, who owns the customer relationship for refunds and chargebacks, and what happens to in-flight orders if the arrangement ends.

### 2. Ask the operator for exactly these things

| Ask | Why | Where it lands |
| --- | --- | --- |
| A **`platform` identifier** for ArkAgent — confirm whether you keep sending `gohire` or get your own code | The gateway routes and attributes orders on this field. The wrong value means your orders land in another tenant's ledger or are rejected. | `ALIPAY_PLATFORM` |
| The **order-create endpoint** to use (production, and staging if one exists) | Do not rely on the built-in default. | `ALIPAY_API_URL` |
| **Whitelisting of your `notify_url`**, if they restrict it to pre-registered domains (most CN payment intermediaries do) | Otherwise callbacks are never delivered. Supply the exact production URL, plus staging. | — |
| Their **egress IP range** | So you can allowlist it at the edge — a second layer under the callback token. | — |
| **Callback authentication**, in priority order: (a) an HMAC or RSA signature over the callback params with a shared secret; (b) the paid `total_amount` and Alipay `trade_no` in the callback so you can assert the amount; (c) a fixed egress IP range; (d) an **order-query endpoint** so you can confirm status server-to-server instead of trusting a push | The gateway currently sends unsigned plaintext parameters. If they can offer any of these, the integration gets meaningfully safer and gains a reconciliation path it does not have today. | new code + env vars |
| Whether a **sandbox / test mode** exists | If not, your first real test costs real money — use the smallest tier. | — |
| Their **retry behaviour** and whether they can **re-deliver a missed callback** on request | This is your only recovery path for a lost notify. | runbook |
| An **operational contact** for when callbacks stop arriving | | runbook |

Give them, in return: the platform name you want, your production and staging origins, the exact production callback URL, a technical contact, and your order-number prefix (`ARK-`) so they can find your traffic in their logs.

*Unverified:* whether the gateway currently enforces notify-URL whitelisting, offers a sandbox, or retries failed callbacks is **not** knowable from this codebase. Ask; do not assume.

### 3. Generate `ALIPAY_CALLBACK_SECRET`

The gateway sends **no signature** with its notifies. Without a compensating control, anyone who learned a pending `out_trade_no` could `curl` the callback endpoint with `pay_status=TRADE_SUCCESS` and grant themselves a paid seat.

The control is a bearer token carried in the notify URL itself. `alipayNotifyUrl()` mints:

```
https://<your-domain>/api/payments/alipay/callback?token=<ALIPAY_CALLBACK_SECRET>
```

That URL is generated server-side and handed only to the gateway; it never reaches a browser. `verifyAlipayCallbackToken()` compares the presented token in constant time and rejects everything else with `401 {"code":40003,"message":"unauthorized callback"}`.

Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set it **before** enabling Alipay — in every environment. With no secret configured the callback endpoint rejects everything, and Alipay cannot reach `live` at all (`alipayConfig()` refuses, logging why), so there is no state in which real money is taken against an endpoint that cannot authenticate its notify. There is deliberately no development escape hatch: one is a single `NODE_ENV` mistake away from an open fulfilment endpoint. For local `curl` testing, set the secret and pass it.

Rotating it is safe for future orders but breaks in-flight ones: orders already created carry the old token in the notify URL the gateway stored. Rotate when nothing is pending.

### 4. Make `notify_url` publicly reachable

The callback is a server-to-server POST/GET from the gateway's infrastructure. It must be:

- **HTTPS on 443** with a publicly trusted certificate;
- **resolvable and reachable from mainland China** — ask the operator to confirm from their side;
- **unauthenticated** at the edge: no bot challenge, no WAF interstitial, no redirect (a 301/302 may not be followed);
- **not behind deployment protection**. On Vercel specifically, Deployment Protection returns an auth interstitial to unauthenticated callers, so a protected preview or SSO-protected production deployment silently swallows every callback while the customer's payment succeeds.

**`localhost` will never receive a callback.** For local testing, run a tunnel (`cloudflared tunnel --url http://localhost:3000`, `ngrok http 3000`, or similar), set `NEXT_PUBLIC_APP_URL` to the public tunnel origin, and restart the app so the notify URL is minted against it. A wrong origin here is the single most common cause of "the payment went through and nothing happened", so check it — but **do not log `alipayNotifyUrl()`**: it embeds `ALIPAY_CALLBACK_SECRET` in its query string, and application logs are usually the least protected place in the stack. Log only `NEXT_PUBLIC_APP_URL`, or the notify URL with the token redacted.

### 5. Configure and switch on

```bash
ALIPAY_ENABLED=true
ALIPAY_API_URL=https://worker.gohire.top/payment/payment/create
ALIPAY_PLATFORM=gohire
ALIPAY_CALLBACK_SECRET=<the 32 bytes you generated>
NEXT_PUBLIC_APP_URL=https://your-public-origin
```

### 6. Test the two legs separately, before paying anything

**Order create.** Start a CNY checkout in the UI and confirm the response carries a `redirectUrl` pointing at Alipay, and that the `payment_orders` row exists as `pending` with `pay_url` and `alipay_trade_status` set. A gateway rejection surfaces as `502` with a generic message; the real reason is in the server log (`[checkout] provider error`) and in the order's `provider_payload`.

**Callback.** Simulate exactly what the gateway sends, against a real pending order:

```bash
curl -i "https://<your-domain>/api/payments/alipay/callback?token=<secret>&pay_status=TRADE_SUCCESS&out_trade_no=ARK-…"
```

Assert: `200` with body `{"code":0,"message":"success"}`; the order flips to `paid` with `completed_at`; a subscription and a **paid** invoice appear. Then **replay the identical request** and assert nothing changes and you still get `200` — that is the idempotency proof. Then walk the failure matrix:

| Request | Expected |
| --- | --- |
| wrong or missing `token` | `401` `{"code":40003}` |
| missing `pay_status` or `out_trade_no` | `400` `{"code":40001,"message":"invalid callback params"}` |
| unrecognised `pay_status` | `400` `{"code":40001,"message":"unknown pay_status"}` |
| unknown `out_trade_no` with `TRADE_SUCCESS` | `404` `{"code":40002,"message":"order not found"}` |
| `TRADE_CLOSED` on a pending order | `200`, order → `closed` |
| `TRADE_CLOSED` on an already-paid order | `200`, **no change** — the seat must not be revoked |
| `WAIT_BUYER_PAY` | `200`, no change |
| `TRADE_SUCCESS` for an order created for **Stripe** | `404` `{"code":40002}` — one provider must never settle the other's order |
| `TRADE_SUCCESS` on an order `closed` in the last 2h | `200`, order rescued to `paid`, logged `rescued a recently-closed order` |
| `TRADE_SUCCESS` on an older `closed`, or on `failed`/`refunded` | `409` `{"code":50002,"message":"order not in a payable state"}`, logged at error level — money moved against an order we had written off, and it needs a human |

Repeat the matrix as a POST with a JSON body and again as a form-encoded POST: the handler accepts parameters from the query string, a JSON body, or form data, and all three paths need to work.

### 7. Run one real payment

There is no test money on this path unless the operator provides a sandbox. Use the smallest tier, on a real phone, with a real Alipay account, in production. Watch the server log for the inbound callback — that is the only proof the gateway can actually reach you. Then reconcile that payment with the operator.

### 8. Verify the recovery path

Deliberately break one order's callback (point `NEXT_PUBLIC_APP_URL` at a black hole for a single test), pay, confirm the seat is **not** granted, then exercise your manual runbook (see [Idempotency and failure handling](#idempotency-and-failure-handling)). Because the gateway exposes no order-query API in this integration, that manual runbook is currently the only backstop for a lost callback.

### If you later want a direct Alipay integration

Migrating off the gateway so funds settle to you directly is a different project, not a configuration change. It additionally requires:

- a **China-registered business entity** with a business licence, and an Alipay merchant account (蚂蚁金服商家账号) approved for 电脑网站支付 / 手机网站支付;
- an **ICP filing (ICP备案)** for the domain you collect payments on, which in practice means hosting inside mainland China;
- an app on the **Alipay Open Platform** with its own `app_id`, an **RSA2 keypair** you generate, your public key uploaded to Alipay and their public key (or certificate chain) stored on your side;
- real **signature generation and verification** — signing outbound `alipay.trade.page.pay` requests and verifying `sign` on every inbound `alipay.trade.wap.pay` notify — which replaces `ALIPAY_CALLBACK_SECRET` entirely;
- server-to-server **`alipay.trade.query`** for reconciliation and **`alipay.trade.refund`** for refunds, neither of which exists today;
- settlement, invoicing (发票) and tax obligations in China.

The shape of `lib/payments/alipay.ts` is deliberately narrow — order create, notify verify, status parse — so the swap is contained, but budget for the compliance work, not the code.

---

## Endpoints

### `POST /api/billing/checkout`

Auth required. Body (`checkoutSchema`): `planId`, `cycle` (default `monthly`), `provider` (default `stripe`), optional `agentId`, optional `locale` (used for the order subject shown inside the Alipay app).

Writes the `pending` order, then either fulfils inline (mock) or returns a provider-hosted URL (live).

```jsonc
// live
{ "mode": "live", "order": PaymentOrder, "redirectUrl": "https://checkout.stripe.com/…",
  "subscriptionId": null, "invoice": null }
// mock
{ "mode": "mock", "order": PaymentOrder, "redirectUrl": null,
  "subscriptionId": "uuid", "invoice": Invoice }
```

`502` when the provider cannot be reached. The response message is deliberately generic — provider error text can carry price ids, customer ids and account state, so the real message is logged and written to `payment_orders.provider_payload` instead.

### `POST /api/webhooks/stripe`

Not session-authenticated. Verified by the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET`. The raw request body is read with `req.text()` — parsing it first would change the bytes Stripe signed and break verification.

A verification failure returns `400` **on purpose**, so Stripe retries rather than the event being lost.

### `GET|POST /api/payments/alipay/callback`

Not session-authenticated. Authenticated by `?token=` matching `ALIPAY_CALLBACK_SECRET`. Accepts parameters from the query string, a JSON body, or form data. Responds `{"code":0,"message":"success"}` on success, per the gateway's contract.

### `GET /api/payments/orders/{outTradeNo}`

Auth required, **workspace-scoped** — an order number leaking into a URL or a log cannot be used to read another workspace's billing state. Returns `{ order, invoice }`. This is what the return page polls, because the redirect back from the provider proves nothing.

---

## Idempotency and failure handling

Both providers deliver at least once, and the Alipay gateway will happily send the same
`TRADE_SUCCESS` more than once. Two guards, and — this is the load-bearing detail — they
live in the **same transaction** as the fulfilment.

**The audit row.** After a successful claim — and only then — `fulfilOrder()` inserts
into `payment_events`, in the same transaction, with `onConflictDoNothing` against the
unique index on `(provider, event_id)`. It records what happened; it does **not** gate
anything. Gating on it would mask the one signal that matters: a success notify for an
order in a terminal state would escalate once and then be answered "duplicate, 200" on
every redelivery.

- Stripe's event id is `evt_…`, globally unique per event.
- The gateway has no event id, so the callback synthesises `${outTradeNo}:${payStatus}`.
  A redelivery of the same status deduplicates; a genuine status change still gets through.

**The conditional claim.**

```sql
UPDATE payment_orders SET status = 'paid', completed_at = now()
 WHERE id = $1 AND provider = $2 AND status IN ('pending', 'closed')
 RETURNING *
```

Postgres row-locks the order, so of N concurrent deliveries exactly one gets a row back
and creates the subscription + invoice. Two clauses are doing real work:

- `provider = $2` — passed in by the caller and enforced here, so the CN gateway cannot
  settle a USD Stripe order (and vice versa) even if a future caller forgets to check.
- `status IN ('pending','closed')` — `closed` is reclaimable on purpose. Alipay's gateway
  sends `TRADE_CLOSED` on timeout and can still deliver a later `TRADE_SUCCESS`, or
  deliver the two out of order after a retry. Money actually moving is authoritative over
  an earlier timeout, so a success notify must be able to rescue the order rather than be
  answered "success" while the seat is withheld. Any *other* terminal state returns
  `blockedBy`, which the callers surface (`409` from Alipay, an error log from Stripe)
  rather than acknowledging.

A `TRADE_CLOSED` or `checkout.session.expired` arriving *after* a success cannot revoke a
paid seat: `closeOrder()` is `WHERE status = 'pending'`.

**Why one transaction and not two.** An earlier design committed the dedup row *before*
fulfilling and deleted it in a `catch`. That has a hole with no bottom: if the process is
killed between the two commits — a function timeout, an OOM, an instance recycle — the
`catch` never runs, the claim stands, and the provider's retry is discarded as a
duplicate. The payment is taken and the seat is never granted, silently and permanently.
Writing the dedup row inside the fulfilment transaction makes the failure mode roll back
with everything else, so `500` is always a safe answer.

**What the invoice records.** The amount comes from the **provider**, not from our price
ladder: `session.amount_total` for Stripe. A promotion code (`allow_promotion_codes` is
on) or a `STRIPE_TRIAL_DAYS` trial makes the charge differ from the quote, and an invoice
that asserted the quote would be claiming money that was never collected. A zero-value
cycle is written `status: "open"` with `paidAt` null, and the subscription starts
`trialing`. A provider settling in a different currency from the order throws rather than
writing a mislabelled invoice. The Alipay notify carries no amount at all, so CN orders
fall back to the order's own figure — ask the operator to include the paid `total_amount`
so this can be asserted rather than assumed.

**Invoice numbers derive from the order number** (`INV-<year>-<out_trade_no suffix>`),
which already carries a unique index. A random suffix would eventually collide with
`invoices_number_uniq` and abort the fulfilment transaction *after* the money was taken.

### If a payment was taken and the seat was not granted

1. **Find the order.** `SELECT * FROM payment_orders WHERE out_trade_no = '<ARK-…>'`. A `pending` row with the customer holding a receipt means the confirmation never arrived or never completed.
2. **Check whether the confirmation was ever seen.** `payment_events` holds one row per
   event that actually drove a fulfilment, joined back by `order_id`:
   `SELECT * FROM payment_events WHERE order_id = '<order uuid>'`. For Alipay the event id
   also embeds the order number (`'<out_trade_no>:TRADE_SUCCESS'`), so you can search it
   directly.

   Read the absence carefully — the row is written only on a **successful** claim, so
   "no row" covers two very different cases:

   | Evidence | Meaning |
   | --- | --- |
   | A row, and the order is `paid` | It worked. Look elsewhere. |
   | A row, and the order is still `pending` | Should be impossible — the row and the fulfilment commit in one transaction. Treat it as a bug. |
   | No row, and the log shows `[alipay-callback] TRADE_SUCCESS on a non-claimable order` or `[stripe-webhook] paid session could not be fulfilled` | The confirmation **did** arrive and was refused because the order was in a terminal state. This is the case that needs a human. |
   | No row, and the log shows `handler failed` | It arrived and threw. The provider's retry can still fix it (nothing was committed). Fix the cause. |
   | No row and nothing in the log | It never reached you at all: check the endpoint URL, the signature/token, and reachability. For Stripe, confirm in *Dashboard → Developers → Webhooks* whether delivery was even attempted. |

3. **Stripe: re-deliver.** *Dashboard → Developers → Webhooks → your endpoint → Events* → find the event → **Resend**. This is the correct fix in almost every case: the handler is idempotent, so resending is always safe. Verify the payment really succeeded in *Payments* first.
4. **Alipay: ask the operator to re-deliver**, or replay the callback yourself with the `curl` from step 6 above once you have confirmed the payment in the operator's records. The token makes this an authenticated operation, so it is a support action, not something a customer can do.
5. **Last resort — replay by hand.** With proof of payment, re-issue the notify/webhook against the live endpoint. Do **not** hand-write `subscriptions` and `invoices` rows: going through `fulfilOrder()` keeps the order, subscription and invoice linked and keeps the idempotency guarantee intact for any later retry.

---

## Known gaps

Stated plainly, because each of these is a support ticket waiting to happen.

- **No refund flow.** `payment_orders.status` has a `refunded` value and nothing ever sets it. Refunds must be issued in the Stripe Dashboard (or by the gateway operator for Alipay) and the ArkAgent row corrected by hand; no seat is revoked automatically.
- **No subscription cancellation UI.** The webhook *handles* `customer.subscription.deleted` and mirrors `cancel_at_period_end`, but nothing in the app initiates a cancellation. There is no Stripe Customer Portal route. Customers cancel by contacting support, who cancel in the Dashboard.
- **Alipay renewals are manual.** There is no recurring-payment primitive on this path. An Alipay seat is a one-off payment that opens a fixed period — 30 days for a monthly purchase (`ALIPAY_PERIOD_DAYS`), 365 for an annual one — and extending it means buying again, which creates a new order and a new subscription row. Nothing expires the old one automatically, and there are no renewal reminders.
- **No proration on upgrade.** Buying a different tier creates a new order, a new subscription and a new invoice at full price. The previous seat is untouched — no credit, no mid-cycle adjustment, no downgrade path.
- **No Alipay reconciliation.** The gateway exposes no order-query endpoint in this integration, so there is no way to ask "did this order actually get paid?" server-to-server. A lost callback is only recoverable through the manual runbook above.
- **No expiry sweep for abandoned orders.** Stripe sends `checkout.session.expired`, so its abandoned orders close themselves. The Alipay gateway sends nothing equivalent unless the trade times out, so a CN order the buyer simply walked away from stays `pending` indefinitely. Nothing accumulates incorrectly — a stale `pending` grants no seat — but the table grows and `payment_orders_status_idx` fills with rows no one will ever look at. A scheduled job closing `pending` orders older than a few hours would fix it; there is no cron in this app today.
- **`GET /api/billing` reports seat prices in USD only.** `seats[].priceCents` is read from `plans.monthly_price_cents` regardless of the viewer's currency; CNY rendering uses `plans.monthly_price_fen` from the plan catalog in the same response.
- **The payment tables ship in a migration you have to apply.** `payment_orders`, `payment_events` and the new columns arrive in `lib/db/migrations/0004_brainy_zeigeist.sql`. Run `npm run db:migrate` before taking any payment, and confirm `payment_orders_out_trade_no_uniq` and `payment_events_provider_event_uniq` actually exist in the target database — they are the constraints the whole idempotency story rests on.
