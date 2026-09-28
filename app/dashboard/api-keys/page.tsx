"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  ApiError,
  type ApiKeyDTO,
  type ApiKeyPermission,
} from "@/lib/client-api";
import { useApp } from "@/lib/store";
import { BCP47 } from "@/lib/i18n";
import { apiKeysCopy } from "@/lib/i18n/api-keys";
import styles from "./api-keys.module.css";

function dateTime(value: string | null, locale: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(locale, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function toIso(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function ApiKeysPage() {
  const { lang } = useApp();
  const t = apiKeysCopy[lang];
  const locale = BCP47[lang];
  const [keys, setKeys] = useState<ApiKeyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<ApiKeyPermission[]>(["read", "write"]);
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.apiKeys()
      .then(({ apiKeys }) => { if (alive) setKeys(apiKeys); })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof ApiError ? err.message : t.loadError);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [t.loadError]);

  function toggle(permission: ApiKeyPermission) {
    setPermissions((current) => current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission]);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!permissions.length) {
      setFormError(t.permissionRequired);
      return;
    }
    const expiration = toIso(expiresAt);
    if (expiresAt && (!expiration || new Date(expiration).getTime() <= Date.now())) {
      setFormError(t.expirationFuture);
      return;
    }
    setBusy(true);
    try {
      const { apiKey } = await api.createApiKey({ name: name.trim(), permissions, expiresAt: expiration });
      setKeys((current) => [apiKey, ...current]);
      setName("");
      setPermissions(["read", "write"]);
      setExpiresAt("");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t.createError);
    } finally {
      setBusy(false);
    }
  }

  async function copy(item: ApiKeyDTO) {
    try {
      await navigator.clipboard.writeText(item.key);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId((current) => current === item.id ? null : current), 1800);
    } catch {
      setError(t.loadError);
    }
  }

  async function remove(item: ApiKeyDTO) {
    if (!window.confirm(t.deleteConfirm(item.name))) return;
    setDeletingId(item.id);
    setError(null);
    try {
      await api.deleteApiKey(item.id);
      setKeys((current) => current.filter((key) => key.id !== item.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.deleteError);
    } finally {
      setDeletingId(null);
    }
  }

  return <div className={styles.page} data-screen-label="API keys">
    <header className={styles.header}>
      <h1>{t.heading}</h1>
      <p>{t.intro}</p>
    </header>

    <div className={styles.layout}>
      <section className={styles.formPanel} aria-labelledby="create-api-key-title">
        <div className={styles.sectionHeading}>
          <h2 id="create-api-key-title">{t.formTitle}</h2>
        </div>
        <form className={styles.form} onSubmit={(event) => void create(event)}>
          <div className={styles.field}>
            <label htmlFor="api-key-name">{t.name}</label>
            <input id="api-key-name" maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} placeholder={t.namePlaceholder} />
          </div>

          <fieldset className={styles.fieldset}>
            <legend>{t.permissions}</legend>
            <label className={styles.permissionCard}>
              <input type="checkbox" checked={permissions.includes("read")} onChange={() => toggle("read")} />
              <span><strong>{t.read}</strong><small>{t.readHelp}</small></span>
            </label>
            <label className={styles.permissionCard}>
              <input type="checkbox" checked={permissions.includes("write")} onChange={() => toggle("write")} />
              <span><strong>{t.write}</strong><small>{t.writeHelp}</small></span>
            </label>
          </fieldset>

          <div className={styles.field}>
            <label htmlFor="api-key-expires">{t.expires}</label>
            <input id="api-key-expires" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            <small>{expiresAt ? t.expiresHelp : t.never}</small>
          </div>

          <div className={styles.usage}>
            <strong>{t.apiUsage}</strong>
            <span>{t.apiUsageHelp}</span>
            <code>Authorization: Bearer ark_live_…</code>
          </div>

          {formError && <div className={styles.error} role="alert">{formError}</div>}
          <button className={styles.primary} disabled={busy || !name.trim() || !permissions.length} type="submit">
            {busy ? t.creating : t.create}
          </button>
        </form>
      </section>

      <section className={styles.listPanel} aria-labelledby="api-key-list-title">
        <div className={styles.sectionHeading}>
          <h2 id="api-key-list-title">{t.listTitle}</h2>
          <p>{t.listIntro}</p>
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        {loading ? <div className={styles.state}>…</div> : keys.length === 0 ? <div className={styles.state}>{t.empty}</div> : <div className={styles.keyList}>
          {keys.map((item) => {
            const expired = item.expired;
            return <article className={styles.keyCard} key={item.id}>
              <div className={styles.keyHeader}>
                <div>
                  <h3>{item.name}</h3>
                  <div className={styles.badges}>
                    {item.permissions.map((permission) => <span key={permission}>{permission === "read" ? t.read : t.write}</span>)}
                    <span className={expired ? styles.expired : styles.active}>{expired ? t.expired : t.active}</span>
                  </div>
                </div>
                <button className={styles.danger} disabled={deletingId === item.id} onClick={() => void remove(item)} type="button">{t.remove}</button>
              </div>
              <div className={styles.keyValue}>
                <code>{item.key}</code>
                <button type="button" onClick={() => void copy(item)}>{copiedId === item.id ? t.copied : t.copy}</button>
              </div>
              <dl className={styles.meta}>
                <div><dt>{t.created}</dt><dd>{dateTime(item.createdAt, locale)}</dd></div>
                <div><dt>{t.expires}</dt><dd>{item.expiresAt ? dateTime(item.expiresAt, locale) : t.never}</dd></div>
                <div><dt>{t.lastUsed}</dt><dd>{dateTime(item.lastUsedAt, locale)}</dd></div>
              </dl>
            </article>;
          })}
        </div>}
      </section>
    </div>
  </div>;
}
