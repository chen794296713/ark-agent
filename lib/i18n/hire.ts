/** Copy for the "hire an agent" wizard (/hire). */
import type { Lang } from "@/lib/types";

export interface HireDict {
  // Top bar
  back: string;
  newHire: string;
  stepCounter: (step: number) => string;

  // Stepper rail
  steps: {
    role: { label: string; sub: string };
    brief: { label: string; sub: string };
    engine: { label: string; sub: string };
    review: { label: string; sub: string };
  };
  tipLabel: string;
  tipBody: string;

  // Step 1 — Role
  s1Title: string;
  s1Sub: string;
  loadingRoles: string;
  rolesLoadError: string;
  noRoles: string;

  // Step 2 — Brief
  remindDefault: string;
  tasksDefault: string[];
  s2Title: string;
  s2Hiring: (role: string) => string;
  agentName: string;
  agentNamePlaceholder: string;
  instructions: string;
  instructionsPlaceholder: string;
  rules: string;
  rulesPlaceholder: string;
  generating: string;
  autoGenerate: string;
  firstTasks: string;
  addTaskPlaceholder: string;
  addTask: string;
  reminders: string;

  // Step 3 — Engine & channels
  s3Title: string;
  s3Sub: string;
  recommended: string;
  community: string;
  precision: string;
  autoMatch: string;
  autoMatchBlurb: string;
  openclawBlurb: string;
  hermesBlurb: string;
  channelsLabel: string;
  channelsNote: string;

  // Step 4 — Review & launch
  s4Title: string;
  s4Sub: string;
  rowRole: string;
  rowName: string;
  rowEngine: string;
  rowChannels: string;
  rowFirstTasks: string;
  rowPlan: string;
  webConsole: string;
  webSuffix: string;
  tasksQueued: (count: number, reminders: string) => string;
  launchBtn: (name: string) => string;
  launchFailed: string;
  agentLive: (name: string) => string;
  agentLiveSub: string;
  openDashboard: string;

  // Launch animation rows
  launchProvisioning: string;
  launchInstalling: (engine: string) => string;
  launchLoadingBrief: string;
  launchConnecting: (channels: string) => string;
  launchLive: (name: string) => string;

  // Engine label for "auto" in review/animation
  engineAuto: string;

  // Footer nav
  navBack: string;
  reviewNext: string;
  continueNext: string;
}

const en: HireDict = {
  back: "← ArkAgent",
  newHire: "NEW HIRE",
  stepCounter: (s) => `STEP ${s} / 4`,

  steps: {
    role: { label: "Role", sub: "Pick the job" },
    brief: { label: "Brief", sub: "Instructions & tasks" },
    engine: { label: "Engine & channels", sub: "OpenClaw / Hermes" },
    review: { label: "Review & launch", sub: "Provision the VM" },
  },
  tipLabel: "TIP",
  tipBody:
    "Write the brief like you're onboarding a sharp new hire on their first day. You can always add tasks later.",

  s1Title: "Choose the role",
  s1Sub: "Pick a ready-made role, or describe your own from scratch.",
  loadingRoles: "Loading roles…",
  rolesLoadError: "Couldn't load roles.",
  noRoles: "No roles are available right now.",

  remindDefault: "Daily summary at 18:00 · Weekly report Friday",
  tasksDefault: [
    "Build a list of 50 target accounts",
    "Send intro sequence to new leads",
  ],
  s2Title: "Write the job brief",
  s2Hiring: (role) => `Hiring: ${role} — plain language is all it needs.`,
  agentName: "AGENT NAME",
  agentNamePlaceholder: "e.g. Aria",
  instructions: "INSTRUCTIONS",
  instructionsPlaceholder:
    "Find logistics companies in Southeast Asia with 20–200 employees. Reach out on LinkedIn and email, qualify budget and timeline, then book intro calls on my calendar.",
  rules: "RULES & BOUNDARIES",
  rulesPlaceholder:
    "Never discount more than 10%. Escalate refund requests to me. Don't contact existing customers.",
  generating: "✦ GENERATING…",
  autoGenerate: "✦ AUTO-GENERATE",
  firstTasks: "FIRST TASKS",
  addTaskPlaceholder: "Add a task and press Enter…",
  addTask: "+ Add",
  reminders: "REMINDERS & SCHEDULE",

  s3Title: "Engine & channels",
  s3Sub:
    "Pick the runtime — or let us match it to the brief. Add the channels you'll manage it from.",
  recommended: "RECOMMENDED",
  community: "COMMUNITY",
  precision: "PRECISION",
  autoMatch: "Auto-match",
  autoMatchBlurb: "We read the brief and pick. Switch anytime.",
  openclawBlurb: "100+ skills, every chat channel, huge ecosystem.",
  hermesBlurb: "Deep reasoning, guardrails, full audit trail.",
  channelsLabel: "CHANNELS — WHERE YOU'LL TALK TO IT",
  channelsNote:
    "Web console is always included. Tokens & accounts are configured in Dashboard → Channels after launch.",

  s4Title: "Review & launch",
  s4Sub: "A dedicated machine will be provisioned for this agent.",
  rowRole: "ROLE",
  rowName: "NAME",
  rowEngine: "ENGINE",
  rowChannels: "CHANNELS",
  rowFirstTasks: "FIRST TASKS",
  rowPlan: "PLAN",
  webConsole: "Web console",
  webSuffix: "Web",
  tasksQueued: (count, reminders) => `${count} queued · reminders: ${reminders}`,
  launchBtn: (name) => `⏻ Launch ${name}`,
  launchFailed: "Launch failed. Please try again.",
  agentLive: (name) => `${name} is live.`,
  agentLiveSub: "First task started. You'll get a summary at 18:00.",
  openDashboard: "Open dashboard →",

  launchProvisioning: "Provisioning dedicated VM — sgp-07 (Singapore)",
  launchInstalling: (engine) => `Installing ${engine} runtime`,
  launchLoadingBrief: "Loading job brief, rules & first tasks",
  launchConnecting: (channels) => `Connecting ${channels}`,
  launchLive: (name) => `${name} is live — first task started`,

  engineAuto: "Auto-match (we pick per brief)",

  navBack: "← Back",
  reviewNext: "Review →",
  continueNext: "Continue →",
};

const zh: HireDict = {
  back: "← ArkAgent",
  newHire: "新员工",
  stepCounter: (s) => `第 ${s} 步 / 共 4 步`,

  steps: {
    role: { label: "岗位", sub: "选择职位" },
    brief: { label: "工作简报", sub: "指令与任务" },
    engine: { label: "引擎与渠道", sub: "OpenClaw / Hermes" },
    review: { label: "确认并启动", sub: "开通专属服务器" },
  },
  tipLabel: "提示",
  tipBody:
    "把简报写得像在为一位能干的新同事做入职培训。任务随时可以后续补充。",

  s1Title: "选择岗位",
  s1Sub: "挑一个现成岗位，或从零描述你想要的角色。",
  loadingRoles: "正在加载岗位…",
  rolesLoadError: "无法加载岗位。",
  noRoles: "目前暂无可用岗位。",

  remindDefault: "每天 18:00 汇总 · 每周五出周报",
  tasksDefault: [
    "整理出 50 个目标客户名单",
    "向新线索发送初次触达话术",
  ],
  s2Title: "撰写工作简报",
  s2Hiring: (role) => `正在雇佣：${role}——用大白话说清楚就够了。`,
  agentName: "智能体名称",
  agentNamePlaceholder: "例如 Aria",
  instructions: "工作指令",
  instructionsPlaceholder:
    "寻找东南亚 20–200 人规模的物流公司。通过 LinkedIn 和邮件主动接触，确认预算和时间表，然后在我的日历上预约初步沟通。",
  rules: "规则与边界",
  rulesPlaceholder:
    "折扣绝不超过 10%。退款请求一律转交给我处理。不要联系现有客户。",
  generating: "✦ 生成中…",
  autoGenerate: "✦ 自动生成",
  firstTasks: "首批任务",
  addTaskPlaceholder: "输入任务后按回车…",
  addTask: "+ 添加",
  reminders: "提醒与日程",

  s3Title: "引擎与渠道",
  s3Sub: "选择运行引擎，或交给我们根据简报自动匹配。再添加你用来管理它的渠道。",
  recommended: "推荐",
  community: "社区",
  precision: "精准",
  autoMatch: "自动匹配",
  autoMatchBlurb: "我们读懂简报后自动选择，随时可切换。",
  openclawBlurb: "100+ 技能、覆盖所有聊天渠道、生态庞大。",
  hermesBlurb: "深度推理、安全护栏、完整审计记录。",
  channelsLabel: "渠道——你将在哪里与它沟通",
  channelsNote: "网页控制台始终包含在内。令牌与账号将在启动后于 控制台 → 渠道 中配置。",

  s4Title: "确认并启动",
  s4Sub: "我们将为这个智能体开通一台专属服务器。",
  rowRole: "岗位",
  rowName: "名称",
  rowEngine: "引擎",
  rowChannels: "渠道",
  rowFirstTasks: "首批任务",
  rowPlan: "方案",
  webConsole: "网页控制台",
  webSuffix: "网页",
  tasksQueued: (count, reminders) => `已排队 ${count} 项 · 提醒：${reminders}`,
  launchBtn: (name) => `⏻ 启动 ${name}`,
  launchFailed: "启动失败，请重试。",
  agentLive: (name) => `${name} 已上线。`,
  agentLiveSub: "首个任务已开始。你将在 18:00 收到摘要。",
  openDashboard: "进入控制台 →",

  launchProvisioning: "正在开通专属服务器——sgp-07（新加坡）",
  launchInstalling: (engine) => `正在安装 ${engine} 运行环境`,
  launchLoadingBrief: "正在载入工作简报、规则与首批任务",
  launchConnecting: (channels) => `正在连接 ${channels}`,
  launchLive: (name) => `${name} 已上线——首个任务已启动`,

  engineAuto: "自动匹配（由我们按简报选择）",

  navBack: "← 返回",
  reviewNext: "去确认 →",
  continueNext: "继续 →",
};

const zht: HireDict = {
  back: "← ArkAgent",
  newHire: "新員工",
  stepCounter: (s) => `第 ${s} 步 / 共 4 步`,

  steps: {
    role: { label: "職位", sub: "選擇職務" },
    brief: { label: "工作簡報", sub: "指令與任務" },
    engine: { label: "引擎與管道", sub: "OpenClaw / Hermes" },
    review: { label: "確認並啟動", sub: "開通專屬伺服器" },
  },
  tipLabel: "提示",
  tipBody:
    "把簡報寫得像在為一位能幹的新同事做到職培訓。任務隨時都能之後再補充。",

  s1Title: "選擇職位",
  s1Sub: "挑一個現成職位，或從零描述你想要的角色。",
  loadingRoles: "正在載入職位…",
  rolesLoadError: "無法載入職位。",
  noRoles: "目前暫無可用職位。",

  remindDefault: "每天 18:00 彙整 · 每週五出週報",
  tasksDefault: [
    "整理出 50 個目標客戶名單",
    "向新名單發送初次接觸話術",
  ],
  s2Title: "撰寫工作簡報",
  s2Hiring: (role) => `正在僱用：${role}——用白話說清楚就夠了。`,
  agentName: "智能體名稱",
  agentNamePlaceholder: "例如 Aria",
  instructions: "工作指令",
  instructionsPlaceholder:
    "尋找東南亞 20–200 人規模的物流公司。透過 LinkedIn 和電子郵件主動接觸，確認預算與時程，然後在我的行事曆上預約初步通話。",
  rules: "規則與界線",
  rulesPlaceholder:
    "折扣絕不超過 10%。退款要求一律轉交給我處理。不要聯絡現有客戶。",
  generating: "✦ 產生中…",
  autoGenerate: "✦ 自動產生",
  firstTasks: "首批任務",
  addTaskPlaceholder: "輸入任務後按 Enter…",
  addTask: "+ 新增",
  reminders: "提醒與排程",

  s3Title: "引擎與管道",
  s3Sub: "選擇執行引擎，或交給我們依簡報自動配對。再加入你用來管理它的管道。",
  recommended: "推薦",
  community: "社群",
  precision: "精準",
  autoMatch: "自動配對",
  autoMatchBlurb: "我們讀懂簡報後自動選擇，隨時可切換。",
  openclawBlurb: "100+ 技能、涵蓋所有聊天管道、生態龐大。",
  hermesBlurb: "深度推理、安全護欄、完整稽核紀錄。",
  channelsLabel: "管道——你將在哪裡與它溝通",
  channelsNote: "網頁主控台一律包含在內。權杖與帳號將在啟動後於 主控台 → 管道 中設定。",

  s4Title: "確認並啟動",
  s4Sub: "我們將為這個智能體開通一台專屬伺服器。",
  rowRole: "職位",
  rowName: "名稱",
  rowEngine: "引擎",
  rowChannels: "管道",
  rowFirstTasks: "首批任務",
  rowPlan: "方案",
  webConsole: "網頁主控台",
  webSuffix: "網頁",
  tasksQueued: (count, reminders) => `已排入 ${count} 項 · 提醒：${reminders}`,
  launchBtn: (name) => `⏻ 啟動 ${name}`,
  launchFailed: "啟動失敗，請重試。",
  agentLive: (name) => `${name} 已上線。`,
  agentLiveSub: "首個任務已開始。你將在 18:00 收到摘要。",
  openDashboard: "進入主控台 →",

  launchProvisioning: "正在開通專屬伺服器——sgp-07（新加坡）",
  launchInstalling: (engine) => `正在安裝 ${engine} 執行環境`,
  launchLoadingBrief: "正在載入工作簡報、規則與首批任務",
  launchConnecting: (channels) => `正在連接 ${channels}`,
  launchLive: (name) => `${name} 已上線——首個任務已啟動`,

  engineAuto: "自動配對（由我們依簡報選擇）",

  navBack: "← 返回",
  reviewNext: "去確認 →",
  continueNext: "繼續 →",
};

const ja: HireDict = {
  back: "← ArkAgent",
  newHire: "新規採用",
  stepCounter: (s) => `ステップ ${s} / 4`,

  steps: {
    role: { label: "職種", sub: "仕事を選ぶ" },
    brief: { label: "ブリーフ", sub: "指示とタスク" },
    engine: { label: "エンジンとチャネル", sub: "OpenClaw / Hermes" },
    review: { label: "確認して起動", sub: "VM をプロビジョニング" },
  },
  tipLabel: "ヒント",
  tipBody:
    "優秀な新入社員の初日をオンボーディングするつもりでブリーフを書きましょう。タスクは後からいつでも追加できます。",

  s1Title: "職種を選ぶ",
  s1Sub: "用意された職種から選ぶか、独自の職種をゼロから記述してください。",
  loadingRoles: "職種を読み込み中…",
  rolesLoadError: "職種を読み込めませんでした。",
  noRoles: "現在、利用できる職種はありません。",

  remindDefault: "毎日18:00にサマリー · 毎週金曜にレポート",
  tasksDefault: [
    "ターゲット企業を50社リストアップ",
    "新規リードへ初回シーケンスを送信",
  ],

  s2Title: "ジョブブリーフを書く",
  s2Hiring: (role) => `採用中：${role} — ふだんの言葉で書くだけで十分です。`,
  agentName: "エージェント名",
  agentNamePlaceholder: "例：Aria",
  instructions: "指示",
  instructionsPlaceholder:
    "東南アジアで従業員20〜200名の物流企業を探してください。LinkedIn とメールでアプローチし、予算と時期を見極めたうえで、私のカレンダーに初回ミーティングを設定してください。",
  rules: "ルールと制約",
  rulesPlaceholder:
    "値引きは10%を超えないこと。返金の依頼は私にエスカレーションすること。既存顧客には連絡しないこと。",
  generating: "✦ 生成中…",
  autoGenerate: "✦ 自動生成",
  firstTasks: "最初のタスク",
  addTaskPlaceholder: "タスクを入力して Enter キー…",
  addTask: "+ 追加",
  reminders: "リマインダーとスケジュール",

  s3Title: "エンジンとチャネル",
  s3Sub:
    "ランタイムを選ぶか、ブリーフに合わせて自動でマッチングします。管理に使うチャネルも追加してください。",
  recommended: "おすすめ",
  community: "コミュニティ",
  precision: "高精度",
  autoMatch: "自動マッチング",
  autoMatchBlurb: "ブリーフを読み取って自動で選びます。いつでも切り替え可能。",
  openclawBlurb: "100以上のスキル、あらゆるチャットチャネル、巨大なエコシステム。",
  hermesBlurb: "深い推論、ガードレール、完全な監査ログ。",
  channelsLabel: "チャネル — どこでやり取りするか",
  channelsNote:
    "Web コンソールは常に含まれます。トークンとアカウントは起動後にダッシュボード → チャネルで設定します。",

  s4Title: "確認して起動",
  s4Sub: "このエージェント専用のマシンをプロビジョニングします。",
  rowRole: "職種",
  rowName: "名前",
  rowEngine: "エンジン",
  rowChannels: "チャネル",
  rowFirstTasks: "最初のタスク",
  rowPlan: "プラン",
  webConsole: "Web コンソール",
  webSuffix: "Web",
  tasksQueued: (count, reminders) => `${count}件をキュー登録 · リマインダー：${reminders}`,
  launchBtn: (name) => `⏻ ${name} を起動`,
  launchFailed: "起動に失敗しました。もう一度お試しください。",
  agentLive: (name) => `${name} が稼働中です。`,
  agentLiveSub: "最初のタスクを開始しました。18:00 にサマリーが届きます。",
  openDashboard: "ダッシュボードを開く →",

  launchProvisioning: "専用 VM をプロビジョニング中 — sgp-07（シンガポール）",
  launchInstalling: (engine) => `${engine} ランタイムをインストール中`,
  launchLoadingBrief: "ジョブブリーフ・ルール・最初のタスクを読み込み中",
  launchConnecting: (channels) => `${channels} に接続中`,
  launchLive: (name) => `${name} が稼働中 — 最初のタスクを開始しました`,

  engineAuto: "自動マッチング（ブリーフに応じて選択）",

  navBack: "← 戻る",
  reviewNext: "確認へ →",
  continueNext: "続ける →",
};

export const hire: Record<Lang, HireDict> = { en, zh, zht, ja };
