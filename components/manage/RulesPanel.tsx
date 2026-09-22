"use client";

/**
 * RULES & BOUNDARIES — §E.4.
 *
 * A rule is a STRUCTURED ROW, not a line in a textarea. The difference matters more
 * than it looks: a free-text box gives us no way to tell the runtime that "never
 * quote a price outside the list" is a prohibition rather than a suggestion, no way
 * to validate one line without re-validating the paragraph, and no way to mark a
 * single edited row as dirty. Kind + text + order is the smallest structure that
 * buys all three.
 *
 * The three kinds are deliberately blunt — MUST, NEVER, ESCALATE. A taxonomy with
 * seven shades of "should" reads well in a spec and is guessed at by everyone
 * filling in the form.
 *
 * Boundaries live in the same card because they are the same decision: a limit the
 * agent is told about before it acts. Splitting them into a separate section made
 * people set an autonomy level and never scroll to the spend cap.
 */
import { useState } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { manage, mt } from "@/lib/i18n/manage";
import type { Lang } from "@/lib/types";
import {
  EmptyState,
  ErrorPanel,
  Field,
  InlineError,
  Seg,
  SelectField,
  SettingCard,
  Toggle,
  sInput,
  sMonoLabel,
} from "./primitives";
import { LIMITS, draftId } from "./logic";
import type { ErrorMap } from "./logic";
import type { AutonomyLevel, BoundarySettings, RuleKind, RuleRow } from "./types";
import { errText, fieldDomId } from "./DirtyBar";

const KIND_COLOR: Record<RuleKind, string> = {
  must: c.accent,
  never: c.red,
  escalate: c.amber,
};

export function RulesPanel({
  lang,
  rules,
  autonomy,
  baseRules,
  baseAutonomy,
  errors,
  disabled = false,
  unavailable = false,
  loadError = null,
  onRetry,
  onRulesChange,
  onAutonomyChange,
}: {
  lang: Lang;
  rules: RuleRow[];
  autonomy: BoundarySettings;
  /** Server truth. Only used to decide what is dirty and what a revert restores. */
  baseRules: RuleRow[];
  baseAutonomy: BoundarySettings;
  /** Keyed by dotted path, exactly as `validateManaged` produces them. */
  errors: ErrorMap;
  disabled?: boolean;
  /** The config endpoint is absent from this build — render, do not crash. */
  unavailable?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  onRulesChange: (next: RuleRow[]) => void;
  onAutonomyChange: (next: BoundarySettings) => void;
}) {
  const t = manage[lang];

  const baseById = new Map(baseRules.map((x) => [x.id, x]));
  const orderChanged =
    baseRules
      .filter((x) => rules.some((y) => y.id === x.id))
      .map((x) => x.id)
      .join(",") !==
    rules
      .filter((x) => baseById.has(x.id))
      .map((x) => x.id)
      .join(",");

  let dirtyCount = 0;
  for (const rule of rules) {
    const was = baseById.get(rule.id);
    if (!was) {
      dirtyCount += 1;
      continue;
    }
    if (was.kind !== rule.kind) dirtyCount += 1;
    if (was.text !== rule.text) dirtyCount += 1;
  }
  for (const was of baseRules) if (!rules.some((x) => x.id === was.id)) dirtyCount += 1;
  if (orderChanged) dirtyCount += 1;
  if (autonomy.level !== baseAutonomy.level) dirtyCount += 1;
  if (autonomy.approvalAmount !== baseAutonomy.approvalAmount) dirtyCount += 1;
  if (autonomy.dailyActionLimit !== baseAutonomy.dailyActionLimit) dirtyCount += 1;
  if (autonomy.approveExternalSends !== baseAutonomy.approveExternalSends) dirtyCount += 1;

  const errorCount = Object.keys(errors).filter(
    (k) => k === "rules" || k.startsWith("rules.") || k.startsWith("autonomy."),
  ).length;

  function patch(id: string, next: Partial<RuleRow>) {
    onRulesChange(rules.map((x) => (x.id === id ? { ...x, ...next } : x)));
  }

  function add() {
    const next: RuleRow = {
      id: draftId("rule"),
      kind: "must",
      text: "",
      // `sortOrder` is what the server persists; the array order is what the user
      // sees. Keeping them in step here means the save payload needs no fixup.
      sortOrder: rules.length,
    };
    onRulesChange(reindex([...rules, next]));
  }

  function remove(id: string) {
    onRulesChange(reindex(rules.filter((x) => x.id !== id)));
  }

  function move(id: string, delta: number) {
    const i = rules.findIndex((x) => x.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= rules.length) return;
    const next = [...rules];
    const [row] = next.splice(i, 1);
    if (row) next.splice(j, 0, row);
    onRulesChange(reindex(next));
  }

  const kindOptions = [
    { id: "must", label: t.ruleMust },
    { id: "never", label: t.ruleNever },
    { id: "escalate", label: t.ruleEscalate },
  ];
  const kindHint: Record<RuleKind, string> = {
    must: t.ruleMustHint,
    never: t.ruleNeverHint,
    escalate: t.ruleEscalateHint,
  };

  const countError = errText(t, errors["rules"]);

  return (
    <SettingCard
      title={t.rulesTitle}
      sectionId="cfg-rules"
      desc={t.rulesDesc}
      dirtyCount={dirtyCount}
      errorCount={errorCount}
      editedLabel={t.edited}
      problemLabel={mt(errorCount === 1 ? t.problemOne : t.problemMany, { n: errorCount })}
      actions={
        <span style={{ ...sMonoLabel, marginBottom: 0 }}>
          {mt(t.ruleCounter, { n: rules.length, max: LIMITS.ruleCountMax })}
        </span>
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
      {unavailable && <ErrorPanel title={t.configUnavailable} />}

      {countError && <InlineError text={countError} />}

      {rules.length === 0 ? (
        <EmptyState
          glyph="§"
          title={t.noRulesTitle}
          body={t.noRulesBody}
          actions={
            <AddButton label={t.addRule} onClick={add} disabled={disabled || unavailable} />
          }
        />
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
            {rules.map((rule, i) => {
              const was = baseById.get(rule.id);
              const isNew = !was;
              const kindDirty = isNew || was.kind !== rule.kind;
              const textDirty = isNew || was.text !== rule.text;
              const textPath = `rules.${rule.id}.text`;
              const err = errText(t, errors[textPath]);
              return (
                <li
                  key={rule.id}
                  style={{
                    border: `1px solid ${err ? c.redBorder : c.border}`,
                    borderRadius: r.radiusSm,
                    background: c.panelDeep,
                    padding: 14,
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "minmax(120px, 150px) 1fr auto",
                    alignItems: "start",
                  }}
                >
                  <Field
                    label={t.ruleKind}
                    dirty={kindDirty}
                    onRevert={was ? () => patch(rule.id, { kind: was.kind }) : undefined}
                    revertLabel={t.revertField}
                    htmlFor={fieldDomId(`rules.${rule.id}.kind`)}
                  >
                    <SelectField
                      id={fieldDomId(`rules.${rule.id}.kind`)}
                      value={rule.kind}
                      options={kindOptions}
                      onChange={(v) => patch(rule.id, { kind: v as RuleKind })}
                    />
                  </Field>

                  <Field
                    label={mt(t.ruleTextLabel, { n: i + 1 })}
                    hint={kindHint[rule.kind]}
                    error={err}
                    dirty={textDirty}
                    onRevert={was ? () => patch(rule.id, { text: was.text }) : undefined}
                    revertLabel={t.revertField}
                    htmlFor={fieldDomId(textPath)}
                  >
                    <textarea
                      id={fieldDomId(textPath)}
                      value={rule.text}
                      disabled={disabled}
                      onChange={(e) => patch(rule.id, { text: e.target.value })}
                      placeholder={t.rulePlaceholder}
                      rows={2}
                      maxLength={LIMITS.ruleTextMax * 2}
                      style={{
                        ...sInput,
                        resize: "vertical",
                        lineHeight: 1.55,
                        borderColor: err ? c.red : c.borderField,
                      }}
                    />
                  </Field>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      paddingTop: 22,
                      alignItems: "center",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        letterSpacing: ".08em",
                        color: KIND_COLOR[rule.kind],
                      }}
                    >
                      {rule.kind === "must" ? "✓" : rule.kind === "never" ? "✕" : "▲"}
                    </span>
                    <IconBtn
                      label={t.moveUp}
                      glyph="↑"
                      onClick={() => move(rule.id, -1)}
                      disabled={disabled || i === 0}
                    />
                    <IconBtn
                      label={t.moveDown}
                      glyph="↓"
                      onClick={() => move(rule.id, 1)}
                      disabled={disabled || i === rules.length - 1}
                    />
                    <IconBtn
                      label={t.removeRule}
                      glyph="✕"
                      danger
                      onClick={() => remove(rule.id)}
                      disabled={disabled}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <div>
            <AddButton
              label={t.addRule}
              onClick={add}
              disabled={disabled || unavailable || rules.length >= LIMITS.ruleCountMax}
            />
          </div>
        </>
      )}

      <div
        style={{
          borderTop: `1px solid ${c.lineSoft}`,
          paddingTop: 18,
          display: "grid",
          gap: 18,
        }}
      >
        <h4
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: ".12em",
            color: c.text2,
            margin: 0,
            fontWeight: 400,
          }}
        >
          {t.boundariesTitle}
        </h4>

        <Field
          label={t.autonomyLabel}
          hint={t.autonomyHint}
          dirty={autonomy.level !== baseAutonomy.level}
          onRevert={() => onAutonomyChange({ ...autonomy, level: baseAutonomy.level })}
          revertLabel={t.revertField}
        >
          <Seg<AutonomyLevel>
            value={autonomy.level}
            label={t.autonomyLabel}
            onChange={(v) => !disabled && onAutonomyChange({ ...autonomy, level: v })}
            options={[
              { id: "suggest", label: t.autonomySuggest },
              { id: "ask", label: t.autonomyAsk },
              { id: "auto", label: t.autonomyAuto },
            ]}
          />
        </Field>

        <div style={{ display: "grid", gap: 18, gridTemplateColumns: r.col2 }}>
          <NumberField
            lang={lang}
            label={t.approvalAmount}
            hint={t.approvalAmountHint}
            path="autonomy.approvalAmount"
            value={autonomy.approvalAmount}
            baseValue={baseAutonomy.approvalAmount}
            error={errText(t, errors["autonomy.approvalAmount"])}
            disabled={disabled}
            onChange={(n) => onAutonomyChange({ ...autonomy, approvalAmount: n })}
          />
          <NumberField
            lang={lang}
            label={t.dailyActionLimit}
            hint={t.dailyActionLimitHint}
            path="autonomy.dailyActionLimit"
            value={autonomy.dailyActionLimit}
            baseValue={baseAutonomy.dailyActionLimit}
            error={errText(t, errors["autonomy.dailyActionLimit"])}
            disabled={disabled}
            onChange={(n) => onAutonomyChange({ ...autonomy, dailyActionLimit: n })}
          />
        </div>

        <div
          style={{
            borderLeft: `2px solid ${
              autonomy.approveExternalSends !== baseAutonomy.approveExternalSends
                ? c.amber
                : "transparent"
            }`,
            paddingLeft: 10,
            marginLeft: -12,
          }}
        >
          <Toggle
            on={autonomy.approveExternalSends}
            disabled={disabled}
            label={t.approveExternal}
            desc={t.approveExternalDesc}
            onChange={(v) => onAutonomyChange({ ...autonomy, approveExternalSends: v })}
          />
        </div>
      </div>
    </SettingCard>
  );
}

/** Keep `sortOrder` equal to the visible order after every mutation. */
function reindex(rows: RuleRow[]): RuleRow[] {
  return rows.map((x, i) => (x.sortOrder === i ? x : { ...x, sortOrder: i }));
}

function AddButton({
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

function IconBtn({
  label,
  glyph,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Btn
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      hoverStyle={disabled ? undefined : { color: danger ? c.red : c.text }}
      style={{
        background: "transparent",
        border: "none",
        color: disabled ? c.faint : c.muted,
        fontSize: 13,
        lineHeight: 1,
        padding: "3px 5px",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span aria-hidden="true">{glyph}</span>
    </Btn>
  );
}

/**
 * A whole-number field that can be EMPTY while you type. Exported because
 * `SchedulesPanel` needs the identical behaviour for the interval and the daily
 * run cap, and two copies of a caret-preservation trick drift within a week.
 *
 * Binding a number straight to `value` means clearing the box writes 0, and a user
 * who wanted to type "50" over "0" gets "050" or "0" depending on where the caret
 * was. The raw string is local; the parsed number is what leaves. An unparseable
 * box emits NaN, which `validateBoundaries` rejects by the same rule that rejects
 * -1 and 1.5 — the control never silently invents a value.
 */
export function NumberField({
  lang,
  label,
  hint,
  path,
  value,
  baseValue,
  error,
  disabled,
  onChange,
}: {
  lang: Lang;
  label: string;
  hint: string;
  path: string;
  value: number;
  baseValue: number;
  error: string | null;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  const t = manage[lang];
  const show = (n: number) => (Number.isFinite(n) ? String(n) : "");
  const [raw, setRaw] = useState(() => show(value));
  // What we last emitted upward. Re-syncing on `value` alone would rewrite the box
  // on every keystroke — "1." becomes "1" mid-type — because the parsed number is
  // equal while the text is not. Comparing against our own last emission means the
  // box is only rewritten when something ELSE changed the value: a revert, a
  // discard, a fresh load.
  const [mirror, setMirror] = useState(value);

  // Adjusting state during render is the documented alternative to an effect here;
  // React re-renders this component before committing, and nothing else observes it.
  const sameAsMirror =
    Number.isNaN(mirror) && Number.isNaN(value) ? true : Object.is(mirror, value);
  if (!sameAsMirror) {
    setMirror(value);
    setRaw(show(value));
  }

  // `Object.is`, not `!==`: an empty box is NaN on both sides, and `NaN !== NaN`
  // would mark an untouched field as edited forever.
  const dirty = !Object.is(value, baseValue);

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      dirty={dirty}
      onRevert={() => {
        setRaw(show(baseValue));
        setMirror(baseValue);
        onChange(baseValue);
      }}
      revertLabel={t.revertField}
      htmlFor={fieldDomId(path)}
    >
      <input
        id={fieldDomId(path)}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={raw}
        onChange={(e) => {
          const next = e.target.value;
          const parsed = next.trim() === "" ? NaN : Number(next);
          setRaw(next);
          setMirror(parsed);
          onChange(parsed);
        }}
        style={{
          ...sInput,
          fontFamily: font.mono,
          borderColor: error ? c.red : c.borderField,
        }}
      />
    </Field>
  );
}
