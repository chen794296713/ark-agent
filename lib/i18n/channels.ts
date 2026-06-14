/** Copy for the dashboard channels page. */
import type { Lang } from "@/lib/types";

export interface ChannelsDict {
  heading: string;
  intro: string;
  loading: string;
  loadError: string;
  retry: string;
  saveError: string;
  disconnectError: string;
  saving: string;
  saved: string;
  saveChanges: string;
  connect: string;
  disconnect: string;
  footnote: string;
  /** channelStatusDisplay labels, keyed by connection state. */
  statusConnected: string;
  statusPending: string;
  statusError: string;
  statusNotConnected: string;
}

const en: ChannelsDict = {
  heading: "Channels",
  intro: "Where you — and your customers — talk to your agents. Connect once; every agent can use it.",
  loading: "LOADING CHANNELS…",
  loadError: "Could not load channels.",
  retry: "Retry",
  saveError: "Could not save.",
  disconnectError: "Could not disconnect.",
  saving: "Saving…",
  saved: "✓ Saved",
  saveChanges: "Save changes",
  connect: "Connect",
  disconnect: "Disconnect",
  footnote: "Credentials are encrypted and scoped to this workspace. Agents request channel access per role — you approve once.",
  statusConnected: "CONNECTED",
  statusPending: "PENDING",
  statusError: "ERROR",
  statusNotConnected: "NOT CONNECTED",
};

const zh: ChannelsDict = {
  heading: "渠道",
  intro: "你和你的客户与智能体对话的地方。连接一次，所有智能体即可共用。",
  loading: "正在加载渠道…",
  loadError: "无法加载渠道。",
  retry: "重试",
  saveError: "保存失败。",
  disconnectError: "断开连接失败。",
  saving: "正在保存…",
  saved: "✓ 已保存",
  saveChanges: "保存更改",
  connect: "连接",
  disconnect: "断开连接",
  footnote: "凭据已加密，且仅限本工作区使用。智能体按角色申请渠道权限，由你一次授权。",
  statusConnected: "已连接",
  statusPending: "处理中",
  statusError: "错误",
  statusNotConnected: "未连接",
};

const zht: ChannelsDict = {
  heading: "渠道",
  intro: "你和你的客戶與智能體對話的地方。連接一次，所有智能體即可共用。",
  loading: "正在載入渠道…",
  loadError: "無法載入渠道。",
  retry: "重試",
  saveError: "儲存失敗。",
  disconnectError: "中斷連線失敗。",
  saving: "正在儲存…",
  saved: "✓ 已儲存",
  saveChanges: "儲存變更",
  connect: "連接",
  disconnect: "中斷連線",
  footnote: "憑證已加密，且僅限本工作區使用。智能體會依角色申請渠道權限，由你一次授權。",
  statusConnected: "已連接",
  statusPending: "處理中",
  statusError: "錯誤",
  statusNotConnected: "未連接",
};

const ja: ChannelsDict = {
  heading: "チャネル",
  intro: "あなたとお客様がエージェントと話す場所です。一度つなげば、すべてのエージェントが利用できます。",
  loading: "チャネルを読み込み中…",
  loadError: "チャネルを読み込めませんでした。",
  retry: "再試行",
  saveError: "保存できませんでした。",
  disconnectError: "切断できませんでした。",
  saving: "保存中…",
  saved: "✓ 保存しました",
  saveChanges: "変更を保存",
  connect: "接続",
  disconnect: "切断",
  footnote: "認証情報は暗号化され、このワークスペース内に限定されます。エージェントは役割ごとにチャネルへのアクセスを申請し、承認は一度だけで済みます。",
  statusConnected: "接続済み",
  statusPending: "保留中",
  statusError: "エラー",
  statusNotConnected: "未接続",
};

export const channels: Record<Lang, ChannelsDict> = { en, zh, zht, ja };
