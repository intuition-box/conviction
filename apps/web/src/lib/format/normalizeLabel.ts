/**
 * Normalize a label for on-chain lookup (findAtomIds) and creation (toHex).
 *
 * This is the CHAIN normalization: trim + collapse whitespace.
 * It does NOT lowercase or apply NFKC — those are reserved for the
 * fingerprint normalization in packages/core/src/stableKey.ts (normalizeKeyPart).
 */
export function normalizeLabelForChain(text: string | undefined | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}
