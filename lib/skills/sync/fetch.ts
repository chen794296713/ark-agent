import "server-only";

/**
 * The ONLY outbound request the app makes to a skill source.
 *
 * Everything about it is a control, not a convenience:
 *
 *  - **The allowlist is checked on the FINISHED URL.** Upstream-supplied
 *    `owner`, `slug`, `repo` and `cursor` values all end up inside these URLs,
 *    so an allowlist consulted before interpolation is not an allowlist. A
 *    cursor of `../../..@169.254.169.254/` re-parses to a different host, and
 *    `new URL()` is the only thing that knows that.
 *  - **`redirect: "manual"`.** A 302 to `169.254.169.254` (or to `localhost`)
 *    IS the SSRF; following it re-runs no check. A 3xx is refused outright.
 *  - **The body is bounded by a reader, not by `res.text()`.** ClawHub's
 *    `/file` endpoint returns raw `SKILL.md` bytes with no documented ceiling,
 *    and `res.text()` on an endless response is an out-of-memory kill on a
 *    serverless function. An overrun is `schema_drift`, and the truncation is
 *    recorded rather than hidden.
 *  - **Every request has a deadline.** No upstream may hold a Vercel function
 *    open until the platform kills it.
 *
 * Nothing here reads a user request. `GET /api/skills` never calls it: a slow or
 * hostile upstream can make our catalogue stale, and can never make a customer's
 * page hang.
 */

/**
 * Hosts we will talk to at all. This is a literal, deliberately: the base URL
 * comes from `skill_sources.api_base_url` so that DISABLING a source is a DB
 * update, but ADDING a host is a code review. A row in a table an admin can edit
 * must not be able to name a new egress target.
 */
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  "clawhub.ai",
  "api.github.com",
  "registry.modelcontextprotocol.io",
]);

/**
 * Path segments — owner, repo, slug, tag — are VALIDATED, never escaped. A slug
 * containing `..` or `/` is upstream drift and is skipped; sanitizing it into
 * something that looks valid is how a traversal becomes a request.
 */
export const SEGMENT = /^[A-Za-z0-9._-]{1,120}$/;

/** 512 KB. Static analysis runs on the truncated buffer, and says that it did. */
export const MAX_BODY_BYTES = 512 * 1024;

const TIMEOUT_MS = 15_000;

export type SyncErrorCode =
  | "host_not_allowed"
  | "redirect_refused"
  | "bad_segment"
  | "rate_limited"
  | "http_4xx"
  | "http_5xx"
  | "network"
  | "schema_drift"
  | "body_too_large";

/**
 * A normalized failure class. The upstream's own body NEVER travels in one of
 * these: `skill_sources.last_sync_error` is varchar(200) rendered in the admin
 * console, and pasting a third party's error page into our own UI just relocates
 * whatever was in it.
 */
export class SyncError extends Error {
  constructor(
    readonly code: SyncErrorCode,
    readonly retryAfterMs?: number,
  ) {
    super(code);
    this.name = "SyncError";
  }
}

/** Build a URL from a base and validated segments. Throws rather than sanitizing. */
export function upstreamUrl(base: string, path: string, segments: Record<string, string> = {}): URL {
  for (const value of Object.values(segments)) {
    if (!SEGMENT.test(value)) throw new SyncError("bad_segment");
  }
  const filled = path.replace(/\{(\w+)\}/g, (m, k: string) =>
    Object.hasOwn(segments, k) ? encodeURIComponent(segments[k]) : m,
  );
  // `new URL(relative, base)` and not string concatenation: a `path` beginning
  // `//evil.example` is a protocol-relative URL and concatenation would hand it
  // straight to fetch as a different origin. The constructor resolves it, and
  // the host check in `fetchUpstream` then sees what was actually built.
  //
  // EVERY leading slash goes, not just the first. Stripping one turns
  // `///evil.example` into `//evil.example`, which is still protocol-relative
  // and still re-hosts — a guard that is correct for exactly one spelling of the
  // input is not a guard.
  return new URL(filled.replace(/^\/+/, ""), base.endsWith("/") ? base : `${base}/`);
}

/**
 * `Retry-After` (seconds or HTTP-date), then `RateLimit-Reset` (delta seconds),
 * then `X-RateLimit-Reset` (absolute epoch seconds) — the order the three
 * upstreams document, and the order they are tried.
 */
export function retryAfterMs(res: Response, now = Date.now()): number | undefined {
  const ra = res.headers.get("retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs, 3600) * 1000;
    const at = Date.parse(ra);
    if (!Number.isNaN(at)) return Math.max(0, Math.min(at - now, 3_600_000));
  }
  const delta = Number(res.headers.get("ratelimit-reset"));
  if (Number.isFinite(delta) && delta >= 0) return Math.min(delta, 3600) * 1000;
  const epoch = Number(res.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(epoch) && epoch > 0) return Math.max(0, Math.min(epoch * 1000 - now, 3_600_000));
  return undefined;
}

/**
 * One request. Returns the `Response` with its body still unread — read it
 * through `readBounded` and never through `res.text()`.
 */
export async function fetchUpstream(url: URL, init: RequestInit = {}): Promise<Response> {
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new SyncError("host_not_allowed");
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        accept: "application/json",
        ...init.headers,
        "user-agent": "ArkAgent-SkillSync/1 (+https://arkagent.com)",
      },
    });
  } catch {
    // The thrown value is a platform error object; it is not carried forward.
    throw new SyncError("network");
  }
  if (res.status >= 300 && res.status < 400) throw new SyncError("redirect_refused");
  if (res.status === 429) throw new SyncError("rate_limited", retryAfterMs(res));
  if (res.status >= 500) throw new SyncError("http_5xx");
  if (res.status >= 400) throw new SyncError("http_4xx");
  return res;
}

/**
 * Read at most `max` bytes. Reports whether it truncated, because a risk score
 * derived from a partial body is honest only if the partiality is recorded.
 */
export async function readBounded(
  res: Response,
  max = MAX_BODY_BYTES,
): Promise<{ text: string; truncated: boolean }> {
  const body = res.body;
  if (!body) return { text: "", truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const room = max - size;
      if (value.byteLength >= room) {
        chunks.push(value.subarray(0, room));
        size = max;
        truncated = true;
        break;
      }
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    // Releasing the lock and cancelling the stream is what actually stops the
    // upstream sending; breaking out of the loop alone leaves the socket open
    // for the rest of the function's lifetime.
    await reader.cancel().catch(() => {});
  }
  const joined = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }
  return { text: new TextDecoder("utf-8").decode(joined), truncated };
}

/** JSON with the same bound. A schema failure upstream is drift, never a 500 here. */
export async function readJson(res: Response, max = MAX_BODY_BYTES): Promise<unknown> {
  const { text, truncated } = await readBounded(res, max);
  if (truncated) throw new SyncError("body_too_large");
  try {
    return JSON.parse(text);
  } catch {
    throw new SyncError("schema_drift");
  }
}
