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
  /** Accessible label for the mobile drawer's close button. */
  closeMenu: string;
  /** Accessible label for the language switcher. */
  language: string;
  /** Accessible label for the theme switcher. */
  theme: string;
  themeDark: string;
  themeLight: string;
  /** Accessible label for the brand-direction picker. */
  direction: string;
  dirTerminal: string;
  dirIvory: string;
  dirMidnight: string;
  /** Aria label for one direction option, e.g. "Switch to Ivory Studio". */
  switchDirection: (label: string) => string;
  /**
   * Aria label for one theme option, e.g. "Switch to Warm mode". A function
   * because the mode labels already carry "mode"/模式/モード and because ja puts
   * the target first with the verb last — a template string could not do both.
   */
  switchTheme: (label: string) => string;
  /**
   * Aria labels for PasswordField's eye toggle. Shared rather than per-screen:
   * both the auth screen and the account screen mount that field.
   */
  showPassword: string;
  hidePassword: string;
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
    closeMenu: "Close menu",
    language: "Language",
    theme: "Theme",
    themeDark: "Dark mode",
    themeLight: "Light mode",
    direction: "Direction",
    dirTerminal: "Terminal Lime",
    dirIvory: "Ivory Studio",
    dirMidnight: "Midnight Console",
    switchDirection: (label) => `Switch to ${label}`,
    switchTheme: (label) => `Switch to ${label}`,
    showPassword: "Show password",
    hidePassword: "Hide password",
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
    closeMenu: "关闭菜单",
    language: "语言",
    theme: "主题",
    themeDark: "深色模式",
    themeLight: "浅色模式",
    direction: "风格",
    dirTerminal: "终端青柠",
    dirIvory: "象牙工作室",
    dirMidnight: "午夜控制台",
    switchDirection: (label) => `切换到${label}`,
    switchTheme: (label) => `切换到${label}`,
    showPassword: "显示密码",
    hidePassword: "隐藏密码",
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
    closeMenu: "關閉選單",
    language: "語言",
    theme: "主題",
    themeDark: "深色模式",
    themeLight: "淺色模式",
    direction: "風格",
    dirTerminal: "終端青檸",
    dirIvory: "象牙工作室",
    dirMidnight: "午夜控制台",
    switchDirection: (label) => `切換至${label}`,
    switchTheme: (label) => `切換至${label}`,
    showPassword: "顯示密碼",
    hidePassword: "隱藏密碼",
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
    closeMenu: "メニューを閉じる",
    language: "言語",
    theme: "テーマ",
    themeDark: "ダークモード",
    themeLight: "ライトモード",
    direction: "スタイル",
    dirTerminal: "ターミナル・ライム",
    dirIvory: "アイボリー・スタジオ",
    dirMidnight: "ミッドナイト・コンソール",
    switchDirection: (label) => `${label}に切り替える`,
    switchTheme: (label) => `${label}に切り替える`,
    showPassword: "パスワードを表示",
    hidePassword: "パスワードを非表示",
  },
};
