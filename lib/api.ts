import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { getAuthContext, getCurrentUser, type AuthContext } from "@/lib/auth";
import type { PlatformRole, User } from "@/lib/db/schema";

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Admin payloads carry cross-tenant PII (emails, session IPs, user agents).
 * `dynamic = "force-dynamic"` governs rendering, not response caching, and
 * `json()` sets no cache header at all — so an intermediary is free to store
 * one admin's page and hand it to the next request. This says otherwise.
 */
export function jsonPrivate<T>(data: T, status = 200): NextResponse {
  const res = NextResponse.json(data, { status });
  res.headers.set("cache-control", "no-store, no-cache, must-revalidate, private");
  return res;
}

export function apiError(message: string, status = 400, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export const unauthorized = () => apiError("Not authenticated", 401);
export const forbidden = () => apiError("Forbidden", 403);
export const notFound = (m = "Not found") => apiError(m, 404);

/** Parse + validate a JSON body. Returns either {data} or {res} (a 4xx response). */
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<{ data: T; res?: never } | { data?: never; res: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { res: apiError("Invalid JSON body", 400) };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return { res: apiError("Validation failed", 422, { issues: result.error.flatten() }) };
  }
  return { data: result.data };
}

const ROLE_RANK: Record<PlatformRole, number> = { user: 0, support: 1, admin: 2 };

/**
 * Require a platform-staff session at `min` or above.
 *
 * Built on getCurrentUser(), NOT getAuthContext(): the latter returns null for
 * a user who owns no workspace (lib/auth.ts), which would lock a workspace-less
 * staff account out of the console with a misleading 401.
 *
 * This is the whole authorization boundary — there is no middleware — so every
 * /api/admin route must call it. Hiding the nav item is not a control.
 */
export async function requirePlatformRole(
  min: PlatformRole = "admin",
): Promise<{ actor: User; res?: never } | { actor?: never; res: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { res: unauthorized() };
  if (ROLE_RANK[user.platformRole] < ROLE_RANK[min]) return { res: forbidden() };
  return { actor: user };
}

/** Require an authenticated session. Returns {ctx} or {res:401}. */
export async function requireAuth(): Promise<
  { ctx: AuthContext; res?: never } | { ctx?: never; res: NextResponse }
> {
  const ctx = await getAuthContext();
  if (!ctx) return { res: unauthorized() };
  return { ctx };
}
