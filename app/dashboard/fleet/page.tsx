"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { c, font, r } from "@/lib/theme";
import { useApp } from "@/lib/store";
import { Btn, HoverDiv } from "@/components/ui";
import type { Agent } from "@/lib/types";

function FleetCard({ a }: { a: Agent }) {
  const router = useRouter();
  const { isPaused, togglePause } = useApp();
  const paused = isPaused(a.id);
  const st = paused ? "PAUSED" : a.st;
  const sc = paused ? c.amber : a.sc;
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
            background: a.hue,
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
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc }} />
          <span style={{ fontFamily: font.mono, fontSize: 11, color: sc }}>{st}</span>
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
          ENGINE
          <div style={{ color: c.text2, fontSize: 12.5, marginTop: 3 }}>{a.engine}</div>
        </div>
        <div style={{ padding: "10px 14px", borderRight: `1px solid ${c.line}`, flex: 1 }}>
          CREDITS
          <div style={{ color: c.text2, fontSize: 12.5, marginTop: 3 }}>{a.credits}</div>
        </div>
        <div style={{ padding: "10px 14px", flex: 1 }}>
          CHANNELS
          <div style={{ color: c.text2, fontSize: 12.5, marginTop: 3 }}>{a.chansTxt}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Btn
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/dashboard/fleet/${a.id}?tab=settings`);
          }}
          hoverStyle={{ borderColor: c.lime, color: c.lime }}
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
          Manage
        </Btn>
        <Btn
          onClick={(e) => {
            e.stopPropagation();
            togglePause(a.id);
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
            cursor: "pointer",
          }}
        >
          {paused ? "Resume" : "Pause"}
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
          Chat
        </Btn>
      </div>
    </HoverDiv>
  );
}

export default function FleetPage() {
  const { agents } = useApp();
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
        <h2 style={{ fontFamily: font.space, fontWeight: 700, fontSize: 26, margin: 0 }}>Fleet</h2>
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
            + Hire new agent
          </button>
        </Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: r.col2, gap: r.gapSm }}>
        {agents.map((a) => (
          <FleetCard key={a.id} a={a} />
        ))}
      </div>
    </div>
  );
}
