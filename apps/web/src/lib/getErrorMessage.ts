/**
 * Safely extract a message string from an unknown caught value.
 * Returns `fallback` when no meaningful message can be extracted.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  return fallback;
}
