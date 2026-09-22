import "server-only";
import { apiError } from "@/lib/api";
import { mergeSettings } from "@/lib/agent-settings";
import type { Agent } from "@/lib/db/schema";
import type { AgentFacts, AgentStatus } from "./types";
import { ActivityQueryError } from "./validation";

/**
 * Shared plumbing for the five Activity route handlers, so the workspace guard
 * and the error mapping have one spelling rather than five.
 */

/**
 * Narrow an `agents` row to the facts the read layer needs.
 *
 * Passing this object around is the point: the row can only have come from
 * `getAgentRow(id, ctx.workspace.id)`, so possession of an `AgentFacts` is
 * proof that the workspace check already happened. Nothing downstream re-reads
 * the agent, and nothing downstream can accidentally be handed an id from the
 * URL instead.
 */
export function toAgentFacts(a: Agent): AgentFacts {
  return {
    id: a.id,
    name: a.name,
    status: a.status as AgentStatus,
    engine: a.engine,
    lastHeartbeatAt: a.lastHeartbeatAt,
    uptimeStartedAt: a.uptimeStartedAt,
    configRevision: a.configRevision,
    appliedConfigRevision: a.appliedConfigRevision,
    heartbeatMinutes: mergeSettings(a.settings).heartbeatMinutes,
  };
}

/**
 * Map a query-parse failure to its status, and anything else to a 500 with no
 * detail.
 *
 * The distinction matters both ways: a `bad_cursor` returned as a 500 tells the
 * client to retry an unfixable request, and a Postgres message returned as a
 * 400 leaks the enum's full value list — or worse, a column name — to any
 * signed-in user. `code` travels beside `error` so the UI can branch on it
 * without string-matching a translated sentence.
 */
export function activityErrorResponse(e: unknown) {
  if (e instanceof ActivityQueryError) {
    return apiError(e.message, e.status, { code: e.code });
  }
  console.error("[activity] query failed", e);
  return apiError("Failed to load activity", 500, { code: "internal_error" });
}
