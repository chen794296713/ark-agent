"use client";

/**
 * C.1 DESCRIBE — the blank-page screen.
 *
 * This is the hardest screen in the product, because the person in front of it
 * does not yet know what an agent is FOR. So it never shows an empty box on its
 * own. It shows, in order of how much help they need:
 *
 *  1. A question in plain language, and a box.
 *  2. Six starters that FILL the box — they never submit. Picking one and then
 *     editing it is the path most people take, and it only works if picking is
 *     obviously not committing.
 *  3. A worked example: one finished brief and the six sections it produced.
 *     Nobody learns "be specific" from being told to be specific.
 *  4. "I don't know where to start" — five questions whose spoken answer is
 *     already a usable brief.
 *
 * Everything else is optional and collapsed. Someone who types one sentence and
 * presses the button gets a working draft; the harness, channels, zone and
 * hours only ever narrow what the generator would otherwise guess.
 *
 * The generate route may not answer — it may not even be deployed. Every
 * failure below lands as a visible, recoverable notice with the typed text
 * still in the box, and never as a thrown error.
 */
import { useEffect, useRef, useState } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { CHANNEL_LABELS, CHANNEL_TYPE_IDS, type ChannelType } from "@/lib/channels";
import { HARNESSES, HARNESS_IDS, type Harness } from "@/lib/harness";
import type { Lang } from "@/lib/types";
import { create } from "@/lib/i18n/create";
import {
  ChipRow,
  Field,
  Notice,
  SelectField,
  ghostBtn,
  ghostBtnHover,
  inputStyle,
  monoLabel,
  primaryBtn,
  useLocalTimeZone,
  useTimeZones,
} from "@/components/create/shared";
import { sanitizeMultiline } from "@/components/create/logic";
import type { FailureKind } from "@/components/create/client";

/** The route's own ceiling (`z.string().min(1).max(4000)`). Mirrored so the
 *  counter never promises room the server will reject — and never withholds
 *  room it would have accepted, which a tighter client cap silently does. */
export const BRIEF_MAX = 4000;
/** Below this the intake stage has nothing to work with and answers `tooThin`. */
export const BRIEF_MIN = 20;

export interface DescribeValue {
  brief: string;
  harness: Harness | "auto";
  channels: ChannelType[];
  /** `""` means "whatever this browser is in", resolved by the caller on submit. */
  timezone: string;
  workStart: string;
  workEnd: string;
}

/**
 * Structural, not the `GenerateFailure` class.
 *
 * A `GenerateFailure` satisfies it, and so does whatever the integrator's own
 * client throws — the screen only needs the four fields it renders, and being
 * able to test it without constructing an Error is worth the two lines.
 */
export interface DescribeFailure {
  kind: FailureKind;
  generationId?: string | null;
  retryAfterSeconds?: number | null;
  limit?: "hour" | "day" | "cost" | null;
}

/**
 * `timezone: ""` on purpose. Seeding it from `Intl` here would make the server
 * render (UTC on a serverless function) and hydration disagree about a
 * `<select value>`, which React reports as a mismatch and then repaints — with
 * the user's zone lost if they had already touched the field.
 */
export function emptyDescribeValue(): DescribeValue {
  return {
    brief: "",
    harness: "auto",
    channels: [],
    timezone: "",
    workStart: "09:00",
    workEnd: "18:00",
  };
}

export default function DescribeStep({
  lang,
  value,
  onChange,
  onSubmit,
  busy = false,
  failure = null,
  onRetry,
  onOpenConflict,
  harnesses = HARNESS_IDS,
}: {
  lang: Lang;
  value: DescribeValue;
  onChange: (next: DescribeValue) => void;
  onSubmit: () => void;
  busy?: boolean;
  failure?: DescribeFailure | null;
  onRetry?: () => void;
  onOpenConflict?: (generationId: string) => void;
  /**
   * The harnesses THIS deployment can actually provision. Passed in rather
   * than read here: the answer depends on server configuration, and a client
   * component that guesses it offers a runtime nobody can be placed on.
   */
  harnesses?: readonly Harness[];
}) {
  const t = create[lang].describe;
  const localZone = useLocalTimeZone();
  const timezone = value.timezone || localZone;
  const zones = useTimeZones(timezone);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const [exampleOpen, setExampleOpen] = useState(false);

  const chars = value.brief.trim().length;
  const ready = chars >= BRIEF_MIN && !busy;

  // A `tooThin` answer is not a modal: the user's next act is typing, so the
  // caret goes back in the box and the hint renders directly under it.
  useEffect(() => {
    if (failure?.kind === "thin") areaRef.current?.focus();
  }, [failure]);

  const fill = (text: string) => {
    onChange({ ...value, brief: sanitizeMultiline(text, BRIEF_MAX) });
    areaRef.current?.focus();
  };

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 26 }}>
      <div>
        <h1
          style={{
            fontFamily: font.space,
            fontWeight: 700,
            fontSize: "clamp(23px, 5vw, 30px)",
            letterSpacing: "-.02em",
            lineHeight: 1.2,
            margin: "0 0 10px",
            color: c.text,
          }}
        >
          {t.title}
        </h1>
        <p style={{ fontSize: 15, color: c.text2, margin: 0, lineHeight: 1.6 }}>{t.sub}</p>
      </div>

      {/* ---- the box ---- */}
      <div>
        <label style={monoLabel} htmlFor="atg-brief">
          {t.textareaLabel}
        </label>
        <textarea
          id="atg-brief"
          ref={areaRef}
          value={value.brief}
          rows={6}
          maxLength={BRIEF_MAX}
          placeholder={t.placeholder}
          aria-describedby={failure?.kind === "thin" ? "atg-brief-thin" : undefined}
          aria-invalid={failure?.kind === "thin" || undefined}
          onChange={(e) =>
            onChange({ ...value, brief: sanitizeMultiline(e.target.value, BRIEF_MAX) })
          }
          style={{
            ...inputStyle,
            minHeight: 148,
            fontSize: 15,
            lineHeight: 1.6,
            resize: "vertical",
            borderColor: failure?.kind === "thin" ? c.red : c.borderField,
          }}
        />
        <div
          style={{ display: "flex", gap: 12, alignItems: "baseline", marginTop: 6, flexWrap: "wrap" }}
        >
          <span style={{ fontSize: 12.5, color: c.muted, flex: "1 1 200px" }}>
            {chars > 0 && chars < BRIEF_MIN ? t.minHint(BRIEF_MIN - chars) : null}
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.faint }}>
            {t.counter(value.brief.length, BRIEF_MAX)}
          </span>
        </div>
        {failure?.kind === "thin" && (
          <div id="atg-brief-thin" style={{ fontSize: 13, color: c.muted, marginTop: 8 }}>
            {t.err.thin}
          </div>
        )}
      </div>

      {/* ---- starters ---- */}
      <div>
        <div style={{ fontSize: 13, color: c.muted, marginBottom: 10 }}>{t.seedsLead}</div>
        <div style={{ display: "grid", gridTemplateColumns: r.col4, gap: 10 }}>
          {t.starters.map((s) => (
            <Btn
              key={s.id}
              type="button"
              onClick={() => fill(s.brief)}
              style={{
                border: `1px solid ${c.border}`,
                borderRadius: r.radiusMd,
                background: "none",
                color: c.text2,
                fontFamily: font.sans,
                fontSize: 13,
                fontWeight: 500,
                textAlign: "left",
                padding: "12px 14px",
                minHeight: 56,
                cursor: "pointer",
                lineHeight: 1.4,
              }}
              hoverStyle={{ borderColor: c.limeBorder, background: c.limeWash, color: c.text }}
            >
              {s.label}
            </Btn>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: c.muted, marginTop: 8 }}>{t.seedFillHint}</div>
      </div>

      {/* ---- worked example ---- */}
      <div>
        <Btn
          type="button"
          aria-expanded={exampleOpen}
          onClick={() => setExampleOpen((v) => !v)}
          style={{ ...ghostBtn, fontFamily: font.mono, fontSize: 11.5, letterSpacing: ".06em" }}
          hoverStyle={ghostBtnHover}
        >
          {exampleOpen ? "▾ " : "▸ "}
          {t.exampleToggle}
        </Btn>
        {exampleOpen && (
          <div
            style={{
              marginTop: 12,
              border: `1px solid ${c.border}`,
              borderRadius: r.radiusMd,
              background: c.panel,
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <p style={{ fontSize: 13, color: c.muted, margin: 0, lineHeight: 1.6 }}>
              {t.exampleLead}
            </p>
            <div>
              <div style={monoLabel}>{t.exampleBriefLabel}</div>
              <blockquote
                style={{
                  margin: 0,
                  borderLeft: `2px solid ${c.limeBorder}`,
                  paddingLeft: 12,
                  fontSize: 13.5,
                  color: c.text2,
                  lineHeight: 1.6,
                }}
              >
                {t.example.brief}
              </blockquote>
            </div>
            <div>
              <div style={monoLabel}>{t.exampleOutcomeLabel}</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {t.example.outcome.map((row) => (
                  <li
                    key={row.key}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "7px 0",
                      borderTop: `1px solid ${c.lineSoft}`,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10.5,
                        letterSpacing: ".08em",
                        color: c.muted,
                        flex: "0 0 130px",
                      }}
                    >
                      {create[lang].review.sectionNames[row.key]}
                    </span>
                    <span style={{ flex: "1 1 220px", fontSize: 13, color: c.text2 }}>
                      {row.line}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Btn
                type="button"
                onClick={() => fill(t.example.brief)}
                style={ghostBtn}
                hoverStyle={ghostBtnHover}
              >
                {t.exampleUse}
              </Btn>
            </div>
          </div>
        )}
      </div>

      {/* ---- "I don't know where to start" ---- */}
      <div>
        <Btn
          type="button"
          aria-expanded={lostOpen}
          onClick={() => setLostOpen((v) => !v)}
          style={{ ...ghostBtn, fontFamily: font.mono, fontSize: 11.5, letterSpacing: ".06em" }}
          hoverStyle={ghostBtnHover}
        >
          {lostOpen ? "▾ " : "▸ "}
          {t.lostToggle}
        </Btn>
        {lostOpen && (
          <div
            style={{
              marginTop: 12,
              border: `1px solid ${c.border}`,
              borderRadius: r.radiusMd,
              background: c.panel,
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <p style={{ fontSize: 13, color: c.muted, margin: 0, lineHeight: 1.6 }}>{t.lostLead}</p>
            {t.lostPrompts.map((prompt, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                  borderTop: i === 0 ? "none" : `1px solid ${c.lineSoft}`,
                  paddingTop: i === 0 ? 0 : 12,
                }}
              >
                <span style={{ flex: "1 1 260px", fontSize: 13.5, color: c.text2 }}>{prompt}</span>
                <Btn
                  type="button"
                  aria-label={`${t.lostUse}: ${prompt}`}
                  onClick={() => fill(prompt)}
                  style={{ ...ghostBtn, whiteSpace: "nowrap" }}
                  hoverStyle={ghostBtnHover}
                >
                  {t.lostUse}
                </Btn>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- optional detail ---- */}
      <details
        style={{
          border: `1px solid ${c.border}`,
          borderRadius: r.radiusMd,
          background: c.panel,
          padding: "14px 18px",
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontFamily: font.mono,
            fontSize: 11.5,
            letterSpacing: ".06em",
            color: c.text2,
          }}
        >
          {t.advanced}
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
          <p style={{ fontSize: 12.5, color: c.muted, margin: 0, lineHeight: 1.6 }}>
            {t.advancedHint}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: r.col2, gap: 16 }}>
            <SelectField
              label={t.harnessLabel}
              hint={t.harnessHint}
              value={value.harness}
              onChange={(v) => onChange({ ...value, harness: v as Harness | "auto" })}
              options={[
                { id: "auto", label: t.harnessAuto },
                ...harnesses.map((id) => ({ id, label: HARNESSES[id].label })),
              ]}
            />
            <SelectField
              label={t.timezoneLabel}
              value={timezone}
              onChange={(v) => onChange({ ...value, timezone: v })}
              options={zones.map((z) => ({ id: z, label: z }))}
            />
          </div>
          <Field label={t.channelsLabel} hint={t.channelsHint}>
            <ChipRow
              label={t.channelsLabel}
              options={CHANNEL_TYPE_IDS.map((id) => ({ id, label: CHANNEL_LABELS[id] }))}
              selected={value.channels}
              onToggle={(id) =>
                onChange({
                  ...value,
                  channels: value.channels.includes(id)
                    ? value.channels.filter((x) => x !== id)
                    : [...value.channels, id],
                })
              }
            />
          </Field>
          <Field label={t.hoursLabel}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="time"
                aria-label={`${t.hoursLabel} — 1`}
                value={value.workStart}
                onChange={(e) => onChange({ ...value, workStart: e.target.value })}
                style={{ ...inputStyle, width: 130 }}
              />
              <span style={{ fontSize: 13, color: c.muted }}>{t.hoursTo}</span>
              <input
                type="time"
                aria-label={`${t.hoursLabel} — 2`}
                value={value.workEnd}
                onChange={(e) => onChange({ ...value, workEnd: e.target.value })}
                style={{ ...inputStyle, width: 130 }}
              />
            </div>
          </Field>
        </div>
      </details>

      <FailureNotice
        lang={lang}
        failure={failure}
        onRetry={onRetry}
        onOpenConflict={onOpenConflict}
      />

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn
          type="button"
          onClick={onSubmit}
          disabled={!ready}
          style={{
            ...primaryBtn,
            opacity: ready ? 1 : 0.45,
            cursor: ready ? "pointer" : "not-allowed",
          }}
          hoverStyle={ready ? { background: c.limeHover } : undefined}
        >
          {busy ? t.submitBusy : t.submit}
        </Btn>
      </div>
    </div>
  );
}

/**
 * Every pre-stream failure gets its own copy, never a bare status code.
 *
 * `thin` is deliberately absent — it renders under the textarea, because the
 * user's next act is typing and a banner would move their eye away from it.
 * `auth` is absent too: a signed-out user is the caller's problem to route,
 * not a notice to read on a screen they cannot use.
 */
function FailureNotice({
  lang,
  failure,
  onRetry,
  onOpenConflict,
}: {
  lang: Lang;
  failure: DescribeFailure | null;
  onRetry?: () => void;
  onOpenConflict?: (generationId: string) => void;
}) {
  const t = create[lang].describe.err;
  const seconds = useCountdown(failure?.kind === "rate" ? failure.retryAfterSeconds : null);

  if (!failure || failure.kind === "thin" || failure.kind === "auth") return null;

  if (failure.kind === "conflict") {
    const id = failure.generationId;
    return (
      <Notice
        tone="warn"
        title={t.conflictTitle}
        action={
          id && onOpenConflict ? (
            <Btn
              type="button"
              onClick={() => onOpenConflict(id)}
              style={ghostBtn}
              hoverStyle={ghostBtnHover}
            >
              {t.conflictOpen}
            </Btn>
          ) : undefined
        }
      >
        {t.conflictBody}
      </Notice>
    );
  }

  if (failure.kind === "rate") {
    const body =
      failure.limit === "hour" ? t.rateHour : failure.limit === "day" ? t.rateDay : t.rateCost;
    return (
      <Notice
        tone="warn"
        title={t.rateTitle}
        action={
          failure.limit === "cost" ? (
            <a
              href="/dashboard/billing"
              style={{ ...ghostBtn, textDecoration: "none", display: "inline-block" }}
            >
              {t.seeUsage}
            </a>
          ) : undefined
        }
      >
        {body}
        {seconds !== null && seconds > 0 ? ` ${t.countdown(seconds)}` : null}
      </Notice>
    );
  }

  return (
    <Notice
      tone="warn"
      action={
        onRetry ? (
          <Btn type="button" onClick={onRetry} style={ghostBtn} hoverStyle={ghostBtnHover}>
            {t.networkRetry}
          </Btn>
        ) : undefined
      }
    >
      {failure.kind === "unavailable" ? t.network : t.generic}
    </Notice>
  );
}

/**
 * Counts a `Retry-After` down live, or null when there is nothing to count.
 *
 * The remaining seconds are DERIVED from a wall-clock deadline captured after
 * commit; the interval only forces a re-render. A backgrounded tab throttles
 * `setInterval` to once a minute, and a counter that has drifted to "try again
 * in 240s" long after the limit expired is worse than no counter at all.
 */
function useCountdown(from: number | null | undefined): number | null {
  const target = from ?? null;
  const [left, setLeft] = useState<number | null>(target);
  const [seenTarget, setSeenTarget] = useState<number | null>(target);
  // Adjusting state during render is the documented way to reset on a prop
  // change; an effect would render one frame of the previous limit's clock.
  if (seenTarget !== target) {
    setSeenTarget(target);
    setLeft(target);
  }
  useEffect(() => {
    if (target === null) return;
    const deadline = Date.now() + target * 1000;
    const id = setInterval(
      () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))),
      1000,
    );
    return () => clearInterval(id);
  }, [target]);
  return left;
}
