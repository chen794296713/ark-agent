import type { Lang } from "@/lib/types";

export interface AccountDict {
  eyebrow: string;
  heading: string;
  subheading: string;
  profileTitle: string;
  profileDescription: string;
  nameLabel: string;
  emailLabel: string;
  emailHint: string;
  saveProfile: string;
  saving: string;
  profileSaved: string;
  profileError: string;
  passwordTitle: string;
  passwordDescription: string;
  /** The same panel, worded for an SSO-only account that has no password yet. */
  setPasswordTitle: string;
  setPasswordHint: string;
  setPassword: string;
  passwordSet: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  changePassword: string;
  passwordChanged: string;
  passwordError: string;
  currentPasswordIncorrect: string;
  passwordTooShort: string;
  passwordSame: string;
  passwordMismatch: string;
  /** "Connected accounts" — the Google/WeChat linking panel. */
  connectionsTitle: string;
  connectionsHint: string;
  providerGoogle: string;
  providerWechat: string;
  connectionsLoading: string;
  /** Nothing linked and no provider configured on this deployment. */
  connectionsEmpty: string;
  connectionsError: string;
  notConnected: string;
  lastSignIn: (when: string) => string;
  neverSignedIn: string;
  connect: string;
  connecting: string;
  disconnect: string;
  disconnecting: string;
  /** Sits under the disabled Disconnect on a provider-only account. */
  lastWayInNote: string;
  connectedOk: (provider: string) => string;
  disconnectedOk: (provider: string) => string;
  disconnectError: string;
  /** The server refused the unlink because it was the last way in. */
  disconnectRefused: string;
  linkCancelled: string;
  linkExpired: string;
  linkAlreadyLinked: string;
  linkFailed: string;
  signOutTitle: string;
  signOutDescription: string;
  signOut: string;
  signingOut: string;
  signOutError: string;
}

export const account: Record<Lang, AccountDict> = {
  en: {
    eyebrow: "ACCOUNT SETTINGS",
    heading: "Personal center",
    subheading: "Manage your profile, password, and active session.",
    profileTitle: "Personal information",
    profileDescription: "Update the name shown across your workspace.",
    nameLabel: "Display name",
    emailLabel: "Email",
    emailHint: "Your sign-in email cannot be changed here.",
    saveProfile: "Save changes",
    saving: "Saving...",
    profileSaved: "Personal information updated.",
    profileError: "Could not update your personal information.",
    passwordTitle: "Change password",
    passwordDescription: "Use at least 8 characters and choose a password you do not use elsewhere.",
    setPasswordTitle: "Set a password",
    setPasswordHint:
      "You sign in with Google or WeChat. Add a password to sign in with your email as well.",
    setPassword: "Set password",
    passwordSet: "Password set. All other devices have been signed out.",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    changePassword: "Change password",
    passwordChanged: "Password changed. All other devices have been signed out.",
    passwordError: "Could not change your password.",
    currentPasswordIncorrect: "The current password is incorrect.",
    passwordTooShort: "The new password must be at least 8 characters.",
    passwordSame: "The new password must be different from the current password.",
    passwordMismatch: "The new passwords do not match.",
    connectionsTitle: "Connected accounts",
    connectionsHint:
      "Sign in with Google or WeChat as well as your email. You can disconnect a provider at any time, as long as one way in is left.",
    providerGoogle: "Google",
    providerWechat: "WeChat",
    connectionsLoading: "Loading connected accounts...",
    connectionsEmpty: "No sign-in providers are available on this deployment.",
    connectionsError: "Could not load your connected accounts.",
    notConnected: "Not connected",
    lastSignIn: (when) => `Last used ${when}`,
    neverSignedIn: "Never used to sign in",
    connect: "Connect",
    connecting: "Opening...",
    disconnect: "Disconnect",
    disconnecting: "Disconnecting...",
    lastWayInNote:
      "This is your only way to sign in. Set a password above, then you can disconnect it.",
    connectedOk: (provider) => `${provider} is now connected to your account.`,
    disconnectedOk: (provider) => `${provider} has been disconnected.`,
    disconnectError: "Could not disconnect that account. Please try again.",
    disconnectRefused:
      "That is the only way you can sign in. Set a password first, then disconnect it.",
    linkCancelled: "Connecting was cancelled at the provider. Nothing has changed.",
    linkExpired: "That attempt took too long and expired. Please try again.",
    linkAlreadyLinked: "That provider account is already linked to a different ArkAgent user.",
    linkFailed: "Could not connect that provider. Please try again.",
    signOutTitle: "Sign out",
    signOutDescription: "End your session on this device.",
    signOut: "Sign out",
    signingOut: "Signing out...",
    signOutError: "Could not sign out. Please try again.",
  },
  zh: {
    eyebrow: "账户设置",
    heading: "个人中心",
    subheading: "管理个人信息、登录密码和当前会话。",
    profileTitle: "个人信息",
    profileDescription: "修改在工作区内显示的姓名。",
    nameLabel: "显示姓名",
    emailLabel: "邮箱",
    emailHint: "登录邮箱暂不支持在此修改。",
    saveProfile: "保存修改",
    saving: "保存中...",
    profileSaved: "个人信息已更新。",
    profileError: "个人信息更新失败，请重试。",
    passwordTitle: "修改密码",
    passwordDescription: "密码至少 8 位，且请勿与其他网站共用。",
    setPasswordTitle: "设置密码",
    setPasswordHint: "你目前通过 Google 或微信登录。设置密码后，也可以用邮箱登录。",
    setPassword: "设置密码",
    passwordSet: "密码设置成功，其他设备均已退出登录。",
    currentPassword: "当前密码",
    newPassword: "新密码",
    confirmPassword: "确认新密码",
    changePassword: "修改密码",
    passwordChanged: "密码修改成功，其他设备均已退出登录。",
    passwordError: "密码修改失败，请重试。",
    currentPasswordIncorrect: "当前密码不正确。",
    passwordTooShort: "新密码至少需要 8 个字符。",
    passwordSame: "新密码不能与当前密码相同。",
    passwordMismatch: "两次输入的新密码不一致。",
    connectionsTitle: "已关联的登录方式",
    connectionsHint:
      "除邮箱密码外，你还可以用 Google 或微信登录。只要至少保留一种登录方式，随时可以解除关联。",
    providerGoogle: "Google",
    providerWechat: "微信",
    connectionsLoading: "正在加载关联信息...",
    connectionsEmpty: "当前环境未开放任何第三方登录方式。",
    connectionsError: "关联信息加载失败。",
    notConnected: "未关联",
    lastSignIn: (when) => `最近使用：${when}`,
    neverSignedIn: "尚未用于登录",
    connect: "去关联",
    connecting: "正在跳转...",
    disconnect: "解除关联",
    disconnecting: "解除中...",
    lastWayInNote: "这是你目前唯一的登录方式。请先在上方设置密码，之后才能解除关联。",
    connectedOk: (provider) => `已成功关联 ${provider}。`,
    disconnectedOk: (provider) => `已解除与 ${provider} 的关联。`,
    disconnectError: "解除关联失败，请重试。",
    disconnectRefused: "这是你唯一的登录方式，请先设置密码，再解除关联。",
    linkCancelled: "你在授权页面取消了关联，账户没有任何变更。",
    linkExpired: "本次操作超时已失效，请重新尝试。",
    linkAlreadyLinked: "该第三方账号已关联到其他 ArkAgent 用户。",
    linkFailed: "关联失败，请稍后重试。",
    signOutTitle: "退出登录",
    signOutDescription: "结束此设备上的当前登录会话。",
    signOut: "退出登录",
    signingOut: "正在退出...",
    signOutError: "退出失败，请重试。",
  },
  zht: {
    eyebrow: "帳戶設定",
    heading: "個人中心",
    subheading: "管理個人資料、登入密碼和目前工作階段。",
    profileTitle: "個人資料",
    profileDescription: "修改在工作區內顯示的姓名。",
    nameLabel: "顯示姓名",
    emailLabel: "電子郵件",
    emailHint: "登入郵件目前不支援在此修改。",
    saveProfile: "儲存修改",
    saving: "儲存中...",
    profileSaved: "個人資料已更新。",
    profileError: "個人資料更新失敗，請重試。",
    passwordTitle: "修改密碼",
    passwordDescription: "密碼至少 8 位，且請勿與其他網站共用。",
    setPasswordTitle: "設定密碼",
    setPasswordHint: "你目前透過 Google 或微信登入。設定密碼後，也可以使用電子郵件登入。",
    setPassword: "設定密碼",
    passwordSet: "密碼設定成功，其他裝置皆已登出。",
    currentPassword: "目前密碼",
    newPassword: "新密碼",
    confirmPassword: "確認新密碼",
    changePassword: "修改密碼",
    passwordChanged: "密碼修改成功，其他裝置皆已登出。",
    passwordError: "密碼修改失敗，請重試。",
    currentPasswordIncorrect: "目前密碼不正確。",
    passwordTooShort: "新密碼至少需要 8 個字元。",
    passwordSame: "新密碼不能與目前密碼相同。",
    passwordMismatch: "兩次輸入的新密碼不一致。",
    connectionsTitle: "已綁定的登入方式",
    connectionsHint:
      "除了電子郵件與密碼，你也可以使用 Google 或微信登入。只要至少保留一種登入方式，隨時都能解除綁定。",
    providerGoogle: "Google",
    providerWechat: "微信",
    connectionsLoading: "正在載入綁定資訊...",
    connectionsEmpty: "目前環境未開放任何第三方登入方式。",
    connectionsError: "綁定資訊載入失敗。",
    notConnected: "尚未綁定",
    lastSignIn: (when) => `最近使用：${when}`,
    neverSignedIn: "尚未用於登入",
    connect: "前往綁定",
    connecting: "正在前往...",
    disconnect: "解除綁定",
    disconnecting: "解除中...",
    lastWayInNote: "這是你目前唯一的登入方式。請先在上方設定密碼，之後才能解除綁定。",
    connectedOk: (provider) => `已成功綁定 ${provider}。`,
    disconnectedOk: (provider) => `已解除與 ${provider} 的綁定。`,
    disconnectError: "解除綁定失敗，請重試。",
    disconnectRefused: "這是你唯一的登入方式，請先設定密碼，再解除綁定。",
    linkCancelled: "你在授權頁面取消了綁定，帳戶沒有任何變更。",
    linkExpired: "本次操作逾時失效，請重新嘗試。",
    linkAlreadyLinked: "該第三方帳號已綁定到其他 ArkAgent 使用者。",
    linkFailed: "綁定失敗，請稍後再試。",
    signOutTitle: "登出",
    signOutDescription: "結束此裝置上的目前登入工作階段。",
    signOut: "登出",
    signingOut: "正在登出...",
    signOutError: "登出失敗，請重試。",
  },
  ja: {
    eyebrow: "アカウント設定",
    heading: "マイページ",
    subheading: "プロフィール、パスワード、現在のセッションを管理します。",
    profileTitle: "個人情報",
    profileDescription: "ワークスペースに表示される名前を変更します。",
    nameLabel: "表示名",
    emailLabel: "メールアドレス",
    emailHint: "ログイン用メールアドレスはここでは変更できません。",
    saveProfile: "変更を保存",
    saving: "保存中...",
    profileSaved: "個人情報を更新しました。",
    profileError: "個人情報を更新できませんでした。",
    passwordTitle: "パスワード変更",
    passwordDescription: "8文字以上で、他のサイトでは使用していないパスワードを設定してください。",
    setPasswordTitle: "パスワードの設定",
    setPasswordHint:
      "現在は Google または WeChat でログインしています。パスワードを設定すると、メールアドレスでもログインできます。",
    setPassword: "パスワードを設定",
    passwordSet: "パスワードを設定しました。他のデバイスはすべてログアウトされました。",
    currentPassword: "現在のパスワード",
    newPassword: "新しいパスワード",
    confirmPassword: "新しいパスワードの確認",
    changePassword: "パスワードを変更",
    passwordChanged: "パスワードを変更しました。他のデバイスはすべてログアウトされました。",
    passwordError: "パスワードを変更できませんでした。",
    currentPasswordIncorrect: "現在のパスワードが正しくありません。",
    passwordTooShort: "新しいパスワードは8文字以上にしてください。",
    passwordSame: "新しいパスワードは現在のパスワードと異なるものにしてください。",
    passwordMismatch: "新しいパスワードが一致しません。",
    connectionsTitle: "連携済みのログイン方法",
    connectionsHint:
      "メールアドレスとパスワードのほかに、Google や WeChat でもログインできます。ログイン方法を 1 つ以上残していれば、いつでも連携を解除できます。",
    providerGoogle: "Google",
    providerWechat: "WeChat",
    connectionsLoading: "連携情報を読み込んでいます...",
    connectionsEmpty: "この環境で利用できる外部ログインはありません。",
    connectionsError: "連携情報を読み込めませんでした。",
    notConnected: "未連携",
    lastSignIn: (when) => `最終利用：${when}`,
    neverSignedIn: "ログインに使用したことはありません",
    connect: "連携する",
    connecting: "移動中...",
    disconnect: "連携を解除",
    disconnecting: "解除中...",
    lastWayInNote:
      "現在これが唯一のログイン方法です。上でパスワードを設定すると、連携を解除できます。",
    connectedOk: (provider) => `${provider} との連携が完了しました。`,
    disconnectedOk: (provider) => `${provider} との連携を解除しました。`,
    disconnectError: "連携を解除できませんでした。もう一度お試しください。",
    disconnectRefused:
      "これが唯一のログイン方法です。先にパスワードを設定してから解除してください。",
    linkCancelled: "提供元で連携がキャンセルされました。アカウントに変更はありません。",
    linkExpired: "手続きに時間がかかりすぎたため期限切れになりました。もう一度お試しください。",
    linkAlreadyLinked: "その外部アカウントは別の ArkAgent ユーザーに連携済みです。",
    linkFailed: "連携できませんでした。もう一度お試しください。",
    signOutTitle: "ログアウト",
    signOutDescription: "このデバイスの現在のセッションを終了します。",
    signOut: "ログアウト",
    signingOut: "ログアウト中...",
    signOutError: "ログアウトできませんでした。もう一度お試しください。",
  },
};
