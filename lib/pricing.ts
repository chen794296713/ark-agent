/**
 * ArkAgent pricing — the single source of truth for money.
 *
 * Two markets, two currencies:
 *  - International  → USD, charged with Stripe.
 *  - China (中国大陆) → CNY, charged with Alipay.
 *
 * CNY is a *local price ladder*, not an FX conversion of the USD one. Both are
 * stored as integer minor units (US cents / 人民币分) exactly like the `plans`
 * and `invoices` tables, so nothing in the money path ever touches a float.
 *
 * Every screen that renders an amount goes through `formatMoney` here; every
 * screen that needs a plan price goes through `planPrice`. Nothing hardcodes a
 * currency symbol.
 */
import type { Lang } from "@/lib/types";

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

export const CURRENCIES = ["usd", "cny"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** localStorage key for a visitor's explicit currency choice (overrides language). */
export const CURRENCY_STORAGE_KEY = "ark-currency";

export interface CurrencyMeta {
  code: Currency;
  /** Symbol rendered immediately before the amount. */
  symbol: string;
  /** ISO-4217 code shown next to the symbol in switchers, e.g. "USD". */
  iso: string;
  /** Label for the currency switcher, e.g. "USD $". */
  label: string;
  /** BCP-47 locale used for digit grouping. */
  locale: string;
  /** Market this currency serves. */
  market: "global" | "cn";
  /** Payment provider that settles in this currency. */
  provider: "stripe" | "alipay";
}

export const currencyMeta: Record<Currency, CurrencyMeta> = {
  usd: {
    code: "usd",
    symbol: "$",
    iso: "USD",
    label: "USD $",
    locale: "en-US",
    market: "global",
    provider: "stripe",
  },
  cny: {
    code: "cny",
    symbol: "¥",
    iso: "CNY",
    label: "CNY ¥",
    locale: "zh-CN",
    market: "cn",
    provider: "alipay",
  },
};

/** Narrow an arbitrary string to a supported `Currency`. */
export function isCurrency(x: string): x is Currency {
  return (CURRENCIES as readonly string[]).includes(x);
}

/**
 * Default currency for a UI language. 简体中文 is the China market (¥ / Alipay);
 * English, 繁體中文 and 日本語 are the international market ($ / Stripe).
 * A visitor can always override this with the currency switcher.
 */
export function currencyForLang(lang: Lang): Currency {
  return lang === "zh" ? "cny" : "usd";
}

/** The provider that settles a given currency — Stripe for USD, Alipay for CNY. */
export function providerForCurrency(currency: Currency): "stripe" | "alipay" {
  return currencyMeta[currency].provider;
}

// ---------------------------------------------------------------------------
// The price ladder
// ---------------------------------------------------------------------------

export const PLAN_TIERS = ["associate", "professional", "director"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const BILLING_CYCLES = ["monthly", "annual"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** Annual plans are billed up front at −20%. */
export const ANNUAL_DISCOUNT = 0.2;

export interface TierPricing {
  /** Monthly list price per agent seat, in minor units. */
  monthly: number;
  /** Metered overage per 1,000 credits beyond the included allowance, in minor units. */
  overagePer1k: number;
}

/**
 * Per-seat monthly prices in minor units.
 *   USD — $49 / $149 / $399,           overage $2 per 1,000 credits.
 *   CNY — ¥349 / ¥1,068 / ¥2,868,      overage ¥14 per 1,000 credits.
 */
export const priceLadder: Record<Currency, Record<PlanTier, TierPricing>> = {
  usd: {
    associate: { monthly: 4_900, overagePer1k: 200 },
    professional: { monthly: 14_900, overagePer1k: 200 },
    director: { monthly: 39_900, overagePer1k: 200 },
  },
  cny: {
    associate: { monthly: 34_900, overagePer1k: 1_400 },
    professional: { monthly: 106_800, overagePer1k: 1_400 },
    director: { monthly: 286_800, overagePer1k: 1_400 },
  },
};

/** Monthly list price for a tier in a currency, in minor units. */
export function planPrice(tier: PlanTier, currency: Currency): number {
  return priceLadder[currency][tier].monthly;
}

/** Metered overage rate per 1,000 credits, in minor units. */
export function overagePer1k(tier: PlanTier, currency: Currency): number {
  return priceLadder[currency][tier].overagePer1k;
}

// ---------------------------------------------------------------------------
// Cycle math
// ---------------------------------------------------------------------------

/** Undiscounted 12× monthly, in minor units. */
export function annualListTotal(monthlyMinor: number): number {
  return monthlyMinor * 12;
}

/** The −20% saved on an annual plan, in minor units (a positive number). */
export function annualSavings(monthlyMinor: number): number {
  return Math.round(annualListTotal(monthlyMinor) * ANNUAL_DISCOUNT);
}

/** What an annual plan actually charges up front, in minor units. */
export function annualTotal(monthlyMinor: number): number {
  return annualListTotal(monthlyMinor) - annualSavings(monthlyMinor);
}

/** Amount charged for one billing cycle of a tier, in minor units. */
export function cycleTotal(tier: PlanTier, currency: Currency, cycle: BillingCycle): number {
  const monthly = planPrice(tier, currency);
  return cycle === "annual" ? annualTotal(monthly) : monthly;
}

/** How many days a paid cycle covers — used to set `currentPeriodEnd`. */
export function cycleDays(cycle: BillingCycle): number {
  return cycle === "annual" ? 365 : 30;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export interface FormatMoneyOptions {
  /** Drop the ".00" tail when the amount is whole. Default: false. */
  compact?: boolean;
  /** Prefix the ISO code, e.g. "USD $149.00". Default: false. */
  withIso?: boolean;
}

/**
 * Render minor units as a display string: `formatMoney(143040, "usd")` →
 * `"$1,430.40"`, `formatMoney(1025280, "cny")` → `"¥10,252.80"`.
 */
export function formatMoney(
  minorUnits: number,
  currency: Currency,
  options: FormatMoneyOptions = {},
): string {
  const meta = currencyMeta[currency];
  const negative = minorUnits < 0;
  const abs = Math.abs(minorUnits);
  const whole = abs % 100 === 0;
  const digits = options.compact && whole ? 0 : 2;
  const body = (abs / 100).toLocaleString(meta.locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  // "−" (U+2212) rather than a hyphen: it aligns with the digits in the
  // tabular figures used across the order summary.
  return `${negative ? "−" : ""}${options.withIso ? meta.iso + " " : ""}${meta.symbol}${body}`;
}

/** Whole-currency-unit rendering for the pricing cards: `"$149"` / `"¥1,068"`. */
export function formatPriceTag(minorUnits: number, currency: Currency): string {
  return formatMoney(minorUnits, currency, { compact: true });
}

/**
 * The "from ¥349/mo" line on the landing roster. `minPlan` is the cheapest tier
 * that can run the role.
 */
export function formatFromPrice(tier: PlanTier, currency: Currency): string {
  return formatPriceTag(planPrice(tier, currency), currency);
}

/** ISO-4217 code in the casing Stripe expects on its API (`"usd"`, `"cny"`). */
export function stripeCurrency(currency: Currency): string {
  return currency;
}

/**
 * Alipay's gateway takes a decimal *yuan* string with two places
 * (`106800` 分 → `"1068.00"`), never minor units.
 */
export function toYuanString(fen: number): string {
  return (fen / 100).toFixed(2);
}
