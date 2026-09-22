import "server-only";

/**
 * The cross-provider half of an OAuth round trip: the short-lived transaction
 * that ties an authorization redirect to the callback that comes back.
 *
 * The transaction lives in its own HttpOnly cookie rather than in a signed
 * `state` blob, so the server never has to trust anything the browser echoes.
 * `state` in the URL is then only a handle compared against the cookie.
 */
import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { safeNextPath } from "@/lib/app-url";
import type { IdentityProvider } from "@/lib/db/schema";

/** A transaction older than this is refused even if the cookie survived. */
const MAX_AGE_MS = 10 * 60 * 1000;

export type OAuthMode = "login" | "link";

interface Transaction {
  /** Random handle echoed through the provider as `state`. */
  s: string;
  /** PKCE code_verifier (unused by WeChat, which has no PKCE). */
  v: string;
  /** Issued-at, in ms. */
  t: number;
  m: OAuthMode;
  /** Sanitized same-origin path to land on when the flow succeeds. */
  n: string;
  /**
   * SHA-256 of the caller's session token, present only for `link`.
   *
   * Without it, `?mode=link` is a plain top-level GET and the session cookie is
   * SameSite=Lax, so it rides along on a cross-site navigation: an attacker
   * could start a link flow in a victim's browser and graft their own provider
   * account onto the victim's ArkAgent user.
   */
  b?: string;
}

function cookieName(provider: IdentityProvider): string {
  return `ark_oauth_${provider}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Constant-time compare of two arbitrary-length strings.
 *
 * Hashing first is what makes it constant-time: `timingSafeEqual` throws on a
 * length mismatch, so a bare length guard would both leak length and be the
 * common path for a wrong value.
 */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    Buffer.from(sha256(a), "hex"),
    Buffer.from(sha256(b), "hex"),
  );
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** PKCE S256 challenge for a verifier. */
export function codeChallengeFor(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

/**
 * Mint a transaction and set its cookie. Returns the values the caller needs to
 * build the provider's authorization URL.
 */
export async function beginOAuthTransaction(opts: {
  provider: IdentityProvider;
  mode: OAuthMode;
  next: string | null;
  /** Raw session token, when starting a `link` flow. */
  sessionToken?: string | null;
}): Promise<{ state: string; codeVerifier: string; codeChallenge: string }> {
  const state = base64url(randomBytes(32));
  const codeVerifier = base64url(randomBytes(48));
  const tx: Transaction = {
    s: state,
    v: codeVerifier,
    t: Date.now(),
    m: opts.mode,
    n: safeNextPath(opts.next),
    ...(opts.mode === "link" && opts.sessionToken ? { b: sha256(opts.sessionToken) } : {}),
  };
  const jar = await cookies();
  jar.set(cookieName(opts.provider), JSON.stringify(tx), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_MS / 1000,
  });
  return { state, codeVerifier, codeChallenge: codeChallengeFor(codeVerifier) };
}

export type ConsumeResult =
  | { ok: true; tx: Transaction }
  | { ok: false; reason: "missing" | "malformed" | "state_mismatch" | "expired" | "session_mismatch" };

/**
 * Validate and clear a transaction. Always clears the cookie, including on
 * failure, so a rejected handle cannot be retried.
 */
export async function consumeOAuthTransaction(opts: {
  provider: IdentityProvider;
  state: string | null;
  /** Raw session token of the caller now, for `link` transactions. */
  sessionToken?: string | null;
}): Promise<ConsumeResult> {
  const jar = await cookies();
  const raw = jar.get(cookieName(opts.provider))?.value;
  jar.delete(cookieName(opts.provider));

  if (!raw) return { ok: false, reason: "missing" };
  let tx: Transaction;
  try {
    tx = JSON.parse(raw) as Transaction;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof tx?.s !== "string" || typeof tx?.t !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (!opts.state || !safeEqual(tx.s, opts.state)) {
    return { ok: false, reason: "state_mismatch" };
  }
  // maxAge is enforced by the browser only; a cookie lifted off a device would
  // otherwise replay forever.
  if (Date.now() - tx.t > MAX_AGE_MS) return { ok: false, reason: "expired" };

  if (tx.m === "link") {
    if (!tx.b || !opts.sessionToken || !safeEqual(tx.b, sha256(opts.sessionToken))) {
      return { ok: false, reason: "session_mismatch" };
    }
  }
  return { ok: true, tx };
}
