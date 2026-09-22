/**
 * The harnesses an agent can run on — the single source of truth for the set.
 *
 * A "harness" is the runtime that actually executes an agent on its VM. The
 * database column is still called `engine` (renaming a live pgEnum is not worth
 * the migration), but everything above the schema says harness, because that is
 * the word the product and the runtime team use.
 *
 * The dependency deliberately points SCHEMA -> HERE, not the other way round:
 * `lib/db/schema.ts` builds its pgEnum from `HARNESS_IDS`, so there is exactly
 * one list, and a client component can import `Harness` without dragging Drizzle
 * and `postgres` into the browser bundle. This module is client-safe: no
 * server-only import, no database access, no environment reads.
 *
 * Adding a fifth harness means editing `HARNESS_IDS` here and `HARNESS_PROFILES`
 * in ./profiles.ts, then fixing whatever stops type-checking — every exhaustive
 * `Record<Harness, …>` in the codebase becomes a compile error, which is the
 * point. See `lib/harness/provisioning.ts` for the one mapping that cannot be
 * inferred and must be answered by the runtime team.
 */

import { HARNESS_PROFILES, supported } from "./profiles";

/**
 * Order matters twice: it is the order of the pgEnum's values (append only —
 * Postgres can add a value but not reorder one), and the order harnesses appear
 * in every picker.
 */
export const HARNESS_IDS = ["openclaw", "hermes", "codex", "deepseek"] as const;

export type Harness = (typeof HARNESS_IDS)[number];

/** Narrow an arbitrary string to a `Harness`. */
export function isHarness(value: string): value is Harness {
  return (HARNESS_IDS as readonly string[]).includes(value);
}

/**
 * `Harness` or the sentinel the hire wizard uses for "you pick for me".
 * `auto` is a UI-level choice that is resolved to a real harness before it ever
 * reaches the database — there is no `auto` value in the enum.
 */
export type HarnessChoice = Harness | "auto";

export const HARNESS_CHOICES = ["auto", ...HARNESS_IDS] as const;

export function isHarnessChoice(value: string): value is HarnessChoice {
  return value === "auto" || isHarness(value);
}

/**
 * What a harness can do, as far as the UI needs to care: should this control be
 * drawn at all?
 *
 * DERIVED from `HARNESS_PROFILES` in ./profiles.ts, never hand-written. The
 * profile is a tri-state (`yes` / `no` / `unknown`) because most of these
 * surfaces are unverified against the real runtimes; these booleans collapse
 * that with **`"unknown"` -> `false`**, because "we have not checked" and "it
 * is not supported" are the same answer to "draw the switch?" — and a control
 * built on an unverified claim silently does nothing.
 *
 * The two used to be separate hand-maintained tables with a test asserting they
 * agreed. They disagreed twice before the test existed, so the second table is
 * now computed.
 */
export interface HarnessCapabilities {
  /** Runs shell / file / browser / container tools on its own VM. */
  localExecution: boolean;
  /** Reads portable `SKILL.md` skills from `.agents/skills/`. */
  portableSkills: boolean;
  /** Curates its own memory and can author new skills unprompted. */
  selfImproving: boolean;
  /** Accepts an arbitrary OpenAI-compatible model endpoint. */
  modelAgnostic: boolean;
  /** Can hold a multi-turn conversation on a messaging channel. */
  channels: boolean;
  /** Specialised for reading and writing code in a repository. */
  codeNative: boolean;
}

function capabilitiesOf(id: Harness): HarnessCapabilities {
  const p = HARNESS_PROFILES[id];
  return {
    localExecution: supported(p.tools.shell),
    // True for all four: every harness implements the agentskills.io standard
    // and scans the same directory (docs/research/SKILL_ECOSYSTEM.md §0).
    portableSkills: true,
    selfImproving: supported(p.memory.selfImprove),
    modelAgnostic: p.models.providerAgnostic,
    channels: p.channels !== "unknown" && p.channels.length > 0,
    codeNative: supported(p.tools.code),
  };
}

export interface HarnessDef {
  id: Harness;
  /**
   * The product name, as its vendor writes it. Deliberately NOT translated:
   * these are proper nouns, and a 日本語 user searching for "Hermes" should find
   * it. Descriptive copy that DOES need translating lives in
   * `lib/i18n/harness.ts`.
   */
  label: string;
  /** Compact form for table cells and badges where the full name will not fit. */
  short: string;
  vendor: string;
  capabilities: HarnessCapabilities;
}

export const HARNESSES: Record<Harness, HarnessDef> = {
  openclaw: {
    id: "openclaw",
    label: "OpenClaw",
    short: "OpenClaw",
    vendor: "OpenClaw",
    capabilities: capabilitiesOf("openclaw"),
  },
  hermes: {
    id: "hermes",
    label: "Hermes",
    short: "Hermes",
    vendor: "Nous Research",
    capabilities: capabilitiesOf("hermes"),
  },
  codex: {
    id: "codex",
    label: "Codex Harness",
    short: "Codex",
    vendor: "OpenAI",
    capabilities: capabilitiesOf("codex"),
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek Harness",
    short: "DeepSeek",
    vendor: "DeepSeek",
    capabilities: capabilitiesOf("deepseek"),
  },
};

/** Display name for a harness id, tolerating a value from an older row. */
export function harnessLabel(id: string): string {
  return isHarness(id) ? HARNESSES[id].label : id;
}

/** Every harness definition, in picker order. */
export const HARNESS_LIST: HarnessDef[] = HARNESS_IDS.map((id) => HARNESSES[id]);
