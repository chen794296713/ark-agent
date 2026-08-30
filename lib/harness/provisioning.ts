import "server-only";
import { HARNESS_IDS, isHarness, type Harness } from "./index";

/**
 * The one piece of harness knowledge ArkAgent cannot derive: which OpenClaw
 * Manager `category_id` provisions which runtime.
 *
 * `manager_api.md` documents exactly two — `2` for OpenClaw and `4` for
 * Hermes — and the Manager has not been given ids for Codex or DeepSeek. That
 * gap is a fact about an external service, so it is recorded here as `null`
 * rather than guessed.
 *
 * This replaced `input.engine === "openclaw" ? 2 : 4` in lib/services/agents.ts,
 * a two-way branch on what is now a four-value enum. With four harnesses that
 * expression silently provisioned a **Hermes** VM for anyone who hired a Codex
 * agent: same wrong image, no error, a running container, a billed seat. A
 * throw is the only safe behaviour for an unmapped harness — there is no
 * sensible default, because every default is somebody else's runtime.
 */
const CATEGORY_ID: Record<Harness, number | null> = {
  openclaw: 2,
  hermes: 4,
  // Awaiting the runtime team — see docs/BACKEND_INTEGRATION_CONTRACT.md.
  codex: null,
  deepseek: null,
};

export class HarnessNotProvisionableError extends Error {
  readonly harness: string;
  constructor(harness: string) {
    super(
      `The ${harness} harness cannot be provisioned yet: no OpenClaw Manager category_id is ` +
        `assigned to it. Enable it in ATG_ENABLED_HARNESSES only once the runtime team has ` +
        `assigned one.`,
    );
    this.name = "HarnessNotProvisionableError";
    this.harness = harness;
  }
}

/**
 * The Manager `category_id` for a harness.
 *
 * Throws rather than returning a fallback. A caller that cannot provision must
 * surface a refusal to the operator; quietly starting the wrong runtime is the
 * failure this function exists to prevent.
 */
export function categoryIdFor(harness: Harness): number {
  const id = CATEGORY_ID[harness];
  if (id === null) throw new HarnessNotProvisionableError(harness);
  return id;
}

/** Whether a harness has a Manager mapping at all. */
export function isProvisionable(harness: Harness): boolean {
  return CATEGORY_ID[harness] !== null;
}

/**
 * Harnesses this deployment offers, as the intersection of "the Manager can
 * provision it" and "the operator has enabled it".
 *
 * `ATG_ENABLED_HARNESSES` is a comma-separated allowlist. It exists so a
 * harness can be dark-launched — present in the enum, in the schema and in the
 * code, but absent from every picker — rather than shipped half-wired.
 *
 * Three states, not two:
 *   unset            every provisionable harness (keeps existing deployments working)
 *   set to a list    the intersection of that list and what is provisionable
 *   set but empty    NOTHING
 *
 * The last one matters. Treating an empty value as "unset" fails OPEN, which is
 * the wrong direction for a gate: an operator who writes
 * `ATG_ENABLED_HARNESSES=` is asking for none, and a templating accident that
 * resolves to an empty string should stop hiring loudly rather than quietly
 * offering everything. It is the same reasoning as
 * `lib/payments/config.ts`'s `unconfigured`.
 */
export function enabledHarnesses(): Harness[] {
  // `ARK_ENABLED_HARNESSES` is the name that shipped first and is honoured for
  // one release so a deployment carrying it does not silently lose its gate.
  const raw = process.env.ATG_ENABLED_HARNESSES ?? process.env.ARK_ENABLED_HARNESSES;
  const provisionable = HARNESS_IDS.filter(isProvisionable);
  if (raw === undefined) return [...provisionable];

  const requested = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(isHarness);
  // Intersect rather than trust: an operator listing `codex` before the Manager
  // supports it would otherwise put a hire button in the UI that can only 500.
  return provisionable.filter((h) => requested.includes(h));
}

/** Whether this deployment will accept a hire on `harness`. */
export function isHarnessEnabled(harness: Harness): boolean {
  return enabledHarnesses().includes(harness);
}
