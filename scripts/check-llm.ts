/**
 * LLM connectivity check — verifies the OpenRouter credentials and model id in
 * your environment actually work, end to end.
 *
 *   npm run llm:check
 *
 * Reads OPENROUTER_API_KEY / LLM_MODEL / OPENROUTER_APP_TITLE / OPENROUTER_BASE_URL
 * from .env. Reports, in order:
 *   1. key present + valid (auth against /key)
 *   2. the configured model id exists in OpenRouter's catalog
 *   3. a real streaming chat completion returns tokens
 * Exits non-zero on the first hard failure so it can be used in CI.
 */

const BASE = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
const KEY = process.env.OPENROUTER_API_KEY;
const RAW_MODEL = process.env.LLM_MODEL || "openai/gpt-4o-mini";
const TITLE = process.env.OPENROUTER_APP_TITLE || "ArkAgent";

/** Mirrors normalizeModelId() in lib/llm/openrouter.ts. */
function normalizeModelId(id: string): string {
  const parts = id.split("/");
  return parts.length >= 3 && parts[0] === "openrouter" ? parts.slice(1).join("/") : id;
}
const MODEL = normalizeModelId(RAW_MODEL);

const ok = (m: string) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const warn = (m: string) => console.log(`  \x1b[33m!\x1b[0m ${m}`);

function headers() {
  return {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    "X-Title": TITLE,
  };
}

async function main() {
  console.log("\nArkAgent · LLM configuration check\n");
  console.log(`  endpoint : ${BASE}`);
  console.log(`  model    : ${MODEL}${MODEL !== RAW_MODEL ? `  (normalized from "${RAW_MODEL}")` : ""}`);
  console.log(`  app title: ${TITLE}`);
  console.log(`  api key  : ${KEY ? KEY.slice(0, 8) + "…" + KEY.slice(-4) : "(missing)"}\n`);

  if (!KEY) {
    bad("OPENROUTER_API_KEY is not set — the app will fall back to mock replies.");
    process.exit(1);
  }

  // 1. Auth
  const keyRes = await fetch(`${BASE}/key`, { headers: headers() });
  if (!keyRes.ok) {
    bad(`Auth failed (HTTP ${keyRes.status}): ${(await keyRes.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const keyInfo = (await keyRes.json())?.data ?? {};
  ok(`API key is valid${keyInfo.label ? ` (label: ${keyInfo.label})` : ""}`);
  if (typeof keyInfo.limit_remaining === "number") {
    ok(`Credit remaining: ${keyInfo.limit_remaining}`);
  }

  // 2. Model id exists. Advisory: the live completion below is authoritative,
  // since a usable id can occasionally be absent from the public listing.
  let catalogMiss = false;
  let suggestions: string[] = [];
  const modelsRes = await fetch(`${BASE}/models`, { headers: headers() });
  if (modelsRes.ok) {
    const ids: string[] = ((await modelsRes.json())?.data ?? []).map((m: { id: string }) => m.id);
    if (ids.includes(MODEL)) {
      ok(`Model "${MODEL}" exists in the OpenRouter catalog`);
    } else {
      catalogMiss = true;
      bad(`Model "${MODEL}" was NOT found in the OpenRouter catalog.`);
      const [vendor] = MODEL.split("/");
      const tail = MODEL.split("/").pop() ?? "";
      const byName = ids.filter((i) => tail && i.includes(tail)).slice(0, 12);
      const near = ids.filter((i) => i.startsWith(`${vendor}/`)).slice(0, 12);
      suggestions = byName.length ? byName : near;
      if (suggestions.length) console.log(`      did you mean: ${suggestions.join(", ")}`);
      console.log(`      Full list: https://openrouter.ai/models`);
    }
  } else {
    warn(`Couldn't list models (HTTP ${modelsRes.status}) — skipping catalog check.`);
  }

  // 3. Real streaming completion
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: "Reply with exactly: ArkAgent LLM online." }],
      stream: true,
      max_tokens: 32,
    }),
  });
  if (!res.ok || !res.body) {
    bad(`Chat completion failed (HTTP ${res.status}): ${(await res.text()).slice(0, 400)}`);
    if (catalogMiss) {
      console.log(
        `\n\x1b[31mLLM_MODEL="${MODEL}" appears to be invalid.\x1b[0m` +
          (suggestions.length ? ` Try one of: ${suggestions.join(", ")}` : ""),
      );
    }
    console.log("\nUntil this succeeds the app falls back to mock replies.\n");
    process.exit(1);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let chunks = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line || line.startsWith(":") || !line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") break;
      try {
        const d = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (typeof d === "string" && d) {
          text += d;
          chunks++;
        }
      } catch {
        /* partial line */
      }
    }
  }

  if (!text.trim()) {
    bad("Stream returned no content.");
    process.exit(1);
  }
  ok(`Streaming works — ${chunks} chunk(s) received`);
  ok(`Model replied: "${text.trim().slice(0, 120)}"`);
  if (catalogMiss) {
    warn(`"${MODEL}" isn't in the public catalog, but the live call succeeded — the id is usable.`);
  }
  if (MODEL !== RAW_MODEL) {
    warn(`LLM_MODEL is "${RAW_MODEL}"; the app normalizes it to "${MODEL}". Update .env to match.`);
  }
  console.log("\n\x1b[32mAll checks passed — agent chat and brief generation will use this model.\x1b[0m\n");
}

main().catch((e) => {
  bad(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
