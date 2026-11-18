export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export function getChatCompletionsUrl(baseUrl: string) {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}

export function getAnthropicMessagesUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized.endsWith("/v1") ? `${normalized}/messages` : `${normalized}/v1/messages`;
}

export function getAiProtocol(env: Record<string, string | undefined> = process.env) {
  return env.AI_PROTOCOL?.trim().toLowerCase() === "anthropic" ? "anthropic" : "openai";
}

export function getMissingAiEnv(env: Record<string, string | undefined> = process.env) {
  return ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL"].filter((key) => !env[key]?.trim());
}
