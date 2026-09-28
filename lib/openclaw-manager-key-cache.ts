/**
 * Process-local API-key cache for OpenClaw Manager.
 *
 * Next.js can execute many requests concurrently in one server process. The
 * in-flight map makes a cache miss for the same identity perform exactly one
 * key exchange, while different users retain isolated cache entries.
 */
export class OpenClawManagerKeyCache {
  private readonly keys = new Map<string, string>();
  private readonly refreshes = new Map<string, Promise<string>>();

  get(cacheKey: string): string | null {
    return this.keys.get(cacheKey) ?? null;
  }

  async getOrRefresh(
    cacheKey: string,
    load: () => Promise<string>,
    staleKey?: string,
  ): Promise<string> {
    const cached = this.keys.get(cacheKey) ?? null;

    // Normal cache hit: no network exchange is necessary.
    if (staleKey === undefined && cached) return cached;

    // A concurrent request already replaced the credential that failed for
    // this caller. Reuse the winner instead of rotating the key again.
    if (staleKey !== undefined && cached && cached !== staleKey) return cached;

    // A 401 explicitly invalidates the exact credential that was sent.
    if (staleKey !== undefined && cached === staleKey) {
      this.keys.delete(cacheKey);
    }

    const pending = this.refreshes.get(cacheKey);
    if (pending) return pending;

    const refresh = load()
      .then((apiKey) => {
        const normalized = apiKey.trim();
        if (!normalized) {
          throw new Error("OpenClaw Manager returned an empty API key");
        }
        this.keys.set(cacheKey, normalized);
        return normalized;
      })
      .finally(() => {
        this.refreshes.delete(cacheKey);
      });

    this.refreshes.set(cacheKey, refresh);
    return refresh;
  }
}
