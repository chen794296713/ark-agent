/**
 * The two constraints the draft schema makes *unrepresentable* rather than
 * merely checked: what URL a generated template may tell an agent runtime to
 * fetch, and what file type a generated `file_request` may ask a user for.
 *
 * Pure and client-safe on purpose — `lib/atg/schema.ts` imports both, and that
 * module is parsed in the browser by the template editor and in a plain `tsx`
 * script by the tests. No `server-only`, no env reads, no I/O.
 */

/**
 * What a generated `file_request` may ask for. The model proposes a mime type
 * and the model is influenced by the user's brief, so an allowlist is the
 * control: an `application/x-msdownload` in a template is a phishing lure with
 * a "required" badge on it.
 */
export const CONTEXT_MIME_ALLOWLIST = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/html",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
] as const;

export type ContextMimeType = (typeof CONTEXT_MIME_ALLOWLIST)[number];

/** What the linter substitutes when a model proposed nothing usable. */
export const DEFAULT_CONTEXT_MIME_TYPES: ContextMimeType[] = [
  "application/pdf",
  "text/markdown",
  "text/plain",
];

export function isContextMimeType(value: string): value is ContextMimeType {
  return (CONTEXT_MIME_ALLOWLIST as readonly string[]).includes(value);
}

/** 20 MB, matching `agent_context_items`' documented platform ceiling. */
export const CONTEXT_MAX_BYTES_CEILING = 20_000_000;
/** 10 MiB — what a generated `file_request` asks for unless told otherwise. */
export const CONTEXT_DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "ip6-localhost"]);

/** Dotted-quad only; an IPv4 in any other notation is rejected by `isIpv4Literal`. */
function ipv4Octets(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/**
 * Private, loopback, link-local, CGNAT, broadcast and "this network" space.
 * 169.254.0.0/16 is the one that matters most: `169.254.169.254` is the cloud
 * instance-metadata address, and a template carrying it is an SSRF payload with
 * our name on it.
 */
function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a >= 224) return true;
  return false;
}

/** `[::1]`, `[fe80::…]`, `[fc00::…]` and the IPv4-mapped forms. */
function isPrivateIpv6(host: string): boolean {
  const inner = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!inner.includes(":")) return false;
  if (inner === "::1" || inner === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(inner)) return true; // unique-local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(inner)) return true; // link-local fe80::/10
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(inner);
  if (mapped) {
    const octets = ipv4Octets(mapped[1]);
    return octets ? isPrivateIpv4(octets) : true;
  }
  return false;
}

/**
 * A URL an agent runtime may be told to fetch.
 *
 * ArkAgent never fetches it — that belongs to the runtime's egress sandbox —
 * but a template is a *persisted instruction* to fetch, so this is the one
 * layer of that defence we control. Blocked: anything but https, any userinfo
 * (`https://user:pw@host`), a non-default port, an IP literal in private /
 * loopback / link-local / CGNAT space, and the `localhost`, `*.local`,
 * `*.internal`, `*.home.arpa` name families.
 */
export function isSafePublicHttpsUrl(raw: string): boolean {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 500) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  // `username`/`password` survive a round-trip through the URL parser, so a
  // credential-bearing link would otherwise be stored verbatim and replayed.
  if (url.username || url.password) return false;
  // A non-default port on an https URL is nearly always an internal service.
  if (url.port && url.port !== "443") return false;

  const host = url.hostname.toLowerCase();
  if (!host) return false;
  if (BLOCKED_HOSTNAMES.has(host)) return false;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) {
    return false;
  }
  if (host.startsWith("[")) return !isPrivateIpv6(host);
  const octets = ipv4Octets(host);
  if (octets) return !isPrivateIpv4(octets);
  // A bare label with no dot ("intranet") resolves through the search domain on
  // most corporate networks, which is the same class of target as `.internal`.
  if (!host.includes(".")) return false;
  return true;
}
