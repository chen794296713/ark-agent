/**
 * Request-body validation for the per-agent SKILLS and CONTEXT write paths.
 *
 * Client-safe (Zod only, no `server-only`): `./client.ts` builds the bodies this
 * parses and the manage screen wants the same caps for its character counters,
 * so the two cannot disagree about what 8,000 characters means.
 *
 * These schemas live here rather than in `lib/validation.ts` because that file
 * belongs to the integrator; the shared module re-exports whichever of them it
 * should carry.
 *
 * The SKILLS half is deliberately thin. `lib/skills/validation.ts` already
 * exports `attachSkillSchema` and `updateAgentSkillSchema`, written for exactly
 * these two routes — including the `.check()` that keeps secret-looking keys out
 * of `agent_skills.config`. They are re-exported here so a route has one import,
 * and NOT redefined, because a second copy of a security predicate is a second
 * place for it to drift.
 *
 * The CONTEXT half is new, and three of its rules are security rules rather
 * than shape rules:
 *
 *  1. A `url` item is checked with `isSafePublicHttpsUrl()` from
 *     `lib/atg/safety.ts`. ArkAgent NEVER fetches it — that is the agent
 *     runtime's egress sandbox — but the row is a *persisted instruction to
 *     fetch*, so refusing `http://169.254.169.254/…` at the point it is stored
 *     is the one layer of that defence the control plane owns.
 *  2. A `file` item's mime must be in `CONTEXT_MIME_ALLOWLIST`. The manage
 *     screen renders a "waiting for upload" row from it, and
 *     `application/x-msdownload` with a Required badge on it is a phishing lure
 *     with our chrome around it.
 *  3. Every body is `.strict()` and every text field is capped. `text_body` is
 *     `text` in Postgres — unbounded — and it is read back into a prompt, so the
 *     ceiling has to exist somewhere. Here is that somewhere.
 */
import { z } from "zod";
import {
  CONTEXT_MAX_BYTES_CEILING,
  CONTEXT_MIME_ALLOWLIST,
  isSafePublicHttpsUrl,
} from "@/lib/atg/safety";

export { attachSkillSchema, updateAgentSkillSchema } from "@/lib/skills/validation";
export type { AttachSkillInput } from "@/lib/skills/validation";

/**
 * The caps this vertical enforces.
 *
 * `MAX_TEXT_CHARS` matches `TemplateContextItem.body` (lib/atg/types.ts) on
 * purpose: a pasted item a generated template could produce must be one a
 * person can also paste, or the manage screen refuses to save what the create
 * flow just wrote.
 *
 * `MAX_TEXT_BYTES` is the SECOND ceiling and it is the one that actually binds
 * for non-Latin text. `.max()` on a Zod string counts UTF-16 code units;
 * `agent_context_items.bytes` counts BYTES, and that is what the column stores
 * and what the runtime budgets its context window against. 8,000 characters of
 * Japanese is 24,000 bytes, so a character-only cap would let one item cost
 * three times what the number in it suggests.
 *
 * The asymmetry is deliberate and worth naming: a zh/ja paste hits the ceiling
 * at roughly 6,600 characters where an English one runs to 8,000. Sizing the
 * byte cap at 3x the character cap instead would make the check unreachable —
 * a rule that can never fire is a rule that is not there — and the honest fix
 * for someone who needs more is a file item, which has a 20 MB allowance.
 */
export const CONTEXT_LIMITS = {
  /** Rows per agent, any state. The manage screen lists them all, unpaged. */
  MAX_ITEMS_PER_AGENT: 50,
  MAX_NAME_CHARS: 200,
  MAX_TEXT_CHARS: 8_000,
  MAX_TEXT_BYTES: 20_000,
  /** `agent_context_items.source_url` is `text`; `isSafePublicHttpsUrl` caps at 500. */
  MAX_URL_CHARS: 500,
  /** The platform ceiling a `file` row may declare. Enforced again at upload. */
  MAX_BYTES_CEILING: CONTEXT_MAX_BYTES_CEILING,
} as const;

/** Attachments per agent. A manifest the runtime has to install is not unbounded. */
export const MAX_SKILLS_PER_AGENT = 40;

export const CONTEXT_SCOPES = ["agent", "session"] as const;
export type ContextScope = (typeof CONTEXT_SCOPES)[number];

const nameSchema = z
  .string()
  .trim()
  .min(1, "a context item needs a name")
  .max(CONTEXT_LIMITS.MAX_NAME_CHARS);

const scopeSchema = z.enum(CONTEXT_SCOPES).optional().default("agent");

/**
 * The pasted body. `.trim()` is NOT applied — leading indentation is meaningful
 * in a pasted spec or snippet, and silently reflowing what someone pasted is a
 * change to their data made on their behalf. Only the two ceilings apply.
 */
const bodySchema = z
  .string()
  .min(1, "a pasted item needs some text")
  .max(CONTEXT_LIMITS.MAX_TEXT_CHARS)
  .refine((s) => byteLength(s) <= CONTEXT_LIMITS.MAX_TEXT_BYTES, {
    message: `text may be at most ${CONTEXT_LIMITS.MAX_TEXT_BYTES} bytes`,
  });

/**
 * UTF-8 byte length without `Buffer`.
 *
 * This module is imported by the browser bundle, where `Buffer` does not exist;
 * `TextEncoder` is in every runtime this app targets and gives the same number
 * the server will store in `agent_context_items.bytes`.
 */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * `https`, no userinfo, no odd port, not loopback / private / link-local / CGNAT
 * and not a `.local`, `.internal` or bare-label host.
 *
 * `z.url()` is not used even as a first pass: it accepts every one of the
 * addresses above, so a caller reading the schema would reasonably believe the
 * URL had been vetted when only its punctuation had been.
 */
const urlSchema = z
  .string()
  .trim()
  .max(CONTEXT_LIMITS.MAX_URL_CHARS)
  .refine(isSafePublicHttpsUrl, {
    message:
      "must be a public https:// URL — no credentials, no custom port, no private or link-local address",
  });

const mimeSchema = z.enum(CONTEXT_MIME_ALLOWLIST);

/**
 * POST /api/agents/:id/context.
 *
 * A discriminated union rather than one object with everything optional: the
 * three kinds have disjoint columns (`text_body` · `source_url` · `mime`), and
 * an object that permits `{ kind: "url", body: "..." }` is an object whose
 * handler has to decide what that means. Here it cannot be expressed.
 *
 * `state` is absent from all three. ArkAgent writes only the initial state —
 * `awaiting_upload` for a file, `pending` for text and url — and every later
 * transition (`indexing`, `indexed`, `failed`) is reported by the runtime.
 * Accepting one from a browser would let a caller mark an empty row `indexed`.
 */
export const createContextItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), name: nameSchema, body: bodySchema, scope: scopeSchema }).strict(),
  z.object({ kind: z.literal("url"), name: nameSchema, url: urlSchema, scope: scopeSchema }).strict(),
  z
    .object({
      kind: z.literal("file"),
      name: nameSchema,
      mime: mimeSchema,
      /**
       * The size the client SAYS the file is, used only to refuse an oversize
       * upload before it starts. It is not stored: the row is created in
       * `awaiting_upload`, where `bytes` is 0 because no bytes exist, and the
       * real length is written by the upload that follows. A declared number in
       * that column would be a size for a file nobody has sent.
       */
      declaredBytes: z.number().int().min(0).max(CONTEXT_LIMITS.MAX_BYTES_CEILING).optional(),
      scope: scopeSchema,
    })
    .strict(),
]);
export type CreateContextItemInput = z.infer<typeof createContextItemSchema>;

/**
 * PATCH /api/agents/:id/context/:itemId.
 *
 * `kind` is not editable. A row's kind decides which column carries its payload
 * and which state machine it is in; "change this file into a URL" is a delete
 * and a create, and pretending otherwise leaves a `text_body` attached to a row
 * the runtime will try to fetch.
 *
 * `body` and `url` are accepted here but are only legal on a row of the matching
 * kind. That check needs the stored row, so it lives in the service and returns
 * `context_kind_mismatch`; a schema cannot see the row it is validating.
 */
export const updateContextItemSchema = z
  .object({
    name: nameSchema.optional(),
    body: bodySchema.optional(),
    url: urlSchema.optional(),
    scope: z.enum(CONTEXT_SCOPES).optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: "nothing to update",
  });
export type UpdateContextItemInput = z.infer<typeof updateContextItemSchema>;

/** A uuid, or a 404. Shape only — the workspace check is the route's job. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}
