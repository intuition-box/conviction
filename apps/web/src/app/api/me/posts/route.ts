import { NextResponse } from "next/server";

import { prisma } from "@/server/db/prisma";
import { getSessionFromRequest } from "@/server/auth/session";
import { computeThumbvotesForPosts, type ThumbvoteCounts } from "@/lib/intuition/userThumbvotes";

export const dynamic = "force-dynamic";

type Filter = "all" | "root" | "replies";

export type MePostListItem = {
  id: string;
  body: string;
  createdAt: string;
  parent: { id: string; body: string } | null;
  user: { displayName: string | null; address: string; avatar: string | null };
  stance: "SUPPORTS" | "REFUTES" | null;
  mainTripleTermIds: string[];
  replyCount: number;
  thumbvotes: ThumbvoteCounts | null;
};

export type MePostsResponse = {
  posts: MePostListItem[];
  hasMore: boolean;
};

export async function GET(request: Request): Promise<NextResponse> {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const offset = Number(searchParams.get("offset") ?? 0);
  const limit = Number(searchParams.get("limit") ?? 20);
  const filterRaw = searchParams.get("filter") ?? "all";

  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json({ error: "Invalid offset" }, { status: 400 });
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
    return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
  }
  if (filterRaw !== "all" && filterRaw !== "root" && filterRaw !== "replies") {
    return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  }
  const filter = filterRaw as Filter;

  const parentFilter =
    filter === "root" ? { parentPostId: null } :
    filter === "replies" ? { parentPostId: { not: null } } :
    {};

  const raw = await prisma.post.findMany({
    where: { userId: session.userId, ...parentFilter },
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit + 1,
    select: {
      id: true,
      body: true,
      createdAt: true,
      stance: true,
      user: { select: { displayName: true, address: true, avatar: true } },
      parent: { select: { id: true, body: true } },
      tripleLinks: { select: { termId: true, role: true } },
      _count: { select: { replies: true } },
    },
  });

  const hasMore = raw.length > limit;
  const slice = hasMore ? raw.slice(0, limit) : raw;

  // If the Intuition batch throws, thumbvotes degrade to null per post (frontend renders "—").
  let thumbvoteMap: Record<string, ThumbvoteCounts | null> = {};
  try {
    thumbvoteMap = await computeThumbvotesForPosts(
      slice.map((p) => ({ id: p.id, termIds: p.tripleLinks.map((l) => l.termId) })),
    );
  } catch (err) {
    console.error("[/api/me/posts] thumbvote hydration failed:", err);
    thumbvoteMap = Object.fromEntries(slice.map((p) => [p.id, null]));
  }

  const posts: MePostListItem[] = slice.map((p) => ({
    id: p.id,
    body: p.body,
    createdAt: p.createdAt.toISOString(),
    parent: p.parent,
    user: p.user,
    stance: p.stance,
    mainTripleTermIds: p.tripleLinks.filter((l) => l.role === "MAIN").map((l) => l.termId),
    replyCount: p._count.replies,
    thumbvotes: thumbvoteMap[p.id] ?? null,
  }));

  return NextResponse.json({ posts, hasMore } satisfies MePostsResponse);
}
