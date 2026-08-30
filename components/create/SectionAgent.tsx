"use client";

/**
 * Section 2 of 6 — AGENT.
 *
 * The machine that does the ROLE's job: its name, the harness it runs on, how
 * it talks, what it may touch, and when it is awake. The card also surfaces
 * `boundaries.autonomy`, which belongs to the RULES section but is the first
 * question anyone asks about an agent — it is the same value, edited in two
 * places, never a copy.
 *
 * The working-hours row exists because the DESCRIBE screen collects it. A
 * setting the user typed on screen one and can never see again is a setting
 * they will assume was ignored.
 */
import { c, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { CHANNEL_LABELS, CHANNEL_TYPE_IDS, type ChannelType } from "@/lib/channels";
import { HARNESS_LIST, type Harness } from "@/lib/harness";
import { LANGS } from "@/lib/i18n";
import type { Autonomy, ResponseLanguage, Tone } from "@/lib/agent-settings";
import type { TemplateAgent } from "@/lib/atg/types";
import { create } from "@/lib/i18n/create";
import {
  Card,
  ChipRow,
  Field,
  IconBtn,
  Mono,
  Notice,
  SelectField,
  Skeleton,
  StringList,
  TextArea,
  TextField,
  Toggle,
  ghostBtn,
  ghostBtnHover,
  inputStyle,
  useTimeZones,
} from "@/components/create/shared";
import { sanitizeMultiline, sanitizeUntrusted } from "@/components/create/logic";
import { SECTION_ROW, clampInt, replaceAt, type SectionProps } from "./ReviewSections";

const TONES: Tone[] = ["professional", "friendly", "concise", "formal", "playful"];
const AUTONOMIES: Autonomy[] = ["suggest", "ask", "auto"];
const TOOL_KEYS = ["shell", "files", "browser", "docker", "code"] as const;

export default function SectionAgent({
  lang,
  draft,
  onChange,
  state,
  stateLabel,
  ready,
  domId,
}: SectionProps) {
  const t = create[lang].agent;
  const common = create[lang].common;
  const days = create[lang].schedules;
  // The picker offers the platform's zone list, and always includes whatever
  // the draft already holds so a zone we do not list is still visible.
  const zones = useTimeZones(draft.agents[0]?.settings.timezone ?? "UTC");

  if (!ready) {
    return (
      <Card id={domId} title={t.title}>
        <Skeleton rows={5} />
      </Card>
    );
  }

  return (
    <Card id={domId} title={t.title} state={state} stateLabel={stateLabel}>
      {draft.agents.length === 0 && <Notice tone="warn">{t.empty}</Notice>}

      {draft.agents.map((agent, i) => {
        const patch = (next: Partial<TemplateAgent>) =>
          onChange({ ...draft, agents: replaceAt(draft.agents, i, { ...agent, ...next }) });
        const settings = agent.settings;

        return (
          <div key={agent.key} style={SECTION_ROW}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {agent.isPrimary ? (
                <Mono color={c.accent}>{t.primary}</Mono>
              ) : (
                <Btn
                  type="button"
                  onClick={() =>
                    onChange({
                      ...draft,
                      // Exactly one primary: promoting this one demotes the
                      // rest in the same write, so no intermediate state has
                      // two of them (or none).
                      agents: draft.agents.map((a, j) => ({ ...a, isPrimary: j === i })),
                    })
                  }
                  style={{ ...ghostBtn, fontSize: 12 }}
                  hoverStyle={ghostBtnHover}
                >
                  {t.makePrimary}
                </Btn>
              )}
              {draft.agents.length > 1 && !agent.isPrimary && (
                <span style={{ marginLeft: "auto" }}>
                  <IconBtn
                    label={`${common.remove}: ${sanitizeUntrusted(agent.name, 40)}`}
                    glyph="✕"
                    tone="danger"
                    onClick={() =>
                      onChange({ ...draft, agents: draft.agents.filter((_, j) => j !== i) })
                    }
                  />
                </span>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: r.col2, gap: 14 }}>
              <TextField
                label={t.nameField}
                value={agent.name}
                maxLength={60}
                onChange={(v) => patch({ name: v })}
              />
              <SelectField
                label={t.harnessField}
                value={agent.harness}
                onChange={(v) => patch({ harness: v as Harness })}
                options={HARNESS_LIST.map((h) => ({ id: h.id, label: h.label }))}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: r.col3, gap: 14 }}>
              {/* Autonomy lives in `boundaries`; it is surfaced here because it
                  is the first thing anyone asks about an agent. One value. */}
              <SelectField
                label={t.autonomyField}
                hint={t.autonomyHint[draft.boundaries.autonomy]}
                value={draft.boundaries.autonomy}
                onChange={(v) =>
                  onChange({
                    ...draft,
                    boundaries: { ...draft.boundaries, autonomy: v as Autonomy },
                  })
                }
                options={AUTONOMIES.map((a) => ({ id: a, label: t.autonomy[a] }))}
              />
              <SelectField
                label={t.toneField}
                value={settings.tone}
                onChange={(v) => patch({ settings: { ...settings, tone: v as Tone } })}
                options={TONES.map((x) => ({ id: x, label: t.tone[x] }))}
              />
              <SelectField
                label={t.languageField}
                value={settings.responseLanguage}
                onChange={(v) =>
                  patch({ settings: { ...settings, responseLanguage: v as ResponseLanguage } })
                }
                options={[
                  { id: "auto", label: t.languageAuto },
                  ...LANGS.map((l) => ({ id: l.code, label: l.label })),
                ]}
              />
            </div>

            <TextArea
              label={t.instructionsField}
              hint={t.instructionsHint}
              value={agent.brief}
              rows={5}
              maxLength={4000}
              counter={String(agent.brief.length)}
              onChange={(v) => patch({ brief: sanitizeMultiline(v, 4000) })}
            />

            <Field label={t.channelsField}>
              <ChipRow
                label={t.channelsField}
                options={CHANNEL_TYPE_IDS.map((id) => ({ id, label: CHANNEL_LABELS[id] }))}
                selected={agent.channels}
                onToggle={(id: ChannelType) =>
                  patch({
                    channels: agent.channels.includes(id)
                      ? agent.channels.filter((x) => x !== id)
                      : [...agent.channels, id],
                  })
                }
              />
            </Field>

            <Field label={t.toolsField}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {TOOL_KEYS.map((key) => (
                  <Toggle
                    key={key}
                    label={t.tools[key]}
                    on={agent.tools[key]}
                    onChange={(on) => patch({ tools: { ...agent.tools, [key]: on } })}
                  />
                ))}
              </div>
            </Field>

            <StringList
              label={t.tasksField}
              items={agent.tasks.map((task) => task.text)}
              placeholder={t.taskAdd}
              addLabel={common.add}
              removeLabel={common.remove}
              onChange={(next) =>
                patch({
                  tasks: next.map((text, order) => ({
                    // The existing row's `meta` rides along with its position,
                    // so editing task 2's text does not throw away its note.
                    text,
                    meta: agent.tasks[order]?.meta ?? null,
                    sortOrder: order,
                  })),
                })
              }
            />

            {/* ---- when it is awake ---- */}
            <Toggle
              label={t.alwaysOn}
              desc={t.alwaysOnHint}
              on={settings.alwaysOn}
              onChange={(on) => patch({ settings: { ...settings, alwaysOn: on } })}
            />
            {!settings.alwaysOn && (
              <>
                <Field label={t.hoursField}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="time"
                      aria-label={`${t.hoursField} — 1`}
                      value={settings.workStart}
                      onChange={(e) =>
                        patch({ settings: { ...settings, workStart: e.target.value } })
                      }
                      style={{ ...inputStyle, width: 130 }}
                    />
                    <span style={{ fontSize: 13, color: c.muted }}>{t.hoursTo}</span>
                    <input
                      type="time"
                      aria-label={`${t.hoursField} — 2`}
                      value={settings.workEnd}
                      onChange={(e) => patch({ settings: { ...settings, workEnd: e.target.value } })}
                      style={{ ...inputStyle, width: 130 }}
                    />
                  </div>
                </Field>
                <Field label={t.daysField}>
                  <ChipRow
                    label={t.daysField}
                    // The id is the day NUMBER as a string: "S" appears twice
                    // in an English week and would collide as a key.
                    options={days.dayNames.map((label, idx) => ({
                      id: String(idx),
                      label: `${label} · ${days.dayNamesLong[idx]}`,
                    }))}
                    selected={settings.workDays.map(String)}
                    onToggle={(id) => {
                      const day = Number(id);
                      const workDays = settings.workDays.includes(day)
                        ? settings.workDays.filter((d) => d !== day)
                        : [...settings.workDays, day].sort((a, b) => a - b);
                      patch({ settings: { ...settings, workDays } });
                    }}
                  />
                </Field>
              </>
            )}

            <div style={{ display: "grid", gridTemplateColumns: r.col2, gap: 14 }}>
              <SelectField
                label={t.timezoneField}
                value={settings.timezone}
                onChange={(v) => patch({ settings: { ...settings, timezone: v } })}
                options={zones.map((z) => ({ id: z, label: z }))}
              />
              <TextField
                label={t.heartbeatField}
                hint={t.heartbeatHint(settings.heartbeatMinutes)}
                type="number"
                inputMode="numeric"
                value={String(settings.heartbeatMinutes)}
                onChange={(v) =>
                  patch({
                    settings: {
                      ...settings,
                      heartbeatMinutes: clampInt(v, 1, 1440, settings.heartbeatMinutes),
                    },
                  })
                }
              />
            </div>
          </div>
        );
      })}
    </Card>
  );
}
