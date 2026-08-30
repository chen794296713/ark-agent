/**
 * What each harness's runtime actually supports — as three states, not two.
 *
 * `HarnessCapabilities` in ./index.ts answers one question: *should the UI draw
 * this control?* That is a boolean and always will be. This table answers a
 * different one: *is the runtime capable?* — and for most of the surface the
 * honest answer today is "nobody has checked".
 *
 * The distinction is load-bearing. `docs/BACKEND_INTEGRATION_CONTRACT.md` marks
 * Hermes' self-improvement loop as CONFIRM-6 and its channel support as
 * CONFIRM-7 — both unverified. Codex is repository-scoped; DeepSeek is
 * "files and network only".
 * A `true` against any of those renders a switch that silently does nothing,
 * and — worse — gives the degradation path no way to say "unverified" rather
 * than "unsupported". So the tri-state is the source, and the booleans in
 * ./index.ts are DERIVED from it with `"unknown" -> false`. Deriving rather
 * than duplicating is deliberate: two hand-maintained tables of the same facts
 * drifted twice before this file existed.
 *
 * Everything here is the boot-time floor. `GET /api/categories` on the OpenClaw
 * Manager overwrites `capabilities` at runtime once it exists.
 *
 * Client-safe: no `server-only`, no database access, no environment reads.
 */
import type { ChannelType } from "@/lib/channels";
import type { Harness } from "./index";

/**
 * `"unknown"` is not a hedge — it is the state that lets the config editor say
 * "unverified on this runtime" instead of hiding a control or, worse, showing
 * one that does nothing.
 */
export type Support = "yes" | "no" | "unknown";

/** The runtime surfaces ArkAgent asks a harness about. */
export type HarnessCapability =
  | "chat"
  | "sessions"
  | "channels"
  | "tasks"
  | "runs"
  | "steps"
  | "skills"
  | "context"
  | "health";

export interface HarnessProfile {
  readonly harness: Harness;
  /**
   * Always ".agents/skills". All four harnesses implement the agentskills.io
   * SKILL.md standard and scan the same directory, which is why per-harness
   * skill compatibility is about runtime DEPENDENCIES (bins, env, config) and
   * never about format. Typed as a literal so a future edit that diverges is a
   * compile error rather than a silently unreadable skill directory.
   */
  readonly skillDir: ".agents/skills";
  readonly altSkillDirs: readonly string[];
  readonly tools: Readonly<Record<"shell" | "files" | "browser" | "docker" | "code", Support>>;
  readonly memory: Readonly<{ selfImprove: Support; autoCreateSkills: Support }>;
  /** The channels it can hold a conversation on, or `"unknown"` if unverified. */
  readonly channels: readonly ChannelType[] | "unknown";
  readonly models: Readonly<{ providerAgnostic: boolean; pinnedFamily: string | null }>;
  /** How the harness interprets `settings.reasoningEffort`, if at all. */
  readonly reasoningEffort: "ignored" | "depth" | "effort" | "thinking_budget";
  readonly accessUrl: "fragment_token" | "login_redirect" | "unknown";
  readonly capabilities: Readonly<Record<HarnessCapability, Support>>;
  /**
   * Open CONFIRM ids from the backend contract. Rendered in the config editor
   * as "unverified on this runtime" — never hidden, never silently treated as
   * a "no".
   */
  readonly confirms: readonly string[];
}

export const HARNESS_PROFILES: Readonly<Record<Harness, HarnessProfile>> = {
  openclaw: {
    harness: "openclaw",
    skillDir: ".agents/skills",
    altSkillDirs: ["<workspace>/skills", "~/.agents/skills", "<state-dir>/skills"],
    tools: { shell: "yes", files: "yes", browser: "yes", docker: "yes", code: "yes" },
    // Plugin-driven rather than built in, but it works — which is what the
    // `settings.selfImprove` switch is asking about.
    memory: { selfImprove: "yes", autoCreateSkills: "yes" },
    channels: [
      "telegram", "whatsapp", "wechat", "line", "slack", "email", "web",
      "feishu", "dingtalk", "wecom",
    ],
    models: { providerAgnostic: true, pinnedFamily: null },
    reasoningEffort: "ignored",
    accessUrl: "fragment_token",
    capabilities: {
      chat: "yes", sessions: "yes", channels: "yes", tasks: "yes",
      runs: "unknown", steps: "unknown", skills: "unknown",
      context: "unknown", health: "unknown",
    },
    confirms: ["CONFIRM-4"],
  },
  hermes: {
    harness: "hermes",
    skillDir: ".agents/skills",
    altSkillDirs: ["~/.hermes/skills", "<repo>/.hermes/skills"],
    tools: { shell: "yes", files: "yes", browser: "no", docker: "unknown", code: "yes" },
    memory: { selfImprove: "yes", autoCreateSkills: "yes" },
    // CONFIRM-7: nothing has exercised a Hermes channel end to end.
    channels: "unknown",
    models: { providerAgnostic: true, pinnedFamily: null },
    reasoningEffort: "depth",
    accessUrl: "login_redirect",
    capabilities: {
      chat: "unknown", sessions: "unknown", channels: "unknown", tasks: "unknown",
      runs: "unknown", steps: "unknown", skills: "unknown",
      context: "unknown", health: "unknown",
    },
    confirms: ["CONFIRM-6", "CONFIRM-7"],
  },
  codex: {
    harness: "codex",
    skillDir: ".agents/skills",
    altSkillDirs: ["$HOME/.agents/skills", "/etc/codex/skills"],
    tools: { shell: "yes", files: "yes", browser: "no", docker: "no", code: "yes" },
    memory: { selfImprove: "no", autoCreateSkills: "no" },
    // Repository-scoped: it has no messaging surface at all.
    channels: [],
    models: { providerAgnostic: false, pinnedFamily: "codex" },
    reasoningEffort: "effort",
    accessUrl: "unknown",
    capabilities: {
      chat: "unknown", sessions: "unknown", channels: "no", tasks: "unknown",
      runs: "unknown", steps: "unknown", skills: "unknown",
      context: "unknown", health: "unknown",
    },
    confirms: ["CONFIRM-5"],
  },
  deepseek: {
    harness: "deepseek",
    skillDir: ".agents/skills",
    altSkillDirs: ["./.deepcode/skills", "~/.deepcode/skills"],
    // "Files and network only" — no shell has been verified, and it does not
    // execute code. `codeNative: true` here previously rendered "specialised
    // for code" in the hire wizard for a harness that cannot run any.
    tools: { shell: "unknown", files: "yes", browser: "no", docker: "unknown", code: "no" },
    memory: { selfImprove: "unknown", autoCreateSkills: "unknown" },
    channels: [],
    models: { providerAgnostic: false, pinnedFamily: "deepseek" },
    reasoningEffort: "thinking_budget",
    accessUrl: "unknown",
    capabilities: {
      chat: "unknown", sessions: "unknown", channels: "no", tasks: "unknown",
      runs: "unknown", steps: "unknown", skills: "unknown",
      context: "unknown", health: "unknown",
    },
    confirms: ["CONFIRM-5", "CONFIRM-6"],
  },
};

/** `"yes"` is the only answer that draws a control. `"unknown"` is not a yes. */
export function supported(s: Support): boolean {
  return s === "yes";
}

/** Every open CONFIRM id across all four harnesses, for the ops checklist. */
export function openConfirms(): string[] {
  return [...new Set(Object.values(HARNESS_PROFILES).flatMap((p) => p.confirms))].sort();
}
