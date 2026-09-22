/**
 * Copy for the platform admin console (user list + user detail).
 *
 * Two vocabularies meet here and must not be confused in translation: the
 * *platform* role (user / support / admin — who may operate this console) and
 * an *agent* role (the job an agent is hired for). Each language uses a
 * distinct word for the second sense so the two tables never read alike.
 */
import type { Lang } from "@/lib/types";

export interface AdminDict {
  // ---- shell ----
  eyebrow: string;
  heading: string;
  subheading: string;
  loading: string;
  loadError: string;
  retry: string;
  notAuthorizedTitle: string;
  notAuthorizedBody: string;
  backToOverview: string;

  // ---- platform totals strip ----
  statUsers: string;
  statActive: string;
  statSuspended: string;
  statStaff: string;
  statAgents: string;
  statWorkspaces: string;
  statCalls: string;
  statCost: string;
  /** Sub-line under the call counter, e.g. "412,905 tokens". */
  statTokensSub: (tokens: string) => string;
  /** Sub-line under the cost counter, e.g. "0.4% error rate". */
  statErrorSub: (rate: string) => string;

  // ---- filters ----
  searchPlaceholder: string;
  allRoles: string;
  allStatuses: string;
  clearFilters: string;

  // ---- shared vocabularies ----
  role: Record<"user" | "support" | "admin", string>;
  status: Record<"active" | "suspended", string>;
  provider: Record<"google" | "wechat", string>;
  providerFallback: (provider: string) => string;

  // ---- user table ----
  colUser: string;
  colRole: string;
  colStatus: string;
  colAgents: string;
  colIdentities: string;
  colTokens: string;
  colCost: string;
  colJoined: string;
  noUsers: string;
  noUsersFiltered: string;
  showing: (from: number, to: number, total: number) => string;
  pageOf: (page: number, pages: number) => string;
  prevPage: string;
  nextPage: string;

  // ---- audit feed ----
  auditTitle: string;
  noAudit: string;
  auditAction: Record<
    | "role_changed"
    | "status_changed"
    | "sessions_revoked"
    | "password_reset"
    | "user_deleted"
    | "identity_unlinked",
    string
  >;
  auditActionFallback: (action: string) => string;

  // ---- detail shell ----
  backToUsers: string;
  userNotFound: string;

  // ---- profile ----
  profileTitle: string;
  fieldId: string;
  fieldEmail: string;
  fieldName: string;
  fieldLocale: string;
  fieldJoined: string;
  fieldPassword: string;
  passwordSet: string;
  passwordNone: string;

  // ---- access controls ----
  accessTitle: string;
  roleLabel: string;
  roleHelp: string;
  applyRole: string;
  roleUpdated: string;
  statusLabel: string;
  suspend: string;
  activate: string;
  suspendHelp: string;
  statusUpdated: string;
  sessionsTitle: string;
  revokeSessions: string;
  sessionsRevoked: string;
  noSessions: string;
  colSessionStarted: string;
  colSessionExpires: string;
  colSessionIp: string;
  colSessionDevice: string;
  selfGuard: string;
  actionError: string;
  working: string;

  // ---- linked identities ----
  identitiesTitle: string;
  noIdentities: string;
  colProvider: string;
  colProviderAccount: string;
  colLinked: string;
  colLastLogin: string;
  verified: string;
  unverified: string;
  never: string;

  // ---- workspaces ----
  workspacesTitle: string;
  noWorkspaces: string;
  colWorkspace: string;
  colPlan: string;
  colCredits: string;

  // ---- agents ----
  agentsTitle: string;
  noAgents: string;
  colAgent: string;
  colAgentRole: string;
  colAgentStatus: string;
  colAgentCredits: string;
  colCreated: string;

  // ---- model usage ----
  usageTitle: string;
  usageWindow: string;
  usageCalls: string;
  usageTokens: string;
  usageCost: string;
  usageErrorRate: string;
  byModelTitle: string;
  byDayTitle: string;
  colModel: string;
  noUsage: string;

  // ---- danger zone ----
  dangerTitle: string;
  deleteWarning: string;
  deleteConfirmLabel: (email: string) => string;
  deleteConfirmPlaceholder: string;
  deleteButton: string;
  deleting: string;
  deleteError: string;
}

export const admin: Record<Lang, AdminDict> = {
  en: {
    eyebrow: "PLATFORM ADMIN",
    heading: "Admin console",
    subheading: "Accounts, access, and model spend across the whole platform.",
    loading: "Loading…",
    loadError: "Could not load admin data.",
    retry: "Try again",
    notAuthorizedTitle: "Not authorized",
    notAuthorizedBody:
      "This area is limited to platform staff. If you think you should have access, ask an administrator.",
    backToOverview: "Back to overview",

    statUsers: "USERS",
    statActive: "ACTIVE",
    statSuspended: "SUSPENDED",
    statStaff: "STAFF",
    statAgents: "AGENTS",
    statWorkspaces: "WORKSPACES",
    statCalls: "MODEL CALLS · 30D",
    statCost: "MODEL SPEND · 30D",
    statTokensSub: (tokens) => `${tokens} tokens`,
    statErrorSub: (rate) => `${rate} error rate`,

    searchPlaceholder: "Search name or email",
    allRoles: "All roles",
    allStatuses: "All statuses",
    clearFilters: "Clear filters",

    role: { user: "User", support: "Support", admin: "Admin" },
    status: { active: "Active", suspended: "Suspended" },
    provider: { google: "Google", wechat: "WeChat" },
    providerFallback: (provider) => provider,

    colUser: "USER",
    colRole: "ROLE",
    colStatus: "STATUS",
    colAgents: "AGENTS",
    colIdentities: "LOGINS",
    colTokens: "TOKENS 30D",
    colCost: "SPEND 30D",
    colJoined: "JOINED",
    noUsers: "No accounts yet.",
    noUsersFiltered: "No accounts match these filters.",
    showing: (from, to, total) => `Showing ${from}–${to} of ${total}`,
    pageOf: (page, pages) => `Page ${page} of ${pages}`,
    prevPage: "Previous",
    nextPage: "Next",

    auditTitle: "Recent admin actions",
    noAudit: "No admin actions recorded yet.",
    auditAction: {
      role_changed: "Role changed",
      status_changed: "Status changed",
      sessions_revoked: "Sessions revoked",
      password_reset: "Password reset",
      user_deleted: "User deleted",
      identity_unlinked: "Login unlinked",
    },
    auditActionFallback: (action) => `Action “${action}”`,

    backToUsers: "All accounts",
    userNotFound: "This account no longer exists.",

    profileTitle: "Profile",
    fieldId: "USER ID",
    fieldEmail: "EMAIL",
    fieldName: "NAME",
    fieldLocale: "LANGUAGE",
    fieldJoined: "JOINED",
    fieldPassword: "PASSWORD",
    passwordSet: "Set",
    passwordNone: "Sign-in provider only",

    accessTitle: "Access",
    roleLabel: "Platform role",
    roleHelp: "Support can read every account. Admin can also change them.",
    applyRole: "Update role",
    roleUpdated: "Platform role updated.",
    statusLabel: "Account status",
    suspend: "Suspend account",
    activate: "Reactivate account",
    suspendHelp: "A suspended account keeps all of its data but cannot sign in.",
    statusUpdated: "Account status updated.",
    sessionsTitle: "Sessions",
    revokeSessions: "Sign out everywhere",
    sessionsRevoked: "All sessions revoked.",
    noSessions: "No active sessions.",
    colSessionStarted: "STARTED",
    colSessionExpires: "EXPIRES",
    colSessionIp: "IP",
    colSessionDevice: "DEVICE",
    selfGuard: "You cannot change your own role, status, or account here.",
    actionError: "That action failed. Please try again.",
    working: "Working…",

    identitiesTitle: "Linked logins",
    noIdentities: "No sign-in providers linked.",
    colProvider: "PROVIDER",
    colProviderAccount: "ACCOUNT",
    colLinked: "LINKED",
    colLastLogin: "LAST LOGIN",
    verified: "Verified",
    unverified: "Unverified",
    never: "Never",

    workspacesTitle: "Workspaces",
    noWorkspaces: "No workspaces.",
    colWorkspace: "WORKSPACE",
    colPlan: "PLAN",
    colCredits: "CREDITS",

    agentsTitle: "Agents",
    noAgents: "No agents.",
    colAgent: "AGENT",
    colAgentRole: "JOB",
    colAgentStatus: "STATUS",
    colAgentCredits: "CREDITS",
    colCreated: "CREATED",

    usageTitle: "Model usage",
    usageWindow: "Last 30 days",
    usageCalls: "CALLS",
    usageTokens: "TOKENS",
    usageCost: "SPEND",
    usageErrorRate: "ERROR RATE",
    byModelTitle: "By model",
    byDayTitle: "By day",
    colModel: "MODEL",
    noUsage: "No model usage in this window.",

    dangerTitle: "Delete account",
    deleteWarning:
      "Deleting removes this user, their workspaces, and every agent they own. It cannot be undone.",
    deleteConfirmLabel: (email) => `Type ${email} to confirm`,
    deleteConfirmPlaceholder: "Email address",
    deleteButton: "Delete this account",
    deleting: "Deleting…",
    deleteError: "Could not delete this account.",
  },

  zh: {
    eyebrow: "平台管理",
    heading: "管理控制台",
    subheading: "统一查看全平台的账户、权限与模型开销。",
    loading: "加载中…",
    loadError: "管理数据加载失败。",
    retry: "重试",
    notAuthorizedTitle: "无访问权限",
    notAuthorizedBody: "该页面仅对平台管理人员开放。如果你认为自己应当有权限，请联系管理员。",
    backToOverview: "返回概览",

    statUsers: "用户总数",
    statActive: "正常",
    statSuspended: "已停用",
    statStaff: "管理人员",
    statAgents: "智能体",
    statWorkspaces: "工作区",
    statCalls: "模型调用 · 30 天",
    statCost: "模型开销 · 30 天",
    statTokensSub: (tokens) => `${tokens} Token`,
    statErrorSub: (rate) => `错误率 ${rate}`,

    searchPlaceholder: "搜索姓名或邮箱",
    allRoles: "全部角色",
    allStatuses: "全部状态",
    clearFilters: "清除筛选",

    role: { user: "普通用户", support: "客服", admin: "管理员" },
    status: { active: "正常", suspended: "已停用" },
    provider: { google: "Google", wechat: "微信" },
    providerFallback: (provider) => provider,

    colUser: "用户",
    colRole: "角色",
    colStatus: "状态",
    colAgents: "智能体",
    colIdentities: "关联登录",
    colTokens: "近 30 天 Token",
    colCost: "近 30 天开销",
    colJoined: "注册时间",
    noUsers: "暂无账户。",
    noUsersFiltered: "没有符合筛选条件的账户。",
    showing: (from, to, total) => `显示第 ${from}–${to} 条，共 ${total} 条`,
    pageOf: (page, pages) => `第 ${page} / ${pages} 页`,
    prevPage: "上一页",
    nextPage: "下一页",

    auditTitle: "最近的管理操作",
    noAudit: "暂无管理操作记录。",
    auditAction: {
      role_changed: "修改角色",
      status_changed: "修改状态",
      sessions_revoked: "注销全部会话",
      password_reset: "重置密码",
      user_deleted: "删除用户",
      identity_unlinked: "解除登录绑定",
    },
    auditActionFallback: (action) => `操作「${action}」`,

    backToUsers: "返回账户列表",
    userNotFound: "该账户已不存在。",

    profileTitle: "基本信息",
    fieldId: "用户 ID",
    fieldEmail: "邮箱",
    fieldName: "姓名",
    fieldLocale: "界面语言",
    fieldJoined: "注册时间",
    fieldPassword: "登录密码",
    passwordSet: "已设置",
    passwordNone: "仅第三方登录",

    accessTitle: "权限与状态",
    roleLabel: "平台角色",
    roleHelp: "客服可以查看所有账户，管理员还可以进行修改。",
    applyRole: "更新角色",
    roleUpdated: "平台角色已更新。",
    statusLabel: "账户状态",
    suspend: "停用账户",
    activate: "恢复账户",
    suspendHelp: "停用后账户数据保留，但无法登录。",
    statusUpdated: "账户状态已更新。",
    sessionsTitle: "登录会话",
    revokeSessions: "注销全部设备",
    sessionsRevoked: "已注销全部会话。",
    noSessions: "当前没有活跃会话。",
    colSessionStarted: "登录时间",
    colSessionExpires: "过期时间",
    colSessionIp: "IP",
    colSessionDevice: "设备",
    selfGuard: "不能在这里修改自己的角色、状态或账户。",
    actionError: "操作失败，请重试。",
    working: "处理中…",

    identitiesTitle: "关联登录方式",
    noIdentities: "尚未绑定任何第三方登录。",
    colProvider: "登录方式",
    colProviderAccount: "账号",
    colLinked: "绑定时间",
    colLastLogin: "最近登录",
    verified: "已验证",
    unverified: "未验证",
    never: "从未",

    workspacesTitle: "工作区",
    noWorkspaces: "暂无工作区。",
    colWorkspace: "工作区",
    colPlan: "套餐",
    colCredits: "额度",

    agentsTitle: "智能体",
    noAgents: "暂无智能体。",
    colAgent: "智能体",
    colAgentRole: "岗位",
    colAgentStatus: "状态",
    colAgentCredits: "额度",
    colCreated: "创建时间",

    usageTitle: "模型用量",
    usageWindow: "最近 30 天",
    usageCalls: "调用次数",
    usageTokens: "Token 用量",
    usageCost: "开销",
    usageErrorRate: "错误率",
    byModelTitle: "按模型",
    byDayTitle: "按日期",
    colModel: "模型",
    noUsage: "该时间段内没有模型用量。",

    dangerTitle: "删除账户",
    deleteWarning: "删除会一并移除该用户、其工作区以及名下的所有智能体，且无法恢复。",
    deleteConfirmLabel: (email) => `请输入 ${email} 以确认`,
    deleteConfirmPlaceholder: "邮箱地址",
    deleteButton: "永久删除该账户",
    deleting: "删除中…",
    deleteError: "账户删除失败。",
  },

  zht: {
    eyebrow: "平台管理",
    heading: "管理主控台",
    subheading: "統一檢視全平台的帳戶、權限與模型花費。",
    loading: "載入中…",
    loadError: "管理資料載入失敗。",
    retry: "重試",
    notAuthorizedTitle: "無存取權限",
    notAuthorizedBody: "此頁面僅開放給平台管理人員。若你認為自己應該有權限，請聯絡管理員。",
    backToOverview: "返回總覽",

    statUsers: "使用者總數",
    statActive: "正常",
    statSuspended: "已停用",
    statStaff: "管理人員",
    statAgents: "智能體",
    statWorkspaces: "工作區",
    statCalls: "模型呼叫 · 30 天",
    statCost: "模型花費 · 30 天",
    statTokensSub: (tokens) => `${tokens} Token`,
    statErrorSub: (rate) => `錯誤率 ${rate}`,

    searchPlaceholder: "搜尋姓名或電子郵件",
    allRoles: "全部角色",
    allStatuses: "全部狀態",
    clearFilters: "清除篩選",

    role: { user: "一般使用者", support: "客服", admin: "管理員" },
    status: { active: "正常", suspended: "已停用" },
    provider: { google: "Google", wechat: "微信" },
    providerFallback: (provider) => provider,

    colUser: "使用者",
    colRole: "角色",
    colStatus: "狀態",
    colAgents: "智能體",
    colIdentities: "綁定登入",
    colTokens: "近 30 天 Token",
    colCost: "近 30 天花費",
    colJoined: "註冊時間",
    noUsers: "尚無帳戶。",
    noUsersFiltered: "沒有符合篩選條件的帳戶。",
    showing: (from, to, total) => `顯示第 ${from}–${to} 筆，共 ${total} 筆`,
    pageOf: (page, pages) => `第 ${page} / ${pages} 頁`,
    prevPage: "上一頁",
    nextPage: "下一頁",

    auditTitle: "最近的管理操作",
    noAudit: "尚無管理操作紀錄。",
    auditAction: {
      role_changed: "變更角色",
      status_changed: "變更狀態",
      sessions_revoked: "登出所有工作階段",
      password_reset: "重設密碼",
      user_deleted: "刪除使用者",
      identity_unlinked: "解除登入綁定",
    },
    auditActionFallback: (action) => `操作「${action}」`,

    backToUsers: "返回帳戶列表",
    userNotFound: "該帳戶已不存在。",

    profileTitle: "基本資料",
    fieldId: "使用者 ID",
    fieldEmail: "電子郵件",
    fieldName: "姓名",
    fieldLocale: "介面語言",
    fieldJoined: "註冊時間",
    fieldPassword: "登入密碼",
    passwordSet: "已設定",
    passwordNone: "僅第三方登入",

    accessTitle: "權限與狀態",
    roleLabel: "平台角色",
    roleHelp: "客服可以檢視所有帳戶，管理員還可以進行修改。",
    applyRole: "更新角色",
    roleUpdated: "平台角色已更新。",
    statusLabel: "帳戶狀態",
    suspend: "停用帳戶",
    activate: "恢復帳戶",
    suspendHelp: "停用後帳戶資料保留，但無法登入。",
    statusUpdated: "帳戶狀態已更新。",
    sessionsTitle: "登入工作階段",
    revokeSessions: "登出所有裝置",
    sessionsRevoked: "已登出所有工作階段。",
    noSessions: "目前沒有作用中的工作階段。",
    colSessionStarted: "登入時間",
    colSessionExpires: "到期時間",
    colSessionIp: "IP",
    colSessionDevice: "裝置",
    selfGuard: "無法在這裡變更自己的角色、狀態或帳戶。",
    actionError: "操作失敗，請重試。",
    working: "處理中…",

    identitiesTitle: "綁定的登入方式",
    noIdentities: "尚未綁定任何第三方登入。",
    colProvider: "登入方式",
    colProviderAccount: "帳號",
    colLinked: "綁定時間",
    colLastLogin: "最近登入",
    verified: "已驗證",
    unverified: "未驗證",
    never: "從未",

    workspacesTitle: "工作區",
    noWorkspaces: "尚無工作區。",
    colWorkspace: "工作區",
    colPlan: "方案",
    colCredits: "額度",

    agentsTitle: "智能體",
    noAgents: "尚無智能體。",
    colAgent: "智能體",
    colAgentRole: "職務",
    colAgentStatus: "狀態",
    colAgentCredits: "額度",
    colCreated: "建立時間",

    usageTitle: "模型用量",
    usageWindow: "最近 30 天",
    usageCalls: "呼叫次數",
    usageTokens: "Token 用量",
    usageCost: "花費",
    usageErrorRate: "錯誤率",
    byModelTitle: "依模型",
    byDayTitle: "依日期",
    colModel: "模型",
    noUsage: "此期間內沒有模型用量。",

    dangerTitle: "刪除帳戶",
    deleteWarning: "刪除會一併移除該使用者、其工作區以及名下的所有智能體，且無法復原。",
    deleteConfirmLabel: (email) => `請輸入 ${email} 以確認`,
    deleteConfirmPlaceholder: "電子郵件地址",
    deleteButton: "永久刪除該帳戶",
    deleting: "刪除中…",
    deleteError: "帳戶刪除失敗。",
  },

  ja: {
    eyebrow: "プラットフォーム管理",
    heading: "管理コンソール",
    subheading: "プラットフォーム全体のアカウント・権限・モデル利用料をまとめて確認できます。",
    loading: "読み込み中…",
    loadError: "管理データを読み込めませんでした。",
    retry: "再試行",
    notAuthorizedTitle: "アクセス権限がありません",
    notAuthorizedBody:
      "この画面は運営メンバーのみが利用できます。権限が必要な場合は管理者にお問い合わせください。",
    backToOverview: "概要に戻る",

    statUsers: "ユーザー総数",
    statActive: "有効",
    statSuspended: "停止中",
    statStaff: "運営メンバー",
    statAgents: "エージェント",
    statWorkspaces: "ワークスペース",
    statCalls: "モデル呼び出し・30日",
    statCost: "モデル利用料・30日",
    statTokensSub: (tokens) => `${tokens} トークン`,
    statErrorSub: (rate) => `エラー率 ${rate}`,

    searchPlaceholder: "名前またはメールで検索",
    allRoles: "すべての権限",
    allStatuses: "すべての状態",
    clearFilters: "条件をクリア",

    role: { user: "一般ユーザー", support: "サポート", admin: "管理者" },
    status: { active: "有効", suspended: "停止中" },
    provider: { google: "Google", wechat: "WeChat" },
    providerFallback: (provider) => provider,

    colUser: "ユーザー",
    colRole: "権限",
    colStatus: "状態",
    colAgents: "エージェント",
    colIdentities: "連携ログイン",
    colTokens: "30日トークン",
    colCost: "30日利用料",
    colJoined: "登録日",
    noUsers: "アカウントがまだありません。",
    noUsersFiltered: "条件に一致するアカウントはありません。",
    showing: (from, to, total) => `${total} 件中 ${from}–${to} 件を表示`,
    pageOf: (page, pages) => `${pages} ページ中 ${page} ページ目`,
    prevPage: "前へ",
    nextPage: "次へ",

    auditTitle: "最近の管理操作",
    noAudit: "管理操作の記録はまだありません。",
    auditAction: {
      role_changed: "権限を変更",
      status_changed: "状態を変更",
      sessions_revoked: "セッションを失効",
      password_reset: "パスワードをリセット",
      user_deleted: "ユーザーを削除",
      identity_unlinked: "連携ログインを解除",
    },
    auditActionFallback: (action) => `操作「${action}」`,

    backToUsers: "アカウント一覧に戻る",
    userNotFound: "このアカウントは存在しません。",

    profileTitle: "基本情報",
    fieldId: "ユーザー ID",
    fieldEmail: "メールアドレス",
    fieldName: "名前",
    fieldLocale: "表示言語",
    fieldJoined: "登録日",
    fieldPassword: "パスワード",
    passwordSet: "設定済み",
    passwordNone: "外部ログインのみ",

    accessTitle: "権限と状態",
    roleLabel: "プラットフォーム権限",
    roleHelp: "サポートは全アカウントを閲覧でき、管理者は変更もできます。",
    applyRole: "権限を更新",
    roleUpdated: "プラットフォーム権限を更新しました。",
    statusLabel: "アカウントの状態",
    suspend: "アカウントを停止",
    activate: "アカウントを再開",
    suspendHelp: "停止してもデータは残りますが、ログインはできなくなります。",
    statusUpdated: "アカウントの状態を更新しました。",
    sessionsTitle: "ログインセッション",
    revokeSessions: "すべての端末からログアウト",
    sessionsRevoked: "すべてのセッションを失効しました。",
    noSessions: "有効なセッションはありません。",
    colSessionStarted: "開始",
    colSessionExpires: "有効期限",
    colSessionIp: "IP",
    colSessionDevice: "端末",
    selfGuard: "自分自身の権限・状態・アカウントはここでは変更できません。",
    actionError: "操作に失敗しました。もう一度お試しください。",
    working: "処理中…",

    identitiesTitle: "連携ログイン",
    noIdentities: "連携済みの外部ログインはありません。",
    colProvider: "連携先",
    colProviderAccount: "アカウント",
    colLinked: "連携日",
    colLastLogin: "最終ログイン",
    verified: "確認済み",
    unverified: "未確認",
    never: "なし",

    workspacesTitle: "ワークスペース",
    noWorkspaces: "ワークスペースはありません。",
    colWorkspace: "ワークスペース",
    colPlan: "プラン",
    colCredits: "クレジット",

    agentsTitle: "エージェント",
    noAgents: "エージェントはいません。",
    colAgent: "エージェント",
    colAgentRole: "職務",
    colAgentStatus: "状態",
    colAgentCredits: "クレジット",
    colCreated: "作成日",

    usageTitle: "モデル利用状況",
    usageWindow: "直近 30 日",
    usageCalls: "呼び出し回数",
    usageTokens: "トークン",
    usageCost: "利用料",
    usageErrorRate: "エラー率",
    byModelTitle: "モデル別",
    byDayTitle: "日別",
    colModel: "モデル",
    noUsage: "この期間のモデル利用はありません。",

    dangerTitle: "アカウントの削除",
    deleteWarning:
      "削除すると、このユーザーとそのワークスペース、所有するすべてのエージェントが失われます。元に戻すことはできません。",
    deleteConfirmLabel: (email) => `確認のため ${email} と入力してください`,
    deleteConfirmPlaceholder: "メールアドレス",
    deleteButton: "このアカウントを削除する",
    deleting: "削除中…",
    deleteError: "アカウントを削除できませんでした。",
  },
};
