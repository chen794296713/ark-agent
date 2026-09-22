/**
 * Copy for the schedules surface — the editor, the list, the run history and
 * every reason a run did not happen.
 *
 * This dictionary is what the API's `code` fields are FOR. Routes answer with a
 * stable machine code (`invalid_cron`, `channel_not_bound`, …) and the English
 * sentence beside it is developer detail; the string a person reads comes from
 * here, in their own language. Anything that renders an API `error` message
 * directly is shipping English to a zh/zht/ja user.
 *
 * Numbers stay OUT of the strings. Every message whose English draft embedded a
 * count ("this fires 288 times a day; the limit is 96") keeps those numbers in
 * the response's `detail` object, so one dictionary entry serves all four
 * languages without four copies of a sentence template.
 */
import type { Lang } from "@/lib/types";

/** Every code `validateScheduleInput` and the preview route can refuse with. */
export type ScheduleErrorKey =
  | "invalid_cron"
  | "invalid_timezone"
  | "never_matches"
  | "run_at_in_past"
  | "interval_not_supported"
  | "interval_not_representable"
  | "exceeds_max_runs_per_day"
  | "deliver_target_unavailable"
  | "schedule_limit_reached"
  | "invalid_cursor"
  | "unreadable"
  | "unknown";

/**
 * The contract's seven skip reasons plus the four ArkAgent-originated ones the
 * tick writes itself. `agent_schedule_runs.skip_reason` is a bare varchar, so
 * this map is the only thing standing between the user and a raw column value.
 */
export type SkipReasonKey =
  | "instance_stopped"
  | "overlap"
  | "outside_working_hours"
  | "disabled"
  | "credit_cap_reached"
  | "max_runs_per_day"
  | "daily_action_limit"
  | "channel_not_bound"
  | "misfire"
  | "misfire_too_old"
  | "dispatch_unsupported";

export interface ScheduleDict {
  error: Record<ScheduleErrorKey, string>;
  skipReason: Record<SkipReasonKey, string>;
  runStatus: Record<"started" | "succeeded" | "failed" | "skipped", string>;
  terminalState: Record<"once_consumed" | "never_runs" | "paused", string>;
  /** The §3.1 banner, driven by TickHealthDTO. */
  tick: { coarse: string; stalled: string; healthy: string; unknown: string };
  /** How firmly the editor should hold the parse it made. */
  band: { accept: string; confirm: string; none: string; cron: string };
  assumedTime: string;
  unionWarning: string;
  dstShift: string;
  llmUnavailable: string;
  managerUnconfigured: string;
  mailUnconfigured: string;
}

const en: ScheduleDict = {
  error: {
    invalid_cron: "That is not a valid cron expression.",
    invalid_timezone: "That time zone is not one we recognise.",
    never_matches: "Nothing will ever match this — it would never run.",
    run_at_in_past: "That time has already passed.",
    interval_not_supported: "Use a repeating schedule instead — “every 15 minutes” is saved as a cron expression.",
    interval_not_representable: "That step does not divide evenly, so the gaps would be uneven.",
    exceeds_max_runs_per_day: "This would run more often than this schedule allows.",
    deliver_target_unavailable: "There is nowhere to deliver this yet.",
    schedule_limit_reached: "You have reached the limit on schedules. Delete or disable one first.",
    invalid_cursor: "That page link is no longer valid. Reload the history.",
    unreadable: "We could not read that as a schedule.",
    unknown: "The schedule could not be saved.",
  },
  skipReason: {
    instance_stopped: "The agent's machine was stopped.",
    overlap: "The previous run was still going.",
    outside_working_hours: "It fell outside the agent's working hours.",
    disabled: "The schedule was switched off.",
    credit_cap_reached: "The credit cap was reached.",
    max_runs_per_day: "The daily run limit was reached.",
    daily_action_limit: "The agent's daily action limit was reached.",
    channel_not_bound: "The channel it delivers to is no longer connected.",
    misfire: "It was missed while ArkAgent was unavailable.",
    misfire_too_old: "It was missed more than a day ago, so it was not caught up.",
    dispatch_unsupported: "The runtime cannot accept scheduled work right now.",
  },
  runStatus: { started: "Running", succeeded: "Done", failed: "Failed", skipped: "Skipped" },
  terminalState: {
    once_consumed: "Already run",
    never_runs: "Will never run",
    paused: "Paused",
  },
  tick: {
    coarse: "The platform checks schedules less often than this one needs, so runs will be late.",
    stalled: "Schedules are not being checked at all right now.",
    healthy: "Schedules are being checked on time.",
    unknown: "Not enough history yet to judge timing.",
  },
  band: {
    accept: "Read as",
    confirm: "Is this right?",
    none: "Could not read that — start from this instead",
    cron: "Cron expression",
  },
  assumedTime: "No time of day was given, so 09:00 was assumed.",
  unionWarning: "Both the date and the weekday are set, so it runs when EITHER matches.",
  dstShift: "The clocks change here — this run shifts by an hour.",
  llmUnavailable: "Assisted reading is off on this deployment; plain phrases and cron still work.",
  managerUnconfigured: "No agent runtime is configured, so nothing will actually be dispatched.",
  mailUnconfigured: "Email delivery is not configured on this deployment.",
};

const zh: ScheduleDict = {
  error: {
    invalid_cron: "这不是有效的 cron 表达式。",
    invalid_timezone: "无法识别该时区。",
    never_matches: "没有任何时间符合该条件，它永远不会运行。",
    run_at_in_past: "该时间已经过去了。",
    interval_not_supported: "请改用重复计划——“每 15 分钟”会保存为 cron 表达式。",
    interval_not_representable: "该步长无法整除，间隔会长短不一。",
    exceeds_max_runs_per_day: "这样运行的次数会超过该计划允许的上限。",
    deliver_target_unavailable: "目前还没有可送达的位置。",
    schedule_limit_reached: "计划数量已达上限，请先删除或停用一个。",
    invalid_cursor: "该分页链接已失效，请重新加载历史记录。",
    unreadable: "无法把它理解成一个计划。",
    unknown: "计划保存失败。",
  },
  skipReason: {
    instance_stopped: "智能体的机器已停止。",
    overlap: "上一次运行尚未结束。",
    outside_working_hours: "不在智能体的工作时间内。",
    disabled: "该计划已关闭。",
    credit_cap_reached: "已达到额度上限。",
    max_runs_per_day: "已达到每日运行次数上限。",
    daily_action_limit: "已达到智能体的每日操作上限。",
    channel_not_bound: "送达的渠道已断开连接。",
    misfire: "ArkAgent 不可用期间错过了这次运行。",
    misfire_too_old: "错过已超过一天，因此没有补跑。",
    dispatch_unsupported: "运行时目前无法接收计划任务。",
  },
  runStatus: { started: "运行中", succeeded: "已完成", failed: "失败", skipped: "已跳过" },
  terminalState: {
    once_consumed: "已运行",
    never_runs: "永不运行",
    paused: "已暂停",
  },
  tick: {
    coarse: "平台检查计划的频率低于该计划的需要，运行会延迟。",
    stalled: "目前完全没有在检查计划。",
    healthy: "计划正在按时检查。",
    unknown: "记录还不够，暂时无法判断时效。",
  },
  band: {
    accept: "理解为",
    confirm: "这样对吗？",
    none: "无法理解，请从下面这个开始改",
    cron: "cron 表达式",
  },
  assumedTime: "没有指定具体时间，已按 09:00 处理。",
  unionWarning: "日期和星期都做了限制，因此只要满足其一就会运行。",
  dstShift: "此地要调整时钟，这次运行会前后相差一小时。",
  llmUnavailable: "本部署未启用智能解析；日常说法和 cron 表达式仍可使用。",
  managerUnconfigured: "尚未配置智能体运行时，实际不会派发任何任务。",
  mailUnconfigured: "本部署未配置邮件发送。",
};

const zht: ScheduleDict = {
  error: {
    invalid_cron: "這不是有效的 cron 運算式。",
    invalid_timezone: "無法辨識該時區。",
    never_matches: "沒有任何時間符合這個條件，它永遠不會執行。",
    run_at_in_past: "該時間已經過去了。",
    interval_not_supported: "請改用重複排程——「每 15 分鐘」會存成 cron 運算式。",
    interval_not_representable: "這個間隔無法整除，間距會長短不一。",
    exceeds_max_runs_per_day: "這樣執行的次數會超過該排程允許的上限。",
    deliver_target_unavailable: "目前還沒有可以送達的位置。",
    schedule_limit_reached: "排程數量已達上限，請先刪除或停用一個。",
    invalid_cursor: "這個分頁連結已失效，請重新載入紀錄。",
    unreadable: "無法把它理解成一個排程。",
    unknown: "排程儲存失敗。",
  },
  skipReason: {
    instance_stopped: "智慧體的機器已停止。",
    overlap: "上一次執行尚未結束。",
    outside_working_hours: "不在智慧體的工作時間內。",
    disabled: "這個排程已關閉。",
    credit_cap_reached: "已達到額度上限。",
    max_runs_per_day: "已達到每日執行次數上限。",
    daily_action_limit: "已達到智慧體的每日操作上限。",
    channel_not_bound: "送達的頻道已中斷連線。",
    misfire: "ArkAgent 無法使用期間錯過了這次執行。",
    misfire_too_old: "錯過已超過一天，因此沒有補跑。",
    dispatch_unsupported: "執行環境目前無法接收排程工作。",
  },
  runStatus: { started: "執行中", succeeded: "已完成", failed: "失敗", skipped: "已略過" },
  terminalState: {
    once_consumed: "已執行",
    never_runs: "永不執行",
    paused: "已暫停",
  },
  tick: {
    coarse: "平台檢查排程的頻率低於這個排程的需要，執行會延遲。",
    stalled: "目前完全沒有在檢查排程。",
    healthy: "排程正在準時檢查。",
    unknown: "紀錄還不夠，暫時無法判斷時效。",
  },
  band: {
    accept: "理解為",
    confirm: "這樣對嗎？",
    none: "無法理解，請從下面這個開始改",
    cron: "cron 運算式",
  },
  assumedTime: "沒有指定時間，已當作 09:00 處理。",
  unionWarning: "日期與星期都設了限制，因此只要符合其一就會執行。",
  dstShift: "此地要調整時鐘，這次執行會前後相差一小時。",
  llmUnavailable: "本部署未啟用智慧解析；日常說法與 cron 運算式仍可使用。",
  managerUnconfigured: "尚未設定智慧體執行環境，實際不會派送任何工作。",
  mailUnconfigured: "本部署未設定郵件寄送。",
};

const ja: ScheduleDict = {
  error: {
    invalid_cron: "有効な cron 式ではありません。",
    invalid_timezone: "そのタイムゾーンは認識できません。",
    never_matches: "条件に当てはまる時刻がなく、一度も実行されません。",
    run_at_in_past: "その時刻はすでに過ぎています。",
    interval_not_supported: "繰り返しスケジュールをお使いください。「15 分ごと」は cron 式として保存されます。",
    interval_not_representable: "この間隔では割り切れないため、実行のあいだが不揃いになります。",
    exceeds_max_runs_per_day: "このスケジュールで許可された回数を超えて実行されます。",
    deliver_target_unavailable: "届け先がまだありません。",
    schedule_limit_reached: "スケジュール数が上限に達しました。どれかを削除するか停止してください。",
    invalid_cursor: "このページリンクは無効になりました。履歴を再読み込みしてください。",
    unreadable: "スケジュールとして読み取れませんでした。",
    unknown: "スケジュールを保存できませんでした。",
  },
  skipReason: {
    instance_stopped: "エージェントのマシンが停止していました。",
    overlap: "前回の実行がまだ続いていました。",
    outside_working_hours: "エージェントの稼働時間外でした。",
    disabled: "スケジュールがオフになっていました。",
    credit_cap_reached: "クレジットの上限に達しました。",
    max_runs_per_day: "1 日の実行回数の上限に達しました。",
    daily_action_limit: "エージェントの 1 日の操作上限に達しました。",
    channel_not_bound: "届け先のチャネルの接続が切れています。",
    misfire: "ArkAgent が利用できないあいだに実行機会を逃しました。",
    misfire_too_old: "1 日以上前に逃した実行のため、追いかけて実行しませんでした。",
    dispatch_unsupported: "ランタイムが今はスケジュール実行を受け付けられません。",
  },
  runStatus: { started: "実行中", succeeded: "完了", failed: "失敗", skipped: "スキップ" },
  terminalState: {
    once_consumed: "実行済み",
    never_runs: "実行されません",
    paused: "停止中",
  },
  tick: {
    coarse: "プラットフォームの確認間隔がこのスケジュールの必要より粗く、実行が遅れます。",
    stalled: "現在、スケジュールがまったく確認されていません。",
    healthy: "スケジュールは時間どおりに確認されています。",
    unknown: "履歴が足りず、まだ時間精度を判断できません。",
  },
  band: {
    accept: "この解釈で実行します",
    confirm: "この解釈で合っていますか？",
    none: "読み取れませんでした。こちらから直してください",
    cron: "cron 式",
  },
  assumedTime: "時刻の指定がなかったため 09:00 として扱いました。",
  unionWarning: "日付と曜日の両方を指定しているため、どちらかに当てはまれば実行されます。",
  dstShift: "この地域は時計が変わるため、この回だけ 1 時間ずれます。",
  llmUnavailable: "この環境では解釈の補助が無効です。ふつうの言い回しと cron 式は使えます。",
  managerUnconfigured: "エージェントのランタイムが未設定のため、実際には送信されません。",
  mailUnconfigured: "この環境ではメール送信が設定されていません。",
};

export const schedules: Record<Lang, ScheduleDict> = { en, zh, zht, ja };

/**
 * The one lookup every route and every component should go through. Falls back
 * to `unknown` rather than to the raw code: a user should never be shown
 * `deliver_target_unavailable`, and a missing key is our bug, not their problem.
 */
export function scheduleErrorText(code: string | null | undefined, lang: Lang = "en"): string {
  const dict = schedules[lang] ?? schedules.en;
  return dict.error[(code ?? "unknown") as ScheduleErrorKey] ?? dict.error.unknown;
}

/** Same contract for `agent_schedule_runs.skip_reason`, which is a bare varchar. */
export function skipReasonText(reason: string | null | undefined, lang: Lang = "en"): string | null {
  if (!reason) return null;
  const dict = schedules[lang] ?? schedules.en;
  return dict.skipReason[reason as SkipReasonKey] ?? null;
}
