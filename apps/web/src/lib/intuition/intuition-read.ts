import "server-only";

import { createPublicClient, http, type Address } from "viem";
import { findAtomIds, findTripleIds, getMultiVaultAddressFromChainId } from "@0xintuition/sdk";
import { multiVaultMultiCallIntuitionConfigs } from "@0xintuition/protocol";

import { intuitionTestnet } from "@/lib/chain";
import { ensureIntuitionGraphql } from "@/lib/intuition";
import { makeTripleKey } from "@/lib/format/makeTripleKey";

// ─── readMultivaultConfig ────────────────────────────────────────────────

export async function readMultivaultConfig(): Promise<{
  minDeposit: string;
  tripleCost: string;
  atomCost: string;
}> {
  const publicClient = createPublicClient({
    chain: intuitionTestnet,
    transport: http(),
  });

  const multivaultAddress = getMultiVaultAddressFromChainId(intuitionTestnet.id) as Address;
  const config = await multiVaultMultiCallIntuitionConfigs({
    address: multivaultAddress,
    publicClient,
  });

  return {
    minDeposit: config.min_deposit,
    tripleCost: config.triple_cost,
    atomCost: config.atom_cost,
  };
}

// ─── resolveAtomIds ──────────────────────────────────────────────────────

export async function resolveAtomIds(
  labels: string[],
): Promise<Array<{ data: string; termId: string }>> {
  const deduped = [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
  if (deduped.length === 0) return [];

  ensureIntuitionGraphql();
  const atoms = await findAtomIds(deduped);

  return atoms.map((atom) => ({
    data: atom.data,
    termId: atom.term_id,
  }));
}

// ─── resolveTripleIds ────────────────────────────────────────────────────

export async function resolveTripleIds(
  address: string,
  combinations: Array<[string, string, string]>,
): Promise<Record<string, string | null>> {
  // Deduplicate by canonical key
  const seen = new Map<string, [string, string, string]>();
  for (const combo of combinations) {
    const key = makeTripleKey(combo[0], combo[1], combo[2]);
    if (!seen.has(key)) {
      seen.set(key, combo);
    }
  }

  const deduped = Array.from(seen.values());
  const allKeys = Array.from(seen.keys());

  // Initialize result with null for every requested key
  const result: Record<string, string | null> = {};
  for (const key of allKeys) {
    result[key] = null;
  }

  if (deduped.length === 0) return result;

  ensureIntuitionGraphql();
  const found = await findTripleIds(address as Address, deduped);

  for (const triple of found) {
    if (triple.term_id) {
      const key = makeTripleKey(triple.subject_id, triple.predicate_id, triple.object_id);
      result[key] = triple.term_id;
    }
  }

  return result;
}
