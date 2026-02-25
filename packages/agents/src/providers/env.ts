export function requireEnv(key: string): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const v = env[key];
  if (!v || !String(v).trim()) {
    throw new Error(`[agents] Missing env var: ${key}`);
  }
  return String(v).trim();
}

export function getGroqModelName() {
  return requireEnv("GROQ_MODEL");
}
