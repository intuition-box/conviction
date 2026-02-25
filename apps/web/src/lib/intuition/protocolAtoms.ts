// Structure: stance triple = [reply_main_triple | STANCE_ATOM | parent_main_triple]
//
// Example:
// - Main triple: [nuclear | is safer than | coal]
// - Stance triple: [(nuclear | is safer than | coal) | supports | (some parent triple)]

export const STANCE_ATOMS = {
  SUPPORTS: "0x9d431d249c3d157d56b013cda719a09722c172cb6a43b881cf5b328fff911090",
  REFUTES: "0x87821b7da287d9979753fc03a3efd8d12e82c6e723b26e73da88761aca288190",
} as const;

export type StanceAtomKey = keyof typeof STANCE_ATOMS;

/**
 * Maps Stance to on-chain atom ID
 */
export function getStanceAtomId(stance: "SUPPORTS" | "REFUTES"): string {
  return STANCE_ATOMS[stance];
}

// ─── Tag Atoms ───────────────────────────────────────────────────────────────
//
// Structure: tag triple = [main_triple | HAS_TAG | theme_atom]
//
// Used to tag root posts' main triples with their theme on-chain.

export const HAS_TAG_ATOM_ID = "0x7ec36d201c842dc787b45cb5bb753bea4cf849be3908fb1b0a7d067c3c3cc1f5";
