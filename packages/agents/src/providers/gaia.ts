import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { requireEnv } from "./env.js";

const normalize = (u: string) => (u.endsWith("/") ? u.slice(0, -1) : u);

function toBaseV1(url: string) {
  const u = normalize(url);
  return u.endsWith("/v1") ? u : `${u}/v1`;
}

let cached: ReturnType<typeof createOpenAICompatible> | null = null;

export function getGaia() {
  if (cached) return cached;

  const nodeUrl = requireEnv("GAIANET_NODE_URL");
  const apiKey = requireEnv("GAIANET_API_KEY");

  cached = createOpenAICompatible({
    name: "gaia",
    baseURL: toBaseV1(nodeUrl),
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  return cached;
}

export function getGaiaModelName() {
  return requireEnv("GAIANET_MODEL");
}
