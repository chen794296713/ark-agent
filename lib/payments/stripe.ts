import "server-only";

/**
 * Stripe — the international (USD) provider.
 *
 * Checkout is hosted by Stripe: we create a Checkout Session and hand the
 * browser its URL. Fulfilment is driven by the webhook, never by the browser
 * coming back to the success URL — a user who closes the tab after paying must
 * still get their seat, and a user who forges a success URL must not.
 *
 * The integration works with **no Stripe Products configured**: when a recurring
 * Price id is absent for a tier+cycle we build inline `price_data` from
 * lib/pricing.ts, so the ladder in code stays the source of truth. Configure
 * `STRIPE_PRICE_*` only if you want to manage prices in the Stripe Dashboard.
 */
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces, type PaymentOrder, type Workspace } from "@/lib/db/schema";
import type { User } from "@/lib/db/schema";
import {
  absoluteUrl,
  stripeConfig,
  stripePriceId,
  stripeTrialDays,
} from "./config";
import { updateOrder } from "./orders";

let cached: Stripe | null = null;

/** The Stripe client, or null when running in mock mode / without a key. */
export function getStripe(): Stripe | null {
  const { secretKey, mode } = stripeConfig();
  if (mode !== "live" || !secretKey) return null;
  if (!cached) {
    cached = new Stripe(secretKey, {
      apiVersion: stripeConfig().apiVersion as Stripe.StripeConfig["apiVersion"],
    });
  }
  return cached;
}

/**
 * The workspace's Stripe Customer, created on first use. Reusing one customer
 * keeps a workspace's whole payment history in a single Stripe record instead of
 * scattering it across guest checkouts.
 */
export async function ensureStripeCustomer(
  stripe: Stripe,
  workspace: Workspace,
  user: User,
): Promise<string> {
  if (workspace.stripeCustomerId) return workspace.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email.includes("@") ? user.email : undefined,
    name: workspace.name,
    metadata: { workspaceId: workspace.id, userId: user.id },
  });
  await db
    .update(workspaces)
    .set({ stripeCustomerId: customer.id })
    .where(eq(workspaces.id, workspace.id));
  return customer.id;
}

export interface StripeCheckoutInput {
  order: PaymentOrder;
  workspace: Workspace;
  user: User;
  /** Display name of the plan, e.g. "Professional". */
  planName: string;
  /** Where Stripe returns the browser once the session resolves. */
  successUrl: string;
  cancelUrl: string;
}

/**
 * Create a hosted Checkout Session for a seat subscription and return its URL.
 * `client_reference_id` carries our `outTradeNo` so the webhook can find the
 * order without depending on Stripe metadata ordering.
 */
export async function createStripeCheckout(
  input: StripeCheckoutInput,
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");

  const { order, workspace, user, planName, successUrl, cancelUrl } = input;
  const customerId = await ensureStripeCustomer(stripe, workspace, user);
  const configuredPrice = stripePriceId(order.planId, order.cycle);
  const trialDays = stripeTrialDays();
  const methodTypes = stripeConfig().paymentMethodTypes;

  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = configuredPrice
    ? { price: configuredPrice, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: order.currency,
          unit_amount: order.amountMinor,
          recurring: { interval: order.cycle === "annual" ? "year" : "month" },
          product_data: {
            name: `ArkAgent ${planName} — agent seat`,
            description:
              order.cycle === "annual"
                ? "One AI employee, billed annually (−20%)"
                : "One AI employee, billed monthly",
          },
        },
      };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: order.outTradeNo,
    line_items: [lineItem],
    // Omitted unless explicitly configured, so the methods offered are whatever
    // the Stripe Dashboard has enabled (cards, Link, wallets, regional methods)
    // rather than a list frozen into this file.
    ...(methodTypes
      ? {
          payment_method_types:
            methodTypes as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
        }
      : {}),
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Echoed onto the Subscription so Stripe-initiated renewals can be traced
    // back to the workspace that owns them.
    subscription_data: {
      ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      metadata: {
        workspaceId: order.workspaceId,
        outTradeNo: order.outTradeNo,
        planId: order.planId,
        cycle: order.cycle,
      },
    },
    metadata: {
      workspaceId: order.workspaceId,
      userId: order.userId,
      outTradeNo: order.outTradeNo,
      planId: order.planId,
      cycle: order.cycle,
    },
  });

  if (!session.url) throw new Error("Stripe returned a session with no URL");

  await updateOrder(order.id, {
    stripeSessionId: session.id,
    stripeCustomerId: customerId,
    payUrl: session.url,
  });

  return { url: session.url, sessionId: session.id };
}

/**
 * Verify and parse an inbound webhook. Throws when the signature does not match,
 * which the route turns into a 400 so Stripe retries rather than silently
 * dropping the event.
 */
export async function constructStripeEvent(
  rawBody: string,
  signature: string | null,
): Promise<Stripe.Event> {
  const stripe = getStripe();
  const secret = stripeConfig().webhookSecret;
  if (!stripe) throw new Error("Stripe is not configured");
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  if (!signature) throw new Error("Missing stripe-signature header");
  return stripe.webhooks.constructEventAsync(rawBody, signature, secret);
}

/** Default URLs Stripe returns the browser to. */
export function stripeReturnUrls(outTradeNo: string): {
  successUrl: string;
  cancelUrl: string;
} {
  return {
    successUrl: absoluteUrl(`/payment/return?order=${encodeURIComponent(outTradeNo)}`),
    cancelUrl: absoluteUrl(`/payment/return?order=${encodeURIComponent(outTradeNo)}&cancelled=1`),
  };
}

/** Narrow a Stripe id-or-expanded-object union down to the id string. */
export function stripeIdOf(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
