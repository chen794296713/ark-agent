"use client";

/**
 * Platform admin — account list.
 *
 * Two independent reads: the overview totals (once) and the paged user query
 * (on every filter change). They are kept apart so a slow or drifted overview
 * never blocks the table, which is the working surface of this screen.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PlatformRole, UserStatus } from "@/lib/db/schema";
import { c, font, r } from "@/lib/theme";
import {
  api,
  ApiError,
  type AdminAuditEntryDTO,
  type AdminOverviewDTO,
  type AdminUserRowDTO,
  type AdminUsersDTO,
} from "@/lib/client-api";
import { useApp } from "@/lib/store";
import { admin as adminI18n, type AdminDict } from "@/lib/i18n/admin";
import { BCP47 } from "@/lib/i18n";
import { HoverDiv } from "@/components/ui";

const PER_PAGE = 25;

/** Column track for both the header and every row — one source, no drift. */
const COLS = "minmax(200px,2.2fr) 108px 104px 84px 84px 122px 108px 116px";

const ROLE_OPTIONS: PlatformRole[] = ["user", "support", "admin"];
const STATUS_OPTIONS: UserStatus[] = ["active", "suspended"];

const cellStyle = {
  fontFamily: font.mono,
  fontSize: 12,
  color: c.text2,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

function fmtInt(n: number | undefined, locale: string): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString(locale) : "—";
}

/** llm_usage stores micro-USD; sub-cent spend is normal, so keep 4 digits there. */
function fmtCost(micro: number | undefined, locale: string): string {
  if (typeof micro !== "number" || !Number.isFinite(micro)) return "—";
  const usd = micro / 1_000_000;
  return usd.toLocaleString(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: usd !== 0 && Math.abs(usd) < 1 ? 4 : 2,
  });
}

/** Accepts a 0–1 fraction or an already-scaled percentage. */
function fmtRate(rate: number | undefined, locale: string): string {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "—";
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
}

function fmtDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A 401 here means the session died mid-read; both read as "you can't see this". */
function isDenied(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 403 || e.status === 401);
}

function roleLabel(role: string | undefined, t: AdminDict): string {
  if (role === "user" || role === "support" || role === "admin") return t.role[role];
  return role ?? "—";
}

function roleColor(role: string | undefined): string {
  if (role === "admin") return c.accent;
  if (role === "support") return c.blue;
  return c.muted;
}

function Pill({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        fontFamily: font.mono,
        fontSize: 10.5,
        letterSpacing: ".05em",
        color,
        border: `1px solid ${color}`,
        padding: "2px 8px",
        borderRadius: r.radiusSm,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function StatusPill({ status, t }: { status: string | undefined; t: AdminDict }) {
  if (status === "suspended") return <Pill text={t.status.suspended} color={c.red} />;
  if (status === "active") return <Pill text={t.status.active} color={c.green} />;
  return <span style={{ ...cellStyle, color: c.faint }}>{status ?? "—"}</span>;
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div style={{ background: c.panel, padding: 18 }}>
      <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: ".08em", color: c.faint }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: font.space,
          fontWeight: 700,
          fontSize: 26,
          marginTop: 8,
          color: tone ?? c.text,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: font.mono, fontSize: 11, color: c.faint, marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

/** Shown when a non-staff account types the URL. */
function NotAuthorized({ t }: { t: AdminDict }) {
  return (
    <div style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      <div
        style={{
          border: `1px solid ${c.border}`,
          background: c.panel,
          padding: "48px 32px",
          textAlign: "center",
          borderRadius: r.radiusMd,
        }}
      >
        <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
          {t.notAuthorizedTitle}
        </div>
        <div style={{ fontSize: 13.5, color: c.muted, maxWidth: 460, margin: "0 auto" }}>
          {t.notAuthorizedBody}
        </div>
        <Link
          href="/dashboard"
          style={{
            display: "inline-block",
            marginTop: 20,
            border: `1px solid ${c.borderStrong}`,
            color: c.text,
            padding: "9px 16px",
            fontFamily: font.space,
            fontSize: 13,
            textDecoration: "none",
            borderRadius: r.radiusSm,
          }}
        >
          {t.backToOverview}
        </Link>
      </div>
    </div>
  );
}

function AuditRow({
  entry,
  first,
  t,
  locale,
}: {
  entry: AdminAuditEntryDTO;
  first: boolean;
  t: AdminDict;
  locale: string;
}) {
  const action = entry.action ?? "";
  const label =
    action in t.auditAction
      ? t.auditAction[action as keyof AdminDict["auditAction"]]
      : t.auditActionFallback(action || "—");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 18px",
        borderTop: first ? "none" : `1px solid ${c.lineSoft}`,
        flexWrap: "wrap",
      }}
    >
      <Pill text={label} color={c.muted} />
      <span style={{ fontSize: 13, color: c.text2, flex: "1 1 240px", minWidth: 0 }}>
        {entry.summary ?? "—"}
      </span>
      <span style={{ fontFamily: font.mono, fontSize: 11, color: c.faint }}>
        {entry.target?.email ?? entry.target?.name ?? ""}
      </span>
      <span style={{ fontFamily: font.mono, fontSize: 11, color: c.faint }}>
        {entry.actor?.email ?? entry.actor?.name ?? ""}
      </span>
      <span style={{ fontFamily: font.mono, fontSize: 11, color: c.faint }}>
        {fmtDateTime(entry.createdAt, locale)}
      </span>
    </div>
  );
}

export default function AdminUsersPage() {
  const { lang } = useApp();
  const t = adminI18n[lang];
  const locale = BCP47[lang];

  const [overview, setOverview] = useState<AdminOverviewDTO | null>(null);
  const [data, setData] = useState<AdminUsersDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  // `queryText` is what the box shows; `q` is what the server was asked for.
  const [queryText, setQueryText] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<PlatformRole | "">("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [page, setPage] = useState(1);
  // Bumped by the retry button to re-run the query effect with the same filters.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => {
      setQ(queryText.trim());
      setPage(1);
    }, 320);
    return () => clearTimeout(id);
  }, [queryText]);

  useEffect(() => {
    let alive = true;
    api
      .adminOverview()
      .then((o) => {
        if (alive) setOverview(o);
      })
      .catch((e) => {
        if (alive && isDenied(e)) setDenied(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await api.adminUsers({
          q: q || undefined,
          role: role || undefined,
          status: status || undefined,
          page,
          perPage: PER_PAGE,
        });
        if (alive) setData(d);
      } catch (e) {
        if (!alive) return;
        if (isDenied(e)) setDenied(true);
        else setError(e instanceof ApiError ? e.message : t.loadError);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [q, role, status, page, reloadKey]);

  const users: AdminUserRowDTO[] = useMemo(() => data?.users ?? [], [data]);
  const total = data?.total ?? users.length;
  const perPage = data?.perPage ?? PER_PAGE;
  const currentPage = data?.page ?? page;
  const pages = Math.max(1, Math.ceil(total / Math.max(1, perPage)));
  const firstRow = total === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const lastRow = Math.min(total, currentPage * perPage);
  const hasFilters = q !== "" || role !== "" || status !== "";

  const workspaces =
    typeof overview?.workspaces === "number" ? overview.workspaces : overview?.workspaces?.total;
  const staffCount =
    (overview?.users?.byRole?.admin ?? 0) + (overview?.users?.byRole?.support ?? 0);
  const audit = overview?.audit ?? [];

  if (denied) return <NotAuthorized t={t} />;

  return (
    <div data-screen-label="Admin" style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            color: c.accent,
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: ".12em",
            marginBottom: 8,
          }}
        >
          {t.eyebrow}
        </div>
        <h2
          style={{
            margin: 0,
            color: c.text,
            fontFamily: font.space,
            fontSize: "clamp(22px, 4vw, 28px)",
            fontWeight: 700,
          }}
        >
          {t.heading}
        </h2>
        <div style={{ marginTop: 8, fontSize: 13.5, color: c.muted }}>{t.subheading}</div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: r.col4,
          gap: 1,
          background: c.line,
          border: `1px solid ${c.line}`,
          marginBottom: 28,
          borderRadius: r.radiusMd,
          overflow: "hidden",
        }}
      >
        <StatTile label={t.statUsers} value={fmtInt(overview?.users?.total, locale)} />
        <StatTile
          label={t.statActive}
          value={fmtInt(overview?.users?.byStatus?.active, locale)}
          tone={c.green}
        />
        <StatTile
          label={t.statSuspended}
          value={fmtInt(overview?.users?.byStatus?.suspended, locale)}
          tone={overview?.users?.byStatus?.suspended ? c.red : undefined}
        />
        <StatTile
          label={t.statStaff}
          value={overview?.users?.byRole ? staffCount.toLocaleString(locale) : "—"}
        />
        <StatTile label={t.statAgents} value={fmtInt(overview?.agents?.total, locale)} />
        <StatTile label={t.statWorkspaces} value={fmtInt(workspaces, locale)} />
        <StatTile
          label={t.statCalls}
          value={fmtInt(overview?.llm?.calls, locale)}
          sub={t.statTokensSub(fmtInt(overview?.llm?.totalTokens, locale))}
        />
        <StatTile
          label={t.statCost}
          value={fmtCost(overview?.llm?.costMicroUsd, locale)}
          sub={t.statErrorSub(fmtRate(overview?.llm?.errorRate, locale))}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <input
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder={t.searchPlaceholder}
          style={{
            flex: "1 1 220px",
            maxWidth: 280,
            background: c.panel,
            border: `1px solid ${c.border}`,
            color: c.text,
            padding: "10px 14px",
            fontSize: 14,
            fontFamily: font.sans,
            outline: "none",
            borderRadius: r.radiusSm,
          }}
        />
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value as PlatformRole | "");
            setPage(1);
          }}
          style={{
            background: c.panel,
            border: `1px solid ${c.border}`,
            color: c.text,
            padding: "10px 14px",
            fontSize: 13,
            fontFamily: font.sans,
            outline: "none",
            cursor: "pointer",
            borderRadius: r.radiusSm,
          }}
        >
          <option value="">{t.allRoles}</option>
          {ROLE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {t.role[o]}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as UserStatus | "");
            setPage(1);
          }}
          style={{
            background: c.panel,
            border: `1px solid ${c.border}`,
            color: c.text,
            padding: "10px 14px",
            fontSize: 13,
            fontFamily: font.sans,
            outline: "none",
            cursor: "pointer",
            borderRadius: r.radiusSm,
          }}
        >
          <option value="">{t.allStatuses}</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {t.status[o]}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              setQueryText("");
              setRole("");
              setStatus("");
              setPage(1);
            }}
            style={{
              background: "none",
              border: `1px solid ${c.border}`,
              color: c.muted,
              padding: "10px 14px",
              fontSize: 13,
              fontFamily: font.sans,
              cursor: "pointer",
              borderRadius: r.radiusSm,
            }}
          >
            {t.clearFilters}
          </button>
        )}
        <span style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 11.5, color: c.faint }}>
          {t.showing(firstRow, lastRow, total)}
        </span>
      </div>

      {error ? (
        <div
          style={{
            border: `1px solid ${c.redBorder}`,
            background: c.redWash,
            padding: 32,
            textAlign: "center",
            fontFamily: font.mono,
            fontSize: 12.5,
            color: c.red,
            borderRadius: r.radiusMd,
          }}
        >
          <div>{error}</div>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            style={{
              marginTop: 16,
              background: "none",
              border: `1px solid ${c.redBorder}`,
              color: c.red,
              padding: "8px 16px",
              fontFamily: font.space,
              fontSize: 13,
              cursor: "pointer",
              borderRadius: r.radiusSm,
            }}
          >
            {t.retry}
          </button>
        </div>
      ) : (
        <div className="ark-scroll" style={{ overflowX: "auto" }}>
          <div
            style={{
              minWidth: 940,
              border: `1px solid ${c.border}`,
              background: c.panel,
              borderRadius: r.radiusMd,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: COLS,
                gap: 12,
                padding: "12px 18px",
                borderBottom: `1px solid ${c.line}`,
                fontFamily: font.mono,
                fontSize: 10.5,
                letterSpacing: ".08em",
                color: c.faint,
              }}
            >
              <span>{t.colUser}</span>
              <span>{t.colRole}</span>
              <span>{t.colStatus}</span>
              <span style={{ textAlign: "right" }}>{t.colAgents}</span>
              <span style={{ textAlign: "right" }}>{t.colIdentities}</span>
              <span style={{ textAlign: "right" }}>{t.colTokens}</span>
              <span style={{ textAlign: "right" }}>{t.colCost}</span>
              <span style={{ textAlign: "right" }}>{t.colJoined}</span>
            </div>

            {loading ? (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  fontFamily: font.mono,
                  fontSize: 12,
                  letterSpacing: ".06em",
                  color: c.faint,
                }}
              >
                {t.loading}
              </div>
            ) : users.length === 0 ? (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  fontFamily: font.mono,
                  fontSize: 12,
                  color: c.faint,
                }}
              >
                {hasFilters ? t.noUsersFiltered : t.noUsers}
              </div>
            ) : (
              users.map((u, i) => {
                const agents = u.agentCount ?? u.counts?.agents;
                const identities = u.identityCount ?? u.counts?.identities;
                return (
                  <Link
                    key={u.id}
                    href={`/dashboard/admin/${u.id}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <HoverDiv
                      hoverStyle={{ background: c.hover }}
                      style={{
                        display: "grid",
                        gridTemplateColumns: COLS,
                        gap: 12,
                        alignItems: "center",
                        padding: "13px 18px",
                        borderTop: i === 0 ? "none" : `1px solid ${c.lineSoft}`,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: font.space,
                            fontWeight: 600,
                            fontSize: 14,
                            color: c.text,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {u.name || "—"}
                        </div>
                        <div style={{ ...cellStyle, fontSize: 11.5, color: c.faint }}>
                          {u.email || "—"}
                        </div>
                      </div>
                      <span
                        style={{
                          fontFamily: font.mono,
                          fontSize: 11.5,
                          color: roleColor(u.platformRole),
                        }}
                      >
                        {roleLabel(u.platformRole, t)}
                      </span>
                      <span>
                        <StatusPill status={u.status} t={t} />
                      </span>
                      <span style={{ ...cellStyle, textAlign: "right" }}>
                        {fmtInt(agents, locale)}
                      </span>
                      <span style={{ ...cellStyle, textAlign: "right" }}>
                        {fmtInt(identities, locale)}
                      </span>
                      <span style={{ ...cellStyle, textAlign: "right" }}>
                        {fmtInt(u.usage?.totalTokens, locale)}
                      </span>
                      <span style={{ ...cellStyle, textAlign: "right" }}>
                        {fmtCost(u.usage?.costMicroUsd, locale)}
                      </span>
                      <span style={{ ...cellStyle, textAlign: "right", color: c.faint }}>
                        {fmtDate(u.createdAt, locale)}
                      </span>
                    </HoverDiv>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 16,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={loading || currentPage <= 1}
          style={{
            background: "none",
            border: `1px solid ${c.border}`,
            color: currentPage <= 1 ? c.faint : c.text2,
            padding: "8px 14px",
            fontFamily: font.sans,
            fontSize: 13,
            cursor: currentPage <= 1 ? "default" : "pointer",
            opacity: currentPage <= 1 ? 0.5 : 1,
            borderRadius: r.radiusSm,
          }}
        >
          {t.prevPage}
        </button>
        <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.faint }}>
          {t.pageOf(currentPage, pages)}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(pages, p + 1))}
          disabled={loading || currentPage >= pages}
          style={{
            background: "none",
            border: `1px solid ${c.border}`,
            color: currentPage >= pages ? c.faint : c.text2,
            padding: "8px 14px",
            fontFamily: font.sans,
            fontSize: 13,
            cursor: currentPage >= pages ? "default" : "pointer",
            opacity: currentPage >= pages ? 0.5 : 1,
            borderRadius: r.radiusSm,
          }}
        >
          {t.nextPage}
        </button>
      </div>

      <div style={{ marginTop: 32 }}>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            letterSpacing: ".12em",
            color: c.faint,
            marginBottom: 12,
          }}
        >
          {t.auditTitle}
        </div>
        <div
          style={{
            border: `1px solid ${c.border}`,
            background: c.panel,
            borderRadius: r.radiusMd,
            overflow: "hidden",
          }}
        >
          {audit.length === 0 ? (
            <div
              style={{
                padding: "26px 18px",
                textAlign: "center",
                fontFamily: font.mono,
                fontSize: 12,
                color: c.faint,
              }}
            >
              {t.noAudit}
            </div>
          ) : (
            audit.map((entry, i) => (
              <AuditRow key={entry.id} entry={entry} first={i === 0} t={t} locale={locale} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
