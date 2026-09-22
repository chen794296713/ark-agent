import type { Metadata, Viewport } from "next";
import {
  Space_Grotesk,
  Instrument_Sans,
  IBM_Plex_Mono,
  Newsreader,
} from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import { DEFAULT_DIRECTION, DEFAULT_THEME, THEME_COLOR } from "@/lib/theme-init";
import { ThemeBoot } from "@/components/ThemeBoot";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  // "normal" is not optional. `--f-display` for the Ivory Studio direction
  // resolves to `var(--font-serif), Georgia, serif` and every heading it draws
  // is `font-style: normal` — so an italic-only @font-face meant that until
  // now EVERY Ivory heading in the product silently rendered in Georgia.
  // Italic stays because the display face is a serif and emphasis in a serif
  // wants a real italic rather than a synthesised slant.
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ArkAgent — Hire an AI employee, not another app.",
  description:
    "ArkAgent puts a real autonomous agent on a dedicated machine — selling, supporting, recruiting and writing for you around the clock. Brief it like a person; manage it from the apps you already use. arkagent.ai (global) · iagent.cc (中国大陆).",
};

// Ensures the page renders at true device width (not a zoomed-out 980px canvas)
// so the responsive token layer in globals.css can take effect on phones.
//
// themeColor describes the SSR theme, and cannot express the other two: Next's
// ThemeColorDescriptor only keys off prefers-color-scheme, which says nothing
// about a manually chosen data-theme. The tag is rewritten imperatively instead
// — by ThemeBoot before paint, and by setTheme on every switch.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: THEME_COLOR[DEFAULT_DIRECTION][DEFAULT_THEME],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // ThemeBoot corrects these from localStorage before the page paints.
      // Both are required: globals.css matches on the direction+mode PAIR.
      data-direction={DEFAULT_DIRECTION}
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${instrumentSans.variable} ${ibmPlexMono.variable} ${newsreader.variable}`}
    >
      <body>
        <ThemeBoot />
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
