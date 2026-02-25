import { NextRequest, NextResponse } from "next/server";
import type { Hex } from "viem";
import { readVaultPair, getCounterVaultId, fetchBatchParticipantCounts, fetchBatchUserDirections } from "@/server/intuition/vaults";
import { getErrorMessage } from "@/lib/getErrorMessage";

const MAX_BATCH = 50;
const HEX_TRIPLE = /^0x[0-9a-fA-F]{64}$/;
const HEX_ADDR = /^0x[0-9a-fA-F]{40}$/i;

type VaultEntry = {
  forAssets: string;
  againstAssets: string;
  forCount: number;
  againstCount: number;
  userDirection?: "support" | "oppose" | null;
};

const ZERO_ENTRY: VaultEntry = { forAssets: "0", againstAssets: "0", forCount: 0, againstCount: 0 };

/**
 * POST /api/vaults/batch
 *
 * Fetches aggregate vault stats for multiple triples in one call.
 * Reads both linear (curveId=1) and progressive (curveId=2) curves.
 * Person counts are deduplicated across curves via GraphQL distinct_on.
 *
 * Body: { tripleIds: string[], address?: string }   — max 50
 * Response: { [tripleId]: { forAssets, againstAssets, forCount, againstCount, userDirection? } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tripleIds: unknown = body?.tripleIds;
    const rawAddress: unknown = body?.address;

    if (!Array.isArray(tripleIds) || tripleIds.length === 0) {
      return NextResponse.json({ error: "tripleIds must be a non-empty array" }, { status: 400 });
    }

    if (tripleIds.length > MAX_BATCH) {
      return NextResponse.json({ error: `Max ${MAX_BATCH} tripleIds per request` }, { status: 400 });
    }

    const validIds = tripleIds.filter(
      (id): id is string => typeof id === "string" && HEX_TRIPLE.test(id),
    );

    if (validIds.length === 0) {
      return NextResponse.json({});
    }

    // Validate optional address
    const userAddress = typeof rawAddress === "string" && HEX_ADDR.test(rawAddress) ? rawAddress : null;

    // Pre-compute counter vault IDs
    const counterIds = validIds.map((id) => getCounterVaultId(id as Hex));

    // ── Run all fetches in parallel ──
    const [vaultResults, gqlCounts, userDirections] = await Promise.all([
      // On-chain: read 4 vaults per triple (FOR/AGAINST × linear/progressive)
      Promise.allSettled(
        validIds.map(async (tripleId, i) => {
          const pair = await readVaultPair(tripleId as Hex, counterIds[i]);
          return {
            tripleId,
            forAssets: pair.for.totalAssets.toString(),
            againstAssets: pair.against.totalAssets.toString(),
            forCountFallback: pair.for.positionCountFallback,
            againstCountFallback: pair.against.positionCountFallback,
          };
        }),
      ),
      // GraphQL: deduplicated person counts (cross-curve unique wallets)
      fetchBatchParticipantCounts(validIds, counterIds),
      // GraphQL: user directions (only if address provided)
      userAddress ? fetchBatchUserDirections(validIds, counterIds, userAddress) : null,
    ]);

    // ── Assemble response ──
    const data: Record<string, VaultEntry> = {};

    for (let i = 0; i < validIds.length; i++) {
      const result = vaultResults[i];

      if (result.status === "fulfilled") {
        const { tripleId, forAssets, againstAssets, forCountFallback, againstCountFallback } = result.value;
        const counts = gqlCounts?.[tripleId];
        data[tripleId] = {
          forAssets,
          againstAssets,
          forCount: counts?.forCount ?? forCountFallback,
          againstCount: counts?.againstCount ?? againstCountFallback,
          userDirection: userDirections?.[tripleId] ?? null,
        };
      } else {
        data[validIds[i]] = ZERO_ENTRY;
      }
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Error in POST /api/vaults/batch:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to fetch vault batch") },
      { status: 500 },
    );
  }
}
