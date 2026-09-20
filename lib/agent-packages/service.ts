import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { agentPackages, agentRoles, agents } from "@/lib/db/schema";
import { apiError } from "@/lib/api";
import type { AuthContext } from "@/lib/auth";
import { getAgentPackage } from "./catalog";
import { compileAgentPackage } from "./compiler";
import { packageIdSchema, packageOverlaySchema } from "./validation";
import {
  PACKAGE_RUNTIME_PROTOCOL,
  PackageDeploymentError,
  deployPackageToManager,
  packageDeploymentAvailability,
  type PackageRuntimeRequest,
} from "./deployment";

export const configurePackageSchema = z.object({ packageId: packageIdSchema, overlay: packageOverlaySchema }).strict();
export type ConfigurePackageInput = z.infer<typeof configurePackageSchema>;
export type AgentPackageRecord = typeof agentPackages.$inferSelect;

/** Only this precise missing relation is an expected pre-migration condition. */
export function isPackageTableMissing(error: unknown): boolean {
  let current = error;
  const seen = new Set<unknown>();
  for (let depth = 0; current && typeof current === "object" && depth < 5 && !seen.has(current); depth++) {
    seen.add(current);
    const detail = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (detail.code === "42P01" && typeof detail.message === "string" &&
      /relation "(?:public\.)?agent_packages" does not exist/.test(detail.message)) return true;
    current = detail.cause;
  }
  return false;
}

function rethrowPackageStorageError(error: unknown): never {
  if (isPackageTableMissing(error)) {
    throw new PackageDeploymentError("package_unavailable", "Agent packages are unavailable until the package database migration is applied.", 503);
  }
  throw error;
}

export function packageIdempotencyKey(raw: string | null): string {
  if (!raw || !/^[A-Za-z0-9._:-]{8,80}$/.test(raw)) {
    throw new PackageDeploymentError("invalid_idempotency_key", "Provide an Idempotency-Key of 8–80 letters, numbers, dots, colons, underscores or hyphens.", 422);
  }
  return raw;
}

/** Parsed fields have a fixed order; the package snapshot has its own digest. */
export function packageRequestDigest(input: ConfigurePackageInput): string {
  const parsed = configurePackageSchema.parse(input);
  return createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
}

export function assertPackageReplay(record: Pick<AgentPackageRecord, "requestDigest">, requestDigest: string) {
  if (record.requestDigest !== requestDigest) {
    throw new PackageDeploymentError("idempotency_conflict", "This Idempotency-Key already belongs to a different package configuration.", 409);
  }
}

export async function getAgentPackageRecord(agentId: string, workspaceId: string) {
  if (!z.uuid().safeParse(agentId).success) return null;
  const [row] = await db.select().from(agentPackages)
    .where(and(eq(agentPackages.agentId, agentId), eq(agentPackages.workspaceId, workspaceId))).limit(1)
    .catch(rethrowPackageStorageError);
  return row ?? null;
}

/** A persisted legacy role may keep working before the new table is deployed. */
export async function getLegacyAgentPackageRecord(agentId: string, workspaceId: string) {
  const [agent] = await db.select({ roleId: agents.roleId }).from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId))).limit(1);
  if (!agent) return null;
  try {
    const row = await getAgentPackageRecord(agentId, workspaceId);
    if (!row && agent.roleId === "package-agent") {
      throw new PackageDeploymentError("package_unavailable", "This package agent has no readable package record. Legacy execution is unavailable.", 503);
    }
    return row;
  } catch (error) {
    if (agent.roleId !== "package-agent" && error instanceof PackageDeploymentError && error.code === "package_unavailable") return null;
    throw error;
  }
}

export function serializeAgentPackage(row: AgentPackageRecord) {
  const installed = new Map(row.acknowledgment?.installedSkills.map((skill) => [skill.id, skill.digest]) ?? []);
  const connections = new Map(row.acknowledgment?.connections.map((connection) => [connection.id, connection.state]) ?? []);
  const ready = row.deploymentState === "ready" && !!row.acknowledgment;
  return {
    packageId: row.packageId,
    version: row.packageVersion,
    digest: row.bundleDigest,
    harness: row.bundle.harness,
    deploymentState: row.deploymentState,
    ready,
    availability: packageDeploymentAvailability(row.bundle.harness),
    lastError: row.lastError,
    configuredAt: row.createdAt.toISOString(),
    readyAt: row.readyAt?.toISOString() ?? null,
    skills: row.bundle.skills.map((skill) => ({
      ...skill,
      name: row.definition.skills.find((definition) => definition.id === skill.id)?.name ?? skill.id,
      state: ready && installed.get(skill.id) === skill.digest ? "installed" as const : "pending" as const,
    })),
    connections: row.definition.connectors.map((connector) => ({
      ...connector,
      state: connections.get(connector.id) ?? "unverified" as const,
    })),
    definition: row.definition,
    overlay: row.overlay,
  };
}

async function packageResult(record: AgentPackageRecord) {
  const [agent] = await db.select({ id: agents.id, name: agents.name, status: agents.status, engine: agents.engine })
    .from(agents).where(and(eq(agents.id, record.agentId), eq(agents.workspaceId, record.workspaceId))).limit(1);
  if (!agent) throw new PackageDeploymentError("agent_not_found", "Agent not found.", 404);
  return { agent, package: serializeAgentPackage(record) };
}

/** No network, subscription, credit, channel or runtime side effects. */
export async function configureAgentPackage(ctx: AuthContext, raw: ConfigurePackageInput, key: string) {
  const input = configurePackageSchema.parse(raw);
  const idempotencyKey = packageIdempotencyKey(key);
  const requestDigest = packageRequestDigest(input);
  const result = await db.transaction(async (tx) => {
    // A transaction-scoped lock serializes keys even before a row exists. The
    // unique index independently guarantees that no duplicate can be committed.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${ctx.workspace.id}:${idempotencyKey}`}, 0))`);
    const [existing] = await tx.select().from(agentPackages)
      .where(and(eq(agentPackages.workspaceId, ctx.workspace.id), eq(agentPackages.idempotencyKey, idempotencyKey))).limit(1);
    if (existing) {
      assertPackageReplay(existing, requestDigest);
      return { record: existing, created: false };
    }
    const definition = getAgentPackage(input.packageId);
    if (!definition) throw new PackageDeploymentError("unknown_package", "Unknown package.", 404);
    const bundle = compileAgentPackage(input.packageId, input.overlay);
    // Use a dedicated local role, never a remote manager role/category id.
    await tx.insert(agentRoles).values({
      id: "package-agent", name: "Package agent", blurb: "A versioned agent package", hue: "#577B62", mono: "P",
    }).onConflictDoNothing();
    const [agent] = await tx.insert(agents).values({
      workspaceId: ctx.workspace.id,
      createdById: ctx.user.id,
      name: input.overlay.name,
      roleId: "package-agent",
      engine: input.overlay.harness,
      status: "draft",
      instructions: input.overlay.instructions,
      rules: "Use the saved package policy. Legacy execution is disabled for package agents.",
      deploymentStatus: "package_configured",
      hue: "#577B62",
    }).returning();
    const [record] = await tx.insert(agentPackages).values({
      agentId: agent.id,
      workspaceId: ctx.workspace.id,
      idempotencyKey,
      requestDigest,
      packageId: definition.id,
      packageVersion: definition.version,
      bundleDigest: bundle.digest,
      definition,
      overlay: input.overlay,
      bundle,
    }).returning();
    return { record, created: true };
  }).catch(rethrowPackageStorageError);
  return { ...await packageResult(result.record), created: result.created };
}

export async function getConfiguredAgentPackage(agentId: string, workspaceId: string) {
  const row = await getAgentPackageRecord(agentId, workspaceId);
  return row ? packageResult(row) : null;
}

export function packageRuntimeRequest(row: AgentPackageRecord): PackageRuntimeRequest {
  return {
    protocolVersion: PACKAGE_RUNTIME_PROTOCOL,
    deploymentId: row.deploymentId,
    agentId: row.agentId,
    workspaceId: row.workspaceId,
    harness: row.bundle.harness,
    bundleDigest: row.bundleDigest,
    policyDigest: row.bundle.policyDigest,
    skills: row.bundle.skills,
    connections: row.definition.connectors.map(({ id, required }) => ({ id, required })),
    bundle: row.bundle,
  };
}

/** Replays use the same upstream deployment id, including after a timeout. */
export async function deployAgentPackage(agentId: string, workspaceId: string) {
  const saved = await getAgentPackageRecord(agentId, workspaceId);
  if (!saved) throw new PackageDeploymentError("package_not_found", "Agent package not found.", 404);
  if (saved.deploymentState === "ready") return { ...await packageResult(saved), pending: false };
  const availability = packageDeploymentAvailability(saved.bundle.harness);
  if (!availability.available) {
    throw new PackageDeploymentError(availability.reason!, "A compatible package manager must be configured before deployment.", 503);
  }
  const claim = randomUUID();
  const startedAt = new Date();
  const [claimed] = await db.update(agentPackages).set({
    deploymentState: "deploying", deploymentClaim: claim, deploymentStartedAt: startedAt, lastError: null, updatedAt: startedAt,
  }).where(and(
    eq(agentPackages.agentId, agentId),
    eq(agentPackages.workspaceId, workspaceId),
    ne(agentPackages.deploymentState, "ready"),
    or(ne(agentPackages.deploymentState, "deploying"), lt(agentPackages.deploymentStartedAt, new Date(Date.now() - 120_000))),
  )).returning().catch(rethrowPackageStorageError);
  if (!claimed) {
    const current = await getAgentPackageRecord(agentId, workspaceId);
    if (!current) throw new PackageDeploymentError("package_not_found", "Agent package not found.", 404);
    return { ...await packageResult(current), pending: current.deploymentState !== "ready" };
  }
  try {
    const acknowledgment = await deployPackageToManager(packageRuntimeRequest(claimed));
    const readyAt = new Date();
    await db.transaction(async (tx) => {
      const [updated] = await tx.update(agentPackages).set({
        deploymentState: "ready", acknowledgment, readyAt, lastError: null, deploymentClaim: null, updatedAt: readyAt,
      }).where(and(eq(agentPackages.agentId, agentId), eq(agentPackages.workspaceId, workspaceId), eq(agentPackages.deploymentClaim, claim))).returning();
      if (!updated) throw new PackageDeploymentError("deployment_superseded", "A newer deployment attempt owns this package.", 409);
      await tx.update(agents).set({
        // Installation evidence does not provide an execution/approval bridge.
        status: "paused", deploymentStatus: "package_ready", provisionedAt: readyAt,
        appliedConfigRevision: sql`${agents.configRevision}`, updatedAt: readyAt,
      }).where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)));
    }).catch(rethrowPackageStorageError);
  } catch (error) {
    const safeError = error instanceof PackageDeploymentError ? error :
      new PackageDeploymentError("deployment_persistence_failed", "Deployment could not be recorded. Retry the saved package.", 502);
    await db.update(agentPackages).set({ deploymentState: "failed", deploymentClaim: null, lastError: safeError.code, updatedAt: new Date() })
      .where(and(eq(agentPackages.agentId, agentId), eq(agentPackages.workspaceId, workspaceId), eq(agentPackages.deploymentClaim, claim)))
      .catch(rethrowPackageStorageError);
    throw safeError;
  }
  const current = await getAgentPackageRecord(agentId, workspaceId);
  if (!current) throw new PackageDeploymentError("package_not_found", "Agent package not found.", 404);
  return { ...await packageResult(current), pending: false };
}

/** Legacy routes cannot edit an immutable digest or fall back to a bare LLM. */
export async function legacyPackageGuard(agentId: string, workspaceId: string) {
  try {
    const row = await getLegacyAgentPackageRecord(agentId, workspaceId);
    return row ? apiError("This agent uses a versioned package. Legacy editing and execution are unavailable; use its package controls.", 409, { code: "package_requires_package_runtime" }) : null;
  } catch (error) {
    if (error instanceof PackageDeploymentError) return apiError(error.message, error.status, { code: error.code });
    throw error;
  }
}

/** Deleting a never-deployed draft is local. Other states need a manager stop contract. */
export async function deletePackageDraft(agentId: string, workspaceId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(agentPackages)
      .where(and(eq(agentPackages.agentId, agentId), eq(agentPackages.workspaceId, workspaceId))).for("update").limit(1);
    if (!row) return false;
    if (row.deploymentState !== "configured") {
      throw new PackageDeploymentError("package_runtime_lifecycle_unavailable", "A package deployment was attempted. Stop and remove its runtime through the package manager before deleting this agent.", 409);
    }
    await tx.delete(agents).where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId)));
    return true;
  }).catch(rethrowPackageStorageError);
}
