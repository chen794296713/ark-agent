import "server-only";

/**
 * Alipay — the China (CNY) provider, reached through the GoHire payment gateway.
 *
 * ArkAgent never speaks to Alipay directly. We POST an order to the gateway, it
 * returns a hosted `pay_url`, and the user pays there (scanning the QR on the
 * page or completing in the Alipay app). The gateway then calls our `notify_url`
 * when the trade status changes, which is what actually grants the seat.
 *
 * Alipay has no recurring-payment primitive here, so a CN seat is a one-off
 * payment that opens a fixed period (`ALIPAY_PERIOD_DAYS`); renewal is a fresh
 * order. That asymmetry with Stripe is deliberate and lives in
 * `subscriptions.provider`.
 *
 * SECURITY: the gateway does not sign its notifies, so anyone who learns an
 * `out_trade_no` could otherwise POST a forged `TRADE_SUCCESS`. We therefore mint
 * the notify URL with a secret token query parameter (`ALIPAY_CALLBACK_SECRET`)
 * and reject callbacks that do not present it.
 */
import { timingSafeEqual } from "node:crypto";
import { absoluteUrl, alipayConfig } from "./config";
import { toYuanString } from "@/lib/pricing";
import type { PaymentOrder, User } from "@/lib/db/schema";

/** Trade states the gateway reports. */
export type AlipayTradeStatus = "WAIT_BUYER_PAY" | "TRADE_SUCCESS" | "TRADE_CLOSED";

interface GatewayResponse {
  code: number;
  data?: { pay_url?: string; trade_status?: string };
  message?: string | null;
}

export interface AlipayCreateInput {
  order: PaymentOrder;
  user: User;
  /** Order title shown in the Alipay app, e.g. "ArkAgent 专业版 · 月付". */
  subject: string;
  /** Where the browser lands after paying. */
  returnUrl: string;
  /** Descriptive package metadata the gateway records alongside the order. */
  packageInfo?: Record<string, unknown>;
}

/**
 * The notify URL handed to the gateway, carrying the shared secret so the
 * callback route can prove the request came from a URL only we ever published.
 */
export function alipayNotifyUrl(): string {
  const { callbackSecret } = alipayConfig();
  const base = "/api/payments/alipay/callback";
  return absoluteUrl(callbackSecret ? `${base}?token=${encodeURIComponent(callbackSecret)}` : base);
}

/**
 * Constant-time check of the token a notify presents. When no secret is
 * configured the check cannot be enforced — that is a misconfiguration, so we
 * fail closed in production and allow it only in development.
 */
export function verifyAlipayCallbackToken(provided: string | null): boolean {
  const { callbackSecret } = alipayConfig();
  // No secret means no way to authenticate, so nothing is accepted. There is no
  // development escape hatch: without a secret the provider never reaches `live`
  // (see alipayConfig), so no real notify can be pending — and a hatch here
  // would be one NODE_ENV mistake away from an open fulfilment endpoint.
  if (!callbackSecret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(callbackSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Create an Alipay order at the gateway and return its hosted payment URL.
 *
 * `total_amount` is a decimal **yuan** number, not minor units — the order is
 * stored in 分 and converted here, at the single point where it leaves the app.
 */
export async function createAlipayOrder(
  input: AlipayCreateInput,
): Promise<{ payUrl: string; tradeStatus: AlipayTradeStatus }> {
  const { apiUrl, platform, mode } = alipayConfig();
  if (mode !== "live") throw new Error("Alipay is not configured");

  const { order, user, subject, returnUrl, packageInfo } = input;
  const body = {
    out_trade_no: order.outTradeNo,
    total_amount: Number(toYuanString(order.amountMinor)),
    subject,
    pay_channel: "alipay",
    user_name: user.name,
    user_email: user.email,
    user_id: user.id,
    platform,
    package_data: {
      package_id: order.planId,
      package_name: `${order.planId}_${order.cycle}`,
      package_type: order.cycle === "annual" ? "2" : "1",
      package_price: toYuanString(order.amountMinor),
      package_info: JSON.stringify({
        plan: order.planId,
        cycle: order.cycle,
        workspaceId: order.workspaceId,
        ...packageInfo,
      }),
    },
    notify_url: alipayNotifyUrl(),
    return_url: returnUrl,
  };

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    // The gateway is an external dependency on the critical path; do not let a
    // hung connection hold a serverless invocation open to its full timeout.
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Alipay gateway returned HTTP ${res.status}`);
  }
  // An intermediate proxy can answer 200 with an HTML error page; parsing that
  // as JSON throws a SyntaxError that surfaces as a misleading generic failure.
  if (!(res.headers.get("content-type") || "").includes("json")) {
    throw new Error("Alipay gateway returned a non-JSON response");
  }
  const payload = (await res.json()) as GatewayResponse;
  if (payload.code !== 0 || !payload.data?.pay_url) {
    throw new Error(payload.message || "Alipay gateway rejected the order");
  }
  return {
    payUrl: payload.data.pay_url,
    tradeStatus: (payload.data.trade_status as AlipayTradeStatus) || "WAIT_BUYER_PAY",
  };
}

/** Narrow an arbitrary string to a known trade status. */
export function isAlipayTradeStatus(x: string | null): x is AlipayTradeStatus {
  return x === "WAIT_BUYER_PAY" || x === "TRADE_SUCCESS" || x === "TRADE_CLOSED";
}

/** Order subject shown inside the Alipay app, per UI language. */
export function alipaySubject(planName: string, cycle: string, lang: string): string {
  const annual = cycle === "annual";
  if (lang === "zht") {
    return `ArkAgent ${planName} · ${annual ? "年付" : "月付"}智能員工席位`;
  }
  if (lang === "ja") {
    return `ArkAgent ${planName} · ${annual ? "年額" : "月額"}エージェント席`;
  }
  if (lang === "en") {
    return `ArkAgent ${planName} — ${annual ? "annual" : "monthly"} agent seat`;
  }
  return `ArkAgent ${planName} · ${annual ? "年付" : "月付"}智能员工席位`;
}
