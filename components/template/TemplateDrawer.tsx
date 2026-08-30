"use client";

/**
 * The template detail drawer — all six sections of the draft, and the CTA.
 *
 * This is the only surface in the gallery that reads `draft`, and it reads
 * exactly one at a time: `GET /api/templates/{id}` is 10–40 KB, which is fine
 * for a drawer and would be a megabyte across a 24-card grid.
 *
 * **Everything inside `draft` is untrusted text.** It was written by a model or
 * by another tenant, and it reaches the DOM only as a text node: no markdown, no
 * dangerouslySetInnerHTML, and the CONTEXT row for `kind: "url"` prints the URL
 * rather than linking it, because a link the agent will later fetch is not a
 * link the reader should be invited to click.
 *
 * `humanReadable` on a schedule is re-derived through `describeSchedule` rather
 * than shown as stored: the stored copy is in the template's locale and this
 * reader may not share it, and a model-authored sentence about when something
 * runs is exactly the string that must not be trusted.
 */
import { useEffect, useRef, useState } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { harnessLabel } from "@/lib/harness";
import { describeSchedule } from "@/lib/schedule/describe";
import { APPROVAL_CURRENCY } from "@/lib/agent-settings";
import { formatMoney } from "@/lib/pricing";
import type { Lang } from "@/lib/types";
import type { PlanTier } from "@/lib/pricing";
import type {
  AgentTemplateDraft,
  TemplateAgent,
  TemplateContextItem,
  TemplateRole,
  TemplateSchedule,
  TemplateSkill,
} from "@/lib/atg/types";
import type { TemplateGalleryDict } from "@/lib/i18n/template-gallery";
import type { TemplateDetailDTO, TemplateSummaryDTO } from "./types";
import { fetchTemplate } from "./client";
import { formatCount, isThirdParty, meetsPlan, relativeTime, templateBadge } from "./derive";
import { Chip, Glyph, HarnessPill, OwnershipBadge, RiskDot } from "./atoms";
import { MOBILE_QUERY, useMediaQuery } from "./useMediaQuery";

const MAX_LISTED = 6;

function SectionHead({ title, count }: { title: string; count: string }) {
  return (
    <summary
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        cursor: "pointer",
        padding: "12px 0",
        listStyle: "none",
      }}
    >
      <span
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: ".1em",
          color: c.muted,
          textTransform: "uppercase",
        }}
      >
        {title}
      </span>
      {/* A section count is a mono label, and the ramp's contract puts every
          mono label on c.muted — c.faint is for timestamps and placeholders. */}
      <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{count}</span>
    </summary>
  );
}

function Section({
  title,
  count,
  open,
  children,
}: {
  title: string;
  count: string;
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    // Native <details>: the disclosure keyboard contract and aria-expanded come
    // from the platform instead of being re-implemented (and got wrong) here.
    <details open={open} style={{ borderTop: `1px solid ${c.lineSoft}` }}>
      <SectionHead title={title} count={count} />
      <div style={{ paddingBottom: 16, display: "grid", gap: 10 }}>{children}</div>
    </details>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 13, color: c.muted }}>{text}</div>;
}

function RoleBlock({ role, dict }: { role: TemplateRole; dict: TemplateGalleryDict }) {
  return (
    <div
      style={{
        border: `1px solid ${c.line}`,
        borderRadius: r.radiusSm,
        padding: 12,
        background: c.panelDeep,
      }}
    >
      <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 14, color: c.text }}>
        {role.title}
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55, color: c.text2 }}>
        {role.mission}
      </p>
      {role.responsibilities.length > 0 && (
        <ul style={{ margin: "8px 0 0", paddingInlineStart: 18, color: c.text2, fontSize: 13 }}>
          {role.responsibilities.slice(0, MAX_LISTED).map((item, i) => (
            <li key={i} style={{ lineHeight: 1.55 }}>
              {item}
            </li>
          ))}
        </ul>
      )}
      {role.responsibilities.length > MAX_LISTED && (
        <div style={{ fontFamily: font.mono, fontSize: 11, color: c.muted, marginTop: 6 }}>
          {dict.moreItems(role.responsibilities.length - MAX_LISTED)}
        </div>
      )}
    </div>
  );
}

function AgentBlock({
  agent,
  autonomyLabel,
  dict,
}: {
  agent: TemplateAgent;
  autonomyLabel: string;
  dict: TemplateGalleryDict;
}) {
  return (
    <div
      style={{
        border: `1px solid ${c.line}`,
        borderRadius: r.radiusSm,
        padding: 12,
        background: c.panelDeep,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: font.space, fontWeight: 700, fontSize: 14, color: c.text }}>
          {agent.name}
        </span>
        <HarnessPill label={harnessLabel(agent.harness)} />
      </div>
      {/* `timezone` is IANA per the type, but the validation that guarantees it
          is server-side and this row may be another tenant's. Wrap, don't push. */}
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: c.muted,
          marginTop: 6,
          overflowWrap: "anywhere",
        }}
      >
        {autonomyLabel} · {dict.tone[agent.settings.tone] ?? agent.settings.tone} ·{" "}
        {agent.settings.timezone}
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.55, color: c.text2 }}>
        {agent.brief}
      </p>
    </div>
  );
}

function SkillRow({ skill, dict }: { skill: TemplateSkill; dict: TemplateGalleryDict }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={{ marginTop: 6 }}>
        <RiskDot level={skill.riskLevel} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: font.mono, fontSize: 12, color: c.text2 }}>
            {skill.displayName}
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.muted }}>
            {dict.risk[skill.riskLevel]}
          </span>
          {skill.required && <Chip>{dict.requiredMark}</Chip>}
        </div>
        <div style={{ fontSize: 12.5, color: c.muted, lineHeight: 1.5, marginTop: 2 }}>
          {skill.purpose}
        </div>
      </div>
    </div>
  );
}

function ContextRow({
  item,
  dict,
}: {
  item: TemplateContextItem;
  dict: TemplateGalleryDict;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span aria-hidden="true" style={{ color: c.muted, fontFamily: font.mono, fontSize: 12 }}>
        ▤
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontFamily: font.mono, fontSize: 12, color: c.text2 }}>{item.title}</span>
          <Chip>{dict.contextKind[item.kind]}</Chip>
          {item.required && <Chip>{dict.requiredMark}</Chip>}
        </div>
        <div style={{ fontSize: 12.5, color: c.muted, lineHeight: 1.5, marginTop: 2 }}>
          {item.purpose}
        </div>
        {/* A model-authored URL is printed, never linked: the runtime fetches
            it, the reader should not be invited to. */}
        {item.url && (
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: c.muted,
              marginTop: 2,
              overflowWrap: "anywhere",
            }}
          >
            {item.url}
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleRow({
  schedule,
  lang,
  dict,
}: {
  schedule: TemplateSchedule;
  lang: Lang;
  dict: TemplateGalleryDict;
}) {
  const readable = describeSchedule(schedule.cron, schedule.timezone, lang);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span aria-hidden="true" style={{ color: c.accent, fontFamily: font.mono, fontSize: 12 }}>
        ◷
      </span>
      <div style={{ minWidth: 0 }}>
        {/* describeSchedule concatenates the stored timezone verbatim; it is
            third-party text, so it wraps rather than widening the drawer. */}
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            color: c.text2,
            lineHeight: 1.5,
            overflowWrap: "anywhere",
          }}
        >
          {readable ?? dict.scheduleUnreadable}
        </div>
        <div style={{ fontSize: 12.5, color: c.muted, lineHeight: 1.5, marginTop: 2 }}>
          {schedule.title}
        </div>
      </div>
    </div>
  );
}

export function TemplateDrawer({
  template,
  dict,
  lang,
  viewerPlan,
  onClose,
  onStart,
  onDuplicate,
  onUpgrade,
}: {
  /** The summary row the gallery already has, so the header paints instantly
   *  while the draft is still in flight. */
  template: TemplateSummaryDTO;
  dict: TemplateGalleryDict;
  lang: Lang;
  viewerPlan: PlanTier | null;
  onClose: () => void;
  onStart: (t: TemplateSummaryDTO) => void;
  onDuplicate: (t: TemplateSummaryDTO) => void;
  onUpgrade: () => void;
}) {
  const [detail, setDetail] = useState<TemplateDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const narrow = useMediaQuery(MOBILE_QUERY);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      setDetail(null);
      try {
        const { template: full } = await fetchTemplate(template.id, ac.signal);
        setDetail(full);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        // The API's own message is not shown: it may be another tenant's text.
        setError(dict.drawerError);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [template.id, dict.drawerError]);

  /**
   * `aria-modal="true"` is a PROMISE that the rest of the page is inert, and
   * three things have to be true for it not to be a lie: Escape closes, Tab
   * cannot walk out of the drawer into the gallery behind it, and focus comes
   * back to whatever opened it. Only the first was implemented.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = asideRef.current;
      if (!root) return;
      const stops = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), summary, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;
      // Focus outside the drawer entirely (a click on the scrim, a stale
      // reference) is pulled back rather than left to roam the page behind.
      if (!(active instanceof Node) || !root.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus lands inside the dialog on open and returns to the trigger on close.
  // `Btn` declares no `ref` prop, so the node is found the way MenuPopover finds
  // its rows — by querying what was rendered. The scroll lock is part of the
  // same promise: a modal whose backdrop scrolls under the pointer is not one.
  useEffect(() => {
    const opener = document.activeElement;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    asideRef.current?.querySelector<HTMLButtonElement>("[data-drawer-close]")?.focus();
    return () => {
      body.style.overflow = prevOverflow;
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  const draft: AgentTemplateDraft | null = detail?.draft ?? null;
  const badge = templateBadge(template);
  const affordable = meetsPlan(template.minPlan, viewerPlan);
  const openByDefault = !narrow;
  const rules = draft?.boundaries.rules ?? [];
  const skills = draft?.skills ?? [];
  const warnings = draft?.provenance.warnings.filter((w) => !w.remediated) ?? [];

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: c.scrim, zIndex: 50 }}
      />
      <aside
        ref={asideRef}
        role="dialog"
        aria-modal="true"
        aria-label={template.name}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(720px, 100vw)",
          background: c.panel,
          borderLeft: `1px solid ${c.border}`,
          zIndex: 51,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: 22,
            borderBottom: `1px solid ${c.line}`,
          }}
        >
          <Glyph mono={template.mono} hue={template.hue} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: font.space,
                fontWeight: 700,
                fontSize: 18,
                color: c.text,
                overflowWrap: "anywhere",
              }}
            >
              {template.name}
            </div>
            <div style={{ fontSize: 13, color: c.muted, marginTop: 4 }}>
              {dict.categories[template.category] ?? template.category} ·{" "}
              {dict.writtenIn(dict.langNames[template.locale] ?? template.locale)} ·{" "}
              {dict.plans[template.minPlan] ?? template.minPlan}
            </div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                color: c.muted,
                marginTop: 6,
                lineHeight: 1.6,
              }}
            >
              {dict.countAgents(template.agentCount)} · {dict.countSkills(template.skillCount)} ·{" "}
              {dict.countSchedules(template.scheduleCount)} · {dict.labelUsedBy}{" "}
              {formatCount(template.useCount, lang)}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HarnessPill label={harnessLabel(template.harness)} />
            <Btn
              data-drawer-close=""
              onClick={onClose}
              aria-label={dict.drawerClose}
              hoverStyle={{ borderColor: c.borderMute, color: c.text }}
              style={{
                border: `1px solid ${c.border}`,
                background: "transparent",
                color: c.muted,
                width: 32,
                height: 32,
                display: "grid",
                placeItems: "center",
                fontFamily: font.mono,
                fontSize: 13,
                cursor: "pointer",
                borderRadius: r.radiusSm,
              }}
            >
              ✕
            </Btn>
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 22px" }}>
          {badge && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "16px 0 0" }}>
              <OwnershipBadge
                kind={badge}
                label={badge === "public" ? dict.badgePublic : dict.badgeYours}
              />
            </div>
          )}

          {isThirdParty(template) && (
            <div
              style={{
                marginTop: 12,
                border: `1px solid ${c.amber}`,
                borderRadius: r.radiusSm,
                padding: "10px 12px",
                fontSize: 13,
                lineHeight: 1.55,
                color: c.text2,
              }}
            >
              {dict.thirdPartyNotice}
            </div>
          )}

          <p style={{ margin: "16px 0", fontSize: 14, lineHeight: 1.6, color: c.text2 }}>
            {detail?.description || template.summary}
          </p>

          {loading && (
            <div
              role="status"
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                letterSpacing: ".06em",
                color: c.muted,
                padding: "24px 0",
              }}
            >
              {dict.drawerLoading}
            </div>
          )}

          {error && !loading && (
            <div
              role="alert"
              style={{
                border: `1px solid ${c.redBorder}`,
                background: c.redWash,
                borderRadius: r.radiusSm,
                padding: "14px 16px",
                fontSize: 13,
                color: c.red,
              }}
            >
              {error}
            </div>
          )}

          {draft && (
            <>
              <Section
                title={dict.sectionRoles}
                count={dict.countRoles(draft.roles.length)}
                open
              >
                {draft.roles.length === 0 ? (
                  <Empty text={dict.emptySection} />
                ) : (
                  draft.roles.map((role) => (
                    <RoleBlock key={role.key} role={role} dict={dict} />
                  ))
                )}
              </Section>

              <Section
                title={dict.sectionAgents}
                count={dict.countAgents(draft.agents.length)}
                open
              >
                {draft.agents.length === 0 ? (
                  <Empty text={dict.emptySection} />
                ) : (
                  draft.agents.map((agent) => (
                    <AgentBlock
                      key={agent.key}
                      agent={agent}
                      autonomyLabel={
                        dict.autonomy[draft.boundaries.autonomy] ?? draft.boundaries.autonomy
                      }
                      dict={dict}
                    />
                  ))
                )}
              </Section>

              <Section
                title={dict.sectionSkills}
                count={dict.countSkills(skills.length)}
                open={openByDefault}
              >
                {skills.length === 0 ? (
                  <Empty text={dict.noSkills} />
                ) : (
                  skills.map((s) => <SkillRow key={s.key} skill={s} dict={dict} />)
                )}
              </Section>

              <Section
                title={dict.sectionRules}
                count={dict.countRules(rules.length)}
                open={openByDefault}
              >
                <div style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                  {dict.autonomy[draft.boundaries.autonomy] ?? draft.boundaries.autonomy} ·{" "}
                  {/* `$` was hardcoded here. `approvalAmountUsd` is WHOLE USD
                      in APPROVAL_CURRENCY (deliberately not the viewer's display
                      currency), so the symbol and the digit grouping come from
                      formatMoney rather than from a literal in a component. */}
                  {dict.approvalAbove(
                    formatMoney(
                      Math.max(0, Math.round(draft.boundaries.approvalAmountUsd)) * 100,
                      APPROVAL_CURRENCY.toLowerCase() as "usd",
                      { compact: true },
                    ),
                  )}
                </div>
                {rules.length === 0 ? (
                  <Empty text={dict.emptySection} />
                ) : (
                  rules.map((rule, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span aria-hidden="true" style={{ color: c.accent, lineHeight: 1.55 }}>
                        ·
                      </span>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: c.text2 }}>
                        <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.muted }}>
                          {dict.ruleSeverity[rule.severity]}
                        </span>{" "}
                        {rule.text}
                      </div>
                    </div>
                  ))
                )}
                {draft.boundaries.prohibitions.map((p, i) => (
                  <div key={`p${i}`} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span aria-hidden="true" style={{ color: c.red, lineHeight: 1.55 }}>
                      ·
                    </span>
                    <div style={{ fontSize: 13, lineHeight: 1.55, color: c.text2 }}>{p}</div>
                  </div>
                ))}
              </Section>

              <Section
                title={dict.sectionContext}
                count={dict.countContext(draft.context.length)}
                open={openByDefault}
              >
                {draft.context.length === 0 ? (
                  <Empty text={dict.emptySection} />
                ) : (
                  draft.context.map((item) => (
                    <ContextRow key={item.key} item={item} dict={dict} />
                  ))
                )}
              </Section>

              <Section
                title={dict.sectionSchedules}
                count={dict.countSchedules(draft.schedules.length)}
                open={openByDefault}
              >
                {draft.schedules.length === 0 ? (
                  <Empty text={dict.emptySection} />
                ) : (
                  draft.schedules.map((s) => (
                    <ScheduleRow key={s.key} schedule={s} lang={lang} dict={dict} />
                  ))
                )}
              </Section>

              {/* provenance */}
              <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 14, marginTop: 6 }}>
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: ".1em",
                    color: c.muted,
                  }}
                >
                  {dict.provenanceTitle}
                </div>
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 11,
                    // Origin, slug and the monthly credit estimate are three
                    // facts the reader is meant to read before committing —
                    // c.faint is tertiary only, so this block is c.muted.
                    color: c.muted,
                    marginTop: 6,
                    lineHeight: 1.7,
                    overflowWrap: "anywhere",
                  }}
                >
                  {dict.provenanceLine(
                    dict.origins[template.origin] ?? template.origin,
                    relativeTime(template.updatedAt, lang),
                  )}
                  <br />
                  {dict.slugLine(template.slug)}
                  <br />
                  {dict.estimatedCredits(draft.meta.estimatedCreditsPerMonth)}
                </div>
                {warnings.length > 0 && (
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      color: c.amber,
                      marginTop: 8,
                    }}
                  >
                    {dict.warningsTitle(warnings.length)}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* sticky footer */}
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: 16,
            borderTop: `1px solid ${c.line}`,
            background: c.glass,
          }}
        >
          <Btn
            onClick={() => (affordable ? onStart(template) : onUpgrade())}
            disabled={affordable && !template.materializable}
            title={!template.materializable ? dict.needsReviewHint : undefined}
            hoverStyle={
              affordable && template.materializable
                ? { background: c.limeHover }
                : { borderColor: c.accent, color: c.accent }
            }
            style={{
              flex: 2,
              height: 44,
              border:
                affordable && template.materializable ? "none" : `1px solid ${c.borderStrong}`,
              background: affordable && template.materializable ? c.lime : "transparent",
              color: affordable && template.materializable ? c.ink : c.text,
              fontFamily: font.space,
              fontWeight: 700,
              fontSize: 14,
              cursor: affordable && !template.materializable ? "not-allowed" : "pointer",
              opacity: affordable && !template.materializable ? 0.6 : 1,
              borderRadius: r.radiusSm,
            }}
          >
            {affordable ? `${dict.startFromTemplate} →` : dict.upgradeToStart}
          </Btn>
          <Btn
            onClick={() => onDuplicate(template)}
            hoverStyle={{ borderColor: c.borderMute, color: c.text }}
            style={{
              flex: 1,
              height: 44,
              border: `1px solid ${c.borderStrong}`,
              background: "transparent",
              color: c.muted,
              fontFamily: font.space,
              fontSize: 14,
              cursor: "pointer",
              borderRadius: r.radiusSm,
            }}
          >
            {dict.duplicateAndEdit}
          </Btn>
        </div>
      </aside>
    </>
  );
}
