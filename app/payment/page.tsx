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
import { c, font, r } from "@/lib/theme";
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

/**
 * Ink on a provider's brand fill. Stripe indigo and Alipay blue are fixed in all
 * three themes, so their label cannot follow the palette the way `c.ink` does.
 */
const BRAND_INK = "#fff";

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

  const errorNote = error && (
    <div
      style={{
        marginTop: "14px",
        fontFamily: font.mono,
        fontSize: "12px",
        color: c.red,
        letterSpacing: ".02em",
        lineHeight: 1.5,
      }}
    >
      {error}
    </div>
  );

  return (
    <div data-screen-label="Payment" style={{ minHeight: "100vh" }}>
      {/* Top bar */}
      <div
        style={{
          height: "60px",
          borderBottom: `1px solid ${c.line}`,
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          gap: "24px",
        }}
      >
        <Btn
          onClick={backToBilling}
          hoverStyle={{ color: c.text }}
          style={{
            background: "none",
            border: "none",
            color: c.muted,
            fontSize: "14px",
            cursor: "pointer",
            fontFamily: font.sans,
            padding: 0,
          }}
        >
          {t.backBilling}
        </Btn>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: "12px",
            letterSpacing: ".14em",
            color: c.accent,
          }}
        >
          {t.checkout}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: font.mono,
            fontSize: "11px",
            color: c.faint,
            letterSpacing: ".06em",
          }}
        >
          {t.encrypted}
        </span>
      </div>

      <div
        style={{
          maxWidth: "1080px",
          margin: "0 auto",
          padding: `${r.pagePxWide} ${r.pagePx}`,
          display: "grid",
          gridTemplateColumns: r.checkout,
          gap: r.gapMd,
          alignItems: "start",
        }}
      >
        {/* Order summary */}
        <div>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: "12px",
              letterSpacing: ".14em",
              color: c.accent,
              marginBottom: "14px",
            }}
          >
            {t.eyebrow}
          </div>
          <h2
            style={{
              fontFamily: font.space,
              fontWeight: 700,
              fontSize: "30px",
              letterSpacing: "-.02em",
              margin: "0 0 10px",
            }}
          >
            {t.title}
          </h2>
          <p style={{ color: c.muted, margin: "0 0 24px", fontSize: "14.5px" }}>
            {isCN ? t.subAlipay : t.subStripe}
          </p>
          <div
            style={{
              display: "flex",
              gap: "2px",
              border: `1px solid ${c.border}`,
              padding: "3px",
              width: "fit-content",
              maxWidth: "100%",
              flexWrap: "wrap",
              marginBottom: "20px",
            }}
          >
            {cycleTabs.map((cy, i) => (
              <button
                key={i}
                onClick={cy.fn}
                style={{
                  background: cy.bg,
                  color: cy.c,
                  border: "none",
                  padding: "7px 14px",
                  fontFamily: font.mono,
                  fontSize: "11px",
                  letterSpacing: ".04em",
                  cursor: "pointer",
                }}
              >
                {cy.label}
              </button>
            ))}
          </div>
          <div style={{ border: `1px solid ${c.border}`, background: c.panel }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                padding: "18px 20px",
                borderBottom: `1px solid ${c.line}`,
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  background: c.lime,
                  color: c.ink,
                  display: "grid",
                  placeItems: "center",
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: "16px",
                }}
              >
                N
              </div>
              <div>
                <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: "15.5px" }}>
                  {t.planName}
                </div>
                <div style={{ fontSize: "12.5px", color: c.muted }}>{t.planFor}</div>
              </div>
            </div>
            <div style={{ padding: "6px 0" }}>
              {sumRows.map((sr, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "11px 20px",
                    fontSize: "14px",
                  }}
                >
                  <span style={{ color: c.muted }}>{sr.l}</span>
                  <span style={{ fontFamily: font.mono, fontSize: "13px", color: sr.c }}>
                    {sr.v}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "16px 20px",
                borderTop: `1px solid ${c.line}`,
              }}
            >
              <span style={{ fontFamily: font.space, fontWeight: 700, fontSize: "15px" }}>
                {t.dueToday}
              </span>
              <span style={{ fontFamily: font.space, fontWeight: 700, fontSize: "24px" }}>
                {dueTotal}
              </span>
            </div>
          </div>
          <div
            style={{
              marginTop: "14px",
              fontFamily: font.mono,
              fontSize: "11px",
              color: c.faint,
              letterSpacing: ".04em",
            }}
          >
            {t.footnote}
          </div>
        </div>

        {/* Payment method */}
        <div>
          <div
            style={{
              display: "flex",
              gap: "2px",
              border: `1px solid ${c.border}`,
              padding: "3px",
              width: "fit-content",
              maxWidth: "100%",
              flexWrap: "wrap",
              // The note below only renders until the visitor pins a currency,
              // so the tab strip carries the spacing once it is gone.
              marginBottom: currencyPinned ? "18px" : "8px",
            }}
          >
            {regionTabs.map((rt, i) => (
              <button
                key={i}
                onClick={rt.fn}
                style={{
                  background: rt.bg,
                  color: rt.c,
                  border: "none",
                  padding: "8px 16px",
                  fontFamily: font.mono,
                  fontSize: "11.5px",
                  letterSpacing: ".04em",
                  cursor: "pointer",
                }}
              >
                {rt.label}
              </button>
            ))}
          </div>
          {!currencyPinned && (
            <div style={{ fontSize: "12px", color: c.faint, marginBottom: "18px" }}>
              {t.regionNote}
            </div>
          )}

          {status === "paid" ? (
            /* Mock mode only: the server fulfilled inline because no provider is
               configured. Live payments confirm on /payment/return instead. */
            <div
              style={{
                border: `1px solid ${c.greenBorder}`,
                background: c.greenWash,
                padding: "32px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "50%",
                  background: c.green,
                  color: c.greenInk,
                  display: "grid",
                  placeItems: "center",
                  fontSize: "26px",
                  fontWeight: 700,
                  margin: "0 auto 18px",
                }}
              >
                ✓
              </div>
              <div
                style={{
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: "21px",
                  color: c.green,
                  marginBottom: "6px",
                }}
              >
                {t.paymentSuccessful}
              </div>
              {user && paidRef && (
                <div style={{ fontSize: "14px", color: c.muted }}>
                  {t.chargedReceipt(
                    formatMoney(paidRef.amountMinor, paidRef.currency) +
                      t.perCycle(paidRef.annual),
                    user.email,
                  )}
                </div>
              )}
              {paidRef && (
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: "11.5px",
                    color: c.faint,
                    margin: "14px 0 0",
                  }}
                >
                  {paidRef.invoice ? t.invoiceRef(paidRef.no) : t.orderRef(paidRef.no)}
                </div>
              )}
              <div
                style={{
                  margin: "14px auto 22px",
                  maxWidth: "36ch",
                  fontSize: "12.5px",
                  color: c.amber,
                  lineHeight: 1.55,
                }}
              >
                {t.mockNotice}
              </div>
              <Btn
                onClick={backToBilling}
                hoverStyle={{ opacity: 0.88 }}
                style={{
                  background: c.green,
                  color: c.greenInk,
                  border: "none",
                  padding: "12px 26px",
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                {t.backToBilling}
              </Btn>
            </div>
          ) : isCN ? (
            /* Alipay — hand off to the gateway's own hosted page. */
            <div style={{ border: `1px solid ${c.border}`, background: c.panel }}>
              <div
                style={{
                  background: c.alipay,
                  color: BRAND_INK,
                  padding: "14px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontFamily: font.space, fontWeight: 700, fontSize: "16px" }}>
                  {t.alipayTitle}
                </span>
                <span style={{ fontFamily: font.mono, fontSize: "15px", fontWeight: 500 }}>
                  {amt}
                </span>
              </div>
              <div style={{ padding: "30px 26px", textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "14px",
                    color: c.muted,
                    lineHeight: 1.6,
                    maxWidth: "38ch",
                    margin: "0 auto 22px",
                  }}
                >
                  {t.completeOnPhone}
                </div>
                <Btn
                  onClick={() => void startCheckout()}
                  disabled={busy}
                  hoverStyle={{ opacity: 0.88 }}
                  style={{
                    width: "100%",
                    background: c.alipay,
                    color: BRAND_INK,
                    border: "none",
                    padding: "15px",
                    fontFamily: font.space,
                    fontWeight: 700,
                    fontSize: "15.5px",
                    cursor: busy ? "default" : "pointer",
                    opacity: busy ? 0.75 : 1,
                  }}
                >
                  {busy ? t.redirectingAlipay : t.openAlipayApp}
                </Btn>
                {errorNote}
              </div>
              <div
                style={{
                  borderTop: `1px solid ${c.line}`,
                  padding: "12px",
                  textAlign: "center",
                  fontFamily: font.mono,
                  fontSize: "10.5px",
                  color: c.faint,
                  letterSpacing: ".06em",
                }}
              >
                {t.alipaySecured}
              </div>
            </div>
          ) : (
            /* Stripe — hand off to Checkout. No card fields live in this app. */
            <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: "26px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "14px",
                  paddingBottom: "16px",
                  marginBottom: "20px",
                  borderBottom: `1px solid ${c.line}`,
                }}
              >
                <div>
                  <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: "15px" }}>
                    {t.planName}
                  </div>
                  <div style={{ fontSize: "12.5px", color: c.muted }}>{t.dueToday}</div>
                </div>
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: "16px",
                    color: c.text,
                    whiteSpace: "nowrap",
                  }}
                >
                  {dueTotal}
                </span>
              </div>
              <Btn
                onClick={() => void startCheckout()}
                disabled={busy}
                hoverStyle={{ background: c.stripeHover }}
                style={{
                  width: "100%",
                  background: c.stripe,
                  color: BRAND_INK,
                  border: "none",
                  padding: "15px",
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: "15.5px",
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.75 : 1,
                }}
              >
                {busy ? t.redirectingStripe : t.continueToStripe}
              </Btn>
              {errorNote}
              <div
                style={{
                  marginTop: "16px",
                  fontSize: "12.5px",
                  color: c.muted,
                  lineHeight: 1.6,
                }}
              >
                {t.stripeWallets}
              </div>
              <div
                style={{
                  marginTop: "18px",
                  textAlign: "center",
                  fontFamily: font.mono,
                  fontSize: "10.5px",
                  color: c.muted,
                  letterSpacing: ".06em",
                }}
              >
                {t.stripeFootnote}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
