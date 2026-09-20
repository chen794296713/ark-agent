import Link from "next/link";
import { c } from "@/lib/theme";

/** The same wordmark used on the public team directory. */
export function Brand({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return <Link href={href} aria-label="ArkAgent" style={{ color: c.text, fontFamily: "var(--font-team), sans-serif", fontSize: compact ? 25 : 31, fontWeight: 700, letterSpacing: "-.04em", lineHeight: 1, textDecoration: "none", flexShrink: 0 }}>ArkAgent</Link>;
}
