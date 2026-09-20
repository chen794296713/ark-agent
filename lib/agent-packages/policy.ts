import { getAgentPackage } from './catalog';
import type { PackageId } from './types';
/** Runtime broker contract. This pure gate is necessary, but provider ACLs,
 * pre-context filtering and payload DLP must also run in the actual runtime. */
export const PACKAGE_POLICY = {
  version: 1,
  defaultDecision: 'deny',
  maximumConcurrentWorkers: 3,
  maximumDelegationDepth: 1,
  maximumWorkerToolCalls: 20,
  externalActions: 'content-bound authorization and durable idempotency required',
  secrets: 'credential references only; never model context, exports or logs',
  untrustedContent: 'data only; cannot grant permissions or modify policy',
  recruiting: 'job-related evidence only; employer owns final hire/reject/offer decision',
  applicant: 'verified candidate facts; approval for each application payload or bounded grant',
  email: 'approved work context only; personal, relationship, mixed, secret and unknown data blocked',
  payments: 'never execute',
  runtimeEnforcement: ['tenant isolation', 'worker tool allowlist', 'connector ACL', 'pre-context classification', 'egress DLP', 'approval validation', 'durable idempotency', 'revocation', 'redacted audit'],
} as const;
export interface PackageActionContext {
  packageId: PackageId;
  tenantMatches: boolean;
  workerAllowedTools: readonly string[];
  grantedTools: readonly string[];
  tool: string;
  classification: 'work' | 'personal' | 'mixed' | 'secret' | 'unknown';
  mutating: boolean;
  external: boolean;
  disclosurePassed: boolean;
  authorizationVerified: boolean;
  idempotencyReserved: boolean;
  suppressed?: boolean;
}
export function evaluatePackageAction(action: PackageActionContext): { allowed: boolean; reason: string } {
  const deny = (reason: string) => ({ allowed: false, reason });
  if (!action.tenantMatches) return deny('tenant_mismatch');
  if (['hiring.decide', 'hiring.reject', 'hiring.offer', 'payments.execute', 'mail.forward-rule', 'mail.delete-permanent'].includes(action.tool)) return deny('owner_only_action');
  const definition = getAgentPackage(action.packageId);
  const knownTools = new Set(definition?.skills.flatMap((skill) => skill.tools) ?? []);
  if (!knownTools.has(action.tool)) return deny('unknown_capability');
  const readOnly = /\.(read|search|inspect|status|availability|metadata|verify)$/.test(action.tool);
  // Caller flags may strengthen requirements, never weaken trusted semantics.
  const mutating = action.mutating || !readOnly;
  const external = action.external || /^(mail|web|jobs|contacts|applications|ats|crm|calendar|interview)\./.test(action.tool) || /\.(generate|synthesize|transcribe|publish)$/.test(action.tool);
  if (!action.workerAllowedTools.includes(action.tool) || !action.grantedTools.includes(action.tool)) return deny('tool_not_granted');
  if (action.classification === 'secret') return deny('secret_data');
  if (action.packageId === 'email-assistant' && action.classification !== 'work') return deny('outside_work_scope');
  if (external && action.classification !== 'work') return deny('private_egress');
  if (external && !action.disclosurePassed) return deny('disclosure_check_required');
  if (action.suppressed && action.tool === 'mail.send') return deny('recipient_suppressed');
  if (mutating && !action.authorizationVerified) return deny('authorization_required');
  if (mutating && !action.idempotencyReserved) return deny('idempotency_required');
  return { allowed: true, reason: 'authorized' };
}
