"use client";

/**
 * PAYMENT — checkout screen.
 * Ported pixel-true from ArkAgent.dc.html (markup 962-1109, logic 1870-1971).
 * Region defaults from language (zh/zht -> cn), overridable via region tabs.
 * Global -> Stripe card form; CN -> Alipay QR (deterministic 25x25).
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { c, font, r } from "@/lib/theme";
import { useApp } from "@/lib/store";
import { api, ApiError } from "@/lib/client-api";
import { Btn } from "@/components/ui";
import { payment } from "@/lib/i18n/payment";

type Region = "global" | "cn";
type Cycle = "mo" | "yr";
type PayState = "idle" | "processing" | "done";
type AliState = "idle" | "confirm" | "done";

const LIME = c.lime;
const ACCENT = c.accent;

export default function PaymentPage() {
  const router = useRouter();
  const { lang } = useApp();
  const t = payment[lang];

  const defaultRegion: Region = lang === "zh" || lang === "zht" ? "cn" : "global";
  const [payRegion, setPayRegion] = useState<Region | null>(null);
  const region: Region = payRegion ?? defaultRegion;
  const isCN = region === "cn";

  const [payCycle, setPayCycle] = useState<Cycle>("mo");
  const yrPay = payCycle === "yr";

  const [payState, setPayState] = useState<PayState>("idle");
  const [aliState, setAliState] = useState<AliState>("idle");
  const [payError, setPayError] = useState<string | null>(null);
  const [invoiceNo, setInvoiceNo] = useState<string | null>(null);

  // stripe card fields
  const [cardEmail, setCardEmail] = useState("");
  const [cardNum, setCardNum] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardCountry, setCardCountry] = useState(t.countryDefault);

  const payBackBilling = () => router.push("/dashboard/billing");

  const setRegion = (r: Region) => {
    setPayRegion(r);
    setPayState("idle");
    setAliState("idle");
    setPayError(null);
    setInvoiceNo(null);
  };

  const amt = isCN
    ? yrPay
      ? "¥10,253.00"
      : "¥1,068.00"
    : yrPay
    ? "$1,430.40"
    : "$149.00";

  const sumRowsRaw: { l: string; v: string; c?: string }[] = isCN
    ? yrPay
      ? [
          { l: t.seatAnnual, v: "¥12,816.00" },
          { l: t.annualDiscount, v: "−¥2,563.20", c: c.green },
          { l: t.creditsPerMonth, v: t.included },
          { l: t.taxLabel, v: t.taxIncluded },
        ]
      : [
          { l: t.seatMonthly, v: "¥1,068.00" },
          { l: t.creditsPerMonth, v: t.included },
          { l: t.taxLabel, v: t.taxIncluded },
        ]
    : yrPay
    ? [
        { l: t.seatAnnual, v: "$1,788.00" },
        { l: t.annualDiscount, v: "−$357.60", c: c.green },
        { l: t.creditsPerMonth, v: t.included },
        { l: t.taxLabel, v: "$0.00" },
      ]
    : [
        { l: t.seatMonthly, v: "$149.00" },
        { l: t.creditsPerMonth, v: t.included },
        { l: t.taxLabel, v: "$0.00" },
      ];
  const sumRows = sumRowsRaw.map((r) => ({ l: r.l, v: r.v, c: r.c || c.text2 }));

  const regionTabs = (
    [
      { id: "global", label: t.regionGlobal },
      { id: "cn", label: t.regionCN },
    ] as { id: Region; label: string }[]
  ).map((rt) => ({
    label: rt.label,
    bg: region === rt.id ? LIME : "transparent",
    c: region === rt.id ? c.ink : c.muted,
    fn: () => setRegion(rt.id),
  }));

  const cycleTabs = (
    [
      { id: "mo", label: t.cycleMonthly },
      { id: "yr", label: t.cycleAnnual },
    ] as { id: Cycle; label: string }[]
  ).map((cy) => ({
    label: cy.label,
    bg: payCycle === cy.id ? LIME : "transparent",
    c: payCycle === cy.id ? c.ink : c.muted,
    fn: () => setPayCycle(cy.id),
  }));

  // fake but deterministic QR (25x25 with finder patterns)
  const QN = 25;
  const qrCells: React.ReactNode[] = [];
  const inFinder = (r: number, col: number) =>
    (r < 7 && col < 7) || (r < 7 && col >= QN - 7) || (r >= QN - 7 && col < 7);
  for (let r = 0; r < QN; r++) {
    for (let col = 0; col < QN; col++) {
      let black: boolean;
      if (inFinder(r, col)) {
        const rr = r < 7 ? r : r - (QN - 7);
        const cc = col < 7 ? col : col - (QN - 7);
        black =
          rr === 0 ||
          rr === 6 ||
          cc === 0 ||
          cc === 6 ||
          (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4);
      } else {
        black = (r * 13 + col * 31 + r * col * 7) % 9 < 4;
      }
      qrCells.push(
        <div key={r + "-" + col} style={{ background: black ? "#111417" : "#fff" }} />,
      );
    }
  }
  const qrEl = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(25, 1fr)",
        width: "176px",
        height: "176px",
        maxWidth: "100%",
        background: "#fff",
        padding: "10px",
      }}
    >
      {qrCells}
    </div>
  );

  const cardDigits = cardNum.replace(/\s/g, "");
  const cardBrand = cardDigits.startsWith("4")
    ? "VISA"
    : cardDigits.startsWith("5")
    ? "MASTERCARD"
    : cardDigits.startsWith("3")
    ? "AMEX"
    : "CARD";

  const payEyebrow = t.eyebrow;
  const payTitle = t.title;
  const paySub = t.sub;
  const planName = t.planName;
  const planFor = t.planFor;
  const payRegionNote = t.regionNote;
  const sumTotalLabel = t.dueToday;
  const sumTotal = amt + t.perCycle(yrPay);
  const payNote = t.footnote;

  const payBtnLabel = payState === "processing" ? t.processing : t.payAmount(amt);

  // Shared checkout call. On 401 -> /auth. On other ApiError -> surface message.
  const runCheckout = async (provider: "stripe" | "alipay"): Promise<boolean> => {
    setPayError(null);
    try {
      const { invoice } = await api.checkout({
        planId: "professional",
        cycle: yrPay ? "annual" : "monthly",
        provider,
      });
      setInvoiceNo(invoice.number);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/auth");
        return false;
      }
      setPayError(
        err instanceof ApiError ? err.message : t.paymentFailed,
      );
      return false;
    }
  };

  const payNow = () => {
    if (payState !== "idle") return;
    setPayState("processing");
    void runCheckout(region === "cn" ? "alipay" : "stripe").then((ok) => {
      setPayState(ok ? "done" : "idle");
    });
  };
  const payReceiptEmail = cardEmail.trim() || "wei@company.com";

  const simAli = () => {
    if (aliState !== "idle") return;
    setAliState("confirm");
    void runCheckout("alipay").then((ok) => {
      setAliState(ok ? "done" : "idle");
    });
  };

  const inputStyle = (mono: boolean): React.CSSProperties => ({
    width: "100%",
    background: c.bg,
    border: `1px solid ${c.border}`,
    color: c.text,
    padding: "12px 14px",
    fontSize: "14.5px",
    fontFamily: mono ? font.mono : font.sans,
    outline: "none",
  });
  const labelStyle: React.CSSProperties = {
    fontFamily: font.mono,
    fontSize: "10.5px",
    letterSpacing: ".12em",
    color: c.muted,
    marginBottom: "7px",
  };

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
          onClick={payBackBilling}
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
          padding: `${r.pagePxWide} ${r.pagePx} 140px`,
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
            {payEyebrow}
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
            {payTitle}
          </h2>
          <p style={{ color: c.muted, margin: "0 0 24px", fontSize: "14.5px" }}>{paySub}</p>
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
                  {planName}
                </div>
                <div style={{ fontSize: "12.5px", color: c.muted }}>{planFor}</div>
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
                {sumTotalLabel}
              </span>
              <span style={{ fontFamily: font.space, fontWeight: 700, fontSize: "24px" }}>
                {sumTotal}
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
            {payNote}
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
              marginBottom: "8px",
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
          <div style={{ fontSize: "12px", color: c.faint, marginBottom: "18px" }}>
            {payRegionNote}
          </div>

          {/* Stripe (global) */}
          {!isCN &&
            (payState !== "done" ? (
              <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: "26px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: r.split,
                    gap: "10px",
                    marginBottom: "16px",
                  }}
                >
                  <Btn
                    hoverStyle={{ borderColor: c.borderMute }}
                    style={{
                      background: "#000",
                      border: `1px solid ${c.borderStrong}`,
                      color: "#fff",
                      padding: "12px",
                      fontFamily: font.sans,
                      fontWeight: 600,
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    {t.applePay}
                  </Btn>
                  <Btn
                    hoverStyle={{ borderColor: c.borderMute }}
                    style={{
                      background: "#000",
                      border: `1px solid ${c.borderStrong}`,
                      color: "#fff",
                      padding: "12px",
                      fontFamily: font.sans,
                      fontWeight: 600,
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    {t.googlePay}
                  </Btn>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    color: c.faint,
                    fontFamily: font.mono,
                    fontSize: "10.5px",
                    marginBottom: "18px",
                  }}
                >
                  <span style={{ flex: 1, height: "1px", background: c.line }} />
                  {t.orPayWithCard}
                  <span style={{ flex: 1, height: "1px", background: c.line }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div>
                    <div style={labelStyle}>{t.email}</div>
                    <input
                      value={cardEmail}
                      onChange={(e) => setCardEmail(e.target.value)}
                      placeholder="wei@company.com"
                      style={inputStyle(false)}
                    />
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "7px" }}>
                      <span
                        style={{
                          fontFamily: font.mono,
                          fontSize: "10.5px",
                          letterSpacing: ".12em",
                          color: c.muted,
                        }}
                      >
                        {t.cardNumber}
                      </span>
                      <span style={{ fontFamily: font.mono, fontSize: "10.5px", color: c.faint }}>
                        {cardBrand}
                      </span>
                    </div>
                    <input
                      value={cardNum}
                      onChange={(e) => {
                        let v = e.target.value.replace(/\D/g, "").slice(0, 16);
                        v = v.replace(/(.{4})/g, "$1 ").trim();
                        setCardNum(v);
                      }}
                      placeholder="4242 4242 4242 4242"
                      style={inputStyle(true)}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: r.split, gap: "14px" }}>
                    <div>
                      <div style={labelStyle}>{t.expiry}</div>
                      <input
                        value={cardExp}
                        onChange={(e) => {
                          let v = e.target.value.replace(/\D/g, "").slice(0, 4);
                          if (v.length > 2) v = v.slice(0, 2) + " / " + v.slice(2);
                          setCardExp(v);
                        }}
                        placeholder="MM / YY"
                        style={inputStyle(true)}
                      />
                    </div>
                    <div>
                      <div style={labelStyle}>{t.cvc}</div>
                      <input
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="123"
                        style={inputStyle(true)}
                      />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: r.split, gap: "14px" }}>
                    <div>
                      <div style={labelStyle}>{t.nameOnCard}</div>
                      <input
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value)}
                        placeholder="WEI ZHANG"
                        style={inputStyle(false)}
                      />
                    </div>
                    <div>
                      <div style={labelStyle}>{t.country}</div>
                      <input
                        value={cardCountry}
                        onChange={(e) => setCardCountry(e.target.value)}
                        style={inputStyle(false)}
                      />
                    </div>
                  </div>
                  <Btn
                    onClick={payNow}
                    hoverStyle={{ background: c.stripeHover }}
                    style={{
                      background: c.stripe,
                      color: "#fff",
                      border: "none",
                      padding: "15px",
                      fontFamily: font.space,
                      fontWeight: 700,
                      fontSize: "15.5px",
                      cursor: "pointer",
                      marginTop: "4px",
                    }}
                  >
                    {payBtnLabel}
                  </Btn>
                  {payError && (
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: "12px",
                        color: c.red,
                        letterSpacing: ".02em",
                        lineHeight: 1.5,
                      }}
                    >
                      {payError}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    marginTop: "16px",
                    textAlign: "center",
                    fontFamily: font.mono,
                    fontSize: "10.5px",
                    color: c.faint,
                    letterSpacing: ".06em",
                  }}
                >
                  {t.stripeFootnote}
                </div>
              </div>
            ) : (
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
                    color: c.ink,
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
                <div style={{ fontSize: "14px", color: c.muted }}>
                  {t.chargedReceipt(sumTotal, payReceiptEmail)}
                </div>
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: "11.5px",
                    color: c.faint,
                    margin: "14px 0 22px",
                  }}
                >
                  {t.invoiceRef(invoiceNo)} · VISA ••4242
                </div>
                <button
                  onClick={payBackBilling}
                  style={{
                    background: c.green,
                    color: c.ink,
                    border: "none",
                    padding: "12px 26px",
                    fontFamily: font.space,
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  {t.backToBilling}
                </button>
              </div>
            ))}

          {/* Alipay (China) */}
          {isCN && (
            <div style={{ border: `1px solid ${c.border}`, background: c.panel }}>
              <div
                style={{
                  background: c.alipay,
                  color: "#fff",
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
                {aliState === "idle" && (
                  <>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: "18px" }}>
                      {qrEl}
                    </div>
                    <div style={{ fontSize: "15px", color: c.text, marginBottom: "6px" }}>
                      {t.scanToPay}
                    </div>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: "11px",
                        color: c.faint,
                        marginBottom: "22px",
                      }}
                    >
                      {t.qrExpires}
                    </div>
                    <Btn
                      onClick={simAli}
                      hoverStyle={{ background: "#0D1524" }}
                      style={{
                        background: "none",
                        border: "1px solid #1d4f9e",
                        color: c.blue,
                        padding: "10px 20px",
                        fontFamily: font.sans,
                        fontSize: "13.5px",
                        cursor: "pointer",
                      }}
                    >
                      {t.simulatePay}
                    </Btn>
                    {payError && (
                      <div
                        style={{
                          marginTop: "16px",
                          fontFamily: font.mono,
                          fontSize: "12px",
                          color: c.red,
                          letterSpacing: ".02em",
                          lineHeight: 1.5,
                        }}
                      >
                        {payError}
                      </div>
                    )}
                  </>
                )}
                {aliState === "confirm" && (
                  <div style={{ padding: "40px 0" }}>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        border: `3px solid ${c.line}`,
                        borderTopColor: c.alipay,
                        borderRadius: "50%",
                        margin: "0 auto 20px",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    <div style={{ fontSize: "15px", color: c.text, marginBottom: "6px" }}>
                      {t.confirmingPay}
                    </div>
                    <div style={{ fontSize: "13px", color: c.muted }}>{t.completeOnPhone}</div>
                  </div>
                )}
                {aliState === "done" && (
                  <div style={{ padding: "16px 0" }}>
                    <div
                      style={{
                        width: "52px",
                        height: "52px",
                        borderRadius: "50%",
                        background: c.green,
                        color: c.ink,
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
                      {t.alipaySuccess}
                    </div>
                    <div style={{ fontSize: "14px", color: c.muted }}>
                      {t.alipayActivated(amt)}
                    </div>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: "11.5px",
                        color: c.faint,
                        margin: "14px 0 22px",
                      }}
                    >
                      {t.alipayInvoiceRef(invoiceNo)}
                    </div>
                    <button
                      onClick={payBackBilling}
                      style={{
                        background: c.green,
                        color: c.ink,
                        border: "none",
                        padding: "12px 26px",
                        fontFamily: font.space,
                        fontWeight: 700,
                        fontSize: "14px",
                        cursor: "pointer",
                      }}
                    >
                      {t.backToBilling}
                    </button>
                  </div>
                )}
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
          )}
        </div>
      </div>
    </div>
  );
}
