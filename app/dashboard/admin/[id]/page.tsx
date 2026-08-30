"use client";

/**
 * Platform admin — one account.
 *
 * Every mutation re-reads the record instead of trusting its own response, so
 * the screen always shows what the database now says (and picks up anything the
 * server changed as a side effect, e.g. sessions dropped by a suspension).
 */
import { use, useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlatformRole, UserStatus } from "@/lib/db/schema";
import { c, font, r } from "@/lib/theme";
import {
  api,
  ApiError,
  type AdminUsageByDay,
  type AdminUserDetailDTO,
} from "@/lib/client-api";
import { useApp } from "@/lib/store";
import { admin as adminI18n, type AdminDict } from "@/lib/i18n/admin";
import { BCP47 } from "@/lib/i18n";
import { Btn } from "@/components/ui";

const ROLE_OPTIONS: PlatformRole[] = ["user", "support", "admin"];

const panelStyle: CSSProperties = {
  border: `1px solid ${c.border}`,
  background: c.panel,
  padding: "clamp(18px, 3vw, 24px)",
  borderRadius: r.radiusMd,
};

const panelTitleStyle: CSSProperties = {
  margin: "0 0 18px",
  color: c.text,
  fontFamily: font.space,
  fontSize: 17,
  fontWeight: 700,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 7,
  color: c.muted,
  fontFamily: font.mono,
  fontSize: 11,
  letterSpacing: ".08em",
};

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  border: `1px solid ${c.border}`,
  background: c.panelDeep,
  color: c.text,
  padding: "11px 12px",
  fontFamily: font.sans,
  fontSize: 14,
  outline: "none",
  borderRadius: r.radiusSm,
};

const monoCell: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 12,
  color: c.text2,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

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

/** A day bucket may arrive keyed as `day` or `date`; neither is worth a crash. */
function dayLabel(row: AdminUsageByDay, locale: string): string {
  const raw = row.day ?? row.date;
  if (!raw) return "—";
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return raw;
  return new Date(ms).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function isDenied(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 403 || e.status === 401);
}

function providerLabel(provider: string | undefined, t: AdminDict): string {
  if (provider === "google" || provider === "wechat") return t.provider[provider];
  return t.providerFallback(provider ?? "—");
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

type Feedback = { kind: "success" | "error"; text: string } | null;

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  const success = feedback.kind === "success";
  return (
    <div
      role={success ? "status" : "alert"}
      style={{
        marginTop: 14,
        border: `1px solid ${success ? c.greenBorder : c.redBorder}`,
        background: success ? c.greenWash : c.redWash,
        color: success ? c.green : c.red,
        padding: "10px 12px",
        fontSize: 13,
        borderRadius: r.radiusSm,
      }}
    >
      {feedback.text}
    </div>
  );
}

/** Label/value pair used down the profile column. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 14, color: c.text2, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

/**
 * Small read-only table. Rows carry ReactNode cells so a status can render as a
 * pill while the column next to it stays plain mono text.
 */
function MiniTable({
  cols,
  head,
  align,
  rows,
  empty,
  minWidth = 420,
}: {
  cols: string;
  head: string[];
  align?: ("left" | "right")[];
  rows: { key: string; cells: ReactNode[] }[];
  empty: string;
  minWidth?: number;
}) {
  const at = (i: number) => align?.[i] ?? "left";
  return (
    <div className="ark-scroll" style={{ overflowX: "auto" }}>
      <div style={{ minWidth }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: cols,
            gap: 12,
            paddingBottom: 10,
            borderBottom: `1px solid ${c.line}`,
            fontFamily: font.mono,
            fontSize: 10.5,
            letterSpacing: ".08em",
            color: c.faint,
          }}
        >
          {head.map((h, i) => (
            <span key={h + i} style={{ textAlign: at(i) }}>
              {h}
            </span>
          ))}
        </div>
        {rows.length === 0 ? (
          <div
            style={{
              padding: "22px 0",
              textAlign: "center",
              fontFamily: font.mono,
              fontSize: 12,
              color: c.faint,
            }}
          >
            {empty}
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.key}
              style={{
                display: "grid",
                gridTemplateColumns: cols,
                gap: 12,
                alignItems: "center",
                padding: "11px 0",
                borderBottom: `1px solid ${c.lineSoft}`,
              }}
            >
              {row.cells.map((cell, i) => (
                <div key={i} style={{ ...monoCell, textAlign: at(i) }}>
                  {cell}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

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

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // `params` is a promise in this Next version; a client page unwraps it with use().
  const { id } = use(params);
  const router = useRouter();
  const { user: me, lang } = useApp();
  const t = adminI18n[lang];
  const locale = BCP47[lang];

  const [detail, setDetail] = useState<AdminUserDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [missing, setMissing] = useState(false);

  const [roleDraft, setRoleDraft] = useState<PlatformRole | "">("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api.adminUser(id);
      setDetail(d);
      if (d.user?.platformRole) setRoleDraft(d.user.platformRole);
      setError(null);
    } catch (e) {
      if (isDenied(e)) setDenied(true);
      else if (e instanceof ApiError && e.status === 404) setMissing(true);
      else setError(e instanceof ApiError ? e.message : t.loadError);
    }
  }, [id, t.loadError]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await load();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const target = detail?.user;
  const isSelf = !!me && !!target && me.id === target.id;
  // Support may read every account; only admin may act on one. The server
  // enforces this too — hiding the controls just avoids offering a dead button.
  const canEdit = me?.platformRole === "admin" && !isSelf;

  async function run(action: () => Promise<unknown>, successText: string) {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      await load();
      setFeedback({ kind: "success", text: successText });
    } catch (e) {
      setFeedback({
        kind: "error",
        text: e instanceof ApiError ? e.message : t.actionError,
      });
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await api.adminDeleteUser(id);
      router.replace("/dashboard/admin");
    } catch (e) {
      setFeedback({
        kind: "error",
        text: e instanceof ApiError ? e.message : t.deleteError,
      });
      setBusy(false);
    }
  }

  if (denied) return <NotAuthorized t={t} />;

  if (loading) {
    return (
      <div style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
        <div
          style={{
            border: `1px solid ${c.border}`,
            background: c.panel,
            padding: 40,
            textAlign: "center",
            fontFamily: font.mono,
            fontSize: 12,
            letterSpacing: ".06em",
            color: c.faint,
            borderRadius: r.radiusMd,
          }}
        >
          {t.loading}
        </div>
      </div>
    );
  }

  if (missing || (!detail?.user && !error)) {
    return (
      <div style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
        <Link
          href="/dashboard/admin"
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            color: c.muted,
            textDecoration: "none",
          }}
        >
          ← {t.backToUsers}
        </Link>
        <div
          style={{
            marginTop: 20,
            border: `1px solid ${c.border}`,
            background: c.panel,
            padding: "44px 28px",
            textAlign: "center",
            fontSize: 14,
            color: c.muted,
            borderRadius: r.radiusMd,
          }}
        >
          {t.userNotFound}
        </div>
      </div>
    );
  }

  const workspaces = detail?.workspaces ?? [];
  const agents = detail?.agents ?? [];
  const identities = detail?.identities ?? [];
  const sessions = detail?.sessions ?? [];
  const usage = detail?.usage;
  const byModel = usage?.byModel ?? [];
  const byDay = usage?.byDay ?? [];
  const maxDayTokens = byDay.reduce((m, d) => Math.max(m, d.totalTokens ?? 0), 0);
  const suspended = target?.status === "suspended";
  const deleteArmed =
    !!target?.email && confirmEmail.trim().toLowerCase() === target.email.toLowerCase();

  return (
    <div data-screen-label="Admin user" style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      <Link
        href="/dashboard/admin"
        style={{ fontFamily: font.mono, fontSize: 12, color: c.muted, textDecoration: "none" }}
      >
        ← {t.backToUsers}
      </Link>

      <div style={{ margin: "16px 0 26px" }}>
        <h2
          style={{
            margin: 0,
            color: c.text,
            fontFamily: font.space,
            fontSize: "clamp(21px, 4vw, 27px)",
            fontWeight: 700,
          }}
        >
          {target?.name || target?.email || "—"}
        </h2>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.muted }}>
            {target?.email || "—"}
          </span>
          <Pill
            text={
              target?.platformRole === "user" ||
              target?.platformRole === "support" ||
              target?.platformRole === "admin"
                ? t.role[target.platformRole]
                : "—"
            }
            color={
              target?.platformRole === "admin"
                ? c.accent
                : target?.platformRole === "support"
                  ? c.blue
                  : c.muted
            }
          />
          <Pill
            text={suspended ? t.status.suspended : t.status.active}
            color={suspended ? c.red : c.green}
          />
        </div>
      </div>

      {error && (
        <div
          style={{
            border: `1px solid ${c.redBorder}`,
            background: c.redWash,
            padding: "12px 16px",
            marginBottom: 20,
            fontFamily: font.mono,
            fontSize: 12.5,
            color: c.red,
            borderRadius: r.radiusSm,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: r.col2, gap: r.gapMd, alignItems: "start" }}>
        <div style={panelStyle}>
          <h3 style={panelTitleStyle}>{t.profileTitle}</h3>
          <Field label={t.fieldName}>{target?.name || "—"}</Field>
          <Field label={t.fieldEmail}>{target?.email || "—"}</Field>
          <Field label={t.fieldId}>
            <span style={{ fontFamily: font.mono, fontSize: 12 }}>{target?.id ?? id}</span>
          </Field>
          <Field label={t.fieldLocale}>
            <span style={{ fontFamily: font.mono, fontSize: 12.5 }}>{target?.locale ?? "—"}</span>
          </Field>
          <Field label={t.fieldJoined}>{fmtDate(target?.createdAt, locale)}</Field>
          <div>
            <div style={labelStyle}>{t.fieldPassword}</div>
            <div style={{ fontSize: 14, color: c.text2 }}>
              {target?.hasPassword === undefined
                ? "—"
                : target.hasPassword
                  ? t.passwordSet
                  : t.passwordNone}
            </div>
          </div>
        </div>

        <div style={panelStyle}>
          <h3 style={panelTitleStyle}>{t.accessTitle}</h3>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="admin-role" style={labelStyle}>
              {t.roleLabel}
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select
                id="admin-role"
                value={roleDraft}
                disabled={!canEdit || busy}
                onChange={(e) => setRoleDraft(e.target.value as PlatformRole)}
                style={{
                  ...inputStyle,
                  flex: "1 1 160px",
                  width: "auto",
                  cursor: canEdit ? "pointer" : "not-allowed",
                  opacity: canEdit ? 1 : 0.6,
                }}
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {t.role[o]}
                  </option>
                ))}
              </select>
              <Btn
                disabled={!canEdit || busy || !roleDraft || roleDraft === target?.platformRole}
                onClick={() =>
                  roleDraft &&
                  run(() => api.adminSetUserRole(id, roleDraft as PlatformRole), t.roleUpdated)
                }
                hoverStyle={{ background: c.limeHover }}
                style={{
                  border: "none",
                  background: c.lime,
                  color: c.ink,
                  padding: "11px 17px",
                  fontFamily: font.space,
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: canEdit && roleDraft !== target?.platformRole ? "pointer" : "default",
                  opacity: !canEdit || busy || roleDraft === target?.platformRole ? 0.55 : 1,
                  borderRadius: r.radiusSm,
                }}
              >
                {busy ? t.working : t.applyRole}
              </Btn>
            </div>
            <div style={{ marginTop: 8, fontSize: 12.5, color: c.faint }}>{t.roleHelp}</div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={labelStyle}>{t.statusLabel}</div>
            <Btn
              disabled={!canEdit || busy}
              onClick={() =>
                run(
                  () => api.adminSetUserStatus(id, (suspended ? "active" : "suspended") as UserStatus),
                  t.statusUpdated,
                )
              }
              hoverStyle={{
                borderColor: suspended ? c.green : c.red,
                color: suspended ? c.green : c.red,
              }}
              style={{
                border: `1px solid ${c.borderStrong}`,
                background: "transparent",
                color: suspended ? c.green : c.text,
                padding: "10px 16px",
                fontFamily: font.space,
                fontWeight: 500,
                fontSize: 13,
                cursor: canEdit ? "pointer" : "default",
                opacity: canEdit ? 1 : 0.55,
                borderRadius: r.radiusSm,
              }}
            >
              {suspended ? t.activate : t.suspend}
            </Btn>
            <div style={{ marginTop: 8, fontSize: 12.5, color: c.faint }}>{t.suspendHelp}</div>
          </div>

          <div>
            <div style={labelStyle}>{t.sessionsTitle}</div>
            <Btn
              disabled={!canEdit || busy}
              onClick={() => run(() => api.adminRevokeSessions(id), t.sessionsRevoked)}
              hoverStyle={{ borderColor: c.amber, color: c.amber }}
              style={{
                border: `1px solid ${c.borderStrong}`,
                background: "transparent",
                color: c.text,
                padding: "10px 16px",
                fontFamily: font.space,
                fontWeight: 500,
                fontSize: 13,
                cursor: canEdit ? "pointer" : "default",
                opacity: canEdit ? 1 : 0.55,
                borderRadius: r.radiusSm,
              }}
            >
              {t.revokeSessions}
            </Btn>
          </div>

          {isSelf && (
            <div style={{ marginTop: 14, fontSize: 12.5, color: c.amber }}>{t.selfGuard}</div>
          )}
          <FeedbackMessage feedback={feedback} />
        </div>

        <div style={panelStyle}>
          <h3 style={panelTitleStyle}>{t.identitiesTitle}</h3>
          <MiniTable
            cols="90px minmax(140px,1.6fr) 96px 110px"
            head={[t.colProvider, t.colProviderAccount, t.colLinked, t.colLastLogin]}
            align={["left", "left", "right", "right"]}
            empty={t.noIdentities}
            rows={identities.map((idn) => ({
              key: idn.id,
              cells: [
                providerLabel(idn.provider, t),
                <span key="acct" title={idn.email ?? undefined}>
                  {idn.email || idn.displayName || "—"}
                  {idn.email && (
                    <span
                      style={{
                        marginLeft: 6,
                        color: idn.emailVerified ? c.green : c.faint,
                        fontSize: 10.5,
                      }}
                    >
                      {idn.emailVerified ? t.verified : t.unverified}
                    </span>
                  )}
                </span>,
                fmtDate(idn.createdAt, locale),
                idn.lastLoginAt ? fmtDateTime(idn.lastLoginAt, locale) : t.never,
              ],
            }))}
          />
        </div>

        <div style={panelStyle}>
          <h3 style={panelTitleStyle}>{t.workspacesTitle}</h3>
          <MiniTable
            cols="minmax(140px,1.8fr) 100px 120px"
            head={[t.colWorkspace, t.colRole, t.colCredits]}
            align={["left", "left", "right"]}
            empty={t.noWorkspaces}
            minWidth={380}
            rows={workspaces.map((w) => ({
              key: w.id,
              cells: [
                w.name || w.id,
                w.memberRole || "—",
                `${fmtInt(w.creditsUsed, locale)} / ${fmtInt(w.creditsIncluded, locale)}`,
              ],
            }))}
          />
        </div>

        <div style={panelStyle}>
          <h3 style={panelTitleStyle}>{t.agentsTitle}</h3>
          <MiniTable
            cols="minmax(120px,1.6fr) minmax(90px,1fr) 92px 84px 96px"
            head={[t.colAgent, t.colAgentRole, t.colAgentStatus, t.colAgentCredits, t.colCreated]}
            align={["left", "left", "left", "right", "right"]}
            empty={t.noAgents}
            minWidth={520}
            rows={agents.map((a) => ({
              key: a.id,
              cells: [
                a.name || a.id,
                a.role || a.roleId || "—",
                a.status || "—",
                fmtInt(a.creditsUsed, locale),
                fmtDate(a.createdAt, locale),
              ],
            }))}
          />
        </div>

        <div style={panelStyle}>
          <h3 style={panelTitleStyle}>{t.sessionsTitle}</h3>
          <MiniTable
            cols="118px 118px 110px minmax(120px,1.4fr)"
            head={[t.colSessionStarted, t.colSessionExpires, t.colSessionIp, t.colSessionDevice]}
            empty={t.noSessions}
            minWidth={480}
            rows={sessions.map((s) => ({
              key: s.id,
              cells: [
                fmtDateTime(s.createdAt, locale),
                fmtDateTime(s.expiresAt, locale),
                s.ip || "—",
                <span key="ua" title={s.userAgent ?? undefined}>
                  {s.userAgent || "—"}
                </span>,
              ],
            }))}
          />
        </div>
      </div>

      <div style={{ marginTop: r.gapMd }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <h3 style={{ ...panelTitleStyle, margin: 0 }}>{t.usageTitle}</h3>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: c.faint }}>
            {t.usageWindow}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: r.col4,
            gap: 1,
            background: c.line,
            border: `1px solid ${c.line}`,
            borderRadius: r.radiusMd,
            overflow: "hidden",
            marginBottom: r.gapSm,
          }}
        >
          {[
            { label: t.usageCalls, value: fmtInt(usage?.totals?.calls, locale) },
            { label: t.usageTokens, value: fmtInt(usage?.totals?.totalTokens, locale) },
            { label: t.usageCost, value: fmtCost(usage?.totals?.costMicroUsd, locale) },
            { label: t.usageErrorRate, value: fmtRate(usage?.totals?.errorRate, locale) },
          ].map((tile) => (
            <div key={tile.label} style={{ background: c.panel, padding: 18 }}>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 10.5,
                  letterSpacing: ".08em",
                  color: c.faint,
                }}
              >
                {tile.label}
              </div>
              <div
                style={{ fontFamily: font.space, fontWeight: 700, fontSize: 24, marginTop: 8 }}
              >
                {tile.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: r.col2, gap: r.gapMd, alignItems: "start" }}>
          <div style={panelStyle}>
            <h3 style={{ ...panelTitleStyle, fontSize: 15 }}>{t.byModelTitle}</h3>
            <MiniTable
              cols="minmax(150px,2fr) 78px 100px 96px"
              head={[t.colModel, t.usageCalls, t.usageTokens, t.usageCost]}
              align={["left", "right", "right", "right"]}
              empty={t.noUsage}
              minWidth={440}
              rows={byModel.map((m, i) => ({
                key: `${m.model ?? "model"}-${i}`,
                cells: [
                  <span key="m" title={m.model ?? undefined}>
                    {m.model || "—"}
                  </span>,
                  fmtInt(m.calls, locale),
                  fmtInt(m.totalTokens, locale),
                  fmtCost(m.costMicroUsd, locale),
                ],
              }))}
            />
          </div>

          <div style={panelStyle}>
            <h3 style={{ ...panelTitleStyle, fontSize: 15 }}>{t.byDayTitle}</h3>
            {byDay.length === 0 ? (
              <div
                style={{
                  padding: "22px 0",
                  textAlign: "center",
                  fontFamily: font.mono,
                  fontSize: 12,
                  color: c.faint,
                }}
              >
                {t.noUsage}
              </div>
            ) : (
              byDay.map((d, i) => {
                const tokens = d.totalTokens ?? 0;
                const pct = maxDayTokens > 0 ? Math.round((tokens / maxDayTokens) * 100) : 0;
                return (
                  <div key={`${d.day ?? d.date ?? "day"}-${i}`} style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontFamily: font.mono,
                        fontSize: 11.5,
                        color: c.faint,
                        marginBottom: 5,
                      }}
                    >
                      <span>{dayLabel(d, locale)}</span>
                      <span style={{ color: c.text2 }}>
                        {fmtInt(tokens, locale)} · {fmtCost(d.costMicroUsd, locale)}
                      </span>
                    </div>
                    <div style={{ height: 4, background: c.line }}>
                      <div style={{ height: 4, width: `${pct}%`, background: c.lime }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {canEdit && (
        <div
          style={{
            ...panelStyle,
            marginTop: r.gapMd,
            border: `1px solid ${c.redBorder}`,
            background: c.redWash,
          }}
        >
          <h3 style={{ ...panelTitleStyle, color: c.red }}>{t.dangerTitle}</h3>
          <div style={{ fontSize: 13.5, color: c.text2, marginBottom: 16, maxWidth: 640 }}>
            {t.deleteWarning}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 260px", maxWidth: 340 }}>
              <label htmlFor="admin-delete-confirm" style={labelStyle}>
                {t.deleteConfirmLabel(target?.email ?? "—")}
              </label>
              <input
                id="admin-delete-confirm"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={t.deleteConfirmPlaceholder}
                autoComplete="off"
                style={inputStyle}
              />
            </div>
            <Btn
              disabled={!deleteArmed || busy}
              onClick={deleteUser}
              hoverStyle={deleteArmed ? { background: c.red, color: c.onBrand } : undefined}
              style={{
                border: `1px solid ${c.redBorder}`,
                background: "transparent",
                color: c.red,
                padding: "11px 17px",
                fontFamily: font.space,
                fontWeight: 600,
                fontSize: 13.5,
                cursor: deleteArmed && !busy ? "pointer" : "default",
                opacity: deleteArmed && !busy ? 1 : 0.5,
                borderRadius: r.radiusSm,
              }}
            >
              {busy ? t.deleting : t.deleteButton}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
