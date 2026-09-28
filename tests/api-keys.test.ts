import { test } from "node:test";
import assert from "node:assert/strict";
import {
  API_KEY_PREFIX,
  generateApiKey,
  hasApiKeyPermission,
  isArkApiKey,
  permissionForMethod,
} from "../lib/api-keys";

test("generated API keys use ark_live_ plus 32 lowercase hex characters", () => {
  const first = generateApiKey();
  const second = generateApiKey();
  assert.match(first, /^ark_live_[0-9a-f]{32}$/);
  assert.equal(first.length, API_KEY_PREFIX.length + 32);
  assert.notEqual(first, second);
  assert.equal(isArkApiKey(first), true);
});

test("malformed or differently prefixed credentials are rejected", () => {
  for (const value of [
    "ark_test_bef8845e0abe4094b7ed52cd526d43f5",
    "ark_live_BEF8845E0ABE4094B7ED52CD526D43F5",
    "ark_live_bef8845e0abe4094b7ed52cd526d43f",
    "ark_live_bef8845e0abe4094b7ed52cd526d43f55",
  ]) assert.equal(isArkApiKey(value), false, value);
});

test("safe HTTP methods require read and mutations require write", () => {
  for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
    assert.equal(permissionForMethod(method), "read", method);
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(permissionForMethod(method), "write", method);
  }
});

test("permissions do not imply one another", () => {
  assert.equal(hasApiKeyPermission(["read"], "read"), true);
  assert.equal(hasApiKeyPermission(["read"], "write"), false);
  assert.equal(hasApiKeyPermission(["write"], "write"), true);
  assert.equal(hasApiKeyPermission(["write"], "read"), false);
  assert.equal(hasApiKeyPermission(["read", "write"], "read"), true);
  assert.equal(hasApiKeyPermission(["read", "write"], "write"), true);
});
