/**
 * The 16-category taxonomy, the keyword→category classifier, and the OWASP risk
 * vocabulary.
 *
 * The categories were derived by reconciling three real taxonomies — ClawHub's
 * live `topics` field, the VoltAgent awesome-list's 31 sections, and the MCP
 * registry's server descriptions (docs/research/SKILL_ECOSYSTEM.md §B). It is a
 * re-derivation rather than a copy because the awesome-list's own categories are
 * demonstrably unreliable: its "Git & GitHub" section contains an Amazon product
 * API skill and an on-chain Plinko game.
 *
 * `agent-meta` and `security-secrets` are deliberately first-class rather than
 * buried in an overflow menu. Four of the ten most-downloaded ClawHub skills are
 * agent-meta and two of the top six are skill scanners: users are visibly
 * shopping for self-improvement and safety tooling, and hiding those two behind
 * a "more" chip hides the two things they came for.
 *
 * Client-safe: pure data and pure functions.
 */
import type { Lang } from "@/lib/types";
import { SKILL_CATEGORY_IDS, isSkillCategory, type SkillCategory } from "./types";

export { SKILL_CATEGORY_IDS, isSkillCategory };
export type { SkillCategory };

/**
 * Display labels in all four UI languages, written natively.
 *
 * Skill `name`, `summary` and `description` are NOT translated — they are
 * upstream text in the publisher's own language, and a machine translation of
 * an attacker-controlled string is one more transformation between what was
 * published and what the operator reads. The taxonomy is ours, so it is.
 */
export const CATEGORY_LABELS: Record<SkillCategory, Record<Lang, string>> = {
  "search-research": {
    en: "Search & Research",
    zh: "搜索与调研",
    zht: "搜尋與研究",
    ja: "検索・リサーチ",
  },
  "browser-automation": {
    en: "Browser & Automation",
    zh: "浏览器与自动化",
    zht: "瀏覽器與自動化",
    ja: "ブラウザ・自動操作",
  },
  "coding-dev-tools": {
    en: "Coding & Dev Tools",
    zh: "编码与开发工具",
    zht: "程式開發工具",
    ja: "コーディング・開発ツール",
  },
  "version-control": {
    en: "Git & Version Control",
    zh: "Git 与版本控制",
    zht: "Git 與版本控制",
    ja: "Git・バージョン管理",
  },
  "devops-cloud": {
    en: "DevOps & Cloud",
    zh: "运维与云平台",
    zht: "維運與雲端",
    ja: "DevOps・クラウド",
  },
  "data-databases": {
    en: "Data & Databases",
    zh: "数据与数据库",
    zht: "資料與資料庫",
    ja: "データ・データベース",
  },
  "documents-files": {
    en: "Documents & Files",
    zh: "文档与文件",
    zht: "文件與檔案",
    ja: "ドキュメント・ファイル",
  },
  communication: {
    en: "Communication",
    zh: "沟通协作",
    zht: "溝通協作",
    ja: "コミュニケーション",
  },
  productivity: {
    en: "Productivity & Tasks",
    zh: "效率与任务",
    zht: "生產力與任務",
    ja: "生産性・タスク",
  },
  "crm-sales-marketing": {
    en: "Sales & Marketing",
    zh: "销售与营销",
    zht: "銷售與行銷",
    ja: "営業・マーケティング",
  },
  media: {
    en: "Media & Generation",
    zh: "多媒体与生成",
    zht: "多媒體與生成",
    ja: "メディア・生成",
  },
  "knowledge-memory": {
    en: "Knowledge & Memory",
    zh: "知识与记忆",
    zht: "知識與記憶",
    ja: "ナレッジ・メモリ",
  },
  "agent-meta": {
    en: "Agent Meta",
    zh: "智能体自管理",
    zht: "智能體自管理",
    ja: "エージェント自己管理",
  },
  "security-secrets": {
    en: "Security & Secrets",
    zh: "安全与凭据",
    zht: "安全與憑證",
    ja: "セキュリティ・認証情報",
  },
  "finance-payments": {
    en: "Finance & Payments",
    zh: "金融与支付",
    zht: "金融與支付",
    ja: "金融・決済",
  },
  "design-creative": {
    en: "Design & Creative",
    zh: "设计与创意",
    zht: "設計與創意",
    ja: "デザイン・クリエイティブ",
  },
};

export function categoryLabel(cat: string, lang: Lang): string {
  // `isSkillCategory`, not a bare index. `CATEGORY_LABELS` is an object literal,
  // so it inherits Object.prototype: indexing it with a category string that
  // arrived from a URL query — `?category=constructor` — returned the Object
  // constructor, which is truthy, and the function then handed back
  // `Function["en"]`, i.e. `undefined` typed as `string`. Every caller renders
  // that as a blank chip or throws on `.toUpperCase()`.
  return isSkillCategory(cat) ? CATEGORY_LABELS[cat][lang] : cat;
}

/**
 * Keyword → category, for the sync pipeline's classifier.
 *
 * Deterministic and LLM-free by design: `classifyCategory` runs on every
 * ingested row, and a catalogue whose taxonomy depends on an API key is a
 * catalogue that classifies differently depending on whether the key was set
 * that morning. Order within a list does not matter; order of the CATEGORIES
 * array does — the first category to reach the highest score wins, and ties
 * resolve to the earlier (broader) category.
 */
const CATEGORY_KEYWORDS: Record<SkillCategory, string[]> = {
  "search-research": [
    "search", "research", "rss", "news", "scrape", "scraping", "arxiv", "crawl",
    "web-search", "serp", "weather", "brave", "tavily", "firecrawl", "fetch",
  ],
  "browser-automation": [
    "browser", "playwright", "puppeteer", "selenium", "headless", "desktop",
    "automation", "screenshot", "form-fill", "stagehand", "browserbase",
  ],
  "coding-dev-tools": [
    "code", "coding", "refactor", "lint", "test", "testing", "scaffold", "cli",
    "sdk", "compiler", "debug", "typescript", "python", "mcp", "docs", "sandbox",
  ],
  "version-control": [
    "git", "github", "gitlab", "bitbucket", "pull-request", "pr", "commit",
    "release", "changelog", "ci", "actions",
  ],
  "devops-cloud": [
    "devops", "kubernetes", "k8s", "terraform", "aws", "gcp", "azure",
    "cloudflare", "docker", "observability", "grafana", "sentry", "incident",
    "deploy", "infrastructure",
  ],
  "data-databases": [
    "sql", "postgres", "mysql", "mongodb", "redis", "elasticsearch", "vector",
    "qdrant", "chroma", "warehouse", "etl", "analytics", "database", "supabase",
    "neon", "bigquery",
  ],
  "documents-files": [
    "pdf", "docx", "xlsx", "pptx", "word", "excel", "powerpoint", "markdown",
    "ocr", "document", "spreadsheet", "convert", "readme", "file",
  ],
  communication: [
    "slack", "discord", "telegram", "whatsapp", "email", "gmail", "sms",
    "voice", "message", "notify", "newsletter", "comms",
  ],
  productivity: [
    "calendar", "todo", "task", "notion", "trello", "jira", "linear", "asana",
    "schedule", "reminder", "kanban", "obsidian-tasks",
  ],
  "crm-sales-marketing": [
    "crm", "salesforce", "hubspot", "outreach", "seo", "campaign", "lead",
    "marketing", "sales", "social", "ads", "klaviyo",
  ],
  media: [
    "image", "video", "audio", "transcribe", "whisper", "tts", "speech",
    "youtube", "gif", "flux", "render", "podcast", "media",
  ],
  "knowledge-memory": [
    "memory", "knowledge", "graph", "ontology", "rag", "obsidian", "notes",
    "vault", "pkm", "embedding", "recall", "learning",
  ],
  "agent-meta": [
    "agent", "skill-creator", "self-improve", "orchestration", "handoff",
    "eval", "autopilot", "transcript", "session", "meta", "prompt",
  ],
  "security-secrets": [
    "security", "vulnerability", "scan", "vetting", "secret", "credential",
    "vault", "oauth", "audit", "malware", "cve", "mitre",
  ],
  "finance-payments": [
    "payment", "stripe", "invoice", "accounting", "crypto", "web3", "chain",
    "trading", "brokerage", "market-data", "wallet", "ledger",
  ],
  "design-creative": [
    "design", "figma", "brand", "typography", "diagram", "drawio", "poster",
    "art", "theme", "palette", "ui", "layout", "writing-style",
  ],
};

/**
 * Best-effort classification from an upstream row's topics, tags and name.
 *
 * Falls back to `coding-dev-tools` rather than guessing: it is the broadest
 * category and the largest by ecosystem volume, so a misfiled row lands where a
 * human reviewing the draft queue would look for it anyway. Sync never
 * overwrites `category` on an EXISTING row (that is curation), so a bad guess
 * here is corrected once and stays corrected.
 */
/**
 * Compiled once at module load, not once per keyword per call.
 *
 * The previous spelling built ~190 `RegExp` objects on every invocation, and
 * `classifyCategory` runs on EVERY ingested row: a 2,000-row ClawHub page
 * compiled 380,000 throwaway regexes. Same patterns, same results, built once.
 *
 * Word-ish boundary: `git` must not match `digit`, but `github-mcp` must match
 * `github`. Non-alphanumeric on both sides is the honest test — `\b` is wrong
 * here because the keywords themselves contain `-`.
 */
const CATEGORY_MATCHERS: ReadonlyArray<readonly [SkillCategory, readonly RegExp[]]> =
  SKILL_CATEGORY_IDS.map((cat) => [
    cat,
    CATEGORY_KEYWORDS[cat].map(
      (kw) => new RegExp(`(^|[^a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`),
    ),
  ] as const);

export function classifyCategory(signals: readonly string[]): SkillCategory {
  // Bounded before the scan. `signals` carries upstream `topics`, `tags` and
  // `name` straight off a registry page; a publisher who ships a megabyte of
  // keywords should cost us a truncated classification, not 190 regex passes
  // over a megabyte on the ingest hot path.
  const hay = signals.join(" ").toLowerCase().slice(0, 4000);
  let best: SkillCategory = "coding-dev-tools";
  let bestScore = 0;
  for (const [cat, matchers] of CATEGORY_MATCHERS) {
    let score = 0;
    for (const re of matchers) if (re.test(hay)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Risk vocabulary — OWASP Agentic Skills Top 10 (v1.0, 2026 Edition)
// ---------------------------------------------------------------------------

/**
 * The named risks the scorer's signals map onto, so a `risk_signals[].code` in
 * the drawer can be traced to a published taxonomy rather than to our opinion.
 * AST10 matters to us specifically: running one skill on four harnesses is our
 * value proposition AND a named OWASP risk in the same sentence, which is why
 * `agent_skills.compat_asserted` defaults false and the attach flow makes the
 * user say it out loud.
 */
export const OWASP_AST = {
  AST01: { id: "AST01", title: "Malicious Skills", severity: "critical" },
  AST02: { id: "AST02", title: "Supply Chain Compromise", severity: "critical" },
  AST03: { id: "AST03", title: "Over-Privileged Skills", severity: "high" },
  AST04: { id: "AST04", title: "Insecure Metadata", severity: "high" },
  AST05: { id: "AST05", title: "Untrusted External Instructions", severity: "high" },
  AST06: { id: "AST06", title: "Weak Isolation", severity: "high" },
  AST07: { id: "AST07", title: "Update Drift", severity: "medium" },
  AST08: { id: "AST08", title: "Poor Scanning", severity: "medium" },
  AST09: { id: "AST09", title: "No Governance", severity: "medium" },
  AST10: { id: "AST10", title: "Cross-Platform Reuse", severity: "medium" },
} as const;

export type OwaspAstId = keyof typeof OWASP_AST;
