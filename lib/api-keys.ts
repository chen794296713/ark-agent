import { randomBytes } from "node:crypto";

export const API_KEY_PREFIX = "ark_live_";
export const API_KEY_PERMISSIONS = ["read", "write"] as const;

export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number];

/** Generate the exact public credential shape: ark_live_ + 32 lowercase hex. */
export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(16).toString("hex")}`;
}

/** Safe/idempotent methods are reads; every state-changing method is a write. */
export function permissionForMethod(method: string): ApiKeyPermission {
  return ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) ? "read" : "write";
}

export function hasApiKeyPermission(
  permissions: readonly string[],
  required: ApiKeyPermission,
): boolean {
  return permissions.includes(required);
}

export function isArkApiKey(value: string): boolean {
  return /^ark_live_[0-9a-f]{32}$/.test(value);
}
