import { NextResponse } from "next/server";

import { prisma } from "@/server/db/prisma";
import { getSessionFromRequest } from "@/server/auth/session";
import { computeThumbvotesForPosts } from "@/lib/intuition/userThumbvotes";
import { getCachedOrCompute } from "@/server/cache/meCache";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60_000;
const POST_CAP = 500;
const TOP_LIMIT = 5;

export type ThemeStat = {
  slug: string;
  name: string;
  postCount: number;
  supportTotal: number | null;
  opposeTotal: number | null;
};

export type EngagementPostSummary = {
  id: string;
  body: string;
  createdAt: string;
  support: number;
  oppose: number;
  replyCount: number;
  score: number;
};

export type MeEngagementResponse = {
  themes: ThemeStat[];
  topPosts: EngagementPostSummary[] | null;
  partial: boolean;
  cappedAt500: boolean;
};

async function computeEngagement(userId: string): Promise<MeEngagementResponse> {
  const publishedWhere = { userId, publishedAt: { not: null } };

  const [publishedCount, rawPosts] = await Promise.all([
    prisma.post.count({ where: publishedWhere }),
    prisma.post.findMany({
      where: publishedWhere,
      orderBy: { createdAt: "desc" },
      take: POST_CAP,
      select: {
        id: true,
        body: true,
        createdAt: true,
        tripleLinks: { select: { termId: true } },
        postThemes: { select: { theme: { select: { slug: true, name: true } } } },
        _count: { select: { replies: true } },
      },
    }),
  ]);

  const cappedAt500 = publishedCount > POST_CAP;

  let thumbvotes: Record<string, { support: number; oppose: number }> | null = null;
  try {
    thumbvotes = await computeThumbvotesForPosts(
      rawPosts.map((p) => ({ id: p.id, termIds: p.tripleLinks.map((l) => l.termId) })),
    );
  } catch (err) {
    console.error("[/api/me/engagement] thumbvote aggregation failed:", err);
  }

  type ThemeAcc = { slug: string; name: string; postCount: number; supportTotal: number; opposeTotal: number };
  const themeMap = new Map<string, ThemeAcc>();
  for (const post of rawPosts) {
    const counts = thumbvotes?.[post.id] ?? { support: 0, oppose: 0 };
    for (const pt of post.postThemes) {
      const slug = pt.theme.slug;
      let acc = themeMap.get(slug);
      if (!acc) {
        acc = { slug, name: pt.theme.name, postCount: 0, supportTotal: 0, opposeTotal: 0 };
        themeMap.set(slug, acc);
      }
      acc.postCount += 1;
      acc.supportTotal += counts.support;
      acc.opposeTotal += counts.oppose;
    }
  }
  const themes: ThemeStat[] = [...themeMap.values()]
    .sort((a, b) => {
      if (b.postCount !== a.postCount) return b.postCount - a.postCount;
      return b.supportTotal + b.opposeTotal - (a.supportTotal + a.opposeTotal);
    })
    .map((t) => ({
      slug: t.slug,
      name: t.name,
      postCount: t.postCount,
      supportTotal: thumbvotes ? t.supportTotal : null,
      opposeTotal: thumbvotes ? t.opposeTotal : null,
    }));

  if (!thumbvotes) {
    return { themes, topPosts: null, partial: true, cappedAt500 };
  }

  const ranked: EngagementPostSummary[] = rawPosts
    .map((p) => {
      const tv = thumbvotes[p.id] ?? { support: 0, oppose: 0 };
      const replyCount = p._count.replies;
      return {
        id: p.id,
        body: p.body,
        createdAt: p.createdAt.toISOString(),
        support: tv.support,
        oppose: tv.oppose,
        replyCount,
        score: tv.support + tv.oppose + replyCount,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.createdAt.localeCompare(a.createdAt);
    });

  return {
    themes,
    topPosts: ranked.slice(0, TOP_LIMIT),
    partial: false,
    cappedAt500,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const data = await getCachedOrCompute(
    `engagement:${session.userId}`,
    CACHE_TTL_MS,
    () => computeEngagement(session.userId),
  );

  return NextResponse.json(data satisfies MeEngagementResponse);
}
