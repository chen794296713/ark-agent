/**
 * The messaging channels an agent can be reached on — the single source of
 * truth for the set.
 *
 * Same shape and same reason as `lib/harness/index.ts`: the dependency points
 * SCHEMA -> HERE, so `lib/db/schema.ts` builds its `channelTypeEnum` from
 * `CHANNEL_TYPE_IDS` and a client component can name a channel type without
 * dragging Drizzle and `postgres` into the browser bundle. Before this, the
 * only `ChannelType` in the tree was `(typeof channelTypeEnum.enumValues)[number]`,
 * which is not importable from a client component at all — so the two places
 * that needed one declared their own local copies and drifted.
 *
 * Client-safe: no `server-only`, no database access, no environment reads.
 */

/**
 * Append-only, and in picker order. Postgres can add an enum value but cannot
 * reorder one, so this array's order is a schema fact, not a presentation
 * choice.
 *
 * `web` is the dashboard's own chat and is always present; every agent is
 * linked to it at creation (lib/services/agents.ts). The last three are the
 * China-market channels the OpenClaw Manager already accepts.
 */
export const CHANNEL_TYPE_IDS = [
  "telegram",
  "whatsapp",
  "wechat",
  "line",
  "slack",
  "email",
  "web",
  "feishu",
  "dingtalk",
  "wecom",
] as const;

export type ChannelType = (typeof CHANNEL_TYPE_IDS)[number];

export function isChannelType(value: string): value is ChannelType {
  return (CHANNEL_TYPE_IDS as readonly string[]).includes(value);
}

/**
 * Product names, as each vendor writes them. Not translated — they are proper
 * nouns, and a 日本語 user looking for "Slack" should find "Slack". WeChat keeps
 * its Chinese name alongside the English one because that is how it is branded
 * in its home market, where most of these users are.
 */
export const CHANNEL_LABELS: Record<ChannelType, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  wechat: "WeChat 微信",
  line: "LINE",
  slack: "Slack",
  email: "Email",
  web: "Web",
  feishu: "Feishu 飞书",
  dingtalk: "DingTalk 钉钉",
  wecom: "WeCom 企业微信",
};

/** Display name for a channel id, tolerating a value from an older row. */
export function channelLabel(id: string): string {
  return isChannelType(id) ? CHANNEL_LABELS[id] : id;
}
