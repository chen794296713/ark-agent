import type { Metadata, Viewport } from "next";
import {
  Space_Grotesk,
  Instrument_Sans,
  IBM_Plex_Mono,
  Newsreader,
} from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import { DemoPill } from "@/components/DemoPill";

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
  style: ["italic"],
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
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B0D10",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${instrumentSans.variable} ${ibmPlexMono.variable} ${newsreader.variable}`}
    >
      <body>
        <AppProvider>
          {children}
          <DemoPill />
        </AppProvider>
      </body>
    </html>
  );
}
