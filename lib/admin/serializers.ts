import "server-only";

/**
 * Row -> DTO mappers for the admin console, the SQL fragments those DTOs are
 * aggregated from, and the two guards every mutation shares.
 *
 * The reason the column list is spelled out here rather than `select()`-ing the
 * whole row: `users` carries `password_hash`, and a `select()` + spread hands it
 * to every support-tier session that opens a user page. Listing columns makes
 * leaking one a deliberate edit rather than a default.
 */
import { and, eq, ne, sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/lib/db";
import { llmUsage, sessions, userIdentities, users } from "@/lib/db/schema";
import type { User, UserIdentity } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Aggregate fragments
// ---------------------------------------------------------------------------

/**
 * Postgres returns bigint (`count`, `sum`) as a string over the wire, so every
 * aggregate is mapped through Number here — otherwise the JSON payload silently
 * ships `"1234"` where the console expects `1234` and arithmetic concatenates.
 * Each helper builds a fresh fragment so callers never share one instance.
 */
export const countAll = () => sql<number>`count(*)`.mapWith(Number);

export const sumInt = (col: SQLWrapper) => sql<number>`coalesce(sum(${col}), 0)`.mapWith(Number);

export const countWhere = (cond: SQLWrapper) =>
  sql<number>`count(*) filter (where ${cond})`.mapWith(Number);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** Every admin read of `users` goes through this map. `password_hash` is absent. */
export const adminUserColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  locale: users.locale,
  platformRole: users.platformRole,
  status: users.status,
  emailVerifiedAt: users.emailVerifiedAt,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  // The fact, not the material: whether a local password exists at all.
  hasPassword: sql<boolean>`(${users.passwordHash} is not null)`,
};

export type AdminUserRow = Omit<User, "passwordHash"> & { hasPassword: boolean };

/** Compact actor/target reference embedded in audit rows. */
export type AdminUserRef = { id: string; email: string; name: string } | null;

// ---------------------------------------------------------------------------
// LLM usage rollups
// ---------------------------------------------------------------------------

export type UsageTotalsRow = {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Micro-USD (1e-6). Divide by 1_000_000 for dollars — never a float here. */
  costMicroUsd: number;
  errors: number;
  estimatedCalls: number;
};

export type UsageTotals = UsageTotalsRow & { errorRate: number };

export const EMPTY_USAGE: UsageTotalsRow = {
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costMicroUsd: 0,
  errors: 0,
  estimatedCalls: 0,
};

/** The aggregate select map every usage rollup shares. */
export const usageTotalColumns = () => ({
  calls: countAll(),
  promptTokens: sumInt(llmUsage.promptTokens),
  completionTokens: sumInt(llmUsage.completionTokens),
  totalTokens: sumInt(llmUsage.totalTokens),
  costMicroUsd: sumInt(llmUsage.costMicroUsd),
  errors: countWhere(sql`${llmUsage.errorCode} is not null`),
  estimatedCalls: countWhere(sql`${llmUsage.estimated}`),
});

export function withErrorRate(t: UsageTotalsRow): UsageTotals {
  return { ...t, errorRate: t.calls > 0 ? t.errors / t.calls : 0 };
}

/** UTC day/hour bucket rendered server-side, so no timezone survives the wire. */
export const utcBucket = (granularity: "day" | "hour") =>
  granularity === "hour"
    ? sql<string>`to_char(date_trunc('hour', ${llmUsage.createdAt} at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:00:00"Z"')`
    : sql<string>`to_char(date_trunc('day', ${llmUsage.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;

// ---------------------------------------------------------------------------
// Identities & sessions
// ---------------------------------------------------------------------------

/** No tokens, no refresh material — the schema stores none, and neither do we. */
export const adminIdentityColumns = {
  id: userIdentities.id,
  userId: userIdentities.userId,
  provider: userIdentities.provider,
  // The OAuth client the subject was minted under; `subject` alone is
  // meaningless without it (WeChat openids are per-app).
  appId: userIdentities.appId,
  subject: userIdentities.subject,
  email: userIdentities.email,
  emailVerified: userIdentities.emailVerified,
  displayName: userIdentities.displayName,
  avatarUrl: userIdentities.avatarUrl,
  lastLoginAt: userIdentities.lastLoginAt,
  createdAt: userIdentities.createdAt,
};

export type AdminIdentityDTO = UserIdentity;

/** `tokenHash` is deliberately not selected: it is the session, not a label. */
export const adminSessionColumns = {
  id: sessions.id,
  ip: sessions.ip,
  userAgent: sessions.userAgent,
  createdAt: sessions.createdAt,
  expiresAt: sessions.expiresAt,
};

export type AdminSessionDTO = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
};

// ---------------------------------------------------------------------------
// Guards shared by every mutation
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Postgres raises `invalid input syntax for type uuid` on a malformed id, which
 * surfaces as a 500 for what is really a client mistake. Check first.
 */
export const isUuid = (value: string): boolean => UUID_RE.test(value);

/** One user, no `password_hash`, or null. */
export async function loadAdminUser(id: string): Promise<AdminUserRow | null> {
  const rows = await db.select(adminUserColumns).from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Is there another usable platform admin besides `excludeUserId`?
 *
 * Suspended counts as unusable: a suspended account cannot hold a session
 * (lib/auth.ts filters on status), so leaving one behind is the same as leaving
 * none — the platform locks itself out with no way back in through the product.
 */
export async function otherActiveAdminExists(excludeUserId: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.platformRole, "admin"), eq(users.status, "active"), ne(users.id, excludeUserId)),
    )
    .limit(1);
  return rows.length > 0;
}
