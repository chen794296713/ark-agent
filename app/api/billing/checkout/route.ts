import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { requireAuth, parseBody, json, apiError } from "@/lib/api";
import { checkoutSchema } from "@/lib/validation";
import { serializeInvoice } from "@/lib/serializers";
import { invoices } from "@/lib/db/schema";
import { providerForCurrency, type Currency } from "@/lib/pricing";
import { alipayConfig, absoluteUrl, stripeConfig } from "@/lib/payments/config";
import { createOrder, fulfilOrder, updateOrder } from "@/lib/payments/orders";
import { createStripeCheckout, stripeReturnUrls } from "@/lib/payments/stripe";
import { alipaySubject, createAlipayOrder } from "@/lib/payments/alipay";
import { serializeOrder } from "@/lib/payments/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start a checkout.
 *
 * Writes a `pending` payment order, then hands the caller a provider-hosted URL
 * to redirect to — Stripe Checkout for USD, Alipay for CNY. The seat is NOT
 * granted here: fulfilment happens when the provider confirms, via
 * `/api/webhooks/stripe` or `/api/payments/alipay/callback`.
 *
 * When a provider has no credentials configured the route runs in **mock** mode
 * and fulfils the order inline, so the demo keeps working end to end without an
 * external account.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const parsed = await parseBody(req, checkoutSchema);
  if (parsed.res) return parsed.res;
  const { planId, cycle, provider, agentId, locale } = parsed.data;

  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) return apiError("Unknown plan", 400);

  const currency: Currency = provider === "alipay" ? "cny" : "usd";
  if (providerForCurrency(currency) !== provider) {
    return apiError("Provider does not settle that currency", 400);
  }

  const order = await createOrder({
    workspaceId: auth.ctx.workspace.id,
    userId: auth.ctx.user.id,
    provider,
    planId,
    cycle,
    currency,
    agentId: agentId ?? null,
  });

  // The return URL embeds the order number, which only exists after the insert.
  const returnUrl = absoluteUrl(`/payment/return?order=${encodeURIComponent(order.outTradeNo)}`);
  await updateOrder(order.id, { returnUrl });

  const mode = provider === "stripe" ? stripeConfig().mode : alipayConfig().mode;

  // ---- Not configured: refuse rather than quietly giving the seat away. ---
  if (mode === "unconfigured") {
    console.error("[checkout] refused: %s is not configured in this environment", provider);
    await updateOrder(order.id, {
      providerPayload: { error: `${provider} is not configured` },
    });
    return apiError("This payment method is not available right now.", 503);
  }

  // ---- Mock mode: no provider account, fulfil inline. Only reachable in a
  // non-production environment, or with an explicit PAYMENTS_MODE=mock. ------
  if (mode === "mock") {
    const result = await fulfilOrder(order.outTradeNo, provider, {
      providerRef: order.outTradeNo,
      alipayTradeStatus: provider === "alipay" ? "TRADE_SUCCESS" : null,
    });
    if (!result) return apiError("Order disappeared during checkout", 500);
    const [inv] = result.invoiceId
      ? await db.select().from(invoices).where(eq(invoices.id, result.invoiceId)).limit(1)
      : [];
    return json(
      {
        mode: "mock" as const,
        order: serializeOrder(result.order),
        redirectUrl: null,
        subscriptionId: result.subscriptionId,
        invoice: inv ? serializeInvoice(inv) : null,
      },
      201,
    );
  }

  // ---- Live: hand back a provider-hosted payment URL. --------------------
  try {
    if (provider === "stripe") {
      const { successUrl, cancelUrl } = stripeReturnUrls(order.outTradeNo);
      const { url } = await createStripeCheckout({
        order,
        workspace: auth.ctx.workspace,
        user: auth.ctx.user,
        planName: plan.name,
        successUrl,
        cancelUrl,
      });
      return json(
        {
          mode: "live" as const,
          order: serializeOrder({ ...order, payUrl: url }),
          redirectUrl: url,
          subscriptionId: null,
          invoice: null,
        },
        201,
      );
    }

    const { payUrl, tradeStatus } = await createAlipayOrder({
      order,
      user: auth.ctx.user,
      subject: alipaySubject(plan.name, cycle, locale ?? auth.ctx.user.locale),
      returnUrl,
    });
    const saved = await updateOrder(order.id, { payUrl, alipayTradeStatus: tradeStatus });
    return json(
      {
        mode: "live" as const,
        order: serializeOrder(saved),
        redirectUrl: payUrl,
        subscriptionId: null,
        invoice: null,
      },
      201,
    );
  } catch (err) {
    // Provider error text can carry price ids, customer ids and account state,
    // so it is logged and stored but never returned to the browser.
    const message = err instanceof Error ? err.message : "Could not start checkout";
    await updateOrder(order.id, { providerPayload: { error: message } });
    console.error("[checkout] provider error", { outTradeNo: order.outTradeNo, message });
    return apiError("Could not reach the payment provider. Please try again.", 502);
  }
}
