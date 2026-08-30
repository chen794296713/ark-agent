/**
 * Copy for the Activity / observability views.
 *
 * Every closed vocabulary the runtime can put in a row is a translation key
 * here: the 24 activity codes, the 18 `errorCode` values, the 11 `skipReason`
 * values, the 5 `denyReason` values, and the trigger / status / phase /
 * severity / tag labels the filter chips render. Plus the empty states, which
 * at launch ARE this page — nothing writes the runtime tables yet — and the
 * three degradation banners.
 *
 * THE RULE THAT MATTERS MOST: a key with no entry renders as the raw key.
 * Ugly, honest, never a crash — and specifically never a fallback to English,
 * which would drop an English sentence into the middle of a Japanese feed and
 * read as a bug in the agent rather than a gap in a dictionary.
 *
 * Written natively in all four languages, not machine-translated.
 */
import type { Lang } from "@/lib/types";
import type { ActivityParams } from "@/lib/runtime/types";
import type {
  ActivityCode,
  ActivityTag,
  EmptyReason,
  HeartbeatState,
  RunStatus,
  RunTrigger,
  Severity,
  StepPhase,
  ViewKey,
} from "@/lib/activity/types";

export interface EmptyCopy {
  title: string;
  body: string;
}

export interface ActivityDict {
  /**
   * One template per activity code. `{param}` holes are filled from
   * `agent_activities.params`, which is UNTRUSTED third-party text: the
   * renderer emits the result as a text node and never as markup.
   */
  code: Record<ActivityCode, string>;
  /** The contract's `agent.error` vocabulary, plus the one ArkAgent raises itself. */
  error: Record<string, string>;
  /** `agent_schedule_runs.skip_reason` — 7 from the runtime, 4 ArkAgent-originated. */
  skipReason: Record<string, string>;
  /** `agent.tool_call.denyReason`. A denial is the policy working, not a fault. */
  denyReason: Record<string, string>;
  /**
   * `agent_metrics.label`. Deliberately EMPTY: the contract calls the label a
   * translation key but never enumerates the vocabulary, and inventing one
   * would put made-up metric names in front of a customer in four languages.
   * An unmapped label renders verbatim, which is the documented behaviour.
   */
  metric: Record<string, string>;
  severity: Record<Severity, string>;
  trigger: Record<RunTrigger, string>;
  phase: Record<StepPhase, string>;
  status: Record<RunStatus, string>;
  tag: Record<ActivityTag, string>;
  heartbeat: Record<HeartbeatState, string>;
  /** Not dismissible: a dismissed banner over generated data looks like production. */
  banner: Record<"mock" | "unconfigured" | "degraded", string>;
  empty: Record<ViewKey, Record<EmptyReason, EmptyCopy>>;
  action: {
    clearFilters: string;
    runNow: string;
    openChat: string;
    setUpSchedule: string;
    viewDeployment: string;
    whatsSupported: string;
    contactAdmin: string;
    tryAgain: string;
    loadMore: string;
  };
  label: {
    /** The chip on an inert specimen row. */
    example: string;
    loadFailed: string;
    searchPlaceholder: string;
    unpriced: string;
    unpricedNote: string;
    restartsObserved: string;
    simulatedSample: string;
    rolledUp: string;
    stepsTruncated: string;
    stepsPruned: string;
    detailTruncated: string;
    agentWritten: string;
    configPending: string;
    creditsLedger: string;
    llmLedger: string;
    runtimeLedger: string;
    ignoredFilters: string;
  };
  /** The chrome around the rows: filter bar, drawer, health and cost panels. */
  ui: ActivityUiCopy;
}

/**
 * Copy for the Activity CHROME — the filter bar, the run drawer, the health and
 * cost panels. Separate from the vocabularies above because those are things the
 * runtime said and these are things ArkAgent says about them.
 *
 * `{holes}` here are filled by the same single-pass `interpolate()` the activity
 * sentences use, so a count and a code go through one substitution path.
 */
export interface ActivityUiCopy {
  filter: {
    heading: string;
    range: string;
    range1d: string;
    range7d: string;
    range30d: string;
    range90d: string;
    severity: string;
    type: string;
    trigger: string;
    outcome: string;
    tag: string;
    channel: string;
    /** Why the channel select is disabled. The API 400s on the combination. */
    channelHint: string;
    all: string;
    search: string;
    /** `{id}` — the run a row was clicked from. */
    runScope: string;
    sessionScope: string;
    remove: string;
    activeCount: string;
    maxRange: string;
  };
  timeline: {
    heading: string;
    today: string;
    yesterday: string;
    dayCounts: string;
    stillRunning: string;
    endOfRange: string;
    openRun: string;
    steps: string;
    runLabel: string;
    sessionLabel: string;
    loading: string;
  };
  run: {
    heading: string;
    close: string;
    runId: string;
    session: string;
    trigger: string;
    started: string;
    finished: string;
    duration: string;
    steps: string;
    model: string;
    tokens: string;
    tokensIn: string;
    tokensOut: string;
    tokensCache: string;
    cost: string;
    error: string;
    trace: string;
    traceOrder: string;
    showDetail: string;
    hideDetail: string;
    noDetail: string;
    stepFailed: string;
    filterSession: string;
    loading: string;
  };
  health: {
    heading: string;
    liveness: string;
    heartbeat: string;
    activeRuns: string;
    uptime: string;
    configuration: string;
    revision: string;
    appliedRevision: string;
    capacity: string;
    cpu: string;
    memory: string;
    disk: string;
    peak: string;
    gap: string;
    legend: string;
    window: string;
    cellSize: string;
    ofLimit: string;
    noLimit: string;
    never: string;
    stateRunning: string;
    stateIdle: string;
    stateStopped: string;
    stateUnhealthy: string;
  };
  cost: {
    heading: string;
    total: string;
    runs: string;
    perRun: string;
    tokens: string;
    vsPrevious: string;
    noPrevious: string;
    daily: string;
    byTrigger: string;
    byModel: string;
    topRuns: string;
    calls: string;
    estimatedCalls: string;
    creditsUsed: string;
    byKind: string;
    noModel: string;
    share: string;
    ledgersNote: string;
    creditsNote: string;
    loading: string;
  };
}

const uiEn: ActivityUiCopy = {
  filter: {
    heading: "Filters",
    range: "Time range",
    range1d: "24 hours",
    range7d: "7 days",
    range30d: "30 days",
    range90d: "90 days",
    severity: "Severity",
    type: "Event type",
    trigger: "Trigger",
    outcome: "Outcome",
    tag: "Tag",
    channel: "Channel",
    channelHint: "Choose the sent- or received-message event type first — the channel lives inside those events.",
    all: "All",
    search: "Search",
    runScope: "Run {id}",
    sessionScope: "Session {id}",
    remove: "Remove",
    activeCount: "{n} on",
    maxRange: "90 days is the widest window Activity keeps.",
  },
  timeline: {
    heading: "Timeline",
    today: "Today",
    yesterday: "Yesterday",
    dayCounts: "{runs} runs · {ok} ok · {failed} failed",
    stillRunning: "{n} running",
    endOfRange: "That's the start of this window. Widen the range to look further back.",
    openRun: "Open run",
    steps: "{n} steps",
    runLabel: "Run",
    sessionLabel: "Session",
    loading: "Loading activity…",
  },
  run: {
    heading: "Run",
    close: "Close",
    runId: "Run ID",
    session: "Session",
    trigger: "Trigger",
    started: "Started",
    finished: "Finished",
    duration: "Duration",
    steps: "Steps",
    model: "Model",
    tokens: "Tokens",
    tokensIn: "In",
    tokensOut: "Out",
    tokensCache: "Cache",
    cost: "Cost",
    error: "Error",
    trace: "Step trace",
    traceOrder: "Shown in the order the runtime recorded them.",
    showDetail: "Show detail",
    hideDetail: "Hide detail",
    noDetail: "No detail recorded.",
    stepFailed: "Failed",
    filterSession: "Show this session in the timeline",
    loading: "Loading run…",
  },
  health: {
    heading: "Runtime health",
    liveness: "Liveness",
    heartbeat: "Last heartbeat",
    activeRuns: "Active runs",
    uptime: "Up since",
    configuration: "Configuration",
    revision: "Revision {n}",
    appliedRevision: "Runtime has {n}",
    capacity: "Capacity",
    cpu: "CPU",
    memory: "Memory",
    disk: "Disk",
    peak: "Peak {value}",
    gap: "No sample",
    legend: "Legend",
    window: "Last {hours} h",
    cellSize: "One cell ≈ {minutes} min",
    ofLimit: "{used} of {limit}",
    noLimit: "No limit reported",
    never: "Never",
    stateRunning: "Running",
    stateIdle: "Idle",
    stateStopped: "Stopped",
    stateUnhealthy: "Unhealthy",
  },
  cost: {
    heading: "Cost & tokens",
    total: "Reported cost",
    runs: "Runs",
    perRun: "Per run",
    tokens: "Tokens",
    vsPrevious: "vs previous {days} d",
    noPrevious: "No comparable window before this one",
    daily: "By day",
    byTrigger: "By trigger",
    byModel: "By model",
    topRuns: "Most expensive runs",
    calls: "Calls",
    estimatedCalls: "{n} of these had their token counts inferred.",
    creditsUsed: "Credits used",
    byKind: "By activity",
    noModel: "Model not reported",
    share: "{pct}%",
    ledgersNote: "Three separate ledgers. They are never added together.",
    creditsNote: "Credits are billing units, not dollars — ArkAgent doesn't convert them here.",
    loading: "Loading cost…",
  },
};

const uiZh: ActivityUiCopy = {
  filter: {
    heading: "筛选",
    range: "时间范围",
    range1d: "24 小时",
    range7d: "7 天",
    range30d: "30 天",
    range90d: "90 天",
    severity: "级别",
    type: "事件类型",
    trigger: "触发方式",
    outcome: "结果",
    tag: "标签",
    channel: "渠道",
    channelHint: "请先选择“已发送消息”或“已收到消息”——渠道信息保存在这两类事件里。",
    all: "全部",
    search: "搜索",
    runScope: "运行 {id}",
    sessionScope: "会话 {id}",
    remove: "移除",
    activeCount: "已启用 {n} 项",
    maxRange: "活动记录最多可回溯 90 天。",
  },
  timeline: {
    heading: "活动记录",
    today: "今天",
    yesterday: "昨天",
    dayCounts: "{runs} 次运行 · 成功 {ok} · 失败 {failed}",
    stillRunning: "进行中 {n}",
    endOfRange: "已经到这段时间的开头。想看更早的记录，请扩大时间范围。",
    openRun: "查看运行",
    steps: "{n} 个步骤",
    runLabel: "运行",
    sessionLabel: "会话",
    loading: "正在加载活动记录…",
  },
  run: {
    heading: "运行详情",
    close: "关闭",
    runId: "运行 ID",
    session: "会话",
    trigger: "触发方式",
    started: "开始",
    finished: "结束",
    duration: "耗时",
    steps: "步骤",
    model: "模型",
    tokens: "Token",
    tokensIn: "输入",
    tokensOut: "输出",
    tokensCache: "缓存",
    cost: "费用",
    error: "错误",
    trace: "步骤轨迹",
    traceOrder: "按运行时记录的顺序展示。",
    showDetail: "展开详情",
    hideDetail: "收起详情",
    noDetail: "没有记录详情。",
    stepFailed: "失败",
    filterSession: "在活动记录中筛选此会话",
    loading: "正在加载运行…",
  },
  health: {
    heading: "运行时健康",
    liveness: "在线状态",
    heartbeat: "最近心跳",
    activeRuns: "进行中的运行",
    uptime: "启动于",
    configuration: "配置",
    revision: "版本 {n}",
    appliedRevision: "运行时为 {n}",
    capacity: "资源",
    cpu: "CPU",
    memory: "内存",
    disk: "磁盘",
    peak: "峰值 {value}",
    gap: "无采样",
    legend: "图例",
    window: "最近 {hours} 小时",
    cellSize: "每格约 {minutes} 分钟",
    ofLimit: "{used} / {limit}",
    noLimit: "未报告上限",
    never: "从未",
    stateRunning: "运行中",
    stateIdle: "空闲",
    stateStopped: "已停止",
    stateUnhealthy: "异常",
  },
  cost: {
    heading: "费用与 Token",
    total: "已报告费用",
    runs: "运行次数",
    perRun: "每次运行",
    tokens: "Token",
    vsPrevious: "对比前 {days} 天",
    noPrevious: "之前没有可比较的时间段",
    daily: "按天",
    byTrigger: "按触发方式",
    byModel: "按模型",
    topRuns: "费用最高的运行",
    calls: "调用次数",
    estimatedCalls: "其中 {n} 次的 Token 数量为推算值。",
    creditsUsed: "已用点数",
    byKind: "按用途",
    noModel: "未报告模型",
    share: "{pct}%",
    ledgersNote: "这是三本独立的账，不会合并相加。",
    creditsNote: "点数是计费单位，不是金额——ArkAgent 不在此处换算成美元。",
    loading: "正在加载费用…",
  },
};

const uiZht: ActivityUiCopy = {
  filter: {
    heading: "篩選",
    range: "時間範圍",
    range1d: "24 小時",
    range7d: "7 天",
    range30d: "30 天",
    range90d: "90 天",
    severity: "等級",
    type: "事件類型",
    trigger: "觸發方式",
    outcome: "結果",
    tag: "標籤",
    channel: "頻道",
    channelHint: "請先選擇「已送出訊息」或「已收到訊息」——頻道資訊存在這兩類事件裡。",
    all: "全部",
    search: "搜尋",
    runScope: "執行 {id}",
    sessionScope: "工作階段 {id}",
    remove: "移除",
    activeCount: "已啟用 {n} 項",
    maxRange: "活動記錄最多可回溯 90 天。",
  },
  timeline: {
    heading: "活動記錄",
    today: "今天",
    yesterday: "昨天",
    dayCounts: "{runs} 次執行 · 成功 {ok} · 失敗 {failed}",
    stillRunning: "進行中 {n}",
    endOfRange: "已經到這段期間的開頭。想看更早的記錄，請擴大時間範圍。",
    openRun: "查看執行",
    steps: "{n} 個步驟",
    runLabel: "執行",
    sessionLabel: "工作階段",
    loading: "正在載入活動記錄…",
  },
  run: {
    heading: "執行詳情",
    close: "關閉",
    runId: "執行 ID",
    session: "工作階段",
    trigger: "觸發方式",
    started: "開始",
    finished: "結束",
    duration: "耗時",
    steps: "步驟",
    model: "模型",
    tokens: "Token",
    tokensIn: "輸入",
    tokensOut: "輸出",
    tokensCache: "快取",
    cost: "費用",
    error: "錯誤",
    trace: "步驟軌跡",
    traceOrder: "依執行環境記錄的順序顯示。",
    showDetail: "展開詳情",
    hideDetail: "收合詳情",
    noDetail: "沒有記錄詳情。",
    stepFailed: "失敗",
    filterSession: "在活動記錄中篩選此工作階段",
    loading: "正在載入執行…",
  },
  health: {
    heading: "執行環境健康",
    liveness: "連線狀態",
    heartbeat: "最近心跳",
    activeRuns: "進行中的執行",
    uptime: "啟動於",
    configuration: "設定",
    revision: "版本 {n}",
    appliedRevision: "執行環境為 {n}",
    capacity: "資源",
    cpu: "CPU",
    memory: "記憶體",
    disk: "磁碟",
    peak: "尖峰 {value}",
    gap: "無取樣",
    legend: "圖例",
    window: "最近 {hours} 小時",
    cellSize: "每格約 {minutes} 分鐘",
    ofLimit: "{used} / {limit}",
    noLimit: "未回報上限",
    never: "從未",
    stateRunning: "執行中",
    stateIdle: "閒置",
    stateStopped: "已停止",
    stateUnhealthy: "異常",
  },
  cost: {
    heading: "費用與 Token",
    total: "已回報費用",
    runs: "執行次數",
    perRun: "每次執行",
    tokens: "Token",
    vsPrevious: "對比前 {days} 天",
    noPrevious: "之前沒有可比較的期間",
    daily: "依日期",
    byTrigger: "依觸發方式",
    byModel: "依模型",
    topRuns: "費用最高的執行",
    calls: "呼叫次數",
    estimatedCalls: "其中 {n} 次的 Token 數量為推估值。",
    creditsUsed: "已用點數",
    byKind: "依用途",
    noModel: "未回報模型",
    share: "{pct}%",
    ledgersNote: "這是三本獨立的帳，不會合併相加。",
    creditsNote: "點數是計費單位，不是金額——ArkAgent 不在此處換算成美元。",
    loading: "正在載入費用…",
  },
};

const uiJa: ActivityUiCopy = {
  filter: {
    heading: "絞り込み",
    range: "期間",
    range1d: "24 時間",
    range7d: "7 日間",
    range30d: "30 日間",
    range90d: "90 日間",
    severity: "重要度",
    type: "イベント種別",
    trigger: "きっかけ",
    outcome: "結果",
    tag: "タグ",
    channel: "チャネル",
    channelHint: "先に「メッセージ送信」か「メッセージ受信」を選んでください。チャネルはこの 2 種類のイベントにだけ入っています。",
    all: "すべて",
    search: "検索",
    runScope: "実行 {id}",
    sessionScope: "セッション {id}",
    remove: "解除",
    activeCount: "{n} 件適用中",
    maxRange: "アクティビティをさかのぼれるのは 90 日間までです。",
  },
  timeline: {
    heading: "アクティビティ",
    today: "今日",
    yesterday: "昨日",
    dayCounts: "実行 {runs} 件 · 成功 {ok} · 失敗 {failed}",
    stillRunning: "実行中 {n}",
    endOfRange: "この期間の先頭です。さらに前を見るには期間を広げてください。",
    openRun: "実行を開く",
    steps: "{n} ステップ",
    runLabel: "実行",
    sessionLabel: "セッション",
    loading: "アクティビティを読み込んでいます…",
  },
  run: {
    heading: "実行の詳細",
    close: "閉じる",
    runId: "実行 ID",
    session: "セッション",
    trigger: "きっかけ",
    started: "開始",
    finished: "終了",
    duration: "所要時間",
    steps: "ステップ",
    model: "モデル",
    tokens: "トークン",
    tokensIn: "入力",
    tokensOut: "出力",
    tokensCache: "キャッシュ",
    cost: "費用",
    error: "エラー",
    trace: "ステップの記録",
    traceOrder: "ランタイムが記録した順に表示しています。",
    showDetail: "詳細を表示",
    hideDetail: "詳細を隠す",
    noDetail: "詳細は記録されていません。",
    stepFailed: "失敗",
    filterSession: "このセッションでアクティビティを絞り込む",
    loading: "実行を読み込んでいます…",
  },
  health: {
    heading: "ランタイムの状態",
    liveness: "稼働状況",
    heartbeat: "最終ハートビート",
    activeRuns: "実行中の件数",
    uptime: "起動時刻",
    configuration: "設定",
    revision: "リビジョン {n}",
    appliedRevision: "ランタイムは {n}",
    capacity: "リソース",
    cpu: "CPU",
    memory: "メモリ",
    disk: "ディスク",
    peak: "ピーク {value}",
    gap: "サンプルなし",
    legend: "凡例",
    window: "直近 {hours} 時間",
    cellSize: "1 マス約 {minutes} 分",
    ofLimit: "{used} / {limit}",
    noLimit: "上限の報告なし",
    never: "なし",
    stateRunning: "実行中",
    stateIdle: "待機",
    stateStopped: "停止",
    stateUnhealthy: "異常",
  },
  cost: {
    heading: "費用とトークン",
    total: "報告された費用",
    runs: "実行回数",
    perRun: "1 実行あたり",
    tokens: "トークン",
    vsPrevious: "前の {days} 日間との比較",
    noPrevious: "比較できる期間がありません",
    daily: "日別",
    byTrigger: "きっかけ別",
    byModel: "モデル別",
    topRuns: "費用の高い実行",
    calls: "呼び出し回数",
    estimatedCalls: "うち {n} 件はトークン数を推定しています。",
    creditsUsed: "使用クレジット",
    byKind: "用途別",
    noModel: "モデルの報告なし",
    share: "{pct}%",
    ledgersNote: "3 つの別々の台帳です。合算はしません。",
    creditsNote: "クレジットは課金単位であり金額ではありません。ここでドルには換算しません。",
    loading: "費用を読み込んでいます…",
  },
};

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------

const en: ActivityDict = {
  code: {
    "status.changed": "Status changed from {from} to {to}",
    "config.applied": "Runtime applied configuration revision {revision}",
    "runtime.unreachable": "No heartbeat for {missedIntervals} intervals — last seen {lastHeartbeatAt}",
    "run.started": "Run started ({trigger})",
    "run.finished": "Run {status} after {durationMs} ms, {steps} steps",
    "tool.denied": "Blocked {toolName} — {denyReason}",
    "message.sent": "Sent a message on {channel} to {recipientCount} recipient(s)",
    "message.received": "{senderLabel} sent a message on {channel}",
    "task.status": "Task moved from {from} to {to}",
    "escalation.raised": "Escalated to you — {reason}",
    "draft.created": "Drafted {kind}",
    "research.completed": "Finished research across {sources} sources",
    "skill.installed": "Installed skill {slug} {version}",
    "skill.removed": "Removed skill {slug} {version}",
    "skill.failed": "Couldn't install {slug} {version} — {errorCode}",
    "context.indexed": "Indexed {name} into {chunks} chunks",
    "context.failed": "Couldn't index {name} — {errorCode}",
    "improvement.proposed": "Proposed a change to its own {kind}",
    "error.raised": "Error: {errorCode}",
    "schedule.fired": "Schedule {name} fired",
    "schedule.skipped": "Skipped schedule {name} — {skipReason}",
    "schedule.failed": "Schedule {name} failed — {errorCode}",
    "usage.recorded": "Used {credits} credits ({kind})",
    custom: "{text}",
  },
  error: {
    model_unavailable: "The model was unavailable",
    provider_rate_limited: "The model provider rate-limited us",
    provider_auth_failed: "The model provider rejected our credentials",
    credit_cap_reached: "Credit cap reached",
    daily_action_limit: "Daily action limit reached",
    max_runs_per_day: "Daily run limit reached",
    approval_timeout: "Nobody answered the approval request in time",
    tool_disabled: "That tool is switched off for this agent",
    sandbox_denied: "The sandbox refused the operation",
    egress_blocked: "Outbound network access was blocked",
    channel_send_failed: "Sending on the channel failed",
    channel_not_bound: "No channel is connected for this agent",
    context_fetch_failed: "A knowledge source could not be fetched",
    invalid_timezone: "The configured time zone is not valid",
    skill_install_failed: "A skill failed to install",
    timeout: "The operation timed out",
    out_of_memory: "The runtime ran out of memory",
    internal_error: "The runtime hit an internal error",
    runtime_instance_missing: "ArkAgent could not find this agent's runtime instance",
  },
  skipReason: {
    instance_stopped: "the agent was stopped",
    overlap: "the previous run was still going",
    outside_working_hours: "it fell outside working hours",
    disabled: "the schedule was switched off",
    credit_cap_reached: "the credit cap was reached",
    max_runs_per_day: "the daily run limit was reached",
    daily_action_limit: "the daily action limit was reached",
    channel_not_bound: "no channel was connected",
    misfire: "the scheduler missed the moment",
    misfire_too_old: "the missed occurrence was too old to run late",
    dispatch_unsupported: "this runtime cannot be triggered on a schedule",
  },
  denyReason: {
    autonomy_ask: "its autonomy setting says to ask first",
    tool_disabled: "the tool is switched off",
    approval_required: "it needs your approval",
    daily_action_limit: "the daily action limit was reached",
    credit_cap_reached: "the credit cap was reached",
  },
  metric: {},
  severity: { info: "Info", notice: "Notice", warning: "Warning", error: "Error" },
  trigger: {
    chat: "Chat",
    schedule: "Schedule",
    channel: "Channel",
    api: "API",
    self: "Self-directed",
    system: "System",
  },
  phase: {
    thinking: "Thinking",
    tool_call: "Tool call",
    tool_result: "Tool result",
    message: "Message",
    final_answer: "Answer",
  },
  status: {
    queued: "Queued",
    running: "Running",
    succeeded: "Succeeded",
    failed: "Failed",
    cancelled: "Cancelled",
    timeout: "Timed out",
  },
  tag: {
    meeting: "Meeting",
    draft: "Draft",
    research: "Research",
    review: "Review",
    outreach: "Outreach",
    learning: "Learning",
    resolved: "Resolved",
    escalated: "Escalated",
    summary: "Summary",
    published: "Published",
    brief: "Brief",
    calendar: "Calendar",
    docs: "Docs",
    system: "System",
  },
  heartbeat: {
    ok: "Reporting normally",
    stale: "Heartbeat is late",
    dead: "No heartbeat",
    expected_silence: "Paused — no heartbeat expected",
  },
  banner: {
    mock: "Simulator mode. Everything below was generated, not measured.",
    unconfigured: "No agent runtime is connected. You're looking at ArkAgent's own records.",
    degraded: "Some of this agent's runtime data couldn't be loaded.",
  },
  empty: {
    timeline: {
      no_data_yet: {
        title: "Nothing yet",
        body: "{name} is working and hasn't been triggered. Activity appears here as soon as it runs, sends a message, or hits a schedule.",
      },
      never_provisioned: {
        title: "Not deployed yet",
        body: "This agent is still being set up. Activity starts the moment its runtime reports in.",
      },
      runtime_mock: {
        title: "Simulator mode",
        body: "The runtime is simulated, so no real activity is recorded. Anything you see here was generated.",
      },
      runtime_unconfigured: {
        title: "No runtime connected",
        body: "This deployment has no agent runtime, so nothing can report activity. ArkAgent's own records still appear here.",
      },
      telemetry_unsupported: {
        title: "{harness} doesn't report this yet",
        body: "{harness} can run your agent, but it doesn't send run and step detail. Messages, schedules and errors still appear here.",
      },
      filtered_out: {
        title: "No matches",
        body: "Things happened in this range; none of them match these filters.",
      },
    },
    runs: {
      no_data_yet: {
        title: "No runs yet",
        body: "A run is one unit of work — a scheduled job, a message you send, or something arriving on a channel. Each one records the steps it took, how long it took, what it cost, and whether it worked.",
      },
      never_provisioned: {
        title: "Not deployed yet",
        body: "Runs are recorded once this agent's runtime is up and takes its first piece of work.",
      },
      runtime_mock: {
        title: "Simulator mode",
        body: "Runs here come from the simulator. They have the right shape but none of them happened.",
      },
      runtime_unconfigured: {
        title: "No runtime connected",
        body: "Nothing is running this agent, so there is no work to record.",
      },
      telemetry_unsupported: {
        title: "{harness} doesn't send runs",
        body: "Runs are recorded by the agent's runtime. {harness} doesn't send them yet, so this stays empty even while your agent works. Messages, schedules and errors still appear on the timeline.",
      },
      filtered_out: {
        title: "No matching runs",
        body: "There are runs in this range, but none with these filters.",
      },
    },
    toolCalls: {
      no_data_yet: {
        title: "Nothing outside a run",
        body: "Tool calls that happen on their own — a channel webhook, a background memory pass, an approval callback — land here. An empty list means everything this agent did happened inside a run, which is the normal case.",
      },
      never_provisioned: {
        title: "Not deployed yet",
        body: "Tool calls appear once the runtime is up.",
      },
      runtime_mock: {
        title: "Simulator mode",
        body: "The simulator makes no tool calls outside a run, so there is nothing to show.",
      },
      runtime_unconfigured: {
        title: "No runtime connected",
        body: "No runtime means no tool calls.",
      },
      telemetry_unsupported: {
        title: "{harness} doesn't send step detail",
        body: "{harness} doesn't report individual tool calls, so this view stays empty.",
      },
      filtered_out: {
        title: "No matches",
        body: "Tool calls exist in this range; none match these filters.",
      },
    },
    health: {
      no_data_yet: {
        title: "No health data",
        body: "This agent's runtime hasn't reported CPU, memory or disk. Liveness below comes from heartbeats and is accurate regardless.",
      },
      never_provisioned: {
        title: "Not deployed yet",
        body: "There is no machine to measure until this agent is deployed.",
      },
      runtime_mock: {
        title: "Simulated readings",
        body: "These figures are generated by the simulator, not measured.",
      },
      runtime_unconfigured: {
        title: "No runtime connected",
        body: "Nothing is reporting capacity. Liveness below is the last thing ArkAgent recorded.",
      },
      telemetry_unsupported: {
        title: "{harness} doesn't report capacity",
        body: "{harness} doesn't send CPU, memory or disk samples. Liveness below still works.",
      },
      filtered_out: {
        title: "No samples in this range",
        body: "Try a wider range.",
      },
    },
    cost: {
      no_data_yet: {
        title: "No spend yet",
        body: "Cost appears once runs report token usage, and once ArkAgent's own model calls for this agent are billed.",
      },
      never_provisioned: {
        title: "Not deployed yet",
        body: "Nothing has been spent on an agent that hasn't started.",
      },
      runtime_mock: {
        title: "Simulator mode",
        body: "Any figures here come from simulated runs. No money was spent.",
      },
      runtime_unconfigured: {
        title: "No runtime connected",
        body: "Historic totals still show. Nothing new is being recorded.",
      },
      telemetry_unsupported: {
        title: "{harness} doesn't report usage",
        body: "{harness} doesn't send token counts, so run cost stays empty. Credits and ArkAgent's own model spend still appear.",
      },
      filtered_out: {
        title: "No spend in this range",
        body: "Try a wider range.",
      },
    },
    errors: {
      no_data_yet: {
        title: "Nothing went wrong",
        body: "No failed runs, no runtime errors, nothing waiting on you.",
      },
      never_provisioned: {
        title: "Nothing to report",
        body: "This agent hasn't started, so nothing could fail.",
      },
      runtime_mock: {
        title: "Simulator mode",
        body: "Only what the simulator actually produced appears here.",
      },
      runtime_unconfigured: {
        title: "No runtime connected",
        body: "Past incidents still show. Nothing new is being reported.",
      },
      telemetry_unsupported: {
        title: "{harness} reports errors only",
        body: "{harness} doesn't send run detail, so failed runs won't appear — runtime errors and escalations still will.",
      },
      filtered_out: {
        title: "No matches",
        body: "There are incidents in this range, but none with these filters.",
      },
    },
  },
  action: {
    clearFilters: "Clear filters",
    runNow: "Run it now",
    openChat: "Open chat",
    setUpSchedule: "Set up a schedule",
    viewDeployment: "View deployment",
    whatsSupported: "What's supported",
    contactAdmin: "Contact your admin",
    tryAgain: "Try again",
    loadMore: "Load more",
  },
  label: {
    example: "Example",
    loadFailed: "Couldn't load activity.",
    searchPlaceholder: "Search run summaries",
    unpriced: "Not priced",
    unpricedNote: "These runs reported tokens, but ArkAgent has no price for their model.",
    restartsObserved: "Restarts (7d, observed)",
    simulatedSample: "Simulated",
    rolledUp: "Hourly average",
    stepsTruncated: "Only the first steps are shown.",
    stepsPruned: "Step trace was pruned after 90 days.",
    detailTruncated: "Truncated",
    agentWritten: "Written by the agent",
    configPending: "Not yet applied to the runtime",
    creditsLedger: "Credits",
    llmLedger: "ArkAgent model spend",
    runtimeLedger: "Runtime-reported spend",
    ignoredFilters: "Some filter values weren't recognised and were ignored.",
  },
  ui: uiEn,
};

// ---------------------------------------------------------------------------
// 简体中文
// ---------------------------------------------------------------------------

const zh: ActivityDict = {
  code: {
    "status.changed": "状态从 {from} 变为 {to}",
    "config.applied": "运行时已应用配置版本 {revision}",
    "runtime.unreachable": "已连续 {missedIntervals} 个周期没有心跳，最后一次是 {lastHeartbeatAt}",
    "run.started": "任务开始（{trigger}）",
    "run.finished": "任务{status}，耗时 {durationMs} 毫秒，共 {steps} 步",
    "tool.denied": "已拦截 {toolName}——{denyReason}",
    "message.sent": "通过 {channel} 向 {recipientCount} 位收件人发送了消息",
    "message.received": "{senderLabel} 通过 {channel} 发来消息",
    "task.status": "任务状态从 {from} 变为 {to}",
    "escalation.raised": "已升级给你处理——{reason}",
    "draft.created": "起草了{kind}",
    "research.completed": "完成调研，参考了 {sources} 个来源",
    "skill.installed": "已安装技能 {slug} {version}",
    "skill.removed": "已移除技能 {slug} {version}",
    "skill.failed": "无法安装 {slug} {version}——{errorCode}",
    "context.indexed": "已将 {name} 建立索引，共 {chunks} 段",
    "context.failed": "无法为 {name} 建立索引——{errorCode}",
    "improvement.proposed": "提出了对自身{kind}的改进建议",
    "error.raised": "错误：{errorCode}",
    "schedule.fired": "定时任务 {name} 已触发",
    "schedule.skipped": "跳过定时任务 {name}——{skipReason}",
    "schedule.failed": "定时任务 {name} 执行失败——{errorCode}",
    "usage.recorded": "消耗 {credits} 点额度（{kind}）",
    custom: "{text}",
  },
  error: {
    model_unavailable: "模型不可用",
    provider_rate_limited: "模型服务商限流",
    provider_auth_failed: "模型服务商拒绝了我们的凭据",
    credit_cap_reached: "已达到额度上限",
    daily_action_limit: "已达到每日操作上限",
    max_runs_per_day: "已达到每日任务次数上限",
    approval_timeout: "审批请求超时未处理",
    tool_disabled: "该工具在此智能体上已关闭",
    sandbox_denied: "沙箱拒绝了该操作",
    egress_blocked: "外网访问被拦截",
    channel_send_failed: "渠道发送失败",
    channel_not_bound: "该智能体未绑定任何渠道",
    context_fetch_failed: "无法获取知识来源",
    invalid_timezone: "配置的时区无效",
    skill_install_failed: "技能安装失败",
    timeout: "操作超时",
    out_of_memory: "运行时内存耗尽",
    internal_error: "运行时内部错误",
    runtime_instance_missing: "ArkAgent 找不到该智能体的运行实例",
  },
  skipReason: {
    instance_stopped: "智能体已停止",
    overlap: "上一次执行尚未结束",
    outside_working_hours: "不在工作时段内",
    disabled: "该定时任务已关闭",
    credit_cap_reached: "已达到额度上限",
    max_runs_per_day: "已达到每日任务次数上限",
    daily_action_limit: "已达到每日操作上限",
    channel_not_bound: "没有绑定渠道",
    misfire: "调度器错过了触发时刻",
    misfire_too_old: "错过的时刻太久，不再补跑",
    dispatch_unsupported: "该运行时不支持定时触发",
  },
  denyReason: {
    autonomy_ask: "自主级别设置为先询问",
    tool_disabled: "该工具已关闭",
    approval_required: "需要你先批准",
    daily_action_limit: "已达到每日操作上限",
    credit_cap_reached: "已达到额度上限",
  },
  metric: {},
  severity: { info: "信息", notice: "提示", warning: "警告", error: "错误" },
  trigger: {
    chat: "对话",
    schedule: "定时",
    channel: "渠道",
    api: "接口",
    self: "自主发起",
    system: "系统",
  },
  phase: {
    thinking: "思考",
    tool_call: "调用工具",
    tool_result: "工具结果",
    message: "消息",
    final_answer: "回答",
  },
  status: {
    queued: "排队中",
    running: "执行中",
    succeeded: "成功",
    failed: "失败",
    cancelled: "已取消",
    timeout: "超时",
  },
  tag: {
    meeting: "会议",
    draft: "草稿",
    research: "调研",
    review: "复核",
    outreach: "外联",
    learning: "学习",
    resolved: "已解决",
    escalated: "已升级",
    summary: "小结",
    published: "已发布",
    brief: "简报",
    calendar: "日程",
    docs: "文档",
    system: "系统",
  },
  heartbeat: {
    ok: "心跳正常",
    stale: "心跳延迟",
    dead: "没有心跳",
    expected_silence: "已暂停——本就不该有心跳",
  },
  banner: {
    mock: "模拟模式。以下内容均为生成，并非真实测量。",
    unconfigured: "未连接智能体运行时，这里显示的是 ArkAgent 自己的记录。",
    degraded: "该智能体的部分运行时数据未能加载。",
  },
  empty: {
    timeline: {
      no_data_yet: {
        title: "还没有动态",
        body: "{name} 正在待命，尚未被触发。一旦它执行任务、发送消息或到达定时时刻，动态就会出现在这里。",
      },
      never_provisioned: {
        title: "尚未部署",
        body: "这个智能体还在配置中。运行时上报的那一刻，动态就会开始。",
      },
      runtime_mock: {
        title: "模拟模式",
        body: "运行时是模拟的，不会记录真实动态。这里出现的内容都是生成的。",
      },
      runtime_unconfigured: {
        title: "未连接运行时",
        body: "此部署没有智能体运行时，没有任何东西能上报动态。ArkAgent 自己的记录仍会显示在这里。",
      },
      telemetry_unsupported: {
        title: "{harness} 暂不上报这些内容",
        body: "{harness} 可以运行你的智能体，但不会发送任务与步骤明细。消息、定时任务和错误仍会显示。",
      },
      filtered_out: {
        title: "没有匹配项",
        body: "这段时间里发生过事情，但没有一条符合当前筛选条件。",
      },
    },
    runs: {
      no_data_yet: {
        title: "还没有任务记录",
        body: "一次任务就是一个完整的工作单元——一个定时作业、你发的一条消息，或渠道上来的一次请求。每次任务都会记录经过的步骤、耗时、花费，以及是否成功。",
      },
      never_provisioned: {
        title: "尚未部署",
        body: "等运行时启动并接下第一份工作后，任务记录才会出现。",
      },
      runtime_mock: {
        title: "模拟模式",
        body: "这里的任务来自模拟器。结构是真的，事情没有发生过。",
      },
      runtime_unconfigured: {
        title: "未连接运行时",
        body: "没有任何东西在运行这个智能体，因此没有工作可记录。",
      },
      telemetry_unsupported: {
        title: "{harness} 不发送任务记录",
        body: "任务记录由智能体的运行时上报。{harness} 目前不发送，所以即便智能体在工作，这里也会一直是空的。消息、定时任务和错误仍会出现在动态里。",
      },
      filtered_out: {
        title: "没有匹配的任务",
        body: "这段时间里有任务，但没有符合当前筛选条件的。",
      },
    },
    toolCalls: {
      no_data_yet: {
        title: "没有任务之外的调用",
        body: "独立发生的工具调用——渠道回调、后台记忆整理、审批回调——会出现在这里。列表为空说明这个智能体做的一切都发生在任务内部，这是正常情况。",
      },
      never_provisioned: {
        title: "尚未部署",
        body: "运行时启动后才会有工具调用。",
      },
      runtime_mock: {
        title: "模拟模式",
        body: "模拟器不会在任务之外调用工具，因此没有内容可显示。",
      },
      runtime_unconfigured: {
        title: "未连接运行时",
        body: "没有运行时，也就没有工具调用。",
      },
      telemetry_unsupported: {
        title: "{harness} 不发送步骤明细",
        body: "{harness} 不上报单次工具调用，所以这个视图会一直为空。",
      },
      filtered_out: {
        title: "没有匹配项",
        body: "这段时间里有工具调用，但没有符合筛选条件的。",
      },
    },
    health: {
      no_data_yet: {
        title: "没有健康数据",
        body: "该智能体的运行时没有上报 CPU、内存或磁盘。下方的存活状态来自心跳，仍然准确。",
      },
      never_provisioned: {
        title: "尚未部署",
        body: "智能体部署之前没有机器可以测量。",
      },
      runtime_mock: {
        title: "模拟读数",
        body: "这些数字由模拟器生成，并非实际测量。",
      },
      runtime_unconfigured: {
        title: "未连接运行时",
        body: "没有任何东西在上报容量。下方的存活状态是 ArkAgent 最后记录到的结果。",
      },
      telemetry_unsupported: {
        title: "{harness} 不上报容量",
        body: "{harness} 不发送 CPU、内存或磁盘采样。下方的存活状态仍然可用。",
      },
      filtered_out: {
        title: "该时间段内没有采样",
        body: "试试更宽的时间范围。",
      },
    },
    cost: {
      no_data_yet: {
        title: "还没有花费",
        body: "当任务上报 token 用量，或 ArkAgent 为这个智能体发起的模型调用被计费后，花费就会出现。",
      },
      never_provisioned: {
        title: "尚未部署",
        body: "还没开始工作的智能体不会产生花费。",
      },
      runtime_mock: {
        title: "模拟模式",
        body: "这里的数字来自模拟任务，没有产生真实费用。",
      },
      runtime_unconfigured: {
        title: "未连接运行时",
        body: "历史合计仍会显示，但不会再记录新的花费。",
      },
      telemetry_unsupported: {
        title: "{harness} 不上报用量",
        body: "{harness} 不发送 token 数，因此任务花费为空。额度消耗和 ArkAgent 自身的模型花费仍会显示。",
      },
      filtered_out: {
        title: "该时间段内没有花费",
        body: "试试更宽的时间范围。",
      },
    },
    errors: {
      no_data_yet: {
        title: "一切正常",
        body: "没有失败的任务，没有运行时错误，也没有待你处理的事项。",
      },
      never_provisioned: {
        title: "无事可报",
        body: "这个智能体还没开始工作，也就无从失败。",
      },
      runtime_mock: {
        title: "模拟模式",
        body: "这里只显示模拟器真实产生过的内容。",
      },
      runtime_unconfigured: {
        title: "未连接运行时",
        body: "历史故障仍会显示，但不会再上报新的问题。",
      },
      telemetry_unsupported: {
        title: "{harness} 只上报错误",
        body: "{harness} 不发送任务明细，因此失败的任务不会出现；运行时错误和升级事项仍会显示。",
      },
      filtered_out: {
        title: "没有匹配项",
        body: "这段时间里有故障记录，但没有符合筛选条件的。",
      },
    },
  },
  action: {
    clearFilters: "清除筛选",
    runNow: "立即运行",
    openChat: "打开对话",
    setUpSchedule: "设置定时任务",
    viewDeployment: "查看部署",
    whatsSupported: "支持哪些能力",
    contactAdmin: "联系管理员",
    tryAgain: "重试",
    loadMore: "加载更多",
  },
  label: {
    example: "示例",
    loadFailed: "无法加载动态。",
    searchPlaceholder: "搜索任务摘要",
    unpriced: "无价格",
    unpricedNote: "这些任务上报了 token，但 ArkAgent 没有对应模型的价格。",
    restartsObserved: "重启次数（7 天，观测值）",
    simulatedSample: "模拟数据",
    rolledUp: "按小时聚合",
    stepsTruncated: "仅显示前若干步。",
    stepsPruned: "步骤明细已在 90 天后清理。",
    detailTruncated: "已截断",
    agentWritten: "由智能体撰写",
    configPending: "运行时尚未应用",
    creditsLedger: "额度消耗",
    llmLedger: "ArkAgent 模型花费",
    runtimeLedger: "运行时上报的花费",
    ignoredFilters: "部分筛选值无法识别，已忽略。",
  },
  ui: uiZh,
};

// ---------------------------------------------------------------------------
// 繁體中文
// ---------------------------------------------------------------------------

const zht: ActivityDict = {
  code: {
    "status.changed": "狀態由 {from} 變更為 {to}",
    "config.applied": "執行環境已套用設定版本 {revision}",
    "runtime.unreachable": "已連續 {missedIntervals} 個週期沒有心跳，最後一次是 {lastHeartbeatAt}",
    "run.started": "工作開始（{trigger}）",
    "run.finished": "工作{status}，耗時 {durationMs} 毫秒，共 {steps} 步",
    "tool.denied": "已攔截 {toolName}——{denyReason}",
    "message.sent": "透過 {channel} 向 {recipientCount} 位收件者送出訊息",
    "message.received": "{senderLabel} 透過 {channel} 傳來訊息",
    "task.status": "任務狀態由 {from} 變更為 {to}",
    "escalation.raised": "已升級交由你處理——{reason}",
    "draft.created": "草擬了{kind}",
    "research.completed": "完成研究，參考了 {sources} 個來源",
    "skill.installed": "已安裝技能 {slug} {version}",
    "skill.removed": "已移除技能 {slug} {version}",
    "skill.failed": "無法安裝 {slug} {version}——{errorCode}",
    "context.indexed": "已為 {name} 建立索引，共 {chunks} 段",
    "context.failed": "無法為 {name} 建立索引——{errorCode}",
    "improvement.proposed": "提出了對自身{kind}的改進建議",
    "error.raised": "錯誤：{errorCode}",
    "schedule.fired": "排程 {name} 已觸發",
    "schedule.skipped": "略過排程 {name}——{skipReason}",
    "schedule.failed": "排程 {name} 執行失敗——{errorCode}",
    "usage.recorded": "使用 {credits} 點額度（{kind}）",
    custom: "{text}",
  },
  error: {
    model_unavailable: "模型無法使用",
    provider_rate_limited: "模型服務商限流",
    provider_auth_failed: "模型服務商拒絕了我們的憑證",
    credit_cap_reached: "已達額度上限",
    daily_action_limit: "已達每日操作上限",
    max_runs_per_day: "已達每日工作次數上限",
    approval_timeout: "審核請求逾時未處理",
    tool_disabled: "此工具在這個智慧代理上已關閉",
    sandbox_denied: "沙箱拒絕了此操作",
    egress_blocked: "對外網路存取遭攔截",
    channel_send_failed: "頻道傳送失敗",
    channel_not_bound: "此智慧代理尚未綁定任何頻道",
    context_fetch_failed: "無法取得知識來源",
    invalid_timezone: "設定的時區無效",
    skill_install_failed: "技能安裝失敗",
    timeout: "操作逾時",
    out_of_memory: "執行環境記憶體耗盡",
    internal_error: "執行環境發生內部錯誤",
    runtime_instance_missing: "ArkAgent 找不到這個智慧代理的執行實例",
  },
  skipReason: {
    instance_stopped: "智慧代理已停止",
    overlap: "上一次執行尚未結束",
    outside_working_hours: "不在工作時段內",
    disabled: "此排程已關閉",
    credit_cap_reached: "已達額度上限",
    max_runs_per_day: "已達每日工作次數上限",
    daily_action_limit: "已達每日操作上限",
    channel_not_bound: "沒有綁定頻道",
    misfire: "排程器錯過了觸發時刻",
    misfire_too_old: "錯過的時刻太久，不再補執行",
    dispatch_unsupported: "此執行環境不支援排程觸發",
  },
  denyReason: {
    autonomy_ask: "自主程度設定為先詢問",
    tool_disabled: "此工具已關閉",
    approval_required: "需要你先核准",
    daily_action_limit: "已達每日操作上限",
    credit_cap_reached: "已達額度上限",
  },
  metric: {},
  severity: { info: "資訊", notice: "提示", warning: "警告", error: "錯誤" },
  trigger: {
    chat: "對話",
    schedule: "排程",
    channel: "頻道",
    api: "介面",
    self: "自主發起",
    system: "系統",
  },
  phase: {
    thinking: "思考",
    tool_call: "呼叫工具",
    tool_result: "工具結果",
    message: "訊息",
    final_answer: "回覆",
  },
  status: {
    queued: "排隊中",
    running: "執行中",
    succeeded: "成功",
    failed: "失敗",
    cancelled: "已取消",
    timeout: "逾時",
  },
  tag: {
    meeting: "會議",
    draft: "草稿",
    research: "研究",
    review: "覆核",
    outreach: "外聯",
    learning: "學習",
    resolved: "已解決",
    escalated: "已升級",
    summary: "摘要",
    published: "已發布",
    brief: "簡報",
    calendar: "行事曆",
    docs: "文件",
    system: "系統",
  },
  heartbeat: {
    ok: "心跳正常",
    stale: "心跳延遲",
    dead: "沒有心跳",
    expected_silence: "已暫停——本來就不該有心跳",
  },
  banner: {
    mock: "模擬模式。以下內容皆為產生，並非實際測量。",
    unconfigured: "未連接智慧代理執行環境，這裡顯示的是 ArkAgent 自己的紀錄。",
    degraded: "此智慧代理的部分執行環境資料未能載入。",
  },
  empty: {
    timeline: {
      no_data_yet: {
        title: "還沒有動態",
        body: "{name} 正在待命，尚未被觸發。只要它執行工作、送出訊息或到達排程時刻，動態就會出現在這裡。",
      },
      never_provisioned: {
        title: "尚未部署",
        body: "這個智慧代理還在設定中。執行環境回報的那一刻，動態就會開始。",
      },
      runtime_mock: {
        title: "模擬模式",
        body: "執行環境是模擬的，不會記錄真實動態。這裡出現的內容都是產生的。",
      },
      runtime_unconfigured: {
        title: "未連接執行環境",
        body: "此部署沒有智慧代理執行環境，沒有任何東西能回報動態。ArkAgent 自己的紀錄仍會顯示在這裡。",
      },
      telemetry_unsupported: {
        title: "{harness} 目前不回報這些內容",
        body: "{harness} 可以執行你的智慧代理，但不會傳送工作與步驟明細。訊息、排程和錯誤仍會顯示。",
      },
      filtered_out: {
        title: "沒有符合的項目",
        body: "這段期間確實發生過事情，但沒有一筆符合目前的篩選條件。",
      },
    },
    runs: {
      no_data_yet: {
        title: "還沒有工作紀錄",
        body: "一次工作就是一個完整的執行單元——一個排程作業、你送出的一則訊息，或頻道傳來的一次請求。每次工作都會記錄經過的步驟、耗時、花費，以及是否成功。",
      },
      never_provisioned: {
        title: "尚未部署",
        body: "等執行環境啟動並接下第一份工作後，紀錄才會出現。",
      },
      runtime_mock: {
        title: "模擬模式",
        body: "這裡的工作來自模擬器。結構是真的，事情並沒有發生。",
      },
      runtime_unconfigured: {
        title: "未連接執行環境",
        body: "沒有任何東西在執行這個智慧代理，因此沒有工作可記錄。",
      },
      telemetry_unsupported: {
        title: "{harness} 不傳送工作紀錄",
        body: "工作紀錄由智慧代理的執行環境回報。{harness} 目前不傳送，所以即使智慧代理正在工作，這裡也會一直是空的。訊息、排程和錯誤仍會出現在動態中。",
      },
      filtered_out: {
        title: "沒有符合的工作",
        body: "這段期間有工作紀錄，但沒有符合目前篩選條件的。",
      },
    },
    toolCalls: {
      no_data_yet: {
        title: "沒有工作之外的呼叫",
        body: "獨立發生的工具呼叫——頻道回呼、背景記憶整理、核准回呼——會出現在這裡。清單為空代表這個智慧代理做的一切都發生在工作之內，這是正常的。",
      },
      never_provisioned: {
        title: "尚未部署",
        body: "執行環境啟動後才會有工具呼叫。",
      },
      runtime_mock: {
        title: "模擬模式",
        body: "模擬器不會在工作之外呼叫工具，因此沒有內容可顯示。",
      },
      runtime_unconfigured: {
        title: "未連接執行環境",
        body: "沒有執行環境，也就沒有工具呼叫。",
      },
      telemetry_unsupported: {
        title: "{harness} 不傳送步驟明細",
        body: "{harness} 不回報單次工具呼叫，因此這個檢視會一直是空的。",
      },
      filtered_out: {
        title: "沒有符合的項目",
        body: "這段期間有工具呼叫，但沒有符合篩選條件的。",
      },
    },
    health: {
      no_data_yet: {
        title: "沒有健康資料",
        body: "此智慧代理的執行環境沒有回報 CPU、記憶體或磁碟。下方的存活狀態來自心跳，仍然準確。",
      },
      never_provisioned: {
        title: "尚未部署",
        body: "智慧代理部署之前沒有機器可以量測。",
      },
      runtime_mock: {
        title: "模擬讀數",
        body: "這些數字由模擬器產生，並非實際量測。",
      },
      runtime_unconfigured: {
        title: "未連接執行環境",
        body: "沒有任何東西在回報容量。下方的存活狀態是 ArkAgent 最後記錄到的結果。",
      },
      telemetry_unsupported: {
        title: "{harness} 不回報容量",
        body: "{harness} 不傳送 CPU、記憶體或磁碟取樣。下方的存活狀態仍然可用。",
      },
      filtered_out: {
        title: "這段期間沒有取樣",
        body: "試試更寬的時間範圍。",
      },
    },
    cost: {
      no_data_yet: {
        title: "還沒有花費",
        body: "當工作回報 token 用量，或 ArkAgent 為這個智慧代理發起的模型呼叫被計費後，花費就會出現。",
      },
      never_provisioned: {
        title: "尚未部署",
        body: "還沒開始工作的智慧代理不會產生花費。",
      },
      runtime_mock: {
        title: "模擬模式",
        body: "這裡的數字來自模擬工作，沒有產生真實費用。",
      },
      runtime_unconfigured: {
        title: "未連接執行環境",
        body: "歷史合計仍會顯示，但不會再記錄新的花費。",
      },
      telemetry_unsupported: {
        title: "{harness} 不回報用量",
        body: "{harness} 不傳送 token 數，因此工作花費為空。額度消耗與 ArkAgent 自身的模型花費仍會顯示。",
      },
      filtered_out: {
        title: "這段期間沒有花費",
        body: "試試更寬的時間範圍。",
      },
    },
    errors: {
      no_data_yet: {
        title: "一切正常",
        body: "沒有失敗的工作，沒有執行環境錯誤，也沒有待你處理的事項。",
      },
      never_provisioned: {
        title: "沒有可回報的事",
        body: "這個智慧代理還沒開始工作，也就無從失敗。",
      },
      runtime_mock: {
        title: "模擬模式",
        body: "這裡只顯示模擬器實際產生過的內容。",
      },
      runtime_unconfigured: {
        title: "未連接執行環境",
        body: "過去的事故仍會顯示，但不會再回報新的問題。",
      },
      telemetry_unsupported: {
        title: "{harness} 只回報錯誤",
        body: "{harness} 不傳送工作明細，因此失敗的工作不會出現；執行環境錯誤與升級事項仍會顯示。",
      },
      filtered_out: {
        title: "沒有符合的項目",
        body: "這段期間有事故紀錄，但沒有符合篩選條件的。",
      },
    },
  },
  action: {
    clearFilters: "清除篩選",
    runNow: "立即執行",
    openChat: "開啟對話",
    setUpSchedule: "設定排程",
    viewDeployment: "查看部署",
    whatsSupported: "支援哪些能力",
    contactAdmin: "聯絡管理員",
    tryAgain: "重試",
    loadMore: "載入更多",
  },
  label: {
    example: "範例",
    loadFailed: "無法載入動態。",
    searchPlaceholder: "搜尋工作摘要",
    unpriced: "無價格",
    unpricedNote: "這些工作回報了 token，但 ArkAgent 沒有對應模型的價格。",
    restartsObserved: "重新啟動次數（7 天，觀測值）",
    simulatedSample: "模擬資料",
    rolledUp: "每小時彙總",
    stepsTruncated: "僅顯示前面數個步驟。",
    stepsPruned: "步驟明細已於 90 天後清除。",
    detailTruncated: "已截斷",
    agentWritten: "由智慧代理撰寫",
    configPending: "執行環境尚未套用",
    creditsLedger: "額度消耗",
    llmLedger: "ArkAgent 模型花費",
    runtimeLedger: "執行環境回報的花費",
    ignoredFilters: "部分篩選值無法辨識，已忽略。",
  },
  ui: uiZht,
};

// ---------------------------------------------------------------------------
// 日本語
// ---------------------------------------------------------------------------

const ja: ActivityDict = {
  code: {
    "status.changed": "ステータスが {from} から {to} に変わりました",
    "config.applied": "ランタイムが設定リビジョン {revision} を適用しました",
    "runtime.unreachable": "{missedIntervals} 回分ハートビートがありません。最後の受信は {lastHeartbeatAt} です",
    "run.started": "実行を開始しました（{trigger}）",
    "run.finished": "実行が{status}しました。所要 {durationMs} ミリ秒、{steps} ステップ",
    "tool.denied": "{toolName} をブロックしました — {denyReason}",
    "message.sent": "{channel} で {recipientCount} 件の宛先にメッセージを送信しました",
    "message.received": "{senderLabel} から {channel} でメッセージが届きました",
    "task.status": "タスクが {from} から {to} に変わりました",
    "escalation.raised": "あなたにエスカレーションしました — {reason}",
    "draft.created": "{kind}の下書きを作成しました",
    "research.completed": "{sources} 件の情報源を調べ、調査を終えました",
    "skill.installed": "スキル {slug} {version} をインストールしました",
    "skill.removed": "スキル {slug} {version} を削除しました",
    "skill.failed": "{slug} {version} をインストールできませんでした — {errorCode}",
    "context.indexed": "{name} を {chunks} 個のチャンクに索引付けしました",
    "context.failed": "{name} を索引付けできませんでした — {errorCode}",
    "improvement.proposed": "自身の{kind}について改善を提案しました",
    "error.raised": "エラー: {errorCode}",
    "schedule.fired": "スケジュール {name} が実行されました",
    "schedule.skipped": "スケジュール {name} をスキップしました — {skipReason}",
    "schedule.failed": "スケジュール {name} が失敗しました — {errorCode}",
    "usage.recorded": "クレジットを {credits} 消費しました（{kind}）",
    custom: "{text}",
  },
  error: {
    model_unavailable: "モデルを利用できませんでした",
    provider_rate_limited: "モデルプロバイダーにレート制限されました",
    provider_auth_failed: "モデルプロバイダーが認証情報を拒否しました",
    credit_cap_reached: "クレジット上限に達しました",
    daily_action_limit: "1 日のアクション上限に達しました",
    max_runs_per_day: "1 日の実行回数上限に達しました",
    approval_timeout: "承認依頼が時間内に処理されませんでした",
    tool_disabled: "このツールはこのエージェントでは無効です",
    sandbox_denied: "サンドボックスが操作を拒否しました",
    egress_blocked: "外部ネットワークへの通信がブロックされました",
    channel_send_failed: "チャネルへの送信に失敗しました",
    channel_not_bound: "このエージェントにはチャネルが接続されていません",
    context_fetch_failed: "ナレッジソースを取得できませんでした",
    invalid_timezone: "設定されたタイムゾーンが不正です",
    skill_install_failed: "スキルのインストールに失敗しました",
    timeout: "処理がタイムアウトしました",
    out_of_memory: "ランタイムのメモリが不足しました",
    internal_error: "ランタイムで内部エラーが発生しました",
    runtime_instance_missing: "ArkAgent はこのエージェントのランタイムを見つけられませんでした",
  },
  skipReason: {
    instance_stopped: "エージェントが停止していたため",
    overlap: "前回の実行がまだ続いていたため",
    outside_working_hours: "稼働時間外だったため",
    disabled: "スケジュールが無効だったため",
    credit_cap_reached: "クレジット上限に達したため",
    max_runs_per_day: "1 日の実行回数上限に達したため",
    daily_action_limit: "1 日のアクション上限に達したため",
    channel_not_bound: "チャネルが接続されていなかったため",
    misfire: "スケジューラーが実行時刻を逃したため",
    misfire_too_old: "逃した時刻が古すぎて追いかけ実行しなかったため",
    dispatch_unsupported: "このランタイムはスケジュール実行に対応していないため",
  },
  denyReason: {
    autonomy_ask: "自律レベルが「まず確認する」設定のため",
    tool_disabled: "このツールが無効のため",
    approval_required: "あなたの承認が必要なため",
    daily_action_limit: "1 日のアクション上限に達したため",
    credit_cap_reached: "クレジット上限に達したため",
  },
  metric: {},
  severity: { info: "情報", notice: "注意", warning: "警告", error: "エラー" },
  trigger: {
    chat: "チャット",
    schedule: "スケジュール",
    channel: "チャネル",
    api: "API",
    self: "自発",
    system: "システム",
  },
  phase: {
    thinking: "思考",
    tool_call: "ツール呼び出し",
    tool_result: "ツールの結果",
    message: "メッセージ",
    final_answer: "回答",
  },
  status: {
    queued: "待機中",
    running: "実行中",
    succeeded: "成功",
    failed: "失敗",
    cancelled: "キャンセル",
    timeout: "タイムアウト",
  },
  tag: {
    meeting: "会議",
    draft: "下書き",
    research: "調査",
    review: "レビュー",
    outreach: "アウトリーチ",
    learning: "学習",
    resolved: "解決済み",
    escalated: "エスカレーション",
    summary: "サマリー",
    published: "公開済み",
    brief: "ブリーフ",
    calendar: "カレンダー",
    docs: "ドキュメント",
    system: "システム",
  },
  heartbeat: {
    ok: "正常に稼働中",
    stale: "ハートビートが遅延",
    dead: "ハートビートなし",
    expected_silence: "一時停止中 — ハートビートは来ません",
  },
  banner: {
    mock: "シミュレーターモードです。以下はすべて生成された値で、実測値ではありません。",
    unconfigured: "エージェントのランタイムが接続されていません。表示しているのは ArkAgent 自身の記録です。",
    degraded: "このエージェントのランタイムデータの一部を読み込めませんでした。",
  },
  empty: {
    timeline: {
      no_data_yet: {
        title: "まだ何もありません",
        body: "{name} は稼働していますが、まだ呼び出されていません。実行、メッセージ送信、スケジュール到達のいずれかが起きた時点でここに表示されます。",
      },
      never_provisioned: {
        title: "未デプロイ",
        body: "このエージェントはまだ準備中です。ランタイムから最初の報告が届いた時点で記録が始まります。",
      },
      runtime_mock: {
        title: "シミュレーターモード",
        body: "ランタイムはシミュレートされているため、実際の活動は記録されません。ここに出るものはすべて生成値です。",
      },
      runtime_unconfigured: {
        title: "ランタイム未接続",
        body: "この環境にはエージェントのランタイムがないため、活動を報告できるものがありません。ArkAgent 自身の記録は引き続き表示されます。",
      },
      telemetry_unsupported: {
        title: "{harness} はまだこれを送信しません",
        body: "{harness} はエージェントを動かせますが、実行やステップの詳細は送信しません。メッセージ・スケジュール・エラーは引き続き表示されます。",
      },
      filtered_out: {
        title: "該当なし",
        body: "この期間に出来事はありますが、現在の絞り込みに一致するものはありません。",
      },
    },
    runs: {
      no_data_yet: {
        title: "実行履歴はまだありません",
        body: "実行とは、ひとまとまりの作業のことです — スケジュールされたジョブ、あなたが送ったメッセージ、チャネルから届いた依頼。それぞれについて、たどったステップ・所要時間・費用・成否が記録されます。",
      },
      never_provisioned: {
        title: "未デプロイ",
        body: "ランタイムが起動し、最初の作業を受け取ってから記録が始まります。",
      },
      runtime_mock: {
        title: "シミュレーターモード",
        body: "ここの実行はシミュレーターによるものです。形は本物ですが、実際には起きていません。",
      },
      runtime_unconfigured: {
        title: "ランタイム未接続",
        body: "このエージェントを動かすものがないため、記録する作業もありません。",
      },
      telemetry_unsupported: {
        title: "{harness} は実行履歴を送信しません",
        body: "実行履歴はエージェントのランタイムが報告します。{harness} はまだ送信しないため、エージェントが働いていてもここは空のままです。メッセージ・スケジュール・エラーはタイムラインに表示されます。",
      },
      filtered_out: {
        title: "該当する実行はありません",
        body: "この期間に実行はありますが、現在の絞り込みに一致するものはありません。",
      },
    },
    toolCalls: {
      no_data_yet: {
        title: "実行の外での呼び出しはありません",
        body: "単独で発生したツール呼び出し — チャネルの Webhook、バックグラウンドのメモリ整理、承認コールバック — がここに入ります。空であれば、このエージェントの動作はすべて実行の中で完結しているということで、それが通常の状態です。",
      },
      never_provisioned: {
        title: "未デプロイ",
        body: "ランタイムが起動してからツール呼び出しが発生します。",
      },
      runtime_mock: {
        title: "シミュレーターモード",
        body: "シミュレーターは実行の外でツールを呼ばないため、表示するものがありません。",
      },
      runtime_unconfigured: {
        title: "ランタイム未接続",
        body: "ランタイムがなければツール呼び出しもありません。",
      },
      telemetry_unsupported: {
        title: "{harness} はステップ詳細を送信しません",
        body: "{harness} は個々のツール呼び出しを報告しないため、このビューは空のままです。",
      },
      filtered_out: {
        title: "該当なし",
        body: "この期間にツール呼び出しはありますが、絞り込みに一致するものはありません。",
      },
    },
    health: {
      no_data_yet: {
        title: "ヘルスデータがありません",
        body: "このエージェントのランタイムは CPU・メモリ・ディスクを報告していません。下の稼働状況はハートビートから得たもので、こちらは正確です。",
      },
      never_provisioned: {
        title: "未デプロイ",
        body: "デプロイされるまで計測する対象がありません。",
      },
      runtime_mock: {
        title: "シミュレートされた値",
        body: "これらの数値はシミュレーターが生成したもので、実測値ではありません。",
      },
      runtime_unconfigured: {
        title: "ランタイム未接続",
        body: "リソース使用状況を報告するものがありません。下の稼働状況は ArkAgent が最後に記録した内容です。",
      },
      telemetry_unsupported: {
        title: "{harness} はリソース使用状況を報告しません",
        body: "{harness} は CPU・メモリ・ディスクのサンプルを送信しません。下の稼働状況は引き続き利用できます。",
      },
      filtered_out: {
        title: "この期間にサンプルはありません",
        body: "より広い期間で試してください。",
      },
    },
    cost: {
      no_data_yet: {
        title: "まだ費用は発生していません",
        body: "実行がトークン使用量を報告するか、ArkAgent がこのエージェントのために行ったモデル呼び出しが計上されると、ここに表示されます。",
      },
      never_provisioned: {
        title: "未デプロイ",
        body: "まだ動いていないエージェントに費用は発生しません。",
      },
      runtime_mock: {
        title: "シミュレーターモード",
        body: "ここの数値はシミュレートされた実行によるもので、実際の支払いは発生していません。",
      },
      runtime_unconfigured: {
        title: "ランタイム未接続",
        body: "過去の合計は引き続き表示されますが、新しい費用は記録されません。",
      },
      telemetry_unsupported: {
        title: "{harness} は使用量を報告しません",
        body: "{harness} はトークン数を送信しないため、実行費用は空のままです。クレジットと ArkAgent 自身のモデル費用は表示されます。",
      },
      filtered_out: {
        title: "この期間に費用はありません",
        body: "より広い期間で試してください。",
      },
    },
    errors: {
      no_data_yet: {
        title: "問題は起きていません",
        body: "失敗した実行も、ランタイムのエラーも、あなたの対応待ちの項目もありません。",
      },
      never_provisioned: {
        title: "報告することはありません",
        body: "このエージェントはまだ動いていないため、失敗しようがありません。",
      },
      runtime_mock: {
        title: "シミュレーターモード",
        body: "シミュレーターが実際に生成したものだけが表示されます。",
      },
      runtime_unconfigured: {
        title: "ランタイム未接続",
        body: "過去の障害は引き続き表示されますが、新しい報告は届きません。",
      },
      telemetry_unsupported: {
        title: "{harness} はエラーのみ報告します",
        body: "{harness} は実行の詳細を送信しないため失敗した実行は出ませんが、ランタイムのエラーとエスカレーションは表示されます。",
      },
      filtered_out: {
        title: "該当なし",
        body: "この期間に障害の記録はありますが、絞り込みに一致するものはありません。",
      },
    },
  },
  action: {
    clearFilters: "絞り込みを解除",
    runNow: "今すぐ実行",
    openChat: "チャットを開く",
    setUpSchedule: "スケジュールを設定",
    viewDeployment: "デプロイを確認",
    whatsSupported: "対応状況を見る",
    contactAdmin: "管理者に連絡",
    tryAgain: "再試行",
    loadMore: "さらに読み込む",
  },
  label: {
    example: "例",
    loadFailed: "アクティビティを読み込めませんでした。",
    searchPlaceholder: "実行サマリーを検索",
    unpriced: "価格未設定",
    unpricedNote: "これらの実行はトークンを報告していますが、ArkAgent にそのモデルの価格がありません。",
    restartsObserved: "再起動回数（7 日間・観測値）",
    simulatedSample: "シミュレート値",
    rolledUp: "1 時間平均",
    stepsTruncated: "先頭のステップのみ表示しています。",
    stepsPruned: "ステップの記録は 90 日後に削除されました。",
    detailTruncated: "省略されています",
    agentWritten: "エージェントが書いた文章",
    configPending: "ランタイムに未適用",
    creditsLedger: "クレジット消費",
    llmLedger: "ArkAgent のモデル費用",
    runtimeLedger: "ランタイム報告の費用",
    ignoredFilters: "認識できない絞り込み値があったため、無視しました。",
  },
  ui: uiJa,
};

export const activity: Record<Lang, ActivityDict> = { en, zh, zht, ja };

/**
 * Fill `{holes}` in a template from `params`.
 *
 * SINGLE PASS, on purpose. `params` is third-party text, and a two-pass or
 * recursive substitution lets a param value containing `{secret}` pull in
 * another param — a template-injection through a field a remote runtime
 * controls. A hole with no matching param is left as the literal `{key}`,
 * which is visibly wrong rather than silently missing.
 *
 * The result is a plain string with no escaping applied, because the caller
 * renders it as a TEXT NODE. Anything that puts this into `innerHTML` has
 * introduced the vulnerability this comment exists to prevent.
 */
export function interpolate(template: string, params: ActivityParams): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = params[key];
    return v === undefined ? whole : String(v);
  });
}

/**
 * Render one activity row's sentence.
 *
 * `code === null` (a legacy row) and `code === "custom"` both render the row's
 * own `text`, agent-authored and unlocalised. Every other code renders its
 * template. An unknown key returns the raw key rather than throwing or falling
 * back to English.
 */
export function activityLine(
  dict: ActivityDict,
  code: ActivityCode | null,
  params: ActivityParams,
  text: string,
): string {
  if (code === null || code === "custom") return text;
  const template = dict.code[code];
  if (template === undefined) return code;
  return interpolate(template, params);
}
