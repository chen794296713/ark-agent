"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type LlmChannelDTO } from "@/lib/client-api";
import { useApp } from "@/lib/store";
import { llmChannelsCopy } from "@/lib/i18n/llm-channels";
import { WorkspaceIcon } from "@/components/WorkspaceIcon";
import styles from "./llm-channels.module.css";

type Draft = { name: string; baseUrl: string; apiKey: string; models: string };
const EMPTY_DRAFT: Draft = { name: "", baseUrl: "", apiKey: "", models: "" };

export default function LlmChannelsPage() {
  const { lang } = useApp();
  const t = llmChannelsCopy[lang];
  const [channels, setChannels] = useState<LlmChannelDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LlmChannelDTO | null | undefined>(undefined);
  const [viewing, setViewing] = useState<LlmChannelDTO | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setChannels((await api.llmChannels()).channels); }
    catch (err) { setError(err instanceof ApiError ? err.message : t.loadError); }
    finally { setLoading(false); }
  }, [t.loadError]);

  useEffect(() => {
    let alive = true;
    api.llmChannels()
      .then(({ channels: available }) => { if (alive) setChannels(available); })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof ApiError ? err.message : t.loadError);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [t.loadError]);

  function openCreate() {
    setEditing(null); setDraft(EMPTY_DRAFT); setFormError(null); setFetchMessage(null);
  }
  function openEdit(channel: LlmChannelDTO) {
    setEditing(channel);
    setDraft({ name: channel.name, baseUrl: channel.baseUrl, apiKey: channel.apiKey, models: channel.models.join("\n") });
    setFormError(null); setFetchMessage(null);
  }
  function closeModal() { if (!busy && !fetching) setEditing(undefined); }
  function closeDetails() { setViewing(null); }
  function modelIds() {
    return Array.from(new Set(draft.models.split(/[\n,]/).map((model) => model.trim()).filter(Boolean)));
  }

  async function fetchModels() {
    setFetching(true); setFormError(null); setFetchMessage(null);
    try {
      const result = await api.discoverLlmModels({
        ...(editing ? { channelId: editing.id } : {}), baseUrl: draft.baseUrl, apiKey: draft.apiKey === "••••••••" ? undefined : draft.apiKey,
      });
      setDraft((current) => ({ ...current, models: result.models.join("\n") }));
      setFetchMessage(t.fetchedModels(result.models.length));
    } catch (err) { setFormError(err instanceof ApiError ? err.message : t.loadError); }
    finally { setFetching(false); }
  }

  async function save() {
    const models = modelIds();
    if (!draft.name.trim() || !draft.baseUrl.trim() || !draft.apiKey.trim() || !models.length) return;
    setBusy(true); setFormError(null);
    try {
      const body = { name: draft.name.trim(), baseUrl: draft.baseUrl.trim(), apiKey: draft.apiKey, models };
      const { channel } = editing ? await api.updateLlmChannel(editing.id, body) : await api.createLlmChannel(body);
      setChannels((current) => editing
        ? current.map((item) => item.id === channel.id ? channel : item)
        : [channel, ...current]);
      setEditing(undefined);
    } catch (err) { setFormError(err instanceof ApiError ? err.message : t.loadError); }
    finally { setBusy(false); }
  }

  async function remove(channel: LlmChannelDTO) {
    if (!window.confirm(t.deleteConfirm(channel.name))) return;
    try { await api.deleteLlmChannel(channel.id); setChannels((current) => current.filter((item) => item.id !== channel.id)); }
    catch (err) { setError(err instanceof ApiError ? err.message : t.loadError); }
  }

  const customCount = channels.filter((channel) => channel.kind === "custom").length;
  const modalOpen = editing !== undefined;
  return <div className={styles.page} data-screen-label="LLM channels">
    <div className={styles.header}>
      <div><h1>{t.heading}</h1><p>{t.intro}</p></div>
      <button type="button" className={styles.primary} onClick={openCreate}><WorkspaceIcon name="plus" size={17} />{t.add}</button>
    </div>
    {loading ? <div className={styles.state}>{t.loading}</div> : error ? <div className={styles.state}>{error}<div style={{ marginTop: 16 }}><button className={styles.secondary} onClick={() => void load()}>{t.retry}</button></div></div> : <>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>{t.name}</th><th>{t.type}</th><th>{t.endpoint}</th><th>{t.models}</th><th>{t.status}</th><th>{t.actions}</th></tr></thead>
        <tbody>{channels.map((channel) => <tr key={channel.id}>
          <td><span className={styles.channelName}>{channel.name}</span></td>
          <td><span className={`${styles.badge} ${channel.kind === "custom" ? styles.badgeCustom : ""}`}>{channel.kind === "custom" ? t.custom : t.system}</span></td>
          <td><div className={styles.endpoint} title={channel.baseUrl}>{channel.baseUrl}</div></td>
          <td>{t.modelCount(channel.models.length)}</td>
          <td><span className={`${styles.status} ${channel.configured ? "" : styles.statusOff}`}>{channel.configured ? t.ready : t.unavailable}</span></td>
          <td>{channel.kind === "custom" ? <><button className={styles.textButton} onClick={() => openEdit(channel)}>{t.edit}</button><button className={styles.danger} onClick={() => void remove(channel)}>{t.remove}</button></> : <button className={styles.textButton} onClick={() => setViewing(channel)}>{t.view}</button>}</td>
        </tr>)}</tbody>
      </table></div>
      {customCount === 0 && <p className={styles.empty}>{t.empty}</p>}
    </>}
    {modalOpen && <div className={styles.scrim} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="llm-channel-title">
        <div className={styles.modalHeader}><h2 id="llm-channel-title">{editing ? t.editTitle : t.addTitle}</h2><button className={styles.close} onClick={closeModal} aria-label={t.cancel}>×</button></div>
        <div className={styles.form}>
          <div className={styles.field}><label htmlFor="llm-name">{t.channelName}</label><input id="llm-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={t.channelNamePlaceholder} /></div>
          <div className={styles.field}><label htmlFor="llm-url">{t.baseUrl}</label><input id="llm-url" type="url" value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" /></div>
          <div className={styles.field}><label htmlFor="llm-key">{t.apiKey}</label><input id="llm-key" type="password" value={draft.apiKey} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} placeholder={t.apiKeyPlaceholder} autoComplete="new-password" />{editing && <p className={styles.hint}>{t.apiKeyKeep}</p>}</div>
          <div className={styles.field}><label htmlFor="llm-models">{t.modelList}</label><textarea id="llm-models" value={draft.models} onChange={(event) => setDraft({ ...draft, models: event.target.value })} placeholder={t.modelListPlaceholder} /><p className={styles.hint}>{t.modelHelp}</p></div>
          <div className={styles.modelActions}><button className={styles.secondary} type="button" disabled={fetching || !draft.baseUrl.trim() || !draft.apiKey.trim()} onClick={() => void fetchModels()}>{fetching ? t.fetchingModels : t.fetchModels}</button>{fetchMessage && <span className={styles.success}>{fetchMessage}</span>}</div>
          {formError && <div className={styles.error} role="alert">{formError}</div>}
          <div className={styles.modalActions}><button className={styles.secondary} type="button" onClick={closeModal}>{t.cancel}</button><button className={styles.primary} type="button" disabled={busy || !draft.name.trim() || !draft.baseUrl.trim() || !draft.apiKey.trim() || !modelIds().length} onClick={() => void save()}>{busy ? t.saving : t.save}</button></div>
        </div>
      </div>
    </div>}
    {viewing && <div className={styles.scrim} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetails(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="llm-channel-details-title">
        <div className={styles.modalHeader}><h2 id="llm-channel-details-title">{viewing.name}</h2><button className={styles.close} onClick={closeDetails} aria-label={t.close}>×</button></div>
        <div className={styles.details}>
          <div className={styles.detailGrid}>
            <div><span>{t.type}</span><strong>{t.system}</strong></div>
            <div><span>{t.status}</span><strong>{viewing.configured ? t.ready : t.unavailable}</strong></div>
            <div className={styles.detailWide}><span>{t.endpoint}</span><code>{viewing.baseUrl}</code></div>
            <div><span>{t.apiKey}</span><strong>{viewing.configured ? t.keyConfigured : t.keyNotConfigured}</strong></div>
          </div>
          <div className={styles.detailModels}><div className={styles.detailLabel}>{t.configInfo} · {t.models}</div><div className={styles.modelList}>{viewing.models.map((model) => <code key={model}>{model}</code>)}</div></div>
          <div className={styles.modalActions}><button className={styles.secondary} type="button" onClick={closeDetails}>{t.close}</button></div>
        </div>
      </div>
    </div>}
  </div>;
}
