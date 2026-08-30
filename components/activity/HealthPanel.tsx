"use client";

/**
 * Runtime health: is it alive, is it keeping up, and is it running the
 * configuration we think it is.
 *
 * THE LIVENESS BLOCK ALWAYS RENDERS. It is derived from the `agents` row —
 * `last_heartbeat_at`, `uptime_started_at`, `config_revision`,
 * `applied_config_revision` — and needs no health sample at all, which matters
 * because `agent.health` is the least-implemented event upstream and
 * `sampleSource: "none"` is the launch default. The empty state below it
 * describes the CHARTS; it never blanks the facts we do have.
 *
 * Two things the charts refuse to do:
 *
 *  - **A gap is not `idle`.** A bucket with no sample is drawn in the recessed
 *    surface and named in the legend. Painting it as idle invents a fact about
 *    a machine nobody heard from.
 *  - **A simulated sample is never quietly averaged in.** Buckets carrying mock
 *    readings are hatched and labelled, because a generated reading folded into
 *    a real agent's history is indistinguishable from success — the worst
 *    outcome available on this page.
 */
import { useMemo } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { useApp } from "@/lib/store";
import { activity, interpolate } from "@/lib/i18n/activity";
import { BCP47 } from "@/lib/i18n";
import type { HealthBucketDTO, HealthDTO, HeartbeatState } from "@/lib/activity/types";
import { STRIP_COLOR, formatUptime, sparklinePoints, type StripCellState } from "./logic";
import { ActivityEmptyState } from "./EmptyState";
import { Banner, ErrorBlock, useNow } from "./Timeline";

/** The three windows this panel offers. Health is a "what is happening now" view. */
export type HealthRangeDays = 1 | 7 | 30;

const HEARTBEAT_COLOR: Record<HeartbeatState, string> = {
  ok: c.green,
  stale: c.amber,
  dead: c.red,
  // A paused agent is SUPPOSED to be silent. Without this fourth colour every
  // paused agent shows a red dot and operators learn to ignore red dots.
  expected_silence: c.muted,
};

export interface HealthPanelProps {
  health: HealthDTO | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  rangeDays?: HealthRangeDays;
  onRangeDaysChange?: (d: HealthRangeDays) => void;
  onViewDeployment?: () => void;
  onContactAdmin?: () => void;
  onWhatsSupported?: () => void;
}

export function HealthPanel({
  health,
  loading = false,
  error = null,
  onRetry,
  rangeDays = 1,
  onRangeDaysChange,
  onViewDeployment,
  onContactAdmin,
  onWhatsSupported,
}: HealthPanelProps) {
  const { lang } = useApp();
  const t = activity[lang];
  const locale = BCP47[lang];

  const stampFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const relFmt = useMemo(
    () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
    [locale],
  );

  const rangeLabel: Record<HealthRangeDays, string> = {
    1: t.ui.filter.range1d,
    7: t.ui.filter.range7d,
    30: t.ui.filter.range30d,
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
          {t.ui.health.heading}
        </h2>
        {onRangeDaysChange && (
          <div role="group" aria-label={t.ui.filter.range} style={{ display: "flex" }}>
            {([1, 7, 30] as HealthRangeDays[]).map((d) => {
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

      {health && health.managerMode !== "live" && (
        <Banner
          tone="warn"
          text={health.managerMode === "mock" ? t.banner.mock : t.banner.unconfigured}
        />
      )}

      {error ? (
        <ErrorBlock message={error} onRetry={onRetry} />
      ) : loading && !health ? (
        <SkeletonCard />
      ) : !health ? (
        <ActivityEmptyState
          view="health"
          reason={null}
          onViewDeployment={onViewDeployment}
          onContactAdmin={onContactAdmin}
          onWhatsSupported={onWhatsSupported}
        />
      ) : (
        <>
          <Liveness health={health} stampFmt={stampFmt} relFmt={relFmt} />

          {health.buckets.length === 0 || health.sampleSource === "none" ? (
            <ActivityEmptyState
              view="health"
              reason={health.emptyReason}
              onViewDeployment={onViewDeployment}
              onContactAdmin={onContactAdmin}
              onWhatsSupported={onWhatsSupported}
            />
          ) : (
            <Capacity health={health} rangeDays={rangeDays} stampFmt={stampFmt} locale={locale} />
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Liveness — never empty
// ---------------------------------------------------------------------------

function Liveness({
  health,
  stampFmt,
  relFmt,
}: {
  health: HealthDTO;
  stampFmt: Intl.DateTimeFormat;
  relFmt: Intl.RelativeTimeFormat;
}) {
  const { lang } = useApp();
  const t = activity[lang];
  const l = health.liveness;
  // Read after mount. Before that both figures are relative to a clock we are
  // not allowed to read during render, so they fall back to absolute time.
  const now = useNow();

  const heartbeatAge = !l.lastHeartbeatAt
    ? t.ui.health.never
    : now === null
      ? stampFmt.format(new Date(l.lastHeartbeatAt))
      : relativeTime(relFmt, new Date(l.lastHeartbeatAt).getTime() - now);

  const uptime =
    l.uptimeStartedAt !== null && now !== null
      ? formatUptime((now - new Date(l.uptimeStartedAt).getTime()) / 1000)
      : "—";

  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: r.radiusMd,
        background: c.panel,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10.5,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: c.muted,
          marginBottom: 12,
        }}
      >
        {t.ui.health.liveness}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 16,
        }}
      >
        <div>
          <Cap>{t.ui.health.heartbeat}</Cap>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginTop: 5,
              fontSize: 13.5,
              color: c.text,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: HEARTBEAT_COLOR[l.heartbeatState],
                flex: "0 0 auto",
              }}
            />
            {t.heartbeat[l.heartbeatState]}
          </div>
          <div style={{ fontSize: 11.5, color: c.muted, marginTop: 3 }}>{heartbeatAge}</div>
        </div>

        <Metric label={t.ui.health.activeRuns} value={String(l.activeRuns)} />
        <Metric
          label={t.ui.health.uptime}
          value={uptime}
          hint={l.uptimeStartedAt ? stampFmt.format(new Date(l.uptimeStartedAt)) : undefined}
        />
        <Metric label={t.label.restartsObserved} value={String(l.restarts7dObserved)} />
        <div>
          <Cap>{t.ui.health.configuration}</Cap>
          <div style={{ fontSize: 13.5, color: c.text, marginTop: 5 }}>
            {interpolate(t.ui.health.revision, { n: l.configRevision })}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: l.configPending ? c.amber : c.muted,
              marginTop: 3,
              lineHeight: 1.45,
            }}
          >
            {l.configPending
              ? t.label.configPending
              : interpolate(t.ui.health.appliedRevision, { n: l.appliedConfigRevision })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

function Capacity({
  health,
  rangeDays,
  stampFmt,
  locale,
}: {
  health: HealthDTO;
  rangeDays: HealthRangeDays;
  stampFmt: Intl.DateTimeFormat;
  locale: string;
}) {
  const { lang } = useApp();
  const t = activity[lang];
  const buckets = health.buckets;
  const cellMinutes = Math.max(1, Math.round(health.bucketSeconds / 60));

  const spanLabel =
    rangeDays === 1
      ? interpolate(t.ui.health.window, { hours: 24 })
      : rangeDays === 7
        ? t.ui.filter.range7d
        : t.ui.filter.range30d;

  const cpuPeak = peak(buckets, (b) => b.cpuPeak ?? b.cpuPercent);
  const memPeak = peak(buckets, (b) => b.memoryBytes);
  const diskPeak = peak(buckets, (b) => b.diskUsedBytes);
  const memLimit = lastNonNull(buckets, (b) => b.memoryLimitBytes);
  const anyMock = buckets.some((b) => b.mockSamples > 0);
  const anyRollup = buckets.some((b) => b.rollupSamples > 0);

  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: r.radiusMd,
        background: c.panel,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10.5,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: c.muted,
          }}
        >
          {t.ui.health.capacity}
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.faint }}>{spanLabel}</span>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.faint }}>
          {interpolate(t.ui.health.cellSize, { minutes: cellMinutes })}
        </span>
      </div>

      {/* The state strip. One cell per bucket, in time order. */}
      <div style={{ display: "flex", gap: 1, height: 22, overflow: "hidden" }}>
        {buckets.map((b) => {
          const state: StripCellState = b.state ?? "nosample";
          const simulated = b.mockSamples > 0;
          return (
            <span
              key={b.ts}
              title={`${stampFmt.format(new Date(b.ts))} — ${stateLabel(t, b.state)}${
                simulated ? ` (${t.label.simulatedSample})` : ""
              }`}
              style={{
                flex: 1,
                minWidth: 2,
                borderRadius: 1,
                background: STRIP_COLOR[state],
                // Hatching, not a different colour: the state is still what it
                // says, the READING is simulated.
                backgroundImage: simulated
                  ? `repeating-linear-gradient(45deg, ${c.bg} 0 2px, transparent 2px 4px)`
                  : undefined,
              }}
            />
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <Cap>{t.ui.health.legend}</Cap>
        <LegendItem color={STRIP_COLOR.running} label={t.ui.health.stateRunning} />
        <LegendItem color={STRIP_COLOR.idle} label={t.ui.health.stateIdle} />
        <LegendItem color={STRIP_COLOR.unhealthy} label={t.ui.health.stateUnhealthy} />
        <LegendItem color={STRIP_COLOR.stopped} label={t.ui.health.stateStopped} />
        <LegendItem color={STRIP_COLOR.nosample} label={t.ui.health.gap} />
        {anyMock && <LegendItem color={c.line} hatched label={t.label.simulatedSample} />}
        {anyRollup && <span style={{ fontSize: 11, color: c.muted }}>{t.label.rolledUp}</span>}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        <Series
          label={t.ui.health.cpu}
          values={buckets.map((b) => b.cpuPercent)}
          value={fmtPercent(lastNonNull(buckets, (b) => b.cpuPercent), locale)}
          hint={
            cpuPeak === null
              ? undefined
              : interpolate(t.ui.health.peak, { value: fmtPercent(cpuPeak, locale) })
          }
        />
        <Series
          label={t.ui.health.memory}
          values={buckets.map((b) => b.memoryBytes)}
          value={fmtBytes(lastNonNull(buckets, (b) => b.memoryBytes), locale)}
          hint={
            memLimit === null
              ? t.ui.health.noLimit
              : interpolate(t.ui.health.ofLimit, {
                  used: fmtBytes(memPeak, locale),
                  limit: fmtBytes(memLimit, locale),
                })
          }
        />
        <Series
          label={t.ui.health.disk}
          values={buckets.map((b) => b.diskUsedBytes)}
          value={fmtBytes(lastNonNull(buckets, (b) => b.diskUsedBytes), locale)}
          hint={
            diskPeak === null
              ? undefined
              : interpolate(t.ui.health.peak, { value: fmtBytes(diskPeak, locale) })
          }
        />
        <Series
          label={t.ui.health.activeRuns}
          values={buckets.map((b) => b.activeRuns)}
          value={String(buckets[buckets.length - 1]?.activeRuns ?? 0)}
        />
      </div>
    </div>
  );
}

function Series({
  label,
  values,
  value,
  hint,
}: {
  label: string;
  values: Array<number | null>;
  value: string;
  hint?: string;
}) {
  const points = sparklinePoints(values, 100, 28);
  return (
    <div>
      <Cap>{label}</Cap>
      <div style={{ fontSize: 15, color: c.text, marginTop: 4, fontFamily: font.space }}>
        {value}
      </div>
      {points ? (
        <svg
          viewBox="0 0 100 28"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ width: "100%", height: 28, marginTop: 6, display: "block" }}
        >
          <polyline
            points={points}
            fill="none"
            stroke={c.accent}
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <div style={{ height: 28, marginTop: 6 }} />
      )}
      {hint && <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function LegendItem({
  color,
  label,
  hatched,
}: {
  color: string;
  label: string;
  hatched?: boolean;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        aria-hidden="true"
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: color,
          border: `1px solid ${c.line}`,
          backgroundImage: hatched
            ? `repeating-linear-gradient(45deg, ${c.bg} 0 2px, transparent 2px 4px)`
            : undefined,
        }}
      />
      <span style={{ fontSize: 11, color: c.muted }}>{label}</span>
    </span>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <Cap>{label}</Cap>
      <div style={{ fontSize: 13.5, color: c.text, marginTop: 5 }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: c.muted, marginTop: 3 }}>{hint}</div>}
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

function SkeletonCard() {
  return (
    <div
      aria-busy="true"
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
      {[40, 72, 56].map((w, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{ height: 10, width: `${w}%`, borderRadius: 2, background: c.line }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function stateLabel(
  t: (typeof activity)["en"],
  state: HealthBucketDTO["state"],
): string {
  switch (state) {
    case "running":
      return t.ui.health.stateRunning;
    case "idle":
      return t.ui.health.stateIdle;
    case "stopped":
      return t.ui.health.stateStopped;
    case "unhealthy":
      return t.ui.health.stateUnhealthy;
    default:
      return t.ui.health.gap;
  }
}

function peak(buckets: HealthBucketDTO[], pick: (b: HealthBucketDTO) => number | null): number | null {
  let best: number | null = null;
  for (const b of buckets) {
    const v = pick(b);
    if (v === null || !Number.isFinite(v)) continue;
    if (best === null || v > best) best = v;
  }
  return best;
}

function lastNonNull(
  buckets: HealthBucketDTO[],
  pick: (b: HealthBucketDTO) => number | null,
): number | null {
  for (let i = buckets.length - 1; i >= 0; i--) {
    const v = pick(buckets[i]);
    if (v !== null && Number.isFinite(v)) return v;
  }
  return null;
}

function fmtPercent(v: number | null, locale: string): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
}

/**
 * Binary units, because that is what a container reports. `null` is an em dash
 * and never `0 B`: nothing reported and nothing used are different facts.
 */
function fmtBytes(v: number | null, locale: string): string {
  if (v === null || !Number.isFinite(v) || v < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = v;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toLocaleString(locale, { maximumFractionDigits: n < 10 && i > 0 ? 1 : 0 })} ${units[i]}`;
}

/** Largest sensible unit, so a 40-minute-old heartbeat is not "2400 seconds ago". */
function relativeTime(fmt: Intl.RelativeTimeFormat, deltaMs: number): string {
  const abs = Math.abs(deltaMs);
  const min = 60_000;
  if (abs < min) return fmt.format(Math.round(deltaMs / 1000), "second");
  if (abs < 60 * min) return fmt.format(Math.round(deltaMs / min), "minute");
  if (abs < 24 * 60 * min) return fmt.format(Math.round(deltaMs / (60 * min)), "hour");
  return fmt.format(Math.round(deltaMs / (24 * 60 * min)), "day");
}
