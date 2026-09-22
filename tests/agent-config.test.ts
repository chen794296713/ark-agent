/**
 * The per-agent SKILLS and CONTEXT write path: request validation and row → DTO.
 *
 * These are the parts that hold without a database. What they assert is the set
 * of claims the routes make in prose and would otherwise be free to stop
 * honouring:
 *
 *  - a `url` context item cannot store a link-local, loopback, private or
 *    credential-bearing address, because the AGENT RUNTIME is what fetches it;
 *  - a `file` context item cannot name a mime type outside
 *    `CONTEXT_MIME_ALLOWLIST`;
 *  - a pasted body is capped in BYTES as well as characters, so 8,000 characters
 *    of Japanese cannot become 24,000 bytes in a column the runtime budgets
 *    against;
 *  - the three kinds are disjoint — `{ kind: "url", body }` is unrepresentable,
 *    not merely ignored;
 *  - `content_url` never reaches a DTO, and the workspace's own pasted text
 *    keeps its newlines while losing the characters that hide text.
 *
 * The transaction-scoped `config_revision` bump is the other half of this
 * vertical and needs Postgres, so it is asserted structurally here: every
 * mutation in `lib/services/agent-config.ts` calls `bump(tx, …)` inside its own
 * `db.transaction`. A source assertion is a poor substitute for a running
 * database, but it is a far better one than a comment, and this is the exact
 * invariant a later edit is most likely to break — a child write that skips the
 * bump leaves the VM on a stale config with nothing anywhere to show for it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CONTEXT_LIMITS,
  MAX_SKILLS_PER_AGENT,
  byteLength,
  createContextItemSchema,
  isUuid,
  updateContextItemSchema,
} from "../lib/agent-config/validation";
import {
  CONTEXT_PREVIEW_CHARS,
  normalizeContextText,
  serializeContextItem,
  serializeContextItemDetail,
  type ContextItemRowLike,
} from "../lib/agent-config/serialize";
import { attachSkillSchema, updateAgentSkillSchema } from "../lib/skills/validation";

const create = (v: unknown) => createContextItemSchema.safeParse(v);
const patch = (v: unknown) => updateContextItemSchema.safeParse(v);

// ---------------------------------------------------------------------------
// Context: the URL guard
// ---------------------------------------------------------------------------

test("a url item accepts an ordinary public https link", () => {
  const r = create({ kind: "url", name: "Pricing page", url: "https://example.com/pricing" });
  assert.equal(r.success, true);
  assert.equal(r.success && r.data.scope, "agent");
});

test("a url item refuses every address the runtime must not be told to fetch", () => {
  // 169.254.169.254 is the one that matters: it is the cloud instance-metadata
  // endpoint, and a stored row naming it is an SSRF payload we persisted.
  for (const url of [
    "https://169.254.169.254/latest/meta-data/",
    "https://127.0.0.1/health",
    "https://10.0.0.5/internal",
    "https://192.168.1.1/",
    "https://172.16.4.4/",
    "https://100.64.0.1/",
    "https://[::1]/",
    "https://[fd00::1]/",
    "https://localhost/",
    "https://build.internal/artifacts",
    "https://printer.local/",
    "https://intranet/",
    "http://example.com/plain-http",
    "https://user:pw@example.com/",
    "https://example.com:8443/",
    "javascript:fetch('/')",
    "file:///etc/passwd",
  ]) {
    assert.equal(create({ kind: "url", name: "x", url }).success, false, url);
  }
});

test("a url longer than the column's guard is refused, not truncated", () => {
  const long = `https://example.com/${"a".repeat(600)}`;
  assert.equal(create({ kind: "url", name: "x", url: long }).success, false);
});

// ---------------------------------------------------------------------------
// Context: file registration
// ---------------------------------------------------------------------------

test("a file item is restricted to the mime allowlist", () => {
  assert.equal(create({ kind: "file", name: "Q3.pdf", mime: "application/pdf" }).success, true);
  // A "required" badge on an executable is a phishing lure wearing our chrome.
  assert.equal(
    create({ kind: "file", name: "setup", mime: "application/x-msdownload" }).success,
    false,
  );
  assert.equal(create({ kind: "file", name: "x", mime: "text/plain; charset=utf-8" }).success, false);
});

test("a declared file size above the platform ceiling is refused up front", () => {
  const ok = create({
    kind: "file",
    name: "big.pdf",
    mime: "application/pdf",
    declaredBytes: CONTEXT_LIMITS.MAX_BYTES_CEILING,
  });
  assert.equal(ok.success, true);
  const tooBig = create({
    kind: "file",
    name: "big.pdf",
    mime: "application/pdf",
    declaredBytes: CONTEXT_LIMITS.MAX_BYTES_CEILING + 1,
  });
  assert.equal(tooBig.success, false);
});

// ---------------------------------------------------------------------------
// Context: text bodies are capped twice
// ---------------------------------------------------------------------------

test("a pasted body is capped in characters", () => {
  assert.equal(
    create({ kind: "text", name: "Spec", body: "a".repeat(CONTEXT_LIMITS.MAX_TEXT_CHARS) }).success,
    true,
  );
  assert.equal(
    create({ kind: "text", name: "Spec", body: "a".repeat(CONTEXT_LIMITS.MAX_TEXT_CHARS + 1) })
      .success,
    false,
  );
});

test("and in BYTES, which is the number the column and the runtime use", () => {
  // Well inside the character cap, well past the byte cap: `.max()` counts UTF-16
  // code units and `agent_context_items.bytes` counts bytes.
  const cjk = "文".repeat(Math.ceil(CONTEXT_LIMITS.MAX_TEXT_BYTES / 3) + 100);
  assert.ok(cjk.length <= CONTEXT_LIMITS.MAX_TEXT_CHARS, "must be under the character cap");
  assert.ok(byteLength(cjk) > CONTEXT_LIMITS.MAX_TEXT_BYTES, "and over the byte cap");
  assert.equal(create({ kind: "text", name: "x", body: cjk }).success, false);
});

test("byteLength agrees with Buffer, which is what the server stores", () => {
  for (const s of ["ascii", "文字", "🙂 emoji", "a\nb\tc"]) {
    assert.equal(byteLength(s), Buffer.byteLength(s, "utf8"), s);
  }
});

test("a pasted body keeps its own leading whitespace", () => {
  // Indentation is meaningful in a pasted snippet; silently reflowing what
  // someone pasted is a change to their data made on their behalf.
  const r = create({ kind: "text", name: "Snippet", body: "  indented\n\tline" });
  assert.equal(r.success && r.data.kind === "text" && r.data.body, "  indented\n\tline");
});

// ---------------------------------------------------------------------------
// Context: the kinds are disjoint, and unknown keys are refused
// ---------------------------------------------------------------------------

test("a kind cannot carry another kind's payload", () => {
  assert.equal(create({ kind: "url", name: "x", url: "https://a.example", body: "hi" }).success, false);
  assert.equal(create({ kind: "text", name: "x", body: "hi", url: "https://a.example" }).success, false);
  assert.equal(create({ kind: "file", name: "x", mime: "application/pdf", body: "hi" }).success, false);
});

test("state is not something a browser may set", () => {
  // ArkAgent writes the initial state and nothing else; `indexed` is the
  // runtime's word for "the bytes are here and chunked".
  assert.equal(
    create({ kind: "text", name: "x", body: "hi", state: "indexed" }).success,
    false,
  );
  assert.equal(patch({ name: "x", state: "indexed" }).success, false);
  assert.equal(patch({ kind: "url" }).success, false);
});

test("an empty PATCH is refused rather than answered with a no-op success", () => {
  assert.equal(patch({}).success, false);
  assert.equal(patch({ name: "Renamed" }).success, true);
  assert.equal(patch({ url: "https://169.254.169.254/" }).success, false);
});

test("a name is required and bounded", () => {
  assert.equal(create({ kind: "text", name: "   ", body: "hi" }).success, false);
  assert.equal(
    create({ kind: "text", name: "n".repeat(CONTEXT_LIMITS.MAX_NAME_CHARS + 1), body: "hi" }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const row = (over: Partial<ContextItemRowLike> = {}): ContextItemRowLike => ({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "text",
  name: "Pricing notes",
  mime: "text/plain",
  bytes: 12,
  sha256: null,
  contentUrl: null,
  textBody: "line one\nline two",
  sourceUrl: null,
  scope: "agent",
  state: "pending",
  stateError: null,
  chunks: null,
  indexedAt: null,
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
  updatedAt: new Date("2026-01-02T03:04:05.000Z"),
  ...over,
});

test("content_url never reaches the DTO — only the fact that content exists", () => {
  const dto = serializeContextItem(
    row({
      kind: "file",
      textBody: null,
      mime: "application/pdf",
      contentUrl: "https://app.arkagent.com/api/runtime/context/abc/content",
      state: "indexed",
      bytes: 4096,
    }),
  );
  assert.equal(hasValue(dto, "runtime/context"), false);
  assert.equal(dto.hasContent, true);
  assert.equal("contentUrl" in dto, false);
});

test("an awaiting_upload row reports no content and no bytes", () => {
  const dto = serializeContextItem(
    row({ kind: "file", textBody: null, contentUrl: null, state: "awaiting_upload", bytes: 0 }),
  );
  assert.equal(dto.hasContent, false);
  assert.equal(dto.bytes, 0);
  assert.equal(dto.preview, null);
});

test("the list carries a bounded preview; the detail carries the whole body", () => {
  const body = "x".repeat(CONTEXT_PREVIEW_CHARS + 500);
  assert.equal(serializeContextItem(row({ textBody: body })).preview?.length, CONTEXT_PREVIEW_CHARS);
  assert.equal(serializeContextItemDetail(row({ textBody: body })).body?.length, body.length);
  // A url row has no body to leak into either field.
  const urlRow = row({ kind: "url", textBody: "leftover", sourceUrl: "https://a.example/doc" });
  assert.equal(serializeContextItem(urlRow).preview, null);
  assert.equal(serializeContextItemDetail(urlRow).body, null);
});

test("a stored source_url that is no longer safe to show renders as nothing", () => {
  // Rows written before the write-time guard existed, or by a migration.
  assert.equal(serializeContextItem(row({ kind: "url", sourceUrl: "javascript:alert(1)" })).sourceUrl, null);
  assert.equal(serializeContextItem(row({ kind: "url", sourceUrl: "http://a.example/" })).sourceUrl, null);
  assert.equal(
    serializeContextItem(row({ kind: "url", sourceUrl: "https://a.example/doc" })).sourceUrl,
    "https://a.example/doc",
  );
});

test("the runtime's error string is bounded and flattened", () => {
  const dto = serializeContextItem(row({ stateError: `fetch failed\n${"y".repeat(900)}` }));
  assert.ok(dto.stateError);
  assert.ok(dto.stateError.length <= 300);
  assert.equal(dto.stateError.includes("\n"), false);
});

test("a sha256 slot holds a digest or nothing", () => {
  assert.equal(serializeContextItem(row({ sha256: "not a digest" })).sha256, null);
  const digest = "A".repeat(64).replace(/A/g, "a");
  assert.equal(serializeContextItem(row({ sha256: digest })).sha256, digest);
});

test("pasted text keeps its layout and loses only the characters that hide text", () => {
  const ZWSP = "\u200B";
  const RLO = "\u202E";
  const NUL = "\u0000";
  const hidden = `visible${ZWSP}text${RLO}reversed${NUL}nul\nsecond line`;
  const clean = normalizeContextText(hidden, 1000);
  assert.equal(clean.includes(ZWSP), false);
  assert.equal(clean.includes(RLO), false);
  assert.equal(clean.includes(NUL), false);
  // The newline is layout, not concealment.
  assert.equal(clean.includes("\n"), true);
  assert.equal(clean, "visibletextreversednul\nsecond line");
});

test("an unknown scope collapses to agent rather than reaching the UI", () => {
  assert.equal(serializeContextItem(row({ scope: "everything" })).scope, "agent");
  assert.equal(serializeContextItem(row({ scope: "session" })).scope, "session");
});

// ---------------------------------------------------------------------------
// Skills: the schemas these routes are required to reuse
// ---------------------------------------------------------------------------

test("the attach body never defaults an acknowledgement or an assertion to true", () => {
  const r = attachSkillSchema.safeParse({ publicId: "clawhub/acme/thing", version: "1.2.0" });
  assert.equal(r.success, true);
  assert.equal(r.success && r.data.riskAcknowledged, false);
  assert.equal(r.success && r.data.compatAsserted, false);
  assert.equal(r.success && r.data.enabled, true);
});

test("the attach body has no keys for the server-set audit fields", () => {
  const r = attachSkillSchema.safeParse({
    publicId: "clawhub/acme/thing",
    version: "1.2.0",
    origin: "template",
    originRef: "22222222-2222-4222-8222-222222222222",
    state: "installed",
    installSource: "live",
  });
  // Zod objects strip unknown keys rather than failing, so the assertion that
  // matters is that none of them survive into what the service writes.
  assert.equal(r.success, true);
  if (r.success) {
    for (const k of ["origin", "originRef", "state", "installSource"]) {
      assert.equal(k in r.data, false, k);
    }
  }
});

test("a secret-looking config key is refused: the runtime holds the secret", () => {
  const base = { publicId: "clawhub/acme/thing", version: "1.2.0" };
  assert.equal(attachSkillSchema.safeParse({ ...base, config: { GH_HOST: "github.com" } }).success, true);
  for (const k of ["GH_TOKEN", "api_key", "clientSecret", "PASSWORD", "appsecret"]) {
    assert.equal(attachSkillSchema.safeParse({ ...base, config: { [k]: "x" } }).success, false, k);
  }
  assert.equal(updateAgentSkillSchema.safeParse({ config: { SLACK_TOKEN: "x" } }).success, false);
  assert.equal(updateAgentSkillSchema.safeParse({}).success, false);
  assert.equal(updateAgentSkillSchema.safeParse({ enabled: false }).success, true);
});

test("a version is required, because a floating pin is not a pin", () => {
  assert.equal(attachSkillSchema.safeParse({ publicId: "clawhub/acme/thing" }).success, false);
});

// ---------------------------------------------------------------------------
// Shape guards and caps
// ---------------------------------------------------------------------------

test("a non-uuid path segment is rejected before it reaches a uuid column", () => {
  assert.equal(isUuid("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid("' or 1=1--"), false);
  assert.equal(isUuid(""), false);
});

test("the caps are finite and small enough to bound a page", () => {
  assert.ok(CONTEXT_LIMITS.MAX_ITEMS_PER_AGENT > 0 && CONTEXT_LIMITS.MAX_ITEMS_PER_AGENT <= 200);
  assert.ok(MAX_SKILLS_PER_AGENT > 0 && MAX_SKILLS_PER_AGENT <= 200);
  assert.ok(CONTEXT_LIMITS.MAX_TEXT_BYTES >= CONTEXT_LIMITS.MAX_TEXT_CHARS);
});

// ---------------------------------------------------------------------------
// The config_revision invariant, asserted against the source
// ---------------------------------------------------------------------------

const SERVICE = readFileSync(
  fileURLToPath(new URL("../lib/services/agent-config.ts", import.meta.url)),
  "utf8",
);

test("every transaction in the service bumps config_revision inside itself", () => {
  // The runtime polls `agents.config_revision`; a child-table write that skips
  // the bump leaves the VM on a stale config with no signal anywhere.
  const blocks = SERVICE.split("db.transaction(").slice(1);
  assert.ok(blocks.length >= 5, "expected a transaction per mutation");
  for (const [i, block] of blocks.entries()) {
    assert.ok(block.includes("await bump(tx,"), `transaction ${i} does not bump the revision`);
  }
});

test("the bump is a SQL increment, never a read-then-write", () => {
  // `configRevision: current + 1` computed in JS loses one of two concurrent
  // writes and the runtime never learns about the loser.
  assert.match(SERVICE, /configRevision: sql`\$\{agents\.configRevision\} \+ 1`/);
});

test("the service never fetches a user-supplied context URL", () => {
  // The agent's egress sandbox fetches it, on its own VM. A control plane that
  // followed the link would be the SSRF primitive the sandbox exists to contain,
  // and "just a HEAD request to validate it" is how that arrives.
  assert.equal(/\bfetch\s*\(/.test(SERVICE), false);
});

/** Does any string anywhere in the DTO contain `needle`? Catches a field added later. */
function hasValue(obj: unknown, needle: string): boolean {
  return JSON.stringify(obj).includes(needle);
}
