import { MODELS } from "@/lib/agent-settings";

export interface LlmModelSelection {
  channelId: string;
  model: string;
}

export interface LlmChannelDTO {
  id: string;
  name: string;
  kind: "custom" | "system";
  baseUrl: string;
  apiKey: string;
  models: string[];
  configured: boolean;
  createdAt: string | null;
}

export const SYSTEM_OPENROUTER_CHANNEL_ID = "system:openrouter";

export function systemLlmChannels(): LlmChannelDTO[] {
  const configured = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const configuredModel = process.env.LLM_MODEL?.trim();
  const models = Array.from(
    new Set([
      ...(configuredModel ? [configuredModel.replace(/^openrouter\//, "")] : []),
      ...MODELS.filter((model) => model.id !== "auto").map((model) =>
        model.id.replace(/^openrouter\//, ""),
      ),
    ]),
  );

  return [
    {
      id: SYSTEM_OPENROUTER_CHANNEL_ID,
      name: "OpenRouter",
      kind: "system",
      baseUrl: process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1",
      apiKey: configured ? "••••••••" : "",
      models,
      configured,
      createdAt: null,
    },
  ];
}

