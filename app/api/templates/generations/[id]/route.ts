/**
 * `GET /api/templates/generations/{id}` — the polling transport.
 *
 * The SSE stream is the primary way to watch a generation; this is the other
 * one, not a degraded copy of it. A corporate proxy that buffers
 * `text/event-stream` until the response closes turns the stream into a
 * ten-second blank screen, and a backgrounded tab has its `fetch` reader
 * throttled — in both cases the row in `template_generations` is still being
 * written stage by stage, and this route reads it.
 *
 * Scoped by workspace, always. A generation carries the customer's verbatim
 * brief and the injection findings from screening it; reading another tenant's
 * by uuid is exactly what the second argument to `getGeneration` prevents. A
 * miss is 404, never 403.
 *
 * The response is deliberately NOT the row: `serializeGeneration` drops
 * `brief`, `brief_sha256`, `correlation_id`, `user_id` and
 * `injection_findings`. The last is a list of the attack strings someone typed
 * into a text box; it belongs in the audit trail, not in a JSON body any
 * browser extension on the page can read.
 *
 * Degradation: no model, no Agent Manager, one indexed read.
 */
import { json, notFound, requireAuth } from "@/lib/api";
import { getGeneration } from "@/lib/atg/queries";
import { serializeGeneration } from "@/lib/atg/serialize";
import { isUuid } from "@/lib/atg/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAuth();
  if (auth.res) return auth.res;
  const { id } = await params;
  // A path segment that is not a uuid must not reach Postgres: the answer there
  // is `22P02 invalid input syntax for type uuid`, a 500 for what is a bad URL.
  if (!isUuid(id)) return notFound("Generation not found");

  const row = await getGeneration(id, auth.ctx.workspace.id);
  if (!row) return notFound("Generation not found");

  const res = json(serializeGeneration(row));
  // This body changes every second while a generation runs, and it carries a
  // customer's draft. `dynamic = "force-dynamic"` governs rendering, not
  // response caching, so an intermediary is otherwise free to hand one
  // workspace's poll to the next request.
  res.headers.set("cache-control", "no-store, no-cache, must-revalidate, private");
  return res;
}
