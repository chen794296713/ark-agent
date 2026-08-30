"use client";

/**
 * Section 3 of 6 — SKILLS.
 *
 * Everything on this card is third-party text: a skill's display name, its
 * purpose, its owner handle and the binaries it asks for all come from a
 * catalogue we did not write. Every one of them goes through
 * `sanitizeUntrusted` before it reaches the DOM — React escapes markup, but it
 * will happily render a U+202E that reverses the rest of the line, and a
 * "name" that is really a paragraph.
 *
 * The compatibility badge has THREE states, never two. With no Agent Manager
 * connected, nothing can be asserted against a real machine, so every skill
 * reads "unverified" — which is not the same as broken, and not the same as
 * working. Saying "✓ works here" on an unverified skill is the lie this card
 * exists to avoid.
 *
 * A high-risk skill cannot be attached from a creation screen at all: it is
 * added later from the agent's own Skills tab, where the acceptance is recorded
 * against a real agent.
 */
import { useState } from "react";
import { c, font } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { harnessLabel, type Harness } from "@/lib/harness";
import type { Lang } from "@/lib/types";
import type { TemplateSkill } from "@/lib/atg/types";
import { create } from "@/lib/i18n/create";
import {
  Card,
  IconBtn,
  Mono,
  Notice,
  Skeleton,
  Toggle,
  ghostBtn,
  ghostBtnHover,
} from "@/components/create/shared";
import { compatState, sanitizeUntrusted, type ManagerMode } from "@/components/create/logic";
import { SECTION_ROW, replaceAt, type SectionProps } from "./ReviewSections";

export default function SectionSkills({
  lang,
  draft,
  onChange,
  state,
  stateLabel,
  ready,
  domId,
  managerMode,
}: SectionProps & { managerMode: ManagerMode }) {
  const t = create[lang].skills;
  // Removed rows are remembered so "suggested by your brief but not added" can
  // offer them back. Local UI memory — never part of the saved draft.
  const [removed, setRemoved] = useState<TemplateSkill[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (!ready) {
    return (
      <Card id={domId} title={t.title}>
        <Skeleton rows={4} />
      </Card>
    );
  }

  return (
    <Card
      id={domId}
      title={t.title}
      state={state}
      stateLabel={stateLabel}
      meta={<Mono>{t.count(draft.skills.length)}</Mono>}
      desc={t.addUnavailable}
    >
      {managerMode !== "live" && <Notice tone="warn">{t.unverifiedMode}</Notice>}
      {draft.skills.length === 0 && <Notice>{t.empty}</Notice>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {draft.skills.map((skill, i) => {
          const compat = compatState(skill, managerMode);
          const blocked = skill.riskLevel === "high";
          const open = openKey === skill.key;
          // Named verbatim from the catalogue's `requirements`: a row that says
          // "incompatible" without naming the missing binary or env var is an
          // accusation the user cannot act on.
          const missing = [
            ...(skill.requirements?.bins ?? []),
            ...(skill.requirements?.env ?? []),
            ...(skill.requirements?.config ?? []),
          ]
            .map((x) => sanitizeUntrusted(String(x), 40))
            .filter(Boolean);

          return (
            <div key={skill.key} style={SECTION_ROW}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: 13,
                    color: c.text,
                    fontWeight: 500,
                    minWidth: 0,
                    overflowWrap: "anywhere",
                  }}
                >
                  {sanitizeUntrusted(skill.displayName || skill.slug, 60)}
                </span>
                <RiskPill lang={lang} level={skill.riskLevel} />
                <CompatBadge
                  lang={lang}
                  compat={compat}
                  harness={draft.harness}
                  missing={missing}
                />
                {skill.ownerHandle && (
                  <Mono color={c.muted} size={10.5}>
                    {sanitizeUntrusted(skill.ownerHandle, 32)}
                  </Mono>
                )}
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <IconBtn
                    label={t.details}
                    glyph={open ? "▾" : "▸"}
                    tone="accent"
                    onClick={() => setOpenKey(open ? null : skill.key)}
                  />
                  <IconBtn
                    label={`${t.remove}: ${sanitizeUntrusted(skill.displayName || skill.slug, 40)}`}
                    glyph="✕"
                    tone="danger"
                    onClick={() => {
                      setRemoved((prev) => [...prev, skill]);
                      onChange({ ...draft, skills: draft.skills.filter((_, j) => j !== i) });
                    }}
                  />
                </span>
              </div>

              <p style={{ fontSize: 12.5, color: c.muted, margin: 0, overflowWrap: "anywhere" }}>
                {sanitizeUntrusted(skill.purpose, 240)}
              </p>

              {blocked ? (
                <Notice tone="warn">{t.highBlocked}</Notice>
              ) : (
                <Toggle
                  label={skill.required ? t.requiredToggle : t.optionalToggle}
                  on={skill.required}
                  onChange={(on) =>
                    onChange({
                      ...draft,
                      skills: replaceAt(draft.skills, i, { ...skill, required: on }),
                    })
                  }
                />
              )}

              {open && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    borderTop: `1px solid ${c.lineSoft}`,
                    paddingTop: 10,
                  }}
                >
                  <div style={{ fontSize: 12.5, color: c.muted }}>
                    {missing.length > 0 ? `${t.requires}: ${missing.join(" · ")}` : t.noRequirements}
                  </div>
                  {/* Why the ranker put this skill on the list. The reasons are
                      written by our own retrieval step, but they quote skill
                      text, so they are sanitised like everything else. */}
                  {skill.rankReasons.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: c.muted }}>
                      {skill.rankReasons.slice(0, 4).map((reason, j) => (
                        <li key={j}>{sanitizeUntrusted(reason, 120)}</li>
                      ))}
                    </ul>
                  )}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Mono color={c.faint} size={10.5}>
                      {sanitizeUntrusted(skill.source, 24)}/{sanitizeUntrusted(skill.slug, 40)}
                      {skill.version ? `@${sanitizeUntrusted(skill.version, 24)}` : ""}
                    </Mono>
                    <Mono color={c.faint} size={10.5}>
                      {t.ranked(skill.rankScore)}
                    </Mono>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {removed.length > 0 && (
        <div>
          <div style={{ fontSize: 12.5, color: c.muted, marginBottom: 8 }}>{t.suggested}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {removed.map((skill) => (
              <Btn
                key={skill.key}
                type="button"
                aria-label={`${t.restore}: ${sanitizeUntrusted(skill.displayName || skill.slug, 40)}`}
                onClick={() => {
                  setRemoved((prev) => prev.filter((x) => x.key !== skill.key));
                  onChange({ ...draft, skills: [...draft.skills, skill] });
                }}
                style={{ ...ghostBtn, borderStyle: "dashed", fontFamily: font.mono, fontSize: 12 }}
                hoverStyle={ghostBtnHover}
              >
                + {sanitizeUntrusted(skill.displayName || skill.slug, 40)}
              </Btn>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: c.muted, marginTop: 6 }}>{t.restore}</div>
        </div>
      )}
    </Card>
  );
}

/** Risk as a dot AND a word — the dot alone would be colour-only (§I.4). */
function RiskPill({ lang, level }: { lang: Lang; level: TemplateSkill["riskLevel"] }) {
  const t = create[lang].skills;
  const color = level === "high" ? c.red : level === "medium" ? c.amber : c.green;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        aria-hidden
        style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }}
      />
      <Mono color={c.muted} size={10}>
        {t.riskLabel}: {t.risk[level]}
      </Mono>
    </span>
  );
}

/** Three states, never two. `unknown` is neither a tick nor a cross. */
function CompatBadge({
  lang,
  compat,
  harness,
  missing,
}: {
  lang: Lang;
  compat: "ok" | "no" | "unknown";
  harness: Harness;
  missing: string[];
}) {
  const t = create[lang].skills;
  if (compat === "ok") {
    return (
      <Mono color={c.green} size={10.5}>
        ✓ {t.compatOk} · {t.compatOkHint(harnessLabel(harness))}
      </Mono>
    );
  }
  if (compat === "no") {
    return (
      <Mono color={c.red} size={10.5}>
        ✕ {t.compatNo} · {t.compatNoHint(missing.join(" · ") || t.noRequirements)}
      </Mono>
    );
  }
  return (
    <span title={t.compatUnknownHint}>
      <Mono color={c.muted} size={10.5}>
        ⚠ {t.compatUnknown}
      </Mono>
    </span>
  );
}
