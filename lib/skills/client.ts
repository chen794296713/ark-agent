/**
 * Browser fetch helpers for the skills catalogue.
 *
 * Plain async functions that call `fetch` and throw on `!ok`; the integrator
 * re-exports them from `lib/client-api.ts`. Nothing here imports a server module
 * and nothing here validates — the server is the authority on every filter rule,
 * and a second copy of them in the browser is a second place for them to drift.
 *
 * The query string is built from a FIXED key list rather than from
 * `useSearchParams()`. The drawer puts `?skill=<publicId>` in the same URL bar
 * the filters live in, and a page that forwarded the whole search string would
 * be sending the server a parameter it never declared — reported back as an
 * ignored filter on every single request, which trains the operator to ignore
 * the one notice that means something.
 */
import type { Harness } from "@/lib/harness";
import type {
  SkillCardDTO,
  SkillCategory,
  SkillDTO,
  SkillFacets,
  SkillFormat,
  SkillRisk,
} from "./types";
import type { SkillSort } from "./validation";

export class SkillApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SkillApiError";
  }
}

async function request<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", headers: { accept: "application/json" } });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const b = (body ?? {}) as Record<string, unknown>;
    throw new SkillApiError(
      res.status,
      typeof b.error === "string" ? b.error : `Request failed (${res.status})`,
      typeof b.code === "string" ? b.code : undefined,
      b,
    );
  }
  return body as T;
}

/** Exactly the filters the page can set. Anything absent is the server's default. */
export interface SkillBrowseFilters {
  q?: string;
  categories?: SkillCategory[];
  risks?: SkillRisk[];
  harnesses?: Harness[];
  formats?: SkillFormat[];
  sources?: string[];
  verifiedOnly?: boolean;
  includeHigh?: boolean;
  sort?: SkillSort;
  page?: number;
  perPage?: number;
  agentId?: string | null;
}

export interface SkillSourceRef {
  id: string;
  name: string;
  trust: string;
  homepageUrl: string;
}

export interface SkillBrowseResponse {
  items: SkillCardDTO[];
  page: number;
  perPage: number;
  total: number;
  facets: SkillFacets;
  hiddenByRisk: number;
  hiddenByVerification: number;
  ignoredFilters: string[];
  sources: SkillSourceRef[];
}

/**
 * Repeated keys, not comma joins. Both spellings parse server-side, and
 * `?category=a&category=b` survives a value that ever grows a comma without the
 * two sides having to agree on an escape.
 */
export function skillQuery(f: SkillBrowseFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  for (const v of f.categories ?? []) p.append("category", v);
  for (const v of f.risks ?? []) p.append("risk", v);
  for (const v of f.harnesses ?? []) p.append("harness", v);
  for (const v of f.formats ?? []) p.append("format", v);
  for (const v of f.sources ?? []) p.append("source", v);
  if (f.verifiedOnly) p.set("verifiedOnly", "1");
  if (f.includeHigh) p.set("includeHigh", "1");
  if (f.sort && f.sort !== "popularity") p.set("sort", f.sort);
  if (f.page && f.page > 1) p.set("page", String(f.page));
  if (f.perPage) p.set("perPage", String(f.perPage));
  if (f.agentId) p.set("agentId", f.agentId);
  return p.toString();
}

export function fetchSkills(f: SkillBrowseFilters = {}): Promise<SkillBrowseResponse> {
  const qs = skillQuery(f);
  return request(`/api/skills${qs ? `?${qs}` : ""}`);
}

export function fetchSkill(key: string, agentId?: string | null): Promise<{ skill: SkillDTO }> {
  const qs = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
  return request(`/api/skills/${encodeURIComponent(key)}${qs}`);
}
