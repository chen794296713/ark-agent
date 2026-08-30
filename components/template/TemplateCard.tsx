"use client";

/**
 * One template as a card.
 *
 * The card answers, before the user commits: what job is this, what does it
 * automate, what will it install, what will it run on, how much work is it, how
 * many other workspaces trusted it, and — for anything not written here — the
 * Preview button. Every value below comes from a denormalised column on
 * `agent_templates`; the card never opens `draft` (10–40 KB × 24 tiles) and
 * never asks a model for a summary, so the gallery renders identically with no
 * OPENROUTER_API_KEY and with the Agent Manager unconfigured.
 *
 * Every human-visible string on a template the viewer's workspace does not own
 * is third-party text. It is rendered as a text node and nothing else: no
 * markdown, no dangerouslySetInnerHTML, and the ⬦ PUBLIC badge says so out loud.
 */
import { c, font, r } from "@/lib/theme";
import { Btn, HoverDiv } from "@/components/ui";
import { harnessLabel } from "@/lib/harness";
import type { Lang } from "@/lib/types";
import type { PlanTier } from "@/lib/pricing";
import type { TemplateGalleryDict } from "@/lib/i18n/template-gallery";
import type { TemplateSummaryDTO } from "./types";
import {
  formatCount,
  isEstimated,
  meetsPlan,
  setupMinutes,
  tagList,
  templateBadge,
  templateLevel,
  whatItDoes,
} from "./derive";
import { Chip, Glyph, HarnessPill, Metric, OwnershipBadge, clamp2 } from "./atoms";

const MAX_TAGS = 4;

export function TemplateCard({
  t,
  dict,
  lang,
  viewerPlan,
  onPreview,
  onStart,
  onUpgrade,
}: {
  t: TemplateSummaryDTO;
  dict: TemplateGalleryDict;
  lang: Lang;
  /** The workspace's tier, or null while it is unknown. */
  viewerPlan: PlanTier | null;
  onPreview: (t: TemplateSummaryDTO) => void;
  onStart: (t: TemplateSummaryDTO) => void;
  onUpgrade: () => void;
}) {
  const badge = templateBadge(t);
  const level = templateLevel(t);
  const affordable = meetsPlan(t.minPlan, viewerPlan);
  // The plan gate never hides a template. `materialize` answers 402 for a plan
  // shortfall, so a card that quietly disappears is a dead end where an upgrade
  // link is a path. `blocked` is different: an unresolved lint warning means the
  // agent the user would create is not the one they just read.
  const cta: "start" | "upgrade" | "blocked" = !affordable
    ? "upgrade"
    : t.materializable
      ? "start"
      : "blocked";
  const allTags = tagList(t.tags);
  const tags = allTags.slice(0, MAX_TAGS);
  const overflow = allTags.length - tags.length;
  // LEVEL and SETUP are stored columns; the "estimate" caveat is shown only in
  // the window where the serializer has not put them on the DTO yet.
  const estimated = isEstimated(t);

  return (
    <HoverDiv
      onClick={() => onPreview(t)}
      hoverStyle={{ borderColor: c.borderMute, background: c.hover }}
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${c.border}`,
        background: c.panel,
        borderRadius: r.radiusMd,
        padding: 18,
        cursor: "pointer",
      }}
    >
      {/* identity */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <Glyph mono={t.mono} hue={t.hue} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: font.space,
              fontWeight: 700,
              fontSize: 16,
              color: c.text,
              lineHeight: 1.3,
              overflowWrap: "anywhere",
            }}
          >
            {t.name}
          </div>
          <div style={{ fontSize: 12.5, color: c.muted, marginTop: 3 }}>
            {dict.categories[t.category] ?? t.category}
            {t.locale !== lang ? ` · ${dict.writtenIn(dict.langNames[t.locale] ?? t.locale)}` : ""}
          </div>
        </div>
        <HarnessPill label={harnessLabel(t.harness)} />
      </div>

      {(badge || !t.materializable) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {badge && (
            <OwnershipBadge
              kind={badge}
              label={badge === "public" ? dict.badgePublic : dict.badgeYours}
            />
          )}
          {!t.materializable && (
            <span
              title={dict.needsReviewHint}
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                letterSpacing: ".08em",
                color: c.red,
                border: `1px solid ${c.redBorder}`,
                borderRadius: r.radiusSm,
                padding: "2px 6px",
              }}
            >
              {dict.needsReview}
            </span>
          )}
        </div>
      )}

      {/* what it automates — agent_templates.automates, falling back to
          .summary when assemble has not written one. Authored in t.locale. */}
      <p
        style={{
          ...clamp2,
          margin: "14px 0 0",
          fontSize: 13.5,
          lineHeight: 1.5,
          color: c.text2,
          minHeight: 40,
        }}
      >
        {whatItDoes(t)}
      </p>

      {/* what it installs */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginTop: 14,
          minHeight: 24,
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 10,
            letterSpacing: ".08em",
            color: c.muted,
          }}
        >
          {dict.labelTags}
        </span>
        {tags.length === 0 ? (
          <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.faint }}>
            {dict.noTags}
          </span>
        ) : (
          <>
            {tags.map((tag, i) => (
              // Index-keyed: `tags` is third-party jsonb and may repeat a value.
              <Chip key={`${i}-${tag}`}>{tag}</Chip>
            ))}
            {overflow > 0 && <Chip>+{overflow}</Chip>}
          </>
        )}
      </div>

      {/* LEVEL and SETUP read agent_templates.difficulty / .time_to_value_minutes,
          both computed at assemble. The card never opens `draft`. */}
      <div
        title={estimated ? dict.estimateHint : undefined}
        style={{
          display: "flex",
          border: `1px solid ${c.line}`,
          borderRadius: r.radiusSm,
          marginTop: 14,
        }}
      >
        <Metric label={dict.labelLevel} value={dict.levels[level]} />
        <Metric
          label={dict.labelSetup}
          value={dict.setupMinutes(setupMinutes(t))}
        />
        <Metric label={dict.labelUsedBy} value={formatCount(t.useCount, lang)} last />
      </div>

      <div
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: c.muted,
          marginTop: 12,
          lineHeight: 1.5,
        }}
      >
        ◷ {dict.buildsOut(t.agentCount, t.skillCount, t.scheduleCount)}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Btn
          onClick={(e) => {
            e.stopPropagation();
            if (cta === "upgrade") onUpgrade();
            else if (cta === "start") onStart(t);
          }}
          disabled={cta === "blocked"}
          title={cta === "blocked" ? dict.needsReviewHint : undefined}
          hoverStyle={
            cta === "start" ? { background: c.limeHover } : { borderColor: c.accent, color: c.accent }
          }
          style={{
            flex: 2,
            minWidth: 0,
            border: cta === "start" ? "none" : `1px solid ${c.borderStrong}`,
            background: cta === "start" ? c.lime : "transparent",
            color: cta === "start" ? c.ink : c.text,
            padding: "10px 8px",
            fontFamily: font.space,
            fontWeight: 700,
            fontSize: 13,
            cursor: cta === "blocked" ? "not-allowed" : "pointer",
            opacity: cta === "blocked" ? 0.6 : 1,
            borderRadius: r.radiusSm,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {cta === "upgrade" ? dict.upgradeToStart : dict.start}
        </Btn>
        <Btn
          onClick={(e) => {
            e.stopPropagation();
            onPreview(t);
          }}
          hoverStyle={{ borderColor: c.borderMute, color: c.text }}
          style={{
            flex: 1,
            minWidth: 0,
            border: `1px solid ${c.borderStrong}`,
            background: "transparent",
            color: c.muted,
            padding: "10px 8px",
            fontFamily: font.space,
            fontSize: 13,
            cursor: "pointer",
            borderRadius: r.radiusSm,
          }}
        >
          {dict.preview}
        </Btn>
      </div>

      {!affordable && (
        <div style={{ fontFamily: font.mono, fontSize: 10.5, color: c.muted, marginTop: 8 }}>
          {dict.requiresPlan(dict.plans[t.minPlan] ?? t.minPlan)}
        </div>
      )}
    </HoverDiv>
  );
}
