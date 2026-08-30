/**
 * GET | POST /api/cron/schedules — the tick.
 *
 * Both verbs, one handler. Vercel Cron issues a GET; the integration tests and
 * any external pinger use POST. Neither is public: both are guarded by
 * `Bearer CRON_SECRET`, compared with `timingSafeEqual`, and the check FAILS
 * CLOSED when the secret is unset — without it this endpoint is an
 * unauthenticated agent trigger on a public URL, and anyone could pin a
 * workspace's credits at zero.
 *
 * `x-vercel-cron` is NOT accepted as authentication. It is a client-settable
 * header on a public URL. It is read only to label the ledger row.
 *
 * **Safe to call twice.** Everything the tick does is either idempotent (the
 * claim's lease predicate, the occurrence insert's unique index) or ledgered.
 * Two concurrent invocations slide past each other on `SKIP LOCKED` rather than
 * blocking, and neither can dispatch the other's occurrence.
 *
 * Status codes: 200 always, INCLUDING when individual schedules failed — those
 * live in the counters and in `agent_schedule_runs`, not in the HTTP status,
 * because Vercel retries a 500 and a retried tick is a second fire attempt. 500
 * is reserved for a failure OUTSIDE the per-schedule loop.
 */
import { apiError, json } from "@/lib/api";
import { tickRequestSchema } from "@/lib/schedules/validation";
import { authorizeTick, runTick } from "@/lib/services/schedules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * MUST stay below SCHEDULER_LEASE_SECONDS (default 300). If the lease were
 * shorter than this ceiling, a tick still legitimately working could have its
 * claim stolen by the next tick and the same occurrence dispatched twice — G2
 * defeated by configuration. tests/schedules-service.test.ts asserts the
 * relation, because the two numbers live in different files.
 */
export const maxDuration = 60;

type Source = "vercel_cron" | "external" | "manual";

async function handle(req: Request, body: unknown): Promise<Response> {
  if (!(await authorizeTick(req))) {
    return apiError("Not authorized", 401);
  }

  const parsed = tickRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return apiError("Validation failed", 422, { issues: parsed.error.flatten() });
  }

  // A support-triggered fire must be distinguishable from the platform cron in
  // the ledger, or "my 5-minute poll ran twice today" is undiagnosable.
  const source: Source = parsed.data.scheduleId
    ? "manual"
    : req.headers.get("x-vercel-cron")
      ? "vercel_cron"
      : "external";

  try {
    const result = await runTick({ ...parsed.data, source });
    const res = json(result);
    // One body summarises every workspace's activity. Nothing may cache it.
    res.headers.set("cache-control", "no-store");
    return res;
  } catch (e) {
    console.error("[cron/schedules] tick failed", e);
    return apiError("Tick failed", 500);
  }
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const body: Record<string, string> = {};
  for (const k of ["limit", "dryRun", "scheduleId"]) {
    const v = q.get(k);
    if (v !== null) body[k] = v;
  }
  return handle(req, body);
}

export async function POST(req: Request) {
  let body: unknown = {};
  try {
    // An empty body is the normal case for a pinger; it is not an error.
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  return handle(req, body);
}
