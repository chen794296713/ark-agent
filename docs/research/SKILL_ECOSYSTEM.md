# Skill Ecosystem Research — seed catalog for the ArkAgent Skill Repository

Research date: **2026-08-29**. Every star count, download count, license and endpoint below was
pulled live from the GitHub REST API or the vendor's own public API on that date — not from
memory and not from a blog post. Where a claim comes from a curated list rather than a primary
source it is marked **UNVERIFIED**.

Method: `gh api` (authenticated, so rate limits are the 5,000/h user bucket rather than 60/h
anonymous) for GitHub facts; `curl` against `clawhub.ai` and `registry.modelcontextprotocol.io`
for registry facts. Several popularity claims made by third-party "awesome" lists were checked
and found to be **wrong in both directions** — see [Gaps](#f-honest-gaps-and-unverified-claims).

---

## 0. The single most important finding

**All four harnesses read the same skill format from the same directory.** There is no
per-harness skill format to normalize between. The Agent Skills format (a folder containing a
`SKILL.md` with YAML frontmatter carrying at minimum `name` and `description`) was released by
Anthropic as an open standard, now lives at [agentskills.io](https://agentskills.io), and is
implemented by every harness in our `engine` enum:

| Harness (`engine` value) | Skill dirs it scans | Spec compliance | MCP client |
|---|---|---|---|
| `openclaw` | `<workspace>/skills`, `<workspace>/.agents/skills`, `~/.agents/skills`, `<state-dir>/skills`, bundled | "OpenClaw follows the AgentSkills spec" | yes |
| `hermes` | `~/.hermes/skills/`, `<repo>/.hermes/skills/`, `.agents/skills/`, taps | "fully compatible with the agentskills.io open standard" | yes (native) |
| `codex` | `.agents/skills` (cwd→repo root), `$HOME/.agents/skills`, `/etc/codex/skills`, built-in | "build on the open agent skills standard" | yes |
| `deepseek` | `./.deepcode/skills/`, `./.agents/skills/`, `~/.deepcode/skills/`, `~/.agents/skills/`, built-in | references the agentskills.io spec | yes |

`.agents/skills/` is the **universal path**: it is honoured by all four. A skill written once and
materialized there runs everywhere.

Consequences for our design, and they are large:

1. `skills` needs **one** canonical body format (`SKILL.md` + frontmatter + optional
   `scripts/`, `references/`, `assets/`), not four.
2. The `agent_skills` join table's per-harness column should record **compatibility**
   (does this skill's *runtime dependency* exist on that harness?), not *format*. A pure-prose
   skill is 4/4 by construction. A skill that shells out to the `openclaw` CLI is 1/4.
3. Harness incompatibility comes from three things only: (a) a required binary on `PATH`,
   (b) a required env var / credential, (c) a required host-specific tool (e.g. the OpenClaw
   `slack` *tool*, or a code plugin). OpenClaw already encodes exactly this in
   `metadata.openclaw.requires.{bins,env,config}` and `os`. **We should adopt that shape
   verbatim** as our `skills.requirements` JSONB rather than inventing one.

Second finding, equally load-bearing: **bare slugs are not unique.** `GET /api/v1/skills/github`
on ClawHub returns `AMBIGUOUS_SKILL_SLUG` with six different publishers. The canonical identity is
`@owner/slug` plus a version. Our `skills` table must be keyed on
`(source_id, owner_handle, slug)` with a unique constraint, and `agent_skills` must pin a
**version**, not a floating `latest` — see [AST07 Update Drift](#d-safety).

---

## A. Seed catalog — 100 concrete entries

Harness codes: **OC** OpenClaw · **HM** Hermes · **CX** Codex Harness · **DS** DeepSeek Harness.
"All 4" = pure Agent Skills format with no harness-specific runtime dependency.
Risk = the value we would seed into `skills.risk_level`; the rubric is in [§D](#d-safety).

### A1 · Anthropic official Agent Skills — the reference implementations

Source repo: <https://github.com/anthropics/skills> — **★172,378**, pushed 2026-08-21.
Repo-level license resolves to `NONE` via the API because it is a **mix**: most skills say
"Complete terms in LICENSE.txt"; the four document skills (`docx`, `pdf`, `pptx`, `xlsx`) declare
**"Proprietary. LICENSE.txt has complete terms"**. Treat the document four as source-available,
not open source — this matters if we redistribute rather than link.

| # | slug | Display name | One-line summary | Category | Harnesses | License | Popularity | Risk |
|---|---|---|---|---|---|---|---|---|
| 1 | `academy-guide` | Academy Guide | Recommends Claude Academy courses/tutorials matching a "how do I" question. | knowledge-memory | All 4 | source-available | repo ★172k | **low** — prose only, no scripts, no network. |
| 2 | `algorithmic-art` | Algorithmic Art | Generative p5.js art with seeded randomness and parameter exploration. | design-creative | All 4 | source-available | repo ★172k | **low** — emits local .html/.js, no credentials. |
| 3 | `brand-guidelines` | Brand Guidelines | Applies Anthropic brand colors and typography to an artifact. | design-creative | All 4 | source-available | repo ★172k | **low** — static style reference. |
| 4 | `canvas-design` | Canvas Design | Design-philosophy-driven poster/art generation to .pdf/.png. | design-creative | All 4 | source-available | repo ★172k | **low** — local file output only. |
| 5 | `claude-api` | Claude API | Reference for Claude API model ids, pricing, streaming, tool use, caching. | coding-dev-tools | All 4 | source-available | repo ★172k | **low** — documentation lookup. |
| 6 | `discernment-nudge` | Discernment Nudge | Appends fact/assumption-checking follow-up questions after substantive answers. | agent-meta | All 4 | source-available | repo ★172k | **low** — output post-processing only. |
| 7 | `doc-coauthoring` | Doc Co-Authoring | Structured three-stage workflow for co-writing docs and specs. | documents-files | All 4 | unstated in frontmatter | repo ★172k | **low** — prose workflow. |
| 8 | `docx` | DOCX | Create/read/edit Word .docx and .dotx, incl. tracked changes and forms. | documents-files | All 4 | **Proprietary** | repo ★172k | **low** — local files; needs python-docx/openpyxl on PATH. |
| 9 | `frontend-design` | Frontend Design | Opinionated visual direction for new UI: palette, type, layout. | design-creative | All 4 | source-available | repo ★172k | **low** — advisory. |
| 10 | `internal-comms` | Internal Comms | Writes status reports, 3P updates, newsletters, incident reports. | communication | All 4 | source-available | repo ★172k | **low** — drafting only, no send. |
| 11 | `mcp-builder` | MCP Builder | Guide to building high-quality MCP servers in Python or TS. | coding-dev-tools | All 4 | source-available | repo ★172k | **low** — codegen guidance. |
| 12 | `pdf` | PDF | Extract, merge, split, watermark, OCR, fill forms on PDFs. | documents-files | All 4 | **Proprietary** | repo ★172k | **low** — local files. |
| 13 | `pptx` | PPTX | Create/edit PowerPoint decks, layouts, speaker notes, templates. | documents-files | All 4 | **Proprietary** | repo ★172k | **low** — local files. |
| 14 | `skill-creator` | Skill Creator | Create, edit, eval and benchmark skills; optimize descriptions. | agent-meta | All 4 | unstated in frontmatter | repo ★172k | **medium** — writes into the skills dir; self-modifying surface (AST01/AST09). |
| 15 | `slack-gif-creator` | Slack GIF Creator | Build animated GIFs sized to Slack's constraints. | media | All 4 | source-available | repo ★172k | **low** — local encode, no upload. |
| 16 | `theme-factory` | Theme Factory | 10 preset color/font themes applied to any artifact. | design-creative | All 4 | source-available | repo ★172k | **low** — static tokens. |
| 17 | `web-artifacts-builder` | Web Artifacts Builder | React/Tailwind/shadcn multi-component artifact scaffolding + bundling. | coding-dev-tools | All 4 | source-available | repo ★172k | **medium** — runs `init-artifact.sh`/`bundle-artifact.sh` and installs npm deps. |
| 18 | `webapp-testing` | Webapp Testing | Drive and test local web apps with Playwright; screenshots + logs. | browser-automation | All 4 | source-available | repo ★172k | **medium** — launches a browser and executes arbitrary local Python. |
| 19 | `xlsx` | XLSX | Create/edit .xlsx/.csv with formulas, formatting, charts; clean messy data. | documents-files | All 4 | **Proprietary** | repo ★172k | **low** — local files. |

### A2 · OpenClaw first-party skills

Source repo: <https://github.com/openclaw/agent-skills> — **★1,068**, MIT, pushed 2026-08-28.
These are the only skills in that repo (verified: exactly 8 directories under `skills/`).

| # | slug | Display name | One-line summary | Category | Harnesses | License | Popularity | Risk |
|---|---|---|---|---|---|---|---|---|
| 20 | `agent-transcript` | Agent Transcript | Produce a readable transcript of an agent session. | agent-meta | All 4 | MIT | ★1,068 | **low** — reads local session files. |
| 21 | `autoreview` | Autoreview | Automated review pass over changes before handoff. | coding-dev-tools | All 4 | MIT | ★1,068 | **low** — read-only analysis. |
| 22 | `beam` | Beam | OpenClaw file/data beaming helper. | agent-meta | OC (**UNVERIFIED** for HM/CX/DS) | MIT | ★1,068 | **medium** — moves data between hosts. |
| 23 | `behavior-validator` | Behavior Validator | Validate an agent's behaviour against expectations. | agent-meta | All 4 | MIT | ★1,068 | **low** — assertion harness. |
| 24 | `crabbox` | Crabbox | Sandboxed execution helper for OpenClaw. | coding-dev-tools | OC | MIT | ★1,068 | **high** — its purpose is executing untrusted code; isolation quality is the whole risk. |
| 25 | `handoff` | Handoff | Structured context handoff between agents/sessions. | agent-meta | All 4 | MIT | ★1,068 | **low** — writes a local handoff doc. |
| 26 | `readme-standard` | README Standard | Enforce a README structure/standard on a repo. | documents-files | All 4 | MIT | ★1,068 | **low** — edits a markdown file. |
| 27 | `session-viewer` | Session Viewer | Browse and inspect prior agent sessions. | agent-meta | OC | MIT | ★1,068 | **low** — local read. |

### A3 · ClawHub top community skills, ranked by **verified** download count

Pulled live from `GET https://clawhub.ai/api/v1/skills?limit=60&sort=downloads&nonSuspiciousOnly=true`.
Download counts are ClawHub's own install telemetry. Owner handles were resolved individually via
`GET /api/v1/search?q=<slug>&mode=exact` because the list endpoint omits `ownerHandle`.
Canonical page URL pattern: `https://clawhub.ai/<owner>/skills/<slug>`.
**Licenses are not exposed by the ClawHub list/search API** — every row here is license-UNKNOWN
until we fetch `SKILL.md` per skill. That is a seeding blocker, see [§F](#f-honest-gaps-and-unverified-claims).

| # | Canonical ref | Display name | One-line summary | Category | Harnesses | License | Downloads | Risk |
|---|---|---|---|---|---|---|---|---|
| 28 | `@pskoett/self-improving-agent` | self-improving agent | Captures learnings, errors and corrections into a persistent improvement log. | agent-meta | All 4 | UNKNOWN | **476,682** | **medium** — writes agent-readable memory that later steers behaviour (AST05 self-injection surface). |
| 29 | `@spclaudehome/skill-vetter` | Skill Vetter | Security-first vetting of a skill before installation. | security-secrets | All 4 | UNKNOWN | **270,861** | **low** — read-and-report; its value is precisely that it is inert. |
| 30 | `@oswalpalash/ontology` | Ontology | Typed knowledge graph for structured agent memory. | knowledge-memory | All 4 | UNKNOWN | **197,362** | **low** — local structured store. |
| 31 | `@steipete/github` | Github | Drive GitHub through the `gh` CLI: issues, PRs, runs, `gh api`. | version-control | All 4 (needs `gh`) | UNKNOWN | **196,851** | **medium** — inherits the user's full `gh` auth scope; ClawScan verdict `clean` but flags exactly this. |
| 32 | `@steipete/gog` | gog | Google Workspace CLI: Gmail, Calendar, Drive, Contacts, Sheets, Docs. | productivity | All 4 (needs `gog`) | UNKNOWN | **192,135** | **high** — full mailbox + drive read/write under one OAuth grant. |
| 33 | `@tokauthai/skillscan` | SkillScan | Security gate that every new skill must pass before use. | security-secrets | All 4 | UNKNOWN | **181,396** | **low** — analysis only. |
| 34 | `@steipete/weather` | Weather | Current weather and forecasts, no API key required. | search-research | All 4 | UNKNOWN | **168,073** | **low** — anonymous read of a public API. |
| 35 | `@gpyangyoujun/multi-search-engine` | Multi Search Engine | 16 search engines (7 CN + 9 global) with advanced operators. | search-research | All 4 | UNKNOWN | **160,115** | **low** — read-only web search. |
| 36 | `@matrixy/agent-browser-clawdbot` | Agent Browser | Headless browser automation with accessibility-tree snapshots. | browser-automation | All 4 | UNKNOWN | **154,596** | **high** — a browser carrying the user's cookies is a credential (AST03). |
| 37 | `@biostartechnology/humanizer` | Humanizer | Removes AI-writing tells from text. | design-creative | All 4 | UNKNOWN | **129,016** | **low** — pure text transform. |
| 38 | `@steipete/nano-pdf` | nano-pdf | Edit PDFs with natural-language instructions. | documents-files | All 4 (needs `nano-pdf`) | UNKNOWN | **120,796** | **low** — local file edit. |
| 39 | `@steipete/obsidian` | Obsidian | Work with Obsidian vaults and automate via `obsidian-cli`. | knowledge-memory | All 4 | UNKNOWN | **108,545** | **medium** — read/write over an entire personal note corpus. |
| 40 | `@steipete/notion` | Notion | Notion API for pages, databases and blocks. | productivity | All 4 | UNKNOWN | **101,851** | **medium** — workspace-wide token. |
| 41 | `@chindden/skill-creator` | Skill Creator | Guide for authoring new skills. | agent-meta | All 4 | UNKNOWN | **100,147** | **medium** — writes into the skill directory. |
| 42 | `@maximeprades/auto-updater` | Auto Updater | Daily cron that updates the agent and every installed skill. | agent-meta | OC | UNKNOWN | **99,041** | **high** — unattended auto-update is textbook AST07 Update Drift; a clean v1 can become hostile at v2 with no human in the loop. |
| 43 | `@ivangdavila/word-docx` | Word DOCX | Create/inspect/edit Word documents with reliable styles and numbering. | documents-files | All 4 | UNKNOWN | **91,034** | **low** — local files. |
| 44 | `@steipete/openai-whisper` | OpenAI Whisper | Local speech-to-text via the Whisper CLI, no API key. | media | All 4 (needs `whisper`) | UNKNOWN | **87,654** | **low** — fully local inference. |
| 45 | `@ivangdavila/excel-xlsx` | Excel XLSX | Create/inspect/edit Excel workbooks, formulas, dates. | documents-files | All 4 | UNKNOWN | **79,406** | **low** — local files. |
| 46 | `@shawnpana/browser-use` | Browser Use | Browser automation for testing, forms, screenshots, extraction. | browser-automation | All 4 | UNKNOWN | **75,137** | **high** — same authenticated-browser blast radius as #36. |
| 47 | `@shaivpidadi/free-ride` | Free Ride | Ranks and manages free OpenRouter models for the agent. | agent-meta | OC | UNKNOWN | **70,165** | **medium** — silently reroutes inference to third-party free endpoints; prompt data egress. |
| 48 | `mcporter` (owner **UNVERIFIED**) | mcporter | CLI to list, configure, auth and call MCP servers/tools (HTTP or stdio). | coding-dev-tools | All 4 | UNKNOWN | **69,457** | **high** — a generic MCP dialer expands the tool surface arbitrarily at runtime. |
| 49 | `@nextfrontierbuilds/elite-longterm-memory` | Elite Long-term Memory | WAL-protocol + vector-search memory across Cursor/Claude/ChatGPT/Copilot. | knowledge-memory | All 4 | UNKNOWN | **64,267** | **medium** — cross-tool memory aggregation; injection persists across products. |
| 50 | `@matagul/desktop-control` | Desktop Control | Mouse, keyboard and screen control automation. | browser-automation | OC | UNKNOWN | **61,530** | **high** — full desktop authority; bypasses every per-app permission boundary. |
| 51 | `@steipete/brave-search` | Brave Search | Web search and content extraction via the Brave Search API. | search-research | All 4 | UNKNOWN | **61,320** | **low** — read-only, scoped API key. |
| 52 | `@michaelgathara/youtube-watcher` | YouTube Watcher | Fetch YouTube transcripts to summarize or answer about a video. | media | All 4 | UNKNOWN | **54,953** | **low** — public read. |
| 53 | `@ivangdavila/powerpoint-pptx` | PowerPoint PPTX | Create/inspect/edit PPTX decks with reliable layouts. | documents-files | All 4 | UNKNOWN | **54,561** | **low** — local files. |
| 54 | `@steipete/slack` | Slack | Control Slack from the agent, including reacting and messaging. | communication | OC (needs the OpenClaw `slack` tool) | UNKNOWN | **53,403** | **high** — can post as the user into shared channels; irreversible and public. |
| 55 | `@joargp/news-summary` | News Summary | Daily news briefings from RSS. | search-research | All 4 | UNKNOWN | **49,388** | **medium** — pulls untrusted third-party text straight into context (AST05). |
| 56 | `@steipete/markdown-converter` | Markdown Converter | Convert PDF/DOCX/audio/images to Markdown via `markitdown`. | documents-files | All 4 | UNKNOWN | **48,264** | **low** — local conversion. |
| 57 | `@spiceman161/playwright-mcp` | Playwright MCP | Browser automation through the Playwright MCP server. | browser-automation | All 4 | UNKNOWN | **45,869** | **high** — authenticated browser control. |
| 58 | `@steipete/trello` | Trello | Manage Trello boards, lists and cards via the REST API. | productivity | All 4 | UNKNOWN | **43,238** | **medium** — board-wide write token. |

### A4 · MCP reference servers

Source: <https://github.com/modelcontextprotocol/servers> — **★89,947**, Apache-2.0 + MIT,
pushed 2026-08-28. The maintainers state plainly these are **educational examples, not
production-ready**; seed them as "reference", never as a recommended default. Thirteen former
reference servers (GitHub, GitLab, Slack, Postgres, SQLite, …) were moved to
`modelcontextprotocol/servers-archived` (★294, last push **2025-05-28** — dead) and must not be
seeded as live.

| # | slug | Display name | One-line summary | Category | Harnesses | License | Popularity | Risk |
|---|---|---|---|---|---|---|---|---|
| 59 | `mcp-everything` | Everything | Test server exercising prompts, resources and tools. | coding-dev-tools | All 4 (MCP) | Apache-2.0/MIT | ★89,947 | **low** — a test fixture. |
| 60 | `mcp-fetch` | Fetch | Retrieve and convert web content for LLM consumption. | search-research | All 4 (MCP) | Apache-2.0/MIT | ★89,947 | **medium** — arbitrary URL fetch is an SSRF and injection vector. |
| 61 | `mcp-filesystem` | Filesystem | File operations with configurable access controls. | coding-dev-tools | All 4 (MCP) | Apache-2.0/MIT | ★89,947 | **high** — read/write to the host FS; safe only if the allow-list is tight. |
| 62 | `mcp-git` | Git | Read, search and manipulate git repositories. | version-control | All 4 (MCP) | Apache-2.0/MIT | ★89,947 | **medium** — can rewrite history and stage secrets. |
| 63 | `mcp-memory` | Memory | Persistent knowledge-graph storage. | knowledge-memory | All 4 (MCP) | Apache-2.0/MIT | ★89,947 | **medium** — persisted context is a persisted injection surface. |
| 64 | `mcp-sequential-thinking` | Sequential Thinking | Structured multi-step reasoning scaffold. | agent-meta | All 4 (MCP) | Apache-2.0/MIT | ★89,947 | **low** — pure reasoning, no I/O. |
| 65 | `mcp-time` | Time | Time and timezone conversion. | coding-dev-tools | All 4 (MCP) | Apache-2.0/MIT | ★89,947 | **low** — pure computation. |

### A5 · Third-party MCP servers — all star counts verified live

All are MCP servers, so all four harnesses can consume them via their MCP client; the harness
column is uniformly "All 4 (MCP)" and is omitted for width. Risk reflects the authority the
server's credential carries.

| # | slug | Display name | One-line summary | Category | Source | License | Stars | Risk |
|---|---|---|---|---|---|---|---|---|
| 66 | `github-mcp-server` | GitHub MCP Server | GitHub's official server: repos, issues, PRs, Actions. | version-control | github/github-mcp-server | MIT | ★32,591 | **high** — a PAT with repo+workflow scope can push code and trigger CI. |
| 67 | `playwright-mcp` | Playwright MCP | Microsoft's browser automation server. | browser-automation | microsoft/playwright-mcp | Apache-2.0 | ★36,596 | **high** — drives a real, often logged-in browser. |
| 68 | `context7` | Context7 | Up-to-date library documentation injected on demand. | coding-dev-tools | upstash/context7 | MIT | ★61,376 | **medium** — injects third-party doc text into context (AST05). |
| 69 | `figma-context-mcp` | Figma Context MCP | Serves Figma layout data to coding agents. | design-creative | GLips/Figma-Context-MCP | MIT | ★15,732 | **medium** — read token over design files. |
| 70 | `mcp-toolbox` | MCP Toolbox for Databases | Google's open-source DB server across many engines. | data-databases | googleapis/mcp-toolbox | Apache-2.0 | ★16,274 | **high** — direct SQL against production stores. |
| 71 | `awslabs-mcp` | AWS MCP Servers | AWS's suite of official MCP servers. | devops-cloud | awslabs/mcp | Apache-2.0 | ★9,643 | **high** — cloud control-plane credentials. |
| 72 | `firecrawl-mcp` | Firecrawl MCP | Web scraping, crawling and structured extraction. | search-research | firecrawl/firecrawl-mcp-server | MIT | ★7,343 | **medium** — bulk untrusted content ingestion. |
| 73 | `cloudflare-mcp` | Cloudflare MCP | Manage Cloudflare edge resources. | devops-cloud | cloudflare/mcp-server-cloudflare | Apache-2.0 | ★4,124 | **high** — DNS/WAF changes are production-affecting. |
| 74 | `notion-mcp-server` | Notion MCP | Official Notion server for pages and databases. | productivity | makenotion/notion-mcp-server | MIT | ★4,612 | **medium** — workspace-wide token. |
| 75 | `mcp-server-browserbase` | Browserbase MCP | Cloud browser control via Browserbase + Stagehand. | browser-automation | browserbase/mcp-server-browserbase | Apache-2.0 | ★3,407 | **high** — remote browser with injected sessions. |
| 76 | `mcp-grafana` | Grafana MCP | Query dashboards, datasources and alerts. | devops-cloud | grafana/mcp-grafana | Apache-2.0 | ★3,399 | **medium** — observability read, some write. |
| 77 | `supabase-mcp` | Supabase MCP | Connect Supabase projects to agents. | data-databases | supabase/mcp | Apache-2.0 | ★2,880 | **high** — service-role keys bypass RLS. |
| 78 | `tavily-mcp` | Tavily MCP | Real-time search, extract, map and crawl. | search-research | tavily-ai/tavily-mcp | MIT | ★2,361 | **medium** — untrusted content ingestion. |
| 79 | `stripe-ai` | Stripe Agent Toolkit | Stripe's toolkit for AI products (repo `stripe/ai`). | finance-payments | stripe/ai | MIT | ★1,774 | **high** — moves money; must be human-gated. |
| 80 | `mcp-server-qdrant` | Qdrant MCP | Official Qdrant vector-store server. | data-databases | qdrant/mcp-server-qdrant | Apache-2.0 | ★1,517 | **medium** — vector store read/write. |
| 81 | `terraform-mcp-server` | Terraform MCP | HashiCorp's Terraform integration. | devops-cloud | hashicorp/terraform-mcp-server | MPL-2.0 | ★1,513 | **high** — infrastructure apply/destroy. |
| 82 | `mongodb-mcp-server` | MongoDB MCP | Connect to MongoDB and Atlas clusters. | data-databases | mongodb-js/mongodb-mcp-server | Apache-2.0 | ★1,113 | **high** — direct DB access. |
| 83 | `sentry-mcp` | Sentry MCP | Query Sentry issues and events. | devops-cloud | getsentry/sentry-mcp | NOASSERTION | ★833 | **medium** — error payloads often contain PII/secrets. |
| 84 | `mcp-server-elasticsearch` | Elasticsearch MCP | Query Elasticsearch indices. | data-databases | elastic/mcp-server-elasticsearch | Apache-2.0 | ★709 | **medium** — index-wide read. |
| 85 | `mcp-server-neon` | Neon MCP | Neon Postgres management API and DB access. | data-databases | neondatabase/mcp-server-neon | MIT | ★624 | **high** — can create/drop databases. |
| 86 | `mcp-redis` | Redis MCP | Official Redis natural-language interface. | data-databases | redis/mcp-redis | MIT | ★607 | **high** — cache/session store often holds tokens. |
| 87 | `chroma-mcp` | Chroma MCP | Chroma vector database server. | data-databases | chroma-core/chroma-mcp | Apache-2.0 | ★587 | **medium** — but last push **2025-09-17**: unmaintained, penalize. |

### A6 · Portable cross-harness skill packs

These ship Agent Skills folders (not MCP), so they run on all four unless noted.

| # | slug | Display name | One-line summary | Category | Source | License | Stars | Risk |
|---|---|---|---|---|---|---|---|---|
| 88 | `open-design` | Open Design | 31 composable design skills over 129 design systems; web/mobile/decks/docs. | design-creative | nexu-io/open-design | Apache-2.0 | **★92,512** | **medium** — BYOK proxy plus sandboxed previews; large generated-code surface. |
| 89 | `anthropic-cybersecurity-skills` | Cybersecurity Skills | 753+ structured security skills mapped to MITRE ATT&CK. | security-secrets | mukul975/Anthropic-Cybersecurity-Skills | Apache-2.0 | **★31,568** | **medium** — offensive tooling guidance; dual-use by construction. Name implies Anthropic authorship — it is **not** an Anthropic repo. |
| 90 | `drawio-skill` | Draw.io Skill | Natural-language draw.io diagrams exported to PNG/SVG/PDF. | design-creative | Agents365-ai/drawio-skill | MIT | ★8,256 | **low** — local diagram generation. |
| 91 | `hermes-agent-self-evolution` | Hermes Self-Evolution | DSPy + GEPA evolutionary optimization of the agent's own prompts. | agent-meta | NousResearch/hermes-agent-self-evolution | NONE | ★5,190 | **high** — the agent rewriting its own instructions; no license declared. |
| 92 | `wondelai-skills` | Wondel Skills | Broad cross-platform skill library for agentskills.io hosts. | agent-meta | wondelai/skills | MIT | ★2,051 | **medium** — heterogeneous bundle; per-skill review required. |
| 93 | `youtube-skills` | YouTube Skills | 12 sub-skills for YouTube search, playlists and reliable transcripts. | media | ZeroPointRepo/youtube-skills | MIT | ★580 | **medium** — routes through a third-party transcript backend. |
| 94 | `pydantic-ai-skills` | Pydantic AI Skills | Type-safe schema validation for skill inputs/outputs. | coding-dev-tools | DougTrajano/pydantic-ai-skills | MIT | ★363 | **low** — validation layer. |
| 95 | `oh-my-hermes` | oh-my-hermes | Multi-agent orchestration: deep-research, ralplan, ralph, triage, autopilot. | agent-meta | witt3rd/oh-my-hermes | MIT | ★296 | **medium** — autopilot loops reduce human checkpoints. |
| 96 | `litprog-skill` | LitProg | Literate programming across Claude Code, OpenCode and Hermes. | coding-dev-tools | tlehman/litprog-skill | **NONE** | ★254 | **medium** — no license = not redistributable; last push 2026-04-10. |
| 97 | `chainlink-agent-skills` | Chainlink Agent Skills | Official Chainlink oracle/CCIP/contract skills. | finance-payments | smartcontractkit/chainlink-agent-skills | MIT | ★125 | **high** — on-chain interaction; irreversible transactions. |
| 98 | `black-forest-labs-skills` | FLUX Skills | First-party FLUX image-generation skills. | media | black-forest-labs/skills | MIT | ★107 | **medium** — paid API key, content-generation policy exposure. |
| 99 | `authsome` | Authsome | Local OAuth2/API credential broker; 45 providers, encrypted vault, proxy injection. | security-secrets | agentrhq/authsome | MIT | ★84 | **high** — by design it holds every credential the agent uses; a single compromise is total. |
| 100 | `longbridge-skills` | Longbridge Skills | Live US/HK/A-share/SG market data, fundamentals, positions. | finance-payments | longbridge/skills | MIT | ★51 | **high** — brokerage account linkage. |

---

## B. Category taxonomy — 16 categories

Derived by reconciling three real taxonomies: ClawHub's `topics` field (live API), the
VoltAgent awesome-list's 31 sections, and the MCP registry's server descriptions. The
awesome-list's own categories are visibly unreliable (its "Git & GitHub" section contains
`amazon-product-api-skill` and `blinko`, an on-chain Plinko game), so this is a
re-derivation, not a copy.

| # | slug | Display name (en) | Scope | Approx. ecosystem volume |
|---|---|---|---|---|
| 1 | `search-research` | Search & Research | Web search, RSS, news, scraping, arXiv, competitive research. | ClawHub 342+ |
| 2 | `browser-automation` | Browser & Automation | Headless/driven browsers, desktop control, form filling, scraping via UI. | ClawHub 323 |
| 3 | `coding-dev-tools` | Coding & Dev Tools | Code review, refactor, test, scaffolding, docs lookup, CLI utilities. | ClawHub 1,184 + 180 |
| 4 | `version-control` | Git & Version Control | git, GitHub/GitLab/Bitbucket, PRs, CI runs, releases. | ClawHub 167 |
| 5 | `devops-cloud` | DevOps & Cloud | IaC, Kubernetes, AWS/GCP/Azure/Cloudflare, observability, incidents. | ClawHub 393 |
| 6 | `data-databases` | Data & Databases | SQL/NoSQL/vector stores, warehouses, analytics, ETL. | ClawHub 28 + most MCP servers |
| 7 | `documents-files` | Documents & Files | PDF, DOCX, XLSX, PPTX, Markdown conversion, OCR. | ClawHub 105 |
| 8 | `communication` | Communication | Slack, Discord, Telegram, WhatsApp, email, SMS, voice. | ClawHub 146 |
| 9 | `productivity` | Productivity & Tasks | Calendar, todo, Notion, Trello, Jira, Linear, scheduling. | ClawHub 207 + 66 |
| 10 | `crm-sales-marketing` | Sales & Marketing | CRM, outreach, SEO, campaigns, analytics, social publishing. | ClawHub 107 |
| 11 | `media` | Media & Generation | Image/video/audio generation, transcription, TTS, editing, streaming. | ClawHub 170 + 86 + 46 |
| 12 | `knowledge-memory` | Knowledge & Memory | Agent memory, knowledge graphs, PKM, Obsidian, note vaults, RAG. | ClawHub 69 |
| 13 | `agent-meta` | Agent Meta | Skill authoring, self-improvement, orchestration, handoff, evals. | large and growing |
| 14 | `security-secrets` | Security & Secrets | Skill vetting, scanning, credential brokers, password managers, auditing. | ClawHub 54 |
| 15 | `finance-payments` | Finance & Payments | Payments, invoicing, market data, accounting, crypto. | ClawHub 886 (largely filtered as spam) |
| 16 | `design-creative` | Design & Creative | Design systems, diagrams, branding, typography, writing style. | ClawHub 170 |

Two UI notes that fall out of the data:
- **`agent-meta` and `security-secrets` must be first-class filters**, not buried. Four of the
  ten most-downloaded ClawHub skills are agent-meta, and two of the top six are skill scanners.
  Users are visibly shopping for self-improvement and safety tooling.
- Add an orthogonal **`harness`** facet and a **`risk_level`** facet. Category alone does not
  answer "can my Codex agent run this, and should it?"

---

## C. Machine-readable sync sources

Everything here was called live on 2026-08-29 and the HTTP status recorded.

### C1 · ClawHub (primary source for OpenClaw-family skills)

Base `https://clawhub.ai`, all v1 under `/api/v1`. OpenAPI at `/api/v1/openapi.json` (**200**).

| Endpoint | Verified | Use |
|---|---|---|
| `GET /api/v1/skills?limit=&sort=&cursor=&nonSuspiciousOnly=true` | **200** | Bulk crawl. `sort` ∈ `updated`(default), `recommended`, `createdAt`, `downloads`, `stars`, `name`, `trending`. `limit` 1–200. |
| `GET /api/v1/search?q=&limit=&mode=exact&nonSuspiciousOnly=true` | **200** | Slug→owner resolution; `mode=exact` bypasses vector recall. **This is the only listing endpoint that returns `ownerHandle`.** |
| `GET /api/v1/skills/{slug}?ownerHandle=` | **200** (400/`AMBIGUOUS_SKILL_SLUG` without owner) | Detail. |
| `GET /api/v1/skills/{slug}/versions` | assumed 200 (**UNVERIFIED**) | Version pinning. |
| `GET /api/v1/skills/{slug}/verify?ownerHandle=&tag=latest` | **200** | **The safety jackpot.** Returns `ok`, `decision`, `security.status`, `verdict`, `confidence`, per-file `sha256`, `provenance`, and `signals.{staticScan,virusTotal,skillSpector}`. Public, no auth. |
| `POST /api/v1/skills/-/security-verdicts` | **200** | Batch verdicts, 1–100 `{ownerHandle?, slug, version}` items. Requires an **exact** version — `"latest"` returns `version.not_found`. |
| `GET /api/v1/skills/{slug}/scan` | 200 with owner | Detailed scanner data. |
| `GET /api/v1/skills/{slug}/file?preview=1` | assumed 200 (**UNVERIFIED**) | Fetch `SKILL.md` bytes — needed to recover the **license**, which no listing endpoint exposes. |
| `GET /api/v1/skills/export` | **401** | Bulk export is **authenticated**; do not plan on it. |

**Rate limits (documented and explicit):** read 3,000/min per IP, 12,000/min per key; write
300/min per IP, 3,000/min per key; download 1,200/min per IP, 6,000/min per key. Honour
`Retry-After`, else `RateLimit-Reset` (seconds) or `X-RateLimit-Reset` (absolute epoch).
Auth is optional for reads. ClawHub explicitly permits third-party directory reuse provided we
cache, honour 429, and link back to `https://clawhub.ai/<owner>/skills/<slug>` without implying
endorsement — **our UI must render that attribution link.**

### C2 · Official MCP registry

`GET https://registry.modelcontextprotocol.io/v0/servers?limit=&cursor=` — **200**, no auth.
Cursor pagination via `metadata.nextCursor`. Returns `server.{name,description,title,version,remotes}`
and `_meta["io.modelcontextprotocol.registry/official"].{status,publishedAt,updatedAt,isLatest}`.
Filter on `status == "active"` and `isLatest == true` — the raw feed returns every historical
version (the first three rows returned were three versions of one server).
Published rate limits: **UNVERIFIED**; treat conservatively.

### C3 · GitHub (discovery + all popularity/maintenance signals)

`https://api.github.com`. Anonymous 60 req/h; **authenticated 5,000 req/h**; Search API is a
separate, much tighter bucket (30 req/min authenticated). Needs a PAT with no scopes for public
data. Live topic counts as of 2026-08-29:

| Query | Result count | Notes |
|---|---|---|
| `search/repositories?q=topic:agent-skills` | **18,391** | Primary discovery topic. |
| `search/repositories?q=topic:agent-skills+stars:>50` | **956** | The tractable seed set. |
| `search/repositories?q=topic:mcp-server` | **26,088** | |
| `search/repositories?q=topic:claude-skills` | **7,591** | |
| `search/repositories?q=topic:hermes-agent` | **3,079** | |
| `search/repositories?q=topic:openclaw-skills` | **702** | |
| `search/repositories?q=topic:modelcontextprotocol` | **675** | |
| `search/code?q=filename:SKILL.md` | 317,952 | Useless as a crawl seed — unbounded, and code search needs auth. |

Per-repo enrichment (1 call each): `GET /repos/{owner}/{repo}` yields `stargazers_count`,
`license.spdx_id`, `pushed_at`, `archived`, `description`. `pushed_at` is our maintenance-recency
input. Note `license.spdx_id` returns `NOASSERTION` for non-standard licenses and `NONE` for
none at all — **`NONE` must be treated as "not redistributable", not "unknown"**.

### C4 · Curated lists (low-trust, human-review queue only)

| Source | Verified | Note |
|---|---|---|
| `VoltAgent/awesome-openclaw-skills` | ★52,229, MIT, 2026-08-23 | 5,300+ entries sourced from ClawHub. Self-reports filtering 7,215 entries: 4,065 spam, 1,040 duplicate, 851 low-quality, 886 crypto, **373 malicious**. Categories are unreliable. Markdown only — no API. |
| `0xNyk/awesome-hermes-agent` | ★5,491, 2026-08-28 | Hermes ecosystem; carries useful `production`/`beta`/`experimental` maturity tags. Explicitly **not** an official Nous Research project. |
| `punkpeye/awesome-mcp-servers` | ★93,023, MIT, 2026-08-29 | Largest MCP list. |
| `LeoYeAI/openclaw-master-skills` | ★2,129, MIT, **2026-07-20** | 1,209 skills, but stale by ~6 weeks. |

Parse these for *candidates only*; never import a risk verdict or a star count from them
(§F documents three that were wrong).

### C5 · Recommended sync cadence

- **Hourly**: nothing. Nothing here moves that fast.
- **Daily**: ClawHub `sort=createdAt` and `sort=updated` deltas; MCP registry `isLatest` sweep.
- **Daily, mandatory**: re-run `POST /api/v1/skills/-/security-verdicts` over every
  **pinned version currently referenced by `agent_skills`**. This is the AST07 control — a
  version that was clean when installed can be reclassified later.
- **Weekly**: GitHub enrichment for stars/`pushed_at`/license on catalogued repos.
- **Manual**: awesome-list ingestion into a review queue.

---

## D. Safety

### D1 · This is not hypothetical

The agent-skill supply chain was actively exploited through early 2026. Verified from multiple
independent security vendors:

- **ClawHavoc** — discovered 2026-02-01 by Koi Security. A coordinated poisoning campaign
  against ClawHub. Reported scale differs by researcher: **335** malicious skills traced to a
  single actor, **1,184** skills poisoned in the wider campaign, **341** exposed in one
  disclosure. Attackers registered as legitimate publishers and mass-uploaded skills disguised
  as utilities — `solana-wallet-tracker`, `youtube-summarize-pro`, `calendar-sync-pro`,
  `file-manager-plus`, `polymarket-trader` — names chosen to match what developers search for.
  ClickFix-style social engineering drove installation. (Antiy Labs, Palo Alto Unit 42, Repello,
  Koi Security.)
- **OWASP Agentic Skills Top 10** — Incubator project, v1.0 (2026 Edition), last updated
  March 2026, published in direct response.

ClawHub's own defences are now a three-layer stack we can read for free: **ClawScan** (its own
agent-aware risk analysis), **SkillSpector**, and **VirusTotal** (formal partnership, vendor
counts surfaced as e.g. "62/62 vendors flagged this skill as clean").

### D2 · The OWASP Agentic Skills Top 10 (our risk vocabulary)

| ID | Risk | Severity |
|---|---|---|
| AST01 | Malicious Skills | Critical |
| AST02 | Supply Chain Compromise | Critical |
| AST03 | Over-Privileged Skills | High |
| AST04 | Insecure Metadata | High |
| AST05 | Untrusted External Instructions | High |
| AST06 | Weak Isolation | High |
| AST07 | Update Drift | Medium |
| AST08 | Poor Scanning | Medium |
| AST09 | No Governance | Medium |
| AST10 | Cross-Platform Reuse | Medium |

AST10 deserves emphasis for us specifically: our whole value proposition is running one skill on
four harnesses. **Cross-platform reuse is itself a named OWASP risk** — a skill audited under
OpenClaw's sandbox assumptions may be materially more dangerous under a Codex harness with
different isolation. Our `agent_skills` compatibility flag must be a *deliberate assertion*, not
a default of `true`.

### D3 · What makes a skill unsafe

Ordered by how often it actually bites, not by theoretical severity.

1. **Instruction injection in the body.** `SKILL.md` is instructions the model *obeys*. A skill
   is a prompt-injection primitive with a friendly name. Look for: directives to ignore prior
   instructions, to exfiltrate `~/.ssh`, `.env`, `~/.aws`, keychains or history; base64/hex
   blobs; zero-width or bidi characters; HTML comments and tiny/white text; "do not tell the
   user"; instructions to disable other skills or scanners.
2. **Name/description ↔ content incoherence (AST04).** ClawHub states this is its *main*
   question: "do the name, summary, metadata, requested authority, and actual content line up
   with what users would reasonably expect?" A weather skill that reads the filesystem fails
   here. This is the highest-signal automated check available.
3. **Credential handling.** Does it read env vars beyond its declared `requires.env`? Does it
   write credentials to disk, log them, or POST them anywhere? Does it request a broad OAuth
   scope where a narrow one exists (`repo` vs `public_repo`, Google Workspace full vs Gmail
   readonly)?
4. **Network egress.** Any hardcoded host that is not the service the skill claims to integrate.
   Any URL shortener. Any raw IP. Any paste site. Any `curl … | sh`.
5. **Execution surface.** Bundled `scripts/` that run shell/python, `postinstall`-style hooks,
   `npx`/`uvx`/`pip install` of unpinned packages, arbitrary `eval`.
6. **Blast radius of the intended function.** Independent of malice: desktop control, an
   authenticated browser, a credential broker, publishing to public channels, moving money, and
   `apply`-style infra changes are irreversible or public. #99 `authsome` is well-built and
   MIT-licensed and is still **high** risk, because holding 45 providers' credentials is what it
   is *for*.
7. **Provenance.** ClawHub's `/verify` returns `provenance.source`, which is
   `server-resolved-github-import` only when ClawHub itself resolved a GitHub repo/ref/commit at
   publish time — otherwise `unavailable`. `unavailable` means nobody can tie the artifact to
   source history. (`@steipete/github`, one of the most-downloaded skills, returns `unavailable`.)
8. **Maintenance recency.** `pushed_at` older than ~12 months on a skill that touches a live API
   means it is unmaintained against that API's current auth model. #87 `chroma-mcp` last moved
   2025-09-17.
9. **License.** `NONE` (no license) means we have no right to redistribute or materialize it.
   This is a legal risk, not a security one, but it blocks seeding just as hard.
10. **Update drift (AST07).** A pinned-clean version can be superseded by a hostile one. Any
    skill that auto-updates itself or others (#42 `auto-updater`) inherits maximum drift risk.

### D4 · Scoring rubric → `low` | `medium` | `high`

Deterministic, computable from data we can actually fetch, and it works with no LLM key —
satisfying the "must work with no LLM API key" constraint. An LLM reviewer, when available,
may only *raise* a score, never lower it.

**Step 1 — Hard gates (any hit ⇒ `high`, and `blocked = true`; short-circuit).**

- ClawHub `decision == "fail"`, or `security.status` ∈ {`malicious`}, or moderation status
  `Malicious`.
- VirusTotal: ≥1 vendor flags malicious.
- Static scan finds credential exfiltration, obfuscated payload, or injection directives.
- Publisher appears in our ClawHavoc-derived denylist.
- License is `NONE`/unresolvable **and** we intend to redistribute rather than link.

**Step 2 — Capability score (blast radius). Take the maximum tier reached.**

| Tier | Points | Triggers |
|---|---|---|
| Inert | 0 | Prose only. No `scripts/`, no `requires.env`, no network. |
| Local read | 1 | Reads local files in a scoped dir; no credentials; no egress. |
| Public read | 2 | Anonymous or read-only-key access to a public API. |
| Local write / exec | 4 | Writes local files, runs bundled scripts or local binaries. |
| Scoped service write | 6 | Authenticated write to one external service (Notion, Trello, Jira). |
| Broad credential | 8 | Full mailbox/drive, org-wide token, DB superuser, cloud control plane. |
| Irreversible / public / total | 10 | Money movement, on-chain tx, public publishing, desktop control, authenticated browser, credential broker, self-modification, auto-update. |

**Step 3 — Trust modifiers (added to the capability score).**

| Signal | Δ |
|---|---|
| Publisher is the service's own vendor (`github/`, `stripe/`, `redis/`) | −3 |
| ClawHub `decision == "pass"` **and** `security.status == "clean"` | −2 |
| `provenance.source == "server-resolved-github-import"` | −1 |
| OSI license (MIT/Apache-2.0/MPL-2.0/BSD) | −1 |
| ★ ≥ 5,000 **or** downloads ≥ 100,000 | −1 |
| ClawHub `decision == "review"` or `warn` | +3 |
| `provenance.source == "unavailable"` | +1 |
| `pushed_at` > 12 months ago | +2 |
| License `NONE`/`NOASSERTION` | +1 |
| Declared `requires.env` ⊄ env vars actually referenced (metadata incoherence, AST04) | +3 |
| Network host not matching the declared integration | +4 |
| Publisher has < 2 skills and account age < 90 days | +2 |

**Step 4 — Banding.** Total ≤ 2 ⇒ **low**. 3–6 ⇒ **medium**. ≥ 7 ⇒ **high**.

**Step 5 — Floors that no modifier can undercut.** A skill that can move money, transact
on-chain, publish publicly, control a desktop, drive an authenticated browser, broker
credentials, or modify its own instructions is **never below `high`**, regardless of publisher
reputation or star count. Popularity is not safety: `@steipete/github` at 196,851 downloads with
a `clean` ClawScan verdict still inherits the user's entire `gh` auth scope, and ClawScan's own
summary says exactly that.

**Storage.** Persist the inputs, not just the band: `skills.risk_level`, `skills.risk_score`,
`skills.risk_signals` JSONB (the individual triggers), `skills.risk_scored_at`,
`skills.scanner_verdict` JSONB (raw ClawHub `/verify` envelope), `skills.provenance`,
`skills.artifact_sha256`. Re-scoring must be reproducible and auditable, and the UI should
explain *why* something is `high` rather than just colouring it red.

**Product surface.** Default the Skill Repository browser to `risk_level ∈ {low, medium}` with
`nonSuspiciousOnly=true`, require an explicit confirmation to attach a `high` skill to an agent,
and pin `agent_skills.version` on attach. Never resolve `latest` at agent runtime.

---

## E. What this means for `lib/skills/**`

Stated as findings, not as a design (that belongs in the design doc):

1. One canonical format — Agent Skills `SKILL.md`. Materialize to `.agents/skills/<name>/`
   and all four harnesses find it. No per-harness transform is needed.
2. Adopt OpenClaw's `metadata.openclaw.requires.{bins,env,config}` + `os` shape as our
   `skills.requirements`. It already expresses harness compatibility precisely, and it round-trips
   losslessly for OpenClaw skills.
3. Identity is `(source, owner_handle, slug, version)`. Bare slugs collide six ways on ClawHub.
4. Safety data is free and machine-readable via ClawHub `/verify` and
   `/-/security-verdicts` — but only for ClawHub skills. GitHub-sourced and MCP-sourced skills
   have **no equivalent scanner**, so our rubric must degrade gracefully for them (it does: the
   capability tier and trust modifiers are computable from repo metadata + static analysis alone).
5. Licenses must be fetched per-skill from `SKILL.md`; no listing API returns them.

---

## F. Honest gaps and UNVERIFIED claims

**Verified vs unverified count for §A: 96 of 100 entries fully verified; 4 partially unverified.**
Every entry's existence, source URL and popularity figure was confirmed against a primary API.
The specific shortfalls:

1. **Licenses for all 31 ClawHub entries (#28–#58) are UNKNOWN.** Neither
   `/api/v1/skills` nor `/api/v1/search` returns a license field. Recovering them requires one
   `GET /api/v1/skills/{slug}/file` per skill to read the `SKILL.md` frontmatter. I did not run
   31 extra calls. **This blocks seeding those rows** if we intend to redistribute rather than
   deep-link.
2. **`mcporter` (#48) — owner handle unresolved.** `mode=exact` search returned an error for
   this slug. Its ClawHub canonical ref is **UNVERIFIED**; do not seed without resolving it.
3. **`beam` (#22) — harness compatibility UNVERIFIED.** I did not read its `SKILL.md` to
   determine whether it requires OpenClaw-specific binaries. Assumed OC-only, conservatively.
4. **`GET /api/v1/skills/{slug}/versions` and `/file` — documented but not called.** Marked
   UNVERIFIED in §C1. Everything else in that table returned a status code I recorded.
5. **MCP registry rate limits — no published figure found.** UNVERIFIED.
6. **Third-party lists were wrong about popularity, in both directions.** Verified corrections:
   `awesome-hermes-agent` claims Hermes Agent has "215k+ stars" (actual **237,909**),
   `open-design` "78k+" (actual **92,512**), `Anthropic-Cybersecurity-Skills` "25k+" (actual
   **31,568**), `drawio-skill` "5.8k+" (actual **8,256**). All four understate — the lists are
   simply stale, not dishonest. Still: **never import a number from a curated list.**
7. **`Anthropic-Cybersecurity-Skills` (#89) is not an Anthropic repository** despite the name.
   Owner is `mukul975`. If we surface it, the publisher must be displayed prominently — this is
   exactly the name/authority incoherence pattern ClawHavoc exploited.
8. **ClawHavoc scale figures conflict across sources** (335 / 341 / 1,184). I have reported all
   three with attribution rather than picking one. The discrepancy is likely campaign-vs-actor
   vs single-disclosure scoping, but I could not confirm that.
9. **`stripe/agent-toolkit` redirects to `stripe/ai`.** The row records the resolved repo. Any
   seed data referencing the old path will 301.
10. **Star counts are a 2026-08-29 snapshot** and drift daily. They belong in a synced column
    with a `fetched_at`, never hardcoded in a seed file.
11. **I did not verify runtime behaviour of any skill.** Nothing here was installed or executed.
    All risk levels are assessments from metadata, descriptions and published scanner verdicts —
    they are a triage prior, not an audit.

### Sources

- [anthropics/skills](https://github.com/anthropics/skills) · [Agent Skills spec](https://github.com/anthropics/skills/blob/main/agent_skills_spec.md)
- [agentskills.io](https://agentskills.io) · [agentskills/agentskills](https://github.com/agentskills/agentskills)
- [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) · [MCP registry](https://registry.modelcontextprotocol.io/v0/servers)
- [openclaw/openclaw](https://github.com/openclaw/openclaw) · [OpenClaw skills docs](https://docs.openclaw.ai/tools/skills) · [openclaw/clawhub](https://github.com/openclaw/clawhub) · [ClawHub](https://clawhub.ai)
- [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) · [Hermes skills docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
- [openai/codex](https://github.com/openai/codex) · [Codex skills docs](https://learn.chatgpt.com/docs/build-skills)
- [lessweb/deepcode-cli](https://github.com/lessweb/deepcode-cli) · [Deep Code skills docs](https://deepcode.vegamo.cn/en/docs/configuration/agent-skills)
- [OWASP Agentic Skills Top 10](https://owasp.org/www-project-agentic-skills-top-10/)
- [ClawHub security audits](https://github.com/openclaw/clawhub/blob/main/docs/security-audits.md) · [ClawHub HTTP API](https://github.com/openclaw/clawhub/blob/main/docs/http-api.md)
- ClawHavoc analyses: [Antiy Labs](https://www.antiy.net/p/clawhavoc-analysis-of-large-scale-poisoning-campaign-targeting-the-openclaw-skill-market-for-ai-agents/) · [Palo Alto Unit 42](https://unit42.paloaltonetworks.com/openclaw-ai-supply-chain-risk/) · [Repello AI](https://repello.ai/blog/clawhavoc-supply-chain-attack)
- [VoltAgent/awesome-openclaw-skills](https://github.com/VoltAgent/awesome-openclaw-skills) · [0xNyk/awesome-hermes-agent](https://github.com/0xNyk/awesome-hermes-agent) · [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)
