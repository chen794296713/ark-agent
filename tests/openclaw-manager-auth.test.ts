import { test } from "node:test";
import assert from "node:assert/strict";
import {
  credentialsForOpenClawUser,
  isManagerApiKeyPayload,
  managerBootstrapCredentials,
  openClawManagerPassword,
  resolveOpenClawManagerAuthScope,
} from "../lib/openclaw-manager-auth";

test("a Manager user uses the current email and the required derived password", () => {
  assert.equal(openClawManagerPassword("Alice.Team@Example.com"), "alice.team@iagent1");
  assert.deepEqual(
    credentialsForOpenClawUser({ email: " Alice.Team@Example.com ", name: " Alice " }),
    {
      username: "alice.team@example.com",
      password: "alice.team@iagent1",
      name: "Alice",
    },
  );
});

test("manager bootstrap requires both username and password", () => {
  assert.equal(managerBootstrapCredentials({}), null);
  assert.equal(managerBootstrapCredentials({ OPENCLAW_MANAGER_USERNAME: "admin@example.com" }), null);
  assert.equal(managerBootstrapCredentials({ OPENCLAW_MANAGER_PASSWORD: "secret" }), null);
});

test("manager bootstrap trims identity and supplies a service name", () => {
  assert.deepEqual(
    managerBootstrapCredentials({
      OPENCLAW_MANAGER_USERNAME: "  admin@example.com ",
      OPENCLAW_MANAGER_PASSWORD: "secret",
    }),
    { username: "admin@example.com", password: "secret", name: "ArkAgent Service" },
  );
  assert.deepEqual(
    managerBootstrapCredentials({
      OPENCLAW_MANAGER_USERNAME: "admin@example.com",
      OPENCLAW_MANAGER_PASSWORD: "secret",
      OPENCLAW_MANAGER_REGISTER_NAME: "  Production ArkAgent  ",
    }),
    { username: "admin@example.com", password: "secret", name: "Production ArkAgent" },
  );
});

test("manager API-key response must contain a plausible ocm credential", () => {
  assert.equal(isManagerApiKeyPayload({
    api_key: "ocm_jAgm_e1uRHOSl5v9cez2UxZKdPsZ9Z3_bd4XG6hDyXI",
    key_prefix: "ocm_jAgm_e1u",
    token_type: "api_key",
  }), true);
  for (const payload of [
    null,
    {},
    { api_key: "" },
    { api_key: "ark_live_bef8845e0abe4094b7ed52cd526d43f5" },
    { api_key: 42 },
  ]) assert.equal(isManagerApiKeyPayload(payload), false);
});

test("a captured user auth scope does not change with later request context", () => {
  const scope = resolveOpenClawManagerAuthScope(
    { email: "Alice@Example.com", name: "Alice" },
    { OPENCLAW_MANAGER_API_KEY: "deployment-key" },
  );

  assert.deepEqual(scope, {
    cacheKey: "alice@example.com",
    credentials: {
      username: "alice@example.com",
      password: "alice@iagent1",
      name: "Alice",
    },
  });
});

test("a service auth scope uses username and password, never a static API key", () => {
  assert.deepEqual(
    resolveOpenClawManagerAuthScope(null, {
      OPENCLAW_MANAGER_API_KEY: " static-key ",
      OPENCLAW_MANAGER_USERNAME: " Service@Example.com ",
      OPENCLAW_MANAGER_PASSWORD: "secret",
    }),
    {
      cacheKey: "service@example.com",
      credentials: {
        username: "Service@Example.com",
        password: "secret",
        name: "ArkAgent Service",
      },
    },
  );
  assert.equal(resolveOpenClawManagerAuthScope(null, {
    OPENCLAW_MANAGER_API_KEY: "static-key",
  }), null);
});
