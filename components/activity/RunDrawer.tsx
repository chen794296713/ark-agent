"use client";

/**
 * One run, opened over the timeline: the header facts, the two token ledgers'
 * worth of usage, and the step trace.
 *
 * The trace is rendered in the order the DTO delivers it, which is `idx` order
 * — the runtime's own render order. Steps arrive out of order under batching,
 * so re-sorting by `occurredAt` here would put the tool result before the tool
 * call on exactly the runs an operator opens this drawer to understand.
 *
 * Every string on this panel that a runtime, a tool or a model produced —
 * `summary`, `errorMessage`, a step's `title` and its `detail` — is rendered as
 * a text node. `detail` in particular goes inside a `<pre>` with wrapping, never
 * `dangerouslySetInnerHTML`, and no URL inside it becomes a link: this is the
 * one screen in the product that displays raw tool output, so it is the one
 * screen where that rule has to hold hardest.
 *
 * An empty trace is not a bug and does not render as one. It is either "the
 * runtime does not report steps yet" (the launch default) or "the nightly prune
 * removed them", and the panel says which.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { useApp } from "@/lib/store";
import { activity } from "@/lib/i18n/activity";
import { BCP47 } from "@/lib/i18n";
import type { RunDetailDTO, RunStepDTO } from "@/lib/activity/types";
import {
  PHASE_GLYPH,
  STATUS_GLYPH,
  TRIGGER_GLYPH,
  formatDuration,
  formatMicroUsd,
  formatTokens,
  kindLabel,
} from "./logic";
import { ActivityEmptyState } from "./EmptyState";

export interface RunDrawerProps {
  /** Kept as an explicit flag so the drawer can render its loading state. */
  open: boolean;
  run: RunDetailDTO | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onClose: () => void;
  /** Scopes the timeline to this run's session. Omit to hide the chip. */
  onFilterSession?: (sessionKey: string) => void;
}

export function RunDrawer({
  open,
  run,
  loading = false,
  error = null,
  onRetry,
  onClose,
  onFilterSession,
}: RunDrawerProps) {
  const { lang } = useApp();
  const t = activity[lang];
  const locale = BCP47[lang];
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const restoreRef = useRef<Element | null>(null);
  const [closeHover, setCloseHover] = useState(false);

  const stampFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }),
    [locale],
  );

  // Escape closes, focus lands on the close button, and the element that opened
  // the drawer gets focus back — the minimum for a panel that covers the page.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const el = restoreRef.current;
      if (el instanceof HTMLElement) el.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const st = run ? STATUS_GLYPH[run.status] : null;
  const tg = run ? TRIGGER_GLYPH[run.trigger] : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: c.scrim }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t.ui.run.heading}
        style={{
          position: "relative",
          width: "min(560px, 100%)",
          height: "100%",
          background: c.panel,
          borderLeft: `1px solid ${c.border}`,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            background: c.glass,
            backdropFilter: "blur(8px)",
            borderBottom: `1px solid ${c.line}`,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 10.5,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: c.muted,
              }}
            >
              {t.ui.run.heading}
            </div>
            <div
              style={{
                fontFamily: font.space,
                fontSize: 16,
                fontWeight: 600,
                color: c.text,
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 2,
              }}
            >
              {st && (
                <span aria-hidden="true" style={{ color: st.color, fontSize: 14 }}>
                  {st.glyph}
                </span>
              )}
              <span>{run ? t.status[run.status] : t.ui.run.loading}</span>
              {tg && run && (
                <span style={{ fontFamily: font.mono, fontSize: 11.5, color: tg.color }}>
                  <span aria-hidden="true" style={{ marginRight: 4 }}>
                    {tg.glyph}
                  </span>
                  {t.trigger[run.trigger]}
                </span>
              )}
            </div>
          </div>
          {/* A native button, not `Btn`: this one needs a ref so focus can land
              on it when the drawer opens, and `Btn` does not forward one. */}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t.ui.run.close}
            onMouseEnter={() => setCloseHover(true)}
            onMouseLeave={() => setCloseHover(false)}
            onFocus={() => setCloseHover(true)}
            onBlur={() => setCloseHover(false)}
            style={{
              background: "transparent",
              border: `1px solid ${closeHover ? c.borderMute : c.borderField}`,
              borderRadius: r.radiusSm,
              color: closeHover ? c.text : c.muted,
              cursor: "pointer",
              fontSize: 13,
              lineHeight: 1,
              padding: "7px 10px",
              transition: "color .15s ease, border-color .15s ease",
            }}
          >
            ✕
          </button>
        </header>

        <div style={{ padding: "16px 18px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
          {error ? (
            <div
              role="alert"
              style={{
                border: `1px solid ${c.redBorder}`,
                background: c.redWash,
                borderRadius: r.radiusMd,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 13.5, color: c.text2 }}>{t.label.loadFailed}</div>
              <div style={{ fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>{error}</div>
              {onRetry && (
                <div>
                  <SmallBtn onClick={onRetry}>{t.action.tryAgain}</SmallBtn>
                </div>
              )}
            </div>
          ) : loading || !run ? (
            <div
              aria-busy="true"
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
              aria-label={t.ui.run.loading}
            >
              {[64, 88, 52, 76].map((w, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  style={{ height: 10, width: `${w}%`, borderRadius: 2, background: c.line }}
                />
              ))}
            </div>
          ) : (
            <>
              {run.summary && (
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: c.text2,
                    margin: 0,
                    overflowWrap: "anywhere",
                  }}
                >
                  {run.summary}
                </p>
              )}

              {(run.errorCode || run.errorMessage) && (
                <div
                  style={{
                    border: `1px solid ${c.redBorder}`,
                    background: c.redWash,
                    borderRadius: r.radiusSm,
                    padding: "12px 14px",
                  }}
                >
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10.5,
                      letterSpacing: ".07em",
                      textTransform: "uppercase",
                      color: c.muted,
                      marginBottom: 5,
                    }}
                  >
                    {t.ui.run.error}
                  </div>
                  {run.errorCode && (
                    <div style={{ fontSize: 13, color: c.text2, marginBottom: 3 }}>
                      {t.error[run.errorCode] ?? run.errorCode}
                    </div>
                  )}
                  {run.errorMessage && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: c.muted,
                        lineHeight: 1.5,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {run.errorMessage}
                    </div>
                  )}
                </div>
              )}

              <dl
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 12,
                  margin: 0,
                  border: `1px solid ${c.line}`,
                  borderRadius: r.radiusSm,
                  padding: "14px 16px",
                }}
              >
                <Fact label={t.ui.run.runId} value={run.runId} mono />
                <Fact
                  label={t.ui.run.started}
                  value={stampFmt.format(new Date(run.startedAt))}
                />
                <Fact
                  label={t.ui.run.finished}
                  value={run.finishedAt ? stampFmt.format(new Date(run.finishedAt)) : "—"}
                />
                <Fact label={t.ui.run.duration} value={formatDuration(run.durationMs)} />
                <Fact label={t.ui.run.steps} value={String(run.stepCount)} />
                <Fact label={t.ui.run.model} value={run.usage.model ?? "—"} mono />
                <Fact
                  label={t.ui.run.tokens}
                  value={`${formatTokens(run.usage.totalTokens, locale)}`}
                  hint={`${t.ui.run.tokensIn} ${formatTokens(run.usage.inputTokens, locale)} · ${t.ui.run.tokensOut} ${formatTokens(run.usage.outputTokens, locale)} · ${t.ui.run.tokensCache} ${formatTokens(run.usage.cacheTokens, locale)}`}
                />
                <Fact
                  label={t.ui.run.cost}
                  value={
                    run.usage.unpriced
                      ? "—"
                      : formatMicroUsd(run.usage.costMicroUsd, { locale })
                  }
                  hint={run.usage.unpriced ? t.label.unpricedNote : undefined}
                />
                {run.sessionKey && (
                  <div style={{ minWidth: 0 }}>
                    <dt
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        letterSpacing: ".07em",
                        textTransform: "uppercase",
                        color: c.muted,
                      }}
                    >
                      {t.ui.run.session}
                    </dt>
                    <dd style={{ margin: "4px 0 0" }}>
                      {onFilterSession ? (
                        <SmallBtn onClick={() => onFilterSession(run.sessionKey as string)}>
                          <span title={t.ui.run.filterSession}>{run.sessionKey}</span>
                        </SmallBtn>
                      ) : (
                        <span style={{ fontFamily: font.mono, fontSize: 12, color: c.text2 }}>
                          {run.sessionKey}
                        </span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>

              <Trace run={run} />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Fact({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          letterSpacing: ".07em",
          textTransform: "uppercase",
          color: c.muted,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: "4px 0 0",
          fontFamily: mono ? font.mono : font.sans,
          fontSize: mono ? 12 : 13.5,
          color: c.text,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </dd>
      {hint && (
        <div style={{ fontSize: 11, color: c.muted, marginTop: 3, lineHeight: 1.45 }}>{hint}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The trace
// ---------------------------------------------------------------------------

function Trace({ run }: { run: RunDetailDTO }) {
  const { lang } = useApp();
  const t = activity[lang];

  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
        <h3
          style={{
            fontFamily: font.space,
            fontSize: 14,
            fontWeight: 600,
            color: c.text,
            margin: 0,
          }}
        >
          {t.ui.run.trace}
        </h3>
        <span style={{ fontSize: 11.5, color: c.muted }}>{t.ui.run.traceOrder}</span>
      </div>

      {run.steps.length === 0 ? (
        run.stepsPrunedAt ? (
          <Note text={t.label.stepsPruned} />
        ) : (
          <ActivityEmptyState view="toolCalls" reason="no_data_yet" compact />
        )
      ) : (
        <>
          <ol
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              border: `1px solid ${c.line}`,
              borderRadius: r.radiusSm,
              overflow: "hidden",
            }}
          >
            {run.steps.map((s) => (
              <Step key={s.id} step={s} />
            ))}
          </ol>
          {run.stepsTruncated && <Note text={t.label.stepsTruncated} />}
        </>
      )}
    </section>
  );
}

function Step({ step }: { step: RunStepDTO }) {
  const { lang } = useApp();
  const t = activity[lang];
  const locale = BCP47[lang];
  const [open, setOpen] = useState(false);
  const ph = PHASE_GLYPH[step.phase];
  const failed = step.status === "error";
  const tokens = step.inputTokens + step.outputTokens;

  return (
    <li style={{ borderBottom: `1px solid ${c.lineSoft}`, padding: "10px 12px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span
          aria-hidden="true"
          style={{ fontFamily: font.mono, fontSize: 10.5, color: c.faint, width: 20, paddingTop: 2 }}
        >
          {step.idx}
        </span>
        <span
          aria-hidden="true"
          style={{ color: failed ? c.red : ph.color, fontSize: 12, paddingTop: 1, width: 14 }}
        >
          {failed ? "✕" : ph.glyph}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: c.text2, overflowWrap: "anywhere" }}>{step.title}</div>
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 4,
              fontFamily: font.mono,
              fontSize: 10.5,
              color: c.muted,
            }}
          >
            <span>{t.phase[step.phase]}</span>
            <span>{kindLabel(step.kind)}</span>
            {step.durationMs !== null && <span>{formatDuration(step.durationMs)}</span>}
            {tokens > 0 && <span>{formatTokens(tokens, locale)}</span>}
            {failed && <span style={{ color: c.red }}>{t.ui.run.stepFailed}</span>}
            {step.detail !== null && (
              <Btn
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                hoverStyle={{ color: c.text }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  fontFamily: font.mono,
                  fontSize: 10.5,
                  color: c.accent,
                  cursor: "pointer",
                }}
              >
                {open ? t.ui.run.hideDetail : t.ui.run.showDetail}
              </Btn>
            )}
          </div>

          {open && (
            <div style={{ marginTop: 8 }}>
              <pre
                style={{
                  margin: 0,
                  padding: "10px 12px",
                  background: c.panelDeep,
                  border: `1px solid ${c.line}`,
                  borderRadius: r.radiusSm,
                  fontFamily: font.mono,
                  fontSize: 11.5,
                  lineHeight: 1.55,
                  color: c.text2,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  maxHeight: 280,
                  overflowY: "auto",
                }}
              >
                {step.detail ?? t.ui.run.noDetail}
              </pre>
              {step.detailTruncated && (
                <div style={{ fontFamily: font.mono, fontSize: 10.5, color: c.muted, marginTop: 4 }}>
                  {t.label.detailTruncated}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Note({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: 8,
        fontSize: 12.5,
        color: c.muted,
        lineHeight: 1.5,
        border: `1px dashed ${c.border}`,
        borderRadius: r.radiusSm,
        padding: "10px 12px",
      }}
    >
      {text}
    </div>
  );
}

function SmallBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Btn
      onClick={onClick}
      hoverStyle={{ color: c.text, borderColor: c.borderMute }}
      style={{
        fontFamily: font.mono,
        fontSize: 11,
        padding: "4px 8px",
        borderRadius: r.radiusSm,
        background: "transparent",
        color: c.text2,
        border: `1px solid ${c.borderField}`,
        cursor: "pointer",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {children}
    </Btn>
  );
}
