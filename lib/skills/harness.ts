/**
 * Deriving `skills.harness_compat` — an assertion, never a default.
 *
 * All four harnesses read the same agentskills.io `SKILL.md` from
 * `.agents/skills/` (docs/research/SKILL_ECOSYSTEM.md §0), so there is no
 * per-harness body format and nothing to transform. Incompatibility comes from
 * exactly three things: a required binary on PATH, a required credential, or a
 * required HOST capability such as the OpenClaw `slack` tool. Only the third
 * makes a skill harness-specific.
 *
 * OWASP AST10 names cross-platform reuse as a risk in its own right — a skill
 * audited under OpenClaw's sandbox assumptions may be materially more dangerous
 * under a Codex harness with different isolation. A silent `true` here is
 * therefore the bug, which is why every entry records WHY we believe it
 * (`basis`) and why an absent entry means "untested", never "permitted".
 *
 * Client-safe: pure functions over plain data.
 */
import { HARNESS_IDS, type Harness } from "@/lib/harness";
import { sanitizeSkillText } from "./safety";
import type { HarnessCompat, HarnessCompatMap, SkillFormat, SkillRequirements } from "./types";

/**
 * Host capabilities each harness provides. Derived from the skill-directory and
 * MCP-client findings in docs/research/SKILL_ECOSYSTEM.md §0; `mcp.client` is
 * true for all four, and `openclaw.*` for one.
 */
const HARNESS_HOST_CAPS: Record<Harness, ReadonlySet<string>> = {
  openclaw: new Set(["mcp.client", "openclaw.tool.slack", "openclaw.plugin", "openclaw.beam"]),
  hermes: new Set(["mcp.client", "hermes.tap"]),
  codex: new Set(["mcp.client"]),
  deepseek: new Set(["mcp.client"]),
};

/**
 * Only these prefixes name a HOST capability.
 *
 * Everything else in `requires.config` is the skill's OWN configuration key —
 * the integration contract's worked example is `config: ["github.host"]` — and
 * treating an unrecognised string as a missing host capability marks the skill
 * 0/4 and makes it unattachable without an override. That failure mode turns an
 * assertion model into a click-through model, which is precisely what the
 * assertion model exists to prevent.
 */
const HOST_CAP_PREFIXES = ["mcp.", "openclaw.", "hermes.", "codex.", "deepseek."];

export function isHostCapability(key: string): boolean {
  return HOST_CAP_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Derive compatibility from declared requirements.
 *
 * A publisher's own `declared`/`verified` assertion wins — we did not learn
 * anything better by inspecting metadata. Otherwise we infer, and record
 * `basis: "inferred"` so the UI can say "derived from declared requirements —
 * not tested" instead of drawing a green tick nobody earned.
 *
 * A required BINARY never makes a skill harness-incompatible: `gh` is a property
 * of the VM image, not of the runtime, and a missing one makes the skill
 * unrunnable everywhere rather than on three of four. It surfaces separately as
 * a requirements warning on attach.
 */
export function deriveHarnessCompat(
  req: SkillRequirements,
  format: SkillFormat,
  declared?: HarnessCompatMap,
): HarnessCompatMap {
  const needed = new Set<string>(
    (req.config ?? [])
      .filter(isHostCapability)
      // An MCP skill needs an MCP client whether or not the publisher declared it.
      .concat(format === "mcp_server" ? ["mcp.client"] : []),
  );
  const out: HarnessCompatMap = {};
  for (const h of HARNESS_IDS) {
    const d = declared?.[h];
    if (d && (d.basis === "verified" || d.basis === "declared")) {
      // Rebuilt field by field, never spread. `declared` arrives from upstream
      // metadata on the sync path, so it is a third party's object: spreading it
      // persists whatever extra keys the publisher invented into our jsonb
      // column and hands `note` — typed "sanitized, <=160 chars" — straight to
      // the drawer with its zero-width characters and markup intact.
      out[h] = {
        supported: d.supported === true,
        basis: d.basis,
        ...(d.note ? { note: sanitizeSkillText(String(d.note), 160) } : {}),
      };
      continue;
    }
    const missing = [...needed].filter((cap) => !HARNESS_HOST_CAPS[h].has(cap));
    out[h] = missing.length
      ? { supported: false, basis: "inferred", note: `needs ${missing.join(", ")}` }
      : { supported: true, basis: "inferred" };
  }
  return out;
}

/**
 * The denormalized facet array. Populated from `supported === true` only, so
 * the browser's harness filter is a `@>` containment lookup against a GIN index
 * rather than a jsonb scan.
 */
export function supportedHarnesses(compat: HarnessCompatMap): Harness[] {
  return HARNESS_IDS.filter((h) => compat[h]?.supported === true);
}

/**
 * Build a compat map from a plain "runs on these" list, for the seed catalogue.
 * `basis: "declared"` for the listed harnesses because a human read the
 * publisher's own statement; the unlisted ones get an explicit unsupported entry
 * with a note rather than an absent key, so the drawer's matrix has four rows.
 */
export function compatFromList(harnesses: readonly Harness[], note?: string): HarnessCompatMap {
  const set = new Set(harnesses);
  const clean = note ? sanitizeSkillText(note, 160) : "";
  const out: HarnessCompatMap = {};
  for (const h of HARNESS_IDS) {
    out[h] = set.has(h)
      ? { supported: true, basis: "declared" }
      : { supported: false, basis: "declared", ...(clean ? { note: clean } : {}) };
  }
  return out;
}

/**
 * The read every consumer must use.
 *
 * A missing key is `{ supported: false, basis: "unknown" }` — never permission.
 * The attach gate is written `?.supported !== true` for the same reason: the
 * obvious `=== false` is falsy when the key is absent, so the
 * untested-on-this-harness skill would attach silently while the copy promised
 * the opposite.
 */
export function compatFor(compat: HarnessCompatMap, h: Harness): HarnessCompat {
  return compat[h] ?? { supported: false, basis: "unknown" };
}
