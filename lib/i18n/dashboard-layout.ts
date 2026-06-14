/** Copy for the dashboard shell (sidebar nav, workspace/credits footer). */
import type { Lang } from "@/lib/types";

export interface DashLayoutDict {
  navOverview: string;
  navFleet: string;
  navChannels: string;
  navBilling: string;
  workspace: string;
  workspaceFallback: string;
  hireNew: string;
  credits: string;
  resetsIn: (days: number) => string;
  usageThisCycle: string;
  overage: string;
  signOut: string;
}

export const dashLayout: Record<Lang, DashLayoutDict> = {
  en: {
    navOverview: "Overview",
    navFleet: "Fleet",
    navChannels: "Channels",
    navBilling: "Billing & usage",
    workspace: "WORKSPACE",
    workspaceFallback: "Workspace",
    hireNew: "+ Hire new agent",
    credits: "CREDITS",
    resetsIn: (d) => `Resets in ${d} days`,
    usageThisCycle: "Usage this cycle",
    overage: "overage $2 / 1k",
    signOut: "Sign out",
  },
  zh: {
    navOverview: "概览",
    navFleet: "智能体团队",
    navChannels: "渠道",
    navBilling: "账单与用量",
    workspace: "工作区",
    workspaceFallback: "工作区",
    hireNew: "+ 雇佣新智能体",
    credits: "额度",
    resetsIn: (d) => `${d} 天后重置`,
    usageThisCycle: "本周期用量",
    overage: "超额 $2 / 1k",
    signOut: "退出登录",
  },
  zht: {
    navOverview: "總覽",
    navFleet: "智能體團隊",
    navChannels: "通路",
    navBilling: "帳單與用量",
    workspace: "工作區",
    workspaceFallback: "工作區",
    hireNew: "+ 僱用新智能體",
    credits: "額度",
    resetsIn: (d) => `${d} 天後重置`,
    usageThisCycle: "本週期用量",
    overage: "超額 $2 / 1k",
    signOut: "登出",
  },
  ja: {
    navOverview: "概要",
    navFleet: "エージェント一覧",
    navChannels: "チャネル",
    navBilling: "請求と利用状況",
    workspace: "ワークスペース",
    workspaceFallback: "ワークスペース",
    hireNew: "+ 新しいエージェントを雇う",
    credits: "クレジット",
    resetsIn: (d) => `${d}日後にリセット`,
    usageThisCycle: "今サイクルの利用状況",
    overage: "超過分 $2 / 1k",
    signOut: "ログアウト",
  },
};
