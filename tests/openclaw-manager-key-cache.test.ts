import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenClawManagerKeyCache } from "../lib/openclaw-manager-key-cache";

test("a cache miss loads once and later calls reuse the key", async () => {
  const cache = new OpenClawManagerKeyCache();
  let loads = 0;
  const load = async () => {
    loads += 1;
    return "ocm_cached_key_123456789";
  };

  assert.equal(await cache.getOrRefresh("user:alice@example.com", load), "ocm_cached_key_123456789");
  assert.equal(await cache.getOrRefresh("user:alice@example.com", load), "ocm_cached_key_123456789");
  assert.equal(loads, 1);
});

test("concurrent misses for one user share a single key exchange", async () => {
  const cache = new OpenClawManagerKeyCache();
  let loads = 0;
  let release!: (value: string) => void;
  const pendingKey = new Promise<string>((resolve) => {
    release = resolve;
  });
  const load = async () => {
    loads += 1;
    return pendingKey;
  };

  const first = cache.getOrRefresh("user:alice@example.com", load);
  const second = cache.getOrRefresh("user:alice@example.com", load);
  release("ocm_shared_key_123456789");

  assert.deepEqual(await Promise.all([first, second]), [
    "ocm_shared_key_123456789",
    "ocm_shared_key_123456789",
  ]);
  assert.equal(loads, 1);
});

test("a 401 invalidates only the stale key and refreshes it once", async () => {
  const cache = new OpenClawManagerKeyCache();
  const cacheKey = "user:alice@example.com";
  await cache.getOrRefresh(cacheKey, async () => "ocm_stale_key_123456789");

  let refreshes = 0;
  const refreshed = await cache.getOrRefresh(
    cacheKey,
    async () => {
      refreshes += 1;
      return "ocm_fresh_key_123456789";
    },
    "ocm_stale_key_123456789",
  );

  assert.equal(refreshed, "ocm_fresh_key_123456789");
  assert.equal(cache.get(cacheKey), "ocm_fresh_key_123456789");
  assert.equal(refreshes, 1);
});

test("a stale caller reuses a key already refreshed by another request", async () => {
  const cache = new OpenClawManagerKeyCache();
  const cacheKey = "user:alice@example.com";
  await cache.getOrRefresh(cacheKey, async () => "ocm_old_key_123456789");
  await cache.getOrRefresh(
    cacheKey,
    async () => "ocm_new_key_123456789",
    "ocm_old_key_123456789",
  );

  let extraRefreshes = 0;
  const result = await cache.getOrRefresh(
    cacheKey,
    async () => {
      extraRefreshes += 1;
      return "ocm_unexpected_key_123456789";
    },
    "ocm_old_key_123456789",
  );

  assert.equal(result, "ocm_new_key_123456789");
  assert.equal(extraRefreshes, 0);
});

test("different users have isolated cache entries", async () => {
  const cache = new OpenClawManagerKeyCache();
  await cache.getOrRefresh("user:alice@example.com", async () => "ocm_alice_key_123456789");
  await cache.getOrRefresh("user:bob@example.com", async () => "ocm_bob_key_123456789");

  assert.equal(cache.get("user:alice@example.com"), "ocm_alice_key_123456789");
  assert.equal(cache.get("user:bob@example.com"), "ocm_bob_key_123456789");
});

test("a failed key exchange is not retained as an in-flight refresh", async () => {
  const cache = new OpenClawManagerKeyCache();
  await assert.rejects(
    cache.getOrRefresh("user:alice@example.com", async () => {
      throw new Error("upstream unavailable");
    }),
    /upstream unavailable/,
  );

  assert.equal(
    await cache.getOrRefresh(
      "user:alice@example.com",
      async () => "ocm_recovered_key_123456789",
    ),
    "ocm_recovered_key_123456789",
  );
});
