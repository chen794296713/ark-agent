/** Consistent 1.6px navigation icons; text labels carry the meaning. */
export function WorkspaceIcon({ name, size = 19 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    agents: <><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v3"/></>,
    templates: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
    skills: <><path d="m14 3-3 7H5l5 4-2 7 7-8h5l-6-3z"/></>,
    "llm-channels": <><path d="M8 4h8M9 4v4l-4 7a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 15l-4-7V4"/><path d="M7 15h10M9 12h6"/></>,
    billing: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM9 7h6M9 11h6M9 15h3"/></>,
    payment: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></>,
    account: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></>,
    admin: <><path d="m12 3 8 3v5c0 5-8 10-8 10S4 16 4 11V6zM9 11l2 2 4-4"/></>,
    directions: <><circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4z"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    logout: <><path d="M10 4H4v16h6M9 12h12m-4-4 4 4-4 4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>{paths[name] ?? paths.agents}</svg>;
}
