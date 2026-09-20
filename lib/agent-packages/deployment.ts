import "server-only";
import { z } from "zod";
import { HARNESS_IDS, type Harness } from "@/lib/harness";

export const PACKAGE_RUNTIME_PROTOCOL = "ark-package-runtime/v1" as const;

export class PackageDeploymentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "PackageDeploymentError";
  }
}

export type PackageManagerConfig = {
  url: string;
  token: string;
  harnesses: Harness[];
};

/** Configuration is explicitly separate from the legacy instance manager. */
export function packageManagerConfig(
  env: Record<string, string | undefined> = process.env,
): PackageManagerConfig | null {
  const url = env.ARK_PACKAGE_MANAGER_URL?.trim();
  const token = env.ARK_PACKAGE_MANAGER_TOKEN?.trim();
  const rawHarnesses = env.ARK_PACKAGE_MANAGER_HARNESSES?.split(",").map((value) => value.trim()).filter(Boolean);
  if (!url || !token || !rawHarnesses?.length) return null;
  if (rawHarnesses.some((value) => !(HARNESS_IDS as readonly string[]).includes(value))) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash || parsed.search) return null;
  } catch {
    return null;
  }
  return { url, token, harnesses: [...new Set(rawHarnesses)] as Harness[] };
}

export function packageDeploymentAvailability(harness: Harness, config = packageManagerConfig()) {
  if (!config) return { available: false, reason: "package_manager_unconfigured" as const };
  if (!config.harnesses.includes(harness)) return { available: false, reason: "package_harness_unsupported" as const };
  return { available: true, reason: null };
}

export type PackageRuntimeRequest = {
  protocolVersion: typeof PACKAGE_RUNTIME_PROTOCOL;
  deploymentId: string;
  agentId: string;
  workspaceId: string;
  harness: Harness;
  bundleDigest: string;
  policyDigest: string;
  skills: { id: string; digest: string }[];
  connections: { id: string; required: boolean }[];
  bundle: unknown;
};

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const acknowledgmentSchema = z.object({
  protocolVersion: z.literal(PACKAGE_RUNTIME_PROTOCOL),
  deploymentId: z.uuid(),
  agentId: z.uuid(),
  workspaceId: z.uuid(),
  harness: z.enum(HARNESS_IDS),
  bundleDigest: digest,
  policyDigest: digest,
  state: z.literal("ready"),
  runtimeId: z.string().min(1).max(120),
  installedSkills: z.array(z.object({ id: z.string().min(1), digest })).max(100),
  policyEnforced: z.literal(true),
  connections: z.array(z.object({
    id: z.string().min(1),
    state: z.enum(["connected", "missing"]),
  })).max(100),
}).strict();

export type PackageRuntimeAcknowledgment = z.infer<typeof acknowledgmentSchema>;

/**
 * A 200/ready word is insufficient: all evidence must match THIS persisted
 * deployment and every expected skill, connection and policy digest.
 */
export function verifyPackageAcknowledgment(
  request: PackageRuntimeRequest,
  raw: unknown,
): PackageRuntimeAcknowledgment {
  const parsed = acknowledgmentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PackageDeploymentError("invalid_runtime_acknowledgment", "The package manager did not return a complete installation acknowledgment.", 502);
  }
  const ack = parsed.data;
  for (const key of ["deploymentId", "agentId", "workspaceId", "harness", "bundleDigest", "policyDigest"] as const) {
    if (ack[key] !== request[key]) {
      throw new PackageDeploymentError("runtime_acknowledgment_mismatch", "The package manager acknowledged a different deployment or package.", 502);
    }
  }
  const skills = new Map(ack.installedSkills.map((skill) => [skill.id, skill.digest]));
  if (skills.size !== ack.installedSkills.length || skills.size !== request.skills.length ||
    request.skills.some((skill) => skills.get(skill.id) !== skill.digest)) {
    throw new PackageDeploymentError("skill_installation_unverified", "The package manager did not verify every pinned skill.", 502);
  }
  const connections = new Map(ack.connections.map((connection) => [connection.id, connection.state]));
  if (connections.size !== ack.connections.length || connections.size !== request.connections.length ||
    request.connections.some((connection) => !connections.has(connection.id))) {
    throw new PackageDeploymentError("connection_acknowledgment_mismatch", "The package manager did not acknowledge the package connections.", 502);
  }
  if (request.connections.some((connection) => connection.required && connections.get(connection.id) !== "connected")) {
    throw new PackageDeploymentError("required_connections_missing", "Required package connections are not connected.", 409);
  }
  return ack;
}

/** No mock-success path, redirects or caller-provided manager URLs. */
export async function deployPackageToManager(
  request: PackageRuntimeRequest,
  dependencies: { config?: PackageManagerConfig | null; fetch?: typeof fetch } = {},
): Promise<PackageRuntimeAcknowledgment> {
  const config = dependencies.config === undefined ? packageManagerConfig() : dependencies.config;
  const availability = packageDeploymentAvailability(request.harness, config);
  if (!availability.available || !config) {
    throw new PackageDeploymentError(availability.reason ?? "package_manager_unconfigured", "A compatible package manager must be configured before deployment.", 503);
  }
  let response: Response;
  try {
    response = await (dependencies.fetch ?? fetch)(config.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        "idempotency-key": request.deploymentId,
      },
      body: JSON.stringify(request),
      redirect: "error",
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
  } catch {
    // Never echo network errors: upstream URLs or credentials can be embedded.
    throw new PackageDeploymentError("package_manager_unavailable", "The package manager could not confirm deployment. Retry with the same saved package.", 502);
  }
  if (!response.ok) {
    throw new PackageDeploymentError("package_manager_rejected", "The package manager did not accept the deployment.", 502);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new PackageDeploymentError("invalid_runtime_acknowledgment", "The package manager returned an invalid acknowledgment.", 502);
  }
  return verifyPackageAcknowledgment(request, raw);
}
