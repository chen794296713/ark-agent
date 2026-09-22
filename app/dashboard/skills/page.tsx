"use client";

/**
 * /dashboard/skills — the catalogue browser.
 *
 * The sidebar has linked here since the nav was written; until now the link
 * 404'd. Three things this screen must never do, each of which the copy and the
 * markup enforce rather than merely intend:
 *
 *  1. **Never render a publisher's bytes as markup.** `name`, `summary`,
 *     `description` and every `riskSignals[].detail` are third-party text. They
 *     go into text nodes only — no `dangerouslySetInnerHTML`, and deliberately
 *     not through the `react-markdown` already in the tree. The serializer
 *     sanitizes them; this layer refuses to interpret them.
 *  2. **Never draw a green tick nobody earned.** An absent `harnessCompat` entry
 *     reads "untested", never "supported", and every supported cell says on what
 *     BASIS — `compatFor` is the only read.
 *  3. **Never hide a filter silently.** `hiddenByRisk`, `hiddenByVerification`
 *     and `ignoredFilters` are rendered as sentences. A result count that has
 *     been quietly reduced is a result count the operator cannot trust.
 *
 * Degradation: no `OPENROUTER_API_KEY` and no Agent Manager change nothing here —
 * this screen reads one Postgres table. An EMPTY catalogue (no source has been
 * synced yet) is the launch-day state and gets its own copy, distinct from
 * "your filters match nothing".
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { c, font, r } from "@/lib/theme";
import { useApp } from "@/lib/store";
import { Btn, HoverDiv } from "@/components/ui";
import { BCP47 } from "@/lib/i18n";
import { fill, riskSignalText, skills as dict } from "@/lib/i18n/skills";
import { HARNESS_IDS, harnessLabel, type Harness } from "@/lib/harness";
import { categoryLabel } from "@/lib/skills/taxonomy";
import { compatFor } from "@/lib/skills/harness";
import {
  SKILL_CATEGORY_IDS,
  SKILL_FORMAT_IDS,
  SKILL_RISK_IDS,
  type SkillCardDTO,
  type SkillCategory,
  type SkillDTO,
  type SkillFormat,
  type SkillRisk,
} from "@/lib/skills/types";
import { SKILL_SORTS, type SkillSort } from "@/lib/skills/validation";
import {
  fetchSkill,
  fetchSkills,
  SkillApiError,
  type SkillBrowseResponse,
  type SkillSourceRef,
} from "@/lib/skills/client";

type Dict = (typeof dict)["en"];

const RISK_COLOR: Record<SkillRisk, string> = { low: c.green, medium: c.amber, high: c.red };
const riskWord = (t: Dict, level: SkillRisk) =>
  level === "low" ? t.riskLow : level === "medium" ? t.riskMedium : t.riskHigh;
const formatWord = (t: Dict, f: SkillFormat) =>
  f === "mcp_server" ? t.formatMcpServer : f === "skill_pack" ? t.formatSkillPack : t.formatAgentSkill;

/** Grouped for the reader's locale — 196851 is not a number anyone parses. */
const num = (n: number, lang: keyof typeof dict) => new Intl.NumberFormat(BCP47[lang]).format(n);

/** `upstreamUpdatedAt` is a nullable ISO string off an untrusted-ish column. */
function updatedWord(iso: string | null, t: Dict, lang: keyof typeof dict): string {
  if (!iso) return t.neverUpdated;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return t.neverUpdated;
  return new Intl.DateTimeFormat(BCP47[lang], { year: "numeric", month: "short", day: "numeric" }).format(at);
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

const labelStyle = { fontFamily: font.mono, fontSize: 10.5, color: c.muted, letterSpacing: "0.06em" } as const;

const controlStyle = {
  background: c.panel,
  border: `1px solid ${c.borderField}`,
  color: c.text,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: font.sans,
  outline: "none",
  borderRadius: r.radiusSm,
} as const;

function RiskPill({ level, t }: { level: SkillRisk; t: Dict }) {
  return (
    <span
      style={{
        fontFamily: font.mono,
        fontSize: 10.5,
        color: RISK_COLOR[level],
        border: `1px solid ${RISK_COLOR[level]}`,
        borderRadius: r.radiusSm,
        padding: "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {t.riskLabel} · {riskWord(t, level)}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 22 }}>
      <div style={{ ...labelStyle, marginBottom: 8 }}>{title.toUpperCase()}</div>
      {children}
    </section>
  );
}

/** A list of short strings, or the honest "none declared". */
function Chips({ values, empty }: { values: string[]; empty: string }) {
  if (values.length === 0) return <div style={{ fontSize: 13, color: c.muted }}>{empty}</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {values.map((v) => (
        <span
          key={v}
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: c.text2,
            background: c.panelDeep,
            border: `1px solid ${c.line}`,
            borderRadius: r.radiusSm,
            padding: "3px 8px",
          }}
        >
          {v}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function SkillCard({ s, t, lang, onOpen }: { s: SkillCardDTO; t: Dict; lang: keyof typeof dict; onOpen: () => void }) {
  return (
    <HoverDiv
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      hoverStyle={{ borderColor: c.borderMute }}
      style={{
        border: `1px solid ${c.border}`,
        background: c.panel,
        padding: 18,
        cursor: "pointer",
        borderRadius: r.radiusMd,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 16, wordBreak: "break-word" }}>
            {s.name}
          </div>
          {/* The raw handle, always — `mukul975/Anthropic-Cybersecurity-Skills`
              is exactly the name-vs-authority incoherence ClawHavoc exploited. */}
          <div style={{ fontFamily: font.mono, fontSize: 11, color: c.muted, marginTop: 2 }}>
            {s.ownerHandle ? `${s.ownerHandle}/` : ""}
            {s.slug}
          </div>
        </div>
        <RiskPill level={s.riskLevel} t={t} />
      </div>

      <div style={{ fontSize: 13, color: c.text2, lineHeight: 1.5 }}>{s.summary}</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.muted }}>
          {categoryLabel(s.category, lang)}
        </span>
        <span style={{ color: c.line }}>·</span>
        <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.muted }}>{formatWord(t, s.format)}</span>
        {s.verified ? (
          <>
            <span style={{ color: c.line }}>·</span>
            <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.accent }}>{t.verifiedBadge}</span>
          </>
        ) : null}
        {s.attachment ? (
          <>
            <span style={{ color: c.line }}>·</span>
            <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.green }}>{t.addedBadge}</span>
          </>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          border: `1px solid ${c.line}`,
          fontFamily: font.mono,
          fontSize: 10.5,
          color: c.muted,
          borderRadius: r.radiusSm,
        }}
      >
        <div style={{ padding: "8px 10px", borderRight: `1px solid ${c.line}`, flex: 1, minWidth: 0 }}>
          {t.licenseLabel}
          <div style={{ color: c.text2, fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>
            {s.license}
            {s.licenseVerified ? "" : ` · ${t.licenseUnverified}`}
          </div>
        </div>
        <div style={{ padding: "8px 10px", borderRight: `1px solid ${c.line}`, flex: 1, minWidth: 0 }}>
          {t.downloadsLabel}
          <div style={{ color: c.text2, fontSize: 12, marginTop: 2 }}>{num(s.downloads, lang)}</div>
        </div>
        <div style={{ padding: "8px 10px", flex: 1, minWidth: 0 }}>
          {t.updatedLabel}
          <div style={{ color: c.text2, fontSize: 12, marginTop: 2 }}>{updatedWord(s.upstreamUpdatedAt, t, lang)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {HARNESS_IDS.map((h) => {
          const on = compatFor(s.harnessCompat, h).supported;
          return (
            <span
              key={h}
              title={on ? t.compatSupported : t.compatUnsupported}
              style={{
                fontFamily: font.mono,
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: r.radiusSm,
                border: `1px solid ${on ? c.greenBorder : c.line}`,
                color: on ? c.green : c.faint,
              }}
            >
              {harnessLabel(h)}
            </span>
          );
        })}
      </div>
    </HoverDiv>
  );
}

// ---------------------------------------------------------------------------
// Detail drawer
// ---------------------------------------------------------------------------

function Drawer({
  publicId,
  t,
  lang,
  onClose,
}: {
  publicId: string;
  t: Dict;
  lang: keyof typeof dict;
  onClose: () => void;
}) {
  const [skill, setSkill] = useState<SkillDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  // No `setSkill(null)` reset here: the parent mounts this component with
  // `key={publicId}`, so a different skill is a different component instance and
  // starts from the initial state. Clearing it inside the effect would be a
  // synchronous setState in an effect body — a cascading render, and the lint
  // rule that says so is right.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetchSkill(publicId);
        if (alive) setSkill(res.skill);
      } catch (e) {
        if (alive) setError(e instanceof SkillApiError ? e.message : t.loadError);
      }
    })();
    return () => {
      alive = false;
    };
  }, [publicId, t.loadError]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: c.scrim,
        zIndex: 60,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: "min(560px, 100%)",
          height: "100%",
          overflowY: "auto",
          background: c.panel,
          borderLeft: `1px solid ${c.border}`,
          padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Btn
            onClick={onClose}
            hoverStyle={{ borderColor: c.borderMute, color: c.text }}
            style={{
              background: "transparent",
              border: `1px solid ${c.borderStrong}`,
              color: c.muted,
              padding: "6px 12px",
              fontFamily: font.space,
              fontSize: 12.5,
              cursor: "pointer",
              borderRadius: r.radiusSm,
            }}
          >
            {t.close}
          </Btn>
        </div>

        {error ? <div style={{ color: c.red, fontSize: 13, marginTop: 12 }}>{error}</div> : null}
        {!skill && !error ? (
          <div style={{ ...labelStyle, marginTop: 12 }}>{t.loading}</div>
        ) : null}

        {skill ? (
          <>
            <h3 style={{ fontFamily: font.space, fontSize: 22, margin: "12px 0 4px", wordBreak: "break-word" }}>
              {skill.name}
            </h3>
            <div style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted }}>
              {skill.ownerHandle ? `${skill.ownerHandle}/` : ""}
              {skill.slug} · {t.versionLabel} {skill.latestVersion}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
              <RiskPill level={skill.riskLevel} t={t} />
              <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.muted }}>
                {categoryLabel(skill.category, lang)}
              </span>
              <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.muted }}>
                {formatWord(t, skill.format)}
              </span>
            </div>

            {!skill.publisherVerified ? (
              <div
                style={{
                  marginTop: 12,
                  border: `1px solid ${c.borderStrong}`,
                  borderRadius: r.radiusSm,
                  padding: 12,
                  background: c.panelDeep,
                }}
              >
                <div style={{ fontFamily: font.space, fontSize: 13, fontWeight: 600 }}>{t.publisherUnverified}</div>
                <div style={{ fontSize: 12.5, color: c.muted, marginTop: 4, lineHeight: 1.5 }}>
                  {t.publisherUnverifiedHint}
                </div>
              </div>
            ) : null}

            {skill.status === "deprecated" || skill.deprecatedAt || skill.deprecationNote ? (
              <div style={{ marginTop: 12, fontSize: 12.5, color: c.amber }}>
                {t.deprecatedNotice}
                {skill.deprecationNote ? ` ${skill.deprecationNote}` : ""}
              </div>
            ) : null}

            <Section title={t.detailOverview}>
              <p style={{ fontSize: 13.5, color: c.text2, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
                {skill.description || skill.summary}
              </p>
              {skill.tags.length ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ ...labelStyle, marginBottom: 6 }}>{t.tagsLabel}</div>
                  <Chips values={skill.tags} empty={t.permNone} />
                </div>
              ) : null}
            </Section>

            <Section title={t.compatHeading}>
              <div style={{ display: "grid", gap: 6 }}>
                {HARNESS_IDS.map((h) => {
                  const cell = compatFor(skill.harnessCompat, h);
                  const basis =
                    cell.basis === "verified"
                      ? t.basisVerified
                      : cell.basis === "declared"
                        ? t.basisDeclared
                        : cell.basis === "inferred"
                          ? t.basisInferred
                          : t.basisUnknown;
                  return (
                    <div key={h} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 12.5 }}>
                      <span style={{ fontFamily: font.mono, minWidth: 90, color: c.text2 }}>{harnessLabel(h)}</span>
                      <span style={{ color: cell.supported ? c.green : c.muted }}>
                        {cell.supported ? t.compatSupported : t.compatUnsupported}
                      </span>
                      <span style={{ color: c.muted }}>· {basis}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: c.muted, marginTop: 8, lineHeight: 1.5 }}>{t.basisInferredHint}</div>
            </Section>

            <Section title={t.detailRisk}>
              {skill.riskScoredAt === null ? (
                <div style={{ fontSize: 12.5, color: c.muted, marginBottom: 8 }}>{t.assessedFromMetadata}</div>
              ) : null}
              {skill.riskSignals.length === 0 ? (
                <div style={{ fontSize: 13, color: c.muted }}>{t.noSignals}</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                  {skill.riskSignals.map((sig, i) => (
                    <li key={`${sig.code}-${i}`} style={{ fontSize: 13, color: c.text2, lineHeight: 1.5 }}>
                      {riskSignalText(sig.code, lang)}
                      {sig.delta !== 0 ? (
                        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>
                          {" "}
                          ({sig.delta > 0 ? "+" : ""}
                          {sig.delta})
                        </span>
                      ) : null}
                      {/* `detail` is publisher-adjacent text. Text node only. */}
                      {sig.detail ? (
                        <div style={{ fontFamily: font.mono, fontSize: 11, color: c.muted }}>{sig.detail}</div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={t.detailPermissions}>
              <div style={{ display: "grid", gap: 8, fontSize: 12.5, color: c.text2 }}>
                <div>
                  <span style={labelStyle}>{t.permNetwork}</span> ·{" "}
                  {skill.permissions.network ?? t.permNone}
                </div>
                <div>
                  <span style={labelStyle}>{t.permFilesystem}</span> ·{" "}
                  {skill.permissions.filesystem ?? t.permNone}
                </div>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>{t.permTools}</div>
                  <Chips values={skill.permissions.tools ?? []} empty={t.permNone} />
                </div>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>{t.permCredentials}</div>
                  <Chips values={skill.permissions.credentials ?? []} empty={t.permNone} />
                </div>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>{t.permHosts}</div>
                  <Chips values={skill.permissions.hosts ?? []} empty={t.permNone} />
                </div>
                {skill.permissions.irreversible ? (
                  <div style={{ color: c.red }}>{t.permIrreversible}</div>
                ) : null}
              </div>
            </Section>

            <Section title={t.detailRequirements}>
              <div style={{ display: "grid", gap: 8 }}>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>{t.reqBins}</div>
                  <Chips values={skill.requirements.bins ?? []} empty={t.permNone} />
                </div>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>{t.reqEnv}</div>
                  <Chips values={skill.requirements.env ?? []} empty={t.permNone} />
                </div>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>{t.reqConfig}</div>
                  <Chips values={skill.requirements.config ?? []} empty={t.permNone} />
                </div>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>{t.reqOs}</div>
                  <Chips values={skill.requirements.os ?? []} empty={t.permNone} />
                </div>
              </div>
            </Section>

            <Section title={t.detailInstall}>
              {/* Rendered as data. Never a command anyone is invited to paste. */}
              <div style={{ fontFamily: font.mono, fontSize: 12, color: c.text2, wordBreak: "break-all" }}>
                {skill.install.mode}
                {skill.install.mode === "registry" ? ` · ${skill.install.ref}@${skill.install.version}` : null}
                {skill.install.mode === "git" ? ` · ${skill.install.repo}#${skill.install.ref}` : null}
                {skill.install.mode === "mcp_stdio"
                  ? ` · ${skill.install.command} ${skill.install.args.join(" ")}`
                  : null}
                {skill.install.mode === "mcp_http" ? ` · ${skill.install.url}` : null}
                {skill.install.mode === "inline" ? ` · ${skill.install.bytes} B` : null}
              </div>
            </Section>

            <Section title={t.detailScanner}>
              {skill.scannerSummary === null ? (
                <div style={{ fontSize: 13, color: c.muted }}>{t.scannerNone}</div>
              ) : (
                <div style={{ fontSize: 12.5, color: c.text2 }}>
                  {skill.scannerSummary.decision ?? "—"}
                  {skill.scannerSummary.virusTotalTotal !== null ? (
                    <div style={{ color: c.muted, marginTop: 4 }}>
                      {fill(t.vendorsFlagged, {
                        flagged: skill.scannerSummary.virusTotalFlagged ?? 0,
                        total: skill.scannerSummary.virusTotalTotal,
                      })}
                    </div>
                  ) : null}
                </div>
              )}
            </Section>

            {skill.knownVersions.length ? (
              <Section title={t.detailVersions}>
                <Chips values={skill.knownVersions.map((v) => v.version)} empty={t.permNone} />
              </Section>
            ) : null}

            <div style={{ marginTop: 24, borderTop: `1px solid ${c.line}`, paddingTop: 14 }}>
              {skill.sourceUrl ? (
                <a
                  href={skill.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener nofollow"
                  style={{ fontFamily: font.space, fontSize: 13, color: c.accent }}
                >
                  {t.viewSource}
                </a>
              ) : null}
              {/* A licence condition of reusing a third-party directory, not
                  decoration: cache, honour 429, link back, imply nothing. */}
              {skill.attributionUrl ? (
                <div style={{ fontSize: 12, color: c.muted, marginTop: 8, lineHeight: 1.5 }}>
                  {t.attributionNote}{" "}
                  <a
                    href={skill.attributionUrl}
                    target="_blank"
                    rel="noreferrer noopener nofollow"
                    style={{ color: c.accent }}
                  >
                    {skill.attributionUrl}
                  </a>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SkillsPage() {
  const { lang } = useApp();
  const t = dict[lang];

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [category, setCategory] = useState<SkillCategory | "">("");
  const [risk, setRisk] = useState<SkillRisk | "">("");
  const [harness, setHarness] = useState<Harness | "">("");
  const [format, setFormat] = useState<SkillFormat | "">("");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState<SkillSort>("popularity");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [includeHigh, setIncludeHigh] = useState(false);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<SkillBrowseResponse | null>(null);
  const [sources, setSources] = useState<SkillSourceRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // The search box fires a request per keystroke without this, and each one is
  // eight statements on the pooled connection.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(id);
  }, [q]);

  /**
   * Every filter change resets to page 1, and it happens in the SETTER rather
   * than in an effect watching the filters. Page 4 of a narrower result set is
   * usually past the end, and an empty page reads as "no results" — the wrong
   * sentence entirely. Doing it in an effect would be a synchronous setState in
   * an effect body, which renders the stale page once before correcting itself.
   */
  function withReset<T>(set: (v: T) => void): (v: T) => void {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchSkills({
          q: debouncedQ || undefined,
          categories: category ? [category] : undefined,
          risks: risk ? [risk] : undefined,
          harnesses: harness ? [harness] : undefined,
          formats: format ? [format] : undefined,
          sources: source ? [source] : undefined,
          verifiedOnly,
          includeHigh,
          sort,
          page,
        });
        if (!alive) return;
        setData(res);
        // The source list is static per deployment; keeping the last non-empty
        // one stops the facet dropdown flickering empty between requests.
        if (res.sources.length) setSources(res.sources);
      } catch (e) {
        if (alive) setError(e instanceof SkillApiError ? e.message : t.loadError);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [debouncedQ, category, risk, harness, format, source, sort, verifiedOnly, includeHigh, page, reloadKey, t.loadError]);

  const clear = useCallback(() => {
    setQ("");
    setCategory("");
    setRisk("");
    setHarness("");
    setFormat("");
    setSource("");
    setSort("popularity");
    setVerifiedOnly(false);
    setIncludeHigh(false);
    setPage(1);
  }, []);

  const hasFilters =
    q !== "" || category !== "" || risk !== "" || harness !== "" || format !== "" || source !== "" || verifiedOnly || includeHigh;

  const pages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / Math.max(1, data.perPage))) : 1),
    [data],
  );

  // "The catalogue is empty" and "your filters match nothing" are different
  // facts and get different copy: the first is the launch-day state and no
  // amount of clearing filters fixes it.
  const catalogueEmpty = data !== null && data.total === 0 && !hasFilters;

  return (
    <div style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: font.space, fontWeight: 700, fontSize: 26, margin: 0 }}>{t.heading}</h2>
        <p style={{ fontSize: 13.5, color: c.muted, margin: "6px 0 0", maxWidth: 640, lineHeight: 1.55 }}>
          {t.subheading}
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input
          value={q}
          onChange={(e) => withReset(setQ)(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
          maxLength={80}
          style={{ ...controlStyle, flex: "1 1 220px", maxWidth: 280 }}
        />
        <select
          value={category}
          onChange={(e) => withReset(setCategory)(e.target.value as SkillCategory | "")}
          aria-label={t.filterCategory}
          style={{ ...controlStyle, cursor: "pointer" }}
        >
          <option value="">{`${t.filterAll} · ${t.filterCategory}`}</option>
          {SKILL_CATEGORY_IDS.map((id) => (
            <option key={id} value={id}>
              {categoryLabel(id, lang)}
              {data?.facets.category[id] !== undefined ? ` (${data.facets.category[id]})` : ""}
            </option>
          ))}
        </select>
        <select
          value={risk}
          onChange={(e) => withReset(setRisk)(e.target.value as SkillRisk | "")}
          aria-label={t.filterRisk}
          style={{ ...controlStyle, cursor: "pointer" }}
        >
          <option value="">{`${t.filterAll} · ${t.filterRisk}`}</option>
          {SKILL_RISK_IDS.map((id) => (
            <option key={id} value={id}>
              {riskWord(t, id)}
              {data ? ` (${data.facets.risk[id] ?? 0})` : ""}
            </option>
          ))}
        </select>
        <select
          value={harness}
          onChange={(e) => withReset(setHarness)(e.target.value as Harness | "")}
          aria-label={t.filterHarness}
          style={{ ...controlStyle, cursor: "pointer" }}
        >
          <option value="">{`${t.filterAll} · ${t.filterHarness}`}</option>
          {HARNESS_IDS.map((id) => (
            <option key={id} value={id}>
              {harnessLabel(id)}
              {data ? ` (${data.facets.harness[id] ?? 0})` : ""}
            </option>
          ))}
        </select>
        <select
          value={format}
          onChange={(e) => withReset(setFormat)(e.target.value as SkillFormat | "")}
          aria-label={t.filterFormat}
          style={{ ...controlStyle, cursor: "pointer" }}
        >
          <option value="">{`${t.filterAll} · ${t.filterFormat}`}</option>
          {SKILL_FORMAT_IDS.map((id) => (
            <option key={id} value={id}>
              {formatWord(t, id)}
            </option>
          ))}
        </select>
        {sources.length > 0 ? (
          <select
            value={source}
            onChange={(e) => withReset(setSource)(e.target.value)}
            aria-label={t.filterSource}
            style={{ ...controlStyle, cursor: "pointer" }}
          >
            <option value="">{`${t.filterAll} · ${t.filterSource}`}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {data ? ` (${data.facets.source[s.id] ?? 0})` : ""}
              </option>
            ))}
          </select>
        ) : null}
        <select
          value={sort}
          onChange={(e) => withReset(setSort)(e.target.value as SkillSort)}
          aria-label={t.sortLabel}
          style={{ ...controlStyle, cursor: "pointer" }}
        >
          {SKILL_SORTS.map((s) => (
            <option key={s} value={s}>
              {s === "popularity" ? t.sortPopularity : s === "recent" ? t.sortRecent : s === "name" ? t.sortName : t.sortRisk}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: c.text2, cursor: "pointer" }}>
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => withReset(setVerifiedOnly)(e.target.checked)} />
          {t.verifiedOnly}
        </label>
        <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: c.text2, cursor: "pointer" }}>
          <input type="checkbox" checked={includeHigh} onChange={(e) => withReset(setIncludeHigh)(e.target.checked)} />
          {t.showHighRisk}
        </label>
        {hasFilters ? (
          <Btn
            onClick={clear}
            hoverStyle={{ borderColor: c.accent, color: c.accent }}
            style={{
              background: "transparent",
              border: `1px solid ${c.borderStrong}`,
              color: c.muted,
              padding: "7px 13px",
              fontFamily: font.space,
              fontSize: 12.5,
              cursor: "pointer",
              borderRadius: r.radiusSm,
            }}
          >
            {t.clearFilters}
          </Btn>
        ) : null}
      </div>

      <div style={{ fontSize: 12.5, color: c.muted, marginBottom: 14, lineHeight: 1.6 }}>
        {t.showHighRiskHint}
      </div>

      {/* Every hidden row is accounted for in a sentence. A count the user
          cannot see is a count they cannot trust. */}
      {data && data.hiddenByRisk > 0 ? (
        <div style={{ fontSize: 12.5, color: c.amber, marginBottom: 8 }}>
          {fill(t.hiddenByRisk, { n: data.hiddenByRisk })}
        </div>
      ) : null}
      {data && data.hiddenByVerification > 0 ? (
        <div style={{ fontSize: 12.5, color: c.amber, marginBottom: 8 }}>
          {fill(t.hiddenByVerification, { n: data.hiddenByVerification })}
        </div>
      ) : null}
      {data && data.ignoredFilters.length > 0 ? (
        <div style={{ fontSize: 12.5, color: c.muted, marginBottom: 8 }}>{t.ignoredFilters}</div>
      ) : null}

      {error ? (
        <div style={{ border: `1px solid ${c.redBorder}`, background: c.redWash, padding: 16, borderRadius: r.radiusMd }}>
          <div style={{ fontSize: 13.5, color: c.text }}>{error}</div>
          <Btn
            onClick={() => setReloadKey((k) => k + 1)}
            hoverStyle={{ borderColor: c.accent, color: c.accent }}
            style={{
              marginTop: 10,
              background: "transparent",
              border: `1px solid ${c.borderStrong}`,
              color: c.text,
              padding: "7px 13px",
              fontFamily: font.space,
              fontSize: 12.5,
              cursor: "pointer",
              borderRadius: r.radiusSm,
            }}
          >
            {t.retry}
          </Btn>
        </div>
      ) : loading && !data ? (
        <div style={{ ...labelStyle, padding: "40px 0" }}>{t.loading}</div>
      ) : catalogueEmpty ? (
        <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: 28, borderRadius: r.radiusMd }}>
          <div style={{ fontFamily: font.space, fontSize: 17, fontWeight: 700 }}>{t.emptyCatalogTitle}</div>
          <div style={{ fontSize: 13.5, color: c.muted, marginTop: 8, lineHeight: 1.6, maxWidth: 520 }}>
            {t.emptyCatalogBody}
          </div>
        </div>
      ) : data && data.items.length === 0 ? (
        <div style={{ border: `1px solid ${c.border}`, background: c.panel, padding: 28, borderRadius: r.radiusMd }}>
          <div style={{ fontFamily: font.space, fontSize: 17, fontWeight: 700 }}>{t.noResultsTitle}</div>
          <div style={{ fontSize: 13.5, color: c.muted, marginTop: 8, lineHeight: 1.6 }}>{t.noResultsBody}</div>
        </div>
      ) : data ? (
        <>
          <div style={{ ...labelStyle, marginBottom: 12 }}>{fill(t.resultCount, { n: num(data.total, lang) })}</div>
          <div style={{ display: "grid", gridTemplateColumns: r.col3, gap: r.gapMd, opacity: loading ? 0.6 : 1 }}>
            {data.items.map((s) => (
              <SkillCard key={s.publicId} s={s} t={t} lang={lang} onOpen={() => setOpen(s.publicId)} />
            ))}
          </div>

          {pages > 1 ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", marginTop: 24 }}>
              <Btn
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                hoverStyle={{ borderColor: c.borderMute }}
                style={{
                  background: "transparent",
                  border: `1px solid ${c.borderStrong}`,
                  color: data.page <= 1 ? c.faint : c.text,
                  padding: "7px 14px",
                  fontFamily: font.space,
                  fontSize: 12.5,
                  cursor: data.page <= 1 ? "default" : "pointer",
                  borderRadius: r.radiusSm,
                }}
              >
                {t.prevPage}
              </Btn>
              <span style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted }}>
                {fill(t.pageOf, { page: data.page, pages })}
              </span>
              <Btn
                disabled={data.page >= pages}
                onClick={() => setPage((p) => p + 1)}
                hoverStyle={{ borderColor: c.borderMute }}
                style={{
                  background: "transparent",
                  border: `1px solid ${c.borderStrong}`,
                  color: data.page >= pages ? c.faint : c.text,
                  padding: "7px 14px",
                  fontFamily: font.space,
                  fontSize: 12.5,
                  cursor: data.page >= pages ? "default" : "pointer",
                  borderRadius: r.radiusSm,
                }}
              >
                {t.nextPage}
              </Btn>
            </div>
          ) : null}
        </>
      ) : null}

      {open ? <Drawer key={open} publicId={open} t={t} lang={lang} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
