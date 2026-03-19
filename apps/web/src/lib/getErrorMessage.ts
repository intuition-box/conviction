/**
 * Safely extract a message string from an unknown caught value.
 * Returns `fallback` when no meaningful message can be extracted.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  return fallback;
}

/* Human readable tsx error */

const USER_REJECT_RE = /user (denied|rejected|refused|cancelled)|rejected the request/i;
const INSUFFICIENT_RE = /insufficient (funds|balance)/i;

export function parseTxError(raw: string): { short: string; isReject: boolean } {
  if (USER_REJECT_RE.test(raw)) {
    return { short: "Transaction rejected", isReject: true };
  }
  if (raw.includes("HasCounterStake")) {
    return { short: "Withdraw opposing position first", isReject: false };
  }
  if (INSUFFICIENT_RE.test(raw)) {
    return { short: "Insufficient funds", isReject: false };
  }
  const firstLine = raw.split("\n")[0].trim();
  const short = firstLine.length > 80 ? firstLine.slice(0, 77) + "..." : firstLine;
  return { short, isReject: false };
}
