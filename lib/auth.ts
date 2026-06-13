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

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
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
      and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())),
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
