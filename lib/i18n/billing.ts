/** Copy for the Dashboard → Billing & usage screen. */
import type { Lang } from "@/lib/types";

export interface BillingDict {
  /** Page heading. */
  heading: string;
  /** Payment-method line, e.g. "VISA ••4242 · OVERAGE $2 / 1K CREDITS".
   *  `card` is the API/static card fragment (brand + masked digits + rate). */
  paymentMeta: (card: string) => string;
  updatePayment: string;
  /** Range toggle labels, keyed by range id. */
  tabs: {
    cycle: string;
    last: string;
    d90: string;
    custom: string;
  };
  loading: string;
  /** Generic load failure (fallback when the API gives no message). */
  loadError: string;
  /** Credits headline suffix, e.g. "/ 30,000 included". */
  included: (total: string) => string;
  annualDiscount: string;
  total: string;
  perAgentUsage: string;
  noSeats: string;
  /** Per-seat credit amount, e.g. "18,420 cr". */
  credits: (n: string) => string;
  invoices: string;
  noInvoices: string;
  /** Invoice status labels, keyed by API status. */
  status: {
    paid: string;
    due: string;
  };
  /** Localised label for an unknown status (echoes the raw value). */
  statusFallback: (raw: string) => string;
  /** Download link for an invoice PDF. */
  pdf: string;
}

const en: BillingDict = {
  heading: "Billing & usage",
  paymentMeta: (card) => card,
  updatePayment: "UPDATE PAYMENT →",
  tabs: {
    cycle: "THIS CYCLE",
    last: "LAST CYCLE",
    d90: "LAST 90 DAYS",
    custom: "CUSTOM",
  },
  loading: "LOADING BILLING…",
  loadError: "Couldn’t load billing.",
  included: (total) => `/ ${total} included`,
  annualDiscount: "Annual discount",
  total: "Total",
  perAgentUsage: "PER-AGENT USAGE",
  noSeats: "NO AGENT SEATS YET",
  credits: (n) => `${n} cr`,
  invoices: "INVOICES",
  noInvoices: "NO INVOICES YET",
  status: {
    paid: "PAID",
    due: "DUE",
  },
  statusFallback: (raw) => raw.toUpperCase(),
  pdf: "PDF ↓",
};

const zh: BillingDict = {
  heading: "账单与用量",
  paymentMeta: (card) => card,
  updatePayment: "更新支付方式 →",
  tabs: {
    cycle: "本周期",
    last: "上一周期",
    d90: "近 90 天",
    custom: "自定义",
  },
  loading: "正在加载账单…",
  loadError: "账单加载失败。",
  included: (total) => `/ 含 ${total}`,
  annualDiscount: "年付优惠",
  total: "合计",
  perAgentUsage: "各智能员工用量",
  noSeats: "暂无智能员工席位",
  credits: (n) => `${n} 积分`,
  invoices: "发票",
  noInvoices: "暂无发票",
  status: {
    paid: "已支付",
    due: "待支付",
  },
  statusFallback: (raw) => raw.toUpperCase(),
  pdf: "PDF ↓",
};

const zht: BillingDict = {
  heading: "帳單與用量",
  paymentMeta: (card) => card,
  updatePayment: "更新付款方式 →",
  tabs: {
    cycle: "本週期",
    last: "上一週期",
    d90: "近 90 天",
    custom: "自訂",
  },
  loading: "正在載入帳單…",
  loadError: "帳單載入失敗。",
  included: (total) => `/ 含 ${total}`,
  annualDiscount: "年付折扣",
  total: "合計",
  perAgentUsage: "各智能員工用量",
  noSeats: "尚無智能員工席位",
  credits: (n) => `${n} 點數`,
  invoices: "發票",
  noInvoices: "尚無發票",
  status: {
    paid: "已付款",
    due: "待付款",
  },
  statusFallback: (raw) => raw.toUpperCase(),
  pdf: "PDF ↓",
};

const ja: BillingDict = {
  heading: "請求と使用状況",
  paymentMeta: (card) => card,
  updatePayment: "支払い方法を更新 →",
  tabs: {
    cycle: "今サイクル",
    last: "前サイクル",
    d90: "過去 90 日",
    custom: "カスタム",
  },
  loading: "請求情報を読み込み中…",
  loadError: "請求情報を読み込めませんでした。",
  included: (total) => `/ ${total} 込み`,
  annualDiscount: "年間割引",
  total: "合計",
  perAgentUsage: "エージェント別使用状況",
  noSeats: "エージェントのシートがまだありません",
  credits: (n) => `${n} クレジット`,
  invoices: "請求書",
  noInvoices: "請求書がまだありません",
  status: {
    paid: "支払い済み",
    due: "未払い",
  },
  statusFallback: (raw) => raw.toUpperCase(),
  pdf: "PDF ↓",
};

export const billing: Record<Lang, BillingDict> = { en, zh, zht, ja };
