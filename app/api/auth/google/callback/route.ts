import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appUrl, safeNextPath } from "@/lib/app-url";
import { createSession, getCurrentUser } from "@/lib/auth";
import { exchangeCode, googleConfig, readIdTokenClaims } from "@/lib/oauth/google";
import { resolveProviderIdentity, safeErrorMessage } from "@/lib/oauth/identity";
import { consumeOAuthTransaction } from "@/lib/oauth/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "ark_session";

/** The codes /auth knows how to render. Nothing else may reach the browser. */
type SsoError =
  | "unconfigured"
  | "denied"
  | "state"
  | "expired"
  | "email_taken"
  | "already_linked"
  | "suspended"
  | "provider"
  | "failed";

/**
 * Where Google returns the browser.
 *
 * Every failure lands on `/auth?sso_error=<code>` rather than rendering here, so
 * the user always ends up on a page that can explain itself in their language,
 * and the codes stay a closed set that leaks nothing about which half of a
 * check failed.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  // Refusal is reported on the redirect, not at the token endpoint — there is no
  // code to redeem in that case.
  const providerError = url.searchParams.get("error");
  if (providerError) return ssoError(providerError === "access_denied" ? "denied" : "provider");

  const { clientId, clientSecret } = googleConfig();
  if (!clientId || !clientSecret) return ssoError("unconfigured");

  const jar = await cookies();
  const sessionToken = jar.get(SESSION_COOKIE)?.value ?? null;

  const consumed = await consumeOAuthTransaction({
    provider: "google",
    state: url.searchParams.get("state"),
    sessionToken,
  });
  if (!consumed.ok) return ssoError(consumed.reason === "expired" ? "expired" : "state");
  const tx = consumed.tx;

  const code = url.searchParams.get("code");
  if (!code) return ssoError("state");

  // `consumeOAuthTransaction` has already matched the transaction against this
  // browser's session token for a link flow, so the user it resolves to here is
  // the one who started it.
  let linkToUserId: string | null = null;
  if (tx.m === "link") {
    const current = await getCurrentUser();
    if (!current) return ssoError("state");
    linkToUserId = current.id;
  }

  let claims;
  try {
    claims = readIdTokenClaims(await exchangeCode({ code, codeVerifier: tx.v }));
  } catch (err) {
    // Safe to log: `exchangeCode` allowlists the provider's error fields, and no
    // other message in this path quotes the code, the verifier or the secret.
    console.error(
      "[google-callback] token exchange failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return ssoError("provider");
  }

  // An unverified Google address is a string the account holder typed, not proof
  // they own it — treating it as verified would let anyone claim any email.
  if (!claims.emailVerified) return ssoError("failed");

  // Everything past this point touches the database, and a driver error here
  // would otherwise escape the route as an unstyled 500 — which is exactly what
  // linking a second Google account to an already-linked user used to produce.
  // Mirrors the WeChat callback: every failure still lands on /auth.
  try {
    const resolved = await resolveProviderIdentity(
      {
        provider: "google",
        // Namespaces the subject: `sub` is only unique within the OAuth client
        // that minted it, so a client id change must not collide with old rows.
        appId: clientId,
        subject: claims.sub,
        // No anchor column: unlike WeChat's unionid, `sub` is returned on every
        // sign-in, so the canonical key above can never move underneath a row.
        providerKey: null,
        email: claims.email,
        emailVerified: claims.emailVerified,
        displayName: claims.name,
        avatarUrl: claims.picture,
        ...(claims.locale ? { locale: claims.locale } : {}),
      },
      linkToUserId,
    );
    if (!resolved.ok) return ssoError(resolved.code);

    // Always mint a session for the user we just resolved, never keep the one
    // the browser arrived with: on a login flow that cookie may belong to
    // somebody else entirely, and reusing it would drop the Google user into
    // their account.
    await createSession(resolved.userId);
    return NextResponse.redirect(new URL(safeNextPath(tx.n), appUrl()));
  } catch (err) {
    // `safeErrorMessage` reduces a database failure to its SQLSTATE: Drizzle's
    // error message carries the SQL and its bound parameters, which here means
    // the user's email address.
    console.error("[google-callback] sign-in failed:", safeErrorMessage(err));
    return ssoError("failed");
  }
}

function ssoError(code: SsoError): NextResponse {
  return NextResponse.redirect(new URL(`/auth?sso_error=${code}`, appUrl()));
}
