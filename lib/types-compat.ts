/**
 * Re-exports so client-safe and server-only modules can share the same nominal
 * types without a client bundle reaching into lib/db/schema.
 */
export type { Lang } from "@/lib/types";
export type { IdentityProvider, PlatformRole, UserStatus } from "@/lib/db/schema";
