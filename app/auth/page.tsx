"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { c, font, gridBg, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { PasswordField } from "@/components/PasswordField";
import { useApp } from "@/lib/store";
import { ApiError } from "@/lib/client-api";
import { auth, type AuthDict } from "@/lib/i18n/auth";

type AuthMode = "login" | "signup" | "forgot";

type SsoProvider = "google" | "wechat";
/** null while the availability probe is still in flight. */
type SsoAvailability = Record<SsoProvider, boolean> | null;

/**
 * Copy for a `?sso_error=` code handed back by the OAuth callback. Unknown codes
 * — and `failed` itself — land on the generic message rather than going silent.
 */
function ssoErrorText(t: AuthDict, code: string): string {
  switch (code) {
    case "unconfigured":
      return t.ssoErrUnconfigured;
    case "denied":
      return t.ssoErrDenied;
    case "state":
      return t.ssoErrState;
    case "expired":
      return t.ssoErrExpired;
    case "email_taken":
      return t.ssoErrEmailTaken;
    case "already_linked":
      return t.ssoErrAlreadyLinked;
    case "suspended":
      return t.ssoErrSuspended;
    case "provider":
      return t.ssoErrProvider;
    default:
      return t.ssoErrFailed;
  }
}

/**
 * `useSearchParams` opts the tree into client rendering, so the page body sits
 * under a <Suspense> boundary — same shape as /hire and /payment/return.
 */
export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthInner />
    </Suspense>
  );
}

function AuthInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, authReady, login, register, lang } = useApp();
  const t = auth[lang];
  const authTitles: Record<AuthMode, [string, string]> = {
    login: [t.loginTitle, t.loginSub],
    signup: [t.signupTitle, t.signupSub],
    forgot: [t.forgotTitle, t.forgotSub],
  };
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Seeded once from the URL: the code stays in state (rather than being read
  // from `params` at render) so any later attempt can clear the banner without
  // having to rewrite the address bar.
  const [ssoErrorCode, setSsoErrorCode] = useState<string | null>(() =>
    params.get("sso_error"),
  );
  const [sso, setSso] = useState<SsoAvailability>(null);
  const [ssoBusy, setSsoBusy] = useState(false);

  // Already signed in → go straight to the dashboard.
  useEffect(() => {
    if (authReady && user) router.replace("/dashboard");
  }, [authReady, user, router]);

  // Which providers actually have credentials on this deployment. Read with a
  // plain fetch: availability is a concern of this screen alone and never
  // reaches the typed API client.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/sso", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          providers?: Partial<Record<SsoProvider, boolean>>;
        };
        if (cancelled) return;
        setSso({
          google: body.providers?.google === true,
          wechat: body.providers?.wechat === true,
        });
      } catch {
        // An unreachable probe reads exactly like "nothing is configured": the
        // buttons stay dead rather than opening a flow that cannot come back.
        if (!cancelled) setSso({ google: false, wechat: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Backing out of the provider's consent screen restores this page from the
  // bfcache with its state intact — including the lock the outgoing navigation
  // set, which would otherwise leave both buttons dead for good.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setSsoBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const am = authMode;
  const clearErrors = () => {
    setError(null);
    setSsoErrorCode(null);
  };
  const setAuth = (m: AuthMode) => {
    setAuthMode(m);
    setResetSent(false);
    clearErrors();
  };
  const startSso = (provider: SsoProvider) => {
    clearErrors();
    setSsoBusy(true);
    // A real top-level navigation — neither fetch() nor router.push() will do.
    // The start route answers with a 302 to the provider's cross-origin consent
    // page, which the client router cannot follow and XHR is not allowed to.
    const url = new URL(`/api/auth/${provider}/start`, window.location.origin);
    url.searchParams.set("next", "/dashboard");
    window.location.assign(url.toString());
  };
  const doAuth = async () => {
    clearErrors();
    if (am === "forgot") {
      setResetSent(true);
      return;
    }
    if (!email.trim() || !pw) {
      setError(t.errEmailPassword);
      return;
    }
    if (am === "signup" && !name.trim()) {
      setError(t.errName);
      return;
    }
    setBusy(true);
    try {
      if (am === "login") await login(email.trim(), pw);
      else await register(name.trim(), email.trim(), pw);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.errGeneric);
      setBusy(false);
    }
  };

  const aLogin = am === "login";
  const aSignup = am === "signup";
  const aForgot = am === "forgot";
  const aSSO = am !== "forgot";
  const aForgotSent = am === "forgot" && resetSent;
  const showName = am === "signup";
  const showPw = am !== "forgot";
  const authTitle = authTitles[am][0];
  const authSub = authTitles[am][1];
  const authEmailShown = email.trim() || t.inboxFallback;
  const authBtnLabel =
    am === "login"
      ? t.btnSignIn
      : am === "signup"
        ? t.btnCreateAccount
        : resetSent
          ? t.btnResendLink
          : t.btnSendResetLink;

  // A fresh local/API failure supersedes the code the redirect arrived with.
  const banner = error ?? (ssoErrorCode ? ssoErrorText(t, ssoErrorCode) : null);
  // Named so the note below the buttons says which provider is missing, instead
  // of writing off social sign-in wholesale while the other one works.
  const ssoMissing = sso
    ? [
        ...(sso.google ? [] : [t.ssoNameGoogle]),
        ...(sso.wechat ? [] : [t.ssoNameWeChat]),
      ]
    : [];

  return (
    <div
      data-screen-label="Sign in"
      style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: r.split }}
    >
      <div style={{ display: r.authHero }}>
      <div
        style={{
          height: "100%",
          background: c.panel,
          borderRight: `1px solid ${c.line}`,
          padding: `40px ${r.pagePxWide}`,
          display: "flex",
          flexDirection: "column",
          ...gridBg,
        }}
      >
        <div
          onClick={() => router.push("/")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            width: "fit-content",
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              background: c.lime,
              display: "grid",
              placeItems: "center",
              fontFamily: font.space,
              fontWeight: 700,
              color: c.ink,
              fontSize: 15,
            }}
          >
            A
          </div>
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 15,
              fontWeight: 500,
              letterSpacing: ".04em",
            }}
          >
            ARK_AGENT
          </span>
        </div>
        <div style={{ margin: "auto 0", maxWidth: 440 }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 12,
              letterSpacing: ".14em",
              color: c.accent,
              marginBottom: 18,
            }}
          >
            {t.heroEyebrow}
          </div>
          <div
            style={{
              fontFamily: font.space,
              fontWeight: 700,
              fontSize: 34,
              letterSpacing: "-.02em",
              lineHeight: 1.12,
              marginBottom: 28,
            }}
          >
            {t.heroHeadline}
          </div>
          <div
            style={{
              border: `1px solid ${c.border}`,
              background: c.panelDeep,
              padding: "16px 18px",
              fontFamily: font.mono,
              fontSize: 12.5,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ color: c.faint }}>{t.feedTime0941}</span>
              <span style={{ color: c.text2 }}>{t.feed0930}</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ color: c.faint }}>{t.feedTime0921}</span>
              <span style={{ color: c.text2 }}>{t.feed0921}</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ color: c.faint }}>{t.feedTime0830}</span>
              <span style={{ color: c.text2 }}>{t.feed0830}</span>
            </div>
          </div>
        </div>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: c.faint,
            letterSpacing: ".08em",
          }}
        >
          {t.regions}
        </div>
      </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: r.pagePxWide,
        }}
      >
        <div style={{ width: r.formW }}>
          <h2
            style={{
              fontFamily: font.space,
              fontWeight: 700,
              fontSize: 30,
              letterSpacing: "-.02em",
              margin: "0 0 8px",
            }}
          >
            {authTitle}
          </h2>
          <p style={{ color: c.muted, margin: "0 0 28px", fontSize: 14.5 }}>{authSub}</p>
          {banner && (
            <div
              role="alert"
              style={{
                border: `1px solid ${c.redBorder}`,
                background: c.redWash,
                color: c.red,
                padding: "12px 14px",
                marginBottom: 16,
                fontSize: 13.5,
                lineHeight: 1.5,
              }}
            >
              {banner}
            </div>
          )}
          {aForgotSent && (
            <div
              style={{
                border: `1px solid ${c.greenBorder}`,
                background: c.greenWash,
                padding: "18px 20px",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  fontFamily: font.space,
                  fontWeight: 700,
                  fontSize: 15,
                  color: c.green,
                }}
              >
                {t.resetSentTitle}
              </div>
              <div style={{ fontSize: 13.5, color: c.muted, marginTop: 4 }}>
                {t.resetSentBody(authEmailShown)}
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {aSSO && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: r.split, gap: 10 }}>
                  <SsoBtn
                    label={t.ssoGoogle}
                    ready={sso && sso.google}
                    busy={ssoBusy}
                    title={sso && !sso.google ? t.ssoNotConfigured(t.ssoNameGoogle) : undefined}
                    onClick={() => startSso("google")}
                  />
                  <SsoBtn
                    label={t.ssoWeChat}
                    ready={sso && sso.wechat}
                    busy={ssoBusy}
                    title={sso && !sso.wechat ? t.ssoNotConfigured(t.ssoNameWeChat) : undefined}
                    onClick={() => startSso("wechat")}
                  />
                </div>
                {ssoMissing.length > 0 && (
                  <div
                    style={{
                      fontFamily: font.sans,
                      fontSize: 12.5,
                      color: c.faint,
                      lineHeight: 1.5,
                    }}
                  >
                    {t.ssoNotConfigured(ssoMissing.join(t.ssoJoin))}
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    color: c.faint,
                    fontFamily: font.mono,
                    fontSize: 11,
                  }}
                >
                  <span style={{ flex: 1, height: 1, background: c.line }}></span>
                  {t.orDivider}
                  <span style={{ flex: 1, height: 1, background: c.line }}></span>
                </div>
              </>
            )}
            {showName && (
              <div>
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 11,
                    letterSpacing: ".12em",
                    color: c.muted,
                    marginBottom: 7,
                  }}
                >
                  {t.labelName}
                </div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.placeholderName}
                  style={{
                    width: "100%",
                    background: c.panel,
                    border: `1px solid ${c.border}`,
                    color: c.text,
                    padding: "12px 14px",
                    fontSize: 15,
                    fontFamily: font.sans,
                    outline: "none",
                    borderRadius: r.radiusSm,
                  }}
                />
              </div>
            )}
            <div>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  letterSpacing: ".12em",
                  color: c.muted,
                  marginBottom: 7,
                }}
              >
                {t.labelEmail}
              </div>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.placeholderEmail}
                style={{
                  width: "100%",
                  background: c.panel,
                  border: `1px solid ${c.border}`,
                  color: c.text,
                  padding: "12px 14px",
                  fontSize: 15,
                  fontFamily: font.sans,
                  outline: "none",
                  borderRadius: r.radiusSm,
                }}
              />
            </div>
            {showPw && (
              <div>
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 11,
                    letterSpacing: ".12em",
                    color: c.muted,
                    marginBottom: 7,
                  }}
                >
                  {t.labelPassword}
                </div>
                <PasswordField
                  value={pw}
                  onChange={setPw}
                  placeholder={t.placeholderPassword}
                  showLabel={t.showPassword}
                  hideLabel={t.hidePassword}
                  // Signup is a new secret — telling the password manager so is
                  // what makes it offer to generate and save one.
                  autoComplete={aSignup ? "new-password" : "current-password"}
                  style={{
                    width: "100%",
                    background: c.panel,
                    border: `1px solid ${c.border}`,
                    color: c.text,
                    padding: "12px 14px",
                    fontSize: 15,
                    fontFamily: font.sans,
                    outline: "none",
                    borderRadius: r.radiusSm,
                  }}
                />
              </div>
            )}
            <Btn
              onClick={doAuth}
              disabled={busy}
              hoverStyle={{ background: c.limeHover }}
              style={{
                background: c.lime,
                color: c.ink,
                border: "none",
                padding: 14,
                fontFamily: font.space,
                fontWeight: 700,
                fontSize: 15,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.7 : 1,
                marginTop: 4,
                borderRadius: r.radiusSm,
              }}
            >
              {busy ? t.btnPleaseWait : authBtnLabel}
            </Btn>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 20,
              fontSize: 13.5,
            }}
          >
            {aLogin && (
              <>
                <Btn
                  onClick={() => setAuth("forgot")}
                  hoverStyle={{ color: c.accent }}
                  style={{
                    background: "none",
                    border: "none",
                    color: c.muted,
                    cursor: "pointer",
                    fontFamily: font.sans,
                    fontSize: 13.5,
                    padding: 0,
                  }}
                >
                  {t.forgotPassword}
                </Btn>
                <Btn
                  onClick={() => setAuth("signup")}
                  style={{
                    background: "none",
                    border: "none",
                    color: c.accent,
                    cursor: "pointer",
                    fontFamily: font.sans,
                    fontSize: 13.5,
                    padding: 0,
                  }}
                >
                  {t.newHere}
                </Btn>
              </>
            )}
            {aSignup && (
              <>
                <span style={{ color: c.faint, fontSize: 12.5 }}>
                  {t.termsNotice}
                </span>
                <Btn
                  onClick={() => setAuth("login")}
                  style={{
                    background: "none",
                    border: "none",
                    color: c.accent,
                    cursor: "pointer",
                    fontFamily: font.sans,
                    fontSize: 13.5,
                    padding: 0,
                  }}
                >
                  {t.haveAccount}
                </Btn>
              </>
            )}
            {aForgot && (
              <Btn
                onClick={() => setAuth("login")}
                hoverStyle={{ color: c.text }}
                style={{
                  background: "none",
                  border: "none",
                  color: c.muted,
                  cursor: "pointer",
                  fontFamily: font.sans,
                  fontSize: 13.5,
                  padding: 0,
                }}
              >
                {t.backToSignIn}
              </Btn>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One provider button. `ready === null` means the availability probe has not
 * answered yet — dead but undimmed, so the row does not flash "unavailable" on
 * every load; `false` is a real "no credentials here", which reads as disabled.
 */
function SsoBtn({
  label,
  ready,
  busy,
  title,
  onClick,
}: {
  label: string;
  ready: boolean | null;
  busy: boolean;
  title?: string;
  onClick: () => void;
}) {
  const live = ready === true && !busy;
  return (
    <Btn
      type="button"
      onClick={onClick}
      disabled={!live}
      title={title}
      hoverStyle={live ? { borderColor: c.borderMute } : undefined}
      style={{
        border: `1px solid ${c.borderStrong}`,
        background: "transparent",
        color: c.text,
        padding: 12,
        fontFamily: font.sans,
        fontSize: 14,
        cursor: live ? "pointer" : "default",
        opacity: ready === false ? 0.45 : 1,
        borderRadius: r.radiusSm,
      }}
    >
      {label}
    </Btn>
  );
}
