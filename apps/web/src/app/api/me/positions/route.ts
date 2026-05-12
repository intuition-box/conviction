import { NextResponse } from "next/server";

import { prisma } from "@/server/db/prisma";
import { getSessionFromRequest } from "@/server/auth/session";
import { fetchUserPositions, sumPortfolioValue } from "@/lib/intuition/userPositions";
import { formatTrust } from "@/lib/intuition/metrics";

export const dynamic = "force-dynamic";

export type MePositionListItem = {
  termId: string;
  label: string;
  valueTrust: string;
  postId: string | null;
};

export type MePositionsResponse = {
  positions: MePositionListItem[];
  totalValueTrust: string | null;
  hasMore: boolean;
};

async function buildTermToPostMap(
  termIds: string[],
  myUserId: string,
): Promise<Map<string, string>> {
  if (termIds.length === 0) return new Map();

  const myLinks = await prisma.postTripleLink.findMany({
    where: { termId: { in: termIds }, post: { userId: myUserId } },
    select: { termId: true, postId: true },
  });
  const map = new Map<string, string>();
  for (const link of myLinks) {
    if (!map.has(link.termId)) map.set(link.termId, link.postId);
  }

  const missing = termIds.filter((id) => !map.has(id));
  if (missing.length > 0) {
    const otherLinks = await prisma.postTripleLink.findMany({
      where: { termId: { in: missing } },
      select: { termId: true, postId: true },
      orderBy: { post: { createdAt: "asc" } },
    });
    for (const link of otherLinks) {
      if (!map.has(link.termId)) map.set(link.termId, link.postId);
    }
  }

  return map;
}

export async function GET(request: Request): Promise<NextResponse> {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const offset = Number(searchParams.get("offset") ?? 0);
  const limit = Number(searchParams.get("limit") ?? 20);

  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ error: "Invalid offset" }, { status: 400 });
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
    return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
  }

  try {
    const raw = await fetchUserPositions(session.address, {
      offset,
      limit: limit + 1,
    });
    const hasMore = raw.length > limit;
    const slice = hasMore ? raw.slice(0, limit) : raw;

    const termIds = slice.map((p) => p.termId);
    const termToPost = await buildTermToPostMap(termIds, session.userId);

    const positions: MePositionListItem[] = slice.map((p) => ({
      termId: p.termId,
      label: p.label,
      valueTrust: formatTrust(p.valueWei),
      postId: termToPost.get(p.termId) ?? null,
    }));

    // Total is computed only on offset === 0 and cached client-side across pagination.
    const totalValueTrust =
      offset === 0 ? formatTrust(await sumPortfolioValue(session.address)) : null;

    return NextResponse.json({
      positions,
      totalValueTrust,
      hasMore,
    } satisfies MePositionsResponse);
  } catch (err) {
    console.error("[/api/me/positions] failed:", err);
    return NextResponse.json({ error: "positions_unavailable" }, { status: 503 });
  }
}
