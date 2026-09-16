import { createHash, randomBytes } from "node:crypto";

export const API_KEY_PREFIX = "ark_live_";

/** Generate a high-entropy API key in the application's credential namespace. */
export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function apiKeyDisplayPrefix(token: string): string {
  return token.slice(0, 16);
}

/** Only credentials in our namespace are candidates for database lookup. */
export function apiKeyFromAuthorization(value: string | null): string | null {
  if (!value) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  const token = match?.[1] ?? "";
  return token.startsWith(API_KEY_PREFIX) ? token : null;
}
