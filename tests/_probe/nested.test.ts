import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Two guards in one file.
 *
 * 1. The npm-test glob: a shell that expands `**` as `*` drops every top-level
 *    test file while still exiting 0. If this file runs and the cron suite does
 *    not, the glob has regressed.
 * 2. `import "server-only"` resolves only under the react-server condition. 19
 *    modules open with it, so without NODE_OPTIONS=--conditions=react-server
 *    any test touching lib/api.ts or lib/db fails at import time.
 */
test("nested test files are discovered", () => assert.ok(true));

test("server-only modules are importable under the test runner", async () => {
  const api = await import("../../lib/api");
  assert.equal(typeof api.requireAuth, "function");
});
