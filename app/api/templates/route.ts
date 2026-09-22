/**
 * `GET /api/templates` — the gallery. `POST /api/templates` — persist a draft.
 *
 * Auth: any authenticated session. The list is not public (an unauthenticated
 * crawl is a free competitor dataset), and it is not purely workspace-scoped
 * either: a template may be a platform row or another tenant's `public` one.
 * `lib/atg/queries.visibleTo` is the single predicate that decides which, and
 * nothing on this route may widen it.
 *
 * A malformed STRUCTURAL parameter (`page=1e9`) is a 400 — those bound the scan.
 * An unrecognised FILTER VALUE is dropped and echoed in `ignoredFilters`,
 * because every one of them otherwise reaches an `inArray` against a pgEnum and
 * comes back as a 500 carrying the enum's full value list.
 *
 * Degradation: neither verb calls a model or the Agent Manager. The gallery
 * works identically with no `OPENROUTER_API_KEY` and no Manager configured.
 */
import { apiError, json, parseBody, requireAuth } from "@/lib/api";
import {
  createTemplate,
  getGeneration,
  linkGenerationTemplate,
  listTemplates,
  workspaceSlugs,
} from "@/lib/atg/queries";
import { serializeTemplateCard, type TemplateListResponse } from "@/lib/atg/serialize";
import { createTemplateSchema, parseTemplateListQuery, TemplateQueryError } from "@/lib/atg/validation";
import { remediateDraft } from "@/lib/atg/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  let filters;
  try {
    filters = parseTemplateListQuery(new URL(req.url).searchParams);
  } catch (e) {
    if (e instanceof TemplateQueryError) return apiError(e.message, e.status, { code: e.code });
    throw e;
  }

  const page = await listTemplates(filters, auth.ctx.workspace.id);
  const body: TemplateListResponse = {
    templates: page.rows.map((row) => serializeTemplateCard(row, auth.ctx.workspace.id)),
    total: page.total,
    page: page.page,
    perPage: page.perPage,
    ...(filters.ignoredFilters.length ? { ignoredFilters: filters.ignoredFilters } : {}),
  };
  return json(body);
}

/**
 * Save a reviewed draft as a template.
 *
 * The draft is re-linted here even though the generator already linted it: the
 * review screen let a human edit every field between those two moments, and a
 * `provenance.materializable` that arrived in a request body is a claim, not a
 * fact. `remediateDraft` only ever moves in the restrictive direction, so
 * re-running it cannot grant something the editor did not have.
 *
 * `generationId` is verified against THIS workspace before it is stored. It is
 * an audit pointer; accepting an unvalidated uuid would make the audit trail
 * one that lies, and would let one tenant name another's generation.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  const parsed = await parseBody(req, createTemplateSchema);
  if (parsed.res) return parsed.res;

  const slugs = await workspaceSlugs(auth.ctx.workspace.id);
  const linted = remediateDraft(parsed.data.draft, { existingSlugs: slugs });

  let generationId: string | null = null;
  if (parsed.data.generationId) {
    const gen = await getGeneration(parsed.data.generationId, auth.ctx.workspace.id);
    generationId = gen?.id ?? null;
  }

  const row = await createTemplate({
    workspaceId: auth.ctx.workspace.id,
    createdById: auth.ctx.user.id,
    draft: {
      ...linted.draft,
      provenance: {
        ...linted.draft.provenance,
        warnings: linted.warnings,
        materializable: linted.materializable,
      },
    },
    generationId,
    visibility: parsed.data.visibility,
    ...(parsed.data.name ? { nameOverride: parsed.data.name } : {}),
  });

  if (generationId) await linkGenerationTemplate(generationId, row.id);

  return json(
    {
      template: serializeTemplateCard(row, auth.ctx.workspace.id),
      warnings: linted.warnings,
      materializable: linted.materializable,
    },
    201,
  );
}
