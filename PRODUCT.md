# ArkAgent

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

ArkAgent lets people hire role-based AI coworkers, brief them in plain language, and manage their work from a web console and connected messaging channels. The user's redesign brief calls for Recruiting, Job Applicant, Video Creator, Sales Outreach, and Email Assistant agents and a practical, human character with less generic AI styling.

## Users

Working audience: founders, small business teams, and individuals who want help with ongoing work. Job applicants are an explicit audience through the requested Job Applicant Agent.

## Operating Context

The existing Next.js application provides a public landing page, a role catalogue, a four-step hiring flow, an alternative generated-brief flow, authentication, hosted payment, and an authenticated agent workspace. Agents use dedicated runtime machines managed by an external service.

## Capabilities and Constraints

- OpenClaw and Hermes are currently provisionable; other harnesses remain gated.
- Runtime/tool availability determines the work an agent can perform. Job Applicant and Video Creator are requested role briefs, not existing verified specialized integrations.
- Existing public catalogue can return external manager templates instead of seeded roles. Marketing selections must not silently become an unrelated role.
- English, Simplified Chinese, Traditional Chinese, and Japanese are supported.
- Currency and plan amounts come from lib/pricing.ts; retain existing authentication, provisioning, billing, and channel behavior.
- No backend provisioning, deployment, data migration, or new integration is implied by this visual redesign.
- The user approved all five featured roles as honest, editable custom-agent briefs. Video Creator begins with scripts, storyboards, and production planning; rendering depends on connected tools.

## Brand Commitments

Preserve ArkAgent identity. Explain agents as coworkers with concrete jobs and clear oversight. The user requests generated imagery and functional design without a strong AI-generated aesthetic.

The user selected the illustrated team-directory direction: white, forest green, leaf-green portrait fields, and original painted coworkers. The approved reference is `.impeccable/mocks/decision/team-directory.png`.

## Evidence on Hand

Repository implementation and README document current capabilities. Existing rotating activity, performance percentages, and agent names on the landing page are illustrative rather than customer evidence. Do not invent customer counts, testimonials, verified outcomes, or availability guarantees.

## Product Principles

- Start with the job someone needs done.
- Explain responsibilities, deliverables, and boundaries before technical configuration.
- Keep hiring connected to real, editable agent configuration.
- Distinguish a role illustration or sample output from a real employee or live result.
