"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { c, font, gridBg, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { useApp } from "@/lib/store";
import { ApiError } from "@/lib/client-api";

type AuthMode = "login" | "signup" | "forgot";

const authTitles: Record<AuthMode, [string, string]> = {
  login: ["Welcome back", "Sign in to manage your workforce."],
  signup: ["Create your workspace", "Your first agent can be live in four minutes."],
  forgot: ["Reset your password", "Enter your email and we’ll send a secure reset link."],
};

export default function AuthPage() {
  const router = useRouter();
  const { user, authReady, login, register } = useApp();
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in → go straight to the dashboard.
  useEffect(() => {
    if (authReady && user) router.replace("/dashboard");
  }, [authReady, user, router]);

  const am = authMode;
  const setAuth = (m: AuthMode) => {
    setAuthMode(m);
    setResetSent(false);
    setError(null);
  };
  const doAuth = async () => {
    setError(null);
    if (am === "forgot") {
      setResetSent(true);
      return;
    }
    if (!email.trim() || !pw) {
      setError("Please enter your email and password.");
      return;
    }
    if (am === "signup" && !name.trim()) {
      setError("Please enter your name.");
      return;
    }
    setBusy(true);
    try {
      if (am === "login") await login(email.trim(), pw);
      else await register(name.trim(), email.trim(), pw);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };
  const ssoUnavailable = () => setError("Social sign-in is coming soon — please use email.");

  const aLogin = am === "login";
  const aSignup = am === "signup";
  const aForgot = am === "forgot";
  const aSSO = am !== "forgot";
  const aForgotSent = am === "forgot" && resetSent;
  const showName = am === "signup";
  const showPw = am !== "forgot";
  const authTitle = authTitles[am][0];
  const authSub = authTitles[am][1];
  const authEmailShown = email.trim() || "your inbox";
  const authBtnLabel =
    am === "login"
      ? "Sign in →"
      : am === "signup"
        ? "Create account →"
        : resetSent
          ? "Resend link"
          : "Send reset link";

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
            YOUR WORKFORCE IS WAITING
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
            While you were away, your agents kept working.
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
              <span style={{ color: c.faint }}>09:41</span>
              <span style={{ color: c.text2 }}>
                Nova booked an intro call with Meridian Logistics
              </span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ color: c.faint }}>09:21</span>
              <span style={{ color: c.text2 }}>Atlas escalated a refund for your approval</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ color: c.faint }}>08:30</span>
              <span style={{ color: c.text2 }}>Juno submitted 2 drafts for review</span>
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
          ARKAGENT.AI — GLOBAL · IAGENT.CC — 中国大陆
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
          {error && (
            <div
              style={{
                border: `1px solid ${c.redBorder}`,
                background: c.redWash,
                color: c.red,
                padding: "12px 14px",
                marginBottom: 16,
                fontSize: 13.5,
              }}
            >
              {error}
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
                Reset link sent
              </div>
              <div style={{ fontSize: 13.5, color: c.muted, marginTop: 4 }}>
                Check {authEmailShown} — the link expires in 30 minutes. No email? Check spam or
                resend below.
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {aSSO && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: r.split, gap: 10 }}>
                  <Btn
                    onClick={ssoUnavailable}
                    hoverStyle={{ borderColor: c.borderMute }}
                    style={{
                      border: `1px solid ${c.borderStrong}`,
                      background: "transparent",
                      color: c.text,
                      padding: 12,
                      fontFamily: font.sans,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    G · Google
                  </Btn>
                  <Btn
                    onClick={ssoUnavailable}
                    hoverStyle={{ borderColor: c.borderMute }}
                    style={{
                      border: `1px solid ${c.borderStrong}`,
                      background: "transparent",
                      color: c.text,
                      padding: 12,
                      fontFamily: font.sans,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    微信 WeChat
                  </Btn>
                </div>
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
                  <span style={{ flex: 1, height: 1, background: c.line }}></span>OR
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
                  FULL NAME
                </div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Wei Zhang"
                  style={{
                    width: "100%",
                    background: c.panel,
                    border: `1px solid ${c.border}`,
                    color: c.text,
                    padding: "12px 14px",
                    fontSize: 15,
                    fontFamily: font.sans,
                    outline: "none",
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
                WORK EMAIL
              </div>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="wei@company.com"
                style={{
                  width: "100%",
                  background: c.panel,
                  border: `1px solid ${c.border}`,
                  color: c.text,
                  padding: "12px 14px",
                  fontSize: 15,
                  fontFamily: font.sans,
                  outline: "none",
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
                  PASSWORD
                </div>
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="••••••••••"
                  style={{
                    width: "100%",
                    background: c.panel,
                    border: `1px solid ${c.border}`,
                    color: c.text,
                    padding: "12px 14px",
                    fontSize: 15,
                    fontFamily: font.sans,
                    outline: "none",
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
              }}
            >
              {busy ? "Please wait…" : authBtnLabel}
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
                  Forgot password?
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
                  New here? Create account
                </Btn>
              </>
            )}
            {aSignup && (
              <>
                <span style={{ color: c.faint, fontSize: 12.5 }}>
                  By signing up you agree to the Terms.
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
                  Have an account? Sign in
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
                ← Back to sign in
              </Btn>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
