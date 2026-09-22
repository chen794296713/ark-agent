import "server-only";

/**
 * Sign in with Google — OAuth 2.0 Authorization Code flow with PKCE, no SDK.
 *
 * Two `fetch` calls and a base64url decode is the whole integration, so it
 * carries no dependency and no vendor client to keep current. PKCE is used even
 * though this is a confidential client with a `client_secret`: it binds the
 * authorization code to the browser that started the flow, so a code leaked out
 * of the redirect (referrer, shared log, a shoulder-surfed URL bar) cannot be
 * redeemed by anyone else.
 */
import { absoluteUrl } from "@/lib/app-url";
import type { Lang } from "@/lib/types-compat";

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

/**
 * Constant on purpose — never configurable per request. `readIdTokenClaims`
 * skips signature verification on the strength of *this* host being the peer.
 */
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Both spellings Google has issued as `iss`. */
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/** Tolerance for clock drift between us and Google when checking `exp`. */
const CLOCK_SKEW_MS = 60_000;

export interface GoogleConfig {
  clientId: string | null;
  clientSecret: string | null;
}

export function googleConfig(): GoogleConfig {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() || null,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || null,
  };
}

/**
 * Whether the Google button may be offered at all.
 *
 * Deliberately touches only the environment: it is called by the unauthenticated
 * availability probe, and `appUrl()` throws in production when
 * NEXT_PUBLIC_APP_URL is unset — a cheap boolean must not be able to 500.
 */
export function isGoogleConfigured(): boolean {
  const { clientId, clientSecret } = googleConfig();
  return Boolean(clientId && clientSecret);
}

/**
 * The `redirect_uri`, which must match the one registered in the Google console
 * byte for byte. Built from the configured origin rather than the inbound
 * request, so a spoofed Host header cannot redirect the code elsewhere.
 */
export function googleRedirectUri(): string {
  return absoluteUrl("/api/auth/google/callback");
}

/** Where to send the browser to start the flow. */
export function authorizeUrl(opts: { state: string; codeChallenge: string }): string {
  const { clientId } = googleConfig();
  if (!clientId) throw new Error("Google sign-in is not configured");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: googleRedirectUri(),
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    // We read the profile once, at sign-in, and never call Google again — so a
    // refresh token would be a long-lived credential stored for no purpose.
    access_type: "online",
    // Without this Google silently reuses whichever account the browser is
    // already signed into, which makes signing in as someone else impossible on
    // a shared machine.
    prompt: "select_account",
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

/** The fields of Google's token response this app looks at. */
export interface GoogleTokenResponse {
  id_token?: unknown;
  access_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
  scope?: unknown;
}

/**
 * Everything about a failed exchange that is safe to put in an Error.
 *
 * Only the two documented OAuth error fields are copied out. The raw body never
 * is: it can echo request parameters back, and this request carries the
 * `client_secret`, the authorization `code` and the PKCE verifier — an Error
 * message is the fastest route from any of those into a log aggregator.
 */
function describeTokenError(body: unknown): string {
  if (!body || typeof body !== "object") return "no error detail";
  const fields = body as Record<string, unknown>;
  const parts = (["error", "error_description"] as const)
    .map((key) => (typeof fields[key] === "string" ? fields[key].slice(0, 200) : null))
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(": ") : "no error detail";
}

/** Redeem an authorization code for tokens. Throws on anything but a 2xx JSON body. */
export async function exchangeCode(opts: {
  code: string;
  codeVerifier: string;
}): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = googleConfig();
  if (!clientId || !clientSecret) throw new Error("Google sign-in is not configured");

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleRedirectUri(),
    code_verifier: opts.codeVerifier,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: form.toString(),
    cache: "no-store",
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${describeTokenError(parsed)}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Google token endpoint returned a non-JSON body");
  }
  return parsed as GoogleTokenResponse;
}

export interface GoogleClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  locale?: Lang;
}

/**
 * Read the identity claims out of a token response.
 *
 * **The id_token signature is not verified**, and that is sound only because of
 * where this object came from. `exchangeCode` fetched it over TLS directly from
 * the constant Google token endpoint above, authenticating with our
 * `client_secret` and the PKCE verifier minted for this one transaction. Google
 * is therefore both the issuer and the peer we spoke to, with nothing
 * attacker-controlled in between: the token is a value we were handed in a
 * private conversation, not a bearer credential presented to us.
 *
 * Three preconditions keep that true, and the caller must preserve all of them:
 *
 *  1. **Only ever pass the object returned by `exchangeCode`.** Never an
 *     id_token lifted from a query string, header, request body or client-side
 *     fetch. This function takes the whole token *response* rather than a JWT
 *     string precisely so that mistake cannot be made by accident — with no
 *     signature check there would be nothing to catch it.
 *  2. **Do not weaken the TLS trust of that fetch** — no custom agent, no
 *     intercepting proxy, no `NODE_TLS_REJECT_UNAUTHORIZED=0`. Server
 *     authentication is what proves the peer was Google.
 *  3. **Keep `TOKEN_ENDPOINT` a constant.** The moment the host can be steered
 *     per request or per environment, the argument above collapses.
 *
 * The iss/aud/exp checks below are defence in depth against a stale or misrouted
 * response (a token minted for another client, a replayed old one) — they are
 * not a stand-in for the signature.
 */
export function readIdTokenClaims(tokenResponse: GoogleTokenResponse): GoogleClaims {
  const idToken = tokenResponse?.id_token;
  if (typeof idToken !== "string" || !idToken) {
    throw new Error("Google token response carried no id_token");
  }
  const segments = idToken.split(".");
  if (segments.length !== 3) throw new Error("Google id_token is not a JWT");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    throw new Error("Google id_token payload is not valid JSON");
  }

  const iss = typeof payload.iss === "string" ? payload.iss : "";
  if (!ISSUERS.has(iss)) throw new Error("Google id_token has an unexpected issuer");

  const { clientId } = googleConfig();
  if (!clientId || payload.aud !== clientId) {
    throw new Error("Google id_token was not issued for this client");
  }

  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (exp * 1000 + CLOCK_SKEW_MS <= Date.now()) throw new Error("Google id_token has expired");

  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!sub) throw new Error("Google id_token carried no subject");

  // Lower-cased here so the identity row matches the `users.email` that
  // resolveProviderIdentity normalises the same way.
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email) throw new Error("Google id_token carried no email");

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const picture = typeof payload.picture === "string" ? payload.picture.trim() : "";

  return {
    sub,
    email,
    // Google has shipped this as both a boolean and the string "true"; anything
    // else — including absent — counts as unverified.
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name: name || null,
    picture: picture || null,
    locale: toLang(typeof payload.locale === "string" ? payload.locale : null),
  };
}

/**
 * Google's BCP-47 `locale` → one of our four languages, or undefined so the
 * account keeps the app default rather than guessing.
 *
 * Script and region both decide Chinese: `zh-Hant`, `zh-TW`, `zh-HK` and
 * `zh-MO` are traditional, every other `zh-*` simplified.
 */
export function toLang(locale: string | null | undefined): Lang | undefined {
  if (!locale) return undefined;
  const tag = locale.trim().toLowerCase().replace(/_/g, "-");
  if (tag === "en" || tag.startsWith("en-")) return "en";
  if (tag === "ja" || tag.startsWith("ja-")) return "ja";
  if (tag === "zh" || tag.startsWith("zh-")) {
    return /(^|-)(hant|tw|hk|mo)(-|$)/.test(tag) ? "zht" : "zh";
  }
  return undefined;
}
