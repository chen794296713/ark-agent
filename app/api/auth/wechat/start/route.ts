import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { absoluteUrl, safeNextPath } from "@/lib/app-url";
import { beginOAuthTransaction } from "@/lib/oauth/state";
import { authorizeUrl, resolveWechatConfig } from "@/lib/oauth/wechat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Session cookie name, duplicated from lib/auth.ts because it is not exported.
 * Only the raw token is needed here, to bind a `link` transaction to the caller.
 */
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "ark_session";

/**
 * Every response here is a one-shot: the Location carries a single-use `state`
 * and the response sets the matching transaction cookie. A shared cache holding
 * one would hand the next visitor a state whose cookie they do not have.
 */
function redirect(to: string): NextResponse {
  const res = NextResponse.redirect(to);
  res.headers.set("cache-control", "no-store, no-cache, must-revalidate, private");
  return res;
}

/**
 * GET /api/auth/wechat/start?next=/dashboard&mode=login|link
 *
 * A top-level navigation, never fetch(): the response is a cross-origin
 * redirect to WeChat, which no XHR can follow.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNextPath(url.searchParams.get("next"));
  const mode = url.searchParams.get("mode") === "link" ? "link" : "login";

  const cfg = resolveWechatConfig(req.headers.get("user-agent"));
  if (!cfg) return redirect(absoluteUrl("/auth?sso_error=unconfigured"));

  const jar = await cookies();
  const sessionToken = mode === "link" ? (jar.get(SESSION_COOKIE)?.value ?? null) : null;
  // A link flow with no session could only ever fail at the callback, where the
  // transaction is checked against the caller's session. Refusing here keeps
  // the user from bouncing through WeChat to reach that dead end.
  if (mode === "link" && !sessionToken) {
    return redirect(absoluteUrl("/auth?sso_error=failed"));
  }

  // WeChat has no PKCE: the transaction still mints a verifier, but no
  // code_challenge goes out and no verifier comes back at the callback.
  const { state } = await beginOAuthTransaction({
    provider: "wechat",
    mode,
    next,
    sessionToken,
  });

  return redirect(authorizeUrl({ surface: cfg.surface, state }));
}
