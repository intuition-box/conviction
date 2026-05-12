import { NextResponse } from "next/server";

import { prisma } from "@/server/db/prisma";
import { getSessionFromRequest } from "@/server/auth/session";
import { computeThumbvotesForPosts } from "@/lib/intuition/userThumbvotes";
import { getCachedOrCompute } from "@/server/cache/meCache";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60_000;

export type MeSummaryResponse = {
  postsTotal: number;
  supportsReceived: number | null;
  refutesReceived: number | null;
};

async function computeSummary(userId: string): Promise<MeSummaryResponse> {
  const [postsTotal, myLinks] = await Promise.all([
    prisma.post.count({ where: { userId } }),
    prisma.postTripleLink.findMany({
      where: { post: { userId } },
      select: { termId: true },
    }),
  ]);

  const myTermIds = Array.from(new Set(myLinks.map((l) => l.termId)));

  let supportsReceived: number | null = null;
  let refutesReceived: number | null = null;
  try {
    const results = await computeThumbvotesForPosts([{ id: "me", termIds: myTermIds }]);
    const counts = results["me"] ?? { support: 0, oppose: 0 };
    supportsReceived = counts.support;
    refutesReceived = counts.oppose;
  } catch (err) {
    console.error("[/api/me/summary] thumbvote aggregation failed:", err);
  }

  return { postsTotal, supportsReceived, refutesReceived };
}

export async function GET(request: Request): Promise<NextResponse> {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const data = await getCachedOrCompute(
    `summary:${session.userId}`,
    CACHE_TTL_MS,
    () => computeSummary(session.userId),
  );

  return NextResponse.json(data satisfies MeSummaryResponse);
}
