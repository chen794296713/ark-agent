/** Copy for the fleet (agents list) page. */
import type { Lang } from "@/lib/types";

export interface FleetDict {
  heading: string;
  hireNewAgent: string;
  loadingFleet: string;
  loadError: string;
  noAgentsTitle: string;
  noAgentsBody: string;
  labelEngine: string;
  labelCredits: string;
  labelChannels: string;
  manage: string;
  pause: string;
  resume: string;
  chat: string;
  filterPlaceholder: string;
  filterAll: string;
  filterByEngine: string;
  filterByStatus: string;
  statusWorking: string;
  statusError: string;
  statusTerminated: string;
  clearFilters: string;
  noResults: string;
}

const en: FleetDict = {
  heading: "Fleet",
  hireNewAgent: "+ Hire new agent",
  loadingFleet: "LOADING FLEET…",
  loadError: "Failed to load fleet.",
  noAgentsTitle: "No agents yet",
  noAgentsBody: "Hire your first agent to start building your fleet.",
  labelEngine: "ENGINE",
  labelCredits: "CREDITS",
  labelChannels: "CHANNELS",
  manage: "Manage",
  pause: "Pause",
  resume: "Resume",
  chat: "Chat",
  filterPlaceholder: "Search by name…",
  filterAll: "All",
  filterByEngine: "Engine",
  filterByStatus: "Status",
  statusWorking: "Working",
  statusError: "Error",
  statusTerminated: "Terminated",
  clearFilters: "Clear filters",
  noResults: "No matching agents",
};

const zh: FleetDict = {
  heading: "智能体队伍",
  hireNewAgent: "+ 雇佣新智能体",
  loadingFleet: "正在加载队伍…",
  loadError: "无法加载队伍。",
  noAgentsTitle: "暂无智能体",
  noAgentsBody: "雇佣你的第一位智能体，开始组建你的队伍。",
  labelEngine: "引擎",
  labelCredits: "已用额度",
  labelChannels: "渠道",
  manage: "管理",
  pause: "暂停",
  resume: "恢复",
  chat: "对话",
  filterPlaceholder: "搜索名称…",
  filterAll: "全部",
  filterByEngine: "引擎",
  filterByStatus: "状态",
  statusWorking: "工作中",
  statusError: "错误",
  statusTerminated: "已终止",
  clearFilters: "清除筛选",
  noResults: "没有匹配的智能体",
};

const zht: FleetDict = {
  heading: "智能體隊伍",
  hireNewAgent: "+ 僱用新智能體",
  loadingFleet: "正在載入隊伍…",
  loadError: "無法載入隊伍。",
  noAgentsTitle: "尚無智能體",
  noAgentsBody: "僱用你的第一位智能體，開始組建你的隊伍。",
  labelEngine: "引擎",
  labelCredits: "已用額度",
  labelChannels: "通道",
  manage: "管理",
  pause: "暫停",
  resume: "恢復",
  chat: "對話",
  filterPlaceholder: "搜尋名稱…",
  filterAll: "全部",
  filterByEngine: "引擎",
  filterByStatus: "狀態",
  statusWorking: "工作中",
  statusError: "錯誤",
  statusTerminated: "已終止",
  clearFilters: "清除篩選",
  noResults: "沒有匹配的智能體",
};

const ja: FleetDict = {
  heading: "フリート",
  hireNewAgent: "+ エージェントを雇う",
  loadingFleet: "フリートを読み込み中…",
  loadError: "フリートの読み込みに失敗しました。",
  noAgentsTitle: "エージェントはまだいません",
  noAgentsBody: "最初のエージェントを雇って、フリートを構築しましょう。",
  labelEngine: "エンジン",
  labelCredits: "使用クレジット",
  labelChannels: "チャネル",
  manage: "管理",
  pause: "一時停止",
  resume: "再開",
  chat: "チャット",
  filterPlaceholder: "名前で検索…",
  filterAll: "すべて",
  filterByEngine: "エンジン",
  filterByStatus: "ステータス",
  statusWorking: "稼働中",
  statusError: "エラー",
  statusTerminated: "終了",
  clearFilters: "フィルターをクリア",
  noResults: "一致するエージェントなし",
};

export const fleet: Record<Lang, FleetDict> = { en, zh, zht, ja };
