import type { Lang } from "@/lib/types";

export interface LlmSettingsDict {
  callTitle: string; callSubtitle: string; channelSource: string; systemSource: string; customSource: string;
  selectChannel: string; selectModel: string; primaryModel: string; backupModel: string; modelPlaceholder: string; refreshModels: string; refreshing: string;
  save: string; saving: string; saved: string; routeSummary: string; systemManaged: string; noCustomForCall: string;
  manageTitle: string; manageSubtitle: string; systemTab: string; customTab: string; addChannel: string;
  systemIntro: string; customIntro: string; available: string; unavailable: string; enabled: string; disabled: string;
  provider: string; protocol: string; endpoint: string; models: string; lastSync: string; never: string;
  edit: string; remove: string; enable: string; disable: string; syncModels: string; noCustom: string;
  createTitle: string; editTitle: string; channelName: string; channelNamePlaceholder: string; customProvider: string;
  apiKey: string; apiKeyPlaceholder: string; apiKeyKeep: string; cancel: string; create: string; deleteTitle: string;
  deleteConfirm: (name: string) => string; deleteAction: string; fetchingModels: string; fetchedModels: (count: number) => string;
  testBeforeSave: string; loadError: string; saveError: string; modelError: string; deleteError: string; retry: string;
  noModels: string; manualModel: string; activeRoute: string; defaultBadge: string; credentialReady: string;
  modelList: string; modelIdPlaceholder: string; addModel: string; deleteModel: string; importModels: string;
}

const en: LlmSettingsDict = {
  callTitle: "Call configuration", callSubtitle: "Choose the channel and model used for workspace LLM calls.", channelSource: "Channel source", systemSource: "System channels", customSource: "Custom channels",
  selectChannel: "Channel", selectModel: "Model", primaryModel: "Primary model", backupModel: "Backup model (optional)", modelPlaceholder: "Select or enter a model ID", refreshModels: "Refresh models", refreshing: "Refreshing...",
  save: "Save configuration", saving: "Saving...", saved: "Configuration saved", routeSummary: "Current route", systemManaged: "Credentials are managed by the platform.", noCustomForCall: "Create and enable a custom channel before selecting one here.",
  manageTitle: "Channel management", manageSubtitle: "Manage model providers, protocols, credentials, and available models.", systemTab: "System channels", customTab: "Custom channels", addChannel: "Add channel",
  systemIntro: "System channels are operated by ArkAgent and cannot be edited here.", customIntro: "Custom channels are private to this workspace. Credentials are encrypted at rest.", available: "Available", unavailable: "Unavailable", enabled: "Enabled", disabled: "Disabled",
  provider: "Provider", protocol: "Protocol", endpoint: "Base URL", models: "Models", lastSync: "Last synced", never: "Never",
  edit: "Edit", remove: "Delete", enable: "Enable", disable: "Disable", syncModels: "Fetch models", noCustom: "No custom channels yet.",
  createTitle: "Add custom channel", editTitle: "Edit custom channel", channelName: "Channel name", channelNamePlaceholder: "e.g. Production OpenAI", customProvider: "Custom", apiKey: "API key", apiKeyPlaceholder: "Enter provider API key", apiKeyKeep: "Leave blank to keep the current key.", cancel: "Cancel", create: "Save channel", deleteTitle: "Delete channel", deleteConfirm: (name) => `Delete “${name}”? Calls using it will fall back to the system default.`, deleteAction: "Delete",
  fetchingModels: "Fetching models...", fetchedModels: (count) => `${count} models found`, testBeforeSave: "Enter a Base URL and API key to fetch models before saving.", loadError: "Could not load LLM configuration.", saveError: "Could not save the configuration.", modelError: "Could not fetch models from this provider.", deleteError: "Could not delete the channel.", retry: "Retry",
  noModels: "No model list cached", manualModel: "You can enter a model ID manually.", activeRoute: "ACTIVE ROUTE", defaultBadge: "DEFAULT", credentialReady: "Credential configured",
  modelList: "Model list", modelIdPlaceholder: "Enter a model ID", addModel: "Add model", deleteModel: "Delete model", importModels: "Import list",
};

const zh: LlmSettingsDict = {
  callTitle: "调用配置", callSubtitle: "选择当前工作区调用大模型时使用的渠道和模型。", channelSource: "渠道来源", systemSource: "系统渠道", customSource: "自定义渠道",
  selectChannel: "选择渠道", selectModel: "选择模型", primaryModel: "主模型", backupModel: "备模型（可选）", modelPlaceholder: "选择或输入模型 ID", refreshModels: "刷新模型", refreshing: "正在刷新...",
  save: "保存配置", saving: "保存中...", saved: "配置已保存", routeSummary: "当前调用链路", systemManaged: "凭据由平台统一管理。", noCustomForCall: "请先在渠道管理中创建并启用自定义渠道。",
  manageTitle: "渠道管理", manageSubtitle: "管理模型厂商、接口协议、访问凭据和可用模型。", systemTab: "系统渠道", customTab: "自定义渠道", addChannel: "新增渠道",
  systemIntro: "系统渠道由 ArkAgent 统一运维，工作区内不可编辑。", customIntro: "自定义渠道仅当前工作区可用，API Key 会加密保存。", available: "可用", unavailable: "未配置", enabled: "已启用", disabled: "已停用",
  provider: "厂商", protocol: "协议", endpoint: "接口地址", models: "模型", lastSync: "最近同步", never: "从未同步",
  edit: "编辑", remove: "删除", enable: "启用", disable: "停用", syncModels: "获取模型", noCustom: "还没有自定义渠道。",
  createTitle: "新增自定义渠道", editTitle: "编辑自定义渠道", channelName: "渠道名称", channelNamePlaceholder: "例如：生产环境 OpenAI", customProvider: "自定义", apiKey: "API Key", apiKeyPlaceholder: "输入厂商 API Key", apiKeyKeep: "留空表示保留当前密钥。", cancel: "取消", create: "保存渠道", deleteTitle: "删除渠道", deleteConfirm: (name) => `确认删除“${name}”？正在使用该渠道的配置会回退到系统默认。`, deleteAction: "删除",
  fetchingModels: "正在获取模型...", fetchedModels: (count) => `已获取 ${count} 个模型`, testBeforeSave: "填写接口地址和 API Key 后可在保存前获取模型。", loadError: "无法加载 LLM 配置。", saveError: "无法保存配置。", modelError: "无法从该厂商获取模型。", deleteError: "无法删除渠道。", retry: "重试",
  noModels: "暂无模型缓存", manualModel: "也可以手动输入模型 ID。", activeRoute: "当前链路", defaultBadge: "默认", credentialReady: "凭据已配置",
  modelList: "模型列表", modelIdPlaceholder: "输入模型 ID", addModel: "新增模型", deleteModel: "删除模型", importModels: "导入列表",
};

const zht: LlmSettingsDict = {
  ...zh,
  callTitle: "調用設定", callSubtitle: "選擇目前工作區調用大模型時使用的通路和模型。", channelSource: "通路來源", systemSource: "系統通路", customSource: "自訂通路",
  selectChannel: "選擇通路", selectModel: "選擇模型", primaryModel: "主模型", backupModel: "備用模型（可選）", save: "儲存設定", saving: "儲存中...", saved: "設定已儲存", manageTitle: "通路管理", manageSubtitle: "管理模型廠商、介面協議、存取憑證和可用模型。", systemTab: "系統通路", customTab: "自訂通路", addChannel: "新增通路",
  edit: "編輯", remove: "刪除", enable: "啟用", disable: "停用", createTitle: "新增自訂通路", editTitle: "編輯自訂通路", create: "儲存通路", deleteTitle: "刪除通路", deleteAction: "刪除",
  modelList: "模型清單", modelIdPlaceholder: "輸入模型 ID", addModel: "新增模型", deleteModel: "刪除模型", importModels: "匯入清單",
};

const ja: LlmSettingsDict = {
  ...en,
  callTitle: "呼び出し設定", callSubtitle: "ワークスペースのLLM呼び出しに使うチャネルとモデルを選択します。", channelSource: "チャネル種別", systemSource: "システムチャネル", customSource: "カスタムチャネル",
  selectChannel: "チャネル", selectModel: "モデル", primaryModel: "主モデル", backupModel: "バックアップモデル（任意）", save: "設定を保存", saving: "保存中...", saved: "設定を保存しました", manageTitle: "チャネル管理", manageSubtitle: "モデルプロバイダー、プロトコル、認証情報、モデルを管理します。", systemTab: "システム", customTab: "カスタム", addChannel: "チャネルを追加",
  edit: "編集", remove: "削除", enable: "有効化", disable: "無効化", createTitle: "カスタムチャネルを追加", editTitle: "カスタムチャネルを編集", create: "チャネルを保存", deleteTitle: "チャネルを削除", deleteAction: "削除",
  modelList: "モデル一覧", modelIdPlaceholder: "モデルIDを入力", addModel: "モデルを追加", deleteModel: "モデルを削除", importModels: "一覧を取り込む",
};

export const llmSettings: Record<Lang, LlmSettingsDict> = { en, zh, zht, ja };
