import Image from "next/image";
import { c, font } from "@/lib/theme";

const portraits: Record<string, string> = {
  recruiting: "/images/agents/recruiting.png",
  "job-applicant": "/images/agents/job-applicant.png",
  "video-creator": "/images/agents/video-creator.png",
  "sales-outreach": "/images/agents/sales-outreach.png",
  "email-assistant": "/images/agents/email-assistant.png",
};

/** Custom agents keep their own initials; only catalog identities use portraits. */
export function AgentAvatar({ roleId, name, mono, size = 44 }: { roleId?: string; name?: string; mono?: string; size?: number }) {
  const image = roleId ? portraits[roleId] : undefined;
  const initials = mono || name?.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join("").toUpperCase() || "A";
  return <span aria-hidden="true" style={{ width: size, height: size, flexShrink: 0, display: "inline-grid", placeItems: "center", overflow: "hidden", borderRadius: 8, background: c.limeWash2, color: c.accent, fontFamily: font.space, fontWeight: 600, fontSize: Math.round(size * .36), border: `1px solid ${c.line}` }}>
    {image ? <Image src={image} alt="" width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 20%" }} /> : initials}
  </span>;
}
