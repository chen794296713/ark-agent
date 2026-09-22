/**
 * The curated seed catalogue — 101 real, researched entries.
 *
 * Every row here was verified against a primary API on 2026-08-29 and is
 * transcribed from `docs/research/SKILL_ECOSYSTEM.md` §A and
 * `docs/SKILL_REPOSITORY.md` §3. Nothing in this file was invented: not a slug,
 * not a URL, not a licence, not an owner handle. Where the research could not
 * establish something it is carried through as unestablished — 30 ClawHub rows
 * ship `license: "UNKNOWN"` with `licenseVerified: false` because no ClawHub
 * listing endpoint returns a licence at all (§F.1), and that is a more useful
 * fact than a plausible guess.
 *
 * Read by `scripts/seed-skills.ts` (`npm run skills:seed`) and available to
 * `lib/skills/sync` as the reconciliation baseline.
 *
 * ---------------------------------------------------------------------------
 * What the seed owns, and what it deliberately does NOT
 * ---------------------------------------------------------------------------
 *
 * It owns identity, classification, the editorial `popularity` rank, the risk
 * PRIOR, and the two honesty flags. It does not own `stars` or `downloads`:
 * §F.10 is explicit that those drift daily and belong in a synced column with a
 * `fetched_at`, so seeding the 2026-08-29 snapshot would bake a number into git
 * and guarantee the UI lies within a week. What the rubric actually needs from
 * adoption is the BOOLEAN — did this cross ★5,000 or 100,000 installs — and that
 * does not oscillate, so `widelyAdopted` carries it and the numbers stay out.
 *
 * It also does not own `provenance`. Nobody called ClawHub `/verify` for any of
 * these rows, so every one starts at the schema default `unavailable` and the
 * sync pipeline resolves it. Seeding `server-resolved-github-import` because a
 * row happens to come from GitHub would be asserting a chain of custody we never
 * checked — and provenance is worth −1 on the rubric, so the lie would pay.
 *
 * `permissions.hosts` is likewise left empty everywhere. The research verified
 * WHAT each skill integrates with, never which hosts its body actually contacts;
 * a declared-host list we made up would turn the +4 undeclared-host signal into
 * a rubber stamp the first time sync fetched a body.
 *
 * ---------------------------------------------------------------------------
 * `riskLevel` is a prior, not a verdict
 * ---------------------------------------------------------------------------
 *
 * These bands are the researcher's triage assessment from metadata, published
 * scanner verdicts and stated purpose. Nothing here was installed or executed
 * (§F.11). `scripts/seed-skills.ts` runs `scoreSkill` over each row's
 * `permissions` / `requirements` / `tags` / `licence` and writes
 * `maxBand(prior, derived)` — so the mechanical rubric may RAISE a seeded band
 * and may never lower one, exactly the asymmetry `withReviewerScore` applies to
 * the optional LLM reviewer. The derived `riskScore` and `riskSignals` are what
 * the drawer renders under "why this rating", so a rating is explainable on day
 * one rather than after the first sync. Ten rows currently score stricter than
 * their prior — mostly ClawHub document utilities whose Anthropic equivalents
 * band lower purely on publisher trust, which is what the rubric is for — and
 * `npm run skills:seed` prints them rather than resolving the disagreement
 * silently.
 *
 * Client-safe: pure data and pure constructors. No `node:crypto`, no Drizzle, no
 * `server-only` — the seed script, the sync baseline and the tests all read it.
 */
import type { Harness } from "@/lib/harness";
import type {
  SkillCategory,
  SkillFormat,
  SkillInstall,
  SkillPermissions,
  SkillRequirements,
  SkillRisk,
  SkillStatus,
} from "./types";

/**
 * One catalogue row as a human wrote it.
 *
 * `publicId` is spelled out rather than computed at module load so that a change
 * to `mintPublicId` shows up as a failing round-trip assertion in
 * `tests/skills-catalog.test.ts` instead of silently re-keying every template
 * and every `AgentSettings.skills[]` entry that names one of these.
 */
export interface SeedSkill {
  /** Stable URL key. Must equal `mintPublicId(sourceId, ownerHandle, slug)`. */
  publicId: string;
  sourceId: string;
  /** `""` for sources with no owner namespace — never null; see `skills_identity_uniq`. */
  ownerHandle: string;
  slug: string;
  name: string;
  summary: string;
  category: SkillCategory;
  format: SkillFormat;
  /** Harnesses the publisher's own statement covers. Empty is not a legal value. */
  harnesses: Harness[];
  tags: string[];
  /** The researched prior. `scoreSkill` may raise it at seed time, never lower it. */
  riskLevel: SkillRisk;
  sourceUrl: string;
  license: string;
  /** True only when a human read the licence. False for every ClawHub row. */
  licenseVerified: boolean;
  /** 0–100 editorial rank: how prominently this should appear in an empty search. */
  popularity: number;
  /** True only when a human at ArkAgent read the source. */
  verified: boolean;
  status: SkillStatus;
  publisherName: string;
  /** The publisher handle IS the vendor of the service the skill integrates. */
  publisherVerified: boolean;
  /** OpenClaw's `metadata.openclaw.requires` shape, verbatim. */
  requirements?: SkillRequirements;
  /** The authority the skill asks for, diffable against `AgentSettings.tools`. */
  permissions: SkillPermissions;
  install: SkillInstall;
  /** ★ >= 5,000 or >= 100,000 installs, as verified on 2026-08-29. */
  widelyAdopted?: boolean;
  /** Reviewer note, surfaced in the drawer under "why this rating". */
  note?: string;
  deprecationNote?: string;
}

const ALL4: Harness[] = ["openclaw", "hermes", "codex", "deepseek"];
const OC: Harness[] = ["openclaw"];

const A_SRC = "https://github.com/anthropics/skills";
const O_SRC = "https://github.com/openclaw/agent-skills";
const M_SRC = "https://github.com/modelcontextprotocol/servers";

/** Anthropic's repo: one git source, one subdir per skill. */
const a = (slug: string): SkillInstall => ({
  mode: "git",
  repo: "anthropics/skills",
  ref: "main",
  subdir: `skills/${slug}`,
});
const o = (slug: string): SkillInstall => ({
  mode: "git",
  repo: "openclaw/agent-skills",
  ref: "main",
  subdir: `skills/${slug}`,
});
/**
 * ClawHub. The runtime pulls from the registry under ClawHub's own terms, so no
 * licence is required from us — which is what unblocks the 30 licence-UNKNOWN
 * rows that §F.1 called a seeding blocker.
 *
 * `version: "latest"` is the CATALOGUE's floating pointer, not an attachment's.
 * `agent_skills.version` pins an exact string on attach and the runtime never
 * resolves `latest` (AST07).
 */
const ch = (owner: string, slug: string): SkillInstall => ({
  mode: "registry",
  registry: "clawhub",
  ref: `@${owner}/${slug}`,
  version: "latest",
});
/** MCP servers that ship as npx-launched stdio servers. */
const mcpx = (pkg: string, env: string[] = []): SkillInstall => ({
  mode: "mcp_stdio",
  command: "npx",
  args: ["-y", pkg],
  env,
});

// ---------------------------------------------------------------------------
// Permission presets — the blast-radius vocabulary of §5.2
//
// Named rather than inlined so that "what does a document skill ask for" has ONE
// answer across nineteen rows. `capabilityTier()` reads these, so a preset is
// the difference between a tier and the next one up; the tier each preset
// reaches is stated on it and asserted in tests/skills-catalog.test.ts.
// ---------------------------------------------------------------------------

/** Tier 0 · prose only. No scripts, no credentials, no network. */
const P_PROSE: SkillPermissions = { network: "none", filesystem: "none" };

/** Tier 1 · reads files inside the agent's own workspace. */
const P_READ: SkillPermissions = { tools: ["files"], filesystem: "workspace-read", network: "none" };

/** Tier 2 · anonymous or read-only-key access to a public API. */
const P_PUBLIC: SkillPermissions = { network: "public-read", filesystem: "none" };

/**
 * Tier 2 · unbounded fetch. Separate from `P_PUBLIC` because `arbitrary` is how
 * attacker-controlled text reaches the context (AST05): it carries a +3 signal
 * and a medium floor that a scoped public read does not deserve.
 */
const P_FETCH: SkillPermissions = { network: "arbitrary", filesystem: "none" };

/** Tier 4 · writes files in the workspace. */
const P_WRITE: SkillPermissions = { tools: ["files"], filesystem: "workspace-write", network: "none" };

/** Tier 4 · writes files and reads a public API. */
const P_WRITE_NET: SkillPermissions = {
  tools: ["files"],
  filesystem: "workspace-write",
  network: "public-read",
};

/** Tier 4 · writes files AND runs bundled scripts or local binaries. */
const P_EXEC: SkillPermissions = {
  tools: ["files", "shell"],
  filesystem: "workspace-write",
  network: "none",
};

/** Tier 4 · local execution that also reaches a public API. */
const P_EXEC_NET: SkillPermissions = {
  tools: ["files", "shell"],
  filesystem: "workspace-write",
  network: "public-read",
};

/** Tier 6 · authenticated write to ONE named external service. */
const P_SERVICE = (credentials: string[]): SkillPermissions => ({
  tools: ["files"],
  filesystem: "workspace-read",
  network: "declared-hosts",
  credentials,
});

/**
 * Tier 8 · a credential whose scope is an entire mailbox, org, cluster or cloud
 * account, held alongside host-wide read.
 */
const P_BROAD = (credentials: string[]): SkillPermissions => ({
  tools: ["files", "shell"],
  filesystem: "host-read",
  network: "declared-hosts",
  credentials,
});

/** Tier 8 · read/write across the host filesystem, outside the workspace. */
const P_HOST_FILES: SkillPermissions = {
  tools: ["files"],
  filesystem: "host-write",
  network: "none",
};

/** Tier 8 · executes code the agent did not write, on the host. */
const P_HOST_EXEC: SkillPermissions = {
  tools: ["files", "shell", "docker"],
  filesystem: "host-write",
  network: "none",
};

/**
 * Tier 10 · takes an action a human cannot undo: publishes, pays, transacts
 * on-chain, pushes code, or applies infrastructure. `irreversible` is the
 * rubric's hard floor — no publisher discount reaches below it.
 */
const P_PUBLISH = (credentials: string[]): SkillPermissions => ({
  tools: ["files", "shell"],
  filesystem: "workspace-write",
  network: "declared-hosts",
  credentials,
  irreversible: true,
});

/**
 * Tier 10 · drives a browser carrying the operator's own sessions. The browser
 * profile IS the credential (AST03), which is why this is not `P_EXEC` with a
 * `browser` tool bolted on.
 */
const P_BROWSER: SkillPermissions = {
  tools: ["files", "browser"],
  filesystem: "workspace-write",
  network: "arbitrary",
  credentials: ["every session cookie in the browser profile it drives"],
  irreversible: true,
};

/** Tier 10 · full desktop authority; bypasses every per-app permission boundary. */
const P_DESKTOP: SkillPermissions = {
  tools: ["files", "shell", "browser"],
  filesystem: "host-write",
  network: "arbitrary",
  credentials: ["whatever is on screen or unlocked on the host"],
  irreversible: true,
};

/** Tier 10 · rewrites the agent's own instructions or installed skills. */
const P_SELF_MODIFY: SkillPermissions = {
  tools: ["files", "shell", "code"],
  filesystem: "host-write",
  network: "arbitrary",
  irreversible: true,
};

/**
 * The catalogue.
 *
 * Ordered by group, and within a group by the ordering the research used —
 * ClawHub rows are in descending verified download order, which is also the
 * order the editorial `popularity` rank tracks.
 */
export const SEED_SKILLS: SeedSkill[] = [
  // ---- A1 · anthropics/skills ------------------------------------------------
  { publicId: "anthropic-skills-academy-guide", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "academy-guide",
    name: "Academy Guide", summary: "Recommends Claude Academy courses and tutorials matching a how-do-I question.",
    category: "knowledge-memory", format: "agent_skill", harnesses: ALL4, tags: ["learning", "onboarding", "reference"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-SourceAvailable", licenseVerified: true,
    popularity: 45, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    widelyAdopted: true, permissions: P_PROSE,
    install: a("academy-guide") },

  { publicId: "anthropic-skills-algorithmic-art", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "algorithmic-art",
    name: "Algorithmic Art", summary: "Generative p5.js art with seeded randomness and interactive parameter exploration.",
    category: "design-creative", format: "agent_skill", harnesses: ALL4, tags: ["generative", "p5js", "art"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-SourceAvailable", licenseVerified: true,
    popularity: 55, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    widelyAdopted: true, permissions: P_WRITE,
    install: a("algorithmic-art") },

  { publicId: "anthropic-skills-brand-guidelines", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "brand-guidelines",
    name: "Brand Guidelines", summary: "Applies a brand's official colours and typography to any generated artifact.",
    category: "design-creative", format: "agent_skill", harnesses: ALL4, tags: ["branding", "typography", "style"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-SourceAvailable", licenseVerified: true,
    popularity: 60, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    widelyAdopted: true, permissions: P_PROSE,
    install: a("brand-guidelines") },

  { publicId: "anthropic-skills-canvas-design", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "canvas-design",
    name: "Canvas Design", summary: "Design-philosophy-driven poster and print art, output as .pdf or .png.",
    category: "design-creative", format: "agent_skill", harnesses: ALL4, tags: ["poster", "print", "layout"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-SourceAvailable", licenseVerified: true,
    popularity: 58, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    widelyAdopted: true, permissions: P_WRITE,
    install: a("canvas-design") },

  { publicId: "anthropic-skills-claude-api", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "claude-api",
    name: "Claude API", summary: "Reference for Claude API model ids, pricing, streaming, tool use and prompt caching.",
    category: "coding-dev-tools", format: "agent_skill", harnesses: ALL4, tags: ["api", "reference", "llm"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-SourceAvailable", licenseVerified: true,
    popularity: 62, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    widelyAdopted: true, permissions: P_PROSE,
    install: a("claude-api") },

  { publicId: "anthropic-skills-discernment-nudge", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "discernment-nudge",
    name: "Discernment Nudge", summary: "Appends fact- and assumption-checking follow-up questions after substantive answers.",
    category: "agent-meta", format: "agent_skill", harnesses: ALL4, tags: ["quality", "review", "reasoning"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-SourceAvailable", licenseVerified: true,
    popularity: 40, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    widelyAdopted: true, permissions: P_PROSE,
    install: a("discernment-nudge") },

  { publicId: "anthropic-skills-doc-coauthoring", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "doc-coauthoring",
    name: "Doc Co-Authoring", summary: "Structured three-stage workflow for co-writing documents and specs with a human.",
    category: "documents-files", format: "agent_skill", harnesses: ALL4, tags: ["writing", "specs", "collaboration"],
    riskLevel: "low", sourceUrl: A_SRC, license: "UNKNOWN", licenseVerified: false,
    popularity: 70, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    widelyAdopted: true, permissions: P_WRITE,
    install: a("doc-coauthoring"),
    note: "Licence unstated in this skill's frontmatter; the repo licence is a mix. Install is git-by-reference, so redistribution never applies." },

  { publicId: "anthropic-skills-docx", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "docx",
    name: "DOCX", summary: "Create, read and edit Word .docx and .dotx, including tracked changes and forms.",
    category: "documents-files", format: "agent_skill", harnesses: ALL4, tags: ["word", "office", "documents"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-Proprietary", licenseVerified: true,
    popularity: 88, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    requirements: { bins: ["python3"], env: [] },
    widelyAdopted: true, permissions: P_EXEC,
    install: a("docx"),
    note: "Declares Proprietary. Source-available, not open source — never materialize inline." },

  { publicId: "anthropic-skills-frontend-design", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "frontend-design",
    name: "Frontend Design", summary: "Opinionated visual direction for new UI: palette, type scale and layout.",
    category: "design-creative", format: "agent_skill", harnesses: ALL4, tags: ["ui", "css", "design-system"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-SourceAvailable", licenseVerified: true,
    popularity: 66, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    widelyAdopted: true, permissions: P_PROSE,
    install: a("frontend-design") },

  { publicId: "anthropic-skills-internal-comms", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "internal-comms",
    name: "Internal Comms", summary: "Writes status reports, leadership updates, newsletters and incident reports.",
    category: "communication", format: "agent_skill", harnesses: ALL4, tags: ["writing", "reporting", "updates"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-SourceAvailable", licenseVerified: true,
    popularity: 72, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    widelyAdopted: true, permissions: P_WRITE,
    install: a("internal-comms"),
    note: "Drafts only — it has no send capability of its own." },

  { publicId: "anthropic-skills-mcp-builder", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "mcp-builder",
    name: "MCP Builder", summary: "Guide to building high-quality MCP servers in Python or TypeScript.",
    category: "coding-dev-tools", format: "agent_skill", harnesses: ALL4, tags: ["mcp", "codegen", "tooling"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-SourceAvailable", licenseVerified: true,
    popularity: 52, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    widelyAdopted: true, permissions: P_WRITE,
    install: a("mcp-builder") },

  { publicId: "anthropic-skills-pdf", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "pdf",
    name: "PDF", summary: "Extract, merge, split, watermark and OCR PDFs, and fill PDF forms.",
    category: "documents-files", format: "agent_skill", harnesses: ALL4, tags: ["pdf", "ocr", "documents"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-Proprietary", licenseVerified: true,
    popularity: 90, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    requirements: { bins: ["python3"], env: [] },
    widelyAdopted: true, permissions: P_EXEC,
    install: a("pdf") },

  { publicId: "anthropic-skills-pptx", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "pptx",
    name: "PPTX", summary: "Create and edit PowerPoint decks: layouts, speaker notes and templates.",
    category: "documents-files", format: "agent_skill", harnesses: ALL4, tags: ["powerpoint", "slides", "office"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-Proprietary", licenseVerified: true,
    popularity: 84, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    requirements: { bins: ["python3"], env: [] },
    widelyAdopted: true, permissions: P_EXEC,
    install: a("pptx") },

  { publicId: "anthropic-skills-skill-creator", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "skill-creator",
    name: "Skill Creator", summary: "Create, edit, evaluate and benchmark skills; optimize skill descriptions.",
    category: "agent-meta", format: "agent_skill", harnesses: ALL4, tags: ["authoring", "evals", "meta"],
    riskLevel: "medium", sourceUrl: A_SRC, license: "UNKNOWN", licenseVerified: false,
    popularity: 50, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    widelyAdopted: true, permissions: P_EXEC,
    install: a("skill-creator"),
    note: "Writes into the agent's own skills directory — a self-modifying surface (OWASP AST01/AST09)." },

  { publicId: "anthropic-skills-slack-gif-creator", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "slack-gif-creator",
    name: "Slack GIF Creator", summary: "Builds animated GIFs sized to Slack's upload constraints.",
    category: "media", format: "agent_skill", harnesses: ALL4, tags: ["gif", "animation", "slack"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-SourceAvailable", licenseVerified: true,
    popularity: 35, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    widelyAdopted: true, permissions: P_EXEC,
    install: a("slack-gif-creator"),
    note: "Encodes locally. It does not upload to Slack — that needs a separate, higher-risk skill." },

  { publicId: "anthropic-skills-theme-factory", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "theme-factory",
    name: "Theme Factory", summary: "Ten preset colour and font themes applied to any generated artifact.",
    category: "design-creative", format: "agent_skill", harnesses: ALL4, tags: ["theming", "color", "tokens"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-SourceAvailable", licenseVerified: true,
    popularity: 48, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    widelyAdopted: true, permissions: P_PROSE,
    install: a("theme-factory") },

  { publicId: "anthropic-skills-web-artifacts-builder", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "web-artifacts-builder",
    name: "Web Artifacts Builder", summary: "React/Tailwind/shadcn multi-component scaffolding and bundling.",
    category: "coding-dev-tools", format: "agent_skill", harnesses: ALL4, tags: ["react", "scaffolding", "bundling"],
    riskLevel: "medium", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-SourceAvailable", licenseVerified: true,
    popularity: 56, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    requirements: { bins: ["node", "npm"], env: [] },
    widelyAdopted: true, permissions: P_EXEC_NET,
    install: a("web-artifacts-builder"),
    note: "Runs bundled shell scripts and installs npm dependencies — local execution surface." },

  { publicId: "anthropic-skills-webapp-testing", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "webapp-testing",
    name: "Webapp Testing", summary: "Drives and tests local web apps with Playwright; screenshots and browser logs.",
    category: "browser-automation", format: "agent_skill", harnesses: ALL4, tags: ["playwright", "testing", "screenshots"],
    riskLevel: "medium", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-SourceAvailable", licenseVerified: true,
    popularity: 54, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    requirements: { bins: ["python3", "node"], env: [] },
    widelyAdopted: true, permissions: P_EXEC_NET,
    install: a("webapp-testing"),
    note: "Launches a browser and executes local Python. Scoped to localhost by convention, not by enforcement." },

  { publicId: "anthropic-skills-xlsx", sourceId: "anthropic-skills", ownerHandle: "anthropics", slug: "xlsx",
    name: "XLSX", summary: "Create and edit .xlsx/.csv with formulas, formatting and charts; clean messy data.",
    category: "documents-files", format: "agent_skill", harnesses: ALL4, tags: ["excel", "spreadsheet", "data"],
    riskLevel: "low", sourceUrl: A_SRC, license: "LicenseRef-Anthropic-Proprietary", licenseVerified: true,
    popularity: 86, verified: true, status: "published", publisherName: "Anthropic", publisherVerified: true,
    requirements: { bins: ["python3"], env: [] },
    widelyAdopted: true, permissions: P_EXEC,
    install: a("xlsx") },
  // ---- A2 · openclaw/agent-skills --------------------------------------------
  { publicId: "openclaw-skills-agent-transcript", sourceId: "openclaw-skills", ownerHandle: "openclaw", slug: "agent-transcript",
    name: "Agent Transcript", summary: "Produces a readable transcript of an agent session from local session files.",
    category: "agent-meta", format: "agent_skill", harnesses: ALL4, tags: ["transcript", "session", "audit"],
    riskLevel: "low", sourceUrl: O_SRC, license: "MIT", licenseVerified: true,
    popularity: 42, verified: true, status: "published", publisherName: "OpenClaw", publisherVerified: true,
    permissions: P_READ,
    install: o("agent-transcript") },

  { publicId: "openclaw-skills-autoreview", sourceId: "openclaw-skills", ownerHandle: "openclaw", slug: "autoreview",
    name: "Autoreview", summary: "Automated review pass over an agent's changes before handoff to a human.",
    category: "coding-dev-tools", format: "agent_skill", harnesses: ALL4, tags: ["review", "quality", "handoff"],
    riskLevel: "low", sourceUrl: O_SRC, license: "MIT", licenseVerified: true,
    popularity: 58, verified: true, status: "published", publisherName: "OpenClaw", publisherVerified: true,
    permissions: P_READ,
    install: o("autoreview") },

  { publicId: "openclaw-skills-beam", sourceId: "openclaw-skills", ownerHandle: "openclaw", slug: "beam",
    name: "Beam", summary: "Moves files and data between an OpenClaw agent and another host.",
    category: "agent-meta", format: "agent_skill", harnesses: OC, tags: ["transfer", "files", "openclaw"],
    riskLevel: "medium", sourceUrl: O_SRC, license: "MIT", licenseVerified: true,
    popularity: 25, verified: false, status: "published", publisherName: "OpenClaw", publisherVerified: true,
    requirements: { config: ["openclaw.plugin"] },
    permissions: P_WRITE_NET,
    install: o("beam"),
    note: "Harness compatibility UNVERIFIED — its SKILL.md was not read. Scoped to OpenClaw conservatively; basis is 'inferred', not 'declared'." },

  { publicId: "openclaw-skills-behavior-validator", sourceId: "openclaw-skills", ownerHandle: "openclaw", slug: "behavior-validator",
    name: "Behavior Validator", summary: "Validates an agent's behaviour against a written set of expectations.",
    category: "agent-meta", format: "agent_skill", harnesses: ALL4, tags: ["evals", "assertions", "testing"],
    riskLevel: "low", sourceUrl: O_SRC, license: "MIT", licenseVerified: true,
    popularity: 44, verified: true, status: "published", publisherName: "OpenClaw", publisherVerified: true,
    permissions: P_READ,
    install: o("behavior-validator") },

  { publicId: "openclaw-skills-crabbox", sourceId: "openclaw-skills", ownerHandle: "openclaw", slug: "crabbox",
    name: "Crabbox", summary: "Sandboxed execution helper for running untrusted code under OpenClaw.",
    category: "coding-dev-tools", format: "agent_skill", harnesses: OC, tags: ["sandbox", "execution", "isolation"],
    riskLevel: "high", sourceUrl: O_SRC, license: "MIT", licenseVerified: true,
    popularity: 30, verified: true, status: "published", publisherName: "OpenClaw", publisherVerified: true,
    requirements: { config: ["openclaw.plugin"], bins: ["docker"] },
    permissions: P_HOST_EXEC,
    install: o("crabbox"),
    note: "Its entire purpose is executing untrusted code. The isolation quality IS the risk — never below high." },

  { publicId: "openclaw-skills-handoff", sourceId: "openclaw-skills", ownerHandle: "openclaw", slug: "handoff",
    name: "Handoff", summary: "Structured context handoff between agents or between sessions.",
    category: "agent-meta", format: "agent_skill", harnesses: ALL4, tags: ["context", "handoff", "multi-agent"],
    riskLevel: "low", sourceUrl: O_SRC, license: "MIT", licenseVerified: true,
    popularity: 50, verified: true, status: "published", publisherName: "OpenClaw", publisherVerified: true,
    permissions: P_WRITE,
    install: o("handoff") },

  { publicId: "openclaw-skills-readme-standard", sourceId: "openclaw-skills", ownerHandle: "openclaw", slug: "readme-standard",
    name: "README Standard", summary: "Enforces a consistent README structure across a repository.",
    category: "documents-files", format: "agent_skill", harnesses: ALL4, tags: ["readme", "docs", "standards"],
    riskLevel: "low", sourceUrl: O_SRC, license: "MIT", licenseVerified: true,
    popularity: 33, verified: true, status: "published", publisherName: "OpenClaw", publisherVerified: true,
    permissions: P_WRITE,
    install: o("readme-standard") },

  { publicId: "openclaw-skills-session-viewer", sourceId: "openclaw-skills", ownerHandle: "openclaw", slug: "session-viewer",
    name: "Session Viewer", summary: "Browse and inspect prior agent sessions stored on the host.",
    category: "agent-meta", format: "agent_skill", harnesses: OC, tags: ["sessions", "debugging", "openclaw"],
    riskLevel: "low", sourceUrl: O_SRC, license: "MIT", licenseVerified: true,
    popularity: 28, verified: true, status: "published", publisherName: "OpenClaw", publisherVerified: true,
    requirements: { config: ["openclaw.plugin"] },
    permissions: P_READ,
    install: o("session-viewer") },
  // ---- A3 · clawhub.ai ---------------------------------------------------------
  { publicId: "clawhub-pskoett-self-improving-agent", sourceId: "clawhub", ownerHandle: "pskoett", slug: "self-improving-agent",
    name: "Self-Improving Agent", summary: "Captures learnings, errors and corrections into a persistent improvement log.",
    category: "agent-meta", format: "agent_skill", harnesses: ALL4, tags: ["memory", "self-improvement", "learning"],
    riskLevel: "medium", sourceUrl: "https://clawhub.ai/pskoett/skills/self-improving-agent", license: "UNKNOWN", licenseVerified: false,
    popularity: 95, verified: false, status: "published", publisherName: "pskoett", publisherVerified: false,
    widelyAdopted: true, permissions: P_WRITE,
    install: ch("pskoett", "self-improving-agent"),
    note: "Writes agent-readable memory that later steers behaviour — a persistent self-injection surface (AST05)." },

  { publicId: "clawhub-spclaudehome-skill-vetter", sourceId: "clawhub", ownerHandle: "spclaudehome", slug: "skill-vetter",
    name: "Skill Vetter", summary: "Security-first vetting of a skill before it is installed.",
    category: "security-secrets", format: "agent_skill", harnesses: ALL4, tags: ["security", "vetting", "supply-chain"],
    riskLevel: "low", sourceUrl: "https://clawhub.ai/spclaudehome/skills/skill-vetter", license: "UNKNOWN", licenseVerified: false,
    popularity: 90, verified: false, status: "published", publisherName: "spclaudehome", publisherVerified: false,
    widelyAdopted: true, permissions: P_READ,
    install: ch("spclaudehome", "skill-vetter") },

  { publicId: "clawhub-oswalpalash-ontology", sourceId: "clawhub", ownerHandle: "oswalpalash", slug: "ontology",
    name: "Ontology", summary: "Typed knowledge graph for structured agent memory.",
    category: "knowledge-memory", format: "agent_skill", harnesses: ALL4, tags: ["knowledge-graph", "memory", "structure"],
    riskLevel: "low", sourceUrl: "https://clawhub.ai/oswalpalash/skills/ontology", license: "UNKNOWN", licenseVerified: false,
    popularity: 82, verified: false, status: "published", publisherName: "oswalpalash", publisherVerified: false,
    widelyAdopted: true, permissions: P_WRITE,
    install: ch("oswalpalash", "ontology") },

  { publicId: "clawhub-steipete-github", sourceId: "clawhub", ownerHandle: "steipete", slug: "github",
    name: "GitHub (gh CLI)", summary: "Drives GitHub through the gh CLI: issues, pull requests, workflow runs, gh api.",
    category: "version-control", format: "agent_skill", harnesses: ALL4, tags: ["github", "cli", "pull-requests"],
    riskLevel: "medium", sourceUrl: "https://clawhub.ai/steipete/skills/github", license: "UNKNOWN", licenseVerified: false,
    popularity: 88, verified: false, status: "published", publisherName: "steipete", publisherVerified: false,
    requirements: { bins: ["gh"], env: ["GITHUB_TOKEN"] },
    widelyAdopted: true, permissions: P_SERVICE(["gh CLI, full user scope"]),
    install: ch("steipete", "github"),
    note: "Inherits the whole gh auth scope on the host. ClawScan says clean and flags exactly this. Provenance is 'unavailable'." },

  { publicId: "clawhub-steipete-gog", sourceId: "clawhub", ownerHandle: "steipete", slug: "gog",
    name: "Google Workspace (gog)", summary: "Google Workspace CLI: Gmail, Calendar, Drive, Contacts, Sheets and Docs.",
    category: "productivity", format: "agent_skill", harnesses: ALL4, tags: ["gmail", "calendar", "drive", "workspace"],
    riskLevel: "high", sourceUrl: "https://clawhub.ai/steipete/skills/gog", license: "UNKNOWN", licenseVerified: false,
    popularity: 86, verified: false, status: "published", publisherName: "steipete", publisherVerified: false,
    requirements: { bins: ["gog"], env: ["GOOGLE_OAUTH_TOKEN"] },
    widelyAdopted: true, permissions: P_BROAD(["Google Workspace OAuth grant: mail, Drive, Calendar"]),
    install: ch("steipete", "gog"),
    note: "One OAuth grant covers full mailbox and Drive read/write. Broad-credential tier; never below high." },

  { publicId: "clawhub-tokauthai-skillscan", sourceId: "clawhub", ownerHandle: "tokauthai", slug: "skillscan",
    name: "SkillScan", summary: "Security gate that every newly added skill must pass before use.",
    category: "security-secrets", format: "agent_skill", harnesses: ALL4, tags: ["scanning", "security", "gate"],
    riskLevel: "low", sourceUrl: "https://clawhub.ai/tokauthai/skills/skillscan", license: "UNKNOWN", licenseVerified: false,
    popularity: 84, verified: false, status: "published", publisherName: "tokauthai", publisherVerified: false,
    widelyAdopted: true, permissions: P_READ,
    install: ch("tokauthai", "skillscan") },

  { publicId: "clawhub-steipete-weather", sourceId: "clawhub", ownerHandle: "steipete", slug: "weather",
    name: "Weather", summary: "Current conditions and forecasts from a public API; no key required.",
    category: "search-research", format: "agent_skill", harnesses: ALL4, tags: ["weather", "forecast", "public-api"],
    riskLevel: "low", sourceUrl: "https://clawhub.ai/steipete/skills/weather", license: "UNKNOWN", licenseVerified: false,
    popularity: 74, verified: false, status: "published", publisherName: "steipete", publisherVerified: false,
    widelyAdopted: true, permissions: P_PUBLIC,
    install: ch("steipete", "weather") },

  { publicId: "clawhub-gpyangyoujun-multi-search-engine", sourceId: "clawhub", ownerHandle: "gpyangyoujun", slug: "multi-search-engine",
    name: "Multi Search Engine", summary: "Sixteen search engines (seven China, nine global) with advanced operators.",
    category: "search-research", format: "agent_skill", harnesses: ALL4, tags: ["search", "research", "china"],
    riskLevel: "low", sourceUrl: "https://clawhub.ai/gpyangyoujun/skills/multi-search-engine", license: "UNKNOWN", licenseVerified: false,
    popularity: 80, verified: false, status: "published", publisherName: "gpyangyoujun", publisherVerified: false,
    widelyAdopted: true, permissions: P_PUBLIC,
    install: ch("gpyangyoujun", "multi-search-engine") },

  { publicId: "clawhub-matrixy-agent-browser-clawdbot", sourceId: "clawhub", ownerHandle: "matrixy", slug: "agent-browser-clawdbot",
    name: "Agent Browser", summary: "Headless browser automation driven by accessibility-tree snapshots.",
    category: "browser-automation", format: "agent_skill", harnesses: ALL4, tags: ["browser", "automation", "a11y-tree"],
    riskLevel: "high", sourceUrl: "https://clawhub.ai/matrixy/skills/agent-browser-clawdbot", license: "UNKNOWN", licenseVerified: false,
    popularity: 76, verified: false, status: "published", publisherName: "matrixy", publisherVerified: false,
    requirements: { bins: ["node"] },
    widelyAdopted: true, permissions: P_BROWSER,
    install: ch("matrixy", "agent-browser-clawdbot"),
    note: "A browser carrying the user's cookies IS a credential (AST03). Floor: high." },

  { publicId: "clawhub-biostartechnology-humanizer", sourceId: "clawhub", ownerHandle: "biostartechnology", slug: "humanizer",
    name: "Humanizer", summary: "Removes AI-writing tells from generated text.",
    category: "design-creative", format: "agent_skill", harnesses: ALL4, tags: ["writing", "style", "editing"],
    riskLevel: "low", sourceUrl: "https://clawhub.ai/biostartechnology/skills/humanizer", license: "UNKNOWN", licenseVerified: false,
    popularity: 68, verified: false, status: "published", publisherName: "biostartechnology", publisherVerified: false,
    widelyAdopted: true, permissions: P_PROSE,
    install: ch("biostartechnology", "humanizer") },

  { publicId: "clawhub-steipete-nano-pdf", sourceId: "clawhub", ownerHandle: "steipete", slug: "nano-pdf",
    name: "nano-pdf", summary: "Edits PDFs from natural-language instructions.",
    category: "documents-files", format: "agent_skill", harnesses: ALL4, tags: ["pdf", "editing", "documents"],
    riskLevel: "low", sourceUrl: "https://clawhub.ai/steipete/skills/nano-pdf", license: "UNKNOWN", licenseVerified: false,
    popularity: 64, verified: false, status: "published", publisherName: "steipete", publisherVerified: false,
    requirements: { bins: ["nano-pdf"] },
    widelyAdopted: true, permissions: P_EXEC,
    install: ch("steipete", "nano-pdf") },

  { publicId: "clawhub-steipete-obsidian", sourceId: "clawhub", ownerHandle: "steipete", slug: "obsidian",
    name: "Obsidian", summary: "Reads and automates Obsidian vaults via obsidian-cli.",
    category: "knowledge-memory", format: "agent_skill", harnesses: ALL4, tags: ["obsidian", "notes", "pkm"],
    riskLevel: "medium", sourceUrl: "https://clawhub.ai/steipete/skills/obsidian", license: "UNKNOWN", licenseVerified: false,
    popularity: 66, verified: false, status: "published", publisherName: "steipete", publisherVerified: false,
    requirements: { bins: ["obsidian-cli"] },
    widelyAdopted: true, permissions: P_HOST_FILES,
    install: ch("steipete", "obsidian"),
    note: "Read/write across an entire personal note corpus." },

  { publicId: "clawhub-steipete-notion", sourceId: "clawhub", ownerHandle: "steipete", slug: "notion",
    name: "Notion", summary: "Notion API access for pages, databases and blocks.",
    category: "productivity", format: "agent_skill", harnesses: ALL4, tags: ["notion", "wiki", "database"],
    riskLevel: "medium", sourceUrl: "https://clawhub.ai/steipete/skills/notion", license: "UNKNOWN", licenseVerified: false,
    popularity: 70, verified: false, status: "published", publisherName: "steipete", publisherVerified: false,
    requirements: { env: ["NOTION_TOKEN"] },
    widelyAdopted: true, permissions: P_SERVICE(["Notion integration token, workspace-wide"]),
    install: ch("steipete", "notion"),
    note: "A Notion integration token is workspace-wide; there is no per-page scope to fall back to." },

  { publicId: "clawhub-chindden-skill-creator", sourceId: "clawhub", ownerHandle: "chindden", slug: "skill-creator",
    name: "Skill Creator (community)", summary: "Community guide for authoring new agent skills.",
    category: "agent-meta", format: "agent_skill", harnesses: ALL4, tags: ["authoring", "meta", "templates"],
    riskLevel: "medium", sourceUrl: "https://clawhub.ai/chindden/skills/skill-creator", license: "UNKNOWN", licenseVerified: false,
    popularity: 46, verified: false, status: "published", publisherName: "chindden", publisherVerified: false,
    widelyAdopted: true, permissions: P_EXEC,
    install: ch("chindden", "skill-creator"),
    note: "Writes into the skills directory. Slug collides with the Anthropic skill of the same name — this is precisely why identity is (source, owner, slug)." },

  { publicId: "clawhub-maximeprades-auto-updater", sourceId: "clawhub", ownerHandle: "maximeprades", slug: "auto-updater",
    name: "Auto Updater", summary: "Daily cron that updates the agent and every installed skill.",
    category: "agent-meta", format: "agent_skill", harnesses: OC, tags: ["updates", "cron", "maintenance"],
    riskLevel: "high", sourceUrl: "https://clawhub.ai/maximeprades/skills/auto-updater", license: "UNKNOWN", licenseVerified: false,
    popularity: 20, verified: false, status: "published", publisherName: "maximeprades", publisherVerified: false,
    requirements: { config: ["openclaw.plugin"] },
    permissions: P_SELF_MODIFY,
    install: ch("maximeprades", "auto-updater"),
    note: "Textbook AST07 Update Drift: a clean v1 becomes hostile at v2 with no human in the loop. Directly contradicts our version-pinning policy." },

  { publicId: "clawhub-ivangdavila-word-docx", sourceId: "clawhub", ownerHandle: "ivangdavila", slug: "word-docx",
    name: "Word DOCX (community)", summary: "Create, inspect and edit Word documents with reliable styles and numbering.",
    category: "documents-files", format: "agent_skill", harnesses: ALL4, tags: ["word", "styles", "documents"],
    riskLevel: "low", sourceUrl: "https://clawhub.ai/ivangdavila/skills/word-docx", license: "UNKNOWN", licenseVerified: false,
    popularity: 55, verified: false, status: "published", publisherName: "ivangdavila", publisherVerified: false,
    permissions: P_EXEC,
    install: ch("ivangdavila", "word-docx") },

  { publicId: "clawhub-steipete-openai-whisper", sourceId: "clawhub", ownerHandle: "steipete", slug: "openai-whisper",
    name: "Whisper (local)", summary: "Local speech-to-text through the Whisper CLI; no API key.",
    category: "media", format: "agent_skill", harnesses: ALL4, tags: ["transcription", "audio", "local-inference"],
    riskLevel: "low", sourceUrl: "https://clawhub.ai/steipete/skills/openai-whisper", license: "UNKNOWN", licenseVerified: false,
    popularity: 60, verified: false, status: "published", publisherName: "steipete", publisherVerified: false,
    requirements: { bins: ["whisper"] },
    permissions: P_EXEC,
    install: ch("steipete", "openai-whisper") },

  { publicId: "clawhub-ivangdavila-excel-xlsx", sourceId: "clawhub", ownerHandle: "ivangdavila", slug: "excel-xlsx",
    name: "Excel XLSX (community)", summary: "Create, inspect and edit Excel workbooks, formulas and date handling.",
    category: "documents-files", format: "agent_skill", harnesses: ALL4, tags: ["excel", "formulas", "spreadsheet"],
    riskLevel: "low", sourceUrl: "https://clawhub.ai/ivangdavila/skills/excel-xlsx", license: "UNKNOWN", licenseVerified: false,
    popularity: 52, verified: false, status: "published", publisherName: "ivangdavila", publisherVerified: false,
    permissions: P_EXEC,
    install: ch("ivangdavila", "excel-xlsx") },

  { publicId: "clawhub-shawnpana-browser-use", sourceId: "clawhub", ownerHandle: "shawnpana", slug: "browser-use",
    name: "Browser Use", summary: "Browser automation for testing, form filling, screenshots and extraction.",
    category: "browser-automation", format: "agent_skill", harnesses: ALL4, tags: ["browser", "forms", "scraping"],
    riskLevel: "high", sourceUrl: "https://clawhub.ai/shawnpana/skills/browser-use", license: "UNKNOWN", licenseVerified: false,
    popularity: 62, verified: false, status: "published", publisherName: "shawnpana", publisherVerified: false,
    requirements: { bins: ["node"] },
    permissions: P_BROWSER,
    install: ch("shawnpana", "browser-use"),
    note: "Same authenticated-browser blast radius as Agent Browser." },

  { publicId: "clawhub-shaivpidadi-free-ride", sourceId: "clawhub", ownerHandle: "shaivpidadi", slug: "free-ride",
    name: "Free Ride", summary: "Ranks and manages free OpenRouter models for the agent.",
    category: "agent-meta", format: "agent_skill", harnesses: OC, tags: ["models", "routing", "openrouter"],
    riskLevel: "medium", sourceUrl: "https://clawhub.ai/shaivpidadi/skills/free-ride", license: "UNKNOWN", licenseVerified: false,
    popularity: 18, verified: false, status: "published", publisherName: "shaivpidadi", publisherVerified: false,
    requirements: { config: ["openclaw.plugin"], env: ["OPENROUTER_API_KEY"] },
    permissions: P_SERVICE(["OpenRouter API key"]),
    install: ch("shaivpidadi", "free-ride"),
    note: "Silently reroutes inference to third-party free endpoints — prompt-data egress the operator did not choose." },

  { publicId: "clawhub-nextfrontierbuilds-elite-longterm-memory", sourceId: "clawhub", ownerHandle: "nextfrontierbuilds", slug: "elite-longterm-memory",
    name: "Elite Long-term Memory", summary: "WAL-protocol memory with vector search, shared across several agent tools.",
    category: "knowledge-memory", format: "agent_skill", harnesses: ALL4, tags: ["memory", "vector-search", "cross-tool"],
    riskLevel: "medium", sourceUrl: "https://clawhub.ai/nextfrontierbuilds/skills/elite-longterm-memory", license: "UNKNOWN", licenseVerified: false,
    popularity: 48, verified: false, status: "published", publisherName: "nextfrontierbuilds", publisherVerified: false,
    permissions: P_HOST_FILES,
    install: ch("nextfrontierbuilds", "elite-longterm-memory"),
    note: "Cross-tool memory aggregation: an injection planted once persists across products." },

  { publicId: "clawhub-matagul-desktop-control", sourceId: "clawhub", ownerHandle: "matagul", slug: "desktop-control",
    name: "Desktop Control", summary: "Mouse, keyboard and screen control automation on the host desktop.",
    category: "browser-automation", format: "agent_skill", harnesses: OC, tags: ["desktop", "input", "automation"],
    riskLevel: "high", sourceUrl: "https://clawhub.ai/matagul/skills/desktop-control", license: "UNKNOWN", licenseVerified: false,
    popularity: 22, verified: false, status: "published", publisherName: "matagul", publisherVerified: false,
    requirements: { config: ["openclaw.plugin"], os: ["darwin", "linux"] },
    permissions: P_DESKTOP,
    install: ch("matagul", "desktop-control"),
    note: "Full desktop authority bypasses every per-app permission boundary. Floor: high." },

  { publicId: "clawhub-steipete-brave-search", sourceId: "clawhub", ownerHandle: "steipete", slug: "brave-search",
    name: "Brave Search", summary: "Web search and content extraction through the Brave Search API.",
    category: "search-research", format: "agent_skill", harnesses: ALL4, tags: ["search", "api", "research"],
    riskLevel: "low", sourceUrl: "https://clawhub.ai/steipete/skills/brave-search", license: "UNKNOWN", licenseVerified: false,
    popularity: 72, verified: false, status: "published", publisherName: "steipete", publisherVerified: false,
    requirements: { env: ["BRAVE_API_KEY"] },
    permissions: P_PUBLIC,
    install: ch("steipete", "brave-search") },

  { publicId: "clawhub-michaelgathara-youtube-watcher", sourceId: "clawhub", ownerHandle: "michaelgathara", slug: "youtube-watcher",
    name: "YouTube Watcher", summary: "Fetches YouTube transcripts to summarize or answer questions about a video.",
    category: "media", format: "agent_skill", harnesses: ALL4, tags: ["youtube", "transcripts", "summarization"],
    riskLevel: "low", sourceUrl: "https://clawhub.ai/michaelgathara/skills/youtube-watcher", license: "UNKNOWN", licenseVerified: false,
    popularity: 50, verified: false, status: "published", publisherName: "michaelgathara", publisherVerified: false,
    permissions: P_PUBLIC,
    install: ch("michaelgathara", "youtube-watcher") },

  { publicId: "clawhub-ivangdavila-powerpoint-pptx", sourceId: "clawhub", ownerHandle: "ivangdavila", slug: "powerpoint-pptx",
    name: "PowerPoint PPTX (community)", summary: "Create, inspect and edit PPTX decks with reliable layouts.",
    category: "documents-files", format: "agent_skill", harnesses: ALL4, tags: ["powerpoint", "slides", "layout"],
    riskLevel: "low", sourceUrl: "https://clawhub.ai/ivangdavila/skills/powerpoint-pptx", license: "UNKNOWN", licenseVerified: false,
    popularity: 44, verified: false, status: "published", publisherName: "ivangdavila", publisherVerified: false,
    permissions: P_EXEC,
    install: ch("ivangdavila", "powerpoint-pptx") },

  { publicId: "clawhub-steipete-slack", sourceId: "clawhub", ownerHandle: "steipete", slug: "slack",
    name: "Slack", summary: "Controls Slack from the agent, including reactions and posting messages.",
    category: "communication", format: "agent_skill", harnesses: OC, tags: ["slack", "messaging", "posting"],
    riskLevel: "high", sourceUrl: "https://clawhub.ai/steipete/skills/slack", license: "UNKNOWN", licenseVerified: false,
    popularity: 58, verified: false, status: "published", publisherName: "steipete", publisherVerified: false,
    requirements: { config: ["openclaw.tool.slack"] },
    permissions: P_PUBLISH(["OpenClaw Slack tool, posts as the operator"]),
    install: ch("steipete", "slack"),
    note: "Posts as the user into shared channels — irreversible and public. Also the canonical 1-of-4 harness case: it needs OpenClaw's own slack tool." },

  { publicId: "clawhub-joargp-news-summary", sourceId: "clawhub", ownerHandle: "joargp", slug: "news-summary",
    name: "News Summary", summary: "Daily news briefings assembled from RSS feeds.",
    category: "search-research", format: "agent_skill", harnesses: ALL4, tags: ["news", "rss", "briefing"],
    riskLevel: "medium", sourceUrl: "https://clawhub.ai/joargp/skills/news-summary", license: "UNKNOWN", licenseVerified: false,
    popularity: 42, verified: false, status: "published", publisherName: "joargp", publisherVerified: false,
    permissions: P_WRITE_NET,
    install: ch("joargp", "news-summary"),
    note: "Pulls untrusted third-party text straight into the agent's context (AST05)." },

  { publicId: "clawhub-steipete-markdown-converter", sourceId: "clawhub", ownerHandle: "steipete", slug: "markdown-converter",
    name: "Markdown Converter", summary: "Converts PDF, DOCX, audio and images to Markdown via markitdown.",
    category: "documents-files", format: "agent_skill", harnesses: ALL4, tags: ["markdown", "conversion", "ingest"],
    riskLevel: "low", sourceUrl: "https://clawhub.ai/steipete/skills/markdown-converter", license: "UNKNOWN", licenseVerified: false,
    popularity: 54, verified: false, status: "published", publisherName: "steipete", publisherVerified: false,
    requirements: { bins: ["markitdown"] },
    permissions: P_EXEC,
    install: ch("steipete", "markdown-converter") },

  { publicId: "clawhub-spiceman161-playwright-mcp", sourceId: "clawhub", ownerHandle: "spiceman161", slug: "playwright-mcp",
    name: "Playwright MCP (community)", summary: "Browser automation routed through the Playwright MCP server.",
    category: "browser-automation", format: "agent_skill", harnesses: ALL4, tags: ["playwright", "mcp", "browser"],
    riskLevel: "high", sourceUrl: "https://clawhub.ai/spiceman161/skills/playwright-mcp", license: "UNKNOWN", licenseVerified: false,
    popularity: 40, verified: false, status: "published", publisherName: "spiceman161", publisherVerified: false,
    requirements: { config: ["mcp.client"], bins: ["npx"] },
    permissions: P_BROWSER,
    install: ch("spiceman161", "playwright-mcp"),
    note: "Community wrapper around Microsoft's server. Prefer the first-party github-microsoft-playwright-mcp entry." },

  { publicId: "clawhub-steipete-trello", sourceId: "clawhub", ownerHandle: "steipete", slug: "trello",
    name: "Trello", summary: "Manages Trello boards, lists and cards through the REST API.",
    category: "productivity", format: "agent_skill", harnesses: ALL4, tags: ["trello", "kanban", "tasks"],
    riskLevel: "medium", sourceUrl: "https://clawhub.ai/steipete/skills/trello", license: "UNKNOWN", licenseVerified: false,
    popularity: 46, verified: false, status: "published", publisherName: "steipete", publisherVerified: false,
    requirements: { env: ["TRELLO_KEY", "TRELLO_TOKEN"] },
    permissions: P_SERVICE(["Trello key and token, board-wide"]),
    install: ch("steipete", "trello") },
  // ---- A4 · modelcontextprotocol/servers (reference; educational, not production) ----
  { publicId: "mcp-reference-everything", sourceId: "mcp-reference", ownerHandle: "modelcontextprotocol", slug: "everything",
    name: "Everything (MCP test server)", summary: "Test server exercising every MCP prompt, resource and tool shape.",
    category: "coding-dev-tools", format: "mcp_server", harnesses: ALL4, tags: ["mcp", "testing", "fixture"],
    riskLevel: "low", sourceUrl: M_SRC, license: "Apache-2.0", licenseVerified: true,
    popularity: 10, verified: true, status: "published", publisherName: "Model Context Protocol", publisherVerified: true,
    requirements: { config: ["mcp.client"], bins: ["npx"] },
    widelyAdopted: true, permissions: P_PROSE,
    install: mcpx("@modelcontextprotocol/server-everything") },

  { publicId: "mcp-reference-fetch", sourceId: "mcp-reference", ownerHandle: "modelcontextprotocol", slug: "fetch",
    name: "Fetch (MCP)", summary: "Retrieves a URL and converts the content for LLM consumption.",
    category: "search-research", format: "mcp_server", harnesses: ALL4, tags: ["mcp", "http", "web"],
    riskLevel: "medium", sourceUrl: M_SRC, license: "Apache-2.0", licenseVerified: true,
    popularity: 28, verified: true, status: "published", publisherName: "Model Context Protocol", publisherVerified: true,
    requirements: { config: ["mcp.client"], bins: ["npx"] },
    widelyAdopted: true, permissions: P_FETCH,
    install: mcpx("@modelcontextprotocol/server-fetch"),
    note: "Arbitrary URL fetch is both an SSRF vector and an untrusted-content ingestion path (AST05)." },

  { publicId: "mcp-reference-filesystem", sourceId: "mcp-reference", ownerHandle: "modelcontextprotocol", slug: "filesystem",
    name: "Filesystem (MCP)", summary: "File operations with configurable directory access controls.",
    category: "coding-dev-tools", format: "mcp_server", harnesses: ALL4, tags: ["mcp", "files", "storage"],
    riskLevel: "high", sourceUrl: M_SRC, license: "Apache-2.0", licenseVerified: true,
    popularity: 26, verified: true, status: "published", publisherName: "Model Context Protocol", publisherVerified: true,
    requirements: { config: ["mcp.client"], bins: ["npx"] },
    widelyAdopted: true, permissions: P_HOST_FILES,
    install: mcpx("@modelcontextprotocol/server-filesystem"),
    note: "Read/write on the host filesystem. Safe only if the allow-list argument is tight — and that is set at install, by us." },

  { publicId: "mcp-reference-git", sourceId: "mcp-reference", ownerHandle: "modelcontextprotocol", slug: "git",
    name: "Git (MCP)", summary: "Read, search and manipulate local git repositories.",
    category: "version-control", format: "mcp_server", harnesses: ALL4, tags: ["mcp", "git", "repos"],
    riskLevel: "medium", sourceUrl: M_SRC, license: "Apache-2.0", licenseVerified: true,
    popularity: 24, verified: true, status: "published", publisherName: "Model Context Protocol", publisherVerified: true,
    requirements: { config: ["mcp.client"], bins: ["npx", "git"] },
    widelyAdopted: true, permissions: P_EXEC,
    install: mcpx("@modelcontextprotocol/server-git"),
    note: "Can rewrite history and stage secrets into a commit." },

  { publicId: "mcp-reference-memory", sourceId: "mcp-reference", ownerHandle: "modelcontextprotocol", slug: "memory",
    name: "Memory (MCP)", summary: "Persistent knowledge-graph storage for the agent.",
    category: "knowledge-memory", format: "mcp_server", harnesses: ALL4, tags: ["mcp", "memory", "graph"],
    riskLevel: "medium", sourceUrl: M_SRC, license: "Apache-2.0", licenseVerified: true,
    popularity: 22, verified: true, status: "published", publisherName: "Model Context Protocol", publisherVerified: true,
    requirements: { config: ["mcp.client"], bins: ["npx"] },
    widelyAdopted: true, permissions: P_WRITE,
    install: mcpx("@modelcontextprotocol/server-memory"),
    note: "Persisted context is a persisted injection surface." },

  { publicId: "mcp-reference-sequential-thinking", sourceId: "mcp-reference", ownerHandle: "modelcontextprotocol", slug: "sequential-thinking",
    name: "Sequential Thinking (MCP)", summary: "Structured multi-step reasoning scaffold with no I/O.",
    category: "agent-meta", format: "mcp_server", harnesses: ALL4, tags: ["mcp", "reasoning", "planning"],
    riskLevel: "low", sourceUrl: M_SRC, license: "Apache-2.0", licenseVerified: true,
    popularity: 20, verified: true, status: "published", publisherName: "Model Context Protocol", publisherVerified: true,
    requirements: { config: ["mcp.client"], bins: ["npx"] },
    widelyAdopted: true, permissions: P_PROSE,
    install: mcpx("@modelcontextprotocol/server-sequential-thinking") },

  { publicId: "mcp-reference-time", sourceId: "mcp-reference", ownerHandle: "modelcontextprotocol", slug: "time",
    name: "Time (MCP)", summary: "Time and timezone conversion; pure computation.",
    category: "coding-dev-tools", format: "mcp_server", harnesses: ALL4, tags: ["mcp", "time", "timezone"],
    riskLevel: "low", sourceUrl: M_SRC, license: "Apache-2.0", licenseVerified: true,
    popularity: 14, verified: true, status: "published", publisherName: "Model Context Protocol", publisherVerified: true,
    requirements: { config: ["mcp.client"], bins: ["npx"] },
    widelyAdopted: true, permissions: P_PROSE,
    install: mcpx("@modelcontextprotocol/server-time") },
  // ---- A5 · third-party MCP servers -------------------------------------------
  { publicId: "github-github-mcp-server", sourceId: "github", ownerHandle: "github", slug: "github-mcp-server",
    name: "GitHub MCP Server", summary: "GitHub's official server for repositories, issues, pull requests and Actions.",
    category: "version-control", format: "mcp_server", harnesses: ALL4, tags: ["github", "mcp", "ci"],
    riskLevel: "high", sourceUrl: "https://github.com/github/github-mcp-server", license: "MIT", licenseVerified: true,
    popularity: 92, verified: true, status: "published", publisherName: "GitHub", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["GITHUB_PERSONAL_ACCESS_TOKEN"] },
    widelyAdopted: true, permissions: P_PUBLISH(["GitHub PAT with repo and workflow scope"]),
    install: { mode: "mcp_stdio", command: "docker", args: ["run", "-i", "--rm", "ghcr.io/github/github-mcp-server"], env: ["GITHUB_PERSONAL_ACCESS_TOKEN"] },
    note: "First-party publisher (−3) yet still high: the token can push code and trigger workflows. Popularity is not safety." },

  { publicId: "github-microsoft-playwright-mcp", sourceId: "github", ownerHandle: "microsoft", slug: "playwright-mcp",
    name: "Playwright MCP", summary: "Microsoft's browser automation server driven by the accessibility tree.",
    category: "browser-automation", format: "mcp_server", harnesses: ALL4, tags: ["playwright", "browser", "mcp"],
    riskLevel: "high", sourceUrl: "https://github.com/microsoft/playwright-mcp", license: "Apache-2.0", licenseVerified: true,
    popularity: 89, verified: true, status: "published", publisherName: "Microsoft", publisherVerified: true,
    requirements: { config: ["mcp.client"], bins: ["npx"] },
    widelyAdopted: true, permissions: P_BROWSER,
    install: mcpx("@playwright/mcp"),
    note: "Drives a real, often logged-in browser. Floor: high." },

  { publicId: "github-upstash-context7", sourceId: "github", ownerHandle: "upstash", slug: "context7",
    name: "Context7", summary: "Injects up-to-date library documentation into the agent's context on demand.",
    category: "coding-dev-tools", format: "mcp_server", harnesses: ALL4, tags: ["docs", "reference", "mcp"],
    riskLevel: "medium", sourceUrl: "https://github.com/upstash/context7", license: "MIT", licenseVerified: true,
    popularity: 87, verified: true, status: "published", publisherName: "Upstash", publisherVerified: true,
    requirements: { config: ["mcp.client"], bins: ["npx"] },
    widelyAdopted: true, permissions: P_FETCH,
    install: mcpx("@upstash/context7-mcp"),
    note: "Third-party documentation text enters context verbatim (AST05)." },

  { publicId: "github-glips-figma-context-mcp", sourceId: "github", ownerHandle: "glips", slug: "figma-context-mcp",
    name: "Figma Context MCP", summary: "Serves Figma layout and design data to coding agents.",
    category: "design-creative", format: "mcp_server", harnesses: ALL4, tags: ["figma", "design", "mcp"],
    riskLevel: "medium", sourceUrl: "https://github.com/GLips/Figma-Context-MCP", license: "MIT", licenseVerified: true,
    popularity: 68, verified: true, status: "published", publisherName: "GLips", publisherVerified: false,
    requirements: { config: ["mcp.client"], env: ["FIGMA_API_KEY"], bins: ["npx"] },
    widelyAdopted: true, permissions: P_SERVICE(["Figma personal access token"]),
    install: mcpx("figma-developer-mcp", ["FIGMA_API_KEY"]) },

  { publicId: "github-googleapis-mcp-toolbox", sourceId: "github", ownerHandle: "googleapis", slug: "mcp-toolbox",
    name: "MCP Toolbox for Databases", summary: "Google's open-source database server spanning many SQL engines.",
    category: "data-databases", format: "mcp_server", harnesses: ALL4, tags: ["sql", "databases", "google"],
    riskLevel: "high", sourceUrl: "https://github.com/googleapis/mcp-toolbox", license: "Apache-2.0", licenseVerified: true,
    popularity: 70, verified: true, status: "published", publisherName: "Google", publisherVerified: true,
    requirements: { config: ["mcp.client"] },
    widelyAdopted: true, permissions: P_BROAD(["database connection strings, one per configured tool"]),
    install: { mode: "mcp_stdio", command: "toolbox", args: ["--tools-file", "tools.yaml"], env: ["DB_URL"] },
    note: "Direct SQL against production stores." },

  { publicId: "github-awslabs-mcp", sourceId: "github", ownerHandle: "awslabs", slug: "mcp",
    name: "AWS MCP Servers", summary: "AWS's suite of official MCP servers across its service surface.",
    category: "devops-cloud", format: "skill_pack", harnesses: ALL4, tags: ["aws", "cloud", "mcp"],
    riskLevel: "high", sourceUrl: "https://github.com/awslabs/mcp", license: "Apache-2.0", licenseVerified: true,
    popularity: 66, verified: true, status: "published", publisherName: "AWS", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"], bins: ["uvx"] },
    widelyAdopted: true, permissions: P_BROAD(["AWS access key, control plane"]),
    install: { mode: "git", repo: "awslabs/mcp", ref: "main", subdir: "src" },
    note: "Cloud control-plane credentials. A pack, so each sub-server needs its own review before use." },

  // The design doc spells this id `github-firecrawl-mcp-server`, which is what
  // collapsing the JOINED string's segments produces. `mintPublicId` collapses over
  // the PARTS, and "firecrawl" !== "firecrawl-mcp-server", so nothing collapses. The
  // mint is authoritative: sync mints this id, and a seed row keyed the other way
  // would be shadowed by a duplicate on the first crawl rather than updated.
  { publicId: "github-firecrawl-firecrawl-mcp-server", sourceId: "github", ownerHandle: "firecrawl", slug: "firecrawl-mcp-server",
    name: "Firecrawl MCP", summary: "Web scraping, crawling and structured extraction as MCP tools.",
    category: "search-research", format: "mcp_server", harnesses: ALL4, tags: ["scraping", "crawling", "extraction"],
    riskLevel: "medium", sourceUrl: "https://github.com/firecrawl/firecrawl-mcp-server", license: "MIT", licenseVerified: true,
    popularity: 64, verified: true, status: "published", publisherName: "Firecrawl", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["FIRECRAWL_API_KEY"], bins: ["npx"] },
    widelyAdopted: true, permissions: P_FETCH,
    install: mcpx("firecrawl-mcp", ["FIRECRAWL_API_KEY"]),
    note: "Bulk untrusted content ingestion at scale." },

  { publicId: "github-cloudflare-mcp-server-cloudflare", sourceId: "github", ownerHandle: "cloudflare", slug: "mcp-server-cloudflare",
    name: "Cloudflare MCP", summary: "Manage Cloudflare edge resources: DNS, Workers, WAF.",
    category: "devops-cloud", format: "mcp_server", harnesses: ALL4, tags: ["cloudflare", "dns", "edge"],
    riskLevel: "high", sourceUrl: "https://github.com/cloudflare/mcp-server-cloudflare", license: "Apache-2.0", licenseVerified: true,
    popularity: 58, verified: true, status: "published", publisherName: "Cloudflare", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["CLOUDFLARE_API_TOKEN"], bins: ["npx"] },
    permissions: P_BROAD(["Cloudflare API token: DNS, WAF, Workers"]),
    install: mcpx("@cloudflare/mcp-server-cloudflare", ["CLOUDFLARE_API_TOKEN"]),
    note: "DNS and WAF changes are production-affecting and take effect globally in seconds." },

  { publicId: "github-makenotion-notion-mcp-server", sourceId: "github", ownerHandle: "makenotion", slug: "notion-mcp-server",
    name: "Notion MCP", summary: "Notion's official server for pages, databases and blocks.",
    category: "productivity", format: "mcp_server", harnesses: ALL4, tags: ["notion", "wiki", "mcp"],
    riskLevel: "medium", sourceUrl: "https://github.com/makenotion/notion-mcp-server", license: "MIT", licenseVerified: true,
    popularity: 62, verified: true, status: "published", publisherName: "Notion", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["NOTION_TOKEN"], bins: ["npx"] },
    permissions: P_SERVICE(["Notion integration token, workspace-wide"]),
    install: mcpx("@notionhq/notion-mcp-server", ["NOTION_TOKEN"]) },

  { publicId: "github-browserbase-mcp-server-browserbase", sourceId: "github", ownerHandle: "browserbase", slug: "mcp-server-browserbase",
    name: "Browserbase MCP", summary: "Cloud browser control via Browserbase and Stagehand.",
    category: "browser-automation", format: "mcp_server", harnesses: ALL4, tags: ["browser", "cloud", "stagehand"],
    riskLevel: "high", sourceUrl: "https://github.com/browserbase/mcp-server-browserbase", license: "Apache-2.0", licenseVerified: true,
    popularity: 44, verified: true, status: "published", publisherName: "Browserbase", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["BROWSERBASE_API_KEY", "BROWSERBASE_PROJECT_ID"], bins: ["npx"] },
    permissions: P_BROWSER,
    install: mcpx("@browserbasehq/mcp-server-browserbase", ["BROWSERBASE_API_KEY", "BROWSERBASE_PROJECT_ID"]),
    note: "A remote browser with injected sessions — the credential is the session itself." },

  { publicId: "github-grafana-mcp-grafana", sourceId: "github", ownerHandle: "grafana", slug: "mcp-grafana",
    name: "Grafana MCP", summary: "Query Grafana dashboards, datasources and alert rules.",
    category: "devops-cloud", format: "mcp_server", harnesses: ALL4, tags: ["grafana", "observability", "alerts"],
    riskLevel: "medium", sourceUrl: "https://github.com/grafana/mcp-grafana", license: "Apache-2.0", licenseVerified: true,
    popularity: 46, verified: true, status: "published", publisherName: "Grafana Labs", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["GRAFANA_URL", "GRAFANA_API_KEY"] },
    permissions: P_SERVICE(["Grafana API key"]),
    install: { mode: "mcp_stdio", command: "mcp-grafana", args: [], env: ["GRAFANA_URL", "GRAFANA_API_KEY"] } },

  { publicId: "github-supabase-mcp", sourceId: "github", ownerHandle: "supabase", slug: "mcp",
    name: "Supabase MCP", summary: "Connect a Supabase project's database and management API to an agent.",
    category: "data-databases", format: "mcp_server", harnesses: ALL4, tags: ["supabase", "postgres", "backend"],
    riskLevel: "high", sourceUrl: "https://github.com/supabase/mcp", license: "Apache-2.0", licenseVerified: true,
    popularity: 56, verified: true, status: "published", publisherName: "Supabase", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["SUPABASE_ACCESS_TOKEN"], bins: ["npx"] },
    permissions: P_BROAD(["Supabase access token, service role bypasses RLS"]),
    install: mcpx("@supabase/mcp-server-supabase", ["SUPABASE_ACCESS_TOKEN"]),
    note: "A service-role key bypasses row-level security entirely." },

  { publicId: "github-tavily-ai-tavily-mcp", sourceId: "github", ownerHandle: "tavily-ai", slug: "tavily-mcp",
    name: "Tavily MCP", summary: "Real-time search, extract, map and crawl for agents.",
    category: "search-research", format: "mcp_server", harnesses: ALL4, tags: ["search", "crawl", "research"],
    riskLevel: "medium", sourceUrl: "https://github.com/tavily-ai/tavily-mcp", license: "MIT", licenseVerified: true,
    popularity: 54, verified: true, status: "published", publisherName: "Tavily", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["TAVILY_API_KEY"], bins: ["npx"] },
    permissions: P_FETCH,
    install: mcpx("tavily-mcp", ["TAVILY_API_KEY"]) },

  { publicId: "github-stripe-ai", sourceId: "github", ownerHandle: "stripe", slug: "ai",
    name: "Stripe Agent Toolkit", summary: "Stripe's official toolkit for AI products: customers, invoices, payments.",
    category: "finance-payments", format: "mcp_server", harnesses: ALL4, tags: ["stripe", "payments", "billing"],
    riskLevel: "high", sourceUrl: "https://github.com/stripe/ai", license: "MIT", licenseVerified: true,
    popularity: 60, verified: true, status: "published", publisherName: "Stripe", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["STRIPE_SECRET_KEY"], bins: ["npx"] },
    permissions: P_PUBLISH(["Stripe secret key"]),
    install: mcpx("@stripe/mcp", ["STRIPE_SECRET_KEY"]),
    note: "Moves money. Must be human-gated at the agent level (AgentSettings.approvalAmount). Floor: high, forever. Repo stripe/agent-toolkit now redirects here." },

  { publicId: "github-qdrant-mcp-server-qdrant", sourceId: "github", ownerHandle: "qdrant", slug: "mcp-server-qdrant",
    name: "Qdrant MCP", summary: "Official Qdrant vector-store server for semantic memory.",
    category: "data-databases", format: "mcp_server", harnesses: ALL4, tags: ["vector", "embeddings", "memory"],
    riskLevel: "medium", sourceUrl: "https://github.com/qdrant/mcp-server-qdrant", license: "Apache-2.0", licenseVerified: true,
    popularity: 40, verified: true, status: "published", publisherName: "Qdrant", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["QDRANT_URL", "QDRANT_API_KEY"], bins: ["uvx"] },
    permissions: P_SERVICE(["Qdrant API key"]),
    install: { mode: "mcp_stdio", command: "uvx", args: ["mcp-server-qdrant"], env: ["QDRANT_URL", "QDRANT_API_KEY"] } },

  { publicId: "github-hashicorp-terraform-mcp-server", sourceId: "github", ownerHandle: "hashicorp", slug: "terraform-mcp-server",
    name: "Terraform MCP", summary: "HashiCorp's Terraform integration for registry lookups and plan inspection.",
    category: "devops-cloud", format: "mcp_server", harnesses: ALL4, tags: ["terraform", "iac", "infrastructure"],
    riskLevel: "high", sourceUrl: "https://github.com/hashicorp/terraform-mcp-server", license: "MPL-2.0", licenseVerified: true,
    popularity: 42, verified: true, status: "published", publisherName: "HashiCorp", publisherVerified: true,
    requirements: { config: ["mcp.client"], bins: ["terraform"] },
    permissions: P_PUBLISH(["whatever provider credentials the workspace holds"]),
    install: { mode: "mcp_stdio", command: "docker", args: ["run", "-i", "--rm", "hashicorp/terraform-mcp-server"], env: [] },
    note: "Infrastructure apply and destroy are irreversible. Floor: high." },

  { publicId: "github-mongodb-js-mongodb-mcp-server", sourceId: "github", ownerHandle: "mongodb-js", slug: "mongodb-mcp-server",
    name: "MongoDB MCP", summary: "Connect to MongoDB deployments and Atlas clusters.",
    category: "data-databases", format: "mcp_server", harnesses: ALL4, tags: ["mongodb", "atlas", "nosql"],
    riskLevel: "high", sourceUrl: "https://github.com/mongodb-js/mongodb-mcp-server", license: "Apache-2.0", licenseVerified: true,
    popularity: 38, verified: true, status: "published", publisherName: "MongoDB", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["MDB_MCP_CONNECTION_STRING"], bins: ["npx"] },
    permissions: P_BROAD(["MongoDB connection string"]),
    install: mcpx("mongodb-mcp-server", ["MDB_MCP_CONNECTION_STRING"]) },

  { publicId: "github-getsentry-sentry-mcp", sourceId: "github", ownerHandle: "getsentry", slug: "sentry-mcp",
    name: "Sentry MCP", summary: "Query Sentry issues, events and releases.",
    category: "devops-cloud", format: "mcp_server", harnesses: ALL4, tags: ["sentry", "errors", "observability"],
    riskLevel: "medium", sourceUrl: "https://github.com/getsentry/sentry-mcp", license: "NOASSERTION", licenseVerified: true,
    popularity: 34, verified: true, status: "published", publisherName: "Sentry", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["SENTRY_AUTH_TOKEN"], bins: ["npx"] },
    permissions: P_SERVICE(["Sentry auth token"]),
    install: mcpx("@sentry/mcp-server", ["SENTRY_AUTH_TOKEN"]),
    note: "Error payloads routinely contain PII and leaked secrets — reading them is a data-handling decision, not just an integration." },

  { publicId: "github-elastic-mcp-server-elasticsearch", sourceId: "github", ownerHandle: "elastic", slug: "mcp-server-elasticsearch",
    name: "Elasticsearch MCP", summary: "Query Elasticsearch indices in natural language.",
    category: "data-databases", format: "mcp_server", harnesses: ALL4, tags: ["elasticsearch", "search", "logs"],
    riskLevel: "medium", sourceUrl: "https://github.com/elastic/mcp-server-elasticsearch", license: "Apache-2.0", licenseVerified: true,
    popularity: 32, verified: true, status: "published", publisherName: "Elastic", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["ES_URL", "ES_API_KEY"], bins: ["npx"] },
    permissions: P_SERVICE(["Elasticsearch API key"]),
    install: mcpx("@elastic/mcp-server-elasticsearch", ["ES_URL", "ES_API_KEY"]) },

  { publicId: "github-neondatabase-mcp-server-neon", sourceId: "github", ownerHandle: "neondatabase", slug: "mcp-server-neon",
    name: "Neon MCP", summary: "Neon Postgres management API plus database access.",
    category: "data-databases", format: "mcp_server", harnesses: ALL4, tags: ["neon", "postgres", "serverless"],
    riskLevel: "high", sourceUrl: "https://github.com/neondatabase/mcp-server-neon", license: "MIT", licenseVerified: true,
    popularity: 30, verified: true, status: "published", publisherName: "Neon", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["NEON_API_KEY"], bins: ["npx"] },
    permissions: P_BROAD(["Neon API key: can create and drop databases"]),
    install: mcpx("@neondatabase/mcp-server-neon", ["NEON_API_KEY"]),
    note: "Can create and drop databases, not only query them." },

  { publicId: "github-redis-mcp-redis", sourceId: "github", ownerHandle: "redis", slug: "mcp-redis",
    name: "Redis MCP", summary: "Redis's official natural-language interface to keys and streams.",
    category: "data-databases", format: "mcp_server", harnesses: ALL4, tags: ["redis", "cache", "kv"],
    riskLevel: "high", sourceUrl: "https://github.com/redis/mcp-redis", license: "MIT", licenseVerified: true,
    popularity: 28, verified: true, status: "published", publisherName: "Redis", publisherVerified: true,
    requirements: { config: ["mcp.client"], env: ["REDIS_URL"], bins: ["uvx"] },
    permissions: P_BROAD(["Redis connection URL"]),
    install: { mode: "mcp_stdio", command: "uvx", args: ["--from", "redis-mcp-server", "redis-mcp-server"], env: ["REDIS_URL"] },
    note: "Cache and session stores routinely hold live tokens." },

  { publicId: "github-chroma-core-chroma-mcp", sourceId: "github", ownerHandle: "chroma-core", slug: "chroma-mcp",
    name: "Chroma MCP", summary: "Chroma vector database server for embeddings and retrieval.",
    category: "data-databases", format: "mcp_server", harnesses: ALL4, tags: ["chroma", "vector", "rag"],
    riskLevel: "medium", sourceUrl: "https://github.com/chroma-core/chroma-mcp", license: "Apache-2.0", licenseVerified: true,
    popularity: 12, verified: true, status: "deprecated", publisherName: "Chroma", publisherVerified: true,
    requirements: { config: ["mcp.client"], bins: ["uvx"] },
    permissions: P_WRITE_NET,
    install: { mode: "mcp_stdio", command: "uvx", args: ["chroma-mcp"], env: [] },
    deprecationNote: "Last upstream push 2025-09-17 — unmaintained against current Chroma releases.",
    note: "Seeded as `deprecated`, not `published`: it still resolves for agents that already pin it, but it is excluded from browse by default." },
  // ---- A6 · portable skill packs ------------------------------------------------
  { publicId: "github-nexu-io-open-design", sourceId: "github", ownerHandle: "nexu-io", slug: "open-design",
    name: "Open Design", summary: "31 composable design skills across 129 design systems for web, mobile, decks and docs.",
    category: "design-creative", format: "skill_pack", harnesses: ALL4, tags: ["design-systems", "ui", "pack"],
    riskLevel: "medium", sourceUrl: "https://github.com/nexu-io/open-design", license: "Apache-2.0", licenseVerified: true,
    popularity: 78, verified: true, status: "published", publisherName: "nexu-io", publisherVerified: false,
    requirements: { bins: ["node"], env: [] },
    widelyAdopted: true, permissions: P_EXEC_NET,
    install: { mode: "git", repo: "nexu-io/open-design", ref: "main", subdir: "skills" },
    note: "Bring-your-own-key proxy plus sandboxed previews; a large generated-code surface. Each sub-skill inherits this rating until reviewed individually." },

  { publicId: "github-mukul975-anthropic-cybersecurity-skills", sourceId: "github", ownerHandle: "mukul975", slug: "anthropic-cybersecurity-skills",
    name: "Cybersecurity Skills (mukul975)", summary: "753+ structured security skills mapped to MITRE ATT&CK techniques.",
    category: "security-secrets", format: "skill_pack", harnesses: ALL4, tags: ["security", "mitre-attack", "pack"],
    riskLevel: "medium", sourceUrl: "https://github.com/mukul975/Anthropic-Cybersecurity-Skills", license: "Apache-2.0", licenseVerified: true,
    popularity: 40, verified: true, status: "published", publisherName: "mukul975", publisherVerified: false,
    widelyAdopted: true, permissions: P_PROSE,
    install: { mode: "git", repo: "mukul975/Anthropic-Cybersecurity-Skills", ref: "main", subdir: "skills" },
    note: "NOT an Anthropic repository despite the name — the owner is mukul975. The UI must render the publisher handle prominently; this is the exact name-vs-authority pattern ClawHavoc exploited. Offensive tooling guidance is dual-use by construction." },

  { publicId: "github-agents365-ai-drawio-skill", sourceId: "github", ownerHandle: "agents365-ai", slug: "drawio-skill",
    name: "Draw.io Skill", summary: "Natural-language draw.io diagrams exported to PNG, SVG or PDF.",
    category: "design-creative", format: "agent_skill", harnesses: ALL4, tags: ["diagrams", "drawio", "export"],
    riskLevel: "low", sourceUrl: "https://github.com/Agents365-ai/drawio-skill", license: "MIT", licenseVerified: true,
    popularity: 64, verified: true, status: "published", publisherName: "Agents365-ai", publisherVerified: false,
    widelyAdopted: true, permissions: P_WRITE,
    install: { mode: "git", repo: "Agents365-ai/drawio-skill", ref: "main", subdir: "." } },

  { publicId: "github-nousresearch-hermes-agent-self-evolution", sourceId: "github", ownerHandle: "nousresearch", slug: "hermes-agent-self-evolution",
    name: "Hermes Self-Evolution", summary: "DSPy + GEPA evolutionary optimization of the agent's own prompts.",
    category: "agent-meta", format: "skill_pack", harnesses: ["hermes"], tags: ["self-improvement", "dspy", "optimization"],
    riskLevel: "high", sourceUrl: "https://github.com/NousResearch/hermes-agent-self-evolution", license: "NONE", licenseVerified: true,
    popularity: 20, verified: true, status: "draft", publisherName: "Nous Research", publisherVerified: true,
    requirements: { bins: ["python3"], config: [] },
    widelyAdopted: true, permissions: P_SELF_MODIFY,
    install: { mode: "git", repo: "NousResearch/hermes-agent-self-evolution", ref: "main", subdir: "skills" },
    note: "The agent rewriting its own instructions is a self-modification floor (high), and the repo declares no licence at all. Draft until a human decides." },

  { publicId: "github-wondelai-skills", sourceId: "github", ownerHandle: "wondelai", slug: "skills",
    name: "Wondel Skills", summary: "Broad cross-platform skill library for agentskills.io hosts.",
    category: "agent-meta", format: "skill_pack", harnesses: ALL4, tags: ["pack", "library", "cross-platform"],
    riskLevel: "medium", sourceUrl: "https://github.com/wondelai/skills", license: "MIT", licenseVerified: true,
    popularity: 30, verified: false, status: "published", publisherName: "wondelai", publisherVerified: false,
    permissions: P_WRITE,
    install: { mode: "git", repo: "wondelai/skills", ref: "main", subdir: "skills" },
    note: "Heterogeneous bundle — the pack rating is a ceiling, not a per-skill verdict." },

  { publicId: "github-zeropointrepo-youtube-skills", sourceId: "github", ownerHandle: "zeropointrepo", slug: "youtube-skills",
    name: "YouTube Skills", summary: "Twelve sub-skills for YouTube search, playlists and reliable transcripts.",
    category: "media", format: "skill_pack", harnesses: ALL4, tags: ["youtube", "transcripts", "pack"],
    riskLevel: "medium", sourceUrl: "https://github.com/ZeroPointRepo/youtube-skills", license: "MIT", licenseVerified: true,
    popularity: 26, verified: false, status: "published", publisherName: "ZeroPointRepo", publisherVerified: false,
    permissions: P_PUBLIC,
    install: { mode: "git", repo: "ZeroPointRepo/youtube-skills", ref: "main", subdir: "skills" },
    note: "Routes through a third-party transcript backend not named in the description — a declared-hosts mismatch to re-check on sync." },

  { publicId: "github-dougtrajano-pydantic-ai-skills", sourceId: "github", ownerHandle: "dougtrajano", slug: "pydantic-ai-skills",
    name: "Pydantic AI Skills", summary: "Type-safe schema validation for skill inputs and outputs.",
    category: "coding-dev-tools", format: "skill_pack", harnesses: ALL4, tags: ["validation", "pydantic", "types"],
    riskLevel: "low", sourceUrl: "https://github.com/DougTrajano/pydantic-ai-skills", license: "MIT", licenseVerified: true,
    popularity: 22, verified: false, status: "published", publisherName: "DougTrajano", publisherVerified: false,
    requirements: { bins: ["python3"] },
    permissions: P_EXEC,
    install: { mode: "git", repo: "DougTrajano/pydantic-ai-skills", ref: "main", subdir: "skills" } },

  { publicId: "github-witt3rd-oh-my-hermes", sourceId: "github", ownerHandle: "witt3rd", slug: "oh-my-hermes",
    name: "oh-my-hermes", summary: "Multi-agent orchestration: deep research, planning, triage and autopilot loops.",
    category: "agent-meta", format: "skill_pack", harnesses: ["hermes"], tags: ["orchestration", "multi-agent", "autopilot"],
    riskLevel: "medium", sourceUrl: "https://github.com/witt3rd/oh-my-hermes", license: "MIT", licenseVerified: true,
    popularity: 18, verified: false, status: "published", publisherName: "witt3rd", publisherVerified: false,
    permissions: P_EXEC,
    install: { mode: "git", repo: "witt3rd/oh-my-hermes", ref: "main", subdir: "skills" },
    note: "Autopilot loops remove human checkpoints — interacts badly with AgentSettings.autonomy = 'auto'." },

  { publicId: "github-tlehman-litprog-skill", sourceId: "github", ownerHandle: "tlehman", slug: "litprog-skill",
    name: "LitProg", summary: "Literate programming workflow portable across several agent harnesses.",
    category: "coding-dev-tools", format: "agent_skill", harnesses: ALL4, tags: ["literate-programming", "docs", "code"],
    riskLevel: "medium", sourceUrl: "https://github.com/tlehman/litprog-skill", license: "NONE", licenseVerified: true,
    popularity: 10, verified: true, status: "draft", publisherName: "tlehman", publisherVerified: false,
    permissions: P_EXEC,
    install: { mode: "git", repo: "tlehman/litprog-skill", ref: "main", subdir: "." },
    note: "No licence = no right to redistribute, and last push 2026-04-10. Draft." },

  { publicId: "github-smartcontractkit-chainlink-agent-skills", sourceId: "github", ownerHandle: "smartcontractkit", slug: "chainlink-agent-skills",
    name: "Chainlink Agent Skills", summary: "Official Chainlink oracle, CCIP and smart-contract skills.",
    category: "finance-payments", format: "skill_pack", harnesses: ALL4, tags: ["chainlink", "web3", "oracles"],
    riskLevel: "high", sourceUrl: "https://github.com/smartcontractkit/chainlink-agent-skills", license: "MIT", licenseVerified: true,
    popularity: 16, verified: true, status: "published", publisherName: "Chainlink Labs", publisherVerified: true,
    requirements: { env: ["PRIVATE_KEY", "RPC_URL"] },
    permissions: P_PUBLISH(["EVM private key and RPC endpoint"]),
    install: { mode: "git", repo: "smartcontractkit/chainlink-agent-skills", ref: "main", subdir: "skills" },
    note: "On-chain transactions are irreversible by design. Floor: high, regardless of the first-party publisher discount." },

  { publicId: "github-black-forest-labs-skills", sourceId: "github", ownerHandle: "black-forest-labs", slug: "skills",
    name: "FLUX Skills", summary: "First-party FLUX image-generation skills.",
    category: "media", format: "skill_pack", harnesses: ALL4, tags: ["image-generation", "flux", "media"],
    riskLevel: "medium", sourceUrl: "https://github.com/black-forest-labs/skills", license: "MIT", licenseVerified: true,
    popularity: 34, verified: true, status: "published", publisherName: "Black Forest Labs", publisherVerified: true,
    requirements: { env: ["BFL_API_KEY"] },
    permissions: P_SERVICE(["Black Forest Labs API key"]),
    install: { mode: "git", repo: "black-forest-labs/skills", ref: "main", subdir: "skills" },
    note: "Paid API key plus content-policy exposure on generated output." },

  { publicId: "github-agentrhq-authsome", sourceId: "github", ownerHandle: "agentrhq", slug: "authsome",
    name: "Authsome", summary: "Local OAuth2 and API credential broker for 45 providers, with an encrypted vault.",
    category: "security-secrets", format: "agent_skill", harnesses: ALL4, tags: ["oauth", "credentials", "vault"],
    riskLevel: "high", sourceUrl: "https://github.com/agentrhq/authsome", license: "MIT", licenseVerified: true,
    popularity: 24, verified: true, status: "published", publisherName: "agentrhq", publisherVerified: false,
    requirements: { bins: ["authsome"] },
    permissions: P_BROAD(["an encrypted vault holding every provider credential the agent uses"]),
    install: { mode: "git", repo: "agentrhq/authsome", ref: "main", subdir: "skill" },
    note: "Well-built, MIT-licensed, and still high: holding 45 providers' credentials is what it is FOR. One compromise is total." },

  { publicId: "github-longbridge-skills", sourceId: "github", ownerHandle: "longbridge", slug: "skills",
    name: "Longbridge Skills", summary: "Live US, HK, A-share and SG market data, fundamentals and positions.",
    category: "finance-payments", format: "skill_pack", harnesses: ALL4, tags: ["markets", "brokerage", "quotes"],
    riskLevel: "high", sourceUrl: "https://github.com/longbridge/skills", license: "MIT", licenseVerified: true,
    popularity: 14, verified: true, status: "published", publisherName: "Longbridge", publisherVerified: true,
    requirements: { env: ["LONGPORT_APP_KEY", "LONGPORT_APP_SECRET", "LONGPORT_ACCESS_TOKEN"] },
    permissions: P_BROAD(["Longbridge app key, app secret and access token"]),
    install: { mode: "git", repo: "longbridge/skills", ref: "main", subdir: "skills" },
    note: "Brokerage account linkage. Read-only quotes and position reads are the safe subset; the credential does not distinguish." },

  // ---- ArkAgent first-party -------------------------------------------------------
  { publicId: "arkagent-translate", sourceId: "arkagent", ownerHandle: "arkagent", slug: "translate",
    name: "Translate", summary: "Reply in the customer's language across en, zh, zht and ja, matching register and formality.",
    category: "communication", format: "agent_skill", harnesses: ALL4, tags: ["translation", "i18n", "customer"],
    riskLevel: "low", sourceUrl: "https://github.com/arkagent/skills", license: "MIT", licenseVerified: true,
    popularity: 76, verified: true, status: "published", publisherName: "ArkAgent", publisherVerified: true,
    permissions: P_PROSE,
    install: { mode: "inline", sha256: "", bytes: 0 },
    note: "Authored in-house. The only seeded rows eligible for install.mode 'inline'." },

  { publicId: "arkagent-daily-digest", sourceId: "arkagent", ownerHandle: "arkagent", slug: "daily-digest",
    name: "Daily Digest", summary: "Composes the end-of-day summary the agent sends to its escalation contact.",
    category: "communication", format: "agent_skill", harnesses: ALL4, tags: ["digest", "reporting", "summary"],
    riskLevel: "low", sourceUrl: "https://github.com/arkagent/skills", license: "MIT", licenseVerified: true,
    popularity: 74, verified: true, status: "published", publisherName: "ArkAgent", publisherVerified: true,
    permissions: P_PROSE,
    install: { mode: "inline", sha256: "", bytes: 0 },
    note: "Pairs with AgentSettings.dailyDigest / digestTime; drafts only, the runtime sends." },
];

/** Fast lookup for the seed script's reconciliation and for tests. */
export const SEED_SKILLS_BY_PUBLIC_ID: ReadonlyMap<string, SeedSkill> = new Map(
  SEED_SKILLS.map((s) => [s.publicId, s]),
);

/**
 * The seed's own totals, asserted in `tests/skills-catalog.test.ts`.
 *
 * Written down rather than left as prose in a design doc: a careless edit that
 * drops a row or flips a `verified` flag then shows up in CI instead of in the
 * catalogue three weeks later.
 */
export const SEED_TOTALS = {
  total: 101,
  bySource: {
    "anthropic-skills": 19,
    "openclaw-skills": 8,
    clawhub: 30,
    "mcp-reference": 7,
    github: 35,
    arkagent: 2,
  },
  byRisk: { low: 43, medium: 33, high: 25 },
  byStatus: { published: 98, draft: 2, deprecated: 1, blocked: 0 },
  /** 30 ClawHub rows, `beam`, and four packs whose sub-skills nobody enumerated. */
  unverified: 35,
  /** The 30 ClawHub rows plus `doc-coauthoring` and `skill-creator`. */
  licenceUnverified: 32,
  /** ★ >= 5,000 or >= 100,000 installs on 2026-08-29. */
  widelyAdopted: 51,
} as const;
