export const PACKAGE_IDS = ['recruiting', 'job-applicant', 'video-creator', 'sales-outreach', 'email-assistant'] as const;
export type PackageId = (typeof PACKAGE_IDS)[number];
export type PackageHarness = 'openclaw' | 'hermes' | 'codex';
export interface PackageOverlay { name: string; instructions: string; organization: string; goals: string; tone: 'professional' | 'warm' | 'concise'; harness: PackageHarness }
export interface PackageSkill { id: string; name: string; description: string; instructions: string[]; outputs: string[]; tools: string[]; checks: string[] }
export interface PackageWorker { id: string; name: string; mission: string; skills: string[]; tools: string[]; handoff: string }
export interface PackageConnector { id: string; name: string; purpose: string; required: boolean; scopes: string[]; setup: string }
export interface PackageWorkflow { id: string; name: string; trigger: string; steps: string[]; approval: string }
export interface PackageEvaluation { id: string; scenario: string; expected: string[]; forbidden: string[] }
export interface PackageSource { title: string; url: string; note: string }
export interface AgentPackage { id: PackageId; version: string; name: string; summary: string; outcome: string; skills: PackageSkill[]; workers: PackageWorker[]; connectors: PackageConnector[]; workflows: PackageWorkflow[]; evaluations: PackageEvaluation[]; sources: PackageSource[] }
export interface CompiledAgentPackage { schemaVersion: 1; packageId: PackageId; version: string; harness: PackageHarness; name: string; digest: string; policyDigest: string; skills: Array<{id: string; digest: string}>; requiredConnectors: string[]; files: Array<{path: string; content: string; sha256: string}> }
