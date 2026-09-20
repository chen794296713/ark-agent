import type { Lang } from "@/lib/types";

const en = {
  agents: "Meet the agents", how: "How it works", pricing: "Pricing", signIn: "Sign in", account: "Your workspace", hire: "Hire an agent", menu: "Menu", close: "Close menu", language: "Language", currency: "Currency",
  heroTitle: "Good people for\nthe work. Only,\nthey’re agents.", heroBody: "Hire an AI coworker for the job you need done.\nBrief them in plain language and stay in control of their work.", heroCta: "Find your agent", heroNote: "Illustrated\nAI coworkers.",
  rosterTitle: "Who could you use on your team?", rosterBody: "Five familiar roles. Choose the work you want to hand over.", viewRole: "Meet this agent", responsibilities: "What they’ll take off your plate", customTitle: "A different job in mind?", customBody: "Describe the role in your own words. Build the brief around the way you work.", customCta: "Create your own agent",
  howTitle: "A proper brief. A better working relationship.", howBody: "Start with a clear job, then build a routine that works for you.", steps: [
    { title: "Choose the job", body: "Start with a role, or describe your own. Give your agent a name and a clear purpose." },
    { title: "Show them how you work", body: "Add your instructions, first tasks, and rules. Choose the tools and channels they’ll need." },
    { title: "Keep the conversation going", body: "Assign work, review results, and refine the brief from your workspace or a connected channel." }
  ],
  oversightTitle: "A helpful coworker.\nYou’re still in charge.", oversightBody: "Set the boundaries before work begins. Decide what your agent can do, what needs your approval, and when to check in.", oversightItems: ["Editable instructions and working rules", "Scheduled work and task history", "Connected channels for everyday check-ins"],
  pricingTitle: "Start with one good hire.", pricingBody: "Monthly plans for each agent, with credits included. Choose your plan when you’re ready to launch.", perMonth: "/ agent / month", from: "From", monthlyCredits: "monthly credits", plans: ["For a focused, everyday role.", "For a broader set of responsibilities.", "For demanding, ongoing work."], compareNote: "Tool and channel availability depends on your runtime and connections.", usageNote: "Additional usage:", perCredits: "per 1,000 credits.",
  faqTitle: "Before you make the hire.", faqs: [
    { q: "Are these real people?", a: "They’re AI agents, represented by original illustrations. Each one starts with an editable role brief. You decide the responsibilities, instructions, and boundaries." },
    { q: "Can an agent keep working while I’m away?", a: "Agents run on a dedicated runtime and can take on scheduled work. What runs depends on your configuration, connected tools, and service availability. You can review work in your workspace." },
    { q: "Will an agent send messages or apply for jobs for me?", a: "The featured briefs require your approval before outreach, email sending, or application submission. Review the instructions and connect the necessary tools before assigning that work." },
    { q: "Can the Video Creator render a finished video?", a: "The starting brief covers ideas, scripts, storyboards, and production plans. Rendering or publishing requires compatible tools that you connect and authorize." }
  ],
  closingTitle: "Make space for your best work.", closingBody: "Start with the job you’d be glad to hand over.", footerLine: "Good work starts with a clear brief.", allAgents: "All agents", roleBrief: "Your starting brief", roleIntro: "Make this role your own. Everything below is a starting point you can edit before hiring.", outputs: "What you’ll get back", tools: "Tools & working boundaries", sample: "Example handoff", sampleNote: "Illustrative example, not live agent activity.", hireRole: "Hire this agent", editBrief: "Review and edit the brief", included: "A role brief, ready to make your own.", related: "A few more good coworkers.", portraitNote: "Illustrations of AI coworkers.", seePricing: "See plans", skip: "Skip to content", noResults: "No roles match that search.", search: "Find work to hand over", clear: "Clear search"
};
export type MarketingCopy = typeof en;

const zh: MarketingCopy = {
  agents:"认识智能体",how:"如何开始",pricing:"价格",signIn:"登录",account:"工作台",hire:"雇用智能体",menu:"菜单",close:"关闭菜单",language:"语言",currency:"币种",
  heroTitle:"工作有了好搭档。\n这次，是 AI 同事。",heroBody:"把重复而琐碎的工作，交给你的 AI 同事。明确职责，定好规则，把时间留给真正需要你的事。",heroCta:"找到你的下一位同事",heroNote:"用插画认识\n你的 AI 同事。",
  rosterTitle:"你的团队，还缺哪位帮手？",rosterBody:"五种熟悉的岗位，从你想交出去的工作开始。",viewRole:"了解这位智能体",responsibilities:"可以交给它的工作",customTitle:"想雇用其他岗位？",customBody:"用自己的话描述工作，让智能体适应你的做事方式。",customCta:"创建专属智能体",
  howTitle:"交代清楚，才能合作得好。",howBody:"先说清楚要做什么，再一起建立合适的工作节奏。",steps:[{title:"确定岗位",body:"选择现有岗位，或定义自己的角色。起个名字，交代它为什么而工作。"},{title:"说明你的工作方式",body:"补充工作指令、首批任务和边界，选择需要的工具与沟通渠道。"},{title:"保持沟通",body:"在工作台或已连接的渠道中安排任务、检查结果，持续完善工作要求。"}],
  oversightTitle:"得力的同事，\n决定权仍在你。",oversightBody:"开始前先定好边界：哪些事可以直接做，哪些要先征求你的同意，以及何时汇报。",oversightItems:["可随时编辑的工作指令与规则","定时任务和工作记录","连接常用渠道，随时沟通"],
  pricingTitle:"从雇用一位好帮手开始。",pricingBody:"每位智能体按月订阅，包含相应积分。准备启动时再选择合适的方案。",perMonth:"/ 位 / 月",from:"起价",monthlyCredits:"每月积分",plans:["适合职责明确的日常岗位。","适合承担更多工作职责。","适合任务较重的持续工作。"],compareNote:"可用工具和渠道取决于所选运行环境与连接配置。",usageNote:"超额用量：",perCredits:"每 1,000 积分。",
  faqTitle:"雇用前，你可能想了解。",faqs:[{q:"这些是真人吗？",a:"它们是 AI 智能体，页面中的人物是原创插画。每个岗位都有可编辑的工作说明，具体职责、指令和边界由你决定。"},{q:"我不在线时，它能继续工作吗？",a:"智能体运行在独立环境中，可以执行定时工作。实际执行取决于你的配置、连接的工具和服务可用性。你可以在工作台查看记录。"},{q:"它会直接发邮件或投递简历吗？",a:"这些初始岗位说明要求在联系他人、发送邮件或投递申请前获得你的同意。安排工作前，请检查指令并连接所需工具。"},{q:"视频创作智能体能直接生成成片吗？",a:"初始工作范围包括选题、脚本、分镜和制作计划。渲染成片或发布内容需要连接并授权兼容的工具。"}],
  closingTitle:"把时间留给你最擅长的事。",closingBody:"从一件你想交出去的工作开始。",footerLine:"好工作，从清楚的交代开始。",allAgents:"全部智能体",roleBrief:"初始工作说明",roleIntro:"下面是一份起点。雇用前，你可以根据实际需要修改每项要求。",outputs:"你会收到什么",tools:"工具与工作边界",sample:"交付示例",sampleNote:"仅供说明，并非实时工作记录。",hireRole:"雇用这位智能体",editBrief:"检查并编辑工作说明",included:"一份可以按需修改的岗位说明。",related:"还有这些好帮手。",portraitNote:"AI 同事的原创人物插画。",seePricing:"查看方案",skip:"跳到正文",noResults:"没有找到匹配的岗位。",search:"搜索你想交出去的工作",clear:"清除搜索"
};
const zht: MarketingCopy = {
  agents:"認識智慧體",how:"如何開始",pricing:"價格",signIn:"登入",account:"工作台",hire:"僱用智慧體",menu:"選單",close:"關閉選單",language:"語言",currency:"幣別",
  heroTitle:"工作有了好搭檔。\n這次，是 AI 同事。",heroBody:"把重複瑣碎的工作交給你的 AI 同事。明確職責，訂好規則，把時間留給真正需要你的事。",heroCta:"找到你的下一位同事",heroNote:"用插畫認識\n你的 AI 同事。",
  rosterTitle:"你的團隊，還缺哪位幫手？",rosterBody:"五種熟悉的職務，從你想交出去的工作開始。",viewRole:"認識這位智慧體",responsibilities:"可以交給它的工作",customTitle:"想僱用其他職務？",customBody:"用自己的話描述工作，讓智慧體配合你的做事方式。",customCta:"建立專屬智慧體",
  howTitle:"交代清楚，才能合作得好。",howBody:"先說清楚要做什麼，再建立適合你的工作節奏。",steps:[{title:"確定職務",body:"選擇現有職務，或定義自己的角色。取個名字，說明它的工作目的。"},{title:"說明你的工作方式",body:"補充工作指示、第一批任務和規則，選擇需要的工具與溝通管道。"},{title:"保持聯繫",body:"在工作台或已連接的管道中安排任務、檢查成果，持續完善工作要求。"}],
  oversightTitle:"得力的同事，\n決定權仍在你。",oversightBody:"開始前先訂好界線：哪些事能直接做，哪些需要你的同意，以及何時回報。",oversightItems:["可隨時編輯的工作指示與規則","排程任務與工作紀錄","連接常用管道，隨時溝通"],
  pricingTitle:"從僱用一位好幫手開始。",pricingBody:"每位智慧體按月訂閱，包含相應點數。準備啟動時再選擇合適的方案。",perMonth:"/ 位 / 月",from:"起價",monthlyCredits:"每月點數",plans:["適合職責明確的日常工作。","適合承擔更多工作職責。","適合任務較重的持續工作。"],compareNote:"可用工具與管道取決於執行環境和連接設定。",usageNote:"超額用量：",perCredits:"每 1,000 點。",
  faqTitle:"僱用前，你可能想了解。",faqs:[{q:"這些是真人嗎？",a:"它們是 AI 智慧體，頁面上的人物是原創插畫。每個職務都有可編輯的工作說明，具體職責、指示和界線由你決定。"},{q:"我不在線上時，它能繼續工作嗎？",a:"智慧體在獨立環境中執行，可以處理排程工作。實際執行取決於設定、連接的工具和服務可用性。你可以在工作台查看紀錄。"},{q:"它會直接寄信或投遞履歷嗎？",a:"這些初始工作說明要求在聯繫他人、寄送郵件或提交申請前取得你的同意。安排工作前，請確認指示並連接所需工具。"},{q:"影片創作智慧體能直接產出完整影片嗎？",a:"初始工作範圍包括發想、腳本、分鏡和製作計畫。影片算圖或發布內容需要連接並授權相容的工具。"}],
  closingTitle:"把時間留給你最擅長的事。",closingBody:"從一件你想交出去的工作開始。",footerLine:"好工作，從清楚的交代開始。",allAgents:"全部智慧體",roleBrief:"初始工作說明",roleIntro:"以下是一份起點。僱用前，你可以依實際需要修改各項要求。",outputs:"你會收到什麼",tools:"工具與工作界線",sample:"交付範例",sampleNote:"僅供說明，並非即時工作紀錄。",hireRole:"僱用這位智慧體",editBrief:"檢查並編輯工作說明",included:"一份可依需求調整的工作說明。",related:"還有這些好幫手。",portraitNote:"AI 同事的原創人物插畫。",seePricing:"查看方案",skip:"跳到正文",noResults:"找不到符合的職務。",search:"搜尋你想交出去的工作",clear:"清除搜尋"
};
const ja: MarketingCopy = {
  agents:"エージェントを探す",how:"はじめ方",pricing:"料金",signIn:"ログイン",account:"ワークスペース",hire:"エージェントを迎える",menu:"メニュー",close:"メニューを閉じる",language:"言語",currency:"通貨",
  heroTitle:"頼れる仕事仲間。\n今度は、AI です。",heroBody:"繰り返し届く仕事を、AI の同僚に。役割とルールを伝えて、あなたの時間を取り戻しましょう。",heroCta:"次の仲間を見つける",heroNote:"AI の同僚を、\nイラストで。",
  rosterTitle:"チームに、どんな仲間が必要ですか。",rosterBody:"身近な5つの役割から、任せたい仕事を選んでください。",viewRole:"このエージェントを見る",responsibilities:"任せられる仕事",customTitle:"ほかの仕事を任せたいですか。",customBody:"必要な役割を、あなたの言葉で。仕事の進め方に合わせて指示を作れます。",customCta:"自分だけのエージェントを作る",
  howTitle:"よい仕事は、よい引き継ぎから。",howBody:"役割をはっきりさせて、無理のない仕事のリズムを作りましょう。",steps:[{title:"役割を決める",body:"用意された役割を選ぶか、独自の役割を定義します。名前を付けて、目的を伝えましょう。"},{title:"仕事の進め方を伝える",body:"指示、最初のタスク、守るべきルールを設定。必要なツールと連絡手段を選びます。"},{title:"会話を続ける",body:"ワークスペースや接続済みのチャネルから仕事を依頼し、結果を確認しながら指示を調整します。"}],
  oversightTitle:"頼れる同僚。\n判断は、あなたに。",oversightBody:"仕事を始める前に、できることと承認が必要なこと、報告のタイミングを決めておきましょう。",oversightItems:["編集できる指示とルール","定期実行とタスクの履歴","いつものチャネルで連絡"],
  pricingTitle:"まずは、一人の頼れる仲間から。",pricingBody:"エージェントごとの月額プランにクレジットが含まれます。開始する際にプランを選べます。",perMonth:"/ エージェント / 月",from:"月額",monthlyCredits:"月間クレジット",plans:["役割が明確な日々の仕事に。","より幅広い業務を任せたい方に。","負荷の高い継続的な仕事に。"],compareNote:"使えるツールとチャネルは、実行環境と接続設定により異なります。",usageNote:"追加利用料金：",perCredits:"/ 1,000クレジット。",
  faqTitle:"迎える前に、知っておきたいこと。",faqs:[{q:"実在する人ですか。",a:"AI エージェントです。人物はオリジナルのイラストで表現しています。各役割の指示は編集でき、責任の範囲やルールはあなたが決めます。"},{q:"離席中も仕事を続けられますか。",a:"専用の実行環境で、定期的な仕事を設定できます。実際の実行は、設定、接続ツール、サービスの稼働状況によります。結果はワークスペースで確認できます。"},{q:"メール送信や求人への応募も任せられますか。",a:"初期の役割設定では、連絡、メール送信、応募の前にあなたの承認を求めます。指示を確認し、必要なツールを接続してから依頼してください。"},{q:"動画制作エージェントは完成動画を作れますか。",a:"初期設定で扱うのは企画、台本、絵コンテ、制作計画です。動画のレンダリングや公開には、対応ツールの接続と許可が必要です。"}],
  closingTitle:"あなたらしい仕事のために。",closingBody:"まずは、任せたい仕事を一つ選びましょう。",footerLine:"よい仕事は、明確な指示から。",allAgents:"すべてのエージェント",roleBrief:"最初の業務指示",roleIntro:"ここにあるのは出発点です。迎える前に、あなたの仕事に合わせて編集できます。",outputs:"受け取れる成果物",tools:"ツールと業務の範囲",sample:"納品のイメージ",sampleNote:"説明用の例です。実際の活動記録ではありません。",hireRole:"このエージェントを迎える",editBrief:"指示を確認・編集する",included:"あなたの仕事に合わせて編集できる業務指示。",related:"ほかにも、頼れる仲間たち。",portraitNote:"AI の同僚を描いたイラスト。",seePricing:"プランを見る",skip:"本文へ移動",noResults:"条件に合う役割が見つかりません。",search:"任せたい仕事を探す",clear:"検索をクリア"
};
export const marketing: Record<Lang, MarketingCopy> = { en, zh, zht, ja };
