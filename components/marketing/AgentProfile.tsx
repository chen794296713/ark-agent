"use client";

import Image from "next/image";
import Link from "next/link";
import { TeamShell } from "@/components/marketing/TeamShell";
import { PackageTeaser } from "@/components/agent-packages/PackageTeaser";
import { agentCatalog, agentHireHref, type AgentCatalogEntry } from "@/lib/agent-catalog";
import { marketing } from "@/lib/i18n/marketing";
import { formatMoney, planPrice } from "@/lib/pricing";
import { useApp } from "@/lib/store";
import styles from "./agent-profile.module.css";

function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={back ? { transform: "rotate(180deg)" } : undefined}
    >
      <path d="M4 12h15M13 5l7 7-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AgentProfile({ agent }: { agent: AgentCatalogEntry }) {
  const { lang, currency } = useApp();
  const copy = agent.copy[lang];
  const t = marketing[lang];
  const hireHref = agentHireHref(agent.slug);
  const otherAgents = agentCatalog.filter(({ slug }) => slug !== agent.slug);

  return (
    <TeamShell>
      <main id="main-content" className={styles.page}>
        <Link href="/#agents" className={styles.backLink}>
          <Arrow back />
          {t.allAgents}
        </Link>

        <section className={styles.hero} aria-labelledby="agent-name">
          <figure className={styles.portrait}>
            <div className={styles.portraitImage}>
              <Image
                src={agent.image}
                alt=""
                fill
                sizes="(max-width: 720px) calc(100vw - 40px), (max-width: 1240px) 42vw, 480px"
                preload
              />
            </div>
            <figcaption>{t.portraitNote}</figcaption>
          </figure>
          <div className={styles.introduction}>
            <h1 id="agent-name">{copy.name}</h1>
            <p className={styles.headline}>{copy.headline}</p>
            <p className={styles.description}>{copy.description}</p>
            <div className={styles.hiring}>
              <p className={styles.price}>
                <span>{t.from}</span>{" "}
                <strong>{formatMoney(planPrice("associate", currency), currency)}</strong>{" "}
                <span>{t.perMonth}</span>
              </p>
              <div className={styles.actions}>
                <Link href={hireHref} className={styles.primaryLink}>
                  {t.hireRole}
                  <Arrow />
                </Link>
                <Link href="/#pricing" className={styles.textLink}>{t.seePricing}</Link>
              </div>
              <p className={styles.hiringNote}>{t.included}</p>
            </div>
          </div>
        </section>

        <PackageTeaser packageId={agent.slug} />

        <div className={styles.work}>
          <section aria-labelledby="responsibilities">
            <h2 id="responsibilities">{t.responsibilities}</h2>
            <ul className={styles.workList}>
              {copy.tasks.map((task) => <li key={task}>{task}</li>)}
            </ul>
          </section>
          <section aria-labelledby="deliverables">
            <h2 id="deliverables">{t.outputs}</h2>
            <ul className={styles.workList}>
              {copy.deliverables.map((deliverable) => <li key={deliverable}>{deliverable}</li>)}
            </ul>
          </section>
        </div>

        <section className={styles.brief} aria-labelledby="starting-brief">
          <div className={styles.briefIntro}>
            <h2 id="starting-brief">{t.roleBrief}</h2>
            <p>{t.roleIntro}</p>
          </div>
          <div className={styles.briefCopy}>
            <p>{copy.instructions}</p>
            <Link href={hireHref} className={styles.textLink}>
              {t.editBrief}
              <Arrow />
            </Link>
          </div>
        </section>

        <div className={styles.details}>
          <section className={styles.sample} aria-labelledby="example-handoff">
            <h2 id="example-handoff">{t.sample}</h2>
            <div className={styles.sampleSheet}>
              <h3>{copy.sampleTitle}</h3>
              <ul>
                {copy.sampleLines.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
            <p className={styles.sampleNote}>{t.sampleNote}</p>
          </section>
          <section className={styles.boundaries} aria-labelledby="working-boundaries">
            <h2 id="working-boundaries">{t.tools}</h2>
            <p className={styles.toolNote}>{copy.toolNote}</p>
            <p>{copy.rules}</p>
          </section>
        </div>

        <section className={styles.related} aria-labelledby="related-agents">
          <div className={styles.relatedHeading}>
            <h2 id="related-agents">{t.related}</h2>
            <Link href="/#agents" className={styles.textLink}>{t.allAgents}<Arrow /></Link>
          </div>
          <div className={styles.relatedList}>
            {otherAgents.map((related) => (
              <Link className={styles.relatedAgent} href={`/agents/${related.slug}`} key={related.slug}>
                <div className={styles.relatedPortrait}>
                  <Image
                    src={related.image}
                    alt=""
                    fill
                    sizes="(max-width: 720px) calc(50vw - 28px), (max-width: 1240px) 22vw, 270px"
                  />
                </div>
                <h3>{related.copy[lang].name}<Arrow /></h3>
                <p>{related.copy[lang].summary}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </TeamShell>
  );
}
