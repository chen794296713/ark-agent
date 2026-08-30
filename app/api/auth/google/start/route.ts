import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appUrl } from "@/lib/app-url";
import { authorizeUrl, isGoogleConfigured } from "@/lib/oauth/google";
import { beginOAuthTransaction } from "@/lib/oauth/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "ark_session";

/**
 * Hand the browser off to Google.
 *
 * This is a top-level navigation, never a fetch: the response is a redirect to
 * accounts.google.com, and `beginOAuthTransaction` sets an HttpOnly cookie that
 * has to reach the browser for the callback to be able to verify anything. Next
 * merges cookies written through `cookies()` into whatever Response the handler
 * returns (see `appendMutableCookies` in
 * next/dist/server/route-modules/app-route/module.js), so the Set-Cookie rides
 * along on the 307 — but only because we return the redirect rather than
 * streaming anything first.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "link" ? "link" : "login";

  if (!isGoogleConfigured()) return ssoError("unconfigured");

  let sessionToken: string | null = null;
  if (mode === "link") {
    const jar = await cookies();
    sessionToken = jar.get(SESSION_COOKIE)?.value ?? null;
    // A link flow has to be pinned to the session that started it, or the
    // callback has no honest answer to "whose account is this being grafted
    // onto?". Signed out, there is nothing to link to.
    if (!sessionToken) return ssoError("state");
  }

  const { state, codeChallenge } = await beginOAuthTransaction({
    provider: "google",
    mode,
    next: url.searchParams.get("next"),
    sessionToken,
  });

  return NextResponse.redirect(authorizeUrl({ state, codeChallenge }));
}

function ssoError(code: "unconfigured" | "state"): NextResponse {
  return NextResponse.redirect(new URL(`/auth?sso_error=${code}`, appUrl()));
}
