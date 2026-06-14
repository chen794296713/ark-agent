/** Shared copy used across the marketing nav, mobile drawer and dashboard. */
import type { Lang } from "@/lib/types";

export interface CommonDict {
  navAgents: string;
  navHow: string;
  navEngines: string;
  navPricing: string;
  signin: string;
  hire: string;
  loading: string;
  /** Accessible label for the language switcher. */
  language: string;
}

export const common: Record<Lang, CommonDict> = {
  en: {
    navAgents: "Agents",
    navHow: "How it works",
    navEngines: "Engines",
    navPricing: "Pricing",
    signin: "Sign in",
    hire: "Hire an agent",
    loading: "Loading…",
    language: "Language",
  },
  zh: {
    navAgents: "智能员工",
    navHow: "工作原理",
    navEngines: "引擎",
    navPricing: "价格",
    signin: "登录",
    hire: "雇佣智能体",
    loading: "加载中…",
    language: "语言",
  },
  zht: {
    navAgents: "智能員工",
    navHow: "運作方式",
    navEngines: "引擎",
    navPricing: "價格",
    signin: "登入",
    hire: "僱用智能體",
    loading: "載入中…",
    language: "語言",
  },
  ja: {
    navAgents: "エージェント",
    navHow: "仕組み",
    navEngines: "エンジン",
    navPricing: "料金",
    signin: "ログイン",
    hire: "エージェントを雇う",
    loading: "読み込み中…",
    language: "言語",
  },
};
