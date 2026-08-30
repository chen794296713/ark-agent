"use client";

/**
 * Section 4 of 6 — RULES & BOUNDARIES.
 *
 * The circuit breakers. Autonomy, the money ceiling, the daily action cap, the
 * rules themselves, what the agent must never do, when it comes to you, how it
 * treats personal data, and what it may spend.
 *
 * Two decisions worth naming:
 *
 *  - A rule's SEVERITY is editable in place. "NEVER quote a price" and "should
 *    prefer to quote from the price list" are different products, and a badge
 *    the user can read but not change is a decision the model made for them.
 *  - `escalation.to` is typed `null` in the draft and is therefore not a field
 *    here. A model that emits an address has either hallucinated one or lifted
 *    a stranger's out of the brief; the real address is collected against a
 *    real agent, after materialisation.
 */
import { useState } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import type { Autonomy } from "@/lib/agent-settings";
import type { RuleCategory, TemplateBoundaries } from "@/lib/atg/types";
import { create } from "@/lib/i18n/create";
import {
  Card,
  Field,
  IconBtn,
  Mono,
  Notice,
  SelectField,
  Seg,
  Skeleton,
  StringList,
  TextField,
  Toggle,
  ghostBtn,
  ghostBtnHover,
  inputStyle,
} from "@/components/create/shared";
import { sanitizeUntrusted } from "@/components/create/logic";
import { clampInt, replaceAt, type SectionProps } from "./ReviewSections";

const RULE_CATEGORIES: RuleCategory[] = [
  "money",
  "external_comms",
  "data",
  "scope",
  "quality",
  "legal",
  "safety",
  "schedule",
];
const AUTONOMIES: Autonomy[] = ["suggest", "ask", "auto"];
/** The contract's ceiling (`rules: 3..12`). */
const MAX_RULES = 12;

export default function SectionRules({
  lang,
  draft,
  onChange,
  state,
  stateLabel,
  ready,
  domId,
}: SectionProps) {
  const t = create[lang].rules;
  const common = create[lang].common;
  const b = draft.boundaries;

  const [ruleDraft, setRuleDraft] = useState("");
  const [ruleSeverity, setRuleSeverity] = useState<"hard" | "soft">("hard");
  const [ruleCategory, setRuleCategory] = useState<RuleCategory>("scope");
  /** Spoken after a keyboard reorder — the move is otherwise invisible. */
  const [moved, setMoved] = useState<string | null>(null);

  const patch = (next: Partial<TemplateBoundaries>) =>
    onChange({ ...draft, boundaries: { ...b, ...next } });

  if (!ready) {
    return (
      <Card id={domId} title={t.title}>
        <Skeleton rows={4} />
      </Card>
    );
  }

  const addRule = () => {
    const text = ruleDraft.trim();
    if (!text || b.rules.length >= MAX_RULES) return;
    patch({ rules: [...b.rules, { text, severity: ruleSeverity, category: ruleCategory }] });
    setRuleDraft("");
  };

  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= b.rules.length) return;
    const rules = [...b.rules];
    const [row] = rules.splice(index, 1);
    rules.splice(to, 0, row);
    patch({ rules });
    setMoved(t.moved(sanitizeUntrusted(row.text, 40), to + 1, rules.length));
  };

  return (
    <Card
      id={domId}
      title={t.title}
      state={state}
      stateLabel={stateLabel}
      meta={<Mono>{t.count(b.rules.length)}</Mono>}
    >
      {b.rules.length === 0 && <Notice tone="warn">{t.empty}</Notice>}

      <div style={{ display: "grid", gridTemplateColumns: r.col3, gap: 14 }}>
        <Field label={t.autonomy}>
          <Seg
            label={t.autonomy}
            value={b.autonomy}
            onChange={(v) => patch({ autonomy: v })}
            options={AUTONOMIES.map((a) => ({ id: a, label: create[lang].agent.autonomy[a] }))}
          />
        </Field>
        <TextField
          label={t.approvalAmount}
          hint={t.approvalHint}
          type="number"
          inputMode="numeric"
          value={String(b.approvalAmountUsd)}
          onChange={(v) =>
            patch({ approvalAmountUsd: clampInt(v, 0, 1_000_000, b.approvalAmountUsd) })
          }
        />
        <TextField
          label={t.dailyLimit}
          hint={b.dailyActionLimit === 0 ? t.dailyLimitUnlimited : t.dailyLimitHint}
          type="number"
          inputMode="numeric"
          value={String(b.dailyActionLimit)}
          onChange={(v) => patch({ dailyActionLimit: clampInt(v, 0, 10_000, b.dailyActionLimit) })}
        />
      </div>

      <Toggle
        label={t.externalSends}
        desc={t.externalSendsHint}
        on={b.approveExternalSends}
        onChange={(on) => patch({ approveExternalSends: on })}
      />

      {/* ---- the rules ---- */}
      <Field label={t.rulesHeading}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {b.rules.map((rule, i) => (
            <div
              key={`${i}-${rule.text.slice(0, 12)}`}
              style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}
            >
              {/* The badge is a control: severity is the difference between a
                  prohibition and a preference, and the user owns it. */}
              <Btn
                type="button"
                aria-pressed={rule.severity === "hard"}
                aria-label={`${t.severityField}: ${
                  rule.severity === "hard" ? t.severityHard : t.severitySoft
                }`}
                onClick={() =>
                  patch({
                    rules: replaceAt(b.rules, i, {
                      ...rule,
                      severity: rule.severity === "hard" ? "soft" : "hard",
                    }),
                  })
                }
                style={{
                  fontFamily: font.mono,
                  fontSize: 10,
                  letterSpacing: ".08em",
                  color: rule.severity === "hard" ? c.red : c.muted,
                  border: `1px solid ${rule.severity === "hard" ? c.redBorder : c.borderField}`,
                  background: rule.severity === "hard" ? c.redWash : "transparent",
                  borderRadius: r.radiusSm,
                  padding: "10px 8px",
                  flexShrink: 0,
                  cursor: "pointer",
                  minHeight: 38,
                }}
                hoverStyle={{ borderColor: c.borderMute }}
              >
                {rule.severity === "hard" ? t.severityHard : t.severitySoft}
              </Btn>
              <input
                aria-label={`${t.rulesHeading} ${i + 1}`}
                value={rule.text}
                maxLength={200}
                onChange={(e) =>
                  patch({ rules: replaceAt(b.rules, i, { ...rule, text: e.target.value }) })
                }
                style={{ ...inputStyle, flex: "1 1 220px", fontSize: 13.5 }}
              />
              <select
                aria-label={`${t.categoryField} ${i + 1}`}
                value={rule.category}
                onChange={(e) =>
                  patch({
                    rules: replaceAt(b.rules, i, {
                      ...rule,
                      category: e.target.value as RuleCategory,
                    }),
                  })
                }
                style={{ ...inputStyle, width: 150, fontSize: 12.5 }}
              >
                {RULE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {t.categories[cat]}
                  </option>
                ))}
              </select>
              <IconBtn label={t.moveUp} glyph="↑" onClick={() => move(i, -1)} disabled={i === 0} />
              <IconBtn
                label={t.moveDown}
                glyph="↓"
                onClick={() => move(i, 1)}
                disabled={i === b.rules.length - 1}
              />
              <IconBtn
                label={`${common.remove}: ${sanitizeUntrusted(rule.text, 40)}`}
                glyph="✕"
                tone="danger"
                onClick={() => patch({ rules: b.rules.filter((_, j) => j !== i) })}
              />
            </div>
          ))}

          {/* Reordering is keyboard-only, so the move has to be spoken. */}
          <div role="status" aria-live="polite" style={{ fontSize: 12.5, color: c.muted }}>
            {moved}
          </div>

          {b.rules.length < MAX_RULES && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                aria-label={t.severityField}
                value={ruleSeverity}
                onChange={(e) => setRuleSeverity(e.target.value as "hard" | "soft")}
                style={{ ...inputStyle, width: 120, fontSize: 12.5 }}
              >
                <option value="hard">{t.severityHard}</option>
                <option value="soft">{t.severitySoft}</option>
              </select>
              <select
                aria-label={t.categoryField}
                value={ruleCategory}
                onChange={(e) => setRuleCategory(e.target.value as RuleCategory)}
                style={{ ...inputStyle, width: 150, fontSize: 12.5 }}
              >
                {RULE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {t.categories[cat]}
                  </option>
                ))}
              </select>
              <input
                aria-label={t.addRule}
                value={ruleDraft}
                maxLength={200}
                placeholder={t.rulePlaceholder}
                onChange={(e) => setRuleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  addRule();
                }}
                style={{ ...inputStyle, flex: "1 1 200px", fontSize: 13.5 }}
              />
              <Btn
                type="button"
                onClick={addRule}
                disabled={!ruleDraft.trim()}
                style={{ ...ghostBtn, opacity: ruleDraft.trim() ? 1 : 0.5, whiteSpace: "nowrap" }}
                hoverStyle={ruleDraft.trim() ? ghostBtnHover : undefined}
              >
                {t.addRule}
              </Btn>
            </div>
          )}
        </div>
      </Field>

      <StringList
        label={t.prohibitions}
        items={b.prohibitions}
        placeholder={t.prohibitionAdd}
        addLabel={common.add}
        removeLabel={common.remove}
        max={10}
        onChange={(next) => patch({ prohibitions: next })}
      />

      <Field label={t.escalation}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <StringList
            label={t.escalationTriggers}
            items={b.escalation.triggers}
            placeholder={t.escalationTriggerAdd}
            addLabel={common.add}
            removeLabel={common.remove}
            max={6}
            onChange={(next) => patch({ escalation: { ...b.escalation, triggers: next } })}
          />
          <SelectField
            label={t.escalationChannel}
            value={b.escalation.channel}
            onChange={(v) =>
              patch({ escalation: { ...b.escalation, channel: v as "email" | "chat" | "none" } })
            }
            options={(["email", "chat", "none"] as const).map((id) => ({
              id,
              label: t.channels[id],
            }))}
          />
          <Field label={t.escalationTo} hint={t.escalationToHint}>
            <span style={{ fontSize: 13, color: c.muted }}>{common.none}</span>
          </Field>
        </div>
      </Field>

      <Field label={t.dataHandling}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Toggle
            label={t.piiAllowed}
            desc={t.piiHint}
            on={b.dataHandling.piiAllowed}
            onChange={(on) => patch({ dataHandling: { ...b.dataHandling, piiAllowed: on } })}
          />
          <TextField
            label={t.retentionDays}
            type="number"
            inputMode="numeric"
            value={String(b.dataHandling.retentionDays)}
            onChange={(v) =>
              patch({
                dataHandling: {
                  ...b.dataHandling,
                  retentionDays: clampInt(v, 0, 3650, b.dataHandling.retentionDays),
                },
              })
            }
          />
          <StringList
            label={t.redactFields}
            items={b.dataHandling.redactFields}
            placeholder={t.redactAdd}
            addLabel={common.add}
            removeLabel={common.remove}
            max={10}
            onChange={(next) => patch({ dataHandling: { ...b.dataHandling, redactFields: next } })}
          />
        </div>
      </Field>

      <Field label={t.spend}>
        <TextField
          label={t.monthlyCap}
          hint={t.monthlyCapHint}
          type="number"
          inputMode="numeric"
          value={String(b.spend.monthlyCreditCap)}
          onChange={(v) =>
            patch({
              spend: { monthlyCreditCap: clampInt(v, 0, 10_000_000, b.spend.monthlyCreditCap) },
            })
          }
        />
      </Field>
    </Card>
  );
}
