import "server-only";

/**
 * WeChat as an ArkAgent **identity** provider — signing a person into ArkAgent.
 *
 * Not to be confused with app/api/channels/wechat/login/route.ts, which binds a
 * WeChat account to an *agent* as a messaging channel through the OpenClaw
 * Manager. The two share nothing but the word "WeChat".
 *
 * WeChat splits sign-in across two products with separate credentials, and a
 * given browser can complete only one of them:
 *   - 公众号 (Official Account) web OAuth runs *inside* WeChat's embedded
 *     browser, which announces itself with "MicroMessenger" in the User-Agent.
 *   - 网站应用 (Website App) QR login runs *outside* it: the page renders a QR
 *     code the user scans with the WeChat app on their phone.
 * The surface is therefore a property of the browser, not something the user
 * picks — which is also why the callback can re-derive it from the same header.
 */
import { absoluteUrl } from "@/lib/app-url";

/** `mp` = 公众号 web OAuth, `web` = 网站应用 QR login. */
export type WechatSurface = "mp" | "web";

export interface WechatConfig {
  surface: WechatSurface;
  appId: string;
  appSecret: string;
  /** The only scope each surface's authorize endpoint accepts for a profile. */
  scope: "snsapi_userinfo" | "snsapi_login";
  authorizeEndpoint: string;
}

/** Must match the WeChat console's authorized callback domain, byte for byte. */
export const WECHAT_CALLBACK_PATH = "/api/auth/wechat/callback";

const AUTHORIZE_ENDPOINT: Record<WechatSurface, string> = {
  mp: "https://open.weixin.qq.com/connect/oauth2/authorize",
  web: "https://open.weixin.qq.com/connect/qrconnect",
};

const SCOPE: Record<WechatSurface, WechatConfig["scope"]> = {
  mp: "snsapi_userinfo",
  web: "snsapi_login",
};

const API_ORIGIN = "https://api.weixin.qq.com";

/** Credentials for one surface, or null when that pair is not configured. */
export function wechatConfig(surface: WechatSurface): WechatConfig | null {
  const appId = (
    surface === "mp" ? process.env.WECHAT_MP_APP_ID : process.env.WECHAT_WEB_APP_ID
  )?.trim();
  const appSecret = (
    surface === "mp" ? process.env.WECHAT_MP_APP_SECRET : process.env.WECHAT_WEB_APP_SECRET
  )?.trim();
  if (!appId || !appSecret) return null;
  return {
    surface,
    appId,
    appSecret,
    scope: SCOPE[surface],
    authorizeEndpoint: AUTHORIZE_ENDPOINT[surface],
  };
}

/** True when at least one surface can run a flow. Drives /api/auth/sso. */
export function isWechatConfigured(): boolean {
  return wechatConfig("mp") !== null || wechatConfig("web") !== null;
}

/**
 * The surface this browser is capable of completing.
 *
 * Matched case-insensitively because the string also appears as "MicroMessenger"
 * inside the WeChat desktop client's UA, where the 公众号 flow works the same.
 */
export function pickSurface(userAgent: string | null | undefined): WechatSurface {
  return userAgent && /micromessenger/i.test(userAgent) ? "mp" : "web";
}

/**
 * The config a request should actually use: the surface the browser can run,
 * falling back to the other pair when only one is configured.
 *
 * The fallback is a real flow, not a degraded one — a deployment with only
 * 网站应用 credentials still signs an in-WeChat user in, they just scan the QR
 * from within the app instead of tapping through the inline sheet.
 */
export function resolveWechatConfig(userAgent: string | null | undefined): WechatConfig | null {
  const preferred = pickSurface(userAgent);
  return wechatConfig(preferred) ?? wechatConfig(preferred === "mp" ? "web" : "mp");
}

/**
 * The authorization URL to send the browser to.
 *
 * Assembled by hand rather than with URLSearchParams: WeChat's gateway expects
 * the parameters in this order and requires the literal `#wechat_redirect`
 * fragment to be last, after the whole query string.
 */
export function authorizeUrl(opts: { surface: WechatSurface; state: string }): string {
  const cfg = wechatConfig(opts.surface);
  if (!cfg) throw new Error(`WeChat ${opts.surface} credentials are not configured`);
  const query = [
    `appid=${encodeURIComponent(cfg.appId)}`,
    `redirect_uri=${encodeURIComponent(absoluteUrl(WECHAT_CALLBACK_PATH))}`,
    "response_type=code",
    `scope=${cfg.scope}`,
    `state=${encodeURIComponent(opts.state)}`,
  ].join("&");
  return `${cfg.authorizeEndpoint}?${query}#wechat_redirect`;
}

/**
 * A WeChat API refusal. `errmsg` is kept off `message` on purpose: the message
 * is what ends up in logs, and only the numeric code is needed to diagnose one.
 */
export class WechatApiError extends Error {
  readonly errcode: number;
  constructor(path: string, errcode: number) {
    super(`WeChat ${path} returned errcode ${errcode}`);
    this.name = "WechatApiError";
    this.errcode = errcode;
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * GET a WeChat sns endpoint and return its parsed body.
 *
 * Every message this throws names only the path — never the query string, which
 * carries the app secret, the authorization code and the access token.
 */
async function getSns(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = `${API_ORIGIN}${path}?${new URLSearchParams(params).toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      // WeChat's edge is an external dependency on the sign-in path; a hung
      // connection must not hold the invocation open to its full timeout.
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    // The rejection value can embed the request URL, secret and all, so it is
    // dropped rather than wrapped.
    throw new Error(`WeChat ${path} request failed`);
  }
  if (!res.ok) throw new Error(`WeChat ${path} returned HTTP ${res.status}`);

  // api.weixin.qq.com answers with `Content-Type: text/plain`, so the usual
  // content-type guard would reject every successful call.
  const text = await res.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`WeChat ${path} returned a non-JSON body`);
  }
  if (!payload || typeof payload !== "object") {
    throw new Error(`WeChat ${path} returned a non-object body`);
  }

  // Failures arrive as HTTP 200 with an {errcode, errmsg} body, so res.ok above
  // proves nothing on its own. Successful responses omit errcode entirely.
  const record = payload as Record<string, unknown>;
  const errcode = Number(record.errcode ?? 0);
  if (errcode !== 0) throw new WechatApiError(path, errcode);
  return record;
}

export interface WechatToken {
  accessToken: string;
  openid: string;
  /** Present only when the app belongs to an Open Platform (开放平台) account. */
  unionid: string | null;
  scope: string;
}

/** Trade the one-shot authorization code for an access token + openid. */
export async function exchangeCode(opts: {
  surface: WechatSurface;
  code: string;
}): Promise<WechatToken> {
  const cfg = wechatConfig(opts.surface);
  if (!cfg) throw new Error(`WeChat ${opts.surface} credentials are not configured`);
  const payload = await getSns("/sns/oauth2/access_token", {
    appid: cfg.appId,
    secret: cfg.appSecret,
    code: opts.code,
    grant_type: "authorization_code",
  });
  const accessToken = str(payload.access_token);
  const openid = str(payload.openid);
  if (!accessToken || !openid) {
    throw new Error("WeChat /sns/oauth2/access_token returned no openid");
  }
  return {
    accessToken,
    openid,
    unionid: str(payload.unionid),
    scope: str(payload.scope) ?? "",
  };
}

export interface WechatUserInfo {
  nickname: string | null;
  headimgurl: string | null;
  unionid: string | null;
}

/**
 * The public profile behind a token. Available under both `snsapi_userinfo` and
 * `snsapi_login`, but never under `snsapi_base` — which is why neither surface
 * requests that scope.
 */
export async function fetchUserInfo(opts: {
  accessToken: string;
  openid: string;
}): Promise<WechatUserInfo> {
  const payload = await getSns("/sns/userinfo", {
    access_token: opts.accessToken,
    openid: opts.openid,
    lang: "zh_CN",
  });
  return {
    nickname: str(payload.nickname),
    headimgurl: str(payload.headimgurl),
    unionid: str(payload.unionid),
  };
}

/**
 * The `app_id` a unionid-keyed identity is filed under.
 *
 * A unionid is shared by every app beneath one Open Platform account, so filing
 * it under the appid that happened to report it would put the same person in
 * two namespaces — one per surface — and hand them two ArkAgent accounts. This
 * sentinel is the namespace unionids live in instead. It is not a real appid,
 * and no real appid can collide with it: WeChat appids are `wx` + 16 hex
 * characters and contain no colon.
 */
export const WECHAT_UNIONID_NAMESPACE = "wechat:unionid";

/** How one WeChat sign-in maps onto `user_identities`. */
export interface WechatIdentityKey {
  /** `user_identities.app_id`. */
  appId: string;
  /** `user_identities.subject`. */
  subject: string;
  /** `user_identities.provider_key` — never changes for this (app, person). */
  providerKey: string;
  /**
   * Keys this same person may already be filed under, newest scheme first.
   * Empty unless a unionid is in hand, because the openid pair *is* canonical
   * when it is not.
   */
  priorKeys: ReadonlyArray<{ appId: string; subject: string }>;
}

/**
 * The identity key for one completed WeChat sign-in.
 *
 * openid is scoped to (person, app), so the same person carries a different one
 * on the 网站应用 and the 公众号; unionid is shared across every app under one
 * Open Platform account, and is therefore the better key whenever WeChat gives
 * us one — hence `WECHAT_UNIONID_NAMESPACE` above.
 *
 * The catch, and the reason `providerKey` exists: WeChat hands over the unionid
 * only when it feels like it. /sns/oauth2/access_token includes it only for an
 * Open Platform app, /sns/userinfo is rate-limited, and the caller treats that
 * lookup as best effort. So the canonical pair legitimately moves between
 * (appid, openid) and (unionid-namespace, unionid) across sign-ins by the same
 * person. `providerKey` is built only from values present in *every* successful
 * exchange, which makes it the one thread that always leads back to the row.
 *
 * `priorKeys` covers the rows already in the table: identities recorded before
 * the unionid namespace existed sit at (real appid, unionid) or (real appid,
 * openid) with no provider_key at all, and would otherwise fork on their first
 * sign-in after this change.
 */
export function wechatIdentityKey(source: {
  /** The appid the authorization code was actually minted under. */
  appId: string;
  openid: string;
  unionid: string | null;
}): WechatIdentityKey {
  const { appId, openid, unionid } = source;
  return {
    appId: unionid ? WECHAT_UNIONID_NAMESPACE : appId,
    subject: unionid ?? openid,
    providerKey: `${appId}:${openid}`,
    priorKeys: unionid
      ? [
          { appId, subject: unionid },
          { appId, subject: openid },
        ]
      : [],
  };
}
