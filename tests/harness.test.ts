/**
 * The harness catalog and the provisioning map.
 *
 * The provisioning tests exist because of a specific, silent bug: the old
 * `input.engine === "openclaw" ? 2 : 4` was a two-way branch on what is now a
 * four-value enum, so hiring a Codex agent provisioned a **Hermes** VM — right
 * container, wrong runtime, no error, billed seat. Anything that reintroduces a
 * fallback instead of a throw must fail here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HARNESSES,
  HARNESS_IDS,
  HARNESS_LIST,
  harnessLabel,
  isHarness,
  isHarnessChoice,
} from "../lib/harness";
import {
  HarnessNotProvisionableError,
  categoryIdFor,
  enabledHarnesses,
  isHarnessEnabled,
  isProvisionable,
} from "../lib/harness/provisioning";
import {
  HARNESS_PROFILES,
  openConfirms,
  supported,
} from "../lib/harness/profiles";
import {
  CHANNEL_TYPE_IDS,
  channelLabel,
  isChannelType,
} from "../lib/channels";
import { channelTypeEnum, engineEnum } from "../lib/db/schema";

test("the pgEnum is built from the catalog, so the two can never drift", () => {
  assert.deepEqual([...engineEnum.enumValues], [...HARNESS_IDS]);
});

test("all four harnesses are defined and self-consistent", () => {
  assert.deepEqual([...HARNESS_IDS], ["openclaw", "hermes", "codex", "deepseek"]);
  for (const id of HARNESS_IDS) {
    const def = HARNESSES[id];
    assert.equal(def.id, id, `${id} definition is filed under the wrong key`);
    assert.ok(def.label.length > 0);
    assert.ok(def.short.length > 0);
    assert.ok(def.vendor.length > 0);
  }
  assert.equal(HARNESS_LIST.length, 4);
  assert.deepEqual(HARNESS_LIST.map((h) => h.id), [...HARNESS_IDS]);
});

test("labels are the vendors' own product names", () => {
  assert.equal(harnessLabel("openclaw"), "OpenClaw");
  assert.equal(harnessLabel("hermes"), "Hermes");
  assert.equal(harnessLabel("codex"), "Codex Harness");
  assert.equal(harnessLabel("deepseek"), "DeepSeek Harness");
});

test("an unknown id renders as itself rather than undefined", () => {
  // A fleet card must never print "undefined" because a row carries a harness
  // this build has not heard of.
  assert.equal(harnessLabel("some-future-harness"), "some-future-harness");
});

test("isHarness / isHarnessChoice narrow correctly", () => {
  assert.ok(isHarness("codex"));
  assert.ok(!isHarness("auto"));
  assert.ok(!isHarness("OpenClaw"));
  assert.ok(!isHarness(""));
  assert.ok(isHarnessChoice("auto"));
  assert.ok(isHarnessChoice("deepseek"));
  assert.ok(!isHarnessChoice("nope"));
});

test("only the harnesses the Manager has an id for are provisionable", () => {
  assert.ok(isProvisionable("openclaw"));
  assert.ok(isProvisionable("hermes"));
  // manager_api.md assigns category_id for these two only.
  assert.ok(!isProvisionable("codex"));
  assert.ok(!isProvisionable("deepseek"));
});

test("categoryIdFor returns the documented ids", () => {
  assert.equal(categoryIdFor("openclaw"), 2);
  assert.equal(categoryIdFor("hermes"), 4);
});

test("categoryIdFor THROWS on an unmapped harness — never a fallback", () => {
  for (const h of ["codex", "deepseek"] as const) {
    assert.throws(
      () => categoryIdFor(h),
      (err: unknown) => {
        assert.ok(err instanceof HarnessNotProvisionableError, `${h} threw the wrong error type`);
        assert.equal(err.harness, h);
        assert.match(err.message, /category_id/);
        return true;
      },
      `${h} must not resolve to another harness's category_id`,
    );
  }
});

test("no unmapped harness shares a category_id with a mapped one", () => {
  // The regression in one assertion: if a future edit gives codex a fallback,
  // it would collide with hermes' 4 and provision the wrong image.
  const mapped = HARNESS_IDS.filter(isProvisionable).map(categoryIdFor);
  assert.equal(new Set(mapped).size, mapped.length, "two harnesses share a category_id");
});

function clearGate() {
  delete process.env.ATG_ENABLED_HARNESSES;
  delete process.env.ARK_ENABLED_HARNESSES;
}

test("enabledHarnesses defaults to every provisionable harness", () => {
  clearGate();
  assert.deepEqual(enabledHarnesses(), ["openclaw", "hermes"]);
  assert.ok(isHarnessEnabled("openclaw"));
  assert.ok(!isHarnessEnabled("codex"));
});

test("the allowlist narrows, and can never widen past what is provisionable", () => {
  clearGate();
  process.env.ATG_ENABLED_HARNESSES = "openclaw";
  assert.deepEqual(enabledHarnesses(), ["openclaw"]);

  // An operator listing codex before the Manager supports it must not put a
  // hire button in the UI that can only 500.
  process.env.ATG_ENABLED_HARNESSES = "openclaw,hermes,codex,deepseek";
  assert.deepEqual(enabledHarnesses(), ["openclaw", "hermes"]);

  // Junk, whitespace and casing are tolerated, not honoured.
  process.env.ATG_ENABLED_HARNESSES = " HERMES , not-a-harness ,, ";
  assert.deepEqual(enabledHarnesses(), ["hermes"]);
  clearGate();
});

test("a gate that is set but empty fails CLOSED, not open", () => {
  // A templating accident resolving to "" must stop hiring loudly, not quietly
  // offer everything. Unset and empty are different answers.
  clearGate();
  for (const empty of ["", "   ", ",,", " , "]) {
    process.env.ATG_ENABLED_HARNESSES = empty;
    assert.deepEqual(enabledHarnesses(), [], `"${empty}" should enable nothing`);
    assert.ok(!isHarnessEnabled("openclaw"));
  }
  clearGate();
});

test("the pre-rename variable still works, and the new name wins", () => {
  clearGate();
  process.env.ARK_ENABLED_HARNESSES = "hermes";
  assert.deepEqual(enabledHarnesses(), ["hermes"], "legacy name must not be ignored");

  process.env.ATG_ENABLED_HARNESSES = "openclaw";
  assert.deepEqual(enabledHarnesses(), ["openclaw"], "new name must take precedence");
  clearGate();
});

// ---------------------------------------------------------------------------
// Profiles, and the booleans derived from them
// ---------------------------------------------------------------------------

test("HARNESS_PROFILES is total over Harness and internally consistent", () => {
  for (const id of HARNESS_IDS) {
    const p = HARNESS_PROFILES[id];
    assert.ok(p, `${id} has no profile`);
    assert.equal(p.harness, id, `${id}'s profile is filed under the wrong key`);
    // All four implement the agentskills.io standard and scan the same path;
    // per-harness compatibility is about runtime dependencies, not format.
    assert.equal(p.skillDir, ".agents/skills");
  }
});

test("capabilities are DERIVED from the profile, with unknown -> false", () => {
  // The two used to be hand-maintained tables that drifted. This asserts the
  // mapping rule rather than the values, so it survives a profile correction.
  for (const id of HARNESS_IDS) {
    const p = HARNESS_PROFILES[id];
    const c = HARNESSES[id].capabilities;
    assert.equal(c.localExecution, p.tools.shell === "yes", `${id} localExecution`);
    assert.equal(c.selfImproving, p.memory.selfImprove === "yes", `${id} selfImproving`);
    assert.equal(c.codeNative, p.tools.code === "yes", `${id} codeNative`);
    assert.equal(c.modelAgnostic, p.models.providerAgnostic, `${id} modelAgnostic`);
    assert.equal(
      c.channels,
      p.channels !== "unknown" && p.channels.length > 0,
      `${id} channels`,
    );
    assert.equal(c.portableSkills, true, `${id} portableSkills`);
  }
});

test("an unverified surface never renders a control", () => {
  // Hermes' channels are CONFIRM-6 and DeepSeek's shell is unverified. A `true`
  // here draws a switch that silently does nothing — the exact failure the
  // tri-state exists to prevent.
  assert.equal(HARNESS_PROFILES.hermes.channels, "unknown");
  assert.equal(HARNESSES.hermes.capabilities.channels, false);
  assert.equal(HARNESS_PROFILES.deepseek.tools.shell, "unknown");
  assert.equal(HARNESSES.deepseek.capabilities.localExecution, false);
});

test("the two corrections the contract forced", () => {
  // OpenClaw's self-improvement is plugin-driven, i.e. it works.
  assert.equal(HARNESSES.openclaw.capabilities.selfImproving, true);
  // DeepSeek is files-and-network only. `codeNative` renders "specialised for
  // code" in the hire wizard, which was a live copy bug for this harness.
  assert.equal(HARNESSES.deepseek.capabilities.codeNative, false);
});

test("every harness declares which contract questions are still open", () => {
  const confirms = openConfirms();
  assert.ok(confirms.length > 0, "no open CONFIRM ids — did the contract get answered?");
  for (const id of HARNESS_IDS) {
    for (const c of HARNESS_PROFILES[id].confirms) {
      assert.match(c, /^CONFIRM-\d+$/, `${id} has a malformed confirm id: ${c}`);
    }
  }
});

test("supported() treats unknown as not-yes", () => {
  assert.equal(supported("yes"), true);
  assert.equal(supported("no"), false);
  assert.equal(supported("unknown"), false);
});

// ---------------------------------------------------------------------------
// Channels — same inversion, same reason
// ---------------------------------------------------------------------------

test("the channel pgEnum is built from the catalog", () => {
  assert.deepEqual([...channelTypeEnum.enumValues], [...CHANNEL_TYPE_IDS]);
});

test("every channel a profile claims is a real channel type", () => {
  for (const id of HARNESS_IDS) {
    const ch = HARNESS_PROFILES[id].channels;
    if (ch === "unknown") continue;
    for (const t of ch) {
      assert.ok(isChannelType(t), `${id} claims unknown channel "${t}"`);
    }
  }
});

test("channel labels cover every type and tolerate an unknown one", () => {
  for (const t of CHANNEL_TYPE_IDS) assert.ok(channelLabel(t).length > 0, t);
  assert.equal(channelLabel("carrier-pigeon"), "carrier-pigeon");
});
