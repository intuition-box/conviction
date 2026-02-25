import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { requireEnv } from "./env.js";

let cached: ReturnType<typeof createOpenAICompatible> | null = null;

export function getGroq() {
  if (cached) return cached;

  const apiKey = requireEnv("GROQ_API_KEY");

  cached = createOpenAICompatible({
    name: "groq",
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  return cached;
}
