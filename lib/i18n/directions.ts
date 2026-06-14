/** Copy for the internal "visual directions" page (/directions). */
import type { Lang } from "@/lib/types";

export interface DirectionsDict {
  back: string;
  pageTitle: string;
  pageIntro: string;

  // A — TERMINAL LIME
  aLabel: string;
  aBadge: string;
  aEyebrow: string;
  aHeadline1: string;
  aHeadline2: string;
  aSub: string;
  aCtaPrimary: string;
  aCtaSecondary: string;
  aLog1: string;
  aLog2: string;
  aStatus: string;
  aCaption: string;

  // B — IVORY STUDIO
  bLabel: string;
  bEyebrow: string;
  bHeadline1: string;
  bHeadline2: string;
  bSub: string;
  bCtaPrimary: string;
  bCtaSecondary: string;
  bAgentName: string;
  bAgentNote: string;
  bAgentStatus: string;
  bCaption: string;

  // C — MIDNIGHT CONSOLE
  cLabel: string;
  cEyebrow: string;
  cHeadline1: string;
  cHeadline2: string;
  cSub: string;
  cCtaPrimary: string;
  cCtaSecondary: string;
  cStatActiveLabel: string;
  cStatTasksLabel: string;
  cCaption: string;
}

const en: DirectionsDict = {
  back: "← Back to prototype",
  pageTitle: "ArkAgent — visual directions",
  pageIntro:
    "Three brand directions for the same hero. Direction A is built out as the live prototype; B and C are sketches we can switch to — say the word and I'll re-skin everything.",

  aLabel: "A — TERMINAL LIME",
  aBadge: "LIVE / SELECTED",
  aEyebrow: "THE AUTONOMOUS WORKFORCE",
  aHeadline1: "Hire an AI employee,",
  aHeadline2: "not another app.",
  aSub: "Real agents on dedicated machines, working 24/7 across every channel.",
  aCtaPrimary: "Hire your first agent →",
  aCtaSecondary: "See a live agent",
  aLog1: "Qualified lead → booked intro call",
  aLog2: "Replied to 3 tickets via WhatsApp",
  aStatus: "WORKING",
  aCaption:
    "Machine-room confidence. Mono data, hairline grid, lime as the single signal color. Differentiates hard from pastel-gradient AI sites.",

  bLabel: "B — IVORY STUDIO",
  bEyebrow: "ARKAGENT — THE AUTONOMOUS WORKFORCE",
  bHeadline1: "Your next hire",
  bHeadline2: "isn't human.",
  bSub: "Brief it like a person. It sells, supports and recruits — around the clock.",
  bCtaPrimary: "Meet the agents",
  bCtaSecondary: "How it works",
  bAgentName: "Nova · Sales Prospector",
  bAgentNote: "Booked 3 intro calls this morning",
  bAgentStatus: "● ON DUTY",
  bCaption:
    'Warm, editorial, human. Serif voice + soft cards makes "AI employee" feel trustworthy for non-technical SMB owners. Friendliest for the China market.',

  cLabel: "C — MIDNIGHT CONSOLE",
  cEyebrow: "ARKAGENT OS",
  cHeadline1: "The workforce,",
  cHeadline2: "virtualized.",
  cSub: "One console. Every agent, every channel, every machine.",
  cCtaPrimary: "Deploy an agent",
  cCtaSecondary: "View console",
  cStatActiveLabel: "ACTIVE AGENTS",
  cStatTasksLabel: "TASKS / WK",
  cCaption:
    "Enterprise ops-console energy. Blue glow, rounded surfaces, dashboard-first. Safest, most conventional of the three.",
};

const zh: DirectionsDict = {
  back: "← 返回原型",
  pageTitle: "ArkAgent — 视觉方向",
  pageIntro:
    "同一个首屏的三套品牌方向。方向 A 已落地为可交互的原型；B 和 C 是可随时切换的草案——你只要一句话，我就能把整体风格重做一遍。",

  aLabel: "A — TERMINAL LIME",
  aBadge: "已上线 / 已选定",
  aEyebrow: "自主运转的劳动力",
  aHeadline1: "雇一名 AI 员工，",
  aHeadline2: "而不是再装一个 App。",
  aSub: "真正的智能体运行在专属机器上，全天候打通每一个渠道。",
  aCtaPrimary: "雇你的第一个智能体 →",
  aCtaSecondary: "看看运行中的智能体",
  aLog1: "筛出优质线索 → 已预约初次通话",
  aLog2: "通过 WhatsApp 回复了 3 张工单",
  aStatus: "工作中",
  aCaption:
    "机房级的笃定感。等宽字体的数据、发丝般的网格、柠檬绿作为唯一的信号色。与那些粉彩渐变的 AI 网站拉开明显差距。",

  bLabel: "B — IVORY STUDIO",
  bEyebrow: "ARKAGENT — 自主运转的劳动力",
  bHeadline1: "你的下一位员工，",
  bHeadline2: "不是人类。",
  bSub: "像吩咐人一样给它下达任务。它全天候地销售、支持、招聘。",
  bCtaPrimary: "认识这些智能体",
  bCtaSecondary: "工作原理",
  bAgentName: "Nova · 销售开拓",
  bAgentNote: "今早已预约 3 次初次通话",
  bAgentStatus: "● 值班中",
  bCaption:
    "温暖、有编辑感、有人情味。衬线体的语调加上柔和的卡片，让「AI 员工」对不懂技术的中小企业主显得更可信。最适合中国市场。",

  cLabel: "C — MIDNIGHT CONSOLE",
  cEyebrow: "ARKAGENT OS",
  cHeadline1: "劳动力，",
  cHeadline2: "已被虚拟化。",
  cSub: "一个控制台。每一个智能体、每一个渠道、每一台机器。",
  cCtaPrimary: "部署一个智能体",
  cCtaSecondary: "查看控制台",
  cStatActiveLabel: "活跃智能体",
  cStatTasksLabel: "每周任务数",
  cCaption:
    "企业级运维控制台的气质。蓝色光晕、圆润的界面、以仪表盘为先。三套里最稳妥、最常规的一套。",
};

const zht: DirectionsDict = {
  back: "← 返回原型",
  pageTitle: "ArkAgent — 視覺方向",
  pageIntro:
    "同一個主視覺的三套品牌方向。方向 A 已落地為可互動的原型；B 與 C 是可隨時切換的草案——你只要一句話，我就能把整體風格重做一遍。",

  aLabel: "A — TERMINAL LIME",
  aBadge: "已上線 / 已選定",
  aEyebrow: "自主運轉的勞動力",
  aHeadline1: "僱一名 AI 員工，",
  aHeadline2: "而不是再裝一個 App。",
  aSub: "真正的智能體運行在專屬機器上，全天候打通每一個渠道。",
  aCtaPrimary: "僱你的第一個智能體 →",
  aCtaSecondary: "看看運行中的智能體",
  aLog1: "篩出優質潛在客戶 → 已預約初次通話",
  aLog2: "透過 WhatsApp 回覆了 3 張工單",
  aStatus: "工作中",
  aCaption:
    "機房級的篤定感。等寬字體的資料、髮絲般的網格、檸檬綠作為唯一的訊號色。與那些粉彩漸層的 AI 網站拉開明顯差距。",

  bLabel: "B — IVORY STUDIO",
  bEyebrow: "ARKAGENT — 自主運轉的勞動力",
  bHeadline1: "你的下一位員工，",
  bHeadline2: "不是人類。",
  bSub: "像吩咐人一樣給它下達任務。它全天候地銷售、支援、招募。",
  bCtaPrimary: "認識這些智能體",
  bCtaSecondary: "運作方式",
  bAgentName: "Nova · 銷售開拓",
  bAgentNote: "今早已預約 3 次初次通話",
  bAgentStatus: "● 值班中",
  bCaption:
    "溫暖、有編輯感、有人情味。襯線體的語調加上柔和的卡片，讓「AI 員工」對不懂技術的中小企業主顯得更可信。最適合中國市場。",

  cLabel: "C — MIDNIGHT CONSOLE",
  cEyebrow: "ARKAGENT OS",
  cHeadline1: "勞動力，",
  cHeadline2: "已被虛擬化。",
  cSub: "一個控制台。每一個智能體、每一個渠道、每一台機器。",
  cCtaPrimary: "部署一個智能體",
  cCtaSecondary: "查看控制台",
  cStatActiveLabel: "活躍智能體",
  cStatTasksLabel: "每週任務數",
  cCaption:
    "企業級維運控制台的氣質。藍色光暈、圓潤的介面、以儀表板為先。三套裡最穩妥、最常規的一套。",
};

const ja: DirectionsDict = {
  back: "← プロトタイプに戻る",
  pageTitle: "ArkAgent — ビジュアルの方向性",
  pageIntro:
    "同じヒーローに対する3つのブランドの方向性です。方向性 A はライブのプロトタイプとして作り込み済み。B と C はいつでも切り替えられるスケッチで——ひと言いただければ、全体を作り直します。",

  aLabel: "A — TERMINAL LIME",
  aBadge: "ライブ / 採用中",
  aEyebrow: "自律して働く労働力",
  aHeadline1: "AI社員を雇おう、",
  aHeadline2: "アプリではなく。",
  aSub: "専用マシン上で動く本物のエージェントが、あらゆるチャネルで24時間365日働きます。",
  aCtaPrimary: "最初のエージェントを雇う →",
  aCtaSecondary: "稼働中のエージェントを見る",
  aLog1: "有望なリードを選別 → 初回コールを予約",
  aLog2: "WhatsApp で3件の問い合わせに返信",
  aStatus: "稼働中",
  aCaption:
    "マシンルームのような確かさ。等幅フォントのデータ、極細のグリッド、唯一のシグナルカラーとしてのライム。パステルグラデーションのAIサイトとくっきり差別化します。",

  bLabel: "B — IVORY STUDIO",
  bEyebrow: "ARKAGENT — 自律して働く労働力",
  bHeadline1: "次の採用は、",
  bHeadline2: "人間ではない。",
  bSub: "人に頼むように指示するだけ。販売も、サポートも、採用も、24時間こなします。",
  bCtaPrimary: "エージェントに会う",
  bCtaSecondary: "仕組み",
  bAgentName: "Nova · セールス開拓担当",
  bAgentNote: "今朝、初回コールを3件予約しました",
  bAgentStatus: "● 勤務中",
  bCaption:
    "あたたかく、編集的で、人間味がある。セリフ体の語り口と柔らかなカードが、技術に詳しくない中小企業オーナーにも「AI社員」を信頼できるものに感じさせます。中国市場に最も親しみやすい方向性です。",

  cLabel: "C — MIDNIGHT CONSOLE",
  cEyebrow: "ARKAGENT OS",
  cHeadline1: "労働力を、",
  cHeadline2: "仮想化する。",
  cSub: "ひとつのコンソールに。すべてのエージェント、すべてのチャネル、すべてのマシンを。",
  cCtaPrimary: "エージェントを配備する",
  cCtaSecondary: "コンソールを見る",
  cStatActiveLabel: "稼働中のエージェント",
  cStatTasksLabel: "タスク / 週",
  cCaption:
    "エンタープライズの運用コンソールらしい雰囲気。青いグロー、丸みのある面、ダッシュボード重視。3つの中で最も無難で王道な方向性です。",
};

export const directions: Record<Lang, DirectionsDict> = { en, zh, zht, ja };
