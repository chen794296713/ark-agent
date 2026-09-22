"use client";

/**
 * C.2 GENERATING — the stage ledger.
 *
 * A ledger, not a spinner. Generation takes 12–40 seconds with a model behind
 * it and about 400ms without one, and in the slow case the only thing that
 * makes the wait bearable is seeing WHICH part of the agent is being written.
 *
 * The stage list is server-driven: whatever ids arrived in the `start` frame,
 * in the order given, rendered with `t.stages[id]`. Adding a stage upstream
 * therefore needs no client release. The screen has exactly one layout for both
 * transports — streaming and polling differ only in where `rows` came from,
 * which is the caller's problem, not this component's.
 *
 * Nothing here is decorative about honesty. A draft written by rules says so
 * before the user reads a word of it, a partly-fallen-back run NAMES the steps
 * that fell back, and a failure keeps the finished steps on screen rather than
 * replacing them with an apology.
 */
import type { CSSProperties } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { BCP47 } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { create } from "@/lib/i18n/create";
import type { StageId } from "@/lib/atg/types";
import { Notice, ghostBtn, ghostBtnHover, useReducedMotion } from "@/components/create/shared";
import type { GenerationMode, StageRow } from "@/components/create/logic";

/** CJK enumerates with the ideographic comma; a Latin one reads as a typo. */
const LIST_SEP: Record<Lang, string> = { en: ", ", zh: "、", zht: "、", ja: "、" };

export interface GeneratingCost {
  promptTokens: number;
  completionTokens: number;
  costMicroUsd: number;
}

export default function GeneratingStep({
  lang,
  briefLine,
  rows,
  mode = null,
  fallbacks = [],
  cost = null,
  polling = false,
  failed = false,
  onCancel,
  onRetry,
  onStartOver,
}: {
  lang: Lang;
  /** The user's own words, already clamped to one line by `briefLine()`. */
  briefLine: string;
  rows: StageRow[];
  /** Null until the `start` frame lands — a banner before then would guess. */
  mode?: GenerationMode | null;
  /** Stages that ran on rules rather than a model. Named, never counted. */
  fallbacks?: StageId[];
  cost?: GeneratingCost | null;
  /** True when SSE was blocked and the caller fell back to polling. */
  polling?: boolean;
  failed?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  onStartOver?: () => void;
}) {
  const t = create[lang].generating;
  const reduced = useReducedMotion();
  const done = rows.filter((row) => row.status === "done" || row.status === "failed").length;
  const total = rows.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const active = rows.find((row) => row.status === "active");

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <h1
          style={{
            fontFamily: font.space,
            fontWeight: 700,
            fontSize: "clamp(20px, 4vw, 24px)",
            letterSpacing: "-.01em",
            margin: "0 0 8px",
            color: c.text,
          }}
        >
          {t.title}
        </h1>
        <p
          style={{
            fontSize: 13,
            color: c.muted,
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={briefLine}
        >
          <span style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: ".08em" }}>
            {t.briefLabel}
          </span>{" "}
          {briefLine ? `“${briefLine}”` : null}
        </p>
      </div>

      {/* Mode banner. Never c.red — a rules-only draft is a supported state,
          and the user is being informed, not warned off. */}
      {mode === "deterministic" && (
        <Notice title={t.modeDeterministicTitle}>{t.modeDeterministicBody}</Notice>
      )}
      {mode === "hybrid" && fallbacks.length > 0 && (
        <Notice title={t.modeHybridTitle}>
          {t.modeHybridBody(fallbacks.map((s) => t.stages[s] ?? s).join(LIST_SEP[lang]))}
        </Notice>
      )}
      {polling && <Notice>{t.pollNotice}</Notice>}

      {/* A 40-second wait with no announcement is a blank screen to a screen
          reader. One polite update per stage, not per frame. */}
      <span role="status" aria-live="polite" style={SR_ONLY}>
        {active ? (t.stages[active.stage] ?? active.stage) : ""}
      </span>

      {/* ---- the ledger ---- */}
      <ol
        aria-label={t.listLabel}
        aria-busy={!failed}
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          border: `1px solid ${c.border}`,
          borderRadius: r.radiusMd,
          background: c.panel,
        }}
      >
        {rows.length === 0 && (
          <li
            style={{
              height: 40,
              display: "flex",
              alignItems: "center",
              padding: "0 16px",
              fontSize: 13,
              color: c.muted,
            }}
          >
            {create[lang].common.loading}
          </li>
        )}
        {rows.map((row, i) => {
          const glyph =
            row.status === "failed"
              ? "✕"
              : row.status === "done"
                ? "✓"
                : row.status === "active"
                  ? "◐"
                  : "·";
          const glyphColor =
            row.status === "failed"
              ? c.red
              : row.status === "done"
                ? c.green
                : row.status === "active"
                  ? c.accent
                  : c.faint;
          // A pending row is the one place c.faint carries a label: it is a
          // list the user is not being asked to read yet.
          const labelColor =
            row.status === "pending" ? c.faint : row.status === "active" ? c.text : c.text2;
          return (
            <li
              key={row.stage}
              style={{
                minHeight: 40,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "0 16px",
                borderTop: i === 0 ? "none" : `1px solid ${c.lineSoft}`,
              }}
            >
              <span
                aria-hidden
                style={{
                  color: glyphColor,
                  width: 14,
                  textAlign: "center",
                  animation:
                    row.status === "active" && !reduced
                      ? "pulse 1.2s ease-in-out infinite"
                      : "none",
                }}
              >
                {glyph}
              </span>
              <span style={{ flex: 1, fontSize: 13.5, color: labelColor, minWidth: 0 }}>
                {t.stages[row.stage] ?? row.stage}
              </span>
              {row.outcome && row.outcome !== "ok" && (
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10.5,
                    letterSpacing: ".06em",
                    color: row.outcome === "failed" ? c.red : c.muted,
                  }}
                >
                  {t.outcome[row.outcome]}
                </span>
              )}
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: c.faint,
                  minWidth: 44,
                  textAlign: "right",
                }}
              >
                {row.durationMs === null ? "" : `${(row.durationMs / 1000).toFixed(1)}s`}
              </span>
              {/* The status as a WORD, so the state is never colour-only.
                  Clipped rather than `display: none`, which would take it out
                  of the accessibility tree along with the pixels. */}
              <span style={SR_ONLY}>
                {row.status === "pending"
                  ? t.pending
                  : row.status === "active"
                    ? t.active
                    : row.status === "failed"
                      ? t.failedStage
                      : t.done}
              </span>
            </li>
          );
        })}
      </ol>

      {/* ---- progress + cost ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total || 1}
          aria-valuenow={done}
          aria-label={t.progress(done, total)}
          style={{
            flex: "1 1 200px",
            height: 2,
            background: c.line,
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: c.lime,
              transition: reduced ? "none" : "width .3s ease",
            }}
          />
        </div>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
          {t.progress(done, total)}
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.faint }}>
          {cost
            ? `${t.tokens(cost.promptTokens + cost.completionTokens)} · ${formatMicroUsd(
                cost.costMicroUsd,
                lang,
              )}`
            : t.costUnavailable}
        </span>
      </div>

      {/* ---- terminal states ---- */}
      {failed ? (
        <>
          <Notice tone="error" title={t.failedTitle}>
            {t.failedBody}
          </Notice>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {onStartOver && (
              <Btn type="button" onClick={onStartOver} style={ghostBtn} hoverStyle={ghostBtnHover}>
                {t.startOver}
              </Btn>
            )}
            {onRetry && (
              <Btn type="button" onClick={onRetry} style={ghostBtn} hoverStyle={ghostBtnHover}>
                {t.tryAgain}
              </Btn>
            )}
          </div>
        </>
      ) : (
        onCancel && (
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 12.5, color: c.muted, flex: "1 1 240px" }}>{t.cancelHint}</span>
            <Btn type="button" onClick={onCancel} style={ghostBtn} hoverStyle={ghostBtnHover}>
              {t.cancel}
            </Btn>
          </div>
        )
      )}
    </div>
  );
}

/** Visually hidden, still announced. Inline because there is no utility CSS. */
const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * Micro-USD → a readable amount, ALWAYS in USD.
 *
 * The drafting budget is denominated in USD, and converting it into the
 * viewer's display currency would invent an exchange rate that does not appear
 * on any invoice.
 */
function formatMicroUsd(micro: number, lang: Lang): string {
  const usd = (Number.isFinite(micro) ? micro : 0) / 1_000_000;
  try {
    return new Intl.NumberFormat(BCP47[lang], {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: usd < 0.01 ? 4 : 2,
    }).format(usd);
  } catch {
    return `$${usd.toFixed(4)}`;
  }
}
