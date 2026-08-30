import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { apiError, json } from "@/lib/api";
import { constructStripeEvent, getStripe, stripeIdOf } from "@/lib/payments/stripe";
import { closeOrder, fulfilOrder, needsAttention } from "@/lib/payments/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook — the ONLY place a Stripe payment grants a seat.
 *
 * `await req.text()` gives the exact bytes Stripe signed; parsing the body first
 * would change the whitespace and break verification, which is why nothing here
 * touches `req.json()`.
 *
 * Redelivery is deduplicated by `evt_…` id inside the fulfilment transaction
 * (see fulfilOrder), so at-least-once delivery cannot double-grant, while a
 * failure mid-fulfilment still leaves the retry able to succeed. A signature
 * failure returns 400 on purpose: Stripe then retries, rather than the event
 * being lost.
 *
 * Register these events on the endpoint in the Stripe Dashboard:
 *   checkout.session.completed
 *   checkout.session.async_payment_succeeded
 *   checkout.session.async_payment_failed
 *   checkout.session.expired
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.payment_failed
 *
 * The endpoint's API version must match the SDK's (see DEFAULT_STRIPE_API_VERSION);
 * an older endpoint delivers payload shapes this handler does not expect.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = await constructStripeEvent(raw, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("[stripe-webhook] verification failed:", message);
    return apiError("Invalid signature", 400);
  }

  try {
    switch (event.type) {
      // `completed` fires as soon as the customer finishes the flow, which for a
      // delayed-notification method (bank debit, some wallets) is BEFORE the money
      // settles — `payment_status` is then still `unpaid`, and the real outcome
      // arrives later as async_payment_succeeded / _failed. Since payment methods
      // are chosen in the Stripe Dashboard rather than pinned in code, any of the
      // three can be the event that actually confirms a payment.
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        const outTradeNo = session.client_reference_id;
        if (!outTradeNo) {
          console.warn("[stripe-webhook] session without client_reference_id", session.id);
          break;
        }
        // `no_payment_required` covers a 100%-off coupon and a trial that starts
        // without an immediate charge — both are legitimately fulfillable.
        const paid =
          session.payment_status === "paid" ||
          session.payment_status === "no_payment_required";
        if (!paid) {
          // Not an error: the async_payment_* event will settle it. Leaving the
          // order `pending` is exactly right until then.
          console.info("[stripe-webhook] session completed, payment still pending", session.id);
          break;
        }
        const result = await fulfilOrder(
          outTradeNo,
          "stripe",
          {
            // What Stripe actually collected — not our asking price. A promotion
            // code or a trial makes the two differ, and the invoice must record
            // the charge, not the quote.
            amountMinor: session.amount_total ?? undefined,
            currency: session.currency ?? undefined,
            stripePaymentIntentId: stripeIdOf(session.payment_intent),
            stripeSubscriptionId: stripeIdOf(session.subscription),
            stripeCustomerId: stripeIdOf(session.customer),
            providerRef: stripeIdOf(session.payment_intent) ?? session.id,
            providerPayload: { sessionId: session.id, paymentStatus: session.payment_status },
          },
          { provider: "stripe", eventId: event.id, eventType: event.type },
        );
        if (result && !result.fulfilled && needsAttention(result.blockedBy)) {
          console.error(
            "[stripe-webhook] paid session could not be fulfilled",
            outTradeNo,
            result.blockedBy,
          );
        }
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        if (session.client_reference_id) {
          await closeOrder(
            session.client_reference_id,
            "failed",
            "The payment was declined by the provider",
          );
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        if (session.client_reference_id) {
          await closeOrder(session.client_reference_id, "closed", "Checkout session expired");
        }
        break;
      }

      case "customer.subscription.updated": {
        // Webhook delivery is NOT ordered, so the event payload may be stale by
        // the time we handle it. Re-read the subscription from Stripe and write
        // from that, which makes a late-arriving older event harmless.
        const authoritative = await retrieveSubscription(event.data.object.id);
        await syncSubscription(authoritative ?? event.data.object);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await db
          .update(subscriptions)
          .set({ status: "canceled" })
          .where(eq(subscriptions.externalId, sub.id));
        break;
      }

      case "invoice.payment_failed": {
        // As of API version 2026-08-26.dahlia the subscription is no longer a
        // top-level field on Invoice — it lives under `parent`. The legacy path
        // is kept as a fallback for accounts pinned to an older version.
        const invoice = event.data.object;
        const legacy = (invoice as unknown as { subscription?: string | { id: string } | null })
          .subscription;
        const subId =
          stripeIdOf(invoice.parent?.subscription_details?.subscription) ?? stripeIdOf(legacy);
        if (subId) {
          await db
            .update(subscriptions)
            .set({ status: "past_due" })
            .where(eq(subscriptions.externalId, subId));
        }
        break;
      }

      default:
        // Unhandled event types are acknowledged so Stripe stops retrying them.
        break;
    }
  } catch (err) {
    // 500 asks Stripe to retry. That is safe because the dedup row is written
    // INSIDE fulfilOrder's transaction, so a failure here rolled it back too and
    // the retry is not mistaken for a duplicate. The remaining branches are
    // absolute writes and are naturally idempotent.
    console.error("[stripe-webhook] handler failed", event.type, err);
    return apiError("Handler error", 500);
  }

  return json({ received: true });
}

/** Read the current state of a subscription; null if Stripe cannot be reached. */
async function retrieveSubscription(id: string): Promise<Stripe.Subscription | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    return await stripe.subscriptions.retrieve(id);
  } catch (err) {
    console.warn("[stripe-webhook] could not re-read subscription", id, err);
    return null;
  }
}

/** Mirror Stripe's own view of a subscription onto our row. */
async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const status =
    sub.status === "trialing"
      ? "trialing"
      : sub.status === "active"
        ? "active"
        : sub.status === "past_due" || sub.status === "unpaid"
          ? "past_due"
          : "canceled";
  // Stripe moved `current_period_end` onto the subscription item in recent API
  // versions; read whichever the account's version provides.
  const periodEnd =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end ??
    null;
  await db
    .update(subscriptions)
    .set({
      status,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
    })
    .where(eq(subscriptions.externalId, sub.id));
}
