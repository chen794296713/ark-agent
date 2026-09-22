import type { Lang } from "@/lib/types";

export interface LlmChannelsDict {
  heading: string;
  intro: string;
  add: string;
  loading: string;
  loadError: string;
  retry: string;
  name: string;
  type: string;
  endpoint: string;
  models: string;
  status: string;
  actions: string;
  custom: string;
  system: string;
  ready: string;
  unavailable: string;
  modelCount: (count: number) => string;
  edit: string;
  view: string;
  remove: string;
  empty: string;
  addTitle: string;
  editTitle: string;
  channelName: string;
  channelNamePlaceholder: string;
  baseUrl: string;
  apiKey: string;
  apiKeyPlaceholder: string;
  apiKeyKeep: string;
  modelList: string;
  modelListPlaceholder: string;
  modelHelp: string;
  fetchModels: string;
  fetchingModels: string;
  fetchedModels: (count: number) => string;
  cancel: string;
  save: string;
  saving: string;
  deleteConfirm: (name: string) => string;
  configInfo: string;
  keyConfigured: string;
  keyNotConfigured: string;
  close: string;
}

const en: LlmChannelsDict = {
  heading: "LLM channels", intro: "Manage system and custom model endpoints for your agents.", add: "Add channel",
  loading: "Loading LLM channels…", loadError: "Couldn't load LLM channels.", retry: "Retry",
  name: "Channel", type: "Type", endpoint: "Endpoint", models: "Models", status: "Status", actions: "Actions",
  custom: "Custom", system: "System", ready: "Ready", unavailable: "Not configured", modelCount: (n) => `${n} model${n === 1 ? "" : "s"}`,
  edit: "Edit", view: "View", remove: "Delete", empty: "No custom channels yet. Add one to use your own model provider.",
  addTitle: "Add LLM channel", editTitle: "Edit LLM channel", channelName: "Channel name", channelNamePlaceholder: "e.g. Company gateway",
  baseUrl: "API base URL", apiKey: "API key", apiKeyPlaceholder: "sk-…", apiKeyKeep: "Leave the masked value unchanged to keep the current key.",
  modelList: "Models", modelListPlaceholder: "One model ID per line", modelHelp: "Use provider model IDs, one per line. You can also fetch them automatically.",
  fetchModels: "Fetch models", fetchingModels: "Fetching…", fetchedModels: (n) => `Found ${n} models.`, cancel: "Cancel", save: "Save channel", saving: "Saving…",
  deleteConfirm: (name) => `Delete ${name}? Agents already using it will keep their saved selection, but the endpoint will no longer be available.`,
  configInfo: "Configuration", keyConfigured: "API key configured", keyNotConfigured: "API key not configured", close: "Close",
};

const zh: LlmChannelsDict = {
  heading: "LLM 渠道管理", intro: "统一管理智能体可用的系统渠道和自定义模型端点。", add: "新增渠道",
  loading: "正在加载 LLM 渠道…", loadError: "无法加载 LLM 渠道。", retry: "重试",
  name: "渠道", type: "类型", endpoint: "接口地址", models: "模型", status: "状态", actions: "操作",
  custom: "自定义", system: "系统", ready: "可用", unavailable: "未配置", modelCount: (n) => `${n} 个模型`,
  edit: "编辑", view: "查看", remove: "删除", empty: "还没有自定义渠道。新增渠道即可使用自己的模型服务。",
  addTitle: "新增 LLM 渠道", editTitle: "编辑 LLM 渠道", channelName: "渠道名称", channelNamePlaceholder: "例如：公司模型网关",
  baseUrl: "API 基础地址", apiKey: "API 密钥", apiKeyPlaceholder: "sk-…", apiKeyKeep: "保留遮罩值即可继续使用当前密钥。",
  modelList: "模型列表", modelListPlaceholder: "每行一个模型 ID", modelHelp: "填写供应商模型 ID，每行一个；也可以自动获取。",
  fetchModels: "自动获取模型", fetchingModels: "正在获取…", fetchedModels: (n) => `已获取 ${n} 个模型。`, cancel: "取消", save: "保存渠道", saving: "保存中…",
  deleteConfirm: (name) => `确定删除“${name}”吗？已保存该渠道的智能体会保留选择记录，但端点将不可再用。`,
  configInfo: "配置信息", keyConfigured: "API 密钥已配置", keyNotConfigured: "API 密钥未配置", close: "关闭",
};

const zht: LlmChannelsDict = {
  ...zh, heading: "LLM 通路管理", intro: "統一管理智能體可用的系統通路與自訂模型端點。", add: "新增通路",
  loading: "正在載入 LLM 通路…", loadError: "無法載入 LLM 通路。", custom: "自訂", system: "系統", ready: "可用", unavailable: "未設定",
  modelCount: (n) => `${n} 個模型`, edit: "編輯", view: "查看", remove: "刪除", empty: "尚無自訂通路。新增通路即可使用自己的模型服務。",
  addTitle: "新增 LLM 通路", editTitle: "編輯 LLM 通路", channelName: "通路名稱", channelNamePlaceholder: "例如：公司模型閘道",
  baseUrl: "API 基礎網址", apiKey: "API 金鑰", apiKeyKeep: "保留遮罩值即可繼續使用目前金鑰。", modelList: "模型清單",
  modelListPlaceholder: "每行一個模型 ID", modelHelp: "填寫供應商模型 ID，每行一個；也可以自動取得。", fetchModels: "自動取得模型",
  fetchingModels: "正在取得…", fetchedModels: (n) => `已取得 ${n} 個模型。`, cancel: "取消", save: "儲存通路", saving: "儲存中…",
  deleteConfirm: (name) => `確定刪除「${name}」嗎？已儲存此通路的智能體會保留選擇記錄，但端點將無法再使用。`,
  configInfo: "設定資訊", keyConfigured: "API 金鑰已設定", keyNotConfigured: "API 金鑰未設定", close: "關閉",
};

const ja: LlmChannelsDict = {
  ...en, heading: "LLM チャネル管理", intro: "エージェントが利用するシステムおよびカスタムモデルの接続先を管理します。", add: "チャネルを追加",
  loading: "LLM チャネルを読み込み中…", loadError: "LLM チャネルを読み込めませんでした。", retry: "再試行",
  name: "チャネル", type: "種類", endpoint: "エンドポイント", models: "モデル", status: "状態", actions: "操作",
  custom: "カスタム", system: "システム", ready: "利用可能", unavailable: "未設定", modelCount: (n) => `${n} モデル`,
  edit: "編集", view: "表示", remove: "削除", empty: "カスタムチャネルはまだありません。独自のモデルプロバイダーを追加できます。",
  addTitle: "LLM チャネルを追加", editTitle: "LLM チャネルを編集", channelName: "チャネル名", channelNamePlaceholder: "例：社内モデルゲートウェイ",
  baseUrl: "API ベース URL", apiKey: "API キー", apiKeyKeep: "マスクされた値を変更しなければ、現在のキーを維持します。",
  modelList: "モデル一覧", modelListPlaceholder: "1 行に 1 つのモデル ID", modelHelp: "プロバイダーのモデル ID を 1 行ずつ入力するか、自動取得してください。",
  fetchModels: "モデルを取得", fetchingModels: "取得中…", fetchedModels: (n) => `${n} モデルを取得しました。`, cancel: "キャンセル", save: "チャネルを保存", saving: "保存中…",
  deleteConfirm: (name) => `${name} を削除しますか？既存の選択は残りますが、この接続先は利用できなくなります。`,
  configInfo: "設定情報", keyConfigured: "API キー設定済み", keyNotConfigured: "API キー未設定", close: "閉じる",
};

export const llmChannelsCopy: Record<Lang, LlmChannelsDict> = { en, zh, zht, ja };
