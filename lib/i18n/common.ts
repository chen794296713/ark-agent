/** Shared copy used across the marketing nav, mobile drawer and dashboard. */
import type { Lang } from "@/lib/types";

export interface CommonDict {
  navAgents: string;
  navHow: string;
  navEngines: string;
  navPricing: string;
  signin: string;
  account: string;
  hire: string;
  loading: string;
  /** Accessible label for the language switcher. */
  language: string;
  /** DemoPill navigation */
  navLanding: string;
  navSignIn: string;
  navAccount: string;
  navHire: string;
  navDashboard: string;
  navFleet: string;
  navBilling: string;
  navPayment: string;
  navDirections: string;
}

export const common: Record<Lang, CommonDict> = {
  en: {
    navAgents: "Agents",
    navHow: "How it works",
    navEngines: "Engines",
    navPricing: "Pricing",
    signin: "Sign in",
    account: "Personal center",
    hire: "Hire an agent",
    loading: "Loading…",
    language: "Language",
    navLanding: "LANDING",
    navSignIn: "SIGN IN",
    navAccount: "PERSONAL CENTER",
    navHire: "HIRE",
    navDashboard: "DASHBOARD",
    navFleet: "FLEET",
    navBilling: "BILLING",
    navPayment: "PAYMENT",
    navDirections: "DIRECTIONS",
  },
  zh: {
    navAgents: "智能员工",
    navHow: "工作原理",
    navEngines: "引擎",
    navPricing: "价格",
    signin: "登录",
    account: "个人中心",
    hire: "雇佣智能体",
    loading: "加载中…",
    language: "语言",
    navLanding: "首页",
    navSignIn: "登录",
    navAccount: "个人中心",
    navHire: "雇佣",
    navDashboard: "控制台",
    navFleet: "团队",
    navBilling: "账单",
    navPayment: "支付",
    navDirections: "导航",
  },
  zht: {
    navAgents: "智能員工",
    navHow: "運作方式",
    navEngines: "引擎",
    navPricing: "價格",
    signin: "登入",
    account: "個人中心",
    hire: "僱用智能體",
    loading: "載入中…",
    language: "語言",
    navLanding: "首頁",
    navSignIn: "登入",
    navAccount: "個人中心",
    navHire: "僱用",
    navDashboard: "主控台",
    navFleet: "團隊",
    navBilling: "帳單",
    navPayment: "支付",
    navDirections: "導航",
  },
  ja: {
    navAgents: "エージェント",
    navHow: "仕組み",
    navEngines: "エンジン",
    navPricing: "料金",
    signin: "ログイン",
    account: "マイページ",
    hire: "エージェントを雇う",
    loading: "読み込み中…",
    language: "言語",
    navLanding: "ランディング",
    navSignIn: "ログイン",
    navAccount: "マイページ",
    navHire: "採用",
    navDashboard: "ダッシュボード",
    navFleet: "エージェント一覧",
    navBilling: "請求",
    navPayment: "支払い",
    navDirections: "方向",
  },
};
