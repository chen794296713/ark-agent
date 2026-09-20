# Five professional agent packages

Status: **package authoring, customization and installation control plane implemented; connected execution requires the external runtime service.** Product owner: Ark. Specification date: 21 September 2026. This document defines the complete product and distinguishes delivered code from launch gates. Detailed role procedures live in `lib/agent-packages/`, with research in `docs/research/`.

## Product promise

Hire a role with professional procedures already included. The user supplies business facts, goals, account permissions and decision authority; the user does not need to teach the agent how recruiting, applications, video production, sales or inbox management work. Each package includes an orchestrator, specialist responsibilities, procedural skills, output contracts, quality checks and recovery rules.

“Experienced professional” is a quality target evaluated on realistic work, not a claim that a model has twenty years of employment history or infallible judgment. “Out of the box” means ready to perform supported workflows after the required accounts and runtime are connected. A script, simulated acknowledgment or provider name is not evidence that an integration works. Availability is always derived from installed skill hashes, actual adapter capabilities and current grants.

The core experience is: choose a role → inspect included capabilities → customize → save a versioned package → connect accounts → validate → deploy → see real work and review requested actions. The existing Team Directory typography, portrait treatment, neutral surfaces, compact controls and forest/leaf action colors remain the visual language. Use role names, concrete deliverables and understandable readiness states rather than technical marketing claims.

## Shared operating model

Every job begins with scope, accepted sources, budget, output and deadline. The orchestrator selects the smallest useful specialist team, supplies only authorized context and merges evidence after review. Default maximums are three concurrent workers, one delegation level and twenty tool calls per worker; the runtime enforces these limits. Long tasks checkpoint explicit workflow states and resume from persisted provider receipts. They do not depend on keeping one model conversation alive forever.

Skills contain procedures, inputs described by their instructions, expected outputs, logical tool requirements and acceptance checks. Tools are executable adapters with credential and policy enforcement. Workflows coordinate skills and tools. A subagent is an isolated worker with a specific assignment, budget and tool allowlist. Installing one does not imply installing the others.

The package ships first-party instructions derived from primary-source research. No unreviewed marketplace bundle, floating remote code or unknown-license executable is automatically installed. Future imported skills require a pinned source revision, reviewed license, checksum, dependency manifest, isolated evaluation and upgrade policy. Names alone are not capabilities.

Customization is an overlay: name, organization, goals, tone, additional instructions and harness. It cannot replace the package policy. Credentials are connection references maintained by the manager and never belong in prompts, exports or source control. The UI must warn against pasting secrets into configuration. Later overlay versions add allowed domains, language, cadence, budget and workflow selections through validated fields.

## Recruiting Agent

**Purpose:** manage the operational recruiting cycle with clear job-related evidence and humane candidate communication. The employer owns final hiring, rejection, offer and reassignment decisions. The agent can recommend hire, no hire or consideration for another role, with confidence, evidence and missing information.

**Included expertise:** hiring-manager intake; success profiles; effective job descriptions; sourcing strategy; permitted candidate research; evidence extraction from resumes; structured job matching; respectful outreach; scheduling; consented AI interview preparation and facilitation; evidence-based interview evaluation; calibrated decision memos; candidate communication; pipeline reporting and process improvement. The implementation includes fourteen dedicated skills plus four shared operating skills; the deeper research backlog describes twenty-one recruiting capabilities.

**Specialists:** intake partner, job-description writer, sourcer, resume analyst, interview designer, evidence reviewer and recruiting coordinator. Each operates on a limited requisition and candidate context. Resume and interview evidence is not used to infer protected or sensitive attributes. Photo, voice accent, facial expression, perceived emotion or personality are not hiring scores. Accommodation requests go to a human without becoming negative evaluation evidence.

**Primary workflow:** intake → approve criteria → publish or prepare JD → source → validate candidate identity and contact basis → evaluate documented requirements → review shortlist → contact → obtain interview consent → interview or accessible alternative → score evidence against the approved rubric → employer decision → approved communication → record outcome and retention date.

**Artifacts:** versioned JD, criterion-to-evidence matrix, candidate shortlist, contact draft, interview guide, consent receipt, transcript with provenance, scorecard, decision memo and ATS update receipt. Every recommendation states observed strengths, gaps, uncertainty and a proposed next step. Moving a candidate to a different role requires relevant fit evidence and applicable candidate/employer authorization; it must not silently submit them elsewhere.

**Connections:** ATS, permitted search sources, work email, work calendar, interview hosting/transcription and selected document storage. An AI interview service must support identity disclosure, recording consent, accessibility alternatives, deletion and a human escalation route. ATS schemas and rate limits are provider-specific. Candidate-data retention is configured by the employer and enforced by storage jobs, not merely mentioned in a prompt.

**Launch evaluation:** JD against an approved rubric; missing resume facts; conflicting interview evidence; withdrawal and deletion; biased source data; prompt injection in a resume; accommodation; refusal of recording; duplicate candidates; no-hire recommendation sent without employer approval. No production hiring claim until reviewed by qualified recruiting users on a representative evaluation set.

## Job Applicant Agent

**Purpose:** help the job seeker present their real achievements clearly, identify strong opportunities and submit authorized applications where a supported provider permits it. “Elite” means aligned with the person's priorities and evidence of opportunity quality, not a universal prestige ranking.

**Included expertise:** career intake; transferable skills and career paths; achievement evidence bank; resume editing and export review; tailored cover letters and portfolio selection; current vacancy discovery; fit and employer diligence; reusable factual answer bank; application review; provider-specific submission; response tracking; interview coaching; offer comparison; search strategy review. Fourteen dedicated skills plus four shared skills are included.

**Specialists:** career strategist, resume/portfolio editor, opportunity researcher, fit analyst, application coordinator and interview coach. The applicant context is isolated from recruiter packages, including when the same platform hosts both sides. Employer access to a resume does not authorize access to the applicant's search strategy, private conversations or other applications.

**Workflow:** confirm career facts and preferences → improve base materials → search authorized sources → verify posting freshness and employer identity → explain match and tradeoffs → tailor from verified facts → complete all required questions → show exact payload → verify approval/standing grant → submit through a supported adapter or prepare a hosted-form handoff → retain provider receipt → track responses.

Never invent a degree, employer, title, metric, reference or work-authorization answer. Do not answer an assessment as if the user personally completed it. Unknown attestations, fees, signatures and binding commitments return to the user. A timed-out submission becomes “confirmation pending,” not “failed, retry immediately.” Duplicate keys bind applicant, employer, requisition and material revision.

**Integration reality:** Greenhouse and Lever expose employer-scoped public listings, while API submission requires the relevant authorized credentials. Public availability does not confer universal applicant auto-apply access. Each site/provider gets an explicit support level: discovery; prepared handoff; or verified submission. CAPTCHA and access controls are not bypassed. The UI names the actual support level before approval.

**Launch evaluation:** truthful rewrite fidelity; changed/closed posting; wrong-recipient attachment; missing eligibility answer; deceptive job; unauthorized fee; duplicate application; ambiguous receipt; cross-role privacy; resume export re-extraction; revoked consent and daily cap.

## Video Creator Agent

**Purpose:** produce an actual playable video from an idea using available generation and editing services, preserving an editable source and rights trail. Eleven dedicated skills plus four shared skills cover creative direction, script, storyboard, asset rights, shot generation, voice, music, timeline editing, captions, quality control and delivery.

**Specialists:** producer, scriptwriter, visual director, sound editor, editor and independent quality reviewer. Publishing stays with the orchestrator behind an approved artifact/destination grant. Visual creation does not silently imply the right to use a person's likeness, voice or licensed music.

**Workflow:** establish audience, platform, duration and budget → approve concept/script/storyboard → license or generate assets → inspect clips → synthesize authorized narration → mix sound → construct deterministic timeline → render → align captions to final audio → inspect output → review → publish if authorized.

The edit-decision list uses stable shot IDs, source hashes, time ranges, dimensions, frame rates, transitions and audio stems. Rendering probes sources before stitching. Generation jobs persist provider IDs and budget reservations; retries reconcile existing jobs. Store preview, master, platform variants, SRT/VTT, narration/music/effects stems, timeline and rights register. QC checks every edit boundary, beginning/middle/end, codec, duration, black/frozen frames, audio sync, clipping, captions, safe margins and factual claims. A URL without a playable verified artifact is not completion.

**Provider plan:** a pinned FFmpeg worker for probing, stitching, captions and mixing; optionally a licensed Remotion worker for programmatic graphics; interchangeable image/video generation, transcription and speech adapters; tenant-isolated object storage; optional publishing APIs. Provider availability, accepted formats and limits are discovered/verified before dispatch. Remotion has its own license terms; FFmpeg obligations depend on build configuration. No provider model is hard-coded as perpetually available.

**Launch evaluation:** unknown music rights; unavailable generation service; reused paid job after timeout; continuity defects; truncated render; caption drift after revisions; voice disclosure; incomplete source asset; rights expiry; budget overrun; wrong publishing destination.

## Sales Outreach Agent

**Purpose:** build a relevant pipeline, contact permitted prospects with truthful messages, qualify replies and give the salesperson an accurate handoff. Eleven dedicated skills plus four shared skills cover ICP, account research, lead validation/scoring, copy, sequences, delivery, replies, qualification, meetings and reporting.

**Specialists:** account researcher, lead validator, outreach writer, conversation specialist and sales coordinator. Copywriters cannot send; researchers cannot export arbitrary contact lists. The broker checks active campaign authorization and suppression immediately before dispatch, including actions proposed by the orchestrator.

**Workflow:** confirm offer and evidence → define ICP and exclusions → research permitted sources → verify identity/contactability → deduplicate and suppress → score fit → draft bounded sequence → approve recipients/content/cadence/expiry → send once → reconcile → stop on reply or opt-out → qualify → schedule accepted meeting → CRM handoff.

No invented familiarity, testimonials, customer logos, ROI, budget or authority. An invalid/catch-all address is not a verified lead. A campaign grant defines sender, recipient set, templates, allowed facts, daily volume, total cost, maximum touches and expiration. Opt-out invalidates queued sends. Commercial commitments, discounts, contracts and sensitive complaints go to the owner. Legal contact basis and geography-specific rules are configured and reviewed by the operator; this spec does not assert one universal outreach rule.

**Artifacts:** ICP, cited account profile, verified contact record, fit scorecard, reviewed sequence, send receipt, reply classification, qualification brief, meeting receipt and performance report with denominators. Avoid optimizing for open rates at the expense of relevance, consent or truthful claims.

## Email Assistant Agent

**Purpose:** handle authorized work correspondence while keeping personal information out of every work action. Twelve dedicated skills plus four shared skills cover scope separation, triage, thread understanding, drafting, disclosure review, sending, follow-ups, scheduling, attachments, work invoices, briefing and reversible maintenance.

**Specialists:** privacy reviewer, inbox coordinator, correspondence writer, work coordinator, document clerk and briefing editor. No worker receives raw personal bodies to decide whether to disclose them. A deterministic boundary first limits the mailbox and resources; upstream classification and DLP quarantine mixed/unknown content before model context. An LLM instruction alone cannot guarantee privacy.

A dedicated work mailbox is the default launch requirement. Mixed personal/work accounts remain unavailable until an audited upstream boundary can exclude personal messages, quoted history, attachments, calendar details and notification previews. The owner's personal relationships, intimate content, secrets and unrelated private facts are never summarized, shared or forwarded by this work package. The owner sees a generic private “review needed” marker for quarantined items.

**Workflow:** receive a verified mailbox event → scope and scan before context → classify action/urgency → summarize with references → draft from work knowledge → inspect recipients/content/attachments → owner approval or bounded work delegation → send once → record receipt → track the agreed next step. Urgency comes from evidence and deadlines, not merely alarming language.

Work invoices and receipts can be organized; payments and bank-detail changes remain owner actions. Personal shopping, lifestyle and payments are a separate future opt-in product boundary, not a hidden expansion of work-email consent. Permanent deletion, forwarding rules and account-security changes are excluded. Archive/label actions are reversible with undo references.

**Launch evaluation:** personal content quoted in work mail; token in attachment; changed recipient after approval; look-alike sender; malicious attachment; prompt injection; private calendar title; reply-all exposure; spoofed urgent payment; sensitive notification preview; retention/deletion; revoked mailbox grant.

## Architecture and data contracts

The repository owns package definitions, deterministic compilation, saved customization, tenant authorization and deployment state. A manager service owns runtime processes, provider OAuth, tool adapters, durable jobs, secret storage, policy enforcement and runtime lifecycle. Current legacy instance provisioning does not accept package manifests; it is deliberately not reused as if it did.

`CompiledAgentPackage` contains schema/version/role/harness/name, policy digest, skill digests, required connection IDs and sorted relative files with SHA-256 hashes. Artifacts include skill documents, root instructions, user overlay, worker definitions, workflows, evaluation scenarios and runtime requirements. Codex receives native custom-agent TOML definitions. OpenClaw receives workspace skill files and worker definitions to be mapped by the manager. Hermes receives a profile-scoped skill tree and broker requirements; its inherited toolsets require external worker enforcement.

Configuration is transactional and idempotent per workspace/key. It creates an unbilled draft and immutable package snapshot. Export returns the saved bundle. Deployment uses a separate explicitly configured HTTPS manager endpoint; request/response bind deployment ID, tenant, agent, harness and every digest. Missing manager, incomplete skills, missing required connections or a mismatched acknowledgment cannot become ready. This is installation readiness; package chat/execution, approvals and lifecycle must be supplied by the runtime before live work is enabled.

The first policy gate is implemented as a pure function for conformance testing. A real broker must derive classification, grants, worker identity, approval validity and idempotency state from trusted services—not accept these booleans from model arguments. It must also inspect actual text, attachments, destinations and tool semantics. Network egress, filesystem scope, secret references and sandbox permissions enforce the same policy outside prompts.

Required next data contracts: connector grants with tenant/provider/scopes/resources/expiry/revocation; work items with source/classification/retention; workflow runs and checkpoints; action proposals with payload digest and recipients; owner approvals with expiry; provider receipts; suppression records; artifacts with rights and hashes; evaluation runs with model/runtime versions and reviewer outcomes.

## Quality, operations and launch gates

Unit tests verify deterministic compilation across all fifteen role/harness combinations, overlay policy preservation, integrity checking, export isolation and policy decisions. Transport tests verify manager authentication behavior, binding, exact skill sets, required connections and safe errors. Disposable database tests verify replay, tenant isolation, concurrent deployment and absence of billing side effects. Browser checks verify actual customization and draft readiness at desktop and mobile sizes. These are engineering checks, not proof of professional task quality.

Each runtime/harness must additionally pass live conformance tests: tool denial, worker isolation, revoked credentials, prompt injection, cross-tenant access, approval tampering, uncertain external effects, manager restart, cancellation and deletion. Each role requires a curated anonymized evaluation dataset, qualified human scoring and regression thresholds. Privacy leakage, unauthorized external action and fabricated submission/send/render receipts have zero tolerated incidents in the release set. Publish success rates and failure classes internally with exact versions; no unmeasured “expert” score.

Monitor job latency, cost, success, retry/reconciliation, connection expiry, approval age, disclosure denials and cancellation completion without logging private bodies or credentials. Add global and tenant kill switches. Package upgrades create a new revision, show changed skills/permissions, rerun evaluations and allow rollback to the last verified bundle. New capabilities never silently broaden grants.

## Delivery sequence

1. **Delivered foundation:** source-backed role research; all five authored packages; specialist definitions; shared policy; fifteen deterministic exports; saved customization; idempotent draft API; installation acknowledgment protocol; readiness UI; tests and documentation.
2. **Runtime integration:** implement this protocol in the actual OpenClaw/Hermes manager repository; add Codex runtime provisioning; bind worker identities to the broker; install and attest files; implement stop/delete/status/reconciliation and execution bridge. External repository/service details are required.
3. **Connections and actions:** tenant OAuth, work-scope picker, secret vault, provider adapters, durable action ledger, approval UI, DLP and revocation. Prioritize work-email drafts and applicant document preparation, then controlled outreach/submission; video rendering runs in a separate media worker.
4. **Professional evaluation:** seed representative tasks; run offline and connected conformance suites; have recruiters, job seekers, editors, sales users and assistants assess outputs; improve weak procedures from evidence.
5. **Pilot and release:** limited tenants and volumes, explicit ownership of consequential decisions, documented supported providers, operational dashboards and incident playbooks. Enable paid execution only after metering and lifecycle recovery pass.

The remaining work is real engineering and integration, not user training. The foundation intentionally makes gaps visible so that connecting a runtime cannot silently downgrade a professional package into a generic prompt.
