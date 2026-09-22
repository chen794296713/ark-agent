import { json } from "@/lib/api";
import { isGoogleConfigured } from "@/lib/oauth/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const configured = (value: string | undefined) => Boolean(value?.trim());

/**
 * Which SSO providers the sign-in screen may offer.
 *
 * Unauthenticated on purpose — the buttons render before anyone has a session —
 * and it exposes only whether credentials exist, never any part of them. A
 * provider the deployment has not configured is better rendered disabled than
 * failing at the provider with an opaque error.
 *
 * WeChat is read straight from the environment rather than through
 * lib/oauth/wechat: answering a boolean should not pull a provider module (and
 * everything it imports) into this request path.
 */
export async function GET() {
  const wechat =
    (configured(process.env.WECHAT_WEB_APP_ID) && configured(process.env.WECHAT_WEB_APP_SECRET)) ||
    (configured(process.env.WECHAT_MP_APP_ID) && configured(process.env.WECHAT_MP_APP_SECRET));

  return json({ providers: { google: isGoogleConfigured(), wechat } });
}
