"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { c, font, r } from "@/lib/theme";
import { api, ApiError } from "@/lib/client-api";
import type { AgentDTO } from "@/lib/serializers";
import { statusDisplay, ENGINE_LABEL, channelsText } from "@/lib/agent-display";
import { Btn, HoverDiv } from "@/components/ui";
import { useApp } from "@/lib/store";
import { fleet } from "@/lib/i18n/fleet";

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
        padding: 22,
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <div
          style={{
            width: 42,
            height: 42,
            background: a.hue ?? c.lime,
            color: c.ink,
            display: "grid",
            placeItems: "center",
            fontFamily: font.space,
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          {a.mono}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 17 }}>{a.name}</div>
          <div style={{ fontSize: 13, color: c.muted }}>{a.role}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.color }} />
          <span style={{ fontFamily: font.mono, fontSize: 11, color: st.color }}>{st.label}</span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: 0,
          border: `1px solid ${c.line}`,
          fontFamily: font.mono,
          fontSize: 11,
          color: c.faint,
        }}
      >
        <div style={{ padding: "10px 14px", borderRight: `1px solid ${c.line}`, flex: 1 }}>
          {t.labelEngine}
          <div style={{ color: c.text2, fontSize: 12.5, marginTop: 3 }}>
            {ENGINE_LABEL[a.engine] ?? a.engine}
          </div>
        </div>
        <div style={{ padding: "10px 14px", borderRight: `1px solid ${c.line}`, flex: 1 }}>
          {t.labelCredits}
          <div style={{ color: c.text2, fontSize: 12.5, marginTop: 3 }}>{a.creditsUsed}</div>
        </div>
        <div style={{ padding: "10px 14px", flex: 1 }}>
          {t.labelChannels}
          <div style={{ color: c.text2, fontSize: 12.5, marginTop: 3 }}>{chans}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Btn
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/dashboard/fleet/${a.id}?tab=settings`);
          }}
          hoverStyle={{ borderColor: c.accent, color: c.accent }}
          style={{
            flex: 1,
            border: `1px solid ${c.borderStrong}`,
            background: "transparent",
            color: c.text,
            padding: 9,
            fontFamily: font.space,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
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
            fontFamily: font.space,
            fontSize: 13,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
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
            fontFamily: font.space,
            fontSize: 13,
            cursor: "pointer",
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
        <h2 style={{ fontFamily: font.space, fontWeight: 700, fontSize: 26, margin: 0 }}>{t.heading}</h2>
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
            }}
          >
            {t.hireNewAgent}
          </button>
        </Link>
      </div>

      {loading ? (
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
            fontFamily: font.mono,
            fontSize: 12.5,
            color: c.red,
          }}
        >
          {error}
        </div>
      ) : agents.length === 0 ? (
        <div
          style={{
            border: `1px solid ${c.border}`,
            background: c.panel,
            padding: "48px 32px",
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
            {t.noAgentsTitle}
          </div>
          <div style={{ fontSize: 13.5, color: c.muted, marginBottom: 20 }}>
            {t.noAgentsBody}
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
              }}
            >
              {t.hireNewAgent}
            </button>
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: r.col2, gap: r.gapSm }}>
          {agents.map((a) => (
            <FleetCard key={a.id} a={a} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  );
}
