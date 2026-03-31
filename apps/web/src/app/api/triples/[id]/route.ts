import { NextResponse } from "next/server";
import { getTripleDetails } from "@0xintuition/sdk";
import { ensureIntuitionGraphql } from "@/lib/intuition";
import { parseVaultMetrics } from "@/lib/intuition/metrics";
import { atomLabel, mapTripleShape, resolveTripleDeep } from "@/lib/intuition/resolveTerm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TriplePageProps = {
  params: Promise<{ id: string }>;
};

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * GET /api/triples/[id]
 *
 * Returns the Subject-Predicate-Object data for a triple term ID
 * using the Intuition SDK. Resolves nested atoms recursively (max depth 4).
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

    const base = mapTripleShape(details);

    // Resolve nested atoms recursively via batch GraphQL
    const { subjectNested, objectNested } = await resolveTripleDeep(details);

    const subjectLabel = subjectNested
      ? `${subjectNested.subject} · ${subjectNested.predicate} · ${subjectNested.object}`
      : atomLabel(details.subject);
    const objectLabel = objectNested
      ? `${objectNested.subject} · ${objectNested.predicate} · ${objectNested.object}`
      : atomLabel(details.object);

    return NextResponse.json({
      triple: {
        id: base.termId || id,
        subject: subjectLabel,
        predicate: base.predicate,
        object: objectLabel,
        creator: details.creator?.label ?? details.creator_id ?? "Unknown",
        createdAt: details.created_at ?? null,
        marketCap: base.marketCap,
        holders: base.holders,
        shares: base.shares,
        sharePrice: parseVaultMetrics(details.term?.vaults?.[0]).sharePrice,
        counterTermId: base.counterTermId,
        subjectNested,
        objectNested,
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
