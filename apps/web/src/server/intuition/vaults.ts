import { createPublicClient, http, type Hex } from "viem";
import { getMultiVaultAddressFromChainId, MultiVaultAbi, calculateCounterTripleId } from "@0xintuition/sdk";
import { intuitionTestnet } from "@/lib/chain";
import { ensureIntuitionGraphql, intuitionGraphqlUrl } from "@/lib/intuition";

// getVault returns: [totalAssets, totalShares, currentSharePrice, positionCount]
type VaultTuple = readonly [bigint, bigint, bigint, bigint];

export type VaultSideStats = {
  totalAssets: bigint;
  totalShares: bigint;
  positionCountFallback: number;
};

export function getPublicClient() {
  return createPublicClient({
    chain: intuitionTestnet,
    transport: http(),
  });
}

export function getMultivaultAddress() {
  return getMultiVaultAddressFromChainId(intuitionTestnet.id);
}

export function getCounterVaultId(tripleId: Hex) {
  return calculateCounterTripleId(tripleId);
}

function extractSettled(results: PromiseSettledResult<unknown>[]): (VaultTuple | null)[] {
  return results.map((r) => (r.status === "fulfilled" ? r.value as VaultTuple : null));
}

function sumSide(vaults: (VaultTuple | null)[]): VaultSideStats {
  return {
    totalAssets: vaults.reduce((sum, v) => sum + (v?.[0] ?? 0n), 0n),
    totalShares: vaults.reduce((sum, v) => sum + (v?.[1] ?? 0n), 0n),
    positionCountFallback: vaults.reduce((sum, v) => sum + Number(v?.[3] ?? 0), 0),
  };
}

/** Read FOR + AGAINST vaults (linear + progressive) for a single triple */
export async function readVaultPair(
  tripleId: Hex,
  counterVaultId: Hex,
): Promise<{ for: VaultSideStats; against: VaultSideStats }> {
  const client = getPublicClient();
  const address = getMultivaultAddress();

  const [forL, forP, againstL, againstP] = await Promise.allSettled([
    client.readContract({ address, abi: MultiVaultAbi, functionName: "getVault", args: [tripleId, 1n] }),
    client.readContract({ address, abi: MultiVaultAbi, functionName: "getVault", args: [tripleId, 2n] }),
    client.readContract({ address, abi: MultiVaultAbi, functionName: "getVault", args: [counterVaultId, 1n] }),
    client.readContract({ address, abi: MultiVaultAbi, functionName: "getVault", args: [counterVaultId, 2n] }),
  ]);

  return {
    for: sumSide(extractSettled([forL, forP])),
    against: sumSide(extractSettled([againstL, againstP])),
  };
}

/** Deduplicated participant count via GraphQL (single triple) */
export async function fetchParticipantCounts(
  tripleId: string,
  counterVaultId: string,
  fallback: { forCount: number; againstCount: number },
): Promise<{ forCount: number; againstCount: number }> {
  try {
    ensureIntuitionGraphql();

    const countQuery = `
      query GetUniqueParticipants($termIdFor: String!, $termIdAgainst: String!) {
        forParticipants: positions(
          distinct_on: [account_id]
          where: { vault: { term_id: { _eq: $termIdFor } }, shares: { _gt: "0" } }
        ) { account_id }
        againstParticipants: positions(
          distinct_on: [account_id]
          where: { vault: { term_id: { _eq: $termIdAgainst } }, shares: { _gt: "0" } }
        ) { account_id }
      }
    `;

    const countResponse = await fetch(intuitionGraphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: countQuery,
        variables: { termIdFor: tripleId, termIdAgainst: counterVaultId },
      }),
    });

    if (!countResponse.ok) {
      throw new Error(`GraphQL HTTP ${countResponse.status}`);
    }

    const countData = await countResponse.json();

    if (countData.errors) {
      console.error("GraphQL errors (dedup):", countData.errors);
      throw new Error("GraphQL returned errors");
    }

    if (!countData.data) {
      throw new Error("GraphQL returned no data");
    }

    return {
      forCount: (countData.data.forParticipants as unknown[])?.length ?? 0,
      againstCount: (countData.data.againstParticipants as unknown[])?.length ?? 0,
    };
  } catch {
    return fallback;
  }
}

/** Batch user directions via GraphQL — one query for all triples */
export async function fetchBatchUserDirections(
  tripleIds: string[],
  counterIds: string[],
  userAddress: string,
): Promise<Record<string, "support" | "oppose"> | null> {
  try {
    ensureIntuitionGraphql();

    const allTermIds = [...tripleIds, ...counterIds];
    const accountIds = [...new Set([userAddress, userAddress.toLowerCase()])];

    const query = `
      query GetBatchUserDirections($accountIds: [String!]!, $termIds: [String!]!) {
        userPositions: positions(
          where: { account_id: { _in: $accountIds }, vault: { term_id: { _in: $termIds } }, shares: { _gt: "0" } }
        ) { shares vault { term_id } }
      }
    `;

    const response = await fetch(intuitionGraphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { accountIds, termIds: allTermIds } }),
    });

    if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}`);

    const data = await response.json();
    if (data.errors) throw new Error("GraphQL returned errors");
    if (!data.data) throw new Error("GraphQL returned no data");

    // Build lookup: vault term_id → set of tripleIds it belongs to
    const tripleIdSet = new Set(tripleIds);
    const counterIdSet = new Set(counterIds);
    // Map counterIds back to their original tripleIds
    const counterToTriple: Record<string, string> = {};
    for (let i = 0; i < tripleIds.length; i++) {
      counterToTriple[counterIds[i]] = tripleIds[i];
    }

    const result: Record<string, "support" | "oppose"> = {};
    for (const pos of data.data.userPositions ?? []) {
      const termId = pos.vault?.term_id;
      if (!termId) continue;

      if (tripleIdSet.has(termId)) {
        result[termId] = "support";
      } else if (counterIdSet.has(termId)) {
        const origTripleId = counterToTriple[termId];
        if (origTripleId) result[origTripleId] = "oppose";
      }
    }

    return result;
  } catch {
    return null;
  }
}

/** Deduplicated participant counts via GraphQL (batch) */
export async function fetchBatchParticipantCounts(
  tripleIds: string[],
  counterIds: string[],
): Promise<Record<string, { forCount: number; againstCount: number }> | null> {
  try {
    ensureIntuitionGraphql();

    const fragments = tripleIds.map((id, i) => {
      const counterId = counterIds[i];
      return `
        for_${i}: positions(distinct_on: [account_id], where: { vault: { term_id: { _eq: "${id}" } }, shares: { _gt: "0" } }) { account_id }
        against_${i}: positions(distinct_on: [account_id], where: { vault: { term_id: { _eq: "${counterId}" } }, shares: { _gt: "0" } }) { account_id }
      `;
    }).join("\n");

    const countQuery = `query GetBatchParticipants { ${fragments} }`;

    const countResponse = await fetch(intuitionGraphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: countQuery }),
    });

    if (!countResponse.ok) {
      throw new Error(`GraphQL HTTP ${countResponse.status}`);
    }

    const countData = await countResponse.json();

    if (countData.errors) {
      console.error("GraphQL errors (batch dedup):", countData.errors);
      throw new Error("GraphQL returned errors");
    }

    if (!countData.data) {
      throw new Error("GraphQL returned no data");
    }

    const result: Record<string, { forCount: number; againstCount: number }> = {};
    for (let i = 0; i < tripleIds.length; i++) {
      result[tripleIds[i]] = {
        forCount: (countData.data[`for_${i}`] as unknown[])?.length ?? 0,
        againstCount: (countData.data[`against_${i}`] as unknown[])?.length ?? 0,
      };
    }
    return result;
  } catch {
    return null;
  }
}
