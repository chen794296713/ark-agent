"use client";

import { useState } from "react";
import { c, font, r } from "@/lib/theme";
import { channelDefs } from "@/lib/data";
import { Btn } from "@/components/ui";

export default function ChannelsPage() {
  const [chanOpen, setChanOpen] = useState<string>("Telegram");
  const [chanCfg, setChanCfg] = useState<Record<string, string>>({});
  const [chanSaved, setChanSaved] = useState<Record<string, boolean>>({});

  return (
    <div data-screen-label="Channels" style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: font.space, fontWeight: 700, fontSize: "clamp(20px, 5vw, 26px)", margin: "0 0 6px" }}>Channels</h2>
        <p style={{ color: c.muted, margin: 0, fontSize: 14.5 }}>Where you — and your customers — talk to your agents. Connect once; every agent can use it.</p>
      </div>
      <div style={{ maxWidth: 780, display: "flex", flexDirection: "column", gap: 10 }}>
        {channelDefs.map((d) => {
          const isOpen = chanOpen === d.name;
          const saved = !!chanSaved[d.name];
          const conn = d.connected || saved;
          const dot = conn ? c.green : c.faint;
          const stTxt = conn ? "CONNECTED" : "NOT CONNECTED";
          const stC = conn ? c.green : c.faint;
          const chev = isOpen ? "▾" : "▸";
          const saveLabel = saved ? "✓ Saved" : conn ? "Save changes" : "Connect";
          return (
            <div key={d.name} style={{ border: `1px solid ${c.border}`, background: c.panel }}>
              <div
                onClick={() => setChanOpen(isOpen ? "" : d.name)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", cursor: "pointer" }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }}></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 15.5 }}>{d.name}</div>
                  <div style={{ fontSize: 12.5, color: c.faint }}>{d.desc}</div>
                </div>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: stC, letterSpacing: ".06em" }}>{stTxt}</span>
                <span style={{ color: c.faint, fontFamily: font.mono }}>{chev}</span>
              </div>
              {isOpen && (
                <div style={{ borderTop: `1px solid ${c.line}`, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: r.split, gap: 14 }}>
                    {d.fields.map((f) => {
                      const key = d.name + "." + f.k;
                      return (
                        <div key={key}>
                          <div style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: ".12em", color: c.muted, marginBottom: 7 }}>{f.label}</div>
                          <input
                            value={chanCfg[key] || ""}
                            onChange={(e) => setChanCfg((s) => ({ ...s, [key]: e.target.value }))}
                            placeholder={f.ph}
                            style={{ width: "100%", background: c.panelDeep, border: `1px solid ${c.border}`, color: c.text, padding: "11px 13px", fontSize: 14, fontFamily: font.mono, outline: "none" }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      onClick={() => setChanSaved((s) => ({ ...s, [d.name]: true }))}
                      style={{ background: c.lime, color: c.ink, border: "none", padding: "10px 20px", fontFamily: font.space, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
                    >
                      {saveLabel}
                    </button>
                    <Btn
                      style={{ background: "transparent", border: `1px solid ${c.borderStrong}`, color: c.muted, padding: "9px 16px", fontFamily: font.space, fontSize: 13, cursor: "pointer" }}
                      hoverStyle={{ borderColor: c.borderMute, color: c.text }}
                    >
                      Send test message
                    </Btn>
                    <span style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 11, color: c.faint }}>{d.note}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div style={{ border: `1px dashed ${c.border}`, padding: "14px 18px", fontSize: 13, color: c.faint }}>Credentials are encrypted and scoped to this workspace. Agents request channel access per role — you approve once.</div>
      </div>
    </div>
  );
}
