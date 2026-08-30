import "server-only";

/**
 * Payment order → API DTO. Provider secrets never appear here: the raw
 * `providerPayload` and the customer/payment-intent ids stay server-side, and
 * the client only sees what the checkout UI actually needs to render.
 */
import type { PaymentOrder } from "@/lib/db/schema";
import type { Currency } from "@/lib/pricing";

export interface PaymentOrderDTO {
  outTradeNo: string;
  provider: "stripe" | "alipay";
  status: "pending" | "paid" | "failed" | "closed" | "refunded";
  planId: "associate" | "professional" | "director";
  cycle: "monthly" | "annual";
  amountMinor: number;
  currency: Currency;
  payUrl: string | null;
  returnUrl: string | null;
  failureReason: string | null;
  completedAt: string | null;
  createdAt: string;
}

export function serializeOrder(o: PaymentOrder): PaymentOrderDTO {
  return {
    outTradeNo: o.outTradeNo,
    provider: o.provider,
    status: o.status,
    planId: o.planId,
    cycle: o.cycle,
    amountMinor: o.amountMinor,
    currency: o.currency as Currency,
    payUrl: o.payUrl,
    returnUrl: o.returnUrl,
    failureReason: o.failureReason,
    completedAt: o.completedAt ? o.completedAt.toISOString() : null,
    createdAt: o.createdAt.toISOString(),
  };
}
