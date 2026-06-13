import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices, plans, subscriptions } from "@/lib/db/schema";
import { requireAuth, parseBody, json, apiError } from "@/lib/api";
import { checkoutSchema } from "@/lib/validation";
import { serializeInvoice } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Simulated checkout: records a subscription + a PAID invoice (Stripe/Alipay). */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const parsed = await parseBody(req, checkoutSchema);
  if (parsed.res) return parsed.res;
  const { planId, cycle, provider, agentId } = parsed.data;

  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) return apiError("Unknown plan", 400);

  const monthly = plan.monthlyPriceCents;
  const amountCents = cycle === "annual" ? Math.round(monthly * 12 * 0.8) : monthly;
  const now = new Date();
  const periodEnd = new Date(now.getTime() + (cycle === "annual" ? 365 : 30) * 86400_000);

  const [sub] = await db
    .insert(subscriptions)
    .values({
      workspaceId: auth.ctx.workspace.id,
      agentId: agentId ?? null,
      planId,
      cycle,
      status: "active",
      currentPeriodEnd: periodEnd,
    })
    .returning();

  const [inv] = await db
    .insert(invoices)
    .values({
      workspaceId: auth.ctx.workspace.id,
      number: `INV-${now.getFullYear()}-${Math.floor(now.getTime() / 1000)
        .toString()
        .slice(-6)}`,
      amountCents,
      currency: provider === "alipay" ? "cny" : "usd",
      status: "paid",
      provider,
      periodStart: now,
      periodEnd,
      issuedAt: now,
      paidAt: now,
    })
    .returning();

  return json({ subscriptionId: sub.id, invoice: serializeInvoice(inv) }, 201);
}
