# ArkAgent — Product Requirements Document

> **Product:** ArkAgent (global: `arkagent.ai` · China: `iagent.cc`)
> **Tagline:** *Hire an AI employee, not another app.*
> **Status:** Living document — source of truth for product scope and the US1–US10 roadmap.
> **Audience:** Engineers building ArkAgent on Next.js 16 (App Router) + React 19 + TypeScript, Postgres/Drizzle, deployed on Vercel.

---

## 1. Overview & Vision

ArkAgent turns "buying software" into "hiring staff." Instead of learning yet another SaaS dashboard, a customer **briefs an autonomous AI agent the way they would brief a new hire** — give it a role, written instructions, hard rules, and the communication channels it should live in — and the agent then works around the clock on its own dedicated remote VM. Agents sell, support, recruit, write, and handle admin without the user babysitting a tool.

The core mechanic is *delegation, not operation*. A user does not "use" an ArkAgent agent the way they use a CRM; they **manage** it the way a manager manages a report — reviewing its work, approving its self-improvement proposals, adjusting its brief, and reaching it through the same messaging apps they already use (Telegram, WhatsApp, WeChat, LINE, Slack, Email, or web chat).

Each agent is powered by one of two interchangeable runtimes — **OpenClaw** or **Hermes** — that execute on a dedicated VM. ArkAgent itself never runs the agent. A separate backend service, the **Agent Manager**, owns the VM lifecycle and the agent runtime. ArkAgent is the **product surface and system of record**: it captures the brief, orchestrates provisioning requests, persists all state and history, meters usage, and renders everything the customer sees.

The vision: make a competent AI workforce as easy to hire, manage, and pay for as a contractor — available globally via `arkagent.ai` and in China via `iagent.cc`, in English, Simplified Chinese, and Traditional Chinese.

---

## 2. Target Users & Personas

ArkAgent targets buyers who feel the pain of "too much to do, not enough headcount" and who are comfortable delegating outcomes rather than operating tools.

### 2.1 Persona A — Maya, the SMB Owner
- **Context:** Owns a 12-person services business. Wears the sales, marketing, and customer-support hats simultaneously.
- **Jobs to be done:** Cover after-hours support; chase inbound leads before they go cold; keep social/content cadence alive.
- **Behavior:** Lives in WhatsApp and Email; does not want a new app to check. Wants to "hire" a support agent and a prospecting agent and check on them from her phone.
- **Maps to:** US3 (hire), US6 (chat), US7 (channels), US4 (dashboard), US9 (billing).

### 2.2 Persona B — Devin, the "One-Person Company" Operator
- **Context:** Solo founder / creator running an e-commerce + content brand. No staff, infinite tasks.
- **Jobs to be done:** Multiply himself — one agent writing content, one handling DMs, one doing admin/ops — without learning ops tooling.
- **Behavior:** Power user. Will iterate on the job brief, tune rules, and lean heavily on AI auto-generate. Watches credit burn closely because budget is personal.
- **Maps to:** US3 (hire + AI auto-generate brief), US5 (manage/tune), US8 (pause to control cost), US9 (usage), US10 (works in zh/zht).

### 2.3 Persona C — Lin, the Ops Lead
- **Context:** Operations lead at a 60–150 person company; reports to a COO; manages a small team plus tooling budget.
- **Jobs to be done:** Stand up a fleet of agents across functions (HR screening, support tier-1, legal intake triage), enforce guardrails, prove ROI to leadership, control spend across seats.
- **Behavior:** Cares about governance — wants the self-review approval queue (nothing ships unreviewed early on), per-agent usage attribution, channel security, and a workspace others can collaborate in.
- **Maps to:** US1 (workspace), US4 (roster + review queue), US5 (approve/dismiss improvements), US7 (workspace channels), US9 (seats roll up to workspace credits), US8 (lifecycle control).

---

## 3. Problem & Value Proposition

### 3.1 Problem
- **Headcount is the bottleneck, not ideas.** SMBs and solo operators have more work than hands, and hiring is slow, expensive, and risky.
- **"AI tools" still require a human operator.** Most AI products are apps you must drive — they add a tab, not a teammate. The work still lands on the owner.
- **Context-switching tax.** Customers already live in their messaging apps; a new dashboard they must remember to open is friction, not relief.
- **Trust & control gap.** Autonomous software that acts on your behalf is scary without guardrails, an audit trail, and an off switch.

### 3.2 Value Proposition
- **Hire, don't operate.** A guided 4-step hire wizard produces a working agent on its own VM — selling, supporting, writing — with no operator required.
- **Meet customers where they already are.** Agents are reachable and manageable directly from Telegram/WhatsApp/WeChat/LINE/Slack/Email/web chat (US6, US7).
- **Managerial control, not blind trust.** Live activity feed, an explicit **self-review approval queue** (US5), editable brief that re-syncs to the runtime, and pause/resume/terminate controls (US8).
- **Usage-based economics that map to "staff cost."** Credit plans (Associate / Professional / Director) with transparent per-agent burn (US9).
- **Native to two markets.** First-class English, Simplified Chinese, Traditional Chinese; Stripe globally and Alipay in China (US9, US10).

---

## 4. Goals & Non-Goals

### 4.1 Goals
1. Let a brand-new user go from signup to a **live, working agent in under 10 minutes** (US1 → US3).
2. Make managing an agent feel like managing a person: brief, review, adjust, pause (US5, US8).
3. Be a **reliable system of record** — every status change, activity, message, metric, and credit charge is persisted and attributable.
4. Keep the human in control of trust-sensitive moments via the **self-review approval queue** (US5).
5. Be genuinely usable end-to-end in en/zh/zht and pay-ready in both Stripe and Alipay markets (US9, US10).
6. Cleanly separate concerns from the **Agent Manager** so the runtime can evolve independently (§7).

### 4.2 Non-Goals
1. **ArkAgent does not run agents.** No VM provisioning, engine installation, or runtime execution lives in ArkAgent — that is the Agent Manager's job (§7).
2. **Not a general no-code/workflow builder.** The product is "hire an employee," not a node-graph automation canvas.
3. **No model/runtime authoring.** Customers choose OpenClaw or Hermes; they do not build or fine-tune engines.
4. **Not a generic team-chat/inbox product.** Conversations exist to talk to *agents*, not to replace Slack between humans.
5. **No marketplace of third-party agents** in this scope — agents are hired from the 8 seeded roles, not bought from external vendors.
6. **No on-prem / self-hosted runtime** in this scope.

---

## 5. Feature Summary (mapped to US1–US10)

| US | Title | What ArkAgent delivers | Primary tables |
|----|-------|------------------------|----------------|
| **US1** | Sign up & workspace creation | Email+password registration (scrypt hashing); on signup, auto-create the user's personal **workspace** and owner `workspace_members` row. | `users`, `workspaces`, `workspace_members`, `sessions` |
| **US2** | Sign in / sign out / session | Authenticate returning users; issue an HTTP-only session cookie (only the token's SHA-256 stored); persist session; sign out invalidates it. | `users`, `sessions` |
| **US3** | Hire an agent | 4-step wizard: (1) pick a role from 8 seeded `agent_roles`; (2) write the job brief — instructions + rules, with **AI auto-generate**; (3) choose engine (OpenClaw/Hermes) + channels; (4) review & launch. ArkAgent saves config, calls Agent Manager to provision the VM + deploy the engine; status walks `draft → provisioning → deploying → working`. | `agents`, `agent_roles`, `channels`, `agent_channels`, `plans` |
| **US4** | Dashboard overview | Agent roster, live **activity feed**, credit usage vs included, and an "items needing review" surface (agents in `needs_review` + pending `agent_improvements`). | `agents`, `agent_activities`, `agent_metrics`, `usage_records`, `agent_improvements` |
| **US5** | Manage an agent | Agent detail with tabs **Activity / Tasks / Performance / Settings**; approve/dismiss self-review improvement suggestions; edit instructions/rules/channels → **re-syncs to Agent Manager**. | `agents`, `agent_tasks`, `agent_metrics`, `agent_activities`, `agent_improvements`, `agent_channels` |
| **US6** | Chat with an agent | Web-channel conversation: user message → ArkAgent relays to Agent Manager → agent reply arrives via webhook and renders; full history persists. | `conversations`, `messages`, `channels`, `agents` |
| **US7** | Connect & manage channels | Connect/configure Telegram/WhatsApp/WeChat/LINE/Slack/Email/web at the **workspace** level; attach channels to agents; secrets stored **encrypted**. | `channels`, `agent_channels`, `workspaces` |
| **US8** | Agent lifecycle control | Pause, resume, terminate — each calls the Agent Manager and updates `status` (`paused`, `working`, `terminated`). | `agents` |
| **US9** | Billing & usage | Credits used vs included, per-agent usage, invoices; pick plan (Associate $49/5k · Professional $149/25k · Director $399/100k) + cycle; pay via **Stripe** (global) or **Alipay** (China); seats roll up to workspace credits. | `plans`, `subscriptions`, `invoices`, `usage_records`, `workspaces`, `workspace_members` |
| **US10** | Localization & preferences | Use the product in en/zh/zht; switch language and light/dark theme; persisted to the user profile. | `users` |

### 5.1 Cross-cutting capabilities
- **Self-review queue (US4 + US5):** the Agent Manager posts `agent_improvements` (engine self-review suggestions) in `pending`; a human approves (applies + re-syncs brief) or dismisses. This is the central trust mechanism.
- **Activity feed (US4 + US5):** `agent_activities` is an append-only timeline written from inbound Agent Manager webhooks, surfaced both globally and per-agent.
- **Credit ledger (US9):** `usage_records` is the authoritative per-event credit ledger; dashboard and billing both read from it for attribution.
- **Shared Agent Manager fields on `agents`:** `agent_manager_id`, `vm_id`, `vm_region`, `deployment_status`, `last_heartbeat_at`, `provisioned_at` — written by ArkAgent on provisioning calls and updated by inbound webhooks.

---

## 6. Key Flows

### 6.1 Hire → Provision → Work (US3 → US8 → US4)
1. **Brief (ArkAgent):** User completes the 4-step wizard. Step 1 selects an `agent_roles` row; step 2 writes `instructions` + `rules` (optionally AI auto-generated); step 3 picks `engine` (OpenClaw/Hermes) and selects/creates `channels` to attach via `agent_channels`; step 4 reviews and launches.
2. **Persist + request (ArkAgent → Agent Manager):** ArkAgent inserts the `agents` row at `status = draft`, then calls the Agent Manager **provision API** with the brief, engine, region, and channel bindings. Status moves to `provisioning`.
3. **Provision (Agent Manager):** Agent Manager creates the VM, installs and deploys OpenClaw/Hermes, and wires channel comms. It calls ArkAgent's **signed webhook** with `agent_manager_id`, `vm_id`, `vm_region`, `provisioned_at`, advancing status `provisioning → deploying → working`; `last_heartbeat_at` begins updating on heartbeats.
4. **Work (Agent Manager → ArkAgent):** As the agent works, the Agent Manager posts inbound webhooks: `agent_activities` (timeline), `agent_metrics` (performance), `usage_records` (credit burn), inbound `messages`, and `agent_improvements` (self-review). ArkAgent renders these in the dashboard (US4) and agent detail (US5).
5. **Dev:** A built-in **MOCK Agent Manager** simulates this entire lifecycle (status transitions, heartbeats, activity, sample improvements) so the product is fully exercisable without the real backend.

```
draft → provisioning → deploying → working ⇄ scheduled
                                       │
                          needs_review │ (resume) ⇄ paused
                                       ▼
                                     error
                                       │
                                  terminated
```

### 6.2 Chat with an agent (US6)
1. User opens a web-channel conversation with a `working` agent; ArkAgent finds/creates the `conversations` row.
2. User sends a message → persisted to `messages` (role `user`) → ArkAgent calls the Agent Manager **send-message API** for that `agent_manager_id`.
3. The agent processes on its VM; the reply returns via a **signed inbound-message webhook**. ArkAgent persists it (role `agent`) and pushes it to the open conversation.
4. Full history persists in `messages`; the same agent reached over Telegram/WhatsApp/etc. shares the conversation model so context is continuous.

### 6.3 Billing & usage (US9)
1. **Meter:** Every credit-consuming agent event posts a `usage_records` entry (attributed to agent + workspace).
2. **Plan + cycle:** User picks Associate / Professional / Director and a billing cycle → creates/updates a `subscriptions` row.
3. **Pay:** Checkout routes by market — **Stripe** on `arkagent.ai` (global), **Alipay** on `iagent.cc` (China). Successful payment writes an `invoices` row.
4. **Roll-up:** Included credits live at the workspace level; **seats roll up to workspace credits**, and the dashboard/billing views show used-vs-included plus per-agent burn from the ledger.

---

## 7. The Agent Manager Relationship

The **Agent Manager** is an external backend (implemented elsewhere). The boundary is strict and load-bearing — get it wrong and the system of record and the runtime fight each other.

### 7.1 What ArkAgent owns
- The **product/UI** and all customer-facing flows (US1–US10).
- The **system of record**: all 18 tables — users, auth/sessions, workspaces & members, roles, plans, agent **configuration** (role, instructions, rules, engine, channel bindings), tasks, activities, metrics, improvements queue, conversations & messages, subscriptions, invoices, and the credit ledger.
- **Auth & security:** custom email/password (scrypt), HTTP-only session cookies (SHA-256 token storage), encrypted channel secrets, and **verification of signed webhooks** from the Agent Manager.
- **Orchestration intent:** deciding *when* to provision, re-sync, pause, resume, terminate, and *what* the brief/config is — by calling the Agent Manager HTTP API.
- **Billing & metering**, plan/seat logic, and credit accounting.
- **i18n, theming, and preferences.**

### 7.2 What the Agent Manager owns
- **VM lifecycle:** create, region placement, teardown.
- **Engine lifecycle:** installing & deploying OpenClaw/Hermes onto the VM.
- **Runtime:** managing and monitoring the running agent; emitting heartbeats.
- **Channel transport:** the actual agent ↔ channel message delivery.
- **Self-review generation:** producing the improvement suggestions ArkAgent queues.

### 7.3 The contract
- **ArkAgent → Agent Manager (HTTP API):** provision, re-sync config, send message, pause, resume, terminate.
- **Agent Manager → ArkAgent (signed webhooks):** status changes, heartbeats, inbound agent messages, activity, metrics, usage, self-review suggestions.
- **Shared fields on `agents`:** `agent_manager_id`, `vm_id`, `vm_region`, `deployment_status`, `last_heartbeat_at`, `provisioned_at` — ArkAgent writes intent and records what the Agent Manager reports.
- **Dev environment:** the **MOCK Agent Manager** implements both directions so all flows work offline.

---

## 8. i18n & Markets

### 8.1 Languages
- First-class **English (`en`)**, **Simplified Chinese (`zh`)**, and **Traditional Chinese (`zht`)** across the entire product surface — not just marketing pages.
- Language and theme (light/dark) are user preferences **persisted to the user profile** (US10) and applied via the existing inline "Terminal Lime" design system with responsive tokens.

### 8.2 Two domains, one product
| | Global | China |
|---|--------|-------|
| **Domain** | `arkagent.ai` | `iagent.cc` |
| **Default languages** | en (zh/zht available) | zh / zht (en available) |
| **Payment** | **Stripe** | **Alipay** |
| **Primary channels** | Telegram, WhatsApp, Slack, LINE, Email, web | WeChat, web (plus others as available) |

### 8.3 Market-aware behavior
- **Payment routing (US9):** checkout selects Stripe vs Alipay by domain/market; `subscriptions`/`invoices` are payment-provider agnostic.
- **Channel emphasis (US7):** WeChat is foregrounded on `iagent.cc`; Telegram/WhatsApp/Slack on `arkagent.ai`. All channels share the same `channels`/`agent_channels` model.
- **Compliance posture:** China deployment assumes data-residency and channel constraints handled at the Agent Manager / infra layer (`vm_region`); ArkAgent keeps config and records consistent across both domains.

---

## 9. Success Metrics

### 9.1 Activation
- **Time-to-first-working-agent:** median signup → first agent at `working` **< 10 minutes** (US1 → US3).
- **Hire completion rate:** % of started hire wizards that reach launch.
- **AI auto-generate adoption:** % of briefs using the auto-generate step.

### 9.2 Engagement & trust
- **Active agents per workspace** (status `working`/`scheduled`).
- **Self-review throughput (US5):** median time `agent_improvements` spends in `pending`; approve-vs-dismiss ratio.
- **Cross-channel reach (US6/US7):** % of agents with ≥1 non-web channel attached; messages handled per agent.

### 9.3 Reliability
- **Provision success rate** and median `provisioning → working` duration.
- **Heartbeat health:** % of working agents with a fresh `last_heartbeat_at`; count entering `error`.

### 9.4 Monetization
- **Paid conversion** and **plan mix** (Associate / Professional / Director).
- **Credit utilization:** used vs included per workspace; expansion (seats/plan upgrades).
- **Net revenue retention** and churn, split by market (Stripe vs Alipay).

---

## 10. Risks & Assumptions

### 10.1 Risks
- **Agent Manager coupling & drift.** A mismatched API/webhook contract or unverified signatures could desync state or allow spoofed updates. *Mitigation:* strict signed-webhook verification, idempotent webhook handlers keyed on `agent_manager_id`/event id, and the MOCK Agent Manager as a contract reference.
- **Autonomy without trust.** Agents acting on real channels could embarrass or harm the customer. *Mitigation:* the self-review approval queue (US5), explicit `rules`, the `needs_review` state, and one-click pause/terminate (US8).
- **Runaway credit burn.** Always-on agents can consume credits fast and surprise users. *Mitigation:* transparent per-agent ledger (US9), usage on the dashboard (US4), and pause controls.
- **Channel-secret exposure.** Telegram/WeChat/etc. credentials are high-value. *Mitigation:* encrypted-at-rest secrets, never returned in plaintext to the client.
- **China market complexity.** WeChat onboarding, Alipay integration, and data-residency are non-trivial. *Mitigation:* market-aware routing, `vm_region`, and treating compliance as an infra/Agent-Manager concern.
- **Provisioning latency / failure** undermining the "<10 min to working" promise. *Mitigation:* clear status UX (`provisioning`/`deploying`), `error` state handling, and retry semantics.

### 10.2 Assumptions
- The **Agent Manager exists and is reliable**, exposes the documented HTTP API, and calls back via signed webhooks for status, heartbeats, inbound messages, activity, metrics, usage, and self-review.
- OpenClaw and Hermes are **interchangeable at the config level** — choosing one does not change ArkAgent's data model.
- The **18-table schema is already migrated**, with the 8 seeded `agent_roles` and 3 seeded `plans` in place.
- Customers are **comfortable delegating** outcomes to an autonomous agent given visible guardrails and an audit trail.
- A single ArkAgent codebase serves both `arkagent.ai` and `iagent.cc`, differing by market config (language defaults, payment provider, channel emphasis), not by fork.
- This is **Next.js 16 App Router + React 19 + TypeScript on Vercel** with Postgres via Drizzle; APIs are route handlers under `app/api/**`.
