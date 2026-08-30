"use client";

/**
 * The template gallery — `/dashboard/templates`.
 *
 * It replaces the role roster in the hire wizard, which answered "what job
 * title?" with five columns and nothing else. This page answers what the agent
 * will actually do, what it installs, what it runs on, how much setup it is and
 * how many other workspaces have trusted it — before anything is provisioned.
 *
 * Three degradation rules the page is built around, none of them afterthoughts:
 *
 *  - **No `OPENROUTER_API_KEY`.** Nothing here calls a model. Every value on a
 *    card is a stored column; the "Build with AI" button leads to a flow that
 *    degrades on its own terms, and its absence would not break this page.
 *  - **Agent Manager unconfigured.** Pressing "Start from this template" routes
 *    to the hire wizard pre-filled; it does not provision. Creating an agent is
 *    a billable, VM-provisioning act and a gallery click must never be one.
 *  - **`GET /api/templates` not deployed yet.** It is being built in parallel.
 *    A network failure or a router 404 renders the error frame with the control
 *    bar still populated, never a crash and never a blank page.
 *
 * Filter and sort state lives in the URL so a filtered gallery is linkable and
 * the back button works; the card/list choice lives in localStorage because it
 * is a per-viewer, per-device reading preference no backend consumes.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { Btn } from "@/components/ui";
import { HARNESS_LIST } from "@/lib/harness";
import { PLAN_TIERS } from "@/lib/pricing";
import { useApp } from "@/lib/store";
import {
  TEMPLATE_LEVELS,
  TEMPLATE_SCOPES,
  TEMPLATE_SORTS,
  templateGallery,
  type TemplateSort,
} from "@/lib/i18n/template-gallery";
import { ViewToggle, useStoredView, type ViewMode } from "@/components/ViewToggle";
import { TemplateCard } from "@/components/template/TemplateCard";
import { TemplateDrawer } from "@/components/template/TemplateDrawer";
import { TemplateListHeader, TemplateRow, LIST_MIN_WIDTH } from "@/components/template/TemplateRow";
import {
  DEFAULT_FILTERS,
  PER_PAGE,
  TEMPLATE_CATEGORIES,
  apiQuery,
  filtersToQuery,
  hasActiveFilters,
  matchesFilters,
  parseFilters,
  sortTemplates,
  type GalleryFilters,
} from "@/components/template/derive";
import type { TemplateSummaryDTO } from "@/components/template/types";
import {
  TemplateApiError,
  copyText,
  fetchTemplates,
  forkTemplate,
} from "@/components/template/client";
import { MOBILE_QUERY, useMediaQuery } from "@/components/template/useMediaQuery";

const VIEW_STORAGE_KEY = "ark-view:templates";
const SEARCH_DEBOUNCE_MS = 250;

const selectStyle: React.CSSProperties = {
  background: c.panelDeep,
  border: `1px solid ${c.borderField}`,
  color: c.text,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: font.sans,
  outline: "none",
  cursor: "pointer",
  borderRadius: r.radiusSm,
  minHeight: 38,
};

/** A framed message — used by all three empty states and the error state so
 *  they cannot drift apart visually. */
function Frame({
  glyph,
  title,
  body,
  children,
  tone = "quiet",
}: {
  glyph: string;
  title: string;
  body: string;
  children?: React.ReactNode;
  tone?: "quiet" | "error";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      style={{
        border: `1px solid ${tone === "error" ? c.redBorder : c.border}`,
        background: tone === "error" ? c.redWash : c.panel,
        borderRadius: r.radiusMd,
        padding: "48px 32px",
        textAlign: "center",
      }}
    >
      <div aria-hidden="true" style={{ fontSize: 30, color: c.faint, lineHeight: 1 }}>
        {glyph}
      </div>
      <div
        style={{
          fontFamily: font.space,
          fontWeight: 700,
          fontSize: 18,
          color: tone === "error" ? c.red : c.text,
          marginTop: 14,
        }}
      >
        {title}
      </div>
      <p
        style={{
          margin: "8px auto 0",
          maxWidth: 460,
          fontSize: 14,
          lineHeight: 1.6,
          color: c.muted,
        }}
      >
        {body}
      </p>
      {children && (
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 18,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function Skeleton({ view, label }: { view: ViewMode; label: string }) {
  // A keyframe cannot be expressed in an inline style object, and app/globals.css
  // is not this vertical's file — so the one animation this page needs travels
  // with the component, under a prefixed name that cannot collide.
  const block = (h: number, w: string) => (
    <div
      style={{
        height: h,
        width: w,
        background: c.hover,
        borderRadius: r.radiusSm,
        animation: "ark-tpl-pulse 1.4s ease-in-out infinite",
      }}
    />
  );
  const rows = view === "list" ? 8 : 6;
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <style>
        {"@keyframes ark-tpl-pulse{0%,100%{opacity:.55}50%{opacity:1}}" +
          // A loading skeleton is decorative motion, and WCAG 2.3.3 says a user
          // who asked for less of it gets a static block. The name is REDEFINED
          // rather than a class being toggled off — a later @keyframes with the
          // same name wins — so the convention against class names holds.
          "@media(prefers-reduced-motion:reduce){@keyframes ark-tpl-pulse{0%,100%{opacity:.7}}}"}
      </style>
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clipPath: "inset(50%)",
        }}
      >
        {label}
      </span>
      <div
        style={
          view === "card"
            ? { display: "grid", gridTemplateColumns: r.col3, gap: r.gapSm }
            : { display: "grid", gap: 0, border: `1px solid ${c.border}`, borderRadius: r.radiusMd }
        }
      >
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            style={
              view === "card"
                ? {
                    border: `1px solid ${c.border}`,
                    background: c.panel,
                    borderRadius: r.radiusMd,
                    padding: 18,
                    display: "grid",
                    gap: 12,
                  }
                : {
                    padding: "14px 16px",
                    borderBottom: i === rows - 1 ? "none" : `1px solid ${c.lineSoft}`,
                    display: "grid",
                    gap: 8,
                  }
            }
          >
            {block(view === "card" ? 38 : 14, view === "card" ? "42%" : "36%")}
            {block(12, "88%")}
            {view === "card" && block(52, "100%")}
            {view === "card" && block(38, "100%")}
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplatesInner() {
  const { lang } = useApp();
  const t = templateGallery[lang];
  const router = useRouter();
  const params = useSearchParams();
  const narrow = useMediaQuery(MOBILE_QUERY);

  // Keyed on the SERIALISED query, not on the hook's object identity. `filters`
  // is the dependency of the fetch effect and of the search debounce; if
  // `useSearchParams()` ever hands back a fresh object for an unchanged URL,
  // keying on it would re-run the fetch on every render, and each fetch sets
  // state, which renders again. The string cannot do that.
  const search = params.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(search)), [search]);

  const [rows, setRows] = useState<TemplateSummaryDTO[]>([]);
  const [total, setTotal] = useState(0);
  // The server's page size, which is what the page count must divide by. We ask
  // for PER_PAGE but the API is free to cap it, and dividing the total by our
  // request instead of its answer invents pages that do not exist.
  const [perPage, setPerPage] = useState(PER_PAGE);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<TemplateSummaryDTO | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Card on the server render and on the first client paint so SSR and
  // hydration agree; the stored choice arrives with hydration.
  const [view, setView] = useStoredView(VIEW_STORAGE_KEY);
  // Below 640px a nine-column table has no honest layout, so the list is not
  // offered there — a stored "list" from a desktop session must not follow the
  // user onto their phone.
  const effectiveView: ViewMode = narrow ? "card" : view;

  // ---- URL is the filter state; the search box is the one control that lags it
  const pushFilters = useCallback(
    (next: GalleryFilters) => {
      const qs = filtersToQuery(next).toString();
      router.replace(qs ? `/dashboard/templates?${qs}` : "/dashboard/templates", {
        scroll: false,
      });
    },
    [router],
  );

  const [qInput, setQInput] = useState(filters.q);
  const pushedQ = useRef(filters.q);
  useEffect(() => {
    // An external change (Clear filters, the back button) wins over the box;
    // our own debounced push does not, or every keystroke would fight itself.
    if (filters.q !== pushedQ.current) {
      pushedQ.current = filters.q;
      setQInput(filters.q);
    }
  }, [filters.q]);

  useEffect(() => {
    if (qInput === filters.q) return;
    const id = window.setTimeout(() => {
      pushedQ.current = qInput;
      pushFilters({ ...filters, q: qInput, page: 1 });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [qInput, filters, pushFilters]);

  const set = useCallback(
    <K extends keyof GalleryFilters>(key: K, value: GalleryFilters[K]) => {
      pushFilters({ ...filters, [key]: value, page: 1 });
    },
    [filters, pushFilters],
  );

  const clearAll = useCallback(() => {
    pushedQ.current = "";
    setQInput("");
    pushFilters({ ...DEFAULT_FILTERS, sort: filters.sort });
  }, [filters.sort, pushFilters]);

  // ---- data
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      setErrorStatus(null);
      try {
        const res = await fetchTemplates(apiQuery(filters), ac.signal);
        setRows(Array.isArray(res.templates) ? res.templates : []);
        setTotal(Number.isFinite(res.total) ? res.total : 0);
        setPerPage(
          typeof res.perPage === "number" && res.perPage >= 1 ? Math.trunc(res.perPage) : PER_PAGE,
        );
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setRows([]);
        setTotal(0);
        setPerPage(PER_PAGE);
        setErrorStatus(e instanceof TemplateApiError ? e.status : 0);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [filters, reloadKey]);

  // The API is a sibling's and may not honour every param yet; `level` and
  // `plan` have no server-side equivalent at all. Re-applying the predicates
  // here means a control the user just moved always does something visible.
  const visible = useMemo(
    () => sortTemplates(rows.filter((row) => matchesFilters(row, filters)), filters.sort),
    [rows, filters],
  );

  const active = hasActiveFilters(filters);
  // `hasActiveFilters` counts `scope` as a filter, so `scope=workspace` alone
  // made the generic "no match, clear the filters" frame win and the
  // workspace-specific one — the only frame that says HOW to make a template —
  // unreachable. Ask the narrower question: is anything BUT scope set?
  const nonScopeFilters = hasActiveFilters({ ...filters, scope: "all" });
  const pages = Math.max(1, Math.ceil(total / perPage));
  // `?page=99` on a two-page gallery. There ARE templates — just not on the page
  // that was asked for — so this is its own state, not "No templates yet".
  const pastEnd = filters.page > 1 && total > 0 && filters.page > pages;

  // ---- actions
  const onStart = useCallback(
    (tpl: TemplateSummaryDTO) => {
      // Routing, not provisioning: the wizard opens pre-filled at the brief step
      // and materialises on submit through POST /api/templates/{id}/materialize.
      router.push(`/hire?template=${encodeURIComponent(tpl.id)}`);
    },
    [router],
  );

  const onUpgrade = useCallback(() => router.push("/dashboard/billing"), [router]);

  // POST /api/templates/{id}/fork carries no Idempotency-Key (§9.4 requires one
  // only for materialize), so a double-click on the drawer's "Duplicate & edit"
  // — which is not disabled while the request is in flight — would write two
  // rows into the workspace. The guard is a ref, not state: it must take effect
  // within the same tick as the second click, before any re-render.
  const forking = useRef(false);
  const onDuplicate = useCallback(
    async (tpl: TemplateSummaryDTO) => {
      if (forking.current) return;
      forking.current = true;
      try {
        await forkTemplate(tpl.id);
        setToast(t.menuDuplicated);
        setReloadKey((k) => k + 1);
      } catch {
        // Not `errorTitle` ("Could not load templates"): the list loaded fine,
        // the fork is what failed. The API's own message is never shown — on a
        // cross-tenant source it is another workspace's text.
        setToast(t.menuDuplicateFailed);
      } finally {
        forking.current = false;
      }
    },
    [t.menuDuplicated, t.menuDuplicateFailed],
  );

  const onCopyId = useCallback(
    async (tpl: TemplateSummaryDTO) => {
      // `navigator.clipboard` does not exist outside a secure context, so on a
      // plain-http deployment this button did nothing at all and said nothing.
      setToast((await copyText(tpl.id)) ? t.menuCopied : t.menuCopyFailed);
    },
    [t.menuCopied, t.menuCopyFailed],
  );

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  // ---- which of the six "nothing to show" frames applies
  let body: React.ReactNode;
  if (loading) {
    body = <Skeleton view={effectiveView} label={t.loadingLabel} />;
  } else if (errorStatus !== null) {
    body = (
      <Frame
        glyph="⚠"
        title={t.errorTitle}
        body={errorStatus === 422 ? t.errorFilters : t.errorBody}
        tone="error"
      >
        <Btn
          onClick={() => setReloadKey((k) => k + 1)}
          hoverStyle={{ borderColor: c.text, color: c.text }}
          style={{
            border: `1px solid ${c.borderStrong}`,
            background: "transparent",
            color: c.text2,
            padding: "9px 16px",
            fontFamily: font.space,
            fontSize: 13,
            cursor: "pointer",
            borderRadius: r.radiusSm,
          }}
        >
          {t.tryAgain}
        </Btn>
        {errorStatus === 422 && active && (
          <Btn
            onClick={clearAll}
            hoverStyle={{ borderColor: c.text, color: c.text }}
            style={{
              border: `1px solid ${c.borderStrong}`,
              background: "transparent",
              color: c.text2,
              padding: "9px 16px",
              fontFamily: font.space,
              fontSize: 13,
              cursor: "pointer",
              borderRadius: r.radiusSm,
            }}
          >
            {t.clearFilters}
          </Btn>
        )}
      </Frame>
    );
  } else if (visible.length === 0 && pastEnd) {
    body = (
      <Frame glyph="⌦" title={t.pageEmptyTitle} body={t.pageEmptyBody}>
        <Btn
          onClick={() => pushFilters({ ...filters, page: 1 })}
          hoverStyle={{ borderColor: c.text, color: c.text }}
          style={{
            border: `1px solid ${c.borderStrong}`,
            background: "transparent",
            color: c.text2,
            padding: "9px 16px",
            fontFamily: font.space,
            fontSize: 13,
            cursor: "pointer",
            borderRadius: r.radiusSm,
          }}
        >
          {t.firstPage}
        </Btn>
      </Frame>
    );
  } else if (visible.length === 0 && filters.scope === "workspace" && !nonScopeFilters) {
    body = (
      <Frame glyph="▦" title={t.workspaceEmptyTitle} body={t.workspaceEmptyBody}>
        <Link
          href="/dashboard/fleet"
          style={{ color: c.accent, fontSize: 13, alignSelf: "center", textDecoration: "none" }}
        >
          {t.workspaceEmptyLink} →
        </Link>
      </Frame>
    );
  } else if (visible.length === 0 && active) {
    body = (
      <Frame glyph="⌕" title={t.filteredTitle} body={t.filteredBody}>
        <Btn
          onClick={clearAll}
          hoverStyle={{ borderColor: c.text, color: c.text }}
          style={{
            border: `1px solid ${c.borderStrong}`,
            background: "transparent",
            color: c.text2,
            padding: "9px 16px",
            fontFamily: font.space,
            fontSize: 13,
            cursor: "pointer",
            borderRadius: r.radiusSm,
          }}
        >
          {t.clearFilters}
        </Btn>
        <Link
          href="/hire"
          style={{ color: c.accent, fontSize: 13, alignSelf: "center", textDecoration: "none" }}
        >
          {t.filteredAlt} →
        </Link>
      </Frame>
    );
  } else if (visible.length === 0) {
    body = (
      <Frame glyph="▦" title={t.emptyTitle} body={t.emptyBody}>
        <Link href="/hire" style={{ textDecoration: "none" }}>
          <button
            style={{
              background: c.lime,
              color: c.ink,
              border: "none",
              padding: "10px 18px",
              fontFamily: font.space,
              fontWeight: 700,
              fontSize: 13.5,
              cursor: "pointer",
              borderRadius: r.radiusSm,
            }}
          >
            {t.emptyCta} →
          </button>
        </Link>
      </Frame>
    );
  } else if (effectiveView === "card") {
    body = (
      <div style={{ display: "grid", gridTemplateColumns: r.col3, gap: r.gapSm }}>
        {visible.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            t={tpl}
            dict={t}
            lang={lang}
            // The workspace plan is not on WorkspaceDTO, so the gate cannot be
            // drawn client-side yet; materialize's 402 remains the truth.
            viewerPlan={null}
            onPreview={setSelected}
            onStart={onStart}
            onUpgrade={onUpgrade}
          />
        ))}
      </div>
    );
  } else {
    body = (
      <div
        style={{
          border: `1px solid ${c.border}`,
          borderRadius: r.radiusMd,
          background: c.panel,
          overflowX: "auto",
        }}
      >
        <div role="table" aria-label={t.heading} style={{ minWidth: LIST_MIN_WIDTH }}>
          <div role="rowgroup">
            <TemplateListHeader dict={t} sort={filters.sort} onSort={(s) => set("sort", s)} />
          </div>
          <div role="rowgroup">
            {visible.map((tpl) => (
              <TemplateRow
                key={tpl.id}
                t={tpl}
                dict={t}
                lang={lang}
                onPreview={setSelected}
                onStart={onStart}
                onDuplicate={onDuplicate}
                onCopyId={onCopyId}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ fontFamily: font.space, fontWeight: 700, fontSize: 26, margin: 0 }}>
            {t.heading}
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: c.text2 }}>{t.subheading}</p>
        </div>
        <Link href="/hire" style={{ textDecoration: "none" }}>
          <button
            style={{
              background: c.lime,
              color: c.ink,
              border: "none",
              padding: "10px 18px",
              fontFamily: font.space,
              fontWeight: 700,
              fontSize: 13.5,
              cursor: "pointer",
              borderRadius: r.radiusSm,
            }}
          >
            + {t.buildWithAi}
          </button>
        </Link>
      </div>

      {/* control bar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          padding: "18px 0 0",
          marginTop: 18,
          borderTop: `1px solid ${c.line}`,
        }}
      >
        <input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchLabel}
          type="search"
          style={{
            flex: "1 1 240px",
            maxWidth: 340,
            minHeight: 38,
            background: c.panelDeep,
            border: `1px solid ${c.borderField}`,
            color: c.text,
            padding: "9px 12px",
            fontSize: 14,
            fontFamily: font.sans,
            outline: "none",
            borderRadius: r.radiusSm,
          }}
        />

        <select
          value={filters.harness}
          onChange={(e) => set("harness", e.target.value as GalleryFilters["harness"])}
          aria-label={t.filterHarness}
          style={selectStyle}
        >
          <option value="all">{t.anyHarness}</option>
          {HARNESS_LIST.map((h) => (
            <option key={h.id} value={h.id}>
              {h.label}
            </option>
          ))}
        </select>

        <select
          value={filters.category}
          onChange={(e) => set("category", e.target.value as GalleryFilters["category"])}
          aria-label={t.filterCategory}
          style={selectStyle}
        >
          <option value="all">{t.anyCategory}</option>
          {TEMPLATE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {t.categories[cat]}
            </option>
          ))}
        </select>

        <select
          value={filters.level}
          onChange={(e) => set("level", e.target.value as GalleryFilters["level"])}
          aria-label={t.filterLevel}
          style={selectStyle}
        >
          <option value="all">{t.anyLevel}</option>
          {TEMPLATE_LEVELS.map((lv) => (
            <option key={lv} value={lv}>
              {t.levels[lv]}
            </option>
          ))}
        </select>

        <select
          value={filters.plan}
          onChange={(e) => set("plan", e.target.value as GalleryFilters["plan"])}
          aria-label={t.filterPlan}
          style={selectStyle}
        >
          <option value="all">{t.anyPlan}</option>
          {PLAN_TIERS.map((p) => (
            <option key={p} value={p}>
              {t.plans[p]}
            </option>
          ))}
        </select>

        <select
          value={filters.scope}
          onChange={(e) => set("scope", e.target.value as GalleryFilters["scope"])}
          aria-label={t.filterScope}
          style={selectStyle}
        >
          {TEMPLATE_SCOPES.map((s) => (
            <option key={s} value={s}>
              {t.scopes[s]}
            </option>
          ))}
        </select>

        <select
          value={filters.sort}
          onChange={(e) => set("sort", e.target.value as TemplateSort)}
          aria-label={t.filterSort}
          style={{ ...selectStyle, marginInlineStart: "auto" }}
        >
          {TEMPLATE_SORTS.map((s) => (
            <option key={s} value={s}>
              {t.sorts[s]}
            </option>
          ))}
        </select>

        {/* The toggle is hidden at ≤640px by the token that already means
            "desktop only", so it cannot offer a view that page will not draw. */}
        <ViewToggle
          value={effectiveView}
          onChange={setView}
          label={t.viewLabel}
          cardLabel={t.viewCard}
          listLabel={t.viewList}
          style={{ display: r.desktopNav }}
        />
      </div>

      {/* active filters + count */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          margin: "14px 0 20px",
          minHeight: 20,
        }}
      >
        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
          {t.resultCount(total || visible.length, t.sorts[filters.sort])}
          {visible.length !== rows.length && rows.length > 0
            ? ` · ${t.resultCountFiltered(visible.length, rows.length)}`
            : ""}
        </span>
        {active && (
          <Btn
            onClick={clearAll}
            hoverStyle={{ color: c.text }}
            style={{
              border: "none",
              background: "transparent",
              color: c.accent,
              padding: 0,
              fontFamily: font.sans,
              fontSize: 12.5,
              cursor: "pointer",
              minHeight: 0,
            }}
          >
            {t.clearAll}
          </Btn>
        )}
      </div>

      {body}

      {/* pagination */}
      {!loading && errorStatus === null && pages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginTop: 22,
          }}
        >
          <Btn
            disabled={filters.page <= 1}
            onClick={() => pushFilters({ ...filters, page: filters.page - 1 })}
            hoverStyle={{ borderColor: c.borderMute, color: c.text }}
            style={{
              border: `1px solid ${c.borderStrong}`,
              background: "transparent",
              color: c.muted,
              padding: "8px 14px",
              fontFamily: font.sans,
              fontSize: 13,
              cursor: filters.page <= 1 ? "not-allowed" : "pointer",
              opacity: filters.page <= 1 ? 0.5 : 1,
              borderRadius: r.radiusSm,
            }}
          >
            {t.prevPage}
          </Btn>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
            {t.pageOf(filters.page, pages)}
          </span>
          <Btn
            disabled={filters.page >= pages}
            onClick={() => pushFilters({ ...filters, page: filters.page + 1 })}
            hoverStyle={{ borderColor: c.borderMute, color: c.text }}
            style={{
              border: `1px solid ${c.borderStrong}`,
              background: "transparent",
              color: c.muted,
              padding: "8px 14px",
              fontFamily: font.sans,
              fontSize: 13,
              cursor: filters.page >= pages ? "not-allowed" : "pointer",
              opacity: filters.page >= pages ? 0.5 : 1,
              borderRadius: r.radiusSm,
            }}
          >
            {t.nextPage}
          </Btn>
        </div>
      )}

      {selected && (
        <TemplateDrawer
          template={selected}
          dict={t}
          lang={lang}
          viewerPlan={null}
          onClose={() => setSelected(null)}
          onStart={onStart}
          onDuplicate={onDuplicate}
          onUpgrade={onUpgrade}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            insetInlineStart: 24,
            bottom: 24,
            background: c.panel,
            border: `1px solid ${c.border}`,
            borderRadius: r.radiusSm,
            padding: "10px 14px",
            fontFamily: font.mono,
            fontSize: 12,
            color: c.text2,
            zIndex: 60,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/**
 * `useSearchParams` opts the tree below into client rendering, so the page body
 * sits under a Suspense boundary — the same shape as /auth, /hire and the fleet
 * detail screen.
 */
export default function TemplatesPage() {
  return (
    <Suspense fallback={null}>
      <TemplatesInner />
    </Suspense>
  );
}
