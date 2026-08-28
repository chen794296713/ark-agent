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
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    changePassword: "Change password",
    passwordChanged: "Password changed successfully.",
    passwordError: "Could not change your password.",
    currentPasswordIncorrect: "The current password is incorrect.",
    passwordTooShort: "The new password must be at least 8 characters.",
    passwordSame: "The new password must be different from the current password.",
    passwordMismatch: "The new passwords do not match.",
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
    currentPassword: "当前密码",
    newPassword: "新密码",
    confirmPassword: "确认新密码",
    changePassword: "修改密码",
    passwordChanged: "密码修改成功。",
    passwordError: "密码修改失败，请重试。",
    currentPasswordIncorrect: "当前密码不正确。",
    passwordTooShort: "新密码至少需要 8 个字符。",
    passwordSame: "新密码不能与当前密码相同。",
    passwordMismatch: "两次输入的新密码不一致。",
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
    currentPassword: "目前密碼",
    newPassword: "新密碼",
    confirmPassword: "確認新密碼",
    changePassword: "修改密碼",
    passwordChanged: "密碼修改成功。",
    passwordError: "密碼修改失敗，請重試。",
    currentPasswordIncorrect: "目前密碼不正確。",
    passwordTooShort: "新密碼至少需要 8 個字元。",
    passwordSame: "新密碼不能與目前密碼相同。",
    passwordMismatch: "兩次輸入的新密碼不一致。",
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
    currentPassword: "現在のパスワード",
    newPassword: "新しいパスワード",
    confirmPassword: "新しいパスワードの確認",
    changePassword: "パスワードを変更",
    passwordChanged: "パスワードを変更しました。",
    passwordError: "パスワードを変更できませんでした。",
    currentPasswordIncorrect: "現在のパスワードが正しくありません。",
    passwordTooShort: "新しいパスワードは8文字以上にしてください。",
    passwordSame: "新しいパスワードは現在のパスワードと異なるものにしてください。",
    passwordMismatch: "新しいパスワードが一致しません。",
    signOutTitle: "ログアウト",
    signOutDescription: "このデバイスの現在のセッションを終了します。",
    signOut: "ログアウト",
    signingOut: "ログアウト中...",
    signOutError: "ログアウトできませんでした。もう一度お試しください。",
  },
};
