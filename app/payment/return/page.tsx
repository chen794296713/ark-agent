"use client";

/**
 * PAYMENT RETURN — where Stripe Checkout and the Alipay gateway send the browser
 * back, as `/payment/return?order=<outTradeNo>` (plus `&cancelled=1` from
 * Stripe's cancel URL).
 *
 * Landing here proves nothing: the seat is granted by the provider's webhook /
 * notify, which may arrive before, with, or after the redirect. So this screen
 * polls the order until its status leaves `pending`, and — crucially — stops
 * after a bounded number of attempts and says "still confirming" rather than
 * spinning forever or claiming a success it cannot see.
 *
 * `useSearchParams` makes the tree below client-rendered, so it lives under a
 * <Suspense> boundary per the Next.js 16 guidance; the fallback renders the same
 * frame and the same waiting state that the first poll shows.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { c, font, r } from "@/lib/theme";
import { useApp } from "@/lib/store";
import { api, ApiError, type InvoiceDTO, type PaymentOrderDTO } from "@/lib/client-api";
import { Btn } from "@/components/ui";
import { formatMoney } from "@/lib/pricing";
import { payment, type PaymentDict } from "@/lib/i18n/payment";

/** ~2s × 30 ≈ one minute of waiting before we admit we do not know yet. */
const POLL_INTERVAL_MS = 2_000;
const MAX_ATTEMPTS = 30;

type Pane = "checking" | "paid" | "pending" | "cancelled" | "failed" | "error";

/**
 * Which pane an order calls for. Stored status wins over the `cancelled=1` hint
 * in the URL — the payer may have completed the payment in another tab — and
 * `exhausted` (the poll budget running out) is only ever reached while the order
 * is still pending.
 */
function paneFor(
  order: PaymentOrderDTO | null,
  cancelled: boolean,
  exhausted: boolean,
): Exclude<Pane, "error"> {
  if (!order) return "checking";
  if (order.status === "paid") return "paid";
  if (order.status === "closed") return "cancelled";
  // `refunded` is not reachable straight out of checkout, but if it ever were,
  // the honest reading is "not paid" rather than "still pending".
  if (order.status === "failed" || order.status === "refunded") return "failed";
  if (cancelled) return "cancelled";
  return exhausted ? "pending" : "checking";
}

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={<ReturnFallback />}>
      <PaymentReturn />
    </Suspense>
  );
}

function ReturnFallback() {
  const { lang } = useApp();
  return (
    <ReturnFrame>
      <Waiting t={payment[lang]} refCode={null} />
    </ReturnFrame>
  );
}

function PaymentReturn() {
  const router = useRouter();
  const params = useSearchParams();
  const { lang, user } = useApp();
  const t = payment[lang];

  const outTradeNo = params.get("order");
  const cancelledParam = params.get("cancelled") === "1";

  const [order, setOrder] = useState<PaymentOrderDTO | null>(null);
  const [invoice, setInvoice] = useState<InvoiceDTO | null>(null);
  // `message` is the server's own (unlocalized) text when there was one; the
  // headline is always localized. Wrapped in an object so the effect below never
  // needs the dictionary — switching language must not restart the polling.
  const [loadError, setLoadError] = useState<{ message: string | null } | null>(null);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    // A return URL without an order number is nothing to poll — that case is
    // decided during render, below.
    if (!outTradeNo) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const res = await api.paymentOrder(outTradeNo);
        if (stopped) return;
        setOrder(res.order);
        setInvoice(res.invoice);
        setLoadError(null); // recovered from an earlier transient failure
        // Settled, abandoned by the payer, or out of patience — stop asking.
        if (res.order.status !== "pending" || cancelledParam) return;
        if (attempts >= MAX_ATTEMPTS) {
          setExhausted(true);
          return;
        }
        timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch (err) {
        if (stopped) return;
        if (err instanceof ApiError && err.status === 401) {
          router.push("/auth");
          return;
        }
        // A dropped request is NOT a dead end. This page is most often opened on
        // a phone handing back from the Alipay app, mid network switch, and the
        // payment it is waiting on may well have already succeeded — giving up
        // on the first transport blip would show a paying customer an error.
        // A 404 is different: that order does not belong to this workspace and
        // no amount of retrying will change it.
        const definitive = err instanceof ApiError && err.status === 404;
        if (!definitive && attempts < MAX_ATTEMPTS) {
          timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
          return;
        }
        setLoadError({ message: err instanceof ApiError ? err.message : null });
      }
    };

    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [outTradeNo, cancelledParam, router]);

  const pane: Pane =
    !outTradeNo || loadError ? "error" : paneFor(order, cancelledParam, exhausted);

  // Before the webhook issues an invoice there is still an order number to quote
  // back at the payer, which is what support will ask for.
  const orderNo = order?.outTradeNo ?? outTradeNo;
  const refCode = invoice ? t.invoiceRef(invoice.number) : orderNo ? t.orderRef(orderNo) : null;

  const total = order
    ? formatMoney(order.amountMinor, order.currency) + t.perCycle(order.cycle === "annual")
    : null;

  const billingBtn = (
    <Btn
      onClick={() => router.push("/dashboard/billing")}
      hoverStyle={{ borderColor: c.borderMute, color: c.text }}
      style={{
        background: "none",
        border: `1px solid ${c.borderStrong}`,
        color: c.muted,
        padding: "12px 26px",
        fontFamily: font.space,
        fontWeight: 700,
        fontSize: "14px",
        cursor: "pointer",
      }}
    >
      {t.backToBilling}
    </Btn>
  );

  const retryBtn = (
    <Btn
      onClick={() => router.push("/payment")}
      hoverStyle={{ background: c.limeHover }}
      style={{
        background: c.lime,
        color: c.ink,
        border: "none",
        padding: "12px 26px",
        fontFamily: font.space,
        fontWeight: 700,
        fontSize: "14px",
        cursor: "pointer",
      }}
    >
      {t.retryPayment}
    </Btn>
  );

  let card: React.ReactNode;
  if (pane === "checking") {
    card = <Waiting t={t} refCode={refCode} />;
  } else if (pane === "paid") {
    card = (
      <StatusCard
        accent={c.green}
        wash={c.greenWash}
        border={c.greenBorder}
        glyph="✓"
        title={t.paymentSuccessful}
        body={user && total ? t.chargedReceipt(total, user.email) : total}
        // CN buyers get a fapiao rather than a card receipt, so point at where
        // it is requested.
        meta={refCode && order?.currency === "cny" ? `${refCode} · ${t.eInvoiceNote}` : refCode}
        actions={
          <Btn
            onClick={() => router.push("/dashboard/billing")}
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
        }
      />
    );
  } else if (pane === "pending") {
    card = (
      <StatusCard
        accent={c.amber}
        wash={c.panel}
        border={c.border}
        glyph="⋯"
        title={t.paymentPending}
        body={t.paymentPendingNote}
        extra={user ? t.receiptWillEmail(user.email) : null}
        meta={refCode}
        actions={billingBtn}
      />
    );
  } else if (pane === "cancelled") {
    card = (
      <StatusCard
        accent={c.muted}
        wash={c.panel}
        border={c.border}
        glyph="✕"
        title={t.paymentCancelled}
        body={t.paymentCancelledNote}
        meta={refCode}
        actions={
          <>
            {retryBtn}
            {billingBtn}
          </>
        }
      />
    );
  } else if (pane === "failed") {
    const reason = order?.failureReason;
    card = (
      <StatusCard
        accent={c.red}
        wash={c.redWash}
        border={c.redBorder}
        glyph="!"
        title={reason ? t.paymentFailedReason(reason) : t.paymentFailed}
        body={total}
        meta={refCode}
        actions={
          <>
            {retryBtn}
            {billingBtn}
          </>
        }
      />
    );
  } else {
    card = (
      <StatusCard
        accent={c.red}
        wash={c.redWash}
        border={c.redBorder}
        glyph="!"
        title={t.orderLookupFailed}
        meta={loadError?.message ?? refCode}
        actions={billingBtn}
      />
    );
  }

  return <ReturnFrame>{card}</ReturnFrame>;
}

/** Top bar + centred column, shared by the Suspense fallback and the real screen. */
function ReturnFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { lang } = useApp();
  const t = payment[lang];

  return (
    <div data-screen-label="Payment return" style={{ minHeight: "100vh" }}>
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
          onClick={() => router.push("/dashboard/billing")}
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
          maxWidth: "620px",
          margin: "0 auto",
          padding: `${r.pagePxWide} ${r.pagePx} 140px`,
        }}
      >
        <div
          style={{
            fontFamily: font.mono,
            fontSize: "12px",
            letterSpacing: ".14em",
            color: c.accent,
            marginBottom: "16px",
          }}
        >
          {t.statusEyebrow}
        </div>
        {children}
      </div>
    </div>
  );
}

/** The polling state — deliberately identical to the Suspense fallback. */
function Waiting({ t, refCode }: { t: PaymentDict; refCode: string | null }) {
  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        background: c.panel,
        padding: "44px 32px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "36px",
          height: "36px",
          border: `3px solid ${c.line}`,
          borderTopColor: c.accent,
          borderRadius: "50%",
          margin: "0 auto 22px",
          animation: "spin 1s linear infinite",
        }}
      />
      <div
        style={{ fontFamily: font.space, fontWeight: 700, fontSize: "19px", marginBottom: "8px" }}
      >
        {t.confirmingPay}
      </div>
      <div
        style={{
          fontSize: "13.5px",
          color: c.muted,
          lineHeight: 1.6,
          maxWidth: "40ch",
          margin: "0 auto",
        }}
      >
        {t.awaitingConfirmationNote}
      </div>
      {refCode && (
        <div
          style={{ marginTop: "18px", fontFamily: font.mono, fontSize: "11.5px", color: c.faint }}
        >
          {refCode}
        </div>
      )}
    </div>
  );
}

function StatusCard({
  accent,
  wash,
  border,
  glyph,
  title,
  body,
  extra,
  meta,
  actions,
}: {
  accent: string;
  wash: string;
  border: string;
  glyph: string;
  title: string;
  body?: string | null;
  extra?: string | null;
  meta?: string | null;
  actions: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px solid ${border}`,
        background: wash,
        padding: "36px 32px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "52px",
          height: "52px",
          borderRadius: "50%",
          border: `2px solid ${accent}`,
          color: accent,
          display: "grid",
          placeItems: "center",
          fontFamily: font.space,
          fontSize: "24px",
          fontWeight: 700,
          margin: "0 auto 20px",
        }}
      >
        {glyph}
      </div>
      <div
        style={{
          fontFamily: font.space,
          fontWeight: 700,
          fontSize: "21px",
          color: accent,
          marginBottom: "8px",
          lineHeight: 1.3,
        }}
      >
        {title}
      </div>
      {body && (
        <div
          style={{
            fontSize: "14px",
            color: c.muted,
            lineHeight: 1.6,
            maxWidth: "42ch",
            margin: "0 auto",
          }}
        >
          {body}
        </div>
      )}
      {extra && <div style={{ fontSize: "13.5px", color: c.muted, marginTop: "8px" }}>{extra}</div>}
      {meta && (
        <div
          style={{
            fontFamily: font.mono,
            fontSize: "11.5px",
            color: c.faint,
            margin: "16px 0 0",
            wordBreak: "break-word",
          }}
        >
          {meta}
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: "10px",
          justifyContent: "center",
          flexWrap: "wrap",
          marginTop: "24px",
        }}
      >
        {actions}
      </div>
    </div>
  );
}
