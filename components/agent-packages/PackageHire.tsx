'use client';

import { useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AgentPackage, PackageOverlay } from '@/lib/agent-packages/types';
import type { AgentCatalogEntry } from '@/lib/agent-catalog';
import { useApp } from '@/lib/store';
import { Brand } from '@/components/Brand';
import { PackageContents } from './PackageContents';
import { packageCopy } from './copy';
import styles from './package.module.css';
import hireStyles from '@/app/hire/hire.module.css';

export function PackageHire({ definition, agent }: { definition: AgentPackage; agent: AgentCatalogEntry }) {
  const { lang } = useApp();
  const t = packageCopy[lang];
  const router = useRouter();
  const [overlay, setOverlay] = useState<PackageOverlay>(() => ({ name: agent.copy[lang].name, organization: '', goals: '', instructions: '', tone: 'professional', harness: 'openclaw' }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const requestRef = useRef<{ body: string; key: string } | null>(null);
  const submitting = useRef(false);

  function update<K extends keyof PackageOverlay>(key: K, value: PackageOverlay[K]) {
    setOverlay((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true); setError(null); setNeedsSignIn(false);
    try {
      const body = JSON.stringify({ packageId: definition.id, overlay: { ...overlay, name: overlay.name.trim() } });
      if (requestRef.current?.body !== body) requestRef.current = { body, key: crypto.randomUUID() };
      const response = await fetch('/api/agent-packages/configure', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestRef.current.key }, body });
      const data = await response.json().catch(() => null);
      if (response.status === 401) { setNeedsSignIn(true); throw new Error(t.signInHint); }
      if (response.status === 403) throw new Error(t.forbidden);
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : t.saveError);
      if (typeof data?.agent?.id !== 'string') throw new Error(t.saveError);
      router.push(`/dashboard/fleet/${encodeURIComponent(data.agent.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.saveError);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <div className={`${hireStyles.page} ${styles.scope}`}>
      <header className={hireStyles.header}><Brand /><Link className={hireStyles.directoryLink} href="/#agents">{t.directory}</Link></header>
      <main className={styles.main}>
        <div className={styles.hero}>
          <figure className={styles.portraitFrame}><Image className={styles.portrait} src={agent.image} width={104} height={130} alt="" preload /><figcaption>{t.illustration}</figcaption></figure>
          <div><h1>{agent.copy[lang].name}</h1><p>{t.introduction}</p></div>
        </div>
        <div className={styles.setupGrid}>
          <section aria-labelledby="package-customize"><h2 id="package-customize" className={styles.sectionTitle}>{t.customize}</h2>
            <form className={styles.form} onSubmit={save} aria-busy={saving}>
              <div className={styles.field}><label htmlFor="package-name">{t.name}</label><input id="package-name" required maxLength={80} value={overlay.name} onChange={(event) => update('name', event.target.value)} disabled={saving} /></div>
              <div className={styles.field}><label htmlFor="package-organization">{t.organization}</label><input id="package-organization" maxLength={500} value={overlay.organization} onChange={(event) => update('organization', event.target.value)} aria-describedby="package-organization-help" disabled={saving} /><p id="package-organization-help">{t.organizationHint}</p></div>
              <div className={styles.field}><label htmlFor="package-goals">{t.goals}</label><textarea id="package-goals" rows={3} maxLength={4000} value={overlay.goals} onChange={(event) => update('goals', event.target.value)} aria-describedby="package-goals-help" disabled={saving} /><p id="package-goals-help">{t.goalsHint}</p></div>
              <div className={styles.fieldPair}>
                <div className={styles.field}><label htmlFor="package-tone">{t.tone}</label><select id="package-tone" value={overlay.tone} onChange={(event) => update('tone', event.target.value as PackageOverlay['tone'])} disabled={saving}><option value="professional">{t.professional}</option><option value="warm">{t.warm}</option><option value="concise">{t.concise}</option></select></div>
                <div className={styles.field}><label htmlFor="package-harness">{t.harness}</label><select id="package-harness" value={overlay.harness} onChange={(event) => update('harness', event.target.value as PackageOverlay['harness'])} aria-describedby="package-harness-help" disabled={saving}><option value="openclaw">OpenClaw</option><option value="hermes">Hermes</option><option value="codex">Codex</option></select></div>
              </div>
              <p id="package-harness-help" className={styles.help}>{t.harnessHint}</p>
              <div className={styles.field}><label htmlFor="package-instructions">{t.instructions}</label><textarea id="package-instructions" rows={3} maxLength={8000} value={overlay.instructions} onChange={(event) => update('instructions', event.target.value)} aria-describedby="package-instructions-help" disabled={saving} /><p id="package-instructions-help">{t.instructionsHint}</p></div>
              {error && <div className={styles.error} role="alert"><p>{error}</p>{needsSignIn && <Link href="/auth" target="_blank" rel="noopener noreferrer" className={styles.textLink}>{t.signIn}</Link>}</div>}
              <div className={styles.formActions}><button type="submit" className={styles.primary} disabled={saving || !overlay.name.trim()}>{saving ? t.saving : t.save}</button><p className={styles.help}>{t.noCharge}</p></div>
            </form>
          </section>
          <aside aria-labelledby="package-included"><h2 id="package-included" className={styles.sectionTitle}>{t.included}</h2><p className={styles.help} lang="en" style={{ marginBottom: 20 }}>{definition.outcome}</p><PackageContents definition={definition} /></aside>
        </div>
      </main>
    </div>
  );
}
