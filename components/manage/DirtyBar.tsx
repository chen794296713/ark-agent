"use client";

/**
 * The save/discard bar for the management surface — §E.3.
 *
 * Three jobs, and only three:
 *  1. Appear ONLY when something actually differs from server truth. The caller
 *     hands it `changedPaths` from `changedPaths(base, draft)`, so "dirty" means
 *     DIFFERENT, not TOUCHED: typing a character and typing it back leaves the bar
 *     hidden, which is the whole reason the diff is structural rather than a set of
 *     `onChange` flags.
 *  2. Refuse to save a config that cannot be valid, and say where the problem is
 *     rather than greying Save out with no explanation.
 *  3. Never let an edit disappear silently. A reload, a tab close and an in-app link
 *     all pass through the same guard, because a user who loses twenty minutes of
 *     rule-writing to a mis-click does not write them again.
 *
 * The outcome line distinguishes SAVED from PUSHED on purpose. ArkAgent is a control
 * plane: storing the configuration and getting the running machine to adopt it are
 * two different things that fail independently, and telling a user "saved" when the
 * agent is still running yesterday's rules is the single most expensive lie this
 * screen could tell.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { manage, mt } from "@/lib/i18n/manage";
import type { ManageDict } from "@/lib/i18n/manage";
import type { Lang } from "@/lib/types";
import { ConfirmDialog, LinkBtn } from "./primitives";
import { countBySection, totalOf } from "./logic";
import type { ErrorMap, FieldError } from "./logic";
import type { ManageSection } from "./types";

// ---------------------------------------------------------------------------
// Shared formatters
//
// These live in the save bar rather than in a new module because this vertical
// owns six files and none of them is a util drawer; the bar is where validation
// surfaces, so the renderer for a validation code belongs beside it. Every panel
// imports `errText` from here.
// ---------------------------------------------------------------------------

const LOCALES: Record<Lang, string> = {
  en: "en-US",
  zh: "zh-CN",
  zht: "zh-TW",
  ja: "ja-JP",
};

export function localeOf(lang: Lang): string {
  return LOCALES[lang] ?? "en-US";
}

/**
 * A `FieldError` rendered in the user's language. The optional `detail` is the
 * cron parser's own words — technical, untranslated, and appended rather than
 * substituted so the sentence a user can act on always comes first.
 */
export function errText(t: ManageDict, err: FieldError | undefined | null): string | null {
  if (!err) return null;
  const base = mt(t[err.code], err.params);
  return err.detail ? `${base} (${err.detail})` : base;
}

/**
 * The DOM id of the control at a dotted config path. One function, shared by the
 * panels that render the controls and by the page that focuses them: "go to the
 * first problem" is only truthful if both sides spell the id the same way.
 */
export function fieldDomId(path: string): string {
  return `cfg-${path.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

/** A date/time in the viewer's language, or the raw string if it will not parse. */
export function formatWhen(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(localeOf(lang), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(localeOf(lang), { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------

/** How far a save got. Storing the row and pushing it to the VM fail separately. */
export type SavePush = "pushed" | "unreachable" | "simulator" | "unimplemented";

export interface SaveOutcome {
  push: SavePush;
  /** ISO instant the save landed. */
  at: string;
}

export type SaveStatus = "idle" | "saving" | "failed" | "conflict";

const SECTION_KEY: Record<ManageSection, keyof ManageDict> = {
  rules: "secRules",
  skills: "secSkills",
  context: "secContext",
  schedules: "secSchedules",
};

const SECTION_ORDER: ManageSection[] = ["rules", "skills", "context", "schedules"];

export function DirtyBar({
  lang,
  agentName,
  changedPaths,
  errors,
  status = "idle",
  outcome = null,
  saveError = null,
  guardNavigation = true,
  onSave,
  onDiscard,
  onFocusProblem,
  onRetryPush,
  onReviewConflict,
  onOverwrite,
  onDismissConflict,
}: {
  lang: Lang;
  agentName: string;
  /** From `changedPaths(base, draft)` — the caller owns the diff, not this bar. */
  changedPaths: string[];
  errors: ErrorMap;
  status?: SaveStatus;
  outcome?: SaveOutcome | null;
  /** A server message for a failed save. Rendered as text. */
  saveError?: string | null;
  /** Off for a story/test harness that does its own routing. */
  guardNavigation?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /** Focus the control at this dotted path. The panels give their fields matching ids. */
  onFocusProblem?: (path: string) => void;
  onRetryPush?: () => void;
  onReviewConflict?: () => void;
  onOverwrite?: () => void;
  onDismissConflict?: () => void;
}) {
  const t = manage[lang];
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  // The conflict dialog must be escapable even when the caller forgot to pass a
  // dismiss handler. A modal with no way out is not a safety feature.
  const [conflictDismissed, setConflictDismissed] = useState(false);

  if (status !== "conflict" && conflictDismissed) setConflictDismissed(false);

  const counts = useMemo(() => countBySection(changedPaths), [changedPaths]);
  const total = totalOf(counts);
  const errorPaths = useMemo(() => Object.keys(errors).sort(), [errors]);
  const errorCount = errorPaths.length;
  const dirty = total > 0;
  const busy = status === "saving";

  const sectionNames = SECTION_ORDER.filter((s) => counts[s] > 0)
    .map((s) => t[SECTION_KEY[s]])
    .join(t.listSep);

  // ── guard 1: the browser. Reload, tab close, back out of the SPA entirely. ──
  useEffect(() => {
    if (!guardNavigation || !dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Browsers show their own wording; ours is only reachable in-app. Setting
      // both `preventDefault` and `returnValue` covers the two live conventions.
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [guardNavigation, dirty]);

  // ── guard 2: in-app links. `beforeunload` never fires for a client-side push,
  // so a plain <Link> out of the tab would drop the edit with no prompt at all.
  // Capture phase, and only for a same-origin left click the browser would have
  // handled itself — a modified click, a download and a new tab all still work.
  useEffect(() => {
    if (!guardNavigation || !dirty) return;
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // A hash on the current page is the §E.1 rail, not a navigation.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [guardNavigation, dirty]);

  const showOutcome = !dirty && outcome !== null;
  const visible = dirty || status === "failed" || status === "conflict" || showOutcome;

  return (
    <>
      {pendingHref !== null && (
        <ConfirmDialog
          title={t.leaveTitle}
          body={mt(t.leaveBody, { n: total })}
          confirmLabel={t.discardAndLeave}
          cancelLabel={t.keepEditing}
          danger
          onCancel={() => setPendingHref(null)}
          onConfirm={() => {
            const href = pendingHref;
            setPendingHref(null);
            onDiscard();
            if (href) router.push(href);
          }}
        />
      )}

      {status === "conflict" && !conflictDismissed && (
        <ConfirmDialog
          title={mt(t.conflictTitle, { name: agentName })}
          body={t.conflictBody}
          confirmLabel={t.overwrite}
          cancelLabel={t.cancel}
          danger
          extra={
            onReviewConflict ? (
              <div>
                <LinkBtn onClick={onReviewConflict}>{t.reviewDifferences}</LinkBtn>
              </div>
            ) : undefined
          }
          onCancel={() => {
            setConflictDismissed(true);
            onDismissConflict?.();
          }}
          onConfirm={() => (onOverwrite ? onOverwrite() : undefined)}
        />
      )}

      {visible && (
        <div
          role="region"
          aria-label={t.unsavedRegion}
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 40,
            marginTop: 18,
            background: c.glass,
            backdropFilter: "blur(10px)",
            border: `1px solid ${errorCount > 0 ? c.redBorder : dirty ? c.amber : c.border}`,
            borderRadius: r.radiusMd,
            padding: "13px 16px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            boxShadow: `0 8px 26px ${c.shadow}`,
          }}
        >
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            {dirty && (
              <div
                style={{
                  fontSize: 13.5,
                  color: c.text2,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  lineHeight: 1.5,
                }}
              >
                <span aria-hidden="true" style={{ color: c.amber }}>
                  ●
                </span>
                <span>
                  {mt(total === 1 ? t.unsavedOne : t.unsavedMany, {
                    n: total,
                    sections: sectionNames,
                  })}
                </span>
                {errorCount > 0 && (
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10.5,
                      letterSpacing: ".08em",
                      color: c.red,
                      border: `1px solid ${c.redBorder}`,
                      padding: "2px 6px",
                    }}
                  >
                    <span aria-hidden="true">▲ </span>
                    {mt(errorCount === 1 ? t.problemOne : t.problemMany, { n: errorCount })}
                  </span>
                )}
                {errorCount > 0 && onFocusProblem && (
                  <LinkBtn onClick={() => onFocusProblem(errorPaths[0]!)}>
                    {t.goToFirstProblem}
                  </LinkBtn>
                )}
              </div>
            )}

            {status === "failed" && (
              <div
                role="alert"
                style={{ fontSize: 13, color: c.red, marginTop: dirty ? 6 : 0, lineHeight: 1.5 }}
              >
                <span aria-hidden="true">▲ </span>
                {t.saveFailed}
                {saveError ? ` ${saveError}` : ""}
              </div>
            )}

            {showOutcome && outcome && (
              <SavedLine lang={lang} agentName={agentName} outcome={outcome} onRetry={onRetryPush} />
            )}
          </div>

          {dirty && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Btn
                type="button"
                onClick={onDiscard}
                disabled={busy}
                hoverStyle={busy ? undefined : { borderColor: c.borderMute, color: c.text }}
                style={{
                  border: `1px solid ${c.borderField}`,
                  background: "transparent",
                  color: busy ? c.faint : c.muted,
                  padding: "9px 16px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  borderRadius: r.radiusSm,
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                {t.discard}
              </Btn>
              <Btn
                type="button"
                onClick={onSave}
                disabled={busy || errorCount > 0}
                // The disabled reason is never colour-only: the problem badge and
                // the "go to the first problem" link above say why, in words.
                title={errorCount > 0 ? mt(t.problemMany, { n: errorCount }) : undefined}
                style={{
                  border: `1px solid ${busy || errorCount > 0 ? c.borderField : c.limeBorder}`,
                  background: busy || errorCount > 0 ? "transparent" : c.lime,
                  color: busy || errorCount > 0 ? c.faint : c.ink,
                  padding: "9px 18px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  borderRadius: r.radiusSm,
                  cursor: busy || errorCount > 0 ? "not-allowed" : "pointer",
                }}
              >
                {busy ? t.saving : t.saveAndResync}
              </Btn>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * "Saved" is not "the agent is running it". Each push state gets its own sentence
 * because the correct next action differs: wait, do nothing, or restart.
 */
function SavedLine({
  lang,
  agentName,
  outcome,
  onRetry,
}: {
  lang: Lang;
  agentName: string;
  outcome: SaveOutcome;
  onRetry?: () => void;
}) {
  const t = manage[lang];
  const [explained, setExplained] = useState(false);
  const unreachable = outcome.push === "unreachable";

  const line =
    outcome.push === "pushed"
      ? mt(t.savedPushed, { name: agentName, time: formatTime(outcome.at, lang) })
      : outcome.push === "simulator"
        ? t.savedSimulator
        : outcome.push === "unimplemented"
          ? mt(t.savedUnimplemented, { name: agentName })
          : mt(t.savedUnreachable, { name: agentName });

  return (
    <div role="status" aria-live="polite" style={{ fontSize: 13, lineHeight: 1.55 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          color: c.text2,
        }}
      >
        <span aria-hidden="true" style={{ color: unreachable ? c.amber : c.accent }}>
          {unreachable ? "▲" : "✓"}
        </span>
        <span>{line}</span>
        {unreachable && <span style={{ color: c.muted }}>{t.savedRetryHint}</span>}
        {unreachable && onRetry && <LinkBtn onClick={onRetry}>{t.retryNow}</LinkBtn>}
        {unreachable && (
          <LinkBtn onClick={() => setExplained((v) => !v)} ariaExpanded={explained}>
            {t.whatDoesThisMean}
          </LinkBtn>
        )}
      </div>
      {explained && (
        <div style={{ fontSize: 12.5, color: c.muted, marginTop: 6, maxWidth: 620 }}>
          {t.whatDoesThisMeanBody}
        </div>
      )}
    </div>
  );
}
