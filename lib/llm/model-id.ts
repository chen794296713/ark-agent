/**
 * Model-id normalization — the one place a configured model id is turned into
 * the id the LLM endpoint actually accepts.
 *
 * Deliberately free of `import "server-only"` so both the server client
 * (lib/llm/openrouter.ts) and the plain `tsx` check script
 * (scripts/check-llm.ts) can share it instead of keeping two copies in sync.
 *
 * OpenRouter's own ids are `vendor/model` — `openai/gpt-5.6-luna` — optionally
 * with a variant suffix (`:free`, `:nitro`). Model directories, aggregator UIs
 * and multi-gateway configs habitually write the same model with a routing
 * prefix naming the gateway (`openrouter/openai/gpt-5.6-luna`), which
 * OpenRouter itself rejects with a 400. Both spellings name the same model, so
 * both are accepted here: the prefix is peeled and the API gets the id it
 * understands. That is a supported alias, not a misconfiguration, so it is not
 * worth a runtime warning — `npm run llm:check` reports it where it's
 * actionable.
 */

/** Gateway routing prefix that aggregators prepend. Matched case-insensitively. */
const ROUTING_PREFIX = "openrouter";

/** Segments a real id must keep: `vendor/model`. */
const MIN_SEGMENTS = 2;

/**
 * Normalize a model id to the form the endpoint expects.
 *
 * - `openrouter/openai/gpt-5.6-luna` → `openai/gpt-5.6-luna` (prefix peeled,
 *   repeatedly if doubled up, and case-insensitively).
 * - `openrouter/auto`, `openrouter/horizon-beta` → unchanged: with only two
 *   segments `openrouter` is the *vendor*, and these are real models.
 * - `openai/gpt-5.6-luna:free` → unchanged; variant suffixes ride along.
 * - `gpt-4o-mini` → unchanged: a bare id is valid against the plain
 *   OpenAI-compatible gateway an `OPENROUTER_BASE_URL` override may point at.
 * - Surrounding whitespace and stray/duplicated slashes are cleaned up; an id
 *   that is blank or slashes-only normalizes to `""` so callers can fall back.
 */
export function normalizeModelId(id: string): string {
  const segments = id
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  while (segments.length > MIN_SEGMENTS && segments[0].toLowerCase() === ROUTING_PREFIX) {
    segments.shift();
  }
  return segments.join("/");
}
