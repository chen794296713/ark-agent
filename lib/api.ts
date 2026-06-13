import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { getAuthContext, type AuthContext } from "@/lib/auth";

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
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

/** Require an authenticated session. Returns {ctx} or {res:401}. */
export async function requireAuth(): Promise<
  { ctx: AuthContext; res?: never } | { ctx?: never; res: NextResponse }
> {
  const ctx = await getAuthContext();
  if (!ctx) return { res: unauthorized() };
  return { ctx };
}
