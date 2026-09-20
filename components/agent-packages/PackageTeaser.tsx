'use client';

import Link from 'next/link';
import { getAgentPackage } from '@/lib/agent-packages/catalog';
import { useApp } from '@/lib/store';
import { packageCopy } from './copy';
import styles from './package.module.css';

export function PackageTeaser({ packageId }: { packageId: string }) {
  const { lang } = useApp();
  const t = packageCopy[lang];
  const definition = getAgentPackage(packageId);
  if (!definition) return null;
  const shared = new Set(['evidence-led-work', 'bounded-orchestration', 'safe-tool-use', 'quality-handoff']);
  const skills = definition.skills.filter((skill) => !shared.has(skill.id));
  const preview = (skills.length ? skills : definition.skills).slice(0, 4);
  return (
    <section className={`${styles.scope} ${styles.teaser}`} aria-labelledby="agent-package-teaser">
      <h2 id="agent-package-teaser">{t.included}</h2><p>{t.capabilityIntro}</p>
      <ul lang="en">{preview.map((skill) => <li key={skill.id}>{skill.name}</li>)}</ul>
      {lang !== 'en' && <p className={styles.help}>{t.contentLanguage}</p>}
      <Link className={styles.textLink} href={`/hire?agent=${encodeURIComponent(packageId)}`}>{t.viewPackage}</Link>
    </section>
  );
}
