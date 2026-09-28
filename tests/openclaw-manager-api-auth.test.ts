import { test } from "node:test";
import assert from "node:assert/strict";
import { listOpenClawManagerAgents } from "../app/lib/openclaw_manager_api";
import { setOpenClawManagerUser, withOpenClawManagerUser } from "../lib/openclaw-manager-auth";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("Manager calls fetch a missing key once and then use the memory cache", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let registrations = 0;
  let keyExchanges = 0;
  const authorizations: string[] = [];

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/auth/register")) {
      registrations += 1;
      return jsonResponse({ detail: "already exists" }, 409);
    }
    if (url.endsWith("/api/auth/api-key")) {
      keyExchanges += 1;
      return jsonResponse({ api_key: "ocm_cached_api_key_123456789" });
    }
    if (url.endsWith("/api/agents")) {
      authorizations.push(new Headers(init?.headers).get("authorization") || "");
      return jsonResponse({ items: [] });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;

  const user = { email: "cache-hit@example.com", name: "Cache Hit" };
  await withOpenClawManagerUser(user, listOpenClawManagerAgents);
  await withOpenClawManagerUser(user, listOpenClawManagerAgents);

  assert.equal(registrations, 0);
  assert.equal(keyExchanges, 1);
  assert.deepEqual(authorizations, [
    "Bearer ocm_cached_api_key_123456789",
    "Bearer ocm_cached_api_key_123456789",
  ]);
});

test("a 401 refresh keeps the immutable user scope and retries once", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const registeredEmails: string[] = [];
  const exchangedUsernames: string[] = [];
  const authorizations: string[] = [];
  let keyExchanges = 0;

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/auth/register")) {
      const body = JSON.parse(String(init?.body)) as { email: string };
      registeredEmails.push(body.email);
      return jsonResponse({ detail: "already exists" }, 409);
    }
    if (url.endsWith("/api/auth/api-key")) {
      const body = JSON.parse(String(init?.body)) as { username: string };
      exchangedUsernames.push(body.username);
      keyExchanges += 1;
      return jsonResponse({
        api_key: keyExchanges === 1
          ? "ocm_scope_stale_key_123456789"
          : "ocm_scope_fresh_key_123456789",
      });
    }
    if (url.endsWith("/api/agents")) {
      const authorization = new Headers(init?.headers).get("authorization") || "";
      authorizations.push(authorization);
      if (authorization === "Bearer ocm_scope_stale_key_123456789") {
        // Simulate an asynchronous boundary changing the ambient context before
        // the 401 handler runs. The retry must still belong to Alice.
        setOpenClawManagerUser({ email: "scope-bob@example.com", name: "Bob" });
        return jsonResponse({ detail: "expired" }, 401);
      }
      return jsonResponse({ items: [] });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;

  await withOpenClawManagerUser(
    { email: "scope-alice@example.com", name: "Alice" },
    listOpenClawManagerAgents,
  );

  assert.deepEqual(registeredEmails, []);
  assert.deepEqual(exchangedUsernames, [
    "scope-alice@example.com",
    "scope-alice@example.com",
  ]);
  assert.deepEqual(authorizations, [
    "Bearer ocm_scope_stale_key_123456789",
    "Bearer ocm_scope_fresh_key_123456789",
  ]);
});

test("a missing account is registered only after the first key exchange fails", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls: string[] = [];

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/auth/api-key")) {
      calls.push("key");
      const body = JSON.parse(String(init?.body)) as { username: string };
      assert.equal(body.username, "new-user@example.com");
      return calls.length === 1
        ? jsonResponse({ detail: "not found" }, 401)
        : jsonResponse({ api_key: "ocm_new_user_key_123456789" });
    }
    if (url.endsWith("/api/auth/register")) {
      calls.push("register");
      return jsonResponse({ id: 1 }, 201);
    }
    if (url.endsWith("/api/agents")) {
      calls.push("agents");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer ocm_new_user_key_123456789");
      return jsonResponse({ items: [] });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;

  await withOpenClawManagerUser(
    { email: "new-user@example.com", name: "New User" },
    listOpenClawManagerAgents,
  );
  assert.deepEqual(calls, ["key", "register", "key", "agents"]);
});

test("the caller's user survives an awaited authentication boundary", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const usernames: string[] = [];

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/auth/api-key")) {
      usernames.push((JSON.parse(String(init?.body)) as { username: string }).username);
      return jsonResponse({ api_key: "ocm_after_auth_key_123456789" });
    }
    if (url.endsWith("/api/agents")) return jsonResponse({ items: [] });
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;

  const getUser = async () => {
    await Promise.resolve();
    return { email: "after-auth@example.com", name: "After Auth" };
  };
  const user = await getUser();
  await withOpenClawManagerUser(user, listOpenClawManagerAgents);
  assert.deepEqual(usernames, ["after-auth@example.com"]);
});
