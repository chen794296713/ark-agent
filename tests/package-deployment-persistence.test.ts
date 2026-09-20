import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { agentRoles, agents, subscriptions, users, workspaces } from "../lib/db/schema";
import {
  assertPackageReplay,
  configureAgentPackage,
  deletePackageDraft,
  deployAgentPackage,
  getAgentPackageRecord,
  getConfiguredAgentPackage,
  getLegacyAgentPackageRecord,
  isPackageTableMissing,
  legacyPackageGuard,
  packageIdempotencyKey,
  packageRequestDigest,
  type ConfigurePackageInput,
} from "../lib/agent-packages/service";
import type { PackageRuntimeRequest } from "../lib/agent-packages/deployment";
import { verifyCompiledPackage } from "../lib/agent-packages/compiler";
import { createAgent } from "../lib/services/agents";
import type { AuthContext } from "../lib/auth";

const input: ConfigurePackageInput = {
  packageId: "email-assistant",
  overlay: { name: "Inbox assistant", instructions: "Summarize accurately.", organization: "Example", goals: "Keep drafts organized", tone: "professional", harness: "hermes" },
};

test("package idempotency compares normalized complete input and rejects a changed overlay", () => {
  const digest = packageRequestDigest(input);
  assert.equal(packageRequestDigest({ overlay: { ...input.overlay }, packageId: input.packageId }), digest);
  assert.notEqual(packageRequestDigest({ ...input, overlay: { ...input.overlay, instructions: "Different" } }), digest);
  assert.doesNotThrow(() => assertPackageReplay({ requestDigest: digest }, digest));
  assert.throws(() => assertPackageReplay({ requestDigest: digest }, "f".repeat(64)), { code: "idempotency_conflict" });
  assert.equal(packageIdempotencyKey("valid-key-123"), "valid-key-123");
  for (const key of [null, "short", "spaces forbidden", "x".repeat(81)]) {
    assert.throws(() => packageIdempotencyKey(key), { code: "invalid_idempotency_key" });
  }
});

test("migration readiness recognizes only the specific missing package table", () => {
  const missing = { code: "42P01", message: 'relation "agent_packages" does not exist' };
  assert.equal(isPackageTableMissing(missing), true);
  assert.equal(isPackageTableMissing({ cause: missing }), true);
  assert.equal(isPackageTableMissing({ code: "42P01", message: 'relation "public.agent_packages" does not exist' }), true);
  for (const error of [
    { code: "42P01", message: 'relation "agents" does not exist' },
    { code: "42P01", message: 'relation "agent_packages_backup" does not exist' },
    { code: "42501", message: 'permission denied for table agent_packages' },
    { code: "08006", message: 'relation "agent_packages" does not exist' },
    new Error("Database unavailable"), null,
  ]) assert.equal(isPackageTableMissing(error), false);
});

test("legacy hire rejects the reserved package role before accessing the database", async () => {
  await assert.rejects(createAgent({} as AuthContext, {
    name: "Invalid package", roleId: "package-agent", engine: "hermes", planTier: "associate", instructions: "", rules: "", channels: [], tasks: [],
  }), /Unknown role: package-agent/);
});

const testDatabaseUrl = process.env.PACKAGE_TEST_DATABASE_URL;

test("package persistence, tenant boundaries and deployment transitions against disposable Postgres", { skip: !testDatabaseUrl }, async (t) => {
  const url = new URL(testDatabaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Only a loopback test database is allowed");
  assert.equal(url.pathname, "/ark_package_test", "Use the dedicated disposable database name");
  process.env.DATABASE_URL = testDatabaseUrl;
  const sql = postgres(testDatabaseUrl!, { max: 1 });
  const priorEnv = Object.fromEntries(["ARK_PACKAGE_MANAGER_URL", "ARK_PACKAGE_MANAGER_TOKEN", "ARK_PACKAGE_MANAGER_HARNESSES"].map((key) => [key, process.env[key]]));
  const userIds: string[] = [];
  try {
    await migrate(drizzle(sql), { migrationsFolder: "lib/db/migrations" });
    const makeContext = async () => {
      const [user] = await db.insert(users).values({ name: "Package test", email: `${randomUUID()}@package-test.invalid` }).returning();
      userIds.push(user.id);
      const [workspace] = await db.insert(workspaces).values({ name: "Package test workspace", ownerId: user.id }).returning();
      return { user, workspace };
    };
    const ctx = await makeContext();
    const other = await makeContext();
    let agentId = "";

    await t.test("concurrent replays save one immutable draft and no billing seat", async () => {
      const key = randomUUID();
      const results = await Promise.all(Array.from({ length: 5 }, () => configureAgentPackage(ctx, input, key)));
      assert.equal(new Set(results.map((result) => result.agent.id)).size, 1);
      assert.equal(results.filter((result) => result.created).length, 1);
      agentId = results[0]!.agent.id;
      assert.equal(results[0]!.agent.status, "draft");
      assert.equal(results[0]!.package.ready, false);
      const record = (await getAgentPackageRecord(agentId, ctx.workspace.id))!;
      assert.equal(verifyCompiledPackage(record.bundle), true, "Postgres must preserve canonical bundle key order and digest");
      assert.ok(results[0]!.package.skills.every((skill) => skill.state === "pending"));
      assert.ok(results[0]!.package.connections.every((connection) => connection.state === "unverified"));
      assert.equal((await db.select().from(agents).where(eq(agents.workspaceId, ctx.workspace.id))).length, 1);
      assert.equal((await db.select().from(subscriptions).where(eq(subscriptions.agentId, agentId))).length, 0);
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, ctx.workspace.id));
      assert.equal(workspace.creditsIncluded, 0);
      await assert.rejects(configureAgentPackage(ctx, { ...input, overlay: { ...input.overlay, name: "Changed" } }, key), { code: "idempotency_conflict" });
      const otherResult = await configureAgentPackage(other, input, key);
      assert.notEqual(otherResult.agent.id, agentId);
    });

    await t.test("tenant scoping covers reads, deployment and local deletion", async () => {
      assert.equal(await getAgentPackageRecord(agentId, other.workspace.id), null);
      assert.equal(await getConfiguredAgentPackage(agentId, other.workspace.id), null);
      assert.equal(await getAgentPackageRecord("invalid-id", ctx.workspace.id), null);
      assert.equal(await deletePackageDraft(agentId, other.workspace.id), false);
      await assert.rejects(deployAgentPackage(agentId, other.workspace.id), { code: "package_not_found" });
    });

    await t.test("before migration, only persisted legacy roles bypass the missing table", async () => {
      await db.insert(agentRoles).values({ id: "package-test-legacy", name: "Legacy test", blurb: "Legacy", hue: "#577B62", mono: "L" }).onConflictDoNothing();
      const [legacy] = await db.insert(agents).values({ workspaceId: ctx.workspace.id, createdById: ctx.user.id, name: "Legacy", roleId: "package-test-legacy" }).returning();
      await sql.unsafe("ALTER TABLE agent_packages RENAME TO package_test_held");
      try {
        await assert.rejects(getAgentPackageRecord(agentId, ctx.workspace.id), { code: "package_unavailable", status: 503 });
        await assert.rejects(getConfiguredAgentPackage(agentId, ctx.workspace.id), { code: "package_unavailable", status: 503 });
        await assert.rejects(configureAgentPackage(ctx, input, randomUUID()), { code: "package_unavailable", status: 503 });
        await assert.rejects(deployAgentPackage(agentId, ctx.workspace.id), { code: "package_unavailable", status: 503 });
        await assert.rejects(deletePackageDraft(agentId, ctx.workspace.id), { code: "package_unavailable", status: 503 });
        assert.equal(await legacyPackageGuard(legacy.id, ctx.workspace.id), null);
        assert.equal(await getLegacyAgentPackageRecord(legacy.id, ctx.workspace.id), null);
        assert.equal((await legacyPackageGuard(agentId, ctx.workspace.id))!.status, 503);
        await assert.rejects(getLegacyAgentPackageRecord(agentId, ctx.workspace.id), { code: "package_unavailable", status: 503 });
      } finally {
        await sql.unsafe("ALTER TABLE package_test_held RENAME TO agent_packages");
        await db.delete(agents).where(eq(agents.id, legacy.id));
      }
      assert.ok(await getAgentPackageRecord(agentId, ctx.workspace.id), "No stale readiness cache survives migration");
      assert.equal((await legacyPackageGuard(agentId, ctx.workspace.id))!.status, 409);
    });

    await t.test("a package role with no package record never falls through to legacy execution", async () => {
      const [orphan] = await db.insert(agents).values({ workspaceId: ctx.workspace.id, createdById: ctx.user.id, name: "Orphan", roleId: "package-agent" }).returning();
      try {
        assert.equal((await legacyPackageGuard(orphan.id, ctx.workspace.id))!.status, 503);
        await assert.rejects(getLegacyAgentPackageRecord(orphan.id, ctx.workspace.id), { code: "package_unavailable" });
      } finally { await db.delete(agents).where(eq(agents.id, orphan.id)); }
    });

    await t.test("an unrelated package schema error never disables the legacy guard", async () => {
      const [legacy] = await db.insert(agents).values({ workspaceId: ctx.workspace.id, createdById: ctx.user.id, name: "Legacy schema error", roleId: "package-test-legacy" }).returning();
      await sql.unsafe("ALTER TABLE agent_packages RENAME COLUMN deployment_state TO package_test_state");
      try {
        await assert.rejects(legacyPackageGuard(legacy.id, ctx.workspace.id), (error: unknown) => {
          assert.equal(isPackageTableMissing(error), false);
          assert.equal((error as { cause?: { code?: string } }).cause?.code, "42703");
          return true;
        });
      } finally {
        await sql.unsafe("ALTER TABLE agent_packages RENAME COLUMN package_test_state TO deployment_state");
        await db.delete(agents).where(eq(agents.id, legacy.id));
      }
    });

    await t.test("a failed package insert rolls back its draft agent", async () => {
      await sql.unsafe(`CREATE FUNCTION package_test_reject_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.idempotency_key = 'force-rollback-test' THEN RAISE EXCEPTION 'deliberate test failure'; END IF; RETURN NEW; END $$`);
      await sql.unsafe(`CREATE TRIGGER package_test_reject_insert BEFORE INSERT ON agent_packages FOR EACH ROW EXECUTE FUNCTION package_test_reject_insert()`);
      try {
        await assert.rejects(configureAgentPackage(ctx, { ...input, overlay: { ...input.overlay, name: "Must roll back" } }, "force-rollback-test"));
        assert.equal((await db.select().from(agents).where(and(eq(agents.workspaceId, ctx.workspace.id), eq(agents.name, "Must roll back")))).length, 0);
      } finally {
        await sql.unsafe("DROP TRIGGER package_test_reject_insert ON agent_packages");
        await sql.unsafe("DROP FUNCTION package_test_reject_insert()");
      }
    });

    await t.test("absent manager cannot provision, charge or change draft readiness", async () => {
      delete process.env.ARK_PACKAGE_MANAGER_URL;
      delete process.env.ARK_PACKAGE_MANAGER_TOKEN;
      delete process.env.ARK_PACKAGE_MANAGER_HARNESSES;
      const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network call"); });
      try {
        await assert.rejects(deployAgentPackage(agentId, ctx.workspace.id), { code: "package_manager_unconfigured" });
        assert.equal(fetchMock.mock.callCount(), 0);
        assert.equal((await getAgentPackageRecord(agentId, ctx.workspace.id))!.deploymentState, "configured");
      } finally { fetchMock.mock.restore(); }
    });

    process.env.ARK_PACKAGE_MANAGER_URL = "https://package-manager.invalid/deployments";
    process.env.ARK_PACKAGE_MANAGER_TOKEN = "test-only-token";
    process.env.ARK_PACKAGE_MANAGER_HARNESSES = "hermes";
    let deploymentId = "";
    await t.test("invalid acknowledgment stays unready and preserves its upstream idempotency key", async () => {
      const fetchMock = t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
        deploymentId = (JSON.parse(init!.body as string) as PackageRuntimeRequest).deploymentId;
        return Response.json({ state: "ready" });
      });
      try {
        await assert.rejects(deployAgentPackage(agentId, ctx.workspace.id), { code: "invalid_runtime_acknowledgment" });
        const record = (await getAgentPackageRecord(agentId, ctx.workspace.id))!;
        assert.equal(record.deploymentState, "failed");
        assert.equal(record.deploymentId, deploymentId);
        const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
        assert.equal(agent.status, "draft");
        assert.equal((await db.select().from(subscriptions).where(eq(subscriptions.agentId, agentId))).length, 0);
        await assert.rejects(deletePackageDraft(agentId, ctx.workspace.id), { code: "package_runtime_lifecycle_unavailable" });
      } finally { fetchMock.mock.restore(); }
    });

    await t.test("verified acknowledgment activates once; legacy execution remains blocked", async () => {
      let releaseManager!: () => void;
      let notifyManagerStarted!: () => void;
      const managerReleased = new Promise<void>((resolve) => { releaseManager = resolve; });
      const managerStarted = new Promise<void>((resolve) => { notifyManagerStarted = resolve; });
      const fetchMock = t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
        const request = JSON.parse(init!.body as string) as PackageRuntimeRequest;
        assert.equal(request.deploymentId, deploymentId);
        notifyManagerStarted();
        await managerReleased;
        return Response.json({
          protocolVersion: request.protocolVersion, deploymentId: request.deploymentId, agentId: request.agentId,
          workspaceId: request.workspaceId, harness: request.harness, bundleDigest: request.bundleDigest,
          policyDigest: request.policyDigest, state: "ready", runtimeId: "verified-package-test-runtime",
          installedSkills: request.skills, policyEnforced: true,
          connections: request.connections.map((connection) => ({ id: connection.id, state: connection.required ? "connected" : "missing" })),
        });
      });
      try {
        const deploying = deployAgentPackage(agentId, ctx.workspace.id);
        await managerStarted;
        const concurrent = await deployAgentPackage(agentId, ctx.workspace.id);
        assert.equal(concurrent.pending, true);
        assert.equal(fetchMock.mock.callCount(), 1);
        releaseManager();
        const result = await deploying;
        assert.equal(result.agent!.status, "paused");
        assert.equal(result.package!.ready, true);
        assert.ok(result.package!.skills.every((skill) => skill.state === "installed"));
        await deployAgentPackage(agentId, ctx.workspace.id);
        assert.equal(fetchMock.mock.callCount(), 1);
        assert.equal((await legacyPackageGuard(agentId, ctx.workspace.id))!.status, 409);
        assert.equal(await legacyPackageGuard(agentId, other.workspace.id), null);
        const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
        assert.equal(agent.agentManagerId, null);
        assert.equal((await db.select().from(subscriptions).where(eq(subscriptions.agentId, agentId))).length, 0);
        await assert.rejects(deletePackageDraft(agentId, ctx.workspace.id), { code: "package_runtime_lifecycle_unavailable" });
      } finally { releaseManager(); fetchMock.mock.restore(); }
    });

    await t.test("never-deployed drafts delete locally with the saved bundle", async () => {
      const draft = await configureAgentPackage(ctx, input, randomUUID());
      assert.equal(await deletePackageDraft(draft.agent.id, ctx.workspace.id), true);
      assert.equal(await getAgentPackageRecord(draft.agent.id, ctx.workspace.id), null);
      assert.equal((await db.select().from(agents).where(eq(agents.id, draft.agent.id))).length, 0);
    });
  } finally {
    for (const userId of userIds) await db.delete(users).where(eq(users.id, userId));
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await sql.end();
    await (globalThis as unknown as { __arkPg?: ReturnType<typeof postgres> }).__arkPg?.end();
  }
});
