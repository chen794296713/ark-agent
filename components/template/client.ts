/**
 * Browser fetch helpers for the template API.
 *
 * They live here rather than in `lib/client-api.ts` because that file is the
 * integrator's; when the template vertical claims `lib/templates/`, this moves
 * there verbatim and `api.*` re-exports it. Nothing here is server code — no
 * `server-only`, no database, no environment read.
 *
 * The route is being built in parallel, so **not existing is a normal outcome**:
 * a 404 from the Next router is HTML, not JSON, and calling `res.json()` on it
 * throws a SyntaxError that would surface to the user as a blank page. Every
 * response is therefore parsed defensively and a failure becomes an error state,
 * never a crash.
 */
import type {
  TemplateDetailResponse,
  TemplateListResponse,
  TemplateSummaryDTO,
} from "./types";

export class TemplateApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TemplateApiError";
  }
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** The API's own error string when it sent one; never a provider message. */
function errorText(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error: unknown }).error;
    if (typeof e === "string" && e.length > 0 && e.length < 400) return e;
  }
  return fallback;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { accept: "application/json" } });
  } catch (e) {
    // A network failure and a route that does not exist yet are the same thing
    // to the user: the gallery could not load. `0` marks "never reached HTTP".
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new TemplateApiError("network", 0);
  }
  const body = await readJson(res);
  if (!res.ok) throw new TemplateApiError(errorText(body, `HTTP ${res.status}`), res.status);
  if (body === null) throw new TemplateApiError("malformed", res.status);
  return body as T;
}

export function fetchTemplates(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<TemplateListResponse> {
  return getJson<TemplateListResponse>(`/api/templates?${params.toString()}`, signal);
}

export function fetchTemplate(
  id: string,
  signal?: AbortSignal,
): Promise<TemplateDetailResponse> {
  return getJson<TemplateDetailResponse>(`/api/templates/${encodeURIComponent(id)}`, signal);
}

/**
 * `POST /api/templates/{id}/fork`. The server resets visibility, origin and
 * `use_count` and re-runs the linter — a fork of another tenant's template is an
 * import of third-party content, so the client sends nothing but an optional
 * name and trusts none of what comes back beyond the DTO shape.
 */
export async function forkTemplate(
  id: string,
  name?: string,
): Promise<{ template: TemplateSummaryDTO }> {
  let res: Response;
  try {
    res = await fetch(`/api/templates/${encodeURIComponent(id)}/fork`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(name ? { name } : {}),
    });
  } catch {
    throw new TemplateApiError("network", 0);
  }
  const body = await readJson(res);
  if (!res.ok) throw new TemplateApiError(errorText(body, `HTTP ${res.status}`), res.status);
  if (body === null) throw new TemplateApiError("malformed", res.status);
  return body as { template: TemplateSummaryDTO };
}

/** Clipboard access is a permission and throws when denied; a failed copy is a
 *  silent no-op rather than an error dialog over a template id. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
