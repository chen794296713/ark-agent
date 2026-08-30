/** Copy for the Dashboard → Billing & usage screen. */
import type { Lang } from "@/lib/types";

export interface BillingDict {
  /** Page heading. */
  heading: string;
  /** Payment-method line, e.g. "VISA ••4242 · OVERAGE $2 / 1K CREDITS".
   *  `card` is the assembled fragment — brand + masked digits + `overageRate`. */
  paymentMeta: (card: string) => string;
  /** Metered rate clause of that line; `rate` arrives pre-formatted ("$2", "¥14"). */
  overageRate: (rate: string) => string;
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
  /** Chart card label, e.g. "CREDITS · JUN 1 – JUN 13". `span` is pre-formatted. */
  creditsIn: (span: string) => string;
  /** Estimate card label per range. */
  estimateLabel: {
    cycle: string;
    last: string;
    d90: string;
    custom: string;
  };
  /** Seat subtotal row, e.g. "4 agent seats". */
  seatsLabel: (n: number) => string;
  /** Metered overage row, e.g. "Overage (1,300 cr)". */
  overageLabel: (credits: string) => string;
  /** Shown in place of the chart when the range has no usage at all. */
  noUsage: string;
  /** Second line of that empty state — says what will appear here. */
  noUsageHint: string;
  annualDiscount: string;
  total: string;
  /** Currency names, keyed by the lowercase ISO code the API sends. */
  currency: {
    usd: string;
    cny: string;
  };
  /** Localised label for an unknown currency (echoes the raw code). */
  currencyFallback: (raw: string) => string;
  /** Which currency an amount is denominated in, e.g. "Billed in CNY". */
  billedIn: (currency: string) => string;
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
  /** Payment providers, keyed to match the payment_provider enum. */
  provider: {
    stripe: string;
    alipay: string;
  };
  /** Localised label for an unmapped (or missing) provider. */
  providerFallback: (raw: string) => string;
  /** Tooltip on an invoice's provider marker, e.g. "Paid via Alipay". */
  paidVia: (provider: string) => string;
  /** Download link for an invoice PDF. */
  pdf: string;
}

const en: BillingDict = {
  heading: "Billing & usage",
  paymentMeta: (card) => card,
  overageRate: (rate) => `OVERAGE ${rate} / 1K CREDITS`,
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
  creditsIn: (span) => `CREDITS · ${span}`,
  estimateLabel: {
    cycle: "ESTIMATED INVOICE · THIS CYCLE",
    last: "LAST CYCLE",
    d90: "LAST 90 DAYS",
    custom: "USAGE IN SELECTED RANGE",
  },
  seatsLabel: (n) => (n === 1 ? "1 agent seat" : `${n} agent seats`),
  overageLabel: (credits) => `Overage (${credits} cr)`,
  noUsage: "No credits used in this range",
  noUsageHint: "Usage appears here as your agents work — every message, task and research run.",
  annualDiscount: "Annual discount",
  total: "Total",
  currency: { usd: "USD", cny: "CNY" },
  currencyFallback: (raw) => raw.toUpperCase(),
  billedIn: (currency) => `Billed in ${currency}`,
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
  provider: { stripe: "Stripe", alipay: "Alipay" },
  providerFallback: (raw) => raw.toUpperCase(),
  paidVia: (provider) => `Paid via ${provider}`,
  pdf: "PDF ↓",
};

const zh: BillingDict = {
  heading: "账单与用量",
  paymentMeta: (card) => card,
  overageRate: (rate) => `超额 ${rate} / 1K 积分`,
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
  creditsIn: (span) => `积分 · ${span}`,
  estimateLabel: {
    cycle: "预估账单 · 本周期",
    last: "上一周期",
    d90: "最近 90 天",
    custom: "所选区间用量",
  },
  seatsLabel: (n) => `${n} 个智能体席位`,
  overageLabel: (credits) => `超出部分（${credits} 积分）`,
  noUsage: "该区间暂无积分消耗",
  noUsageHint: "智能体开始工作后，每条消息、每个任务和每次调研都会记录在这里。",
  annualDiscount: "年付优惠",
  total: "合计",
  currency: { usd: "美元", cny: "人民币" },
  currencyFallback: (raw) => raw.toUpperCase(),
  billedIn: (currency) => `以${currency}结算`,
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
  provider: { stripe: "Stripe", alipay: "支付宝" },
  providerFallback: (raw) => raw.toUpperCase(),
  paidVia: (provider) => `通过${provider}支付`,
  pdf: "PDF ↓",
};

const zht: BillingDict = {
  heading: "帳單與用量",
  paymentMeta: (card) => card,
  overageRate: (rate) => `超額 ${rate} / 1K 點數`,
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
  creditsIn: (span) => `點數 · ${span}`,
  estimateLabel: {
    cycle: "預估帳單 · 本週期",
    last: "上一週期",
    d90: "最近 90 天",
    custom: "所選區間用量",
  },
  seatsLabel: (n) => `${n} 個智能體席位`,
  overageLabel: (credits) => `超出部分（${credits} 點）`,
  noUsage: "此區間尚無點數消耗",
  noUsageHint: "智能體開始工作後，每則訊息、每個任務與每次研究都會記錄在這裡。",
  annualDiscount: "年付折扣",
  total: "合計",
  currency: { usd: "美元", cny: "人民幣" },
  currencyFallback: (raw) => raw.toUpperCase(),
  billedIn: (currency) => `以${currency}結算`,
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
  provider: { stripe: "Stripe", alipay: "支付寶" },
  providerFallback: (raw) => raw.toUpperCase(),
  paidVia: (provider) => `透過${provider}付款`,
  pdf: "PDF ↓",
};

const ja: BillingDict = {
  heading: "請求と使用状況",
  paymentMeta: (card) => card,
  overageRate: (rate) => `超過分 ${rate} / 1K クレジット`,
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
  creditsIn: (span) => `クレジット · ${span}`,
  estimateLabel: {
    cycle: "請求予定額 · 今サイクル",
    last: "前サイクル",
    d90: "過去 90 日",
    custom: "選択期間の利用状況",
  },
  seatsLabel: (n) => `エージェント ${n} 席`,
  overageLabel: (credits) => `超過分（${credits} クレジット）`,
  noUsage: "この期間のクレジット消費はありません",
  noUsageHint: "エージェントが稼働すると、メッセージ・タスク・調査のたびにここへ記録されます。",
  annualDiscount: "年間割引",
  total: "合計",
  currency: { usd: "米ドル", cny: "人民元" },
  currencyFallback: (raw) => raw.toUpperCase(),
  billedIn: (currency) => `${currency}建てで請求`,
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
  provider: { stripe: "Stripe", alipay: "Alipay" },
  providerFallback: (raw) => raw.toUpperCase(),
  paidVia: (provider) => `${provider} で支払い済み`,
  pdf: "PDF ↓",
};

export const billing: Record<Lang, BillingDict> = { en, zh, zht, ja };
