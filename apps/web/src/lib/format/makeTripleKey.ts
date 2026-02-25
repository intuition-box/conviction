/**
 * Canonical key for a triple from its 3 atom IDs.
 * Used both server-side (in resolve-triples route) and client-side (in useTripleResolution).
 * Guarantees zero divergence on the byKey contract.
 */
export function makeTripleKey(s: string, p: string, o: string): string {
  return `${s}-${p}-${o}`;
}
