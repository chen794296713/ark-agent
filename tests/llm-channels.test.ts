import test from "node:test";
import assert from "node:assert/strict";
import { createLlmChannelSchema, fetchLlmModelsSchema, llmCallConfigSchema } from "../lib/llm/channel-validation";
import { decryptApiKey, encryptApiKey, normalizeBaseUrl } from "../lib/llm/channel-config";
import { chatCompletion } from "../lib/llm/openrouter";

test("LLM channel validation accepts both supported protocols and rejects unknown ones", () => {
  assert.equal(createLlmChannelSchema.safeParse({
    name: "Claude production",
    provider: "anthropic",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    apiKey: "sk-ant-test",
  }).success, true);
  assert.equal(createLlmChannelSchema.safeParse({
    name: "Bad",
    provider: "custom",
    protocol: "gemini",
    baseUrl: "https://example.com/v1",
    apiKey: "secret",
  }).success, false);
  assert.equal(llmCallConfigSchema.safeParse({
    defaultChannelKind: "system",
    primaryChannelKind: "custom",
    primaryChannelId: "abc",
    primaryModel: "claude-sonnet-4-5",
    backupChannelKind: "system",
    backupChannelId: "system-openrouter",
    backupModel: "openai/gpt-5.6-luna",
  }).success, true);
});

test("model lookup validates stored-channel and unsaved-draft requests", () => {
  assert.equal(fetchLlmModelsSchema.safeParse({ source: "channel", channelKind: "system", channelId: "system-openrouter" }).success, true);
  assert.equal(fetchLlmModelsSchema.safeParse({ source: "draft", protocol: "openai", baseUrl: "https://api.example.com/v1", apiKey: "key" }).success, true);
  assert.equal(fetchLlmModelsSchema.safeParse({ source: "draft", protocol: "openai", baseUrl: "not-a-url", apiKey: "key" }).success, false);
});

test("custom channel credentials round-trip through authenticated encryption", () => {
  const previous = process.env.LLM_CHANNEL_ENCRYPTION_KEY;
  process.env.LLM_CHANNEL_ENCRYPTION_KEY = "11".repeat(32);
  try {
    const encrypted = encryptApiKey("sk-secret-value");
    assert.match(encrypted, /^v1\./);
    assert.equal(encrypted.includes("sk-secret-value"), false);
    assert.equal(decryptApiKey(encrypted), "sk-secret-value");
  } finally {
    if (previous === undefined) delete process.env.LLM_CHANNEL_ENCRYPTION_KEY;
    else process.env.LLM_CHANNEL_ENCRYPTION_KEY = previous;
  }
});

test("base URLs are normalized and embedded credentials are refused", () => {
  assert.equal(normalizeBaseUrl(" https://api.example.com/v1/// "), "https://api.example.com/v1");
  assert.throws(() => normalizeBaseUrl("https://user:pass@example.com/v1"), /credentials/);
});

test("Anthropic connections use the Messages request and response shape", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return Response.json({
      id: "msg_test",
      model: "claude-sonnet-4-5",
      content: [{ type: "text", text: "hello" }],
      usage: { input_tokens: 8, output_tokens: 2 },
    });
  };
  try {
    let usageModel = "";
    const text = await chatCompletion({
      connection: { protocol: "anthropic", provider: "anthropic", baseUrl: "https://api.anthropic.com/v1", apiKey: "test-key", model: "claude-sonnet-4-5" },
      messages: [{ role: "system", content: "Be concise" }, { role: "user", content: "Hi" }],
      maxTokens: 32,
      onUsage: (usage) => { usageModel = usage.model; },
    });
    assert.equal(text, "hello");
    assert.equal(usageModel, "claude-sonnet-4-5");
    const request = requests[0];
    assert.equal(request?.url, "https://api.anthropic.com/v1/messages");
    const headers = new Headers(request?.init?.headers);
    assert.equal(headers.get("x-api-key"), "test-key");
    const body = JSON.parse(String(request?.init?.body));
    assert.equal(body.system, "Be concise");
    assert.deepEqual(body.messages, [{ role: "user", content: "Hi" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
