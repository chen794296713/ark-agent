import type { Lang } from "@/lib/types";

export interface ApiKeysDict {
  heading: string;
  intro: string;
  formTitle: string;
  name: string;
  namePlaceholder: string;
  permissions: string;
  read: string;
  readHelp: string;
  write: string;
  writeHelp: string;
  expires: string;
  never: string;
  expiresHelp: string;
  create: string;
  creating: string;
  listTitle: string;
  listIntro: string;
  empty: string;
  key: string;
  created: string;
  lastUsed: string;
  status: string;
  active: string;
  expired: string;
  copy: string;
  copied: string;
  remove: string;
  deleteConfirm: (name: string) => string;
  loadError: string;
  createError: string;
  deleteError: string;
  permissionRequired: string;
  expirationFuture: string;
  apiUsage: string;
  apiUsageHelp: string;
}

const en: ApiKeysDict = {
  heading: "API keys", intro: "Create credentials that can access the system API within your workspace.",
  formTitle: "Create API key", name: "Name", namePlaceholder: "e.g. Production integration",
  permissions: "Permissions", read: "Read", readHelp: "Allows GET, HEAD, and OPTIONS requests.",
  write: "Write", writeHelp: "Allows POST, PUT, PATCH, and DELETE requests.", expires: "Expiration",
  never: "Never expires", expiresHelp: "Optional. The key stops working immediately after this time.",
  create: "Create key", creating: "Creating…", listTitle: "Your API keys",
  listIntro: "Keys are stored in plaintext as requested and remain available to copy.", empty: "No API keys yet.",
  key: "API key", created: "Created", lastUsed: "Last used", status: "Status", active: "Active", expired: "Expired",
  copy: "Copy", copied: "Copied", remove: "Delete", deleteConfirm: (name) => `Delete “${name}”? This cannot be undone.`,
  loadError: "Could not load API keys.", createError: "Could not create the API key.", deleteError: "Could not delete the API key.",
  permissionRequired: "Select at least one permission.", expirationFuture: "Choose a future expiration time.",
  apiUsage: "Using the key", apiUsageHelp: "Send it as Authorization: Bearer <key> to any authenticated /api endpoint.",
};

const zh: ApiKeysDict = {
  heading: "API Key 管理", intro: "创建可访问当前工作区系统 API 的凭证。",
  formTitle: "创建 API Key", name: "名称", namePlaceholder: "例如：生产环境集成",
  permissions: "权限", read: "只读", readHelp: "允许 GET、HEAD 和 OPTIONS 请求。",
  write: "只写", writeHelp: "允许 POST、PUT、PATCH 和 DELETE 请求。", expires: "过期时间",
  never: "永不过期", expiresHelp: "可选。到期后 Key 会立即停止工作。", create: "创建 Key", creating: "正在创建…",
  listTitle: "API Key 列表", listIntro: "按照需求使用明文存储，可随时查看和复制。", empty: "暂无 API Key。",
  key: "API Key", created: "创建时间", lastUsed: "最后使用", status: "状态", active: "有效", expired: "已过期",
  copy: "复制", copied: "已复制", remove: "删除", deleteConfirm: (name) => `确定删除“${name}”吗？此操作无法撤销。`,
  loadError: "无法加载 API Key。", createError: "无法创建 API Key。", deleteError: "无法删除 API Key。",
  permissionRequired: "请至少选择一项权限。", expirationFuture: "请选择未来的过期时间。",
  apiUsage: "调用方式", apiUsageHelp: "访问任意需要认证的 /api 接口时，请携带 Authorization: Bearer <key>。",
};

export const apiKeysCopy: Record<Lang, ApiKeysDict> = {
  en,
  zh,
  zht: { ...zh, heading: "API Key 管理", intro: "建立可存取目前工作區系統 API 的憑證。", formTitle: "建立 API Key", create: "建立 Key", creating: "建立中…", empty: "尚無 API Key。", active: "有效", expired: "已過期" },
  ja: { ...en, heading: "API キー", intro: "現在のワークスペースのシステム API にアクセスする認証情報を作成します。", formTitle: "API キーを作成", name: "名前", permissions: "権限", read: "読み取り", write: "書き込み", expires: "有効期限", never: "無期限", create: "キーを作成", creating: "作成中…", listTitle: "API キー一覧", empty: "API キーはまだありません。", created: "作成日時", lastUsed: "最終使用", status: "状態", active: "有効", expired: "期限切れ", copy: "コピー", copied: "コピー済み", remove: "削除" },
};
