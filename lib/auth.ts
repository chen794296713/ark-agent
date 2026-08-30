import "server-only";

/**
 * Custom email + session-cookie authentication.
 *  - Passwords: scrypt with a per-user random salt (node:crypto, no deps).
 *  - Sessions: an opaque random token stored in an HTTP-only cookie; only its
 *    SHA-256 is persisted in the `sessions` table, so a DB leak can't be replayed.
 */
import { cookies, headers } from "next/headers";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users, workspaces } from "@/lib/db/schema";
import type { User, Workspace } from "@/lib/db/schema";

const COOKIE = process.env.SESSION_COOKIE_NAME || "ark_session";
const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  // An SSO-only account has no hash. Still burn a scrypt to keep the failure
  // indistinguishable in time from a wrong password.
  if (!stored) {
    scryptSync(password, "absent", 64);
    return false;
  }
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * The one place that decides whether a user may hold a session, called by every
 * path that mints one (password login and both OAuth callbacks). Suspension
 * enforced in only some of those paths is suspension that an attacker routes
 * around by picking the other door.
 */
export function loginBlockedReason(user: Pick<User, "status">): string | null {
  return user.status === "suspended" ? "This account has been suspended" : null;
}

/** Domain used for the synthetic addresses of providers that return no email. */
export const PLACEHOLDER_EMAIL_DOMAIN = "wechat.invalid";

/**
 * Addresses the public signup form must refuse.
 *
 * Without this, anyone can register ADMIN_EMAIL before the seed first runs, or
 * register into the synthetic namespace the WeChat flow allocates from — both
 * of which turn a later automated write into an account handover.
 */
export function isReservedEmail(email: string): boolean {
  const e = email.toLowerCase().trim();
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@iagent.cc").toLowerCase().trim();
  return e === adminEmail || e.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

function sha256(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a session row + set the cookie. Returns the raw token. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_MS);
  const hdrs = await headers();
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    expiresAt,
    userAgent: hdrs.get("user-agent")?.slice(0, 480) ?? null,
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 60) ?? null,
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Drop every session a user holds — used on password change and by an admin. */
export async function revokeAllSessions(userId: string): Promise<number> {
  const gone = await db.delete(sessions).where(eq(sessions.userId, userId)).returning({
    id: sessions.id,
  });
  return gone.length;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  }
  jar.delete(COOKIE);
}

/** The signed-in user, or null. Validates the token against a live session. */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, sha256(token)),
        gt(sessions.expiresAt, new Date()),
        // A suspension has to take hold on the next request, otherwise a live
        // 30-day cookie outlives the decision to revoke access.
        eq(users.status, "active"),
      ),
    )
    .limit(1);
  return rows[0]?.user ?? null;
}

export type AuthContext = { user: User; workspace: Workspace };

/** User + their primary (owned) workspace, or null if not signed in. */
export async function getAuthContext(): Promise<AuthContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const ws = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, user.id))
    .limit(1);
  if (!ws[0]) return null;
  return { user, workspace: ws[0] };
}
