/** Copy for the agent detail page (Activity / Tasks / Chat / Performance / Settings tabs). */
import type { Lang } from "@/lib/types";

export interface FleetDetailDict {
  // Tabs
  tabActivity: string;
  tabTasks: string;
  tabChat: string;
  tabPerformance: string;
  tabSettings: string;

  // Activity tab
  activityEmpty: string;

  // Tasks tab
  tasksEmpty: string;

  // Chat tab
  chatLoadError: string;
  chatSendError: string;
  chatWebConsole: string;
  chatAlsoOn: (channels: string) => string;
  chatLoading: string;
  chatEmpty: (name: string) => string;
  chatYou: string;
  chatPlaceholder: (name: string) => string;
  chatSending: string;
  chatSend: string;

  // Performance tab
  perfUpdateError: string;
  perfSelfReview: string;
  perfNoMetrics: string;
  perfImprovementQueue: string;
  perfNoImprovements: string;
  perfApproved: string;
  perfDismissed: string;
  perfApprove: string;
  perfDismiss: string;
  perfFootnote: string;

  // Settings — Identity
  identityTitle: string;
  identityDesc: string;
  fieldAgentName: string;
  fieldRole: string;
  fieldEngine: string;
  fieldEngineHint: string;
  engineOpenclaw: string;
  engineHermes: string;
  fieldPlan: string;
  planAssociate: string;
  planProfessional: string;
  planDirector: string;

  // Settings — Behavior
  behaviorTitle: string;
  behaviorDesc: string;
  fieldInstructions: string;
  fieldInstructionsHint: string;
  fieldRules: string;
  fieldRulesHint: string;
  fieldTone: string;
  fieldReplyLanguage: string;

  // Settings — Autonomy & approvals
  autonomyTitle: string;
  autonomyDesc: string;
  fieldAutonomy: string;
  fieldApprovalOver: string;
  fieldApprovalOverHint: string;
  fieldDailyActionLimit: string;
  fieldDailyActionLimitHint: string;
  toggleApproveExternal: string;
  toggleApproveExternalDesc: string;

  // Settings — Schedule
  scheduleTitle: string;
  scheduleDesc: string;
  toggleAlwaysOn: string;
  toggleAlwaysOnDesc: string;
  fieldStart: string;
  fieldEnd: string;
  fieldWorkingDays: string;
  fieldTimezone: string;
  fieldHeartbeat: string;
  fieldHeartbeatHint: string;
  heartbeat5: string;
  heartbeat15: string;
  heartbeat30: string;
  heartbeat60: string;

  // Settings — Model & reasoning
  modelTitle: string;
  modelBadge: string;
  modelDesc: string;
  fieldModel: string;
  fieldCreativity: (temp: string) => string;
  fieldMaxTokens: string;
  fieldReasoningDepth: string;

  // Settings — Skills & tools
  skillsTitle: string;
  skillsDesc: string;
  fieldSkills: string;
  fieldLocalExecution: string;

  // Settings — Learning loop
  learningTitle: string;
  learningDesc: string;
  toggleSelfImprove: string;
  toggleSelfImproveDesc: string;
  toggleAutoCreateSkills: string;
  toggleAutoCreateSkillsDesc: string;

  // Settings — Memory & knowledge
  memoryTitle: string;
  memoryDesc: string;
  togglePersistentMemory: string;
  togglePersistentMemoryDesc: string;
  fieldRetention: string;
  fieldKnowledgeSources: string;
  fieldKnowledgeSourcesHint: string;
  knowledgePlaceholder: string;
  addBtn: string;
  removeAria: string;

  // Settings — Channels
  channelsTitle: string;
  channelsDesc: string;

  // Settings — Escalation & notifications
  escalationTitle: string;
  escalationDesc: string;
  fieldEscalateTo: string;
  escalateToPlaceholder: string;
  toggleNotifyReview: string;
  toggleNotifyErrors: string;
  toggleDailyDigest: string;
  fieldDigestTime: string;

  // Settings — Limits
  limitsTitle: string;
  limitsDesc: string;
  fieldMonthlyCap: string;
  fieldMonthlyCapHint: string;

  // Settings — Save / runtime / danger sidebar
  saving: string;
  saved: string;
  saveChanges: string;
  saveNote: string;
  saveError: string;
  runtime: string;
  runtimeEngine: string;
  runtimeMachine: string;
  runtimeStatus: string;
  resumeAgent: string;
  pauseAgent: string;
  terminateAgent: string;
  dangerNote: string;
  lifecycleError: string;

  // Detail shell
  loadAgentError: string;
  loadingAgent: string;
  notFoundTitle: string;
  notFoundBody: string;
  allAgents: string;
  statUptime: string;
  statCredits: string;
  statStatus: string;
}

const en: FleetDetailDict = {
  tabActivity: "Activity",
  tabTasks: "Tasks",
  tabChat: "Chat",
  tabPerformance: "Performance",
  tabSettings: "Settings",

  activityEmpty: "No activity yet — this agent hasn’t logged anything.",

  tasksEmpty: "No tasks queued for this agent.",

  chatLoadError: "Couldn’t load chat history.",
  chatSendError: "Message failed to send.",
  chatWebConsole: "WEB CONSOLE",
  chatAlsoOn: (channels) => ` · ALSO ON ${channels}`,
  chatLoading: "Loading conversation…",
  chatEmpty: (name) => `No messages yet. Say hello to ${name}.`,
  chatYou: "YOU",
  chatPlaceholder: (name) => `Message ${name}…`,
  chatSending: "Sending…",
  chatSend: "Send",

  perfUpdateError: "Couldn’t update the improvement.",
  perfSelfReview: "SELF-REVIEW",
  perfNoMetrics: "No metrics recorded yet.",
  perfImprovementQueue: "IMPROVEMENT QUEUE",
  perfNoImprovements: "The agent has no proposed improvements right now.",
  perfApproved: "✓ Approved",
  perfDismissed: "Dismissed",
  perfApprove: "Approve",
  perfDismiss: "Dismiss",
  perfFootnote: "Approved changes apply at the next self-review cycle. The agent never changes its own rules.",

  identityTitle: "IDENTITY",
  identityDesc: "Who this agent is and what powers it.",
  fieldAgentName: "AGENT NAME",
  fieldRole: "ROLE",
  fieldEngine: "ENGINE",
  fieldEngineHint: "Switching re-deploys the agent on its next cycle.",
  engineOpenclaw: "OpenClaw — open runtime",
  engineHermes: "Hermes — precision",
  fieldPlan: "PLAN",
  planAssociate: "Associate",
  planProfessional: "Professional",
  planDirector: "Director",

  behaviorTitle: "BEHAVIOR",
  behaviorDesc: "How the agent works and talks.",
  fieldInstructions: "INSTRUCTIONS",
  fieldInstructionsHint: "The job brief — what this agent should do.",
  fieldRules: "RULES & BOUNDARIES",
  fieldRulesHint: "Hard limits the agent must never cross.",
  fieldTone: "TONE",
  fieldReplyLanguage: "REPLY LANGUAGE",

  autonomyTitle: "AUTONOMY & APPROVALS",
  autonomyDesc: "How much the agent can do on its own.",
  fieldAutonomy: "AUTONOMY",
  fieldApprovalOver: "APPROVAL OVER ($)",
  fieldApprovalOverHint: "Require sign-off for money/commitments at or above this.",
  fieldDailyActionLimit: "DAILY ACTION LIMIT",
  fieldDailyActionLimitHint: "0 = unlimited.",
  toggleApproveExternal: "Approve external sends",
  toggleApproveExternalDesc: "Hold outbound messages/emails for your approval before sending.",

  scheduleTitle: "SCHEDULE",
  scheduleDesc: "When the agent runs.",
  toggleAlwaysOn: "Always on (24/7)",
  toggleAlwaysOnDesc: "Turn off to restrict the agent to working hours.",
  fieldStart: "START",
  fieldEnd: "END",
  fieldWorkingDays: "WORKING DAYS",
  fieldTimezone: "TIMEZONE",
  fieldHeartbeat: "HEARTBEAT",
  fieldHeartbeatHint: "How often the agent wakes to check for work.",
  heartbeat5: "Every 5 min",
  heartbeat15: "Every 15 min",
  heartbeat30: "Every 30 min",
  heartbeat60: "Hourly",

  modelTitle: "MODEL & REASONING",
  modelBadge: "LLM PROVIDER",
  modelDesc: "Both engines are model-agnostic.",
  fieldModel: "MODEL",
  fieldCreativity: (temp) => `CREATIVITY (TEMPERATURE) · ${temp}`,
  fieldMaxTokens: "MAX TOKENS",
  fieldReasoningDepth: "REASONING DEPTH",

  skillsTitle: "SKILLS & TOOLS",
  skillsDesc: "Plugins the agent can use and what it may execute.",
  fieldSkills: "SKILLS",
  fieldLocalExecution: "LOCAL EXECUTION",

  learningTitle: "LEARNING LOOP",
  learningDesc: "Self-improvement from experience.",
  toggleSelfImprove: "Self-improve from memory",
  toggleSelfImproveDesc: "Periodically review past work and refine its approach.",
  toggleAutoCreateSkills: "Auto-create skills",
  toggleAutoCreateSkillsDesc: "Save reusable skills after completing complex tasks.",

  memoryTitle: "MEMORY & KNOWLEDGE",
  memoryDesc: "What the agent remembers and can reference.",
  togglePersistentMemory: "Persistent memory",
  togglePersistentMemoryDesc: "Remember context across runs and conversations.",
  fieldRetention: "RETENTION (DAYS)",
  fieldKnowledgeSources: "KNOWLEDGE SOURCES",
  fieldKnowledgeSourcesHint: "URLs or docs the agent can ground its answers in.",
  knowledgePlaceholder: "https://docs.company.com/handbook",
  addBtn: "+ Add",
  removeAria: "Remove",

  channelsTitle: "CHANNELS",
  channelsDesc: "Where this agent talks to people.",

  escalationTitle: "ESCALATION & NOTIFICATIONS",
  escalationDesc: "When and how the agent reaches you.",
  fieldEscalateTo: "ESCALATE TO (EMAIL)",
  escalateToPlaceholder: "you@company.com",
  toggleNotifyReview: "Notify when something needs review",
  toggleNotifyErrors: "Notify on errors",
  toggleDailyDigest: "Daily digest",
  fieldDigestTime: "DIGEST TIME",

  limitsTitle: "LIMITS",
  limitsDesc: "Guard your spend.",
  fieldMonthlyCap: "MONTHLY CREDIT CAP",
  fieldMonthlyCapHint: "0 = use the plan allowance. Agent pauses if exceeded.",

  saving: "Saving…",
  saved: "✓ Saved",
  saveChanges: "Save changes",
  saveNote: "Re-briefed to the agent on its next cycle — no restart needed.",
  saveError: "Couldn’t save changes.",
  runtime: "RUNTIME",
  runtimeEngine: "Engine",
  runtimeMachine: "Machine",
  runtimeStatus: "Status",
  resumeAgent: "Resume agent",
  pauseAgent: "Pause agent",
  terminateAgent: "Terminate agent",
  dangerNote: "Pausing keeps memory and state. Terminating archives the agent and its VM after 30 days.",
  lifecycleError: "Lifecycle action failed.",

  loadAgentError: "Couldn’t load this agent.",
  loadingAgent: "Loading agent…",
  notFoundTitle: "Agent not found",
  notFoundBody: "This agent doesn’t exist or has been terminated.",
  allAgents: "← All agents",
  statUptime: "UPTIME",
  statCredits: "CREDITS / MO",
  statStatus: "STATUS",
};

const zh: FleetDetailDict = {
  tabActivity: "动态",
  tabTasks: "任务",
  tabChat: "对话",
  tabPerformance: "表现",
  tabSettings: "设置",

  activityEmpty: "暂无动态——这位智能体还没有记录任何内容。",

  tasksEmpty: "该智能体暂无排队任务。",

  chatLoadError: "无法加载聊天记录。",
  chatSendError: "消息发送失败。",
  chatWebConsole: "网页控制台",
  chatAlsoOn: (channels) => ` · 同时接入 ${channels}`,
  chatLoading: "正在加载对话…",
  chatEmpty: (name) => `还没有消息，跟 ${name} 打个招呼吧。`,
  chatYou: "你",
  chatPlaceholder: (name) => `给 ${name} 发消息…`,
  chatSending: "发送中…",
  chatSend: "发送",

  perfUpdateError: "无法更新该优化项。",
  perfSelfReview: "自我复盘",
  perfNoMetrics: "暂无记录的指标。",
  perfImprovementQueue: "优化队列",
  perfNoImprovements: "智能体目前没有提出任何优化建议。",
  perfApproved: "✓ 已批准",
  perfDismissed: "已忽略",
  perfApprove: "批准",
  perfDismiss: "忽略",
  perfFootnote: "已批准的改动将在下一次自我复盘周期生效。智能体永远不会修改自身规则。",

  identityTitle: "身份",
  identityDesc: "这位智能体是谁，由什么驱动。",
  fieldAgentName: "智能体名称",
  fieldRole: "职位",
  fieldEngine: "引擎",
  fieldEngineHint: "切换后将在下一个周期重新部署智能体。",
  engineOpenclaw: "OpenClaw — 开放运行时",
  engineHermes: "Hermes — 精准模式",
  fieldPlan: "套餐",
  planAssociate: "助理",
  planProfessional: "专业",
  planDirector: "总监",

  behaviorTitle: "行为",
  behaviorDesc: "智能体如何工作与表达。",
  fieldInstructions: "工作说明",
  fieldInstructionsHint: "工作简报——这位智能体该做什么。",
  fieldRules: "规则与边界",
  fieldRulesHint: "智能体绝不能逾越的硬性限制。",
  fieldTone: "语气",
  fieldReplyLanguage: "回复语言",

  autonomyTitle: "自主权与审批",
  autonomyDesc: "智能体能自行决定多少事情。",
  fieldAutonomy: "自主程度",
  fieldApprovalOver: "审批阈值（$）",
  fieldApprovalOverHint: "达到或超过此金额的资金/承诺需经你确认。",
  fieldDailyActionLimit: "每日操作上限",
  fieldDailyActionLimitHint: "0 = 不限。",
  toggleApproveExternal: "外发内容需审批",
  toggleApproveExternalDesc: "在发送前暂存对外消息/邮件，待你批准。",

  scheduleTitle: "排班",
  scheduleDesc: "智能体的运行时段。",
  toggleAlwaysOn: "全天候运行（24/7）",
  toggleAlwaysOnDesc: "关闭后可将智能体限定在工作时间内运行。",
  fieldStart: "开始",
  fieldEnd: "结束",
  fieldWorkingDays: "工作日",
  fieldTimezone: "时区",
  fieldHeartbeat: "心跳间隔",
  fieldHeartbeatHint: "智能体每隔多久醒来检查待办工作。",
  heartbeat5: "每 5 分钟",
  heartbeat15: "每 15 分钟",
  heartbeat30: "每 30 分钟",
  heartbeat60: "每小时",

  modelTitle: "模型与推理",
  modelBadge: "LLM 提供方",
  modelDesc: "两种引擎均与模型无关。",
  fieldModel: "模型",
  fieldCreativity: (temp) => `创造力（温度）· ${temp}`,
  fieldMaxTokens: "最大 Token 数",
  fieldReasoningDepth: "推理深度",

  skillsTitle: "技能与工具",
  skillsDesc: "智能体可使用的插件及其可执行的操作。",
  fieldSkills: "技能",
  fieldLocalExecution: "本地执行",

  learningTitle: "学习闭环",
  learningDesc: "从经验中自我提升。",
  toggleSelfImprove: "基于记忆自我提升",
  toggleSelfImproveDesc: "定期复盘过往工作并优化做法。",
  toggleAutoCreateSkills: "自动创建技能",
  toggleAutoCreateSkillsDesc: "完成复杂任务后保存可复用的技能。",

  memoryTitle: "记忆与知识",
  memoryDesc: "智能体记住并可引用的内容。",
  togglePersistentMemory: "持久记忆",
  togglePersistentMemoryDesc: "跨运行与对话保留上下文。",
  fieldRetention: "保留天数",
  fieldKnowledgeSources: "知识来源",
  fieldKnowledgeSourcesHint: "智能体可据以作答的网址或文档。",
  knowledgePlaceholder: "https://docs.company.com/handbook",
  addBtn: "+ 添加",
  removeAria: "移除",

  channelsTitle: "渠道",
  channelsDesc: "这位智能体与人沟通的场所。",

  escalationTitle: "升级与通知",
  escalationDesc: "智能体在何时、以何种方式联系你。",
  fieldEscalateTo: "升级联系人（邮箱）",
  escalateToPlaceholder: "you@company.com",
  toggleNotifyReview: "有内容需复核时通知我",
  toggleNotifyErrors: "出错时通知我",
  toggleDailyDigest: "每日摘要",
  fieldDigestTime: "摘要时间",

  limitsTitle: "限额",
  limitsDesc: "守住你的开支。",
  fieldMonthlyCap: "每月额度上限",
  fieldMonthlyCapHint: "0 = 使用套餐额度。超出后智能体将暂停。",

  saving: "保存中…",
  saved: "✓ 已保存",
  saveChanges: "保存更改",
  saveNote: "将在下一个周期重新简报给智能体——无需重启。",
  saveError: "无法保存更改。",
  runtime: "运行时",
  runtimeEngine: "引擎",
  runtimeMachine: "机器",
  runtimeStatus: "状态",
  resumeAgent: "恢复智能体",
  pauseAgent: "暂停智能体",
  terminateAgent: "终止智能体",
  dangerNote: "暂停会保留记忆与状态。终止将在 30 天后归档智能体及其虚拟机。",
  lifecycleError: "生命周期操作失败。",

  loadAgentError: "无法加载该智能体。",
  loadingAgent: "正在加载智能体…",
  notFoundTitle: "找不到智能体",
  notFoundBody: "该智能体不存在或已被终止。",
  allAgents: "← 全部智能体",
  statUptime: "在线时长",
  statCredits: "本月额度",
  statStatus: "状态",
};

const zht: FleetDetailDict = {
  tabActivity: "動態",
  tabTasks: "任務",
  tabChat: "對話",
  tabPerformance: "表現",
  tabSettings: "設定",

  activityEmpty: "尚無動態——這位智能體還沒有記錄任何內容。",

  tasksEmpty: "該智能體目前沒有排隊任務。",

  chatLoadError: "無法載入聊天記錄。",
  chatSendError: "訊息傳送失敗。",
  chatWebConsole: "網頁主控台",
  chatAlsoOn: (channels) => ` · 同時接入 ${channels}`,
  chatLoading: "正在載入對話…",
  chatEmpty: (name) => `還沒有訊息，跟 ${name} 打個招呼吧。`,
  chatYou: "你",
  chatPlaceholder: (name) => `傳訊息給 ${name}…`,
  chatSending: "傳送中…",
  chatSend: "傳送",

  perfUpdateError: "無法更新該優化項目。",
  perfSelfReview: "自我檢視",
  perfNoMetrics: "尚無記錄的指標。",
  perfImprovementQueue: "優化佇列",
  perfNoImprovements: "智能體目前沒有提出任何優化建議。",
  perfApproved: "✓ 已核准",
  perfDismissed: "已忽略",
  perfApprove: "核准",
  perfDismiss: "忽略",
  perfFootnote: "已核准的變更會在下一次自我檢視週期生效。智能體永遠不會修改自身規則。",

  identityTitle: "身分",
  identityDesc: "這位智能體是誰，由什麼驅動。",
  fieldAgentName: "智能體名稱",
  fieldRole: "職位",
  fieldEngine: "引擎",
  fieldEngineHint: "切換後將在下一個週期重新部署智能體。",
  engineOpenclaw: "OpenClaw — 開放執行環境",
  engineHermes: "Hermes — 精準模式",
  fieldPlan: "方案",
  planAssociate: "助理",
  planProfessional: "專業",
  planDirector: "總監",

  behaviorTitle: "行為",
  behaviorDesc: "智能體如何工作與表達。",
  fieldInstructions: "工作說明",
  fieldInstructionsHint: "工作簡報——這位智能體該做什麼。",
  fieldRules: "規則與界線",
  fieldRulesHint: "智能體絕不能逾越的硬性限制。",
  fieldTone: "語氣",
  fieldReplyLanguage: "回覆語言",

  autonomyTitle: "自主權與審批",
  autonomyDesc: "智能體能自行決定多少事情。",
  fieldAutonomy: "自主程度",
  fieldApprovalOver: "審批門檻（$）",
  fieldApprovalOverHint: "達到或超過此金額的資金/承諾需經你確認。",
  fieldDailyActionLimit: "每日操作上限",
  fieldDailyActionLimitHint: "0 = 不限。",
  toggleApproveExternal: "外發內容需審批",
  toggleApproveExternalDesc: "在傳送前暫存對外訊息/郵件，待你核准。",

  scheduleTitle: "排班",
  scheduleDesc: "智能體的執行時段。",
  toggleAlwaysOn: "全天候執行（24/7）",
  toggleAlwaysOnDesc: "關閉後可將智能體限定在工作時間內執行。",
  fieldStart: "開始",
  fieldEnd: "結束",
  fieldWorkingDays: "工作日",
  fieldTimezone: "時區",
  fieldHeartbeat: "心跳間隔",
  fieldHeartbeatHint: "智能體每隔多久醒來檢查待辦工作。",
  heartbeat5: "每 5 分鐘",
  heartbeat15: "每 15 分鐘",
  heartbeat30: "每 30 分鐘",
  heartbeat60: "每小時",

  modelTitle: "模型與推理",
  modelBadge: "LLM 供應方",
  modelDesc: "兩種引擎皆與模型無關。",
  fieldModel: "模型",
  fieldCreativity: (temp) => `創造力（溫度）· ${temp}`,
  fieldMaxTokens: "最大 Token 數",
  fieldReasoningDepth: "推理深度",

  skillsTitle: "技能與工具",
  skillsDesc: "智能體可使用的外掛及其可執行的操作。",
  fieldSkills: "技能",
  fieldLocalExecution: "本機執行",

  learningTitle: "學習迴圈",
  learningDesc: "從經驗中自我提升。",
  toggleSelfImprove: "依記憶自我提升",
  toggleSelfImproveDesc: "定期檢視過往工作並優化做法。",
  toggleAutoCreateSkills: "自動建立技能",
  toggleAutoCreateSkillsDesc: "完成複雜任務後儲存可重用的技能。",

  memoryTitle: "記憶與知識",
  memoryDesc: "智能體記住並可引用的內容。",
  togglePersistentMemory: "持久記憶",
  togglePersistentMemoryDesc: "跨執行與對話保留脈絡。",
  fieldRetention: "保留天數",
  fieldKnowledgeSources: "知識來源",
  fieldKnowledgeSourcesHint: "智能體可據以作答的網址或文件。",
  knowledgePlaceholder: "https://docs.company.com/handbook",
  addBtn: "+ 新增",
  removeAria: "移除",

  channelsTitle: "通道",
  channelsDesc: "這位智能體與人溝通的場所。",

  escalationTitle: "升級與通知",
  escalationDesc: "智能體在何時、以何種方式聯絡你。",
  fieldEscalateTo: "升級聯絡人（電子郵件）",
  escalateToPlaceholder: "you@company.com",
  toggleNotifyReview: "有內容需覆核時通知我",
  toggleNotifyErrors: "發生錯誤時通知我",
  toggleDailyDigest: "每日摘要",
  fieldDigestTime: "摘要時間",

  limitsTitle: "限額",
  limitsDesc: "守住你的開支。",
  fieldMonthlyCap: "每月額度上限",
  fieldMonthlyCapHint: "0 = 使用方案額度。超出後智能體將暫停。",

  saving: "儲存中…",
  saved: "✓ 已儲存",
  saveChanges: "儲存變更",
  saveNote: "將在下一個週期重新簡報給智能體——無需重啟。",
  saveError: "無法儲存變更。",
  runtime: "執行環境",
  runtimeEngine: "引擎",
  runtimeMachine: "機器",
  runtimeStatus: "狀態",
  resumeAgent: "恢復智能體",
  pauseAgent: "暫停智能體",
  terminateAgent: "終止智能體",
  dangerNote: "暫停會保留記憶與狀態。終止將在 30 天後封存智能體及其虛擬機。",
  lifecycleError: "生命週期操作失敗。",

  loadAgentError: "無法載入該智能體。",
  loadingAgent: "正在載入智能體…",
  notFoundTitle: "找不到智能體",
  notFoundBody: "該智能體不存在或已被終止。",
  allAgents: "← 全部智能體",
  statUptime: "在線時長",
  statCredits: "本月額度",
  statStatus: "狀態",
};

const ja: FleetDetailDict = {
  tabActivity: "アクティビティ",
  tabTasks: "タスク",
  tabChat: "チャット",
  tabPerformance: "パフォーマンス",
  tabSettings: "設定",

  activityEmpty: "アクティビティはまだありません。このエージェントは何も記録していません。",

  tasksEmpty: "このエージェントに待機中のタスクはありません。",

  chatLoadError: "チャット履歴を読み込めませんでした。",
  chatSendError: "メッセージの送信に失敗しました。",
  chatWebConsole: "ウェブコンソール",
  chatAlsoOn: (channels) => ` · 連携中: ${channels}`,
  chatLoading: "会話を読み込み中…",
  chatEmpty: (name) => `まだメッセージがありません。${name} に挨拶してみましょう。`,
  chatYou: "あなた",
  chatPlaceholder: (name) => `${name} にメッセージ…`,
  chatSending: "送信中…",
  chatSend: "送信",

  perfUpdateError: "改善案を更新できませんでした。",
  perfSelfReview: "セルフレビュー",
  perfNoMetrics: "記録された指標はまだありません。",
  perfImprovementQueue: "改善キュー",
  perfNoImprovements: "現在、エージェントからの改善提案はありません。",
  perfApproved: "✓ 承認済み",
  perfDismissed: "却下済み",
  perfApprove: "承認",
  perfDismiss: "却下",
  perfFootnote: "承認した変更は次のセルフレビュー時に適用されます。エージェントが自身のルールを変更することはありません。",

  identityTitle: "アイデンティティ",
  identityDesc: "このエージェントが何者で、何で動いているか。",
  fieldAgentName: "エージェント名",
  fieldRole: "役割",
  fieldEngine: "エンジン",
  fieldEngineHint: "切り替えると次のサイクルでエージェントが再デプロイされます。",
  engineOpenclaw: "OpenClaw — オープンランタイム",
  engineHermes: "Hermes — 精密",
  fieldPlan: "プラン",
  planAssociate: "アソシエイト",
  planProfessional: "プロフェッショナル",
  planDirector: "ディレクター",

  behaviorTitle: "振る舞い",
  behaviorDesc: "エージェントの働き方と話し方。",
  fieldInstructions: "指示",
  fieldInstructionsHint: "業務概要——このエージェントが行うべきこと。",
  fieldRules: "ルールと境界",
  fieldRulesHint: "エージェントが決して越えてはならない制限。",
  fieldTone: "トーン",
  fieldReplyLanguage: "返信言語",

  autonomyTitle: "自律性と承認",
  autonomyDesc: "エージェントが自分で行える範囲。",
  fieldAutonomy: "自律性",
  fieldApprovalOver: "承認しきい値（$）",
  fieldApprovalOverHint: "この金額以上の支出・コミットには承認を必須にします。",
  fieldDailyActionLimit: "1日のアクション上限",
  fieldDailyActionLimitHint: "0 = 無制限。",
  toggleApproveExternal: "外部送信を承認制にする",
  toggleApproveExternalDesc: "送信前にメッセージ・メールを保留し、承認を待ちます。",

  scheduleTitle: "スケジュール",
  scheduleDesc: "エージェントの稼働時間。",
  toggleAlwaysOn: "常時稼働（24時間365日）",
  toggleAlwaysOnDesc: "オフにすると稼働を勤務時間内に限定できます。",
  fieldStart: "開始",
  fieldEnd: "終了",
  fieldWorkingDays: "稼働日",
  fieldTimezone: "タイムゾーン",
  fieldHeartbeat: "ハートビート",
  fieldHeartbeatHint: "エージェントが作業を確認するために起動する間隔。",
  heartbeat5: "5分ごと",
  heartbeat15: "15分ごと",
  heartbeat30: "30分ごと",
  heartbeat60: "1時間ごと",

  modelTitle: "モデルと推論",
  modelBadge: "LLM プロバイダー",
  modelDesc: "どちらのエンジンもモデル非依存です。",
  fieldModel: "モデル",
  fieldCreativity: (temp) => `創造性（温度）· ${temp}`,
  fieldMaxTokens: "最大トークン数",
  fieldReasoningDepth: "推論の深さ",

  skillsTitle: "スキルとツール",
  skillsDesc: "エージェントが使えるプラグインと実行できる操作。",
  fieldSkills: "スキル",
  fieldLocalExecution: "ローカル実行",

  learningTitle: "学習ループ",
  learningDesc: "経験からの自己改善。",
  toggleSelfImprove: "記憶から自己改善する",
  toggleSelfImproveDesc: "過去の作業を定期的に振り返り、進め方を改善します。",
  toggleAutoCreateSkills: "スキルを自動作成する",
  toggleAutoCreateSkillsDesc: "複雑なタスクの完了後に再利用可能なスキルを保存します。",

  memoryTitle: "メモリーとナレッジ",
  memoryDesc: "エージェントが記憶し参照できる内容。",
  togglePersistentMemory: "永続メモリー",
  togglePersistentMemoryDesc: "実行や会話をまたいでコンテキストを保持します。",
  fieldRetention: "保持日数",
  fieldKnowledgeSources: "ナレッジソース",
  fieldKnowledgeSourcesHint: "エージェントが回答の根拠にできるURLやドキュメント。",
  knowledgePlaceholder: "https://docs.company.com/handbook",
  addBtn: "+ 追加",
  removeAria: "削除",

  channelsTitle: "チャネル",
  channelsDesc: "このエージェントが人と対話する場所。",

  escalationTitle: "エスカレーションと通知",
  escalationDesc: "エージェントがいつ、どのように連絡してくるか。",
  fieldEscalateTo: "エスカレーション先（メール）",
  escalateToPlaceholder: "you@company.com",
  toggleNotifyReview: "確認が必要なときに通知する",
  toggleNotifyErrors: "エラー時に通知する",
  toggleDailyDigest: "デイリーダイジェスト",
  fieldDigestTime: "ダイジェスト時刻",

  limitsTitle: "上限",
  limitsDesc: "支出を守ります。",
  fieldMonthlyCap: "月間クレジット上限",
  fieldMonthlyCapHint: "0 = プランの割り当てを使用。超過するとエージェントは一時停止します。",

  saving: "保存中…",
  saved: "✓ 保存しました",
  saveChanges: "変更を保存",
  saveNote: "次のサイクルでエージェントに再ブリーフィングされます——再起動は不要です。",
  saveError: "変更を保存できませんでした。",
  runtime: "ランタイム",
  runtimeEngine: "エンジン",
  runtimeMachine: "マシン",
  runtimeStatus: "ステータス",
  resumeAgent: "エージェントを再開",
  pauseAgent: "エージェントを一時停止",
  terminateAgent: "エージェントを終了",
  dangerNote: "一時停止してもメモリーと状態は保持されます。終了すると30日後にエージェントとそのVMがアーカイブされます。",
  lifecycleError: "ライフサイクル操作に失敗しました。",

  loadAgentError: "このエージェントを読み込めませんでした。",
  loadingAgent: "エージェントを読み込み中…",
  notFoundTitle: "エージェントが見つかりません",
  notFoundBody: "このエージェントは存在しないか、終了されています。",
  allAgents: "← すべてのエージェント",
  statUptime: "稼働時間",
  statCredits: "今月のクレジット",
  statStatus: "ステータス",
};

export const fleetDetail: Record<Lang, FleetDetailDict> = { en, zh, zht, ja };
