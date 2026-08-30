import "server-only";

/**
 * Payment order lifecycle — provider-agnostic.
 *
 * A checkout is three steps, and only the middle one leaves our control:
 *
 *   1. `createOrder`  writes a `pending` row BEFORE the browser is redirected,
 *                     so an asynchronous confirmation always has somewhere to land.
 *   2. the user pays at Stripe / Alipay.
 *   3. `fulfilOrder`  is driven by the provider's webhook or notify callback and
 *                     creates the subscription + invoice — exactly once.
 *
 * Step 3 is the part that must never double-fire: providers retry webhooks, and
 * Alipay's gateway will happily deliver the same `TRADE_SUCCESS` more than once.
 * The guard is a conditional `UPDATE … WHERE provider = $1 AND status is claimable`
 * inside a transaction: Postgres row-locks the order, so of N concurrent
 * deliveries exactly one gets a row back and does the work; the rest see zero
 * rows and get a `blockedBy` reason back instead.
 *
 * `payment_events` is an audit trail, NOT that guard — it is written after the
 * claim succeeds. See the comment on `fulfilOrder` for why the ordering matters
 * in both directions.
 */
import { and, eq, gt, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import {
  invoices,
  paymentEvents,
  paymentOrders,
  subscriptions,
  type PaymentOrder,
} from "@/lib/db/schema";
import {
  cycleDays,
  cycleTotal,
  type BillingCycle,
  type Currency,
  type PlanTier,
} from "@/lib/pricing";
import { ALIPAY_PERIOD_DAYS } from "./config";

export type Provider = "stripe" | "alipay";

/**
 * How long after a `closed` order was written a success notify may still rescue
 * it. Long enough to cover a provider's retry/out-of-order delivery, short
 * enough that a later close — which for Alipay may mean a refund — cannot be
 * mistaken for one.
 */
const CLOSED_RECLAIM_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Our own order number, carried through both providers: sent to Alipay as
 * `out_trade_no`, and set on Stripe as `client_reference_id`. Both confirmations
 * therefore look the order up by the same key.
 *
 * `ARK-{base36 ms}-{6 random base36}` — sortable by time, collision-free in
 * practice, and short enough for Alipay's 64-char limit.
 */
export function newOutTradeNo(): string {
  const time = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
  return `ARK-${time}-${rand}`;
}

/**
 * Human-facing invoice number, derived from the order number rather than from
 * fresh randomness. `out_trade_no` already carries a unique index, so this is
 * collision-free BY CONSTRUCTION — a random suffix would eventually violate
 * `invoices_number_uniq` and abort a fulfilment transaction *after* the money
 * had been taken, which is the worst possible moment to fail.
 */
function invoiceNumberFor(outTradeNo: string, issuedAt: Date): string {
  return `INV-${issuedAt.getFullYear()}-${outTradeNo.replace(/^ARK-/, "")}`;
}

export interface CreateOrderInput {
  workspaceId: string;
  userId: string;
  provider: Provider;
  planId: PlanTier;
  cycle: BillingCycle;
  currency: Currency;
  agentId?: string | null;
  returnUrl?: string | null;
}

/**
 * Write the `pending` order. The amount is computed server-side from
 * lib/pricing.ts and never taken from the client, so a tampered request cannot
 * buy a Director seat for the price of an Associate one.
 */
export async function createOrder(input: CreateOrderInput): Promise<PaymentOrder> {
  const amountMinor = cycleTotal(input.planId, input.currency, input.cycle);
  const [order] = await db
    .insert(paymentOrders)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      outTradeNo: newOutTradeNo(),
      provider: input.provider,
      status: "pending",
      planId: input.planId,
      cycle: input.cycle,
      agentId: input.agentId ?? null,
      amountMinor,
      currency: input.currency,
      returnUrl: input.returnUrl ?? null,
    })
    .returning();
  return order;
}

export async function findOrderByOutTradeNo(outTradeNo: string): Promise<PaymentOrder | null> {
  const [row] = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.outTradeNo, outTradeNo))
    .limit(1);
  return row ?? null;
}

export async function findOrderByStripeSession(sessionId: string): Promise<PaymentOrder | null> {
  const [row] = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.stripeSessionId, sessionId))
    .limit(1);
  return row ?? null;
}

/** Attach provider identifiers to a pending order (Stripe session id, pay_url, …). */
export async function updateOrder(
  orderId: string,
  patch: Partial<{
    returnUrl: string | null;
    payUrl: string | null;
    stripeSessionId: string | null;
    stripePaymentIntentId: string | null;
    stripeSubscriptionId: string | null;
    stripeCustomerId: string | null;
    alipayTradeStatus: string | null;
    providerPayload: Record<string, unknown> | null;
  }>,
): Promise<PaymentOrder> {
  const [row] = await db
    .update(paymentOrders)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(paymentOrders.id, orderId))
    .returning();
  return row;
}

export interface FulfilResult {
  order: PaymentOrder;
  /** False when another delivery of the same event already did the work. */
  fulfilled: boolean;
  /**
   * Why the claim did not proceed. `duplicate` = this exact provider event was
   * already applied; `already_paid` = benign redelivery; `closed` / `failed` /
   * `refunded` = the order was in a terminal state a success notify should
   * never have arrived for, which needs a human, not a silent 200.
   */
  blockedBy: "duplicate" | "already_paid" | "closed" | "failed" | "refunded" | null;
  invoiceId: string | null;
  subscriptionId: string | null;
}

/** Identity of the provider event driving a fulfilment, recorded as an audit row. */
export interface FulfilEvent {
  provider: Provider;
  eventId: string;
  eventType: string;
}

export interface FulfilPatch {
  /**
   * What the provider actually collected, in minor units. The order's own
   * `amountMinor` is only our ASKING price: a promotion code, a trial, or a
   * Dashboard-managed Stripe Price can all make the charge differ. Writing the
   * ask onto the invoice would assert money was taken that never was.
   */
  amountMinor?: number | null;
  /** Currency the provider settled in. Must match the order's, or we refuse. */
  currency?: string | null;
  stripePaymentIntentId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  alipayTradeStatus?: string | null;
  providerPayload?: Record<string, unknown> | null;
  /** Provider-side id recorded on the invoice for tracing. */
  providerRef?: string | null;
  /** Provider-hosted receipt/invoice page, when the provider gives us one. */
  hostedUrl?: string | null;
  /** Period end reported by the provider; otherwise derived from the cycle. */
  periodEnd?: Date | null;
}

/**
 * Mark an order paid and create its subscription + invoice. Safe to call any
 * number of times for the same order — only the first call does the work.
 *
 * `expectedProvider` is not decorative: without it, whoever can reach one
 * provider's confirmation endpoint could settle the *other* provider's orders.
 * It is pushed into the claim's WHERE clause so no future caller can skip it.
 *
 * Exactly-once is enforced by the CLAIM, not by the event table: only one
 * caller can flip the order out of `pending`. `event` is recorded after that
 * claim succeeds, inside the same transaction, purely as an audit trail.
 *
 * Both properties matter. Committing an event row *before* fulfilling would let
 * a mid-fulfilment crash leave a claim nothing could release — the payment taken,
 * the seat never granted, and the provider's retry discarded as a duplicate. And
 * gating on the event row would mask a genuine problem: a success notify for an
 * order in a terminal state would report `blockedBy` once and then be answered
 * "duplicate" forever, so the retry would look like a success.
 */
export async function fulfilOrder(
  outTradeNo: string,
  expectedProvider: Provider,
  patch: FulfilPatch = {},
  event?: FulfilEvent,
): Promise<FulfilResult | null> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.outTradeNo, outTradeNo))
      .limit(1);
    if (!existing) return null;
    // A notify from one provider must never settle the other's order.
    if (existing.provider !== expectedProvider) return null;

    const now = new Date();


    // Atomic claim: only the delivery that flips pending → paid proceeds.
    const [claimed] = await tx
      .update(paymentOrders)
      .set({
        status: "paid",
        completedAt: now,
        updatedAt: now,
        ...(patch.stripePaymentIntentId !== undefined
          ? { stripePaymentIntentId: patch.stripePaymentIntentId }
          : {}),
        ...(patch.stripeSubscriptionId !== undefined
          ? { stripeSubscriptionId: patch.stripeSubscriptionId }
          : {}),
        ...(patch.stripeCustomerId !== undefined
          ? { stripeCustomerId: patch.stripeCustomerId }
          : {}),
        ...(patch.alipayTradeStatus !== undefined
          ? { alipayTradeStatus: patch.alipayTradeStatus }
          : {}),
        ...(patch.providerPayload !== undefined
          ? { providerPayload: patch.providerPayload }
          : {}),
      })
      // `closed` is reclaimable, but only briefly. Alipay's gateway sends
      // TRADE_CLOSED on timeout and can still deliver a later TRADE_SUCCESS, or
      // deliver the two out of order after a retry — those races resolve within
      // minutes, and money actually moving is authoritative over a timeout.
      //
      // Beyond that window the same transition is ambiguous in a way that is not
      // safe to guess at: Alipay also closes a trade once it has been fully
      // REFUNDED, and the gateway reports both as TRADE_CLOSED with nothing to
      // tell them apart. Auto-reclaiming a days-old closed order would therefore
      // grant a paid seat and write a `paid` invoice for money that was given
      // back. Outside the window the caller gets `blockedBy` and escalates to a
      // human instead.
      .where(
        and(
          eq(paymentOrders.id, existing.id),
          eq(paymentOrders.provider, expectedProvider),
          or(
            eq(paymentOrders.status, "pending"),
            and(
              eq(paymentOrders.status, "closed"),
              gt(paymentOrders.updatedAt, new Date(now.getTime() - CLOSED_RECLAIM_WINDOW_MS)),
            ),
          ),
        ),
      )
      .returning();

    if (!claimed) {
      // Not claimable. `paid` is a benign redelivery; anything else means a
      // success notify arrived for an order we had written off, which the
      // caller must surface rather than acknowledge.
      return {
        order: existing,
        fulfilled: false,
        // `pending` here means a concurrent delivery won the claim between our
        // read and our UPDATE — the same benign case as a redelivery.
        blockedBy:
          existing.status === "paid"
            ? ("already_paid" as const)
            : existing.status === "pending"
              ? ("duplicate" as const)
              : existing.status,
        invoiceId: existing.invoiceId,
        subscriptionId: existing.subscriptionId,
      };
    }
    if (existing.status === "closed") {
      // Rare and worth seeing: the order had been written off and a success
      // notify arrived inside the reclaim window.
      console.warn(
        "[payments] success notify rescued a recently-closed order",
        claimed.outTradeNo,
        claimed.provider,
      );
    }

    // Refuse a currency the order was never priced in rather than recording an
    // invoice whose number means something different from what it says.
    if (patch.currency && patch.currency.toLowerCase() !== claimed.currency.toLowerCase()) {
      throw new Error(
        `Provider settled ${claimed.outTradeNo} in ${patch.currency}, expected ${claimed.currency}`,
      );
    }

    const periodStart = now;
    const periodEnd =
      patch.periodEnd ??
      new Date(
        now.getTime() +
          (claimed.provider === "alipay" && claimed.cycle === "monthly"
            ? ALIPAY_PERIOD_DAYS
            : cycleDays(claimed.cycle)) *
            86_400_000,
      );

    const [sub] = await tx
      .insert(subscriptions)
      .values({
        workspaceId: claimed.workspaceId,
        agentId: claimed.agentId,
        planId: claimed.planId,
        cycle: claimed.cycle,
        // A trial start collects nothing; saying "active" would overstate it and
        // the customer.subscription.updated that corrects it may be minutes away.
        status: patch.amountMinor === 0 ? "trialing" : "active",
        provider: claimed.provider,
        externalId: patch.stripeSubscriptionId ?? claimed.outTradeNo,
        currency: claimed.currency,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      })
      .returning();

    // The amount ACTUALLY collected, falling back to the ask only when the
    // provider told us nothing (the Alipay gateway's notify carries no amount).
    const collected = patch.amountMinor ?? claimed.amountMinor;

    const [inv] = await tx
      .insert(invoices)
      .values({
        workspaceId: claimed.workspaceId,
        number: invoiceNumberFor(claimed.outTradeNo, now),
        amountCents: collected,
        currency: claimed.currency,
        // A zero-value cycle (free trial, 100%-off code) is a real invoice for
        // nothing, not a paid one — `paidAt` stays null so it cannot be counted
        // as revenue.
        status: collected > 0 ? "paid" : "open",
        provider: claimed.provider,
        providerRef: patch.providerRef ?? claimed.outTradeNo,
        hostedUrl: patch.hostedUrl ?? null,
        periodStart,
        periodEnd,
        issuedAt: now,
        paidAt: collected > 0 ? now : null,
      })
      .returning();

    // Audit row, written only once the claim has succeeded and in the same
    // transaction, so it commits with the fulfilment or not at all. It is
    // deliberately NOT the concurrency guard — the conditional claim above
    // already is — because recording the event first would mask a retry: a
    // success notify for an order in a bad state would return 409 once and then
    // be answered "duplicate, 200" on every redelivery, hiding the problem.
    if (event) {
      await tx
        .insert(paymentEvents)
        .values({
          provider: event.provider,
          eventId: event.eventId,
          eventType: event.eventType,
          orderId: claimed.id,
          payload: patch.providerPayload ?? null,
        })
        .onConflictDoNothing({ target: [paymentEvents.provider, paymentEvents.eventId] });
    }

    const [linked] = await tx
      .update(paymentOrders)
      .set({ invoiceId: inv.id, subscriptionId: sub.id, updatedAt: new Date() })
      .where(eq(paymentOrders.id, claimed.id))
      .returning();

    return {
      order: linked,
      fulfilled: true,
      blockedBy: null,
      invoiceId: inv.id,
      subscriptionId: sub.id,
    };
  });
}

/**
 * True when a success notify hit an order that could not accept it for a reason
 * a human should look at. `duplicate` and `already_paid` are normal at-least-once
 * delivery; `closed`/`failed`/`refunded` mean money moved against an order we had
 * written off, and silently answering 200 would bury it.
 */
export function needsAttention(blockedBy: FulfilResult["blockedBy"]): boolean {
  return blockedBy !== null && blockedBy !== "duplicate" && blockedBy !== "already_paid";
}

/** Move a pending order to a terminal non-paid state. Never touches a paid one. */
export async function closeOrder(
  outTradeNo: string,
  status: "failed" | "closed",
  reason?: string,
  payload?: Record<string, unknown>,
): Promise<PaymentOrder | null> {
  const [row] = await db
    .update(paymentOrders)
    .set({
      status,
      failureReason: reason?.slice(0, 480) ?? null,
      ...(payload !== undefined ? { providerPayload: payload } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(paymentOrders.outTradeNo, outTradeNo), eq(paymentOrders.status, "pending")))
    .returning();
  return row ?? null;
}
