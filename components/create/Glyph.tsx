/** One small stroke system for controls and generation states. */
export function Glyph({ symbol, size = 16 }: { symbol: string; size?: number }) {
  let drawing;
  switch (symbol) {
    case "✓": drawing = <path d="m5 12 4 4L19 6" />; break;
    case "✕": drawing = <path d="m7 7 10 10M7 17 17 7" />; break;
    case "▾": drawing = <path d="m6 9 6 6 6-6" />; break;
    case "▸": drawing = <path d="m9 6 6 6-6 6" />; break;
    case "↑": drawing = <path d="M12 19V5m-6 6 6-6 6 6" />; break;
    case "↓": drawing = <path d="M12 5v14m-6-6 6 6 6-6" />; break;
    case "✎": drawing = <><path d="m4 16-1 5 5-1L20 8l-4-4L4 16Z" /><path d="m13 7 4 4" /></>; break;
    case "⚠": drawing = <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5" /><circle cx="12" cy="17" r=".5" fill="currentColor" /></>; break;
    case "◐": drawing = <><circle cx="12" cy="12" r="8" opacity=".35" /><path d="M12 4a8 8 0 0 1 8 8" /></>; break;
    default: drawing = <circle cx="12" cy="12" r="2" />;
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>{drawing}</svg>;
}
