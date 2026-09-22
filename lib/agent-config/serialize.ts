/**
 * Row → DTO for the two agent-configuration child tables.
 *
 * `AgentSkillDTO` is NOT redefined here. `lib/skills/serialize.ts` already owns
 * `serializeAgentSkill`, including the AST07 risk-drift and AST10 harness-drift
 * computations; this module re-exports it so a route has one import and there is
 * one definition of what an attachment looks like on the wire.
 *
 * What is new is `ContextItemDTO`, and two of its rules are security rules:
 *
 *  1. **`content_url` is never serialized.** The column holds
 *     `…/api/runtime/context/{id}/content`, which is served against the agent's
 *     manifest token. It is addressed to the runtime, not to the browser, and a
 *     DTO that carries it hands every dashboard viewer the fetch path the VM
 *     uses. The DTO says `hasContent` instead — the only thing the UI needs.
 *  2. **`state_error` is third-party text.** The runtime writes it. It is
 *     bounded and stripped like any other remote string before it reaches a
 *     render.
 *
 * `text_body` is the workspace's OWN pasted content, so it is treated
 * differently from upstream text: newlines and indentation survive, because a
 * pasted spec that comes back reflowed is a document we damaged. Only control
 * characters, zero-width characters and bidi overrides are removed — the three
 * classes that hide text rather than format it.
 *
 * Client-safe: pure mapping over plain objects, no Drizzle import.
 */
import type { ContextItemKind, ContextItemState } from "@/lib/db/schema";
import type { ContextScope } from "./validation";

export { serializeAgentSkill } from "@/lib/skills/serialize";
export type { AgentSkillRowLike, SkillRowLike } from "@/lib/skills/serialize";
export type { AgentSkillDTO, AgentSkillListResponse, AttachSkillResponse } from "@/lib/skills/types";

/** How much of a pasted body the list view carries. The full text is on the item route. */
export const CONTEXT_PREVIEW_CHARS = 280;

export interface ContextItemDTO {
  id: string;
  kind: ContextItemKind;
  /** `agent_context_items.name` — a display title, never used as a path here. */
  name: string;
  mime: string | null;
  /** NOT NULL DEFAULT 0. Zero while `awaiting_upload`, which is not "an empty file". */
  bytes: number;
  sha256: string | null;
  /**
   * `kind: "url"` only. Rendered as TEXT, never as an `href`: it is a link the
   * AGENT was told to fetch, and turning it into something a dashboard user
   * clicks makes the operator the one who visits it.
   */
  sourceUrl: string | null;
  /** `kind: "text"` only — the first {@link CONTEXT_PREVIEW_CHARS} characters. */
  preview: string | null;
  /** True when a `text` row has a body, or a `file` row has bytes behind it. */
  hasContent: boolean;
  scope: ContextScope;
  state: ContextItemState;
  stateError: string | null;
  chunks: number | null;
  indexedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One item, with the whole pasted body. Only the single-item GET returns this. */
export interface ContextItemDetailDTO extends ContextItemDTO {
  /** `kind: "text"` only. Null on every other kind, and on a row with no body. */
  body: string | null;
}

/** The row shape the queries select. Structural, so Drizzle stays out of the browser. */
export interface ContextItemRowLike {
  id: string;
  kind: ContextItemKind;
  name: string;
  mime: string | null;
  bytes: number;
  sha256: string | null;
  contentUrl: string | null;
  textBody: string | null;
  sourceUrl: string | null;
  scope: string;
  state: ContextItemState;
  stateError: string | null;
  chunks: number | null;
  indexedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * The three classes that HIDE text rather than format it. Written as escapes and
 * built with `RegExp` rather than as literals, because two of them are invisible
 * in an editor and one of them (`\u0000`) is a NUL byte that turns this file
 * binary for `grep` — the same reason `lib/skills/safety.ts` spells them out.
 */
const ZERO_WIDTH = new RegExp("[\\u200B-\\u200D\\u2060\\uFEFF]", "g");
const BIDI = new RegExp("[\\u202A-\\u202E\\u2066-\\u2069]", "g");
/** Everything below 0x20 EXCEPT \t \n \r, plus DEL. Layout survives; smuggling does not. */
const CONTROL = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]", "g");

/**
 * Normalize the workspace's own pasted text for display.
 *
 * Deliberately weaker than `sanitizeSkillText`: that one collapses whitespace
 * and strips markup because it is handling a stranger's catalogue prose. This is
 * the customer's own document, headed for a prompt as DATA, and the useful
 * thing to remove is the invisible layer — not the formatting.
 */
export function normalizeContextText(raw: string, max: number): string {
  return raw.replace(ZERO_WIDTH, "").replace(BIDI, "").replace(CONTROL, "").slice(0, max);
}

/** Single-line fields (names, remote error strings): whitespace collapses too. */
function oneLine(raw: string, max: number): string {
  return normalizeContextText(raw, max * 2).replace(/\s+/g, " ").trim().slice(0, max);
}

const iso = (d: Date | string | null | undefined): string | null =>
  d === null || d === undefined ? null : d instanceof Date ? d.toISOString() : String(d);

const isoRequired = (d: Date | string | null | undefined): string =>
  iso(d) ?? new Date(0).toISOString();

/**
 * A `source_url` we are willing to put on screen.
 *
 * The column is `text` and rows exist that predate the write-time guard —
 * written by the template materializer, or by a migration. Re-checking on read
 * means a stored `javascript:` or `http://10.0.0.1/…` renders as nothing rather
 * than as a link the operator is invited to trust. Anything that is not
 * `https:` becomes null; `isSafePublicHttpsUrl` is NOT reused here because it
 * would erase a legitimate row the platform's rules tightened around, and the
 * UI would then show a `url` item with no url at all.
 */
function displayUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

function scopeOf(raw: string): ContextScope {
  return raw === "session" ? "session" : "agent";
}

export function serializeContextItem(row: ContextItemRowLike): ContextItemDTO {
  const body = row.kind === "text" ? row.textBody : null;
  return {
    id: row.id,
    kind: row.kind,
    name: oneLine(row.name, 200),
    mime: row.mime ? oneLine(row.mime, 120) : null,
    bytes: Number.isFinite(row.bytes) ? Math.max(0, Math.trunc(row.bytes)) : 0,
    // A digest or nothing. A 4KB string in a slot the UI labels "sha256" is a
    // claim about the bytes, and the column is written by the upload path.
    sha256: row.sha256 && /^[0-9a-f]{64}$/i.test(row.sha256) ? row.sha256.toLowerCase() : null,
    sourceUrl: row.kind === "url" ? displayUrl(row.sourceUrl) : null,
    preview: body ? normalizeContextText(body, CONTEXT_PREVIEW_CHARS) : null,
    // `content_url` itself stays behind: this is the one bit of it the UI needs.
    hasContent: row.kind === "text" ? Boolean(body) : Boolean(row.contentUrl),
    scope: scopeOf(row.scope),
    state: row.state,
    stateError: row.stateError ? oneLine(row.stateError, 300) : null,
    chunks: typeof row.chunks === "number" && Number.isFinite(row.chunks) ? row.chunks : null,
    indexedAt: iso(row.indexedAt),
    createdAt: isoRequired(row.createdAt),
    updatedAt: isoRequired(row.updatedAt),
  };
}

/** The detail payload. The full body is here and only here. */
export function serializeContextItemDetail(row: ContextItemRowLike): ContextItemDetailDTO {
  return {
    ...serializeContextItem(row),
    body:
      row.kind === "text" && row.textBody
        ? normalizeContextText(row.textBody, 200_000)
        : null,
  };
}

export interface ContextListResponse {
  items: ContextItemDTO[];
  /** How many rows still have no bytes — the "what this agent still needs" count. */
  awaitingUpload: number;
  /** `CONTEXT_LIMITS.MAX_ITEMS_PER_AGENT`, so the UI can disable Add at the cap. */
  limit: number;
}
