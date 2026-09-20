# Agent package delivery tasks

Owner groups: App = this repository; Runtime = external manager/harness service; Integrations = connector workers; Product QA = domain reviewers. Status reflects implemented code, not intended capability.

## A. Package foundation — App

- [x] Research talent, media, sales, email and harness capabilities using primary sources.
- [x] Define five versioned role manifests, procedural skills, specialists, connectors and workflows.
- [x] Author role-specific acceptance scenarios and common evidence/tool-use/review skills.
- [x] Validate customization separately from immutable policy.
- [x] Compile all five roles for OpenClaw, Hermes and Codex with file and bundle hashes.
- [x] Export real skill documents and worker configurations into a new isolated directory.
- [x] Test deterministic output, tamper rejection and existing-directory protection.

Acceptance: fifteen reproducible artifacts, no remote executable dependency or credential in bundles, no invalid specialist references.

## B. Hiring and installation — App

- [x] Persist tenant-scoped package snapshots and overlays transactionally.
- [x] Make configure requests idempotent and reject key reuse with different payloads.
- [x] Save configured drafts without billing or provisioning side effects.
- [x] Expose authenticated package inspection/download.
- [x] Add opt-in deployment transport with bound acknowledgment and safe errors.
- [x] Require exact skill hashes and required connection acknowledgments.
- [x] Prevent legacy execution/configuration paths bypassing package policy.
- [x] Add package hiring and readiness UI in the current Team Directory style.
- [x] Validate migration, tenant isolation, retry/concurrency and no-billing behavior in a disposable database.

Acceptance: saved draft and verified install are distinct; no unconfigured manager call, simulated success or charge. Install acknowledgment alone leaves execution paused.

## C. Runtime service — Runtime (external repository required)

- [ ] Implement `ark-package-runtime/v1` in the actual manager service.
- [ ] Verify/stage bundles and launch isolated OpenClaw, Hermes and Codex workers.
- [ ] Enforce named worker identity, tool allowlists, delegation budgets and network/filesystem scope outside the model.
- [ ] Implement durable jobs, checkpoints, cancellation, heartbeat, stop/delete and uncertain-outcome reconciliation.
- [ ] Supply package execution/chat bridge and authenticated events.
- [ ] Implement broker approvals, payload hashes, idempotency ledger, revocation and redacted audit.
- [ ] Add package revision/upgrade/rollback protocol; reapprove expanded grants.

Acceptance: restart/cancel/retry tests pass with real runtimes; no orphan instance; tenant and worker isolation demonstrated; lifecycle is visible in the app. Blocker: service/repository location not supplied yet.

## D. Connections and role tools — Integrations

- [ ] Tenant OAuth and encrypted credential references; connect/revoke UI with selected resources.
- [ ] Work-mail read/draft/send/labels with suppression, bounded delegation and provider receipts.
- [ ] Dedicated-work-mail boundary, attachment scanning, pre-context quarantine and egress DLP.
- [ ] ATS discovery/update, job criteria and candidate evidence mapping.
- [ ] Consented interview hosting/transcription and accessible alternatives.
- [ ] Current job discovery and supported provider-specific application submission; explicit hosted-form handoff elsewhere.
- [ ] Resume/document export with extraction and visual fidelity checks.
- [ ] CRM contacts/accounts/stages, licensed contact validation and calendar coordination.
- [ ] Pinned media worker: FFmpeg probing/editing/render/mix/captions; optional licensed Remotion.
- [ ] Authorized generation/transcription/voice adapters, asset rights and storage.
- [ ] Approved video publishing adapters with exact artifact/destination binding.

Acceptance: each adapter has sandbox integration tests, permission-denial/revocation coverage, rate limits, retry semantics and a supported-provider matrix. No claim of “connected” based on client assertions.

## E. Professional release — Product QA + Runtime + App

- [ ] Convert packaged evaluation scenarios into real model/tool transcripts and machine-readable results.
- [ ] Recruiter review of JD, resume/interview evidence, decision memo and candidate communication quality.
- [ ] Applicant review of factual fidelity, match relevance, forms, receipts and privacy.
- [ ] Editor review of real renders, sound, captions, rights and platform formats.
- [ ] Sales review of relevance, truthful claims, suppression, qualification and handoff.
- [ ] Email adversarial suite: personal content, relationships, secrets, wrong recipients and mixed threads.
- [ ] Test billing/metering only after verified execution and lifecycle exist.
- [ ] Pilot with low volume, kill switches, incident playbooks and measured quality thresholds.

Acceptance: zero unauthorized actions or private-data leaks in release tests, evidence for every claimed submission/send/render, domain-review thresholds met, operational rollback exercised. Deterministic unit tests alone do not satisfy this gate.
