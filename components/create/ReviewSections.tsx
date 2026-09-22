"use client";

/**
 * C.3 REVIEW & EDIT — the six sections, tied together.
 *
 * The screen is one column of section cards plus a sticky readiness gutter.
 * Nothing here is committed: the draft lives in the caller's state until it
 * presses `Save as template` or `Continue`, so every control edits a plain
 * object and hands the whole thing back. `onChange` takes the WHOLE draft on
 * purpose — the cross-section joins (`agentKey`, `skillKeys`, `contextKeys`)
 * are exactly what a per-slice editor breaks.
 *
 * Three things this screen is responsible for saying out loud:
 *
 *  1. **Where the draft came from.** A deterministic draft is a keyword match,
 *     not a reasoned answer, and the banner says so in those words. §6 of the
 *     brief: everything must work with no `OPENROUTER_API_KEY`, and working
 *     silently is not the same as working honestly.
 *  2. **That model text is text.** Names, purposes and rules arrive from a
 *     model or a third-party catalogue. They are rendered through
 *     `sanitizeUntrusted` and never interpreted.
 *  3. **That everything is editable.** Generation is a starting point. Every
 *     field below is a real control, including the ones the model was sure of.
 *
 * This module also owns the small kit the six section files share — the props
 * shape, the row shell and two numeric helpers. They live here rather than in
 * `components/create/shared.tsx` because that file is shared with the rest of
 * the flow and is not this task's to edit; the sections import them back from
 * here, which is a cycle only in the module graph and never at evaluation time
 * (nothing below is read while a module body runs, only inside a render).
 */
import { useMemo, useState, type CSSProperties } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { harnessLabel } from "@/lib/harness";
import type { Lang } from "@/lib/types";
import type { AgentTemplateDraft } from "@/lib/atg/types";
import { create, type SectionKeyName } from "@/lib/i18n/create";
import {
  Notice,
  ghostBtn,
  ghostBtnHover,
  inputStyle,
  primaryBtn,
} from "@/components/create/shared";
import {
  SECTION_KEYS,
  draftConfidence,
  fallbackStages,
  reviewCount,
  sanitizeUntrusted,
  sectionStates,
  type ManagerMode,
  type SectionState,
  type StreamedSection,
} from "@/components/create/logic";
import SectionRole from "./SectionRole";
import SectionAgent from "./SectionAgent";
import SectionSkills from "./SectionSkills";
import SectionRules from "./SectionRules";
import SectionContext from "./SectionContext";
import SectionSchedules from "./SectionSchedules";

// ---------------------------------------------------------------------------
// The kit the six sections share
// ---------------------------------------------------------------------------

export interface SectionProps {
  lang: Lang;
  draft: AgentTemplateDraft;
  onChange: (next: AgentTemplateDraft) => void;
  /** The gutter's verdict for this section, used to tint the card's edge. */
  state: SectionState;
  /** The verdict as WORDS — the tint is never the only signal (§I.4). */
  stateLabel: string;
  /** False while this section's `section` frame has not arrived yet. */
  ready: boolean;
  /** Anchor target, so the gutter can jump to this card. */
  domId?: string;
}

/** The recessed shell every repeatable row inside a section sits in. */
export const SECTION_ROW: CSSProperties = {
  border: `1px solid ${c.border}`,
  borderRadius: r.radiusSm,
  background: c.panelDeep,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

/** Replace one element without mutating the draft. */
export function replaceAt<T>(list: readonly T[], index: number, next: T): T[] {
  return list.map((item, i) => (i === index ? next : item));
}

/**
 * A number field that refuses to become NaN.
 *
 * An empty box reads as the minimum (so backspacing to nothing does not throw
 * the field away), and anything else unparseable leaves the previous value
 * standing — a control that silently becomes `NaN` writes `NaN` into the draft
 * and fails validation three screens later with nothing to point at.
 */
export function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return raw.trim() === "" ? min : fallback;
  return Math.min(max, Math.max(min, n));
}

/** The DOM id of a section card — shared by the card and the gutter link. */
export function sectionDomId(key: SectionKeyName): string {
  return `atg-section-${key}`;
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/**
 * `agents` is deliberately not a `StreamedSection`: there is no AGENTS stage
 * and no `agents` frame — the agents arrive whole in `done`. So the AGENT card
 * is ready exactly when the whole draft is, and never guesses before then.
 */
function sectionReady(
  key: SectionKeyName,
  streamed: ReadonlySet<StreamedSection>,
  complete: boolean,
): boolean {
  if (complete) return true;
  if (key === "agents") return false;
  return streamed.has(key as StreamedSection);
}

export interface ReviewSectionsProps {
  lang: Lang;
  draft: AgentTemplateDraft;
  onChange: (next: AgentTemplateDraft) => void;
  /**
   * Whether the Agent Manager can vouch for skill compatibility. Defaults to
   * `unconfigured`, which is the honest answer when the integrator has not
   * asked: with no runtime connected, no skill can be verified against a real
   * machine and every compatibility badge collapses to "unverified".
   */
  managerMode?: ManagerMode;
  /** Sections whose `section` frame has landed. Ignored once `complete`. */
  streamed?: ReadonlySet<StreamedSection>;
  /** True once the `done` frame — or a terminal poll — has landed. */
  complete?: boolean;
  busy?: boolean;
  /** A recoverable failure from save/continue. Rendered, never thrown. */
  error?: string | null;
  /** The agent row exists but no VM has been assigned to it yet. */
  provisionNotice?: boolean;
  onSaveTemplate?: () => void;
  onContinue?: () => void;
}

export default function ReviewSections({
  lang,
  draft,
  onChange,
  managerMode = "unconfigured",
  streamed,
  complete = true,
  busy = false,
  error = null,
  provisionNotice = false,
  onSaveTemplate,
  onContinue,
}: ReviewSectionsProps) {
  const t = create[lang].review;
  const tg = create[lang].generating;
  const [renaming, setRenaming] = useState(false);

  const landed = useMemo<ReadonlySet<StreamedSection>>(
    () => streamed ?? new Set<StreamedSection>(),
    [streamed],
  );
  const states = useMemo(() => sectionStates(draft, managerMode), [draft, managerMode]);
  const needsReview = reviewCount(states);
  const confidence = useMemo(() => draftConfidence(draft), [draft]);
  const warnings = draft.provenance.warnings.filter((w) => !w.remediated);
  const fallbacks = useMemo(
    () => fallbackStages(draft.provenance.stages),
    [draft.provenance.stages],
  );

  // The agent's own harness, not the draft-level one: they agree in every
  // generated draft, but a user who changed the AGENT card's picker has
  // already been told the second answer and must not read the first.
  const primaryAgent = draft.agents.find((a) => a.isPrimary) ?? draft.agents[0];
  const roleTitle = draft.roles[0]?.title ?? "";

  const stateLabel: Record<SectionState, string> = {
    ok: t.stateOk,
    review: t.stateReview,
    empty: t.stateEmpty,
  };

  const shared = (key: SectionKeyName): SectionProps => ({
    lang,
    draft,
    onChange,
    state: states[key],
    stateLabel: stateLabel[states[key]],
    ready: sectionReady(key, landed, complete),
    domId: sectionDomId(key),
  });

  const gated = busy || !complete;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: r.detailSettings,
        gap: 24,
        alignItems: "start",
        width: "100%",
      }}
    >
      <div style={{ maxWidth: 860, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        {/* ---- header ---- */}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <h1
              style={{
                fontFamily: font.space,
                fontWeight: 700,
                fontSize: "clamp(20px, 4vw, 24px)",
                letterSpacing: "-.01em",
                margin: "0 0 6px",
                color: c.text,
              }}
            >
              {t.title}
            </h1>
            {renaming ? (
              <input
                aria-label={t.renameLabel}
                autoFocus
                value={draft.meta.name}
                maxLength={60}
                onChange={(e) =>
                  onChange({ ...draft, meta: { ...draft.meta, name: e.target.value } })
                }
                onBlur={() => setRenaming(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") setRenaming(false);
                }}
                style={{ ...inputStyle, maxWidth: 380 }}
              />
            ) : (
              <p style={{ fontSize: 13.5, color: c.text2, margin: 0, overflowWrap: "anywhere" }}>
                {t.subtitle(
                  sanitizeUntrusted(draft.meta.name, 60),
                  harnessLabel(primaryAgent?.harness ?? draft.harness),
                  sanitizeUntrusted(roleTitle, 60),
                )}
              </p>
            )}
          </div>
          <Btn
            type="button"
            onClick={() => setRenaming((v) => !v)}
            style={ghostBtn}
            hoverStyle={ghostBtnHover}
          >
            ✎ {t.rename}
          </Btn>
        </div>

        {!complete && <Notice>{t.streaming}</Notice>}

        {/* Where this draft came from, in the words the GENERATING screen used.
            A rules-only draft is a supported state, so it is never c.red — but
            it is never silent either. */}
        {draft.provenance.mode === "deterministic" && (
          <Notice title={tg.modeDeterministicTitle}>{tg.modeDeterministicBody}</Notice>
        )}
        {draft.provenance.mode === "hybrid" && fallbacks.length > 0 && (
          <Notice title={tg.modeHybridTitle}>
            {tg.modeHybridBody(fallbacks.map((s) => tg.stages[s]).join(LIST_SEP[lang]))}
          </Notice>
        )}

        <Notice>
          <span style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: ".06em" }}>
            {t.confidenceLabel}
          </span>{" "}
          {confidence === "high"
            ? t.confidenceHigh
            : confidence === "medium"
              ? t.confidenceMedium
              : t.confidenceLow}
        </Notice>

        {warnings.length > 0 ? (
          <Notice tone="warn" title={t.warningsTitle}>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {warnings.slice(0, 6).map((w) => (
                <li key={`${w.code}${w.path}`} style={{ marginBottom: 4 }}>
                  {/* `remediation` is written by our own linter; `message` is
                      English-for-logs and only a fallback. Both are text. */}
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                    {w.code}
                  </span>{" "}
                  {sanitizeUntrusted(w.remediation ?? w.message, 200)}
                </li>
              ))}
            </ul>
          </Notice>
        ) : (
          complete && <div style={{ fontSize: 12.5, color: c.muted }}>{t.warningsNone}</div>
        )}

        <div style={{ fontSize: 12.5, color: c.muted }}>{t.untrustedNote}</div>
        <div style={{ fontSize: 12.5, color: c.muted }}>{t.editHint}</div>

        {/* ---- the six ---- */}
        <SectionRole {...shared("roles")} />
        <SectionAgent {...shared("agents")} />
        <SectionSkills {...shared("skills")} managerMode={managerMode} />
        <SectionRules {...shared("boundaries")} />
        <SectionContext {...shared("context")} managerMode={managerMode} />
        <SectionSchedules {...shared("schedules")} />

        {error && <Notice tone="error">{error}</Notice>}
        {provisionNotice && <Notice tone="warn">{t.notProvisioned}</Notice>}

        {/* ---- action bar ---- */}
        <div
          style={{
            position: "sticky",
            bottom: 0,
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            borderTop: `1px solid ${c.line}`,
            background: c.panel,
            padding: "14px 16px",
            marginTop: 8,
            borderRadius: r.radiusMd,
          }}
        >
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted, flex: "1 1 200px" }}>
            {t.countdownToLaunch(SECTION_KEYS.length, needsReview)}
          </span>
          {onSaveTemplate && (
            <Btn
              type="button"
              onClick={onSaveTemplate}
              disabled={gated}
              style={{ ...ghostBtn, opacity: gated ? 0.5 : 1 }}
              hoverStyle={gated ? undefined : ghostBtnHover}
            >
              {t.saveTemplate}
            </Btn>
          )}
          {onContinue && (
            <Btn
              type="button"
              onClick={onContinue}
              disabled={gated}
              style={{
                ...primaryBtn,
                height: 44,
                fontSize: 14,
                opacity: gated ? 0.5 : 1,
                cursor: gated ? "not-allowed" : "pointer",
              }}
              hoverStyle={gated ? undefined : { background: c.limeHover }}
            >
              {busy ? t.busy : t.continueCta}
            </Btn>
          )}
        </div>
      </div>

      {/* ---- readiness gutter ---- */}
      <aside
        aria-label={t.readyTitle}
        style={{
          position: "sticky",
          top: 88,
          border: `1px solid ${c.border}`,
          borderRadius: r.radiusMd,
          background: c.panel,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: ".12em", color: c.text2 }}>
          {t.readyTitle}
        </div>
        {SECTION_KEYS.map((key) => {
          const s = states[key];
          return (
            <a
              key={key}
              href={`#${sectionDomId(key)}`}
              aria-label={t.jumpTo(t.sectionNames[key])}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "baseline",
                textDecoration: "none",
                minWidth: 0,
              }}
            >
              <span
                aria-hidden
                style={{ color: s === "ok" ? c.green : s === "review" ? c.amber : c.muted }}
              >
                {s === "ok" ? "✓" : s === "review" ? "⚠" : "·"}
              </span>
              <span style={{ fontSize: 13, color: c.text2, flex: 1, minWidth: 0 }}>
                {t.sectionNames[key]}
              </span>
              <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.muted }}>
                {stateLabel[s]}
              </span>
            </a>
          );
        })}
      </aside>
    </div>
  );
}

/** CJK enumerates with the ideographic comma; a Latin one reads as a typo. */
const LIST_SEP: Record<Lang, string> = { en: ", ", zh: "、", zht: "、", ja: "、" };
