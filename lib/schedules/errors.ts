import "server-only";
/**
 * One `ScheduleError` -> HTTP mapping, shared by POST, PATCH and the run list.
 *
 * Marked `server-only` because it builds a NextResponse; every other module in
 * `lib/schedules/**` is client-safe and the editor imports several of them on
 * every keystroke, so the boundary is worth stating rather than assuming.
 *
 * The status split is not cosmetic: a limit is a CONFLICT with the workspace's
 * current state (409, retryable after deleting something), while everything else
 * is an UNPROCESSABLE input (422, retryable only after editing the request). A
 * client that retries a 409 unchanged is doing something reasonable; one that
 * retries a 422 unchanged is looping.
 *
 * Two strings come back, and they are for two different readers. `error` is the
 * user's, in the user's language, from `lib/i18n/schedules.ts`. `reason` is the
 * developer's — "Expected 5 fields, got 6", which `lib/schedule/cron.ts` writes
 * in English and which is far too specific to throw away. Returning only the
 * second, as this did, ships English to a zh/zht/ja user on the one screen where
 * the message is the entire product.
 */
import { apiError } from "@/lib/api";
import { scheduleErrorText } from "@/lib/i18n/schedules";
import type { Lang } from "@/lib/types";
import { ScheduleError } from "@/lib/services/schedules";

export function scheduleErrorResponse(e: unknown, lang: Lang = "en") {
  if (e instanceof ScheduleError) {
    const status = e.code === "schedule_limit_reached" ? 409 : 422;
    return apiError(scheduleErrorText(e.code, lang), status, {
      code: e.code,
      reason: e.message,
      ...(e.detail ?? {}),
    });
  }
  console.error("[schedules] unexpected error", e);
  return apiError(scheduleErrorText("unknown", lang), 500, { code: "unknown" });
}
