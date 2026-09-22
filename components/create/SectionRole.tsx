"use client";

/**
 * Section 1 of 6 — ROLE.
 *
 * The job, before the machine: a title, a one-line mission, what the role is
 * responsible for, what "good" looks like, and who it works with. The generator
 * fills all of it; every field here is a real control, because a role the user
 * cannot correct is a role they will not trust.
 *
 * Two affordances the draft-shaped-read-only version of this card was missing,
 * and that make the difference between "editable" and "editable in principle":
 * a role can be ADDED when the generator produced none (the contract allows
 * 1..3), and a success metric can be added, not only deleted.
 */
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import type { TemplateMetric, TemplateRole } from "@/lib/atg/types";
import { create } from "@/lib/i18n/create";
import {
  Card,
  Field,
  IconBtn,
  Mono,
  Notice,
  Skeleton,
  StringList,
  TextArea,
  TextField,
  ghostBtn,
  ghostBtnHover,
  inputStyle,
} from "@/components/create/shared";
import { sanitizeMultiline, sanitizeUntrusted } from "@/components/create/logic";
import { SECTION_ROW, replaceAt, type SectionProps } from "./ReviewSections";

/** The contract's ceiling (`roles: 1..3`). */
const MAX_ROLES = 3;
const MAX_METRICS = 6;

export default function SectionRole({
  lang,
  draft,
  onChange,
  state,
  stateLabel,
  ready,
  domId,
}: SectionProps) {
  const t = create[lang].role;
  const common = create[lang].common;

  if (!ready) {
    return (
      <Card id={domId} title={t.title}>
        <Skeleton rows={3} />
      </Card>
    );
  }

  const setRoles = (roles: TemplateRole[]) => onChange({ ...draft, roles });

  const addRole = () =>
    setRoles([
      ...draft.roles,
      {
        key: `role-${Math.random().toString(36).slice(2, 10)}`,
        baseRoleId: null,
        title: "",
        mission: "",
        responsibilities: [],
        successMetrics: [],
        stakeholders: [],
        handoffs: [],
      },
    ]);

  return (
    <Card
      id={domId}
      title={t.title}
      state={state}
      stateLabel={stateLabel}
      headerAction={
        draft.roles.length < MAX_ROLES ? (
          <Btn type="button" onClick={addRole} style={ghostBtn} hoverStyle={ghostBtnHover}>
            + {common.add}
          </Btn>
        ) : undefined
      }
    >
      {draft.roles.length === 0 && <Notice tone="warn">{t.empty}</Notice>}

      {draft.roles.map((role, i) => {
        const patch = (next: Partial<TemplateRole>) =>
          setRoles(replaceAt(draft.roles, i, { ...role, ...next }));
        return (
          <div key={role.key} style={SECTION_ROW}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Mono>{`${i + 1} / ${draft.roles.length}`}</Mono>
              {draft.roles.length > 1 && (
                <span style={{ marginLeft: "auto" }}>
                  <IconBtn
                    label={`${common.remove}: ${sanitizeUntrusted(role.title, 40)}`}
                    glyph="✕"
                    tone="danger"
                    onClick={() => setRoles(draft.roles.filter((_, j) => j !== i))}
                  />
                </span>
              )}
            </div>

            <TextField
              label={t.titleField}
              value={role.title}
              maxLength={80}
              onChange={(v) => patch({ title: v })}
            />
            <TextArea
              label={t.missionField}
              hint={t.why}
              value={role.mission}
              rows={3}
              maxLength={400}
              onChange={(v) => patch({ mission: sanitizeMultiline(v, 400) })}
            />
            <StringList
              label={t.responsibilities}
              items={role.responsibilities}
              placeholder={t.responsibilityAdd}
              addLabel={common.add}
              removeLabel={common.remove}
              onChange={(next) => patch({ responsibilities: next })}
            />

            <Field label={t.metrics}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {role.successMetrics.length === 0 && (
                  <span style={{ fontSize: 12.5, color: c.muted }}>{common.none}</span>
                )}
                {role.successMetrics.map((metric, j) => (
                  <MetricRow
                    key={j}
                    index={j}
                    metric={metric}
                    labelText={t.metricLabel}
                    targetText={t.metricTarget}
                    removeText={common.remove}
                    onChange={(next) =>
                      patch({ successMetrics: replaceAt(role.successMetrics, j, next) })
                    }
                    onRemove={() =>
                      patch({ successMetrics: role.successMetrics.filter((_, k) => k !== j) })
                    }
                  />
                ))}
                {role.successMetrics.length < MAX_METRICS && (
                  <div>
                    <Btn
                      type="button"
                      onClick={() =>
                        patch({
                          successMetrics: [
                            ...role.successMetrics,
                            // `text` is the honest default unit: the user has
                            // typed nothing, and guessing "percent" would put a
                            // unit on the record that nobody chose.
                            { label: "", target: "", unit: "text" },
                          ],
                        })
                      }
                      style={ghostBtn}
                      hoverStyle={ghostBtnHover}
                    >
                      + {t.metricLabel}
                    </Btn>
                  </div>
                )}
              </div>
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: r.col2, gap: 14 }}>
              <StringList
                label={t.stakeholders}
                items={role.stakeholders}
                placeholder={common.add}
                addLabel={common.add}
                removeLabel={common.remove}
                max={8}
                onChange={(next) => patch({ stakeholders: next })}
              />
              <StringList
                label={t.handoffs}
                items={role.handoffs}
                placeholder={common.add}
                addLabel={common.add}
                removeLabel={common.remove}
                max={8}
                onChange={(next) => patch({ handoffs: next })}
              />
            </div>
          </div>
        );
      })}
    </Card>
  );
}

/** Label + target, side by side. Both are free text; the unit rides along. */
function MetricRow({
  index,
  metric,
  labelText,
  targetText,
  removeText,
  onChange,
  onRemove,
}: {
  index: number;
  metric: TemplateMetric;
  labelText: string;
  targetText: string;
  removeText: string;
  onChange: (next: TemplateMetric) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input
        aria-label={`${labelText} ${index + 1}`}
        value={metric.label}
        maxLength={80}
        onChange={(e) => onChange({ ...metric, label: e.target.value })}
        style={{ ...inputStyle, flex: "2 1 180px", fontSize: 13.5 }}
      />
      <input
        aria-label={`${targetText} ${index + 1}`}
        value={metric.target}
        maxLength={40}
        onChange={(e) => onChange({ ...metric, target: e.target.value })}
        style={{ ...inputStyle, flex: "1 1 110px", fontSize: 13.5, fontFamily: font.mono }}
      />
      <IconBtn
        label={`${removeText}: ${sanitizeUntrusted(metric.label, 40) || String(index + 1)}`}
        glyph="✕"
        tone="danger"
        onClick={onRemove}
      />
    </div>
  );
}
