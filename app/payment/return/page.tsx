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
import { c } from "@/lib/theme";
import { Brand } from "@/components/Brand";
import styles from "../payment.module.css";
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
    <Btn onClick={() => router.push("/dashboard/billing")} className={styles.secondary}>
      {t.backToBilling}
    </Btn>
  );
  const retryBtn = (
    <Btn onClick={() => router.push("/payment")} className={styles.primary}>
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
          <Btn onClick={() => router.push("/dashboard/billing")} className={styles.primary}>
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

/** Shared by the Suspense fallback and every confirmed order state. */
function ReturnFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { lang } = useApp();
  const t = payment[lang];
  return (
    <main data-screen-label="Payment return" className={styles.page}>
      <header className={styles.header}>
        <Brand />
        <Btn onClick={() => router.push("/dashboard/billing")} className={styles.back}>{t.backBilling}</Btn>
      </header>
      <div className={styles.returnContent}>{children}</div>
    </main>
  );
}

/** The polling state is identical in the fallback and the hydrated screen. */
function Waiting({ t, refCode }: { t: PaymentDict; refCode: string | null }) {
  return (
    <section className={styles.status} role="status">
      <div className={styles.spinner} aria-hidden="true" />
      <h1>{t.confirmingPay}</h1>
      <p>{t.awaitingConfirmationNote}</p>
      {refCode && <p className={styles.reference}>{refCode}</p>}
    </section>
  );
}

function StatusCard({ accent, wash, border, glyph, title, body, extra, meta, actions }: {
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
    <section className={styles.status} style={{ borderTopColor: border }} aria-live="polite">
      <div className={styles.statusIcon} style={{ color: accent, background: wash }} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {glyph === "✓" ? <path d="m5 12 4 4L19 6" /> : glyph === "✕" ? <path d="m7 7 10 10M7 17 17 7" /> : glyph === "!" ? <><path d="M12 6v7" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></> : <><circle cx="6" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18" cy="12" r="1" /></>}
        </svg>
      </div>
      <h1>{title}</h1>
      {body && <p>{body}</p>}
      {extra && <p>{extra}</p>}
      {meta && <p className={styles.reference}>{meta}</p>}
      <div className={styles.actions}>{actions}</div>
    </section>
  );
}
