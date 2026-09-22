import type { CSSProperties } from "react";

/**
 * ArkAgent design tokens.
 * Ported verbatim from the Claude Design prototype (ArkAgent.dc.html) so the
 * implementation stays pixel-true to the source. Every screen imports from here
 * rather than hard-coding hex values.
 *
 * The values behind these names change with <html data-direction data-theme>:
 * three brand directions (Terminal Lime, Ivory Studio, Midnight Console) times
 * two modes. `c.lime` therefore is not literally lime outside Terminal — it is
 * "the direction's signal fill". The names are kept for continuity with the
 * design source rather than renamed per direction.
 */

export const c = {
  // surfaces
  bg: "var(--c-bg)", // page background (NOT the ink for a lime fill — use `ink`)
  panel: "var(--c-panel)", // raised panel
  panelDeep: "var(--c-panel-deep)", // recessed input wells inside panels
  hover: "var(--c-hover)", // card hover background
  glass: "var(--c-glass)", // translucent nav / drawer / pill background

  // hairlines / borders
  line: "var(--c-line)", // structural hairline (grid gaps, dividers)
  lineSoft: "var(--c-line-soft)", // faint row divider in lists/feeds
  border: "var(--c-border)", // default control/card border
  borderStrong: "var(--c-border-strong)", // secondary button / stronger border
  borderMute: "var(--c-border-mute)", // hover border for muted controls
  /**
   * The boundary of an interactive control — an input, a select, a checkbox —
   * where the border is the ONLY thing indicating that a control is there.
   * WCAG 1.4.11 wants 3:1 for that, which `border` (a decorative hairline at
   * ~1.3:1) does not provide and should not be raised to: it also draws card
   * edges and dividers, where 3:1 would look like a wireframe.
   */
  borderField: "var(--c-border-field)",

  // lime accent
  lime: "var(--c-lime)", // bright lime FILL (use dark `ink` for text on it)
  limeHover: "var(--c-lime-hover)",
  accent: "var(--c-accent)", // lime as TEXT/icon/thin line (deepens in light/warm)
  limeWash: "var(--c-lime-wash)", // selected/active lime-tinted background
  limeWash2: "var(--c-lime-wash2)", // hover over a lime-tinted card
  limeBorder: "var(--c-lime-border)", // border around lime-tinted surfaces

  // text ramp
  ink: "var(--c-ink)", // text/icon on a lime fill
  onBrand: "var(--c-on-brand)", // ink on a FIXED fill (roleHue) — never inverts
  greenInk: "var(--c-green-ink)", // ink on the c.green fill (flips per theme)
  text: "var(--c-text)",
  text2: "var(--c-text2)",
  muted: "var(--c-muted)",
  faint: "var(--c-faint)",

  // status
  green: "var(--c-green)",
  greenWash: "var(--c-green-wash)",
  greenBorder: "var(--c-green-border)",
  amber: "var(--c-amber)",
  orange: "var(--c-orange)", // burnt orange as TEXT (roleHue.salesmkt is the FILL)
  red: "var(--c-red)",
  redWash: "var(--c-red-wash)",
  redBorder: "var(--c-red-border)",
  blue: "var(--c-blue)",

  // brand / third-party
  stripe: "var(--c-stripe)",
  stripeHover: "var(--c-stripe-hover)",
  alipay: "var(--c-alipay)",
  navSelected: "var(--c-nav-selected)", // selected sidebar nav row

  // effects
  shadow: "var(--c-shadow)", // drop-shadow COLOR (each site keeps its own blur)
  scrim: "var(--c-scrim)", // dimmed page behind a drawer / modal

  // directions screen — fixed palette sketches (NOT theme-switched; these
  // illustrate three distinct design directions and keep their own colors).
  dirBg: "#E9EAEC",
  dirLime: "#D8FF3E", // lime on the fixed dirInk chip — not theme-switched

  dirInk: "#1A1D22",
  dirMuted: "#6B7280",
  ivory: "#F6F2EA",
  ivoryInk: "#1C1A16",
  midnight: "#0A0F1E",
  midnightBlue: "#4F7CFF",
} as const;

/** Per-role accent hue, keyed by role id. */
export const roleHue: Record<string, string> = {
  prospector: "#D8FF3E",
  salesmkt: "#E8804F",
  admin: "#F472B6",
  hr: "#4FD1C5",
  support: "#6AA6FF",
  legal: "#94A3B8",
  content: "#A78BFA",
  opc: "#FBBF24",
};

/**
 * Font stacks. The CSS variables are wired by next/font in app/layout.tsx; the
 * literal fallbacks keep things sane if a variable ever fails to load.
 */
export const font = {
  /**
   * The display face. Resolves through --f-display, which each palette in
   * app/globals.css sets for its direction: Terminal and Midnight speak in
   * Space Grotesk, Ivory Studio in Newsreader. Every heading reads this, so
   * switching direction changes the voice as well as the colour.
   */
  space: "var(--f-display), 'Space Grotesk', sans-serif",
  sans: "var(--font-sans), 'Instrument Sans', sans-serif",
  mono: "var(--font-mono), 'IBM Plex Mono', monospace",
  serif: "var(--font-serif), 'Newsreader', serif",
} as const;

/** The faint 52px engineering grid used on the hero and the auth panel.
 *  Line color is themed via --c-grid, which each palette mixes from its own
 *  ink so the texture warms or cools with the page. */
export const gridBg = {
  backgroundImage:
    "linear-gradient(var(--c-grid) 1px, transparent 1px), linear-gradient(90deg, var(--c-grid) 1px, transparent 1px)",
  backgroundSize: "52px 52px",
} as const;

/**
 * Responsive layout tokens. Each value is a CSS custom property defined in
 * app/globals.css whose value re-resolves per breakpoint (desktop default →
 * tablet → mobile). Use these in inline `style` objects instead of hardcoding
 * desktop numbers, e.g. `gridTemplateColumns: r.col4` or `padding: \`${r.contentPy} ${r.pagePx}\``.
 * Because the adaptation lives entirely in CSS, there is no SSR/hydration cost.
 */
export const r = {
  // page padding / vertical rhythm
  pagePx: "var(--r-page-px)",
  pagePxWide: "var(--r-page-px-wide)",
  sectionPy: "var(--r-section-py)",
  heroPy: "var(--r-hero-py)",
  contentPy: "var(--r-content-py)",

  // reusable grid templates
  col1: "var(--r-col-1)",
  col2: "var(--r-col-2)",
  col3: "var(--r-col-3)",
  col4: "var(--r-col-4)",
  split: "var(--r-split)",
  hero: "var(--r-hero)",
  checkout: "var(--r-checkout)",
  overview: "var(--r-overview)",
  billing: "var(--r-billing)",
  detailPerf: "var(--r-detail-perf)",
  detailSettings: "var(--r-detail-settings)",
  footer: "var(--r-footer)",

  // gaps
  gapLg: "var(--r-gap-lg)",
  gapMd: "var(--r-gap-md)",
  gapSm: "var(--r-gap-sm)",

  // fixed-panel grid templates / widths / heights
  hireGrid: "var(--r-hire-grid)",
  dashGrid: "var(--r-dash-grid)",
  formW: "var(--r-form-w)",
  chatH: "var(--r-chat-h)",
  dirCardH: "var(--r-dir-card-h)",

  // nav show/hide toggles + sidebar positioning.
  // `position`/`flexWrap`/`overflowX` are strict CSS enums in TS (no string
  // fallback), so those tokens are cast to the exact property type to keep
  // every call site assignment-clean.
  desktopNav: "var(--r-desktop-nav)",
  mobileNav: "var(--r-mobile-nav)",
  sidebarPos: "var(--r-sidebar-pos)" as CSSProperties["position"],
  authHero: "var(--r-auth-hero)",

  // demo pill
  pillWrap: "var(--r-pill-wrap)" as CSSProperties["flexWrap"],
  pillOverflow: "var(--r-pill-overflow)" as CSSProperties["overflowX"],
  pillPad: "var(--r-pill-pad)",
  pillFs: "var(--r-pill-fs)",

  // border radius
  radiusSm: "var(--r-radius-sm)",
  radiusMd: "var(--r-radius-md)",
  radiusLg: "var(--r-radius-lg)",
} as const;
