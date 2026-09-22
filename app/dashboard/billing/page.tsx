"use client";

/**
 * Dashboard → Billing & usage. Pixel-ported from ArkAgent.dc.html (markup lines
 * 880-958, billing datasets 1800-1849). The sidebar/dashboard chrome is supplied
 * by app/dashboard/layout.tsx; this page renders only the billing screen.
 *
 * Data source: api.billing() drives the headline credit numbers, the per-agent
 * usage table and the invoices table. api.billingUsage(range) drives the credit
 * bar-chart and the estimate card from `usage_records` — this used to be
 * getBillDatasets(), which handed EVERY workspace the same invented 18,420
 * credits, fourteen hardcoded bar heights and an estimate for four seats it had
 * never bought.
 *
 * Money splits two ways. Seat prices and the projected-invoice estimate are
 * *quotes*, so they follow the visitor's display currency. Invoices are
 * *records*, so each renders in the currency it was settled in — a CN invoice
 * stays ¥ even while the rest of the screen is showing $.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type BillingDTO, type BillingUsageDTO, type InvoiceDTO } from "@/lib/client-api";
import { ANNUAL_DISCOUNT, formatMoney, isCurrency, overagePer1k } from "@/lib/pricing";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { useApp } from "@/lib/store";
import { billing as billingI18n, type BillingDict } from "@/lib/i18n/billing";
import { BCP47 } from "@/lib/i18n";

const billTabIds = ["cycle", "last", "d90", "custom"] as const;
type BillTabId = (typeof billTabIds)[number];

/** Avatar fallback hue when a seat has no role colour. */
/** Fill for a seat with no role colour. Themed, so it pairs with `c.ink`. */
const SEAT_FALLBACK_HUE = c.lime;

/** Marker colour per provider; unknown providers stay neutral. */
const PROVIDER_HUE: Record<string, string> = {
  stripe: c.stripe,
  alipay: c.alipay,
};

const fmtCredits = (n: number, locale: string) => n.toLocaleString(locale);

/** `YYYY-MM-DD`, `n` days before today, in UTC. */
function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

/** "JUN 1 – JUN 13" for a chart label. */
function fmtSpan(fromIso: string, toIso: string, locale: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const from = new Date(fromIso);
  // The window is half-open, so the last day the user sees is one before `to`.
  const to = new Date(new Date(toIso).getTime() - 86_400_000);
  return `${from.toLocaleDateString(locale, opts)} – ${to.toLocaleDateString(locale, opts)}`;
}

const fmtInvoiceDate = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/**
 * An invoice is a historical record, so it renders in the currency it was
 * actually settled in — never the visitor's display currency. Showing a
 * ¥2,267.20 Alipay invoice as "$2,267.20" would overstate it sevenfold.
 */
function invoiceAmount(inv: InvoiceDTO, t: BillingDict): string {
  return isCurrency(inv.currency)
    ? formatMoney(inv.amountCents, inv.currency)
    : // A currency we do not format yet: show the code rather than guess a symbol.
      `${t.currencyFallback(inv.currency)} ${(inv.amountCents / 100).toFixed(2)}`;
}

function invoiceCurrencyName(inv: InvoiceDTO, t: BillingDict): string {
  return isCurrency(inv.currency)
    ? t.currency[inv.currency]
    : t.currencyFallback(inv.currency);
}

function providerName(provider: string | null, t: BillingDict): string {
  if (provider === "stripe") return t.provider.stripe;
  if (provider === "alipay") return t.provider.alipay;
  return t.providerFallback(provider ?? "");
}

export default function BillingPage() {
  const router = useRouter();
  const { lang, currency } = useApp();
  const t: BillingDict = billingI18n[lang];
  const locale = BCP47[lang];
  const [billRange, setBillRange] = useState<BillTabId>("cycle");
  // Default the custom picker to the last 14 days rather than to two dates from
  // 2026, which is what it used to be pinned to.
  const [billFrom, setBillFrom] = useState(() => isoDaysAgo(13));
  const [billTo, setBillTo] = useState(() => isoDaysAgo(0));

  const [billing, setBilling] = useState<BillingDTO | null>(null);
  // Held together with the request it answered, so "is this stale?" is a
  // comparison rather than a second `loading` flag that has to be flipped
  // synchronously inside the effect (which React 19 rightly rejects).
  const [usageState, setUsageState] = useState<{
    key: string;
    data: BillingUsageDTO | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Runs once on mount; loading starts true and error null, so no synchronous
    // reset is needed here — only the async results below update state.
    let cancelled = false;
    api
      .billing()
      .then((data) => {
        if (!cancelled) setBilling(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : t.loadError);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const billCustom = billRange === "custom";

  // Identifies the request the chart currently wants. Only the custom range
  // depends on the dates; the other three are resolved server-side from the
  // workspace's own cycle.
  const usageKey = billCustom ? `custom:${billFrom}:${billTo}` : billRange;
  const usage = usageState?.key === usageKey ? usageState.data : null;
  const usageLoading = usageState?.key !== usageKey;

  useEffect(() => {
    let cancelled = false;
    api
      .billingUsage(billRange, billCustom ? billFrom : undefined, billCustom ? billTo : undefined)
      // On failure the key is still recorded, so the card settles on its empty
      // state instead of spinning forever. A failed chart must not blank the
      // seats and invoices around it.
      .then((data) => !cancelled && setUsageState({ key: usageKey, data }))
      .catch(() => !cancelled && setUsageState({ key: usageKey, data: null }));
    return () => {
      cancelled = true;
    };
  }, [usageKey, billRange, billCustom, billFrom, billTo]);

  // The API prices seats from plans.monthly_price_cents (USD only), but every
  // plan row carries both ladders — so look the seat's tier back up to follow
  // the display currency.
  const planByTier = new Map((billing?.plans ?? []).map((p) => [p.id as string, p]));
  const seatPriceMinor = (seat: BillingDTO["seats"][number]): number => {
    const plan = planByTier.get(seat.planTier);
    if (!plan) return seat.priceCents;
    return currency === "cny" ? plan.monthlyPriceFen : plan.monthlyPriceCents;
  };

  // Flat across tiers, so any tier reads the same rate.
  const overageTag = formatMoney(overagePer1k("associate", currency), currency, {
    compact: true,
  });

  // Credit headline: the SELECTED RANGE's usage, not the workspace lifetime —
  // the two disagree for every range but "this cycle", and the chart beneath is
  // the range's.
  const creditsUsed = usage?.credits ?? billing?.credits.used ?? 0;
  const creditsIncluded = usage?.included ?? billing?.credits.included ?? 0;
  const usedPct =
    creditsIncluded > 0 ? Math.min(100, Math.round((creditsUsed / creditsIncluded) * 100)) : 0;

  // ---- the estimate, entirely from real rows ------------------------------
  const seats = billing?.seats ?? [];
  // Whole cycles, floored at one: a three-day-old workspace still owes one
  // month of seat fees, and a 90-day range owes three.
  const cyclesBilled = Math.max(1, Math.round(usage?.cycles ?? 1));
  const seatsMinor = seats.reduce((sum, seat) => sum + seatPriceMinor(seat), 0) * cyclesBilled;

  const overCredits = Math.max(0, creditsUsed - creditsIncluded);
  const overMinor = Math.round((overCredits / 1000) * overagePer1k("associate", currency));

  // Only annually-billed seats earn the annual discount. The old code applied
  // it to every workspace unconditionally, which quoted a discount to
  // month-to-month customers who were never going to receive it.
  const annualSeatShare = seats.length ? (usage?.annualSeats ?? 0) / seats.length : 0;
  const discMinor = -Math.round(seatsMinor * annualSeatShare * ANNUAL_DISCOUNT);
  const totalMinor = seatsMinor + overMinor + discMinor;

  // Range-scoped credits per agent. Without this the seat rows report lifetime
  // usage while the chart directly above them reports the selected range, and
  // the two never add up.
  const rangeCreditsByAgent = new Map((usage?.perAgent ?? []).map((a) => [a.id, a.credits]));

  const buckets = usage?.buckets ?? [];
  const peakBucket = buckets.reduce((max, b) => Math.max(max, b.credits), 0);
  const hasUsage = peakBucket > 0;
  const chartSpan = usage ? fmtSpan(usage.from, usage.to, locale) : "";

  return (
    <div data-screen-label="Billing" style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 28,
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <h2
          style={{
            fontFamily: font.space,
            fontWeight: 700,
            fontSize: 26,
            margin: 0,
          }}
        >
          {t.heading}
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: font.mono, fontSize: 12, color: c.faint }}>
            {t.paymentMeta(`VISA ••4242 · ${t.overageRate(overageTag)}`)}
          </span>
          <Btn
            onClick={() => router.push("/payment")}
            hoverStyle={{ borderColor: c.limeBorder, background: c.limeWash }}
            style={{
              background: "none",
              border: `1px solid ${c.border}`,
              color: c.accent,
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: ".04em",
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            {t.updatePayment}
          </Btn>
        </div>
      </div>

      {/* Range tabs */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 2,
            border: `1px solid ${c.border}`,
            padding: 3,
            width: "fit-content",
            borderRadius: r.radiusSm,
          }}
        >
          {billTabIds.map((id: BillTabId) => {
            const on = billRange === id;
            return (
              <button
                key={id}
                onClick={() => setBillRange(id)}
                style={{
                  background: on ? c.lime : "transparent",
                  color: on ? c.ink : c.muted,
                  border: "none",
                  padding: "7px 14px",
                  fontFamily: font.mono,
                  fontSize: 11,
                  letterSpacing: ".04em",
                  cursor: "pointer",
                  borderRadius: r.radiusSm,
                }}
              >
                {t.tabs[id]}
              </button>
            );
          })}
        </div>
        {billCustom && (
          <>
            <input
              type="date"
              value={billFrom}
              onChange={(e) => setBillFrom(e.target.value)}
              style={{
                background: c.panel,
                border: `1px solid ${c.border}`,
                color: c.text,
                padding: "8px 10px",
                fontFamily: font.mono,
                fontSize: 12,
                outline: "none",
              }}
            />
            <span style={{ color: c.faint }}>→</span>
            <input
              type="date"
              value={billTo}
              onChange={(e) => setBillTo(e.target.value)}
              style={{
                background: c.panel,
                border: `1px solid ${c.border}`,
                color: c.text,
                padding: "8px 10px",
                fontFamily: font.mono,
                fontSize: 12,
                outline: "none",
              }}
            />
          </>
        )}
      </div>

      {error && !loading && (
        <div
          style={{
            border: `1px solid ${c.redBorder}`,
            background: c.redWash,
            color: c.red,
            padding: "12px 16px",
            fontFamily: font.mono,
            fontSize: 12.5,
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          style={{
            border: `1px solid ${c.border}`,
            background: c.panel,
            padding: 40,
            fontFamily: font.mono,
            fontSize: 12,
            letterSpacing: ".08em",
            color: c.faint,
            textAlign: "center",
          }}
        >
          {t.loading}
        </div>
      ) : (
        <>
          {/* Top grid: credits + invoice estimate */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: r.billing,
              gap: 20,
              marginBottom: 28,
              alignItems: "stretch",
            }}
          >
            {/* Credits card */}
            <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: 24, borderRadius: r.radiusMd }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 11,
                    letterSpacing: ".1em",
                    color: c.faint,
                  }}
                >
                  {t.creditsIn(chartSpan)}
                </span>
                <span style={{ fontFamily: font.space, fontWeight: 700, fontSize: 22 }}>
                  {fmtCredits(creditsUsed, locale)}{" "}
                  <span style={{ fontSize: 13, color: c.faint, fontWeight: 400 }}>
                    {t.included(fmtCredits(creditsIncluded, locale))}
                  </span>
                </span>
              </div>
              <div style={{ height: 8, background: c.line, marginBottom: 20, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: 8, width: `${usedPct}%`, background: c.lime }} />
              </div>
              {hasUsage ? (
                <>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 90 }}>
                    {buckets.map((b) => (
                      <div
                        key={b.date}
                        title={`${fmtInvoiceDate(`${b.date}T00:00:00.000Z`, locale)} · ${t.credits(fmtCredits(b.credits, locale))}`}
                        style={{
                          flex: 1,
                          background: b.credits > 0 ? c.lime : c.line,
                          // Scaled against the range's own peak, with a 2px
                          // floor so a day with a little usage is still visible
                          // next to a day with a lot.
                          height: b.credits > 0 ? `${Math.max(3, (b.credits / peakBucket) * 100)}%` : 2,
                          minHeight: 2,
                        }}
                      />
                    ))}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontFamily: font.mono,
                      fontSize: 10.5,
                      color: c.faint,
                      marginTop: 8,
                    }}
                  >
                    <span>{fmtInvoiceDate(`${buckets[0].date}T00:00:00.000Z`, locale)}</span>
                    <span>{fmtInvoiceDate(`${buckets[buckets.length - 1].date}T00:00:00.000Z`, locale)}</span>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    height: 90 + 8 + 14,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    textAlign: "center",
                    border: `1px dashed ${c.line}`,
                    borderRadius: r.radiusSm,
                    padding: "0 16px",
                  }}
                >
                  <span style={{ fontSize: 13.5, color: c.text2 }}>
                    {usageLoading ? t.loading : t.noUsage}
                  </span>
                  {!usageLoading && (
                    <span style={{ fontSize: 12, color: c.muted, maxWidth: 380 }}>
                      {t.noUsageHint}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Invoice estimate card */}
            <div
              style={{
                border: `1px solid ${c.border}`,
                background: c.panel,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                borderRadius: r.radiusMd,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 11,
                    letterSpacing: ".1em",
                    color: c.faint,
                  }}
                >
                  {t.estimateLabel[billRange]}
                </span>
                <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.faint }}>
                  {t.billedIn(t.currency[currency])}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 11,
                  fontSize: 14,
                  flex: 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: c.muted }}>{t.seatsLabel(seats.length)}</span>
                  <span style={{ fontFamily: font.mono }}>
                    {formatMoney(seatsMinor, currency)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: c.muted }}>{t.overageLabel(fmtCredits(overCredits, locale))}</span>
                  <span style={{ fontFamily: font.mono }}>
                    {formatMoney(overMinor, currency)}
                  </span>
                </div>
                {/* Only shown when a seat is actually billed annually — a
                    "-$0.00" row implies a discount that is not being applied. */}
                {discMinor !== 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: c.muted }}>{t.annualDiscount}</span>
                    <span style={{ fontFamily: font.mono, color: c.green }}>
                      {formatMoney(discMinor, currency)}
                    </span>
                  </div>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderTop: `1px solid ${c.line}`,
                  paddingTop: 14,
                  marginTop: 14,
                }}
              >
                <span style={{ fontFamily: font.space, fontWeight: 700 }}>{t.total}</span>
                <span style={{ fontFamily: font.space, fontWeight: 700, fontSize: 20 }}>
                  {formatMoney(totalMinor, currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom grid: per-agent usage + invoices */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: r.billing,
              gap: 20,
              alignItems: "start",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  letterSpacing: ".12em",
                  color: c.faint,
                  marginBottom: 12,
                }}
              >
                {t.perAgentUsage}
              </div>
              <div className="ark-scroll" style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 440 }}>
              <div style={{ border: `1px solid ${c.border}`, background: c.panel }}>
                {(billing?.seats.length ?? 0) === 0 ? (
                  <div
                    style={{
                      padding: "28px 20px",
                      fontFamily: font.mono,
                      fontSize: 12,
                      color: c.faint,
                      textAlign: "center",
                    }}
                  >
                    {t.noSeats}
                  </div>
                ) : (
                  billing!.seats.map((seat) => {
                    const hue = seat.hue ?? SEAT_FALLBACK_HUE;
                    // A fixed role hue takes the fixed ink; the themed fallback
                    // fill takes the themed one.
                    const monoInk = seat.hue ? c.onBrand : c.ink;
                    // Per-row usage bar relative to the workspace allowance.
                    const seatCredits = rangeCreditsByAgent.get(seat.id) ?? 0;
                    const w =
                      creditsIncluded > 0
                        ? `${Math.min(100, Math.round((seatCredits / creditsIncluded) * 100))}%`
                        : "0%";
                    return (
                      <div
                        key={seat.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          padding: "14px 20px",
                          borderBottom: `1px solid ${c.lineSoft}`,
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            background: hue,
                            color: monoInk,
                            display: "grid",
                            placeItems: "center",
                            fontFamily: font.space,
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          {seat.mono}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14 }}>
                            {seat.name}{" "}
                            <span style={{ color: c.faint, fontSize: 12.5 }}>
                              · {seat.planName}
                            </span>
                          </div>
                        </div>
                        <div style={{ width: 150 }}>
                          <div style={{ height: 4, background: c.line }}>
                            <div style={{ height: 4, width: w, background: hue }} />
                          </div>
                        </div>
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: 12.5,
                            color: c.text2,
                            width: 120,
                            textAlign: "right",
                          }}
                        >
                          {t.credits(fmtCredits(seatCredits, locale))}
                        </span>
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: 12.5,
                            color: c.muted,
                            width: 64,
                            textAlign: "right",
                          }}
                        >
                          {formatMoney(seatPriceMinor(seat), currency)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
              </div>
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  letterSpacing: ".12em",
                  color: c.faint,
                  marginBottom: 12,
                }}
              >
                {t.invoices}
              </div>
              {/* Wider than the 360 it was: each row now carries a provider chip. */}
              <div className="ark-scroll" style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 420 }}>
              <div style={{ border: `1px solid ${c.border}`, background: c.panel }}>
                {(billing?.invoices.length ?? 0) === 0 ? (
                  <div
                    style={{
                      padding: "28px 20px",
                      fontFamily: font.mono,
                      fontSize: 12,
                      color: c.faint,
                      textAlign: "center",
                    }}
                  >
                    {t.noInvoices}
                  </div>
                ) : (
                  billing!.invoices.map((v) => (
                    <div
                      key={v.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "14px 20px",
                        borderBottom: `1px solid ${c.lineSoft}`,
                      }}
                    >
                      <span style={{ fontSize: 14, color: c.text2 }}>
                        {fmtInvoiceDate(v.issuedAt, locale)}
                      </span>
                      <span
                        title={t.billedIn(invoiceCurrencyName(v, t))}
                        style={{ fontFamily: font.mono, fontSize: 13 }}
                      >
                        {invoiceAmount(v, t)}
                      </span>
                      <span
                        style={{
                          fontFamily: font.mono,
                          fontSize: 11,
                          color: v.status === "paid" ? c.green : c.amber,
                        }}
                      >
                        {v.status === "paid"
                          ? t.status.paid
                          : v.status === "due"
                            ? t.status.due
                            : t.statusFallback(v.status)}
                      </span>
                      {v.provider && (
                        <span
                          title={t.paidVia(providerName(v.provider, t))}
                          style={{
                            fontFamily: font.mono,
                            fontSize: 10,
                            letterSpacing: ".06em",
                            color: PROVIDER_HUE[v.provider] ?? c.faint,
                            border: `1px solid ${PROVIDER_HUE[v.provider] ?? c.border}`,
                            padding: "2px 7px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {providerName(v.provider, t)}
                        </span>
                      )}
                      <span
                        style={{
                          fontFamily: font.mono,
                          fontSize: 11,
                          color: c.faint,
                          cursor: "pointer",
                        }}
                      >
                        {t.pdf}
                      </span>
                    </div>
                  ))
                )}
              </div>
              </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
