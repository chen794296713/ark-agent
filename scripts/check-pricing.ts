/**
 * Pricing self-check — `npm run pricing:check`.
 *
 * lib/pricing.ts is the only place money is defined, so a typo there silently
 * mis-charges every customer in one market. These assertions pin the published
 * ladder, the annual math, the minor-unit invariant (no floats ever reach a
 * charge), the language → currency → provider routing, and the yuan string the
 * Alipay gateway is handed.
 *
 * Needs no database and no provider credentials.
 */
import {
  planPrice, cycleTotal, annualSavings, annualListTotal, formatMoney,
  formatPriceTag, currencyForLang, providerForCurrency, toYuanString,
  overagePer1k, type Currency, type PlanTier,
} from "@/lib/pricing";

let fails = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}  got=${JSON.stringify(got)}${ok ? "" : ` want=${JSON.stringify(want)}`}`);
};

// --- ladder ---------------------------------------------------------------
eq("usd associate", formatPriceTag(planPrice("associate", "usd"), "usd"), "$49");
eq("usd professional", formatPriceTag(planPrice("professional", "usd"), "usd"), "$149");
eq("usd director", formatPriceTag(planPrice("director", "usd"), "usd"), "$399");
eq("cny associate", formatPriceTag(planPrice("associate", "cny"), "cny"), "¥349");
eq("cny professional", formatPriceTag(planPrice("professional", "cny"), "cny"), "¥1,068");
eq("cny director", formatPriceTag(planPrice("director", "cny"), "cny"), "¥2,868");

// --- annual math (must match the payment page's known-good USD figures) ---
eq("usd pro annual list", formatMoney(annualListTotal(planPrice("professional", "usd")), "usd"), "$1,788.00");
eq("usd pro annual save", formatMoney(-annualSavings(planPrice("professional", "usd")), "usd"), "−$357.60");
eq("usd pro annual due", formatMoney(cycleTotal("professional", "usd", "annual"), "usd"), "$1,430.40");
eq("cny pro annual list", formatMoney(annualListTotal(planPrice("professional", "cny")), "cny"), "¥12,816.00");
eq("cny pro annual save", formatMoney(-annualSavings(planPrice("professional", "cny")), "cny"), "−¥2,563.20");
eq("cny pro annual due", formatMoney(cycleTotal("professional", "cny", "annual"), "cny"), "¥10,252.80");

// --- monthly = list price -------------------------------------------------
for (const t of ["associate", "professional", "director"] as PlanTier[]) {
  for (const c of ["usd", "cny"] as Currency[]) {
    eq(`${t}/${c} monthly == list`, cycleTotal(t, c, "monthly"), planPrice(t, c));
  }
}

// --- integer-only invariant ----------------------------------------------
for (const t of ["associate", "professional", "director"] as PlanTier[]) {
  for (const c of ["usd", "cny"] as Currency[]) {
    const a = cycleTotal(t, c, "annual");
    eq(`${t}/${c} annual is integer minor units`, Number.isInteger(a), true);
    eq(`${t}/${c} annual == list - savings`, a, annualListTotal(planPrice(t, c)) - annualSavings(planPrice(t, c)));
  }
}

// --- overage --------------------------------------------------------------
eq("usd overage", formatMoney(overagePer1k("professional", "usd"), "usd"), "$2.00");
eq("cny overage", formatMoney(overagePer1k("professional", "cny"), "cny"), "¥14.00");

// --- language -> currency -> provider ------------------------------------
eq("zh -> cny", currencyForLang("zh"), "cny");
eq("en -> usd", currencyForLang("en"), "usd");
eq("zht -> usd", currencyForLang("zht"), "usd");
eq("ja -> usd", currencyForLang("ja"), "usd");
eq("cny -> alipay", providerForCurrency("cny"), "alipay");
eq("usd -> stripe", providerForCurrency("usd"), "stripe");

// --- yuan string for the Alipay gateway ----------------------------------
eq("fen -> yuan (whole)", toYuanString(106800), "1068.00");
eq("fen -> yuan (frac)", toYuanString(1025280), "10252.80");
eq("fen -> yuan (small)", toYuanString(1), "0.01");

// --- formatting edge cases -----------------------------------------------
eq("zero", formatMoney(0, "usd"), "$0.00");
eq("compact whole", formatMoney(4900, "usd", { compact: true }), "$49");
eq("compact non-whole keeps cents", formatMoney(143040, "usd", { compact: true }), "$1,430.40");
eq("withIso", formatMoney(14900, "usd", { withIso: true }), "USD $149.00");
eq("negative uses minus sign", formatMoney(-35760, "usd"), "−$357.60");

console.log(fails === 0 ? "\nALL PRICING CHECKS PASSED" : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
