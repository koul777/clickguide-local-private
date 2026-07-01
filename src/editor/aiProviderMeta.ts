export const AI_PROVIDER_OPTIONS = [
  {
    id: "openai",
    label: "OpenAI",
    model: "gpt-4.1-mini",
    apiKeyPlaceholder: "OpenAI API key"
  },
  {
    id: "gemini",
    label: "Gemini",
    model: "gemini-1.5-flash",
    apiKeyPlaceholder: "Gemini API key"
  },
  {
    id: "claude",
    label: "Claude",
    model: "claude-3-haiku-20240307",
    apiKeyPlaceholder: "Claude API key"
  }
] as const;

export type AiProvider = (typeof AI_PROVIDER_OPTIONS)[number]["id"];

export type AiProviderMeta = (typeof AI_PROVIDER_OPTIONS)[number];

export function getAiProviderMeta(provider: AiProvider): AiProviderMeta {
  return AI_PROVIDER_OPTIONS.find((option) => option.id === provider) ?? AI_PROVIDER_OPTIONS[0];
}
