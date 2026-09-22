"use client";

/**
 * The Activity empty state — and at launch, the Activity page.
 *
 * Nothing writes `agent_runs`, `agent_run_steps` or `agent_health_samples` yet,
 * so for most agents every view here comes back empty. That makes this
 * component the primary surface of the whole vertical rather than a fallback,
 * and it is built to answer the two questions a blank panel raises:
 *
 *   1. WHAT will appear here — answered by an inert specimen of the row this
 *      view draws, labelled with the columns it will carry. A skeleton alone
 *      says "loading"; a labelled skeleton says "this is a run, and it will
 *      show you its trigger, its duration and what it cost".
 *   2. WHY it is empty right now — answered by `dict.empty[view][reason]`,
 *      where `reason` is computed SERVER-SIDE. A client cannot tell "nothing
 *      happened" from "your filters excluded everything" from "the runtime is a
 *      simulator", and a view that renders a generic "No data" has thrown that
 *      distinction away.
 *
 * The specimen is suppressed for `filtered_out` and `runtime_mock`: in both
 * cases rows exist, so demonstrating the row shape is noise — the answer is a
 * filter to clear or a banner to read.
 *
 * Actions are opt-in. Only the callbacks the caller passes are rendered, so a
 * page that cannot start a run does not offer a "Run it now" button that does
 * nothing.
 */
import type { ReactNode } from "react";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { useApp } from "@/lib/store";
import { activity } from "@/lib/i18n/activity";
import type { EmptyReason, ViewKey } from "@/lib/activity/types";

/** One glyph per view. Decorative — every one is `aria-hidden`. */
const VIEW_GLYPH: Record<ViewKey, string> = {
  timeline: "◷",
  runs: "▶",
  toolCalls: "⌁",
  health: "◍",
  cost: "◇",
  errors: "▲",
};

/** Reasons where rows already exist, so a specimen of the row teaches nothing. */
const NO_SPECIMEN: readonly EmptyReason[] = ["filtered_out", "runtime_mock"];

export interface ActivityEmptyStateProps {
  view: ViewKey;
  /** From the DTO. `null` is treated as `no_data_yet` — the launch default. */
  reason: EmptyReason | null;
  /** Replaces the default action row entirely. */
  actions?: ReactNode;
  /** Replaces the default specimen. Pass `false` to draw none. */
  specimen?: ReactNode | false;
  /** Tightens the padding for use inside a card that already has a heading. */
  compact?: boolean;
  onClearFilters?: () => void;
  onRunNow?: () => void;
  onOpenChat?: () => void;
  onSetUpSchedule?: () => void;
  onViewDeployment?: () => void;
  onWhatsSupported?: () => void;
  onContactAdmin?: () => void;
}

export function ActivityEmptyState({
  view,
  reason,
  actions,
  specimen,
  compact = false,
  onClearFilters,
  onRunNow,
  onOpenChat,
  onSetUpSchedule,
  onViewDeployment,
  onWhatsSupported,
  onContactAdmin,
}: ActivityEmptyStateProps) {
  const { lang } = useApp();
  const t = activity[lang];
  const why: EmptyReason = reason ?? "no_data_yet";
  const copy = t.empty[view][why];

  // Which offers make sense is a property of the REASON, not of the view: a
  // never-provisioned agent needs its deployment, a filtered-out view needs its
  // filters back. Each is rendered only if the page handed us a handler.
  const buttons: ReactNode[] = [];
  const push = (key: string, label: string, fn: (() => void) | undefined, primary = false) => {
    if (!fn) return;
    buttons.push(
      <ActionButton key={key} label={label} onClick={fn} primary={primary} />,
    );
  };
  if (why === "filtered_out") {
    push("clear", t.action.clearFilters, onClearFilters, true);
  } else if (why === "never_provisioned") {
    push("deploy", t.action.viewDeployment, onViewDeployment, true);
  } else if (why === "runtime_unconfigured") {
    push("admin", t.action.contactAdmin, onContactAdmin, true);
    push("deploy", t.action.viewDeployment, onViewDeployment);
  } else if (why === "telemetry_unsupported") {
    push("supported", t.action.whatsSupported, onWhatsSupported, true);
  } else {
    push("run", t.action.runNow, onRunNow, true);
    push("chat", t.action.openChat, onOpenChat);
    push("schedule", t.action.setUpSchedule, onSetUpSchedule);
  }

  const showSpecimen = specimen !== false && !NO_SPECIMEN.includes(why);
  const body = specimen ?? <DefaultSpecimen view={view} />;

  return (
    <div
      style={{
        border: `1px dashed ${c.border}`,
        borderRadius: r.radiusMd,
        background: c.panelDeep,
        padding: compact ? "22px 18px" : "34px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        textAlign: "center",
      }}
    >
      <div aria-hidden="true" style={{ fontSize: 20, color: c.muted, lineHeight: 1 }}>
        {VIEW_GLYPH[view]}
      </div>
      <div>
        <div
          style={{
            fontFamily: font.space,
            fontSize: 15,
            fontWeight: 600,
            color: c.text,
            marginBottom: 7,
          }}
        >
          {copy.title}
        </div>
        <div
          style={{
            fontSize: 13.5,
            lineHeight: 1.65,
            color: c.text2,
            maxWidth: 460,
            margin: "0 auto",
          }}
        >
          {copy.body}
        </div>
      </div>

      {(actions ?? (buttons.length > 0 ? buttons : null)) && (
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {actions ?? buttons}
        </div>
      )}

      {showSpecimen && body && (
        <div style={{ width: "100%", maxWidth: 560, marginTop: 4 }}>{body}</div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  primary,
}: {
  label: string;
  onClick: () => void;
  primary: boolean;
}) {
  return (
    <Btn
      onClick={onClick}
      hoverStyle={primary ? { background: c.limeHover } : { borderColor: c.borderMute, color: c.text }}
      style={{
        fontFamily: font.mono,
        fontSize: 11.5,
        letterSpacing: ".04em",
        padding: "8px 14px",
        borderRadius: r.radiusSm,
        cursor: "pointer",
        background: primary ? c.lime : "transparent",
        color: primary ? c.ink : c.text2,
        border: primary ? `1px solid ${c.lime}` : `1px solid ${c.borderField}`,
      }}
    >
      {label}
    </Btn>
  );
}

// ---------------------------------------------------------------------------
// The specimen
//
// A labelled ghost of the row this view will draw. Every part is `aria-hidden`
// except the "Example" chip and the column names, so a screen reader hears
// "Example — Trigger, Duration, Tokens, Cost" rather than a wall of decoration.
// ---------------------------------------------------------------------------

function Bar({ w, h = 8 }: { w: number | string; h?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        width: typeof w === "number" ? w : w,
        height: h,
        borderRadius: 2,
        background: c.line,
      }}
    />
  );
}

function SpecimenFrame({ children }: { children: ReactNode }) {
  const { lang } = useApp();
  const t = activity[lang];
  return (
    <div
      style={{
        position: "relative",
        border: `1px solid ${c.line}`,
        borderRadius: r.radiusSm,
        background: c.panel,
        padding: "14px 14px 12px",
        textAlign: "left",
        opacity: 0.85,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: -9,
          left: 12,
          background: c.panelDeep,
          padding: "0 6px",
          fontFamily: font.mono,
          fontSize: 10,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: c.muted,
        }}
      >
        {t.label.example}
      </span>
      {children}
    </div>
  );
}

/** A column name under a ghost bar — the part that does the teaching. */
function Cap({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontFamily: font.mono,
        fontSize: 9.5,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: c.muted,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Cell({ label, w }: { label: string; w: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <Bar w={w} />
      <Cap>{label}</Cap>
    </div>
  );
}

export function DefaultSpecimen({ view }: { view: ViewKey }) {
  const { lang } = useApp();
  const t = activity[lang];

  if (view === "health") {
    return (
      <SpecimenFrame>
        <div style={{ display: "flex", gap: 2, marginBottom: 10 }} aria-hidden="true">
          {Array.from({ length: 28 }).map((_, i) => (
            <span
              key={i}
              style={{
                flex: 1,
                height: 16,
                borderRadius: 1,
                background: i % 7 === 3 ? c.line : c.panelDeep,
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <Cell label={t.ui.health.cpu} w={54} />
          <Cell label={t.ui.health.memory} w={54} />
          <Cell label={t.ui.health.disk} w={54} />
          <Cell label={t.ui.health.activeRuns} w={28} />
        </div>
      </SpecimenFrame>
    );
  }

  if (view === "cost") {
    return (
      <SpecimenFrame>
        <div
          aria-hidden="true"
          style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 34, marginBottom: 10 }}
        >
          {[10, 18, 8, 26, 14, 30, 20].map((h, i) => (
            <span key={i} style={{ flex: 1, height: h, borderRadius: 1, background: c.line }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <Cell label={t.ui.cost.total} w={62} />
          <Cell label={t.ui.cost.runs} w={30} />
          <Cell label={t.ui.cost.tokens} w={46} />
          <Cell label={t.ui.cost.byModel} w={70} />
        </div>
      </SpecimenFrame>
    );
  }

  if (view === "toolCalls") {
    return (
      <SpecimenFrame>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                aria-hidden="true"
                style={{ fontFamily: font.mono, fontSize: 10, color: c.faint, width: 14 }}
              >
                {i + 1}
              </span>
              <Bar w={i === 1 ? 150 : 110} />
              <span style={{ flex: 1 }} />
              <Bar w={34} h={7} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap" }}>
          <Cap>{t.ui.run.trace}</Cap>
          <Cap>{t.ui.run.duration}</Cap>
          <Cap>{t.ui.run.tokens}</Cap>
        </div>
      </SpecimenFrame>
    );
  }

  // timeline / runs / errors all draw a run-shaped row.
  return (
    <SpecimenFrame>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span aria-hidden="true" style={{ color: c.line, fontSize: 13 }}>
          ◷
        </span>
        <Bar w="46%" h={9} />
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <Cell label={t.ui.run.trigger} w={40} />
        <Cell label={t.ui.run.duration} w={34} />
        <Cell label={t.ui.run.steps} w={24} />
        <Cell label={t.ui.run.tokens} w={40} />
        <Cell label={t.ui.run.cost} w={34} />
      </div>
    </SpecimenFrame>
  );
}
