/**
 * Copy for the checkout screen and the post-payment return screen.
 *
 * Checkout is a *handoff*: the seat is paid for on Stripe's or Alipay's own
 * hosted page, never here, so the copy below talks about leaving and coming
 * back rather than about a form. The confirmation wording is deliberately
 * cautious — the browser returning proves nothing, the provider's webhook does.
 */
import type { Lang } from "@/lib/types";

export interface PaymentDict {
  // top bar
  backBilling: string;
  checkout: string;
  encrypted: string;

  // headings
  eyebrow: string;
  title: string;
  /** Sub-heading on the international pane — names Stripe as the processor. */
  subStripe: string;
  /** Sub-heading on the China pane — names Alipay as the processor. */
  subAlipay: string;

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
  /** Tax value in markets where the listed price is already tax-inclusive. */
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

  // stripe handoff
  continueToStripe: string;
  redirectingStripe: string;
  /** Explains that the wallets live on Stripe's page — we offer no card form. */
  stripeWallets: string;
  stripeFootnote: string;

  // alipay handoff
  alipayTitle: string;
  openAlipayApp: string;
  redirectingAlipay: string;
  completeOnPhone: string;
  alipaySecured: string;

  // errors
  paymentFailed: string;
  /** Shown when the checkout call itself fails (5xx / provider unreachable). */
  checkoutUnavailable: string;
  /** e.g. "Payment failed — card declined". */
  paymentFailedReason: (reason: string) => string;
  retryPayment: string;
  orderLookupFailed: string;

  // return screen — confirmation states
  statusEyebrow: string;
  confirmingPay: string;
  awaitingConfirmationNote: string;
  paymentSuccessful: string;
  /** e.g. "$149.00 /mo charged. Receipt sent to wei@company.com." */
  chargedReceipt: (total: string, email: string) => string;
  /** Future tense, for states where the money has not settled yet. */
  receiptWillEmail: (email: string) => string;
  paymentPending: string;
  paymentPendingNote: string;
  paymentCancelled: string;
  paymentCancelledNote: string;
  /** e.g. "INVOICE INV-2026-0042" */
  invoiceRef: (no: string) => string;
  /** e.g. "ORDER ARK-20260613-0042" — shown before an invoice exists. */
  orderRef: (no: string) => string;
  eInvoiceNote: string;
  backToBilling: string;

  /** Disclosure shown when no provider is configured and checkout was simulated. */
  mockNotice: string;
}

const en: PaymentDict = {
  backBilling: "← Billing",
  checkout: "CHECKOUT",
  encrypted: "⬡ ENCRYPTED · TLS 1.3",

  eyebrow: "SECURE CHECKOUT",
  title: "Complete your order",
  subStripe: "Professional seat for Nova — Sales Prospector. Processed securely by Stripe.",
  subAlipay: "Professional seat for Nova — Sales Prospector. Processed securely by Alipay.",

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
  taxIncluded: "Included",

  dueToday: "Due today",
  perCycle: (yearly) => (yearly ? " /yr" : " /mo"),
  footnote: "CANCEL ANYTIME · OVERAGE METERED · VAT INVOICE ON REQUEST",

  regionGlobal: "GLOBAL · STRIPE",
  regionCN: "中国大陆 · 支付宝",
  regionNote: "Detected from your language setting — switch anytime.",

  continueToStripe: "Continue to Stripe",
  redirectingStripe: "Redirecting to Stripe…",
  stripeWallets:
    "Apple Pay, Google Pay and cards are all offered on Stripe’s hosted page. Your card details never reach us.",
  stripeFootnote: "POWERED BY STRIPE · PCI DSS LEVEL 1 · 3-D SECURE",

  alipayTitle: "支付宝 · Alipay",
  openAlipayApp: "Open Alipay to complete payment",
  redirectingAlipay: "Redirecting to Alipay…",
  completeOnPhone:
    "You’ll finish paying on Alipay — in the app, or by scanning the QR on their page.",
  alipaySecured: "SECURED BY ALIPAY",

  paymentFailed: "Payment failed. Please try again.",
  checkoutUnavailable:
    "Couldn’t start checkout — the payment provider is unreachable. Please try again in a moment.",
  paymentFailedReason: (reason) => `Payment failed — ${reason}`,
  retryPayment: "Try again",
  orderLookupFailed: "We couldn’t load that order.",

  statusEyebrow: "PAYMENT STATUS",
  confirmingPay: "Confirming payment…",
  awaitingConfirmationNote: "Keep this page open — we’re confirming with your payment provider.",
  paymentSuccessful: "Payment successful",
  chargedReceipt: (total, email) => `${total} charged. Receipt sent to ${email}.`,
  receiptWillEmail: (email) => `We’ll email your receipt to ${email}.`,
  paymentPending: "Payment pending",
  paymentPendingNote:
    "Your bank is still processing this. We’ll activate the seat the moment it clears.",
  paymentCancelled: "Payment cancelled",
  paymentCancelledNote: "Nothing was charged. Your order is still here when you’re ready.",
  invoiceRef: (no) => `INVOICE ${no}`,
  orderRef: (no) => `ORDER ${no}`,
  eInvoiceNote: "E-invoice available on the billing page",
  backToBilling: "Back to billing →",

  mockNotice:
    "Simulated payment — no payment provider is configured here, so nothing was actually charged.",
};

const zh: PaymentDict = {
  backBilling: "← 账单",
  checkout: "结账",
  encrypted: "⬡ 已加密 · TLS 1.3",

  eyebrow: "安全收银台",
  title: "确认订单",
  subStripe: "为 Nova（销售开拓）开通专业版坐席，通过 Stripe 安全付款。",
  subAlipay: "为 Nova（销售开拓）开通专业版坐席，通过支付宝安全付款。",

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

  continueToStripe: "继续前往 Stripe",
  redirectingStripe: "正在跳转至 Stripe…",
  stripeWallets:
    "Apple Pay、Google Pay 与银行卡均可在 Stripe 的收银页面选择，我们不会接触您的卡片信息。",
  stripeFootnote: "由 STRIPE 提供 · PCI DSS 一级 · 3-D SECURE",

  alipayTitle: "支付宝 · Alipay",
  openAlipayApp: "打开支付宝完成付款",
  redirectingAlipay: "正在跳转至支付宝…",
  completeOnPhone: "您将在支付宝完成付款：可在 App 内支付，或扫描收银页上的二维码。",
  alipaySecured: "由支付宝提供安全支付 · SECURED BY ALIPAY",

  paymentFailed: "支付失败，请重试。",
  checkoutUnavailable: "无法发起支付：暂时无法连接支付渠道，请稍后重试。",
  paymentFailedReason: (reason) => `支付失败：${reason}`,
  retryPayment: "重新支付",
  orderLookupFailed: "无法加载该订单。",

  statusEyebrow: "支付状态",
  confirmingPay: "正在确认支付…",
  awaitingConfirmationNote: "请勿关闭本页，我们正在与支付渠道确认结果。",
  paymentSuccessful: "支付成功",
  chargedReceipt: (total, email) => `已扣款 ${total}，收据已发送至 ${email}。`,
  receiptWillEmail: (email) => `收据将发送至 ${email}。`,
  paymentPending: "支付处理中",
  paymentPendingNote: "银行仍在处理这笔支付，到账后我们会立即开通坐席。",
  paymentCancelled: "支付已取消",
  paymentCancelledNote: "未产生任何扣款，订单已为您保留。",
  invoiceRef: (no) => `发票 ${no}`,
  orderRef: (no) => `订单号 ${no}`,
  eInvoiceNote: "电子发票可在账单页申请",
  backToBilling: "返回账单 →",

  mockNotice: "模拟支付：当前环境未配置支付渠道，未产生任何实际扣款。",
};

const zht: PaymentDict = {
  backBilling: "← 帳單",
  checkout: "結帳",
  encrypted: "⬡ 已加密 · TLS 1.3",

  eyebrow: "安全收銀台",
  title: "確認訂單",
  subStripe: "為 Nova（銷售開拓）開通專業版席位，透過 Stripe 安全付款。",
  subAlipay: "為 Nova（銷售開拓）開通專業版席位，透過支付寶安全付款。",

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

  continueToStripe: "繼續前往 Stripe",
  redirectingStripe: "正在前往 Stripe…",
  stripeWallets:
    "Apple Pay、Google Pay 與信用卡皆可在 Stripe 的付款頁面選擇，我們不會接觸您的卡片資料。",
  stripeFootnote: "由 STRIPE 提供 · PCI DSS 第一級 · 3-D SECURE",

  alipayTitle: "支付宝 · Alipay",
  openAlipayApp: "開啟支付寶完成付款",
  redirectingAlipay: "正在前往支付寶…",
  completeOnPhone: "您將於支付寶完成付款：可在 App 內付款，或掃描收銀頁上的 QR 碼。",
  alipaySecured: "由支付寶提供安全付款 · SECURED BY ALIPAY",

  paymentFailed: "付款失敗，請重試。",
  checkoutUnavailable: "無法發起付款：暫時無法連線至付款渠道，請稍後再試。",
  paymentFailedReason: (reason) => `付款失敗：${reason}`,
  retryPayment: "重新付款",
  orderLookupFailed: "無法載入該訂單。",

  statusEyebrow: "付款狀態",
  confirmingPay: "正在確認付款…",
  awaitingConfirmationNote: "請勿關閉本頁，我們正在與付款渠道確認結果。",
  paymentSuccessful: "付款成功",
  chargedReceipt: (total, email) => `已扣款 ${total}，收據已寄送至 ${email}。`,
  receiptWillEmail: (email) => `收據將寄送至 ${email}。`,
  paymentPending: "付款處理中",
  paymentPendingNote: "銀行仍在處理這筆付款，款項到帳後我們會立即開通席位。",
  paymentCancelled: "付款已取消",
  paymentCancelledNote: "未產生任何扣款，訂單已為您保留。",
  invoiceRef: (no) => `發票 ${no}`,
  orderRef: (no) => `訂單號 ${no}`,
  eInvoiceNote: "電子發票可於帳單頁申請",
  backToBilling: "返回帳單 →",

  mockNotice: "模擬付款：目前環境未設定付款渠道，未產生任何實際扣款。",
};

const ja: PaymentDict = {
  backBilling: "← 請求",
  checkout: "お支払い",
  encrypted: "⬡ 暗号化済み · TLS 1.3",

  eyebrow: "セキュアチェックアウト",
  title: "ご注文の確定",
  subStripe:
    "Nova（セールス開拓）にプロフェッショナル席を割り当てます。Stripe による安全な決済です。",
  subAlipay:
    "Nova（セールス開拓）にプロフェッショナル席を割り当てます。Alipay による安全な決済です。",

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

  continueToStripe: "Stripe に進む",
  redirectingStripe: "Stripe に移動しています…",
  stripeWallets:
    "Apple Pay、Google Pay、カードはいずれも Stripe の決済ページで選べます。カード情報を当社が受け取ることはありません。",
  stripeFootnote: "POWERED BY STRIPE · PCI DSS レベル 1 · 3-D セキュア",

  alipayTitle: "支付宝 · Alipay",
  openAlipayApp: "Alipay を開いて支払いを完了",
  redirectingAlipay: "Alipay に移動しています…",
  completeOnPhone: "お支払いは Alipay のページ、またはアプリでの読み取りで完了します。",
  alipaySecured: "Alipay による安全な決済 · SECURED BY ALIPAY",

  paymentFailed: "決済に失敗しました。もう一度お試しください。",
  checkoutUnavailable:
    "決済を開始できませんでした。決済事業者に接続できません。しばらくしてからお試しください。",
  paymentFailedReason: (reason) => `決済に失敗しました：${reason}`,
  retryPayment: "もう一度試す",
  orderLookupFailed: "この注文を読み込めませんでした。",

  statusEyebrow: "お支払い状況",
  confirmingPay: "お支払いを確認しています…",
  awaitingConfirmationNote: "このページを閉じずにお待ちください。決済事業者に確認しています。",
  paymentSuccessful: "お支払いが完了しました",
  chargedReceipt: (total, email) => `${total} を請求しました。領収書を ${email} に送信しました。`,
  receiptWillEmail: (email) => `領収書は ${email} にお送りします。`,
  paymentPending: "お支払い処理中",
  paymentPendingNote: "決済処理が続いています。完了しだい席を有効化します。",
  paymentCancelled: "お支払いをキャンセルしました",
  paymentCancelledNote: "請求は発生していません。ご注文はそのまま保存されています。",
  invoiceRef: (no) => `請求書 ${no}`,
  orderRef: (no) => `注文番号 ${no}`,
  eInvoiceNote: "電子請求書は請求ページから申請できます",
  backToBilling: "請求ページへ戻る →",

  mockNotice: "これはシミュレーション決済です。決済事業者が未設定のため、実際の請求は発生していません。",
};

export const payment: Record<Lang, PaymentDict> = { en, zh, zht, ja };
