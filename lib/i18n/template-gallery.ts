/**
 * Copy for the template gallery (`/dashboard/templates`) and its drawer.
 *
 * Two vocabularies are deliberately carried here rather than imported:
 *  - `categories` labels `TemplateCategory` from lib/atg/types — the TEMPLATE
 *    taxonomy, which is not the 16-value `skill_category` the skill repository
 *    filters on. The two describe different objects and must never share a map.
 *  - `autonomy` / `tone` label the same vocabulary `lib/agent-settings` uses,
 *    because the drawer shows a template's proposed behaviour and a materialised
 *    agent's settings screen must not read differently from the template that
 *    produced it.
 */
import type { Lang } from "@/lib/types";
import type { TemplateCategory } from "@/lib/atg/types";
import type { PlanTier } from "@/lib/pricing";
import type { Autonomy, Tone } from "@/lib/agent-settings";

/** Sort keys sent to `GET /api/templates?sort=`. A fixed allowlist: an
 *  arbitrary column name in a query param is an injection surface, so the
 *  client never invents one. */
export const TEMPLATE_SORTS = ["used", "new", "updated", "name"] as const;
export type TemplateSort = (typeof TEMPLATE_SORTS)[number];

export const TEMPLATE_SCOPES = ["all", "workspace", "public"] as const;
export type TemplateScope = (typeof TEMPLATE_SCOPES)[number];

/** The `agent_templates.difficulty` vocabulary. The column is `varchar(16)`,
 *  so this list is also the allowlist a stored value is narrowed against; see
 *  components/template/derive.ts. */
export const TEMPLATE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type TemplateLevel = (typeof TEMPLATE_LEVELS)[number];

export interface TemplateGalleryDict {
  // ---- header ----
  heading: string;
  subheading: string;
  buildWithAi: string;

  // ---- control bar ----
  searchPlaceholder: string;
  searchLabel: string;
  filterHarness: string;
  filterCategory: string;
  filterLevel: string;
  filterPlan: string;
  filterScope: string;
  filterSort: string;
  anyHarness: string;
  anyCategory: string;
  anyLevel: string;
  anyPlan: string;
  clearAll: string;
  resultCount: (n: number, sortLabel: string) => string;
  resultCountFiltered: (shown: number, total: number) => string;

  scopes: Record<TemplateScope, string>;
  sorts: Record<TemplateSort, string>;
  levels: Record<TemplateLevel, string>;
  categories: Record<TemplateCategory, string>;
  plans: Record<PlanTier, string>;
  langNames: Record<Lang, string>;

  // ---- view toggle ----
  viewLabel: string;
  viewCard: string;
  viewList: string;

  // ---- card ----
  labelLevel: string;
  labelSetup: string;
  labelUsedBy: string;
  labelTags: string;
  setupMinutes: (m: number) => string;
  buildsOut: (agents: number, skills: number, schedules: number) => string;
  noSkills: string;
  noTags: string;
  writtenIn: (language: string) => string;
  badgePublic: string;
  badgeYours: string;
  needsReview: string;
  needsReviewHint: string;
  start: string;
  preview: string;
  upgradeToStart: string;
  requiresPlan: (plan: string) => string;
  estimateHint: string;

  // ---- list ----
  colTemplate: string;
  colCategory: string;
  colHarness: string;
  colLevel: string;
  colAgents: string;
  colSkills: string;
  colSchedules: string;
  colUsedBy: string;
  colUpdated: string;
  colActions: string;
  sortByColumn: (col: string) => string;
  rowMenu: string;
  menuPreview: string;
  menuStart: string;
  menuDuplicate: string;
  menuCopyId: string;
  /** Feedback for "Copy template id". */
  menuCopied: string;
  /** Feedback for the fork — a DIFFERENT act from copying an id to the clipboard. */
  menuDuplicated: string;
  menuDuplicateFailed: string;
  /** `navigator.clipboard` is undefined outside a secure context and rejects
   *  when the permission is denied; a silent no-op reads as a broken button. */
  menuCopyFailed: string;

  // ---- drawer ----
  drawerClose: string;
  drawerLoading: string;
  drawerError: string;
  sectionRoles: string;
  sectionAgents: string;
  sectionSkills: string;
  sectionRules: string;
  sectionContext: string;
  sectionSchedules: string;
  countRoles: (n: number) => string;
  countAgents: (n: number) => string;
  countSkills: (n: number) => string;
  countRules: (n: number) => string;
  countContext: (n: number) => string;
  countSchedules: (n: number) => string;
  emptySection: string;
  moreItems: (n: number) => string;
  autonomy: Record<Autonomy, string>;
  tone: Record<Tone, string>;
  risk: Record<"low" | "medium" | "high", string>;
  ruleSeverity: Record<"hard" | "soft", string>;
  contextKind: Record<"pasted_text" | "file_request" | "url", string>;
  requiredMark: string;
  approvalAbove: (amount: string) => string;
  scheduleUnreadable: string;
  provenanceTitle: string;
  origins: Record<"generated" | "manual" | "seeded" | "forked", string>;
  provenanceLine: (origin: string, updated: string) => string;
  slugLine: (slug: string) => string;
  estimatedCredits: (n: number) => string;
  thirdPartyNotice: string;
  warningsTitle: (n: number) => string;
  startFromTemplate: string;
  duplicateAndEdit: string;

  // ---- states ----
  loadingLabel: string;
  errorTitle: string;
  errorBody: string;
  errorFilters: string;
  tryAgain: string;
  emptyTitle: string;
  emptyBody: string;
  emptyCta: string;
  filteredTitle: string;
  filteredBody: string;
  filteredAlt: string;
  clearFilters: string;
  workspaceEmptyTitle: string;
  workspaceEmptyBody: string;
  workspaceEmptyLink: string;
  /** `?page=99` on a two-page gallery: there ARE templates, just not here. */
  pageEmptyTitle: string;
  pageEmptyBody: string;
  firstPage: string;

  // ---- pagination ----
  prevPage: string;
  nextPage: string;
  pageOf: (page: number, pages: number) => string;
}

const en: TemplateGalleryDict = {
  heading: "Templates",
  subheading: "Start from a proven setup, or describe what you need.",
  buildWithAi: "Build with AI",

  searchPlaceholder: "Search templates…",
  searchLabel: "Search templates",
  filterHarness: "Harness",
  filterCategory: "Category",
  filterLevel: "Level",
  filterPlan: "Plan",
  filterScope: "Scope",
  filterSort: "Sort",
  anyHarness: "Any harness",
  anyCategory: "Any category",
  anyLevel: "Any level",
  anyPlan: "Any plan",
  clearAll: "Clear all",
  resultCount: (n, s) => `${n} templates · sorted by ${s}`,
  resultCountFiltered: (shown, total) => `${shown} of ${total} shown`,

  scopes: { all: "All", workspace: "Your workspace", public: "Public" },
  sorts: { used: "Most used", new: "Newest", updated: "Recently updated", name: "A–Z" },
  levels: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" },
  categories: {
    sales: "Sales",
    marketing: "Marketing",
    support: "Support",
    operations: "Operations",
    finance: "Finance",
    research: "Research",
    engineering: "Engineering",
    hr: "People & HR",
    personal: "Personal",
    other: "Other",
  },
  plans: { associate: "Associate", professional: "Professional", director: "Director" },
  langNames: {
    en: "English",
    zh: "Simplified Chinese",
    zht: "Traditional Chinese",
    ja: "Japanese",
  },

  viewLabel: "View",
  viewCard: "Card view",
  viewList: "List view",

  labelLevel: "LEVEL",
  labelSetup: "SETUP",
  labelUsedBy: "USED BY",
  labelTags: "TAGS",
  setupMinutes: (m) => `~${m} min`,
  buildsOut: (a, s, sc) =>
    `Builds ${a} agent${a === 1 ? "" : "s"}, installs ${s} skill${s === 1 ? "" : "s"}, sets ${sc} schedule${sc === 1 ? "" : "s"}.`,
  noSkills: "No skills — this agent works from its brief alone.",
  noTags: "No tags",
  writtenIn: (language) => `Written in ${language}`,
  badgePublic: "PUBLIC",
  badgeYours: "YOURS",
  needsReview: "NEEDS REVIEW",
  needsReviewHint: "This template has open warnings and cannot be started until they are resolved.",
  start: "Start from this template",
  preview: "Preview",
  upgradeToStart: "Upgrade to start",
  requiresPlan: (plan) => `Requires ${plan}`,
  estimateHint: "Setup time is an estimate from the template's size.",

  colTemplate: "TEMPLATE",
  colCategory: "CATEGORY",
  colHarness: "HARNESS",
  colLevel: "LEVEL",
  colAgents: "AGENTS",
  colSkills: "SKILLS",
  colSchedules: "SCHED",
  colUsedBy: "USED BY",
  colUpdated: "UPDATED",
  colActions: "Actions",
  sortByColumn: (col) => `Sort by ${col}`,
  rowMenu: "Row actions",
  menuPreview: "Preview",
  menuStart: "Start from this",
  menuDuplicate: "Duplicate to my workspace",
  menuCopyId: "Copy template id",
  menuCopied: "Copied",
  menuDuplicated: "Duplicated to your workspace",
  menuDuplicateFailed: "Could not duplicate this template.",
  menuCopyFailed: "Could not reach the clipboard.",

  drawerClose: "Close",
  drawerLoading: "Loading template…",
  drawerError: "Could not load this template.",
  sectionRoles: "ROLES",
  sectionAgents: "AGENTS",
  sectionSkills: "SKILLS",
  sectionRules: "RULES & BOUNDARIES",
  sectionContext: "CONTEXT",
  sectionSchedules: "REMINDERS & SCHEDULERS",
  countRoles: (n) => `${n} role${n === 1 ? "" : "s"}`,
  countAgents: (n) => `${n} agent${n === 1 ? "" : "s"}`,
  countSkills: (n) => `${n} skill${n === 1 ? "" : "s"}`,
  countRules: (n) => `${n} rule${n === 1 ? "" : "s"}`,
  countContext: (n) => `${n} item${n === 1 ? "" : "s"}`,
  countSchedules: (n) => `${n} schedule${n === 1 ? "" : "s"}`,
  emptySection: "Nothing here.",
  moreItems: (n) => `… ${n} more`,
  autonomy: { suggest: "Suggests only", ask: "Asks first", auto: "Acts on its own" },
  tone: {
    professional: "Professional",
    friendly: "Friendly",
    concise: "Concise",
    formal: "Formal",
    playful: "Playful",
  },
  risk: { low: "Low", medium: "Medium", high: "High" },
  ruleSeverity: { hard: "Must", soft: "Should" },
  contextKind: { pasted_text: "text", file_request: "file", url: "link" },
  requiredMark: "required",
  approvalAbove: (amount) => `Escalates above ${amount}`,
  scheduleUnreadable: "Schedule could not be read",
  provenanceTitle: "PROVENANCE",
  origins: {
    generated: "AI-generated",
    manual: "Hand-written",
    seeded: "Built in",
    forked: "Forked",
  },
  provenanceLine: (origin, updated) => `${origin} · updated ${updated}`,
  slugLine: (slug) => `slug ${slug}`,
  estimatedCredits: (n) => `~${n} credits / month`,
  thirdPartyNotice:
    "Written by another workspace. Read the rules and context before you start from it.",
  warningsTitle: (n) => `${n} open warning${n === 1 ? "" : "s"}`,
  startFromTemplate: "Start from this template",
  duplicateAndEdit: "Duplicate & edit",

  loadingLabel: "Loading templates…",
  errorTitle: "Could not load templates",
  errorBody: "The template service did not answer. Nothing has been changed.",
  errorFilters: "One of these filters was rejected. Clear them and try again.",
  tryAgain: "Try again",
  emptyTitle: "No templates yet",
  emptyBody:
    "Describe the job in your own words and we will draft the whole setup — role, skills, rules and schedule.",
  emptyCta: "Build with AI",
  filteredTitle: "No templates match these filters",
  filteredBody: "Widen the search, or clear the filters to see everything again.",
  filteredAlt: "Or describe what you need",
  clearFilters: "Clear filters",
  workspaceEmptyTitle: "You haven't saved a template yet",
  workspaceEmptyBody:
    "Any agent you build can be saved as a template from its configuration page.",
  workspaceEmptyLink: "Go to your fleet",
  pageEmptyTitle: "Nothing on this page",
  pageEmptyBody: "The gallery is shorter than the page you asked for.",
  firstPage: "Back to the first page",

  prevPage: "Previous",
  nextPage: "Next",
  pageOf: (page, pages) => `Page ${page} of ${pages}`,
};

const zh: TemplateGalleryDict = {
  heading: "模板库",
  subheading: "从一套验证过的配置开始，或者直接描述你的需求。",
  buildWithAi: "用 AI 生成",

  searchPlaceholder: "搜索模板…",
  searchLabel: "搜索模板",
  filterHarness: "运行框架",
  filterCategory: "分类",
  filterLevel: "难度",
  filterPlan: "套餐",
  filterScope: "范围",
  filterSort: "排序",
  anyHarness: "全部框架",
  anyCategory: "全部分类",
  anyLevel: "全部难度",
  anyPlan: "全部套餐",
  clearAll: "全部清除",
  resultCount: (n, s) => `${n} 个模板 · 按${s}排序`,
  resultCountFiltered: (shown, total) => `已显示 ${shown} / ${total}`,

  scopes: { all: "全部", workspace: "本工作区", public: "公开" },
  sorts: { used: "使用最多", new: "最新发布", updated: "最近更新", name: "名称 A–Z" },
  levels: { beginner: "入门", intermediate: "进阶", advanced: "高级" },
  categories: {
    sales: "销售",
    marketing: "市场营销",
    support: "客户支持",
    operations: "运营",
    finance: "财务",
    research: "研究调研",
    engineering: "工程研发",
    hr: "人力资源",
    personal: "个人事务",
    other: "其他",
  },
  plans: { associate: "助理版", professional: "专业版", director: "总监版" },
  langNames: { en: "英文", zh: "简体中文", zht: "繁体中文", ja: "日文" },

  viewLabel: "视图",
  viewCard: "卡片视图",
  viewList: "列表视图",

  labelLevel: "难度",
  labelSetup: "搭建耗时",
  labelUsedBy: "使用次数",
  labelTags: "标签",
  setupMinutes: (m) => `约 ${m} 分钟`,
  buildsOut: (a, s, sc) => `创建 ${a} 个智能体，安装 ${s} 项技能，设置 ${sc} 条定时任务。`,
  noSkills: "不装技能——这个智能体只按简报工作。",
  noTags: "暂无标签",
  writtenIn: (language) => `以${language}撰写`,
  badgePublic: "公开",
  badgeYours: "本工作区",
  needsReview: "待确认",
  needsReviewHint: "此模板仍有未处理的告警，处理完才能使用。",
  start: "使用此模板",
  preview: "预览",
  upgradeToStart: "升级后可用",
  requiresPlan: (plan) => `需要${plan}`,
  estimateHint: "搭建耗时是按模板规模估算的。",

  colTemplate: "模板",
  colCategory: "分类",
  colHarness: "运行框架",
  colLevel: "难度",
  colAgents: "智能体",
  colSkills: "技能",
  colSchedules: "定时",
  colUsedBy: "使用次数",
  colUpdated: "更新时间",
  colActions: "操作",
  sortByColumn: (col) => `按${col}排序`,
  rowMenu: "行操作",
  menuPreview: "预览",
  menuStart: "使用此模板",
  menuDuplicate: "复制到我的工作区",
  menuCopyId: "复制模板 ID",
  menuCopied: "已复制",
  menuDuplicated: "已复制到你的工作区",
  menuDuplicateFailed: "复制这个模板失败了。",
  menuCopyFailed: "无法访问剪贴板。",

  drawerClose: "关闭",
  drawerLoading: "正在加载模板…",
  drawerError: "无法加载此模板。",
  sectionRoles: "角色",
  sectionAgents: "智能体",
  sectionSkills: "技能",
  sectionRules: "规则与边界",
  sectionContext: "上下文资料",
  sectionSchedules: "提醒与定时任务",
  countRoles: (n) => `${n} 个角色`,
  countAgents: (n) => `${n} 个智能体`,
  countSkills: (n) => `${n} 项技能`,
  countRules: (n) => `${n} 条规则`,
  countContext: (n) => `${n} 项资料`,
  countSchedules: (n) => `${n} 条定时任务`,
  emptySection: "暂无内容。",
  moreItems: (n) => `…还有 ${n} 项`,
  autonomy: { suggest: "仅提出建议", ask: "先询问再执行", auto: "自主执行" },
  tone: {
    professional: "专业",
    friendly: "亲切",
    concise: "简洁",
    formal: "正式",
    playful: "活泼",
  },
  risk: { low: "低", medium: "中", high: "高" },
  ruleSeverity: { hard: "必须", soft: "建议" },
  contextKind: { pasted_text: "文本", file_request: "文件", url: "链接" },
  requiredMark: "必填",
  approvalAbove: (amount) => `超过 ${amount} 需要上报审批`,
  scheduleUnreadable: "无法解析该定时规则",
  provenanceTitle: "来源",
  origins: {
    generated: "AI 生成",
    manual: "手工编写",
    seeded: "平台内置",
    forked: "复制自其他模板",
  },
  provenanceLine: (origin, updated) => `${origin} · ${updated}更新`,
  slugLine: (slug) => `标识 ${slug}`,
  estimatedCredits: (n) => `每月约 ${n} 额度`,
  thirdPartyNotice: "此模板由其他工作区编写。使用前请先读完它的规则与上下文资料。",
  warningsTitle: (n) => `${n} 条未处理的告警`,
  startFromTemplate: "使用此模板",
  duplicateAndEdit: "复制后编辑",

  loadingLabel: "正在加载模板…",
  errorTitle: "无法加载模板",
  errorBody: "模板服务没有响应，你的数据未做任何改动。",
  errorFilters: "其中一个筛选条件不被接受，请清除后重试。",
  tryAgain: "重试",
  emptyTitle: "还没有模板",
  emptyBody: "用你自己的话描述这份工作，我们会把角色、技能、规则和排程一次拟好。",
  emptyCta: "用 AI 生成",
  filteredTitle: "没有符合这些条件的模板",
  filteredBody: "放宽搜索条件，或清除筛选重新查看全部模板。",
  filteredAlt: "或者直接描述你的需求",
  clearFilters: "清除筛选",
  workspaceEmptyTitle: "你还没有保存过模板",
  workspaceEmptyBody: "你搭建的任何智能体，都可以在它的配置页面保存成模板。",
  workspaceEmptyLink: "前往智能体队伍",
  pageEmptyTitle: "这一页没有内容",
  pageEmptyBody: "模板总数没有你打开的那一页那么多。",
  firstPage: "回到第一页",

  prevPage: "上一页",
  nextPage: "下一页",
  pageOf: (page, pages) => `第 ${page} / ${pages} 页`,
};

const zht: TemplateGalleryDict = {
  heading: "範本庫",
  subheading: "從一套驗證過的設定開始，或者直接描述你的需求。",
  buildWithAi: "用 AI 生成",

  searchPlaceholder: "搜尋範本…",
  searchLabel: "搜尋範本",
  filterHarness: "執行框架",
  filterCategory: "分類",
  filterLevel: "難度",
  filterPlan: "方案",
  filterScope: "範圍",
  filterSort: "排序",
  anyHarness: "全部框架",
  anyCategory: "全部分類",
  anyLevel: "全部難度",
  anyPlan: "全部方案",
  clearAll: "全部清除",
  resultCount: (n, s) => `${n} 個範本 · 依${s}排序`,
  resultCountFiltered: (shown, total) => `已顯示 ${shown} / ${total}`,

  scopes: { all: "全部", workspace: "本工作區", public: "公開" },
  sorts: { used: "使用最多", new: "最新發布", updated: "最近更新", name: "名稱 A–Z" },
  levels: { beginner: "入門", intermediate: "進階", advanced: "高階" },
  categories: {
    sales: "銷售",
    marketing: "行銷",
    support: "客戶支援",
    operations: "營運",
    finance: "財務",
    research: "研究調查",
    engineering: "工程研發",
    hr: "人力資源",
    personal: "個人事務",
    other: "其他",
  },
  plans: { associate: "助理版", professional: "專業版", director: "總監版" },
  langNames: { en: "英文", zh: "簡體中文", zht: "繁體中文", ja: "日文" },

  viewLabel: "檢視",
  viewCard: "卡片檢視",
  viewList: "清單檢視",

  labelLevel: "難度",
  labelSetup: "建置耗時",
  labelUsedBy: "使用次數",
  labelTags: "標籤",
  setupMinutes: (m) => `約 ${m} 分鐘`,
  buildsOut: (a, s, sc) => `建立 ${a} 個智能體，安裝 ${s} 項技能，設定 ${sc} 條排程。`,
  noSkills: "不裝技能——這個智能體只依簡報工作。",
  noTags: "尚無標籤",
  writtenIn: (language) => `以${language}撰寫`,
  badgePublic: "公開",
  badgeYours: "本工作區",
  needsReview: "待確認",
  needsReviewHint: "此範本仍有未處理的警告，處理完才能使用。",
  start: "使用此範本",
  preview: "預覽",
  upgradeToStart: "升級後可用",
  requiresPlan: (plan) => `需要${plan}`,
  estimateHint: "建置耗時是依範本規模估算的。",

  colTemplate: "範本",
  colCategory: "分類",
  colHarness: "執行框架",
  colLevel: "難度",
  colAgents: "智能體",
  colSkills: "技能",
  colSchedules: "排程",
  colUsedBy: "使用次數",
  colUpdated: "更新時間",
  colActions: "操作",
  sortByColumn: (col) => `依${col}排序`,
  rowMenu: "列操作",
  menuPreview: "預覽",
  menuStart: "使用此範本",
  menuDuplicate: "複製到我的工作區",
  menuCopyId: "複製範本 ID",
  menuCopied: "已複製",
  menuDuplicated: "已複製到你的工作區",
  menuDuplicateFailed: "複製這個範本失敗了。",
  menuCopyFailed: "無法存取剪貼簿。",

  drawerClose: "關閉",
  drawerLoading: "正在載入範本…",
  drawerError: "無法載入此範本。",
  sectionRoles: "角色",
  sectionAgents: "智能體",
  sectionSkills: "技能",
  sectionRules: "規則與邊界",
  sectionContext: "脈絡資料",
  sectionSchedules: "提醒與排程",
  countRoles: (n) => `${n} 個角色`,
  countAgents: (n) => `${n} 個智能體`,
  countSkills: (n) => `${n} 項技能`,
  countRules: (n) => `${n} 條規則`,
  countContext: (n) => `${n} 項資料`,
  countSchedules: (n) => `${n} 條排程`,
  emptySection: "尚無內容。",
  moreItems: (n) => `…還有 ${n} 項`,
  autonomy: { suggest: "僅提出建議", ask: "先詢問再執行", auto: "自主執行" },
  tone: {
    professional: "專業",
    friendly: "親切",
    concise: "簡潔",
    formal: "正式",
    playful: "活潑",
  },
  risk: { low: "低", medium: "中", high: "高" },
  ruleSeverity: { hard: "必須", soft: "建議" },
  contextKind: { pasted_text: "文字", file_request: "檔案", url: "連結" },
  requiredMark: "必填",
  approvalAbove: (amount) => `超過 ${amount} 需要呈報核准`,
  scheduleUnreadable: "無法解析此排程規則",
  provenanceTitle: "來源",
  origins: {
    generated: "AI 生成",
    manual: "手工撰寫",
    seeded: "平台內建",
    forked: "複製自其他範本",
  },
  provenanceLine: (origin, updated) => `${origin} · ${updated}更新`,
  slugLine: (slug) => `識別碼 ${slug}`,
  estimatedCredits: (n) => `每月約 ${n} 額度`,
  thirdPartyNotice: "此範本由其他工作區撰寫。使用前請先讀完它的規則與脈絡資料。",
  warningsTitle: (n) => `${n} 條未處理的警告`,
  startFromTemplate: "使用此範本",
  duplicateAndEdit: "複製後編輯",

  loadingLabel: "正在載入範本…",
  errorTitle: "無法載入範本",
  errorBody: "範本服務沒有回應，你的資料未做任何變更。",
  errorFilters: "其中一個篩選條件不被接受，請清除後重試。",
  tryAgain: "重試",
  emptyTitle: "還沒有範本",
  emptyBody: "用你自己的話描述這份工作，我們會把角色、技能、規則與排程一次擬好。",
  emptyCta: "用 AI 生成",
  filteredTitle: "沒有符合這些條件的範本",
  filteredBody: "放寬搜尋條件，或清除篩選重新檢視全部範本。",
  filteredAlt: "或者直接描述你的需求",
  clearFilters: "清除篩選",
  workspaceEmptyTitle: "你還沒有儲存過範本",
  workspaceEmptyBody: "你建立的任何智能體，都可以在它的設定頁面儲存成範本。",
  workspaceEmptyLink: "前往智能體隊伍",
  pageEmptyTitle: "這一頁沒有內容",
  pageEmptyBody: "範本總數沒有你開啟的那一頁那麼多。",
  firstPage: "回到第一頁",

  prevPage: "上一頁",
  nextPage: "下一頁",
  pageOf: (page, pages) => `第 ${page} / ${pages} 頁`,
};

const ja: TemplateGalleryDict = {
  heading: "テンプレート",
  subheading: "実績のある構成から始めるか、必要な仕事をそのまま書いてください。",
  buildWithAi: "AI で作る",

  searchPlaceholder: "テンプレートを検索…",
  searchLabel: "テンプレートを検索",
  filterHarness: "ハーネス",
  filterCategory: "カテゴリ",
  filterLevel: "レベル",
  filterPlan: "プラン",
  filterScope: "範囲",
  filterSort: "並び順",
  anyHarness: "すべてのハーネス",
  anyCategory: "すべてのカテゴリ",
  anyLevel: "すべてのレベル",
  anyPlan: "すべてのプラン",
  clearAll: "すべて解除",
  resultCount: (n, s) => `${n} 件のテンプレート · ${s}`,
  resultCountFiltered: (shown, total) => `${total} 件中 ${shown} 件を表示`,

  scopes: { all: "すべて", workspace: "自分のワークスペース", public: "公開" },
  sorts: { used: "利用の多い順", new: "新着順", updated: "更新順", name: "名前順" },
  levels: { beginner: "かんたん", intermediate: "標準", advanced: "高度" },
  categories: {
    sales: "営業",
    marketing: "マーケティング",
    support: "カスタマーサポート",
    operations: "オペレーション",
    finance: "財務",
    research: "リサーチ",
    engineering: "エンジニアリング",
    hr: "人事",
    personal: "個人",
    other: "その他",
  },
  plans: { associate: "アソシエイト", professional: "プロフェッショナル", director: "ディレクター" },
  langNames: { en: "英語", zh: "簡体字中国語", zht: "繁体字中国語", ja: "日本語" },

  viewLabel: "表示",
  viewCard: "カード表示",
  viewList: "リスト表示",

  labelLevel: "レベル",
  labelSetup: "準備時間",
  labelUsedBy: "利用数",
  labelTags: "タグ",
  setupMinutes: (m) => `約 ${m} 分`,
  buildsOut: (a, s, sc) =>
    `エージェント ${a} 体を作成し、スキル ${s} 件を導入、スケジュール ${sc} 件を設定します。`,
  noSkills: "スキルなし — ブリーフだけで動くエージェントです。",
  noTags: "タグなし",
  writtenIn: (language) => `${language}で記述`,
  badgePublic: "公開",
  badgeYours: "自作",
  needsReview: "要確認",
  needsReviewHint: "未解決の警告があるため、このテンプレートはまだ利用できません。",
  start: "このテンプレートで始める",
  preview: "プレビュー",
  upgradeToStart: "アップグレードが必要",
  requiresPlan: (plan) => `${plan} プランが必要`,
  estimateHint: "準備時間はテンプレートの規模からの目安です。",

  colTemplate: "テンプレート",
  colCategory: "カテゴリ",
  colHarness: "ハーネス",
  colLevel: "レベル",
  colAgents: "エージェント",
  colSkills: "スキル",
  colSchedules: "予定",
  colUsedBy: "利用数",
  colUpdated: "更新",
  colActions: "操作",
  sortByColumn: (col) => `${col}で並べ替え`,
  rowMenu: "行の操作",
  menuPreview: "プレビュー",
  menuStart: "このテンプレートで始める",
  menuDuplicate: "自分のワークスペースに複製",
  menuCopyId: "テンプレート ID をコピー",
  menuCopied: "コピーしました",
  menuDuplicated: "自分のワークスペースに複製しました",
  menuDuplicateFailed: "このテンプレートを複製できませんでした。",
  menuCopyFailed: "クリップボードを利用できませんでした。",

  drawerClose: "閉じる",
  drawerLoading: "テンプレートを読み込み中…",
  drawerError: "このテンプレートを読み込めませんでした。",
  sectionRoles: "ロール",
  sectionAgents: "エージェント",
  sectionSkills: "スキル",
  sectionRules: "ルールと制限",
  sectionContext: "コンテキスト",
  sectionSchedules: "リマインダーとスケジュール",
  countRoles: (n) => `${n} 件のロール`,
  countAgents: (n) => `${n} 体`,
  countSkills: (n) => `${n} 件のスキル`,
  countRules: (n) => `${n} 件のルール`,
  countContext: (n) => `${n} 件`,
  countSchedules: (n) => `${n} 件の予定`,
  emptySection: "項目はありません。",
  moreItems: (n) => `…ほか ${n} 件`,
  autonomy: { suggest: "提案のみ", ask: "事前に確認", auto: "自律実行" },
  tone: {
    professional: "プロフェッショナル",
    friendly: "フレンドリー",
    concise: "簡潔",
    formal: "フォーマル",
    playful: "遊び心のある",
  },
  risk: { low: "低", medium: "中", high: "高" },
  ruleSeverity: { hard: "必須", soft: "推奨" },
  contextKind: { pasted_text: "テキスト", file_request: "ファイル", url: "リンク" },
  requiredMark: "必須",
  approvalAbove: (amount) => `${amount} を超える場合はエスカレーション`,
  scheduleUnreadable: "スケジュールを解釈できませんでした",
  provenanceTitle: "出所",
  origins: {
    generated: "AI 生成",
    manual: "手動作成",
    seeded: "標準搭載",
    forked: "他テンプレートから複製",
  },
  provenanceLine: (origin, updated) => `${origin} · ${updated}に更新`,
  slugLine: (slug) => `スラッグ ${slug}`,
  estimatedCredits: (n) => `月あたり約 ${n} クレジット`,
  thirdPartyNotice:
    "他のワークスペースが作成した内容です。利用する前にルールとコンテキストを必ず確認してください。",
  warningsTitle: (n) => `未解決の警告 ${n} 件`,
  startFromTemplate: "このテンプレートで始める",
  duplicateAndEdit: "複製して編集",

  loadingLabel: "テンプレートを読み込み中…",
  errorTitle: "テンプレートを読み込めませんでした",
  errorBody: "テンプレートサービスから応答がありません。データは変更されていません。",
  errorFilters: "指定した絞り込み条件が受け付けられません。条件を解除して再試行してください。",
  tryAgain: "再試行",
  emptyTitle: "テンプレートがまだありません",
  emptyBody:
    "やってほしい仕事を書くだけで、ロール・スキル・ルール・スケジュールまで下書きします。",
  emptyCta: "AI で作る",
  filteredTitle: "条件に合うテンプレートがありません",
  filteredBody: "条件をゆるめるか、絞り込みを解除してもう一度ご覧ください。",
  filteredAlt: "必要な仕事を書いて作ることもできます",
  clearFilters: "絞り込みを解除",
  workspaceEmptyTitle: "保存済みのテンプレートはありません",
  workspaceEmptyBody: "作成したエージェントは、設定画面からテンプレートとして保存できます。",
  workspaceEmptyLink: "フリートを開く",
  pageEmptyTitle: "このページには何もありません",
  pageEmptyBody: "指定されたページは一覧の範囲を超えています。",
  firstPage: "最初のページに戻る",

  prevPage: "前へ",
  nextPage: "次へ",
  pageOf: (page, pages) => `${pages} ページ中 ${page} ページ目`,
};

export const templateGallery: Record<Lang, TemplateGalleryDict> = { en, zh, zht, ja };
