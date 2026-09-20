# Agent package runtime contract

The package catalog compiles reviewed role content into a versioned bundle. A
saved package is a configured **draft**, not an installed integration or a
running agent. The existing instance manager accepts tasks, agent IDs and
categories; it does not implement this package protocol. This feature never
falls back to that API, a bare language model, or a simulated deployment.

## Configuration and persistence

`POST /api/agent-packages/configure` requires the normal workspace session and
an `Idempotency-Key` header (8–80 letters, digits, dots, colons, underscores or
hyphens). The body is `{ "packageId": "email-assistant", "overlay": { "name":
"Inbox assistant", "instructions": "", "organization": "", "goals": "",
"tone": "professional", "harness": "hermes" } }`.

One database transaction stores the agent draft, catalog definition, normalized
user overlay, full compiled bundle, bundle digest and deployment state. The
same workspace and key replay the saved result, even after the catalog changes;
a different body with that key returns 409. The key is permanent for the life of
the saved package. A different workspace cannot read or deploy it. No billing
seat, credit allowance, scheduled job or remote instance is created by saving.

`GET /api/agents/:id/package` returns the saved definition, overlay, pinned
skills, deployment availability and truthful installation/connection state.
Before acknowledgment, skills are `pending` and connections `unverified`.
`GET /api/agents/:id/package?download=1` downloads the saved compiled JSON bundle
with relative file paths, content and SHA-256 checksums. Both require ownership
through the current workspace session and send private, no-store responses.
The overlay is user-authored content, not a credential store; provider secrets
belong in the runtime manager's tenant-scoped connection storage.

## Operator opt-in

Apply repository migration `0010_agent_packages` through the normal authorized
database rollout before enabling package setup. Merging this code does not
apply that migration. While the table is absent, package configure, deploy,
read and download APIs return HTTP 503 with `code: "package_unavailable"`.
Only PostgreSQL error `42P01` specifically naming `agent_packages` receives
this handling; other database errors are never treated as permission to run.
Legacy agents remain usable before the migration only when their persisted
role is not `package-agent`. A package role with unavailable or missing package
records fails closed. The reserved role is hidden from the legacy catalog and
cannot be created through the legacy hire API. No migration-readiness cache is
used, so applying the migration makes setup available without restarting.

All three environment values are required:

- `ARK_PACKAGE_MANAGER_URL`: the exact HTTPS deployment endpoint, without URL
  credentials, query parameters or fragments.
- `ARK_PACKAGE_MANAGER_TOKEN`: a private bearer credential accepted only by the
  package manager; never included in a bundle or browser response.
- `ARK_PACKAGE_MANAGER_HARNESSES`: an explicit comma-separated list of harness
  IDs the operator has verified against this protocol.

An absent, invalid or unsupported configuration returns 503 before any remote
request. Merely configuring an allowlist is not proof of installation: every
deployment still needs the acknowledgment below. No package manager endpoint
has been provisioned or verified by this repository change.

## Deployment request

`POST /api/agent-packages/:agentId/deploy` authenticates the workspace, then
claims the saved deployment. The server sends one POST to the operator's exact
endpoint, with `Authorization: Bearer …`, `Content-Type: application/json` and
`Idempotency-Key: <deploymentId>`. Redirects are rejected and the request times
out after 45 seconds. The JSON contract is:

```json
{
  "protocolVersion": "ark-package-runtime/v1",
  "deploymentId": "uuid",
  "agentId": "uuid",
  "workspaceId": "uuid",
  "harness": "hermes",
  "bundleDigest": "64-character lowercase SHA-256",
  "policyDigest": "64-character lowercase SHA-256",
  "skills": [{ "id": "skill-id", "digest": "64-character lowercase SHA-256" }],
  "connections": [{ "id": "mail", "required": true }],
  "bundle": { "schemaVersion": 1, "files": [] }
}
```

`bundle` is the complete `CompiledAgentPackage`, not the abbreviated object
above. Its canonical bundle digest is the lowercase hexadecimal SHA-256 of
`JSON.stringify(resultWithoutDigest, null, 2) + "\n"`, encoded as UTF-8. The
top-level property order is `schemaVersion`, `packageId`, `version`, `harness`,
`name`, `policyDigest`, `skills`, `requiredConnectors`, `files`; file paths are
already sorted by the compiler. Preserve array order and the complete nested
object order from the saved bundle. File `sha256` values hash the exact UTF-8
`content`; `policyDigest` is the policy file's hash. The manager must validate
every file hash, the canonical bundle digest,
the harness-specific adapter, the pinned skill digests and machine-readable
policy. It must install files into an isolated workspace, enforce tool and
worker permissions outside the model, bind credentials to the authenticated
workspace and agent, and evaluate connection scopes against the declared
requirements. Policy enforcement must implement the approval gates and
default-deny behavior in the bundle; copying policy prose into a prompt does
not satisfy this contract.

The manager must persist the deployment ID as its own idempotency key and
return the same runtime binding on retries. It must reject a reused ID with
different package, agent or workspace content. Concurrent client requests
receive 202 while a lease is held. A lease can be recovered after two minutes;
recovery uses the same deployment ID, so an HTTP timeout cannot create a second
runtime. A timeout may leave a real remote runtime: operators must reconcile
the saved deployment ID rather than assuming nothing happened.

## Synchronous installation acknowledgment

A successful HTTP response alone is insufficient. The HTTPS response must be
the following exact schema; no asynchronous callback is accepted:

```json
{
  "protocolVersion": "ark-package-runtime/v1",
  "deploymentId": "the requested UUID",
  "agentId": "the requested UUID",
  "workspaceId": "the requested UUID",
  "harness": "hermes",
  "bundleDigest": "the exact requested digest",
  "policyDigest": "the exact requested digest",
  "state": "ready",
  "runtimeId": "the installed runtime identifier",
  "installedSkills": [{ "id": "skill-id", "digest": "the installed digest" }],
  "policyEnforced": true,
  "connections": [{ "id": "mail", "state": "connected" }]
}
```

All binding fields must match. The installed skill set must exactly match the
pinned set, with no duplicate or extra IDs. Every declared connection must be
acknowledged once as `connected` or `missing`; every required connection must
be connected. Optional missing connections remain visible. The manager should
send a non-2xx response while installation is incomplete. Invalid or incomplete
acknowledgments leave the package failed and the agent unready. Safe error codes
are stored; raw upstream errors, URLs and credentials are not returned.

Only a validated acknowledgment moves the saved package to `ready` and the
agent to `paused` in one transaction. `ready` means installation verified; the
agent stays paused until a package execution and approval bridge exists. The
runtime ID stays in the package
record, never the legacy manager binding. There is no billing activation in
this initial protocol.

## Deliberate boundaries

Legacy chat, configuration, skill/context edits, schedules, self-review,
improvement application and status webhooks reject package agents. They cannot
apply an immutable package digest or enforce its policy. The legacy pause,
resume and terminate controls also reject package agents. A never-deployed
draft can be deleted locally; after any remote deployment attempt, deletion is blocked
until a package runtime stop/removal contract is implemented, because a timeout
can leave an upstream instance alive.

This initial contract installs and verifies bundles. It does not implement a
package execution/chat bridge, connection authorization UI, package upgrades,
runtime heartbeat reconciliation, paid execution, runtime stop/removal or
per-action approval callbacks. A successful install does not imply those
interfaces exist. The operator's manager must supply its execution/approval
surface before enabling live work.

## Verification

`tests/package-deployment.test.ts` injects a transport to verify fail-closed
configuration, binding, pinned skills, required connections and safe errors.
`tests/package-deployment-persistence.test.ts` runs only when
`PACKAGE_TEST_DATABASE_URL` points to a disposable loopback database named
`ark_package_test`; it checks transactional replay, tenant isolation, absence of
billing, failed/verified deployment and deletion boundaries. It never reads the
application `.env` file or calls an external manager.
