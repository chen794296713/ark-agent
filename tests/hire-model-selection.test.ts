import test from "node:test";
import assert from "node:assert/strict";
import type { LlmChannelDTO } from "../lib/client-api";
import { defaultHireModelSelection } from "../lib/llm/model-selection";

function channel(kind: "system" | "custom", id: string, models: string[]): LlmChannelDTO {
  return { id, kind, name: id, provider: "test", protocol: "openai", baseUrl: "https://example.com/v1", enabled: true, available: true, hasApiKey: true, models, lastSyncedAt: null, createdAt: null, updatedAt: null };
}

test("hire defaults primary and backup to the first two custom models", () => {
  const result = defaultHireModelSelection({ system: [channel("system", "system", ["s1", "s2"])], custom: [channel("custom", "custom", ["c1", "c2"])] });
  assert.deepEqual(result, { primary: { channelKind: "custom", channelId: "custom", model: "c1" }, backup: { channelKind: "custom", channelId: "custom", model: "c2" } });
});

test("one custom model uses the first system model as backup", () => {
  const result = defaultHireModelSelection({ system: [channel("system", "system", ["s1", "s2"])], custom: [channel("custom", "custom", ["c1"])] });
  assert.equal(result.primary.model, "c1");
  assert.deepEqual(result.backup, { channelKind: "system", channelId: "system", model: "s1" });
});

test("without custom models hire uses the first two system models", () => {
  const result = defaultHireModelSelection({ system: [channel("system", "system", ["s1", "s2"])], custom: [] });
  assert.equal(result.primary.model, "s1");
  assert.equal(result.backup.model, "s2");
});
