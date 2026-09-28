import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

export interface ManagerBootstrapCredentials {
  username: string;
  password: string;
  name: string;
}

type ManagerAuthEnv = Record<string, string | undefined>;

export interface OpenClawManagerUser {
  email: string;
  name: string;
}

export interface OpenClawManagerAuthScope {
  cacheKey: string;
  credentials: ManagerBootstrapCredentials;
}

const userContext = new AsyncLocalStorage<OpenClawManagerUser>();

/** Bind the signed-in ArkAgent user to all downstream Manager API calls. */
export function setOpenClawManagerUser(user: OpenClawManagerUser): void {
  userContext.enterWith({
    email: user.email.toLowerCase().trim(),
    name: user.name.trim() || user.email.split("@", 1)[0] || "ArkAgent User",
  });
}

export function withOpenClawManagerUser<T>(
  user: OpenClawManagerUser,
  operation: () => T,
): T {
  return userContext.run({
    email: user.email.toLowerCase().trim(),
    name: user.name.trim() || user.email.split("@", 1)[0] || "ArkAgent User",
  }, operation);
}

export function currentOpenClawManagerUser(): OpenClawManagerUser | null {
  return userContext.getStore() ?? null;
}

/** Product-defined Manager password: email local-part followed by `@iagent1`. */
export function openClawManagerPassword(email: string): string {
  const normalized = email.toLowerCase().trim();
  const separator = normalized.indexOf("@");
  const prefix = separator >= 0 ? normalized.slice(0, separator) : normalized;
  return `${prefix}@iagent1`;
}

export function credentialsForOpenClawUser(
  user: OpenClawManagerUser,
): ManagerBootstrapCredentials {
  const username = user.email.toLowerCase().trim();
  return {
    username,
    password: openClawManagerPassword(username),
    name: user.name.trim() || username.split("@", 1)[0] || "ArkAgent User",
  };
}

export function managerBootstrapCredentials(
  env: ManagerAuthEnv = process.env,
): ManagerBootstrapCredentials | null {
  const currentUser = currentOpenClawManagerUser();
  if (currentUser) return credentialsForOpenClawUser(currentUser);
  const username = env.OPENCLAW_MANAGER_USERNAME?.trim() || "";
  const password = env.OPENCLAW_MANAGER_PASSWORD || "";
  if (!username || !password) return null;
  return {
    username,
    password,
    name: env.OPENCLAW_MANAGER_REGISTER_NAME?.trim() || "ArkAgent Service",
  };
}

/**
 * Resolve authentication once at the start of a Manager operation.
 *
 * The returned object is deliberately immutable-by-convention: callers pass
 * this same snapshot through cache lookup, key exchange, a possible 401
 * refresh, and retry. That prevents AsyncLocalStorage changes across streaming
 * or other asynchronous boundaries from switching identities halfway through
 * one upstream request.
 */
export function resolveOpenClawManagerAuthScope(
  user: OpenClawManagerUser | null,
  env: ManagerAuthEnv = process.env,
): OpenClawManagerAuthScope | null {
  const credentials = user
    ? credentialsForOpenClawUser(user)
    : managerBootstrapCredentials(env);
  if (!credentials) return null;
  return {
    cacheKey: credentials.username.toLowerCase(),
    credentials,
  };
}

export function captureOpenClawManagerAuthScope(
  env: ManagerAuthEnv = process.env,
): OpenClawManagerAuthScope | null {
  return resolveOpenClawManagerAuthScope(currentOpenClawManagerUser(), env);
}

export function isManagerApiKeyPayload(
  payload: unknown,
): payload is { api_key: string; key_prefix?: string; token_type?: string } {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Record<string, unknown>;
  return (
    typeof value.api_key === "string" &&
    value.api_key.startsWith("ocm_") &&
    value.api_key.length >= 16
  );
}
