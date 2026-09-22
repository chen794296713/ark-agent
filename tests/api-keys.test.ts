import { test } from "node:test";
import assert from "node:assert/strict";
import { API_KEY_PREFIX, hashApiKey } from "../lib/api-key-token";
import {
  DEFAULT_API_KEY_NAME,
  prepareApiKey,
  serializeApiKey,
} from "../lib/services/api-keys";
import { apiKeyCredentialsSchema } from "../lib/validation";

test("a prepared API key persists matching plaintext and digest values", () => {
  const prepared = prepareApiKey({
    userId: "user-id",
    workspaceId: "workspace-id",
    name: DEFAULT_API_KEY_NAME,
  });

  assert.ok(prepared.token.startsWith(API_KEY_PREFIX));
  assert.match(prepared.token, /^ark_live_[0-9a-f]{32}$/);
  assert.equal(prepared.values.token, prepared.token);
  assert.equal(prepared.values.tokenHash, hashApiKey(prepared.token));
  assert.equal(prepared.values.tokenPrefix, prepared.token.slice(0, 16));
  assert.equal(prepared.values.name, "Default");
  assert.equal(prepared.values.description, null);
  assert.equal(prepared.values.expiresAt, null);
});

test("the public API key serializer never exposes stored plaintext", () => {
  const createdAt = new Date("2026-09-16T08:00:00.000Z");
  const storedRow = {
    id: "key-id",
    name: "Default",
    description: null,
    tokenPrefix: "ark_live_example",
    expiresAt: null,
    disabledAt: null,
    lastUsedAt: null,
    createdAt,
    updatedAt: createdAt,
    token: "ark_live_secret",
  };
  const serialized = serializeApiKey(storedRow);

  assert.equal(serialized.createdAt, createdAt.toISOString());
  assert.equal("token" in serialized, false);
  assert.equal("tokenHash" in serialized, false);
});

test("API key credential input accepts username and rejects extra fields", () => {
  assert.equal(
    apiKeyCredentialsSchema.safeParse({ username: "demo", password: "demo123" }).success,
    true,
  );
  assert.equal(
    apiKeyCredentialsSchema.safeParse({
      username: "demo",
      password: "demo123",
      name: "ignored",
    }).success,
    false,
  );
});
