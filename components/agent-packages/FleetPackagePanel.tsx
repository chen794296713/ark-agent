'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { AgentPackage, PackageOverlay } from '@/lib/agent-packages/types';
import { useApp } from '@/lib/store';
import { PackageContents, type ConnectionState } from './PackageContents';
import { packageCopy } from './copy';
import styles from './package.module.css';

type PackageResponse = {
  package: {
    packageId: string;
    version: string;
    harness: string;
    ready: boolean;
    deploymentState: string;
    availability: { available: boolean; reason: string | null };
    lastError: string | null;
    skills: { id: string; name: string; state: string }[];
    connections: ConnectionState[];
    definition: AgentPackage;
    overlay: PackageOverlay;
  };
};

class PackageRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function FleetPackagePanel({ agentId, onRefresh }: { agentId: string; onRefresh?: () => void }) {
  const { lang } = useApp();
  const t = packageCopy[lang];
  const [data, setData] = useState<PackageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [legacy, setLegacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [busy, setBusy] = useState<'deploy' | 'download' | 'refresh' | null>(null);
  const actionRef = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/package`, { cache: 'no-store', signal });
    if (response.status === 404) return null;
    const result = await response.json().catch(() => null);
    if (response.status === 401) throw new PackageRequestError(401, t.signInHint);
    if (response.status === 403) throw new PackageRequestError(403, t.forbidden);
    if (!response.ok) throw new PackageRequestError(response.status, typeof result?.error === 'string' ? result.error : t.loadError);
    if (!result?.package?.definition || !Array.isArray(result.package.skills) || !Array.isArray(result.package.connections)) throw new Error(t.loadError);
    return result as PackageResponse;
  }, [agentId, t.forbidden, t.loadError, t.signInHint]);

  const receive = useCallback((result: PackageResponse | null) => {
    setData(result); setLegacy(result === null); setError(null); setNeedsSignIn(false); setLoading(false);
  }, []);

  const reportError = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : t.loadError);
    setNeedsSignIn(cause instanceof PackageRequestError && cause.status === 401);
    setLoading(false);
  }, [t.loadError]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then((result) => {
      if (!controller.signal.aborted) receive(result);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) reportError(cause);
    });
    return () => controller.abort();
  }, [load, receive, reportError]);

  async function refresh() {
    if (actionRef.current) return;
    actionRef.current = true; setBusy('refresh');
    try { receive(await load()); onRefresh?.(); } catch (cause) { reportError(cause); } finally { actionRef.current = false; setBusy(null); }
  }

  async function deploy() {
    if (actionRef.current || !data?.package.availability.available || data.package.ready) return;
    actionRef.current = true; setBusy('deploy'); setError(null); setNeedsSignIn(false);
    try {
      const response = await fetch(`/api/agent-packages/${encodeURIComponent(agentId)}/deploy`, { method: 'POST' });
      const result = await response.json().catch(() => null);
      if (response.status === 401) throw new PackageRequestError(401, t.signInHint);
      if (response.status === 403) throw new PackageRequestError(403, t.forbidden);
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : t.deployError);
      receive(await load()); onRefresh?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.deployError);
      setNeedsSignIn(cause instanceof PackageRequestError && cause.status === 401);
    } finally { actionRef.current = false; setBusy(null); }
  }

  async function download() {
    if (actionRef.current || !data) return;
    actionRef.current = true; setBusy('download'); setError(null); setNeedsSignIn(false);
    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/package?download=1`, { cache: 'no-store' });
      if (response.status === 401) throw new PackageRequestError(401, t.signInHint);
      if (response.status === 403) throw new PackageRequestError(403, t.forbidden);
      if (!response.ok) throw new Error(t.downloadError);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${data.package.packageId}-${data.package.version}.json`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.downloadError);
      setNeedsSignIn(cause instanceof PackageRequestError && cause.status === 401);
    } finally { actionRef.current = false; setBusy(null); }
  }

  if (legacy) return null;
  if (loading) return <div className={`${styles.scope} ${styles.panel}`} role="status"><p className={styles.help}>{t.loading}</p></div>;

  const entry = data?.package;
  const installed = entry?.skills.filter((skill) => skill.state === 'installed').length ?? 0;
  const pendingConnections = entry?.connections.filter((connection) => connection.required && connection.state !== 'connected') ?? [];
  const stateLabel = entry?.ready ? t.ready : entry?.deploymentState === 'deploying' ? t.deploying : entry?.deploymentState === 'failed' ? t.failed : t.saved;

  return (
    <section className={`${styles.scope} ${styles.panel}`} aria-labelledby="fleet-package-title" aria-busy={busy !== null}>
      <div className={styles.panelHeader}><h2 id="fleet-package-title">{t.package}</h2>{entry && <span className={styles.status} role="status">{stateLabel}</span>}</div>
      {entry && <>
        <p className={styles.panelIntro}>{entry.ready ? t.readyHint : entry.deploymentState === 'deploying' ? t.pendingHint : t.savedHint}</p>
        <dl className={styles.metadata}><div><dt>{t.version}</dt><dd>{entry.version}</dd></div><div><dt>{t.harness}</dt><dd>{{ openclaw: 'OpenClaw', hermes: 'Hermes', codex: 'Codex' }[entry.harness] ?? entry.harness}</dd></div><div><dt>{entry.ready ? t.installed : t.configured}</dt><dd>{entry.ready ? `${installed} / ${entry.skills.length}` : entry.skills.length}</dd></div></dl>
        {pendingConnections.length > 0 && <div className={styles.notice}><strong>{t.required} · {t.connections}</strong><ul className={styles.outputList}>{pendingConnections.map((connection) => <li key={connection.id}><span lang="en">{connection.name}</span> — {t[connection.state]}</li>)}</ul><p className={styles.help}>{t.connectionHint}</p></div>}
        {!entry.ready && !entry.availability.available && <p className={styles.notice}>{entry.availability.reason === 'package_harness_unsupported' ? t.unsupported : t.unavailable}</p>}
        {entry.lastError && !error && <p className={styles.notice}>{t.deployError}</p>}
      </>}
      {error && <div className={styles.error} role="alert"><p>{error}</p>{needsSignIn && <Link className={styles.textLink} href="/auth" target="_blank" rel="noopener noreferrer">{t.signIn}</Link>}</div>}
      <div className={styles.actions}>
        {entry && !entry.ready && entry.availability.available && <button type="button" className={styles.primary} disabled={busy !== null} onClick={deploy}>{busy === 'deploy' ? t.deployingAction : t.deploy}</button>}
        {entry && <button type="button" className={styles.secondary} disabled={busy !== null} onClick={download}>{busy === 'download' ? t.downloading : t.download}</button>}
        <button type="button" className={styles.secondary} disabled={busy !== null} onClick={refresh}>{entry ? t.refresh : t.retry}</button>
      </div>
      {entry && <div className={styles.panelContents}><PackageContents definition={entry.definition} connections={entry.connections} /></div>}
    </section>
  );
}
