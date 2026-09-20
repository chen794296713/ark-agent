# Video, sales and email capability research

Reviewed 21 September 2026 using primary documentation. Recommendations below distinguish authored procedures, executable adapters and service access. No third-party executable skill was installed. The first-party procedures are implemented in `lib/agent-packages/operations.ts`; their broker capability names are logical contracts, not claims that provider APIs are connected.

## Video production

Use separate creative, asset, edit and quality responsibilities. A professional pipeline needs an approved brief and timed script, stable storyboard shot IDs, asset provenance, provider job receipts, an editable timeline, audio stems, synchronized captions and actual render inspection. Downloadable or playable artifacts, rather than plausible narration about a video, are the acceptance evidence.

[FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html) provide compositing, concatenation, subtitle and audio processing primitives. The adapter should expose validated structured operations and selected paths rather than arbitrary shell commands. Probe inputs and normalize frame rate, dimensions and audio layouts before stitching. [FFmpeg licensing](https://ffmpeg.org/legal.html) depends on enabled components; the runtime image must record build flags and licensing obligations.

[Remotion rendering](https://www.remotion.dev/docs/renderer/render-media) is a useful optional worker for code-driven titles and motion graphics. Its [license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) requires explicit review for the intended commercial service; do not label the whole product MIT or install it assuming unrestricted commercial use. The package does not redistribute Remotion.

[OpenAI video API](https://platform.openai.com/docs/api-reference/videos) documents asynchronous generation jobs and remix operations. This supports a provider adapter with persisted job IDs, status reconciliation, cost reservations and separate clip quality checks. Availability and accepted input/output constraints must be verified for the account at dispatch. [Speech generation guidance](https://developers.openai.com/api/docs/guides/text-to-speech) requires clear disclosure for AI-generated voice. Use authorized voices and keep a record of consent for any custom voice. This research does not authorize paid generation or assert an available video subscription.

Ship the producer, scriptwriter, visual director, sound editor, editor and quality reviewer as bounded specialists. Keep publication outside their direct authority. Core tests: unlicensed music, unauthorized likeness, missing clip, provider timeout, duplicate paid job, source mismatch, caption drift, clipping, unreadable titles, bad aspect-ratio crop, budget breach and wrong destination. The runtime must inspect the resulting file and retain evidence.

## Sales outreach

Separate discovery, lead validation, copy, conversation and account coordination. Useful skills include ICP definition, source-linked company research, contact validation, suppression checks, evidence-based fit scoring, truthful messaging, bounded follow-up sequences, reply triage, qualification, accepted meeting scheduling and outcome reporting.

[HubSpot's contacts documentation](https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/contacts/guide) provides a concrete CRM integration reference. Contact and CRM access must be authorized for the correct account; a record's existence does not prove that outreach is appropriate. Keep contact source, verification result, bounce/opt-out state, campaign authority and last touch separate. Map provider IDs into a tenant-scoped ledger. The legacy documentation URL may redirect as HubSpot versions its API; pin the chosen API contract during adapter implementation.

A campaign permission is bounded by sender, recipients, content, allowed personalization, time window and volume. Verify suppression again at actual send time, not just when the list was built. A reply, opt-out, hard bounce or cancelled campaign stops queued follow-ups. Reconcile ambiguous sends with the provider before a retry. Do not invent personalized facts or claim previous contact. Commercial promises and unusual terms require the salesperson's decision.

Provider credentials, spam/deliverability controls and geography-specific contact requirements belong in an operational integration plan. This document does not supply legal permission to contact arbitrary people. Build the configurable consent/suppression mechanisms and have the operator approve the applicable operating rules.

## Work email and privacy

[Gmail scope documentation](https://developers.google.com/workspace/gmail/api/auth/scopes) distinguishes metadata, reading, composing, modifying and sending access. Broad Gmail scopes are not a work-versus-personal boundary; a label selection in a UI does not narrow the OAuth grant itself. Restricted scopes can require additional verification and security assessment. Choose the smallest sufficient scopes, record consent and enforce the selected resource scope in the broker before retrieval reaches any model.

[Microsoft Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-reference) similarly distinguish reading/writing from sending. [Exchange application RBAC](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac) offers resource-scoped application access controls. Choose delegated or application permissions deliberately; avoid implying that one mailbox-level mechanism provides message-level work/personal classification.

The strong product promise requires an architecture, not a persona paragraph. Launch with a dedicated work mailbox. For mixed accounts, introduce an independently evaluated upstream classification/quarantine path; personal, secret, mixed and uncertain items must not enter work-agent prompts, retrieval indexes, logs or specialist handoffs. Attachments, quoted history, notification previews, calendar data and recipients need the same checks. Work classification alone is insufficient to approve disclosure of sensitive business data; egress checks also validate recipients and content.

Specialists: privacy reviewer consuming safe classifications, triage coordinator, draft writer, work coordinator, document clerk and briefing editor. Useful workflows are reversible triage, source-grounded drafts, content-bound approval, send receipt reconciliation, commitment tracking, private daily brief and work-invoice organization. Do not implement payments or account-security changes through this package. Personal lifestyle/shopping features need a separate explicit product scope; they cannot silently inherit work-mail permission.

Critical tests include an API token in an attachment, personal content quoted in a work thread, changed recipients after approval, hidden forwarding requests, prompt injection, a spoofed urgent invoice, revoked consent, private calendar details and cross-tenant retrieval. A generic “privacy reviewer” LLM is not an adequate security boundary.

## Harness research and implementation decisions

[OpenClaw skills](https://docs.openclaw.ai/tools/skills) support skill files in agent/workspace locations. Package compilation uses `.agents/skills` and includes explicit manager mapping requirements for specialists. The app's existing instance API has no package-install contract, so it cannot be treated as sufficient deployment evidence.

[Hermes skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) use a profile's skill tree. An isolated profile avoids cross-user skill/credential leakage. [Hermes delegation](https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation) inherits enabled toolsets: a specialist prompt listing fewer tools does not enforce fewer tools. Require authenticated worker identity at an external broker or separate restricted profiles. Pin and test the runtime version before launch.

[Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) describe named custom-agent definitions. The compiler emits `.codex/agents/*.toml` with name, description and developer instructions, plus portable skill files. This is an artifact format, not a hosted Codex provisioning API. The manager must provide supported runtime launch, authorization, isolation and lifecycle integration.

The first release deliberately ships authored content and deterministic bundles rather than auto-installing a marketplace collection. A future dependency approval records source commit, license, digest, required executables, network access and evaluation results. Runtime acknowledgment confirms all skill digests and required connections; professional task capability requires additional live conformance and human-reviewed evaluations.
