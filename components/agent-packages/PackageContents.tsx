'use client';

import type { AgentPackage, PackageConnector } from '@/lib/agent-packages/types';
import { useApp } from '@/lib/store';
import { packageCopy } from './copy';
import styles from './package.module.css';

export type ConnectionState = PackageConnector & { state: 'connected' | 'missing' | 'unverified' };

export function PackageContents({ definition, connections }: { definition: AgentPackage; connections?: ConnectionState[] }) {
  const { lang } = useApp();
  const t = packageCopy[lang];
  return (
    <div className={`${styles.scope} ${styles.contents}`}>
      {lang !== 'en' && <p className={styles.help}>{t.contentLanguage}</p>}
      <details className={styles.disclosure}>
        <summary><span>{t.skills}</span><span className={styles.count}>{definition.skills.length}</span></summary>
        <ul className={styles.list} lang="en">
          {definition.skills.map((skill) => (
            <li key={skill.id}>
              <h4>{skill.name}</h4><p>{skill.description}</p>
              <details className={styles.method}>
                <summary lang={lang}>{t.method}</summary>
                <ol>{skill.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol>
                <strong className={styles.subheading} lang={lang}>{t.outputs}</strong>
                <ul className={styles.outputList}>{skill.outputs.map((output) => <li key={output}>{output}</li>)}</ul>
                <strong className={styles.subheading} lang={lang}>{t.checks}</strong>
                <ul className={styles.outputList}>{skill.checks.map((check) => <li key={check}>{check}</li>)}</ul>
              </details>
            </li>
          ))}
        </ul>
      </details>
      <details className={styles.disclosure}>
        <summary><span>{t.workers}</span><span className={styles.count}>{definition.workers.length}</span></summary>
        <ul className={styles.list} lang="en">{definition.workers.map((worker) => <li key={worker.id}><h4>{worker.name}</h4><p>{worker.mission}</p><strong className={styles.subheading} lang={lang}>{t.handoff}</strong><p>{worker.handoff}</p></li>)}</ul>
      </details>
      <details className={styles.disclosure}>
        <summary><span>{t.connections}</span><span className={styles.count}>{definition.connectors.length}</span></summary>
        <p className={styles.help}>{t.connectionHint}</p>
        <ul className={styles.list}>{definition.connectors.map((connector) => {
          const state = connections?.find((connection) => connection.id === connector.id)?.state;
          return <li key={connector.id}><div className={styles.connectionHeading}><h4 lang="en">{connector.name}</h4><span>{connector.required ? t.required : t.optional}</span></div><p lang="en">{connector.purpose}</p>{state && <span className={styles.connectionState}>{t[state]}</span>}<p lang="en">{connector.setup}</p></li>;
        })}</ul>
      </details>
      <details className={styles.disclosure}>
        <summary><span>{t.workflows}</span><span className={styles.count}>{definition.workflows.length}</span></summary>
        <ul className={styles.list} lang="en">{definition.workflows.map((workflow) => <li key={workflow.id}><h4>{workflow.name}</h4><p>{workflow.trigger}</p><ol className={styles.workflowSteps}>{workflow.steps.map((step) => <li key={step}>{step}</li>)}</ol><strong className={styles.subheading} lang={lang}>{t.approval}</strong><p>{workflow.approval}</p></li>)}</ul>
      </details>
    </div>
  );
}
