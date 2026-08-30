/**
 * `GET`, `PATCH` and `DELETE` on one template.
 *
 * The three verbs use two different scoping rules and the difference is the
 * point:
 *
 *  - `GET` resolves through `getTemplateForRead`, which admits this workspace's
 *    own rows, platform rows and `public` rows from any tenant.
 *  - `PATCH` and `DELETE` resolve through `getTemplateForWrite`, which admits
 *    `workspace_id = :ws` and nothing else. A platform row is readable by
 *    everyone and writable by no tenant; another tenant's public row reads and
 *    forks, it never PATCHes.
 *
 * A miss is 404, never 403, in every case. A 403 confirms the uuid exists
 * somewhere, which is a cross-tenant membership oracle (docs/API.md).
 *
 * Degradation: no model, no Agent Manager. All three verbs work with neither
 * configured.
 */
import { apiError, json, notFound, parseBody, requireAuth } from "@/lib/api";
import {
  archiveTemplate,
  getTemplateForRead,
  getTemplateForWrite,
  updateTemplate,
  workspaceSlugs,
} from "@/lib/atg/queries";
import { serializeTemplateCard, serializeTemplateDetail } from "@/lib/atg/serialize";
import { isUuid, updateTemplateSchema } from "@/lib/atg/validation";
import { remediateDraft, validateDraft } from "@/lib/atg/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  // A path segment that is not a uuid must not reach Postgres: the answer there
  // is `22P02 invalid input syntax for type uuid`, which is a 500 for what is
  // simply a bad URL.
  if (!isUuid(id)) return notFound("Template not found");

  const row = await getTemplateForRead(id, auth.ctx.workspace.id);
  if (!row || row.archivedAt) return notFound("Template not found");

  // A stored draft is re-validated on READ, not only on write: the row may have
  // been written by an older `schemaVersion`, and the review screen indexes
  // `draft.roles`, `draft.skills` and `draft.provenance.warnings` directly. A
  // half-shaped blob is the difference between "needs review" and a blank page.
  const check = validateDraft(row.draft);
  if (!check.ok) {
    return apiError("This template's draft is not readable by this version.", 409, {
      code: "draft_schema_mismatch",
    });
  }

  return json({
    template: serializeTemplateDetail({ ...row, draft: check.draft }, auth.ctx.workspace.id),
  });
}

/**
 * Edit a template this workspace owns.
 *
 * When the body carries a `draft`, it is re-linted before it is stored and every
 * denormalized card column is recomputed from it inside the same statement — a
 * gallery that advertises "1 skill · beginner" over a template that installs
 * nine is worse than one that shows nothing.
 *
 * `visibility: "public"` is accepted HERE and refused on create: publishing a
 * template to every other tenant is a deliberate act, not something that
 * happens while the user believes they are saving a private draft.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  if (!isUuid(id)) return notFound("Template not found");

  const parsed = await parseBody(req, updateTemplateSchema);
  if (parsed.res) return parsed.res;

  const existing = await getTemplateForWrite(id, auth.ctx.workspace.id);
  if (!existing) return notFound("Template not found");

  const patch = { ...parsed.data };
  if (patch.draft) {
    const slugs = (await workspaceSlugs(auth.ctx.workspace.id)).filter(
      (s) => s !== existing.slug,
    );
    const linted = remediateDraft(patch.draft, { existingSlugs: slugs });
    patch.draft = {
      ...linted.draft,
      provenance: {
        ...linted.draft.provenance,
        warnings: linted.warnings,
        materializable: linted.materializable,
      },
    };
  }

  const row = await updateTemplate(id, auth.ctx.workspace.id, patch);
  if (!row) return notFound("Template not found");
  return json({ template: serializeTemplateCard(row, auth.ctx.workspace.id) });
}

/**
 * Archive. Deliberately not a hard delete, and not a euphemism for one:
 * `agent_skills.origin_ref` and `template_generations.template_id` point at
 * this row, agents materialized from it are running, and the audit answer to
 * "where did this agent's skills come from" must survive someone tidying the
 * gallery. The gallery never shows an archived row; materialize still resolves
 * one, so a link a colleague sent yesterday still works.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  if (!isUuid(id)) return notFound("Template not found");

  const done = await archiveTemplate(id, auth.ctx.workspace.id);
  if (!done) {
    // Either it is not ours, or it was already archived. Both are 404: the
    // second is idempotent from the caller's point of view and the first must
    // not be distinguishable from it.
    const existing = await getTemplateForWrite(id, auth.ctx.workspace.id);
    if (!existing) return notFound("Template not found");
  }
  return json({ archived: true });
}
