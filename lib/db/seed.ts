/**
 * Seed: reference data (agent_roles, plans) + a fully-populated demo workspace
 * mapped from the prototype content, so the UI and tests have real data.
 * Run with:  npm run db:seed   (idempotent — re-seeding rebuilds the demo data)
 */
import { randomUUID, scryptSync, randomBytes } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "./index";
import * as s from "./schema";
import { genTexts, landingRoles, rolesData } from "../data";
// The fictional roster lives behind `server-only` so it cannot reach a browser
// bundle; only `seedDemoWorkspace()` below reads it.
import { agentsData, invoiceFixtures, roleIdByName } from "./demo-fixtures";
import { overagePer1k, planPrice } from "../pricing";
import { roleHue } from "../theme";

// The ONLY account that carries mock/demo data. Every other (registered) user
// starts with an empty, real workspace.
const DEMO_EMAIL = "demo";
const DEMO_PASSWORD = "demo123";

/**
 * Platform administrator. Overridable so a real deployment never has to ship
 * the checked-in default; with no env set it is exactly the account the product
 * owner asked for.
 */
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@iagent.cc").toLowerCase().trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Lightark@1";
const ADMIN_NAME = process.env.ADMIN_NAME || "Platform Admin";
const ADMIN_PASSWORD_IS_DEFAULT = !process.env.ADMIN_PASSWORD;

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Seeding the demo workspace is opt-in and never available in production.
 *
 * `demo` / `demo123` is a guessable credential, and the workspace behind it
 * owns real agents with real `agent_manager_id` values, billing seats and paid
 * invoices. On a public host, anyone who can type the password can reconfigure
 * or delete them. The flag alone would not be enough — the point is that it
 * cannot be set by accident on a live host — hence the second check below.
 */
const SEED_DEMO = process.env.SEED_DEMO === "1";

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
const num = (v: string) => Number(v.replace(/[^0-9]/g, "")) || 0;
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000);
const daysAhead = (d: number) => new Date(Date.now() + d * 86400_000);

type Engine = typeof s.agents.$inferInsert["engine"];
type AgentStatus = typeof s.agents.$inferInsert["status"];
type TaskStatus = typeof s.agentTasks.$inferInsert["status"];
type Tag = typeof s.agentActivities.$inferInsert["tag"];
type PlanTier = typeof s.plans.$inferInsert["id"];
type ChannelType = typeof s.channels.$inferInsert["type"];
type ChannelStatus = typeof s.channels.$inferInsert["status"];

/**
 * The harness a role defaults to.
 *
 * Customer Support used to default to Hermes, which is wrong for the one role
 * whose entire job is holding conversations on messaging channels: Hermes'
 * channel support is CONFIRM-6 in the backend contract — unverified end to end —
 * and `HARNESS_PROFILES.hermes.channels` is `"unknown"` for exactly that reason.
 * Defaulting a support agent onto an unverified channel stack means its first
 * customer message is where we find out.
 *
 * Content and Legal stay on Hermes: they are drafting roles that work through
 * the dashboard, where the harness is exercised.
 */
function roleEngine(roleId: string): Engine {
  return roleId === "content" || roleId === "legal" ? "hermes" : "openclaw";
}
function mapStatus(st: string): AgentStatus {
  if (st === "WORKING") return "working";
  if (st === "SCHEDULED") return "scheduled";
  if (st === "NEEDS REVIEW") return "needs_review";
  return "working";
}
function mapTask(sym: string): TaskStatus {
  if (sym === "✓") return "done";
  if (sym === "◌") return "in_progress";
  if (sym === "!") return "blocked";
  return "queued";
}
const TAGS = new Set<string>([
  "meeting", "draft", "research", "review", "outreach", "learning", "resolved",
  "escalated", "summary", "published", "brief", "calendar", "docs", "system",
]);
function mapTag(tag: string): Tag {
  const t = tag.toLowerCase();
  return (TAGS.has(t) ? t : "system") as Tag;
}
function planForAgent(name: string): PlanTier {
  return name === "Nova" || name === "Atlas" ? "professional" : "associate";
}
function channelsForAgent(name: string): ChannelType[] {
  switch (name) {
    case "Nova": return ["telegram", "whatsapp", "web"];
    case "Atlas": return ["whatsapp", "wechat", "web"];
    case "Mei": return ["wechat", "email"];
    case "Juno": return ["slack"];
    default: return ["web"];
  }
}

async function main() {
  console.log("→ seeding reference data…");

  // ---- plans ----
  // Prices come from lib/pricing.ts so the table can never drift from the
  // ladder the landing page and the checkout quote from.
  const planCatalog: {
    id: PlanTier;
    name: string;
    includedCredits: number;
    sortOrder: number;
    features: string[];
  }[] = [
    { id: "associate", name: "Associate", includedCredits: 5000, sortOrder: 0, features: ["5,000 credits included monthly", "1 messaging channel", "Weekly self-review", "OpenClaw engine"] },
    { id: "professional", name: "Professional", includedCredits: 25000, sortOrder: 1, features: ["25,000 credits included monthly", "All channels — Telegram to WeChat", "Daily self-review + persistent memory", "Both engines + auto-match", "Priority compute"] },
    { id: "director", name: "Director", includedCredits: 100000, sortOrder: 2, features: ["100,000 credits included monthly", "Dedicated VM resources", "OPC mode — one agent, many hats", "Audit log & approval workflows", "White-glove onboarding"] },
  ];
  const planSeed = planCatalog.map((p) => ({
    ...p,
    monthlyPriceCents: planPrice(p.id, "usd"),
    overageCentsPer1k: overagePer1k(p.id, "usd"),
    monthlyPriceFen: planPrice(p.id, "cny"),
    overageFenPer1k: overagePer1k(p.id, "cny"),
  }));

  // Upsert, not do-nothing: the three plan ids already exist in every database
  // that has ever been seeded, so a do-nothing insert would leave the CNY
  // columns (and any future repricing) permanently at their defaults.
  await db
    .insert(s.plans)
    .values(planSeed)
    .onConflictDoUpdate({
      target: s.plans.id,
      set: {
        name: sql`excluded.name`,
        monthlyPriceCents: sql`excluded.monthly_price_cents`,
        includedCredits: sql`excluded.included_credits`,
        overageCentsPer1k: sql`excluded.overage_cents_per_1k`,
        monthlyPriceFen: sql`excluded.monthly_price_fen`,
        overageFenPer1k: sql`excluded.overage_fen_per_1k`,
        features: sql`excluded.features`,
        sortOrder: sql`excluded.sort_order`,
      },
    });

  // ---- agent_roles ----
  const roleRows = rolesData.map((r, i) => ({
    id: r.id,
    name: r.name,
    blurb: r.blurb,
    longBlurb: landingRoles.find((l) => l.id === r.id)?.long ?? null,
    hue: roleHue[r.id] ?? "#9AA3B2",
    mono: r.mono,
    defaultEngine: roleEngine(r.id),
    defaultInstructions: genTexts[r.id]?.i ?? null,
    defaultRules: genTexts[r.id]?.r ?? null,
    minPlan: r.minPlan,
    sortOrder: i,
  }));
  // Upsert, not do-nothing — the same reasoning as the plans table above. Every
  // role id already exists in any database that has ever been seeded, so a
  // do-nothing insert means a corrected blurb, a re-pointed default harness or a
  // reworded fallback brief NEVER reaches an existing deployment. Only the
  // columns this seed owns are written; `agent_roles` also holds `ocm-*` rows
  // mirrored from the OpenClaw Manager by /api/roles, and those are untouched
  // because they are not in `roleRows`.
  await db
    .insert(s.agentRoles)
    .values(roleRows)
    .onConflictDoUpdate({
      target: s.agentRoles.id,
      set: {
        name: sql`excluded.name`,
        blurb: sql`excluded.blurb`,
        longBlurb: sql`excluded.long_blurb`,
        hue: sql`excluded.hue`,
        mono: sql`excluded.mono`,
        defaultEngine: sql`excluded.default_engine`,
        defaultInstructions: sql`excluded.default_instructions`,
        defaultRules: sql`excluded.default_rules`,
        minPlan: sql`excluded.min_plan`,
        sortOrder: sql`excluded.sort_order`,
      },
    });

  if (SEED_DEMO) {
    // Belt and braces: the flag says what the operator wanted, this says what
    // is allowed. A misconfigured CI variable must not be able to publish a
    // guessable login to a live database.
    if (IS_PRODUCTION) {
      throw new Error("Refusing to seed the demo workspace in production (SEED_DEMO=1 with NODE_ENV=production).");
    }
    await seedDemoWorkspace();
  } else {
    console.log("→ skipping demo workspace (set SEED_DEMO=1 outside production to include it)");
  }

  await seedPlatformAdmin();

  console.log("✓ seed complete");
  if (SEED_DEMO) console.log(`  demo login  → ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  admin login → ${ADMIN_EMAIL} / ${ADMIN_PASSWORD_IS_DEFAULT ? ADMIN_PASSWORD : "(from ADMIN_PASSWORD)"}`);
  if (ADMIN_PASSWORD_IS_DEFAULT) {
    console.warn(
      [
        "",
        "  ┌─────────────────────────────────────────────────────────────────┐",
        "  │ WARNING: the platform admin is using the DEFAULT password from  │",
        "  │ the repository. Anyone who can read this source can sign in as  │",
        "  │ a platform administrator on any host where this seed has run.   │",
        "  │ Before exposing this deployment, set ADMIN_PASSWORD and re-run  │",
        "  │ `npm run db:seed`, or change it from the account screen.        │",
        "  └─────────────────────────────────────────────────────────────────┘",
        "",
      ].join("\n"),
    );
  }
}


/**
 * The demo workspace: a fully-populated Ark Industries with four agents.
 *
 * Opt-in (`SEED_DEMO=1`) and refused outright in production. `demo` / `demo123`
 * is a guessable credential, and everything behind it — agents carrying real
 * `agent_manager_id` values, billing seats, paid invoices — is reconfigurable
 * and deletable by anyone who signs in. It exists for local development and
 * CI, and must never reach a public host.
 */
async function seedDemoWorkspace() {
  console.log("→ rebuilding demo workspace…");
  // Remove any prior demo data (current + legacy demo logins). Delete the
  // workspace first (cascades agents, channels, subscriptions, invoices, usage)
  // so agents.created_by_id no longer references the user, then delete the user
  // (cascades its sessions). Cleaning legacy emails avoids orphaned demo data
  // (e.g. colliding invoice numbers) when the demo login is renamed.
  const LEGACY_DEMO_EMAILS = ["wei@company.com"];
  const priorUsers = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(inArray(s.users.email, [DEMO_EMAIL, ...LEGACY_DEMO_EMAILS]));
  for (const u of priorUsers) {
    await db.delete(s.workspaces).where(eq(s.workspaces.ownerId, u.id));
    await db.delete(s.users).where(eq(s.users.id, u.id));
  }

  const [user] = await db
    .insert(s.users)
    .values({
      email: DEMO_EMAIL,
      passwordHash: hashPassword(DEMO_PASSWORD),
      name: "Demo",
      locale: "en",
      emailVerifiedAt: new Date(),
    })
    .returning();

  const [ws] = await db
    .insert(s.workspaces)
    .values({
      name: "Ark Industries Pte Ltd",
      ownerId: user.id,
      creditsIncluded: 30000,
      creditsUsed: 18420,
      cycleResetsAt: daysAhead(17),
    })
    .returning();

  await db.insert(s.workspaceMembers).values({ workspaceId: ws.id, userId: user.id, role: "owner" });

  // ---- channels ----
  const channelSeed: { type: ChannelType; status: ChannelStatus; label: string }[] = [
    { type: "telegram", status: "connected", label: "Telegram" },
    { type: "whatsapp", status: "connected", label: "WhatsApp" },
    { type: "wechat", status: "connected", label: "WeChat 微信" },
    { type: "line", status: "disconnected", label: "LINE" },
    { type: "slack", status: "pending", label: "Slack" },
    { type: "email", status: "disconnected", label: "Email" },
    { type: "web", status: "connected", label: "Web chat" },
  ];
  const insertedChannels = await db
    .insert(s.channels)
    .values(channelSeed.map((c) => ({ ...c, workspaceId: ws.id })))
    .returning();
  const channelByType = new Map(insertedChannels.map((c) => [c.type, c]));

  // ---- agents ----
  for (const a of agentsData) {
    const roleId = roleIdByName[a.role] ?? "admin";
    const region = a.vm.split("-").slice(0, 1).join("-") ? a.vm : "sgp-04";
    const [agent] = await db
      .insert(s.agents)
      .values({
        workspaceId: ws.id,
        createdById: user.id,
        name: a.name,
        roleId,
        engine: a.engine.toLowerCase() as Engine,
        planTier: planForAgent(a.name),
        status: mapStatus(a.st),
        instructions: genTexts[roleId]?.i ?? "",
        rules: genTexts[roleId]?.r ?? "",
        hue: roleHue[roleId] ?? "#9AA3B2",
        creditsUsed: num(a.credits),
        agentManagerId: `am_${randomUUID()}`,
        vmId: a.vm,
        vmRegion: region,
        deploymentStatus: "deployed",
        provisionedAt: daysAgo(20),
        uptimeStartedAt: daysAgo(12),
        lastHeartbeatAt: new Date(),
      })
      .returning();

    if (a.tasks.length)
      await db.insert(s.agentTasks).values(
        a.tasks.map((t, i) => ({
          agentId: agent.id,
          text: t.txt,
          status: mapTask(t.sym),
          meta: t.meta,
          sortOrder: i,
        })),
      );

    if (a.act.length)
      await db.insert(s.agentActivities).values(
        a.act.map((ac, i) => ({
          agentId: agent.id,
          text: ac.txt,
          tag: mapTag(ac.tag),
          occurredAt: new Date(Date.now() - i * 90 * 60 * 1000),
        })),
      );

    if (a.perf.length)
      await db.insert(s.agentMetrics).values(
        a.perf.map((p) => ({
          agentId: agent.id,
          label: p.label,
          value: p.val,
          delta: p.delta,
          weight: num(p.w),
        })),
      );

    if (a.queue.length)
      await db.insert(s.agentImprovements).values(
        a.queue.map((q) => ({ agentId: agent.id, text: q.txt, impact: q.impact, status: "pending" as const })),
      );

    for (const ct of channelsForAgent(a.name)) {
      const ch = channelByType.get(ct);
      if (ch) await db.insert(s.agentChannels).values({ agentId: agent.id, channelId: ch.id });
    }

    await db.insert(s.subscriptions).values({
      workspaceId: ws.id,
      agentId: agent.id,
      planId: planForAgent(a.name),
      cycle: "monthly",
      status: "active",
      currentPeriodEnd: daysAhead(17),
    });

    if (a.chat.length) {
      const [conv] = await db
        .insert(s.conversations)
        .values({ agentId: agent.id, channelId: channelByType.get("web")?.id ?? null, subject: "Web chat" })
        .returning();
      let t = Date.now() - a.chat.length * 60_000;
      for (const m of a.chat) {
        await db.insert(s.messages).values({
          conversationId: conv.id,
          agentId: agent.id,
          sender: m.who === "me" ? "user" : "agent",
          body: m.txt,
          channelType: "web",
          status: "delivered",
          meta: m.meta,
          createdAt: new Date(t),
        });
        t += 60_000;
      }
      await db.update(s.conversations).set({ lastMessageAt: new Date(t) }).where(eq(s.conversations.id, conv.id));
    }

    // a usage record reflecting this agent's consumption
    await db.insert(s.usageRecords).values({
      workspaceId: ws.id,
      agentId: agent.id,
      kind: "compute",
      credits: num(a.credits),
      note: `${a.name} cycle usage`,
    });
  }

  // ---- invoices ----
  // `amountCents` is the generic minor-units column: US cents for the Stripe
  // rows, 人民币分 for the Alipay one. The fixture carries its own currency so
  // the billing table has a mixed history to render.
  await db.insert(s.invoices).values(
    invoiceFixtures.map((inv, i) => ({
      workspaceId: ws.id,
      number: `INV-2026-${100 + i}`,
      amountCents: inv.amountMinor,
      currency: inv.currency,
      status: "paid" as const,
      provider: inv.provider,
      issuedAt: new Date(inv.issued),
      paidAt: new Date(inv.issued),
    })),
  );
}

/**
 * Create-or-repair the platform administrator.
 *
 * Deliberately overwrites BOTH the password hash and the platform role on an
 * existing row. Promotion alone would be an unauthenticated escalation: because
 * registration is open, anyone can register ADMIN_EMAIL before the seed first
 * runs, and a promote-only seed would then hand them the console while leaving
 * their password in place. Overwriting means a squatter loses the account.
 *
 * The admin also gets a workspace: getAuthContext() returns null for a user who
 * owns none, which would make every /dashboard screen behave as signed-out.
 */
async function seedPlatformAdmin() {
  console.log("→ bootstrapping platform admin…");
  const passwordHash = hashPassword(ADMIN_PASSWORD);

  const [admin] = await db
    .insert(s.users)
    .values({
      email: ADMIN_EMAIL,
      passwordHash,
      name: ADMIN_NAME,
      locale: "en",
      platformRole: "admin",
      status: "active",
    })
    .onConflictDoUpdate({
      target: s.users.email,
      set: { passwordHash, platformRole: "admin", status: "active", updatedAt: new Date() },
    })
    .returning();

  const [existingWs] = await db
    .select({ id: s.workspaces.id })
    .from(s.workspaces)
    .where(eq(s.workspaces.ownerId, admin.id))
    .limit(1);

  if (!existingWs) {
    const [ws] = await db
      .insert(s.workspaces)
      .values({ name: "Platform Operations", ownerId: admin.id })
      .returning();
    await db
      .insert(s.workspaceMembers)
      .values({ workspaceId: ws.id, userId: admin.id, role: "owner" })
      .onConflictDoNothing();
  }

  // Any session minted against a pre-existing (possibly squatted) row must not
  // survive the credential reset.
  await db.delete(s.sessions).where(eq(s.sessions.userId, admin.id));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ seed failed:", err);
    process.exit(1);
  });
