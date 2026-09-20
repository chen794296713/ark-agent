"use client";

import Image from "next/image";
import Link from "next/link";
import { Arrow, TeamShell } from "./TeamShell";
import { agentCatalog } from "@/lib/agent-catalog";
import { marketing } from "@/lib/i18n/marketing";
import { useApp } from "@/lib/store";
import { CURRENCIES, currencyMeta, formatPriceTag, overagePer1k, PLAN_TIERS, planPrice, type Currency } from "@/lib/pricing";
import { planLabel } from "@/lib/agent-display";
import styles from "./landing.module.css";

export function LandingPage() {
  const { lang, currency, setCurrency } = useApp();
  const t = marketing[lang];
  const example = agentCatalog[4].copy[lang];
  return <TeamShell><main id="main-content"><section className={styles.hero} aria-labelledby="hero-title">
    <div className={styles.heroCopy}>
      <h1 id="hero-title">{t.heroTitle.split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
      <p>{t.heroBody}</p>
      <a href="#agents" className={styles.primary}>{t.heroCta}</a>
    </div>
    <p className={styles.illustrationNote}>{t.heroNote}</p>
    <div className={styles.lineup}>{agentCatalog.map((agent) => <Link className={styles.member} key={agent.slug} href={`/agents/${agent.slug}`}><Image src={agent.image} alt="" width={768} height={1152} sizes="(max-width: 900px) 50vw, 20vw" preload /><h2>{agent.copy[lang].name}</h2></Link>)}</div>
  </section>

  <section id="agents" className={styles.directory} aria-labelledby="directory-title">
    <div className={styles.sectionHeading}><h2 id="directory-title">{t.rosterTitle}</h2><p>{t.rosterBody}</p></div>
    <div className={styles.roles}>{agentCatalog.map((agent) => {
      const copy = agent.copy[lang];
      return <article className={styles.role} key={agent.slug}>
        <div><h3><Link href={`/agents/${agent.slug}`}>{copy.name}<Arrow /></Link></h3><p>{copy.summary}</p></div>
        <ul>{copy.tasks.map((task) => <li key={task}>{task}</li>)}</ul>
        <Link className={styles.roleLink} href={`/agents/${agent.slug}`} aria-label={`${t.viewRole}: ${copy.name}`}>{t.viewRole}<Arrow /></Link>
      </article>;
    })}</div>
    <div className={styles.custom}><div><h3>{t.customTitle}</h3><p>{t.customBody}</p></div><Link href="/hire/create">{t.customCta}<Arrow /></Link></div>
  </section>

  <section id="how" className={styles.how} aria-labelledby="how-title"><div className={styles.howInner}>
    <div className={styles.sectionHeading}><h2 id="how-title">{t.howTitle}</h2><p>{t.howBody}</p></div>
    <ol className={styles.steps}>{t.steps.map((step) => <li key={step.title}><h3>{step.title}</h3><p>{step.body}</p></li>)}</ol>
  </div></section>

  <section className={styles.oversight} aria-labelledby="oversight-title">
    <div><h2 id="oversight-title">{t.oversightTitle}</h2><p>{t.oversightBody}</p><ul>{t.oversightItems.map((item) => <li key={item}>{item}</li>)}</ul></div>
    <div className={styles.handoff}><h3>{example.sampleTitle}</h3><ul>{example.sampleLines.map((line) => <li key={line}>{line}</li>)}</ul><p>{t.sampleNote}</p><Link href="/agents/email-assistant">{example.name}<Arrow /></Link></div>
  </section>

  <section id="pricing" className={styles.pricing} aria-labelledby="pricing-title">
    <div className={styles.pricingHeading}><div className={styles.sectionHeading}><h2 id="pricing-title">{t.pricingTitle}</h2><p>{t.pricingBody}</p></div><label>{t.currency}<select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>{CURRENCIES.map((value) => <option value={value} key={value}>{currencyMeta[value].label}</option>)}</select></label></div>
    <div className={styles.plans}>{PLAN_TIERS.map((tier, index) => <article key={tier}>
      <h3>{planLabel(tier)}</h3><p className={styles.planSummary}>{t.plans[index]}</p><p className={styles.amount}>{formatPriceTag(planPrice(tier, currency), currency)}<span>{t.perMonth}</span></p><p className={styles.credits}>{[5000, 25000, 100000][index].toLocaleString(currencyMeta[currency].locale)} {t.monthlyCredits}</p><a href="#agents">{t.heroCta}<Arrow /></a>
    </article>)}</div>
    <p className={styles.pricingNote}>{t.usageNote} {formatPriceTag(overagePer1k("associate", currency), currency)} {t.perCredits} {t.compareNote}</p>
  </section>

  <section className={styles.faq} aria-labelledby="faq-title"><h2 id="faq-title">{t.faqTitle}</h2><div>{t.faqs.map((faq) => <details key={faq.q}><summary>{faq.q}<span aria-hidden="true" className={styles.plus} /></summary><p>{faq.a}</p></details>)}</div></section>
  <section className={styles.closing}><h2>{t.closingTitle}</h2><p>{t.closingBody}</p><a href="#agents" className={styles.primary}>{t.heroCta}<Arrow /></a></section>
  </main></TeamShell>;
}
