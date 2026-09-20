import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PACKAGE_RUNTIME_PROTOCOL,
  PackageDeploymentError,
  deployPackageToManager,
  packageManagerConfig,
  verifyPackageAcknowledgment,
  type PackageRuntimeRequest,
} from "../lib/agent-packages/deployment";

const request: PackageRuntimeRequest = {
  protocolVersion: PACKAGE_RUNTIME_PROTOCOL,
  deploymentId: "e1147b5b-aab2-4e82-af09-36c1d8e89010",
  agentId: "e1147b5b-aab2-4e82-af09-36c1d8e89011",
  workspaceId: "e1147b5b-aab2-4e82-af09-36c1d8e89012",
  harness: "hermes",
  bundleDigest: "a".repeat(64),
  policyDigest: "b".repeat(64),
  skills: [{ id: "research", digest: "c".repeat(64) }],
  connections: [{ id: "email", required: true }, { id: "calendar", required: false }],
  bundle: { files: [] },
};

const manager = { url: "https://manager.example.test/packages", token: "private-manager-token", harnesses: ["hermes" as const] };
const acknowledgment = () => ({
  protocolVersion: request.protocolVersion,
  deploymentId: request.deploymentId,
  agentId: request.agentId,
  workspaceId: request.workspaceId,
  harness: request.harness,
  bundleDigest: request.bundleDigest,
  policyDigest: request.policyDigest,
  state: "ready",
  runtimeId: "runtime-123",
  installedSkills: structuredClone(request.skills),
  policyEnforced: true,
  connections: [{ id: "email", state: "connected" }, { id: "calendar", state: "missing" }],
});

test("package manager configuration requires separate HTTPS endpoint, token and explicit harness allowlist", () => {
  const env = { ARK_PACKAGE_MANAGER_URL: manager.url, ARK_PACKAGE_MANAGER_TOKEN: manager.token, ARK_PACKAGE_MANAGER_HARNESSES: "hermes, codex" };
  assert.equal(packageManagerConfig({}), null);
  assert.deepEqual(packageManagerConfig(env)?.harnesses, ["hermes", "codex"]);
  for (const override of [
    { ARK_PACKAGE_MANAGER_TOKEN: "" },
    { ARK_PACKAGE_MANAGER_HARNESSES: "" },
    { ARK_PACKAGE_MANAGER_HARNESSES: "hermes,unverified" },
    { ARK_PACKAGE_MANAGER_URL: "http://manager.test" },
    { ARK_PACKAGE_MANAGER_URL: "https://user:secret@manager.test" },
    { ARK_PACKAGE_MANAGER_URL: "https://manager.test?token=secret" },
  ]) assert.equal(packageManagerConfig({ ...env, ...override }), null);
});

test("unconfigured or unsupported manager fails before any provisioning request", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json(acknowledgment()); };
  await assert.rejects(deployPackageToManager(request, { config: null, fetch: fetcher }), { code: "package_manager_unconfigured" });
  await assert.rejects(deployPackageToManager({ ...request, harness: "openclaw" }, { config: manager, fetch: fetcher }), { code: "package_harness_unsupported" });
  assert.equal(calls, 0);
});

test("verified synchronous response binds runtime identity to the exact request", async () => {
  const calls: RequestInit[] = [];
  const ack = await deployPackageToManager(request, { config: manager, fetch: async (url, init) => {
    assert.equal(url, manager.url);
    calls.push(init!);
    return Response.json(acknowledgment());
  } });
  assert.equal(ack.runtimeId, "runtime-123");
  const headers = calls[0]!.headers as Record<string, string>;
  assert.equal(headers.authorization, `Bearer ${manager.token}`);
  assert.equal(headers["idempotency-key"], request.deploymentId);
  assert.equal(calls[0]!.redirect, "error");
  assert.deepEqual(JSON.parse(calls[0]!.body as string), request);
});

test("wrong workspace, agent, deployment, harness, package or policy acknowledgment cannot activate an agent", () => {
  for (const key of ["workspaceId", "agentId", "deploymentId", "harness", "bundleDigest", "policyDigest"] as const) {
    const ack = acknowledgment();
    const wrong = key.endsWith("Id") ? "e1147b5b-aab2-4e82-af09-36c1d8e89099" : key === "harness" ? "codex" : "d".repeat(64);
    assert.throws(() => verifyPackageAcknowledgment(request, { ...ack, [key]: wrong }), { code: "runtime_acknowledgment_mismatch" });
  }
});

test("ready without installed skill digests and policy enforcement is not ready", () => {
  assert.throws(() => verifyPackageAcknowledgment(request, { ...acknowledgment(), installedSkills: [] }), { code: "skill_installation_unverified" });
  assert.throws(() => verifyPackageAcknowledgment(request, { ...acknowledgment(), installedSkills: [{ id: "research", digest: "d".repeat(64) }] }), { code: "skill_installation_unverified" });
  assert.throws(() => verifyPackageAcknowledgment(request, { ...acknowledgment(), installedSkills: [request.skills[0], request.skills[0]] }), { code: "skill_installation_unverified" });
  assert.throws(() => verifyPackageAcknowledgment(request, { ...acknowledgment(), policyEnforced: false }), { code: "invalid_runtime_acknowledgment" });
  assert.throws(() => verifyPackageAcknowledgment(request, { state: "ready" }), { code: "invalid_runtime_acknowledgment" });
});

test("required connections must be acknowledged as connected; optional missing is truthful", () => {
  assert.equal(verifyPackageAcknowledgment(request, acknowledgment()).connections[1]!.state, "missing");
  assert.throws(() => verifyPackageAcknowledgment(request, { ...acknowledgment(), connections: [] }), { code: "connection_acknowledgment_mismatch" });
  assert.throws(() => verifyPackageAcknowledgment(request, { ...acknowledgment(), connections: [{ id: "email", state: "missing" }, { id: "calendar", state: "missing" }] }), { code: "required_connections_missing" });
});

test("upstream errors never expose credentials or pretend an installation completed", async () => {
  await assert.rejects(deployPackageToManager(request, { config: manager, fetch: async () => {
    throw new Error(`failed: ${manager.token}`);
  } }), (error: unknown) => error instanceof PackageDeploymentError && !error.message.includes(manager.token) && error.code === "package_manager_unavailable");
  await assert.rejects(deployPackageToManager(request, { config: manager, fetch: async () => new Response("secret upstream failure", { status: 500 }) }), { code: "package_manager_rejected" });
  await assert.rejects(deployPackageToManager(request, { config: manager, fetch: async () => new Response("not-json") }), { code: "invalid_runtime_acknowledgment" });
});
