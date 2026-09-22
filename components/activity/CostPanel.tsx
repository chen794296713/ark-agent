"use client";

/**
 * Token and credit analytics for one agent.
 *
 * THREE LEDGERS, RENDERED AS THREE CARDS, NEVER SUMMED:
 *
 *  1. **Runtime-reported spend** — `agent_runs`. What the VM said it cost.
 *     Empty until the backend ships, which is why this card carries the
 *     teaching empty state and the other two do not.
 *  2. **ArkAgent model spend** — `llm_usage`. Our own calls made on the agent's
 *     behalf: chat, brief, self-review, template generation. This is the
 *     ledger that is non-empty today.
 *  3. **Credits** — `usage_records`, the billing ledger. Credits are NOT
 *     converted to dollars anywhere on this page. ArkAgent owns pricing, and an
 *     invented exchange rate in a cost view is exactly the kind of plausible
 *     fake number that outlives the sprint that added it.
 *
 * A zero in cards 2 and 3 is a fact — ArkAgent knows precisely how many calls it
 * made — so those cards show `0` rather than an empty state. A zero in card 1 is
 * an absence of reporting, which is a different thing and gets a sentence.
 *
 * Money is micro-USD end to end and is converted once, at render. It stays in
 * USD in every language: the price tables are USD, and running the figure
 * through the UI's currency switcher would invent an exchange rate — the same
 * fabrication the credits card refuses to make. Only the NUMBER is localised.
 * `unpriced` renders as an em dash with a footnote, never as `$0.00`: telling a
 * customer their agent was free is worse than telling them we don't know.
 */
import { useMemo } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn, HoverDiv } from "@/components/ui";
import { useApp } from "@/lib/store";
import { activity, interpolate } from "@/lib/i18n/activity";
import { BCP47 } from "@/lib/i18n";
import type { CostDTO } from "@/lib/activity/types";
import { STATUS_GLYPH, formatDuration, formatMicroUsd, formatTokens, pctDelta } from "./logic";
import { ActivityEmptyState } from "./EmptyState";
import { Banner, ErrorBlock } from "./Timeline";

/** The cost view answers a monthly question, so it defaults to 30 days. */
export type CostRangeDays = 7 | 30 | 90;

export interface CostPanelProps {
  cost: CostDTO | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  rangeDays?: CostRangeDays;
  onRangeDaysChange?: (d: CostRangeDays) => void;
  /** Receives `external_run_id`; the run route accepts either identifier. */
  onOpenRun?: (runId: string) => void;
  onRunNow?: () => void;
  onOpenChat?: () => void;
  onSetUpSchedule?: () => void;
  onViewDeployment?: () => void;
  onContactAdmin?: () => void;
}

export function CostPanel({
  cost,
  loading = false,
  error = null,
  onRetry,
  rangeDays = 30,
  onRangeDaysChange,
  onOpenRun,
  onRunNow,
  onOpenChat,
  onSetUpSchedule,
  onViewDeployment,
  onContactAdmin,
}: CostPanelProps) {
  const { lang } = useApp();
  const t = activity[lang];
  const locale = BCP47[lang];

  const dayFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
    [locale],
  );
  const stampFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }),
    [locale],
  );

  const rangeLabel: Record<CostRangeDays, string> = {
    7: t.ui.filter.range7d,
    30: t.ui.filter.range30d,
    90: t.ui.filter.range90d,
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2
          style={{
            fontFamily: font.space,
            fontSize: 15,
            fontWeight: 600,
            color: c.text,
            margin: 0,
            flex: 1,
          }}
        >
          {t.ui.cost.heading}
        </h2>
        {onRangeDaysChange && (
          <div role="group" aria-label={t.ui.filter.range} style={{ display: "flex" }}>
            {([7, 30, 90] as CostRangeDays[]).map((d) => {
              const on = rangeDays === d;
              return (
                <Btn
                  key={d}
                  onClick={() => onRangeDaysChange(d)}
                  aria-pressed={on}
                  hoverStyle={on ? undefined : { color: c.text, borderColor: c.borderMute }}
                  style={{
                    fontFamily: font.mono,
                    fontSize: 11,
                    padding: "5px 10px",
                    cursor: "pointer",
                    background: on ? c.limeWash : "transparent",
                    color: on ? c.accent : c.muted,
                    border: `1px solid ${on ? c.limeBorder : c.borderField}`,
                    marginLeft: -1,
                  }}
                >
                  {rangeLabel[d]}
                </Btn>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>{t.ui.cost.ledgersNote}</div>

      {cost && cost.managerMode !== "live" && (
        <Banner
          tone="warn"
          text={cost.managerMode === "mock" ? t.banner.mock : t.banner.unconfigured}
        />
      )}
      {cost?.timezoneInvalid && <Banner tone="warn" text={t.banner.degraded} />}

      {error ? (
        <ErrorBlock message={error} onRetry={onRetry} />
      ) : loading && !cost ? (
        <Skeleton label={t.ui.cost.loading} />
      ) : !cost ? (
        <ActivityEmptyState
          view="cost"
          reason={null}
          onRunNow={onRunNow}
          onOpenChat={onOpenChat}
          onSetUpSchedule={onSetUpSchedule}
        />
      ) : (
        <>
          <Card title={t.label.runtimeLedger}>
            {cost.totals.runs === 0 ? (
              <ActivityEmptyState
                view="cost"
                reason={cost.emptyReason}
                compact
                onRunNow={onRunNow}
                onOpenChat={onOpenChat}
                onSetUpSchedule={onSetUpSchedule}
                onViewDeployment={onViewDeployment}
                onContactAdmin={onContactAdmin}
              />
            ) : (
              <RuntimeLedger
                cost={cost}
                locale={locale}
                rangeDays={rangeDays}
                dayFmt={dayFmt}
                stampFmt={stampFmt}
                onOpenRun={onOpenRun}
              />
            )}
          </Card>

          <Card title={t.label.llmLedger}>
            <Metrics
              items={[
                { label: t.ui.cost.calls, value: cost.llm.calls.toLocaleString(locale) },
                { label: t.ui.cost.tokens, value: formatTokens(cost.llm.totalTokens, locale) },
                {
                  label: t.ui.cost.total,
                  value: formatMicroUsd(cost.llm.costMicroUsd, { locale }),
                },
              ]}
            />
            {cost.llm.estimatedCalls > 0 && (
              <Note text={interpolate(t.ui.cost.estimatedCalls, { n: cost.llm.estimatedCalls })} />
            )}
            {cost.llm.byKind.length > 0 && (
              <Bars
                title={t.ui.cost.byKind}
                locale={locale}
                rows={cost.llm.byKind.map((k) => ({
                  key: k.kind,
                  label: k.kind,
                  value: k.costMicroUsd,
                  display: formatMicroUsd(k.costMicroUsd, { locale }),
                  sub: formatTokens(k.totalTokens, locale),
                }))}
              />
            )}
          </Card>

          <Card title={t.label.creditsLedger}>
            <Metrics
              items={[
                {
                  label: t.ui.cost.creditsUsed,
                  value: cost.credits.used.toLocaleString(locale),
                },
              ]}
            />
            {cost.credits.byKind.length > 0 && (
              <Bars
                title={t.ui.cost.byKind}
                locale={locale}
                rows={cost.credits.byKind.map((k) => ({
                  key: k.kind,
                  label: k.kind,
                  value: k.credits,
                  display: k.credits.toLocaleString(locale),
                }))}
              />
            )}
            <Note text={t.ui.cost.creditsNote} />
          </Card>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ledger 1 — what the runtime reported
// ---------------------------------------------------------------------------

function RuntimeLedger({
  cost,
  locale,
  rangeDays,
  dayFmt,
  stampFmt,
  onOpenRun,
}: {
  cost: CostDTO;
  locale: string;
  rangeDays: CostRangeDays;
  dayFmt: Intl.DateTimeFormat;
  stampFmt: Intl.DateTimeFormat;
  onOpenRun?: (runId: string) => void;
}) {
  const { lang } = useApp();
  const t = activity[lang];
  const delta = pctDelta(cost.totals.costMicroUsd, cost.previous?.costMicroUsd ?? null);
  const maxDay = Math.max(1, ...cost.daily.map((d) => d.costMicroUsd));

  return (
    <>
      <Metrics
        items={[
          {
            label: t.ui.cost.total,
            value: formatMicroUsd(cost.totals.costMicroUsd, { locale }),
            hint:
              delta === null
                ? t.ui.cost.noPrevious
                : `${delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} ${Math.abs(delta).toLocaleString(
                    locale,
                    { maximumFractionDigits: 1 },
                  )}% ${interpolate(t.ui.cost.vsPrevious, { days: rangeDays })}`,
            hintColor: delta === null ? c.muted : delta > 0 ? c.amber : c.green,
          },
          { label: t.ui.cost.runs, value: cost.totals.runs.toLocaleString(locale) },
          {
            label: t.ui.cost.perRun,
            value: formatMicroUsd(cost.totals.costPerRunMicroUsd, { locale }),
          },
          { label: t.ui.cost.tokens, value: formatTokens(cost.totals.totalTokens, locale) },
        ]}
      />

      {cost.totals.unpricedRuns > 0 && <Note text={t.label.unpricedNote} />}

      {cost.daily.length > 0 && (
        <div>
          <Cap>{t.ui.cost.daily}</Cap>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 2,
              height: 64,
              marginTop: 8,
            }}
          >
            {cost.daily.map((d) => {
              const h = Math.max(2, Math.round((d.costMicroUsd / maxDay) * 60));
              return (
                <span
                  key={d.day}
                  title={`${dayFmt.format(new Date(`${d.day}T12:00:00`))} · ${formatMicroUsd(
                    d.costMicroUsd,
                    { locale },
                  )} · ${d.runs}`}
                  style={{
                    flex: 1,
                    minWidth: 2,
                    height: h,
                    borderRadius: 1,
                    background: c.accent,
                    opacity: d.costMicroUsd === 0 ? 0.28 : 0.85,
                    backgroundImage:
                      d.unpriced > 0
                        ? `repeating-linear-gradient(45deg, ${c.bg} 0 2px, transparent 2px 4px)`
                        : undefined,
                  }}
                />
              );
            })}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 5,
              fontFamily: font.mono,
              fontSize: 10.5,
              color: c.faint,
            }}
          >
            <span>{cost.daily[0] && dayFmt.format(new Date(`${cost.daily[0].day}T12:00:00`))}</span>
            <span>
              {cost.daily.length > 1 &&
                dayFmt.format(new Date(`${cost.daily[cost.daily.length - 1].day}T12:00:00`))}
            </span>
          </div>
        </div>
      )}

      {cost.byTrigger.length > 0 && (
        <Bars
          title={t.ui.cost.byTrigger}
          locale={locale}
          rows={cost.byTrigger.map((b) => ({
            key: b.trigger,
            label: t.trigger[b.trigger],
            value: b.costMicroUsd,
            display: formatMicroUsd(b.costMicroUsd, { locale }),
            sub: formatTokens(b.totalTokens, locale),
          }))}
        />
      )}

      {cost.byModel.length > 0 && (
        <Bars
          title={t.ui.cost.byModel}
          locale={locale}
          rows={cost.byModel.map((b, i) => ({
            key: b.model ?? `null-${i}`,
            label: b.model ?? t.ui.cost.noModel,
            value: b.costMicroUsd,
            display: formatMicroUsd(b.costMicroUsd, { locale }),
            sub: formatTokens(b.totalTokens, locale),
            mono: true,
          }))}
        />
      )}

      {cost.topRuns.length > 0 && (
        <div>
          <Cap>{t.ui.cost.topRuns}</Cap>
          <ul
            style={{
              listStyle: "none",
              margin: "8px 0 0",
              padding: 0,
              border: `1px solid ${c.line}`,
              borderRadius: r.radiusSm,
              overflow: "hidden",
            }}
          >
            {cost.topRuns.map((run) => {
              const st = STATUS_GLYPH[run.status];
              const clickable = Boolean(onOpenRun);
              return (
                <li key={run.id}>
                  <HoverDiv
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable ? () => onOpenRun?.(run.runId) : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onOpenRun?.(run.runId);
                            }
                          }
                        : undefined
                    }
                    hoverStyle={clickable ? { background: c.hover } : undefined}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: "9px 12px",
                      borderBottom: `1px solid ${c.lineSoft}`,
                      cursor: clickable ? "pointer" : "default",
                    }}
                  >
                    <span aria-hidden="true" style={{ color: st.color, fontSize: 12, width: 14 }}>
                      {st.glyph}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 13,
                          color: c.text2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {run.summary ?? run.runId}
                      </span>
                      <span
                        style={{
                          display: "flex",
                          gap: 10,
                          fontFamily: font.mono,
                          fontSize: 10.5,
                          color: c.muted,
                          marginTop: 2,
                        }}
                      >
                        <span>{stampFmt.format(new Date(run.startedAt))}</span>
                        <span>{formatDuration(run.durationMs)}</span>
                        <span>{formatTokens(run.totalTokens, locale)}</span>
                      </span>
                    </span>
                    <span
                      style={{ fontFamily: font.mono, fontSize: 12, color: c.text }}
                      title={run.unpriced ? t.label.unpricedNote : undefined}
                    >
                      {run.unpriced ? t.label.unpriced : formatMicroUsd(run.costMicroUsd, { locale })}
                    </span>
                  </HoverDiv>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: r.radiusMd,
        background: c.panel,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10.5,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: c.muted,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Metrics({
  items,
}: {
  items: { label: string; value: string; hint?: string; hintColor?: string }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 16,
      }}
    >
      {items.map((m) => (
        <div key={m.label}>
          <Cap>{m.label}</Cap>
          <div style={{ fontFamily: font.space, fontSize: 20, color: c.text, marginTop: 4 }}>
            {m.value}
          </div>
          {m.hint && (
            <div
              style={{ fontSize: 11.5, color: m.hintColor ?? c.muted, marginTop: 3, lineHeight: 1.4 }}
            >
              {m.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface BarRow {
  key: string;
  label: string;
  value: number;
  display: string;
  sub?: string;
  mono?: boolean;
}

function Bars({ title, rows, locale }: { title: string; rows: BarRow[]; locale: string }) {
  const { lang } = useApp();
  const t = activity[lang];
  const total = rows.reduce((a, b) => a + (Number.isFinite(b.value) ? b.value : 0), 0);
  return (
    <div>
      <Cap>{title}</Cap>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        {rows.map((row) => {
          const pct = total > 0 ? (row.value / total) * 100 : 0;
          return (
            <div key={row.key}>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "baseline",
                  fontSize: 12.5,
                  color: c.text2,
                }}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: row.mono ? font.mono : font.sans,
                    fontSize: row.mono ? 11.5 : 12.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.label}
                </span>
                {row.sub && (
                  <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.muted }}>
                    {row.sub}
                  </span>
                )}
                <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.text }}>
                  {row.display}
                </span>
                <span
                  style={{ fontFamily: font.mono, fontSize: 10.5, color: c.faint, width: 42, textAlign: "right" }}
                >
                  {interpolate(t.ui.cost.share, {
                    pct: pct.toLocaleString(locale, { maximumFractionDigits: 0 }),
                  })}
                </span>
              </div>
              <div
                aria-hidden="true"
                style={{ height: 4, background: c.panelDeep, borderRadius: 2, marginTop: 4 }}
              >
                <div
                  style={{
                    width: `${Math.max(0, Math.min(100, pct))}%`,
                    height: "100%",
                    background: c.accent,
                    borderRadius: 2,
                    opacity: 0.8,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cap({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: font.mono,
        fontSize: 10,
        letterSpacing: ".07em",
        textTransform: "uppercase",
        color: c.muted,
      }}
    >
      {children}
    </div>
  );
}

function Note({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.5 }}>
      <span aria-hidden="true" style={{ marginRight: 6 }}>
        †
      </span>
      {text}
    </div>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: r.radiusMd,
        background: c.panel,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {[38, 66, 52, 74].map((w, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{ height: 10, width: `${w}%`, borderRadius: 2, background: c.line }}
        />
      ))}
    </div>
  );
}
