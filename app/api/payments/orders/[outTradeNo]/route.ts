import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { apiError, json, requireAuth } from "@/lib/api";
import { findOrderByOutTradeNo } from "@/lib/payments/orders";
import { serializeOrder } from "@/lib/payments/serialize";
import { serializeInvoice } from "@/lib/serializers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Poll one payment order. The return page uses this after the provider hands the
 * browser back, because the seat is granted asynchronously by the webhook/notify
 * — the redirect itself proves nothing.
 *
 * Scoped to the caller's workspace, so an order number leaking into a URL or a
 * log cannot be used to read someone else's billing state.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ outTradeNo: string }> },
) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { outTradeNo } = await params;

  const order = await findOrderByOutTradeNo(outTradeNo);
  if (!order || order.workspaceId !== auth.ctx.workspace.id) {
    return apiError("Order not found", 404);
  }

  const [inv] = order.invoiceId
    ? await db.select().from(invoices).where(eq(invoices.id, order.invoiceId)).limit(1)
    : [];

  return json({
    order: serializeOrder(order),
    invoice: inv ? serializeInvoice(inv) : null,
  });
}
