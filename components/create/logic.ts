/**
 * The pure half of the AI-guided creation flow.
 *
 * Everything here is a function of its arguments: no React, no DOM, no fetch,
 * no module-level mutable state. That is deliberate — the SSE framing, the
 * six-section readiness rules, the upload gate and the cron<->preset mapping
 * are the parts that are worth testing without a browser, and the components
 * are then thin enough to read.
 *
 * Two rules this module exists to enforce:
 *
 *  1. **Third-party text is data.** Skill descriptions, model-authored titles
 *     and user file names all reach the screen through `sanitizeUntrusted`,
 *     which strips the invisible bidi and control characters that let a
 *     filename render as something it is not. React escapes markup; it does
 *     not defend against U+202E.
 *  2. **The client never widens a limit.** `acceptFile` mirrors the server's
 *     allowlist and ceiling so the user learns about a rejection before the
 *     upload, never instead of it — §6.6 and the upload route own the real
 *     check, including magic-byte sniffing.
 */
import type {
  AgentTemplateDraft,
  DraftStageTrace,
  StageId,
  StageOutcome,
  TemplateSchedule,
} from "@/lib/atg/types";
import { CONFIDENCE_FLOOR } from "@/lib/schedule/parse";
import { cronError, isValidCron, nextRuns, offsetMinutes, runsBetween } from "@/lib/schedule/cron";
import type { Lang } from "@/lib/types";
import { BCP47 } from "@/lib/i18n";
import type { SectionKeyName } from "@/lib/i18n/create";

// ---------------------------------------------------------------------------
// The SSE contract (docs/AGENT_TEMPLATE_GENERATOR.md §9.1)
// ---------------------------------------------------------------------------

/** The section names that stream as their own frame. `agents` is NOT one of
 *  them — the draft's agents are produced inside charter/assemble and arrive
 *  whole in `done`, so the AGENT card renders a skeleton until then. */
export type StreamedSection =
  | "meta"
  | "roles"
  | "skills"
  | "boundaries"
  | "context"
  | "schedules";

export type GenerationMode = "llm" | "hybrid" | "deterministic";

export type GenerateEvent =
  | { type: "start"; generationId: string; mode: GenerationMode; stages: StageId[] }
  | { type: "stage"; stage: StageId; index: number; total: number; label: string }
  | { type: "stage_done"; stage: StageId; outcome: StageOutcome; durationMs: number }
  | { type: "section"; section: StreamedSection; value: unknown }
  | { type: "warning"; warning: unknown }
  | {
      type: "done";
      generationId: string;
      status: "ready" | "needs_review";
      draft: AgentTemplateDraft;
    }
  | { type: "error"; message: string; code: string; generationId: string | null };

const EVENT_TYPES = new Set([
  "start",
  "stage",
  "stage_done",
  "section",
  "warning",
  "done",
  "error",
]);

export interface SseParseResult {
  events: GenerateEvent[];
  /** The tail that has not yet been terminated by a blank line. Feed it back in. */
  rest: string;
  /** Frames that were not parseable JSON or carried an unknown `type`. */
  discarded: number;
}

/**
 * Incremental SSE parser for the `fetch` + `ReadableStream` transport.
 *
 * `EventSource` cannot POST, so the generate stream is read by hand and the
 * framing has to be done here. Three things this gets right that a naive
 * `split("\n\n")` does not: a `: ping` keep-alive comment is a frame with no
 * data and must not produce an event; a frame may carry several `data:` lines
 * that concatenate with a newline; and a chunk boundary can land mid-frame, so
 * the unterminated tail is handed back rather than parsed.
 */
export function parseSseChunk(buffer: string): SseParseResult {
  // Normalise CRLF first: a proxy that rewrites line endings would otherwise
  // leave a stray \r on every JSON payload.
  const normalized = buffer.replace(/\r\n/g, "\n");
  const events: GenerateEvent[] = [];
  let discarded = 0;
  let cursor = 0;

  for (;;) {
    const boundary = normalized.indexOf("\n\n", cursor);
    if (boundary === -1) break;
    const frame = normalized.slice(cursor, boundary);
    cursor = boundary + 2;

    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith(":")) continue; // keep-alive comment
      if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (data.length === 0) continue;

    const payload = data.join("\n");
    if (payload === "[DONE]") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      discarded++;
      continue;
    }
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      typeof (parsed as { type: unknown }).type === "string" &&
      EVENT_TYPES.has((parsed as { type: string }).type)
    ) {
      events.push(parsed as GenerateEvent);
    } else {
      discarded++;
    }
  }
  return { events, rest: normalized.slice(cursor), discarded };
}

// ---------------------------------------------------------------------------
// Stage ledger
// ---------------------------------------------------------------------------

/**
 * Whether a JSON blob from `GET /api/templates/generations/{id}` is shaped
 * enough to render.
 *
 * The polling transport hands back `response.json()` with no runtime schema
 * behind it, and every consumer below indexes `draft.roles`, `draft.skills`,
 * `draft.provenance.warnings` and so on. One missing array from a half-written
 * row is the difference between "needs review" and a white screen, so the
 * screens ask this first and treat a `false` as "still generating".
 */
export function isDraftLike(value: unknown): value is AgentTemplateDraft {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  const arrays = ["roles", "agents", "skills", "context", "schedules"];
  if (!arrays.every((k) => Array.isArray(d[k]))) return false;
  if (typeof d.meta !== "object" || d.meta === null) return false;
  const b = d.boundaries as Record<string, unknown> | null | undefined;
  if (typeof b !== "object" || b === null || !Array.isArray(b.rules)) return false;
  const p = d.provenance as Record<string, unknown> | null | undefined;
  if (typeof p !== "object" || p === null) return false;
  return Array.isArray(p.warnings) && Array.isArray(p.stages);
}

export type StageStatus = "pending" | "active" | "done" | "failed";

export interface StageRow {
  stage: StageId;
  status: StageStatus;
  outcome: StageOutcome | null;
  durationMs: number | null;
}

/**
 * The ledger the GENERATING screen draws, derived from the stage list the
 * server sent in `start` plus whatever `stage`/`stage_done` frames have landed.
 * Server-driven on purpose: adding a stage upstream must not need a client
 * release, so we render whatever ids we are given, in the order given.
 */
export function stageRows(
  stages: readonly StageId[],
  seen: ReadonlyMap<StageId, { outcome: StageOutcome | null; durationMs: number | null }>,
  active: StageId | null,
): StageRow[] {
  return stages.map((stage) => {
    const record = seen.get(stage);
    if (record) {
      return {
        stage,
        status: record.outcome === "failed" ? "failed" : "done",
        outcome: record.outcome,
        durationMs: record.durationMs,
      };
    }
    return {
      stage,
      status: stage === active ? "active" : "pending",
      outcome: null,
      durationMs: null,
    };
  });
}

/**
 * The stages the pipeline reasons about when a model is available. `intake`,
 * `assemble`, `lint` and `finalize` are deterministic BY DESIGN (§2) — they
 * never call a model in any mode.
 */
const MODEL_STAGES: ReadonlySet<StageId> = new Set<StageId>([
  "charter",
  "capabilities",
  "skills",
  "boundaries",
  "context",
  "schedules",
]);

/**
 * Stages that ran on rules rather than a model — named in the `hybrid` banner,
 * because "partly AI" with no detail is worse than either extreme.
 *
 * Restricted to `MODEL_STAGES`: filtering on `engine === "rules"` alone put the
 * four always-deterministic stages in the banner, so an otherwise perfect run
 * announced "two steps fell back to rules — Reading your brief, Safety check",
 * which is both false and unactionable.
 */
export function fallbackStages(traces: readonly DraftStageTrace[]): StageId[] {
  return traces
    .filter(
      (t) =>
        MODEL_STAGES.has(t.stage) &&
        (t.outcome === "fallback" || (t.engine !== "llm" && t.engine !== "mixed")),
    )
    .map((t) => t.stage);
}

// ---------------------------------------------------------------------------
// Six-section readiness
// ---------------------------------------------------------------------------

export const SECTION_KEYS: readonly SectionKeyName[] = [
  "roles",
  "agents",
  "skills",
  "boundaries",
  "context",
  "schedules",
] as const;

export type SectionState = "ok" | "review" | "empty";

/** Whether the agent runtime can vouch for a skill's harness compatibility. */
export type ManagerMode = "live" | "mock" | "unconfigured";

/**
 * Three states, not two — `unknown` is neither a tick nor a cross (§C.3.1).
 * With no Manager configured nothing can be asserted against a real machine,
 * so every skill collapses to `unknown` regardless of what the draft claims.
 */
export type CompatState = "ok" | "no" | "unknown";

export function compatState(
  skill: { harnessCompatible: boolean; requirements?: unknown },
  managerMode: ManagerMode,
): CompatState {
  if (managerMode !== "live") return "unknown";
  return skill.harnessCompatible ? "ok" : "no";
}

/**
 * The gutter's per-section verdict. `empty` and `review` are different answers:
 * an empty CONTEXT section is a nudge, a skill that cannot run is a defect.
 */
export function sectionState(
  draft: AgentTemplateDraft,
  key: SectionKeyName,
  managerMode: ManagerMode = "unconfigured",
): SectionState {
  switch (key) {
    case "roles": {
      if (draft.roles.length === 0) return "empty";
      return draft.roles.some((r) => !r.title.trim() || !r.mission.trim())
        ? "review"
        : "ok";
    }
    case "agents": {
      if (draft.agents.length === 0) return "empty";
      const broken = draft.agents.some((a) => !a.name.trim() || !a.brief.trim());
      const noPrimary = !draft.agents.some((a) => a.isPrimary);
      return broken || noPrimary ? "review" : "ok";
    }
    case "skills": {
      if (draft.skills.length === 0) return "empty";
      // A high-risk skill cannot be attached from this screen at all, and an
      // unverified one is an open question the user is entitled to see.
      const needsAttention = draft.skills.some(
        (s) => s.riskLevel === "high" || compatState(s, managerMode) !== "ok",
      );
      return needsAttention ? "review" : "ok";
    }
    case "boundaries": {
      const b = draft.boundaries;
      if (b.rules.length === 0) return "empty";
      // ATG-L: an agent that acts on its own with no daily ceiling has no
      // circuit breaker at all, which is the one combination worth blocking on.
      const uncapped = b.autonomy === "auto" && b.dailyActionLimit === 0;
      return uncapped || b.rules.length < 3 ? "review" : "ok";
    }
    case "context": {
      if (draft.context.length === 0) return "empty";
      const incomplete = draft.context.some((item) => {
        // A model-authored link-local URL is an SSRF payload we would ship
        // inside the template, so it is a defect whether or not the item is
        // marked required — `required` only governs "the user still owes us
        // a file", which is a different question.
        if (item.kind === "url") return !item.url || !isSafePublicHttpsUrl(item.url);
        if (item.kind === "pasted_text") return item.required && !item.body?.trim();
        return false;
      });
      return incomplete ? "review" : "ok";
    }
    case "schedules": {
      if (draft.schedules.length === 0) return "empty";
      const shaky = draft.schedules.some(
        (s) => !isValidCron(s.cron) || s.confidence < CONFIDENCE_FLOOR,
      );
      return shaky ? "review" : "ok";
    }
  }
}

export function sectionStates(
  draft: AgentTemplateDraft,
  managerMode: ManagerMode = "unconfigured",
): Record<SectionKeyName, SectionState> {
  return Object.fromEntries(
    SECTION_KEYS.map((k) => [k, sectionState(draft, k, managerMode)]),
  ) as Record<SectionKeyName, SectionState>;
}

/** How many of the six want a second look. `empty` counts — an agent with no
 *  rules and no context is the most common way this product disappoints. */
export function reviewCount(states: Record<SectionKeyName, SectionState>): number {
  return SECTION_KEYS.filter((k) => states[k] !== "ok").length;
}

export type Confidence = "high" | "medium" | "low";

/**
 * One honest number for the whole draft. Deterministic drafts are capped at
 * `medium` no matter how clean they look: a keyword match that happened to
 * land is not the same as a reasoned answer, and saying otherwise is the lie
 * this banner exists to prevent.
 */
export function draftConfidence(draft: AgentTemplateDraft): Confidence {
  const { mode, warnings } = draft.provenance;
  const errors = warnings.filter((w) => w.severity === "error" && !w.remediated).length;
  if (errors > 0) return "low";
  if (mode === "deterministic") return "medium";
  const warns = warnings.filter((w) => w.severity === "warn" && !w.remediated).length;
  if (mode === "hybrid" || warns > 2) return "medium";
  return "high";
}

// ---------------------------------------------------------------------------
// Untrusted text
// ---------------------------------------------------------------------------

/**
 * Bidi overrides and isolates. A file called
 * a file whose name embeds U+202E renders reversed in every browser, and the
 * same trick works on a model-authored skill name. Stripped, not escaped —
 * there is no legitimate use for an unbalanced override in a display string.
 */
const BIDI = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
/** C0/C1 controls minus tab/newline, plus the zero-width family. */
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g;

/**
 * Make an arbitrary third-party string safe to render as a text node.
 * React already escapes markup; this handles what it does not — invisible
 * reordering, control characters, and a "name" that is really a paragraph.
 */
export function sanitizeUntrusted(input: string, max = 200): string {
  const cleaned = input
    .replace(BIDI, "")
    .replace(CONTROLS, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, Math.max(0, max - 1))}…`;
}

/** Same treatment, but newlines survive — for a textarea's value. */
export function sanitizeMultiline(input: string, max = 8000): string {
  const cleaned = input.replace(BIDI, "").replace(CONTROLS, "");
  return cleaned.length <= max ? cleaned : cleaned.slice(0, max);
}

/** One-line clamp of the user's own brief for the GENERATING header. */
export function briefLine(brief: string, max = 120): string {
  return sanitizeUntrusted(brief, max);
}

// ---------------------------------------------------------------------------
// Context uploads
// ---------------------------------------------------------------------------

/**
 * Mirrors `CONTEXT_MIME_ALLOWLIST` in docs/AGENT_TEMPLATE_GENERATOR.md §6.6.
 * Declared here rather than imported because `lib/atg/safety.ts` is owned by
 * the pipeline vertical and may not exist yet; the upload route re-checks by
 * magic bytes regardless, so this copy is a courtesy to the user, never a
 * control. If the two ever disagree, the server wins.
 */
export const CONTEXT_MIME_ALLOWLIST = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/html",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
] as const;

export type ContextMime = (typeof CONTEXT_MIME_ALLOWLIST)[number];

/** Extension → mime, for the (common) case where the browser reports "" or
 *  `application/octet-stream` for .md and .csv. */
const EXT_MIME: Record<string, ContextMime> = {
  pdf: "application/pdf",
  txt: "text/plain",
  text: "text/plain",
  log: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  htm: "text/html",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** What the file picker's `accept` attribute offers. A convenience, never the
 *  control — §C.3.3 is explicit that the server owns validation. */
export const CONTEXT_ACCEPT = [
  ...CONTEXT_MIME_ALLOWLIST,
  ...Object.keys(EXT_MIME).map((e) => `.${e}`),
].join(",");

/** Short, human list of what may be dropped. */
export const CONTEXT_TYPE_LABEL = "PDF · DOCX · XLSX · TXT · MD · CSV · JSON · PNG · JPG";

/** Platform ceiling per item (§2.6). A template may set something tighter. */
export const PLATFORM_MAX_BYTES = 20_000_000;
/** `TemplateContextItem.maxBytes` default (§3.6). */
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
/** Per-agent quota (§E.4). Shown as remaining, not as a per-drop cap. */
export const AGENT_CONTEXT_MAX_ITEMS = 50;
export const AGENT_CONTEXT_MAX_BYTES = 100_000_000;
/** Above this a text file is uploaded rather than inlined — `text_body` is
 *  capped at 8000 chars by the draft schema. */
export const INLINE_TEXT_MAX_CHARS = 8000;

/** Text types small enough to read straight into a `pasted_text` item, which
 *  saves the user an upload round trip they cannot make until the agent exists. */
const INLINEABLE: ReadonlySet<string> = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

export function isInlineableMime(mime: string): boolean {
  return INLINEABLE.has(mime);
}

/** Resolve a usable mime from what the browser claims plus the extension. */
export function resolveMime(fileName: string, declared: string): ContextMime | null {
  const normalized = declared.split(";")[0]!.trim().toLowerCase();
  if ((CONTEXT_MIME_ALLOWLIST as readonly string[]).includes(normalized)) {
    return normalized as ContextMime;
  }
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return null;
  return EXT_MIME[fileName.slice(dot + 1).toLowerCase()] ?? null;
}

export type RejectionCode = "type" | "size" | "quota" | "empty" | "duplicate";

export interface FileCandidate {
  name: string;
  type: string;
  size: number;
}

export interface AcceptOptions {
  /** Effective per-item ceiling for THIS draft — min of the template's and the platform's. */
  maxBytes: number;
  usedBytes: number;
  itemCount: number;
  /** Already-listed titles, compared after sanitising so a bidi-disguised
   *  duplicate is still a duplicate. */
  existingTitles: readonly string[];
}

export type AcceptResult =
  | { ok: true; mime: ContextMime; title: string }
  | { ok: false; code: RejectionCode; mime: ContextMime | null; title: string };

/**
 * Everything the browser can honestly check before an upload starts. The order
 * matters: a 40 MB `.exe` should be rejected for being an `.exe`, because that
 * is the answer that tells the user something.
 */
export function acceptFile(file: FileCandidate, opts: AcceptOptions): AcceptResult {
  const title = sanitizeUntrusted(file.name, 80) || "untitled";
  const mime = resolveMime(file.name, file.type);
  if (!mime) return { ok: false, code: "type", mime: null, title };
  if (file.size <= 0) return { ok: false, code: "empty", mime, title };
  const ceiling = Math.min(opts.maxBytes, PLATFORM_MAX_BYTES);
  if (file.size > ceiling) return { ok: false, code: "size", mime, title };
  if (
    opts.itemCount >= AGENT_CONTEXT_MAX_ITEMS ||
    opts.usedBytes + file.size > AGENT_CONTEXT_MAX_BYTES
  ) {
    return { ok: false, code: "quota", mime, title };
  }
  if (opts.existingTitles.some((t) => sanitizeUntrusted(t, 80) === title)) {
    return { ok: false, code: "duplicate", mime, title };
  }
  return { ok: true, mime, title };
}

/** IEC units, localised for grouping only — "MB" is read the same everywhere. */
export function formatBytes(bytes: number, lang: Lang = "en"): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toLocaleString(BCP47[lang], {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })} ${units[unit]}`;
}

/**
 * Normalise every spelling of an IPv4 literal a resolver accepts into four
 * octets, or null when the host is not one. Exported for the tests: the
 * alternate radixes are the part of this that is easy to get wrong.
 */
export function ipv4Octets(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (part === "") return null;
    let n: number;
    if (/^0[xX][0-9a-fA-F]{1,8}$/.test(part)) n = parseInt(part.slice(2), 16);
    else if (/^0[0-7]{1,11}$/.test(part)) n = parseInt(part.slice(1), 8);
    else if (/^\d{1,10}$/.test(part)) n = Number(part);
    else return null;
    if (!Number.isSafeInteger(n) || n < 0) return null;
    nums.push(n);
  }
  // In every spelling the LAST part absorbs the octets the others did not
  // supply: "127.1" is 127.0.0.1, "2130706433" is all four at once.
  const last = nums.pop()!;
  if (nums.some((n) => n > 255)) return null;
  const remaining = 4 - nums.length;
  if (last >= 256 ** remaining) return null;
  const octets = [...nums];
  for (let i = remaining - 1; i >= 0; i--) octets.push((last / 256 ** i) & 0xff);
  return octets;
}

/**
 * The eight 16-bit groups of an IPv6 literal, or null when it is not one.
 *
 * Hand-expanded rather than pattern-matched on the source text because `URL`
 * normalises `[::ffff:169.254.169.254]` to `[::ffff:a9fe:a9fe]` — the dotted
 * quad is GONE by the time `hostname` is read, so looking for a trailing "."
 * finds nothing and waves the metadata endpoint straight through.
 */
export function ipv6Groups(host: string): number[] | null {
  if (!host.includes(":")) return null;
  let text = host;
  // A trailing dotted quad occupies the last two groups.
  let tail: number[] = [];
  const lastColon = text.lastIndexOf(":");
  const quad = text.slice(lastColon + 1);
  if (quad.includes(".")) {
    const octets = ipv4Octets(quad);
    if (!octets) return null;
    tail = [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
    text = text.slice(0, lastColon + 1);
    if (text.endsWith("::")) text = text.slice(0, -1);
    else text = text.slice(0, -1);
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const group of part.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  if (!head || !rest) return null;
  const fixed = [...head, ...rest, ...tail];
  if (halves.length === 1) return fixed.length === 8 ? fixed : null;
  if (fixed.length > 7) return null;
  const zeros = new Array<number>(8 - fixed.length).fill(0);
  return [...head, ...zeros, ...rest, ...tail];
}

/**
 * Whether a URL is one we would persist as "go fetch this".
 *
 * ArkAgent never fetches it — the runtime's egress sandbox does — but a
 * template is a stored instruction, so shipping `http://169.254.169.254/…` in
 * one is shipping an SSRF payload with our name on it. Deliberately strict and
 * deliberately duplicated on the server.
 *
 * Strictness that is NOT optional, and that a dotted-quad regex misses: a
 * resolver accepts `2130706433`, `0177.0.0.1`, `0x7f.1` and `127.1` as spellings
 * of 127.0.0.1, and `::ffff:169.254.169.254` as a spelling of the metadata
 * endpoint. Anything numeric is therefore normalised through `ipv4Octets`
 * before the range check, and a single-label host (`intranet`, `localhost`) is
 * refused outright — it can only resolve through a search domain, i.e. inside
 * someone's network.
 */
export function isSafePublicHttpsUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  // A trailing dot is the same name to a resolver and a different string here.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return false;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa") ||
    host.endsWith(".in-addr.arpa")
  ) {
    return false;
  }

  // IPv6 first: it is the only host that legitimately contains a colon, and an
  // IPv4-mapped form has to be unwrapped before the v4 ranges mean anything.
  if (host.includes(":")) {
    const g = ipv6Groups(host);
    // An address we cannot parse is one we cannot vouch for. Refuse it.
    if (!g) return false;
    if (g.every((x) => x === 0)) return false; // ::
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1
    if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique-local
    if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
    if ((g[0] & 0xff00) === 0xff00) return false; // ff00::/8 multicast
    // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible) are IPv4 in disguise.
    const mappedish =
      g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0x0000);
    if (mappedish) {
      return isPublicV4([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff]);
    }
    return true;
  }

  const octets = ipv4Octets(host);
  if (octets) return isPublicV4(octets);

  // A name with no dot resolves only through a search domain — i.e. to a host
  // on whoever runs the agent's own network. Never a legitimate template URL.
  return host.includes(".");
}

/** RFC 1918 / 6598 / 5735 / 3927 and the multicast+reserved top of the space. */
function isPublicV4(octets: number[] | null): boolean {
  if (!octets || octets.length !== 4) return false;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false; // 192.0.0.0/24 protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a >= 224) return false; // multicast, reserved, 255.255.255.255
  return true;
}

// ---------------------------------------------------------------------------
// Schedules: the cron <-> preset mapping
// ---------------------------------------------------------------------------

export type WhenPreset = "daily" | "weekdays" | "weekly" | "custom";

export interface ScheduleShape {
  preset: WhenPreset;
  /** 0=Sun … 6=Sat. Only meaningful for `weekly` / `custom`. */
  days: number[];
  hour: number;
  minute: number;
  /** Minutes between fires, or null for a single daily time. */
  repeatEvery: number | null;
  /** Window for the repeat, as whole hours. `to` is exclusive of its own hour. */
  repeatFrom: number;
  repeatTo: number;
}

export const DEFAULT_SHAPE: ScheduleShape = {
  preset: "weekdays",
  days: [1, 2, 3, 4, 5],
  hour: 8,
  minute: 30,
  repeatEvery: null,
  repeatFrom: 9,
  repeatTo: 18,
};

function dowField(shape: ScheduleShape): string {
  if (shape.preset === "daily") return "*";
  if (shape.preset === "weekdays") return "1-5";
  const days = [...new Set(shape.days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  return days.length === 0 || days.length === 7 ? "*" : days.join(",");
}

/**
 * The presets write cron; ADVANCED is the only place a user types it.
 *
 * "Repeat every N minutes between A and B" encodes as a step minute field
 * ("slash N") over an hour range, NOT
 * as a second schedule kind — `agent_schedules` has a CHECK that is satisfied
 * by `cron_expr`, and inventing `kind = 'interval'` here would fail it.
 */
export function cronFromShape(shape: ScheduleShape): string {
  const dow = dowField(shape);
  if (shape.repeatEvery && shape.repeatEvery >= 1 && shape.repeatEvery <= 59) {
    const from = clampHour(shape.repeatFrom);
    // `repeatTo` is EXCLUSIVE, so its ceiling is 24, not 23. Clamping it with
    // clampHour() turned a round-the-clock window into `0-22` and silently
    // dropped the 23:00 hour from every all-day interval schedule.
    const to = clampEndHour(shape.repeatTo);
    if (from === 0 && to >= 24) return `*/${shape.repeatEvery} * * * ${dow}`;
    // An end hour at or before the start means "just that hour", not "wrap
    // around midnight" — wrapping would silently run the agent all night.
    const hours = to > from ? `${from}-${to - 1}` : `${from}`;
    return `*/${shape.repeatEvery} ${hours} * * ${dow}`;
  }
  return `${clampMinute(shape.minute)} ${clampHour(shape.hour)} * * ${dow}`;
}

function clampHour(h: number): number {
  return Math.min(23, Math.max(0, Math.trunc(h) || 0));
}
function clampEndHour(h: number): number {
  return Math.min(24, Math.max(1, Math.trunc(h) || 0));
}
function clampMinute(m: number): number {
  return Math.min(59, Math.max(0, Math.trunc(m) || 0));
}

/**
 * Back-fill the presets from a cron the user typed. Returns null when the
 * expression is valid but does not map onto a preset — the caller then leaves
 * `When` on `Custom` and shows the raw field, which is honest. Guessing a
 * preset that does not round-trip is how an editor silently rewrites a
 * schedule the user was happy with.
 */
export function shapeFromCron(expression: string): ScheduleShape | null {
  if (!isValidCron(expression)) return null;
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, month, dowRaw] = parts as [string, string, string, string, string];
  if ((dom !== "*" && dom !== "?") || month !== "*") return null;

  const dow = dowRaw === "?" ? "*" : dowRaw;
  let preset: WhenPreset;
  let days: number[];
  if (dow === "*") {
    preset = "daily";
    days = [0, 1, 2, 3, 4, 5, 6];
  } else if (dow === "1-5") {
    preset = "weekdays";
    days = [1, 2, 3, 4, 5];
  } else if (/^[0-7](,[0-7])*$/.test(dow)) {
    // 0 and 7 both mean Sunday; normalise so the day chips light up once.
    days = [...new Set(dow.split(",").map((d) => Number(d) % 7))].sort((a, b) => a - b);
    preset = days.length === 1 ? "weekly" : "custom";
  } else {
    return null;
  }

  const interval = /^\*\/([1-9]|[1-5]\d)$/.exec(min);
  if (interval) {
    const every = Number(interval[1]);
    const range = /^(\d{1,2})-(\d{1,2})$/.exec(hour);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from > 23 || to > 23 || to < from) return null;
      return { preset, days, hour: from, minute: 0, repeatEvery: every, repeatFrom: from, repeatTo: to + 1 };
    }
    if (/^\d{1,2}$/.test(hour) && Number(hour) <= 23) {
      const from = Number(hour);
      return { preset, days, hour: from, minute: 0, repeatEvery: every, repeatFrom: from, repeatTo: from + 1 };
    }
    if (hour === "*") {
      return { preset, days, hour: 0, minute: 0, repeatEvery: every, repeatFrom: 0, repeatTo: 24 };
    }
    return null;
  }

  if (!/^\d{1,2}$/.test(min) || !/^\d{1,2}$/.test(hour)) return null;
  const m = Number(min);
  const h = Number(hour);
  if (m > 59 || h > 23) return null;
  return { preset, days, hour: h, minute: m, repeatEvery: null, repeatFrom: 9, repeatTo: 18 };
}

/** `nextRuns` without the throw — an in-progress keystroke is not an error. */
export function safeNextRuns(
  expression: string,
  timeZone: string,
  count = 5,
  now: Date = new Date(),
): Date[] {
  try {
    return nextRuns(expression, now, timeZone, count);
  } catch {
    return [];
  }
}

/**
 * Which of the previewed runs sit next to a clock change in their own zone.
 *
 * Computed by comparing the UTC offset twelve hours either side of the run,
 * which is what makes it correct: adding milliseconds to an instant and
 * re-reading the wall clock gives five wrong dates once a year (RISKS R7).
 */
export function dstFlags(runs: readonly Date[], timeZone: string): boolean[] {
  const HALF_DAY = 12 * 60 * 60 * 1000;
  return runs.map((run) => {
    try {
      const before = offsetMinutes(new Date(run.getTime() - HALF_DAY), timeZone);
      const after = offsetMinutes(new Date(run.getTime() + HALF_DAY), timeZone);
      return before !== after;
    } catch {
      return false;
    }
  });
}

/** The cron validity message for the ADVANCED field, or null when it is fine. */
export function cronMessage(expression: string): string | null {
  return cronError(expression);
}

/**
 * A schedule the editor can write. `humanReadable` is deliberately NOT set
 * here — §C.3.4 requires it to be re-derived from `describeCron` on read, and
 * a stale sentence next to a changed cron is the exact bug the preview exists
 * to catch. The component fills it from `describeCron` at render time.
 */
export function scheduleFromShape(
  base: TemplateSchedule,
  shape: ScheduleShape,
  patch: Partial<TemplateSchedule> = {},
): TemplateSchedule {
  return { ...base, cron: cronFromShape(shape), ...patch };
}

/**
 * Bounded by the column (1..288); the generator never proposes above 96.
 *
 * `runsBetween`, not `nextRuns(…, 289)`: the latter walks forward until it has
 * 289 fire times whatever the horizon, so a weekly cron cost five years of
 * `Intl` work on every keystroke to answer "1". This stops at the 24h edge.
 */
export function runsPerDay(expression: string, timeZone: string, now = new Date()): number {
  try {
    const to = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const { runs, truncated } = runsBetween(expression, now, to, timeZone, 289);
    return truncated ? 289 : runs.length;
  } catch {
    return 0;
  }
}
