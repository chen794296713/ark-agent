"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { c, font, r } from "@/lib/theme";
import { api, ApiError } from "@/lib/client-api";
import type { AgentDTO } from "@/lib/serializers";
import { statusDisplay, ENGINE_LABEL, channelsText } from "@/lib/agent-display";
import type { Harness } from "@/lib/harness";
import { Btn, HoverDiv } from "@/components/ui";
import { useApp } from "@/lib/store";
import { fleet } from "@/lib/i18n/fleet";
import { AgentAvatar } from "@/components/AgentAvatar";

// Derived, so a new harness appears in the filter instead of silently
// hiding every agent that runs on it.
type EngineFilter = "all" | Harness;
type StatusFilter = "all" | "working" | "error" | "terminated";

function FleetCard({
  a,
  onToggle,
}: {
  a: AgentDTO;
  onToggle: (a: AgentDTO) => void;
}) {
  const { lang } = useApp();
  const t = fleet[lang];
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const st = statusDisplay(a.status);
  const paused = a.status === "paused";
  const chans = channelsText(a.channels) || `${a.channels.length}`;

  return (
    <HoverDiv
      onClick={() => router.push(`/dashboard/fleet/${a.id}`)}
      hoverStyle={{ borderColor: c.borderMute }}
      style={{
        border: `1px solid ${c.border}`,
        background: c.panel,
        padding: 24,
        cursor: "pointer",
        borderRadius: r.radiusMd,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14, marginBottom: 24 }}>
        <AgentAvatar roleId={a.roleId} name={a.name} mono={a.mono} size={56} />
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <Link href={`/dashboard/fleet/${a.id}`} onClick={(event) => event.stopPropagation()} style={{ fontFamily: font.space, fontWeight: 600, fontSize: 21, color: c.text, textDecoration: "none", overflowWrap: "anywhere" }}>{a.name}</Link>
          <div style={{ fontSize: 14, color: c.muted, marginTop: 3 }}>{a.role}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.color }} />
          <span style={{ fontFamily: font.sans, fontSize: 12, color: st.color }}>{st.label}</span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          borderTop: `1px solid ${c.line}`,
          paddingTop: 18,
          fontFamily: font.sans,
          fontSize: 12,
          color: c.muted,
        }}
      >
        <div style={{ flex: 1 }}>
          {t.labelEngine}
          <div style={{ color: c.text2, fontSize: 12.5, marginTop: 3 }}>
            {ENGINE_LABEL[a.engine] ?? a.engine}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {t.labelCredits}
          <div style={{ color: c.text2, fontSize: 12.5, marginTop: 3 }}>{a.creditsUsed}</div>
        </div>
        <div style={{ flex: 1 }}>
          {t.labelChannels}
          <div style={{ color: c.text2, fontSize: 12.5, marginTop: 3 }}>{chans}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 24 }}>
        <Btn
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/dashboard/fleet/${a.id}?tab=settings`);
          }}
          hoverStyle={{ background: c.limeHover }}
          style={{
            flex: 1,
            border: `1px solid ${c.lime}`,
            background: c.lime,
            color: c.ink,
            padding: "10px 14px",
            fontFamily: font.sans,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            borderRadius: 999,
          }}
        >
          {t.manage}
        </Btn>
        <Btn
          disabled={busy}
          onClick={async (e) => {
            e.stopPropagation();
            if (busy) return;
            setBusy(true);
            try {
              const { agent } = await api.lifecycle(a.id, paused ? "resume" : "pause");
              onToggle(agent);
            } catch {
              /* leave state unchanged on failure */
            } finally {
              setBusy(false);
            }
          }}
          hoverStyle={{ borderColor: c.amber, color: c.amber }}
          style={{
            flex: 1,
            border: `1px solid ${c.borderStrong}`,
            background: "transparent",
            color: c.muted,
            padding: 9,
            fontFamily: font.sans,
            fontSize: 13,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
            borderRadius: r.radiusSm,
          }}
        >
          {busy ? "…" : paused ? t.resume : t.pause}
        </Btn>
        <Btn
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/dashboard/fleet/${a.id}?tab=chat`);
          }}
          hoverStyle={{ borderColor: c.borderMute, color: c.text }}
          style={{
            flex: 1,
            border: `1px solid ${c.borderStrong}`,
            background: "transparent",
            color: c.muted,
            padding: 9,
            fontFamily: font.sans,
            fontSize: 13,
            cursor: "pointer",
            borderRadius: r.radiusSm,
          }}
        >
          {t.chat}
        </Btn>
      </div>
    </HoverDiv>
  );
}

export default function FleetPage() {
  const { lang } = useApp();
  const t = fleet[lang];
  const [agents, setAgents] = useState<AgentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [engineFilter, setEngineFilter] = useState<EngineFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { agents: list } = await api.listAgents();
        if (alive) setAgents(list);
      } catch (e) {
        if (alive) setError(e instanceof ApiError ? e.message : t.loadError);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleToggle = useCallback((updated: AgentDTO) => {
    setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

  // Get unique engines from agents
  const uniqueEngines = useMemo(() => {
    const engines = new Set(agents.map((a) => a.engine));
    return Array.from(engines).sort();
  }, [agents]);

  // Filter agents based on search, engine, and status
  const filteredAgents = useMemo(() => {
    return agents
      .filter((a) => {
        // Search filter (by name)
        if (searchQuery && !a.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
        // Engine filter
        if (engineFilter !== "all" && a.engine !== engineFilter) {
          return false;
        }
        // Status filter
        if (statusFilter !== "all" && a.status !== statusFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt)));
  }, [agents, searchQuery, engineFilter, statusFilter]);

  const hasActiveFilters = searchQuery || engineFilter !== "all" || statusFilter !== "all";

  return (
    <div style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 28,
        }}
      >
        <h1 style={{ fontFamily: font.space, fontWeight: 650, fontSize: 32, lineHeight: 1.15, letterSpacing: "-.025em", margin: 0 }}>{t.heading}</h1>
        <Link href="/hire" style={{ textDecoration: "none", background: c.lime, color: c.ink, padding: "12px 22px", fontFamily: font.sans, fontWeight: 600, fontSize: 14, borderRadius: 999 }}>
          {t.hireNewAgent}
        </Link>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 24,
          alignItems: "center",
        }}
      >
        {/* Search by name */}
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.filterPlaceholder}
          aria-label={t.filterPlaceholder}
          style={{
            flex: "1 1 200px",
            maxWidth: 320,
            background: c.panel,
            border: `1px solid ${c.borderField}`,
            color: c.text,
            padding: "10px 14px",
            fontSize: 14,
            fontFamily: font.sans,
            outline: "none",
            borderRadius: r.radiusSm,
          }}
        />

        {/* Filter by Engine */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            aria-label={t.filterByEngine}
            value={engineFilter}
            onChange={(e) => setEngineFilter(e.target.value as EngineFilter)}
            style={{
              background: c.panel,
              border: `1px solid ${c.borderField}`,
              color: c.text,
              padding: "10px 14px",
              fontSize: 13,
              fontFamily: font.sans,
              outline: "none",
              cursor: "pointer",
              borderRadius: r.radiusSm,
            }}
          >
            <option value="all">{t.filterAll} {t.filterByEngine}</option>
            {uniqueEngines.map((engine) => (
              <option key={engine} value={engine}>
                {ENGINE_LABEL[engine] ?? engine}
              </option>
            ))}
          </select>
        </div>

        {/* Filter by Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            aria-label={t.filterByStatus}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            style={{
              background: c.panel,
              border: `1px solid ${c.borderField}`,
              color: c.text,
              padding: "10px 14px",
              fontSize: 13,
              fontFamily: font.sans,
              outline: "none",
              cursor: "pointer",
              borderRadius: r.radiusSm,
            }}
          >
            <option value="all">{t.filterAll} {t.filterByStatus}</option>
            <option value="working">{t.statusWorking}</option>
            <option value="error">{t.statusError}</option>
            <option value="terminated">{t.statusTerminated}</option>
          </select>
        </div>

        {/* Clear filters button */}
        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearchQuery("");
              setEngineFilter("all");
              setStatusFilter("all");
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
      </div>

      {loading ? (
        <div
          style={{
            border: `1px solid ${c.border}`,
            background: c.panel,
            padding: 40,
            textAlign: "center",
            fontFamily: font.sans,
            fontSize: 12,
            letterSpacing: "normal",
            color: c.faint,
            borderRadius: r.radiusMd,
          }}
        >
          {t.loadingFleet}
        </div>
      ) : error ? (
        <div
          style={{
            border: `1px solid ${c.redBorder}`,
            background: c.redWash,
            padding: 40,
            textAlign: "center",
            fontFamily: font.sans,
            fontSize: 12.5,
            color: c.red,
          }}
        >
          {error}
        </div>
      ) : filteredAgents.length === 0 ? (
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
            {hasActiveFilters ? t.noResults : t.noAgentsTitle}
          </div>
          <div style={{ fontSize: 13.5, color: c.muted }}>
            {hasActiveFilters ? "Try adjusting your filters." : t.noAgentsBody}
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearchQuery("");
                setEngineFilter("all");
                setStatusFilter("all");
              }}
              style={{
                marginTop: 16,
                background: "none",
                border: `1px solid ${c.border}`,
                color: c.muted,
                padding: "8px 16px",
                fontFamily: font.sans,
                fontSize: 13,
                cursor: "pointer",
                borderRadius: r.radiusSm,
              }}
            >
              {t.clearFilters}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: r.col2, gap: r.gapSm }}>
          {filteredAgents.map((a) => (
            <FleetCard key={a.id} a={a} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  );
}
