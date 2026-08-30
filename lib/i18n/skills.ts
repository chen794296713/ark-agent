/**
 * Copy for the skills catalogue.
 *
 * Written natively per language, not translated word for word. Two things are
 * deliberately NOT in here:
 *
 *  - a skill's `name`, `summary` and `description`. Those are upstream text in
 *    the publisher's own language; machine-translating an attacker-controlled
 *    string puts one more transformation between what was published and what
 *    the operator reads before they decide whether to trust it.
 *  - product names. A 日本語 user searching for "Hermes" or "ClawHub" must find
 *    it, so harness and source names stay in Latin script everywhere.
 *
 * `RISK_SIGNAL_TEXT` is keyed on `RiskSignal.code` from `lib/skills/safety.ts`.
 * A code with no entry renders as itself rather than as an empty line — an
 * unexplained red band is worse than an untranslated one.
 */
import type { Lang } from "@/lib/types";

export interface SkillsDict {
  heading: string;
  subheading: string;

  searchPlaceholder: string;
  filterCategory: string;
  filterRisk: string;
  filterHarness: string;
  filterSource: string;
  filterFormat: string;
  filterAll: string;
  sortLabel: string;
  sortPopularity: string;
  sortRecent: string;
  sortName: string;
  sortRisk: string;
  verifiedOnly: string;
  showHighRisk: string;
  showHighRiskHint: string;
  clearFilters: string;
  /** "{n} hidden by the risk filter" */
  hiddenByRisk: string;
  hiddenByVerification: string;
  ignoredFilters: string;

  loading: string;
  loadError: string;
  retry: string;
  resultCount: string;
  prevPage: string;
  nextPage: string;
  pageOf: string;

  emptyCatalogTitle: string;
  emptyCatalogBody: string;
  noResultsTitle: string;
  noResultsBody: string;

  riskLow: string;
  riskMedium: string;
  riskHigh: string;
  riskLabel: string;
  blastRadius: string;

  formatAgentSkill: string;
  formatMcpServer: string;
  formatSkillPack: string;

  verifiedBadge: string;
  publisherUnverified: string;
  publisherUnverifiedHint: string;
  licenseLabel: string;
  licenseUnverified: string;
  updatedLabel: string;
  neverUpdated: string;
  starsLabel: string;
  downloadsLabel: string;
  addedBadge: string;

  compatHeading: string;
  compatSupported: string;
  compatUnsupported: string;
  basisVerified: string;
  basisDeclared: string;
  basisInferred: string;
  basisUnknown: string;
  basisInferredHint: string;

  detailOverview: string;
  detailRequirements: string;
  detailPermissions: string;
  detailRisk: string;
  detailInstall: string;
  detailVersions: string;
  detailScanner: string;
  scannerNone: string;
  vendorsFlagged: string;
  viewSource: string;
  attributionNote: string;
  deprecatedNotice: string;
  close: string;

  permNetwork: string;
  permFilesystem: string;
  permTools: string;
  permCredentials: string;
  permHosts: string;
  permIrreversible: string;
  permNone: string;

  reqBins: string;
  reqEnv: string;
  reqConfig: string;
  reqOs: string;
  tagsLabel: string;
  versionLabel: string;
  /** Shown where the drawer would otherwise print an empty rubric. */
  noSignals: string;
  /**
   * `risk_scored_at IS NULL` — a seeded row the scorer has not run over yet.
   * Saying so is the difference between a rating and a claim.
   */
  assessedFromMetadata: string;

  syncUnavailable: string;
  syncNotConfigured: string;
}

const en: SkillsDict = {
  heading: "Skills",
  subheading: "Capabilities you can attach to an agent. Every entry is scored before it is listed.",
  searchPlaceholder: "Search skills…",
  filterCategory: "Category",
  filterRisk: "Risk",
  filterHarness: "Harness",
  filterSource: "Source",
  filterFormat: "Format",
  filterAll: "All",
  sortLabel: "Sort",
  sortPopularity: "Most used",
  sortRecent: "Recently updated",
  sortName: "Name",
  sortRisk: "Lowest risk",
  verifiedOnly: "Reviewed only",
  showHighRisk: "Show high-risk skills",
  showHighRiskHint: "High-risk skills hold a credential, write outside the workspace, or act irreversibly.",
  clearFilters: "Clear filters",
  hiddenByRisk: "{n} high-risk skills hidden",
  hiddenByVerification: "{n} unreviewed skills hidden",
  ignoredFilters: "Some filters in this link are no longer recognised and were ignored.",
  loading: "LOADING CATALOGUE…",
  loadError: "Could not load the catalogue.",
  retry: "Try again",
  resultCount: "{n} skills",
  prevPage: "Previous",
  nextPage: "Next",
  pageOf: "Page {page} of {pages}",
  emptyCatalogTitle: "The catalogue is empty",
  emptyCatalogBody:
    "No skill source has been synced yet. An administrator runs the sync; until then there is nothing to attach.",
  noResultsTitle: "Nothing matches",
  noResultsBody: "Try a broader search, or clear a filter.",
  riskLow: "Low",
  riskMedium: "Medium",
  riskHigh: "High",
  riskLabel: "RISK",
  blastRadius: "Blast radius",
  formatAgentSkill: "Skill",
  formatMcpServer: "MCP server",
  formatSkillPack: "Skill pack",
  verifiedBadge: "Reviewed",
  publisherUnverified: "Unverified publisher",
  publisherUnverifiedHint:
    "The publisher handle is not the vendor of the service this skill integrates. Read the source before attaching.",
  licenseLabel: "LICENCE",
  licenseUnverified: "not confirmed",
  updatedLabel: "UPDATED",
  neverUpdated: "unknown",
  starsLabel: "STARS",
  downloadsLabel: "INSTALLS",
  addedBadge: "Added",
  compatHeading: "Runs on",
  compatSupported: "Supported",
  compatUnsupported: "Not supported",
  basisVerified: "we installed it",
  basisDeclared: "publisher states",
  basisInferred: "derived from requirements",
  basisUnknown: "untested",
  basisInferredHint: "Derived from the declared requirements. Nobody has run it there.",
  detailOverview: "Overview",
  detailRequirements: "Requirements",
  detailPermissions: "Permissions",
  detailRisk: "Why this rating",
  detailInstall: "Install",
  detailVersions: "Versions",
  detailScanner: "Scanner",
  scannerNone: "No upstream scanner covers this source.",
  vendorsFlagged: "{flagged} / {total} vendors flagged",
  viewSource: "View source",
  attributionNote: "Listed from a third-party directory. Listing is not endorsement.",
  deprecatedNotice: "This skill is deprecated upstream.",
  close: "Close",
  permNetwork: "Network",
  permFilesystem: "Filesystem",
  permTools: "Tools",
  permCredentials: "Credentials",
  permHosts: "Hosts",
  permIrreversible: "Can take actions that cannot be undone",
  permNone: "none declared",
  syncUnavailable: "Sync is unavailable right now.",
  syncNotConfigured: "No skill source is configured, so there is nothing to sync.",
  reqBins: "Binaries",
  reqEnv: "Environment variables",
  reqConfig: "Host capabilities",
  reqOs: "Operating systems",
  tagsLabel: "TAGS",
  versionLabel: "VERSION",
  noSignals: "No rubric triggers were recorded for this skill.",
  assessedFromMetadata: "Assessed from metadata; the scorer has not run over this entry yet.",
};

const zh: SkillsDict = {
  heading: "技能库",
  subheading: "可以挂载到智能体上的能力。每一项在上架前都经过风险评分。",
  searchPlaceholder: "搜索技能…",
  filterCategory: "分类",
  filterRisk: "风险",
  filterHarness: "运行环境",
  filterSource: "来源",
  filterFormat: "形态",
  filterAll: "全部",
  sortLabel: "排序",
  sortPopularity: "使用最多",
  sortRecent: "最近更新",
  sortName: "名称",
  sortRisk: "风险最低",
  verifiedOnly: "仅看已审核",
  showHighRisk: "显示高风险技能",
  showHighRiskHint: "高风险技能会持有凭据、写入工作区之外，或执行无法撤销的操作。",
  clearFilters: "清除筛选",
  hiddenByRisk: "已隐藏 {n} 个高风险技能",
  hiddenByVerification: "已隐藏 {n} 个未审核技能",
  ignoredFilters: "此链接中的部分筛选条件已不再有效，已被忽略。",
  loading: "正在加载技能库…",
  loadError: "技能库加载失败。",
  retry: "重试",
  resultCount: "共 {n} 个技能",
  prevPage: "上一页",
  nextPage: "下一页",
  pageOf: "第 {page} / {pages} 页",
  emptyCatalogTitle: "技能库为空",
  emptyCatalogBody: "尚未同步任何技能来源。同步由管理员发起；在那之前没有可挂载的技能。",
  noResultsTitle: "没有匹配结果",
  noResultsBody: "试试更宽泛的关键词，或去掉一个筛选条件。",
  riskLow: "低",
  riskMedium: "中",
  riskHigh: "高",
  riskLabel: "风险",
  blastRadius: "影响范围",
  formatAgentSkill: "技能",
  formatMcpServer: "MCP 服务",
  formatSkillPack: "技能包",
  verifiedBadge: "已审核",
  publisherUnverified: "发布者未核实",
  publisherUnverifiedHint: "发布者账号并非该技能所对接服务的官方厂商。挂载前请先查看源码。",
  licenseLabel: "许可证",
  licenseUnverified: "未确认",
  updatedLabel: "更新于",
  neverUpdated: "未知",
  starsLabel: "星标",
  downloadsLabel: "安装量",
  addedBadge: "已添加",
  compatHeading: "可运行于",
  compatSupported: "支持",
  compatUnsupported: "不支持",
  basisVerified: "我们已实测安装",
  basisDeclared: "发布者声明",
  basisInferred: "由依赖推导",
  basisUnknown: "未验证",
  basisInferredHint: "根据声明的依赖推导得出，尚无人在该环境实际运行过。",
  detailOverview: "概览",
  detailRequirements: "运行依赖",
  detailPermissions: "权限",
  detailRisk: "评级依据",
  detailInstall: "安装方式",
  detailVersions: "版本",
  detailScanner: "安全扫描",
  scannerNone: "该来源没有对应的上游扫描服务。",
  vendorsFlagged: "{total} 家厂商中有 {flagged} 家判定为可疑",
  viewSource: "查看源码",
  attributionNote: "内容来自第三方目录，收录不代表我们的背书。",
  deprecatedNotice: "该技能已被上游标记为弃用。",
  close: "关闭",
  permNetwork: "网络",
  permFilesystem: "文件系统",
  permTools: "工具",
  permCredentials: "凭据",
  permHosts: "访问域名",
  permIrreversible: "可执行无法撤销的操作",
  permNone: "未声明",
  syncUnavailable: "同步服务当前不可用。",
  syncNotConfigured: "尚未配置任何技能来源，无内容可同步。",
  reqBins: "可执行文件",
  reqEnv: "环境变量",
  reqConfig: "宿主能力",
  reqOs: "操作系统",
  tagsLabel: "标签",
  versionLabel: "版本",
  noSignals: "该技能没有记录到任何评分触发项。",
  assessedFromMetadata: "该评级依据元数据得出，评分程序尚未对此条目运行。",
};

const zht: SkillsDict = {
  heading: "技能庫",
  subheading: "可掛載到智能體上的能力。每一項在上架前都經過風險評分。",
  searchPlaceholder: "搜尋技能…",
  filterCategory: "分類",
  filterRisk: "風險",
  filterHarness: "執行環境",
  filterSource: "來源",
  filterFormat: "形態",
  filterAll: "全部",
  sortLabel: "排序",
  sortPopularity: "使用最多",
  sortRecent: "最近更新",
  sortName: "名稱",
  sortRisk: "風險最低",
  verifiedOnly: "僅看已審核",
  showHighRisk: "顯示高風險技能",
  showHighRiskHint: "高風險技能會持有憑證、寫入工作區之外，或執行無法復原的操作。",
  clearFilters: "清除篩選",
  hiddenByRisk: "已隱藏 {n} 個高風險技能",
  hiddenByVerification: "已隱藏 {n} 個未審核技能",
  ignoredFilters: "此連結中的部分篩選條件已失效，已被忽略。",
  loading: "正在載入技能庫…",
  loadError: "技能庫載入失敗。",
  retry: "重試",
  resultCount: "共 {n} 個技能",
  prevPage: "上一頁",
  nextPage: "下一頁",
  pageOf: "第 {page} / {pages} 頁",
  emptyCatalogTitle: "技能庫是空的",
  emptyCatalogBody: "尚未同步任何技能來源。同步由管理員發起；在那之前沒有可掛載的技能。",
  noResultsTitle: "沒有符合的結果",
  noResultsBody: "換個更寬鬆的關鍵字，或拿掉一個篩選條件。",
  riskLow: "低",
  riskMedium: "中",
  riskHigh: "高",
  riskLabel: "風險",
  blastRadius: "影響範圍",
  formatAgentSkill: "技能",
  formatMcpServer: "MCP 伺服器",
  formatSkillPack: "技能包",
  verifiedBadge: "已審核",
  publisherUnverified: "發布者未核實",
  publisherUnverifiedHint: "發布者帳號並非該技能所串接服務的官方廠商。掛載前請先查看原始碼。",
  licenseLabel: "授權",
  licenseUnverified: "未確認",
  updatedLabel: "更新於",
  neverUpdated: "未知",
  starsLabel: "星標",
  downloadsLabel: "安裝數",
  addedBadge: "已加入",
  compatHeading: "可執行於",
  compatSupported: "支援",
  compatUnsupported: "不支援",
  basisVerified: "我們已實測安裝",
  basisDeclared: "發布者聲明",
  basisInferred: "由相依推導",
  basisUnknown: "未驗證",
  basisInferredHint: "依據聲明的相依條件推導而得，尚無人在該環境實際執行過。",
  detailOverview: "概覽",
  detailRequirements: "執行相依",
  detailPermissions: "權限",
  detailRisk: "評級依據",
  detailInstall: "安裝方式",
  detailVersions: "版本",
  detailScanner: "安全掃描",
  scannerNone: "此來源沒有對應的上游掃描服務。",
  vendorsFlagged: "{total} 家廠商中有 {flagged} 家判定為可疑",
  viewSource: "查看原始碼",
  attributionNote: "內容來自第三方目錄，收錄不代表我們背書。",
  deprecatedNotice: "此技能已被上游標記為淘汰。",
  close: "關閉",
  permNetwork: "網路",
  permFilesystem: "檔案系統",
  permTools: "工具",
  permCredentials: "憑證",
  permHosts: "存取網域",
  permIrreversible: "可執行無法復原的操作",
  permNone: "未聲明",
  syncUnavailable: "同步服務目前無法使用。",
  syncNotConfigured: "尚未設定任何技能來源，沒有內容可同步。",
  reqBins: "執行檔",
  reqEnv: "環境變數",
  reqConfig: "宿主能力",
  reqOs: "作業系統",
  tagsLabel: "標籤",
  versionLabel: "版本",
  noSignals: "此技能沒有記錄到任何評分觸發項。",
  assessedFromMetadata: "此評級依據中繼資料得出，評分程式尚未對此項目執行。",
};

const ja: SkillsDict = {
  heading: "スキル",
  subheading: "エージェントに追加できる能力です。掲載前にすべてリスク評価を行っています。",
  searchPlaceholder: "スキルを検索…",
  filterCategory: "カテゴリ",
  filterRisk: "リスク",
  filterHarness: "実行環境",
  filterSource: "提供元",
  filterFormat: "形式",
  filterAll: "すべて",
  sortLabel: "並び替え",
  sortPopularity: "利用が多い順",
  sortRecent: "更新が新しい順",
  sortName: "名前順",
  sortRisk: "リスクが低い順",
  verifiedOnly: "審査済みのみ",
  showHighRisk: "高リスクのスキルも表示",
  showHighRiskHint: "高リスクのスキルは認証情報を扱う、ワークスペース外に書き込む、または取り消せない操作を行います。",
  clearFilters: "条件をクリア",
  hiddenByRisk: "高リスクのスキルを {n} 件非表示にしています",
  hiddenByVerification: "未審査のスキルを {n} 件非表示にしています",
  ignoredFilters: "このリンクに含まれる一部の絞り込み条件は現在無効なため、無視しました。",
  loading: "カタログを読み込み中…",
  loadError: "カタログを読み込めませんでした。",
  retry: "再試行",
  resultCount: "{n} 件のスキル",
  prevPage: "前へ",
  nextPage: "次へ",
  pageOf: "{pages} ページ中 {page} ページ目",
  emptyCatalogTitle: "カタログは空です",
  emptyCatalogBody:
    "スキルの提供元がまだ同期されていません。同期は管理者が実行します。それまで追加できるスキルはありません。",
  noResultsTitle: "該当するスキルがありません",
  noResultsBody: "キーワードを広げるか、絞り込みを一つ外してみてください。",
  riskLow: "低",
  riskMedium: "中",
  riskHigh: "高",
  riskLabel: "リスク",
  blastRadius: "影響範囲",
  formatAgentSkill: "スキル",
  formatMcpServer: "MCP サーバー",
  formatSkillPack: "スキルパック",
  verifiedBadge: "審査済み",
  publisherUnverified: "発行者は未確認",
  publisherUnverifiedHint:
    "発行者アカウントは、このスキルが連携するサービスの提供元ではありません。追加する前にソースを確認してください。",
  licenseLabel: "ライセンス",
  licenseUnverified: "未確認",
  updatedLabel: "更新",
  neverUpdated: "不明",
  starsLabel: "スター",
  downloadsLabel: "インストール",
  addedBadge: "追加済み",
  compatHeading: "対応環境",
  compatSupported: "対応",
  compatUnsupported: "非対応",
  basisVerified: "当社で導入を確認",
  basisDeclared: "発行者の申告",
  basisInferred: "依存関係から推定",
  basisUnknown: "未検証",
  basisInferredHint: "申告された依存関係からの推定です。その環境で実際に動かした人はいません。",
  detailOverview: "概要",
  detailRequirements: "必要な環境",
  detailPermissions: "権限",
  detailRisk: "評価の根拠",
  detailInstall: "インストール方法",
  detailVersions: "バージョン",
  detailScanner: "スキャン結果",
  scannerNone: "この提供元に対応する上流スキャナーはありません。",
  vendorsFlagged: "{total} 社中 {flagged} 社が検出",
  viewSource: "ソースを見る",
  attributionNote: "第三者ディレクトリからの掲載です。掲載は推奨を意味しません。",
  deprecatedNotice: "このスキルは提供元で非推奨とされています。",
  close: "閉じる",
  permNetwork: "ネットワーク",
  permFilesystem: "ファイルシステム",
  permTools: "ツール",
  permCredentials: "認証情報",
  permHosts: "接続先ホスト",
  permIrreversible: "取り消せない操作を実行できます",
  permNone: "申告なし",
  syncUnavailable: "同期は現在利用できません。",
  syncNotConfigured: "スキルの提供元が未設定のため、同期する対象がありません。",
  reqBins: "必要なバイナリ",
  reqEnv: "環境変数",
  reqConfig: "ホスト機能",
  reqOs: "対応OS",
  tagsLabel: "タグ",
  versionLabel: "バージョン",
  noSignals: "このスキルでは評価の判定材料が記録されていません。",
  assessedFromMetadata: "メタデータからの暫定評価です。スコアラーはまだこの項目を処理していません。",
};

export const skills: Record<Lang, SkillsDict> = { en, zh, zht, ja };

/** `{n}` / `{page}` / `{flagged}` interpolation. No library, no markup, no HTML. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    Object.hasOwn(values, k) ? String(values[k]) : m,
  );
}

// ---------------------------------------------------------------------------
// Risk signals — keyed on RiskSignal.code from lib/skills/safety.ts
// ---------------------------------------------------------------------------

/**
 * One sentence per rubric trigger, so the drawer explains a band instead of
 * asserting one. The `cap_*` codes are the base capability tier; everything
 * else is a modifier or a floor.
 *
 * Injection codes describe what was matched, never what the text said: the
 * matched bytes are attacker-controlled and are deliberately not recorded.
 */
const RISK_SIGNAL_EN: Record<string, string> = {
  cap_inert: "Reads and writes nothing outside its own prompt",
  cap_local_read: "Reads files in the agent's workspace",
  cap_public_read: "Makes outbound network requests",
  cap_local_write: "Runs commands or writes files in the workspace",
  cap_host_read: "Reads files outside the agent's workspace",
  cap_service_write: "Holds a credential and can act on that account",
  cap_broad_credential: "Holds a credential alongside shell, host or unbounded network access",
  cap_host_write: "Writes files outside the agent's workspace",
  cap_irreversible: "Can take an action nobody can undo",
  vendor_publisher: "Published by the vendor of the service it integrates",
  scanner_clean: "Upstream scanner returned a clean verdict",
  provenance_resolved: "Artifact resolved to a specific upstream commit",
  provenance_unavailable: "No provenance for the artifact",
  osi_license: "Carries a recognised open-source licence",
  widely_adopted: "Widely adopted across the ecosystem",
  scanner_review: "Upstream scanner asked for human review",
  license_unresolved: "Ships inline bytes under an unresolved licence",
  unreviewed_bundle: "A pack of sub-skills nobody enumerated",
  unmaintained: "No upstream change in over a year",
  metadata_incoherent: "Reads environment variables it never declared",
  undeclared_host: "Contacts hosts outside its declared integration",
  new_publisher: "New publisher with almost no history",
  suspicious_slug: "Name matches a known mass-upload campaign pattern",
  arbitrary_network: "Can fetch from any address on the internet",
  unpinned_install: "Installs third-party packages at run time",
  medium_floor_credential: "Never rated below medium: it holds a credential",
  medium_floor_arbitrary_network: "Never rated below medium: unbounded network reach",
  high_floor_tag: "Always rated high for this capability",
  high_floor_irreversible: "Always rated high: the action cannot be undone",
  llm_reviewer_raised: "An automated reviewer raised this rating",
  scanner_fail: "Upstream scanner returned a failing verdict",
  virustotal_flagged: "Flagged by antivirus vendors",
  denylisted_publisher: "Publisher is on our denylist",
  injection_directive: "Contains text instructing the agent to ignore its operator",
  exfiltration: "Reads a credential file and sends it off the machine",
  override: "Contains an instruction-override phrase",
  conceal: "Contains an instruction to hide activity from the user",
  disable: "Contains an instruction to disable safety tooling",
  secrets: "References a credential file path",
  role_shift: "Contains role-reassignment phrasing",
  b64_blob: "Contains a long encoded blob",
  hidden_css: "Contains styling that hides text",
  invisible: "Contains invisible or direction-reversing characters",
};

const RISK_SIGNAL_ZH: Record<string, string> = {
  cap_inert: "不读取也不写入自身提示词以外的任何内容",
  cap_local_read: "读取智能体工作区内的文件",
  cap_public_read: "会发起对外网络请求",
  cap_local_write: "在工作区内执行命令或写入文件",
  cap_host_read: "读取工作区之外的文件",
  cap_service_write: "持有凭据，可代表该账号执行操作",
  cap_broad_credential: "持有凭据，同时具备 shell、主机或不受限的网络访问权限",
  cap_host_write: "写入工作区之外的文件",
  cap_irreversible: "可执行任何人都无法撤销的操作",
  vendor_publisher: "由其对接服务的官方厂商发布",
  scanner_clean: "上游扫描结果为无异常",
  provenance_resolved: "构件已对应到具体的上游提交",
  provenance_unavailable: "构件没有可追溯的来源",
  osi_license: "采用受认可的开源许可证",
  widely_adopted: "在生态中被广泛采用",
  scanner_review: "上游扫描要求人工复核",
  license_unresolved: "以未明确许可证的形式内置分发代码",
  unreviewed_bundle: "包含未逐一审阅的子技能合集",
  unmaintained: "上游超过一年没有任何更新",
  metadata_incoherent: "读取了未声明的环境变量",
  undeclared_host: "访问了声明范围之外的域名",
  new_publisher: "新发布者，几乎没有历史记录",
  suspicious_slug: "命名符合已知的批量投放攻击特征",
  arbitrary_network: "可访问互联网上的任意地址",
  unpinned_install: "在运行时安装第三方依赖包",
  medium_floor_credential: "因持有凭据，评级不低于中等",
  medium_floor_arbitrary_network: "因网络访问不受限，评级不低于中等",
  high_floor_tag: "该能力一律按高风险评级",
  high_floor_irreversible: "操作无法撤销，一律按高风险评级",
  llm_reviewer_raised: "自动复核程序上调了该评级",
  scanner_fail: "上游扫描判定未通过",
  virustotal_flagged: "被杀毒厂商标记",
  denylisted_publisher: "发布者在我们的封禁名单中",
  injection_directive: "含有指示智能体忽略操作者的文本",
  exfiltration: "读取凭据文件并向外发送",
  override: "含有覆盖既有指令的措辞",
  conceal: "含有要求向用户隐瞒行为的指令",
  disable: "含有要求关闭安全工具的指令",
  secrets: "提及了凭据文件路径",
  role_shift: "含有重设角色的措辞",
  b64_blob: "含有超长编码数据块",
  hidden_css: "含有用于隐藏文字的样式",
  invisible: "含有不可见字符或文字方向翻转字符",
};

const RISK_SIGNAL_ZHT: Record<string, string> = {
  cap_inert: "不讀取也不寫入自身提示詞以外的任何內容",
  cap_local_read: "讀取智能體工作區內的檔案",
  cap_public_read: "會發起對外網路請求",
  cap_local_write: "在工作區內執行指令或寫入檔案",
  cap_host_read: "讀取工作區之外的檔案",
  cap_service_write: "持有憑證，可代表該帳號執行操作",
  cap_broad_credential: "持有憑證，同時具備 shell、主機或不受限的網路存取權限",
  cap_host_write: "寫入工作區之外的檔案",
  cap_irreversible: "可執行任何人都無法復原的操作",
  vendor_publisher: "由其串接服務的官方廠商發布",
  scanner_clean: "上游掃描結果為無異常",
  provenance_resolved: "構件已對應到具體的上游提交",
  provenance_unavailable: "構件沒有可追溯的來源",
  osi_license: "採用受認可的開源授權",
  widely_adopted: "在生態系中被廣泛採用",
  scanner_review: "上游掃描要求人工複核",
  license_unresolved: "以未明確授權的形式內建散布程式碼",
  unreviewed_bundle: "包含未逐一審閱的子技能合集",
  unmaintained: "上游超過一年沒有任何更新",
  metadata_incoherent: "讀取了未聲明的環境變數",
  undeclared_host: "存取了聲明範圍之外的網域",
  new_publisher: "新發布者，幾乎沒有歷史紀錄",
  suspicious_slug: "命名符合已知的大量投放攻擊特徵",
  arbitrary_network: "可存取網際網路上的任意位址",
  unpinned_install: "在執行時安裝第三方套件",
  medium_floor_credential: "因持有憑證，評級不低於中等",
  medium_floor_arbitrary_network: "因網路存取不受限，評級不低於中等",
  high_floor_tag: "該能力一律以高風險評級",
  high_floor_irreversible: "操作無法復原，一律以高風險評級",
  llm_reviewer_raised: "自動複核程式調高了此評級",
  scanner_fail: "上游掃描判定未通過",
  virustotal_flagged: "被防毒廠商標記",
  denylisted_publisher: "發布者在我們的封鎖名單中",
  injection_directive: "含有指示智能體忽略操作者的文字",
  exfiltration: "讀取憑證檔案並向外傳送",
  override: "含有覆寫既有指令的措辭",
  conceal: "含有要求向使用者隱瞞行為的指令",
  disable: "含有要求關閉安全工具的指令",
  secrets: "提及了憑證檔案路徑",
  role_shift: "含有重設角色的措辭",
  b64_blob: "含有超長編碼資料塊",
  hidden_css: "含有用於隱藏文字的樣式",
  invisible: "含有不可見字元或文字方向翻轉字元",
};

const RISK_SIGNAL_JA: Record<string, string> = {
  cap_inert: "自身のプロンプト以外は読み書きしません",
  cap_local_read: "エージェントのワークスペース内のファイルを読み取ります",
  cap_public_read: "外部へのネットワーク通信を行います",
  cap_local_write: "ワークスペース内でコマンドを実行し、ファイルを書き込みます",
  cap_host_read: "ワークスペース外のファイルを読み取ります",
  cap_service_write: "認証情報を保持し、そのアカウントとして操作できます",
  cap_broad_credential: "認証情報に加え、シェル・ホスト・無制限のネットワーク権限を持ちます",
  cap_host_write: "ワークスペース外のファイルに書き込みます",
  cap_irreversible: "誰にも取り消せない操作を実行できます",
  vendor_publisher: "連携先サービスの提供元が公開しています",
  scanner_clean: "上流スキャナーの判定は異常なしです",
  provenance_resolved: "成果物が特定の上流コミットに紐づいています",
  provenance_unavailable: "成果物の出所をたどれません",
  osi_license: "認知されたオープンソースライセンスです",
  widely_adopted: "エコシステム全体で広く使われています",
  scanner_review: "上流スキャナーが人手での確認を求めています",
  license_unresolved: "ライセンス不明のままバイトを同梱しています",
  unreviewed_bundle: "内訳が確認されていないサブスキルの詰め合わせです",
  unmaintained: "上流で1年以上更新がありません",
  metadata_incoherent: "申告のない環境変数を読み取っています",
  undeclared_host: "申告範囲外のホストへ接続しています",
  new_publisher: "履歴のほとんどない新規の発行者です",
  suspicious_slug: "既知の大量アップロード攻撃と同じ命名パターンです",
  arbitrary_network: "インターネット上の任意のアドレスへ接続できます",
  unpinned_install: "実行時に第三者パッケージをインストールします",
  medium_floor_credential: "認証情報を保持するため、評価は中未満になりません",
  medium_floor_arbitrary_network: "ネットワークが無制限のため、評価は中未満になりません",
  high_floor_tag: "この能力は常に高リスクとして扱います",
  high_floor_irreversible: "取り消せない操作のため、常に高リスクとして扱います",
  llm_reviewer_raised: "自動レビューがこの評価を引き上げました",
  scanner_fail: "上流スキャナーの判定は不合格です",
  virustotal_flagged: "アンチウイルス各社が検出しています",
  denylisted_publisher: "発行者が当社の拒否リストに含まれています",
  injection_directive: "運用者の指示を無視するよう促す文言が含まれます",
  exfiltration: "認証情報ファイルを読み取り、外部へ送信します",
  override: "既存の指示を上書きする文言が含まれます",
  conceal: "利用者に活動を隠すよう促す指示が含まれます",
  disable: "安全機構を無効化するよう促す指示が含まれます",
  secrets: "認証情報ファイルのパスに言及しています",
  role_shift: "役割を置き換える文言が含まれます",
  b64_blob: "長大なエンコード済みデータが含まれます",
  hidden_css: "文字を隠すためのスタイルが含まれます",
  invisible: "不可視文字または文字方向を反転させる文字が含まれます",
};

export const RISK_SIGNAL_TEXT: Record<Lang, Record<string, string>> = {
  en: RISK_SIGNAL_EN,
  zh: RISK_SIGNAL_ZH,
  zht: RISK_SIGNAL_ZHT,
  ja: RISK_SIGNAL_JA,
};

/**
 * `Object.hasOwn`, never a bare index: these codes arrive from a jsonb column
 * and `constructor` would otherwise resolve against Object.prototype and return
 * a function where the drawer expects a sentence.
 */
export function riskSignalText(code: string, lang: Lang): string {
  const table = RISK_SIGNAL_TEXT[lang];
  return Object.hasOwn(table, code) ? table[code] : code;
}
