/** Copy for the dashboard shell (sidebar nav, workspace/credits footer). */
import type { Lang } from "@/lib/types";

export interface DashLayoutDict {
  navOverview: string;
  navFleet: string;
  navTemplates: string;
  navSkills: string;
  navChannels: string;
  navBilling: string;
  navPayment: string;
  navDirections: string;
  navAccount: string;
  /** Only rendered for support/admin accounts. */
  navAdmin: string;
  workspace: string;
  workspaceFallback: string;
  hireNew: string;
  credits: string;
  resetsIn: (days: number) => string;
  usageThisCycle: string;
  /**
   * Metered overage line under the credits bar, e.g. "overage $2 / 1k".
   * Takes the formatted rate because it differs per market — $2 per 1,000
   * credits internationally, ¥14 in China.
   */
  overage: (rate: string) => string;
  signOut: string;
}

export const dashLayout: Record<Lang, DashLayoutDict> = {
  en: {
    navOverview: "Overview",
    navFleet: "Fleet",
    navTemplates: "Templates",
    navSkills: "Skills",
    navChannels: "Channels",
    navBilling: "Billing & usage",
    navPayment: "Payment",
    navDirections: "Directions",
    navAccount: "Personal center",
    navAdmin: "Admin",
    workspace: "WORKSPACE",
    workspaceFallback: "Workspace",
    hireNew: "+ Hire new agent",
    credits: "CREDITS",
    resetsIn: (d) => `Resets in ${d} days`,
    usageThisCycle: "Usage this cycle",
    overage: (rate) => `overage ${rate} / 1k`,
    signOut: "Sign out",
  },
  zh: {
    navOverview: "概览",
    navFleet: "智能体团队",
    navTemplates: "模板库",
    navSkills: "技能库",
    navChannels: "渠道",
    navBilling: "账单与用量",
    navPayment: "支付",
    navDirections: "导航",
    navAccount: "个人中心",
    navAdmin: "平台管理",
    workspace: "工作区",
    workspaceFallback: "工作区",
    hireNew: "+ 雇佣新智能体",
    credits: "额度",
    resetsIn: (d) => `${d} 天后重置`,
    usageThisCycle: "本周期用量",
    overage: (rate) => `超额 ${rate} / 1k`,
    signOut: "退出登录",
  },
  zht: {
    navOverview: "總覽",
    navFleet: "智能體團隊",
    navTemplates: "範本庫",
    navSkills: "技能庫",
    navChannels: "通路",
    navBilling: "帳單與用量",
    navPayment: "支付",
    navDirections: "導航",
    navAccount: "個人中心",
    navAdmin: "平台管理",
    workspace: "工作區",
    workspaceFallback: "工作區",
    hireNew: "+ 僱用新智能體",
    credits: "額度",
    resetsIn: (d) => `${d} 天後重置`,
    usageThisCycle: "本週期用量",
    overage: (rate) => `超額 ${rate} / 1k`,
    signOut: "登出",
  },
  ja: {
    navOverview: "概要",
    navFleet: "エージェント一覧",
    navTemplates: "テンプレート",
    navSkills: "スキル",
    navChannels: "チャネル",
    navBilling: "請求と利用状況",
    navPayment: "支払い",
    navDirections: "ナビゲーション",
    navAccount: "マイページ",
    navAdmin: "管理コンソール",
    workspace: "ワークスペース",
    workspaceFallback: "ワークスペース",
    hireNew: "+ 新しいエージェントを雇う",
    credits: "クレジット",
    resetsIn: (d) => `${d}日後にリセット`,
    usageThisCycle: "今サイクルの利用状況",
    overage: (rate) => `超過分 ${rate} / 1k`,
    signOut: "ログアウト",
  },
};
