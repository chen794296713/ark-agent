/**
 * Agent settings model — the configurable surface of an agent, stored in the
 * `agents.settings` JSONB column and merged over DEFAULT_SETTINGS on read.
 *
 * Grounded in the two real engines this product wraps:
 *  - OpenClaw (open runtime): Plugins & Skills system + Local Execution
 *    (shell/files/browser/docker) + heartbeat scheduler across 12+ channels.
 *  - Hermes (Nous Research): model-agnostic LLM provider + a self-improving
 *    learning loop (agent-curated memory, autonomous skill creation).
 *
 * Client- and server-safe (no server-only / db imports).
 */

export type Tone = "professional" | "friendly" | "concise" | "formal" | "playful";
export type ResponseLanguage = "auto" | "en" | "zh" | "zht" | "ja";
export type Autonomy = "suggest" | "ask" | "auto";
export type ReasoningEffort = "low" | "medium" | "high";

export interface AgentSettings {
  // ---- Behavior ----
  tone: Tone;
  responseLanguage: ResponseLanguage;
  timezone: string; // IANA

  // ---- Autonomy & approvals ----
  autonomy: Autonomy;
  approvalAmount: number; // require human approval for money/commitments at or above this (USD); 0 = always ask
  approveExternalSends: boolean; // approve before sending anything externally
  dailyActionLimit: number; // 0 = unlimited

  // ---- Schedule ----
  alwaysOn: boolean;
  workStart: string; // "09:00"
  workEnd: string; // "18:00"
  workDays: number[]; // 0=Sun … 6=Sat
  heartbeatMinutes: number; // OpenClaw heartbeat / Hermes nudge cadence

  // ---- Escalation & notifications ----
  escalateTo: string; // email
  notifyNeedsReview: boolean;
  notifyErrors: boolean;
  dailyDigest: boolean;
  digestTime: string; // "18:00"

  // ---- LLM provider (model-agnostic) ----
  model: string; // "auto" or a provider/model id
  temperature: number; // 0..1
  maxTokens: number;
  reasoningEffort: ReasoningEffort; // Hermes deep-reasoning depth

  // ---- Memory & knowledge ----
  memoryEnabled: boolean;
  retentionDays: number;
  knowledgeUrls: string[];

  // ---- Limits ----
  monthlyCreditCap: number; // 0 = use plan allowance

  // ---- OpenClaw: skills + local execution tools ----
  skills: string[];
  tools: { shell: boolean; files: boolean; browser: boolean; docker: boolean; code: boolean };

  // ---- Hermes: self-improving learning loop ----
  selfImprove: boolean;
  autoCreateSkills: boolean;
}

export const DEFAULT_SETTINGS: AgentSettings = {
  tone: "professional",
  responseLanguage: "auto",
  timezone: "Asia/Singapore",

  autonomy: "ask",
  approvalAmount: 300,
  approveExternalSends: false,
  dailyActionLimit: 0,

  alwaysOn: true,
  workStart: "09:00",
  workEnd: "18:00",
  workDays: [1, 2, 3, 4, 5],
  heartbeatMinutes: 15,

  escalateTo: "",
  notifyNeedsReview: true,
  notifyErrors: true,
  dailyDigest: true,
  digestTime: "18:00",

  model: "auto",
  temperature: 0.4,
  maxTokens: 4096,
  reasoningEffort: "medium",

  memoryEnabled: true,
  retentionDays: 90,
  knowledgeUrls: [],

  monthlyCreditCap: 0,

  skills: ["web_research", "email", "summarization"],
  tools: { shell: false, files: true, browser: true, docker: false, code: false },

  selfImprove: true,
  autoCreateSkills: true,
};

/** A persisted/incoming settings blob: any subset, with `tools` itself partial. */
export type StoredAgentSettings = Partial<Omit<AgentSettings, "tools">> & {
  tools?: Partial<AgentSettings["tools"]>;
};

/** Merge stored (possibly partial / legacy) settings over the defaults. */
export function mergeSettings(stored: StoredAgentSettings | null | undefined): AgentSettings {
  const s = stored ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    tools: { ...DEFAULT_SETTINGS.tools, ...(s.tools ?? {}) },
    workDays: s.workDays ?? DEFAULT_SETTINGS.workDays,
    knowledgeUrls: s.knowledgeUrls ?? DEFAULT_SETTINGS.knowledgeUrls,
    skills: s.skills ?? DEFAULT_SETTINGS.skills,
  };
}

// ---------------------------------------------------------------------------
// Catalogs for the Settings UI
// ---------------------------------------------------------------------------
export const TONES: { id: Tone; label: string }[] = [
  { id: "professional", label: "Professional" },
  { id: "friendly", label: "Friendly" },
  { id: "concise", label: "Concise" },
  { id: "formal", label: "Formal" },
  { id: "playful", label: "Playful" },
];

export const LANGUAGES: { id: ResponseLanguage; label: string }[] = [
  { id: "auto", label: "Match the customer" },
  { id: "en", label: "English" },
  { id: "zh", label: "简体中文" },
  { id: "zht", label: "繁體中文" },
  { id: "ja", label: "日本語" },
];

export const AUTONOMY_LEVELS: { id: Autonomy; label: string; desc: string }[] = [
  { id: "suggest", label: "Suggest only", desc: "Drafts and proposes; never acts on its own." },
  { id: "ask", label: "Ask first", desc: "Acts after you approve each consequential step." },
  { id: "auto", label: "Autonomous", desc: "Acts on its own within the rules & limits below." },
];

export const REASONING_EFFORTS: { id: ReasoningEffort; label: string }[] = [
  { id: "low", label: "Fast" },
  { id: "medium", label: "Balanced" },
  { id: "high", label: "Deep" },
];

/** Model-agnostic provider list (both engines support custom endpoints). */
export const MODELS: { id: string; label: string }[] = [
  { id: "auto", label: "Auto — best model per task (managed)" },
  { id: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "nousresearch/hermes-3-70b", label: "Hermes 3 70B" },
  { id: "openrouter/llama-3.3-70b", label: "Llama 3.3 70B (OpenRouter)" },
  { id: "zai/glm-4.6", label: "GLM-4.6 (z.ai)" },
  { id: "moonshot/kimi-k2", label: "Kimi K2 (Moonshot)" },
];

/** Representative slice of the OpenClaw skills/plugins ecosystem. */
export const SKILLS: { id: string; label: string }[] = [
  { id: "web_research", label: "Web research" },
  { id: "email", label: "Email" },
  { id: "calendar", label: "Calendar" },
  { id: "crm_sync", label: "CRM sync" },
  { id: "lead_enrichment", label: "Lead enrichment" },
  { id: "doc_drafting", label: "Document drafting" },
  { id: "spreadsheet", label: "Spreadsheets" },
  { id: "summarization", label: "Summarization" },
  { id: "translation", label: "Translation" },
  { id: "scheduling", label: "Scheduling" },
  { id: "invoicing", label: "Invoicing" },
  { id: "ticket_triage", label: "Ticket triage" },
  { id: "social_posting", label: "Social posting" },
  { id: "image_gen", label: "Image generation" },
];

export const TOOLS: { id: keyof AgentSettings["tools"]; label: string; desc: string }[] = [
  { id: "files", label: "File system", desc: "Read & write files in its workspace" },
  { id: "browser", label: "Browser", desc: "Browse and automate web pages" },
  { id: "code", label: "Code execution", desc: "Run code to compute & transform data" },
  { id: "shell", label: "Shell", desc: "Run shell commands (advanced)" },
  { id: "docker", label: "Docker", desc: "Manage containers (advanced)" },
];

export const TIMEZONES: string[] = [
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

export const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
