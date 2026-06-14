"use client";

import { useCallback, useEffect, useState } from "react";
import { c, font, r } from "@/lib/theme";
import { channelDefs } from "@/lib/data";
import { Btn } from "@/components/ui";
import { api, ApiError, type ChannelDTO } from "@/lib/client-api";
import { useApp } from "@/lib/store";
import { channels as channelsI18n, type ChannelsDict } from "@/lib/i18n/channels";

/** Map a channelDefs display name → the API channel `type` enum. */
const TYPE_BY_NAME: Record<string, string> = {
  Telegram: "telegram",
  WhatsApp: "whatsapp",
  "WeChat 微信": "wechat",
  LINE: "line",
  Slack: "slack",
  Email: "email",
};

/** statusDisplay-style mapping for channel connection state. */
function channelStatusDisplay(status: string | undefined, t: ChannelsDict): { label: string; color: string; dot: string } {
  switch (status) {
    case "connected":
      return { label: t.statusConnected, color: c.green, dot: c.green };
    case "pending":
      return { label: t.statusPending, color: c.amber, dot: c.amber };
    case "error":
      return { label: t.statusError, color: c.red, dot: c.red };
    default:
      return { label: t.statusNotConnected, color: c.faint, dot: c.faint };
  }
}

export default function ChannelsPage() {
  const { lang } = useApp();
  const t = channelsI18n[lang];
  const [chanOpen, setChanOpen] = useState<string>("Telegram");
  // Local edits keyed by `${name}.${fieldKey}` — seeded from each channel's config.
  const [chanCfg, setChanCfg] = useState<Record<string, string>>({});
  // API channels merged by type → the live state driving each card.
  const [byType, setByType] = useState<Record<string, ChannelDTO>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-channel transient flags.
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [savedFlash, setSavedFlash] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const seedConfig = useCallback((channels: ChannelDTO[]) => {
    setChanCfg((prev) => {
      const next = { ...prev };
      for (const def of channelDefs) {
        const type = TYPE_BY_NAME[def.name];
        const ch = channels.find((x) => x.type === type);
        for (const f of def.fields) {
          const key = def.name + "." + f.k;
          // Only seed fields the user hasn't started editing.
          if (next[key] === undefined) next[key] = (ch?.config?.[f.k] as string) || "";
        }
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { channels } = await api.channels();
      const map: Record<string, ChannelDTO> = {};
      for (const ch of channels) map[ch.type] = ch;
      setByType(map);
      seedConfig(channels);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.loadError);
    } finally {
      setLoading(false);
    }
  }, [seedConfig, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleConnect(def: (typeof channelDefs)[number]) {
    const name = def.name;
    const type = TYPE_BY_NAME[name];
    if (!type) return;
    setBusy((s) => ({ ...s, [name]: true }));
    setRowError((s) => ({ ...s, [name]: "" }));
    try {
      const config: Record<string, string> = {};
      for (const f of def.fields) {
        const v = (chanCfg[name + "." + f.k] || "").trim();
        if (v) config[f.k] = v;
      }
      const { channel } = await api.connectChannel({ type, config, label: name });
      setByType((s) => ({ ...s, [channel.type]: channel }));
      setSavedFlash((s) => ({ ...s, [name]: true }));
      window.setTimeout(() => setSavedFlash((s) => ({ ...s, [name]: false })), 1800);
    } catch (e) {
      setRowError((s) => ({ ...s, [name]: e instanceof ApiError ? e.message : t.saveError }));
    } finally {
      setBusy((s) => ({ ...s, [name]: false }));
    }
  }

  async function handleDisconnect(def: (typeof channelDefs)[number]) {
    const name = def.name;
    const type = TYPE_BY_NAME[name];
    const ch = byType[type];
    if (!ch) return;
    setBusy((s) => ({ ...s, [name]: true }));
    setRowError((s) => ({ ...s, [name]: "" }));
    try {
      const { channel } = await api.disconnectChannel(ch.id);
      setByType((s) => ({ ...s, [channel.type]: channel }));
    } catch (e) {
      setRowError((s) => ({ ...s, [name]: e instanceof ApiError ? e.message : t.disconnectError }));
    } finally {
      setBusy((s) => ({ ...s, [name]: false }));
    }
  }

  return (
    <div data-screen-label="Channels" style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: font.space, fontWeight: 700, fontSize: "clamp(20px, 5vw, 26px)", margin: "0 0 6px" }}>{t.heading}</h2>
        <p style={{ color: c.muted, margin: 0, fontSize: 14.5 }}>{t.intro}</p>
      </div>

      {loading ? (
        <div style={{ maxWidth: 780, border: `1px solid ${c.border}`, background: c.panel, padding: "40px 20px", textAlign: "center", fontFamily: font.mono, fontSize: 12.5, letterSpacing: ".08em", color: c.faint }}>
          {t.loading}
        </div>
      ) : error ? (
        <div style={{ maxWidth: 780, border: `1px solid ${c.redBorder}`, background: c.redWash, padding: "20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ flex: 1, fontSize: 13.5, color: c.text }}>{error}</span>
          <Btn
            onClick={() => void load()}
            style={{ background: "transparent", border: `1px solid ${c.borderStrong}`, color: c.muted, padding: "9px 16px", fontFamily: font.space, fontSize: 13, cursor: "pointer" }}
            hoverStyle={{ borderColor: c.borderMute, color: c.text }}
          >
            {t.retry}
          </Btn>
        </div>
      ) : (
        <div style={{ maxWidth: 780, display: "flex", flexDirection: "column", gap: 10 }}>
          {channelDefs.map((d) => {
            const type = TYPE_BY_NAME[d.name];
            const ch = byType[type];
            const isOpen = chanOpen === d.name;
            const st = channelStatusDisplay(ch?.status, t);
            const conn = ch?.status === "connected";
            const chev = isOpen ? "▾" : "▸";
            const rowBusy = !!busy[d.name];
            const flash = !!savedFlash[d.name];
            const saveLabel = rowBusy ? t.saving : flash ? t.saved : conn ? t.saveChanges : t.connect;
            const note = ch?.label || d.note;
            const rErr = rowError[d.name];
            return (
              <div key={d.name} style={{ border: `1px solid ${c.border}`, background: c.panel }}>
                <div
                  onClick={() => setChanOpen(isOpen ? "" : d.name)}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", cursor: "pointer" }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.dot }}></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: font.space, fontWeight: 700, fontSize: 15.5 }}>{d.name}</div>
                    <div style={{ fontSize: 12.5, color: c.faint }}>{d.desc}</div>
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: st.color, letterSpacing: ".06em" }}>{st.label}</span>
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
                    {rErr && (
                      <div style={{ fontFamily: font.mono, fontSize: 11.5, color: c.red }}>{rErr}</div>
                    )}
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        onClick={() => void handleConnect(d)}
                        disabled={rowBusy}
                        style={{ background: c.lime, color: c.ink, border: "none", padding: "10px 20px", fontFamily: font.space, fontWeight: 700, fontSize: 13.5, cursor: rowBusy ? "default" : "pointer", opacity: rowBusy ? 0.6 : 1 }}
                      >
                        {saveLabel}
                      </button>
                      {conn && (
                        <Btn
                          onClick={() => void handleDisconnect(d)}
                          disabled={rowBusy}
                          style={{ background: "transparent", border: `1px solid ${c.borderStrong}`, color: c.muted, padding: "9px 16px", fontFamily: font.space, fontSize: 13, cursor: "pointer" }}
                          hoverStyle={{ borderColor: c.redBorder, color: c.red }}
                        >
                          {t.disconnect}
                        </Btn>
                      )}
                      <span style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 11, color: c.faint }}>{note}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ border: `1px dashed ${c.border}`, padding: "14px 18px", fontSize: 13, color: c.faint }}>{t.footnote}</div>
        </div>
      )}
    </div>
  );
}
