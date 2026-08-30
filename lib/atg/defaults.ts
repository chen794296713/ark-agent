/**
 * The tables the deterministic composer composes over.
 *
 * This file is the product's floor. Until an `OPENROUTER_API_KEY` is configured
 * — and on every stage that falls back after one — the template a customer
 * reviews is assembled entirely from what is written here. So the copy is
 * hand-written natively in all four languages, the way `lib/i18n/**` is, and
 * not machine-translated from the English column.
 *
 * Pure and client-safe: no `server-only`, no I/O, no environment reads. The
 * caller does the database work and hands the rows in.
 */
import type { Lang } from "@/lib/types";
import type { Harness } from "@/lib/harness";
import type { AgentSettings } from "@/lib/agent-settings";
import type { CapabilityRequest } from "./schema";
import type { RuleCategory, SchedulePayloadKind, TemplateCategory, TemplateMetric } from "./types";

/** The eight seeded `agent_roles` ids. `lib/data.ts` is the source of the set. */
export const ROLE_IDS = [
  "prospector",
  "salesmkt",
  "admin",
  "hr",
  "support",
  "legal",
  "content",
  "opc",
] as const;
export type SeededRoleId = (typeof ROLE_IDS)[number];

/** Where role resolution lands when nothing scores. Its brief is the broadest. */
export const DEFAULT_ROLE_ID: SeededRoleId = "admin";

/** Below this the keyword match is noise and `admin` wins instead. */
export const ROLE_FLOOR = 3;

export function isSeededRoleId(value: string): value is SeededRoleId {
  return (ROLE_IDS as readonly string[]).includes(value);
}

type ByRole<T> = Record<SeededRoleId, T>;
type ByLang<T> = Record<Lang, T>;

// ---------------------------------------------------------------------------
// Role resolution
// ---------------------------------------------------------------------------

/**
 * Keywords that vote for a role, per language. Lower-cased; matched as a
 * substring for CJK (no whitespace to tokenize on) and on word boundaries for
 * Latin script, so "bill" does not fire on "billboard".
 */
export const ROLE_LEXICON: ByRole<ByLang<string[]>> = {
  prospector: {
    en: ["lead", "leads", "prospect", "prospecting", "outbound", "cold email", "icp", "pipeline", "linkedin", "qualify", "book a call", "demo", "sdr", "outreach"],
    zh: ["线索", "获客", "拓客", "潜在客户", "外呼", "陌生开发", "销售线索", "约见", "预约演示", "客户名单"],
    zht: ["線索", "開發客戶", "潛在客戶", "陌生開發", "銷售線索", "約訪", "預約展示", "客戶名單"],
    ja: ["リード", "見込み客", "新規開拓", "アポ", "アポイント", "商談化", "テレアポ", "営業リスト"],
  },
  salesmkt: {
    en: ["campaign", "marketing", "crm", "nurture", "sequence", "newsletter blast", "funnel", "ads", "conversion", "follow-up", "follow up"],
    zh: ["营销", "活动", "投放", "转化", "客户关系", "跟进", "漏斗", "广告"],
    zht: ["行銷", "活動", "投放", "轉換", "客戶關係", "跟進", "漏斗", "廣告"],
    ja: ["マーケ", "マーケティング", "キャンペーン", "顧客管理", "フォローアップ", "広告", "コンバージョン"],
  },
  admin: {
    en: ["inbox", "calendar", "schedule my", "meeting", "email triage", "assistant", "admin", "filing", "reminder", "brief", "paperwork", "document"],
    zh: ["邮箱", "日程", "会议", "行政", "助理", "提醒", "整理文件", "归档", "秘书"],
    zht: ["信箱", "行程", "會議", "行政", "助理", "提醒", "整理檔案", "歸檔", "秘書"],
    ja: ["受信箱", "メール整理", "予定", "会議", "秘書", "アシスタント", "リマインド", "書類"],
  },
  hr: {
    en: ["candidate", "recruit", "recruiting", "hiring", "resume", "cv", "interview", "sourcing", "ats", "onboarding", "job posting"],
    zh: ["招聘", "候选人", "简历", "面试", "入职", "人事", "猎头"],
    zht: ["招募", "候選人", "履歷", "面試", "到職", "人資", "獵頭"],
    ja: ["採用", "候補者", "履歴書", "面接", "オンボーディング", "人事", "求人"],
  },
  support: {
    en: ["support", "customer", "ticket", "helpdesk", "refund", "complaint", "faq", "sla", "inbound question", "help centre", "help center"],
    zh: ["客服", "工单", "售后", "退款", "投诉", "常见问题", "答疑"],
    zht: ["客服", "工單", "售後", "退款", "客訴", "常見問題", "回覆客戶"],
    ja: ["サポート", "問い合わせ", "チケット", "返金", "クレーム", "カスタマー", "よくある質問"],
  },
  legal: {
    en: ["contract", "nda", "clause", "redline", "legal", "compliance", "terms", "agreement", "indemnity", "liability"],
    zh: ["合同", "保密协议", "条款", "法务", "合规", "审阅", "风险条款"],
    zht: ["合約", "保密協議", "條款", "法務", "合規", "審閱", "風險條款"],
    ja: ["契約", "秘密保持", "条項", "法務", "コンプライアンス", "レビュー", "リーガル"],
  },
  content: {
    en: ["content", "blog", "post", "seo", "newsletter", "copywriting", "article", "social", "editorial", "write posts"],
    zh: ["内容", "文案", "公众号", "推文", "博客", "文章", "选题", "排期发布"],
    zht: ["內容", "文案", "貼文", "部落格", "文章", "選題", "排程發布"],
    ja: ["コンテンツ", "記事", "投稿", "ブログ", "ニュースレター", "ライティング", "sns"],
  },
  opc: {
    en: ["invoice", "invoices", "unpaid", "bookkeeping", "books", "chase payment", "back office", "one-person", "solo business", "p&l", "expenses", "renewal", "filing deadline"],
    zh: ["发票", "催款", "欠款", "记账", "对账", "后台", "一人公司", "报表", "续费", "开票"],
    zht: ["發票", "催款", "欠款", "記帳", "對帳", "後台", "一人公司", "報表", "續約", "開票"],
    ja: ["請求書", "未払い", "督促", "記帳", "経理", "バックオフィス", "ひとり社長", "月次", "更新手続き"],
  },
};

/** The gallery category a seeded role lands in when nothing overrides it. */
export const ROLE_CATEGORY: ByRole<TemplateCategory> = {
  prospector: "sales",
  salesmkt: "marketing",
  admin: "operations",
  hr: "hr",
  support: "support",
  legal: "operations",
  content: "marketing",
  opc: "finance",
};

/** Template display name per role and language. */
export const ROLE_NAME: ByRole<ByLang<string>> = {
  prospector: { en: "Sales Prospector", zh: "销售拓客助理", zht: "業務開發助理", ja: "新規開拓アシスタント" },
  salesmkt: { en: "Campaign Runner", zh: "营销运营助理", zht: "行銷運營助理", ja: "キャンペーン運用担当" },
  admin: { en: "Admin Assistant", zh: "行政助理", zht: "行政助理", ja: "アシスタント" },
  hr: { en: "Recruiting Coordinator", zh: "招聘协调助理", zht: "招募協調助理", ja: "採用コーディネーター" },
  support: { en: "Support Responder", zh: "客服应答助理", zht: "客服回覆助理", ja: "カスタマーサポート担当" },
  legal: { en: "Contract Reviewer", zh: "合同审阅助理", zht: "合約審閱助理", ja: "契約レビュー担当" },
  content: { en: "Content Producer", zh: "内容运营助理", zht: "內容運營助理", ja: "コンテンツ担当" },
  opc: { en: "Back Office Operator", zh: "后台运营助理", zht: "後台運營助理", ja: "バックオフィス担当" },
};

// ---------------------------------------------------------------------------
// Charter padding
// ---------------------------------------------------------------------------

/**
 * Padding for `roles[].responsibilities` when a seeded `default_instructions`
 * splits into fewer than the schema's minimum of three sentences.
 */
export const ROLE_RESPONSIBILITY_DEFAULTS: ByRole<ByLang<string[]>> = {
  prospector: {
    en: ["Keep the prospect list deduplicated and current", "Log every touch and reply against the right contact", "Hand qualified leads to a human with a one-paragraph summary"],
    zh: ["保持客户名单去重、信息最新", "把每次触达和回复记录到对应联系人名下", "把已确认意向的线索连同一段说明交给同事跟进"],
    zht: ["保持客戶名單去重、資訊最新", "把每次接觸與回覆記錄到對應聯絡人名下", "把已確認意向的線索連同一段說明交給同事跟進"],
    ja: ["営業リストの重複を排除し、最新の状態に保つ", "接触と返信をすべて該当のコンタクトに記録する", "商談化した見込み客を要約とともに担当者へ引き継ぐ"],
  },
  salesmkt: {
    en: ["Keep CRM records complete after every campaign send", "Report what each campaign produced, not just what it sent", "Pause a sequence the moment a lead replies"],
    zh: ["每次投放后补全客户关系系统里的记录", "汇报每个活动带来的结果，而不只是发了多少", "线索一旦回复就立即停止后续自动跟进"],
    zht: ["每次投放後補齊客戶關係系統的紀錄", "回報每個活動帶來的結果，而不只是發送量", "線索一旦回覆就立即停止後續自動跟進"],
    ja: ["配信のたびに顧客管理システムの記録を補完する", "送信数ではなく、施策が生んだ結果を報告する", "返信があった時点で自動フォローを停止する"],
  },
  admin: {
    en: ["Triage the inbox and surface only what needs a decision", "Keep the calendar free of double bookings", "File documents where they can be found again"],
    zh: ["整理邮箱，只把需要你决策的事情呈上来", "保证日程不出现时间冲突", "把文件归档到下次能找得到的位置"],
    zht: ["整理信箱，只把需要你決策的事情呈上來", "確保行程不出現時間衝突", "把檔案歸檔到下次找得到的位置"],
    ja: ["受信箱を整理し、判断が必要な件だけを上げる", "予定の二重予約が起きないようにする", "書類を後から探せる場所に整理する"],
  },
  hr: {
    en: ["Keep every candidate's status accurate in the tracker", "Reply to every applicant, including the rejections", "Prepare an interview brief before each scheduled conversation"],
    zh: ["在候选人跟踪表里保持状态准确", "回复每一位应聘者，包括未通过的", "每场面试前准备一份面试提纲"],
    zht: ["在候選人追蹤表中保持狀態正確", "回覆每一位應徵者，包含未錄取的", "每場面試前準備一份面試提綱"],
    ja: ["候補者のステータスを常に正確に保つ", "不採用も含め、応募者全員に返信する", "面接前に想定質問メモを用意する"],
  },
  support: {
    en: ["Answer from the help-centre playbook, not from memory", "Escalate anything the playbook does not cover", "Summarize recurring issues so they can be fixed at the source"],
    zh: ["按帮助中心的标准答案回复，不要凭印象作答", "帮助中心没有覆盖的问题一律上报", "汇总反复出现的问题，便于从源头解决"],
    zht: ["依照說明中心的標準答案回覆，不要憑印象作答", "說明中心未涵蓋的問題一律上報", "彙整反覆出現的問題，便於從源頭解決"],
    ja: ["記憶ではなくヘルプセンターの手順に沿って回答する", "手順に載っていない件はすべてエスカレーションする", "繰り返し起きる問題をまとめ、根本対応につなげる"],
  },
  legal: {
    en: ["Compare each document against the standard position", "Flag every deviation with the clause it came from", "Produce a one-page summary with a recommendation"],
    zh: ["把每份文件与公司标准条款逐条比对", "标出每一处偏离，并注明来自哪一条", "输出一页纸的摘要和处理建议"],
    zht: ["把每份文件與公司標準條款逐條比對", "標出每一處偏離，並註明來自哪一條", "輸出一頁的摘要與處理建議"],
    ja: ["各文書を自社の標準条件と逐条で比較する", "逸脱箇所を該当条項とともに指摘する", "推奨対応を添えた1ページの要約を作成する"],
  },
  content: {
    en: ["Keep the content calendar filled a week ahead", "Match the voice guide on every piece", "Repurpose what already performed instead of starting from nothing"],
    zh: ["内容排期表始终保持提前一周排满", "每篇内容都符合品牌语气规范", "优先复用效果好的素材，而不是从零开始"],
    zht: ["內容排程表始終保持提前一週排滿", "每篇內容都符合品牌語氣規範", "優先改寫成效好的素材，而不是從零開始"],
    ja: ["コンテンツカレンダーを1週間先まで埋めておく", "すべての原稿をトーン&マナーに合わせる", "反応が良かった素材を作り直して再利用する"],
  },
  opc: {
    en: ["Keep the ledger reconciled against the bank statement", "Chase overdue invoices politely and on a fixed cadence", "Flag renewals and filing deadlines before they arrive"],
    zh: ["定期把账目与银行流水对账", "按固定节奏礼貌催收逾期账款", "在续费和申报截止日之前提前提醒"],
    zht: ["定期把帳目與銀行流水對帳", "按固定節奏禮貌催收逾期帳款", "在續約與申報截止日之前提前提醒"],
    ja: ["帳簿と入出金明細を定期的に照合する", "支払期限を過ぎた請求を一定の間隔で丁寧に督促する", "更新や申告の期限を事前に知らせる"],
  },
};

/** Fallback `handoffs` when `agent_roles.default_rules` yields no escalation sentence. */
export const ROLE_HANDOFF_DEFAULTS: ByRole<ByLang<string[]>> = {
  prospector: {
    en: ["A prospect asks about price, contract terms or legal", "A reply is hostile or asks to be removed"],
    zh: ["对方询问价格、合同条款或法律问题", "对方回复带有抵触情绪或要求不再联系"],
    zht: ["對方詢問價格、合約條款或法律問題", "對方回覆帶有抗拒情緒或要求不再聯絡"],
    ja: ["価格・契約条件・法務に関する質問を受けたとき", "強い拒否や配信停止の要望があったとき"],
  },
  salesmkt: {
    en: ["A campaign would change pricing or positioning copy", "Results fall more than 30% below the previous send"],
    zh: ["活动会改动价格或定位相关的文案", "效果比上一次投放低 30% 以上"],
    zht: ["活動會改動價格或定位相關的文案", "成效比上一次投放低 30% 以上"],
    ja: ["価格や訴求の表現を変更する必要があるとき", "前回配信より成果が3割以上落ちたとき"],
  },
  admin: {
    en: ["An email is from an investor, a lawyer or a regulator", "A request would commit money or a signature"],
    zh: ["邮件来自投资人、律师或监管机构", "事项涉及付款或需要签字"],
    zht: ["郵件來自投資人、律師或主管機關", "事項涉及付款或需要簽名"],
    ja: ["投資家・弁護士・当局からの連絡があったとき", "支払いや署名を伴う依頼が来たとき"],
  },
  hr: {
    en: ["A candidate asks about salary, equity or start date", "A candidate raises a complaint or a legal concern"],
    zh: ["候选人询问薪资、股权或入职时间", "候选人提出投诉或涉及法律的问题"],
    zht: ["候選人詢問薪資、股權或到職時間", "候選人提出申訴或涉及法律的問題"],
    ja: ["給与・株式・入社日について質問されたとき", "苦情や法的な懸念が出たとき"],
  },
  support: {
    en: ["A customer asks for a refund or compensation", "A customer threatens to escalate publicly or legally"],
    zh: ["客户要求退款或赔偿", "客户表示要公开投诉或走法律途径"],
    zht: ["客戶要求退款或賠償", "客戶表示要公開申訴或走法律途徑"],
    ja: ["返金や補償を求められたとき", "公開での苦情や法的措置を示唆されたとき"],
  },
  legal: {
    en: ["Any indemnity, exclusivity or IP-assignment clause appears", "The counterparty rejects a standard position twice"],
    zh: ["出现赔偿、排他或知识产权归属条款", "对方两次拒绝我方标准条款"],
    zht: ["出現賠償、排他或智慧財產權歸屬條款", "對方兩次拒絕我方標準條款"],
    ja: ["補償・独占・知的財産の帰属条項が現れたとき", "相手方が標準条件を二度拒否したとき"],
  },
  content: {
    en: ["A draft names a competitor or quotes a customer", "A claim would need a statistic we cannot source"],
    zh: ["稿件点名竞争对手或引用了客户原话", "论断需要引用我们无法核实来源的数据"],
    zht: ["稿件點名競爭對手或引用了客戶原話", "論斷需要引用我們無法查證來源的數據"],
    ja: ["競合名や顧客の発言を引用するとき", "出典を確認できない数値を使う必要があるとき"],
  },
  opc: {
    en: ["A payment, refund or write-off is required", "A tax, filing or contractual deadline is at risk"],
    zh: ["需要付款、退款或核销坏账", "税务、申报或合同期限有延误风险"],
    zht: ["需要付款、退款或沖銷呆帳", "稅務、申報或合約期限有延誤風險"],
    ja: ["支払い・返金・貸倒処理が必要なとき", "税務・申告・契約の期限に遅れが生じそうなとき"],
  },
};

/** Success metrics per role. Measurable from the agent's own work, by design. */
export const ROLE_METRIC_DEFAULTS: ByRole<ByLang<TemplateMetric[]>> = {
  prospector: {
    en: [{ label: "Qualified leads per week", target: "≥ 10", unit: "count" }, { label: "Reply rate", target: "≥ 8%", unit: "percent" }],
    zh: [{ label: "每周有效线索数", target: "≥ 10", unit: "count" }, { label: "回复率", target: "≥ 8%", unit: "percent" }],
    zht: [{ label: "每週有效線索數", target: "≥ 10", unit: "count" }, { label: "回覆率", target: "≥ 8%", unit: "percent" }],
    ja: [{ label: "週あたり有効リード数", target: "10件以上", unit: "count" }, { label: "返信率", target: "8%以上", unit: "percent" }],
  },
  salesmkt: {
    en: [{ label: "Campaigns shipped per month", target: "≥ 4", unit: "count" }, { label: "CRM records complete", target: "≥ 95%", unit: "percent" }],
    zh: [{ label: "每月完成的活动数", target: "≥ 4", unit: "count" }, { label: "客户记录完整率", target: "≥ 95%", unit: "percent" }],
    zht: [{ label: "每月完成的活動數", target: "≥ 4", unit: "count" }, { label: "客戶紀錄完整率", target: "≥ 95%", unit: "percent" }],
    ja: [{ label: "月あたり実施施策数", target: "4件以上", unit: "count" }, { label: "顧客レコード整備率", target: "95%以上", unit: "percent" }],
  },
  admin: {
    en: [{ label: "Inbox cleared by", target: "10:00 daily", unit: "duration" }, { label: "Scheduling conflicts", target: "0", unit: "count" }],
    zh: [{ label: "邮箱清空时间", target: "每天 10:00 前", unit: "duration" }, { label: "日程冲突次数", target: "0", unit: "count" }],
    zht: [{ label: "信箱清空時間", target: "每天 10:00 前", unit: "duration" }, { label: "行程衝突次數", target: "0", unit: "count" }],
    ja: [{ label: "受信箱の整理完了", target: "毎日10:00まで", unit: "duration" }, { label: "予定の重複件数", target: "0件", unit: "count" }],
  },
  hr: {
    en: [{ label: "Time to first reply", target: "< 24h", unit: "duration" }, { label: "Screened candidates per week", target: "≥ 15", unit: "count" }],
    zh: [{ label: "首次回复用时", target: "< 24 小时", unit: "duration" }, { label: "每周初筛候选人数", target: "≥ 15", unit: "count" }],
    zht: [{ label: "首次回覆用時", target: "< 24 小時", unit: "duration" }, { label: "每週初篩候選人數", target: "≥ 15", unit: "count" }],
    ja: [{ label: "初回返信までの時間", target: "24時間以内", unit: "duration" }, { label: "週あたり書類選考数", target: "15件以上", unit: "count" }],
  },
  support: {
    en: [{ label: "First response time", target: "< 30min", unit: "duration" }, { label: "Resolved without escalation", target: "≥ 70%", unit: "percent" }],
    zh: [{ label: "首次响应时间", target: "< 30 分钟", unit: "duration" }, { label: "无需上报即解决的比例", target: "≥ 70%", unit: "percent" }],
    zht: [{ label: "首次回應時間", target: "< 30 分鐘", unit: "duration" }, { label: "無需上報即解決的比例", target: "≥ 70%", unit: "percent" }],
    ja: [{ label: "初回応答時間", target: "30分以内", unit: "duration" }, { label: "エスカレーションなしの解決率", target: "70%以上", unit: "percent" }],
  },
  legal: {
    en: [{ label: "Documents reviewed per week", target: "≥ 5", unit: "count" }, { label: "Turnaround per document", target: "< 24h", unit: "duration" }],
    zh: [{ label: "每周审阅文件数", target: "≥ 5", unit: "count" }, { label: "单份文件处理时长", target: "< 24 小时", unit: "duration" }],
    zht: [{ label: "每週審閱文件數", target: "≥ 5", unit: "count" }, { label: "單份文件處理時長", target: "< 24 小時", unit: "duration" }],
    ja: [{ label: "週あたりレビュー件数", target: "5件以上", unit: "count" }, { label: "1件あたりの所要時間", target: "24時間以内", unit: "duration" }],
  },
  content: {
    en: [{ label: "Pieces published per week", target: "≥ 3", unit: "count" }, { label: "Drafts approved unedited", target: "≥ 60%", unit: "percent" }],
    zh: [{ label: "每周发布内容数", target: "≥ 3", unit: "count" }, { label: "无需修改即通过的稿件比例", target: "≥ 60%", unit: "percent" }],
    zht: [{ label: "每週發布內容數", target: "≥ 3", unit: "count" }, { label: "無需修改即通過的稿件比例", target: "≥ 60%", unit: "percent" }],
    ja: [{ label: "週あたり公開本数", target: "3本以上", unit: "count" }, { label: "修正なしで承認された原稿の割合", target: "60%以上", unit: "percent" }],
  },
  opc: {
    en: [{ label: "Invoices overdue > 30 days", target: "0", unit: "count" }, { label: "Books reconciled by", target: "5th of the month", unit: "duration" }],
    zh: [{ label: "逾期超过 30 天的账款", target: "0 笔", unit: "count" }, { label: "对账完成时间", target: "每月 5 日前", unit: "duration" }],
    zht: [{ label: "逾期超過 30 天的帳款", target: "0 筆", unit: "count" }, { label: "對帳完成時間", target: "每月 5 日前", unit: "duration" }],
    ja: [{ label: "30日以上の未回収請求", target: "0件", unit: "count" }, { label: "帳簿の照合完了", target: "毎月5日まで", unit: "duration" }],
  },
};

// ---------------------------------------------------------------------------
// Capabilities and skill affinity
// ---------------------------------------------------------------------------

/**
 * What the deterministic path asks the catalogue for. English by construction:
 * these are retrieval queries against an English catalogue and the user never
 * sees them — the `purpose` string that IS shown is localized separately.
 */
export const ROLE_CAPABILITY_SEEDS: ByRole<CapabilityRequest[]> = {
  prospector: [
    { capability: "search the web for company and contact information", roleKey: "role-1", necessity: "must", tags: ["search", "research"] },
    { capability: "send a templated email", roleKey: "role-1", necessity: "must", tags: ["email", "outreach"] },
    { capability: "read and write records in a CRM", roleKey: "role-1", necessity: "must", tags: ["crm", "sales"] },
    { capability: "read and write a spreadsheet of contacts", roleKey: "role-1", necessity: "nice", tags: ["csv", "spreadsheet"] },
    { capability: "book a meeting on a calendar", roleKey: "role-1", necessity: "nice", tags: ["calendar", "scheduling"] },
  ],
  salesmkt: [
    { capability: "send a templated email campaign", roleKey: "role-1", necessity: "must", tags: ["email", "marketing"] },
    { capability: "read and write records in a CRM", roleKey: "role-1", necessity: "must", tags: ["crm", "sales"] },
    { capability: "summarize campaign results from a spreadsheet", roleKey: "role-1", necessity: "must", tags: ["csv", "analytics"] },
    { capability: "publish a post to a social account", roleKey: "role-1", necessity: "nice", tags: ["social", "publishing"] },
  ],
  admin: [
    { capability: "read an email inbox and draft replies", roleKey: "role-1", necessity: "must", tags: ["email", "inbox"] },
    { capability: "create and move calendar events", roleKey: "role-1", necessity: "must", tags: ["calendar", "scheduling"] },
    { capability: "extract text from a PDF document", roleKey: "role-1", necessity: "must", tags: ["pdf", "documents"] },
    { capability: "organize files into folders", roleKey: "role-1", necessity: "nice", tags: ["files", "storage"] },
    { capability: "search the web for a fact or a form", roleKey: "role-1", necessity: "nice", tags: ["search", "research"] },
  ],
  hr: [
    { capability: "extract structured fields from a resume PDF", roleKey: "role-1", necessity: "must", tags: ["pdf", "documents"] },
    { capability: "send a templated email", roleKey: "role-1", necessity: "must", tags: ["email", "candidates"] },
    { capability: "book a meeting on a calendar", roleKey: "role-1", necessity: "must", tags: ["calendar", "interview"] },
    { capability: "track candidate status in a spreadsheet", roleKey: "role-1", necessity: "nice", tags: ["spreadsheet", "tracking"] },
  ],
  support: [
    { capability: "read an inbox of customer questions", roleKey: "role-1", necessity: "must", tags: ["email", "inbox"] },
    { capability: "search a knowledge base for an answer", roleKey: "role-1", necessity: "must", tags: ["knowledge", "search"] },
    { capability: "send a reply on a messaging channel", roleKey: "role-1", necessity: "must", tags: ["messaging", "chat"] },
    { capability: "summarize recurring issues from a ticket export", roleKey: "role-1", necessity: "nice", tags: ["csv", "analytics"] },
  ],
  legal: [
    { capability: "extract text and clauses from a contract PDF", roleKey: "role-1", necessity: "must", tags: ["pdf", "documents"] },
    { capability: "compare two documents and list the differences", roleKey: "role-1", necessity: "must", tags: ["diff", "documents"] },
    { capability: "write a structured summary document", roleKey: "role-1", necessity: "must", tags: ["documents", "writing"] },
    { capability: "search the web for a public regulation or standard", roleKey: "role-1", necessity: "nice", tags: ["search", "research"] },
  ],
  content: [
    { capability: "research a topic on the web", roleKey: "role-1", necessity: "must", tags: ["search", "research"] },
    { capability: "write and store a long-form draft", roleKey: "role-1", necessity: "must", tags: ["documents", "writing"] },
    { capability: "publish a post to a social account", roleKey: "role-1", necessity: "nice", tags: ["social", "publishing"] },
    { capability: "generate or resize an image for a post", roleKey: "role-1", necessity: "nice", tags: ["image", "media"] },
  ],
  opc: [
    { capability: "read a bank statement or ledger CSV", roleKey: "role-1", necessity: "must", tags: ["csv", "accounting"] },
    { capability: "send a templated email reminder", roleKey: "role-1", necessity: "must", tags: ["email", "invoicing"] },
    { capability: "extract totals and dates from an invoice PDF", roleKey: "role-1", necessity: "must", tags: ["pdf", "invoice"] },
    { capability: "produce a monthly summary spreadsheet", roleKey: "role-1", necessity: "nice", tags: ["spreadsheet", "reporting"] },
    { capability: "track deadlines on a calendar", roleKey: "role-1", necessity: "nice", tags: ["calendar", "deadlines"] },
  ],
};

/** `skill_category` enum members. Never free strings — a typo would score 0.15. */
export const ROLE_CATEGORY_AFFINITY: ByRole<{ primary: string[]; adjacent: string[] }> = {
  prospector: {
    primary: ["crm-sales-marketing", "search-research", "communication"],
    adjacent: ["data-databases", "productivity", "browser-automation"],
  },
  salesmkt: {
    primary: ["crm-sales-marketing", "communication", "media"],
    adjacent: ["search-research", "data-databases", "design-creative"],
  },
  admin: {
    primary: ["productivity", "communication", "documents-files"],
    adjacent: ["search-research", "knowledge-memory", "data-databases"],
  },
  hr: {
    primary: ["documents-files", "communication", "productivity"],
    adjacent: ["knowledge-memory", "data-databases", "search-research"],
  },
  support: {
    primary: ["communication", "knowledge-memory", "productivity"],
    adjacent: ["search-research", "documents-files", "data-databases"],
  },
  legal: {
    primary: ["documents-files", "knowledge-memory", "search-research"],
    adjacent: ["data-databases", "communication", "security-secrets"],
  },
  content: {
    primary: ["media", "search-research", "design-creative"],
    adjacent: ["documents-files", "communication", "knowledge-memory"],
  },
  opc: {
    primary: ["finance-payments", "documents-files", "data-databases"],
    adjacent: ["productivity", "communication", "search-research"],
  },
};

/**
 * The localized `purpose` line the deterministic path writes for a selected
 * skill. `{capability}` is the retrieval query it was chosen for.
 */
export const SKILL_PURPOSE_TEMPLATES: Record<string, ByLang<string>> = {
  "search-research": { en: "Looks things up on the open web so it can {capability}.", zh: "在公开网络上查资料，用于{capability}。", zht: "在公開網路上查資料，用於{capability}。", ja: "公開情報を調べて、{capability}ために使います。" },
  "browser-automation": { en: "Drives a browser page so it can {capability}.", zh: "操作浏览器页面，用于{capability}。", zht: "操作瀏覽器頁面，用於{capability}。", ja: "ブラウザを操作して、{capability}ために使います。" },
  "coding-dev-tools": { en: "Runs developer tooling so it can {capability}.", zh: "调用开发工具，用于{capability}。", zht: "呼叫開發工具，用於{capability}。", ja: "開発ツールを実行して、{capability}ために使います。" },
  "version-control": { en: "Reads and writes a repository so it can {capability}.", zh: "读写代码仓库，用于{capability}。", zht: "讀寫程式碼倉庫，用於{capability}。", ja: "リポジトリを読み書きして、{capability}ために使います。" },
  "devops-cloud": { en: "Talks to cloud infrastructure so it can {capability}.", zh: "对接云端基础设施，用于{capability}。", zht: "對接雲端基礎設施，用於{capability}。", ja: "クラウド基盤と連携して、{capability}ために使います。" },
  "data-databases": { en: "Queries and updates structured data so it can {capability}.", zh: "查询和更新结构化数据，用于{capability}。", zht: "查詢與更新結構化資料，用於{capability}。", ja: "構造化データを参照・更新して、{capability}ために使います。" },
  "documents-files": { en: "Reads and writes documents so it can {capability}.", zh: "读写文档文件，用于{capability}。", zht: "讀寫文件檔案，用於{capability}。", ja: "書類を読み書きして、{capability}ために使います。" },
  communication: { en: "Sends and receives messages so it can {capability}.", zh: "收发消息，用于{capability}。", zht: "收發訊息，用於{capability}。", ja: "メッセージを送受信して、{capability}ために使います。" },
  productivity: { en: "Handles day-to-day tooling so it can {capability}.", zh: "处理日常工具操作，用于{capability}。", zht: "處理日常工具操作，用於{capability}。", ja: "日常の業務ツールを操作して、{capability}ために使います。" },
  "crm-sales-marketing": { en: "Works inside your CRM so it can {capability}.", zh: "在客户关系系统里操作，用于{capability}。", zht: "在客戶關係系統中操作，用於{capability}。", ja: "顧客管理システム上で作業し、{capability}ために使います。" },
  media: { en: "Produces and handles media so it can {capability}.", zh: "生成和处理多媒体内容，用于{capability}。", zht: "產生與處理多媒體內容，用於{capability}。", ja: "メディアを生成・処理して、{capability}ために使います。" },
  "knowledge-memory": { en: "Keeps and retrieves reference material so it can {capability}.", zh: "保存并检索参考资料，用于{capability}。", zht: "保存並檢索參考資料，用於{capability}。", ja: "参考資料を蓄積・検索して、{capability}ために使います。" },
  "agent-meta": { en: "Extends the agent's own tooling so it can {capability}.", zh: "扩展智能体自身的工具，用于{capability}。", zht: "擴充智能體自身的工具，用於{capability}。", ja: "エージェント自身の機能を拡張し、{capability}ために使います。" },
  "security-secrets": { en: "Handles credentials safely so it can {capability}.", zh: "安全地处理凭证，用于{capability}。", zht: "安全地處理憑證，用於{capability}。", ja: "認証情報を安全に扱い、{capability}ために使います。" },
  "finance-payments": { en: "Reads financial records so it can {capability}.", zh: "读取财务记录，用于{capability}。", zht: "讀取財務紀錄，用於{capability}。", ja: "会計データを読み取り、{capability}ために使います。" },
  "design-creative": { en: "Produces visual assets so it can {capability}.", zh: "制作视觉素材，用于{capability}。", zht: "製作視覺素材，用於{capability}。", ja: "ビジュアル素材を作成し、{capability}ために使います。" },
};

/** Used when a catalogue row carries a category this build has never seen. */
export const SKILL_PURPOSE_FALLBACK: ByLang<string> = {
  en: "Selected from your skill catalogue so it can {capability}.",
  zh: "从技能库中挑选，用于{capability}。",
  zht: "從技能庫中挑選，用於{capability}。",
  ja: "スキルカタログから選定し、{capability}ために使います。",
};

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

/** Padding for `boundaries.rules` until every mandatory category is present. */
export const RULE_TEMPLATES: Record<RuleCategory, ByLang<string[]>> = {
  money: {
    en: ["Never move money, pay an invoice or issue a refund without written approval", "Always state the amount and the payee when asking for approval"],
    zh: ["未经书面批准，绝不转账、付款或退款", "请求批准时必须写明金额和收款方"],
    zht: ["未經書面批准，絕不轉帳、付款或退款", "請求批准時必須寫明金額與收款方"],
    ja: ["書面での承認なしに送金・支払い・返金を行わないこと", "承認を求めるときは金額と支払先を必ず明記すること"],
  },
  external_comms: {
    en: ["Never send a message outside the company without approval", "Always draft first and wait for a reply before sending"],
    zh: ["未经批准，绝不向公司外部发送信息", "一律先起草，等确认后再发送"],
    zht: ["未經批准，絕不向公司外部發送訊息", "一律先草擬，等確認後再發送"],
    ja: ["承認なしに社外へメッセージを送らないこと", "必ず下書きを提示し、返答を待ってから送信すること"],
  },
  data: {
    en: ["Never copy customer personal data outside the tools it was given", "Always redact identifiers before writing anything to a log"],
    zh: ["绝不把客户个人信息复制到指定工具之外", "写入日志前必须先脱敏"],
    zht: ["絕不把客戶個人資料複製到指定工具之外", "寫入日誌前必須先去識別化"],
    ja: ["顧客の個人情報を、与えられたツールの外に持ち出さないこと", "ログに書く前に必ず識別子を伏せること"],
  },
  scope: {
    en: ["Stay inside the responsibilities listed above and ask before taking on a new one", "Say plainly when a request is outside what it was hired for"],
    zh: ["只做上面列出的职责，超出范围先询问", "遇到职责之外的请求要直说"],
    zht: ["只做上面列出的職責，超出範圍先詢問", "遇到職責之外的請求要直說"],
    ja: ["上記の職務範囲にとどまり、新しい業務は事前に確認すること", "職務外の依頼はその旨をはっきり伝えること"],
  },
  quality: {
    en: ["Never state a number, date or price it cannot point to a source for", "Say what it does not know rather than filling the gap"],
    zh: ["绝不给出无法指明来源的数字、日期或价格", "不知道就说不知道，不要靠猜"],
    zht: ["絕不給出無法指明來源的數字、日期或價格", "不知道就說不知道，不要靠猜"],
    ja: ["出典を示せない数値・日付・価格を述べないこと", "分からないことは埋めずに、分からないと伝えること"],
  },
  legal: {
    en: ["Never give legal, tax or medical advice; route those questions to a human", "Always mark its own analysis as advisory, not as a decision"],
    zh: ["绝不提供法律、税务或医疗建议，这类问题一律转交给人处理", "自己的分析一律标注为参考意见，而非决定"],
    zht: ["絕不提供法律、稅務或醫療建議，這類問題一律轉交給人處理", "自己的分析一律標註為參考意見，而非決定"],
    ja: ["法務・税務・医療の助言をしないこと。該当する質問は人に回すこと", "自らの分析は決定ではなく参考として示すこと"],
  },
  safety: {
    en: ["Never run a command or install a tool that was not part of its setup", "Stop and escalate on anything irreversible"],
    zh: ["绝不执行或安装配置之外的命令和工具", "遇到不可撤销的操作先停下来上报"],
    zht: ["絕不執行或安裝設定之外的指令與工具", "遇到不可撤銷的操作先停下來上報"],
    ja: ["設定に含まれないコマンドの実行やツールの導入をしないこと", "取り返しのつかない操作の前には必ず止まって報告すること"],
  },
  schedule: {
    en: ["Work inside the configured hours unless the task is marked urgent", "Never send a scheduled message outside working hours"],
    zh: ["除非标记为紧急，只在设定的工作时段内工作", "绝不在非工作时段发送定时消息"],
    zht: ["除非標記為緊急，只在設定的工作時段內工作", "絕不在非工作時段發送定時訊息"],
    ja: ["緊急指定がない限り、設定された稼働時間内で作業すること", "稼働時間外に定期送信を行わないこと"],
  },
};

/** Standard six. Field NAMES to strip from logs, never values. */
export const DEFAULT_REDACT_FIELDS = [
  "card_number",
  "cvv",
  "bank_account",
  "id_number",
  "passport_number",
  "date_of_birth",
];

/**
 * Work where being wrong is not recoverable. All four languages in one
 * alternation, because a brief may mix scripts freely.
 */
export const LEGAL_MEDICAL_FINANCIAL_RE =
  /(legal advice|lawyer|attorney|litigation|contract review|tax return|medical|diagnos|prescription|patient|invest(ment|ing) advice|securities|portfolio|法律意見|法律意见|律师|律師|訴訟|诉讼|税务|稅務|报税|報稅|医疗|醫療|诊断|診斷|处方|處方|投资建议|投資建議|证券|證券|法務|弁護士|訴訟|税務|確定申告|医療|診断|処方|投資助言|証券)/i;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** A context seed before assembly gives it a key and the linter a `containsPii`. */
export interface ContextSeed {
  kind: "pasted_text" | "file_request" | "url";
  title: string;
  purpose: string;
  required: boolean;
  body: string | null;
  placeholder: string | null;
}

/**
 * The universal pair every role gets, before its own seeds. Both are blanks
 * for the user to fill: a generated body that looks like real content is the
 * worst outcome of this section.
 */
export const UNIVERSAL_CONTEXT_SEEDS: ByLang<ContextSeed[]> = {
  en: [
    { kind: "pasted_text", title: "Tone of voice", purpose: "So its writing sounds like you rather than like a template.", required: true, body: "Two things I have written that sound right:\n\n1. ____\n\n2. ____\n\nWords to avoid: ____", placeholder: "Paste two short pieces you have written" },
    { kind: "file_request", title: "Your playbook or SOP", purpose: "The house rules it should follow when a situation is not obvious.", required: false, body: null, placeholder: "Upload a PDF, Markdown or text file" },
  ],
  zh: [
    { kind: "pasted_text", title: "语气示例", purpose: "让它写出来的东西像你本人，而不像模板。", required: true, body: "两段我写过、语气合适的文字：\n\n1. ____\n\n2. ____\n\n不要用的词：____", placeholder: "粘贴两段你自己写过的短文字" },
    { kind: "file_request", title: "工作手册或标准流程", purpose: "遇到没有明确规定的情况时，它该遵循的内部规则。", required: false, body: null, placeholder: "上传 PDF、Markdown 或纯文本文件" },
  ],
  zht: [
    { kind: "pasted_text", title: "語氣範例", purpose: "讓它寫出來的東西像你本人，而不像範本。", required: true, body: "兩段我寫過、語氣合適的文字：\n\n1. ____\n\n2. ____\n\n不要用的詞：____", placeholder: "貼上兩段你自己寫過的短文字" },
    { kind: "file_request", title: "工作手冊或標準流程", purpose: "遇到沒有明確規定的情況時，它該遵循的內部規則。", required: false, body: null, placeholder: "上傳 PDF、Markdown 或純文字檔案" },
  ],
  ja: [
    { kind: "pasted_text", title: "文体のサンプル", purpose: "テンプレートではなく、あなたらしい書き方に寄せるためです。", required: true, body: "自分が書いた、雰囲気の合う文章を2つ：\n\n1. ____\n\n2. ____\n\n使ってほしくない言葉：____", placeholder: "自分で書いた短い文章を2つ貼り付けてください" },
    { kind: "file_request", title: "業務マニュアル・手順書", purpose: "判断に迷う場面で従うべき社内ルールです。", required: false, body: null, placeholder: "PDF・Markdown・テキストをアップロードしてください" },
  ],
};

export const ROLE_CONTEXT_SEEDS: ByRole<ByLang<ContextSeed[]>> = {
  prospector: {
    en: [{ kind: "pasted_text", title: "Who counts as a good lead", purpose: "The profile it filters against before it contacts anyone.", required: true, body: "Industry: ____\nCompany size: ____\nRegion: ____\nNever contact: ____", placeholder: "Describe your ideal customer in four lines" }],
    zh: [{ kind: "pasted_text", title: "什么样的客户算合格线索", purpose: "它在联系任何人之前用来筛选的标准。", required: true, body: "行业：____\n公司规模：____\n地区：____\n绝不联系：____", placeholder: "用四行写清楚你的目标客户" }],
    zht: [{ kind: "pasted_text", title: "什麼樣的客戶算合格線索", purpose: "它在聯絡任何人之前用來篩選的標準。", required: true, body: "產業：____\n公司規模：____\n地區：____\n絕不聯絡：____", placeholder: "用四行寫清楚你的目標客戶" }],
    ja: [{ kind: "pasted_text", title: "良いリードの条件", purpose: "誰かに連絡する前に照合する基準です。", required: true, body: "業種：____\n従業員規模：____\n地域：____\n連絡してはいけない相手：____", placeholder: "理想の顧客像を4行で書いてください" }],
  },
  salesmkt: {
    en: [{ kind: "pasted_text", title: "Offer and positioning", purpose: "What it is allowed to promise, in your words.", required: true, body: "What we sell: ____\nWho it is for: ____\nWhat we never claim: ____", placeholder: "Three lines on what you sell and to whom" }],
    zh: [{ kind: "pasted_text", title: "产品定位与卖点", purpose: "它在文案里可以承诺的范围，用你的说法。", required: true, body: "我们卖什么：____\n卖给谁：____\n绝不宣称：____", placeholder: "三行写清楚你卖什么、卖给谁" }],
    zht: [{ kind: "pasted_text", title: "產品定位與賣點", purpose: "它在文案裡可以承諾的範圍，用你的說法。", required: true, body: "我們賣什麼：____\n賣給誰：____\n絕不宣稱：____", placeholder: "三行寫清楚你賣什麼、賣給誰" }],
    ja: [{ kind: "pasted_text", title: "提供価値とポジショニング", purpose: "訴求として言ってよい範囲を、あなたの言葉で決めます。", required: true, body: "提供しているもの：____\n対象顧客：____\n言ってはいけないこと：____", placeholder: "何を誰に売っているかを3行で" }],
  },
  admin: {
    en: [{ kind: "pasted_text", title: "How you want your day arranged", purpose: "Meeting hours, focus blocks, and what may never be booked over.", required: true, body: "Meetings only between: ____\nProtected time: ____\nAlways decline: ____", placeholder: "Three lines about your working day" }],
    zh: [{ kind: "pasted_text", title: "你希望日程怎么安排", purpose: "会议时段、专注时段，以及绝不能被占用的时间。", required: true, body: "只在这个时段安排会议：____\n必须保留的时间：____\n一律拒绝：____", placeholder: "用三行说明你的一天怎么安排" }],
    zht: [{ kind: "pasted_text", title: "你希望行程怎麼安排", purpose: "會議時段、專注時段，以及絕不能被占用的時間。", required: true, body: "只在這個時段安排會議：____\n必須保留的時間：____\n一律拒絕：____", placeholder: "用三行說明你的一天怎麼安排" }],
    ja: [{ kind: "pasted_text", title: "一日の組み立て方", purpose: "会議可能な時間帯、集中時間、絶対に予定を入れない時間です。", required: true, body: "会議を入れてよい時間帯：____\n確保したい時間：____\n必ず断るもの：____", placeholder: "働き方について3行で書いてください" }],
  },
  hr: {
    en: [{ kind: "file_request", title: "The job description", purpose: "The rubric it screens every applicant against.", required: true, body: null, placeholder: "Upload the open role's description" }],
    zh: [{ kind: "file_request", title: "职位描述", purpose: "它筛选每位应聘者时依据的标准。", required: true, body: null, placeholder: "上传在招职位的职位说明书" }],
    zht: [{ kind: "file_request", title: "職位說明", purpose: "它篩選每位應徵者時依據的標準。", required: true, body: null, placeholder: "上傳在招職位的職位說明書" }],
    ja: [{ kind: "file_request", title: "募集要項", purpose: "応募者を評価する基準になります。", required: true, body: null, placeholder: "募集中のポジションの要項をアップロード" }],
  },
  support: {
    en: [{ kind: "file_request", title: "Your help-centre answers", purpose: "It answers from this, never from memory.", required: true, body: null, placeholder: "Upload your FAQ or macros export" }],
    zh: [{ kind: "file_request", title: "帮助中心的标准答案", purpose: "它只依据这份材料作答，不凭印象。", required: true, body: null, placeholder: "上传常见问题或话术库导出文件" }],
    zht: [{ kind: "file_request", title: "說明中心的標準答案", purpose: "它只依據這份資料作答，不憑印象。", required: true, body: null, placeholder: "上傳常見問題或話術庫匯出檔" }],
    ja: [{ kind: "file_request", title: "ヘルプセンターの回答集", purpose: "記憶ではなく、この資料に基づいて回答します。", required: true, body: null, placeholder: "FAQ や定型文のエクスポートをアップロード" }],
  },
  legal: {
    en: [{ kind: "file_request", title: "Your standard positions", purpose: "The clauses it compares every incoming document against.", required: true, body: null, placeholder: "Upload your template agreement or playbook" }],
    zh: [{ kind: "file_request", title: "公司标准条款", purpose: "它比对每一份来件所依据的条款基准。", required: true, body: null, placeholder: "上传标准合同模板或审阅手册" }],
    zht: [{ kind: "file_request", title: "公司標準條款", purpose: "它比對每一份來件所依據的條款基準。", required: true, body: null, placeholder: "上傳標準合約範本或審閱手冊" }],
    ja: [{ kind: "file_request", title: "自社の標準条件", purpose: "受領した文書を比較する基準になります。", required: true, body: null, placeholder: "契約ひな形やレビュー基準をアップロード" }],
  },
  content: {
    en: [{ kind: "pasted_text", title: "Topics and audience", purpose: "What to write about, and who is reading.", required: true, body: "Audience: ____\nTopics we own: ____\nTopics to avoid: ____", placeholder: "Three lines about your readers and your topics" }],
    zh: [{ kind: "pasted_text", title: "选题方向与读者", purpose: "写什么，以及写给谁看。", required: true, body: "读者是谁：____\n我们要占的选题：____\n不碰的选题：____", placeholder: "三行说明你的读者和选题范围" }],
    zht: [{ kind: "pasted_text", title: "選題方向與讀者", purpose: "寫什麼，以及寫給誰看。", required: true, body: "讀者是誰：____\n我們要占的選題：____\n不碰的選題：____", placeholder: "三行說明你的讀者與選題範圍" }],
    ja: [{ kind: "pasted_text", title: "テーマと読者", purpose: "何について、誰に向けて書くかを決めます。", required: true, body: "読者：____\n扱うテーマ：____\n避けるテーマ：____", placeholder: "読者とテーマについて3行で" }],
  },
  opc: {
    en: [
      { kind: "pasted_text", title: "Your payment terms", purpose: "When an invoice counts as late, and how hard to push.", required: true, body: "Payment due: ____ days\nFirst reminder after: ____ days\nStop chasing and tell me at: ____ days", placeholder: "Three lines about your invoicing terms" },
      { kind: "file_request", title: "Client and invoice list", purpose: "Who is owed what, so it can tell a chase from a duplicate.", required: false, body: null, placeholder: "Upload a CSV export from your accounting tool" },
    ],
    zh: [
      { kind: "pasted_text", title: "你的账期规则", purpose: "多久算逾期，以及催收力度到什么程度。", required: true, body: "账期：____ 天\n第一次提醒：逾期 ____ 天后\n停止催收并告诉我：逾期 ____ 天后", placeholder: "三行写清楚你的账期和催收节奏" },
      { kind: "file_request", title: "客户与账单清单", purpose: "谁欠了多少，避免重复催同一笔。", required: false, body: null, placeholder: "上传记账工具导出的 CSV" },
    ],
    zht: [
      { kind: "pasted_text", title: "你的帳期規則", purpose: "多久算逾期，以及催收力道到什麼程度。", required: true, body: "帳期：____ 天\n第一次提醒：逾期 ____ 天後\n停止催收並告訴我：逾期 ____ 天後", placeholder: "三行寫清楚你的帳期與催收節奏" },
      { kind: "file_request", title: "客戶與帳單清單", purpose: "誰欠了多少，避免重複催同一筆。", required: false, body: null, placeholder: "上傳記帳工具匯出的 CSV" },
    ],
    ja: [
      { kind: "pasted_text", title: "支払条件", purpose: "いつから遅延とみなすか、どこまで督促するかを決めます。", required: true, body: "支払期限：____ 日\n最初の督促：期限超過 ____ 日後\n督促を止めて報告：期限超過 ____ 日後", placeholder: "支払条件と督促の間隔を3行で" },
      { kind: "file_request", title: "取引先・請求一覧", purpose: "誰にいくら未収かを把握し、二重督促を防ぎます。", required: false, body: null, placeholder: "会計ツールから書き出した CSV をアップロード" },
    ],
  },
};

// ---------------------------------------------------------------------------
// Cadence
// ---------------------------------------------------------------------------

export interface CadenceSeed {
  cron: string;
  payloadKind: SchedulePayloadKind;
  title: ByLang<string>;
}

/**
 * One or two schedules per role, for the brief that named no time at all. A
 * template with no cadence is a worse default than a conservative daily one the
 * user can delete in a click.
 */
export const ROLE_CADENCE: ByRole<CadenceSeed[]> = {
  prospector: [
    { cron: "0 9 * * 1-5", payloadKind: "task", title: { en: "Morning prospecting run", zh: "每日上午开发客户", zht: "每日上午開發客戶", ja: "午前の新規開拓" } },
    { cron: "0 17 * * 5", payloadKind: "digest", title: { en: "Weekly pipeline summary", zh: "每周线索汇总", zht: "每週線索彙總", ja: "週次パイプライン報告" } },
  ],
  salesmkt: [
    { cron: "0 17 * * 5", payloadKind: "digest", title: { en: "Weekly campaign report", zh: "每周活动效果汇报", zht: "每週活動成效回報", ja: "週次キャンペーン報告" } },
  ],
  admin: [
    { cron: "0 7 * * 1-5", payloadKind: "digest", title: { en: "Morning brief", zh: "每日晨间简报", zht: "每日晨間簡報", ja: "朝のブリーフィング" } },
    { cron: "0 18 * * 1-5", payloadKind: "digest", title: { en: "End-of-day digest", zh: "每日收工汇总", zht: "每日收工彙總", ja: "終業時のまとめ" } },
  ],
  hr: [
    { cron: "0 9 * * 1-5", payloadKind: "task", title: { en: "Daily application review", zh: "每日应聘材料筛选", zht: "每日應徵資料篩選", ja: "毎日の応募書類チェック" } },
  ],
  support: [
    { cron: "0 9 * * 1-5", payloadKind: "check", title: { en: "Unanswered ticket sweep", zh: "未回复工单巡检", zht: "未回覆工單巡檢", ja: "未対応チケットの点検" } },
    { cron: "0 17 * * 5", payloadKind: "digest", title: { en: "Weekly issue summary", zh: "每周问题汇总", zht: "每週問題彙總", ja: "週次の問い合わせ傾向" } },
  ],
  legal: [
    { cron: "0 9 * * 1-5", payloadKind: "check", title: { en: "New document check", zh: "每日待审文件检查", zht: "每日待審文件檢查", ja: "新規文書の確認" } },
  ],
  content: [
    { cron: "0 10 * * 1", payloadKind: "task", title: { en: "Weekly content plan", zh: "每周内容排期", zht: "每週內容排程", ja: "週次コンテンツ計画" } },
  ],
  opc: [
    { cron: "0 9 1 * *", payloadKind: "task", title: { en: "Monthly invoicing run", zh: "每月开票", zht: "每月開票", ja: "月次の請求書発行" } },
    { cron: "0 9 * * 1", payloadKind: "check", title: { en: "Overdue invoice chase", zh: "每周催收逾期账款", zht: "每週催收逾期帳款", ja: "週次の未回収督促" } },
  ],
};

/** What the agent is told to do when a seeded schedule fires. `{role}` is the job title. */
export const SCHEDULE_PROMPT_TEMPLATES: Record<SchedulePayloadKind, ByLang<(roleTitle: string) => string>> = {
  task: {
    en: (r) => `Do the next batch of work for the ${r} job described in your brief. Work through what is outstanding, prepare anything that needs approval, and stop before anything irreversible.`,
    zh: (r) => `按照岗位说明推进「${r}」这份工作的下一批任务：处理待办事项，把需要审批的内容准备好，遇到不可撤销的操作先停下来。`,
    zht: (r) => `依照職務說明推進「${r}」這份工作的下一批任務：處理待辦事項，把需要審批的內容準備好，遇到不可撤銷的操作先停下來。`,
    ja: (r) => `ブリーフに書かれた「${r}」の業務を次の一巡分だけ進めてください。未処理を片づけ、承認が必要なものを用意し、取り返しのつかない操作の前で止まってください。`,
  },
  digest: {
    en: (r) => `Summarize what you did as ${r} since the last digest: what got done, what is waiting on someone, and what needs a decision. Keep it under 200 words.`,
    zh: (r) => `汇总你作为「${r}」自上次汇报以来的工作：完成了什么、在等谁、有什么需要决策。控制在 200 字以内。`,
    zht: (r) => `彙總你作為「${r}」自上次回報以來的工作：完成了什麼、在等誰、有什麼需要決策。控制在 200 字以內。`,
    ja: (r) => `前回の報告以降、「${r}」として行ったことをまとめてください。完了したこと、誰かの返答待ちのこと、判断が必要なこと。200字以内で。`,
  },
  check: {
    en: (r) => `Check for anything in the ${r} queue that has been waiting too long or has slipped past its deadline, and report only the items that need attention.`,
    zh: (r) => `检查「${r}」相关的待办中是否有积压过久或已过期的事项，只汇报需要处理的部分。`,
    zht: (r) => `檢查「${r}」相關的待辦中是否有積壓過久或已逾期的事項，只回報需要處理的部分。`,
    ja: (r) => `「${r}」の待ち行列に滞留や期限超過がないか確認し、対応が必要な件だけ報告してください。`,
  },
  reminder: {
    en: (r) => `Remind me about the ${r} item that is due, with the one piece of context I need to act on it.`,
    zh: (r) => `提醒我「${r}」相关的到期事项，并附上处理它所需的一条关键信息。`,
    zht: (r) => `提醒我「${r}」相關的到期事項，並附上處理它所需的一條關鍵資訊。`,
    ja: (r) => `期限が来た「${r}」の件を、対応に必要な情報を一つ添えて知らせてください。`,
  },
};

// ---------------------------------------------------------------------------
// Harness and intake
// ---------------------------------------------------------------------------

/**
 * The conservative default tool surface per harness, and the floor the MODEL
 * path starts from too. Shell and Docker start closed everywhere: a template is
 * a default for someone who has not thought about it yet.
 */
export const HARNESS_TOOL_FLOOR: Record<Harness, AgentSettings["tools"]> = {
  openclaw: { shell: false, files: true, browser: true, docker: false, code: false },
  hermes: { shell: false, files: true, browser: true, docker: false, code: false },
  codex: { shell: false, files: true, browser: false, docker: false, code: true },
  deepseek: { shell: false, files: true, browser: false, docker: false, code: false },
};

/** The other half of the `tooThin` test: words that carry no intent. */
export const STOPWORDS: Record<Lang, Set<string>> = {
  en: new Set([
    "a", "an", "the", "and", "or", "but", "to", "for", "of", "in", "on", "at", "by", "with",
    "me", "my", "i", "we", "our", "us", "you", "your", "it", "its", "this", "that", "these",
    "need", "needs", "want", "wants", "help", "please", "some", "stuff", "thing", "things",
    "someone", "somebody", "can", "could", "would", "should", "do", "does", "make", "get",
    "is", "are", "am", "be", "been", "have", "has", "had", "will", "just", "really", "very",
  ]),
  zh: new Set(["的", "了", "我", "我们", "你", "您", "他", "一个", "一些", "东西", "帮忙", "帮我", "需要", "想要", "可以", "能够", "请", "麻烦", "事情", "处理", "一下"]),
  zht: new Set(["的", "了", "我", "我們", "你", "您", "他", "一個", "一些", "東西", "幫忙", "幫我", "需要", "想要", "可以", "能夠", "請", "麻煩", "事情", "處理", "一下"]),
  ja: new Set(["の", "を", "に", "は", "が", "と", "で", "も", "から", "まで", "私", "僕", "うち", "こと", "もの", "など", "ほしい", "したい", "お願い", "手伝って", "ちょっと", "いろいろ", "する", "やる"]),
};

/** Words in the brief that switch on a local-execution tool. Never shell or docker. */
export const TOOL_HINTS: Array<{ tool: "files" | "browser" | "code"; re: RegExp }> = [
  { tool: "files", re: /(file|folder|spreadsheet|csv|pdf|document|attachment|文件|檔案|表格|资料|資料|附件|ファイル|書類|添付)/i },
  { tool: "browser", re: /(browse|website|web page|scrape|crawl|online form|网页|網頁|网站|網站|抓取|表单|表單|ブラウザ|サイト|ウェブ)/i },
  { tool: "code", re: /(script|code|python|sql|calculate|compute|脚本|腳本|代码|程式碼|计算|計算|スクリプト|コード|集計)/i },
];

/** Channel words matched verbatim in the brief. */
export const CHANNEL_HINTS: Array<{ channel: string; re: RegExp }> = [
  { channel: "telegram", re: /(telegram|电报|電報|テレグラム)/i },
  { channel: "whatsapp", re: /(whats\s?app|ワッツアップ)/i },
  { channel: "wechat", re: /(wechat|微信|ウィーチャット)/i },
  { channel: "line", re: /(\bline\b|ライン公式)/i },
  { channel: "slack", re: /(slack|スラック)/i },
  { channel: "email", re: /(e-?mail|inbox|邮件|郵件|邮箱|信箱|メール|受信箱)/i },
  { channel: "feishu", re: /(feishu|飞书|飛書)/i },
  { channel: "dingtalk", re: /(dingtalk|钉钉|釘釘)/i },
  { channel: "wecom", re: /(wecom|企业微信|企業微信)/i },
];
