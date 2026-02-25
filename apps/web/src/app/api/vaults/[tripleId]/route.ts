import { NextRequest, NextResponse } from "next/server";
import type { Hex } from "viem";
import { getSessionFromRequest } from "@/server/auth/session";
import { readVaultPair, getCounterVaultId, fetchParticipantCounts } from "@/server/intuition/vaults";
import { ensureIntuitionGraphql, intuitionGraphqlUrl } from "@/lib/intuition";
import { getErrorMessage } from "@/lib/getErrorMessage";

const HEX_TRIPLE = /^0x[0-9a-fA-F]{64}$/;
const HEX_ADDR = /^0x[0-9a-fA-F]{40}$/i;

/**
 * GET /api/vaults/[tripleId]
 *
 * Fetches vault information for a given triple, including:
 * - Total assets deposited (summed across linear + progressive curves)
 * - Total shares issued (summed across curves)
 * - Position count (deduplicated wallets via GraphQL)
 * - User's position (if authenticated)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripleId: string }> }
) {
  try {
    const { tripleId } = await params;

    if (!tripleId || !HEX_TRIPLE.test(tripleId)) {
      return NextResponse.json(
        { error: "Invalid tripleId format" },
        { status: 400 }
      );
    }

    const counterVaultId = getCounterVaultId(tripleId as Hex);

    // Read 4 vaults: FOR×(linear,progressive) + AGAINST×(linear,progressive)
    const vaultPair = await readVaultPair(tripleId as Hex, counterVaultId);

    // Deduplicated person count via GraphQL (cross-curve unique wallets)
    const { forCount, againstCount } = await fetchParticipantCounts(
      tripleId,
      counterVaultId,
      { forCount: vaultPair.for.positionCountFallback, againstCount: vaultPair.against.positionCountFallback },
    );

    // Get user position if authenticated
    let userPosition = null;
    // Priority: valid query param (active wallet) > session cookie (may be stale) > null
    // Don't force lowercase — indexer format unknown; query both forms via _in
    const rawAddress = request.nextUrl.searchParams.get("address") ?? null;
    const addressFromQuery = rawAddress && HEX_ADDR.test(rawAddress) ? rawAddress : null;
    const session = getSessionFromRequest(request);
    const userAddress = addressFromQuery ?? session?.address ?? null;

    if (userAddress) {
      // Query both original and lowercase to handle case mismatch with indexer
      const accountIds = [...new Set([userAddress, userAddress.toLowerCase()])];

      try {
        ensureIntuitionGraphql();

        const query = `
          query GetUserPositions($accountIds: [String!]!, $termIdFor: String!, $termIdAgainst: String!) {
            forPositions: positions(
              where: { account_id: { _in: $accountIds }, vault: { term_id: { _eq: $termIdFor } }, shares: { _gt: "0" } }
            ) { shares vault { curve_id } }
            againstPositions: positions(
              where: { account_id: { _in: $accountIds }, vault: { term_id: { _eq: $termIdAgainst } }, shares: { _gt: "0" } }
            ) { shares vault { curve_id } }
          }
        `;

        const response = await fetch(intuitionGraphqlUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            variables: {
              accountIds,
              termIdFor: tripleId,
              termIdAgainst: counterVaultId,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`GraphQL HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.errors) {
          console.error("GraphQL errors (user positions):", data.errors);
          throw new Error("GraphQL returned errors");
        }

        if (!data.data) {
          throw new Error("GraphQL returned no data (user positions)");
        }

        const d = data.data;
        let forLinear = 0n, forProgressive = 0n;
        let againstLinear = 0n, againstProgressive = 0n;

        for (const p of d.forPositions ?? []) {
          const shares = BigInt(p.shares ?? "0");
          if (shares === 0n) continue;
          const cid = String(p.vault?.curve_id);
          if (cid === "1") forLinear += shares;
          else if (cid === "2") forProgressive += shares;
          else console.warn("Unknown curve_id", p.vault?.curve_id);
        }
        for (const p of d.againstPositions ?? []) {
          const shares = BigInt(p.shares ?? "0");
          if (shares === 0n) continue;
          const cid = String(p.vault?.curve_id);
          if (cid === "1") againstLinear += shares;
          else if (cid === "2") againstProgressive += shares;
          else console.warn("Unknown curve_id", p.vault?.curve_id);
        }

        const sharesFor = forLinear + forProgressive;
        const sharesAgainst = againstLinear + againstProgressive;

        if (sharesFor > 0n || sharesAgainst > 0n) {
          userPosition = {
            sharesFor: sharesFor.toString(),
            sharesAgainst: sharesAgainst.toString(),
            direction: sharesFor > sharesAgainst ? "FOR" : sharesAgainst > sharesFor ? "AGAINST" : null,
            forLinear: forLinear.toString(),
            forProgressive: forProgressive.toString(),
            againstLinear: againstLinear.toString(),
            againstProgressive: againstProgressive.toString(),
          };
        }
      } catch (error) {
        console.error("Error fetching user position:", error);
        // Continue without user position
      }
    }

    return NextResponse.json({
      tripleId,
      counterVaultId,
      vault: {
        for: {
          totalAssets: vaultPair.for.totalAssets.toString(),
          totalShares: vaultPair.for.totalShares.toString(),
          currentSharePrice: "0",
          positionCount: forCount,
        },
        against: {
          totalAssets: vaultPair.against.totalAssets.toString(),
          totalShares: vaultPair.against.totalShares.toString(),
          currentSharePrice: "0",
          positionCount: againstCount,
        },
      },
      userPosition,
    });
  } catch (error: unknown) {
    console.error("Error in GET /api/vaults/[tripleId]:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to fetch vault information") },
      { status: 500 }
    );
  }
}
