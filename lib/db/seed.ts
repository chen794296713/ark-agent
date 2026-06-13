/**
 * Seed: reference data (agent_roles, plans) + a fully-populated demo workspace
 * mapped from the prototype content, so the UI and tests have real data.
 * Run with:  npm run db:seed   (idempotent — re-seeding rebuilds the demo data)
 */
import { randomUUID, scryptSync, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./index";
import * as s from "./schema";
import {
  agentsData,
  genTexts,
  invoices as invoiceData,
  landingRoles,
  roleIdByName,
  rolesData,
} from "../data";
import { roleHue } from "../theme";

const DEMO_EMAIL = "wei@company.com";
const DEMO_PASSWORD = "password123";

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
const num = (v: string) => Number(v.replace(/[^0-9]/g, "")) || 0;
const centsFromDollars = (v: string) => Math.round(num(v.replace(".", "")) ) ; // "$316.80" -> 31680
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000);
const daysAhead = (d: number) => new Date(Date.now() + d * 86400_000);

type Engine = typeof s.agents.$inferInsert["engine"];
type AgentStatus = typeof s.agents.$inferInsert["status"];
type TaskStatus = typeof s.agentTasks.$inferInsert["status"];
type Tag = typeof s.agentActivities.$inferInsert["tag"];
type PlanTier = typeof s.plans.$inferInsert["id"];
type ChannelType = typeof s.channels.$inferInsert["type"];
type ChannelStatus = typeof s.channels.$inferInsert["status"];

function roleEngine(roleId: string): Engine {
  return roleId === "support" || roleId === "content" || roleId === "legal" ? "hermes" : "openclaw";
}
function roleMinPlan(roleId: string): PlanTier {
  return roleId === "opc" ? "director" : roleId === "legal" ? "professional" : "associate";
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
  await db
    .insert(s.plans)
    .values([
      { id: "associate", name: "Associate", monthlyPriceCents: 4900, includedCredits: 5000, overageCentsPer1k: 200, sortOrder: 0, features: ["5,000 credits included monthly", "1 messaging channel", "Weekly self-review", "OpenClaw engine"] },
      { id: "professional", name: "Professional", monthlyPriceCents: 14900, includedCredits: 25000, overageCentsPer1k: 200, sortOrder: 1, features: ["25,000 credits included monthly", "All channels — Telegram to WeChat", "Daily self-review + persistent memory", "Both engines + auto-match", "Priority compute"] },
      { id: "director", name: "Director", monthlyPriceCents: 39900, includedCredits: 100000, overageCentsPer1k: 200, sortOrder: 2, features: ["100,000 credits included monthly", "Dedicated VM resources", "OPC mode — one agent, many hats", "Audit log & approval workflows", "White-glove onboarding"] },
    ])
    .onConflictDoNothing();

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
    minPlan: roleMinPlan(r.id),
    sortOrder: i,
  }));
  await db.insert(s.agentRoles).values(roleRows).onConflictDoNothing();

  console.log("→ rebuilding demo workspace…");
  // Remove any prior demo data. Delete the workspace first (cascades agents,
  // channels, subscriptions, invoices, usage) so agents.created_by_id no longer
  // references the user, then delete the user (cascades its sessions).
  const prior = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(eq(s.users.email, DEMO_EMAIL));
  if (prior[0]) {
    await db.delete(s.workspaces).where(eq(s.workspaces.ownerId, prior[0].id));
    await db.delete(s.users).where(eq(s.users.id, prior[0].id));
  }

  const [user] = await db
    .insert(s.users)
    .values({
      email: DEMO_EMAIL,
      passwordHash: hashPassword(DEMO_PASSWORD),
      name: "Wei Zhang",
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
  await db.insert(s.invoices).values(
    invoiceData.map((inv, i) => ({
      workspaceId: ws.id,
      number: `INV-2026-${100 + i}`,
      amountCents: centsFromDollars(inv.amt),
      currency: "usd",
      status: "paid" as const,
      provider: "stripe" as const,
      issuedAt: new Date(inv.d),
      paidAt: new Date(inv.d),
    })),
  );

  console.log("✓ seed complete");
  console.log(`  demo login → ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ seed failed:", err);
    process.exit(1);
  });
