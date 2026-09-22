import "server-only";
/**
 * The write path for two of the six template sections: an agent's SKILLS and its
 * CONTEXT items. Everything the routes under `/api/agents/[id]/{skills,context}`
 * do to the database happens here.
 *
 * THE ONE RULE THIS MODULE EXISTS FOR
 * ----------------------------------
 * Every mutation bumps `agents.config_revision` **in the same transaction as the
 * child-table write**. That number is the manifest revision the runtime polls
 * and the ETag it compares (`lib/db/schema.ts`, `agents.configRevision`). A
 * skill attached, disabled or detached — or a context item added or removed —
 * without that bump leaves the VM running yesterday's configuration with no
 * signal anywhere that it is behind: the row is in Postgres, the dashboard draws
 * it, and the agent never hears about it. Bumping it *after* the transaction is
 * the same bug with a smaller window, which is why `bump()` is called inside
 * every `db.transaction` below and never outside one.
 *
 * SCOPING
 * -------
 * Nothing here takes an agent id on trust. Every exported function requires the
 * caller to have already resolved the agent inside the session's workspace
 * (`getAgentRow(id, ctx.workspace.id)`), and every statement is additionally
 * keyed on that `agentId`, so a leaked child-row uuid from another tenant
 * matches zero rows rather than one. `skills` and `skill_sources` are a GLOBAL
 * catalogue with no `workspace_id` by design; the tenant boundary in this
 * vertical runs through `agent_skills.agent_id -> agents.workspace_id`.
 *
 * DEGRADATION
 * -----------
 * With no `OPENROUTER_API_KEY`: unaffected. Nothing here calls a model.
 * With the Agent Manager unconfigured or in mock mode: also unaffected — every
 * function below is a Postgres write. `attachSkill` records `install_source`
 * ("mock" when the Manager is mocked) and reports the Manager's mode back to the
 * caller as `runtime`, so the UI can say "saved, but nothing will install yet"
 * instead of pretending a pending row is an installed one. There is no 503 on
 * this surface: configuring an agent must work before the agent has a VM.
 */
import { and, count, eq, inArray, or, sql } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import {
  agentContextItems,
  agentSkills,
  agents,
  skills,
  type Agent,
} from "@/lib/db/schema";
import { agentManagerMode } from "@/lib/agent-manager";
import { isSafePublicHttpsUrl } from "@/lib/atg/safety";
import { mergeSettings, type AgentSettings, type StoredAgentSettings } from "@/lib/agent-settings";
import type { Harness } from "@/lib/harness";
import { compatFor } from "@/lib/skills/harness";
import type { AttachSkillInput } from "@/lib/skills/validation";
import type { z } from "zod";
import type { updateAgentSkillSchema } from "@/lib/skills/validation";
import type {
  AgentSkillDTO,
  AgentSkillListResponse,
  AttachSkillResponse,
  SkillPermissions,
} from "@/lib/skills/types";
import { serializeAgentSkill, type SkillRowLike } from "@/lib/skills/serialize";
import {
  serializeContextItem,
  serializeContextItemDetail,
  type ContextItemDTO,
  type ContextItemDetailDTO,
  type ContextItemRowLike,
  type ContextListResponse,
} from "@/lib/agent-config/serialize";
import {
  CONTEXT_LIMITS,
  MAX_SKILLS_PER_AGENT,
  byteLength,
  type CreateContextItemInput,
  type UpdateContextItemInput,
} from "@/lib/agent-config/validation";

type UpdateAgentSkillInput = z.infer<typeof updateAgentSkillSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * One error type for both halves, carrying the HTTP status AND a machine `code`.
 *
 * The code is the contract with the browser: this module owns no i18n file, and
 * an English sentence is not a message a zh/zht/ja operator can read. The route
 * returns `{ error, code, ...detail }` and the manage screen renders its own
 * localized string from `code`, falling back to `error` only when it does not
 * recognise one — the same split `lib/schedules/errors.ts` makes between the
 * user's string and the developer's.
 *
 * The status split is deliberate. 409 is a CONFLICT with the agent's current
 * state — already attached, at the cap — and is retryable after changing that
 * state. 422 is an UNPROCESSABLE input and is retryable only after editing the
 * request. A client that retries a 409 unchanged is being reasonable; one that
 * retries a 422 unchanged is looping.
 */
export class AgentConfigError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: Record<string, unknown> | undefined;
  constructor(code: string, message: string, status = 422, detail?: Record<string, unknown>) {
    super(message);
    this.name = "AgentConfigError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/**
 * `AgentConfigError` -> HTTP, shared by all four routes in this vertical.
 *
 * It lives here rather than in a route file because a Next.js route module may
 * only export HTTP verbs and the route-segment config; an exported helper there
 * is a build-time type error, and copying the mapping into four files is how the
 * four answers drift apart.
 *
 * An unexpected throw is logged and answered with a bare 500. A driver's message
 * can carry a fragment of the statement that produced it, and that statement
 * carries ids belonging to this workspace.
 */
export function agentConfigErrorResponse(e: unknown) {
  if (e instanceof AgentConfigError) {
    return apiError(e.message, e.status, { code: e.code, ...(e.detail ?? {}) });
  }
  console.error("[agent-config] unexpected error", e);
  return apiError("Something went wrong.", 500, { code: "unknown" });
}

// ---------------------------------------------------------------------------
// The bump
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The half that is easy to forget. Called inside every transaction below, on the
 * SAME `tx` as the child write, so the two commit together or not at all.
 */
async function bump(tx: Tx, agentId: string): Promise<void> {
  await tx
    .update(agents)
    .set({ configRevision: sql`${agents.configRevision} + 1`, updatedAt: new Date() })
    .where(eq(agents.id, agentId));
}

// ---------------------------------------------------------------------------
// Skills — reads
// ---------------------------------------------------------------------------

/** The catalogue columns an attachment DTO needs. Named, so `scanner_verdict` cannot join it. */
const catalogueColumns = {
  id: skills.id,
  publicId: skills.publicId,
  slug: skills.slug,
  ownerHandle: skills.ownerHandle,
  name: skills.name,
  summary: skills.summary,
  category: skills.category,
  format: skills.format,
  tags: skills.tags,
  harnesses: skills.harnesses,
  harnessCompat: skills.harnessCompat,
  riskLevel: skills.riskLevel,
  license: skills.license,
  licenseVerified: skills.licenseVerified,
  verified: skills.verified,
  popularity: skills.popularity,
  stars: skills.stars,
  downloads: skills.downloads,
  sourceId: skills.sourceId,
  publisherName: skills.publisherName,
  publisherVerified: skills.publisherVerified,
  attributionUrl: skills.attributionUrl,
  latestVersion: skills.latestVersion,
  upstreamUpdatedAt: skills.upstreamUpdatedAt,
  status: skills.status,
} as const;

/** The attachment columns. `config` is absent on purpose — see `serializeAgentSkill`. */
const attachmentColumns = {
  id: agentSkills.id,
  skillId: agentSkills.skillId,
  version: agentSkills.version,
  harness: agentSkills.harness,
  compatAsserted: agentSkills.compatAsserted,
  enabled: agentSkills.enabled,
  state: agentSkills.state,
  installError: agentSkills.installError,
  installSource: agentSkills.installSource,
  riskLevelAtAttach: agentSkills.riskLevelAtAttach,
  riskAcknowledged: agentSkills.riskAcknowledged,
  origin: agentSkills.origin,
  createdAt: agentSkills.createdAt,
  installedAt: agentSkills.installedAt,
  lastVerifiedAt: agentSkills.lastVerifiedAt,
} as const;

const TOOL_IDS = ["shell", "files", "browser", "docker", "code"] as const;
type ToolId = (typeof TOOL_IDS)[number];

/** `permissions.tools` off the jsonb column, reduced to the five ids that exist. */
function requiredTools(permissions: unknown): ToolId[] {
  if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) return [];
  const raw = (permissions as { tools?: unknown }).tools;
  if (!Array.isArray(raw)) return [];
  return TOOL_IDS.filter((t) => raw.includes(t));
}

function settingsOf(agent: Agent): AgentSettings {
  return mergeSettings(agent.settings as StoredAgentSettings | null);
}

/**
 * The attached set, plus the tool gaps.
 *
 * `toolGaps` is the union of local-execution tools the ENABLED attachments
 * declare that this agent has switched off. It is computed here rather than in
 * the browser because it needs `skills.permissions`, which the card DTO
 * deliberately does not carry: a skill that needs `shell` on an agent with shell
 * off will fail on the VM, and the operator should learn that from the
 * dashboard, not from an install error twenty minutes later.
 */
export async function listAgentSkills(agent: Agent): Promise<AgentSkillListResponse> {
  const rows = await db
    .select({
      attachment: attachmentColumns,
      skill: catalogueColumns,
      permissions: skills.permissions,
    })
    .from(agentSkills)
    .innerJoin(skills, eq(skills.id, agentSkills.skillId))
    // Scoped by agent id, and the agent was already scoped by workspace.
    .where(eq(agentSkills.agentId, agent.id))
    .orderBy(agentSkills.createdAt);

  const tools = settingsOf(agent).tools;
  const gaps = new Set<string>();
  for (const r of rows) {
    if (!r.attachment.enabled) continue;
    for (const t of requiredTools(r.permissions)) if (!tools[t]) gaps.add(t);
  }

  return {
    items: rows.map((r) =>
      serializeAgentSkill(r.attachment, r.skill as SkillRowLike, agent.engine as Harness),
    ),
    toolGaps: TOOL_IDS.filter((t) => gaps.has(t)),
  };
}

/**
 * Resolve one attachment within one agent.
 *
 * The route segment is `[skillId]` and both readings of that are accepted: the
 * ATTACHMENT id (`agent_skills.id`, what the DTO's `id` field carries) and the
 * CATALOGUE id (`agent_skills.skill_id`, what a caller holding a skill row has).
 * Both are uuids, both are matched only within this agent, and the pair is
 * unique per agent, so the disjunction can never widen the result beyond the one
 * row. Accepting only the first would make the segment's name a lie.
 */
async function findAttachment(agentId: string, key: string) {
  const [row] = await db
    .select({ attachment: attachmentColumns, skill: catalogueColumns })
    .from(agentSkills)
    .innerJoin(skills, eq(skills.id, agentSkills.skillId))
    .where(
      and(
        eq(agentSkills.agentId, agentId),
        or(eq(agentSkills.id, key), eq(agentSkills.skillId, key)),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Skills — writes
// ---------------------------------------------------------------------------

/** `agentManagerMode()` in the vocabulary `AttachSkillResponse.runtime` declares. */
function runtimeLabel(): string {
  const mode = agentManagerMode();
  return mode === "unconfigured" ? "unsupported" : mode;
}

/** Every version string this row admits: the current one, plus the known history. */
function knownVersionStrings(row: { latestVersion: string; knownVersions: unknown }): Set<string> {
  const out = new Set<string>([row.latestVersion]);
  if (Array.isArray(row.knownVersions)) {
    for (const v of row.knownVersions.slice(0, 100)) {
      if (v && typeof v === "object" && typeof (v as { version?: unknown }).version === "string") {
        out.add((v as { version: string }).version);
      }
    }
  }
  return out;
}

/**
 * Attach one catalogue skill to one agent.
 *
 * The gates, in order, and why each is here rather than in the browser:
 *
 *  - **visibility** — `draft` and `blocked` rows are a 404, not a 403. A
 *    distinguishable answer turns this route into a way to enumerate what is
 *    sitting in the review queue.
 *  - **blocked-at-attach** — re-checked here and not only when the catalogue was
 *    rendered. A version that was clean when the drawer opened can be withdrawn
 *    before Save is pressed, and installing it anyway makes the catalogue's
 *    verdict decorative.
 *  - **version pinned to a real string** — the body's `version` must be the
 *    current one or one this row has actually published. Free text in that
 *    column is an unfalsifiable pin, and the OWASP AST07 control is that the
 *    exact string that was SCORED is the string that gets installed.
 *  - **risk acknowledgement** — a `high` skill needs `riskAcknowledged: true`,
 *    explicitly, from the request. `attachSkillSchema` defaults it FALSE and
 *    this never infers it. (SKILL_REPOSITORY §6.5.)
 *  - **harness assertion** — if the catalogue does not say the skill supports
 *    this agent's engine, `compatAsserted: true` must be present. OWASP AST10:
 *    a skill audited under one harness's sandbox assumptions is not
 *    automatically safe under another's, and a silent `true` here is the bug.
 *
 * The row is written `state: "pending"`. ArkAgent installs nothing; only the
 * runtime can, and it reports `installing`/`installed`/`failed` back. Writing
 * anything else would be this control plane claiming an outcome it cannot
 * observe.
 */
export async function attachSkill(
  agent: Agent,
  input: AttachSkillInput,
  addedById: string | null,
): Promise<AttachSkillResponse> {
  const [row] = await db
    .select()
    .from(skills)
    .where(eq(skills.publicId, input.publicId))
    .limit(1);

  if (!row || row.status === "draft") {
    throw new AgentConfigError("skill_not_found", "No such skill.", 404);
  }
  if (row.blocked || row.status === "blocked") {
    throw new AgentConfigError(
      "skill_blocked",
      "This skill has been withdrawn and cannot be attached.",
      409,
    );
  }
  if (!knownVersionStrings(row).has(input.version)) {
    throw new AgentConfigError(
      "skill_version_unknown",
      "That version is not one this skill has published.",
      422,
      { latestVersion: row.latestVersion },
    );
  }
  if (row.riskLevel === "high" && !input.riskAcknowledged) {
    throw new AgentConfigError(
      "risk_ack_required",
      "This is a high-risk skill. It can only be attached with an explicit acknowledgement.",
      422,
      { riskLevel: row.riskLevel },
    );
  }

  const harness = agent.engine as Harness;
  const compat = compatFor(
    (row.harnessCompat ?? {}) as Parameters<typeof compatFor>[0],
    harness,
  );
  if (!compat.supported && !input.compatAsserted) {
    throw new AgentConfigError(
      "compat_not_asserted",
      "This skill is not known to run on this agent's harness. Attaching it requires an explicit compatibility assertion.",
      422,
      { harness, basis: compat.basis },
    );
  }

  const item = await db.transaction(async (tx) => {
    // Serialises this agent's attaches so two concurrent requests cannot both
    // read 39 and both insert. Transaction-scoped and keyed on the agent, so it
    // blocks nothing else in the system.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${agent.id}::text, 0))`);

    const [n] = await tx
      .select({ n: count() })
      .from(agentSkills)
      .where(eq(agentSkills.agentId, agent.id));
    if (Number(n?.n ?? 0) >= MAX_SKILLS_PER_AGENT) {
      throw new AgentConfigError(
        "skill_limit_reached",
        "This agent already has the maximum number of skills.",
        409,
        { limit: MAX_SKILLS_PER_AGENT },
      );
    }

    const inserted = await tx
      .insert(agentSkills)
      .values({
        agentId: agent.id,
        skillId: row.id,
        // PINNED. Validated above against what this row has actually published.
        version: input.version,
        harness,
        compatAsserted: input.compatAsserted === true,
        enabled: input.enabled !== false,
        // Only the runtime can install anything, so this is the only state we write.
        state: "pending",
        installSource: agentManagerMode() === "mock" ? "mock" : "live",
        riskLevelAtAttach: row.riskLevel,
        riskAcknowledged: input.riskAcknowledged === true,
        acknowledgedById: input.riskAcknowledged === true ? addedById : null,
        config: input.config ?? {},
        // Denormalized identity: the contract tells the runtime that a skill IS
        // this 4-tuple and that it must never join our catalogue, and
        // `agent.skill_state` correlates on exactly these fields.
        sourceRef: row.sourceId,
        ownerHandle: row.ownerHandle,
        slug: row.slug,
        // SERVER-SET, all three. `origin`/`originRef` are audit fields, and an
        // unvalidated client-supplied uuid in an audit field is an audit field
        // that lies — which is why `attachSkillSchema` has no such keys to read.
        origin: "manual",
        originRef: null,
        addedById,
      })
      // Covers BOTH unique indexes — (agent, skill) and the 4-tuple identity —
      // so the duplicate check is the insert itself rather than a read that
      // another transaction can invalidate between the two statements.
      .onConflictDoNothing()
      .returning(attachmentColumns);

    if (!inserted.length) {
      throw new AgentConfigError(
        "already_attached",
        "This skill is already attached to this agent.",
        409,
      );
    }
    await bump(tx, agent.id);
    return inserted[0];
  });

  const tools = settingsOf(agent).tools;
  const needed = requiredTools(row.permissions as SkillPermissions);
  return {
    item: serializeAgentSkill(item, row as SkillRowLike, harness),
    // The tools this skill needs that the agent already has ON. Nothing here
    // FLIPS a switch: agent settings belong to the settings route, and silently
    // enabling `shell` because a skill asked for it is a privilege escalation
    // performed on the operator's behalf. The complement is `toolGaps`.
    toolsEnabled: needed.filter((t) => tools[t]),
    runtime: runtimeLabel(),
  };
}

/**
 * PATCH one attachment: the two switches an operator owns.
 *
 * `state`, `version`, `harness` and every audit field are absent from
 * `updateAgentSkillSchema` and are not writable here. Re-pinning a version in
 * place would silently swap what is installed under an unchanged risk snapshot;
 * that is a detach and a fresh attach, which re-runs every gate above.
 */
export async function updateAgentSkill(
  agent: Agent,
  key: string,
  input: UpdateAgentSkillInput,
): Promise<AgentSkillDTO | null> {
  const found = await findAttachment(agent.id, key);
  if (!found) return null;

  const patch: { enabled?: boolean; config?: Record<string, string>; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.config !== undefined) patch.config = input.config;

  const updated = await db.transaction(async (tx) => {
    const [r] = await tx
      .update(agentSkills)
      .set(patch)
      // Both predicates, always: the id alone would be enough only if the row
      // had already been proven to belong to this agent by this same statement.
      .where(and(eq(agentSkills.id, found.attachment.id), eq(agentSkills.agentId, agent.id)))
      .returning(attachmentColumns);
    if (!r) return null;
    // Enabling or disabling a skill IS a manifest change: the runtime installs
    // the enabled set, so a flip the revision does not record is a flip the VM
    // never performs.
    await bump(tx, agent.id);
    return r;
  });
  if (!updated) return null;
  return serializeAgentSkill(updated, found.skill as SkillRowLike, agent.engine as Harness);
}

export type DetachOutcome = "deleted" | "removing";

/**
 * Detach.
 *
 * Two behaviours, because there are two situations and one answer to both is
 * wrong:
 *
 *  - the attachment never reached the VM (`pending`, `failed`, `removed`, or an
 *    `installSource` of "mock"): nothing exists out there to uninstall, so the
 *    row is DELETED. Leaving a `removing` row that no runtime will ever confirm
 *    is a permanent entry in the operator's list that no button can clear.
 *  - it did (`installing`, `installed`): the row is marked `removing` and
 *    disabled. ArkAgent writes `pending` and `removing` and nothing else; the
 *    runtime uninstalls the bytes and reports `removed`. Deleting our row first
 *    would leave the skill on disk with no record that it is there.
 */
export async function detachAgentSkill(
  agent: Agent,
  key: string,
): Promise<DetachOutcome | null> {
  const found = await findAttachment(agent.id, key);
  if (!found) return null;

  const live =
    found.attachment.installSource !== "mock" &&
    (found.attachment.state === "installing" || found.attachment.state === "installed");

  return db.transaction(async (tx) => {
    const where = and(eq(agentSkills.id, found.attachment.id), eq(agentSkills.agentId, agent.id));
    if (live) {
      const [r] = await tx
        .update(agentSkills)
        .set({ state: "removing", enabled: false, updatedAt: new Date() })
        .where(where)
        .returning({ id: agentSkills.id });
      if (!r) return null;
    } else {
      const [r] = await tx.delete(agentSkills).where(where).returning({ id: agentSkills.id });
      if (!r) return null;
    }
    await bump(tx, agent.id);
    return live ? "removing" : "deleted";
  });
}

// ---------------------------------------------------------------------------
// Context items
// ---------------------------------------------------------------------------

/** Named, so `content_url` cannot reach a DTO by accident. It is selected and then dropped. */
const contextColumns = {
  id: agentContextItems.id,
  kind: agentContextItems.kind,
  name: agentContextItems.name,
  mime: agentContextItems.mime,
  bytes: agentContextItems.bytes,
  sha256: agentContextItems.sha256,
  contentUrl: agentContextItems.contentUrl,
  textBody: agentContextItems.textBody,
  sourceUrl: agentContextItems.sourceUrl,
  scope: agentContextItems.scope,
  state: agentContextItems.state,
  stateError: agentContextItems.stateError,
  chunks: agentContextItems.chunks,
  indexedAt: agentContextItems.indexedAt,
  createdAt: agentContextItems.createdAt,
  updatedAt: agentContextItems.updatedAt,
} as const;

/**
 * The list.
 *
 * `removed` rows are excluded: the state is terminal and a tombstone in the
 * operator's list is an item they cannot act on. They stay in the table because
 * the runtime needs to see the transition on its next manifest poll.
 */
export async function listContextItems(agentId: string): Promise<ContextListResponse> {
  const rows = await db
    .select(contextColumns)
    .from(agentContextItems)
    .where(and(eq(agentContextItems.agentId, agentId), inArray(agentContextItems.state, [
      "awaiting_upload",
      "pending",
      "indexing",
      "indexed",
      "failed",
    ])))
    .orderBy(agentContextItems.createdAt);

  const items = (rows as ContextItemRowLike[]).map(serializeContextItem);
  return {
    items,
    awaitingUpload: items.filter((i) => i.state === "awaiting_upload").length,
    limit: CONTEXT_LIMITS.MAX_ITEMS_PER_AGENT,
  };
}

export async function getContextItem(
  agentId: string,
  itemId: string,
): Promise<ContextItemDetailDTO | null> {
  const [row] = await db
    .select(contextColumns)
    .from(agentContextItems)
    .where(and(eq(agentContextItems.id, itemId), eq(agentContextItems.agentId, agentId)))
    .limit(1);
  return row ? serializeContextItemDetail(row as ContextItemRowLike) : null;
}

/**
 * Create one context item.
 *
 * The three kinds and their initial states:
 *
 *  - `text` → `pending`. The body is stored inline and `bytes` is its real UTF-8
 *    length, because that is the number the runtime budgets against. It is
 *    UNTRUSTED user content headed for a prompt as DATA, never as an instruction
 *    to the runtime service.
 *  - `url`  → `pending`, with `source_url` set. **ArkAgent does not fetch it.**
 *    The agent's egress sandbox does, on its own VM. What this control plane
 *    owes is the guard on what gets stored, and `isSafePublicHttpsUrl` (applied
 *    by the schema, re-applied here) is that guard: a row that named
 *    `169.254.169.254` would be an SSRF payload we persisted and handed to the
 *    runtime with our own signature on it.
 *  - `file` → `awaiting_upload`, with `bytes = 0` and `content_url = null`,
 *    because no bytes exist yet. The schema is explicit that the runtime must
 *    skip such a row silently rather than fetch a null URL. The client's
 *    `declaredBytes` is used to refuse an oversize upload up front and is NOT
 *    stored; a size for a file nobody has sent is a lie in a column the UI
 *    renders.
 */
export async function createContextItem(
  agentId: string,
  input: CreateContextItemInput,
): Promise<ContextItemDTO> {
  // Re-checked outside the schema so a future caller that builds the input
  // itself — the template materializer's edit path, a migration — cannot skip
  // the one control the control plane owns over this column.
  if (input.kind === "url" && !isSafePublicHttpsUrl(input.url)) {
    throw new AgentConfigError(
      "context_url_unsafe",
      "That URL cannot be stored: it must be a public https:// address.",
      422,
    );
  }

  const values = (() => {
    const base = { agentId, name: input.name, scope: input.scope };
    if (input.kind === "text") {
      const bytes = byteLength(input.body);
      if (bytes > CONTEXT_LIMITS.MAX_TEXT_BYTES) {
        throw new AgentConfigError("context_body_too_large", "That text is too long.", 422, {
          bytes,
          limit: CONTEXT_LIMITS.MAX_TEXT_BYTES,
        });
      }
      return {
        ...base,
        kind: "text" as const,
        mime: "text/plain",
        textBody: input.body,
        sourceUrl: null,
        bytes,
        state: "pending" as const,
      };
    }
    if (input.kind === "url") {
      return {
        ...base,
        kind: "url" as const,
        mime: null,
        textBody: null,
        sourceUrl: input.url,
        bytes: 0,
        state: "pending" as const,
      };
    }
    return {
      ...base,
      kind: "file" as const,
      mime: input.mime,
      textBody: null,
      sourceUrl: null,
      bytes: 0,
      // Only the template generator and this path write this state; the runtime
      // never does, and must skip the row until the upload lands.
      state: "awaiting_upload" as const,
    };
  })();

  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${agentId}::text, 0))`);
    const [n] = await tx
      .select({ n: count() })
      .from(agentContextItems)
      .where(
        and(
          eq(agentContextItems.agentId, agentId),
          inArray(agentContextItems.state, [
            "awaiting_upload",
            "pending",
            "indexing",
            "indexed",
            "failed",
          ]),
        ),
      );
    if (Number(n?.n ?? 0) >= CONTEXT_LIMITS.MAX_ITEMS_PER_AGENT) {
      throw new AgentConfigError(
        "context_limit_reached",
        "This agent already has the maximum number of context items.",
        409,
        { limit: CONTEXT_LIMITS.MAX_ITEMS_PER_AGENT },
      );
    }
    const [inserted] = await tx.insert(agentContextItems).values(values).returning(contextColumns);
    // A context item is part of the manifest the runtime indexes. Same rule.
    await bump(tx, agentId);
    return inserted;
  });

  return serializeContextItem(row as ContextItemRowLike);
}

/**
 * PATCH one item.
 *
 * `kind` and `state` are not writable — the first decides which column holds the
 * payload and which state machine the row is in, the second belongs to the
 * runtime. A `body` on a `url` row or a `url` on a `text` row is a 422 rather
 * than a silently ignored field, because a save that reports success and changes
 * nothing is the worst of the three possible answers.
 *
 * Editing the payload sends the row back to `pending`: the indexed chunks
 * describe the OLD text, and leaving the row `indexed` would tell the runtime
 * its index is current when the bytes underneath it have changed.
 */
export async function updateContextItem(
  agentId: string,
  itemId: string,
  input: UpdateContextItemInput,
): Promise<ContextItemDetailDTO | null> {
  const [existing] = await db
    .select({ id: agentContextItems.id, kind: agentContextItems.kind })
    .from(agentContextItems)
    .where(and(eq(agentContextItems.id, itemId), eq(agentContextItems.agentId, agentId)))
    .limit(1);
  if (!existing) return null;

  if (input.body !== undefined && existing.kind !== "text") {
    throw new AgentConfigError(
      "context_kind_mismatch",
      "Only a pasted-text item has a body to edit.",
      422,
      { kind: existing.kind },
    );
  }
  if (input.url !== undefined && existing.kind !== "url") {
    throw new AgentConfigError(
      "context_kind_mismatch",
      "Only a URL item has a link to edit.",
      422,
      { kind: existing.kind },
    );
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.scope !== undefined) patch.scope = input.scope;
  if (input.body !== undefined) {
    const bytes = byteLength(input.body);
    if (bytes > CONTEXT_LIMITS.MAX_TEXT_BYTES) {
      throw new AgentConfigError("context_body_too_large", "That text is too long.", 422, {
        bytes,
        limit: CONTEXT_LIMITS.MAX_TEXT_BYTES,
      });
    }
    patch.textBody = input.body;
    patch.bytes = bytes;
    patch.state = "pending";
    patch.stateError = null;
    patch.chunks = null;
    patch.indexedAt = null;
    patch.sha256 = null;
  }
  if (input.url !== undefined) {
    if (!isSafePublicHttpsUrl(input.url)) {
      throw new AgentConfigError(
        "context_url_unsafe",
        "That URL cannot be stored: it must be a public https:// address.",
        422,
      );
    }
    patch.sourceUrl = input.url;
    patch.state = "pending";
    patch.stateError = null;
    patch.chunks = null;
    patch.indexedAt = null;
  }

  const row = await db.transaction(async (tx) => {
    const [r] = await tx
      .update(agentContextItems)
      .set(patch)
      .where(and(eq(agentContextItems.id, itemId), eq(agentContextItems.agentId, agentId)))
      .returning(contextColumns);
    if (!r) return null;
    await bump(tx, agentId);
    return r;
  });
  return row ? serializeContextItemDetail(row as ContextItemRowLike) : null;
}

/**
 * Delete one item.
 *
 * Same two-behaviour split as detaching a skill, for the same reason. A row that
 * never produced an index (`awaiting_upload`, `pending`, `failed`) is deleted
 * outright — there is nothing on the VM to retract. A row the runtime has
 * indexed is marked `removed`, which is the terminal state it watches for, so it
 * drops the chunks on its next poll. Hard-deleting that one leaves retrievable
 * text in an agent's index with no record anywhere that it is there.
 */
export async function deleteContextItem(
  agentId: string,
  itemId: string,
): Promise<DetachOutcome | null> {
  const [existing] = await db
    .select({ id: agentContextItems.id, state: agentContextItems.state })
    .from(agentContextItems)
    .where(and(eq(agentContextItems.id, itemId), eq(agentContextItems.agentId, agentId)))
    .limit(1);
  if (!existing) return null;

  const indexed = existing.state === "indexing" || existing.state === "indexed";

  return db.transaction(async (tx) => {
    const where = and(eq(agentContextItems.id, itemId), eq(agentContextItems.agentId, agentId));
    if (indexed) {
      const [r] = await tx
        .update(agentContextItems)
        .set({ state: "removed", updatedAt: new Date() })
        .where(where)
        .returning({ id: agentContextItems.id });
      if (!r) return null;
    } else {
      const [r] = await tx.delete(agentContextItems).where(where).returning({
        id: agentContextItems.id,
      });
      if (!r) return null;
    }
    await bump(tx, agentId);
    return indexed ? "removing" : "deleted";
  });
}
