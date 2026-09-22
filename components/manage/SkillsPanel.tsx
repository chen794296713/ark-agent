"use client";

/**
 * SKILLS — attach, detach, enable, acknowledge. §E.4 / §E.2.
 *
 * A skill is code that runs on the agent's machine with the agent's credentials.
 * That single fact drives every decision in this panel:
 *
 *  - **Risk is shown on the row, not behind a link.** A user who has to click to
 *    find out that a skill can spend money will not click.
 *  - **High risk asks, every time it becomes high.** The gate keys on the CURRENT
 *    `riskLevel`, not on `riskLevelAtAttach`, so a skill that was `medium` in March
 *    and is `high` after a re-scan asks again. Both columns exist for exactly this.
 *  - **Compatibility has three states, never two.** `asserted` ⇒ ✓, an unmet
 *    requirement ⇒ ✕, and "nobody checked" ⇒ ⚠. Folding ⚠ into ✓ claims a check we
 *    did not run; folding it into ✕ blocks skills that work fine.
 *  - **Detaching removes the row from the draft.** Flipping `state` to `removed`
 *    in place would leave `skills.attached` unchanged, and the save bar would show
 *    no unsaved change for a detach — the one edit nobody would forgive us losing.
 *
 * Every string that came from a publisher — name, summary, install error, unmet
 * requirement — is rendered as TEXT. Nothing here is a link and nothing is executed.
 */
import { useMemo, useState } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { manage, mt } from "@/lib/i18n/manage";
import type { ManageDict } from "@/lib/i18n/manage";
import type { Lang } from "@/lib/types";
import type { Harness } from "@/lib/harness";
import {
  Badge,
  CheckRow,
  ConfirmDialog,
  EmptyState,
  ErrorPanel,
  InlineError,
  LinkBtn,
  SettingCard,
  Toggle,
  sInput,
} from "./primitives";
import { LIMITS, activeSkills, draftId, needsRecheck } from "./logic";
import type { ErrorMap } from "./logic";
import type { AgentSkillRow, CompatBasis, RiskLevel, SkillInstallState } from "./types";
import { errText } from "./DirtyBar";

/**
 * One row of the attachable catalogue. Declared here rather than imported from
 * `lib/skills/*` because this panel must compile against whatever the catalogue
 * endpoint ends up returning; the caller adapts, and the adapter is one `map`.
 */
export interface SkillCatalogItem {
  /** skills.id — the SKILL, not an attachment. */
  id: string;
  /** (source, ownerHandle, slug) rendered — a bare slug resolves six ways. */
  publicId: string;
  slug: string;
  ownerHandle: string;
  source: string;
  name: string;
  summary: string | null;
  /** A concrete version. The row pins it; "latest" is not a version. */
  version: string;
  riskLevel: RiskLevel;
  /** Harnesses the publisher asserts. Empty is "unverified", not "incompatible". */
  harnesses: Harness[];
}

const RISK_COLOR: Record<RiskLevel, string> = {
  low: c.muted,
  medium: c.amber,
  high: c.red,
};

const RISK_GLYPH: Record<RiskLevel, string> = { low: "·", medium: "▲", high: "▲" };

export function SkillsPanel({
  lang,
  skills,
  baseSkills,
  engine,
  managerMode = "live",
  errors,
  disabled = false,
  unavailable = false,
  loadError = null,
  catalog = null,
  catalogLoading = false,
  catalogError = null,
  onOpenCatalog,
  onRetry,
  onChange,
}: {
  lang: Lang;
  skills: AgentSkillRow[];
  baseSkills: AgentSkillRow[];
  /** agents.engine — the harness this agent actually runs. */
  engine: Harness;
  managerMode?: "live" | "mock" | "unconfigured";
  errors: ErrorMap;
  disabled?: boolean;
  /** The skills endpoint is absent from this build. */
  unavailable?: boolean;
  loadError?: string | null;
  /** null = the catalogue has not been fetched; [] = fetched and empty. */
  catalog?: SkillCatalogItem[] | null;
  catalogLoading?: boolean;
  catalogError?: string | null;
  /** Fired the first time the picker opens, so the caller can lazy-load. */
  onOpenCatalog?: () => void;
  onRetry?: () => void;
  onChange: (next: AgentSkillRow[]) => void;
}) {
  const t = manage[lang];
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [detaching, setDetaching] = useState<AgentSkillRow | null>(null);
  /** The row (existing or about-to-be-attached) whose risk gate is open. */
  const [riskGate, setRiskGate] = useState<
    { kind: "attach"; item: SkillCatalogItem } | { kind: "ack"; row: AgentSkillRow } | null
  >(null);
  const [acked, setAcked] = useState(false);

  const baseById = useMemo(() => new Map(baseSkills.map((x) => [x.id, x])), [baseSkills]);
  const live = activeSkills(skills);

  let dirtyCount = 0;
  for (const s of skills) {
    const was = baseById.get(s.id);
    if (!was) {
      dirtyCount += 1;
      continue;
    }
    if (was.enabled !== s.enabled) dirtyCount += 1;
    if (was.version !== s.version) dirtyCount += 1;
    if (was.riskAcknowledged !== s.riskAcknowledged) dirtyCount += 1;
  }
  for (const was of baseSkills) if (!skills.some((x) => x.id === was.id)) dirtyCount += 1;

  const errorCount = Object.keys(errors).filter(
    (k) => k === "skills" || k.startsWith("skills."),
  ).length;
  const countError = errText(t, errors["skills"]);
  const atCap = live.length >= LIMITS.skillCountMax;

  const attachedSkillIds = new Set(skills.map((x) => x.skillId));

  function attach(item: SkillCatalogItem, acknowledged: boolean) {
    const compatible = item.harnesses.includes(engine);
    const row: AgentSkillRow = {
      id: draftId("askill"),
      skillId: item.id,
      slug: item.slug,
      ownerHandle: item.ownerHandle,
      source: item.source,
      publicId: item.publicId,
      version: item.version,
      name: item.name,
      summary: item.summary,
      riskLevel: item.riskLevel,
      riskLevelAtAttach: item.riskLevel,
      riskAcknowledged: acknowledged,
      enabled: true,
      state: "pending",
      installError: null,
      // A mock-mode attachment must never read as a real installation.
      installSource: managerMode === "live" ? "live" : "mock",
      assertedHarness: engine,
      compatAsserted: compatible,
      // No assertion is "unverified", never "incompatible": the publisher simply
      // has not said, and refusing on silence would block most of the catalogue.
      compatBasis: compatible ? "asserted" : item.harnesses.length > 0 ? "inferred" : "unknown",
      unmetRequirements: [],
      blocked: false,
      updateAvailable: null,
    };
    onChange([...skills, row]);
  }

  function requestAttach(item: SkillCatalogItem) {
    if (item.riskLevel === "high") {
      setAcked(false);
      setRiskGate({ kind: "attach", item });
      return;
    }
    attach(item, false);
  }

  function patch(id: string, next: Partial<AgentSkillRow>) {
    onChange(skills.map((x) => (x.id === id ? { ...x, ...next } : x)));
  }

  function detach(row: AgentSkillRow) {
    onChange(skills.filter((x) => x.id !== row.id));
  }

  const filtered = (catalog ?? []).filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.publicId.toLowerCase().includes(q) ||
      (item.summary ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <SettingCard
      title={t.skillsTitle}
      sectionId="cfg-skills"
      desc={t.skillsDesc}
      dirtyCount={dirtyCount}
      errorCount={errorCount}
      editedLabel={t.edited}
      problemLabel={mt(errorCount === 1 ? t.problemOne : t.problemMany, { n: errorCount })}
      actions={
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: ".08em",
            color: atCap ? c.amber : c.muted,
          }}
        >
          {mt(t.skillCounter, { n: live.length, max: LIMITS.skillCountMax })}
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
      {unavailable && <ErrorPanel title={t.skillsUnavailable} />}
      {countError && <InlineError text={countError} />}

      {skills.length === 0 ? (
        <EmptyState
          glyph="⌘"
          title={t.noSkillsTitle}
          body={t.noSkillsBody}
          actions={
            <PrimaryGhost
              label={t.browseSkills}
              disabled={disabled || unavailable}
              onClick={() => {
                setPicking(true);
                onOpenCatalog?.();
              }}
            />
          }
        />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {skills.map((row) => (
            <SkillRow
              key={row.id}
              lang={lang}
              row={row}
              engine={engine}
              disabled={disabled}
              dirty={dirtyOf(row, baseById.get(row.id))}
              error={errText(t, errors[`skills.${row.id}.riskAcknowledged`])}
              onToggle={(v) => patch(row.id, { enabled: v })}
              onDetach={() => setDetaching(row)}
              onAcknowledge={() => {
                setAcked(false);
                setRiskGate({ kind: "ack", row });
              }}
            />
          ))}
        </ul>
      )}

      {skills.length > 0 && !picking && (
        <div>
          <PrimaryGhost
            label={t.addSkill}
            disabled={disabled || unavailable || atCap}
            onClick={() => {
              setPicking(true);
              onOpenCatalog?.();
            }}
          />
        </div>
      )}

      {picking && (
        <div
          style={{
            border: `1px solid ${c.borderField}`,
            borderRadius: r.radiusSm,
            background: c.panelDeep,
            padding: 14,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                letterSpacing: ".1em",
                color: c.muted,
              }}
            >
              {t.browseSkills}
            </span>
            <span style={{ flex: 1 }} />
            <LinkBtn onClick={() => setPicking(false)}>{t.close}</LinkBtn>
          </div>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.skillSearchPlaceholder}
            aria-label={t.skillSearchPlaceholder}
            style={{ ...sInput, background: c.bg }}
          />

          {catalogError ? (
            <ErrorPanel
              title={t.skillCatalogError}
              body={catalogError}
              onRetry={onOpenCatalog}
              retryLabel={t.tryAgain}
            />
          ) : catalogLoading ? (
            <div style={{ fontSize: 13, color: c.muted }}>{t.skillCatalogLoading}</div>
          ) : catalog === null ? (
            <ErrorPanel title={t.skillsUnavailable} />
          ) : filtered.length === 0 ? (
            <div style={{ fontSize: 13, color: c.muted }}>{t.skillCatalogEmpty}</div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {filtered.map((item) => {
                const already = attachedSkillIds.has(item.id);
                return (
                  <li
                    key={item.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      borderTop: `1px solid ${c.lineSoft}`,
                      paddingTop: 8,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontSize: 13.5, color: c.text }}>{item.name}</span>
                        <Badge
                          text={riskLabel(t, item.riskLevel)}
                          color={RISK_COLOR[item.riskLevel]}
                          glyph={RISK_GLYPH[item.riskLevel]}
                        />
                        {!item.harnesses.includes(engine) && (
                          <Badge
                            text={t.compatUnknown}
                            color={c.amber}
                            glyph="⚠"
                            title={mt(t.compatUnknownHint, { engine })}
                          />
                        )}
                      </div>
                      <div
                        style={{
                          fontFamily: font.mono,
                          fontSize: 11,
                          color: c.faint,
                          marginTop: 3,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {item.publicId} · {item.version}
                      </div>
                      {item.summary && (
                        <div style={{ fontSize: 12.5, color: c.muted, marginTop: 4, lineHeight: 1.5 }}>
                          {item.summary}
                        </div>
                      )}
                    </div>
                    <Btn
                      type="button"
                      disabled={already || disabled || atCap}
                      onClick={() => requestAttach(item)}
                      hoverStyle={already || atCap ? undefined : { borderColor: c.limeBorder }}
                      style={{
                        border: `1px solid ${already || atCap ? c.borderField : c.limeBorder}`,
                        background: already || atCap ? "transparent" : c.limeWash,
                        color: already || atCap ? c.faint : c.accent,
                        padding: "6px 12px",
                        fontFamily: font.mono,
                        fontSize: 11.5,
                        borderRadius: r.radiusSm,
                        cursor: already || atCap ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {already ? t.attachedAlready : t.attachAction}
                    </Btn>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {detaching && (
        <ConfirmDialog
          title={mt(t.detachTitle, { name: detaching.name })}
          body={t.detachBody}
          confirmLabel={t.detach}
          cancelLabel={t.cancel}
          danger
          onCancel={() => setDetaching(null)}
          onConfirm={() => {
            detach(detaching);
            setDetaching(null);
          }}
        />
      )}

      {riskGate && (
        <ConfirmDialog
          title={t.riskConfirmTitle}
          body={mt(t.riskConfirmBody, {
            name: riskGate.kind === "attach" ? riskGate.item.name : riskGate.row.name,
          })}
          confirmLabel={riskGate.kind === "attach" ? t.attachAction : t.acknowledgeRisk}
          cancelLabel={t.cancel}
          danger
          confirmDisabled={!acked}
          extra={<CheckRow checked={acked} onChange={setAcked} label={t.riskAckCheckbox} />}
          onCancel={() => setRiskGate(null)}
          onConfirm={() => {
            if (!acked) return;
            if (riskGate.kind === "attach") attach(riskGate.item, true);
            else patch(riskGate.row.id, { riskAcknowledged: true });
            setRiskGate(null);
          }}
        />
      )}
    </SettingCard>
  );
}

function dirtyOf(row: AgentSkillRow, was: AgentSkillRow | undefined): boolean {
  if (!was) return true;
  return (
    was.enabled !== row.enabled ||
    was.version !== row.version ||
    was.riskAcknowledged !== row.riskAcknowledged
  );
}

function riskLabel(t: ManageDict, level: RiskLevel): string {
  return level === "high" ? t.riskHigh : level === "medium" ? t.riskMedium : t.riskLow;
}

function stateLabel(t: ManageDict, state: SkillInstallState): string {
  switch (state) {
    case "pending":
      return t.stPending;
    case "installing":
      return t.stInstalling;
    case "installed":
      return t.stInstalled;
    case "failed":
      return t.stFailed;
    case "removing":
      return t.stRemoving;
    case "removed":
      return t.stRemoved;
  }
}

/**
 * The three display states of §E.2, decided from BOTH columns. `compatAsserted`
 * alone cannot tell ✓ from ⚠: a row can carry a true flag on an `inferred` basis,
 * which is a guess, and rendering a guess as a green tick is the claim this
 * function exists to refuse.
 */
function compatState(row: AgentSkillRow): "ok" | "unmet" | "unknown" {
  if (row.unmetRequirements.length > 0) return "unmet";
  const basis: CompatBasis = row.compatBasis;
  if (basis === "asserted" && row.compatAsserted) return "ok";
  return "unknown";
}

function SkillRow({
  lang,
  row,
  engine,
  disabled,
  dirty,
  error,
  onToggle,
  onDetach,
  onAcknowledge,
}: {
  lang: Lang;
  row: AgentSkillRow;
  engine: Harness;
  disabled: boolean;
  dirty: boolean;
  error: string | null;
  onToggle: (v: boolean) => void;
  onDetach: () => void;
  onAcknowledge: () => void;
}) {
  const t = manage[lang];
  const removed = row.state === "removed";
  const recheck = needsRecheck(row, engine);
  const state = compatState(row);

  // Three states, never two. `unknown` with nothing unmet is a genuine ⚠.
  const compat =
    state === "unmet"
      ? { glyph: "✕", color: c.red, text: t.compatUnmet, hint: t.compatUnmetHint }
      : state === "ok"
        ? { glyph: "✓", color: c.accent, text: t.compatOk, hint: mt(t.compatOkHint, { engine }) }
        : {
            glyph: "⚠",
            color: c.amber,
            text: t.compatUnknown,
            hint: mt(t.compatUnknownHint, { engine }),
          };

  const needsAck = !removed && row.riskLevel === "high" && !row.riskAcknowledged;

  return (
    <li
      style={{
        border: `1px solid ${error ? c.redBorder : c.border}`,
        borderLeft: `2px solid ${dirty ? c.amber : error ? c.redBorder : c.border}`,
        borderRadius: r.radiusSm,
        background: c.panelDeep,
        padding: 14,
        display: "grid",
        gap: 10,
        opacity: removed ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: c.text }}>{row.name}</span>
            <Badge
              text={riskLabel(t, row.riskLevel)}
              color={RISK_COLOR[row.riskLevel]}
              glyph={RISK_GLYPH[row.riskLevel]}
            />
            <Badge text={compat.text} color={compat.color} glyph={compat.glyph} title={compat.hint} />
            <Badge text={stateLabel(t, row.state)} color={row.state === "failed" ? c.red : c.muted} />
            {row.installSource === "mock" && (
              <Badge text={t.mockInstall} color={c.amber} glyph="◍" />
            )}
            {row.blocked && (
              <Badge text={t.blockedBadge} color={c.red} glyph="✕" title={t.blockedHint} />
            )}
            {recheck && (
              <Badge
                text={t.needsRecheck}
                color={c.amber}
                glyph="⚠"
                title={mt(t.needsRecheckHint, { asserted: row.assertedHarness, engine })}
              />
            )}
            {row.riskLevel === "high" && row.riskAcknowledged && (
              <Badge text={t.riskAcknowledged} color={c.muted} glyph="✓" />
            )}
          </div>

          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: c.faint,
              marginTop: 4,
              overflowWrap: "anywhere",
            }}
          >
            {row.publicId} · {row.version}
            {row.updateAvailable ? ` · ${mt(t.updateAvailable, { version: row.updateAvailable })}` : ""}
          </div>

          {row.summary && (
            <div style={{ fontSize: 12.5, color: c.muted, marginTop: 6, lineHeight: 1.5 }}>
              {row.summary}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {!removed && (
            <Toggle
              on={row.enabled}
              // A withdrawn or un-rechecked skill can always be turned OFF and never
              // back ON. Disabling the control outright would strand a skill in the
              // enabled state with no way to stop it, which is the opposite of safe.
              disabled={disabled || ((recheck || row.blocked) && !row.enabled)}
              label={row.enabled ? t.disableSkill : t.enableSkill}
              onChange={onToggle}
            />
          )}
          <LinkBtn onClick={onDetach} danger disabled={disabled}>
            {t.detach}
          </LinkBtn>
        </div>
      </div>

      {recheck && (
        <div style={{ fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>
          {mt(t.needsRecheckHint, { asserted: row.assertedHarness, engine })}
        </div>
      )}

      {row.blocked && (
        <div style={{ fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>{t.blockedHint}</div>
      )}

      {row.unmetRequirements.length > 0 && (
        <div style={{ fontSize: 12.5, color: c.muted, lineHeight: 1.6 }}>
          <span style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: ".08em" }}>
            {t.unmetTitle}
          </span>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {row.unmetRequirements.map((req) => (
              <li key={req} style={{ fontFamily: font.mono, fontSize: 11.5, color: c.text2 }}>
                {req}
              </li>
            ))}
          </ul>
        </div>
      )}

      {row.installError && (
        <div style={{ fontSize: 12.5, color: c.text2, lineHeight: 1.5 }}>
          <span style={{ color: c.red }} aria-hidden="true">
            ▲{" "}
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: ".08em", color: c.muted }}>
            {t.installErrorLabel}
          </span>{" "}
          <span style={{ fontFamily: font.mono, fontSize: 11.5, overflowWrap: "anywhere" }}>
            {row.installError}
          </span>
        </div>
      )}

      {needsAck && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Badge text={t.riskNotAcknowledged} color={c.red} glyph="▲" />
          <LinkBtn onClick={onAcknowledge} disabled={disabled}>
            {t.acknowledgeRisk}
          </LinkBtn>
        </div>
      )}

      {error && <InlineError text={error} />}
    </li>
  );
}

function PrimaryGhost({
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
