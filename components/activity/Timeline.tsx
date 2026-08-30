"use client";

/**
 * The Activity timeline: `agent_runs` and `agent_activities` merged into one
 * feed, newest first, one keyset page at a time.
 *
 * PROPS IN, CALLBACKS OUT. This component owns no fetching. The page holds the
 * filter state and the cursor and calls `fetchTimeline`; the timeline renders
 * what it is handed and says what it wants next. `timelineParams()` below is
 * the bridge — it turns this component's filter state into the exact query
 * `lib/activity/client.ts` sends, so a chip the user can see and a parameter the
 * server actually applies cannot drift apart.
 *
 * Three rules the rows obey:
 *
 *  - **A failed request is not an empty timeline.** `error` renders its own
 *    panel with the filters preserved. Drawing zero rows over a 500 tells the
 *    user their agent did nothing, which is a lie shaped like the truth.
 *  - **Everything the runtime or a model authored is DATA.** Summaries, error
 *    messages and every `params` value are text nodes. Nothing here builds
 *    markup and no string from a row becomes an `href`.
 *  - **A v2 activity row renders from its CODE**, through the four-language
 *    dictionary; only a legacy row or `code = "custom"` renders its own `text`,
 *    and those are badged as agent-written.
 */
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn, HoverDiv } from "@/components/ui";
import { useApp } from "@/lib/store";
import { activity, activityLine, interpolate } from "@/lib/i18n/activity";
import { BCP47 } from "@/lib/i18n";
import { CHANNEL_TYPE_IDS, channelLabel, type ChannelType } from "@/lib/channels";
import {
  ACTIVITY_CODES,
  ACTIVITY_TAGS,
  RUN_STATUSES,
  RUN_TRIGGERS,
  SEVERITIES,
  type ActivityCode,
  type ActivityDTO,
  type ActivityTag,
  type EmptyReason,
  type ManagerMode,
  type RunDTO,
  type RunStatus,
  type RunTrigger,
  type Severity,
  type TimelineItemDTO,
  type TimelineResponseDTO,
} from "@/lib/activity/types";
import type { TimelineParams } from "@/lib/activity/client";
import {
  STATUS_GLYPH,
  TRIGGER_GLYPH,
  dayKey,
  dayLabelKind,
  formatDuration,
  formatMicroUsd,
  formatTokens,
} from "./logic";
import { ActivityEmptyState } from "./EmptyState";

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

/** The four windows the picker offers. 90 is `MAX_RANGE_DAYS`; wider 400s. */
export type RangeDays = 1 | 7 | 30 | 90;
export const RANGE_CHOICES: RangeDays[] = [1, 7, 30, 90];

/**
 * One flat object, because it is also the URL. Every field is a single value
 * even where the API accepts a list: a multi-select for six triggers costs more
 * screen than it earns, and the server's `enumList` takes a one-member list
 * happily.
 */
export interface TimelineFilterState {
  rangeDays: RangeDays;
  q: string;
  severity: Severity | "all";
  /** An activity CODE. Suppresses the run branch server-side, by design. */
  type: ActivityCode | "all";
  trigger: RunTrigger | "all";
  outcome: RunStatus | "all";
  tag: ActivityTag | "all";
  channel: ChannelType | "all";
  /** Set by clicking a row; shown as a removable chip rather than a control. */
  run: string | null;
  session: string | null;
}

export const DEFAULT_TIMELINE_FILTERS: TimelineFilterState = {
  rangeDays: 7,
  q: "",
  severity: "all",
  type: "all",
  trigger: "all",
  outcome: "all",
  tag: "all",
  channel: "all",
  run: null,
  session: null,
};

/** The two codes that carry a `channel` in `params`; see `parseTimelineQuery`. */
const MESSAGE_CODES: readonly ActivityCode[] = ["message.sent", "message.received"];

/** True when the API will accept a `channel` filter alongside this `type`. */
export function channelFilterAllowed(f: TimelineFilterState): boolean {
  return f.type !== "all" && MESSAGE_CODES.includes(f.type);
}

/**
 * Filter state → the query `lib/activity/client.ts` sends.
 *
 * `channel` is dropped unless the type filter permits it. The server answers
 * that combination with a 400 `unsupported_filter`, and a page that can produce
 * an unsendable query has moved a validation rule into a place the user cannot
 * see.
 */
export function timelineParams(
  f: TimelineFilterState,
  opts: { cursor?: string | null; limit?: number; now?: Date } = {},
): TimelineParams {
  const now = opts.now ?? new Date();
  const from = new Date(now.getTime() - f.rangeDays * 86_400_000);
  return {
    from: from.toISOString(),
    to: now.toISOString(),
    cursor: opts.cursor ?? null,
    limit: opts.limit,
    q: f.q.trim() || undefined,
    severity: f.severity === "all" ? undefined : f.severity,
    type: f.type === "all" ? undefined : [f.type],
    trigger: f.trigger === "all" ? undefined : [f.trigger],
    outcome: f.outcome === "all" ? undefined : [f.outcome],
    tag: f.tag === "all" ? undefined : f.tag,
    channel: f.channel === "all" || !channelFilterAllowed(f) ? undefined : f.channel,
    run: f.run ?? undefined,
    session: f.session ?? undefined,
  };
}

/** How many filters are narrowing the feed, for the "{n} on" badge. */
export function activeFilterCount(f: TimelineFilterState): number {
  let n = 0;
  if (f.q.trim()) n += 1;
  for (const v of [f.severity, f.type, f.trigger, f.outcome, f.tag, f.channel]) {
    if (v !== "all") n += 1;
  }
  if (f.run) n += 1;
  if (f.session) n += 1;
  return n;
}

// ---------------------------------------------------------------------------
// Presentation tables
// ---------------------------------------------------------------------------

const SEVERITY_COLOR: Record<Severity, string> = {
  info: c.muted,
  notice: c.blue,
  warning: c.amber,
  error: c.red,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TimelineProps {
  items: TimelineItemDTO[];
  /** Server-computed per-day counts over the returned window. */
  days?: TimelineResponseDTO["days"];
  nextCursor: string | null;
  emptyReason: EmptyReason | null;
  managerMode: ManagerMode;
  ignoredFilters?: string[];
  filters: TimelineFilterState;
  onFiltersChange: (next: TimelineFilterState) => void;
  onLoadMore?: () => void;
  /** First page in flight. `loadingMore` is a subsequent keyset page. */
  loading?: boolean;
  loadingMore?: boolean;
  /** A message from `ActivityFetchError`. Renders instead of an empty state. */
  error?: string | null;
  onRetry?: () => void;
  onOpenRun?: (run: RunDTO) => void;
  /** IANA zone for day bucketing. Defaults to the browser's. */
  timeZone?: string;
  onRunNow?: () => void;
  onOpenChat?: () => void;
  onSetUpSchedule?: () => void;
  onViewDeployment?: () => void;
  onContactAdmin?: () => void;
}

export function Timeline({
  items,
  days,
  nextCursor,
  emptyReason,
  managerMode,
  ignoredFilters,
  filters,
  onFiltersChange,
  onLoadMore,
  loading = false,
  loadingMore = false,
  error = null,
  onRetry,
  onOpenRun,
  timeZone,
  onRunNow,
  onOpenChat,
  onSetUpSchedule,
  onViewDeployment,
  onContactAdmin,
}: TimelineProps) {
  const { lang } = useApp();
  const t = activity[lang];
  const locale = BCP47[lang];

  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }),
    [locale, timeZone],
  );
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone }),
    [locale, timeZone],
  );

  const groups = useMemo(() => groupItems(items, days, timeZone), [items, days, timeZone]);
  const now = useNow();

  const set = (patch: Partial<TimelineFilterState>) => {
    const next = { ...filters, ...patch };
    // Turning the type filter away from the message codes strands the channel
    // filter on a query the server rejects, so it goes with it.
    if (!channelFilterAllowed(next)) next.channel = "all";
    onFiltersChange(next);
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <FilterBar filters={filters} onChange={set} />

      {managerMode !== "live" && (
        <Banner tone="warn" text={managerMode === "mock" ? t.banner.mock : t.banner.unconfigured} />
      )}
      {ignoredFilters && ignoredFilters.length > 0 && (
        <Banner tone="warn" text={`${t.label.ignoredFilters} ${ignoredFilters.join(", ")}`} />
      )}

      {error ? (
        <ErrorBlock message={error} onRetry={onRetry} />
      ) : loading && items.length === 0 ? (
        <SkeletonRows label={t.ui.timeline.loading} />
      ) : items.length === 0 ? (
        <ActivityEmptyState
          view="timeline"
          reason={emptyReason}
          onClearFilters={
            activeFilterCount(filters) > 0
              ? () => onFiltersChange({ ...DEFAULT_TIMELINE_FILTERS, rangeDays: filters.rangeDays })
              : undefined
          }
          onRunNow={onRunNow}
          onOpenChat={onOpenChat}
          onSetUpSchedule={onSetUpSchedule}
          onViewDeployment={onViewDeployment}
          onContactAdmin={onContactAdmin}
        />
      ) : (
        <div
          style={{
            border: `1px solid ${c.border}`,
            borderRadius: r.radiusMd,
            background: c.panel,
            overflow: "hidden",
          }}
        >
          {groups.map((g) => (
            <div key={g.key}>
              <DayHeader
                group={g}
                label={dayHeading(
                  g.key,
                  now,
                  timeZone,
                  t.ui.timeline.today,
                  t.ui.timeline.yesterday,
                  dateFmt,
                )}
              />
              {g.items.map((item) =>
                item.kind === "run" ? (
                  <RunRow
                    key={item.id}
                    run={item}
                    time={timeFmt.format(new Date(item.startedAt))}
                    onOpen={onOpenRun}
                    onScopeSession={(key) => set({ session: key })}
                  />
                ) : (
                  <ActivityRow
                    key={item.id}
                    row={item}
                    time={timeFmt.format(new Date(item.occurredAt))}
                    onScopeRun={(id) => set({ run: id })}
                  />
                ),
              )}
            </div>
          ))}

          <div
            style={{
              padding: "14px 16px",
              borderTop: `1px solid ${c.lineSoft}`,
              display: "flex",
              justifyContent: "center",
            }}
          >
            {nextCursor ? (
              <GhostBtn onClick={() => onLoadMore?.()} disabled={loadingMore || !onLoadMore}>
                {loadingMore ? t.ui.timeline.loading : t.action.loadMore}
              </GhostBtn>
            ) : (
              <span style={{ fontSize: 12.5, color: c.muted, textAlign: "center" }}>
                {t.ui.timeline.endOfRange}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Day grouping
// ---------------------------------------------------------------------------

interface Group {
  key: string;
  items: TimelineItemDTO[];
  runs: number;
  ok: number;
  failed: number;
  running: number;
}

function itemTime(i: TimelineItemDTO): string {
  return i.kind === "run" ? i.startedAt : i.occurredAt;
}

/**
 * Bucket by day in the VIEWER's zone. The server's `days` array wins where its
 * date matches, because it counted the whole window; local counting covers the
 * days it did not name (its bucketing zone is the workspace's, not the
 * viewer's, and the two disagree for a few hours every day).
 */
function groupItems(
  items: TimelineItemDTO[],
  days: TimelineResponseDTO["days"] | undefined,
  timeZone: string | undefined,
): Group[] {
  const order: string[] = [];
  const map = new Map<string, Group>();
  for (const item of items) {
    const key = dayKey(itemTime(item), timeZone);
    let g = map.get(key);
    if (!g) {
      g = { key, items: [], runs: 0, ok: 0, failed: 0, running: 0 };
      map.set(key, g);
      order.push(key);
    }
    g.items.push(item);
    if (item.kind === "run") {
      g.runs += 1;
      if (item.status === "succeeded") g.ok += 1;
      else if (item.status === "failed" || item.status === "timeout") g.failed += 1;
      else if (item.status === "running" || item.status === "queued") g.running += 1;
    }
  }
  if (days) {
    for (const d of days) {
      const g = map.get(d.date);
      if (g) {
        g.runs = d.runs;
        g.ok = d.ok;
        g.failed = d.failed;
        g.running = d.running;
      }
    }
  }
  return order.map((k) => map.get(k)!);
}

/**
 * "Today" and "Yesterday" are relative, so they can only be decided once the
 * clock is readable. Before mount every day gets its date, which is correct
 * rather than merely non-crashing.
 */
function dayHeading(
  key: string,
  now: number | null,
  timeZone: string | undefined,
  todayLabel: string,
  yesterdayLabel: string,
  dateFmt: Intl.DateTimeFormat,
): string {
  const fallback = dateFmt.format(new Date(`${key}T12:00:00`));
  if (now === null) return fallback;
  const kind = dayLabelKind(key, new Date(now), timeZone);
  if (kind === "today") return todayLabel;
  if (kind === "yesterday") return yesterdayLabel;
  return fallback;
}

function DayHeader({ group, label }: { group: Group; label: string }) {
  const { lang } = useApp();
  const t = activity[lang];
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        background: c.glass,
        backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${c.lineSoft}`,
        padding: "9px 16px",
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: c.text2,
        }}
      >
        {label}
      </span>
      {group.runs > 0 && (
        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
          {interpolate(t.ui.timeline.dayCounts, {
            runs: group.runs,
            ok: group.ok,
            failed: group.failed,
          })}
        </span>
      )}
      {group.running > 0 && (
        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.accent }}>
          {interpolate(t.ui.timeline.stillRunning, { n: group.running })}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function RunRow({
  run,
  time,
  onOpen,
  onScopeSession,
}: {
  run: RunDTO;
  time: string;
  onOpen?: (run: RunDTO) => void;
  onScopeSession: (sessionKey: string) => void;
}) {
  const { lang } = useApp();
  const t = activity[lang];
  const locale = BCP47[lang];
  const st = STATUS_GLYPH[run.status];
  const tg = TRIGGER_GLYPH[run.trigger];
  const clickable = Boolean(onOpen);

  return (
    <HoverDiv
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${t.ui.timeline.openRun} ${run.runId}` : undefined}
      onClick={clickable ? () => onOpen?.(run) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen?.(run);
              }
            }
          : undefined
      }
      hoverStyle={clickable ? { background: c.hover } : undefined}
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 16px",
        borderBottom: `1px solid ${c.lineSoft}`,
        cursor: clickable ? "pointer" : "default",
        alignItems: "flex-start",
      }}
    >
      <span aria-hidden="true" style={{ color: st.color, fontSize: 13, lineHeight: "20px", width: 14 }}>
        {st.glyph}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: tg.color }}>
            <span aria-hidden="true" style={{ marginRight: 4 }}>
              {tg.glyph}
            </span>
            {t.trigger[run.trigger]}
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: st.color }}>
            {t.status[run.status]}
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.faint }}>{time}</span>
        </div>

        {run.summary && (
          <div style={{ fontSize: 13.5, color: c.text2, lineHeight: 1.55, marginTop: 4 }}>
            {run.summary}
          </div>
        )}
        {run.errorMessage && (
          <div style={{ fontSize: 12.5, color: c.red, lineHeight: 1.5, marginTop: 4 }}>
            {run.errorCode ? `${t.error[run.errorCode] ?? run.errorCode} — ` : ""}
            {run.errorMessage}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            marginTop: 6,
            fontFamily: font.mono,
            fontSize: 11,
            color: c.muted,
          }}
        >
          <span>{formatDuration(run.durationMs)}</span>
          <span>{interpolate(t.ui.timeline.steps, { n: run.stepCount })}</span>
          <span>{formatTokens(run.usage.totalTokens, locale)}</span>
          <span title={run.usage.unpriced ? t.label.unpricedNote : undefined}>
            {run.usage.unpriced
              ? t.label.unpriced
              : formatMicroUsd(run.usage.costMicroUsd, { locale })}
          </span>
          {run.sessionKey && (
            <ChipBtn
              label={`${t.ui.timeline.sessionLabel} ${truncateId(run.sessionKey)}`}
              onClick={() => onScopeSession(run.sessionKey as string)}
            />
          )}
        </div>
      </div>
    </HoverDiv>
  );
}

function ActivityRow({
  row,
  time,
  onScopeRun,
}: {
  row: ActivityDTO;
  time: string;
  onScopeRun: (runId: string) => void;
}) {
  const { lang } = useApp();
  const t = activity[lang];
  // A v2 row renders from its code through the dictionary; only a legacy row or
  // `custom` renders the agent's own text, and that gets badged as such.
  const sentence = activityLine(t, row.code, row.params, row.text);
  const agentWritten = row.code === null || row.code === "custom";

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "10px 16px",
        borderBottom: `1px solid ${c.lineSoft}`,
        alignItems: "flex-start",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 14,
          display: "flex",
          justifyContent: "center",
          paddingTop: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: SEVERITY_COLOR[row.severity],
            display: "block",
          }}
        />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: c.text2, lineHeight: 1.55, overflowWrap: "anywhere" }}>
          {sentence}
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 4,
            fontFamily: font.mono,
            fontSize: 11,
            color: c.faint,
          }}
        >
          <span>{time}</span>
          <span style={{ color: c.muted }}>{t.tag[row.tag]}</span>
          {row.severity !== "info" && (
            <span style={{ color: SEVERITY_COLOR[row.severity] }}>{t.severity[row.severity]}</span>
          )}
          {agentWritten && <span>{t.label.agentWritten}</span>}
          {row.runId && (
            <ChipBtn
              label={`${t.ui.timeline.runLabel} ${truncateId(row.runId)}`}
              onClick={() => onScopeRun(row.runId as string)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Ids are uuids or runtime strings; a full one eats the row. */
function truncateId(v: string): string {
  return v.length <= 10 ? v : `${v.slice(0, 8)}…`;
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

function FilterBar({
  filters,
  onChange,
}: {
  filters: TimelineFilterState;
  onChange: (patch: Partial<TimelineFilterState>) => void;
}) {
  const { lang } = useApp();
  const t = activity[lang];
  const [open, setOpen] = useState(false);
  const active = activeFilterCount(filters);
  const channelOk = channelFilterAllowed(filters);

  const rangeLabel: Record<RangeDays, string> = {
    1: t.ui.filter.range1d,
    7: t.ui.filter.range7d,
    30: t.ui.filter.range30d,
    90: t.ui.filter.range90d,
  };

  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: r.radiusMd,
        background: c.panel,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div role="group" aria-label={t.ui.filter.range} style={{ display: "flex", gap: 0 }}>
          {RANGE_CHOICES.map((d) => {
            const on = filters.rangeDays === d;
            return (
              <Btn
                key={d}
                onClick={() => onChange({ rangeDays: d })}
                aria-pressed={on}
                hoverStyle={on ? undefined : { color: c.text, borderColor: c.borderMute }}
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  padding: "6px 10px",
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

        <label style={{ flex: 1, minWidth: 160 }}>
          <span
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
              whiteSpace: "nowrap",
            }}
          >
            {t.ui.filter.search}
          </span>
          <input
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder={t.label.searchPlaceholder}
            maxLength={120}
            style={{
              width: "100%",
              background: c.panelDeep,
              border: `1px solid ${c.borderField}`,
              borderRadius: r.radiusSm,
              color: c.text,
              fontSize: 13,
              padding: "7px 10px",
              fontFamily: font.sans,
            }}
          />
        </label>

        <Btn
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          hoverStyle={{ color: c.text, borderColor: c.borderMute }}
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            padding: "6px 10px",
            cursor: "pointer",
            background: "transparent",
            color: active > 0 ? c.accent : c.muted,
            border: `1px solid ${active > 0 ? c.limeBorder : c.borderField}`,
            borderRadius: r.radiusSm,
          }}
        >
          {t.ui.filter.heading}
          {active > 0 ? ` · ${interpolate(t.ui.filter.activeCount, { n: active })}` : ""}
          <span aria-hidden="true" style={{ marginLeft: 6 }}>
            {open ? "▴" : "▾"}
          </span>
        </Btn>

        {active > 0 && (
          <GhostBtn onClick={() => onChange({ ...DEFAULT_TIMELINE_FILTERS, rangeDays: filters.rangeDays })}>
            {t.action.clearFilters}
          </GhostBtn>
        )}
      </div>

      {(filters.run || filters.session) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {filters.run && (
            <ScopeChip
              label={interpolate(t.ui.filter.runScope, { id: truncateId(filters.run) })}
              removeLabel={t.ui.filter.remove}
              onRemove={() => onChange({ run: null })}
            />
          )}
          {filters.session && (
            <ScopeChip
              label={interpolate(t.ui.filter.sessionScope, { id: truncateId(filters.session) })}
              removeLabel={t.ui.filter.remove}
              onRemove={() => onChange({ session: null })}
            />
          )}
        </div>
      )}

      {open && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
            borderTop: `1px solid ${c.lineSoft}`,
            paddingTop: 12,
          }}
        >
          <Select
            label={t.ui.filter.severity}
            value={filters.severity}
            onChange={(v) => onChange({ severity: v as Severity | "all" })}
            options={[
              { value: "all", label: t.ui.filter.all },
              ...SEVERITIES.map((s) => ({ value: s, label: t.severity[s] })),
            ]}
          />
          {/* Activity CODES are identifiers, not prose, and are listed verbatim
              in every language — the same rule `ActivityDict.metric` documents.
              Their dictionary entries are sentences with `{holes}` ("Run
              {status} after {durationMs} ms"), which read as broken menu items,
              and inventing 24 more nouns in four languages would put made-up
              vocabulary in front of a customer. */}
          <Select
            label={t.ui.filter.type}
            value={filters.type}
            onChange={(v) => onChange({ type: v as ActivityCode | "all" })}
            options={[
              { value: "all", label: t.ui.filter.all },
              ...ACTIVITY_CODES.map((code) => ({ value: code, label: code })),
            ]}
          />
          <Select
            label={t.ui.filter.trigger}
            value={filters.trigger}
            onChange={(v) => onChange({ trigger: v as RunTrigger | "all" })}
            options={[
              { value: "all", label: t.ui.filter.all },
              ...RUN_TRIGGERS.map((x) => ({ value: x, label: t.trigger[x] })),
            ]}
          />
          <Select
            label={t.ui.filter.outcome}
            value={filters.outcome}
            onChange={(v) => onChange({ outcome: v as RunStatus | "all" })}
            options={[
              { value: "all", label: t.ui.filter.all },
              ...RUN_STATUSES.map((x) => ({ value: x, label: t.status[x] })),
            ]}
          />
          <Select
            label={t.ui.filter.tag}
            value={filters.tag}
            onChange={(v) => onChange({ tag: v as ActivityTag | "all" })}
            options={[
              { value: "all", label: t.ui.filter.all },
              ...ACTIVITY_TAGS.map((x) => ({ value: x, label: t.tag[x] })),
            ]}
          />
          <Select
            label={t.ui.filter.channel}
            value={filters.channel}
            disabled={!channelOk}
            hint={channelOk ? undefined : t.ui.filter.channelHint}
            onChange={(v) => onChange({ channel: v as ChannelType | "all" })}
            options={[
              { value: "all", label: t.ui.filter.all },
              ...CHANNEL_TYPE_IDS.map((x) => ({ value: x, label: channelLabel(x) })),
            ]}
          />
          <div style={{ gridColumn: "1 / -1", fontSize: 12, color: c.muted, lineHeight: 1.5 }}>
            {t.ui.filter.maxRange}
          </div>
        </div>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <span
        style={{
          fontFamily: font.mono,
          fontSize: 10.5,
          letterSpacing: ".07em",
          textTransform: "uppercase",
          color: c.muted,
        }}
      >
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: c.panelDeep,
          border: `1px solid ${c.borderField}`,
          borderRadius: r.radiusSm,
          color: disabled ? c.faint : c.text,
          fontSize: 12.5,
          padding: "6px 8px",
          fontFamily: font.sans,
          cursor: disabled ? "not-allowed" : "pointer",
          width: "100%",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span style={{ fontSize: 11, color: c.muted, lineHeight: 1.45 }}>{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------

/**
 * The wall clock, as an external store.
 *
 * Never read during render: a component that calls `Date.now()` while rendering
 * is impure, and on a server-rendered page it also produces a "Today" header
 * the client then disagrees with. This is one shared 30-second tick for every
 * consumer rather than a timer per component, and it reports `null` until the
 * first subscription — every caller has a rendering for that (an absolute
 * timestamp instead of a relative one), which is honest degradation rather than
 * a guess about what time it is on the server.
 */
const clock = {
  ms: 0,
  listeners: new Set<() => void>(),
  timer: null as ReturnType<typeof setInterval> | null,
  subscribe(onChange: () => void): () => void {
    clock.listeners.add(onChange);
    if (clock.timer === null) {
      clock.ms = Date.now();
      clock.timer = setInterval(() => {
        clock.ms = Date.now();
        for (const fn of clock.listeners) fn();
      }, 30_000);
    }
    // The store moved between render and subscribe: re-read once.
    onChange();
    return () => {
      clock.listeners.delete(onChange);
      if (clock.listeners.size === 0 && clock.timer !== null) {
        clearInterval(clock.timer);
        clock.timer = null;
      }
    };
  },
  read(): number | null {
    return clock.ms === 0 ? null : clock.ms;
  },
  readServer(): number | null {
    return null;
  },
};

export function useNow(): number | null {
  return useSyncExternalStore(clock.subscribe, clock.read, clock.readServer);
}

export function GhostBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Btn
      onClick={onClick}
      disabled={disabled}
      hoverStyle={disabled ? undefined : { color: c.text, borderColor: c.borderMute }}
      style={{
        fontFamily: font.mono,
        fontSize: 11.5,
        letterSpacing: ".04em",
        padding: "7px 12px",
        borderRadius: r.radiusSm,
        background: "transparent",
        color: disabled ? c.faint : c.text2,
        border: `1px solid ${c.borderField}`,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </Btn>
  );
}

/**
 * A failed request, rendered as a failure. Shared by all three panels so none of
 * them can quietly fall back to an empty state — "your agent did nothing" and
 * "we couldn't ask" are different sentences and must never share a rendering.
 */
export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { lang } = useApp();
  const t = activity[lang];
  return (
    <div
      role="alert"
      style={{
        border: `1px solid ${c.redBorder}`,
        background: c.redWash,
        borderRadius: r.radiusMd,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13.5, color: c.text2 }}>
        <span aria-hidden="true" style={{ marginRight: 8 }}>
          ▲
        </span>
        {t.label.loadFailed}
      </div>
      <div style={{ fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>{message}</div>
      {onRetry && (
        <div>
          <GhostBtn onClick={onRetry}>{t.action.tryAgain}</GhostBtn>
        </div>
      )}
    </div>
  );
}

function ChipBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Btn
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      hoverStyle={{ color: c.text, borderColor: c.borderMute }}
      style={{
        fontFamily: font.mono,
        fontSize: 10.5,
        padding: "1px 7px",
        borderRadius: 999,
        background: "transparent",
        color: c.muted,
        border: `1px solid ${c.border}`,
        cursor: "pointer",
      }}
    >
      {label}
    </Btn>
  );
}

function ScopeChip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "3px 4px 3px 10px",
        borderRadius: 999,
        background: c.limeWash,
        border: `1px solid ${c.limeBorder}`,
        fontFamily: font.mono,
        fontSize: 11,
        color: c.accent,
      }}
    >
      {label}
      <Btn
        onClick={onRemove}
        aria-label={removeLabel}
        hoverStyle={{ color: c.text }}
        style={{
          background: "transparent",
          border: "none",
          color: c.muted,
          cursor: "pointer",
          fontSize: 12,
          lineHeight: 1,
          padding: "2px 6px",
        }}
      >
        ✕
      </Btn>
    </span>
  );
}

/**
 * A degradation banner. NOT dismissible: a dismissed banner over generated data
 * looks exactly like production, which is the failure it exists to prevent.
 */
export function Banner({ tone, text }: { tone: "warn"; text: string }) {
  return (
    <div
      role="status"
      style={{
        border: `1px solid ${tone === "warn" ? c.borderStrong : c.border}`,
        background: c.panelDeep,
        borderRadius: r.radiusMd,
        padding: "10px 14px",
        fontSize: 12.5,
        color: c.text2,
        lineHeight: 1.5,
        display: "flex",
        gap: 8,
      }}
    >
      <span aria-hidden="true" style={{ color: c.amber }}>
        ▲
      </span>
      <span>{text}</span>
    </div>
  );
}

function SkeletonRows({ label }: { label: string }) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: r.radiusMd,
        background: c.panel,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span
            aria-hidden="true"
            style={{ width: 8, height: 8, borderRadius: "50%", background: c.line }}
          />
          <span
            aria-hidden="true"
            style={{
              height: 9,
              borderRadius: 2,
              background: c.line,
              width: `${[62, 44, 71, 38][i]}%`,
            }}
          />
        </div>
      ))}
    </div>
  );
}
