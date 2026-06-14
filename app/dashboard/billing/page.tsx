"use client";

/**
 * Dashboard → Billing & usage. Pixel-ported from ArkAgent.dc.html (markup lines
 * 880-958, billing datasets 1800-1849). The sidebar/dashboard chrome is supplied
 * by app/dashboard/layout.tsx; this page renders only the billing screen.
 *
 * Data source: api.billing() drives the headline credit numbers, the per-agent
 * usage table and the invoices table. The range tabs + the credit bar-chart /
 * estimate card keep their static visual shape from getBillDatasets() (there is
 * no historical-range endpoint), but the live credits headline is overlaid on
 * top of whichever range dataset is selected.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getBillDatasets } from "@/lib/data";
import { api, ApiError, type BillingDTO } from "@/lib/client-api";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { useApp } from "@/lib/store";
import { billing as billingI18n, type BillingDict } from "@/lib/i18n/billing";

const billTabIds = ["cycle", "last", "d90", "custom"] as const;
type BillTabId = (typeof billTabIds)[number];

/** Avatar fallback hue when a seat has no role colour. */
const SEAT_FALLBACK_HUE = c.muted;

const fmtMoney = (cents: number) =>
  "$" +
  (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtCredits = (n: number) => n.toLocaleString("en-US");

const fmtInvoiceDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default function BillingPage() {
  const router = useRouter();
  const { lang } = useApp();
  const t: BillingDict = billingI18n[lang];
  const [billRange, setBillRange] = useState<string>("cycle");
  const [billFrom, setBillFrom] = useState("2026-06-01");
  const [billTo, setBillTo] = useState("2026-06-13");

  const [billing, setBilling] = useState<BillingDTO | null>(null);
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

  // Static chart/estimate shape (bars, x-axis, projected invoice) for the
  // selected range — there is no historical-range API, so the visual stays.
  const datasets = getBillDatasets(billFrom, billTo);
  const bd = datasets[billRange] || datasets.cycle;
  const billCustom = billRange === "custom";

  // Live credit headline overlaid on the chart card.
  const creditsUsed = billing?.credits.used ?? 0;
  const creditsIncluded = billing?.credits.included ?? 0;
  const usedPct =
    creditsIncluded > 0 ? Math.round((creditsUsed / creditsIncluded) * 100) : 0;

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
            {t.paymentMeta("VISA ••4242 · OVERAGE $2 / 1K CREDITS")}
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
            <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: 24 }}>
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
                  {bd.label}
                </span>
                <span style={{ fontFamily: font.space, fontWeight: 700, fontSize: 22 }}>
                  {fmtCredits(creditsUsed)}{" "}
                  <span style={{ fontSize: 13, color: c.faint, fontWeight: 400 }}>
                    {t.included(fmtCredits(creditsIncluded))}
                  </span>
                </span>
              </div>
              <div style={{ height: 8, background: c.line, marginBottom: 20 }}>
                <div style={{ height: 8, width: `${usedPct}%`, background: c.lime }} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 90 }}>
                {bd.bars.map((bar, i) => (
                  <div
                    key={i}
                    style={{ flex: 1, background: bar[1], height: `${bar[0]}%` }}
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
                <span>{bd.x[0]}</span>
                <span>{bd.x[1]}</span>
                <span>{bd.x[2]}</span>
              </div>
            </div>

            {/* Invoice estimate card */}
            <div
              style={{
                border: `1px solid ${c.border}`,
                background: c.panel,
                padding: 24,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  letterSpacing: ".1em",
                  color: c.faint,
                  marginBottom: 14,
                }}
              >
                {bd.inv}
              </span>
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
                  <span style={{ color: c.muted }}>{bd.seatsLabel}</span>
                  <span style={{ fontFamily: font.mono }}>{bd.seats}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: c.muted }}>{bd.overLabel}</span>
                  <span style={{ fontFamily: font.mono }}>{bd.over}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: c.muted }}>{t.annualDiscount}</span>
                  <span style={{ fontFamily: font.mono, color: c.green }}>{bd.disc}</span>
                </div>
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
                  {bd.total}
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
                    // Per-row usage bar relative to the workspace allowance.
                    const w =
                      creditsIncluded > 0
                        ? `${Math.min(100, Math.round((seat.creditsUsed / creditsIncluded) * 100))}%`
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
                            color: c.ink,
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
                          {t.credits(fmtCredits(seat.creditsUsed))}
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
                          {fmtMoney(seat.priceCents)}
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
              <div className="ark-scroll" style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 360 }}>
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
                        {fmtInvoiceDate(v.issuedAt)}
                      </span>
                      <span style={{ fontFamily: font.mono, fontSize: 13 }}>
                        {fmtMoney(v.amountCents)}
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
