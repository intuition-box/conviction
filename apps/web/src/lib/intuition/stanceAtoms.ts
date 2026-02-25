/**
 * Stance Atom IDs for Nested Triple Predicates
 *
 * These atoms exist on-chain and represent stance relationships in reply posts.
 *
 * Structure: stance triple = [reply_main_triple | STANCE_ATOM | parent_main_triple]
 *
 * Example:
 * - Main triple: [nuclear | is safer than | coal]
 * - Stance triple: [(nuclear | is safer than | coal) | supports | (some parent triple)]
 */
export const STANCE_ATOMS = {
  SUPPORTS: "0x9d431d249c3d157d56b013cda719a09722c172cb6a43b881cf5b328fff911090",
  REFUTES: "0x87821b7da287d9979753fc03a3efd8d12e82c6e723b26e73da88761aca288190",
  // NUANCES atom exists on-chain (immutable) but is no longer used:
  // "0x359ce6daddb96e018105a37918883b5746039faa806e6241d5533d4f31b658bc"
} as const;

export type StanceAtomKey = keyof typeof STANCE_ATOMS;

/**
 * Maps Stance to on-chain atom ID
 */
export function getStanceAtomId(stance: "SUPPORTS" | "REFUTES"): string {
  return STANCE_ATOMS[stance];
}
