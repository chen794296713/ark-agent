/** Copy for the dashboard overview page. */
import type { Lang } from "@/lib/types";

export interface DashboardDict {
  greeting: (name: string) => string;
  systemsNominal: string;
  statActiveAgents: string;
  statTasksThisWeek: string;
  statCreditsUsed: string;
  statNeedsReview: string;
  loadError: string;
  rosterHeading: string;
  loadingRoster: string;
  noAgents: string;
  hireFirstAgent: string;
  activityHeading: string;
  loadingActivity: string;
  noActivity: string;
}

const en: DashboardDict = {
  greeting: (name) => `Good morning, ${name}`,
  systemsNominal: "ALL SYSTEMS NOMINAL",
  statActiveAgents: "ACTIVE AGENTS",
  statTasksThisWeek: "TASKS THIS WEEK",
  statCreditsUsed: "CREDITS USED",
  statNeedsReview: "NEEDS YOUR REVIEW",
  loadError: "Failed to load dashboard",
  rosterHeading: "YOUR ROSTER",
  loadingRoster: "Loading roster…",
  noAgents: "No agents yet.",
  hireFirstAgent: "Hire your first agent",
  activityHeading: "LIVE ACTIVITY",
  loadingActivity: "Loading activity…",
  noActivity: "No activity yet.",
};

const zh: DashboardDict = {
  greeting: (name) => `早上好，${name}`,
  systemsNominal: "系统一切正常",
  statActiveAgents: "活跃智能体",
  statTasksThisWeek: "本周任务",
  statCreditsUsed: "已用额度",
  statNeedsReview: "待你审核",
  loadError: "仪表盘加载失败",
  rosterHeading: "我的团队",
  loadingRoster: "正在加载团队…",
  noAgents: "还没有智能体。",
  hireFirstAgent: "雇佣第一个智能体",
  activityHeading: "实时动态",
  loadingActivity: "正在加载动态…",
  noActivity: "暂无动态。",
};

const zht: DashboardDict = {
  greeting: (name) => `早安，${name}`,
  systemsNominal: "系統一切正常",
  statActiveAgents: "活躍智能體",
  statTasksThisWeek: "本週任務",
  statCreditsUsed: "已用額度",
  statNeedsReview: "待你審核",
  loadError: "儀表板載入失敗",
  rosterHeading: "我的團隊",
  loadingRoster: "正在載入團隊…",
  noAgents: "尚未有智能體。",
  hireFirstAgent: "僱用第一個智能體",
  activityHeading: "即時動態",
  loadingActivity: "正在載入動態…",
  noActivity: "尚無動態。",
};

const ja: DashboardDict = {
  greeting: (name) => `おはようございます、${name}さん`,
  systemsNominal: "システムは全て正常",
  statActiveAgents: "稼働中のエージェント",
  statTasksThisWeek: "今週のタスク",
  statCreditsUsed: "使用クレジット",
  statNeedsReview: "要確認",
  loadError: "ダッシュボードの読み込みに失敗しました",
  rosterHeading: "あなたのチーム",
  loadingRoster: "チームを読み込み中…",
  noAgents: "エージェントはまだいません。",
  hireFirstAgent: "最初のエージェントを雇う",
  activityHeading: "リアルタイムの動き",
  loadingActivity: "アクティビティを読み込み中…",
  noActivity: "アクティビティはまだありません。",
};

export const dashboard: Record<Lang, DashboardDict> = { en, zh, zht, ja };
