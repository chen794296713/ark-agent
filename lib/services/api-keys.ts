import { apiKeys } from "@/lib/db/schema";
import { apiKeyDisplayPrefix, generateApiKey, hashApiKey } from "@/lib/api-key-token";

export const DEFAULT_API_KEY_NAME = "Default";

export const apiKeyPublicColumns = {
  id: apiKeys.id,
  name: apiKeys.name,
  description: apiKeys.description,
  tokenPrefix: apiKeys.tokenPrefix,
  expiresAt: apiKeys.expiresAt,
  disabledAt: apiKeys.disabledAt,
  lastUsedAt: apiKeys.lastUsedAt,
  createdAt: apiKeys.createdAt,
  updatedAt: apiKeys.updatedAt,
};

type PublicApiKeyRow = {
  id: string;
  name: string;
  description: string | null;
  tokenPrefix: string;
  expiresAt: Date | null;
  disabledAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeApiKey(row: PublicApiKeyRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tokenPrefix: row.tokenPrefix,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    disabledAt: row.disabledAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function prepareApiKey(input: {
  userId: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  expiresAt?: Date | null;
}) {
  const token = generateApiKey();
  return {
    token,
    values: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description || null,
      token,
      tokenPrefix: apiKeyDisplayPrefix(token),
      tokenHash: hashApiKey(token),
      expiresAt: input.expiresAt ?? null,
    },
  };
}
