import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBriefPrompt } from "../lib/llm/agent-prompt";

test("brief generation improves the instructions field that triggered it", () => {
  const prompt = buildBriefPrompt({
    field: "instructions",
    roleName: "Sales Prospector",
    roleBlurb: "Qualifies leads",
    draft: "Only contact logistics companies in Singapore.",
    lang: "en",
  });

  assert.match(prompt.user, /<current-instructions>/);
  assert.match(prompt.user, /Only contact logistics companies in Singapore\./);
  assert.doesNotMatch(prompt.user, /initial tasks/i);
  assert.match(prompt.system, /edit that content rather than replacing its intent/i);
});

test("rules generation improves only the rules field that triggered it", () => {
  const prompt = buildBriefPrompt({
    field: "rules",
    roleName: "Customer Support",
    draft: "Never issue refunds without approval.",
    lang: "en",
  });

  assert.match(prompt.user, /<current-rules>/);
  assert.match(prompt.user, /Never issue refunds without approval\./);
  assert.doesNotMatch(prompt.user, /initial tasks/i);
  assert.match(prompt.system, /operating rules and guardrails/i);
});

test("an empty field gets a role-based first draft", () => {
  const prompt = buildBriefPrompt({
    field: "instructions",
    roleName: "Admin Assistant",
    lang: "zh",
  });

  assert.match(prompt.user, /Admin Assistant/);
  assert.doesNotMatch(prompt.user, /<current-instructions>/);
  assert.match(prompt.system, /Simplified Chinese/);
});
