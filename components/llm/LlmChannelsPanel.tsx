"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Btn } from "@/components/ui";
import { PageHeader, InlineAlert, Modal, StatusDot, fieldControl, fieldLabel, primaryButton, secondaryButton } from "@/components/llm/LlmPrimitives";
import { api, ApiError, type LlmChannelDTO, type LlmChannelInput, type LlmProtocol, type LlmProvider } from "@/lib/client-api";
import { BCP47 } from "@/lib/i18n";
import { llmSettings, type LlmSettingsDict } from "@/lib/i18n/llm-settings";
import { useApp } from "@/lib/store";
import { c, font, r } from "@/lib/theme";

const PROVIDERS: { id: LlmProvider; label: string; protocol: LlmProtocol; baseUrl: string }[] = [
  { id: "openai", label: "OpenAI", protocol: "openai", baseUrl: "https://api.openai.com/v1" },
  { id: "anthropic", label: "Anthropic", protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1" },
  { id: "openrouter", label: "OpenRouter", protocol: "openai", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "deepseek", label: "DeepSeek", protocol: "openai", baseUrl: "https://api.deepseek.com/v1" },
  { id: "xai", label: "xAI", protocol: "openai", baseUrl: "https://api.x.ai/v1" },
  { id: "custom", label: "Custom", protocol: "openai", baseUrl: "" },
];

type ChannelForm = LlmChannelInput & { models: string[] };
const blankForm = (): ChannelForm => ({ name: "", provider: "openai", protocol: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "", enabled: true, models: [] });

function ChannelEditor({ initial, t, busy, onCancel, onSubmit }: { initial: LlmChannelDTO | null; t: LlmSettingsDict; busy: boolean; onCancel: () => void; onSubmit: (form: ChannelForm) => Promise<void> }) {
  const [form, setForm] = useState<ChannelForm>(() => initial ? { name: initial.name, provider: initial.provider as LlmProvider, protocol: initial.protocol, baseUrl: initial.baseUrl, apiKey: "", enabled: initial.enabled, models: initial.models } : blankForm());
  const [modelBusy, setModelBusy] = useState(false);
  const [modelStatus, setModelStatus] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelDraft, setModelDraft] = useState("");

  function chooseProvider(provider: LlmProvider) {
    const preset = PROVIDERS.find((item) => item.id === provider)!;
    setForm((current) => ({ ...current, provider, protocol: preset.protocol, baseUrl: preset.baseUrl, models: [] }));
    setModelStatus(null); setModelError(null);
  }
  async function fetchModels() {
    if (!form.baseUrl || (!form.apiKey && !initial)) { setModelError(t.testBeforeSave); return; }
    setModelBusy(true); setModelError(null); setModelStatus(null);
    try {
      const result = initial && !form.apiKey
        ? await api.fetchLlmModels({ source: "channel", channelKind: "custom", channelId: initial.id })
        : await api.fetchLlmModels({ source: "draft", protocol: form.protocol, baseUrl: form.baseUrl, apiKey: form.apiKey });
      setForm((current) => ({ ...current, models: result.models })); setModelStatus(t.fetchedModels(result.models.length));
    } catch (cause) { setModelError(cause instanceof ApiError ? cause.message : t.modelError); }
    finally { setModelBusy(false); }
  }
  async function submit(event: FormEvent) { event.preventDefault(); await onSubmit(form); }

  function addModel() {
    const model = modelDraft.trim();
    if (!model) return;
    setForm((current) => ({ ...current, models: [...new Set([...current.models, model])] }));
    setModelDraft("");
  }

  function removeModel(model: string) {
    setForm((current) => ({ ...current, models: current.models.filter((item) => item !== model) }));
  }

  return <form onSubmit={submit}>
    <div style={{ display: "grid", gridTemplateColumns: r.split, gap: 16 }}>
      <div><label htmlFor="channel-name" style={fieldLabel}>{t.channelName}</label><input id="channel-name" autoFocus required maxLength={80} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={t.channelNamePlaceholder} style={fieldControl} /></div>
      <div><label htmlFor="channel-provider" style={fieldLabel}>{t.provider}</label><select id="channel-provider" value={form.provider} onChange={(event) => chooseProvider(event.target.value as LlmProvider)} style={fieldControl}>{PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.id === "custom" ? t.customProvider : item.label}</option>)}</select></div>
      <div style={{ gridColumn: "1 / -1" }}><span style={fieldLabel}>{t.protocol}</span><div role="group" aria-label={t.protocol} style={{ display: "inline-grid", gridTemplateColumns: "1fr 1fr", border: `1px solid ${c.border}`, borderRadius: r.radiusSm, overflow: "hidden" }}>{(["openai", "anthropic"] as const).map((protocol) => <button key={protocol} type="button" onClick={() => setForm((current) => ({ ...current, protocol, models: [] }))} style={{ border: 0, borderRight: protocol === "openai" ? `1px solid ${c.border}` : 0, padding: "9px 14px", background: form.protocol === protocol ? c.navSelected : "transparent", color: form.protocol === protocol ? c.text : c.muted, cursor: "pointer" }}>{protocol === "openai" ? "OpenAI-compatible" : "Anthropic"}</button>)}</div></div>
      <div style={{ gridColumn: "1 / -1" }}><label htmlFor="channel-url" style={fieldLabel}>{t.endpoint}</label><input id="channel-url" type="url" required maxLength={500} value={form.baseUrl} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value, models: [] }))} placeholder="https://api.example.com/v1" style={fieldControl} /></div>
      <div style={{ gridColumn: "1 / -1" }}><label htmlFor="channel-key" style={fieldLabel}>{t.apiKey}</label><input id="channel-key" type="password" autoComplete="new-password" required={!initial} maxLength={1000} value={form.apiKey} onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value, models: [] }))} placeholder={initial ? "••••••••" : t.apiKeyPlaceholder} style={fieldControl} />{initial && <div style={{ color: c.faint, fontSize: 11.5, marginTop: 6 }}>{t.apiKeyKeep}</div>}</div>
    </div>
    <div style={{ marginTop: 16, padding: 13, border: `1px solid ${c.line}`, background: c.panelDeep, borderRadius: r.radiusSm }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><strong style={{ display: "block", fontSize: 13 }}>{t.models}</strong><span style={{ color: c.faint, fontSize: 11.5 }}>{form.models.length ? t.fetchedModels(form.models.length) : t.noModels}</span></div><Btn type="button" onClick={() => void fetchModels()} disabled={modelBusy} style={secondaryButton}>{modelBusy ? t.fetchingModels : t.syncModels}</Btn></div>
      <div style={{ marginTop: 12 }}><label htmlFor="channel-model-id" style={fieldLabel}>{t.modelList}</label><div style={{ display: "flex", gap: 7 }}><input id="channel-model-id" value={modelDraft} onChange={(event) => setModelDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addModel(); } }} placeholder={t.modelIdPlaceholder} style={{ ...fieldControl, flex: 1 }} /><Btn type="button" onClick={addModel} disabled={!modelDraft.trim()} style={{ ...secondaryButton, opacity: modelDraft.trim() ? 1 : .5 }}>{t.addModel}</Btn></div></div>
      {form.models.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10, maxHeight: 170, overflowY: "auto" }}>{form.models.map((model) => <div key={model} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "7px 9px", background: c.panel, border: `1px solid ${c.line}`, borderRadius: r.radiusSm }}><code style={{ color: c.text2, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{model}</code><button type="button" onClick={() => removeModel(model)} title={t.deleteModel} aria-label={`${t.deleteModel}: ${model}`} style={{ flex: "0 0 auto", border: 0, background: "transparent", color: c.red, cursor: "pointer", fontSize: 16 }}>×</button></div>)}</div>}
      {modelStatus && <div style={{ marginTop: 9, color: c.green, fontSize: 12 }}>{modelStatus}</div>}{modelError && <div style={{ marginTop: 9, color: c.red, fontSize: 12 }}>{modelError}</div>}
    </div>
    <label style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 16, color: c.text2, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />{t.enabled}</label>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22 }}><Btn type="button" onClick={onCancel} style={secondaryButton}>{t.cancel}</Btn><Btn type="submit" disabled={busy || !form.name.trim() || !form.baseUrl || (!initial && !form.apiKey)} style={{ ...primaryButton, opacity: busy ? .55 : 1 }}>{busy ? t.saving : t.create}</Btn></div>
  </form>;
}

export function LlmChannelsPanel({ fixedTab, embedded = false }: { fixedTab?: "system" | "custom"; embedded?: boolean } = {}) {
  const { lang } = useApp(); const t = llmSettings[lang]; const locale = BCP47[lang];
  const [tab, setTab] = useState<"system" | "custom">(fixedTab ?? "system");
  const [channels, setChannels] = useState<{ system: LlmChannelDTO[]; custom: LlmChannelDTO[] }>({ system: [], custom: [] });
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LlmChannelDTO | "new" | null>(null); const [deleting, setDeleting] = useState<LlmChannelDTO | null>(null);
  const [busy, setBusy] = useState(false); const [rowBusy, setRowBusy] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { setChannels(await api.llmChannels()); } catch { setError(t.loadError); } finally { setLoading(false); } }, [t.loadError]);
  useEffect(() => {
    let cancelled = false;
    api.llmChannels().then((result) => { if (!cancelled) setChannels(result); })
      .catch(() => { if (!cancelled) setError(t.loadError); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t.loadError]);
  const rows = channels[tab];
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : t.never;

  async function save(form: ChannelForm) {
    setBusy(true); setError(null);
    try {
      if (editing === "new") {
        const { channel } = await api.createLlmChannel({ name: form.name, provider: form.provider, protocol: form.protocol, baseUrl: form.baseUrl, apiKey: form.apiKey, enabled: form.enabled, models: form.models });
        setChannels((current) => ({ ...current, custom: [...current.custom, channel] }));
      } else if (editing) {
        const body: Partial<LlmChannelInput> = { name: form.name, provider: form.provider, protocol: form.protocol, baseUrl: form.baseUrl, enabled: form.enabled, models: form.models };
        if (form.apiKey) body.apiKey = form.apiKey;
        const { channel } = await api.updateLlmChannel(editing.id, body);
        setChannels((current) => ({ ...current, custom: current.custom.map((item) => item.id === channel.id ? channel : item) }));
      }
      setEditing(null);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : t.saveError); }
    finally { setBusy(false); }
  }
  async function toggle(channel: LlmChannelDTO) {
    setRowBusy(channel.id); setError(null);
    try { const result = await api.updateLlmChannel(channel.id, { enabled: !channel.enabled }); setChannels((current) => ({ ...current, custom: current.custom.map((item) => item.id === channel.id ? result.channel : item) })); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : t.saveError); } finally { setRowBusy(null); }
  }
  async function sync(channel: LlmChannelDTO) {
    setRowBusy(channel.id); setError(null);
    try { const result = await api.fetchLlmModels({ source: "channel", channelKind: channel.kind, channelId: channel.id }); setChannels((current) => ({ ...current, [channel.kind]: current[channel.kind].map((item) => item.id === channel.id ? { ...item, models: result.models, lastSyncedAt: new Date().toISOString() } : item) })); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : t.modelError); } finally { setRowBusy(null); }
  }
  async function remove() {
    if (!deleting) return; setBusy(true); setError(null);
    try { await api.deleteLlmChannel(deleting.id); setChannels((current) => ({ ...current, custom: current.custom.filter((item) => item.id !== deleting.id) })); setDeleting(null); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : t.deleteError); } finally { setBusy(false); }
  }

  return <div data-screen-label="LLM channel management" style={{ padding: embedded ? `${r.contentPy} 0` : `${r.contentPy} ${r.pagePx}`, maxWidth: 1160 }}>
    <PageHeader title={t.manageTitle} subtitle={t.manageSubtitle} action={tab === "custom" ? <Btn onClick={() => setEditing("new")} style={primaryButton}>+ {t.addChannel}</Btn> : undefined} />
    {error && <div style={{ marginBottom: 16 }}><InlineAlert>{error} <button onClick={() => void load()} style={{ border: 0, background: "transparent", color: "inherit", textDecoration: "underline", cursor: "pointer" }}>{t.retry}</button></InlineAlert></div>}
    {!fixedTab && <div role="tablist" style={{ display: "flex", gap: 22, borderBottom: `1px solid ${c.border}`, marginBottom: 18 }}>{(["system", "custom"] as const).map((kind) => <button key={kind} role="tab" aria-selected={tab === kind} onClick={() => setTab(kind)} style={{ border: 0, borderBottom: `2px solid ${tab === kind ? c.accent : "transparent"}`, background: "transparent", color: tab === kind ? c.text : c.muted, padding: "10px 2px", marginBottom: -1, cursor: "pointer", fontWeight: tab === kind ? 650 : 400 }}>{kind === "system" ? t.systemTab : t.customTab}<span style={{ marginLeft: 7, color: c.faint, fontFamily: font.mono, fontSize: 11 }}>{channels[kind].length}</span></button>)}</div>}
    <p style={{ margin: "0 0 16px", color: c.muted, fontSize: 13 }}>{tab === "system" ? t.systemIntro : t.customIntro}</p>
    {loading ? <div style={{ color: c.faint, padding: 36, fontFamily: font.mono }}>...</div> : rows.length === 0 ? <div style={{ padding: 42, textAlign: "center", border: `1px dashed ${c.border}`, color: c.faint, borderRadius: r.radiusMd }}>{t.noCustom}</div> : <div style={{ border: `1px solid ${c.border}`, background: c.panel, borderRadius: r.radiusMd, overflow: "hidden" }}>{rows.map((channel, index) => <div className="llm-channel-row" key={channel.id} style={{ padding: "17px 19px", borderTop: index ? `1px solid ${c.line}` : 0, gap: 18, alignItems: "center" }}>
      <div style={{ minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><StatusDot on={channel.available && channel.enabled} /><strong style={{ color: c.text, fontFamily: font.space, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{channel.name}</strong>{channel.kind === "system" && <span style={{ padding: "2px 6px", border: `1px solid ${c.border}`, color: c.faint, fontFamily: font.mono, fontSize: 9 }}>{t.defaultBadge}</span>}</div><div style={{ marginTop: 5, color: channel.available && channel.enabled ? c.green : c.faint, fontSize: 11.5 }}>{channel.kind === "system" ? (channel.available ? t.available : t.unavailable) : (channel.enabled ? t.enabled : t.disabled)}</div></div>
      <div style={{ minWidth: 0 }}><div style={{ color: c.text2, fontSize: 12.5 }}>{channel.provider.toUpperCase()} · {channel.protocol === "openai" ? "OpenAI-compatible" : "Anthropic"}</div><div title={channel.baseUrl} style={{ marginTop: 4, color: c.faint, fontFamily: font.mono, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{channel.baseUrl}</div><div style={{ marginTop: 5, color: c.muted, fontSize: 11.5 }}>{channel.models.length ? `${channel.models.length} ${t.models.toLowerCase()}` : t.noModels} · {t.lastSync}: {fmt(channel.lastSyncedAt)}</div>{channel.models.length > 0 && <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>{channel.models.slice(0, 4).map((model) => <code key={model} title={model} style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "3px 6px", background: c.panelDeep, color: c.text2, fontSize: 10.5 }}>{model}</code>)}{channel.models.length > 4 && <span style={{ color: c.faint, fontSize: 11 }}>+{channel.models.length - 4}</span>}</div>}</div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}><Btn onClick={() => void sync(channel)} disabled={rowBusy === channel.id || !channel.available} style={{ ...secondaryButton, opacity: rowBusy === channel.id || !channel.available ? .5 : 1 }}>{rowBusy === channel.id ? t.refreshing : t.syncModels}</Btn>{channel.kind === "custom" && <><Btn onClick={() => setEditing(channel)} style={secondaryButton}>{t.edit}</Btn><Btn onClick={() => void toggle(channel)} disabled={rowBusy === channel.id} style={secondaryButton}>{channel.enabled ? t.disable : t.enable}</Btn><Btn onClick={() => setDeleting(channel)} style={{ ...secondaryButton, color: c.red, borderColor: c.redBorder }}>{t.remove}</Btn></>}</div>
    </div>)}</div>}
    {editing && <Modal title={editing === "new" ? t.createTitle : t.editTitle} closeLabel={t.cancel} onClose={() => setEditing(null)}><ChannelEditor initial={editing === "new" ? null : editing} t={t} busy={busy} onCancel={() => setEditing(null)} onSubmit={save} /></Modal>}
    {deleting && <Modal title={t.deleteTitle} closeLabel={t.cancel} onClose={() => setDeleting(null)}><p style={{ margin: "0 0 22px", color: c.text2 }}>{t.deleteConfirm(deleting.name)}</p><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Btn onClick={() => setDeleting(null)} style={secondaryButton}>{t.cancel}</Btn><Btn onClick={() => void remove()} disabled={busy} style={{ ...primaryButton, background: c.red, borderColor: c.red, color: "white" }}>{busy ? t.saving : t.deleteAction}</Btn></div></Modal>}
  </div>;
}
