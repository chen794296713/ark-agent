import type { Lang } from "@/lib/types";

export interface ApiKeysDict {
  title: string; subtitle: string; add: string; name: string; key: string; description: string;
  expiration: string; status: string; lastUsed: string; actions: string; active: string; disabled: string;
  expired: string; never: string; neverUsed: string; createTitle: string; editTitle: string;
  namePlaceholder: string; descriptionPlaceholder: string; optional: string; create: string; creating: string;
  save: string; saving: string; cancel: string; edit: string; copy: string; copied: string;
  copyUnavailable: string; disable: string; enable: string; deleting: string; delete: string;
  deleteTitle: string; deleteConfirm: (name: string) => string; empty: string; loadError: string;
  createError: string; updateError: string; statusError: string; deleteError: string; newKeyTitle: string;
  newKeyBody: string; done: string; usage: string;
}

const en: ApiKeysDict = {
  title: "API keys", subtitle: "Manage credentials used by scripts and integrations to access ArkAgent APIs.",
  add: "+ Create API key", name: "Name", key: "API key", description: "Description", expiration: "Expiration",
  status: "Status", lastUsed: "Last used", actions: "Actions", active: "Active", disabled: "Disabled",
  expired: "Expired", never: "Never", neverUsed: "Never used", createTitle: "Create API key", editTitle: "Edit API key",
  namePlaceholder: "Production integration", descriptionPlaceholder: "Where and why this key is used",
  optional: "Optional — leave blank for no expiration", create: "Create", creating: "Creating…", save: "Save",
  saving: "Saving…", cancel: "Cancel", edit: "Edit", copy: "Copy", copied: "Copied",
  copyUnavailable: "For security, the complete key is available only in the browser session in which it was created.",
  disable: "Disable", enable: "Enable", deleting: "Deleting…", delete: "Delete", deleteTitle: "Delete API key",
  deleteConfirm: (name) => `Delete “${name}” permanently? Requests using it will immediately fail.`,
  empty: "No API keys yet.", loadError: "Could not load API keys.", createError: "Could not create the API key.",
  updateError: "Could not update the API key.", statusError: "Could not change the API key status.",
  deleteError: "Could not delete the API key.", newKeyTitle: "Copy your new API key",
  newKeyBody: "This key is shown only once. Store it somewhere secure before closing.", done: "Done",
  usage: "Use as: Authorization: Bearer <API_KEY>",
};

const zh: ApiKeysDict = {
  title: "API Key 管理", subtitle: "管理脚本和集成访问 ArkAgent API 时使用的凭证。",
  add: "+ 新增 API Key", name: "名称", key: "API Key", description: "描述", expiration: "有效期",
  status: "状态", lastUsed: "最后使用", actions: "操作", active: "有效", disabled: "已停用",
  expired: "已过期", never: "永不过期", neverUsed: "尚未使用", createTitle: "新增 API Key", editTitle: "修改 API Key",
  namePlaceholder: "生产环境集成", descriptionPlaceholder: "说明 Key 的用途和使用位置",
  optional: "可选，留空表示永不过期", create: "创建", creating: "创建中…", save: "保存",
  saving: "保存中…", cancel: "取消", edit: "修改", copy: "复制", copied: "已复制",
  copyUnavailable: "为保障安全，完整 Key 仅在创建它的当前浏览器会话内可复制。",
  disable: "停用", enable: "启用", deleting: "删除中…", delete: "删除", deleteTitle: "删除 API Key",
  deleteConfirm: (name) => `确定永久删除“${name}”吗？使用该 Key 的请求将立即失败。`,
  empty: "暂未创建 API Key。", loadError: "无法加载 API Key。", createError: "无法创建 API Key。",
  updateError: "无法修改 API Key。", statusError: "无法更新 API Key 状态。", deleteError: "无法删除 API Key。",
  newKeyTitle: "请复制新 API Key", newKeyBody: "该 Key 只显示一次，关闭前请保存到安全的位置。", done: "完成",
  usage: "使用方式：Authorization: Bearer <API_KEY>",
};

const zht: ApiKeysDict = {
  ...zh, title: "API Key 管理", subtitle: "管理腳本和整合存取 ArkAgent API 時使用的憑證。",
  description: "描述", expiration: "有效期限", status: "狀態", actions: "操作", active: "有效",
  disabled: "已停用", expired: "已過期", never: "永不過期", neverUsed: "尚未使用",
  createTitle: "新增 API Key", editTitle: "修改 API Key", optional: "選填，留空表示永不過期",
  create: "建立", creating: "建立中…", save: "儲存", saving: "儲存中…", cancel: "取消",
  copyUnavailable: "為保障安全，完整 Key 僅在建立它的目前瀏覽器工作階段內可複製。",
  disable: "停用", enable: "啟用", deleting: "刪除中…", delete: "刪除", deleteTitle: "刪除 API Key",
  deleteConfirm: (name) => `確定永久刪除「${name}」嗎？使用該 Key 的請求將立即失敗。`,
  empty: "尚未建立 API Key。", loadError: "無法載入 API Key。", createError: "無法建立 API Key。",
  updateError: "無法修改 API Key。", statusError: "無法更新 API Key 狀態。", deleteError: "無法刪除 API Key。",
  newKeyTitle: "請複製新的 API Key", newKeyBody: "該 Key 只顯示一次，關閉前請儲存到安全的位置。",
};

const ja: ApiKeysDict = {
  ...en, title: "APIキー管理", subtitle: "スクリプトや連携が ArkAgent API にアクセスするための認証情報を管理します。",
  add: "+ APIキーを追加", name: "名前", key: "APIキー", description: "説明", expiration: "有効期限",
  status: "状態", lastUsed: "最終使用", actions: "操作", active: "有効", disabled: "無効",
  expired: "期限切れ", never: "無期限", neverUsed: "未使用", createTitle: "APIキーを追加", editTitle: "APIキーを編集",
  optional: "任意。空欄の場合は無期限", create: "作成", creating: "作成中…", save: "保存", saving: "保存中…",
  cancel: "キャンセル", edit: "編集", copy: "コピー", copied: "コピー済み",
  copyUnavailable: "セキュリティ保護のため、完全なキーは作成したブラウザセッションでのみコピーできます。",
  disable: "無効化", enable: "有効化", deleting: "削除中…", delete: "削除", deleteTitle: "APIキーを削除",
  deleteConfirm: (name) => `「${name}」を完全に削除しますか？このキーを使うリクエストは直ちに失敗します。`,
  empty: "APIキーはまだありません。", loadError: "APIキーを読み込めませんでした。", createError: "APIキーを作成できませんでした。",
  updateError: "APIキーを更新できませんでした。", statusError: "APIキーの状態を変更できませんでした。",
  deleteError: "APIキーを削除できませんでした。", newKeyTitle: "新しいAPIキーをコピー",
  newKeyBody: "このキーは一度だけ表示されます。閉じる前に安全な場所へ保存してください。", done: "完了",
};

export const apiKeysText: Record<Lang, ApiKeysDict> = { en, zh, zht, ja };
