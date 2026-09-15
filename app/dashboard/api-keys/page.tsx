"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Btn } from "@/components/ui";
import { api, type ApiKeyDTO } from "@/lib/client-api";
import { apiKeysText, type ApiKeysDict } from "@/lib/i18n/api-keys";
import { BCP47 } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { c, font, r } from "@/lib/theme";

const input: CSSProperties = { width: "100%", minWidth: 0, boxSizing: "border-box", border: `1px solid ${c.border}`, background: c.panelDeep, color: c.text, padding: "11px 12px", fontSize: 14, outline: "none", borderRadius: r.radiusSm };
const label: CSSProperties = { display: "block", marginBottom: 7, color: c.muted, fontFamily: font.mono, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" };
const primary: CSSProperties = { border: `1px solid ${c.accent}`, background: c.accent, color: c.ink, padding: "9px 14px", fontWeight: 650, cursor: "pointer", borderRadius: r.radiusSm };
const secondary: CSSProperties = { border: `1px solid ${c.border}`, background: "transparent", color: c.text2, padding: "7px 10px", cursor: "pointer", borderRadius: r.radiusSm, fontSize: 12 };
const th: CSSProperties = { padding: "11px 14px", textAlign: "left", color: c.faint, fontFamily: font.mono, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", borderBottom: `1px solid ${c.border}`, whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "14px", borderBottom: `1px solid ${c.line}`, verticalAlign: "middle", color: c.text2, fontSize: 13 };

function localInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function loadSessionSecrets(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const saved = JSON.parse(sessionStorage.getItem("ark_api_key_secrets") ?? "{}");
    if (!saved || typeof saved !== "object") return {};
    return Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch { return {}; }
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => event.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = prior; document.removeEventListener("keydown", keydown); };
  }, []);
  return (
    <div role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", padding: 16, background: c.scrim }}>
      <section role="dialog" aria-modal="true" aria-label={title} style={{ width: "min(520px, 100%)", maxHeight: "min(760px, 92vh)", overflowY: "auto", background: c.panel, border: `1px solid ${c.borderStrong}`, borderRadius: r.radiusMd, boxShadow: `0 24px 70px ${c.shadow}` }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "17px 20px", borderBottom: `1px solid ${c.line}` }}>
          <h2 style={{ margin: 0, fontFamily: font.space, fontSize: 18 }}>{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={titledClose(title)} style={{ border: 0, background: "transparent", color: c.muted, fontSize: 22, cursor: "pointer" }}>×</button>
        </header>
        <div style={{ padding: 20 }}>{children}</div>
      </section>
    </div>
  );
}

function titledClose(title: string) { return `Close ${title}`; }

type KeyFormData = { name: string; description: string | null; expiresAt: string | null };

function KeyForm({ initial, busy, t, onSubmit, onCancel }: { initial?: ApiKeyDTO; busy: boolean; t: ApiKeysDict; onSubmit: (data: KeyFormData) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [expiresAt, setExpiresAt] = useState(localInputValue(initial?.expiresAt ?? null));
  const [mountedAt] = useState(() => Date.now());
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ name, description: description || null, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null });
  }
  return (
    <form onSubmit={submit}>
      <label style={label} htmlFor="key-name">{t.name}</label>
      <input id="key-name" autoFocus required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePlaceholder} style={input} />
      <label style={{ ...label, marginTop: 16 }} htmlFor="key-description">{t.description}</label>
      <textarea id="key-description" maxLength={500} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t.descriptionPlaceholder} style={{ ...input, resize: "vertical" }} />
      <label style={{ ...label, marginTop: 16 }} htmlFor="key-expiry">{t.expiration}</label>
      <input id="key-expiry" type="datetime-local" min={localInputValue(new Date(mountedAt + 60_000).toISOString())} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} style={input} />
      <div style={{ marginTop: 6, color: c.faint, fontSize: 12 }}>{t.optional}</div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22 }}>
        <Btn type="button" onClick={onCancel} style={secondary}>{t.cancel}</Btn>
        <Btn type="submit" disabled={busy || !name.trim()} style={{ ...primary, opacity: busy || !name.trim() ? .55 : 1 }}>{busy ? (initial ? t.saving : t.creating) : (initial ? t.save : t.create)}</Btn>
      </div>
    </form>
  );
}

export default function ApiKeysPage() {
  const { lang } = useApp();
  const t = apiKeysText[lang];
  const locale = BCP47[lang];
  const [keys, setKeys] = useState<ApiKeyDTO[]>([]);
  const [secrets, setSecrets] = useState<Record<string, string>>(loadSessionSecrets);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ApiKeyDTO | null>(null);
  const [created, setCreated] = useState<ApiKeyDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [renderNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api.apiKeys().then(({ apiKeys }) => !cancelled && setKeys(apiKeys)).catch(() => !cancelled && setError(t.loadError)).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [t.loadError]);

  const fmt = (iso: string) => new Date(iso).toLocaleString(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  async function createKey(data: KeyFormData) {
    setBusy(true); setError(null);
    try {
      const result = await api.createApiKey(data);
      setKeys((current) => [result.apiKey, ...current]);
      setSecrets((current) => {
        const next = { ...current, [result.apiKey.id]: result.key };
        sessionStorage.setItem("ark_api_key_secrets", JSON.stringify(next));
        return next;
      });
      setCreateOpen(false); setCreated(result.apiKey);
    } catch { setError(t.createError); } finally { setBusy(false); }
  }

  async function editKey(data: KeyFormData) {
    if (!editing) return;
    setBusy(true); setError(null);
    try {
      const { apiKey } = await api.updateApiKey(editing.id, data);
      setKeys((current) => current.map((key) => key.id === apiKey.id ? apiKey : key)); setEditing(null);
    } catch { setError(t.updateError); } finally { setBusy(false); }
  }

  async function toggle(key: ApiKeyDTO) {
    setRowBusy(key.id); setError(null);
    try {
      const { apiKey } = await api.updateApiKey(key.id, { enabled: !!key.disabledAt });
      setKeys((current) => current.map((item) => item.id === apiKey.id ? apiKey : item));
    } catch { setError(t.statusError); } finally { setRowBusy(null); }
  }

  async function deleteKey() {
    if (!deleteTarget) return;
    setBusy(true); setError(null);
    try {
      await api.deleteApiKey(deleteTarget.id);
      setKeys((current) => current.filter((key) => key.id !== deleteTarget.id));
      setSecrets((current) => {
        const next = { ...current }; delete next[deleteTarget.id];
        sessionStorage.setItem("ark_api_key_secrets", JSON.stringify(next));
        return next;
      });
      setDeleteTarget(null);
    } catch { setError(t.deleteError); } finally { setBusy(false); }
  }

  async function copy(key: ApiKeyDTO) {
    const secret = secrets[key.id];
    if (!secret) return;
    await navigator.clipboard.writeText(secret); setCopiedId(key.id);
    window.setTimeout(() => setCopiedId((id) => id === key.id ? null : id), 1600);
  }

  return (
    <div data-screen-label="API keys" style={{ padding: `${r.contentPy} ${r.pagePx}` }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div><h1 style={{ margin: 0, fontFamily: font.space, fontSize: 28 }}>{t.title}</h1><p style={{ margin: "7px 0 0", color: c.muted }}>{t.subtitle}</p></div>
        <Btn onClick={() => setCreateOpen(true)} style={primary}>{t.add}</Btn>
      </header>
      {error && <div role="alert" style={{ marginBottom: 16, padding: "10px 12px", color: c.red, background: c.redWash, border: `1px solid ${c.redBorder}`, borderRadius: r.radiusSm }}>{error}</div>}
      <section style={{ background: c.panel, border: `1px solid ${c.border}`, borderRadius: r.radiusMd, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 920, borderCollapse: "collapse" }}>
            <thead style={{ background: c.panelDeep }}><tr><th style={th}>{t.name}</th><th style={th}>{t.key}</th><th style={th}>{t.description}</th><th style={th}>{t.status}</th><th style={th}>{t.expiration}</th><th style={th}>{t.lastUsed}</th><th style={th}>{t.actions}</th></tr></thead>
            <tbody>
              {!loading && keys.map((key) => {
                const expired = !!key.expiresAt && new Date(key.expiresAt).getTime() <= renderNow;
                const inactive = !!key.disabledAt || expired;
                const status = key.disabledAt ? t.disabled : expired ? t.expired : t.active;
                return <tr key={key.id}>
                  <td style={td}><div style={{ fontWeight: 650, color: c.text }}>{key.name}</div><div style={{ color: c.faint, fontSize: 11, marginTop: 3 }}>{fmt(key.createdAt)}</div></td>
                  <td style={td}><code style={{ color: c.accent, whiteSpace: "nowrap" }}>{key.tokenPrefix}••••••••</code></td>
                  <td style={{ ...td, maxWidth: 230 }}><span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={key.description ?? ""}>{key.description || "—"}</span></td>
                  <td style={td}><span style={{ color: inactive ? c.red : c.green, border: `1px solid ${inactive ? c.redBorder : c.greenBorder}`, background: inactive ? c.redWash : c.greenWash, borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap", fontSize: 11 }}>{status}</span></td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{key.expiresAt ? fmt(key.expiresAt) : t.never}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{key.lastUsedAt ? fmt(key.lastUsedAt) : t.neverUsed}</td>
                  <td style={td}><div style={{ display: "flex", gap: 6, whiteSpace: "nowrap" }}>
                    <Btn onClick={() => void copy(key)} disabled={!secrets[key.id]} title={!secrets[key.id] ? t.copyUnavailable : undefined} style={{ ...secondary, opacity: secrets[key.id] ? 1 : .45 }}>{copiedId === key.id ? t.copied : t.copy}</Btn>
                    <Btn onClick={() => setEditing(key)} style={secondary}>{t.edit}</Btn>
                    <Btn onClick={() => void toggle(key)} disabled={rowBusy === key.id || expired} style={secondary}>{key.disabledAt ? t.enable : t.disable}</Btn>
                    <Btn onClick={() => setDeleteTarget(key)} style={{ ...secondary, color: c.red, borderColor: c.redBorder }}>{t.delete}</Btn>
                  </div></td>
                </tr>;
              })}
            </tbody>
          </table>
          {loading && <div style={{ padding: 36, textAlign: "center", color: c.faint }}>…</div>}
          {!loading && keys.length === 0 && <div style={{ padding: 42, textAlign: "center", color: c.faint }}>{t.empty}</div>}
        </div>
      </section>

      {createOpen && <Modal title={t.createTitle} onClose={() => setCreateOpen(false)}><KeyForm busy={busy} t={t} onSubmit={createKey} onCancel={() => setCreateOpen(false)} /></Modal>}
      {editing && <Modal title={t.editTitle} onClose={() => setEditing(null)}><KeyForm initial={editing} busy={busy} t={t} onSubmit={editKey} onCancel={() => setEditing(null)} /></Modal>}
      {created && <Modal title={t.newKeyTitle} onClose={() => setCreated(null)}><p style={{ margin: "0 0 14px", color: c.text2 }}>{t.newKeyBody}</p><code style={{ display: "block", overflowWrap: "anywhere", padding: 12, border: `1px solid ${c.greenBorder}`, background: c.greenWash, color: c.text, borderRadius: r.radiusSm }}>{secrets[created.id]}</code><p style={{ color: c.faint, fontSize: 12 }}>{t.usage}</p><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Btn onClick={() => void copy(created)} style={secondary}>{copiedId === created.id ? t.copied : t.copy}</Btn><Btn onClick={() => setCreated(null)} style={primary}>{t.done}</Btn></div></Modal>}
      {deleteTarget && <Modal title={t.deleteTitle} onClose={() => setDeleteTarget(null)}><p style={{ margin: "0 0 22px", color: c.text2 }}>{t.deleteConfirm(deleteTarget.name)}</p><div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Btn onClick={() => setDeleteTarget(null)} style={secondary}>{t.cancel}</Btn><Btn onClick={() => void deleteKey()} disabled={busy} style={{ ...primary, color: "white", background: c.red, borderColor: c.red }}>{busy ? t.deleting : t.delete}</Btn></div></Modal>}
    </div>
  );
}
