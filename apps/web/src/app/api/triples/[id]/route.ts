import { NextResponse } from "next/server";
import { getTripleDetails } from "@0xintuition/sdk";
import { formatEther } from "viem";
import { ensureIntuitionGraphql } from "@/lib/intuition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TriplePageProps = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/triples/[id]
 *
 * Returns the Subject-Predicate-Object data for a triple term ID
 * using the Intuition SDK.
 */
export async function GET(request: Request, { params }: TriplePageProps) {
  const { id } = await params;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Triple ID is required." }, { status: 400 });
  }

  try {
    ensureIntuitionGraphql();
    const details = await getTripleDetails(id);

    if (!details) {
      return NextResponse.json({ error: "Triple not found." }, { status: 404 });
    }

    const vault = details.term?.vaults?.[0];
    const holders = vault?.allPositions?.aggregate?.count ?? null;

    // total_shares and current_share_price are in wei (18 decimals).
    // Convert to human-readable before multiplying to avoid 10^36 overflow.
    const totalSharesHuman = vault?.total_shares
      ? Number(formatEther(BigInt(vault.total_shares)))
      : null;
    const sharePriceHuman = vault?.current_share_price
      ? Number(formatEther(BigInt(vault.current_share_price)))
      : null;
    const marketCap =
      totalSharesHuman && sharePriceHuman ? totalSharesHuman * sharePriceHuman : null;

    return NextResponse.json({
      triple: {
        id: details.term_id ?? id,
        subject: details.subject?.label ?? details.subject?.data ?? "Unknown",
        predicate: details.predicate?.label ?? details.predicate?.data ?? "Unknown",
        object: details.object?.label ?? details.object?.data ?? "Unknown",
        creator: details.creator?.label ?? details.creator_id ?? "Unknown",
        createdAt: details.created_at ?? null,
        marketCap,
        holders,
        shares: totalSharesHuman,
        sharePrice: sharePriceHuman,
        counterTermId: details.counter_term_id ?? null,
      },
    });
  } catch (error: unknown) {
    console.error("Failed to fetch triple details:", error);
    return NextResponse.json(
      { error: "Failed to fetch triple data from Intuition." },
      { status: 502 },
    );
  }
}
