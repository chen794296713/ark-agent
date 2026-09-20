"use client";

/**
 * PAYMENT — checkout screen.
 *
 * This screen never sees card data. Both markets end in a redirect to a
 * provider-hosted page — Stripe Checkout for USD, the Alipay gateway for CNY —
 * so all we render is the order, the market switch and the handoff button.
 * Collecting a PAN here would drag the app into PCI scope for no benefit.
 *
 * Fulfilment is asynchronous: the seat is granted by the Stripe webhook or the
 * Alipay notify, not by the browser coming back. /payment/return polls for the
 * outcome. The one exception is `mode: "mock"` — no provider credentials are
 * configured, the server fulfils inline, and we say so rather than implying
 * money moved.
 *
 * Region and currency are the same choice: `currency` from the app store is the
 * source of truth and the region tabs write to it, so the landing page and the
 * checkout can never disagree about the price.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { c } from "@/lib/theme";
import { Brand } from "@/components/Brand";
import styles from "./payment.module.css";
import { useApp } from "@/lib/store";
import { api, ApiError } from "@/lib/client-api";
import { Btn } from "@/components/ui";
import {
  annualListTotal,
  annualSavings,
  currencyMeta,
  cycleTotal,
  formatMoney,
  planPrice,
  providerForCurrency,
  type BillingCycle,
  type Currency,
  type PlanTier,
} from "@/lib/pricing";
import { payment } from "@/lib/i18n/payment";

type Region = "global" | "cn";

/** The tier this screen sells — the plan card copy is written for it. */
const TIER: PlanTier = "professional";

export default function PaymentPage() {
  const router = useRouter();
  const { lang, user, currency, setCurrency, currencyPinned } = useApp();
  const t = payment[lang];

  const region: Region = currencyMeta[currency].market;
  const isCN = region === "cn";
  const provider = providerForCurrency(currency);

  const [yearly, setYearly] = useState(false);
  const cycle: BillingCycle = yearly ? "annual" : "monthly";

  // "redirecting" is terminal on the live path — the tab is on its way to the
  // provider, so the button deliberately never falls back to idle.
  const [status, setStatus] = useState<"idle" | "redirecting" | "paid">("idle");
  const [error, setError] = useState<string | null>(null);
  /**
   * Mock-mode receipt, frozen at the moment the server settled the order. It
   * carries its own amount rather than reading `dueTotal`, because the billing
   * cycle tabs stay live in the summary column — flipping to ANNUAL after paying
   * would otherwise rewrite the receipt to an amount nobody was charged.
   */
  const [paidRef, setPaidRef] = useState<{
    invoice: boolean;
    no: string;
    amountMinor: number;
    currency: Currency;
    annual: boolean;
  } | null>(null);

  const backToBilling = () => router.push("/dashboard/billing");

  const selectRegion = (next: Region) => {
    setCurrency(next === "cn" ? "cny" : "usd");
    setStatus("idle");
    setError(null);
    setPaidRef(null);
  };

  // Every figure below comes from the ladder in lib/pricing.ts, in minor units.
  const monthly = planPrice(TIER, currency);
  const amt = formatMoney(cycleTotal(TIER, currency, cycle), currency);
  const dueTotal = amt + t.perCycle(yearly);

  // CNY is a tax-inclusive local price; USD carries no tax at these amounts.
  const taxValue = isCN ? t.taxIncluded : formatMoney(0, currency);
  const sumRows: { l: string; v: string; c: string }[] = yearly
    ? [
        { l: t.seatAnnual, v: formatMoney(annualListTotal(monthly), currency), c: c.text2 },
        { l: t.annualDiscount, v: formatMoney(-annualSavings(monthly), currency), c: c.green },
        { l: t.creditsPerMonth, v: t.included, c: c.text2 },
        { l: t.taxLabel, v: taxValue, c: c.text2 },
      ]
    : [
        { l: t.seatMonthly, v: formatMoney(monthly, currency), c: c.text2 },
        { l: t.creditsPerMonth, v: t.included, c: c.text2 },
        { l: t.taxLabel, v: taxValue, c: c.text2 },
      ];

  const regionTabs = (
    [
      { id: "global", label: t.regionGlobal },
      { id: "cn", label: t.regionCN },
    ] as { id: Region; label: string }[]
  ).map((rt) => ({
    label: rt.label,
    bg: region === rt.id ? c.lime : "transparent",
    c: region === rt.id ? c.ink : c.muted,
    fn: () => selectRegion(rt.id),
  }));

  const cycleTabs = (
    [
      { id: false, label: t.cycleMonthly },
      { id: true, label: t.cycleAnnual },
    ] as { id: boolean; label: string }[]
  ).map((cy) => ({
    label: cy.label,
    bg: yearly === cy.id ? c.lime : "transparent",
    c: yearly === cy.id ? c.ink : c.muted,
    fn: () => setYearly(cy.id),
  }));

  const busy = status === "redirecting";

  /**
   * Open a checkout. The amount is never sent — the server prices the order from
   * the same ladder — so the only thing the client chooses is tier, cycle and
   * which provider (and therefore which currency) settles it.
   */
  const startCheckout = async () => {
    if (status !== "idle") return;
    setStatus("redirecting");
    setError(null);
    try {
      const res = await api.checkout({ planId: TIER, cycle, provider, locale: lang });
      if (res.mode === "live") {
        if (!res.redirectUrl) {
          setError(t.paymentFailed);
          setStatus("idle");
          return;
        }
        // Full navigation, not router.push — the destination is another origin.
        window.location.assign(res.redirectUrl);
        return;
      }
      setPaidRef({
        invoice: !!res.invoice,
        no: res.invoice ? res.invoice.number : res.order.outTradeNo,
        // From the ORDER, not from local state: this is what was settled.
        amountMinor: res.order.amountMinor,
        currency: res.order.currency,
        annual: res.order.cycle === "annual",
      });
      setStatus("paid");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/auth");
        return;
      }
      // Server messages are English-only, so the 5xx cases a real buyer can hit
      // (provider unreachable → 502) get localized copy; a 4xx carries a
      // specific, actionable message worth surfacing verbatim.
      setError(
        err instanceof ApiError
          ? err.status >= 500
            ? t.checkoutUnavailable
            : err.message
          : t.paymentFailed,
      );
      setStatus("idle");
    }
  };

  return (
    <main data-screen-label="Payment" className={styles.page}>
      <header className={styles.header}>
        <Brand />
        <Btn onClick={backToBilling} className={styles.back}>{t.backBilling}</Btn>
      </header>
      <div className={styles.content}>
        <h1 className={styles.title}>{t.title}</h1>
        <div className={styles.checkoutGrid}>
          <section aria-label={t.planName}>
            <div className={styles.tabs}>
              {cycleTabs.map((cy, i) => (
                <button key={i} type="button" onClick={cy.fn} aria-pressed={yearly === (i === 1)}>
                  {cy.label}
                </button>
              ))}
            </div>
            <div className={styles.planHeading}><h2>{t.planName}</h2></div>
            <dl className={styles.lineItems}>
              {sumRows.map((sr, i) => (
                <div key={i}><dt>{sr.l}</dt><dd style={{ color: sr.c }}>{sr.v}</dd></div>
              ))}
            </dl>
            <div className={styles.total}><span>{t.dueToday}</span><strong>{dueTotal}</strong></div>
            <p className={styles.finePrint}>{t.footnote}</p>
          </section>
          <section className={styles.paymentColumn} aria-label={t.checkout}>
            <div className={styles.tabs}>
              {regionTabs.map((rt, i) => (
                <button key={i} type="button" onClick={rt.fn} aria-pressed={isCN === (i === 1)}>
                  {rt.label}
                </button>
              ))}
            </div>
            {!currencyPinned && <p className={styles.regionNote}>{t.regionNote}</p>}
            {status === "paid" ? (
              <div className={styles.receipt} role="status">
                <div className={styles.successMark} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m5 12 4 4L19 6" /></svg>
                </div>
                <h2>{t.paymentSuccessful}</h2>
                {user && paidRef && <p>{t.chargedReceipt(formatMoney(paidRef.amountMinor, paidRef.currency) + t.perCycle(paidRef.annual), user.email)}</p>}
                {paidRef && <p className={styles.reference}>{paidRef.invoice ? t.invoiceRef(paidRef.no) : t.orderRef(paidRef.no)}</p>}
                <p className={styles.mockNote}>{t.mockNotice}</p>
                <Btn onClick={backToBilling} className={styles.primary}>{t.backToBilling}</Btn>
              </div>
            ) : (
              <div className={styles.handoff}>
                <div className={styles.providerHeading}>
                  <h2>{isCN ? t.alipayTitle : "Stripe"}</h2>
                  <span>{amt}</span>
                </div>
                <p>{isCN ? t.completeOnPhone : t.stripeWallets}</p>
                <Btn onClick={() => void startCheckout()} disabled={busy} className={styles.primary}>
                  {isCN ? (busy ? t.redirectingAlipay : t.openAlipayApp) : (busy ? t.redirectingStripe : t.continueToStripe)}
                </Btn>
                {error && <p role="alert" className={styles.error}>{error}</p>}
                <p className={styles.finePrint}>{isCN ? t.alipaySecured : t.stripeFootnote}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
