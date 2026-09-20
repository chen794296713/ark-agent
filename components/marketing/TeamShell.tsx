"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useApp } from "@/lib/store";
import { LANGS } from "@/lib/i18n";
import { marketing } from "@/lib/i18n/marketing";
import { landing } from "@/lib/i18n/landing";
import type { Lang } from "@/lib/types";
import styles from "./team-shell.module.css";

export function Arrow({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function TeamShell({ children, footer = true }: { children: ReactNode; footer?: boolean }) {
  const { lang, setLang, user } = useApp();
  const t = marketing[lang];
  const accountHref = user ? "/dashboard" : "/auth";
  const accountLabel = user ? t.account : t.signIn;
  return <div className={styles.shell}>
    <a className={styles.skip} href="#main-content">{t.skip}</a>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="ArkAgent">ArkAgent</Link>
      <nav className={styles.desktopNav} aria-label={t.menu}>
        <Link href="/#agents">{t.agents}</Link>
        <Link href="/#how">{t.how}</Link>
        <Link href="/#pricing">{t.pricing}</Link>
        <Link href={accountHref} className={styles.account}>{accountLabel}</Link>
      </nav>
      <details className={styles.mobileNav}>
        <summary>{t.menu}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h16M4 16h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></summary>
        <nav aria-label={t.menu} onClick={(event) => { if ((event.target as HTMLElement).closest("a")) event.currentTarget.closest("details")?.removeAttribute("open"); }}>
          <Link href="/#agents">{t.agents}</Link><Link href="/#how">{t.how}</Link><Link href="/#pricing">{t.pricing}</Link><Link href={accountHref}>{accountLabel}</Link>
          <label>{t.language}<select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
        </nav>
      </details>
    </header>
    {children}
    {footer ? <footer className={styles.footer}>
      <div className={styles.footerTop}><div><Link className={styles.brand} href="/">ArkAgent</Link><p>{t.footerLine}</p></div><nav aria-label={t.menu}><Link href="/#agents">{t.agents}</Link><Link href="/#how">{t.how}</Link><Link href="/#pricing">{t.pricing}</Link><Link href={accountHref}>{accountLabel}</Link></nav><label className={styles.language}>{t.language}<select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label></div>
      <div className={styles.footerBottom}><span>{landing[lang].footCopyright}</span><div><a href="https://arkagent.ai">arkagent.ai</a><a href="https://iagent.cc">iagent.cc</a></div></div>
    </footer> : null}
  </div>;
}
