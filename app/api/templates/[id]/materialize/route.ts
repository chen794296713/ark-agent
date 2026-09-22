/**
 * `POST /api/templates/{id}/materialize` — draft to real agent.
 *
 * `Idempotency-Key` is REQUIRED, and the 400 for a missing one is not
 * pedantry: this route hires an agent, opens a billing seat and asks an
 * external Manager for a VM, and a retry after a gateway timeout must not do
 * all three twice. The key is the caller's, held across retries;
 * `agents_idempotency_uniq (workspace_id, idempotency_key)` is what enforces
 * it, so two requests that race still produce one agent.
 *
 * A template from ANOTHER tenant may be materialized when it is `public` —
 * that is what publishing means — but the agent is created in the caller's
 * workspace and every id in the draft is re-resolved against the live
 * catalogue before anything is attached. A blocked skill is skipped and
 * reported in `skipped`, never installed because a stranger's template said so.
 *
 * `acceptWarnings` gates the `needs_review` case. The route re-lints the stored
 * draft rather than trusting `agent_templates.materializable`, because the
 * catalogue can re-score a skill between the review screen rendering and this
 * request arriving — and a warning that appeared in that window is one nobody
 * acknowledged.
 *
 * Degradation: with the Agent Manager unconfigured, every row is still written
 * and the response is `200 { provisioned: false, reason:
 * "agent_manager_unconfigured" }`. The agent exists, fully configured, and
 * provisioning becomes a later action rather than a lost one. No model is
 * called anywhere on this path, so `OPENROUTER_API_KEY` is irrelevant to it.
 */
import { apiError, json, notFound, parseBody, requireAuth } from "@/lib/api";
import { getTemplateForRead, markGenerationMaterialized } from "@/lib/atg/queries";
import { materializeTemplate, MaterializeError } from "@/lib/atg/materialize";
import { isUuid, materializeTemplateSchema, readIdempotencyKey } from "@/lib/atg/validation";
import { remediateDraft, validateDraft } from "@/lib/atg/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** One Agent Manager round trip plus one transaction. The Manager call is the
 *  slow half and it happens after the commit, so a timeout here leaves a
 *  recoverable agent rather than an orphaned VM. */
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  if (!isUuid(id)) return notFound("Template not found");

  const idempotencyKey = readIdempotencyKey(req);
  if (!idempotencyKey) {
    return apiError(
      "An Idempotency-Key header is required to materialize a template.",
      400,
      { code: "idempotency_key_required" },
    );
  }

  const parsed = await parseBody(req, materializeTemplateSchema);
  if (parsed.res) return parsed.res;

  // Readable, not writable: a public template belonging to another workspace is
  // a legitimate source. An archived one still resolves — a link a colleague
  // sent yesterday must still hire an agent.
  const template = await getTemplateForRead(id, auth.ctx.workspace.id);
  if (!template) return notFound("Template not found");

  const check = validateDraft(template.draft);
  if (!check.ok) {
    return apiError("This template's draft is not readable by this version.", 409, {
      code: "draft_schema_mismatch",
    });
  }

  // Re-linted HERE, against the catalogue as it is now. `remediateDraft` only
  // ever moves in the restrictive direction, so this can withdraw a capability
  // the template claimed but never grant one.
  const linted = remediateDraft(check.draft);
  const blocking = linted.warnings.filter((w) => w.severity === "error" && !w.remediated);
  const acked = new Set(parsed.data.acknowledgedWarnings);
  const unacknowledged = linted.warnings.filter(
    (w) => w.severity === "warn" && !w.remediated && !acked.has(w.code),
  );

  if (blocking.length > 0) {
    return apiError("This template cannot be materialized as it stands.", 409, {
      code: "not_materializable",
      warnings: blocking,
    });
  }
  if (unacknowledged.length > 0 && !parsed.data.acceptWarnings) {
    // 409 and the list, not a silent hire: the user is being asked to look at
    // something that changed since the review screen was drawn.
    return apiError("Some warnings have not been acknowledged.", 409, {
      code: "warnings_unacknowledged",
      warnings: unacknowledged,
    });
  }

  try {
    const result = await materializeTemplate({
      template,
      draft: {
        ...linted.draft,
        provenance: {
          ...linted.draft.provenance,
          warnings: linted.warnings,
          materializable: linted.materializable,
        },
      },
      workspaceId: auth.ctx.workspace.id,
      userId: auth.ctx.user.id,
      idempotencyKey,
      overrides: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.planTier ? { planTier: parsed.data.planTier } : {}),
        ...(parsed.data.channels ? { channels: parsed.data.channels } : {}),
      },
    });

    // Best effort and only for a template this workspace owns: a generation row
    // belongs to the tenant that ran it, and marking a stranger's generation
    // `materialized` because we used their published template would be a write
    // across the tenant boundary for a status nobody reads.
    if (!result.replayed && template.workspaceId === auth.ctx.workspace.id) {
      await markGenerationMaterialized(template.id, result.agent.id).catch(() => {});
    }

    return json({
      agent: {
        id: result.agent.id,
        name: result.agent.name,
        status: result.agent.status,
      },
      provisioned: result.provisioned,
      ...(result.reason ? { reason: result.reason } : {}),
      replayed: result.replayed,
      skipped: result.skipped,
    });
  } catch (e) {
    if (e instanceof MaterializeError) {
      return apiError(e.message, e.status, { code: e.code });
    }
    throw e;
  }
}
