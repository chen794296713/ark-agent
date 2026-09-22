"use client";

import {
  Suspense,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Btn } from "@/components/ui";
import { PasswordField } from "@/components/PasswordField";
import { useApp } from "@/lib/store";
import { api, ApiError } from "@/lib/client-api";
import { account, type AccountDict } from "@/lib/i18n/account";
import { common } from "@/lib/i18n/common";
import { BCP47 } from "@/lib/i18n";
// Type-only: the runtime provider list lives below, so the browser bundle never
// pulls lib/db/schema (and Drizzle with it) in just to name two strings.
import type { IdentityProvider } from "@/lib/types-compat";
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

// PasswordField reserves room on the right for its eye toggle, but the `padding`
// shorthand above would wipe that reservation out, so the password fields carry
// the gap explicitly.
const passwordInputStyle: CSSProperties = { ...inputStyle, paddingRight: 46 };

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

/** What GET /api/me/identities returns — deliberately no `subject`/`appId`. */
interface IdentityDTO {
  provider: IdentityProvider;
  displayName: string | null;
  email: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Render order of the connected-accounts rows. */
const PROVIDERS: readonly IdentityProvider[] = ["google", "wechat"];

function isProvider(value: string | null): value is IdentityProvider {
  return value !== null && (PROVIDERS as readonly string[]).includes(value);
}

/**
 * A Record keyed by the union rather than a switch with a default: adding a
 * provider to the schema enum then fails to compile here instead of quietly
 * rendering a raw `"linkedin"` at the user.
 */
function providerName(t: AccountDict, provider: IdentityProvider): string {
  const names: Record<IdentityProvider, string> = {
    google: t.providerGoogle,
    wechat: t.providerWechat,
  };
  return names[provider];
}

/**
 * Copy for a `?sso_error=` code the OAuth callback can hand back, worded for
 * linking rather than sign-in. Unknown codes fall through to the generic line
 * instead of going silent.
 */
function linkErrorText(t: AccountDict, code: string): string {
  switch (code) {
    case "denied":
      return t.linkCancelled;
    case "expired":
      return t.linkExpired;
    case "already_linked":
      return t.linkAlreadyLinked;
    default:
      return t.linkFailed;
  }
}

function fmtDateTime(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Provider-side name/email plus when it was last used, on one line. */
function identityMeta(t: AccountDict, identity: IdentityDTO, locale: string): string {
  const who = identity.displayName?.trim() || identity.email?.trim();
  const when = identity.lastLoginAt
    ? t.lastSignIn(fmtDateTime(identity.lastLoginAt, locale))
    : t.neverSignedIn;
  return who ? `${who} · ${when}` : when;
}

/**
 * Read the panel's rows. Resolves to null when the read failed, which the caller
 * renders as "could not load" rather than as an account with nothing linked —
 * the two look identical otherwise, and only one of them is safe to act on.
 *
 * Plain fetch with the session cookie, the same way lib/client-api's `req` sends
 * it. This panel is the only caller, so the endpoint earns no typed wrapper.
 */
async function fetchIdentities(): Promise<IdentityDTO[] | null> {
  try {
    const res = await fetch("/api/me/identities", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { identities?: IdentityDTO[] };
    return body.identities ?? [];
  } catch {
    return null;
  }
}

function ProviderIcon({ provider }: { provider: IdentityProvider }) {
  if (provider === "google") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={20}
        height={20}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01" />
        <path d="M20.5 12H13" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.4 3.8C5.6 3.8 2.6 6.2 2.6 9.2c0 1.7 1 3.3 2.5 4.3l-.7 2.2 2.6-1.3c.5.1 1 .2 1.5.2" />
      <path d="M15.2 8.5c-3.4 0-6.2 2.3-6.2 5.1s2.8 5.1 6.2 5.1c.7 0 1.4-.1 2-.3l2.8 1.3-.8-2.2c1.4-.9 2.2-2.3 2.2-3.9 0-2.8-2.8-5.1-6.2-5.1Z" />
    </svg>
  );
}

function AccountInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, lang, refreshAuth, logout } = useApp();
  const t = account[lang];
  const tc = common[lang];

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

  // ---- Connected accounts -------------------------------------------------
  // Seeded once from the URL the OAuth callback returns to: the Connect link
  // asks to land on `?linked=<provider>`, and a failure arrives as `?sso_error=`.
  // Held in state rather than read at render so the banner survives the URL
  // being cleaned up below.
  const [connFeedback, setConnFeedback] = useState<Feedback>(() => {
    const failed = params.get("sso_error");
    if (failed) return { kind: "error", text: linkErrorText(t, failed) };
    const linked = params.get("linked");
    if (!isProvider(linked)) return null;
    return { kind: "success", text: t.connectedOk(providerName(t, linked)) };
  });
  /** null while the first read is still in flight. */
  const [identities, setIdentities] = useState<IdentityDTO[] | null>(null);
  const [identitiesFailed, setIdentitiesFailed] = useState(false);
  /** null while the availability probe is still in flight. */
  const [sso, setSso] = useState<Record<IdentityProvider, boolean> | null>(null);
  const [connBusy, setConnBusy] = useState<IdentityProvider | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await fetchIdentities();
      if (cancelled) return;
      setIdentities(rows ?? []);
      setIdentitiesFailed(rows === null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Which providers this deployment actually holds credentials for. Offering an
  // unconfigured one would only bounce the user to /auth?sso_error=unconfigured.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/sso", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          providers?: Partial<Record<IdentityProvider, boolean>>;
        };
        if (cancelled) return;
        setSso({
          google: body.providers?.google === true,
          wechat: body.providers?.wechat === true,
        });
      } catch {
        // An unreachable probe reads exactly like "nothing is configured": no
        // Connect button at all, rather than one that opens a dead-end flow.
        if (!cancelled) setSso({ google: false, wechat: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The redirect result is one-shot, so drop it from the address bar — a reload
  // should not re-announce a link that happened minutes ago. `replaceState` and
  // not `router.replace`: this is a URL edit, not a navigation, and Next syncs
  // useSearchParams to it (see "Native History API" in the App Router docs).
  useEffect(() => {
    if (!params.get("linked") && !params.get("sso_error")) return;
    window.history.replaceState(null, "", "/dashboard/account");
  }, [params]);

  // Backing out of the provider's consent screen restores this page from the
  // bfcache with its state intact — including the lock the outgoing navigation
  // set, which would otherwise leave the Connect button dead for good.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setConnBusy(null);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  if (!user) return null;

  // A Google/WeChat account has never had a password, so the panel asks for a
  // first one instead of demanding a current password nobody can supply.
  const hasPassword = user.hasPassword;

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
    if (hasPassword && newPassword === currentPassword) {
      setPasswordFeedback({ kind: "error", text: t.passwordSame });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ kind: "error", text: t.passwordMismatch });
      return;
    }

    setPasswordBusy(true);
    try {
      // An account created through Google/WeChat has no current password to
      // confirm, so the field is omitted rather than sent empty.
      await api.changePassword({
        newPassword,
        ...(hasPassword ? { currentPassword } : {}),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFeedback({
        kind: "success",
        text: hasPassword ? t.passwordChanged : t.passwordSet,
      });
      // A first set flips hasPassword, which is what retitles this panel.
      if (!hasPassword) await refreshAuth();
    } catch (error) {
      // Only the change flow can fail on a wrong current password; in set mode a
      // 400 is some other rejection and must not blame a field that is not there.
      const text =
        hasPassword && error instanceof ApiError && error.status === 400
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

  function connectProvider(provider: IdentityProvider) {
    setConnFeedback(null);
    setConnBusy(provider);
    // A real top-level navigation — neither fetch() nor router.push() will do.
    // The start route answers with a redirect to the provider's cross-origin
    // consent page, which XHR cannot follow, and the Set-Cookie carrying the
    // OAuth transaction has to reach the browser for the callback to verify it.
    const url = new URL(`/api/auth/${provider}/start`, window.location.origin);
    url.searchParams.set("mode", "link");
    url.searchParams.set("next", `/dashboard/account?linked=${provider}`);
    window.location.assign(url.toString());
  }

  async function disconnectProvider(provider: IdentityProvider) {
    setConnFeedback(null);
    setConnBusy(provider);
    try {
      const res = await fetch(`/api/me/identities/${provider}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const body = (await res.json().catch(() => null)) as { code?: string } | null;
      if (!res.ok) {
        // The server's own message is English-only; its `code` is the part that
        // can be rendered in the reader's language.
        setConnFeedback({
          kind: "error",
          text: body?.code === "last_way_in" ? t.disconnectRefused : t.disconnectError,
        });
        return;
      }
      // Re-read rather than splice locally: the remaining rows decide whether
      // the last Disconnect is still allowed, so they must come from the server.
      // If that re-read fails, still drop the row — the delete did happen, and
      // leaving it on screen would invite a second attempt at a gone identity.
      const rows = await fetchIdentities();
      if (rows) {
        setIdentities(rows);
        setIdentitiesFailed(false);
      } else {
        setIdentities((prev) => (prev ?? []).filter((row) => row.provider !== provider));
      }
      setConnFeedback({
        kind: "success",
        text: t.disconnectedOk(providerName(t, provider)),
      });
    } catch {
      setConnFeedback({ kind: "error", text: t.disconnectError });
    } finally {
      setConnBusy(null);
    }
  }

  const dateLocale = BCP47[lang];
  const linkedByProvider = new Map((identities ?? []).map((i) => [i.provider, i]));
  // A provider is listed only if it is already linked — an existing link must
  // always stay removable — or this deployment can actually complete the flow.
  const shownProviders = PROVIDERS.filter(
    (p) => linkedByProvider.has(p) || sso?.[p] === true,
  );
  // Unlinking the last identity of an account that has no password locks its
  // owner out for good, so the control goes dead. The server refuses it too;
  // this only spares the user a round trip to be told no.
  const canDisconnect = hasPassword || (identities?.length ?? 0) > 1;

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
              // The hint below carries the rest of the gap when it is shown.
              margin: hasPassword ? "0 0 22px" : "0 0 8px",
              color: c.text,
              fontFamily: font.space,
              fontSize: 18,
            }}
          >
            {hasPassword ? t.passwordTitle : t.setPasswordTitle}
          </h3>

          {hasPassword ? null : (
            <div style={{ marginBottom: 20, color: c.faint, fontSize: 12, lineHeight: 1.5 }}>
              {t.setPasswordHint}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 22 }}>
            {hasPassword ? (
              <div>
                <label htmlFor="current-password" style={labelStyle}>
                  {t.currentPassword}
                </label>
                <PasswordField
                  id="current-password"
                  name="currentPassword"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                  showLabel={tc.showPassword}
                  hideLabel={tc.hidePassword}
                  required
                  style={passwordInputStyle}
                />
              </div>
            ) : null}
            <div>
              <label htmlFor="new-password" style={labelStyle}>
                {t.newPassword}
              </label>
              <PasswordField
                id="new-password"
                name="newPassword"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                showLabel={tc.showPassword}
                hideLabel={tc.hidePassword}
                required
                style={passwordInputStyle}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" style={labelStyle}>
                {t.confirmPassword}
              </label>
              <PasswordField
                id="confirm-password"
                name="confirmPassword"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                showLabel={tc.showPassword}
                hideLabel={tc.hidePassword}
                required
                style={passwordInputStyle}
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
            {passwordBusy ? t.saving : hasPassword ? t.changePassword : t.setPassword}
          </Btn>
          <FeedbackMessage feedback={passwordFeedback} />
        </form>
      </div>

      <section style={{ ...panelStyle, marginTop: r.gapMd }}>
        <h3 style={{ margin: "0 0 8px", color: c.text, fontFamily: font.space, fontSize: 18 }}>
          {t.connectionsTitle}
        </h3>
        <div style={{ marginBottom: 20, color: c.faint, fontSize: 12, lineHeight: 1.5 }}>
          {t.connectionsHint}
        </div>

        {/* Both reads have to land before the list is honest: with the probe
            still out, a user with nothing linked would be told for a moment
            that no provider is available, and then handed two Connect buttons. */}
        {identities === null || sso === null ? (
          <div style={{ color: c.muted, fontSize: 13 }}>{t.connectionsLoading}</div>
        ) : identitiesFailed ? (
          <div role="alert" style={{ color: c.red, fontSize: 13 }}>
            {t.connectionsError}
          </div>
        ) : shownProviders.length === 0 ? (
          <div style={{ color: c.muted, fontSize: 13 }}>{t.connectionsEmpty}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {shownProviders.map((provider, index) => {
              const linked = linkedByProvider.get(provider);
              const busy = connBusy === provider;
              const blocked = Boolean(linked) && !canDisconnect;
              return (
                <div
                  key={provider}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    flexWrap: "wrap",
                    padding: index === 0 ? "0 0 14px" : "14px 0",
                    borderTop: index === 0 ? undefined : `1px solid ${c.lineSoft}`,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ display: "inline-flex", color: linked ? c.accent : c.muted }}
                  >
                    <ProviderIcon provider={provider} />
                  </span>
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div
                      style={{
                        color: c.text,
                        fontFamily: font.space,
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {providerName(t, provider)}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: c.muted,
                        fontSize: 12,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {linked ? identityMeta(t, linked, dateLocale) : t.notConnected}
                    </div>
                    {blocked ? (
                      <div
                        id={`${provider}-last-way-in`}
                        style={{ marginTop: 6, color: c.faint, fontSize: 12, lineHeight: 1.5 }}
                      >
                        {t.lastWayInNote}
                      </div>
                    ) : null}
                  </div>
                  {linked ? (
                    <Btn
                      type="button"
                      onClick={() => void disconnectProvider(provider)}
                      disabled={busy || blocked}
                      aria-describedby={blocked ? `${provider}-last-way-in` : undefined}
                      hoverStyle={blocked ? undefined : { borderColor: c.red, color: c.red }}
                      style={{
                        border: `1px solid ${c.borderStrong}`,
                        background: "transparent",
                        color: c.text2,
                        padding: "8px 14px",
                        cursor: blocked ? "not-allowed" : busy ? "wait" : "pointer",
                        opacity: busy || blocked ? 0.55 : 1,
                        fontFamily: font.space,
                        fontSize: 13,
                        fontWeight: 600,
                        borderRadius: r.radiusSm,
                      }}
                    >
                      {busy ? t.disconnecting : t.disconnect}
                    </Btn>
                  ) : (
                    <Btn
                      type="button"
                      onClick={() => connectProvider(provider)}
                      disabled={busy}
                      hoverStyle={{ borderColor: c.accent, color: c.accent }}
                      style={{
                        border: `1px solid ${c.borderStrong}`,
                        background: "transparent",
                        color: c.text,
                        padding: "8px 14px",
                        cursor: busy ? "wait" : "pointer",
                        opacity: busy ? 0.55 : 1,
                        fontFamily: font.space,
                        fontSize: 13,
                        fontWeight: 600,
                        borderRadius: r.radiusSm,
                      }}
                    >
                      {busy ? t.connecting : t.connect}
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <FeedbackMessage feedback={connFeedback} />
      </section>

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

/**
 * `useSearchParams` (which reads the `?linked=` / `?sso_error=` the OAuth
 * callback returns with) opts the tree into client rendering, so the page body
 * sits under a <Suspense> boundary — same shape as /auth and /dashboard/fleet.
 */
export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountInner />
    </Suspense>
  );
}
