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
  /** Plain provider names for prose — the button labels above are decorated. */
  ssoNameGoogle: string;
  ssoNameWeChat: string;
  /** Joins the two names when neither provider has credentials. */
  ssoJoin: string;
  ssoNotConfigured: (providers: string) => string;

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

  // Password field toggle (aria-labels for <PasswordField>)
  showPassword: string;
  hidePassword: string;

  // Client-side validation / errors
  errEmailPassword: string;
  errName: string;
  errGeneric: string;

  /** One per `?sso_error=` code the OAuth callback can redirect back with. */
  ssoErrUnconfigured: string;
  ssoErrDenied: string;
  ssoErrState: string;
  ssoErrExpired: string;
  ssoErrEmailTaken: string;
  ssoErrAlreadyLinked: string;
  ssoErrSuspended: string;
  ssoErrProvider: string;
  ssoErrFailed: string;
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
  ssoNameGoogle: "Google",
  ssoNameWeChat: "WeChat",
  ssoJoin: " and ",
  ssoNotConfigured: (providers) =>
    `${providers} sign-in isn’t set up on this deployment yet — use your email and password below.`,

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

  showPassword: "Show password",
  hidePassword: "Hide password",

  errEmailPassword: "Please enter your email and password.",
  errName: "Please enter your name.",
  errGeneric: "Something went wrong. Please try again.",

  ssoErrUnconfigured:
    "That provider isn’t configured on this deployment yet — sign in with your email and password.",
  ssoErrDenied: "Sign-in was cancelled at the provider. Nothing has changed.",
  ssoErrState: "That sign-in link didn’t match this browser. Please start again.",
  ssoErrExpired: "That sign-in attempt took too long and expired. Please try again.",
  ssoErrEmailTaken:
    "An account already uses that email address. Sign in with your password, then link the provider from account settings.",
  ssoErrAlreadyLinked: "That provider account is already linked to a different ArkAgent user.",
  ssoErrSuspended: "This account is suspended. Contact support to restore access.",
  ssoErrProvider: "The provider couldn’t complete the sign-in. Please try again in a moment.",
  ssoErrFailed: "Sign-in failed. Please try again, or use your email and password.",
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
  ssoNameGoogle: "Google",
  ssoNameWeChat: "微信",
  ssoJoin: "、",
  ssoNotConfigured: (providers) =>
    `${providers}登录尚未在此环境中配置，请使用下方的邮箱和密码。`,

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

  showPassword: "显示密码",
  hidePassword: "隐藏密码",

  errEmailPassword: "请输入邮箱和密码。",
  errName: "请输入你的姓名。",
  errGeneric: "出了点问题，请重试。",

  ssoErrUnconfigured: "该登录方式尚未在此环境中配置，请使用邮箱和密码登录。",
  ssoErrDenied: "你在授权页面取消了登录，账户没有任何变更。",
  ssoErrState: "这个登录链接与当前浏览器不匹配，请重新发起登录。",
  ssoErrExpired: "本次登录等待过久已失效，请重新登录。",
  ssoErrEmailTaken:
    "该邮箱已注册。请先用密码登录，再到账户设置中绑定这个登录方式。",
  ssoErrAlreadyLinked: "该第三方账号已绑定到另一个 ArkAgent 账户。",
  ssoErrSuspended: "此账户已被停用，请联系客服恢复访问。",
  ssoErrProvider: "第三方服务未能完成登录，请稍后再试。",
  ssoErrFailed: "登录失败，请重试，或改用邮箱和密码登录。",
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
  ssoNameGoogle: "Google",
  ssoNameWeChat: "微信",
  ssoJoin: "、",
  ssoNotConfigured: (providers) =>
    `${providers}登入尚未在此環境中設定，請改用下方的電子郵件和密碼。`,

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

  showPassword: "顯示密碼",
  hidePassword: "隱藏密碼",

  errEmailPassword: "請輸入電子郵件和密碼。",
  errName: "請輸入你的姓名。",
  errGeneric: "發生了一些問題，請重試。",

  ssoErrUnconfigured: "此登入方式尚未在此環境中設定，請改用電子郵件和密碼登入。",
  ssoErrDenied: "你在授權頁面取消了登入，帳戶沒有任何變更。",
  ssoErrState: "這個登入連結與目前的瀏覽器不符，請重新發起登入。",
  ssoErrExpired: "本次登入等待過久已失效，請重新登入。",
  ssoErrEmailTaken:
    "這個電子郵件已註冊。請先以密碼登入，再到帳戶設定中綁定這個登入方式。",
  ssoErrAlreadyLinked: "這個第三方帳號已綁定到另一個 ArkAgent 帳戶。",
  ssoErrSuspended: "此帳戶已停用，請聯絡客服恢復存取權限。",
  ssoErrProvider: "第三方服務未能完成登入，請稍後再試。",
  ssoErrFailed: "登入失敗，請重試，或改用電子郵件和密碼登入。",
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
  ssoNameGoogle: "Google",
  ssoNameWeChat: "WeChat",
  ssoJoin: " と ",
  ssoNotConfigured: (providers) =>
    `${providers} でのログインはこの環境ではまだ設定されていません。下のメールアドレスとパスワードをご利用ください。`,

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

  showPassword: "パスワードを表示",
  hidePassword: "パスワードを非表示",

  errEmailPassword: "メールアドレスとパスワードを入力してください。",
  errName: "氏名を入力してください。",
  errGeneric: "問題が発生しました。もう一度お試しください。",

  ssoErrUnconfigured:
    "このログイン方法はこの環境ではまだ設定されていません。メールアドレスとパスワードでログインしてください。",
  ssoErrDenied: "認可画面でログインがキャンセルされました。アカウントに変更はありません。",
  ssoErrState: "このログインリンクは現在のブラウザーと一致しません。最初からやり直してください。",
  ssoErrExpired: "ログインの手続きに時間がかかり、有効期限が切れました。もう一度お試しください。",
  ssoErrEmailTaken:
    "このメールアドレスは既に登録されています。パスワードでログインしてから、アカウント設定で連携してください。",
  ssoErrAlreadyLinked: "この連携アカウントは既に別の ArkAgent ユーザーに紐づいています。",
  ssoErrSuspended: "このアカウントは停止されています。復旧についてはサポートにお問い合わせください。",
  ssoErrProvider: "プロバイダー側でログインを完了できませんでした。しばらくしてからお試しください。",
  ssoErrFailed:
    "ログインに失敗しました。もう一度お試しいただくか、メールアドレスとパスワードをご利用ください。",
};

export const auth: Record<Lang, AuthDict> = { en, zh, zht, ja };
