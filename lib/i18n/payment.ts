/** Copy for the checkout / payment screen (order summary + Stripe / Alipay). */
import type { Lang } from "@/lib/types";

export interface PaymentDict {
  // top bar
  backBilling: string;
  checkout: string;
  encrypted: string;

  // headings
  eyebrow: string;
  title: string;
  sub: string;

  // billing cycle toggle
  cycleMonthly: string;
  cycleAnnual: string;

  // plan card
  planName: string;
  planFor: string;

  // order summary line items
  seatMonthly: string;
  seatAnnual: string;
  annualDiscount: string;
  creditsPerMonth: string;
  included: string;
  taxLabel: string;
  taxIncluded: string;

  // totals
  dueToday: string;
  /** Suffix appended to the amount, e.g. " /mo" or " /yr". */
  perCycle: (yearly: boolean) => string;
  footnote: string;

  // region tabs
  regionGlobal: string;
  regionCN: string;
  regionNote: string;

  // stripe form
  applePay: string;
  googlePay: string;
  orPayWithCard: string;
  email: string;
  cardNumber: string;
  expiry: string;
  cvc: string;
  nameOnCard: string;
  country: string;
  /** Default country value prefilled in the card form. */
  countryDefault: string;
  processing: string;
  /** Pay button label, e.g. "Pay $149.00". */
  payAmount: (amt: string) => string;
  paymentFailed: string;
  stripeFootnote: string;

  // stripe success
  paymentSuccessful: string;
  /** e.g. "$149.00 /mo charged. Receipt sent to wei@company.com." */
  chargedReceipt: (total: string, email: string) => string;
  /** e.g. "INVOICE INV-123" / "REF ch_..." */
  invoiceRef: (no: string | null) => string;
  backToBilling: string;

  // alipay
  alipayTitle: string;
  scanToPay: string;
  qrExpires: string;
  simulatePay: string;
  confirmingPay: string;
  completeOnPhone: string;
  alipaySuccess: string;
  /** e.g. "Activated: Professional seat × 1 · ¥1,068.00" */
  alipayActivated: (amt: string) => string;
  /** e.g. "ORDER ARK-... · e-invoice available on the billing page" */
  alipayInvoiceRef: (no: string | null) => string;
  alipaySecured: string;
}

const en: PaymentDict = {
  backBilling: "← Billing",
  checkout: "CHECKOUT",
  encrypted: "⬡ ENCRYPTED · TLS 1.3",

  eyebrow: "SECURE CHECKOUT",
  title: "Complete your order",
  sub: "Professional seat for Nova — Sales Prospector. Processed securely by Stripe.",

  cycleMonthly: "MONTHLY",
  cycleAnnual: "ANNUAL −20%",

  planName: "Professional — AI employee seat",
  planFor: "For: Nova · Sales Prospector",

  seatMonthly: "Professional seat × 1",
  seatAnnual: "Professional seat × 1 · annual",
  annualDiscount: "Annual discount −20%",
  creditsPerMonth: "25,000 credits / mo",
  included: "Included",
  taxLabel: "Tax",
  taxIncluded: "$0.00",

  dueToday: "Due today",
  perCycle: (yearly) => (yearly ? " /yr" : " /mo"),
  footnote: "CANCEL ANYTIME · OVERAGE METERED · VAT INVOICE ON REQUEST",

  regionGlobal: "GLOBAL · STRIPE",
  regionCN: "中国大陆 · 支付宝",
  regionNote: "Detected from your language setting — switch anytime.",

  applePay: "Apple Pay",
  googlePay: "Google Pay",
  orPayWithCard: "OR PAY WITH CARD",
  email: "EMAIL",
  cardNumber: "CARD NUMBER",
  expiry: "EXPIRY",
  cvc: "CVC",
  nameOnCard: "NAME ON CARD",
  country: "COUNTRY",
  countryDefault: "Singapore",
  processing: "Processing…",
  payAmount: (amt) => "Pay " + amt,
  paymentFailed: "Payment failed. Please try again.",
  stripeFootnote: "POWERED BY STRIPE · PCI DSS LEVEL 1 · 3-D SECURE",

  paymentSuccessful: "Payment successful",
  chargedReceipt: (total, email) => `${total} charged. Receipt sent to ${email}.`,
  invoiceRef: (no) => (no ? `INVOICE ${no}` : "REF ch_3PqXk2LkdIwHu7ix"),
  backToBilling: "Back to billing →",

  alipayTitle: "支付宝 · Alipay",
  scanToPay: "Open the Alipay app and scan to pay",
  qrExpires: "QR expires in 04:32 · Order ARK-20260613-0042",
  simulatePay: "Simulate scan & pay (demo)",
  confirmingPay: "Confirming payment…",
  completeOnPhone: "Complete the payment on your phone",
  alipaySuccess: "Payment successful",
  alipayActivated: (amt) => `Activated: Professional seat × 1 · ${amt}`,
  alipayInvoiceRef: (no) =>
    (no ? `ORDER ${no}` : "ORDER ARK-20260613-0042") +
    " · e-invoice available on the billing page",
  alipaySecured: "Secured by Alipay · SECURED BY ALIPAY",
};

const zh: PaymentDict = {
  backBilling: "← 账单",
  checkout: "结账",
  encrypted: "⬡ 已加密 · TLS 1.3",

  eyebrow: "安全收银台",
  title: "确认订单",
  sub: "为 Nova（销售开拓）开通专业版坐席，通过支付宝安全付款。",

  cycleMonthly: "月付",
  cycleAnnual: "年付 −20%",

  planName: "专业版 — AI 员工坐席",
  planFor: "适用：Nova · 销售开拓",

  seatMonthly: "专业版坐席 × 1",
  seatAnnual: "专业版坐席 × 1（年付）",
  annualDiscount: "年付优惠 −20%",
  creditsPerMonth: "每月 25,000 积分",
  included: "已包含",
  taxLabel: "增值税",
  taxIncluded: "已含",

  dueToday: "应付金额",
  perCycle: (yearly) => (yearly ? " /年" : " /月"),
  footnote: "随时取消 · 超额按量计费 · 支持增值税发票",

  regionGlobal: "GLOBAL · STRIPE",
  regionCN: "中国大陆 · 支付宝",
  regionNote: "已根据您的语言设置自动选择，可随时切换。",

  applePay: "Apple Pay",
  googlePay: "Google Pay",
  orPayWithCard: "或使用银行卡支付",
  email: "邮箱",
  cardNumber: "卡号",
  expiry: "有效期",
  cvc: "安全码",
  nameOnCard: "持卡人姓名",
  country: "国家/地区",
  countryDefault: "Singapore",
  processing: "处理中…",
  payAmount: (amt) => "支付 " + amt,
  paymentFailed: "支付失败，请重试。",
  stripeFootnote: "由 STRIPE 提供 · PCI DSS 一级 · 3-D SECURE",

  paymentSuccessful: "支付成功",
  chargedReceipt: (total, email) => `已扣款 ${total}，收据已发送至 ${email}。`,
  invoiceRef: (no) => (no ? `发票 ${no}` : "凭证号 ch_3PqXk2LkdIwHu7ix"),
  backToBilling: "返回账单 →",

  alipayTitle: "支付宝 · Alipay",
  scanToPay: "请使用支付宝 App 扫一扫付款",
  qrExpires: "二维码将于 04:32 后失效 · 订单号 ARK-20260613-0042",
  simulatePay: "模拟扫码支付（演示）",
  confirmingPay: "正在确认支付…",
  completeOnPhone: "请在手机上完成支付验证",
  alipaySuccess: "支付成功",
  alipayActivated: (amt) => `已开通：专业版坐席 × 1 · ${amt}`,
  alipayInvoiceRef: (no) =>
    (no ? `订单号 ${no}` : "订单号 ARK-20260613-0042") + " · 电子发票可在账单页申请",
  alipaySecured: "由支付宝提供安全支付 · SECURED BY ALIPAY",
};

const zht: PaymentDict = {
  backBilling: "← 帳單",
  checkout: "結帳",
  encrypted: "⬡ 已加密 · TLS 1.3",

  eyebrow: "安全收銀台",
  title: "確認訂單",
  sub: "為 Nova（銷售開拓）開通專業版席位，透過支付寶安全付款。",

  cycleMonthly: "月付",
  cycleAnnual: "年付 −20%",

  planName: "專業版 — AI 員工席位",
  planFor: "適用：Nova · 銷售開拓",

  seatMonthly: "專業版席位 × 1",
  seatAnnual: "專業版席位 × 1（年付）",
  annualDiscount: "年付優惠 −20%",
  creditsPerMonth: "每月 25,000 點數",
  included: "已包含",
  taxLabel: "稅金",
  taxIncluded: "已含",

  dueToday: "應付金額",
  perCycle: (yearly) => (yearly ? " /年" : " /月"),
  footnote: "隨時取消 · 超額按量計費 · 可開立發票",

  regionGlobal: "GLOBAL · STRIPE",
  regionCN: "中国大陆 · 支付宝",
  regionNote: "已依您的語言設定自動選擇，可隨時切換。",

  applePay: "Apple Pay",
  googlePay: "Google Pay",
  orPayWithCard: "或使用信用卡付款",
  email: "電子郵件",
  cardNumber: "卡號",
  expiry: "有效期限",
  cvc: "安全碼",
  nameOnCard: "持卡人姓名",
  country: "國家/地區",
  countryDefault: "Singapore",
  processing: "處理中…",
  payAmount: (amt) => "支付 " + amt,
  paymentFailed: "付款失敗，請重試。",
  stripeFootnote: "由 STRIPE 提供 · PCI DSS 第一級 · 3-D SECURE",

  paymentSuccessful: "付款成功",
  chargedReceipt: (total, email) => `已扣款 ${total}，收據已寄送至 ${email}。`,
  invoiceRef: (no) => (no ? `發票 ${no}` : "憑證號 ch_3PqXk2LkdIwHu7ix"),
  backToBilling: "返回帳單 →",

  alipayTitle: "支付宝 · Alipay",
  scanToPay: "請使用支付寶 App 掃一掃付款",
  qrExpires: "QR 碼將於 04:32 後失效 · 訂單號 ARK-20260613-0042",
  simulatePay: "模擬掃碼付款（示範）",
  confirmingPay: "正在確認付款…",
  completeOnPhone: "請於手機上完成付款驗證",
  alipaySuccess: "付款成功",
  alipayActivated: (amt) => `已開通：專業版席位 × 1 · ${amt}`,
  alipayInvoiceRef: (no) =>
    (no ? `訂單號 ${no}` : "訂單號 ARK-20260613-0042") + " · 電子發票可於帳單頁申請",
  alipaySecured: "由支付寶提供安全付款 · SECURED BY ALIPAY",
};

const ja: PaymentDict = {
  backBilling: "← 請求",
  checkout: "お支払い",
  encrypted: "⬡ 暗号化済み · TLS 1.3",

  eyebrow: "セキュアチェックアウト",
  title: "ご注文の確定",
  sub: "Nova（セールス開拓）にプロフェッショナル席を割り当てます。Stripe による安全な決済です。",

  cycleMonthly: "月払い",
  cycleAnnual: "年払い −20%",

  planName: "プロフェッショナル — AI 社員席",
  planFor: "対象：Nova · セールス開拓",

  seatMonthly: "プロフェッショナル席 × 1",
  seatAnnual: "プロフェッショナル席 × 1（年払い）",
  annualDiscount: "年払い割引 −20%",
  creditsPerMonth: "月 25,000 クレジット",
  included: "込み",
  taxLabel: "税",
  taxIncluded: "込み",

  dueToday: "本日のお支払い",
  perCycle: (yearly) => (yearly ? " /年" : " /月"),
  footnote: "いつでも解約可能 · 超過分は従量課金 · 請求書発行可",

  regionGlobal: "GLOBAL · STRIPE",
  regionCN: "中国大陆 · 支付宝",
  regionNote: "言語設定から自動選択されました。いつでも切り替えできます。",

  applePay: "Apple Pay",
  googlePay: "Google Pay",
  orPayWithCard: "またはカードで支払う",
  email: "メールアドレス",
  cardNumber: "カード番号",
  expiry: "有効期限",
  cvc: "セキュリティコード",
  nameOnCard: "カード名義",
  country: "国/地域",
  countryDefault: "Singapore",
  processing: "処理中…",
  payAmount: (amt) => amt + " を支払う",
  paymentFailed: "決済に失敗しました。もう一度お試しください。",
  stripeFootnote: "POWERED BY STRIPE · PCI DSS レベル 1 · 3-D セキュア",

  paymentSuccessful: "お支払いが完了しました",
  chargedReceipt: (total, email) => `${total} を請求しました。領収書を ${email} に送信しました。`,
  invoiceRef: (no) => (no ? `請求書 ${no}` : "参照番号 ch_3PqXk2LkdIwHu7ix"),
  backToBilling: "請求ページへ戻る →",

  alipayTitle: "支付宝 · Alipay",
  scanToPay: "Alipay アプリでスキャンしてお支払いください",
  qrExpires: "QR コードは 04:32 後に失効します · 注文番号 ARK-20260613-0042",
  simulatePay: "スキャン決済をシミュレート（デモ）",
  confirmingPay: "お支払いを確認しています…",
  completeOnPhone: "スマートフォンでお支払いを完了してください",
  alipaySuccess: "お支払いが完了しました",
  alipayActivated: (amt) => `有効化：プロフェッショナル席 × 1 · ${amt}`,
  alipayInvoiceRef: (no) =>
    (no ? `注文番号 ${no}` : "注文番号 ARK-20260613-0042") + " · 電子請求書は請求ページから申請できます",
  alipaySecured: "Alipay による安全な決済 · SECURED BY ALIPAY",
};

export const payment: Record<Lang, PaymentDict> = { en, zh, zht, ja };
