"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui";
import { useApp } from "@/lib/store";
import { api, ApiError } from "@/lib/client-api";
import { account } from "@/lib/i18n/account";
import { c, font, r } from "@/lib/theme";

const panelStyle: CSSProperties = {
  border: `1px solid ${c.border}`,
  background: c.panel,
  padding: "clamp(20px, 4vw, 28px)",
  borderRadius: r.radiusMd,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 7,
  color: c.muted,
  fontFamily: font.mono,
  fontSize: 11,
  letterSpacing: ".08em",
};

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  border: `1px solid ${c.border}`,
  background: c.panelDeep,
  color: c.text,
  padding: "11px 12px",
  fontFamily: font.sans,
  fontSize: 14,
  outline: "none",
  borderRadius: r.radiusSm,
};

type Feedback = { kind: "success" | "error"; text: string } | null;

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  const success = feedback.kind === "success";
  return (
    <div
      role={success ? "status" : "alert"}
      style={{
        marginTop: 14,
        border: `1px solid ${success ? c.greenBorder : c.redBorder}`,
        background: success ? c.greenWash : c.redWash,
        color: success ? c.green : c.red,
        padding: "10px 12px",
        fontSize: 13,
        borderRadius: r.radiusSm,
      }}
    >
      {feedback.text}
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { user, lang, refreshAuth, logout } = useApp();
  const t = account[lang];

  const [name, setName] = useState(user?.name ?? "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);

  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutFeedback, setLogoutFeedback] = useState<Feedback>(null);

  if (!user) return null;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      setProfileFeedback({ kind: "error", text: t.profileError });
      return;
    }

    setProfileBusy(true);
    setProfileFeedback(null);
    try {
      await api.setPrefs({ name: nextName });
      await refreshAuth();
      setName(nextName);
      setProfileFeedback({ kind: "success", text: t.profileSaved });
    } catch {
      setProfileFeedback({ kind: "error", text: t.profileError });
    } finally {
      setProfileBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordFeedback(null);

    if (newPassword.length < 8) {
      setPasswordFeedback({ kind: "error", text: t.passwordTooShort });
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordFeedback({ kind: "error", text: t.passwordSame });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ kind: "error", text: t.passwordMismatch });
      return;
    }

    setPasswordBusy(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFeedback({ kind: "success", text: t.passwordChanged });
    } catch (error) {
      const text =
        error instanceof ApiError && error.status === 400
          ? t.currentPasswordIncorrect
          : t.passwordError;
      setPasswordFeedback({ kind: "error", text });
    } finally {
      setPasswordBusy(false);
    }
  }

  async function signOut() {
    setLogoutBusy(true);
    setLogoutFeedback(null);
    try {
      await logout();
      router.replace("/auth");
    } catch {
      setLogoutFeedback({ kind: "error", text: t.signOutError });
      setLogoutBusy(false);
    }
  }

  return (
    <div data-screen-label="Account" style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            color: c.accent,
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: ".12em",
            marginBottom: 8,
          }}
        >
          {t.eyebrow}
        </div>
        <h2
          style={{
            margin: 0,
            color: c.text,
            fontFamily: font.space,
            fontSize: "clamp(22px, 4vw, 28px)",
            fontWeight: 700,
          }}
        >
          {t.heading}
        </h2>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: r.col2,
          gap: r.gapMd,
          alignItems: "start",
        }}
      >
        <form onSubmit={saveProfile} style={panelStyle}>
          <h3
            style={{
              margin: "0 0 22px",
              color: c.text,
              fontFamily: font.space,
              fontSize: 18,
            }}
          >
            {t.profileTitle}
          </h3>

          <div style={{ marginBottom: 18 }}>
            <label htmlFor="account-name" style={labelStyle}>
              {t.nameLabel}
            </label>
            <input
              id="account-name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              autoComplete="name"
              required
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 22 }}>
            <label htmlFor="account-email" style={labelStyle}>
              {t.emailLabel}
            </label>
            <input
              id="account-email"
              value={user.email}
              readOnly
              aria-describedby="account-email-hint"
              style={{ ...inputStyle, color: c.muted, cursor: "not-allowed" }}
            />
            <div id="account-email-hint" style={{ marginTop: 7, color: c.faint, fontSize: 12 }}>
              {t.emailHint}
            </div>
          </div>

          <Btn
            type="submit"
            disabled={profileBusy || !name.trim() || name.trim() === user.name}
            hoverStyle={{ background: c.limeHover }}
            style={{
              minWidth: 124,
              border: "none",
              background: c.lime,
              color: c.ink,
              padding: "11px 17px",
              cursor: profileBusy ? "wait" : "pointer",
              opacity: profileBusy || !name.trim() || name.trim() === user.name ? 0.55 : 1,
              fontFamily: font.space,
              fontWeight: 600,
              borderRadius: r.radiusSm,
            }}
          >
            {profileBusy ? t.saving : t.saveProfile}
          </Btn>
          <FeedbackMessage feedback={profileFeedback} />
        </form>

        <form onSubmit={changePassword} style={panelStyle}>
          <h3
            style={{
              margin: "0 0 22px",
              color: c.text,
              fontFamily: font.space,
              fontSize: 18,
            }}
          >
            {t.passwordTitle}
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 22 }}>
            <div>
              <label htmlFor="current-password" style={labelStyle}>
                {t.currentPassword}
              </label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                maxLength={200}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="new-password" style={labelStyle}>
                {t.newPassword}
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" style={labelStyle}>
                {t.confirmPassword}
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                required
                style={inputStyle}
              />
            </div>
          </div>

          <Btn
            type="submit"
            disabled={passwordBusy}
            hoverStyle={{ borderColor: c.accent, color: c.accent }}
            style={{
              minWidth: 124,
              border: `1px solid ${c.borderStrong}`,
              background: "transparent",
              color: c.text,
              padding: "10px 17px",
              cursor: passwordBusy ? "wait" : "pointer",
              opacity: passwordBusy ? 0.55 : 1,
              fontFamily: font.space,
              fontWeight: 600,
              borderRadius: r.radiusSm,
            }}
          >
            {passwordBusy ? t.saving : t.changePassword}
          </Btn>
          <FeedbackMessage feedback={passwordFeedback} />
        </form>
      </div>

      <div
        style={{
          marginTop: r.gapMd,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {/* <h3 style={{ margin: 0, color: c.muted, fontFamily: font.space, fontSize: 15 }}>
          {t.signOutTitle}
        </h3> */}
        <button
          type="button"
          onClick={signOut}
          disabled={logoutBusy}
          style={{
            border: `1px solid ${c.redBorder}`,
            background: "transparent",
            color: c.red,
            padding: "7px 12px",
            cursor: logoutBusy ? "wait" : "pointer",
            opacity: logoutBusy ? 0.55 : 1,
            fontFamily: font.space,
            fontSize: 13,
            fontWeight: 500,
            borderRadius: r.radiusSm,
          }}
        >
          {logoutBusy ? t.signingOut : t.signOut}
        </button>
        <div style={{ flexBasis: "100%" }}>
          <FeedbackMessage feedback={logoutFeedback} />
        </div>
      </div>
    </div>
  );
}
