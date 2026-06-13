import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents, invoices, plans, subscriptions } from "@/lib/db/schema";
import { requireAuth, json } from "@/lib/api";
import { serializeInvoice, serializePlan } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const ws = auth.ctx.workspace;

  const [agentRows, planRows, invoiceRows, subRows] = await Promise.all([
    db.select().from(agents).where(eq(agents.workspaceId, ws.id)).orderBy(asc(agents.createdAt)),
    db.select().from(plans).orderBy(asc(plans.sortOrder)),
    db.select().from(invoices).where(eq(invoices.workspaceId, ws.id)).orderBy(desc(invoices.issuedAt)),
    db.select().from(subscriptions).where(eq(subscriptions.workspaceId, ws.id)),
  ]);
  const planMap = new Map(planRows.map((p) => [p.id, p]));

  const usage = agentRows
    .filter((a) => a.status !== "terminated")
    .map((a) => ({
      id: a.id,
      name: a.name,
      mono: a.name.slice(0, 1).toUpperCase(),
      hue: a.hue,
      planTier: a.planTier,
      planName: planMap.get(a.planTier)?.name ?? a.planTier,
      creditsUsed: a.creditsUsed,
      priceCents: planMap.get(a.planTier)?.monthlyPriceCents ?? 0,
    }));

  return json({
    credits: {
      included: ws.creditsIncluded,
      used: ws.creditsUsed,
      resetsAt: ws.cycleResetsAt,
    },
    seats: usage,
    seatCount: usage.length,
    invoices: invoiceRows.map(serializeInvoice),
    subscriptions: subRows.length,
    plans: planRows.map(serializePlan),
  });
}
