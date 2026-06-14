/** Copy for the sign in / register / password-reset page. */
import type { Lang } from "@/lib/types";

export interface AuthDict {
  // Hero (left panel)
  heroEyebrow: string;
  heroHeadline: string;
  feed0930: string;
  feed0921: string;
  feed0830: string;
  feedTime0941: string;
  feedTime0921: string;
  feedTime0830: string;
  regions: string;

  // Titles & subtitles per mode
  loginTitle: string;
  loginSub: string;
  signupTitle: string;
  signupSub: string;
  forgotTitle: string;
  forgotSub: string;

  // Reset confirmation
  resetSentTitle: string;
  resetSentBody: (email: string) => string;
  inboxFallback: string;

  // SSO
  ssoGoogle: string;
  ssoWeChat: string;
  orDivider: string;

  // Field labels
  labelName: string;
  labelEmail: string;
  labelPassword: string;

  // Placeholders
  placeholderName: string;
  placeholderEmail: string;
  placeholderPassword: string;

  // Buttons
  btnSignIn: string;
  btnCreateAccount: string;
  btnResendLink: string;
  btnSendResetLink: string;
  btnPleaseWait: string;

  // Footer links / legal
  forgotPassword: string;
  newHere: string;
  termsNotice: string;
  haveAccount: string;
  backToSignIn: string;

  // Client-side validation / errors
  errEmailPassword: string;
  errName: string;
  errGeneric: string;
  errSsoSoon: string;
}

const en: AuthDict = {
  heroEyebrow: "YOUR WORKFORCE IS WAITING",
  heroHeadline: "While you were away, your agents kept working.",
  feed0930: "Nova booked an intro call with Meridian Logistics",
  feed0921: "Atlas escalated a refund for your approval",
  feed0830: "Juno submitted 2 drafts for review",
  feedTime0941: "09:41",
  feedTime0921: "09:21",
  feedTime0830: "08:30",
  regions: "ARKAGENT.AI — GLOBAL · IAGENT.CC — 中国大陆",

  loginTitle: "Welcome back",
  loginSub: "Sign in to manage your workforce.",
  signupTitle: "Create your workspace",
  signupSub: "Your first agent can be live in four minutes.",
  forgotTitle: "Reset your password",
  forgotSub: "Enter your email and we’ll send a secure reset link.",

  resetSentTitle: "Reset link sent",
  resetSentBody: (email) =>
    `Check ${email} — the link expires in 30 minutes. No email? Check spam or resend below.`,
  inboxFallback: "your inbox",

  ssoGoogle: "G · Google",
  ssoWeChat: "微信 WeChat",
  orDivider: "OR",

  labelName: "FULL NAME",
  labelEmail: "WORK EMAIL",
  labelPassword: "PASSWORD",

  placeholderName: "Wei Zhang",
  placeholderEmail: "wei@company.com",
  placeholderPassword: "••••••••••",

  btnSignIn: "Sign in →",
  btnCreateAccount: "Create account →",
  btnResendLink: "Resend link",
  btnSendResetLink: "Send reset link",
  btnPleaseWait: "Please wait…",

  forgotPassword: "Forgot password?",
  newHere: "New here? Create account",
  termsNotice: "By signing up you agree to the Terms.",
  haveAccount: "Have an account? Sign in",
  backToSignIn: "← Back to sign in",

  errEmailPassword: "Please enter your email and password.",
  errName: "Please enter your name.",
  errGeneric: "Something went wrong. Please try again.",
  errSsoSoon: "Social sign-in is coming soon — please use email.",
};

const zh: AuthDict = {
  heroEyebrow: "你的智能员工已就绪",
  heroHeadline: "你离开的这段时间，你的智能体一直在工作。",
  feed0930: "Nova 已与 Meridian Logistics 预约了首次通话",
  feed0921: "Atlas 提交了一笔退款，等待你审批",
  feed0830: "Juno 提交了 2 份草稿待审阅",
  feedTime0941: "09:41",
  feedTime0921: "09:21",
  feedTime0830: "08:30",
  regions: "ARKAGENT.AI — 全球 · IAGENT.CC — 中国大陆",

  loginTitle: "欢迎回来",
  loginSub: "登录以管理你的智能员工。",
  signupTitle: "创建你的工作区",
  signupSub: "四分钟即可让你的第一个智能体上线。",
  forgotTitle: "重置密码",
  forgotSub: "输入你的邮箱，我们将发送安全的重置链接。",

  resetSentTitle: "重置链接已发送",
  resetSentBody: (email) =>
    `请查收 ${email} —— 链接将在 30 分钟后失效。没收到？请检查垃圾邮件或在下方重新发送。`,
  inboxFallback: "你的邮箱",

  ssoGoogle: "G · Google",
  ssoWeChat: "微信登录",
  orDivider: "或",

  labelName: "姓名",
  labelEmail: "工作邮箱",
  labelPassword: "密码",

  placeholderName: "张伟",
  placeholderEmail: "wei@company.com",
  placeholderPassword: "••••••••••",

  btnSignIn: "登录 →",
  btnCreateAccount: "创建账户 →",
  btnResendLink: "重新发送链接",
  btnSendResetLink: "发送重置链接",
  btnPleaseWait: "请稍候…",

  forgotPassword: "忘记密码？",
  newHere: "还没有账户？立即创建",
  termsNotice: "注册即表示你同意相关条款。",
  haveAccount: "已有账户？立即登录",
  backToSignIn: "← 返回登录",

  errEmailPassword: "请输入邮箱和密码。",
  errName: "请输入你的姓名。",
  errGeneric: "出了点问题，请重试。",
  errSsoSoon: "第三方登录即将上线，请先使用邮箱登录。",
};

const zht: AuthDict = {
  heroEyebrow: "你的智能員工已就緒",
  heroHeadline: "你離開的這段時間，你的智能體一直在工作。",
  feed0930: "Nova 已與 Meridian Logistics 預約了首次通話",
  feed0921: "Atlas 提交了一筆退款，等待你審批",
  feed0830: "Juno 提交了 2 份草稿待審閱",
  feedTime0941: "09:41",
  feedTime0921: "09:21",
  feedTime0830: "08:30",
  regions: "ARKAGENT.AI — 全球 · IAGENT.CC — 中國大陸",

  loginTitle: "歡迎回來",
  loginSub: "登入以管理你的智能員工。",
  signupTitle: "建立你的工作區",
  signupSub: "四分鐘即可讓你的第一個智能體上線。",
  forgotTitle: "重設密碼",
  forgotSub: "輸入你的電子郵件，我們將寄出安全的重設連結。",

  resetSentTitle: "重設連結已寄出",
  resetSentBody: (email) =>
    `請查收 ${email} —— 連結將在 30 分鐘後失效。沒收到？請檢查垃圾郵件或在下方重新寄送。`,
  inboxFallback: "你的信箱",

  ssoGoogle: "G · Google",
  ssoWeChat: "微信登入",
  orDivider: "或",

  labelName: "姓名",
  labelEmail: "工作電子郵件",
  labelPassword: "密碼",

  placeholderName: "張偉",
  placeholderEmail: "wei@company.com",
  placeholderPassword: "••••••••••",

  btnSignIn: "登入 →",
  btnCreateAccount: "建立帳戶 →",
  btnResendLink: "重新寄送連結",
  btnSendResetLink: "寄送重設連結",
  btnPleaseWait: "請稍候…",

  forgotPassword: "忘記密碼？",
  newHere: "還沒有帳戶？立即建立",
  termsNotice: "註冊即表示你同意相關條款。",
  haveAccount: "已有帳戶？立即登入",
  backToSignIn: "← 返回登入",

  errEmailPassword: "請輸入電子郵件和密碼。",
  errName: "請輸入你的姓名。",
  errGeneric: "發生了一些問題，請重試。",
  errSsoSoon: "第三方登入即將推出，請先使用電子郵件登入。",
};

const ja: AuthDict = {
  heroEyebrow: "あなたの戦力が待機中です",
  heroHeadline: "あなたが離れている間も、エージェントは働き続けていました。",
  feed0930: "Nova が Meridian Logistics との初回通話を予約しました",
  feed0921: "Atlas が返金をエスカレーションし、承認を待っています",
  feed0830: "Juno が 2 件の下書きをレビュー用に提出しました",
  feedTime0941: "09:41",
  feedTime0921: "09:21",
  feedTime0830: "08:30",
  regions: "ARKAGENT.AI — グローバル · IAGENT.CC — 中国本土",

  loginTitle: "おかえりなさい",
  loginSub: "ログインして戦力を管理しましょう。",
  signupTitle: "ワークスペースを作成",
  signupSub: "最初のエージェントは4分で稼働できます。",
  forgotTitle: "パスワードをリセット",
  forgotSub: "メールアドレスを入力すると、安全なリセットリンクをお送りします。",

  resetSentTitle: "リセットリンクを送信しました",
  resetSentBody: (email) =>
    `${email} をご確認ください。リンクは30分で失効します。届かない場合は迷惑メールをご確認いただくか、下から再送信してください。`,
  inboxFallback: "受信トレイ",

  ssoGoogle: "G · Google",
  ssoWeChat: "微信 WeChat",
  orDivider: "または",

  labelName: "氏名",
  labelEmail: "仕事用メールアドレス",
  labelPassword: "パスワード",

  placeholderName: "山田 太郎",
  placeholderEmail: "wei@company.com",
  placeholderPassword: "••••••••••",

  btnSignIn: "ログイン →",
  btnCreateAccount: "アカウントを作成 →",
  btnResendLink: "リンクを再送信",
  btnSendResetLink: "リセットリンクを送信",
  btnPleaseWait: "お待ちください…",

  forgotPassword: "パスワードをお忘れですか？",
  newHere: "はじめての方はこちら",
  termsNotice: "登録すると利用規約に同意したものとみなされます。",
  haveAccount: "アカウントをお持ちですか？ログイン",
  backToSignIn: "← ログインに戻る",

  errEmailPassword: "メールアドレスとパスワードを入力してください。",
  errName: "氏名を入力してください。",
  errGeneric: "問題が発生しました。もう一度お試しください。",
  errSsoSoon: "ソーシャルログインは近日公開予定です。メールをご利用ください。",
};

export const auth: Record<Lang, AuthDict> = { en, zh, zht, ja };
