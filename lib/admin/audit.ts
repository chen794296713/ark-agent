import "server-only";

/**
 * Append-only trail for privileged mutations.
 *
 * Every write here is best-effort: an admin action that already committed must
 * not be reported as a failure because the trail insert lost a race. The
 * console would then show an error for a change that did happen, and the
 * operator's natural response — retry — is the worst possible one.
 */
import { db } from "@/lib/db";
import { adminAuditLog, adminActionEnum } from "@/lib/db/schema";

export type AdminAction = (typeof adminActionEnum.enumValues)[number];

/** `summary` is varchar(300); a longer sentence would abort the insert. */
const SUMMARY_MAX = 300;

export type AdminActionEntry = {
  actorUserId: string;
  action: AdminAction;
  /** Null once the target row is gone — the FK is ON DELETE SET NULL. */
  targetUserId?: string | null;
  /**
   * A SHORT composed sentence ("role user→admin"), never a dump of the row.
   * A before/after dump would copy `password_hash` into a table support-tier
   * staff can read, which is the opposite of what an audit trail is for.
   */
  summary: string;
  ip?: string | null;
};

export async function recordAdminAction(entry: AdminActionEntry): Promise<void> {
  try {
    await db.insert(adminAuditLog).values({
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetUserId: entry.targetUserId ?? null,
      summary: entry.summary.slice(0, SUMMARY_MAX),
      ip: entry.ip?.slice(0, 60) ?? null,
    });
  } catch {
    // Deliberately swallowed, and deliberately not logging `entry` — the
    // summary and target id belong in the table, not in a log stream.
    console.error(`admin audit write failed (action=${entry.action})`);
  }
}

/**
 * Caller IP for the trail. Behind a proxy the socket address is the proxy's,
 * so the left-most x-forwarded-for hop is the only usable value; it is
 * client-controlled and therefore evidence, not identity.
 */
export function requestIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  if (first) return first.slice(0, 60);
  return req.headers.get("x-real-ip")?.trim().slice(0, 60) ?? null;
}
