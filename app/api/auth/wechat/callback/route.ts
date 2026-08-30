import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { absoluteUrl, safeNextPath } from "@/lib/app-url";
import { createSession, getCurrentUser } from "@/lib/auth";
import { resolveProviderIdentity, safeErrorMessage } from "@/lib/oauth/identity";
import { consumeOAuthTransaction } from "@/lib/oauth/state";
import {
  exchangeCode,
  fetchUserInfo,
  resolveWechatConfig,
  wechatIdentityKey,
} from "@/lib/oauth/wechat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** See the note in ../start/route.ts — lib/auth.ts does not export this. */
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "ark_session";

/** The vocabulary the /auth screen renders. Shared with the Google callback. */
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

/** No-store because the success case carries the new session cookie. */
function redirect(to: string): NextResponse {
  const res = NextResponse.redirect(to);
  res.headers.set("cache-control", "no-store, no-cache, must-revalidate, private");
  return res;
}

function fail(code: SsoError): NextResponse {
  return redirect(absoluteUrl(`/auth?sso_error=${code}`));
}

/**
 * Error text safe to log: WeChat failures name only an endpoint and errcode,
 * and `safeErrorMessage` keeps a database failure from spilling the SQL and its
 * bound parameters — openids and nicknames — into the log.
 */
function reason(err: unknown): string {
  return safeErrorMessage(err);
}

/**
 * GET /api/auth/wechat/callback?code=...&state=...
 *
 * Nothing in the query is trusted: `state` is only a handle compared against the
 * HttpOnly transaction cookie, and `code` is worthless until WeChat itself
 * trades it for a token.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const sessionToken = jar.get(SESSION_COOKIE)?.value ?? null;

  // Consumed first, and unconditionally: it clears the transaction cookie even
  // on the paths below that bail out, so a handle can never be replayed.
  const tx = await consumeOAuthTransaction({ provider: "wechat", state, sessionToken });
  if (!tx.ok) return fail(tx.reason === "expired" ? "expired" : "state");

  // WeChat redirects back with `state` but no `code` when the user dismisses the
  // authorization sheet — a cancellation, not a failure.
  if (!code) return fail("denied");

  // Re-derived rather than carried through the transaction: the callback lands
  // in the very browser that started the flow (it is the one holding the
  // transaction cookie), so its User-Agent picks the same surface, and with it
  // the appid/secret pair the code was minted for.
  const cfg = resolveWechatConfig(req.headers.get("user-agent"));
  if (!cfg) return fail("unconfigured");

  let token: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    token = await exchangeCode({ surface: cfg.surface, code });
  } catch (err) {
    console.error("[wechat-callback] token exchange failed:", reason(err));
    return fail("provider");
  }

  // Best effort: the profile is cosmetic and /sns/userinfo carries its own rate
  // limits. Losing a nickname is not a reason to refuse a sign-in WeChat has
  // already authorized.
  let nickname: string | null = null;
  let avatarUrl: string | null = null;
  let unionid = token.unionid;
  try {
    const info = await fetchUserInfo({ accessToken: token.accessToken, openid: token.openid });
    nickname = info.nickname;
    avatarUrl = info.headimgurl;
    unionid = unionid ?? info.unionid;
  } catch (err) {
    console.error("[wechat-callback] profile lookup failed:", reason(err));
  }

  try {
    let linkToUserId: string | null = null;
    if (tx.tx.m === "link") {
      // The transaction is already bound to this session's token hash; this only
      // resolves that token to the id the identity should hang off.
      const actor = await getCurrentUser();
      if (!actor) return fail("failed");
      linkToUserId = actor.id;
    }

    // Deliberately NOT `unionid ?? openid`: the unionid above is best effort, so
    // a key derived from it alone changes shape whenever /sns/userinfo is slow —
    // and a changed key means a new, empty account. wechatIdentityKey pairs the
    // canonical key with an anchor that every exchange produces. See the lookup
    // order documented on resolveProviderIdentity.
    const key = wechatIdentityKey({ appId: cfg.appId, openid: token.openid, unionid });

    const result = await resolveProviderIdentity(
      {
        provider: "wechat",
        appId: key.appId,
        subject: key.subject,
        providerKey: key.providerKey,
        priorKeys: key.priorKeys,
        // WeChat never returns an email; resolveProviderIdentity allocates a
        // random placeholder address for the account it creates.
        email: null,
        emailVerified: false,
        // Trimmed to the column limit by resolveProviderIdentity, which clamps
        // by code point so an emoji nickname is not cut mid-character.
        displayName: nickname,
        avatarUrl,
        // Reaching us through WeChat is a strong enough signal to beat the
        // schema's `en` default on a brand-new account.
        locale: "zh",
      },
      linkToUserId,
    );
    if (!result.ok) return fail(result.code);

    // A link flow already holds a valid session for this exact user, so minting
    // a second one would only orphan a row in `sessions`.
    if (!linkToUserId) await createSession(result.userId);

    return redirect(absoluteUrl(safeNextPath(tx.tx.n)));
  } catch (err) {
    console.error("[wechat-callback] sign-in failed:", reason(err));
    return fail("failed");
  }
}
