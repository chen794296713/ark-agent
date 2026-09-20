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
        <h1 style={{ fontFamily: font.space, fontWeight: 650, fontSize: 32, margin: "0 0 6px" }}>{t.heading}</h1>
        <p style={{ color: c.muted, margin: 0, fontSize: 14.5 }}>{t.intro}</p>
      </div>

      {loading ? (
        <div style={{ maxWidth: 880, border: `1px solid ${c.border}`, background: c.panel, padding: "40px 20px", textAlign: "center", fontFamily: font.sans, fontSize: 12.5, letterSpacing: "normal", color: c.faint }}>
          {t.loading}
        </div>
      ) : error ? (
        <div style={{ maxWidth: 880, border: `1px solid ${c.redBorder}`, background: c.redWash, padding: "20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ flex: 1, fontSize: 13.5, color: c.text }}>{error}</span>
          <Btn
            onClick={() => void load()}
            style={{ background: "transparent", border: `1px solid ${c.borderStrong}`, color: c.muted, padding: "9px 16px", fontFamily: font.sans, fontSize: 13, cursor: "pointer", borderRadius: 999 }}
            hoverStyle={{ borderColor: c.borderMute, color: c.text }}
          >
            {t.retry}
          </Btn>
        </div>
      ) : (
        <div style={{ maxWidth: 880, display: "flex", flexDirection: "column", gap: 0 }}>
          {channelDefs.map((d) => {
            const type = TYPE_BY_NAME[d.name];
            const ch = byType[type];
            const isOpen = chanOpen === d.name;
            const st = channelStatusDisplay(ch?.status, t);
            const conn = ch?.status === "connected";

            const rowBusy = !!busy[d.name];
            const flash = !!savedFlash[d.name];
            const saveLabel = rowBusy ? t.saving : flash ? t.saved : conn ? t.saveChanges : t.connect;
            // Real agents from this workspace, never a canned string: the old
            // `ch?.label || d.note` printed "USED BY NOVA" to anyone whose own
            // channel row had no label.
            const users = ch?.usedBy ?? [];
            const note = users.length ? t.usedBy(users.join(" · ")) : ch?.label || "—";
            const rErr = rowError[d.name];
            return (
              <div key={d.name} style={{ borderTop: `1px solid ${c.line}`, background: "transparent" }}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`channel-panel-${type}`}
                  onClick={() => setChanOpen(isOpen ? "" : d.name)}
                  style={{ width: "100%", border: "none", background: "transparent", textAlign: "left", color: c.text, fontFamily: font.sans, display: "flex", alignItems: "center", gap: 14, padding: "23px 0", cursor: "pointer" }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.dot }}></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: font.space, fontWeight: 600, fontSize: 20 }}>{d.name}</div>
                    <div style={{ fontSize: 14, color: c.muted, marginTop: 4 }}>{d.desc}</div>
                  </div>
                  <span style={{ fontFamily: font.sans, fontSize: 12, color: st.color, letterSpacing: "normal" }}>{st.label}</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" style={{ flexShrink: 0, color: c.muted, transform: isOpen ? "rotate(180deg)" : "none" }}><path d="m6 9 6 6 6-6" /></svg>
                </button>
                {isOpen && (
                  <div id={`channel-panel-${type}`} style={{ padding: "0 0 26px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: r.split, gap: 14 }}>
                      {d.fields.map((f) => {
                        const key = d.name + "." + f.k;
                        return (
                          <div key={key}>
                            <label htmlFor={`channel-field-${key}`} style={{ display: "block", fontFamily: font.sans, fontSize: 13, color: c.text2, marginBottom: 8 }}>{f.label}</label>
                            <input
                              id={`channel-field-${key}`}
                              value={chanCfg[key] || ""}
                              onChange={(e) => setChanCfg((s) => ({ ...s, [key]: e.target.value }))}
                              placeholder={f.ph}
                              style={{ width: "100%", background: c.panel, border: `1px solid ${c.borderField}`, color: c.text, padding: "11px 13px", fontSize: 14, fontFamily: font.mono, outline: "none", borderRadius: r.radiusSm }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    {rErr && (
                      <div style={{ fontFamily: font.sans, fontSize: 12, color: c.red }}>{rErr}</div>
                    )}
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <Btn
                        onClick={() => void handleConnect(d)}
                        hoverStyle={{ background: c.limeHover }}
                        disabled={rowBusy}
                        style={{ background: c.lime, color: c.ink, border: "none", padding: "10px 20px", fontFamily: font.sans, fontWeight: 700, fontSize: 13.5, cursor: rowBusy ? "default" : "pointer", opacity: rowBusy ? 0.6 : 1, borderRadius: 999 }}
                      >
                        {saveLabel}
                      </Btn>
                      {conn && (
                        <Btn
                          onClick={() => void handleDisconnect(d)}
                          disabled={rowBusy}
                          style={{ background: "transparent", border: `1px solid ${c.borderStrong}`, color: c.muted, padding: "9px 16px", fontFamily: font.sans, fontSize: 13, cursor: "pointer", borderRadius: 999 }}
                          hoverStyle={{ borderColor: c.redBorder, color: c.red }}
                        >
                          {t.disconnect}
                        </Btn>
                      )}
                      <span style={{ marginLeft: "auto", fontFamily: font.sans, fontSize: 12, color: c.faint }}>{note}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ borderTop: `1px solid ${c.line}`, padding: "18px 0", fontSize: 13, color: c.faint }}>{t.footnote}</div>
        </div>
      )}
    </div>
  );
}
