import type { LlmChannelDTO, LlmChannelKind } from "@/lib/client-api";

export interface HireModelSelection {
  primary: { channelKind: LlmChannelKind; channelId: string; model: string };
  backup: { channelKind: LlmChannelKind; channelId: string; model: string };
}

/** Default hire routing: custom models first, then system models as fallback. */
export function defaultHireModelSelection(channels: {
  system: LlmChannelDTO[];
  custom: LlmChannelDTO[];
}): HireModelSelection {
  const custom = channels.custom.flatMap((channel) =>
    channel.enabled ? channel.models.map((model) => ({ channelKind: "custom" as const, channelId: channel.id, model })) : [],
  );
  const system = channels.system.flatMap((channel) =>
    channel.available ? channel.models.map((model) => ({ channelKind: "system" as const, channelId: channel.id, model })) : [],
  );
  const primary = custom[0] ?? system[0] ?? { channelKind: "system" as const, channelId: "system-openrouter", model: "" };
  const backup = custom[1] ?? system[custom.length === 0 ? 1 : 0] ?? system[0] ?? primary;
  return { primary, backup };
}
