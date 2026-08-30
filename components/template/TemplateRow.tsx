"use client";

/**
 * The list view: the same data as the card, dense enough to compare twenty
 * templates at once.
 *
 * ARIA grid roles on a CSS grid rather than a `<table>`: the row is two lines
 * tall (name over summary) inside a single 1fr track, which a table cell can
 * only do by nesting a block in a `<td>` and losing the column alignment that
 * made a table worth having. The roles keep the semantics a table would give —
 * `columnheader`, `aria-sort`, one `row` per template.
 *
 * Sorting is by key only, never by direction: `GET /api/templates?sort=` takes
 * a fixed allowlist (ATG §9.4) and an arbitrary column name in a query param is
 * an injection surface, so the client must not invent one.
 */
import { c, font } from "@/lib/theme";
import { Btn, HoverDiv } from "@/components/ui";
import { harnessLabel } from "@/lib/harness";
import type { Lang } from "@/lib/types";
import type { TemplateGalleryDict, TemplateSort } from "@/lib/i18n/template-gallery";
import type { TemplateSummaryDTO } from "./types";
import {
  formatCount,
  relativeTime,
  templateBadge,
  templateLevel,
  whatItDoes,
} from "./derive";
import { Glyph, OwnershipBadge, clamp2 } from "./atoms";
import { RowMenu, type RowAction } from "./RowMenu";

/**
 * TEMPLATE takes the slack; every other track is sized to its widest realistic
 * value. The whole grid sits in an `overflow-x: auto` scroller so a narrow
 * tablet scrolls the table instead of crushing it — the gallery falls back to
 * cards below 640px, where a nine-column table has no honest layout at all.
 */
export const LIST_COLUMNS =
  "minmax(240px, 1fr) 116px 108px 100px 76px 76px 76px 92px 100px 40px";
export const LIST_MIN_WIDTH = 1020;

const cell: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontFamily: font.mono,
  fontSize: 12,
  color: c.text2,
};

const numCell: React.CSSProperties = { ...cell, textAlign: "end" };

/** The three columns backed by a sortable stored column. */
const SORTABLE: Partial<Record<string, TemplateSort>> = {
  template: "name",
  used: "used",
  updated: "updated",
};

function HeaderCell({
  id,
  label,
  sort,
  onSort,
  align = "start",
  dict,
}: {
  id: string;
  label: string;
  sort: TemplateSort;
  onSort: (s: TemplateSort) => void;
  align?: "start" | "end";
  dict: TemplateGalleryDict;
}) {
  const key = SORTABLE[id];
  const activeSort = key !== undefined && key === sort;
  const base: React.CSSProperties = {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: ".08em",
    color: activeSort ? c.text : c.muted,
    textTransform: "uppercase",
    textAlign: align,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  if (key === undefined) {
    return (
      <div role="columnheader" style={base}>
        {label}
      </div>
    );
  }

  return (
    <div
      role="columnheader"
      // `name` reads A→Z; the two count columns read biggest-first. There is no
      // direction toggle because the API's sort allowlist has no direction.
      aria-sort={activeSort ? (key === "name" ? "ascending" : "descending") : "none"}
      style={{ ...base, display: "flex", justifyContent: align === "end" ? "flex-end" : "flex-start" }}
    >
      <Btn
        onClick={() => onSort(key)}
        aria-label={dict.sortByColumn(label)}
        hoverStyle={{ color: c.text }}
        style={{
          border: "none",
          background: "transparent",
          color: "inherit",
          font: "inherit",
          letterSpacing: "inherit",
          textTransform: "inherit",
          padding: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          minHeight: 0,
        }}
      >
        {label}
        <span aria-hidden="true" style={{ color: activeSort ? c.accent : "transparent" }}>
          {key === "name" ? "↑" : "↓"}
        </span>
      </Btn>
    </div>
  );
}

export function TemplateListHeader({
  dict,
  sort,
  onSort,
}: {
  dict: TemplateGalleryDict;
  sort: TemplateSort;
  onSort: (s: TemplateSort) => void;
}) {
  return (
    <div
      role="row"
      style={{
        display: "grid",
        gridTemplateColumns: LIST_COLUMNS,
        columnGap: 12,
        alignItems: "center",
        padding: "10px 16px",
        borderBottom: `1px solid ${c.line}`,
        background: c.panel,
        position: "sticky",
        top: 0,
        zIndex: 2,
      }}
    >
      <HeaderCell id="template" label={dict.colTemplate} sort={sort} onSort={onSort} dict={dict} />
      <HeaderCell id="category" label={dict.colCategory} sort={sort} onSort={onSort} dict={dict} />
      <HeaderCell id="harness" label={dict.colHarness} sort={sort} onSort={onSort} dict={dict} />
      <HeaderCell id="level" label={dict.colLevel} sort={sort} onSort={onSort} dict={dict} />
      <HeaderCell id="agents" label={dict.colAgents} sort={sort} onSort={onSort} align="end" dict={dict} />
      <HeaderCell id="skills" label={dict.colSkills} sort={sort} onSort={onSort} align="end" dict={dict} />
      <HeaderCell id="sched" label={dict.colSchedules} sort={sort} onSort={onSort} align="end" dict={dict} />
      <HeaderCell id="used" label={dict.colUsedBy} sort={sort} onSort={onSort} align="end" dict={dict} />
      <HeaderCell id="updated" label={dict.colUpdated} sort={sort} onSort={onSort} align="end" dict={dict} />
      <div role="columnheader">
        <span
          style={{
            // Visually hidden, still announced: the column exists and has a name.
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clipPath: "inset(50%)",
            whiteSpace: "nowrap",
          }}
        >
          {dict.colActions}
        </span>
      </div>
    </div>
  );
}

export function TemplateRow({
  t,
  dict,
  lang,
  onPreview,
  onStart,
  onDuplicate,
  onCopyId,
}: {
  t: TemplateSummaryDTO;
  dict: TemplateGalleryDict;
  lang: Lang;
  onPreview: (t: TemplateSummaryDTO) => void;
  onStart: (t: TemplateSummaryDTO) => void;
  onDuplicate: (t: TemplateSummaryDTO) => void;
  onCopyId: (t: TemplateSummaryDTO) => void;
}) {
  const badge = templateBadge(t);
  const actions: RowAction[] = [
    { key: "preview", label: dict.menuPreview, onSelect: () => onPreview(t) },
    { key: "start", label: dict.menuStart, onSelect: () => onStart(t) },
    // A fork of another tenant's template is an import of third-party content,
    // not a copy — hence the caution tint when the source is not the viewer's.
    {
      key: "fork",
      label: dict.menuDuplicate,
      onSelect: () => onDuplicate(t),
      danger: !t.ownedByViewer,
    },
    { key: "copy", label: dict.menuCopyId, onSelect: () => onCopyId(t) },
  ];

  return (
    <HoverDiv
      role="row"
      onClick={() => onPreview(t)}
      hoverStyle={{ background: c.hover }}
      style={{
        display: "grid",
        gridTemplateColumns: LIST_COLUMNS,
        columnGap: 12,
        alignItems: "center",
        padding: "10px 16px",
        borderBottom: `1px solid ${c.lineSoft}`,
        cursor: "pointer",
      }}
    >
      <div role="cell" style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
        <Glyph mono={t.mono} hue={t.hue} size={28} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontFamily: font.space,
                fontWeight: 700,
                fontSize: 13.5,
                color: c.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t.name}
            </span>
            {badge && (
              <OwnershipBadge
                kind={badge}
                label={badge === "public" ? dict.badgePublic : dict.badgeYours}
              />
            )}
          </div>
          <div
            style={{
              ...clamp2,
              WebkitLineClamp: 1,
              fontSize: 12,
              color: c.muted,
              marginTop: 2,
              lineHeight: 1.4,
            }}
          >
            {whatItDoes(t)}
          </div>
        </div>
      </div>
      <div role="cell" style={cell}>
        {dict.categories[t.category] ?? t.category}
      </div>
      <div role="cell" style={cell}>
        {harnessLabel(t.harness)}
      </div>
      <div role="cell" style={cell}>
        {dict.levels[templateLevel(t)]}
      </div>
      <div role="cell" style={numCell}>
        {formatCount(t.agentCount, lang)}
      </div>
      <div role="cell" style={numCell}>
        {formatCount(t.skillCount, lang)}
      </div>
      <div role="cell" style={numCell}>
        {formatCount(t.scheduleCount, lang)}
      </div>
      <div role="cell" style={numCell}>
        {formatCount(t.useCount, lang)}
      </div>
      {/* A timestamp is the one thing c.faint is for. */}
      <div role="cell" style={{ ...numCell, color: c.faint }}>
        {relativeTime(t.updatedAt, lang)}
      </div>
      <div role="cell" style={{ display: "flex", justifyContent: "flex-end" }}>
        <RowMenu label={dict.rowMenu} actions={actions} />
      </div>
    </HoverDiv>
  );
}
