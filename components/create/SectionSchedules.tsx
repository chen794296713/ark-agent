"use client";

/**
 * Section 6 of 6 — REMINDERS & SCHEDULES.
 *
 * Three ways to say when, and they all end in the same place:
 *
 *  1. **Words.** "every weekday at 8:30" is parsed by `lib/schedule/parse`,
 *     echoed back as a SENTENCE, and applied only when the user presses Use.
 *     A parse that lands is never committed silently — the whole point of the
 *     echo is that the user gets to disagree with it.
 *  2. **The form.** Preset, days, time, zone, and an optional "every N minutes
 *     between A and B". This is the fallback when the words are not understood,
 *     and it is a first-class path, not a consolation prize.
 *  3. **Cron**, behind ADVANCED, for the one user in fifty who wants it.
 *
 * Under all three sits the same preview: the next five runs, computed here,
 * in the SCHEDULE's zone rather than the reader's, with the clock-change
 * warning that DST makes necessary. The preview is pure client arithmetic —
 * no key, no network, no Agent Manager — so it is identical in every
 * degradation mode. There is deliberately no server round trip: the same
 * parser runs on both sides, and at draft time there is no agent to address a
 * preview request to.
 *
 * The cron is the stored truth and the sentence is DERIVED from it on every
 * render. A stale `humanReadable` next to a changed cron is precisely the bug
 * this preview exists to catch, so it is never read back.
 */
import { useMemo, useState, useSyncExternalStore } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { BCP47 } from "@/lib/i18n";
import { describeCron } from "@/lib/schedule/describe";
import { CONFIDENCE_FLOOR, parseSchedulePhrase, type ParsedSchedule } from "@/lib/schedule/parse";
import { zonedParts } from "@/lib/schedule/cron";
import type { Lang } from "@/lib/types";
import type { AgentTemplateDraft, TemplateSchedule } from "@/lib/atg/types";
import { create } from "@/lib/i18n/create";
import {
  Card,
  ChipRow,
  Field,
  IconBtn,
  Mono,
  Notice,
  SelectField,
  Seg,
  Skeleton,
  TextArea,
  TextField,
  Toggle,
  ghostBtn,
  ghostBtnHover,
  inputStyle,
  monoLabel,
  useTimeZones,
} from "@/components/create/shared";
import {
  DEFAULT_SHAPE,
  cronFromShape,
  cronMessage,
  dstFlags,
  runsPerDay,
  safeNextRuns,
  sanitizeMultiline,
  sanitizeUntrusted,
  shapeFromCron,
  type ScheduleShape,
  type WhenPreset,
} from "@/components/create/logic";
import { SECTION_ROW, clampInt, replaceAt, type SectionProps } from "./ReviewSections";

/** The contract's ceiling (`schedules: 0..8`). */
const MAX_SCHEDULES = 8;

export default function SectionSchedules({
  lang,
  draft,
  onChange,
  state,
  stateLabel,
  ready,
  domId,
}: SectionProps) {
  const t = create[lang].schedules;
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (!ready) {
    return (
      <Card id={domId} title={t.title}>
        <Skeleton rows={3} />
      </Card>
    );
  }

  const add = () => {
    const next = newSchedule(draft);
    onChange({ ...draft, schedules: [...draft.schedules, next] });
    setOpenKey(next.key);
  };

  return (
    <Card
      id={domId}
      title={t.title}
      state={state}
      stateLabel={stateLabel}
      meta={<Mono>{t.count(draft.schedules.length)}</Mono>}
      headerAction={
        draft.schedules.length < MAX_SCHEDULES ? (
          <Btn type="button" onClick={add} style={ghostBtn} hoverStyle={ghostBtnHover}>
            {t.add}
          </Btn>
        ) : undefined
      }
    >
      {draft.schedules.length === 0 && <Notice>{t.empty}</Notice>}
      {draft.schedules.map((schedule, i) => (
        <ScheduleRow
          key={schedule.key}
          lang={lang}
          schedule={schedule}
          open={openKey === schedule.key}
          onToggleOpen={() => setOpenKey(openKey === schedule.key ? null : schedule.key)}
          onChange={(next) =>
            onChange({ ...draft, schedules: replaceAt(draft.schedules, i, next) })
          }
          onRemove={() =>
            onChange({ ...draft, schedules: draft.schedules.filter((_, j) => j !== i) })
          }
        />
      ))}
    </Card>
  );
}

/** A new row, addressed to the primary agent and starting on the default shape. */
function newSchedule(draft: AgentTemplateDraft): TemplateSchedule {
  const agent = draft.agents.find((a) => a.isPrimary) ?? draft.agents[0];
  return {
    key: `sch-${Math.random().toString(36).slice(2, 10)}`,
    agentKey: agent?.key ?? "",
    title: "",
    kind: "recurring",
    cron: cronFromShape(DEFAULT_SHAPE),
    timezone: agent?.settings.timezone ?? "UTC",
    onDate: null,
    payloadKind: "task",
    prompt: "",
    deliverTo: "chat",
    catchUpPolicy: "skip",
    enabled: true,
    maxRunsPerDay: 24,
    // The user made this row by hand, so that is what the provenance says.
    source: "user_phrase",
    confidence: 1,
    // Derived from the cron at render time; never read back from here.
    humanReadable: "",
  };
}

function ScheduleRow({
  lang,
  schedule,
  open,
  onToggleOpen,
  onChange,
  onRemove,
}: {
  lang: Lang;
  schedule: TemplateSchedule;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (next: TemplateSchedule) => void;
  onRemove: () => void;
}) {
  const t = create[lang].schedules;
  const common = create[lang].common;
  const zones = useTimeZones(schedule.timezone);
  const hydrated = useHydrated();

  const [phrase, setPhrase] = useState("");
  /** The parse is done in the CHANGE HANDLER, not in render: recognising
   *  "tomorrow at 9" needs today's date, and reading a clock during render
   *  makes the server and the browser disagree about what is on screen. */
  const [parsed, setParsed] = useState<ParsedSchedule | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [cronText, setCronText] = useState(schedule.cron);

  // Derived, never stored: a cron the presets cannot express keeps the editor
  // honestly on Custom instead of being silently rewritten into something that
  // does not round-trip.
  const shape = useMemo(() => shapeFromCron(schedule.cron), [schedule.cron]);
  const effective = shape ?? DEFAULT_SHAPE;
  const human = describeCron(schedule.cron, lang);

  // Gated on hydration so the server renders no instants at all rather than a
  // set the browser would immediately disagree with.
  const runs = useMemo(
    () => (hydrated ? safeNextRuns(schedule.cron, schedule.timezone, 5) : []),
    [hydrated, schedule.cron, schedule.timezone],
  );
  const dst = useMemo(() => dstFlags(runs, schedule.timezone), [runs, schedule.timezone]);
  const perDay = useMemo(
    () => (hydrated ? runsPerDay(schedule.cron, schedule.timezone) : 0),
    [hydrated, schedule.cron, schedule.timezone],
  );
  const cronProblem = cronMessage(cronText);

  const setShape = (next: ScheduleShape) => {
    const cron = cronFromShape(next);
    setCronText(cron);
    onChange({ ...schedule, cron, source: "user_phrase", confidence: 1 });
  };

  const readPhrase = (text: string) => {
    setPhrase(text);
    if (!text.trim()) {
      setParsed(null);
      return;
    }
    // `today` in the SCHEDULE's zone — a relative date resolved in the
    // server's zone is the wrong day for most of the world.
    let today: { year: number; month: number; day: number } | undefined;
    try {
      const parts = zonedParts(new Date(), schedule.timezone);
      today = { year: parts.year, month: parts.month, day: parts.day };
    } catch {
      today = undefined;
    }
    setParsed(parseSchedulePhrase(text, today ? { today } : {}));
  };

  const applyPhrase = () => {
    if (!parsed) return;
    setCronText(parsed.cron);
    onChange({
      ...schedule,
      cron: parsed.cron,
      onDate: parsed.onDate ?? null,
      kind: parsed.kind === "one_off" ? "one_off" : schedule.kind,
      source: "user_phrase",
      confidence: parsed.confidence,
    });
    setPhrase("");
    setParsed(null);
  };

  return (
    <div style={SECTION_ROW}>
      {/* ---- the row at rest ---- */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span aria-hidden style={{ color: schedule.enabled ? c.accent : c.muted }}>
          ◷
        </span>
        <span style={{ fontSize: 13.5, color: c.text, minWidth: 0, overflowWrap: "anywhere" }}>
          {sanitizeUntrusted(schedule.title, 80) || t.labelField}
        </span>
        <Mono color={c.muted}>{t.kindLabel[schedule.kind]}</Mono>
        {/* Provenance is the reason to trust — or distrust — the line below. */}
        <Mono color={c.muted}>
          {schedule.source === "llm"
            ? t.sourceLlm
            : schedule.source === "deterministic"
              ? t.sourceDeterministic
              : t.sourceUser}
        </Mono>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Toggle
            label={schedule.enabled ? t.on : t.off}
            on={schedule.enabled}
            onChange={(on) => onChange({ ...schedule, enabled: on })}
          />
          <IconBtn label={t.edit} glyph={open ? "▾" : "✎"} onClick={onToggleOpen} tone="accent" />
          <IconBtn
            label={`${t.remove}: ${sanitizeUntrusted(schedule.title, 40)}`}
            glyph="✕"
            tone="danger"
            onClick={onRemove}
          />
        </span>
      </div>

      <div style={{ fontSize: 13, color: c.text2 }}>
        {human ?? t.cronInvalid(cronMessage(schedule.cron) ?? "")} · {schedule.timezone}
      </div>
      {schedule.kind === "one_off" && schedule.onDate && (
        <div style={{ fontSize: 12.5, color: c.muted }}>{t.readOnlyOnce(schedule.onDate)}</div>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <Mono color={c.muted}>
          {t.next} {runs[0] ? formatRun(runs[0], schedule.timezone, lang) : t.noNext}
        </Mono>
        <Mono color={c.faint}>{schedule.cron}</Mono>
      </div>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 6 }}>
          <TextField
            label={t.labelField}
            value={schedule.title}
            maxLength={80}
            onChange={(v) => onChange({ ...schedule, title: v })}
          />

          {/* ---- 1. words ---- */}
          <Field label={t.phraseField} hint={t.phraseHint}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                aria-label={t.phraseField}
                value={phrase}
                maxLength={120}
                onChange={(e) => readPhrase(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  applyPhrase();
                }}
                style={{ ...inputStyle, flex: "1 1 220px", fontSize: 13.5 }}
              />
              <Btn
                type="button"
                disabled={!parsed}
                onClick={applyPhrase}
                style={{ ...ghostBtn, opacity: parsed ? 1 : 0.5, whiteSpace: "nowrap" }}
                hoverStyle={parsed ? ghostBtnHover : undefined}
              >
                {t.phraseUse}
              </Btn>
            </div>
            {/* The echo. Three honest answers, and "nothing typed yet" is not
                one of them — an empty box gets no verdict at all. */}
            <div role="status" aria-live="polite" style={{ marginTop: 6 }}>
              {phrase.trim() === "" ? null : !parsed ? (
                <div style={{ fontSize: 12.5, color: c.muted }}>{t.phraseNone}</div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: c.text2 }}>
                    {t.phraseUnderstood(describeCron(parsed.cron, lang) ?? parsed.cron)}
                  </div>
                  {parsed.confidence < CONFIDENCE_FLOOR && (
                    <div style={{ fontSize: 12.5, color: c.muted, marginTop: 4 }}>
                      {t.phraseUnsure}
                    </div>
                  )}
                </>
              )}
            </div>
          </Field>

          {/* ---- 2. the form ---- */}
          <Field label={t.whenField}>
            <Seg
              label={t.whenField}
              value={effective.preset}
              onChange={(preset: WhenPreset) => setShape({ ...effective, preset })}
              options={[
                { id: "daily" as WhenPreset, label: t.presetDaily },
                { id: "weekdays" as WhenPreset, label: t.presetWeekdays },
                { id: "weekly" as WhenPreset, label: t.presetWeekly },
                { id: "custom" as WhenPreset, label: t.presetCustom },
              ]}
            />
          </Field>

          {(effective.preset === "weekly" || effective.preset === "custom") && (
            <Field label={t.daysField}>
              <ChipRow
                label={t.daysField}
                // The id is the day NUMBER as a string: "S" appears twice in an
                // English week and would collide as a key or a value.
                options={t.dayNames.map((label, idx) => ({
                  id: String(idx),
                  label: `${label} · ${t.dayNamesLong[idx]}`,
                }))}
                selected={effective.days.map(String)}
                onToggle={(id) => {
                  const day = Number(id);
                  const days = effective.days.includes(day)
                    ? effective.days.filter((d) => d !== day)
                    : [...effective.days, day];
                  setShape({ ...effective, days });
                }}
              />
            </Field>
          )}

          <div style={{ display: "grid", gridTemplateColumns: r.col2, gap: 14 }}>
            <Field label={t.timeField}>
              <input
                type="time"
                aria-label={t.timeField}
                value={`${pad(effective.hour)}:${pad(effective.minute)}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":");
                  setShape({
                    ...effective,
                    hour: clampInt(h ?? "", 0, 23, effective.hour),
                    minute: clampInt(m ?? "", 0, 59, effective.minute),
                  });
                }}
                style={{ ...inputStyle, width: 140 }}
              />
            </Field>
            <SelectField
              label={t.timezoneField}
              value={schedule.timezone}
              onChange={(v) => onChange({ ...schedule, timezone: v })}
              options={zones.map((z) => ({ id: z, label: z }))}
            />
          </div>

          <Field label={t.repeatField}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Toggle
                label={t.repeatEvery(String(effective.repeatEvery ?? 15))}
                on={effective.repeatEvery !== null}
                onChange={(on) =>
                  setShape({ ...effective, repeatEvery: on ? (effective.repeatEvery ?? 15) : null })
                }
              />
              {effective.repeatEvery !== null && (
                <>
                  <input
                    type="number"
                    aria-label={t.repeatField}
                    value={String(effective.repeatEvery)}
                    onChange={(e) =>
                      setShape({
                        ...effective,
                        repeatEvery: clampInt(e.target.value, 1, 59, effective.repeatEvery ?? 15),
                      })
                    }
                    style={{ ...inputStyle, width: 90 }}
                  />
                  <span style={{ fontSize: 13, color: c.muted }}>{t.repeatBetween}</span>
                  <input
                    type="number"
                    aria-label={t.repeatBetween}
                    value={String(effective.repeatFrom)}
                    onChange={(e) =>
                      setShape({
                        ...effective,
                        repeatFrom: clampInt(e.target.value, 0, 23, effective.repeatFrom),
                      })
                    }
                    style={{ ...inputStyle, width: 80 }}
                  />
                  <span style={{ fontSize: 13, color: c.muted }}>{t.repeatAnd}</span>
                  <input
                    type="number"
                    aria-label={t.repeatAnd}
                    value={String(effective.repeatTo)}
                    onChange={(e) =>
                      setShape({
                        ...effective,
                        // Exclusive, so its ceiling is 24 — clamping it to 23
                        // silently drops the 23:00 hour from an all-day window.
                        repeatTo: clampInt(e.target.value, 1, 24, effective.repeatTo),
                      })
                    }
                    style={{ ...inputStyle, width: 80 }}
                  />
                </>
              )}
            </div>
          </Field>

          {/* ---- 3. cron ---- */}
          <div>
            <Btn
              type="button"
              aria-expanded={advanced}
              onClick={() => setAdvanced((v) => !v)}
              style={{ ...ghostBtn, fontFamily: font.mono, fontSize: 11 }}
              hoverStyle={ghostBtnHover}
            >
              {advanced ? "▾ " : "▸ "}
              {t.advanced}
            </Btn>
            {advanced && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={monoLabel} htmlFor={`cron-${schedule.key}`}>
                  {t.cronField}
                </label>
                <input
                  id={`cron-${schedule.key}`}
                  value={cronText}
                  aria-invalid={cronProblem ? true : undefined}
                  aria-describedby={`cron-${schedule.key}-msg`}
                  onChange={(e) => {
                    setCronText(e.target.value);
                    // Only a VALID expression reaches the draft — an in-progress
                    // keystroke is not a schedule, and writing it would make the
                    // preview flicker through nonsense.
                    if (!cronMessage(e.target.value)) {
                      onChange({ ...schedule, cron: e.target.value.trim(), source: "user_phrase" });
                    }
                  }}
                  style={{ ...inputStyle, fontFamily: font.mono, fontSize: 13 }}
                />
                <div
                  id={`cron-${schedule.key}-msg`}
                  style={{ fontSize: 12.5, color: cronProblem ? c.red : c.muted }}
                >
                  {cronProblem ? t.cronInvalid(cronProblem) : t.cronValid}
                </div>
                <div style={{ fontSize: 12.5, color: c.muted }}>{t.cronHelp}</div>
                <div style={{ fontSize: 12.5, color: c.muted }}>{t.cronUnion}</div>
              </div>
            )}
          </div>

          <TextArea
            label={t.promptField}
            hint={t.promptHint}
            value={schedule.prompt}
            rows={3}
            maxLength={600}
            onChange={(v) => onChange({ ...schedule, prompt: sanitizeMultiline(v, 600) })}
          />

          <div style={{ display: "grid", gridTemplateColumns: r.col2, gap: 14 }}>
            <SelectField
              label={t.deliverField}
              value={schedule.deliverTo}
              onChange={(v) =>
                onChange({ ...schedule, deliverTo: v as TemplateSchedule["deliverTo"] })
              }
              options={(["chat", "email", "channel", "none"] as const).map((id) => ({
                id,
                label: t.deliver[id],
              }))}
            />
            <TextField
              label={t.maxRuns(schedule.maxRunsPerDay)}
              hint={t.maxRunsHint}
              type="number"
              inputMode="numeric"
              value={String(schedule.maxRunsPerDay)}
              onChange={(v) =>
                onChange({ ...schedule, maxRunsPerDay: clampInt(v, 1, 288, schedule.maxRunsPerDay) })
              }
            />
          </div>

          {/* The runner enforces the cap, so a cron that fires more often than
              it loses runs. Naming the computed number is the only version of
              this warning anyone can act on. */}
          {perDay > schedule.maxRunsPerDay && (
            <Notice tone="warn" title={t.maxRuns(perDay)}>
              {t.maxRunsHint}
            </Notice>
          )}

          {/* ---- the preview ---- */}
          <div
            style={{
              background: c.panelDeep,
              border: `1px solid ${c.border}`,
              borderRadius: r.radiusSm,
              padding: 14,
            }}
          >
            <Mono color={c.muted}>{t.previewTitle(schedule.timezone)}</Mono>
            <div
              style={{ display: "grid", gridTemplateColumns: r.col3, gap: 8, marginTop: 8 }}
            >
              {runs.length === 0 && (
                <span style={{ fontSize: 12.5, color: c.muted }}>
                  {hydrated ? t.previewEmpty : common.loading}
                </span>
              )}
              {runs.map((run, i) => (
                <span
                  key={run.toISOString()}
                  style={{ fontFamily: font.mono, fontSize: 12, color: c.text2 }}
                >
                  {formatRun(run, schedule.timezone, lang)}
                  {dst[i] && (
                    <span title={t.dstNote} style={{ color: c.amber }}>
                      {" "}
                      ⚠ {t.dstNote}
                    </span>
                  )}
                </span>
              ))}
            </div>
            {dst.some(Boolean) && (
              <div style={{ fontSize: 12.5, color: c.muted, marginTop: 8 }}>{t.dstTitle}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** A run instant rendered in the SCHEDULE's zone, not the reader's. */
function formatRun(date: Date, timeZone: string, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(BCP47[lang], {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

/** Nothing to subscribe to — this flips exactly once, at hydration. */
const noopSubscribe = () => () => {};

/**
 * True only after hydration.
 *
 * The preview reads a clock, and a clock read during the server render is a
 * different clock from the one the browser reads a second later — React reports
 * that as a hydration mismatch and repaints. `components/create/shared.tsx`
 * keeps its own private copy of this for the same reason; it is four lines, and
 * that file is not this task's to edit.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
