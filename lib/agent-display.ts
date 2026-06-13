/**
 * Client-safe display mappers: turn API enum values into labels + Terminal-Lime
 * colors. No server imports, safe to use in client components.
 */
import { c } from "@/lib/theme";

export const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  draft: { label: "DRAFT", color: c.faint },
  provisioning: { label: "PROVISIONING", color: c.amber },
  deploying: { label: "DEPLOYING", color: c.amber },
  working: { label: "WORKING", color: c.green },
  scheduled: { label: "SCHEDULED", color: c.muted },
  needs_review: { label: "NEEDS REVIEW", color: c.amber },
  paused: { label: "PAUSED", color: c.muted },
  error: { label: "ERROR", color: c.red },
  terminated: { label: "TERMINATED", color: c.faint },
};

export function statusDisplay(status: string): { label: string; color: string } {
  return STATUS_DISPLAY[status] ?? { label: status.replace(/_/g, " ").toUpperCase(), color: c.muted };
}

export const ENGINE_LABEL: Record<string, string> = { openclaw: "OpenClaw", hermes: "Hermes" };

export const CHANNEL_LABEL: Record<string, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  wechat: "WeChat",
  line: "LINE",
  slack: "Slack",
  email: "Email",
  web: "Web",
};

export function channelsText(channels: string[]): string {
  return channels
    .filter((t) => t !== "web")
    .map((t) => (CHANNEL_LABEL[t] ?? t))
    .join(" · ");
}

export function tagColor(tag: string): string {
  switch (tag) {
    case "meeting":
    case "resolved":
    case "published":
      return c.green;
    case "review":
    case "escalated":
      return c.amber;
    case "learning":
      return c.accent;
    default:
      return c.muted;
  }
}

export const TASK_SYMBOL: Record<string, { sym: string; color: string }> = {
  done: { sym: "✓", color: c.green },
  in_progress: { sym: "◌", color: c.accent },
  blocked: { sym: "!", color: c.amber },
  queued: { sym: "·", color: c.faint },
};

export function planLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/** "12d 4h" from an ISO start timestamp. */
export function uptimeText(startedAt: string | null): string {
  if (!startedAt) return "—";
  const ms = Date.now() - new Date(startedAt).getTime();
  if (ms < 0) return "0h";
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3600_000);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

/** Relative time like "2 min ago" / "3h ago". */
export function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** "HH:MM" clock label for a feed timestamp. */
export function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
