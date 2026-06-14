/** Copy for the marketing landing page (app/page.tsx). */
import type { Lang } from "@/lib/types";

export interface LandingDict {
  // Hero
  eyebrow: string;
  heroT1: string;
  heroT2: string;
  heroSub: string;
  cta1: string;
  cta2: string;
  heroFoot: string;

  // Live employee card
  cardRole: string;
  cardStatus: string;
  cardCredits: string;

  // Roles section
  rosterEyebrow: string;
  rosterTitle: string;
  rosterSub: string;
  rosterHire: string;

  // How it works
  howEyebrow: string;
  howTitleL1: string;
  howTitleL2: string;
  how1Title: string;
  how1Body: string;
  how2Title: string;
  how2Body: string;
  how3Title: string;
  how3Body: string;
  channelsLabel: string;

  // Engines
  enginesEyebrow: string;
  enginesTitle: string;
  engCommunityKicker: string;
  engCommunityBody: string;
  engCommunityBest: string;
  engPrecisionKicker: string;
  engPrecisionBody: string;
  engPrecisionBest: string;
  engRecommendedKicker: string;
  engRecommendedName: string;
  engRecommendedBody: string;
  engRecommendedBest: string;

  // Learning / self-review
  learnEyebrow: string;
  learnTitle: string;
  learnBody: string;
  learnPoint1: string;
  learnPoint2: string;
  learnPoint3: string;
  reviewHeader: string;
  reviewReplyRate: string;
  reviewMeetings: string;
  reviewLeadScore: string;
  reviewQuote: string;
  reviewLearnedFrom: string;
  reviewQueued: string;
  reviewImpact: string;
  reviewApprove: string;
  reviewApproved: string;

  // Pricing
  pricingEyebrow: string;
  pricingTitleL1: string;
  pricingTitleL2: string;
  pricingSub: string;
  perMonth: string;
  startHiring: string;
  planAssociate: string;
  planAssociateTag: string;
  associateF1: string;
  associateF2: string;
  associateF3: string;
  associateF4: string;
  planProfessional: string;
  planProfessionalTag: string;
  mostHired: string;
  professionalF1: string;
  professionalF2: string;
  professionalF3: string;
  professionalF4: string;
  professionalF5: string;
  planDirector: string;
  planDirectorTag: string;
  directorF1: string;
  directorF2: string;
  directorF3: string;
  directorF4: string;
  directorF5: string;
  pricingFoot: string;

  // Footer
  footTagline: string;
  footCopyright: string;
  footProduct: string;
  footProductAgents: string;
  footProductEngines: string;
  footProductPricing: string;
  footCompany: string;
  footAbout: string;
  footSecurity: string;
  footCareers: string;
  footRegions: string;
  footRegionGlobal: string;
  footRegionChina: string;
  footDirections: string;

  // a11y
  openMenu: string;
}

export const landing: Record<Lang, LandingDict> = {
  en: {
    eyebrow: "AI EMPLOYEES, NOT ANOTHER TOOL",
    heroT1: "Hire an AI employee.",
    heroT2: "Not another app.",
    heroSub:
      "ArkAgent gives you autonomous teammates that work around the clock — briefed in plain language, deployed in minutes, improving every week.",
    cta1: "Hire your first agent",
    cta2: "See the console",
    heroFoot: "NO CREDIT CARD · 14-DAY TRIAL · LIVE IN MINUTES",

    cardRole: "Sales Prospector",
    cardStatus: "WORKING",
    cardCredits: "2,180 credits this week",

    rosterEyebrow: "THE ROSTER",
    rosterTitle: "Every seat you can't fill yet.",
    rosterSub:
      "Eight ready-made roles — or describe your own. Each agent ships with a job-specific skill set and learns your business from day one.",
    rosterHire: "HIRE →",

    howEyebrow: "HOW IT WORKS",
    howTitleL1: "Brief it like a person.",
    howTitleL2: "Deploy it like software.",
    how1Title: "Describe the job",
    how1Body:
      "Role, instructions, rules, first tasks, reminders. Plain language — no flowcharts to build, nothing to integrate.",
    how2Title: "We spin up the machine",
    how2Body:
      "A dedicated VM boots with OpenClaw or Hermes loaded, briefed on your business and connected to your channels — in minutes.",
    how3Title: "Manage from anywhere",
    how3Body:
      "Telegram, WhatsApp, WeChat, LINE or the web console. Assign tasks, review work, approve improvements.",
    channelsLabel: "ONE AGENT, EVERY CHANNEL",

    enginesEyebrow: "PICK YOUR ENGINE",
    enginesTitle: "Two engines. One workforce.",
    engCommunityKicker: "COMMUNITY ENGINE",
    engCommunityBody:
      "The open agent runtime. 100+ skills, every major messaging channel, and a massive plugin ecosystem that grows weekly.",
    engCommunityBest: "BEST FOR → outreach, support,\nchannel-heavy roles",
    engPrecisionKicker: "PRECISION ENGINE",
    engPrecisionBody:
      "A deep-reasoning operator built for long-horizon work, with strict guardrails, approvals and a full audit trail.",
    engPrecisionBest: "BEST FOR → legal, finance,\nresearch, OPC operations",
    engRecommendedKicker: "RECOMMENDED",
    engRecommendedName: "Auto-match",
    engRecommendedBody:
      "We read the job brief and assign the engine that fits. Switch anytime — no migration, no downtime, same memory.",
    engRecommendedBest: "BEST FOR → everyone else",

    learnEyebrow: "SELF-REVIEW",
    learnTitle: "Agents that get better every week.",
    learnBody:
      "Every ArkAgent runs a scheduled self-review: what worked, what didn't, what to change next. It does the learning — you approve the changes.",
    learnPoint1: "Feedback loop from your replies, ratings and corrections",
    learnPoint2: "Persistent memory of your business, tone and rules",
    learnPoint3: "An improvement queue you approve with one tap",
    reviewHeader: "SELF-REVIEW · WEEK OF JUN 8",
    reviewReplyRate: "REPLY RATE",
    reviewMeetings: "MEETINGS",
    reviewLeadScore: "LEAD SCORE",
    reviewQuote:
      "“Tuesday 10–11am is the best send window for logistics ICP. Case-study openers outperform intro blurbs 2:1.”",
    reviewLearnedFrom: "LEARNED FROM 142 INTERACTIONS",
    reviewQueued: "Queued change: shorten follow-up #2 to three lines",
    reviewImpact: "EXPECTED IMPACT +6% REPLY RATE",
    reviewApprove: "Approve",
    reviewApproved: "✓ Approved",

    pricingEyebrow: "PRICING",
    pricingTitleL1: "Pay like payroll.",
    pricingTitleL2: "Scale like software.",
    pricingSub:
      "Per-agent monthly plans with included credits. Usage beyond the allowance is metered at $2 per 1,000 credits.",
    perMonth: " /agent/mo",
    startHiring: "Start hiring",
    planAssociate: "Associate",
    planAssociateTag: "YOUR FIRST HIRE",
    associateF1: "5,000 credits included monthly",
    associateF2: "1 messaging channel",
    associateF3: "Weekly self-review",
    associateF4: "OpenClaw engine",
    planProfessional: "Professional",
    planProfessionalTag: "A REAL TEAMMATE",
    mostHired: "MOST HIRED",
    professionalF1: "25,000 credits included monthly",
    professionalF2: "All channels — Telegram to WeChat",
    professionalF3: "Daily self-review + persistent memory",
    professionalF4: "Both engines + auto-match",
    professionalF5: "Priority compute",
    planDirector: "Director",
    planDirectorTag: "OPC & HEAVY ROLES",
    directorF1: "100,000 credits included monthly",
    directorF2: "Dedicated VM resources",
    directorF3: "OPC mode — one agent, many hats",
    directorF4: "Audit log & approval workflows",
    directorF5: "White-glove onboarding",
    pricingFoot: "ANNUAL −20% · 14-DAY TRIAL ON EVERY SEAT · UNUSED CREDITS ROLL OVER ONE CYCLE",

    footTagline: "Autonomous employees for everyone.",
    footCopyright: "© 2026 ARKAGENT INC.",
    footProduct: "PRODUCT",
    footProductAgents: "Agents",
    footProductEngines: "Engines",
    footProductPricing: "Pricing",
    footCompany: "COMPANY",
    footAbout: "About",
    footSecurity: "Security",
    footCareers: "Careers",
    footRegions: "REGIONS",
    footRegionGlobal: "— GLOBAL",
    footRegionChina: "— 中国大陆",
    footDirections: "⌥ DESIGN DIRECTIONS",

    openMenu: "Open menu",
  },

  zh: {
    eyebrow: "雇的是 AI 员工，不是又一个工具",
    heroT1: "雇一名 AI 员工。",
    heroT2: "而不是又一个软件。",
    heroSub:
      "ArkAgent 给你一支全天候待命的自主团队——用大白话交代任务，几分钟就能上岗，每周都在变得更强。",
    cta1: "雇佣你的第一名员工",
    cta2: "看看控制台",
    heroFoot: "无需信用卡 · 14 天试用 · 几分钟上线",

    cardRole: "销售开发员",
    cardStatus: "工作中",
    cardCredits: "本周已用 2,180 积分",

    rosterEyebrow: "员工花名册",
    rosterTitle: "那些你一直招不到的岗位。",
    rosterSub:
      "八个开箱即用的岗位——或者自己描述一个。每名员工都自带岗位专属技能，从第一天起就开始读懂你的生意。",
    rosterHire: "雇佣 →",

    howEyebrow: "工作原理",
    howTitleL1: "像交代同事一样布置工作。",
    howTitleL2: "像部署软件一样上线。",
    how1Title: "描述这份工作",
    how1Body:
      "岗位、说明、规则、第一批任务、提醒事项——全用大白话。不用画流程图，也不用对接任何系统。",
    how2Title: "我们为它开机",
    how2Body:
      "一台专属虚拟机启动，装好 OpenClaw 或 Hermes，了解你的业务，接入你的渠道——只需几分钟。",
    how3Title: "随时随地管理",
    how3Body:
      "Telegram、WhatsApp、微信、LINE，或者网页控制台。派活、验收、一键批准改进。",
    channelsLabel: "一名员工，通吃所有渠道",

    enginesEyebrow: "选择你的引擎",
    enginesTitle: "两种引擎，一支队伍。",
    engCommunityKicker: "社区引擎",
    engCommunityBody:
      "开放的智能体运行时。100+ 技能，覆盖所有主流通讯渠道，外加每周都在壮大的庞大插件生态。",
    engCommunityBest: "最适合 → 拓客、客服、\n重渠道岗位",
    engPrecisionKicker: "精密引擎",
    engPrecisionBody:
      "为长周期工作打造的深度推理操盘手，配备严格的安全护栏、审批流程和完整的操作留痕。",
    engPrecisionBest: "最适合 → 法务、财务、\n研究、OPC 运营",
    engRecommendedKicker: "推荐",
    engRecommendedName: "自动匹配",
    engRecommendedBody:
      "我们读懂工作简报，自动派上最合适的引擎。随时切换——免迁移、零停机、记忆不丢。",
    engRecommendedBest: "最适合 → 其他所有人",

    learnEyebrow: "自我复盘",
    learnTitle: "每周都在进步的员工。",
    learnBody:
      "每一名 ArkAgent 都会定期自我复盘：哪些奏效、哪些没有、下一步改什么。学习的活它来干——批准与否你来定。",
    learnPoint1: "从你的回复、评分和纠正中形成反馈闭环",
    learnPoint2: "持久记住你的业务、语气和规则",
    learnPoint3: "一个改进队列，轻点一下即可批准",
    reviewHeader: "自我复盘 · 6 月 8 日当周",
    reviewReplyRate: "回复率",
    reviewMeetings: "会议数",
    reviewLeadScore: "线索评分",
    reviewQuote:
      "“周二上午 10–11 点是物流 ICP 的最佳发送时段。以案例开场的转化是普通介绍的两倍。”",
    reviewLearnedFrom: "源自 142 次互动的总结",
    reviewQueued: "待批准的改动：把第 2 次跟进缩短到三行",
    reviewImpact: "预计带来 +6% 回复率",
    reviewApprove: "批准",
    reviewApproved: "✓ 已批准",

    pricingEyebrow: "价格",
    pricingTitleL1: "像发工资一样付费。",
    pricingTitleL2: "像软件一样扩张。",
    pricingSub:
      "按员工计费的月度套餐，含基础积分。超出额度部分按每 1,000 积分 2 美元计费。",
    perMonth: " /员工/月",
    startHiring: "开始招聘",
    planAssociate: "助理级",
    planAssociateTag: "你的第一名员工",
    associateF1: "每月含 5,000 积分",
    associateF2: "1 个通讯渠道",
    associateF3: "每周自我复盘",
    associateF4: "OpenClaw 引擎",
    planProfessional: "专业级",
    planProfessionalTag: "真正的得力队友",
    mostHired: "最受欢迎",
    professionalF1: "每月含 25,000 积分",
    professionalF2: "全渠道——从 Telegram 到微信",
    professionalF3: "每日自我复盘 + 持久记忆",
    professionalF4: "两种引擎 + 自动匹配",
    professionalF5: "优先算力",
    planDirector: "总监级",
    planDirectorTag: "OPC 与重型岗位",
    directorF1: "每月含 100,000 积分",
    directorF2: "专属虚拟机资源",
    directorF3: "OPC 模式——一人身兼多职",
    directorF4: "审计日志与审批流程",
    directorF5: "专属贴身上手服务",
    pricingFoot: "年付立减 20% · 每个席位 14 天试用 · 未用积分顺延一个周期",

    footTagline: "让每个人都用得起的自主员工。",
    footCopyright: "© 2026 ARKAGENT INC.",
    footProduct: "产品",
    footProductAgents: "智能员工",
    footProductEngines: "引擎",
    footProductPricing: "价格",
    footCompany: "公司",
    footAbout: "关于我们",
    footSecurity: "安全",
    footCareers: "招贤纳士",
    footRegions: "区域",
    footRegionGlobal: "— 全球",
    footRegionChina: "— 中国大陆",
    footDirections: "⌥ 设计风格",

    openMenu: "打开菜单",
  },

  zht: {
    eyebrow: "雇的是 AI 員工，不是又一個工具",
    heroT1: "雇一名 AI 員工。",
    heroT2: "而不是又一個軟體。",
    heroSub:
      "ArkAgent 給你一支全天候待命的自主團隊——用大白話交代任務，幾分鐘就能上工，每週都在變得更強。",
    cta1: "雇用你的第一名員工",
    cta2: "看看控制台",
    heroFoot: "免信用卡 · 14 天試用 · 幾分鐘上線",

    cardRole: "業務開發員",
    cardStatus: "工作中",
    cardCredits: "本週已用 2,180 點數",

    rosterEyebrow: "員工名冊",
    rosterTitle: "那些你一直補不到的職缺。",
    rosterSub:
      "八個開箱即用的職位——或者自己描述一個。每名員工都自帶職位專屬技能，從第一天起就開始讀懂你的生意。",
    rosterHire: "雇用 →",

    howEyebrow: "運作方式",
    howTitleL1: "像交代同事一樣安排工作。",
    howTitleL2: "像部署軟體一樣上線。",
    how1Title: "描述這份工作",
    how1Body:
      "職位、說明、規則、第一批任務、提醒事項——全用大白話。不用畫流程圖，也不用串接任何系統。",
    how2Title: "我們為它開機",
    how2Body:
      "一台專屬虛擬機啟動，裝好 OpenClaw 或 Hermes，了解你的業務，接上你的渠道——只需幾分鐘。",
    how3Title: "隨時隨地管理",
    how3Body:
      "Telegram、WhatsApp、WeChat、LINE，或網頁控制台。派工、驗收、一鍵核准改進。",
    channelsLabel: "一名員工，通吃所有渠道",

    enginesEyebrow: "選擇你的引擎",
    enginesTitle: "兩種引擎，一支隊伍。",
    engCommunityKicker: "社群引擎",
    engCommunityBody:
      "開放的智能體執行環境。100+ 技能，涵蓋所有主流通訊渠道，外加每週都在壯大的龐大外掛生態。",
    engCommunityBest: "最適合 → 開發客戶、客服、\n重渠道職位",
    engPrecisionKicker: "精密引擎",
    engPrecisionBody:
      "為長週期工作打造的深度推理操盤手，配備嚴格的安全護欄、審批流程和完整的操作留痕。",
    engPrecisionBest: "最適合 → 法務、財務、\n研究、OPC 營運",
    engRecommendedKicker: "推薦",
    engRecommendedName: "自動配對",
    engRecommendedBody:
      "我們讀懂工作簡報，自動派上最合適的引擎。隨時切換——免遷移、零停機、記憶不丟。",
    engRecommendedBest: "最適合 → 其他所有人",

    learnEyebrow: "自我檢討",
    learnTitle: "每週都在進步的員工。",
    learnBody:
      "每一名 ArkAgent 都會定期自我檢討：哪些奏效、哪些沒有、下一步改什麼。學習的活它來做——核准與否你來定。",
    learnPoint1: "從你的回覆、評分和修正中形成回饋閉環",
    learnPoint2: "持久記住你的業務、語氣和規則",
    learnPoint3: "一個改進佇列，輕點一下即可核准",
    reviewHeader: "自我檢討 · 6 月 8 日當週",
    reviewReplyRate: "回覆率",
    reviewMeetings: "會議數",
    reviewLeadScore: "名單評分",
    reviewQuote:
      "「週二上午 10–11 點是物流 ICP 的最佳發送時段。以案例開場的轉換是一般介紹的兩倍。」",
    reviewLearnedFrom: "源自 142 次互動的總結",
    reviewQueued: "待核准的改動：把第 2 次跟進縮短到三行",
    reviewImpact: "預計帶來 +6% 回覆率",
    reviewApprove: "核准",
    reviewApproved: "✓ 已核准",

    pricingEyebrow: "價格",
    pricingTitleL1: "像發薪水一樣付費。",
    pricingTitleL2: "像軟體一樣擴張。",
    pricingSub:
      "按員工計費的月方案，含基礎點數。超出額度的部分按每 1,000 點數 2 美元計費。",
    perMonth: " /員工/月",
    startHiring: "開始招募",
    planAssociate: "助理級",
    planAssociateTag: "你的第一名員工",
    associateF1: "每月含 5,000 點數",
    associateF2: "1 個通訊渠道",
    associateF3: "每週自我檢討",
    associateF4: "OpenClaw 引擎",
    planProfessional: "專業級",
    planProfessionalTag: "真正的得力隊友",
    mostHired: "最多人雇用",
    professionalF1: "每月含 25,000 點數",
    professionalF2: "全渠道——從 Telegram 到 WeChat",
    professionalF3: "每日自我檢討 + 持久記憶",
    professionalF4: "兩種引擎 + 自動配對",
    professionalF5: "優先運算資源",
    planDirector: "總監級",
    planDirectorTag: "OPC 與重型職位",
    directorF1: "每月含 100,000 點數",
    directorF2: "專屬虛擬機資源",
    directorF3: "OPC 模式——一人身兼多職",
    directorF4: "稽核日誌與審批流程",
    directorF5: "專人貼身上手服務",
    pricingFoot: "年付折 20% · 每個席位 14 天試用 · 未用點數順延一個週期",

    footTagline: "讓每個人都用得起的自主員工。",
    footCopyright: "© 2026 ARKAGENT INC.",
    footProduct: "產品",
    footProductAgents: "智能員工",
    footProductEngines: "引擎",
    footProductPricing: "價格",
    footCompany: "公司",
    footAbout: "關於我們",
    footSecurity: "安全",
    footCareers: "人才招募",
    footRegions: "區域",
    footRegionGlobal: "— 全球",
    footRegionChina: "— 中國大陸",
    footDirections: "⌥ 設計風格",

    openMenu: "開啟選單",
  },

  ja: {
    eyebrow: "ツールではなく、AI社員を",
    heroT1: "AI社員を雇おう。",
    heroT2: "アプリではなく。",
    heroSub:
      "ArkAgentは24時間働く自律型の仲間を提供します。普通の言葉で指示するだけ、数分で稼働、毎週賢くなっていきます。",
    cta1: "最初の社員を雇う",
    cta2: "コンソールを見る",
    heroFoot: "クレジットカード不要 · 14日間無料 · 数分で稼働",

    cardRole: "セールス開拓担当",
    cardStatus: "稼働中",
    cardCredits: "今週の使用クレジット 2,180",

    rosterEyebrow: "ザ・ロスター",
    rosterTitle: "ずっと埋まらなかったポジションを、ぜんぶ。",
    rosterSub:
      "すぐ使える8つの職種——もちろん自分で定義してもOK。どの社員も職種専用のスキルを備え、初日からあなたのビジネスを学んでいきます。",
    rosterHire: "雇う →",

    howEyebrow: "仕組み",
    howTitleL1: "人に頼むように指示する。",
    howTitleL2: "ソフトのように展開する。",
    how1Title: "仕事を説明する",
    how1Body:
      "職種、指示、ルール、最初のタスク、リマインド。すべて普通の言葉で。フローチャートも連携作業もいりません。",
    how2Title: "マシンを起動します",
    how2Body:
      "OpenClawまたはHermesを搭載した専用VMが起動し、あなたのビジネスを把握してチャネルに接続——数分で完了します。",
    how3Title: "どこからでも管理",
    how3Body:
      "Telegram、WhatsApp、WeChat、LINE、またはWebコンソールから。タスクを割り当て、成果を確認し、改善を承認。",
    channelsLabel: "1人の社員が、すべてのチャネルに",

    enginesEyebrow: "エンジンを選ぶ",
    enginesTitle: "2つのエンジン、1つのチーム。",
    engCommunityKicker: "コミュニティエンジン",
    engCommunityBody:
      "オープンなエージェントランタイム。100以上のスキル、主要なメッセージチャネルすべて、そして毎週育つ巨大なプラグインエコシステム。",
    engCommunityBest: "最適 → 開拓・サポート・\nチャネル重視の職種",
    engPrecisionKicker: "プレシジョンエンジン",
    engPrecisionBody:
      "長期的な業務のために設計された深い推論の遂行役。厳格なガードレール、承認フロー、完全な監査ログを備えます。",
    engPrecisionBest: "最適 → 法務・財務・\nリサーチ・OPC業務",
    engRecommendedKicker: "おすすめ",
    engRecommendedName: "オートマッチ",
    engRecommendedBody:
      "業務内容を読み取り、最適なエンジンを自動で割り当てます。いつでも切り替え可——移行も停止もなし、記憶もそのまま。",
    engRecommendedBest: "最適 → それ以外のみなさん",

    learnEyebrow: "セルフレビュー",
    learnTitle: "毎週うまくなっていく社員。",
    learnBody:
      "すべてのArkAgentは定期的にセルフレビューを行います。何がうまくいき、何がダメで、次に何を変えるか。学習は社員が、承認はあなたが。",
    learnPoint1: "あなたの返信・評価・修正からのフィードバックループ",
    learnPoint2: "ビジネス・トーン・ルールを覚え続ける持続的な記憶",
    learnPoint3: "ワンタップで承認できる改善キュー",
    reviewHeader: "セルフレビュー · 6月8日の週",
    reviewReplyRate: "返信率",
    reviewMeetings: "商談数",
    reviewLeadScore: "リードスコア",
    reviewQuote:
      "「火曜午前10–11時が物流ICPへの最適な送信時間帯。事例で始めると、通常の紹介文の2倍の成果が出ています。」",
    reviewLearnedFrom: "142件のやり取りから学習",
    reviewQueued: "承認待ちの変更：フォローアップ#2を3行に短縮",
    reviewImpact: "想定効果 返信率 +6%",
    reviewApprove: "承認する",
    reviewApproved: "✓ 承認済み",

    pricingEyebrow: "料金",
    pricingTitleL1: "給与のように払う。",
    pricingTitleL2: "ソフトのように広げる。",
    pricingSub:
      "クレジット込みの社員ごとの月額プラン。上限を超えた利用は1,000クレジットあたり2ドルで従量課金されます。",
    perMonth: " /社員/月",
    startHiring: "雇用を始める",
    planAssociate: "アソシエイト",
    planAssociateTag: "はじめの一人",
    associateF1: "毎月5,000クレジット込み",
    associateF2: "メッセージチャネル1つ",
    associateF3: "週次セルフレビュー",
    associateF4: "OpenClawエンジン",
    planProfessional: "プロフェッショナル",
    planProfessionalTag: "頼れる本物の仲間",
    mostHired: "いちばん人気",
    professionalF1: "毎月25,000クレジット込み",
    professionalF2: "全チャネル——TelegramからWeChatまで",
    professionalF3: "日次セルフレビュー + 持続的な記憶",
    professionalF4: "両エンジン + オートマッチ",
    professionalF5: "優先コンピュート",
    planDirector: "ディレクター",
    planDirectorTag: "OPC・重量級の職種",
    directorF1: "毎月100,000クレジット込み",
    directorF2: "専用VMリソース",
    directorF3: "OPCモード——一人で何役も",
    directorF4: "監査ログと承認ワークフロー",
    directorF5: "手厚い導入サポート",
    pricingFoot: "年払いで−20% · 全席14日間無料 · 未使用クレジットは1サイクル繰り越し",

    footTagline: "すべての人に、自律型の社員を。",
    footCopyright: "© 2026 ARKAGENT INC.",
    footProduct: "プロダクト",
    footProductAgents: "エージェント",
    footProductEngines: "エンジン",
    footProductPricing: "料金",
    footCompany: "会社",
    footAbout: "私たちについて",
    footSecurity: "セキュリティ",
    footCareers: "採用情報",
    footRegions: "リージョン",
    footRegionGlobal: "— グローバル",
    footRegionChina: "— 中国本土",
    footDirections: "⌥ デザイン方向性",

    openMenu: "メニューを開く",
  },
};
