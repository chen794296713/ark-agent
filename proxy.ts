import { NextResponse, type NextRequest } from "next/server";

/**
 * Next's server `headers()` API exposes request headers but not the method.
 * Copy the actual method into an internal header so the shared auth boundary
 * can enforce read/write API-key scopes without duplicating checks per route.
 * Any caller-provided value is overwritten here.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-ark-request-method", request.method);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
