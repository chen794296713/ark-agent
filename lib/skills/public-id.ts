/**
 * The URL key we mint for every catalogue row.
 *
 * `publicId` is the identity every OTHER system holds: it is the key in a
 * template's skill list, in `AgentSettings.skills[]`, and in every
 * `/dashboard/skills?skill=…` URL. Once minted it never changes, which is why
 * the mint is a pure function with an asserted round-trip in
 * `tests/skills-catalog.test.ts` rather than a convention each caller repeats.
 *
 * The 160-character bound is a GUARANTEE, not a hope. `skills.public_id` is
 * varchar(160) and naive concatenation of the identity triple reaches
 * 40 + 1 + 80 + 1 + 120 = 242, so a long ClawHub slug would throw
 * `value too long` on the first sync insert. The truncation branch keeps the
 * function injective by hashing the FULL identity, not the truncated string.
 *
 * Not client-safe: `node:crypto`. Nothing that reaches the browser imports it —
 * the catalogue, the sync pipeline and the seeding script are all Node.
 */
import { createHash } from "node:crypto";

/**
 * Sources whose id already names the repository, so an owner segment would be
 * noise: `anthropic-skills-anthropics-pdf` reads worse than
 * `anthropic-skills-pdf` and carries no extra information. The row still stores
 * `ownerHandle: "anthropics"` — the identity unique index needs it — so this is
 * a property of the mint, not of the record.
 */
const SINGLE_NAMESPACE = new Set([
  "anthropic-skills",
  "openclaw-skills",
  "mcp-reference",
  "arkagent",
]);

/** lowercase · non-alphanumerics to `-` · squeeze · trim. */
export function slugifySegment(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * Mint the stable URL key for `(sourceId, ownerHandle, slug)`.
 *
 * The repeat-collapse runs over the PARTS, before joining — not over the joined
 * string's `-` segments. `("github", "github", "github-mcp-server")` collapses
 * the duplicated owner and yields `github-github-mcp-server`; collapsing the
 * joined string instead would give `github-mcp-server` and silently re-key
 * every row whose slug happens to start with its owner's name.
 */
export function mintPublicId(sourceId: string, ownerHandle: string, slug: string): string {
  const parts = [sourceId];
  if (ownerHandle && !SINGLE_NAMESPACE.has(sourceId)) parts.push(ownerHandle);
  parts.push(slug);
  const kept = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
  const base = slugifySegment(kept.join("-"));
  const digest = () => sha256Hex(`${sourceId}\u0000${ownerHandle}\u0000${slug}`);
  // A part with no ASCII alphanumerics at all — a CJK-titled skill is the
  // ordinary case, not a contrived one — slugifies away entirely, and the mint
  // silently degenerates to the identity of everything that survived. Testing
  // the JOINED result for emptiness (the obvious spelling, and the one this
  // guard used to have) only catches the case where EVERY part vanishes:
  // ("clawhub", "owner", "中文技能") keeps an ASCII source and owner, so it
  // minted the bare `clawhub-owner` — as did every other CJK-titled skill from
  // that publisher. `skills.public_id` is uniquely indexed, so the second such
  // row is either rejected forever or, on an upsert-by-public_id sync, silently
  // OVERWRITES the first. The test is therefore per part, and a lossy part
  // forces the identity digest into the key. The digest hashes the full triple,
  // never the surviving prefix, so the mint stays injective.
  const lossy = kept.some((p) => p.length > 0 && slugifySegment(p).length === 0);
  if (!base) return `skill-${digest().slice(0, 16)}`;
  if (lossy) return `${base.slice(0, 151)}-${digest().slice(0, 8)}`;
  if (base.length <= 160) return base;
  return `${base.slice(0, 151)}-${digest().slice(0, 8)}`;
}

/**
 * The disambiguating retry. A `publicId` collision is possible —
 * `(github, "github", github-mcp-server)` and `(github, "", github-mcp-server)`
 * both mint `github-github-mcp-server` — and overwriting the incumbent would
 * re-point every template and every `AgentSettings.skills[]` entry naming it.
 * On a unique violation the row is retried once with this, then skipped.
 *
 * The digest is SALTED, and the salt is load-bearing rather than decorative. An
 * identity long enough to trip the 160-char truncation already ends in the
 * unsalted digest of that same identity, so an unsalted retry recomputes the
 * same eight hex characters over the same 151-char stem and returns a string
 * byte-identical to `mintPublicId`'s — the retry would hit the very unique
 * violation it exists to escape and the row would be skipped for a collision it
 * had already resolved. A different salt guarantees a different tail at every
 * length.
 */
export function mintPublicIdWithDigest(
  sourceId: string,
  ownerHandle: string,
  slug: string,
): string {
  const digest = sha256Hex(`dedupe\u0000${sourceId}\u0000${ownerHandle}\u0000${slug}`).slice(0, 8);
  const base = mintPublicId(sourceId, ownerHandle, slug);
  return `${base.slice(0, 151)}-${digest}`;
}
