import "server-only";

/**
 * Turning a verified provider identity into an ArkAgent session.
 *
 * The account-linking rule here is deliberately strict: a provider identity
 * whose email matches an existing local account is REFUSED, never auto-linked.
 *
 * Auto-linking on a matching email makes the provider's word about that address
 * the only thing guarding the local account, and `users.email_verified_at` in
 * this codebase is written by the seed rather than by any verification flow —
 * so a Google account registered at a seeded address would inherit that
 * account, platform admin included. Linking therefore starts from an
 * authenticated session (mode=link) instead, where the user proves ownership of
 * the local account first.
 */
import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { userIdentities, users, workspaces, workspaceMembers } from "@/lib/db/schema";
import type { UserIdentity } from "@/lib/db/schema";
import { PLACEHOLDER_EMAIL_DOMAIN, loginBlockedReason } from "@/lib/auth";
import type { IdentityProvider, Lang } from "@/lib/types-compat";

export interface ProviderProfile {
  provider: IdentityProvider;
  /** OAuth client the subject was minted for — namespaces `subject`. */
  appId: string;
  subject: string;
  /**
   * A per-app id for this person that the provider returns on *every* sign-in,
   * namespaced by the app it was minted for (`${appid}:${openid}` for WeChat).
   * Null for providers whose canonical key cannot move (Google).
   */
  providerKey?: string | null;
  /**
   * Keys this same identity may already be filed under from an earlier scheme,
   * most-recent first. A match on one of these is repaired in place; see the
   * lookup order documented on `resolveProviderIdentity`.
   */
  priorKeys?: ReadonlyArray<{ appId: string; subject: string }>;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  locale?: Lang;
}

export type ResolveOutcome =
  | { ok: true; userId: string; created: boolean; linked: boolean }
  | { ok: false; code: "email_taken" | "suspended" | "already_linked"; message: string };

/** Column limits these writes must respect — see lib/db/schema.ts. */
const USER_NAME_MAX = 120; // users.name
const DISPLAY_NAME_MAX = 160; // user_identities.display_name

/** SQLSTATE 23505, unique_violation. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Trim to a column's varchar limit.
 *
 * Sliced by code point rather than by `String.prototype.slice`, which counts
 * UTF-16 units: Postgres counts characters, and a plain slice can also cut a
 * surrogate pair in half — routine for the emoji WeChat nicknames carry.
 */
function clamp(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const points = Array.from(trimmed);
  return points.length > max ? points.slice(0, max).join("") : trimmed;
}

/**
 * The constraint a unique violation names, or null when `err` is something else.
 *
 * Two layers have to be peeled back. postgres-js raises a `PostgresError`
 * carrying the SQLSTATE on `code` and the index name on `constraint_name`
 * (node_modules/postgres/src/connection.js copies the wire fields straight onto
 * the error), and Drizzle then wraps every driver failure in a
 * `DrizzleQueryError` that keeps the original on `cause` — so the fields are one
 * level down. `constraint_name` is preferred, with the message as a fallback for
 * any driver path that omits it.
 */
function uniqueViolation(err: unknown): string | null {
  for (let cursor: unknown = err, depth = 0; cursor && depth < 5; depth++) {
    const e = cursor as { code?: unknown; constraint_name?: unknown; message?: unknown; cause?: unknown };
    if (e.code === PG_UNIQUE_VIOLATION) {
      if (typeof e.constraint_name === "string" && e.constraint_name) return e.constraint_name;
      return typeof e.message === "string" ? e.message : "";
    }
    cursor = e.cause;
  }
  return null;
}

/** True when a unique violation was raised by `constraint`. */
function violated(constraint: string | null, name: string): boolean {
  return constraint !== null && (constraint === name || constraint.includes(name));
}

/**
 * A unique violation translated into an `sso_error` the /auth screen renders,
 * or null when the error is not one this module knows how to explain.
 *
 * These close the race the pre-checks leave open: between a SELECT that finds
 * nothing and the INSERT that follows, a second tab can win.
 */
function mapUniqueViolation(err: unknown): ResolveOutcome | null {
  const constraint = uniqueViolation(err);
  if (constraint === null) return null;
  if (violated(constraint, "users_email_uniq")) {
    return {
      ok: false,
      code: "email_taken",
      message:
        "An account with this email already exists. Sign in with your password, then link this provider from your account settings.",
    };
  }
  if (violated(constraint, "user_identities_user_provider_uniq")) {
    return {
      ok: false,
      code: "already_linked",
      message: "Your ArkAgent account already has an account from this provider linked. Unlink it first.",
    };
  }
  if (constraint.includes("user_identities_")) {
    return {
      ok: false,
      code: "already_linked",
      message: "That account is already linked to a different ArkAgent user",
    };
  }
  return null;
}

/**
 * Error text that is safe to write to a log.
 *
 * Drizzle's `DrizzleQueryError` puts the failing SQL *and its bound parameters*
 * in `message`, and those parameters are emails, nicknames and provider
 * subjects. Anything carrying that shape is reported by SQLSTATE instead.
 */
export function safeErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "unknown error";
  if ("query" in err && "params" in err) {
    const code = uniqueViolation(err);
    return code ? `database error: unique violation on ${code}` : "database query failed";
  }
  return err.message;
}

/**
 * A synthetic address for providers that return none (WeChat).
 *
 * Random rather than derived from the subject: a deterministic placeholder is
 * computable by anyone who learns the openid — and openids are visible to every
 * merchant running the Official Account — so it could be registered in advance
 * to capture the account the flow is about to create.
 */
function placeholderEmail(): string {
  return `wx-${randomBytes(16).toString("hex")}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

/** Lookup by the canonical key. */
async function findByKey(
  provider: IdentityProvider,
  appId: string,
  subject: string,
): Promise<UserIdentity | null> {
  const [row] = await db
    .select()
    .from(userIdentities)
    .where(
      and(
        eq(userIdentities.provider, provider),
        eq(userIdentities.appId, appId),
        eq(userIdentities.subject, subject),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Lookup by the anchor that never moves. */
async function findByProviderKey(
  provider: IdentityProvider,
  providerKey: string,
): Promise<UserIdentity | null> {
  const [row] = await db
    .select()
    .from(userIdentities)
    .where(
      and(eq(userIdentities.provider, provider), eq(userIdentities.providerKey, providerKey)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Move a row found under a superseded key onto the canonical one.
 *
 * Wrapped because the canonical key may already be taken by a fork created
 * before `provider_key` existed. That is a unique violation, not a server
 * error: the fork is the live account, so the flow continues on it rather than
 * failing the sign-in.
 */
async function adoptCanonicalKey(
  row: UserIdentity,
  profile: ProviderProfile,
): Promise<UserIdentity> {
  try {
    const [updated] = await db
      .update(userIdentities)
      .set({
        appId: profile.appId,
        subject: profile.subject,
        // Backfill only, never an overwrite — same invariant as touchIdentity:
        // an anchor that is already set is what future sign-ins navigate by.
        ...(profile.providerKey && !row.providerKey
          ? { providerKey: profile.providerKey }
          : {}),
      })
      .where(eq(userIdentities.id, row.id))
      .returning();
    return updated ?? row;
  } catch (err) {
    if (uniqueViolation(err) === null) throw err;
    console.warn(
      `[identity] identity ${row.id} could not adopt its canonical key; another row already holds it`,
    );
    return (await findByKey(profile.provider, profile.appId, profile.subject)) ?? row;
  }
}

/**
 * Refresh the cosmetic fields, and backfill `provider_key` when the row predates
 * it — a NULL there is precisely the gap that lets a moved canonical key fork
 * the account. Never an overwrite: once set, that value is the anchor.
 */
async function touchIdentity(row: UserIdentity, profile: ProviderProfile): Promise<void> {
  const touch = {
    email: profile.email,
    emailVerified: profile.emailVerified,
    displayName: clamp(profile.displayName, DISPLAY_NAME_MAX),
    avatarUrl: profile.avatarUrl,
    lastLoginAt: new Date(),
  };
  const backfill: { providerKey?: string } =
    profile.providerKey && !row.providerKey ? { providerKey: profile.providerKey } : {};
  try {
    await db
      .update(userIdentities)
      .set({ ...touch, ...backfill })
      .where(eq(userIdentities.id, row.id));
  } catch (err) {
    if (backfill.providerKey === undefined || uniqueViolation(err) === null) throw err;
    // Another row already claims this anchor. Signing the person in matters
    // more than the repair, so retry without it.
    await db.update(userIdentities).set(touch).where(eq(userIdentities.id, row.id));
  }
}

/**
 * Resolve a provider profile to a local user id, creating or linking as needed.
 *
 * ## Why the lookup key is never derived from a best-effort value
 *
 * The key that decides "is this the same person?" must be reproducible on every
 * single sign-in, or the answer changes with the weather and the person lands in
 * a brand-new empty account with their agents, credits and billing stranded on
 * the old row. WeChat makes that easy to get wrong: `unionid` is returned by
 * /sns/oauth2/access_token only for an app under an Open Platform account, and
 * otherwise only by /sns/userinfo — which is rate-limited, times out, and is
 * treated as optional by the caller because a missing nickname is no reason to
 * refuse an authorized sign-in. A key of `unionid ?? openid` therefore silently
 * changes shape on a slow day, when the 公众号 is bound to an Open Platform
 * account, and between the mp and web surfaces.
 *
 * So the canonical pair is allowed to move, and the lookup is built to survive
 * it. In order:
 *
 *   a. (provider, appId, subject) — the canonical key.
 *   b. (provider, providerKey) — the anchor, built only from values present in
 *      every successful exchange. This is what still finds the row when the
 *      unionid flickers away. A match here is NOT rewritten: the canonical pair
 *      of the moment may be the weaker one, and rewriting would make the row
 *      flap between keys on alternating sign-ins.
 *   c. `priorKeys` — pairs this identity may still be filed under from an
 *      earlier scheme (rows written before `provider_key` existed have none, so
 *      (b) cannot find them). A match here IS rewritten onto the canonical pair,
 *      because these keys are the ones being migrated away from.
 *
 * Only when all three miss is a new user created.
 *
 * `linkToUserId` is set only by an authenticated link flow; a login flow never
 * attaches an identity to an account it did not just create.
 */
export async function resolveProviderIdentity(
  profile: ProviderProfile,
  linkToUserId?: string | null,
): Promise<ResolveOutcome> {
  let row = await findByKey(profile.provider, profile.appId, profile.subject);

  if (!row && profile.providerKey) {
    row = await findByProviderKey(profile.provider, profile.providerKey);
  }

  if (!row) {
    for (const prior of profile.priorKeys ?? []) {
      if (prior.appId === profile.appId && prior.subject === profile.subject) continue;
      const stale = await findByKey(profile.provider, prior.appId, prior.subject);
      if (stale) {
        row = await adoptCanonicalKey(stale, profile);
        break;
      }
    }
  }

  // ---- Known identity -----------------------------------------------------
  if (row) {
    if (linkToUserId && row.userId !== linkToUserId) {
      return {
        ok: false,
        code: "already_linked",
        message: "That account is already linked to a different ArkAgent user",
      };
    }
    const [owner] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    if (!owner) {
      return { ok: false, code: "email_taken", message: "Sign-in failed. Please try again." };
    }
    const blocked = loginBlockedReason(owner);
    if (blocked) return { ok: false, code: "suspended", message: blocked };

    await touchIdentity(row, profile);
    return { ok: true, userId: row.userId, created: false, linked: false };
  }

  const values = {
    provider: profile.provider,
    appId: profile.appId,
    subject: profile.subject,
    providerKey: profile.providerKey ?? null,
    email: profile.email,
    emailVerified: profile.emailVerified,
    displayName: clamp(profile.displayName, DISPLAY_NAME_MAX),
    avatarUrl: profile.avatarUrl,
    lastLoginAt: new Date(),
  };

  // ---- Linking onto an authenticated account ------------------------------
  if (linkToUserId) {
    // `user_identities_user_provider_uniq` allows one account per provider per
    // user. Checked up front so a second Google account produces the styled
    // "already linked" screen instead of an unhandled 500 out of the driver.
    const [taken] = await db
      .select({ subject: userIdentities.subject })
      .from(userIdentities)
      .where(
        and(
          eq(userIdentities.userId, linkToUserId),
          eq(userIdentities.provider, profile.provider),
        ),
      )
      .limit(1);
    if (taken && taken.subject !== profile.subject) {
      return {
        ok: false,
        code: "already_linked",
        message: `Your ArkAgent account already has a ${profile.provider} account linked. Unlink it first.`,
      };
    }

    try {
      await db.insert(userIdentities).values({ userId: linkToUserId, ...values });
    } catch (err) {
      const mapped = mapUniqueViolation(err);
      if (!mapped) throw err;
      return mapped;
    }
    return { ok: true, userId: linkToUserId, created: false, linked: true };
  }

  // ---- New identity, no session: refuse to adopt an existing local account -
  if (profile.email) {
    const clash = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, profile.email.toLowerCase().trim()))
      .limit(1);
    if (clash[0]) {
      return {
        ok: false,
        code: "email_taken",
        message:
          "An account with this email already exists. Sign in with your password, then link this provider from your account settings.",
      };
    }
  }

  // ---- Brand-new user -----------------------------------------------------
  const email = profile.email ? profile.email.toLowerCase().trim() : placeholderEmail();
  // users.name is varchar(120) and a WeChat nickname is arbitrary text, so an
  // over-long one has to be trimmed rather than abort the sign-in.
  const name =
    clamp(profile.displayName, USER_NAME_MAX) ?? clamp(email.split("@")[0], USER_NAME_MAX) ?? "User";

  // One transaction, so a lost race on any of these four inserts leaves no
  // half-built account behind — no orphan user, no workspace nobody can reach.
  let userId: string;
  try {
    userId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email,
          // No password: this account signs in through the provider until the
          // owner sets one from the account screen.
          passwordHash: null,
          name,
          ...(profile.locale ? { locale: profile.locale } : {}),
          ...(profile.emailVerified ? { emailVerifiedAt: new Date() } : {}),
        })
        .returning();

      const [ws] = await tx
        .insert(workspaces)
        .values({ name: `${name.split(" ")[0]}'s Workspace`, ownerId: user.id })
        .returning();
      await tx
        .insert(workspaceMembers)
        .values({ workspaceId: ws.id, userId: user.id, role: "owner" });

      await tx.insert(userIdentities).values({ userId: user.id, ...values });
      return user.id;
    });
  } catch (err) {
    const mapped = mapUniqueViolation(err);
    if (!mapped) throw err;
    return mapped;
  }

  return { ok: true, userId, created: true, linked: true };
}
