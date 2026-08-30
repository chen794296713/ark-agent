"use client";

/**
 * SCHEDULES — when the agent starts work on its own. §E.4.
 *
 * The design decision that matters here is the PREVIEW. A cron expression is a
 * write-only language for most people: `0 9 * * 1-5` is either "weekdays at nine" or
 * "the ninth minute of every hour on Monday" depending on how confident you are,
 * and the difference is 250 unwanted runs a month. So the panel answers the question
 * the expression cannot: the next three instants it will actually fire, in the
 * schedule's own timezone, recomputed from the DRAFT as you type. If the expression
 * fires never, it says never rather than showing an empty list.
 *
 * The preview is computed with the same `lib/schedule/cron` engine the server runs,
 * so what the row promises is what the scheduler does — including the DST rules,
 * which is where a re-implementation would quietly disagree twice a year.
 *
 * Timing is deliberately hydration-safe: "now" does not exist during SSR, so the
 * preview renders as a placeholder on the server and fills in after mount. Reading
 * `Date.now()` during a server render is how a schedule list ends up with a
 * hydration mismatch on every page load.
 */
import { useMemo, useState, useSyncExternalStore } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { manage, mt } from "@/lib/i18n/manage";
import type { ManageDict } from "@/lib/i18n/manage";
import type { Lang } from "@/lib/types";
import { describeCron } from "@/lib/schedule/describe";
import { nextRuns } from "@/lib/schedule/cron";
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  ErrorPanel,
  Field,
  HScroll,
  InlineError,
  LinkBtn,
  Seg,
  SelectField,
  SettingCard,
  Toggle,
  sInput,
} from "./primitives";
import { LIMITS, draftId, formatInterval } from "./logic";
import type { ErrorMap } from "./logic";
import type {
  ScheduleDeliverTo,
  ScheduleKind,
  ScheduleLastStatus,
  ScheduleRow,
  ScheduleRunRow,
} from "./types";
import { NumberField } from "./RulesPanel";
import { errText, fieldDomId, formatTime, formatWhen, localeOf } from "./DirtyBar";

/**
 * "Now", to the minute, as an EXTERNAL store rather than a `Date.now()` read in the
 * render body. Two things fall out of that, both required: the server snapshot is
 * `null`, so SSR renders a placeholder instead of a timestamp it cannot agree with
 * on hydration; and the snapshot is stable within a minute, so the preview neither
 * churns on every keystroke nor goes stale while the tab is open.
 */
const MINUTE = 60_000;

function subscribeMinute(onChange: () => void): () => void {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
}

function minuteSnapshot(): number {
  return Math.floor(Date.now() / MINUTE) * MINUTE;
}

function noMinuteOnServer(): null {
  return null;
}

const STATUS_COLOR: Record<ScheduleLastStatus, string> = {
  started: c.blue,
  succeeded: c.accent,
  failed: c.red,
  skipped: c.muted,
};

const STATUS_GLYPH: Record<ScheduleLastStatus, string> = {
  started: "◍",
  succeeded: "✓",
  failed: "▲",
  skipped: "·",
};

function statusLabel(t: ManageDict, s: ScheduleLastStatus): string {
  switch (s) {
    case "started":
      return t.lsStarted;
    case "succeeded":
      return t.lsSucceeded;
    case "failed":
      return t.lsFailed;
    case "skipped":
      return t.lsSkipped;
  }
}

function kindLabel(t: ManageDict, k: ScheduleKind): string {
  return k === "cron" ? t.kCron : k === "interval" ? t.kInterval : t.kOnce;
}

/**
 * The next `count` fire instants for a DRAFT row. Returns `[]` for "never fires"
 * and `null` for "the expression does not parse" — a distinction the caller needs,
 * because one is a legitimate schedule and the other is a typo.
 */
export function previewRuns(s: ScheduleRow, nowMs: number, count = 3): Date[] | null {
  try {
    if (s.kind === "cron") {
      if (!s.cronExpr?.trim()) return null;
      return nextRuns(s.cronExpr.trim(), new Date(nowMs), s.timezone, count);
    }
    if (s.kind === "interval") {
      const secs = s.intervalSeconds ?? 0;
      if (!Number.isFinite(secs) || secs <= 0) return null;
      const step = secs * 1000;
      const base = s.lastRunAt ? new Date(s.lastRunAt).getTime() : nowMs;
      if (!Number.isFinite(base)) return null;
      let cursor = base;
      if (cursor <= nowMs) {
        // Jump the whole gap in one step rather than looping: a 60-second interval
        // whose last run was a week ago is 10,080 iterations of nothing.
        cursor += Math.floor((nowMs - cursor) / step + 1) * step;
      }
      const out: Date[] = [];
      for (let i = 0; i < count; i++) {
        out.push(new Date(cursor));
        cursor += step;
      }
      return out;
    }
    if (!s.runAt) return null;
    const at = new Date(s.runAt);
    if (Number.isNaN(at.getTime())) return null;
    // A one-shot keeps its `run_at` forever. Once it has passed it fires no more.
    return at.getTime() > nowMs ? [at] : [];
  } catch {
    return null;
  }
}

export function SchedulesPanel({
  lang,
  schedules,
  baseSchedules,
  errors,
  disabled = false,
  unavailable = false,
  loadError = null,
  history = {},
  historyLoading = [],
  historyError = {},
  onLoadHistory,
  onRetry,
  onChange,
}: {
  lang: Lang;
  schedules: ScheduleRow[];
  baseSchedules: ScheduleRow[];
  errors: ErrorMap;
  disabled?: boolean;
  /** The schedules endpoint is absent from this build. */
  unavailable?: boolean;
  loadError?: string | null;
  /** Run history by schedule id. A missing key means "not loaded", not "empty". */
  history?: Record<string, ScheduleRunRow[]>;
  historyLoading?: string[];
  historyError?: Record<string, string>;
  onLoadHistory?: (id: string) => void;
  onRetry?: () => void;
  onChange: (next: ScheduleRow[]) => void;
}) {
  const t = manage[lang];
  const nowMs = useSyncExternalStore<number | null>(
    subscribeMinute,
    minuteSnapshot,
    noMinuteOnServer,
  );

  const [openEditor, setOpenEditor] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ScheduleRow | null>(null);
  const [pauseAllOpen, setPauseAllOpen] = useState(false);

  const baseById = useMemo(() => new Map(baseSchedules.map((x) => [x.id, x])), [baseSchedules]);

  let dirtyCount = 0;
  for (const s of schedules) {
    const was = baseById.get(s.id);
    if (!was) {
      dirtyCount += 1;
      continue;
    }
    dirtyCount += countDiff(was, s);
  }
  for (const was of baseSchedules) if (!schedules.some((x) => x.id === was.id)) dirtyCount += 1;

  const errorCount = Object.keys(errors).filter((k) => k.startsWith("schedules.")).length;
  const enabledCount = schedules.filter((x) => x.enabled).length;

  function patch(id: string, next: Partial<ScheduleRow>) {
    onChange(schedules.map((x) => (x.id === id ? { ...x, ...next } : x)));
  }

  function add() {
    const id = draftId("sched");
    const row: ScheduleRow = {
      id,
      name: t.newScheduleDefault,
      kind: "cron",
      cronExpr: "0 9 * * 1-5",
      intervalSeconds: null,
      runAt: null,
      // The browser's zone, not UTC: a schedule written at 9am means 9am HERE, and
      // defaulting to UTC is how a European user gets an 11am "morning" sweep.
      timezone: guessTimeZone(),
      prompt: "",
      deliverTo: "chat",
      maxRunsPerDay: 24,
      enabled: true,
      nextRunAt: null,
      lastRunAt: null,
      lastStatus: null,
    };
    onChange([...schedules, row]);
    setOpenEditor(id);
  }

  return (
    <SettingCard
      title={t.schedulesTitle}
      sectionId="cfg-schedules"
      desc={t.schedulesDesc}
      dirtyCount={dirtyCount}
      errorCount={errorCount}
      editedLabel={t.edited}
      problemLabel={mt(errorCount === 1 ? t.problemOne : t.problemMany, { n: errorCount })}
      actions={
        enabledCount > 0 ? (
          <LinkBtn onClick={() => setPauseAllOpen(true)} disabled={disabled}>
            {t.pauseAll}
          </LinkBtn>
        ) : undefined
      }
    >
      {loadError && (
        <ErrorPanel
          title={t.configLoadError}
          body={loadError}
          onRetry={onRetry}
          retryLabel={t.tryAgain}
        />
      )}
      {unavailable && <ErrorPanel title={t.schedulesUnavailable} />}

      {schedules.length === 0 ? (
        <EmptyState
          glyph="◷"
          title={t.noSchedulesTitle}
          body={t.noSchedulesBody}
          actions={
            <GhostBtn label={t.addSchedule} onClick={add} disabled={disabled || unavailable} />
          }
        />
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {schedules.map((row) => (
              <ScheduleCard
                key={row.id}
                lang={lang}
                row={row}
                base={baseById.get(row.id)}
                errors={errors}
                nowMs={nowMs}
                disabled={disabled}
                editing={openEditor === row.id}
                showHistory={openHistory === row.id}
                history={history[row.id]}
                historyLoading={historyLoading.includes(row.id)}
                historyError={historyError[row.id] ?? null}
                onToggleEdit={() => setOpenEditor((v) => (v === row.id ? null : row.id))}
                onToggleHistory={() => {
                  setOpenHistory((v) => {
                    const next = v === row.id ? null : row.id;
                    if (next && history[row.id] === undefined) onLoadHistory?.(row.id);
                    return next;
                  });
                }}
                onPatch={(next) => patch(row.id, next)}
                onDelete={() => setDeleting(row)}
              />
            ))}
          </ul>
          <div>
            <GhostBtn label={t.addSchedule} onClick={add} disabled={disabled || unavailable} />
          </div>
        </>
      )}

      {deleting && (
        <ConfirmDialog
          title={mt(t.deleteScheduleTitle, { name: deleting.name })}
          body={t.deleteScheduleBody}
          confirmLabel={t.deleteSchedule}
          cancelLabel={t.cancel}
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            onChange(schedules.filter((x) => x.id !== deleting.id));
            if (openEditor === deleting.id) setOpenEditor(null);
            if (openHistory === deleting.id) setOpenHistory(null);
            setDeleting(null);
          }}
        />
      )}

      {pauseAllOpen && (
        <ConfirmDialog
          title={t.pauseAllTitle}
          body={mt(t.pauseAllBody, { n: enabledCount })}
          confirmLabel={t.pauseAll}
          cancelLabel={t.cancel}
          danger
          onCancel={() => setPauseAllOpen(false)}
          onConfirm={() => {
            onChange(schedules.map((x) => (x.enabled ? { ...x, enabled: false } : x)));
            setPauseAllOpen(false);
          }}
        />
      )}
    </SettingCard>
  );
}

/** How many of the ten editable fields differ. Used only for the edited badge. */
function countDiff(a: ScheduleRow, b: ScheduleRow): number {
  const keys: (keyof ScheduleRow)[] = [
    "name",
    "kind",
    "cronExpr",
    "intervalSeconds",
    "runAt",
    "timezone",
    "prompt",
    "deliverTo",
    "maxRunsPerDay",
    "enabled",
  ];
  return keys.filter((k) => a[k] !== b[k]).length;
}

function guessTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function ScheduleCard({
  lang,
  row,
  base,
  errors,
  nowMs,
  disabled,
  editing,
  showHistory,
  history,
  historyLoading,
  historyError,
  onToggleEdit,
  onToggleHistory,
  onPatch,
  onDelete,
}: {
  lang: Lang;
  row: ScheduleRow;
  base: ScheduleRow | undefined;
  errors: ErrorMap;
  nowMs: number | null;
  disabled: boolean;
  editing: boolean;
  showHistory: boolean;
  history: ScheduleRunRow[] | undefined;
  historyLoading: boolean;
  historyError: string | null;
  onToggleEdit: () => void;
  onToggleHistory: () => void;
  onPatch: (next: Partial<ScheduleRow>) => void;
  onDelete: () => void;
}) {
  const t = manage[lang];
  const locale = localeOf(lang);
  const p = (field: string) => `schedules.${row.id}.${field}`;
  const err = (field: string) => errText(t, errors[p(field)]);
  const rowHasError = Object.keys(errors).some((k) => k.startsWith(`schedules.${row.id}.`));
  const isNew = !base;
  const dirty = isNew || countDiff(base, row) > 0;

  const preview = nowMs === null ? undefined : previewRuns(row, nowMs);
  const summary =
    row.kind === "cron"
      ? (row.cronExpr ? describeCron(row.cronExpr, lang) : null)
      : row.kind === "interval"
        ? `${t.schedInterval} ${formatInterval(row.intervalSeconds ?? 0)}`
        : formatWhen(row.runAt, lang);

  return (
    <li
      style={{
        border: `1px solid ${rowHasError ? c.redBorder : c.border}`,
        borderLeft: `2px solid ${dirty ? c.amber : rowHasError ? c.redBorder : c.border}`,
        borderRadius: r.radiusSm,
        background: c.panelDeep,
        padding: 14,
        display: "grid",
        gap: 12,
        opacity: row.enabled ? 1 : 0.72,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: c.text, overflowWrap: "anywhere" }}>{row.name}</span>
            <Badge text={kindLabel(t, row.kind)} />
            {!row.enabled && <Badge text={t.pauseSchedule} color={c.amber} glyph="‖" />}
            {row.lastStatus && (
              <Badge
                text={statusLabel(t, row.lastStatus)}
                color={STATUS_COLOR[row.lastStatus]}
                glyph={STATUS_GLYPH[row.lastStatus]}
              />
            )}
          </div>

          {summary && (
            <div style={{ fontSize: 12.5, color: c.muted, marginTop: 5, lineHeight: 1.5 }}>
              {summary} · {row.timezone}
            </div>
          )}

          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: c.faint,
              marginTop: 5,
              lineHeight: 1.6,
            }}
          >
            <div>
              {t.nextRun}:{" "}
              {!row.enabled
                ? "—"
                : preview === undefined
                  ? "…"
                  : preview === null || preview.length === 0
                    ? t.nextRunNone
                    : formatWhen(preview[0]!.toISOString(), lang)}
            </div>
            {row.enabled && preview && preview.length > 1 && (
              <div>
                {t.nextThree}:{" "}
                {preview
                  .slice(1)
                  .map((d) => formatWhen(d.toISOString(), lang))
                  .join(" · ")}
              </div>
            )}
            <div>
              {t.lastRun}: {row.lastRunAt ? formatWhen(row.lastRunAt, lang) : t.neverRun}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Toggle
            on={row.enabled}
            disabled={disabled}
            label={row.enabled ? t.pauseSchedule : t.resumeSchedule}
            onChange={(v) => onPatch({ enabled: v })}
          />
          <LinkBtn onClick={onToggleEdit} ariaExpanded={editing} disabled={disabled}>
            {editing ? t.doneEditing : t.editSchedule}
          </LinkBtn>
          <LinkBtn onClick={onToggleHistory} ariaExpanded={showHistory}>
            {showHistory ? t.hideHistory : t.showHistory}
          </LinkBtn>
          <LinkBtn onClick={onDelete} danger disabled={disabled}>
            {t.deleteSchedule}
          </LinkBtn>
        </div>
      </div>

      {editing && (
        <div
          style={{
            borderTop: `1px solid ${c.lineSoft}`,
            paddingTop: 14,
            display: "grid",
            gap: 16,
          }}
        >
          <Field
            label={t.schedName}
            error={err("name")}
            dirty={isNew || base.name !== row.name}
            onRevert={base ? () => onPatch({ name: base.name }) : undefined}
            revertLabel={t.revertField}
            htmlFor={fieldDomId(p("name"))}
          >
            <input
              id={fieldDomId(p("name"))}
              type="text"
              value={row.name}
              disabled={disabled}
              maxLength={LIMITS.scheduleNameMax * 2}
              onChange={(e) => onPatch({ name: e.target.value })}
              style={{ ...sInput, borderColor: err("name") ? c.red : c.borderField }}
            />
          </Field>

          <Field
            label={t.schedKind}
            dirty={isNew || base.kind !== row.kind}
            onRevert={base ? () => onPatch({ kind: base.kind }) : undefined}
            revertLabel={t.revertField}
          >
            <Seg<ScheduleKind>
              value={row.kind}
              label={t.schedKind}
              onChange={(v) => !disabled && onPatch({ kind: v })}
              options={[
                { id: "cron", label: t.kCron },
                { id: "interval", label: t.kInterval },
                { id: "once", label: t.kOnce },
              ]}
            />
          </Field>

          {row.kind === "cron" && (
            <Field
              label={t.schedCron}
              hint={t.cronHelp}
              error={err("cronExpr")}
              dirty={isNew || base.cronExpr !== row.cronExpr}
              onRevert={base ? () => onPatch({ cronExpr: base.cronExpr }) : undefined}
              revertLabel={t.revertField}
              htmlFor={fieldDomId(p("cronExpr"))}
            >
              <input
                id={fieldDomId(p("cronExpr"))}
                type="text"
                spellCheck={false}
                autoComplete="off"
                value={row.cronExpr ?? ""}
                disabled={disabled}
                onChange={(e) => onPatch({ cronExpr: e.target.value })}
                style={{
                  ...sInput,
                  fontFamily: font.mono,
                  fontSize: 13,
                  borderColor: err("cronExpr") ? c.red : c.borderField,
                }}
              />
            </Field>
          )}

          {row.kind === "interval" && (
            <NumberField
              lang={lang}
              label={`${t.schedInterval} (${t.intervalSecondsUnit})`}
              hint={formatInterval(row.intervalSeconds ?? 0)}
              path={p("intervalSeconds")}
              value={row.intervalSeconds ?? NaN}
              baseValue={base?.intervalSeconds ?? NaN}
              error={err("intervalSeconds")}
              disabled={disabled}
              onChange={(n) => onPatch({ intervalSeconds: Number.isFinite(n) ? n : null })}
            />
          )}

          {row.kind === "once" && (
            <Field
              label={t.schedRunAt}
              error={err("runAt")}
              dirty={isNew || base.runAt !== row.runAt}
              onRevert={base ? () => onPatch({ runAt: base.runAt }) : undefined}
              revertLabel={t.revertField}
              htmlFor={fieldDomId(p("runAt"))}
            >
              <input
                id={fieldDomId(p("runAt"))}
                type="datetime-local"
                value={toLocalInput(row.runAt)}
                disabled={disabled}
                onChange={(e) => onPatch({ runAt: fromLocalInput(e.target.value) })}
                style={{
                  ...sInput,
                  fontFamily: font.mono,
                  fontSize: 13,
                  borderColor: err("runAt") ? c.red : c.borderField,
                }}
              />
            </Field>
          )}

          <Field
            label={t.schedTimezone}
            error={err("timezone")}
            dirty={isNew || base.timezone !== row.timezone}
            onRevert={base ? () => onPatch({ timezone: base.timezone }) : undefined}
            revertLabel={t.revertField}
            htmlFor={fieldDomId(p("timezone"))}
          >
            <input
              id={fieldDomId(p("timezone"))}
              type="text"
              spellCheck={false}
              autoComplete="off"
              value={row.timezone}
              disabled={disabled}
              onChange={(e) => onPatch({ timezone: e.target.value })}
              style={{
                ...sInput,
                fontFamily: font.mono,
                fontSize: 13,
                borderColor: err("timezone") ? c.red : c.borderField,
              }}
            />
          </Field>

          <Field
            label={t.schedPrompt}
            hint={t.schedPromptHint}
            error={err("prompt")}
            dirty={isNew || base.prompt !== row.prompt}
            onRevert={base ? () => onPatch({ prompt: base.prompt }) : undefined}
            revertLabel={t.revertField}
            htmlFor={fieldDomId(p("prompt"))}
          >
            <textarea
              id={fieldDomId(p("prompt"))}
              value={row.prompt}
              rows={3}
              disabled={disabled}
              maxLength={LIMITS.schedulePromptMax * 2}
              onChange={(e) => onPatch({ prompt: e.target.value })}
              style={{
                ...sInput,
                resize: "vertical",
                lineHeight: 1.6,
                borderColor: err("prompt") ? c.red : c.borderField,
              }}
            />
          </Field>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: r.col2 }}>
            <Field
              label={t.schedDeliver}
              dirty={isNew || base.deliverTo !== row.deliverTo}
              onRevert={base ? () => onPatch({ deliverTo: base.deliverTo }) : undefined}
              revertLabel={t.revertField}
              htmlFor={fieldDomId(p("deliverTo"))}
            >
              <SelectField
                id={fieldDomId(p("deliverTo"))}
                value={row.deliverTo}
                onChange={(v) => onPatch({ deliverTo: v as ScheduleDeliverTo })}
                options={[
                  { id: "chat", label: t.dChat },
                  { id: "email", label: t.dEmail },
                  { id: "channel", label: t.dChannel },
                  { id: "none", label: t.dNone },
                ]}
              />
            </Field>

            <NumberField
              lang={lang}
              label={t.schedMaxRuns}
              hint={t.schedMaxRunsHint}
              path={p("maxRunsPerDay")}
              value={row.maxRunsPerDay}
              baseValue={base?.maxRunsPerDay ?? row.maxRunsPerDay}
              error={err("maxRunsPerDay")}
              disabled={disabled}
              onChange={(n) => onPatch({ maxRunsPerDay: n })}
            />
          </div>
        </div>
      )}

      {showHistory && (
        <div style={{ borderTop: `1px solid ${c.lineSoft}`, paddingTop: 12, display: "grid", gap: 8 }}>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              letterSpacing: ".1em",
              color: c.muted,
            }}
          >
            {t.historyTitle}
          </div>
          {historyError ? (
            <ErrorPanel title={t.historyError} body={historyError} />
          ) : historyLoading || history === undefined ? (
            <div style={{ fontSize: 13, color: c.muted }}>{t.historyLoading}</div>
          ) : history.length === 0 ? (
            <div style={{ fontSize: 13, color: c.muted }}>{t.historyEmpty}</div>
          ) : (
            <HScroll>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 460 }}>
                <thead>
                  <tr>
                    {[t.lastRun, t.filterOutcome, t.durationLabel, t.reasonLabel].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        style={{
                          textAlign: "left",
                          fontFamily: font.mono,
                          fontSize: 10.5,
                          letterSpacing: ".08em",
                          color: c.muted,
                          fontWeight: 400,
                          padding: "6px 10px 6px 0",
                          borderBottom: `1px solid ${c.lineSoft}`,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((run) => (
                    <tr key={run.id}>
                      <td style={cell}>{formatTime(run.startedAt, lang)}</td>
                      <td style={cell}>
                        <Badge
                          text={statusLabel(t, run.status)}
                          color={STATUS_COLOR[run.status]}
                          glyph={STATUS_GLYPH[run.status]}
                        />
                      </td>
                      <td style={cell}>
                        {run.durationMs === null
                          ? "—"
                          : `${(run.durationMs / 1000).toLocaleString(locale, {
                              maximumFractionDigits: 1,
                            })}s`}
                      </td>
                      {/* The reason is a machine token from the claim protocol —
                          instance_stopped, max_runs_per_day, overlap. Shown verbatim
                          rather than guessed at, so a support answer can quote it. */}
                      <td style={{ ...cell, fontFamily: font.mono, fontSize: 11 }}>
                        {run.reason ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </HScroll>
          )}
        </div>
      )}

      {!editing && rowHasError && (
        <InlineError text={mt(t.problemMany, { n: countRowErrors(errors, row.id) })} />
      )}
    </li>
  );
}

function countRowErrors(errors: ErrorMap, id: string): number {
  return Object.keys(errors).filter((k) => k.startsWith(`schedules.${id}.`)).length;
}

const cell = {
  padding: "8px 10px 8px 0",
  borderBottom: `1px solid ${c.lineSoft}`,
  fontSize: 12.5,
  color: c.text2,
  whiteSpace: "nowrap" as const,
};

/**
 * `datetime-local` speaks LOCAL wall-clock with no zone, while `run_at` is an
 * instant. The conversion has to go through the local offset in both directions or
 * every one-shot drifts by the user's UTC offset the moment it is edited.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function GhostBtn({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Btn
      type="button"
      onClick={onClick}
      disabled={disabled}
      hoverStyle={disabled ? undefined : { borderColor: c.limeBorder, color: c.accent }}
      style={{
        border: `1px solid ${c.borderField}`,
        background: "transparent",
        color: disabled ? c.faint : c.muted,
        padding: "8px 14px",
        fontFamily: font.mono,
        fontSize: 12,
        borderRadius: r.radiusSm,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </Btn>
  );
}
