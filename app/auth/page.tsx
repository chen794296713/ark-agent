"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Brand } from "@/components/Brand";
import { marketing } from "@/lib/i18n/marketing";
import styles from "./auth.module.css";
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
  const m = marketing[lang];
  const fieldLabel = (label: string) => lang === "en" ? label.charAt(0) + label.slice(1).toLowerCase() : label;
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
    <main data-screen-label="Sign in" className={styles.page}>
      <header className={styles.header}><Brand /></header>
      <div className={styles.layout}>
        <aside className={styles.introduction}>
          <h2>{m.closingTitle}</h2>
          <p>{m.closingBody}</p>
          <figure className={styles.portraits}>
            <div className={styles.portraitPair}>
              <Image loading="eager" src="/images/agents/recruiting.png" alt="" width={640} height={800} sizes="(max-width: 900px) 0px, 24vw" />
              <Image src="/images/agents/email-assistant.png" alt="" width={640} height={800} sizes="(max-width: 900px) 0px, 24vw" />
            </div>
            <figcaption>{m.portraitNote}</figcaption>
          </figure>
        </aside>
        <section className={styles.formColumn} aria-labelledby="auth-title">
          <div className={styles.formHeading}>
            <h1 id="auth-title">{authTitle}</h1>
            <p>{aSignup ? m.customBody : authSub}</p>
          </div>
          {banner && <div role="alert" className={styles.error}>{banner}</div>}
          {aForgotSent && (
            <div role="status" className={styles.success}>
              <strong>{t.resetSentTitle}</strong>
              <p>{t.resetSentBody(authEmailShown)}</p>
            </div>
          )}
          {aSSO && (
            <div className={styles.ssoGroup}>
              <div className={styles.ssoButtons}>
                <SsoBtn label={t.ssoNameGoogle} ready={sso && sso.google} busy={ssoBusy}
                  title={sso && !sso.google ? t.ssoNotConfigured(t.ssoNameGoogle) : undefined}
                  onClick={() => startSso("google")} />
                <SsoBtn label={t.ssoNameWeChat} ready={sso && sso.wechat} busy={ssoBusy}
                  title={sso && !sso.wechat ? t.ssoNotConfigured(t.ssoNameWeChat) : undefined}
                  onClick={() => startSso("wechat")} />
              </div>
              {ssoMissing.length > 0 && <p className={styles.providerNote}>{t.ssoNotConfigured(ssoMissing.join(t.ssoJoin))}</p>}
              <div className={styles.divider}>{t.orDivider.toLocaleLowerCase()}</div>
            </div>
          )}
          <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void doAuth(); }}>
            {showName && (
              <div className={styles.field}>
                <label htmlFor="auth-name">{fieldLabel(t.labelName)}</label>
                <input id="auth-name" name="name" autoComplete="name" value={name}
                  onChange={(e) => setName(e.target.value)} placeholder={t.placeholderName} />
              </div>
            )}
            <div className={styles.field}>
              <label htmlFor="auth-email">{fieldLabel(t.labelEmail)}</label>
              <input id="auth-email" name="email" type={aLogin ? "text" : "email"} inputMode="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder={t.placeholderEmail} />
            </div>
            {showPw && (
              <div className={styles.field}>
                <label htmlFor="auth-password">{fieldLabel(t.labelPassword)}</label>
                <PasswordField id="auth-password" name="password" value={pw} onChange={setPw}
                  placeholder={t.placeholderPassword} showLabel={t.showPassword} hideLabel={t.hidePassword}
                  autoComplete={aSignup ? "new-password" : "current-password"}
                  style={{ borderRadius: 7, padding: "13px 46px 13px 15px", fontSize: 16, borderColor: "var(--c-border-field)" }} />
              </div>
            )}
            <Btn type="submit" disabled={busy} className={styles.primary}>
              {busy ? t.btnPleaseWait : authBtnLabel}
            </Btn>
          </form>
          <div className={styles.footer}>
            {aLogin && <>
              <Btn type="button" onClick={() => setAuth("forgot")}>{t.forgotPassword}</Btn>
              <Btn type="button" onClick={() => setAuth("signup")}>{t.newHere}</Btn>
            </>}
            {aSignup && <>
              <span>{t.termsNotice}</span>
              <Btn type="button" onClick={() => setAuth("login")}>{t.haveAccount}</Btn>
            </>}
            {aForgot && <Btn type="button" onClick={() => setAuth("login")}>{t.backToSignIn}</Btn>}
          </div>
        </section>
      </div>
    </main>
  );
}

/** Provider availability and outgoing navigation control the actual disabled state. */
function SsoBtn({ label, ready, busy, title, onClick }: {
  label: string;
  ready: boolean | null;
  busy: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <Btn type="button" onClick={onClick} disabled={ready !== true || busy}
      title={title} className={styles.ssoButton} data-unavailable={ready === false}>
      {label}
    </Btn>
  );
}
