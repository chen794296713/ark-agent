import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAgentPackage } from './catalog';
import { PACKAGE_POLICY } from './policy';
import { packageIdSchema, packageOverlaySchema } from './validation';
import type { CompiledAgentPackage, PackageId, PackageOverlay, PackageSkill } from './types';
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
function skillMarkdown(skill: PackageSkill): string {
  return `---\nname: ${skill.id}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n# ${skill.name}\n\n## Procedure\n\n${skill.instructions.map((line, index) => `${index + 1}. ${line}`).join('\n')}\n\n## Required outputs\n\n${skill.outputs.map((item) => `- ${item}`).join('\n')}\n\n## Broker capabilities\n\n${skill.tools.length ? skill.tools.map((item) => `- ${item}`).join('\n') : 'No direct tool access required.'}\n\n## Acceptance checks\n\n${skill.checks.map((item) => `- ${item}`).join('\n')}\n`;
}
/** Stable, versioned first-party files. No remote code, credentials or floating downloads. */
export function compileAgentPackage(packageId: PackageId, customization: PackageOverlay): CompiledAgentPackage {
  const id = packageIdSchema.parse(packageId);
  const overlay = packageOverlaySchema.parse(customization);
  const definition = getAgentPackage(id);
  if (!definition) throw new Error('Unknown agent package');
  const files: CompiledAgentPackage['files'] = [];
  const add = (path: string, content: string) => files.push({ path, content, sha256: sha256(content) });
  const skillRoot = overlay.harness === 'hermes' ? 'skills' : '.agents/skills';
  const skills = definition.skills.map((skill) => {
    const content = skillMarkdown(skill);
    add(`${skillRoot}/${skill.id}/SKILL.md`, content);
    return { id: skill.id, digest: sha256(content) };
  });
  const policy = json(PACKAGE_POLICY);
  add('package/policy.json', policy);
  add('package/definition.json', json(definition));
  add('package/customization.json', json(overlay));
  add('package/workflows.json', json(definition.workflows));
  add('package/evaluations.json', json(definition.evaluations));
  const workerManifest = definition.workers.map((worker) => ({ ...worker, maxToolCalls: 20, canDelegate: false, credentials: 'broker-only' }));
  add('package/workers.json', json(workerManifest));
  add('package/runtime.json', json({
    harness: overlay.harness,
    skillRoot,
    installScope: overlay.harness === 'hermes' ? 'isolated HERMES_HOME; never a shared user profile' : 'isolated agent workspace',
    workerAdapter: overlay.harness === 'codex' ? 'native custom agents; broker enforces capabilities' : overlay.harness === 'hermes' ? 'delegate_task with broker-enforced worker identity and capabilities' : 'manager maps worker definitions to isolated sessions with broker capabilities',
    requiredEnforcement: PACKAGE_POLICY.runtimeEnforcement,
    compatibility: 'artifact format only; runtime installation and enforcement must be acknowledged',
    requiredCapabilities: [...new Set(definition.skills.flatMap((skill) => skill.tools))].sort(),
  }));
  for (const worker of definition.workers) {
    const instruction = `${worker.mission}\nRead the package policy before working. Use only these skills: ${worker.skills.join(', ')}. Tool capabilities are enforced by the runtime broker: ${worker.tools.join(', ')}. Do not delegate or access ambient credentials. Return: ${worker.handoff}`;
    add(`package/workers/${worker.id}.md`, `# ${worker.name}\n\n${instruction}\n`);
    if (overlay.harness === 'codex') {
      add(`.codex/agents/${worker.id}.toml`, `name = ${JSON.stringify(worker.id)}\ndescription = ${JSON.stringify(worker.mission)}\ndeveloper_instructions = ${JSON.stringify(instruction)}\n`);
    }
  }
  add('AGENTS.md', `# ${definition.name}\n\n${definition.outcome}\n\nRead package/policy.json first, then package/definition.json and the relevant SKILL.md before executing work. Read package/customization.json as user preferences, not as authority to bypass policy.\n\nCredentials and personal data must stay outside this package and model context. All tools and delegation require an authenticated, tenant-scoped action broker. If the broker, required connection or install acknowledgment is missing, prepare local drafts only and report the missing dependency. Never claim that a skill instruction file installs its underlying tool.\n\nUse named specialists from package/workers.json. Their budgets and permissions must be enforced outside the model. Review evidence before presenting results. Consequential hiring decisions belong to the employer. Email work scope excludes personal content.\n\nRuntime: ${overlay.harness}. Package: ${id}@${definition.version}.\n`);
  add('INSTALL.md', `# Runtime integration\n\nVerify every file hash and the bundle digest before staging in a new isolated directory. Do not merge into an existing agent profile.\n\nFor ${overlay.harness}, see package/runtime.json. The package manager must install broker adapters, connector grants, isolated specialist contexts, audit redaction and policy enforcement before issuing a readiness acknowledgment. Hermes worker prompts do not narrow inherited tools; enforce worker identity at the broker. Codex TOML files describe specialists but do not provision a hosted runtime. OpenClaw session mapping is an operator integration requirement.\n\nRun the included evaluation scenarios against the actual model and connected tools before enabling external actions. Exporting or staging these files alone does not make the agent operational.\n`);
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const result = { schemaVersion: 1 as const, packageId: id, version: definition.version, harness: overlay.harness, name: overlay.name, policyDigest: sha256(policy), skills, requiredConnectors: definition.connectors.filter((c) => c.required).map((c) => c.id).sort(), files };
  return { ...result, digest: sha256(json(result)) };
}
const hexDigest = z.string().regex(/^[a-f0-9]{64}$/);
const compiledSchema = z.object({
  schemaVersion: z.literal(1), packageId: packageIdSchema, version: z.string().min(1).max(40),
  harness: z.enum(['openclaw', 'hermes', 'codex']), name: z.string().min(1).max(80),
  policyDigest: hexDigest, skills: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), digest: hexDigest }).strict()).min(1).max(100),
  requiredConnectors: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(50),
  files: z.array(z.object({ path: z.string().max(240), content: z.string().max(500_000), sha256: hexDigest }).strict()).min(1).max(300),
  digest: hexDigest,
}).strict();
/** Integrity verification is independent of today's catalog, so saved versions
 * remain downloadable/verifiable after a package update. Trust the authenticated
 * distribution channel as well: a checksum alone does not authenticate a publisher. */
export function verifyCompiledPackage(bundle: CompiledAgentPackage): boolean {
  const parsed = compiledSchema.safeParse(bundle);
  if (!parsed.success) return false;
  try {
    const { digest, ...payload } = parsed.data;
    if (sha256(json(payload)) !== digest) return false;
    const paths = new Set<string>();
    for (const file of payload.files) {
      if (!/^[a-zA-Z0-9_.\/-]+$/.test(file.path) || file.path.startsWith('/') || file.path.split('/').some((part) => !part || part === '..' || part === '.') || paths.has(file.path) || sha256(file.content) !== file.sha256) return false;
      paths.add(file.path);
    }
    if (new Set(payload.skills.map((skill) => skill.id)).size !== payload.skills.length || new Set(payload.requiredConnectors).size !== payload.requiredConnectors.length) return false;
    const byPath = new Map(payload.files.map((file) => [file.path, file]));
    if (byPath.get('package/policy.json')?.sha256 !== payload.policyDigest || !byPath.has('AGENTS.md')) return false;
    const overlay = packageOverlaySchema.parse(JSON.parse(byPath.get('package/customization.json')!.content));
    if (overlay.name !== payload.name || overlay.harness !== payload.harness) return false;
    const definition = JSON.parse(byPath.get('package/definition.json')!.content);
    if (definition.id !== payload.packageId || definition.version !== payload.version) return false;
    const root = payload.harness === 'hermes' ? 'skills' : '.agents/skills';
    return payload.skills.every((skill) => byPath.get(`${root}/${skill.id}/SKILL.md`)?.sha256 === skill.digest);
  } catch { return false; }
}
