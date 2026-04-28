const STANCE_ATOMS = {
  SUPPORTS: "0x9d431d249c3d157d56b013cda719a09722c172cb6a43b881cf5b328fff911090",
  REFUTES: "0x87821b7da287d9979753fc03a3efd8d12e82c6e723b26e73da88761aca288190",
} as const;

export function getStanceAtomId(stance: "SUPPORTS" | "REFUTES"): string {
  return STANCE_ATOMS[stance];
}

export const HAS_TAG_ATOM_ID = "0x7ec36d201c842dc787b45cb5bb753bea4cf849be3908fb1b0a7d067c3c3cc1f5";
