import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userIdentities } from "@/lib/db/schema";
import { jsonPrivate, requireAuth } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/identities — the SSO providers linked to the caller's own account.
 *
 * Scoped to `ctx.user.id` and nothing else: there is no id in the path, so the
 * session is the only thing that can select rows here and one user can never
 * enumerate another's identities.
 *
 * The column list is the control, not a convenience. `select()` with no
 * projection would ship `subject` and `appId` too — a Google `sub` and a WeChat
 * `openid` are the provider-side handles the account is actually keyed by, and
 * an openid is visible to every merchant running the same Official Account. The
 * browser has no use for either, so they never leave the server.
 */
export async function GET() {
  const gate = await requireAuth();
  if (gate.res) return gate.res;

  const identities = await db
    .select({
      provider: userIdentities.provider,
      displayName: userIdentities.displayName,
      email: userIdentities.email,
      lastLoginAt: userIdentities.lastLoginAt,
      createdAt: userIdentities.createdAt,
    })
    .from(userIdentities)
    .where(eq(userIdentities.userId, gate.ctx.user.id))
    // Oldest first, so the list does not reshuffle itself when a provider is
    // used to sign in again.
    .orderBy(asc(userIdentities.createdAt));

  // The rows carry the provider-side email — the account holder's own PII, but
  // PII all the same, so no intermediary gets to keep a copy of the response.
  return jsonPrivate({ identities });
}
