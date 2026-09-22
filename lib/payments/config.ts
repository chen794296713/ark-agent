import "server-only";

/**
 * Payment provider configuration, read from the environment.
 *
 * Both providers degrade to a built-in **mock** when their credentials are
 * absent, mirroring `AGENT_MANAGER_MODE`: the demo and the test suite run the
 * whole checkout → confirmation → invoice flow with no external account, and
 * the same code path goes live the moment real keys are present.
 */

/**
 * `mock` fulfils inline with no provider account — right for the demo and for
 * tests, catastrophic in production, where it would hand out paid seats for
 * free to anyone who can register. So a provider that is not properly
 * configured resolves to `unconfigured` (checkout refuses with 503) rather than
 * silently falling back to `mock`; reaching `mock` in production requires
 * setting PAYMENTS_MODE=mock explicitly, which no real deployment would do.
 */
export type PaymentsMode = "mock" | "live" | "unconfigured";

const isProduction = () => process.env.NODE_ENV === "production";

/** The mode a provider gets when its credentials are absent. */
function fallbackMode(explicit: string | undefined): PaymentsMode {
  if (explicit === "mock") return "mock";
  return isProduction() ? "unconfigured" : "mock";
}

// The origin helpers moved to lib/app-url.ts once OAuth needed them too.
// Re-exported here so every existing `from "./config"` import keeps working.
export { appUrl, absoluteUrl } from "@/lib/app-url";

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

export interface StripeConfig {
  mode: PaymentsMode;
  secretKey: string | null;
  webhookSecret: string | null;
  /** Recurring Price ids, one per tier per cycle. Required for `subscription` mode. */
  priceIds: Record<string, string | undefined>;
  /**
   * Explicit payment methods. `null` (the default) means we send NOTHING and let
   * Stripe's Dashboard-managed automatic payment methods decide — listing them in
   * code opts out of that and forces a deploy every time a method is added.
   */
  paymentMethodTypes: string[] | null;
  /** Pinned API version, so an SDK bump cannot silently change behaviour. */
  apiVersion: string;
}

export function stripeConfig(): StripeConfig {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() || null;
  const forced = process.env.PAYMENTS_MODE?.trim().toLowerCase();
  const mode: PaymentsMode =
    forced === "mock"
      ? "mock"
      : secretKey
        ? "live"
        : // PAYMENTS_MODE=live without a key is a misconfiguration, not a licence
          // to charge nothing.
          fallbackMode(forced);
  return {
    mode,
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || null,
    priceIds: {
      associate_monthly: process.env.STRIPE_PRICE_ASSOCIATE_MONTHLY,
      associate_annual: process.env.STRIPE_PRICE_ASSOCIATE_ANNUAL,
      professional_monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
      professional_annual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL,
      director_monthly: process.env.STRIPE_PRICE_DIRECTOR_MONTHLY,
      director_annual: process.env.STRIPE_PRICE_DIRECTOR_ANNUAL,
    },
    paymentMethodTypes: parseMethodTypes(process.env.STRIPE_PAYMENT_METHOD_TYPES),
    apiVersion: process.env.STRIPE_API_VERSION?.trim() || DEFAULT_STRIPE_API_VERSION,
  };
}

/**
 * The API version this integration was written and tested against. Stripe moved
 * `current_period_end` onto subscription items and `Invoice.subscription` under
 * `invoice.parent` in this generation; the webhook handler reads both shapes.
 */
export const DEFAULT_STRIPE_API_VERSION = "2026-08-26.dahlia";

function parseMethodTypes(raw: string | undefined): string[] | null {
  const list = (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

/** Stripe Price id for a tier + cycle, or null when it has not been configured. */
export function stripePriceId(tier: string, cycle: string): string | null {
  return stripeConfig().priceIds[`${tier}_${cycle}`]?.trim() || null;
}

/** Free-trial length in days; `0` disables trials. */
export function stripeTrialDays(): number {
  const n = Number(process.env.STRIPE_TRIAL_DAYS ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// ---------------------------------------------------------------------------
// Alipay (via the GoHire payment gateway)
// ---------------------------------------------------------------------------

export interface AlipayConfig {
  mode: PaymentsMode;
  /** Gateway endpoint that creates an Alipay order and returns a `pay_url`. */
  apiUrl: string;
  /** Merchant/platform identifier the gateway routes on. */
  platform: string;
  /**
   * Shared secret for `verifyAlipayCallback`. The gateway does not sign its
   * notifies, so we additionally require this value as a query parameter on the
   * notify URL — a bearer token in the URL we handed the gateway ourselves.
   * Without it the callback endpoint would accept forged fulfilment.
   */
  callbackSecret: string | null;
}

export function alipayConfig(): AlipayConfig {
  const platform = process.env.ALIPAY_PLATFORM?.trim() || "gohire";
  const apiUrl =
    process.env.ALIPAY_API_URL?.trim() || "https://worker.gohire.top/payment/payment/create";
  const enabled = process.env.ALIPAY_ENABLED?.trim().toLowerCase();
  const forced = process.env.PAYMENTS_MODE?.trim().toLowerCase();
  const callbackSecret = process.env.ALIPAY_CALLBACK_SECRET?.trim() || null;
  const wantsLive = enabled === "true" || enabled === "1";
  const mode: PaymentsMode =
    forced === "mock"
      ? "mock"
      : // Live without a callback secret is worse than being switched off: the
        // gateway would take real money and every notify would be rejected as
        // unauthenticated, so the customer pays and never receives a seat. Refuse
        // to start such an order at all.
        wantsLive && callbackSecret
        ? "live"
        : fallbackMode(forced);
  if (wantsLive && !callbackSecret) {
    console.error(
      "[payments] ALIPAY_ENABLED is set but ALIPAY_CALLBACK_SECRET is missing — Alipay is disabled, because its notify callback could never be authenticated",
    );
  }
  return { mode, apiUrl, platform, callbackSecret };
}

/** How long an Alipay-paid seat stays active before it must be re-paid. */
export const ALIPAY_PERIOD_DAYS = 30;
