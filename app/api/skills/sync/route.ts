/**
 * POST /api/skills/sync — the only place in the app that makes an outbound
 * request to a skill source.
 *
 * Auth: `requirePlatformRole("admin")` **or** a `Bearer CRON_SECRET`. `support`
 * is deliberately excluded — sync writes to the one table every customer reads.
 *
 * **Not `x-vercel-cron`.** Vercel's scheduler does set that header, but it is an
 * ordinary request header on an ordinary public URL: anyone who can reach the
 * deployment can send it. Treating it as an authenticator would make this an
 * unauthenticated write. The secret is compared with `timingSafeEqual` and the
 * check FAILS CLOSED when `CRON_SECRET` is unset.
 *
 * Status codes, and why none of them is a 500 for an upstream problem:
 *   200  the run finished; `stats` and `cursor` say what it did. An upstream
 *        failure is a 200 with `error` set and `fetched: 0` — the *sync*
 *        succeeded in doing what it could, and a 500 would make Vercel retry it.
 *   202  is deliberately NOT used: it promises a completion to poll for, and
 *        there is nothing to poll.
 *   404  unknown source — including the launch-day case where `skill_sources`
 *        is empty and there is simply nothing to crawl.
 *   409  another run holds the 15-minute lease. Expected, not a failure.
 *   503  the source row exists but is disabled.
 */
import { apiError, json, jsonPrivate, notFound, parseBody, requirePlatformRole } from "@/lib/api";
import { recordAdminAction, requestIp } from "@/lib/admin/audit";
import { runSync } from "@/lib/skills/sync";
import { syncSkillsSchema } from "@/lib/skills/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Requires the Pro plan; Hobby caps a function at 60 s and would kill a delta
 * mid-page. On Hobby, drop `maxPages` to 1 and let `cursor` carry the run across
 * invocations — which is why the response returns it.
 */
export const maxDuration = 300;

async function isCron(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false; // unset -> fail closed, never fall open
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented) return false;
  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(secret, "utf8");
  // A length mismatch makes `timingSafeEqual` throw, and letting that be a
  // distinguishable failure path leaks the secret's length.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const cron = await isCron(req);
  let actorUserId: string | null = null;
  let ip: string | null = null;

  if (!cron) {
    const staff = await requirePlatformRole("admin");
    if (staff.res) return staff.res;
    actorUserId = staff.actor.id;
    ip = requestIp(req);
  }

  const parsed = await parseBody(req, syncSkillsSchema);
  if (parsed.res) return parsed.res;
  const { source, mode, maxPages, cursor, dryRun } = parsed.data;

  const outcome = await runSync(source, { mode, maxPages, cursor, dryRun });
  if (!outcome.ok) {
    if (outcome.reason === "unknown_source") return notFound("Unknown source");
    if (outcome.reason === "disabled") return apiError("Source disabled", 503);
    return apiError("Sync already running", 409);
  }

  // Audited only for a human actor. A cron invocation has no `actor_user_id`,
  // and `admin_audit_log.actor_user_id` is not nullable — the cron's trail is
  // `skill_sources.last_sync_*`, which this run has already written.
  if (actorUserId) {
    const s = outcome.result.stats;
    await recordAdminAction({
      actorUserId,
      action: "skill_sync",
      summary: `${source} ${mode}${dryRun ? " (dry run)" : ""}: +${s.created} ~${s.updated} !${s.blocked}`,
      ip,
    });
  }

  // The body summarises the whole catalogue's ingest. Nothing may cache it, and
  // a human-triggered run is answered from the private helper for the same
  // reason every other admin payload is.
  return cron ? json(outcome.result) : jsonPrivate(outcome.result);
}
