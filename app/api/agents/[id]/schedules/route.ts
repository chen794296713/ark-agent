/**
 * GET  /api/agents/[id]/schedules   — the list, plus the tick-health scalars
 * POST /api/agents/[id]/schedules   — create
 *
 * Authorization, on both and on every sibling route: requireAuth() ->
 * getAgentRow(id, ctx.workspace.id) -> notFound(). Cross-workspace is 404, NOT
 * 403 (docs/API.md) — a 403 confirms the id exists, which is a membership oracle
 * across tenants.
 *
 * Note what is NOT here: no 503. Creating a schedule is a Postgres write and
 * must succeed with no Agent Manager configured and no LLM key. Only DISPATCH
 * degrades.
 */
import { json, notFound, requireAuth, parseBody } from "@/lib/api";
import { getAgentRow } from "@/lib/services/agents";
import { createScheduleSchema } from "@/lib/schedules/validation";
import { serializeSchedule } from "@/lib/schedules/serialize";
import { createSchedule, listSchedules } from "@/lib/services/schedules";
import { isLang } from "@/lib/i18n";
import { scheduleErrorResponse } from "@/lib/schedules/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function langOf(req: Request) {
  const raw = new URL(req.url).searchParams.get("lang") ?? "en";
  return isLang(raw) ? raw : "en";
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  return json(await listSchedules(id, { lang: langOf(req) }));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  const agent = await getAgentRow(id, auth.ctx.workspace.id);
  if (!agent) return notFound("Agent not found");

  const parsed = await parseBody(req, createScheduleSchema);
  if (parsed.res) return parsed.res;

  try {
    const row = await createSchedule(
      { workspaceId: auth.ctx.workspace.id, agent },
      parsed.data,
      auth.ctx.user.id,
    );
    return json({ schedule: serializeSchedule(row, { lang: langOf(req) }) }, 201);
  } catch (e) {
    return scheduleErrorResponse(e, langOf(req));
  }
}
